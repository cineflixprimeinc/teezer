<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "More Video Views" campaigns collect ad-delivery settings on their own step:
 * optimization goal, play behaviour (auto-play / tap), sound on/off, and optional
 * tracking parameters. Stored together as JSON on the promotion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'video_settings')) {
                $table->json('video_settings')->nullable()->after('follow_button_text');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'video_settings')) {
                $table->dropColumn('video_settings');
            }
        });
    }
};
