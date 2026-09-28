package clickhouse

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Drainer consumes the Redis stream that Laravel writes analytics events to and
// feeds them into the ClickHouse batching Writer.
//
// This closes the last gap in the pipeline. Laravel owns the write paths that
// matter most - recordView, WatchController, likes, comments - and PHP has no
// business holding an INSERT open against ClickHouse (one part per view would
// destroy it). So Laravel appends to a stream in microseconds and returns; this
// drains that stream from a single goroutine and hands the events to the same
// batcher the Go handlers already use.
//
// Consumer GROUP, not a plain read: entries stay pending until acked, so a restart
// mid-batch replays what was in flight rather than dropping it. A plain XREAD (or a
// list + RPOP) loses whatever was read but not yet written when the process dies.
type Drainer struct {
	rdb    *redis.Client
	writer *Writer
}

const (
	streamKey = "analytics:events"
	groupName = "clickhouse"

	// consumerName identifies this process to Redis. Single-instance today; if the
	// Go API is ever scaled out, give each replica a distinct name and the group
	// will shard the stream between them for free.
	consumerName = "go-api-1"

	// readCount bounds how many entries one XREADGROUP pulls. The Writer batches
	// internally, so this only controls how much we hold in memory at once.
	readCount = 1000

	// blockFor is how long XREADGROUP parks waiting for new entries. Long enough
	// that an idle system is not spinning on Redis; short enough that shutdown is
	// responsive.
	blockFor = 5 * time.Second

	// reclaimAfter: if an entry has been pending this long, the consumer that took
	// it is presumed dead and we steal it back. Without this, a crash between read
	// and ack would leave those events pending forever - silently lost, which is the
	// exact failure mode the consumer group exists to prevent.
	reclaimAfter = 60 * time.Second
)

// NewDrainer returns nil (a valid no-op) when either Redis or ClickHouse is absent,
// mirroring the Writer's nil-safety: an unconfigured pipeline disables itself rather
// than crashing the API.
func NewDrainer(rdb *redis.Client, w *Writer) *Drainer {
	if rdb == nil || w == nil {
		return nil
	}
	return &Drainer{rdb: rdb, writer: w}
}

// Run drains until ctx is cancelled. Safe to call on a nil *Drainer.
func (d *Drainer) Run(ctx context.Context) {
	if d == nil {
		return
	}

	// MKSTREAM creates the stream if Laravel has not written to it yet, so the
	// consumer can start before the producer ever runs. BUSYGROUP just means the
	// group already exists, which is the normal case on every restart.
	err := d.rdb.XGroupCreateMkStream(ctx, streamKey, groupName, "0").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("clickhouse drain: cannot create consumer group: %v", err)
		return
	}

	log.Printf("clickhouse drain: consuming %s as %s/%s", streamKey, groupName, consumerName)

	reclaim := time.NewTicker(reclaimAfter)
	defer reclaim.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("clickhouse drain: stopped")
			return

		case <-reclaim.C:
			d.reclaimStale(ctx)

		default:
			d.readOnce(ctx)
		}
	}
}

// readOnce pulls one batch of new entries and acks what it manages to parse.
func (d *Drainer) readOnce(ctx context.Context) {
	res, err := d.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    groupName,
		Consumer: consumerName,
		Streams:  []string{streamKey, ">"}, // ">" = entries never delivered to anyone
		Count:    readCount,
		Block:    blockFor,
	}).Result()

	if err != nil {
		// redis.Nil simply means the block window expired with nothing new.
		if errors.Is(err, redis.Nil) || ctx.Err() != nil {
			return
		}
		log.Printf("clickhouse drain: read: %v", err)
		// Back off rather than hot-loop against a sick Redis.
		time.Sleep(time.Second)
		return
	}

	for _, stream := range res {
		d.handle(ctx, stream.Messages)
	}
}

