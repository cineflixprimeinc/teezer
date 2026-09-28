<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "App Installs" campaigns promote a mobile app: which app / store URLs, target
 * platforms, an optional deep link, ad copy, CTA and a tracking event. Stored
 * together as JSON on the promotion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'app_settings')) {
                $table->json('app_settings')->nullable()->after('message_settings');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'app_settings')) {
                $table->dropColumn('app_settings');
            }
        });
    }
};
