<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class VerificationPayment extends Model
{
    protected $fillable = [
        'user_id', 'verification_request_id', 'purpose', 'plan_id',
        'amount_usd', 'currency', 'payment_method', 'payment_status',
        'payment_reference', 'payment_meta',
        'paid_at', 'failed_at', 'failure_reason',
    ];

    protected function casts(): array
    {
        return [
            'amount_usd'   => 'decimal:2',
            'payment_meta' => 'array',
            'paid_at'      => 'datetime',
            'failed_at'    => 'datetime',
        ];
    }

    public const PURPOSE_APPLICATION = 'application';
    public const PURPOSE_RENEWAL     = 'renewal';

    /**
     * What each plan costs, in USD.
     *
     * Lives on the SERVER. The client sends a plan id, never a price - a client that can
     * name its own amount is a client that will eventually buy a $20 badge for one cent.
     * These mirror BV_PLANS on the web and in the app; if they ever drift, this is the
     * one that decides what gets charged.
     */
    public const PLAN_PRICES = [
        'basic'    => 5.00,
        'plus'     => 10.00,
        'business' => 20.00,
        // Legacy ids the API still accepts.
        'monthly'  => 5.00,
        'annual'   => 50.00,
    ];

    public static function priceFor(?string $planId): ?float
    {
        return self::PLAN_PRICES[$planId] ?? null;
    }

    public function isPaid(): bool
    {
        return $this->payment_status === 'paid';
    }

    public function user()    { return $this->belongsTo(User::class); }
    public function request() { return $this->belongsTo(VerificationRequest::class, 'verification_request_id'); }

    public function scopePaid($q)    { return $q->where('payment_status', 'paid'); }
    public function scopePending($q) { return $q->where('payment_status', 'pending'); }
}
