<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Crypt;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Encrypt creator_payout_methods.details at rest.
 *
 * The column holds bank account numbers, wallet phone numbers and PayPal/Stripe/
 * Wise addresses in plain JSON, while tax_forms.tax_id right next door is already
 * encrypted. This closes that gap.
 *
 * Two steps, and the order matters:
 *   1. Widen json -> text. An encrypted payload is base64, not valid JSON, and
 *      Postgres rejects it in a json column.
 *   2. Encrypt what is already stored. The existing raw value is json_encode($array),
 *      which is exactly what the cast wraps, so the stored string is encrypted as-is.
 *
 * Re-runnable: rows that already decrypt are skipped, so a partial run can be
 * repeated safely.
 */
return new class extends Migration
{
    public function up(): void
    {
        $this->retype('text');

        $this->eachRow(function (object $row) {
            if ($this->isEncrypted($row->details)) {
                return; // already converted
            }

            DB::table('creator_payout_methods')
                ->where('id', $row->id)
                ->update(['details' => Crypt::encryptString($row->details)]);
        });
    }

    public function down(): void
    {
        // Decrypt first: the values must be valid JSON again before the column can
        // be narrowed back to json.
        $this->eachRow(function (object $row) {
            if (! $this->isEncrypted($row->details)) {
                return; // never converted
            }

            DB::table('creator_payout_methods')
                ->where('id', $row->id)
                ->update(['details' => Crypt::decryptString($row->details)]);
        });

        $this->retype('json');
    }

    /** Walk every non-null details row in stable id order. */
    private function eachRow(callable $fn): void
    {
        DB::table('creator_payout_methods')
            ->whereNotNull('details')
            ->orderBy('id')
            ->select('id', 'details')
            ->chunk(200, function ($rows) use ($fn) {
                foreach ($rows as $row) {
                    if ($row->details !== null && $row->details !== '') {
                        $fn($row);
                    }
                }
            });
    }

    private function isEncrypted(string $value): bool
    {
        try {
            Crypt::decryptString($value);

            return true;
        } catch (\Throwable) {
            return false;
        }
    }

    /** json <-> text, spelled per driver: Postgres needs an explicit USING. */
    private function retype(string $type): void
    {
        $table = 'creator_payout_methods';

        switch (Schema::getConnection()->getDriverName()) {
            case 'pgsql':
                DB::statement("ALTER TABLE {$table} ALTER COLUMN details TYPE {$type} USING details::{$type}");
                break;
            case 'mysql':
            case 'mariadb':
                DB::statement("ALTER TABLE {$table} MODIFY details " . strtoupper($type) . ' NULL');
                break;
            default:
                // sqlite (tests) is dynamically typed - the column already accepts
                // both forms, so there is nothing to alter.
                break;
        }
    }
};
