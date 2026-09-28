// Package securitylimit ports App\Services\SecurityRateLimiter: a
// DB-backed (not Redis), per-identifier, escalating-lockout rate limiter
// used for login/register brute-force protection. Same rate_limits table
// Laravel uses, same row-lock-per-hit semantics (a transaction with
// SELECT ... FOR UPDATE), so the two backends see a consistent, shared
// lockout state for any identifier either one touches.
//
// NOT ported: SecurityLog/AdminActionLog audit-trail writes (Laravel treats
// these as fire-and-forget best-effort logging, wrapped in try/catch -
// dropping them here loses an audit trail but changes no login behavior).
package securitylimit

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"teezer/backend-go/internal/sqlc"
)

type Limiter struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Limiter {
	return &Limiter{pool: pool}
}

// Blocked describes an active lockout, returned instead of an error so
// callers can shape an HTTP response the way ApiAuthController does.
type Blocked struct {
	RetryAfterSeconds int
}

func (b *Blocked) Error() string { return "rate limited" }

// EnsureNotBlocked mirrors ensureNotBlocked(): a read-only check with no
// side effects, used to short-circuit before doing any credential work.
func (l *Limiter) EnsureNotBlocked(ctx context.Context, action string, identifiers map[string]string) (*Blocked, error) {
	q := sqlc.New(l.pool)
	for idType, identifier := range identifiers {
		if identifier == "" {
			continue
		}
		row, err := q.SelectRateLimit(ctx, sqlc.SelectRateLimitParams{
			Identifier: identifier, IdentifierType: idType, ActionType: action,
		})
		if errors.Is(err, pgx.ErrNoRows) {
			continue
		}
		if err != nil {
			return nil, err
		}
		if row.BlockedUntil.Valid && row.BlockedUntil.Time.After(time.Now()) {
			return &Blocked{RetryAfterSeconds: retryAfter(row.BlockedUntil.Time)}, nil
		}
	}
	return nil, nil
}

// HitOrFail mirrors hitOrFail(): records an attempt for every identifier
// supplied, escalating into a lockout per blockSeconds when maxAttempts is
// exceeded inside windowSeconds. Returns non-nil Blocked the moment any one
// identifier is (or just became) locked out - matching Laravel's
// first-match-throws loop.
func (l *Limiter) HitOrFail(ctx context.Context, action string, identifiers map[string]string, maxAttempts, windowSeconds int, blockSeconds []int) (*Blocked, error) {
	for idType, identifier := range identifiers {
		if identifier == "" {
			continue
		}
		blocked, err := l.hit(ctx, identifier, idType, action, maxAttempts, windowSeconds, blockSeconds)
		if err != nil {
			return nil, err
		}
		if blocked != nil {
			return blocked, nil
		}
	}
	return nil, nil
}

func (l *Limiter) hit(ctx context.Context, identifier, idType, action string, maxAttempts, windowSeconds int, blockSeconds []int) (*Blocked, error) {
	tx, err := l.pool.Begin(ctx)
	if err != nil {
		return nil, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback(ctx)

	q := sqlc.New(tx)
	row, err := q.SelectRateLimitForUpdate(ctx, sqlc.SelectRateLimitForUpdateParams{
		Identifier: identifier, IdentifierType: idType, ActionType: action,
	})
	if errors.Is(err, pgx.ErrNoRows) {
		created, insertErr := q.InsertRateLimit(ctx, sqlc.InsertRateLimitParams{
			Identifier: identifier, IdentifierType: idType, ActionType: action,
		})
		if insertErr != nil {
			return nil, fmt.Errorf("insert rate_limit: %w", insertErr)
		}
		row = sqlc.SelectRateLimitForUpdateRow(created)
	} else if err != nil {
		return nil, fmt.Errorf("select rate_limit for update: %w", err)
	}

	// UTC, not time.Now(): this value gets written into a tz-naive Postgres
	// column (windowStart/blockedUntil below). pgx decodes those columns'
	// raw digits back as UTC-labeled, so anything Go writes must be in UTC
	// too, or a non-UTC server clock skews every round trip by its offset.
	now := time.Now().UTC()

	if row.BlockedUntil.Valid && row.BlockedUntil.Time.After(now) {
		if err := tx.Commit(ctx); err != nil {
			return nil, err
		}
		return &Blocked{RetryAfterSeconds: retryAfter(row.BlockedUntil.Time)}, nil
	}

	attemptCount := row.AttemptCount
	windowStart := row.WindowStart
	if !windowStart.Valid || windowStart.Time.Add(time.Duration(windowSeconds)*time.Second).Before(now) {
		attemptCount = 0
		windowStart = pgtype.Timestamp{Time: now, Valid: true}
	}
	attemptCount++

	var limitExceeded bool
	if action == "wrong_password" {
		limitExceeded = attemptCount >= int32(maxAttempts)
	} else {
		limitExceeded = attemptCount > int32(maxAttempts)
	}

	blockLevel := row.BlockLevel
	var blockedUntil pgtype.Timestamp
	var result *Blocked

	if limitExceeded {
		level := int(blockLevel) + 1
		if level > len(blockSeconds) {
			level = len(blockSeconds)
		}
		seconds := blockSeconds[level-1]
		blockLevel = int16(level)
		blockedUntil = pgtype.Timestamp{Time: now.Add(time.Duration(seconds) * time.Second), Valid: true}
		windowStart = pgtype.Timestamp{Time: now, Valid: true}
		attemptCount = 0
		result = &Blocked{RetryAfterSeconds: seconds}
	}

	if err := q.UpdateRateLimit(ctx, sqlc.UpdateRateLimitParams{
		ID: row.ID, AttemptCount: attemptCount, WindowStart: windowStart,
		BlockLevel: blockLevel, BlockedUntil: blockedUntil,
	}); err != nil {
		return nil, fmt.Errorf("update rate_limit: %w", err)
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return result, nil
}

// Reset mirrors reset(): clears attempt/lockout state for every supplied
// identifier under action, e.g. after a successful login.
func (l *Limiter) Reset(ctx context.Context, action string, identifiers map[string]string) error {
	q := sqlc.New(l.pool)
	for idType, identifier := range identifiers {
		if identifier == "" {
			continue
		}
		if err := q.ResetRateLimit(ctx, sqlc.ResetRateLimitParams{
			Identifier: identifier, IdentifierType: idType, ActionType: action,
		}); err != nil {
			return err
		}
	}
	return nil
}

// HadPriorFailures mirrors the login()'s $hadFailures lookup: were there
// any wrong_password attempts/blocks recorded for this account before this
// Reset call clears them.
func (l *Limiter) HadPriorFailures(ctx context.Context, account string) (bool, error) {
	return sqlc.New(l.pool).ExistsRateLimitWithFailures(ctx, account)
}

func retryAfter(blockedUntil time.Time) int {
	seconds := int(time.Until(blockedUntil).Seconds())
	if seconds < 1 {
		return 1
	}
	return seconds
}

// HumanTime mirrors humanTime(): "X minute(s)" under an hour, else "X hour(s)".
func HumanTime(seconds int) string {
	if seconds >= 3600 {
		hours := (seconds + 3599) / 3600
		if hours == 1 {
			return "1 hour"
		}
		return fmt.Sprintf("%d hours", hours)
	}
	minutes := (seconds + 59) / 60
	if minutes == 1 {
		return "1 minute"
	}
	return fmt.Sprintf("%d minutes", minutes)
}
