// Explore (read) mirrors App\Http\Controllers\Api\ExploreController: the
// discovery surface behind the search screen and the explore tab. All four
// endpoints are public/OptionalAuth Postgres reads.
//
//   - trending():     FeedService::trending, same as /videos/trending but with
//     explore's leaner meta (no per_page) + a public Cache-Control.
//   - hashtags():     top-30 hashtags by lifetime count.
//   - hashtagVideos(): published videos under one tag, most-viewed first.
//   - search():       multi-type ILIKE search (videos/users/hashtags).
//
// NOT ported here: the top-level /search (SearchController) - it proxies
// Meilisearch via SearchService, an external dependency that isn't provisioned
// and degrades to 503; it stays in Laravel.
package handlers

import (
	"errors"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

type ExploreHandler struct {
	queries       *sqlc.Queries
	mediaBaseURL  string
	signingSecret string
	users         *UsersHandler // reused for renderUserList (search users)
}

func NewExploreHandler(q *sqlc.Queries, mediaBaseURL, signingSecret string, users *UsersHandler) *ExploreHandler {
	return &ExploreHandler{queries: q, mediaBaseURL: mediaBaseURL, signingSecret: signingSecret, users: users}
}

/* ── GET /explore/trending ──────────────────────────────────────────── */

// Trending mirrors ExploreController::trending -> FeedService::trending: the same
// last-7-days most-viewed feed as /videos/trending. Differs from that route only
// in the meta (current_page/last_page/total, no per_page) and the public
// Cache-Control header (Laravel caches the page 15 min; the Go path computes it
// live and just advertises the same freshness window to the browser/CDN).
func (h *ExploreHandler) Trending(c *fiber.Ctx) error {
	ctx := c.Context()
	authUserID := auth.UserID(c)
	perPage := parsePositiveQuery(c.Query("per_page"), 20)
	page := parsePositiveQuery(c.Query("page"), 1)

	cutoff := pgtype.Timestamp{Time: time.Now().UTC().AddDate(0, 0, -7), Valid: true}

	total, err := h.queries.CountTrendingVideos(ctx, cutoff)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListTrendingVideos(ctx, sqlc.ListTrendingVideosParams{
		Cutoff: cutoff, RowLimit: int32(perPage), RowOffset: int32((page - 1) * perPage),
	})
	if err != nil {
		return serverError(c)
	}
	videos := make([]sqlc.GetVideoForShowRow, len(rows))
	for i, r := range rows {
		videos[i] = sqlc.GetVideoForShowRow(r)
	}

	data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{
		loadUser: true, loadHashtags: true, loadVisibleCounts: true,
		loadAudio: true, loadMusic: true, loadTagged: true,
	})
	if err != nil {
		return serverError(c)
	}

	c.Set("Cache-Control", "public, max-age=900, stale-while-revalidate=3600")
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": pageMeta(page, total, perPage)})
}

/* ── GET /explore/hashtags ──────────────────────────────────────────── */

// Hashtags mirrors ExploreController::hashtags - the top-30 tags by lifetime
// video count (Laravel caches for an hour; served live here + a public
// Cache-Control matching that window).
func (h *ExploreHandler) Hashtags(c *fiber.Ctx) error {
	rows, err := h.queries.ExploreTopHashtags(c.Context())
	if err != nil {
		return serverError(c)
	}
	data := make([]fiber.Map, len(rows))
	for i, r := range rows {
		data[i] = fiber.Map{"id": r.ID, "name": r.Name, "videos_count": r.VideosCount}
	}
	c.Set("Cache-Control", "public, max-age=1800")
	return c.JSON(fiber.Map{"success": true, "data": data})
}

/* ── GET /explore/hashtags/{name} ───────────────────────────────────── */

// HashtagVideos mirrors ExploreController::hashtagVideos - a firstOrFail on the
// lowercased name (404 when unknown), then its published videos most-viewed
// first. Eager loads user.profile + hashtags + visible-comment counts.
func (h *ExploreHandler) HashtagVideos(c *fiber.Ctx) error {
	ctx := c.Context()
	name := strings.ToLower(c.Params("name"))

	hashtag, err := h.queries.GetHashtagByName(ctx, name)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return serverError(c)
	}

	authUserID := auth.UserID(c)
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountHashtagVideos(ctx, hashtag.ID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListHashtagVideos(ctx, sqlc.ListHashtagVideosParams{
		HashtagID: hashtag.ID, RowLimit: int32(videoPerPage), RowOffset: int32((page - 1) * videoPerPage),
	})
	if err != nil {
		return serverError(c)
	}
	videos := make([]sqlc.GetVideoForShowRow, len(rows))
	for i, r := range rows {
		videos[i] = sqlc.GetVideoForShowRow(r)
	}

	data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{
		loadUser: true, loadHashtags: true, loadVisibleCounts: true,
	})
	if err != nil {
		return serverError(c)
	}

	meta := pageMeta(page, total, videoPerPage)
	meta["hashtag"] = fiber.Map{"id": hashtag.ID, "name": hashtag.Name, "videos_count": hashtag.VideosCount}
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": meta})
}

/* ── GET /explore/search ────────────────────────────────────────────── */

// Search mirrors ExploreController::search - a straight ILIKE over videos
// (caption), users (username/name), and hashtags (name), each capped at 10 and
// included only when the type filter selects it. type in all|videos|users|
// hashtags (default all).
func (h *ExploreHandler) Search(c *fiber.Ctx) error {
	ctx := c.Context()
	q := c.Query("q")
	switch {
	case q == "":
		return validationError(c, "q", "The q field is required.")
	case len([]rune(q)) > 100:
		return validationError(c, "q", "The q field must not be greater than 100 characters.")
	}
	typ := c.Query("type", "all")
	switch typ {
	case "all", "videos", "users", "hashtags":
	default:
		return validationError(c, "type", "The selected type is invalid.")
	}

	qParam := pgtype.Text{String: q, Valid: true}
	authUserID := auth.UserID(c)
	result := fiber.Map{}

	if typ == "all" || typ == "videos" {
		rows, err := h.queries.SearchVideosByCaption(ctx, qParam)
		if err != nil {
			return serverError(c)
		}
		videos := make([]sqlc.GetVideoForShowRow, len(rows))
		for i, r := range rows {
			videos[i] = sqlc.GetVideoForShowRow(r)
		}
		// with(['user.profile']) + withVisibleCommentsCount - no hashtags/audio/music/tagged.
		data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{
			loadUser: true, loadVisibleCounts: true,
		})
		if err != nil {
			return serverError(c)
		}
		result["videos"] = data
	}

	if typ == "all" || typ == "users" {
		rows, err := h.queries.SearchUsers(ctx, qParam)
		if err != nil {
			return serverError(c)
		}
		users := make([]sqlc.GetUserForShowRow, len(rows))
		for i, r := range rows {
			users[i] = sqlc.GetUserForShowRow(r)
		}
		data, err := h.users.renderUserList(ctx, users, authUserID, userListOpts{})
		if err != nil {
			return serverError(c)
		}
		result["users"] = data
	}

	if typ == "all" || typ == "hashtags" {
		rows, err := h.queries.SearchHashtags(ctx, qParam)
		if err != nil {
			return serverError(c)
		}
		data := make([]fiber.Map, len(rows))
		for i, r := range rows {
			data[i] = fiber.Map{"id": r.ID, "name": r.Name, "videos_count": r.VideosCount}
		}
		result["hashtags"] = data
	}

	return c.JSON(fiber.Map{"success": true, "data": result})
}
