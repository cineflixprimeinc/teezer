-- name: SelectRateLimit :one
SELECT id, identifier, identifier_type, action_type, attempt_count, window_start, blocked_until, block_level
FROM rate_limits WHERE identifier = $1 AND identifier_type = $2 AND action_type = $3;

-- name: SelectRateLimitForUpdate :one
SELECT id, identifier, identifier_type, action_type, attempt_count, window_start, blocked_until, block_level
FROM rate_limits WHERE identifier = $1 AND identifier_type = $2 AND action_type = $3
FOR UPDATE;

-- name: InsertRateLimit :one
INSERT INTO rate_limits (identifier, identifier_type, action_type, attempt_count, window_start, created_at, updated_at)
VALUES ($1, $2, $3, 0, now(), now(), now())
RETURNING id, identifier, identifier_type, action_type, attempt_count, window_start, blocked_until, block_level;

-- name: UpdateRateLimit :exec
UPDATE rate_limits
SET attempt_count = $2, window_start = $3, block_level = $4, blocked_until = $5, updated_at = now()
WHERE id = $1;

-- name: ResetRateLimit :exec
UPDATE rate_limits
SET attempt_count = 0, blocked_until = NULL, window_start = now(), updated_at = now()
WHERE identifier = $1 AND identifier_type = $2 AND action_type = $3;

-- name: ExistsRateLimitWithFailures :one
SELECT EXISTS(
    SELECT 1 FROM rate_limits
    WHERE action_type = 'wrong_password' AND identifier_type = 'account' AND identifier = $1
      AND (attempt_count > 0 OR block_level > 0)
);
