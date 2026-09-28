<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "More Engagement" campaigns let advertisers optimise for the engagement type
 * they care about (all / comments / shares / likes) and the delivery style
 * (balanced vs high-engagement users). Stored together as JSON on the promotion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'engagement_settings')) {
                $table->json('engagement_settings')->nullable()->after('app_settings');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'engagement_settings')) {
                $table->dropColumn('engagement_settings');
            }
        });
    }
};
