import { useEffect } from "react";
import { Animated, BackHandler, StyleSheet, useWindowDimensions } from "react-native";
import { followListProgress, useFollowList } from "@/store/follow-list.store";
import { useCreatorLayer } from "@/store/creator-layer.store";
import { FollowListView } from "./FollowListScreen";

/**
 * Host for the followers / following / suggested list.
 *
 * Mounted after CreatorProfileLayer in RootNavigator, so it paints above both
 * the navigator AND the swiped-in creator profile. That ordering is the whole
 * point, and it is what fixes the bug this layer exists for: opening the list
 * used to DISMISS the profile and push a route, so Back from the list landed on
 * the feed - the profile you opened it from was already gone. Here the profile
 * underneath keeps its position, its scroll offset and its state, and is simply
 * covered. Nothing about it moves or re-renders while the list is open, so
 * there is nothing that can flicker when the list leaves.
 *
 * Unlike the profile and post-viewer layers, the dismiss gesture is NOT owned
 * here: the list's own horizontal swipe already means "change tab", so the two
 * would race. It is handed to that single handler instead, as `escape` (see
 * FollowListView), and paints this layer through the same shared progress
 * value.
 *
 * Opening someone from the list does NOT dismiss it. That profile is pushed
 * onto the creator stack and covers this layer, which stays exactly where it
 * is - so back uncovers the same list, on the same tab, at the same scroll
 * offset, with nothing to re-fetch.
 */
export function FollowListLayer() {
  const { width } = useWindowDimensions();
  const mounted = useFollowList((s) => s.mounted);
  const target = useFollowList((s) => s.target);
  const baseDepth = useFollowList((s) => s.baseDepth);
  const creatorDepth = useCreatorLayer((s) => s.stack.length);
  /** True while a profile opened from this list is covering it. */
  const covered = mounted && creatorDepth > baseDepth;

  /**
   * Hand the creator layer its gestures back while it is covering us, and take
   * them again once it is popped.
   *
   * Opening the list suspends that layer so this one owns the swipe and the
   * back button. But a profile opened FROM the list is drawn by that same
   * suspended layer, so it would arrive inert - unable to scroll, swipe back or
   * answer Android back. Driving the flag off the stack depth keeps the two in
   * step in both directions without either side having to remember to undo the
   * other's call.
   */
  useEffect(() => {
    if (!mounted) return;
    if (covered) useCreatorLayer.getState().resume();
    else useCreatorLayer.getState().suspend();
  }, [mounted, covered]);

  /* Android hardware back / system gesture closes the list rather than popping
     whatever route is underneath it - unless a profile is covering us, in which
     case that profile's own handler runs first and pops itself back to here. */
  useEffect(() => {
    if (!mounted || covered) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      useFollowList.getState().hide();
      return true;
    });
    return () => sub.remove();
  }, [mounted, covered]);

  /* Hand the profile underneath back its gestures once we are gone. Tied to
     mount rather than to the close call, so it also covers teardowns that never
     went through `hide` - a sign-out clearing the stores, say. */
  useEffect(() => {
    if (!mounted) return;
    return () => useCreatorLayer.getState().resume();
  }, [mounted]);

  if (!mounted || !target) return null;

  return (
    <Animated.View
      style={[
        styles.layer,
        {
          transform: [
            {
              translateX: followListProgress.interpolate({
                inputRange: [0, 1],
                outputRange: [width, 0],
              }),
            },
          ],
        },
      ]}
    >
      {/* Keyed so opening a different account's list builds it fresh, rather
          than showing the previous one's tab and scroll offset. */}
      <FollowListView
        key={`${target.username}:${target.type}`}
        username={target.username}
        type={target.type}
        presentation="overlay"
        onClose={() => useFollowList.getState().hide()}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: {
    ...StyleSheet.absoluteFill,
    backgroundColor: "#FFFFFF",
    // Above the creator profile layer (32) and below the post viewer (40).
    // The two never coexist, but the ordering keeps that an invariant rather
    // than an accident.
    zIndex: 36,
    elevation: 36,
    // The same soft left edge the profile layer carries, so a list sliding off
    // a profile reads as the same material as a profile sliding off the feed.
    shadowColor: "#0A090C",
    shadowOffset: { width: -12, height: 0 },
    shadowOpacity: 0.18,
    shadowRadius: 30,
  },
});
