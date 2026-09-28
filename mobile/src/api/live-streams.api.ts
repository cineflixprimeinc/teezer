import { api } from "./client";

/**
 * Live video streams - one broadcaster, many subscribe-only viewers. A
 * separate domain from Spaces (audio rooms where anyone can be promoted to
 * speak) - see server/database/migrations/2026_08_03_000002_create_live_stream_tables.php.
 * Backend is Laravel-only; this domain hasn't been touched by the Go
 * migration, so these calls go straight to `server/routes/api.php`'s
 * `live-streams` group like everything else not yet ported.
 *
 * Browsing, watching and presence (join/leave) are public - a guest is
 * counted once via a hashed IP+UA key server-side. Posting a chat line
 * needs an account; the server returns why rather than the route 403ing
 * blindly (slow mode, followers-only chat, chat off, timeout, etc. - see
 * LiveStream::chatBlockedReason, surfaced here as `controls.chat_blocked_reason`).
 */

export type LiveStreamHost = {
  id: number;
  name: string | null;
  username: string;
  avatar: string | null;
  verified: boolean;
};

export type LiveStreamStatus = "draft" | "scheduled" | "live" | "ended" | "banned";

export type LiveStreamCard = {
  id: number;
  title: string;
  category: string | null;
  status: LiveStreamStatus;
  thumbnail_url: string | null;
  viewers: number;
  likes: number;
  /** ISO8601, or null for a stream that hasn't gone live yet. */
  started_at: string | null;
  is_featured: boolean;
  host: LiveStreamHost | null;
};

export type LiveStreamCategoryChip = { category: string; streams: number; viewers: number };

export type LiveStreamsQuery = {
  q?: string;
  category?: string;
  sort?: "viewers" | "newest";
  per_page?: number;
};

export type LiveStreamsIndexResponse = {
  data: LiveStreamCard[];
  meta: { current_page: number; last_page: number; total: number };
  /** Only categories actually on air right now - a chip can never lead to an empty shelf. */
  categories: LiveStreamCategoryChip[];
};

export type LiveStreamDetail = LiveStreamCard & {
  description: string | null;
  playback_url: string | null;
  room_name: string | null;
  scheduled_for: string | null;
  ended_at: string | null;
  replay_url: string | null;
  peak_viewers: number;
  total_views: number;
  gift_coins: number;
};

export type LiveStreamControls = {
  chat_enabled: boolean;
  gifts_enabled: boolean;
  followers_only_chat: boolean;
  slow_mode_seconds: number;
  can_moderate: boolean;
  /** Why *I* can't post right now (slow mode, followers-only, timeout, …), or null if I can. */
  chat_blocked_reason: string | null;
};

export type LiveStreamShowResponse = { stream: LiveStreamDetail; controls: LiveStreamControls };

/** Subscribe-only LiveKit grant - this token cannot publish. */
export type LiveStreamWatch = { url: string; room: string; token: string };

export type LiveStreamJoinResponse = { viewers: number; watch: LiveStreamWatch };

export type LiveStreamMessage = {
  id: number;
  body: string;
  /** Set when this line is a gift announcement, not a typed message. */
  gift_coins: number | null;
  is_pinned: boolean;
  is_host: boolean;
  created_at: string;
  user: LiveStreamHost | null;
};

export const liveStreamsApi = {
  index: async (params?: LiveStreamsQuery): Promise<LiveStreamsIndexResponse> => {
    const r = (await api.get("/live-streams", { params })).data;
    return { data: r.data ?? [], meta: r.meta, categories: r.categories ?? [] };
  },

  show: async (id: number): Promise<LiveStreamShowResponse> =>
    (await api.get(`/live-streams/${id}`)).data.data,

  /** Presence + a fresh viewer (subscribe-only) LiveKit token. Guest-accessible. */
  join: async (id: number): Promise<LiveStreamJoinResponse> =>
    (await api.post(`/live-streams/${id}/join`)).data,

  leave: async (id: number): Promise<void> => {
    await api.post(`/live-streams/${id}/leave`);
  },

  /** Polling-shaped, matching Spaces' own chat (`?after=<id>`) - see the
   *  project's realtime notes: the backend has no Centrifugo push for this
   *  domain yet, so this is the real transport, not a fallback. */
  messages: async (id: number, after?: number): Promise<LiveStreamMessage[]> =>
    (await api.get(`/live-streams/${id}/messages`, { params: after ? { after } : undefined }))
      .data.data ?? [],

  postMessage: async (id: number, body: string): Promise<LiveStreamMessage> =>
    (await api.post(`/live-streams/${id}/messages`, { body })).data.data,
};
