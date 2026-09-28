// Comment creation: CommentController::store.
//
// The gauntlet a comment runs, in Laravel's order (order matters - each gate
// returns a different status, so reshuffling them changes the API):
//
//  1. field validation, then "must carry something" (text, GIF or photo)
//  2. video must exist, be published, and have comments enabled
//  3. parent, if given, must be a visible comment ON THIS VIDEO
//  4. three per-user gates, only when commenting on SOMEONE ELSE's video:
//     - the admin-level disable_commenting_on_others restriction   -> 403
//     - the creator having restricted this user specifically       -> 403
//     - the creator's own blocked-word list                        -> 422
//  5. badge rank: only the first 3 top-level comments get one
//  6. text moderation -> hidden / held / public
//  7. insert, then resync counters from the DB rather than incrementing
//
// Counters are RECALCULATED, never blindly incremented, exactly as Laravel does
// it: prior deletes and hidden comments would otherwise let the drawer drift
// away from the feed's count.
//
// NOT ported (both deferred with the rest of NotificationService, and neither
// affects stored data): the "X replied to your comment" / "X commented on your
// video" notifications, and MentionService's @mention processing. Laravel still
// owns both. The realtime comment.created broadcast IS ported.
package handlers

import (
	"context"
	"errors"
	"net/url"
	"strconv"
	"strings"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"reelsoo/backend-go/internal/auth"
	"reelsoo/backend-go/internal/events"
	"reelsoo/backend-go/internal/sqlc"
	"reelsoo/backend-go/internal/textmod"
)

const (
	commentBodyMax      = 1000
	commentImageMaxByte = 5120 * 1024 // max:5120 is KILOBYTES -> 5 MB
	commentRankLimit    = 3
)

// commentImageFormats is the `mimes:jpeg,png,webp` set for an attached photo.
var commentImageFormats = map[string]string{
	"image/jpeg": "jpg",
	"image/png":  "png",
	"image/webp": "webp",
}

