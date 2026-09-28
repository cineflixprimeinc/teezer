-- name: GetProfileForOwner :one
-- The signed-in user's own profile: users row + the profiles mirror + creator
-- progress, i.e. ProfileController::show's load('profile','creatorProgress.level').
-- socialLinks/highlights load separately (GetUserSocialLinks / ListHighlights).
-- has_profile / has_creator_progress distinguish "relation missing" (=> null in
-- the payload) from "relation present but all-null columns".
SELECT u.id, u.name, u.username, u.email, u.phone, u.role, u.avatar, u.bio,
       u.website, u.location, u.gender, u.language, u.interests, u.categories,
       u.country, u.date_of_birth, u.is_verified, u.is_private, u.message_privacy,
       u.active_status, u.activity_status, u.profile_discovery,
       u.show_to_search_engines, u.comment_filter, u.who_can_comment, u.who_can_tag,
       u.who_can_duet, u.who_can_download, u.who_can_see_liked,
       u.profile_view_history, u.profile_view_privacy, u.saved_privacy,
       u.email_verified_at, u.created_at,
       (p.id IS NOT NULL)::bool AS has_profile,
       p.location AS profile_location,
       p.website  AS profile_website,
       p.category AS profile_category,
       COALESCE(p.total_followers, 0)::int    AS total_followers,
       COALESCE(p.total_following, 0)::int    AS total_following,
       COALESCE(p.total_likes, 0)::bigint     AS total_likes,
       COALESCE(p.total_videos, 0)::int       AS total_videos,
       COALESCE(p.profile_views, 0)::bigint   AS profile_views,
       p.creator_badge,
       (cp.id IS NOT NULL)::bool AS has_creator_progress,
       COALESCE(cp.current_xp, 0)::int AS creator_xp,
       cl.level_name AS creator_level_name
FROM users u
LEFT JOIN profiles p ON p.user_id = u.id
LEFT JOIN creator_progress cp ON cp.user_id = u.id
LEFT JOIN creator_levels cl ON cl.id = cp.current_level_id
WHERE u.id = $1;

-- name: GetPrivacySettings :one
-- The privacyResource() column set, for GET /profile/privacy and for re-reading
-- the row after a PATCH (Laravel returns $user->fresh()).
SELECT is_private, active_status, activity_status, profile_discovery,
       show_to_search_engines, comment_filter, message_privacy, who_can_comment,
       who_can_tag, who_can_duet, who_can_download, who_can_see_liked,
       profile_view_history, profile_view_privacy
FROM users WHERE id = $1;

-- name: IsUsernameTakenByOther :one
-- unique:users,username,{id} - the check behind both PUT /profile and
-- POST /profile/check-username.
SELECT EXISTS (SELECT 1 FROM users WHERE username = $1 AND id != $2);

-- name: ListHighlights :many
SELECT id, user_id, title, cover_url, sort_order, created_at, updated_at
FROM highlights WHERE user_id = $1 ORDER BY sort_order;

-- name: ListSocialLinks :many
-- The whole model, for GET/PUT /profile/social-links, which return the raw
-- Eloquent rows. GetUserSocialLinks stays platform+url-only: it feeds the
-- profile/user resources, which map the relation down to those two keys.
-- $user->socialLinks has no orderBy, so Postgres decides; id order is what the
-- unordered scan yields for these (delete-then-reinsert keeps id and physical
-- order aligned), and it is at least deterministic.
SELECT id, user_id, platform, url, sort_order, created_at, updated_at
FROM social_links WHERE user_id = $1 ORDER BY id;

-- name: DeleteSocialLinks :exec
DELETE FROM social_links WHERE user_id = $1;

-- name: InsertSocialLink :exec
-- Laravel's SocialLink::insert() stamps every row with the SAME now(), and
-- leaves sort_order to the column default, so neither is a parameter here.
INSERT INTO social_links (user_id, platform, url, created_at, updated_at)
VALUES ($1, $2, $3, $4, $4);

-- name: CountHighlights :one
SELECT count(*) FROM highlights WHERE user_id = $1;

-- name: CreateHighlight :one
INSERT INTO highlights (user_id, title, cover_url, sort_order, created_at, updated_at)
VALUES ($1, $2, $3, $4, now(), now())
RETURNING id, user_id, title, cover_url, sort_order, created_at, updated_at;

-- name: GetHighlightForOwner :one
-- Highlight::where('user_id', ...)->findOrFail($id): the owner scope is part of
-- the lookup, so another user's id is a 404 rather than a 403.
SELECT id, user_id, title, cover_url, sort_order, created_at, updated_at
FROM highlights WHERE id = $1 AND user_id = $2;

-- name: DeleteHighlight :exec
DELETE FROM highlights WHERE id = $1 AND user_id = $2;

-- name: UpdateSavedPrivacy :exec
UPDATE users SET saved_privacy = $2, updated_at = now() WHERE id = $1;

-- name: GetUserPreferenceGroups :one
-- Every JSON preference column in one PK lookup, plus the three columns the
-- content-preferences defaults fall back to (language / selected_ / detected_
-- country_code) and family_pin (for family's pin_set flag and the PIN checks).
-- Each endpoint reads only its own column; sharing one query keeps every
-- preference GET/PATCH at a single round trip.
SELECT notification_preferences, content_preferences, accessibility_preferences,
       appearance_preferences, messages_preferences, wellbeing_preferences,
       ai_preferences, family_preferences,
       language, selected_country_code, detected_country_code, family_pin
FROM users WHERE id = $1;

-- name: GetUserAvatar :one
-- The current avatar key, so updateAvatar can delete the object it replaces
-- (Laravel: if ($user->avatar) $this->storage->delete($user->avatar)).
SELECT avatar FROM users WHERE id = $1;

-- name: UpdateUserAvatar :exec
-- Set or clear the avatar key. A NULL clears it (removeAvatar).
UPDATE users SET avatar = $2, updated_at = now() WHERE id = $1;

-- name: UpdateFamilyPin :exec
-- ProfileController::setFamilyPin's forceFill(['family_pin' => Hash::make(...)])
-- ->save(). family_pin is outside $fillable in Laravel, hence forceFill; here it
-- is simply kept out of the applyUserUpdates allowlists.
UPDATE users SET family_pin = $2, updated_at = now() WHERE id = $1;
