import { useCallback, useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";
import {
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import {
  COMMIT_FRACTION as LAYER_COMMIT_FRACTION,
  COMMIT_VELOCITY as LAYER_COMMIT_VELOCITY,
  PARALLAX,
  layerProgress,
  paintLayer,
  useCreatorLayer,
} from "@/store/creator-layer.store";
/**
 * The feed's single horizontal gesture, ported from the ReelSoo design
 * prototype (`beginDrag`/`moveDrag`/`endDrag` plus `paintTab`/`settleTab`).
 *
 * It is deliberately ONE handler with several modes rather than competing
 * handlers, because the prototype decides between them from the same touch:
 *
 *   swipe right, tab to spare -> previous tab
 *   swipe left, tab to spare  -> next tab
 *   swipe left, on the last   -> open that reel's creator profile
 *
 * Two nested handlers would have to race for that decision on every touch, and
 * whichever won would do so by threshold rather than by intent.
 *
 * The committed tab transition is a hand-off, not a scroll: one pane slides out,
 * swaps its contents while it is invisible, and slides back in. A real pager
 * would have to mount every tab as its own feed, and every mounted feed holds
 * video players - this costs exactly one feed no matter how many tabs exist.
 *
 *   out (240ms) -> swap at 170ms -> jump to 45% on the far side -> home
 */

/** Tab-mode numbers, all the prototype's own. */
const INVALID_DAMP = 0.3;
const OPACITY_FLOOR = 0.45;
const OPACITY_SPAN = 0.7;
const COMMIT_FRACTION = 0.2;
/** px/s. The design compares px/ms (0.4); gesture-handler reports per second. */
const COMMIT_VELOCITY = 400;
const SETTLE_MS = 240;
const FADE_MS = 180;
const SWAP_MS = 170;
/** Backstop: if the swap timer is ever dropped the pane still comes home
 *  instead of sitting off-screen. The prototype carries the same guard. */
const SAFETY_MS = 700;
const ENTER_FRACTION = 0.45;

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

type Grab =
  | { mode: "tab"; dir: 1 | -1; target: number; valid: boolean }
  | { mode: "profile" };

export function useFeedSwipe<T extends string>({
  tabs,
  current,
  width,
  onChange,
  creatorForCurrentReel,
}: {
  tabs: readonly T[];
  current: T;
  width: number;
  /** Runs mid-transition, with the pane hidden. Swap data and reset scroll here. */
  onChange: (next: T) => void;
  /** Handle of the reel currently snapped in view, or null if there isn't one.
   *  Null makes a left-swipe off the last tab rubber-band instead of opening an
   *  empty profile. */
  creatorForCurrentReel: () => string | null;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  /** Set once per gesture when the pan activates; null means "not ours". */
  const grab = useRef<Grab | null>(null);
  /** A tab transition owns the pane - a new drag must not fight it. */
  const busy = useRef(false);
  const swapT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyT = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Latest values for callbacks that must not be rebuilt every render.
  const tabsRef = useRef(tabs);
  const currentRef = useRef(current);
  const widthRef = useRef(width);
  const changeRef = useRef(onChange);
  const creatorRef = useRef(creatorForCurrentReel);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => { creatorRef.current = creatorForCurrentReel; }, [creatorForCurrentReel]);

  const clearTimers = useCallback(() => {
    if (swapT.current) clearTimeout(swapT.current);
    if (safetyT.current) clearTimeout(safetyT.current);
    swapT.current = null;
    safetyT.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

  /** Ease the pane back to rest, whichever side it is on. */
  const rest = useCallback(() => {
    Animated.parallel([
      Animated.timing(translateX, {
        toValue: 0,
        duration: SETTLE_MS,
        easing: EASE,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: FADE_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ]).start();
    busy.current = false;
  }, [translateX, opacity]);

  const commitTab = useCallback(
    (dir: 1 | -1, target: number) => {
      const w = widthRef.current;
      busy.current = true;

      Animated.parallel([
        Animated.timing(translateX, {
          toValue: dir * w,
          duration: SETTLE_MS,
          easing: EASE,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: FADE_MS,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]).start();

      clearTimers();
      safetyT.current = setTimeout(rest, SAFETY_MS);
      swapT.current = setTimeout(() => {
        changeRef.current(tabsRef.current[target]);
        // Park the incoming tab partway out on the opposite side, invisible,
        // then let it ease home next frame. Two rAFs, not one: the first only
        // guarantees the setValue flushed, the second that the new content has
        // been laid out under it.
        translateX.setValue(-dir * w * ENTER_FRACTION);
        opacity.setValue(0);
        requestAnimationFrame(() => requestAnimationFrame(rest));
      }, SWAP_MS);
    },
    [translateX, opacity, rest, clearTimers],
  );

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      const g = grab.current;
      if (!g) return;
      const w = widthRef.current;
      const dx = e.nativeEvent.translationX;

      if (g.mode === "profile") {
        // The layer starts parked off the right edge, so the finger's leftward
        // travel is what pulls it in. paintLayer clamps and drives the feed's
        // parallax off the same value.
        paintLayer(w + dx, w);
        return;
      }

      // An unreachable tab still moves, but heavily damped and without the
      // fade - that resistance is the only thing telling you it is the end.
      translateX.setValue(dx * (g.valid ? 1 : INVALID_DAMP));
      opacity.setValue(
        g.valid ? Math.max(OPACITY_FLOOR, 1 - (Math.abs(dx) / w) * OPACITY_SPAN) : 1,
      );
    },
    [translateX, opacity],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = e.nativeEvent;

      if (state === State.ACTIVE) {
        // Mid-transition the pane is not the user's to drag.
        if (busy.current) {
          grab.current = null;
          return;
        }

        const list = tabsRef.current;
        const i = list.indexOf(currentRef.current);
        const dir: 1 | -1 = translationX > 0 ? 1 : -1;
        const target = i - dir;
        const valid = target >= 0 && target < list.length;

        // The prototype's arbitration: a left-swipe with no tab left to reach
        // is the creator gesture, everything else is a tab move.
        if (dir === -1 && target >= list.length) {
          const handle = creatorRef.current();
          if (handle) {
            useCreatorLayer.getState().begin(handle);
            grab.current = { mode: "profile" };
            return;
          }
          // No creator to show - fall through and let it rubber-band.
        }

        grab.current = { mode: "tab", dir, target, valid };
        return;
      }

      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const g = grab.current;
        grab.current = null;
        if (!g) return;

        const w = widthRef.current;

        if (g.mode === "profile") {
          // Pulled far enough in, or flicked in hard enough, and it stays.
          const far = -translationX > w * LAYER_COMMIT_FRACTION;
          const fast = velocityX < -LAYER_COMMIT_VELOCITY;
          useCreatorLayer.getState().settle(far || fast);
          return;
        }

        const far = Math.abs(translationX) > w * COMMIT_FRACTION;
        const fast = Math.abs(velocityX) > COMMIT_VELOCITY;
        if (g.valid && (far || fast)) commitTab(g.dir, g.target);
        else rest();
      }
    },
    [commitTab, rest],
  );

  // Two translateX entries compose, so the tab swipe and the creator-layer
  // parallax can move the pane at the same time without either owning the
  // other's value.
  const paneStyle = useMemo(
    () => ({
      flex: 1,
      opacity,
      transform: [
        { translateX },
        {
          translateX: layerProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -PARALLAX * width],
          }),
        },
      ],
    }),
    [opacity, translateX, width],
  );

  return { paneStyle, onGestureEvent, onHandlerStateChange };
}
