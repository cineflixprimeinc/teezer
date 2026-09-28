<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The Spaces settings sheet - one more nullable JSON column on `users`, the same
 * shape as the App Preferences groups next to it. Account-level, so what a
 * listener decides here follows them across devices; per-room settings stay on
 * the room (see add_settings_to_spaces).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'spaces_preferences')) {
                $table->json('spaces_preferences')->nullable()->after('ai_preferences');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'spaces_preferences')) {
                $table->dropColumn('spaces_preferences');
            }
        });
    }
};
