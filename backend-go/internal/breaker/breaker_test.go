package breaker

import (
	"errors"
	"runtime"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// errBusiness stands in for an expected application answer - a 404, a
// validation error - that must never open a circuit.
var errBusiness = errors.New("business: not found")

// errDependency stands in for a genuine dependency failure - a timeout, a
// connection reset, a 5xx.
var errDependency = errors.New("dependency: connection refused")

func isFailure(err error) bool { return !errors.Is(err, errBusiness) }

func testBreaker(t *testing.T, s Settings) *Breaker {
	t.Helper()
	if s.Name == "" {
		s.Name = "test"
	}
	if s.IsFailure == nil {
		s.IsFailure = isFailure
	}
	if s.ConsecutiveFailures == 0 {
		s.ConsecutiveFailures = 3
	}
	if s.RecoveryTimeout == 0 {
		s.RecoveryTimeout = 50 * time.Millisecond
	}
	if s.HalfOpenProbes == 0 {
		s.HalfOpenProbes = 1
	}
	return New(s)
}

func fail(b *Breaker, n int) {
	for i := 0; i < n; i++ {
		_, _ = Do(b, func() (int, error) { return 0, errDependency })
	}
}

/* ── CLOSED ─────────────────────────────────────────────────────────────── */

func TestClosedPassesSuccessThrough(t *testing.T) {
	b := testBreaker(t, Settings{})
	v, err := Do(b, func() (int, error) { return 42, nil })
	if err != nil || v != 42 {
		t.Fatalf("want 42/nil, got %v/%v", v, err)
	}
	if got := b.State(); got != "closed" {
		t.Fatalf("state = %q, want closed", got)
	}
}

// The caller's error must arrive unchanged - a breaker that swallows or
// rewrites errors would hide real failures from the code above it.
func TestClosedReturnsTheCallersError(t *testing.T) {
	b := testBreaker(t, Settings{})
	_, err := Do(b, func() (int, error) { return 0, errDependency })
	if !errors.Is(err, errDependency) {
		t.Fatalf("error = %v, want the caller's own", err)
	}
}

/* ── Failure classification ─────────────────────────────────────────────── */

// The single most important property here. If expected business answers count
// as failures, a healthy dependency gets switched off by normal use.
func TestBusinessErrorsNeverOpenTheCircuit(t *testing.T) {
	b := testBreaker(t, Settings{ConsecutiveFailures: 3})

	for i := 0; i < 50; i++ {
		_, err := Do(b, func() (int, error) { return 0, errBusiness })
		if !errors.Is(err, errBusiness) {
			t.Fatalf("business error was not returned to the caller: %v", err)
		}
	}

	if got := b.State(); got != "closed" {
		t.Fatalf("state = %q after 50 business errors, want closed", got)
	}
	if n := b.Stats().Failure; n != 0 {
		t.Fatalf("failure count = %d, want 0 - business errors must not count", n)
	}
}

func TestDependencyFailuresOpenTheCircuit(t *testing.T) {
	b := testBreaker(t, Settings{ConsecutiveFailures: 3})

	fail(b, 2)
	if got := b.State(); got != "closed" {
		t.Fatalf("state = %q below threshold, want closed", got)
	}

	fail(b, 1) // third consecutive failure trips it
	if got := b.State(); got != "open" {
		t.Fatalf("state = %q at threshold, want open", got)
	}
	if n := b.Stats().Opened; n != 1 {
		t.Fatalf("opened count = %d, want 1", n)
	}
}

// A business error resets the consecutive run, because it is a SUCCESS as far
// as the dependency's health goes.
func TestBusinessErrorResetsTheFailureRun(t *testing.T) {
	b := testBreaker(t, Settings{ConsecutiveFailures: 3})

	fail(b, 2)
	_, _ = Do(b, func() (int, error) { return 0, errBusiness })
	fail(b, 2)

	if got := b.State(); got != "closed" {
		t.Fatalf("state = %q, want closed - the run was broken by a healthy answer", got)
	}
}

/* ── OPEN: fast fail ────────────────────────────────────────────────────── */

func TestOpenFailsFastWithoutCallingTheDependency(t *testing.T) {
	b := testBreaker(t, Settings{ConsecutiveFailures: 3, RecoveryTimeout: time.Hour})
	fail(b, 3)

	var called atomic.Int64
	start := time.Now()
	for i := 0; i < 100; i++ {
		_, err := Do(b, func() (int, error) {
			called.Add(1)
			time.Sleep(50 * time.Millisecond) // a dependency that hangs
			return 0, errDependency
		})
		if !errors.Is(err, ErrOpen) {
			t.Fatalf("call %d: err = %v, want ErrOpen", i, err)
		}
	}

	if n := called.Load(); n != 0 {
		t.Fatalf("dependency was called %d times while open - it must be left alone", n)
	}
	// 100 calls that would each have slept 50ms must return effectively
	// instantly; this is the resource protection the whole thing is for.
	if elapsed := time.Since(start); elapsed > time.Second {
		t.Fatalf("100 open-circuit calls took %s, want ~instant", elapsed)
	}
	if n := b.Stats().Rejected; n != 100 {
		t.Fatalf("rejected count = %d, want 100", n)
	}
}

/* ── HALF-OPEN and recovery ─────────────────────────────────────────────── */

func TestRecoveryTimeoutMovesToHalfOpenThenClosesOnSuccess(t *testing.T) {
	b := testBreaker(t, Settings{
		ConsecutiveFailures: 3,
		RecoveryTimeout:     40 * time.Millisecond,
		HalfOpenProbes:      1,
	})
	fail(b, 3)
	if b.State() != "open" {
		t.Fatal("precondition: circuit should be open")
	}

	// Still open before the timeout elapses.
	_, err := Do(b, func() (int, error) { return 1, nil })
	if !errors.Is(err, ErrOpen) {
		t.Fatalf("err = %v before recovery timeout, want ErrOpen", err)
	}

	time.Sleep(60 * time.Millisecond)

	// The probe is allowed through and succeeds: back to closed, no restart
	// and no manual intervention.
	v, err := Do(b, func() (int, error) { return 7, nil })
	if err != nil || v != 7 {
		t.Fatalf("probe: got %v/%v, want 7/nil", v, err)
	}
	if got := b.State(); got != "closed" {
		t.Fatalf("state = %q after a successful probe, want closed", got)
	}
}

func TestFailedProbeReopensTheCircuit(t *testing.T) {
	b := testBreaker(t, Settings{
		ConsecutiveFailures: 3,
		RecoveryTimeout:     40 * time.Millisecond,
		HalfOpenProbes:      1,
	})
	fail(b, 3)
	time.Sleep(60 * time.Millisecond)

	// One probe, still failing.
	_, _ = Do(b, func() (int, error) { return 0, errDependency })

	if got := b.State(); got != "open" {
		t.Fatalf("state = %q after a failed probe, want open again", got)
	}

	// And it is fast-failing again rather than continuing to probe.
	var called atomic.Int64
	_, err := Do(b, func() (int, error) { called.Add(1); return 0, nil })
	if !errors.Is(err, ErrOpen) || called.Load() != 0 {
		t.Fatalf("after a failed probe the circuit must be shut again (err=%v called=%d)", err, called.Load())
	}
}

// While HALF-OPEN only the configured number of probes may reach the
// dependency. Without this a recovering service gets the full load the instant
// the timeout expires - the recovery storm this exists to prevent.
func TestHalfOpenAdmitsOnlyTheConfiguredProbes(t *testing.T) {
	const probes = 2
	b := testBreaker(t, Settings{
		ConsecutiveFailures: 3,
		RecoveryTimeout:     40 * time.Millisecond,
		HalfOpenProbes:      probes,
	})
	fail(b, 3)
	time.Sleep(60 * time.Millisecond)

	var inFlight atomic.Int64
	var admitted atomic.Int64
	release := make(chan struct{})
	var wg sync.WaitGroup

	for i := 0; i < 50; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, _ = Do(b, func() (int, error) {
				admitted.Add(1)
				inFlight.Add(1)
				<-release // hold the probe open so the limit is observable
				inFlight.Add(-1)
				return 1, nil
			})
		}()
	}

	time.Sleep(50 * time.Millisecond)
	if n := inFlight.Load(); n > probes {
		t.Fatalf("%d probes in flight at once, want at most %d", n, probes)
	}
	close(release)
	wg.Wait()

	if n := admitted.Load(); n > probes {
		t.Fatalf("%d requests reached the dependency while half-open, want at most %d", n, probes)
	}
}

