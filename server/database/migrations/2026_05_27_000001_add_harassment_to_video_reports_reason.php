<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE video_reports DROP CONSTRAINT IF EXISTS video_reports_reason_check');
            DB::statement("ALTER TABLE video_reports ADD CONSTRAINT video_reports_reason_check
                CHECK (reason IN ('spam','nudity','hate','misinformation','violence','copyright','harassment','other'))");
        } else {
            DB::statement("ALTER TABLE video_reports MODIFY COLUMN reason ENUM(
                'spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'harassment', 'other'
            ) NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE video_reports DROP CONSTRAINT IF EXISTS video_reports_reason_check');
            DB::statement("ALTER TABLE video_reports ADD CONSTRAINT video_reports_reason_check
                CHECK (reason IN ('spam','nudity','hate','misinformation','violence','copyright','other'))");
        } else {
            DB::statement("ALTER TABLE video_reports MODIFY COLUMN reason ENUM(
                'spam', 'nudity', 'hate', 'misinformation', 'violence', 'copyright', 'other'
            ) NOT NULL");
        }
    }
};
