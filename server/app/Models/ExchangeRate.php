<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One rate per currency against the base, overwritten by the refresh worker.
 *
 * `fetched_at` is the staleness signal. When the provider is unreachable the
 * worker leaves the row alone and the pricing service keeps quoting it: an old
 * rate is a far better outcome than a checkout that cannot price itself.
 */
class ExchangeRate extends Model
{
    protected $fillable = ['base_code', 'target_code', 'rate', 'provider', 'fetched_at'];

    protected function casts(): array
    {
        return [
            'rate'       => 'decimal:8',
            'fetched_at' => 'datetime',
        ];
    }

    public function isStale(int $hours = 24): bool
    {
        return $this->fetched_at === null || $this->fetched_at->lt(now()->subHours($hours));
    }
}
