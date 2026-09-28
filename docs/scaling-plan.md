# Teezer - Scaling Plan

> This document defines when and how to scale each layer of the stack as the platform grows.  
> Scaling is triggered by measurable thresholds - not by assumption.

---

## Current Architecture (Launch)

```
VPS <SOURCE_HOST5_IP> (Ubuntu 22.04)
├── Nginx (reverse proxy)
├── PHP 8.2-FPM (application)
├── MySQL 8 (database)
├── Supervisor (queue workers × 2)
└── Cloudflare R2 (all media storage - no local disk for uploads)
```

One machine handles everything. This is intentional for launch - simpler to debug, cheaper to run. Media is on R2 from day one.

---

## Scaling Triggers

| Metric | Threshold | Action |
|--------|-----------|--------|
| VPS CPU | > 70% sustained | Add Redis (offload sessions/cache), optimize queries |
| VPS RAM | > 80% sustained | Upgrade VPS RAM tier |
| VPS disk | > 70% full | Upgrade VPS storage (media is already on R2) |
| DB query time | > 200ms avg | Add indexes, read replica, or query cache |
| API response time | > 500ms p95 | Add Redis cache, query optimization |
| Queue depth | > 1000 pending jobs | Increase Supervisor workers |
| Concurrent users | > 500/min | Redis sessions, read replica, CDN |

---

## Phase 1–5: Single VPS (Current)

No scaling changes needed. Focus is on correctness and features.

**What to monitor:**
- `sudo htop` - CPU and RAM
- `df -h` - disk usage
- `sudo tail -f /var/log/nginx/error.log` - error rate
- `php artisan queue:monitor` - queue depth

---

## Cloudflare R2 Media Storage (Active from Launch)

R2 is already integrated and active. No migration needed.

### How It Works

- `FILESYSTEM_DISK=r2` in production `.env`
- All uploads go through `StorageService` → `Storage::disk('r2')->putFileAs(...)`
- MySQL stores the R2 object **key** (e.g. `videos/2026/05/uuid.mp4`)
- API responses expand keys to CDN URLs via `Storage::disk('r2')->url($key)`
- Custom domain `media.teezer.live` → R2 bucket

URL pattern:
```
https://media.teezer.live/videos/2026/05/{uuid}.mp4
https://media.teezer.live/images/2026/05/{uuid}.jpg
https://media.teezer.live/documents/2026/05/{uuid}.pdf
```

### Benefits Already Realized

| Aspect | Result |
|--------|-------|
| VPS disk | Used for OS, app code, and logs only |
| Media delivery | 200+ Cloudflare edge locations globally |
| Bandwidth cost | No egress fees on R2 |
| Scalability | Upload volume has no disk ceiling |

### Future: Presigned Upload URLs (Phase 9+)

For very large video uploads, issue presigned R2 upload URLs from Laravel so the client uploads directly to R2, bypassing VPS bandwidth. Laravel still controls the presigned URL generation and validates before issuing.

---

## Phase 6: Redis (Cache + Queue)

**Trigger:** API response time > 300ms OR queue depth > 500 jobs routinely

### Install Redis on VPS

```bash
sudo apt install -y redis-server
sudo systemctl enable redis-server
sudo systemctl start redis-server
```

Verify: `redis-cli ping` → PONG

### Laravel Config

```bash
composer require predis/predis
```

`.env`:
```dotenv
CACHE_DRIVER=redis
SESSION_DRIVER=redis
QUEUE_CONNECTION=redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=null          ← Set a strong password in production
```

### What Gets Cached in Redis

| Data | TTL | Key Pattern |
|------|-----|-------------|
| User profile | 5 min | `profile:{user_id}` |
| Video metadata | 2 min | `video:{video_id}` |
| For You feed results | 30 sec | `feed:user:{user_id}:page:{n}` |
| Trending hashtags | 10 min | `trending:hashtags` |
| Unread notification count | 60 sec | `notifications:unread:{user_id}` |
| Creator analytics summary | 1 hour | `analytics:creator:{user_id}` |

### Queue Performance

With Redis queue:
- Job latency drops from ~2s (database polling) to ~50ms
- Workers don't hammer the DB with `SELECT`s
- Dead letter queue management via Redis UI

---

## Phase 7: Database Optimization

**Trigger:** DB query time > 100ms on common queries OR reads > 500/sec

### Index Review

Confirm these indexes exist (added in migrations):

```sql
-- videos table
INDEX idx_videos_user_id (user_id)
INDEX idx_videos_status (status)
INDEX idx_videos_created_at (created_at DESC)
INDEX idx_videos_flagged (is_flagged)

-- users table
INDEX idx_users_role (role)
INDEX idx_users_banned (is_banned)

-- notifications table
INDEX idx_notif_user_read (user_id, is_read)
INDEX idx_notif_created (created_at DESC)

-- video_views table
INDEX idx_views_video_id (video_id)
INDEX idx_views_created (created_at)
```

