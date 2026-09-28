<?php

namespace App\Jobs;

use App\Jobs\Video\StartTranscodingJob;
use App\Models\MusicTrack;
use App\Models\Video;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class ProcessAudioMix implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 600;
    public int $tries   = 2;

    private const FFMPEG_BIN  = '/usr/bin/ffmpeg';
    private const FFPROBE_BIN = '/usr/bin/ffprobe';

    public function __construct(public Video $video) {}

    public function handle(): void
    {
        $video = $this->video;

        if (! Str::startsWith($video->mime_type ?? '', 'video/')) {
            $this->dispatchNextTranscodeStep($video);
            return;
        }

        $hasMusicTrack = ! empty($video->music_track_id)
            && ! (bool) $video->is_music_muted
            && (int) $video->music_volume > 0;

        $originalGain = (bool) $video->is_original_audio_muted
            ? 0.0
            : max(0.0, min(1.0, (int) $video->original_audio_volume / 100));

        $musicGain = max(0.0, min(1.0, (int) $video->music_volume / 100));

        // Even with no mixing to do we still pass the file through FFmpeg with
        // +faststart so the moov atom is at the FRONT. Without that the browser
        // must download the end of the file before playback can begin, causing
        // the start-up delay/buffering. applyAudioMix() handles this no-op as a
        // pure stream copy (no re-encode), so it's cheap and lossless.
        $disk      = config('filesystems.default', 'local');
        $objectKey = $video->video_url;
        $ext       = strtolower(pathinfo($objectKey, PATHINFO_EXTENSION)) ?: 'mp4';
        $tmpDir    = sys_get_temp_dir() . '/rsoo_mix_' . $video->id . '_' . Str::random(8);

        @mkdir($tmpDir, 0755, true);

        $srcPath   = $tmpDir . '/src.' . $ext;
        $musicPath = null;
        $outPath   = $tmpDir . '/mixed.mp4';
        $mixSucceeded = false;

        try {
            // 1. Download original video from R2
            $stream = Storage::disk($disk)->readStream($objectKey);
            if (! $stream) {
                Log::warning("ProcessAudioMix: cannot read video #{$video->id} from R2");
                return;
            }
            file_put_contents($srcPath, $stream);
            if (is_resource($stream)) fclose($stream);

            if (! file_exists($srcPath) || filesize($srcPath) < 1024) {
                Log::warning("ProcessAudioMix: empty source for video #{$video->id}");
                return;
            }

            // 2. Download music audio if needed
            if ($hasMusicTrack) {
                $track = MusicTrack::find($video->music_track_id);
                if ($track) {
                    $musicPath = $this->downloadTrackAudio($track, $tmpDir, $disk);
                }
                if (! $musicPath || ! file_exists($musicPath) || filesize($musicPath) < 512) {
                    Log::warning("ProcessAudioMix: music download failed for video #{$video->id}, mixing without music");
                    $hasMusicTrack = false;
                    $musicPath     = null;
                }
            }

            // 3. Apply FFmpeg audio mix
            $ok = $this->applyAudioMix(
                $srcPath, $outPath,
                $originalGain,
                $hasMusicTrack ? $musicPath : null,
                $musicGain
            );

            if ($ok && file_exists($outPath) && filesize($outPath) > 1024) {
                $processedKey = preg_replace('#^videos/original/#', 'videos/processed/', $objectKey);
                $processedKey = preg_replace('/\.[^.\/]+$/', '.mp4', $processedKey);

                Storage::disk($disk)->put($processedKey, file_get_contents($outPath));
                $video->update(['video_url' => $processedKey]);
                $mixSucceeded = true;

                Log::info("ProcessAudioMix: video #{$video->id} mixed -> {$processedKey}");
            } else {
                Log::warning("ProcessAudioMix: FFmpeg mix produced no output for video #{$video->id}, keeping original audio");
            }

        } catch (\Throwable $e) {
            Log::error("ProcessAudioMix: video #{$video->id} exception: " . $e->getMessage());
        } finally {
            @unlink($srcPath);
            if ($musicPath) @unlink($musicPath);
            @unlink($outPath);
            $this->rmdirRecursive($tmpDir);

            // Always continue to the HLS ladder using the freshest video_url.
            // This used to build progressive MP4 renditions; HLS replaces them
            // because a manifest lets the player start on a small segment and
            // adapt, instead of committing to one file size up front.
            $freshVideo = $video->fresh();
            if ($freshVideo) {
                $this->dispatchNextTranscodeStep($freshVideo);

                // Safety net: only when the mix above failed/skipped (read error,
                // empty source, ffmpeg producing no output) is video_url still the
                // raw original - which is very often NOT faststart (moov atom at
                // the end), forcing the player to fetch the file tail before it
                // can start, i.e. exactly the "some videos lag/don't play" bug.
                // Gated on failure so successful uploads never pay for a second
                // full download+remux+upload pass.
                if (! $mixSucceeded) {
                    RemuxVideoFaststart::dispatch($freshVideo)->onQueue('transcoding');
                }
            }
        }
    }

    private function downloadTrackAudio(MusicTrack $track, string $tmpDir, string $disk): ?string
    {
        // Prefer explicit R2 key stored on the track
        $r2Key = $track->audio_r2_key ?? null;
        if ($r2Key && ! str_starts_with($r2Key, 'http')) {
            $ext    = strtolower(pathinfo($r2Key, PATHINFO_EXTENSION)) ?: 'mp3';
            $dest   = $tmpDir . '/music.' . $ext;
            $stream = Storage::disk($disk)->readStream($r2Key);
            if ($stream) {
                file_put_contents($dest, $stream);
                if (is_resource($stream)) fclose($stream);
                if (file_exists($dest) && filesize($dest) > 512) return $dest;
            }
        }

        // Fall back to audio_url (R2 key or full CDN URL)
        $audioUrl = $track->audio_url ?? null;
        if (! $audioUrl) return null;

        $parsedPath = parse_url($audioUrl, PHP_URL_PATH) ?: $audioUrl;
        $ext  = strtolower(pathinfo($parsedPath, PATHINFO_EXTENSION)) ?: 'mp3';
        $dest = $tmpDir . '/music.' . $ext;

        if (! str_starts_with($audioUrl, 'http')) {
            $stream = Storage::disk($disk)->readStream($audioUrl);
            if ($stream) {
                file_put_contents($dest, $stream);
                if (is_resource($stream)) fclose($stream);
            }
        } else {
            $ctx  = stream_context_create(['http' => ['timeout' => 30, 'ignore_errors' => true]]);
            $data = @file_get_contents($audioUrl, false, $ctx);
            if ($data !== false) file_put_contents($dest, $data);
        }

        return (file_exists($dest) && filesize($dest) > 512) ? $dest : null;
    }

    private function applyAudioMix(
        string  $srcPath,
        string  $outPath,
        float   $originalGain,
        ?string $musicPath,
        float   $musicGain
    ): bool {
        $ffmpeg   = self::FFMPEG_BIN;
        $hasAudio = $this->probeHasAudio($srcPath);
        // +faststart relocates the moov atom to the front so playback can start
        // before the whole file is downloaded.
        $fast = '-movflags +faststart';

        if (! $musicPath && $originalGain >= 1.0) {
            // No music, original audio untouched → pure remux + faststart (no re-encode).
            $audio = $hasAudio ? '-c:a copy' : '-an';
            $cmd = sprintf(
                '%s -y -i %s -c:v copy %s %s %s 2>/dev/null',
                $ffmpeg, escapeshellarg($srcPath), $audio, $fast, escapeshellarg($outPath)
            );
        } elseif (! $musicPath) {
            // No music - adjust original volume or silence it
            if (! $hasAudio || $originalGain <= 0.0) {
                $cmd = sprintf(
                    '%s -y -i %s -c:v copy -an %s %s 2>/dev/null',
                    $ffmpeg, escapeshellarg($srcPath), $fast, escapeshellarg($outPath)
                );
            } else {
                $cmd = sprintf(
                    '%s -y -i %s -c:v copy -af volume=%.4f -c:a aac %s %s 2>/dev/null',
                    $ffmpeg, escapeshellarg($srcPath), $originalGain, $fast, escapeshellarg($outPath)
                );
            }
        } elseif (! $hasAudio || $originalGain <= 0.0) {
            // Music only - map music audio over silent/muted video
            $cmd = sprintf(
                // No -stream_loop: a selected section is a section, and looping
                // it would replay the chosen few seconds over and over.
                '%s -y -i %s -i %s -filter_complex [1:a]%s,alimiter=limit=0.95[aout] -map 0:v:0 -map [aout] -c:v copy -c:a aac -shortest %s %s 2>/dev/null',
                $ffmpeg,
                escapeshellarg($srcPath),
                escapeshellarg($musicPath),
                $this->musicChain($video, $musicGain),
                $fast,
                escapeshellarg($outPath)
            );
        } else {
            // Mix original audio + looping music
            $cmd = sprintf(
                // alimiter after the mix: two sources summed can exceed full
                // scale even with normalize=0, and that overflow is the crackle
                // on a loud mix. duration=first keeps the result tied to the
                // video's own stream, so audio cannot outlast the picture.
                '%s -y -i %s -i %s -filter_complex [0:a]volume=%.4f[a0];[1:a]%s[a1];[a0][a1]amix=inputs=2:duration=first:dropout_transition=2:normalize=0[mix];[mix]alimiter=limit=0.95[aout] -map 0:v:0 -map [aout] -c:v copy -c:a aac -shortest %s %s 2>/dev/null',
                $ffmpeg,
                escapeshellarg($srcPath),
                escapeshellarg($musicPath),
                $originalGain,
                $this->musicChain($video, $musicGain),
                $fast,
                escapeshellarg($outPath)
            );
        }

        Log::debug("ProcessAudioMix FFmpeg cmd: {$cmd}");
        shell_exec($cmd);
        return file_exists($outPath) && filesize($outPath) > 1024;
    }

    private function probeHasAudio(string $path): bool
    {
        $cmd = sprintf(
            '%s -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 %s 2>/dev/null',
            self::FFPROBE_BIN,
            escapeshellarg($path)
        );
        return ! empty(trim((string) shell_exec($cmd)));
    }

    private function rmdirRecursive(string $dir): void
    {
        if (! is_dir($dir)) return;
        foreach (glob($dir . '/*') ?: [] as $f) {
            is_dir($f) ? $this->rmdirRecursive($f) : @unlink($f);
        }
        @rmdir($dir);
    }

    /**
     * The one branch point between the two transcoding pipelines. Off
     * (config('services.apivideo.enabled') false, the default) changes
     * nothing - every video keeps going through the local-ffmpeg
     * TranscodeVideoToHls exactly as before. On, new uploads go to
     * StartTranscodingJob (api.video) instead; TranscodeVideoToHls itself,
     * and every already-processed video, is untouched either way.
     */
    /**
     * The music filter chain, from the video's stored audio timeline.
     *
     * This is what turns "play this song under the video" into an edit. Without
     * it the music could only ever start at its own beginning and at the
     * video's - which is why the two branches below used `-stream_loop -1`,
     * looping the track from bar one and playing whatever happened to land.
     *
     * Order is load-bearing: trim the chosen section out of the source, delay it
     * to where it sits on the video, set the gain, then fade. Fading before the
     * delay would fade silence, and gain after the fade would undo it.
     *
     * Returns the chain WITHOUT a stream label so both call sites can attach
     * their own. An empty timeline yields just the gain, so a video saved before
     * this existed behaves exactly as it did.
     */
    private function musicChain(Video $video, float $musicGain): string
    {
        $parts = [];

        $startMs = (int) ($video->music_source_start_ms ?? 0);
        $endMs   = (int) ($video->music_source_end_ms ?? 0);
        $delayMs = max(0, (int) ($video->music_video_start_ms ?? 0));
        $lenMs   = max(0, $endMs - $startMs);

        if ($lenMs > 0) {
            // atrim speaks seconds. asetpts rebases the timestamps afterwards -
            // without it the trimmed audio keeps its original position and
            // arrives minutes late, or not at all.
            $parts[] = sprintf('atrim=start=%.3f:end=%.3f', max(0, $startMs) / 1000, $endMs / 1000);
            $parts[] = 'asetpts=PTS-STARTPTS';
        }

        if ($delayMs > 0) {
            // all=1 rather than one value per channel, so this is right for mono
            // and stereo sources alike.
            $parts[] = sprintf('adelay=%d:all=1', $delayMs);
        }

        $parts[] = sprintf('volume=%.4f', $musicGain);

        $fadeIn  = max(0, (int) ($video->music_fade_in_ms ?? 0)) / 1000;
        $fadeOut = max(0, (int) ($video->music_fade_out_ms ?? 0)) / 1000;
        if ($fadeIn > 0) {
            $parts[] = sprintf('afade=t=in:st=%.3f:d=%.3f', $delayMs / 1000, $fadeIn);
        }
        if ($fadeOut > 0 && $lenMs > 0) {
            $parts[] = sprintf(
                'afade=t=out:st=%.3f:d=%.3f',
                max(0, ($delayMs + $lenMs) / 1000 - $fadeOut),
                $fadeOut,
            );
        }

        return implode(',', $parts);
    }

    private function dispatchNextTranscodeStep(Video $video): void
    {
        if (config('services.apivideo.enabled')) {
            StartTranscodingJob::dispatch($video->id)->onQueue('transcoding');
            return;
        }

        TranscodeVideoToHls::dispatch($video)->onQueue('transcoding');
    }
}
