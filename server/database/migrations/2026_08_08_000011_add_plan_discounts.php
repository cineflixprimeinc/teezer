<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Admin-set plan discounts.
 *
 * There was no discount system at all. The "You Save (33%)" the website shows
 * is computed in the browser as (monthly x 12) - annual - a COMPARISON against
 * twelve hypothetical monthly payments, not a discount anyone configured. It
 * was then rendered as a negative line item in the billing summary, where the
 * arithmetic does not close: 39.99 - 19.89 + 0.00 is 20.10, while the total
 * printed underneath said 39.99.
 *
 * A discount has to be a real, stored intention rather than a derived
 * comparison, or nobody can answer "who decided this and when".
 *
 * ── compare_at, not percent_off ─────────────────────────────────────────────
 *
 * The column stores the price the plan is being discounted FROM, not a
 * percentage. Three reasons:
 *
 *   1. It is what an admin actually decides ("this was $39.99, now $24.99").
 *   2. The percentage is then derived and always consistent with the money -
 *      storing a percent means rounding it into a price and having the two
 *      disagree by a cent.
 *   3. It survives a base price change honestly: raise the price and the
 *      discount shrinks, which is true, rather than silently re-applying 33%
 *      to a new number nobody re-approved.
 *
 * NULL means no discount. Zero would be a real price of zero, which is a
 * different statement.
 *
 * Per-surface, like base_price_usd and app_price_usd already are, because the
 * app may be priced to absorb the store cut and its "was" price has to match
 * the base it is being compared against.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->decimal('compare_at_price_usd', 10, 2)->nullable()->after('app_price_usd');
            $table->decimal('compare_at_app_price_usd', 10, 2)->nullable()->after('compare_at_price_usd');
            // Shown next to the strikethrough ("Launch offer"). Free text, so a
            // new campaign does not need a migration.
            $table->string('discount_label', 40)->nullable()->after('compare_at_app_price_usd');
        });

        Schema::table('plan_price_overrides', function (Blueprint $table) {
            // A country price can be discounted too - "was NPR 999, now NPR 499"
            // - and that "was" belongs beside the price it qualifies rather than
            // being inferred from the USD base and a rate.
            $table->decimal('compare_at_price', 10, 2)->nullable()->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('plan_price_overrides', function (Blueprint $table) {
            $table->dropColumn('compare_at_price');
        });
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn(['compare_at_price_usd', 'compare_at_app_price_usd', 'discount_label']);
        });
    }
};
