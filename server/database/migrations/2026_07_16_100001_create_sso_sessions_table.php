<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Revocable server-side session backing the shared `.teezer.live` SSO cookie.
 * The cookie carries only an opaque random secret; we store its sha256 here so a
 * DB leak never yields a usable cookie. One row per browser/login.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sso_sessions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('token_hash', 64)->unique();   // sha256(cookie secret)
            $table->char('csrf_hash', 64)->nullable();   // sha256(csrf token bound to this session)
            $table->string('user_agent', 255)->nullable();
            $table->string('ip_address', 45)->nullable();
            $table->timestamp('last_used_at')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->index('user_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sso_sessions');
    }
};
