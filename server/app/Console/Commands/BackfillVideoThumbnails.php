<?php

namespace App\Console\Commands;

use App\Jobs\ProcessVideoThumbnail;
use App\Models\Video;
use Illuminate\Console\Command;

/**
 * Queue cover-frame extraction for existing video posts that have no thumbnail,
 * so old uploads stop showing black/blank cards in the grids.
 *
 *   php artisan videos:backfill-thumbnails          # missing thumbnails only
 *   php artisan videos:backfill-thumbnails --force   # re-extract for all videos
 */
class BackfillVideoThumbnails extends Command
{
    protected $signature = 'videos:backfill-thumbnails {--force : Re-extract even when a thumbnail already exists}';
    protected $description = 'Queue server-side cover extraction for videos missing a thumbnail';

    public function handle(): int
    {
        $force = (bool) $this->option('force');

        $query = Video::query()
            ->whereNull('deleted_at')
            ->where('mime_type', 'ilike', 'video/%');

        if (! $force) {
            $query->where(fn ($q) => $q->whereNull('thumbnail_url')->orWhere('thumbnail_url', ''));
        }

        $count = 0;
        $query->orderByDesc('id')->chunkById(100, function ($videos) use ($force, &$count) {
            foreach ($videos as $video) {
                ProcessVideoThumbnail::dispatch($video, $force)->onQueue('transcoding');
                $count++;
            }
        });

        $this->info("Queued {$count} video(s) for thumbnail extraction" . ($force ? ' (forced).' : '.'));
        return self::SUCCESS;
    }
}
