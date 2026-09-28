import { create } from "zustand";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Locally-marked spam conversations. The backend messaging model has no spam
 * status (only approved / pending / rejected / blocked), and rejected/blocked
 * conversations disappear from the requests feed - so to keep a viewable Spam
 * tab, we partition the pending requests locally by conversation id and persist
 * the set on-device. Marking spam keeps the request pending server-side; it
 * just moves it out of Pending into Spam here.
 */
const KEY = "reelsoo:spam-conversations";

interface SpamState {
  ids: Set<number>;
  hydrate: () => Promise<void>;
  mark: (id: number) => void;
  unmark: (id: number) => void;
}

async function persist(ids: Set<number>) {
  try { await AsyncStorage.setItem(KEY, JSON.stringify([...ids])); } catch { /* best-effort */ }
}

export const useSpamStore = create<SpamState>((set, get) => ({
  ids: new Set(),
  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) set({ ids: new Set<number>(JSON.parse(raw)) });
    } catch { /* corrupted cache - start empty */ }
  },
  mark: (id) => { const n = new Set(get().ids); n.add(id); set({ ids: n }); void persist(n); },
  unmark: (id) => { const n = new Set(get().ids); n.delete(id); set({ ids: n }); void persist(n); },
}));