### Query Optimization

- Eager load relationships: `Video::with(['user', 'hashtags'])`
- Use `select()` to fetch only needed columns in list views
- Paginate all list queries - never `->get()` on large tables
- Use counter columns (`likes_count`, `views_count`) instead of `COUNT(*)` joins

### MySQL Slow Query Log

Enable to find problem queries:
```sql
SET GLOBAL slow_query_log = 'ON';
SET GLOBAL long_query_time = 0.5;
SET GLOBAL slow_query_log_file = '/var/log/mysql/slow.log';
```

---

## Phase 8: Read Replica (When Needed)

**Trigger:** DB CPU > 80% sustained, or read:write ratio > 10:1

### MySQL Read Replica

Set up a second VPS (or same-machine secondary) as a MySQL replica:

```sql
-- On primary
CHANGE MASTER TO MASTER_HOST='replica-ip', ...
```

Laravel config (`config/database.php`):
```php
'mysql' => [
    'read' => [
        'host' => ['replica.internal.teezer.live'],
    ],
    'write' => [
        'host' => ['127.0.0.1'],
    ],
    'sticky' => true,
    ...
]
```

All `SELECT` queries (Eloquent reads) route to replica.  
All `INSERT`/`UPDATE`/`DELETE` route to primary.  
`sticky` ensures a write is immediately readable on the same request.

---

## Phase 9: CDN for Static Assets

**Trigger:** Tailwind CSS / JS assets load slowly from VPS

### Cloudflare CDN (Already Active via Cloudflare DNS)

Cloudflare proxies all traffic to `teezer.live` and `api.teezer.live`. Static assets (CSS, JS, images from `public/`) are cached at the edge automatically.

Configure Cloudflare **Cache Rules**:
- `*.css`, `*.js` → Cache Everything, Edge TTL 30 days
- `*.woff2`, `*.woff` → Cache Everything, 365 days
- `*.mp4`, `*.webm` → (served from R2 `media.teezer.live` - separate domain)

**Laravel `public/build/` assets** (Vite output):
- Vite generates content-hashed filenames: `app.abc123.js`
- Safe to cache indefinitely (hash changes on every build)

---

## Phase 9: Horizontal Scaling (If Traffic Demands)

**Trigger:** Single VPS CPU > 80% sustained after Redis + query optimizations

### Load Balancer + Multiple App Servers

```
                Cloudflare DNS
                      │
                      ▼
            [Nginx Load Balancer VPS]
              /         \
    [App VPS 1]      [App VPS 2]
              \         /
           [MySQL Primary]
                 │
          [MySQL Replica]
                 │
        [Redis (shared)]
                 │
       [Cloudflare R2 (shared media)]
```

**Requirements for multi-server:**
- Sessions: must use Redis (not file) - ✅ already planned in Phase 6
- Queue: must use Redis - ✅ already planned in Phase 6
- File storage: must use R2/S3 (not local disk) - ✅ already planned in Phase 6
- Cache: must use Redis - ✅ already planned in Phase 6

If sessions/queue/storage are already on Redis + R2, adding a second app server requires only pointing Nginx load balancer at both.

---

## Scaling Cost Estimate (Reference Only)

| Stage | VPS | Monthly Est. |
|-------|-----|-------------|
| Launch (1 VPS, local storage) | 2 vCPU, 4GB RAM | $20–40 |
| + Redis (same VPS) | No new server | $0 |
| + Cloudflare R2 (10TB storage) | No new server | ~$15/mo for storage |
| + Read Replica (1 more VPS) | 1 vCPU, 2GB RAM | +$12 |
| + 2nd App Server (load balanced) | 2 vCPU, 4GB RAM | +$30 |

Cloudflare R2: $0.015/GB/month storage, $0 egress. For 1TB media ≈ $15/month.

---

## Monitoring Stack (Phase 9)

| Tool | Purpose | Where |
|------|---------|-------|
| Laravel Telescope | Debug queries, jobs, requests | Dev environment only |
| Laravel Pulse | Production metrics dashboard (built-in L11) | Production |
| Supervisor | Queue worker process management | VPS |
| Cloudflare Analytics | Traffic, bandwidth, cache hit rate | Cloudflare dashboard |
| MySQL slow query log | Identify slow queries | VPS MySQL log |
| UFW / fail2ban logs | Intrusion attempts | `/var/log/` |
| Nginx access log | Request volume, status codes | `/var/log/nginx/access.log` |
