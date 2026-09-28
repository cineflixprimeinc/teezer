package handlers

import (
	"math"
	"testing"
	"time"

	"teezer/backend-go/internal/sqlc"
)

func TestComputeFeedScore(t *testing.T) {
	now := time.Date(2026, 7, 11, 12, 0, 0, 0, time.UTC)
	created := now.Add(-24 * time.Hour) // 24h old

	s := feedSignals{
		viewsCount: 1000, likesCount: 100, commentsCount: 50, savesCount: 50, sharesCount: 50,
		createdAt:   created,
		completion:  0.5,
		tags:        []string{"a", "b"},
		interestSet: map[string]struct{}{"a": {}},                   // 1/2 overlap → 0.5
		trendingSet: map[string]struct{}{"a": {}, "b": {}, "c": {}}, // 2/2 → 1.0
		followed:    true,
		now:         now,
	}

	// Recompute the exact weighted sum by hand from the same inputs.
	hours := 24.0
	viewsPerHour := math.Min(1, (1000.0/hours)/100.0) // 0.4166..
	views := 1000.0
	likeRate := math.Min(1, (100.0/views)*10.0)   // 1.0
	commentRate := math.Min(1, (50.0/views)*20.0) // 1.0
	saveRate := math.Min(1, (50.0/views)*20.0)    // 1.0
	shareRate := math.Min(1, (50.0/views)*20.0)   // 1.0
	freshness := 1.0 / (1.0 + math.Log10(hours/24.0+1.0)*4.0)
	want := 0.5*0.28 + viewsPerHour*0.16 + shareRate*0.12 + commentRate*0.10 +
		saveRate*0.08 + likeRate*0.07 + freshness*0.08 + 0.5*0.05 + 1.0*0.04 + 1.0*0.02

	got := computeFeedScore(s)
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("computeFeedScore = %v, want %v", got, want)
	}
}

func TestComputeFeedScore_NoSignals(t *testing.T) {
	now := time.Now().UTC()
	// Brand new video, zero engagement, no tags/follow → only freshness contributes.
	s := feedSignals{createdAt: now, now: now}
	got := computeFeedScore(s)
	// hours clamps to 1 → freshness = 1/(1+log10(1/24+1)*4)
	freshness := 1.0 / (1.0 + math.Log10(1.0/24.0+1.0)*4.0)
	want := freshness * 0.08
	if math.Abs(got-want) > 1e-9 {
		t.Errorf("no-signal score = %v, want %v", got, want)
	}
}

func TestTagOverlap(t *testing.T) {
	set := map[string]struct{}{"x": {}, "y": {}}
	if got := tagOverlap([]string{"x", "z"}, set); got != 0.5 {
		t.Errorf("overlap = %v, want 0.5", got)
	}
	if got := tagOverlap([]string{"x", "y"}, set); got != 1.0 {
		t.Errorf("overlap = %v, want 1.0", got)
	}
	if got := tagOverlap(nil, set); got != 0 {
		t.Errorf("empty tags => %v", got)
	}
	if got := tagOverlap([]string{"x"}, map[string]struct{}{}); got != 0 {
		t.Errorf("empty set => %v", got)
	}
}

func TestDiversifyByCreator(t *testing.T) {
	v := func(id, uid int64) sqlc.ListFeedCandidatesRow {
		return sqlc.ListFeedCandidatesRow{ID: id, UserID: uid}
	}
	// Creator 1 has 3 videos (ranks 1,2,4), creator 2 has 1 (rank 3).
	ranked := []sqlc.ListFeedCandidatesRow{v(10, 1), v(11, 1), v(12, 2), v(13, 1)}
	out := diversifyByCreator(ranked, 2)
	gotIDs := []int64{out[0].ID, out[1].ID, out[2].ID, out[3].ID}
	// kept: 10,11 (creator1 ×2), 12 (creator2); overflow: 13 appended last.
	want := []int64{10, 11, 12, 13}
	for i := range want {
		if gotIDs[i] != want[i] {
			t.Fatalf("diversify order = %v, want %v", gotIDs, want)
		}
	}
}
