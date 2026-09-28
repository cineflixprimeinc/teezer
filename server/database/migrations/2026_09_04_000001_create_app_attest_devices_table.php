<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Attested app instances - one row per Apple App Attest key.
 *
 * A key is an APP INSTANCE identity, not a user identity: it is generated in
 * the Secure Enclave on first run and dies with the install. `user_id` is
 * therefore "the account last seen using this install", kept for support and
 * abuse investigation - it is deliberately NOT an authorization input, because
 * one handset legitimately serves up to five saved accounts here and a key that
 * belonged to whoever attested first would break every switch. Authorization
 * stays with Sanctum; this table only answers "is this a genuine Reelsoo build
 * on genuine Apple hardware".
 *
 * The counter is the replay defence and is the one column with real
 * concurrency: two legitimate requests can be in flight at once, so it is only
 * ever advanced by a conditional UPDATE (see AppAttestDevice::advanceCounter).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('app_attest_devices', function (Blueprint $table) {
            $table->id();

            // Nullable: an install can attest before anyone signs in, and a row
            // must outlive the account that happened to create it. Set null
            // rather than deleted with the user for the same reason.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // Apple's key identifier: base64 of the SHA-256 of the public key,
            // 44 chars today. Unique globally - one row per key, and re-attesting
            // the same key updates rather than duplicating.
            $table->string('key_id', 64)->unique();

            // The attested public key, DER, base64-encoded. This is what every
            // later assertion is verified against. Not a secret, but it is the
            // trust anchor for this install, so it is only ever written by a
            // fully verified attestation.
            $table->text('public_key');

            // Read out of the attestation itself (the aaguid), never taken from
            // the client - a development key must not be able to claim it is a
            // production one.
            $table->string('environment', 20)->default('production');

            $table->string('bundle_id', 191);
            $table->string('team_id', 32);

            // Apple's receipt, kept for the server-to-server risk-metric API.
            // Nothing reads it yet; storing it now means not needing a
            // re-attestation to start using it later.
            $table->text('receipt')->nullable();

            // Monotonic per Apple's spec. Starts at the attestation's own value
            // and must strictly increase on every assertion.
            $table->unsignedBigInteger('last_counter')->default(0);

            $table->string('status', 20)->default('active'); // active | revoked
            $table->timestamp('attested_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();

            // Lookup on every protected request is by key_id (already unique
            // above). These cover the operational queries: "this user's
            // installs" and "sweep revoked/stale rows".
            $table->index(['user_id', 'status']);
            $table->index(['status', 'environment']);
            $table->index('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_attest_devices');
    }
};
