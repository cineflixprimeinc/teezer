package clickhouse

import (
	"context"
	"log"
	"sync"
	"sync/atomic"
	"time"

	"github.com/ClickHouse/clickhouse-go/v2"
	"github.com/ClickHouse/clickhouse-go/v2/lib/driver"
)

const (
	// bufferSize is the in-memory backlog between the request goroutines and the
	// flusher. Sized so a burst (a video going viral, a flush stalling on a slow
	// network) is absorbed rather than dropped, while capping the memory a dead
	// ClickHouse can cost us at roughly bufferSize * sizeof(Event) ≈ 10 MB.
	bufferSize = 65536

	// batchSize is rows per INSERT. ClickHouse wants few, large inserts - every
	// INSERT creates a part that must later be merged, so a row-at-a-time writer
	// is the classic way to melt it.
	batchSize = 5000

	// flushInterval bounds staleness when traffic is light: with 3 events/sec we
	// would take half an hour to reach batchSize, and the Studio dashboard would
	// look broken. Flush on whichever comes first.
	flushInterval = 2 * time.Second
)

// Writer batches events and flushes them to ClickHouse from a single background
// goroutine. The zero value is not usable; a nil *Writer is (every method is
// nil-safe and does nothing), which is how an unset CLICKHOUSE_DSN disables
// ingestion without a single `if enabled` at the call sites.
type Writer struct {
	conn driver.Conn
	ch   chan Event

	wg   sync.WaitGroup
	stop chan struct{}
	once sync.Once

	// Observability. Dropped is the number that matters: it is only ever nonzero
	// when ClickHouse cannot keep up, and it is the difference between "the chart
	// is wrong" and "the chart is wrong AND we know why".
	enqueued atomic.Uint64
	written  atomic.Uint64
	dropped  atomic.Uint64
	failed   atomic.Uint64
}

// NewWriter dials ClickHouse and starts the flusher. An empty dsn returns
// (nil, nil): ingestion is simply off, and every Enqueue becomes a no-op.
func NewWriter(ctx context.Context, dsn string) (*Writer, error) {
	if dsn == "" {
		log.Println("clickhouse: CLICKHOUSE_DSN not set - analytics ingestion disabled")
		return nil, nil
	}

	opts, err := clickhouse.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}

	// Compression is close to free on CPU and cuts the wire cost substantially -
	// this matters because the API and ClickHouse may sit on different VPSes.
	opts.Compression = &clickhouse.Compression{Method: clickhouse.CompressionLZ4}
	opts.MaxOpenConns = 4
	opts.MaxIdleConns = 2
	opts.DialTimeout = 5 * time.Second

	conn, err := clickhouse.Open(opts)
	if err != nil {
		return nil, err
	}
	if err := conn.Ping(ctx); err != nil {
		conn.Close()
		return nil, err
	}

	w := &Writer{
		conn: conn,
		ch:   make(chan Event, bufferSize),
		stop: make(chan struct{}),
	}
	w.wg.Add(1)
	go w.run()

	log.Printf("clickhouse: ingestion enabled (batch=%d, flush=%s)", batchSize, flushInterval)
	return w, nil
}

// Enqueue hands an event to the flusher. It NEVER blocks and NEVER errors: this
// is called from request handlers, and a stalled analytics pipeline must not add
// a millisecond of latency to a user's feed, let alone deadlock it. If the
// buffer is full the event is dropped on the floor and counted.
//
// Dropping is the correct behavior, not a compromise. These are sampled behavior
// signals feeding dashboards and a recommender - losing some during an incident
// costs a slightly-off chart. The alternative (blocking) costs the request.
func (w *Writer) Enqueue(e Event) {
	if w == nil {
		return
	}
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	if e.Delta == 0 {
		e.Delta = 1
	}

	select {
	case w.ch <- e:
		w.enqueued.Add(1)
	default:
		// Full. Drop rather than block the caller's request.
		if n := w.dropped.Add(1); n == 1 || n%10000 == 0 {
			log.Printf("clickhouse: buffer full, dropped %d events (is ClickHouse reachable?)", n)
		}
	}
}

