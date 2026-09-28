<?php

namespace App\Jobs\Video;

use App\Models\Video;
use App\Models\VideoProcessingJob;
use App\Services\Video\ProcessingEventStream;
use App\Services\Video\VideoProcessingService;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldBeUnique;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * The fallback transfer-worker api.video's own docs make necessary: they
 * have no documented "export the full HLS ladder to S3/B2" feature (their
 * official backup tool only pulls back one normalized MP4 - see the
 * module-level report), so this walks api.video's own master + variant HLS
 * playlists itself, re-hosts every segment in B2, and rewrites the
 * playlists to match.
 *
 * The output is made to look BYTE-FOR-BYTE like what TranscodeVideoToHls
 * already produces locally - same key layout (hls/{videoId}/{height}p/
 * seg_NNNNN.ts, hls/{videoId}/master.m3u8), same playlist shape, same
 * hls_master_key/hls_status/hls_ready_at columns. That is deliberate: every
 * downstream consumer (HlsPlaylistController, PublicMediaMirrorService,
 * VideoResource, both players) already works off those columns and cannot
 * tell the two pipelines apart. Nothing downstream of "the ladder is in B2"
 * needed to change for this integration to exist.
 *
 * Runs on its OWN queue (video-transfer, see ecosystem.worker.config.js) -
 * never the local-ffmpeg `transcoding` queue, so neither competes with the
 * other for worker capacity.
 */
