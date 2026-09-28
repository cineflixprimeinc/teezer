// Package knowledge serves cached Wikipedia summaries for Teezer surfaces
// (search, hashtag, location, video "learn more").
//
// The whole design exists to answer one constraint: Wikimedia must be called
// as rarely as possible. Every lookup passes through four gates in order, and
// each is far cheaper than the next:
//
//  1. entity gate  - is this even a real-world topic?     (no I/O)
//  2. Redis        - hot cache, sub-millisecond            (network-local)
//  3. Postgres     - durable cache, survives a Redis flush (network-local)
//  4. Wikimedia    - the only external call, once per topic
//
// A negative result is cached exactly like a positive one, because "Wikipedia
// has nothing for this" is the most common answer on a social app and is the
// answer most worth remembering.
package knowledge

import (
	"context"
	"encoding/json"
	"errors"
	"log"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"golang.org/x/sync/singleflight"

	"teezer/backend-go/internal/breaker"
	"teezer/backend-go/internal/ratelimit"
	"teezer/backend-go/internal/sqlc"
	"teezer/backend-go/internal/wikipedia"
)

const (
	// How long a successful article stays fresh before a re-fetch. Wikipedia
	// summaries change slowly; 30 days is the spec'd refresh window and keeps
	// steady-state external traffic near zero.
	articleTTL = 30 * 24 * time.Hour

	// Negative entries expire far sooner than positive ones. A miss can become
	// a hit (someone writes the article, or a rising topic gets a page), so
	// remembering "no" for a month would make us permanently wrong about new
	// subjects. Seven days still collapses ~99% of repeat misses.
	negativeTTL = 7 * 24 * time.Hour

	// Redis holds entries for a day at most regardless of the Postgres TTL.
	// Postgres is the durable layer; Redis is only the speed layer, and a
	// shorter TTL there bounds memory without costing an external call - a
	// Redis miss falls through to Postgres, not to Wikimedia.
	redisTTL         = 24 * time.Hour
	redisNegativeTTL = 6 * time.Hour

	// Ceiling on how long a caller waits for Wikimedia. A knowledge card is
	// decoration: past this point it is better to return "no card" than to
	// hold the request open.
	fetchTimeout = 6 * time.Second
)

// Result is what the handler serialises. Found=false means "render nothing" -
// the client hides the card rather than showing an error, which is why a miss
// is a normal 200 response and not a 404.
type Result struct {
	Found   bool               `json:"found"`
	Article *wikipedia.Article `json:"article,omitempty"`
}

// fetcher is the Wikimedia surface the service depends on, narrowed to one
// method so tests can substitute a stub without any network.
type fetcher interface {
	Summary(ctx context.Context, query string) (*wikipedia.Article, error)
}

type Service struct {
	queries *sqlc.Queries
	cache   *ratelimit.Limiter // Redis when configured, in-process otherwise
	wiki    fetcher
	lang    string

	// singleflight collapses concurrent lookups of the same topic into one
	// execution. This is the "queue duplicate requests" requirement: when a
	// video goes viral and ten thousand users search the same phrase inside a
	// second, Wikimedia sees exactly one request, not ten thousand.
	group singleflight.Group
}

func NewService(q *sqlc.Queries, cache *ratelimit.Limiter, wiki fetcher) *Service {
	if wiki == nil {
		wiki = wikipedia.New(breaker.DefaultTuning())
	}
	return &Service{queries: q, cache: cache, wiki: wiki, lang: "en"}
}

// Lookup runs the full four-gate path for a free-text query.
//
// It never returns an error for "no article" - that is a Result{Found:false}.
// An error here means the lookup itself failed (database down, Wikimedia
// unreachable after retries), and the handler degrades that to a hidden card
// too, because a knowledge card must never be able to break a search page.
func (s *Service) Lookup(ctx context.Context, query string) (Result, error) {
	key, ok := isRealWorldTopic(query)
	if !ok {
		// Gate 1. No I/O at all - this is the path most search traffic takes.
		return Result{Found: false}, nil
	}

	// Gate 2: Redis.
	if r, hit := s.fromRedis(ctx, key); hit {
		return r, nil
	}

	// Gates 3 and 4 are wrapped together in the singleflight, so simultaneous
	// callers for the same key share one Postgres read AND one Wikimedia call.
	// The key is namespaced by language to avoid collapsing different wikis.
	v, err, _ := s.group.Do(s.lang+":"+key, func() (any, error) {
		return s.loadUncached(ctx, key)
	})
	if err != nil {
		return Result{Found: false}, err
	}

	result, _ := v.(Result)
	return result, nil
}

