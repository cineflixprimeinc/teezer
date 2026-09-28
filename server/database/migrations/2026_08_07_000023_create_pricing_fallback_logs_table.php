<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Which markets are being quoted in USD because we cannot convert for them.
 *
 * This is a demand signal, not an error log. Frankfurter publishes ECB
 * currencies only, so NPR - the home market - and ~16 others have no rate and
 * fall back to USD. That fallback is correct and users see a valid price, which
 * is exactly why it would otherwise be invisible: nothing breaks, so nobody
 * finds out that Nepal is being quoted in dollars.
 *
 * AGGREGATED, NOT APPEND-ONLY. One row per (country, currency, reason, day)
 * with a counter, rather than a row per request. At millions of users an
 * append-only table would write millions of rows a day to record perhaps twenty
 * distinct facts, and the write would sit on the pricing hot path. The unique
 * key makes the upsert idempotent and keeps the table proportional to markets,
 * not traffic.
 *
 * `reason` distinguishes the cases the fallback strategy separates:
 *   unsupported  - the provider does not publish this currency at all
 *   no_rate      - supported in principle, but no rate has ever been stored
 *   stale        - a rate exists but is older than the freshness window
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pricing_fallback_logs', function (Blueprint $table) {
            $table->id();
            $table->string('country_code', 2)->nullable();
            $table->string('currency_code', 3);
            $table->string('reason', 24)->default('unsupported');
            // Requests seen for this market on this day.
            $table->unsignedBigInteger('hits')->default(0);
            $table->date('day');
            $table->timestamps();

            $table->unique(['country_code', 'currency_code', 'reason', 'day'], 'pricing_fallback_unique');
            $table->index(['day', 'hits']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pricing_fallback_logs');
    }
};
