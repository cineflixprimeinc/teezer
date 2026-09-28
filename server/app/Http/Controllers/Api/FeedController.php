<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\UserVideoPreference;
use App\Models\Video;
use App\Services\FeedService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class FeedController extends Controller
{
    public function __construct(private readonly FeedService $feedService) {}

    /**
     * GET /api/feed/for-you
     *
     * Personalized For You Page feed. Primary path: precomputed Redis pools
     * (feed:build-pools cron - 60% country / 15% language / 15% global /
     * 10% fresh, per-user seen-set; no request-time scoring). Falls back to
     * forYouV2 (video_scores + feed cache) until pools are built, and that
     * in turn falls back to the original forYou() scorer.
     */
    public function forYou(Request $request): JsonResponse
    {
        $excludeIds = collect((array) $request->get('exclude_ids', []))
            ->map(fn ($v) => (int) $v)
            ->filter()
            ->values()
            ->all();

        $user    = $request->user();
        $perPage = (int) $request->get('per_page', 8);

        $paginator = $this->feedService->forYouPools($user, $perPage, $excludeIds)
            ?? $this->feedService->forYouV2($user, $perPage, $excludeIds);

        // Ads: when the master switch is on, splice sponsored items into the
        // recommender's output (ranking is never touched). OFF by default → the
        // payload is byte-identical. Wrapped so an ad error can never break the feed.
        $data = VideoResource::collection($paginator);
        if (config('ads.enabled')) {
            try {
                $items = collect($paginator->items())
                    ->map(fn ($v) => (new VideoResource($v))->resolve($request))
                    ->all();
                $data = app(\App\Services\Ads\AdFeedInjector::class)->inject($request, $items, $user);
            } catch (\Throwable $e) {
                report($e); // fall back to the untouched organic feed
            }
        }

        return response()->json([
            'success' => true,
            'data'    => $data,
            'meta'    => [
                'current_page'  => $paginator->currentPage(),
                'last_page'     => $paginator->lastPage(),
                'per_page'      => $paginator->perPage(),
                'total'         => $paginator->total(),
                'next_page_url' => $paginator->nextPageUrl(),
            ],
        ]);
    }

    /**
     * GET /api/feed/country
     *
     * The feed's third tab: videos posted from the viewer's own country.
     *
     * The country is resolved here rather than sent by the client, in the same
     * order the recommender already uses - the account's chosen country, then
     * the one we detected for it, then an optional device-GPS hint (see
     * below), then Cloudflare's edge header for a guest. A client-supplied
     * country would let anyone browse any country's feed and would quietly
     * disagree with the country lock on the account - which is why the GPS
     * hint only ever gets a say when BOTH account fields are absent; it can
     * never override a signed-in account's resolved country.
     *
     * `gps_country` (optional, ISO 3166-1 alpha-2): a device-derived hint the
     * app sends when it already holds location permission (granted for a
     * different feature, or from CountryLocationPrompt). It is validated
     * exactly like every other candidate below - same regex + IsoCountries
     * check - so an invalid or made-up value is simply ignored, never trusted
     * outright. This is the only place a client value can influence the
     * result, and it exists to catch what the Cloudflare header cannot: a
     * VPN's exit country is not the user's real one, and GPS is the one
     * signal here that reflects physical location instead of network route.
     *
     * Answers with the same VideoResource shape as For You, so the app renders
     * it with the existing feed - plus the resolved country in `meta`, which is
     * what the tab labels itself with.
     */
    public function country(Request $request): JsonResponse
    {
        $user       = $request->user();
        $gpsCountry = strtoupper((string) $request->query('gps_country', ''));
        $cc         = strtoupper((string) (
            $user?->selected_country_code
            ?: $user?->detected_country_code
            ?: ($gpsCountry !== '' ? $gpsCountry : null)
            ?: $request->headers->get('cf-ipcountry')
        ));

        if (! preg_match('/^[A-Z]{2}$/', $cc) || ! \App\Services\IsoCountries::isValid($cc)) {
            // Nothing to filter on - an empty page is honest, and the app hides
            // the tab rather than showing a country it could not work out.
            return response()->json([
                'success' => true,
                'data'    => [],
                'meta'    => [
                    'current_page' => 1, 'last_page' => 1,
                    'per_page' => (int) $request->get('per_page', 8), 'total' => 0,
                    'next_page_url' => null,
                    'country_code' => null, 'country_name' => null,
                ],
            ]);
        }

        // country(), like trending(), takes no viewer and does not batch the
        // viewer flags itself.
        $paginator = $this->feedService->country($cc, (int) $request->get('per_page', 8));

        Video::attachViewerFlags($paginator, $request->user());

        return response()->json([
            'success' => true,
            'data'    => VideoResource::collection($paginator),
            'meta'    => [
                'current_page'  => $paginator->currentPage(),
                'last_page'     => $paginator->lastPage(),
                'per_page'      => $paginator->perPage(),
                'total'         => $paginator->total(),
                'next_page_url' => $paginator->nextPageUrl(),
                'country_code'  => $cc,
                'country_name'  => \App\Services\IsoCountries::nameFor($cc),
            ],
        ]);
    }

    /** DELETE /api/v1/feed/reset-preferences - wipe personalised weights */
    public function resetPreferences(Request $request): JsonResponse
    {
        UserVideoPreference::where('user_id', $request->user()->id)->delete();

        return response()->json([
            'success' => true,
            'message' => 'Feed preferences reset. Your feed will refresh with new recommendations.',
        ]);
    }
}
