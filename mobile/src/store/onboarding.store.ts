import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * First-run "seen" flags for one-shot welcome popups (Spaces, Studio, Settings,
 * …), keyed by a short id. Stored locally so each popup shows once per device
 * and never again after it's dismissed.
 *
 * Local-only for now: it needs no backend and works offline. (The account-synced
 * variant would live on the user row - see content_preferences - but that needs
 * the Go backend deployed with a field per popup; this keeps them all working
 * today without a deploy.)
 */

const CACHE_KEY = "reelsoo:onboarding-seen";

interface OnboardingState {
  seen: Record<string, boolean>;
  /** True once the snapshot has been read - gate popups on this to avoid a flash. */
  hydrated: boolean;
  hydrate: () => Promise<void>;
  markSeen: (key: string) => void;
}

export const useOnboardingStore = create<OnboardingState>((set, get) => ({
  seen: {},
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(CACHE_KEY);
      set({ seen: raw ? JSON.parse(raw) : {}, hydrated: true });
    } catch {
      set({ hydrated: true }); // corrupted cache - treat everything as unseen
    }
  },

  markSeen: (key) => {
    if (get().seen[key]) return;
    const seen = { ...get().seen, [key]: true };
    set({ seen });
    void AsyncStorage.setItem(CACHE_KEY, JSON.stringify(seen)).catch(() => {});
  },
}));

/**
 * Drives a one-shot welcome popup. Opens once, after hydration, if the key has
 * never been marked seen; `dismiss` closes it and records it so it won't return.
 *
 *   const wp = useOnboarding("studio.dashboard");
 *   <WelcomePopup visible={wp.open} onClose={wp.dismiss} ... />
 *
 * Pass `enabled: false` (e.g. while unauthenticated) to hold it back until the
 * screen is ready to show it.
 */
export function useOnboarding(key: string, enabled = true) {
  const hydrated = useOnboardingStore((s) => s.hydrated);
  const seen = useOnboardingStore((s) => !!s.seen[key]);
  const markSeen = useOnboardingStore((s) => s.markSeen);
  const [open, setOpen] = useState(false);
  const handled = useRef(false);

  useEffect(() => {
    if (enabled && hydrated && !seen && !handled.current) {
      handled.current = true;
      setOpen(true);
    }
  }, [enabled, hydrated, seen]);

  const dismiss = () => {
    setOpen(false);
    markSeen(key);
  };

  return { open, dismiss };
}
