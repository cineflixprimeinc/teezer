<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CoinGift extends Model
{
    protected $fillable = [
        'sender_id', 'receiver_id', 'video_id', 'live_id', 'gift_name',
        'gross_coins', 'commission_rate', 'commission_coins', 'net_coins',
        'gross_value_usd', 'net_value_usd', 'platform_revenue_usd',
        'status', 'reference_id',
    ];

    protected $casts = [
        'gross_coins'         => 'integer',
        'commission_rate'     => 'decimal:2',
        'commission_coins'    => 'integer',
        'net_coins'           => 'integer',
        'gross_value_usd'     => 'decimal:2',
        'net_value_usd'       => 'decimal:2',
        'platform_revenue_usd'=> 'decimal:2',
    ];

    public function sender(): BelongsTo   { return $this->belongsTo(User::class, 'sender_id'); }
    public function receiver(): BelongsTo { return $this->belongsTo(User::class, 'receiver_id'); }
}
