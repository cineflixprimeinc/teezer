<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Creator tax forms (W-8BEN / W-9 / W-8BEN-E / Other) submitted from Teezer
 * Studio → Settings → Tax Information → Tax Forms. Replaces the app's local
 * demo store with real, per-user persistence. TIN values are stored encrypted
 * (see the App\Models\TaxForm casts), so their columns are text to hold ciphertext.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('tax_forms', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('submission_id')->nullable()->unique(); // TXF-2026-000123 (set from id after insert)
            $table->string('form_type');                            // W-8BEN / W-9 / W-8BEN-E / Other
            $table->string('entity_kind')->default('Individual');   // Individual / Entity
            $table->string('status')->default('under_review');      // under_review / approved / rejected

            $table->string('first_name');
            $table->string('middle_name')->nullable();
            $table->string('last_name');
            $table->string('dob')->nullable();                      // display string, e.g. "May 15, 1995"
            $table->string('citizenship')->nullable();
            $table->string('residence_country')->nullable();
            $table->text('residence_tin')->nullable();              // encrypted
            $table->string('addr1')->nullable();
            $table->string('addr2')->nullable();
            $table->string('city')->nullable();
            $table->string('tin_type')->nullable();                 // PAN / SSN / EIN / ITIN / Other
            $table->text('tax_id')->nullable();                     // encrypted

            $table->string('identity_doc_key')->nullable();         // R2 storage key (never returned to client)
            $table->string('address_doc_key')->nullable();

            $table->string('review_note')->nullable();              // shown to the creator on rejection
            $table->timestamp('reviewed_at')->nullable();
            $table->timestamps();

            $table->index(['user_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('tax_forms');
    }
};
