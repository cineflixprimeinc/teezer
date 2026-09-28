// The JSON preference groups on App\Http\Controllers\Api\ProfileController:
// notifications, content-preferences, accessibility, appearance,
// messages-preferences, wellbeing, ai-preferences and family (+ the family PIN).
//
// All eight share one shape in Laravel: a private xxxDefaults($user) that starts
// from a literal defaults array and overlays the saved JSON column, and a
// PATCH that validates, array_merges the present non-null request keys over
// those defaults, and writes the whole merged array back to the column. That
// shape is expressed here once as prefGroup/prefField instead of eight
// near-identical handlers, so a field only ever states its default and its
// validation rule.
//
// NOT ported in this chunk:
//   - the throttle:10,1 middleware on the two family/pin routes. Laravel's
//     throttle middleware counts hits in its cache store, which is the same
//     cross-process Laravel-cache coupling deferred elsewhere in this port
//     (see feed.go's notInterested note); a Go-local counter would not share
//     state with the PHP one. Safe only while this service stays shadow -
//     this MUST be resolved before /profile/family/pin serves public traffic.
//   - JSON key order: Laravel writes (and returns) keys in defaults order,
//     encoding/json sorts them. Same keys, same values, different byte order.
package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

var (
	errNotInteger = errors.New("not an integer")
	errNotNumeric = errors.New("not numeric")
)

// bcryptCost mirrors config/hashing.php's env('BCRYPT_ROUNDS', 12); the Laravel
// .env does not set it, so 12 is what Hash::make() uses in production. Go emits
// $2a$ and PHP $2y$ - the two are interchangeable in both directions, which the
// login path in auth.go already relies on.
const bcryptCost = 12

var familyPinPattern = regexp.MustCompile(`^[0-9]{4,6}$`)

/* ── the spec ───────────────────────────────────────────────────────── */

type prefKind int

const (
	prefBool prefKind = iota
	prefString
	prefInt
	prefNumberEnum
)

type prefField struct {
	name string
	kind prefKind
	def  any // the literal from the Laravel defaults array

	allowed []string  // prefString: in:a,b,c
	maxLen  int       // prefString: max:N (0 = no max rule)
	minVal  int       // prefInt: min:N
	maxVal  int       // prefInt: max:N
	nums    []float64 // prefNumberEnum: in:0.5,1,...
}

type prefGroup struct {
	column string // the users column the merged array is written to
	fields []prefField
	saved  func(sqlc.GetUserPreferenceGroupsRow) []byte
	// dynamic supplies defaults computed from the user row rather than a
	// literal (content-preferences' preferred_language/preferred_country).
	dynamic func(sqlc.GetUserPreferenceGroupsRow) map[string]any
}

// defaultsFrom is the xxxDefaults($user) helper: the defaults array with every
// saved key that still exists in it overlaid. A saved value under a key whose
// default is a bool is cast to bool; anything else is taken as stored. Keys the
// current defaults no longer define are dropped, which is how Laravel's
// array_key_exists() gate retires a removed preference.
func (g prefGroup) defaultsFrom(row sqlc.GetUserPreferenceGroupsRow) map[string]any {
	out := make(map[string]any, len(g.fields))
	var dyn map[string]any
	if g.dynamic != nil {
		dyn = g.dynamic(row)
	}
	for _, f := range g.fields {
		if v, ok := dyn[f.name]; ok {
			out[f.name] = v
			continue
		}
		out[f.name] = f.def
	}

	var stored map[string]any
	if raw := g.saved(row); len(raw) > 0 {
		if err := json.Unmarshal(raw, &stored); err != nil {
			return out // a corrupt column reads as "nothing saved", as `?? []` does
		}
	}
	for _, f := range g.fields {
		v, ok := stored[f.name]
		if !ok {
			continue
		}
		if _, isBool := out[f.name].(bool); isBool {
			out[f.name] = phpBool(v)
		} else {
			out[f.name] = v
		}
	}
	return out
}

