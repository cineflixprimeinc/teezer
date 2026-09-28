// Videos (read) mirrors App\Http\Controllers\Api\VideoController's read
// endpoints. This pass ports show(); feed/trending/user-videos reuse
// renderVideoResource in follow-ups.
//
// NOT ported here: the write side (store/update/destroy/upload) and the
// recommendation feed (FeedController::forYou → FeedService scoring).
package handlers

import (
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

type VideosHandler struct {
	queries       *sqlc.Queries
	mediaBaseURL  string
	signingSecret string
}

func NewVideosHandler(q *sqlc.Queries, mediaBaseURL, signingSecret string) *VideosHandler {
	return &VideosHandler{queries: q, mediaBaseURL: mediaBaseURL, signingSecret: signingSecret}
}

/* ── GET /videos/trending ───────────────────────────────────────────── */

// Trending mirrors VideoController::trending → FeedService::trending: the last
// 7 days' videos, most-viewed then most-liked. Loads the full relation set
// (like show), batched across creators via renderVideoList.
func (h *VideosHandler) Trending(c *fiber.Ctx) error {
	ctx := c.Context()
	authUserID := auth.UserID(c)
	perPage := parsePositiveQuery(c.Query("per_page"), 20)
	page := parsePositiveQuery(c.Query("page"), 1)

	// now()->subDays(7), computed in UTC to match Laravel's app timezone.
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

	lastPage := 1
	if total > 0 {
		lastPage = int((total + int64(perPage) - 1) / int64(perPage))
	}
	// trending meta has per_page but no next_page_url (matches the controller).
	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"meta": fiber.Map{
			"current_page": page,
			"last_page":    lastPage,
			"per_page":     perPage,
			"total":        total,
		},
	})
}

/* ── GET /videos/following ──────────────────────────────────────────── */

// FollowingFeed mirrors VideoController::followingFeed → FeedService::following:
// published videos from creators the viewer follows, newest first, full relation
// set. Auth-required, so is_following is true for every row.
func (h *VideosHandler) FollowingFeed(c *fiber.Ctx) error {
	ctx := c.Context()
	authUserID := auth.UserID(c)
	perPage := parsePositiveQuery(c.Query("per_page"), 15)
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountFollowingFeed(ctx, authUserID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListFollowingFeed(ctx, sqlc.ListFollowingFeedParams{
		AuthUserID: authUserID, RowLimit: int32(perPage), RowOffset: int32((page - 1) * perPage),
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
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": fullMeta(c, page, total, perPage)})
}

/* ── GET /videos/{id} ───────────────────────────────────────────────── */

func (h *VideosHandler) Show(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()

	video, err := h.queries.GetVideoForShow(ctx, id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	authUserID := auth.UserID(c) // 0 => guest

	// Private/draft/removed/rejected: only owner or admin may view.
	unapproved := video.ModerationStatus.Valid && video.ModerationStatus.String == "rejected"
	restricted := video.Status == "draft" || video.Status == "private" || video.Status == "removed"
	if restricted || unapproved {
		allowed := false
		if authUserID != 0 && authUserID == video.UserID {
			allowed = true
		} else if authUserID != 0 {
			isAdmin, err := h.queries.IsAdminUser(ctx, authUserID)
			if err != nil {
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
			}
			allowed = isAdmin
		}
		if !allowed {
			return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false, "message": "Video not found."})
		}
	}

	in := videoResourceInput{video: video, authUserID: authUserID}

	// user.profile (always eager-loaded).
	if user, err := h.queries.GetVideoUserWithProfile(ctx, video.UserID); err == nil {
		in.user = &user
	} else if !errors.Is(err, pgx.ErrNoRows) {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	// hashtags (collection - always present, possibly empty).
	hashtags, err := h.queries.GetVideoHashtagNames(ctx, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	in.hashtags = hashtags
	in.hashtagsLoaded = true

	// audioTrack / musicTrack (belongsTo - nil when the FK is null or missing).
	if video.AudioTrackID.Valid {
		if at, err := h.queries.GetAudioTrackForVideo(ctx, video.AudioTrackID.Int64); err == nil {
			in.audioTrack = &at
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
	}
	if video.MusicTrackID.Valid {
		if r, err := h.queries.GetMusicTrackForVideo(ctx, video.MusicTrackID.Int64); err == nil {
			mt := musicTrackFromRow(r.ID, r.Title, r.ArtistName, r.CoverUrl, r.AudioUrl,
				r.Duration, r.UsesCount, r.SourceType)
			in.musicTrack = &mt
		} else if !errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
	}

	// taggedUsers (collection).
	tagged, err := h.queries.GetVideoTaggedUsers(ctx, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	in.taggedUsers = tagged
	in.taggedUsersLoaded = true

	// visible_comments_count (withVisibleCommentsCount).
	visible, err := h.queries.CountVisibleComments(ctx, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	in.visibleCommentsCount = &visible

	// Auth-context flags (only when logged in).
	if authUserID != 0 {
		liked, err := h.queries.IsVideoLikedBy(ctx, sqlc.IsVideoLikedByParams{VideoID: id, UserID: authUserID})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		saved, err := h.queries.IsVideoSavedBy(ctx, sqlc.IsVideoSavedByParams{VideoID: id, UserID: authUserID})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		following, err := h.queries.IsFollowing(ctx, sqlc.IsFollowingParams{FollowerID: authUserID, FollowingID: video.UserID})
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		in.isLiked = liked
		in.isSaved = saved
		in.isFollowing = following
	}

	// watch_time_seconds - sum of recorded view durations (always set by show()).
	watch, err := h.queries.SumVideoWatchDuration(ctx, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	in.watchTimeSeconds = &watch

	return c.JSON(fiber.Map{
		"success": true,
		"data":    renderVideoResource(in, h.mediaBaseURL, h.signingSecret),
	})
}
