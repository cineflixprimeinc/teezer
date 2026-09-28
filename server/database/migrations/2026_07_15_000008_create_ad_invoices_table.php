<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Billing statements. Charging is prepaid-wallet in v1; this table keeps postpaid / credit-line
 * invoicing open without re-architecture.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('ad_invoices', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('ad_account_id');

            $table->string('number', 40)->nullable()->unique();
            $table->date('period_start')->nullable();
            $table->date('period_end')->nullable();

            $table->unsignedBigInteger('amount_cents')->default(0);
            $table->unsignedBigInteger('tax_cents')->default(0);
            $table->unsignedBigInteger('total_cents')->default(0);
            $table->string('currency', 10)->default('USD');

            $table->string('status', 20)->default('draft'); // draft | issued | paid | void
            $table->string('gateway', 30)->nullable();
            $table->string('gateway_ref', 120)->nullable();

            $table->timestamp('issued_at')->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->jsonb('meta')->nullable();

            $table->timestamps();

            $table->index('ad_account_id');
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('ad_invoices');
    }
};
