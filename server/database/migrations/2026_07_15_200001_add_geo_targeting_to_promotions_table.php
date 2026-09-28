<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Map-pin geo targeting: an advertiser drops a marker (lat/lng) and a radius (km).
 * At feed time the viewer's GPS is compared with a lightweight Haversine distance —
 * no PostGIS, no spatial index, PostgreSQL only. Additive + nullable.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->decimal('target_lat', 10, 7)->nullable()->after('region');
            $table->decimal('target_lng', 10, 7)->nullable()->after('target_lat');
            $table->unsignedSmallInteger('target_radius_km')->nullable()->after('target_lng');
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            $table->dropColumn(['target_lat', 'target_lng', 'target_radius_km']);
        });
    }
};
