<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A linked third-party sign-in (Google / Apple / …). Created / refreshed on
 * social login; surfaced and removable in Settings › Connected Accounts.
 */
class SocialAccount extends Model
{
    protected $fillable = [
        'user_id',
        'provider',
        'provider_id',
        'email',
        'name',
        'linked_at',
    ];

    protected function casts(): array
    {
        return [
            'linked_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
