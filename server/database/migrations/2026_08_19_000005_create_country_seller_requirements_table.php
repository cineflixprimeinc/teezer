<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * The configurable country-requirement system: what a seller must fill in
 * and upload is looked up dynamically as (country_code, seller_type), not
 * hard-coded per country in the wizard. Admin-managed from the "Teezer
 * Shop" admin section (same CRUD shape as shop_categories), NOT a code
 * change - adding a new country's requirements, or changing an existing
 * one's, never touches the mobile app or this migration again.
 *
 * `country_code = '*'` is the fallback row used when no exact match exists
 * for a country - so the wizard always has something sane to load instead of
 * breaking for a country the admin hasn't explicitly configured yet. Seeded
 * here for both seller types, plus a real example (Nepal) so the dynamic
 * lookup has something concrete to prove out beyond the fallback.
 *
 * `required_fields`/`required_documents` are keys the mobile wizard already
 * knows how to render (see SellerApplicationController's FIELD_LABELS/
 * DOCUMENT_LABELS) - the admin picks from a known set rather than free-typing
 * arbitrary strings the client wouldn't know how to display.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_seller_requirements', function (Blueprint $table) {
            $table->id();
            // varchar, not char(2): the '*' fallback row is 1 character, and
            // Postgres's CHAR type blank-pads short values on read (a real
            // ISO code is always exactly 2 chars so this never mattered for
            // shops.country_code, but it would return '* ' with a trailing
            // space here).
            $table->string('country_code', 2); // ISO 3166-1 alpha-2, or '*' for the fallback
            $table->string('seller_type', 20); // individual|business
            $table->json('required_fields');
            $table->json('required_documents');
            $table->boolean('requires_tax_form')->default(false);
            $table->timestamps();

            $table->unique(['country_code', 'seller_type']);
        });

        $now = now();
        $individualCommon = ['legal_full_name', 'date_of_birth', 'residential_address', 'phone', 'email', 'id_type', 'id_number'];
        $businessCommon = [
            'legal_business_name', 'business_type', 'business_registration_number', 'business_address',
            'business_phone', 'business_email', 'authorized_rep_name', 'authorized_rep_position',
        ];

        DB::table('country_seller_requirements')->insert([
            [
                'country_code' => '*', 'seller_type' => 'individual',
                'required_fields' => json_encode($individualCommon),
                'required_documents' => json_encode(['government_id']),
                'requires_tax_form' => false,
                'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'country_code' => '*', 'seller_type' => 'business',
                'required_fields' => json_encode($businessCommon),
                'required_documents' => json_encode(['business_registration_certificate', 'authorized_rep_id']),
                'requires_tax_form' => false,
                'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'country_code' => 'NP', 'seller_type' => 'individual',
                'required_fields' => json_encode($individualCommon),
                'required_documents' => json_encode(['government_id']),
                'requires_tax_form' => true, // PAN, where applicable
                'created_at' => $now, 'updated_at' => $now,
            ],
            [
                'country_code' => 'NP', 'seller_type' => 'business',
                'required_fields' => json_encode($businessCommon),
                'required_documents' => json_encode(['business_registration_certificate', 'authorized_rep_id']),
                'requires_tax_form' => true, // PAN/VAT
                'created_at' => $now, 'updated_at' => $now,
            ],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('country_seller_requirements');
    }
};
