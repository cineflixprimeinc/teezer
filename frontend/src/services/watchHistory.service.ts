import { api } from "./api";

export type HistoryTab = "All" | "Videos" | "Live" | "Reels" | "Stories";

export interface HistoryItem {
  id:                number;   // video_views.id
  video_id:          number;
  title:             string;
  creator:           string;
  creator_username:  string;
  verified:          boolean;
  views_count:       number;
  duration_secs:     number;
  thumbnail_url:     string | null;
  watched_at:        string;   // ISO
  type:              HistoryTab;
}

export interface ContinueWatchingItem {
  video_id:      number;
  title:         string;
  thumbnail_url: string | null;
  creator_name:  string;
  progress:      number;   // 0-100
  remaining:     string;   // e.g. "4:20 remaining"
  resume_at:     number;   // seconds
}

export interface WatchSummary {
  total_watched_today:  string;   // e.g. "2h 45m"
  videos_watched_today: number;
  live_replays_watched: number;
  top_category:         string | null;
}

export interface WatchedCreator {
  id:           number;
  name:         string;
  username:     string;
  avatar:       string | null;
  is_verified:  boolean;
  is_following: boolean;
  watch_count:  number;
}

export interface HistorySettings {
  save_watch_history: boolean;
}

export const watchHistoryService = {
  list: async (page = 1, perPage = 20): Promise<{
    data: HistoryItem[];
    meta: { current_page: number; last_page: number; total: number };
  }> => {
    const res = await api.get("/history", { params: { page, per_page: perPage } });
    return { data: res.data.data ?? [], meta: res.data.meta };
  },

  summary: async (): Promise<WatchSummary> => {
    const res = await api.get("/history/summary");
    return res.data.data;
  },

  continueWatching: async (): Promise<ContinueWatchingItem[]> => {
    const res = await api.get("/history/continue-watching");
    return res.data.data ?? [];
  },

  creators: async (): Promise<WatchedCreator[]> => {
    const res = await api.get("/history/creators");
    return res.data.data ?? [];
  },

  getSettings: async (): Promise<HistorySettings> => {
    const res = await api.get("/history/settings");
    return res.data.data;
  },

  updateSettings: async (settings: Partial<HistorySettings>): Promise<void> => {
    await api.patch("/history/settings", settings);
  },

  clearAll: async (): Promise<void> => {
    await api.delete("/history");
  },

  removeVideo: async (videoId: number): Promise<void> => {
    await api.delete(`/history/video/${videoId}`);
  },
};
