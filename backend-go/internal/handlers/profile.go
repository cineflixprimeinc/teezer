// Profile (self) mirrors App\Http\Controllers\Api\ProfileController. Ported in
// this chunk: show(), update(), checkUsername(), getPrivacySettings(),
// updatePrivacySettings(), updateSavedPrivacy().
//
// The JSON preference groups (notifications, content, accessibility, appearance,
// messages, wellbeing, ai, family + PIN) live in preferences.go.
//
// NOT ported yet (each needs a dependency this chunk deliberately avoids):
//   - updateAvatar()/removeAvatar() - StorageService (R2 upload/delete)
//   - profileViews()               - profile_views table + its Redis list cache
//   - social links and highlights   - next chunks
//   - the CleanUsername rule on update()/checkUsername() - TextModerationService
//     (a deferred cross-service dep, like the mention/moderation ports); the
//     charset + length + uniqueness checks ARE enforced.
//
// Laravel's mass-assignment updates only the keys PRESENT in the request, which
// no fixed sqlc UPDATE can express, so update()/updatePrivacy() build a
// parameterized UPDATE from a whitelisted column set (see applyUserUpdates).
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
	"reelsoo/backend-go/internal/storage"
)

type ProfileHandler struct {
	queries      *sqlc.Queries
	pool         *pgxpool.Pool
	mediaBaseURL string
	storage      *storage.Service // nil-safe: upload endpoints 503 when unconfigured
}

func NewProfileHandler(q *sqlc.Queries, pool *pgxpool.Pool, mediaBaseURL string, store *storage.Service) *ProfileHandler {
	return &ProfileHandler{queries: q, pool: pool, mediaBaseURL: mediaBaseURL, storage: store}
}

var usernameCharset = regexp.MustCompile(`^[a-zA-Z0-9_.]+$`)

/* ── GET /profile ───────────────────────────────────────────────────── */

