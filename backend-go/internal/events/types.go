// Package events is Reelsoo's internal event bus: the Go API publishes a
// typed Event to NATS JetStream (fire-and-forget, async, never blocks the
// HTTP request), and a durable consumer (see consumer.go) bridges it to
// Centrifugo so every connected client - mobile and web - sees the same
// live update Laravel's RealtimeBus already delivers for its own writes.
//
// Scope (Phase 1): the interaction counters that already have a live
// Laravel+Centrifugo counterpart and a documented gap on the Go side -
// video likes/unlikes, shares, comment delete/like/unlike, follow/unfollow.
// Comment CREATION stays Laravel-only (not yet ported to Go) and already
// publishes comment.created itself - untouched here.
//
// Room naming and the {event, payload} envelope are IDENTICAL to
// server/app/Services/RealtimeBus.php on purpose: an event published here
// lands in the exact same Centrifugo channel Laravel already broadcasts to,
// so existing mobile/web listeners for video.liked etc. need no changes.
package events

import (
	"time"

	"github.com/google/uuid"
)

// Type is one of the fixed, typed Phase-1 event names - the Centrifugo
// `event` field clients already switch on (mobile: CallProvider.tsx socket.on,
// web: centrifugo.ts dispatch).
type Type string

const (
	VideoLiked   Type = "video.liked"
	VideoUnliked Type = "video.unliked"
	VideoShared  Type = "video.shared"

	CommentCreated Type = "comment.created"
	CommentDeleted Type = "comment.deleted"
	CommentLiked   Type = "comment.liked"
	CommentUnliked Type = "comment.unliked"

	UserFollowed   Type = "user.followed"
	UserUnfollowed Type = "user.unfollowed"

	// Story interactions land in the OWNER's private user room - a view or a
	// reaction is only ever news to the author. Names match the events Laravel's
	// StoryController now publishes, so the mobile client's existing
	// story.viewed/story.reacted listeners work against either backend.
	StoryViewed  Type = "story.viewed"
	StoryReacted Type = "story.reacted"
	StoryReplied Type = "story.replied"

	// The owner-facing counters moved; every path that can change one view/
	// react/share/remove/reply pushes the fresh payload so an open viewers or
	// analytics sheet redraws without polling. Laravel emits the same name.
	StoryAnalyticsUpdated Type = "story.analytics.updated"
)

// Event is the publish unit: one JetStream message, one Centrifugo
// broadcast. ID is a UUID used both as the NATS de-dupe key (Nats-Msg-Id)
// and, downstream, as an idempotency key for the consumer - so a redelivery
// (JetStream is at-least-once) never double-broadcasts to Centrifugo.
type Event struct {
	ID         string         `json:"id"`
	Type       Type           `json:"type"`
	Rooms      []string       `json:"rooms"`
	Payload    map[string]any `json:"payload"`
	OccurredAt time.Time      `json:"occurred_at"`
}

func newEvent(t Type, rooms []string, payload map[string]any) Event {
	return Event{
		ID:         uuid.NewString(),
		Type:       t,
		Rooms:      rooms,
		Payload:    payload,
		OccurredAt: time.Now().UTC(),
	}
}

// VideoRoom / UserRoom mirror RealtimeBus::videoRoom/userRoom exactly
// ("video:<id>" public, "user:<id>" private) - the channel naming clients
// already subscribe to.
func VideoRoom(videoID int64) string { return "video:" + itoa(videoID) }
func UserRoom(userID int64) string   { return "user:" + itoa(userID) }

/* ── Typed constructors - one per Phase-1 interaction ─────────────────── */

func NewVideoLiked(videoID, likesCount int64) Event {
	return newEvent(VideoLiked, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "likes_count": likesCount,
	})
}

func NewVideoUnliked(videoID, likesCount int64) Event {
	return newEvent(VideoUnliked, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "likes_count": likesCount,
	})
}

// NewVideoShared fires ONLY after a share genuinely completed and the
// counter moved (ShareHandler.Share already dedupes a signed-in user to one
// share/video/day and never calls this on a repeat) - never on the share
// sheet merely opening.
func NewVideoShared(videoID int64, sharesCount int32) Event {
	return newEvent(VideoShared, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "shares_count": sharesCount,
	})
}

func NewCommentDeleted(videoID int64, videoCommentsCount int32) Event {
	return newEvent(CommentDeleted, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "video_comments_count": videoCommentsCount,
	})
}

func NewCommentLiked(videoID, commentID int64, likesCount int32) Event {
	return newEvent(CommentLiked, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "comment_id": commentID, "likes_count": likesCount,
	})
}

func NewCommentUnliked(videoID, commentID int64, likesCount int32) Event {
	return newEvent(CommentUnliked, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "comment_id": commentID, "likes_count": likesCount,
	})
}

// NewUserFollowed/Unfollowed broadcast to the FOLLOWED user's private room
// (matches Laravel: the counter that changed belongs to their profile).
func NewUserFollowed(followingID int64, followersCount int64) Event {
	return newEvent(UserFollowed, []string{UserRoom(followingID)}, map[string]any{
		"user_id": followingID, "followers_count": followersCount,
	})
}

func NewUserUnfollowed(followingID int64, followersCount int64) Event {
	return newEvent(UserUnfollowed, []string{UserRoom(followingID)}, map[string]any{
		"user_id": followingID, "followers_count": followersCount,
	})
}

func itoa(v int64) string {
	if v == 0 {
		return "0"
	}
	neg := v < 0
	if neg {
		v = -v
	}
	var buf [20]byte
	i := len(buf)
	for v > 0 {
		i--
		buf[i] = byte('0' + v%10)
		v /= 10
	}
	if neg {
		i--
		buf[i] = '-'
	}
	return string(buf[i:])
}

// NewStoryViewed / NewStoryReacted target the story owner's private room, the
// same shape StoryController publishes. viewer_id is included so a client can
// patch its viewer list without refetching if it wants to.
func NewStoryViewed(ownerID, storyID, viewerID int64) Event {
	return newEvent(StoryViewed, []string{UserRoom(ownerID)}, map[string]any{
		"story_id":  storyID,
		"viewer_id": viewerID,
	})
}

func NewStoryReacted(ownerID, storyID, viewerID int64, reactionType string) Event {
	return newEvent(StoryReacted, []string{UserRoom(ownerID)}, map[string]any{
		"story_id":      storyID,
		"viewer_id":     viewerID,
		"reaction_type": reactionType,
	})
}

func NewStoryReplied(ownerID, storyID, senderID int64) Event {
	return newEvent(StoryReplied, []string{UserRoom(ownerID)}, map[string]any{
		"story_id": storyID, "viewer_id": senderID,
	})
}

// NewStoryAnalyticsUpdated pushes the freshly recomputed counter set into the
// story owner's private room - RealtimeBus's 'story.analytics.updated', one
// event fired from every path that can move a number.
func NewStoryAnalyticsUpdated(ownerID, storyID int64, analytics map[string]any) Event {
	payload := make(map[string]any, len(analytics)+1)
	for k, v := range analytics {
		payload[k] = v
	}
	payload["story_id"] = storyID
	return newEvent(StoryAnalyticsUpdated, []string{UserRoom(ownerID)}, payload)
}

// NewCommentCreated is published only for a comment that is actually public -
// a hidden or held one must not pop into anyone's open drawer.
func NewCommentCreated(videoID int64, videoCommentsCount int32) Event {
	return newEvent(CommentCreated, []string{VideoRoom(videoID)}, map[string]any{
		"video_id": videoID, "video_comments_count": videoCommentsCount,
	})
}