class TransferEncodedOutputToB2 implements ShouldQueue, ShouldBeUnique
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 1800;
    public int $tries = 3;
    public int $uniqueFor = 1800;

    public function __construct(
        public readonly int $videoId,
        public readonly int $jobId,
    ) {
    }

    public function uniqueId(): string
    {
        return 'video-transfer-' . $this->videoId;
    }

    public function handle(VideoProcessingService $processing): void
    {
        $video = Video::query()->find($this->videoId);
        $job = VideoProcessingJob::query()->find($this->jobId);

        if (!$video || !$job) {
            // Deleted while queued - mirrors TranscodeVideoToHls's own guard
            // (see that job's handle()). Nothing to transfer or clean up on
            // our side; the video row itself is already gone.
            return;
        }

        if (!$video->provider_job_id) {
            Log::warning('video_transfer.no_provider_job_id', ['video_id' => $video->id]);
            return;
        }

        $providerJobId = $video->provider_job_id;
        $disk = config('filesystems.default', 'local');
        $tmpDir = sys_get_temp_dir() . '/rsoo_transfer_' . $video->id . '_' . Str::random(8);
        $outDir = $tmpDir . '/out';
        @mkdir($outDir, 0755, true);

        try {
            $assets = $processing->provider()->getAssetUrls($providerJobId);
            $masterUrl = $assets['hls'] ?? null;

            if (!$masterUrl) {
                throw new \RuntimeException("provider {$providerJobId} has no hls asset yet");
            }

            $masterText = $this->fetchText($masterUrl);
            $remoteVariants = $this->parseMasterPlaylist($masterText, $masterUrl);

            if ($remoteVariants === []) {
                throw new \RuntimeException('master playlist had no usable variants');
            }

            $prefix = "hls/{$video->id}";
            $masterKey = "{$prefix}/master.m3u8";
            $masterLocalPath = $outDir . '/master.m3u8';
            $uploaded = 0;
            $localVariants = [];

            foreach ($remoteVariants as $rv) {
                if ($rv['height'] <= 0) {
                    // Can't name a variant directory without a height -
                    // HlsPlaylistController validates variant names against
                    // /^\d{3,4}p$/, so a variant we can't confidently name
                    // this way would be unreachable through it anyway.
                    Log::warning('video_transfer.variant_no_height', [
                        'video_id' => $video->id,
                        'url' => $rv['url'],
                    ]);
                    continue;
                }

                $name = "{$rv['height']}p";
                $varDir = $outDir . '/' . $name;
                @mkdir($varDir, 0755, true);

                $variantText = $this->fetchText($rv['url']);
                $segments = $this->parseVariantPlaylist($variantText, $rv['url']);

                if ($segments === []) {
                    Log::warning('video_transfer.variant_no_segments', [
                        'video_id' => $video->id,
                        'variant' => $name,
                    ]);
                    continue;
                }

                $localSegments = [];
                foreach ($segments as $i => $seg) {
                    $segName = sprintf('seg_%05d.ts', $i);
                    $segPath = $varDir . '/' . $segName;

                    if (!$this->downloadStreaming($seg['url'], $segPath)) {
                        throw new \RuntimeException("segment download failed: {$seg['url']}");
                    }

                    $localSegments[] = ['name' => $segName, 'duration' => $seg['duration']];
                }

                $this->writeVariantPlaylist($varDir . '/index.m3u8', $localSegments);

                $localVariants[] = [
                    'name' => $name,
                    'height' => $rv['height'],
                    'bandwidth' => $rv['bandwidth'],
                    'width' => $rv['width'],
                ];

                // Same incremental-publish shape TranscodeVideoToHls already
                // uses - see that job's own comment on why hls_status stays
                // 'processing' mid-loop and the master is re-written after
                // every variant.
                $this->writeMasterPlaylist($masterLocalPath, $localVariants);
                $uploaded += $this->uploadTree($disk, $varDir, "{$prefix}/{$name}");
                $this->uploadFile($disk, $masterLocalPath, $masterKey);
                $uploaded++;

                if (empty($video->hls_master_key)) {
                    $video->update(['hls_master_key' => $masterKey]);
                }
            }

            if ($localVariants === []) {
                throw new \RuntimeException("every variant failed to transfer for video {$video->id}");
            }

            // Verify before declaring ready: the master object genuinely
            // exists in B2 and is non-empty - the same bar
            // completeUpload()'s own B2-object check already holds uploads
            // to, applied here to the output side instead of the input side.
            if (!Storage::disk($disk)->exists($masterKey) || Storage::disk($disk)->size($masterKey) === 0) {
                throw new \RuntimeException('master playlist missing or empty in B2 after upload');
            }

            $video->update([
                'hls_status' => 'ready',
                'hls_ready_at' => now(),
            ]);

            $job->update([
                'status' => VideoProcessingJob::STATUS_COMPLETED,
                'completed_at' => now(),
            ]);

            Log::info('video_transfer.ready', [
                'video_id' => $video->id,
                'variants' => array_column($localVariants, 'name'),
                'objects' => $uploaded,
            ]);

            ProcessingEventStream::push([
                'type' => 'video_ready',
                'video_id' => $video->id,
                'user_id' => $video->user_id,
                'provider' => 'apivideo',
                'attempt' => $job->attempt,
            ]);

            // Stop api.video from continuing to host/bill for this video now
            // that B2 holds a verified copy - the whole point of this worker.
            // Best-effort: deleteRemoteAsset() itself only logs on failure,
            // never throws, so a delete hiccup does not undo the successful
            // transfer above.
            $processing->provider()->deleteRemoteAsset($providerJobId);
        } catch (\Throwable $e) {
            Log::error('video_transfer.failed', [
                'video_id' => $video->id,
                'job_id' => $job->id,
                'error' => $e->getMessage(),
            ]);
            $processing->markFailed($job->fresh() ?? $job, 'transfer_failed', $e->getMessage());
            throw $e;
        } finally {
            $this->rmdir($tmpDir);
        }
    }

    // ── HLS reassembly ──────────────────────────────────────────────────────

    /** @return list<array{bandwidth:int,width:int,height:int,url:string}> */
    private function parseMasterPlaylist(string $text, string $baseUrl): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($text));
        $variants = [];
        $pending = null;

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            if (str_starts_with($line, '#EXT-X-STREAM-INF:')) {
                $attrs = substr($line, strlen('#EXT-X-STREAM-INF:'));
                $bandwidth = (int) ($this->matchAttr($attrs, 'BANDWIDTH') ?? 0);
                $resolution = $this->matchAttr($attrs, 'RESOLUTION');
                [$width, $height] = $resolution ? array_pad(explode('x', $resolution), 2, 0) : [0, 0];
                $pending = ['bandwidth' => $bandwidth, 'width' => (int) $width, 'height' => (int) $height];
                continue;
            }

            if ($line[0] !== '#' && $pending !== null) {
                $variants[] = $pending + ['url' => $this->resolveUrl($baseUrl, $line)];
                $pending = null;
            }
        }

        return $variants;
    }

    /** @return list<array{duration:float,url:string}> */
    private function parseVariantPlaylist(string $text, string $baseUrl): array
    {
        $lines = preg_split('/\r\n|\r|\n/', trim($text));
        $segments = [];
        $duration = null;

        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }

            if (str_starts_with($line, '#EXTINF:')) {
                $duration = (float) trim(explode(',', substr($line, strlen('#EXTINF:')))[0]);
                continue;
            }

            if ($line[0] !== '#') {
                $segments[] = ['duration' => $duration ?? 2.0, 'url' => $this->resolveUrl($baseUrl, $line)];
                $duration = null;
            }
        }

        return $segments;
    }

    private function matchAttr(string $attrs, string $name): ?string
    {
        // Values may or may not be quoted (BANDWIDTH=123 vs RESOLUTION=1280x720,
        // both unquoted; a future attribute could be quoted) - handles both.
        if (preg_match('/' . preg_quote($name, '/') . '=("([^"]*)"|[^,]*)/', $attrs, $m)) {
            return $m[2] ?? trim($m[1], '"');
        }
        return null;
    }

    private function resolveUrl(string $base, string $ref): string
    {
        if (preg_match('#^https?://#i', $ref)) {
            return $ref;
        }

        $parts = parse_url($base);
        $scheme = $parts['scheme'] ?? 'https';
        $host = $parts['host'] ?? '';
        $basePath = $parts['path'] ?? '/';

        if (str_starts_with($ref, '/')) {
            return "{$scheme}://{$host}{$ref}";
        }

        $dir = substr($basePath, 0, strrpos($basePath, '/') + 1);
        return "{$scheme}://{$host}{$dir}{$ref}";
    }

    /** @param list<array{name:string,duration:float}> $segments */
    private function writeVariantPlaylist(string $path, array $segments): void
    {
        $target = (int) ceil(max(array_column($segments, 'duration')) ?: 2);
        $lines = ['#EXTM3U', '#EXT-X-VERSION:3', "#EXT-X-TARGETDURATION:{$target}", '#EXT-X-PLAYLIST-TYPE:VOD', '#EXT-X-MEDIA-SEQUENCE:0'];

        foreach ($segments as $seg) {
            $lines[] = '#EXTINF:' . rtrim(rtrim(number_format($seg['duration'], 3), '0'), '.') . ',';
            $lines[] = $seg['name'];
        }

        $lines[] = '#EXT-X-ENDLIST';
        file_put_contents($path, implode("\n", $lines) . "\n");
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
            $lines[] = "{$v['name']}/index.m3u8";
        }

        file_put_contents($path, implode("\n", $lines) . "\n");
    }

    // ── network + storage (same idiom as TranscodeVideoToHls) ──────────────

    private function fetchText(string $url): string
    {
        $response = Http::timeout(30)->get($url);
        if ($response->failed()) {
            throw new \RuntimeException("failed to fetch {$url}: status {$response->status()}");
        }
        return $response->body();
    }

    /**
     * Streamed straight to disk via Guzzle's sink option - never buffered
     * into a PHP string. Same reasoning as TranscodeVideoToHls::download():
     * a 500 MB video's worth of segments through memory would take a worker
     * down, doubly so here since a worker may be transferring several
     * videos' ladders concurrently.
     */
    private function downloadStreaming(string $url, string $destPath): bool
    {
        $response = Http::timeout(60)->withOptions(['sink' => $destPath])->get($url);
        return $response->successful() && file_exists($destPath) && filesize($destPath) > 0;
    }

    /** Upload the whole output tree, returning the object count. Mirrors TranscodeVideoToHls::uploadTree(). */
    private function uploadTree(string $disk, string $localDir, string $prefix): int
    {
        $count = 0;
        $it = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($localDir, \FilesystemIterator::SKIP_DOTS));

        foreach ($it as $file) {
            /** @var \SplFileInfo $file */
            if (!$file->isFile()) {
                continue;
            }

            $rel = str_replace('\\', '/', substr($file->getPathname(), strlen($localDir) + 1));
            $key = "{$prefix}/{$rel}";
            $stream = fopen($file->getPathname(), 'rb');
            if (!$stream) {
                continue;
            }

            Storage::disk($disk)->put($key, $stream, [
                'ContentType' => $this->contentTypeFor($rel),
                'CacheControl' => $this->cacheControlFor($rel),
            ]);

            if (is_resource($stream)) {
                fclose($stream);
            }
            $count++;
        }

        return $count;
    }

    private function uploadFile(string $disk, string $localPath, string $key): void
    {
        $stream = fopen($localPath, 'rb');
        if (!$stream) {
            return;
        }

        Storage::disk($disk)->put($key, $stream, [
            'ContentType' => $this->contentTypeFor($key),
            'CacheControl' => $this->cacheControlFor($key),
        ]);

        if (is_resource($stream)) {
            fclose($stream);
        }
    }

    private function contentTypeFor(string $rel): string
    {
        return match (strtolower(pathinfo($rel, PATHINFO_EXTENSION))) {
            'm3u8' => 'application/vnd.apple.mpegurl',
            'ts' => 'video/mp2t',
            default => 'application/octet-stream',
        };
    }

    private function cacheControlFor(string $rel): string
    {
        return str_ends_with($rel, '.m3u8') ? 'public, max-age=300' : 'public, max-age=31536000, immutable';
    }

    private function rmdir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $it = new \RecursiveIteratorIterator(
            new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS),
            \RecursiveIteratorIterator::CHILD_FIRST,
        );

        foreach ($it as $file) {
            /** @var \SplFileInfo $file */
            $file->isDir() ? @rmdir($file->getPathname()) : @unlink($file->getPathname());
        }

        @rmdir($dir);
    }
}
