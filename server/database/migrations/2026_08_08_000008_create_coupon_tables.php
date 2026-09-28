<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Coupons and their redemptions.
 *
 * Two tables, for the same reason story views split from view events: the
 * coupon is a definition and a redemption is an event. Keeping a `used_count`
 * alone would answer "how many times" and nothing else - not who, not when, not
 * how much was actually taken off, and not whether one person used it twice.
 *
 * `used_count` is kept ANYWAY, denormalised, because the usage limit is checked
 * on every checkout and counting redemptions each time is a scan on the hot
 * path. It is maintained inside the same transaction as the redemption row, so
 * the two cannot disagree - and CouponService::recount() rebuilds it from the
 * events if they ever do.
 *
 * ── Money ───────────────────────────────────────────────────────────────────
 *
 * `value` is the discount: a percentage (20 = 20%) or a fixed amount, decided
 * by `type`. A fixed amount also carries `currency`, because "$50 off" is not
 * "₹50 off" and storing the number without the unit makes it meaningless the
 * moment a second currency exists. Percentages have no currency - they scale.
 *
 * ── Scope ───────────────────────────────────────────────────────────────────
 *
 * `applicable_plans` is a JSON array of plan KEYS, or null for "any plan". Keys
 * rather than ids so a coupon survives a plan being rebuilt, and null rather
 * than "every key listed" so a coupon written today still applies to a plan
 * added tomorrow - which is what "all plans" has to mean.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('coupons', function (Blueprint $table) {
            $table->id();

            // Stored uppercase and compared uppercase - "save20" and "SAVE20"
            // are the same coupon to a customer, so they must be to us.
            $table->string('code', 32)->unique();
            $table->string('name', 120);
            $table->string('description', 255)->nullable();

            $table->string('type', 16)->default('percentage'); // percentage | fixed
            $table->decimal('value', 10, 2)->default(0);
            // Only meaningful for `fixed`; null for percentages.
            $table->string('currency', 3)->nullable();

            // Null = every plan, including ones created later.
            $table->json('applicable_plans')->nullable();

            // Null = unlimited. 0 would read as "none allowed", which is a
            // different and much more dangerous thing to default to.
            $table->unsignedInteger('usage_limit')->nullable();
            $table->unsignedInteger('per_user_limit')->nullable()->default(1);
            $table->unsignedInteger('used_count')->default(0);

            // Minimum order value before the coupon applies at all.
            $table->decimal('min_amount', 10, 2)->nullable();

            $table->timestamp('valid_from')->nullable();
            $table->timestamp('valid_until')->nullable(); // null = no expiry
            $table->boolean('is_active')->default(true);

            $table->timestamps();

            // Every lookup is by code; the listing filters on status and date.
            $table->index('is_active', 'idx_coupons_active');
            $table->index('valid_until', 'idx_coupons_valid_until');
        });

        Schema::create('coupon_redemptions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('coupon_id')->constrained('coupons')->cascadeOnDelete();
            $table->unsignedBigInteger('user_id');
            $table->string('plan_key', 64)->nullable();

            // What was ACTUALLY taken off, in the currency it was taken off in.
            // Recomputing this later from `value` would be wrong the moment a
            // price or an exchange rate moves.
            $table->decimal('amount_discounted', 10, 2)->default(0);
            $table->string('currency', 3)->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->foreign('user_id')->references('id')->on('users')->cascadeOnDelete();

            // Per-user limits are checked with exactly this pair.
            $table->index(['coupon_id', 'user_id'], 'idx_coupon_redemptions_pair');
            $table->index('created_at', 'idx_coupon_redemptions_created');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('coupon_redemptions');
        Schema::dropIfExists('coupons');
    }
};
