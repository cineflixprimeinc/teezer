// Users (read) mirrors App\Http\Controllers\Api\UserController. Ported:
// videos(), liked(), saved() - all reuse renderVideoResource via the shared,
// batched renderVideoList. Each exercises a different eager-load shape, which
// the resource's whenLoaded gates honor:
//   - videos(): user.profile + hashtags + visible-count (one creator)
//   - liked():  user.profile + visible-count, no hashtags (many creators)
//   - saved():  nothing - no user, no hashtags, raw comments_count (many creators)
//
// NOT ported yet: show()/followers/following/search/suggestions and the rest.
package handlers

import (
	"context"
	"errors"
	"strconv"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

type UsersHandler struct {
	queries       *sqlc.Queries
	mediaBaseURL  string
	signingSecret string
}

func NewUsersHandler(q *sqlc.Queries, mediaBaseURL, signingSecret string) *UsersHandler {
	return &UsersHandler{queries: q, mediaBaseURL: mediaBaseURL, signingSecret: signingSecret}
}

const videoPerPage = 20

/* ── GET /users/{username} ──────────────────────────────────────────── */

// Show mirrors UserController::show. NOT ported: recordProfileView (a write
// side-effect - profile-view tracking + its 7-day-cooldown notification -
// which doesn't affect the response body), and the 90s profile:stats
// Cache::remember (the Go path computes the aggregates live: same values, no
// staleness). Both are consistent with the deferred-writes / no-Laravel-cache
// approach elsewhere.
func (h *UsersHandler) Show(c *fiber.Ctx) error {
	ctx := c.Context()
	user, err := h.queries.GetUserForShow(ctx, c.Params("username"))
	if err != nil {
		return userLookupError(c, err) // 404 (scoped to non-banned)
	}

	authUserID := auth.UserID(c)
	authed := authUserID != 0
	isOwn := authed && authUserID == user.ID

	// Follow record (viewer → target): drives the gate + the full payload.
	followStatus := "none"
	isFollowing := false
	if authed {
		st, err := h.queries.GetFollowStatus(ctx, sqlc.GetFollowStatusParams{FollowerID: authUserID, FollowingID: user.ID})
		switch {
		case err == nil:
			followStatus = st
			isFollowing = st == "accepted"
		case errors.Is(err, pgx.ErrNoRows):
			// no relationship → 'none'
		default:
			return serverError(c)
		}
	}

	// Private profiles: non-owner, non-admin, non-accepted-follower gets counts only.
	if user.IsPrivate && !isOwn && !isFollowing {
		isAdmin := false
		if authed {
			if isAdmin, err = h.queries.IsAdminUser(ctx, authUserID); err != nil {
				return serverError(c)
			}
		}
		if !isAdmin {
			var avatar any
			if user.Avatar.Valid && user.Avatar.String != "" {
				avatar = mediaJoin(h.mediaBaseURL, user.Avatar.String)
			}
			return c.JSON(fiber.Map{"success": true, "data": fiber.Map{
				"id":              user.ID,
				"username":        user.Username,
				"name":            user.Name,
				"avatar":          avatar,
				"is_verified":     user.IsVerified,
				"is_private":      true,
				"is_following":    false,
				"follow_status":   followStatus,
				"followers_count": int64(user.TotalFollowers),
				"following_count": int64(user.TotalFollowing),
				"likes_count":     user.TotalLikes,
				"videos_count":    int64(user.TotalVideos),
				"has_story":       false,
			}})
		}
	}

	// Full profile: live stats + auth-context fields.
	isBlocked := false
	if authed {
		if isBlocked, err = h.queries.HasBlocked(ctx, sqlc.HasBlockedParams{BlockerID: authUserID, BlockedID: user.ID}); err != nil {
			return serverError(c)
		}
	}
	followersCount, err := h.queries.CountAcceptedFollowers(ctx, user.ID)
	if err != nil {
		return serverError(c)
	}
	followingCount, err := h.queries.CountAcceptedFollowing(ctx, user.ID)
	if err != nil {
		return serverError(c)
	}
	stats, err := h.queries.GetUserPublicVideoStats(ctx, user.ID)
	if err != nil {
		return serverError(c)
	}
	hasStory, err := h.queries.UserHasStory(ctx, user.ID)
	if err != nil {
		return serverError(c)
	}
	socialLinks, err := h.queries.GetUserSocialLinks(ctx, user.ID)
	if err != nil {
		return serverError(c)
	}

	// recordProfileView is deliberately NOT invoked here (see method note).

	return c.JSON(fiber.Map{"success": true, "data": renderUserResource(userResourceInput{
		user:               user,
		authed:             authed,
		socialLinks:        socialLinks,
		followersCount:     &followersCount,
		followingCount:     &followingCount,
		videosCount:        &stats.VideosCount,
		totalLikesReceived: &stats.TotalLikesReceived,
		totalVideoViews:    &stats.TotalVideoViews,
		hasStory:           hasStory,
		isFollowing:        isFollowing,
		isBlocked:          isBlocked,
		followStatus:       followStatus,
	}, h.mediaBaseURL)})
}

/* ── GET /users/{username}/followers ────────────────────────────────── */

func (h *UsersHandler) Followers(c *fiber.Ctx) error {
	ctx := c.Context()
	owner, err := h.queries.GetUserForProfile(ctx, c.Params("username"))
	if err != nil {
		return userLookupError(c, err)
	}
	viewerID := auth.UserID(c)
	if ok, err := h.canViewPrivateContent(ctx, viewerID, owner.ID, owner.IsPrivate); err != nil {
		return serverError(c)
	} else if !ok {
		return privateListForbidden(c)
	}

	perPage := parsePositiveQuery(c.Query("per_page"), 20)
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountAcceptedFollowers(ctx, owner.ID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListAcceptedFollowers(ctx, sqlc.ListAcceptedFollowersParams{
		Target: owner.ID, RowLimit: int32(perPage), RowOffset: int32((page - 1) * perPage),
	})
	if err != nil {
		return serverError(c)
	}
	users := make([]sqlc.GetUserForShowRow, len(rows))
	for i, r := range rows {
		users[i] = sqlc.GetUserForShowRow(r)
	}
	data, err := h.renderUserList(ctx, users, viewerID, userListOpts{})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": pageMeta(page, total, perPage)})
}

/* ── GET /users/{username}/following ────────────────────────────────── */

func (h *UsersHandler) Following(c *fiber.Ctx) error {
	ctx := c.Context()
	owner, err := h.queries.GetUserForProfile(ctx, c.Params("username"))
	if err != nil {
		return userLookupError(c, err)
	}
	viewerID := auth.UserID(c)
	if ok, err := h.canViewPrivateContent(ctx, viewerID, owner.ID, owner.IsPrivate); err != nil {
		return serverError(c)
	} else if !ok {
		return privateListForbidden(c)
	}

	perPage := parsePositiveQuery(c.Query("per_page"), 20)
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountAcceptedFollowing(ctx, owner.ID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListAcceptedFollowing(ctx, sqlc.ListAcceptedFollowingParams{
		Target: owner.ID, RowLimit: int32(perPage), RowOffset: int32((page - 1) * perPage),
	})
	if err != nil {
		return serverError(c)
	}
	users := make([]sqlc.GetUserForShowRow, len(rows))
	for i, r := range rows {
		users[i] = sqlc.GetUserForShowRow(r)
	}
	// following() injects a live followers_count (withCount) + total_likes_received (withSum).
	data, err := h.renderUserList(ctx, users, viewerID, userListOpts{injectFollowerCount: true, injectLikesReceived: true})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": pageMeta(page, total, perPage)})
}

// userListOpts selects the per-endpoint injected attrs (following() only).
type userListOpts struct {
	injectFollowerCount bool
	injectLikesReceived bool
}

// renderUserList batches has_story, the viewer's accepted-follow set, and (for
// following()) live follower counts + like sums, so a page of N users is O(1)
// queries. Auth-context follow_status/is_blocked aren't set by the list
// endpoints, so they default to 'none'/false in the resource.
func (h *UsersHandler) renderUserList(ctx context.Context, users []sqlc.GetUserForShowRow, viewerID int64, opts userListOpts) ([]fiber.Map, error) {
	if len(users) == 0 {
		return []fiber.Map{}, nil
	}
	ids := make([]int64, len(users))
	for i, u := range users {
		ids[i] = u.ID
	}

	storyRows, err := h.queries.ListUsersWithStory(ctx, ids)
	if err != nil {
		return nil, err
	}
	storySet := make(map[int64]bool, len(storyRows))
	for _, id := range storyRows {
		storySet[id] = true
	}

	followedSet := map[int64]bool{}
	if viewerID != 0 {
		followed, err := h.queries.ListAcceptedFollowedIDs(ctx, sqlc.ListAcceptedFollowedIDsParams{FollowerID: viewerID, Column2: ids})
		if err != nil {
			return nil, err
		}
		for _, id := range followed {
			followedSet[id] = true
		}
	}

	followerCountByUser := map[int64]int64{}
	if opts.injectFollowerCount {
		rows, err := h.queries.CountFollowersForUsers(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			followerCountByUser[r.FollowingID] = r.Cnt
		}
	}
	likesByUser := map[int64]int64{}
	if opts.injectLikesReceived {
		rows, err := h.queries.SumVideoLikesForUsers(ctx, ids)
		if err != nil {
			return nil, err
		}
		for _, r := range rows {
			likesByUser[r.UserID] = r.Total
		}
	}

	out := make([]fiber.Map, len(users))
	for i, u := range users {
		in := userResourceInput{
			user:        u,
			authed:      viewerID != 0,
			hasStory:    storySet[u.ID],
			isFollowing: viewerID != 0 && followedSet[u.ID],
		}
		if opts.injectFollowerCount {
			cnt := followerCountByUser[u.ID]
			in.followersCount = &cnt
		}
		if opts.injectLikesReceived {
			total := likesByUser[u.ID]
			in.totalLikesReceived = &total
		}
		out[i] = renderUserResource(in, h.mediaBaseURL)
	}
	return out, nil
}

func privateListForbidden(c *fiber.Ctx) error {
	return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
		"success": false, "private": true, "canViewList": false, "message": "This account is private",
	})
}

/* ── GET /users/{username}/videos ───────────────────────────────────── */

func (h *UsersHandler) Videos(c *fiber.Ctx) error {
	ctx := c.Context()
	owner, err := h.queries.GetUserByUsername(ctx, c.Params("username"))
	if err != nil {
		return userLookupError(c, err)
	}
	authUserID := auth.UserID(c)
	if ok, err := h.canViewPrivateContent(ctx, authUserID, owner.ID, owner.IsPrivate); err != nil {
		return serverError(c)
	} else if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "This account is private."})
	}

	sort := c.Query("sort", "latest")
	switch sort {
	case "oldest", "most_viewed", "most_likes", "latest":
	default:
		sort = "latest"
	}
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountUserPublicVideos(ctx, owner.ID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListUserVideos(ctx, sqlc.ListUserVideosParams{
		UserID: owner.ID, Sort: sort, RowLimit: videoPerPage, RowOffset: int32((page - 1) * videoPerPage),
	})
	if err != nil {
		return serverError(c)
	}
	videos := make([]sqlc.GetVideoForShowRow, len(rows))
	for i, r := range rows {
		videos[i] = sqlc.GetVideoForShowRow(r)
	}

	data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{loadUser: true, loadHashtags: true, loadVisibleCounts: true})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": fullMeta(c, page, total, videoPerPage)})
}

