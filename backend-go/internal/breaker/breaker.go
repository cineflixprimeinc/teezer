// Package breaker gives an outbound dependency a circuit breaker, so a
// dependency that is down or slow stops costing this service time and stops
// being hammered while it recovers.
//
// It wraps github.com/sony/gobreaker, which is small, stable and dependency
// -free. Nothing here reimplements the state machine - CLOSED/OPEN/HALF-OPEN,
// the generation counter that makes concurrent transitions safe, and the
// half-open probe limit are all gobreaker's. This package adds three things the
// library deliberately leaves to the caller:
//
//  1. Failure CLASSIFICATION. Only a genuine dependency failure may open a
//     circuit. A 404 from Wikipedia is a real answer, not an outage, and
//     counting it would open the circuit on a run of unknown search terms -
//     turning a working dependency off. Each breaker is given an IsFailure
//     predicate and everything it rejects is returned to the caller unchanged
//     while counting as a SUCCESS for the circuit.
//  2. Counters, for the health endpoint. Low cardinality by construction: the
//     only label is the breaker's own fixed name.
//  3. One log line per state transition, and nothing per request.
//
// State is per process, on purpose. The point is to stop THIS process wasting
// its own goroutines, sockets and wall-clock on a dependency that is not
// answering; that judgement is local, needs no coordination, and every instance
// reaches it within seconds of its own first failures. A shared circuit would
// add a Redis round trip to the very path whose latency it exists to protect,
// and make a network blip able to open circuits everywhere at once.
package breaker

import (
	"errors"
	"log"
	"sync/atomic"
	"time"

	"github.com/sony/gobreaker"
)

// ErrOpen is returned when the circuit is open and the call was not attempted.
// Callers match on it to choose their fallback - see the wikipedia and
// turnstile integrations.
var ErrOpen = errors.New("breaker: circuit open, dependency not called")

// Tuning is the part of a breaker's configuration that comes from the
// environment. Separated from Settings because IsFailure is a property of the
// dependency's error model - a code decision - while these four are operational
// knobs an operator may want to change without a deploy.
type Tuning struct {
	ConsecutiveFailures uint32
	RecoveryTimeout     time.Duration
	HalfOpenProbes      uint32
	CountWindow         time.Duration
}

// DefaultTuning is what a dependency gets when nothing is configured. Chosen
// for an OPTIONAL, read-only dependency whose failure degrades a feature rather
// than breaking the product: trip only after a clear run of failures, come back
// reasonably quickly, and probe carefully.
func DefaultTuning() Tuning {
	return Tuning{
		ConsecutiveFailures: 5,
		RecoveryTimeout:     30 * time.Second,
		HalfOpenProbes:      1,
		CountWindow:         60 * time.Second,
	}
}

// Settings describes one protected dependency.
type Settings struct {
	// Name identifies the breaker in logs, counters and the health endpoint.
	// Fixed at construction, never derived from a request, so it can never
	// become a high-cardinality label.
	Name string

	// ConsecutiveFailures to trip from CLOSED to OPEN.
	ConsecutiveFailures uint32

	// RecoveryTimeout is how long the circuit stays OPEN before allowing
	// probes (OPEN -> HALF-OPEN).
	RecoveryTimeout time.Duration

	// HalfOpenProbes is the number of requests allowed through while
	// HALF-OPEN. They must all succeed to close the circuit; the first failure
	// re-opens it and restarts RecoveryTimeout.
	HalfOpenProbes uint32

	// CountWindow clears the consecutive-failure count in CLOSED state.
	// Without it, failures separated by hours would eventually add up and trip
	// a circuit for a dependency that is fine - the count has to be about
	// what is happening NOW.
	CountWindow time.Duration

	// IsFailure decides whether an error counts against the circuit. Required:
	// leaving it nil would count every business error and is never what you
	// want. err is never nil when this is called.
	IsFailure func(err error) bool
}

