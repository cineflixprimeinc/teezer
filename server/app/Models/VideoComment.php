<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;

class VideoComment extends Model
{
    use SoftDeletes;

    protected $fillable = [
        'video_id', 'user_id', 'parent_id', 'root_id', 'body',
        'gif_url', 'gif_preview_url', 'gif_provider', 'gif_provider_id', 'image_path',
        // A gift sent on the post. `gift_coins` is snapshotted at send time -
        // repricing the catalog must not rewrite what someone spent.
        'gift_id', 'gift_coins',
        'comment_rank', 'likes_count', 'dislike_count', 'reply_count', 'reaction_score',
        'is_pinned', 'pin_order', 'pinned_at', 'pinned_by',
        'is_edited', 'edited_at', 'is_hidden',
        'is_spam', 'held_for_review', 'creator_seen_at', 'creator_note',
    ];

    /**
     * How many comments on a video are actually reachable by a user.
     *
     * Lives here rather than in CommentController because more than one place
     * now writes comments - posting one, and sending a gift on a post - and a
     * second copy of this rule would drift from the visible list the moment
     * either changed. Counts:
     *
     *   • top-level comments, and
     *   • replies whose root still exists and is not hidden / spam / held
     *
     * Orphaned replies are excluded, so this always matches what the drawer
     * actually renders.
     */
    public static function visibleCountForVideo(int $videoId): int
    {
        return (int) static::where('video_id', $videoId)
            ->where('is_hidden', false)
            ->where('is_spam', false)
            ->where('held_for_review', false)
            ->where(fn ($q) => $q
                ->whereNull('parent_id')
                ->orWhereExists(fn ($exists) => $exists
                    ->selectRaw('1')
                    ->from('video_comments as vc_root')
                    ->whereColumn('vc_root.id', 'video_comments.root_id')
                    ->where('vc_root.is_hidden', false)
                    ->where('vc_root.is_spam', false)
                    ->where('vc_root.held_for_review', false)
                    ->whereNull('vc_root.deleted_at')
                )
            )
            ->count();
    }

    /** The catalog gift this comment carries, when it is a gift comment. */
    public function gift(): \Illuminate\Database\Eloquent\Relations\BelongsTo
    {
        return $this->belongsTo(\App\Models\Gift::class, 'gift_id');
    }

    protected function casts(): array
    {
        return [
            'is_pinned'       => 'boolean',
            'is_hidden'       => 'boolean',
            'is_edited'       => 'boolean',
            'is_spam'         => 'boolean',
            'held_for_review' => 'boolean',
            'pinned_at'       => 'datetime',
            'edited_at'       => 'datetime',
            'creator_seen_at' => 'datetime',
        ];
    }

    public function video()     { return $this->belongsTo(Video::class); }
    public function user()      { return $this->belongsTo(User::class); }
    public function parent()    { return $this->belongsTo(VideoComment::class, 'parent_id'); }
    public function replies()   { return $this->hasMany(VideoComment::class, 'parent_id'); }
    public function likes()     { return $this->hasMany(CommentLike::class, 'comment_id'); }
    public function reactions()  { return $this->hasMany(CommentReaction::class, 'comment_id'); }
    public function reports()   { return $this->hasMany(CommentReport::class, 'comment_id'); }

    /**
     * Recalculate and persist the reaction_score.
     * score = (love × 3) - (dislike × 2) + (reply_count × 2) + freshness_boost
     * Freshness boost decays linearly over 48 hours.
     */
    public function recalcReactionScore(): void
    {
        $this->refresh();
        $ageHours  = max(0, now()->diffInHours($this->created_at, true));
        $freshness = (int) max(0, 48 - $ageHours);
        $score = ($this->likes_count * 3)
               - ($this->dislike_count * 2)
               + ($this->reply_count * 2)
               + $freshness;
        $this->updateQuietly(['reaction_score' => $score]);
    }
}
