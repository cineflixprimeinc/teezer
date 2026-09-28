// Reports mirrors VideoInteractionController::report(): a logged-in user
// flags a video for moderation. One report per (video, reporter) - a repeat
// attempt returns 422 without inserting a duplicate row. Scoped to
// interactable videos (published, not moderation-rejected) via the non-
// locking GetInteractableVideo, matching Laravel's interactableVideo().
//
// The reason set intentionally includes "harassment": the original
// video_reports enum was extended by migration 2026_05_27_000001, and the
// controller validates against the extended list.
//
// NOT ported: the admin-side moderation review workflow (status transitions,
// reviewed_by/reviewed_at) - that lives in AdminReportsController and is a
// separate surface.
package handlers

import (
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

var validReportReasons = map[string]bool{
	"spam": true, "nudity": true, "hate": true, "misinformation": true,
	"violence": true, "copyright": true, "harassment": true, "other": true,
}

type ReportsHandler struct {
	queries *sqlc.Queries
}

func NewReportsHandler(q *sqlc.Queries) *ReportsHandler {
	return &ReportsHandler{queries: q}
}

type reportRequest struct {
	Reason      string `json:"reason"`
	Description string `json:"description"`
}

func (h *ReportsHandler) Report(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}

	var req reportRequest
	if err := c.BodyParser(&req); err != nil {
		return validationError(c, "reason", "The reason field is required.")
	}
	if req.Reason == "" {
		return validationError(c, "reason", "The reason field is required.")
	}
	if !validReportReasons[req.Reason] {
		return validationError(c, "reason", "The selected reason is invalid.")
	}
	// nullable|string|max:500 - only length is enforceable here (an absent
	// description is valid). Laravel counts characters; BodyParser gives us a
	// UTF-8 string, so rune count matches PHP's mb-aware max rule.
	if len([]rune(req.Description)) > 500 {
		return validationError(c, "description", "The description field must not be greater than 500 characters.")
	}

	ctx := c.Context()
	if _, err := h.queries.GetInteractableVideo(ctx, videoID); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	userID := auth.UserID(c)

	already, err := h.queries.ExistsVideoReport(ctx, sqlc.ExistsVideoReportParams{VideoID: videoID, ReporterID: userID})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if already {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false, "message": "You have already reported this video.",
		})
	}

	var description pgtype.Text
	if req.Description != "" {
		description = pgtype.Text{String: req.Description, Valid: true}
	}
	if err := h.queries.InsertVideoReport(ctx, sqlc.InsertVideoReportParams{
		VideoID: videoID, ReporterID: userID, Reason: req.Reason, Description: description,
	}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	return c.JSON(fiber.Map{"success": true, "message": "Report submitted. Thank you."})
}
