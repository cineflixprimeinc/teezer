<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Defense-in-depth idempotency for coin credits.
 *
 * creditPurchasedCoins() writes a WalletTransaction with reference_id =
 * "order_{id}". A unique index on reference_id makes a duplicate credit for the
 * same order physically impossible at the DB level - a second insert throws a
 * unique violation and the wrapping transaction rolls back. Partial (WHERE NOT
 * NULL) so the many transaction types that legitimately have a NULL reference
 * are unaffected.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (!Schema::hasTable('wallet_transactions')) {
            return;
        }
        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('CREATE UNIQUE INDEX IF NOT EXISTS wallet_transactions_reference_id_unique ON wallet_transactions (reference_id) WHERE reference_id IS NOT NULL');
        } else {
            // MySQL allows multiple NULLs in a unique index, so a plain unique
            // index has the same effect (legacy path; prod is Postgres).
            Schema::table('wallet_transactions', function ($table) {
                $table->unique('reference_id', 'wallet_transactions_reference_id_unique');
            });
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            DB::statement('DROP INDEX IF EXISTS wallet_transactions_reference_id_unique');
        } else {
            Schema::table('wallet_transactions', function ($table) {
                $table->dropUnique('wallet_transactions_reference_id_unique');
            });
        }
    }
};
