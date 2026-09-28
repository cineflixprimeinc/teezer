<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Reprice the 200 coin packages to the design sheet: $0.19 … $2,000.00, serial-wise.
 *
 * Prices and coins are copied from the `gifts` table rather than retyped, joined on
 * coin_packages.icon = gifts.slug. gifts already holds exactly this ladder (seeded from
 * the same design sheet by 000002), so sourcing from it means the two catalogs cannot
 * drift apart - a pack and its gift always agree.
 *
 * WHY COINS MOVE WITH THE PRICE, AND ARE NOT LEFT ALONE
 *
 * A package sells coins for dollars; a withdrawal turns coins back into dollars. Both
 * ends must use the same exchange rate or the difference is free money. The payout end
 * is fixed at 100 RC = $1 (GiftCommissionService: wallet_balance_usd = earned_coins/100).
 * Had the old coin counts been kept against these new prices, pack #1 would sell 100 RC
 * for $0.19 - and 100 RC gifted to a second account yields 70 RC after the 30% commission,
 * i.e. $0.70 withdrawable. Pay $0.19, withdraw $0.70, repeat. So the buy rate is held at
 * the payout rate: coins = price * 100.
 *
 * Consequence, by design: the bulk bonus is gone (every pack is a flat $0.01/RC), so the
 * "+X% bonus" pill on the tiles stops rendering - bonusPct() computes it from what the
 * server actually sells and now returns 0.
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::transaction(function () {
            // Postgres UPDATE ... FROM. Only the 200 gift-slug packages have an icon;
            // the legacy 100 carry icon = NULL and are left untouched.
            DB::statement("
                UPDATE coin_packages cp
                   SET price_usd  = g.cash_value,
                       coins      = g.coin_value,
                       updated_at = NOW()
                  FROM gifts g
                 WHERE cp.icon IS NOT NULL
                   AND cp.icon = g.slug
            ");
        });
    }

    public function down(): void
    {
        // The pre-design ladder from 000001 (100 RC / $0.99 … 260,000 RC / $2,000) is not
        // reconstructable from the gifts table, so it is not restored here. Re-run
        // 2026_07_13_000001's generator if that ladder is ever needed again.
    }
};
