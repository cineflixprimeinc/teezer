<?php

use App\Services\IsoCountries;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Per-country signup/login access control - the "TEEZER COUNTRY
 * AVAILABILITY" admin page's backing table. See
 * App\Services\CountryAvailabilityService for the policy engine that reads
 * this; App\Http\Controllers\Api\Admin\AdminCountryAvailabilityController
 * for the admin CRUD.
 *
 * This is a DIFFERENT concern from country_detections/country_change_requests
 * (App\Services\CountryService's 60-day lock + continuous-verification
 * system, for currency/content-region integrity) and from
 * country_currency_map (pricing) - neither of those is touched by this
 * table. `country_code` is the stable identifier throughout, ISO 3166-1
 * alpha-2, uppercase.
 *
 * Seeded here (not a separate seeder step, so `migrate` alone is enough)
 * from IsoCountries::map() - the same canonical dataset already used
 * everywhere else for code validation/naming - with every country enabled
 * by default. Combined with the `country_restrictions_enabled` global
 * AppSetting defaulting to false, this means running this migration never
 * blocks anyone on its own; an admin has to explicitly opt in first.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_availability', function (Blueprint $table) {
            $table->id();
            $table->string('country_code', 2)->unique();
            $table->string('country_name', 100);
            $table->boolean('signup_enabled')->default(true);
            $table->boolean('login_enabled')->default(true);
            $table->string('restriction_reason', 500)->nullable();
            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('signup_enabled');
            $table->index('login_enabled');
        });

        $now = now();
        $rows = [];
        foreach (IsoCountries::map() as $code => $name) {
            $rows[] = [
                'country_code' => $code,
                'country_name' => $name,
                'signup_enabled' => true,
                'login_enabled' => true,
                'created_at' => $now,
                'updated_at' => $now,
            ];
        }
        // Chunked insert - IsoCountries::map() is ~195 rows, well under any
        // practical placeholder limit, but chunking costs nothing and keeps
        // this safe if the dataset ever grows substantially.
        foreach (array_chunk($rows, 100) as $chunk) {
            DB::table('country_availability')->insert($chunk);
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('country_availability');
    }
};
