// Comments mirrors App\Http\Controllers\Api\CommentController's read/react/
// delete surface: index(), replies(), like(), unlike(), destroy(). Response
// shape matches CommentResource field-for-field.
//
// SCOPE NOTE: comment CREATION (store()) is deliberately NOT ported in this
// pass - it depends on TextModerationService (auto-hide/hold-for-review)
// and MentionService (~440 combined lines), plus UserHiddenWord creator
// blocklists, CommentRestrictedUser per-creator bans, and first-3-comments
// badge ranking. That's a large enough dependency chain to deserve its own
// dedicated increment rather than a rushed partial port. react() (generic
// love/dislike toggle), edit(), pin()/unpin(), report(), and the entire
// Studio-side moderation panel (StudioCommentController, 17 methods) are
// also not ported yet.
//
// NOT ported even for what IS here: NotificationService (comment/reply/
// like notifications, and the "does this author still have another
// visible comment" withdrawal logic in destroy()), and @mention processing.
//
// RealtimeBus::publish IS ported for what's here (see internal/events):
// comment delete/like/unlike publish to the video's Centrifugo room.
// comment.created stays Laravel-only (creation itself isn't ported - see the
// scope note above) and already publishes it there, untouched.
package handlers

import (
	"context"
	"errors"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/events"
	"reelsoo/backend-go/internal/ratelimit"
	"reelsoo/backend-go/internal/sqlc"
	"reelsoo/backend-go/internal/storage"
	"reelsoo/backend-go/internal/textmod"
)

type CommentsHandler struct {
	queries *sqlc.Queries
	pool    *pgxpool.Pool
	events  *events.Publisher
	// Creation only (comments_create.go): moderation tiering and the optional
	// attached photo. The read paths never touch either.
	textmod *textmod.Service
	storage *storage.Service
	// Creation only, same as above. Matches Laravel's throttle:comment-create
	// (Limit::perMinute(10) + Limit::perHour(150), both ->by(userID)).
	limiter *ratelimit.Limiter
}

func NewCommentsHandler(
	q *sqlc.Queries, pool *pgxpool.Pool, pub *events.Publisher,
	tm *textmod.Service, store *storage.Service, l *ratelimit.Limiter,
) *CommentsHandler {
	return &CommentsHandler{queries: q, pool: pool, events: pub, textmod: tm, storage: store, limiter: l}
}

// commentRow unifies the structurally-identical List.../GetCommentByID row
// types (same 19 columns, same order, in every comment query).
type commentRow struct {
	ID            int64
	VideoID       int64
	UserID        int64
	ParentID      pgtype.Int8
	RootID        pgtype.Int8
	Body          string
	GifUrl        pgtype.Text
	GifPreviewUrl pgtype.Text
	GifProvider   pgtype.Text
	GifProviderID pgtype.Text
	CommentRank   pgtype.Int2
	LikesCount    int32
	DislikeCount  int32
	ReplyCount    int32
	ReactionScore int32
	IsPinned      bool
	PinOrder      pgtype.Int4
	IsEdited      bool
	EditedAt      pgtype.Timestamp
	CreatedAt     pgtype.Timestamp
}

func fromTopLevelRow(r sqlc.ListVisibleTopLevelCommentsRow) commentRow { return commentRow(r) }
func fromThreadReplyRow(r sqlc.ListVisibleThreadRepliesRow) commentRow { return commentRow(r) }

/* ── GET /videos/{id}/comments ──────────────────────────────────────── */

