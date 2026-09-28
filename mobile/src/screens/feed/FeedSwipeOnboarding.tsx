import { StyleSheet, View } from "react-native";
import LottieView from "lottie-react-native";

/** The user's own asset, used exactly as provided - not moved or renamed. */
const FINGER_SCROLL_UP = require("../../assets/Finger Scroll Up.json");

/**
 * First-time Feed swipe hint - shown once, over the Feed, to teach a brand
 * new viewer that reels are swiped through vertically.
 *
 * Purely a visual overlay: `pointerEvents="none"` top-to-bottom so it can
 * never intercept or delay a touch. The Feed's own PanGestureHandler and
 * FlatList underneath keep working exactly as they do without this overlay -
 * dismissal is driven entirely from HomeScreen's own scroll handlers (see
 * FEED_SWIPE_DISMISS_PX there), not from anything in this component. If the
 * Lottie asset ever failed to render, the dim layer and the dismiss-on-swipe
 * behaviour are unaffected - neither depends on the animation succeeding.
 *
 * Loops (unlike the Like/Save one-shot bursts elsewhere in the rail) because
 * this is a standing hint meant to be noticed, not a reaction to one tap -
 * it plays until the user's first real swipe unmounts it.
 */
export function FeedSwipeOnboarding() {
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={styles.dim} />
      <View style={styles.center}>
        {/* 1080x1080 source - a plain square box keeps that ratio intact at
            any screen size; resizeMode="contain" does the rest. */}
        <LottieView
          source={FINGER_SCROLL_UP}
          autoPlay
          loop
          resizeMode="contain"
          style={styles.animation}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.45)" },
  center: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  // Percentage-of-width, not a fixed pt size, so it scales the same way
  // across small/normal/large phones instead of reading oversized or tiny
  // relative to the screen.
  animation: { width: "58%", aspectRatio: 1 },
});
