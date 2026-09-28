-- Account status + security reads. Mirrors App\Http\Controllers\Api\
-- AccountController's status/security/sessions GET endpoints - the Settings ->
-- Security screen. All auth-required, per-user.
--
-- NOT ported: restrictions() (UserAdminRestriction + UserModerationSetting),
-- socialAccounts() (social_accounts), authorizedApps() (oauth_grants + the
-- Laravel sso.clients config), and every write path - all stay in Laravel.

-- name: GetAccountStatus :one
-- status(): the flags that derive account_status + profile visibility.
SELECT is_banned, is_active, email_verified_at, is_private, phone
FROM users WHERE id = @user_id;

-- name: GetAccountSecurity :one
-- security(): contact + password/alert state for the security overview.
SELECT email, phone, email_verified_at, login_alerts, password_changed_at
FROM users WHERE id = @user_id;

-- name: CountUserTokens :one
-- security(): session_count - the user's live Sanctum tokens.
SELECT COUNT(*) FROM personal_access_tokens
WHERE tokenable_id = @user_id AND tokenable_type = 'App\Models\User';

-- name: ListUserSessions :many
-- sessions(): the 20 most recent Sanctum tokens; name holds the JSON device
-- meta the handler decodes (label/browser/platform/type/ip).
SELECT id, name, last_used_at, created_at
FROM personal_access_tokens
WHERE tokenable_id = @user_id AND tokenable_type = 'App\Models\User'
ORDER BY created_at DESC
LIMIT 20;
