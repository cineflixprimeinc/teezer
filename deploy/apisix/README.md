# Apache APISIX — Teezer API Gateway

APISIX sits between the public nginx vhost and the Laravel monolith, making
every routing, rate-limit, CORS, and observability decision for
`api.teezer.live`. It does **not** perform authentication (Sanctum stays
entirely inside Laravel) and it never touches LiveKit/StreamHub media traffic
or the Centrifugo WebSocket (`realtime.teezer.live`) — see "What's out of
scope" below.

```
Internet → Cloudflare → nginx:443 (Certbot TLS, unchanged)
              → APISIX (127.0.0.1:9080)
                  → teezer-api-internal (127.0.0.1:8091, fastcgi_pass)
                      → the same php-fpm socket Laravel has always run behind
```

## Why this shape

- **nginx keeps TLS termination.** APISIX proxies over loopback HTTP behind
  it. This avoids migrating the live Certbot cert chain onto APISIX for a
  benefit (matching the "Cloudflare → APISIX" diagram literally) that's
  cosmetic — APISIX still makes 100% of the actual gateway decisions either
  way.
- **A second, internal-only nginx vhost, not APISIX → php-fpm directly.**
  APISIX speaks HTTP to upstreams, not FastCGI. Rather than reimplementing
  PHP execution inside Docker, the existing `fastcgi_pass` block moved
  verbatim into `teezer-api-internal.conf` (127.0.0.1:8091, never publicly
  reachable) and APISIX treats it as a normal HTTP upstream.
- **No `jwt-auth` plugin.** Teezer's auth is Laravel Sanctum — opaque,
  DB-validated bearer tokens, not self-contained JWT. APISIX passes
  `Authorization` through untouched; Laravel decides auth exactly as before.
  `key-auth` is enabled instead, for the "API key support" ask, but nothing
  user-facing uses it yet — it's there for future server-to-server callers.
- **Rate limits here are a coarse OUTER layer.** Laravel already has a
  DB-backed per-account/device limiter (`App\Services\SecurityRateLimiter`)
  and route-level `throttle:` middleware (login, 2FA, likes, etc.), plus a
  global `throttle:api` (300/min/IP). None of that was touched — APISIX's
  limits (see the table below) just stop abusive traffic before it reaches
  PHP at all.
- **CORS moved here from Laravel** (`server/config/cors.php` — `paths` is now
  empty). Two layers both setting `Access-Control-Allow-Origin` on the same
  response is invalid and some browsers reject the preflight outright, so
  only one layer can own it. The allow-list is identical: `*.teezer.live` via
  regex, plus whatever's in `APISIX_CORS_ORIGINS` (mirror `CORS_ORIGIN` from
  `server/.env` if it ever changes).

## What's out of scope (deliberately)

- **`realtime.teezer.live`** (Centrifugo WebSocket — chat/notification/
  presence push) keeps its own already-hardened nginx vhost, untouched.
- **LiveKit/StreamHub media and WSS signaling** (VPS2) never touches APISIX —
  only the `/api/v1/spaces/*` token/management REST API does. This was
  already true before APISIX existed (LiveKit is reached from Laravel via a
  private SSH tunnel, never exposed to the public internet from VPS1 at all).
- **teezer.live / admin panel / ads-manager** (Next.js apps) are untouched —
  they call `api.teezer.live`, which is exactly what's being gatewayed, so no
  frontend changes were needed.
- **The mobile app** is untouched — its base URL is still
  `https://api.teezer.live/api/v1`, same hostname, same paths.

## Routes

All routes share one upstream (`teezer-laravel` — there's one Laravel
instance today; it's a real `roundrobin` upstream object with an active
health check against `/up`, so adding a second node later is a one-line
`nodes` edit). The "12 services" in the original spec are path-prefix groups
inside this one app, not physical targets — routes differ by which plugin
tier applies, not by upstream.

