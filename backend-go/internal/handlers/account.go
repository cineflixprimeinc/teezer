// Account (read) mirrors App\Http\Controllers\Api\AccountController's
// status/security/sessions GET endpoints - the Settings -> Security screen. All
// auth-required, per-user.
//
//   - status():   derived account_status + profile visibility + verification.
//   - security(): contact + password/alert state + live session count.
//   - sessions(): the 20 most recent Sanctum tokens, current one flagged.
//
// NOT ported: restrictions() (moderation tables), socialAccounts()
// (social_accounts), authorizedApps() (oauth_grants + the Laravel sso.clients
// config), and every write path (change-email/phone, OTP, revoke, delete) -
// all stay in Laravel.
package handlers

import (
	"encoding/json"

	"github.com/gofiber/fiber/v2"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

type AccountHandler struct {
	queries *sqlc.Queries
}

func NewAccountHandler(q *sqlc.Queries) *AccountHandler {
	return &AccountHandler{queries: q}
}

/* ── GET /account/status ────────────────────────────────────────────── */

func (h *AccountHandler) Status(c *fiber.Ctx) error {
	r, err := h.queries.GetAccountStatus(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}

	// First matching condition wins, in the controller's order.
	accountStatus := "active"
	switch {
	case r.IsBanned:
		accountStatus = "suspended"
	case !r.IsActive:
		accountStatus = "restricted"
	case !r.EmailVerifiedAt.Valid:
		accountStatus = "pending_verification"
	}

	visibility := "public"
	if r.IsPrivate {
		visibility = "private"
	}

	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{
		"account_status":            accountStatus,
		"profile_visibility_status": visibility,
		"email_verified":            r.EmailVerifiedAt.Valid,
		"phone_verified":            r.Phone.Valid && r.Phone.String != "",
	}})
}

/* ── GET /account/security ──────────────────────────────────────────── */

func (h *AccountHandler) Security(c *fiber.Ctx) error {
	ctx := c.Context()
	uid := auth.UserID(c)

	r, err := h.queries.GetAccountSecurity(ctx, uid)
	if err != nil {
		return serverError(c)
	}
	sessionCount, err := h.queries.CountUserTokens(ctx, uid)
	if err != nil {
		return serverError(c)
	}

	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{
		"email":               r.Email,
		"phone":               nullableText(r.Phone),
		"email_verified":      r.EmailVerifiedAt.Valid,
		"phone_verified":      r.Phone.Valid && r.Phone.String != "",
		"login_alerts":        r.LoginAlerts,
		"password_changed_at": toIso8601(r.PasswordChangedAt),
		"session_count":       sessionCount,
	}})
}

/* ── GET /account/sessions ──────────────────────────────────────────── */

func (h *AccountHandler) Sessions(c *fiber.Ctx) error {
	rows, err := h.queries.ListUserSessions(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	currentTokenID := auth.TokenID(c)

	data := make([]fiber.Map, len(rows))
	for i, t := range rows {
		label, browser, platform, ip, typ := parseSessionMeta(t.Name)
		data[i] = fiber.Map{
			"id":         t.ID,
			"label":      label,
			"browser":    browser,
			"platform":   platform,
			"type":       typ,
			"ip":         ip,
			"is_current": t.ID == currentTokenID,
			"last_used":  toIso8601(t.LastUsedAt),
			"created_at": toIso8601(t.CreatedAt),
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

// parseSessionMeta decodes a token's name field, which newer clients store as a
// JSON device descriptor. A non-object name (legacy plain-string labels) falls
// back to that raw string as the label with desktop defaults, matching the
// controller's is_array($meta) branch.
func parseSessionMeta(name string) (label string, browser, platform, ip any, typ string) {
	label, typ = "Unknown Device", "desktop"

	var meta map[string]any
	if err := json.Unmarshal([]byte(name), &meta); err != nil || meta == nil {
		return name, nil, nil, nil, "desktop" // legacy / non-JSON name
	}
	if s, ok := meta["label"].(string); ok {
		label = s
	}
	if s, ok := meta["type"].(string); ok {
		typ = s
	}
	return label, metaString(meta["browser"]), metaString(meta["platform"]), metaString(meta["ip"]), typ
}

// metaString returns a string value as-is, or nil for a missing/non-string key
// (the JSON meta fields default to null in the response).
func metaString(v any) any {
	if s, ok := v.(string); ok {
		return s
	}
	return nil
}
