-- Teezer ClickHouse - raw event stream.
--
-- ONE table replaces three Postgres ones: video_events (recommender log),
-- video_views (row per counted view) and video_watch_events (a row every 5s
-- of playback - the highest-volume table in the system, which nothing reads).
--
-- Design notes that are load-bearing:
--
--  * `delta` (+1 / -1). Postgres records a like by INSERTing a row and an
--    unlike by DELETEing it, so the past is destroyed on every undo - the
--    AggregateCreatorAnalytics docblock calls this out: miss a nightly run and
--    that history is gone for good. Here, an unlike is an EVENT (delta = -1).
--    Daily likes = sum(delta). Nothing is ever destroyed, so any rollup can be
--    rebuilt from scratch by replaying the stream. This is the single biggest
--    correctness win of the move.
--
--  * `creator_id` is denormalized onto every row. Studio rollups are per
--    creator, and ClickHouse joins are expensive; carrying the 8 bytes means
--    the creator MVs never touch the videos table.
--
--  * `ip_hash`, not `ip_address`. Postgres keeps raw IPs on video_views. We
--    retain 13 months here - that is the last place raw IPs should live. The
--    hash still supports guest dedupe and abuse analysis.
--
--  * ORDER BY (video_id, event_type, event_time) suits the recommender, which
--    always asks "this video, last 30 days, grouped by type". Creator- and
--    date-first access patterns are served by the materialized views in
--    02-rollups.sql, never by scanning this table.

CREATE DATABASE IF NOT EXISTS teezer;

CREATE TABLE IF NOT EXISTS teezer.events
(
    event_time      DateTime64(3, 'UTC'),
    event_date      Date MATERIALIZED toDate(event_time),

    -- Playback:    view, view_progress, skip, rewatch,
    --              watch_start, watch_progress, watch_pause, watch_resume,
    --              watch_hidden, watch_exit
    -- Engagement:  like, save, share, comment, follow_from_video  (delta = +1)
    --              unlike, unsave, uncomment, unfollow_from_video (delta = -1)
    -- Negative:    not_interested, report
    -- Profile:     profile_view
    event_type      LowCardinality(String),

    video_id        UInt64,                       -- 0 when not video-scoped (profile_view)
    creator_id      UInt64,                       -- owner of video_id, or the profile being viewed
    user_id         UInt64,                       -- 0 = guest
    session_id      String,

    -- +1 for a like, -1 for an unlike. 1 for everything non-reversible.
    delta           Int8    DEFAULT 1,

    watch_seconds   UInt32  DEFAULT 0,            -- incremental, not cumulative: SUM() is the watch time
    completion_pct  Float32 DEFAULT 0,            -- 0..100, only meaningful on view_progress / watch_exit

    source          LowCardinality(String) DEFAULT '',  -- feed / profile / search / share-link …
    country         LowCardinality(String) DEFAULT '',  -- CF-IPCountry, 2-letter
    city            LowCardinality(String) DEFAULT '',  -- CF-IPCity
    device_type     LowCardinality(String) DEFAULT '',  -- mobile / tablet / desktop
    platform        LowCardinality(String) DEFAULT '',  -- ios / android / web
    os              LowCardinality(String) DEFAULT '',  -- NOT COLLECTED YET - see note below
    browser         LowCardinality(String) DEFAULT '',  -- NOT COLLECTED YET
    network         LowCardinality(String) DEFAULT '',  -- NOT COLLECTED YET (wifi / cellular)

    ip_hash         UInt64  DEFAULT 0,            -- cityHash64 of the IP; never the IP itself
    payload         String  DEFAULT '',           -- raw JSON escape hatch for anything not yet a column

    -- Client-generated idempotency key. NOT the deduplication mechanism - see
    -- the note below - it is stored so dedupe can be VERIFIED:
    --   SELECT count(), uniq(event_id) FROM events WHERE event_id != ''
    -- Any gap between those two numbers is duplicates that got through.
    -- Empty for events from producers that predate the key.
    event_id        String  DEFAULT ''
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (video_id, event_type, event_time)
-- 13 months: long enough that a year-over-year comparison still has both ends.
TTL toDateTime(event_time) + INTERVAL 13 MONTH DELETE
SETTINGS index_granularity = 8192;

-- ── Columns added after the table already existed ───────────────────────────
-- Repeated as ALTERs so this file stays idempotent against a live instance: the
-- CREATE above is a no-op once the table exists, so a new column declared only
-- there would silently never appear in production.
--
-- os / browser / network are declared but NOT POPULATED. Nothing in the app
-- collects them today - Laravel derives device_type from a User-Agent regex and
-- stops there. They exist so the ingest path and the Studio "Devices" card have
-- somewhere to put the data the moment we start parsing the UA properly; until
-- then they are empty strings, and any card reading them must show an empty
-- state rather than invent a distribution.
ALTER TABLE teezer.events ADD COLUMN IF NOT EXISTS city    LowCardinality(String) DEFAULT '' AFTER country;
ALTER TABLE teezer.events ADD COLUMN IF NOT EXISTS os      LowCardinality(String) DEFAULT '' AFTER platform;
ALTER TABLE teezer.events ADD COLUMN IF NOT EXISTS browser LowCardinality(String) DEFAULT '' AFTER os;
ALTER TABLE teezer.events ADD COLUMN IF NOT EXISTS network LowCardinality(String) DEFAULT '' AFTER browser;
ALTER TABLE teezer.events ADD COLUMN IF NOT EXISTS event_id String DEFAULT '' AFTER payload;

-- ── Why deduplication is NOT done here ──────────────────────────────────────
-- The obvious move is ReplacingMergeTree keyed on event_id. It does not work.
--
-- Materialized views fire on INSERT, against the block being inserted - not
-- after a merge. So a duplicate row would be collapsed in `events` eventually,
-- while video_daily and creator_daily would ALREADY have counted it twice, and
-- those rollups are what every dashboard reads. The raw table would look
-- correct and every number derived from it would be wrong, which is the worst
-- of both outcomes.
--
-- FINAL / OPTIMIZE do not save it either: neither is retroactive over an
-- aggregate state that was already written.
--
-- So dedupe happens at INGEST, before the event is ever enqueued - a Redis
-- SET NX on the event id, the same mechanism AdEventController already uses for
-- ad impressions. That adds no infrastructure: Redis is already the transport
-- between Laravel and the Go drainer.

-- Studio's "who viewed me" and creator rollups filter by creator; the feed
-- recommender filters by video. A skip index on creator_id lets the rare
-- creator-scoped raw scan (backfill checks, debugging) skip most granules
-- without a second ORDER BY.
ALTER TABLE teezer.events
    ADD INDEX IF NOT EXISTS idx_creator creator_id TYPE minmax GRANULARITY 4;

ALTER TABLE teezer.events
    ADD INDEX IF NOT EXISTS idx_user user_id TYPE bloom_filter(0.01) GRANULARITY 4;
