<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * countries.dev-sourced country metadata (name, flag, currency, calling
 * code, region, etc.) - refreshed by the countries:sync command, never
 * written to on the request path. Deliberately separate from
 * country_availability (Reelsoo-owned signup/login POLICY - see
 * CountryAvailabilityService's docblock) - this table is only ever DATA,
 * disposable and re-derivable from the provider at any time, never the
 * enforcement boundary. Named country_metadata rather than "countries" so
 * it doesn't read as a canonical/foreign-keyed reference table next to
 * country_availability/country_detections/country_change_requests - those
 * key off the plain ISO code (via IsoCountries::map()), not this table.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_metadata', function (Blueprint $table) {
            $table->id();
            $table->string('country_code', 2)->unique();
            $table->string('alpha3_code', 3)->nullable()->index();
            $table->string('numeric_code', 5)->nullable();
            $table->string('name', 150);
            $table->string('native_name', 150)->nullable();
            $table->string('region', 50)->nullable()->index();
            $table->string('subregion', 80)->nullable();
            $table->string('capital', 150)->nullable();
            $table->unsignedBigInteger('population')->nullable();
            $table->double('area_km2')->nullable();
            $table->double('population_density')->nullable();
            $table->string('flag_emoji', 16)->nullable();
            $table->string('flag_svg_url', 255)->nullable();
            $table->double('latitude')->nullable();
            $table->double('longitude')->nullable();
            $table->json('calling_codes')->nullable();
            $table->json('top_level_domains')->nullable();
            $table->json('currencies')->nullable();
            $table->json('languages')->nullable();
            $table->json('timezones')->nullable();
            $table->json('borders')->nullable();
            $table->boolean('independent')->nullable();
            // Full verbatim provider response - a cheap hedge against
            // wanting one more field later without a migration + re-sync.
            $table->json('raw_payload')->nullable();
            $table->timestamp('synced_at')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('country_metadata');
    }
};
