import { Centrifuge, type Subscription } from "centrifuge";
import { api } from "@/services/api";

type Handler = (...args: any[]) => void;

const CENTRIFUGO_URL =
  process.env.NEXT_PUBLIC_CENTRIFUGO_URL || "wss://realtime.teezer.live/connection/websocket";

const realtimeApi = {
  token: () => api.get("/realtime/token").then((r) => r.data.data.token as string),
  subscribe: (channel: string) =>
    api.post("/realtime/subscribe", { channel }).then((r) => r.data.data.token as string),
};

/**
 * The realtime socket surface the web call + notification code uses. The
 * Centrifugo adapter implements this so the call sites stay transport-agnostic.
 */
export interface RealtimeSocket {
  connected: boolean;
  on(event: string, cb: Handler): void;
  off(event: string, cb?: Handler): void;
  emit(event: string, payload?: any, ack?: (res: any) => void): void;
  disconnect(): void;
}

/**
 * Centrifugo adapter (browser) - mirrors the mobile adapter. RECEIVE path is
 * complete: subscribes to the per-user private channel `user:<id>` app-wide,
 * plus per-video PUBLIC channels on `room:join` (the feed joins the currently
 * playing video's room - see feed-page.tsx), and routes each `{event,
 * payload}` publication to the matching `.on(event)` handlers (`notification:
 * new`, `call:*`, `video.liked`, `comment.created`, …). Client ACTIONS
 * (`call:initiate/accept/reject/end/webrtc`) are request/response or relays
 * that Centrifugo (pub/sub-only) can't serve - they route to Laravel HTTP
 * endpoints (`emitBridge`).
 */
export class CentrifugoWebSocket implements RealtimeSocket {
  connected = false;

  private cf: Centrifuge;
  private handlers = new Map<string, Set<Handler>>();
  private subs = new Map<string, Subscription>();

  constructor(userId: number) {
    this.cf = new Centrifuge(CENTRIFUGO_URL, { getToken: () => realtimeApi.token() });
    this.cf.on("connected", () => { this.connected = true; });
    this.cf.on("connecting", () => { this.connected = false; });
    this.cf.on("disconnected", () => { this.connected = false; });
    if (userId > 0) this.subscribeChannel(`user:${userId}`, true);
    this.cf.connect();
  }

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

  emit(event: string, payload?: any, ack?: (res: any) => void): void {
    // Public per-video engagement channels: room:join/leave → subscribe/unsubscribe.
    if (event === "room:join" && payload?.room) { this.subscribeChannel(String(payload.room), false); return; }
    if (event === "room:leave" && payload?.room) { this.unsubscribeChannel(String(payload.room)); return; }
    // Everything else is a client→server action.
    emitBridge(event, payload, ack);
  }

  private dispatch(event: string, payload: any): void {
    const set = this.handlers.get(event);
    if (!set) return;
    for (const h of Array.from(set)) { try { h(payload); } catch { /* isolate handler errors */ } }
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

const callApi = {
  initiate: (toUserId: number, type: "audio" | "video") =>
    api.post("/calls", { to_user_id: toUserId, type }).then((r) => r.data.data as { call_id: string }),
  accept: (id: string) => api.post(`/calls/${id}/accept`),
  reject: (id: string) => api.post(`/calls/${id}/reject`),
  end: (id: string) => api.post(`/calls/${id}/end`),
  signal: (id: string, toUserId: number, type: string, payload: any) =>
    api.post(`/calls/${id}/signal`, { to_user_id: toUserId, type, payload }),
};

/** Client→server actions → Laravel HTTP (Centrifugo is pub/sub-only). Web only
 *  emits call:* today (DMs are REST-polled; there's no web presence). */
function emitBridge(event: string, payload: any, ack?: (res: any) => void): void {
  switch (event) {
    case "call:initiate":
      callApi.initiate(payload.to_user_id, payload.type)
        .then((res) => ack?.({ ok: true, call_id: res.call_id }))
        .catch(() => ack?.({ ok: false }));
      return;
    case "call:accept": void callApi.accept(payload.call_id).catch(() => {}); return;
    case "call:reject": void callApi.reject(payload.call_id).catch(() => {}); return;
    case "call:end": void callApi.end(payload.call_id).catch(() => {}); return;
    case "call:webrtc":
      void callApi.signal(payload.call_id, payload.to_user_id, payload.type, payload.payload).catch(() => {});
      return;
    default:
      if (process.env.NODE_ENV !== "production") {
        // eslint-disable-next-line no-console
        console.warn(`[centrifugo] unhandled client action '${event}'.`);
      }
  }
}
