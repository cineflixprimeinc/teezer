-- name: GetUserForShow :one
-- Profile owner + profile aggregates (the private-account limited payload uses
-- the profile.total_* fallbacks; the full path overrides with live stats).
-- Scoped to non-banned users (404 otherwise), like UserController::show.
SELECT u.id, u.name, u.username, u.avatar, u.bio, u.country, u.location,
       u.categories, u.website, u.is_verified, u.is_private, u.role, u.created_at,
       COALESCE(p.total_followers, 0)::int  AS total_followers,
       COALESCE(p.total_following, 0)::int  AS total_following,
       COALESCE(p.total_likes, 0)::bigint   AS total_likes,
       COALESCE(p.total_videos, 0)::int     AS total_videos
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.username = $1 AND u.is_banned = false;

-- name: GetUserSocialLinks :many
SELECT platform, url FROM social_links WHERE user_id = $1 ORDER BY id;

-- name: CountAcceptedFollowers :one
SELECT count(*) FROM followers WHERE following_id = $1 AND status = 'accepted';

-- name: CountAcceptedFollowing :one
SELECT count(*) FROM followers WHERE follower_id = $1 AND status = 'accepted';

-- name: GetUserPublicVideoStats :one
-- videos_count / total_likes_received / total_video_views over public-published
-- videos (publicProfileVideosQuery), in one pass.
SELECT count(*)::bigint AS videos_count,
       COALESCE(SUM(likes_count), 0)::bigint AS total_likes_received,
       COALESCE(SUM(views_count), 0)::bigint AS total_video_views
FROM videos
WHERE user_id = $1 AND deleted_at IS NULL AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected');

-- name: UserHasStory :one
SELECT EXISTS (
    SELECT 1 FROM stories
    WHERE user_id = $1 AND status = 'published'
      AND (expires_at IS NULL OR expires_at > now())
);

-- name: GetFollowStatus :one
-- The raw followers.status for (viewer → target), or no row → caller treats as 'none'.
SELECT status FROM followers WHERE follower_id = $1 AND following_id = $2;

-- name: HasBlocked :one
SELECT EXISTS (SELECT 1 FROM blocked_users WHERE blocker_id = $1 AND blocked_id = $2);
