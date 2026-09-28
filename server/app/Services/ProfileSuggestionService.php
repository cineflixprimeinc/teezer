<?php

namespace App\Services;

use App\Models\AppSetting;
use App\Models\ProfileSuggestionDismissal;
use App\Models\ProfileSuggestionLog;
use App\Models\User;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class ProfileSuggestionService
{
    // ── Scoring weights (overridable via app_settings) ────────────────────
    private float $wMutual;
    private float $wLocation;
    private float $wInterest;
    private float $wWatch;
    private float $wLiked;
    private float $wCreatorSim;
    private float $wQuality;
    private float $wActivity;
    private float $wNewBoost;
    private float $wVerified;
    private int   $cacheTtl;
    private float $minTrust;
    private bool  $enabledFlag;
    private bool  $locationEnabled;
    private bool  $interestEnabled;
    private bool  $watchEnabled;

    // ── Diversity limits ──────────────────────────────────────────────────
    private const MAX_PER_CITY     = 3;
    private const MAX_PER_CATEGORY = 4;
    private const CANDIDATE_LIMIT  = 250;

    public function __construct()
    {
        $this->loadSettings();
    }

    private function loadSettings(): void
    {
        $get = fn(string $k, mixed $d) => AppSetting::where('key', $k)->value('value') ?? $d;

        // Weights sum to 1.00:
        // mutual(0.25) + interest(0.14+0.07+0.04=0.25) + engagement(0.20) + location(0.10) + quality(0.12+0.03=0.15) + freshness(0.03+0.02=0.05)
        $this->enabledFlag     = (bool) $get('suggestion_enabled',          true);
        $this->wMutual         = (float) $get('suggestion_mutual_weight',   0.25);  // mutual_follow_score
        $this->wLocation       = (float) $get('suggestion_location_weight', 0.10);  // location_score
        $this->wInterest       = (float) $get('suggestion_interest_weight', 0.14);  // interest_match_score (profile interests)
        $this->wWatch          = (float) $get('suggestion_watch_weight',    0.20);  // engagement_similarity_score
        $this->wLiked          = (float) $get('suggestion_like_weight',     0.07);  // interest_match_score (liked category)
        $this->wCreatorSim     = (float) $get('suggestion_creator_weight',  0.04);  // interest_match_score (creator similarity)
        $this->wQuality        = (float) $get('suggestion_quality_weight',  0.12);  // creator_quality_score
        $this->wActivity       = (float) $get('suggestion_activity_weight', 0.03);  // freshness_score (recent activity)
        $this->wNewBoost       = (float) $get('suggestion_new_boost',       0.02);  // freshness_score (new creator)
        $this->wVerified       = (float) $get('suggestion_verified_boost',  0.03);  // creator_quality_score (verified bonus)
        $this->cacheTtl        = (int)   $get('suggestion_cache_ttl',       1200); // 20 min (10-30 min range)
        $this->minTrust        = (float) $get('suggestion_min_trust_score', 0.30);
        $this->locationEnabled = (bool)  $get('suggestion_enable_location', true);
        $this->interestEnabled = (bool)  $get('suggestion_enable_interests',true);
        $this->watchEnabled    = (bool)  $get('suggestion_enable_watch',    true);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Public API
    // ─────────────────────────────────────────────────────────────────────

    public function getSuggestions(User $user, string $context = 'home', int $limit = 10, ?int $profileOwnerId = null): array
    {
        if (!$this->enabledFlag) {
            return $this->coldStartFallback($user, $limit);
        }

        // Per-profile cache key when viewing a specific creator's profile
        $cacheKey = ($context === 'creator_profile' && $profileOwnerId)
            ? "psugg:{$user->id}:creator:{$profileOwnerId}"
            : "psugg:{$user->id}:{$context}";

        return Cache::remember($cacheKey, $this->cacheTtl, function () use ($user, $context, $limit, $profileOwnerId) {
            if ($context === 'creator_profile' && $profileOwnerId) {
                return $this->buildCreatorProfileSuggestions($user, $profileOwnerId, $limit);
            }
            return $this->buildSuggestions($user, $context, $limit);
        });
    }

    /**
     * Suggestions for unauthenticated guests - filtered by detected country.
     * No user context, no dismissals, no personalization.
     */
    public function getGuestSuggestions(string $countryCode, int $limit = 6): array
    {
        $cacheKey = "psugg:guest:{$countryCode}:{$limit}";

        return Cache::remember($cacheKey, 600, function () use ($countryCode, $limit) {
            $rows = DB::table('users as u')
                ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
                ->select([
                    'u.id', 'u.name', 'u.username', 'u.avatar', 'u.bio',
                    'u.is_verified', 'u.role',
                    'u.selected_country_code', 'u.detected_country_code', 'u.country',
                    'p.total_followers', 'p.total_videos',
                ])
                ->where('u.is_banned', false)
                ->where('u.is_active', true)
                ->where(fn($q) => $q->where('u.is_private', false)->orWhereNull('u.is_private'))
                ->where(fn($q) => $q->where('u.trust_score', '>=', $this->minTrust)->orWhereNull('u.trust_score'))
                ->where('u.id', '!=', 0)
                ->orderByRaw(
                    'CASE WHEN u.selected_country_code = ? OR u.detected_country_code = ? OR u.country = ? THEN 100 ELSE 0 END DESC,
                    (COALESCE(p.total_followers,0) + COALESCE(p.total_videos,0) * 3 + CASE WHEN u.is_verified = true THEN 500 ELSE 0 END + RANDOM() * 20) DESC',
                    [$countryCode, $countryCode, $countryCode]
                )
                ->limit($limit)
                ->get();

            $guestRows = $rows->map(fn($c) => [
                'id'                     => $c->id,
                'username'               => $c->username,
                'display_name'           => $c->name,
                'avatar'                 => $c->avatar ? Storage::url($c->avatar) : StorageService::defaultAvatarUrl(),
                'bio'                    => $c->bio,
                'is_verified'            => (bool) $c->is_verified,
                'is_creator'             => $c->role === 'creator',
                'followers_count'        => (int) ($c->total_followers ?? 0),
                'mutual_followers_count' => 0,
                'mutual_followers'       => [],
                'reason'                 => 'Trending creator near you',
                'score'                  => 0.0,
                'is_following'           => false,
            ])->values()->toArray();

            // No signed-in viewer here (guest) - attachRingFlags leaves every
            // row's has_story/has_unseen false, same as Story::batchRingFlags()
            // itself returns [] with no viewer.
            return $this->attachRingFlags($guestRows, null);
        });
    }

    /** Called after follow/dismiss - clear cache so next fetch is fresh. */
    public function invalidateCache(int $userId): void
    {
        foreach (['home', 'profile', 'friends', 'following_empty', 'search', 'creator_profile'] as $ctx) {
            Cache::forget("psugg:{$userId}:{$ctx}");
        }
    }

    /** Record a dismiss and clear cache. */
    public function dismiss(User $user, int $targetUserId): void
    {
        ProfileSuggestionDismissal::updateOrInsert(
            ['user_id' => $user->id, 'suggested_user_id' => $targetUserId],
            ['dismissed_at' => now()],
        );
        $this->invalidateCache($user->id);
    }

    /** Log that suggestions were shown (called by controller). */
    public function logShown(int $userId, array $suggestions, string $context): void
    {
        $rows = array_map(fn($s) => [
            'user_id'           => $userId,
            'suggested_user_id' => $s['id'],
            'context'           => $context,
            'score'             => round($s['score'] ?? 0, 4),
            'reason'            => $s['reason'] ?? null,
            'shown_at'          => now(),
        ], $suggestions);

        if ($rows) {
            DB::table('profile_suggestion_logs')->insert($rows);
        }
    }

    /** Mark a suggestion as followed in the log. */
    public function markFollowed(int $userId, int $suggestedUserId): void
    {
        DB::table('profile_suggestion_logs')
            ->where('user_id', $userId)
            ->where('suggested_user_id', $suggestedUserId)
            ->whereNull('followed_at')
            ->orderByDesc('shown_at')
            ->limit(1)
            ->update(['followed_at' => now()]);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Core pipeline
    // ─────────────────────────────────────────────────────────────────────

    private function buildSuggestions(User $user, string $context, int $limit): array
    {
        // ── 1. Collect user context ────────────────────────────────────
        $followingIds  = $this->getFollowingIds($user);
        $blockedIds    = $this->getBlockedIds($user);
        $dismissedIds  = $this->getDismissedIds($user);
        $userCountry   = $this->resolveCountry($user);
        $userCity      = $this->resolveCity($user);
        $userInterests = $this->resolveInterests($user);

        $excludeIds = array_unique(array_merge([$user->id], $followingIds, $blockedIds, $dismissedIds, [0]));

        // ── 2. Collect candidates ──────────────────────────────────────
        $candidates = $this->collectCandidates(
            userId: $user->id,
            followingIds: $followingIds,
            excludeIds: $excludeIds,
            country: $userCountry,
            interests: $userInterests,
        );

        if ($candidates->isEmpty()) {
            return $this->coldStartFallback($user, $limit, $excludeIds);
        }

        // ── 3. Pre-fetch scoring data (bulk - no N+1) ──────────────────
        $candidateIds        = $candidates->pluck('id')->toArray();
        $mutualCounts        = $this->getMutualFollowCounts($user->id, $followingIds, $candidateIds);
        $userCategoryPrefs   = $this->getUserCategoryPrefs($user->id);
        $userLikedCategories = $this->getUserLikedCategories($user->id);
        $userFollowedCreators= $this->getUserFollowedCreatorPrefs($user->id);
        $candidateCategories = $this->getCandidatePrimaryCategories($candidateIds);

        // ── 4. Score each candidate ────────────────────────────────────
        $scored = $candidates->map(function ($c) use (
            $user, $userCountry, $userCity, $userInterests,
            $mutualCounts, $userCategoryPrefs, $userLikedCategories,
            $userFollowedCreators, $candidateCategories, $followingIds,
        ) {
            $score  = $this->scoreCandidate(
                user: $user,
                candidate: $c,
                userCountry: $userCountry,
                userCity: $userCity,
                userInterests: $userInterests,
                mutualCount: $mutualCounts[$c->id] ?? 0,
                userCategoryPrefs: $userCategoryPrefs,
                userLikedCategories: $userLikedCategories,
                userFollowedCreators: $userFollowedCreators,
                candidatePrimaryCategory: $candidateCategories[$c->id] ?? null,
            );
            $reason = $this->generateReason(
                candidate: $c,
                userCountry: $userCountry,
                mutualCount: $mutualCounts[$c->id] ?? 0,
                userCategoryPrefs: $userCategoryPrefs,
                candidatePrimaryCategory: $candidateCategories[$c->id] ?? null,
            );

            return (object) array_merge((array) $c, ['_score' => $score, '_reason' => $reason]);
        });

        // ── 5. Apply diversity rules ───────────────────────────────────
        $diversified = $this->applyDiversity($scored, $candidateCategories);

        // ── 6. Sort + slice ────────────────────────────────────────────
        $top = $diversified
            ->sortByDesc('_score')
            ->take(max($limit, 20)) // keep extra for diversity to filter from
            ->values()
            ->take($limit);

        return $this->formatResults(
            $top,
            $mutualCounts,
            $this->getMutualFollowPreviews($followingIds, $top->pluck('id')->all()),
            $user,
        );
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 1 – collect context
    // ─────────────────────────────────────────────────────────────────────

    private function getFollowingIds(User $user): array
    {
        return DB::table('followers')
            ->where('follower_id', $user->id)
            ->where('status', 'accepted')
            ->pluck('following_id')
            ->toArray();
    }

    private function getBlockedIds(User $user): array
    {
        $blocked = DB::table('blocked_users')
            ->where('blocker_id', $user->id)
            ->pluck('blocked_id')
            ->toArray();

        $blockedBy = DB::table('blocked_users')
            ->where('blocked_id', $user->id)
            ->pluck('blocker_id')
            ->toArray();

        return array_unique(array_merge($blocked, $blockedBy));
    }

    private function getDismissedIds(User $user): array
    {
        return DB::table('profile_suggestion_dismissals')
            ->where('user_id', $user->id)
            ->where('dismissed_at', '>', now()->subDays(30))
            ->pluck('suggested_user_id')
            ->toArray();
    }

    private function resolveCountry(User $user): ?string
    {
        return $user->selected_country_code ?? $user->detected_country_code ?? $user->country ?? null;
    }

    private function resolveCity(User $user): ?string
    {
        // Stored as e.g. "Kathmandu" in users.location or profiles.location
        return $user->location ?? null;
    }

    private function resolveInterests(User $user): array
    {
        $i = is_array($user->interests)   ? $user->interests   : [];
        $c = is_array($user->categories)  ? $user->categories  : [];
        return array_unique(array_merge($i, $c));
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 2 – candidate generation
    // ─────────────────────────────────────────────────────────────────────

    private function collectCandidates(
        int $userId,
        array $followingIds,
        array $excludeIds,
        ?string $country,
        array $interests,
    ): Collection {

        $safeExclude = $excludeIds ?: [0];

        // Source A: friends-of-friends (people followed by followed users)
        $fofIds = collect();
        if (!empty($followingIds)) {
            $fofIds = DB::table('followers')
                ->whereIn('follower_id', $followingIds)
                ->where('status', 'accepted')
                ->whereNotIn('following_id', $safeExclude)
                ->groupBy('following_id')
                ->orderByRaw('COUNT(*) DESC')
                ->limit(100)
                ->pluck('following_id');
        }

        // Source B: same country high-quality users
        $locationIds = collect();
        if ($country && $this->locationEnabled) {
            $locationIds = DB::table('users as u')
                ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
                ->where(fn($q) => $q->where('u.selected_country_code', $country)
                                    ->orWhere('u.detected_country_code', $country)
                                    ->orWhere('u.country', $country))
                ->where('u.is_banned', false)
                ->where('u.is_active', true)
                ->whereNotIn('u.id', $safeExclude)
                ->orderByDesc('p.total_followers')
                ->limit(60)
                ->pluck('u.id');
        }

        // Source C: users with matching interests/categories
        $interestIds = collect();
        if (!empty($interests) && $this->interestEnabled) {
            // Match via users.categories or videos.category
            $interestIds = DB::table('users as u')
                ->whereNotIn('u.id', $safeExclude)
                ->where('u.is_banned', false)
                ->where('u.is_active', true)
                ->where(function ($q) use ($interests) {
                    foreach ($interests as $interest) {
                        $q->orWhereRaw("u.categories @> ?::jsonb", [json_encode($interest)])
                          ->orWhereRaw("u.interests @> ?::jsonb", [json_encode($interest)]);
                    }
                })
                ->limit(60)
                ->pluck('u.id');
        }

        // Source D: categories user watches/likes (from user_video_preferences)
        $watchIds = collect();
        if ($this->watchEnabled) {
            $topCategories = DB::table('user_video_preferences')
                ->where('user_id', $userId)
                ->where('pref_type', 'category')
                ->orderByDesc('weight')
                ->limit(5)
                ->pluck('pref_value');

            if ($topCategories->isNotEmpty()) {
                $watchIds = DB::table('videos as v')
                    ->join('users as u', 'u.id', '=', 'v.user_id')
                    ->whereIn('v.category', $topCategories)
                    ->where('v.status', 'published')
                    ->whereNotIn('u.id', $safeExclude)
                    ->where('u.is_banned', false)
                    ->where('u.is_active', true)
                    ->groupBy('u.id')
                    ->orderByRaw('COUNT(v.id) DESC')
                    ->limit(60)
                    ->pluck('u.id');
            }
        }

        // Source E: popular creators (broad fallback)
        $popularIds = DB::table('users as u')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->whereNotIn('u.id', $safeExclude)
            ->where('u.is_banned', false)
            ->where('u.is_active', true)
            ->orderByDesc('p.total_followers')
            ->limit(50)
            ->pluck('u.id');

        // Source F: new good-quality creators (recent + has videos)
        $newIds = DB::table('users as u')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->whereNotIn('u.id', $safeExclude)
            ->where('u.is_banned', false)
            ->where('u.is_active', true)
            ->where('u.created_at', '>=', now()->subDays(90))
            ->where('p.total_videos', '>', 0)
            ->orderByDesc('p.total_followers')
            ->limit(30)
            ->pluck('u.id');

        // Merge all candidate IDs (deduplicated)
        $allIds = $fofIds->merge($locationIds)
            ->merge($interestIds)
            ->merge($watchIds)
            ->merge($popularIds)
            ->merge($newIds)
            ->unique()
            ->take(self::CANDIDATE_LIMIT)
            ->values()
            ->toArray();

        if (empty($allIds)) {
            return collect();
        }

        // Fetch full data for candidates
        return DB::table('users as u')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->select([
                'u.id', 'u.name', 'u.username', 'u.avatar',
                'u.bio', 'u.is_verified', 'u.role',
                'u.country', 'u.selected_country_code', 'u.detected_country_code',
                'u.location', 'u.created_at', 'u.updated_at',
                'u.last_active_at', 'u.trust_score',
                'u.interests', 'u.categories', 'u.is_private', 'u.profile_discovery',
                'p.total_followers', 'p.total_following', 'p.total_videos',
                'p.total_likes', 'p.profile_views', 'p.category as profile_category',
            ])
            ->whereIn('u.id', $allIds)
            ->where('u.is_banned', false)
            ->where('u.is_active', true)
            ->where(fn($q) => $q->where('u.is_private', false)
                                ->orWhereNull('u.is_private')
                                ->orWhere('u.profile_discovery', true))
            ->where(fn($q) => $q->where('u.trust_score', '>=', $this->minTrust)
                                ->orWhereNull('u.trust_score'))
            ->get();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 3 – bulk scoring data (no N+1)
    // ─────────────────────────────────────────────────────────────────────

    private function getMutualFollowCounts(int $userId, array $followingIds, array $candidateIds): array
    {
        if (empty($followingIds) || empty($candidateIds)) {
            return [];
        }

        return DB::table('followers')
            ->selectRaw('following_id, COUNT(*) as mutual_count')
            ->whereIn('follower_id', $followingIds)
            ->where('status', 'accepted')
            ->whereIn('following_id', $candidateIds)
            ->groupBy('following_id')
            ->pluck('mutual_count', 'following_id')
            ->toArray();
    }

    /**
     * Up to $per mutual friends per candidate - people the viewer follows who
     * also follow the candidate. Powers the mini avatar stack in the apps.
     * Only ever called with the final top-N ids, so the row count stays small.
     */
    private function getMutualFollowPreviews(array $followingIds, array $candidateIds, int $per = 3): array
    {
        if (empty($followingIds) || empty($candidateIds)) {
            return [];
        }

        $rows = DB::table('followers as f')
            ->join('users as u', 'u.id', '=', 'f.follower_id')
            ->whereIn('f.following_id', $candidateIds)
            ->whereIn('f.follower_id', $followingIds)
            ->where('f.status', 'accepted')
            ->select('f.following_id', 'u.id', 'u.username', 'u.name', 'u.avatar')
            ->get();

        $out = [];
        foreach ($rows as $r) {
            if (count($out[$r->following_id] ?? []) >= $per) {
                continue;
            }
            $out[$r->following_id][] = [
                'id'       => $r->id,
                'username' => $r->username,
                'name'     => $r->name,
                'avatar'   => $r->avatar ? Storage::url($r->avatar) : StorageService::defaultAvatarUrl(),
            ];
        }

        return $out;
    }

    private function getUserCategoryPrefs(int $userId): array
    {
        return DB::table('user_video_preferences')
            ->where('user_id', $userId)
            ->where('pref_type', 'category')
            ->orderByDesc('weight')
            ->limit(10)
            ->pluck('weight', 'pref_value')
            ->toArray();
    }

    private function getUserLikedCategories(int $userId): array
    {
        return DB::table('video_likes as vl')
            ->join('videos as v', 'v.id', '=', 'vl.video_id')
            ->where('vl.user_id', $userId)
            ->whereNotNull('v.category')
            ->where('vl.created_at', '>=', now()->subDays(30))
            ->selectRaw('v.category, COUNT(*) as cnt')
            ->groupBy('v.category')
            ->orderByDesc('cnt')
            ->limit(10)
            ->pluck('cnt', 'category')
            ->toArray();
    }

    private function getUserFollowedCreatorPrefs(int $userId): array
    {
        // pref_value is the creator user_id stored as string
        return DB::table('user_video_preferences')
            ->where('user_id', $userId)
            ->where('pref_type', 'creator')
            ->orderByDesc('weight')
            ->limit(20)
            ->pluck('weight', 'pref_value')
            ->toArray();
    }

    private function getCandidatePrimaryCategories(array $candidateIds): array
    {
        if (empty($candidateIds)) return [];

        // Most-used category per candidate creator
        return DB::table('videos')
            ->selectRaw('user_id, category, COUNT(*) as cnt')
            ->whereIn('user_id', $candidateIds)
            ->whereNotNull('category')
            ->where('status', 'published')
            ->groupBy('user_id', 'category')
            ->orderByDesc('cnt')
            ->get()
            ->groupBy('user_id')
            ->map(fn($rows) => $rows->first()->category)
            ->toArray();
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 4 – per-candidate scoring
    // ─────────────────────────────────────────────────────────────────────

    private function scoreCandidate(
        User $user,
        object $candidate,
        ?string $userCountry,
        ?string $userCity,
        array $userInterests,
        int $mutualCount,
        array $userCategoryPrefs,
        array $userLikedCategories,
        array $userFollowedCreators,
        ?string $candidatePrimaryCategory,
    ): float {

        $score = 0.0;

        // 1. Mutual follow score (0.22)
        $mutualScore = $mutualCount > 0 ? min($mutualCount / 10, 1.0) : 0.0;
        $score += $mutualScore * $this->wMutual;

        // 2. Location score (0.12)
        if ($this->locationEnabled && $userCountry) {
            $score += $this->locationScore($candidate, $userCountry, $userCity) * $this->wLocation;
        }

        // 3. Interest similarity (0.16)
        if ($this->interestEnabled && !empty($userInterests)) {
            $score += $this->interestScore($candidate, $userInterests) * $this->wInterest;
        }

        // 4. Watch behavior score (0.14)
        if ($this->watchEnabled && !empty($userCategoryPrefs) && $candidatePrimaryCategory) {
            $score += $this->watchBehaviorScore($candidatePrimaryCategory, $userCategoryPrefs) * $this->wWatch;
        }

        // 5. Liked video similarity (0.10)
        if (!empty($userLikedCategories) && $candidatePrimaryCategory) {
            $score += $this->likedVideoScore($candidatePrimaryCategory, $userLikedCategories) * $this->wLiked;
        }

        // 6. Followed creator similarity (0.10)
        if (!empty($userFollowedCreators)) {
            $score += $this->creatorSimilarityScore(
                (string) $candidate->id,
                $candidatePrimaryCategory,
                $userCategoryPrefs,
                $userFollowedCreators,
            ) * $this->wCreatorSim;
        }

        // 7. Creator quality score (0.08)
        $score += $this->creatorQualityScore($candidate) * $this->wQuality;

        // 8. Activity score (0.04)
        $score += $this->activityScore($candidate) * $this->wActivity;

        // 9. New creator boost (0.02)
        $score += $this->newCreatorBoost($candidate) * $this->wNewBoost;

        // 10. Verified/creator boost (0.02)
        if ($candidate->is_verified || in_array($candidate->role, ['creator', 'admin'])) {
            $score += 1.0 * $this->wVerified;
        }

        return round($score, 4);
    }

    private function locationScore(object $candidate, string $userCountry, ?string $userCity): float
    {
        $cCity    = $candidate->location ?? null;
        $cCountry = $candidate->selected_country_code
            ?? $candidate->detected_country_code
            ?? $candidate->country
            ?? null;

        if ($userCity && $cCity && mb_strtolower($userCity) === mb_strtolower($cCity)) {
            return 1.0;
        }
        if ($cCountry && mb_strtolower($cCountry) === mb_strtolower($userCountry)) {
            return 0.4;
        }
        return 0.0;
    }

    private function interestScore(object $candidate, array $userInterests): float
    {
        $cInterests = [];
        if ($candidate->interests) {
            $decoded = json_decode($candidate->interests, true);
            if (is_array($decoded)) $cInterests = array_merge($cInterests, $decoded);
        }
        if ($candidate->categories) {
            $decoded = json_decode($candidate->categories, true);
            if (is_array($decoded)) $cInterests = array_merge($cInterests, $decoded);
        }
        if ($candidate->profile_category) {
            $cInterests[] = $candidate->profile_category;
        }

        if (empty($cInterests)) return 0.0;

        // Jaccard similarity
        $userSet  = array_map('mb_strtolower', $userInterests);
        $cSet     = array_map('mb_strtolower', array_unique($cInterests));
        $intersect = count(array_intersect($userSet, $cSet));
        $union     = count(array_unique(array_merge($userSet, $cSet)));

        return $union > 0 ? $intersect / $union : 0.0;
    }

    private function watchBehaviorScore(string $candidateCategory, array $userCategoryPrefs): float
    {
        $candCat = mb_strtolower($candidateCategory);
        foreach ($userCategoryPrefs as $cat => $weight) {
            if (mb_strtolower($cat) === $candCat) {
                // Normalize weight: user_video_preferences weights are typically 0–10+
                return min($weight / 5.0, 1.0);
            }
        }
        return 0.0;
    }

    private function likedVideoScore(string $candidateCategory, array $userLikedCategories): float
    {
        $candCat   = mb_strtolower($candidateCategory);
        $totalLikes = array_sum($userLikedCategories);
        if ($totalLikes <= 0) return 0.0;

        foreach ($userLikedCategories as $cat => $cnt) {
            if (mb_strtolower($cat) === $candCat) {
                return min($cnt / $totalLikes, 1.0);
            }
        }
        return 0.0;
    }

    private function creatorSimilarityScore(
        string $candidateId,
        ?string $candidateCategory,
        array $userCategoryPrefs,
        array $userFollowedCreators,
    ): float {
        // Direct: candidate is already a creator the user interacts with via watch events
        if (isset($userFollowedCreators[$candidateId])) {
            return min($userFollowedCreators[$candidateId] / 3.0, 1.0);
        }
        // Indirect: candidate's category matches categories of creators user follows
        if ($candidateCategory && !empty($userCategoryPrefs)) {
            return $this->watchBehaviorScore($candidateCategory, $userCategoryPrefs) * 0.6;
        }
        return 0.0;
    }

    private function creatorQualityScore(object $c): float
    {
        $followers = (int) ($c->total_followers ?? 0);
        $videos    = (int) ($c->total_videos    ?? 0);
        $likes     = (int) ($c->total_likes     ?? 0);

        // Soft-cap normalization (log scale to avoid mega-influencers dominating)
        $fScore = $followers > 0 ? min(log10($followers + 1) / 6.0, 1.0) : 0.0;
        $vScore = $videos    > 0 ? min($videos / 50.0, 1.0) : 0.0;
        $lScore = $likes     > 0 ? min(log10($likes + 1) / 7.0, 1.0) : 0.0;

        return ($fScore * 0.5) + ($vScore * 0.25) + ($lScore * 0.25);
    }

    private function activityScore(object $c): float
    {
        $lastActive = $c->last_active_at ?? $c->updated_at ?? null;
        if (!$lastActive) return 0.1;

        $diffDays = now()->diffInDays(\Carbon\Carbon::parse($lastActive), true);
        return match (true) {
            $diffDays <= 1  => 1.0,
            $diffDays <= 7  => 0.7,
            $diffDays <= 30 => 0.3,
            default         => 0.1,
        };
    }

    private function newCreatorBoost(object $c): float
    {
        $trust = (float) ($c->trust_score ?? 0.8);
        if ($trust < 0.5) return 0.0;

        $ageDays = now()->diffInDays(\Carbon\Carbon::parse($c->created_at), true);
        if ($ageDays <= 90 && (int) ($c->total_videos ?? 0) > 0) {
            return max(0.0, 1.0 - ($ageDays / 90));
        }
        return 0.0;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 5 – human-readable reason
    // ─────────────────────────────────────────────────────────────────────

    private function generateReason(
        object $candidate,
        ?string $userCountry,
        int $mutualCount,
        array $userCategoryPrefs,
        ?string $candidatePrimaryCategory,
    ): string {

        // Mutual follows - highest priority reason
        if ($mutualCount >= 3) {
            return "Followed by {$mutualCount} people you follow";
        }
        if ($mutualCount > 0) {
            $word = $mutualCount === 1 ? 'person' : 'people';
            return "Followed by {$mutualCount} {$word} you follow";
        }

        // Category/interest match - "Because you watch X videos"
        if ($candidatePrimaryCategory && !empty($userCategoryPrefs)) {
            $cat = mb_strtolower($candidatePrimaryCategory);
            foreach ($userCategoryPrefs as $pref => $weight) {
                if (mb_strtolower($pref) === $cat && $weight > 1.0) {
                    return "Because you watch {$candidatePrimaryCategory} videos";
                }
            }
        }

        // Location match
        $cCountry = $candidate->selected_country_code
            ?? $candidate->detected_country_code
            ?? $candidate->country
            ?? null;
        if ($userCountry && $cCountry && mb_strtolower($cCountry) === mb_strtolower($userCountry)) {
            $countryName = $candidate->country ?? 'your country';
            $followers   = (int) ($candidate->total_followers ?? 0);
            if ($followers > 5000) {
                return "Popular in {$countryName}";
            }
            return "Trending creator near you";
        }

        // New creator
        $ageDays = now()->diffInDays(\Carbon\Carbon::parse($candidate->created_at), true);
        if ($ageDays <= 90 && (int) ($candidate->total_videos ?? 0) > 0) {
            return "New creator you may like";
        }

        // Similar category creators
        if ($candidatePrimaryCategory) {
            return "Similar to creators you follow";
        }

        if ($candidate->is_verified) {
            return "Verified creator on Teezer";
        }

        $followers = (int) ($candidate->total_followers ?? 0);
        if ($followers > 10000) {
            return "Popular on Teezer";
        }

        return "Suggested for you";
    }

    // ─────────────────────────────────────────────────────────────────────
    // Step 6 – diversity rules
    // ─────────────────────────────────────────────────────────────────────

    private function applyDiversity(Collection $scored, array $candidateCategories): Collection
    {
        $cityCount     = [];
        $categoryCount = [];
        $result        = collect();

        // Sort by score descending before applying diversity
        foreach ($scored->sortByDesc('_score') as $c) {
            $city     = $c->location ?? 'unknown';
            $category = $candidateCategories[$c->id] ?? ($c->profile_category ?? 'other');

            $cityCount[$city]         ??= 0;
            $categoryCount[$category] ??= 0;

            if ($cityCount[$city] >= self::MAX_PER_CITY) continue;
            if ($categoryCount[$category] >= self::MAX_PER_CATEGORY) continue;

            $cityCount[$city]++;
            $categoryCount[$category]++;
            $result->push($c);
        }

        return $result;
    }

    // ─────────────────────────────────────────────────────────────────────
    // Format output
    // ─────────────────────────────────────────────────────────────────────

    private function formatResults(Collection $top, array $mutualCounts, array $mutualPreviews = [], ?User $viewer = null): array
    {
        $rows = $top->map(fn($c) => [
            'id'                    => $c->id,
            'username'              => $c->username,
            'display_name'          => $c->name,
            'avatar'                => $c->avatar ? Storage::url($c->avatar) : StorageService::defaultAvatarUrl(),
            'bio'                   => $c->bio,
            'is_verified'           => (bool) $c->is_verified,
            'is_creator'            => $c->role === 'creator',
            'followers_count'       => (int) ($c->total_followers ?? 0),
            'mutual_followers_count'=> (int) ($mutualCounts[$c->id] ?? 0),
            'mutual_followers'      => $mutualPreviews[$c->id] ?? [],
            'reason'                => $c->_reason,
            'score'                 => $c->_score,
            'is_following'          => false,
        ])->values()->toArray();

        return $this->attachRingFlags($rows, $viewer);
    }

    /**
     * Merges has_story/has_unseen into each row (keyed by 'id'), batched via
     * Story::batchRingFlags() - same gradient/seen ring the feed, profile
     * screen, Inbox and Search already draw, now on suggested-account rows
     * too. $viewer null (guest suggestions) leaves every row false -
     * Story::batchRingFlags() itself returns [] with no viewer.
     *
     * Note: getSuggestions()/getGuestSuggestions() cache their whole result
     * for suggestion_cache_ttl (20 min default) - has_story/has_unseen are
     * baked into that cache like every other field here, so a story watched
     * mid-window won't flip a suggestion row's ring until the cache expires.
     * Same staleness the pre-existing hardcoded is_following: false above
     * already has; not something this change newly introduces.
     */
    private function attachRingFlags(array $rows, ?User $viewer): array
    {
        if (empty($rows)) {
            return $rows;
        }
        $flags = \App\Models\Story::batchRingFlags(array_column($rows, 'id'), $viewer);
        return array_map(function ($r) use ($flags) {
            $f = $flags[$r['id']] ?? null;
            $r['has_story']  = $f['has_story'] ?? false;
            $r['has_unseen'] = $f['has_unseen'] ?? false;
            return $r;
        }, $rows);
    }

    // ─────────────────────────────────────────────────────────────────────
    // Creator-profile suggestions (unique per viewed profile)
    // ─────────────────────────────────────────────────────────────────────

    /**
     * Returns creators similar to $profileOwnerId - different for every profile page.
     * Sources: (A) creators the owner follows, (B) same category, (C) same country.
     */
    private function buildCreatorProfileSuggestions(User $viewer, int $profileOwnerId, int $limit): array
    {
        $owner = User::find($profileOwnerId);
        if (!$owner) {
            return $this->coldStartFallback($viewer, $limit);
        }

        $followingIds = $this->getFollowingIds($viewer);
        $blockedIds   = $this->getBlockedIds($viewer);
        $dismissedIds = $this->getDismissedIds($viewer);
        $excludeIds   = array_unique(array_merge(
            [$viewer->id, $profileOwnerId],
            $followingIds, $blockedIds, $dismissedIds, [0]
        ));
        $safeExclude = $excludeIds ?: [0];

        $ownerCountry = $this->resolveCountry($owner);

        $ownerCats     = $this->getCandidatePrimaryCategories([$profileOwnerId]);
        $ownerCategory = $ownerCats[$profileOwnerId] ?? null;

        // Source A: users the owner follows
        $ownerFollowingIds = DB::table('followers')
            ->where('follower_id', $profileOwnerId)
            ->where('status', 'accepted')
            ->whereNotIn('following_id', $safeExclude)
            ->orderByDesc('created_at')
            ->limit(50)
            ->pluck('following_id')
            ->toArray();

        $idSets = [$ownerFollowingIds];

        // Source B: creators posting in same category
        if ($ownerCategory) {
            $idSets[] = DB::table('videos as v')
                ->join('users as u', 'u.id', '=', 'v.user_id')
                ->where('v.category', $ownerCategory)
                ->where('v.status', 'published')
                ->whereNotIn('u.id', $safeExclude)
                ->where('u.is_banned', false)
                ->where('u.is_active', true)
                ->groupBy('u.id')
                ->orderByRaw('COUNT(v.id) DESC')
                ->limit(80)
                ->pluck('u.id')
                ->toArray();
        }

        // Source C: same country
        if ($ownerCountry) {
            $idSets[] = DB::table('users as u')
                ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
                ->where(fn($q) => $q
                    ->where('u.selected_country_code', $ownerCountry)
                    ->orWhere('u.detected_country_code', $ownerCountry)
                    ->orWhere('u.country', $ownerCountry))
                ->whereNotIn('u.id', $safeExclude)
                ->where('u.is_banned', false)
                ->where('u.is_active', true)
                ->orderByDesc('p.total_followers')
                ->limit(60)
                ->pluck('u.id')
                ->toArray();
        }

        $allIds = array_slice(array_unique(array_merge(...$idSets)), 0, self::CANDIDATE_LIMIT);

        if (empty($allIds)) {
            return $this->coldStartFallback($viewer, $limit, $excludeIds);
        }

        $candidates = DB::table('users as u')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->select([
                'u.id', 'u.name', 'u.username', 'u.avatar',
                'u.bio', 'u.is_verified', 'u.role',
                'u.country', 'u.selected_country_code', 'u.detected_country_code',
                'u.location', 'u.created_at', 'u.updated_at', 'u.last_active_at',
                'p.total_followers', 'p.total_videos', 'p.total_likes',
            ])
            ->whereIn('u.id', $allIds)
            ->where('u.is_banned', false)
            ->where('u.is_active', true)
            ->where(fn($q) => $q->where('u.is_private', false)->orWhereNull('u.is_private'))
            ->where(fn($q) => $q->where('u.trust_score', '>=', $this->minTrust)->orWhereNull('u.trust_score'))
            ->get();

        if ($candidates->isEmpty()) {
            return $this->coldStartFallback($viewer, $limit, $excludeIds);
        }

        $candidateIds  = $candidates->pluck('id')->toArray();
        $mutualCounts  = $this->getMutualFollowCounts($viewer->id, $followingIds, $candidateIds);
        $candidateCats = $this->getCandidatePrimaryCategories($candidateIds);

        $scored = $candidates->map(function ($c) use (
            $ownerCategory, $ownerCountry, $ownerFollowingIds, $mutualCounts, $candidateCats
        ) {
            $score = 0.0;
            $cat   = $candidateCats[$c->id] ?? null;

            // Primary signal: same category as the profile owner
            if ($ownerCategory && $cat && mb_strtolower($cat) === mb_strtolower($ownerCategory)) {
                $score += 0.40;
            }

            // Owner follows this person (strong endorsement)
            if (in_array($c->id, $ownerFollowingIds)) {
                $score += 0.25;
            }

            // Same country as owner
            $cCountry = $c->selected_country_code ?? $c->detected_country_code ?? $c->country ?? null;
            if ($ownerCountry && $cCountry && mb_strtolower($cCountry) === mb_strtolower($ownerCountry)) {
                $score += 0.10;
            }

            // Mutual followers with the viewer (trust signal)
            $mutual = $mutualCounts[$c->id] ?? 0;
            if ($mutual > 0) {
                $score += min($mutual / 5.0, 1.0) * 0.10;
            }

            $score += $this->creatorQualityScore($c) * 0.15;
            $score += $this->activityScore($c) * 0.05;

            if ($c->is_verified)        $score += 0.05;
            if ($c->role === 'creator') $score += 0.03;

            return (object) array_merge((array) $c, [
                '_score'  => round($score, 4),
                '_reason' => $this->creatorProfileReason($c, $ownerFollowingIds, $ownerCategory, $ownerCountry, $cat),
            ]);
        });

        $top = $scored->sortByDesc('_score')->take($limit)->values();

        return $this->formatResults(
            $top,
            $mutualCounts,
            $this->getMutualFollowPreviews($followingIds, $top->pluck('id')->all()),
            $viewer,
        );
    }

    private function creatorProfileReason(
        object $c,
        array $ownerFollowingIds,
        ?string $ownerCategory,
        ?string $ownerCountry,
        ?string $candidateCategory,
    ): string {
        if (in_array($c->id, $ownerFollowingIds)) {
            return 'Followed by this creator';
        }
        if ($ownerCategory && $candidateCategory
            && mb_strtolower($candidateCategory) === mb_strtolower($ownerCategory)) {
            return "Also creates {$ownerCategory} content";
        }
        $cCountry = $c->selected_country_code ?? $c->detected_country_code ?? $c->country ?? null;
        if ($ownerCountry && $cCountry && mb_strtolower($cCountry) === mb_strtolower($ownerCountry)) {
            return $c->location ? "Creator in {$c->location}" : 'Creator from the same region';
        }
        if ($c->is_verified) return 'Verified creator on Teezer';
        if ((int) ($c->total_followers ?? 0) > 5000) return 'Popular on Teezer';
        return 'Suggested for you';
    }

    // ─────────────────────────────────────────────────────────────────────
    // Cold-start fallback (new users with no data)
    // ─────────────────────────────────────────────────────────────────────

    private function coldStartFallback(User $user, int $limit, array $excludeIds = []): array
    {
        $excludeIds = array_unique(array_merge([$user->id], $excludeIds, [0]));

        $userCountry = $this->resolveCountry($user);
        $interests   = $this->resolveInterests($user);

        $rows = DB::table('users as u')
            ->leftJoin('profiles as p', 'p.user_id', '=', 'u.id')
            ->select([
                'u.id', 'u.name', 'u.username', 'u.avatar', 'u.bio',
                'u.is_verified', 'u.role', 'u.country',
                'u.selected_country_code', 'u.detected_country_code',
                'p.total_followers', 'p.total_videos', 'p.total_likes',
                'p.category as profile_category',
            ])
            ->whereNotIn('u.id', $excludeIds)
            ->where('u.is_banned', false)
            ->where('u.is_active', true)
            ->where(fn($q) => $q->where('u.is_private', false)->orWhereNull('u.is_private'))
            ->where(fn($q) => $q->where('u.trust_score', '>=', $this->minTrust)->orWhereNull('u.trust_score'))
            ->orderByRaw(
                '(COALESCE(p.total_followers,0) * 1 + COALESCE(p.total_videos,0) * 3 + CASE WHEN u.is_verified = true THEN 500 ELSE 0 END + RANDOM() * 30) DESC'
            )
            ->limit($limit)
            ->get();

        $coldRows = $rows->map(fn($c) => [
            'id'                    => $c->id,
            'username'              => $c->username,
            'display_name'          => $c->name,
            'avatar'                => $c->avatar ? Storage::url($c->avatar) : StorageService::defaultAvatarUrl(),
            'bio'                   => $c->bio,
            'is_verified'           => (bool) $c->is_verified,
            'is_creator'            => $c->role === 'creator',
            'followers_count'       => (int) ($c->total_followers ?? 0),
            'mutual_followers_count'=> 0,
            'reason'                => $c->is_verified ? 'Verified creator on Teezer' : 'Suggested for you',
            'score'                 => 0.0,
            'is_following'          => false,
        ])->values()->toArray();

        return $this->attachRingFlags($coldRows, $user);
    }
}
