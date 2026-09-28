// Watch history (read) mirrors App\Http\Controllers\Api\WatchHistoryController's
// GET endpoints - the History screen's list + widgets. These use bespoke
// projections (not VideoResource), so they render inline rather than through
// renderVideoList.
//
//   - list():             paginated unique-video history, newest watch first.
//   - summary():          today's watch-time / videos / replays + top category.
//   - continueWatching():  up to 4 in-progress videos (0 < completion < 90).
//   - creators():         top-10 recently-watched creators + follow status.
//   - getSettings():      the save_watch_history flag.
//
// NOT ported: the write side - updateSettings (PATCH), clearAll + removeVideo
// (DELETE) - stays in Laravel.
package handlers

import (
	"errors"
	"fmt"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

type HistoryHandler struct {
	queries      *sqlc.Queries
	mediaBaseURL string
}

func NewHistoryHandler(q *sqlc.Queries, mediaBaseURL string) *HistoryHandler {
	return &HistoryHandler{queries: q, mediaBaseURL: mediaBaseURL}
}

/* ── GET /history ───────────────────────────────────────────────────── */

func (h *HistoryHandler) List(c *fiber.Ctx) error {
	ctx := c.Context()
	uid := pgtype.Int8{Int64: auth.UserID(c), Valid: true}

	// per_page defaults to 20 and is capped at 50 (min(input, 50)).
	perPage := parsePositiveQuery(c.Query("per_page"), 20)
	if perPage > 50 {
		perPage = 50
	}
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountWatchHistory(ctx, uid)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListWatchHistory(ctx, sqlc.ListWatchHistoryParams{
		UserID: uid, RowLimit: int32(perPage), RowOffset: int32((page - 1) * perPage),
	})
	if err != nil {
		return serverError(c)
	}

	data := make([]fiber.Map, len(rows))
	for i, r := range rows {
		durationSecs := 0
		if r.Duration.Valid {
			durationSecs = int(r.Duration.Int16)
		}
		// Classify by duration: <90s (and >0) is a Reel, everything else a Video.
		typ := "Videos"
		if durationSecs > 0 && durationSecs < 90 {
			typ = "Reels"
		}
		var thumb any
		if r.ThumbnailUrl.Valid && r.ThumbnailUrl.String != "" {
			thumb = mediaJoin(h.mediaBaseURL, r.ThumbnailUrl.String)
		}
		data[i] = fiber.Map{
			"id":               r.ID,
			"video_id":         r.VideoID,
			"title":            nullableText(r.Title),
			"creator":          r.Creator,
			"creator_username": r.CreatorUsername,
			"verified":         r.IsVerified,
			"views_count":      r.ViewsCount,
			"duration_secs":    durationSecs,
			"thumbnail_url":    thumb,
			"watched_at":       toIso8601(r.WatchedAt),
			"type":             typ,
		}
	}

	meta := pageMeta(page, total, perPage)
	meta["per_page"] = perPage
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": meta})
}

/* ── GET /history/summary ───────────────────────────────────────────── */

func (h *HistoryHandler) Summary(c *fiber.Ctx) error {
	ctx := c.Context()
	uid := pgtype.Int8{Int64: auth.UserID(c), Valid: true}

	// "today" as a UTC day window [start, next-day-start) - matches whereDate under
	// the app's UTC timezone, and indexes better than DATE(created_at).
	now := time.Now().UTC()
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	start := pgtype.Timestamp{Time: dayStart, Valid: true}
	end := pgtype.Timestamp{Time: dayStart.AddDate(0, 0, 1), Valid: true}

	sum, err := h.queries.WatchHistorySummaryToday(ctx, sqlc.WatchHistorySummaryTodayParams{
		UserID: uid, DayStart: start, DayEnd: end,
	})
	if err != nil {
		return serverError(c)
	}
	replays, err := h.queries.WatchHistoryLiveReplaysToday(ctx, sqlc.WatchHistoryLiveReplaysTodayParams{
		UserID: uid, DayStart: start, DayEnd: end,
	})
	if err != nil {
		return serverError(c)
	}

	var topCategory any
	if cat, err := h.queries.WatchHistoryTopCategory(ctx, uid); err == nil {
		if cat.Valid {
			topCategory = cat.String
		}
	} else if !errors.Is(err, pgx.ErrNoRows) { // no rows -> null, like ->first()
		return serverError(c)
	}

	// h m formatting: "1h 5m", or "5m", or "0m".
	hours := sum.WatchSeconds / 3600
	mins := (sum.WatchSeconds % 3600) / 60
	watchFormatted := "0m"
	if hours > 0 {
		watchFormatted = fmt.Sprintf("%dh %dm", hours, mins)
	} else if mins > 0 {
		watchFormatted = fmt.Sprintf("%dm", mins)
	}

	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{
		"total_watched_today":  watchFormatted,
		"videos_watched_today": sum.VideosCount,
		"live_replays_watched": replays,
		"top_category":         topCategory,
	}})
}

