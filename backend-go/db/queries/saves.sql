-- name: InsertVideoSave :one
-- Same idempotency pattern as InsertVideoLike: a row comes back only on a
-- genuine new save. VideoSave has no model observer in Laravel - the
-- controller increments saves_count directly, conditioned on
-- wasRecentlyCreated; here the condition is simply "did a row come back".
INSERT INTO video_saves (video_id, user_id, created_at)
VALUES ($1, $2, now())
ON CONFLICT (video_id, user_id) DO NOTHING
RETURNING id;

-- name: DeleteVideoSave :one
DELETE FROM video_saves WHERE video_id = $1 AND user_id = $2
RETURNING id;

-- name: IncrementVideoSavesCount :exec
UPDATE videos SET saves_count = saves_count + 1, updated_at = now() WHERE id = $1;

-- name: DecrementVideoSavesCount :exec
UPDATE videos SET saves_count = saves_count - 1, updated_at = now()
WHERE id = $1 AND saves_count > 0;

-- name: GetVideoSavesCount :one
SELECT saves_count FROM videos WHERE id = $1;
