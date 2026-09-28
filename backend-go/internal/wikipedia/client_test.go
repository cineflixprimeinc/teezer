package wikipedia

import (
	"compress/gzip"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"teezer/backend-go/internal/breaker"
)

// newStub returns a client pointed at a test server instead of Wikimedia, so
// none of these tests touch the network.
func newStub(h http.Handler) (*Client, *httptest.Server) {
	srv := httptest.NewServer(h)
	// A high failure threshold so these tests exercise the HTTP behaviour
	// rather than the circuit: several of them deliberately return 5xx to
	// check the retry policy, and a production-tuned circuit would open
	// part-way through and change what they are measuring.
	tuning := breaker.DefaultTuning()
	tuning.ConsecutiveFailures = 1000
	c := New(tuning)
	c.restBase = srv.URL
	c.searchBase = srv.URL
	c.http = srv.Client()
	return c, srv
}

const everestJSON = `{
  "type": "standard",
  "title": "Mount Everest",
  "extract": "Mount Everest is Earth's highest mountain above sea level.",
  "thumbnail": {"source": "https://upload.wikimedia.org/everest.jpg"},
  "content_urls": {"desktop": {"page": "https://en.wikipedia.org/wiki/Mount_Everest"}}
}`

// Wikimedia's User-Agent policy makes this header mandatory; anonymous traffic
// without one is throttled or blocked, so it is worth a test of its own.
func TestUserAgentIsAlwaysSent(t *testing.T) {
	var got string
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r.Header.Get("User-Agent")
		w.Write([]byte(everestJSON))
	}))
	defer srv.Close()

	if _, err := c.Summary(context.Background(), "Mount Everest"); err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if got != UserAgent {
		t.Errorf("User-Agent = %q, want %q", got, UserAgent)
	}
}

func TestSummaryReturnsOnlyTheFourFields(t *testing.T) {
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(everestJSON))
	}))
	defer srv.Close()

	a, err := c.Summary(context.Background(), "mount everest")
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if a.Title != "Mount Everest" {
		t.Errorf("Title = %q", a.Title)
	}
	if a.Thumbnail != "https://upload.wikimedia.org/everest.jpg" {
		t.Errorf("Thumbnail = %q", a.Thumbnail)
	}
	if a.ArticleURL != "https://en.wikipedia.org/wiki/Mount_Everest" {
		t.Errorf("ArticleURL = %q", a.ArticleURL)
	}
	if a.Summary == "" {
		t.Error("Summary is empty")
	}
}

// Wikimedia serves gzip in production. This caught a real outage: the client
// set Accept-Encoding manually, which makes net/http hand back the body still
// compressed instead of decoding it transparently, and every lookup died on
// "invalid character '\x1f'". The plain httptest stubs above never compress, so
// only a gzipping server reproduces it.
func TestGzippedResponseIsDecoded(t *testing.T) {
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Mirror the real service: only compress when the client advertises it.
		if !strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
			t.Errorf("transport did not advertise gzip; Accept-Encoding=%q", r.Header.Get("Accept-Encoding"))
			w.Write([]byte(everestJSON))
			return
		}
		w.Header().Set("Content-Encoding", "gzip")
		w.Header().Set("Content-Type", "application/json")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		gz.Write([]byte(everestJSON))
	}))
	defer srv.Close()

	a, err := c.Summary(context.Background(), "Mount Everest")
	if err != nil {
		t.Fatalf("Summary on a gzipped response: %v", err)
	}
	if a.Title != "Mount Everest" {
		t.Errorf("Title = %q, want %q", a.Title, "Mount Everest")
	}
}

// A 404 is a real answer, not a failure - and critically it must NOT be
// retried, since retrying misses is the abusive pattern the cache exists to
// prevent.
func TestNotFoundIsNotRetried(t *testing.T) {
	var calls int32
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	_, err := c.Summary(context.Background(), "kjhsdfkjhsdf")
	if !errors.Is(err, ErrNotFound) {
		t.Fatalf("err = %v, want ErrNotFound", err)
	}
	// One summary attempt + one search attempt, and no retry of either.
	if n := atomic.LoadInt32(&calls); n > 2 {
		t.Errorf("made %d calls; a 404 must not be retried", n)
	}
}

