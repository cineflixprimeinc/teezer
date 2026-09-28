# Teezer Messaging — Software Architecture Document

**Part 1 of 4: Foundations**
Status: draft · Written against the codebase at `59bdff6c`

Covers SAD sections 1–13, 64–68, 79–81. Parts 2–4 (lifecycle, media/calls/security,
ops/admin/roadmap) follow the boundaries set here.

---

## 0. What this document is, and is not

This is not a greenfield design. Teezer already has a working messaging system
carrying real traffic. Every decision below is therefore either *keep*, *extend*,
or *replace* — never "build from scratch", because that is not an option that
exists.

Everything stated as fact was read out of the repository. Where something is
assumed rather than verified, it says so.

---

## 1. System Overview

Teezer messaging today is a Laravel monolith over PostgreSQL, with realtime
partially migrated to Centrifugo and a Go service growing alongside it.

**What exists and works** (verified):

| Concern | Where it lives |
|---|---|
| Conversations, messages | `conversations`, `direct_messages` (Postgres, Laravel) |
| Message vocabulary | `message_type`: text, image, video, voice, audio, document, shared_video, location |
| Message actions | edit, delete-for-me, delete-for-everyone, pin/unpin, forward, react |
| Permission model | `ConversationStatus`: approved / pending_request / rejected / blocked |
| Block | `POST`/`DELETE /users/{username}/block` |
| Presence | `is_online`, filtered by each user's `activity_status` |
| Media | Presign → direct-to-B2 upload → `sendMedia` with the object key |
| Admin | `AdminMessagesController`; `integration_settings` for provider credentials |

**The three facts that shape everything else:**

1. **The Go service is real.** `backend-go` is 106 files with `internal/auth`,
   `ratelimit`, `httpsec`, `database`, `events`, `clickhouse`, and — critically —
   `laravelcrypt`, which lets Go read Laravel-issued credentials. This is a
   working strangler fig, not a prototype. Messaging services belong in Go.

2. **Realtime is mid-migration.** Centrifugo phases 1–4 are shipped behind flags;
   only the cutover remains. A parallel Socket.IO `chat-server` runs on **VPS-1
   only**. Two realtime paths exist simultaneously.

3. **Redis is per-box and local.** Each VPS runs its own Redis. There is no shared
   Redis. This is the single most important constraint in this document.

---

## 2. The Redis constraint (read this before designing anything realtime)

Presence, typing, unread counters and pub/sub all instinctively reach for Redis.
On Teezer, **a key written on VPS-1 is invisible to VPS-2**.

Consequences, unavoidable until fixed:

- A user connected to VPS-1 is not "online" as far as VPS-2 can tell.
- A typing event published on one box never reaches subscribers on the other.
- Any counter kept in Redis diverges per box.

**There are exactly three honest options:**

| Option | Cost | Verdict |
|---|---|---|
| **A. Shared Redis** (managed, or one box as primary) | one network hop; a new SPOF to make HA | **Recommended** |
| **B. Centrifugo as the only fan-out** — never Redis pub/sub | Centrifugo becomes critical path | Viable, pairs with A |
| **C. Sticky sessions** pinning a user to one box | breaks on failover; unread still diverges | Rejected |

**Decision: A + B.** Shared Redis for state, Centrifugo for fan-out. Redis pub/sub
is *never* used for cross-user delivery — that is Centrifugo's job alone. Redis
holds state; Centrifugo moves events. Keeping that line clean is what stops the
two from drifting.

This must land **before** typing indicators, live reactions, or presence. Building
those first means building them twice.

---

## 3. High-Level Architecture

```
                    ┌───────────────┐
   clients ────────▶│    APISIX     │  edge: TLS, CORS, routing, rate limit
  (RN / web)        └───────┬───────┘
                            │
              ┌─────────────┴──────────────┐
              ▼                            ▼
    ┌──────────────────┐         ┌───────────────────┐
    │  Laravel (PHP)   │         │   Go (Fiber)      │
    │  legacy surface  │         │  messaging svcs   │
    └────────┬─────────┘         └─────────┬─────────┘
             │                             │
             └──────────┬──────────────────┘
                        ▼
        ┌───────────────────────────────┐
        │  PostgreSQL (single source)   │
        └───────────────────────────────┘
                        │
        ┌───────────────┼───────────────┐
        ▼               ▼               ▼
   Redis(shared)   NATS JetStream   Centrifugo
   state/cache     durable work     fan-out to clients
                        │
                        ▼
                  FCM / APNs, B2
```

