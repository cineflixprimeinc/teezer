<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WalletTransaction extends Model
{
    public $timestamps = false;

    /**
     * Every column the ledger writes must be listed. These are all service-computed
     * (never taken from a request body), so widening $fillable adds no mass-assignment
     * surface - whereas omitting a name silently zeroes that column on every insert,
     * which is what left the coin figures on existing rows at 0.
     */
    protected $fillable = [
        'wallet_id',
        'type',
        'amount',
        'description',
        'reference_id',
        'gross_coins',
        'commission_coins',
        'net_coins',
        'balance_after_coins',
        'wallet_balance_after_usd',
        'status',
        'metadata',
    ];

    protected function casts(): array
    {
        return [
            'amount'                   => 'decimal:2',
            'created_at'               => 'datetime',
            'wallet_balance_after_usd' => 'decimal:2',
            'gross_coins'              => 'integer',
            'commission_coins'         => 'integer',
            'net_coins'                => 'integer',
            'balance_after_coins'      => 'integer',
        ];
    }

    public function wallet()
    {
        return $this->belongsTo(Wallet::class);
    }
}
