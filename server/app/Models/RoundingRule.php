<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * How a converted number becomes a price.
 *
 * Conversion is arithmetic; 689.23 → Rs. 699 is a pricing decision, and it
 * differs per market. A rule with a country_code beats the currency-wide
 * default, so one market can be tuned without disturbing the rest.
 */
class RoundingRule extends Model
{
    protected $fillable = [
        'country_code', 'currency_code', 'strategy', 'step', 'charm_delta', 'sort', 'is_enabled',
    ];

    protected function casts(): array
    {
        return [
            'step'        => 'decimal:2',
            'charm_delta' => 'decimal:2',
            'is_enabled'  => 'boolean',
        ];
    }

    /**
     * Applies this rule. Never returns below zero - a charm delta larger than
     * the price itself would otherwise produce a negative one.
     */
    public function apply(float $amount): float
    {
        $step = (float) $this->step ?: 1.0;

        $out = match ($this->strategy) {
            'none'    => $amount,
            'nearest' => round($amount / $step) * $step,
            'charm'   => (ceil($amount / $step) * $step) - (float) $this->charm_delta,
            default   => ceil($amount / $step) * $step, // 'up'
        };

        return max(0, $out);
    }
}
