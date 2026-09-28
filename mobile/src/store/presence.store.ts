import { create } from "zustand";

/**
 * Live online presence, keyed by user id. Seeded by a presence:get on the
 * shared chat-server socket and kept fresh by presence:update events
 * (see CallProvider). UI reads this with a fallback to the REST is_online.
 */
interface PresenceState {
  online: Record<number, boolean>;
  setOnline: (id: number, value: boolean) => void;
  setBulk: (updates: Record<number, boolean>) => void;
}

export const usePresenceStore = create<PresenceState>((set) => ({
  online: {},
  setOnline: (id, value) => set((s) => ({ online: { ...s.online, [id]: value } })),
  setBulk: (updates) => set((s) => ({ online: { ...s.online, ...updates } })),
}));
