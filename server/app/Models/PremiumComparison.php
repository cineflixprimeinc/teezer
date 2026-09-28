<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One row of the "FREE VS PREMIUM" matrix.
 *
 * `values` is keyed by SubscriptionPlan.key; a tier absent from the map renders
 * as a dash, which is a real answer ("not included") rather than missing data.
 */
class PremiumComparison extends Model
{
    protected $fillable = ['label', 'values', 'highlight_plan', 'sort', 'is_enabled'];

    protected function casts(): array
    {
        return [
            'values'     => 'array',
            'is_enabled' => 'boolean',
        ];
    }

    public function scopeEnabled($query)
    {
        return $query->where('is_enabled', true);
    }
}
