<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Subscription extends Model
{
    protected $fillable = [
        'user_id', 'plan', 'plan_key', 'status', 'price', 'currency',
        'iap_transaction_id', 'iap_platform',
        'started_at', 'expires_at', 'cancelled_at',
    ];

    protected function casts(): array
    {
        return [
            'price'        => 'decimal:2',
            'started_at'   => 'datetime',
            'expires_at'   => 'datetime',
            'cancelled_at' => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function isActive(): bool
    {
        return $this->status === 'active' && $this->expires_at?->isFuture();
    }
}
