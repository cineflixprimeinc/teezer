package clickhouse

import (
	"testing"
	"time"
)

// The whole design rests on two promises made to the request path: a nil Writer
// is inert, and Enqueue never blocks. Both are the kind of thing that is
// obviously true when written and quietly false a year later, so pin them down.

func TestNilWriterIsInert(t *testing.T) {
	var w *Writer // what NewWriter returns when CLICKHOUSE_DSN is unset

	// None of these may panic - they are called from live request handlers.
	w.Enqueue(Event{Type: TypeView, VideoID: 1})
	if got := w.Conn(); got != nil {
		t.Errorf("Conn() on nil writer = %v, want nil", got)
	}
	if err := w.Close(); err != nil {
		t.Errorf("Close() on nil writer = %v, want nil", err)
	}
	if e, wr, d, f := w.Stats(); e|wr|d|f != 0 {
		t.Errorf("Stats() on nil writer = %d,%d,%d,%d, want all zero", e, wr, d, f)
	}
}

// A full buffer must drop, not block. If this regresses, a stalled ClickHouse
// stops being an analytics problem and starts being an outage: every request
// goroutine touching Enqueue would park on the channel send.
func TestEnqueueDropsWhenFullRatherThanBlocking(t *testing.T) {
	// No conn and no flusher goroutine, so nothing ever drains ch - the buffer is
	// permanently full after the first event. This is the "ClickHouse is wedged"
	// case in its most extreme form.
	w := &Writer{ch: make(chan Event, 1), stop: make(chan struct{})}

	done := make(chan struct{})
	go func() {
		defer close(done)
		for i := 0; i < 100; i++ {
			w.Enqueue(Event{Type: TypeView, VideoID: uint64(i)})
		}
	}()

	select {
	case <-done:
	case <-time.After(2 * time.Second):
		t.Fatal("Enqueue blocked on a full buffer - a stalled ClickHouse would now stall the API")
	}

	enqueued, _, dropped, _ := w.Stats()
	if enqueued != 1 {
		t.Errorf("enqueued = %d, want 1 (the single slot in the buffer)", enqueued)
	}
	if dropped != 99 {
		t.Errorf("dropped = %d, want 99", dropped)
	}
}

// Enqueue fills in the fields the call sites deliberately leave off.
func TestEnqueueDefaults(t *testing.T) {
	w := &Writer{ch: make(chan Event, 4), stop: make(chan struct{})}

	w.Enqueue(Event{Type: TypeView}) // no Time, no Delta
	got := <-w.ch

	if got.Time.IsZero() {
		t.Error("Time not defaulted to now")
	}
	// Delta must default to +1, not 0. A zero delta would make sum(delta) - which
	// is how every engagement metric is computed - silently count the event as
	// nothing at all.
	if got.Delta != 1 {
		t.Errorf("Delta = %d, want 1", got.Delta)
	}
}

// An explicit -1 (an unlike) must survive Enqueue's defaulting.
func TestEnqueuePreservesUndoDelta(t *testing.T) {
	w := &Writer{ch: make(chan Event, 4), stop: make(chan struct{})}

	undo, delta, ok := Undo(TypeLike)
	if !ok || undo != TypeUnlike || delta != -1 {
		t.Fatalf("Undo(like) = %q,%d,%v; want unlike,-1,true", undo, delta, ok)
	}

	w.Enqueue(Event{Type: undo, Delta: delta})
	got := <-w.ch

	if got.Delta != -1 {
		t.Errorf("Delta = %d, want -1 - an unlike that stores +1 double-counts the like", got.Delta)
	}
}

func TestUndoOfNonReversibleEvent(t *testing.T) {
	// A view cannot be un-viewed; callers must not invent a -1 for it.
	if _, _, ok := Undo(TypeView); ok {
		t.Error("Undo(view) reported reversible, want not reversible")
	}
}
