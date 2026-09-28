// Follow mirrors App\Http\Controllers\Api\FollowController's follow()/
// unfollow(). Core relationship + counter correctness is fully replicated;
// side effects are deliberately NOT:
//   - NotificationService::notify/withdraw (in-app "X followed you" /
//     follow-request notifications)
//   - Cache::forget("profile:stats:{id}") (profile stats cache invalidation
//     - a follow/unfollow done through Go may leave a stale cached count
//     until that cache's own TTL expires)
//   - Deleting the pending follow_request notification row on cancel
//
// None of these affect whether a follow relationship or counter is
// correct - they're UX side effects, not data integrity.
//
// RealtimeBus::publish IS ported (see internal/events): an immediately-
// accepted follow/unfollow publishes user.followed/user.unfollowed to the
// followed user's Centrifugo room. A follow REQUEST (private account,
// status="pending") does not - no counter moved yet.
package handlers

import (
	"context"
	"errors"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/events"
	"reelsoo/backend-go/internal/ratelimit"
	"reelsoo/backend-go/internal/sqlc"
)

// Matches Laravel's throttle:follow-action (AppServiceProvider.php:
// Limit::perMinute(30) + Limit::perDay(300), both ->by(userID)). Applied to
// BOTH follow and unfollow here - Laravel's own limiter is registered under
// a name and doc comment that already say "Follows / unfollows", but the
// route wiring only ever attached it to POST /follow, leaving DELETE
// /follow (unfollow) uncovered. Not reproducing that gap on a fresh port.
const (
	followActionMaxPerMinute = 30
	followActionMaxPerDay    = 300
)

type FollowHandler struct {
	queries *sqlc.Queries
	pool    *pgxpool.Pool
	events  *events.Publisher
	limiter *ratelimit.Limiter
}

func NewFollowHandler(q *sqlc.Queries, pool *pgxpool.Pool, pub *events.Publisher, l *ratelimit.Limiter) *FollowHandler {
	return &FollowHandler{queries: q, pool: pool, events: pub, limiter: l}
}

// checkFollowActionRate applies the shared follow/unfollow limit. Returns a
// ready-to-return Fiber error when the caller should stop, nil to continue.
func (h *FollowHandler) checkFollowActionRate(ctx context.Context, c *fiber.Ctx, userID int64) error {
	tooMany, err := h.limiter.TooManyAttempts(ctx, "follow:min:"+itoa(userID), followActionMaxPerMinute, 60)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You're doing that too fast. Try again in a minute.")
	}
	tooMany, err = h.limiter.TooManyAttempts(ctx, "follow:day:"+itoa(userID), followActionMaxPerDay, 86400)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You've reached today's follow limit.")
	}
	return nil
}

func (h *FollowHandler) Follow(c *fiber.Ctx) error {
	ctx := c.Context()
	authUserID := auth.UserID(c)
	username := c.Params("username")

	if rlErr := h.checkFollowActionRate(ctx, c, authUserID); rlErr != nil {
		return rlErr
	}

	target, err := h.queries.GetUserByUsername(ctx, username)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c)
	} else if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	if authUserID == target.ID {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false, "message": "You cannot follow yourself.",
		})
	}

	disabled, err := h.queries.GetDisableFollowingOthers(ctx, authUserID)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if disabled {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false, "message": "Your ability to follow other users has been restricted at this time.",
		})
	}

	targetBlockedAuth, err := h.queries.IsBlocked(ctx, sqlc.IsBlockedParams{BlockerID: target.ID, BlockedID: authUserID})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	authBlockedTarget, err := h.queries.IsBlocked(ctx, sqlc.IsBlockedParams{BlockerID: authUserID, BlockedID: target.ID})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if targetBlockedAuth || authBlockedTarget {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "User not found."})
	}

	newStatus := "accepted"
	if target.IsPrivate {
		newStatus = "pending"
	}

	status, err := h.followTx(ctx, authUserID, target.ID, newStatus)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	followersCount, err := h.queries.GetFollowersCount(ctx, target.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	// Only an immediately-accepted follow moved the counter - a pending
	// request (private account) has nothing to broadcast yet.
	if status == "accepted" {
		h.events.Publish(events.NewUserFollowed(target.ID, followersCount))
	}

	return c.JSON(fiber.Map{
		"success":         true,
		"follow_status":   status,
		"following":       status == "accepted",
		"followers_count": followersCount,
	})
}

// followTx mirrors the DB::transaction in FollowController::follow(): lock
// any existing row and return its status idempotently, otherwise insert
// and - only for immediately-accepted follows - bump both sides' counters.
func (h *FollowHandler) followTx(ctx context.Context, followerID, followingID int64, newStatus string) (string, error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return "", err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	existing, err := q.SelectFollowForUpdate(ctx, sqlc.SelectFollowForUpdateParams{
		FollowerID: followerID, FollowingID: followingID,
	})
	if err == nil {
		return existing.Status, tx.Commit(ctx)
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return "", err
	}

	if _, err := q.InsertFollow(ctx, sqlc.InsertFollowParams{
		FollowerID: followerID, FollowingID: followingID, Status: newStatus,
	}); err != nil {
		return "", err
	}
	if newStatus == "accepted" {
		if err := q.IncrementFollowingCount(ctx, followerID); err != nil {
			return "", err
		}
		if err := q.IncrementFollowersCount(ctx, followingID); err != nil {
			return "", err
		}
	}

	return newStatus, tx.Commit(ctx)
}

func (h *FollowHandler) Unfollow(c *fiber.Ctx) error {
	ctx := c.Context()
	authUserID := auth.UserID(c)
	username := c.Params("username")

	if rlErr := h.checkFollowActionRate(ctx, c, authUserID); rlErr != nil {
		return rlErr
	}

	target, err := h.queries.GetUserByUsername(ctx, username)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c)
	} else if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	genuine, err := h.unfollowTx(ctx, authUserID, target.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	followersCount, err := h.queries.GetFollowersCount(ctx, target.ID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	// Only broadcast if an accepted follow's counter actually moved - not a
	// no-op (wasn't following) or cancelling a still-pending request.
	if genuine {
		h.events.Publish(events.NewUserUnfollowed(target.ID, followersCount))
	}

	return c.JSON(fiber.Map{
		"success":         true,
		"follow_status":   "none",
		"following":       false,
		"followers_count": followersCount,
	})
}

// unfollowTx mirrors unfollow()'s DB::transaction: delete the row (no-op if
// absent) and only decrement counters if it had been an accepted follow.
func (h *FollowHandler) unfollowTx(ctx context.Context, followerID, followingID int64) (genuine bool, err error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	deleted, err := q.DeleteFollow(ctx, sqlc.DeleteFollowParams{FollowerID: followerID, FollowingID: followingID})
	if errors.Is(err, pgx.ErrNoRows) {
		return false, tx.Commit(ctx) // wasn't following - no-op, matches Laravel's early return
	}
	if err != nil {
		return false, err
	}

	if deleted.Status == "accepted" {
		if err := q.DecrementFollowingCount(ctx, followerID); err != nil {
			return false, err
		}
		if err := q.DecrementFollowersCount(ctx, followingID); err != nil {
			return false, err
		}
	}

	return deleted.Status == "accepted", tx.Commit(ctx)
}
