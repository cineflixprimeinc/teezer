<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * One row per installation attempt against a licence - the record that makes
 * "this key is being used on three VPSes" visible instead of invisible.
 *
 * A row is written on install AND updated on every heartbeat, so `last_seen_at`
 * doubles as the liveness signal the admin table's "Last Verification" column
 * reads.
 *
 * `ip_address` is stored for abuse investigation only. It is the customer's own
 * server IP, never an end user's.
 *
 * LICENSOR-SIDE ONLY.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('license_activations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('license_id')->constrained('licenses')->cascadeOnDelete();
            $table->string('installation_id', 40)->index();
            $table->string('domain', 253);

            // active   -> currently the bound installation
            // released -> superseded by an admin reset (kept for history)
            // rejected -> refused (limit reached, domain mismatch, revoked)
            $table->string('status', 20)->default('active')->index();

            $table->string('ip_address', 45)->nullable();
            $table->string('version', 32)->nullable();
            $table->string('php_version', 32)->nullable();
            $table->string('server_os', 100)->nullable();
            $table->string('user_agent', 255)->nullable();
            $table->string('rejection_reason', 255)->nullable();

            $table->timestamp('activated_at')->nullable();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamp('released_at')->nullable();
            $table->timestamps();

            $table->index(['license_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('license_activations');
    }
};
