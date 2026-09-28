<?php

namespace App\Jobs;

use App\Models\Video;
use App\Models\VideoProcessingJob;
use App\Services\Video\ProcessingEventStream;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Transcode an uploaded video into an HLS adaptive-bitrate ladder.
 *
 * This replaces the progressive-MP4 rendition ladder. The reason is startup
 * latency: a progressive MP4 makes the player fetch a large file and hope the
 * moov atom is at the front, and a bad guess on quality is locked in for the
 * whole playback. HLS hands the player a small text manifest, lets it start on
 * a low rendition within one segment, and lets it climb as bandwidth allows.
 * That is the difference between "video starts instantly" and "video spins",
 * which is the entire feel of a short-video feed.
 *
 * Layout in the bucket:
 *
 *   hls/{videoId}/master.m3u8          - the ladder the player is given
 *   hls/{videoId}/{height}p/index.m3u8 - per-rendition playlist
 *   hls/{videoId}/{height}p/seg_00000.ts
 *
 * Everything lives under `hls/`, which is NOT a signed prefix. That is
 * deliberate and it is a real trade-off, so it is worth stating plainly: HLS
 * playlists reference their segments by relative path, and a signed URL scheme
 * cannot express "and every segment under this directory too" without either
 * baking soon-to-expire tokens into a static playlist or relying on cookies
 * that React Native players do not reliably send. Feed video is public content
 * - the same posture as thumbnails, which have always been unsigned - so it is
 * served unsigned and cached hard at the edge. The raw uploads under
 * videos/original/ stay signed; they are never handed to a client.
 *
 * A takedown therefore needs the objects deleted, not just the row hidden -
 * see deleteHlsAssets, which VideoService and the admin delete paths call.
 */