// prefError is a failure to report, carried as data rather than as an
// already-written response: the fiber helpers return the nil that c.JSON gives
// on success, so "I answered the request" cannot be signalled through an error
// value - a caller checking `err != nil` would sail straight past it.
type prefError struct {
	errors map[string][]string // validation failures (422)
	server bool                // internal failure (500)
}

// send writes the failure through the canonical helpers, so these responses
// cannot drift from every other handler's.
func (e *prefError) send(c *fiber.Ctx) error {
	if e.server {
		return serverError(c)
	}
	return validationErrors(c, e.errors)
}

var errPrefServer = &prefError{server: true}

func fieldFailure(field, message string) *prefError {
	return &prefError{errors: map[string][]string{field: {message}}}
}

// merge validates the request against the group's rules and overlays the keys
// it actually sent onto current. Every field is checked before returning, so a
// request with several bad fields reports them all, as $request->validate does.
//
// Only one message per field is reported, where Laravel reports one per failing
// rule; the two differ only when a single value trips more than one rule (e.g.
// an integer sent to a 'string|max:5' field fails both), which no client does.
func (g prefGroup) merge(body map[string]json.RawMessage, current map[string]any) (map[string]any, *prefError) {
	merged := make(map[string]any, len(current))
	for k, v := range current {
		merged[k] = v
	}

	failures := map[string][]string{}
	for _, f := range g.fields {
		raw, ok := body[f.name]
		if !ok {
			continue // 'sometimes'
		}
		value, err := f.validate(raw)
		if err != nil {
			failures[f.name] = []string{err.Error()}
			continue
		}
		merged[f.name] = value
	}
	if len(failures) > 0 {
		return nil, &prefError{errors: failures}
	}
	return merged, nil
}

// validate applies one field's rules and returns the value to store. Every rule
// here is 'sometimes' + a type rule, so an explicit null fails the type rule
// (Laravel's boolean/string/integer rules all reject null) rather than clearing
// the key - matching updatePrivacySettings in profile.go.
//
// The value returned is the request's own, decoded but NOT coerced: Laravel
// merges $request->only() - the raw input - over the defaults and stores that,
// so PATCH {"push_likes": 1} really does persist 1 rather than true, and echoes
// 1 back. The (bool) cast happens on the way out, in defaultsFrom.
func (f prefField) validate(raw json.RawMessage) (any, error) {
	label := strings.ReplaceAll(f.name, "_", " ")

	switch f.kind {
	case prefBool:
		if _, isNull, err := jsonNullableBool(raw); err != nil || isNull {
			return nil, fmt.Errorf("The %s field must be true or false.", label)
		}

	case prefString:
		s, isNull, err := jsonNullableString(raw)
		if err != nil || isNull {
			return nil, fmt.Errorf("The %s field must be a string.", label)
		}
		switch {
		case len(f.allowed) > 0:
			if !contains(f.allowed, s) {
				return nil, fmt.Errorf("The selected %s is invalid.", label)
			}
		case f.maxLen > 0 && len(s) > f.maxLen:
			return nil, fmt.Errorf("The %s field must not be greater than %d characters.", label, f.maxLen)
		}

	case prefInt:
		n, err := jsonInt(raw)
		if err != nil {
			return nil, fmt.Errorf("The %s field must be an integer.", label)
		}
		if n < f.minVal {
			return nil, fmt.Errorf("The %s field must be at least %d.", label, f.minVal)
		}
		if n > f.maxVal {
			return nil, fmt.Errorf("The %s field must not be greater than %d.", label, f.maxVal)
		}

	case prefNumberEnum:
		n, err := jsonFloat(raw)
		if err != nil {
			return nil, fmt.Errorf("The %s field must be a number.", label)
		}
		if !containsFloat(f.nums, n) {
			return nil, fmt.Errorf("The selected %s is invalid.", label)
		}

	default:
		return nil, fmt.Errorf("The %s field is invalid.", label)
	}

	var stored any
	if err := json.Unmarshal(raw, &stored); err != nil {
		return nil, fmt.Errorf("The %s field is invalid.", label)
	}
	return stored, nil
}

