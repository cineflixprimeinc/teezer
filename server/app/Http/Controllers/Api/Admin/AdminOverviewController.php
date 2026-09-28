<?php

namespace App\Http\Controllers\Api\Admin;

use App\Http\Controllers\Controller;
use App\Models\AdStatDaily;
use App\Models\CoinOrder;
use App\Models\GiftTransaction;
use App\Models\Subscription;
use App\Models\User;
use App\Models\Video;
use App\Models\WalletTransaction;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class AdminOverviewController extends Controller
{
    /* ── Date helpers ──────────────────────────────────────────────────────── */
    private function dates(string $range): array
    {
        $days = match ($range) { '30d' => 30, '90d' => 90, default => 7 };
        $now  = Carbon::now();
        return [
            'start'      => $now->copy()->subDays($days)->startOfDay(),
            'end'        => $now->endOfDay(),
            'prev_start' => $now->copy()->subDays($days * 2)->startOfDay(),
            'prev_end'   => $now->copy()->subDays($days)->endOfDay(),
        ];
    }

    private function growth(float $cur, float $prev): float
    {
        if ($prev == 0) return $cur > 0 ? 100.0 : 0.0;
        return round(($cur - $prev) / $prev * 100, 1);
    }

    /* ── GET /admin/dashboard/overview ─────────────────────────────────────── */
    public function overview(Request $request): JsonResponse
    {
        $d = $this->dates($request->get('range', '7d'));

        $totalUsers     = User::count();
        $activeCreators = User::where('role', 'creator')->where('is_active', true)->count();
        $totalVideos    = Video::whereNull('deleted_at')->count();

        $newUsersCur  = User::whereBetween('created_at', [$d['start'], $d['end']])->count();
        $newUsersPrev = User::whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->count();

        $newCreatorsCur  = User::where('role', 'creator')->whereBetween('created_at', [$d['start'], $d['end']])->count();
        $newCreatorsPrev = User::where('role', 'creator')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->count();

        $newVideosCur  = Video::whereNull('deleted_at')->whereBetween('created_at', [$d['start'], $d['end']])->count();
        $newVideosPrev = Video::whereNull('deleted_at')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->count();

        $totalCoins  = (int) CoinOrder::where('payment_status', 'paid')->sum('coins');
        $coinsCur    = (int) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['start'], $d['end']])->sum('coins');
        $coinsPrev   = (int) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('coins');

        $totalRevenue = (float) CoinOrder::where('payment_status', 'paid')->sum('price_usd')
            + (float) Subscription::where('status', 'active')->sum('price');

        $revCur  = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['start'], $d['end']])->sum('price_usd')
            + (float) Subscription::where('status', 'active')->whereBetween('created_at', [$d['start'], $d['end']])->sum('price');

        $revPrev = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('price_usd')
            + (float) Subscription::where('status', 'active')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('price');

        return response()->json([
            'success' => true,
            'data'    => [
                'totalUsers'            => $totalUsers,
                'activeCreators'        => $activeCreators,
                'totalVideos'           => $totalVideos,
                'liveSessions'          => 0,
                'totalCoinsTransacted'  => $totalCoins,
                'platformRevenue'       => round($totalRevenue, 2),
                'growth' => [
                    'users'        => $this->growth($newUsersCur, $newUsersPrev),
                    'creators'     => $this->growth($newCreatorsCur, $newCreatorsPrev),
                    'videos'       => $this->growth($newVideosCur, $newVideosPrev),
                    'liveSessions' => 0.0,
                    'coins'        => $this->growth($coinsCur, $coinsPrev),
                    'revenue'      => $this->growth($revCur, $revPrev),
                ],
            ],
        ]);
    }

    /* ── GET /admin/dashboard/analytics ────────────────────────────────────── */
    public function analytics(Request $request): JsonResponse
    {
        $range = $request->get('range', '7d');
        $days  = match ($range) { '30d' => 30, '90d' => 90, default => 7 };

        $labels  = [];
        $users   = [];
        $videos  = [];
        $coins   = [];
        $revenue = [];

        for ($i = $days - 1; $i >= 0; $i--) {
            $day   = Carbon::now()->subDays($i)->startOfDay();
            $end   = $day->copy()->endOfDay();
            $label = $days <= 7 ? $day->format('M j') : $day->format('M j');

            $labels[]  = $label;
            $users[]   = User::whereBetween('created_at', [$day, $end])->count();
            $videos[]  = Video::whereNull('deleted_at')->whereBetween('created_at', [$day, $end])->count();
            $coins[]   = (int) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$day, $end])->sum('coins');
            $revenue[] = (float) round(
                CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$day, $end])->sum('price_usd') +
                Subscription::where('status', 'active')->whereBetween('created_at', [$day, $end])->sum('price'),
                2
            );
        }

        return response()->json([
            'success' => true,
            'data'    => compact('labels', 'users', 'videos', 'coins', 'revenue'),
        ]);
    }

    /* ── GET /admin/dashboard/revenue ──────────────────────────────────────── */
    public function revenue(Request $request): JsonResponse
    {
        $d = $this->dates($request->get('range', '7d'));

        $coinsRev = (float) CoinOrder::where('payment_status', 'paid')->sum('price_usd');
        $subRev   = (float) Subscription::where('status', 'active')->sum('price');

        // Promotion revenue is DELIVERED AD SPEND (ad_stats_daily.spend_cents),
        // NOT a campaign's total_budget. total_budget is only what an advertiser
        // types in when creating a campaign - nothing charges it: creation just
        // records a payment_method preference, no CoinOrder/wallet/charge is
        // captured. Summing it reported an unpaid $174k campaign as $174k of
        // revenue. The ads section (AdminAdController::revenue) already bills off
        // spend_cents; this now agrees with it, and reads $0 until real ad
        // delivery is billed - which is the honest figure.
        $promoRev = (float) AdStatDaily::sum('spend_cents') / 100;
        $total    = $coinsRev + $subRev + $promoRev;

        $coinsCur  = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['start'], $d['end']])->sum('price_usd');
        $coinsPrev = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('price_usd');
        $subCur    = (float) Subscription::where('status', 'active')->whereBetween('created_at', [$d['start'], $d['end']])->sum('price');
        $subPrev   = (float) Subscription::where('status', 'active')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('price');
        // stat_date is a date, so compare on the range's date bounds.
        $promoCur  = (float) AdStatDaily::whereBetween('stat_date', [$d['start']->toDateString(), $d['end']->toDateString()])->sum('spend_cents') / 100;
        $promoPrev = (float) AdStatDaily::whereBetween('stat_date', [$d['prev_start']->toDateString(), $d['prev_end']->toDateString()])->sum('spend_cents') / 100;
        $totCur    = $coinsCur + $subCur + $promoCur;
        $totPrev   = $coinsPrev + $subPrev + $promoPrev;

        return response()->json([
            'success' => true,
            'data'    => [
                'totalRevenue' => round($total, 2),
                'growth'       => $this->growth($totCur, $totPrev),
                'breakdown'    => [
                    ['label' => 'Coins Revenue',        'value' => round($coinsRev, 2), 'growth' => $this->growth($coinsCur, $coinsPrev), 'color' => '#3b82f6'],
                    ['label' => 'Subscription Revenue', 'value' => round($subRev, 2),   'growth' => $this->growth($subCur,   $subPrev),   'color' => '#fe2c55'],
                    ['label' => 'Promotion Revenue',    'value' => round($promoRev, 2), 'growth' => $this->growth($promoCur, $promoPrev), 'color' => '#f59e0b'],
                    ['label' => 'Other Revenue',        'value' => 0.0,                 'growth' => 0.0,                                  'color' => '#10b981'],
                ],
            ],
        ]);
    }

    /* ── GET /admin/dashboard/recent-transactions ───────────────────────────── */
    public function recentTransactions(Request $request): JsonResponse
    {
        $limit = min((int) $request->get('limit', 10), 50);

        $orders = CoinOrder::with('user')
            ->where('payment_status', 'paid')
            ->orderByDesc('created_at')
            ->limit($limit)
            ->get()
            ->map(fn ($o) => [
                'id'        => 'TXN' . str_pad($o->id, 5, '0', STR_PAD_LEFT),
                'userName'  => $o->user?->name ?? 'Unknown',
                'username'  => $o->user?->username ?? 'user',
                'avatar'    => $o->user?->avatar ?? null,
                'type'      => 'Coins Purchase',
                'coins'     => $o->coins,
                'amountUsd' => (float) $o->price_usd,
                'status'    => 'completed',
                'date'      => $o->created_at->format('M j, Y h:i A'),
            ]);

        return response()->json(['success' => true, 'data' => $orders]);
    }

    /* ── GET /admin/dashboard/top-creators ──────────────────────────────────── */
    public function topCreators(Request $request): JsonResponse
    {
        $limit   = min((int) $request->get('limit', 5), 20);
        $d       = $this->dates('30d');

        $creators = GiftTransaction::select('receiver_id', DB::raw('SUM(total_coins) as total_coins'))
            ->groupBy('receiver_id')
            ->orderByDesc('total_coins')
            ->limit($limit)
            ->with('receiver:id,name,username,avatar')
            ->get()
            ->map(fn ($row, $i) => [
                'rank'     => $i + 1,
                'name'     => $row->receiver?->name ?? 'Creator',
                'username' => $row->receiver?->username ?? 'creator',
                'avatar'   => $row->receiver?->avatar ?? null,
                'coins'    => (int) $row->total_coins,
                'growth'   => 0.0,
            ]);

        if ($creators->isEmpty()) {
            $creators = User::where('role', 'creator')
                ->orderByDesc('created_at')
                ->limit($limit)
                ->get()
                ->map(fn ($u, $i) => [
                    'rank'     => $i + 1,
                    'name'     => $u->name,
                    'username' => $u->username,
                    'avatar'   => $u->avatar ?? null,
                    'coins'    => 0,
                    'growth'   => 0.0,
                ]);
        }

        return response()->json(['success' => true, 'data' => $creators]);
    }

    /* ── GET /admin/dashboard/system-status ─────────────────────────────────── */
    public function systemStatus(): JsonResponse
    {
        $dbOk = true;
        try { DB::connection()->getPdo(); } catch (\Exception) { $dbOk = false; }

        $disk = disk_free_space('/') / disk_total_space('/');
        $storageUsage = (int) round((1 - $disk) * 100);

        // Session driver is Redis; DB sessions table is not used.
        $activeSessions = 0;

        return response()->json([
            'success' => true,
            'data'    => [
                'serverStatus'    => 'operational',
                'databaseStatus'  => $dbOk ? 'operational' : 'issue',
                'storageUsage'    => $storageUsage,
                'apiResponseMs'   => 0,
                'activeSessions'  => $activeSessions,
                'supportTickets'  => 0,
                'apiSparkline'    => [],
                'sessionSparkline'=> [],
                'ticketSparkline' => [],
            ],
        ]);
    }

    /* ── GET /admin/dashboard/mini-metrics ──────────────────────────────────── */
    public function miniMetrics(Request $request): JsonResponse
    {
        $d = $this->dates($request->get('range', '7d'));

        $newUsers   = User::whereBetween('created_at', [$d['start'], $d['end']])->count();
        $newVideos  = Video::whereNull('deleted_at')->whereBetween('created_at', [$d['start'], $d['end']])->count();
        $coinsSold  = (int) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['start'], $d['end']])->sum('coins');
        $revenue    = (float) round(CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['start'], $d['end']])->sum('price_usd'), 2);
        $liveViews  = (int) Video::whereNull('deleted_at')->whereBetween('created_at', [$d['start'], $d['end']])->sum('views_count');

        $prevUsers  = User::whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->count();
        $prevVideos = Video::whereNull('deleted_at')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->count();
        $prevCoins  = (int) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('coins');
        $prevRev    = (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('price_usd');
        $prevViews  = (int) Video::whereNull('deleted_at')->whereBetween('created_at', [$d['prev_start'], $d['prev_end']])->sum('views_count');

        // Build 7-point sparklines (last 7 days regardless of range)
        $spark = fn (callable $q) => collect(range(6, 0))->map(function ($i) use ($q) {
            $day = Carbon::now()->subDays($i);
            return $q($day->copy()->startOfDay(), $day->copy()->endOfDay());
        })->values()->toArray();

        return response()->json([
            'success' => true,
            'data'    => [
                'newUsers'  => $newUsers,
                'newVideos' => $newVideos,
                'liveViews' => $liveViews,
                'coinsSold' => $coinsSold,
                'revenue'   => $revenue,
                'growth' => [
                    'newUsers'  => $this->growth($newUsers, $prevUsers),
                    'newVideos' => $this->growth($newVideos, $prevVideos),
                    'liveViews' => $this->growth($liveViews, $prevViews),
                    'coinsSold' => $this->growth($coinsSold, $prevCoins),
                    'revenue'   => $this->growth($revenue, $prevRev),
                ],
                'sparklines' => [
                    'newUsers'  => $spark(fn ($s, $e) => User::whereBetween('created_at', [$s, $e])->count()),
                    'newVideos' => $spark(fn ($s, $e) => Video::whereNull('deleted_at')->whereBetween('created_at', [$s, $e])->count()),
                    'liveViews' => $spark(fn ($s, $e) => (int) Video::whereNull('deleted_at')->whereBetween('created_at', [$s, $e])->sum('views_count')),
                    'coinsSold' => $spark(fn ($s, $e) => (int) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$s, $e])->sum('coins')),
                    'revenue'   => $spark(fn ($s, $e) => (float) CoinOrder::where('payment_status', 'paid')->whereBetween('created_at', [$s, $e])->sum('price_usd')),
                ],
            ],
        ]);
    }
}
