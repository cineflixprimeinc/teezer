// Feed ports App\Http\Controllers\Api\VideoController::feed → FeedService::forYou
// (the V1 weighted recommender). A candidate pool (~8× the page) is pulled by
// raw engagement+recency, scored by ten normalized signals, capped to 2 videos
// per creator, then paginated in memory.
//
// SCOPE NOTE: the notInterested / dontRecommendCreator soft filter is NOT ported
// here - it reads Laravel's database-cache in Laravel's key-prefix + serialize
// format cross-process, the same coupling deferred for the interaction writes.
// Until that cache-compat layer lands, a video a user marked "not interested"
// can still surface in the Go feed (fails open, matching an empty cache).
// forYouPools / forYouV2 (the /feed/for-you primary path) are also not ported.
package handlers

import (
	"math"
	"math/rand"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/jackc/pgx/v5/pgtype"

	"teezer/backend-go/internal/auth"
	"teezer/backend-go/internal/sqlc"
)

/* ── GET /videos/feed ───────────────────────────────────────────────── */

func (h *VideosHandler) Feed(c *fiber.Ctx) error {
	ctx := c.Context()
	authUserID := auth.UserID(c) // 0 => guest
	perPage := parsePositiveQuery(c.Query("per_page"), 15)
	page := parsePositiveQuery(c.Query("page"), 1)

	pool := perPage * 8
	if pool < 80 {
		pool = 80
	}

	candidates, err := h.queries.ListFeedCandidates(ctx, sqlc.ListFeedCandidatesParams{
		ExcludeIds: parseExcludeIds(c), AuthUserID: authUserID, Pool: int32(pool),
	})
	if err != nil {
		return serverError(c)
	}
	if len(candidates) == 0 {
		return c.JSON(fiber.Map{"success": true, "data": []fiber.Map{}, "meta": fiber.Map{
			"current_page": 1, "last_page": 1, "per_page": perPage, "total": 0, "next_page_url": nil,
		}})
	}

	now := time.Now().UTC()
	ids := make([]int64, len(candidates))
	creatorSet := map[int64]struct{}{}
	for i, v := range candidates {
		ids[i] = v.ID
		creatorSet[v.UserID] = struct{}{}
	}

	// Signals.
	trendingNames, err := h.queries.FeedTrendingHashtags(ctx, tsUTC(now.AddDate(0, 0, -7)))
	if err != nil {
		return serverError(c)
	}
	trendingSet := stringSet(trendingNames)
	interestSet := map[string]struct{}{}
	followedSet := map[int64]struct{}{}
	if authUserID != 0 {
		interestNames, err := h.queries.FeedUserInterestHashtags(ctx, sqlc.FeedUserInterestHashtagsParams{UserID: authUserID, Cutoff: tsUTC(now.AddDate(0, 0, -30))})
		if err != nil {
			return serverError(c)
		}
		interestSet = stringSet(interestNames)
		followed, err := h.queries.ListFollowedCreatorIDs(ctx, sqlc.ListFollowedCreatorIDsParams{FollowerID: authUserID, Column2: keys(creatorSet)})
		if err != nil {
			return serverError(c)
		}
		for _, id := range followed {
			followedSet[id] = struct{}{}
		}
	}

	completionRows, err := h.queries.FeedCompletionRates(ctx, sqlc.FeedCompletionRatesParams{Ids: ids, Cutoff: tsUTC(now.AddDate(0, 0, -14))})
	if err != nil {
		return serverError(c)
	}
	completionByVideo := make(map[int64]float64, len(completionRows))
	for _, r := range completionRows {
		completionByVideo[r.VideoID] = r.Rate
	}

	hashtagRows, err := h.queries.ListVideoHashtags(ctx, ids)
	if err != nil {
		return serverError(c)
	}
	tagsByVideo := map[int64][]string{}
	for _, r := range hashtagRows {
		tagsByVideo[r.VideoID] = append(tagsByVideo[r.VideoID], r.Name)
	}

	// Score (stable so equal scores keep the raw-engagement pre-order).
	type scoredVideo struct {
		row   sqlc.ListFeedCandidatesRow
		score float64
	}
	scored := make([]scoredVideo, len(candidates))
	for i, v := range candidates {
		_, followed := followedSet[v.UserID]
		s := computeFeedScore(feedSignals{
			viewsCount:    v.ViewsCount,
			likesCount:    v.LikesCount,
			commentsCount: int64(v.CommentsCount),
			savesCount:    int64(v.SavesCount),
			sharesCount:   int64(v.SharesCount),
			createdAt:     v.CreatedAt.Time,
			completion:    completionByVideo[v.ID],
			tags:          tagsByVideo[v.ID],
			interestSet:   interestSet,
			trendingSet:   trendingSet,
			followed:      followed,
			now:           now,
		})
		if authUserID == 0 {
			s += float64(rand.Intn(101)) / 10000.0
		}
		scored[i] = scoredVideo{row: v, score: round(s, 6)}
	}
	// Stable so equal scores keep the raw-engagement pre-order (PHP 8 sortByDesc).
	sort.SliceStable(scored, func(i, j int) bool { return scored[i].score > scored[j].score })

	// Diversify: at most 2 per creator on the ranked list, overflow appended.
	ranked := make([]sqlc.ListFeedCandidatesRow, len(scored))
	for i, s := range scored {
		ranked[i] = s.row
	}
	diversified := diversifyByCreator(ranked, 2)
	total := int64(len(diversified))

	// Paginate the in-memory ranked list.
	start := (page - 1) * perPage
	if start < 0 {
		start = 0
	}
	end := start + perPage
	var slice []sqlc.ListFeedCandidatesRow
	if start < len(diversified) {
		if end > len(diversified) {
			end = len(diversified)
		}
		slice = diversified[start:end]
	}

	videos := make([]sqlc.GetVideoForShowRow, len(slice))
	for i, r := range slice {
		videos[i] = sqlc.GetVideoForShowRow(r)
	}

	data, err := renderVideoList(ctx, h.queries, h.mediaBaseURL, h.signingSecret, videos, authUserID, videoListOpts{
		loadUser: true, loadHashtags: true, loadVisibleCounts: true,
		loadAudio: true, loadMusic: true, loadTagged: true,
	})
	if err != nil {
		return serverError(c)
	}
	return c.JSON(fiber.Map{"success": true, "data": data, "meta": fullMeta(c, page, total, perPage)})
}