/* ── GET /history/continue-watching ─────────────────────────────────── */

func (h *HistoryHandler) ContinueWatching(c *fiber.Ctx) error {
	ctx := c.Context()
	rows, err := h.queries.ContinueWatching(ctx, pgtype.Int8{Int64: auth.UserID(c), Valid: true})
	if err != nil {
		return serverError(c)
	}

	data := make([]fiber.Map, 0, len(rows))
	for _, r := range rows {
		// (int) cast of the payload's watch_duration (float8, COALESCEd to 0).
		watched := 0
		if wd, ok := r.WatchDuration.(float64); ok {
			watched = int(wd)
		}
		total := 0
		if r.Duration.Valid {
			total = int(r.Duration.Int16)
		}
		remaining := total - watched
		if remaining < 0 {
			remaining = 0
		}
		remainingStr := "In progress"
		if total > 0 {
			remainingStr = fmt.Sprintf("%d:%02d remaining", remaining/60, remaining%60)
		}
		var thumb any
		if r.ThumbnailUrl.Valid && r.ThumbnailUrl.String != "" {
			thumb = mediaJoin(h.mediaBaseURL, r.ThumbnailUrl.String)
		}
		data = append(data, fiber.Map{
			"video_id":      r.VideoID,
			"title":         nullableText(r.Title),
			"thumbnail_url": thumb,
			"creator_name":  r.CreatorName,
			"progress":      int(round(r.CompletionPct, 0)),
			"remaining":     remainingStr,
			"resume_at":     watched,
		})
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

/* ── GET /history/creators ──────────────────────────────────────────── */

func (h *HistoryHandler) Creators(c *fiber.Ctx) error {
	ctx := c.Context()
	uid := auth.UserID(c)

	rows, err := h.queries.WatchHistoryCreators(ctx, pgtype.Int8{Int64: uid, Valid: true})
	if err != nil {
		return serverError(c)
	}

	// Batch the viewer's follow set (any status, matching Follower::whereIn).
	followed := map[int64]bool{}
	if len(rows) > 0 {
		ids := make([]int64, len(rows))
		for i, r := range rows {
			ids[i] = r.ID
		}
		fids, err := h.queries.ListFollowedCreatorIDs(ctx, sqlc.ListFollowedCreatorIDsParams{FollowerID: uid, Column2: ids})
		if err != nil {
			return serverError(c)
		}
		for _, id := range fids {
			followed[id] = true
		}
	}

	data := make([]fiber.Map, len(rows))
	for i, r := range rows {
		var avatar any
		if r.Avatar.Valid && r.Avatar.String != "" {
			avatar = mediaJoin(h.mediaBaseURL, r.Avatar.String)
		}
		data[i] = fiber.Map{
			"id":           r.ID,
			"name":         r.Name,
			"username":     r.Username,
			"avatar":       avatar,
			"is_verified":  r.IsVerified,
			"is_following": followed[r.ID],
			"watch_count":  r.WatchCount,
		}
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

/* ── GET /history/settings ──────────────────────────────────────────── */

func (h *HistoryHandler) GetSettings(c *fiber.Ctx) error {
	save, err := h.queries.GetSaveWatchHistory(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"save_watch_history": save}})
}
