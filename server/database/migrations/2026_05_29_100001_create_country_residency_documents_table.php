<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Stores residency-proof documents (visa, passport, lease, utility bill) that a
 * user uploads when requesting a manual country change. Reviewed by admins.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('country_residency_documents', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('requested_country_code', 2);
            $table->string('requested_country_name', 100);

            // Document metadata
            $table->enum('document_type', [
                'passport', 'visa', 'residence_permit', 'national_id',
                'utility_bill', 'bank_statement', 'lease_agreement', 'other',
            ]);
            $table->string('file_path', 500);            // storage key
            $table->string('file_original_name', 255)->nullable();
            $table->string('file_mime', 100)->nullable();
            $table->unsignedInteger('file_size_bytes')->nullable();

            // User declaration
            $table->date('residing_since')->nullable();   // date the user claims they began residing
            $table->text('user_note')->nullable();

            // Review workflow
            $table->enum('status', ['pending_review', 'approved', 'rejected'])->default('pending_review');
            $table->unsignedBigInteger('reviewed_by')->nullable();
            $table->timestamp('reviewed_at')->nullable();
            $table->string('review_notes', 500)->nullable();

            $table->timestamps();

            $table->index(['user_id', 'status']);
            $table->index('requested_country_code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('country_residency_documents');
    }
};
