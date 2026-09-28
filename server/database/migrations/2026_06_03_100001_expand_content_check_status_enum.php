<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('media_content_checks')) {
            return; // table created in a separate migration; skip if not yet run
        }

        // Expand the ENUM to include 'review' and 'error' statuses used by
        // ContentCheckService. Without these values MySQL silently stores ''
        // and assertPassedForUpload would always block publishing.
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE media_content_checks DROP CONSTRAINT IF EXISTS media_content_checks_status_check');
            DB::statement("ALTER TABLE media_content_checks ADD CONSTRAINT media_content_checks_status_check
                CHECK (status IN ('pending','checking','passed','failed','review','error'))");
        } else {
            DB::statement("ALTER TABLE media_content_checks
                MODIFY status ENUM('pending','checking','passed','failed','review','error')
                NOT NULL DEFAULT 'pending'");
        }
    }

    public function down(): void
    {
        if (! Schema::hasTable('media_content_checks')) {
            return;
        }

        // Downgrade - convert any 'review'/'error' rows back to 'failed' so the
        // narrower enum is valid before we shrink it.
        DB::statement("UPDATE media_content_checks
            SET status = 'failed' WHERE status IN ('review','error')");

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE media_content_checks DROP CONSTRAINT IF EXISTS media_content_checks_status_check');
            DB::statement("ALTER TABLE media_content_checks ADD CONSTRAINT media_content_checks_status_check
                CHECK (status IN ('pending','checking','passed','failed'))");
        } else {
            DB::statement("ALTER TABLE media_content_checks
                MODIFY status ENUM('pending','checking','passed','failed')
                NOT NULL DEFAULT 'pending'");
        }
    }
};
