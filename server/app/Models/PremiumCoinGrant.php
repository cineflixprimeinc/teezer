<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PremiumCoinGrant extends Model
{
    protected $fillable = [
        'user_id',
        'subscription_id',
        'period',
        'coins',
        'granted_at',
    ];

    protected function casts(): array
    {
        return [
            'period'     => 'integer',
            'coins'      => 'integer',
            'granted_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function subscription(): BelongsTo
    {
        return $this->belongsTo(Subscription::class);
    }
}
