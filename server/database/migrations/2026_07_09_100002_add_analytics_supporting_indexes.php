<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Studio Analytics retention curve now ranges video_watch_sessions by
        // started_at (see StudioAnalyticsController::buildCreatorRetention) -
        // the existing indexes (video_id+view_counted/user_id/ip_hash) don't
        // cover that access pattern.
        Schema::table('video_watch_sessions', function (Blueprint $table) {
            $table->index(['video_id', 'started_at']);
        });

        // Supports the country/device filter fallback path in
        // StudioAnalyticsController (bypasses creator_analytics and queries
        // video_views directly when a non-default filter is selected).
        Schema::table('video_views', function (Blueprint $table) {
            $table->index(['video_id', 'country']);
            $table->index(['video_id', 'source']);
        });
    }

    public function down(): void
    {
        Schema::table('video_watch_sessions', function (Blueprint $table) {
            $table->dropIndex(['video_id', 'started_at']);
        });
        Schema::table('video_views', function (Blueprint $table) {
            $table->dropIndex(['video_id', 'country']);
            $table->dropIndex(['video_id', 'source']);
        });
    }
};
