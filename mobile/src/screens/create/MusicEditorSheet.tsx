import { useCallback, useMemo, useRef, useState } from "react";
import { Animated, LayoutChangeEvent, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  PanGestureHandler, State,
  type PanGestureHandlerGestureEvent, type PanGestureHandlerStateChangeEvent,
} from "react-native-gesture-handler";
import { BottomSheet } from "@/components/BottomSheet";
import { haptics, throttled } from "@/services/haptics";
import { colors } from "@/constants/colors";
import { spacing, radius, font } from "@/constants/theme";
import type { MusicTrack } from "@/api/music.api";

/**
 * Choosing which part of a track plays, where it lands, and how loud each layer
 * sits against the other.
 *
 * The project duration is the hard boundary and never moves: a 20s video gets a
 * 20s timeline, and music can only ever occupy some of it. Everything below
 * derives from that rather than from the track, which is what stops a 3-minute
 * song making a 20-second post.
 *
 * The shape written here is exactly what the server stores and the export will
 * read - milliseconds, integers, and re-clamped server-side by AudioTimeline
 * because none of this can be trusted coming off a phone.
 *
 * Drags run on Animated values, never React state. A selection window follows a
 * finger at frame rate, and re-rendering a waveform sixty times a second is how
 * a scrub turns to treacle - the same reason the sound sheet's scrubber was
 * rewritten earlier.
 */

export interface MusicEditorValue {
  music_source_start_ms: number;
  music_source_end_ms: number;
  music_video_start_ms: number;
  original_audio_volume: number;
  music_volume: number;
  is_original_audio_muted: boolean;
  is_music_muted: boolean;
  music_auto_duck: boolean;
  music_fade_in_ms: number;
  music_fade_out_ms: number;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onDone: (value: MusicEditorValue) => void;
  track: MusicTrack;
  /** The hard boundary: recorded length, uploaded length, or slideshow total. */
  projectDurationMs: number;
  /** True when the media carries its own audio. A photo does not, and its
   *  volume row is hidden rather than shown as a dead control. */
  hasOriginalAudio: boolean;
  initial?: Partial<MusicEditorValue>;
  /** Which half of the editor to show. The photo flow's sound bar has separate
   *  Sound and Volume buttons and opens this sheet focused on one of them;
   *  every other caller wants the whole editor, so that stays the default. */
  section?: "all" | "trim" | "volume";
}

const WAVE_BARS = 56;
const DEFAULT_FADE_MS = 250;

function mmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/**
 * A stand-in waveform.
 *
 * music_tracks has a waveform_data column but nothing serves it, so rather than
 * ship a flat grey bar this draws a stable shape seeded from the track id -
 * the same track always looks the same, which is what makes a selection window
 * feel like it is over something. Swap for real peaks when the API carries
 * them; nothing else here changes.
 */
function useWaveform(seed: number): number[] {
  return useMemo(() => {
    let s = seed || 1;
    return Array.from({ length: WAVE_BARS }, () => {
      s = (s * 1103515245 + 12345) & 0x7fffffff;
      return 0.25 + ((s >> 8) % 1000) / 1000 * 0.75;
    });
  }, [seed]);
}

/** Volume row: a track, a fill, a draggable knob, and a mute toggle. */
function VolumeRow({
  label, value, muted, onChange, onToggleMute,
}: {
  label: string; value: number; muted: boolean;
  onChange: (v: number) => void; onToggleMute: () => void;
}) {
  const [w, setW] = useState(0);
  const tick = useMemo(() => throttled(haptics.selection, 60), []);

  // Steps of 5 - a volume does not need per-pixel resolution, and quantising
  // gives the drag detents to tick against instead of a continuous smear.
  const setFromX = useCallback((x: number) => {
    if (w <= 0) return;
    const next = Math.max(0, Math.min(100, Math.round((x / w) * 100 / 5) * 5));
    if (next !== value) { tick(); onChange(next); }
  }, [w, value, onChange, tick]);

  return (
    <View style={styles.volRow}>
      <View style={styles.volHead}>
        <Text style={styles.volLabel}>{label}</Text>
        <Text style={[styles.volValue, muted && styles.volValueMuted]}>{muted ? "Muted" : `${value}%`}</Text>
      </View>
      <View style={styles.volBody}>
        <Pressable onPress={onToggleMute} hitSlop={10} accessibilityRole="button"
          accessibilityLabel={muted ? `Unmute ${label}` : `Mute ${label}`}>
          <Ionicons name={muted ? "volume-mute" : "volume-medium"} size={19}
            color={muted ? colors.textFaint : colors.text} />
        </Pressable>
        <View
          style={styles.volTrackWrap}
          onLayout={(e: LayoutChangeEvent) => setW(e.nativeEvent.layout.width)}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderGrant={(e) => setFromX(e.nativeEvent.locationX)}
          onResponderMove={(e) => setFromX(e.nativeEvent.locationX)}
        >
          <View style={styles.volTrack} />
          <View style={[styles.volFill, { width: `${muted ? 0 : value}%` }]} />
          <View style={[styles.volKnob, { left: `${muted ? 0 : value}%` }]} />
        </View>
      </View>
    </View>
  );
}