/* ── Concurrency ────────────────────────────────────────────────────────── */

// Run with -race. Concurrent traffic across a state transition must not
// corrupt state, lose counts, or let more than the allowed calls through.
func TestConcurrentTrafficIsSafe(t *testing.T) {
	b := testBreaker(t, Settings{ConsecutiveFailures: 5, RecoveryTimeout: 20 * time.Millisecond})

	var wg sync.WaitGroup
	for i := 0; i < 200; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			_, _ = Do(b, func() (int, error) {
				if i%2 == 0 {
					return 0, errDependency
				}
				return i, nil
			})
		}(i)
	}
	wg.Wait()

	s := b.Stats()
	if s.Success+s.Failure+s.Rejected != 200 {
		t.Fatalf("counters lost calls: success=%d failure=%d rejected=%d, want 200 total",
			s.Success, s.Failure, s.Rejected)
	}
	if st := b.State(); st != "open" && st != "closed" && st != "half-open" {
		t.Fatalf("state = %q, not a valid state", st)
	}
}

/* ── Isolation ──────────────────────────────────────────────────────────── */

// One dependency failing must not affect another. This is why each dependency
// gets its own breaker rather than sharing one.
func TestCircuitsAreIndependent(t *testing.T) {
	a := testBreaker(t, Settings{Name: "a", ConsecutiveFailures: 3, RecoveryTimeout: time.Hour})
	c := testBreaker(t, Settings{Name: "c", ConsecutiveFailures: 3, RecoveryTimeout: time.Hour})

	fail(a, 5)
	if a.State() != "open" {
		t.Fatal("a should be open")
	}

	if c.State() != "closed" {
		t.Fatalf("c state = %q - an unrelated dependency's failure must not affect it", c.State())
	}
	v, err := Do(c, func() (int, error) { return 9, nil })
	if err != nil || v != 9 {
		t.Fatalf("c: got %v/%v, want 9/nil - it is healthy and must keep serving", v, err)
	}
}

