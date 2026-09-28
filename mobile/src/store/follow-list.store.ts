import { Animated, Easing } from "react-native";
import { create } from "zustand";

import { useCreatorLayer } from "./creator-layer.store";

/**
 * The follow list: followers / following / suggested, opened from a profile's
 * counts.
 *
 * A LAYER rather than a route, for the same reason as the post viewer. The
 * swiped-in creator profile is itself a layer mounted after </Stack.Navigator>,
 * so it paints above every screen in the stack; a list pushed as a route would
 * open UNDERNEATH it. The old code worked around that by dismissing the profile
 * first - which is exactly why Back from the followers list landed you on the
 * feed instead of the profile you opened it from. Rendering the list as a layer
 * ABOVE the profile layer lets the profile stay mounted, scrolled and
 * stationary, simply covered, so leaving the list uncovers it with nothing to
 * re-render and nothing to flash.
 *
 * Position lives in a module-level Animated.Value for the same reason
 * creator-layer's and post-viewer's do: it is read by the layer while being
 * written by a gesture, and anything rebuilt per-render would tear.
 */

/** 1 = fully covering the profile, 0 = parked off the right edge. */
export const followListProgress = new Animated.Value(0);

/** Matches the other two layers, so every dismissal in the chain feels alike. */
export const FOLLOW_LIST_SETTLE_MS = 300;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Same commit thresholds as the profile's and viewer's swipe-to-dismiss. */
export const FOLLOW_LIST_COMMIT_FRACTION = 0.28;
export const FOLLOW_LIST_COMMIT_VELOCITY = 500;

/** Paint at a raw pixel offset: 0 = fully covering, `width` = fully dismissed. */
export function paintFollowList(x: number, width: number) {
  if (width <= 0) return;
  const clamped = Math.max(0, Math.min(width, x));
  followListProgress.setValue(1 - clamped / width);
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

export type FollowListTab = "followers" | "following" | "suggested";

export interface FollowListTarget {
  username: string;
  /** Which tab it opens on. The list itself can move between all three. */
  type: FollowListTab;
}

interface FollowListState {
  /** Null whenever the layer is not in the tree. */
  target: FollowListTarget | null;
  mounted: boolean;
  /**
   * How deep the creator stack was when this list opened.
   *
   * Opening someone FROM the list pushes them onto that stack, and the new
   * profile has to paint ABOVE this layer rather than under it. Comparing the
   * live depth against this is what tells the two layers apart: at `baseDepth`
   * the list is on top, past it a profile is. Popping back to `baseDepth` hands
   * the list its position, gestures and back button back.
   */
  baseDepth: number;
  /** Open covering immediately: the counts that led here are already on screen,
   *  so an entry animation would only show the profile sliding under a list
   *  that has nothing in it yet. */
  show: (target: FollowListTarget) => void;
  /** Animate away and unmount. */
  hide: () => void;
  /** Settle after a drag: commit dismisses, otherwise slide back to covering. */
  settle: (dismiss: boolean) => void;
}

export const useFollowList = create<FollowListState>((set) => ({
  target: null,
  mounted: false,
  baseDepth: 0,

  show: (target) => {
    clearCloseTimer();
    followListProgress.setValue(1);
    set({ target, mounted: true, baseDepth: useCreatorLayer.getState().stack.length });
  },

  hide: () => useFollowList.getState().settle(true),

  settle: (dismiss) => {
    clearCloseTimer();
    Animated.timing(followListProgress, {
      toValue: dismiss ? 0 : 1,
      duration: FOLLOW_LIST_SETTLE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start();

    if (!dismiss) return;

    // Unmount on a timer, not the animation callback - an interrupted animation
    // never reports `finished`, the same trap called out in creator-layer,
    // post-viewer and useSheetDrag.
    closeTimer = setTimeout(() => {
      closeTimer = null;
      followListProgress.setValue(0);
      set({ target: null, mounted: false, baseDepth: 0 });
    }, FOLLOW_LIST_SETTLE_MS);
  },
}));
