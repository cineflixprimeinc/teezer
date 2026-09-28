<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdAccount;
use App\Models\AdCampaign;
use App\Models\AdCreative;
use App\Models\AdFraudEvent;
use App\Models\AdPlacement;
use App\Models\AdReview;
use App\Models\AdStatDaily;
use App\Models\AdminActionLog;
use App\Models\AppSetting;
use App\Models\Promotion;
use App\Models\Video;
use App\Http\Resources\VideoResource;
use App\Mail\AdminActionMail;
use App\Services\NotificationService;
use App\Services\StorageService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Storage;

/**
 * Reelsoo Ads — admin management (Ads Management panel). Behind api.admin
 * (admin role + mandatory 2FA). Moderation, advertisers, fraud, placements, settings.
 */
class AdminAdController extends Controller
{
    /** Typed ads settings (stored in the app_settings KV under group=ads). */
    private const SETTINGS = [
        'ads_enabled'                => ['type' => 'boolean', 'default' => false],
        'ads_review_mode'            => ['type' => 'string',  'default' => 'manual'], // manual | auto
        'ads_default_cpm_cents'      => ['type' => 'integer', 'default' => 200],
        'ads_floor_cpm_cents'        => ['type' => 'integer', 'default' => 50],
        'ads_min_daily_budget_cents' => ['type' => 'integer', 'default' => 100],
        'ads_freqcap_session'        => ['type' => 'integer', 'default' => 3],
        'ads_freqcap_day'            => ['type' => 'integer', 'default' => 8],
        'ads_infeed_first_slot'      => ['type' => 'integer', 'default' => 4],
        'ads_infeed_cadence'         => ['type' => 'integer', 'default' => 6],
        'ads_revenue_share_pct'      => ['type' => 'integer', 'default' => 50],
    ];

    /* ── Overview dashboard (real data) ───────────────────────────────────── */
    public function overview(): JsonResponse
    {
        $byStatus = AdCampaign::selectRaw('status, count(*) as c')->groupBy('status')->pluck('c', 'status');
        $campaignsTotal = (int) AdCampaign::count();
        $advertisers    = (int) AdAccount::count();
        $activeAds      = (int) AdCreative::where('review_status', 'approved')->count();
        $pending        = (int) ($byStatus['pending_review'] ?? 0);
        $rejected       = (int) ($byStatus['rejected'] ?? 0);

        // 30-day totals for the headline tile values.
        $t30 = AdStatDaily::where('stat_date', '>=', now()->subDays(30)->toDateString())
            ->selectRaw('coalesce(sum(impressions),0) i, coalesce(sum(clicks),0) c, coalesce(sum(spend_cents),0) s')
            ->first();

        // Sparklines (14-day daily series) from real rollups / created rows.
        $imprS  = $this->statSeries('impressions', 14);
        $clickS = $this->statSeries('clicks', 14);
        $revS   = $this->statSeries('spend_cents', 14);
        $campS  = $this->createdSeries(AdCampaign::query(), 14);
        $advS   = $this->createdSeries(AdAccount::query(), 14);
        $pendS  = $this->createdSeries(AdCampaign::where('status', 'pending_review'), 14);
        $rejS   = $this->createdSeries(AdCampaign::where('status', 'rejected'), 14);
        $actS   = $this->createdSeries(AdCampaign::where('status', 'active'), 14);

        return response()->json(['success' => true, 'data' => [
            'stats' => [
                'campaigns'      => ['value' => $campaignsTotal, 'growth' => $this->halfGrowth($campS), 'spark' => $campS],
                'active_ads'     => ['value' => $activeAds,      'growth' => $this->halfGrowth($actS),  'spark' => $actS],
                'pending_review' => ['value' => $pending,        'growth' => $this->halfGrowth($pendS), 'spark' => $pendS],
                'rejected'       => ['value' => $rejected,       'growth' => $this->halfGrowth($rejS),  'spark' => $rejS],
                'advertisers'    => ['value' => $advertisers,    'growth' => $this->halfGrowth($advS),  'spark' => $advS],
                'impressions'    => ['value' => (int) $t30->i,   'growth' => $this->halfGrowth($imprS), 'spark' => $imprS],
                'clicks'         => ['value' => (int) $t30->c,   'growth' => $this->halfGrowth($clickS),'spark' => $clickS],
                'revenue_cents'  => ['value' => (int) $t30->s,   'growth' => $this->halfGrowth($revS),  'spark' => $revS],
            ],
            'campaign_status'       => $this->campaignStatus($byStatus, $campaignsTotal),
            'campaign_status_total' => $campaignsTotal,
            'placements'            => $this->placementsPerformance(),
            'approval_queue'        => [
                'count'              => $pending,
                'avg_review_minutes' => (int) round((float) AdCampaign::whereNotNull('reviewed_at')->whereNotNull('submitted_at')
                    ->selectRaw('avg(extract(epoch from (reviewed_at - submitted_at)) / 60) m')->value('m') ?? 0),
            ],
            'moderation'       => $this->moderationAlerts(),
            'top_advertisers'  => $this->topAdvertisers(),
            'top_campaigns'    => $this->topCampaigns(),
            'recent_activities'=> $this->recentActivities(),
            'recent_drafts'    => $this->recentDrafts(),
        ]]);
    }

    /* ── Performance time-series (impressions / clicks / CTR / spend) ──────── */
    public function performance(Request $request): JsonResponse
    {
        $days = $this->rangeDays($request->input('range'));
        $rows = AdStatDaily::where('stat_date', '>=', now()->subDays($days - 1)->toDateString())
            ->selectRaw('stat_date, sum(impressions) impr, sum(clicks) clk, sum(spend_cents) spend')
            ->groupBy('stat_date')->get()->keyBy(fn ($r) => (string) $r->stat_date);

        $labels = $impr = $clk = $ctr = $spend = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $d = now()->subDays($i);
            $key = $d->toDateString();
            $r = $rows->get($key);
            $imprV = (int) ($r->impr ?? 0);
            $clkV  = (int) ($r->clk ?? 0);
            $labels[] = $d->format('M j');
            $impr[]   = $imprV;
            $clk[]    = $clkV;
            $ctr[]    = $imprV > 0 ? round($clkV / $imprV * 100, 2) : 0;
            $spend[]  = round((int) ($r->spend ?? 0) / 100, 2);
        }

