// Stories read surface - App\Http\Controllers\Api\StoryController::feed and
// activeUserIds. The write and action paths (store/fromVideo/view/react/reply/
// report/destroy) stay in Laravel: they write media, record views, and notify
// via NotificationService - the deferred cross-service deps.
//
// feed() is the stories equivalent of the VideoResource chunk: one grouped-by-
// author payload with per-slide media and text/mention layers, and shared-video
// media signed the same way VideoResource signs private CDN URLs.
package handlers

import (
	"context"
	"sort"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/events"
	"teezer/backend-go/internal/sqlc"
	"teezer/backend-go/internal/storage"
)

type StoriesHandler struct {
	queries       *sqlc.Queries
	mediaBaseURL  string
	signingSecret string
	// Nil when NATS is unconfigured; the write paths (stories_write.go) treat a
	// nil publisher as "record but don't broadcast" rather than failing the
	// request - a missing event bus must never lose a view or a reaction.
	events *events.Publisher
	// Object storage for story media uploads (stories_create.go). Unlike the
	// event bus this is NOT optional: creation 500s when it is unconfigured
	// rather than writing a story row with no media behind it.
	storage *storage.Service
}

func NewStoriesHandler(q *sqlc.Queries, mediaBaseURL, signingSecret string, pub *events.Publisher, store *storage.Service) *StoriesHandler {
	return &StoriesHandler{
		queries: q, mediaBaseURL: mediaBaseURL, signingSecret: signingSecret,
		events: pub, storage: store,
	}
}

// storyMediaTTL is StoryController::signedMediaUrl's now()->addMinutes(1440).
const storyMediaTTL = 1440

/* ── GET /stories/active-user-ids ───────────────────────────────────── */

func (h *StoriesHandler) ActiveUserIDs(c *fiber.Ctx) error {
	ids, err := h.queries.ListActiveStoryUserIds(c.Context())
	if err != nil {
		return serverError(c)
	}
	// json.Marshal of a nil slice is null; Laravel returns []. Guarantee [].
	if ids == nil {
		ids = []int64{}
	}
	return c.JSON(fiber.Map{"success": true, "data": ids})
}

/* ── GET /stories/feed ──────────────────────────────────────────────── */

func (h *StoriesHandler) Feed(c *fiber.Ctx) error {
	ctx := c.Context()
	me := auth.UserID(c)
	limit := clampInt(c.QueryInt("limit", 20), 0, 50)

	following, err := h.queries.ListAcceptedFollowingIDs(ctx, me)
	if err != nil {
		return serverError(c)
	}
	userIDs := append([]int64{me}, following...)

	stories, err := h.queries.ListFeedStories(ctx, sqlc.ListFeedStoriesParams{
		Column1: userIDs, // user_id = ANY($1)
		UserID:  me,      // own stories at any visibility
	})
	if err != nil {
		return serverError(c)
	}
	if len(stories) == 0 {
		return c.JSON(fiber.Map{"success": true, "data": []any{}})
	}

	storyIDs := make([]int64, len(stories))
	for i, s := range stories {
		storyIDs[i] = s.ID
	}

	// Batch the three relations, then group in memory - one round trip each.
	mediaRows, err := h.queries.ListStoryMediaForStories(ctx, storyIDs)
	if err != nil {
		return serverError(c)
	}
	layerRows, err := h.queries.ListStoryLayersForStories(ctx, storyIDs)
	if err != nil {
		return serverError(c)
	}
	viewed, err := h.queries.ListViewedStoryIDs(ctx, sqlc.ListViewedStoryIDsParams{ViewerID: me, Column2: storyIDs})
	if err != nil {
		return serverError(c)
	}

	mediaBy := map[int64][]sqlc.StoryMedium{}
	for _, m := range mediaRows {
		mediaBy[m.StoryID] = append(mediaBy[m.StoryID], m)
	}
	layersBy := map[int64][]sqlc.ListStoryLayersForStoriesRow{}
	for _, l := range layerRows {
		layersBy[l.StoryID] = append(layersBy[l.StoryID], l)
	}
	seen := make(map[int64]struct{}, len(viewed))
	for _, id := range viewed {
		seen[id] = struct{}{}
	}

	// Group by author, preserving first-seen order (stories arrive newest-first,
	// so a group's position is its most recent story - what the sort below keeps
	// as the tie-breaker).
	type group struct {
		row       sqlc.ListFeedStoriesRow
		stories   []fiber.Map
		hasUnseen bool
	}
	order := []int64{}
	groups := map[int64]*group{}
	for _, s := range stories {
		g := groups[s.UserID]
		if g == nil {
			g = &group{row: s}
			groups[s.UserID] = g
			order = append(order, s.UserID)
		}
		g.stories = append(g.stories, h.formatStory(feedRowToStory(s), mediaBy[s.ID], layersBy[s.ID]))
		if _, ok := seen[s.ID]; !ok {
			g.hasUnseen = true
		}
	}

	result := make([]fiber.Map, 0, len(order))
	for _, uid := range order {
		g := groups[uid]
		var avatar any
		if g.row.AuthorAvatar.Valid && g.row.AuthorAvatar.String != "" {
			avatar = mediaJoin(h.mediaBaseURL, g.row.AuthorAvatar.String)
		}
		result = append(result, fiber.Map{
			"user": fiber.Map{
				"id":           uid,
				"username":     g.row.AuthorUsername,
				"display_name": g.row.AuthorName,
				"avatar":       avatar,
				"is_verified":  g.row.AuthorVerified,
			},
			"stories":    g.stories,
			"has_unseen": g.hasUnseen,
			"is_own":     uid == me,
		})
	}

	// Own first, then unseen first; stable so the newest-story ordering holds
	// within each bucket (PHP 8's usort is stable, and this mirrors it).
	sort.SliceStable(result, func(i, j int) bool {
		oi, oj := result[i]["is_own"].(bool), result[j]["is_own"].(bool)
		if oi != oj {
			return oi
		}
		ui, uj := result[i]["has_unseen"].(bool), result[j]["has_unseen"].(bool)
		if ui != uj {
			return ui
		}
		return false
	})

	if limit < len(result) {
		result = result[:limit]
	}
	return c.JSON(fiber.Map{"success": true, "data": result})
}

