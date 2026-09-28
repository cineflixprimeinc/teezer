-- name: ListUserVideos :many
-- A profile's public reels (UserController::videos). Columns/order MUST match
-- GetVideoForShow so the row converts straight to GetVideoForShowRow. Pinned
-- reels always lead; @sort (normalized to latest|oldest|most_viewed|most_likes
-- by the caller) drives the within-group order via the CASE terms.
SELECT id, user_id, title, caption, video_url, thumbnail_url, mime_type,
       media_items, quality_urls, category, location, language, allow_download,
       duration, file_size, width, height, status, moderation_status,
       is_pinned, pinned_at, is_ai_generated, allow_comments, allow_duet,
       allow_stitch, views_count, likes_count, comments_count, saves_count,
       shares_count, audio_track_id, music_track_id, audio_type,
       scheduled_at, created_at
FROM videos
WHERE user_id = @user_id AND deleted_at IS NULL
  AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected')
ORDER BY is_pinned DESC,
  (CASE WHEN @sort = 'most_viewed' THEN views_count ELSE 0 END) DESC,
  (CASE WHEN @sort = 'most_likes'  THEN likes_count ELSE 0 END) DESC,
  (CASE WHEN @sort = 'latest'      THEN pinned_at   END) DESC NULLS LAST,
  (CASE WHEN @sort = 'oldest'      THEN created_at  END) ASC  NULLS LAST,
  created_at DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: CountUserPublicVideos :one
SELECT count(*) FROM videos
WHERE user_id = $1 AND deleted_at IS NULL
  AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected');

-- name: ListVideoHashtags :many
-- Batched eager-load of hashtags for a page of videos (with('hashtags')).
SELECT vh.video_id, h.name
FROM hashtags h
JOIN video_hashtags vh ON vh.hashtag_id = h.id
WHERE vh.video_id = ANY($1::bigint[])
ORDER BY vh.video_id, h.id;

-- name: ListVisibleCommentCounts :many
-- Batched withVisibleCommentsCount for a page (videos with 0 visible comments
-- are simply absent → caller defaults them to 0).
SELECT vc.video_id, COUNT(*) AS cnt
FROM video_comments vc
WHERE vc.video_id = ANY($1::bigint[])
  AND vc.is_hidden = false AND vc.is_spam = false
  AND vc.held_for_review = false AND vc.deleted_at IS NULL
  AND (
    vc.parent_id IS NULL
    OR EXISTS (
        SELECT 1 FROM video_comments vc_root
        WHERE vc_root.id = vc.root_id
          AND vc_root.is_hidden = false AND vc_root.is_spam = false
          AND vc_root.held_for_review = false AND vc_root.deleted_at IS NULL
    )
  )
GROUP BY vc.video_id;

-- name: ListLikedVideoIDs :many
SELECT video_id FROM video_likes
WHERE user_id = $1 AND video_id = ANY($2::bigint[]);

-- name: ListSavedVideoIDs :many
SELECT video_id FROM video_saves
WHERE user_id = $1 AND video_id = ANY($2::bigint[]);

-- name: GetUserForProfile :one
-- Profile lookup with the privacy prefs the liked/saved gates read.
SELECT id, is_private, is_banned, saved_privacy, who_can_see_liked
FROM users WHERE username = $1;

-- name: GetVideoUsersWithProfile :many
-- Batched user.profile eager-load for a page whose videos span many creators
-- (liked/feed). Columns/order match GetVideoUserWithProfile so rows convert.
SELECT u.id, u.username, u.name, u.avatar, u.is_verified,
       COALESCE(p.total_followers, 0)::int  AS total_followers,
       COALESCE(p.total_likes, 0)::bigint   AS total_likes
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.id = ANY($1::bigint[]);

-- name: ListFollowedCreatorIDs :many
-- Of the given creators, which the viewer follows (any status, User::following).
SELECT following_id FROM followers
WHERE follower_id = $1 AND following_id = ANY($2::bigint[]);

-- name: ListLikedVideos :many
-- Videos a user liked, newest-liked first (UserController::liked). Columns/order
-- match GetVideoForShow. Published + not-rejected, like show/videos().
SELECT videos.id, videos.user_id, videos.title, videos.caption, videos.video_url,
       videos.thumbnail_url, videos.mime_type, videos.media_items, videos.quality_urls,
       videos.category, videos.location, videos.language, videos.allow_download,
       videos.duration, videos.file_size, videos.width, videos.height, videos.status,
       videos.moderation_status, videos.is_pinned, videos.pinned_at, videos.is_ai_generated,
       videos.allow_comments, videos.allow_duet, videos.allow_stitch, videos.views_count,
       videos.likes_count, videos.comments_count, videos.saves_count, videos.shares_count,
       videos.audio_track_id, videos.music_track_id, videos.audio_type,
       videos.scheduled_at, videos.created_at
FROM videos
JOIN video_likes ON video_likes.video_id = videos.id
WHERE video_likes.user_id = @user_id AND videos.deleted_at IS NULL
  AND videos.status = 'published'
  AND (videos.moderation_status IS NULL OR videos.moderation_status != 'rejected')
