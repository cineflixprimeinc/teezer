// Highlights CRUD from App\Http\Controllers\Api\ProfileController: GET, POST,
// PUT /{id} and DELETE /{id} under /profile/highlights.
//
// Like social links these hand back the raw Highlight model, so the payload is
// every column in Eloquent's own date format (toEloquentJSON). Every lookup is
// scoped to the owner via findOrFail, so another user's highlight is a 404.
//
// DIVERGENCE, deliberate: a non-numeric {id} (PUT /profile/highlights/abc)
// answers 404 here, where Laravel answers 500. Its route carries no
// whereNumber() constraint - unlike the hidden-words routes beside it - so
// "abc" reaches updateHighlight(Request, int $id) and PHP raises a TypeError
// before findOrFail ever runs. 404 is what that lookup would have returned;
// reproducing an uncaught crash byte-for-byte would be mirroring a bug, not the
// contract. Every other status and body on these four routes is identical
// (verified live against Laravel).
package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

/* ── GET /profile/highlights ────────────────────────────────────────── */

func (h *ProfileHandler) Highlights(c *fiber.Ctx) error {
	rows, err := h.queries.ListHighlights(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	out := make([]fiber.Map, 0, len(rows))
	for _, hl := range rows {
		out = append(out, renderHighlight(hl))
	}
	return c.JSON(fiber.Map{"success": true, "data": out})
}

/* ── POST /profile/highlights ───────────────────────────────────────── */

func (h *ProfileHandler) StoreHighlight(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "title", "The title field is required.")
	}

	// 'title' => required|string|max:50
	raw, ok := body["title"]
	if !ok || isJSONNull(raw) {
		return validationError(c, "title", "The title field is required.")
	}
	title, err := jsonString(raw)
	if err != nil {
		return validationError(c, "title", "The title field must be a string.")
	}
	if title == "" {
		return validationError(c, "title", "The title field is required.")
	}
	if len(title) > 50 {
		return validationError(c, "title", "The title field must not be greater than 50 characters.")
	}

	cover, perr := parseCoverURL(body)
	if perr != nil {
		return perr.send(c)
	}

	// sort_order is the current count, so a new highlight lands last.
	count, err := h.queries.CountHighlights(ctx, userID)
	if err != nil {
		return serverError(c)
	}

	created, err := h.queries.CreateHighlight(ctx, sqlc.CreateHighlightParams{
		UserID:    userID,
		Title:     title,
		CoverUrl:  cover,
		SortOrder: int16(count),
	})
	if err != nil {
		return serverError(c)
	}
	return c.Status(fiber.StatusCreated).JSON(fiber.Map{"success": true, "data": renderHighlight(created)})
}

/* ── PUT /profile/highlights/{id} ───────────────────────────────────── */

func (h *ProfileHandler) UpdateHighlight(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	id, ok := highlightID(c)
	if !ok {
		return notFound(c)
	}

	body, err := parseJSONBody(c)
	if err != nil {
		return validationError(c, "title", "The title field must be a string.")
	}

	set := map[string]any{}

	// 'title' => sometimes|string|max:50
	if raw, present := body["title"]; present {
		title, err := jsonString(raw)
		if err != nil {
			return validationError(c, "title", "The title field must be a string.")
		}
		if len(title) > 50 {
			return validationError(c, "title", "The title field must not be greater than 50 characters.")
		}
		set["title"] = title
	}

	// 'cover_url' => nullable|url. update($request->only([...])) writes it only
	// when the key is there, and an explicit null clears the column.
	if raw, present := body["cover_url"]; present {
		cover, perr := parseCoverURL(map[string]json.RawMessage{"cover_url": raw})
		if perr != nil {
			return perr.send(c)
		}
		set["cover_url"] = nullableTextValue(cover)
	}

	// findOrFail runs before the update, so a bad id is a 404 even when the
	// body would have changed nothing.
	if _, err := h.queries.GetHighlightForOwner(ctx, sqlc.GetHighlightForOwnerParams{ID: id, UserID: userID}); err != nil {
		if isNoRows(err) {
			return notFound(c)
		}
		return serverError(c)
	}

	if len(set) > 0 {
		if err := applyHighlightUpdates(ctx, h.pool, id, userID, set); err != nil {
			return serverError(c)
		}
	}

	fresh, err := h.queries.GetHighlightForOwner(ctx, sqlc.GetHighlightForOwnerParams{ID: id, UserID: userID})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": renderHighlight(fresh)})
}

