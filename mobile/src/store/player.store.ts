import { create } from "zustand";
import type { Video } from "@/types";

/**
 * Hands a playlist (the videos already loaded on a profile tab) + the tapped
 * index to the full-screen VideoPlayer, so it can open instantly without refetch.
 */
interface PlayerState {
  videos: Video[];
  index: number;
  /** Set when opened from a "commented on your video" / "mentioned you"
   *  notification - VideoPlayerScreen consumes this once on mount to
   *  auto-open the comments sheet scrolled to (and highlighting) this exact
   *  comment, instead of just landing on the video with comments closed. */
  pendingCommentId: number | null;
  setPlaylist: (videos: Video[], index: number, pendingCommentId?: number | null) => void;
  /** Reads pendingCommentId and clears it, so it never leaks into a later,
   *  unrelated video-player open. */
  consumePendingCommentId: () => number | null;
}

export const usePlayerStore = create<PlayerState>((set, get) => ({
  videos: [],
  index: 0,
  pendingCommentId: null,
  setPlaylist: (videos, index, pendingCommentId = null) => set({ videos, index, pendingCommentId }),
  consumePendingCommentId: () => {
    const id = get().pendingCommentId;
    if (id != null) set({ pendingCommentId: null });
    return id;
  },
}));
