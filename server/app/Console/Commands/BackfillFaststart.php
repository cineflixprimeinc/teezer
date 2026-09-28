<?php

namespace App\Console\Commands;

use App\Jobs\RemuxVideoFaststart;
use App\Models\Video;
use Illuminate\Console\Command;

/**
 * Queue a +faststart remux for existing videos so they start playing instantly
 * (moov atom moved to the front). Pure stream copy - no re-encode, no audio
 * change. Already-faststart files are detected and skipped by the job.
 *
 * By default only targets videos still stuck on their raw "videos/original/…"
 * upload - i.e. ones ProcessAudioMix never got to finish for (crashed worker,
 * SSH-tunnel drop, etc.) - so a scheduled run stays cheap as the catalog
 * grows. Pass --all to force a full re-scan of every video.
 *
 *   php artisan videos:faststart [--all]
 */
class BackfillFaststart extends Command
{
    protected $signature   = 'videos:faststart {--all : Re-scan every video, not just ones still on the raw original}';
    protected $description = 'Remux existing videos with +faststart for instant playback';

    public function handle(): int
    {
        $count = 0;
        $query = Video::query()
            ->whereNull('deleted_at')
            ->where('mime_type', 'ilike', 'video/%');

        if (! $this->option('all')) {
            $query->where('video_url', 'ilike', 'videos/original/%');
        }

        $query->orderByDesc('id')
            ->chunkById(100, function ($videos) use (&$count) {
                foreach ($videos as $video) {
                    RemuxVideoFaststart::dispatch($video)->onQueue('transcoding');
                    $count++;
                }
            });

        $this->info("Queued {$count} video(s) for +faststart remux.");
        return self::SUCCESS;
    }
}
