import { useMemo, useRef } from "react";
import {
  Animated,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  useWindowDimensions,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";

/**
 * Full-screen viewer for a picture or video sent in a chat.
 *
 * Two ways out, because either one alone gets missed: the ✕ in the corner, and
 * dragging the media off in any vertical direction. The backdrop fades with
 * the drag so it is obvious the gesture is doing something well before the
 * threshold, rather than snapping shut at some invisible line.
 *
 * Deliberately its own Modal rather than the app's BottomSheet: this covers the
 * screen edge to edge on black, which is the opposite of what that shell is.
 */

export interface ViewingMedia {
  uri: string;
  isVideo?: boolean;
}

function CloseGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/** Drag distance that dismisses, as a fraction of screen height. */
const DISMISS_RATIO = 0.18;
/** …or a fling, so a short fast flick counts too. */
const DISMISS_VELOCITY = 900;

export function MediaViewer({
  media,
  onClose,
}: {
  /** The picture or video to show. Null closes the viewer. */
  media: ViewingMedia | null;
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const uri = media?.uri ?? null;
  const isVideo = !!media?.isVideo;

  // Autoplays, with the OS's own controls for play/pause/scrub/fullscreen -
  // this is a "view what was sent" surface, not the feed's silent-autoplay
  // reel player, so there's no custom playback UI to build here.
  const player = useVideoPlayer(isVideo ? uri : null, (p) => {
    p.loop = false;
    p.play();
  });

  const dragY = useRef(new Animated.Value(0)).current;
  const heightRef = useRef(height);
  heightRef.current = height;
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // Kept current every render, same reason as closeRef: the PanResponder
  // below is memoized once and must never read a stale player.
  const playerRef = useRef(player);
  playerRef.current = player;

  /**
   * Every way out of this viewer must pause before it closes, not after.
   * onClose flips the parent's `media` to null, which changes isVideo/uri and
   * tells useVideoPlayer's own reactive source-change effect to release this
   * player - releasing one that's still actively playing is what crashes the
   * app (same root cause diagnosed for the Sound picker's crash-on-close bug,
   * in expo-video's shared release machinery). On Android specifically that
   * teardown runs on an unguarded coroutine, so nothing in JS can catch it
   * once triggered - pausing first, before the source changes, leaves
   * nothing live for the release to tear down badly.
   */
  const stopAndClose = () => {
    try { playerRef.current?.pause(); } catch { /* already torn down */ }
    closeRef.current();
  };

  const responder = useMemo(
    () =>
      PanResponder.create({
        // Only take over once the finger has clearly moved vertically, so a tap
        // still reaches the backdrop.
        onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dy) > 6 && Math.abs(g.dy) > Math.abs(g.dx),
        onPanResponderMove: (_e, g) => dragY.setValue(g.dy),
        onPanResponderRelease: (_e, g) => {
          const far = Math.abs(g.dy) > heightRef.current * DISMISS_RATIO;
          const fast = Math.abs(g.vy) > DISMISS_VELOCITY / 1000;
          if (far || fast) {
            // Carry on in the direction it was thrown rather than snapping back.
            Animated.timing(dragY, {
              toValue: g.dy > 0 ? heightRef.current : -heightRef.current,
              duration: 160,
              useNativeDriver: true,
            }).start(() => {
              dragY.setValue(0);
              stopAndClose();
            });
            return;
          }
          Animated.spring(dragY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        },
      }),
    [dragY],
  );

  /** Backdrop thins out as the picture is pulled away. */
  const backdrop = dragY.interpolate({
    inputRange: [-height, 0, height],
    outputRange: [0.2, 1, 0.2],
    extrapolate: "clamp",
  });

  return (
    <Modal visible={!!media} transparent animationType="fade" onRequestClose={stopAndClose} statusBarTranslucent>
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]} />

        {/* Tapping the empty space closes too - only for a picture, where
            there's nothing else to tap. A video's own controls need that
            same empty space to receive taps (play/pause, scrub, fullscreen),
            so this would otherwise fight them for every tap on the frame. */}
        {!isVideo && <Pressable style={StyleSheet.absoluteFill} onPress={stopAndClose} accessibilityLabel="Close" />}

        <Animated.View
          {...responder.panHandlers}
          style={[styles.stage, { transform: [{ translateY: dragY }] }]}
        >
          {isVideo ? (
            <VideoView
              player={player}
              style={styles.image}
              contentFit="contain"
              nativeControls
              accessibilityLabel="Sent video"
            />
          ) : !!uri ? (
            <Image
              source={{ uri }}
              style={styles.image}
              contentFit="contain"
              transition={120}
              accessibilityLabel="Sent picture"
            />
          ) : null}
        </Animated.View>

        <Pressable
          onPress={stopAndClose}
          hitSlop={10}
          style={[styles.closeBtn, { top: insets.top + 10 }]}
          accessibilityRole="button"
          accessibilityLabel="Close"
        >
          <CloseGlyph />
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: "#000000" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center" },
  image: { width: "100%", height: "86%" },
  closeBtn: {
    position: "absolute",
    right: 14,
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.16)",
    alignItems: "center",
    justifyContent: "center",
  },
});
