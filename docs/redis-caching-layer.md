# Redis Caching Layer - Teezer

Branch: `feat/redis-caching-layer`. Non-destructive: additive code + one config change. Reads keep using the existing `*_count` columns, so nothing in the read path is rewritten.

## 0. What was already in place (verified on prod, not assumed)
- **Cache + sessions already on Redis.** Live `server/.env`: `CACHE_STORE=redis`, `SESSION_DRIVER=redis`, `REDIS_CLIENT=phpredis` (ext loaded), ~1,123 cache keys live. The "file/database" was only the `.env.example` default.
- **Feed + explore already cached** in `FeedService` (`feed:foryou:*` 5 min, `explore:trending` 15 min) and many configs (app settings, moderation lists, suggestions, OTP, dedupe).
- **Media already on the Cloudflare R2 CDN.** `FILESYSTEM_DISK=r2`, files under `media.teezer.live`; the DB stores **only keys** (`videos/original/…mp4`, `avatars/…png`); `VideoResource` emits HMAC-signed CDN URLs. The app never streams media. ✅ No change needed.

So this branch adds the **two genuinely missing** pieces: a profile read cache, and Redis counter buffering. Plus the queue driver flip.

## 1. Redis connection map (`config/database.php`)
| Connection | DB | Used for | Eviction-safe? |
|---|---|---|---|
| `default` | db0 | sessions, queue, **counter buffer** | persistent - must NOT evict |
| `cache` | db1 | `Cache::` store | may evict under maxmemory |

> The counter buffer uses **db0 (`default`)** on purpose - counters are pending writes; if they lived in the cache db they could be evicted and lost. Ensure db0 has no `maxmemory-policy` that evicts (use `noeviction`, or `volatile-*` so only keys with a TTL are eligible - buffer keys have no TTL).

## 2. Cache keys, TTLs, invalidation

### New: profile read-through cache - `UserController::show()`
| Key | `profile:stats:{user_id}` |
|---|---|
| TTL | **90s** |
| Contents | 6 viewer-INDEPENDENT aggregates: `followers_count`, `following_count`, `videos_count`, `total_likes_received`, `total_video_views`, `has_story` |
| NOT cached | `is_following`, `follow_status`, `is_blocked` (viewer-specific - always live); name/bio/avatar/socialLinks (load live, so edits reflect instantly) |
| Invalidation | **explicit** `Cache::forget("profile:stats:{id}")` in `VideoObserver` on publish / unpublish / delete (creator sees video count change immediately). Follow- and like-driven count changes self-heal within the 90s TTL - deliberately not busted (too high-frequency to be worth it). |

Why: a popular profile was running **6 `count()`/`sum()`/`exists()` queries per view**, identical for every viewer. Now one viewer pays for them per 90s; the rest hit Redis.

### Existing caches (unchanged, for reference)
| Key | TTL | Invalidation |
|---|---|---|
| `feed:foryou:u{id}:p{page}:g{gen}:ex{…}` | 5 min | generation bump (`feed:gen`) on score updates |
| `feed:trending:v2` | 15 min | `Cache::forget` in `UpdateVideoScoreJob` |
| `explore:trending`, `explore:hashtags:top30` | 15 min / 1 h | TTL |
| `app_setting:{key}`, `app_settings_public` | 1 h | `forget` on settings update |

## 3. Counter buffering (`app/Services/CounterBuffer.php` + `counters:flush`)
**Problem:** every view/like did a synchronous `UPDATE videos SET views_count = views_count + 1` on the *same* hot row → row-lock serialisation + a new MVCC tuple per event → autovacuum pressure + WAL/IO. At scale the single hottest write in the system.

**Design:**
- `CounterBuffer::add('video', $id, 'views_count')` → `HINCRBY cntr:video:{id} views_count 1` + `SADD cntr:dirty:video {id}`. O(1), no row lock, no WAL.
- `counters:flush` (scheduled **every minute**, `withoutOverlapping`) drains each dirty set, snapshots each hash atomically (`RENAME`→`HGETALL`→`DEL`, so concurrent increments are never lost or double-counted), and applies all deltas in **one** `UPDATE … FROM (VALUES …)` per table, clamped with `GREATEST(0, …)`.
- Reads stay on `videos.*_count` (now eventually-consistent, lag ≤ 1 min - fine for social counters). `CounterBuffer::current()` adds the live buffered delta back for any response needing an exact just-incremented value.
- Redis-down fallback: `add()` writes straight to the DB so counting never breaks.

**Wired now:** video **views** (`VideoController`, `WatchController`) - highest write volume, and the view endpoint returns no count so there's zero response-correctness risk.

**Intentionally NOT wired yet (documented next step):** likes/saves/shares/follows. Their endpoints return the fresh count in the response, so migrating them must also swap those reads to `CounterBuffer::current()`. Mechanical, but behaviour-affecting - do it as a focused follow-up with the same pattern. `counters:flush` already handles these columns the moment they're wired.

## 4. Queue → Redis (the one remaining driver)
Change (env only, no code): `QUEUE_CONNECTION=database` → `redis`. Moves job enqueue/dequeue off Postgres (the `jobs` table is poll-heavy: workers `SELECT … FOR UPDATE SKIP LOCKED` in a loop) onto Redis BLPOP (push-based, near-zero idle cost).

**Deploy steps (not yet applied - needs a worker restart):**
1. `sed -i 's/^QUEUE_CONNECTION=.*/QUEUE_CONNECTION=redis/' server/.env` on both boxes.
2. `php artisan config:clear` (or re-cache).
3. Restart workers: `pm2 restart teezer-queue teezer-moderation teezer-transcoding` (VPS-2) - they must reload to read the new connection. In-flight DB-queued jobs should drain first (stop enqueueing, let the queue empty, then flip).
4. Verify: `php artisan queue:work redis --once` picks up a test job; watch `pm2 logs`.

## 5. Deploy & verify this branch (when ready - nothing here is deployed yet)
```bash
# on each box
cd /var/www/teezer && git fetch origin feat/redis-caching-layer && git checkout feat/redis-caching-layer && git reset --hard origin/feat/redis-caching-layer
cd server && composer dump-autoload -o && php artisan config:clear
# register the schedule (cron must run `php artisan schedule:run` every minute - confirm it does)
php artisan schedule:list | grep counters:flush
# smoke: record a view, then
php artisan counters:flush         # should report "flushed video: N rows"
```
Rollback: `git checkout feat/postgres-support && reset --hard` + `config:clear`. The buffer falls back to direct DB writes if Redis is unavailable, so no data is lost mid-rollback.
