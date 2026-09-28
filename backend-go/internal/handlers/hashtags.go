// Hashtags (read) mirrors App\Http\Controllers\Api\HashtagController's public
// trending endpoint. Ported: trending(). NOT ported: feedTrending() (the
// country-scored /feed/trending-hashtags variant - its own follow-up) and any
// write paths.
package handlers

import (
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/sqlc"
)

type HashtagsHandler struct {
	queries *sqlc.Queries
}

func NewHashtagsHandler(q *sqlc.Queries) *HashtagsHandler {
	return &HashtagsHandler{queries: q}
}

/* ── GET /hashtags/trending ─────────────────────────────────────────── */

// Trending mirrors HashtagController::trending - the tags used most across
// published videos posted in the last `days` days, falling back to lifetime
// counts when the recent window is empty. days in 1..90 (default 7), limit in
// 1..50 (default 8). Laravel caches the resolved rows 15 min; served live here
// with a matching public Cache-Control.
func (h *HashtagsHandler) Trending(c *fiber.Ctx) error {
	ctx := c.Context()

	days, err := intQueryInRange(c.Query("days"), 7, 1, 90, "days")
	if err != nil {
		return err(c)
	}
	limit, err := intQueryInRange(c.Query("limit"), 8, 1, 50, "limit")
	if err != nil {
		return err(c)
	}

	cutoff := pgtype.Timestamp{Time: time.Now().UTC().AddDate(0, 0, -days), Valid: true}

	type row struct {
		id    int64
		name  string
		count int64
	}
	var rows []row

	recent, qerr := h.queries.TrendingHashtagsRecent(ctx, sqlc.TrendingHashtagsRecentParams{
		Cutoff: cutoff, RowLimit: int32(limit),
	})
	if qerr != nil {
		return serverError(c)
	}
	for _, r := range recent {
		rows = append(rows, row{id: r.ID, name: r.Name, count: r.RecentCount})
	}

	// Lifetime fallback when no recent activity (mirrors the controller's empty check).
	if len(rows) == 0 {
		lifetime, qerr := h.queries.TrendingHashtagsLifetime(ctx, int32(limit))
		if qerr != nil {
			return serverError(c)
		}
		for _, r := range lifetime {
			rows = append(rows, row{id: r.ID, name: r.Name, count: r.RecentCount})
		}
	}

	data := make([]fiber.Map, len(rows))
	for i, r := range rows {
		data[i] = fiber.Map{
			"id":              r.id,
			"hashtag":         "#" + r.name,
			"name":            r.name,
			"count":           r.count,
			"display_count":   compactCount(r.count) + " posts",
			"trend_direction": "up", // placeholder; matches the controller
		}
	}

	c.Set("Cache-Control", "public, max-age=900")
	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"meta":    fiber.Map{"days": days, "limit": limit, "returned": len(data)},
	})
}

// intQueryInRange parses an optional integer query param, applying `def` when
// absent and 422ing (via the returned deferred responder) when present but not a
// valid integer or outside [min,max] - matching Laravel's
// nullable|integer|min|max rule. The two-return shape lets callers early-return
// the error without a nil-check dance.
func intQueryInRange(raw string, def, min, max int, field string) (int, func(*fiber.Ctx) error) {
	if strings.TrimSpace(raw) == "" {
		return def, nil
	}
	n, convErr := strconv.Atoi(strings.TrimSpace(raw))
	if convErr != nil {
		return 0, func(c *fiber.Ctx) error {
			return validationError(c, field, "The "+field+" field must be an integer.")
		}
	}
	if n < min {
		return 0, func(c *fiber.Ctx) error {
			return validationError(c, field, "The "+field+" field must be at least "+strconv.Itoa(min)+".")
		}
	}
	if n > max {
		return 0, func(c *fiber.Ctx) error {
			return validationError(c, field, "The "+field+" field must not be greater than "+strconv.Itoa(max)+".")
		}
	}
	return n, nil
}

// compactCount mirrors HashtagController::compact - 1.5K / 2.3M with a trailing
// ".0" and lone "." trimmed (1000 -> "1K", 1_500_000 -> "1.5M").
func compactCount(n int64) string {
	switch {
	case n >= 1_000_000:
		return trimTrailingZero(float64(n)/1_000_000) + "M"
	case n >= 1_000:
		return trimTrailingZero(float64(n)/1_000) + "K"
	default:
		return strconv.FormatInt(n, 10)
	}
}

func trimTrailingZero(f float64) string {
	s := strconv.FormatFloat(f, 'f', 1, 64)
	s = strings.TrimRight(s, "0")
	s = strings.TrimRight(s, ".")
	return s
}