func containsFloat(allowed []float64, v float64) bool {
	for _, a := range allowed {
		if a == v {
			return true
		}
	}
	return false
}

/* ── the eight groups ───────────────────────────────────────────────── */

func boolPref(name string, def bool) prefField {
	return prefField{name: name, kind: prefBool, def: def}
}
func enumPref(name, def string, allowed ...string) prefField {
	return prefField{name: name, kind: prefString, def: def, allowed: allowed}
}
func stringPref(name, def string, maxLen int) prefField {
	return prefField{name: name, kind: prefString, def: def, maxLen: maxLen}
}
func intPref(name string, def, min, max int) prefField {
	return prefField{name: name, kind: prefInt, def: def, minVal: min, maxVal: max}
}

var notificationPrefs = prefGroup{
	column: "notification_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.NotificationPreferences },
	fields: []prefField{
		boolPref("push_likes", true), boolPref("push_comments", true),
		boolPref("push_followers", true), boolPref("push_mentions", true),
		boolPref("push_messages", true), boolPref("push_live", false),
		boolPref("push_following", true), boolPref("push_creator", false),
		boolPref("email_security", true), boolPref("email_account", true),
		boolPref("email_promo", false), boolPref("email_news", false),
		boolPref("sms_otp", true), boolPref("sms_security", true),
		boolPref("sms_updates", false),
	},
}

var contentPrefs = prefGroup{
	column: "content_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.ContentPreferences },
	dynamic: func(r sqlc.GetUserPreferenceGroupsRow) map[string]any {
		// $user->language ?? 'en' and
		// $user->selected_country_code ?? $user->detected_country_code ?? 'US'.
		language := r.Language
		if language == "" {
			language = "en"
		}
		country := "US"
		if r.SelectedCountryCode.Valid {
			country = r.SelectedCountryCode.String
		} else if r.DetectedCountryCode.Valid {
			country = r.DetectedCountryCode.String
		}
		return map[string]any{"preferred_language": language, "preferred_country": country}
	},
	fields: []prefField{
		stringPref("preferred_language", "en", 10),
		stringPref("preferred_country", "US", 3),
		boolPref("show_local_first", true),
		boolPref("show_trending", true),
		boolPref("sensitive_content_filter", true),
		boolPref("autoplay_videos", true),
		boolPref("data_saver_mode", false),
		// One-shot UI flags stored on the account so they sync across devices.
		// has_seen_spaces_onboarding gates the first-run Spaces welcome popup.
		boolPref("has_seen_spaces_onboarding", false),
		// Player preferences (mobile "More options" sheet)
		boolPref("auto_scroll", false),
		boolPref("loop_video", true),
		{name: "playback_speed", kind: prefNumberEnum, def: 1, nums: []float64{0.5, 0.75, 1, 1.25, 1.5, 2}},
		enumPref("default_quality", "auto", "auto", "360", "480", "720", "1080"),
		enumPref("theme", "light", "light", "dark", "system"),
	},
}

var accessibilityPrefs = prefGroup{
	column: "accessibility_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.AccessibilityPreferences },
	fields: []prefField{
		boolPref("larger_text", false), stringPref("text_size", "small", 30),
		boolPref("high_contrast", false), boolPref("reduce_transparency", false),
		boolPref("reduce_motion", false), boolPref("autoplay_videos", true),
		stringPref("pointer_size", "default", 30),
		boolPref("captions_always_on", false), stringPref("caption_style", "default", 30),
		boolPref("audio_descriptions", false),
		boolPref("keyboard_navigation", true), boolPref("screen_reader", false),
	},
}

var appearancePrefs = prefGroup{
	column: "appearance_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.AppearancePreferences },
	fields: []prefField{
		enumPref("theme", "system", "light", "dark", "system"),
		enumPref("app_icon", "default", "default", "midnight", "retro"),
		boolPref("bold_text", false),
		boolPref("in_app_browser", true),
	},
}

