<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorWallet extends Model
{
    protected $fillable = [
        'user_id', 'available_balance', 'pending_balance', 'lifetime_earnings', 'currency',
    ];

    protected function casts(): array
    {
        return [
            'available_balance' => 'decimal:2',
            'pending_balance'   => 'decimal:2',
            'lifetime_earnings' => 'decimal:2',
        ];
    }

    public function user() { return $this->belongsTo(User::class); }
}
