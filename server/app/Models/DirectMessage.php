<?php

namespace App\Models;

use App\Services\MediaPresignService;
use Illuminate\Database\Eloquent\Casts\Attribute;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class DirectMessage extends Model
{
    /**
     * How long a private-media link stays valid.
     *
     * 24h, not 30 minutes: a chat is scrolled and re-read, and clients hold onto message
     * payloads. Too short and old photos break in a conversation the user still has open.
     * The point is that the link EXPIRES at all - an unbounded public URL is what let
     * anyone read a stranger's private voice notes.
     */
    private const MEDIA_TTL_MINUTES = 1440;
    protected $fillable = [
        'conversation_id',
        'sender_id', 'receiver_id', 'body', 'read_at', 'delivered_at',
        'message_type', 'r2_key', 'r2_url',
        'thumbnail_key', 'thumbnail_url',
        'file_size', 'duration', 'file_name', 'mime_type',
        'reply_to_message_id',
        'edited_at',
        'is_pinned', 'pinned_at', 'pinned_by_user_id', 'pinned_until',
        'deleted_for_everyone_at', 'deleted_by_user_id', 'deleted_for_user_ids',
        'story_id', 'story_thumbnail_url',
        'video_id',
        'latitude', 'longitude', 'location_name',
        'shared_user_id', 'product_id',
    ];

    protected $casts = [
        'read_at'                 => 'datetime',
        'delivered_at'            => 'datetime',
        'edited_at'               => 'datetime',
        'is_pinned'               => 'boolean',
        'pinned_at'               => 'datetime',
        'pinned_until'            => 'datetime',
        'deleted_for_everyone_at' => 'datetime',
        'deleted_for_user_ids'    => 'array',
        // Cast so they come back as numbers, not the strings a decimal column
        // otherwise hands to PHP - clients compare and map these.
        'latitude'                => 'float',
        'longitude'               => 'float',
    ];

    /* ── Private media ───────────────────────────────────────────────────────
     *
     * Photos, voice notes, videos and files sent in a DM were stored under `chat/*` on the
     * PUBLIC bucket and handed out as permanent, unauthenticated CDN URLs. The media worker
     * only signature-gated `/videos/`, so every private attachment anyone had ever sent was
     * readable by anyone holding the URL - forever, with no login.
     *
     * These are now SIGNED, EXPIRING links derived at read time from the stored key.
     *
     * Done as accessors, not at each call site, because the URL is emitted from several
     * places (conversation list, message list, pinned messages, forwards, admin views) and
     * every one of them would otherwise have to remember. Forgetting is how this happened.
     */

    protected function r2Url(): Attribute
    {
        return Attribute::get(fn ($value) => $this->signedMedia($this->r2_key, $value));
    }

    protected function thumbnailUrl(): Attribute
    {
        return Attribute::get(fn ($value) => $this->signedMedia($this->thumbnail_key, $value));
    }

    /**
     * A pin now has an optional expiry (pinMessage()'s duration param) - null
     * pinned_until means "forever", same convention conversation_settings.
     * muted_until already uses. No cron needed: an expired pin just reads as
     * unpinned from here on, everywhere this model is serialized (history,
     * send, forward, the pinned-message bar) - nothing has to remember to
     * check pinned_until separately.
     */
    protected function isPinned(): Attribute
    {
        return Attribute::get(function ($value) {
            if (! $value) return false;
            if ($this->pinned_until && $this->pinned_until->isPast()) return false;
            return true;
        });
    }

    /**
     * Signed link for one attachment.
     *
     * Falls back to the raw stored URL when no key was recorded (older rows). That fallback
     * is only reachable for objects the worker doesn't protect - the worker is what actually
     * closes the hole - but it means a legacy row degrades to "still visible in the chat"
     * rather than "broken image".
     */
    private function signedMedia(?string $key, ?string $rawUrl): ?string
    {
        if (! $key) {
            return $rawUrl;
        }

        try {
            return app(MediaPresignService::class)->signedCdnUrl($key, self::MEDIA_TTL_MINUTES);
        } catch (\Throwable) {
            return $rawUrl;
        }
    }

    public function sender(): BelongsTo
    {
        return $this->belongsTo(User::class, 'sender_id');
    }

    public function receiver(): BelongsTo
    {
        return $this->belongsTo(User::class, 'receiver_id');
    }

    public function video(): BelongsTo
    {
        return $this->belongsTo(Video::class);
    }

    /** Set on `shared_profile` messages - who was shared, not who sent it. */
    public function sharedUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'shared_user_id');
    }

    /** Set on `shared_product` messages. */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** The message this one is a reply to, if any - for the quoted preview
     *  rendered inside the reply bubble itself (composer-only until now). */
    public function replyToMessage(): BelongsTo
    {
        return $this->belongsTo(self::class, 'reply_to_message_id');
    }
}
