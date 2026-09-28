-- name: GetVideoForShow :one
-- Every scalar column VideoResource reads. Respects the SoftDeletes global
-- scope (deleted_at IS NULL) like Video::where('id',$id)->firstOrFail().
SELECT id, user_id, title, caption, video_url, thumbnail_url, mime_type,
       media_items, quality_urls, category, location, language, allow_download,
       duration, file_size, width, height, status, moderation_status,
       is_pinned, pinned_at, is_ai_generated, allow_comments, allow_duet,
       allow_stitch, views_count, likes_count, comments_count, saves_count,
       shares_count, audio_track_id, music_track_id, audio_type,
       scheduled_at, created_at
FROM videos
WHERE id = $1 AND deleted_at IS NULL;

-- name: GetVideoUserWithProfile :one
-- The eager-loaded `user.profile`. LEFT JOIN so a missing profile row still
-- yields the user (counts fall back to 0, matching profile?->total_* ?? 0).
SELECT u.id, u.username, u.name, u.avatar, u.is_verified,
       COALESCE(p.total_followers, 0)::int  AS total_followers,
       COALESCE(p.total_likes, 0)::bigint   AS total_likes
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
WHERE u.id = $1;

-- (hashtag names reuse the existing GetVideoHashtagNames in videos.sql)

-- name: GetAudioTrackForVideo :one
SELECT id, title, artist FROM audio_tracks WHERE id = $1;

-- name: GetMusicTrackForVideo :one
SELECT id, title, artist_name, cover_url, audio_url, duration, uses_count, source_type
FROM music_tracks WHERE id = $1;

-- name: GetVideoTaggedUsers :many
-- "Tag people": comment_mentions rows with source_type='tag', source_id=video.
-- Filtered to active, non-banned users so deactivated accounts drop off.
SELECT u.id, u.username, u.name, u.avatar, u.is_verified
FROM comment_mentions cm
JOIN users u ON u.id = cm.mentioned_user_id
WHERE cm.source_id = $1 AND cm.source_type = 'tag'
  AND u.is_active = true AND u.is_banned = false
ORDER BY cm.id;

-- name: IsVideoLikedBy :one
SELECT EXISTS (SELECT 1 FROM video_likes WHERE video_id = $1 AND user_id = $2);

-- name: IsVideoSavedBy :one
SELECT EXISTS (SELECT 1 FROM video_saves WHERE video_id = $1 AND user_id = $2);

-- name: IsFollowing :one
-- Mirrors User::following() (belongsToMany followers, no status filter).
SELECT EXISTS (SELECT 1 FROM followers WHERE follower_id = $1 AND following_id = $2);

-- name: SumVideoWatchDuration :one
SELECT COALESCE(SUM(watch_duration), 0)::bigint
FROM video_views
WHERE video_id = $1 AND watch_duration IS NOT NULL;

-- name: CountVisibleComments :one
-- Read-only twin of SyncVideoCommentsCount's inner SELECT (the
-- withVisibleCommentsCount scope): top-level visible comments plus replies
-- whose root top-level comment is still visible.
SELECT COUNT(*)
FROM video_comments vc
WHERE vc.video_id = $1 AND vc.is_hidden = false AND vc.is_spam = false
  AND vc.held_for_review = false AND vc.deleted_at IS NULL
  AND (
    vc.parent_id IS NULL
    OR EXISTS (
        SELECT 1 FROM video_comments vc_root
        WHERE vc_root.id = vc.root_id
          AND vc_root.is_hidden = false AND vc_root.is_spam = false
          AND vc_root.held_for_review = false AND vc_root.deleted_at IS NULL
    )
  );
