<?php

namespace App\Console\Commands;

use App\Jobs\ProcessVideoQualities;
use App\Models\Video;
use Illuminate\Console\Command;

class BackfillVideoQualities extends Command
{
    protected $signature   = 'videos:backfill-qualities
                                {--limit=50 : Max videos to enqueue per run}
                                {--force    : Re-queue even videos that already have quality_urls}';

    protected $description = 'Dispatch ProcessVideoQualities for published videos missing quality_urls';

    public function handle(): int
    {
        $force = $this->option('force');
        $limit = (int) $this->option('limit');

        $query = Video::whereNull('deleted_at')
            ->where('status', 'published')
            ->whereNotNull('video_url')
            ->where(function ($q) {
                $q->where('mime_type', 'ilike', 'video/%')
                  ->orWhereNull('mime_type');
            });

        if (! $force) {
            $query->where(function ($q) {
                $q->whereNull('quality_urls')
                  ->orWhere('quality_urls', '[]')
                  ->orWhere('quality_urls', '{}')
                  ->orWhere('quality_urls', '');
            });
        }

        $total     = $query->count();
        $videos    = $query->latest()->limit($limit)->get();
        $dispatched = 0;

        $this->info("Found {$total} video(s) needing transcoding (processing up to {$limit}).");

        foreach ($videos as $video) {
            ProcessVideoQualities::dispatch($video)->onQueue('transcoding');
            $dispatched++;
            $this->line("  Queued video #{$video->id}: {$video->video_url}");
        }

        $this->info("Dispatched {$dispatched} job(s) to the transcoding queue.");

        if ($total > $limit) {
            $this->warn("Run again to process the remaining " . ($total - $dispatched) . " video(s).");
        }

        return self::SUCCESS;
    }
}
