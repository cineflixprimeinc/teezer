-- name: VideoExistsForScoring :one
SELECT EXISTS(SELECT 1 FROM videos WHERE id = $1);

-- name: UpsertVideoScore :exec
INSERT INTO video_scores (
    video_id, score, completion_score, rewatch_score, like_score,
    comment_score, share_score, save_score, follow_score,
    skip_penalty, report_penalty, event_count, computed_at, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), now()
)
ON CONFLICT (video_id) DO UPDATE SET
    score = EXCLUDED.score,
    completion_score = EXCLUDED.completion_score,
    rewatch_score = EXCLUDED.rewatch_score,
    like_score = EXCLUDED.like_score,
    comment_score = EXCLUDED.comment_score,
    share_score = EXCLUDED.share_score,
    save_score = EXCLUDED.save_score,
    follow_score = EXCLUDED.follow_score,
    skip_penalty = EXCLUDED.skip_penalty,
    report_penalty = EXCLUDED.report_penalty,
    event_count = EXCLUDED.event_count,
    computed_at = now(),
    updated_at = now();
