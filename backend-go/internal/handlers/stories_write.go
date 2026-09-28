// Story interaction writes: StoryController::view / react / reply / destroy.
//
// These are the counters the story owner sees on their own story - "Seen by N"
// and the reaction list. Laravel already recorded them correctly; what it was
// missing until recently was announcing them, so an owner with the story open
// never saw a new viewer arrive. Both backends now publish story.viewed /
// story.reacted to the owner's private room, with identical names and payloads,
// so the mobile client's listeners work against either.
//
// Ported exactly:
//   - the live-story gate (published, unexpired, NOT soft-deleted) shared by all
//     three, matching Laravel's where-chain on each action;
//   - canViewStory as the security boundary - you cannot view, react to, or
//     count yourself into a story you were never allowed to see. Reused from the
//     read handler so the two can never drift apart;
//   - the owner's own view is not a view (Laravel returns early before the
//     insert), so "Seen by" never counts the author;
//   - view de-duplication via the unique (story_id, viewer_id) index, and
//     reaction de-duplication via (story_id, user_id) - one row per person
//     either way, and swapping a reaction updates in place;
//   - destroy() is a SOFT delete. Story uses Laravel's SoftDeletes trait, so
//     $story->delete() sets deleted_at. A hard DELETE here would both diverge
//     from Laravel and cascade the story's media, layers, views and reactions
//     away permanently.
//
// NOT ported (documented, none affect data correctness):
//   - NotificationService::notify for story_react ("X reacted to your story").
//     Laravel still owns in-app notifications; a reaction through Go records and
//     broadcasts, but does not create the notification row.
//   - NotificationService for story_reply, and the message.new realtime
//     broadcast the DM domain owns - Laravel still emits both.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"math"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/events"
	"teezer/backend-go/internal/sqlc"
)

// validReactions mirrors Laravel's `in:heart,fire,wow,haha,sad` rule exactly.
// Anything else is a 422, not a silently-stored value.
var validReactions = map[string]bool{
	"heart": true, "fire": true, "wow": true, "haha": true, "sad": true,
}

// storyIDParam parses :id, which the route already constrains to digits.
func storyIDParam(c *fiber.Ctx) (int64, bool) {
	id, err := strconv.ParseInt(c.Params("id"), 10, 64)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

// liveStory loads a story that is published, unexpired and not soft-deleted,
// and checks the caller is allowed to see it. Returns false having already
// written the 404 body when either test fails - the same "Not found." Laravel
// returns for a story you can't see, so visibility never leaks through a
// distinguishable error.
func (h *StoriesHandler) liveStory(c *fiber.Ctx, storyID, userID int64) (sqlc.GetLiveStoryForInteractionRow, bool) {
	ctx := c.Context()
	story, err := h.queries.GetLiveStoryForInteraction(ctx, storyID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			_ = notFound(c)
			return story, false
		}
		_ = serverError(c)
		return story, false
	}
	if !h.canViewStory(ctx, story.UserID, story.Status, story.ExpiresAt, story.Visibility, userID) {
		_ = notFound(c)
		return story, false
	}
	return story, true
}

// storyViewContext is the request body POST /stories/:id/view accepts - every
// field optional, exactly like Laravel's validation rule: the endpoint predates
// all of them and empty-body calls must keep recording a plain view.
type storyViewContext struct {
	Platform       string `json:"platform"`
	Device         string `json:"device"`
	SessionID      string `json:"session_id"`
	WatchDuration  int    `json:"watch_duration"`
	Completed      bool   `json:"completed"`
	SlideIndex     int    `json:"slide_index"`
	StoryMediaID   *int64 `json:"story_media_id"`
	ProgressOnly   bool   `json:"progress_only"`
}

func normalizePlatform(p string) string {
	switch p {
	case "ios", "android", "web", "mobile_web", "desktop_web":
		return p
	}
	return ""
}

func clipText(v string, max int) string {
	v = strings.TrimSpace(v)
	if v == "" {
		return ""
	}
	if len(v) > max {
		v = v[:max]
	}
	return v
}

func trimTo(v string, max int) string {
	return clipText(v, max)
}

