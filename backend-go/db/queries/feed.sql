-- name: ListFeedCandidates :many
-- FeedService::forYou candidate pool: published, not-rejected, not-deleted,
-- minus excluded ids and blocked users (both directions), pre-ordered by raw
-- engagement+recency so the window holds viable videos. @auth_user_id = 0 for
-- guests makes both filters no-ops. Columns/order match GetVideoForShow.
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
  AND id != ALL(@exclude_ids::bigint[])
  AND user_id NOT IN (
      SELECT bu.blocked_id FROM blocked_users bu WHERE bu.blocker_id = @auth_user_id
      UNION
      SELECT bu2.blocker_id FROM blocked_users bu2 WHERE bu2.blocked_id = @auth_user_id
  )
ORDER BY (likes_count * 2 + comments_count * 3 + saves_count * 4
          + GREATEST(0, 168 - EXTRACT(EPOCH FROM (NOW() - created_at)) / 3600) * 4) DESC
LIMIT @pool;

-- name: FeedTrendingHashtags :many
-- Top-50 hashtag names used in the last N days (trendingHashtagSet). Only the
-- name set is used for scoring intersection, so the normalized score is dropped.
SELECT h.name
FROM hashtags h
JOIN video_hashtags vh ON h.id = vh.hashtag_id
JOIN videos v ON v.id = vh.video_id
WHERE v.status = 'published' AND v.deleted_at IS NULL AND v.created_at >= $1
GROUP BY h.name
ORDER BY COUNT(*) DESC
LIMIT 50;

-- name: FeedUserInterestHashtags :many
-- Top-30 hashtag names from videos this user liked/saved recently
-- (userInterestHashtagSet). Name set only.
SELECT h.name
FROM video_hashtags vh
JOIN hashtags h ON h.id = vh.hashtag_id
WHERE vh.video_id IN (
    SELECT vl.video_id FROM video_likes vl WHERE vl.user_id = @user_id AND vl.created_at >= @cutoff
    UNION
    SELECT vs.video_id FROM video_saves vs WHERE vs.user_id = @user_id AND vs.created_at >= @cutoff
)
GROUP BY h.name
ORDER BY COUNT(*) DESC
LIMIT 30;

-- name: FeedCompletionRates :many
-- Per-video avg watch completion (0..1) over the last 14 days, from view events.
SELECT vv.video_id,
       AVG(LEAST(1.0, vv.watch_duration::float8 / NULLIF(v.duration, 0)))::float8 AS rate
FROM video_views vv
JOIN videos v ON v.id = vv.video_id
WHERE vv.video_id = ANY(@ids::bigint[])
  AND vv.watch_duration IS NOT NULL
  AND v.duration IS NOT NULL AND v.duration > 0
  AND vv.created_at >= @cutoff
GROUP BY vv.video_id;
