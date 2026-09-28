package handlers

import "testing"

// Laravel's paginator reports last_page = ceil(total / per_page), and never
// less than 1 - an empty result set is "page 1 of 1", not "page 1 of 0". The
// ceiling is where an off-by-one hides, so the boundaries either side of a full
// page are the cases that matter.
func TestPaginatorMetaLastPage(t *testing.T) {
	cases := []struct {
		total    int64
		perPage  int32
		wantLast int32
	}{
		{0, 20, 1},   // empty is still one page
		{1, 20, 1},
		{19, 20, 1},
		{20, 20, 1},  // exactly full - must NOT roll to 2
		{21, 20, 2},
		{40, 20, 2},
		{41, 20, 3},
		{5, 1, 5},
	}

	for _, c := range cases {
		m := paginatorMeta(c.total, c.perPage, 1)
		if got := m["last_page"].(int32); got != c.wantLast {
			t.Errorf("total=%d perPage=%d: last_page = %d, want %d",
				c.total, c.perPage, got, c.wantLast)
		}
		if got := m["total"].(int64); got != c.total {
			t.Errorf("total=%d: total = %d", c.total, got)
		}
	}
}

// A zero per_page must not divide by zero.
func TestPaginatorMetaZeroPerPage(t *testing.T) {
	m := paginatorMeta(10, 0, 1)
	if got := m["last_page"].(int32); got != 1 {
		t.Errorf("perPage=0: last_page = %d, want 1", got)
	}
}

// ucfirst mirrors PHP's, which the library category filter relies on to turn
// "chill" into the stored mood "Chill". It must not panic on empty input.
func TestUcfirst(t *testing.T) {
	cases := map[string]string{
		"":       "",
		"chill":  "Chill",
		"Chill":  "Chill",
		"a":      "A",
		"romcom": "Romcom",
	}
	for in, want := range cases {
		if got := ucfirst(in); got != want {
			t.Errorf("ucfirst(%q) = %q, want %q", in, got, want)
		}
	}
}

// The category→genre map is the one place the port restates a PHP literal, so
// a typo here silently returns an empty library rather than erroring.
func TestGenreForCategory(t *testing.T) {
	want := map[string]string{
		"hip_hop": "Hip-hop", "electronic": "Electronic", "rock": "Rock",
		"jazz": "Jazz", "rnb": "R&B", "classical": "Classical",
		"indie": "Indie", "nepali": "Nepali", "pop": "Pop",
	}
	if len(genreForCategory) != len(want) {
		t.Fatalf("genreForCategory has %d entries, want %d", len(genreForCategory), len(want))
	}
	for k, v := range want {
		if got := genreForCategory[k]; got != v {
			t.Errorf("genreForCategory[%q] = %q, want %q", k, got, v)
		}
	}
	// A category that is not a genre must fall through to the mood branch.
	if genreForCategory["trending"] != "" {
		t.Error("'trending' must not map to a genre - it is an ordering, not a filter")
	}
}
