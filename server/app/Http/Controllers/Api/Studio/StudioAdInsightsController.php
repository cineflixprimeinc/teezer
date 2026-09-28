<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\AdCampaign;
use App\Models\AdLedgerEntry;
use App\Models\AdStatDaily;
use App\Models\Promotion;
use App\Services\Ads\AdAccountService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Storage;

/**
 * Advertiser reporting, aggregated from the ad_stats_daily rollup (scoped to the
 * caller's ad account). Read-only.
 */
class StudioAdInsightsController extends Controller
{
    public function __construct(private AdAccountService $accounts) {}

    /** GET /studio/ad-insights/overview — account-wide totals + 30-day series. */
    public function overview(Request $request): JsonResponse
    {
        $account     = $this->accounts->forUser($request->user()->id);
        $campaignIds = AdCampaign::where('ad_account_id', $account->id)->pluck('id');
        $since       = now()->subDays(30)->toDateString();

        $agg = AdStatDaily::whereIn('campaign_id', $campaignIds)
            ->where('stat_date', '>=', $since)
            ->selectRaw('coalesce(sum(impressions),0) impressions, coalesce(sum(reach),0) reach, coalesce(sum(clicks),0) clicks, coalesce(sum(conversions),0) conversions, coalesce(sum(spend_cents),0) spend_cents')
            ->first();

        $impr = (int) $agg->impressions;
        $clk  = (int) $agg->clicks;

        return response()->json(['success' => true, 'data' => [
            'active_campaigns' => AdCampaign::where('ad_account_id', $account->id)->where('status', 'active')->count(),
            'impressions'      => $impr,
            'reach'            => (int) $agg->reach,
            'clicks'           => $clk,
            'conversions'      => (int) $agg->conversions,
            'spend_cents'      => (int) $agg->spend_cents,
            'ctr'              => $impr > 0 ? round($clk / $impr * 100, 2) : 0,
            'balance_cents'    => $account->balance_cents,
            'currency'         => $account->currency,
            'series'           => $this->series($campaignIds->all(), $since),
        ]]);
    }

