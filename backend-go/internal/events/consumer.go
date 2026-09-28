package events

import (
	"context"
	"encoding/json"
	"log"
	"sync"
	"time"

	"github.com/nats-io/nats.go/jetstream"
	"github.com/redis/go-redis/v9"
)

// ConsumerDurableName - a durable JetStream consumer survives process
// restarts: if the bridge is down for a minute, it resumes exactly where it
// left off instead of skipping whatever was published in the gap.
const ConsumerDurableName = "centrifugo-bridge"

// dedupeTTL bounds how long a processed event's id is remembered. JetStream
// redelivers on a Nak or a missed Ack (AckWait), so this window only needs to
// outlast MaxDeliver retries comfortably - 10 minutes is generous.
const dedupeTTL = 10 * time.Minute

// Consumer pulls Phase-1 events off the REELSOO_EVENTS stream and bridges
// each to Centrifugo. Idempotent: every event id is checked against a dedupe
// store before broadcasting, so an at-least-once redelivery (a crash between
// broadcast and Ack, for instance) never double-fires a client-visible event.
type Consumer struct {
	js     jetstream.JetStream
	bridge *CentrifugoBridge
	dedupe dedupeStore
}

// NewConsumer wires the bridge onto the SAME JetStream connection the
// publisher uses (nil-safe: if pub is the disabled no-op, there is nothing to
// consume from, so the caller should skip Run entirely - see main.go).
func NewConsumer(pub *Publisher, bridge *CentrifugoBridge, rdb *redis.Client) *Consumer {
	if pub == nil {
		return nil
	}
	return &Consumer{js: pub.js, bridge: bridge, dedupe: newDedupeStore(rdb)}
}

// Run creates (or reattaches to) the durable consumer and processes messages
// until ctx is cancelled. Call this in its own goroutine - matches how
// clickhouse.NewDrainer.Run is started in cmd/api/main.go.
func (c *Consumer) Run(ctx context.Context) {
	if c == nil {
		return
	}

	cons, err := c.js.CreateOrUpdateConsumer(ctx, StreamName, jetstream.ConsumerConfig{
		Durable:       ConsumerDurableName,
		Description:   "Bridges Reelsoo interaction events to Centrifugo for live client fan-out.",
		FilterSubject: SubjectPrefix + ">",
		AckPolicy:     jetstream.AckExplicitPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    10, // after 10 failed attempts, stop retrying (see dropped-event log below)
		DeliverPolicy: jetstream.DeliverAllPolicy,
	})
	if err != nil {
		log.Printf("events: consumer: failed to create/attach durable consumer: %v", err)
		return
	}

	consumeCtx, err := cons.Consume(c.handle, jetstream.PullMaxMessages(32))
	if err != nil {
		log.Printf("events: consumer: failed to start consuming: %v", err)
		return
	}
	defer consumeCtx.Stop()

	log.Printf("events: consumer %q attached to %s, bridging to Centrifugo", ConsumerDurableName, StreamName)
	<-ctx.Done()
	log.Println("events: consumer shutting down")
}

func (c *Consumer) handle(msg jetstream.Msg) {
	var ev Event
	if err := json.Unmarshal(msg.Data(), &ev); err != nil {
		// Malformed payload can never succeed on redelivery - terminate rather
		// than retry forever.
		log.Printf("events: consumer: dropping unparseable message: %v", err)
		_ = msg.Term()
		return
	}

	if c.dedupe.seen(ev.ID) {
		log.Printf("events: consumer: %s (id=%s) already processed - skipping duplicate redelivery", ev.Type, ev.ID)
		_ = msg.Ack()
		return
	}

	if err := c.bridge.Broadcast(ev); err != nil {
		meta, _ := msg.Metadata()
		attempt := 1
		if meta != nil {
			attempt = int(meta.NumDelivered)
		}
		if attempt >= 10 {
			log.Printf("events: consumer: DROPPED %s (id=%s) after %d attempts: %v", ev.Type, ev.ID, attempt, err)
			_ = msg.Term()
			return
		}
		log.Printf("events: consumer: retry %d for %s (id=%s): %v", attempt, ev.Type, ev.ID, err)
		_ = msg.Nak()
		return
	}

	c.dedupe.mark(ev.ID)
	log.Printf("events: consumer: bridged %s (id=%s) → %v", ev.Type, ev.ID, ev.Rooms)
	_ = msg.Ack()
}

/* ── Idempotency store - Redis when available, in-process otherwise ──────
   Mirrors the optional-Redis pattern already used by internal/ratelimit: a
   single instance still gets correct de-dup; Redis is what makes it correct
   across multiple API replicas. */

type dedupeStore interface {
	seen(id string) bool
	mark(id string)
}

func newDedupeStore(rdb *redis.Client) dedupeStore {
	if rdb != nil {
		return &redisDedupe{rdb: rdb}
	}
	return &memDedupe{seenAt: make(map[string]time.Time)}
}

type redisDedupe struct{ rdb *redis.Client }

func (d *redisDedupe) seen(id string) bool {
	n, err := d.rdb.Exists(context.Background(), "events:dedupe:"+id).Result()
	return err == nil && n > 0
}

func (d *redisDedupe) mark(id string) {
	d.rdb.Set(context.Background(), "events:dedupe:"+id, 1, dedupeTTL)
}

type memDedupe struct {
	mu     sync.Mutex
	seenAt map[string]time.Time
}

func (d *memDedupe) seen(id string) bool {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.gcLocked()
	t, ok := d.seenAt[id]
	return ok && time.Since(t) < dedupeTTL
}

func (d *memDedupe) mark(id string) {
	d.mu.Lock()
	defer d.mu.Unlock()
	d.seenAt[id] = time.Now()
}

// gcLocked is a cheap opportunistic sweep - this map is small (Phase-1
// event volume) and short-lived per entry, so a full scan on each seen() is
// fine; called with mu already held.
func (d *memDedupe) gcLocked() {
	if len(d.seenAt) < 10_000 {
		return
	}
	cutoff := time.Now().Add(-dedupeTTL)
	for id, t := range d.seenAt {
		if t.Before(cutoff) {
			delete(d.seenAt, id)
		}
	}
}