/* ── GET /users/{username}/liked ────────────────────────────────────── */

func (h *UsersHandler) Liked(c *fiber.Ctx) error {
	ctx := c.Context()
	owner, err := h.queries.GetUserForProfile(ctx, c.Params("username"))
	if err != nil {
		return userLookupError(c, err)
	}
	authUserID := auth.UserID(c)
	isOwn := authUserID != 0 && authUserID == owner.ID

	if ok, err := h.canViewPrivateContent(ctx, authUserID, owner.ID, owner.IsPrivate); err != nil {
		return serverError(c)
	} else if !ok {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "This account is private.", "reason": "private_account"})
	}
	// who_can_see_liked: only 'only_me' blocks non-owners (matches controller).
	whoCanSee := owner.WhoCanSeeLiked
	if whoCanSee == "" {
		whoCanSee = "only_me"
	}
	if !isOwn && whoCanSee == "only_me" {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "This user keeps their liked videos private.", "reason": "liked_private"})
	}

	page := parsePositiveQuery(c.Query("page"), 1)
	total, err := h.queries.CountLikedVideos(ctx, owner.ID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListLikedVideos(ctx, sqlc.ListLikedVideosParams{
		UserID: owner.ID, RowLimit: videoPerPage, RowOffset: int32((page - 1) * videoPerPage),
	})
	if err != nil {
		return serverError(c)
	}
	videos := make([]sqlc.GetVideoForShowRow, len(rows))
	for i, r := range rows {
		videos[i] = sqlc.GetVideoForShowRow(r)
	}

	data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{loadUser: true, loadVisibleCounts: true})
	if err != nil {
		return serverError(c)
	}
	// liked meta is intentionally just current_page/last_page/total.
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": pageMeta(page, total, videoPerPage)})
}

