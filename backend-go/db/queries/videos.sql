-- name: VideoExists :one
SELECT EXISTS(SELECT 1 FROM videos WHERE id = $1);

-- name: GetVideoForPreferences :one
SELECT id, user_id, category FROM videos WHERE id = $1;

-- name: GetVideoHashtagNames :many
SELECT h.name
FROM hashtags h
JOIN video_hashtags vh ON vh.hashtag_id = h.id
WHERE vh.video_id = $1;
