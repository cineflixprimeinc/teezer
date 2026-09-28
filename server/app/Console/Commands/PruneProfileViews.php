<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Retention for profile_views: keep only the last 7 days. Deletes in bounded
 * batches so the sweep never holds a long lock on a huge table (millions of
 * rows) - safe to run daily.
 */
class PruneProfileViews extends Command
{
    protected $signature = 'profile-views:prune {--days=7} {--batch=5000}';

    protected $description = 'Delete profile_views older than N days (default 7) in batches';

    public function handle(): int
    {
        if (!Schema::hasTable('profile_views') || !Schema::hasColumn('profile_views', 'last_viewed_at')) {
            $this->info('profile_views not migrated yet - nothing to prune.');
            return self::SUCCESS;
        }

        $cutoff = now()->subDays((int) $this->option('days'));
        $batch  = max(500, (int) $this->option('batch'));
        $total  = 0;

        do {
            // DELETE ... WHERE id IN (SELECT ... LIMIT) - portable batched delete.
            $ids = DB::table('profile_views')
                ->where('last_viewed_at', '<', $cutoff)
                ->orderBy('id')
                ->limit($batch)
                ->pluck('id');

            if ($ids->isEmpty()) break;
            $total += DB::table('profile_views')->whereIn('id', $ids)->delete();
        } while ($ids->count() === $batch);

        $this->info("Pruned {$total} profile_views older than {$this->option('days')} days.");
        return self::SUCCESS;
    }
}
