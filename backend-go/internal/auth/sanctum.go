// Package auth validates Laravel Sanctum personal access tokens directly
// against the personal_access_tokens table, so a token issued by the
// Laravel backend authenticates identically here. Token wire format is
// Sanctum's own: "{id}|{40-char plaintext}". Sanctum stores sha256(plaintext)
// in the token column; a match on that hash, plus a non-expired token and a
// non-banned/active user, is what Laravel's own guard checks.
package auth

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"

	"reelsoo/backend-go/internal/sqlc"
)

const (
	localsUserID  = "auth_user_id"
	localsTokenID = "auth_token_id"
)

type Authenticator struct {
	queries *sqlc.Queries
}

func NewAuthenticator(q *sqlc.Queries) *Authenticator {
	return &Authenticator{queries: q}
}

// resolve mirrors App\Http\Middleware\OptionalSanctumAuth: returns the
// authenticated user id and the id of the token that authenticated the request
// (the current access token, used by /account/sessions to flag is_current), or
// (0, 0) if the token is missing, malformed, expired, or belongs to a banned/
// inactive user.
func (a *Authenticator) resolve(ctx context.Context, bearer string) (userID, tokenID int64) {
	if bearer == "" {
		return 0, 0
	}

	idPart, plaintext, ok := strings.Cut(bearer, "|")
	if !ok {
		return 0, 0
	}
	id, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil {
		return 0, 0
	}

	row, err := a.queries.GetTokenWithUser(ctx, id)
	if err != nil {
		return 0, 0
	}

	sum := sha256.Sum256([]byte(plaintext))
	expected := hex.EncodeToString(sum[:])
	if subtle.ConstantTimeCompare([]byte(expected), []byte(row.Token)) != 1 {
		return 0, 0
	}

	if row.ExpiresAt.Valid && !row.ExpiresAt.Time.IsZero() {
		if !row.ExpiresAt.Time.After(time.Now()) {
			return 0, 0
		}
	}

	if row.IsBanned || !row.IsActive {
		return 0, 0
	}

	return row.UserID, row.ID
}

// OptionalAuth sets the authenticated user id in locals when a valid bearer
// token is present, but never rejects the request. Equivalent to the
// 'optional.sanctum' route middleware.
func (a *Authenticator) OptionalAuth(c *fiber.Ctx) error {
	if uid, tid := a.resolve(c.Context(), bearerToken(c)); uid != 0 {
		c.Locals(localsUserID, uid)
		c.Locals(localsTokenID, tid)
	}
	return c.Next()
}

// RequireAuth rejects the request with 401 when no valid bearer token is
// present. Equivalent to the 'auth:sanctum' route middleware.
func (a *Authenticator) RequireAuth(c *fiber.Ctx) error {
	uid, tid := a.resolve(c.Context(), bearerToken(c))
	if uid == 0 {
		// bootstrap/app.php renders every unauthenticated api/* request as
		// {success:false, message:"Unauthenticated."} - the success flag was
		// missing here, so every authed route's 401 differed from Laravel's.
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"success": false,
			"message": "Unauthenticated.",
		})
	}
	c.Locals(localsUserID, uid)
	c.Locals(localsTokenID, tid)
	return c.Next()
}

// UserID returns the authenticated user id for the request, or 0 if none.
func UserID(c *fiber.Ctx) int64 {
	uid, _ := c.Locals(localsUserID).(int64)
	return uid
}

// TokenID returns the id of the personal access token that authenticated the
// request (the "current" token), or 0 if none. Used to flag is_current in the
// /account/sessions list.
func TokenID(c *fiber.Ctx) int64 {
	tid, _ := c.Locals(localsTokenID).(int64)
	return tid
}

func bearerToken(c *fiber.Ctx) string {
	h := c.Get("Authorization")
	const prefix = "Bearer "
	if len(h) > len(prefix) && strings.EqualFold(h[:len(prefix)], prefix) {
		return h[len(prefix):]
	}
	return ""
}
