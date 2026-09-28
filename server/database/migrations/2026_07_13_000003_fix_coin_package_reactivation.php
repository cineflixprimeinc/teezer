<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Hotfix: 2026_07_13_000002 left the coin store with zero active packages.
 *
 * It reactivated the legacy ladder with `whereNotIn('icon', $giftSlugs)`, but the
 * legacy 100 rows carry icon = NULL, and in SQL's three-valued logic
 * `NULL NOT IN (...)` is UNKNOWN, never TRUE - so the WHERE matched nothing and the
 * old packs stayed deactivated. (2026_07_13_000001's down() has the same latent bug.)
 *
 * The legacy ladder is identified by icon IS NULL, which is exactly what distinguishes
 * it: every gift-pack row stores its slug in `icon`.
 */
return new class extends Migration
{
    /** sort_order of the six packs the coin store shows up-front. */
    private const FRONT_VISIBLE = [1, 9, 14, 18, 24, 34];

    public function up(): void
    {
        DB::transaction(function () {
            DB::table('coin_packages')->whereNull('icon')
                ->update(['is_active' => true, 'updated_at' => now()]);

            DB::table('coin_packages')->whereNull('icon')
                ->whereIn('sort_order', self::FRONT_VISIBLE)
                ->update(['is_front_visible' => true, 'updated_at' => now()]);

            // Belt and braces: the 200 gift-slug rows must stay retired as packs.
            DB::table('coin_packages')->whereNotNull('icon')
                ->update(['is_active' => false, 'is_front_visible' => false, 'updated_at' => now()]);
        });
    }

    public function down(): void
    {
        DB::table('coin_packages')->whereNull('icon')
            ->update(['is_active' => false, 'is_front_visible' => false, 'updated_at' => now()]);
    }
};
