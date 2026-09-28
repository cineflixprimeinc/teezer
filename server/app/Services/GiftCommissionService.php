<?php

namespace App\Services;

use App\Models\AdminCoinSetting;
use App\Models\AdminCommission;
use App\Models\CoinGift;
use App\Models\CreatorPayout;
use App\Models\CreatorWallet;
use App\Models\Wallet;
use App\Models\WalletTransaction;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class GiftCommissionService
{
    /**
     * Coins per USD, as configured in the admin panel's payment settings.
     *
     * The default matches the panel's own (100 coins = $1). Guarded against a
     * zero or negative value, which would otherwise divide by zero and take
     * every gift down with it.
     */
    public static function coinRate(): int
    {
        $rate = (int) AdminCoinSetting::getValue('coin_usd_rate', 100);
        return $rate > 0 ? $rate : 100;
    }

    /**
     * Coins → USD at the configured rate, rounded to the cent.
     *
     * One function so the website, the app, the ledger and the payout wallet
     * cannot disagree about what a balance is worth - they were each doing
     * their own `/ 100` before, which silently ignored the admin's rate.
     */
    public static function coinsToUsd(int $coins): float
    {
        return round($coins / self::coinRate(), 2);
    }

    /**
     * Make the payout wallet agree with the gifts actually received.
     *
     * Gifts credit coins; withdrawals draw on `creator_wallets`. Anything
     * received before those two were connected is stranded - real coins, but
     * "$0.00 available" and no way to cash out. Rather than trust a running
     * total that has already proven it can drift, this recomputes from source:
     *
     *   entitled  = every completed gift RECEIVED, in coins, at coin_usd_rate
     *   accounted = available + pending + everything already paid out
     *   shortfall = entitled - accounted
     *
     * Deriving `accounted` from payouts is what makes it IDEMPOTENT: run it
     * twice and the second pass finds nothing. It never claws money back - a
     * negative shortfall means someone was credited beyond their gifts (an
     * admin adjustment), which is not this function's to undo.
     *
     * Called on read as well as from the artisan command, so a creator's
     * balance is right the moment the code ships rather than when someone
     * remembers to run a script.
     *
     * @return float The amount credited (0.0 when already reconciled).
     */
    public static function reconcilePayoutWallet(int $userId): float
    {
        return (float) DB::transaction(function () use ($userId) {
            $coins = (int) CoinGift::where('receiver_id', $userId)
                ->where('status', 'completed')
                ->sum('gross_coins');

            $entitled = self::coinsToUsd($coins);

            CreatorWallet::firstOrCreate(
                ['user_id' => $userId],
                ['available_balance' => 0, 'pending_balance' => 0, 'lifetime_earnings' => 0],
            );
            // Locked after firstOrCreate so a freshly made row is locked too.
            $wallet = CreatorWallet::where('user_id', $userId)->lockForUpdate()->first();
            if (! $wallet) {
                return 0.0;
            }

            /*
             * Money that has LEFT still counts as recognised: it was credited,
             * then spent. Only payouts that have actually left qualify.
             *
             * A payout still in flight is NOT counted here, because
             * `requestWithdraw` already moved it into `pending_balance` - it is
             * on the line above. Counting it in both places inflated
             * `accounted` by the in-flight amount, so genuinely new gift income
             * failed to credit until the payout resolved.
             *
             * `completed` is the status the admin panel actually writes.
             * `paid` never was: this filter used to read ['pending',
             * 'processing', 'paid'], so a finished payout matched nothing,
             * dropped out of `accounted`, and the shortfall re-opened by
             * exactly the amount withdrawn. Since this runs on every read of
             * the monetization page, a creator could withdraw, be paid, reopen
             * the app and find the money back - repeatably. It is listed
             * alongside `completed` only to cover any legacy row.
             */
            $paidOut = (float) CreatorPayout::where('user_id', $userId)
                ->whereIn('status', ['completed', 'paid'])
                ->sum('amount');

            $accounted = round(
                (float) $wallet->available_balance + (float) $wallet->pending_balance + $paidOut,
                2,
            );

            $shortfall = round($entitled - $accounted, 2);
            // Half a cent of tolerance, so float noise never writes a row.
            if ($shortfall <= 0.005) {
                return 0.0;
            }

            $wallet->increment('available_balance', $shortfall);
            $wallet->increment('lifetime_earnings', $shortfall);

            return $shortfall;
        });
    }

    /**
     * Process a coin gift from sender to receiver.
     *
     * 1. Validate sender balance.
     * 2. Deduct full coins from sender.
     * 3. Credit the FULL amount to the receiver's earned_coin_balance.
     * 4. Persist the gift record and both transactions.
     *
     * The platform commission is NOT taken here. It applies at withdrawal
     * (StudioMonetizationController::requestWithdraw), so a creator's coin
     * balance is exactly what people sent them and the fee is a line on the
     * payout rather than an invisible haircut on every gift.
     *
     * Uses a DB transaction to ensure atomicity.
     *
     * @param  int    $senderId
     * @param  int    $receiverId
     * @param  int    $grossCoins   Coins sender is sending (full amount).
     * @param  string $giftName     Display name of the gift.
     * @param  string $reference    Unique external reference to prevent double-processing.
     * @param  int|null $videoId
     * @param  int|null $liveId
     * @return array{
     *   gift_id: int,
     *   gross_coins: int,
     *   commission_coins: int,
     *   net_coins: int,
     *   net_value_usd: float,
     *   sender_coin_balance: int,
     *   receiver_earned_balance: int,
     *   receiver_wallet_usd: float,
     * }
     * @throws \Exception
     */
    public function processReceivedGift(
        int    $senderId,
        int    $receiverId,
        int    $grossCoins,
        string $giftName    = 'Gift',
        string $reference   = '',
        ?int   $videoId     = null,
        ?int   $liveId      = null,
    ): array {
        if ($grossCoins <= 0) {
            throw new \InvalidArgumentException('Coin amount must be positive.');
        }

        if (empty($reference)) {
            $reference = 'gift_' . Str::uuid()->toString();
        }

        return DB::transaction(function () use (
            $senderId, $receiverId, $grossCoins, $giftName, $reference, $videoId, $liveId
        ) {
            // Serialize concurrent sends by the same user on their wallet row FIRST.
            // (Two gifts from one sender can't interleave past this lock, which is
            // what actually prevents a double-spend.) Lock the lower user_id first
            // so two users gifting each other can't deadlock.
            [$firstId, $secondId] = $senderId <= $receiverId
                ? [$senderId, $receiverId]
                : [$receiverId, $senderId];
            Wallet::where('user_id', $firstId)->lockForUpdate()->firstOrFail();
            if ($secondId !== $firstId) {
                Wallet::where('user_id', $secondId)->lockForUpdate()->firstOrFail();
            }

            // Idempotency / double-submit guard. NOTE: a plain exists() - never
            // lockForUpdate()->exists(), which compiles to SELECT EXISTS(... FOR
            // UPDATE) and PostgreSQL rejects (FOR UPDATE isn't allowed inside an
            // aggregate/EXISTS), aborting the whole transaction (SQLSTATE 25P02).
            if (WalletTransaction::where('reference_id', $reference)->exists()) {
                throw new \RuntimeException('Duplicate gift reference: ' . $reference);
            }

            $senderWallet   = Wallet::where('user_id', $senderId)->firstOrFail();
            $receiverWallet = Wallet::where('user_id', $receiverId)->firstOrFail();

            if ($senderWallet->coins_balance < $grossCoins) {
                throw new \Exception('Insufficient coin balance. Available: ' . $senderWallet->coins_balance);
            }

            /*
             * NOTHING is deducted here any more.
             *
             * The platform's cut used to be taken the moment a gift landed, so a
             * creator's balance was already net and "you received 1,000 coins"
             * was never the number in their wallet. The fee now applies at
             * WITHDRAWAL (StudioMonetizationController::requestWithdraw), which
             * makes the coin balance mean exactly what people sent.
             *
             * The rate is still recorded on the gift for reference - it is what
             * the fee WOULD be at today's setting - but no coins move for it and
             * no AdminCommission row is booked until the money actually leaves.
             */
            $commissionRate  = (float) AdminCoinSetting::getValue('commission_rate', 30);
            $commissionCoins = 0;
            $netCoins        = $grossCoins;
            // The admin panel's own rate (coins per USD), not a hard-coded 100.
            // It is configurable on the website and was being ignored here, so
            // changing it moved the website's numbers and left the app's alone.
            $grossUsd        = self::coinsToUsd($grossCoins);
            $netUsd          = $grossUsd;
            $platformUsd     = 0.0;

            // ── Deduct from sender ────────────────────────────────────────────
            $senderWallet->decrement('coins_balance', $grossCoins);
            $senderWallet->increment('total_spent_coins', $grossCoins);
            $senderNewBalance = $senderWallet->fresh()->coins_balance;

            // ── Credit receiver ───────────────────────────────────────────────
            $receiverWallet->increment('earned_coin_balance', $netCoins);
            $receiverWallet->increment('total_received_coins', $grossCoins);
            $receiverWallet->increment('total_commission_coins', $commissionCoins);
            $receiverWallet->increment('total_net_earned_coins', $netCoins);
            $receiverFresh    = $receiverWallet->fresh();
            $newWalletUsd     = self::coinsToUsd((int) $receiverFresh->earned_coin_balance);
            $receiverWallet->update(['wallet_balance_usd' => $newWalletUsd]);

            /*
             * Push the earning into the PAYOUT wallet as well.
             *
             * `wallets` (coins) and `creator_wallets` (withdrawable USD) are two
             * separate systems, and nothing connected them: gifts credited coins
             * only, so a creator with a full coin balance still saw "$0.00
             * available" on the withdraw screen and could never cash a gift out.
             * Only the admin panel had ever written to this table.
             *
             * Credited GROSS, like the coins - the commission is taken on the way
             * out, in requestWithdraw.
             */
            $creatorWallet = CreatorWallet::firstOrCreate(
                ['user_id' => $receiverId],
                ['available_balance' => 0, 'pending_balance' => 0, 'lifetime_earnings' => 0],
            );
            $creatorWallet->increment('available_balance', $grossUsd);
            $creatorWallet->increment('lifetime_earnings', $grossUsd);

            // ── Gift record ───────────────────────────────────────────────────
            $gift = CoinGift::create([
                'sender_id'           => $senderId,
                'receiver_id'         => $receiverId,
                'video_id'            => $videoId,
                'live_id'             => $liveId,
                'gift_name'           => $giftName,
                'gross_coins'         => $grossCoins,
                'commission_rate'     => $commissionRate,
                'commission_coins'    => $commissionCoins,
                'net_coins'           => $netCoins,
                'gross_value_usd'     => $grossUsd,
                'net_value_usd'       => $netUsd,
                'platform_revenue_usd'=> $platformUsd,
                'status'              => 'completed',
                'reference_id'        => $reference,
            ]);

            // ── Sender transaction ────────────────────────────────────────────
            WalletTransaction::create([
                'wallet_id'             => $senderWallet->id,
                'type'                  => 'gift_sent',
                'description'           => "Gift sent: {$giftName}",
                'amount'                => 0,
                'gross_coins'           => -$grossCoins,
                'commission_coins'      => 0,
                'net_coins'             => -$grossCoins,
                'balance_after_coins'   => $senderNewBalance,
                'wallet_balance_after_usd' => 0,
                'status'                => 'completed',
                'reference_id'          => 'sender_' . $reference,
                'metadata'              => json_encode(['gift_id' => $gift->id]),
            ]);

            // ── Receiver transaction ──────────────────────────────────────────
            WalletTransaction::create([
                'wallet_id'             => $receiverWallet->id,
                'type'                  => 'gift_received',
                // No "(30% commission deducted)" any more - nothing is deducted
                // here, and saying so on a full-value credit was the confusing part.
                'description'           => "Gift received: {$giftName}",
                'amount'                => $netUsd,
                'gross_coins'           => $grossCoins,
                'commission_coins'      => $commissionCoins,
                'net_coins'             => $netCoins,
                'balance_after_coins'   => $receiverFresh->earned_coin_balance,
                'wallet_balance_after_usd' => $newWalletUsd,
                'status'                => 'completed',
                'reference_id'          => $reference,
                'metadata'              => json_encode(['gift_id' => $gift->id, 'commission_rate' => $commissionRate]),
            ]);

            // No AdminCommission row here. The platform earns its cut when the
            // creator withdraws, and booking revenue on a gift that may never be
            // withdrawn would overstate it. See requestWithdraw().

            return [
                'gift_id'                 => $gift->id,
                'gross_coins'             => $grossCoins,
                'commission_coins'        => $commissionCoins,
                'net_coins'               => $netCoins,
                'net_value_usd'           => $netUsd,
                'sender_coin_balance'     => $senderNewBalance,
                'receiver_earned_balance' => $receiverFresh->earned_coin_balance,
                'receiver_wallet_usd'     => $newWalletUsd,
            ];
        });
    }

    /**
     * Credit coins from a successfully paid order.
     * Called after payment webhook confirmation.
     */
    public function creditPurchasedCoins(int $userId, int $coins, int $orderId, int $bonusCoins = 0): void
    {
        $bonusCoins = max(0, $bonusCoins);

        DB::transaction(function () use ($userId, $coins, $orderId, $bonusCoins) {
            $wallet = Wallet::where('user_id', $userId)->lockForUpdate()->firstOrFail();

            /**
             * Spendable balance gets base + bonus, because a bonus coin spends
             * like any other. The two counters beside it stay honest about
             * where they came from: total_purchased_coins is what was PAID for
             * (revenue, and what a refund would reverse), bonus_coin_balance is
             * what was given away. Folding the bonus into total_purchased_coins
             * would overstate revenue by exactly the amount of every promotion.
             */
            $wallet->increment('coins_balance', $coins + $bonusCoins);
            $wallet->increment('total_purchased_coins', $coins);
            if ($bonusCoins > 0) {
                $wallet->increment('bonus_coin_balance', $bonusCoins);
            }
            $newBalance = $wallet->fresh()->coins_balance;

            WalletTransaction::create([
                'wallet_id'           => $wallet->id,
                'type'                => 'coin_purchase',
                'description'         => $bonusCoins > 0
                    ? "Purchased {$coins} RC + {$bonusCoins} bonus"
                    : "Purchased {$coins} RC",
                'amount'              => self::coinsToUsd($coins),
                // gross is what was paid for; net is what landed in the
                // wallet. The gap between them IS the bonus, which is what
                // makes promotions auditable from the ledger alone.
                'gross_coins'         => $coins,
                'net_coins'           => $coins + $bonusCoins,
                'balance_after_coins' => $newBalance,
                'status'              => 'completed',
                'reference_id'        => 'order_' . $orderId,
            ]);
        });
    }
}
