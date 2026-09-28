-- Teezer ClickHouse - video processing pipeline events (api.video primary /
-- ffmpeg fallback). A SEPARATE table from reelsoo.events (01-events.sql) on
-- purpose: that table's schema is fixed to ENGAGEMENT analytics
-- (watch_seconds, completion_pct, delta, country, device_type, ...) - real
-- columns for a real, different concern. Operational pipeline events
-- (provider, attempt, duration_ms, error_code) don't map onto that shape
-- without either bending it or leaving most of it empty on every row, so
-- this is a small table of its own instead.
--
-- Transport mirrors reelsoo.events exactly: Laravel pushes to a Redis stream
-- (ProcessingEventStream::push -> "video_processing:events"), a Go Drainer
-- reads it into this table's own batching Writer. See
-- backend-go/internal/clickhouse/processing_*.go. PHP never opens an INSERT
-- against ClickHouse, same rule as the engagement pipeline.

CREATE DATABASE IF NOT EXISTS reelsoo;

CREATE TABLE IF NOT EXISTS reelsoo.video_processing_events
(
    event_time      DateTime64(3, 'UTC'),
    event_date      Date MATERIALIZED toDate(event_time),

    -- video_upload_started, video_upload_completed, video_transcoding_started,
    -- video_transcoding_primary_success, video_transcoding_primary_failed,
    -- video_transcoding_fallback_started, video_transcoding_fallback_success,
    -- video_transcoding_failed, video_ready
    event_type      LowCardinality(String),

    video_id        UInt64,
    user_id         UInt64  DEFAULT 0,           -- video owner, 0 if not yet known (e.g. upload_started)

    -- apivideo / ffmpeg / '' (not yet provider-scoped, e.g. upload events)
    provider        LowCardinality(String) DEFAULT '',
    attempt         UInt8   DEFAULT 1,

    -- How long THIS step took, where meaningful (0 otherwise) - e.g. upload
    -- duration on video_upload_completed, encode duration on a
    -- *_success/*_failed event. Never a running total.
    duration_ms     UInt32  DEFAULT 0,

    error_code      LowCardinality(String) DEFAULT '',
    payload         String  DEFAULT ''            -- raw JSON escape hatch
)
ENGINE = MergeTree
PARTITION BY toYYYYMM(event_time)
ORDER BY (video_id, event_type, event_time)
-- 90 days: this data answers "why did this video's processing behave the way
-- it did" and feeds the FFMPEG_FALLBACK_RATE / success-rate monitoring - an
-- operational/debugging horizon, not the 13-month engagement-analytics
-- retention reelsoo.events uses for year-over-year comparisons.
TTL toDateTime(event_time) + INTERVAL 90 DAY DELETE
SETTINGS index_granularity = 8192;
