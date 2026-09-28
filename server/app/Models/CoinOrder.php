<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoinOrder extends Model
{
    protected $fillable = [
        'user_id', 'package_id', 'coins', 'price_usd', 'currency',
        'payment_method', 'payment_status', 'payment_reference',
        'payment_meta', 'paid_at',
    ];

    protected $casts = [
        'coins'        => 'integer',
        'price_usd'    => 'decimal:2',
        'payment_meta' => 'array',
        'paid_at'      => 'datetime',
    ];

    public function user(): BelongsTo    { return $this->belongsTo(User::class); }
    public function package(): BelongsTo { return $this->belongsTo(CoinPackage::class, 'package_id'); }

    public function isPaid(): bool { return $this->payment_status === 'paid'; }
}