// reclaimStale takes back entries a dead consumer read but never acked.
func (d *Drainer) reclaimStale(ctx context.Context) {
	msgs, _, err := d.rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   streamKey,
		Group:    groupName,
		Consumer: consumerName,
		MinIdle:  reclaimAfter,
		Start:    "0",
		Count:    readCount,
	}).Result()

	if err != nil {
		if !errors.Is(err, redis.Nil) && ctx.Err() == nil {
			log.Printf("clickhouse drain: autoclaim: %v", err)
		}
		return
	}
	if len(msgs) == 0 {
		return
	}

	log.Printf("clickhouse drain: reclaimed %d stale events", len(msgs))
	d.handle(ctx, msgs)
}

// handle decodes a batch, enqueues it, and acks.
//
// We ack even entries we could not decode. A malformed event is not going to become
// valid on a retry - leaving it pending would mean re-reading the same poison
// message forever and blocking everything behind it. Log it and move on.
func (d *Drainer) handle(ctx context.Context, msgs []redis.XMessage) {
	if len(msgs) == 0 {
		return
	}

	ids := make([]string, 0, len(msgs))

	for _, m := range msgs {
		ids = append(ids, m.ID)

		raw, ok := m.Values["json"].(string)
		if !ok {
			log.Printf("clickhouse drain: entry %s has no json field", m.ID)
			continue
		}

		ev, err := decodeEvent(raw)
		if err != nil {
			log.Printf("clickhouse drain: entry %s: %v", m.ID, err)
			continue
		}

		d.writer.Enqueue(ev)
	}

	if err := d.rdb.XAck(ctx, streamKey, groupName, ids...).Err(); err != nil && ctx.Err() == nil {
		// Not acking is survivable - the entries stay pending and get reclaimed. The
		// cost is that they may be written to ClickHouse twice. For counts that is a
		// real (small) over-count, but it beats losing them outright, and it only
		// happens when Redis is already failing.
		log.Printf("clickhouse drain: ack %d events: %v", len(ids), err)
	}
}

// wireEvent is the JSON contract with Laravel's EventStream::push. Field names must
// match what PHP writes; anything absent is simply zero.
type wireEvent struct {
	Type          string  `json:"type"`
	VideoID       uint64  `json:"video_id"`
	CreatorID     uint64  `json:"creator_id"`
	UserID        uint64  `json:"user_id"`
	SessionID     string  `json:"session_id"`
	Delta         int8    `json:"delta"`
	WatchSeconds  uint32  `json:"watch_seconds"`
	CompletionPct float32 `json:"completion_pct"`
	Source        string  `json:"source"`
	Country       string  `json:"country"`
	City          string  `json:"city"`
	DeviceType    string  `json:"device_type"`
	Platform      string  `json:"platform"`
	IPHash        uint64  `json:"ip_hash"`
	TS            string  `json:"ts"` // "2006-01-02 15:04:05.000" UTC, written by PHP
	// EventID is PHP's idempotency key. Laravel has already run its own
	// SET NX check before pushing, so anything arriving here is expected to be
	// unique; this rides along so the same verification query works regardless
	// of which producer wrote the row.
	EventID string `json:"event_id"`
}

func decodeEvent(raw string) (Event, error) {
	var w wireEvent
	if err := json.Unmarshal([]byte(raw), &w); err != nil {
		return Event{}, err
	}
	if w.Type == "" {
		return Event{}, errors.New("event has no type")
	}

	// Trust PHP's timestamp when it parses. Falling back to now() would attribute a
	// backlogged event to the moment we happened to drain it, which quietly smears
	// yesterday's views into today's chart after any outage.
	ts, err := time.Parse("2006-01-02 15:04:05.999", w.TS)
	if err != nil {
		ts = time.Now().UTC()
	}

	return Event{
		Time:          ts,
		Type:          w.Type,
		VideoID:       w.VideoID,
		CreatorID:     w.CreatorID,
		UserID:        w.UserID,
		SessionID:     w.SessionID,
		Delta:         w.Delta,
		WatchSeconds:  w.WatchSeconds,
		CompletionPct: w.CompletionPct,
		Source:        w.Source,
		Country:       w.Country,
		City:          w.City,
		DeviceType:    w.DeviceType,
		Platform:      w.Platform,
		IPHash:        w.IPHash,
		ID:            w.EventID,
	}, nil
}
