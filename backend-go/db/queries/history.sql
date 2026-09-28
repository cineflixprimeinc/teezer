-- Watch-history reads. Mirrors App\Http\Controllers\Api\WatchHistoryController's
-- GET endpoints (list/summary/continue-watching/creators/settings). These use
-- bespoke projections (not VideoResource), so they don't feed renderVideoList.
--
-- NOT ported here: the write side - updateSettings (PATCH), clearAll (DELETE),
-- removeVideo (DELETE) - stays in Laravel.

-- name: CountWatchHistory :one
-- Paginator total for list(): distinct videos the user watched whose video row
-- still exists (the join drops views of soft-deleted videos).
SELECT COUNT(*) FROM (
    SELECT vv.video_id
    FROM video_views vv
    JOIN videos v ON v.id = vv.video_id
    WHERE vv.user_id = @user_id AND v.deleted_at IS NULL
    GROUP BY vv.video_id
) t;

-- name: ListWatchHistory :many
-- list(): one row per unique video (latest view via MAX(id) per video_id), most
-- recently watched first. Bespoke columns matching the controller's select.
SELECT vv.id,
       v.id            AS video_id,
       v.title,
       v.duration,
       v.thumbnail_url,
       v.views_count,
       v.category,
       u.name          AS creator,
       u.username      AS creator_username,
       u.is_verified,
       vv.created_at   AS watched_at
FROM video_views vv
JOIN videos v ON v.id = vv.video_id
JOIN users u ON u.id = v.user_id
WHERE vv.id IN (
    SELECT MAX(vv2.id) FROM video_views vv2 WHERE vv2.user_id = @user_id GROUP BY vv2.video_id
)
  AND v.deleted_at IS NULL
ORDER BY vv.created_at DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: WatchHistorySummaryToday :one
-- summary(): total watch seconds + unique videos watched, for the given UTC day
-- window [@day_start, @day_end).
SELECT COALESCE(SUM(watch_duration), 0)::bigint AS watch_seconds,
       COUNT(DISTINCT video_id)::bigint          AS videos_count
FROM video_views
WHERE user_id = @user_id AND created_at >= @day_start AND created_at < @day_end;

-- name: WatchHistoryLiveReplaysToday :one
-- summary(): distinct videos with a 'rewatch' event in the same day window.
SELECT COUNT(DISTINCT video_id)::bigint
FROM video_events
WHERE user_id = @user_id AND event_type = 'rewatch'
  AND created_at >= @day_start AND created_at < @day_end;

-- name: WatchHistoryTopCategory :one
-- summary(): the category this user has viewed most (all-time). No rows -> the
-- caller reads pgx.ErrNoRows as "null top_category", matching ->first().
SELECT v.category
FROM video_views vv
JOIN videos v ON v.id = vv.video_id
WHERE vv.user_id = @user_id AND v.category IS NOT NULL AND v.category != ''
GROUP BY v.category
ORDER BY COUNT(*) DESC
LIMIT 1;

-- name: ContinueWatching :many
-- continueWatching(): the latest view_progress event per video (DISTINCT ON),
-- kept only when that latest event's completion is in (0, 90), the 4 most recent
-- of those, then inner-joined to their still-published video. The join drops
-- (never backfills) unpublished/removed videos, exactly like the controller's
-- take(4)-then-filter order.
WITH latest AS (
    SELECT DISTINCT ON (e.video_id)
           e.video_id,
           e.id,
           (e.payload->>'completion_pct')::float8            AS completion_pct,
           COALESCE((e.payload->>'watch_duration')::float8, 0) AS watch_duration
    FROM video_events e
    WHERE e.user_id = @user_id AND e.event_type = 'view_progress'
    ORDER BY e.video_id, e.id DESC
),
picked AS (
    SELECT * FROM latest
    WHERE completion_pct > 0 AND completion_pct < 90
    ORDER BY id DESC
    LIMIT 4
)
SELECT p.video_id,
       p.id,
       p.completion_pct,
       p.watch_duration,
       v.title,
       v.thumbnail_url,
       v.duration,
       u.name AS creator_name
FROM picked p
JOIN videos v ON v.id = p.video_id AND v.status = 'published'
JOIN users u ON u.id = v.user_id
ORDER BY p.id DESC;

-- name: WatchHistoryCreators :many
-- creators(): the 10 creators (excluding self) whose videos the user watched
-- most recently, with a per-creator watch count. Follow status is layered on in
-- Go via the shared ListFollowedCreatorIDs (any-status, matching the controller).
SELECT u.id, u.name, u.username, u.avatar, u.is_verified,
       COUNT(vv.id)::bigint AS watch_count
FROM video_views vv
JOIN videos v ON v.id = vv.video_id
JOIN users u ON u.id = v.user_id
WHERE vv.user_id = @user_id AND v.user_id != @user_id AND v.deleted_at IS NULL
GROUP BY u.id, u.name, u.username, u.avatar, u.is_verified
ORDER BY MAX(vv.created_at) DESC
LIMIT 10;

-- name: GetSaveWatchHistory :one
-- getSettings(): the save_watch_history flag (NOT NULL default true).
SELECT save_watch_history FROM users WHERE id = @user_id;
