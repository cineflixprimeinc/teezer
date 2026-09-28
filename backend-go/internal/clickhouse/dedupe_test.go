package clickhouse

import (
	"encoding/json"
	"testing"
)

// The idempotency key only works if it survives the whole journey from PHP to
// the ClickHouse row. It crosses one boundary where that is easy to get wrong -
// the JSON contract between EventStream::push and the drainer - and a break
// there is silent: events keep flowing, the column just reads empty forever and
// every duplicate gets counted.

func TestDecodeEventCarriesEventID(t *testing.T) {
	// Exactly the shape AnalyticsVideoViewObserver produces, event id derived
	// from the VideoView primary key.
	raw := `{
		"event_id": "vv:918273",
		"type": "view",
		"video_id": 42,
		"creator_id": 7,
		"user_id": 1234,
		"delta": 1,
		"watch_seconds": 12,
		"ts": "2026-08-30 10:15:00.000"
	}`

	got, err := decodeEvent(raw)
	if err != nil {
		t.Fatalf("decodeEvent: %v", err)
	}
	if got.ID != "vv:918273" {
		t.Errorf("ID = %q, want %q - the idempotency key was dropped in transit", got.ID, "vv:918273")
	}
	if got.Type != "view" || got.VideoID != 42 || got.CreatorID != 7 {
		t.Errorf("decoded event = %+v, want the view fields preserved alongside the id", got)
	}
}

// A producer that predates the key must still decode. This is what keeps the
// change backward compatible with events already sitting in the Redis stream at
// deploy time - they have no event_id field at all.
func TestDecodeEventWithoutEventIDIsValid(t *testing.T) {
	got, err := decodeEvent(`{"type":"like","video_id":9,"delta":1,"ts":"2026-08-30 10:15:00.000"}`)
	if err != nil {
		t.Fatalf("decodeEvent: %v", err)
	}
	if got.ID != "" {
		t.Errorf("ID = %q, want empty for a producer that sends no key", got.ID)
	}
	if got.Type != "like" {
		t.Errorf("Type = %q, want %q", got.Type, "like")
	}
}

// The wire struct is the contract with PHP. If a field name here drifts from
// what EventStream::push writes, that field silently reads as its zero value -
// the exact class of failure the EventStream docblock warns about for the Redis
// key prefix. Pin the JSON names.
func TestWireEventFieldNamesMatchPHP(t *testing.T) {
	// What PHP sends, spelled the way PHP spells it.
	const phpPayload = `{
		"event_id":"like:5","type":"like","video_id":1,"creator_id":2,"user_id":3,
		"session_id":"s","delta":-1,"watch_seconds":4,"completion_pct":55.5,
		"source":"feed","country":"NP","city":"","device_type":"mobile",
		"platform":"ios","ip_hash":123,"ts":"2026-08-30 10:15:00.000"
	}`

	var w wireEvent
	if err := json.Unmarshal([]byte(phpPayload), &w); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	for _, c := range []struct {
		name string
		got  any
		want any
	}{
		{"event_id", w.EventID, "like:5"},
		{"type", w.Type, "like"},
		{"video_id", w.VideoID, uint64(1)},
		{"creator_id", w.CreatorID, uint64(2)},
		{"user_id", w.UserID, uint64(3)},
		{"delta", w.Delta, int8(-1)},
		{"watch_seconds", w.WatchSeconds, uint32(4)},
		{"completion_pct", w.CompletionPct, float32(55.5)},
		{"source", w.Source, "feed"},
		{"country", w.Country, "NP"},
		{"device_type", w.DeviceType, "mobile"},
		{"platform", w.Platform, "ios"},
		{"ip_hash", w.IPHash, uint64(123)},
	} {
		if c.got != c.want {
			t.Errorf("%s = %v, want %v", c.name, c.got, c.want)
		}
	}
}

// A like and its undo share a row id, so the observer keys on type+id. If those
// ever collapsed to the same string, the unlike would look like a replay of the
// like, get dropped at ingest, and that creator's like count would never come
// back down. Encode the requirement here so the PHP side cannot be "simplified"
// into a bug that only shows up as a slowly inflating metric.
func TestUndoEventIDMustDifferFromItsBase(t *testing.T) {
	const rowID = "5"

	for _, base := range []string{TypeLike, TypeSave, TypeComment, TypeFollowFromVideo} {
		undo, delta, ok := Undo(base)
		if !ok {
			t.Fatalf("Undo(%q) reported not reversible", base)
		}
		if delta != -1 {
			t.Errorf("Undo(%q) delta = %d, want -1", base, delta)
		}

		baseKey := base + ":" + rowID
		undoKey := undo + ":" + rowID
		if baseKey == undoKey {
			t.Errorf("event id collision: %q and its undo both key to %q", base, baseKey)
		}
	}
}
