<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per uploaded verification document (government ID, business
 * registration certificate, authorized representative ID, ...). A separate
 * table rather than fixed columns on seller_profiles because the required
 * document LIST is itself dynamic per country+seller_type (see
 * country_seller_requirements) - a Nepali individual seller might only ever
 * need `government_id`, while a business in another country could need four
 * or five distinct documents. This table has no schema change no matter how
 * many document types a country ends up requiring.
 *
 * `file_key` is a StorageService key, not a public URL - documents are
 * private by construction (see StorageService::PRIVATE_PREFIXES) and are
 * only ever resolved to a signed, expiring URL for an authorized viewer
 * (the seller themselves, or an admin reviewing the application), the same
 * pattern VerificationRequest's document accessors already use. Never
 * returned from a public endpoint.
 *
 * `status` is per-document, independent of the shop's own onboarding status -
 * an admin can approve the government ID while rejecting the business
 * registration certificate and asking for a clearer scan, without moving the
 * whole application back to "needs information" over a document that was
 * actually fine.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seller_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained()->cascadeOnDelete();
            // e.g. 'government_id', 'business_registration_certificate',
            // 'authorized_rep_id' - whatever key country_seller_requirements
            // .required_documents lists for this shop's country+seller_type.
            $table->string('document_key', 60);
            $table->string('file_key');
            $table->string('status', 20)->default('pending'); // pending|approved|rejected
            $table->text('admin_note')->nullable();
            $table->timestamps();

            $table->index(['shop_id', 'document_key']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('seller_documents');
    }
};
