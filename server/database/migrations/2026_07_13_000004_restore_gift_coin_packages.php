<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Put the 200 gift-icon coin packages back in the coin store.
 *
 * 2026_07_13_000002 retired them in favour of the legacy 100-pack ladder, on the
 * reasoning that the 200 icons are gifts and shouldn't also be packs. That call is
 * reversed here: the coin store sells the 200 packs (as it did after 2026_07_13_000001),
 * and the 200 ALSO exist as USD-priced gifts in the `gifts` table. Two catalogs over the
 * same icons - buying a pack gets you coins, sending a gift spends them.
 *
 * The packs' own coins/price_usd/badge are untouched and always have been: 000002 and
 * 000003 only ever flipped is_active/is_front_visible, so the original ladder
 * (100 RC / $0.99 … 260,000 RC / $2,000, with the log bonus) is still on these rows.
 *
 * The legacy 100 are deactivated, never deleted - coin_orders restrict-FKs them.
 * They are identified by `icon IS NULL`; do NOT use whereNotIn('icon', ...), because
 * `NULL NOT IN (...)` is UNKNOWN and matches nothing (that bug is what 000003 repaired).
 */
return new class extends Migration
{
    /** The 5 packs the coin store surfaces up-front, by slug (badge rows from 000001). */
    private const FRONT_VISIBLE = ['heart-ribbon', 'palm-island', 'crystal-shard', 'yacht', 'crystal-tree'];

    public function up(): void
    {
        DB::transaction(function () {
            // Legacy ladder steps back down.
            DB::table('coin_packages')->whereNull('icon')
                ->update(['is_active' => false, 'is_front_visible' => false, 'updated_at' => now()]);

            // The 200 gift packs come back.
            DB::table('coin_packages')->whereNotNull('icon')
                ->update(['is_active' => true, 'is_front_visible' => false, 'updated_at' => now()]);

            DB::table('coin_packages')->whereIn('icon', self::FRONT_VISIBLE)
                ->update(['is_front_visible' => true, 'updated_at' => now()]);
        });
    }

    public function down(): void
    {
        DB::transaction(function () {
            DB::table('coin_packages')->whereNotNull('icon')
                ->update(['is_active' => false, 'is_front_visible' => false, 'updated_at' => now()]);

            DB::table('coin_packages')->whereNull('icon')
                ->update(['is_active' => true, 'updated_at' => now()]);

            DB::table('coin_packages')->whereNull('icon')
                ->whereIn('sort_order', [1, 9, 14, 18, 24, 34])
                ->update(['is_front_visible' => true, 'updated_at' => now()]);
        });
    }
};
