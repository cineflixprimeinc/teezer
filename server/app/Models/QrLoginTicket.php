<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/**
 * One QR-code login attempt. See the migration's own docblock for the
 * one-time-token-delivery design; QrLoginController owns all the state
 * transitions (pending -> scanned -> confirmed/denied).
 */
class QrLoginTicket extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    public const STATUS_PENDING   = 'pending';
    public const STATUS_SCANNED   = 'scanned';
    public const STATUS_CONFIRMED = 'confirmed';
    public const STATUS_DENIED    = 'denied';

    protected $fillable = [
        'id', 'status', 'user_id', 'session_meta', 'token', 'token_expires_at', 'token_delivered_at', 'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'session_meta'       => 'array',
            'token_expires_at'   => 'datetime',
            'token_delivered_at' => 'datetime',
            'expires_at'         => 'datetime',
        ];
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
