<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Bonus coins on a pack.
 *
 * `coins` stays the coins the pack is SOLD as. The bonus is stored separately
 * rather than baked into it, because those are different facts and every
 * surface needs both: the page says "1000 + 200 bonus", the receipt says what
 * was paid for, and the wallet credits the total. Folding the bonus into
 * `coins` would make "1200" indistinguishable from a pack that simply sells
 * 1200, and the promotion would become invisible the moment it ended.
 *
 * TWO FORMS, because promotions are written both ways:
 *   bonus_coins   - a flat "+200 coins"
 *   bonus_percent - "+20%", computed off `coins`
 * Both may be set; the total is coins + bonus_coins + round(coins * pct/100).
 * The total is DERIVED, never stored - one number to change, and no chance of
 * a stored total drifting from its parts.
 *
 * `bonus_ends_at` makes a promotion self-expiring. Null means it runs until an
 * admin removes it. An expired bonus is not deleted: the row keeps its history
 * and can be switched back on for the next campaign.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('coin_packages', function (Blueprint $table) {
            $table->bigInteger('bonus_coins')->default(0)->after('coins');
            $table->decimal('bonus_percent', 5, 2)->default(0)->after('bonus_coins');
            // Free text so a campaign can read "LIMITED TIME" or "+20% EXTRA"
            // without a schema change. Null falls back to a computed label.
            $table->string('bonus_label', 40)->nullable()->after('bonus_percent');
            $table->timestamp('bonus_ends_at')->nullable()->after('bonus_label');
            $table->boolean('bonus_enabled')->default(false)->after('bonus_ends_at');
        });
    }

    public function down(): void
    {
        Schema::table('coin_packages', function (Blueprint $table) {
            $table->dropColumn([
                'bonus_coins', 'bonus_percent', 'bonus_label', 'bonus_ends_at', 'bonus_enabled',
            ]);
        });
    }
};
