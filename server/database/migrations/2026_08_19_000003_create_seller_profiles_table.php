<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The seller's PRIVATE legal identity - deliberately a separate table from
 * `shops`, which is partially public (ShopController::show() and friends
 * read straight off it). Nothing in seller_profiles is ever touched by a
 * public endpoint; only the seller themselves and admin review screens read
 * it.
 *
 * `legal_data` bundles every individual/business identity field (legal name,
 * DOB, address, phone, email, government ID type/number, business name/
 * type/registration number/address/phone/email/website, authorized
 * representative name/DOB/position) into ONE encrypted JSON blob, same idea
 * as CreatorPayoutMethod.details - one column that always changes shape by
 * seller_type/country rather than a wide table of mostly-null per-field
 * columns. Tax ID/PAN/VAT specifically is NOT stored here - see
 * SellerApplicationController, which reuses the existing TaxForm system
 * (tax_forms table) for that instead of a third place to keep a tax number.
 *
 * `text`, not `json`: the EncryptedJson cast writes ciphertext, which is not
 * itself valid JSON, and Postgres's `json` column type validates on write -
 * every encrypted write would fail with "invalid input syntax for type
 * json". TaxForm's own encrypted columns are `text` for the exact same
 * reason (see that migration). CreatorPayoutMethod.details is `json` and
 * appears to carry this same bug already - flagged, not fixed here, since
 * that table is unrelated to this feature.
 *
 * `agreements` is plain JSON (not sensitive - just which Seller Terms/
 * Marketplace Policies versions were accepted and when), separate from
 * legal_data so accepting terms doesn't require touching encrypted data.
 *
 * `current_step` is what makes "leave and continue later" work - the
 * wizard's own last-completed step, read back on next open instead of
 * restarting.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seller_profiles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->unique()->constrained()->cascadeOnDelete();
            $table->text('legal_data')->nullable(); // ciphertext - see docblock
            $table->json('agreements')->nullable(); // plain JSON, not encrypted
            $table->string('current_step', 40)->nullable();
            $table->timestamp('submitted_at')->nullable();
            // Set by admin review (Shop::STATUS_NEEDS_INFORMATION / REJECTED) -
            // shown back to the seller, same "why" pattern TaxForm/
            // VerificationRequest already use for their own admin notes.
            $table->text('admin_note')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seller_profiles');
    }
};
