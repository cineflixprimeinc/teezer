-- name: ListNotifications :many
-- One aggregated group per row, newest activity first (mirrors
-- AppNotification::with('actor')->orderByDesc('latest_activity_at')
-- ->orderByDesc('id')). LEFT JOIN users provides the eager-loaded `actor`.
SELECT n.id, n.type, n.message, n.entity_type, n.entity_id, n.comment_id,
       n.is_read, n.action_status, n.actor_count, n.actor_id,
       n.created_at, n.updated_at, n.latest_activity_at,
       ua.username AS actor_username, ua.name AS actor_name,
       ua.avatar AS actor_avatar, ua.is_verified AS actor_is_verified
FROM notifications n
LEFT JOIN users ua ON ua.id = n.actor_id
WHERE n.user_id = $1
ORDER BY n.latest_activity_at DESC, n.id DESC
LIMIT $2 OFFSET $3;

-- name: CountNotifications :one
SELECT count(*) FROM notifications WHERE user_id = $1;

-- name: CountUnreadNotifications :one
-- One unread group == one card the user sees, so unread rows == unread count.
SELECT count(*) FROM notifications WHERE user_id = $1 AND is_read = false;

-- name: GetVideoThumbnails :many
-- Batch-load reel thumbnails for the page's video-entity notifications (no N+1).
SELECT id, thumbnail_url FROM videos WHERE id = ANY($1::bigint[]);

-- name: ListRecentNotificationActors :many
-- Latest 3 actors PER notification in one windowed pass (bounded even when a
-- post has thousands of likers), newest first - powers the aggregated sentence
-- and avatar stack. Mirrors NotificationController::attachRecentActors().
SELECT t.notification_id, u.id AS actor_id, u.name, u.username, u.avatar, u.is_verified
FROM (
    SELECT na.notification_id, na.actor_id,
           ROW_NUMBER() OVER (PARTITION BY na.notification_id ORDER BY na.id DESC) AS rn
    FROM notification_actors na
    WHERE na.notification_id = ANY($1::bigint[])
) t
JOIN users u ON u.id = t.actor_id
WHERE t.rn <= 3
ORDER BY t.notification_id, t.rn;

-- name: GetNotificationForUser :one
-- Ownership gate for the actors drawer so ids can't be probed cross-user.
SELECT id FROM notifications WHERE id = $1 AND user_id = $2;

-- name: ListNotificationActors :many
-- Full paginated actor list for one group, newest actor first.
SELECT u.id, u.username, u.name, u.avatar, u.is_verified
FROM notification_actors na
JOIN users u ON u.id = na.actor_id
WHERE na.notification_id = $1
ORDER BY na.id DESC
LIMIT $2 OFFSET $3;

-- name: CountNotificationActors :one
SELECT count(*) FROM notification_actors WHERE notification_id = $1;

-- name: MarkNotificationRead :execrows
-- Returns rows affected so a bad/foreign id surfaces as "nothing marked"
-- instead of a silent success the client reads as "it is read now".
UPDATE notifications SET is_read = true, updated_at = now()
WHERE id = $1 AND user_id = $2;

-- name: MarkNotificationsRead :execrows
-- Bulk mark-as-read for an explicit id set; returns rows affected (== `updated`).
UPDATE notifications SET is_read = true, updated_at = now()
WHERE id = ANY($1::bigint[]) AND user_id = $2;

-- name: MarkAllNotificationsRead :execrows
-- Unscoped mark-all (the historical behaviour; POST /notifications/read-all).
UPDATE notifications SET is_read = true, updated_at = now()
WHERE user_id = $1 AND is_read = false;

-- name: MarkAllNotificationsReadTypes :execrows
-- Scoped mark-all restricted to the given types - one inbox menu clears its
-- own badge without wiping the other menus' unread state.
UPDATE notifications SET is_read = true, updated_at = now()
WHERE user_id = $1 AND is_read = false AND type = ANY($2::text[]);

-- name: MarkAllNotificationsReadExcludeTypes :execrows
-- Scoped mark-all excluding the given types - Activity is the complement of
-- System+Gifts+profile_view, which is an open-ended set no client can enumerate.
UPDATE notifications SET is_read = true, updated_at = now()
WHERE user_id = $1 AND is_read = false AND NOT (type = ANY($2::text[]));

-- name: CountUnreadNotificationsExcluding :one
-- Unread count for surfaces that hide certain types entirely (mobile hides
-- profile_view), so their badge cannot carry a number they can never clear.
SELECT count(*) FROM notifications
WHERE user_id = $1 AND is_read = false AND NOT (type = ANY($2::text[]));

-- name: GetVideoIdsForComments :many
-- Batch-resolve comment id -> video id for comment-anchored notifications, the
-- Go twin of NotificationController::attachCommentVideoIds. Feeds the
-- resolved-video last-resort branch of deepLinkFor.
SELECT id AS comment_id, video_id FROM video_comments WHERE id = ANY($1::bigint[]);

-- name: DeleteNotification :exec
-- notification_actors cascades on the real DB (FK cascadeOnDelete), clearing
-- the actor history too.
DELETE FROM notifications WHERE id = $1 AND user_id = $2;
