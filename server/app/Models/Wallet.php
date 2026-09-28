<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Wallet extends Model
{
    /**
     * Must list every column the ledger writes. Eloquent drops a non-fillable key
     * SILENTLY, so a missing name here does not throw - it just loses the number.
     * That is exactly how wallet_balance_usd came to be written by
     * GiftCommissionService and never actually saved.
     */
    protected $fillable = [
        'user_id',
        'balance',
        'coins_balance',
        'gift_earnings',
        'subscription_earnings',
        'ad_earnings',
        'total_withdrawn',
        'bonus_coin_balance',
        'earned_coin_balance',
        'wallet_balance_usd',
        'pending_balance_usd',
        'total_received_coins',
        'total_commission_coins',
        'total_net_earned_coins',
        'total_spent_coins',
        'total_purchased_coins',
    ];

    protected function casts(): array
    {
        return [
            'balance'                 => 'decimal:2',
            'gift_earnings'           => 'decimal:2',
            'subscription_earnings'   => 'decimal:2',
            'ad_earnings'             => 'decimal:2',
            'total_withdrawn'         => 'decimal:2',
            'wallet_balance_usd'      => 'decimal:2',
            'pending_balance_usd'     => 'decimal:2',
            'coins_balance'           => 'integer',
            'bonus_coin_balance'      => 'integer',
            'earned_coin_balance'     => 'integer',
            'total_received_coins'    => 'integer',
            'total_commission_coins'  => 'integer',
            'total_net_earned_coins'  => 'integer',
            'total_spent_coins'       => 'integer',
            'total_purchased_coins'   => 'integer',
        ];
    }

    public function user()         { return $this->belongsTo(User::class); }
    public function transactions() { return $this->hasMany(WalletTransaction::class); }
}
