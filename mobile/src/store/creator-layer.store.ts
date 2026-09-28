import { Animated, Easing } from "react-native";
import { create } from "zustand";

/**
 * The creator layer: a profile that slides in over the feed when you swipe left
 * on a reel, TikTok-style, and slides back out when you swipe right on it.
 *
 * Position lives in ONE module-level Animated.Value rather than in the store,
 * because two separate trees read it - the layer itself (mounted above the tab
 * navigator) and the feed pane (inside the Home tab, drifting for parallax).
 * Anything reconstructed per-render would let those two disagree by a frame,
 * which reads as the profile tearing away from the feed behind it.
 *
 * It is normalised 0..1 instead of pixels so neither consumer has to know the
 * other's width; each interpolates against its own.
 */

/** 0 = parked off the right edge, 1 = fully open. */
export const layerProgress = new Animated.Value(0);

/**
 * Position of the TOP profile when profiles are stacked - opening a suggested
 * account from a profile, say. 1 = fully covering the one beneath, 0 = parked
 * off the right edge.
 *
 * One value serves any depth because only ever one entry moves: the top. Every
 * profile below it sits still, mounted and untouched, which is the whole point
 * of stacking rather than swapping - going back reveals the previous profile
 * exactly as it was left, open panels, scroll offset and all.
 */
export const pushProgress = new Animated.Value(1);

/** The design's own settle: `transform .3s cubic-bezier(.22,1,.36,1)`. */
export const SETTLE_MS = 300;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** Feed drifts left by this share of the layer's travel, for depth. */
export const PARALLAX = 0.22;
/** Commit past 28% of the screen... */
export const COMMIT_FRACTION = 0.28;
/** ...or on a flick. The design measures px/ms (0.5); gesture-handler reports
 *  px/s, the same unit trap called out in useSheetDrag. */
export const COMMIT_VELOCITY = 500;

/**
 * Paint the layer at a raw pixel offset, where 0 is fully open and `width` is
 * fully closed. Shared by both drag directions - opening from the feed starts
 * at `width`, closing from the profile starts at 0 - so the two can never drift
 * out of step. This is the prototype's single `paint()`.
 */
export function paintLayer(x: number, width: number) {
  if (width <= 0) return;
  const clamped = Math.max(0, Math.min(width, x));
  layerProgress.setValue(1 - clamped / width);
}

/** The same paint, for the stacked profile on top. 0 = covering, `width` = gone. */
export function paintPush(x: number, width: number) {
  if (width <= 0) return;
  // A drag is the other way the top card's position becomes progress-driven, so
  // it has to arm the flag the same way `push` does - otherwise dragging the
  // second pop of a session would move nothing. Guarded so this only writes
  // once per gesture rather than on every frame of it.
  if (!useCreatorLayer.getState().pushing) useCreatorLayer.setState({ pushing: true });
  const clamped = Math.max(0, Math.min(width, x));
  pushProgress.setValue(1 - clamped / width);
}

/** Timer that unmounts the layer after a dismissal. Module-level so a second
 *  dismissal cannot leave the first one's timer running. */
let closeTimer: ReturnType<typeof setTimeout> | null = null;

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

/** Same idea for the pop: the entry is dropped when its slide-out is over. */
let popTimer: ReturnType<typeof setTimeout> | null = null;

function clearPopTimer() {
  if (popTimer) {
    clearTimeout(popTimer);
    popTimer = null;
  }
}

interface CreatorLayerState {
  /**
   * The profiles in the layer, bottom to top. Empty when it is not in the tree.
   *
   * Everything in here stays MOUNTED, covered by whatever is above it. That is
   * what makes back a real back: the profile you return to is the same
   * component instance you left, so its scroll position and any panel it had
   * open are simply still there, with nothing to restore and nothing to
   * re-fetch.
   */
  stack: string[];
  /** The profile actually on screen - the top of the stack. */
  handle: string | null;
  /**
   * Whether the layer is mounted. Set the instant a drag starts and held
   * through the whole close animation - unmounting on release is exactly what
   * makes a dismissal pop, and leaving it mounted at rest would swallow every
   * touch meant for the feed underneath.
   */
  mounted: boolean;
  /** Begin a drag-in for `handle`. Idempotent within one gesture. */
  begin: (handle: string) => void;
  /** Animate to open or closed. Closing also unmounts, once. */
  settle: (open: boolean) => void;
  /** Close the whole layer, however deep the stack. */
  dismiss: () => void;
  /**
   * Open another profile ON TOP of the current one, keeping it mounted below.
   *
   * `animate: false` is for pushing while something else covers the layer - the
   * follow list, where the new profile has to be already in place by the time
   * the list slides off it. Animating there would run a slide behind a sheet
   * that is itself sliding, which reads as two things moving at once.
   */
  push: (handle: string, animate?: boolean) => void;
  /** Back: uncover the profile beneath, or close the layer at the root. */
  back: () => void;
  /** Settle the stacked profile after a drag: pop it, or slide it back over. */
  settlePush: (pop: boolean) => void;
  /**
   * Whether the top card's position is currently driven by `pushProgress`.
   *
   * False means "sitting at rest, covering" and the card is drawn with NO
   * transform. That distinction is what stops a pop from flashing: the shared
   * progress value has to be re-armed for the next push, and doing that while
   * the card that just left was still mounted snapped it back to covering for
   * one frame. Clearing this in the same `set()` as the stack shrink means the
   * leaving card is unmounted and the newly exposed one is at rest in a single
   * commit, with no frame in between that reads a stale progress value.
   */
  pushing: boolean;
  /** The post viewer is covering this layer. It stays mounted and in place -
   *  this only makes it inert underneath. */
  suspended: boolean;
  suspend: () => void;
  /** A stack route is covering this layer - see `coverForRoute`. */
  routeCovered: boolean;
  coverForRoute: () => void;
  dropCovered: () => void;
  resume: () => void;
}

