<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Append-only, double-entry money log — the billing source of truth. `amount_cents` is signed
 * (positive = credit, negative = debit). `ref` is a unique idempotency key so a charge/topup is
 * never applied twice. No cascade on the account so financial history is never destroyed.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_ledger', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('ad_account_id');

            $table->string('entry_type', 20); // topup | charge | refund | adjustment | hold | release
            $table->bigInteger('amount_cents');
            $table->bigInteger('balance_after_cents');
            $table->string('currency', 10)->default('USD');

            $table->unsignedBigInteger('campaign_id')->nullable();
            $table->string('ref', 120)->nullable()->unique();
            $table->string('description', 255)->nullable();
            $table->jsonb('meta')->nullable();

            $table->timestamps();

            $table->index('ad_account_id');
            $table->index('campaign_id');
            $table->index('entry_type');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_ledger');
    }
};
