<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * A separate app price, when the business wants one.
 *
 * `base_price_usd` is the web price and the default for everything.
 * `app_price_usd` is NULL when the app should charge the same, and set when it
 * should not.
 *
 * ONE NULLABLE COLUMN RATHER THAN A MODE FLAG. A `price_mode = same|separate`
 * plus two prices can disagree with itself - mode 'same' with two different
 * numbers stored is a state nobody can interpret, and it eventually happens.
 * Null means "same" and cannot drift; clearing the field is how an admin
 * re-links them.
 *
 * WHY A DIFFERENT APP PRICE IS COMMON: Apple and Google take 15-30%, so the
 * same take-home needs a higher list price in-app. Spotify and Netflix priced
 * exactly this way before they stopped selling in-app at all.
 *
 * This is still a USD base price on both sides. Local currency is derived per
 * request from exchange_rates and rounding_rules and is never stored here.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->decimal('app_price_usd', 10, 2)->nullable()->after('base_price_usd');
        });
    }

    public function down(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('app_price_usd');
        });
    }
};
