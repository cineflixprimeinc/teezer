-- name: InsertVideoEvent :one
INSERT INTO video_events (video_id, user_id, session_id, event_type, payload, ip_address, created_at)
VALUES ($1, $2, $3, $4, $5, $6, now())
RETURNING id;

-- name: AggregateVideoEvents30d :many
SELECT
    event_type,
    COUNT(*) AS cnt,
    COALESCE(AVG((payload ->> 'completion_pct')::float), 0)::float8 AS avg_completion
FROM video_events
WHERE video_id = $1
  AND created_at >= now() - interval '30 days'
GROUP BY event_type;

-- name: CountVideoEvents :one
SELECT COUNT(*) FROM video_events WHERE video_id = $1;
