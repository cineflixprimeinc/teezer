import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { AccessibilityPreferences, prefsApi } from "@/api/prefs.api";

/**
 * Accessibility preferences store - mirrors prefs.store's flow for the
 * /profile/accessibility payload (the same 12 fields the website's
 * Accessibility Settings page manages):
 *   boot   → hydrate() reads the AsyncStorage snapshot
 *   signin → sync() fetches the server copy and reconciles
 *   save   → update() applies optimistically, PATCHes, rolls back on failure
 *
 * Runtime consumers: FeedVideoItem honours reduce_motion (skips decorative
 * animations) and autoplay_videos (tap-to-play feed).
 */

const CACHE_KEY = "reelsoo:a11y-prefs";

/** Mirrors ProfileController::accessibilityDefaults. */
export const A11Y_DEFAULTS: AccessibilityPreferences = {
  larger_text: false,
  text_size: "medium",
  high_contrast: false,
  reduce_transparency: false,
  reduce_motion: false,
  autoplay_videos: true,
  pointer_size: "default",
  captions_always_on: false,
  caption_style: "default",
  audio_descriptions: false,
  keyboard_navigation: true,
  screen_reader: false,
};

async function writeSnapshot(prefs: AccessibilityPreferences) {
  try { await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(prefs)); } catch { /* best-effort */ }
}

interface A11yState {
  prefs: AccessibilityPreferences;
  loaded: boolean;
  hydrate: () => Promise<void>;
  sync: () => Promise<void>;
  update: (patch: Partial<AccessibilityPreferences>) => Promise<void>;
}

export const useA11yStore = create<A11yState>((set, get) => ({
  prefs: A11Y_DEFAULTS,
  loaded: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) set({ prefs: { ...A11Y_DEFAULTS, ...JSON.parse(raw) }, loaded: true });
    } catch { /* corrupted cache - fall through to server sync */ }
  },

  sync: async () => {
    try {
      const server = await prefsApi.accessibility();
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
      const server = await prefsApi.updateAccessibility(patch);
      const prefs = { ...get().prefs, ...server };
      set({ prefs });
      void writeSnapshot(prefs);
    } catch (e) {
      set({ prefs: prev });
      void writeSnapshot(prev);
      throw e;
    }
  },
}));
