import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Recently used and frequently used emoji, per install.
 *
 * Local only, and deliberately so: this is a keyboard preference, not content.
 * Syncing it would mean a network round trip on every emoji tap, which is the
 * one thing an emoji picker must never do.
 *
 * The two lists answer different questions and cannot be derived from one
 * another:
 *   recent    - what did I just use? Ordered by time, so the last tap is first.
 *   frequent  - what do I always use? Ordered by count, so a daily 😂 outranks
 *               the 🦑 tapped once this morning.
 * Keeping only "recent" makes the top row churn constantly; keeping only
 * "frequent" freezes it for weeks. Both is what every mature picker ships.
 *
 * Writes are debounced because they arrive in bursts - a user picking three
 * emoji in a row would otherwise cause three JSON serialisations of the whole
 * table on the JS thread while the picker is animating.
 */

const KEY = "reelsoo.emoji.usage.v1";
const MAX_RECENT = 40;
/** Cap the table so it cannot grow without bound on a heavy account. */
const MAX_TRACKED = 250;
const FLUSH_MS = 800;

type Usage = { count: number; lastUsed: number };

type EmojiState = {
  /** Most-recent-first. */
  recent: string[];
  /** emoji -> how often and how lately. */
  usage: Record<string, Usage>;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  track: (emoji: string) => void;
  /** Highest count first, ties broken by recency. */
  frequent: (limit?: number) => string[];
  clear: () => Promise<void>;
};

let flushTimer: ReturnType<typeof setTimeout> | null = null;

export const useEmojiStore = create<EmojiState>((set, get) => ({
  recent: [],
  usage: {},
  hydrated: false,

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { recent?: string[]; usage?: Record<string, Usage> };
        set({
          recent: Array.isArray(parsed.recent) ? parsed.recent.slice(0, MAX_RECENT) : [],
          usage: parsed.usage && typeof parsed.usage === "object" ? parsed.usage : {},
        });
      }
    } catch {
      // A corrupt blob is not worth failing the picker over - start clean.
    }
    set({ hydrated: true });
  },

  track: (emoji) => {
    if (!emoji) return;
    const { recent, usage } = get();

    const nextRecent = [emoji, ...recent.filter((e) => e !== emoji)].slice(0, MAX_RECENT);

    const prev = usage[emoji];
    const nextUsage: Record<string, Usage> = {
      ...usage,
      [emoji]: { count: (prev?.count ?? 0) + 1, lastUsed: Date.now() },
    };

    // Evict the least-used when the table is over cap, so a long-lived install
    // does not carry a thousand one-off picks forever.
    const keys = Object.keys(nextUsage);
    if (keys.length > MAX_TRACKED) {
      keys
        .sort((a, b) => {
          const ua = nextUsage[a];
          const ub = nextUsage[b];
          return ua.count - ub.count || ua.lastUsed - ub.lastUsed;
        })
        .slice(0, keys.length - MAX_TRACKED)
        // Never evict something still on the recent list - it is on screen.
        .filter((k) => !nextRecent.includes(k))
        .forEach((k) => delete nextUsage[k]);
    }

    set({ recent: nextRecent, usage: nextUsage });

    if (flushTimer) clearTimeout(flushTimer);
    flushTimer = setTimeout(() => {
      flushTimer = null;
      const s = get();
      AsyncStorage.setItem(KEY, JSON.stringify({ recent: s.recent, usage: s.usage })).catch(() => {
        /* best-effort: losing a usage tick is not worth surfacing */
      });
    }, FLUSH_MS);
  },

  frequent: (limit = 16) => {
    const { usage } = get();
    return Object.keys(usage)
      .sort((a, b) => usage[b].count - usage[a].count || usage[b].lastUsed - usage[a].lastUsed)
      .slice(0, limit);
  },

  clear: async () => {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    set({ recent: [], usage: {} });
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* best-effort */
    }
  },
}));
