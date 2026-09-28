<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-user consent grant for an internal Reelsoo client (e.g. "ads"). Records the
 * one-time "Reelsoo Ads wants to access your Reelsoo Account" authorization so the
 * consent screen is shown only once. Modeled on social_accounts' idempotency.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('oauth_grants', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('client', 40);          // 'ads' (future: 'creators', ...)
            $table->json('scopes')->nullable();
            $table->timestamp('granted_at')->nullable();
            $table->timestamp('revoked_at')->nullable();
            $table->timestamps();

            $table->unique(['user_id', 'client']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('oauth_grants');
    }
};
