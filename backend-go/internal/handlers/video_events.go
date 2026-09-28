// Package handlers implements the migrated route surface. VideoEvents
// mirrors App\Http\Controllers\Api\VideoEventController::store exactly:
// same validation, same two rate limits, same like/save/follow dedupe, same
// preference-weight side effects, same debounced score recompute.
package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"hash/fnv"
	"strconv"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/clickhouse"
	"teezer/backend-go/internal/ratelimit"
	"teezer/backend-go/internal/scoring"
	"teezer/backend-go/internal/sqlc"
)

var validEventTypes = map[string]bool{
	"view_progress": true, "skip": true, "rewatch": true, "like": true,
	"comment": true, "share": true, "save": true, "follow_from_video": true,
	"not_interested": true, "report": true,
}

var dedupeEventTypes = map[string]bool{"like": true, "save": true, "follow_from_video": true}

// preferenceDelta mirrors VideoEventController::updateUserPreferences' match().
var preferenceDelta = map[string]float64{
	"like": 2.0, "save": 2.0, "rewatch": 2.0,
	"comment": 3.0, "share": 3.0,
	"follow_from_video": 5.0,
	"view_progress":     0.5,
	"skip":              -3.0,
	"not_interested":    -3.0,
	"report":            -10.0,
}

type videoEventRequest struct {
	VideoID   int64          `json:"video_id"`
	EventType string         `json:"event_type"`
	Payload   map[string]any `json:"payload"`
	SessionID *string        `json:"session_id"`
	// EventID is a client-generated idempotency key, optional for backward
	// compatibility - older app builds and any caller that omits it keep the
	// previous behaviour exactly.
	EventID *string `json:"event_id"`
}

// idempotencyWindow is how long an event id is remembered.
//
// Deliberately NOT the 24h the like/save dedupe uses. That one enforces a
// product rule ("one like per day counts once") and has to span a real day.
// This one only has to outlive a RETRY - a dropped connection, a gateway
// replay, an app resuming from background - which happens in seconds, not
// hours. Since every view and progress beat carries a key, a 24h window would
// hold two orders of magnitude more Redis keys than a 10-minute one to catch
// duplicates that essentially never arrive that late.
const idempotencyWindow = 10 * time.Minute

// maxEventIDLen bounds what a client can make us store. Long enough for a UUID
// or the app's session-scoped id, short enough that it cannot be used to stuff
// Redis.
const maxEventIDLen = 100

type VideoEventsHandler struct {
	queries    *sqlc.Queries
	limiter    *ratelimit.Limiter
	recomputer *scoring.Recomputer
	events     *clickhouse.Writer // nil => ClickHouse ingestion disabled; every Enqueue is a no-op
}

func NewVideoEventsHandler(q *sqlc.Queries, l *ratelimit.Limiter, r *scoring.Recomputer, events *clickhouse.Writer) *VideoEventsHandler {
	return &VideoEventsHandler{queries: q, limiter: l, recomputer: r, events: events}
}

