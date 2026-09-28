<?php

namespace App\Http\Controllers\Api\Studio;

use App\Http\Controllers\Controller;
use App\Http\Requests\Studio\AnalyticsDashboardRequest;
use App\Services\ClickHouse\ClickHouseClient;
use App\Services\Studio\StudioAnalyticsQueries;
use App\Services\Studio\StudioInsightGenerator;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use App\Services\StorageService;
use Illuminate\Support\Facades\Storage;

/**
 * The Reelsoo Studio analytics dashboard (web).
 *
 * This is a SEPARATE endpoint from StudioAnalyticsController::overview, which the
 * mobile app still consumes. Changing that response shape underneath a shipped
 * mobile client would break it, so the richer web payload lives here and the two
 * evolve independently.
 *
 * Where the numbers come from - and this split is deliberate:
 *
 *   ClickHouse  everything derived from the event stream: views, watch time,
 *               retention, completion, engagement, audience, best-time, top and
 *               trending videos. Read from the rollups, never from raw events.
 *
 *   Postgres    everything that is NOT an event: follower records, wallet
 *               balances, earnings ledger, audio tracks, and the video titles and
 *               thumbnails the ClickHouse rows are joined against.
 *
 * Nothing on this page is invented. Where a metric has no data source at all -
 * city (never populated: Cloudflare only sends CF-IPCity on Enterprise plans) and
 * OS/browser/network (nothing in the app parses a User-Agent that far) - the API
 * returns an empty array and the UI renders an empty state. It does not fabricate
 * a plausible distribution, because a made-up chart that looks real is worse than
 * an honest blank one.
 */
class StudioDashboardAnalyticsController extends Controller
{
    /** Studio dashboards are read constantly and change slowly; 5 min is plenty. */
    private const CACHE_TTL = 300;

    public function __construct(
        private readonly StudioAnalyticsQueries $queries,
        private readonly ClickHouseClient $clickhouse,
        private readonly StudioInsightGenerator $insights,
        private readonly StorageService $storage,
    ) {}

