<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Marketplace coupons shown on the Shop home ("Rs 300 off", "Free
 * delivery"). Deliberately a NEW table, not an extension of the existing
 * `coupons` table (2026_08_08_000008_create_coupon_tables.php): that one is
 * platform-wide/subscription-plan-scoped (`applicable_plans` json, no
 * shop/product concept at all, validated by CouponService against
 * checkout). Bolting shop semantics onto it would be a worse fit than this
 * small, purpose-built table - same reasoning `shop_deals` got its own
 * table instead of reusing `ad_campaigns`.
 *
 * `type` follows the existing `coupons.type` convention (validated at the
 * app layer via AdminShopCouponController, not a DB enum/CHECK - matching
 * this project's established "small fixed sets validated in PHP" style,
 * e.g. Product::BADGES) with one addition, `free_delivery`, for which
 * `value` is meaningless and stays null.
 *
 * No `per_user_limit` column (unlike the platform-wide `coupons` table this
 * deliberately doesn't extend): a claim is a one-time "add to my wallet"
 * action, not a redeemable-many-times checkout discount, and
 * shop_coupon_claims' own UNIQUE(shop_coupon_id, user_id) already makes
 * "once per user" true by construction - a numeric limit field alongside
 * that would just be dead, unenforceable configuration.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('shop_coupons')) {
            Schema::create('shop_coupons', function (Blueprint $table) {
                $table->id();
                $table->string('code', 32)->unique();
                $table->string('title', 80);
                $table->string('description', 255)->nullable();
                $table->string('type', 20)->default('fixed'); // percentage|fixed|free_delivery
                $table->decimal('value', 10, 2)->nullable();
                $table->decimal('min_spend', 12, 2)->nullable();
                $table->unsignedInteger('usage_limit')->nullable();
                $table->unsignedInteger('used_count')->default(0);
                $table->boolean('is_active')->default(true);
                $table->timestamp('starts_at')->nullable();
                $table->timestamp('ends_at')->nullable();
                $table->unsignedSmallInteger('sort_order')->default(0);
                $table->timestamps();

                $table->index(['is_active', 'sort_order']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('shop_coupons');
    }
};