// refreshStoryAnalytics recomputes the live aggregates, maintains the DERIVED
// story_analytics rollup row (so Laravel's reads/backfill converge with Go
// writes), and returns the analytics payload - the same shape clients already
// read from /stories/{id}/analytics.
func (h *StoriesHandler) refreshStoryAnalytics(c *fiber.Ctx, storyID, ownerID int64) (map[string]any, error) {
	agg, err := h.queries.SelectStoryAnalytics(c.Context(), storyID, ownerID)
	if err != nil {
		return nil, err
	}
	breakdownRows, err := h.queries.CountStoryReactionsByType(c.Context(), storyID, ownerID)
	if err != nil {
		return nil, err
	}
	breakdown := map[string]int64{
		"heart": 0, "fire": 0, "wow": 0, "haha": 0, "sad": 0,
	}
	for _, r := range breakdownRows {
		breakdown[r.ReactionType] = r.Cnt
	}
	bjson, _ := json.Marshal(breakdown)

	if err := h.queries.UpsertStoryAnalyticsRollup(c.Context(), sqlc.UpsertStoryAnalyticsRollupParams{
		StoryID:           storyID,
		StoryOwnerID:      ownerID,
		UniqueViewers:     agg.UniqueViewers,
		ReactionCount:     reactionTotal(breakdown),
		ReplyCount:        agg.ReplyCount,
		ShareCount:        agg.ShareCount,
		TotalViewEvents:   agg.TotalViewEvents,
		CompletionCount:   agg.CompletionCount,
		TotalWatchSeconds: agg.TotalWatchSecond,
		ReactionsJson:     string(bjson),
	}); err != nil {
		return nil, err
	}

	var rate float64
	avg := 0.0
	if agg.UniqueViewers > 0 {
		rate = round1(float64(agg.CompletionCount) / float64(agg.UniqueViewers) * 100)
		avg = round1(float64(agg.TotalWatchSecond) / float64(agg.UniqueViewers))
	}
	return map[string]any{
		"story_id":            storyID,
		"unique_viewers":      agg.UniqueViewers,
		"reaction_count":      reactionTotal(breakdown),
		"reply_count":         agg.ReplyCount,
		"share_count":         agg.ShareCount,
		"reactions_breakdown": breakdown,
		"total_view_events":   agg.TotalViewEvents,
		"completion_count":    agg.CompletionCount,
		"total_watch_seconds": agg.TotalWatchSecond,
		"avg_watch_seconds":   avg,
		"completion_rate":     rate,
	}, nil
}

func round1(v float64) float64 { return math.Round(v*10) / 10 }

// publishAnalytics recomputes the rollup and pushes 'story.analytics.updated'
// into the owner's private room with the freshly computed payload - Laravel's
// RealtimeBus event name, so existing mobile/web listeners redraw without
// changes. Errors are swallowed on the write paths: losing a live nudge must
// not fail the underlying view/react/share write.
func (h *StoriesHandler) publishAnalytics(c *fiber.Ctx, storyID, ownerID int64) {
	payload, err := h.refreshStoryAnalytics(c, storyID, ownerID)
	if err != nil || h.events == nil {
		return
	}
	h.events.Publish(events.NewStoryAnalyticsUpdated(ownerID, storyID, payload))
}

// reactionTotal sums the full breakdown - every supported type is present, so
// the sum IS reaction_count, identical to array_sum($breakdown) in PHP.
func reactionTotal(breakdown map[string]int64) int64 {
	var t int64
	for _, n := range breakdown {
		t += n
	}
	return t
}
// announceView publishes the owner-facing story events a counter change should
// announce. Mirrors Laravel: a brand-new unique viewer nudges the owner
// (story.viewed + a fresh analytics payload); a rewatch does not re-announce.
func (h *StoriesHandler) announceView(c *fiber.Ctx, storyID, ownerID, viewerID int64, isFirstView bool) {
	if !isFirstView {
		return
	}
	if h.events != nil {
		h.events.Publish(events.NewStoryViewed(ownerID, storyID, viewerID))
	}
	h.publishAnalytics(c, storyID, ownerID)
}

