<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Teezer's cut moves from GIFT TIME to WITHDRAWAL TIME.
 *
 * Until now a gift was split the moment it landed: the receiver was credited
 * 70% and the platform booked its 30% immediately. Creators saw a balance that
 * was already net, so "you received 1,000 coins" was never the number in their
 * wallet.
 *
 * The policy is now: credit the FULL gift, and take the commission only when
 * the creator withdraws. That makes the coin balance mean exactly "what people
 * sent me", and the fee a line on the payout - which is also where a creator
 * expects to see it.
 *
 * `creator_payouts.amount` stays the GROSS the creator asked for and the number
 * their available balance is debited by; the two new columns record what was
 * taken and what is actually paid. Existing rows predate the fee, so they
 * backfill to zero commission and net == amount, which is true of them.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('creator_payouts')) {
            return;
        }

        Schema::table('creator_payouts', function (Blueprint $table) {
            if (! Schema::hasColumn('creator_payouts', 'commission_rate')) {
                // The rate AT THE TIME of the payout. Stored per row rather than
                // read back from settings, so changing the rate later cannot
                // rewrite the history of what was already paid.
                $table->decimal('commission_rate', 5, 2)->default(0)->after('amount');
            }
            if (! Schema::hasColumn('creator_payouts', 'commission_amount')) {
                $table->decimal('commission_amount', 12, 2)->default(0)->after('commission_rate');
            }
            if (! Schema::hasColumn('creator_payouts', 'net_amount')) {
                $table->decimal('net_amount', 12, 2)->default(0)->after('commission_amount');
            }
        });

        // Payouts made under the old policy had their commission taken upstream,
        // at gift time - so for them the full amount really was the net.
        DB::table('creator_payouts')
            ->where('net_amount', 0)
            ->update(['net_amount' => DB::raw('amount')]);
    }

    public function down(): void
    {
        if (! Schema::hasTable('creator_payouts')) {
            return;
        }

        Schema::table('creator_payouts', function (Blueprint $table) {
            foreach (['commission_rate', 'commission_amount', 'net_amount'] as $col) {
                if (Schema::hasColumn('creator_payouts', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
