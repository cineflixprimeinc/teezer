# Centrifugo - staging validation runbook

Prove the Phases 1–3 foundation on staging **before** Phase 4. Everything is
behind default-off flags, so this only adds shadow traffic - production stays on
Socket.IO the whole time. Target: ~15 minutes.

## 0. Prereqs
- Centrifugo deployed per `README.md` (Redis engine, secrets set).
- `php artisan migrate` has run on staging (the new migrations).

## 1. Backend ↔ Centrifugo (one command)
Set on the staging Laravel `.env` (see README §4), then:
```bash
php artisan config:clear
php artisan centrifugo:smoke-test
```
**PASS** = `✓ Config present`, `✓ Published … (HTTP 200)`, and it prints a
connection + subscription token.
**FAIL** signatures the command explains inline: 401/403 → `api_key` mismatch;
connection refused → server down / wrong `api_url`; "unknown channel" → namespace
missing in `config.json`.

## 2. Centrifugo server health
- `docker compose logs -f centrifugo` (or `journalctl -u centrifugo`) shows
  `engine: redis` and `serving …`, no restart loop.
- Admin UI at `http://<host>:8000/` loads (login with `CENTRIFUGO_ADMIN_PASSWORD`).

## 3. Turn on dual-publish (shadow)
```dotenv
REALTIME_DRIVER=both      # Laravel now mirrors every event to Centrifugo AND Socket.IO
```
`php artisan config:clear`. Do a real action (like a video, send a DM, follow
someone). In the Centrifugo **admin → Actions**, run `presence`/`history` on the
target channel (e.g. `user:<id>`, `video:<id>`) and confirm the event landed.
Socket.IO still drives the UI - nothing user-visible changes here.

## 4. Client receive path (per platform)
Enable the client flag on a **staging build only**:
- Web: `NEXT_PUBLIC_REALTIME_DRIVER=centrifugo`
- Mobile: `EXPO_PUBLIC_REALTIME_DRIVER=centrifugo`

Then verify (browser devtools / Flipper network + UI):
1. `GET /realtime/token` → 200 with a JWT (connection auth works → `token_secret` matches).
2. WebSocket to `…/connection/websocket` connects and stays up (auto-reconnect on network blip).
3. `POST /realtime/subscribe {channel:"user:<id>"}` → 200 (private-channel authz works).
4. A **real event flows**: from a second device/account, like the video / send a DM /
   follow - the first client's count / notification / DM updates live, identically to Socket.IO.

## 5. Go / No-Go
**GO to Phase 4** when: §1 passes, §4 shows real events arriving on both web + mobile,
and reconnect survives a network drop. (Emit/ack actions - calls, `presence:get`,
`dm:delivered` - are expected to be inert here; they're Phase 4.)

**Rollback (instant, no deploy):**
```dotenv
REALTIME_DRIVER=socketio          # backend
NEXT_PUBLIC_REALTIME_DRIVER=      # web  (unset → socketio)
EXPO_PUBLIC_REALTIME_DRIVER=      # mobile
```
