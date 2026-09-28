<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Models\CreatorAnalytic;
use App\Models\Video;
use App\Models\VideoComment;
use App\Models\VideoLike;
use App\Models\VideoSave;
use App\Models\VideoShare;
use App\Models\VideoView;
use App\Services\StorageService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\Storage;

class StudioAnalyticsController extends Controller
{
    /* ── GET /studio/analytics ─────────────────────────────────────────── */
    public function index(Request $request): JsonResponse
    {
        $request->validate([
            'period'     => ['nullable', 'in:7,30,90'],
            'metric'     => ['nullable', 'in:views,watch_time,followers,engagement_rate,profile_views,likes,comments,shares,estimated_rewards'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
        ]);

        $user   = $request->user();
        $metric = $request->input('metric', 'views');

        if ($request->filled('start_date') && $request->filled('end_date')) {
            $endDate   = Carbon::parse($request->input('end_date'))->endOfDay();
            $startDate = Carbon::parse($request->input('start_date'))->startOfDay();
        } else {
            $days      = (int) $request->input('period', 7);
            $endDate   = now()->endOfDay();
            $startDate = now()->subDays($days - 1)->startOfDay();
        }

        $rangeLen  = (int) $startDate->diffInDays($endDate) + 1;
        $prevEnd   = $startDate->copy()->subDay();
        $prevStart = $prevEnd->copy()->subDays($rangeLen - 1);

        $curRows = CreatorAnalytic::where('user_id', $user->id)
            ->whereBetween('date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get();

        $prevRows = CreatorAnalytic::where('user_id', $user->id)
            ->whereBetween('date', [$prevStart->toDateString(), $prevEnd->toDateString()])
            ->get();

        $videoIds = Video::where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->pluck('id');

        $curViews    = (int) $curRows->sum('views');
        $curWatchMin = (int) $curRows->sum('watch_time_mins');
        $curLikes    = (int) $curRows->sum('likes');
        $curComments = (int) $curRows->sum('comments');
        $curShares   = (int) $curRows->sum('shares');
        $curSaves    = (int) $curRows->sum('saves');
        $curEarnings = (float) $curRows->sum('earnings');

        if ($curRows->isEmpty()) {
            $curRaw      = $this->rawTotals($videoIds, $startDate, $endDate);
            $curViews    = $curRaw['views'];
            $curLikes    = $curRaw['likes'];
            $curComments = $curRaw['comments'];
            $curShares   = $curRaw['shares'];
            $curSaves    = $curRaw['saves'];
            $curWatchMin = $curRaw['watch_time_mins'];
            $curEarnings = 0.0;
            if ($curViews === 0) {
                $curViews = (int) Video::where('user_id', $user->id)->whereNull('deleted_at')->sum('views_count');
            }
        }

        $hasProfileViews = Schema::hasTable('profile_views');
        if ($hasProfileViews) {
            $curProfileViews  = (int) DB::table('profile_views')->where('profile_user_id', $user->id)->whereBetween('viewed_at', [$startDate, $endDate])->count();
            $prevProfileViews = (int) DB::table('profile_views')->where('profile_user_id', $user->id)->whereBetween('viewed_at', [$prevStart, $prevEnd])->count();
        } else {
            $curProfileViews = $prevProfileViews = 0;
        }

        $profile       = $user->profile;
        $followers     = (int) ($profile?->total_followers ?? 0);
        $curDelta      = (int) ($curRows->sum('new_followers') - $curRows->sum('lost_followers'));
        $prevFollowers = max(0, $followers - $curDelta);

        $engRate  = $curViews > 0 ? round(($curLikes + $curComments + $curShares + $curSaves) / $curViews * 100, 2) : 0.0;

        $prevViews    = (int) $prevRows->sum('views');
        $prevWatchMin = (int) $prevRows->sum('watch_time_mins');
        $prevLikes    = (int) $prevRows->sum('likes');
        $prevComments = (int) $prevRows->sum('comments');
        $prevShares   = (int) $prevRows->sum('shares');
        $prevSaves    = (int) $prevRows->sum('saves');
        $prevEarnings = (float) $prevRows->sum('earnings');

        if ($prevRows->isEmpty()) {
            $prevRaw      = $this->rawTotals($videoIds, $prevStart, $prevEnd);
            $prevViews    = $prevRaw['views'];
            $prevWatchMin = $prevRaw['watch_time_mins'];
            $prevLikes    = $prevRaw['likes'];
            $prevComments = $prevRaw['comments'];
            $prevShares   = $prevRaw['shares'];
            $prevSaves    = $prevRaw['saves'];
            $prevEarnings = 0.0;
        }

        $prevEngRate = $prevViews > 0 ? round(($prevLikes + $prevComments + $prevShares + $prevSaves) / $prevViews * 100, 2) : 0.0;

        $chart = $this->buildChart($curRows, $metric, $startDate, $endDate, $followers, $hasProfileViews, $user->id, $curProfileViews);
        if ($curRows->isEmpty() || $this->chartIsEmpty($chart)) {
            $rawChart = $this->buildRawChart($metric, $startDate, $endDate, $videoIds, $user->id, $hasProfileViews, $curViews);
            if ($curRows->isEmpty() || !$this->chartIsEmpty($rawChart)) {
                $chart = $rawChart;
            }
        }

        return response()->json([
            'success' => true,
            'data'    => [
                'period'          => ['start' => $startDate->toDateString(), 'end' => $endDate->toDateString()],
                'previous_period' => ['start' => $prevStart->toDateString(), 'end' => $prevEnd->toDateString()],
                'summary'         => [
                    'views'             => $curViews,
                    'watch_time_mins'   => $curWatchMin,
                    'watch_time_hours'  => $curWatchMin > 0 ? (int) round($curWatchMin / 60) : 0,
                    'followers'         => $followers,
                    'engagement_rate'   => $engRate,
                    'profile_views'     => $curProfileViews,
                    'likes'             => $curLikes,
                    'comments'          => $curComments,
                    'shares'            => $curShares,
                    'estimated_rewards' => $curEarnings,
                    'growth' => [
                        'views'             => $this->growthPct($curViews, $prevViews),
                        'watch_time'        => $this->growthPct($curWatchMin, $prevWatchMin),
                        'followers'         => $this->growthPct($followers, $prevFollowers),
                        'engagement_rate'   => $this->growthPct($engRate, $prevEngRate),
                        'profile_views'     => $this->growthPct($curProfileViews, $prevProfileViews),
                        'likes'             => $this->growthPct($curLikes, $prevLikes),
                        'comments'          => $this->growthPct($curComments, $prevComments),
                        'shares'            => $this->growthPct($curShares, $prevShares),
                        'estimated_rewards' => $this->growthPct($curEarnings, $prevEarnings),
                    ],
                ],
                'chart' => $chart,
            ],
        ]);
    }

    /* ── GET /studio/analytics/overview ───────────────────────────────── */
    public function overview(Request $request): JsonResponse
    {
        $request->validate([
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
            'period'     => ['nullable', 'in:7,28,30,90,365'],
            'metric'     => ['nullable', 'in:views,watch_time,avg_watch_duration,engagement_rate,followers_gained,profile_views,likes,comments,shares,saves,estimated_rewards'],
        ]);

        $user   = $request->user();
        $metric = $request->input('metric', 'views');

        /* ── Date range ── */
        if ($request->filled('start_date') && $request->filled('end_date')) {
            $endDate   = Carbon::parse($request->input('end_date'))->endOfDay();
            $startDate = Carbon::parse($request->input('start_date'))->startOfDay();
        } else {
            $days      = (int) $request->input('period', 28);
            $endDate   = now()->endOfDay();
            $startDate = now()->subDays($days - 1)->startOfDay();
        }

        $rangeLen  = (int) $startDate->diffInDays($endDate) + 1;
        $prevEnd   = $startDate->copy()->subDay();
        $prevStart = $prevEnd->copy()->subDays($rangeLen - 1);

        $videoIds        = Video::where('user_id', $user->id)->whereNull('deleted_at')->pluck('id');
        $hasProfileViews = Schema::hasTable('profile_views');

        /* ── Creator analytics rows ── */
        $curRows  = CreatorAnalytic::where('user_id', $user->id)
            ->whereBetween('date', [$startDate->toDateString(), $endDate->toDateString()])
            ->get();
        $prevRows = CreatorAnalytic::where('user_id', $user->id)
            ->whereBetween('date', [$prevStart->toDateString(), $prevEnd->toDateString()])
            ->get();

        /* ── Current period totals ── */
        $curViews    = (int) $curRows->sum('views');
        $curWatchMin = (int) $curRows->sum('watch_time_mins');
        $curLikes    = (int) $curRows->sum('likes');
        $curComments = (int) $curRows->sum('comments');
        $curShares   = (int) $curRows->sum('shares');
        $curSaves    = (int) $curRows->sum('saves');
        $curEarnings = (float) $curRows->sum('earnings');
        $curFollowersGained = max(0, (int) $curRows->sum('new_followers'));

        if ($curRows->isEmpty()) {
            $raw             = $this->rawTotals($videoIds, $startDate, $endDate);
            $curViews        = $raw['views'];
            $curWatchMin     = $raw['watch_time_mins'];
            $curLikes        = $raw['likes'];
            $curComments     = $raw['comments'];
            $curShares       = $raw['shares'];
            $curSaves        = $raw['saves'];
            $curEarnings     = 0.0;
            $curFollowersGained = (int) DB::table('followers')->where('following_id', $user->id)->whereBetween('created_at', [$startDate, $endDate])->count();
            if ($curViews === 0) {
                $curViews = (int) Video::where('user_id', $user->id)->whereNull('deleted_at')->sum('views_count');
            }
        }

        /* ── Profile views ── */
        $curProfileViews = $prevProfileViews = 0;
        if ($hasProfileViews) {
            $curProfileViews  = (int) DB::table('profile_views')->where('profile_user_id', $user->id)->whereBetween('viewed_at', [$startDate, $endDate])->count();
            $prevProfileViews = (int) DB::table('profile_views')->where('profile_user_id', $user->id)->whereBetween('viewed_at', [$prevStart, $prevEnd])->count();
        }

        /* ── Avg watch duration ── */
        $watchSec         = $curWatchMin * 60;
        $avgWatchSec      = $curViews > 0 ? round($watchSec / $curViews, 1) : 0.0;
        $engRate          = $curViews > 0 ? round(($curLikes + $curComments + $curShares + $curSaves) / $curViews * 100, 2) : 0.0;

        /* ── Previous period ── */
        $prevViews    = (int) $prevRows->sum('views');
        $prevWatchMin = (int) $prevRows->sum('watch_time_mins');
        $prevLikes    = (int) $prevRows->sum('likes');
        $prevComments = (int) $prevRows->sum('comments');
        $prevShares   = (int) $prevRows->sum('shares');
        $prevSaves    = (int) $prevRows->sum('saves');
        $prevEarnings = (float) $prevRows->sum('earnings');
        $prevFollowersGained = max(0, (int) $prevRows->sum('new_followers'));

        if ($prevRows->isEmpty()) {
            $prevRaw             = $this->rawTotals($videoIds, $prevStart, $prevEnd);
            $prevViews           = $prevRaw['views'];
            $prevWatchMin        = $prevRaw['watch_time_mins'];
            $prevLikes           = $prevRaw['likes'];
            $prevComments        = $prevRaw['comments'];
            $prevShares          = $prevRaw['shares'];
            $prevSaves           = $prevRaw['saves'];
            $prevEarnings        = 0.0;
            $prevFollowersGained = (int) DB::table('followers')->where('following_id', $user->id)->whereBetween('created_at', [$prevStart, $prevEnd])->count();
        }

        $prevWatchSec    = $prevWatchMin * 60;
        $prevAvgWatchSec = $prevViews > 0 ? round($prevWatchSec / $prevViews, 1) : 0.0;
        $prevEngRate     = $prevViews > 0 ? round(($prevLikes + $prevComments + $prevShares + $prevSaves) / $prevViews * 100, 2) : 0.0;

        /* ── Followers (total + gained in period) ── */
        $profile   = $user->profile;
        $followers = (int) ($profile?->total_followers ?? 0);

        /* ── Main charts ── */
        $args = [$curRows, $startDate, $endDate, $followers, $hasProfileViews, $user->id, $curProfileViews];

        $viewsChart    = $this->buildChart(...array_merge([$curRows, 'views'],           array_slice($args, 1)));
        $watchChart    = $this->buildChart(...array_merge([$curRows, 'watch_time'],      array_slice($args, 1)));
        $follChart     = $this->buildChart(...array_merge([$curRows, 'followers'],       array_slice($args, 1)));
        $engChart      = $this->buildChart(...array_merge([$curRows, 'engagement_rate'], array_slice($args, 1)));

        if ($curRows->isEmpty()) {
            $rawArgs   = [$startDate, $endDate, $videoIds, $user->id, $hasProfileViews, $curViews];
            $viewsChart = $this->buildRawChart('views',           ...$rawArgs);
            $watchChart = $this->buildRawChart('watch_time',      ...$rawArgs);
            $follChart  = $this->buildRawChart('followers',       ...$rawArgs);
            $engChart   = $this->buildRawChart('engagement_rate', ...$rawArgs);
        }

        /* ── Performance overview ── */
        $perfMetric = in_array($metric, ['views','watch_time','followers','engagement_rate','profile_views','likes','comments','shares','estimated_rewards'])
            ? $metric : 'views';
        $perfChart = $this->buildChart(...array_merge([$curRows, $perfMetric], array_slice($args, 1)));
        if ($curRows->isEmpty() || $this->chartIsEmpty($perfChart)) {
            $rawPerf = $this->buildRawChart($perfMetric, $startDate, $endDate, $videoIds, $user->id, $hasProfileViews, $curViews);
            if ($curRows->isEmpty() || !$this->chartIsEmpty($rawPerf)) {
                $perfChart = $rawPerf;
            }
        }

        /* ── Audience ── */
        $trafficSources    = $this->buildCreatorTrafficSources($videoIds, $startDate, $endDate);
        $audienceLocations = $this->buildCreatorAudienceLocations($videoIds, $startDate, $endDate);
        $devicePlatform    = $this->buildCreatorDevicePlatform($videoIds, $startDate, $endDate);

        /* ── Retention ── */
        $retention = $this->buildCreatorRetention($videoIds);

        /* ── Top videos ── */
        $topVideos = $this->buildTopVideos($user->id);

        /* ── Top comments ── */
        $topComments = $this->buildTopComments($videoIds);

        /* ── Smart insights ── */
        $smartInsights = $this->buildSmartInsights($user, $videoIds);

        /* ── Best time ── */
        $tzInput = $request->input('timezone', 'UTC');
        try { new \DateTimeZone($tzInput); $tzName = $tzInput; } catch (\Exception $e) { $tzName = 'UTC'; }
        $bestTime = Cache::remember("bttp:{$user->id}:" . md5($tzName), 900, fn () => $this->computeBestTime($user, $tzName));

        /* ── Summary value helper ── */
        $perfValue  = match ($perfMetric) {
            'watch_time'        => $curWatchMin > 0 ? (int) round($curWatchMin / 60) : 0,
            'avg_watch_duration'=> $avgWatchSec,
            'engagement_rate'   => $engRate,
            'followers_gained'  => $curFollowersGained,
            'profile_views'     => $curProfileViews,
            'likes'             => $curLikes,
            'comments'          => $curComments,
            'shares'            => $curShares,
            'estimated_rewards' => $curEarnings,
            default             => $curViews,
        };
        $perfGrowth = match ($perfMetric) {
            'watch_time'        => $this->growthPct($curWatchMin, $prevWatchMin),
            'avg_watch_duration'=> $this->growthPct($avgWatchSec, $prevAvgWatchSec),
            'engagement_rate'   => $this->growthPct($engRate, $prevEngRate),
            'followers_gained'  => $this->growthPct($curFollowersGained, $prevFollowersGained),
            'profile_views'     => $this->growthPct($curProfileViews, $prevProfileViews),
            'likes'             => $this->growthPct($curLikes, $prevLikes),
            'comments'          => $this->growthPct($curComments, $prevComments),
            'shares'            => $this->growthPct($curShares, $prevShares),
            'estimated_rewards' => $this->growthPct($curEarnings, $prevEarnings),
            default             => $this->growthPct($curViews, $prevViews),
        };

        return response()->json([
            'success' => true,
            'data'    => [
                'period'          => ['start' => $startDate->toDateString(), 'end' => $endDate->toDateString()],
                'previous_period' => ['start' => $prevStart->toDateString(), 'end' => $prevEnd->toDateString()],

                'summary' => [
                    'views'              => ['value' => $curViews,              'growth' => $this->growthPct($curViews, $prevViews)],
                    'watch_time_hours'   => ['value' => $curWatchMin > 0 ? (int) round($curWatchMin / 60) : 0, 'growth' => $this->growthPct($curWatchMin, $prevWatchMin)],
                    'avg_watch_duration' => ['value' => $avgWatchSec,           'growth' => $this->growthPct($avgWatchSec, $prevAvgWatchSec)],
                    'engagement_rate'    => ['value' => $engRate,               'growth' => $this->growthPct($engRate, $prevEngRate)],
                    'followers_gained'   => ['value' => $curFollowersGained,    'growth' => $this->growthPct($curFollowersGained, $prevFollowersGained)],
                    'profile_views'      => ['value' => $curProfileViews,       'growth' => $this->growthPct($curProfileViews, $prevProfileViews)],
                    'likes'              => ['value' => $curLikes,              'growth' => $this->growthPct($curLikes, $prevLikes)],
                    // Already aggregated above for the engagement rate - exposing
                    // them costs no extra query and saves the client three more
                    // round-trips to this (heavy) endpoint just to fill a tile.
                    'comments'           => ['value' => $curComments,           'growth' => $this->growthPct($curComments, $prevComments)],
                    'shares'             => ['value' => $curShares,             'growth' => $this->growthPct($curShares, $prevShares)],
                    'saves'              => ['value' => $curSaves,              'growth' => $this->growthPct($curSaves, $prevSaves)],
                    'estimated_rewards'  => ['value' => $curEarnings,           'growth' => $this->growthPct($curEarnings, $prevEarnings)],
                ],

                'main_charts' => [
                    'views_over_time'   => $viewsChart,
                    'watch_time_growth' => $watchChart,
                    'follower_growth'   => $follChart,
                    'engagement_trend'  => $engChart,
                ],

                'performance_overview' => [
                    'metric' => $perfMetric,
                    'value'  => $perfValue,
                    'growth' => $perfGrowth,
                    'chart'  => $perfChart,
                ],

                'audience' => [
                    'traffic_sources' => $trafficSources,
                    'top_countries'   => $audienceLocations['countries'],
                    'device_platform' => $devicePlatform,
                    'age_groups'      => [],
                    'gender_split'    => [],
                ],

                'retention'          => $retention,
                'top_videos'         => $topVideos,
                'top_comments'       => $topComments,
                'smart_insights'     => $smartInsights,
                'audience_locations' => $audienceLocations,
                'best_time'          => $bestTime,
            ],
        ]);
    }

    /* ── Chart builder ────────────────────────────────────────────────────── */
    private function buildChart($rows, string $metric, Carbon $start, Carbon $end, int $currentFollowers, bool $hasProfileViews, int $userId, int $curProfileViews): array
    {
        $byDate = $rows->keyBy(fn ($r) => $r->date->toDateString());
        $result = [];

        $profileViewsByDate = [];
        if ($metric === 'profile_views' && $hasProfileViews) {
            $pvRows = DB::table('profile_views')
                ->where('profile_user_id', $userId)
                ->whereBetween('viewed_at', [$start->toDateString(), $end->toDateString()])
                ->selectRaw('viewed_at::date as d, COUNT(*) as cnt')
                ->groupBy('d')
                ->pluck('cnt', 'd');
            $profileViewsByDate = $pvRows->all();
        }

        $cur = $start->copy()->startOfDay();
        while ($cur <= $end) {
            $key = $cur->toDateString();
            $row = $byDate->get($key);
            $val = match ($metric) {
                'followers'         => $row ? (float) (($row->new_followers ?? 0) - ($row->lost_followers ?? 0)) : 0.0,
                'profile_views'     => (float) ($profileViewsByDate[$key] ?? 0),
                'likes'             => (float) ($row ? $row->likes    : 0),
                'comments'          => (float) ($row ? $row->comments : 0),
                'shares'            => (float) ($row ? $row->shares   : 0),
                'estimated_rewards' => (float) ($row ? $row->earnings : 0),
                'watch_time'        => (float) ($row ? $row->watch_time_mins : 0),
                'engagement_rate'   => ($row && $row->views > 0)
                    ? round(($row->likes + $row->comments + $row->shares + $row->saves) / $row->views * 100, 2)
                    : 0.0,
                default             => (float) ($row ? $row->views : 0),
            };
            $result[] = ['date' => $key, 'label' => $cur->format('M j'), 'value' => $val];
            $cur->addDay();
        }

        return $result;
    }

    private function rawTotals($videoIds, Carbon $start, Carbon $end): array
    {
        $watchSec = (int) VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('watch_duration')
            ->sum('watch_duration');

        return [
            'views'           => (int) VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count(),
            'watch_time_mins' => (int) round($watchSec / 60),
            'likes'           => (int) VideoLike::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count(),
            'comments'        => (int) VideoComment::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->whereNull('deleted_at')->count(),
            'shares'          => (int) VideoShare::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count(),
            'saves'           => (int) VideoSave::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])->count(),
        ];
    }