func (h *CommentsHandler) Index(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}

	perPage := 20
	if v := c.Query("per_page"); v != "" {
		n, convErr := strconv.Atoi(v)
		if convErr != nil || n < 5 || n > 50 {
			return validationError(c, "per_page", "The per page must be between 5 and 50.")
		}
		perPage = n
	}
	page := 1
	if v := c.Query("page"); v != "" {
		if n, convErr := strconv.Atoi(v); convErr == nil && n > 0 {
			page = n
		}
	}

	ctx := c.Context()
	if _, err := h.queries.GetPublishedVideoForComments(ctx, videoID); err != nil {
		return notFound(c)
	}

	total, err := h.queries.CountTopLevelCommentsOnly(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	rows, err := h.queries.ListVisibleTopLevelComments(ctx, sqlc.ListVisibleTopLevelCommentsParams{
		VideoID: videoID, Limit: int32(perPage), Offset: int32((page - 1) * perPage),
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	comments := make([]commentRow, len(rows))
	ids := make([]int64, len(rows))
	for i, r := range rows {
		comments[i] = fromTopLevelRow(r)
		ids[i] = r.ID
	}

	repliesCount, err := h.repliesCountByParent(ctx, ids)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	authUserID := auth.UserID(c)
	rendered, err := h.render(ctx, comments, videoID, authUserID, repliesCount)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	visibleCount, err := h.queries.SyncVideoCommentsCount(ctx, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
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
		"success":                true,
		"data":                   rendered,
		"visible_comments_count": visibleCount,
		"video_comments_count":   visibleCount,
		"meta": fiber.Map{
			"current_page":  page,
			"last_page":     lastPage,
			"per_page":      perPage,
			"total":         total,
			"next_page_url": nextPageURL,
		},
	})
}

func (h *CommentsHandler) repliesCountByParent(ctx context.Context, parentIDs []int64) (map[int64]int64, error) {
	out := make(map[int64]int64, len(parentIDs))
	if len(parentIDs) == 0 {
		return out, nil
	}
	rows, err := h.queries.CountDirectRepliesByParent(ctx, parentIDs)
	if err != nil {
		return nil, err
	}
	for _, r := range rows {
		if r.ParentID.Valid {
			out[r.ParentID.Int64] = r.Cnt
		}
	}
	return out, nil
}

/* ── GET /comments/{id}/replies ─────────────────────────────────────── */

func (h *CommentsHandler) Replies(c *fiber.Ctx) error {
	parentID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()

	parent, err := h.queries.GetCommentByID(ctx, parentID)
	if err != nil {
		return notFound(c)
	}

	rootID := parentID
	if parent.RootID.Valid {
		rootID = parent.RootID.Int64
	}

	rows, err := h.queries.ListVisibleThreadReplies(ctx, pgtype.Int8{Int64: rootID, Valid: true})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	comments := make([]commentRow, len(rows))
	for i, r := range rows {
		comments[i] = fromThreadReplyRow(r)
	}

	authUserID := auth.UserID(c)
	rendered, err := h.render(ctx, comments, parent.VideoID, authUserID, nil)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	return c.JSON(fiber.Map{
		"success":         true,
		"data":            rendered,
		"total":           len(rendered),
		"root_comment_id": rootID,
	})
}

/* ── shared CommentResource-equivalent rendering ────────────────────── */

func (h *CommentsHandler) render(ctx context.Context, comments []commentRow, videoID, authUserID int64, repliesCount map[int64]int64) ([]fiber.Map, error) {
	if len(comments) == 0 {
		return []fiber.Map{}, nil
	}

	videoOwnerID, err := h.queries.GetVideoOwner(ctx, videoID)
	if err != nil {
		videoOwnerID = 0
	}

	userIDs := make([]int64, 0, len(comments))
	commentIDs := make([]int64, 0, len(comments))
	seen := make(map[int64]bool)
	for _, cm := range comments {
		if !seen[cm.UserID] {
			seen[cm.UserID] = true
			userIDs = append(userIDs, cm.UserID)
		}
		commentIDs = append(commentIDs, cm.ID)
	}

	users, err := h.queries.GetCommentUsers(ctx, userIDs)
	if err != nil {
		return nil, err
	}
	userByID := make(map[int64]sqlc.GetCommentUsersRow, len(users))
	for _, u := range users {
		userByID[u.ID] = u
	}

	reactionByComment := make(map[int64]string)
	if authUserID != 0 {
		reactions, err := h.queries.GetUserReactionsForComments(ctx, sqlc.GetUserReactionsForCommentsParams{
			UserID: authUserID, CommentIds: commentIDs,
		})
		if err != nil {
			return nil, err
		}
		for _, r := range reactions {
			reactionByComment[r.CommentID] = r.ReactionType
		}
	}

	out := make([]fiber.Map, len(comments))
	for i, cm := range comments {
		var repliesCountVal int64
		if repliesCount != nil {
			repliesCountVal = repliesCount[cm.ID]
		}

		m := fiber.Map{
			"id":                    cm.ID,
			"body":                  cm.Body,
			"love_count":            cm.LikesCount,
			"dislike_count":         cm.DislikeCount,
			"reply_count":           cm.ReplyCount,
			"reaction_score":        cm.ReactionScore,
			"is_pinned":             cm.IsPinned,
			"pin_order":             nullableInt4(cm.PinOrder),
			"parent_id":             nullableInt8(cm.ParentID),
			"root_id":               nullableInt8(cm.RootID),
			"comment_rank":          nullableInt2(cm.CommentRank),
			"current_user_reaction": nil,
			"is_own":                authUserID != 0 && cm.UserID == authUserID,
			"is_author":             cm.UserID == videoOwnerID,
			"is_edited":             cm.IsEdited,
			"replies_count":         repliesCountVal,
			"gif_url":               nullableText(cm.GifUrl),
			"gif_preview_url":       nullableText(cm.GifPreviewUrl),
			"gif_provider":          nullableText(cm.GifProvider),
			"gif_provider_id":       nullableText(cm.GifProviderID),
		}
		if reaction, ok := reactionByComment[cm.ID]; ok {
			m["current_user_reaction"] = reaction
		}
		if cm.EditedAt.Valid {
			m["edited_at"] = cm.EditedAt.Time.Format(time.RFC3339)
		} else {
			m["edited_at"] = nil
		}
		if cm.CreatedAt.Valid {
			m["created_at"] = cm.CreatedAt.Time.Format(time.RFC3339)
		} else {
			m["created_at"] = nil
		}
		if u, ok := userByID[cm.UserID]; ok {
			m["user"] = fiber.Map{
				"id":          u.ID,
				"username":    u.Username,
				"name":        u.Name,
				"avatar":      nullableText(u.Avatar), // NOTE: Laravel wraps this with Storage::url(); raw path here
				"is_verified": u.IsVerified,
			}
		} else {
			m["user"] = nil
		}
		out[i] = m
	}
	return out, nil
}

func nullableInt8(v pgtype.Int8) any {
	if v.Valid {
		return v.Int64
	}
	return nil
}
func nullableInt4(v pgtype.Int4) any {
	if v.Valid {
		return v.Int32
	}
	return nil
}
func nullableInt2(v pgtype.Int2) any {
	if v.Valid {
		return v.Int16
	}
	return nil
}

/* ── POST/DELETE /videos/{id}/comments/{cid}/like ───────────────────── */

func (h *CommentsHandler) Like(c *fiber.Ctx) error {
	videoID, cid, err := parseVideoAndCommentID(c)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()

	comment, err := h.queries.GetCommentByID(ctx, cid)
	if err != nil || comment.VideoID != videoID {
		return notFound(c)
	}

	userID := auth.UserID(c)
	genuine := false
	existing, err := h.queries.GetUserCommentReaction(ctx, sqlc.GetUserCommentReactionParams{CommentID: cid, UserID: userID})
	switch {
	case errors.Is(err, pgx.ErrNoRows):
		if err := h.queries.InsertCommentReaction(ctx, sqlc.InsertCommentReactionParams{CommentID: cid, UserID: userID, ReactionType: "love"}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if err := h.queries.IncrementCommentLikes(ctx, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if err := recalcReactionScore(ctx, h.queries, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		genuine = true
	case err != nil:
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	case existing == "dislike":
		if err := h.queries.UpdateCommentReactionType(ctx, sqlc.UpdateCommentReactionTypeParams{CommentID: cid, UserID: userID, ReactionType: "love"}); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if err := h.queries.DecrementCommentDislikes(ctx, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if err := h.queries.IncrementCommentLikes(ctx, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if err := recalcReactionScore(ctx, h.queries, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		genuine = true
		// existing == "love" already: no-op, matches Laravel exactly.
	}

	fresh, err := h.queries.GetCommentByID(ctx, cid)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if genuine {
		h.events.Publish(events.NewCommentLiked(videoID, cid, fresh.LikesCount))
	}
	return c.JSON(fiber.Map{"success": true, "liked": true, "likes_count": fresh.LikesCount})
}

func (h *CommentsHandler) Unlike(c *fiber.Ctx) error {
	videoID, cid, err := parseVideoAndCommentID(c)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()

	comment, err := h.queries.GetCommentByID(ctx, cid)
	if err != nil || comment.VideoID != videoID {
		return notFound(c)
	}

	userID := auth.UserID(c)
	deleted, err := h.queries.DeleteCommentReactionByType(ctx, sqlc.DeleteCommentReactionByTypeParams{
		CommentID: cid, UserID: userID, ReactionType: "love",
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if deleted > 0 {
		if err := h.queries.DecrementCommentLikes(ctx, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if err := recalcReactionScore(ctx, h.queries, cid); err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if fresh, err := h.queries.GetCommentByID(ctx, cid); err == nil {
			h.events.Publish(events.NewCommentUnliked(videoID, cid, fresh.LikesCount))
		}
	}

	return c.JSON(fiber.Map{"success": true, "liked": false})
}

// recalcReactionScore mirrors VideoComment::recalcReactionScore():
// score = love*3 - dislike*2 + replies*2 + freshness(0-48, decaying hourly
// over the comment's first 48h). Takes a *sqlc.Queries directly (rather
// than reading h.pool) so it works identically against the plain
// connection pool (Like/Unlike) or a tx-scoped instance (deleteCommentTx).
func recalcReactionScore(ctx context.Context, q *sqlc.Queries, commentID int64) error {
	row, err := q.GetCommentForReactionScore(ctx, commentID)
	if err != nil {
		return err
	}
	ageHours := int32(0)
	if row.CreatedAt.Valid {
		h := int32(time.Now().UTC().Sub(row.CreatedAt.Time).Hours())
		if h > 0 {
			ageHours = h
		}
	}
	freshness := int32(48) - ageHours
	if freshness < 0 {
		freshness = 0
	}
	score := row.LikesCount*3 - row.DislikeCount*2 + row.ReplyCount*2 + freshness
	return q.SetCommentReactionScore(ctx, sqlc.SetCommentReactionScoreParams{ID: commentID, ReactionScore: score})
}

func parseVideoAndCommentID(c *fiber.Ctx) (videoID, cid int64, err error) {
	videoID, err = strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil {
		return 0, 0, err
	}
	cid, err = strconv.ParseInt(c.Params("cid"), 10, 64)
	return videoID, cid, err
}

/* ── DELETE /videos/{id}/comments/{cid} ─────────────────────────────── */

func (h *CommentsHandler) Destroy(c *fiber.Ctx) error {
	videoID, cid, err := parseVideoAndCommentID(c)
	if err != nil {
		return c.Status(fiber.StatusNotFound).JSON(fiber.Map{"success": false})
	}
	ctx := c.Context()
	authUserID := auth.UserID(c)

	row, err := h.queries.GetCommentWithVideoOwnerForDelete(ctx, sqlc.GetCommentWithVideoOwnerForDeleteParams{ID: cid, VideoID: videoID})
	if err != nil {
		return notFound(c)
	}

	if authUserID != row.UserID && authUserID != row.VideoOwnerID {
		isAdmin, err := h.queries.IsAdminUser(ctx, authUserID)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if !isAdmin {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{"success": false, "message": "Forbidden."})
		}
	}

	videoCommentsCount, err := h.deleteCommentTx(ctx, row, videoID)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	h.events.Publish(events.NewCommentDeleted(videoID, videoCommentsCount))

	return c.JSON(fiber.Map{
		"success":              true,
		"message":              "Comment deleted.",
		"video_comments_count": videoCommentsCount,
	})
}

func (h *CommentsHandler) deleteCommentTx(ctx context.Context, row sqlc.GetCommentWithVideoOwnerForDeleteRow, videoID int64) (int32, error) {
	tx, err := h.pool.Begin(ctx)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback(ctx)
	q := sqlc.New(tx)

	ids, err := commentSubtreeIDs(ctx, q, row.ID)
	if err != nil {
		return 0, err
	}
	if err := q.SoftDeleteComments(ctx, ids); err != nil {
		return 0, err
	}

	var rootID int64
	if row.RootID.Valid {
		rootID = row.RootID.Int64
	} else if row.ParentID.Valid {
		rootID = row.ParentID.Int64
	}
	if rootID != 0 {
		if err := q.SyncRootReplyCount(ctx, rootID); err != nil {
			return 0, err
		}
	}
	if row.ParentID.Valid {
		if err := recalcReactionScore(ctx, q, row.ParentID.Int64); err != nil {
			return 0, err
		}
	}

	count, err := q.SyncVideoCommentsCount(ctx, videoID)
	if err != nil {
		return 0, err
	}
	return count, tx.Commit(ctx)
}

// commentSubtreeIDs mirrors commentSubtreeIds()'s BFS: the comment itself
// plus every descendant reply, so a top-level delete never leaves orphaned
// replies reachable only by ID.
func commentSubtreeIDs(ctx context.Context, q *sqlc.Queries, rootCommentID int64) ([]int64, error) {
	ids := []int64{rootCommentID}
	seen := map[int64]bool{rootCommentID: true}
	frontier := []int64{rootCommentID}

	for len(frontier) > 0 {
		children, err := q.GetChildCommentIDs(ctx, frontier)
		if err != nil {
			return nil, err
		}
		var next []int64
		for _, id := range children {
			if !seen[id] {
				seen[id] = true
				ids = append(ids, id)
				next = append(next, id)
			}
		}
		if len(next) == 0 {
			break
		}
		frontier = next
	}
	return ids, nil
}
