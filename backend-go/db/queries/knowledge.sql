-- name: GetWikipediaArticle :one
-- Second cache layer, read after Redis misses. `fetched_at` comes back with
-- the row so the caller decides staleness (30 days for a hit, far less for a
-- negative) rather than baking a TTL into SQL.
SELECT id, lookup_key, lang, title, summary, thumbnail_url, article_url,
       not_found, fetched_at
FROM wikipedia_articles
WHERE lookup_key = $1 AND lang = $2;

-- name: UpsertWikipediaArticle :one
-- Idempotent by (lookup_key, lang) so the racing writers behind a singleflight
-- miss - or two app instances that each fetched before the other stored -
-- collapse to one row instead of erroring on the unique index.
--
-- fetched_at is refreshed on conflict, which is what turns a re-fetch of a
-- stale row into a renewed cache entry rather than a duplicate.
INSERT INTO wikipedia_articles (
    lookup_key, lang, title, summary, thumbnail_url, article_url,
    not_found, fetched_at, created_at, updated_at
) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), NOW())
ON CONFLICT (lookup_key, lang) DO UPDATE SET
    title         = EXCLUDED.title,
    summary       = EXCLUDED.summary,
    thumbnail_url = EXCLUDED.thumbnail_url,
    article_url   = EXCLUDED.article_url,
    not_found     = EXCLUDED.not_found,
    fetched_at    = NOW(),
    updated_at    = NOW()
RETURNING id, lookup_key, lang, title, summary, thumbnail_url, article_url,
          not_found, fetched_at;

-- name: DeleteWikipediaArticle :exec
-- Manual invalidation - drop the Postgres row so the next lookup re-fetches.
DELETE FROM wikipedia_articles WHERE lookup_key = $1 AND lang = $2;
