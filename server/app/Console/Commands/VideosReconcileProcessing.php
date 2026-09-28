<?php

namespace App\Console\Commands;

use App\Models\VideoProcessingJob;
use App\Services\Video\Support\ApiVideoFailureClassifier;
use App\Services\Video\VideoProcessingService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Log;

/**
 * Backstop for the webhook-driven pipeline, not the mechanism - webhooks
 * are still the fast path. Two real gaps this closes, both confirmed while
 * building the pipeline (not theoretical):
 *
 *   1. api.video documents no "encoding failed" webhook event (only
 *      video.encoding.quality.completed) - a genuinely failed encode has no
 *      webhook that will ever fire for it, so it would sit in `processing`
 *      forever without something else checking.
 *   2. A webhook CAN arrive, get durably recorded (so a replay of that same
 *      delivery is correctly deduped and never retried), and then fail to
 *      advance the job if checkCompletionAndAdvance's own call to the
 *      provider hits a transient error - the one webhook that could have
 *      advanced it is now considered handled. Observed directly during
 *      testing (a transient network failure mid-request), not hypothetical.
 *
 * --stale-minutes is deliberately well above normal encode time (api.video
 * typically encodes in well under a minute for short-form content) so this
 * never fights a job that is simply still in progress.
 *
 *   php artisan videos:reconcile-processing
 */
class VideosReconcileProcessing extends Command
{
    protected $signature = 'videos:reconcile-processing
                            {--limit=50 : Max jobs to check this run}
                            {--stale-minutes=30 : Age before a queued/processing job is worth re-checking}
                            {--fail-after-minutes=180 : Age after which a still-stuck job is marked failed outright}';

    protected $description = 'Re-check queued/processing video_processing_jobs that no webhook has advanced recently';

    public function handle(VideoProcessingService $processing): int
    {
        $limit = max(1, (int) $this->option('limit'));
        $staleAt = now()->subMinutes((int) $this->option('stale-minutes'));
        $failAt = now()->subMinutes((int) $this->option('fail-after-minutes'));

        // "How long has THIS job been on its CURRENT leg" - a job that has
        // already fallen back is timed from fallback_started_at, not its
        // original (now stale, and no longer relevant) started_at. Without
        // COALESCE here, a job that fell back a minute ago would still look
        // "started 3 hours ago" and get swept up as stuck all over again on
        // the very next run.
        $legStartedAt = 'COALESCE(fallback_started_at, started_at)';

        $jobs = VideoProcessingJob::query()
            ->whereIn('status', [VideoProcessingJob::STATUS_QUEUED, VideoProcessingJob::STATUS_PROCESSING])
            ->where(function ($q) use ($staleAt, $legStartedAt) {
                $q->whereNull('started_at')->orWhereRaw("{$legStartedAt} <= ?", [$staleAt]);
            })
            ->orderByRaw($legStartedAt)
            ->limit($limit)
            ->get();

        if ($jobs->isEmpty()) {
            $this->info('Nothing stuck - every queued/processing job is recent enough to still be genuinely in progress.');
            return self::SUCCESS;
        }

        $checked = 0;
        $failed = 0;

        foreach ($jobs as $job) {
            // Same COALESCE the query used, computed in PHP now that the row
            // is loaded - "stuck" is judged against whichever leg (primary
            // or fallback) is actually current for this job.
            $legStartedAt = $job->fallback_started_at ?? $job->started_at;

            if ($legStartedAt && $legStartedAt->lte($failAt)) {
                // Stuck on the primary (api.video) past the timeout - this
                // IS what "processing timeout" means for the fallback rule,
                // so try ffmpeg before giving up outright. A job already
                // stuck on the FALLBACK itself (ffmpeg worker crashed,
                // never restarted) has nowhere further to fall back to -
                // shouldFallbackToFFmpeg() returns false for a non-apivideo
                // job, so this correctly falls through to markFailed either way.
                if ($processing->shouldFallbackToFFmpeg($job, ApiVideoFailureClassifier::PERMANENT)) {
                    $processing->fallbackToFFmpeg($job, "timed out after {$this->option('fail-after-minutes')} minutes with no completion");
                    $this->line("  #{$job->id} (video {$job->video_id}) - timed out on {$job->provider}, falling back to ffmpeg");
                } else {
                    $processing->markFailed($job, 'stuck_no_progress', "no completion after {$this->option('fail-after-minutes')} minutes");
                    $failed++;
                    $this->line("  #{$job->id} (video {$job->video_id}) - given up after " . $legStartedAt->diffForHumans(null, true));
                }
                continue;
            }

            try {
                $processing->checkCompletionAndAdvance($job);
                $checked++;
            } catch (\Throwable $e) {
                Log::warning('videos_reconcile.check_failed', ['job_id' => $job->id, 'error' => $e->getMessage()]);
                $this->line("  #{$job->id} (video {$job->video_id}) - check failed, will retry next run: {$e->getMessage()}");
            }
        }

        $this->info("Re-checked {$checked} job(s), gave up on {$failed}.");

        return self::SUCCESS;
    }
}
