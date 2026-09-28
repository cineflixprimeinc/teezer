// Saves mirrors VideoInteractionController's save()/unsave(). VideoSave has
// no Eloquent observer in Laravel - the controller increments/decrements
// saves_count directly - but the same idempotency risk applies as likes,
// so this uses the identical INSERT/DELETE...RETURNING pattern: the
// counter only moves when the query actually returns a row.
//
// save() is scoped to interactable videos only (GetInteractableVideoForUpdate,
// same as like()); unsave() uses the unscoped GetVideoOwnerForUpdate, same
// asymmetry as unlike().
//
// ToggleSave() folds save()+unsave() into one atomic endpoint
// (VideoInteractionController::toggleSave): a single FOR UPDATE lock on the
// video row serializes concurrent taps so saves_count never drifts.
//
// NOT ported: NotificationService::notify/withdraw ("X saved your video"),
// RealtimeBus::publish (live saves_count push).
package handlers

import (
	"context"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

type SavesHandler struct {
	queries *sqlc.Queries
	pool    *pgxpool.Pool
}

func NewSavesHandler(q *sqlc.Queries, pool *pgxpool.Pool) *SavesHandler {
	return &SavesHandler{queries: q, pool: pool}
}

func (h *SavesHandler) Save(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	if err := h.saveTx(ctx, videoID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoSavesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "saved": true, "saves_count": count})
}

func (h *SavesHandler) saveTx(ctx context.Context, videoID, userID int64) error {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	if _, err := q.GetInteractableVideoForUpdate(ctx, videoID); err != nil {
		return err // pgx.ErrNoRows => video doesn't exist, isn't published, or was rejected
	}

	_, err = q.InsertVideoSave(ctx, sqlc.InsertVideoSaveParams{VideoID: videoID, UserID: userID})
	genuine := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	if genuine {
		if err := q.IncrementVideoSavesCount(ctx, videoID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (h *SavesHandler) Unsave(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	if err := h.unsaveTx(ctx, videoID, userID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoSavesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "saved": false, "saves_count": count})
}

func (h *SavesHandler) unsaveTx(ctx context.Context, videoID, userID int64) error {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	if _, err := q.GetVideoOwnerForUpdate(ctx, videoID); err != nil {
		return err // pgx.ErrNoRows => video doesn't exist
	}

	_, err = q.DeleteVideoSave(ctx, sqlc.DeleteVideoSaveParams{VideoID: videoID, UserID: userID})
	genuine := err == nil
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}

	if genuine {
		if err := q.DecrementVideoSavesCount(ctx, videoID); err != nil {
			return err
		}
	}

	return tx.Commit(ctx)
}

func (h *SavesHandler) ToggleSave(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	saved, err := h.toggleSaveTx(ctx, videoID, userID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoSavesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "saved": saved, "saves_count": count})
}

// toggleSaveTx mirrors toggleLikeTx: the video lock makes DELETE...RETURNING a
// reliable presence test, so an existing save toggles off and its absence
// toggles on. Scoped via GetInteractableVideoForUpdate like saveTx.
func (h *SavesHandler) toggleSaveTx(ctx context.Context, videoID, userID int64) (saved bool, err error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return false, err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	if _, err := q.GetInteractableVideoForUpdate(ctx, videoID); err != nil {
		return false, err // pgx.ErrNoRows => video doesn't exist, isn't published, or was rejected
	}

	_, delErr := q.DeleteVideoSave(ctx, sqlc.DeleteVideoSaveParams{VideoID: videoID, UserID: userID})
	switch {
	case delErr == nil:
		if err := q.DecrementVideoSavesCount(ctx, videoID); err != nil {
			return false, err
		}
		return false, tx.Commit(ctx)
	case errors.Is(delErr, pgx.ErrNoRows):
		_, insErr := q.InsertVideoSave(ctx, sqlc.InsertVideoSaveParams{VideoID: videoID, UserID: userID})
		if insErr != nil && !errors.Is(insErr, pgx.ErrNoRows) {
			return false, insErr
		}
		if insErr == nil {
			if err := q.IncrementVideoSavesCount(ctx, videoID); err != nil {
				return false, err
			}
		}
		return true, tx.Commit(ctx)
	default:
		return false, delErr
	}
}
