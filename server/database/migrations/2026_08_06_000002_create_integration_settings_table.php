<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per third-party integration - Spotify, MusicBrainz, Backblaze, a mail
 * provider, whatever comes next.
 *
 * This exists so credentials can be rotated from the admin panel without a code
 * change or a redeploy. Today a new provider key means editing .env on two boxes
 * and restarting php-fpm; a compromised key means the same under time pressure.
 *
 * Design notes that matter:
 *
 *  - `credentials` is encrypted at rest (App\Casts\EncryptedJson, so it is bound
 *    to APP_KEY - see the APP_PREVIOUS_KEYS warning in .env.example). It holds
 *    ONLY secret material: api key, client secret, access/refresh tokens,
 *    webhook secret.
 *  - `settings` is plaintext JSON and holds the non-secret half - API endpoint,
 *    callback URL, client id. Keeping them apart means the admin UI can show
 *    configuration without ever decrypting a secret.
 *  - There is deliberately no `provider_class` column. Which providers exist is
 *    code (config/integrations.php), not data - a row that could name an
 *    arbitrary class would be a remote-code-execution primitive handed to
 *    whoever compromises one admin account.
 *  - `last_error` stores an already-redacted message. Nothing that writes here
 *    may pass raw exception text through: provider errors routinely echo the
 *    credential that failed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('integration_settings', function (Blueprint $table) {
            $table->id();

            // Matches a key in config/integrations.php. Unique: one row per
            // provider, created on first save rather than seeded, so the table
            // only ever holds integrations someone actually configured.
            $table->string('provider', 64)->unique();

            // Off by default. A provider with credentials saved but the toggle
            // off must behave exactly as if it were never configured - that is
            // the kill switch when an integration starts misbehaving.
            $table->boolean('enabled')->default(false);

            // Encrypted. Secret material only.
            $table->text('credentials')->nullable();

            // Plaintext. Endpoints, callback URLs, client ids, per-provider
            // tuning. Safe to display and to log.
            $table->json('settings')->nullable();

            // Result of the last Test Connection, so the admin list can show
            // status without re-testing every provider on page load.
            $table->string('status', 20)->default('untested'); // untested|connected|failed
            $table->timestamp('last_connected_at')->nullable();
            $table->timestamp('last_tested_at')->nullable();
            $table->text('last_error')->nullable(); // pre-redacted

            // Cheap rolling counters for the usage panel. A json blob rather
            // than its own table because this is a dashboard readout, not
            // billing data - precision is not worth a row per call at our
            // request volume.
            $table->json('usage')->nullable();

            // When an OAuth access token expires, so the refresher can find
            // rows to renew without decrypting every credential blob.
            $table->timestamp('token_expires_at')->nullable();

            $table->foreignId('updated_by')->nullable()->constrained('users')->nullOnDelete();

            $table->timestamps();

            // The token refresher's query: enabled rows expiring soon.
            $table->index(['enabled', 'token_expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('integration_settings');
    }
};
