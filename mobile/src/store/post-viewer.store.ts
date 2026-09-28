import { Animated, Easing } from "react-native";
import { create } from "zustand";
import type { ProfileGridTab } from "@/api/profile.api";

/**
 * The post viewer: a creator's reel opened full-screen from their profile grid.
 *
 * It is a LAYER, not a route, for one reason - the swiped-in creator profile is
 * itself a layer mounted after </Stack.Navigator>, so it paints above every
 * screen in the stack. A viewer pushed as a route could therefore never sit on
 * top of it, and every attempt to work around that meant moving the profile out
 * of the way: dismissing it (Back then landed on the feed), or parking it
 * off-screen (the feed showed through the moment the viewer left). Rendering
 * the viewer as a layer ABOVE the profile layer is what finally lets the
 * profile stay exactly where it is - visible, stationary, untouched - with the
 * viewer simply covering it.
 *
 * Position lives in a module-level Animated.Value for the same reason
 * creator-layer's does: it is read by the layer while being written by a
 * gesture, and anything rebuilt per-render would tear.
 */

/** 1 = fully covering the profile, 0 = parked off the right edge. */
export const viewerProgress = new Animated.Value(0);

/** Matches the creator layer's settle, so the two dismissals feel identical. */
export const VIEWER_SETTLE_MS = 300;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Same commit thresholds as the profile's swipe-to-dismiss. */
export const VIEWER_COMMIT_FRACTION = 0.28;
export const VIEWER_COMMIT_VELOCITY = 500;

/** Paint at a raw pixel offset: 0 = fully covering, `width` = fully dismissed. */
export function paintViewer(x: number, width: number) {
  if (width <= 0) return;
  const clamped = Math.max(0, Math.min(width, x));
  viewerProgress.setValue(1 - clamped / width);
}

let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

export interface PostViewerTarget {
  /** Whose grid this came from. Empty when opened by `videoId`, i.e. a deep
   *  link, where the creator is not known until the video is fetched. */
  username: string;
  index: number;
  tab: ProfileGridTab;
  /** Deep link: open this one reel rather than a position in someone's grid. */
  videoId?: number;
}

interface PostViewerState {
  /** Null whenever the viewer is not in the tree. */
  target: PostViewerTarget | null;
  mounted: boolean;
  /** Open on `target`, covering immediately - there is nothing to wait for, the
   *  grid's list is already cached and the poster is the tile's own thumbnail. */
  show: (target: PostViewerTarget) => void;
  /** Open a single reel by id - the shape a `/video/{id}` link arrives in. */
  showVideo: (videoId: number) => void;
  /** Animate away and unmount. */
  hide: () => void;
  /** Settle after a drag: commit dismisses, otherwise slide back to covering. */
  settle: (dismiss: boolean) => void;
}

export const usePostViewer = create<PostViewerState>((set) => ({
  target: null,
  mounted: false,

  show: (target) => {
    clearCloseTimer();
    // Covering on the first frame. An entry animation here would show the
    // profile sliding under a translucent video, which is not what opening a
    // post looks like.
    viewerProgress.setValue(1);
    set({ target, mounted: true });
  },

  showVideo: (videoId) =>
    usePostViewer.getState().show({ username: "", index: 0, tab: "Reels", videoId }),

  hide: () => usePostViewer.getState().settle(true),

  settle: (dismiss) => {
    clearCloseTimer();
    Animated.timing(viewerProgress, {
      toValue: dismiss ? 0 : 1,
      duration: VIEWER_SETTLE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start();

    if (!dismiss) return;

    // Unmount on a timer, not the animation callback - an interrupted
    // animation never reports `finished`, the same trap called out in
    // creator-layer and useSheetDrag.
    closeTimer = setTimeout(() => {
      closeTimer = null;
      viewerProgress.setValue(0);
      set({ target: null, mounted: false });
    }, VIEWER_SETTLE_MS);
  },
}));