export const useCreatorLayer = create<CreatorLayerState>((set, get) => ({
  stack: [],
  handle: null,
  mounted: false,
  pushing: false,

  begin: (handle) => {
    clearCloseTimer();
    clearPopTimer();
    // Clear `suspended` even on the early return: re-swiping to the profile
    // that is currently suspended behind the viewer must not reopen it
    // invisible.
    if (get().mounted && get().handle === handle) {
      set({ suspended: false });
      return;
    }
    layerProgress.setValue(0);
    // A fresh swipe starts a fresh stack - whatever was piled up last time is
    // not something Back should walk through on the way out.
    pushProgress.setValue(1);
    set({ stack: [handle], handle, mounted: true, suspended: false, pushing: false });
  },

  push: (handle, animate = true) => {
    clearCloseTimer();
    clearPopTimer();
    const stack = [...get().stack, handle];
    pushProgress.setValue(animate ? 0 : 1);
    set({ stack, handle, suspended: false, pushing: true });
    if (!animate) return;
    Animated.timing(pushProgress, {
      toValue: 1,
      duration: SETTLE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start();
  },

  back: () => {
    // At the root there is nothing beneath to uncover, so back means leave.
    if (get().stack.length <= 1) {
      get().settle(false);
      return;
    }
    get().settlePush(true);
  },

  settlePush: (pop) => {
    clearPopTimer();
    Animated.timing(pushProgress, {
      toValue: pop ? 0 : 1,
      duration: SETTLE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start();

    if (!pop) return;

    // Dropped on a timer rather than the animation callback, for the same
    // reason as every other teardown here: an interrupted animation never
    // reports `finished`.
    popTimer = setTimeout(() => {
      popTimer = null;
      const stack = get().stack.slice(0, -1);
      // Shrink the stack and hand the newly exposed profile back to its resting
      // position in ONE commit. `pushProgress` is deliberately NOT re-armed
      // here: doing so snapped the card that just left back to covering for the
      // frame before it unmounted, which is the flicker you see coming back
      // from a profile opened out of the follow list. `push` re-arms the value
      // itself, so nothing downstream needs it reset now.
      set({ stack, handle: stack[stack.length - 1] ?? null, pushing: false });
    }, SETTLE_MS);
  },

  settle: (open) => {
    clearCloseTimer();
    Animated.timing(layerProgress, {
      toValue: open ? 1 : 0,
      duration: SETTLE_MS,
      easing: EASE,
      useNativeDriver: true,
    }).start();

    if (open) return;

    // Unmount on a timer rather than the animation's completion callback. An
    // interrupted animation never reports `finished`, and the same gating is
    // what used to strand the comments sheet mid-screen (see useSheetDrag).
    // A timer fires regardless of what happened to the animation.
    closeTimer = setTimeout(() => {
      closeTimer = null;
      clearPopTimer();
      layerProgress.setValue(0);
      pushProgress.setValue(1);
      // A layer that is torn down while suspended must not leave the flag set
      // for whatever opens next.
      set({
        stack: [],
        handle: null,
        mounted: false,
        suspended: false,
        routeCovered: false,
        pushing: false,
      });
    }, SETTLE_MS);
  },

  dismiss: () => get().settle(false),

  suspended: false,

  /**
   * Go inert while the post viewer covers this layer.
   *
   * Deliberately does NOT move the layer. Earlier versions hid it (opacity) or
   * parked it off-screen, because the viewer was a stack route and this layer
   * paints above the whole navigator, so it had to get out of the way. The
   * viewer is now a layer mounted ABOVE this one, so it simply covers it: the
   * profile keeps its position, scroll offset, tab and state, and there is
   * nothing to animate back and nothing that can flicker when the viewer goes.
   *
   * All this flag now does is stop the profile's swipe-to-dismiss competing
   * with the viewer's, and stop touches reaching a profile the user cannot see.
   */
  suspend: () => set({ suspended: true }),

  resume: () => set({ suspended: false }),

  routeCovered: false,

  /**
   * A stack ROUTE - not a layer - is about to cover this.
   *
   * Chat is the one thing reached from a swiped-in profile that is a real route,
   * and routes mount UNDER this layer (it is rendered after </Stack.Navigator>).
   * Opening one therefore used to `dismiss()` first, which animated the profile
   * off to the right, showed the feed, and only then slid Chat in - the "screen
   * goes back and then opens the chat" that reads as a flicker. It also meant
   * Back from Chat landed on the feed, because the profile had been torn down.
   *
   * Going transparent instead keeps it mounted with its scroll offset, tab and
   * state intact: the route below simply shows through, and uncovering puts the
   * profile back exactly as it was left. `suspended` rides along so the parked
   * layer cannot take touches or compete with a gesture underneath.
   */
  coverForRoute: () => set({ routeCovered: true, suspended: true }),

  /**
   * Hand the profile over to the pushed route and let this layer go.
   *
   * By the time a cover is lifted there is a real UserProfile route sitting
   * under the chat, so the layer has nothing left to draw - keeping it would
   * mean two copies of the same profile, one of them stale. Torn down with no
   * animation: the route is already covering it, and `settle` would slide a
   * hidden layer around for 300ms and unmount it on a timer.
   *
   * Idempotent, so every path that can end a cover can just call it.
   */
  dropCovered: () => {
    if (!get().routeCovered) return;
    clearCloseTimer();
    clearPopTimer();
    layerProgress.setValue(0);
    pushProgress.setValue(1);
    set({
      stack: [],
      handle: null,
      mounted: false,
      suspended: false,
      routeCovered: false,
      pushing: false,
    });
  },
}));