func (h *ProfileHandler) Show(c *fiber.Ctx) error {
	ctx := c.Context()
	data, err := h.profileResource(ctx, auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

/* ── PUT /profile ───────────────────────────────────────────────────── */

func (h *ProfileHandler) Update(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "body", "The request body must be valid JSON.")
	}

	// Fields that live on users. Everything is optional; only what the client
	// sent is written (Laravel's $request->only() over a validated payload).
	set := map[string]any{}

	if v, ok := body["name"]; ok {
		s, err := jsonString(v)
		if err != nil || len(s) > 100 {
			return validationError(c, "name", "The name field must be a string of at most 100 characters.")
		}
		set["name"] = s
	}

	if v, ok := body["username"]; ok {
		username, err := jsonString(v)
		if err != nil || len(username) > 50 {
			return validationError(c, "username", "The username field must be a string of at most 50 characters.")
		}
		if !usernameCharset.MatchString(username) {
			return validationError(c, "username", "The username field format is invalid.")
		}
		taken, err := h.queries.IsUsernameTakenByOther(ctx, sqlc.IsUsernameTakenByOtherParams{Username: username, ID: userID})
		if err != nil {
			return serverError(c)
		}
		if taken {
			return validationError(c, "username", "The username has already been taken.")
		}
		set["username"] = username
	}

	// Nullable strings: an explicit null clears the column.
	for field, max := range map[string]int{"bio": 500, "location": 255, "country": 100} {
		v, ok := body[field]
		if !ok {
			continue
		}
		s, isNull, err := jsonNullableString(v)
		if err != nil || len(s) > max {
			return validationError(c, field, fmt.Sprintf("The %s field must be a string of at most %d characters.", field, max))
		}
		set[field] = nullableStringValue(s, isNull)
	}

	// website: same, but a bare domain is promoted to https:// (Laravel's
	// filled() check means an empty string is stored as-is, not prefixed).
	if v, ok := body["website"]; ok {
		s, isNull, err := jsonNullableString(v)
		if err != nil || len(s) > 500 {
			return validationError(c, "website", "The website field must be a string of at most 500 characters.")
		}
		if !isNull {
			s = normalizeWebsite(s)
		}
		set["website"] = nullableStringValue(s, isNull)
	}

	if v, ok := body["date_of_birth"]; ok {
		s, isNull, err := jsonNullableString(v)
		if err != nil {
			return validationError(c, "date_of_birth", "The date of birth field must be a valid date.")
		}
		if isNull || s == "" {
			set["date_of_birth"] = nil
		} else {
			dob, err := time.Parse("2006-01-02", s)
			if err != nil || !dob.Before(time.Now().UTC().Truncate(24*time.Hour)) || !dob.After(time.Date(1900, 1, 1, 0, 0, 0, 0, time.UTC)) {
				return validationError(c, "date_of_birth", "The date of birth field must be a valid date before today and after 1900-01-01.")
			}
			set["date_of_birth"] = pgtype.Date{Time: dob, Valid: true}
		}
	}

	if v, ok := body["is_private"]; ok {
		b, isNull, err := jsonNullableBool(v)
		if err != nil {
			return validationError(c, "is_private", "The is private field must be true or false.")
		}
		if !isNull { // the column is NOT NULL; a null is a no-op, as in practice it is in Laravel
			set["is_private"] = b
		}
	}

	// Enum columns. All are NOT NULL, so a null is a no-op.
	enums := []struct {
		field   string
		allowed []string
	}{
		{"message_privacy", []string{"everyone", "friends", "followers", "no_one"}},
		{"gender", []string{"prefer_not_to_say", "male", "female", "non_binary", "other"}},
	}
	for _, e := range enums {
		v, ok := body[e.field]
		if !ok {
			continue
		}
		s, isNull, err := jsonNullableString(v)
		if err != nil {
			return validationError(c, e.field, fmt.Sprintf("The %s field is invalid.", strings.ReplaceAll(e.field, "_", " ")))
		}
		if isNull {
			if e.field == "gender" { // gender IS nullable
				set["gender"] = nil
			}
			continue
		}
		if !contains(e.allowed, s) {
			return validationError(c, e.field, fmt.Sprintf("The selected %s is invalid.", strings.ReplaceAll(e.field, "_", " ")))
		}
		set[e.field] = s
	}

	if v, ok := body["language"]; ok {
		s, isNull, err := jsonNullableString(v)
		if err != nil || len(s) > 8 {
			return validationError(c, "language", "The language field must be a string of at most 8 characters.")
		}
		if !isNull {
			set["language"] = s
		}
	}

	// interests / categories: string arrays stored as JSON.
	for field, spec := range map[string]struct{ maxItems, maxLen int }{
		"interests":  {50, 60},
		"categories": {3, 60},
	} {
		v, ok := body[field]
		if !ok {
			continue
		}
		items, isNull, err := jsonStringArray(v, spec.maxItems, spec.maxLen)
		if err != nil {
			return validationError(c, field, err.Error())
		}
		if isNull {
			set[field] = nil
			continue
		}
		encoded, err := json.Marshal(items)
		if err != nil {
			return serverError(c)
		}
		set[field] = encoded
	}

	if len(set) > 0 {
		if err := applyUserUpdates(ctx, h.pool, userID, set, userUpdatableColumns); err != nil {
			return serverError(c)
		}
	}

	// Mirror the profile-level fields (some legacy read paths still use them).
	if err := h.mirrorProfileFields(ctx, userID, body); err != nil {
		return serverError(c)
	}

	data, err := h.profileResource(ctx, userID)
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "message": "Profile updated.", "data": data})
}

// mirrorProfileFields is Profile::updateOrCreate(['user_id'=>…], only(location,
// website, category)) - an upsert that touches only the keys the client sent.
// The values were already validated by Update; website is re-normalized here so
// the mirror matches the users column.
func (h *ProfileHandler) mirrorProfileFields(ctx context.Context, userID int64, body map[string]json.RawMessage) error {
	set := map[string]any{}
	for _, field := range []string{"location", "website", "category"} {
		v, ok := body[field]
		if !ok {
			continue
		}
		s, isNull, err := jsonNullableString(v)
		if err != nil {
			continue // Update() already rejected anything malformed
		}
		if field == "website" && !isNull {
			s = normalizeWebsite(s)
		}
		set[field] = nullableStringValue(s, isNull)
	}
	if len(set) == 0 {
		return nil
	}

	cols := make([]string, 0, len(set))
	placeholders := make([]string, 0, len(set))
	assignments := make([]string, 0, len(set))
	args := []any{userID}
	for _, col := range []string{"location", "website", "category"} { // stable order
		v, ok := set[col]
		if !ok {
			continue
		}
		args = append(args, v)
		cols = append(cols, col)
		placeholders = append(placeholders, fmt.Sprintf("$%d", len(args)))
		assignments = append(assignments, fmt.Sprintf("%s = EXCLUDED.%s", col, col))
	}

	sql := fmt.Sprintf(
		`INSERT INTO profiles (user_id, %s, created_at, updated_at) VALUES ($1, %s, now(), now())
		 ON CONFLICT (user_id) DO UPDATE SET %s, updated_at = now()`,
		strings.Join(cols, ", "), strings.Join(placeholders, ", "), strings.Join(assignments, ", "),
	)
	_, err := h.pool.Exec(ctx, sql, args...)
	return err
}

