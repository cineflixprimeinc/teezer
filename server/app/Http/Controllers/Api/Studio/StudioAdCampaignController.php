<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdCampaign;
use App\Services\Ads\AdAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Reelsoo Ads — advertiser campaign API (canonical Campaign -> Ad Group -> Creative).
 * All resources are scoped to the caller's ad account. Additive: the legacy
 * studio/promotions endpoints keep working; this is the richer path.
 */
class StudioAdCampaignController extends Controller
{
    private const OBJECTIVES = 'reach,video_views,traffic,engagement,followers,conversions,app_installs';
    private const BID_TYPES   = 'cpm,cpc,cpv';
    private const CTA         = 'learn_more,shop_now,sign_up,download,watch_more,book_now,contact_us,get_offer';
    private const PLACEMENTS  = 'in_feed,profile_top,hashtag,search,explore,inbox';

    public function __construct(private AdAccountService $accounts) {}

    public function index(Request $request): JsonResponse
    {
        $account = $this->accounts->forUser($request->user()->id);

        $campaigns = AdCampaign::with('groups.creatives')
            ->where('ad_account_id', $account->id)
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'success' => true,
            'data'    => $campaigns->items(),
            'meta'    => [
                'current_page' => $campaigns->currentPage(),
                'last_page'    => $campaigns->lastPage(),
                'total'        => $campaigns->total(),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'         => ['required', 'string', 'max:150'],
            'objective'    => ['required', 'in:' . self::OBJECTIVES],
            'budget_type'  => ['nullable', 'in:daily,lifetime'],
            'daily_budget' => ['required_without:total_budget', 'nullable', 'numeric', 'min:1'],
            'total_budget' => ['nullable', 'numeric', 'min:1'],
            'currency'     => ['nullable', 'string', 'size:3'],
            'bid_strategy' => ['nullable', 'in:lowest_cost,cost_cap,bid_cap'],
            'pacing'       => ['nullable', 'in:standard,accelerated'],
            'start_at'     => ['nullable', 'date'],
            'end_at'       => ['nullable', 'date', 'after_or_equal:start_at'],
            'status'       => ['nullable', 'in:draft,pending_review'],

            'groups'                            => ['nullable', 'array'],
            'groups.*.name'                     => ['nullable', 'string', 'max:150'],
            'groups.*.placements'               => ['nullable', 'array'],
            'groups.*.placements.*'             => ['string', 'in:' . self::PLACEMENTS],
            'groups.*.targeting'                => ['nullable', 'array'],
            'groups.*.optimization_goal'        => ['nullable', 'string', 'max:40'],
            'groups.*.bid_type'                 => ['nullable', 'in:' . self::BID_TYPES],
            'groups.*.bid_amount'               => ['nullable', 'numeric', 'min:0'],
            'groups.*.creatives'                => ['nullable', 'array'],
            'groups.*.creatives.*.type'         => ['nullable', 'in:video,image,carousel'],
            'groups.*.creatives.*.video_id'     => ['nullable', 'integer', 'exists:videos,id'],
            'groups.*.creatives.*.asset_key'    => ['nullable', 'string', 'max:255'],
            'groups.*.creatives.*.headline'     => ['nullable', 'string', 'max:120'],
            'groups.*.creatives.*.body'         => ['nullable', 'string', 'max:300'],
            'groups.*.creatives.*.cta_type'     => ['nullable', 'in:' . self::CTA],
            'groups.*.creatives.*.destination_url' => ['nullable', 'url', 'max:500'],
            'groups.*.creatives.*.display_name' => ['nullable', 'string', 'max:120'],
        ]);

        $account = $this->accounts->forUser($request->user()->id, $data['currency'] ?? 'USD');

        // Admin "Disable Advertising" / suspend blocks creating new campaigns.
        if (($account->meta['ads_disabled'] ?? false) || $account->status !== 'active') {
            return response()->json([
                'success' => false,
                'message' => ($account->meta['ads_disabled'] ?? false)
                    ? 'Advertising is disabled on your account. You cannot create new ads.'
                    : 'Your ad account is not active. You cannot create new ads.',
                'code'    => 'ADS_DISABLED',
            ], 403);
        }

        $status  = $data['status'] ?? 'draft';

        $campaign = DB::transaction(function () use ($data, $account, $status) {
            $campaign = AdCampaign::create([
                'ad_account_id'      => $account->id,
                'name'               => $data['name'],
                'objective'          => $data['objective'],
                'status'             => $status,
                'budget_type'        => $data['budget_type'] ?? 'daily',
                'daily_budget_cents' => $this->cents($data['daily_budget'] ?? 0),
                'total_budget_cents' => $this->cents($data['total_budget'] ?? 0),
                'currency'           => $data['currency'] ?? $account->currency,
                'bid_strategy'       => $data['bid_strategy'] ?? 'lowest_cost',
                'pacing'             => $data['pacing'] ?? 'standard',
                'start_at'           => $data['start_at'] ?? null,
                'end_at'             => $data['end_at'] ?? null,
                'submitted_at'       => $status === 'pending_review' ? now() : null,
            ]);

            foreach ($data['groups'] ?? [] as $g) {
                $group = $campaign->groups()->create([
                    'name'              => $g['name'] ?? 'Ad group',
                    'status'            => 'active',
                    'placements'        => $g['placements'] ?? ['in_feed'],
                    'targeting'         => $g['targeting'] ?? null,
                    'optimization_goal' => $g['optimization_goal'] ?? 'impressions',
                    'bid_type'          => $g['bid_type'] ?? 'cpm',
                    'bid_cents'         => $this->cents($g['bid_amount'] ?? 0),
                ]);

                foreach ($g['creatives'] ?? [] as $c) {
                    $group->creatives()->create([
                        'type'            => $c['type'] ?? (! empty($c['video_id']) ? 'video' : 'image'),
                        'video_id'        => $c['video_id'] ?? null,
                        'asset_key'       => $c['asset_key'] ?? null,
                        'headline'        => $c['headline'] ?? null,
                        'body'            => $c['body'] ?? null,
                        'cta_type'        => $c['cta_type'] ?? null,
                        'destination_url' => $c['destination_url'] ?? null,
                        'display_name'    => $c['display_name'] ?? null,
                        'review_status'   => 'pending',
                    ]);
                }
            }

            return $campaign;
        });

