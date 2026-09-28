<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check');
            DB::statement("ALTER TABLE videos ADD CONSTRAINT videos_status_check
                CHECK (status IN ('draft','scheduled','published','private','unlisted','removed'))");
        } else {
            DB::statement("ALTER TABLE videos MODIFY status ENUM('draft','scheduled','published','private','unlisted','removed') NOT NULL DEFAULT 'published'");
        }
    }

    public function down(): void
    {
        DB::statement("UPDATE videos SET status = 'private' WHERE status = 'unlisted'");
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE videos DROP CONSTRAINT IF EXISTS videos_status_check');
            DB::statement("ALTER TABLE videos ADD CONSTRAINT videos_status_check
                CHECK (status IN ('draft','scheduled','published','private','removed'))");
        } else {
            DB::statement("ALTER TABLE videos MODIFY status ENUM('draft','scheduled','published','private','removed') NOT NULL DEFAULT 'published'");
        }
    }
};
