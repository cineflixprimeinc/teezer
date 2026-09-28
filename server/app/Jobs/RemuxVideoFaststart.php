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
 * Remux an existing video so its moov atom is at the FRONT (+faststart),
 * letting the player start immediately instead of fetching the file tail first.
 *
 * Pure stream copy: no re-encode, no audio change - safe to run on any already
 * published/mixed video without altering quality or audio levels.
 */
class RemuxVideoFaststart implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 300;
    public int $tries   = 2;

    private const FFMPEG_BIN  = '/usr/bin/ffmpeg';
    private const FFPROBE_BIN = '/usr/bin/ffprobe';

    public function __construct(public Video $video) {}

    public function handle(): void
    {
        $video = $this->video->fresh();
        if (! $video) return;
        if (! Str::startsWith($video->mime_type ?? '', 'video/')) return;

        $disk      = config('filesystems.default', 'local');
        $objectKey = $video->video_url;
        if (empty($objectKey)) return;

        $ext    = strtolower(pathinfo($objectKey, PATHINFO_EXTENSION)) ?: 'mp4';
        $tmpDir = sys_get_temp_dir() . '/rsoo_fs_' . $video->id . '_' . Str::random(8);
        @mkdir($tmpDir, 0755, true);
        $srcPath = $tmpDir . '/src.' . $ext;
        $outPath = $tmpDir . '/fast.mp4';

        try {
            $stream = Storage::disk($disk)->readStream($objectKey);
            if (! $stream) { Log::warning("RemuxFaststart: cannot read video #{$video->id}"); return; }
            file_put_contents($srcPath, $stream);
            if (is_resource($stream)) fclose($stream);
            if (! file_exists($srcPath) || filesize($srcPath) < 1024) return;

            // Skip if the moov atom is already before the mdat atom (already faststart).
            if ($this->isAlreadyFaststart($srcPath)) {
                Log::info("RemuxFaststart: video #{$video->id} already faststart, skipping");
                return;
            }

            $cmd = sprintf(
                '%s -y -i %s -c copy -movflags +faststart %s 2>/dev/null',
                self::FFMPEG_BIN, escapeshellarg($srcPath), escapeshellarg($outPath)
            );
            shell_exec($cmd);

            if (! file_exists($outPath) || filesize($outPath) < 1024) {
                Log::warning("RemuxFaststart: ffmpeg produced no output for video #{$video->id}");
                return;
            }

            // Write to a faststart key and point the row at it (keep original intact).
            $fastKey = preg_replace('#^videos/(original|processed)/#', 'videos/faststart/', $objectKey);
            if ($fastKey === $objectKey) $fastKey = 'videos/faststart/' . ltrim($objectKey, '/');
            $fastKey = preg_replace('/\.[^.\/]+$/', '.mp4', $fastKey);

            Storage::disk($disk)->put($fastKey, file_get_contents($outPath));
            $video->update(['video_url' => $fastKey]);
            Log::info("RemuxFaststart: video #{$video->id} -> {$fastKey}");
        } catch (\Throwable $e) {
            Log::error("RemuxFaststart: video #{$video->id} exception: " . $e->getMessage());
        } finally {
            @unlink($srcPath);
            @unlink($outPath);
            if (is_dir($tmpDir)) { @array_map('unlink', glob($tmpDir . '/*') ?: []); @rmdir($tmpDir); }
        }
    }

    /** True when the moov atom appears before the mdat atom (fast-start layout). */
    private function isAlreadyFaststart(string $path): bool
    {
        // ffprobe reads container metadata up front only when moov is at the start;
        // a cheap heuristic: scan the first 256 KB for the 'moov' box marker.
        $fh = @fopen($path, 'rb');
        if (! $fh) return false;
        $head = (string) fread($fh, 262144);
        fclose($fh);
        $moov = strpos($head, 'moov');
        $mdat = strpos($head, 'mdat');
        if ($moov === false) return false;            // moov not near the front → not faststart
        if ($mdat === false) return true;             // moov found, mdat not yet seen → faststart
        return $moov < $mdat;
    }
}