        return response()->json([
            'success' => true,
            'data'    => $campaign->load('groups.creatives'),
            'message' => $status === 'draft' ? 'Campaign draft saved.' : 'Campaign submitted for review.',
        ], 201);
    }

    public function show(Request $request, int $id): JsonResponse
    {
        return response()->json(['success' => true, 'data' => $this->find($request, $id, ['groups.creatives'])]);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $campaign = $this->find($request, $id);

        if (! in_array($campaign->status, ['draft', 'rejected'], true)) {
            return response()->json(['success' => false, 'message' => 'Only draft or rejected campaigns can be edited.'], 422);
        }

        $data = $request->validate([
            'name'         => ['sometimes', 'string', 'max:150'],
            'objective'    => ['sometimes', 'in:' . self::OBJECTIVES],
            'budget_type'  => ['sometimes', 'in:daily,lifetime'],
            'daily_budget' => ['sometimes', 'numeric', 'min:1'],
            'total_budget' => ['sometimes', 'numeric', 'min:1'],
            'bid_strategy' => ['sometimes', 'in:lowest_cost,cost_cap,bid_cap'],
            'pacing'       => ['sometimes', 'in:standard,accelerated'],
            'start_at'     => ['nullable', 'date'],
            'end_at'       => ['nullable', 'date', 'after_or_equal:start_at'],
        ]);

        $patch = collect($data)->except(['daily_budget', 'total_budget'])->all();
        if (isset($data['daily_budget'])) {
            $patch['daily_budget_cents'] = $this->cents($data['daily_budget']);
        }
        if (isset($data['total_budget'])) {
            $patch['total_budget_cents'] = $this->cents($data['total_budget']);
        }

        $campaign->update($patch);

        return response()->json(['success' => true, 'data' => $campaign->fresh('groups.creatives')]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $campaign = $this->find($request, $id);

        if (! in_array($campaign->status, ['draft', 'rejected', 'completed'], true)) {
            return response()->json(['success' => false, 'message' => 'Active campaigns cannot be deleted.'], 422);
        }

        $campaign->delete();

        return response()->json(['success' => true, 'message' => 'Campaign deleted.']);
    }

    public function submit(Request $request, int $id): JsonResponse
    {
        $campaign = $this->find($request, $id);

        if (! in_array($campaign->status, ['draft', 'rejected'], true)) {
            return response()->json(['success' => false, 'message' => 'Only draft or rejected campaigns can be submitted.'], 422);
        }

        $campaign->update(['status' => 'pending_review', 'submitted_at' => now(), 'rejection_reason' => null]);

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Campaign submitted for review.']);
    }

    public function pause(Request $request, int $id): JsonResponse
    {
        $campaign = $this->find($request, $id);

        if ($campaign->status !== 'active') {
            return response()->json(['success' => false, 'message' => 'Only active campaigns can be paused.'], 422);
        }

        $campaign->update(['status' => 'paused']);

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Campaign paused.']);
    }

    public function resume(Request $request, int $id): JsonResponse
    {
        $campaign = $this->find($request, $id);

        if ($campaign->status !== 'paused') {
            return response()->json(['success' => false, 'message' => 'Only paused campaigns can be resumed.'], 422);
        }

        $campaign->update(['status' => 'active']);

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Campaign resumed.']);
    }

    /**
     * Lightweight reach estimate from budget. Delivery-agnostic (does not touch the
     * feed); real delivery depends on the auction, targeting and quality at serve time.
     */
    public function estimate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'daily_budget'  => ['required', 'numeric', 'min:1'],
            'duration_days' => ['nullable', 'integer', 'min:1', 'max:365'],
            'currency'      => ['nullable', 'string', 'size:3'],
        ]);

        $daily = (float) $data['daily_budget'];
        $cpm   = max(0.5, config('ads.floor_cpm_cents', 50) / 100); // effective CPM in currency units
        $impr  = ($daily / $cpm) * 1000;

        $range = fn (float $lo, float $hi): array => ['min' => (int) round($impr * $lo), 'max' => (int) round($impr * $hi)];

        return response()->json(['success' => true, 'data' => [
            'currency' => $data['currency'] ?? 'USD',
            'per_day'  => [
                'impressions' => $range(0.85, 1.25),
                'reach'       => $range(0.55, 0.80),
                'views'       => $range(0.12, 0.28),
                'clicks'      => $range(0.008, 0.025),
            ],
            'note' => 'Estimated ranges. Actual delivery varies with targeting, auction and creative quality.',
        ]]);
    }

    private function find(Request $request, int $id, array $with = []): AdCampaign
    {
        $account = $this->accounts->forUser($request->user()->id);

        return AdCampaign::with($with)->where('ad_account_id', $account->id)->findOrFail($id);
    }

    private function cents($amount): int
    {
        return (int) round(((float) $amount) * 100);
    }
}
