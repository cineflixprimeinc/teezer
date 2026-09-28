<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\SoftDeletes;
use Illuminate\Database\Eloquent\Factories\HasFactory;

class Video extends Model
{
    use HasFactory, SoftDeletes;

    protected $fillable = [
        'user_id', 'title', 'caption', 'category', 'location', 'link_url', 'language', 'country_code',
        'video_url', 'thumbnail_url', 'mime_type',
        'duration', 'file_size', 'width', 'height',
        'audio_track_id', 'music_track_id', 'audio_type', 'custom_audio_name',
        'recognition_status', 'recognized_track_id', 'recognition_confidence',
        'matched_offset_seconds', 'matched_duration_seconds', 'recognized_at',
        'original_audio_volume', 'music_volume', 'is_original_audio_muted', 'is_music_muted',
        'project_duration_ms', 'music_source_start_ms', 'music_source_end_ms',
        'music_video_start_ms', 'music_fade_in_ms', 'music_fade_out_ms', 'music_auto_duck',
        'status', 'scheduled_at',
        'allow_comments', 'allow_duet', 'allow_stitch', 'allow_download',
        'views_count', 'likes_count', 'comments_count', 'saves_count', 'shares_count',
        'total_watch_seconds', 'average_watch_seconds',
        'completion_rate', 'rewatch_rate',
        'total_completions', 'total_replays',
        'is_flagged', 'media_items', 'moderation_status',
        'content_check_status', 'content_check_passed', 'content_check_reason',
        'is_pinned', 'pinned_at',
        'is_ai_generated',
        'rights_confirmed', 'rights_confirmed_at', 'consent_confirmed', 'consent_confirmed_at',
        'quality_urls',
        'hls_master_key', 'hls_status', 'hls_ready_at',
        'processing_provider', 'provider_job_id',
        // admin controls (added 2026-06-17)
        'allow_replies', 'allow_sharing', 'allow_embedding', 'show_on_profile',
        'age_restriction', 'content_label', 'sensitive_warning',
        'notify_followers', 'send_push_after_publish',
        'recommendation_eligible', 'search_indexing',
        'region_allowed', 'region_blocked',
        'shadowban_enabled', 'limited_distribution', 'limited_reason',
        'review_priority', 'copyright_match_status', 'duplicate_match_status',
        'content_fingerprint', 'legal_hold', 'reporting_sensitivity',
        'archive_status', 'auto_archive_after', 'captions_file_url',
        'admin_notes', 'audit_notes',
        // deletion tracking
        'previous_status', 'deleted_by_user_id', 'deleted_by_admin_id',
        'deletion_reason', 'restored_at', 'restored_by_admin_id',
    ];

    protected function casts(): array
    {
        return [
            'scheduled_at'   => 'datetime',
            'allow_comments' => 'boolean',
            'allow_duet'     => 'boolean',
            'allow_stitch'   => 'boolean',
            'allow_download' => 'boolean',
            'is_flagged'      => 'boolean',
            'content_check_passed' => 'boolean',
            'media_items'     => 'array',
            'quality_urls'    => 'array',
            'hls_ready_at'    => 'datetime',
            'public_mirror_synced_at'    => 'datetime',
            'public_mirror_hls_ready_at' => 'datetime',
            'is_pinned'       => 'boolean',
            'pinned_at'       => 'datetime',
            'is_ai_generated'         => 'boolean',
            'rights_confirmed'        => 'boolean',
            'rights_confirmed_at'     => 'datetime',
            'consent_confirmed'       => 'boolean',
            'consent_confirmed_at'    => 'datetime',
            'is_original_audio_muted' => 'boolean',
            'is_music_muted'          => 'boolean',
            // admin controls
            'allow_replies'           => 'boolean',
            'allow_sharing'           => 'boolean',
            'allow_embedding'         => 'boolean',
            'show_on_profile'         => 'boolean',
            'sensitive_warning'       => 'boolean',
            'notify_followers'        => 'boolean',
            'send_push_after_publish' => 'boolean',
            'recommendation_eligible' => 'boolean',
            'search_indexing'         => 'boolean',
            'region_allowed'          => 'array',
            'region_blocked'          => 'array',
            'shadowban_enabled'       => 'boolean',
            'limited_distribution'    => 'boolean',
            'legal_hold'              => 'boolean',
            'restored_at'             => 'datetime',
            'total_watch_seconds'   => 'integer',
            'average_watch_seconds' => 'integer',
            'completion_rate'       => 'integer',
            'rewatch_rate'          => 'integer',
            'total_completions'     => 'integer',
            'total_replays'         => 'integer',
        ];
    }

