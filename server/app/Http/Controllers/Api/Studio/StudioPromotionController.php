<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdAccount;
use App\Models\AdCampaign;
use App\Models\AdStatDaily;
use App\Models\Promotion;
use App\Models\User;
use App\Models\Video;
use App\Services\Ads\PromotionAdMapper;
use App\Services\CurrencyConverter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Storage;

class StudioPromotionController extends Controller
{
    /* ── List all promotions for the authenticated user ─────────────────── */
    public function index(Request $request): JsonResponse
    {
        $promotions = Promotion::with('video:id,title,caption,thumbnail_url,category,status,views_count,likes_count,comments_count,shares_count,saves_count')
            ->where('user_id', $request->user()->id)
            ->orderByDesc('created_at')
            ->paginate(20);

        return response()->json([
            'success' => true,
            'data'    => $promotions->items(),
            'meta'    => [
                'current_page' => $promotions->currentPage(),
                'last_page'    => $promotions->lastPage(),
                'total'        => $promotions->total(),
            ],
        ]);
    }

    /* ── Ads home overview: account summary + campaigns with real spend ───── */
    public function overview(Request $request): JsonResponse
    {
        $userId = $request->user()->id;

        $promotions = Promotion::with('video:id,title,caption,thumbnail_url,category,status,views_count,likes_count,comments_count,shares_count,saves_count')
            ->where('user_id', $userId)->orderByDesc('created_at')->get();

        // Real delivery metrics come from the bridged campaign's ad_stats_daily.
        $campByPromo = AdCampaign::whereIn('promotion_id', $promotions->pluck('id'))
            ->get(['id', 'promotion_id'])->keyBy('promotion_id');
        $stats = AdStatDaily::whereIn('campaign_id', $campByPromo->pluck('id'))
            ->selectRaw('campaign_id, sum(impressions) i, sum(clicks) c, sum(conversions) cv, sum(spend_cents) s')
            ->groupBy('campaign_id')->get()->keyBy('campaign_id');

        $disk = config('filesystems.default', 'r2');

        $rows = $promotions->map(function ($p) use ($campByPromo, $stats, $disk) {
            $camp  = $campByPromo->get($p->id);
            $st    = $camp ? $stats->get($camp->id) : null;
            $spent = (int) ($st->s ?? 0);
            [$label, $count] = $this->resultFor($p->objective, $st);

            $arr = $p->toArray();
            // The video's thumbnail column holds a storage key, not a URL — resolve it
            // to an absolute URL so the campaign card can render the cover image.
            if (! empty($arr['video']['thumbnail_url'])) {
                $arr['video']['thumbnail_url'] = Storage::disk($disk)->url($arr['video']['thumbnail_url']);
            }
            $arr['spent_cents']           = $spent;
            $arr['result_label']          = $label;
            $arr['result_count']          = $count;
            $arr['cost_per_result_cents'] = $count > 0 ? round($spent / $count, 2) : 0; // fractional cents for sub-₹1 CPMs
            $arr['delivery']              = $this->deliveryLabel($p->status);
            $arr['tag']                   = $p->status === 'completed' ? 'Ended recently' : null;
            return $arr;
        })->all();

        $totalSpent = collect($rows)->sum('spent_cents');
        $account    = AdAccount::where('user_id', $userId)->first();
        $recommendations = $promotions->whereIn('status', ['rejected', 'changes_requested', 'draft'])->count();

        return response()->json(['success' => true, 'data' => [
            'summary' => [
                'total_spent_cents'    => (int) $totalSpent,
                'currency'             => optional($promotions->first())->currency ?: ($account->currency ?? 'USD'),
                'spending_limit_cents' => $account?->balance_cents,
                'limit_reached'        => $account ? ((int) $account->balance_cents <= 0 && $totalSpent > 0) : false,
                'opportunity_score'    => max(60, 100 - $recommendations * 8),
                'recommendations'      => (int) $recommendations,
            ],
            'campaigns' => $rows,
        ]]);
    }

