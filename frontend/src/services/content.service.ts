import { api } from "./api";

export interface ContentPrefs {
  preferred_language:       string;
  preferred_country:        string;
  show_local_first:         boolean;
  show_trending:            boolean;
  sensitive_content_filter: boolean;
  autoplay_videos:          boolean;
  data_saver_mode:          boolean;
}

export const DEFAULT_CONTENT_PREFS: ContentPrefs = {
  preferred_language:       "en",
  preferred_country:        "US",
  show_local_first:         true,
  show_trending:            true,
  sensitive_content_filter: true,
  autoplay_videos:          true,
  data_saver_mode:          false,
};

/* ── Word blocklists (Keyword / Hashtag / Not-Interested filters) ─────────────
   Adding a word blocks OTHER users from using it in comments on your videos and
   in DMs to you (enforced server-side in CommentController / MessageController). */
export type HiddenWordType = "keyword" | "hashtag" | "not_interested";
export interface HiddenWord { id: number; word: string; }
export type HiddenWordsMap = Record<HiddenWordType, HiddenWord[]>;

export const hiddenWordsService = {
  async list(): Promise<HiddenWordsMap> {
    const { data } = await api.get("/profile/hidden-words");
    return data.data as HiddenWordsMap;
  },
  async add(type: HiddenWordType, word: string): Promise<HiddenWord> {
    const { data } = await api.post("/profile/hidden-words", { type, word });
    return { id: data.data.id, word: data.data.word };
  },
  async remove(id: number): Promise<void> {
    await api.delete(`/profile/hidden-words/${id}`);
  },
};

/* Recent searches are stored client-side by the search drawer (same key). */
const RECENT_SEARCHES_KEY = "teezer_recent_searches";
export const recentSearches = {
  list(): string[] {
    if (typeof window === "undefined") return [];
    try { return JSON.parse(localStorage.getItem(RECENT_SEARCHES_KEY) ?? "[]"); }
    catch { return []; }
  },
  remove(term: string): string[] {
    const next = recentSearches.list().filter((t) => t !== term);
    try { localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next)); } catch { /* private mode */ }
    return next;
  },
  clear(): void {
    try { localStorage.removeItem(RECENT_SEARCHES_KEY); } catch { /* private mode */ }
  },
};

export const contentService = {
  async get(): Promise<ContentPrefs> {
    const { data } = await api.get("/profile/content-preferences");
    return data.data;
  },

  async save(prefs: ContentPrefs): Promise<ContentPrefs> {
    const { data } = await api.patch("/profile/content-preferences", prefs);
    return data.data;
  },

  async resetFeed(): Promise<void> {
    await api.delete("/feed/reset-preferences");
  },

  async clearWatchHistory(): Promise<void> {
    await api.delete("/history");
  },
};
