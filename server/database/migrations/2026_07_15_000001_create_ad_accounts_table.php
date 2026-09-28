<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Advertiser accounts. A user is their own account (self-serve) by default;
 * `type` allows external brand/agency accounts later. Holds the prepaid balance.
 * All money is stored as integer cents to avoid float rounding in billing.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_accounts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();

            $table->string('name', 120);
            $table->string('type', 20)->default('self_serve');   // self_serve | brand | agency
            $table->string('status', 20)->default('active');     // active | suspended | closed

            // Money (integer cents)
            $table->unsignedBigInteger('balance_cents')->default(0);
            $table->unsignedBigInteger('lifetime_spent_cents')->default(0);
            $table->string('currency', 10)->default('USD');
            $table->string('timezone', 60)->default('UTC');

            $table->string('contact_email', 190)->nullable();
            $table->jsonb('meta')->nullable();

            $table->timestamps();

            $table->index('user_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_accounts');
    }
};
