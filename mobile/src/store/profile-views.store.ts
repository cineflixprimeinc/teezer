import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

/**
 * "New since you last looked" for profile views.
 *
 * The API has no seen/unseen flag - it reports who viewed you and when, and
 * nothing about what you have already read. The design needs both a dot on the
 * profile's eye button and a dot on individual rows, so the boundary is kept
 * here: the moment the views screen was last opened. Anything viewed after that
 * is new.
 *
 * On the device, not the account: it marks what THIS person has looked at, and
 * a second device legitimately has its own answer.
 */

const KEY = "teezer:profile-views-seen-at";

interface ProfileViewsState {
  /** ISO stamp of the last time the views screen was opened. Null = never. */
  lastSeenAt: string | null;
  hydrated: boolean;
  hydrate: () => Promise<void>;
  /** Called when the screen opens, AFTER it has read the old value. */
  markSeen: () => void;
}

export const useProfileViewsSeen = create<ProfileViewsState>((set) => ({
  lastSeenAt: null,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      set({ lastSeenAt: raw, hydrated: true });
    } catch {
      set({ hydrated: true });
    }
  },

  markSeen: () => {
    const now = new Date().toISOString();
    set({ lastSeenAt: now });
    void AsyncStorage.setItem(KEY, now).catch(() => {});
  },
}));

/** Whether a view at `viewedAt` happened after the last visit to the screen. */
export function isNewView(viewedAt: string | null | undefined, lastSeenAt: string | null): boolean {
  if (!viewedAt) return false;
  // Never opened: everything in the window is new, which is what the first
  // ever badge should say.
  if (!lastSeenAt) return true;
  const t = Date.parse(viewedAt);
  const seen = Date.parse(lastSeenAt);
  return Number.isFinite(t) && Number.isFinite(seen) && t > seen;
}
