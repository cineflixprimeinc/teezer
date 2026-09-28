<?php

namespace App\Services\Studio;

use App\Services\ClickHouse\ClickHouseClient;

/**
 * Every ClickHouse query behind the Studio analytics page.
 *
 * Design rules:
 *
 *  - Read the ROLLUPS (creator_daily / creator_audience_daily / creator_hourly /
 *    video_daily), never the raw `events` table. The rollups are AggregatingMergeTree
 *    materialized views; scanning raw events per dashboard load is exactly the
 *    mistake this migration exists to undo.
 *
 *  - Engagement counts come from sumMerge(net), NOT countMerge(events). `net` is
 *    the signed sum, so an unlike cancels its like. countMerge would count the
 *    unlike as another like and over-report. The rollups are keyed on `metric`
 *    (undos already folded into their base), so this is correct by construction.
 *
 *  - Every parameter is bound as {name:Type}. Nothing is string-interpolated.
 *
 *  - Empty result != zero. A creator with no data yet must render an empty state,
 *    not a confident "0". Callers get [] and decide.
 */
class StudioAnalyticsQueries
{
    /** Engagement metrics that are reversible, hence read via sumMerge(net). */
    private const ENGAGEMENT = ['like', 'comment', 'share', 'save'];

    public function __construct(private readonly ClickHouseClient $ch) {}

    /**
     * Headline totals for the KPI row, for one creator over one date range.
     *
     * Returns raw numbers only - growth vs the previous period is computed by the
     * caller, which simply calls this twice.
     *
     * @return array{views:int, watch_seconds:int, avg_watch_duration:float,
     *               completion:float, likes:int, comments:int, shares:int, saves:int,
     *               rewatches:int, unique_viewers:int}
     */
    public function summary(int $creatorId, string $start, string $end): array
    {
        $rows = $this->ch->select(<<<'SQL'
            SELECT
                metric,
                sumMerge(net)           AS net,
                sumMerge(watch_seconds) AS watch_seconds,
                avgMerge(completion)    AS completion,
                uniqMerge(viewers)      AS viewers
            FROM creator_daily
            WHERE creator_id = {creator:UInt64}
              AND event_date BETWEEN {start:Date} AND {end:Date}
            GROUP BY metric
        SQL, ['creator' => $creatorId, 'start' => $start, 'end' => $end]);

        $by = [];
        foreach ($rows as $r) {
            $by[$r['metric']] = $r;
        }

        $views = (int) ($by['view']['net'] ?? 0);

        // Watch time is carried on the playback events, not on `view`: a view is a
        // single impression, while watch_seconds accumulates across progress beats.
        $watchSeconds = 0;
        foreach (['view', 'view_progress', 'watch_progress', 'watch_exit'] as $m) {
            $watchSeconds += (int) ($by[$m]['watch_seconds'] ?? 0);
        }

        // Completion % is only meaningful where it was actually reported.
        $completion = (float) ($by['view_progress']['completion'] ?? 0.0);

        return [
            'views'              => $views,
            'watch_seconds'      => $watchSeconds,
            'avg_watch_duration' => $views > 0 ? round($watchSeconds / $views, 1) : 0.0,
            'completion'         => round($completion, 1),
            'likes'              => max(0, (int) ($by['like']['net'] ?? 0)),
            'comments'           => max(0, (int) ($by['comment']['net'] ?? 0)),
            'shares'             => max(0, (int) ($by['share']['net'] ?? 0)),
            'saves'              => max(0, (int) ($by['save']['net'] ?? 0)),
            'rewatches'          => max(0, (int) ($by['rewatch']['net'] ?? 0)),
            'unique_viewers'     => (int) ($by['view']['viewers'] ?? 0),
        ];
    }

    /**
     * A daily time series for one metric, gap-filled across the whole range.
     *
     * WITH FILL matters: without it, a day with no views is simply absent and the
     * chart silently joins across it, drawing a straight line over a dead day and
     * making the trend look smoother than it was.
     *
     * @return array<int, array{date:string, value:float}>
     */
    public function series(int $creatorId, string $start, string $end, string $metric): array
    {
        // watch_time is a different column, not a different metric row.
        $value = $metric === 'watch_time'
            ? 'sumMerge(watch_seconds)'
            : 'sumMerge(net)';

        $filter = $metric === 'watch_time'
            ? "metric IN ('view', 'view_progress', 'watch_progress', 'watch_exit')"
            : 'metric = {metric:String}';

        $params = ['creator' => $creatorId, 'start' => $start, 'end' => $end];
        if ($metric !== 'watch_time') {
            $params['metric'] = $metric;
        }

        // NB: `date` must be the Date column itself, and the ORDER BY must name that
        // alias. WITH FILL only populates the column it is ordering on - order by
        // `event_date` while selecting `toString(event_date) AS date` and every
        // synthesised gap row comes back with an EMPTY date, which is worse than no
        // gap-filling at all.
        return $this->ch->select(<<<SQL
            SELECT
                event_date          AS date,
                toFloat64({$value}) AS value
            FROM creator_daily
            WHERE creator_id = {creator:UInt64}
              AND event_date BETWEEN {start:Date} AND {end:Date}
              AND {$filter}
            GROUP BY date
            ORDER BY date
            WITH FILL FROM {start:Date} TO {end:Date} + 1 STEP 1
        SQL, $params);
    }

