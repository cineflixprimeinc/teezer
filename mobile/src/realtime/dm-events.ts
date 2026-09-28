import type { QueryClient } from "@tanstack/react-query";
import type { RealtimeSocket } from "./centrifugo";
import { Conversation, DirectMessage } from "@/api/inbox.api";
import { registerSessionReset } from "@/store/session";

/**
 * WhatsApp-style DM receipts over the shared socket.
 *
 * Laravel publishes to per-user rooms via the realtime bus:
 *   message.new       → receiver   (a message arrived - no polling wait)
 *   message.sent      → sender     (echo for the sender's other devices)
 *   message.delivered → sender     (recipient's device ACKed via dm:delivered)
 *   message.read      → sender     (recipient opened the thread → ✓ becomes ✓✓)
 *
 * The helpers here patch ONLY the affected React Query cache entries
 * (["dm-history", peerId] and ["inbox-conversations"]) - never a full refetch.
 */

export interface DmSender {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified?: boolean;
}
export interface DmNewEvent { message: DirectMessage; sender: DmSender }
export interface DmDeliveredEvent { receiver_id: number; message_ids: number[]; delivered_at: string }
export interface DmReadEvent { reader_id: number; message_ids: number[]; read_at: string }
export interface DmTypingEvent { from: number; typing: boolean }

/* ── Active-chat registry ─────────────────────────────────────────
   ChatScreen registers its peer while focused so the global handler knows a
   fresh incoming message there is being read immediately - no unread bump. */
let activeChatPeerId: number | null = null;
export const setActiveChatPeer = (id: number | null) => { activeChatPeerId = id; };
export const getActiveChatPeer = () => activeChatPeerId;

/* ── Typing indicator ──────────────────────────────────────────────
   No explicit "stopped typing" event - the sender only ever emits
   typing:true (see ChatScreen's debounced emit), and each peer's flag
   self-expires here after a few seconds of silence. That covers the
   "stop" case for free (send, delete the draft, background the app, lose
   signal) without a second emit path to keep in sync with the first. */
const TYPING_TIMEOUT_MS = 4000;
const typingPeers = new Set<number>();
const typingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const typingListeners = new Set<() => void>();

export function isPeerTyping(peerId: number): boolean {
  return typingPeers.has(peerId);
}

export function subscribeTyping(listener: () => void): () => void {
  typingListeners.add(listener);
  return () => { typingListeners.delete(listener); };
}

export function applyDmTyping(ev: DmTypingEvent): void {
  const peerId = Number(ev.from);
  if (!peerId) return;
  const timer = typingTimers.get(peerId);
  if (timer) clearTimeout(timer);
  if (ev.typing === false) {
    typingPeers.delete(peerId);
    typingTimers.delete(peerId);
  } else {
    typingPeers.add(peerId);
    typingTimers.set(peerId, setTimeout(() => {
      typingPeers.delete(peerId);
      typingTimers.delete(peerId);
      typingListeners.forEach((l) => l());
    }, TYPING_TIMEOUT_MS));
  }
  typingListeners.forEach((l) => l());
}

/* ── Delivery ACK (client → chat-server) ──────────────────────────
   Deduped so one message never emits dm:delivered twice from this device;
   the server-side "WHERE delivered_at IS NULL" makes retries idempotent
   anyway, and the connect-time sweep covers anything missed offline. */
const ackedDelivered = new Set<number>();

/*
 * Drop every piece of per-account DM state when the session changes.
 *
 * All of the above is module-level and survives an account switch, which the
 * rest of the app does not: the auth store clears react-query and the
 * user-scoped stores, but nothing reached in here. So account B inherited
 * account A's open-chat registration, A's "typing" peers, and A's pending
 * typing timers.
 *
 * The timers are the sharp edge. Each is a live setTimeout holding a peer id
 * from the OUTGOING account, and it fires several seconds later - after the
 * switch - to mutate typingPeers and notify listeners for a person the new
 * account may not even know. Clearing the sets without clearing the timers
 * would leave that scheduled write intact and let it repopulate them.
 *
 * typingListeners is deliberately NOT cleared: those are subscriptions owned by
 * mounted components, which unsubscribe themselves. They are notified instead,
 * so a chat left showing "typing…" from the previous account repaints
 * immediately rather than waiting for that peer to type again.
 */
registerSessionReset(() => {
  activeChatPeerId = null;
  typingTimers.forEach((t) => clearTimeout(t));
  typingTimers.clear();
  typingPeers.clear();
  ackedDelivered.clear();
  typingListeners.forEach((fn) => {
    try { fn(); } catch { /* one bad listener must not stop the rest */ }
  });
});
export function ackDelivered(socket: RealtimeSocket | null, messageIds: number[]) {
  const fresh = messageIds.filter((id) => id > 0 && !ackedDelivered.has(id));
  if (!fresh.length || !socket?.connected) return;
  if (ackedDelivered.size > 2000) ackedDelivered.clear();
  fresh.forEach((id) => ackedDelivered.add(id));
  socket.emit("dm:delivered", { message_ids: fresh });
}

