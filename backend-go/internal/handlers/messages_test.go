package handlers

import (
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
)

// The DM read endpoints return raw DB::select rows, so their timestamps are the
// Postgres wire format - "2006-01-02 15:04:05", space-separated, no zone, and
// microseconds only when non-zero - NOT toIso8601's "+00:00". Verified against
// the live endpoint (last_ts came back "2026-06-26 04:10:09").
func TestRawTimestamp(t *testing.T) {
	whole := pgtype.Timestamp{Time: time.Date(2026, 6, 26, 4, 10, 9, 0, time.UTC), Valid: true}
	if got := rawTimestamp(whole); got != "2026-06-26 04:10:09" {
		t.Errorf("whole second = %v, want 2026-06-26 04:10:09 (no T, no zone, no .000000)", got)
	}

	frac := pgtype.Timestamp{Time: time.Date(2026, 6, 26, 4, 10, 9, 123456000, time.UTC), Valid: true}
	if got := rawTimestamp(frac); got != "2026-06-26 04:10:09.123456" {
		t.Errorf("fractional = %v, want microseconds appended", got)
	}

	if got := rawTimestamp(pgtype.Timestamp{}); got != nil {
		t.Errorf("NULL = %v, want nil", got)
	}

	// It must NOT look like toIso8601's format.
	if got := rawTimestamp(whole); got == toIso8601(whole) {
		t.Error("rawTimestamp must differ from toIso8601 (space vs T, no +00:00)")
	}
}

func TestClampAndMax(t *testing.T) {
	cases := []struct{ v, lo, hi, want int }{
		{5, 1, 50, 5}, {0, 1, 50, 1}, {99, 1, 50, 50}, {20, 1, 50, 20},
	}
	for _, c := range cases {
		if got := clampInt(c.v, c.lo, c.hi); got != c.want {
			t.Errorf("clampInt(%d,%d,%d)=%d, want %d", c.v, c.lo, c.hi, got, c.want)
		}
	}
	if maxInt(1, 3) != 3 || maxInt(4, 2) != 4 {
		t.Error("maxInt wrong")
	}
}

func TestNumericFloat(t *testing.T) {
	var n pgtype.Numeric
	if err := n.Scan("12.5"); err != nil {
		t.Fatal(err)
	}
	if got := numericFloat(n); got != 12.5 {
		t.Errorf("numericFloat(12.5) = %v, want 12.5", got)
	}
	if got := numericFloat(pgtype.Numeric{}); got != 0 {
		t.Errorf("invalid numeric = %v, want 0", got)
	}
}