/* ── scoring ────────────────────────────────────────────────────────── */

type feedSignals struct {
	viewsCount    int64
	likesCount    int64
	commentsCount int64
	savesCount    int64
	sharesCount   int64
	createdAt     time.Time
	completion    float64
	tags          []string
	interestSet   map[string]struct{}
	trendingSet   map[string]struct{}
	followed      bool
	now           time.Time
}

// computeFeedScore mirrors FeedService::forYou's weighted signal sum (weights
// sum to 1.0). Pure - the guest random jitter is added by the caller.
func computeFeedScore(s feedSignals) float64 {
	hours := math.Max(1, s.now.Sub(s.createdAt).Hours())
	viewsPerHour := math.Min(1, (float64(s.viewsCount)/hours)/100.0)

	views := math.Max(1, float64(s.viewsCount))
	likeRate := math.Min(1, (float64(s.likesCount)/views)*10.0)
	commentRate := math.Min(1, (float64(s.commentsCount)/views)*20.0)
	saveRate := math.Min(1, (float64(s.savesCount)/views)*20.0)
	shareRate := math.Min(1, (float64(s.sharesCount)/views)*20.0)

	freshness := 1.0 / (1.0 + math.Log10(hours/24.0+1.0)*4.0)

	userInterest := tagOverlap(s.tags, s.interestSet)
	trending := tagOverlap(s.tags, s.trendingSet)
	creatorAffinity := 0.0
	if s.followed {
		creatorAffinity = 1.0
	}

	return s.completion*0.28 +
		viewsPerHour*0.16 +
		shareRate*0.12 +
		commentRate*0.10 +
		saveRate*0.08 +
		likeRate*0.07 +
		freshness*0.08 +
		userInterest*0.05 +
		creatorAffinity*0.04 +
		trending*0.02
}

// tagOverlap = min(1, |tags ∩ set| / max(1, |tags|)); 0 when either is empty.
func tagOverlap(tags []string, set map[string]struct{}) float64 {
	if len(set) == 0 || len(tags) == 0 {
		return 0
	}
	matches := 0
	for _, t := range tags {
		if _, ok := set[t]; ok {
			matches++
		}
	}
	return math.Min(1, float64(matches)/math.Max(1, float64(len(tags))))
}

// diversifyByCreator caps a ranked list to maxPerCreator videos per creator,
// appending the overflow after the kept videos (order preserved within each).
func diversifyByCreator(ranked []sqlc.ListFeedCandidatesRow, maxPerCreator int) []sqlc.ListFeedCandidatesRow {
	perCreator := map[int64]int{}
	kept := make([]sqlc.ListFeedCandidatesRow, 0, len(ranked))
	overflow := make([]sqlc.ListFeedCandidatesRow, 0)
	for _, v := range ranked {
		if perCreator[v.UserID] < maxPerCreator {
			perCreator[v.UserID]++
			kept = append(kept, v)
		} else {
			overflow = append(overflow, v)
		}
	}
	return append(kept, overflow...)
}

/* ── helpers ────────────────────────────────────────────────────────── */

func stringSet(names []string) map[string]struct{} {
	set := make(map[string]struct{}, len(names))
	for _, n := range names {
		set[n] = struct{}{}
	}
	return set
}

func tsUTC(t time.Time) pgtype.Timestamp { return pgtype.Timestamp{Time: t.UTC(), Valid: true} }

func parseExcludeIds(c *fiber.Ctx) []int64 {
	out := []int64{}
	args := c.Request().URI().QueryArgs()
	add := func(b []byte) {
		for _, part := range strings.Split(string(b), ",") {
			if n, err := strconv.ParseInt(strings.TrimSpace(part), 10, 64); err == nil && n > 0 {
				out = append(out, n)
			}
		}
	}
	for _, key := range []string{"exclude_ids", "exclude_ids[]"} {
		for _, v := range args.PeekMulti(key) {
			add(v)
		}
	}
	return out
}