    /** Objective → [result label, count] from the campaign's rolled-up stats. */
    private function resultFor(string $objective, $st): array
    {
        $i = (int) ($st->i ?? 0); $c = (int) ($st->c ?? 0); $cv = (int) ($st->cv ?? 0);
        return match ($objective) {
            'more_engagement'      => ['Engagements', $c],
            'more_profile_visits'  => ['Profile visits', $c],
            'more_followers'       => ['Followers', $cv],
            default                => ['ThruPlays', $i], // more_views
        };
    }

    private function deliveryLabel(string $status): string
    {
        return match ($status) {
            'active'            => 'Active',
            'paused'           => 'Off',
            'completed'        => 'Completed',
            'pending_review'   => 'In review',
            'rejected'         => 'Rejected',
            'changes_requested'=> 'Needs changes',
            default            => 'Off', // draft
        };
    }

    /* ── Live audience + delivery estimate (real, from the users table) ───── */
    public function estimate(Request $request): JsonResponse
    {
        $data = $request->validate([
            'country'      => ['nullable', 'string', 'max:100'],
            'city'         => ['nullable', 'string', 'max:120'],
            'region'       => ['nullable', 'string', 'max:120'],
            'age_range'    => ['nullable', 'string', 'max:20'],
            'gender'       => ['nullable', 'in:all,male,female'],
            'interests'    => ['nullable', 'array'],
            'interests.*'  => ['string', 'max:60'],
            'daily_budget' => ['required', 'numeric', 'min:1'],
            'currency'     => ['nullable', 'string', 'size:3'],
        ]);

        // Addressable audience: count real accounts matching the targeting.
        $q = User::query();

        if (! empty($data['country'])) {
            $c = $data['country'];
            $q->where(function ($w) use ($c) {
                $w->where('country', $c)
                  ->orWhere('selected_country_name', $c)
                  ->orWhere('selected_country_code', $c);
            });
        }
        if (! empty($data['city'])) {
            $q->where('city_name', 'ilike', $data['city']);
        } elseif (! empty($data['region'])) {
            $q->where('region_name', 'ilike', $data['region']);
        }
        if (! empty($data['gender']) && $data['gender'] !== 'all') {
            $q->where('gender', $data['gender']);
        }

        // Age band from date_of_birth (age >= min  ⇔  DOB <= today-min; age <= max ⇔ DOB > today-(max+1)).
        [$ageMin, $ageMax] = $this->parseAgeBand($data['age_range'] ?? null);
        if ($ageMax !== null) {
            $q->whereNotNull('date_of_birth')->whereDate('date_of_birth', '>', now()->subYears($ageMax + 1)->toDateString());
        }
        if ($ageMin !== null) {
            $q->whereNotNull('date_of_birth')->whereDate('date_of_birth', '<=', now()->subYears($ageMin)->toDateString());
        }

        // Interests: ANY overlap with the account's own categories/interests (jsonb containment).
        if (! empty($data['interests'])) {
            $q->where(function ($w) use ($data) {
                foreach ($data['interests'] as $i) {
                    $w->orWhereJsonContains('categories', $i)->orWhereJsonContains('interests', $i);
                }
            });
        }

        $addressable = (int) $q->count();

        // Delivery from budget: reach is bounded by the addressable audience when we have
        // one; impressions may exceed reach (repeat views within the frequency cap).
        // The budget arrives in the advertiser's currency — convert to USD so the CPM
        // math is against the same base the ad actually spends in.
        $daily   = app(CurrencyConverter::class)->toUsd((float) $data['daily_budget'], $data['currency'] ?? null);
        $cpm     = max(0.5, config('ads.floor_cpm_cents', 50) / 100);
        $impr    = ($daily / $cpm) * 1000;
        $reach   = $impr / 1.4;
        $imprCap = $impr;
        if ($addressable > 0) {
            $reach   = min($reach, $addressable);
            $imprCap = min($impr, $addressable * 3);
        }

        $range = fn (float $v, float $lo, float $hi): array => ['min' => (int) round($v * $lo), 'max' => (int) round($v * $hi)];

        return response()->json(['success' => true, 'data' => [
            'currency' => app(CurrencyConverter::class)->base(),
            'audience' => ['min' => (int) round($addressable * 0.9), 'max' => $addressable],
            'per_day'  => [
                'reach'       => $range($reach, 0.8, 1.0),
                'impressions' => $range($imprCap, 0.85, 1.15),
                'views'       => $range($reach, 0.25, 0.55),
                'clicks'      => $range($reach, 0.02, 0.06),
            ],
            'note' => 'Estimated from accounts matching your targeting. Actual delivery varies with auction and creative quality.',
        ]]);
    }

