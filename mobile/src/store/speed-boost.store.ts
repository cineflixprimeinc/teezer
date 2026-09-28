import { create } from "zustand";

/**
 * Hold-to-2x, and the pull-down that locks it.
 *
 * A store rather than props because the three parties are nowhere near each
 * other in the tree: the gesture is owned by FeedVideoItem, the hint replaces
 * the TAB BAR - which the navigator renders above every screen, so nothing
 * inside the feed can draw over it - and the pager that must stop scrolling is
 * HomeScreen's FlatList. Threading a callback through all three would mean
 * giving MainTabs a prop it has no other reason to carry.
 *
 * Two flags, deliberately separate:
 *   hinting - a finger is down and the boost is running. The tab bar shows
 *             "Pull down to lock", and the pager is frozen so a downward drag
 *             reaches the bar instead of scrolling to the previous post.
 *   locked  - the pull-down landed. 2x survives the release and stays until the
 *             next tap anywhere on the video.
 *
 * `locked` outlives the gesture, so it is the one that must be cleared on
 * leaving the feed - see clear().
 */
type SpeedBoostState = {
  hinting: boolean;
  locked: boolean;
  setHinting: (v: boolean) => void;
  setLocked: (v: boolean) => void;
  /** Both off. For unmount and tab-switch, where a stuck flag would leave the
   *  tab bar showing a hint for a gesture that ended long ago. */
  clear: () => void;
};

export const useSpeedBoost = create<SpeedBoostState>((set) => ({
  hinting: false,
  locked: false,
  setHinting: (v) => set({ hinting: v }),
  setLocked: (v) => set({ locked: v }),
  clear: () => set({ hinting: false, locked: false }),
}));
