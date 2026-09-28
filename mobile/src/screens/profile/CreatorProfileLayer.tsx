import { useCallback, useEffect, useRef } from "react";
import { Animated, BackHandler, StyleSheet, useWindowDimensions } from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import {
  COMMIT_FRACTION,
  COMMIT_VELOCITY,
  layerProgress,
  paintLayer,
  paintPush,
  pushProgress,
  useCreatorLayer,
} from "@/store/creator-layer.store";
import { useFollowList } from "@/store/follow-list.store";
import { ProfileTabScreen } from "./ProfileTabScreen";

/**
 * The creator profile that swipes in over the feed.
 *
 * Mounted above the tab navigator (see RootNavigator) rather than inside the
 * Home tab, and that placement is the whole point: reached by swipe, a creator
 * profile is a modal-style detail view, not a tab, so it covers the tab bar
 * instead of sitting above it. Nothing hides the bar - the layer is simply
 * drawn over it, which means there is no "restore the bar" step that can fail.
 *
 * It holds a STACK, not one profile. Opening a suggested account from a profile
 * pushes onto it, and every entry underneath stays mounted and covered, so back
 * returns to the same component instance the user left - its scroll offset and
 * any panel it had open still exactly as they were. Only the top entry ever
 * moves, which is why a single `pushProgress` drives any depth.
 *
 * Closing is the same gesture in reverse, so it shares `paintLayer` and the
 * store's `settle` with the opening drag in useFeedSwipe. Only rightward drags
 * count: the prototype treats a leftward one on an open profile as a vertical
 * intent and hands it back to the content underneath.
 */
