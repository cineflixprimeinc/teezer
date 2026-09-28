<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Make the IAP receipt-replay guard actually enforceable.
 *
 * VerificationPaymentController::verifyIap checks "has this transaction id already been
 * used?" with a bare ->exists(), outside any transaction and with no lock. Two concurrent
 * POSTs carrying the SAME Apple/Google receipt both read "no", and both insert a `paid`
 * row: one purchase, two verified accounts. An application-level check is not a
 * uniqueness guarantee - only the database can make that promise.
 *
 * Partial index (WHERE payment_reference IS NOT NULL) because a pending card payment may
 * legitimately have no reference yet, and NULLs must not collide.
 *
 * This mirrors wallet_transactions_reference_id_unique, which is the pattern that already
 * protects coin credits from being double-applied.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    public function up(): void
    {
        // De-dupe first - a unique index cannot be created over existing duplicates.
        // Keeps the earliest row of each reference; there are none in practice today, but
        // a migration that assumes clean data is a migration that fails on the one box
        // where it isn't.
        DB::statement(<<<'SQL'
            DELETE FROM verification_payments a
            USING verification_payments b
            WHERE a.payment_reference IS NOT NULL
              AND a.payment_reference = b.payment_reference
              AND a.id > b.id
        SQL);

        DB::statement(<<<'SQL'
            CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS
                verification_payments_payment_reference_unique
            ON verification_payments (payment_reference)
            WHERE payment_reference IS NOT NULL
        SQL);
    }

    public function down(): void
    {
        DB::statement('DROP INDEX CONCURRENTLY IF EXISTS verification_payments_payment_reference_unique');
    }
};