    /**
     * GET /studio/ad-insights/dashboard?from=&to= — the full Ads Manager overview.
     *
     * Everything the web dashboard renders comes from here so the six tiles, the
     * performance chart, the status donut, the top / recent campaign tables, the
     * placement breakdown and the account summary all share one real data source
     * (ad_stats_daily joined to the caller's promotions/campaigns). Metrics are
     * scoped to an arbitrary [from,to] date range and each tile carries the same
     * metric for the immediately-preceding window so the UI can show a delta.
     */
    public function dashboard(Request $request): JsonResponse
    {
        $userId  = $request->user()->id;
        $account = $this->accounts->forUser($userId);

        // Date range — default to the last 7 days (inclusive), overridable via query.
        [$from, $to, $days] = $this->resolveRange($request);
        // Prior window of equal length, ending the day before `from`.
        $prevTo   = Carbon::parse($from)->subDay()->toDateString();
        $prevFrom = Carbon::parse($from)->subDays($days)->toDateString();

        // The advertiser's promotions carry the human-facing name / objective /
        // cover image; the bridged campaign is what ad_stats_daily is keyed by.
        $promotions = Promotion::with('video:id,title,caption,thumbnail_url,category,status,views_count,likes_count,comments_count,shares_count,saves_count')
            ->where('user_id', $userId)->orderByDesc('created_at')->get();

        $campByPromo = AdCampaign::whereIn('promotion_id', $promotions->pluck('id'))
            ->get(['id', 'promotion_id', 'status', 'created_at'])->keyBy('promotion_id');
        $campaignIds = $campByPromo->pluck('id')->all();

        // Per-campaign rollups for the selected range (drives per-row + top tables).
        $inRange = $this->statsByCampaign($campaignIds, $from, $to);
        // Account-wide totals for the tiles, current vs previous window.
        $cur  = $this->totals($campaignIds, $from, $to);
        $prev = $this->totals($campaignIds, $prevFrom, $prevTo);

        $disk = config('filesystems.default', 'r2');

        // Build one row per promotion with its in-range delivery.
        $rows = $promotions->map(function (Promotion $p) use ($campByPromo, $inRange, $disk) {
            $camp = $campByPromo->get($p->id);
            $st   = $camp ? $inRange->get($camp->id) : null;
            $i = (int) ($st->i ?? 0); $r = (int) ($st->r ?? 0);
            $c = (int) ($st->c ?? 0); $cv = (int) ($st->cv ?? 0); $s = (int) ($st->s ?? 0);
            [$label, $count] = $this->resultFor($p->objective, (object) ['i' => $i, 'c' => $c, 'cv' => $cv]);

            $thumb = $p->video?->thumbnail_url;
            if ($thumb) { $thumb = Storage::disk($disk)->url($thumb); }

            return [
                'id'                    => $p->id,
                'campaign_id'           => $camp?->id,
                'cam_id'                => $camp ? 'CAM-' . str_pad((string) $camp->id, 6, '0', STR_PAD_LEFT) : null,
                'name'                  => $p->video?->title ?: ('Promotion #' . $p->id),
                'objective'             => $p->objective,
                'objective_label'       => $this->objLabel($p->objective),
                'status'                => $p->status,
                'delivery'              => $this->deliveryLabel($p->status),
                'thumbnail_url'         => $thumb,
                'result_label'          => $label,
                'result_count'          => $count,
                'reach'                 => $r > 0 ? $r : ($i > 0 ? (int) round($i / 1.4) : 0),
                'impressions'           => $i,
                'clicks'                => $c,
                'conversions'           => $cv,
                'ctr'                   => $i > 0 ? round($c / $i * 100, 2) : 0,
                'spent_cents'           => $s,
                'cost_per_result_cents' => $count > 0 ? round($s / $count, 2) : 0,
                'currency'              => $p->currency ?: $account->currency,
                'created_at'            => optional($p->created_at)->toIso8601String(),
            ];
        });

        // Status breakdown for the donut.
        $statusCounts = $promotions->groupBy('status')->map->count();
        $group = fn (array $keys) => $promotions->whereIn('status', $keys)->count();

        // Blended cost-per-result: prefer conversions, fall back to clicks.
        $curCpr  = $this->costPerResult($cur);
        $prevCpr = $this->costPerResult($prev);

        return response()->json(['success' => true, 'data' => [
            'range' => ['from' => $from, 'to' => $to, 'days' => $days,
                        'prev_from' => $prevFrom, 'prev_to' => $prevTo],
            'currency' => $account->currency,
            'tiles' => [
                'spend_cents'           => $this->tile((int) $cur->s, (int) $prev->s),
                'impressions'           => $this->tile((int) $cur->i, (int) $prev->i),
                'clicks'                => $this->tile((int) $cur->c, (int) $prev->c),
                'ctr'                   => $this->tile(
                    $cur->i > 0 ? round($cur->c / $cur->i * 100, 2) : 0,
                    $prev->i > 0 ? round($prev->c / $prev->i * 100, 2) : 0,
                ),
                'conversions'           => $this->tile((int) $cur->cv, (int) $prev->cv),
                'cost_per_result_cents' => $this->tile($curCpr, $prevCpr, invert: true),
            ],
            'series'           => $this->dashboardSeries($campaignIds, $from, $to),
            'status_breakdown' => [
                'active'    => (int) ($statusCounts['active'] ?? 0),
                'paused'    => (int) ($statusCounts['paused'] ?? 0),
                'completed' => (int) ($statusCounts['completed'] ?? 0),
                'in_review' => $group(['pending_review', 'changes_requested']),
                'draft'     => (int) ($statusCounts['draft'] ?? 0),
                'rejected'  => (int) ($statusCounts['rejected'] ?? 0),
                'total'     => $promotions->count(),
            ],
            'top_campaigns'    => $rows->sortByDesc('spent_cents')->take(5)->values()->all(),
            'recent_campaigns' => $rows->take(8)->values()->all(),
            'placements'       => $this->placementBreakdown($campaignIds, $from, $to),
            'account'          => [
                // Real spendable balance from the ledger (money in − out), not the
                // raw balance_cents column that campaign approval inflates.
                'balance_cents'          => max(0, (int) AdLedgerEntry::where('ad_account_id', $account->id)->sum('amount_cents')),
                'lifetime_spent_cents'   => (int) $account->lifetime_spent_cents,
                'spent_this_month_cents' => (int) ($this->totals($campaignIds, now()->startOfMonth()->toDateString(), $to)->s ?? 0),
                'currency'               => $account->currency,
            ],
        ]]);
    }

