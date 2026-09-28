<?php

namespace App\Console\Commands;

use App\Models\CreatorPayout;
use App\Models\CreatorWallet;
use App\Services\GiftCommissionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Backfill gift earnings into the creator payout wallet.
 *
 * Gifts credit `wallets.earned_coin_balance` (coins). Withdrawals draw on
 * `creator_wallets.available_balance` (USD). Nothing ever moved value between
 * the two, so every gift received before that was fixed is stranded: the coins
 * are real, but the creator sees "$0.00 available" and cannot cash them out.
 *
 * This reconciles the two, once, from the SOURCE OF TRUTH rather than from a
 * running total:
 *
 *   entitled   = every completed gift RECEIVED, in coins, converted at the
 *                admin panel's coin_usd_rate
 *   accounted  = what the payout wallet has already recognised, i.e. what is
 *                available + what is pending + everything already paid out
 *   shortfall  = entitled - accounted, credited to available_balance
 *
 * Deriving `accounted` from payouts rather than from lifetime_earnings is what
 * makes this SAFE TO RUN TWICE: a second run computes a shortfall of zero. It
 * also cannot claw money back - a negative shortfall (a creator credited more
 * than their gifts justify, e.g. by an admin adjustment) is reported and left
 * alone, because this command's job is to release money that is owed, not to
 * adjudicate balances someone else set deliberately.
 *
 *   php artisan teezer:reconcile-gift-earnings --dry-run
 *   php artisan teezer:reconcile-gift-earnings
 */
class ReconcileGiftEarnings extends Command
{
    protected $signature = 'teezer:reconcile-gift-earnings
                            {--dry-run : Report what would change without writing}
                            {--user= : Restrict to one user id}';

    protected $description = 'Credit historic gift earnings into creator payout wallets (idempotent)';

    public function handle(): int
    {
        $dry  = (bool) $this->option('dry-run');
        $only = $this->option('user') !== null ? (int) $this->option('user') : null;
        $rate = GiftCommissionService::coinRate();

        $this->info(($dry ? '[DRY RUN] ' : '') . "Reconciling gift earnings at {$rate} coins = \$1");

        // Gross coins received per creator, completed gifts only. Gross, not net:
        // gifts credit in full and the commission is taken at withdrawal.
        $earned = DB::table('coin_gifts')
            ->selectRaw('receiver_id AS user_id, SUM(gross_coins) AS coins')
            ->where('status', 'completed')
            ->when($only, fn ($q) => $q->where('receiver_id', $only))
            ->groupBy('receiver_id')
            ->get();

        if ($earned->isEmpty()) {
            $this->info('No completed gifts found. Nothing to do.');
            return self::SUCCESS;
        }

        $credited = 0.0;
        $touched  = 0;
        $skipped  = 0;

        foreach ($earned as $row) {
            $userId   = (int) $row->user_id;
            $coins    = (int) $row->coins;
            $entitled = GiftCommissionService::coinsToUsd($coins);

            // The arithmetic lives in the service, which the overview endpoint
            // also calls - one implementation, so a bulk run and a lazy read
            // can never reach different answers.
            $accounted = $this->accountedFor($userId);
            $shortfall = round($entitled - $accounted, 2);

            if ($shortfall <= 0.005) {
                $skipped++;
                continue;
            }

            if (! $dry) {
                // Recomputed inside its own locked transaction rather than
                // trusting the figure read above.
                $shortfall = GiftCommissionService::reconcilePayoutWallet($userId);
                if ($shortfall <= 0.005) {
                    $skipped++;
                    continue;
                }
            }

            $touched++;
            $credited += $shortfall;
            $this->line(sprintf(
                '  user %-8d %8d coins  entitled $%-10s accounted $%-10s  → +$%s',
                $userId,
                $coins,
                number_format($entitled, 2),
                number_format($accounted, 2),
                number_format($shortfall, 2),
            ));
        }

        $this->newLine();
        $this->info(sprintf(
            '%s %d creator(s) credited $%s; %d already reconciled.',
            $dry ? 'Would have' : 'Credited',
            $touched,
            number_format($credited, 2),
            $skipped,
        ));

        if ($dry) {
            $this->comment('Dry run - nothing was written. Re-run without --dry-run to apply.');
        }

        return self::SUCCESS;
    }

    /**
     * What the payout side has already recognised for this creator.
     *
     * Read-only, for the report and the dry run; the write path recomputes it
     * under a lock inside the service. Money that has LEFT still counts - it
     * was credited, then spent.
     *
     * Must stay in step with GiftCommissionService::reconcilePayoutWallet(),
     * which explains why only finished payouts are summed: in-flight ones are
     * already carried by `pending_balance`, and the terminal status is
     * `completed`, never `paid`.
     */
    private function accountedFor(int $userId): float
    {
        $wallet = CreatorWallet::where('user_id', $userId)->first();
        $paidOut = (float) CreatorPayout::where('user_id', $userId)
            ->whereIn('status', ['completed', 'paid'])
            ->sum('amount');

        return round(
            (float) ($wallet->available_balance ?? 0)
            + (float) ($wallet->pending_balance ?? 0)
            + $paidOut,
            2,
        );
    }
}
