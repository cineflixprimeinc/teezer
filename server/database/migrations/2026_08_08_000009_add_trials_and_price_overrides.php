<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Per-plan trials, and per-market price overrides.
 *
 * Both existed only as globals. The trial length was one number for the whole
 * product (`premium_trial_days`), and every price was one USD base converted by
 * live rates - so "14 days on Studio, 7 on Starter" and "₹999 in India rather
 * than whatever the rate says today" were simply not expressible.
 *
 * ── trial_days ──────────────────────────────────────────────────────────────
 *
 * NULL means "use the global", not "no trial". That distinction matters: 0 is a
 * real, different answer meaning this plan has no trial at all, and collapsing
 * the two would make it impossible to turn a trial off on one tier without
 * turning it off everywhere.
 *
 * ── plan_price_overrides ────────────────────────────────────────────────────
 *
 * One row fixes a price for a market, bypassing conversion entirely. Rows key
 * on EITHER a country or a currency, resolved most-specific first:
 *
 *   1. country_code matches  -> that price          (IN -> ₹999)
 *   2. currency_code matches -> that price          (every EUR market -> €4.99)
 *   3. neither               -> convert the USD base, as today
 *
 * Country beats currency because a country is the narrower statement: India and
 * Nepal can both be quoted in their own currency, but "all EUR countries" must
 * not override a price someone set for one specific EUR country.
 *
 * A fixed price is stored, not a discount or a multiplier, because that is what
 * an admin actually decides - "charge ₹999 here" - and a multiplier would drift
 * with the exchange rate it was derived from.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            // Null = inherit the global premium_trial_days. 0 = no trial here.
            $table->unsignedSmallInteger('trial_days')->nullable()->after('period');
        });

        Schema::create('plan_price_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_plan_id')->constrained('subscription_plans')->cascadeOnDelete();

            // Exactly one of these carries the rule; the other stays null.
            $table->string('country_code', 2)->nullable();
            $table->string('currency_code', 3)->nullable();

            // The amount actually charged, in `currency_code` (or in the
            // country's currency when keyed by country).
            $table->decimal('price', 10, 2);

            // Which surface this price is for - the app may be priced higher to
            // absorb the store cut, exactly like base_price_usd vs app_price_usd.
            $table->string('surface', 8)->default('web');

            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            // One rule per (plan, market, surface). The editor upserts on this,
            // so a double-submit cannot leave two prices competing for one
            // country - which would make the quote depend on row order.
            $table->unique(['subscription_plan_id', 'country_code', 'surface'], 'uq_plan_price_country');
            $table->unique(['subscription_plan_id', 'currency_code', 'surface'], 'uq_plan_price_currency');
            $table->index('subscription_plan_id', 'idx_plan_price_overrides_plan');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_price_overrides');
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('trial_days');
        });
    }
};