/* ── POST /profile/check-username ───────────────────────────────────── */

// CheckUsername always answers 200 with {available, reason} - the "invalid"
// cases are answers, not validation failures (only a missing username is 422).
func (h *ProfileHandler) CheckUsername(c *fiber.Ctx) error {
	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "username", "The username field is required.")
	}
	raw, ok := body["username"]
	if !ok {
		return validationError(c, "username", "The username field is required.")
	}
	username, err := jsonString(raw)
	if err != nil || username == "" || len(username) > 50 {
		return validationError(c, "username", "The username field is required.")
	}
	username = strings.TrimSpace(username)

	unavailable := func(reason string) error {
		return c.JSON(fiber.Map{"success": true, "available": false, "reason": reason})
	}
	if !usernameCharset.MatchString(username) {
		return unavailable("Username can only contain letters, numbers, underscore, and dot.")
	}
	if len(username) < 3 {
		return unavailable("Username must be at least 3 characters.")
	}

	taken, err := h.queries.IsUsernameTakenByOther(c.Context(), sqlc.IsUsernameTakenByOtherParams{
		Username: username, ID: auth.UserID(c),
	})
	if err != nil {
		return serverError(c)
	}
	if taken {
		return unavailable("Username already taken.")
	}
	return c.JSON(fiber.Map{"success": true, "available": true, "reason": nil})
}

/* ── GET /profile/privacy ───────────────────────────────────────────── */

func (h *ProfileHandler) GetPrivacy(c *fiber.Ctx) error {
	row, err := h.queries.GetPrivacySettings(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": privacyResource(row)})
}

/* ── PATCH /profile/privacy ─────────────────────────────────────────── */

func (h *ProfileHandler) UpdatePrivacy(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "body", "The request body must be valid JSON.")
	}

	set := map[string]any{}
	for _, f := range []string{"is_private", "active_status", "profile_discovery", "show_to_search_engines", "comment_filter", "profile_view_history"} {
		v, ok := body[f]
		if !ok {
			continue
		}
		b, isNull, err := jsonNullableBool(v)
		if err != nil || isNull {
			return validationError(c, f, fmt.Sprintf("The %s field must be true or false.", strings.ReplaceAll(f, "_", " ")))
		}
		set[f] = b
	}
	privacyEnums := map[string][]string{
		"message_privacy":      {"everyone", "friends", "followers", "no_one"},
		"who_can_comment":      {"everyone", "followers", "no_one"},
		"who_can_tag":          {"everyone", "friends", "followers", "no_one"},
		"who_can_duet":         {"everyone", "friends", "no_one"},
		"who_can_download":     {"everyone", "friends", "no_one"},
		"who_can_see_liked":    {"everyone", "only_me"},
		"profile_view_privacy": {"everyone", "followers", "private"},
		"activity_status":      {"public", "friends", "no_one"},
	}
	for f, allowed := range privacyEnums {
		v, ok := body[f]
		if !ok {
			continue
		}
		s, isNull, err := jsonNullableString(v)
		if err != nil || isNull || !contains(allowed, s) {
			return validationError(c, f, fmt.Sprintf("The selected %s is invalid.", strings.ReplaceAll(f, "_", " ")))
		}
		set[f] = s
	}

	// Keep each legacy boolean and its 3-way enum in sync, whichever side sent.
	if v, ok := set["activity_status"]; ok {
		set["active_status"] = v.(string) != "no_one"
	} else if v, ok := set["active_status"]; ok {
		if v.(bool) {
			set["activity_status"] = "public"
		} else {
			set["activity_status"] = "no_one"
		}
	}
	if v, ok := set["profile_view_privacy"]; ok {
		set["profile_view_history"] = v.(string) != "private"
	} else if v, ok := set["profile_view_history"]; ok {
		if v.(bool) {
			set["profile_view_privacy"] = "everyone"
		} else {
			set["profile_view_privacy"] = "private"
		}
	}

	if len(set) > 0 {
		if err := applyUserUpdates(ctx, h.pool, userID, set, privacyUpdatableColumns); err != nil {
			return serverError(c)
		}
	}

	row, err := h.queries.GetPrivacySettings(ctx, userID) // $user->fresh()
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "message": "Privacy settings updated.", "data": privacyResource(row)})
}

