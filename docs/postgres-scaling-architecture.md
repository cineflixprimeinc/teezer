# Teezer - PostgreSQL Scaling Architecture (staged to 100M)

> Principal-engineer honest framing: the live DB today holds **9 users / 7 videos / ~10k rows**. Most "redesign for 100M" moves (splitting tables, partitioning, BRIN, sharding) give **zero measurable benefit now** and are **risk on a live system**. So this is a *staged* plan: do the cheap, high-leverage things now; pre-build the seams so the heavy changes are drop-in later; execute each heavy change at the milestone where it actually pays off. Nothing here requires a future "redesign" - only additive migrations.

## Guiding principle
Optimise the **write path and the hot read path**, not the table count. Your schema is already well-normalised (relationships are append-only ID-pair tables, real FKs, PK on every table, media is keys-only in R2). The current bottleneck is **synchronous counter UPDATEs on hot rows**, not table shape. Fix that first (done on `feat/redis-caching-layer`).

---

## NOW (0–100k users) - cheap, safe, high ROON
1. **Redis counter buffering** (implemented). Removes the per-event `UPDATE videos` - the single hottest write. Cuts row-lock contention, dead-tuple churn, WAL and IO on `videos`/`profiles`. *Measurable:* writes to a hot video drop from O(events) to O(1/min).
2. **Queue → Redis** (documented). Stops workers polling the `jobs` table; lowers idle DB CPU/IO.
3. **Profile read cache** (implemented). 6 aggregate queries/profile-view → 1 per 90s.
4. **A few real composite indexes** matching actual `ORDER BY` (see Indexes below). Low write cost, removes sorts.
5. **PgBouncer** in `transaction` mode in front of Postgres on VPS-1. PHP-FPM opens a connection per request; at a few hundred FPM workers × 2 boxes you'll exhaust PG's `max_connections` long before you exhaust CPU. PgBouncer multiplexes hundreds of client conns onto ~20 server conns. *Measurable:* RAM per connection (~10MB on PG) → near-zero; removes connection-storm stalls. **Do this before 100k.** Laravel: point `DB_PGSQL_HOST` at PgBouncer's port; set `PDO::ATTR_PERSISTENT=false`, no `SET` that leaks across pooled txns.