func (h *VideoEventsHandler) Store(c *fiber.Ctx) error {
	var req videoEventRequest
	if err := c.BodyParser(&req); err != nil {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false, "message": "Invalid request body.",
		})
	}

	if req.VideoID <= 0 || !validEventTypes[req.EventType] {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false, "message": "The given data was invalid.",
		})
	}
	if req.SessionID != nil && len(*req.SessionID) > 64 {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false, "message": "session_id may not be greater than 64 characters.",
		})
	}
	if req.EventID != nil && len(*req.EventID) > maxEventIDLen {
		return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
			"success": false, "message": "event_id may not be greater than 100 characters.",
		})
	}
	if pct, ok := req.Payload["completion_pct"]; ok {
		if f, ok := pct.(float64); !ok || f < 0 || f > 100 {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"success": false, "message": "payload.completion_pct must be between 0 and 100.",
			})
		}
	}

	ctx := c.Context()

	// GetVideoOwner is the existence check AND the creator_id lookup. It runs the
	// same unscoped `WHERE id = $1` that VideoExists did, so validation behavior is
	// unchanged - but the row it returns carries the owner, which every ClickHouse
	// event needs denormalized onto it. No extra round-trip.
	creatorID, err := h.queries.GetVideoOwner(ctx, req.VideoID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return c.Status(fiber.StatusUnprocessableEntity).JSON(fiber.Map{
				"success": false, "message": "The selected video id is invalid.",
			})
		}
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	userID := auth.UserID(c) // 0 => guest
	subject := subjectKey(userID, c.IP())

	// ── Rate limiting (per event type, mirrors the controller's own
	// RateLimiter::tooManyAttempts/hit - separate from the route-level
	// throttle:300,1 applied in front of this handler) ──────────────────
	maxAttempts := 60
	if req.EventType == "view_progress" || req.EventType == "skip" {
		maxAttempts = 300
	}
	tooMany, err := h.limiter.TooManyAttempts(ctx, "event:"+req.EventType+":"+subject, maxAttempts, 60)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}
	if tooMany {
		return c.Status(fiber.StatusTooManyRequests).JSON(fiber.Map{
			"success": false, "message": "Too many events.",
		})
	}

	// ── Idempotency: drop a replay of an event we already recorded ──────
	//
	// This is the ONLY place duplicates can be stopped. The ClickHouse
	// materialized views aggregate on INSERT, so once a duplicate row reaches
	// the events table the rollups have already counted it twice and no merge,
	// FINAL or OPTIMIZE will walk that back - see the note at the bottom of
	// deploy/clickhouse/schema/01-events.sql.
	//
	// Scoped to the subject so one client's key cannot suppress another's
	// event, and returned as success: a retry did not fail, it just did not
	// need to happen again.
	if req.EventID != nil && *req.EventID != "" {
		key := "evt_id:" + subject + ":" + *req.EventID
		seen, err := h.limiter.SeenRecently(ctx, key, idempotencyWindow)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if seen {
			return c.JSON(fiber.Map{"success": true, "deduped": true})
		}
	}

	// ── Dedupe like/save/follow_from_video for 24h per subject+video ────
	if dedupeEventTypes[req.EventType] {
		key := "evt_dedup:" + req.EventType + ":" + itoa(req.VideoID) + ":" + subject
		seen, err := h.limiter.SeenRecently(ctx, key, 24*time.Hour)
		if err != nil {
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
		}
		if seen {
			return c.JSON(fiber.Map{"success": true, "deduped": true})
		}
	}

	// ── Persist event ────────────────────────────────────────────────────
	payloadJSON, err := json.Marshal(req.Payload)
	if err != nil || req.Payload == nil {
		payloadJSON = nil
	}

	var userIDParam pgtype.Int8
	if userID != 0 {
		userIDParam = pgtype.Int8{Int64: userID, Valid: true}
	}
	var sessionIDParam pgtype.Text
	if req.SessionID != nil {
		sessionIDParam = pgtype.Text{String: *req.SessionID, Valid: true}
	}

	_, err = h.queries.InsertVideoEvent(ctx, sqlc.InsertVideoEventParams{
		VideoID:   req.VideoID,
		UserID:    userIDParam,
		SessionID: sessionIDParam,
		EventType: req.EventType,
		Payload:   payloadJSON,
		IpAddress: pgtype.Text{String: c.IP(), Valid: c.IP() != ""},
	})
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{"success": false})
	}

	// ── Mirror into ClickHouse ───────────────────────────────────────────
	// Dual-write while we build confidence: Postgres above stays the source of
	// truth, this is the shadow copy the rollups are built from. Enqueue is
	// non-blocking and nil-safe, so with CLICKHOUSE_DSN unset this line costs
	// nothing and with ClickHouse down it drops the event rather than the request.
	// Note this sits AFTER the dedupe early-return, so deduped like/save/follow
	// events are excluded here exactly as they are from Postgres.
	h.events.Enqueue(clickhouse.Event{
		Type:          req.EventType,
		VideoID:       uint64(req.VideoID),
		CreatorID:     uint64(creatorID),
		UserID:        uint64(userID),
		SessionID:     strDeref(req.SessionID),
		WatchSeconds:  payloadUint32(req.Payload, "watch_duration"),
		CompletionPct: payloadFloat32(req.Payload, "completion_pct"),
		Platform:      payloadString(req.Payload, "platform"),
		IPHash:        hashIP(c.IP()),
		Payload:       string(payloadJSON),
		ID:            strDeref(req.EventID),
	})

	// ── Update personalization preferences (logged-in users only) ───────
	if userID != 0 {
		h.updateUserPreferences(ctx, userID, req.VideoID, req.EventType)
	}

	// ── Debounced async score recompute (5 min per video) ───────────────
	debounceKey := "score_job_debounce:" + itoa(req.VideoID)
	debounced, err := h.limiter.SeenRecently(ctx, debounceKey, 5*time.Minute)
	if err == nil && !debounced {
		videoID := req.VideoID
		go h.recomputer.Recompute(context.Background(), videoID)
	}

	return c.JSON(fiber.Map{"success": true})
}

