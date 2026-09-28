<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * A hashtag challenge on the Explore page - a tag, a prize, a deadline, and an
 * entry count. See create_challenges_table for the field-by-field reasoning.
 */
class Challenge extends Model
{
    public const STATUS_ACTIVE = 'active';
    public const STATUS_ENDED  = 'ended';

    protected $fillable = [
        'title', 'hashtag_id', 'prize_description',
        'cover_start_color', 'cover_end_color',
        'starts_at', 'ends_at', 'status', 'created_by',
    ];

    protected $casts = [
        'starts_at' => 'datetime',
        'ends_at'   => 'datetime',
    ];

    public function hashtag(): BelongsTo
    {
        return $this->belongsTo(Hashtag::class);
    }

    public function creator(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function participants(): HasMany
    {
        return $this->hasMany(ChallengeParticipant::class);
    }

    /** Still open for entries - the query the app's browse lists actually use. */
    public function scopeActive($query)
    {
        return $query->where('ends_at', '>=', now());
    }

    /**
     * Real entries, computed from the existing hashtag-video linkage rather
     * than a stored counter (avoids a denormalized count going stale) - a
     * video counts if it carries this challenge's hashtag and landed inside
     * the challenge window. Falls back to `created_at` as the window's start
     * when `starts_at` is missing or predates the challenge row itself
     * (a backdated/invalid `starts_at` would otherwise sweep in hashtag posts
     * made before this challenge existed - `created_at` is the safe floor).
     */
    public function entriesCount(): int
    {
        if (! $this->hashtag_id) {
            return 0;
        }

        $windowStart = ($this->starts_at && $this->starts_at->greaterThanOrEqualTo($this->created_at))
            ? $this->starts_at
            : $this->created_at;

        return $this->hashtag?->videos()
            ->where('videos.status', 'published')
            ->whereNull('videos.deleted_at')
            ->where('videos.created_at', '>=', $windowStart)
            ->where('videos.created_at', '<=', $this->ends_at)
            ->count() ?? 0;
    }

    public function isActive(): bool
    {
        return $this->ends_at !== null && $this->ends_at->isFuture();
    }
}
