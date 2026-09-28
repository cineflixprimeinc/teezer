// Likes mirrors App\Http\Controllers\Api\VideoInteractionController's
// like()/unlike(). This endpoint had a real historical production bug
// (see server/database/migrations 2026-06 corrective migrations): a bulk
// delete bypassed VideoLikeObserver, silently inflating likes_count on
// every like→unlike cycle. That's why InsertVideoLike/DeleteVideoLike use
// ON CONFLICT DO NOTHING / plain DELETE with RETURNING - the counter only
// ever moves when the query actually returns a row, i.e. a genuine state
// change, mirroring the observer's create/delete-event condition exactly
// without relying on any ORM-level event system.
//
// like() is scoped to interactable videos only (published, not moderation-
// -rejected - GetInteractableVideoForUpdate), matching
// VideoInteractionController::interactableVideo(); unlike() intentionally
// uses the unscoped GetVideoOwnerForUpdate, matching Laravel's own
// asymmetry (removing a reaction is always allowed; adding one isn't).
//
// ToggleLike() folds like()+unlike() into one atomic endpoint
// (VideoInteractionController::toggleLike): a single FOR UPDATE lock on the
// video row serializes concurrent taps so a like is always matched by exactly
// one unlike - the counter (and profiles.total_likes) never drifts.
//
// NOT ported: NotificationService::notify/withdraw ("X liked your video").
//
// RealtimeBus::publish IS ported (see internal/events) - a genuine like/
// unlike publishes video.liked/video.unliked to NATS, which the events
// consumer bridges to Centrifugo's video:<id> room exactly like Laravel.
package handlers

import (
	"context"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/events"
	"reelsoo/backend-go/internal/ratelimit"
	"reelsoo/backend-go/internal/sqlc"
)

// likeActionMaxPerMinute matches Laravel's throttle:like-action
// (Limit::perMinute(60)->by(...), AppServiceProvider.php) - applied here to
// like/unlike/toggle alike, rather than replicating Laravel's slightly
// asymmetric per-route wiring (like+toggle only, unlike relying on a
// separate blanket per-IP throttle Go doesn't have): one limit covering all
// three keeps the behavior consistent without a second primitive.
const likeActionMaxPerMinute = 60

type LikesHandler struct {
	queries *sqlc.Queries
	pool    *pgxpool.Pool
	events  *events.Publisher
	limiter *ratelimit.Limiter
}

func NewLikesHandler(q *sqlc.Queries, pool *pgxpool.Pool, pub *events.Publisher, l *ratelimit.Limiter) *LikesHandler {
	return &LikesHandler{queries: q, pool: pool, events: pub, limiter: l}
}

func (h *LikesHandler) Like(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	tooMany, err := h.limiter.TooManyAttempts(ctx, "like:"+itoa(userID), likeActionMaxPerMinute, 60)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You're doing that too fast. Try again in a minute.")
	}

	genuine, err := h.likeTx(ctx, videoID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoLikesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	// Only a genuine state change (not a repeat tap on an already-liked video)
	// broadcasts - an unconditional publish would fan out a no-op duplicate.
	if genuine {
		h.events.Publish(events.NewVideoLiked(videoID, count))
	}
	return c.JSON(fiber.Map{"success": true, "liked": true, "likes_count": count})
}

func (h *LikesHandler) likeTx(ctx context.Context, videoID, userID int64) (genuine bool, err error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	owner, err := q.GetInteractableVideoForUpdate(ctx, videoID)
	if err != nil {
		return false, err // pgx.ErrNoRows => video doesn't exist, isn't published, or was rejected
	}

	_, err = q.InsertVideoLike(ctx, sqlc.InsertVideoLikeParams{VideoID: videoID, UserID: userID})
	genuine = err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if genuine {
		if err := q.IncrementVideoLikesCount(ctx, videoID); err != nil {
			return false, err
		}
		if err := q.IncrementProfileTotalLikes(ctx, owner.UserID); err != nil {
			return false, err
		}
	}

	return genuine, tx.Commit(ctx)
}

