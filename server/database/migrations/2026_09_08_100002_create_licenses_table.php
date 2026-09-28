<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per issued licence: the binding of a purchase code to a domain, an
 * owner username and (once installed) an installation id.
 *
 * Secrets are stored as sha256 hashes ONLY. Neither the purchase code nor the
 * licence key is recoverable from this table - the customer holds the sole
 * plaintext copy of the key, shown to them exactly once at activation. The
 * *_prefix / *_last4 columns exist purely so the admin UI can render a masked
 * identifier (RL-************, ABCD-****-1234) without the real value.
 *
 * `username` here is a LICENCE OWNER identifier and is deliberately NOT a
 * foreign key to `users`. Per the spec, the licence system is independent of
 * Reelsoo's social auth: buying the code must never create or imply a social
 * account, and the two namespaces are allowed to collide harmlessly.
 *
 * LICENSOR-SIDE ONLY. Never exists on a customer installation.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('licenses', function (Blueprint $table) {
            $table->id();

            // Public-facing opaque identifier, e.g. lic_01J8XW... Safe to show.
            $table->string('license_id', 40)->unique();

            $table->foreignId('purchase_code_id')->constrained('purchase_codes')->cascadeOnDelete();
            $table->string('purchase_code_hash', 64)->index();
            $table->string('purchase_code_last4', 8);

            $table->string('license_key_hash', 64)->unique();
            $table->string('license_key_prefix', 16);

            $table->string('username', 100)->index();

            // Normalised: lowercase, no scheme, no port, no www., no trailing
            // dot. See App\Licensing\Support\DomainNormalizer - the SAME class
            // normalises on both sides, so binding and verification can never
            // disagree about what a domain is.
            $table->string('domain', 253)->index();

            // Null until the installer registers. Bound on first install and
            // only cleared by an explicit admin reset (legitimate migration).
            $table->string('installation_id', 40)->nullable()->unique();

            // active | suspended | revoked | expired
            $table->string('status', 20)->default('active')->index();

            $table->string('version', 32)->nullable();
            $table->unsignedSmallInteger('activation_limit')->default(1);
            $table->unsignedInteger('activation_count')->default(0);

            $table->timestamp('activated_at')->nullable();
            $table->timestamp('installed_at')->nullable();
            $table->timestamp('last_verified_at')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->string('revoked_reason', 500)->nullable();

            // Optional commercial expiry. NULL = perpetual, which is the normal
            // marketplace case. When set it is encoded into the signed token so
            // the installation enforces it locally, with no network call.
            $table->timestamp('expires_at')->nullable();

            $table->string('notes', 1000)->nullable();
            $table->timestamps();

            // The rule the whole scheme rests on: one active licence per
            // domain. Enforced in the database, not only in application code.
            $table->unique(['domain', 'purchase_code_id'], 'licenses_domain_purchase_unique');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('licenses');
    }
};
