<?php

namespace App\Services;

use App\Models\AdminCoinSetting;
use App\Models\PremiumCoinGrant;
use App\Models\Subscription;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Database\QueryException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Premium's monthly coin bonus.
 *
 * A member is paid on their subscription's ANNIVERSARY day, not on the 1st:
 * period 0 lands the moment they subscribe, period 1 a month later, and so on.
 * That is why the ledger keys on "months elapsed since started_at" rather than a
 * calendar month - a calendar key would hand someone who subscribed on the 31st
 * two payouts in two days.
 *
 * The coins are credited to `coins_balance`, the SPENDABLE balance, deliberately.
 * `wallets.bonus_coin_balance` looks like the natural home, but nothing in the
 * app can spend it: GiftCommissionService checks and debits `coins_balance` only,
 * so a bonus paid into that column would be a number the user could look at and
 * never use. The grant is instead tagged in the ledger as `premium_bonus`, which
 * keeps it auditable without inventing a currency that does not work.
 */
class PremiumBonusService
{
    /** How many monthly drops a plan is entitled to over its term. */
    private const PERIODS = [
        'monthly' => 1,   // period 0 only
        'annual'  => 12,  // periods 0..11
    ];

    public function coinsPerMonth(): int
    {
        return (int) AdminCoinSetting::getValue('premium_bonus_coins', 200);
    }

    /**
     * Pay every month this subscription is owed and has not yet been paid.
     *
     * Safe to call as often as you like - the unique key on
     * (subscription_id, period) is what stops a double payout, not the caller.
     *
     * @return int coins actually granted by this call
     */
    public function grantDue(Subscription $sub): int
    {
        $coins = $this->coinsPerMonth();
        if ($coins <= 0 || !$sub->isActive()) {
            return 0;
        }

        $maxPeriods = self::PERIODS[$sub->plan] ?? 1;

        // Whole months since it started. A user two days in is owed period 0 only.
        $elapsed = $sub->started_at
            ? (int) floor($sub->started_at->diffInMonths(now()))
            : 0;

        $lastPeriod = min($elapsed, $maxPeriods - 1);

        $granted = 0;
        for ($period = 0; $period <= $lastPeriod; $period++) {
            $granted += $this->grantPeriod($sub, $period, $coins);
        }

        return $granted;
    }

    /** @return int coins granted (0 if this period was already paid) */
    private function grantPeriod(Subscription $sub, int $period, int $coins): int
    {
        try {
            return DB::transaction(function () use ($sub, $period, $coins) {
                // Claim the period FIRST. If a concurrent run already has it, the
                // unique index throws here and we bail before touching the wallet.
                PremiumCoinGrant::create([
                    'user_id'         => $sub->user_id,
                    'subscription_id' => $sub->id,
                    'period'          => $period,
                    'coins'           => $coins,
                    'granted_at'      => now(),
                ]);

                $wallet = Wallet::firstOrCreate(
                    ['user_id' => $sub->user_id],
                    ['balance' => 0, 'coins_balance' => 0],
                );
                $wallet = Wallet::where('id', $wallet->id)->lockForUpdate()->first();

                $wallet->increment('coins_balance', $coins);
                $newBalance = $wallet->fresh()->coins_balance;

                WalletTransaction::create([
                    'wallet_id'           => $wallet->id,
                    'type'                => 'premium_bonus',
                    'description'         => "Premium monthly bonus - {$coins} RC",
                    'amount'              => round($coins / 100, 2),
                    'gross_coins'         => $coins,
                    'net_coins'           => $coins,
                    'balance_after_coins' => $newBalance,
                    'status'              => 'completed',
                    'reference_id'        => "premium_{$sub->id}_p{$period}",
                ]);

                return $coins;
            });
        } catch (QueryException $e) {
            // Duplicate key = this month was already paid. That is the design, not
            // an error, so it is not worth an exception upstream.
            if ($this->isDuplicate($e)) {
                return 0;
            }

            Log::error('Premium bonus grant failed', [
                'subscription_id' => $sub->id,
                'period'          => $period,
                'error'           => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    private function isDuplicate(QueryException $e): bool
    {
        // 23505 = unique_violation (Postgres), 23000 = integrity constraint (MySQL).
        return in_array($e->getCode(), ['23505', '23000'], true);
    }
}
