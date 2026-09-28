<?php

namespace App\Console\Commands;

use App\Services\StoryAnalyticsService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Background reconciliation for story analytics.
 *
 * The rollup in `story_analytics` is maintained inline on every write, so this
 * is not what keeps it correct in the normal case - it is what makes "briefly
 * stale" the worst possible outcome instead of "permanently drifted".
 *
 * Three jobs, in this order:
 *
 *   1. BACKFILL - stories that have interactions but no rollup row at all.
 *      Every story that predates this system is in that state, and their
 *      analytics would otherwise read as zeros until somebody happened to
 *      interact with them again.
 *
 *   2. RECONCILE - rollups that have not been recomputed recently. Catches the
 *      one failure the inline path cannot: a crash between writing the source
 *      row and updating the rollup. Recomputing from source is idempotent, so
 *      running this more often than necessary costs time and never correctness.
 *
 *   3. PRUNE - `story_view_events` is append-only and grows without bound by
 *      design (it is where rewatches and drop-off live). Deleted in bounded
 *      batches, same shape as PruneProfileViews, so the sweep never holds a long
 *      lock on a large table.
 *
 * Pruning runs LAST and only touches rows older than the retention window, so a
 * story whose events were just trimmed still has correct aggregates: the
 * durable totals live in story_views and story_analytics, not in the event log.
 */
class RebuildStoryAnalytics extends Command
{
    protected $signature = 'stories:rebuild-analytics
                            {--stale-minutes=60 : Recompute rollups not refreshed in this long}
                            {--retain-days=90 : Keep raw view events for this many days}
                            {--limit=500 : Max rollups to recompute in one run}
                            {--batch=5000 : Delete batch size when pruning}
                            {--prune : Also prune expired raw view events}';

    protected $description = 'Backfill and reconcile story_analytics rollups, and prune old raw story view events';

    public function handle(StoryAnalyticsService $analytics): int
    {
        // Guard rather than crash: the scheduler runs on every box, including
        // one that has not migrated yet.
        if (! Schema::hasTable('story_analytics') || ! Schema::hasTable('story_views')) {
            $this->info('Story analytics tables not migrated yet - nothing to do.');

            return self::SUCCESS;
        }

        $limit = max(1, (int) $this->option('limit'));

        $rebuilt = $this->backfillMissing($analytics, $limit);
        $rebuilt += $this->reconcileStale($analytics, max(0, $limit - $rebuilt));

        $this->info("Recomputed {$rebuilt} story analytics rollup(s).");

        if ($this->option('prune')) {
            $this->info('Pruned ' . $this->pruneEvents() . ' raw story view event(s).');
        }

        return self::SUCCESS;
    }

    /** Stories with views but no rollup row - everything from before this system. */
    private function backfillMissing(StoryAnalyticsService $analytics, int $limit): int
    {
        if ($limit <= 0) {
            return 0;
        }

        $rows = DB::table('story_views')
            ->join('stories', 'stories.id', '=', 'story_views.story_id')
            ->leftJoin('story_analytics', 'story_analytics.story_id', '=', 'story_views.story_id')
            ->whereNull('story_analytics.id')
            ->groupBy('story_views.story_id', 'stories.user_id')
            ->limit($limit)
            ->get(['story_views.story_id', 'stories.user_id']);

        foreach ($rows as $row) {
            $analytics->recompute((int) $row->story_id, (int) $row->user_id);
            $analytics->forget((int) $row->story_id);
        }

        return $rows->count();
    }

    /** Rollups that have gone quiet - the crash-between-steps case. */
    private function reconcileStale(StoryAnalyticsService $analytics, int $limit): int
    {
        if ($limit <= 0) {
            return 0;
        }

        $cutoff = now()->subMinutes(max(1, (int) $this->option('stale-minutes')));

        $rows = DB::table('story_analytics')
            ->where(function ($q) use ($cutoff) {
                $q->whereNull('recomputed_at')->orWhere('recomputed_at', '<', $cutoff);
            })
            // Oldest first so a backlog drains in a predictable order rather
            // than the same few rows being picked every run.
            ->orderByRaw('recomputed_at IS NULL DESC')
            ->orderBy('recomputed_at')
            ->limit($limit)
            ->get(['story_id', 'story_owner_id']);

        foreach ($rows as $row) {
            $analytics->recompute((int) $row->story_id, (int) $row->story_owner_id);
            $analytics->forget((int) $row->story_id);
        }

        return $rows->count();
    }

    /**
     * Retention for the append-only event log.
     *
     * Only the raw events expire. Unique viewers, totals and the rollup are all
     * durable, so an owner opening a months-old archived story still sees the
     * right numbers - they just lose the slide-level drop-off detail, which is
     * the part that is expensive to keep and cheap to lose.
     */
    private function pruneEvents(): int
    {
        if (! Schema::hasTable('story_view_events')) {
            return 0;
        }

        $cutoff = now()->subDays(max(1, (int) $this->option('retain-days')));
        $batch  = max(500, (int) $this->option('batch'));
        $total  = 0;

        do {
            $ids = DB::table('story_view_events')
                ->where('created_at', '<', $cutoff)
                ->orderBy('id')
                ->limit($batch)
                ->pluck('id');

            if ($ids->isEmpty()) {
                break;
            }
            $total += DB::table('story_view_events')->whereIn('id', $ids)->delete();
        } while ($ids->count() === $batch);

        return $total;
    }
}
