<?php

namespace App\Services\Ads;

use App\Http\Resources\VideoResource;
use App\Models\User;
use App\Models\Video;
use Illuminate\Http\Request;

/**
 * Splices sponsored items into the recommender's already-built feed page. It never
 * touches ranking — it only inserts extra items at reserved slots. No-fill on any
 * slot simply means that slot stays organic. Called only when config('ads.enabled').
 */
class AdFeedInjector
{
    public function __construct(private AdServer $adServer, private AdSigner $signer) {}

    /**
     * @param  array  $items serialized organic video items (in order)
     * @return array  the same items with sponsored items spliced in
     */
    public function inject(Request $request, array $items, ?User $user, string $placement = 'in_feed'): array
    {
        $firstSlot = max(1, (int) config('ads.in_feed.first_slot', 4));
        $cadence   = (int) config('ads.in_feed.cadence', 6);
        $floor     = (int) config('ads.floor_cpm_cents', 0);

        $base = $this->baseContext($request, $user, $placement);

        // Decide which slots get an ad (insert AFTER organic index $i).
        $decisions = [];
        $seen      = [];
        foreach ($items as $i => $_) {
            $pos = $i + 1;
            $isSlot = $pos === $firstSlot || ($cadence > 0 && $pos > $firstSlot && ($pos - $firstSlot) % $cadence === 0);
            if (! $isSlot) {
                continue;
            }
            $decision = $this->adServer->decide($this->withSeen($base, $seen), $floor);
            if ($decision) {
                $decisions[$i] = $decision;
                $seen[]        = $decision->candidate->campaignId;
            }
        }

        if (! $decisions) {
            return $items;
        }

        // Batch-load boosted videos so the client renders them like normal cards.
        $videoIds = array_values(array_filter(array_map(fn ($d) => $d->candidate->videoId, $decisions)));
        $videos   = $videoIds ? Video::whereIn('id', $videoIds)->get()->keyBy('id') : collect();

        $out = [];
        foreach ($items as $i => $item) {
            $out[] = $item;
            if (isset($decisions[$i])) {
                $out[] = $this->adItem($decisions[$i], $videos, $request, $base->userId);
            }
        }

        return $out;
    }

    private function adItem(AdDecision $d, $videos, Request $request, ?int $userId): array
    {
        $c     = $d->candidate;
        $video = $c->videoId ? $videos->get($c->videoId) : null;
        $token = $this->signer->mint($c->campaignId, $c->adGroupId, $c->creativeId, $userId, $d->priceCents);
        $videoArr = $video ? (new VideoResource($video))->resolve($request) : null;

        return [
            'id'           => 'ad_' . $c->creativeId . '_' . substr(md5($token), 0, 8),
            'is_sponsored' => true,
            'media_type'   => $videoArr['media_type'] ?? (($c->meta['type'] ?? 'video') === 'image' ? 'image' : 'video'),
            'ad'           => [
                'campaign_id'      => $c->campaignId,
                'ad_group_id'      => $c->adGroupId,
                'creative_id'      => $c->creativeId,
                'headline'         => $c->meta['headline'] ?? null,
                'body'             => $c->meta['body'] ?? null,
                'cta_type'         => $c->meta['cta_type'] ?? null,
                'destination_url'  => $c->meta['destination_url'] ?? null,
                'display_name'     => $c->meta['display_name'] ?? null,
                'media_url'        => $c->meta['media_url'] ?? null,
                'thumbnail_url'    => $c->meta['thumbnail_url'] ?? null,
                'impression_token' => $token,
                'placement'        => $request->attributes->get('ad_placement', 'in_feed'),
            ],
            // Present for boosted-video ads so the client can play it as a normal card.
            'video'        => $videoArr,
        ];
    }

    private function baseContext(Request $request, ?User $user, string $placement): AdContext
    {
        $country = $user && $user->country
            ? substr(strtoupper($user->country), 0, 2)
            : ($request->header('CF-IPCountry') ?: null);

        // Viewer GPS for geo-radius targeting (best-effort; absent for most requests).
        $lat = $request->filled('lat') ? (float) $request->get('lat') : null;
        $lng = $request->filled('lng') ? (float) $request->get('lng') : null;
        if ($lat !== null && ($lat < -90 || $lat > 90)) {
            $lat = null;
        }
        if ($lng !== null && ($lng < -180 || $lng > 180)) {
            $lng = null;
        }

        return new AdContext(
            placement:  $placement,
            userId:     $user?->id,
            sessionId:  $request->header('X-Session-Id') ?: $request->get('session_id'),
            country:    $country,
            language:   $user->language ?? null,
            lat:        $lat,
            lng:        $lng,
        );
    }

    private function withSeen(AdContext $c, array $seen): AdContext
    {
        return new AdContext(
            $c->placement, $c->userId, $c->sessionId, $c->country,
            $c->language, $c->age, $c->gender, $c->interests, $seen,
            $c->lat, $c->lng,
        );
    }
}
