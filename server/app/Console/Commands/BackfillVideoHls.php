<?php

namespace App\Console\Commands;

use App\Jobs\TranscodeVideoToHls;
use App\Models\Video;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Queue HLS transcoding for videos uploaded before adaptive streaming existed.
 *
 * Those rows still play - the client falls back to the progressive original in
 * video_url - so this is a quality upgrade, not a repair. Run it on the
 * dedicated backfill queue when catching up a large library.
 *
 * Run it that way, in fact. Each job downloads the source, runs FFmpeg four
 * times and uploads a few dozen objects; turning the whole library loose on the
 * fresh-upload transcoding workers will starve the jobs a user is waiting on.
 *
 *   php artisan videos:backfill-hls --limit=25 --queue=transcoding-backfill
 *   php artisan videos:backfill-hls --limit=25 --retry-failed
 */
class BackfillVideoHls extends Command
{
    protected $signature = 'videos:backfill-hls
                            {--limit=25    : Max videos to enqueue this run}
                            {--queue=transcoding : Queue name for dispatched HLS jobs}
                            {--retry-failed : Also re-queue videos whose transcode previously failed}
                            {--force       : Re-queue even videos that already have a ready ladder}
                            {--dry-run     : List what would be queued, queue nothing}';

    protected $description = 'Dispatch TranscodeVideoToHls for videos that have no HLS ladder yet';

    public function handle(): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $queue = trim((string) $this->option('queue')) ?: 'transcoding';

        $query = Video::query()
            ->whereNotNull('video_url')
            ->where('mime_type', 'like', 'video/%');

        if (! $this->option('force')) {
            $query->where(function ($q) {
                $q->whereNull('hls_status')
                  ->orWhere('hls_status', '!=', 'ready');

                if (! $this->option('retry-failed')) {
                    // Without --retry-failed, skip the ones that already failed.
                    // A source that FFmpeg cannot read fails identically every
                    // run, and re-queueing it each night burns a transcoding
                    // slot forever while hiding the videos that could succeed.
                    $q->where(function ($inner) {
                        $inner->whereNull('hls_status')
                              ->orWhereNotIn('hls_status', ['failed', 'unavailable']);
                    });
                }
            });
        }

        $total  = (clone $query)->count();
        $videos = $query->orderByDesc('created_at')->limit($limit)->get();

        if ($videos->isEmpty()) {
            $this->info('Nothing to do - every eligible video already has an HLS ladder.');
            return self::SUCCESS;
        }

        $this->info("{$total} video(s) need HLS; queueing up to {$limit} this run on {$queue}.");

        $queued = 0;
        foreach ($videos as $video) {
            $label = Str::limit($video->title ?: $video->caption ?: '(untitled)', 40);

            if ($this->option('dry-run')) {
                $this->line("  would queue #{$video->id} [{$video->hls_status}] {$label}");
                continue;
            }

            TranscodeVideoToHls::dispatch($video)->onQueue($queue);
            $video->update(['hls_status' => 'queued']);
            $queued++;
            $this->line("  queued #{$video->id} {$label}");
        }

        if ($this->option('dry-run')) {
            $this->comment('Dry run - nothing was queued.');
            return self::SUCCESS;
        }

        $remaining = max(0, $total - $queued);
        $this->info("Queued {$queued} video(s). {$remaining} still pending - re-run to continue.");

        return self::SUCCESS;
    }
}