/* ── GET /stories/my ────────────────────────────────────────────────── */

func (h *StoriesHandler) MyStories(c *fiber.Ctx) error {
	rows, err := h.queries.ListMyActiveStories(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	data, err := h.renderStories(c.Context(), rows)
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

/* ── GET /stories/drafts ────────────────────────────────────────────── */

func (h *StoriesHandler) Drafts(c *fiber.Ctx) error {
	rows, err := h.queries.ListDraftStories(c.Context(), auth.UserID(c))
	if err != nil {
		return serverError(c)
	}
	data, err := h.renderStories(c.Context(), rows)
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data})
}

/* ── GET /stories/search-users ──────────────────────────────────────── */

// SearchUsers is the mention picker: a simplified user shape under a "users"
// key (not "data"). An empty query returns an empty list, not a 422.
func (h *StoriesHandler) SearchUsers(c *fiber.Ctx) error {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		return c.JSON(fiber.Map{"success": true, "users": []any{}})
	}

	rows, err := h.queries.SearchUsersForMention(c.Context(), pgtype.Text{String: q, Valid: true})
	if err != nil {
		return serverError(c)
	}
	users := make([]fiber.Map, 0, len(rows))
	for _, u := range rows {
		var avatar any
		if u.Avatar.Valid && u.Avatar.String != "" {
			avatar = mediaJoin(h.mediaBaseURL, u.Avatar.String)
		}
		users = append(users, fiber.Map{
			"id":          u.ID,
			"username":    u.Username,
			"name":        u.Name,
			"avatar":      avatar,
			"is_verified": u.IsVerified,
		})
	}
	return c.JSON(fiber.Map{"success": true, "users": users})
}

/* ── GET /stories/{id} ──────────────────────────────────────────────── */

func (h *StoriesHandler) Show(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := c.ParamsInt("id")
	if err != nil {
		return notFound(c)
	}

	story, err := h.queries.GetStoryForShow(ctx, int64(id))
	if err != nil {
		if isNoRows(err) {
			return notFound(c) // findOrFail
		}
		return serverError(c)
	}

	// canViewStory: owner always; otherwise live + visibility allows the viewer.
	if !h.canViewStory(ctx, story.UserID, story.Status, story.ExpiresAt, story.Visibility, auth.UserID(c)) {
		// show() returns a 404 with success:false, not bootstrap's 404 shape.
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Not found."})
	}

	media, layers, err := h.mediaAndLayers(ctx, []int64{story.ID})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": h.formatStory(story, media[story.ID], layers[story.ID])})
}

