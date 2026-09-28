package handlers

import "testing"

func TestCompactCount(t *testing.T) {
	cases := []struct {
		n    int64
		want string
	}{
		{0, "0"},
		{999, "999"},
		{1000, "1K"},
		{1500, "1.5K"},
		{12000, "12K"},
		{999000, "999K"},
		{1000000, "1M"},
		{2300000, "2.3M"},
	}
	for _, tc := range cases {
		if got := compactCount(tc.n); got != tc.want {
			t.Errorf("compactCount(%d) = %q, want %q", tc.n, got, tc.want)
		}
	}
}

func TestIntQueryInRange(t *testing.T) {
	// Absent -> default, no error.
	if v, errFn := intQueryInRange("", 7, 1, 90, "days"); v != 7 || errFn != nil {
		t.Errorf("empty: got (%d, err=%v), want (7, nil)", v, errFn != nil)
	}
	// Valid in range.
	if v, errFn := intQueryInRange("14", 7, 1, 90, "days"); v != 14 || errFn != nil {
		t.Errorf("valid: got (%d, err=%v), want (14, nil)", v, errFn != nil)
	}
	// Whitespace trimmed.
	if v, errFn := intQueryInRange("  8 ", 7, 1, 90, "days"); v != 8 || errFn != nil {
		t.Errorf("padded: got (%d, err=%v), want (8, nil)", v, errFn != nil)
	}
	// Below min, above max, and non-integer all return a deferred error responder.
	for _, raw := range []string{"0", "91", "abc", "1.5"} {
		if _, errFn := intQueryInRange(raw, 7, 1, 90, "days"); errFn == nil {
			t.Errorf("intQueryInRange(%q) = nil error, want validation error", raw)
		}
	}
}
