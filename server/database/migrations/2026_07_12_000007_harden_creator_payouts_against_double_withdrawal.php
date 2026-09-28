<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Two independent defences against a creator being paid twice for the same balance.
 *
 * 1. idempotency_key - a retried or double-tapped withdraw request carries the same
 *    key and is rejected by the unique index instead of creating a second payout.
 *
 * 2. A CHECK constraint that forbids a negative balance outright. The application now
 *    takes a row lock and re-checks inside the transaction, but this is the backstop:
 *    if any future code path forgets the lock, Postgres refuses the write rather than
 *    quietly paying out money the creator does not have.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('creator_payouts', function (Blueprint $table) {
            $table->string('idempotency_key', 64)->nullable()->after('user_id');
        });

        // Unique per user, not globally: two different creators must be free to send
        // the same client-generated key without colliding.
        DB::statement('CREATE UNIQUE INDEX creator_payouts_user_idempotency_key_unique
                       ON creator_payouts (user_id, idempotency_key)
                       WHERE idempotency_key IS NOT NULL');

        DB::statement('ALTER TABLE creator_wallets
                       ADD CONSTRAINT creator_wallets_available_balance_non_negative
                       CHECK (available_balance >= 0)');

        DB::statement('ALTER TABLE creator_wallets
                       ADD CONSTRAINT creator_wallets_pending_balance_non_negative
                       CHECK (pending_balance >= 0)');
    }

    public function down(): void
    {
        DB::statement('ALTER TABLE creator_wallets DROP CONSTRAINT IF EXISTS creator_wallets_pending_balance_non_negative');
        DB::statement('ALTER TABLE creator_wallets DROP CONSTRAINT IF EXISTS creator_wallets_available_balance_non_negative');
        DB::statement('DROP INDEX IF EXISTS creator_payouts_user_idempotency_key_unique');

        Schema::table('creator_payouts', function (Blueprint $table) {
            $table->dropColumn('idempotency_key');
        });
    }
};
