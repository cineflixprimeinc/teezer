import { useCallback, useEffect, useRef } from "react";
import { Animated, BackHandler, StyleSheet, useWindowDimensions } from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import {
  usePostViewer,
  viewerProgress,
  paintViewer,
  VIEWER_COMMIT_FRACTION,
  VIEWER_COMMIT_VELOCITY,
} from "@/store/post-viewer.store";
import { useCreatorLayer } from "@/store/creator-layer.store";
import { PostViewerScreen } from "./PostViewerScreen";

/**
 * Host for the full-screen post viewer.
 *
 * Mounted after CreatorProfileLayer in RootNavigator, so it paints above both
 * the navigator AND the swiped-in creator profile. That ordering is the whole
 * point: the profile underneath keeps its position, its scroll offset and its
 * state, and is simply covered. Nothing about it moves or re-renders while a
 * post is open, so there is nothing that can flicker when the post leaves.
 *
 * Dismissal is a rightward drag - the viewer itself slides off to the right and
 * uncovers the stationary profile, which is the same direction and the same
 * settle the profile uses to uncover the feed.
 */
export function PostViewerLayer() {
  const { width } = useWindowDimensions();
  const mounted = usePostViewer((s) => s.mounted);
  const target = usePostViewer((s) => s.target);

  /** Whether this gesture is ours; set on activation, read on every move. */
  const dragging = useRef(false);

  const onGestureEvent = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      if (!dragging.current) return;
      // Covering sits at 0, so the finger's rightward travel IS the offset.
      paintViewer(e.nativeEvent.translationX, width);
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
        const far = translationX > width * VIEWER_COMMIT_FRACTION;
        const fast = velocityX > VIEWER_COMMIT_VELOCITY;
        // Dismiss only on a real throw; anything less slides back over.
        usePostViewer.getState().settle(far || fast);
      }
    },
    [width],
  );

  /* Android hardware back / system gesture closes the viewer rather than
     popping whatever route is underneath it. */
  useEffect(() => {
    if (!mounted) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      usePostViewer.getState().hide();
      return true;
    });
    return () => sub.remove();
  }, [mounted]);

  /* Hand the profile underneath back its gestures once we are gone. Tied to
     mount rather than to the close call, so it also covers teardowns that never
     went through `hide` - a sign-out clearing the stores, say. */
  useEffect(() => {
    if (!mounted) return;
    return () => useCreatorLayer.getState().resume();
  }, [mounted]);

  if (!mounted || !target) return null;

  return (
    <PanGestureHandler
      onGestureEvent={onGestureEvent}
      onHandlerStateChange={onHandlerStateChange}
      // Rightward only, and 10px of vertical hands the touch back to the
      // viewer's own vertical pager.
      activeOffsetX={12}
      failOffsetY={[-10, 10]}
    >
      <Animated.View
        style={[
          styles.layer,
          {
            transform: [
              {
                translateX: viewerProgress.interpolate({
                  inputRange: [0, 1],
                  outputRange: [width, 0],
                }),
              },
            ],
          },
        ]}
      >
        <PostViewerScreen
          username={target.username}
          startIndex={target.index}
          tab={target.tab}
          videoId={target.videoId}
          onClose={() => usePostViewer.getState().hide()}
        />
      </Animated.View>
    </PanGestureHandler>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#0B0A0E",
    // Above the creator profile layer (32), which is itself above the
    // navigator. This is what lets the profile stay put and simply be covered.
    zIndex: 40,
    elevation: 40,
  },
});
