<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A guest share has no user_id to dedupe on - only an IP, same as
 * video_views already tracks for exactly this reason (see
 * 2025_05_24_000011_create_video_views_table). Without it, VideoInteractionController
 * ::share() had no way to tell one guest tapping share once from one guest
 * (or a script) hitting the endpoint in a loop - every call unconditionally
 * incremented shares_count, straight into feed/trending ranking.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('video_shares', function (Blueprint $table) {
            $table->string('ip_address', 45)->nullable()->after('user_id');
            $table->index(['video_id', 'ip_address']);
        });
    }

    public function down(): void
    {
        Schema::table('video_shares', function (Blueprint $table) {
            $table->dropIndex(['video_id', 'ip_address']);
            $table->dropColumn('ip_address');
        });
    }
};
