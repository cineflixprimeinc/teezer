<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The first real order/payment system for Reelsoo Shop products. Before this,
 * `Product.sold_count`/`Shop.sold_count` were columns nobody ever wrote to and
 * no `orders`/`cart` table existed anywhere - see both models' docblocks.
 *
 * Mirrors coin_orders' shape and lifecycle deliberately (payment_reference,
 * payment_meta, payment_status/pending→paid dance) since the capture flow in
 * ShopOrderController reuses that exact pattern against the same StripeService/
 * RazorpayService, so a reviewer who knows one table already knows this one.
 *
 * A Shop purchase pays with real currency directly (the product's own price/
 * currency), never with Reelsoo Coins - so this is a parallel system to
 * coin_orders, not built on top of it.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('shop_orders', function (Blueprint $table) {
            $table->id();
            $table->foreignId('shop_id')->constrained('shops')->restrictOnDelete();
            $table->foreignId('buyer_id')->constrained('users')->cascadeOnDelete();
            // pending: created, awaiting payment. paid: gateway payment captured.
            // cod_pending: COD order placed, awaiting the seller marking it
            // delivered. fulfilled: COD delivered and settled. cancelled/failed:
            // terminal, never settled.
            $table->string('status', 20)->default('pending');
            $table->string('payment_method', 20); // stripe | razorpay | cod
            $table->string('payment_reference', 255)->nullable()->unique();
            $table->json('payment_meta')->nullable();
            $table->string('currency', 3)->default('NPR');
            $table->decimal('subtotal', 12, 2);
            // Snapshot of the rate actually applied, so a later admin change to
            // the global/programme rate never rewrites the economics of a
            // settled order - see ShopOrderController::commissionRateFor().
            $table->decimal('commission_rate', 5, 2)->nullable();
            $table->decimal('commission_amount', 12, 2)->default(0);
            $table->decimal('net_amount', 12, 2)->default(0);
            $table->json('shipping_address')->nullable();
            $table->string('buyer_note', 255)->nullable();
            $table->timestamp('paid_at')->nullable();
            $table->timestamp('fulfilled_at')->nullable();
            $table->timestamps();

            $table->index(['shop_id', 'status']);
            $table->index(['buyer_id', 'status']);
        });

        Schema::create('shop_order_items', function (Blueprint $table) {
            $table->id();
            $table->foreignId('order_id')->constrained('shop_orders')->cascadeOnDelete();
            // nullOnDelete, not restrict: the name/price snapshot below is what
            // an order actually needs to stay meaningful, so a deleted product
            // must not be blocked forever by its own order history.
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->string('product_name', 150);
            $table->decimal('unit_price', 10, 2);
            $table->unsignedInteger('quantity')->default(1);
            // Selected variation/colour, e.g. {"Size":"M","Color":"Black"} - a
            // snapshot for the same reason the price/name are, since
            // products.variations carries no independent per-option data today.
            $table->json('variation')->nullable();
            $table->decimal('line_total', 12, 2);
            $table->timestamps();

            $table->index('order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_order_items');
        Schema::dropIfExists('shop_orders');
    }
};