export function MusicEditorSheet({
  visible, onClose, onDone, track, projectDurationMs, hasOriginalAudio, initial,
  section = "all",
}: Props) {
  const trackMs = Math.max(0, Math.round((track.duration ?? 0) * 1000));

  /** How much music can play: the shorter of the track and the whole project. */
  const windowMs = Math.min(trackMs || projectDurationMs, projectDurationMs);

  const [sourceStart, setSourceStart] = useState(() =>
    Math.min(initial?.music_source_start_ms ?? 0, Math.max(0, trackMs - windowMs)));
  const [videoStart, setVideoStart] = useState(() => initial?.music_video_start_ms ?? 0);
  const [origVol, setOrigVol] = useState(() => initial?.original_audio_volume ?? 100);
  const [musicVol, setMusicVol] = useState(() => initial?.music_volume ?? 50);
  const [origMuted, setOrigMuted] = useState(() => initial?.is_original_audio_muted ?? false);
  const [musicMuted, setMusicMuted] = useState(() => initial?.is_music_muted ?? false);
  const [autoDuck, setAutoDuck] = useState(() => initial?.music_auto_duck ?? false);

  const bars = useWaveform(track.id);
  const [waveW, setWaveW] = useState(0);

  /* The selection window, in pixels. Driven by Animated during a drag so the
     waveform is not re-rendered per frame; committed to state on release. */
  const maxStart = Math.max(0, trackMs - windowMs);
  const selW = waveW > 0 && trackMs > 0 ? (windowMs / trackMs) * waveW : 0;
  const startX = useRef(new Animated.Value(0)).current;
  const dragBase = useRef(0);
  const edgeTick = useMemo(() => throttled(haptics.soft, 220), []);
  const moveTick = useMemo(() => throttled(haptics.selection, 70), []);

  const xForMs = useCallback((ms: number) =>
    (trackMs > 0 && waveW > 0 ? (ms / trackMs) * waveW : 0), [trackMs, waveW]);

  const onSelGesture = useCallback((e: PanGestureHandlerGestureEvent) => {
    const maxX = Math.max(0, waveW - selW);
    const raw = dragBase.current + e.nativeEvent.translationX;
    const clamped = Math.max(0, Math.min(maxX, raw));
    startX.setValue(clamped);
    // A wall at either end of the source, and a quiet tick while travelling.
    if (raw < 0 || raw > maxX) edgeTick(); else moveTick();
  }, [waveW, selW, startX, edgeTick, moveTick]);

  const onSelState = useCallback((e: PanGestureHandlerStateChangeEvent) => {
    const st = e.nativeEvent.state;
    if (st === State.BEGAN) { dragBase.current = xForMs(sourceStart); return; }
    if (st !== State.END && st !== State.CANCELLED) return;
    const maxX = Math.max(0, waveW - selW);
    const x = Math.max(0, Math.min(maxX, dragBase.current + e.nativeEvent.translationX));
    const ms = waveW > 0 ? Math.round((x / waveW) * trackMs) : 0;
    setSourceStart(Math.max(0, Math.min(maxStart, ms)));
  }, [waveW, selW, trackMs, maxStart, sourceStart, xForMs]);

  // Keep the window under the finger when not dragging.
  if (waveW > 0) startX.setValue(xForMs(sourceStart));

  /** What actually plays: from where the music lands to the end of the video. */
  const audibleMs = Math.max(0, Math.min(windowMs, projectDurationMs - videoStart));

  const reset = useCallback(() => {
    haptics.warning();
    setSourceStart(0); setVideoStart(0);
    setOrigVol(100); setMusicVol(50);
    setOrigMuted(false); setMusicMuted(false); setAutoDuck(false);
  }, []);

  const done = useCallback(() => {
    haptics.success();
    onDone({
      music_source_start_ms: sourceStart,
      music_source_end_ms: sourceStart + audibleMs,
      music_video_start_ms: videoStart,
      original_audio_volume: origVol,
      music_volume: musicVol,
      is_original_audio_muted: origMuted,
      is_music_muted: musicMuted,
      music_auto_duck: autoDuck,
      // A short fade unless the user muted the layer anyway. Without one the
      // waveform is cut mid-cycle, which is the click at the start of the music.
      music_fade_in_ms: musicMuted ? 0 : DEFAULT_FADE_MS,
      music_fade_out_ms: musicMuted ? 0 : DEFAULT_FADE_MS,
    });
  }, [sourceStart, audibleMs, videoStart, origVol, musicVol, origMuted, musicMuted, autoDuck, onDone]);

  /* Where the music sits on the VIDEO, as a fraction of the project. */
  const showTrim   = section === "all" || section === "trim";
  const showVolume = section === "all" || section === "volume";

  const placePct = projectDurationMs > 0 ? (videoStart / projectDurationMs) * 100 : 0;
  const spanPct = projectDurationMs > 0 ? (audibleMs / projectDurationMs) * 100 : 0;

  const nudge = useCallback((deltaMs: number) => {
    setVideoStart((v) => {
      const next = Math.max(0, Math.min(Math.max(0, projectDurationMs - 250), v + deltaMs));
      if (next === v) haptics.soft(); else haptics.selection();
      return next;
    });
  }, [projectDurationMs]);

  return (
    <BottomSheet visible={visible} onClose={onClose} height={0.82} scrollable>
      <View style={styles.wrap}>
        <Text style={styles.title} numberOfLines={1}>{track.title || "Sound"}</Text>
        <Text style={styles.sub} numberOfLines={1}>{track.artist_name || "Unknown artist"}</Text>

        {showTrim && (
          <>
          {/* ── Which part of the track ── */}
          <Text style={styles.section}>WHICH PART PLAYS</Text>
          <View style={styles.waveWrap} onLayout={(e) => setWaveW(e.nativeEvent.layout.width)}>
            <View style={styles.waveRow}>
              {bars.map((h, i) => (
                <View key={i} style={[styles.bar, { height: `${h * 100}%` }]} />
              ))}
            </View>
            {selW > 0 && (
              <PanGestureHandler onGestureEvent={onSelGesture} onHandlerStateChange={onSelState}
                activeOffsetX={[-4, 4]}>
                <Animated.View style={[styles.selWindow, { width: selW, transform: [{ translateX: startX }] }]}>
                  <View style={styles.selEdge} />
                  <View style={styles.selEdge} />
                </Animated.View>
              </PanGestureHandler>
            )}
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>{mmss(sourceStart)} → {mmss(sourceStart + audibleMs)}</Text>
            <Text style={styles.metaDim}>of {mmss(trackMs)}</Text>
          </View>

          {/* ── Where it lands on the video ── */}
          <Text style={styles.section}>WHERE IT STARTS</Text>
          <View style={styles.videoBar}>
            <View style={[styles.videoFill, { left: `${placePct}%`, width: `${spanPct}%` }]} />
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.meta}>Starts at {mmss(videoStart)}</Text>
            <Text style={styles.metaDim}>video {mmss(projectDurationMs)}</Text>
          </View>
          <View style={styles.nudgeRow}>
            <Pressable onPress={() => nudge(-500)} style={styles.nudge} accessibilityRole="button" accessibilityLabel="Move music earlier">
              <Ionicons name="chevron-back" size={16} color={colors.text} />
            </Pressable>
            <Text style={styles.nudgeHint}>
              {audibleMs < windowMs
                // Says WHY it is shorter, rather than letting the number look wrong.
                ? `Plays ${mmss(audibleMs)} — the video ends first`
                : `Plays ${mmss(audibleMs)}`}
            </Text>
            <Pressable onPress={() => nudge(500)} style={styles.nudge} accessibilityRole="button" accessibilityLabel="Move music later">
              <Ionicons name="chevron-forward" size={16} color={colors.text} />
            </Pressable>
          </View>
          </>
        )}

        {showVolume && (
          <>
          {/* ── Levels ── */}
          <Text style={styles.section}>LEVELS</Text>
          {hasOriginalAudio ? (
            <VolumeRow label="Original sound" value={origVol} muted={origMuted}
              onChange={setOrigVol} onToggleMute={() => { haptics.light(); setOrigMuted((m) => !m); }} />
          ) : (
            <Text style={styles.noAudio}>This post has no original sound.</Text>
          )}
          <VolumeRow label="Added music" value={musicVol} muted={musicMuted}
            onChange={setMusicVol} onToggleMute={() => { haptics.light(); setMusicMuted((m) => !m); }} />

          {hasOriginalAudio && (
            <Pressable
              style={styles.duckRow}
              onPress={() => { haptics.selection(); setAutoDuck((d) => !d); }}
              accessibilityRole="switch"
              accessibilityState={{ checked: autoDuck }}
            >
              <View style={[styles.check, autoDuck && styles.checkOn]}>
                {autoDuck && <Ionicons name="checkmark" size={13} color="#fff" />}
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.duckLabel}>Auto Mix</Text>
                <Text style={styles.duckHint}>Lowers the music while someone is speaking.</Text>
              </View>
            </Pressable>
          )}
          </>
        )}

        <View style={styles.actions}>
          <Pressable onPress={reset} style={styles.reset} accessibilityRole="button">
            <Text style={styles.resetTxt}>Reset</Text>
          </Pressable>
          <Pressable onPress={done} style={styles.done} accessibilityRole="button">
            <Text style={styles.doneTxt}>Done</Text>
          </Pressable>
        </View>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, gap: spacing.sm },
  title: { fontSize: font.lg, fontWeight: "800", color: colors.text, letterSpacing: -0.3 },
  sub: { fontSize: 13, color: colors.textMuted, marginTop: -2 },

  section: { fontSize: 10.5, fontWeight: "800", letterSpacing: 1.1, color: colors.textFaint, marginTop: spacing.lg },

  waveWrap: { height: 68, justifyContent: "center", marginTop: spacing.sm },
  waveRow: { flexDirection: "row", alignItems: "center", height: "100%", gap: 2 },
  bar: { flex: 1, borderRadius: 2, backgroundColor: colors.borderStrong, minHeight: 3 },
  selWindow: {
    position: "absolute", top: 0, bottom: 0, borderRadius: radius.md,
    borderWidth: 2, borderColor: colors.brand, backgroundColor: "rgba(254,44,85,0.14)",
    flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 3,
  },
  selEdge: { width: 3, height: 22, borderRadius: 2, backgroundColor: colors.brand },

  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: spacing.xs },
  meta: { fontSize: 13, fontWeight: "700", color: colors.text },
  metaDim: { fontSize: 12, color: colors.textFaint },

  videoBar: { height: 26, borderRadius: radius.sm, backgroundColor: colors.bgMuted, marginTop: spacing.sm, overflow: "hidden" },
  videoFill: { position: "absolute", top: 0, bottom: 0, backgroundColor: colors.brand, opacity: 0.85, borderRadius: radius.sm },

  nudgeRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.sm },
  nudge: { width: 34, height: 34, borderRadius: 999, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  nudgeHint: { flex: 1, textAlign: "center", fontSize: 12, color: colors.textMuted },

  volRow: { marginTop: spacing.md },
  volHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "baseline" },
  volLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  volValue: { fontSize: 13, fontWeight: "700", color: colors.brand },
  volValueMuted: { color: colors.textFaint },
  volBody: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.xs },
  volTrackWrap: { flex: 1, height: 34, justifyContent: "center" },
  volTrack: { height: 4, borderRadius: 2, backgroundColor: colors.borderStrong },
  volFill: { position: "absolute", height: 4, borderRadius: 2, backgroundColor: colors.brand },
  volKnob: { position: "absolute", width: 18, height: 18, borderRadius: 999, backgroundColor: colors.brand, marginLeft: -9 },

  noAudio: { fontSize: 12.5, color: colors.textFaint, marginTop: spacing.md },

  duckRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, marginTop: spacing.lg },
  check: { width: 22, height: 22, borderRadius: 7, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  checkOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  duckLabel: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  duckHint: { fontSize: 11.5, color: colors.textFaint, marginTop: 1 },

  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl },
  reset: { flex: 1, height: 50, borderRadius: radius.lg, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  resetTxt: { fontSize: 15, fontWeight: "700", color: colors.textSecondary },
  done: { flex: 2, height: 50, borderRadius: radius.lg, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  doneTxt: { fontSize: 15, fontWeight: "800", color: "#fff" },
});
