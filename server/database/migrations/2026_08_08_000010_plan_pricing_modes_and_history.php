<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pricing mode, per-cycle country overrides, and price history.
 *
 * Extends what already exists rather than adding a parallel system:
 * `subscription_plans.base_price_usd` stays THE global base, PricingService
 * stays the only converter, and `plan_price_overrides` keeps its name and its
 * job. Nothing here introduces a second source of truth for a price.
 *
 * ── Why plan_price_overrides is recreated rather than altered ───────────────
 *
 * It needs `billing_cycle` inside its unique keys, and adding a column to an
 * existing UNIQUE is an index rebuild that SQLite (the test database) cannot do
 * in place. The table was created earlier today and has ZERO rows in
 * production - verified before writing this - so recreating it loses nothing.
 * If it had held data this would have been an ALTER plus a backfill instead.
 *
 * ── pricing_mode ────────────────────────────────────────────────────────────
 *
 * 'global'  - one USD base, converted per country by the existing rate system.
 * 'country' - the same, PLUS manual prices for the countries that have one.
 *
 * Note that 'country' does not mean "every country must be configured". The
 * resolution order is unchanged either way; the mode only decides whether
 * overrides are CONSULTED. That makes switching back to global a one-field
 * change that leaves the configured prices intact for later, instead of
 * requiring the admin to delete and re-enter them.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->string('pricing_mode', 16)->default('global')->after('app_price_usd');
        });

        // Safe: verified empty in production before writing this migration.
        Schema::dropIfExists('plan_price_overrides');

        Schema::create('plan_price_overrides', function (Blueprint $table) {
            $table->id();
            $table->foreignId('subscription_plan_id')->constrained('subscription_plans')->cascadeOnDelete();

            // Exactly one of these carries the rule. Country beats currency at
            // resolution time, because a country is the narrower statement.
            $table->string('country_code', 2)->nullable();
            $table->string('currency_code', 3)->nullable();

            // month | year. Not derived from the plan's own period: a plan can
            // be offered on more than one cycle, and a country price for the
            // yearly cycle is a different number from the monthly one.
            $table->string('billing_cycle', 8)->default('month');

            // The amount actually charged, in the market's currency. A fixed
            // price, never a multiplier - a multiplier would drift with the
            // rate it was derived from.
            $table->decimal('price', 10, 2);

            // Web and app may be priced differently to absorb the store cut,
            // exactly as base_price_usd and app_price_usd already are.
            $table->string('surface', 8)->default('web');

            // Optional window. Null start = already live, null end = no expiry.
            $table->timestamp('effective_from')->nullable();
            $table->timestamp('expires_at')->nullable();

            $table->string('note', 255)->nullable();
            $table->boolean('is_enabled')->default(true);
            $table->timestamps();

            // One rule per (plan, market, cycle, surface). Without billing_cycle
            // in the key, a monthly and a yearly price for one country would
            // collide and the second would overwrite the first.
            $table->unique(['subscription_plan_id', 'country_code', 'billing_cycle', 'surface'], 'uq_ppo_country');
            $table->unique(['subscription_plan_id', 'currency_code', 'billing_cycle', 'surface'], 'uq_ppo_currency');
            $table->index(['subscription_plan_id', 'billing_cycle'], 'idx_ppo_plan_cycle');
        });

        /**
         * Append-only price history.
         *
         * Separate from AdminActionLog, which is a general audit trail: this is
         * queried as pricing data ("what did Nepal cost in March"), needs to be
         * filterable by plan and country, and must survive independently of how
         * the audit log is pruned. Both are written on every change - the audit
         * log answers "who did what", this answers "what was the price".
         */
        Schema::create('plan_price_history', function (Blueprint $table) {
            $table->id();
            $table->unsignedBigInteger('subscription_plan_id');
            $table->string('plan_key', 64)->nullable();

            // Null country = a change to the global base price.
            $table->string('country_code', 2)->nullable();
            $table->string('currency_code', 3)->nullable();
            $table->string('billing_cycle', 8)->nullable();
            $table->string('surface', 8)->nullable();

            // Nullable on both sides: a created override has no old price, a
            // deleted one has no new price, and forcing 0 into either would be
            // indistinguishable from a real price of zero.
            $table->decimal('old_price', 10, 2)->nullable();
            $table->decimal('new_price', 10, 2)->nullable();

            $table->string('pricing_mode', 16)->nullable();
            $table->string('action', 24); // created | updated | deleted | mode_changed | bulk
            $table->unsignedBigInteger('changed_by')->nullable();
            $table->string('note', 255)->nullable();
            $table->timestamp('created_at')->useCurrent();

            // Plan is NOT a cascading FK: history must outlive the plan it
            // describes, or deleting a tier would erase the record of what it
            // used to cost.
            $table->foreign('changed_by')->references('id')->on('users')->nullOnDelete();

            $table->index(['subscription_plan_id', 'created_at'], 'idx_pph_plan_time');
            $table->index('country_code', 'idx_pph_country');
        });

        // Existing plans keep behaving exactly as before: one USD base,
        // converted. Stated explicitly rather than relying on the column
        // default, so a re-run cannot leave a row without a mode.
        DB::table('subscription_plans')->whereNull('pricing_mode')->update(['pricing_mode' => 'global']);
    }

    public function down(): void
    {
        Schema::dropIfExists('plan_price_history');
        Schema::dropIfExists('plan_price_overrides');
        Schema::table('subscription_plans', function (Blueprint $table) {
            $table->dropColumn('pricing_mode');
        });
    }
};