    private function chartIsEmpty(array $chart): bool
    {
        return array_sum(array_map(fn ($p) => (float) ($p['value'] ?? 0), $chart)) == 0.0;
    }

    private function buildRawChart(string $metric, Carbon $start, Carbon $end, $videoIds, int $userId, bool $hasProfileViews, int $summaryViews): array
    {
        $views    = $this->dailyCount(VideoView::query()->whereIn('video_id', $videoIds), 'created_at', $start, $end);
        $likes    = $this->dailyCount(VideoLike::query()->whereIn('video_id', $videoIds), 'created_at', $start, $end);
        $comments = $this->dailyCount(VideoComment::query()->whereIn('video_id', $videoIds)->whereNull('deleted_at'), 'created_at', $start, $end);
        $shares   = $this->dailyCount(VideoShare::query()->whereIn('video_id', $videoIds), 'created_at', $start, $end);
        $saves    = $this->dailyCount(VideoSave::query()->whereIn('video_id', $videoIds), 'created_at', $start, $end);
        $watchTime = $this->dailyWatchTime($videoIds, $start, $end);

        $profileViews = [];
        if ($hasProfileViews) {
            $profileViews = DB::table('profile_views')
                ->where('profile_user_id', $userId)
                ->whereBetween('viewed_at', [$start, $end])
                ->selectRaw('viewed_at::date as d, COUNT(*) as v')
                ->groupBy('d')
                ->pluck('v', 'd')
                ->all();
        }

        if ($metric === 'views' && array_sum($views) === 0 && $summaryViews > 0) {
            $views[$end->toDateString()] = $summaryViews;
        }

        $result = [];
        $cur    = $start->copy()->startOfDay();
        while ($cur <= $end) {
            $key   = $cur->toDateString();
            $value = match ($metric) {
                'watch_time'        => (float) ($watchTime[$key] ?? 0),
                'followers'         => (float) $this->dailyNewFollowers($userId, $key),
                'engagement_rate'   => (float) $this->dailyEngagementRate($key, $views, $likes, $comments, $shares, $saves),
                'profile_views'     => (float) ($profileViews[$key] ?? 0),
                'likes'             => (float) ($likes[$key] ?? 0),
                'comments'          => (float) ($comments[$key] ?? 0),
                'shares'            => (float) ($shares[$key] ?? 0),
                'estimated_rewards' => 0.0,
                default             => (float) ($views[$key] ?? 0),
            };
            $result[] = ['date' => $key, 'label' => $cur->format('M j'), 'value' => $value];
            $cur->addDay();
        }

        return $result;
    }

