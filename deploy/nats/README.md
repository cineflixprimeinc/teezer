# NATS JetStream - Teezer internal event bus

Sits **between** the Go API and Centrifugo - it does not replace or talk to
clients itself. Centrifugo remains the only client-facing realtime transport;
this just makes the Go API's publish-side async and durable instead of a
synchronous HTTP call inside every like/comment/follow/share request.

```
Go API write handler  →  NATS JetStream  →  events consumer (same process)  →  Centrifogo /api/broadcast  →  mobile + web
     (Postgres is the source of truth throughout - NATS only carries the
      "tell everyone else" side effect, never the write itself)
```

Code lives in `backend-go/internal/events/` (types.go, publisher.go,
consumer.go, centrifugo.go). This directory is only the **server** deploy -
NATS itself, not the Go code that talks to it.

Files here:

| File | Purpose |
|---|---|
| `nats-server.conf` | Non-secret NATS config (JetStream store, ports, log). |
| `docker-compose.yml` | Run NATS via Docker (host networking → 127.0.0.1 only). |
| `nats.service` | systemd unit for a bare-binary install (alternative to Docker). |
| `.env.nats.example` | The two env vars `teezer-go.service` needs to use this bus. |

---

## 1. Deploy (pick one)

**Docker Compose**
```bash
docker compose up -d
docker compose logs -f nats   # confirm "Server is ready"
curl -s http://127.0.0.1:8222/varz | head -5   # monitoring endpoint sanity check
```

**systemd** - see the header of `nats.service` (binary → `/usr/local/bin`,
config → `/etc/nats/nats-server.conf`).

NATS listens on **127.0.0.1:4222** (client) and **127.0.0.1:8222** (HTTP
monitoring) only - same "never reachable externally" posture as
`teezer-go.service` itself (`/opt/teezer-go`, bound to 127.0.0.1:8090, not
wired to nginx). No firewall rule is needed because nothing routes to it from
outside the box; do not add one.

Run one NATS instance **per box** that runs `teezer-go.service` - each Go API
process only needs to reach its own box-local JetStream (unlike Centrifugo's
Redis engine, cross-box fan-out isn't needed here: the events consumer that
bridges to Centrifugo runs in the SAME process as the publisher).

## 2. Wire the Go API

`teezer-go.service`'s env file (wherever its
`EnvironmentFile=` points - same file `DB_PGSQL_*`/`CLICKHOUSE_DSN` already
live in) needs two additions:

```dotenv
# Enables Go-originated realtime publishing (internal/events). Empty = disabled,
# degrades gracefully - the API and every existing endpoint work exactly the
# same either way, just without the "notify other viewers" side effect.
NATS_URL=nats://127.0.0.1:4222

# The SAME Centrifugo instance + API key Laravel already uses (see
# deploy/centrifugo/.env.centrifugo.example) - events published from Go land
# in the identical video:<id>/user:<id> channels Laravel already broadcasts
# to, so mobile/web need no new subscription wiring for events that already
# had a Laravel-originated counterpart.
CENTRIFUGO_API_URL=http://127.0.0.1:8000
CENTRIFUGO_API_KEY=<same value as Laravel's CENTRIFUGO_API_KEY>
```

Then `systemctl restart teezer-go`. On boot the API logs either:
```
events: connected to NATS JetStream (nats://127.0.0.1:4222), stream "REELSOO_EVENTS" ready
events: consumer "centrifugo-bridge" attached to REELSOO_EVENTS, bridging to Centrifugo
```
or, if `NATS_URL` is unset/unreachable:
```
events: NATS_URL not set - realtime event publishing from Go is disabled
```
Either way the API boots and serves every route normally - this is additive,
never load-bearing for correctness (Postgres writes still happen regardless).

## 3. Event model (Phase 1)

One stream, `REELSOO_EVENTS`, subjects `reelsoo.events.<event-name>`. The
bridge consumer is a **durable** JetStream pull consumer (`centrifugo-bridge`)
- survives a restart at the same position, at-least-once delivery, explicit
ack, idempotent via an event-id dedupe (Redis-backed across replicas, in-
process fallback for a single instance).

| Event | Fires from (backend-go handler) | Centrifugo channel | Payload |
|---|---|---|---|
| `video.liked` / `video.unliked` | `likes.go` (Like/Unlike/ToggleLike) | `video:<id>` | `video_id, likes_count` |
| `video.shared` | `shares.go` (Share, only on a genuinely new share) | `video:<id>` | `video_id, shares_count` |
| `comment.deleted` | `comments.go` (Destroy) | `video:<id>` | `video_id, video_comments_count` |
| `comment.liked` / `comment.unliked` | `comments.go` (Like/Unlike) | `video:<id>` | `video_id, comment_id, likes_count` |
| `user.followed` / `user.unfollowed` | `follow.go` (Follow/Unfollow, accepted only) | `user:<id>` | `user_id, followers_count` |

`comment.created` stays Laravel-only (comment creation isn't ported to Go
yet - see the SCOPE NOTE in `comments.go`) and already publishes itself via
the existing `RealtimeBus`/`CentrifugoClient` path - untouched.

## 4. Verifying end-to-end

```bash
# 1. Confirm the stream + consumer exist (needs the nats CLI: go install
#    github.com/nats-io/natscli/nats@latest, or brew/apt install nats-cli):
nats stream info REELSOO_EVENTS --server nats://127.0.0.1:4222
nats consumer info REELSOO_EVENTS centrifugo-bridge --server nats://127.0.0.1:4222

# 2. Trigger a real like via the Go API, then watch teezer-go's log for:
journalctl -u teezer-go -f | grep events:
#   events: consumer: bridged video.liked (id=...) → [video:<id>]

# 3. Confirm Centrifugo actually received it (admin UI or):
curl -s -H "X-API-Key: $CENTRIFUGO_API_KEY" \
  -d '{"channel":"video:<id>"}' http://127.0.0.1:8000/api/presence_stats
```

A connected mobile/web client already subscribed to `video:<id>` (the feed
auto-joins the active video's room on both platforms) should see its like
count update with no refresh - no client changes needed for the events that
already had a Laravel-originated counterpart.