/* ── PATCH /profile/saved-privacy ───────────────────────────────────── */

func (h *ProfileHandler) UpdateSavedPrivacy(c *fiber.Ctx) error {
	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "saved_privacy", "The saved privacy field is required.")
	}
	raw, ok := body["saved_privacy"]
	if !ok {
		return validationError(c, "saved_privacy", "The saved privacy field is required.")
	}
	value, err := jsonString(raw)
	if err != nil || !contains([]string{"private", "followers", "public"}, value) {
		return validationError(c, "saved_privacy", "The selected saved privacy is invalid.")
	}

	if err := h.queries.UpdateSavedPrivacy(c.Context(), sqlc.UpdateSavedPrivacyParams{
		ID: auth.UserID(c), SavedPrivacy: value,
	}); err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "message": "Saved privacy updated."})
}

/* ── resources ──────────────────────────────────────────────────────── */

// profileResource mirrors ProfileController::profileResource - the owner's own
// (unfiltered) view, so no privacy gate and no follow/block flags.
func (h *ProfileHandler) profileResource(ctx context.Context, userID int64) (fiber.Map, error) {
	u, err := h.queries.GetProfileForOwner(ctx, userID)
	if err != nil {
		return nil, err
	}
	links, err := h.queries.GetUserSocialLinks(ctx, userID)
	if err != nil {
		return nil, err
	}
	highlights, err := h.queries.ListHighlights(ctx, userID)
	if err != nil {
		return nil, err
	}

	socialLinks := make([]fiber.Map, 0, len(links))
	for _, l := range links {
		socialLinks = append(socialLinks, fiber.Map{"platform": l.Platform, "url": l.Url})
	}

	// profileResource returns `'highlights' => $user->highlights` - the raw
	// models - so these dates use Eloquent's format, not toIso8601's. The
	// distinction had never shown up: the highlights table is empty, so this
	// array has only ever been [].
	rendered := make([]fiber.Map, 0, len(highlights))
	for _, hl := range highlights {
		rendered = append(rendered, renderHighlight(hl))
	}

	var profile any
	if u.HasProfile {
		profile = fiber.Map{
			"location":        nullableText(u.ProfileLocation),
			"website":         nullableText(u.ProfileWebsite),
			"category":        nullableText(u.ProfileCategory),
			"total_followers": u.TotalFollowers,
			"total_following": u.TotalFollowing,
			"total_likes":     u.TotalLikes,
			"total_videos":    u.TotalVideos,
			"profile_views":   u.ProfileViews,
			"creator_badge":   nullableText(u.CreatorBadge),
		}
	}

	var creatorProgress any
	if u.HasCreatorProgress {
		creatorProgress = fiber.Map{
			"xp":    u.CreatorXp,
			"level": nullableText(u.CreatorLevelName),
		}
	}

	var avatar any
	if u.Avatar.Valid {
		avatar = mediaJoin(h.mediaBaseURL, u.Avatar.String)
	}

	var dob any
	if u.DateOfBirth.Valid {
		dob = u.DateOfBirth.Time.Format("2006-01-02")
	}

	return fiber.Map{
		"id":                     u.ID,
		"name":                   u.Name,
		"username":               u.Username,
		"email":                  u.Email,
		"phone":                  nullableText(u.Phone),
		"role":                   u.Role,
		"permissions":            rolePermissions(u.Role),
		"avatar":                 avatar,
		"bio":                    nullableText(u.Bio),
		"website":                nullableText(u.Website),
		"location":               nullableText(u.Location),
		"gender":                 nullableText(u.Gender),
		"language":               u.Language,
		"interests":              decodeJSONArray(u.Interests),
		"categories":             decodeJSONArray(u.Categories),
		"country":                nullableText(u.Country),
		"date_of_birth":          dob,
		"is_verified":            u.IsVerified,
		"is_private":             u.IsPrivate,
		"message_privacy":        u.MessagePrivacy,
		"active_status":          u.ActiveStatus,
		"profile_discovery":      u.ProfileDiscovery,
		"show_to_search_engines": u.ShowToSearchEngines,
		"comment_filter":         u.CommentFilter,
		"who_can_comment":        u.WhoCanComment,
		"who_can_tag":            u.WhoCanTag,
		"who_can_duet":           u.WhoCanDuet,
		"who_can_download":       u.WhoCanDownload,
		"who_can_see_liked":      u.WhoCanSeeLiked,
		"email_verified_at":      toIso8601(u.EmailVerifiedAt),
		"profile":                profile,
		"social_links":           socialLinks,
		"highlights":             rendered,
		"creator_progress":       creatorProgress,
		"created_at":             toIso8601(u.CreatedAt),
	}, nil
}

