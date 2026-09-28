<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SsoSession extends Model
{
    protected $fillable = [
        'user_id', 'token_hash', 'csrf_hash', 'user_agent', 'ip_address',
        'last_used_at', 'expires_at', 'revoked_at',
    ];

    protected $casts = [
        'last_used_at' => 'datetime',
        'expires_at'   => 'datetime',
        'revoked_at'   => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
