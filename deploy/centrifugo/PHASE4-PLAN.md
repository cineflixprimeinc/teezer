# Centrifugo Phase 4 - client→server actions → Laravel HTTP

**Status: DRAFT / design only. No code changes until staging validation is GREEN.**

Phases 1–3 moved every server→client **fan-out** to Centrifugo (behind flags).
What's left on Socket.IO are the client→server **actions** the chat-server serves
with DB writes or ack replies - pub/sub can't express these. Phase 4 rehomes them
as Laravel HTTP endpoints and points each client's `emitBridge()` at them. After
Phase 4 the chat-server owns nothing unique → Phase 5 deletes it.

---

## 1. The one product decision - two DM systems

Recon found two messaging systems sharing the chat-server:

- **System B - Laravel `direct_messages`** (`MessageController` REST + `RealtimeBus`
  `message.new/sent/read`). The **active** 1:1 DM path: web uses it (REST + polling),
  mobile uses it (REST + `user:<id>` receipts). ✅
- **System A - chat-server `chat_*` tables** (`message:send/read/react/delete`,
  typing) driven directly by socket handlers. Recon found **no active client**
  consuming it - the web `useChat`/`chatService` modules are dead code; mobile uses
  System B. ⚠️ Appears legacy/orphaned.

**Recommendation: keep System B; retire System A group-chat with the chat-server in
Phase 5 - do NOT port its handlers.** If no client uses it, there's nothing to
migrate. **➜ Please confirm System A group chat isn't used somewhere I didn't trace**
(e.g. a group-chat screen). If it IS live, Phase 4 grows to port `message:send/read/
react/delete` + typing into Laravel endpoints - a materially larger lift.

(Calls' `chat_calls`/`chat_call_participants` ARE used and DO get ported - §2.)

---

## 2. New Laravel endpoints (all `auth:sanctum`)

Each persists state, then publishes the SAME events via `RealtimeBus::publish(...)`
(already dual-writes under `REALTIME_DRIVER=both`).

### Calls - replaces the chat-server call handlers → `CallController` + `CallService`
| Endpoint | Replaces (socket) | Does |
|---|---|---|
| `POST /calls` `{to_user_id, type}` → `{call_id}` | `call:initiate` (ack) | create `chat_calls` + participants, publish `call:incoming` to callee `user:<id>` |
| `POST /calls/{id}/accept` | `call:accept` | joined/ongoing, publish `call:accepted` |
| `POST /calls/{id}/reject` | `call:reject` | declined/missed, publish `call:rejected` |
| `POST /calls/{id}/end` | `call:end` | ended + duration + call_log msg, publish `call:ended` |
| `POST /calls/{id}/signal` `{to_user_id,type,payload}` | `call:webrtc` | authz, relay-publish `call:webrtc` (offer/answer/ICE) to peer `user:<id>` |

WebRTC signaling stays a relay. Default: HTTP `POST /calls/{id}/signal` (ICE volume
is modest). Option if latency bites: a per-call channel `call:<id>` both peers publish
to, guarded by a subscription token - noted, not default.

### Presence - replaces `presence:get` + `presence:update` fan-out → `PresenceService`
- `POST /presence` `{user_ids}` → `{online:number[]}` (replaces `presence:get`).
  Source of truth = **Centrifugo presence** (query the `user:<id>` channel presence API)
  + the **privacy filter** (`activity_status` + mutual-follow) ported from the
  chat-server. Removes the `rsoo:online:*` Redis bookkeeping.
- Live `presence:update`: use Centrifugo's **connect proxy** → `POST /realtime/connected`
  in Laravel, which publishes `presence:update` to the connecting user's allowed DM
  partners (privacy-filtered). Offline handled by Centrifugo presence expiry + the
  clients' existing poll-on-focus (a small latency refinement - document it). The
  `user` namespace already has `presence: true`.

### DM delivery - replaces `dm:delivered`
- `POST /messages/delivered` `{message_ids}` → set `direct_messages.delivered_at`,
  publish `message.delivered` to each sender's `user:<id>`. Idempotent
  (`WHERE delivered_at IS NULL`).
- Connect-time offline sweep: run from the connect proxy, or have the client POST
  unread ids on (re)connect.

---

## 3. Client wiring - `emitBridge`

Both `centrifugo.ts` adapters already funnel non-subscribe emits through
`emitBridge(event, payload, ack)`. Phase 4 turns it into a switch → the endpoints
above. **No UI changes** - CallProvider/screens already pass everything through `.emit`.

```
call:initiate → POST /calls           → ack({ ok:true, call_id })
call:accept   → POST /calls/{id}/accept
call:reject   → POST /calls/{id}/reject
call:end      → POST /calls/{id}/end
call:webrtc   → POST /calls/{id}/signal
presence:get  → POST /presence         → ack({ online })
dm:delivered  → POST /messages/delivered
```

---

## 4. Migration order (under `REALTIME_DRIVER=both`, verify each on web + mobile)

1. **Counts** (`video.*`, `comment.created`) - receive-only, done → verify.
2. **Notifications** - fold `NotificationService::pushRealtime` into
   `RealtimeBus::publish([userRoom],'notification:new',…)` so it flows through the flag.
3. **Follows / profile.viewed / screentime.update** - receive-only → verify.
4. **DM receive** (`message.new/sent/read`) → verify; then the **delivery** endpoint.
5. **Presence** - `POST /presence` + connect proxy.
6. **Calls** - `CallController` + signaling + `emitBridge`.

Enable the client flag per platform as each group passes.

---

## 5. Phase 5 (after everything is verified on `centrifugo`)

Flip `REALTIME_DRIVER=centrifugo`; remove the client flag branches; delete
`chat-server/`; drop `socket.io*` from `chat-server`, `frontend`, `mobile` package.json.

---

## Open questions for you
1. **Confirm System A group chat is unused** (else Phase 4 grows to port it).
2. **WebRTC signaling**: HTTP relay (default) vs per-call Centrifugo channel?
3. **Presence offline latency** via Centrifugo TTL acceptable, or add an explicit
   client "going away" publish?
