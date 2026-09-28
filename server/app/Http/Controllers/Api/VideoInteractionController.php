<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Video;
use App\Models\VideoLike;
use App\Models\VideoReport;
use App\Models\VideoSave;
use App\Models\VideoShare;
use App\Services\NotificationService;
use App\Services\RealtimeBus;
use App\Services\ReportEvidenceService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class VideoInteractionController extends Controller
{
    public function __construct(
        private readonly NotificationService $notifs,
        private readonly ReportEvidenceService $reportEvidence,
    ) {}

    // ── Like / Unlike ──────────────────────────────────────────────────

    /**
     * Idempotent: liking an already-liked video returns the current count
     * without re-incrementing.
     *
     * NOTE: VideoLikeObserver handles all likes_count adjustments automatically
     * (created → +1, deleted → -1). Do NOT call $video->increment/decrement
     * here - that would double the count.
     */
    public function like(Request $request, int $id): JsonResponse
    {
        $video = $this->interactableVideo($id);
        $user  = $request->user();

        // Atomic + idempotent: firstOrCreate relies on the unique (video_id,user_id)
        // index, so two concurrent taps can never create two rows (the loser hits
        // the unique constraint and re-reads the existing row). The observer's
        // `created` event - and thus the likes_count increment + notification -
        // fires only on a genuine insert, so a repeated like never inflates the
        // count. One user = exactly one like.
        $like = DB::transaction(function () use ($id, $user) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();
            return VideoLike::firstOrCreate(['video_id' => $id, 'user_id' => $user->id]);
        });

        if ($like->wasRecentlyCreated && $video->user_id !== $user->id) {
            $this->notifs->notify($video->user, 'like', [
                'actor_id'    => $user->id,
                'entity_type' => 'video',
                'entity_id'   => $video->id,
                'message'     => NotificationService::buildMessage('like', $user->name),
            ]);
        }

        $count = (int) $video->fresh()->likes_count;
        // Realtime fan-out to everyone viewing this video (other devices update live).
        RealtimeBus::publish([RealtimeBus::videoRoom($id)], 'video.liked', ['video_id' => $id, 'likes_count' => $count]);

        return response()->json([
            'success'     => true,
            'liked'       => true,
            'likes_count' => $count,
        ]);
    }

    public function unlike(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);
        $user  = $request->user();

        // MUST delete via the model instance: a query-builder bulk delete fires
        // no Eloquent events, so VideoLikeObserver::deleted never decremented -
        // rapid like/unlike toggling inflated likes_count by +1 per cycle.
        // Same video lock as like()/toggleLike() serializes concurrent taps, so
        // every real insert (+1) is matched by exactly one real delete (-1).
        DB::transaction(function () use ($id, $user) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();
            VideoLike::where('video_id', $id)
                ->where('user_id', $user->id)
                ->lockForUpdate()
                ->first()
                ?->delete(); // no row → no-op (idempotent)
        });

        // Roll back the like from its aggregated notification group so the
        // creator's "N people liked" count reflects only currently-active likers
        // (Like → Unlike → Like never double-counts).
        if ($video->user_id !== $user->id) {
            $this->notifs->withdraw($video->user_id, 'like', [
                'actor_id' => $user->id, 'entity_type' => 'video', 'entity_id' => $video->id,
            ]);
        }

        $count = max(0, (int) $video->fresh()->likes_count);
        RealtimeBus::publish([RealtimeBus::videoRoom($id)], 'video.unliked', ['video_id' => $id, 'likes_count' => $count]);

        return response()->json([
            'success'     => true,
            'liked'       => false,
            'likes_count' => $count,
        ]);
    }

    // ── Save / Unsave ──────────────────────────────────────────────────

    /**
     * Idempotent. VideoSave has no observer so the controller manages
     * saves_count directly (only when wasRecentlyCreated).
     */
    public function save(Request $request, int $id): JsonResponse
    {
        $video = $this->interactableVideo($id);
        $user  = $request->user();

        $save = DB::transaction(function () use ($id, $user) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();
            return VideoSave::firstOrCreate(['video_id' => $id, 'user_id' => $user->id]);
        });
        if ($save->wasRecentlyCreated) {
            $video->increment('saves_count');
            if ($video->user_id !== $user->id) {
                $this->notifs->notify($video->user, 'save', [
                    'actor_id'    => $user->id,
                    'entity_type' => 'video',
                    'entity_id'   => $video->id,
                    'message'     => NotificationService::buildMessage('save', $user->name),
                ]);
            }
        }

        $count = (int) $video->fresh()->saves_count;
        // Realtime fan-out to everyone viewing this video (live saves count).
        RealtimeBus::publish([RealtimeBus::videoRoom($id)], 'video.saved', ['video_id' => $id, 'saves_count' => $count]);

        return response()->json([
            'success'     => true,
            'saved'       => true,
            'saves_count' => $count,
        ]);
    }

    public function unsave(Request $request, int $id): JsonResponse
    {
        $video = Video::findOrFail($id);
        $user  = $request->user();

        $deleted = VideoSave::where('video_id', $id)->where('user_id', $user->id)->delete();
        if ($deleted) {
            Video::whereKey($video->id)->where('saves_count', '>', 0)->decrement('saves_count');
            if ($video->user_id !== $user->id) {
                $this->notifs->withdraw($video->user_id, 'save', [
                    'actor_id' => $user->id, 'entity_type' => 'video', 'entity_id' => $video->id,
                ]);
            }
        }

        $count = max(0, (int) $video->fresh()->saves_count);
        RealtimeBus::publish([RealtimeBus::videoRoom($id)], 'video.unsaved', ['video_id' => $id, 'saves_count' => $count]);

        return response()->json([
            'success'     => true,
            'saved'       => false,
            'saves_count' => $count,
        ]);
    }

    // ── Toggle like (single idempotent endpoint) ───────────────────────

    /**
     * Single atomic toggle. Wrapped in a DB transaction so concurrent
     * requests cannot both create a row and double-increment.
     *
     * VideoLikeObserver handles likes_count - do NOT call increment/decrement
     * manually here.
     */
    public function toggleLike(Request $request, int $id): JsonResponse
    {
        $video = $this->interactableVideo($id);
        $user  = $request->user();

        $liked = DB::transaction(function () use ($id, $user) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();
            $existing = VideoLike::where('video_id', $id)->where('user_id', $user->id)->lockForUpdate()->first();

            if ($existing) {
                // Observer (VideoLikeObserver::deleted) decrements likes_count
                $existing->delete();
                return false;
            }

            // Observer (VideoLikeObserver::created) increments likes_count
            VideoLike::create(['video_id' => $id, 'user_id' => $user->id]);
            return true;
        });

        if ($video->user_id !== $user->id) {
            if ($liked) {
                $this->notifs->notify($video->user, 'like', [
                    'actor_id'    => $user->id,
                    'entity_type' => 'video',
                    'entity_id'   => $video->id,
                    'message'     => NotificationService::buildMessage('like', $user->name),
                ]);
            } else {
                $this->notifs->withdraw($video->user_id, 'like', [
                    'actor_id' => $user->id, 'entity_type' => 'video', 'entity_id' => $video->id,
                ]);
            }
        }

        $freshCount = max(0, (int) $video->fresh()->likes_count);
        RealtimeBus::publish([RealtimeBus::videoRoom($id)], $liked ? 'video.liked' : 'video.unliked', ['video_id' => $id, 'likes_count' => $freshCount]);

        return response()->json([
            'success'     => true,
            'liked'       => $liked,
            'likes_count' => $freshCount,
        ]);
    }

    // ── Toggle save (single idempotent endpoint) ───────────────────────

    /**
     * Single atomic toggle. Wrapped in a DB transaction to prevent
     * concurrent double-saves. VideoSave has no observer so this
     * controller manages saves_count directly.
     */
    public function toggleSave(Request $request, int $id): JsonResponse
    {
        $video = $this->interactableVideo($id);
        $user  = $request->user();

        $saved = DB::transaction(function () use ($id, $user, $video) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();
            $existing = VideoSave::where('video_id', $id)->where('user_id', $user->id)->lockForUpdate()->first();

            if ($existing) {
                $existing->delete();
                Video::whereKey($video->id)->where('saves_count', '>', 0)->decrement('saves_count');
                return false;
            }

            VideoSave::create(['video_id' => $id, 'user_id' => $user->id]);
            $video->increment('saves_count');
            return true;
        });

        if ($video->user_id !== $user->id) {
            if ($saved) {
                $this->notifs->notify($video->user, 'save', [
                    'actor_id'    => $user->id,
                    'entity_type' => 'video',
                    'entity_id'   => $video->id,
                    'message'     => NotificationService::buildMessage('save', $user->name),
                ]);
            } else {
                $this->notifs->withdraw($video->user_id, 'save', [
                    'actor_id' => $user->id, 'entity_type' => 'video', 'entity_id' => $video->id,
                ]);
            }
        }

        $count = max(0, (int) $video->fresh()->saves_count);
        RealtimeBus::publish([RealtimeBus::videoRoom($id)], $saved ? 'video.saved' : 'video.unsaved', ['video_id' => $id, 'saves_count' => $count]);

        return response()->json([
            'success'     => true,
            'saved'       => $saved,
            'saves_count' => $count,
        ]);
    }

    // ── Share ──────────────────────────────────────────────────────────

    public function share(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'platform' => ['required', 'in:whatsapp,instagram,telegram,twitter,facebook,copy_link,native,other'],
        ]);

        $video  = $this->interactableVideo($id);
        $userId = $request->user()?->id;

        // Deduplicate: a share only counts once per video per day - by user_id
        // when signed in, by IP for a guest. Guest rows had NO dedup at all: the
        // route is deliberately public ("Share is public so guest copy-link/
        // social shares still count"), but with nothing keying a guest row to
        // anything, every call unconditionally incremented shares_count - which
        // feeds straight into feed/trending ranking and creator analytics - with
        // no account required and no limit beyond the route's generic per-minute
        // throttle. IP is the same fallback identity VideoController::recordView
        // already uses for guest views, for the same reason: it is the only
        // stable-ish thing a guest request carries.
        //
        // Locked and wrapped in a transaction, same as recordView(): a bare
        // exists()-then-create() lets two concurrent requests both pass the
        // check before either row exists, so "once per day" would only be true
        // most of the time rather than always.
        $counted = false;
        DB::transaction(function () use ($request, $id, $userId, $video, &$counted) {
            Video::whereKey($id)->lockForUpdate()->firstOrFail();

            $alreadyShared = VideoShare::where('video_id', $id)
                ->when($userId, fn ($q) => $q->where('user_id', $userId))
                ->when(!$userId, fn ($q) => $q->where('ip_address', $request->ip()))
                ->where('created_at', '>=', now()->subDay())
                ->lockForUpdate()
                ->exists();

            if (!$alreadyShared) {
                VideoShare::create([
                    'video_id'   => $id,
                    'user_id'    => $userId,
                    'ip_address' => $request->ip(),
                    'platform'   => $request->input('platform'),
                ]);
                $video->increment('shares_count');
                $counted = true;
            }
        });

        // Aggregated "X and N others shared your video" for the creator. Dedup
        // above (once per user per day) keeps a serial sharer from re-notifying.
        if ($counted && $userId && $video->user_id !== $userId) {
            $this->notifs->notify($video->user, 'share', [
                'actor_id'    => $userId,
                'entity_type' => 'video',
                'entity_id'   => $video->id,
                'message'     => NotificationService::buildMessage('share', $request->user()->name),
            ]);
        }

        return response()->json([
            'success'      => true,
            'shares_count' => (int) $video->fresh()->shares_count,
        ]);
    }

    // ── Report ────────────────────────────────────────────────────────

    public function report(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'reason'      => ['required', 'in:spam,nudity,hate,misinformation,violence,copyright,harassment,other'],
            'description' => ['nullable', 'string', 'max:500'],
            ...$this->reportEvidence->rules(),
        ]);

        $video = $this->interactableVideo($id);
        $user  = $request->user();

        $already = VideoReport::where('video_id', $id)->where('reporter_id', $user->id)->exists();
        if ($already) {
            return response()->json(['success' => false, 'message' => 'You have already reported this video.'], 422);
        }

        VideoReport::create([
            'video_id'      => $id,
            'reporter_id'   => $user->id,
            'reason'        => $request->input('reason'),
            'description'   => $request->input('description'),
            'evidence_keys' => $this->reportEvidence->store($request),
        ]);

        return response()->json(['success' => true, 'message' => 'Report submitted. Thank you.']);
    }

    // ── Not interested ────────────────────────────────────────────────

    /**
     * Soft "don't show me this again" signal. Stored in the cache layer with
     * a 30-day TTL - survives PHP-FPM restarts because the project uses the
     * database cache driver. The FeedService reads this set and excludes
     * flagged videos from future For You pages for this user.
     */
    public function notInterested(Request $request, int $id): JsonResponse
    {
        $this->interactableVideo($id);
        $user = $request->user();

        $key = self::notInterestedKey($user->id, $id);
        Cache::put($key, true, now()->addDays(30));

        return response()->json(['success' => true, 'message' => 'We won’t show this again for a while.']);
    }

    public static function notInterestedKey(int $userId, int $videoId): string
    {
        return "ni:{$userId}:{$videoId}";
    }

    /**
     * Soft "see fewer videos from this creator" signal - same cache-layer
     * pattern as notInterested(), keyed per creator with a 90-day TTL.
     * FeedService excludes flagged creators from future For You pages.
     */
    public function dontRecommendCreator(Request $request, int $id): JsonResponse
    {
        $video = $this->interactableVideo($id);
        $user  = $request->user();

        Cache::put(self::dontRecommendCreatorKey($user->id, $video->user_id), true, now()->addDays(90));

        return response()->json(['success' => true, 'message' => 'We’ll recommend fewer videos from this creator.']);
    }

    public static function dontRecommendCreatorKey(int $userId, int $creatorId): string
    {
        return "nrc:{$userId}:{$creatorId}";
    }

    private function interactableVideo(int $id): Video
    {
        return Video::where('id', $id)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->firstOrFail();
    }
}
