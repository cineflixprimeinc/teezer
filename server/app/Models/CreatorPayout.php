<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CreatorPayout extends Model
{
    protected $fillable = [
        'user_id', 'idempotency_key', 'amount', 'currency', 'status', 'payout_method_id',
        // `amount` is the GROSS requested and what the balance is debited by;
        // `net_amount` is what is actually paid after Teezer's cut, which is
        // taken at withdrawal rather than when each gift arrived.
        'commission_rate', 'commission_amount', 'net_amount',
        'scheduled_at', 'paid_at', 'failure_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount'            => 'decimal:2',
            'commission_rate'   => 'decimal:2',
            'commission_amount' => 'decimal:2',
            'net_amount'        => 'decimal:2',
            'scheduled_at' => 'datetime',
            'paid_at'      => 'datetime',
        ];
    }

    public function user()         { return $this->belongsTo(User::class); }
    public function payoutMethod() { return $this->belongsTo(CreatorPayoutMethod::class, 'payout_method_id'); }
}
