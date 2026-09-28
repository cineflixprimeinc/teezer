import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Saved replies - the canned answers behind the "Saved replies" rail on the
 * Studio Comments page, offered again as chips above the box in a comment
 * thread (the only place a reply is actually typed).
 *
 * There is no /studio/comments/saved-replies endpoint yet, so these persist
 * locally (an AsyncStorage snapshot) rather than syncing - the same shape
 * studio-settings.store uses. Swap `save`/`remove` for API calls when the
 * endpoint lands; nothing outside this file knows where they are stored.
 */

const CACHE_KEY = "teezer:saved-replies";

export interface SavedReply {
  id: string;
  /** The chip's text - short, so a row of them stays readable. */
  label: string;
  /** What gets inserted into the reply box. */
  body: string;
}

/** First-run starters, so the rail is useful before you have written any. */
const STARTERS: SavedReply[] = [
  { id: "starter-thanks", label: "Thank you!", body: "Thank you so much! 🙏" },
  { id: "starter-appreciate", label: "Appreciate it", body: "Really appreciate you watching!" },
  { id: "starter-soon", label: "Coming soon", body: "More on this coming soon - stay tuned! 👀" },
  { id: "starter-bio", label: "Check my bio", body: "It's all linked in my bio!" },
];

/** The chip shows one short line; the body can be as long as the creator likes. */
function labelFor(body: string): string {
  const line = body.trim().split("\n")[0].trim();
  return line.length > 26 ? `${line.slice(0, 25).trimEnd()}…` : line;
}

interface SavedRepliesState {
  replies: SavedReply[];
  loaded: boolean;
  hydrate: () => Promise<void>;
  /** Add when `id` is omitted, otherwise overwrite that one in place. */
  save: (body: string, id?: string) => void;
  remove: (id: string) => void;
}

export const useSavedRepliesStore = create<SavedRepliesState>((set, get) => {
  const persist = (replies: SavedReply[]) => {
    set({ replies });
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(replies)).catch(() => { /* best-effort */ });
  };

  return {
    replies: STARTERS,
    loaded: false,

    hydrate: async () => {
      if (get().loaded) return;
      try {
        const raw = await AsyncStorage.getItem(CACHE_KEY);
        const parsed = raw ? JSON.parse(raw) : null;
        // An empty array is a real state - the creator deleted every starter -
        // so only fall back to the starters when nothing was ever written.
        set({ replies: Array.isArray(parsed) ? parsed : STARTERS, loaded: true });
      } catch {
        set({ loaded: true }); // corrupted cache → keep the starters
      }
    },

    save: (body, id) => {
      const text = body.trim();
      if (!text) return;
      const current = get().replies;
      if (id) {
        persist(current.map((r) => (r.id === id ? { ...r, label: labelFor(text), body: text } : r)));
        return;
      }
      persist([...current, { id: `r${Date.now()}`, label: labelFor(text), body: text }]);
    },

    remove: (id) => persist(get().replies.filter((r) => r.id !== id)),
  };
});
