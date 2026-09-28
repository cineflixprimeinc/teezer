// Auth mirrors the login/me/two-factor-challenge actions of
// App\Http\Controllers\Api\Auth\ApiAuthController.
//
// SCOPE NOTE: this is a reduced-parity port, not a drop-in replacement yet.
// Login replicates: Turnstile bot check, SecurityRateLimiter's escalating
// lockout (login_api_minute/hour + wrong_password block-level escalation,
// sharing the same rate_limits table Laravel uses), the two-factor GATE,
// and - as of this pass - the two-factor-challenge verification step
// itself (TOTP only; see below), completing the 2FA login loop end to end.
//
// Still deliberately NOT replicated:
//   - Recovery-code consumption. twoFactorChallenge() accepts a
//     recovery_code as an alternative to a TOTP code; this port only
//     checks `code`. A user who lost their authenticator device still
//     needs Laravel for that path. (Would need a Laravel-compatible
//     *encrypt*, not just decrypt, to rewrite the pruned code list back -
//     laravelcrypt only implements decrypt.)
//   - SecurityLog/AdminActionLog audit-trail writes (Laravel treats these
//     as fire-and-forget best-effort; see internal/securitylimit doc comment).
//   - Country detection recording (CountryService::recordDetection).
//   - Full userResource() field set - profile stats, permissions,
//     preferences, country-lock fields are omitted below.
//
// Registration is not implemented at all yet (depends on the signup-draft
// OTP email-verification flow, CleanUsername/NotDisposableEmail rules, and
// CountryService).
package handlers

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/crypto/bcrypt"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/laravelcrypt"
	"teezer/backend-go/internal/ratelimit"
	"teezer/backend-go/internal/securitylimit"
	"teezer/backend-go/internal/sqlc"
	"teezer/backend-go/internal/tokens"
	"teezer/backend-go/internal/totp"
	"teezer/backend-go/internal/turnstile"
)

const twoFactorChallengeTTL = 5 * time.Minute

type AuthHandler struct {
	queries         *sqlc.Queries
	securityLimiter *securitylimit.Limiter
	turnstileSvc    *turnstile.Service
	challengeCache  *ratelimit.Limiter // reused purely as a Cache::put/get/forget equivalent here
	crypt           *laravelcrypt.Decrypter
}

func NewAuthHandler(q *sqlc.Queries, sl *securitylimit.Limiter, ts *turnstile.Service, cache *ratelimit.Limiter, crypt *laravelcrypt.Decrypter) *AuthHandler {
	return &AuthHandler{queries: q, securityLimiter: sl, turnstileSvc: ts, challengeCache: cache, crypt: crypt}
}

// userRow unifies GetUserByEmail/Username/ID's structurally-identical but
// nominally distinct sqlc row types.
type userRow struct {
	ID          int64
	Name        string
	Username    string
	Email       string
	Password    string
	Avatar      pgtype.Text
	Phone       pgtype.Text
	Bio         pgtype.Text
	Country     pgtype.Text
	DateOfBirth pgtype.Date
	Role        string
	IsVerified  bool
	IsPrivate   bool
	IsActive    bool
	IsBanned    bool
	BanReason   pgtype.Text

	TwoFactorSecret      pgtype.Text
	TwoFactorConfirmedAt pgtype.Timestamp

	CreatedAt pgtype.Timestamp
}

// hasTwoFactorEnabled mirrors User::hasTwoFactorEnabled().
func (u userRow) hasTwoFactorEnabled() bool {
	return u.TwoFactorConfirmedAt.Valid && u.TwoFactorSecret.Valid && u.TwoFactorSecret.String != ""
}

func fromEmailRow(r sqlc.GetUserByEmailRow) userRow       { return userRow(r) }
func fromUsernameRow(r sqlc.GetUserByUsernameRow) userRow { return userRow(r) }
func fromIDRow(r sqlc.GetUserByIDRow) userRow             { return userRow(r) }

type loginRequest struct {
	Login          string `json:"login"`
	Password       string `json:"password"`
	TurnstileToken string `json:"turnstile_token"`
}

