<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/** A live audio room. See the create_spaces_tables migration for the lifecycle. */
class Space extends Model
{
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_LIVE      = 'live';
    public const STATUS_ENDED     = 'ended';

    public const STATUSES = [self::STATUS_SCHEDULED, self::STATUS_LIVE, self::STATUS_ENDED];

    /** Stage policy - who may take the mic (§ Speaking Permissions). */
    public const SPEAK_EVERYONE  = 'everyone';   // anyone who joins can unmute
    public const SPEAK_REQUEST   = 'request';    // request → host/mod approves (default)
    public const SPEAK_HOST_ONLY = 'host_only';  // only host + moderators speak
    public const SPEAKING = [self::SPEAK_EVERYONE, self::SPEAK_REQUEST, self::SPEAK_HOST_ONLY];

    /** Who can join (§ Space Privacy). */
    public const AUD_PUBLIC  = 'public';
    public const AUD_PRIVATE = 'private';
    public const AUD_INVITE  = 'invite';
    public const AUDIENCES = [self::AUD_PUBLIC, self::AUD_PRIVATE, self::AUD_INVITE];

    public const AUDIO_QUALITIES = ['standard', 'high', 'ultra'];

    protected $fillable = [
        'host_id', 'title', 'description', 'topic', 'cover_url', 'status',
        'listeners_count', 'speakers_count', 'peak_listeners', 'plays_count',
        'is_recorded', 'recording_url',
        'scheduled_for', 'started_at', 'ended_at',
        'ended_by_admin_id', 'ended_reason',
        // Create-Space settings (see add_settings_to_spaces).
        'topics', 'tags', 'language', 'audience', 'audience_limit',
        'live_captions', 'noise_cancellation', 'allow_speaker_requests',
        'enable_chat', 'allow_reactions', 'share_to_feed', 'enable_polls', 'qa_enabled',
        'content_warning', 'blocked_words', 'co_host_ids', 'speaker_ids',
        // Permissions + moderation (see add_moderation_and_permissions_to_spaces).
        'speaking_permission', 'audio_quality', 'allow_screen_sharing',
        'moderator_ids', 'blocked_user_ids', 'invite_token',
        // Room extras (see add_room_extras_to_spaces).
        'room_rules', 'gifts_enabled', 'waiting_room_enabled',
        'sound_clips_enabled', 'speaker_slots',
        // Followers allowed into a private room (see add_allowed_followers_to_spaces).
        'allowed_follower_ids',
    ];

    protected $casts = [
        'is_recorded'     => 'boolean',
        'listeners_count' => 'integer',
        'speakers_count'  => 'integer',
        'peak_listeners'  => 'integer',
        'plays_count'     => 'integer',
        'scheduled_for'   => 'datetime',
        'started_at'      => 'datetime',
        'ended_at'        => 'datetime',
        // Settings.
        'topics'                 => 'array',
        'tags'                   => 'array',
        'audience_limit'         => 'integer',
        'live_captions'          => 'boolean',
        'noise_cancellation'     => 'boolean',
        'allow_speaker_requests' => 'boolean',
        'enable_chat'            => 'boolean',
        'allow_reactions'        => 'boolean',
        'share_to_feed'          => 'boolean',
        'enable_polls'           => 'boolean',
        'qa_enabled'             => 'boolean',
        'co_host_ids'            => 'array',
        'speaker_ids'            => 'array',
        'allow_screen_sharing'   => 'boolean',
        'moderator_ids'          => 'array',
        'blocked_user_ids'       => 'array',
        'allowed_follower_ids'   => 'array',
        // Room extras.
        'room_rules'             => 'array',
        'gifts_enabled'          => 'boolean',
        'waiting_room_enabled'   => 'boolean',
        'sound_clips_enabled'    => 'boolean',
        'speaker_slots'          => 'integer',
    ];

    /** User ids the host invited on stage (co-hosts + speakers), for join(). */
    public function invitedSpeakerIds(): array
    {
        return array_values(array_unique(array_map('intval', array_merge(
            $this->co_host_ids ?? [],
            $this->speaker_ids ?? [],
        ))));
    }

