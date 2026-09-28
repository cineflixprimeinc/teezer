<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marks an account as a read-only demo login.
 *
 * A demo account is a real admin in every respect except that it cannot WRITE
 * through the admin panel - it exists so a prospective buyer can be handed
 * credentials and shown the whole panel without being able to suspend a user,
 * revoke a licence or rotate a key.
 *
 * A column rather than a role: `admin` and `super_admin` already carry meaning
 * throughout the codebase (ApiAdminMiddleware, the profile dropdown, ~287
 * routes), and adding a third role would mean auditing every one of those
 * checks. A flag layers on top - a demo user IS an admin, and is additionally
 * barred from writing.
 *
 * Defaults false, so every existing account is unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('is_demo')->default(false)->after('role');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('is_demo');
        });
    }
};
