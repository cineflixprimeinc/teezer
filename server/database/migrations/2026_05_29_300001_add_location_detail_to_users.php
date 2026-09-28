<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds granular location fields to the users table.
 *
 * The existing `location` column (a free-text string) is kept as-is for
 * backward compatibility; the new columns provide structured detail.
 * Latitude / longitude are stored but intentionally excluded from all
 * public API responses - only the formatted display string is public.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('city_name',      191)->nullable()->after('location');
            $table->string('region_name',    191)->nullable()->after('city_name');
            $table->string('local_location', 500)->nullable()->after('region_name');
            $table->decimal('location_lat',  10, 7)->nullable()->after('local_location');
            $table->decimal('location_lng',  10, 7)->nullable()->after('location_lat');
            $table->enum('location_source', ['gps', 'ip', 'manual', 'nominatim', 'none'])
                ->default('none')->after('location_lng');
            $table->timestamp('location_updated_at')->nullable()->after('location_source');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn([
                'city_name', 'region_name', 'local_location',
                'location_lat', 'location_lng',
                'location_source', 'location_updated_at',
            ]);
        });
    }
};