    /**
     * Audience retention curve - what fraction of viewers were still watching at
     * each 10% checkpoint.
     *
     * Built from the completion_pct quantiles stored on video_daily. Retention at
     * checkpoint p = share of views whose completion_pct >= p, which is exactly
     * "1 - (the quantile rank of p)". We read the stored quantile states rather
     * than re-scan raw events.
     *
     * @return array<int, array{pct:int, retention:float}>
     */
    public function retentionCurve(int $creatorId, string $start, string $end): array
    {
        $row = $this->ch->selectOne(<<<'SQL'
            SELECT
                quantilesMerge(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)(completion_q) AS q
            FROM video_daily
            WHERE creator_id = {creator:UInt64}
              AND event_date BETWEEN {start:Date} AND {end:Date}
              AND metric = 'view_progress'
        SQL, ['creator' => $creatorId, 'start' => $start, 'end' => $end]);

        if (empty($row['q'])) {
            return [];
        }

        // `q` is an INVERSE CDF, and it is easy to read it backwards. q[i] is the
        // completion_pct reached by the (i+1)-th decile of viewers - e.g. q = [4, 8,
        // 12, …] means "10% of views got no further than 4%, 20% got no further than
        // 8%". It is NOT "retention at the 10% mark".
        //
        // What the chart needs is the other direction: at watch-position p, what
        // share of viewers is still watching = 100 - CDF(p). So build the CDF from
        // the decile points and interpolate it at each fixed 10% position, rather
        // than plotting q against its own index (which silently transposes the axes
        // and produces a plausible-looking, completely wrong curve).
        $q = array_map('floatval', $row['q']);

        // CDF knots: (completion_value, cumulative_% of viewers at or below it).
        $knots = [[0.0, 0.0]];
        foreach ($q as $i => $completion) {
            $knots[] = [$completion, ($i + 1) * 10.0];
        }

        $cdfAt = static function (float $p) use ($knots): float {
            $prev = $knots[0];
            foreach ($knots as $knot) {
                if ($knot[0] >= $p) {
                    $span = $knot[0] - $prev[0];
                    if ($span <= 0.0) {
                        return $knot[1];
                    }
                    // Linear interpolation between the two surrounding deciles.
                    $t = ($p - $prev[0]) / $span;

                    return $prev[1] + $t * ($knot[1] - $prev[1]);
                }
                $prev = $knot;
            }

            return 100.0; // past the last knot: everyone has dropped off
        };

        $curve = [];
        for ($position = 0; $position <= 100; $position += 10) {
            $retention = 100.0 - $cdfAt((float) $position);

            $curve[] = [
                'pct'       => $position,
                'retention' => round(max(0.0, min(100.0, $retention)), 1),
            ];
        }

        return $curve;
    }

    /**
     * Best-time-to-post heatmap: 7 days x 24 hours of audience activity.
     *
     * Day-of-week is derived HERE, in the caller's timezone, rather than stored -
     * creator_hourly buckets by UTC hour on purpose. A UTC Tuesday 23:00 is a
     * Wednesday in Kathmandu, so baking dow into the rollup would silently shift
     * every non-UTC creator's heatmap by a day.
     *
     * @return array<int, array{dow:int, hour:int, views:int, engagements:int}>
     */
    public function bestTimeHeatmap(int $creatorId, string $start, string $end, string $timezone): array
    {
        return $this->ch->select(<<<'SQL'
            SELECT
                toDayOfWeek(local_ts) - 1 AS dow,   -- ClickHouse: Monday = 1; shift to 0-based
                toHour(local_ts)          AS hour,
                sum(views)                AS views,
                sum(engagements)          AS engagements
            FROM (
                SELECT
                    toTimeZone(toDateTime(event_date) + toIntervalHour(hour), {tz:String}) AS local_ts,
                    countMerge(views)       AS views,
                    sumMerge(engagements)   AS engagements
                FROM creator_hourly
                WHERE creator_id = {creator:UInt64}
                  AND event_date BETWEEN {start:Date} AND {end:Date}
                GROUP BY event_date, hour
            )
            GROUP BY dow, hour
            ORDER BY dow, hour
        SQL, ['creator' => $creatorId, 'start' => $start, 'end' => $end, 'tz' => $timezone]);
    }

