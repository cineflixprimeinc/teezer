<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OauthGrant extends Model
{
    protected $fillable = [
        'user_id', 'client', 'scopes', 'granted_at', 'revoked_at',
    ];

    protected $casts = [
        'scopes'     => 'array',
        'granted_at' => 'datetime',
        'revoked_at' => 'datetime',
    ];

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
