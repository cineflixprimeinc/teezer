<?php

namespace App\Console\Commands;

use App\Jobs\SyncCreatorMonetization;
use App\Models\User;
use Illuminate\Console\Command;

/**
 * The 24-hour re-check.
 *
 * Worth being clear about what this is NOT for: it is not what keeps the app
 * correct. Eligibility is computed on every read, so a creator always sees the
 * truth whether or not this ran. What it does is keep the persisted SNAPSHOT
 * current - the unlock history, the "everyone active on X" queries, and the
 * transition log - and catch anything an event hook missed.
 *
 * Queued one job per creator rather than evaluated inline: the job is already
 * unique-per-user for 60 seconds, so a creator who also trips an event hook
 * during the run is measured once, not twice.
 */
class MonetizationDailyRecheck extends Command
{
    protected $signature = 'monetization:daily-recheck {--limit=0 : Stop after N creators}';

    protected $description = 'Re-measure every creator against every monetization programme';

    public function handle(): int
    {
        $limit = (int) $this->option('limit');
        $count = 0;

        User::where('role', 'creator')
            ->select('id')
            ->chunkById(500, function ($users) use (&$count, $limit) {
                foreach ($users as $u) {
                    SyncCreatorMonetization::dispatch($u->id);
                    $count++;
                    if ($limit && $count >= $limit) return false;
                }
                return true;
            });

        $this->info("Queued {$count} creator evaluations.");

        return self::SUCCESS;
    }
}
