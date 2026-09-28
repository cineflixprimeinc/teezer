<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Http\Resources\VideoResource;
use App\Models\User;
use App\Models\Video;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use App\Services\CounterBuffer;
use App\Services\NotificationService;
use App\Services\ProfileSuggestionService;
use App\Services\RealtimeBus;
use App\Services\StorageService;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Redis;
use Illuminate\Support\Facades\Schema;

class UserController extends Controller
{
    public function show(Request $request, string $username): JsonResponse
    {
        $user = User::with(['profile', 'socialLinks'])
            ->where('username', $username)
            ->where('is_banned', false)
            ->firstOrFail();

        // Private accounts: only accepted followers see full profile
        $authUser = $request->user();
        $isOwn    = $authUser && $authUser->id === $user->id;
        $isAdmin  = $authUser?->isAdmin();

        if ($user->is_private && !$isOwn && !$isAdmin) {
            $followRecord = $authUser
                ? DB::table('followers')
                    ->where('follower_id', $authUser->id)
                    ->where('following_id', $user->id)
                    ->first()
                : null;

            $isFollowing  = $followRecord?->status === 'accepted';
            $followStatus = $followRecord?->status ?? 'none';

            if (!$isFollowing) {
                return response()->json(['success' => true, 'data' => [
                    'id'              => $user->id,
                    'username'        => $user->username,
                    'name'            => $user->name,
                    'avatar'          => $user->avatar ? \Illuminate\Support\Facades\Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified'     => (bool) $user->is_verified,
                    'is_private'      => true,
                    'is_following'    => false,
                    'follow_status'   => $followStatus,
                    'notify_posts'    => false,
                    // Counts are always visible even on private profiles
                    'followers_count' => (int) ($user->profile?->total_followers ?? 0),
                    'following_count' => (int) ($user->profile?->total_following ?? 0),
                    'likes_count'     => (int) ($user->profile?->total_likes ?? 0),
                    'videos_count'    => (int) ($user->profile?->total_videos ?? 0),
                    'has_story'       => false,
                    'has_approved_shop' => \App\Models\Shop::where('user_id', $user->id)
                        ->where('status', \App\Models\Shop::STATUS_APPROVED)
                        ->exists(),
                ]]);
            }
        }

        if ($authUser) {
            $user->is_blocked = $authUser->hasBlocked($user);

            $followRecord = DB::table('followers')
                ->where('follower_id', $authUser->id)
                ->where('following_id', $user->id)
                ->first();

            $user->follow_status = $followRecord?->status ?? 'none';
            $user->is_following  = $followRecord?->status === 'accepted';
            // The profile page's bell icon - only meaningful once actually
            // following, but read straight off the same row either way.
            $user->notify_posts  = (bool) ($followRecord?->notify_posts ?? false);
        }

        // Read-through cache of the viewer-INDEPENDENT profile aggregates.
        // These 6 count()/sum()/exists() queries are identical for every viewer
        // of a given profile, so we cache them by user id for a short TTL.
        // Viewer-SPECIFIC fields (is_following, follow_status, is_blocked) are
        // computed live above/below and are deliberately NOT cached.
        // Key: profile:stats:{id}  TTL: 90s  Invalidated: see invalidateProfileStats().
        $stats = \Illuminate\Support\Facades\Cache::remember(
            "profile:stats:{$user->id}",
            90,
            function () use ($user) {
                $publicVideos = $this->publicProfileVideosQuery($user);
                return [
                    'followers_count'      => (int) $user->acceptedFollowers()->count(),
                    'following_count'      => (int) $user->acceptedFollowing()->count(),
                    // Public-published count so the counter is consistent for everyone.
                    'videos_count'         => (int) (clone $publicVideos)->count(),
                    'total_likes_received' => (int) (clone $publicVideos)->sum('likes_count'),
                    'total_video_views'    => (int) (clone $publicVideos)->sum('views_count'),
                    'has_story'            => \App\Models\Story::where('user_id', $user->id)
                        ->where('status', 'published')
                        ->where(fn ($q) => $q->whereNull('expires_at')->orWhere('expires_at', '>', now()))
                        ->exists(),
                ];
            }
        );
        foreach ($stats as $attr => $value) {
            $user->setAttribute($attr, $value);
        }

        $this->recordProfileView($request, $user, $authUser, $isOwn, (bool) $isAdmin);

        return response()->json(['success' => true, 'data' => new UserResource($user)]);
    }