/* ── GET /users/{username}/stories ──────────────────────────────────── */

func (h *StoriesHandler) UserStories(c *fiber.Ctx) error {
	ctx := c.Context()
	me := auth.UserID(c) // 0 for a guest under OptionalAuth

	profile, err := h.queries.GetUserForStories(ctx, c.Params("username"))
	if err != nil {
		if isNoRows(err) {
			return notFound(c) // findOrFail (missing or banned)
		}
		return serverError(c)
	}

	// Private account: only the owner or an accepted follower sees stories.
	if profile.IsPrivate && me != profile.ID {
		ok := false
		if me != 0 {
			ok, err = h.queries.IsFollowingAccepted(ctx, sqlc.IsFollowingAcceptedParams{FollowerID: me, FollowingID: profile.ID})
			if err != nil {
				return serverError(c)
			}
		}
		if !ok {
			return c.JSON(fiber.Map{"success": true, "data": nil})
		}
	}

	rows, err := h.queries.ListPublishedStoriesForUser(ctx, profile.ID)
	if err != nil {
		return serverError(c)
	}
	if len(rows) == 0 {
		return c.JSON(fiber.Map{"success": true, "data": nil})
	}

	storyIDs := make([]int64, len(rows))
	for i, s := range rows {
		storyIDs[i] = s.ID
	}
	media, layers, err := h.mediaAndLayers(ctx, storyIDs)
	if err != nil {
		return serverError(c)
	}

	// has_unseen only means anything for a signed-in viewer.
	seen := map[int64]struct{}{}
	if me != 0 {
		viewed, err := h.queries.ListViewedStoryIDs(ctx, sqlc.ListViewedStoryIDsParams{ViewerID: me, Column2: storyIDs})
		if err != nil {
			return serverError(c)
		}
		for _, sid := range viewed {
			seen[sid] = struct{}{}
		}
	}

	rendered := make([]fiber.Map, 0, len(rows))
	hasUnseen := false
	for _, s := range rows {
		rendered = append(rendered, h.formatStory(s, media[s.ID], layers[s.ID]))
		if _, ok := seen[s.ID]; !ok {
			hasUnseen = true
		}
	}

	var avatar any
	if profile.Avatar.Valid && profile.Avatar.String != "" {
		avatar = mediaJoin(h.mediaBaseURL, profile.Avatar.String)
	}
	return c.JSON(fiber.Map{
		"success": true,
		"data": fiber.Map{
			"user": fiber.Map{
				"id":           profile.ID,
				"username":     profile.Username,
				"display_name": profile.Name,
				"avatar":       avatar,
				"is_verified":  profile.IsVerified,
			},
			"stories":    rendered,
			"has_unseen": hasUnseen,
			"is_own":     me != 0 && me == profile.ID,
		},
	})
}

/* ── GET /stories/{id}/analytics ────────────────────────────────────── */

func (h *StoriesHandler) Analytics(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	me := auth.UserID(c)

	owner, err := h.queries.GetStoryOwner(c.Context(), storyID)
	if err != nil {
		if isNoRows(err) {
			return notFound(c)
		}
		return serverError(c)
	}
	// Owner-only, same as Laravel's firstOrFail(where user_id=me).
	if owner.UserID != me {
		return notFound(c)
	}

	payload, err := h.refreshStoryAnalytics(c, storyID, me)
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": payload})
}

/* ── GET /stories/{id}/viewers ──────────────────────────────────────── */

