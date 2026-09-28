-- name: ListAcceptedFollowers :many
-- Users who follow @target (accepted). Columns/order match GetUserForShow so
-- rows convert to GetUserForShowRow. Newest-follow first (deterministic).
SELECT u.id, u.name, u.username, u.avatar, u.bio, u.country, u.location,
       u.categories, u.website, u.is_verified, u.is_private, u.role, u.created_at,
       COALESCE(p.total_followers, 0)::int  AS total_followers,
       COALESCE(p.total_following, 0)::int  AS total_following,
       COALESCE(p.total_likes, 0)::bigint   AS total_likes,
       COALESCE(p.total_videos, 0)::int     AS total_videos
FROM followers f
JOIN users u ON u.id = f.follower_id
LEFT JOIN profiles p ON p.user_id = u.id
WHERE f.following_id = @target AND f.status = 'accepted'
ORDER BY f.id DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: ListAcceptedFollowing :many
-- Users @target follows (accepted). Same shape as ListAcceptedFollowers.
SELECT u.id, u.name, u.username, u.avatar, u.bio, u.country, u.location,
       u.categories, u.website, u.is_verified, u.is_private, u.role, u.created_at,
       COALESCE(p.total_followers, 0)::int  AS total_followers,
       COALESCE(p.total_following, 0)::int  AS total_following,
       COALESCE(p.total_likes, 0)::bigint   AS total_likes,
       COALESCE(p.total_videos, 0)::int     AS total_videos
FROM followers f
JOIN users u ON u.id = f.following_id
LEFT JOIN profiles p ON p.user_id = u.id
WHERE f.follower_id = @target AND f.status = 'accepted'
ORDER BY f.id DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: ListAcceptedFollowedIDs :many
-- markFollowingFor: of the given users, which the viewer follows (accepted).
SELECT following_id FROM followers
WHERE follower_id = $1 AND following_id = ANY($2::bigint[]) AND status = 'accepted';

-- name: ListUsersWithStory :many
-- Batched has_story: which of the given users have an active published story.
SELECT DISTINCT user_id FROM stories
WHERE user_id = ANY($1::bigint[]) AND status = 'published'
  AND (expires_at IS NULL OR expires_at > now());

-- name: CountFollowersForUsers :many
-- Batched withCount('followers') (any status) for the following() list.
SELECT following_id, COUNT(*)::bigint AS cnt
FROM followers
WHERE following_id = ANY($1::bigint[])
GROUP BY following_id;

-- name: SumVideoLikesForUsers :many
-- Batched withSum('videos','likes_count') for the following() list - all of a
-- user's non-deleted videos (no status filter, matching the relation).
SELECT user_id, COALESCE(SUM(likes_count), 0)::bigint AS total
FROM videos
WHERE user_id = ANY($1::bigint[]) AND deleted_at IS NULL
GROUP BY user_id;


-- name: SearchUsersForMention :many
-- StoryController::searchUsers - the simplified mention picker: id/username/
-- name/avatar/is_verified only, non-deleted, capped at 8.
SELECT id, username, name, avatar, is_verified
FROM users
WHERE (username ILIKE '%' || @q || '%' OR name ILIKE '%' || @q || '%')
  AND deleted_at IS NULL
LIMIT 8;
