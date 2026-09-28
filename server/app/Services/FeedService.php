<?php

namespace App\Services;

use App\Http\Controllers\Api\VideoInteractionController;
use App\Models\User;
use App\Models\UserVideoPreference;
use App\Models\Video;
use App\Models\VideoScore;
use Illuminate\Pagination\LengthAwarePaginator;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class FeedService
{
    /**
     * For You feed - weighted recommendation:
     *
     *   score = freshness(0.20) + engagement(0.25) + userInterest(0.25)
     *         + creatorAffinity(0.10) + trendingHashtag(0.10) + completionRate(0.10)
     *
     * Guests get the same scoring minus user-specific signals (interest / affinity
     * default to 0) plus a small random jitter so two unauth visitors don't see
     * the same order.
     */
    public function forYou(?User $user, int $perPage = 15, array $excludeIds = []): LengthAwarePaginator
    {
        // 1. Pull a candidate pool - roughly 8× the requested page so we have
        //    headroom for the diversity filter without paginating the DB twice.
        $pool = max(80, $perPage * 8);

        $query = Video::with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at');

        if ($excludeIds) {
            $query->whereNotIn('id', $excludeIds);
        }

        // Block-list (both directions)
        if ($user) {
            $blockedIds   = $user->blockedUsers()->pluck('blocked_users.blocked_id');
            $blockedByIds = DB::table('blocked_users')
                ->where('blocked_id', $user->id)
                ->pluck('blocker_id');
            $excludeUserIds = $blockedIds->merge($blockedByIds)->unique();
            if ($excludeUserIds->isNotEmpty()) {
                $query->whereNotIn('user_id', $excludeUserIds);
            }
        }

        // Pre-order by raw engagement+recency so the candidate window is full of
        // viable videos, not the tail of the table.
        $candidates = $query
            ->orderByRaw('(likes_count*2 + comments_count*3 + saves_count*4 + GREATEST(0, 168 - EXTRACT(EPOCH FROM (NOW() - created_at))/3600) * 4) DESC')
            ->limit($pool)
            ->get();

        // Drop anything the user marked "not interested" (per-video, 30-day TTL)
        // or whose creator they asked not to be recommended (per-creator, 90-day
        // TTL). One Cache::many round-trip for the whole candidate window.
        if ($user && $candidates->isNotEmpty()) {
            $keys = [];
            foreach ($candidates as $v) {
                $keys[] = VideoInteractionController::notInterestedKey($user->id, $v->id);
                $keys[] = VideoInteractionController::dontRecommendCreatorKey($user->id, $v->user_id);
            }
            $flags = Cache::many(array_values(array_unique($keys)));
            $candidates = $candidates->reject(function (Video $v) use ($user, $flags) {
                return ($flags[VideoInteractionController::notInterestedKey($user->id, $v->id)] ?? false)
                    || ($flags[VideoInteractionController::dontRecommendCreatorKey($user->id, $v->user_id)] ?? false);
            })->values();
        }

        if ($candidates->isEmpty()) {
            return new LengthAwarePaginator([], 0, $perPage, 1);
        }

        // 2. Compute signals
        $trendingTags    = $this->trendingHashtagSet(7);
        $userInterestTags = $user ? $this->userInterestHashtagSet($user) : collect();
        $followedIds     = $user ? $user->following()->pluck('users.id')->flip() : collect();
        $completionByVideo = $this->completionRates($candidates->pluck('id'));

        $now = now();

        // 3. Score each candidate - TikTok-style weighted signals (weights sum to 1.0)
        $scored = $candidates->map(function (Video $v) use (
            $trendingTags, $userInterestTags, $followedIds, $completionByVideo, $now, $user
        ) {
            $hours = max(1, $now->diffInHours($v->created_at, true));

            // Completion rate from watch-history (highest weight - best signal)
            $completion = $completionByVideo[$v->id] ?? 0.0;

            // "Viral velocity" proxy: views per hour capped at 100/h → 1.0
            // Approximates rewatch/share behaviour without per-user skip tracking
            $viewsPerHour = min(1.0, ($v->views_count / $hours) / 100.0);

            // Interaction rates normalised by views - rewards quality over raw volume
            $views       = max(1, $v->views_count);
            $likeRate    = min(1.0, ($v->likes_count    / $views) * 10.0);  // 10 % like rate → 1.0
            $commentRate = min(1.0, ($v->comments_count / $views) * 20.0);  // 5 % → 1.0
            $saveRate    = min(1.0, ($v->saves_count    / $views) * 20.0);
            $shareRate   = min(1.0, ($v->shares_count   / $views) * 20.0);

            // Freshness: 1.0 within first hour, decays to ~0.1 by 7 days
            $freshness = 1.0 / (1.0 + log10($hours / 24.0 + 1.0) * 4.0);

            // Personalisation signals
            $vTags = $v->hashtags->pluck('name');

            $userInterest = 0.0;
            if ($userInterestTags->isNotEmpty() && $vTags->isNotEmpty()) {
                $matches = $vTags->intersect($userInterestTags->keys())->count();
                $userInterest = min(1.0, $matches / max(1, $vTags->count()));
            }

            $creatorAffinity = $followedIds->has($v->user_id) ? 1.0 : 0.0;

            $trendingScore = 0.0;
            if ($trendingTags->isNotEmpty() && $vTags->isNotEmpty()) {
                $matches = $vTags->intersect($trendingTags->keys())->count();
                $trendingScore = min(1.0, $matches / max(1, $vTags->count()));
            }

            // Final weighted score (sum of weights = 1.00)
            $score = $completion      * 0.28   // watch-time quality
                   + $viewsPerHour    * 0.16   // viral/rewatch velocity
                   + $shareRate       * 0.12   // social spread
                   + $commentRate     * 0.10   // conversation
                   + $saveRate        * 0.08   // bookmark intent
                   + $likeRate        * 0.07   // approval signal
                   + $freshness       * 0.08   // recency boost
                   + $userInterest    * 0.05   // topic affinity
                   + $creatorAffinity * 0.04   // follow boost
                   + $trendingScore   * 0.02;  // hashtag trending

            // Tiny random jitter for guests so two visitors don't see identical order
            if (!$user) {
                $score += mt_rand(0, 100) / 10000.0;
            }

            $v->setAttribute('score', round($score, 6));
            return $v;
        });

        // 4. Sort + apply diversity penalty (max 2 per creator per page)
        $ranked = $scored->sortByDesc('score')->values();
        $diversified = $this->diversifyByCreator($ranked, 2);

        // 5. Paginate the in-memory ranked list
        $page  = max(1, (int) request()->get('page', 1));
        $slice = $diversified->forPage($page, $perPage)->values();

        // 6. Annotate is_liked / is_saved / is_following_creator (all batched - zero N+1)
        if ($user && $slice->isNotEmpty()) {
            $ids   = $slice->pluck('id');
            $liked = DB::table('video_likes')
                ->where('user_id', $user->id)->whereIn('video_id', $ids)
                ->pluck('video_id')->flip();
            $saved = DB::table('video_saves')
                ->where('user_id', $user->id)->whereIn('video_id', $ids)
                ->pluck('video_id')->flip();
            // $followedIds was already fetched for scoring - reuse, no extra query
            $slice->each(function (Video $v) use ($liked, $saved, $followedIds) {
                $v->is_liked = $liked->has($v->id);
                $v->is_saved = $saved->has($v->id);
                $v->is_following_creator = $followedIds->has($v->user_id);
            });
        }
        // Story ring on the creator's avatar - a separate batched query
        // (does not reuse $followedIds: a followers-only story needs an
        // ACCEPTED follow specifically). See Video::attachStoryFlags().
        Video::attachStoryFlags($slice, $user);

        return new LengthAwarePaginator(
            $slice,
            $diversified->count(),
            $perPage,
            $page,
            ['path' => request()->url(), 'query' => request()->query()],
        );
    }

    /**
     * Following Feed - videos from followed users, most recent first.
     */
    public function following(User $user, int $perPage = 15): LengthAwarePaginator
    {
        $followingIds = $user->following()->pluck('users.id');

        $paginator = Video::with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->whereIn('user_id', $followingIds)
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->orderByDesc('created_at')
            ->paginate($perPage);

        if ($followingIds->isNotEmpty()) {
            $ids             = $paginator->pluck('id');
            $followingFlipped = $followingIds->flip();
            $liked = DB::table('video_likes')
                ->where('user_id', $user->id)->whereIn('video_id', $ids)
                ->pluck('video_id')->flip();
            $saved = DB::table('video_saves')
                ->where('user_id', $user->id)->whereIn('video_id', $ids)
                ->pluck('video_id')->flip();

            $paginator->each(function (Video $v) use ($liked, $saved, $followingFlipped) {
                $v->is_liked = $liked->has($v->id);
                $v->is_saved = $saved->has($v->id);
                $v->is_following_creator = $followingFlipped->has($v->user_id);
            });
        }

        return $paginator;
    }

    /**
     * Trending - highest views + engagement in the last 7 days.
     *
     * $category, when given, restricts results to videos.category (case-
     * insensitive). Passing null preserves the original unfiltered behaviour.
     */
    /**
     * Trending, over the narrowest window that actually has videos in it.
     *
     * This used to be a hard 7-day cutoff, which is right for a busy platform
     * and wrong for every other day: with nothing posted in a week, Explore's
     * whole grid came back empty and the page read as broken rather than quiet.
     * The same happens to any category that is simply not posted in often.
     *
     * Widening in steps keeps the original meaning - recent content wins
     * whenever recent content exists - while guaranteeing the page has
     * something on it. The count probes are cheap next to the hydrated query,
     * and only run until one of them finds rows.
     */
    private const TRENDING_WINDOWS = [7, 30, 90, null]; // null = no time limit

    public function trending(int $perPage = 20, ?string $category = null): LengthAwarePaginator
    {
        $base = fn () => Video::query()
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->when($category, fn ($q) => $q->whereRaw('LOWER(category) = ?', [strtolower($category)]));

        $days = null;
        foreach (self::TRENDING_WINDOWS as $candidate) {
            $probe = $base();
            if ($candidate !== null) {
                $probe->where('created_at', '>=', now()->subDays($candidate));
            }
            if ($probe->exists()) {
                $days = $candidate;
                break;
            }
        }

        return $base()
            ->with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->when($days !== null, fn ($q) => $q->where('created_at', '>=', now()->subDays($days)))
            ->orderByDesc('views_count')
            ->orderByDesc('likes_count')
            ->paginate($perPage);
    }

    /**
     * The feed's country tab - what people in one country are posting.
     *
     * Same eligibility as trending (published, not rejected, not deleted) with
     * the country pinned and a wider window, ordered newest-first with
     * engagement breaking ties: a country feed is about what is happening
     * there now, not an all-time chart.
     */
    public function country(string $countryCode, int $perPage = 8): LengthAwarePaginator
    {
        return Video::with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->where('country_code', $countryCode)
            ->where('created_at', '>=', now()->subDays(30))
            ->orderByDesc('created_at')
            ->orderByDesc('views_count')
            ->paginate($perPage);
    }

    /* ── Signal helpers ──────────────────────────────────────────────────── */

    /**
     * Hashtags used most in the last N days, keyed by name → score (0..1).
     */
    private function trendingHashtagSet(int $days = 7): Collection
    {
        $rows = DB::table('hashtags')
            ->join('video_hashtags', 'hashtags.id', '=', 'video_hashtags.hashtag_id')
            ->join('videos', 'videos.id', '=', 'video_hashtags.video_id')
            ->where('videos.status', 'published')
            ->whereNull('videos.deleted_at')
            ->where('videos.created_at', '>=', now()->subDays($days))
            ->select('hashtags.name', DB::raw('COUNT(*) AS c'))
            ->groupBy('hashtags.name')
            ->orderByDesc('c')
            ->limit(50)
            ->get();

        if ($rows->isEmpty()) return collect();
        $max = max(1, $rows->first()->c);
        return $rows->mapWithKeys(fn ($r) => [$r->name => min(1.0, $r->c / $max)]);
    }

    /**
     * Hashtags from videos this user has liked/saved/viewed recently.
     */
    private function userInterestHashtagSet(User $user): Collection
    {
        $rows = DB::table('video_hashtags')
            ->join('hashtags', 'hashtags.id', '=', 'video_hashtags.hashtag_id')
            ->where(function ($q) use ($user) {
                $q->whereIn('video_hashtags.video_id', function ($sub) use ($user) {
                    $sub->select('video_id')->from('video_likes')
                        ->where('user_id', $user->id)
                        ->where('created_at', '>=', now()->subDays(30));
                })->orWhereIn('video_hashtags.video_id', function ($sub) use ($user) {
                    $sub->select('video_id')->from('video_saves')
                        ->where('user_id', $user->id)
                        ->where('created_at', '>=', now()->subDays(30));
                });
            })
            ->select('hashtags.name', DB::raw('COUNT(*) AS c'))
            ->groupBy('hashtags.name')
            ->orderByDesc('c')
            ->limit(30)
            ->get();

        if ($rows->isEmpty()) return collect();
        $max = max(1, $rows->first()->c);
        return $rows->mapWithKeys(fn ($r) => [$r->name => min(1.0, $r->c / $max)]);
    }

    /**
     * Mean (watch_duration / video.duration) per video over the last 14 days,
     * clamped to [0, 1]. Videos with no views map to 0.
     */
    private function completionRates(Collection $videoIds): array
    {
        if ($videoIds->isEmpty()) return [];

        $rows = DB::table('video_views as vv')
            ->join('videos as v', 'v.id', '=', 'vv.video_id')
            ->whereIn('vv.video_id', $videoIds)
            ->whereNotNull('vv.watch_duration')
            ->whereNotNull('v.duration')
            ->where('v.duration', '>', 0)
            ->where('vv.created_at', '>=', now()->subDays(14))
            ->select('vv.video_id', DB::raw('AVG(LEAST(1.0, vv.watch_duration::float / NULLIF(v.duration, 0))) AS rate'))
            ->groupBy('vv.video_id')
            ->get();

        $map = [];
        foreach ($rows as $r) {
            $map[$r->video_id] = (float) $r->rate;
        }
        return $map;
    }

    /**
     * Bust all feed-related cache keys so a just-deleted (or restored) video
     * disappears from / reappears in feeds immediately rather than waiting up
     * to 15 minutes for the cache TTL to expire.
     *
     * Call this after any video soft-delete, force-delete, or restore.
     */
    public static function flushFeedCache(): void
    {
        Cache::forget('feed:trending:v2');

        // Bump the feed "generation" token. Every per-user / guest feed page key
        // embeds the current generation (…:g{N}:…), so incrementing it orphans all
        // cached pages at once - instantly and on ANY cache driver (file, redis, …),
        // with no key enumeration required. This is the primary invalidation path;
        // prod runs the `file` cache store where the Redis scan below is a no-op.
        try {
            $gen = (int) Cache::get('feed:gen', 1);
            Cache::forever('feed:gen', $gen + 1);
        } catch (\Throwable) {
            // non-fatal
        }

        try {
            $redis  = Cache::getStore()->connection(); // RedisStore → Redis connection
            $prefix = Cache::getStore()->getPrefix();
            $cursor = '0';
            do {
                [$cursor, $keys] = $redis->scan($cursor, 'MATCH', "{$prefix}feed:foryou:*", 'COUNT', 200);
                if (!empty($keys)) {
                    $redis->del(...$keys);
                }
            } while ($cursor !== '0');
        } catch (\Throwable) {
            // Cache driver is not Redis or scan failed - non-fatal
        }
    }

    /**
     * Cap the number of videos per creator on a single ranked page.
     */
    private function diversifyByCreator(Collection $ranked, int $maxPerCreator = 2): Collection
    {
        $perCreator = [];
        $kept = collect();
        $overflow = collect();

        foreach ($ranked as $v) {
            $count = $perCreator[$v->user_id] ?? 0;
            if ($count < $maxPerCreator) {
                $perCreator[$v->user_id] = $count + 1;
                $kept->push($v);
            } else {
                $overflow->push($v);
            }
        }

        return $kept->concat($overflow);
    }

    /* ══════════════════════════════════════════════════════════════════════════
       FOR YOU V2 - personalized feed backed by video_scores + Redis cache
       Mixing strategy (per page of 15):
         ~45%  personalized    (video_scores ordered by recommendation score)
         ~20%  trending        (high score + recent, cached)
         ~15%  fresh uploads   (last 24 h, no score yet)
         ~10%  followed        (followed creators, most recent)
         ~10%  country/lang    (same detected country or language)
    ══════════════════════════════════════════════════════════════════════════ */
    public function forYouV2(?User $user, int $perPage = 15, array $excludeIds = []): LengthAwarePaginator
    {
        $page = max(1, (int) request()->get('page', 1));

        // ── 1. Try user-specific cache (5 min TTL) ──────────────────────────
        // The cache key embeds the current feed "generation" token. Any content
        // change (delete / privacy / publish) bumps that token via
        // flushFeedCache(), instantly orphaning every previously-cached page on
        // ANY cache driver - the file store on prod cannot scan-delete keys.
        $gen = (int) Cache::get('feed:gen', 1);
        $cacheKey = $user
            ? "feed:foryou:u{$user->id}:p{$page}:g{$gen}:ex" . md5(implode(',', $excludeIds))
            : "feed:foryou:guest:p{$page}:g{$gen}";

        $cached = Cache::get($cacheKey);
        if ($cached) {
            // Re-annotate user-specific flags fresh on every request so that likes/saves
            // toggled since the cache was written are reflected immediately on refresh.
            // The cache holds the ranked order and public counts; user state is cheap
            // to rehydrate (3 indexed queries against video_likes, video_saves, follows).
            $items = $cached->getCollection();
            if ($items->isNotEmpty()) {
                $ids = $items->pluck('id');

                // Pull live visibility + counts in ONE query. A video deleted / set
                // to private / draft / rejected since this page was cached must vanish
                // immediately - drop anything no longer publicly visible before serving.
                $live = DB::table('videos')->whereIn('id', $ids)
                    ->get(['id', 'status', 'deleted_at', 'moderation_status', 'likes_count'])
                    ->keyBy('id');

                $items = $items->filter(function (Video $v) use ($live) {
                    $row = $live->get($v->id);
                    return $row
                        && $row->deleted_at === null
                        && $row->status === 'published'
                        && ($row->moderation_status === null || $row->moderation_status !== 'rejected');
                })->values();
                $cached->setCollection($items);

                if ($items->isNotEmpty()) {
                    if ($user) {
                        $liked    = DB::table('video_likes')->where('user_id', $user->id)->whereIn('video_id', $ids)->pluck('video_id')->flip();
                        $saved    = DB::table('video_saves')->where('user_id', $user->id)->whereIn('video_id', $ids)->pluck('video_id')->flip();
                        $followed = $user->following()->pluck('users.id')->flip();
                        $items->each(function (Video $v) use ($liked, $saved, $followed, $live) {
                            $v->is_liked             = $liked->has($v->id);
                            $v->is_saved             = $saved->has($v->id);
                            $v->is_following_creator = $followed->has($v->user_id);
                            $v->likes_count          = $live->get($v->id)->likes_count ?? $v->likes_count;
                        });
                    } else {
                        $items->each(function (Video $v) use ($live) {
                            $v->likes_count = $live->get($v->id)->likes_count ?? $v->likes_count;
                        });
                    }
                    // Same reasoning as is_liked/is_saved above: the story
                    // ring is viewer state, refreshed fresh on every request
                    // rather than trusted from the cached page.
                    Video::attachStoryFlags($items, $user);
                }
            }
            return $cached;
        }

        // ── 2. Build block-list ─────────────────────────────────────────────
        // Muted creators are folded into the same exclusion set as blocked
        // ones (downstream just does one whereNotIn against $blockedUserIds)
        // - one-directional only, unlike block: muting someone never hides
        // YOUR content from THEM, which is the whole point of mute vs block.
        $blockedUserIds = collect();
        if ($user) {
            $blocked   = $user->blockedUsers()->pluck('blocked_users.blocked_id');
            $blockedBy = DB::table('blocked_users')->where('blocked_id', $user->id)->pluck('blocker_id');
            $muted     = $user->mutedUsers()->pluck('muted_users.muted_id');
            $blockedUserIds = $blocked->merge($blockedBy)->merge($muted)->unique();
        }

        // ── 3. "Not interested" set ─────────────────────────────────────────
        $notInterestedIds = collect();
        if ($user) {
            $notInterestedIds = collect(Cache::get("ni:u{$user->id}", []));
        }

        $globalExclude = collect($excludeIds)
            ->merge($notInterestedIds)
            ->unique()
            ->values()
            ->all();

        // ── 4. User preferences ──────────────────────────────────────────────
        $prefHashtags  = collect();
        $prefCreators  = collect();
        $prefCategories = collect();
        $followedIds   = collect();

        if ($user) {
            $prefs = UserVideoPreference::where('user_id', $user->id)
                ->where('weight', '>', 0)
                ->orderByDesc('weight')
                ->limit(50)
                ->get();

            $prefHashtags   = $prefs->where('pref_type', 'hashtag')->pluck('weight', 'pref_value');
            $prefCreators   = $prefs->where('pref_type', 'creator')->pluck('weight', 'pref_value');
            $prefCategories = $prefs->where('pref_type', 'category')->pluck('weight', 'pref_value');
            $followedIds    = $user->following()->pluck('users.id');
        }

        // ── 5. Build base query ──────────────────────────────────────────────
        $base = fn () => Video::with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->when($blockedUserIds->isNotEmpty(), fn ($q) => $q->whereNotIn('user_id', $blockedUserIds))
            ->when($globalExclude, fn ($q) => $q->whereNotIn('id', $globalExclude));

        // Determine how many per bucket we need
        $need = $perPage * 3; // oversample for diversity

        // ── BUCKET A: Personalized (video_scores ranked, ~45%) ───────────────
        // Wrap in try-catch: if video_scores table hasn't been migrated yet
        // the query throws a QueryException and we fall back to forYou().
        try {
            $personalizedIds = VideoScore::orderByDesc('score')
                ->where('score', '>', 0)
                ->limit($need * 2)
                ->pluck('video_id');
        } catch (\Throwable $e) {
            $result = $this->forYou($user, $perPage, $excludeIds);
            Cache::put($cacheKey, $result, now()->addMinutes(15));
            return $result;
        }

        $bucketA = collect();
        if ($personalizedIds->isNotEmpty()) {
            $bucketA = $base()->whereIn('id', $personalizedIds)->limit($need)->get();
            // Re-sort by video_scores.score
            $scoreMap = VideoScore::whereIn('video_id', $bucketA->pluck('id'))->pluck('score', 'video_id');
            $bucketA  = $bucketA->sortByDesc(fn ($v) => $scoreMap[$v->id] ?? 0)->values();
        }

        // ── BUCKET B: Trending (Redis cached 15 min) ─────────────────────────
        $bucketB = Cache::remember('feed:trending:v2', now()->addMinutes(15), function () use ($base, $need) {
            try {
                return $base()
                    ->join('video_scores as vs', 'vs.video_id', '=', 'videos.id')
                    ->select('videos.*', 'vs.score as vs_score')
                    ->where('vs.score', '>', 0)
                    ->where('videos.created_at', '>=', now()->subDays(7))
                    ->orderByDesc('vs.score')
                    ->limit($need)
                    ->get();
            } catch (\Throwable) {
                return collect();
            }
        });

        // ── BUCKET C: Fresh uploads (last 24 h) ──────────────────────────────
        $bucketC = $base()
            ->where('created_at', '>=', now()->subHours(24))
            ->orderByDesc('created_at')
            ->limit((int) ceil($need * 0.3))
            ->get();

        // ── BUCKET D: Followed creators ──────────────────────────────────────
        $bucketD = collect();
        if ($user && $followedIds->isNotEmpty()) {
            $bucketD = $base()
                ->whereIn('user_id', $followedIds)
                ->orderByDesc('created_at')
                ->limit((int) ceil($need * 0.2))
                ->get();
        }

        // ── BUCKET E: Same country / language ────────────────────────────────
        $bucketE = collect();
        $userCountry  = $user?->selected_country_code ?? $user?->detected_country_code;
        $userLanguage = $user?->language;
        if ($userCountry || $userLanguage) {
            $bucketE = $base()
                ->when($userCountry,  fn ($q) => $q->orWhere('location', $userCountry))
                ->when($userLanguage, fn ($q) => $q->orWhere('language', $userLanguage))
                ->orderByDesc('created_at')
                ->limit((int) ceil($need * 0.2))
                ->get();
        }

        // ── 6. Mix buckets with weights ──────────────────────────────────────
        $aCount = (int) ceil($perPage * 0.45);
        $bCount = (int) ceil($perPage * 0.20);
        $cCount = (int) ceil($perPage * 0.15);
        $dCount = (int) ceil($perPage * 0.10);
        $eCount = $perPage - $aCount - $bCount - $cCount - $dCount;

        $mixed = collect()
            ->concat($bucketA->take($aCount))
            ->concat($bucketB->take($bCount))
            ->concat($bucketC->take($cCount))
            ->concat($bucketD->take($dCount))
            ->concat($bucketE->take(max(0, $eCount)));

        // ── 7. If video_scores table is empty or mix is thin, fall back to / supplement with forYou() ─────────
        // For guests especially: if we got fewer scored videos than requested, pad with
        // chronologically-ranked published videos so the feed never shows empty.
        if ($mixed->filter()->isEmpty()) {
            $result = $this->forYou($user, $perPage, $excludeIds);
            Cache::put($cacheKey, $result, now()->addMinutes(15));
            return $result;
        }

        // Supplement: if the scored mix has fewer than $perPage items, top up with forYou() results
        if ($mixed->count() < $perPage) {
            try {
                $supplement = $this->forYou($user, $perPage, $excludeIds);
                $supplementItems = $supplement->getCollection();
                $existingIds = $mixed->pluck('id')->flip();
                $fresh = $supplementItems->filter(fn ($v) => ! $existingIds->has($v->id));
                $mixed = $mixed->concat($fresh)->take($perPage);
            } catch (\Throwable) {
                // supplement failed - continue with whatever we have
            }
        }

        // ── 8. Personalise scores for logged-in user ─────────────────────────
        $trendingTags = $this->trendingHashtagSet(7);

        $scored = $mixed->map(function (Video $v) use ($prefHashtags, $prefCategories, $prefCreators, $trendingTags, $user) {
            $baseScore = 0.0;

            // Boost from user preferences
            foreach ($v->hashtags->pluck('name') as $tag) {
                $baseScore += ($prefHashtags[$tag] ?? 0) * 0.03;
                $baseScore += ($trendingTags[$tag]  ?? 0) * 0.01;
            }
            if ($v->category && $prefCategories->has($v->category)) {
                $baseScore += $prefCategories[$v->category] * 0.02;
            }
            if ($prefCreators->has((string) $v->user_id)) {
                $baseScore += $prefCreators[(string) $v->user_id] * 0.04;
            }

            // Guest jitter
            if (! $user) {
                $baseScore += mt_rand(0, 100) / 10000.0;
            }

            $v->setAttribute('score', round($baseScore, 6));
            return $v;
        });

        // ── 9. Deduplicate by id, diversify by creator ────────────────────────
        $unique      = $scored->unique('id')->values();
        $diversified = $this->diversifyByCreator($unique->sortByDesc('score')->values(), 2);
        $slice       = $diversified->forPage($page, $perPage)->values();

        // ── 10. Annotate is_liked / is_saved / is_following ──────────────────
        if ($user && $slice->isNotEmpty()) {
            $ids      = $slice->pluck('id');
            $liked    = DB::table('video_likes')->where('user_id', $user->id)->whereIn('video_id', $ids)->pluck('video_id')->flip();
            $saved    = DB::table('video_saves')->where('user_id', $user->id)->whereIn('video_id', $ids)->pluck('video_id')->flip();
            $followFlip = $followedIds->flip();
            $slice->each(function (Video $v) use ($liked, $saved, $followFlip) {
                $v->is_liked             = $liked->has($v->id);
                $v->is_saved             = $saved->has($v->id);
                $v->is_following_creator = $followFlip->has($v->user_id);
            });
        }
        // Story ring on the creator's avatar - see Video::attachStoryFlags().
        // Batched (and cached below) alongside the flags above, same 15-min
        // staleness window they already accept.
        Video::attachStoryFlags($slice, $user);

        $paginator = new LengthAwarePaginator(
            $slice,
            $diversified->count(),
            $perPage,
            $page,
            ['path' => request()->url(), 'query' => request()->query()],
        );

        // ── 11. Cache result (15 min) ─────────────────────────────────────────
        Cache::put($cacheKey, $paginator, now()->addMinutes(15));

        return $paginator;
    }

    /* ═══════════════════ FOR YOU V3 - precomputed Redis pools ═══════════════════ */

    /**
     * Pool-based For You: blends the sorted sets built by `feed:build-pools`
     * (60% country / 15% language / 15% global / 10% fresh) with a per-user
     * Redis seen-set (30-day TTL, added on serve) so nothing repeats.
     *
     * ZERO scoring at request time - the hot path is a handful of Redis reads
     * plus ONE hydration SELECT (payloads + user-state annotation can't come
     * from Redis without duplicating the catalog). Falls back country →
     * language → global when pools are thin; returns null when the pools
     * aren't built (caller then uses forYouV2).
     */
    public function forYouPools(?User $user, int $perPage = 8, array $excludeIds = []): ?LengthAwarePaginator
    {
        try {
            $redis = Redis::connection('default');
            if (! $redis->exists('feed:pools:built_at')) {
                return null; // pools not built yet (first boot / cron stopped)
            }
        } catch (\Throwable) {
            return null; // Redis unavailable - V2 still serves from its own cache
        }

        $page = max(1, (int) request()->get('page', 1));

        // ── Identity: country, language, seen-set owner ──────────────────
        $cc = strtoupper((string) ($user?->selected_country_code ?: $user?->detected_country_code ?: ''));
        if (! preg_match('/^[A-Z]{2}$/', $cc)) {
            $header = strtoupper((string) request()->headers->get('cf-ipcountry'));
            $cc = preg_match('/^[A-Z]{2}$/', $header) ? $header : '';
        }
        $lang = strtolower((string) ($user?->language ?: 'en'));

        $device    = (string) request()->headers->get('X-Device-Fingerprint');
        $seenOwner = $user ? "u{$user->id}" : ($device !== '' ? 'd' . substr(sha1($device), 0, 16) : null);
        $seenKey   = $seenOwner ? "seen:{$seenOwner}" : null;

        // ── Blend quotas (60 / 15 / 15 / 10, remainder → fresh) ──────────
        $countryN = (int) round($perPage * 0.60);
        $langN    = max(1, (int) floor($perPage * 0.15));
        $globalN  = max(1, (int) floor($perPage * 0.15));
        $freshN   = max(0, $perPage - $countryN - $langN - $globalN);

        // Over-fetch 3× per pool so seen/excluded candidates don't starve a page.
        $fetch = fn (string $key, int $n) => $n > 0
            ? array_map('intval', $redis->zrevrange($key, 0, $n * 3 - 1) ?: [])
            : [];

        $pools = [
            'country' => $cc !== '' ? $fetch("trending:country:{$cc}", $countryN) : [],
            'lang'    => $fetch("trending:lang:{$lang}", $langN + $countryN), // oversized: absorbs country shortfall
            'fresh'   => $cc !== '' ? $fetch("fresh:country:{$cc}", $freshN) : [],
            'global'  => $fetch('trending:global', $perPage),                 // universal fallback
        ];

        // ── Filters: seen-set (one round-trip), client excludes, not-interested ──
        $exclude = collect($excludeIds)
            ->merge($user ? collect(Cache::get("ni:u{$user->id}", [])) : collect())
            ->flip();

        $allIds = array_values(array_unique(array_merge(...array_values($pools))));
        $seen = [];
        if ($seenKey && $allIds) {
            try {
                $flags = $redis->smismember($seenKey, ...$allIds);
                $seen  = array_combine($allIds, is_array($flags) ? $flags : array_fill(0, count($allIds), 0));
            } catch (\Throwable) {
                $seen = []; // treat as unseen; exclude_ids still dedupes within session
            }
        }

        $used = [];
        $pick = function (array $ids, int $n) use (&$used, $exclude, $seen): array {
            $out = [];
            foreach ($ids as $id) {
                if (count($out) >= $n) break;
                if (isset($used[$id]) || $exclude->has($id) || ! empty($seen[$id])) continue;
                $used[$id] = true;
                $out[] = $id;
            }
            return $out;
        };

        $picked = $pick($pools['country'], $countryN);
        $picked = array_merge($picked, $pick($pools['lang'], $langN + ($countryN - count($picked))));
        $picked = array_merge($picked, $pick($pools['fresh'], $freshN));
        $picked = array_merge($picked, $pick($pools['global'], $perPage - count($picked)));

        // Everything seen? Re-serve trending rather than dead-ending the feed.
        if (! $picked) {
            foreach ($pools['global'] as $id) {
                if (! $exclude->has($id)) $picked[] = $id;
                if (count($picked) >= $perPage) break;
            }
        }
        if (! $picked) {
            return null; // pools genuinely empty → V2 fallback
        }

        // ── Hydration: the ONE database query on this path ────────────────
        $videos = Video::with(['user.profile', 'hashtags', 'audioTrack', 'musicTrack', 'taggedUsers', 'collabUsers', 'featuredProducts'])
            ->withVisibleCommentsCount()
            ->where('status', 'published')
            ->where(fn ($q) => $q->whereNull('moderation_status')->orWhere('moderation_status', '!=', 'rejected'))
            ->whereNull('deleted_at')
            ->whereIn('id', $picked)
            ->get()
            ->keyBy('id');

        $blockedIds = collect();
        if ($user) {
            $blocked    = $user->blockedUsers()->pluck('blocked_users.blocked_id');
            $blockedBy  = DB::table('blocked_users')->where('blocked_id', $user->id)->pluck('blocker_id');
            // One-directional, same reasoning as forYouV2's block-list above.
            $muted      = $user->mutedUsers()->pluck('muted_users.muted_id');
            $blockedIds = $blocked->merge($blockedBy)->merge($muted)->flip();
        }

        $slice = collect($picked)
            ->map(fn (int $id) => $videos->get($id))
            ->filter(fn (?Video $v) => $v && ! $blockedIds->has($v->user_id))
            ->values();

        // Picked ids that no longer hydrate - the pools outlived the rows they
        // point at (unpublished / deleted / rejected since the last build), or
        // everything left in them is from a blocked creator.
        //
        // This MUST be null, not an empty paginator: the caller falls back to
        // forYouV2 on null only, so returning an empty page here dead-ends the
        // whole feed at zero videos until the pools happen to rebuild - even
        // though the database is full of eligible ones. Same contract as the
        // "pools genuinely empty" branch above.
        if ($slice->isEmpty()) {
            return null;
        }

        // ── Annotate user state (same pattern as V2) ──────────────────────
        if ($user && $slice->isNotEmpty()) {
            $ids      = $slice->pluck('id');
            $liked    = DB::table('video_likes')->where('user_id', $user->id)->whereIn('video_id', $ids)->pluck('video_id')->flip();
            $saved    = DB::table('video_saves')->where('user_id', $user->id)->whereIn('video_id', $ids)->pluck('video_id')->flip();
            $followed = $user->following()->pluck('users.id')->flip();
            $slice->each(function (Video $v) use ($liked, $saved, $followed) {
                $v->is_liked             = $liked->has($v->id);
                $v->is_saved             = $saved->has($v->id);
                $v->is_following_creator = $followed->has($v->user_id);
            });
        }
        // Story ring on the creator's avatar - see Video::attachStoryFlags().
        Video::attachStoryFlags($slice, $user);

        // ── Mark served videos seen (30-day TTL, refreshed on every serve) ──
        if ($seenKey && $slice->isNotEmpty()) {
            try {
                $redis->sadd($seenKey, ...$slice->pluck('id')->all());
                $redis->expire($seenKey, 30 * 86400);
            } catch (\Throwable) {
                // best-effort - exclude_ids still covers the current session
            }
        }

        // Seen-set pagination is stateful: every call serves the next unseen
        // slice, so page numbers are cosmetic. Report has-more while pages fill.
        $hasMore = $slice->count() >= $perPage;
        $total   = ($page - 1) * $perPage + $slice->count() + ($hasMore ? $perPage : 0);

        return new LengthAwarePaginator(
            $slice,
            $total,
            $perPage,
            $page,
            ['path' => request()->url(), 'query' => request()->query()],
        );
    }
}
