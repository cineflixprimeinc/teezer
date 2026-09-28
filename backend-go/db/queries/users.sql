-- name: GetUserByEmail :one
SELECT id, name, username, email, password, avatar, phone, bio, country,
       date_of_birth, role, is_verified, is_private, is_active, is_banned,
       ban_reason, two_factor_secret, two_factor_confirmed_at, created_at
FROM users WHERE email = $1;

-- name: GetUserByUsername :one
SELECT id, name, username, email, password, avatar, phone, bio, country,
       date_of_birth, role, is_verified, is_private, is_active, is_banned,
       ban_reason, two_factor_secret, two_factor_confirmed_at, created_at
FROM users WHERE username = $1;

-- name: GetUserByID :one
SELECT id, name, username, email, password, avatar, phone, bio, country,
       date_of_birth, role, is_verified, is_private, is_active, is_banned,
       ban_reason, two_factor_secret, two_factor_confirmed_at, created_at
FROM users WHERE id = $1;

-- name: TouchLogin :exec
-- Mirrors issueLoginToken()'s updateQuietly({last_login_at, last_active_at}) -
-- deliberately does not bump updated_at, same as the Laravel "quietly" write.
UPDATE users SET last_login_at = now(), last_active_at = now() WHERE id = $1;

-- name: CreatePersonalAccessToken :one
INSERT INTO personal_access_tokens (tokenable_type, tokenable_id, name, token, abilities, expires_at, created_at, updated_at)
VALUES ('App\Models\User', $1, $2, $3, $4, $5, now(), now())
RETURNING id;

-- name: PruneOldTokens :exec
-- Mirrors issueLoginToken()'s "keep the 9 most-recent tokens" prune, run
-- before issuing the new one.
DELETE FROM personal_access_tokens pat
WHERE pat.tokenable_id = $1
  AND pat.tokenable_type = 'App\Models\User'
  AND pat.id NOT IN (
      SELECT keep.id FROM personal_access_tokens keep
      WHERE keep.tokenable_id = $1 AND keep.tokenable_type = 'App\Models\User'
      ORDER BY keep.created_at DESC
      LIMIT 9
  );