## SOON (100k–1M) - pre-built seams, execute when metrics say so
6. **Read replica** (streaming replication to VPS-2's now-free Postgres slot - the old MySQL replica role). Route read-only heavy endpoints (feed, explore, profile, search) to the replica via Laravel's existing `pgsql` read/write split (`DB_PGSQL_READ_HOST`). *Measurable:* offloads the read-dominant feed/explore traffic from the primary; primary keeps headroom for writes. **Trigger:** primary CPU sustained >50% or read latency rising. (Note: replica lag means "just-wrote" reads must hit the primary - the counter buffer already tolerates this.)
7. **Cursor pagination** on feed/explore/profile lists. Today they use `OFFSET`/`paginate()`. `OFFSET 100000` scans+discards 100k rows. Replace with keyset: `WHERE (score,id) < (:lastScore,:lastId) ORDER BY score DESC, id DESC LIMIT n`. *Measurable:* page-N latency goes from O(N) to O(1). Needs the matching composite index (already implied below).
8. **Move search to OpenSearch/Typesense fully.** `caption ILIKE '%q%'` and `username ILIKE '%q%'` are unindexable leading-wildcard scans. Typesense is already a dependency - route `/explore/search` through it; drop the ILIKE fallback for large tables. *Measurable:* search goes from seq-scan to inverted-index; removes the worst seq scans you'll have.

## LATER (1M–10M) - execute per table, only when it's actually big
9. **Partition the append-only event tables monthly** - `video_views`, `video_watch_events`, `video_watch_sessions`, `notifications`, `video_events`. These are insert-only and time-ranged; they're what actually grows to billions. Monthly `RANGE (created_at)` partitions → autovacuum works per-partition (not one 500GB table), old months `DETACH`+archive in O(1), queries prune to the relevant month. *Measurable:* autovacuum time, index size per query, and bulk-delete cost all drop by ~12×. **Do NOT partition now** - partitioning 0–1k-row tables only adds planning overhead.
10. **Split the wide hot tables** *only if* MVCC churn on them becomes the bottleneck: `videos` (85 cols) → keep identity/content on `videos`, move the ~12 volatile counters to `video_statistics(video_id PK, …)` and rarely-read moderation/distribution flags to `video_moderation`. *Why staged:* the win is "a counter UPDATE only rewrites a narrow stats row, not the 85-col video row." But once counters are **buffered (step 1)**, the video row is barely UPDATEd anyway - so this split's value is largely *pre-paid* by the buffer. Re-evaluate with real `pg_stat_user_tables.n_tup_upd`/dead-tuple data before doing it. Same logic for `users` (77 cols) → `user_statistics`, `user_privacy`.

## SCALE-OUT (10M–100M)
11. **Shard by user_id / video_id** (app-level or Citus). Everything above keeps the schema shard-ready: append-only relations, no cross-row denormalised joins, IDs only. Sharding becomes a deployment change, not a schema redesign.
12. **Graph store (Memgraph) for the follow graph** once "followed-by-people-you-follow" style traversals dominate. Keep `followers` as the source of truth in PG; project into the graph store async.

---

## Indexes - review (every index must serve a real query)
Current indexes are reasonable. Concrete, low-risk improvements to make NOW:
- **Feed/trending:** queries filter `status='published' AND deleted_at IS NULL` then `ORDER BY views_count DESC` (or score). Add **partial composite** `videos (status, views_count DESC) WHERE deleted_at IS NULL AND status='published'`. Serves trending; skips drafts/deleted entirely. Replaces reliance on the plain `videos_status_index`.
- **Profile videos:** `WHERE user_id=? AND status='published' ORDER BY created_at DESC` → you already have `videos_user_id_status_created_at_index` ✅. Keep.
- **Drop later, not now:** several single-column boolean indexes (`videos_is_flagged_index`, `users_is_banned_index`) are low-selectivity; re-check with `pg_stat_user_indexes.idx_scan` after **2 weeks of real traffic** (current scan counts are meaningless - stats reset at the cutover). Don't drop blind.
- **Search:** if any ILIKE search stays in PG, add a `gin_trgm_ops` index (`CREATE EXTENSION pg_trgm; CREATE INDEX … USING gin (caption gin_trgm_ops)`) - turns `%q%` into an index scan. Better: move to Typesense (step 8).

## Foreign keys / constraints
Already solid (138 FKs, correct `ON DELETE` actions). Two cleanups:
- The enum **CHECK constraints were dropped** during the MySQL→PG cutover (prod data had out-of-enum values). Re-add corrected `CHECK`s or move these to lookup tables once the data is cleaned - gives the planner better stats and protects integrity. Low priority.
- `video_watch_events.current_time` is a **reserved word** - rename to `position_seconds` in a future migration (works today only because it's quoted; it's a footgun).

## Background workers (already mostly right)
Heavy work is already async (transcoding, moderation, thumbnails, analytics, search sync via queues). Keep extending: feed precompute, notification fan-out, and the counter flush all run off the request path. After step 2, run these on the **Redis** queue.

## Read-replica strategy (summary)
Single primary on VPS-1; add one streaming replica on VPS-2 (reuse the freed Postgres). Reads that tolerate ≤1s lag (feed, explore, profile, search) → replica via `DB_PGSQL_READ_HOST`. Writes + read-your-write paths → primary. PgBouncer in front of each. This is the same topology the old MySQL setup had - rebuild it on Postgres when primary CPU warrants.

## What NOT to do (anti-over-engineering)
- Don't create `*_statistics` tables yet - the counter buffer already removes the churn they'd prevent. Measure first.
- Don't partition empty tables.
- Don't add indexes "for 100M" that no current query uses - every index taxes every write.
- Don't shard before a single primary + replica + PgBouncer is genuinely saturated. That's comfortably past 1M users for this workload.
