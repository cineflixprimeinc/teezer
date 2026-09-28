<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Change social_links.platform from a restricted ENUM to a VARCHAR(50).
 * This allows facebook, other, and any future platform without another migration.
 */
return new class extends Migration
{
    public function up(): void
    {
        // MySQL requires modifyColumn to change an enum - use raw DDL for safety.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE social_links DROP CONSTRAINT IF EXISTS social_links_platform_check');
            DB::statement('ALTER TABLE social_links ALTER COLUMN platform TYPE varchar(50)');
        } else {
            DB::statement('ALTER TABLE social_links MODIFY platform VARCHAR(50) NOT NULL');
        }
    }

    public function down(): void
    {
        // Restore original enum (rows with unknown platforms will be dropped first).
        DB::statement("
            DELETE FROM social_links
            WHERE platform NOT IN ('instagram','youtube','tiktok','telegram','whatsapp','twitter','website')
        ");
        if (DB::getDriverName() === 'pgsql') {
            DB::statement("ALTER TABLE social_links ADD CONSTRAINT social_links_platform_check
                CHECK (platform IN ('instagram','youtube','tiktok','telegram','whatsapp','twitter','website'))");
        } else {
            DB::statement("
                ALTER TABLE social_links
                MODIFY platform ENUM('instagram','youtube','tiktok','telegram','whatsapp','twitter','website') NOT NULL
            ");
        }
    }
};
