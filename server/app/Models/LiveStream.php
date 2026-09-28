<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Support\Str;

/**
 * A live stream.
 *
 * One broadcaster, an audience, and a set of per-stream controls a host or an
 * admin can turn. Everything that decides "may this viewer do X" is answered
 * here rather than re-derived on each surface, so the web page, the app and the
 * admin console cannot drift apart.
 */
class LiveStream extends Model
{
    use SoftDeletes;

    public const STATUS_DRAFT     = 'draft';
    public const STATUS_SCHEDULED = 'scheduled';
    public const STATUS_LIVE      = 'live';
    public const STATUS_ENDED     = 'ended';
    public const STATUS_BANNED    = 'banned';

    protected $fillable = [
        'user_id', 'title', 'description', 'category', 'thumbnail_url',
        'status', 'visibility', 'room_name', 'ingest_key', 'playback_url',
        'scheduled_for', 'started_at', 'ended_at',
        'chat_enabled', 'gifts_enabled', 'replay_enabled',
        'followers_only_chat', 'slow_mode_seconds', 'min_account_age_days',
        'replay_url',
    ];

    /** `ingest_key` is a publishing secret - never let it ride along by accident. */
    protected $hidden = ['ingest_key'];

    protected function casts(): array
    {
        return [
            'scheduled_for'        => 'datetime',
            'started_at'           => 'datetime',
            'ended_at'             => 'datetime',
            'featured_at'          => 'datetime',
            'banned_at'            => 'datetime',
            'chat_enabled'         => 'boolean',
            'gifts_enabled'        => 'boolean',
            'replay_enabled'       => 'boolean',
            'followers_only_chat'  => 'boolean',
            'is_featured'          => 'boolean',
            'viewers_now'          => 'integer',
            'peak_viewers'         => 'integer',
            'total_views'          => 'integer',
            'likes_count'          => 'integer',
            'gift_coins'           => 'integer',
            'slow_mode_seconds'    => 'integer',
            'min_account_age_days' => 'integer',
        ];
    }

    /* ── Relations ──────────────────────────────────────────────────────── */
    public function user()       { return $this->belongsTo(User::class); }
    public function viewers()    { return $this->hasMany(LiveStreamViewer::class); }
    public function messages()   { return $this->hasMany(LiveStreamMessage::class); }
    public function moderators() { return $this->hasMany(LiveStreamModerator::class); }
    public function bans()       { return $this->hasMany(LiveStreamBan::class); }
    public function events()     { return $this->hasMany(LiveStreamEvent::class); }

    /* ── Scopes ─────────────────────────────────────────────────────────── */

    /** On air right now, and not pulled by an admin. */
    public function scopeLive(Builder $q): Builder
    {
        return $q->where('status', self::STATUS_LIVE)->whereNull('banned_at');
    }

    /** What a signed-out browser is allowed to see. */
    public function scopePubliclyVisible(Builder $q): Builder
    {
        return $q->where('visibility', 'public')->whereNull('banned_at');
    }

    /* ── State ──────────────────────────────────────────────────────────── */

    public function isLive(): bool   { return $this->status === self::STATUS_LIVE && $this->banned_at === null; }
    public function isBanned(): bool { return $this->banned_at !== null; }

    /** The host, plus anyone they promoted. Admins are handled by the caller. */
    public function isModeratedBy(?User $user): bool
    {
        if (! $user) return false;
        if ((int) $this->user_id === (int) $user->id) return true;
        return $this->moderators()->where('user_id', $user->id)->exists();
    }

    /**
     * Why this viewer may not post, or null if they may.
     *
     * One method so every surface refuses for the same reasons in the same
     * order - a rule that lives in two places is a rule that disagrees.
     */
    public function chatBlockedReason(?User $user): ?string
    {
        if (! $user)                return 'Sign in to join the chat.';
        if (! $this->chat_enabled)  return 'Chat is turned off for this stream.';
        if ($this->isBanned())      return 'This stream is unavailable.';
        if (! $this->isLive())      return 'This stream has ended.';

        // The host and their moderators are never held back by viewer limits.
        if ($this->isModeratedBy($user)) return null;

        $ban = $this->bans()->where('user_id', $user->id)
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->first();
        if ($ban) {
            return $ban->expires_at
                ? 'You are timed out until ' . $ban->expires_at->toDayDateTimeString() . '.'
                : 'You can no longer chat on this stream.';
        }

        if ($this->min_account_age_days > 0) {
            $age = $user->created_at?->diffInDays(now()) ?? 0;
            if ($age < $this->min_account_age_days) {
                return "Accounts must be at least {$this->min_account_age_days} day(s) old to chat here.";
            }
        }

        if ($this->slow_mode_seconds > 0) {
            $last = $this->messages()->where('user_id', $user->id)->latest('id')->first();
            if ($last && $last->created_at->diffInSeconds(now()) < $this->slow_mode_seconds) {
                $wait = $this->slow_mode_seconds - $last->created_at->diffInSeconds(now());
                return "Slow mode is on - try again in {$wait}s.";
            }
        }

        return null;
    }

    /** A publishing secret the broadcaster puts in their encoder. */
    public static function newIngestKey(): string
    {
        return 'rs_live_' . Str::lower(Str::random(40));
    }

    /** Recompute presence from open viewer rows - never trust a counter. */
    public function syncViewerCount(): void
    {
        $now = (int) $this->viewers()->whereNull('left_at')->count();
        $this->forceFill([
            'viewers_now'  => $now,
            'peak_viewers' => max((int) $this->peak_viewers, $now),
        ])->saveQuietly();
    }

    /** Append to the audit trail. Every control action goes through here. */
    public function recordEvent(string $action, ?int $actorId = null, array $meta = []): void
    {
        $this->events()->create([
            'actor_id' => $actorId,
            'action'   => $action,
            'meta'     => $meta ?: null,
        ]);
    }
}
