<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
use App\Models\Video;
use App\Services\Ads\AdContext;
use App\Services\Ads\AdServer;
use App\Services\Ads\AdSigner;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Serves single-slot sponsored ads for surfaces that aren't the main feed (the
 * feed splices its own via AdFeedInjector). Right now: the Inbox "Messages"
 * list, shown only to advertisers who chose the `inbox` placement. Returns
 * `data: null` when ads are off or nothing fills - the caller then renders a
 * plain inbox.
 */
class AdController extends Controller
{
    public function __construct(private AdServer $adServer, private AdSigner $signer) {}

    public function inbox(Request $request): JsonResponse
    {
        return $this->serveOne($request, 'inbox');
    }

    private function serveOne(Request $request, string $placement): JsonResponse
    {
        if (! config('ads.enabled')) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $user    = $request->user();
        $country = $user && $user->country
            ? substr(strtoupper($user->country), 0, 2)
            : ($request->header('CF-IPCountry') ?: null);

        $ctx = new AdContext(
            placement: $placement,
            userId:    $user?->id,
            sessionId: $request->header('X-Session-Id') ?: $request->get('session_id'),
            country:   $country,
            language:  $user->language ?? null,
        );

        $decision = $this->adServer->decide($ctx, (int) config('ads.floor_cpm_cents', 0));
        if (! $decision) {
            return response()->json(['success' => true, 'data' => null]);
        }

        $c     = $decision->candidate;
        $token = $this->signer->mint($c->campaignId, $c->adGroupId, $c->creativeId, $user?->id, $decision->priceCents);

        // Thumbnail = creative image, else the boosted video's (signed) poster.
        $thumb = $c->meta['thumbnail_url'] ?? null;
        if (! $thumb && $c->videoId) {
            $video = Video::find($c->videoId);
            if ($video) {
                $thumb = (new VideoResource($video))->resolve($request)['thumbnail_url'] ?? null;
            }
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'id'               => 'ad_' . $c->creativeId . '_' . substr(md5($token), 0, 8),
                'headline'         => $c->meta['headline'] ?? null,
                'body'             => $c->meta['body'] ?? null,
                'cta_type'         => $c->meta['cta_type'] ?? null,
                'destination_url'  => $c->meta['destination_url'] ?? null,
                'display_name'     => $c->meta['display_name'] ?? null,
                'thumbnail_url'    => $thumb,
                'impression_token' => $token,
                'placement'        => $placement,
            ],
        ]);
    }
}
