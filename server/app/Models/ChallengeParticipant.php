<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** "Join" tap on a Challenge - one row per person per challenge. */
class ChallengeParticipant extends Model
{
    public $timestamps = false;

    protected $fillable = ['challenge_id', 'user_id', 'joined_at'];

    protected $casts = [
        'joined_at' => 'datetime',
    ];

    public function challenge(): BelongsTo
    {
        return $this->belongsTo(Challenge::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