    /**
     * Audience breakdown by one dimension (country / city / device_type / source).
     *
     * $dimension is NOT user input - it is chosen from this allowlist by the
     * caller, because a column name cannot be a bound parameter.
     *
     * @return array<int, array{name:string, count:int, pct:float}>
     */
    public function audience(int $creatorId, string $start, string $end, string $dimension, int $limit = 10): array
    {
        $allowed = ['country', 'city', 'device_type', 'source'];
        if (! in_array($dimension, $allowed, true)) {
            throw new \InvalidArgumentException("Unsupported audience dimension: {$dimension}");
        }

        return $this->ch->select(<<<SQL
            SELECT
                name,
                count,
                round(100 * count / nullIf(sum(count) OVER (), 0), 1) AS pct
            FROM (
                SELECT
                    {$dimension}      AS name,
                    countMerge(views) AS count
                FROM creator_audience_daily
                WHERE creator_id = {creator:UInt64}
                  AND event_date BETWEEN {start:Date} AND {end:Date}
                  AND {$dimension} != ''
                GROUP BY name
            )
            ORDER BY count DESC
            LIMIT {limit:UInt32}
        SQL, ['creator' => $creatorId, 'start' => $start, 'end' => $end, 'limit' => $limit]);
    }

    /**
     * Per-video performance for the "Top Performing Videos" table.
     *
     * Returns ClickHouse-derived metrics keyed by video_id; the caller joins the
     * titles/thumbnails from Postgres. Doing that join here would mean either a
     * dictionary or shipping the video table into ClickHouse - not worth it for a
     * ten-row table.
     *
     * @return array<int, array<string, mixed>>
     */
    public function topVideos(int $creatorId, string $start, string $end, int $limit = 10): array
    {
        return $this->ch->select(<<<'SQL'
            SELECT
                video_id,
                sumMergeIf(net, metric = 'view')                                          AS views,
                sumMergeIf(watch_seconds, metric IN ('view','view_progress','watch_progress','watch_exit')) AS watch_seconds,
                round(avgMergeIf(completion, metric = 'view_progress'), 1)                AS completion,
                sumMergeIf(net, metric = 'like')                                          AS likes,
                sumMergeIf(net, metric = 'comment')                                       AS comments,
                sumMergeIf(net, metric = 'share')                                         AS shares,
                sumMergeIf(net, metric = 'save')                                          AS saves,
                sumMergeIf(net, metric = 'rewatch')                                       AS rewatches
            FROM video_daily
            WHERE creator_id = {creator:UInt64}
              AND event_date BETWEEN {start:Date} AND {end:Date}
            GROUP BY video_id
            HAVING views > 0
            ORDER BY views DESC
            LIMIT {limit:UInt32}
        SQL, ['creator' => $creatorId, 'start' => $start, 'end' => $end, 'limit' => $limit]);
    }

    /**
     * Trending videos - ranked by VELOCITY, not by total views.
     *
     * A video with a million lifetime views is not "trending"; a video whose views
     * tripled since yesterday is. So we score recent views against the preceding
     * window of equal length, which is what makes this card different from Top
     * Videos rather than a reskin of it.
     *
     * @return array<int, array<string, mixed>>
     */
    public function trendingVideos(int $creatorId, int $windowDays = 7, int $limit = 4): array
    {
        return $this->ch->select(<<<'SQL'
            SELECT
                video_id,
                recent,
                previous,
                -- Growth vs the preceding window. A brand-new video has no previous
                -- window at all; treat that as 100% growth rather than divide by zero.
                if(previous = 0, 100.0, round(100 * (recent - previous) / previous, 1)) AS growth,
                -- Velocity: views per day in the recent window.
                round(recent / {days:UInt32}, 1) AS velocity
            FROM (
                SELECT
                    video_id,
                    sumMergeIf(net, event_date >  today() - {days:UInt32})                                     AS recent,
                    sumMergeIf(net, event_date <= today() - {days:UInt32}
                                AND event_date >  today() - 2 * {days:UInt32})                                 AS previous
                FROM video_daily
                WHERE creator_id = {creator:UInt64}
                  AND metric = 'view'
                  AND event_date > today() - 2 * {days:UInt32}
                GROUP BY video_id
            )
            WHERE recent > 0
            ORDER BY growth DESC, recent DESC
            LIMIT {limit:UInt32}
        SQL, ['creator' => $creatorId, 'days' => $windowDays, 'limit' => $limit]);
    }

    /**
     * Daily series for each engagement metric at once - the fifth-row mini charts.
     * One query instead of six round-trips.
     *
     * @return array<string, array<int, array{date:string, value:float}>>  keyed by metric
     */
    public function engagementSeries(int $creatorId, string $start, string $end): array
    {
        $rows = $this->ch->select(<<<'SQL'
            SELECT
                metric,
                toString(event_date)   AS date,
                toFloat64(sumMerge(net)) AS value
            FROM creator_daily
            WHERE creator_id = {creator:UInt64}
              AND event_date BETWEEN {start:Date} AND {end:Date}
              AND metric IN ('like', 'comment', 'share', 'save', 'rewatch', 'view_progress')
            GROUP BY metric, event_date
            ORDER BY event_date
        SQL, ['creator' => $creatorId, 'start' => $start, 'end' => $end]);

        $out = [];
        foreach ($rows as $r) {
            $out[$r['metric']][] = ['date' => $r['date'], 'value' => (float) $r['value']];
        }

        return $out;
    }
}
