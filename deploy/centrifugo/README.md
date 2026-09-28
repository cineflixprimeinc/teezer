# Centrifugo - Teezer realtime engine

Migrates Teezer's realtime layer from the Node **Socket.IO chat-server** to
**Centrifugo v5** (Redis engine), phased and reversible. Channel names mirror the
old Socket.IO rooms 1:1 - `video:<id>`, `user:<id>`, `conv:<id>` - and each
publication keeps the same `{event, payload}` envelope the clients already parse,
so **no UI changes** are needed, only the transport underneath.

Files here:

| File | Purpose |
|---|---|
| `config.json` | Non-secret Centrifugo config (namespaces, origins, admin). |
| `docker-compose.yml` | Run Centrifugo via Docker (host networking → box-local Redis). |
| `centrifugo.service` | systemd unit for a bare-binary install (alternative to Docker). |
| `.env.centrifugo.example` | Secrets template (token secret, API key, admin, Redis). |

---

## 1. Generate secrets

```bash
cp .env.centrifugo.example .env
# Fill these (openssl rand -hex 32 for each):
#   CENTRIFUGO_TOKEN_SECRET   - must equal Laravel CENTRIFUGO_TOKEN_SECRET
#   CENTRIFUGO_API_KEY        - must equal Laravel CENTRIFUGO_API_KEY
#   CENTRIFUGO_ADMIN_PASSWORD / CENTRIFUGO_ADMIN_SECRET
#   CENTRIFUGO_REDIS_ADDRESS  - redis://127.0.0.1:6379 (box-local)
```

## 2. Deploy (pick one)

**Docker Compose**
```bash
docker compose --env-file .env up -d
docker compose logs -f centrifugo   # confirm "engine: redis" + "serving"
```

**systemd** - see the header of `centrifugo.service` (binary → `/usr/local/bin`,
config → `/etc/centrifugo/config.json`, secrets → `/etc/centrifugo/centrifugo.env`).

Centrifugo listens on **:8000** (WebSocket + HTTP API + admin). **Firewall 8000**
to localhost + your Laravel app boxes - only the client WebSocket endpoint is
public (via nginx below); the `/api` publish endpoint and admin must stay private.

## 3. nginx (public WebSocket only)

Point a subdomain (e.g. `realtime.teezer.live`) at Centrifugo's client endpoints:

```nginx
location /connection/ {
    proxy_pass http://127.0.0.1:8000;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "Upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_read_timeout 3600s;
}
# Do NOT proxy /api or / (admin) publicly.
```

Client WebSocket URL → `wss://realtime.teezer.live/connection/websocket`.

## 4. Wire the app

**Laravel `.env`** (each box that runs the API):
```dotenv
REALTIME_DRIVER=socketio                     # socketio | centrifugo | both  (default socketio)
CENTRIFUGO_API_URL=http://127.0.0.1:8000     # box-local Centrifugo publish API
CENTRIFUGO_API_KEY=<same as CENTRIFUGO_API_KEY>
CENTRIFUGO_TOKEN_SECRET=<same as CENTRIFUGO_TOKEN_SECRET>
CENTRIFUGO_TOKEN_TTL=3600
```
`RealtimeBus::publish()` already reads `REALTIME_DRIVER`; every existing publish
site is untouched. Laravel mints client JWTs at:
- `GET  /api/v1/realtime/token`      → connection JWT (Sanctum-authed)
- `POST /api/v1/realtime/subscribe`  → subscription JWT for a private channel (`{channel}`)

**Clients** (env only, code lands in Phase 3):
- Website `.env`: `NEXT_PUBLIC_CENTRIFUGO_URL=wss://realtime.teezer.live/connection/websocket`
- Mobile `app.config` extra: `centrifugoUrl=wss://realtime.teezer.live/connection/websocket`

## 5. Channel model

| Channel | Namespace | Access | Carries |
|---|---|---|---|
| `video:<id>` | `video` | public (any authed client, token-free) | `video.liked/unliked/saved/unsaved`, `comment.created` |
| `user:<id>` | `user` | private - owner only (subscription token) | notifications, DMs (`message.new/sent/read/delivered`), `user.followed/unfollowed`, `profile.viewed`, `screentime.update`, `presence:update`, `call:*` |
| `conv:<id>` | `conv` | private - participants only (subscription token) | group-chat messages, typing, read receipts, reactions |

Auth mirrors today's model (chat-server called Laravel `/auth/me`): the client
gets a **connection JWT** from `/realtime/token`, and per-channel **subscription
JWTs** from `/realtime/subscribe` (which authorizes ownership/membership).

---

## 6. Phased rollout runbook (zero-downtime, reversible)

Centrifugo runs **alongside** the Socket.IO chat-server the whole time; cut over
per feature; delete Socket.IO last.

1. **Deploy Centrifugo** (this dir) + set Laravel `CENTRIFUGO_*` - keep `REALTIME_DRIVER=socketio`. No behavior change.
2. **`REALTIME_DRIVER=both`** - every Laravel event now mirrors to Centrifugo **and** Socket.IO. Socket.IO still drives the UI; Centrifugo is shadow-traffic you can watch in the admin UI. Fully reversible (flip back to `socketio`).
3. **Ship the Centrifugo client wrappers** (Phase 3) behind a client flag, subscribed behind the same store/hook seams. Enable per feature and verify web + mobile:
   counts → notifications → DMs/typing/receipts → presence → live/audio → calls.
   (Client-action + ack flows - `call:initiate`, `presence:get`, group-chat sends, `dm:delivered` - become Laravel HTTP endpoints, since Centrifugo is pub/sub-only.)
4. **`REALTIME_DRIVER=centrifugo`** once every feature is verified on Centrifugo.
5. **Decommission**: stop + delete the `chat-server/`, remove `socket.io`/`socket.io-client` from `chat-server`, `frontend`, `mobile` package.json.

**Scaling:** the Redis engine makes multi-node Centrifugo fan out across the whole
fleet natively - closing the gap the old chat-server had (no Socket.IO Redis
adapter → socket-origin events were node-local).

> Version note: config targets **Centrifugo v5** (flat schema). For v6 the schema
> is nested (`client`/`channel`/`engine`/`http_api` sections) - the same values,
> reorganized; migrate with `centrifugo config …` tooling if you upgrade.
