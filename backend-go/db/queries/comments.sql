-- name: GetPublishedVideoForComments :one
SELECT id, user_id, allow_comments FROM videos WHERE id = $1 AND status = 'published';

-- name: CountVisibleTopLevelComments :one
-- Mirrors visibleVideoCommentCount(): counts top-level comments plus
-- replies whose root is still visible/undeleted. Every video_comments
-- query here adds "deleted_at IS NULL" explicitly because Laravel's
-- SoftDeletes trait applies that as an invisible global scope on every
-- plain query - there is no Go-side equivalent, so it must be spelled out.
SELECT COUNT(*) FROM video_comments vc
WHERE vc.video_id = $1 AND vc.is_hidden = false AND vc.is_spam = false AND vc.held_for_review = false
  AND vc.deleted_at IS NULL
  AND (
    vc.parent_id IS NULL
    OR EXISTS (
        SELECT 1 FROM video_comments vc_root
        WHERE vc_root.id = vc.root_id
          AND vc_root.is_hidden = false AND vc_root.is_spam = false AND vc_root.held_for_review = false
          AND vc_root.deleted_at IS NULL
    )
  );

-- name: CountTopLevelCommentsOnly :one
-- Distinct from CountVisibleTopLevelComments above: this is the plain
-- top-level-only count paginate() uses for its `total`/`last_page` meta.
-- The other one (visibleVideoCommentCount) also counts nested replies and
-- is used for the separately-reported visible_comments_count.
SELECT COUNT(*) FROM video_comments
WHERE video_id = $1 AND parent_id IS NULL
  AND is_hidden = false AND is_spam = false AND held_for_review = false AND deleted_at IS NULL;

-- name: ListVisibleTopLevelComments :many
-- Mirrors index()'s ordering exactly: pinned first, then by pin_order,
-- then chronological.
SELECT id, video_id, user_id, parent_id, root_id, body, gif_url, gif_preview_url,
       gif_provider, gif_provider_id, comment_rank, likes_count, dislike_count,
       reply_count, reaction_score, is_pinned, pin_order, is_edited, edited_at, created_at
FROM video_comments
WHERE video_id = $1 AND parent_id IS NULL
  AND is_hidden = false AND is_spam = false AND held_for_review = false AND deleted_at IS NULL
ORDER BY is_pinned DESC, (pin_order IS NULL) ASC, pin_order ASC, created_at ASC, id ASC
LIMIT $2 OFFSET $3;

-- name: CountDirectRepliesByParent :many
-- CommentResource only ever renders replies_count (whenLoaded('replies')
-- ->count()), never the reply bodies themselves in the top-level list -
-- the client fetches actual reply content from GET /comments/{id}/replies
-- separately. So index() only needs counts here, not full rows.
SELECT parent_id, COUNT(*) AS cnt
FROM video_comments
WHERE parent_id = ANY(sqlc.arg(parent_ids)::bigint[])
  AND is_hidden = false AND is_spam = false AND held_for_review = false AND deleted_at IS NULL
GROUP BY parent_id;

-- name: GetCommentByID :one
SELECT id, video_id, user_id, parent_id, root_id, body, gif_url, gif_preview_url,
       gif_provider, gif_provider_id, comment_rank, likes_count, dislike_count,
       reply_count, reaction_score, is_pinned, pin_order, is_edited, edited_at, created_at
FROM video_comments WHERE id = $1 AND deleted_at IS NULL;

-- name: ListVisibleThreadReplies :many
-- Mirrors replies(): ALL replies sharing root_id, not just direct children
-- (so replies-to-replies are included) - the /comments/{id}/replies route.
SELECT id, video_id, user_id, parent_id, root_id, body, gif_url, gif_preview_url,
       gif_provider, gif_provider_id, comment_rank, likes_count, dislike_count,
       reply_count, reaction_score, is_pinned, pin_order, is_edited, edited_at, created_at
FROM video_comments
WHERE root_id = $1
  AND is_hidden = false AND is_spam = false AND held_for_review = false AND deleted_at IS NULL
ORDER BY created_at ASC, id ASC;

-- name: GetCommentUsers :many
SELECT id, username, name, avatar, is_verified FROM users WHERE id = ANY(sqlc.arg(user_ids)::bigint[]);

-- name: GetUserCommentReaction :one
SELECT reaction_type FROM comment_reactions WHERE comment_id = $1 AND user_id = $2;

-- name: GetUserReactionsForComments :many
-- Batch form of GetUserCommentReaction, for rendering a list of comments
-- without one reaction lookup per row.
SELECT comment_id, reaction_type FROM comment_reactions
WHERE user_id = $1 AND comment_id = ANY(sqlc.arg(comment_ids)::bigint[]);

-- name: GetVideoOwner :one
-- Unscoped (no status filter) video owner lookup - mirrors replies()'s
-- plain Video::find($id), unlike index()/store()'s published-only check.
SELECT user_id FROM videos WHERE id = $1;

-- ── like() / unlike() / react() ────────────────────────────────────────

-- name: GetCommentReactionForUpdate :one
SELECT id, reaction_type FROM comment_reactions WHERE comment_id = $1 AND user_id = $2 FOR UPDATE;

-- name: InsertCommentReaction :exec
INSERT INTO comment_reactions (comment_id, user_id, reaction_type, created_at, updated_at)
VALUES ($1, $2, $3, now(), now());

-- name: UpdateCommentReactionType :exec
UPDATE comment_reactions SET reaction_type = $3, updated_at = now()
WHERE comment_id = $1 AND user_id = $2;