func (h *AuthHandler) Login(c *fiber.Ctx) error {
	var req loginRequest
	if err := c.BodyParser(&req); err != nil || req.Login == "" || req.Password == "" {
		return validationError(c, "login", "The login field and password field are required.")
	}

	ctx := c.Context()

	if !isMobileClient(c) {
		result := h.turnstileSvc.Verify(ctx, req.TurnstileToken, c.IP())
		if !result.OK && !result.ConfigError {
			return validationError(c, "login", "Please complete the verification challenge and try again.")
		}
	}

	account := normalizeAccount(req.Login)
	device := deviceFingerprint(c)
	loginIDs := filterEmpty(map[string]string{"ip": c.IP(), "account": account})
	wrongPasswordIDs := filterEmpty(map[string]string{"ip": c.IP(), "account": account, "device": device})

	if blocked, err := h.securityLimiter.EnsureNotBlocked(ctx, "wrong_password", wrongPasswordIDs); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	} else if blocked != nil {
		return rateLimitedResponse(c, "wrong_password", blocked.RetryAfterSeconds)
	}

	if blocked, err := h.securityLimiter.HitOrFail(ctx, "login_api_minute", map[string]string{"ip": c.IP()}, 10, 60, []int{60, 300}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	} else if blocked != nil {
		return rateLimitedResponse(c, "login_api_minute", blocked.RetryAfterSeconds)
	}
	if blocked, err := h.securityLimiter.HitOrFail(ctx, "login_api_hour", loginIDs, 30, 3600, []int{900, 3600}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	} else if blocked != nil {
		return rateLimitedResponse(c, "login_api_hour", blocked.RetryAfterSeconds)
	}

	user, err := lookupUser(ctx, h.queries, req.Login)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if errors.Is(err, pgx.ErrNoRows) || bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
		if blocked, hitErr := h.securityLimiter.HitOrFail(ctx, "wrong_password", wrongPasswordIDs, 5, 900, []int{900, 3600, 86400}); hitErr != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		} else if blocked != nil {
			return rateLimitedResponse(c, "wrong_password", blocked.RetryAfterSeconds)
		}
		return validationError(c, "login", "The credentials do not match our records.")
	}

	if user.IsBanned {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false, "message": "Your account has been suspended. Contact support@teezer.live.",
			"code": "ACCOUNT_BANNED",
		})
	}
	if !user.IsActive {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false, "message": "This account has been deactivated.",
			"code": "ACCOUNT_INACTIVE",
		})
	}

	if err := h.securityLimiter.Reset(ctx, "wrong_password", wrongPasswordIDs); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	// ── Two-factor gate ──────────────────────────────────────────────────
	// Correct password, but 2FA is enabled: refuse to issue a real token.
	// Store the challenge exactly as Laravel's Cache::put does, so the
	// TwoFactorChallenge handler below can redeem it.
	if user.hasTwoFactorEnabled() {
		challenge, _, err := tokens.Generate()
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		cacheKey := challengeCacheKey(challenge)
		if err := h.challengeCache.Put(ctx, cacheKey, itoa(user.ID), twoFactorChallengeTTL); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		return c.JSON(fiber.Map{
			"success":             true,
			"two_factor_required": true,
			"message":             "Enter the 6-digit code from your authenticator app.",
			"data":                fiber.Map{"challenge": challenge},
		})
	}

	return h.issueLoginToken(ctx, c, user)
}

type twoFactorChallengeRequest struct {
	Challenge string `json:"challenge"`
	Code      string `json:"code"`
	// RecoveryCode is accepted but not implemented - see package doc comment.
	RecoveryCode string `json:"recovery_code"`
}

