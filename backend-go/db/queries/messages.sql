-- DM read surface: MessageController::conversations / requests / unreadCount.
-- The write side (send/edit/pin/forward/mark-read) and history stay in Laravel:
-- they fan out over Centrifugo via RealtimeBus, the deferred realtime dep.

-- name: ListConversations :many
-- The conversation list: one row per person you have DMed, carrying their last
-- message, unread count and online-status inputs. Raw-SQL port of the Laravel
-- query, parameter-for-parameter ($1 is always the caller). Requests
-- (status = 'pending_request') are excluded; only approved or record-less
-- pairs show. Over-fetch by one is done in the handler via LIMIT/OFFSET args.
SELECT
    u.id            AS user_id,
    u.username,
    u.name,
    u.avatar,
    u.is_verified,
    u.last_active_at,
    u.activity_status,
    (EXISTS(SELECT 1 FROM followers f1 WHERE f1.follower_id = $1 AND f1.following_id = u.id AND f1.status = 'accepted')
     AND EXISTS(SELECT 1 FROM followers f2 WHERE f2.follower_id = u.id AND f2.following_id = $1 AND f2.status = 'accepted')) AS is_mutual,
    lm.body         AS last_message,
    lm.created_at   AS last_ts,
    lm.sender_id    AS last_sender_id,
    lm.read_at      AS last_read_at,
    lm.delivered_at AS last_delivered_at,
    COALESCE(uc.cnt, 0)::bigint AS unread_count
FROM (
    SELECT LEAST(sender_id, receiver_id) AS u1, GREATEST(sender_id, receiver_id) AS u2
    FROM direct_messages
    WHERE sender_id = $1 OR receiver_id = $1
    GROUP BY u1, u2
) pairs
LEFT JOIN conversations c ON c.user_a_id = pairs.u1 AND c.user_b_id = pairs.u2
JOIN (
    SELECT m.*
    FROM direct_messages m
    INNER JOIN (
        SELECT LEAST(sender_id, receiver_id) AS u1, GREATEST(sender_id, receiver_id) AS u2,
               MAX(id) AS max_id
        FROM direct_messages
        WHERE sender_id = $1 OR receiver_id = $1
        GROUP BY u1, u2
    ) latest ON m.id = latest.max_id
) lm ON LEAST(lm.sender_id, lm.receiver_id) = pairs.u1
    AND GREATEST(lm.sender_id, lm.receiver_id) = pairs.u2
JOIN users u ON u.id = CASE WHEN pairs.u1 = $1 THEN pairs.u2 ELSE pairs.u1 END
LEFT JOIN (
    SELECT sender_id, COUNT(*) AS cnt
    FROM direct_messages
    WHERE receiver_id = $1 AND read_at IS NULL
    GROUP BY sender_id
) uc ON uc.sender_id = u.id
WHERE (c.id IS NULL OR c.status = 'approved')
ORDER BY lm.created_at DESC
LIMIT $2 OFFSET $3;

-- name: GetUserActivityStatus :one
-- The caller's own activity_status, which decides whether they may see a
-- "friends"-only contact's online dot (conversations()).
SELECT activity_status FROM users WHERE id = $1;

-- name: CountUnreadMessages :one
-- unreadCount's first tally: unread messages in approved (non-request) threads.
SELECT COUNT(*)::bigint AS cnt
FROM direct_messages dm
LEFT JOIN conversations c ON c.user_a_id = LEAST(dm.sender_id, dm.receiver_id)
    AND c.user_b_id = GREATEST(dm.sender_id, dm.receiver_id)
WHERE dm.receiver_id = $1
  AND dm.read_at IS NULL
  AND (c.id IS NULL OR c.status = 'approved');

-- name: CountPendingRequests :one
-- unreadCount's second tally: pending message requests either side of me.
SELECT COUNT(*)::bigint AS cnt
FROM conversations
WHERE status = 'pending_request'
  AND (received_by = $1 OR initiated_by = $1);

-- name: ListIncomingRequests :many
-- requests(): pending requests sent TO me, newest last-message first.
SELECT
    u.id            AS user_id,
    u.username,
    u.name,
    u.avatar,
    u.is_verified,
    c.id            AS conversation_id,
    c.status,
    lm.body         AS last_message,
    lm.message_type AS last_message_type,
    lm.created_at   AS last_ts
FROM conversations c
JOIN users u ON u.id = c.initiated_by
LEFT JOIN (
    SELECT dm.conversation_id, dm.body, dm.message_type, dm.created_at
    FROM direct_messages dm
    INNER JOIN (
        SELECT conversation_id, MAX(id) AS max_id
        FROM direct_messages
        WHERE conversation_id IS NOT NULL
        GROUP BY conversation_id
    ) latest ON dm.id = latest.max_id
) lm ON lm.conversation_id = c.id
WHERE c.received_by = $1 AND c.status = 'pending_request'
ORDER BY lm.created_at DESC;

-- name: ListSentRequests :many
-- requests(): pending requests I initiated, same shape as incoming.
SELECT
    u.id            AS user_id,
    u.username,
    u.name,
    u.avatar,
    u.is_verified,
    c.id            AS conversation_id,
    c.status,
    lm.body         AS last_message,
    lm.message_type AS last_message_type,
    lm.created_at   AS last_ts
FROM conversations c
JOIN users u ON u.id = c.received_by
LEFT JOIN (
    SELECT dm.conversation_id, dm.body, dm.message_type, dm.created_at
    FROM direct_messages dm
    INNER JOIN (
        SELECT conversation_id, MAX(id) AS max_id
        FROM direct_messages
        WHERE conversation_id IS NOT NULL
        GROUP BY conversation_id
    ) latest ON dm.id = latest.max_id
) lm ON lm.conversation_id = c.id
WHERE c.initiated_by = $1 AND c.status = 'pending_request'
ORDER BY lm.created_at DESC;
