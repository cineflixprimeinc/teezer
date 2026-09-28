<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** A creator registering interest in a coming-soon programme. See the
 *  2026_08_20_000001 migration's docblock. */
class ProgramWaitlistSignup extends Model
{
    protected $fillable = ['user_id', 'program_key', 'notified_at'];

    protected $casts = ['notified_at' => 'datetime'];

    /** Signups still waiting to be told their program opened. */
    public function scopeAwaitingNotice($query)
    {
        return $query->whereNull('notified_at');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