func (h *VideoEventsHandler) updateUserPreferences(ctx context.Context, userID, videoID int64, eventType string) {
	delta, ok := preferenceDelta[eventType]
	if !ok || delta == 0 {
		return
	}

	video, err := h.queries.GetVideoForPreferences(ctx, videoID)
	if err != nil {
		return // video vanished between the exists check and here - drop silently, as Laravel does
	}

	tags, err := h.queries.GetVideoHashtagNames(ctx, videoID)
	if err == nil {
		for _, tag := range tags {
			h.adjust(ctx, userID, "hashtag", tag, delta)
		}
	}

	if video.Category.Valid && video.Category.String != "" {
		h.adjust(ctx, userID, "category", video.Category.String, delta)
	}

	if video.UserID != 0 && video.UserID != userID {
		h.adjust(ctx, userID, "creator", itoa(video.UserID), delta)
	}
}

func (h *VideoEventsHandler) adjust(ctx context.Context, userID int64, prefType, prefValue string, delta float64) {
	var n pgtype.Numeric
	_ = n.Scan(ftoa(delta))
	_ = h.queries.AdjustUserVideoPreference(ctx, sqlc.AdjustUserVideoPreferenceParams{
		UserID:    userID,
		PrefType:  prefType,
		PrefValue: prefValue,
		Column4:   n,
	})
}

func subjectKey(userID int64, ip string) string {
	if userID != 0 {
		return itoa(userID)
	}
	return ip
}

func itoa(v int64) string   { return strconv.FormatInt(v, 10) }
func ftoa(v float64) string { return strconv.FormatFloat(v, 'f', 4, 64) }

// ── ClickHouse payload extraction ───────────────────────────────────────────
// The client sends completion_pct / watch_duration / platform inside the free-form
// JSON payload. Postgres stores that blob whole and pays for it on every read
// (`(payload ->> 'completion_pct')::float` in the scoring aggregate). ClickHouse
// gets them lifted into real typed columns, which is most of why the rollups are
// fast. The raw blob still rides along in `payload` so nothing is lost.
//
// All of these are total: a missing or wrong-typed key yields the zero value
// rather than an error. Malformed client telemetry must never fail a request.

func strDeref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

func payloadFloat32(p map[string]any, key string) float32 {
	// encoding/json decodes every JSON number into float64.
	if v, ok := p[key].(float64); ok {
		return float32(v)
	}
	return 0
}

func payloadUint32(p map[string]any, key string) uint32 {
	v, ok := p[key].(float64)
	if !ok || v < 0 {
		return 0
	}
	return uint32(v)
}

func payloadString(p map[string]any, key string) string {
	if v, ok := p[key].(string); ok {
		return v
	}
	return ""
}

// hashIP reduces a client IP to an opaque 64-bit value. ClickHouse retains
// events for 13 months and raw IPs have no business living there that long -
// the hash still supports guest dedupe and abuse analysis, which is all the
// analytics side ever needed the IP for.
//
// The top 4 bits are masked off to stay byte-identical with Laravel's
// EventStream::hashIp (see server/app/Services/Analytics/EventStream.php). PHP's
// int is signed 64-bit and cannot hold a full uint64, so both sides drop the
// leading nibble. Without this, the same viewer would hash to two different
// values depending on whether Laravel or Go recorded the event.
const ipHashMask = 0x0FFFFFFFFFFFFFFF

func hashIP(ip string) uint64 {
	if ip == "" {
		return 0
	}
	h := fnv.New64a()
	_, _ = h.Write([]byte(ip))
	return h.Sum64() & ipHashMask
}