// TwoFactorChallenge mirrors ApiAuthController::twoFactorChallenge(), TOTP
// path only (see package doc comment for the recovery_code gap).
func (h *AuthHandler) TwoFactorChallenge(c *fiber.Ctx) error {
	var req twoFactorChallengeRequest
	if err := c.BodyParser(&req); err != nil || req.Challenge == "" {
		return validationError(c, "challenge", "The challenge field is required.")
	}
	if req.Code == "" {
		if req.RecoveryCode != "" {
			return validationError(c, "code", "Recovery codes aren't supported yet - please use your authenticator app, or sign in on the web.")
		}
		return validationError(c, "code", "Enter your authentication code.")
	}

	ctx := c.Context()
	cacheKey := challengeCacheKey(req.Challenge)

	userIDStr, ok, err := h.challengeCache.Get(ctx, cacheKey)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if !ok {
		return validationError(c, "challenge", "This sign-in attempt expired. Please log in again.")
	}
	userID, err := strconv.ParseInt(userIDStr, 10, 64)
	if err != nil {
		return validationError(c, "challenge", "This sign-in attempt expired. Please log in again.")
	}

	attemptsKey := cacheKey + ":attempts"
	attempts, err := h.challengeCache.Incr(ctx, attemptsKey, twoFactorChallengeTTL)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if attempts > 5 {
		_ = h.challengeCache.Delete(ctx, cacheKey)
		return validationError(c, "code", "Too many incorrect codes. Please log in again.")
	}

	row, err := h.queries.GetUserByID(ctx, userID)
	if err != nil {
		_ = h.challengeCache.Delete(ctx, cacheKey)
		return validationError(c, "challenge", "This sign-in attempt is no longer valid. Please log in again.")
	}
	user := fromIDRow(row)
	if !user.hasTwoFactorEnabled() {
		_ = h.challengeCache.Delete(ctx, cacheKey)
		return validationError(c, "challenge", "This sign-in attempt is no longer valid. Please log in again.")
	}

	secret, err := h.crypt.DecryptString(user.TwoFactorSecret.String)
	if err != nil || !totp.Verify(secret, req.Code, 1) {
		return validationError(c, "code", "The code is incorrect or has expired.")
	}

	_ = h.challengeCache.Delete(ctx, cacheKey)
	_ = h.challengeCache.Delete(ctx, attemptsKey)

	return h.issueLoginToken(ctx, c, user)
}

func challengeCacheKey(challenge string) string {
	sum := sha256.Sum256([]byte(challenge))
	return "2fa:challenge:" + hex.EncodeToString(sum[:])
}

// issueLoginToken mirrors ApiAuthController::issueLoginToken(): prune to the
// 9 most-recent tokens, mint a fresh one, stamp last_login_at/last_active_at.
// Shared by the direct-login path and the post-2FA-challenge path.
func (h *AuthHandler) issueLoginToken(ctx context.Context, c *fiber.Ctx, user userRow) error {
	// .UTC(): written into personal_access_tokens.expires_at, a tz-naive
	// column pgx round-trips as UTC digits - see database.Connect's doc
	// comment for why a non-UTC-labeled time.Time would skew on read-back.
	expiresAt := time.Now().UTC().AddDate(0, 0, 30) // sanctum.expiration default: 60*24*30 minutes = 30 days
	plaintext, hash, err := tokens.Generate()
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	if err := h.queries.PruneOldTokens(ctx, user.ID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	tokenID, err := h.queries.CreatePersonalAccessToken(ctx, sqlc.CreatePersonalAccessTokenParams{
		TokenableID: user.ID,
		Name:        userAgentSessionName(c),
		Token:       hash,
		Abilities:   pgtype.Text{String: `["*"]`, Valid: true},
		ExpiresAt:   pgtype.Timestamp{Time: expiresAt, Valid: true},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	if err := h.queries.TouchLogin(ctx, user.ID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	fullToken := itoa(tokenID) + "|" + plaintext

	return c.JSON(fiber.Map{
		"success": true,
		"message": "Login successful.",
		"data": fiber.Map{
			"token":      fullToken,
			"token_type": "Bearer",
			"expires_at": expiresAt.Format(time.RFC3339),
			"user":       userResource(user),
		},
	})
}

func isMobileClient(c *fiber.Ctx) bool {
	return strings.EqualFold(c.Get("X-Client"), "teezer-mobile")
}

func normalizeAccount(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}

func deviceFingerprint(c *fiber.Ctx) string {
	v := strings.TrimSpace(c.Get("X-Device-Fingerprint"))
	if v == "" {
		return ""
	}
	sum := sha256.Sum256([]byte(v))
	hexSum := hex.EncodeToString(sum[:])
	if len(hexSum) > 64 {
		hexSum = hexSum[:64]
	}
	return hexSum
}

func filterEmpty(m map[string]string) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		if v != "" {
			out[k] = v
		}
	}
	return out
}

// rateLimitedResponse mirrors SecurityRateLimiter::responseFor(): 429 with
// a wrong_password-specific message wording, generic otherwise.
func rateLimitedResponse(c *fiber.Ctx, actionType string, retryAfterSeconds int) error {
	human := securitylimit.HumanTime(retryAfterSeconds)
	message := "Too many attempts. Please try again in " + human + "."
	if actionType == "wrong_password" {
		message = "Too many attempts\nFor your account safety, login has been temporarily locked.\nPlease try again in " + human + "."
	}
	return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
		"success":     false,
		"error":       "RATE_LIMITED",
		"message":     message,
		"retry_after": retryAfterSeconds,
	})
}

