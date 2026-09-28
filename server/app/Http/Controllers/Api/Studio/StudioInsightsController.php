<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Http\Resources\VideoResource;
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
use Illuminate\Support\Facades\Storage;

class StudioInsightsController extends Controller
{
    public function show(Request $request, int $id): JsonResponse
    {
        $request->validate([
            'metric'     => ['nullable', 'in:views,likes,comments,shares,saves,watch_time,avg_watch_duration,engagement_rate'],
            'start_date' => ['nullable', 'date'],
            'end_date'   => ['nullable', 'date'],
        ]);

        $user  = $request->user();
        $video = Video::with(['hashtags'])
            ->where('user_id', $user->id)
            ->findOrFail($id);

        $metric = $request->input('metric', 'views');

        /* ── Date range ── */
        if ($request->filled('start_date') && $request->filled('end_date')) {
            $endDate   = Carbon::parse($request->input('end_date'))->endOfDay();
            $startDate = Carbon::parse($request->input('start_date'))->startOfDay();
        } else {
            $endDate   = now()->endOfDay();
            $startDate = now()->subDays(6)->startOfDay();
        }

        $rangeLen  = (int) $startDate->diffInDays($endDate) + 1;
        $prevEnd   = $startDate->copy()->subDay();
        $prevStart = $prevEnd->copy()->subDays($rangeLen - 1);

        /* ── Current period raw counts ── */
        $curViews    = VideoView::where('video_id', $id)->whereBetween('created_at', [$startDate, $endDate])->count();
        $curLikes    = VideoLike::where('video_id', $id)->whereBetween('created_at', [$startDate, $endDate])->count();
        $curComments = VideoComment::where('video_id', $id)->whereBetween('created_at', [$startDate, $endDate])->whereNull('deleted_at')->count();
        $curShares   = VideoShare::where('video_id', $id)->whereBetween('created_at', [$startDate, $endDate])->count();
        $curSaves    = VideoSave::where('video_id', $id)->whereBetween('created_at', [$startDate, $endDate])->count();

        $watchRow    = VideoView::where('video_id', $id)
            ->whereBetween('created_at', [$startDate, $endDate])
            ->whereNotNull('watch_duration')
            ->selectRaw('SUM(watch_duration) as total_sec, AVG(watch_duration) as avg_sec')
            ->first();
        $curWatchSec = (int) ($watchRow?->total_sec ?? 0);
        $curAvgWatch = $curViews > 0 ? (int) round((float) ($watchRow?->avg_sec ?? 0)) : 0;
        $curEngRate  = $curViews > 0
            ? round(($curLikes + $curComments + $curShares + $curSaves) / $curViews * 100, 1)
            : 0.0;

        /* ── Previous period raw counts ── */
        $prevViews    = VideoView::where('video_id', $id)->whereBetween('created_at', [$prevStart, $prevEnd])->count();
        $prevLikes    = VideoLike::where('video_id', $id)->whereBetween('created_at', [$prevStart, $prevEnd])->count();
        $prevComments = VideoComment::where('video_id', $id)->whereBetween('created_at', [$prevStart, $prevEnd])->whereNull('deleted_at')->count();
        $prevShares   = VideoShare::where('video_id', $id)->whereBetween('created_at', [$prevStart, $prevEnd])->count();
        $prevSaves    = VideoSave::where('video_id', $id)->whereBetween('created_at', [$prevStart, $prevEnd])->count();

        $prevWatchRow = VideoView::where('video_id', $id)
            ->whereBetween('created_at', [$prevStart, $prevEnd])
            ->whereNotNull('watch_duration')
            ->selectRaw('SUM(watch_duration) as total_sec, AVG(watch_duration) as avg_sec')
            ->first();
        $prevWatchSec = (int) ($prevWatchRow?->total_sec ?? 0);
        $prevAvgWatch = $prevViews > 0 ? (int) round((float) ($prevWatchRow?->avg_sec ?? 0)) : 0;
        $prevEngRate  = $prevViews > 0
            ? round(($prevLikes + $prevComments + $prevShares + $prevSaves) / $prevViews * 100, 1)
            : 0.0;

        /* ── Chart ── */
        $chart = $this->buildChart($id, $metric, $startDate, $endDate);

        /* ── Audience retention ── */
        $retention = $this->buildRetention($id, $video->duration);

        /* ── Traffic sources ── */
        $trafficSources = $this->buildTrafficSources($id, $startDate, $endDate);

        /* ── Audience locations ── */
        $audienceLocations = $this->buildAudienceLocations($id, $startDate, $endDate);

        /* ── Top comments ── */
        $disk        = config('filesystems.default', 'local');
        $topComments = VideoComment::with('user')
            ->where('video_id', $id)
            ->whereNull('parent_id')
            ->whereNull('deleted_at')
            ->orderByDesc('likes_count')
            ->limit(5)
            ->get()
            ->map(fn ($c) => [
                'id'       => $c->id,
                'username' => $c->user?->username ?? 'unknown',
                'name'     => $c->user?->name     ?? 'User',
                'avatar'   => $c->user?->avatar
                    ? Storage::disk($disk)->url($c->user->avatar)
                    : StorageService::defaultAvatarUrl(),
                'text'     => $c->body ?? '',
                'likes'    => $c->likes_count ?? 0,
                'date'     => $c->created_at?->format('M d') ?? '',
            ]);

        return response()->json([
            'success' => true,
            'data'    => [
                'video'              => new VideoResource($video),
                'period'             => ['start' => $startDate->toDateString(), 'end' => $endDate->toDateString()],
                'previous_period'    => ['start' => $prevStart->toDateString(), 'end' => $prevEnd->toDateString()],
                'summary'            => [
                    'views'              => $this->growth($curViews, $prevViews),
                    'likes'              => $this->growth($curLikes, $prevLikes),
                    'comments'           => $this->growth($curComments, $prevComments),
                    'shares'             => $this->growth($curShares, $prevShares),
                    'saves'              => $this->growth($curSaves, $prevSaves),
                    'watch_time_seconds' => $this->growth($curWatchSec, $prevWatchSec),
                    'watch_time_hours'   => $curWatchSec > 0 ? round($curWatchSec / 3600, 1) : 0,
                    'avg_watch_duration' => $this->growth($curAvgWatch, $prevAvgWatch),
                    'engagement_rate'    => $this->growth($curEngRate, $prevEngRate),
                ],
                'chart'              => $chart,
                'retention'          => $retention,
                'traffic_sources'    => $trafficSources,
                'audience_locations' => $audienceLocations,
                'top_comments'       => $topComments,
            ],
        ]);
    }

