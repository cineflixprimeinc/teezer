<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Invalid-traffic log + refund audit trail. `ip_hash` mirrors the platform's FNV-1a64 hashing
 * (no raw IPs stored). Suspicious events are excluded from billing and can trigger auto-refund.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_fraud_events', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 40);
            // invalid_click | impression_flood | bot | dup_device | datacenter_ip | rapid_repeat

            $table->unsignedBigInteger('ad_account_id')->nullable();
            $table->unsignedBigInteger('campaign_id')->nullable();
            $table->unsignedBigInteger('creative_id')->nullable();
            $table->unsignedBigInteger('user_id')->nullable();

            $table->string('ip_hash', 32)->nullable();
            $table->string('device_fp', 120)->nullable();
            $table->unsignedSmallInteger('score')->default(0); // 0-100 risk

            $table->string('action', 20)->default('flagged'); // flagged | blocked | refunded | ignored
            $table->unsignedBigInteger('amount_refunded_cents')->default(0);
            $table->jsonb('details')->nullable();

            $table->timestamps();

            $table->index('kind');
            $table->index('campaign_id');
            $table->index('ip_hash');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_fraud_events');
    }
};
