<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * QR-code login (website "Use QR code" -> scanned + authorized from the
 * already-logged-in mobile app - QrLoginController.php).
 *
 * `id` is the ticket itself - a long random opaque string (unguessable by
 * construction, see QrLoginController::create()), used as the primary key
 * on purpose so nothing about a ticket is enumerable from a sequential id.
 *
 * `token` holds the real Sanctum bearer token only from the moment the
 * phone confirms until the website's first successful status poll consumes
 * it - QrLoginController::status() clears it (and stamps
 * token_delivered_at) in the SAME atomic update that hands it out, so it is
 * never sitting in this table any longer than it has to be, and can never
 * be delivered to two different pollers.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('qr_login_tickets', function (Blueprint $table) {
            $table->string('id', 64)->primary();
            // pending -> scanned -> confirmed|denied, or expired (computed
            // from expires_at, never written) at any point before confirmed.
            $table->string('status', 16)->default('pending');

            // The account this login will BE, once a phone scans + confirms.
            // Null until scanned.
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();

            // Captured from the WEBSITE's own create() request - browser/
            // platform label + the Cloudflare CF-IPCountry header (if any) +
            // IP, so confirm() can attribute the resulting login (country-
            // change detection, session naming) to the browser that will
            // actually hold the session, not the phone that approved it.
            $table->json('session_meta')->nullable();

            $table->string('token')->nullable();
            $table->timestamp('token_expires_at')->nullable();
            $table->timestamp('token_delivered_at')->nullable();

            $table->timestamp('expires_at');
            $table->timestamps();

            $table->index(['status', 'expires_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('qr_login_tickets');
    }
};