// run is the single flusher goroutine. One goroutine means no lock around the
// pending slice and no concurrent INSERTs competing to create parts.
func (w *Writer) run() {
	defer w.wg.Done()

	ticker := time.NewTicker(flushInterval)
	defer ticker.Stop()

	pending := make([]Event, 0, batchSize)

	for {
		select {
		case e := <-w.ch:
			pending = append(pending, e)
			if len(pending) >= batchSize {
				w.flush(pending)
				pending = pending[:0]
			}

		case <-ticker.C:
			if len(pending) > 0 {
				w.flush(pending)
				pending = pending[:0]
			}

		case <-w.stop:
			// Drain whatever is still queued so a graceful restart does not throw
			// away the last couple of seconds of events.
			for {
				select {
				case e := <-w.ch:
					pending = append(pending, e)
					if len(pending) >= batchSize {
						w.flush(pending)
						pending = pending[:0]
					}
					continue
				default:
				}
				break
			}
			if len(pending) > 0 {
				w.flush(pending)
			}
			return
		}
	}
}

// flush writes one batch. Errors are logged and the batch is discarded - we do
// NOT retry. A retry loop here would grow the backlog behind a ClickHouse that
// is already struggling, turning a blip into a memory leak; and since the whole
// point is that these events are droppable, the honest move is to count the loss
// and move on. `failed` going nonzero is the alert.
func (w *Writer) flush(events []Event) {
	if len(events) == 0 {
		return
	}

	// Bounded: a flush that cannot finish in 30s is not going to finish.
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Column list and the Append below are POSITIONAL - they must stay in step with
	// each other and with the DDL in deploy/clickhouse/schema/01-events.sql.
	batch, err := w.conn.PrepareBatch(ctx, `
		INSERT INTO reelsoo.events (
			event_time, event_type, video_id, creator_id, user_id, session_id,
			delta, watch_seconds, completion_pct,
			source, country, city, device_type, platform, ip_hash, payload,
			event_id
		)`)
	if err != nil {
		w.failed.Add(uint64(len(events)))
		log.Printf("clickhouse: prepare batch (%d events lost): %v", len(events), err)
		return
	}

	for _, e := range events {
		if err := batch.Append(
			e.Time, e.Type, e.VideoID, e.CreatorID, e.UserID, e.SessionID,
			e.Delta, e.WatchSeconds, e.CompletionPct,
			e.Source, e.Country, e.City, e.DeviceType, e.Platform, e.IPHash, e.Payload,
			e.ID,
		); err != nil {
			w.failed.Add(1)
			log.Printf("clickhouse: append event %q: %v", e.Type, err)
		}
	}

	if err := batch.Send(); err != nil {
		w.failed.Add(uint64(len(events)))
		log.Printf("clickhouse: send batch (%d events lost): %v", len(events), err)
		return
	}
	w.written.Add(uint64(len(events)))
}

// Close stops the flusher, drains the buffer and closes the connection. Safe to
// call twice, and safe on a nil *Writer.
func (w *Writer) Close() error {
	if w == nil {
		return nil
	}
	w.once.Do(func() {
		close(w.stop)
		w.wg.Wait()
	})
	return w.conn.Close()
}

// Conn exposes the driver for the read-side queries. Nil-safe.
func (w *Writer) Conn() driver.Conn {
	if w == nil {
		return nil
	}
	return w.conn
}

// Stats reports the ingestion counters, for /health and for alerting.
func (w *Writer) Stats() (enqueued, written, dropped, failed uint64) {
	if w == nil {
		return 0, 0, 0, 0
	}
	return w.enqueued.Load(), w.written.Load(), w.dropped.Load(), w.failed.Load()
}
