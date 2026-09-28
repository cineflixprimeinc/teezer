<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * "Messages" campaigns let advertisers customise how a conversation starts:
 * a greeting message, up to 3 quick-reply buttons, and the action button label.
 * Stored together as JSON on the promotion.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'message_settings')) {
                $table->json('message_settings')->nullable()->after('video_settings');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (Schema::hasColumn('promotions', 'message_settings')) {
                $table->dropColumn('message_settings');
            }
        });
    }
};