// Store creates a comment. POST /videos/:id/comments
func (h *CommentsHandler) Store(c *fiber.Ctx) error {
	videoID, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || videoID <= 0 {
		return notFound(c)
	}
	userID := auth.UserID(c)
	ctx := c.Context()

	tooMany, err := h.limiter.TooManyAttempts(ctx, "comment:min:"+itoa(userID), 10, 60)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You're commenting too fast. Try again in a minute.")
	}
	tooMany, err = h.limiter.TooManyAttempts(ctx, "comment:hour:"+itoa(userID), 150, 3600)
	if err != nil {
		return serverError(c)
	}
	if tooMany {
		return rateLimited(c, "You've reached the comment limit for now. Try again later.")
	}

	body := strings.TrimSpace(c.FormValue("body"))
	if utf8.RuneCountInString(body) > commentBodyMax {
		return storyValidationError(c, "body", "The body may not be greater than 1000 characters.")
	}
	gifURL := strings.TrimSpace(c.FormValue("gif_url"))
	if gifURL != "" && !isHTTPURL(gifURL, 500) {
		return storyValidationError(c, "gif_url", "The gif url format is invalid.")
	}
	gifPreview := strings.TrimSpace(c.FormValue("gif_preview_url"))
	if gifPreview != "" && !isHTTPURL(gifPreview, 500) {
		return storyValidationError(c, "gif_preview_url", "The gif preview url format is invalid.")
	}

	imageFile, _ := c.FormFile("image")

	// A comment must carry SOMETHING.
	if body == "" && gifURL == "" && imageFile == nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false,
			"message": "A comment must have text, a GIF, or a photo.",
		})
	}

	video, err := h.queries.GetPublishedVideoForComments(ctx, videoID)
	if err != nil {
		return notFound(c)
	}
	if !video.AllowComments {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false,
			"message": "Comments are disabled on this video.",
		})
	}

	/* ── Parent ──────────────────────────────────────────────────────── */
	var parent *sqlc.GetParentCommentForVideoRow
	var parentID pgtype.Int8
	if raw := strings.TrimSpace(c.FormValue("parent_id")); raw != "" && raw != "0" {
		pid, perr := strconv.ParseInt(raw, 10, 64)
		if perr != nil {
			return commentUnprocessable(c, "Invalid parent comment.")
		}
		p, gerr := h.queries.GetParentCommentForVideo(ctx, sqlc.GetParentCommentForVideoParams{
			ID: pid, VideoID: videoID,
		})
		if gerr != nil {
			return commentUnprocessable(c, "Invalid parent comment.")
		}
		parent = &p
		parentID = pgtype.Int8{Int64: pid, Valid: true}
	}

	/* ── Per-user gates, only on someone else's video ────────────────── */
	if video.UserID != userID {
		restricted, rerr := h.queries.GetCommentingRestriction(ctx, userID)
		if rerr != nil && !errors.Is(rerr, pgx.ErrNoRows) {
			return serverError(c)
		}
		// ErrNoRows leaves `restricted` false: forUser() would have created a
		// default row, and the default is unrestricted.
		if rerr == nil && restricted {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "You are not allowed to comment on other users' content at this time.",
			})
		}

		muted, merr := h.queries.IsCommentRestricted(ctx, sqlc.IsCommentRestrictedParams{
			CreatorID: video.UserID, UserID: userID,
		})
		if merr != nil {
			return serverError(c)
		}
		if muted {
			return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
				"success": false,
				"message": "You can no longer comment on this creator's content.",
			})
		}

		words, werr := h.queries.ListHiddenWords(ctx, video.UserID)
		if werr != nil {
			return serverError(c)
		}
		if firstBlockedWord(words, body) != "" {
			return commentUnprocessable(c, "Your comment contains a word the creator has blocked.")
		}
	}

	/* ── Badge rank + thread root ────────────────────────────────────── */
	var rank pgtype.Int2
	if parent == nil {
		topCount, cerr := h.queries.CountTopLevelCommentsForRank(ctx, videoID)
		if cerr != nil {
			return serverError(c)
		}
		if topCount < commentRankLimit {
			rank = pgtype.Int2{Int16: int16(topCount + 1), Valid: true}
		}
	}

	// root_id is the top-level comment owning the whole thread: null when this
	// IS the root, otherwise inherited so replies-to-replies share one root.
	var rootID pgtype.Int8
	if parent != nil {
		if parent.RootID.Valid {
			rootID = parent.RootID
		} else {
			rootID = pgtype.Int8{Int64: parent.ID, Valid: true}
		}
	}

	/* ── Moderation ──────────────────────────────────────────────────── */
	verdict := h.textmod.Check(body)
	isHidden := verdict.Action == textmod.ActionBlock
	isHeld := verdict.Action == textmod.ActionReview
	isPublic := !isHidden && !isHeld

	/* ── Optional photo ──────────────────────────────────────────────── */
	var imagePath pgtype.Text
	if imageFile != nil {
		if imageFile.Size > commentImageMaxByte {
			return storyValidationError(c, "image", "The image may not be greater than 5MB.")
		}
		data, rerr := readUpload(imageFile, commentImageMaxByte)
		if rerr != nil {
			return serverError(c)
		}
		ct := sniffContentType(data)
		ext, ok := commentImageFormats[ct]
		if !ok {
			return storyValidationError(c, "image", "The image must be a file of type: jpeg, png, webp.")
		}
		if !h.storage.Configured() {
			return serverError(c)
		}
		key, uerr := h.storage.StoreImage(ctx, data, "comments", ext, ct)
		if uerr != nil {
			return serverError(c)
		}
		imagePath = pgtype.Text{String: key, Valid: true}
	}

	/* ── Insert ──────────────────────────────────────────────────────── */
	comment, err := h.queries.InsertComment(ctx, sqlc.InsertCommentParams{
		VideoID:  videoID,
		UserID:   userID,
		ParentID: parentID,
		RootID:   rootID,
		// video_comments.body is NOT NULL, so an image/GIF-only comment stores an
		// empty string rather than NULL.
		Body:          body,
		GifUrl:        nullText(gifURL),
		GifPreviewUrl: nullText(gifPreview),
		GifProvider:   nullText(truncate(strings.TrimSpace(c.FormValue("gif_provider")), 50)),
		GifProviderID: nullText(truncate(strings.TrimSpace(c.FormValue("gif_provider_id")), 100)),
		ImagePath:     imagePath,
		CommentRank:   rank,
		IsHidden:      isHidden,
		HeldForReview: isHeld,
	})
	if err != nil {
		return serverError(c)
	}

	/* ── Counters: recalculate, never increment ──────────────────────── */
	if parent != nil && rootID.Valid {
		_ = h.queries.SyncRootReplyCount(ctx, rootID.Int64)
	}
	videoCommentsCount, err := h.queries.SyncVideoCommentsCount(ctx, videoID)
	if err != nil {
		return serverError(c)
	}

	var rootRepliesCount int64
	if rootID.Valid {
		rootRepliesCount, _ = h.queries.CountVisibleRootReplies(ctx, rootID)
	}

	// Only a genuinely public comment is broadcast - a hidden or held one must
	// not pop into anyone's open drawer.
	if isPublic && h.events != nil {
		h.events.Publish(events.NewCommentCreated(videoID, int32(videoCommentsCount)))
	}

	return c.Status(fiber.StatusCreated).JSON(fiber.Map{
		"success":              true,
		"data":                 h.formatNewComment(ctx, comment, video.UserID, userID),
		"root_comment_id":      nullableInt(rootID),
		"root_replies_count":   rootRepliesCount,
		"video_comments_count": videoCommentsCount,
		"moderation":           moderationPayload(verdict.Action),
	})
}