func (h *StoriesHandler) Viewers(c *fiber.Ctx) error {
	ctx := c.Context()
	id, err := c.ParamsInt("id")
	if err != nil {
		return notFound(c)
	}
	storyID := int64(id)
	me := auth.UserID(c)

	// firstOrFail(where id, where user_id=me): only the owner sees the viewers.
	owner, err := h.queries.GetStoryOwner(ctx, storyID)
	if err != nil {
		if isNoRows(err) {
			return notFound(c)
		}
		return serverError(c)
	}
	if owner.UserID != me {
		return notFound(c)
	}

	rows, err := h.queries.ListStoryViewers(ctx, sqlc.ListStoryViewersParams{StoryID: storyID, ViewerID: me})
	if err != nil {
		return serverError(c)
	}

	viewers := make([]fiber.Map, 0, len(rows))
	for _, v := range rows {
		var avatar any
		if v.Avatar.Valid && v.Avatar.String != "" {
			avatar = mediaJoin(h.mediaBaseURL, v.Avatar.String)
		}
		viewers = append(viewers, fiber.Map{
			"id":            v.ID,
			"username":      v.Username,
			"display_name":  v.DisplayName,
			"avatar":        avatar,
			"is_verified":   v.IsVerified,
			"viewed_at":     rawTimestamp(v.ViewedAt),
			"reaction_type": nullableText(v.ReactionType),
			"replied":       v.Replied,
			"follows_me":    v.FollowsMe,
		})
	}

	/* The stat cards come from the analytics rollup, NOT from totalling the
	   list above - one computed answer, one shape, every surface (Laravel's
	   array_merge($analytics, ['total'=>unique_viewers, ...])). */
	payload, err := h.refreshStoryAnalytics(c, storyID, me)
	if err != nil {
		return serverError(c)
	}
	payload["total"] = payload["unique_viewers"]
	payload["reactions"] = payload["reaction_count"]
	payload["replies"] = payload["reply_count"]
	payload["shares"] = payload["share_count"]
	payload["viewers"] = viewers

	return c.JSON(fiber.Map{"success": true, "data": payload})
}

/* ── shared loaders ─────────────────────────────────────────────────── */

// mediaAndLayers batch-loads both relations for a set of story ids, keyed by
// story_id - the same O(1)-round-trips shape Feed uses.
func (h *StoriesHandler) mediaAndLayers(ctx context.Context, storyIDs []int64) (map[int64][]sqlc.StoryMedium, map[int64][]sqlc.ListStoryLayersForStoriesRow, error) {
	mediaRows, err := h.queries.ListStoryMediaForStories(ctx, storyIDs)
	if err != nil {
		return nil, nil, err
	}
	layerRows, err := h.queries.ListStoryLayersForStories(ctx, storyIDs)
	if err != nil {
		return nil, nil, err
	}
	mediaBy := map[int64][]sqlc.StoryMedium{}
	for _, m := range mediaRows {
		mediaBy[m.StoryID] = append(mediaBy[m.StoryID], m)
	}
	layersBy := map[int64][]sqlc.ListStoryLayersForStoriesRow{}
	for _, l := range layerRows {
		layersBy[l.StoryID] = append(layersBy[l.StoryID], l)
	}
	return mediaBy, layersBy, nil
}

// renderStories formats a flat list (myStories/drafts) - no author wrapper,
// no grouping.
func (h *StoriesHandler) renderStories(ctx context.Context, rows []sqlc.Story) ([]fiber.Map, error) {
	out := make([]fiber.Map, 0, len(rows))
	if len(rows) == 0 {
		return out, nil
	}
	ids := make([]int64, len(rows))
	for i, s := range rows {
		ids[i] = s.ID
	}
	media, layers, err := h.mediaAndLayers(ctx, ids)
	if err != nil {
		return nil, err
	}
	for _, s := range rows {
		out = append(out, h.formatStory(s, media[s.ID], layers[s.ID]))
	}
	return out, nil
}

// canViewStory is StoryController::canViewStory.
func (h *StoriesHandler) canViewStory(ctx context.Context, ownerID int64, status string, expiresAt pgtype.Timestamp, visibility string, viewer int64) bool {
	if viewer != 0 && viewer == ownerID {
		return true
	}
	live := status == "published" && (!expiresAt.Valid || expiresAt.Time.After(time.Now().UTC()))
	if !live {
		return false
	}
	switch visibility {
	case "everyone":
		return true
	case "followers":
		if viewer == 0 {
			return false
		}
		ok, err := h.queries.IsFollowingAccepted(ctx, sqlc.IsFollowingAcceptedParams{FollowerID: viewer, FollowingID: ownerID})
		return err == nil && ok
	default:
		return false // close_friends / only_me
	}
}

/* ── serializers (formatStory / formatLayer) ────────────────────────── */