func (h *LikesHandler) Unlike(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	tooMany, err := h.limiter.TooManyAttempts(ctx, "like:"+itoa(userID), likeActionMaxPerMinute, 60)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You're doing that too fast. Try again in a minute.")
	}

	genuine, err := h.unlikeTx(ctx, videoID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoLikesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if genuine {
		h.events.Publish(events.NewVideoUnliked(videoID, count))
	}
	return c.JSON(fiber.Map{"success": true, "liked": false, "likes_count": count})
}

func (h *LikesHandler) unlikeTx(ctx context.Context, videoID, userID int64) (genuine bool, err error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	owner, err := q.GetVideoOwnerForUpdate(ctx, videoID)
	if err != nil {
		return false, err // pgx.ErrNoRows => video doesn't exist
	}

	_, err = q.DeleteVideoLike(ctx, sqlc.DeleteVideoLikeParams{VideoID: videoID, UserID: userID})
	genuine = err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return false, err
	}

	if genuine {
		if err := q.DecrementVideoLikesCount(ctx, videoID); err != nil {
			return false, err
		}
		if err := q.DecrementProfileTotalLikes(ctx, owner.UserID); err != nil {
			return false, err
		}
	}

	return genuine, tx.Commit(ctx)
}

func (h *LikesHandler) ToggleLike(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	tooMany, err := h.limiter.TooManyAttempts(ctx, "like:"+itoa(userID), likeActionMaxPerMinute, 60)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You're doing that too fast. Try again in a minute.")
	}

	liked, err := h.toggleLikeTx(ctx, videoID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoLikesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	// A toggle always flips state, so this is always a genuine change.
	if liked {
		h.events.Publish(events.NewVideoLiked(videoID, count))
	} else {
		h.events.Publish(events.NewVideoUnliked(videoID, count))
	}
	return c.JSON(fiber.Map{"success": true, "liked": liked, "likes_count": count})
}

// toggleLikeTx holds the video lock for the whole read-then-write, so the
// like row's presence is stable within the tx: DELETE...RETURNING detects an
// existing like (→ unlike branch) and its absence (pgx.ErrNoRows) means we
// insert. Scoped via GetInteractableVideoForUpdate exactly like likeTx -
// toggling a like/unlike is still gated on the video being interactable.
func (h *LikesHandler) toggleLikeTx(ctx context.Context, videoID, userID int64) (liked bool, err error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	owner, err := q.GetInteractableVideoForUpdate(ctx, videoID)
	if err != nil {
		return false, err // pgx.ErrNoRows => video doesn't exist, isn't published, or was rejected
	}

	_, delErr := q.DeleteVideoLike(ctx, sqlc.DeleteVideoLikeParams{VideoID: videoID, UserID: userID})
	switch {
	case delErr == nil:
		// A like existed and was removed → this toggle is an unlike.
		if err := q.DecrementVideoLikesCount(ctx, videoID); err != nil {
			return false, err
		}
		if err := q.DecrementProfileTotalLikes(ctx, owner.UserID); err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	case errors.Is(delErr, pgx.ErrNoRows):
		// No like existed → this toggle is a like. ON CONFLICT DO NOTHING is
		// redundant under the lock but keeps the insert idempotent regardless.
		_, insErr := q.InsertVideoLike(ctx, sqlc.InsertVideoLikeParams{VideoID: videoID, UserID: userID})
		if insErr != nil && !errors.Is(insErr, pgx.ErrNoRows) {
			return false, insErr
		}
		if insErr == nil {
			if err := q.IncrementVideoLikesCount(ctx, videoID); err != nil {
				return false, err
			}
			if err := q.IncrementProfileTotalLikes(ctx, owner.UserID); err != nil {
				return false, err
			}
		}
		return true, tx.Commit(ctx)
	default:
		return false, delErr
	}
}
