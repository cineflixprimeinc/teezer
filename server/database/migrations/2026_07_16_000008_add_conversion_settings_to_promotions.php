<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Sales / Conversions" campaigns optimise for a valuable action (a pixel event
 * on a website or app): the conversion location/event, value handling, bid
 * strategy, attribution window and payment event. Stored as JSON on the promotion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'conversion_settings')) {
                $table->json('conversion_settings')->nullable()->after('engagement_settings');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'conversion_settings')) {
                $table->dropColumn('conversion_settings');
            }
        });
    }
};
