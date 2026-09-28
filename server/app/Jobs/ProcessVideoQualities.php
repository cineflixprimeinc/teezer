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

class ProcessVideoQualities implements ShouldQueue
{
    use Dispatchable, InteractsWithQueue, Queueable, SerializesModels;

    public int $timeout = 900;  // 15 min max
    public int $tries   = 2;

    /**
     * Quality tiers: [height, video bitrate, audio bitrate]
     * Videos are only downscaled - never upscaled.
     */
    private const TIERS = [
        '4k'   => ['height' => 2160, 'vbitrate' => '8000k', 'abitrate' => '192k'],
        '1080' => ['height' => 1080, 'vbitrate' => '2500k', 'abitrate' => '128k'],
        '720'  => ['height' => 720,  'vbitrate' => '1500k', 'abitrate' => '128k'],
        '480'  => ['height' => 480,  'vbitrate' => '800k',  'abitrate' => '96k' ],
        '360'  => ['height' => 360,  'vbitrate' => '500k',  'abitrate' => '64k' ],
    ];

    // Absolute paths prevent PATH-manipulation attacks in queue worker environments.
    private const FFMPEG_BIN  = '/usr/bin/ffmpeg';
    private const FFPROBE_BIN = '/usr/bin/ffprobe';

    public function __construct(public Video $video) {}

    public function handle(): void
    {
        // Only process actual video files
        if (! Str::startsWith($this->video->mime_type ?? '', 'video/')) {
            return;
        }

        // Require FFmpeg
        if (! $this->ffmpegAvailable()) {
            Log::warning("ProcessVideoQualities: ffmpeg not found, skipping video #{$this->video->id}");
            return;
        }

        $disk      = config('filesystems.default', 'local');
        $objectKey = $this->video->video_url;  // R2 object key
        $ext       = strtolower(pathinfo($objectKey, PATHINFO_EXTENSION)) ?: 'mp4';
        $tmpDir    = sys_get_temp_dir() . '/rsoo_q_' . $this->video->id . '_' . Str::random(8);

        @mkdir($tmpDir, 0755, true);
        $srcPath = $tmpDir . '/src.' . $ext;

        try {
            // 1. Download original from R2
            $stream = Storage::disk($disk)->readStream($objectKey);
            if (! $stream) {
                Log::warning("ProcessVideoQualities: could not read video #{$this->video->id}");
                return;
            }
            file_put_contents($srcPath, $stream);
            if (is_resource($stream)) fclose($stream);

            if (! file_exists($srcPath) || filesize($srcPath) < 1024) return;

            // 2. Probe source height
            $srcHeight = $this->probeHeight($srcPath);

            // 3. Transcode each applicable tier
            $qualityUrls = [];
            foreach (self::TIERS as $label => $cfg) {
                if ($srcHeight > 0 && $cfg['height'] > $srcHeight) continue; // no upscaling

                $outPath = $tmpDir . "/{$label}.mp4";
                $ok = $this->transcode($srcPath, $outPath, $cfg['height'], $cfg['vbitrate'], $cfg['abitrate']);

                if (! $ok || ! file_exists($outPath) || filesize($outPath) < 1024) continue;

                // Derive R2 key: videos/original/… or videos/processed/… → videos/quality/{label}/…
                $qualityKey = preg_replace(
                    '#^videos/(original|processed)/#',
                    "videos/quality/{$label}/",
                    $objectKey
                );
                // Normalise extension to .mp4
                $qualityKey = preg_replace('/\.[^.\/]+$/', '.mp4', $qualityKey);

                Storage::disk($disk)->put($qualityKey, file_get_contents($outPath));
                $qualityUrls[$label] = $qualityKey;  // store key, resource resolves URL

                @unlink($outPath);
            }

            if (! empty($qualityUrls)) {
                $this->video->update(['quality_urls' => $qualityUrls]);
                Log::info("ProcessVideoQualities: video #{$this->video->id} qualities stored: " . implode(', ', array_keys($qualityUrls)));
            }

        } catch (\Throwable $e) {
            Log::error("ProcessVideoQualities: video #{$this->video->id} failed: " . $e->getMessage());
            throw $e;
        } finally {
            @unlink($srcPath);
            $this->rmdir($tmpDir);
        }
    }

    private function ffmpegAvailable(): bool
    {
        return is_executable(self::FFMPEG_BIN) && is_executable(self::FFPROBE_BIN);
    }

    private function probeHeight(string $path): int
    {
        $cmd = sprintf(
            '%s -v error -select_streams v:0 -show_entries stream=height -of csv=p=0 %s 2>/dev/null',
            self::FFPROBE_BIN,
            escapeshellarg($path)
        );
        $out = trim((string) shell_exec($cmd));
        return is_numeric($out) ? (int) $out : 0;
    }

    private function transcode(string $src, string $dst, int $height, string $vbitrate, string $abitrate): bool
    {
        // scale=-2:H keeps aspect ratio and ensures even width (required by libx264)
        $cmd = sprintf(
            '%s -y -i %s -vf "scale=-2:%d" -c:v libx264 -b:v %s -maxrate %s -bufsize %s -preset fast -c:a aac -b:a %s -movflags +faststart %s 2>/dev/null',
            self::FFMPEG_BIN,
            escapeshellarg($src),
            $height,
            $vbitrate,
            $vbitrate,
            $vbitrate,
            $abitrate,
            escapeshellarg($dst)
        );
        shell_exec($cmd);
        return file_exists($dst) && filesize($dst) > 1024;
    }

    private function rmdir(string $dir): void
    {
        if (! is_dir($dir)) return;
        foreach (glob($dir . '/*') ?: [] as $f) {
            is_dir($f) ? $this->rmdir($f) : @unlink($f);
        }
        @rmdir($dir);
    }
}