    /* ── Chart: one GROUP BY query per metric, fill gaps with 0 ── */
    private function buildChart(int $videoId, string $metric, Carbon $start, Carbon $end): array
    {
        $byDate = match ($metric) {
            'likes'    => VideoLike::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])
                ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd')->all(),
            'comments' => VideoComment::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])->whereNull('deleted_at')
                ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd')->all(),
            'shares'   => VideoShare::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])
                ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd')->all(),
            'saves'    => VideoSave::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])
                ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd')->all(),
            'watch_time' => VideoView::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])->whereNotNull('watch_duration')
                ->selectRaw('created_at::date as d, SUM(watch_duration) as v')->groupBy('d')->pluck('v', 'd')->all(),
            'avg_watch_duration' => VideoView::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])->whereNotNull('watch_duration')
                ->selectRaw('created_at::date as d, ROUND(AVG(watch_duration)) as v')->groupBy('d')->pluck('v', 'd')->all(),
            'engagement_rate' => $this->engRateByDate($videoId, $start, $end),
            default           => VideoView::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])
                ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd')->all(),
        };

        $result = [];
        $cur    = $start->copy()->startOfDay();
        while ($cur <= $end) {
            $key      = $cur->toDateString();
            $result[] = ['date' => $key, 'label' => $cur->format('M j'), 'value' => (float) ($byDate[$key] ?? 0)];
            $cur->addDay();
        }
        return $result;
    }

    private function engRateByDate(int $videoId, Carbon $start, Carbon $end): array
    {
        $views = VideoView::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])
            ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd');
        $likes = VideoLike::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])
            ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd');
        $comms = VideoComment::where('video_id', $videoId)->whereBetween('created_at', [$start, $end])->whereNull('deleted_at')
            ->selectRaw('created_at::date as d, COUNT(*) as v')->groupBy('d')->pluck('v', 'd');

        $result = [];
        foreach ($views as $d => $v) {
            $interactions = ($likes[$d] ?? 0) + ($comms[$d] ?? 0);
            $result[$d]   = $v > 0 ? round($interactions / $v * 100, 1) : 0;
        }
        return $result;
    }

    private function buildRetention(int $videoId, ?float $duration): array
    {
        if (! $duration || $duration <= 0) {
            return ['average' => 0, 'segments' => []];
        }

        $rows = VideoView::where('video_id', $videoId)->whereNotNull('watch_duration')->pluck('watch_duration');
        if ($rows->isEmpty()) {
            return ['average' => 0, 'segments' => []];
        }

        $total  = $rows->count();
        $avgSec = $rows->avg();
        $avgPct = min(100, (int) round($avgSec / $duration * 100));

        $checkpoints = [0.0, 0.25, 0.50, 0.75];
        $segments    = [];
        foreach ($checkpoints as $pct) {
            $threshold  = $pct * $duration;
            $nextPct    = min(1.0, $pct + 0.25);
            $reached    = $rows->filter(fn ($w) => $w >= $threshold)->count();
            $segments[] = [
                'label'     => $this->fmtSec($threshold) . ' – ' . $this->fmtSec($nextPct * $duration),
                'retention' => $total > 0 ? (int) round($reached / $total * 100) : 0,
            ];
        }

        return ['average' => $avgPct, 'segments' => $segments];
    }

    private function buildTrafficSources(int $videoId, Carbon $start, Carbon $end): array
    {
        $rows = VideoView::where('video_id', $videoId)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('source')
            ->selectRaw('source, COUNT(*) as cnt')
            ->groupBy('source')
            ->orderByDesc('cnt')
            ->get();

        if ($rows->isEmpty()) {
            return [];
        }

        $total = $rows->sum('cnt');

        $labelMap = [
            'for_you'   => 'For You',
            'following' => 'Following',
            'explore'   => 'Explore',
            'profile'   => 'Profile',
            'search'    => 'Search',
            'other'     => 'Other',
        ];

        return $rows->map(fn ($r) => [
            'source' => $labelMap[$r->source] ?? ucfirst(str_replace('_', ' ', $r->source)),
            'count'  => (int) $r->cnt,
            'pct'    => $total > 0 ? round($r->cnt / $total * 100, 1) : 0.0,
        ])->values()->all();
    }

    private function buildAudienceLocations(int $videoId, Carbon $start, Carbon $end): array
    {
        /* Countries */
        $countryRows = VideoView::where('video_id', $videoId)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('country')
            ->selectRaw('country, COUNT(*) as cnt')
            ->groupBy('country')
            ->orderByDesc('cnt')
            ->limit(5)
            ->get();

        $totalCountry = $countryRows->sum('cnt');
        $countries    = $countryRows->map(fn ($r) => [
            'name'  => $r->country,
            'count' => (int) $r->cnt,
            'pct'   => $totalCountry > 0 ? round($r->cnt / $totalCountry * 100, 1) : 0.0,
        ])->values()->all();

        /* Cities */
        $cityRows = VideoView::where('video_id', $videoId)
            ->whereBetween('created_at', [$start, $end])
            ->whereNotNull('city')
            ->selectRaw('city, COUNT(*) as cnt')
            ->groupBy('city')
            ->orderByDesc('cnt')
            ->limit(5)
            ->get();

        $totalCity = $cityRows->sum('cnt');
        $cities    = $cityRows->map(fn ($r) => [
            'name'  => $r->city,
            'count' => (int) $r->cnt,
            'pct'   => $totalCity > 0 ? round($r->cnt / $totalCity * 100, 1) : 0.0,
        ])->values()->all();

        return [
            'countries' => $countries,
            'cities'    => $cities,
        ];
    }

    private function fmtSec(float $s): string
    {
        return sprintf('%d:%02d', (int) floor($s / 60), (int) floor(fmod($s, 60)));
    }

    private function growth(float $current, float $previous): array
    {
        if ($previous == 0) {
            return ['value' => $current, 'pct' => $current > 0 ? 100.0 : 0.0, 'up' => $current > 0];
        }
        $raw = ($current - $previous) / $previous * 100;
        return ['value' => $current, 'pct' => round(abs($raw), 1), 'up' => $raw >= 0];
    }
}