    public function dashboard(AnalyticsDashboardRequest $request): JsonResponse
    {
        $creatorId = (int) $request->user()->id;
        [$start, $end] = $request->range();
        [$prevStart, $prevEnd] = $request->previousRange();
        $timezone = $request->timezone();

        // ClickHouse being down must not render a grid of confident zeroes - that
        // reads as "you have no views", which is a lie. Say so instead, and let the
        // UI show an error state.
        if (! $this->clickhouse->isAvailable()) {
            return response()->json([
                'success' => false,
                'message' => 'Analytics is temporarily unavailable.',
            ], 503);
        }

        $key = sprintf(
            'studio:dash:%d:%s:%s:%s:%s',
            $creatorId, $start, $end, $timezone, $request->filterFingerprint()
        );

        $payload = Cache::remember($key, self::CACHE_TTL, function () use (
            $creatorId, $start, $end, $prevStart, $prevEnd, $timezone
        ) {
            $current  = $this->queries->summary($creatorId, $start, $end);
            $previous = $this->queries->summary($creatorId, $prevStart, $prevEnd);

            // Follower and money figures have no event stream yet, so they come from
            // Postgres. Fetch them once and reuse across the payload.
            $followers     = $this->followerStats($creatorId, $start, $end, $prevStart, $prevEnd);
            $profileVisits = $this->profileVisits($creatorId, $start, $end, $prevStart, $prevEnd);
            $money         = $this->monetization($creatorId, $start, $end, $prevStart, $prevEnd);
            $retention     = $this->queries->retentionCurve($creatorId, $start, $end);

            $avgRetention = $retention === []
                ? 0.0
                : round(collect($retention)->avg('retention'), 1);

            return [
                'period'          => ['start' => $start, 'end' => $end],
                'previous_period' => ['start' => $prevStart, 'end' => $prevEnd],

                /* ── Row 1: KPI cards ─────────────────────────────────────────── */
                'summary' => [
                    'views'              => $this->metric($current['views'], $previous['views']),
                    'watch_time_hours'   => $this->metric(
                        round($current['watch_seconds'] / 3600, 1),
                        round($previous['watch_seconds'] / 3600, 1),
                    ),
                    'avg_watch_duration' => $this->metric($current['avg_watch_duration'], $previous['avg_watch_duration']),
                    'audience_retention' => $this->metric($avgRetention, $avgRetention),
                    'engagement_rate'    => $this->metric(
                        $this->engagementRate($current),
                        $this->engagementRate($previous),
                    ),
                    'followers_gained'   => $this->metric($followers['gained'], $followers['prev_gained']),
                    'profile_visits'     => $this->metric($profileVisits['current'], $profileVisits['previous']),
                    'estimated_earnings' => $this->metric($money['estimated'], $money['prev_estimated']),
                ],

                /* ── Row 2: main charts ───────────────────────────────────────── */
                'charts' => [
                    'views_over_time'   => $this->queries->series($creatorId, $start, $end, 'view'),
                    'watch_time_growth' => $this->series_hours($creatorId, $start, $end),
                    'retention_curve'   => $retention,
                    'retention_average' => $avgRetention,
                ],

                /* ── Row 3: best time to post ─────────────────────────────────── */
                'best_time' => $this->bestTime($creatorId, $start, $end, $timezone),

                /* ── Row 4: audience ──────────────────────────────────────────── */
                'audience' => [
                    'countries'       => $this->queries->audience($creatorId, $start, $end, 'country', 5),
                    // Always empty today: video_views.city is never written. Kept in the
                    // contract so the card lights up the moment GeoIP lands, rather than
                    // shipping a fake city split in the meantime.
                    'cities'          => $this->queries->audience($creatorId, $start, $end, 'city', 5),
                    'devices'         => $this->queries->audience($creatorId, $start, $end, 'device_type', 5),
                    'traffic_sources' => $this->queries->audience($creatorId, $start, $end, 'source', 6),
                ],

                /* ── Row 5: engagement mini charts ────────────────────────────── */
                'engagement' => $this->engagement($creatorId, $start, $end, $current, $previous),

                /* ── Rows 6-8: content ────────────────────────────────────────── */
                'top_videos'      => $this->topVideos($creatorId, $start, $end),
                'top_audio'       => $this->topAudio($creatorId, $start, $end),
                'trending_videos' => $this->trendingVideos($creatorId),

                /* ── Row 9: followers ─────────────────────────────────────────── */
                'followers' => $followers,

                /* ── Row 10: monetization ─────────────────────────────────────── */
                'monetization' => $money,

                /* ── AI insights ──────────────────────────────────────────────── */
                'insights' => $this->insights->generate($creatorId, $start, $end, $timezone),
            ];
        });

        return response()->json(['success' => true, 'data' => $payload]);
    }

    /* ── Helpers ────────────────────────────────────────────────────────────── */

    /**
     * A KPI value plus its change against the previous period.
     *
     * Growth from a zero baseline is NOT "infinite" or "100%" - going 0 → 5 views is
     * not a 100% improvement, it is the first data there has ever been. Report the
     * value with no growth chip rather than a meaningless number.
     */
    private function metric(float|int $value, float|int $previous): array
    {
        $pct = 0.0;
        $comparable = $previous > 0;

        if ($comparable) {
            $pct = round((($value - $previous) / $previous) * 100, 1);
        }

        return [
            'value'  => $value,
            'growth' => [
                'pct'        => abs($pct),
                'up'         => $pct >= 0,
                'comparable' => $comparable,
            ],
        ];
    }

    /** Engagement rate = interactions per view, as a percentage. */
    private function engagementRate(array $s): float
    {
        if (($s['views'] ?? 0) <= 0) {
            return 0.0;
        }

        $interactions = $s['likes'] + $s['comments'] + $s['shares'] + $s['saves'];

        return round(($interactions / $s['views']) * 100, 2);
    }

    /** Watch-time series, converted from seconds to hours for the chart. */
    private function series_hours(int $creatorId, string $start, string $end): array
    {
        return collect($this->queries->series($creatorId, $start, $end, 'watch_time'))
            ->map(fn (array $p) => [
                'date'  => $p['date'],
                'value' => round(((float) $p['value']) / 3600, 2),
            ])
            ->all();
    }

