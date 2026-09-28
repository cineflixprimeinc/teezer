import { useCallback, useEffect, useRef } from "react";
import { haptics } from "@/services/haptics";
import { Animated, Platform } from "react-native";
import {
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";

/**
 * Drag-to-dismiss for a bottom sheet, matching TikTok's feel.
 *
 * Built on react-native-gesture-handler rather than PanResponder. Two reasons,
 * both of which the PanResponder version got wrong:
 *   - A RN <Modal> renders in its own native view hierarchy, where the JS
 *     responder system is unreliable. gesture-handler resolves natively.
 *   - PanResponder cannot hand a live touch from the list to the sheet.
 *     gesture-handler's `simultaneousHandlers` lets both see the same gesture,
 *     so dragging down from an at-top list flows straight into a dismissal
 *     without lifting a finger - which is what TikTok does.
 *
 * Settling is a spring seeded with the release velocity, not a fixed-duration
 * timing curve. A timing curve throws the velocity away, so a flick and a slow
 * drag land identically; that is the single biggest reason a sheet feels
 * mechanical.
 */

/** Fraction of the sheet you must pass for a slow drag to dismiss. */
export const DISMISS_FRACTION = 0.32;
/** px/s. gesture-handler reports velocity per second, not per millisecond. */
export const DISMISS_VELOCITY = 900;
/** Resistance ceiling when dragging above the top edge. */
export const RUBBER_CAP = 24;

export type SheetDrag = ReturnType<typeof useSheetDrag>;

export function useSheetDrag({
  sheetHeight,
  onDismiss,
  enabled = true,
}: {
  sheetHeight: number;
  onDismiss: () => void;
  /** False while the composer has focus, so typing can't dismiss the sheet. */
  enabled?: boolean;
}) {
  const translateY = useRef(new Animated.Value(0)).current;

  const scrollTop = useRef(0);
  const enabledRef = useRef(enabled);
  const heightRef = useRef(sheetHeight);
  const dismissRef = useRef(onDismiss);
  /** Set once per gesture: whether this drag owns the sheet or the list does. */
  const owns = useRef(false);
  const crossed = useRef(false);
  /** Latched for the whole dismissal. Guards every gesture entry point. */
  const closing = useRef(false);
  /** Current offset, tracked here so close() never reads Animated's private _value. */
  const offset = useRef(0);
  /** Where the sheet sat when this gesture took ownership. A drag is relative
   *  to its own start, so without this the sheet snaps to the finger's
   *  translation instead of continuing from where it already was - which is
   *  what made grabbing a still-settling sheet jump, then resist. */
  const startOffset = useRef(0);

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);
  useEffect(() => { heightRef.current = sheetHeight; }, [sheetHeight]);
  useEffect(() => { dismissRef.current = onDismiss; }, [onDismiss]);

  const onListScroll = useCallback((y: number) => {
    scrollTop.current = y;
  }, []);

  const buzz = useCallback(() => {
    if (Platform.OS === "web") return;
    haptics.light();
  }, []);

  /** Spring home. Carries the release velocity so a flick stays lively. */
  const springBack = useCallback(
    (velocity = 0) => {
      offset.current = 0;
      Animated.spring(translateY, {
        toValue: 0,
        velocity,
        damping: 30,
        stiffness: 320,
        mass: 0.9,
        overshootClamping: true,
        useNativeDriver: false,
      }).start();
    },
    [translateY],
  );

  /**
   * Dismiss now, then fling out.
   *
   * Every OTHER way this sheet closes (the ✕ button, a scrim tap) calls
   * dismiss synchronously and immediately - the Modal's `visible` prop is
   * wired straight to the parent's `open` state with no internal render/
   * visible split (unlike components/BottomSheet.tsx's own `render` vs
   * `visible`), so there was never really a grace period for an exit
   * animation to finish in anyway: the native Modal disappears the instant
   * the parent re-renders with `open=false`, regardless of what this hook
   * does. The drag path used to be the ONE exception - it gated the same
   * dismiss call behind this Animated.timing's own `.start(callback)`,
   * which is not a reliable enough signal to hang the whole close on: this
   * file's own history is a chain of fixes for one interruption vector
   * after another (a new touch's stopAnimation(), etc.) where the callback
   * silently never fired and the sheet was left frozen wherever the
   * animation happened to stop, `closing` latched true forever, blocking
   * all further gesture input by design. Calling dismiss first removes the
   * dependency on the callback entirely, matching every other close path
   * in this file; the animation below is now purely a best-effort visual
   * flourish for whatever briefly renders before the Modal actually goes.
   */
  const close = useCallback(
    (velocity = 0) => {
      if (closing.current) return;
      closing.current = true;

      dismissRef.current();

      const remaining = Math.max(0, heightRef.current - offset.current);
      const ms = velocity > 0 ? Math.max(120, Math.min(260, (remaining / velocity) * 1000)) : 220;

      Animated.timing(translateY, {
        toValue: heightRef.current,
        duration: ms,
        useNativeDriver: false,
      }).start();
    },
    [translateY],
  );

  /**
   * Entry reset. The slide-in itself is the Modal's native animation, which
   * runs off the JS thread - the old JS-driven entry spring stuttered because
   * the comments query renders at the same moment the sheet is animating.
   */
  const open = useCallback(() => {
    closing.current = false;
    owns.current = false;
    offset.current = 0;
    translateY.setValue(0);
  }, [translateY]);

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      if (!enabledRef.current || closing.current) return;
      const { translationY } = e.nativeEvent;

      // Decide once, at the start of the gesture, who owns it. Taking the
      // sheet only when the list is already at the top is what stops the drag
      // from fighting the list mid-scroll.
      if (!owns.current) {
        if (translationY > 0 && scrollTop.current <= 0) {
          owns.current = true;
          // Continue from wherever the sheet actually is, not from 0. Note
          // this deliberately does NOT set React state: nothing renders off a
          // "dragging" flag, and a re-render on the first move of every drag
          // is a full reconcile of the comment list landing on the one frame
          // the finger is waiting on - the stall you feel on a slow drag.
          startOffset.current = offset.current;
        } else {
          return;
        }
      }

      let y = startOffset.current + translationY;
      if (y < 0) y = -Math.min(Math.pow(-y, 0.55), RUBBER_CAP);
      offset.current = y;
      translateY.setValue(y);

      const past = y > heightRef.current * DISMISS_FRACTION;
      if (past && !crossed.current) {
        crossed.current = true;
        buzz();
      } else if (!past) {
        crossed.current = false;
      }
    },
    [translateY, buzz],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationY, velocityY } = e.nativeEvent;

      // A dismissal in flight owns the sheet - a stray touch must not stop it.
      if (closing.current) return;

      if (state === State.BEGAN) {
        owns.current = false;
        crossed.current = false;
        // The callback form reports where the animation actually stopped.
        // Without it `offset` kept the value springBack optimistically wrote
        // at the START of its animation, so grabbing a still-settling sheet
        // resumed from the wrong place.
        translateY.stopAnimation((v: number) => {
          offset.current = v;
        });
        return;
      }

      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const wasOwner = owns.current;
        owns.current = false;
        crossed.current = false;

        if (!wasOwner) {
          /*
           * This is what left the sheet stranded mid-screen.
           *
           * State.BEGAN calls stopAnimation() on every gesture, including ones
           * that never take the sheet - a tap, a horizontal swipe, a downward
           * drag while the list is scrolled away from the top. If that BEGAN
           * interrupted a springBack() that was still travelling home, the
           * sheet freezes exactly where the spring had got to, and the old
           * `return` here meant nothing ever restarted it: the drag had ended,
           * the spring was dead, and no further event was coming.
           *
           * Settling a sheet that is off its rest position costs nothing when
           * it is already home (offset 0 is the overwhelmingly common case and
           * skips outright), and is the only thing that can rescue it when it
           * is not.
           */
          if (offset.current !== 0) springBack(0);
          return;
        }

        // Measured from the sheet's real position, not this gesture's own
        // translation - re-grabbing a half-dragged sheet and nudging it down
        // should still dismiss.
        const far = offset.current > heightRef.current * DISMISS_FRACTION;
        const fast = velocityY > DISMISS_VELOCITY;
        if (far || fast) close(velocityY);
        else springBack(velocityY);
      }
    },
    [translateY, close, springBack],
  );

  /** Full opacity at rest, fading as the sheet is thrown away. */
  const scrimOpacity = translateY.interpolate({
    inputRange: [0, Math.max(1, sheetHeight)],
    outputRange: [1, 0],
    extrapolate: "clamp",
  });

  return {
    translateY,
    scrimOpacity,
    onGestureEvent,
    onHandlerStateChange,
    onListScroll,
    open,
    close,
  };
}
