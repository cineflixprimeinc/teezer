<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-follow "notify me when this creator posts" flag - the profile
 * page's bell icon, distinct from the global push_creator preference in
 * notification_preferences (Settings > Notifications), which is a
 * blanket on/off for every creator you follow. This is the per-account
 * override real apps (Instagram's "Turn on Post Notifications") use -
 * tapping the bell for one specific creator notifies you about THEM
 * regardless of the global switch, since tapping it is an explicit,
 * deliberate request (see NotifyFollowersOfNewPost's own doc comment).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('followers', function (Blueprint $table) {
            $table->boolean('notify_posts')->default(false)->after('status');
        });
    }

    public function down(): void
    {
        Schema::table('followers', function (Blueprint $table) {
            $table->dropColumn('notify_posts');
        });
    }
};