var messagesPrefs = prefGroup{
	column: "messages_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.MessagesPreferences },
	fields: []prefField{
		enumPref("who_can_message", "everyone", "everyone", "friends", "followers", "no_one"),
		enumPref("group_invites", "friends", "everyone", "friends", "no_one"),
		boolPref("message_requests", true),
		boolPref("read_receipts", true),
		boolPref("typing_indicators", true),
		boolPref("media_autodownload", true),
	},
}

var wellbeingPrefs = prefGroup{
	column: "wellbeing_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.WellbeingPreferences },
	fields: []prefField{
		intPref("daily_limit_minutes", 0, 0, 1440), // 0 = no limit
		boolPref("break_reminders", false),
		intPref("break_interval_minutes", 30, 5, 240),
		boolPref("bedtime_enabled", false),
		stringPref("bedtime_start", "22:00", 5),
		stringPref("bedtime_end", "07:00", 5),
		boolPref("restful_notifications", false),
	},
}

var aiPrefs = prefGroup{
	column: "ai_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.AiPreferences },
	fields: []prefField{
		boolPref("ai_recommendations", true),
		boolPref("ai_labels", true),
		boolPref("ai_captions", true),
		boolPref("ai_search", true),
		boolPref("ai_reply_suggestions", true),
		boolPref("personalized_ads", false),
		boolPref("data_for_training", false),
	},
}

var familyPrefs = prefGroup{
	column: "family_preferences",
	saved:  func(r sqlc.GetUserPreferenceGroupsRow) []byte { return r.FamilyPreferences },
	fields: []prefField{
		boolPref("child_mode_enabled", false),
		enumPref("child_age_group", "13_15", "under_7", "8_12", "13_15", "16_17"),
		intPref("daily_screen_time_minutes", 0, 0, 1440), // 0 = no limit
		boolPref("bedtime_enabled", false),
		stringPref("bedtime_start", "21:00", 5),
		stringPref("bedtime_end", "07:00", 5),
		boolPref("break_reminders", false),
		boolPref("safe_search", true),
		boolPref("sensitive_content_filter", true),
		boolPref("mature_content_filter", true),
		boolPref("hide_violence", false),
		boolPref("hide_adult_content", true),
		boolPref("educational_only", false),
	},
}

// preferenceUpdatableColumns is the allowlist for the eight JSON columns, kept
// separate from userUpdatableColumns so a preference PATCH can never reach a
// scalar profile column (and vice versa). family_pin is deliberately absent -
// it is written only by UpdateFamilyPin, mirroring its exclusion from $fillable.
var preferenceUpdatableColumns = map[string]struct{}{
	"notification_preferences": {}, "content_preferences": {},
	"accessibility_preferences": {}, "appearance_preferences": {},
	"messages_preferences": {}, "wellbeing_preferences": {},
	"ai_preferences": {}, "family_preferences": {},
}

/* ── generic GET / PATCH ────────────────────────────────────────────── */