        return response()->json(['success' => true, 'data' => compact('labels', 'impr', 'clk', 'ctr', 'spend')]);
    }

    /* ── Revenue bars + period totals (spend = platform gross ad revenue) ──── */
    public function revenue(Request $request): JsonResponse
    {
        $days = $this->rangeDays($request->input('range'));
        $series = $this->statSeries('spend_cents', $days); // oldest → newest, cents
        $labels = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $labels[] = now()->subDays($i)->format('M j');
        }

        $sum = fn ($from) => (int) AdStatDaily::where('stat_date', '>=', $from)->sum('spend_cents');
        $today     = $sum(now()->toDateString());
        $yesterday = (int) AdStatDaily::where('stat_date', now()->subDay()->toDateString())->sum('spend_cents');

        return response()->json(['success' => true, 'data' => [
            'labels'     => $labels,
            'bars'       => array_map(fn ($c) => round($c / 100, 2), $series),
            'today'      => round($today / 100, 2),
            'yesterday'  => round($yesterday / 100, 2),
            'this_week'  => round($sum(now()->subDays(6)->toDateString()) / 100, 2),
            'this_month' => round($sum(now()->subDays(29)->toDateString()) / 100, 2),
            'growth'     => $yesterday > 0 ? round(($today - $yesterday) / $yesterday * 100, 1) : ($today > 0 ? 100.0 : 0.0),
        ]]);
    }

    /* ── Overview helpers ─────────────────────────────────────────────────── */

    private function rangeDays(?string $range): int
    {
        return match ($range) { '7d' => 7, '90d' => 90, default => 30 };
    }

    /** Daily series of a summed ad_stats_daily column, zero-filled, oldest → newest. */
    private function statSeries(string $col, int $days): array
    {
        $rows = AdStatDaily::where('stat_date', '>=', now()->subDays($days - 1)->toDateString())
            ->selectRaw("stat_date, sum({$col}) v")->groupBy('stat_date')->pluck('v', 'stat_date');
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $out[] = (int) ($rows[now()->subDays($i)->toDateString()] ?? 0);
        }
        return $out;
    }

    /** Daily created-row counts for a query, zero-filled, oldest → newest. */
    private function createdSeries($query, int $days): array
    {
        $rows = (clone $query)->where('created_at', '>=', now()->subDays($days - 1)->startOfDay())
            ->selectRaw('date(created_at) d, count(*) c')->groupBy('d')->pluck('c', 'd');
        $out = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $out[] = (int) ($rows[now()->subDays($i)->toDateString()] ?? 0);
        }
        return $out;
    }

    /** Growth % = recent half vs previous half of a series. */
    private function halfGrowth(array $s): float
    {
        $n = count($s);
        if ($n < 2) return 0.0;
        $h = intdiv($n, 2);
        $prev = array_sum(array_slice($s, 0, $h));
        $cur  = array_sum(array_slice($s, $h));
        if ($prev <= 0) return $cur > 0 ? 100.0 : 0.0;
        return round(($cur - $prev) / $prev * 100, 1);
    }

    private function campaignStatus($byStatus, int $total): array
    {
        $meta = [
            'active'         => ['Active', '#22c55e'],
            'paused'         => ['Paused', '#f59e0b'],
            'draft'          => ['Draft', '#3b82f6'],
            'pending_review' => ['Pending', '#a855f7'],
            'rejected'       => ['Rejected', '#ef4444'],
            'completed'      => ['Completed', '#94a3b8'],
        ];
        $t = max(1, $total);
        $out = [];
        foreach ($meta as $key => [$label, $color]) {
            $v = (int) ($byStatus[$key] ?? 0);
            $out[] = ['key' => $key, 'label' => $label, 'color' => $color, 'value' => $v, 'pct' => round($v / $t * 100, 1)];
        }
        return $out;
    }

    private function placementsPerformance(): array
    {
        $rows = AdStatDaily::where('stat_date', '>=', now()->subDays(30)->toDateString())
            ->where('placement', '!=', '')
            ->selectRaw('placement, sum(impressions) i')->groupBy('placement')->pluck('i', 'placement');
        $total = max(1, (int) $rows->sum());
        $labels = [
            'in_feed'      => 'Feed',
            'explore'      => 'Explore',
            'inbox'        => 'Inbox',
            'search'       => 'Search',
            'hashtag'      => 'Hashtags',
            'profile_top'  => 'Creator Profile',
        ];
        $out = [];
        foreach ($labels as $key => $label) {
            $out[] = ['key' => $key, 'label' => $label, 'pct' => (int) round((int) ($rows[$key] ?? 0) / $total * 100)];
        }
        return $out;
    }

    private function moderationAlerts(): array
    {
        $count = fn (string $flag) => (int) AdReview::where('created_at', '>=', now()->subDays(30))
            ->whereJsonContains('policy_flags', $flag)->count();
        return [
            'adult'     => $count('adult'),
            'copyright' => $count('copyright'),
            'policy'    => $count('policy'),
        ];
    }

    private function topAdvertisers(): array
    {
        return AdAccount::withCount('campaigns')->orderByDesc('lifetime_spent_cents')->take(5)->get()
            ->map(fn ($a) => [
                'name'        => $a->name ?: ('Account #' . $a->id),
                'spend_cents' => (int) $a->lifetime_spent_cents,
                'campaigns'   => (int) $a->campaigns_count,
                'status'      => $a->status ?: 'active',
            ])->all();
    }

    private function topCampaigns(): array
    {
        $stats = AdStatDaily::selectRaw('campaign_id, sum(impressions) i, sum(clicks) c, sum(conversions) cv, sum(spend_cents) s')
            ->groupBy('campaign_id')->get()->keyBy('campaign_id');

        return AdCampaign::orderByDesc('spent_cents')->take(5)->get()->map(function ($c) use ($stats) {
            $st = $stats->get($c->id);
            $impr = (int) ($st->i ?? 0);
            $clk  = (int) ($st->c ?? 0);
            $video = AdCreative::whereHas('group', fn ($q) => $q->where('campaign_id', $c->id))
                ->whereNotNull('video_id')->first();
            $views = $video ? (int) (\App\Models\Video::where('id', $video->video_id)->value('views_count') ?? 0) : 0;
            return [
                'name'         => $c->name,
                'ctr'          => $impr > 0 ? round($clk / $impr * 100, 2) : 0,
                'views'        => $views,
                'conversions'  => (int) ($st->cv ?? 0),
                'revenue_cents'=> (int) ($st->s ?? $c->spent_cents),
            ];
        })->all();
    }

    private function recentActivities(): array
    {
        return AdminActionLog::where(function ($q) {
                $q->where('action', 'ilike', '%ad%')
                  ->orWhere('action', 'ilike', '%campaign%')
                  ->orWhere('category', 'ads')
                  ->orWhere('target_type', 'ilike', '%campaign%');
            })
            ->orderByDesc('created_at')->take(6)->get()
            ->map(fn ($l) => [
                'text'     => $l->description ?: $l->action,
                'severity' => $l->severity ?: 'info',
                'at'       => optional($l->created_at)->toIso8601String(),
            ])->all();
    }

    private function recentDrafts(): array
    {
        return AdCampaign::with(['account.user:id,username,name', 'groups:id,campaign_id,placements'])
            ->where('status', 'draft')->orderByDesc('created_at')->take(5)->get()
            ->map(function ($c) {
                $placements = optional($c->groups->first())->placements ?: ['in_feed'];
                return [
                    'campaign'   => $c->name,
                    'advertiser' => optional(optional($c->account)->user)->name
                        ?? optional($c->account)->name ?? '—',
                    'placement'  => is_array($placements) ? implode(', ', array_map(fn ($p) => ucwords(str_replace('_', ' ', $p)), $placements)) : (string) $placements,
                    'budget_cents' => (int) $c->daily_budget_cents,
                    'created_at' => optional($c->created_at)->toIso8601String(),
                ];
            })->all();
    }

    /* ── Campaigns listing ────────────────────────────────────────────────── */

    /** Tile counts + 30-day growth for the Campaigns header. */
    public function campaignsSummary(): JsonResponse
    {
        $spend30    = (int) AdStatDaily::where('stat_date', '>=', now()->subDays(30)->toDateString())->sum('spend_cents');
        $spendPrior = (int) AdStatDaily::whereBetween('stat_date', [now()->subDays(60)->toDateString(), now()->subDays(31)->toDateString()])->sum('spend_cents');

        return response()->json(['success' => true, 'data' => [
            'total'             => ['value' => (int) AdCampaign::count(), 'growth' => $this->countGrowth(AdCampaign::query())],
            'active'            => ['value' => (int) AdCampaign::where('status', 'active')->count(), 'growth' => $this->countGrowth(AdCampaign::where('status', 'active'))],
            'draft'             => ['value' => (int) AdCampaign::where('status', 'draft')->count(), 'growth' => $this->countGrowth(AdCampaign::where('status', 'draft'))],
            'completed'         => ['value' => (int) AdCampaign::where('status', 'completed')->count(), 'growth' => $this->countGrowth(AdCampaign::where('status', 'completed'))],
            'total_spent_cents' => ['value' => (int) AdCampaign::sum('spent_cents'), 'growth' => $spendPrior > 0 ? round(($spend30 - $spendPrior) / $spendPrior * 100, 1) : ($spend30 > 0 ? 100.0 : 0.0)],
        ]]);
    }

    public function campaigns(Request $request): JsonResponse
    {
        $q = AdCampaign::with(['account.user:id,username,name,avatar,is_verified', 'groups:id,campaign_id'])
            ->withCount('groups');

        if (($status = $request->input('status')) && $status !== 'all') {
            $q->where('status', $status);
        }
        if (($objective = $request->input('objective')) && $objective !== 'all') {
            $q->where('objective', $objective);
        }
        if ($search = trim((string) $request->input('search'))) {
            $q->where(function ($w) use ($search) {
                $w->where('name', 'ilike', "%{$search}%")
                  ->orWhereHas('account.user', fn ($u) => $u->where('username', 'ilike', "%{$search}%")->orWhere('name', 'ilike', "%{$search}%"));
            });
        }

        $campaigns = $q->orderByDesc('created_at')->paginate((int) $request->input('per_page', 10));

        // Batch: ads (creatives) count per campaign.
        $ids = collect($campaigns->items())->pluck('id');
        $adsCount = $ids->isEmpty() ? collect() : AdCreative::join('ad_groups', 'ad_creatives.ad_group_id', '=', 'ad_groups.id')
            ->whereIn('ad_groups.campaign_id', $ids)
            ->selectRaw('ad_groups.campaign_id cid, count(*) c')->groupBy('ad_groups.campaign_id')->pluck('c', 'cid');

        $rows = collect($campaigns->items())->map(function ($c) use ($request, $adsCount) {
            $user  = optional($c->account)->user;
            $total = (int) $c->total_budget_cents;
            $spent = (int) $c->spent_cents;

            $creative = AdCreative::whereHas('group', fn ($g) => $g->where('campaign_id', $c->id))->first();
            $thumb = null;
            if ($creative && $creative->video_id) {
                $v = Video::find($creative->video_id);
                if ($v) $thumb = (new VideoResource($v))->resolve($request)['thumbnail_url'] ?? null;
            }
            $thumb = $thumb ?: ($creative?->thumbnail_url ?: $creative?->media_url);

            return [
                'id'                 => $c->id,
                'cam_id'             => 'CAM-' . str_pad((string) $c->id, 6, '0', STR_PAD_LEFT),
                // Same Ad ID shown in Approvals + User 360, so an ad is identified by
                // one number everywhere (rather than the "Promotion #17" name).
                'ad_id'              => 'AD-' . str_pad((string) $c->id, 6, '0', STR_PAD_LEFT),
                'name'               => $c->name,
                'status'             => $c->status,
                'objective'          => $c->objective,
                'daily_budget_cents' => (int) $c->daily_budget_cents,
                'total_budget_cents' => $total,
                'spent_cents'        => $spent,
                'spent_pct'          => $total > 0 ? min(100, (int) round($spent / $total * 100)) : ($spent > 0 ? 100 : 0),
                'currency'           => $c->currency ?: 'USD',
                'ad_groups'          => (int) $c->groups_count,
                'ads'                => (int) ($adsCount[$c->id] ?? 0),
                'advertiser'         => [
                    'name'        => $user->name ?? optional($c->account)->name ?? 'Advertiser',
                    'username'    => $user->username ?? null,
                    'avatar'      => $user && $user->avatar ? Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified' => (bool) ($user->is_verified ?? false),
                ],
                'start_at'           => optional($c->start_at)->toIso8601String(),
                'end_at'             => optional($c->end_at)->toIso8601String(),
                'created_at'         => optional($c->created_at)->toIso8601String(),
                'created_by'         => $user->name ?? optional($c->account)->name ?? 'Admin',
                'preview'            => ['thumbnail_url' => $thumb],
            ];
        })->all();

        return response()->json(['success' => true, 'data' => $rows, 'meta' => $this->page($campaigns)]);
    }

    /** created-in-last-N-days vs the prior N days, as a growth %. */
    private function countGrowth($query, int $days = 30): float
    {
        $recent = (int) (clone $query)->where('created_at', '>=', now()->subDays($days))->count();
        $prior  = (int) (clone $query)->whereBetween('created_at', [now()->subDays($days * 2), now()->subDays($days)])->count();
        if ($prior <= 0) return $recent > 0 ? 100.0 : 0.0;
        return round(($recent - $prior) / $prior * 100, 1);
    }

    /* ── Campaign lifecycle actions ───────────────────────────────────────── */
    public function pause(Request $request, int $id): JsonResponse   { return $this->transition($request, $id, 'paused', ['active'], 'Paused'); }
    public function resume(Request $request, int $id): JsonResponse  { return $this->transition($request, $id, 'active', ['paused'], 'Resumed'); }
    public function end(Request $request, int $id): JsonResponse     { return $this->transition($request, $id, 'completed', ['active', 'paused'], 'Ended'); }

    private function transition(Request $request, int $id, string $to, array $from, string $verb): JsonResponse
    {
        $campaign = AdCampaign::findOrFail($id);
        if (! in_array($campaign->status, $from, true)) {
            return response()->json(['success' => false, 'message' => "Campaign can't be {$verb} from its current state."], 422);
        }
        $campaign->update(['status' => $to]);
        if ($campaign->promotion_id) {
            $pMap = ['paused' => 'paused', 'active' => 'active', 'completed' => 'completed'];
            Promotion::where('id', $campaign->promotion_id)->update(['status' => $pMap[$to] ?? $to]);
        }
        if ($to === 'active') {
            $this->fundAccount($campaign->fresh());
        }
        // Pause/end must pull the ad from the pool; resume must add it back.
        $this->refreshPools();
        AdminActionLog::record(admin: $request->user(), action: "{$verb}_ad_campaign",
            description: "{$verb} ad campaign #{$campaign->id}", metadata: ['campaign_id' => $campaign->id]);

        // Tell the advertiser when an admin ends their campaign (pause/resume stay silent).
        if ($to === 'completed') {
            $this->notifyAdvertiser($campaign, 'ad_ended', 'Ad campaign ended',
                'Your ad campaign has been ended by our team and is no longer running.');
        }

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => "Campaign {$verb}."]);
    }

    /** Clone a campaign (+ groups + creatives) as a fresh draft. */
    public function duplicate(Request $request, int $id): JsonResponse
    {
        $c = AdCampaign::with('groups.creatives')->findOrFail($id);

        $new = DB::transaction(function () use ($c) {
            $new = $c->replicate(['spent_cents', 'submitted_at', 'reviewed_at', 'reviewed_by', 'rejection_reason', 'promotion_id']);
            $new->name        = mb_substr($c->name . ' (Copy)', 0, 200);
            $new->status      = 'draft';
            $new->spent_cents = 0;
            $new->promotion_id = null;
            $new->save();

            foreach ($c->groups as $g) {
                $ng = $g->replicate();
                $ng->campaign_id = $new->id;
                $ng->save();
                foreach ($g->creatives as $cr) {
                    $ncr = $cr->replicate(['review_status']);
                    $ncr->ad_group_id   = $ng->id;
                    $ncr->review_status = 'pending';
                    $ncr->save();
                }
            }
            return $new;
        });

        AdminActionLog::record(admin: $request->user(), action: 'duplicate_ad_campaign',
            description: "Duplicated ad campaign #{$c->id} → #{$new->id}", metadata: ['from' => $c->id, 'to' => $new->id]);

        return response()->json(['success' => true, 'data' => ['id' => $new->id], 'message' => 'Campaign duplicated as a draft.']);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $campaign = AdCampaign::findOrFail($id);
        $promotionId = $campaign->promotion_id;

        DB::transaction(function () use ($campaign, $promotionId) {
            $campaign->delete(); // FK cascade removes groups + creatives
            // Also remove the advertiser's underlying promotion so the deleted ad
            // disappears from their Studio → Ads page (it lists promotions, not
            // campaigns). Without this the ad kept showing after admin deletion.
            if ($promotionId) {
                Promotion::where('id', $promotionId)->delete();
            }
        });

        $this->refreshPools();

        AdminActionLog::record(admin: $request->user(), action: 'delete_ad_campaign',
            description: "Deleted ad campaign #{$id}", metadata: ['campaign_id' => $id, 'promotion_id' => $promotionId]);
        return response()->json(['success' => true, 'message' => 'Campaign deleted.']);
    }

    public function campaign(int $id): JsonResponse
    {
        $campaign = AdCampaign::with(['account.user:id,username,name,avatar', 'groups.creatives', 'promotion'])
            ->findOrFail($id);

        return response()->json(['success' => true, 'data' => $campaign]);
    }

    /** Full Ad Details view: creative, targeting, review history, policy, neighbours. */
    public function campaignDetail(Request $request, int $id): JsonResponse
    {
        $c = AdCampaign::with([
            'account.user:id,username,name,avatar,is_verified,email',
            'groups.creatives', 'promotion',
        ])->findOrFail($id);

        $group     = $c->groups->first();
        $creative  = optional($group)->creatives->first();
        $targeting = (array) (optional($group)->targeting ?: []);
        $promotion = $c->promotion;
        $user      = optional($c->account)->user;
        $placements = collect($c->groups)->flatMap(fn ($g) => (array) $g->placements)->unique()->values()->all();

        // Boosted video → player URL, poster, hashtags, duration.
        $videoUrl = null; $thumb = $creative?->thumbnail_url ?: $creative?->media_url;
        $hashtags = []; $duration = $creative?->duration; $lang = null;
        if ($creative && $creative->video_id) {
            $v = Video::find($creative->video_id);
            if ($v) {
                $arr = (new VideoResource($v))->resolve($request);
                $videoUrl = $arr['video_url'] ?? null;
                $thumb    = $arr['thumbnail_url'] ?? $thumb;
                $hashtags = $arr['hashtags'] ?? [];
                $duration = $duration ?: $v->duration;
                $lang     = $v->language ?? null;
            }
        }

        // Targeting → readable countries / age / gender / devices / interests.
        $countries = collect($targeting['countries'] ?? ($promotion && $promotion->country ? [$promotion->country] : []))
            ->map(fn ($cc) => strlen((string) $cc) === 2 ? \App\Services\IsoCountries::nameFor(strtoupper($cc)) : (string) $cc)
            ->filter()->values()->all();
        $ageMin = $targeting['age_min'] ?? null; $ageMax = $targeting['age_max'] ?? null;
        $ageRange = $promotion->age_range ?? ($ageMin || $ageMax ? trim(($ageMin ?? 13) . ' - ' . ($ageMax ?? '65+')) : 'All ages');
        $genders  = $targeting['genders'] ?? ($promotion && $promotion->gender && $promotion->gender !== 'all' ? [$promotion->gender] : []);
        $interests = $targeting['interests'] ?? ($promotion->interests ?? []);

        // Review history + activity log.
        $reviews = AdReview::where('subject_type', 'campaign')->where('subject_id', $c->id)
            ->with('reviewer:id,name')->orderByDesc('created_at')->get()
            ->map(fn ($r) => [
                'decision'    => $r->decision,
                'reason'      => $r->reason,
                'reviewer'    => optional($r->reviewer)->name,
                'policy_flags'=> $r->policy_flags ?? [],
                'at'          => optional($r->created_at)->toIso8601String(),
            ])->all();
        $activity = AdminActionLog::where('action', 'ilike', '%ad_campaign%')
            ->where(fn ($q) => $q->where('target_id', $c->id)->orWhereJsonContains('metadata->campaign_id', $c->id))
            ->orderByDesc('created_at')->take(20)->get()
            ->map(fn ($l) => ['text' => $l->description ?: $l->action, 'at' => optional($l->created_at)->toIso8601String()])->all();

        // Policy check (Pass unless a review flagged the category).
        $flags = collect($reviews)->flatMap(fn ($r) => $r['policy_flags'])->map(fn ($f) => strtolower((string) $f))->all();
        $has = fn (...$k) => count(array_intersect($k, $flags)) > 0;
        $policy = [
            ['label' => 'Community Guidelines', 'pass' => ! $has('community', 'adult', 'violence')],
            ['label' => 'Ad Content Policy',     'pass' => ! $has('policy', 'misleading')],
            ['label' => 'Copyright Policy',      'pass' => ! $has('copyright')],
            ['label' => 'Landing Page Safety',   'pass' => ! $has('landing', 'malware')],
        ];

        return response()->json(['success' => true, 'data' => [
            'id'               => $c->id,
            'ad_id'            => 'AD-' . str_pad((string) $c->id, 6, '0', STR_PAD_LEFT),
            'name'             => $c->name,
            'status'           => $c->status,
            'objective'        => $c->objective,
            'ad_format'        => ucfirst($creative->type ?? 'video'),
            'duration'         => $duration ? (int) $duration : null,
            'campaign_type'    => $c->promotion_id ? 'Promoted' : 'Managed',
            'bidding_strategy' => $c->bid_strategy ? ucwords(str_replace('_', ' ', $c->bid_strategy)) : 'Lowest Cost',
            'budget'           => [
                'daily_cents' => (int) $c->daily_budget_cents,
                'total_cents' => (int) $c->total_budget_cents,
                'currency'    => $c->currency ?: 'USD',
            ],
            'start_at'         => optional($c->start_at)->toIso8601String(),
            'end_at'           => optional($c->end_at)->toIso8601String(),
            'submitted_at'     => optional($c->submitted_at ?? $c->created_at)->toIso8601String(),
            'submitted_by'     => [
                'name'  => $user->name ?? optional($c->account)->name ?? '—',
                'email' => $user->email ?? optional($c->account)->contact_email ?? null,
            ],
            'advertiser'       => [
                'name'        => $user->name ?? optional($c->account)->name ?? 'Advertiser',
                'username'    => $user->username ?? null,
                'avatar'      => $user && $user->avatar ? Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
                'is_verified' => (bool) ($user->is_verified ?? false),
                'user_id'     => $user->id ?? null,
            ],
            'placements'       => $placements,
            'preview'          => ['video_url' => $videoUrl, 'thumbnail_url' => $thumb],
            'creative'         => [
                'headline'        => $creative?->headline,
                'body'            => $creative?->body,
                'cta_type'        => $creative?->cta_type,
                'destination_url' => $creative?->destination_url,
                'display_name'    => $creative?->display_name,
                'thumbnail_url'   => $thumb,
            ],
            'ad_info'          => [
                'ad_name'      => $c->name,
                'landing_page' => $creative?->destination_url,
                'caption'      => $creative?->headline,
                'description'  => $creative?->body,
                'cta_type'     => $creative?->cta_type,
                'hashtags'     => $hashtags,
                'language'     => $this->languageName($lang ?? null),
                'countries'    => $countries,
                'age_range'    => $ageRange,
                'gender'       => empty($genders) ? 'All' : ucfirst(implode(', ', $genders)),
                'devices'      => $targeting['devices'] ?? 'All Devices',
                'interests'    => array_values((array) $interests),
            ],
            'targeting'        => $targeting,
            'reviews'          => $reviews,
            'activity'         => $activity,
            'policy'           => $policy,
            'prev_id'          => AdCampaign::where('id', '<', $c->id)->max('id'),
            'next_id'          => AdCampaign::where('id', '>', $c->id)->min('id'),
        ]]);
    }

    private function languageName(?string $code): string
    {
        $map = ['en' => 'English', 'ne' => 'Nepali', 'hi' => 'Hindi', 'es' => 'Spanish', 'fr' => 'French', 'ar' => 'Arabic', 'zh' => 'Chinese', 'pt' => 'Portuguese', 'bn' => 'Bengali', 'ur' => 'Urdu'];
        $code = strtolower((string) ($code ?: 'en'));
        return $map[$code] ?? strtoupper($code);
    }

    /**
     * Fund the self-serve ad account so an approved campaign can actually deliver.
     * There's no external payment gateway wired, so admin approval IS the funding
     * event: top the account balance up to cover every active campaign's committed
     * budget. Idempotent and one-directional — it never lowers a balance, so it
     * won't erase real spend if a campaign is re-approved later.
     */
    private function fundAccount(AdCampaign $campaign): void
    {
        if (! $campaign->ad_account_id) {
            return;
        }
        $account = AdAccount::find($campaign->ad_account_id);
        if (! $account) {
            return;
        }
        $committed = (int) AdCampaign::where('ad_account_id', $account->id)
            ->where('status', 'active')
            ->sum(DB::raw('GREATEST(total_budget_cents, daily_budget_cents)'));
        if ($committed > (int) $account->balance_cents) {
            $account->update(['balance_cents' => $committed]);
        }
    }

    /**
     * Rebuild the Redis eligibility pools immediately so approve / reject / pause /
     * resume / end take effect on the next request instead of waiting for the
     * 5-minute cron. Best-effort — a Redis hiccup must never fail the admin action.
     */
    private function refreshPools(): void
    {
        try {
            app(\App\Services\Ads\EligibleAdPoolBuilder::class)->build();
        } catch (\Throwable $e) {
            report($e);
        }
    }

    /**
     * Tell the advertiser what happened to their ad — both an in-app system
     * notification and an email (with the reason on reject/ban). Best-effort per
     * channel so a mail/push failure never rolls back the admin decision. The
     * advertiser is reached through the campaign's ad account owner.
     */
    private function notifyAdvertiser(AdCampaign $campaign, string $actionType, string $actionLabel, string $description, ?string $reason = null): void
    {
        $user = $campaign->loadMissing('account.user')->account?->user;
        if (! $user) {
            return;
        }

        try {
            app(NotificationService::class)->notify($user, 'system', [
                'entity_type'   => 'ad_campaign',
                'entity_id'     => $campaign->id,
                'message'       => $reason ? "{$description} Reason: {$reason}" : $description,
                'action_status' => $actionType,
            ]);
        } catch (\Throwable $e) {
            report($e);
        }

        if (! $user->email) {
            return;
        }
        try {
            $first = $user->name ? explode(' ', trim($user->name))[0] : ($user->username ?: 'there');
            // Sent synchronously (there is no queue worker running): the queue driver
            // is 'database' with no consumer, so ->queue() would never deliver. This
            // matches the OTP mail path, which also sends inline.
            Mail::to($user->email)->send(new AdminActionMail(
                firstName:   $first,
                username:    $user->username ?: $first,
                actionType:  $actionType,
                actionLabel: $actionLabel,
                description: $description,
                adminNote:   $reason,
            ));
        } catch (\Throwable $e) {
            report($e);
        }
    }

    public function approve(Request $request, int $id): JsonResponse
    {
        $campaign = AdCampaign::findOrFail($id);

        if (! in_array($campaign->status, ['pending_review', 'rejected', 'paused', 'changes_requested'], true)) {
            return response()->json(['success' => false, 'message' => 'This campaign is not awaiting review.'], 422);
        }

        DB::transaction(function () use ($campaign, $request) {
            $campaign->update([
                'status'           => 'active',
                'reviewed_at'      => now(),
                'reviewed_by'      => $request->user()->id,
                'rejection_reason' => null,
            ]);
            AdCreative::whereHas('group', fn ($q) => $q->where('campaign_id', $campaign->id))
                ->update(['review_status' => 'approved']);
            if ($campaign->promotion_id) {
                Promotion::where('id', $campaign->promotion_id)->update(['status' => 'active', 'rejection_reason' => null]);
            }
            AdReview::create([
                'subject_type' => 'campaign',
                'subject_id'   => $campaign->id,
                'reviewer_id'  => $request->user()->id,
                'decision'     => 'approved',
            ]);
            $this->fundAccount($campaign);
        });

        $this->refreshPools();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'approve_ad_campaign',
            target: null,
            description: "Approved ad campaign #{$campaign->id}",
            metadata: ['campaign_id' => $campaign->id],
        );

        $this->notifyAdvertiser($campaign, 'ad_approved', 'Ad approved',
            'Good news — your ad has been approved and is now live on Teezer.');

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Campaign approved and set live.']);
    }

    public function reject(Request $request, int $id): JsonResponse
    {
        $data     = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $campaign = AdCampaign::findOrFail($id);

        DB::transaction(function () use ($campaign, $request, $data) {
            $campaign->update([
                'status'           => 'rejected',
                'reviewed_at'      => now(),
                'reviewed_by'      => $request->user()->id,
                'rejection_reason' => $data['reason'],
            ]);
            if ($campaign->promotion_id) {
                Promotion::where('id', $campaign->promotion_id)->update(['status' => 'rejected', 'rejection_reason' => $data['reason']]);
            }
            AdReview::create([
                'subject_type' => 'campaign',
                'subject_id'   => $campaign->id,
                'reviewer_id'  => $request->user()->id,
                'decision'     => 'rejected',
                'reason'       => $data['reason'],
            ]);
        });

        // A rejected campaign must stop delivering right away, even if it was live.
        $this->refreshPools();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'reject_ad_campaign',
            target: null,
            description: "Rejected ad campaign #{$campaign->id}",
            metadata: ['campaign_id' => $campaign->id, 'reason' => $data['reason']],
        );

        $this->notifyAdvertiser($campaign, 'ad_rejected', 'Ad rejected',
            'Your ad was reviewed and could not be approved. You can edit it and resubmit.', $data['reason']);

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Campaign rejected.']);
    }

    /**
     * Ban an ad for policy violation — a hard takedown. Unlike reject (which invites
     * a resubmit), a ban ends the campaign and tells the advertiser it broke policy.
     */
    public function ban(Request $request, int $id): JsonResponse
    {
        $data     = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $campaign = AdCampaign::findOrFail($id);

        DB::transaction(function () use ($campaign, $request, $data) {
            $campaign->update([
                'status'           => 'rejected',
                'reviewed_at'      => now(),
                'reviewed_by'      => $request->user()->id,
                'rejection_reason' => $data['reason'],
            ]);
            AdCreative::whereHas('group', fn ($q) => $q->where('campaign_id', $campaign->id))
                ->update(['review_status' => 'rejected']);
            if ($campaign->promotion_id) {
                Promotion::where('id', $campaign->promotion_id)->update(['status' => 'rejected', 'rejection_reason' => $data['reason']]);
            }
            AdReview::create([
                'subject_type' => 'campaign',
                'subject_id'   => $campaign->id,
                'reviewer_id'  => $request->user()->id,
                'decision'     => 'rejected',
                'reason'       => 'BANNED: ' . $data['reason'],
            ]);
        });

        $this->refreshPools();

        AdminActionLog::record(
            admin: $request->user(),
            action: 'ban_ad_campaign',
            target: null,
            description: "Banned ad campaign #{$campaign->id}",
            metadata: ['campaign_id' => $campaign->id, 'reason' => $data['reason']],
            severity: 'high',
        );

        $this->notifyAdvertiser($campaign, 'ad_banned', 'Ad removed for policy violation',
            'Your ad was removed for violating our advertising policies and can no longer run.', $data['reason']);

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Campaign banned.']);
    }

    /* ── Approvals (moderation review) ────────────────────────────────────── */

    /** Tab → campaign status(es). */
    private const APPROVAL_TABS = [
        'pending'        => ['pending_review'],
        'needs_changes'  => ['changes_requested'],
        'approved'       => ['active', 'approved'],
        'rejected'       => ['rejected'],
    ];

    /** Tile counts for the Approvals header. */
    public function approvalsSummary(): JsonResponse
    {
        $monthStart = now()->startOfMonth();
        return response()->json(['success' => true, 'data' => [
            'pending'            => (int) AdCampaign::where('status', 'pending_review')->count(),
            'needs_changes'      => (int) AdCampaign::where('status', 'changes_requested')->count(),
            'approved_month'     => (int) AdReview::where('decision', 'approved')->where('created_at', '>=', $monthStart)->count(),
            'rejected_month'     => (int) AdReview::where('decision', 'rejected')->where('created_at', '>=', $monthStart)->count(),
            'avg_review_minutes' => (int) round((float) AdCampaign::whereNotNull('reviewed_at')->whereNotNull('submitted_at')
                ->where('reviewed_at', '>=', $monthStart)
                ->selectRaw('avg(extract(epoch from (reviewed_at - submitted_at)) / 60) m')->value('m') ?? 0),
        ]]);
    }

    /** Paginated, enriched review rows (ad preview, placements, advertiser, objective). */
    public function approvals(Request $request): JsonResponse
    {
        $tab      = $request->input('tab', 'pending');
        $statuses = self::APPROVAL_TABS[$tab] ?? self::APPROVAL_TABS['pending'];

        $q = AdCampaign::with([
                'account.user:id,username,name,avatar,is_verified',
                'groups:id,campaign_id,placements',
            ])
            ->whereIn('status', $statuses);

        if ($search = trim((string) $request->input('search'))) {
            $q->where(function ($w) use ($search) {
                $w->where('name', 'ilike', "%{$search}%")
                  ->orWhereHas('account.user', fn ($u) => $u->where('username', 'ilike', "%{$search}%")->orWhere('name', 'ilike', "%{$search}%"));
            });
        }

        $campaigns = $q->orderByDesc('submitted_at')->orderByDesc('created_at')
            ->paginate((int) $request->input('per_page', 10));

        $rows = collect($campaigns->items())->map(function ($c) use ($request) {
            $user = optional($c->account)->user;

            // Placements (unique across the campaign's groups).
            $placements = collect($c->groups)->flatMap(fn ($g) => (array) $g->placements)->unique()->values()->all();

            // Ad preview: creative image, else boosted-video poster.
            $creative = AdCreative::whereHas('group', fn ($g) => $g->where('campaign_id', $c->id))->first();
            $thumb = null;
            $duration = $creative?->duration;
            if ($creative && $creative->video_id) {
                $v = Video::find($creative->video_id);
                if ($v) {
                    $thumb = (new VideoResource($v))->resolve($request)['thumbnail_url'] ?? null;
                    $duration = $duration ?: $v->duration;
                }
            }
            $thumb = $thumb ?: ($creative?->thumbnail_url ?: $creative?->media_url);

            return [
                'id'                 => $c->id,
                'ad_id'              => 'AD-' . str_pad((string) $c->id, 6, '0', STR_PAD_LEFT),
                'name'               => $c->name,
                'status'             => $c->status,
                'objective'          => $c->objective,
                'daily_budget_cents' => (int) $c->daily_budget_cents,
                'currency'           => $c->currency ?: 'USD',
                'submitted_at'       => optional($c->submitted_at ?? $c->created_at)->toIso8601String(),
                'submitted_by'       => $user->name ?? optional($c->account)->name ?? '—',
                'rejection_reason'   => $c->rejection_reason,
                'advertiser'         => [
                    'name'        => $user->name ?? optional($c->account)->name ?? 'Advertiser',
                    'username'    => $user->username ?? null,
                    'avatar'      => $user && $user->avatar ? Storage::url($user->avatar) : StorageService::defaultAvatarUrl(),
                    'is_verified' => (bool) ($user->is_verified ?? false),
                ],
                'placements'         => $placements,
                'preview'            => [
                    'thumbnail_url' => $thumb,
                    'duration'      => $duration ? (int) $duration : null,
                ],
            ];
        })->all();

        return response()->json([
            'success' => true,
            'data'    => $rows,
            'meta'    => $this->page($campaigns),
        ]);
    }

    /** Ask the advertiser for modifications (soft reject → they can edit + resubmit). */
    public function requestChanges(Request $request, int $id): JsonResponse
    {
        $data     = $request->validate(['reason' => ['required', 'string', 'max:500']]);
        $campaign = AdCampaign::findOrFail($id);

        DB::transaction(function () use ($campaign, $request, $data) {
            $campaign->update([
                'status'           => 'changes_requested',
                'reviewed_at'      => now(),
                'reviewed_by'      => $request->user()->id,
                'rejection_reason' => $data['reason'],
            ]);
            // Let the advertiser edit the underlying promotion + resubmit.
            if ($campaign->promotion_id) {
                Promotion::where('id', $campaign->promotion_id)
                    ->update(['status' => 'rejected', 'rejection_reason' => $data['reason']]);
            }
            AdReview::create([
                'subject_type' => 'campaign',
                'subject_id'   => $campaign->id,
                'reviewer_id'  => $request->user()->id,
                'decision'     => 'changes_requested',
                'reason'       => $data['reason'],
            ]);
        });

        AdminActionLog::record(
            admin: $request->user(),
            action: 'request_changes_ad_campaign',
            description: "Requested changes on ad campaign #{$campaign->id}",
            metadata: ['campaign_id' => $campaign->id, 'reason' => $data['reason']],
        );

        return response()->json(['success' => true, 'data' => $campaign->fresh(), 'message' => 'Changes requested from the advertiser.']);
    }

    /* ── Advertisers ──────────────────────────────────────────────────────── */
    public function advertisers(Request $request): JsonResponse
    {
        $q = AdAccount::with('user:id,username,name,avatar,email')->withCount('campaigns');

        if ($search = trim((string) $request->input('search'))) {
            $q->whereHas('user', fn ($u) => $u->where('username', 'ilike', "%{$search}%")->orWhere('name', 'ilike', "%{$search}%"));
        }

        $accounts = $q->orderByDesc('created_at')->paginate((int) $request->input('per_page', 20));

        return response()->json([
            'success' => true,
            'data'    => $accounts->items(),
            'meta'    => $this->page($accounts),
        ]);
    }

    /* ── Fraud ────────────────────────────────────────────────────────────── */
    public function fraud(Request $request): JsonResponse
    {
        $q = AdFraudEvent::query();

        if ($kind = $request->input('kind')) {
            $q->where('kind', $kind);
        }

        $events = $q->orderByDesc('created_at')->paginate((int) $request->input('per_page', 30));

        return response()->json([
            'success' => true,
            'data'    => $events->items(),
            'meta'    => $this->page($events),
        ]);
    }

    /* ── Placements ───────────────────────────────────────────────────────── */
    public function placements(): JsonResponse
    {
        return response()->json(['success' => true, 'data' => AdPlacement::orderBy('sort_order')->get()]);
    }

    public function updatePlacement(Request $request, int $id): JsonResponse
    {
        $placement = AdPlacement::findOrFail($id);

        $data = $request->validate([
            'is_enabled'      => ['sometimes', 'boolean'],
            'first_slot'      => ['sometimes', 'integer', 'min:0', 'max:50'],
            'cadence'         => ['sometimes', 'integer', 'min:0', 'max:50'],
            'floor_cpm_cents' => ['sometimes', 'integer', 'min:0'],
        ]);

        $placement->update($data);

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_ad_placement',
            target: null,
            description: "Updated ad placement '{$placement->key}'",
            metadata: $data,
        );

        return response()->json(['success' => true, 'data' => $placement->fresh()]);
    }

    /* ── Settings (typed, stored in app_settings group=ads) ───────────────── */
    public function settings(): JsonResponse
    {
        $out = [];
        foreach (self::SETTINGS as $key => $def) {
            $raw = AppSetting::where('key', $key)->first()?->value;
            $out[$key] = [
                'value' => $raw === null ? $def['default'] : $this->castSetting($raw, $def['type']),
                'type'  => $def['type'],
            ];
        }

        return response()->json(['success' => true, 'data' => $out]);
    }

    public function updateSettings(Request $request): JsonResponse
    {
        $request->validate([
            'key'   => ['required', 'string'],
            'value' => ['present'],
        ]);

        $key = $request->key;
        if (! array_key_exists($key, self::SETTINGS)) {
            return response()->json(['success' => false, 'message' => 'Unknown ads setting.'], 422);
        }

        $type  = self::SETTINGS[$key]['type'];
        $store = $type === 'boolean' ? ($request->boolean('value') ? '1' : '0') : (string) $request->value;

        AppSetting::set($key, $store, $type, 'ads');

        AdminActionLog::record(
            admin: $request->user(),
            action: 'update_ad_setting',
            target: null,
            description: "Updated ads setting: {$key}",
            metadata: ['key' => $key, 'value' => $store],
        );

        return response()->json(['success' => true, 'message' => 'Setting updated.']);
    }

    /* ── Helpers ──────────────────────────────────────────────────────────── */
    private function page($p): array
    {
        return [
            'current_page' => $p->currentPage(),
            'last_page'    => $p->lastPage(),
            'per_page'     => $p->perPage(),
            'total'        => $p->total(),
        ];
    }

    private function castSetting($val, string $type): mixed
    {
        return match ($type) {
            'boolean' => (bool) ((int) $val) || $val === 'true',
            'integer' => (int) $val,
            default   => (string) $val,
        };
    }
}
