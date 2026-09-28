"use client";

import { CentrifugoWebSocket, type RealtimeSocket } from "./centrifugo";

export type { RealtimeSocket } from "./centrifugo";

/**
 * One shared Centrifugo connection per signed-in session, mirroring the mobile
 * app's realtime/socket.ts refcount exactly.
 *
 * Every feature that needs realtime used to call `new CentrifugoWebSocket(id)`
 * for itself - the call provider held one for the whole session, and the
 * activity drawer opened a second one each time it was opened and tore it down
 * on close. Two connections to the same private channel is wasteful; worse, it
 * made the notification listener a property of a piece of UI, so notifications
 * only arrived while that UI was on screen.
 *
 * Acquire while you need it, release when you are done. The connection is
 * created on the first acquire and closed after the last release, so navigating
 * between pages never opens a second socket and never leaves a dangling one.
 */
let socket: RealtimeSocket | null = null;
let socketUserId = 0;
let refCount = 0;

/**
 * Get (lazily creating) the shared socket for this user. Always pair with
 * {@link releaseSocket}.
 *
 * A different user id than the live socket's - a re-login as someone else -
 * replaces the connection rather than leaving the previous account's private
 * channel subscribed.
 */
export function acquireSocket(userId: number): RealtimeSocket {
  if (socket && socketUserId !== userId) {
    socket.disconnect();
    socket = null;
    refCount = 0;
  }
  refCount += 1;
  if (!socket) {
    socket = new CentrifugoWebSocket(userId);
    socketUserId = userId;
  }
  return socket;
}

/** Release a reference; disconnects once nothing is using it. */
export function releaseSocket(): void {
  refCount = Math.max(0, refCount - 1);
  if (refCount === 0 && socket) {
    socket.disconnect();
    socket = null;
    socketUserId = 0;
  }
}

/** The current socket if one exists, else null (no refcount change). */
export function peekSocket(): RealtimeSocket | null {
  return socket;
}