func (h *ProfileHandler) getPrefGroup(c *fiber.Ctx, g prefGroup) error {
	row, err := h.queries.GetUserPreferenceGroups(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": g.defaultsFrom(row)})
}

// updatePrefGroup returns the merged group so the caller can decorate it
// (family adds pin_set to the response but not to the column).
func (h *ProfileHandler) updatePrefGroup(c *fiber.Ctx, g prefGroup) (map[string]any, sqlc.GetUserPreferenceGroupsRow, *prefError) {
	ctx := c.Context()
	userID := auth.UserID(c)

	body, err := parseJSONBody(c)
	if err != nil {
		return nil, sqlc.GetUserPreferenceGroupsRow{}, fieldFailure("body", "The request body must be valid JSON.")
	}
	row, err := h.queries.GetUserPreferenceGroups(ctx, userID)
	if err != nil {
		return nil, row, errPrefServer
	}

	merged, perr := g.merge(body, g.defaultsFrom(row))
	if perr != nil {
		return nil, row, perr
	}

	encoded, err := json.Marshal(merged)
	if err != nil {
		return nil, row, errPrefServer
	}
	// Laravel writes the merged array unconditionally, even when the request
	// changed nothing - the column is normalised to the full defaults set.
	if err := applyUserUpdates(ctx, h.pool, userID, map[string]any{g.column: encoded}, preferenceUpdatableColumns); err != nil {
		return nil, row, errPrefServer
	}
	return merged, row, nil
}

// prefGroupHandlers wires one group's GET and PATCH.
func (h *ProfileHandler) prefGroupHandlers(g prefGroup) (get, patch fiber.Handler) {
	return func(c *fiber.Ctx) error {
			return h.getPrefGroup(c, g)
		}, func(c *fiber.Ctx) error {
			merged, _, perr := h.updatePrefGroup(c, g)
			if perr != nil {
				return perr.send(c)
			}
			return c.JSON(fiber.Map{"success": true, "data": merged})
		}
}

func (h *ProfileHandler) NotificationPrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(notificationPrefs)
}
func (h *ProfileHandler) ContentPrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(contentPrefs)
}
func (h *ProfileHandler) AccessibilityPrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(accessibilityPrefs)
}
func (h *ProfileHandler) AppearancePrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(appearancePrefs)
}
func (h *ProfileHandler) MessagesPrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(messagesPrefs)
}
func (h *ProfileHandler) WellbeingPrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(wellbeingPrefs)
}
func (h *ProfileHandler) AiPrefs() (get, patch fiber.Handler) {
	return h.prefGroupHandlers(aiPrefs)
}

/* ── family (the same group plus the parent PIN) ────────────────────── */

// GET /profile/family
func (h *ProfileHandler) GetFamily(c *fiber.Ctx) error {
	row, err := h.queries.GetUserPreferenceGroups(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	data := familyPrefs.defaultsFrom(row)
	data["pin_set"] = hasFamilyPin(row.FamilyPin)
	return c.JSON(fiber.Map{"success": true, "data": data})
}

// PATCH /profile/family
func (h *ProfileHandler) UpdateFamily(c *fiber.Ctx) error {
	merged, row, perr := h.updatePrefGroup(c, familyPrefs)
	if perr != nil {
		return perr.send(c)
	}
	// pin_set rides along on the response only; this PATCH never touches the
	// PIN, so the value read before the write is still current.
	merged["pin_set"] = hasFamilyPin(row.FamilyPin)
	return c.JSON(fiber.Map{"success": true, "data": merged})
}

// POST /profile/family/pin - set or change the parent PIN.
func (h *ProfileHandler) SetFamilyPin(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "pin", "The pin field is required.")
	}
	raw, ok := body["pin"]
	if !ok || isJSONNull(raw) {
		return validationError(c, "pin", "The pin field is required.")
	}
	pin, err := jsonString(raw)
	if err != nil {
		return validationError(c, "pin", "The pin field must be a string.")
	}
	if pin == "" {
		return validationError(c, "pin", "The pin field is required.")
	}
	if !familyPinPattern.MatchString(pin) {
		return validationError(c, "pin", "The pin field format is invalid.")
	}

	// current_pin is 'nullable|string': absent or null is fine, a non-string is not.
	currentPin := ""
	if raw, ok := body["current_pin"]; ok && !isJSONNull(raw) {
		currentPin, err = jsonString(raw)
		if err != nil {
			return validationError(c, "current_pin", "The current pin field must be a string.")
		}
	}

	row, err := h.queries.GetUserPreferenceGroups(ctx, userID)
	if err != nil {
		return serverError(c)
	}

	// Changing an existing PIN requires the current one.
	if hasFamilyPin(row.FamilyPin) {
		if currentPin == "" || bcrypt.CompareHashAndPassword([]byte(row.FamilyPin.String), []byte(currentPin)) != nil {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"success": false, "message": "Current PIN is incorrect.",
			})
		}
	}

	hash, err := laravelBcrypt(pin, bcryptCost)
	if err != nil {
		return serverError(c)
	}
	if err := h.queries.UpdateFamilyPin(ctx, sqlc.UpdateFamilyPinParams{
		ID: userID, FamilyPin: pgtype.Text{String: hash, Valid: true},
	}); err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "message": "Parent PIN saved."})
}

