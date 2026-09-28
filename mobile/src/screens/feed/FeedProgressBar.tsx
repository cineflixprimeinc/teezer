import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { View, Text, StyleSheet, Animated, Easing, type LayoutChangeEvent } from "react-native";
import {
  PanGestureHandler,
  State,
  type PanGestureHandlerGestureEvent,
  type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import type { TeezerPlayer } from "@/playback/types";
import { ds } from "@/theme/design";

/**
 * TikTok-style scrubber pinned to the bottom edge of a feed post.
 *
 * Visibility is STATE-DRIVEN, deliberately. Three effects own it:
 *   - `visible` -> fades the track in/out
 *   - `bold`    -> thickens the track while a finger is down
 *   - the hide watchdog, keyed on [visible, isScrubbing, stamp]
 *
 * The gesture handlers only set state; they never animate or manage timers
 * directly. The previous version did the opposite - an imperative setTimeout
 * ref cleared and re-armed by hand in every gesture branch, with the fade
 * fired manually beside it. Any branch that cleared without re-arming, or an
 * interrupted animation, left the bar stranded on screen. Here a timer cannot
 * leak (React cleanup cancels it) and the fade cannot disagree with the state
 * (the effect re-runs on every change).
 *
 * Playback position drives an Animated.Value rather than state, so a playing
 * video does not re-render the post four times a second.
 */

/** Post-interaction hide window: hide 2-3s after the finger leaves. */
const HIDE_DELAY = 2500;
const TRACK_IDLE = 2.5;
const TRACK_ACTIVE = 5;
/** Seeks while dragging are throttled - one per frame stutters the decoder. */
const SEEK_THROTTLE = 90;
/** Ignore reveal() briefly after a seek: on release the tap surface underneath
 *  can fire, which would instantly re-show the bar the user just finished. */
const REVEAL_GUARD_MS = 400;

export type ProgressBarHandle = { reveal: () => void };

/**
 * The player reports 0 while a source is still opening, and an HLS source can
 * report NaN or Infinity until enough of the manifest is in. All of those mean
 * "not known yet" - none of them mean the post is zero-length.
 */
function usable(sec: number | null | undefined): number {
  return typeof sec === "number" && isFinite(sec) && sec > 0 ? sec : 0;
}

function clock(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export const FeedProgressBar = forwardRef<
  ProgressBarHandle,
  {
    /** Null before FeedVideoPlayer reports one back (or in Expo Go, or on a
     *  device where the native module failed to load) - the bar simply has
     *  nothing to scrub against yet, so every effect/handler below no-ops. */
    player: TeezerPlayer | null;
    active: boolean;
    bottomInset?: number;
    onScrubbingChange?: (scrubbing: boolean) => void;
  }
>(function FeedProgressBar({ player, active, bottomInset = 0, onScrubbingChange }, ref) {
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);
  const [bold, setBold] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [label, setLabel] = useState({ at: "00:00", total: "00:00" });
  /** Bumped by every interaction; re-arms the hide watchdog from that moment. */
  const [stamp, setStamp] = useState(0);

  const fade = useRef(new Animated.Value(0)).current;
  const fill = useRef(new Animated.Value(0)).current;
  const thickness = useRef(new Animated.Value(TRACK_IDLE)).current;

  const scrubbing = useRef(false);
  /** Playback position when the drag began, in SECONDS - not a fraction. The
   *  duration is often still unknown at touch-down, and a fraction captured
   *  against an unknown duration is zero forever after: the drag would then
   *  seek from the start of the post rather than from where it actually was. */
  const startTime = useRef(0);
  const widthRef = useRef(0);
  const durationRef = useRef(0);
  const visibleRef = useRef(false);
  const lastSeek = useRef(0);
  const scrubEndAt = useRef(0);

  useEffect(() => { widthRef.current = width; }, [width]);
  useEffect(() => { visibleRef.current = visible; }, [visible]);

  const bump = useCallback(() => setStamp(Date.now()), []);

  /* ── visuals follow state, always ──────────────────────────────────────── */
  useEffect(() => {
    Animated.timing(fade, {
      toValue: visible ? 1 : 0,
      duration: visible ? 140 : 260,
      easing: Easing.out(Easing.quad),
      // JS driver throughout: `thickness` animates height, which the native
      // driver cannot do, and both feed the same style node.
      useNativeDriver: false,
    }).start();
  }, [visible, fade]);

  useEffect(() => {
    Animated.timing(thickness, {
      toValue: bold ? TRACK_ACTIVE : TRACK_IDLE,
      duration: 140,
      useNativeDriver: false,
    }).start();
  }, [bold, thickness]);

  /* ── the ONE hide path ─────────────────────────────────────────────────── */
  useEffect(() => {
    // No timer while a finger is actively dragging - the bar must stay up.
    if (!visible || isScrubbing) return;
    const t = setTimeout(() => {
      setVisible(false);
      setBold(false);
    }, HIDE_DELAY);
    return () => clearTimeout(t);
  }, [visible, isScrubbing, stamp]);

  const reveal = useCallback(() => {
    if (Date.now() - scrubEndAt.current < REVEAL_GUARD_MS) return;
    setVisible(true);
    setBold(false);
    bump();
  }, [bump]);

  useImperativeHandle(ref, () => ({ reveal }), [reveal]);

  /* ── playback position ─────────────────────────────────────────────────── */
  useEffect(() => {
    if (!active || !player) return;
    // The duration rides along on the event rather than being read back off the
    // player: both engines report it as NaN before the media is parsed and as
    // Infinity for a live stream, and the adapter has already normalised both to
    // 0 by the time it reaches here.
    return player.on("progress", ({ currentTime, duration }) => {
      const total = usable(duration);
      // Only ever widen what we know. Writing an unknown (0) back over a good
      // duration would hand the next drag a dead value.
      if (total > 0) durationRef.current = total;
      if (scrubbing.current || total <= 0) return;
      fill.setValue(Math.min(1, Math.max(0, currentTime / total)));
      // Timecode is state, so only write it while the bar is on screen.
      if (visibleRef.current) setLabel({ at: clock(currentTime), total: clock(total) });
    });
  }, [active, player, fill]);

  useEffect(() => {
    if (active) return;
    scrubbing.current = false;
    setIsScrubbing(false);
    setVisible(false);
    setBold(false);
    fill.setValue(0);
    // Drop the duration with it. This component outlives the post it was
    // measuring - scrolling away releases the source - so keeping the old
    // number would scrub the next post against the previous one's length.
    durationRef.current = 0;
  }, [active, fill]);

  /* ── scrubbing ─────────────────────────────────────────────────────────── */

  /**
   * Duration, re-read from the player whenever what we have is still unknown.
   *
   * This is the whole reason dragging did nothing on most posts. The duration
   * used to be sampled once, at touch-down, and an HLS source usually has none
   * yet at that instant - so `total` was 0 and every move event bailed out for
   * the rest of the gesture. The bar still appeared and thickened, because none
   * of that depends on duration, which is what made it look like a dead scrubber
   * rather than a missing number. Only a post that happened to resolve early
   * (the MP4 fallback, or one already watched) ever scrubbed.
   */
  const readDuration = useCallback(() => {
    if (durationRef.current > 0) return durationRef.current;
    const live = usable(player?.getDuration());
    if (live > 0) durationRef.current = live;
    return live;
  }, [player]);

  const onGesture = useCallback(
    (e: PanGestureHandlerGestureEvent) => {
      if (!scrubbing.current) return;
      const w = widthRef.current;
      const total = readDuration();
      if (!w || total <= 0) return;

      const frac = Math.min(
        1,
        Math.max(0, startTime.current / total + e.nativeEvent.translationX / w),
      );
      fill.setValue(frac);
      setLabel({ at: clock(frac * total), total: clock(total) });

      const now = Date.now();
      if (player && now - lastSeek.current > SEEK_THROTTLE) {
        lastSeek.current = now;
        player.seek(frac * total);
      }
    },
    [fill, player, readDuration],
  );

  const onState = useCallback(
    (e: PanGestureHandlerStateChangeEvent) => {
      const { state, translationX } = e.nativeEvent;

      // Touch-down: show and thicken at once, before any movement.
      if (state === State.BEGAN) {
        setVisible(true);
        setBold(true);
        bump();
        return;
      }

      if (state === State.ACTIVE) {
        if (scrubbing.current) return;
        scrubbing.current = true;
        setIsScrubbing(true);
        onScrubbingChange?.(true);
        // Position in seconds, which is knowable right now even when the
        // duration is not. readDuration() is best-effort here; if it comes up
        // empty the move handler will keep asking.
        readDuration();
        startTime.current = usable(player?.getCurrentTime()) || 0;
        bump();
        return;
      }

      if (state === State.END || state === State.CANCELLED || state === State.FAILED) {
        const wasScrubbing = scrubbing.current;
        scrubbing.current = false;
        setIsScrubbing(false);
        setBold(false);

        if (wasScrubbing) {
          onScrubbingChange?.(false);
          scrubEndAt.current = Date.now();
          const w = widthRef.current;
          const total = readDuration();
          if (w && total > 0) {
            // Final precise seek - the throttled ones can lag the finger.
            const frac = Math.min(1, Math.max(0, startTime.current / total + translationX / w));
            if (player) player.seek(frac * total);
            fill.setValue(frac);
          }
        }
        // The watchdog counts HIDE_DELAY from this moment - the release.
        bump();
      }
    },
    [player, fill, bump, onScrubbingChange, readDuration],
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width), []);

  return (
    <View style={[styles.root, { bottom: bottomInset }]} pointerEvents="box-none">
      {/* Timecode exists only mid-drag: large, bare text over the video - the
          reference has no pill behind it. */}
      {isScrubbing && (
        <View style={styles.clockWrap} pointerEvents="none">
          <Text style={styles.clockNow}>{label.at}</Text>
          <Text style={styles.clockTotal}>  /  {label.total}</Text>
        </View>
      )}

      {/* activeOffsetX/failOffsetY keep this horizontal-only, so the vertical
          feed pager still owns any up/down movement that starts here. */}
      <PanGestureHandler
        onGestureEvent={onGesture}
        onHandlerStateChange={onState}
        activeOffsetX={[-6, 6]}
        failOffsetY={[-14, 14]}
        shouldCancelWhenOutside={false}
      >
        <View style={styles.hitArea} onLayout={onLayout}>
          {/* opacity 0 at rest - a permanently visible line read as a stray
              gap above the tab bar. */}
          <Animated.View style={[styles.track, { height: thickness, opacity: fade }]}>
            <Animated.View
              style={[
                styles.fill,
                { width: fill.interpolate({ inputRange: [0, 1], outputRange: [0, Math.max(1, width)] }) },
              ]}
            />
          </Animated.View>
        </View>
      </PanGestureHandler>
    </View>
  );
});

const styles = StyleSheet.create({
  root: { position: "absolute", left: 0, right: 0 },
  clockWrap: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "baseline",
    marginBottom: 26,
  },
  clockNow: {
    color: ds.onDark,
    fontSize: 26,
    fontWeight: "800",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  clockTotal: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 22,
    fontWeight: "700",
    fontVariant: ["tabular-nums"],
    textShadowColor: "rgba(0,0,0,0.45)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  // Tall enough to grab, but flush at the bottom - padding under the track
  // held it off the edge, which is where the "gap" came from.
  //
  // The padding IS the touch target: the track itself is 2.5px, so at the old
  // 16 the whole grabbable strip was ~18px while the tap-to-reveal zone was the
  // bottom 130px. The bar would appear and then refuse to scrub, because the
  // finger was landing above the handler. 44 clears the platform minimum
  // without moving the track - it grows upward from a bottom-anchored root.
  hitArea: { paddingTop: 44, paddingBottom: 0, justifyContent: "flex-end" },
  track: { backgroundColor: "rgba(255,255,255,0.28)", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: ds.onDark },
});
