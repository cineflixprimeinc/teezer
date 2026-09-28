#!/usr/bin/env bash
# Backfill Postgres history into ClickHouse. Run ON VPS-1 (where Postgres lives
# and the ClickHouse tunnel terminates on 127.0.0.1:9000).
#
#   CH_PASSWORD=... ./backfill.sh
#
# Idempotent: it wipes the date range it is about to load before loading it, so a
# re-run replaces rather than double-counts. That matters - `events` is a plain
# MergeTree with no dedupe, so running this twice without the wipe would double
# every historical metric.
#
# Sources, and what is deliberately NOT carried over:
#   video_events → the recommender log. Every row becomes delta=+1, because the
#                  undo history it would need does not exist: Postgres records an
#                  unlike by DELETEing the like. That past is already gone and no
#                  backfill can invent it. From cutover forward it is preserved.
#   video_views  → 'view' events, carrying source/country/device_type, which is
#                  what the Studio audience breakdown is built from.
#
# video_watch_events is skipped: it is the highest-volume table and nothing reads
# it, so importing its history buys nothing. New watch events flow in live.
set -euo pipefail

: "${CH_PASSWORD:?set CH_PASSWORD}"
CH_USER="${CH_USER:-teezer}"
CH_HOST="${CH_HOST:-127.0.0.1}"
CH_PORT="${CH_PORT:-9000}"
PG_DB="${PG_DB:-teezer}"

ch() { clickhouse-client --host "$CH_HOST" --port "$CH_PORT" --user "$CH_USER" --password "$CH_PASSWORD" "$@"; }
pg() { sudo -u postgres psql -d "$PG_DB" -tA -F$'\t' --no-align "$@"; }

echo "── clearing any prior backfill (keeps re-runs idempotent)"
ch --query "TRUNCATE TABLE IF EXISTS reelsoo.events"
for t in video_daily creator_daily creator_audience_daily creator_hourly; do
  ch --query "TRUNCATE TABLE IF EXISTS reelsoo.$t"
done

COLS="event_time, event_type, video_id, creator_id, user_id, session_id, delta,
      watch_seconds, completion_pct, source, country, city, device_type, platform,
      ip_hash, payload"

echo "── video_events → events"
pg -c "
SELECT
    to_char(ve.created_at, 'YYYY-MM-DD HH24:MI:SS.MS'),
    ve.event_type,
    ve.video_id,
    v.user_id,
    COALESCE(ve.user_id, 0),
    COALESCE(ve.session_id, ''),
    1,
    COALESCE(NULLIF(ve.payload ->> 'watch_duration', '')::numeric::int, 0),
    COALESCE(NULLIF(ve.payload ->> 'completion_pct', '')::numeric::float, 0),
    '',
    '',
    '',
    '',
    COALESCE(ve.payload ->> 'platform', ''),
    0,
    COALESCE(ve.payload::text, '')
FROM video_events ve
JOIN videos v ON v.id = ve.video_id
" | ch --query "INSERT INTO reelsoo.events ($COLS) FORMAT TabSeparated"

# video_views is where the audience context actually lives - source, country,
# city and device_type. It is the only source for the Studio audience cards.
#
# COUNTRY IS STORED INCONSISTENTLY. Some rows hold a Cloudflare ISO-2 code ('NP')
# and others a full English name ('Nepal') - the same country, written two ways,
# which makes Top Countries list Nepal twice and split its own traffic in half.
# Normalize to ISO-2 on the way in so the rollup has one row per country. (The
# ingest path in VideoController::recordView needs the same fix, or the split
# reappears for new rows.)
#
# city is NOT normalized because it is 100% empty: the column exists but nothing
# populates it. Cloudflare only sends CF-IPCity on Enterprise plans. Top Cities
# needs a GeoIP lookup (MaxMind GeoLite2) before it can show anything real.
echo "── video_views → 'view' events"
pg -c "
SELECT
    to_char(vv.created_at, 'YYYY-MM-DD HH24:MI:SS.MS'),
    'view',
    vv.video_id,
    v.user_id,
    COALESCE(vv.user_id, 0),
    '',
    1,
    COALESCE(vv.watch_duration, 0),
    0,
    COALESCE(vv.source, ''),
    CASE upper(trim(COALESCE(vv.country, '')))
        WHEN 'NEPAL'                THEN 'NP'
        WHEN 'INDIA'                THEN 'IN'
        WHEN 'UNITED STATES'        THEN 'US'
        WHEN 'CHINA'                THEN 'CN'
        WHEN 'TAIWAN'               THEN 'TW'
        WHEN 'KAZAKHSTAN'           THEN 'KZ'
        WHEN 'TURKEY'               THEN 'TR'
        WHEN 'UNITED KINGDOM'       THEN 'GB'
        WHEN 'UNITED ARAB EMIRATES' THEN 'AE'
        -- Already ISO-2 (or unknown): keep two-letter codes, drop anything else
        -- rather than let a stray long name masquerade as a country code.
        ELSE CASE WHEN length(trim(COALESCE(vv.country, ''))) = 2
                  THEN upper(trim(vv.country)) ELSE '' END
    END,
    COALESCE(vv.city, ''),
    COALESCE(vv.device_type, ''),
    '',
    0,
    ''
