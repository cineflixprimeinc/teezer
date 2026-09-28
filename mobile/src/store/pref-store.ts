import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Factory for account-synced preference stores. Each App-Preferences group
 * (Appearance, Messages, Digital Wellbeing, AI Features) is one instance - same
 * flow as a11y.store / prefs.store, extracted so the four groups don't repeat it:
 *   boot   → hydrate() reads the AsyncStorage snapshot (instant, offline-safe)
 *   signin → sync() fetches the server copy and reconciles
 *   save   → update() applies optimistically, PATCHes, rolls back on failure
 *
 * The reconcile merges over the CURRENT prefs (not defaults) so keys an older
 * backend doesn't return keep their local value.
 */

export interface PrefStore<T> {
  prefs: T;
  loaded: boolean;
  hydrate: () => Promise<void>;
  sync: () => Promise<void>;
  update: (patch: Partial<T>) => Promise<void>;
}

export function createPrefStore<T extends object>(opts: {
  cacheKey: string;
  defaults: T;
  fetch: () => Promise<T>;
  patch: (p: Partial<T>) => Promise<T>;
}) {
  const { cacheKey, defaults, fetch, patch } = opts;

  const writeSnapshot = async (prefs: T) => {
    try { await AsyncStorage.setItem(cacheKey, JSON.stringify(prefs)); } catch { /* best-effort */ }
  };

  return create<PrefStore<T>>((set, get) => ({
    prefs: defaults,
    loaded: false,

    hydrate: async () => {
      try {
        const raw = await AsyncStorage.getItem(cacheKey);
        if (raw) set({ prefs: { ...defaults, ...JSON.parse(raw) }, loaded: true });
      } catch { /* corrupted cache - fall through to server sync */ }
    },

    sync: async () => {
      try {
        const server = await fetch();
        const prefs = { ...get().prefs, ...server };
        set({ prefs, loaded: true });
        void writeSnapshot(prefs);
      } catch { /* offline / guest - keep hydrated or default values */ }
    },

    update: async (p) => {
      const prev = get().prefs;
      const next = { ...prev, ...p };
      set({ prefs: next });
      void writeSnapshot(next);
      try {
        const server = await patch(p);
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
}