    /* ── Overview-specific helpers ──────────────────────────────────────── */

    private function buildCreatorTrafficSources($videoIds, Carbon $start, Carbon $end): array
    {
        if ($videoIds->isEmpty()) return [];

        $rows = VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('source')
            ->selectRaw('source, COUNT(*) as cnt')
            ->groupBy('source')
            ->orderByDesc('cnt')
            ->get();

        if ($rows->isEmpty()) return [];

        $total    = $rows->sum('cnt');
        $labelMap = [
            'for_you'   => 'For You Page',
            'following' => 'Following',
            'explore'   => 'Explore',
            'profile'   => 'Profile',
            'search'    => 'Search',
            'hashtag'   => 'Hashtags',
            'other'     => 'Other',
        ];

        return $rows->map(fn ($r) => [
            'source' => $labelMap[$r->source] ?? ucfirst(str_replace('_', ' ', $r->source)),
            'count'  => (int) $r->cnt,
            'pct'    => $total > 0 ? round($r->cnt / $total * 100, 1) : 0.0,
        ])->values()->all();
    }

    private function buildCreatorAudienceLocations($videoIds, Carbon $start, Carbon $end): array
    {
        if ($videoIds->isEmpty()) return ['countries' => [], 'cities' => []];

        $countryRows  = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])
            ->whereNotNull('country')->selectRaw('country, COUNT(*) as cnt')->groupBy('country')->orderByDesc('cnt')->limit(10)->get();
        $totalCountry = $countryRows->sum('cnt');
        $countries    = $countryRows->map(fn ($r) => [
            'name'  => $r->country,
            'count' => (int) $r->cnt,
            'pct'   => $totalCountry > 0 ? round($r->cnt / $totalCountry * 100, 1) : 0.0,
        ])->values()->all();

        $cityRows  = VideoView::whereIn('video_id', $videoIds)->whereBetween('created_at', [$start, $end])
            ->whereNotNull('city')->selectRaw('city, COUNT(*) as cnt')->groupBy('city')->orderByDesc('cnt')->limit(10)->get();
        $totalCity = $cityRows->sum('cnt');
        $cities    = $cityRows->map(fn ($r) => [
            'name'  => $r->city,
            'count' => (int) $r->cnt,
            'pct'   => $totalCity > 0 ? round($r->cnt / $totalCity * 100, 1) : 0.0,
        ])->values()->all();

        return ['countries' => $countries, 'cities' => $cities];
    }

    private function buildCreatorDevicePlatform($videoIds, Carbon $start, Carbon $end): array
    {
        if ($videoIds->isEmpty() || !Schema::hasColumn('video_views', 'device_type')) return [];

        $rows = VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('device_type')
            ->selectRaw('device_type, COUNT(*) as cnt')
            ->groupBy('device_type')
            ->orderByDesc('cnt')
            ->get();

        if ($rows->isEmpty()) return [];

        $total = $rows->sum('cnt');
        return $rows->map(fn ($r) => [
            'device' => ucfirst($r->device_type),
            'count'  => (int) $r->cnt,
            'pct'    => $total > 0 ? round($r->cnt / $total * 100, 1) : 0.0,
        ])->values()->all();
    }

    private function buildCreatorRetention($videoIds): array
    {
        if ($videoIds->isEmpty()) return ['average' => 0, 'curve' => []];

        $rows = VideoView::whereIn('video_id', $videoIds)
            ->whereNotNull('watch_duration')
            ->pluck('watch_duration');

        if ($rows->isEmpty()) return ['average' => 0, 'curve' => []];

        $avgDuration = Video::whereIn('id', $videoIds)->where('duration', '>', 0)->avg('duration') ?? 0;
        if ($avgDuration <= 0) return ['average' => 0, 'curve' => []];

        $total  = $rows->count();
        $avgSec = $rows->avg() ?? 0;
        $avgPct = min(100, (int) round($avgSec / $avgDuration * 100));

        $checkpoints = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
        $curve = [];
        foreach ($checkpoints as $cp) {
            $threshold = ($cp / 100) * $avgDuration;
            $reached   = $rows->filter(fn ($w) => $w >= $threshold)->count();
            $curve[]   = ['pct' => $cp, 'retention' => $total > 0 ? (int) round($reached / $total * 100) : 0];
        }

        return ['average' => $avgPct, 'curve' => $curve];
    }

    private function buildTopVideos(int $userId): array
    {
        $disk   = config('filesystems.default', 'local');
        $videos = Video::where('user_id', $userId)
            ->whereNull('deleted_at')
            ->where('status', 'published')
            ->orderByDesc('views_count')
            ->limit(5)
            ->get();

        return $videos->map(fn ($v) => [
            'id'         => $v->id,
            'title'      => $v->title ?? $v->caption ?? 'Untitled',
            'thumbnail'  => $v->thumbnail_url ? Storage::disk($disk)->url($v->thumbnail_url) : null,
            'views'      => (int) ($v->views_count   ?? 0),
            'likes'      => (int) ($v->likes_count   ?? 0),
            'comments'   => (int) ($v->comments_count ?? 0),
            'shares'     => (int) ($v->shares_count   ?? 0),
            'duration'   => (float) ($v->duration ?? 0),
            'watch_time_hours' => round(
                VideoView::where('video_id', $v->id)->whereNotNull('watch_duration')->sum('watch_duration') / 3600,
                1,
            ),
            'engagement' => $v->views_count > 0
                ? round(($v->likes_count + $v->comments_count + $v->shares_count + ($v->saves_count ?? 0)) / $v->views_count * 100, 1)
                : 0.0,
            'created_at'     => $v->created_at?->format('M j, Y') ?? '',
            'created_at_iso' => $v->created_at?->toIso8601String(),
        ])->values()->all();
    }

    private function buildTopComments($videoIds): array
    {
        if ($videoIds->isEmpty()) return [];

        $disk = config('filesystems.default', 'local');

        return VideoComment::with('user')
            ->whereIn('video_id', $videoIds)
            ->whereNull('parent_id')
            ->whereNull('deleted_at')
            ->orderByDesc('likes_count')
            ->limit(5)
            ->get()
            ->map(fn ($c) => [
                'id'       => $c->id,
                'username' => $c->user?->username ?? 'unknown',
                'name'     => $c->user?->name     ?? 'User',
                'avatar'   => $c->user?->avatar ? Storage::disk($disk)->url($c->user->avatar) : StorageService::defaultAvatarUrl(),
                'text'     => $c->body ?? '',
                'likes'    => (int) ($c->likes_count ?? 0),
                'date'     => $c->created_at?->toDateString() ?? '',
            ])->values()->all();
    }

    private function buildSmartInsights($user, $videoIds): array
    {
        $insights = [];

        // Best posting hour
        $bttp = $this->computeBestTime($user, 'UTC');
        $insights[] = [
            'type'   => 'best_posting_hour',
            'icon'   => 'clock',
            'label'  => 'Best Posting Hour',
            'value'  => $bttp['bestTime'],
            'detail' => $bttp['hasEnoughData']
                ? 'Based on your historical engagement.'
                : 'Based on general audience patterns.',
        ];

        // Highest retention video
        $topRetention = Video::whereIn('id', $videoIds)
            ->where('duration', '>', 0)
            ->where('views_count', '>', 0)
            ->get()
            ->map(function ($v) {
                $avgWatch  = VideoView::where('video_id', $v->id)->whereNotNull('watch_duration')->avg('watch_duration') ?? 0;
                $retention = $v->duration > 0 ? min(100, (int) round($avgWatch / $v->duration * 100)) : 0;
                return ['title' => $v->title ?? $v->caption ?? 'Untitled', 'retention' => $retention, 'id' => $v->id];
            })
            ->sortByDesc('retention')
            ->first();

        if ($topRetention) {
            $insights[] = [
                'type'   => 'highest_retention',
                'icon'   => 'heart',
                'label'  => 'Highest Retention Content',
                'value'  => $topRetention['title'],
                'detail' => "has {$topRetention['retention']}% average retention.",
            ];
        }

        // Most viewed video
        $topVideo = Video::whereIn('id', $videoIds)
            ->where('views_count', '>', 0)
            ->orderByDesc('views_count')
            ->select(['id', 'title', 'caption', 'views_count'])
            ->first();

        if ($topVideo) {
            $views = number_format((int) $topVideo->views_count);
            $insights[] = [
                'type'   => 'top_video',
                'icon'   => 'play',
                'label'  => 'Top Performing Video',
                'value'  => $topVideo->title ?? $topVideo->caption ?? 'Untitled',
                'detail' => "{$views} total views.",
            ];
        }

        return $insights;
    }

    /* ── Daily helpers ──────────────────────────────────────────────────── */
    private function dailyCount($query, string $column, Carbon $start, Carbon $end): array
    {
        // Whitelist the column name. Every caller already passes a fixed literal,
        // but this guarantees the raw selectRaw below can never be injected.
        $column = in_array($column, ['created_at', 'updated_at', 'published_at'], true) ? $column : 'created_at';

        return $query->whereBetween($column, [$start, $end])
            ->selectRaw("{$column}::date as d, COUNT(*) as v")
            ->groupBy('d')->pluck('v', 'd')->all();
    }

    private function dailyWatchTime($videoIds, Carbon $start, Carbon $end): array
    {
        return VideoView::whereIn('video_id', $videoIds)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('watch_duration')
            ->selectRaw('created_at::date as d, ROUND(SUM(watch_duration) / 60.0) as v')
            ->groupBy('d')->pluck('v', 'd')->all();
    }

    private function dailyNewFollowers(int $userId, string $date): int
    {
        return (int) DB::table('followers')->where('following_id', $userId)->whereDate('created_at', $date)->count();
    }

    private function dailyEngagementRate(string $date, array $views, array $likes, array $comments, array $shares, array $saves): float
    {
        $viewCount = (int) ($views[$date] ?? 0);
        if ($viewCount <= 0) return 0.0;
        $interactions = ($likes[$date] ?? 0) + ($comments[$date] ?? 0) + ($shares[$date] ?? 0) + ($saves[$date] ?? 0);
        return round($interactions / $viewCount * 100, 2);
    }

    /* ── Best time to post ──────────────────────────────────────────────── */
    public function bestTimeToPost(Request $request): JsonResponse
    {
        $user    = $request->user();
        $tzInput = $request->input('timezone', 'UTC');
        $range   = $request->input('range', 'all');
        try { new \DateTimeZone($tzInput); $tzName = $tzInput; } catch (\Exception $e) { $tzName = 'UTC'; }
        $cacheKey = "bttp:{$user->id}:" . md5($tzName . $range);
        $result   = Cache::remember($cacheKey, 900, fn () => $this->computeBestTime($user, $tzName, $range));
        return response()->json(['success' => true, 'data' => $result]);
    }

    private function computeBestTime($user, string $tzName, string $range = 'all'): array
    {
        $tz             = new \DateTimeZone($tzName);
        $dayNames       = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
        $defaultPattern = [18,12,10,8,6,7,14,20,25,32,38,46,55,48,40,36,44,58,72,84,100,75,62,50];
        $defaultActivity = array_map(fn ($h) => [
            'hour'        => $h,
            'label'       => $this->hourLabel($h),
            'score'       => $defaultPattern[$h],
            'posts_count' => 0,
        ], range(0, 23));
        // 7×24 fallback grid (day-of-week × hour, 0=Sunday) - same shape as the
        // real heatmap below so the UI never has to special-case "no data yet".
        $defaultHeatmap = array_fill(0, 7, $defaultPattern);

        $query = Video::where('user_id', $user->id)
            ->whereNull('deleted_at')
            ->where('status', 'published')
            ->select(['id','created_at','views_count','likes_count','comments_count','shares_count','saves_count','duration']);

        if ($range !== 'all') {
            $days = match($range) { '7d' => 7, '28d' => 28, '90d' => 90, default => null };
            if ($days) $query->where('created_at', '>=', now()->subDays($days));
        }

        $videos     = $query->get();
        $totalViews = (int) $videos->sum('views_count');

        // Require at least 3 published videos AND 100 total views for personalised data.
        if ($videos->count() < 3 || $totalViews < 100) {
            return [
                'bestDay'        => 'Today',
                'bestTime'       => '8:00 PM',
                'bestHour'       => 20,
                'timezone'       => $tzName,
                'hasEnoughData'  => false,
                'confidence'     => 0,
                'message'        => 'Based on general activity - post more for personalized data.',
                'activityByHour' => $defaultActivity,
                'heatmap'        => $defaultHeatmap,
            ];
        }

        $videoIds = $videos->pluck('id');
        $watchMap = DB::table('video_views')
            ->whereIn('video_id', $videoIds)
            ->whereNotNull('watch_duration')
            ->groupBy('video_id')
            ->selectRaw('video_id, AVG(watch_duration) as avg_watch')
            ->get()->keyBy('video_id');

        // Bucket by [day-of-week][hour] to find the real best day+time combination.
        // Also bucket by hour-only for the 24-bar chart.
        $dayHourBuckets = [];
        $hourBuckets    = array_fill(0, 24, ['total' => 0.0, 'count' => 0]);

        foreach ($videos as $v) {
            $localDt   = Carbon::parse($v->created_at)->setTimezone($tz);
            $localHour = (int) $localDt->format('G');    // 0–23
            $localDay  = (int) $localDt->format('w');    // 0=Sunday … 6=Saturday
            $avgWatch  = (float) ($watchMap->get($v->id)?->avg_watch ?? 0);
            $duration  = max((int) ($v->duration ?? 0), 1);
            $completion = min($avgWatch / $duration, 1.0);

            // Weighted engagement score matching the spec formula
            $score = ($v->views_count ?? 0) * 0.35
                   + $avgWatch            * 0.25
                   + ($v->likes_count     ?? 0) * 0.15
                   + ($v->comments_count  ?? 0) * 0.10
                   + ($v->shares_count    ?? 0) * 0.10
                   + ($v->saves_count     ?? 0) * 0.05
                   + $completion * 5;

            $key = "{$localDay}_{$localHour}";
            if (!isset($dayHourBuckets[$key])) {
                $dayHourBuckets[$key] = ['day' => $localDay, 'hour' => $localHour, 'total' => 0.0, 'count' => 0];
            }
            $dayHourBuckets[$key]['total'] += $score;
            $dayHourBuckets[$key]['count']++;

            $hourBuckets[$localHour]['total'] += $score;
            $hourBuckets[$localHour]['count']++;
        }

        // Best day+hour = highest average score across all day/hour buckets
        $bestDayIdx  = 0;
        $bestHour    = 20;
        $bestBucketAvg = 0.0;
        foreach ($dayHourBuckets as $bucket) {
            $avg = $bucket['count'] > 0 ? $bucket['total'] / $bucket['count'] : 0.0;
            if ($avg > $bestBucketAvg) {
                $bestBucketAvg = $avg;
                $bestDayIdx    = (int) $bucket['day'];
                $bestHour      = (int) $bucket['hour'];
            }
        }

        // Normalise hour-chart scores to 0–100
        $hourAvgs = array_map(fn ($b) => $b['count'] > 0 ? $b['total'] / $b['count'] : 0.0, $hourBuckets);
        $maxAvg   = max($hourAvgs) ?: 1;

        $activityByHour = array_map(fn ($h) => [
            'hour'        => $h,
            'label'       => $this->hourLabel($h),
            'score'       => (int) round($hourAvgs[$h] / $maxAvg * 100),
            'posts_count' => $hourBuckets[$h]['count'],
        ], range(0, 23));

        // Full 7×24 heatmap (day-of-week × hour, 0=Sunday), normalised 0–100
        // against the single busiest day/hour cell - the "Best Time To Post" grid.
        $dayHourAvgs = [];
        foreach ($dayHourBuckets as $bucket) {
            $dayHourAvgs["{$bucket['day']}_{$bucket['hour']}"] = $bucket['count'] > 0 ? $bucket['total'] / $bucket['count'] : 0.0;
        }
        $maxDayHourAvg = $dayHourAvgs ? max($dayHourAvgs) : 1.0;
        $heatmap = [];
        for ($d = 0; $d < 7; $d++) {
            $row = [];
            for ($h = 0; $h < 24; $h++) {
                $avg = $dayHourAvgs["{$d}_{$h}"] ?? 0.0;
                $row[] = $maxDayHourAvg > 0 ? (int) round($avg / $maxDayHourAvg * 100) : 0;
            }
            $heatmap[] = $row;
        }

        $bestDayName = $dayNames[$bestDayIdx];
        $bestTime    = (new \DateTime('now', $tz))->setTime($bestHour, 0, 0)->format('g:i A');

        // Confidence: grows with post count, capped at 100
        $postCount  = $videos->count();
        $confidence = (int) min(100, round(($postCount / 20) * 100));

        return [
            'bestDay'        => $bestDayName,
            'bestTime'       => $bestTime,
            'bestHour'       => $bestHour,
            'timezone'       => $tzName,
            'hasEnoughData'  => true,
            'confidence'     => $confidence,
            'message'        => 'Your audience is most active around this time.',
            'activityByHour' => $activityByHour,
            'heatmap'        => $heatmap,
        ];
    }

    private function hourLabel(int $h): string
    {
        if ($h === 0)  return '12AM';
        if ($h === 12) return '12PM';
        return $h < 12 ? "{$h}AM" : ($h - 12) . 'PM';
    }

    private function growthPct(float $current, float $previous): array
    {
        if ($previous == 0) return ['pct' => $current > 0 ? 100.0 : 0.0, 'up' => $current > 0];
        $pct = round(($current - $previous) / $previous * 100, 1);
        return ['pct' => (float) abs($pct), 'up' => $pct >= 0];
    }
}
