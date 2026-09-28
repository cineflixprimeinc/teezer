package wikipedia

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	"reelsoo/backend-go/internal/breaker"
)

// outageStub is a Wikimedia that is down: every request 503s, and every request
// is counted so a test can assert we stopped making them.
func outageStub(t *testing.T, tuning breaker.Tuning) (*Client, *atomic.Int64, func()) {
	t.Helper()

	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusServiceUnavailable)
	}))

	c := New(tuning)
	c.restBase = srv.URL
	c.searchBase = srv.URL
	c.http = srv.Client()
	// The retry backoff is 500ms, 1s, ... - real time this test does not need
	// to spend. One attempt per call still exercises the whole path.
	c.maxRetries = 0

	return c, &hits, srv.Close
}

// The point of the whole exercise: once Wikimedia has clearly failed, stop
// calling it. Without a circuit, every request forever keeps hitting a
// dependency that is down.
func TestOutageStopsOutboundCallsOnceTheCircuitOpens(t *testing.T) {
	tuning := breaker.DefaultTuning()
	tuning.ConsecutiveFailures = 3
	tuning.RecoveryTimeout = time.Hour // stay open for the length of this test

	c, hits, done := outageStub(t, tuning)
	defer done()

	ctx := context.Background()

	// Drive it past the threshold.
	for i := 0; i < 3; i++ {
		if _, err := c.Summary(ctx, "mount everest"); err == nil {
			t.Fatalf("call %d: expected an error from a 503 dependency", i)
		}
	}

	hitsWhenOpen := hits.Load()
	if hitsWhenOpen == 0 {
		t.Fatal("the stub was never called - the test is not exercising the network path")
	}

	// Another 50 requests must not reach the dependency at all.
	for i := 0; i < 50; i++ {
		_, err := c.Summary(ctx, "mount everest")
		if !errors.Is(err, breaker.ErrOpen) {
			t.Fatalf("call %d after opening: err = %v, want breaker.ErrOpen", i, err)
		}
	}

	if got := hits.Load(); got != hitsWhenOpen {
		t.Fatalf("dependency was called %d more times while the circuit was open - it must be left alone",
			got-hitsWhenOpen)
	}
}

// Fast-fail is the other half: an open circuit must not make the caller wait.
func TestOpenCircuitReturnsImmediately(t *testing.T) {
	tuning := breaker.DefaultTuning()
	tuning.ConsecutiveFailures = 2
	tuning.RecoveryTimeout = time.Hour

	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		time.Sleep(300 * time.Millisecond) // a dependency that is slow, not dead
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	c := New(tuning)
	c.restBase, c.searchBase, c.http, c.maxRetries = srv.URL, srv.URL, srv.Client(), 0

	ctx := context.Background()
	for i := 0; i < 2; i++ {
		_, _ = c.Summary(ctx, "slow topic")
	}

	start := time.Now()
	for i := 0; i < 20; i++ {
		if _, err := c.Summary(ctx, "slow topic"); !errors.Is(err, breaker.ErrOpen) {
			t.Fatalf("want ErrOpen, got %v", err)
		}
	}
	elapsed := time.Since(start)

	// 20 calls that would each have cost 300ms return in well under one of them.
	if elapsed > 100*time.Millisecond {
		t.Fatalf("20 open-circuit calls took %s; they must not wait on the dependency", elapsed)
	}
}

// A 404 is Wikimedia working correctly. A long run of them - users searching
// for things that are not articles - must never switch the dependency off.
func TestNotFoundRunNeverOpensTheCircuit(t *testing.T) {
	tuning := breaker.DefaultTuning()
	tuning.ConsecutiveFailures = 3

	var hits atomic.Int64
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		hits.Add(1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	c := New(tuning)
	c.restBase, c.searchBase, c.http, c.maxRetries = srv.URL, srv.URL, srv.Client(), 0

	ctx := context.Background()
	for i := 0; i < 30; i++ {
		if _, err := c.Summary(ctx, "not a real topic"); !errors.Is(err, ErrNotFound) {
			t.Fatalf("call %d: err = %v, want ErrNotFound", i, err)
		}
	}

	if got := c.Breaker().State(); got != "closed" {
		t.Fatalf("circuit is %q after 30 legitimate 404s - it must stay closed", got)
	}
	if c.Breaker().Stats().Failure != 0 {
		t.Fatalf("404s were counted as dependency failures: %+v", c.Breaker().Stats())
	}
}

// Recovery without a restart: once the dependency is healthy again the circuit
// probes, closes, and normal service resumes.
func TestCircuitRecoversWhenTheDependencyComesBack(t *testing.T) {
	tuning := breaker.DefaultTuning()
	tuning.ConsecutiveFailures = 2
	tuning.RecoveryTimeout = 50 * time.Millisecond
	tuning.HalfOpenProbes = 1

	var down atomic.Bool
	down.Store(true)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if down.Load() {
			w.WriteHeader(http.StatusServiceUnavailable)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(everestJSON))
	}))
	defer srv.Close()

	c := New(tuning)
	c.restBase, c.searchBase, c.http, c.maxRetries = srv.URL, srv.URL, srv.Client(), 0

	ctx := context.Background()
	for i := 0; i < 2; i++ {
		_, _ = c.Summary(ctx, "mount everest")
	}
	if got := c.Breaker().State(); got != "open" {
		t.Fatalf("circuit = %q, want open after the outage", got)
	}

	// Dependency comes back; nothing restarts, nobody intervenes.
	down.Store(false)
	time.Sleep(70 * time.Millisecond)

	art, err := c.Summary(ctx, "mount everest")
	if err != nil {
		t.Fatalf("probe after recovery failed: %v", err)
	}
	if art == nil || art.Title != "Mount Everest" {
		t.Fatalf("probe returned %+v, want the real article", art)
	}
	if got := c.Breaker().State(); got != "closed" {
		t.Fatalf("circuit = %q after a successful probe, want closed", got)
	}
}

// The circuits must be independent: a Wikimedia outage cannot be allowed to
// affect Turnstile, payments, the feed, or anything else.
func TestWikipediaOutageLeavesOtherCircuitsClosed(t *testing.T) {
	tuning := breaker.DefaultTuning()
	tuning.ConsecutiveFailures = 2
	tuning.RecoveryTimeout = time.Hour

	c, _, done := outageStub(t, tuning)
	defer done()

	other := breaker.New(breaker.Settings{
		Name:                "unrelated-dependency",
		ConsecutiveFailures: 2,
		RecoveryTimeout:     time.Hour,
		HalfOpenProbes:      1,
		IsFailure:           func(error) bool { return true },
	})

	ctx := context.Background()
	for i := 0; i < 5; i++ {
		_, _ = c.Summary(ctx, "mount everest")
	}
	if c.Breaker().State() != "open" {
		t.Fatal("precondition: the wikipedia circuit should be open")
	}

	if got := other.State(); got != "closed" {
		t.Fatalf("unrelated circuit = %q - one dependency's outage must not affect another", got)
	}
	v, err := breaker.Do(other, func() (int, error) { return 1, nil })
	if err != nil || v != 1 {
		t.Fatalf("unrelated dependency: got %v/%v, want 1/nil", v, err)
	}
}