// View records a story view (and any watch-progress context). POST /stories/:id/view
func (h *StoriesHandler) View(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	userID := auth.UserID(c)

	var ctx_ storyViewContext
	if len(c.Body()) > 0 {
		_ = c.BodyParser(&ctx_)
	}
	// Clamp like Laravel's rules.
	duration := ctx_.WatchDuration
	if duration < 0 {
		duration = 0
	}
	if duration > 86400 {
		duration = 86400
	}
	completed := ctx_.Completed

	story, ok := h.liveStory(c, storyID, userID)
	if !ok {
		return nil
	}

	// The author viewing their own story is not a view - Laravel returns before
	// touching story_views, so the owner never appears in their own viewer list.
	if story.UserID == userID {
		return c.JSON(fiber.Map{"success": true})
	}

	platform := pgtype.Text{}
	if p := normalizePlatform(ctx_.Platform); p != "" {
		platform = pgtype.Text{String: p, Valid: true}
	}
	device := pgtype.Text{}
	if d := trimTo(ctx_.Device, 120); d != "" {
		device = pgtype.Text{String: d, Valid: true}
	}
	session := pgtype.Text{}
	if s := trimTo(ctx_.SessionID, 64); s != "" {
		session = pgtype.Text{String: s, Valid: true}
	}

	// Always insert/per-collect a story_view_events row: it is the per-watch
	// detail table. story_media_id is nullable; slide_index comes from the body.
	var mediaID pgtype.Int8
	if ctx_.StoryMediaID != nil {
		mediaID = pgtype.Int8{Int64: *ctx_.StoryMediaID, Valid: true}
	}
	errEvent := h.queries.InsertStoryViewEvent(c.Context(), sqlc.InsertStoryViewEventParams{
		StoryID:      storyID,
		ViewerID:     userID,
		StoryOwnerID: story.UserID,
		StoryMediaID: mediaID,
		SlideIndex:   int32(ctx_.SlideIndex),
		Platform:     platform,
		Device:       device,
		SessionID:    session,
		WatchSeconds: int32(duration),
		Completed:    completed,
	})
	if errEvent != nil {
		return serverError(c)
	}

	// Step 1a: claim the unique-viewer row. RETURNING id => FIRST view.
	_, err := h.queries.InsertStoryView(c.Context(), sqlc.InsertStoryViewParams{
		StoryID:      storyID,
		ViewerID:     userID,
		StoryOwnerID: story.UserID,
		Platform:     platform,
		Device:       device,
		SessionID:    session,
		WatchSeconds: int32(duration),
		Completed:    completed,
	})
	switch {
	case err == nil:
		// First view - announce.
		h.announceView(c, storyID, story.UserID, userID, true)
	case errors.Is(err, pgx.ErrNoRows):
		// Existing viewer -> rewatch or progress-only fold. progress_only is
		// "report how long the watch lasted", never a second watch.
		if ctx_.ProgressOnly {
			_ = h.queries.FoldStoryViewProgress(c.Context(), storyID, userID, int32(duration), completed)
			// Fold the measurement into the event row this progress belongs to.
			latestEventId, e := h.queries.LatestStoryViewEventID(c.Context(), storyID, userID)
			if e == nil {
				_ = h.queries.FoldStoryViewEventProgress(c.Context(), latestEventId, int32(duration), completed)
			}
		} else {
			_ = h.queries.TouchStoryViewRewatch(c.Context(), storyID, userID, int32(duration), completed)
		}
	default:
		return serverError(c)
	}

	return c.JSON(fiber.Map{"success": true})
}

// React sets or replaces the caller's reaction. POST /stories/:id/react
func (h *StoriesHandler) React(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	userID := auth.UserID(c)

	var body struct {
		ReactionType string `json:"reaction_type"`
	}
	if err := c.BodyParser(&body); err != nil || !validReactions[body.ReactionType] {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false,
			"message": "The selected reaction type is invalid.",
			"errors":  fiber.Map{"reaction_type": []string{"The selected reaction type is invalid."}},
		})
	}

	story, ok := h.liveStory(c, storyID, userID)
	if !ok {
		return nil
	}

	if err := h.queries.UpsertStoryReaction(c.Context(), sqlc.UpsertStoryReactionParams{
		StoryID: storyID, UserID: userID, ReactionType: body.ReactionType,
	}); err != nil {
		return serverError(c)
	}

	// Self-reactions are stored (Laravel stores them too - the upsert runs before
	// its owner check). The announce + analytics push are for the owner only.
	if story.UserID != userID {
		if h.events != nil {
			h.events.Publish(events.NewStoryReacted(story.UserID, storyID, userID, body.ReactionType))
		}
		h.publishAnalytics(c, storyID, story.UserID)
	}

	return c.JSON(fiber.Map{"success": true})
}