-- name: DeleteCommentReactionByType :execrows
DELETE FROM comment_reactions WHERE comment_id = $1 AND user_id = $2 AND reaction_type = $3;

-- name: IncrementCommentLikes :exec
UPDATE video_comments SET likes_count = likes_count + 1 WHERE id = $1;

-- name: DecrementCommentLikes :exec
UPDATE video_comments SET likes_count = likes_count - 1 WHERE id = $1 AND likes_count > 0;

-- name: DecrementCommentDislikes :exec
UPDATE video_comments SET dislike_count = dislike_count - 1 WHERE id = $1 AND dislike_count > 0;

-- name: GetCommentForReactionScore :one
SELECT likes_count, dislike_count, reply_count, created_at FROM video_comments WHERE id = $1;

-- name: SetCommentReactionScore :exec
UPDATE video_comments SET reaction_score = $2, updated_at = now() WHERE id = $1;

-- ── destroy() ─────────────────────────────────────────────────────────

-- name: GetCommentWithVideoOwnerForDelete :one
SELECT vc.id, vc.user_id, vc.parent_id, vc.root_id, v.user_id AS video_owner_id
FROM video_comments vc
JOIN videos v ON v.id = vc.video_id
WHERE vc.id = $1 AND vc.video_id = $2 AND vc.deleted_at IS NULL;

-- name: GetCommentWithVideoOwnerForDeleteByID :one
SELECT vc.id, vc.user_id, vc.parent_id, vc.root_id, vc.video_id, v.user_id AS video_owner_id
FROM video_comments vc
JOIN videos v ON v.id = vc.video_id
WHERE vc.id = $1 AND vc.deleted_at IS NULL;

-- name: IsAdminUser :one
SELECT role = 'admin' FROM users WHERE id = $1;

-- name: GetChildCommentIDs :many
SELECT id FROM video_comments WHERE parent_id = ANY(sqlc.arg(parent_ids)::bigint[]) AND deleted_at IS NULL;

-- name: SoftDeleteComments :exec
UPDATE video_comments SET deleted_at = now(), updated_at = now()
WHERE id = ANY(sqlc.arg(ids)::bigint[]);

-- name: SyncRootReplyCount :exec
UPDATE video_comments AS root SET reply_count = (
    SELECT COUNT(*) FROM video_comments r
    WHERE r.root_id = root.id
      AND r.is_hidden = false AND r.is_spam = false AND r.held_for_review = false AND r.deleted_at IS NULL
) WHERE root.id = $1;

-- name: SyncVideoCommentsCount :one
UPDATE videos SET comments_count = (
    SELECT COUNT(*) FROM video_comments vc
    WHERE vc.video_id = $1 AND vc.is_hidden = false AND vc.is_spam = false AND vc.held_for_review = false
      AND vc.deleted_at IS NULL
      AND (
        vc.parent_id IS NULL
        OR EXISTS (
            SELECT 1 FROM video_comments vc_root
            WHERE vc_root.id = vc.root_id
              AND vc_root.is_hidden = false AND vc_root.is_spam = false AND vc_root.held_for_review = false
              AND vc_root.deleted_at IS NULL
        )
      )
), updated_at = now()
WHERE id = $1
RETURNING comments_count;

/* ── store(): create a comment ──────────────────────────────────────────── */

-- name: GetCommentingRestriction :one
-- UserModerationSetting::forUser()->disable_commenting_on_others. forUser()
-- creates a default row when absent, so ErrNoRows means "not restricted".
SELECT disable_commenting_on_others FROM user_moderation_settings WHERE user_id = $1;

-- name: IsCommentRestricted :one
-- CommentRestrictedUser::isRestricted - the creator has muted this user on
-- their own content specifically.
SELECT EXISTS (
    SELECT 1 FROM comment_restricted_users WHERE creator_id = $1 AND user_id = $2
);

-- name: ListHiddenWords :many
-- The creator's blocklist. Matching happens in Go, not SQL: Laravel's rule is a
-- unicode-aware word-boundary regex, and Postgres has no portable equivalent
-- that behaves identically across collations.
SELECT word FROM user_hidden_words WHERE user_id = $1 AND word <> '';

-- name: GetParentCommentForVideo :one
-- store()'s parent lookup: any VISIBLE comment on this same video can be a
-- parent (unlimited nesting). deleted_at IS NULL is the SoftDeletes scope.
SELECT id, user_id, root_id
FROM video_comments
WHERE id = $1 AND video_id = $2 AND deleted_at IS NULL;

-- name: CountTopLevelCommentsForRank :one
-- The badge-rank rule counts EVERY non-deleted top-level comment, hidden or
-- held included - it is not the visible count. Only the first 3 earn a rank.
SELECT COUNT(*) FROM video_comments
WHERE video_id = $1 AND parent_id IS NULL AND deleted_at IS NULL;

-- name: InsertComment :one
INSERT INTO video_comments (
    video_id, user_id, parent_id, root_id, body,
    gif_url, gif_preview_url, gif_provider, gif_provider_id, image_path,
    comment_rank, is_hidden, held_for_review, created_at, updated_at
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13, now(), now())
RETURNING id, video_id, user_id, parent_id, root_id, body, gif_url,
          gif_preview_url, gif_provider, gif_provider_id, image_path,
          comment_rank, likes_count, dislike_count, reply_count,
          is_pinned, is_edited, created_at;

-- name: CountVisibleRootReplies :one
-- visibleRootReplyCount(): the reply tally the client syncs after posting.
SELECT COUNT(*) FROM video_comments
WHERE root_id = $1 AND deleted_at IS NULL AND is_hidden = false AND held_for_review = false;
