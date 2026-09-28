// Direct-message read surface - App\Http\Controllers\Api\MessageController's
// conversations(), requests() and unreadCount().
//
// NOT ported (each fans out over Centrifugo via RealtimeBus, the deferred
// realtime dep - same reason the notification WRITE side stays in Laravel):
//   - send / markRead / markDelivered  (publish message.new/.read/.delivered)
//   - history                          (auto-marks read, which publishes)
//   - edit / delete / pin / unpin / forward, and the request actions
//     (accept/cancel/block/report) which also notify via NotificationService
//   - upload-url                       (R2 presign - a different service)
//
// These three reads have NO side effects and NO fan-out, so they port cleanly.
//
// FIDELITY NOTE: these endpoints return RAW DB::select rows, not API resources,
// so their timestamps are the Postgres wire format ("2026-06-26 04:10:09" -
// space, no T, no zone), NOT the toIso8601 "+00:00" the resource endpoints use.
// rawTimestamp below reproduces that exactly.
package handlers

import (
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/sqlc"
)

type MessagesHandler struct {
	queries      *sqlc.Queries
	mediaBaseURL string
}

func NewMessagesHandler(q *sqlc.Queries, mediaBaseURL string) *MessagesHandler {
	return &MessagesHandler{queries: q, mediaBaseURL: mediaBaseURL}
}

// onlineWindow is Carbon's now()->subMinutes(5): "active in the last 5 minutes".
const onlineWindow = 5 * time.Minute

/* ── GET /messages/unread-count ─────────────────────────────────────── */

func (h *MessagesHandler) UnreadCount(c *fiber.Ctx) error {
	ctx := c.Context()
	me := auth.UserID(c)

	unread, err := h.queries.CountUnreadMessages(ctx, me)
	if err != nil {
		return serverError(c)
	}
	requests, err := h.queries.CountPendingRequests(ctx, me)
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"count": unread, "request_count": requests},
	})
}

/* ── GET /messages/conversations ────────────────────────────────────── */

func (h *MessagesHandler) Conversations(c *fiber.Ctx) error {
	ctx := c.Context()
	me := auth.UserID(c)

	// Pagination is opt-in: only when page or per_page is present. Absent, the
	// list is unbounded, which the query expresses as a very large LIMIT.
	paginate := c.Query("page") != "" || c.Query("per_page") != ""
	perPage := clampInt(c.QueryInt("per_page", 20), 1, 50)
	page := maxInt(c.QueryInt("page", 1), 1)

	limit := int32(1 << 30) // "all" when not paginating
	offset := int32(0)
	if paginate {
		// Over-fetch by one to detect has_more without a second COUNT.
		limit = int32(perPage + 1)
		offset = int32((page - 1) * perPage)
	}

	rows, err := h.queries.ListConversations(ctx, sqlc.ListConversationsParams{
		FollowerID: me, Limit: limit, Offset: offset,
	})
	if err != nil {
		return serverError(c)
	}

	hasMore := false
	if paginate && len(rows) > perPage {
		hasMore = true
		rows = rows[:perPage]
	}

	// My own status gates whether I may see a friends-only contact as online.
	meStatus, err := h.queries.GetUserActivityStatus(ctx, me)
	if err != nil {
		return serverError(c)
	}
	now := time.Now().UTC()

	data := make([]fiber.Map, 0, len(rows))
	for _, r := range rows {
		recent := r.LastActiveAt.Valid && r.LastActiveAt.Time.After(now.Add(-onlineWindow))
		status := r.ActivityStatus
		if status == "" {
			status = "public"
		}
		// public: anyone. friends: mutual follow, and I am not hiding myself.
		canSee := status == "public" ||
			(status == "friends" && meStatus != "no_one" && r.IsMutual.Valid && r.IsMutual.Bool)

		data = append(data, fiber.Map{
			"user_id":           r.UserID,
			"username":          r.Username,
			"name":              r.Name,
			"avatar":            h.avatar(r.Avatar),
			"is_verified":       r.IsVerified,
			"last_message":      nullableText(r.LastMessage),
			"last_ts":           rawTimestamp(r.LastTs),
			"last_sender_id":    r.LastSenderID,
			"last_read_at":      rawTimestamp(r.LastReadAt),
			"last_delivered_at": rawTimestamp(r.LastDeliveredAt),
			"unread_count":      r.UnreadCount,
			"is_online":         recent && canSee,
		})
	}

	resp := fiber.Map{"success": true, "data": data}
	if paginate {
		resp["meta"] = fiber.Map{"current_page": page, "has_more": hasMore}
	}
	return c.JSON(resp)
}

/* ── GET /messages/requests ─────────────────────────────────────────── */

func (h *MessagesHandler) Requests(c *fiber.Ctx) error {
	ctx := c.Context()
	me := auth.UserID(c)

	incoming, err := h.queries.ListIncomingRequests(ctx, me)
	if err != nil {
		return serverError(c)
	}
	sent, err := h.queries.ListSentRequests(ctx, me)
	if err != nil {
		return serverError(c)
	}

	renderIncoming := make([]fiber.Map, 0, len(incoming))
	for _, r := range incoming {
		renderIncoming = append(renderIncoming, h.requestRow(
			r.UserID, r.Username, r.Name, r.Avatar, r.IsVerified,
			r.ConversationID, r.Status, "incoming",
			r.LastMessage, r.LastMessageType, r.LastTs,
		))
	}
	renderSent := make([]fiber.Map, 0, len(sent))
	for _, r := range sent {
		renderSent = append(renderSent, h.requestRow(
			r.UserID, r.Username, r.Name, r.Avatar, r.IsVerified,
			r.ConversationID, r.Status, "sent",
			r.LastMessage, r.LastMessageType, r.LastTs,
		))
	}

	return c.JSON(fiber.Map{
		"success": true,
		"data":    fiber.Map{"incoming": renderIncoming, "sent": renderSent},
	})
}

// requestRow is the shared shape of an incoming/sent request. direction is a
// literal in Laravel's SELECT; here it is the caller's constant, which keeps the
// two queries free of a hardcoded column.
func (h *MessagesHandler) requestRow(
	userID int64, username, name string, avatar pgtype.Text, verified bool,
	conversationID int64, status, direction string,
	lastMessage, lastMessageType pgtype.Text, lastTs pgtype.Timestamp,
) fiber.Map {
	return fiber.Map{
		"user_id":           userID,
		"username":          username,
		"name":              name,
		"avatar":            h.avatar(avatar),
		"is_verified":       verified,
		"conversation_id":   conversationID,
		"status":            status,
		"direction":         direction,
		"last_message":      nullableText(lastMessage),
		"last_message_type": nullableText(lastMessageType),
		"last_ts":           rawTimestamp(lastTs),
	}
}

/* ── helpers ────────────────────────────────────────────────────────── */

func (h *MessagesHandler) avatar(key pgtype.Text) any {
	if !key.Valid || key.String == "" {
		return nil
	}
	return mediaJoin(h.mediaBaseURL, key.String)
}

// rawTimestamp is the Postgres wire format PDO hands back for a DB::select row:
// "2006-01-02 15:04:05" (space-separated, no zone), with microseconds only when
// non-zero. Distinct from toIso8601, which the resource endpoints use.
func rawTimestamp(t pgtype.Timestamp) any {
	if !t.Valid {
		return nil
	}
	return t.Time.Format("2006-01-02 15:04:05.999999")
}

func clampInt(v, lo, hi int) int {
	if v < lo {
		return lo
	}
	if v > hi {
		return hi
	}
	return v
}

func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}
