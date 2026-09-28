import { useEffect, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { useVideoPlayer, VideoView, type BufferOptions } from "expo-video";
import { PlaybackManager } from "@/services/playback-manager";
import { createExpoPlayer } from "@/playback/expo-player";
import type { ReelsooPlayer } from "@/playback/types";

/**
 * Tuned for short-form vertical video, not expo-video's general-purpose
 * defaults: start on little data, keep only a few HLS segments ahead rather
 * than deep-buffering a post the user may swipe past in two seconds. The
 * backend cuts HLS into 4s segments (TranscodeVideoToHls), so these are
 * expressed as small multiples of that.
 *
 * expo-video's BufferOptions is one shared object for both platforms (unlike
 * react-native-video's per-platform bufferConfig this replaces), and only
 * exposes duration-based knobs - there is no equivalent of react-native-
 * video's separate "before first playback" vs "after a rebuffer" thresholds,
 * or its byte-based maxBufferMs ceiling. This preserves the same INTENT (a
 * few segments ahead, fast resume after a stall), not a like-for-like port.
 */
const BUFFER_OPTIONS: BufferOptions = {
  // Matches both platforms' original ~15s forward-buffer target (react-
  // native-video's old Android maxBufferMs and iOS
  // preferredForwardBufferDurationMs both landed on 15000ms).
  preferredForwardBufferDuration: 15,
  // Android floor before playback can resume after a stall - matches the
  // old minBufferMs's intent.
  minBufferForPlayback: 5,
};

/**
 * Owns everything specific to expo-video: creating the player, keeping its
 * mutable properties (loop/muted/rate/audioMixingMode) in sync, resuming
 * position across a quality switch, registering with the PlaybackManager and
 * honouring its floor, advancing the feed on auto-scroll.
 *
 * FeedVideoItem owns everything ELSE (gestures, chrome, the scrubber) and
 * gets the player back through `onPlayerChange`, as STATE rather than a ref -
 * FeedProgressBar and the 2x-speed-hold gesture both need it during
 * FeedVideoItem's own render (as a prop / in a useCallback's deps), and a ref
 * mutated by a child does not trigger the parent re-render that would need.
 * The value handed back is a ReelsooPlayer, never the raw engine player -
 * this file is the boundary, and everything above it survives an engine
 * change untouched.
 *
 * The player is created ONCE per mounted row and kept for the row's whole
 * life - never rebuilt on a source change. Keying useVideoPlayer on the
 * source tears the native player down and rebuilds it on every change;
 * Stories hit exactly that as a flicker between stories (see
 * StoryViewerScreen.tsx) and fixed it the way this does too: one persistent
 * player, source swapped via replaceAsync(). That is also why the
 * resume-across-quality-switch logic below reads `player.currentTime`
 * directly instead of tracking it into a ref off a progress listener - the
 * player never goes away, so there is no "old player already gone by the
 * time the effect runs" problem to work around anymore.
 */

export type FeedVideoPlayerProps = {
  /** Already-resolved playable URL - HLS master playlist or MP4 fallback. */
  source: string;
  /** True once this is the pager's current row. */
  active: boolean;
  /**
   * True for a bounded adjacent row. Gets a player and a head start on
   * buffering, but never audio/video output - see the render below, which
   * skips VideoView while only `preload` is true. Never true at the same
   * time as `active`.
   */
  preload: boolean;
  /** The feed tab is on screen - gates playback, not the source (see
   *  FeedVideoItem's own comment on this prop for why). */
  focused: boolean;
  /** A manual pause, from the tap gesture. */
  paused: boolean;
  loop: boolean;
  muted: boolean;
  rate: number;
  /** Changes when the user picks a different rendition - triggers the
   *  resume-position logic below. */
  quality: string;
  /** "cover" for a true 9:16 post (crop-fills, zero letterbox gap),
   *  "contain" for everything else (landscape, square, other portrait
   *  ratios - never cropped). Computed by FeedVideoItem's isNineSixteen(). */
  fitMode: "cover" | "contain";
  /** The post played to its end. Wired to onEnd; see FeedVideoItem. */
  onEnded?: () => void;
  /** Reports the live player up to FeedVideoItem, and null on unmount - see the
   *  module comment for why this is a callback into state rather than a ref.
   *
   *  What goes out is a ReelsooPlayer, never the raw engine player: this file is
   *  the boundary, and everything above it should be able to survive an engine
   *  change untouched. */
  onPlayerChange: (player: ReelsooPlayer | null) => void;
};

export function FeedVideoPlayer({
  source,
  active,
  preload,
  focused,
  paused,
  loop,
  muted,
  rate,
  quality,
  fitMode,
  onEnded,
  onPlayerChange,
}: FeedVideoPlayerProps) {
  // Created empty - see the module comment for why this is never keyed on
  // source. Nothing buffers until the source effect below sets one.
  const player = useVideoPlayer(null, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.playbackRate = rate;
    // Without this the feed is silent whenever the iOS ring switch is off,
    // because the default session respects it. "doNotMix" takes the
    // playback session that plays regardless - the same trade every
    // short-video app makes, at the cost of interrupting whatever else was
    // playing.
    p.audioMixingMode = "doNotMix";
    p.bufferOptions = BUFFER_OPTIONS;
  });

  /* Wrapped once per engine player, not per render. A fresh object each render
   * would change identity constantly and re-run every effect downstream that
   * depends on the player - including FeedProgressBar's progress subscription,
   * which would tear down and re-attach on every frame. */
  const reelsooPlayer = useMemo(() => createExpoPlayer(player), [player]);

  useEffect(() => {
    onPlayerChange(reelsooPlayer);
    return () => onPlayerChange(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reelsooPlayer]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  useEffect(() => {
    player.playbackRate = rate;
  }, [rate, player]);

  useEffect(() => {
    player.loop = loop;
  }, [loop, player]);

  /* ── source + resuming across a quality switch ──────────────────────────
   * `quality` changes when the user picks a different rendition. This same
   * persistent player just gets a new source via replaceAsync, which starts
   * it at zero - so a genuine quality switch (qualityRef already set to
   * something other than the incoming value, i.e. not the first source this
   * player has ever loaded) reads the live position first and re-applies it
   * once the new source reports ready. */
  const qualityRef = useRef<string | null>(null);

  useEffect(() => {
    if (!source) return;
    const isQualitySwitch = qualityRef.current !== null && qualityRef.current !== quality;
    const resumeAt = isQualitySwitch ? player.currentTime : 0;
    qualityRef.current = quality;

    void player.replaceAsync({ uri: source }).catch(() => {
      // A source swap that fails leaves the previous media in place, which is
      // a better outcome than a thrown error tearing down the feed row.
    });

    if (resumeAt <= 0) return;
    // Seeking a player that hasn't opened its new source is a no-op, so wait
    // for it to report ready rather than writing currentTime into the void.
    const sub = player.addListener("statusChange", ({ status }) => {
      if (status !== "readyToPlay") return;
      player.currentTime = resumeAt;
      sub.remove();
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source, quality]);

  /* ── auto scroll ──────────────────────────────────────────────────────
   * Only while this post is the active one: a background item reaching its
   * end must not scroll the feed out from under the user. Preloading rows
   * never reach "end" since they are never played. */
  useEffect(() => {
    if (!onEnded || !active) return;
    const sub = player.addListener("playToEnd", () => onEnded());
    return () => sub.remove();
  }, [player, active, onEnded]);

  /*
   * Registration with the PlaybackManager.
   *
   * The manager needs a way to pause THIS player without going through
   * React, because it pauses everyone else synchronously the instant one
   * item is granted the floor - waiting for a re-render is what let two
   * videos overlap for a frame.
   *
   * Random suffix so the SAME video appearing twice in one feed (a genuine
   * content duplicate) never collides on one id; useRef so it stays stable
   * across re-renders of this same mounted instance rather than changing
   * every time and orphaning the previous registration.
   */
  const playerId = useRef(`feed-expo-${Math.random().toString(36).slice(2, 8)}`).current;

  useEffect(() => {
    const unregister = PlaybackManager.register(playerId, () => {
      try {
        player.pause();
      } catch {
        // Already torn down; nothing to pause.
      }
    });
    return () => {
      // Release the floor as well as the registration, or an unmounting item
      // leaves the manager believing a dead player still holds it.
      PlaybackManager.release(playerId);
      unregister();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playerId, player]);

  useEffect(() => {
    function reevaluate() {
      // Focus gates playback but not the source, so leaving the tab pauses
      // in place and returning resumes from the same timestamp. Preloading
      // rows never ask to play - only `active` does.
      const wants = active && focused && !paused;

      if (!wants) {
        PlaybackManager.release(playerId);
        player.pause();
        return;
      }

      // Ask, do not assume. requestPlay pauses every other player first and
      // refuses outright while the app is backgrounded or playback is
      // suspended - which is what stops a video that finished buffering
      // after the user navigated away from starting on its own.
      if (PlaybackManager.requestPlay(playerId)) player.play();
      else player.pause();
    }
    reevaluate();
    // Re-evaluate on every permission change too - app backgrounded, a
    // screen pushed, a modal opened - not just on these props changing.
    return PlaybackManager.subscribe(reevaluate);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, focused, paused, player, playerId]);

  // No VideoView while only preloading - a decoder surface and audio route
  // are exactly what preloading is supposed to avoid allocating early. The
  // player still buffers once its source is set (see the effect above); it
  // just has nothing to draw into yet.
  if (!active) return null;

  return (
    <VideoView
      player={player}
      style={styles.fill}
      // fitMode is "cover" only for a true 9:16 post (fills the box
      // edge-to-edge with no letterbox band, cropping ~5% off each side
      // on a device taller than 9:16) and "contain" for every other
      // ratio (landscape, square, other portraits - never cropped). See
      // FeedVideoItem's isNineSixteen() and its matching comment on the
      // poster image, which must stay in sync with this.
      contentFit={fitMode}
      nativeControls={false}
      allowsPictureInPicture={false}
    />
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
});
