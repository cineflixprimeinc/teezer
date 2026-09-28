"use client";

import { acquireSocket, releaseSocket } from "./socket";

/**
 * The app-wide notification event stream.
 *
 * The backend publishes `notification:new` / `:update` / `:remove` to the
 * signed-in user's private Centrifugo channel (NotificationService::pushRealtime
 * → RealtimeBus::userRoom). Until now the only listener lived inside the
 * activity drawer and was registered when the drawer opened and torn down when
 * it closed, so a notification arriving while the user was reading the feed
 * reached the browser and was dropped on the floor - the row appeared later
 * only because something else refetched the list. That is the whole bug.
 *
 * This module owns exactly one subscription for the session, started once by the
 * app shell, and fans each event out to any component that cares. Components
 * subscribe to THIS, never to the socket: they come and go, the stream does not.
 */

export type NotificationEventKind = "new" | "update" | "remove";

export interface NotificationEvent {
  kind: NotificationEventKind;
  /** Notification (group) id - the identity used to dedupe and to patch in place. */
  id: string | number;
  /** Notification type, e.g. "like", "follow", "tag_request". */
  type?: string;
  /**
   * The full row, in the same shape GET /notifications returns, so a list can
   * insert or update in place with no refetch. Null on `remove`, and null if the
   * server could not serialise it - in which case a consumer that needs content
   * should fall back to a refetch rather than drop the event.
   */
  notification: any | null;
  /** Server timestamp for ordering; events older than what a list already holds are ignorable. */
  updatedAt: string | null;
}

type Listener = (event: NotificationEvent) => void;

const listeners = new Set<Listener>();

/**
 * Listen for notification events. Returns an unsubscribe function - call it from
 * the effect cleanup so a remounting component never stacks up listeners.
 */
export function onNotificationEvent(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function emit(event: NotificationEvent): void {
  for (const cb of Array.from(listeners)) {
    // One bad consumer must never stop the others from seeing the event.
    try { cb(event); } catch { /* isolate */ }
  }
}

function normalise(kind: NotificationEventKind, d: any): NotificationEvent | null {
  const id = d?.notification_id;
  if (id == null) return null;
  const notification = kind === "remove" ? null : (d?.notification ?? null);
  return {
    kind,
    id,
    type: d?.type ?? notification?.type,
    notification,
    updatedAt: notification?.updated_at ?? d?.latest_activity_at ?? null,
  };
}

/**
 * Start the session's single notification subscription. Called once by the app
 * shell while a user is signed in; the returned teardown stops it.
 *
 * The socket itself is shared and refcounted (services/realtime/socket.ts), so
 * this neither opens a second connection alongside the call provider's nor
 * closes one still in use. Reconnection, and re-subscription after it, is the
 * Centrifugo client's own job - it retries with backoff and restores its
 * subscriptions, which is why nothing here tries to reimplement that.
 */
export function startNotificationStream(userId: number): () => void {
  const socket = acquireSocket(userId);

  const onNew = (d: any) => { const e = normalise("new", d); if (e) emit(e); };
  const onUpdate = (d: any) => { const e = normalise("update", d); if (e) emit(e); };
  const onRemove = (d: any) => { const e = normalise("remove", d); if (e) emit(e); };

  socket.on("notification:new", onNew);
  socket.on("notification:update", onUpdate);
  socket.on("notification:remove", onRemove);

  return () => {
    // Pass the handler, never bare `off(event)`: the socket is shared, and the
    // no-callback form drops every listener for that event including other
    // features'.
    socket.off("notification:new", onNew);
    socket.off("notification:update", onUpdate);
    socket.off("notification:remove", onRemove);
    releaseSocket();
  };
}

/**
 * Fold rows that arrived over realtime WHILE a list request was in flight back
 * on top of that request's result.
 *
 * Without this, the sequence "open the page → GET /notifications starts → a
 * like happens → the event is applied to state → the response lands and calls
 * setNotifs(apiRows)" silently drops the newest notification, because the
 * server built that page before the event existed. The rows are re-applied over
 * the response: replaced where the page already contains them, prepended where
 * it does not.
 *
 * The caller clears its pending map when it starts a request, so only events
 * from the in-flight window are ever re-applied.
 */
export function overlayPending<T extends { id: string | number }>(
  items: T[],
  pending: Map<string | number, T>,
): T[] {
  if (pending.size === 0) return items;
  const seen = new Set(items.map((i) => i.id));
  const merged = items.map((i) => {
    const p = pending.get(i.id);
    return p ? { ...i, ...p } : i;
  });
  const fresh: T[] = [];
  for (const [id, row] of pending) if (!seen.has(id)) fresh.push(row);
  return [...fresh, ...merged];
}