    /** GET /studio/ad-campaigns/{id}/insights — one campaign's totals + series + per-creative. */
    public function campaign(Request $request, int $id): JsonResponse
    {
        $account  = $this->accounts->forUser($request->user()->id);
        $campaign = AdCampaign::where('ad_account_id', $account->id)->findOrFail($id);
        $since    = now()->subDays(30)->toDateString();

        $agg = AdStatDaily::where('campaign_id', $campaign->id)
            ->where('stat_date', '>=', $since)
            ->selectRaw('coalesce(sum(impressions),0) impressions, coalesce(sum(reach),0) reach, coalesce(sum(clicks),0) clicks, coalesce(sum(conversions),0) conversions, coalesce(sum(spend_cents),0) spend_cents')
            ->first();

        $impr = (int) $agg->impressions;
        $clk  = (int) $agg->clicks;

        $byCreative = AdStatDaily::where('campaign_id', $campaign->id)
            ->where('creative_id', '>', 0)
            ->selectRaw('creative_id, sum(impressions) impressions, sum(clicks) clicks')
            ->groupBy('creative_id')
            ->get();

        return response()->json(['success' => true, 'data' => [
            'campaign'    => $campaign,
            'totals'      => [
                'impressions' => $impr,
                'reach'       => (int) $agg->reach,
                'clicks'      => $clk,
                'conversions' => (int) $agg->conversions,
                'spend_cents' => (int) $agg->spend_cents,
                'ctr'         => $impr > 0 ? round($clk / $impr * 100, 2) : 0,
            ],
            'series'      => $this->series([$campaign->id], $since),
            'by_creative' => $byCreative,
        ]]);
    }

    /** @param int[] $campaignIds */
    private function series(array $campaignIds, string $since): array
    {
        if (! $campaignIds) {
            return [];
        }

        return AdStatDaily::whereIn('campaign_id', $campaignIds)
            ->where('stat_date', '>=', $since)
            ->selectRaw('stat_date, sum(impressions) impressions, sum(clicks) clicks, sum(spend_cents) spend_cents')
            ->groupBy('stat_date')
            ->orderBy('stat_date')
            ->get()
            ->all();
    }

    /* ─────────────────── Dashboard helpers ─────────────────── */

    /** Parse ?from/?to (YYYY-MM-DD), clamped/defaulted to a sane last-7-days window. */
    private function resolveRange(Request $request): array
    {
        $to   = $request->query('to');
        $from = $request->query('from');

        try {
            $toDate   = $to ? Carbon::parse($to)->startOfDay() : now()->startOfDay();
        } catch (\Throwable) { $toDate = now()->startOfDay(); }
        try {
            $fromDate = $from ? Carbon::parse($from)->startOfDay() : $toDate->copy()->subDays(6);
        } catch (\Throwable) { $fromDate = $toDate->copy()->subDays(6); }

        if ($fromDate->gt($toDate)) { [$fromDate, $toDate] = [$toDate, $fromDate]; }
        // Cap the window so a hostile range can't scan the whole table.
        if ($fromDate->lt($toDate->copy()->subDays(365))) { $fromDate = $toDate->copy()->subDays(365); }

        $days = $fromDate->diffInDays($toDate) + 1; // inclusive
        return [$fromDate->toDateString(), $toDate->toDateString(), (int) $days];
    }

    /** Account-wide summed metrics over [from,to] as an object with i/r/c/cv/s. */
    private function totals(array $campaignIds, string $from, string $to): object
    {
        if (! $campaignIds) {
            return (object) ['i' => 0, 'r' => 0, 'c' => 0, 'cv' => 0, 's' => 0];
        }

        return AdStatDaily::whereIn('campaign_id', $campaignIds)
            ->whereBetween('stat_date', [$from, $to])
            ->selectRaw('coalesce(sum(impressions),0) i, coalesce(sum(reach),0) r, coalesce(sum(clicks),0) c, coalesce(sum(conversions),0) cv, coalesce(sum(spend_cents),0) s')
            ->first();
    }

    /** Per-campaign summed metrics over [from,to], keyed by campaign_id. */
    private function statsByCampaign(array $campaignIds, string $from, string $to)
    {
        if (! $campaignIds) {
            return collect();
        }

        return AdStatDaily::whereIn('campaign_id', $campaignIds)
            ->whereBetween('stat_date', [$from, $to])
            ->selectRaw('campaign_id, sum(impressions) i, sum(reach) r, sum(clicks) c, sum(conversions) cv, sum(spend_cents) s')
            ->groupBy('campaign_id')
            ->get()
            ->keyBy('campaign_id');
    }

