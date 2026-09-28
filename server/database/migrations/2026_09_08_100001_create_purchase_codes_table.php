<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marketplace purchase codes - the thing a buyer receives from the marketplace
 * and redeems at teezer.live/activate-license.
 *
 * The spec's minimum table set (licenses / license_activations /
 * license_audit_logs / license_releases) has no home for "which codes are
 * valid", and without that there is nothing for step 1 of activation
 * ("Validate the Purchase Code") to validate AGAINST. Hence this table.
 *
 * The plaintext code is NEVER stored. Only:
 *   - code_hash  : sha256 of the normalised code, unique, for lookup
 *   - code_last4 : the last 4 characters, so the admin table can render
 *                  ABCD-****-****-1234 without ever holding the secret
 *
 * That means a database dump leaks no redeemable code, and it also means an
 * operator who loses a code cannot recover it - they reissue instead. That
 * trade is deliberate; recoverability would require storing the secret.
 *
 * LICENSOR-SIDE ONLY. This table never exists on a customer installation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('purchase_codes', function (Blueprint $table) {
            $table->id();
            $table->string('code_hash', 64)->unique();
            $table->string('code_last4', 8);
            $table->string('batch', 64)->nullable()->index();
            $table->string('marketplace', 64)->nullable();
            $table->string('buyer_reference', 191)->nullable();

            // 'available' -> nothing redeemed it yet
            // 'activated' -> a licence exists for it
            // 'disabled'  -> refunded/charged back/withdrawn by us
            $table->string('status', 20)->default('available')->index();

            // How many DISTINCT domains this one code may license. 1 is the
            // normal marketplace case; a multi-site bundle raises it.
            $table->unsignedSmallInteger('activation_limit')->default(1);

            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamp('activated_at')->nullable();
            $table->timestamp('disabled_at')->nullable();
            $table->string('notes', 500)->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('purchase_codes');
    }
};
