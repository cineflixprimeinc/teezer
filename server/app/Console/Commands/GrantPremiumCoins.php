<?php

namespace App\Console\Commands;

use App\Models\Subscription;
use App\Services\PremiumBonusService;
use Illuminate\Console\Command;

/**
 * Pays the Premium monthly coin bonus.
 *
 * Runs daily rather than monthly on purpose: members are paid on their own
 * anniversary day, so on any given day some subset is due. The service is
 * idempotent (unique key on subscription+period), so running it twice in a day,
 * or re-running it after a failure, cannot double-pay anyone.
 */
class GrantPremiumCoins extends Command
{
    protected $signature = 'premium:grant-coins {--dry-run : Report who is owed without paying anyone}';

    protected $description = 'Grant the monthly coin bonus to active Premium members';

    public function handle(PremiumBonusService $bonus): int
    {
        $coins = $bonus->coinsPerMonth();

        if ($coins <= 0) {
            $this->warn('premium_bonus_coins is 0 - nothing to grant.');
            return self::SUCCESS;
        }

        $dryRun = (bool) $this->option('dry-run');

        $subs = Subscription::where('status', 'active')
            ->where('expires_at', '>', now())
            ->cursor();

        $paidUsers = 0;
        $paidCoins = 0;

        foreach ($subs as $sub) {
            if ($dryRun) {
                $this->line("would check subscription #{$sub->id} (user {$sub->user_id}, {$sub->plan})");
                continue;
            }

            // One member's failure must not stop the run for everybody else.
            try {
                $granted = $bonus->grantDue($sub);
            } catch (\Throwable $e) {
                $this->error("subscription #{$sub->id}: {$e->getMessage()}");
                continue;
            }

            if ($granted > 0) {
                $paidUsers++;
                $paidCoins += $granted;
                $this->line("granted {$granted} RC to user {$sub->user_id}");
            }
        }

        $this->info($dryRun
            ? 'Dry run complete.'
            : "Granted {$paidCoins} RC to {$paidUsers} member(s).");

        return self::SUCCESS;
    }
}
