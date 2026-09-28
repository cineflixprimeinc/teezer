// Notifications mirrors App\Http\Controllers\Api\NotificationController over the
// server-aggregated notifications table (IG/TikTok bundling): one unread group
// per (user, type, entity), with a running actor_count and a bounded top-3
// actor stack. Response shape matches NotificationResource field-for-field,
// including the aggregated sentence built from live actor names
// (NotificationService::displayMessage) for aggregatable types.
//
// This is the READ + state side only. The WRITE side (notify/withdraw
// aggregation, advisory locks, RealtimeBus/push fan-out - NotificationService)
// stays in Laravel; the Go interaction handlers likewise defer notify/withdraw.
// So notifications are still *authored* by PHP and only *read/managed* here.
//
// Storage::url() is ported as a config-driven base-URL prefix (MediaBaseURL,
// = Laravel's r2 disk url) rather than the raw-path punt used by comments.go -
// notification avatars/thumbnails are central to the card UI.
package handlers

import (
	"strconv"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

type NotificationsHandler struct {
	queries      *sqlc.Queries
	mediaBaseURL string
}

func NewNotificationsHandler(q *sqlc.Queries, mediaBaseURL string) *NotificationsHandler {
	return &NotificationsHandler{queries: q, mediaBaseURL: mediaBaseURL}
}

// aggVerbs mirrors NotificationService::AGG's verb map. A type is aggregatable
// iff it appears here (NotificationService::isAggregatable).
var aggVerbs = map[string]string{
	"like":         "liked your video",
	"comment":      "commented on your video",
	"reply":        "replied to your comment",
	"comment_like": "liked your comment",
	"share":        "shared your video",
	"repost":       "reposted your video",
	"save":         "saved your video",
	"follow":       "started following you",
	// Story interactions aggregate on the Laravel side too - kept in step
	// with AGG so a story group's message and its is_aggregated flag don't
	// depend on which backend served the request.
	"story_react":  "reacted to your story",
	"story_reply":  "replied to your story",
	"story_repost": "reposted your story",
}

/* ── GET /notifications ─────────────────────────────────────────────── */

func (h *NotificationsHandler) Index(c *fiber.Ctx) error {
	userID := auth.UserID(c)
	ctx := c.Context()

	perPage := parsePositiveQuery(c.Query("per_page"), 20)
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountNotifications(ctx, userID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	rows, err := h.queries.ListNotifications(ctx, sqlc.ListNotificationsParams{
		UserID: userID, Limit: int32(perPage), Offset: int32((page - 1) * perPage),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	// Batch-resolve reel thumbnails for video-entity notifications (one query).
	videoIDs := make([]int64, 0, len(rows))
	seenVid := make(map[int64]bool)
	notifIDs := make([]int64, 0, len(rows))
	commentIDs := make([]int64, 0, len(rows))
	seenComment := make(map[int64]bool)
	for _, n := range rows {
		notifIDs = append(notifIDs, n.ID)
		if n.EntityType.Valid && n.EntityType.String == "video" && n.EntityID.Valid && !seenVid[n.EntityID.Int64] {
			seenVid[n.EntityID.Int64] = true
			videoIDs = append(videoIDs, n.EntityID.Int64)
		}
		if cid := anchorCommentID(n); cid != 0 && !seenComment[cid] {
			seenComment[cid] = true
			commentIDs = append(commentIDs, cid)
		}
	}

	// comment -> video map for the deep-link last-resort branch (PHP parity
	// with NotificationController::attachCommentVideoIds - one query, no N+1).
	videoByComment := make(map[int64]int64)
	if len(commentIDs) > 0 {
		pairs, err := h.queries.GetVideoIdsForComments(ctx, commentIDs)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		for _, p := range pairs {
			videoByComment[p.CommentID] = p.VideoID
		}
	}

	thumbByVideo := make(map[int64]string)
	if len(videoIDs) > 0 {
		thumbs, err := h.queries.GetVideoThumbnails(ctx, videoIDs)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		for _, t := range thumbs {
			if t.ThumbnailUrl.Valid && t.ThumbnailUrl.String != "" {
				thumbByVideo[t.ID] = t.ThumbnailUrl.String
			}
		}
	}

	// Latest 3 actors per notification (one windowed query), newest first.
	recentByNotif := make(map[int64][]fiber.Map)
	nameByNotif := make(map[int64][]string)
	if len(notifIDs) > 0 {
		actors, err := h.queries.ListRecentNotificationActors(ctx, notifIDs)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		for _, a := range actors {
			name := actorDisplayName(a.Name, a.Username)
			recentByNotif[a.NotificationID] = append(recentByNotif[a.NotificationID], fiber.Map{
				"id":          a.ActorID,
				"name":        name,
				"username":    a.Username,
				"avatar":      h.mediaURL(a.Avatar.String),
				"is_verified": a.IsVerified,
			})
			nameByNotif[a.NotificationID] = append(nameByNotif[a.NotificationID], name)
		}
	}

	data := make([]fiber.Map, len(rows))
	for i, n := range rows {
		var resolved *int64
		if cid := anchorCommentID(n); cid != 0 {
			if vid, ok := videoByComment[cid]; ok {
				v := vid
				resolved = &v
			}
		}
		data[i] = h.renderNotification(n, thumbByVideo, recentByNotif[n.ID], nameByNotif[n.ID], resolved)
	}

	lastPage := 1
	if total > 0 {
		lastPage = int((total + int64(perPage) - 1) / int64(perPage))
	}
	var nextPageURL any
	if page < lastPage {
		nextPageURL = c.BaseURL() + c.Path() + "?page=" + strconv.Itoa(page+1)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"meta": fiber.Map{
			"current_page":  page,
			"last_page":     lastPage,
			"per_page":      perPage,
			"total":         total,
			"next_page_url": nextPageURL,
		},
	})
}

// profileLinkTypes are the notification types whose subject is the actor rather
// than a piece of content. Mirrors DeepLinkService::PROFILE_TYPES.
var profileLinkTypes = map[string]bool{
	"follow":                  true,
	"follow_request":          true,
	"follow_request_accepted": true,
	"follow_request_rejected": true,
	"profile_view":            true,
}

// systemLinkTypes are Teezer talking to the user; they open the notice itself.
// Mirrors DeepLinkService::SYSTEM_TYPES.
var systemLinkTypes = map[string]bool{
	"system":                    true,
	"verification":              true,
	"report_actioned":           true,
	"report_update":             true,
	"admin_account_restriction": true,
	"restriction_applied":       true,
	"restriction_lifted":        true,
}

// deepLinkFor is the Go half of the canonical link grammar. It is a deliberate
// line-for-line mirror of App\Services\DeepLinkService::forNotification - the
// failure mode if the two drift is that a notification opens one place through
// Laravel and another through Go, which is invisible until a user hits it.
//
// Note it needs no comment->video lookup to answer most branches: comment-
// anchored notifications resolve to /comment/{id} and the server dereferences
// that id when the link is opened. The caller MAY still hand over a
// resolvedVideoId (batch-resolved from video_comments, mirroring
// NotificationController::attachCommentVideoIds) which PHP uses as the
// last-resort fallback before the generic profile/notification one.
func deepLinkFor(n sqlc.ListNotificationsRow, resolvedVideoID *int64) string {
	entityType := ""
	if n.EntityType.Valid {
		entityType = n.EntityType.String
	}
	// DeepLinkService::profile() strips any leading "@" before building the
	// path; do the same so both backends emit byte-identical links.
	username := ""
	if n.ActorUsername.Valid {
		username = strings.TrimLeft(n.ActorUsername.String, "@")
	}
	notificationLink := "/notification/" + strconv.FormatInt(n.ID, 10)

	// System notices first: an admin message about a video is still an admin message.
	if systemLinkTypes[n.Type] || entityType == "admin_message" || entityType == "admin_action" {
		return notificationLink
	}

	// Anything anchored to a comment opens its parent reel when we know it.
	// Mobile has no /comment/{id} screen (comments are a sheet on the viewer),
	// so /video/{id} is the destination that actually works. /comment/{id}
	// remains only when the video id could not be resolved.
	if n.CommentID.Valid {
		if resolvedVideoID != nil {
			return "/video/" + strconv.FormatInt(*resolvedVideoID, 10)
		}
		return "/comment/" + strconv.FormatInt(n.CommentID.Int64, 10)
	}
	if entityType == "comment" && n.EntityID.Valid {
		if resolvedVideoID != nil {
			return "/video/" + strconv.FormatInt(*resolvedVideoID, 10)
		}
		return "/comment/" + strconv.FormatInt(n.EntityID.Int64, 10)
	}

	if entityType == "video" && n.EntityID.Valid {
		return "/video/" + strconv.FormatInt(n.EntityID.Int64, 10)
	}

	// A story has no standalone page yet, so it resolves to its author.
	if entityType == "story" && username != "" {
		return "/profile/" + username
	}

	if entityType == "live" && n.EntityID.Valid {
		return "/live/" + strconv.FormatInt(n.EntityID.Int64, 10)
	}

	// Message requests and DM notices open the messaging surface, where the
	// request is actually accepted/declined - not the actor's profile.
	if n.Type == "message_request" || n.Type == "message_request_accepted" || entityType == "conversation" {
		return "/messages"
	}

	if profileLinkTypes[n.Type] && username != "" {
		return "/profile/" + username
	}

	// A caller-supplied video id wins over the generic fallback (PHP parity).
	if resolvedVideoID != nil {
		return "/video/" + strconv.FormatInt(*resolvedVideoID, 10)
	}

	// Last resort: the notification itself always exists and always opens.
	if username != "" {
		return "/profile/" + username
	}
	return notificationLink
}

// anchorCommentID extracts the comment a notification is anchored to - either
// the explicit comment_id or entity_id when the entity is the comment itself.
func anchorCommentID(n sqlc.ListNotificationsRow) int64 {
	if n.CommentID.Valid {
		return n.CommentID.Int64
	}
	if n.EntityType.Valid && n.EntityType.String == "comment" && n.EntityID.Valid {
		return n.EntityID.Int64
	}
	return 0
}

func (h *NotificationsHandler) renderNotification(n sqlc.ListNotificationsRow, thumbByVideo map[int64]string, recent []fiber.Map, names []string, resolvedVideoID *int64) fiber.Map {
	if recent == nil {
		recent = []fiber.Map{}
	}
	count := int(n.ActorCount)
	if count < 1 {
		count = 1
	}

	_, aggregated := aggVerbs[n.Type]
	var message string
	if aggregated {
		message = displayMessage(n.Type, names, count)
	} else if n.Message.Valid {
		message = n.Message.String
	}

	var targetReelID any
	var thumbnail any
	if n.EntityType.Valid && n.EntityType.String == "video" && n.EntityID.Valid {
		targetReelID = n.EntityID.Int64
		if key, ok := thumbByVideo[n.EntityID.Int64]; ok {
			thumbnail = h.mediaURL(key)
		}
	} else if resolvedVideoID != nil {
		// Comment-anchored row: surface the resolved reel so clients can open
		// the right video directly instead of a /comment/{id} link they cannot
		// dereference. Mirrors NotificationResource's video_id_for_comment.
		targetReelID = *resolvedVideoID
	}

	m := fiber.Map{
		"id":              n.ID,
		"type":            n.Type,
		"message":         message,
		"message_preview": message,
		"entity_type":     nullableText(n.EntityType),
		"entity_id":       nullableInt8(n.EntityID),
		"comment_id":      nullableInt8(n.CommentID),
		"target_reel_id":  targetReelID,
		"thumbnail":       thumbnail,
		"actor_count":     count,
		"is_aggregated":   aggregated && count > 1,
		"actors":          recent,
		"group_key":       "n:" + strconv.FormatInt(n.ID, 10),
		"is_read":         n.IsRead,
		"action_status":   nullableText(n.ActionStatus),
		"created_at":      toIso8601(n.CreatedAt),
		"updated_at":      toIso8601(coalesceTimestamp(n.LatestActivityAt, n.UpdatedAt, n.CreatedAt)),
		// Must stay byte-identical to Laravel's DeepLinkService::forNotification.
		// Whichever backend answers, clients route from this one string.
		"deep_link": deepLinkFor(n, resolvedVideoID),
	}

	// `actor` (leading avatar) - only when the actor user row is present
	// (actor_id set and not since deleted). whenLoaded semantics: omit if absent.
	if n.ActorID.Valid && n.ActorUsername.Valid {
		m["actor"] = fiber.Map{
			"id":          n.ActorID.Int64,
			"username":    n.ActorUsername.String,
			"name":        nullableText(n.ActorName),
			"avatar":      h.mediaURL(n.ActorAvatar.String),
			"is_verified": n.ActorIsVerified.Valid && n.ActorIsVerified.Bool,
		}
	}
	return m
}

/* ── GET /notifications/{id}/actors ─────────────────────────────────── */

func (h *NotificationsHandler) Actors(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	if _, err := h.queries.GetNotificationForUser(ctx, sqlc.GetNotificationForUserParams{ID: id, UserID: userID}); err != nil {
		return notFound(c)
	}

	perPage := parsePositiveQuery(c.Query("per_page"), 30)
	page := parsePositiveQuery(c.Query("page"), 1)

	total, err := h.queries.CountNotificationActors(ctx, id)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	actors, err := h.queries.ListNotificationActors(ctx, sqlc.ListNotificationActorsParams{
		NotificationID: id, Limit: int32(perPage), Offset: int32((page - 1) * perPage),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	data := make([]fiber.Map, len(actors))
	for i, u := range actors {
		data[i] = fiber.Map{
			"id":          u.ID,
			"username":    u.Username,
			"name":        u.Name,
			"avatar":      h.mediaURL(u.Avatar.String),
			"is_verified": u.IsVerified,
		}
	}

	lastPage := 1
	if total > 0 {
		lastPage = int((total + int64(perPage) - 1) / int64(perPage))
	}
	var nextPageURL any
	if page < lastPage {
		nextPageURL = c.BaseURL() + c.Path() + "?page=" + strconv.Itoa(page+1)
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    data,
		"meta": fiber.Map{
			"current_page":  page,
			"last_page":     lastPage,
			"per_page":      perPage,
			"total":         total,
			"next_page_url": nextPageURL,
		},
	})
}

/* ── GET /notifications/unread-count ────────────────────────────────── */

func (h *NotificationsHandler) UnreadCount(c *fiber.Ctx) error {
	userID := auth.UserID(c)

	// `exclude` (comma-separated types) lets a surface that never renders those
	// rows - mobile hides profile_view everywhere - get a count it can actually
	// clear. Omitted, the historical all-types count is returned.
	var (
		count int64
		err   error
	)
	if exclude := parseTypeList(c.Query("exclude")); len(exclude) > 0 {
		count, err = h.queries.CountUnreadNotificationsExcluding(c.Context(), userID, exclude)
	} else {
		count, err = h.queries.CountUnreadNotifications(c.Context(), userID)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"count": count}})
}

// parseTypeList splits a comma-separated query value into clean type names.
func parseTypeList(v string) []string {
	if strings.TrimSpace(v) == "" {
		return nil
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

/* ── POST /notifications/{id}/read ──────────────────────────────────── */

func (h *NotificationsHandler) MarkRead(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	updated, err := h.queries.MarkNotificationRead(c.Context(), sqlc.MarkNotificationReadParams{ID: id, UserID: auth.UserID(c)})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	// Zero rows means the id does not exist or belongs to someone else - the
	// same 404 Laravel's firstOrFail path produces. Reporting success here let
	// a client's optimistic flip stick while the server still counted the row.
	if updated == 0 {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true})
}

/* ── POST /notifications/read-many ──────────────────────────────────── */

type markManyRequest struct {
	IDs []int64 `json:"ids"`
}

func (h *NotificationsHandler) MarkManyRead(c *fiber.Ctx) error {
	var req markManyRequest
	if err := c.BodyParser(&req); err != nil {
		return validationError(c, "ids", "The ids field is required.")
	}
	if len(req.IDs) == 0 {
		return validationError(c, "ids", "The ids field is required.")
	}
	if len(req.IDs) > 200 {
		return validationError(c, "ids", "The ids field must not have more than 200 items.")
	}

	updated, err := h.queries.MarkNotificationsRead(c.Context(), sqlc.MarkNotificationsReadParams{
		Column1: req.IDs, UserID: auth.UserID(c),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"updated": updated}})
}

/* ── POST /notifications/read-all ───────────────────────────────────── */

type markAllRequest struct {
	Types        []string `json:"types"`
	ExcludeTypes []string `json:"exclude_types"`
}

func (h *NotificationsHandler) MarkAllRead(c *fiber.Ctx) error {
	userID := auth.UserID(c)

	// Body is OPTIONAL: empty keeps the historical mark-everything behaviour,
	// while the mobile inbox passes `types` (System/Gifts menus) or
	// `exclude_types` (Activity) so one menu clears its own badge without
	// wiping the other menus' unread state server-side.
	var req markAllRequest
	if len(c.Body()) > 0 {
		if err := c.BodyParser(&req); err != nil {
			return validationError(c, "types", "The types field must be an array.")
		}
	}

	var (
		updated int64
		err     error
	)
	switch {
	case len(req.Types) > 0:
		updated, err = h.queries.MarkAllNotificationsReadTypes(c.Context(), userID, req.Types)
	case len(req.ExcludeTypes) > 0:
		updated, err = h.queries.MarkAllNotificationsReadExcludeTypes(c.Context(), userID, req.ExcludeTypes)
	default:
		updated, err = h.queries.MarkAllNotificationsRead(c.Context(), userID)
	}
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"updated": updated},
		"message": "All notifications marked as read.",
	})
}