func privacyResource(u sqlc.GetPrivacySettingsRow) fiber.Map {
	return fiber.Map{
		"is_private":             u.IsPrivate,
		"active_status":          u.ActiveStatus,
		"profile_discovery":      u.ProfileDiscovery,
		"show_to_search_engines": u.ShowToSearchEngines,
		"comment_filter":         u.CommentFilter,
		"message_privacy":        u.MessagePrivacy,
		"who_can_comment":        u.WhoCanComment,
		"who_can_tag":            u.WhoCanTag,
		"who_can_duet":           u.WhoCanDuet,
		"who_can_download":       u.WhoCanDownload,
		"who_can_see_liked":      u.WhoCanSeeLiked,
		"profile_view_history":   u.ProfileViewHistory,
		"profile_view_privacy":   effectiveViewPrivacy(u.ProfileViewPrivacy, u.ProfileViewHistory),
		"activity_status":        u.ActivityStatus,
	}
}

// effectiveViewPrivacy is ProfileController::viewPrivacy - the 3-way enum wins,
// falling back to the legacy boolean when it holds anything unexpected.
func effectiveViewPrivacy(privacy string, history bool) string {
	if contains([]string{"everyone", "followers", "private"}, privacy) {
		return privacy
	}
	if history {
		return "everyone"
	}
	return "private"
}

// rolePermissions is User::getPermissions().
func rolePermissions(role string) []string {
	switch role {
	case "admin":
		return []string{
			"manage_users", "manage_creators", "manage_videos",
			"manage_reports", "manage_verification", "manage_monetization",
			"manage_settings", "manage_roles", "manage_notifications",
			"manage_moderation", "manage_feed", "manage_playlists",
			"access_admin_panel", "access_creator_studio", "access_feed",
			"view_analytics", "view_audit_log", "access_api_developer",
		}
	case "creator":
		return []string{
			"access_creator_studio", "access_feed",
			"manage_own_content", "view_own_analytics",
			"request_verification", "view_monetization",
		}
	case "user":
		return []string{
			"access_feed", "manage_own_profile",
			"basic_uploads", "manage_own_content",
		}
	default:
		return []string{}
	}
}

/* ── partial-update plumbing ────────────────────────────────────────── */

// The only columns update()/updatePrivacy() may write - the Go stand-in for the
// User model's $fillable, and the allowlist that keeps applyUserUpdates from
// ever interpolating an attacker-supplied column name into SQL.
var userUpdatableColumns = map[string]struct{}{
	"name": {}, "username": {}, "bio": {}, "country": {}, "date_of_birth": {},
	"is_private": {}, "gender": {}, "language": {}, "interests": {},
	"categories": {}, "website": {}, "location": {}, "message_privacy": {},
}

var privacyUpdatableColumns = map[string]struct{}{
	"is_private": {}, "message_privacy": {}, "active_status": {}, "profile_discovery": {},
	"show_to_search_engines": {}, "comment_filter": {}, "who_can_comment": {}, "who_can_tag": {},
	"who_can_duet": {}, "who_can_download": {}, "who_can_see_liked": {}, "profile_view_history": {},
	"profile_view_privacy": {}, "activity_status": {},
}

// buildAssignments turns a column->value set into "col = $1, …" plus the args
// to bind, refusing any column outside the allowlist. It is the one place a
// column name is ever interpolated into SQL, so the allowlist is the only thing
// standing between a request key and the statement - values are always bound.
func buildAssignments(set map[string]any, allowed map[string]struct{}) ([]string, []any, error) {
	assignments := make([]string, 0, len(set)+1)
	args := make([]any, 0, len(set)+1)
	for col, val := range set {
		if _, ok := allowed[col]; !ok {
			return nil, nil, fmt.Errorf("column %q is not updatable", col)
		}
		args = append(args, val)
		assignments = append(assignments, fmt.Sprintf("%s = $%d", col, len(args)))
	}
	return assignments, args, nil
}

