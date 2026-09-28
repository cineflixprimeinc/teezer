<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creative copy for a promotion so the in-feed sponsored card can show a real
 * headline, description, CTA button and destination link (TikTok-style). These
 * were collected in the wizard but had nowhere to live; PromotionAdMapper now
 * copies them onto the AdCreative that the feed renders.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('promotions', 'headline')) {
                $table->string('headline', 120)->nullable()->after('objective');
            }
            if (! Schema::hasColumn('promotions', 'body')) {
                $table->string('body', 300)->nullable()->after('headline');
            }
            if (! Schema::hasColumn('promotions', 'cta_type')) {
                $table->string('cta_type', 40)->nullable()->after('body');
            }
            if (! Schema::hasColumn('promotions', 'destination_url')) {
                $table->string('destination_url', 500)->nullable()->after('cta_type');
            }
            if (! Schema::hasColumn('promotions', 'display_name')) {
                $table->string('display_name', 120)->nullable()->after('destination_url');
            }
            if (! Schema::hasColumn('promotions', 'placements')) {
                $table->json('placements')->nullable()->after('display_name');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            foreach (['headline', 'body', 'cta_type', 'destination_url', 'display_name', 'placements'] as $col) {
                if (Schema::hasColumn('promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