/* ── Guard rails ────────────────────────────────────────────────────────── */

func TestNewPanicsWithoutAFailurePredicate(t *testing.T) {
	defer func() {
		if recover() == nil {
			t.Fatal("expected a panic: a nil IsFailure counts business errors as outages")
		}
	}()
	New(Settings{Name: "no-predicate"})
}

func TestStatsAreLowCardinality(t *testing.T) {
	b := testBreaker(t, Settings{Name: "wikipedia"})
	if got := b.Stats().Name; got != "wikipedia" {
		t.Fatalf("name = %q, want the fixed breaker name", got)
	}
}

/* ── Leaks and overhead ─────────────────────────────────────────────────── */

// The breaker must not start goroutines of its own. gobreaker is
// timer-free - state advances lazily when a call arrives, not on a background
// ticker - and this pins that: a per-dependency background goroutine would
// multiply with every protected dependency and outlive nothing.
func TestNoGoroutinesLeak(t *testing.T) {
	settle := func() int {
		for i := 0; i < 20; i++ {
			runtime.GC()
			time.Sleep(5 * time.Millisecond)
		}
		return runtime.NumGoroutine()
	}

	before := settle()

	for i := 0; i < 100; i++ {
		b := testBreaker(t, Settings{ConsecutiveFailures: 2, RecoveryTimeout: 10 * time.Millisecond})
		fail(b, 3)                        // open it
		time.Sleep(12 * time.Millisecond) // let it become eligible for half-open
		_, _ = Do(b, func() (int, error) { return 1, nil })
	}

	after := settle()
	if after > before+2 { // +2 tolerance for the test runtime itself
		t.Fatalf("goroutines: %d before, %d after 100 breakers through a full cycle", before, after)
	}
}

// Overhead on the hot path. This sits in front of a network call, so the
// budget is "invisible next to a socket read", not zero.
func BenchmarkClosedCircuitOverhead(b *testing.B) {
	br := New(Settings{
		Name:                "bench",
		ConsecutiveFailures: 5,
		RecoveryTimeout:     time.Second,
		HalfOpenProbes:      1,
		IsFailure:           func(error) bool { return true },
	})

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = Do(br, func() (int, error) { return i, nil })
	}
}

// The same, contended - what actually matters, since real traffic is
// concurrent and a breaker is a shared object.
func BenchmarkClosedCircuitParallel(b *testing.B) {
	br := New(Settings{
		Name:                "bench-parallel",
		ConsecutiveFailures: 5,
		RecoveryTimeout:     time.Second,
		HalfOpenProbes:      1,
		IsFailure:           func(error) bool { return true },
	})

	b.ReportAllocs()
	b.ResetTimer()
	b.RunParallel(func(pb *testing.PB) {
		for pb.Next() {
			_, _ = Do(br, func() (int, error) { return 1, nil })
		}
	})
}

// An OPEN circuit is the path an outage puts every request on, so its cost is
// the one that decides whether a dependency failure is survivable.
func BenchmarkOpenCircuitRejection(b *testing.B) {
	br := New(Settings{
		Name:                "bench-open",
		ConsecutiveFailures: 1,
		RecoveryTimeout:     time.Hour,
		HalfOpenProbes:      1,
		IsFailure:           func(error) bool { return true },
	})
	_, _ = Do(br, func() (int, error) { return 0, errDependency })

	b.ReportAllocs()
	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_, _ = Do(br, func() (int, error) { return 1, nil })
	}
}
