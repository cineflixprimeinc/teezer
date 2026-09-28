<?php

namespace App\Observers;

use App\Jobs\SyncPublicMediaMirror;
use App\Jobs\SyncSearchDocument;
use App\Jobs\SyncCreatorMonetization;
use App\Jobs\NotifyFollowersOfNewPost;
use App\Models\Video;
use App\Services\SearchService;

class VideoObserver
{
    /**
     * Fields that can move a video across the public/protected boundary, or
     * change the bytes a public mirror would be serving - see
     * PublicMediaMirrorService and SyncPublicMediaMirror. Kept as one
     * constant so updated() can't drift out of sync with itself.
     */
    private const PUBLIC_MIRROR_TRIGGER_FIELDS = [
        'status', 'moderation_status', 'deleted_at', 'hls_ready_at',
        'video_url', 'thumbnail_url', 'quality_urls',
    ];

    public function __construct(private readonly SearchService $search) {}

    public function created(Video $video): void
    {
        SyncCreatorMonetization::dispatch($video->user_id);
        // Only count publicly published videos in the profile stat.
        // Drafts, private, scheduled, etc. are excluded so that
        // profile.total_videos matches what visitors can actually see.
        if ($video->status === 'published') {
            $video->user->profile?->increment('total_videos');
            self::bustProfileStats($video->user_id);
        }

        // A video can be born already public (e.g. created directly with
        // status=published) - the mirror sync is cheap/idempotent when
        // there's nothing to mirror yet (HLS not transcoded), so dispatch
        // unconditionally on the chance it is.
        if ($video->status === 'published') {
            SyncPublicMediaMirror::dispatch($video->id)->onQueue('media-mirror');
            NotifyFollowersOfNewPost::dispatch($video->id, $video->user_id)->onQueue('post-notifications');
        }

        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_VIDEO, $video->id);
    }

    public function updated(Video $video): void
    {
        SyncCreatorMonetization::dispatch($video->user_id);
        // Sync total_videos when status transitions to/from published.
        if ($video->wasChanged('status')) {
            $wasPublished = $video->getOriginal('status') === 'published';
            $isPublished  = $video->status === 'published';

            if (!$wasPublished && $isPublished) {
                $video->user->profile?->increment('total_videos');
                // A draft (or scheduled/private/unlisted video) published
                // just now - same "creator has a new post" announcement as
                // one born published in created() above.
                NotifyFollowersOfNewPost::dispatch($video->id, $video->user_id)->onQueue('post-notifications');
            } elseif ($wasPublished && !$isPublished) {
                $video->user->profile()?->where('total_videos', '>', 0)->decrement('total_videos');
            }
            self::bustProfileStats($video->user_id);
        }

        if ($video->wasChanged(self::PUBLIC_MIRROR_TRIGGER_FIELDS)) {
            SyncPublicMediaMirror::dispatch($video->id)->onQueue('media-mirror');
        }

        // Counter columns churn constantly on a popular video and are already
        // denormalised - re-indexing per view would hammer Typesense for a number
        // `search:reconcile` refreshes anyway. Anything else is worth indexing.
        $counters = ['views_count', 'likes_count', 'comments_count', 'shares_count', 'saves_count'];
        if ($video->wasChanged() && empty(array_diff(array_keys($video->getChanges()), $counters))) {
            return;
        }

        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_VIDEO, $video->id);
    }

    public function deleted(Video $video): void
    {
        SyncCreatorMonetization::dispatch($video->user_id);
        // Only decrement if the deleted video was publicly published.
        if ($video->status === 'published') {
            $video->user->profile()->where('total_videos', '>', 0)->decrement('total_videos');
            self::bustProfileStats($video->user_id);
        }

        // Covers both soft-delete and forceDelete() - Eloquent fires this same
        // event for both, and a deleted video's mirror must not outlive the
        // row either way. $video->exists is false only for forceDelete() (the
        // row is truly gone by now, even Video::withTrashed()->find() in the
        // job would find nothing) - carry the values it needs directly rather
        // than an ID to re-look-up. A plain soft-delete leaves the row
        // queryable (deleted_at set), so the normal ID-based dispatch is fine.
        if ($video->exists) {
            SyncPublicMediaMirror::dispatch($video->id)->onQueue('media-mirror');
        } else {
            $qualityKeys = collect($video->quality_urls ?? [])
                ->filter(fn ($key) => is_string($key) && $key !== '')
                ->values()->all();

            SyncPublicMediaMirror::dispatch($video->id, true, $video->video_url, $video->thumbnail_url, $qualityKeys)
                ->onQueue('media-mirror');
        }

        SyncSearchDocument::dispatch(SyncSearchDocument::TYPE_VIDEO, $video->id, 'remove');
    }

    /** Invalidate the cached viewer-independent profile aggregates (UserController::show). */
    private static function bustProfileStats(int $userId): void
    {
        try { \Illuminate\Support\Facades\Cache::forget("profile:stats:{$userId}"); } catch (\Throwable) {}
    }
}
