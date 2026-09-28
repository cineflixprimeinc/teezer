-- name: HasSharedRecently :one
-- Mirrors share()'s once-per-user-per-video-per-day dedupe.
SELECT EXISTS(
    SELECT 1 FROM video_shares
    WHERE video_id = $1 AND user_id = $2 AND created_at >= now() - interval '1 day'
);

-- name: InsertVideoShare :exec
INSERT INTO video_shares (video_id, user_id, platform, created_at)
VALUES ($1, $2, $3, now());

-- name: IncrementVideoSharesCount :exec
UPDATE videos SET shares_count = shares_count + 1, updated_at = now() WHERE id = $1;

-- name: GetVideoSharesCount :one
SELECT shares_count FROM videos WHERE id = $1;
