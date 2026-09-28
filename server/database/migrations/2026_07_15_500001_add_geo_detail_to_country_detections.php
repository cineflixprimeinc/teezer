<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * City-level geolocation on each detection, sourced from Cloudflare's visitor
 * location headers (CF-IPCity / CF-Region / CF-IPLatitude / CF-IPLongitude /
 * CF-Timezone). Country columns already exist; these enrich a detection so the
 * login-risk / "new location" checks and city-aware features have history.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('country_detections', function (Blueprint $table) {
            if (! Schema::hasColumn('country_detections', 'detected_region')) {
                $table->string('detected_region', 100)->nullable()->after('detected_country_name');
            }
            if (! Schema::hasColumn('country_detections', 'detected_city')) {
                $table->string('detected_city', 100)->nullable()->after('detected_region');
            }
            if (! Schema::hasColumn('country_detections', 'detected_latitude')) {
                $table->decimal('detected_latitude', 9, 5)->nullable()->after('detected_city');
            }
            if (! Schema::hasColumn('country_detections', 'detected_longitude')) {
                $table->decimal('detected_longitude', 9, 5)->nullable()->after('detected_latitude');
            }
            if (! Schema::hasColumn('country_detections', 'detected_timezone')) {
                $table->string('detected_timezone', 64)->nullable()->after('detected_longitude');
            }
        });
    }

    public function down(): void
    {
        Schema::table('country_detections', function (Blueprint $table) {
            foreach (['detected_region', 'detected_city', 'detected_latitude', 'detected_longitude', 'detected_timezone'] as $col) {
                if (Schema::hasColumn('country_detections', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
