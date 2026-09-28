// Package clickhouse owns the analytics event stream: an in-process batching
// writer that fans video/profile events into ClickHouse, and the queries that
// read the rollups back out.
//
// The contract for everything in this package is that ANALYTICS MUST NEVER TAKE
// DOWN THE APP. ClickHouse being slow, full, or dead degrades us to "the Studio
// charts are stale", never to "the feed 500s". Concretely that means:
//
//   - Enqueue never blocks. A full buffer drops the event and bumps a counter.
//   - Flush errors are logged, never propagated to a request.
//   - A nil *Writer is a valid, silent no-op - so an unset CLICKHOUSE_DSN turns
//     the whole feature off with no branching at the call sites.
//
// Postgres remains the source of truth for anything a request must read back
// immediately after writing it (counters, balances, notifications).
package clickhouse

import "time"

// Event is one row of reelsoo.events. Field order and types mirror the DDL in
// deploy/clickhouse/schema/01-events.sql - the batch append below is positional,
// so the two must be kept in step.
type Event struct {
	Time      time.Time
	Type      string // see the event_type comment in 01-events.sql for the vocabulary
	VideoID   uint64 // 0 when not video-scoped (e.g. profile_view)
	CreatorID uint64 // owner of VideoID, or the profile being viewed
	UserID    uint64 // 0 = guest
	SessionID string

	// Delta is +1 for an engagement and -1 for its undo (like/unlike). Postgres
	// models an unlike as a row DELETE, which destroys the past; here the undo is
	// itself an event, so `sum(delta)` reconstructs any point in history.
	// Non-reversible events (view, skip, report) leave this at +1.
	Delta int8

	WatchSeconds  uint32  // incremental for this event, not cumulative - SUM() gives watch time
	CompletionPct float32 // 0..100; only meaningful on view_progress / watch_exit

	Source     string // feed / profile / search / share-link …
	Country    string // ISO-3166-1 alpha-2 ONLY. Laravel canonicalises names ('Nepal')
	           // to codes ('NP') before pushing - see EventStream::isoCountry. If a
	           // full name ever reaches here it becomes a second, phantom country.
	City       string // empty until GeoIP lands; Cloudflare sends CF-IPCity on Enterprise only
	DeviceType string // mobile / tablet / desktop
	Platform   string // ios / android / web

	IPHash  uint64 // cityHash64 of the client IP - never the IP itself
	Payload string // raw JSON escape hatch

	// ID is the client-generated idempotency key. Stored so that dedupe can be
	// verified after the fact (count() vs uniq(event_id)); the dedupe itself
	// happens at ingest, before Enqueue, because materialized views fire on
	// insert and would count a duplicate before any merge could collapse it.
	// See the note at the bottom of 01-events.sql. Empty is valid.
	ID string
}

// Event type vocabulary. Kept as constants so a typo is a compile error rather
// than a metric that silently reads zero forever.
const (
	// Playback
	TypeView         = "view"
	TypeViewProgress = "view_progress"
	TypeSkip         = "skip"
	TypeRewatch      = "rewatch"

	TypeWatchStart    = "watch_start"
	TypeWatchProgress = "watch_progress"
	TypeWatchPause    = "watch_pause"
	TypeWatchResume   = "watch_resume"
	TypeWatchHidden   = "watch_hidden"
	TypeWatchExit     = "watch_exit"

	// Engagement (each paired with its undo, so history survives)
	TypeLike            = "like"
	TypeUnlike          = "unlike"
	TypeSave            = "save"
	TypeUnsave          = "unsave"
	TypeShare           = "share"
	TypeComment         = "comment"
	TypeUncomment       = "uncomment"
	TypeFollowFromVideo = "follow_from_video"
	TypeUnfollow        = "unfollow_from_video"

	// Negative signals
	TypeNotInterested = "not_interested"
	TypeReport        = "report"

	// Profile
	TypeProfileView = "profile_view"
)

// undoOf maps an engagement to the event that reverses it. Used by the mutation
// handlers so an unlike is recorded as `like`/-1 rather than a distinct metric
// nobody remembers to subtract.
var undoOf = map[string]string{
	TypeLike:            TypeUnlike,
	TypeSave:            TypeUnsave,
	TypeComment:         TypeUncomment,
	TypeFollowFromVideo: TypeUnfollow,
}

// Undo returns the reversing event type and a -1 delta for a reversible
// engagement. ok is false for events that cannot be undone (a view is a view).
func Undo(eventType string) (undo string, delta int8, ok bool) {
	u, ok := undoOf[eventType]
	if !ok {
		return "", 0, false
	}
	return u, -1, true
}