    /** "18-24" -> [18,24]; "45+" -> [45,null]; null -> [null,null]. */
    private function parseAgeBand(?string $range): array
    {
        if (! $range) {
            return [null, null];
        }
        if (str_ends_with($range, '+')) {
            return [(int) rtrim($range, '+'), null];
        }
        if (str_contains($range, '-')) {
            [$lo, $hi] = explode('-', $range, 2);
            return [(int) $lo, (int) $hi];
        }
        return [null, null];
    }

    /* ── Create (or save draft) ──────────────────────────────────────────── */
    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'video_id'        => ['required', 'integer', 'exists:videos,id'],
            'objective'       => ['required', 'in:more_views,more_followers,more_profile_visits,more_engagement'],
            // "More Followers" flow: promote a profile or up to 3 videos + follow-card label.
            'promote_target'      => ['nullable', 'in:profile,videos'],
            'promoted_video_ids'  => ['nullable', 'array', 'max:3'],
            'promoted_video_ids.*' => ['integer', 'exists:videos,id'],
            'follow_button_text'  => ['nullable', 'string', 'max:40'],
            // "More Video Views" flow: delivery settings collected on the Video Settings step.
            'video_settings'                      => ['nullable', 'array'],
            'video_settings.optimization_goal'    => ['nullable', 'string', 'max:40'],
            'video_settings.play_behavior'        => ['nullable', 'in:auto_play,tap_to_play'],
            'video_settings.sound'                => ['nullable', 'in:on,off'],
            'video_settings.tracking_parameters'  => ['nullable', 'string', 'max:500'],
            // "Messages" flow: greeting / quick replies / action button.
            'message_settings'                    => ['nullable', 'array'],
            'message_settings.greeting'           => ['nullable', 'string', 'max:200'],
            'message_settings.quick_replies'      => ['nullable', 'array', 'max:3'],
            'message_settings.quick_replies.*'    => ['string', 'max:40'],
            'message_settings.action_button'      => ['nullable', 'string', 'max:40'],
            // "App Installs" flow.
            'app_settings'                        => ['nullable', 'array'],
            'app_settings.source'                 => ['nullable', 'in:my_app,app_store_url,google_play_url'],
            'app_settings.app_name'               => ['nullable', 'string', 'max:120'],
            'app_settings.app_store_url'          => ['nullable', 'string', 'max:500'],
            'app_settings.google_play_url'        => ['nullable', 'string', 'max:500'],
            'app_settings.platforms'              => ['nullable', 'array'],
            'app_settings.platforms.*'            => ['in:ios,android'],
            'app_settings.deep_link'              => ['nullable', 'string', 'max:500'],
            'app_settings.primary_text'           => ['nullable', 'string', 'max:200'],
            'app_settings.cta'                    => ['nullable', 'string', 'max:40'],
            'app_settings.tracking'               => ['nullable', 'string', 'max:60'],
            // "More Engagement" flow.
            'engagement_settings'                    => ['nullable', 'array'],
            'engagement_settings.optimize_for'       => ['nullable', 'in:all_engagements,comments,shares,likes'],
            'engagement_settings.engagement_style'   => ['nullable', 'in:balanced,high_engagement_users'],
            // "Sales / Conversions" flow.
            'conversion_settings'                     => ['nullable', 'array'],
            'conversion_settings.location'            => ['nullable', 'in:website,app'],
            'conversion_settings.event'               => ['nullable', 'string', 'max:60'],
            'conversion_settings.value_type'          => ['nullable', 'in:same,different,none'],
            'conversion_settings.optimization_goal'   => ['nullable', 'string', 'max:60'],
            'conversion_settings.bid_strategy'        => ['nullable', 'string', 'max:60'],
            'conversion_settings.attribution_window'  => ['nullable', 'string', 'max:60'],
            'conversion_settings.payment_event'       => ['nullable', 'string', 'max:60'],
            // Creative copy for the in-feed sponsored card.
            'headline'        => ['nullable', 'string', 'max:120'],
            'body'            => ['nullable', 'string', 'max:300'],
            'cta_type'        => ['nullable', 'in:learn_more,shop_now,sign_up,download,watch_more,book_now,contact_us,get_offer,visit_website,send_message,order_now,subscribe,none'],
            'destination_url' => ['nullable', 'url', 'max:500'],
            'destination_type' => ['nullable', 'in:website,instant_page'],
            'display_name'    => ['nullable', 'string', 'max:120'],
            'placements'      => ['nullable', 'array'],
            'placements.*'    => ['string', 'in:in_feed,profile_top,hashtag,search,explore,inbox,for_you_feed,suggested_accounts,follow_recommendations,discover_people,following_feed,explore_feed,search_results,suggested_videos,profile_feed'],
            'country'         => ['nullable', 'string', 'max:100'],
            'city'            => ['nullable', 'string', 'max:120'],
            'region'          => ['nullable', 'string', 'max:120'],
            'target_lat'      => ['nullable', 'required_with:target_lng', 'numeric', 'between:-90,90'],
            'target_lng'      => ['nullable', 'required_with:target_lat', 'numeric', 'between:-180,180'],
            'target_radius_km' => ['nullable', 'integer', 'min:1', 'max:500'],
            'age_range'       => ['nullable', 'string', 'max:20'],
            'gender'          => ['nullable', 'in:all,male,female'],
            'interests'       => ['nullable', 'array'],
            'interests.*'     => ['string', 'max:60'],
            'target_languages'   => ['nullable', 'array'],
            'target_languages.*' => ['string', 'max:40'],
            'demographics'                  => ['nullable', 'array'],
            'demographics.relationship'     => ['nullable', 'array'],
            'demographics.relationship.*'   => ['string', 'max:40'],
            'demographics.education'        => ['nullable', 'array'],
            'demographics.education.*'      => ['string', 'max:40'],
            'demographics.parental'         => ['nullable', 'string', 'max:40'],
            'demographics.behaviors'        => ['nullable', 'array'],
            'demographics.behaviors.*'      => ['string', 'max:60'],
            'daily_budget'    => ['required', 'numeric', 'min:1'],
            'total_budget'    => ['required', 'numeric', 'min:1'],
            'currency'        => ['nullable', 'string', 'size:3'],
            'start_date'      => ['nullable', 'date'],
            'end_date'        => ['nullable', 'date', 'after_or_equal:start_date'],
            'duration_days'   => ['nullable', 'integer', 'min:1', 'max:365'],
            'payment_method'  => ['nullable', 'in:teezer_balance,credit_card,e_wallet,bank_transfer'],
            'est_impressions_min'     => ['nullable', 'integer'],
            'est_impressions_max'     => ['nullable', 'integer'],
            'est_views_min'           => ['nullable', 'integer'],
            'est_views_max'           => ['nullable', 'integer'],
            'est_profile_visits_min'  => ['nullable', 'integer'],
            'est_profile_visits_max'  => ['nullable', 'integer'],
            'status'          => ['nullable', 'in:draft,pending_review'],
        ]);

        // Ensure the video belongs to this user
        $video = Video::where('id', $data['video_id'])
            ->where('user_id', $request->user()->id)
            ->firstOrFail();

        // Normalise the budget to USD. Advertisers may enter in their local currency
        // (e.g. NPR 1,000/day), but the whole delivery pipeline settles in USD, so we
        // convert once here and keep the original amount + currency for display.
        $fx             = app(CurrencyConverter::class);
        $chosen         = $fx->normalize($data['currency'] ?? null);
        $dailyOriginal  = (float) $data['daily_budget'];
        $totalOriginal  = (float) $data['total_budget'];

        $promotion = Promotion::create(array_merge($data, [
            'user_id'                => $request->user()->id,
            'daily_budget'           => $fx->toUsd($dailyOriginal, $chosen),
            'total_budget'           => $fx->toUsd($totalOriginal, $chosen),
            'currency'               => $fx->base(), // canonical settlement currency (USD)
            'budget_currency'        => $chosen,
            'daily_budget_original'  => round($dailyOriginal, 2),
            'total_budget_original'  => round($totalOriginal, 2),
            'fx_rate_to_usd'         => $fx->unitInUsd($chosen),
            'gender'                 => $data['gender'] ?? 'all',
            'status'                 => $data['status'] ?? 'pending_review',
        ]));

        $this->bridge($promotion);

        return response()->json([
            'success' => true,
            'data'    => $promotion,
            'message' => $promotion->status === 'draft'
                ? 'Promotion draft saved.'
                : 'Promotion submitted for review.',
        ], 201);
    }

    /* ── Show single promotion (full Ad Details payload) ─────────────────── */
    public function show(Request $request, int $id): JsonResponse
    {
        $promotion = Promotion::with('video')
            ->where('user_id', $request->user()->id)
            ->findOrFail($id);

        $disk = config('filesystems.default', 'r2');
        $camp = AdCampaign::where('promotion_id', $promotion->id)->first();
        $campId = $camp?->id;

        $arr = $promotion->toArray();
        if (! empty($arr['video']['thumbnail_url'])) {
            $arr['video']['thumbnail_url'] = Storage::disk($disk)->url($arr['video']['thumbnail_url']);
        }

        $today = now()->toDateString();

        // Real engagement on the promoted post (likes + comments + shares). This is
        // genuine video data, so it's meaningful even before the ad has delivered.
        $vid = $promotion->video;
        $engagement = (int) (($vid->likes_count ?? 0) + ($vid->comments_count ?? 0) + ($vid->shares_count ?? 0));

        // The advertiser's original budget (what they typed), when it differed from USD.
        $hasOriginal = $promotion->budget_currency
            && strtoupper((string) $promotion->budget_currency) !== ($promotion->currency ?: 'USD')
            && $promotion->daily_budget_original !== null;

        return response()->json(['success' => true, 'data' => [
            'promotion'          => $arr,
            'campaign_id'        => $campId,
            // Same code the admin panel shows, so advertiser and admin reference one ID.
            'cam_id'             => $campId ? 'CAM-' . str_pad((string) $campId, 6, '0', STR_PAD_LEFT) : null,
            'objective_label'    => $this->objLabel($promotion->objective),
            'delivery'           => $this->deliveryLabel($promotion->status),
            // Only an approved ad (live or paused) can be flipped on/off from the app.
            'can_toggle'         => in_array($promotion->status, ['active', 'paused'], true),
            'currency'           => $promotion->currency ?: 'USD',
            'daily_budget_cents' => (int) round(((float) $promotion->daily_budget) * 100),
            'total_budget_cents' => (int) round(((float) $promotion->total_budget) * 100),
            // Original (pre-conversion) budget so the app can show "You set NPR 1,000 ≈ $7.50".
            'original_currency'          => $hasOriginal ? strtoupper((string) $promotion->budget_currency) : null,
            'original_daily_budget_cents'=> $hasOriginal ? (int) round(((float) $promotion->daily_budget_original) * 100) : null,
            'original_total_budget_cents'=> $hasOriginal ? (int) round(((float) $promotion->total_budget_original) * 100) : null,
            'engagement'         => $engagement,
            'stats' => [
                'max'     => $this->rangeStats($campId, $promotion->objective, null, null),
                'last_30' => $this->rangeStats($campId, $promotion->objective, now()->subDays(30)->toDateString(), $today),
                'today'   => $this->rangeStats($campId, $promotion->objective, $today, $today),
            ],
        ]]);
    }

    /** Turn an approved ad on (active) or off (paused) from the Ad Details page. */
    public function toggle(Request $request, int $id): JsonResponse
    {
        $data      = $request->validate(['active' => ['required', 'boolean']]);
        $promotion = Promotion::where('user_id', $request->user()->id)->findOrFail($id);

        if (! in_array($promotion->status, ['active', 'paused'], true)) {
            return response()->json(['success' => false, 'message' => 'Only an approved ad can be turned on or off.'], 422);
        }

        $to = $data['active'] ? 'active' : 'paused';
        $promotion->update(['status' => $to]);
        AdCampaign::where('promotion_id', $promotion->id)->update(['status' => $to]);
        $this->refreshPools();

        return response()->json([
            'success' => true,
            'data'    => $promotion->fresh(),
            'message' => $data['active'] ? 'Ad turned on.' : 'Ad turned off.',
        ]);
    }

    /** Rolled-up delivery metrics for a campaign over an optional [from,to] date range. */
    private function rangeStats(?int $campaignId, string $objective, ?string $from, ?string $to): array
    {
        if (! $campaignId) {
            return ['result_label' => $this->resultFor($objective, null)[0], 'result_count' => 0,
                    'cost_per_result_cents' => 0, 'spent_cents' => 0, 'reach' => 0, 'impressions' => 0];
        }

        $q = AdStatDaily::where('campaign_id', $campaignId);
        if ($from) { $q->where('stat_date', '>=', $from); }
        if ($to)   { $q->where('stat_date', '<=', $to); }
        $row = $q->selectRaw('sum(impressions) i, sum(reach) r, sum(clicks) c, sum(conversions) cv, sum(spend_cents) s')->first();

        $i = (int) ($row->i ?? 0); $r = (int) ($row->r ?? 0);
        $c = (int) ($row->c ?? 0); $cv = (int) ($row->cv ?? 0); $s = (int) ($row->s ?? 0);
        [$label, $count] = $this->resultFor($objective, (object) ['i' => $i, 'c' => $c, 'cv' => $cv]);

        return [
            'result_label'          => $label,
            'result_count'          => $count,
            'cost_per_result_cents' => $count > 0 ? round($s / $count, 2) : 0,
            'spent_cents'           => $s,
            // reach is tracked when available; otherwise estimated from impressions.
            'reach'                 => $r > 0 ? $r : ($i > 0 ? (int) round($i / 1.4) : 0),
            'impressions'           => $i,
        ];
    }

    /** Objective → advertiser-facing label. */
    private function objLabel(string $objective): string
    {
        return [
            'more_views'          => 'Video views',
            'more_followers'      => 'Followers',
            'more_profile_visits' => 'Profile visits',
            'more_engagement'     => 'Engagement',
        ][$objective] ?? ucfirst(str_replace('_', ' ', $objective));
    }

    /** Rebuild the Redis eligibility pools so on/off takes effect immediately. */
    private function refreshPools(): void
    {
        try {
            app(\App\Services\Ads\EligibleAdPoolBuilder::class)->build();
        } catch (\Throwable $e) {
            Log::warning('Ad pool refresh skipped', ['error' => $e->getMessage()]);
        }
    }

    /* ── Update (draft only) ─────────────────────────────────────────────── */
    public function update(Request $request, int $id): JsonResponse
    {
        $promotion = Promotion::where('user_id', $request->user()->id)->findOrFail($id);

        if (! in_array($promotion->status, ['draft', 'rejected'])) {
            return response()->json([
                'success' => false,
                'message' => 'Only draft or rejected promotions can be edited.',
            ], 422);
        }

        $data = $request->validate([
            'objective'      => ['sometimes', 'in:more_views,more_followers,more_profile_visits,more_engagement'],
            'headline'        => ['nullable', 'string', 'max:120'],
            'body'            => ['nullable', 'string', 'max:300'],
            'cta_type'        => ['nullable', 'in:learn_more,shop_now,sign_up,download,watch_more,book_now,contact_us,get_offer,visit_website,send_message,order_now,subscribe,none'],
            'destination_url' => ['nullable', 'url', 'max:500'],
            'destination_type' => ['nullable', 'in:website,instant_page'],
            'display_name'    => ['nullable', 'string', 'max:120'],
            'placements'      => ['nullable', 'array'],
            'placements.*'    => ['string', 'in:in_feed,profile_top,hashtag,search,explore,inbox,for_you_feed,suggested_accounts,follow_recommendations,discover_people,following_feed,explore_feed,search_results,suggested_videos,profile_feed'],
            'country'        => ['nullable', 'string', 'max:100'],
            'city'           => ['nullable', 'string', 'max:120'],
            'region'         => ['nullable', 'string', 'max:120'],
            'target_lat'     => ['nullable', 'required_with:target_lng', 'numeric', 'between:-90,90'],
            'target_lng'     => ['nullable', 'required_with:target_lat', 'numeric', 'between:-180,180'],
            'target_radius_km' => ['nullable', 'integer', 'min:1', 'max:500'],
            'age_range'      => ['nullable', 'string', 'max:20'],
            'gender'         => ['nullable', 'in:all,male,female'],
            'interests'      => ['nullable', 'array'],
            'daily_budget'   => ['sometimes', 'numeric', 'min:1'],
            'total_budget'   => ['sometimes', 'numeric', 'min:1'],
            'start_date'     => ['nullable', 'date'],
            'end_date'       => ['nullable', 'date'],
            'duration_days'  => ['nullable', 'integer', 'min:1'],
            'payment_method' => ['nullable', 'in:teezer_balance,credit_card,e_wallet,bank_transfer'],
            'status'         => ['nullable', 'in:draft,pending_review'],
        ]);

        $promotion->update($data);

        // The edit sheet takes budgets in USD (the settlement currency), so if the
        // budget was changed here, drop any stale pre-conversion "original currency"
        // note left over from a foreign-currency create.
        if (array_key_exists('daily_budget', $data) || array_key_exists('total_budget', $data)) {
            $promotion->update([
                'budget_currency'       => app(CurrencyConverter::class)->base(),
                'daily_budget_original' => null,
                'total_budget_original' => null,
                'fx_rate_to_usd'        => null,
            ]);
        }

        $fresh = $promotion->fresh();
        if ($fresh) {
            $this->bridge($fresh);
        }

        return response()->json(['success' => true, 'data' => $fresh]);
    }

    /* ── Delete (draft only) ─────────────────────────────────────────────── */
    public function destroy(Request $request, int $id): JsonResponse
    {
        $promotion = Promotion::where('user_id', $request->user()->id)->findOrFail($id);

        // A live ad must be turned off first (so delivery actually stops); once it's
        // off (paused) — or a draft / rejected / completed / in-review campaign — it
        // can be deleted.
        if ($promotion->status === 'active') {
            return response()->json([
                'success' => false,
                'message' => 'Turn the ad off first, then you can delete it.',
            ], 422);
        }

        if (! in_array($promotion->status, ['draft', 'rejected', 'completed', 'paused', 'pending_review'], true)) {
            return response()->json([
                'success' => false,
                'message' => 'This promotion cannot be deleted.',
            ], 422);
        }

        // Remove the mirrored ad campaign too (promotion_id is nullOnDelete, so
        // deleting the promotion alone would leave an orphan campaign in the
        // admin panel). Delete the campaign first, then the promotion.
        AdCampaign::where('promotion_id', $promotion->id)->delete();
        $promotion->delete();

        return response()->json(['success' => true, 'message' => 'Promotion deleted.']);
    }

    /**
     * Mirror the promotion into the canonical ad hierarchy so the delivery engine can serve it.
     * Best-effort: never breaks the promotion flow (e.g. before the ad_* tables are migrated).
     */
    private function bridge(Promotion $promotion): void
    {
        try {
            app(PromotionAdMapper::class)->project($promotion);
        } catch (\Throwable $e) {
            Log::warning('Promotion->ad bridge skipped', [
                'promotion_id' => $promotion->id,
                'error'        => $e->getMessage(),
            ]);
        }
    }
}