// POST /profile/family/pin/verify
func (h *ProfileHandler) VerifyFamilyPin(c *fiber.Ctx) error {
	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "pin", "The pin field is required.")
	}
	raw, ok := body["pin"]
	if !ok || isJSONNull(raw) {
		return validationError(c, "pin", "The pin field is required.")
	}
	pin, err := jsonString(raw)
	if err != nil {
		return validationError(c, "pin", "The pin field must be a string.")
	}
	if pin == "" {
		return validationError(c, "pin", "The pin field is required.")
	}

	row, err := h.queries.GetUserPreferenceGroups(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	verified := hasFamilyPin(row.FamilyPin) &&
		bcrypt.CompareHashAndPassword([]byte(row.FamilyPin.String), []byte(pin)) == nil

	status := fiber.StatusOK
	if !verified {
		status = fiber.StatusUnprocessableEntity
	}
	return c.Status(status).JSON(fiber.Map{"success": verified, "verified": verified})
}

// hasFamilyPin is !empty($user->family_pin).
func hasFamilyPin(pin pgtype.Text) bool {
	return pin.Valid && pin.String != ""
}

// laravelBcrypt is Hash::make() - a bcrypt hash PHP will accept back.
//
// Go tags its hashes $2a$, but PHP's password_get_info() reports $2a$ as
// "unknown" (it only identifies $2y$ as bcrypt), and Laravel's BcryptHasher
// runs with hashing.bcrypt.verify = true, so Hash::check() on a $2a$ hash
// throws "This password does not use the Bcrypt algorithm." rather than
// returning false. A Go-written PIN therefore 500s every PHP read of it - which
// it did, until this retag (confirmed live against this VPS's PHP).
//
// The tags denote the same digest: $2y$ was added only to mark PHP's fix for a
// sign-extension bug in its own $2a$ implementation, and the two agree for any
// input where that bug cannot bite. Retagging the identical body is verifiably
// sound here - password_verify() accepts both forms of the same hash, and PINs
// are ASCII digits (familyPinPattern), nowhere near the 8-bit inputs at issue.
// Go's own bcrypt reads $2y$ back without complaint, so both stacks interop.
func laravelBcrypt(plain string, cost int) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(plain), cost)
	if err != nil {
		return "", err
	}
	if tagged, ok := strings.CutPrefix(string(hash), "$2a$"); ok {
		return "$2y$" + tagged, nil
	}
	return string(hash), nil
}

/* ── value helpers ──────────────────────────────────────────────────── */

// phpBool is PHP's (bool) cast, which xxxDefaults() applies to a saved value
// whose default is a bool. "0" and "" are false; any other non-empty string
// (including "false") is true.
func phpBool(v any) bool {
	switch t := v.(type) {
	case nil:
		return false
	case bool:
		return t
	case float64:
		return t != 0
	case string:
		return t != "" && t != "0"
	case []any:
		return len(t) > 0
	case map[string]any:
		return len(t) > 0
	}
	return true
}

// jsonInt mirrors Laravel's 'integer' rule (FILTER_VALIDATE_INT): a JSON
// integer, or a string holding one and nothing else. A fractional number is not
// an integer.
func jsonInt(raw json.RawMessage) (int, error) {
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		if n != math.Trunc(n) {
			return 0, errNotInteger
		}
		return int(n), nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if parsed, err := strconv.Atoi(strings.TrimSpace(s)); err == nil {
			return parsed, nil
		}
	}
	return 0, errNotInteger
}

// jsonFloat mirrors Laravel's 'numeric' rule (a number, or a numeric string).
func jsonFloat(raw json.RawMessage) (float64, error) {
	var n float64
	if err := json.Unmarshal(raw, &n); err == nil {
		return n, nil
	}
	var s string
	if err := json.Unmarshal(raw, &s); err == nil {
		if parsed, err := strconv.ParseFloat(strings.TrimSpace(s), 64); err == nil {
			return parsed, nil
		}
	}
	return 0, errNotNumeric
}