/* ── DELETE /notifications/{id} ─────────────────────────────────────── */

func (h *NotificationsHandler) Destroy(c *fiber.Ctx) error {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	if err := h.queries.DeleteNotification(c.Context(), sqlc.DeleteNotificationParams{ID: id, UserID: auth.UserID(c)}); err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	return c.JSON(fiber.Map{"success": true})
}

/* ── helpers ────────────────────────────────────────────────────────── */

// actorDisplayName mirrors the name fallback used across NotificationService /
// attachRecentActors: name, else "@username", else "Someone".
func actorDisplayName(name, username string) string {
	if name != "" {
		return name
	}
	if username != "" {
		return "@" + username
	}
	return "Someone"
}

// displayMessage ports NotificationService::displayMessage - the bundled
// sentence from up-to-3 recent actor names (latest first) and the unique count.
func displayMessage(typ string, names []string, count int) string {
	verb, ok := aggVerbs[typ]
	if !ok {
		return ""
	}
	filtered := names[:0:0]
	for _, n := range names {
		if n != "" {
			filtered = append(filtered, n)
		}
	}
	if count < len(filtered) {
		count = len(filtered)
	}
	if count <= 0 {
		return ""
	}
	if len(filtered) == 0 {
		unit := "people"
		if count == 1 {
			unit = "person"
		}
		return strconv.Itoa(count) + " " + unit + " " + verb
	}

	a := filtered[0]
	if count == 1 {
		return a + " " + verb
	}
	if count == 2 && len(filtered) >= 2 {
		return a + " and " + filtered[1] + " " + verb
	}
	if count == 3 && len(filtered) >= 3 {
		return a + ", " + filtered[1] + " and " + filtered[2] + " " + verb
	}
	others := count - 1
	unit := "others"
	if others == 1 {
		unit = "other"
	}
	return a + " and " + strconv.Itoa(others) + " " + unit + " " + verb
}

// mediaURL ports Storage::url(): prefix the public media base, matching
// Laravel's r2 disk exactly (unconditional join - no http:// guard, same as
// Laravel). Empty path → null; empty base → raw key (graceful dev fallback).
func (h *NotificationsHandler) mediaURL(path string) any {
	if path == "" {
		return nil
	}
	if h.mediaBaseURL == "" {
		return path
	}
	return h.mediaBaseURL + "/" + strings.TrimLeft(path, "/")
}

// toIso8601 matches Carbon::toIso8601String() ("...+00:00" for UTC, not "Z").
func toIso8601(t pgtype.Timestamp) any {
	if !t.Valid {
		return nil
	}
	return t.Time.UTC().Format("2006-01-02T15:04:05-07:00")
}

func coalesceTimestamp(vals ...pgtype.Timestamp) pgtype.Timestamp {
	for _, v := range vals {
		if v.Valid {
			return v
		}
	}
	return pgtype.Timestamp{}
}

// parsePositiveQuery parses a positive-int query param, falling back to def for
// missing/invalid/non-positive values (Laravel's lenient paginate()).
func parsePositiveQuery(v string, def int) int {
	if v == "" {
		return def
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 1 {
		return def
	}
	return n
}
