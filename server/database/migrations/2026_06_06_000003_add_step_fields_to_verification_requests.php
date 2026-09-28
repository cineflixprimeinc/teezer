<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Add 'draft' to status enum and change default so new step-based drafts use 'draft'
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_status_check');
            DB::statement("ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_status_check
                CHECK (status IN ('draft','pending','approved','rejected'))");
            DB::statement("ALTER TABLE verification_requests ALTER COLUMN status SET DEFAULT 'draft'");
        } else {
            DB::statement("ALTER TABLE verification_requests MODIFY COLUMN status ENUM('draft','pending','approved','rejected') NOT NULL DEFAULT 'draft'");
        }

        Schema::table('verification_requests', function (Blueprint $table) {
            $table->string('plan_id', 20)->nullable()->after('user_id');
            // plan_selected → account_checked → documents_uploaded (then status flips to pending on submit)
            $table->string('verification_step', 30)->nullable()->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('verification_requests', function (Blueprint $table) {
            $table->dropColumn(['plan_id', 'verification_step']);
        });
        if (DB::getDriverName() === 'pgsql') {
            DB::statement('ALTER TABLE verification_requests DROP CONSTRAINT IF EXISTS verification_requests_status_check');
            DB::statement("ALTER TABLE verification_requests ADD CONSTRAINT verification_requests_status_check
                CHECK (status IN ('pending','approved','rejected'))");
            DB::statement("ALTER TABLE verification_requests ALTER COLUMN status SET DEFAULT 'pending'");
        } else {
            DB::statement("ALTER TABLE verification_requests MODIFY COLUMN status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending'");
        }
    }
};
