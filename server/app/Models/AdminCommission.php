<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class AdminCommission extends Model
{
    protected $fillable = [
        'source_type', 'source_id', 'user_id',
        'gross_coins', 'commission_rate', 'commission_coins', 'commission_value_usd',
    ];

    protected $casts = [
        'gross_coins'          => 'integer',
        'commission_rate'      => 'decimal:2',
        'commission_coins'     => 'integer',
        'commission_value_usd' => 'decimal:2',
    ];

    public function user(): BelongsTo { return $this->belongsTo(User::class); }
}