// feedRowToStory lifts the story columns out of the author-joined feed row so
// formatStory can take one canonical sqlc.Story for every reader.
func feedRowToStory(s sqlc.ListFeedStoriesRow) sqlc.Story {
	return sqlc.Story{
		ID: s.ID, UserID: s.UserID, Caption: s.Caption, Visibility: s.Visibility,
		AllowReplies: s.AllowReplies, AllowResharing: s.AllowResharing,
		SaveToArchive: s.SaveToArchive, Status: s.Status, Location: s.Location,
		Link: s.Link, ExpiresAt: s.ExpiresAt, CreatedAt: s.CreatedAt,
	}
}

func (h *StoriesHandler) formatStory(s sqlc.Story, media []sqlc.StoryMedium, layers []sqlc.ListStoryLayersForStoriesRow) fiber.Map {
	renderedMedia := make([]fiber.Map, 0, len(media))
	for _, m := range media {
		var mediaURL any
		if m.MediaUrl.Valid && m.MediaUrl.String != "" {
			// Shared-video media lives under videos/ which the Worker HMAC-gates.
			if m.SourceType == "shared_video" {
				mediaURL = signedCdnURL(h.mediaBaseURL, h.signingSecret, m.MediaUrl.String, storyMediaTTL)
			} else {
				mediaURL = mediaJoin(h.mediaBaseURL, m.MediaUrl.String)
			}
		}
		var thumb any
		if m.ThumbnailUrl.Valid && m.ThumbnailUrl.String != "" {
			thumb = mediaJoin(h.mediaBaseURL, m.ThumbnailUrl.String)
		}
		renderedMedia = append(renderedMedia, fiber.Map{
			"id":               m.ID,
			"media_type":       m.MediaType,
			"source_type":      m.SourceType,
			"shared_video_id":  nullableInt(m.SharedVideoID),
			"media_url":        mediaURL,
			"thumbnail_url":    thumb,
			"duration_seconds": nullableInt16(m.DurationSeconds),
			"order_index":      m.OrderIndex,
		})
	}

	renderedLayers := make([]fiber.Map, 0, len(layers))
	for _, l := range layers {
		renderedLayers = append(renderedLayers, fiber.Map{
			"id":           l.ID,
			"type":         l.Type,
			"text":         nullableText(l.Text),
			"url":          nullableText(l.Url),
			"username":     nullableText(l.MentionedUsername),
			"userId":       nullableInt(l.MentionedUserID),
			"locationName": nullableText(l.LocationName),
			"hashtag":      nullableText(l.Hashtag),
			"slideIndex":   l.SlideIndex,
			"x":            numericFloat(l.XPercent),
			"y":            numericFloat(l.YPercent),
			"scale":        numericFloat(l.ScaleValue),
			"rotation":     numericFloat(l.Rotation),
			"color":        l.Color,
			"font":         l.Font,
			"zIndex":       l.ZIndex,
		})
	}

	return fiber.Map{
		"id":              s.ID,
		"user_id":         s.UserID,
		"caption":         nullableText(s.Caption),
		"visibility":      s.Visibility,
		"allow_replies":   s.AllowReplies,
		"allow_resharing": s.AllowResharing,
		"save_to_archive": s.SaveToArchive,
		"status":          s.Status,
		"location":        nullableText(s.Location),
		"link":            nullableText(s.Link),
		"expires_at":      toIso8601(s.ExpiresAt),
		"created_at":      toIso8601(s.CreatedAt),
		"media":           renderedMedia,
		"layers":          renderedLayers,
	}
}

/* ── nullable/numeric helpers ───────────────────────────────────────── */

// nullableInt renders a nullable bigint as its number or null (a nullable FK).
func nullableInt(v pgtype.Int8) any {
	if !v.Valid {
		return nil
	}
	return v.Int64
}

func nullableInt16(v pgtype.Int2) any {
	if !v.Valid {
		return nil
	}
	return v.Int16
}

// numericFloat is Laravel's (float) cast of a NUMERIC column. An invalid/NULL
// numeric renders as 0.0, which is what (float) null gives - the layer geometry
// columns are NOT NULL, so this only guards against a decode failure.
func numericFloat(n pgtype.Numeric) float64 {
	f, err := n.Float64Value()
	if err != nil || !f.Valid {
		return 0
	}
	return f.Float64
}
