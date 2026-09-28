-- Teezer ClickHouse - rollups.
--
-- These replace `creator_analytics` (a nightly Postgres job) and the live
-- COUNT(*)/SUM() fallback scans in StudioAnalyticsController::rawTotals().
--
-- The difference that matters: creator_analytics is a CACHE that can drift and
-- cannot be rebuilt (its inputs get hard-deleted or pruned at 7 days). These
-- are materialized views over an immutable log - they are always consistent
-- with the stream, and if one is ever wrong you drop it, recreate it, and
-- re-POPULATE from `events`. There is no state to lose.
--
-- Each MV is an AggregatingMergeTree holding *State() partials. Read them with
-- the matching *Merge() and a GROUP BY. Never SELECT the State columns raw.
--
-- Keeping the grain at (…, event_date, metric) rather than pivoting into one
-- column per metric means a new event type needs NO schema change - it just
-- shows up as a new row. Callers pivot at query time.
--
-- ── Why `metric` and not `event_type` ───────────────────────────────────────
-- The raw stream distinguishes `like` (+1) from `unlike` (-1). If the rollups
-- were keyed on event_type, the honest answer to "how many likes" would be
-- sum(net) across BOTH rows - and the obvious query, `WHERE event_type='like'`,
-- would silently ignore every unlike and over-report. Dashboards would be wrong
-- in a way nobody notices, which is the exact failure this migration exists to
-- kill.
--
-- So the rollups key on `metric`, which folds each undo back into the thing it
-- undoes (unlike → like). sum(net) is then correct BY CONSTRUCTION: there is no
-- way to write the naive query and get a wrong number. The raw event_type is
-- still on `events` if anyone ever needs to count undos specifically.

-- ── Per video, per day ───────────────────────────────────────────────────────
-- Serves: StudioInsightsController (per-video insights), the recommender's
-- 30-day aggregate, top-videos lists.
CREATE TABLE IF NOT EXISTS teezer.video_daily
(
    video_id        UInt64,
    creator_id      UInt64,
    event_date      Date,
    metric          LowCardinality(String),           -- undos folded into their base (unlike → like)

    events          AggregateFunction(count),         -- raw occurrences, undos INCLUDED
    net             AggregateFunction(sum, Int8),     -- the real number: likes minus unlikes
    watch_seconds   AggregateFunction(sum, UInt32),
    completion      AggregateFunction(avg, Float32),
    completion_q    AggregateFunction(quantiles(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0), Float32),
    viewers         AggregateFunction(uniq, UInt64)   -- distinct user_id (guests all collapse to 0)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (video_id, event_date, metric);

CREATE MATERIALIZED VIEW IF NOT EXISTS teezer.video_daily_mv
TO teezer.video_daily AS
SELECT
    video_id,
    creator_id,
    event_date,
    transform(event_type,
              ['unlike', 'unsave', 'uncomment', 'unfollow_from_video'],
              ['like',   'save',   'comment',   'follow_from_video'],
              event_type) AS metric,
    countState()                        AS events,
    sumState(delta)                     AS net,
    sumState(watch_seconds)             AS watch_seconds,
    avgState(completion_pct)            AS completion,
    quantilesState(0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0)(completion_pct) AS completion_q,
    uniqState(user_id)                  AS viewers
FROM teezer.events
WHERE video_id != 0
GROUP BY video_id, creator_id, event_date, metric;


-- ── Per creator, per day ─────────────────────────────────────────────────────
-- Serves: the whole Studio analytics overview (summary tiles + main charts)
-- and the admin dashboard. This is the direct replacement for creator_analytics.
CREATE TABLE IF NOT EXISTS teezer.creator_daily
(
    creator_id      UInt64,
    event_date      Date,
    metric          LowCardinality(String),

    events          AggregateFunction(count),
    net             AggregateFunction(sum, Int8),
    watch_seconds   AggregateFunction(sum, UInt32),
    completion      AggregateFunction(avg, Float32),
    viewers         AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (creator_id, event_date, metric);

CREATE MATERIALIZED VIEW IF NOT EXISTS teezer.creator_daily_mv
TO teezer.creator_daily AS
SELECT
    creator_id,
    event_date,
    transform(event_type,
              ['unlike', 'unsave', 'uncomment', 'unfollow_from_video'],
              ['like',   'save',   'comment',   'follow_from_video'],
              event_type) AS metric,
    countState()                AS events,
    sumState(delta)             AS net,
    sumState(watch_seconds)     AS watch_seconds,
    avgState(completion_pct)    AS completion,
    uniqState(user_id)          AS viewers
FROM teezer.events
WHERE creator_id != 0
GROUP BY creator_id, event_date, metric;


-- ── Audience breakdown ───────────────────────────────────────────────────────
-- Serves: overview.audience - traffic_sources, top_countries, device_platform.
-- Postgres served these with GROUP BY over video_views; this is the same shape,
-- pre-aggregated. Views only - a country breakdown of `like` events is noise.
CREATE TABLE IF NOT EXISTS teezer.creator_audience_daily
(
    creator_id      UInt64,
    event_date      Date,
    source          LowCardinality(String),
    country         LowCardinality(String),
    city            LowCardinality(String),
    device_type     LowCardinality(String),
    platform        LowCardinality(String),

    views           AggregateFunction(count),
    viewers         AggregateFunction(uniq, UInt64)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (creator_id, event_date, source, country, city, device_type, platform);

CREATE MATERIALIZED VIEW IF NOT EXISTS teezer.creator_audience_daily_mv
TO teezer.creator_audience_daily AS
SELECT
    creator_id,
    event_date,
    source,
    country,
    city,
    device_type,
    platform,
    countState()        AS views,
    uniqState(user_id)  AS viewers
FROM teezer.events
WHERE creator_id != 0 AND event_type = 'view'
GROUP BY creator_id, event_date, source, country, city, device_type, platform;


-- ── Best time to post ────────────────────────────────────────────────────────
-- Serves: GET /studio/analytics/best-time (a 7x24 heatmap, currently cached 15
-- min because the live query is expensive). Stored per (date, hour) in UTC -
-- day-of-week is derived at query time, because the caller passes its own
-- timezone and a UTC Tuesday 23:00 is a Wednesday somewhere. Bucketing by dow
-- here would bake UTC into the answer and quietly shift every creator's heatmap.
CREATE TABLE IF NOT EXISTS teezer.creator_hourly
(
    creator_id      UInt64,
    event_date      Date,
    hour            UInt8,

    views           AggregateFunction(count),
    engagements     AggregateFunction(sum, Int8)
)
ENGINE = AggregatingMergeTree
PARTITION BY toYYYYMM(event_date)
ORDER BY (creator_id, event_date, hour);

CREATE MATERIALIZED VIEW IF NOT EXISTS teezer.creator_hourly_mv
TO teezer.creator_hourly AS
SELECT
    creator_id,
    event_date,
    toHour(event_time) AS hour,
    countStateIf(event_type = 'view') AS views,
    -- Signed, so an hour whose likes were all later undone scores 0 engagement
    -- rather than looking like a great time to post.
    sumStateIf(delta, event_type IN ('like', 'unlike', 'comment', 'uncomment',
                                     'save', 'unsave', 'share')) AS engagements
FROM teezer.events
WHERE creator_id != 0
GROUP BY creator_id, event_date, hour;