// RemoveReaction takes back the caller's reaction on a story. DELETE /stories/:id/reaction
//
// Idempotent by contract: removing a reaction that is not there is still a
// success (`removed=false`), exactly like Laravel's removeReaction - the
// caller's intent is satisfied either way, and a retry after a dropped
// response must not fail.
func (h *StoriesHandler) RemoveReaction(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	userID := auth.UserID(c)

	// findOrFail WITHOUT the owner or live-story gates: you can always take back
	// your OWN reaction on a story you could see, even one that has since
	// expired (Laravel's removeReaction loads the bare story then deletes by
	// (story_id, user_id)). A missing story is still a 404.
	story, err := h.queries.GetStoryOwner(c.Context(), storyID)
	switch {
	case err == nil:
	case errors.Is(err, pgx.ErrNoRows):
		return notFound(c)
	default:
		return serverError(c)
	}

	removed, err := h.queries.DeleteStoryReaction(c.Context(), storyID, userID)
	if err != nil {
		return serverError(c)
	}

	if removed > 0 && story.UserID != userID {
		h.publishAnalytics(c, storyID, story.UserID)
	}

	return c.JSON(fiber.Map{"success": true, "data": fiber.Map{"removed": removed > 0}})
}

// Share records a story share. POST /stories/:id/share
//
// A share is an EVENT ("sent it"), not a state ("has seen it") - so unlike a
// view it is deliberately NOT deduplicated: sending to three friends is three
// shares. Mirrors Laravel's recordShare + authorization + allow_resharing gate.
func (h *StoriesHandler) Share(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	userID := auth.UserID(c)

	var body struct {
		Channel      string `json:"channel"`
		TargetUserID *int64 `json:"target_user_id"`
		Platform     string `json:"platform"`
	}
	if len(c.Body()) > 0 {
		_ = c.BodyParser(&body)
	}

	// Same validation set as Laravel: channel in dm/copy_link/external/repost,
	// platform free-form max 20.
	channel := body.Channel
	switch channel {
	case "", "dm", "copy_link", "external", "repost":
	default:
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false,
			"message": "The selected channel is invalid.",
			"errors":  fiber.Map{"channel": []string{"The selected channel is invalid."}},
		})
	}
	if channel == "" {
		channel = "copy_link"
	}

	story, ok2 := h.liveStory(c, storyID, userID)
	if !ok2 {
		return nil
	}

	// The author's own choice, honoured server-side.
	if !story.AllowResharing {
		return c.Status(fiber.StatusForbidden).JSON(fiber.Map{
			"success": false,
			"message": "Resharing is turned off for this story.",
		})
	}

	var target pgtype.Int8
	if body.TargetUserID != nil {
		target = pgtype.Int8{Int64: *body.TargetUserID, Valid: true}
	}
	platform := pgtype.Text{}
	if p := clipText(body.Platform, 20); p != "" {
		platform = pgtype.Text{String: p, Valid: true}
	}

	if err := h.queries.InsertStoryShare(c.Context(), sqlc.InsertStoryShareParams{
		StoryID:      storyID,
		SharerID:     userID,
		StoryOwnerID: story.UserID,
		Channel:      channel,
		TargetUserID: target,
		Platform:     platform,
	}); err != nil {
		return serverError(c)
	}

	// Owner sharing their own story moves no one's analytics - only a change
	// to someone ELSE's counter announces (Laravel gates `user->id !== owner`).
	if story.UserID != userID {
		h.publishAnalytics(c, storyID, story.UserID)
	}

	return c.JSON(fiber.Map{"success": true})
}

// Destroy soft-deletes one of the caller's own stories. DELETE /stories/:id
func (h *StoriesHandler) Destroy(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	userID := auth.UserID(c)

	// Owner-scoped and already-deleted-scoped in one statement: someone else's
	// story and an already-deleted story are both a 404, matching findOrFail on
	// `where id = ? and user_id = me` under the SoftDeletes global scope.
	_, err := h.queries.SoftDeleteOwnStory(c.Context(), sqlc.SoftDeleteOwnStoryParams{
		ID: storyID, UserID: userID,
	})
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return notFound(c)
		}
		return serverError(c)
	}

	return c.JSON(fiber.Map{"success": true, "message": "Story deleted."})
}

