import { Centrifuge, type Subscription } from "centrifuge";
import { realtimeApi } from "@/api/realtime.api";
import { config } from "@/constants/config";

type Handler = (...args: any[]) => void;

/**
 * The realtime socket surface the app uses. The Centrifugo adapter below
 * implements it, so realtime/socket.ts stays transport-agnostic and every call
 * site (stores, dm-events, CallProvider, screens) is untouched.
 */
export interface RealtimeSocket {
  connected: boolean;
  on(event: string, cb: Handler): void;
  off(event: string, cb?: Handler): void;
  emit(event: string, payload?: any, ack?: (res: any) => void): void;
  connect(): void;
  disconnect(): void;
  removeAllListeners(): void;
}

/**
 * Centrifugo adapter with a Socket.IO-compatible API.
 *
 * RECEIVE path (server→client) - fully implemented: subscribes to the per-user
 * private channel `user:<id>` app-wide and per-video public channels on
 * `room:join`, then routes each `{event, payload}` publication to the matching
 * `.on(event)` handlers. The two zustand stores + dm-events cache patchers +
 * CallProvider consume events exactly as before.
 *
 * EMIT path (client→server) - `room:join`/`room:leave` become channel
 * (un)subscribe. The remaining client ACTIONS (`call:*`, `presence:get`,
 * `dm:delivered`) are request/response or DB writes, which Centrifugo (pub/sub
 * only) can't serve - they route to Laravel HTTP endpoints in Phase 4 via
 * `emitBridge`. Until then the driver stays "socketio", so this is inert.
 */
export class CentrifugoSocket implements RealtimeSocket {
  connected = false;

  private cf: Centrifuge;
  private handlers = new Map<string, Set<Handler>>();
  private subs = new Map<string, Subscription>();

  constructor(private readonly userId: number) {
    this.cf = new Centrifuge(config.centrifugoUrl, {
      getToken: () => realtimeApi.token(),
    });
    this.cf.on("connected", () => { this.connected = true; });
    this.cf.on("connecting", () => { this.connected = false; });
    this.cf.on("disconnected", () => { this.connected = false; });

    // App-wide private per-user channel (notifications, DMs, calls, presence…).
    if (userId > 0) this.subscribeChannel(`user:${userId}`, true);
  }

  connect(): void { this.cf.connect(); }

  disconnect(): void {
    try { this.cf.disconnect(); } catch { /* ignore */ }
    this.connected = false;
  }

  on(event: string, cb: Handler): void {
    let set = this.handlers.get(event);
    if (!set) { set = new Set(); this.handlers.set(event, set); }
    set.add(cb);
  }

  off(event: string, cb?: Handler): void {
    if (!cb) { this.handlers.delete(event); return; }
    this.handlers.get(event)?.delete(cb);
  }

  removeAllListeners(): void {
    this.handlers.clear();
    for (const sub of this.subs.values()) {
      try { sub.unsubscribe(); this.cf.removeSubscription(sub); } catch { /* ignore */ }
    }
    this.subs.clear();
  }

  emit(event: string, payload?: any, ack?: (res: any) => void): void {
    // Public per-video engagement channels: room:join/leave → subscribe/unsubscribe.
    if (event === "room:join" && payload?.room) { this.subscribeChannel(String(payload.room), false); return; }
    if (event === "room:leave" && payload?.room) { this.unsubscribeChannel(String(payload.room)); return; }
    // Everything else is a client→server action → Laravel HTTP endpoint (Phase 4).
    emitBridge(event, payload, ack);
  }

  private dispatch(event: string, payload: any): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of Array.from(set)) {
      try { h(payload); } catch { /* one bad handler must not break the rest */ }
    }
  }

  private subscribeChannel(channel: string, priv: boolean): void {
    if (this.subs.has(channel)) return;
    const opts = priv ? { getToken: () => realtimeApi.subscribe(channel) } : undefined;
    const sub = this.cf.getSubscription(channel) ?? this.cf.newSubscription(channel, opts);
    sub.on("publication", (ctx: { data?: { event?: string; payload?: any } }) => {
      const d = ctx?.data;
      if (d && typeof d.event === "string") this.dispatch(d.event, d.payload);
    });
    sub.subscribe();
    this.subs.set(channel, sub);
  }

  private unsubscribeChannel(channel: string): void {
    const sub = this.subs.get(channel);
    if (!sub) return;
    try { sub.unsubscribe(); this.cf.removeSubscription(sub); } catch { /* ignore */ }
    this.subs.delete(channel);
  }
}

/**
 * Client→server actions bridge - Centrifugo is pub/sub-only, so these become
 * Laravel HTTP calls: DM delivery, presence lookup, and the full call lifecycle
 * (initiate resolves the socket-style ack with the server-assigned call_id).
 * Inert while the driver is "socketio".
 */
function emitBridge(event: string, payload: any, ack?: (res: any) => void): void {
  switch (event) {
    case "dm:delivered":
      if (payload?.message_ids?.length) void realtimeApi.markDelivered(payload.message_ids).catch(() => {});
      return;
    case "dm:typing":
      if (payload?.to_user_id) void realtimeApi.typing(payload.to_user_id).catch(() => {});
      return;
    case "presence:get":
      void realtimeApi.presence(payload?.user_ids ?? [])
        .then((online) => ack?.({ online }))
        .catch(() => ack?.({ online: [] }));
      return;
    case "call:initiate":
      void realtimeApi.initiateCall(payload.to_user_id, payload.type)
        .then((res) => ack?.({ ok: true, call_id: res.call_id }))
        .catch(() => ack?.({ ok: false }));
      return;
    case "call:accept": void realtimeApi.acceptCall(payload.call_id).catch(() => {}); return;
    case "call:reject": void realtimeApi.rejectCall(payload.call_id).catch(() => {}); return;
    case "call:end": void realtimeApi.endCall(payload.call_id).catch(() => {}); return;
    case "call:webrtc":
      void realtimeApi.signalCall(payload.call_id, payload.to_user_id, payload.type, payload.payload).catch(() => {});
      return;
    default:
      if (__DEV__) console.warn(`[centrifugo] unhandled client action '${event}'.`);
  }
}
