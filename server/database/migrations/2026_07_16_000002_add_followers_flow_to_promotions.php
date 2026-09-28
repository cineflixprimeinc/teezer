<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "More Followers" campaigns promote a profile (or up to 3 videos) instead of a
 * single video creative, and use a follow-button label instead of a link CTA.
 * These columns store what that goal-specific wizard flow collects.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            // 'profile' = promote the whole profile; 'videos' = promote up to 3 videos.
            if (! Schema::hasColumn('promotions', 'promote_target')) {
                $table->string('promote_target', 20)->nullable()->after('video_id');
            }
            // When promoting videos, the ids the advertiser picked (the promotion's
            // video_id holds the first/anchor one for the existing single-video pipeline).
            if (! Schema::hasColumn('promotions', 'promoted_video_ids')) {
                $table->json('promoted_video_ids')->nullable()->after('promote_target');
            }
            // Follow-card button label for follower campaigns (Follow / Follow Creator / …).
            if (! Schema::hasColumn('promotions', 'follow_button_text')) {
                $table->string('follow_button_text', 40)->nullable()->after('cta_type');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            foreach (['promote_target', 'promoted_video_ids', 'follow_button_text'] as $col) {
                if (Schema::hasColumn('promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
