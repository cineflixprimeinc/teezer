<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\DB;

/**
 * A daily counter of "this market got a USD price because we could not convert".
 *
 * Aggregated per (country, currency, reason, day) so the table stays
 * proportional to the number of markets rather than to traffic.
 */
class PricingFallbackLog extends Model
{
    protected $fillable = ['country_code', 'currency_code', 'reason', 'hits', 'day'];

    protected function casts(): array
    {
        return ['day' => 'date', 'hits' => 'integer'];
    }

    /**
     * Records one fallback. A single atomic upsert - no read, no transaction,
     * no lock - so concurrent requests cannot lose counts to a race, and the
     * pricing path pays for one statement.
     */
    public static function record(?string $country, string $currency, string $reason): void
    {
        DB::statement(
            'INSERT INTO pricing_fallback_logs
                 (country_code, currency_code, reason, hits, day, created_at, updated_at)
             VALUES (?, ?, ?, 1, CURRENT_DATE, now(), now())
             ON CONFLICT (country_code, currency_code, reason, day)
             DO UPDATE SET hits = pricing_fallback_logs.hits + 1, updated_at = now()',
            [$country, strtoupper($currency), $reason],
        );
    }
}