FROM video_views vv
JOIN videos v ON v.id = vv.video_id
" | ch --query "INSERT INTO reelsoo.events ($COLS) FORMAT TabSeparated"

# ── Engagement ───────────────────────────────────────────────────────────────
# video_likes / video_comments / video_shares / video_saves are the AUTHORITATIVE
# record of engagement. video_events only ever held them when a client happened to
# POST /video-events alongside the mutation - which the web app does not do. So
# ClickHouse saw zero likes for creators who plainly have likes, and the whole
# engagement row (and engagement_rate) read 0. Empty is not the same as zero, and
# this was zero-that-should-not-have-been.
#
# Replay each table as a +1 event at its created_at. These rows are CURRENT state:
# anything already unliked was hard-deleted long ago, so what we import is the net
# surviving engagement. That is the correct starting point - from cutover forward,
# the Go handlers emit the undo events too, so the net stays right without this.
for pair in "video_likes:like" "video_comments:comment" "video_shares:share" "video_saves:save"; do
  table="${pair%%:*}"
  event="${pair##*:}"
  echo "── ${table} → '${event}' events"

  # video_comments soft-deletes; the others do not. Only filter where the column exists.
  deleted_filter=""
  if [ "$table" = "video_comments" ]; then
    deleted_filter="AND t.deleted_at IS NULL"
  fi

  rows=$(pg -c "
  SELECT
      to_char(t.created_at, 'YYYY-MM-DD HH24:MI:SS.MS'),
      '${event}',
      t.video_id,
      v.user_id,
      COALESCE(t.user_id, 0),
      '', 1, 0, 0, '', '', '', '', '', 0, ''
  FROM ${table} t
  JOIN videos v ON v.id = t.video_id
  WHERE t.created_at IS NOT NULL ${deleted_filter}
  ")

  # An empty table is normal (nobody has saved a video yet). Piping nothing into
  # ClickHouse raises NO_DATA_TO_INSERT, which makes a perfectly good run look like
  # a failure - so skip rather than let a non-error print like an error.
  if [ -z "$rows" ]; then
    echo "     (none)"
    continue
  fi

  printf '%s\n' "$rows" | ch --query "INSERT INTO reelsoo.events ($COLS) FORMAT TabSeparated"
done

# The materialized views only fire on INSERT, so rows loaded above populated them
# as they landed - EXCEPT for anything inserted before the MVs existed. Rebuilding
# from the raw log is cheap and always safe, so just do it unconditionally.
echo "── rebuilding rollups from the raw log"
METRIC="transform(event_type,['unlike','unsave','uncomment','unfollow_from_video'],['like','save','comment','follow_from_video'],event_type)"

ch --query "TRUNCATE TABLE reelsoo.video_daily"
ch --query "INSERT INTO reelsoo.video_daily
SELECT video_id, creator_id, event_date, $METRIC AS metric,
       countState(), sumState(delta), sumState(watch_seconds),
       avgState(completion_pct),
       quantilesState(0.1,0.2,0.3,0.4,0.5,0.6,0.7,0.8,0.9,1.0)(completion_pct),
       uniqState(user_id)
FROM reelsoo.events WHERE video_id != 0
GROUP BY video_id, creator_id, event_date, metric"

ch --query "TRUNCATE TABLE reelsoo.creator_daily"
ch --query "INSERT INTO reelsoo.creator_daily
SELECT creator_id, event_date, $METRIC AS metric,
       countState(), sumState(delta), sumState(watch_seconds),
       avgState(completion_pct), uniqState(user_id)
FROM reelsoo.events WHERE creator_id != 0
GROUP BY creator_id, event_date, metric"

ch --query "TRUNCATE TABLE reelsoo.creator_audience_daily"
ch --query "INSERT INTO reelsoo.creator_audience_daily
SELECT creator_id, event_date, source, country, city, device_type, platform,
       countState(), uniqState(user_id)
FROM reelsoo.events WHERE creator_id != 0 AND event_type = 'view'
GROUP BY creator_id, event_date, source, country, city, device_type, platform"

ch --query "TRUNCATE TABLE reelsoo.creator_hourly"
ch --query "INSERT INTO reelsoo.creator_hourly
SELECT creator_id, event_date, toHour(event_time) AS hour,
       countStateIf(event_type = 'view'),
       sumStateIf(delta, event_type IN ('like','unlike','comment','uncomment','save','unsave','share'))
FROM reelsoo.events WHERE creator_id != 0
GROUP BY creator_id, event_date, hour"

echo
echo "── result"
ch --query "SELECT event_type, count() AS rows, min(event_time) AS first, max(event_time) AS last
            FROM reelsoo.events GROUP BY event_type ORDER BY rows DESC FORMAT PrettyCompactMonoBlock"
echo "✅ backfill complete"
