<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The global pricing system's reference data.
 *
 * Four tables in one migration because they are one subsystem and are useless
 * apart - a currency with no country mapping and no rate converts nothing. The
 * repo's usual one-table-per-migration rule is relaxed here deliberately rather
 * than by accident.
 *
 * THE RULE THIS ENFORCES: USD is the only price ever stored on a product. These
 * tables describe how to *present* that price elsewhere; none of them holds a
 * product price, and none of them may. A local price is derived per request and
 * cached, never persisted against a plan.
 *
 * WHAT THIS DOES NOT COVER: App Store and Play Billing. Those set their own
 * local prices from their own tier tables and will not accept an amount from
 * us, so mobile purchases price themselves - see subscription_plans'
 * ios_product_id / android_product_id. This subsystem serves the website and
 * the card processors, where we actually control the charge.
 */
return new class extends Migration
{
    public function up(): void
    {
        // The currencies we are willing to display. Not every ISO-4217 code -
        // only ones an admin has enabled, so a bad country mapping cannot make
        // the site quote a currency nobody checked.
        Schema::create('currencies', function (Blueprint $table) {
            $table->id();
            $table->string('code', 3)->unique();          // USD, NPR, INR
            $table->string('name');
            $table->string('symbol', 8);                  // $, Rs., ₹
            /**
             * Where the symbol goes and how the number reads. Stored rather
             * than inferred: ¥580 has no decimals, Rs. 689 has none by
             * convention, $4.99 has two, and no rule derives all three.
             */
            $table->boolean('symbol_before')->default(true);
            $table->unsignedTinyInteger('decimals')->default(2);
            $table->string('thousands_separator', 2)->default(',');
            $table->string('decimal_separator', 2)->default('.');
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();
        });

        // Country → currency. Its own table rather than a column on countries
        // because the mapping is the thing admins edit, and several countries
        // legitimately share one currency (the euro zone).
        Schema::create('country_currency_map', function (Blueprint $table) {
            $table->id();
            $table->string('country_code', 2)->unique();  // ISO-3166-1 alpha-2, as CF-IPCountry sends
            $table->string('currency_code', 3);
            $table->string('country_name');
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->index('currency_code');
        });

        /**
         * Rates against the base (USD). One row per currency, overwritten by the
         * refresh worker - history lives in pricing_logs, not here, so this
         * table stays exactly as large as the currency list.
         *
         * `fetched_at` is the staleness signal: when the provider is down the
         * worker leaves the old row alone and the service keeps quoting it
         * rather than breaking checkout. A rate that is merely old is far better
         * than no price at all.
         */
        Schema::create('exchange_rates', function (Blueprint $table) {
            $table->id();
            $table->string('base_code', 3)->default('USD');
            $table->string('target_code', 3);
            // 18,8: JPY needs few decimals, but a weak currency against USD
            // needs the precision on the other side of the point.
            $table->decimal('rate', 18, 8);
            $table->string('provider', 32)->nullable();
            $table->timestamp('fetched_at')->nullable();
            $table->timestamps();

            $table->unique(['base_code', 'target_code']);
        });

        /**
         * How a converted number becomes a price. 689.23 is arithmetic; Rs. 689
         * or Rs. 699 is a pricing decision, and it differs per market.
         *
         * `strategy` values:
         *   none      - keep the converted value
         *   nearest   - round to the nearest `step`
         *   up        - always round up to `step`      (most common)
         *   charm     - round up to `step` then subtract `charm_delta`
         *               (699 → 699, or 700 - 1 = 699)
         */
        Schema::create('rounding_rules', function (Blueprint $table) {
            $table->id();
            // Null country = the default rule for that currency everywhere.
            $table->string('country_code', 2)->nullable();
            $table->string('currency_code', 3);
            $table->string('strategy', 16)->default('up');
            $table->decimal('step', 12, 2)->default(1);
            $table->decimal('charm_delta', 12, 2)->default(0);
            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->unique(['country_code', 'currency_code']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rounding_rules');
        Schema::dropIfExists('exchange_rates');
        Schema::dropIfExists('country_currency_map');
        Schema::dropIfExists('currencies');
    }
};
