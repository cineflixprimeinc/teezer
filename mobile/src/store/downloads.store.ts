import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Download preferences - device-local only (there is no server download service
 * yet), persisted to AsyncStorage so choices survive restarts. Consumed by the
 * Downloads settings page.
 */

export type DownloadQuality = "auto" | "480" | "720" | "1080";

export interface DownloadPrefs {
  wifi_only: boolean;
  quality: DownloadQuality;
  smart_downloads: boolean;
}

const DEFAULTS: DownloadPrefs = { wifi_only: true, quality: "720", smart_downloads: false };
const CACHE_KEY = "reelsoo:download-prefs";

interface DownloadsState {
  prefs: DownloadPrefs;
  hydrate: () => Promise<void>;
  set: (patch: Partial<DownloadPrefs>) => void;
}

export const useDownloadsStore = create<DownloadsState>((set, get) => ({
  prefs: DEFAULTS,
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      if (raw) set({ prefs: { ...DEFAULTS, ...JSON.parse(raw) } });
    } catch { /* corrupted cache - keep defaults */ }
  },
  set: (patch) => {
    const next = { ...get().prefs, ...patch };
    set({ prefs: next });
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(next)).catch(() => {});
  },
}));
