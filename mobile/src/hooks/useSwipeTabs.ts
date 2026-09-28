import { useCallback, useEffect, useRef } from "react";
import { Animated, Easing } from "react-native";
import {
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";

/**
 * Horizontal swipe between tabs, with the Teezer design's own physics.
 *
 * A single pane that slides out, swaps its contents while invisible, and slides
 * back in - not a multi-pane pager. Same reasoning as the feed's version: a
 * pager has to mount every tab at once, and here that would mean three live
 * queries and three lists where one will do.
 *
 *   out (240ms) -> swap at 170ms -> enter from 45% on the far side -> home
 *
 * This is the generic half of useFeedSwipe. The feed keeps its own copy because
 * its escape carries feed-specific setup (which creator to open); `escape` here
 * is the same idea with the decision left to the caller.
 */

const INVALID_DAMP = 0.3;
const OPACITY_FLOOR = 0.45;
const OPACITY_SPAN = 0.7;
const COMMIT_FRACTION = 0.2;
/** px/s. The design compares px/ms (0.4); gesture-handler reports per second. */
const COMMIT_VELOCITY = 400;
const SETTLE_MS = 240;
const FADE_MS = 180;
const SWAP_MS = 170;
/** Backstop, so a dropped swap timer cannot leave the pane off-screen. */
const SAFETY_MS = 700;
const ENTER_FRACTION = 0.45;

const EASE = Easing.bezier(0.22, 1, 0.36, 1);

type Grab =
  | { mode: "tab"; dir: 1 | -1; target: number; valid: boolean }
  | { mode: "escape" };

/**
 * Where a swipe goes when there is no tab left to reach in that direction.
 *
 * The alternative - a second PanGestureHandler wrapped around this one - is
 * what useFeedSwipe's header warns against: two handlers would have to race for
 * the same touch on every gesture, and whichever won would win by threshold
 * rather than by intent. One handler with two modes decides once, at
 * activation, from the tab it is actually on.
 */
export type SwipeEscape = {
  /** Which direction this claims. 1 = finger travelling right. */
  dir: 1 | -1;
  /**
   * Claim the gesture, or return false to leave it to the tabs.
   *
   * `startX` is where the finger went down in screen px, and `hasTab` whether
   * there is a tab to reach this way - together they let the caller take both
   * "past the end of the tabs" and "started at the screen edge", which is the
   * platform's own back gesture and does not collide with a tab swipe because
   * a tab swipe starts mid-screen.
   */
  begin: (startX: number, hasTab: boolean) => boolean;
  /** Finger moved; `dx` is the raw translation, same sign as `dir`. */
  move: (dx: number) => void;
  end: (translationX: number, velocityX: number) => void;
};

export function useSwipeTabs<T extends string>({
  tabs,
  current,
  width,
  onChange,
  escape,
}: {
  tabs: readonly T[];
  current: T;
  width: number;
  /** Runs mid-transition, while the pane is hidden. */
  onChange: (next: T) => void;
  /** Optional: hand the gesture off at the end of the tab list. */
  escape?: SwipeEscape;
}) {
  const translateX = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;

  const grab = useRef<Grab | null>(null);
  const busy = useRef(false);
  const swapT = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyT = useRef<ReturnType<typeof setTimeout> | null>(null);

  const tabsRef = useRef(tabs);
  const currentRef = useRef(current);
  const widthRef = useRef(width);
  const changeRef = useRef(onChange);
  const escapeRef = useRef(escape);
  useEffect(() => { tabsRef.current = tabs; }, [tabs]);
  useEffect(() => { currentRef.current = current; }, [current]);
  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => { changeRef.current = onChange; }, [onChange]);
  useEffect(() => { escapeRef.current = escape; }, [escape]);

  const clearTimers = useCallback(() => {
    if (swapT.current) clearTimeout(swapT.current);
    if (safetyT.current) clearTimeout(safetyT.current);
    swapT.current = null;
    safetyT.current = null;
  }, []);

  useEffect(() => clearTimers, [clearTimers]);

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

  const commit = useCallback(
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
        translateX.setValue(-dir * w * ENTER_FRACTION);
        opacity.setValue(0);
        // Two rAFs: the first only guarantees the setValue flushed, the second
        // that the new content has been laid out under it.
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

      if (g.mode === "escape") {
        escapeRef.current?.move(dx);
        return;
      }

      // An unreachable tab still moves, but damped and without the fade - that
      // resistance is the only thing saying you are at the end.
      translateX.setValue(dx * (g.valid ? 1 : INVALID_DAMP));
      opacity.setValue(
        g.valid ? Math.max(OPACITY_FLOOR, 1 - (Math.abs(dx) / w) * OPACITY_SPAN) : 1,
      );
    },
    [translateX, opacity],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX, absoluteX } = e.nativeEvent;

      if (state === State.ACTIVE) {
        if (busy.current) {
          grab.current = null;
          return;
        }
        const list = tabsRef.current;
        const dir: 1 | -1 = translationX > 0 ? 1 : -1;
        const target = list.indexOf(currentRef.current) - dir;
        const valid = target >= 0 && target < list.length;

        // Decided once, here, rather than by two handlers racing per touch.
        // Activation reports where the finger is NOW, so the start is that
        // minus how far it has travelled.
        const esc = escapeRef.current;
        if (esc && dir === esc.dir && esc.begin(absoluteX - translationX, valid)) {
          grab.current = { mode: "escape" };
          return;
        }

        grab.current = { mode: "tab", dir, target, valid };
        return;
      }

      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const g = grab.current;
        grab.current = null;
        if (!g) return;

        if (g.mode === "escape") {
          escapeRef.current?.end(translationX, velocityX);
          return;
        }

        const far = Math.abs(translationX) > widthRef.current * COMMIT_FRACTION;
        const fast = Math.abs(velocityX) > COMMIT_VELOCITY;
        if (g.valid && (far || fast)) commit(g.dir, g.target);
        else rest();
      }
    },
    [commit, rest],
  );

  return {
    /** Spread onto the Animated.View wrapping the swappable pane. */
    paneStyle: { flex: 1, opacity, transform: [{ translateX }] },
    onGestureEvent,
    onHandlerStateChange,
  };
}
