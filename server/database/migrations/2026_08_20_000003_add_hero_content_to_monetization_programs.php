<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lets an admin write the actual pitch content shown on a programme's intro
 * screen (Gifts & Coins, Sell on Reelsoo, Creator Rewards today) - Admin
 * Panel -> Monetization Control Center -> [programme] -> Overview.
 *
 * Deliberately separate from `label`/`description`: those already exist and
 * do a different job (the header title and the admin-list caption) - adding
 * new, clearly-named fields means editing this never surprises anyone
 * editing that. All three are nullable: null means "use this client's own
 * default copy for this programme", same fallback convention as
 * commission_rate/cta_label.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('monetization_programs', function (Blueprint $table) {
            $table->string('hero_title', 120)->nullable()->after('cta_label');
            $table->string('hero_description', 400)->nullable()->after('hero_title');
            // Up to 5 {icon, title, desc} rows - the intro screen's 3 feature
            // bullets. `icon` is a name from a curated lucide set (see
            // AdminMonetizationProgramController::FEATURE_ICONS) validated
            // server-side, not free text - a client renders it from a fixed
            // icon map, so an unrecognised name would show nothing.
            $table->json('features')->nullable()->after('hero_description');
        });
    }

    public function down(): void
    {
        Schema::table('monetization_programs', function (Blueprint $table) {
            $table->dropColumn(['hero_title', 'hero_description', 'features']);
        });
    }
};