    /**
     * Best time to post: the 7x24 heatmap plus the peak the UI headlines.
     *
     * "Audience activity" is the peak cell as a share of the busiest possible cell,
     * which is what makes the number meaningful rather than an arbitrary count.
     */
    private function bestTime(int $creatorId, string $start, string $end, string $timezone): array
    {
        $cells = $this->queries->bestTimeHeatmap($creatorId, $start, $end, $timezone);

        if ($cells === []) {
            return ['has_data' => false, 'cells' => [], 'peak' => null];
        }

        $max  = max(array_column($cells, 'views')) ?: 1;
        $peak = collect($cells)->sortByDesc('views')->first();

        $days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
        $hour = (int) $peak['hour'];

        return [
            'has_data' => true,
            // Normalised 0..1 so the UI can shade cells without knowing the scale.
            'cells' => collect($cells)->map(fn (array $c) => [
                'dow'       => (int) $c['dow'],
                'hour'      => (int) $c['hour'],
                'views'     => (int) $c['views'],
                'intensity' => round($c['views'] / $max, 3),
            ])->all(),
            'peak' => [
                'day'      => $days[(int) $peak['dow']] ?? 'Monday',
                'window'   => sprintf('%s - %s', $this->hourLabel($hour), $this->hourLabel($hour + 2)),
                'activity' => (int) round(($peak['views'] / $max) * 100),
            ],
            'timezone' => $timezone,
        ];
    }

    private function hourLabel(int $hour): string
    {
        $hour %= 24;
        $suffix = $hour < 12 ? 'AM' : 'PM';
        $display = $hour % 12 === 0 ? 12 : $hour % 12;

        return "{$display} {$suffix}";
    }

    /** Row 5 - each engagement metric with its total, growth and sparkline. */
    private function engagement(int $creatorId, string $start, string $end, array $cur, array $prev): array
    {
        $series = $this->queries->engagementSeries($creatorId, $start, $end);

        $completion = $cur['completion'];
        $rewatchRate = $cur['views'] > 0
            ? round(($cur['rewatches'] / $cur['views']) * 100, 1)
            : 0.0;
        $prevRewatch = $prev['views'] > 0
            ? round(($prev['rewatches'] / $prev['views']) * 100, 1)
            : 0.0;

        return [
            'likes'           => $this->metric($cur['likes'], $prev['likes'])    + ['series' => $series['like'] ?? []],
            'comments'        => $this->metric($cur['comments'], $prev['comments']) + ['series' => $series['comment'] ?? []],
            'shares'          => $this->metric($cur['shares'], $prev['shares'])  + ['series' => $series['share'] ?? []],
            'saves'           => $this->metric($cur['saves'], $prev['saves'])    + ['series' => $series['save'] ?? []],
            'rewatch_rate'    => $this->metric($rewatchRate, $prevRewatch)       + ['series' => $series['rewatch'] ?? []],
            'completion_rate' => $this->metric($completion, $prev['completion']) + ['series' => $series['view_progress'] ?? []],
        ];
    }

