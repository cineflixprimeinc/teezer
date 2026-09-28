<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Default upload setting" - one more nullable JSON column on `users`, the
 * same shape as the App Preferences groups next to it. Powers the mobile
 * compose screen's saved defaults (Allow comments/duet/stitch/download,
 * Auto captions, High-quality upload) - set once from the dedicated
 * "Default upload setting" page, applied to every new post's compose
 * screen afterwards until changed again. See
 * ProfileController::uploadPreferencesDefaults().
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'upload_preferences')) {
                $table->json('upload_preferences')->nullable()->after('spaces_preferences');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'upload_preferences')) {
                $table->dropColumn('upload_preferences');
            }
        });
    }
};
