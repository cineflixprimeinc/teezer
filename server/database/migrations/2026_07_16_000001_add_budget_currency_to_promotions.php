<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Advertisers may enter a budget in their local currency, but the delivery engine
 * settles everything in USD. We now convert to USD at creation time and store the
 * USD result as canonical (`daily_budget` / `total_budget` / `currency = USD`),
 * while keeping what the advertiser actually chose here so the app can show
 * "You set NPR 1,000 ≈ $7.50 / day".
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            // The currency the advertiser chose in the wizard (e.g. NPR). `currency`
            // stays the canonical settlement currency (USD).
            if (! Schema::hasColumn('promotions', 'budget_currency')) {
                $table->string('budget_currency', 10)->nullable()->after('currency');
            }
            // The amounts as the advertiser typed them, in `budget_currency`.
            if (! Schema::hasColumn('promotions', 'daily_budget_original')) {
                $table->decimal('daily_budget_original', 14, 2)->nullable()->after('budget_currency');
            }
            if (! Schema::hasColumn('promotions', 'total_budget_original')) {
                $table->decimal('total_budget_original', 14, 2)->nullable()->after('daily_budget_original');
            }
            // USD value of one unit of budget_currency at creation time (audit trail).
            if (! Schema::hasColumn('promotions', 'fx_rate_to_usd')) {
                $table->decimal('fx_rate_to_usd', 18, 8)->nullable()->after('total_budget_original');
            }
        });
    }

    public function down(): void
    {
        Schema::table('promotions', function (Blueprint $table) {
            foreach (['budget_currency', 'daily_budget_original', 'total_budget_original', 'fx_rate_to_usd'] as $col) {
                if (Schema::hasColumn('promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
