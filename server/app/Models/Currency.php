<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * A displayable currency and how to format it.
 *
 * Holds no product price. Prices live in USD on the product; this describes how
 * a converted number is written down.
 */
class Currency extends Model
{
    protected $fillable = [
        'code', 'name', 'symbol', 'symbol_before', 'decimals',
        'thousands_separator', 'decimal_separator', 'is_enabled',
    ];

    protected function casts(): array
    {
        return [
            'symbol_before' => 'boolean',
            'decimals'      => 'integer',
            'is_enabled'    => 'boolean',
        ];
    }

    public function scopeEnabled($q)
    {
        return $q->where('is_enabled', true);
    }

    /** Formats an already-converted, already-rounded amount for display. */
    public function format(float $amount): string
    {
        $n = number_format($amount, $this->decimals, $this->decimal_separator, $this->thousands_separator);

        return $this->symbol_before ? $this->symbol . $n : $n . ' ' . $this->symbol;
    }
}
