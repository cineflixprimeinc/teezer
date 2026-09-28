<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdCampaign;
use App\Models\AdGroup;
use App\Services\Ads\AdAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * Manage ad groups within a campaign the caller owns.
 */
class StudioAdGroupController extends Controller
{
    private const BID_TYPES  = 'cpm,cpc,cpv';
    private const PLACEMENTS = 'in_feed,profile_top,hashtag,search,explore,inbox';

    public function __construct(private AdAccountService $accounts) {}

    public function store(Request $request, int $campaignId): JsonResponse
    {
        $campaign = $this->ownedCampaign($request, $campaignId);
        $data     = $this->validated($request);

        $group = $campaign->groups()->create($this->map($data, false));

        return response()->json(['success' => true, 'data' => $group], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $group = $this->ownedGroup($request, $id);
        $data  = $this->validated($request);

        $group->update($this->map($data, true));

        return response()->json(['success' => true, 'data' => $group->fresh()]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $this->ownedGroup($request, $id)->delete();

        return response()->json(['success' => true, 'message' => 'Ad group deleted.']);
    }

    private function validated(Request $request): array
    {
        return $request->validate([
            'name'              => ['nullable', 'string', 'max:150'],
            'status'            => ['sometimes', 'in:active,paused'],
            'placements'        => ['nullable', 'array'],
            'placements.*'      => ['string', 'in:' . self::PLACEMENTS],
            'targeting'         => ['nullable', 'array'],
            'optimization_goal' => ['nullable', 'string', 'max:40'],
            'bid_type'          => ['nullable', 'in:' . self::BID_TYPES],
            'bid_amount'        => ['nullable', 'numeric', 'min:0'],
        ]);
    }

    private function map(array $d, bool $partial): array
    {
        $out = [];
        foreach (['name', 'status', 'placements', 'targeting', 'optimization_goal', 'bid_type'] as $k) {
            if (array_key_exists($k, $d)) {
                $out[$k] = $d[$k];
            }
        }
        if (array_key_exists('bid_amount', $d)) {
            $out['bid_cents'] = (int) round(((float) $d['bid_amount']) * 100);
        }
        if (! $partial) {
            $out['name']              = $d['name'] ?? 'Ad group';
            $out['status']            = $d['status'] ?? 'active';
            $out['placements']        = $d['placements'] ?? ['in_feed'];
            $out['bid_type']          = $d['bid_type'] ?? 'cpm';
            $out['optimization_goal'] = $d['optimization_goal'] ?? 'impressions';
        }

        return $out;
    }

    private function ownedCampaign(Request $request, int $id): AdCampaign
    {
        $account = $this->accounts->forUser($request->user()->id);

        return AdCampaign::where('ad_account_id', $account->id)->findOrFail($id);
    }

    private function ownedGroup(Request $request, int $id): AdGroup
    {
        $accountId = $this->accounts->forUser($request->user()->id)->id;

        return AdGroup::whereHas('campaign', fn ($q) => $q->where('ad_account_id', $accountId))->findOrFail($id);
    }
}