**Both runtimes share one database.** That is what makes incremental migration
safe: a domain can move to Go without a data migration, and can move back.

---

## 4. Service boundaries

Six services, split by *what fails independently* rather than by table:

| Service | Owns | Why separate |
|---|---|---|
| **Conversation** | conversations, membership, status, pin/archive/mute | Permission gate for everything else |
| **Message** | messages, attachments, edit/delete/react/forward | Highest write volume |
| **Realtime** | Centrifugo tokens, channels, event publication | Only thing holding connections |
| **Presence** | online, last-seen, typing | Highest write rate, lowest durability need |
| **Delivery** | receipts, unread counters, offline queue | Correctness-critical, must be idempotent |
| **Notification** | FCM/APNs, batching, mute rules | Slow, third-party, must never block a send |

**Presence and Delivery must not share storage.** Presence is high-churn and
disposable; Delivery is low-churn and must never lose a write. Putting them
together forces one to accept the other's durability cost.

---

## 5. The permission gate

`ConversationStatus` is not a feature — it is the authorisation boundary for the
whole domain. Verified in `MessageController::send`:

```
rejected                        → 403, always
blocked                         → 403, always
pending_request + I received it → 403 "Accept the message request to reply"
pending_request + I sent it     → allowed (currently unlimited)
approved                        → allowed
```

**Every service must consult Conversation before acting.** A reaction, a receipt,
a typing event and a push all leak information about a conversation the viewer may
not be allowed to see. Realtime is the easiest place to leak: a channel granted
without this check hands a blocked user a live feed.

**Rule: the Realtime service issues channel subscriptions only for conversations
the Conversation service has authorised.** No exceptions.

*Known divergence:* the app caps a request at one message; the server does not.
Part 2 resolves this — the server is the correct place for it.

---

## 6. Data model

**Keep as-is** — `conversations`, `direct_messages` and today's columns are sound.

**Extend, do not replace.** `message_type` is the system's vocabulary and is
already persisted on every row. New kinds (sticker, contact, poll, system) are new
enum values plus optional columns, exactly as `location` was added.

**New tables** (Part 2 details columns; boundaries fixed here):

| Table | Owner | Notes |
|---|---|---|
| `direct_message_reactions` | Message | **exists** — unique (message_id, user_id) |
| `conversation_settings` | Conversation | pin, archive, mute-until, wallpaper — **per member**, not per conversation |
| `message_receipts` | Delivery | delivered/read per (message, user) |
| `message_drafts` | Conversation | per (conversation, user) |
| `hidden_messages` | Message | supersedes the `deleted_for_user_ids` array |
| `conversation_members` | Conversation | needed only for group chat — see §9 |

**`deleted_for_user_ids` is a JSON array today.** It works at current scale but
cannot be indexed or joined. It becomes `hidden_messages` when delete-for-me needs
to be filtered in SQL rather than in PHP.

**Per-member, not per-conversation.** Pin, archive, mute and draft are *my* view of
*our* conversation. Storing them on `conversations` breaks the moment one side
archives and the other does not.

---

## 7. Indexes

Verified need, from the queries that actually run:

```sql
-- the thread read: the hottest query in the app
direct_messages (conversation_id, created_at DESC)

-- unread count and the inbox list
direct_messages (receiver_id, read_at)          WHERE read_at IS NULL

-- reactions for a page of thread (exists)
direct_message_reactions (message_id)

-- pinned messages in a conversation
direct_messages (conversation_id, pinned_at DESC) WHERE pinned_at IS NOT NULL

-- inbox ordering
conversations (user_a_id, updated_at DESC), (user_b_id, updated_at DESC)
```

**Partial indexes matter here.** `WHERE read_at IS NULL` indexes only unread rows —
a few thousand — instead of every message ever sent. The same trick already used
for pinned messages.

---

## 8. Message ordering and identity

The requirement is *never duplicate, never lose, always ordered*. Three mechanisms,
each solving one part:

