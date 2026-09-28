-- name: GetTokenWithUser :one
-- Mirrors Laravel\Sanctum\PersonalAccessToken::findToken() followed by
-- the tokenable (User) load. tokenable_type is always the User model here -
-- this app never issues personal access tokens to any other model.
SELECT
    pat.id,
    pat.token,
    pat.expires_at,
    u.id AS user_id,
    u.is_banned,
    u.is_active
FROM personal_access_tokens pat
JOIN users u ON u.id = pat.tokenable_id
WHERE pat.id = $1
  AND pat.tokenable_type = 'App\Models\User';
