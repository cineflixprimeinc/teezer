import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ContentPreferences, prefsApi } from "@/api/prefs.api";

/**
 * Player preferences store - single source of truth for playback behaviour
 * (auto-scroll, loop, speed, quality, theme) consumed by FeedVideoItem and
 * the More-Options sheet.
 *
 * Data flow:
 *   boot   → hydrate() reads the AsyncStorage snapshot (instant, offline-safe)
 *   signin → sync() fetches the server copy and reconciles
 *   toggle → update() applies optimistically, PATCHes in the background, and
 *            rolls back (state + snapshot) if the request fails.
 */

const CACHE_KEY = "reelsoo:player-prefs";

/** Mirrors ProfileController::contentPrefDefaults - used before first sync. */
export const PREFS_DEFAULTS: ContentPreferences = {
  preferred_language: "en",
  preferred_country: "US",
  show_local_first: true,
  show_trending: true,
  sensitive_content_filter: true,
  autoplay_videos: true,
  data_saver_mode: false,
  has_seen_spaces_onboarding: false,
  auto_scroll: false,
  loop_video: true,
  playback_speed: 1,
  default_quality: "auto",
  theme: "light",
};

async function writeSnapshot(prefs: ContentPreferences) {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(prefs)); } catch { /* best-effort */ }
}

interface PrefsState {
  prefs: ContentPreferences;
  /** True once real values (cache or server) are in - gate skeletons on this. */
  loaded: boolean;
  hydrate: () => Promise<void>;
  sync: () => Promise<void>;
  /** Optimistic update with automatic rollback; rejects when the PATCH fails. */
  update: (patch: Partial<ContentPreferences>) => Promise<void>;
  /**
   * Apply on this device only - state + snapshot, no PATCH.
   *
   * For guests. Their write would 401 and update() would roll it straight
   * back, which reads as a control that refuses to move; the playback sheet on
   * the feed is reachable signed out, so it takes this path instead.
   */
  setLocal: (patch: Partial<ContentPreferences>) => void;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  prefs: PREFS_DEFAULTS,
  loaded: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) set({ prefs: { ...PREFS_DEFAULTS, ...JSON.parse(raw) }, loaded: true });
    } catch { /* corrupted cache - fall through to server sync */ }
  },

  sync: async () => {
    try {
      const server = await prefsApi.content();
      // Merge over CURRENT values, not defaults: keys the server doesn't know
      // yet (backend not updated / older API) must keep their local value -
      // otherwise e.g. playback_speed silently resets to 1 on every sync.
      const prefs = { ...get().prefs, ...server };
      set({ prefs, loaded: true });
      void writeSnapshot(prefs);
    } catch { /* offline / guest - keep hydrated or default values */ }
  },

  update: async (patch) => {
    const prev = get().prefs;
    const next = { ...prev, ...patch };
    set({ prefs: next });
    void writeSnapshot(next);
    try {
      const server = await prefsApi.updateContent(patch);
      // Same rule as sync(): unknown-to-server keys keep the optimistic value.
      const prefs = { ...get().prefs, ...server };
      set({ prefs });
      void writeSnapshot(prefs);
    } catch (e) {
      set({ prefs: prev }); // rollback - the UI reverts to the pre-toggle state
      void writeSnapshot(prev);
      throw e;
    }
  },

  setLocal: (patch) => {
    const next = { ...get().prefs, ...patch };
    set({ prefs: next });
    void writeSnapshot(next);
  },
}));