// A disambiguation page is a menu, not knowledge - showing it as a fact card
// would be worse than showing nothing.
func TestDisambiguationTreatedAsMiss(t *testing.T) {
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"type":"disambiguation","title":"Mercury","extract":"Mercury may refer to:"}`))
	}))
	defer srv.Close()

	if _, err := c.Summary(context.Background(), "mercury"); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

func TestEmptyExtractTreatedAsMiss(t *testing.T) {
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"type":"standard","title":"Blank","extract":"   "}`))
	}))
	defer srv.Close()

	if _, err := c.Summary(context.Background(), "blank"); !errors.Is(err, ErrNotFound) {
		t.Errorf("err = %v, want ErrNotFound", err)
	}
}

// 429 and 5xx are transient and must back off and retry - this is the
// "exponential backoff on rate limiting or temporary errors" requirement.
func TestRetriesOnRateLimitThenSucceeds(t *testing.T) {
	var calls int32
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) == 1 {
			w.Header().Set("Retry-After", "1")
			w.WriteHeader(http.StatusTooManyRequests)
			return
		}
		w.Write([]byte(everestJSON))
	}))
	defer srv.Close()

	start := time.Now()
	a, err := c.Summary(context.Background(), "Mount Everest")
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if a.Title != "Mount Everest" {
		t.Errorf("Title = %q", a.Title)
	}
	if atomic.LoadInt32(&calls) != 2 {
		t.Errorf("calls = %d, want 2 (one 429 then one success)", calls)
	}
	// Retry-After: 1 should have been honoured rather than the 500ms default.
	if elapsed := time.Since(start); elapsed < 900*time.Millisecond {
		t.Errorf("retried after %v; Retry-After was not honoured", elapsed)
	}
}

func TestRetriesOnServerError(t *testing.T) {
	var calls int32
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if atomic.AddInt32(&calls, 1) < 3 {
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		w.Write([]byte(everestJSON))
	}))
	defer srv.Close()

	if _, err := c.Summary(context.Background(), "Mount Everest"); err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if atomic.LoadInt32(&calls) != 3 {
		t.Errorf("calls = %d, want 3", calls)
	}
}

// Exhausting retries must surface an error, not a bogus empty article - the
// service relies on this to avoid writing a negative cache entry during an
// outage.
func TestGivesUpAfterMaxRetries(t *testing.T) {
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	_, err := c.Summary(context.Background(), "Mount Everest")
	if err == nil {
		t.Fatal("expected an error after exhausting retries")
	}
	if errors.Is(err, ErrNotFound) {
		t.Error("an outage must not be reported as ErrNotFound - it would be cached as a miss")
	}
}

// A cancelled context must abort promptly rather than sleeping out the backoff.
func TestContextCancellationStopsRetries(t *testing.T) {
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()

	start := time.Now()
	if _, err := c.Summary(ctx, "Mount Everest"); err == nil {
		t.Fatal("expected an error")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Errorf("took %v; cancellation should have cut the backoff short", elapsed)
	}
}

// Falling back to search costs a second call, so it must only happen when the
// direct title lookup misses.
func TestFallsBackToSearchOnTitleMiss(t *testing.T) {
	var summaryCalls, searchCalls int32
	c, srv := newStub(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/wikipedia/en/search/title":
			atomic.AddInt32(&searchCalls, 1)
			w.Write([]byte(`{"pages":[{"key":"Mount_Everest","title":"Mount Everest"}]}`))
		default:
			// First summary attempt (the raw query) misses; the second, for the
			// title search resolved, succeeds.
			if atomic.AddInt32(&summaryCalls, 1) == 1 {
				w.WriteHeader(http.StatusNotFound)
				return
			}
			w.Write([]byte(everestJSON))
		}
	}))
	defer srv.Close()

	a, err := c.Summary(context.Background(), "worlds tallest mountain")
	if err != nil {
		t.Fatalf("Summary: %v", err)
	}
	if a.Title != "Mount Everest" {
		t.Errorf("Title = %q", a.Title)
	}
	if searchCalls != 1 {
		t.Errorf("searchCalls = %d, want 1", searchCalls)
	}
}
