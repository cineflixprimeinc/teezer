<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdInvoice extends Model
{
    protected $fillable = [
        'ad_account_id', 'number', 'period_start', 'period_end',
        'amount_cents', 'tax_cents', 'total_cents', 'currency',
        'status', 'gateway', 'gateway_ref', 'issued_at', 'paid_at', 'meta',
    ];

    protected $casts = [
        'period_start' => 'date',
        'period_end'   => 'date',
        'amount_cents' => 'integer',
        'tax_cents'    => 'integer',
        'total_cents'  => 'integer',
        'issued_at'    => 'datetime',
        'paid_at'      => 'datetime',
        'meta'         => 'array',
    ];

    public function account(): BelongsTo
    {
        return $this->belongsTo(AdAccount::class, 'ad_account_id');
    }
}