// Reply sends a story reply. POST /stories/:id/reply
//
// A reply is two writes, not one, and Laravel does both:
//  1. a story_messages row - what the owner's viewer sheet reads to mark a
//     viewer as having "Replied";
//  2. a real direct_messages row of type 'story_reply', carrying the story id
//     and a thumbnail, so the reply lands in the owner's inbox as a normal DM
//     with story context attached.
//
// The conversation is found-or-created on the ORDERED pair (user_a = lower id)
// so the same thread is reused whichever direction it started in, and a story
// reply always lands 'approved': replying to someone's story is consent enough
// to open a thread, which is why this path bypasses the message-request flow.
// If a pending request the OWNER received already exists, the reply upgrades it
// to approved rather than leaving it buried in their requests list.
//
// NOT ported: NotificationService for story_reply, and the message.new realtime
// broadcast that the DM domain owns - Laravel still emits both.
func (h *StoriesHandler) Reply(c *fiber.Ctx) error {
	storyID, ok := storyIDParam(c)
	if !ok {
		return notFound(c)
	}
	userID := auth.UserID(c)

	var body struct {
		Message string `json:"message"`
	}
	if err := c.BodyParser(&body); err != nil {
		return replyInvalid(c)
	}
	msg := strings.TrimSpace(body.Message)
	// Laravel: required|string|max:500. Trim first so whitespace isn't a message.
	if msg == "" || utf8.RuneCountInString(msg) > 500 {
		return replyInvalid(c)
	}

	story, ok := h.liveStory(c, storyID, userID)
	if !ok {
		return nil
	}
	// allow_replies is part of Laravel's where-chain, so a story with replies
	// off is a 404 here, not a 403 - same as asking for a story you can't see.
	if !story.AllowReplies {
		return notFound(c)
	}

	ctx := c.Context()

	// story_messages is written even for a self-reply: Laravel inserts it before
	// the owner check, and it is what drives the "Replied" flag.
	if err := h.queries.InsertStoryMessage(ctx, sqlc.InsertStoryMessageParams{
		StoryID:    storyID,
		SenderID:   userID,
		ReceiverID: story.UserID,
		Message:    msg,
	}); err != nil {
		return serverError(c)
	}

	// Replying to your own story creates no DM and notifies nobody.
	if story.UserID == userID {
		return c.JSON(fiber.Map{"success": true, "message": "Reply sent."})
	}

	convID, err := h.findOrCreateConversation(ctx, userID, story.UserID)
	if err != nil {
		return serverError(c)
	}

	if _, err := h.queries.InsertStoryReplyMessage(ctx, sqlc.InsertStoryReplyMessageParams{
		ConversationID:    pgtype.Int8{Int64: convID, Valid: true},
		SenderID:          userID,
		ReceiverID:        story.UserID,
		Body:              pgtype.Text{String: msg, Valid: true},
		StoryID:           pgtype.Int8{Int64: storyID, Valid: true},
		StoryThumbnailUrl: h.storyPreviewURL(ctx, storyID),
	}); err != nil {
		return serverError(c)
	}

	if h.events != nil {
		h.events.Publish(events.NewStoryReplied(story.UserID, storyID, userID))
	}

	return c.JSON(fiber.Map{"success": true, "message": "Reply sent."})
}

// findOrCreateConversation returns the thread between two users, creating it
// approved when absent and upgrading a pending request the OWNER received.
func (h *StoriesHandler) findOrCreateConversation(ctx context.Context, senderID, ownerID int64) (int64, error) {
	a, b := senderID, ownerID
	if a > b {
		a, b = b, a
	}

	conv, err := h.queries.GetConversationBetween(ctx, sqlc.GetConversationBetweenParams{
		UserAID: a, UserBID: b,
	})
	if err == nil {
		if conv.Status == "pending_request" && conv.ReceivedBy == ownerID {
			if err := h.queries.ApproveConversation(ctx, conv.ID); err != nil {
				return 0, err
			}
		}
		return conv.ID, nil
	}
	if !errors.Is(err, pgx.ErrNoRows) {
		return 0, err
	}

	return h.queries.InsertConversation(ctx, sqlc.InsertConversationParams{
		UserAID:     a,
		UserBID:     b,
		InitiatedBy: senderID,
		ReceivedBy:  ownerID,
	})
}

// storyPreviewURL is the thumbnail attached to the DM: a video slide uses its
// keyframe, an image uses the image itself, and both are signed exactly like
// the read surface signs story media. Absent media is not an error - the DM
// simply carries no preview.
func (h *StoriesHandler) storyPreviewURL(ctx context.Context, storyID int64) pgtype.Text {
	m, err := h.queries.PickStoryPreviewMedia(ctx, storyID)
	if err != nil {
		return pgtype.Text{}
	}
	raw := m.MediaUrl.String
	if m.MediaType == "video" && m.ThumbnailUrl.Valid && m.ThumbnailUrl.String != "" {
		raw = m.ThumbnailUrl.String
	}
	if raw == "" {
		return pgtype.Text{}
	}
	return pgtype.Text{String: signedCdnURL(h.mediaBaseURL, h.signingSecret, raw, storyMediaTTL), Valid: true}
}

func replyInvalid(c *fiber.Ctx) error {
	return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
		"success": false,
		"message": "The message field is required.",
		"errors":  fiber.Map{"message": []string{"The message field is required."}},
	})
}
