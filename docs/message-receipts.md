# DM Delivery & Read Receipts (WhatsApp-style ticks)

Implemented 2026-07-03 on the **live Laravel DM pipeline** (`direct_messages`), using the
existing realtime bus (Laravel → Redis `reelsoo:rt` → chat-server → Socket.IO user rooms).
The dormant `chat_*` tables in chat-server are untouched.

## Status model

| State     | Meaning                                   | Column         | Mobile UI            |
|-----------|-------------------------------------------|----------------|----------------------|
| sending   | optimistic, not yet stored                | - (`_pending`) | 🕓 clock icon         |
| delivered | stored; recipient's device confirmed      | `delivered_at` | ✓ single grey tick   |
| seen      | recipient opened the thread               | `read_at`      | ✓✓ double blue tick  |

`read_at` implies delivery: the read path stamps `delivered_at = COALESCE(delivered_at, NOW())`.

## Event flow (all rooms are `user:<id>`)

| Event               | Direction              | Emitted by | Payload |
|---------------------|------------------------|------------|---------|
| `message.new`       | → receiver             | Laravel `send()` (approved convos only) | `{ message, sender }` |
| `message.sent`      | → sender (other devices)| Laravel `send()` | `{ message, sender }` |
| `dm:delivered`      | device → chat-server   | mobile ACK after `message.new` | `{ message_ids }` |
| `message.delivered` | → sender               | chat-server (`markDmsDelivered`) | `{ receiver_id, message_ids, delivered_at }` |
| `message.read`      | → sender               | Laravel `markMessagesRead()` (markRead + history auto-mark) | `{ reader_id, message_ids, read_at }` |

Offline catch-up: on every socket connect the chat-server sweeps
`receiver_id = me AND delivered_at IS NULL` (partial index `direct_messages_undelivered_idx`)
and notifies each sender - messages sent while the phone was off go ✓ the moment it comes online.

## Touched files

- `server/database/migrations/2026_07_03_100001_add_delivered_at_to_direct_messages_table.php`
  - column, `read_at → delivered_at` backfill, partial index
- `server/app/Models/DirectMessage.php` - fillable/casts
- `server/app/Http/Controllers/Api/MessageController.php` - bus publishes; atomic
  `UPDATE … RETURNING` mark-read helper; `last_delivered_at` in conversations list
- `chat-server/server.js` - `markDmsDelivered()` sweep + `dm:delivered` ACK handler
- `mobile/src/realtime/dm-events.ts` - cache patchers, active-chat registry, ACK dedup
- `mobile/src/realtime/CallProvider.tsx` - global listeners (inbox/badge cache patches)
- `mobile/src/screens/inbox/ChatScreen.tsx` - per-thread live updates, `StatusTicks`,
  socket-aware fallback poll (15s connected / 4s not)
- `mobile/src/screens/inbox/notif-ui.tsx` - ConvRow ticks, slightly-bold unseen preview,
  numeric unread badge

## Notes

- The web messages page still polls the same Laravel endpoints; `delivered_at` /
  `last_delivered_at` are additive, nothing breaks. Wiring web to these socket events is
  a follow-up.
- Read receipts are deduped server-side: the atomic `UPDATE … WHERE read_at IS NULL
  RETURNING` means concurrent mark-read calls can't double-publish.
- Deploy order: run migration (either box, shared DB) → reload PHP on both boxes →
  restart chat-server on VPS-1.
