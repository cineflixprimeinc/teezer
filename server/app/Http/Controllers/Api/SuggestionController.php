<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\IpCountryService;
use App\Services\ProfileSuggestionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;

class SuggestionController extends Controller
{
    public function __construct(private readonly ProfileSuggestionService $service) {}

    /**
     * GET /api/v1/suggestions/guest?limit=6
     * Public - no auth. Country detected from IP (Cloudflare header → MMDB → NP).
     */
    public function guest(Request $request): JsonResponse
    {
        $limit = (int) min($request->get('limit', 6), 20);

        /** @var IpCountryService $ipService */
        $ipService   = app(IpCountryService::class);
        $geo         = $ipService->lookup($request);
        $countryCode = $geo['countryCode'] ?? IpCountryService::DEFAULT_COUNTRY_CODE;

        $suggestions = $this->service->getGuestSuggestions($countryCode, $limit);
        return response()->json(['success' => true, 'suggestions' => $suggestions]);
    }

    /**
     * GET /api/v1/suggestions/profiles?limit=10&context=home
     *
     * Supported contexts: home, profile, friends, following_empty, search, creator_profile
     */
    public function profiles(Request $request): JsonResponse
    {
        $user    = $request->user();
        $limit   = (int) min($request->get('limit', 10), 50);
        $context = in_array(
            $request->get('context', 'home'),
            ['home', 'profile', 'friends', 'following_empty', 'search', 'creator_profile'],
        ) ? $request->get('context', 'home') : 'home';

        $profileOwnerId = (int) $request->get('profile_user_id', 0) ?: null;

        try {
            $suggestions = $this->service->getSuggestions($user, $context, $limit, $profileOwnerId);

            // Log impressions asynchronously (best-effort)
            try {
                $this->service->logShown($user->id, $suggestions, $context);
            } catch (\Throwable) {
                // logging failure must never break the response
            }

            return response()->json(['success' => true, 'suggestions' => $suggestions]);

        } catch (\Throwable $e) {
            Log::warning('SuggestionController::profiles failed', ['error' => $e->getMessage(), 'user' => $user->id]);
            return response()->json(['success' => true, 'suggestions' => []]);
        }
    }

    /**
     * POST /api/v1/suggestions/profiles/{userId}/dismiss
     *
     * Persists a dismissal (do not show again for 30 days) and clears cache.
     */
    public function dismiss(Request $request, int $userId): JsonResponse
    {
        try {
            $this->service->dismiss($request->user(), $userId);
            return response()->json(['success' => true]);
        } catch (\Throwable $e) {
            Log::warning('SuggestionController::dismiss failed', ['error' => $e->getMessage()]);
            return response()->json(['success' => false], 500);
        }
    }

    /**
     * POST /api/v1/suggestions/profiles/{userId}/followed
     *
     * Called by frontend after a follow action to log the conversion and refresh cache.
     */
    public function markFollowed(Request $request, int $userId): JsonResponse
    {
        try {
            $this->service->markFollowed($request->user()->id, $userId);
            $this->service->invalidateCache($request->user()->id);
            return response()->json(['success' => true]);
        } catch (\Throwable $e) {
            return response()->json(['success' => false], 500);
        }
    }

    /**
     * DELETE /api/v1/suggestions/cache
     *
     * Force-clear the suggestion cache for the current user.
     * Called automatically after follow/interest changes.
     */
    public function clearCache(Request $request): JsonResponse
    {
        $this->service->invalidateCache($request->user()->id);
        return response()->json(['success' => true]);
    }

    /**
     * GET /api/v1/suggestions/analytics (admin only)
     */
    public function analytics(Request $request): JsonResponse
    {
        $user = $request->user();
        if (!$user->isAdmin()) {
            return response()->json(['success' => false, 'message' => 'Unauthorized.'], 403);
        }

        $days = (int) $request->get('days', 30);

        $since = now()->subDays($days);

        $impressions   = \Illuminate\Support\Facades\DB::table('profile_suggestion_logs')
            ->where('shown_at', '>=', $since)
            ->count();

        $clicks        = \Illuminate\Support\Facades\DB::table('profile_suggestion_logs')
            ->where('shown_at', '>=', $since)
            ->whereNotNull('clicked_at')
            ->count();

        $follows       = \Illuminate\Support\Facades\DB::table('profile_suggestion_logs')
            ->where('shown_at', '>=', $since)
            ->whereNotNull('followed_at')
            ->count();

        $dismissals    = \Illuminate\Support\Facades\DB::table('profile_suggestion_dismissals')
            ->where('dismissed_at', '>=', $since)
            ->count();

        $topReasons    = \Illuminate\Support\Facades\DB::table('profile_suggestion_logs')
            ->where('shown_at', '>=', $since)
            ->whereNotNull('followed_at')
            ->selectRaw('reason, COUNT(*) as follow_count')
            ->groupBy('reason')
            ->orderByDesc('follow_count')
            ->limit(10)
            ->get();

        $topContexts   = \Illuminate\Support\Facades\DB::table('profile_suggestion_logs')
            ->where('shown_at', '>=', $since)
            ->selectRaw('context, COUNT(*) as impressions, SUM(CASE WHEN followed_at IS NOT NULL THEN 1 ELSE 0 END) as follows')
            ->groupBy('context')
            ->get();

        return response()->json([
            'success' => true,
            'data'    => [
                'period_days'       => $days,
                'impressions'       => $impressions,
                'clicks'            => $clicks,
                'follows'           => $follows,
                'dismissals'        => $dismissals,
                'ctr'               => $impressions > 0 ? round($clicks / $impressions * 100, 2) : 0,
                'follow_rate'       => $impressions > 0 ? round($follows / $impressions * 100, 2) : 0,
                'top_reasons'       => $topReasons,
                'by_context'        => $topContexts,
            ],
        ]);
    }
}
