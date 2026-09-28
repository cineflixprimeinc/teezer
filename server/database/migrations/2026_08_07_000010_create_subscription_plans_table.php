<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * The premium plan catalogue - Starter / Pro / Studio.
 *
 * Until now "premium" was a single product billed monthly or annually: two
 * numbers in AdminCoinSetting (subscription_monthly_price / _annual_price) and
 * a `plan` column on `subscriptions` typed 'monthly'|'annual'. The premium page
 * asks for something that store cannot express - several tiers, each with its
 * own price, its own feature list and its own position in a comparison table.
 *
 * Hence real rows. A tier is an entity here, not a settings key, because the
 * page needs to order them, mark one most-popular, pre-select one, and map each
 * to its own store product. None of that fits a flat key/value store.
 *
 * DELIBERATELY NOT TOUCHING `subscriptions`: existing rows keep their
 * 'monthly'|'annual' plan values and every current subscriber stays valid. This
 * table is additive - it describes what can be bought, not what has been.
 * Reconciling the two is a separate decision about live billing.
 *
 * `key` is the stable identifier the app and the comparison table reference, so
 * it is unique and is never reused for a different tier once published.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('subscription_plans', function (Blueprint $table) {
            $table->id();
            $table->string('key')->unique();
            $table->string('name');
            $table->string('tagline')->nullable();

            // Money is decimal, never float - 249.00 must stay 249.00.
            $table->decimal('price', 10, 2)->default(0);
            $table->string('currency', 3)->default('NPR');
            // 'month' | 'year'. Stored per plan so a yearly tier can sit beside
            // monthly ones without a second pricing concept.
            $table->string('period', 16)->default('month');

            // Plain list of strings, rendered as the ticked rows on the card.
            $table->json('features')->nullable();

            // The design's "★ MOST POPULAR" ribbon. Text is stored rather than
            // hardcoded so it can become "BEST VALUE" without an app release.
            $table->boolean('is_popular')->default(false);
            $table->string('badge_label')->nullable();

            // Which card opens selected. Enforced as "first one wins" in the
            // controller rather than by constraint, so admin edits cannot lock
            // themselves out with a validation error mid-change.
            $table->boolean('is_default')->default(false);

            // The design draws Studio as a dark card and the others light.
            // 'light' | 'dark'.
            $table->string('theme', 16)->default('light');

            // Store product ids - purchases run through IAP (react-native-iap),
            // so a tier is only buyable once these are filled in. Nullable
            // because a tier can be authored before the store listing exists.
            $table->string('ios_product_id')->nullable();
            $table->string('android_product_id')->nullable();

            $table->unsignedInteger('sort')->default(0);
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            $table->index(['is_enabled', 'sort']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('subscription_plans');
    }
};
