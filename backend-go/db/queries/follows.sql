-- name: IsBlocked :one
SELECT EXISTS(SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2);

-- name: GetDisableFollowingOthers :one
SELECT disable_following_others FROM user_moderation_settings WHERE user_id = $1;

-- name: SelectFollowForUpdate :one
SELECT id, status FROM followers WHERE follower_id = $1 AND following_id = $2 FOR UPDATE;

-- name: InsertFollow :one
INSERT INTO followers (follower_id, following_id, status, created_at)
VALUES ($1, $2, $3, now())
RETURNING id;

-- name: DeleteFollow :one
DELETE FROM followers WHERE follower_id = $1 AND following_id = $2
RETURNING id, status;

-- name: IncrementFollowingCount :exec
UPDATE profiles SET total_following = total_following + 1, updated_at = now() WHERE user_id = $1;

-- name: IncrementFollowersCount :exec
UPDATE profiles SET total_followers = total_followers + 1, updated_at = now() WHERE user_id = $1;

-- name: DecrementFollowingCount :exec
UPDATE profiles SET total_following = total_following - 1, updated_at = now()
WHERE user_id = $1 AND total_following > 0;

-- name: DecrementFollowersCount :exec
UPDATE profiles SET total_followers = total_followers - 1, updated_at = now()
WHERE user_id = $1 AND total_followers > 0;

-- name: GetFollowersCount :one
SELECT COALESCE((SELECT total_followers FROM profiles WHERE user_id = $1), 0)::bigint;