export function CreatorProfileLayer() {
  const { width } = useWindowDimensions();
  const mounted = useCreatorLayer((s) => s.mounted);
  const stack = useCreatorLayer((s) => s.stack);
  /** A route is showing on top of us. Stay mounted - see the store - but stop
   *  painting over it and stop taking touches from it. */
  const suspended = useCreatorLayer((s) => s.suspended);
  /** A stack route (Chat) is on top. Routes mount UNDER this layer, so it goes
   *  transparent to let one through rather than being dismissed. */
  const routeCovered = useCreatorLayer((s) => s.routeCovered);
  /** True only while a push/pop is actually animating the top card. */
  const pushing = useCreatorLayer((s) => s.pushing);

  /**
   * A profile opened FROM the follow list has to cover it.
   *
   * The list normally paints above this layer, which is what lets it cover the
   * profile it was opened from. But tapping someone in that list pushes them
   * onto THIS stack, and at the resting z-order they would slide in underneath
   * the very list they were opened from - invisible. Past `baseDepth` the top
   * of the stack is that new profile, so the layer is lifted over the list for
   * as long as it is there, and drops back the moment it is popped.
   */
  const listMounted = useFollowList((s) => s.mounted);
  const listBaseDepth = useFollowList((s) => s.baseDepth);
  const aboveFollowList = listMounted && stack.length > listBaseDepth;

  /** Whether this gesture is ours; set on activation, read on every move. */
  const dragging = useRef(false);
  /** Read inside the gesture callbacks, which are memoised on [width] only. */
  const depth = useRef(stack.length);
  depth.current = stack.length;

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      if (!dragging.current) return;
      // Open sits at 0, so the finger's rightward travel IS the offset. With a
      // profile stacked on another, the drag moves that top profile off the one
      // beneath instead of moving the whole layer off the feed.
      if (depth.current > 1) paintPush(e.nativeEvent.translationX, width);
      else paintLayer(e.nativeEvent.translationX, width);
    },
    [width],
  );

  const onHandlerStateChange = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX, velocityX } = e.nativeEvent;

      if (state === State.ACTIVE) {
        dragging.current = true;
        return;
      }

      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        if (!dragging.current) return;
        dragging.current = false;
        const far = translationX > width * COMMIT_FRACTION;
        const fast = velocityX > COMMIT_VELOCITY;
        // Dismiss/pop only on a real throw; anything less springs back.
        if (depth.current > 1) useCreatorLayer.getState().settlePush(far || fast);
        else useCreatorLayer.getState().settle(!(far || fast));
      }
    },
    [width],
  );

  /* Android hardware back walks the stack, then leaves - rather than popping
     whatever route is sitting underneath this layer. */
  useEffect(() => {
    if (!mounted || suspended) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      useCreatorLayer.getState().back();
      return true;
    });
    return () => sub.remove();
  }, [mounted, suspended]);

  if (!mounted || !stack.length) return null;

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      // Rightward only, and 8px of vertical hands the touch back to the
      // profile's own scroll view.
      activeOffsetX={10}
      failOffsetY={[-8, 8]}
      // The swipe-to-dismiss must not fire from behind the screen on top of us.
      enabled={!suspended}
    >
      <Animated.View
        pointerEvents={suspended || routeCovered ? "none" : "auto"}
        style={[
          styles.layer,
          aboveFollowList && styles.layerOverFollowList,
          // Deliberately still drawn while covered. It only has to survive the
          // single frame between openChat dispatching and the new routes
          // painting - drop it any earlier and the feed shows through that gap.
          // Chat unmounts it as soon as they have.
          // No opacity trick and no unmount: while a route is on top this is
          // simply parked off the right edge by layerProgress, exactly where a
          // closed layer sits. It stays laid out and fully built, so the
          // scroll offset is real when it slides back.
          {
            transform: [
              {
                translateX: layerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width, 0],
                }),
              },
            ],
          },
        ]}
      >
        {stack.map((handle, i) => {
          const isTop = i === stack.length - 1;
          return (
            <Animated.View
              // Position-scoped, so the same account appearing twice in one
              // stack cannot collide on key.
              key={`${i}:${handle}`}
              style={[
                StyleSheet.absoluteFill,
                styles.card,
                // Only the top card moves, and only when there is something
                // beneath it to uncover. The root sits still at all times.
                // `pushing` gates it: at rest the card is drawn with no
                // transform at all, so it can never read a progress value that
                // belongs to an animation which has already finished.
                isTop && i > 0 && pushing
                  ? {
                      transform: [
                        {
                          translateX: pushProgress.interpolate({
                            inputRange: [0, 1],
                            outputRange: [width, 0],
                          }),
                        },
                      ],
                    }
                  : null,
                // While this layer is lifted over the follow list, everything
                // below the top card is hidden - still mounted, still holding
                // its scroll offset, just not drawn. Otherwise popping the top
                // card would slide it off to reveal the profile the LIST was
                // opened from, and the list would only reappear a frame later
                // when the z-order dropped back. Hidden, the card that is
                // revealed is the list itself, which is where back belongs.
                !isTop && aboveFollowList ? styles.cardHidden : null,
              ]}
              // Covered profiles keep their state but must not take touches
              // meant for the one on top.
              pointerEvents={isTop ? "auto" : "none"}
            >
              <ProfileTabScreen username={handle} presentation="overlay" />
            </Animated.View>
          );
        })}
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FFFFFF",
    // The design's soft left edge: -12px 0 30px rgba(10,9,12,.18). elevation is
    // Android's only equivalent and cannot be directional, so it reads as a
    // slightly heavier all-round lift there.
    shadowColor: "#0A090C",
    shadowOffset: { width: -12, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
    elevation: 24,
    zIndex: 32,
  },
  /**
   * Above the follow list (36), still below the post viewer (40) - a profile
   * opened from the list must cover it, and the viewer must cover both.
   *
   * Transparent while lifted, because the only thing this layer draws that is
   * not a card is its own backing: leave it white and the gap a popping card
   * opens up would be a white wall instead of the list underneath.
   */
  layerOverFollowList: { zIndex: 38, elevation: 38, backgroundColor: "transparent" },
  /** Opaque, so a stacked profile hides the one it covers. */
  card: { backgroundColor: "#FFFFFF" },
  /** Mounted and holding its state, simply not drawn - see the call site. */
  cardHidden: { opacity: 0 },
});
