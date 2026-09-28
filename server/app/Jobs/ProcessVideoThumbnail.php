<?php

namespace App\Jobs;

use App\Models\Video;
use Illuminate\Bus\Queueable;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Bus\Dispatchable;
use Illuminate\Queue\InteractsWithQueue;
use Illuminate\Queue\SerializesModels;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

/**
 * Extract a cover frame from a video with FFmpeg and store it as the post's
 * thumbnail. This is the fallback when the browser-side cover generation didn't
 * run or failed, so every video post ends up with a real thumbnail instead of a
 * black/blank grid card.
 */
class ProcessVideoThumbnail implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;
    public int $tries   = 2;

    private const FFMPEG_BIN  = '/usr/bin/ffmpeg';
    private const FFPROBE_BIN = '/usr/bin/ffprobe';

    /** @param bool $force overwrite an existing thumbnail (used by backfill) */
    public function __construct(public Video $video, public bool $force = false) {}

    public function handle(): void
    {
        $video = $this->video->fresh();
        if (! $video) return;

        // Videos only - images/carousels already carry a photo cover.
        if (! Str::startsWith($video->mime_type ?? '', 'video/')) return;

        // Already has a thumbnail and we're not forcing a refresh - nothing to do.
        if (! $this->force && ! empty($video->thumbnail_url)) return;

        $disk      = config('filesystems.default', 'local');
        $objectKey = $video->video_url;
        if (empty($objectKey)) return;

        $ext    = strtolower(pathinfo($objectKey, PATHINFO_EXTENSION)) ?: 'mp4';
        $tmpDir = sys_get_temp_dir() . '/rsoo_thumb_' . $video->id . '_' . Str::random(8);
        @mkdir($tmpDir, 0755, true);

        $srcPath = $tmpDir . '/src.' . $ext;
        $outPath = $tmpDir . '/cover.jpg';

        try {
            // 1. Download the video from R2.
            $stream = Storage::disk($disk)->readStream($objectKey);
            if (! $stream) {
                Log::warning("ProcessVideoThumbnail: cannot read video #{$video->id} from storage");
                return;
            }
            file_put_contents($srcPath, $stream);
            if (is_resource($stream)) fclose($stream);

            if (! file_exists($srcPath) || filesize($srcPath) < 1024) {
                Log::warning("ProcessVideoThumbnail: empty source for video #{$video->id}");
                return;
            }

            // 2. Pick a seek point a little into the clip (avoids black intro frames),
            //    clamped for very short videos.
            $duration = $this->probeDuration($srcPath);
            $seek     = $duration > 0 ? min(1.0, max(0.0, $duration * 0.1)) : 1.0;

            // 3. Extract one frame, scaled down to a sensible cover size (keeps ratio).
            if (! $this->extractFrame($srcPath, $outPath, $seek)) {
                // Retry from the very first frame if the seek landed past the end.
                $this->extractFrame($srcPath, $outPath, 0.0);
            }

            if (! file_exists($outPath) || filesize($outPath) < 512) {
                Log::warning("ProcessVideoThumbnail: FFmpeg produced no frame for video #{$video->id}");
                return;
            }

            // 4. Upload under the public thumbnails/ prefix (served without a token).
            $thumbKey = sprintf(
                'thumbnails/auto/%d/%d_%s.jpg',
                $video->user_id,
                $video->id,
                Str::random(8)
            );
            Storage::disk($disk)->put($thumbKey, file_get_contents($outPath));

            $video->update(['thumbnail_url' => $thumbKey]);
            Log::info("ProcessVideoThumbnail: video #{$video->id} cover -> {$thumbKey}");
        } catch (\Throwable $e) {
            Log::error("ProcessVideoThumbnail: video #{$video->id} exception: " . $e->getMessage());
        } finally {
            @unlink($srcPath);
            @unlink($outPath);
            $this->rmdirRecursive($tmpDir);
        }
    }

    private function probeDuration(string $path): float
    {
        $cmd = sprintf(
            '%s -v error -show_entries format=duration -of csv=p=0 %s 2>/dev/null',
            self::FFPROBE_BIN,
            escapeshellarg($path)
        );
        return (float) trim((string) shell_exec($cmd));
    }

    private function extractFrame(string $srcPath, string $outPath, float $seek): bool
    {
        // -ss before -i = fast seek; scale width to <=720 keeping aspect (-2 = even height).
        $cmd = sprintf(
            '%s -y -ss %.3f -i %s -frames:v 1 -vf %s -q:v 3 %s 2>/dev/null',
            self::FFMPEG_BIN,
            $seek,
            escapeshellarg($srcPath),
            escapeshellarg("scale='min(720,iw)':-2"),
            escapeshellarg($outPath)
        );
        shell_exec($cmd);
        return file_exists($outPath) && filesize($outPath) >= 512;
    }

    private function rmdirRecursive(string $dir): void
    {
        if (! is_dir($dir)) return;
        foreach (glob($dir . '/*') ?: [] as $f) {
            is_dir($f) ? $this->rmdirRecursive($f) : @unlink($f);
        }
        @rmdir($dir);
    }
}