| File | Real path(s) | Tier | Rate limit (per IP) |
|---|---|---|---|
| `01-auth.json` | `/api/v1/auth/*` | strict | 30/min, burst 10 |
| `01a-auth-qr-approval.json` | `/api/v1/auth/qr/{scan,confirm,deny}/*` | authenticated | 600/min |
| `02-admin.json` | `/api/v1/admin/*` (incl. admin ads) | restricted | 100/min |
| `03-public.json` | `/api/v1/explore*`, `/watch*`, `/search`, `/feed/*` | moderate | 200/min |
| `04-authenticated.json` | `/videos/*`, `/comments/*`, `/notifications/*`, `/messages/*`, `/users/*`, `/studio/*`, `/spaces/*`, `/calls/*` | higher | 600/min |
| `05-ads.json` | `/studio/promotions*`, `/ad-campaigns*`, `/ad-groups*`, `/ad-creatives*` | authenticated | 600/min |
| `06-catchall.json` | `/api/v1/*`, `/up`, `/sanctum/csrf-cookie` | default | 300/min (matches Laravel's existing global default) |

`06-catchall.json` exists because `routes/api.php` has far more prefixes than
the five explicit tiers name (stories, wallet, gifts, verification,
screen-time, devices, location, music/audio, two-factor, account, profile,
suggestions, history, etc.) — without it, anything not explicitly tiered
would 404 at the gateway. Every real route still works; it just gets the
default tier unless it's specifically called out above.

Every route also gets: `real-ip` (trusts the loopback nginx hop, resolves
Cloudflare's forwarded client IP correctly for both rate-limiting keys and
whatever Laravel sees via `$request->ip()`), `request-id`, `prometheus`,
`gzip`.

## Prerequisites (VPS1)

```
apt-get update
apt-get install -y docker.io docker-compose-plugin jq gettext-base
systemctl enable --now docker
```

## Install

```bash
cd /var/www/teezer/deploy/apisix
cp .env.apisix.example .env
# Fill in APISIX_ADMIN_KEY, APISIX_DASHBOARD_* (openssl rand -hex 32 each),
# APISIX_CORS_ORIGINS (mirror server/.env's CORS_ORIGIN)
mkdir -p secrets && openssl rand -hex 20 > secrets/grafana_admin_password.txt

./render-config.sh          # renders config/dashboard-conf.yaml
docker compose up -d
docker compose ps           # everything healthy?

./apply-routes.sh           # pushes upstream + all 6 routes to the Admin API
```

## Verify BEFORE touching the public nginx vhost

```bash
# Direct to APISIX, bypassing public DNS entirely - the live site is
# completely unaffected up to this point.
curl -s http://127.0.0.1:9080/up
curl -s http://127.0.0.1:9080/api/v1/videos/1 -H 'Host: api.teezer.live'
curl -s -X OPTIONS http://127.0.0.1:9080/api/v1/videos/1 \
  -H 'Origin: https://teezer.live' -H 'Host: api.teezer.live' -i | grep -i access-control
```
Compare each response against curling `api.teezer.live` directly today
(before cutover) — should match byte-for-byte on the body, and the CORS
preflight should show the same allowed origin.

## Cutover

Only after the above checks pass:

```bash
cp /etc/nginx/sites-available/teezer-api /etc/nginx/sites-available/teezer-api.conf.pre-apisix   # extra safety, on top of the copy already committed in this repo
cp deploy/nginx/teezer-api-internal.conf /etc/nginx/sites-available/teezer-api-internal.conf
ln -s /etc/nginx/sites-available/teezer-api-internal.conf /etc/nginx/sites-enabled/
cp deploy/nginx/teezer-api.conf /etc/nginx/sites-available/teezer-api
nginx -t && systemctl reload nginx
```

**Rollback** (instant, at any time):
```bash
cp deploy/nginx/teezer-api.conf.pre-apisix /etc/nginx/sites-available/teezer-api
nginx -t && systemctl reload nginx
```

## Boot persistence

```bash
cp teezer-apisix.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable --now teezer-apisix
```

## Monitoring

Prometheus (`127.0.0.1:9090`) scrapes APISIX's `/apisix/prometheus/metrics`.
Grafana (`127.0.0.1:3005`) has it pre-wired as a datasource. Both loopback
only — reach them the same way every other internal dashboard in this repo is
reached:
```bash
ssh -L 3005:127.0.0.1:3005 -L 9002:127.0.0.1:9002 root@77.237.242.249
```
then `http://127.0.0.1:3005` (Grafana) / `http://127.0.0.1:9002` (APISIX
Dashboard, login from `.env`'s `APISIX_DASHBOARD_*`). Import APISIX's
official Grafana dashboard JSON (ID `11719` on grafana.com) for request
count/latency/error-rate/upstream-health panels.

## Enabling admin IP allowlisting

`02-admin.json` does not restrict by IP by default — enabling it blind, before
knowing the admin team's real static IPs, risks locking out legitimate admins
on a production system. Once you have them:

1. Add to `02-admin.json`'s `"plugins"` object:
   ```json
   "ip-restriction": {
     "whitelist": ["<real CIDR>", "<real CIDR>"],
     "message": "Admin access is restricted to approved networks."
   }
   ```
2. Re-run `./apply-routes.sh`.

## Making a route change

Edit the relevant `routes/*.json`, then `./apply-routes.sh` — it's idempotent
and only that route's config changes (PUT is per-file, keyed by
`_admin_api_path`). No container restart needed; APISIX picks up etcd changes
live.

## Making a `config/apisix-config.yaml` change

`docker compose up -d apisix` alone is not always enough - confirmed live:
after editing `config.yaml` and running `up -d`, the apisix container kept
running with its OLD generated `conf/nginx.conf` (crash-looped on a port
binding the new config no longer used) instead of regenerating from the
updated file. Force a full recreate instead:
```bash
docker compose rm -f apisix && docker compose up -d apisix
```

## Rate limiting

The gateway's limits are **distributed**: counters live in the existing Redis
(`policy: redis`), not in each APISIX node's memory, so a limit is global no
matter how many gateway nodes run. There is one node today; with `policy:
local` — what this used to be — a second node would silently double every
limit and let a client halve their effective cost by spreading requests.

**Every limit is defined in one file: `ratelimit-policies.env`.** To change one,
edit that line and re-run `./apply-routes.sh`. Never edit the numbers in
`routes/*.json` — they are `${RL_*}` placeholders that `envsubst` fills in, and
`apply-routes.sh` refuses to run if any is unset (an unset var renders
`"count": ` — invalid JSON the Admin API rejects with an opaque error).

### Where it sits

```
Cloudflare WAF  ->  nginx  ->  APISIX  ->  Laravel / Go
                               ^^^^^^
```

This is the **outer, per-IP volume** limit, deliberately the loosest of several
layers, because the application knows things the gateway cannot:

| Layer | What it limits | Keyed on | Distributed |
|---|---|---|---|
| APISIX `limit-count` | request volume per route | client IP | yes — shared Redis |
| APISIX `limit-req` | instantaneous burst shape | client IP | no — per node, by design |
| Laravel `throttle:N,M` | per-route volume | authenticated user, else IP | yes — Redis cache store |
| Laravel `SecurityRateLimiter` | brute force | account / device / IP | yes — `rate_limits` table |
| Go `internal/ratelimit` | per-handler volume | caller | yes — Redis `INCR` |

`SecurityRateLimiter` is **not** a duplicate counter: it reacts to failed
*authentication* with escalating blocks, this reacts to request *volume*. Both
were left untouched. Per-user limits are Laravel's job — it knows the
authenticated identity; the gateway does not, and keying a gateway limit on a
bearer token would put a credential in a Redis key.

If a gateway limit starts rejecting real users, that is a bug in
`ratelimit-policies.env`, not a working defence — the application limits are
meant to bite first, because they can return a precise message and an accurate
`Retry-After`.

### Algorithm and Redis keys

`limit-count` is a **fixed window**. The first request for a key sets the
counter with a TTL of `time_window`; every later request in that window is an
atomic Redis `INCR`. Concurrency and the read-then-increment race are Redis's
problem — `INCR` is one round trip and cannot lose an update. Counters expire
on their own; nothing sweeps them.

The trade-off of a fixed window is burst-at-the-boundary: a client can spend a
whole quota at the end of one window and again at the start of the next.
`limit-req` (leaky bucket, in front of the quota) is what absorbs that, and is
intentionally per-node — a bucket shapes instantaneous rate, it is not a shared
budget, and APISIX offers no Redis policy for it.

Counters live in a **dedicated Redis logical database** (`RATELIMIT_REDIS_DATABASE=2`),
not merely a key prefix — db0 holds the queue and CounterBuffer, db1 the Laravel
cache. They can never collide with, or be flushed alongside, application data.
APISIX writes its own `limit-count`-prefixed keys inside that database.

### Failure behaviour

Per route, via `allow_degradation`:

- **Fail open** (`true`) — Redis unreachable means the request is allowed.
  Public reads, authenticated app traffic, ads, catchall, knowledge, admin. A
  Redis blip must not take the product offline.
- **Fail closed** (`false`) — Redis unreachable means the request is REJECTED.
  Auth and QR approval only, where an unlimited credential endpoint is worse
  than an unavailable one.

  Note the status code: APISIX returns **500**, not 429, when the limiter itself
  cannot reach Redis and degradation is not allowed. Verified live by pointing a
  route at a dead Redis port. So a Redis outage shows up on `/api/v1/auth/*` as
  500s, not as rate-limit rejections — worth knowing before debugging one.

`RATELIMIT_REDIS_TIMEOUT` (1000 ms) bounds how long a request may wait on Redis
before that path is taken, so a hung Redis cannot pin gateway workers.

### 429 responses

A gateway rejection returns:

```
HTTP/2 429
content-type: text/plain; charset=utf-8

{"error_msg":"Too many requests. Please slow down and try again shortly."}
```

The message is Teezer's (via `rejected_msg`) but the envelope is APISIX's
`error_msg`, not the `{"success": false, "message": ...}` the rest of the API
uses, and there is **no `Retry-After`**.

That is a known limitation, not an oversight. A `response-rewrite` global rule
was built to reshape it and removed again after testing: `limit-count` rejects
by short-circuiting in the access phase, so global-rule header/body filters
never run for it. Two different discriminators were tried live; neither fired.
Dead config that claims to work is worse than none.

It matters less than it looks. The gateway tier is deliberately the loosest, so
in normal operation the limit a user meets is **Laravel's**, which already
returns the correct envelope and an accurate `Retry-After` from
`ThrottleRequests`. The gateway 429 is a flood shield, seen by abusive traffic
rather than by real clients. Every gateway window is 60s, so a client that does
hit one can retry after a minute.

Nothing in the response reveals which limit fired, what the quota is, or that
Redis or APISIX exist — `show_limit_quota_header` is off for the same reason.

### Scaling

Adding a second APISIX node needs no rate-limit change: point it at the same
Redis and the counters are already shared. The only per-node state left is
`limit-req`'s bucket, which is intended.

### Troubleshooting

- **Everyone suddenly 429s on `/api/v1/auth/*`** — auth fails *closed*. Check
  Redis first: `redis-cli -n 2 ping`. This is the intended trade-off, not a bug.
- **Limits seem twice as generous as configured** — more than one gateway node
  with `policy` back to `local`. Check the applied route:
  `curl -s $ADMIN/apisix/admin/routes/teezer-auth -H "X-API-KEY: $KEY" | jq '.value.plugins["limit-count"].policy'`
- **Inspect live counters** — `redis-cli -n 2 --scan --pattern '*limit*' | head`
  and `redis-cli -n 2 ttl <key>`. Keys are per client IP; a key with no TTL
  would be a bug.
- **A limit change did nothing** — `apply-routes.sh` was not re-run, or it was
  run from a directory without `ratelimit-policies.env`.
