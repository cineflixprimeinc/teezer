<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Moves subscription_plans onto a USD base price.
 *
 * The table was created earlier today storing a local price per row - Starter
 * 249 NPR, Pro 499, Studio 1290 - which is exactly the "a price per country"
 * shape the global pricing system forbids. USD becomes the single source of
 * truth; every other currency is derived per request from exchange_rates and
 * rounding_rules and is never persisted against a plan.
 *
 * `price` and `currency` are deliberately LEFT IN PLACE and not dropped:
 *
 *  - The live premium page and PremiumController read them right now, and
 *    dropping them mid-deploy would empty the page between the migration and
 *    the code that replaces it.
 *  - subscriptions rows written before this point recorded the price actually
 *    charged in the currency actually charged. That history must stay readable.
 *
 * They become legacy display hints once the pricing service is wired, and can
 * be retired in a later, separate migration once nothing reads them.
 *
 * NOT backfilled here on purpose. A rate-converted figure is almost never the
 * price a business wants to charge - 249 NPR is ~1.79 USD, and nobody sells a
 * tier at $1.79; they sell it at $1.99. Auto-filling would bake a nonsense
 * price point into the source of truth and it would be believed. Left null for
 * an administrator to set deliberately in Monetization → Premium Subscription;
 * until then the plan keeps quoting its existing local price.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->decimal('base_price_usd', 10, 2)->nullable()->after('key');
        });
    }

    public function down(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('base_price_usd');
        });
    }
};
