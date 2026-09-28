import { create } from "zustand";

/**
 * The Space you are still in after leaving its screen.
 *
 * Minimising a room is not the same as leaving it: the audio connection stays
 * up and you stay in the listener count, you just want the rest of the app
 * back. That distinction is the whole reason this store exists - without it
 * the chevron in the room header can only mean "leave", and there is no way to
 * keep listening while you scroll the feed.
 *
 * Only the handful of fields the mini bar renders are kept. The room screen
 * refetches everything else from the server when it reopens, so duplicating
 * the full SpaceRoom here would just be a second copy going stale.
 */
export interface MinimisedSpace {
  id: string;
  title: string;
  listening: number;
  /** ISO timestamp the room went live, for the elapsed clock. */
  startedAt: string | null;
  /** Whether I hold a mic, so the bar can show the right control. */
  canSpeak: boolean;
  muted: boolean;
}

interface SpaceMiniState {
  space: MinimisedSpace | null;
  /** Minimise: keep the connection, show the bar. */
  minimise: (space: MinimisedSpace) => void;
  /** Reopened the room screen - hide the bar, connection unchanged. */
  restore: () => void;
  /** Actually left the room. Clears the bar. */
  clear: () => void;
  /** Keep the bar's numbers honest while the room screen is unmounted. */
  patch: (patch: Partial<MinimisedSpace>) => void;
}

export const useSpaceMiniStore = create<SpaceMiniState>((set) => ({
  space: null,
  minimise: (space) => set({ space }),
  restore: () => set({ space: null }),
  clear: () => set({ space: null }),
  patch: (patch) =>
    set((s) => (s.space ? { space: { ...s.space, ...patch } } : s)),
}));