    public function moderation()
    {
        return $this->hasOne(\App\Models\MediaModeration::class, 'content_id');
    }

    public function monetization()
    {
        return $this->hasOne(VideoMonetization::class);
    }

    public function isVisibleInFeed(): bool
    {
        return $this->moderation_status !== 'rejected';
    }

    public function user()
    {
        return $this->belongsTo(User::class);
    }

    public function audioTrack()
    {
        return $this->belongsTo(AudioTrack::class);
    }

    /**
     * Music identified inside this video's audio, if any.
     *
     * Separate from musicTrack(): that is a sound the creator CHOSE from
     * Reelsoo's library, this is one we HEARD in what they uploaded. A video can
     * have both - a library track laid over a clip that already had music - and
     * they must not overwrite each other.
     */
    public function recognizedTrack()
    {
        return $this->belongsTo(RecognizedTrack::class, 'recognized_track_id');
    }

    public function musicTrack()
    {
        return $this->belongsTo(MusicTrack::class, 'music_track_id');
    }

    public function hashtags()
    {
        return $this->belongsToMany(Hashtag::class, 'video_hashtags');
    }

    public function likes()
    {
        return $this->hasMany(VideoLike::class);
    }

    public function comments()
    {
        return $this->hasMany(VideoComment::class);
    }

    public function saves()
    {
        return $this->hasMany(VideoSave::class);
    }

    public function shares()
    {
        return $this->hasMany(VideoShare::class);
    }

    public function views()
    {
        return $this->hasMany(VideoView::class);
    }

    public function reports()
    {
        return $this->hasMany(VideoReport::class);
    }

    /**
     * Users explicitly tagged on this post via the "Tag people" field.
     * Stored in comment_mentions with source_type='tag' and source_id = this
     * video's id (see MentionService::processTaggedUsers). Filtered to active,
     * non-banned users so deactivated accounts drop off the feed indicator.
     */
    public function taggedUsers()
    {
        return $this->belongsToMany(
            User::class,
            'comment_mentions',
            'source_id',          // pivot column referencing this video's id
            'mentioned_user_id',  // pivot column referencing the tagged user
        )
            ->wherePivot('source_type', 'tag')
            // Tagging someone requires their acceptance before their name is
            // shown on the post - see the migration that added this column.
            // A pending or declined tag simply isn't returned here, which is
            // also what keeps it out of VideoResource's tagged_users.
            ->wherePivot('status', 'accepted')
            ->where('users.is_active', true)
            ->where('users.is_banned', false)
            ->orderBy('comment_mentions.id');
    }

    /**
     * "Paid partnership" collab tags - same shape as taggedUsers() above,
     * source_type='collab' instead of 'tag'. Also requires acceptance
     * before showing (see MentionService::processCollabUsers).
     */
    public function collabUsers()
    {
        return $this->belongsToMany(
            User::class,
            'comment_mentions',
            'source_id',
            'mentioned_user_id',
        )
            ->wherePivot('source_type', 'collab')
            ->wherePivot('status', 'accepted')
            ->where('users.is_active', true)
            ->where('users.is_banned', false)
            ->orderBy('comment_mentions.id');
    }

    /**
     * "Add link" → Reelsoo Product - up to 3 of the creator's own shop
     * products featured on this post, in the order they were selected (see
     * the 2026_09_02_130000 migration and VideoService::syncFeaturedProducts).
     * Only active products are returned - a product the seller has since
     * deactivated stays attached in the database (no silent detach) but
     * simply stops showing here, same "don't invent new lifecycle rules"
     * posture Shop already takes everywhere else a product can go inactive.
     */
    public function featuredProducts()
    {
        return $this->belongsToMany(\App\Models\Product::class, 'video_products')
            ->where('products.is_active', true)
            ->withPivot('position')
            ->orderBy('video_products.position');
    }

