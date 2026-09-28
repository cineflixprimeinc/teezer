<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** One person's seat in a Space. Unique per (space, user) - see the migration. */
class SpaceParticipant extends Model
{
    public const ROLE_HOST     = 'host';
    public const ROLE_SPEAKER  = 'speaker';
    public const ROLE_LISTENER = 'listener';

    public const ROLES = [self::ROLE_HOST, self::ROLE_SPEAKER, self::ROLE_LISTENER];

    protected $fillable = [
        'space_id', 'user_id', 'role', 'muted', 'joined_at', 'left_at',
        'rtc_session_id', 'rtc_track_name', 'published_at',
        'hand_raised_at', 'approved_at', 'declined_at', 'hearts_sent',
    ];

    protected $casts = [
        'muted'          => 'boolean',
        'joined_at'      => 'datetime',
        'left_at'        => 'datetime',
        'published_at'   => 'datetime',
        'hand_raised_at' => 'datetime',
        'approved_at'    => 'datetime',
        'declined_at'    => 'datetime',
        'hearts_sent'    => 'integer',
    ];

    /** Speakers only, and only once their mic is actually on the SFU. */
    public function isPublishing(): bool
    {
        return $this->published_at !== null
            && $this->rtc_session_id !== null
            && $this->rtc_track_name !== null;
    }

    /** A listener with their hand up and no verdict yet - the host's queue. */
    public function isRequestingToSpeak(): bool
    {
        return $this->role === self::ROLE_LISTENER
            && $this->hand_raised_at !== null;
    }

    public function space(): BelongsTo
    {
        return $this->belongsTo(Space::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