/* ── Cache patch helpers ────────────────────────────────────────── */

/* These keys MUST match the ones ChatScreen and InboxScreen register. They were
 * written against the pre-rebuild names ("chat" / "inboxConversations"), so
 * every patch landed on a cache entry that did not exist and a delivered message
 * only appeared after a manual refresh. */
function patchThread(qc: QueryClient, peerId: number, fn: (msgs: DirectMessage[]) => DirectMessage[]) {
  qc.setQueryData<DirectMessage[]>(["dm-history", peerId], (old) => (old ? fn(old) : old));
}

function appendToThread(msgs: DirectMessage[], msg: DirectMessage): DirectMessage[] {
  return msgs.some((m) => m.id === msg.id) ? msgs : [...msgs, msg];
}

/** Move/update the conversation row for `peerId`; false when it isn't cached yet. */
function patchConvList(qc: QueryClient, peerId: number, fn: (c: Conversation) => Conversation, moveToTop = false): boolean {
  const old = qc.getQueryData<Conversation[]>(["inbox-conversations"]);
  if (!old) return true; // nothing cached - a later refetch will build it
  const i = old.findIndex((c) => c.user_id === peerId);
  if (i < 0) return false;
  const updated = fn(old[i]);
  const next = moveToTop ? [updated, ...old.slice(0, i), ...old.slice(i + 1)] : old.map((c, j) => (j === i ? updated : c));
  qc.setQueryData(["inbox-conversations"], next);
  return true;
}

/** Receiver got a brand-new message (already checked receiver_id === me). */
export function applyDmNew(qc: QueryClient, ev: DmNewEvent) {
  const msg = ev.message;
  const beingRead = getActiveChatPeer() === msg.sender_id;

  patchThread(qc, msg.sender_id, (msgs) => appendToThread(msgs, msg));

  const found = patchConvList(qc, msg.sender_id, (c) => ({
    ...c,
    last_message: msg.body,
    last_message_type: msg.message_type,
    last_ts: msg.created_at,
    last_sender_id: msg.sender_id,
    last_read_at: null,
    last_delivered_at: null,
    unread_count: beingRead ? c.unread_count : c.unread_count + 1,
  }), true);
  // First message from a new partner - the row needs sender profile fields the
  // list query computes (privacy-aware is_online etc.), so refetch that once.
  if (!found) void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });

  if (!beingRead) void qc.invalidateQueries({ queryKey: ["messagesUnreadBadge"] });
}

/** My own send echoed to this device (multi-device sync). */
export function applyDmSent(qc: QueryClient, ev: DmNewEvent) {
  const msg = ev.message;
  patchThread(qc, msg.receiver_id, (msgs) => appendToThread(msgs, msg));
  const found = patchConvList(qc, msg.receiver_id, (c) => ({
    ...c,
    last_message: msg.body,
    last_message_type: msg.message_type,
    last_ts: msg.created_at,
    last_sender_id: msg.sender_id,
    last_read_at: null,
    last_delivered_at: msg.delivered_at ?? null,
  }), true);
  if (!found) void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
}

/** Recipient's device confirmed delivery of my messages (✓ stays single). */
export function applyDmDelivered(qc: QueryClient, ev: DmDeliveredEvent, meId: number) {
  const ids = new Set((ev.message_ids ?? []).map(Number));
  if (!ids.size) return;
  patchThread(qc, ev.receiver_id, (msgs) =>
    msgs.map((m) => (ids.has(m.id) && m.sender_id === meId && !m.delivered_at ? { ...m, delivered_at: ev.delivered_at } : m)));
  patchConvList(qc, ev.receiver_id, (c) =>
    c.last_sender_id === meId ? { ...c, last_delivered_at: c.last_delivered_at ?? ev.delivered_at } : c);
}

/** Recipient opened the thread - my ✓ flips to ✓✓ and the preview un-bolds. */
export function applyDmRead(qc: QueryClient, ev: DmReadEvent, meId: number) {
  const ids = new Set((ev.message_ids ?? []).map(Number));
  if (!ids.size) return;
  patchThread(qc, ev.reader_id, (msgs) =>
    msgs.map((m) => (ids.has(m.id) && !m.read_at ? { ...m, read_at: ev.read_at, delivered_at: m.delivered_at ?? ev.read_at } : m)));
  patchConvList(qc, ev.reader_id, (c) =>
    c.last_sender_id === meId ? { ...c, last_read_at: ev.read_at, last_delivered_at: c.last_delivered_at ?? ev.read_at } : c);
}
