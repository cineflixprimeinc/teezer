<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\CoinOrder;
use App\Models\CreatorEarning;
use App\Models\CreatorPayout;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Monetization overview for the admin panel.
 *
 * Split out rather than added to AdminOverviewController because that class is
 * the dashboard's, and this endpoint answers a different question: not "how is
 * the platform doing" but "where is the money, and what is waiting on me".
 */
class AdminMonetizationController extends Controller
{
    /**
     * GET /api/v1/admin/monetization/overview?range=7d|30d|90d|all
     *
     * The money view: what came in, what is owed out, and what is waiting on an
     * admin. The page that reads this used to show three hardcoded dashes and a
     * grid of links.
     *
     * Revenue figures agree with AdminOverviewController::revenue on purpose -
     * coin orders that were actually PAID, active subscriptions, and DELIVERED
     * ad spend from ad_stats_daily. Notably not campaign total_budget, which is
     * only what an advertiser typed into a form and which nothing charges;
     * summing it once reported an unpaid $174k campaign as revenue.
     *
     * Payout figures are gross `amount` - what the creator's balance is debited
     * by - with the platform's cut reported separately as commission, because
     * they answer different questions: cash leaving the business versus revenue
     * kept from it.
     */
    public function overview(Request $request): JsonResponse
    {
        $range = $request->get('range', '30d');
        $days  = match ($range) { '7d' => 7, '90d' => 90, 'all' => 3650, default => 30 };

        $end   = now();
        $start = $end->copy()->subDays($days);
        $prev  = $start->copy()->subDays($days);

        /* ── Revenue in ─────────────────────────────────────────────────── */
        $coinsAll = (float) CoinOrder::where('payment_status', 'paid')->sum('price_usd');
        $coinsCur = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$start, $end])->sum('price_usd');
        $coinsPrv = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$prev, $start])->sum('price_usd');

        $subsAll  = (float) DB::table('subscriptions')->where('status', 'active')->sum('price');
        $subsCur  = (float) DB::table('subscriptions')->where('status', 'active')->whereBetween('created_at', [$start, $end])->sum('price');
        $subsPrv  = (float) DB::table('subscriptions')->where('status', 'active')->whereBetween('created_at', [$prev, $start])->sum('price');

        $adsAll   = (float) DB::table('ad_stats_daily')->sum('spend_cents') / 100;
        $adsCur   = (float) DB::table('ad_stats_daily')->whereBetween('stat_date', [$start->toDateString(), $end->toDateString()])->sum('spend_cents') / 100;
        $adsPrv   = (float) DB::table('ad_stats_daily')->whereBetween('stat_date', [$prev->toDateString(), $start->toDateString()])->sum('spend_cents') / 100;

        $revCur = $coinsCur + $subsCur + $adsCur;
        $revPrv = $coinsPrv + $subsPrv + $adsPrv;

        /* ── Money out ──────────────────────────────────────────────────── */
        $paidOut     = (float) CreatorPayout::where('status', 'paid')->sum('amount');
        $paidOutCur  = (float) CreatorPayout::where('status', 'paid')->whereBetween('paid_at', [$start, $end])->sum('amount');
        $paidOutPrv  = (float) CreatorPayout::where('status', 'paid')->whereBetween('paid_at', [$prev, $start])->sum('amount');
        $commission  = (float) CreatorPayout::where('status', 'paid')->sum('commission_amount');

        $pendingRows = CreatorPayout::whereIn('status', ['pending', 'processing', 'scheduled'])->get(['amount', 'status']);
        $pendingSum  = (float) $pendingRows->sum('amount');

        /* ── Creator balances still owed ────────────────────────────────── */
        $wallet = DB::table('creator_wallets')->selectRaw('
            COALESCE(SUM(available_balance),0) as available,
            COALESCE(SUM(pending_balance),0)   as pending,
            COALESCE(SUM(lifetime_earnings),0) as lifetime
        ')->first();

        /* ── Daily series: revenue in vs payouts out ────────────────────── */
        $seriesDays = min($days, 90);
        $from       = $end->copy()->subDays($seriesDays);

        $coinDaily = $this->fillDays(
            CoinOrder::where('payment_status', 'paid')->where('created_at', '>=', $from)
                ->selectRaw('created_at::date as day, COALESCE(SUM(price_usd),0) as cnt')
                ->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $from, $end
        );

        $payoutDaily = $this->fillDays(
            CreatorPayout::where('status', 'paid')->whereNotNull('paid_at')->where('paid_at', '>=', $from)
                ->selectRaw('paid_at::date as day, COALESCE(SUM(amount),0) as cnt')
                ->groupBy('day')->pluck('cnt', 'day')->toArray(),
            $from, $end
        );

        $series = [];
        foreach ($coinDaily as $day => $v) {
            $series[] = [
                'date'    => $day,
                'revenue' => round((float) $v, 2),
                'payouts' => round((float) ($payoutDaily[$day] ?? 0), 2),
            ];
        }

        /* ── Earnings by source ─────────────────────────────────────────── */
        $bySource = CreatorEarning::selectRaw('source, COALESCE(SUM(amount),0) as total, COUNT(*) as n')
            ->groupBy('source')->orderByDesc('total')->get()
            ->map(fn ($r) => [
                'source' => (string) $r->source,
                'total'  => round((float) $r->total, 2),
                'count'  => (int) $r->n,
            ])->all();

        /* ── Payout queue by status ─────────────────────────────────────── */
        $payoutStatus = CreatorPayout::selectRaw('status, COUNT(*) as n, COALESCE(SUM(amount),0) as total')
            ->groupBy('status')->get()
            ->map(fn ($r) => [
                'status' => (string) $r->status,
                'count'  => (int) $r->n,
                'total'  => round((float) $r->total, 2),
            ])->all();

        /* ── Top earning creators ───────────────────────────────────────── */
        $topCreators = DB::table('creator_wallets as w')
            ->join('users as u', 'u.id', '=', 'w.user_id')
            ->orderByDesc('w.lifetime_earnings')
            ->limit(10)
            ->get(['u.id', 'u.username', 'u.name', 'u.avatar', 'w.lifetime_earnings', 'w.available_balance', 'w.pending_balance'])
            ->map(function ($r) {
                $disk = config('filesystems.default', 'r2');

                return [
                    'id'        => (int) $r->id,
                    'username'  => $r->username,
                    'name'      => $r->name,
                    'avatar'    => $r->avatar && ! str_starts_with((string) $r->avatar, 'http')
                        ? Storage::disk($disk)->url($r->avatar)
                        : $r->avatar,
                    'lifetime'  => round((float) $r->lifetime_earnings, 2),
                    'available' => round((float) $r->available_balance, 2),
                    'pending'   => round((float) $r->pending_balance, 2),
                ];
            })->all();

        /* ── Things waiting on a human ──────────────────────────────────── */
        $pendingPayoutCount = CreatorPayout::whereIn('status', ['pending', 'processing'])->count();
        $failedPayoutCount  = CreatorPayout::where('status', 'failed')->count();
        $unpaidOrders       = CoinOrder::where('payment_status', 'pending')->count();

        return response()->json([
            'success' => true,
            'data'    => [
                'range' => $range,
                'days'  => $days,
                'headline' => [
                    // Lifetime totals, with the selected window's movement.
                    'revenue'        => ['total' => round($coinsAll + $subsAll + $adsAll, 2), 'period' => round($revCur, 2),    'pct' => $this->pctChange($revCur, $revPrv)],
                    'paid_out'       => ['total' => round($paidOut, 2),                       'period' => round($paidOutCur, 2), 'pct' => $this->pctChange($paidOutCur, $paidOutPrv)],
                    'pending_payout' => ['total' => round($pendingSum, 2),                    'period' => round($pendingSum, 2), 'pct' => 0.0],
                    'commission'     => ['total' => round($commission, 2),                    'period' => 0.0,                   'pct' => 0.0],
                    'owed'           => ['total' => round((float) ($wallet->available ?? 0), 2), 'period' => 0.0, 'pct' => 0.0],
                    'lifetime_paid'  => ['total' => round((float) ($wallet->lifetime ?? 0), 2),  'period' => 0.0, 'pct' => 0.0],
                ],
                'revenue_breakdown' => [
                    ['label' => 'Coin sales',    'value' => round($coinsAll, 2), 'period' => round($coinsCur, 2)],
                    ['label' => 'Subscriptions', 'value' => round($subsAll, 2),  'period' => round($subsCur, 2)],
                    ['label' => 'Ad spend',      'value' => round($adsAll, 2),   'period' => round($adsCur, 2)],
                ],
                'series'         => $series,
                'by_source'      => $bySource,
                'payout_status'  => $payoutStatus,
                'top_creators'   => $topCreators,
                'wallets'        => [
                    'available' => round((float) ($wallet->available ?? 0), 2),
                    'pending'   => round((float) ($wallet->pending ?? 0), 2),
                    'lifetime'  => round((float) ($wallet->lifetime ?? 0), 2),
                ],
                'attention' => [
                    'pending_payouts' => $pendingPayoutCount,
                    'failed_payouts'  => $failedPayoutCount,
                    'unpaid_orders'   => $unpaidOrders,
                ],
            ],
        ]);
    }

    private function pctChange(float $now, float $prev): float
    {
        // No prior activity means there is no percentage to state; 0.0 rather
        // than a fabricated jump from zero.
        return $prev > 0 ? round(($now - $prev) / $prev * 100, 1) : 0.0;
    }

    /** Zero-fills every day in the range so gaps read as gaps, not as absent time. */
    private function fillDays(array $rows, $from, $to): array
    {
        $norm = [];
        foreach ($rows as $k => $v) {
            $norm[substr((string) $k, 0, 10)] = $v;
        }

        $out    = [];
        $cursor = $from->copy()->startOfDay();
        $last   = $to->copy()->startOfDay();
        while ($cursor->lte($last)) {
            $key       = $cursor->format('Y-m-d');
            $out[$key] = $norm[$key] ?? 0;
            $cursor->addDay();
        }

        return $out;
    }
}
