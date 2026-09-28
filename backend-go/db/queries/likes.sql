-- name: GetVideoOwnerForUpdate :one
SELECT id, user_id FROM videos WHERE id = $1 FOR UPDATE;

-- name: GetInteractableVideoForUpdate :one
-- Mirrors VideoInteractionController::interactableVideo(): only published,
-- non-rejected videos can be liked/saved/shared. Used by like() (and now
-- save()/share()) - unlike()/unsave() intentionally use the plain,
-- unscoped GetVideoOwnerForUpdate above, matching Laravel's own asymmetry
-- (removing a reaction is allowed even if the video was since unpublished
-- or flagged; adding a new one is not).
SELECT id, user_id FROM videos
WHERE id = $1 AND status = 'published' AND (moderation_status IS NULL OR moderation_status != 'rejected')
FOR UPDATE;

-- name: InsertVideoLike :one
-- ON CONFLICT DO NOTHING + RETURNING mirrors firstOrCreate()'s idempotency:
-- a row comes back only on a genuine new like, never on a repeat tap. This
-- is what VideoLikeObserver::created's increment was conditioned on in
-- Laravel; here that condition is just "did this query return a row".
INSERT INTO video_likes (video_id, user_id, created_at)
VALUES ($1, $2, now())
ON CONFLICT (video_id, user_id) DO NOTHING
RETURNING id;

-- name: DeleteVideoLike :one
-- Mirrors VideoLikeObserver::deleted's condition: only decrement when a row
-- genuinely existed and was removed, never on a repeat unlike.
DELETE FROM video_likes WHERE video_id = $1 AND user_id = $2
RETURNING id;

-- name: IncrementVideoLikesCount :exec
UPDATE videos SET likes_count = likes_count + 1, updated_at = now() WHERE id = $1;

-- name: DecrementVideoLikesCount :exec
UPDATE videos SET likes_count = likes_count - 1, updated_at = now()
WHERE id = $1 AND likes_count > 0;

-- name: IncrementProfileTotalLikes :exec
UPDATE profiles SET total_likes = total_likes + 1, updated_at = now() WHERE user_id = $1;

-- name: DecrementProfileTotalLikes :exec
UPDATE profiles SET total_likes = total_likes - 1, updated_at = now()
WHERE user_id = $1 AND total_likes > 0;

-- name: GetVideoLikesCount :one
SELECT likes_count FROM videos WHERE id = $1;