    public function isLikedBy(User $user): bool
    {
        return $this->likes()->where('user_id', $user->id)->exists();
    }

    public function isSavedBy(User $user): bool
    {
        return $this->saves()->where('user_id', $user->id)->exists();
    }

    /**
     * Batch-resolve the three per-viewer flags VideoResource would otherwise
     * fetch one video at a time.
     *
     * VideoResource renders `is_liked`, `is_saved` and `is_following` from
     * pre-set attributes when they exist, and falls back to isLikedBy() /
     * isSavedBy() / a follows lookup PER VIDEO when they do not - so a list
     * endpoint that skipped this cost 3 extra queries for every row on the
     * page (61 queries for a 20-video page instead of 1).
     *
     * This resolves all three in 3 queries total, whatever the page size.
     * FeedService and UserController::videos already hand-rolled exactly this;
     * everything else was paying the per-row price.
     *
     * The semantics are copied from the fallbacks this replaces so the rendered
     * JSON is unchanged - in particular `is_following_creator` reads the raw
     * `followers` pivot at ANY status, matching User::following(), and is
     * deliberately NOT the accepted-only relation used for follower counts.
     *
     * Accepts a paginator, a collection or a plain array. Models are mutated in
     * place, so the caller's paginator sees the flags without reassignment.
     */
    public static function attachViewerFlags(mixed $videos, ?User $viewer): void
    {
        if (!$viewer) {
            // is_liked / is_saved / is_following are all false for a guest and
            // the resource resolves them with no query at all - but has_story
            // is not free, and skipping this call entirely is what left the
            // logged-out feed running one `stories exists` per row. The story
            // flags still get batched; nothing else has to.
            static::attachStoryFlags($videos, null);

            return;
        }

        $items = match (true) {
            $videos instanceof \Illuminate\Pagination\AbstractPaginator          => $videos->getCollection(),
            $videos instanceof \Illuminate\Pagination\AbstractCursorPaginator    => $videos->getCollection(),
            $videos instanceof \Illuminate\Support\Collection                    => $videos,
            default                                                              => collect($videos),
        };

        $ids = $items->pluck('id')->filter()->unique()->values();
        if ($ids->isEmpty()) {
            return;
        }

        $liked = \Illuminate\Support\Facades\DB::table('video_likes')
            ->where('user_id', $viewer->id)->whereIn('video_id', $ids)
            ->pluck('video_id')->flip();

        $saved = \Illuminate\Support\Facades\DB::table('video_saves')
            ->where('user_id', $viewer->id)->whereIn('video_id', $ids)
            ->pluck('video_id')->flip();

        // Scoped to the creators actually on this page rather than pulling the
        // viewer's entire following list, which for a heavy follower is far
        // larger than the page it is being used to annotate.
        $creatorIds = $items->pluck('user_id')->filter()->unique()->values();
        $followed   = $creatorIds->isEmpty()
            ? collect()
            : \Illuminate\Support\Facades\DB::table('followers')
                ->where('follower_id', $viewer->id)
                ->whereIn('following_id', $creatorIds)
                ->pluck('following_id')->flip();

        foreach ($items as $v) {
            if (!$v instanceof self) {
                continue; // Ad cards and other injected rows are not videos.
            }
            $v->is_liked             = $liked->has($v->id);
            $v->is_saved             = $saved->has($v->id);
            $v->is_following_creator = $followed->has($v->user_id);
        }

        static::attachStoryFlags($items, $viewer);
    }