/* ── DELETE /profile/highlights/{id} ────────────────────────────────── */

func (h *ProfileHandler) DestroyHighlight(c *fiber.Ctx) error {
	ctx := c.Context()
	userID := auth.UserID(c)

	id, ok := highlightID(c)
	if !ok {
		return notFound(c)
	}
	if _, err := h.queries.GetHighlightForOwner(ctx, sqlc.GetHighlightForOwnerParams{ID: id, UserID: userID}); err != nil {
		if isNoRows(err) {
			return notFound(c)
		}
		return serverError(c)
	}
	if err := h.queries.DeleteHighlight(ctx, sqlc.DeleteHighlightParams{ID: id, UserID: userID}); err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true})
}

/* ── helpers ────────────────────────────────────────────────────────── */

// highlightID reads the {id} segment. The route is not whereNumber-constrained
// in Laravel, so a non-numeric id reaches findOrFail and 404s.
func highlightID(c *fiber.Ctx) (int64, bool) {
	var id int64
	if _, err := fmt.Sscanf(strings.TrimSpace(c.Params("id")), "%d", &id); err != nil {
		return 0, false
	}
	return id, true
}

// parseCoverURL applies 'cover_url' => ['nullable', 'url']: absent or null is
// allowed, anything else must satisfy Laravel's url rule (see laravelIsURL).
func parseCoverURL(body map[string]json.RawMessage) (pgtype.Text, *prefError) {
	raw, present := body["cover_url"]
	if !present || isJSONNull(raw) {
		return pgtype.Text{}, nil
	}
	s, err := jsonString(raw)
	if err != nil {
		return pgtype.Text{}, fieldFailure("cover_url", "The cover url field must be a string.")
	}
	if s == "" { // '' is not null, and the url rule rejects it
		return pgtype.Text{}, fieldFailure("cover_url", "The cover url field must be a valid URL.")
	}
	if !laravelIsURL(s) {
		return pgtype.Text{}, fieldFailure("cover_url", "The cover url field must be a valid URL.")
	}
	return pgtype.Text{String: s, Valid: true}, nil
}

func nullableTextValue(t pgtype.Text) any {
	if !t.Valid {
		return nil
	}
	return t.String
}

var highlightUpdatableColumns = map[string]struct{}{"title": {}, "cover_url": {}}

// applyHighlightUpdates is $highlight->update($request->only(['title',
// 'cover_url'])) - only the keys the request carried, plus the updated_at bump
// Eloquent adds. Column names come from the allowlist, never the request.
func applyHighlightUpdates(ctx context.Context, pool *pgxpool.Pool, id, userID int64, set map[string]any) error {
	assignments, args, err := buildAssignments(set, highlightUpdatableColumns)
	if err != nil {
		return err
	}
	if len(assignments) == 0 {
		return nil
	}
	assignments = append(assignments, "updated_at = now()")
	args = append(args, id, userID)

	sql := fmt.Sprintf("UPDATE highlights SET %s WHERE id = $%d AND user_id = $%d",
		strings.Join(assignments, ", "), len(args)-1, len(args))
	_, err = pool.Exec(ctx, sql, args...)
	return err
}

func renderHighlight(hl sqlc.Highlight) fiber.Map {
	return fiber.Map{
		"id":         hl.ID,
		"user_id":    hl.UserID,
		"title":      hl.Title,
		"cover_url":  nullableText(hl.CoverUrl),
		"sort_order": hl.SortOrder,
		"created_at": toEloquentJSON(hl.CreatedAt),
		"updated_at": toEloquentJSON(hl.UpdatedAt),
	}
}
