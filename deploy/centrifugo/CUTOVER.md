# Centrifugo Phase 5 - cutover runbook (final step)

Turns Centrifugo into the sole realtime layer and removes Socket.IO. **Do NOT
start until staging validation is GREEN** (`VALIDATION.md`) and every feature -
counts, notifications, follows, DM receive + delivery, presence, calls - is
verified on `REALTIME_DRIVER=centrifugo` on **both** web and mobile.

Everything is behind flags today, so this is a controlled, staged, reversible
sequence - the destructive parts (Step 3) come LAST, after a production bake.

---

## Preconditions (all must be true)
- [ ] Staging validation GREEN (VALIDATION.md §5).
- [ ] `php artisan centrifugo:smoke-test` passes in production.
- [ ] The 3 open decisions confirmed (System A group chat is unused; HTTP relay; TTL presence).
- [ ] `php artisan migrate` has run in production (this branch's migrations).
- [ ] Centrifugo deployed on every box, monitored (admin UI / logs / Prometheus).

## Step 1 - Flip production to Centrifugo (reversible, non-destructive)
Keep the chat-server **running** as a live fallback.
```dotenv
# Laravel .env (all API boxes)
REALTIME_DRIVER=centrifugo          # was `both`
# Web build
NEXT_PUBLIC_REALTIME_DRIVER=centrifugo
# Mobile build (EAS/app config)
EXPO_PUBLIC_REALTIME_DRIVER=centrifugo
```
`php artisan config:clear`; deploy web + a mobile build. Realtime now runs 100%
on Centrifugo; Socket.IO code is still present but idle.
**Rollback:** set the three flags back to `socketio` (or `both`) - instant, no code change.

## Step 2 - Bake (24–48h)
Watch: Centrifugo admin (connections/subscriptions/publish rate), Laravel logs
(`Centrifugo API call failed` / `RealtimeBus.publish failed`), error rates, and
user reports for DMs / calls / notifications / presence. Only proceed if clean.

## Step 3 - Remove Socket.IO (destructive - one PR, easy revert)
Once the bake is clean:

**Laravel** - `app/Services/RealtimeBus.php`: drop the `socketio`/`both` branch +
the driver switch (Centrifugo only); delete `publishSocketIo()` + `const CHANNEL`.
Remove `config/services.php` → `chat` + `realtime.driver`, and the `realtime`
Redis connection in `config/database.php` if nothing else uses it. Delete
`NotificationService` leftovers if any. (Keep `CentrifugoClient` + `RealtimeBus::publish` API.)

**Mobile** - `realtime/socket.ts`: remove the `io(...)` branch + `socket.io-client`
import (Centrifugo only); drop the `realtimeDriver` flag from `constants/config.ts`.
`npm rm socket.io-client`.

**Web** - `features/calls/call-provider.tsx` + `features/studio/studio-page.tsx`:
remove the `io(...)` branch (Centrifugo only) + `socket.io-client` import; drop the
`REALTIME_DRIVER` flag. `npm rm socket.io-client`. (Delete the dead
`hooks/useChat.ts` + `services/chat/` while here.)

**chat-server** - stop the PM2/systemd process; delete the `chat-server/` directory
and its nginx `/socket.io` proxy block.

**Env cleanup** - remove `CHAT_INTERNAL_*`, `REALTIME_REDIS_*` (Laravel),
`INTERNAL_SECRET`/`LARAVEL_API_URL` (chat-server), and the `*_REALTIME_DRIVER` flags.

**Rollback:** revert the PR + restart the chat-server + flip flags back. (Do NOT
delete the chat-server box image until a full release cycle has passed clean.)

## Step 4 - Verify
Full pass on web + mobile: like/comment counts, a notification, follow, a DM
(send → delivered ✓ → read ✓✓), presence dot, and an audio + video call
(initiate → accept → talk → end) across two accounts. Done.