func (h *AuthHandler) Me(c *fiber.Ctx) error {
	uid := auth.UserID(c)
	row, err := h.queries.GetUserByID(c.Context(), uid)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "data": userResource(fromIDRow(row))})
}

// lookupUser mirrors login()'s field detection:
// filter_var($login, FILTER_VALIDATE_EMAIL) ? 'email' : 'username'.
func lookupUser(ctx context.Context, q *sqlc.Queries, login string) (userRow, error) {
	if looksLikeEmail(login) {
		row, err := q.GetUserByEmail(ctx, login)
		return fromEmailRow(row), err
	}
	row, err := q.GetUserByUsername(ctx, login)
	return fromUsernameRow(row), err
}

// looksLikeEmail is a pragmatic stand-in for PHP's FILTER_VALIDATE_EMAIL -
// good enough to route to the right lookup query; real format validation
// still happens implicitly (a malformed "email" just won't match any row).
func looksLikeEmail(s string) bool {
	at := strings.IndexByte(s, '@')
	return at > 0 && at < len(s)-1 && strings.Contains(s[at+1:], ".")
}

func userResource(u userRow) fiber.Map {
	m := fiber.Map{
		"id":                 u.ID,
		"name":               u.Name,
		"username":           u.Username,
		"email":              u.Email,
		"role":               u.Role,
		"phone":              nullableText(u.Phone),
		"bio":                nullableText(u.Bio),
		"country":            nullableText(u.Country),
		"is_verified":        u.IsVerified,
		"is_private":         u.IsPrivate,
		"is_active":          u.IsActive,
		"is_banned":          u.IsBanned,
		"ban_reason":         nullableText(u.BanReason),
		"avatar":             nullableText(u.Avatar), // NOTE: Laravel wraps this with Storage::url(); raw path here
		"two_factor_enabled": u.hasTwoFactorEnabled(),
	}
	if u.DateOfBirth.Valid {
		m["date_of_birth"] = u.DateOfBirth.Time.Format("2006-01-02")
	} else {
		m["date_of_birth"] = nil
	}
	if u.CreatedAt.Valid {
		m["created_at"] = u.CreatedAt.Time.Format(time.RFC3339)
	} else {
		m["created_at"] = nil
	}
	return m
}

func nullableText(t pgtype.Text) any {
	if t.Valid {
		return t.String
	}
	return nil
}

// validationError is a 422 for a single field. The envelope is NOT Laravel's
// default ValidationException body: bootstrap/app.php renders every api/*
// ValidationException as {success:false, message:"Validation failed.", errors},
// with the per-field messages carried only by errors.
func validationError(c *fiber.Ctx, field, message string) error {
	return validationErrors(c, map[string][]string{field: {message}})
}

// validationErrors is the same 422 for a whole set of failing fields, mirroring
// $e->errors() - Laravel validates every field before throwing, so a request
// with two bad fields reports both.
func validationErrors(c *fiber.Ctx, errs map[string][]string) error {
	return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
		"success": false,
		"message": "Validation failed.",
		"errors":  errs,
	})
}

func userAgentSessionName(c *fiber.Ctx) string {
	if ua := c.Get("User-Agent"); ua != "" {
		return ua
	}
	return "api-token"
}