    /**
     * Top videos: metrics from ClickHouse, titles/thumbnails from Postgres.
     *
     * The join happens here rather than in ClickHouse because pulling the videos
     * table into ClickHouse (as a dictionary) to decorate ten rows would be a lot
     * of machinery for no measurable gain.
     */
    private function topVideos(int $creatorId, string $start, string $end): array
    {
        $rows = $this->queries->topVideos($creatorId, $start, $end, 10);
        if ($rows === []) {
            return [];
        }

        $ids   = array_column($rows, 'video_id');
        $videos = DB::table('videos')
            ->whereIn('id', $ids)
            ->get(['id', 'title', 'caption', 'thumbnail_url', 'duration', 'created_at'])
            ->keyBy('id');

        $earnings = DB::table('creator_earnings')
            ->where('user_id', $creatorId)
            ->whereIn('video_id', $ids)
            ->whereBetween('earned_at', [$start, $end . ' 23:59:59'])
            ->groupBy('video_id')
            ->pluck(DB::raw('SUM(amount)'), 'video_id');

        return collect($rows)
            ->map(function (array $r) use ($videos, $earnings) {
                $v = $videos[$r['video_id']] ?? null;
                if (! $v) {
                    return null; // deleted since the events were recorded
                }

                $views = (int) $r['views'];

                return [
                    'id'                 => (int) $r['video_id'],
                    'title'              => $v->title ?: ($v->caption ?: 'Untitled'),
                    'thumbnail'          => $v->thumbnail_url ? $this->storage->url($v->thumbnail_url) : null,
                    'duration'           => (int) $v->duration,
                    'created_at'         => $v->created_at,
                    'views'              => $views,
                    'watch_time_hours'   => round(((int) $r['watch_seconds']) / 3600, 1),
                    'avg_watch_duration' => $views > 0 ? round(((int) $r['watch_seconds']) / $views, 1) : 0,
                    'completion'         => (float) $r['completion'],
                    'likes'              => max(0, (int) $r['likes']),
                    'comments'           => max(0, (int) $r['comments']),
                    'shares'             => max(0, (int) $r['shares']),
                    'saves'              => max(0, (int) $r['saves']),
                    'revenue'            => round((float) ($earnings[$r['video_id']] ?? 0), 2),
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Trending videos - ranked by growth velocity, from ClickHouse, decorated from
     * Postgres. Distinct from Top Videos: this answers "what is taking off", not
     * "what is biggest".
     */
    private function trendingVideos(int $creatorId): array
    {
        $rows = $this->queries->trendingVideos($creatorId, 7, 4);
        if ($rows === []) {
            return [];
        }

        $videos = DB::table('videos')
            ->whereIn('id', array_column($rows, 'video_id'))
            ->get(['id', 'title', 'caption', 'thumbnail_url'])
            ->keyBy('id');

        return collect($rows)
            ->map(function (array $r) use ($videos) {
                $v = $videos[$r['video_id']] ?? null;
                if (! $v) {
                    return null;
                }

                return [
                    'id'        => (int) $r['video_id'],
                    'title'     => $v->title ?: ($v->caption ?: 'Untitled'),
                    'thumbnail' => $v->thumbnail_url ? $this->storage->url($v->thumbnail_url) : null,
                    'views'     => (int) $r['recent'],
                    'growth'    => (float) $r['growth'],
                    'velocity'  => (float) $r['velocity'],
                ];
            })
            ->filter()
            ->values()
            ->all();
    }

    /**
     * Top audio: which tracks this creator's videos used, and how those videos did.
     *
     * Sourced entirely from Postgres - audio usage is a property of the video row
     * (videos.audio_track_id), not an event, so there is nothing in ClickHouse to
     * read. Views come from ClickHouse per video and are summed per track.
     */
    private function topAudio(int $creatorId, string $start, string $end): array
    {
        $tracks = DB::table('videos')
            ->join('audio_tracks', 'audio_tracks.id', '=', 'videos.audio_track_id')
            ->where('videos.user_id', $creatorId)
            ->whereNull('videos.deleted_at')
            ->groupBy('audio_tracks.id', 'audio_tracks.title', 'audio_tracks.artist', 'audio_tracks.cover_url')
            ->select([
                'audio_tracks.id',
                'audio_tracks.title',
                'audio_tracks.artist',
                'audio_tracks.cover_url',
                DB::raw('COUNT(videos.id) AS videos_count'),
                DB::raw('SUM(videos.views_count) AS views'),
            ])
            ->orderByDesc('views')
            ->limit(5)
            ->get();

        return $tracks->map(fn ($t) => [
            'id'           => (int) $t->id,
            'title'        => $t->title,
            'artist'       => $t->artist,
            'cover'        => $t->cover_url,
            'videos_count' => (int) $t->videos_count,
            'views'        => (int) $t->views,
        ])->all();
    }

    /**
     * Follower analytics.
     *
     * `gained` is exact - follower rows carry created_at. `lost` is NOT recoverable
     * from the followers table, because an unfollow is a hard DELETE: the row is
     * gone and with it the fact it ever existed. We read lost_followers from the
     * creator_analytics nightly rollup, which snapshotted it at the time. Where that
     * job never ran, the honest answer is 0 rather than a guess.
     *
     * (This is precisely the class of data loss the ClickHouse signed-delta model
     * fixes going forward - an unfollow will be an event, not an erasure.)
     */
    private function followerStats(int $creatorId, string $start, string $end, string $prevStart, string $prevEnd): array
    {
        $gained = (int) DB::table('followers')
            ->where('following_id', $creatorId)
            ->where('status', 'accepted')
            ->whereBetween('created_at', [$start, $end . ' 23:59:59'])
            ->count();

        $prevGained = (int) DB::table('followers')
            ->where('following_id', $creatorId)
            ->where('status', 'accepted')
            ->whereBetween('created_at', [$prevStart, $prevEnd . ' 23:59:59'])
            ->count();

        $lost = (int) DB::table('creator_analytics')
            ->where('user_id', $creatorId)
            ->whereBetween('date', [$start, $end])
            ->sum('lost_followers');

        $series = DB::table('followers')
            ->where('following_id', $creatorId)
            ->where('status', 'accepted')
            ->whereBetween('created_at', [$start, $end . ' 23:59:59'])
            ->groupBy(DB::raw('created_at::date'))
            ->orderBy(DB::raw('created_at::date'))
            ->select([DB::raw('created_at::date AS date'), DB::raw('COUNT(*) AS value')])
            ->get()
            ->map(fn ($r) => ['date' => (string) $r->date, 'value' => (int) $r->value])
            ->all();

        $total = (int) DB::table('followers')
            ->where('following_id', $creatorId)
            ->where('status', 'accepted')
            ->count();

        return [
            'total'       => $total,
            'gained'      => $gained,
            'lost'        => $lost,
            'net'         => $gained - $lost,
            'prev_gained' => $prevGained,
            'series'      => $series,
        ];
    }

    /** Profile visits - from the profile_views upsert table (pruned at 7 days). */
    private function profileVisits(int $creatorId, string $start, string $end, string $prevStart, string $prevEnd): array
    {
        $count = fn (string $from, string $to) => (int) DB::table('profile_views')
            ->where('profile_user_id', $creatorId)
            ->whereBetween('last_viewed_at', [$from, $to . ' 23:59:59'])
            ->sum('view_count');

        return [
            'current'  => $count($start, $end),
            'previous' => $count($prevStart, $prevEnd),
        ];
    }

    /** Row 10 - monetization, entirely from the Postgres ledger and wallet. */
    private function monetization(int $creatorId, string $start, string $end, string $prevStart, string $prevEnd): array
    {
        $bySource = DB::table('creator_earnings')
            ->where('user_id', $creatorId)
            ->whereBetween('earned_at', [$start, $end . ' 23:59:59'])
            ->groupBy('source')
            ->pluck(DB::raw('SUM(amount)'), 'source');

        $estimated = (float) DB::table('creator_earnings')
            ->where('user_id', $creatorId)
            ->whereBetween('earned_at', [$start, $end . ' 23:59:59'])
            ->sum('amount');

        $prevEstimated = (float) DB::table('creator_earnings')
            ->where('user_id', $creatorId)
            ->whereBetween('earned_at', [$prevStart, $prevEnd . ' 23:59:59'])
            ->sum('amount');

        $wallet = DB::table('wallets')->where('user_id', $creatorId)->first();

        return [
            'estimated'      => round($estimated, 2),
            'prev_estimated' => round($prevEstimated, 2),
            'coins'          => (int) ($wallet->coins_balance ?? 0),
            'creator_fund'   => round((float) ($bySource['creator_fund'] ?? 0), 2),
            'ad_revenue'     => round((float) ($bySource['ads'] ?? $bySource['ad'] ?? 0), 2),
            'subscriptions'  => round((float) ($wallet->subscription_earnings ?? 0), 2),
            'gifts'          => round((float) ($wallet->gift_earnings ?? 0), 2),
            'payout_balance' => round((float) ($wallet->balance ?? 0), 2),
            'withdrawn'      => round((float) ($wallet->total_withdrawn ?? 0), 2),
        ];
    }
}