    public function drafts(Request $request, string $username): JsonResponse
    {
        $user    = User::where('username', $username)->firstOrFail();
        $authUser = $request->user();
        $isOwn   = $authUser && $authUser->id === $user->id;

        // Only owner can view their drafts
        if (!$isOwn) {
            return response()->json(['success' => false, 'message' => 'You cannot view other users\' drafts.'], 403);
        }

        $videos = Video::with(['user.profile', 'hashtags', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('user_id', $user->id)
            ->where('status', 'draft')
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->paginate(20);

        // 3 queries for the page instead of 3 per row - see the note on the helper.
        Video::attachViewerFlags($videos, $authUser);

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'current_page' => $videos->currentPage(),
                'last_page'    => $videos->lastPage(),
                'per_page'     => $videos->perPage(),
                'total'        => $videos->total(),
                'next_page_url'=> $videos->nextPageUrl(),
            ],
        ]);
    }

    public function videos(Request $request, string $username): JsonResponse
    {
        $user    = User::where('username', $username)->firstOrFail();
        $authUser = $request->user();
        $isOwn   = $authUser && $authUser->id === $user->id;

        if (!$this->canViewPrivateContent($authUser, $user)) {
            return response()->json(['success' => false, 'message' => 'This account is private.'], 403);
        }

        // Query is always scoped to the profile OWNER's videos - not the viewer's.
        // The Reels tab always shows public published videos regardless of who is viewing.
        // Draft/private/scheduled videos are managed via the /drafts endpoint (owner-only).
        //
        // `musicTrack` is what puts the sound on these rows. VideoResource emits
        // BOTH `main_sound` and `music_track` through whenLoaded('musicTrack'),
        // so without the eager-load neither key is present at all - not null,
        // absent - and every consumer reading "does this post have audio?" sees
        // no. That is why the post viewer opened from a profile showed no disc
        // on the rail and no track line under the caption while the feed, which
        // loads it (FeedService), showed both for the very same video.
        $query = Video::with(['user.profile', 'hashtags', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('user_id', $user->id)
            ->whereNull('deleted_at');

        $this->applyPublicVideoVisibility($query);

        $sort = $request->input('sort', 'latest');
        // Pinned reels always appear first; within each group apply sort order.
        match ($sort) {
            'oldest'      => $query->orderByDesc('is_pinned')->orderBy('created_at'),
            'most_viewed' => $query->orderByDesc('is_pinned')->orderByDesc('views_count')->orderByDesc('created_at'),
            'most_likes'  => $query->orderByDesc('is_pinned')->orderByDesc('likes_count')->orderByDesc('created_at'),
            default       => $query->orderByDesc('is_pinned')->orderByDesc('pinned_at')->orderByDesc('created_at'),
        };

        $videos = $query->paginate(20);

        // Batch-annotate is_liked / is_saved / is_following so VideoResource reads
        // the precomputed attributes instead of firing 3 EXISTS queries PER video
        // (an N+1: 3xN). Mirrors FeedService's annotation and returns identical
        // values. Follow-state is a single check here because every video on this
        // page belongs to the same creator ($user).
        if ($authUser && $videos->isNotEmpty()) {
            $ids   = collect($videos->items())->pluck('id');
            $liked = DB::table('video_likes')
                ->where('user_id', $authUser->id)->whereIn('video_id', $ids)
                ->pluck('video_id')->flip();
            $saved = DB::table('video_saves')
                ->where('user_id', $authUser->id)->whereIn('video_id', $ids)
                ->pluck('video_id')->flip();
            $isFollowing = $isOwn
                ? false
                : $authUser->following()->where('following_id', $user->id)->exists();
            foreach ($videos->items() as $v) {
                $v->is_liked = $liked->has($v->id);
                $v->is_saved = $saved->has($v->id);
                $v->is_following_creator = $isFollowing;
            }
        }

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'current_page' => $videos->currentPage(),
                'last_page'    => $videos->lastPage(),
                'per_page'     => $videos->perPage(),
                'total'        => $videos->total(),
                'next_page_url'=> $videos->nextPageUrl(),
            ],
        ]);
    }

    public function liked(Request $request, string $username): JsonResponse
    {
        $user     = User::where('username', $username)->firstOrFail();
        $authUser = $request->user();
        $isOwn    = $authUser && $authUser->id === $user->id;

        // Private account guard - accepted followers can see liked videos
        if (!$this->canViewPrivateContent($authUser, $user)) {
            return response()->json(['success' => false, 'message' => 'This account is private.', 'reason' => 'private_account'], 403);
        }

        // who_can_see_liked guard
        $whoCanSee = $user->who_can_see_liked ?? 'only_me';
        if (!$isOwn && $whoCanSee === 'only_me') {
            return response()->json(['success' => false, 'message' => 'This user keeps their liked videos private.', 'reason' => 'liked_private'], 403);
        }

        $videos = Video::with(['user.profile', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->join('video_likes', 'videos.id', '=', 'video_likes.video_id')
            ->where('video_likes.user_id', $user->id)
            ->where('videos.status', 'published')
            ->where(fn ($q) => $q->whereNull('videos.moderation_status')->orWhere('videos.moderation_status', '!=', 'rejected'))
            ->whereNull('videos.deleted_at')
            ->select('videos.*')
            ->withVisibleCommentsCount()
            ->orderByDesc('video_likes.created_at')
            ->paginate(20);

        Video::attachViewerFlags($videos, $authUser);

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => ['current_page' => $videos->currentPage(), 'last_page' => $videos->lastPage(), 'total' => $videos->total()],
        ]);
    }

    public function followers(Request $request, string $username): JsonResponse
    {
        $user = User::where('username', $username)->firstOrFail();

        if (!$this->canViewPrivateContent($request->user(), $user)) {
            return response()->json([
                'success'     => false,
                'private'     => true,
                'canViewList' => false,
                'message'     => 'This account is private',
            ], 403);
        }

        $followers = $user->acceptedFollowers()->with('profile')
            ->paginate($request->input('per_page', 20));

        $this->markFollowingFor($request->user(), $followers->getCollection());

        return response()->json([
            'success' => true,
            'data'    => UserResource::collection($followers),
            'meta'    => ['current_page' => $followers->currentPage(), 'last_page' => $followers->lastPage(), 'total' => $followers->total()],
        ]);
    }

    public function following(Request $request, string $username): JsonResponse
    {
        $user = User::where('username', $username)->firstOrFail();

        if (!$this->canViewPrivateContent($request->user(), $user)) {
            return response()->json([
                'success'     => false,
                'private'     => true,
                'canViewList' => false,
                'message'     => 'This account is private',
            ], 403);
        }

        // Load followers count and total likes received for each user in the following list
        $following = $user->acceptedFollowing()
            ->with('profile')
            ->withCount('followers')
            ->withSum('videos', 'likes_count')
            ->paginate($request->input('per_page', 20));

        // Map the `videos_sum_likes_count` from withSum to `total_likes_received` for the resource
        $following->getCollection()->each(function ($u) {
            $u->setAttribute('total_likes_received', $u->videos_sum_likes_count ?? 0);
        });

        $this->markFollowingFor($request->user(), $following->getCollection());

        return response()->json([
            'success' => true,
            'data'    => UserResource::collection($following),
            'meta'    => ['current_page' => $following->currentPage(), 'last_page' => $following->lastPage(), 'total' => $following->total()],
        ]);
    }

    /* ── GET /users/{username}/saved ─────────────────────────────────────── */
    public function saved(Request $request, string $username): JsonResponse
    {
        $user     = User::where('username', $username)->where('is_banned', false)->firstOrFail();
        $authUser = $request->user();
        $isOwn    = $authUser && $authUser->id === $user->id;

        // Check saved_privacy setting - default private
        $privacy = $user->saved_privacy ?? 'private';

        if (!$isOwn) {
            if ($privacy === 'private') {
                return response()->json(['success' => false, 'message' => 'This saved list is private.'], 403);
            }
            if ($privacy === 'followers') {
                $isFollowing = $authUser
                    ? DB::table('followers')
                        ->where('follower_id', $authUser->id)
                        ->where('following_id', $user->id)
                        ->where('status', 'accepted')
                        ->exists()
                    : false;
                if (!$isFollowing) {
                    return response()->json(['success' => false, 'message' => 'This saved list is only visible to followers.'], 403);
                }
            }
        }

        if (!$authUser && $isOwn) {
            return response()->json(['success' => false, 'message' => 'Unauthenticated.'], 401);
        }

        $videos = Video::with(['taggedUsers', 'collabUsers', 'featuredProducts'])
            ->join('video_saves', 'video_saves.video_id', '=', 'videos.id')
            ->where('video_saves.user_id', $user->id)
            ->where('videos.status', 'published')
            ->whereNull('videos.deleted_at')
            ->orderBy('video_saves.created_at', 'desc')
            ->select('videos.*')
            ->paginate(20);

        // No `user` eager-load on purpose: this endpoint never had one, so
        // VideoResource's whenLoaded('user') drops that block and the payload
        // carries no creator. Adding it here would change the response shape,
        // which is a separate decision - only the per-row like/save lookups are
        // batched away.
        Video::attachViewerFlags($videos, $authUser);

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'current_page'  => $videos->currentPage(),
                'last_page'     => $videos->lastPage(),
                'total'         => $videos->total(),
                'per_page'      => $videos->perPage(),
                'next_page_url' => $videos->nextPageUrl(),
            ],
        ]);
    }

    /* ── GET /users/{username}/saved/count ────────────────────────────────── */
    public function savedCount(Request $request, string $username): JsonResponse
    {
        $user     = User::where('username', $username)->where('is_banned', false)->firstOrFail();
        $authUser = $request->user();
        $isOwn    = $authUser && $authUser->id === $user->id;

        // Only owner can see the count
        $count = $isOwn
            ? \App\Models\VideoSave::where('user_id', $user->id)->count()
            : null;

        return response()->json([
            'success'     => true,
            'count'       => $count,
            'privacy'     => $user->saved_privacy ?? 'private',
        ]);
    }

    private function canViewPrivateContent(?User $authUser, User $target): bool
    {
        if (!$target->is_private) {
            return true;
        }
        if (!$authUser) {
            return false;
        }
        if ($authUser->id === $target->id || $authUser->isAdmin()) {
            return true;
        }

        return DB::table('followers')
            ->where('follower_id', $authUser->id)
            ->where('following_id', $target->id)
            ->where('status', 'accepted')
            ->exists();
    }

    private function publicProfileVideosQuery(User $user)
    {
        $query = Video::where('user_id', $user->id)->whereNull('deleted_at');
        return $this->applyPublicVideoVisibility($query);
    }

    private function applyPublicVideoVisibility($query)
    {
        return $query
            // Only 'published' status is publicly visible.
            // 'draft', 'private', 'unlisted', 'scheduled', 'removed' are excluded.
            ->where('status', 'published')
            // Only hide explicitly REJECTED videos.
            // null  = moderation disabled → safe to show
            // pending / approved / pending_review = not yet (or failed to) scan → show optimistically
            // rejected = explicitly flagged by moderation → hide
            ->where(fn ($q) => $q
                ->whereNull('moderation_status')
                ->orWhere('moderation_status', '!=', 'rejected')
            );
    }

    /**
     * Record a profile view - scalable, with cooldown-deduplicated notifications.
     *
     *  - A Redis key throttles each (owner, viewer) pair to one DB write per
     *    30 minutes, so rapid re-opens don't touch the database at all. This is
     *    the "very low DB load at billions of views" guarantee: at most one
     *    upsert + one buffered counter per pair per 30-min window.
     *  - One row per (owner, viewer): view_count increments and last_viewed_at
     *    advances on every recorded view. A SEPARATE notified_at column tracks
     *    when a "X viewed your profile" notification last fired for this pair;
     *    it only advances - and only then is a notification created - once
     *    notified_at is NULL (first-ever view) or older than the configured
     *    cooldown (config('services.profile_view_notifications.cooldown_days'),
     *    default 7 days). Repeat views inside the cooldown update last_viewed_at
     *    but never touch notified_at, so the same visitor can never produce more
     *    than one notification per cooldown window.
     *  - Race-condition safety: the eligibility check + write happen inside a
     *    DB transaction holding a pg_advisory_xact_lock keyed on this exact
     *    (owner, viewer) pair, so two simultaneous requests for the same pair
     *    are fully serialized - the second always sees the first's committed
     *    notified_at before deciding, so at most one can ever notify.
     *  - Publishes `profile.viewed` to the owner's realtime room so an OPEN
     *    Profile-Views screen refreshes live (no push otherwise).
     */
    private function recordProfileView(Request $request, User $user, ?User $authUser, bool $isOwn, bool $isAdmin): void
    {
        if ($isOwn || $isAdmin || !Schema::hasTable('profile_views')) {
            return;
        }
        if ($authUser && ($authUser->hasBlocked($user) || $user->hasBlocked($authUser))) {
            return;
        }
        // Private mode is reciprocal: a viewer who hid their profile views
        // browses invisibly - nothing is recorded.
        if ($authUser && $this->viewPrivacy($authUser) === 'private') {
            return;
        }

        $viewerId = $authUser?->id;
        $throttleKey = 'pv:seen:' . $user->id . ':' . ($viewerId ? "u{$viewerId}" : 'ip' . sha1($request->ip()));

        try {
            // SET key IF NOT EXISTS with a 30-min TTL - the atomic throttle gate.
            // phpredis options-array form; returns false when NX blocks the set.
            $fresh = Redis::connection('default')->set($throttleKey, 1, ['NX', 'EX' => 1800]);
            if (!$fresh) {
                return; // seen within 30 min → no DB work
            }
        } catch (\Throwable $e) {
            // Redis down → fall through and let the DB be the source of truth.
            Log::warning('profile-view throttle fallback', ['err' => $e->getMessage()]);
        }

        // Logged-in viewers get a durable per-pair row (the viewer list). Guests
        // only bump the aggregate counter - they never appear in the list, and
        // there's no actor to notify about, so the notification path is skipped.
        if ($viewerId) {
            $now = now();
            $cooldownDays = (int) config('services.profile_view_notifications.cooldown_days', 7);
            $shouldNotify = false;

            DB::transaction(function () use ($request, $user, $viewerId, $now, $cooldownDays, &$shouldNotify) {
                // Serialize concurrent view-recording for this exact (owner, viewer)
                // pair. pg_advisory_xact_lock is held only for this transaction and
                // auto-released on commit/rollback - no leaked-lock risk on error. This
                // guarantees two simultaneous requests for the same pair queue up
                // instead of racing, regardless of the profile_views timestamp columns'
                // storage precision (they're whole-second, so a single-statement
                // "compare returned value to my own bound NOW()" trick can false-match
                // across two *different* pairs that happen to write in the same second).
                DB::statement('SELECT pg_advisory_xact_lock(hashtext(?)::bigint)', ["{$user->id}:{$viewerId}"]);

                $existing = DB::table('profile_views')
                    ->where('profile_user_id', $user->id)
                    ->where('viewer_id', $viewerId)
                    ->first();

                $shouldNotify = !$existing
                    || $existing->notified_at === null
                    || \Illuminate\Support\Carbon::parse($existing->notified_at)->lt($now->copy()->subDays($cooldownDays));

                if ($existing) {
                    DB::table('profile_views')->where('id', $existing->id)->update([
                        'last_viewed_at' => $now,
                        'viewed_at'      => $now,
                        'view_count'     => $existing->view_count + 1,
                        'updated_at'     => $now,
                        'notified_at'    => $shouldNotify ? $now : $existing->notified_at,
                        'ip_address'     => $request->ip(),
                        'user_agent'     => (string) $request->userAgent(),
                    ]);
                } else {
                    DB::table('profile_views')->insert([
                        'profile_user_id' => $user->id,
                        'viewer_id'       => $viewerId,
                        'ip_address'      => $request->ip(),
                        'user_agent'      => (string) $request->userAgent(),
                        'viewed_at'       => $now,
                        'first_viewed_at' => $now,
                        'last_viewed_at'  => $now,
                        'view_count'      => 1,
                        'notified_at'     => $shouldNotify ? $now : null,
                        'created_at'      => $now,
                        'updated_at'      => $now,
                    ]);
                }
            });

            if ($shouldNotify) {
                app(NotificationService::class)->notify($user, 'profile_view', [
                    'actor_id'    => $viewerId,
                    'entity_type' => 'user',
                    'entity_id'   => $viewerId,
                    'message'     => NotificationService::buildMessage('profile_view', $authUser->name ?: $authUser->username),
                ]);
            }

            // Bump the per-owner cache generation so an open list refetch is fresh.
            try { Redis::connection('default')->incr('pv:ver:' . $user->id); } catch (\Throwable) {}
            // Live nudge to an OPEN Profile-Views screen (ignored otherwise).
            RealtimeBus::publish([RealtimeBus::userRoom($user->id)], 'profile.viewed', ['viewer_id' => $viewerId]);
        }

        // Aggregate "profile views" counter - batched (flushed once/min).
        CounterBuffer::add('profile', $user->id, 'profile_views');
    }

    /** Effective 3-way profile-view privacy, tolerant of the legacy boolean. */
    private function viewPrivacy(User $u): string
    {
        $p = $u->profile_view_privacy ?? null;
        if (in_array($p, ['everyone', 'followers', 'private'], true)) {
            return $p;
        }
        return ($u->profile_view_history ?? true) ? 'everyone' : 'private';
    }

    /**
     * Mark each user in $rows with `is_following` from the viewer's
     * perspective using a single pluck query (avoids N+1 in lists).
     */
    private function markFollowingFor(?User $viewer, iterable $rows): void
    {
        if (!$viewer) {
            foreach ($rows as $row) {
                $row->is_following = false;
            }
            return;
        }

        $ids = collect($rows)->pluck('id')->all();
        if (empty($ids)) return;

        $followingIds = DB::table('followers')
            ->where('follower_id', $viewer->id)
            ->whereIn('following_id', $ids)
            ->where('status', 'accepted')
            ->pluck('following_id')
            ->all();
        $set = array_flip($followingIds);

        foreach ($rows as $row) {
            $row->is_following = isset($set[$row->id]);
        }
    }

    public function search(Request $request): JsonResponse
    {
        $request->validate(['q' => ['required', 'string', 'min:1', 'max:100']]);
        $q = $request->input('q');

        $users = User::with('profile')
            ->where('is_banned', false)
            ->where(fn ($query) =>
                $query->where('username', 'ilike', "%{$q}%")
                      ->orWhere('name', 'ilike', "%{$q}%")
            )
            ->limit(20)
            ->get();

        return response()->json(['success' => true, 'data' => UserResource::collection($users)]);
    }

    public function suggestions(Request $request): JsonResponse
    {
        try {
            $service = app(ProfileSuggestionService::class);
            $items   = $service->getSuggestions($request->user(), 'home', 15);

            // Map to legacy format (data array of UserResource-like objects)
            // so existing callers (friend.service.ts) still work unchanged.
            $data = array_map(fn ($s) => [
                'id'           => $s['id'],
                'name'         => $s['display_name'],
                'username'     => $s['username'],
                'avatar'       => $s['avatar'],
                'bio'          => $s['bio'],
                'is_verified'  => $s['is_verified'],
                'is_following' => false,
                'role'         => $s['is_creator'] ? 'creator' : 'user',
                'followers_count' => $s['followers_count'],
                // Extended fields - ignored by old callers, used by new service
                'reason'                => $s['reason'],
                'score'                 => $s['score'],
                'mutual_followers_count'=> $s['mutual_followers_count'],
            ], $items);

            return response()->json(['success' => true, 'data' => $data]);

        } catch (\Throwable $e) {
            Log::warning('suggestions endpoint failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => true, 'data' => []]);
        }
    }
}
