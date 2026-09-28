<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A DEFAULT only, not a second enforcement point: the per-story
 * stories.allow_resharing column (already checked server-side in
 * StoryController::share()/repost() and MessageController::send()) remains
 * the one thing the server actually enforces. This account-level column
 * just seeds a new story's allow_resharing switch on the composer, the same
 * way profile_discovery/show_to_search_engines etc. already work.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'stories_allow_resharing')) {
                $table->boolean('stories_allow_resharing')->default(true)->after('show_to_search_engines');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (Schema::hasColumn('users', 'stories_allow_resharing')) {
                $table->dropColumn('stories_allow_resharing');
            }
        });
    }
};
