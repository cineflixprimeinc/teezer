-- name: GetInteractableVideo :one
-- Non-locking counterpart to GetInteractableVideoForUpdate, mirroring
-- VideoInteractionController::interactableVideo() (a plain firstOrFail, no
-- lock) as used by report()/notInterested(): only published, non-rejected
-- videos may be reported. Returns owner so callers that need it (e.g. the
-- creator id) don't re-query.
SELECT id, user_id FROM videos
WHERE id = $1 AND status = 'published' AND (moderation_status IS NULL OR moderation_status != 'rejected');

-- name: ExistsVideoReport :one
-- One report per (video, reporter): a second report returns 422 in Laravel.
SELECT EXISTS (
    SELECT 1 FROM video_reports WHERE video_id = $1 AND reporter_id = $2
);

-- name: InsertVideoReport :exec
-- status defaults to 'pending'; the table has no updated_at (created_at only).
INSERT INTO video_reports (video_id, reporter_id, reason, description, created_at)
VALUES ($1, $2, $3, $4, now());