// applyUserUpdates writes exactly the columns present in set (Eloquent's
// update-only-what-changed semantics).
func applyUserUpdates(ctx context.Context, pool *pgxpool.Pool, userID int64, set map[string]any, allowed map[string]struct{}) error {
	assignments, args, err := buildAssignments(set, allowed)
	if err != nil {
		return err
	}
	if len(assignments) == 0 {
		return nil
	}
	assignments = append(assignments, "updated_at = now()")
	args = append(args, userID)

	sql := fmt.Sprintf("UPDATE users SET %s WHERE id = $%d", strings.Join(assignments, ", "), len(args))
	_, err = pool.Exec(ctx, sql, args...)
	return err
}

/* ── request-body helpers ───────────────────────────────────────────── */

// parseJSONBody keeps each field RAW so a handler can tell "absent" from
// "explicitly null" - the distinction Laravel gets from $request->has() and
// mass assignment, and the reason these endpoints don't use BodyParser.
func parseJSONBody(c *fiber.Ctx) (map[string]json.RawMessage, error) {
	body := c.Body()
	if len(body) == 0 {
		return map[string]json.RawMessage{}, nil
	}
	var parsed map[string]json.RawMessage
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, err
	}
	return parsed, nil
}

func jsonString(raw json.RawMessage) (string, error) {
	var s string
	if err := json.Unmarshal(raw, &s); err != nil {
		return "", err
	}
	return s, nil
}

func jsonNullableString(raw json.RawMessage) (value string, isNull bool, err error) {
	if isJSONNull(raw) {
		return "", true, nil
	}
	s, err := jsonString(raw)
	return s, false, err
}

func jsonNullableBool(raw json.RawMessage) (value bool, isNull bool, err error) {
	if isJSONNull(raw) {
		return false, true, nil
	}
	var b bool
	if err := json.Unmarshal(raw, &b); err == nil {
		return b, false, nil
	}
	// Laravel's 'boolean' rule also accepts "1"/"0"/1/0/"true"/"false".
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		switch s {
		case "1", "true":
			return true, false, nil
		case "0", "false":
			return false, false, nil
		}
		return false, false, errors.New("not a boolean")
	}
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil && (n == 0 || n == 1) {
		return n == 1, false, nil
	}
	return false, false, errors.New("not a boolean")
}

func jsonStringArray(raw json.RawMessage, maxItems, maxLen int) (items []string, isNull bool, err error) {
	if isJSONNull(raw) {
		return nil, true, nil
	}
	if err := json.Unmarshal(raw, &items); err != nil {
		return nil, false, errors.New("The field must be an array of strings.")
	}
	if len(items) > maxItems {
		return nil, false, fmt.Errorf("The field must not have more than %d items.", maxItems)
	}
	for _, it := range items {
		if len(it) > maxLen {
			return nil, false, fmt.Errorf("Each item must be at most %d characters.", maxLen)
		}
	}
	return items, false, nil
}

func isJSONNull(raw json.RawMessage) bool {
	return strings.TrimSpace(string(raw)) == "null"
}

// nullableStringValue turns (value, isNull) into the arg a nullable text column
// wants: a Go nil for NULL, the string otherwise.
func nullableStringValue(s string, isNull bool) any {
	if isNull {
		return nil
	}
	return s
}

// decodeJSONArray renders a JSON array column as `[]` when NULL/invalid, which
// is what `$user->interests ?? []` does.
func decodeJSONArray(raw []byte) []any {
	out := []any{}
	if len(raw) == 0 {
		return out
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return []any{}
	}
	return out
}

// normalizeWebsite promotes a bare domain to https:// (ProfileController's
// filled('website') branch). An empty string is left alone.
func normalizeWebsite(website string) string {
	website = strings.TrimSpace(website)
	if website == "" {
		return website
	}
	lower := strings.ToLower(website)
	if strings.HasPrefix(lower, "http://") || strings.HasPrefix(lower, "https://") {
		return website
	}
	return "https://" + strings.TrimLeft(website, "/")
}

func contains(allowed []string, value string) bool {
	for _, a := range allowed {
		if a == value {
			return true
		}
	}
	return false
}