1. **Ordering — server-assigned monotonic `seq` per conversation, not timestamps.**
   Clocks skew and collide; two messages in the same millisecond have no defined
   order. `seq` is assigned inside the insert transaction.

2. **De-duplication — a client-generated `client_id` (UUID), unique per
   conversation.** A retried send carries the same `client_id`, so the second
   insert is rejected and the original returned. This is what makes retries safe
   on a flaky network, and it is why retry can be aggressive.

3. **Delivery — NATS JetStream, at-least-once with idempotent consumers.**
   At-least-once plus de-duplication gives effectively-once. Exactly-once delivery
   is not a thing that exists; do not design as if it does.

Pagination is **keyset on `seq`**, never `OFFSET`. Offset pagination re-reads
skipped rows and shifts under concurrent inserts — in a live chat it silently
drops or repeats messages.

---

## 9. Group chat

Not required today. But `conversations` has `user_a_id`/`user_b_id`, which makes
groups impossible without a schema change.

**Decision: do not build groups now, but keep them cheap later.** New code reads
membership through a Conversation-service function, never by touching
`user_a_id`/`user_b_id` directly. When groups arrive, `conversation_members` is
added and that one function changes. Code that inlined the two columns would all
need rewriting — which is exactly the rewrite this document exists to prevent.

---

## 10. Scaling

**What actually breaks first**, in order:

1. **Realtime connections.** Centrifugo scales horizontally; the app servers behind
   it are stateless. This is the easy part.
2. **`direct_messages` write volume.** One table, growing forever.
3. **Unread counters.** Read on every inbox load, written on every message.

**Sharding: not yet, and design so it stays optional.** Postgres handles this
volume for a long time. When it does not, shard by `conversation_id` — a thread is
the natural boundary, and no query in the system spans conversations except search
(which belongs in a separate index anyway).

**Partition before sharding.** `direct_messages` partitioned monthly by
`created_at` keeps the hot partition small and makes retention a `DROP PARTITION`
instead of a mass delete. Far less disruptive than sharding, and buys years.

**Counters are cached, never computed.** Unread is a maintained integer in Redis
(shared — see §2), rebuilt from Postgres on miss. `COUNT(*)` per inbox row does not
survive scale.

---

## 11. Roadmap

Ordered by dependency, not by visibility. Each module is independently shippable.

| # | Module | Why here |
|---|---|---|
| **0** | **Shared Redis** | §2. Everything realtime is wrong until this lands. |
| **1** | **Centrifugo cutover** | Retires Socket.IO and the VPS-1-only gap. Unblocks 3, 4, 5. |
| **2** | Conversation service (Go) | The permission gate. Everything else calls it. |
| **3** | Presence + typing | First feature to prove the realtime path. |
| **4** | Delivery: receipts, unread | Needs 0 for counters, 1 for live sync. |
| **5** | Reactions realtime | API exists; needs 1 to be live. |
| **6** | Pin / archive / mute chats | `conversation_settings`. Independent of realtime. |
| **7** | Push (FCM/APNs) | Needs 4 to know what is unread. |
| **8** | Offline queue + ordering | Needs `seq` and `client_id` from §8. |
| **9** | Search | Separate index; independent throughout. |
| **10** | Admin + settings | Extends `integration_settings`. |

**Modules 0 and 1 are not features and will not demo.** They are also the reason
everything after them is straightforward rather than a fight. Doing 3–8 first means
building them once on Socket.IO, then again on Centrifugo.

---

## 12. Open questions

Needing a decision before Part 2:

1. **Shared Redis: managed, or self-hosted with one box primary?** Cost vs. an
   HA setup you own.
2. **Does the Go service take new messaging work immediately, or after the
   Centrifugo cutover?** Two migrations at once is a lot of moving parts.
3. **Group chat within 12 months?** Only affects how strictly §9 is applied.
4. **Retention.** Messages forever, or partitioned and aged out? Decides
   partitioning in §10.

---

## Not yet verified

Stated from this session's reading, but worth confirming before Part 2 depends on
them:

- Exact Centrifugo phase-4 state and what the cutover flags still gate
- Whether APISIX rate limits already cover messaging routes
- Whether `chat-server` has consumers other than DM realtime
- Current row count and growth rate of `direct_messages` (decides §10 timing)
