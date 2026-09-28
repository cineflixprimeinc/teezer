// Shares mirrors VideoInteractionController::share(). Public route (guests
// allowed, matching the real route's optional-auth middleware) - a logged
// -in user's share is deduped to once per video per day; guests have no
// identity to dedupe against, so every guest share call counts (same as
// Laravel).
//
// NOT ported: NotificationService::notify (aggregated "X and N others
// shared your video").
//
// RealtimeBus::publish IS ported (see internal/events) - fires video.shared
// ONLY on a genuinely new share (never on a signed-in user's deduped repeat
// for the day, and never merely from the share sheet opening).
package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/events"
	"teezer/backend-go/internal/sqlc"
)

var validSharePlatforms = map[string]bool{
	"whatsapp": true, "instagram": true, "telegram": true, "twitter": true,
	"facebook": true, "copy_link": true, "native": true, "other": true,
}

type ShareHandler struct {
	queries *sqlc.Queries
	events  *events.Publisher
}

func NewShareHandler(q *sqlc.Queries, pub *events.Publisher) *ShareHandler {
	return &ShareHandler{queries: q, events: pub}
}

type shareRequest struct {
	Platform string `json:"platform"`
}

func (h *ShareHandler) Share(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}

	var req shareRequest
	if err := c.BodyParser(&req); err != nil || !validSharePlatforms[req.Platform] {
		return validationError(c, "platform", "The selected platform is invalid.")
	}

	ctx := c.Context()
	if _, err := h.queries.GetInteractableVideoForUpdate(ctx, videoID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	userID := auth.UserID(c) // 0 => guest, matches $request->user()?->id

	if userID != 0 {
		alreadyShared, err := h.queries.HasSharedRecently(ctx, sqlc.HasSharedRecentlyParams{VideoID: videoID, UserID: pgtype.Int8{Int64: userID, Valid: true}})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if alreadyShared {
			count, err := h.queries.GetVideoSharesCount(ctx, videoID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
			}
			return c.JSON(fiber.Map{"success": true, "shares_count": count})
		}
	}

	var userIDParam pgtype.Int8
	if userID != 0 {
		userIDParam = pgtype.Int8{Int64: userID, Valid: true}
	}
	if err := h.queries.InsertVideoShare(ctx, sqlc.InsertVideoShareParams{
		VideoID: videoID, UserID: userIDParam, Platform: pgtype.Text{String: req.Platform, Valid: true},
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if err := h.queries.IncrementVideoSharesCount(ctx, videoID); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	count, err := h.queries.GetVideoSharesCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	h.events.Publish(events.NewVideoShared(videoID, count))
	return c.JSON(fiber.Map{"success": true, "shares_count": count})
}
