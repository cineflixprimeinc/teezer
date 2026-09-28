<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\UserResource;
use App\Http\Resources\VideoResource;
use App\Models\Hashtag;
use App\Models\User;
use App\Models\Video;
use App\Services\FeedService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ExploreController extends Controller
{
    public function __construct(private readonly FeedService $feedService) {}

    public function trending(Request $request): JsonResponse
    {
        // Trending is identical for everyone, so cache the heavy query for 15 min
        // (per page). Public Cache-Control lets the browser/CDN reuse it too.
        $perPage = (int) $request->get('per_page', 20);
        $page    = max(1, (int) $request->get('page', 1));

        // Optional server-side category filter against the real videos.category
        // column. "All"/"Live" (and the mobile "trending" id used for "All" -
        // see ExploreScreen's CATEGORIES/matchesCategory) are client-only
        // pseudo-categories that mean "no filter" here.
        $rawCategory = trim((string) $request->get('category', ''));
        $category = ($rawCategory !== '' && !in_array(strtolower($rawCategory), ['all', 'live', 'trending'], true))
            ? $rawCategory
            : null;

        $cacheKey = "explore:trending:pp{$perPage}:p{$page}"
            . ($category ? ':cat' . strtolower($category) : '');

        $paginator = Cache::remember(
            $cacheKey,
            now()->addMinutes(15),
            fn () => $this->feedService->trending($perPage, $category),
        );

        // Deliberately OUTSIDE Cache::remember: these flags are per-viewer, and
        // caching them would serve one user's liked/saved/following state to
        // everyone who hit the same 15-minute bucket. The cached payload stays
        // viewer-agnostic; only this 3-query annotation is per-request.
        Video::attachViewerFlags($paginator, $request->user());

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($paginator),
            'meta'    => ['current_page' => $paginator->currentPage(), 'last_page' => $paginator->lastPage(), 'total' => $paginator->total()],
        ])->header('Cache-Control', 'public, max-age=900, stale-while-revalidate=3600');
    }

    /**
     * GET /explore/top-creators - top ~10 creators ranked by REAL 7-day
     * new-follower count (computed from followers.created_at - no new storage).
     *
     * Excludes creators with total_followers < self::TOP_CREATORS_MIN_FOLLOWERS
     * so the list isn't dominated by brand-new accounts with a tiny denominator
     * (e.g. 1 → 41 followers reads as "+4000%" and is more noise than signal).
     * growth_pct is only reported when last week's follower base is large
     * enough (>= self::TOP_CREATORS_MIN_PRIOR_FOR_PCT) for the percentage to be
     * meaningful; otherwise it is null and new_followers_this_week (a plain
     * count) is reported instead.
     */
    private const TOP_CREATORS_MIN_FOLLOWERS   = 50;
    private const TOP_CREATORS_MIN_PRIOR_FOR_PCT = 5;

    public function topCreators(Request $request): JsonResponse
    {
        $limit = (int) min(max((int) $request->get('limit', 10), 1), 20);

        // Shared (non-personalized) part is cached 15 min - identical for
        // everyone; is_following is annotated fresh per-request below.
        $creators = Cache::remember('explore:top-creators:v1', now()->addMinutes(15), function () {
            $now         = now();
            $weekAgo     = $now->copy()->subDays(7)->toDateTimeString();
            $twoWeeksAgo = $now->copy()->subDays(14)->toDateTimeString();

            // Real week-over-week growth straight from the followers pivot -
            // no fabricated numbers, no extra storage.
            $growth = DB::table('followers')
                ->where('status', 'accepted')
                ->where('created_at', '>=', $twoWeeksAgo)
                ->selectRaw(
                    'following_id,
                     SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) AS new_this_week,
                     SUM(CASE WHEN created_at <  ? THEN 1 ELSE 0 END) AS new_prior_week',
                    [$weekAgo, $weekAgo],
                )
                ->groupBy('following_id')
                ->havingRaw('SUM(CASE WHEN created_at >= ? THEN 1 ELSE 0 END) > 0', [$weekAgo])
                ->orderByDesc('new_this_week')
                ->limit(50) // oversample; the follower-count floor below trims it
                ->get()
                ->keyBy('following_id');

            if ($growth->isEmpty()) {
                return collect();
            }

            $rows = DB::table('users as u')
                ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
                ->whereIn('u.id', $growth->keys()->all())
                ->where('u.is_banned', false)
                ->where('u.is_active', true)
                ->where(fn ($q) => $q->where('u.is_private', false)->orWhereNull('u.is_private'))
                ->where('p.total_followers', '>=', self::TOP_CREATORS_MIN_FOLLOWERS)
                ->select(['u.id', 'u.name', 'u.username', 'u.avatar', 'u.bio', 'u.is_verified', 'p.total_followers', 'p.category'])
                ->get()
                ->keyBy('id');

            if ($rows->isEmpty()) {
                return collect();
            }

            return $growth->only($rows->keys()->all())
                ->map(function ($g) use ($rows) {
                    $u         = $rows[$g->following_id];
                    $thisWeek  = (int) $g->new_this_week;
                    $priorWeek = (int) $g->new_prior_week;

                    $growthPct = null;
                    if ($priorWeek >= self::TOP_CREATORS_MIN_PRIOR_FOR_PCT) {
                        $growthPct = round((($thisWeek - $priorWeek) / $priorWeek) * 100, 1);
                    }

                    return [
                        'id'                       => (int) $u->id,
                        'name'                     => $u->name,
                        'username'                 => $u->username,
                        'avatar'                   => $u->avatar ? Storage::url($u->avatar) : StorageService::defaultAvatarUrl(),
                        'is_verified'              => (bool) $u->is_verified,
                        'followers_count'          => (int) ($u->total_followers ?? 0),
                        'growth_pct'               => $growthPct,
                        'new_followers_this_week'  => $thisWeek,
                        'bio'                      => $u->bio,
                        'category'                 => $u->category,
                    ];
                })
                ->sortByDesc('new_followers_this_week')
                ->values();
        });

        $limited = $creators->take($limit)->values();

        // is_following - same "accepted follow" semantics as ProfileController.
        $user = $request->user();
        $followingIds = ($user && $limited->isNotEmpty())
            ? DB::table('followers')
                ->where('follower_id', $user->id)
                ->where('status', 'accepted')
                ->whereIn('following_id', $limited->pluck('id'))
                ->pluck('following_id')->flip()
            : collect();

        $data = $limited->map(function (array $c) use ($followingIds) {
            $c['is_following'] = $followingIds->has($c['id']);
            return $c;
        })->values();

        return response()->json([
            'success' => true,
            'data'    => $data,
        ])->header('Cache-Control', 'private, max-age=60');
    }

    /**
     * GET /explore/featured - the "Featured today" hero carousel.
     *
     * There is no editorial flag on videos and no human curating this, so each
     * card is EARNED by a different real signal rather than picked. The kicker
     * is not decoration: it tells the viewer which signal put the video there.
     *
     *   EDITOR'S PICK  - best engagement-per-view this week. Rate rather than
     *                    raw totals, so a genuinely good video from a small
     *                    account can win against a big account's mediocre one.
     *   NEW THIS WEEK  - strongest opener among videos posted in the last 7
     *                    days, ranked on views-per-hour since publication so a
     *                    6-hour-old hit is not buried by a 6-day-old one.
     *   FINISHED MOST  - highest completion_rate. Watching to the end is the
     *                    hardest signal to fake and the one least correlated
     *                    with follower count.
     *   RISING CREATOR - best recent video from whoever gained the most
     *                    followers this week, which is the only card here that
     *                    surfaces a person rather than a post.
     *
     * Each signal contributes at most one card and no creator appears twice -
     * four slots filled by one prolific account would make a "featured" rail
     * that is really just one person's feed.
     */
    public function featured(): JsonResponse
    {
        $cards = Cache::remember('explore:featured:v1', now()->addMinutes(20), function () {
            $usedVideoIds = [];
            $usedUserIds  = [];
            $out          = [];

            $base = fn () => Video::query()
                ->with(['user:id,name,username,avatar,is_verified', 'featuredProducts'])
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
                ->whereNull('deleted_at')
                ->whereNotNull('video_url');

            $take = function (?Video $v, string $kicker) use (&$usedVideoIds, &$usedUserIds, &$out): void {
                if (!$v || in_array($v->id, $usedVideoIds, true) || in_array($v->user_id, $usedUserIds, true)) {
                    return;
                }
                $usedVideoIds[] = $v->id;
                $usedUserIds[]  = $v->user_id;
                $out[]          = ['kicker' => $kicker, 'video' => $v];
            };

            // EDITOR'S PICK - engagement rate, with a floor on views so a video
            // seen twice and liked twice cannot post a perfect score.
            $take((clone $base())
                ->where('created_at', '>=', now()->subDays(7))
                ->where('views_count', '>=', 50)
                ->orderByRaw('((likes_count + comments_count * 2 + saves_count * 3)::numeric / GREATEST(views_count, 1)) DESC')
                ->orderByDesc('views_count')
                ->first(), "EDITOR'S PICK");

            // NEW THIS WEEK - velocity since publication, not absolute views.
            $take((clone $base())
                ->where('created_at', '>=', now()->subDays(7))
                ->orderByRaw('(views_count::numeric / GREATEST(EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600, 1)) DESC')
                ->first(), 'NEW THIS WEEK');

            // FINISHED MOST - completion_rate is only meaningful once enough
            // people have watched, hence the views floor.
            // completion_rate is NOT NULL default 0, so "> 0" is the real test -
            // whereNotNull would match every row that has never been watched.
            $take((clone $base())
                ->where('completion_rate', '>', 0)
                ->where('views_count', '>=', 50)
                ->orderByDesc('completion_rate')
                ->first(), 'FINISHED MOST');

            // RISING CREATOR - most new followers in the last 7 days, then that
            // creator's best recent video.
            // status='accepted' matches topCreators: a pending follow request is
            // not a follower, and counting them would let anyone spam their way
            // onto the front page by requesting follows they never received.
            $risingUserId = DB::table('followers')
                ->where('status', 'accepted')
                ->where('created_at', '>=', now()->subDays(7))
                ->whereNotIn('following_id', $usedUserIds ?: [0])
                ->groupBy('following_id')
                ->orderByRaw('COUNT(*) DESC')
                ->value('following_id');

            if ($risingUserId) {
                $take((clone $base())
                    ->where('user_id', $risingUserId)
                    ->orderByDesc('views_count')
                    ->first(), 'RISING CREATOR');
            }

            // Nothing qualified (a brand-new install, or every candidate already
            // used) - fall back to plain top videos so the rail is never empty
            // on a page whose first section it is.
            if (count($out) < 2) {
                $filler = (clone $base())
                    ->whereNotIn('id', $usedVideoIds ?: [0])
                    ->orderByDesc('views_count')
                    ->limit(4 - count($out))
                    ->get();

                foreach ($filler as $v) {
                    $take($v, 'POPULAR NOW');
                }
            }

            return collect($out)->map(fn (array $row) => [
                'kicker' => $row['kicker'],
                'video'  => $row['video'],
            ])->values();
        });

        return response()->json([
            'success' => true,
            'data'    => $cards->map(fn ($row) => [
                'kicker' => $row['kicker'],
                'video'  => new VideoResource($row['video']),
            ]),
        ])->header('Cache-Control', 'public, max-age=600, stale-while-revalidate=1800');
    }

    /**
     * GET /explore/categories - "Browse by interest" tiles.
     *
     * Real totals per videos.category: how many published videos carry it and
     * how many views those have between them. The design puts a view count on
     * each tile, and a tile claiming "2.4B views" that was actually a constant
     * in the client would be the kind of number nobody ever checks and everyone
     * quotes.
     *
     * Categories with no videos are omitted rather than shown as zero - an
     * empty tile invites a tap that leads to an empty grid.
     */
    public function categories(): JsonResponse
    {
        $rows = Cache::remember('explore:categories:v1', now()->addMinutes(30), fn () =>
            Video::query()
                ->whereNull('deleted_at')
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
                ->whereNotNull('category')
                ->where('category', '!=', '')
                ->groupBy('category')
                ->selectRaw('category, COUNT(*) AS videos, COALESCE(SUM(views_count), 0) AS views')
                ->orderByDesc('views')
                ->get()
                ->map(fn ($r) => [
                    'category' => (string) $r->category,
                    'videos'   => (int) $r->videos,
                    'views'    => (int) $r->views,
                ])
                ->values()
        );

        return response()->json([
            'success' => true,
            'data'    => $rows,
        ])->header('Cache-Control', 'public, max-age=1800, stale-while-revalidate=3600');
    }

    /**
     * GET /explore/sounds - the Sounds tab.
     *
     * Popular sounds ranked by how many videos actually use them, each carrying
     * a few real thumbnails from those videos. The thumbnails are the point: a
     * sound name and a use-count says nothing about whether the sound suits
     * what you make, and seeing three videos that used it answers that
     * instantly.
     */
    public function sounds(Request $request): JsonResponse
    {
        $limit = min(30, max(5, (int) $request->get('limit', 20)));

        $rows = Cache::remember("explore:sounds:v1:{$limit}", now()->addMinutes(15), function () use ($limit) {
            $tracks = DB::table('videos as v')
                ->join('music_tracks as m', 'm.id', '=', 'v.music_track_id')
                ->whereNull('v.deleted_at')
                ->where('v.status', 'published')
                ->groupBy('m.id', 'm.title', 'm.artist_name', 'm.cover_url')
                ->select([
                    'm.id', 'm.title', 'm.artist_name', 'm.cover_url',
                    DB::raw('COUNT(*) AS uses'),
                ])
                ->orderByDesc(DB::raw('COUNT(*)'))
                ->limit($limit)
                ->get();

            if ($tracks->isEmpty()) {
                return collect();
            }

            // One extra query for every sound's sample thumbnails rather than a
            // query per sound - twenty sounds would otherwise be twenty-one
            // round trips for a section most people scroll straight past.
            $ids     = $tracks->pluck('id')->all();
            $samples = Video::query()
                ->whereIn('music_track_id', $ids)
                ->whereNull('deleted_at')
                ->where('status', 'published')
                ->whereNotNull('thumbnail_url')
                ->orderByDesc('views_count')
                ->get(['id', 'music_track_id', 'thumbnail_url'])
                ->groupBy('music_track_id');

            return $tracks->map(fn ($t) => [
                'id'     => (int) $t->id,
                'title'  => (string) $t->title,
                'artist' => $t->artist_name,
                'cover'  => $t->cover_url ? Storage::url($t->cover_url) : null,
                'uses'   => (int) $t->uses,
                'videos' => collect($samples->get($t->id, []))->take(3)->map(fn ($v) => [
                    'id'        => $v->id,
                    'thumbnail' => Storage::url($v->thumbnail_url),
                ])->values(),
            ])->values();
        });

        return response()->json([
            'success' => true,
            'data'    => $rows,
        ])->header('Cache-Control', 'public, max-age=600');
    }

    /**
     * GET /explore/tags - the Tags tab.
     *
     * Ranked by usage over the last 30 days rather than all time. A lifetime
     * leaderboard is frozen - the same tags sit at the top forever and the list
     * stops being worth opening. The pivot carries no timestamp of its own, so
     * the window comes from the video's created_at.
     */
    public function tags(Request $request): JsonResponse
    {
        $limit = min(50, max(10, (int) $request->get('limit', 30)));

        $rows = Cache::remember("explore:tags:30d:{$limit}", now()->addMinutes(30), function () use ($limit) {
            // Widen if the last 30 days are empty, the same way trending does.
            // A tag list that goes blank on a quiet month reads as broken, and
            // the 30-day preference still applies whenever there is anything
            // recent to rank.
            $windows = [30, 90, null];
            $days    = null;
            foreach ($windows as $candidate) {
                $probe = DB::table('video_hashtags as hv')
                    ->join('videos as v', 'v.id', '=', 'hv.video_id')
                    ->whereNull('v.deleted_at')
                    ->where('v.status', 'published');
                if ($candidate !== null) {
                    $probe->where('v.created_at', '>=', now()->subDays($candidate));
                }
                if ($probe->exists()) {
                    $days = $candidate;
                    break;
                }
            }

            return DB::table('video_hashtags as hv')
                ->join('hashtags as h', 'h.id', '=', 'hv.hashtag_id')
                ->join('videos as v', 'v.id', '=', 'hv.video_id')
                ->whereNull('v.deleted_at')
                ->where('v.status', 'published')
                ->when($days !== null, fn ($q) => $q->where('v.created_at', '>=', now()->subDays($days)))
                ->groupBy('h.id', 'h.name')
                ->select([
                    'h.id', 'h.name',
                    DB::raw('COUNT(*) AS videos'),
                    DB::raw('COALESCE(SUM(v.views_count), 0) AS views'),
                ])
                ->orderByDesc(DB::raw('COUNT(*)'))
                ->limit($limit)
                ->get()
                ->map(fn ($r) => [
                    'id'     => (int) $r->id,
                    'name'   => (string) $r->name,
                    'videos' => (int) $r->videos,
                    'views'  => (int) $r->views,
                ])
                ->values();
        });

        return response()->json([
            'success' => true,
            'data'    => $rows,
        ])->header('Cache-Control', 'public, max-age=1800');
    }

    public function hashtags(): JsonResponse
    {
        // Top-30 hashtags change slowly - cache for an hour.
        // Blocked tags are withheld from discovery. The posts carrying them are
        // untouched and still reachable directly - this hides the tag, it does
        // not take content down.
        $hashtags = Cache::remember('explore:hashtags:top30', now()->addHour(), fn () =>
            Hashtag::visible()->orderByDesc('videos_count')->limit(30)->get()
        );

        return response()->json([
            'success' => true,
            'data'    => $hashtags->map(fn ($h) => [
                'id'           => $h->id,
                'name'         => $h->name,
                'videos_count' => $h->videos_count,
            ]),
        ])->header('Cache-Control', 'public, max-age=1800');
    }

    public function hashtagVideos(Request $request, string $name): JsonResponse
    {
        $hashtag = Hashtag::where('name', strtolower($name))->firstOrFail();

        $videos = Video::with(['user.profile', 'hashtags', 'featuredProducts'])
            ->join('video_hashtags', 'videos.id', '=', 'video_hashtags.video_id')
            ->where('video_hashtags.hashtag_id', $hashtag->id)
            ->where('videos.status', 'published')
            ->where(fn ($q) => $q->whereNull('videos.moderation_status')->orWhere('videos.moderation_status', '!=', 'rejected'))
            ->whereNull('videos.deleted_at')
            ->select('videos.*')
            ->withVisibleCommentsCount()
            ->orderByDesc('videos.views_count')
            ->paginate(20);

        Video::attachViewerFlags($videos, $request->user());

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($videos),
            'meta'    => [
                'hashtag'      => ['id' => $hashtag->id, 'name' => $hashtag->name, 'videos_count' => $hashtag->videos_count],
                'current_page' => $videos->currentPage(),
                'last_page'    => $videos->lastPage(),
                'total'        => $videos->total(),
            ],
        ]);
    }

    public function search(Request $request): JsonResponse
    {
        $request->validate([
            'q'    => ['required', 'string', 'min:1', 'max:100'],
            'type' => ['nullable', 'in:all,videos,users,hashtags'],
        ]);
        $q    = $request->input('q');
        $type = $request->input('type', 'all');

        $result = [];

        if (in_array($type, ['all', 'videos'])) {
            $videos = Video::with(['user.profile', 'featuredProducts'])
                ->withVisibleCommentsCount()
                ->where('status', 'published')
                ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
                ->whereNull('deleted_at')
                ->where('caption', 'ilike', "%{$q}%")
                ->orderByDesc('views_count')
                ->limit(10)->get();
            Video::attachViewerFlags($videos, $request->user());
            $result['videos'] = VideoResource::collection($videos);
        }

        if (in_array($type, ['all', 'users'])) {
            $users = User::with('profile')
                ->where('is_banned', false)
                ->where(fn ($q2) => $q2->where('username', 'ilike', "%{$q}%")->orWhere('name', 'ilike', "%{$q}%"))
                ->limit(10)->get();
            $result['users'] = UserResource::collection($users);
        }

        if (in_array($type, ['all', 'hashtags'])) {
            $hashtags = Hashtag::where('name', 'ilike', "%{$q}%")->orderByDesc('videos_count')->limit(10)->get();
            $result['hashtags'] = $hashtags->map(fn ($h) => ['id' => $h->id, 'name' => $h->name, 'videos_count' => $h->videos_count]);
        }

        return response()->json(['success' => true, 'data' => $result]);
    }
}
