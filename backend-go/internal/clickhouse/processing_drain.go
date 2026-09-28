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

// ProcessingDrainer consumes the Redis stream Laravel writes video-processing
// pipeline events to and feeds them into ProcessingWriter - the exact same
// shape as Drainer (drain.go), duplicated (not generalized) for the same
// reason ProcessingWriter is: a genuinely different stream, group, and
// target table, sharing only the mechanism.
type ProcessingDrainer struct {
	rdb    *redis.Client
	writer *ProcessingWriter
}

const (
	procStreamKey    = "video_processing:events"
	procGroupName    = "clickhouse-processing"
	procConsumerName = "go-api-1"

	procReadCount    = 200
	procBlockFor     = 5 * time.Second
	procReclaimAfter = 60 * time.Second
)

// NewProcessingDrainer returns nil (a valid no-op) when either Redis or
// ClickHouse is absent - mirrors ProcessingWriter's own nil-safety.
func NewProcessingDrainer(rdb *redis.Client, w *ProcessingWriter) *ProcessingDrainer {
	if rdb == nil || w == nil {
		return nil
	}
	return &ProcessingDrainer{rdb: rdb, writer: w}
}

// Run drains until ctx is cancelled. Safe to call on a nil *ProcessingDrainer.
func (d *ProcessingDrainer) Run(ctx context.Context) {
	if d == nil {
		return
	}

	err := d.rdb.XGroupCreateMkStream(ctx, procStreamKey, procGroupName, "0").Err()
	if err != nil && !strings.Contains(err.Error(), "BUSYGROUP") {
		log.Printf("clickhouse processing-drain: cannot create consumer group: %v", err)
		return
	}

	log.Printf("clickhouse processing-drain: consuming %s as %s/%s", procStreamKey, procGroupName, procConsumerName)

	reclaim := time.NewTicker(procReclaimAfter)
	defer reclaim.Stop()

	for {
		select {
		case <-ctx.Done():
			log.Println("clickhouse processing-drain: stopped")
			return

		case <-reclaim.C:
			d.reclaimStale(ctx)

		default:
			d.readOnce(ctx)
		}
	}
}

func (d *ProcessingDrainer) readOnce(ctx context.Context) {
	res, err := d.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    procGroupName,
		Consumer: procConsumerName,
		Streams:  []string{procStreamKey, ">"},
		Count:    procReadCount,
		Block:    procBlockFor,
	}).Result()

	if err != nil {
		if errors.Is(err, redis.Nil) || ctx.Err() != nil {
			return
		}
		log.Printf("clickhouse processing-drain: read: %v", err)
		time.Sleep(time.Second)
		return
	}

	for _, stream := range res {
		d.handle(ctx, stream.Messages)
	}
}

func (d *ProcessingDrainer) reclaimStale(ctx context.Context) {
	msgs, _, err := d.rdb.XAutoClaim(ctx, &redis.XAutoClaimArgs{
		Stream:   procStreamKey,
		Group:    procGroupName,
		Consumer: procConsumerName,
		MinIdle:  procReclaimAfter,
		Start:    "0",
		Count:    procReadCount,
	}).Result()

	if err != nil {
		if !errors.Is(err, redis.Nil) && ctx.Err() == nil {
			log.Printf("clickhouse processing-drain: autoclaim: %v", err)
		}
		return
	}
	if len(msgs) == 0 {
		return
	}

	log.Printf("clickhouse processing-drain: reclaimed %d stale events", len(msgs))
	d.handle(ctx, msgs)
}

func (d *ProcessingDrainer) handle(ctx context.Context, msgs []redis.XMessage) {
	if len(msgs) == 0 {
		return
	}

	ids := make([]string, 0, len(msgs))

	for _, m := range msgs {
		ids = append(ids, m.ID)

		raw, ok := m.Values["json"].(string)
		if !ok {
			log.Printf("clickhouse processing-drain: entry %s has no json field", m.ID)
			continue
		}

		ev, err := decodeProcessingEvent(raw)
		if err != nil {
			log.Printf("clickhouse processing-drain: entry %s: %v", m.ID, err)
			continue
		}

		d.writer.Enqueue(ev)
	}

	if err := d.rdb.XAck(ctx, procStreamKey, procGroupName, ids...).Err(); err != nil && ctx.Err() == nil {
		log.Printf("clickhouse processing-drain: ack %d events: %v", len(ids), err)
	}
}

// wireProcessingEvent is the JSON contract with Laravel's
// ProcessingEventStream::push. Field names must match what PHP writes.
type wireProcessingEvent struct {
	Type       string `json:"type"`
	VideoID    uint64 `json:"video_id"`
	UserID     uint64 `json:"user_id"`
	Provider   string `json:"provider"`
	Attempt    uint8  `json:"attempt"`
	DurationMs uint32 `json:"duration_ms"`
	ErrorCode  string `json:"error_code"`
	Payload    string `json:"payload"`
	TS         string `json:"ts"` // "2006-01-02 15:04:05.000" UTC, written by PHP
}

func decodeProcessingEvent(raw string) (ProcessingEvent, error) {
	var w wireProcessingEvent
	if err := json.Unmarshal([]byte(raw), &w); err != nil {
		return ProcessingEvent{}, err
	}
	if w.Type == "" {
		return ProcessingEvent{}, errors.New("event has no type")
	}

	ts, err := time.Parse("2006-01-02 15:04:05.999", w.TS)
	if err != nil {
		ts = time.Now().UTC()
	}

	return ProcessingEvent{
		Time:       ts,
		Type:       w.Type,
		VideoID:    w.VideoID,
		UserID:     w.UserID,
		Provider:   w.Provider,
		Attempt:    w.Attempt,
		DurationMs: w.DurationMs,
		ErrorCode:  w.ErrorCode,
		Payload:    w.Payload,
	}, nil
}
