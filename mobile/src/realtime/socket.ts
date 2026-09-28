import { useAuthStore } from "@/store/auth.store";
import { registerSessionReset } from "@/store/session";
import { CentrifugoSocket, type RealtimeSocket } from "./centrifugo";

export type { RealtimeSocket } from "./centrifugo";

/**
 * Single shared realtime connection (Centrifugo). Presents the
 * {@link RealtimeSocket} surface so acquire/release/peek and every call site
 * (CallProvider, stores, screens) stay identical.
 *
 * Used for WebRTC call signalling (+ presence/typing). Direct messages still go
 * through the Laravel REST API + polling, so this connection is only held while
 * it's actually needed (a chat screen is open or a call is active).
 */
let socket: RealtimeSocket | null = null;
/**
 * The account this socket was built for.
 *
 * CentrifugoSocket subscribes to `user:<id>` in its CONSTRUCTOR, so the
 * connection is bound to one account for its whole life. Tracking that id is
 * what lets acquireSocket refuse to hand it to a different one.
 */
let socketUserId = 0;
let refCount = 0;

function currentUserId(): number {
  return useAuthStore.getState().user?.id ?? 0;
}

async function makeSocket(): Promise<RealtimeSocket> {
  const userId = currentUserId();
  const cf = new CentrifugoSocket(userId);
  socketUserId = userId;
  cf.connect();
  return cf;
}

/** Tear the connection down regardless of refCount. Safe to call twice. */
function destroySocket(): void {
  if (!socket) return;
  try { socket.disconnect(); } catch { /* already gone */ }
  try { socket.removeAllListeners(); } catch { /* already gone */ }
  socket = null;
  socketUserId = 0;
}

/** Get (lazily creating) the shared socket. Always pair with releaseSocket(). */
export async function acquireSocket(): Promise<RealtimeSocket> {
  // Never hand back a connection belonging to another account.
  //
  // This is refcounted and shared, so the old behaviour only rebuilt it once
  // the LAST holder released. Switch accounts while anything still held a
  // reference - a chat screen, a live room - and the next acquire returned the
  // previous account's socket, still subscribed to `user:<A>`: account B would
  // receive A's private events and none of its own, on a connection
  // authenticated as A.
  if (socket && socketUserId !== currentUserId()) destroySocket();

  refCount += 1;
  if (!socket) socket = await makeSocket();
  else if (!socket.connected) socket.connect();
  return socket;
}

/** Release a reference; disconnects once nothing is using it. */
export function releaseSocket() {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0) destroySocket();
}

/*
 * Drop the outgoing account's connection the moment the session changes.
 *
 * The auth store runs this registry on every sign-in, account switch and
 * sign-out, alongside queryClient.clear() - so the realtime connection is now
 * torn down on exactly the same beat as the cached data, instead of being the
 * one piece of per-account state that outlived the account.
 *
 * refCount is reset with it: holders are about to re-run their own effects
 * (CallProvider keys its socket effect on user?.id) and will acquire fresh.
 * Leaving a stale count would keep the next socket pinned open after its last
 * real holder had gone.
 */
registerSessionReset(() => {
  destroySocket();
  refCount = 0;
});

/** The current socket if present, else null (no ref change). */
export function peekSocket(): RealtimeSocket | null {
  return socket;
}
