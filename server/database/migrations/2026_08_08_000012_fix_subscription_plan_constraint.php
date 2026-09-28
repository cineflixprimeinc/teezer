<?php

use Illuminate\Support\Facades\DB;
use Illuminate\Database\Migrations\Migration;

/**
 * Let `subscriptions.plan` hold the value the code actually writes.
 *
 * 2025_05_24_000025 declared the column as enum('monthly','yearly'), which
 * PostgreSQL implements as a CHECK constraint. Every write path, however,
 * stores 'annual': the intent endpoint validates Rule::in(['monthly','annual']),
 * the IAP path maps a yearly tier to 'annual', and createOrRenewSubscription
 * branches on it.
 *
 * So on any database built from migrations, buying an annual subscription
 * throws a check violation AFTER the payment has been captured - money taken,
 * no subscription. Production is unaffected only by accident: its constraint is
 * absent (dropped at some point, or the table predates it), which is why this
 * has never fired. There are zero subscriptions in production today.
 *
 * ── Why widen the constraint instead of changing the code ───────────────────
 *
 * Storing 'yearly' looked cleaner, but the stored value is READ in places that
 * key off it - PremiumBonusService::PERIODS is ['monthly' => 1, 'annual' => 12]
 * and decides how many months of bonus coins a subscriber is owed. Renaming the
 * stored value without catching that lookup would quietly pay annual members
 * ONE month of coins instead of twelve: a worse bug than the one being fixed,
 * and a silent one. Widening the column touches nothing that reads it.
 *
 * 'yearly' stays permitted so any historical row keeps validating.
 *
 * PostgreSQL only. SQLite cannot ALTER a CHECK constraint - it would need the
 * table rebuilt - and the test database is recreated from migrations each run,
 * where this constraint is the only thing that would reject 'annual'. Skipping
 * it there leaves the column unconstrained, which is exactly what production
 * has today.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        // Rows that would fail the new constraint. There should be none - the
        // set below is a superset of what was allowed before plus what the code
        // writes - but adding a constraint that existing data violates would
        // abort the migration, so this refuses loudly rather than half-applying.
        $bad = DB::table('subscriptions')
            ->whereNotNull('plan')
            ->whereNotIn('plan', ['monthly', 'yearly', 'annual'])
            ->count();

        if ($bad > 0) {
            throw new RuntimeException(
                "Refusing to add subscriptions_plan_check: {$bad} row(s) hold a plan outside "
                . "monthly/yearly/annual. Inspect them first - widening the constraint would "
                . 'either fail or lock in a value nothing reads.'
            );
        }

        DB::statement('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check');
        DB::statement(
            "ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_plan_check "
            . "CHECK (plan IN ('monthly', 'yearly', 'annual'))"
        );
    }

    public function down(): void
    {
        if (DB::connection()->getDriverName() !== 'pgsql') {
            return;
        }

        // Back to the original pair. Any 'annual' row would now violate it, so
        // this drops the constraint rather than re-adding one the data cannot
        // satisfy - a rollback must not fail on rows the migration itself made
        // possible.
        DB::statement('ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_check');
    }
};
