-- Explore + hashtag discovery reads. Mirrors App\Http\Controllers\Api\
-- ExploreController (trending/hashtags/hashtag-videos/search) and
-- HashtagController::trending. All are public/OptionalAuth Postgres reads; the
-- video-returning queries share GetVideoForShow's column list so their rows feed
-- the shared renderVideoList, and SearchUsers shares GetUserForShow's so its rows
-- feed renderUserList.

-- name: ExploreTopHashtags :many
-- ExploreController::hashtags - top-30 hashtags by lifetime video count.
SELECT id, name, videos_count
FROM hashtags
ORDER BY videos_count DESC
LIMIT 30;

-- name: GetHashtagByName :one
-- ExploreController::hashtagVideos - firstOrFail on the lowercased name.
SELECT id, name, videos_count
FROM hashtags
WHERE name = @name;

-- name: CountHashtagVideos :one
-- Paginator total for hashtagVideos (same filters as ListHashtagVideos).
SELECT count(*)
FROM videos v
JOIN video_hashtags vh ON v.id = vh.video_id
WHERE vh.hashtag_id = @hashtag_id
  AND v.status = 'published'
  AND (v.moderation_status IS NULL OR v.moderation_status != 'rejected')
  AND v.deleted_at IS NULL;

-- name: ListHashtagVideos :many
-- ExploreController::hashtagVideos - published videos carrying the tag, most-
-- viewed first. Columns/order match GetVideoForShow so rows reuse renderVideoList.
SELECT v.id, v.user_id, v.title, v.caption, v.video_url, v.thumbnail_url, v.mime_type,
       v.media_items, v.quality_urls, v.category, v.location, v.language, v.allow_download,
       v.duration, v.file_size, v.width, v.height, v.status, v.moderation_status,
       v.is_pinned, v.pinned_at, v.is_ai_generated, v.allow_comments, v.allow_duet,
       v.allow_stitch, v.views_count, v.likes_count, v.comments_count, v.saves_count,
       v.shares_count, v.audio_track_id, v.music_track_id, v.audio_type,
       v.scheduled_at, v.created_at
FROM videos v
JOIN video_hashtags vh ON v.id = vh.video_id
WHERE vh.hashtag_id = @hashtag_id
  AND v.status = 'published'
  AND (v.moderation_status IS NULL OR v.moderation_status != 'rejected')
  AND v.deleted_at IS NULL
ORDER BY v.views_count DESC
LIMIT @row_limit OFFSET @row_offset;

-- name: SearchVideosByCaption :many
-- ExploreController::search (videos) - caption ILIKE, most-viewed first, top-10.
-- Columns/order match GetVideoForShow.
SELECT id, user_id, title, caption, video_url, thumbnail_url, mime_type,
       media_items, quality_urls, category, location, language, allow_download,
       duration, file_size, width, height, status, moderation_status,
       is_pinned, pinned_at, is_ai_generated, allow_comments, allow_duet,
       allow_stitch, views_count, likes_count, comments_count, saves_count,
       shares_count, audio_track_id, music_track_id, audio_type,
       scheduled_at, created_at
FROM videos
WHERE status = 'published'
  AND (moderation_status IS NULL OR moderation_status != 'rejected')
  AND deleted_at IS NULL
  AND caption ILIKE '%' || @q || '%'
ORDER BY views_count DESC
LIMIT 10;

-- name: SearchUsers :many
-- ExploreController::search (users) - username/name ILIKE, non-banned, top-10.
-- Columns/order match GetUserForShow so rows reuse renderUserList.
SELECT u.id, u.name, u.username, u.avatar, u.bio, u.country, u.location,
       u.categories, u.website, u.is_verified, u.is_private, u.role, u.created_at,
       COALESCE(p.total_followers, 0)::int  AS total_followers,
       COALESCE(p.total_following, 0)::int  AS total_following,
       COALESCE(p.total_likes, 0)::bigint   AS total_likes,
       COALESCE(p.total_videos, 0)::int     AS total_videos
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.is_banned = false
  AND (u.username ILIKE '%' || @q || '%' OR u.name ILIKE '%' || @q || '%')
LIMIT 10;

-- name: SearchHashtags :many
-- ExploreController::search (hashtags) - name ILIKE, most-used first, top-10.
SELECT id, name, videos_count
FROM hashtags
WHERE name ILIKE '%' || @q || '%'
ORDER BY videos_count DESC
LIMIT 10;

-- name: TrendingHashtagsRecent :many
-- HashtagController::trending - hashtags used most across published videos posted
-- in the last @days days. Heavy triple-join; Laravel caches it 15 min - the Go
-- path computes it live (same rows, no staleness), consistent with elsewhere.
SELECT h.id, h.name, COUNT(*)::bigint AS recent_count
FROM hashtags h
JOIN video_hashtags vh ON h.id = vh.hashtag_id
JOIN videos v ON v.id = vh.video_id
WHERE v.status = 'published' AND v.deleted_at IS NULL AND v.created_at >= @cutoff
GROUP BY h.id, h.name
ORDER BY recent_count DESC
LIMIT @row_limit;

-- name: TrendingHashtagsLifetime :many
-- HashtagController::trending lifetime fallback when the recent window is empty.
SELECT id, name, videos_count::bigint AS recent_count
FROM hashtags
WHERE videos_count > 0
ORDER BY videos_count DESC
LIMIT @row_limit;