class TranscodeVideoToHls implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    /**
     * Must stay BELOW the queue worker's own --timeout (see the pm2 transcoding
     * process). The worker kills its child at that deadline regardless of what
     * a job asks for, and a kill lands mid-FFmpeg or mid-upload, leaving a
     * half-built ladder that the retry then rebuilds from scratch. Failing the
     * job just under the worker's limit means Laravel records a real failure
     * instead of a silent SIGKILL.
     */
    public int $timeout = 3500;
    public int $tries   = 2;

    /**
     * One transcode per video at a time.
     *
     * Without this, a worker restart releases an in-flight job back to the
     * queue and a second worker picks it up while the first is still running -
     * two FFmpeg ladders for the same video, competing for CPU and racing each
     * other's segment uploads. Observed in practice during deploy; the end
     * state was fine because both wrote identical keys, but it doubles the cost
     * of every restart and at scale that is the difference between a queue that
     * drains and one that does not.
     */
    public int $uniqueFor = 3600;

    public function uniqueId(): string
    {
        return 'hls-video-' . $this->video->id;
    }

    /**
     * The ladder, lowest first.
     *
     * Lowest-first matters: players start on the FIRST variant in the master
     * playlist before they have measured bandwidth, so leading with 240p makes
     * the first segment tiny and playback start almost immediately. Leading
     * with 1080p is the single easiest way to make a fast connection feel slow.
     *
     * Bitrates are the H.264 web ladder - conservative on purpose, because
     * every kbit here is bandwidth billed on egress and buffering on the far
     * end of a mobile connection.
     */
    private const LADDER = [
        ['height' => 240,  'vbitrate' => 450,  'abitrate' => 48,  'maxrate' => 482,  'bufsize' => 700],
        ['height' => 360,  'vbitrate' => 800,  'abitrate' => 64,  'maxrate' => 856,  'bufsize' => 1200],
        ['height' => 540,  'vbitrate' => 1400, 'abitrate' => 96,  'maxrate' => 1498, 'bufsize' => 2100],
        ['height' => 720,  'vbitrate' => 2800, 'abitrate' => 128, 'maxrate' => 2996, 'bufsize' => 4200],
        ['height' => 1080, 'vbitrate' => 5000, 'abitrate' => 192, 'maxrate' => 5350, 'bufsize' => 7500],
    ];

    /** 2s keeps feed startup fast; longer segments compress better but delay first frame. */
    private const SEGMENT_SECONDS = 2;

    // Absolute paths prevent PATH-manipulation attacks in queue worker environments.
    private const FFMPEG_BIN  = '/usr/bin/ffmpeg';
    private const FFPROBE_BIN = '/usr/bin/ffprobe';

    public function __construct(public Video $video) {}

    public function handle(): void
    {
        $video = $this->video->fresh();
        if (! $video) {
            return; // deleted while queued
        }

        if (! Str::startsWith($video->mime_type ?? '', 'video/')) {
            return; // photos and carousels have no ladder
        }

        if (! $this->ffmpegAvailable()) {
            Log::warning('TranscodeVideoToHls: ffmpeg missing', ['video_id' => $video->id]);
            $video->update(['hls_status' => 'unavailable']);
            return;
        }

        $disk      = config('filesystems.default', 'local');
        $objectKey = $video->video_url;

        if (empty($objectKey)) {
            Log::warning('TranscodeVideoToHls: no source key', ['video_id' => $video->id]);
            return;
        }

        $video->update(['hls_status' => 'processing']);

        $ext    = strtolower(pathinfo($objectKey, PATHINFO_EXTENSION)) ?: 'mp4';
        $tmpDir = sys_get_temp_dir() . '/rsoo_hls_' . $video->id . '_' . Str::random(8);
        $outDir = $tmpDir . '/out';

        @mkdir($outDir, 0755, true);
        $srcPath = $tmpDir . '/src.' . $ext;

        try {
            if (! $this->download($disk, $objectKey, $srcPath)) {
                // Throw, don't return: a download failure here is a B2 network
                // hiccup or a transient read error far more often than a
                // permanently missing object (readStream() only returns false
                // on the read itself failing, not on a validated-at-upload-time
                // key not existing). Returning normally told Laravel the job
                // SUCCEEDED, so $tries=2 never got a second attempt and every
                // transient hiccup permanently stranded the video on mp4.
                throw new \RuntimeException("source unreadable: {$objectKey}");
            }

            $srcHeight = $this->probeHeight($srcPath);
            $hasAudio  = $this->probeHasAudio($srcPath);

            // Never upscale. A 480p phone upload transcoded to a 1080p variant
            // costs four times the bandwidth to deliver exactly the same
            // detail, and the player will happily pick it on a fast connection.
            $tiers = array_values(array_filter(
                self::LADDER,
                fn (array $t) => $srcHeight <= 0 || $t['height'] <= $srcHeight,
            ));

            // A source shorter than the smallest rung still deserves one
            // rendition, otherwise a 240p upload gets no HLS at all.
            if ($tiers === []) {
                $tiers = [self::LADDER[0]];
            }

            $prefix          = "hls/{$video->id}";
            $masterKey       = "{$prefix}/master.m3u8";
            $masterLocalPath = $outDir . '/master.m3u8';
            $uploaded        = 0;

            $variants = [];
            foreach ($tiers as $tier) {
                $name    = $tier['height'] . 'p';
                $varDir  = $outDir . '/' . $name;
                @mkdir($varDir, 0755, true);

                if (! $this->transcodeVariant($srcPath, $varDir, $tier, $hasAudio)) {
                    Log::warning('TranscodeVideoToHls: variant failed', [
                        'video_id' => $video->id,
                        'variant'  => $name,
                    ]);
                    continue;
                }

                $variants[] = [
                    'name'      => $name,
                    'height'    => $tier['height'],
                    'bandwidth' => ($tier['vbitrate'] + $tier['abitrate']) * 1000,
                    'width'     => $this->probeWidth($varDir . '/index.m3u8', $srcPath, $tier['height']),
                ];

                // Publish what exists so far, lowest rung first (LADDER is
                // ordered lowest-first). This is what lets a fresh upload
                // start real HLS playback the moment the FIRST rendition
                // lands instead of sitting on the progressive-MP4 fallback
                // (VideoResource::hls_url) for the entire ladder - every
                // rung through 1080p. Re-uploading the growing master.m3u8
                // on every iteration is a few hundred bytes each time; see
                // HlsPlaylistController's own comment on why that is cheap.
                //
                // hls_status deliberately stays 'processing' here, not
                // 'ready' - BackfillVideoHls filters on
                // hls_status != 'ready' to find rows that still need a
                // ladder, and a partial one still needs the rest of this
                // loop to run.
                $this->writeMasterPlaylist($masterLocalPath, $variants);
                $uploaded += $this->uploadTree($disk, $varDir, "{$prefix}/{$name}");
                $this->uploadFile($disk, $masterLocalPath, $masterKey);
                $uploaded++;

                if (empty($video->hls_master_key)) {
                    $video->update(['hls_master_key' => $masterKey]);
                }
            }

            if ($variants === []) {
                // Same reasoning as the download failure above: throw so the
                // one configured retry actually happens. A genuinely corrupt
                // source fails identically both times and lands on 'failed'
                // either way (via the catch block below); a transient
                // ffmpeg/resource-pressure failure - three workers sharing a
                // CPU-bound box - gets the second chance it needs.
                throw new \RuntimeException("every HLS variant failed for video {$video->id}");
            }

            $video->update([
                'hls_status'   => 'ready',
                'hls_ready_at' => now(),
            ]);

            Log::info('TranscodeVideoToHls: ready', [
                'video_id' => $video->id,
                'variants' => array_column($variants, 'name'),
                'objects'  => $uploaded,
                'master'   => $masterKey,
            ]);
            $this->reportFallbackCompletion($video, success: true);
        } catch (\Throwable $e) {
            Log::error('TranscodeVideoToHls: failed', [
                'video_id' => $video->id,
                'error'    => $e->getMessage(),
            ]);
            $video->update(['hls_status' => 'failed']);
            $this->reportFallbackCompletion($video, success: false, error: $e->getMessage());
            throw $e;
        } finally {
            $this->rmdir($tmpDir);
        }
    }

    /**
     * Additive-only hook for the api.video-primary/ffmpeg-fallback pipeline
     * (see VideoProcessingService::fallbackToFFmpeg). This job's own
     * encoding logic above is completely unaware of and unmodified by that
     * pipeline - it runs exactly the same whether dispatched directly
     * (api.video disabled) or as a fallback. This just keeps
     * video_processing_jobs authoritative for BOTH cases: a no-op when no
     * such row exists (the normal disabled-flag path, the overwhelming
     * majority of calls to this job), and a real update only when this run
     * genuinely IS a fallback attempt for a video_processing_jobs row that's
     * still waiting on one.
     */
    private function reportFallbackCompletion(Video $video, bool $success, ?string $error = null): void
    {
        $job = VideoProcessingJob::query()
            ->where('video_id', $video->id)
            ->where('provider', 'ffmpeg')
            ->where('status', 'processing')
            ->latest('id')
            ->first();

        if (!$job) {
            return;
        }

        $job->update($success
            ? ['status' => 'completed', 'fallback_completed_at' => now()]
            : ['status' => 'failed', 'failed_at' => now(), 'error_code' => 'fallback_failed', 'error_message' => $error]);

        // Not routed through VideoProcessingService::markFailed()/the
        // primary-success path - this job intentionally stays free of a
        // dependency on that service (it runs identically whether or not
        // the orchestrated pipeline is even enabled). Pushing the matching
        // ClickHouse events directly here keeps that independence while
        // still keeping the pipeline's own analytics complete.
        ProcessingEventStream::push([
            'type' => $success ? 'video_transcoding_fallback_success' : 'video_transcoding_failed',
            'video_id' => $video->id,
            'user_id' => $video->user_id,
            'provider' => 'ffmpeg',
            'attempt' => $job->attempt,
            'duration_ms' => $job->fallback_started_at ? (int) $job->fallback_started_at->diffInMilliseconds(now()) : 0,
            'error_code' => $success ? '' : 'fallback_failed',
        ]);

        if ($success) {
            ProcessingEventStream::push([
                'type' => 'video_ready',
                'video_id' => $video->id,
                'user_id' => $video->user_id,
                'provider' => 'ffmpeg',
                'attempt' => $job->attempt,
            ]);
        }
    }

    /**
     * Delete every HLS object for a video.
     *
     * Static so takedown paths can call it without constructing the job. The
     * segments are served unsigned, so hiding the database row is not enough -
     * anyone holding a playlist URL would keep streaming a removed video until
     * the edge cache expired.
     */
    public static function deleteHlsAssets(int $videoId): void
    {
        $disk   = config('filesystems.default', 'local');
        $prefix = "hls/{$videoId}";

        try {
            $files = Storage::disk($disk)->allFiles($prefix);
            if ($files !== []) {
                Storage::disk($disk)->delete($files);
            }
        } catch (\Throwable $e) {
            Log::warning('TranscodeVideoToHls: could not delete HLS assets', [
                'video_id' => $videoId,
                'error'    => $e->getMessage(),
            ]);
        }
    }

    // ── internals ────────────────────────────────────────────────────────────

    private function download(string $disk, string $key, string $dest): bool
    {
        // Streamed to disk rather than read into a string: a 500 MB upload
        // through file_get_contents is 500 MB of PHP memory per queue worker,
        // and three transcoding workers doing that at once takes the box down.
        $in = Storage::disk($disk)->readStream($key);
        if (! $in) {
            Log::warning('TranscodeVideoToHls: source unreadable', ['key' => $key]);
            return false;
        }

        $out = fopen($dest, 'wb');
        if (! $out) {
            if (is_resource($in)) fclose($in);
            return false;
        }

        stream_copy_to_stream($in, $out);
        fclose($out);
        if (is_resource($in)) fclose($in);

        return file_exists($dest) && filesize($dest) > 1024;
    }

    private function ffmpegAvailable(): bool
    {
        return is_executable(self::FFMPEG_BIN) && is_executable(self::FFPROBE_BIN);
    }

    private function probeHeight(string $path): int
    {
        $out = trim((string) shell_exec(sprintf(
            '%s -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 %s 2>/dev/null',
            self::FFPROBE_BIN,
            escapeshellarg($path),
        )));
        return is_numeric($out) ? (int) $out : 0;
    }

    private function probeHasAudio(string $path): bool
    {
        // A muted upload has no audio stream at all, and mapping a:0 on such a
        // file makes ffmpeg exit non-zero rather than silently skip it.
        $out = trim((string) shell_exec(sprintf(
            '%s -v error -select_streams a -show_entries stream=index -of csv=p=0 %s 2>/dev/null',
            self::FFPROBE_BIN,
            escapeshellarg($path),
        )));
        return $out !== '';
    }

    /** RESOLUTION in the master playlist wants a width; derive it from the source aspect. */
    private function probeWidth(string $_playlist, string $srcPath, int $height): int
    {
        $out = trim((string) shell_exec(sprintf(
            '%s -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0:s=x %s 2>/dev/null',
            self::FFPROBE_BIN,
            escapeshellarg($srcPath),
        )));

        [$w, $h] = array_pad(explode('x', $out), 2, null);
        if (! is_numeric($w) || ! is_numeric($h) || (int) $h === 0) {
            return 0;
        }

        // Round to an even number - odd widths are invalid for H.264 chroma.
        $width = (int) round(((int) $w / (int) $h) * $height);
        return $width % 2 === 0 ? $width : $width + 1;
    }

    private function transcodeVariant(string $src, string $varDir, array $tier, bool $hasAudio): bool
    {
        $audioArgs = $hasAudio
            ? sprintf('-c:a aac -b:a %dk -ac 2', $tier['abitrate'])
            : '-an';

        // -g / -keyint_min pin the GOP to the segment length so every segment
        // starts on a keyframe. Without it segments open mid-GOP, and a player
        // switching rendition mid-stream shows a visible glitch or stalls
        // outright - the classic "ABR switching looks broken" bug.
        $gop = self::SEGMENT_SECONDS * 30;

        $cmd = sprintf(
            '%s -y -hide_banner -loglevel error -i %s ' .
            '-vf %s ' .
            '-c:v libx264 -profile:v main -preset veryfast -crf 21 ' .
            '-b:v %dk -maxrate %dk -bufsize %dk ' .
            '-g %d -keyint_min %d -sc_threshold 0 ' .
            '%s ' .
            '-f hls -hls_time %d -hls_playlist_type vod -hls_list_size 0 ' .
            '-hls_segment_filename %s %s 2>&1',
            self::FFMPEG_BIN,
            escapeshellarg($src),
            escapeshellarg("scale=-2:{$tier['height']}"),
            $tier['vbitrate'],
            $tier['maxrate'],
            $tier['bufsize'],
            $gop,
            $gop,
            $audioArgs,
            self::SEGMENT_SECONDS,
            escapeshellarg($varDir . '/seg_%05d.ts'),
            escapeshellarg($varDir . '/index.m3u8'),
        );

        $output = shell_exec($cmd);
        $ok     = file_exists($varDir . '/index.m3u8') && filesize($varDir . '/index.m3u8') > 0;

        if (! $ok && $output) {
            Log::warning('TranscodeVideoToHls: ffmpeg output', [
                'height' => $tier['height'],
                'output' => Str::limit(trim($output), 500),
            ]);
        }

        return $ok;
    }

    /** @param list<array{name:string,height:int,bandwidth:int,width:int}> $variants */
    private function writeMasterPlaylist(string $path, array $variants): void
    {
        $lines = ['#EXTM3U', '#EXT-X-VERSION:3'];

        foreach ($variants as $v) {
            $attrs = "BANDWIDTH={$v['bandwidth']}";
            if ($v['width'] > 0) {
                $attrs .= ",RESOLUTION={$v['width']}x{$v['height']}";
            }
            $lines[] = "#EXT-X-STREAM-INF:{$attrs}";
            // Relative, so the playlist is portable across hostnames - it keeps
            // working the day media.reelsoo.com becomes cdn.reelsoo.com, with
            // no rewrite of objects already in the bucket.
            $lines[] = "{$v['name']}/index.m3u8";
        }

        file_put_contents($path, implode("\n", $lines) . "\n");
    }

    /** Upload the whole output tree, returning the object count. */
    private function uploadTree(string $disk, string $localDir, string $prefix): int
    {
        $count = 0;

        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($localDir, \FilesystemIterator::SKIP_DOTS),
        );

        foreach ($it as $file) {
            /** @var \SplFileInfo $file */
            if (! $file->isFile()) {
                continue;
            }

            $rel = str_replace('\\', '/', substr($file->getPathname(), strlen($localDir) + 1));
            $key = "{$prefix}/{$rel}";

            $stream = fopen($file->getPathname(), 'rb');
            if (! $stream) {
                continue;
            }

            // Content-Type has to be explicit. Guessed from the extension a .ts
            // becomes video/mp2t only sometimes and .m3u8 almost never, and a
            // playlist served as application/octet-stream is one that iOS
            // refuses to play with no useful error.
            Storage::disk($disk)->put($key, $stream, [
                'ContentType'  => $this->contentTypeFor($rel),
                'CacheControl' => $this->cacheControlFor($rel),
            ]);

            if (is_resource($stream)) {
                fclose($stream);
            }
            $count++;
        }

        return $count;
    }

    /**
     * Upload one file - the master playlist, re-published after every
     * variant so it always reflects whatever has landed so far. uploadTree()
     * walks a whole directory and would re-upload every already-uploaded
     * variant on each pass; this is the single-file counterpart used for the
     * one file (master.m3u8) that lives outside any variant's own directory.
     */
    private function uploadFile(string $disk, string $localPath, string $key): void
    {
        $stream = fopen($localPath, 'rb');
        if (! $stream) {
            return;
        }

        Storage::disk($disk)->put($key, $stream, [
            'ContentType'  => $this->contentTypeFor($key),
            'CacheControl' => $this->cacheControlFor($key),
        ]);

        if (is_resource($stream)) {
            fclose($stream);
        }
    }

    private function contentTypeFor(string $rel): string
    {
        return match (strtolower(pathinfo($rel, PATHINFO_EXTENSION))) {
            'm3u8'  => 'application/vnd.apple.mpegurl',
            'ts'    => 'video/mp2t',
            default => 'application/octet-stream',
        };
    }

    private function cacheControlFor(string $rel): string
    {
        // Segments are immutable: their path contains the video id and the
        // segment index, and a re-transcode replaces the whole directory. Cache
        // them for a year.
        //
        // Playlists get a short TTL instead, because they are the kill switch.
        // A takedown deletes the objects, and once the playlist 404s playback
        // stops everywhere within minutes - which cannot be true if the
        // playlist itself is cached for a year at every edge.
        return str_ends_with(strtolower($rel), '.m3u8')
            ? 'public, max-age=300, s-maxage=300'
            : 'public, max-age=31536000, s-maxage=31536000, immutable';
    }

    private function rmdir(string $dir): void
    {
        if (! is_dir($dir)) {
            return;
        }
        foreach (glob($dir . '/*') ?: [] as $f) {
            is_dir($f) ? $this->rmdir($f) : @unlink($f);
        }
        @rmdir($dir);
    }
}
