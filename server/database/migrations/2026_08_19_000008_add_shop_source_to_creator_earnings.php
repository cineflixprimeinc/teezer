<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Widens creator_earnings.source to accept 'shop', so a completed Shop sale
 * can show up in Studio's Revenue Mix / earnings history the same way the
 * other programmes do - see ShopOrderController::creditSeller().
 *
 * Same DROP/ADD CONSTRAINT dance as 2026_06_02_200002_add_unlisted_status_to_
 * videos_table.php, since Laravel's enum() compiles to a CHECK constraint on
 * Postgres, not a native enum type.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE creator_earnings DROP CONSTRAINT IF EXISTS creator_earnings_source_check');
            DB::statement("ALTER TABLE creator_earnings ADD CONSTRAINT creator_earnings_source_check
                CHECK (source IN ('ad_revenue','live_gift','subscription','brand_collab','series','shop'))");
        } else {
            DB::statement("ALTER TABLE creator_earnings MODIFY source ENUM('ad_revenue','live_gift','subscription','brand_collab','series','shop') NOT NULL DEFAULT 'ad_revenue'");
        }
    }

    public function down(): void
    {
        DB::statement("UPDATE creator_earnings SET source = 'ad_revenue' WHERE source = 'shop'");
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE creator_earnings DROP CONSTRAINT IF EXISTS creator_earnings_source_check');
            DB::statement("ALTER TABLE creator_earnings ADD CONSTRAINT creator_earnings_source_check
                CHECK (source IN ('ad_revenue','live_gift','subscription','brand_collab','series'))");
        } else {
            DB::statement("ALTER TABLE creator_earnings MODIFY source ENUM('ad_revenue','live_gift','subscription','brand_collab','series') NOT NULL DEFAULT 'ad_revenue'");
        }
    }
};