    /**
     * Batch-resolve whether each video's creator has an active, viewer-
     * visible story and whether the viewer has seen it yet - same ring
     * ProfileTabScreen/Inbox already draw, now on the feed's per-post
     * creator avatar. See VideoResource's has_story/has_unseen for how the
     * two attributes this sets (creator_has_story/creator_story_unseen)
     * are read.
     *
     * Split out from attachViewerFlags() (which calls this too) so a feed
     * path that already batches is_liked/is_saved/is_following itself
     * (FeedService::forYou()/forYouV2()/forYouPools()) can call just this,
     * without redoing that other work.
     *
     * Same everyone/followers-if-accepted/own visibility rule
     * StoryController::activeUserIds() uses (deliberately not
     * close_friends - matching that same lightweight existence-check
     * precedent rather than the heavier feed()/canViewStory() full rule).
     */
    public static function attachStoryFlags(mixed $videos, ?User $viewer): void
    {
        $items = match (true) {
            $videos instanceof \Illuminate\Pagination\AbstractPaginator          => $videos->getCollection(),
            $videos instanceof \Illuminate\Pagination\AbstractCursorPaginator    => $videos->getCollection(),
            $videos instanceof \Illuminate\Support\Collection                    => $videos,
            default                                                              => collect($videos),
        };

        $creatorIds = $items->pluck('user_id')->filter()->unique()->values();
        if ($creatorIds->isEmpty()) {
            return;
        }

        // Signed-out viewer.
        //
        // This used to return before doing anything, because the visibility
        // rules below need a viewer to evaluate. The consequence was not that
        // has_story went unanswered - VideoResource simply computed it per
        // video instead, one `exists` query per row, so the LOGGED-OUT feed
        // (the website's busiest endpoint, and the one anonymous visitors and
        // crawlers hit) ran an extra query for every item on the page:
        // measured at 10 of 23 queries on a 10-item page.
        //
        // Answer it in one query instead, using exactly the predicate that
        // per-row fallback used - published, unexpired, no visibility filter -
        // so the response is byte-for-byte what it was. `creator_story_unseen`
        // is deliberately left unset: with no viewer there is nothing to have
        // seen, and VideoResource already defaults has_unseen for that case
        // without a query.
        if (!$viewer) {
            $withStories = \App\Models\Story::query()
                ->whereIn('user_id', $creatorIds)
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                ->distinct()
                ->pluck('user_id')
                ->flip();

            foreach ($items as $v) {
                if ($v instanceof self) {
                    $v->creator_has_story = $withStories->has($v->user_id);
                }
            }

            return;
        }

        // A followers-only story requires an ACCEPTED follow - deliberately
        // not reusing attachViewerFlags()'s own $followed (any status).
        $activeStories = \App\Models\Story::query()
            ->whereIn('user_id', $creatorIds)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
            ->where(fn ($q) => $q
                ->where('visibility', 'everyone')
                ->orWhere(fn ($f) => $f->where('visibility', 'followers')
                    ->whereExists(fn ($ex) => $ex->selectRaw('1')
                        ->from('followers')
                        ->whereColumn('followers.following_id', 'stories.user_id')
                        ->where('followers.follower_id', $viewer->id)
                        ->where('followers.status', 'accepted')))
                ->orWhere('user_id', $viewer->id))
            ->get(['id', 'user_id']);

        $storyIdsByCreator = $activeStories->groupBy('user_id')->map(fn ($rows) => $rows->pluck('id'));
        $allActiveStoryIds = $activeStories->pluck('id');
        $viewedStoryIds    = $allActiveStoryIds->isEmpty()
            ? collect()
            : \Illuminate\Support\Facades\DB::table('story_views')
                ->where('viewer_id', $viewer->id)
                ->whereIn('story_id', $allActiveStoryIds)
                ->pluck('story_id')->flip();

        foreach ($items as $v) {
            if (!$v instanceof self) {
                continue;
            }
            $creatorStoryIds = $storyIdsByCreator->get($v->user_id) ?? collect();
            $v->creator_has_story    = $creatorStoryIds->isNotEmpty();
            $v->creator_story_unseen = $creatorStoryIds->contains(fn ($sid) => !$viewedStoryIds->has($sid));
        }
    }

    public function scopePublished($query)
    {
        return $query->where('status', 'published');
    }

    public function scopeFlagged($query)
    {
        return $query->where('is_flagged', true);
    }

    public function scopeWithVisibleCommentsCount($query)
    {
        // Count only comments that are actually reachable by users:
        //   • top-level comments (parent_id IS NULL), or
        //   • replies whose root top-level comment still exists and is not hidden/deleted.
        // Orphaned replies (root was deleted) are excluded so the count matches
        // exactly what the comment list shows.
        return $query->withCount([
            'comments as visible_comments_count' => fn ($q) => $q
                ->where('is_hidden', false)
                ->where('is_spam', false)
                ->where('held_for_review', false)
                ->where(fn ($inner) => $inner
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
                ),
        ]);
    }
}