/* ── GET /users/{username}/saved ────────────────────────────────────── */

func (h *UsersHandler) Saved(c *fiber.Ctx) error {
	ctx := c.Context()
	owner, err := h.queries.GetUserForProfile(ctx, c.Params("username"))
	if err != nil {
		return userLookupError(c, err)
	}
	if owner.IsBanned { // saved() scopes the lookup to non-banned users.
		return notFound(c)
	}
	authUserID := auth.UserID(c)
	isOwn := authUserID != 0 && authUserID == owner.ID

	privacy := owner.SavedPrivacy
	if privacy == "" {
		privacy = "private"
	}
	if !isOwn {
		if privacy == "private" {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "This saved list is private."})
		}
		if privacy == "followers" {
			following := false
			if authUserID != 0 {
				following, err = h.queries.IsFollowingAccepted(ctx, sqlc.IsFollowingAcceptedParams{FollowerID: authUserID, FollowingID: owner.ID})
				if err != nil {
					return serverError(c)
				}
			}
			if !following {
				return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "This saved list is only visible to followers."})
			}
		}
	}

	page := parsePositiveQuery(c.Query("page"), 1)
	total, err := h.queries.CountSavedVideos(ctx, owner.ID)
	if err != nil {
		return serverError(c)
	}
	rows, err := h.queries.ListSavedVideos(ctx, sqlc.ListSavedVideosParams{
		UserID: owner.ID, RowLimit: videoPerPage, RowOffset: int32((page - 1) * videoPerPage),
	})
	if err != nil {
		return serverError(c)
	}
	videos := make([]sqlc.GetVideoForShowRow, len(rows))
	for i, r := range rows {
		videos[i] = sqlc.GetVideoForShowRow(r)
	}

	// saved() eager-loads nothing → no user/hashtags, raw comments_count.
	data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": fullMeta(c, page, total, videoPerPage)})
}

