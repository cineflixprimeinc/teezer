<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tracks when a "X viewed your profile" notification was last sent for a given
 * (profile_user_id, viewer_id) pair - separate from last_viewed_at, which tracks
 * raw view activity and updates on every visit. notified_at only advances when a
 * notification actually fires, so repeat views inside the cooldown window keep
 * bumping last_viewed_at (accurate "last seen" data) without re-notifying.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('profile_views')) {
            return;
        }

        Schema::table('profile_views', function (Blueprint $table) {
            if (!Schema::hasColumn('profile_views', 'notified_at')) {
                // Nullable, defaults to NULL for both new and existing rows - existing
                // pairs (which predate this system) will send exactly one notification
                // on their very next view instead of silently going quiet.
                $table->timestamp('notified_at')->nullable()->after('last_viewed_at');
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasTable('profile_views') && Schema::hasColumn('profile_views', 'notified_at')) {
            Schema::table('profile_views', function (Blueprint $table) {
                $table->dropColumn('notified_at');
            });
        }
    }
};
