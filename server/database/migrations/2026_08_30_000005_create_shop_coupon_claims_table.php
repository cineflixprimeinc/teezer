<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Records a user CLAIMING a shop coupon (added it to their wallet) - not a
 * redemption at checkout, since there is still no marketplace checkout/order
 * system for it to be redeemed against yet (same gap the rest of Shop
 * already lives with; a claimed coupon simply has nowhere to be applied
 * until that exists). Shape mirrors the existing `coupon_redemptions`
 * table's own unique-pair pattern, minus the fields that only make sense at
 * an actual checkout (amount_discounted, currency, plan_key).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shop_coupon_claims')) {
            Schema::create('shop_coupon_claims', function (Blueprint $table) {
                $table->id();
                $table->foreignId('shop_coupon_id')->constrained()->cascadeOnDelete();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->timestamp('created_at')->useCurrent();

                $table->unique(['shop_coupon_id', 'user_id']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_coupon_claims');
    }
};
