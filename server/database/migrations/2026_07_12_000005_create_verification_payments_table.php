<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Payment for a Blue Verified subscription.
 *
 * A separate table from coin_orders on purpose. Coins are a product you buy; verification
 * is a subscription that gates an application - different lifecycle, different states,
 * and stuffing both into coin_orders would mean every coin query has to remember to
 * exclude the rows that aren't coins.
 *
 * `purpose` distinguishes the FIRST payment (which unlocks Submit) from a RENEWAL (which
 * extends an existing badge). Same money, different meaning, and the badge logic needs to
 * tell them apart.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('verification_payments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            // Nullable: a RENEWAL is paid against the badge, and the original draft may be
            // long gone. A first payment always has one.
            $table->unsignedBigInteger('verification_request_id')->nullable();

            $table->string('purpose', 20)->default('application'); // application | renewal
            $table->string('plan_id', 20);

            // Priced SERVER-side from the plan. The client never sends an amount - that is
            // how you end up selling a $20 badge for $0.01.
            $table->decimal('amount_usd', 10, 2);
            $table->string('currency', 8)->default('USD');

            $table->string('payment_method', 20);            // card | paypal | applepay | …
            $table->string('payment_status', 20)->default('pending'); // pending | paid | failed
            $table->string('payment_reference')->nullable();
            $table->json('payment_meta')->nullable();

            $table->timestamp('paid_at')->nullable();
            $table->timestamp('failed_at')->nullable();
            $table->string('failure_reason')->nullable();

            $table->timestamps();

            $table->index(['user_id', 'payment_status']);
            $table->index(['verification_request_id', 'payment_status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('verification_payments');
    }
};