    /** Daily series (spend / clicks / conversions) over [from,to], zero-filled. */
    private function dashboardSeries(array $campaignIds, string $from, string $to): array
    {
        $byDate = collect();
        if ($campaignIds) {
            $byDate = AdStatDaily::whereIn('campaign_id', $campaignIds)
                ->whereBetween('stat_date', [$from, $to])
                ->selectRaw('stat_date, sum(clicks) clicks, sum(conversions) conversions, sum(spend_cents) spend_cents')
                ->groupBy('stat_date')
                ->get()
                ->keyBy(fn ($r) => (string) $r->stat_date);
        }

        // Emit a point for every day in the window so the chart has an even x-axis.
        $out    = [];
        $cursor = Carbon::parse($from);
        $end    = Carbon::parse($to);
        while ($cursor->lte($end)) {
            $d   = $cursor->toDateString();
            $row = $byDate->get($d);
            $out[] = [
                'date'        => $d,
                'spend_cents' => (int) ($row->spend_cents ?? 0),
                'clicks'      => (int) ($row->clicks ?? 0),
                'conversions' => (int) ($row->conversions ?? 0),
            ];
            $cursor->addDay();
        }

        return $out;
    }

    /** Spend grouped by placement over [from,to]. */
    private function placementBreakdown(array $campaignIds, string $from, string $to): array
    {
        if (! $campaignIds) {
            return [];
        }

        return AdStatDaily::whereIn('campaign_id', $campaignIds)
            ->whereBetween('stat_date', [$from, $to])
            ->where('placement', '!=', '')
            ->selectRaw("placement, sum(impressions) impressions, sum(clicks) clicks, sum(spend_cents) spend_cents")
            ->groupBy('placement')
            ->orderByRaw('sum(spend_cents) desc')
            ->get()
            ->map(fn ($r) => [
                'placement'   => $r->placement,
                'impressions' => (int) $r->impressions,
                'clicks'      => (int) $r->clicks,
                'spend_cents' => (int) $r->spend_cents,
            ])->all();
    }

    /** Blended cost-per-result (cents): spend / conversions, falling back to clicks. */
    private function costPerResult(object $t): float
    {
        $s = (int) $t->s;
        if ((int) $t->cv > 0) { return round($s / (int) $t->cv, 2); }
        if ((int) $t->c > 0)  { return round($s / (int) $t->c, 2); }
        return 0;
    }

    /**
     * Tile payload: current value, previous-window value, and % change.
     * `invert` flips the "good direction" for cost metrics (a drop is positive).
     */
    private function tile(float|int $value, float|int $prev, bool $invert = false): array
    {
        $delta = $prev > 0 ? round(($value - $prev) / $prev * 100, 1) : ($value > 0 ? 100.0 : 0.0);
        return [
            'value'     => $value,
            'prev'      => $prev,
            'delta_pct' => $delta,
            'positive'  => $invert ? $delta <= 0 : $delta >= 0,
        ];
    }

    /** Objective → advertiser-facing label (mirrors StudioPromotionController). */
    private function objLabel(string $objective): string
    {
        return [
            'more_views'          => 'Video views',
            'more_followers'      => 'Followers',
            'more_profile_visits' => 'Profile visits',
            'more_engagement'     => 'Engagement',
        ][$objective] ?? ucfirst(str_replace('_', ' ', $objective));
    }

    /** Objective → [result label, count] from rolled-up stats (mirrors StudioPromotionController). */
    private function resultFor(string $objective, $st): array
    {
        $i = (int) ($st->i ?? 0); $c = (int) ($st->c ?? 0); $cv = (int) ($st->cv ?? 0);
        return match ($objective) {
            'more_engagement'      => ['Engagements', $c],
            'more_profile_visits'  => ['Profile visits', $c],
            'more_followers'       => ['Followers', $cv],
            default                => ['ThruPlays', $i],
        };
    }

    /** Promotion status → delivery label (mirrors StudioPromotionController). */
    private function deliveryLabel(string $status): string
    {
        return match ($status) {
            'active'             => 'Active',
            'paused'            => 'Off',
            'completed'         => 'Completed',
            'pending_review'    => 'In review',
            'rejected'          => 'Rejected',
            'changes_requested' => 'Needs changes',
            default             => 'Off',
        };
    }
}
