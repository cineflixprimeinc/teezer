import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import { useQuery } from "@tanstack/react-query";
import { ds } from "@/theme/design";
import { musicApi, fmtTrackTime, type MusicTrack } from "@/api/music.api";
import { MUSIC_CATEGORIES } from "@/constants/music";
import { haptics } from "@/services/haptics";

const INK = "#121014";
const MUTED = "#8A8592";
const LINE = "#EFECF1";
const CHIP = "#F4F2F5";

/* ── Glyphs - same visual language as PostCameraScreenImpl's own (Lucide-
   style stroked/filled inline SVG), reproduced locally since that file's
   glyphs aren't exported. ────────────────────────────────────────────── */

function BackGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={INK} strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function SearchGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={11} cy={11} r={7} stroke={MUTED} strokeWidth={2.1} />
      <Path d="m20.5 20.5-4.4-4.4" stroke={MUTED} strokeWidth={2.1} strokeLinecap="round" />
    </Svg>
  );
}
function MusicNoteGlyph({
  color = "#fff", size = 16, strokeWidth = 2,
}: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={7} cy={17} r={3} fill={color} />
      <Circle cx={17} cy={15} r={3} fill={color} />
      <Path d="M10 17V5l10-2v10" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
/** Outline when the sound is not saved, solid when it is - the fill IS the
 *  state, so the icon never needs a label beside it. */
function SaveGlyph({ filled }: { filled: boolean }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill={filled ? ds.accent : "none"}>
      <Path
        d="M6 3h12a1 1 0 0 1 1 1v16l-7-4-7 4V4a1 1 0 0 1 1-1Z"
        stroke={filled ? ds.accent : INK}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}
function VolumeGlyph({
  color = INK, size = 19, strokeWidth = 1.9,
}: { color?: string; size?: number; strokeWidth?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M11 5 6 9H3v6h3l5 4V5Z" fill={color} />
      <Path d="M15.4 8.6a4.6 4.6 0 0 1 0 6.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
      <Path d="M18.4 5.6a8.6 8.6 0 0 1 0 12.8" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * The three dancing bars that sit next to a title while that sound is playing.
 *
 * Animates `height` rather than a scaleY transform, which would have run on the
 * native driver: scaleY grows a bar from its CENTRE, so the bars would spread
 * up and down off the baseline instead of rising from it, and an equaliser that
 * does not stand on the floor reads as broken. Three 3pt views, and only for
 * the single row that is playing, so driving them from JS costs nothing worth
 * the wrong shape.
 */
function PlayingBars() {
  const bars = useRef([new Animated.Value(0.35), new Animated.Value(1), new Animated.Value(0.6)]).current;

  useEffect(() => {
    const loops = bars.map((v, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(i * 110),
          Animated.timing(v, { toValue: 1, duration: 300, useNativeDriver: false }),
          Animated.timing(v, { toValue: 0.32, duration: 300, useNativeDriver: false }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    // Stopped on unmount so a row scrolled out of the list is not left
    // animating forever behind the scenes.
    return () => loops.forEach((l) => l.stop());
  }, [bars]);

  return (
    <View style={styles.eqRow} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {bars.map((v, i) => (
        <Animated.View
          key={i}
          style={[
            styles.eqBar,
            { height: v.interpolate({ inputRange: [0, 1], outputRange: [3, 11] }) },
          ]}
        />
      ))}
    </View>
  );
}
function PlayGlyph({ color = "#fff", size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M8 5v14l11-7-11-7Z" />
    </Svg>
  );
}
function PauseGlyph({ color = "#fff", size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M7 5h4v14H7V5Zm6 0h4v14h-4V5Z" />
    </Svg>
  );
}

/**
 * Playback for the sound-browse page. Mirrors StudioMusicSection's own
 * useTrackPlayer (same expo-audio hooks, same original-track detail-fetch-
 * for-a-signed-url rule, same once-per-session play logging) plus seek
 * support, which that hook doesn't need and this page does ("fast forward
 * or backward the sound"). Kept local rather than shared/exported - this is
 * the only other place that needs seeking, and duplicating ~30 lines beats
 * reshaping a working hook used elsewhere in the app for a feature it
 * doesn't need.
 */
function useSoundPlayer() {
  const [track, setTrackState] = useState<MusicTrack | null>(null);
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [source, setSource] = useState<string | null>(null);

  const player = useAudioPlayer(source ? { uri: source } : null);
  const status = useAudioPlayerStatus(player);
  const loggedRef = useRef<Set<number>>(new Set());

  const playing = !!status?.playing;

  useEffect(() => {
    if (source) player.play();
    // Re-running on `player` identity would restart the track on every status tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  // Stop playback when the page itself truly unmounts (back / picked a
  // sound) - NOT on every `player` identity change. useAudioPlayer mints a
  // fresh native player whenever `source` changes, releasing the previous
  // one; a cleanup keyed on `player` (its old shape) fired on THAT release
  // too, calling .pause() on an instance the hook may already have torn
  // down - a real crash risk this page hit that Studio's own player never
  // does (Studio never pauses on unmount at all). A ref always holds the
  // CURRENT player, so this only ever touches a live instance, once, at
  // real unmount; wrapped defensively regardless.
  const playerRef = useRef(player);
  playerRef.current = player;
  useEffect(() => {
    return () => {
      try { playerRef.current?.pause(); } catch {}
    };
  }, []);

  const toggle = async (t: MusicTrack) => {
    if (track?.id === t.id) {
      playing ? player.pause() : player.play();
      return;
    }
    setLoadingId(t.id);
    try {
      let uri = t.audio_url;
      if (t.source_type === "original" || !uri) {
        uri = (await musicApi.detail(t.id)).audio_url;
      }
      if (!uri) return;
      setTrackState(t);
      setSource(uri);
      if (!loggedRef.current.has(t.id)) {
        loggedRef.current.add(t.id);
        musicApi.logPlay(t.id).catch(() => {});
      }
    } catch {
      // A failed detail/play-log call should never crash the page - the
      // row just stops showing a spinner and stays un-selected, tappable
      // again. This was missing entirely before (a bare try/finally), so
      // any network hiccup on the very first tap surfaced as an unhandled
      // promise rejection - a real crash in the dev build.
    } finally {
      setLoadingId(null);
    }
  };

  const dur = status?.duration ?? track?.duration ?? 0;
  const pos = status?.currentTime ?? 0;

  const seekBy = (deltaSec: number) => {
    if (!dur) return;
    player.seekTo(Math.max(0, Math.min(dur, pos + deltaSec))).catch(() => {});
  };
  const seekToFraction = (fraction: number) => {
    if (!dur) return;
    player.seekTo(Math.max(0, Math.min(dur, fraction * dur))).catch(() => {});
  };

  const stop = () => {
    try { playerRef.current?.pause(); } catch { /* already torn down */ }
    setTrackState(null);
    setSource(null);
  };

  return {
    track,
    playing,
    stop,
    toggle,
    isPlaying: (id: number) => track?.id === id && playing,
    isLoading: (id: number) => loadingId === id,
    progress: dur > 0 ? Math.min(1, pos / dur) : 0,
    position: fmtTrackTime(pos),
    total: fmtTrackTime(dur || null),
    seekBy,
    seekToFraction,
  };
}

/**
 * Dedicated "browse all sounds" page for the compose flow - replaces the old
 * cramped 10-item trending-only SoundPickerSheet popup. Backed by the same
 * catalog the website's upload flow and the Studio music library already
 * use (GET /music/library via musicApi.library) - search, category chips,
 * cover art, duration, and a real play/pause + seek player.
 */
/**
 * The picker's filter chips.
 *
 * Built here rather than by extending MUSIC_CATEGORIES, which is shared with
 * StudioMusicSection - adding rows there would change that screen too, and this
 * is not its change.
 *
 * Every key below is one the SERVER actually understands
 * (MusicLibraryController::library): `trending` sorts by plays_count,
 * `featured` and `recommended` filter their own boolean columns. Both of those
 * existed server-side all along and simply were not offered here.
 *
 * An unrecognised key does NOT no-op - it falls through to a mood match
 * (`mood ilike %Key%`), so an invented chip like "Hot" would quietly return an
 * empty list rather than an error. That is why the list is limited to keys with
 * real backing.
 */
const PICKER_CATEGORIES = [
  { key: "all",         label: "All",          color: "#fe2c55" },
  { key: "trending",    label: "Trending Now", color: "#f97316" },
  { key: "featured",    label: "Featured",     color: "#eab308" },
  { key: "recommended", label: "Recommended",  color: "#14b8a6" },
  ...MUSIC_CATEGORIES.filter((c) => c.key !== "all" && c.key !== "trending"),
];

/** Imperative handle so a caller can stop this page's own preview player
 *  BEFORE triggering whatever state change unmounts it - see the note on
 *  `stop` inside useSoundPlayer() above for exactly why this matters (the
 *  crash it prevents lives inside expo-audio's own unmount effect, which
 *  this component's own try/catch cannot reach). Wired up in
 *  PostCameraScreenImpl.tsx's commitSound(), the single place a close is
 *  already funneled through no matter how the page was closed - the back
 *  arrow, the sheet's grabber, or a swipe. */
export type SoundBrowsePageHandle = { stop: () => void };

export const SoundBrowsePage = forwardRef<SoundBrowsePageHandle, {
  onBack: () => void;
  /** Reports which track is currently being auditioned, so the caller can
   *  attach it when this page closes. Tapping a row PLAYS it and nothing more:
   *  choosing is done by closing, which means a track can be listened to and
   *  walked away from without ever being attached. */
  onPreviewChange?: (t: MusicTrack | null) => void;
  /** Rendered inside a bottom sheet rather than as a full page. Drops this
   *  component's own header and safe-area top padding: the sheet supplies the
   *  title and is not at the top of the screen, so both would be wrong here -
   *  two titles, and a gap the size of the status bar above the content. */
  embedded?: boolean;
  /** The track already attached to the post, if any. Only used to decide
   *  whether the "Remove current sound" row is worth showing. */
  selectedTrackId?: number | null;
  /** Detaches the current sound. Omitted by callers that have no sound to
   *  clear, which is what hides the row. */
  onClear?: () => void;
  /** Opens the music editor on one half of itself - "trim" for which part of
   *  the track plays, "volume" for how loud. Omitted by callers with no editor
   *  to open, which is what hides the bar. */
  onOpenEditor?: (section: "trim" | "volume") => void;
}>(function SoundBrowsePage({
  onBack,
  onPreviewChange,
  embedded = false,
  selectedTrackId = null,
  onClear,
  onOpenEditor,
}, ref) {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<MusicTrack[]>([]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  // A new search/category starts a fresh list from page 1.
  useEffect(() => {
    setPage(1);
    setItems([]);
  }, [debouncedSearch, category]);

  const q = useQuery({
    queryKey: ["music-library-picker", debouncedSearch, category, page],
    queryFn: () =>
      musicApi.library({
        search: debouncedSearch || undefined,
        category: category === "all" ? undefined : category,
        page,
      }),
  });

  useEffect(() => {
    // Defensive: only ever spread a real array. GET /music/library is a
    // plain (non-Resource-wrapped) Laravel paginator today, so `.data`
    // should always be an array - but fetchSoundVideos's own history in
    // this file shows the same nested-paginator response CAN come back
    // double-wrapped, which would otherwise throw ("not iterable") right
    // as the page's first page of results arrives.
    const list = Array.isArray(q.data?.data) ? q.data!.data : [];
    if (!q.data) return;
    setItems((prev) => (page === 1 ? list : [...prev, ...list]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const hasMore = q.data ? q.data.current_page < q.data.last_page : false;

  const player = useSoundPlayer();
  const insets = useSafeAreaInsets();

  useImperativeHandle(ref, () => ({ stop: player.stop }), [player.stop]);

  /* Saved sounds.
   *
   * `is_favorited` arrives on each track from the server, but the list is held
   * in local state and pages are appended rather than refetched, so re-reading
   * the server value after a tap would show the row un-save itself until the
   * next page load. This overlay is the pending truth: the optimistic value on
   * tap, the server's answer once it replies, and back again if it refuses. */
  const [savedOverride, setSavedOverride] = useState<Record<number, boolean>>({});
  const isSaved = (t: MusicTrack) => savedOverride[t.id] ?? !!t.is_favorited;

  const toggleSave = async (t: MusicTrack) => {
    const next = !isSaved(t);
    haptics.light();
    setSavedOverride((m) => ({ ...m, [t.id]: next }));
    try {
      // The endpoint returns the sound's NEW state, so this reconciles rather
      // than assuming the optimistic guess was right.
      const saved = await musicApi.toggleFavorite(t.id);
      setSavedOverride((m) => ({ ...m, [t.id]: saved }));
    } catch {
      // Rolled back to what it was, so the icon never lies about what the
      // server actually stored.
      setSavedOverride((m) => ({ ...m, [t.id]: !next }));
    }
  };

  /* Held in a ref so the effect below can depend on the TRACK alone. Depending
     on the callback would re-fire on every render of the parent, and re-report
     the same track endlessly. */
  const onPreviewChangeRef = useRef(onPreviewChange);
  onPreviewChangeRef.current = onPreviewChange;
  useEffect(() => {
    onPreviewChangeRef.current?.(player.track);
  }, [player.track]);

  const canEdit = !!onOpenEditor && !!selectedTrackId;
  const showTools = !!onOpenEditor;

  return (
    <View style={[styles.root, { paddingTop: embedded ? 0 : insets.top + 10 }]}>
      {!!onClear && !!selectedTrackId && (
        <Pressable onPress={onClear} style={styles.clearRow} accessibilityRole="button">
          <Text style={styles.clearRowText}>Remove current sound</Text>
        </Pressable>
      )}

      {!embedded && (
        <View style={styles.header}>
          <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
            <BackGlyph />
          </Pressable>
          <Text style={styles.title}>Sounds</Text>
        </View>
      )}

      <View style={styles.searchWrap}>
        <View style={styles.searchBar}>
          <SearchGlyph />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search sounds"
            placeholderTextColor={MUTED}
            style={styles.searchInput}
          />
        </View>
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipsScroll}
        contentContainerStyle={styles.chipsRow}
      >
        {PICKER_CATEGORIES.map((c) => {
          const on = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(c.key)}
              style={[styles.chip, on && { backgroundColor: c.color }]}
              accessibilityRole="button"
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[styles.listContent, showTools && { paddingBottom: 92 }]}
        showsVerticalScrollIndicator={false}
      >
        {q.isLoading && page === 1 ? (
          <ActivityIndicator color={ds.accent} style={{ marginTop: 30 }} />
        ) : !items.length ? (
          <Text style={styles.empty}>No sounds found</Text>
        ) : (
          <View style={styles.card}>
            {items.map((t, i) => {
              const isPlaying = player.isPlaying(t.id);
              const isLoading = player.isLoading(t.id);
              const isOpen = player.track?.id === t.id;
              return (
                <Pressable
                  key={t.id}
                  style={[styles.row, i < items.length - 1 && styles.rowBorder, isOpen && styles.rowOpen]}
                  // Plays it. Attaching happens on close, so the whole row is
                  // one big audition target rather than a commitment.
                  onPress={() => player.toggle(t)}
                  accessibilityRole="button"
                  accessibilityLabel={`${isPlaying ? "Pause" : "Play"} ${t.title ?? "sound"}`}
                >
                  {/* The cover IS the play button. Tapping the row picks the
                      sound, so preview needed its own target, and the artwork
                      is the biggest, most obvious one on the row. */}
                  <Pressable
                    onPress={() => player.toggle(t)}
                    style={styles.coverWrap}
                    hitSlop={6}
                    accessibilityRole="button"
                    accessibilityLabel={`${isPlaying ? "Pause" : "Play"} ${t.title ?? "sound"}`}
                  >
                    {t.cover_url ? (
                      <Image source={{ uri: t.cover_url }} style={styles.cover} contentFit="cover" />
                    ) : (
                      <View style={[styles.cover, styles.coverFallback]}>
                        <MusicNoteGlyph color={MUTED} />
                      </View>
                    )}
                    {/* Always present, so it is discoverable that the artwork
                        does something; darker once this row owns the player. */}
                    <View style={[styles.coverVeil, isOpen && styles.coverVeilOn]}>
                      {isLoading ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : isPlaying ? (
                        <PauseGlyph size={15} />
                      ) : (
                        <PlayGlyph size={15} />
                      )}
                    </View>
                  </Pressable>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={styles.titleRow}>
                      {isPlaying && <PlayingBars />}
                      <Text numberOfLines={1} style={[styles.trackTitle, isOpen && styles.trackTitleOn]}>
                        {t.title ?? "Untitled"}
                      </Text>
                    </View>
                    <Text numberOfLines={1} style={styles.trackArtist}>
                      {t.artist_name ?? "Unknown artist"} · {fmtTrackTime(t.duration)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => toggleSave(t)}
                    style={styles.saveBtn}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSaved(t) }}
                    accessibilityLabel={`${isSaved(t) ? "Remove" : "Save"} ${t.title ?? "sound"}`}
                  >
                    <SaveGlyph filled={isSaved(t)} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}

        {hasMore && !(q.isFetching && page > 1) && (
          <Pressable onPress={() => setPage((p) => p + 1)} style={styles.loadMoreBtn} accessibilityRole="button">
            <Text style={styles.loadMoreText}>Load more sounds</Text>
          </Pressable>
        )}
        {q.isFetching && page > 1 && <ActivityIndicator color={ds.accent} style={{ marginVertical: 16 }} />}
      </ScrollView>

      {/* The page's own sound controls.
          Picking a track no longer throws the music editor up on its own, so
          this bar is how anyone reaches trimming and levels at all - which is
          why it shows for video as well as photos rather than only where the
          music is the whole soundtrack.

          Both buttons need a sound to act on, so before one is picked they
          read as disabled rather than opening an editor with nothing in it. */}
      {showTools && (
        <View style={[styles.toolBar, { paddingBottom: 10 + insets.bottom }]}>
          <Pressable
            onPress={() => { haptics.medium(); onOpenEditor?.("trim"); }}
            disabled={!canEdit}
            style={styles.tool}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canEdit }}
            accessibilityLabel="Choose which part of the sound plays"
          >
            <MusicNoteGlyph color={canEdit ? INK : MUTED} size={24} strokeWidth={2.7} />
            <Text style={[styles.toolLabel, !canEdit && styles.toolLabelOff]}>Sound</Text>
          </Pressable>
          <Pressable
            onPress={() => { haptics.medium(); onOpenEditor?.("volume"); }}
            disabled={!canEdit}
            style={styles.tool}
            accessibilityRole="button"
            accessibilityState={{ disabled: !canEdit }}
            accessibilityLabel="Set the sound's volume"
          >
            <VolumeGlyph color={canEdit ? INK : MUTED} size={24} strokeWidth={2.7} />
            <Text style={[styles.toolLabel, !canEdit && styles.toolLabelOff]}>Volume</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  clearRow: {
    marginHorizontal: 18, marginBottom: 10, paddingVertical: 11,
    borderRadius: 12, backgroundColor: "rgba(254,44,85,0.10)", alignItems: "center",
  },
  clearRowText: { color: "#fe2c55", fontSize: 14, fontWeight: "800" },
  root: { flex: 1, backgroundColor: "#fff" },
  header: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, paddingBottom: 14 },
  backBtn: {
    width: 38, height: 38, borderRadius: 999, backgroundColor: CHIP,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 20, fontWeight: "800", color: INK },

  searchWrap: { paddingHorizontal: 16, paddingBottom: 10 },
  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8,
    backgroundColor: CHIP, borderRadius: 12, paddingHorizontal: 13, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14.5, color: INK, padding: 0 },

  chipsScroll: { flexGrow: 0, marginBottom: 10 },
  chipsRow: { paddingHorizontal: 16, gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: CHIP },
  chipText: { fontSize: 13, fontWeight: "700", color: "#4A4653" },
  chipTextOn: { color: "#fff" },

  listContent: { paddingHorizontal: 16, paddingBottom: 24 },
  empty: { fontSize: 13.5, color: MUTED, textAlign: "center", paddingVertical: 40 },

  card: {
    backgroundColor: "#fff", borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: LINE,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 12, paddingVertical: 11 },
  rowBorder: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: LINE },
  rowOpen: { backgroundColor: "#FAF9FB" },
  coverWrap: { width: 46, height: 46, borderRadius: 10, overflow: "hidden" },
  cover: { width: 46, height: 46, borderRadius: 10 },
  coverFallback: { backgroundColor: CHIP, alignItems: "center", justifyContent: "center" },
  /** Sits over the artwork rather than beside it, so the play affordance costs
   *  the row no width - which is what made room for the save button. */
  coverVeil: {
    ...StyleSheet.absoluteFill,
    alignItems: "center", justifyContent: "center",
    backgroundColor: "rgba(0,0,0,0.26)",
  },
  coverVeilOn: { backgroundColor: "rgba(0,0,0,0.46)" },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  trackTitle: { fontSize: 14.5, fontWeight: "700", color: INK, flexShrink: 1 },
  trackTitleOn: { color: ds.accent },
  trackArtist: { fontSize: 12.5, color: MUTED, marginTop: 2 },
  /** Fixed height with the bars pinned to the bottom, so a growing bar rises
   *  off the baseline instead of shifting the title it sits next to. */
  eqRow: { flexDirection: "row", alignItems: "flex-end", gap: 2, height: 11 },
  eqBar: { width: 2.5, borderRadius: 999, backgroundColor: ds.accent },
  saveBtn: {
    width: 34, height: 34, borderRadius: 999,
    alignItems: "center", justifyContent: "center",
  },
  toolBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-around",
    backgroundColor: "#fff",
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: LINE,
    paddingTop: 10,
  },
  tool: { alignItems: "center", justifyContent: "center", gap: 5, paddingHorizontal: 26, paddingVertical: 5 },
  toolLabel: { fontSize: 12.5, fontWeight: "800", color: INK },
  toolLabelOff: { color: MUTED },

  loadMoreBtn: { alignSelf: "center", marginTop: 16, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: CHIP },
  loadMoreText: { fontSize: 13.5, fontWeight: "700", color: INK },
});