// loadUncached runs the Postgres check and, only if that misses or is stale,
// the single Wikimedia call. Everything it learns is written back to both
// cache layers before returning.
func (s *Service) loadUncached(ctx context.Context, key string) (Result, error) {
	// Gate 3: Postgres.
	row, err := s.queries.GetWikipediaArticle(ctx, sqlc.GetWikipediaArticleParams{
		LookupKey: key,
		Lang:      s.lang,
	})
	switch {
	case err == nil:
		if fresh(row.FetchedAt, row.NotFound) {
			result := rowToResult(row)
			s.toRedis(ctx, key, result)
			return result, nil
		}
		// Stale: fall through and re-fetch. The existing row stays readable
		// until the upsert replaces it, so a Wikimedia outage during a refresh
		// degrades to "serve the stale card", never to "lose the card".
	case errors.Is(err, pgx.ErrNoRows):
		// Genuine first sighting of this topic.
	default:
		return Result{}, err
	}

	// Gate 4: the one external call.
	fetchCtx, cancel := context.WithTimeout(ctx, fetchTimeout)
	defer cancel()

	article, fetchErr := s.wiki.Summary(fetchCtx, key)
	switch {
	case fetchErr == nil:
		result := Result{Found: true, Article: article}
		s.persist(ctx, key, article, false)
		s.toRedis(ctx, key, result)
		return result, nil

	case errors.Is(fetchErr, wikipedia.ErrNotFound):
		// A real, cacheable answer.
		result := Result{Found: false}
		s.persist(ctx, key, nil, true)
		s.toRedis(ctx, key, result)
		return result, nil

	default:
		// Wikimedia failed after its retries. Do NOT write a negative entry -
		// that would turn a transient outage into a week of missing cards.
		// If a stale row exists, serving it beats serving nothing.
		if err == nil && row.Title.Valid {
			log.Printf("knowledge: serving stale entry for %q after fetch failure: %v", key, fetchErr)
			return rowToResult(row), nil
		}
		return Result{Found: false}, fetchErr
	}
}

// fresh reports whether a stored row is still within its refresh window.
func fresh(fetchedAt pgtype.Timestamp, notFound bool) bool {
	if !fetchedAt.Valid {
		return false
	}
	ttl := articleTTL
	if notFound {
		ttl = negativeTTL
	}
	return time.Since(fetchedAt.Time) < ttl
}

func rowToResult(row sqlc.GetWikipediaArticleRow) Result {
	if row.NotFound || !row.Title.Valid {
		return Result{Found: false}
	}
	return Result{
		Found: true,
		Article: &wikipedia.Article{
			Title:      row.Title.String,
			Summary:    row.Summary.String,
			Thumbnail:  row.ThumbnailUrl.String,
			ArticleURL: row.ArticleUrl.String,
		},
	}
}

// persist writes through to Postgres. Failures are logged, never surfaced: the
// user already has their answer, and a cache write that did not land is a
// performance problem on the next request, not a correctness problem on this
// one.
func (s *Service) persist(ctx context.Context, key string, a *wikipedia.Article, notFound bool) {
	params := sqlc.UpsertWikipediaArticleParams{
		LookupKey: key,
		Lang:      s.lang,
		NotFound:  notFound,
	}
	if a != nil {
		params.Title = pgtype.Text{String: a.Title, Valid: true}
		params.Summary = pgtype.Text{String: a.Summary, Valid: true}
		params.ArticleUrl = pgtype.Text{String: a.ArticleURL, Valid: true}
		if a.Thumbnail != "" {
			params.ThumbnailUrl = pgtype.Text{String: a.Thumbnail, Valid: true}
		}
	}

	// Detached from the request context on purpose: a user who navigates away
	// mid-fetch cancels ctx, and we still want the row we paid Wikimedia for.
	writeCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 3*time.Second)
	defer cancel()

	if _, err := s.queries.UpsertWikipediaArticle(writeCtx, params); err != nil {
		log.Printf("knowledge: cache write failed for %q: %v", key, err)
	}
}

/* ── Redis layer ─────────────────────────────────────────────────────── */

func redisKey(lang, key string) string { return "knowledge:" + lang + ":" + key }

func (s *Service) fromRedis(ctx context.Context, key string) (Result, bool) {
	if s.cache == nil {
		return Result{}, false
	}
	raw, ok, err := s.cache.Get(ctx, redisKey(s.lang, key))
	if err != nil || !ok {
		return Result{}, false
	}

	var result Result
	if err := json.Unmarshal([]byte(raw), &result); err != nil {
		// A corrupt entry is treated as a miss; the next write overwrites it.
		return Result{}, false
	}
	return result, true
}

func (s *Service) toRedis(ctx context.Context, key string, r Result) {
	if s.cache == nil {
		return
	}
	encoded, err := json.Marshal(r)
	if err != nil {
		return
	}
	ttl := redisTTL
	if !r.Found {
		ttl = redisNegativeTTL
	}
	if err := s.cache.Put(ctx, redisKey(s.lang, key), string(encoded), ttl); err != nil {
		log.Printf("knowledge: redis write failed for %q: %v", key, err)
	}
}

// Invalidate drops a topic from both cache layers so the next lookup re-fetches.
// This is the "manually invalidated" half of the refresh requirement.
func (s *Service) Invalidate(ctx context.Context, query string) error {
	key := normaliseQuery(query)
	if key == "" {
		return nil
	}
	if s.cache != nil {
		_ = s.cache.Delete(ctx, redisKey(s.lang, key))
	}
	return s.queries.DeleteWikipediaArticle(ctx, sqlc.DeleteWikipediaArticleParams{
		LookupKey: key,
		Lang:      s.lang,
	})
}