/* ── shared list rendering ──────────────────────────────────────────── */

// canViewPrivateContent mirrors UserController::canViewPrivateContent.
func (h *UsersHandler) canViewPrivateContent(ctx context.Context, authUserID, ownerID int64, ownerIsPrivate bool) (bool, error) {
	if !ownerIsPrivate {
		return true, nil
	}
	if authUserID == 0 {
		return false, nil
	}
	if authUserID == ownerID {
		return true, nil
	}
	isAdmin, err := h.queries.IsAdminUser(ctx, authUserID)
	if err != nil {
		return false, err
	}
	if isAdmin {
		return true, nil
	}
	return h.queries.IsFollowingAccepted(ctx, sqlc.IsFollowingAcceptedParams{FollowerID: authUserID, FollowingID: ownerID})
}

/* ── shared helpers ─────────────────────────────────────────────────── */

func userLookupError(c *fiber.Ctx, err error) error {
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound(c)
	}
	return serverError(c)
}

func serverError(c *fiber.Ctx) error {
	return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
}

// rateLimited is Laravel's ThrottleRequestsException renderer - shared by
// every handler that checks a ratelimit.Limiter.TooManyAttempts gate
// (comments, likes, follow) so the 429 shape is consistent across all of them.
func rateLimited(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{"success": false, "message": msg})
}

// pageMeta is the minimal current_page/last_page/total (liked()).
func pageMeta(page int, total int64, perPage int) fiber.Map {
	lastPage := 1
	if total > 0 {
		lastPage = int((total + int64(perPage) - 1) / int64(perPage))
	}
	return fiber.Map{"current_page": page, "last_page": lastPage, "total": total}
}

// fullMeta adds per_page + next_page_url (videos()/saved()).
func fullMeta(c *fiber.Ctx, page int, total int64, perPage int) fiber.Map {
	m := pageMeta(page, total, perPage)
	m["per_page"] = perPage
	var nextPageURL any
	if page < m["last_page"].(int) {
		nextPageURL = c.BaseURL() + c.Path() + "?page=" + strconv.Itoa(page+1)
	}
	m["next_page_url"] = nextPageURL
	return m
}
