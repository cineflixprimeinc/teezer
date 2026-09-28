package events

import (
	"context"
	"encoding/json"
	"log"
	"time"

	"github.com/nats-io/nats.go"
	"github.com/nats-io/nats.go/jetstream"
)

// StreamName / SubjectPrefix - one JetStream stream carries every Phase-1
// event, partitioned by subject (reelsoo.events.video.liked, …) so the
// bridge consumer can filter with a wildcard while future consumers (e.g. an
// audit log) could subscribe to a narrower subject without touching the
// publisher.
const (
	StreamName    = "REELSOO_EVENTS"
	SubjectPrefix = "reelsoo.events."
)

func subject(t Type) string { return SubjectPrefix + string(t) }

// Publisher owns the NATS connection + JetStream context. A nil *Publisher
// is a valid, deliberate no-op (see NewPublisher) - every Publish call on it
// returns immediately - so an unconfigured/unreachable NATS_URL degrades the
// API to "no realtime fan-out from Go", never to "API down", exactly like
// the existing ClickHouse/Redis optional-dependency pattern in this codebase.
type Publisher struct {
	nc *nats.Conn
	js jetstream.JetStream
}

// NewPublisher connects to NATS with infinite reconnect and ensures the
// JetStream stream exists (idempotent - safe to call on every boot). Logs
// every connect/disconnect/reconnect transition; never blocks the caller
// once connected, since Publish uses PublishAsync.
func NewPublisher(ctx context.Context, natsURL string) (*Publisher, error) {
	if natsURL == "" {
		log.Println("events: NATS_URL not set - realtime event publishing from Go is disabled")
		return nil, nil
	}

	nc, err := nats.Connect(natsURL,
		nats.Name("reelsoo-go-api"),
		nats.MaxReconnects(-1), // retry forever - a NATS restart must never require redeploying the API
		nats.ReconnectWait(2*time.Second),
		nats.DisconnectErrHandler(func(_ *nats.Conn, err error) {
			if err != nil {
				log.Printf("events: NATS disconnected: %v", err)
			}
		}),
		nats.ReconnectHandler(func(c *nats.Conn) {
			log.Printf("events: NATS reconnected to %s", c.ConnectedUrl())
		}),
		nats.ClosedHandler(func(*nats.Conn) {
			log.Println("events: NATS connection closed")
		}),
	)
	if err != nil {
		return nil, err
	}

	js, err := jetstream.New(nc)
	if err != nil {
		nc.Close()
		return nil, err
	}

	// Create-or-update: safe on every boot, and lets a config change (e.g.
	// widening the subject set for a later phase) roll out on next deploy
	// with no manual `nats stream` step.
	_, err = js.CreateOrUpdateStream(ctx, jetstream.StreamConfig{
		Name:        StreamName,
		Description: "Reelsoo interaction events (likes, comments, follows, shares) - internal bus feeding the Centrifugo realtime bridge.",
		Subjects:    []string{SubjectPrefix + ">"},
		Storage:     jetstream.FileStorage,
		Retention:   jetstream.LimitsPolicy,
		MaxAge:      24 * time.Hour, // the bridge consumes near-instantly; this just bounds disk if it's ever down for a day
		Duplicates:  2 * time.Minute, // dedupe window for the Nats-Msg-Id we set on every publish
	})
	if err != nil {
		nc.Close()
		return nil, err
	}

	log.Printf("events: connected to NATS JetStream (%s), stream %q ready", natsURL, StreamName)
	return &Publisher{nc: nc, js: js}, nil
}

// Publish is fire-and-forget and NEVER blocks the caller: PublishAsync hands
// the message to NATS's client-side buffer and returns immediately, well
// before any broker ack. ev.ID is set as the Nats-Msg-Id header, so a retried
// publish (e.g. after a reconnect) is deduped server-side within the stream's
// Duplicates window instead of double-delivering.
func (p *Publisher) Publish(ev Event) {
	if p == nil {
		return
	}
	data, err := json.Marshal(ev)
	if err != nil {
		log.Printf("events: publish %s: marshal failed: %v", ev.Type, err)
		return
	}
	future, err := p.js.PublishAsync(subject(ev.Type), data, jetstream.WithMsgID(ev.ID))
	if err != nil {
		log.Printf("events: publish %s (id=%s): failed to enqueue: %v", ev.Type, ev.ID, err)
		return
	}
	// Drain the ack/error asynchronously - logging only, never blocking the
	// publisher or the HTTP handler that called it.
	go func() {
		select {
		case <-future.Ok():
			// published + acked by the broker
		case err := <-future.Err():
			log.Printf("events: publish %s (id=%s): broker rejected: %v", ev.Type, ev.ID, err)
		case <-time.After(5 * time.Second):
			log.Printf("events: publish %s (id=%s): ack timed out (broker unreachable?)", ev.Type, ev.ID)
		}
	}()
}

// Close drains in-flight publishes (bounded) then closes the connection -
// call from a signal handler so a deploy/restart never silently drops an
// event that was mid-flight.
func (p *Publisher) Close() {
	if p == nil {
		return
	}
	select {
	case <-p.js.PublishAsyncComplete():
	case <-time.After(3 * time.Second):
		log.Println("events: shutdown timed out waiting for in-flight publishes")
	}
	if err := p.nc.Drain(); err != nil {
		p.nc.Close()
	}
}