ORDER BY video_likes.created_at DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: CountLikedVideos :one
SELECT count(*) FROM videos
JOIN video_likes ON video_likes.video_id = videos.id
WHERE video_likes.user_id = $1 AND videos.deleted_at IS NULL
  AND videos.status = 'published'
  AND (videos.moderation_status IS NULL OR videos.moderation_status != 'rejected');

-- name: ListSavedVideos :many
-- Videos a user saved, newest-saved first (UserController::saved). NOTE: saved()
-- applies NO moderation filter and eager-loads nothing (caller omits user/
-- hashtags/visible-count). Columns/order match GetVideoForShow.
SELECT videos.id, videos.user_id, videos.title, videos.caption, videos.video_url,
       videos.thumbnail_url, videos.mime_type, videos.media_items, videos.quality_urls,
       videos.category, videos.location, videos.language, videos.allow_download,
       videos.duration, videos.file_size, videos.width, videos.height, videos.status,
       videos.moderation_status, videos.is_pinned, videos.pinned_at, videos.is_ai_generated,
       videos.allow_comments, videos.allow_duet, videos.allow_stitch, videos.views_count,
       videos.likes_count, videos.comments_count, videos.saves_count, videos.shares_count,
       videos.audio_track_id, videos.music_track_id, videos.audio_type,
       videos.scheduled_at, videos.created_at
FROM videos
JOIN video_saves ON video_saves.video_id = videos.id
WHERE video_saves.user_id = @user_id AND videos.deleted_at IS NULL
  AND videos.status = 'published'
ORDER BY video_saves.created_at DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: CountSavedVideos :one
SELECT count(*) FROM videos
JOIN video_saves ON video_saves.video_id = videos.id
WHERE video_saves.user_id = $1 AND videos.deleted_at IS NULL
  AND videos.status = 'published';

-- name: ListTrendingVideos :many
-- FeedService::trending - most-viewed then most-liked, last 7 days (cutoff
-- passed in so it's computed in UTC like now()->subDays(7)). Columns/order match
-- GetVideoForShow.
SELECT id, user_id, title, caption, video_url, thumbnail_url, mime_type,
       media_items, quality_urls, category, location, language, allow_download,
       duration, file_size, width, height, status, moderation_status,
       is_pinned, pinned_at, is_ai_generated, allow_comments, allow_duet,
       allow_stitch, views_count, likes_count, comments_count, saves_count,
       shares_count, audio_track_id, music_track_id, audio_type,
       scheduled_at, created_at
FROM videos
WHERE deleted_at IS NULL AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected')
  AND created_at >= @cutoff
ORDER BY views_count DESC, likes_count DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: CountTrendingVideos :one
SELECT count(*) FROM videos
WHERE deleted_at IS NULL AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected')
  AND created_at >= $1;

-- name: ListFollowingFeed :many
-- FeedService::following - published videos from creators the viewer follows
-- (any status, User::following), newest first. Columns/order match
-- GetVideoForShow. Empty following set → IN (empty) → no rows, like whereIn([]).
SELECT id, user_id, title, caption, video_url, thumbnail_url, mime_type,
       media_items, quality_urls, category, location, language, allow_download,
       duration, file_size, width, height, status, moderation_status,
       is_pinned, pinned_at, is_ai_generated, allow_comments, allow_duet,
       allow_stitch, views_count, likes_count, comments_count, saves_count,
       shares_count, audio_track_id, music_track_id, audio_type,
       scheduled_at, created_at
FROM videos
WHERE user_id IN (SELECT following_id FROM followers WHERE follower_id = @auth_user_id)
  AND deleted_at IS NULL AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected')
ORDER BY created_at DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: CountFollowingFeed :one
SELECT count(*) FROM videos
WHERE user_id IN (SELECT following_id FROM followers WHERE follower_id = $1)
  AND deleted_at IS NULL AND status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected');

-- name: GetAudioTracksByIDs :many
SELECT id, title, artist FROM audio_tracks WHERE id = ANY($1::bigint[]);

-- name: GetMusicTracksByIDs :many
SELECT id, title, artist_name, cover_url, audio_url, duration, uses_count, source_type
FROM music_tracks WHERE id = ANY($1::bigint[]);

-- name: ListTaggedUsersForVideos :many
-- Batched "Tag people" for a page (source_id = video id). Grouped by video by
-- the caller; ordered so each video's tags stay in attach order.
SELECT cm.source_id AS video_id, u.id, u.username, u.name, u.avatar, u.is_verified
FROM comment_mentions cm
JOIN users u ON u.id = cm.mentioned_user_id
WHERE cm.source_id = ANY($1::bigint[]) AND cm.source_type = 'tag'
  AND u.is_active = true AND u.is_banned = false
ORDER BY cm.source_id, cm.id;

-- name: IsFollowingAccepted :one
-- Accepted-only follow (canViewPrivateContent's private-account gate), distinct
-- from IsFollowing which matches User::following() with no status filter.
SELECT EXISTS (
    SELECT 1 FROM followers
    WHERE follower_id = $1 AND following_id = $2 AND status = 'accepted'
);