// moderationPayload mirrors the match() block store() returns - null when the
// verdict is clean, so the client only shows a notice when there is one.
func moderationPayload(a textmod.Action) any {
	switch a {
	case textmod.ActionBlock:
		return fiber.Map{"status": "blocked", "message": "Your comment may violate our community guidelines and has been hidden."}
	case textmod.ActionReview:
		return fiber.Map{"status": "pending", "message": "Your comment is pending review and will appear once approved."}
	case textmod.ActionWarn:
		return fiber.Map{"status": "warned", "message": "This comment may violate our community guidelines."}
	default:
		return nil
	}
}

// firstBlockedWord is UserHiddenWord::firstBlockedWord.
//
// Laravel uses `(?<![\p{L}\p{N}])word(?![\p{L}\p{N}])` - a unicode-aware
// boundary. Go's RE2 has no lookaround at all, so the same rule is implemented
// by scanning for each occurrence and checking the neighbouring runes directly.
// This is not an approximation: `\b` would NOT be equivalent, because it treats
// underscore as a word character and is not unicode-aware by default.
//
// The needle is used as stored while the haystack is lower-cased, matching
// Laravel exactly - a blocked word saved with capitals therefore never fires
// there or here.
func firstBlockedWord(words []string, text string) string {
	text = strings.TrimSpace(text)
	if text == "" || len(words) == 0 {
		return ""
	}
	hay := strings.ToLower(text)

	for _, w := range words {
		if w == "" {
			continue
		}
		for from := 0; from <= len(hay)-len(w); {
			i := strings.Index(hay[from:], w)
			if i < 0 {
				break
			}
			at := from + i
			if !isWordRuneBefore(hay, at) && !isWordRuneAfter(hay, at+len(w)) {
				return w
			}
			from = at + 1
		}
	}
	return ""
}

func isWordRuneBefore(s string, idx int) bool {
	if idx == 0 {
		return false
	}
	for i := idx - 1; i >= 0; i-- {
		if utf8.RuneStart(s[i]) {
			r, _ := utf8.DecodeRuneInString(s[i:])
			return unicode.IsLetter(r) || unicode.IsDigit(r)
		}
	}
	return false
}

func isWordRuneAfter(s string, idx int) bool {
	if idx >= len(s) {
		return false
	}
	r, _ := utf8.DecodeRuneInString(s[idx:])
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

func isHTTPURL(raw string, max int) bool {
	if len(raw) > max {
		return false
	}
	u, err := url.ParseRequestURI(raw)
	return err == nil && u.Scheme != "" && u.Host != ""
}

func commentUnprocessable(c *fiber.Ctx, msg string) error {
	return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{"success": false, "message": msg})
}

// formatNewComment renders the just-created row in the same shape the read
// surface emits, so a client can splice the response straight into its open
// list without a refetch. Counters are all zero by definition on a new comment,
// and is_author follows the VIDEO owner (CommentResource::$videoOwnerId), not
// the commenter.
func (h *CommentsHandler) formatNewComment(
	ctx context.Context, cm sqlc.InsertCommentRow, videoOwnerID, authorID int64,
) fiber.Map {
	m := fiber.Map{
		"id":                    cm.ID,
		"video_id":              cm.VideoID,
		"parent_id":             nullableInt(cm.ParentID),
		"root_id":               nullableInt(cm.RootID),
		"body":                  cm.Body,
		"likes_count":           cm.LikesCount,
		"dislike_count":         cm.DislikeCount,
		"replies_count":         cm.ReplyCount,
		"comment_rank":          nullableInt16(cm.CommentRank),
		"is_pinned":             cm.IsPinned,
		"is_edited":             cm.IsEdited,
		"is_author":             authorID == videoOwnerID,
		"gif_url":               nullableText(cm.GifUrl),
		"gif_preview_url":       nullableText(cm.GifPreviewUrl),
		"gif_provider":          nullableText(cm.GifProvider),
		"gif_provider_id":       nullableText(cm.GifProviderID),
		"edited_at":             nil,
		"current_user_reaction": nil,
	}
	// Raw storage path, matching the read surface, which notes that Laravel
	// wraps these with Storage::url() client-side of this layer.
	m["image_url"] = nullableText(cm.ImagePath)
	if cm.CreatedAt.Valid {
		m["created_at"] = cm.CreatedAt.Time.Format(time.RFC3339)
	} else {
		m["created_at"] = nil
	}
	if users, err := h.queries.GetCommentUsers(ctx, []int64{authorID}); err == nil && len(users) > 0 {
		u := users[0]
		m["user"] = fiber.Map{
			"id": u.ID, "username": u.Username, "name": u.Name,
			"avatar": nullableText(u.Avatar), "is_verified": u.IsVerified,
		}
	}
	return m
}
