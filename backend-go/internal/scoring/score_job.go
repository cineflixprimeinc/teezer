// Package scoring mirrors App\Jobs\UpdateVideoScoreJob: recompute a video's
// recommendation score from its last-30-days event mix and upsert
// video_scores. Laravel ran this on a queue worker; here it runs as a
// detached goroutine kicked off by the same 5-minute per-video debounce key.
package scoring

import (
	"context"
	"fmt"
	"log"
	"strconv"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"

	"teezer/backend-go/internal/sqlc"
)

type Recomputer struct {
	queries *sqlc.Queries
	rdb     *redis.Client // nil => cache-bust is skipped (no Redis configured)
}

func NewRecomputer(q *sqlc.Queries, rdb *redis.Client) *Recomputer {
	return &Recomputer{queries: q, rdb: rdb}
}

// Recompute is safe to run in its own goroutine; it logs and returns on
// error rather than propagating, since nothing awaits it.
func (r *Recomputer) Recompute(ctx context.Context, videoID int64) {
	if err := r.recompute(ctx, videoID); err != nil {
		log.Printf("scoring: recompute video %d: %v", videoID, err)
	}
}

func (r *Recomputer) recompute(ctx context.Context, videoID int64) error {
	exists, err := r.queries.VideoExistsForScoring(ctx, videoID)
	if err != nil {
		return fmt.Errorf("check video exists: %w", err)
	}
	if !exists {
		return nil
	}

	rows, err := r.queries.AggregateVideoEvents30d(ctx, videoID)
	if err != nil {
		return fmt.Errorf("aggregate events: %w", err)
	}

	counts := make(map[string]int64, len(rows))
	var completionAvg float64
	for _, row := range rows {
		counts[row.EventType] = row.Cnt
		if row.EventType == "view_progress" {
			completionAvg = row.AvgCompletion / 100.0
		}
	}
	completionAvg = clamp(completionAvg, 0, 1)

	completionScore := completionAvg * 0.4
	rewatchScore := float64(counts["rewatch"]) * 2
	likeScore := float64(counts["like"]) * 3
	commentScore := float64(counts["comment"]) * 4
	shareScore := float64(counts["share"]) * 6
	saveScore := float64(counts["save"]) * 5
	followScore := float64(counts["follow_from_video"]) * 8
	skipPenalty := float64(counts["skip"]+counts["not_interested"]) * 5
	reportPenalty := float64(counts["report"]) * 20

	score := completionScore + rewatchScore + likeScore + commentScore +
		shareScore + saveScore + followScore - skipPenalty - reportPenalty

	totalEvents, err := r.queries.CountVideoEvents(ctx, videoID)
	if err != nil {
		return fmt.Errorf("count events: %w", err)
	}

	err = r.queries.UpsertVideoScore(ctx, sqlc.UpsertVideoScoreParams{
		VideoID:         videoID,
		Score:           numeric(score, 4),
		CompletionScore: numeric(completionScore, 4),
		RewatchScore:    numeric(rewatchScore, 4),
		LikeScore:       numeric(likeScore, 4),
		CommentScore:    numeric(commentScore, 4),
		ShareScore:      numeric(shareScore, 4),
		SaveScore:       numeric(saveScore, 4),
		FollowScore:     numeric(followScore, 4),
		SkipPenalty:     numeric(skipPenalty, 4),
		ReportPenalty:   numeric(reportPenalty, 4),
		EventCount:      int32(totalEvents),
	})
	if err != nil {
		return fmt.Errorf("upsert video_scores: %w", err)
	}

	r.bustCache(ctx, videoID)
	return nil
}

// bustCache mirrors Cache::forget("video:score:{id}") and
// Cache::forget('feed:trending:v2'). Laravel's Redis cache store prefixes
// keys with "{app_name_slug}_cache_" (APP_NAME=Teezer, no CACHE_PREFIX
// override => "teezer_cache_"); confirm against the live CACHE_PREFIX
// before relying on this cutting over a warm cache in production.
func (r *Recomputer) bustCache(ctx context.Context, videoID int64) {
	if r.rdb == nil {
		return
	}
	const prefix = "teezer_cache_"
	r.rdb.Del(ctx, prefix+fmt.Sprintf("video:score:%d", videoID))
	r.rdb.Del(ctx, prefix+"feed:trending:v2")
}

func clamp(v, min, max float64) float64 {
	if v < min {
		return min
	}
	if v > max {
		return max
	}
	return v
}

func numeric(v float64, scale int) pgtype.Numeric {
	var n pgtype.Numeric
	_ = n.Scan(strconv.FormatFloat(v, 'f', scale, 64))
	return n
}
