"use client";

import { create } from "zustand";
import { videoService } from "@/services/video.service";
import type { ReelsooVideo } from "@/types/video";
import type { VideoUser } from "@/types/video";

type FeedMode = "home" | "following";

type FeedState = {
  videos:        ReelsooVideo[];
  activeIndex:   number;
  page:          number;
  hasMore:       boolean;
  initialized:   boolean;
  loading:       boolean;
  loadingMore:   boolean;
  error:         string | null;
  mode:          FeedMode;

  /** Hydrate (or re-hydrate when mode changes). Safe to call on every render;
   *  it's a no-op when already initialised for the same mode. */
  initialize:    (mode?: FeedMode, perPage?: number) => Promise<void>;
  /** Fetch and append the next page, deduped by id. */
  fetchMore:     (perPage?: number) => Promise<void>;
  /** Set the currently-playing video position. */
  setActiveIndex:(i: number) => void;
  /** Patch a single video's fields in the store so that scrolling away and
   *  back does not reset like/save state to the original feed values. */
  updateVideo:   (id: number, patch: Partial<ReelsooVideo>) => void;
  /** Patch `user` fields on every video in the feed that belongs to the given
   *  username. Used to sync follow state across all of a creator's videos. */
  updateUserInVideos: (username: string, patch: Partial<VideoUser>) => void;
  /** Drop a single video from the list (e.g. user said "not interested").
   *  Keeps the active index pointing at the same position so the next video
   *  slides in naturally. */
  removeById:    (id: number) => void;
  /** Forget everything and force a fresh fetch + new random start. */
  reset:         () => void;
};

function pickRandomIndex(n: number): number {
  if (n <= 0) return 0;
  return Math.floor(Math.random() * n);
}

export const useFeedStore = create<FeedState>((set, get) => ({
  videos:      [],
  activeIndex: 0,
  page:        0,
  hasMore:     true,
  initialized: false,
  loading:     false,
  loadingMore: false,
  error:       null,
  mode:        "home",

  async initialize(mode: FeedMode = "home", perPage = 8) {
    const state = get();
    if (state.loading) return;
    /* Already initialised for this exact mode - skip */
    if (state.initialized && state.mode === mode) return;

    /* Mode changed or first boot - reset then fetch */
    set({
      loading:     true,
      error:       null,
      mode,
      videos:      [],
      page:        0,
      activeIndex: 0,
      initialized: false,
      hasMore:     true,
    });

    try {
      const res = mode === "following"
        ? await videoService.following(1)
        : await videoService.forYouFeed({ page: 1, perPage });

      let videos     = res.data ?? [];
      const lastPage = res.meta?.last_page ?? 1;

      // If user just uploaded, pin their new post at position 0.
      const pinKey   = "reelsoo_latest_upload_id";
      const pinnedId = typeof window !== "undefined"
        ? Number(window.localStorage.getItem(pinKey) ?? "0")
        : 0;

      if (pinnedId > 0 && mode === "home") {
        try {
          const pinned = await videoService.getById(pinnedId);
          // Dedupe: remove if already in feed, then prepend
          videos = [pinned, ...videos.filter((v) => v.id !== pinnedId)];
          window.localStorage.removeItem(pinKey);
        } catch {
          // Pinned video fetch failed - silently ignore and show normal feed
          window.localStorage.removeItem(pinKey);
        }
      }

      set({
        videos,
        page:        1,
        hasMore:     lastPage > 1,
        activeIndex: pinnedId > 0 && mode === "home" ? 0 : pickRandomIndex(videos.length),
        initialized: true,
        loading:     false,
      });
    } catch (e) {
      set({
        loading:     false,
        initialized: true,
        error:       e instanceof Error ? e.message : "Failed to load feed",
      });
    }
  },

  async fetchMore(perPage = 8) {
    const { hasMore, loadingMore, loading, videos, page, mode } = get();
    if (!hasMore || loadingMore || loading) return;
    set({ loadingMore: true });
    try {
      const res = mode === "following"
        ? await videoService.following(page + 1)
        : await videoService.forYouFeed({
            page:       page + 1,
            perPage,
            excludeIds: videos.map((v) => v.id),
          });

      const incoming = res.data ?? [];
      /* Dedup defensively - backend's exclude_ids should already filter */
      const existingIds = new Set(videos.map((v) => v.id));
      const fresh = incoming.filter((v) => !existingIds.has(v.id));
      const lastPage = res.meta?.last_page ?? page + 1;
      set({
        videos:      [...videos, ...fresh],
        page:        page + 1,
        hasMore:     page + 1 < lastPage && fresh.length > 0,
        loadingMore: false,
      });
    } catch (e) {
      set({
        loadingMore: false,
        error: e instanceof Error ? e.message : "Failed to load more",
      });
    }
  },

  setActiveIndex(i) {
    const { videos } = get();
    const clamped = Math.max(0, Math.min(i, Math.max(0, videos.length - 1)));
    set({ activeIndex: clamped });
  },

  updateVideo(id, patch) {
    const { videos } = get();
    const updated = videos.map((v) => v.id === id ? { ...v, ...patch } : v);
    set({ videos: updated });
  },

  updateUserInVideos(username, patch) {
    const { videos } = get();
    const updated = videos.map((v) =>
      v.user?.username === username
        ? { ...v, user: { ...v.user!, ...patch } }
        : v
    );
    set({ videos: updated });
  },

  removeById(id) {
    const { videos, activeIndex } = get();
    const idx = videos.findIndex((v) => v.id === id);
    if (idx === -1) return;
    const next = videos.filter((v) => v.id !== id);
    let nextIndex = activeIndex;
    if (idx < activeIndex)        nextIndex = activeIndex - 1;
    else if (idx === activeIndex) nextIndex = Math.min(activeIndex, next.length - 1);
    set({ videos: next, activeIndex: Math.max(0, nextIndex) });
  },

  reset() {
    set({
      videos:      [],
      activeIndex: 0,
      page:        0,
      hasMore:     true,
      initialized: false,
      loading:     false,
      loadingMore: false,
      error:       null,
      mode:        "home",
    });
  },
}));