    /** Moderators: the host, anyone in moderator_ids, and co-hosts (who moderate). */
    public function moderatorIds(): array
    {
        return array_values(array_unique(array_map('intval', array_merge(
            $this->moderator_ids ?? [],
            $this->co_host_ids ?? [],
        ))));
    }

    public function isModerator(int $userId): bool
    {
        return $this->host_id === $userId || in_array($userId, $this->moderatorIds(), true);
    }

    public function isBlocked(int $userId): bool
    {
        return in_array($userId, array_map('intval', $this->blocked_user_ids ?? []), true);
    }

    /**
     * Is there a free mic? `speaker_slots` is always a real cap now (see the
     * 2026_07_28_100007 backfill), but this treats a null/legacy row as
     * uncapped rather than erroring, since `speakers_count` alone can't tell
     * you the room's configured limit.
     */
    public function hasOpenSpeakerSlot(): bool
    {
        return $this->speaker_slots === null || $this->speakers_count < $this->speaker_slots;
    }

    /**
     * Can this user enter the room at all? Public rooms admit anyone; private and
     * invite-only rooms admit the host, moderators and invitees; invite-only also
     * admits anyone holding the room's invite token, and private also admits any
     * follower the host explicitly allowlisted (allowed_follower_ids).
     */
    public function canJoin(int $userId, ?string $token = null): bool
    {
        if ($this->isBlocked($userId)) {
            return false;
        }
        $audience = $this->audience ?: self::AUD_PUBLIC;
        if ($audience === self::AUD_PUBLIC) {
            return true;
        }
        $allowed = $this->host_id === $userId
            || $this->isModerator($userId)
            || in_array((int) $userId, $this->invitedSpeakerIds(), true);
        if ($allowed) {
            return true;
        }
        if ($audience === self::AUD_INVITE
            && $token !== null
            && $this->invite_token !== null
            && hash_equals($this->invite_token, $token)
        ) {
            return true;
        }
        return $audience === self::AUD_PRIVATE
            && in_array($userId, array_map('intval', $this->allowed_follower_ids ?? []), true);
    }

    /** The seat role a joining user takes, given the room's speaking policy. */
    public function joinRole(int $userId): string
    {
        if ($this->host_id === $userId) {
            return SpaceParticipant::ROLE_HOST;
        }
        if ($this->isModerator($userId)) {
            return SpaceParticipant::ROLE_SPEAKER; // moderators always hold the mic
        }
        return match ($this->speaking_permission ?: self::SPEAK_REQUEST) {
            // Open mic, but only while the stage has a free seat - once
            // speaker_slots is full, later joiners land as listeners instead.
            self::SPEAK_EVERYONE  => $this->hasOpenSpeakerSlot() ? SpaceParticipant::ROLE_SPEAKER : SpaceParticipant::ROLE_LISTENER,
            self::SPEAK_HOST_ONLY => SpaceParticipant::ROLE_LISTENER,
            default               => in_array((int) $userId, $this->invitedSpeakerIds(), true)
                ? SpaceParticipant::ROLE_SPEAKER
                : SpaceParticipant::ROLE_LISTENER,
        };
    }

    public function host(): BelongsTo
    {
        return $this->belongsTo(User::class, 'host_id');
    }

    public function endedByAdmin(): BelongsTo
    {
        return $this->belongsTo(User::class, 'ended_by_admin_id');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(SpaceParticipant::class);
    }

    public function messages(): HasMany
    {
        return $this->hasMany(SpaceMessage::class);
    }

    /** Who asked to be reminded - the "N going" on a scheduled room. */
    public function reminders(): HasMany
    {
        return $this->hasMany(SpaceReminder::class);
    }

    /** An ended room with a recording anyone can still play. */
    public function isReplayable(): bool
    {
        return $this->status === self::STATUS_ENDED
            && $this->is_recorded
            && ! empty($this->recording_url);
    }

    public function isLive(): bool
    {
        return $this->status === self::STATUS_LIVE;
    }

    /** How long the room ran (or has been running), in whole minutes. */
    public function durationMinutes(): ?int
    {
        if (! $this->started_at) {
            return null;
        }
        return $this->started_at->diffInMinutes($this->ended_at ?? now());
    }
}
