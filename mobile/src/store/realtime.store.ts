import { create } from "zustand";

/**
 * Live engagement counts pushed from the backend over the realtime bus
 * (video.liked / video.unliked / comment.created / comment.deleted /
 * video.saved / video.unsaved / video.shared), keyed by video id.
 *
 * These are AUTHORITATIVE server counts broadcast to everyone in a video's room,
 * so any device viewing the video reflects likes/comments/saves/shares instantly
 * without a refresh. UI reads a value here as an override on top of the value it
 * loaded from the REST API; absence (undefined) means "no live update yet, use
 * the server/optimistic value".
 */
interface LiveCounts {
  views_count?: number;
  likes_count?: number;
  comments_count?: number;
  saves_count?: number;
  shares_count?: number;
}

interface RealtimeState {
  counts: Record<number, LiveCounts>;
  setCount: (videoId: number, partial: LiveCounts) => void;
}

export const useRealtimeStore = create<RealtimeState>((set) => ({
  counts: {},
  setCount: (videoId, partial) =>
    set((s) => ({ counts: { ...s.counts, [videoId]: { ...s.counts[videoId], ...partial } } })),
}));
