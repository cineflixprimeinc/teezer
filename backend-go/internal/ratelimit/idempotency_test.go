package ratelimit

import (
	"context"
	"testing"
	"time"
)

// SeenRecently is the mechanism that stops a replayed analytics event from
// being counted twice - the only place duplicates CAN be stopped, since the
// ClickHouse materialized views aggregate on insert and no later merge can
// walk a double-count back.
//
// These pin the three properties VideoEventsHandler depends on. All run against
// the in-process fallback (rdb == nil), which is the same code path a
// single-instance dev box uses.

const idemWindow = 10 * time.Minute

// The key shape the handler builds: "evt_id:" + subject + ":" + eventID.
func idemKey(subject, eventID string) string {
	return "evt_id:" + subject + ":" + eventID
}

// The core promise: the first delivery is new, every replay of it is not.
func TestDuplicateEventIsRecognisedAsSeen(t *testing.T) {
	l := New(nil)
	ctx := context.Background()
	k := idemKey("1234", "m_abc-1-xyz")

	seen, err := l.SeenRecently(ctx, k, idemWindow)
	if err != nil {
		t.Fatalf("first delivery: %v", err)
	}
	if seen {
		t.Fatal("first delivery reported as already seen - every event would be dropped")
	}

	// Three retries of the same event, as a flaky connection would produce.
	for i := 1; i <= 3; i++ {
		seen, err = l.SeenRecently(ctx, k, idemWindow)
		if err != nil {
			t.Fatalf("retry %d: %v", i, err)
		}
		if !seen {
			t.Errorf("retry %d reported as new - it would be counted again", i)
		}
	}
}

// Two genuinely different events must both get through. A key that collided
// here would silently discard real views.
func TestDistinctEventIDsAreIndependent(t *testing.T) {
	l := New(nil)
	ctx := context.Background()

	for _, id := range []string{"m_abc-1-aaa", "m_abc-2-bbb", "vv:918273", "like:5", "unlike:5"} {
		seen, err := l.SeenRecently(ctx, idemKey("1234", id), idemWindow)
		if err != nil {
			t.Fatalf("%s: %v", id, err)
		}
		if seen {
			t.Errorf("event id %q collided with an earlier one", id)
		}
	}
}

// The key is scoped to the subject on purpose. Without that, one client could
// burn an id and suppress a different viewer's event - a way to quietly hold
// down a creator's numbers.
func TestSameEventIDFromDifferentSubjectsBothCount(t *testing.T) {
	l := New(nil)
	ctx := context.Background()
	const shared = "collision-abc"

	seen, err := l.SeenRecently(ctx, idemKey("1234", shared), idemWindow)
	if err != nil {
		t.Fatalf("first subject: %v", err)
	}
	if seen {
		t.Fatal("first subject reported as already seen")
	}

	seen, err = l.SeenRecently(ctx, idemKey("5678", shared), idemWindow)
	if err != nil {
		t.Fatalf("second subject: %v", err)
	}
	if seen {
		t.Error("a second viewer's event was suppressed by the first viewer's id")
	}
}

// Once the window passes the same id is accepted again. That is intended: the
// window only has to outlive a retry, and holding every view's key forever is
// what the short TTL exists to avoid.
func TestEventIDIsForgottenAfterTheWindow(t *testing.T) {
	l := New(nil)
	ctx := context.Background()
	k := idemKey("1234", "expiring")

	if _, err := l.SeenRecently(ctx, k, time.Millisecond); err != nil {
		t.Fatalf("first delivery: %v", err)
	}
	time.Sleep(5 * time.Millisecond)

	seen, err := l.SeenRecently(ctx, k, time.Millisecond)
	if err != nil {
		t.Fatalf("after expiry: %v", err)
	}
	if seen {
		t.Error("key outlived its TTL - the dedupe store would grow without bound")
	}
}
