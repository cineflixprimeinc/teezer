<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Area (sub-country) targeting for promotions: an advertiser can narrow a campaign
 * to a city/region on top of the existing country. Additive + nullable — existing
 * country-only promotions are unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->string('city', 120)->nullable()->after('country');
            $table->string('region', 120)->nullable()->after('city');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn(['city', 'region']);
        });
    }
};
