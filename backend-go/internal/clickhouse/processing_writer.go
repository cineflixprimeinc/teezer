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
	// Sized well below Writer's own engagement-event constants (event.go) -
	// this table sees one row per pipeline transition per video, not one per
	// view/watch-tick, so there is no realistic burst that needs 65536 slots
	// of headroom. flushInterval is what actually matters at this volume:
	// most batches will flush on the timer, not on reaching procBatchSize.
	procBufferSize    = 4096
	procBatchSize     = 500
	procFlushInterval = 2 * time.Second
)

// ProcessingWriter batches ProcessingEvents and flushes them to
// reelsoo.video_processing_events from a single background goroutine - the
// exact same shape as Writer (writer.go), duplicated rather than
// generalized because the two event types and tables are genuinely
// different, not because the batching logic itself differs. A nil
// *ProcessingWriter is a valid, silent no-op, same as Writer.
type ProcessingWriter struct {
	conn driver.Conn
	ch   chan ProcessingEvent

	wg   sync.WaitGroup
	stop chan struct{}
	once sync.Once

	enqueued atomic.Uint64
	written  atomic.Uint64
	dropped  atomic.Uint64
	failed   atomic.Uint64
}

// NewProcessingWriter dials ClickHouse and starts the flusher. An empty dsn
// returns (nil, nil) - ingestion is off, every Enqueue becomes a no-op.
func NewProcessingWriter(ctx context.Context, dsn string) (*ProcessingWriter, error) {
	if dsn == "" {
		return nil, nil
	}

	opts, err := clickhouse.ParseDSN(dsn)
	if err != nil {
		return nil, err
	}

	opts.Compression = &clickhouse.Compression{Method: clickhouse.CompressionLZ4}
	opts.MaxOpenConns = 2
	opts.MaxIdleConns = 1
	opts.DialTimeout = 5 * time.Second

	conn, err := clickhouse.Open(opts)
	if err != nil {
		return nil, err
	}
	if err := conn.Ping(ctx); err != nil {
		conn.Close()
		return nil, err
	}

	w := &ProcessingWriter{
		conn: conn,
		ch:   make(chan ProcessingEvent, procBufferSize),
		stop: make(chan struct{}),
	}
	w.wg.Add(1)
	go w.run()

	log.Printf("clickhouse: video-processing-events ingestion enabled (batch=%d, flush=%s)", procBatchSize, procFlushInterval)
	return w, nil
}

// Enqueue never blocks and never errors - same contract as Writer.Enqueue,
// for the same reason: analytics must never take down the request/job that
// produced it.
func (w *ProcessingWriter) Enqueue(e ProcessingEvent) {
	if w == nil {
		return
	}
	if e.Time.IsZero() {
		e.Time = time.Now().UTC()
	}
	if e.Attempt == 0 {
		e.Attempt = 1
	}

	select {
	case w.ch <- e:
		w.enqueued.Add(1)
	default:
		if n := w.dropped.Add(1); n == 1 || n%1000 == 0 {
			log.Printf("clickhouse: video-processing-events buffer full, dropped %d events", n)
		}
	}
}

func (w *ProcessingWriter) run() {
	defer w.wg.Done()

	ticker := time.NewTicker(procFlushInterval)
	defer ticker.Stop()

	pending := make([]ProcessingEvent, 0, procBatchSize)

	for {
		select {
		case e := <-w.ch:
			pending = append(pending, e)
			if len(pending) >= procBatchSize {
				w.flush(pending)
				pending = pending[:0]
			}

		case <-ticker.C:
			if len(pending) > 0 {
				w.flush(pending)
				pending = pending[:0]
			}

		case <-w.stop:
			for {
				select {
				case e := <-w.ch:
					pending = append(pending, e)
					if len(pending) >= procBatchSize {
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

func (w *ProcessingWriter) flush(events []ProcessingEvent) {
	if len(events) == 0 {
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Column list and the Append below are POSITIONAL - must stay in step
	// with both each other and the DDL in
	// deploy/clickhouse/schema/03-video-processing-events.sql.
	batch, err := w.conn.PrepareBatch(ctx, `
		INSERT INTO reelsoo.video_processing_events (
			event_time, event_type, video_id, user_id,
			provider, attempt, duration_ms, error_code, payload
		)`)
	if err != nil {
		w.failed.Add(uint64(len(events)))
		log.Printf("clickhouse: processing-events prepare batch (%d events lost): %v", len(events), err)
		return
	}

	for _, e := range events {
		if err := batch.Append(
			e.Time, e.Type, e.VideoID, e.UserID,
			e.Provider, e.Attempt, e.DurationMs, e.ErrorCode, e.Payload,
		); err != nil {
			w.failed.Add(1)
			log.Printf("clickhouse: processing-events append %q: %v", e.Type, err)
		}
	}

	if err := batch.Send(); err != nil {
		w.failed.Add(uint64(len(events)))
		log.Printf("clickhouse: processing-events send batch (%d events lost): %v", len(events), err)
		return
	}
	w.written.Add(uint64(len(events)))
}

// Close stops the flusher, drains the buffer and closes the connection.
// Safe to call twice, and safe on a nil *ProcessingWriter.
func (w *ProcessingWriter) Close() error {
	if w == nil {
		return nil
	}
	w.once.Do(func() {
		close(w.stop)
		w.wg.Wait()
	})
	return w.conn.Close()
}

// Stats reports the ingestion counters, for /health and alerting.
func (w *ProcessingWriter) Stats() (enqueued, written, dropped, failed uint64) {
	if w == nil {
		return 0, 0, 0, 0
	}
	return w.enqueued.Load(), w.written.Load(), w.dropped.Load(), w.failed.Load()
}