// Breaker is one dependency's circuit.
type Breaker struct {
	cb   *gobreaker.CircuitBreaker
	name string
	// Same predicate the circuit counts by, kept so the COUNTERS agree with
	// it. Without this the failure counter rose on business errors the circuit
	// had (correctly) ignored, so a run of 404s looked exactly like a
	// dependency outage on the health endpoint.
	isFailure func(err error) bool

	success  atomic.Uint64
	failure  atomic.Uint64
	rejected atomic.Uint64
	opened   atomic.Uint64
	halfOpen atomic.Uint64
}

// Stats is a point-in-time snapshot for the health endpoint.
type Stats struct {
	Name     string `json:"name"`
	State    string `json:"state"`
	Success  uint64 `json:"success"`
	Failure  uint64 `json:"failure"`
	Rejected uint64 `json:"rejected"`
	Opened   uint64 `json:"opened"`
	HalfOpen uint64 `json:"half_open"`
}

// New builds a breaker. Panics on a nil IsFailure, because that is a
// programming error that would otherwise show up as a dependency being
// switched off by its own 404s, long after deploy.
func New(s Settings) *Breaker {
	if s.IsFailure == nil {
		panic("breaker: " + s.Name + " has no IsFailure predicate")
	}

	b := &Breaker{name: s.Name, isFailure: s.IsFailure}
	b.cb = gobreaker.NewCircuitBreaker(gobreaker.Settings{
		Name:        s.Name,
		MaxRequests: s.HalfOpenProbes,
		Interval:    s.CountWindow,
		Timeout:     s.RecoveryTimeout,
		ReadyToTrip: func(c gobreaker.Counts) bool {
			return c.ConsecutiveFailures >= s.ConsecutiveFailures
		},
		// Counting is decided here, not by whether err is nil: the error still
		// reaches the caller either way.
		IsSuccessful: func(err error) bool {
			return err == nil || !s.IsFailure(err)
		},
		// Transitions only - never per request. A dependency being down must
		// not also fill the disk.
		OnStateChange: func(name string, from, to gobreaker.State) {
			switch to {
			case gobreaker.StateOpen:
				b.opened.Add(1)
			case gobreaker.StateHalfOpen:
				b.halfOpen.Add(1)
			}
			log.Printf("breaker: %s %s -> %s", name, from, to)
		},
	})

	return b
}

// Do runs fn under the circuit.
//
// When the circuit is OPEN the call is NOT attempted and ErrOpen comes back
// immediately - that is the whole point, and it is what stops an outage from
// costing a request its full timeout. Otherwise fn's own result and error are
// returned unchanged, including errors the circuit chose not to count.
func Do[T any](b *Breaker, fn func() (T, error)) (T, error) {
	var zero T

	res, err := b.cb.Execute(func() (any, error) {
		v, e := fn()
		return v, e
	})

	if err != nil {
		if errors.Is(err, gobreaker.ErrOpenState) || errors.Is(err, gobreaker.ErrTooManyRequests) {
			// ErrTooManyRequests means HALF-OPEN already has its allowed probes
			// in flight. Same answer as OPEN from the caller's point of view:
			// not attempted, fall back.
			b.rejected.Add(1)
			return zero, ErrOpen
		}
		// Counted the same way the circuit counted it, so `failure` always
		// means "the dependency misbehaved" and never "a user searched for
		// something that does not exist".
		if b.isFailure(err) {
			b.failure.Add(1)
		} else {
			b.success.Add(1)
		}
		v, _ := res.(T)
		return v, err
	}

	b.success.Add(1)
	v, _ := res.(T)
	return v, nil
}

// State reports the circuit's current state.
func (b *Breaker) State() string { return b.cb.State().String() }

// Stats snapshots the counters.
func (b *Breaker) Stats() Stats {
	return Stats{
		Name:     b.name,
		State:    b.State(),
		Success:  b.success.Load(),
		Failure:  b.failure.Load(),
		Rejected: b.rejected.Load(),
		Opened:   b.opened.Load(),
		HalfOpen: b.halfOpen.Load(),
	}
}
