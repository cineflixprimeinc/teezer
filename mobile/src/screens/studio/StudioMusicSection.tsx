import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useAudioPlayer, useAudioPlayerStatus } from "expo-audio";
import {
  BadgeCheck, Flame, Music, Pause, Play, Search, ShieldCheck, SlidersHorizontal, X,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { Skeleton } from "@/components/Skeleton";
import { MenuRow, MenuDivider } from "@/components/sheet/MenuRow";
import {
  musicApi, fmtTrackTime, isTeezerOriginal, type MusicTrack, type MusicQuery,
} from "@/api/music.api";
import {
  COPYRIGHT_RULES, MOOD_COLOR, MUSIC_CATEGORIES, MUSIC_DURATIONS,
  MUSIC_GENRES, MUSIC_MOODS, MUSIC_TABS, licenseLabel, type MusicTab,
} from "@/constants/music";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

/** Teezer Studio -> Music Library.
 *
 *  The website's /studio/music, as a phone screen: the same category strip, the
 *  same tabs, the same mood/genre/duration filters, and the same licensing rules
 *  in front of the creator rather than behind a link.
 *
 *  It reads /music/library, so the server's scope (published library tracks
 *  flagged show_in_studio) is what bounds it - the client never decides what a
 *  creator may see. */
export function StudioMusicSection() {
  const [tab, setTab] = useState<MusicTab>("all");
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [mood, setMood] = useState<string | null>(null);
  const [genre, setGenre] = useState<string | null>(null);
  const [duration, setDuration] = useState<MusicQuery["duration"]>(undefined);

  const [filtersOpen, setFiltersOpen] = useState(false);
  const [detail, setDetail] = useState<MusicTrack | null>(null);

  // 350ms, same as the website - typing shouldn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 350);
    return () => clearTimeout(t);
  }, [search]);

  /* The tab overrides the category, exactly as the web page resolves it. */
  const resolvedCategory =
    tab === "teezer_originals" ? "teezer_originals"
    : tab === "artist_originals" ? "artist_originals"
    : category;

  const listQ = useQuery({
    queryKey: ["music-library", resolvedCategory, debounced, mood, genre, duration],
    queryFn: () =>
      musicApi.library({
        category: resolvedCategory,
        search: debounced || undefined,
        mood: mood ?? undefined,
        genre: genre ?? undefined,
        duration,
      }),
    staleTime: 60_000,
  });

  const trendingQ = useQuery({
    queryKey: ["music-trending"],
    queryFn: musicApi.trending,
    staleTime: 5 * 60_000,
  });

  const player = useTrackPlayer();

  const tracks = listQ.data?.data ?? [];
  const total = listQ.data?.total ?? 0;
  const activeFilters = [mood, genre, duration].filter(Boolean).length;

  const clearFilters = () => { setMood(null); setGenre(null); setDuration(undefined); };

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.body, player.track ? { paddingBottom: TAB_BAR_HEIGHT + 96 } : null]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={listQ.isFetching && !listQ.isLoading}
            onRefresh={() => { listQ.refetch(); trendingQ.refetch(); }}
            tintColor={colors.brand}
          />
        }
      >
        <View style={s.intro}>
          <Text style={s.title}>Music Library</Text>
          <Text style={s.sub}>Licensed music you can use in your videos.</Text>
        </View>

        {/* Search + filters */}
        <View style={s.controls}>
          <View style={s.searchWrap}>
            <Search size={15} color={colors.textFaint} strokeWidth={2.4} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search track, artist or keyword"
              placeholderTextColor={colors.textFaint}
              style={s.searchInput}
              autoCorrect={false}
              returnKeyType="search"
            />
            {search.length > 0 && (
              <Pressable onPress={() => setSearch("")} hitSlop={8}>
                <X size={14} color={colors.textFaint} />
              </Pressable>
            )}
          </View>
          <Pressable style={[s.filterBtn, activeFilters > 0 && s.filterBtnOn]} onPress={() => setFiltersOpen(true)}>
            <SlidersHorizontal size={15} color={activeFilters > 0 ? colors.white : colors.textSecondary} strokeWidth={2.4} />
            {activeFilters > 0 && <Text style={s.filterCount}>{activeFilters}</Text>}
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={s.tabs}>
          {MUSIC_TABS.map((t) => {
            const on = t.key === tab;
            return (
              <Pressable key={t.key} style={[s.tab, on && s.tabOn]} onPress={() => { setTab(t.key); setCategory("all"); }}>
                <Text style={[s.tabText, on && s.tabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Categories - hidden on the originals tabs, where they'd be overridden anyway */}
        {tab === "all" && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.catScroll}
            contentContainerStyle={s.catRow}
          >
            {MUSIC_CATEGORIES.map((c) => {
              const on = c.key === category;
              return (
                <Pressable
                  key={c.key}
                  style={[s.cat, on && { backgroundColor: c.color, borderColor: c.color }]}
                  onPress={() => setCategory(c.key)}
                >
                  {c.key === "trending" && (
                    <Flame size={11} color={on ? colors.white : c.color} strokeWidth={2.6} />
                  )}
                  <Text style={[s.catText, on && { color: colors.white, fontWeight: font.weightBold }]}>
                    {c.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}

        {activeFilters > 0 && (
          <Pressable style={s.activeRow} onPress={clearFilters}>
            <Text style={s.activeText}>
              {[mood, genre, MUSIC_DURATIONS.find((d) => d.key === duration)?.label]
                .filter(Boolean)
                .join(" · ")}
            </Text>
            <X size={13} color={colors.brand} strokeWidth={2.6} />
          </Pressable>
        )}

        {/* Trending strip - only on the default view, where it isn't fighting a filter */}
        {tab === "all" && category === "all" && !debounced && activeFilters === 0 && (trendingQ.data?.length ?? 0) > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Trending sounds</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.trendRow}>
              {(trendingQ.data ?? []).slice(0, 10).map((t, i) => (
                <Pressable key={t.id} style={s.trendCard} onPress={() => setDetail(t)}>
                  <View style={s.trendArtWrap}>
                    <Cover uri={t.cover_url} size={104} radius={radius.md} />
                    <View style={s.trendRank}>
                      <Text style={s.trendRankText}>{i + 1}</Text>
                    </View>
                    <Pressable
                      style={s.trendPlay}
                      onPress={(e) => { e.stopPropagation(); player.toggle(t); }}
                      hitSlop={6}
                    >
                      {player.isPlaying(t.id)
                        ? <Pause size={13} color={colors.white} fill={colors.white} />
                        : <Play size={13} color={colors.white} fill={colors.white} />}
                    </Pressable>
                  </View>
                  <Text style={s.trendTitle} numberOfLines={1}>{t.title ?? "Untitled"}</Text>
                  <Text style={s.trendArtist} numberOfLines={1}>
                    {t.artist_name ?? "Unknown artist"}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          </View>
        )}

        {/* The list */}
        <View style={s.section}>
          <View style={s.listHead}>
            <Text style={s.sectionTitle}>
              {tab === "teezer_originals" ? "Teezer Originals"
                : tab === "artist_originals" ? "Artist uploads"
                : MUSIC_CATEGORIES.find((c) => c.key === category)?.label ?? "All tracks"}
            </Text>
            {!listQ.isLoading && total > 0 && (
              <Text style={s.listCount}>{formatCompact(total)}</Text>
            )}
          </View>

          {listQ.isLoading ? (
            <View style={{ gap: spacing.sm }}>
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} height={64} radius={14} />)}
            </View>
          ) : tracks.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}>
                <Music size={24} color={colors.textFaint} strokeWidth={1.8} />
              </View>
              <Text style={s.emptyTitle}>No tracks found</Text>
              <Text style={s.emptySub}>Try another search, category or filter.</Text>
            </View>
          ) : (
            <View style={{ gap: spacing.sm }}>
              {tracks.map((t) => (
                <TrackRow
                  key={t.id}
                  t={t}
                  playing={player.isPlaying(t.id)}
                  loading={player.isLoading(t.id)}
                  onPlay={() => player.toggle(t)}
                  onOpen={() => setDetail(t)}
                />
              ))}
              {total > tracks.length && (
                <Text style={s.more}>Showing {tracks.length} of {formatCompact(total)}</Text>
              )}
            </View>
          )}
        </View>

        {/* The rules. Not a link - the thing a creator gets wrong is licensing. */}
        <View style={s.rules}>
          <View style={s.rulesHead}>
            <ShieldCheck size={16} color={colors.brand} strokeWidth={2.4} />
            <Text style={s.rulesTitle}>Audio copyright guide</Text>
          </View>
          {COPYRIGHT_RULES.map((r) => (
            <View key={r.text} style={s.ruleRow}>
              <View
                style={[
                  s.ruleDot,
                  { backgroundColor: r.tone === "ok" ? colors.success : r.tone === "warn" ? colors.warning : colors.danger },
                ]}
              />
              <Text style={s.ruleText}>{r.text}</Text>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Mini player */}
      {player.track && (
        <View style={s.mini}>
          <Cover uri={player.track.cover_url} size={38} radius={8} />
          <View style={{ flex: 1 }}>
            <Text style={s.miniTitle} numberOfLines={1}>{player.track.title ?? "Untitled"}</Text>
            <Text style={s.miniArtist} numberOfLines={1}>
              {player.track.artist_name ?? "Unknown artist"} · {player.position} / {player.total}
            </Text>
            <View style={s.miniTrack}>
              <View style={[s.miniFill, { width: `${player.progress * 100}%` }]} />
            </View>
          </View>
          <Pressable style={s.miniBtn} onPress={() => player.toggle(player.track!)} hitSlop={6}>
            {player.playing
              ? <Pause size={16} color={colors.white} fill={colors.white} />
              : <Play size={16} color={colors.white} fill={colors.white} />}
          </Pressable>
          <Pressable onPress={player.stop} hitSlop={8}>
            <X size={16} color={colors.textFaint} />
          </Pressable>
        </View>
      )}

      {/* Filters */}
      <BottomSheet visible={filtersOpen} onClose={() => setFiltersOpen(false)} height={0.75}>
        <View style={s.sheetPad}>
          <Text style={s.sheetTitle}>Duration</Text>
          {MUSIC_DURATIONS.map((d) => (
            <MenuRow
              key={d.key}
              icon="time-outline"
              title={d.label}
              active={duration === d.key}
              onPress={() => setDuration(duration === d.key ? undefined : d.key)}
            />
          ))}

          <MenuDivider />
          <Text style={s.sheetTitle}>Mood</Text>
          {MUSIC_MOODS.map((m) => (
            <MenuRow
              key={m}
              icon="happy-outline"
              title={m}
              active={mood === m}
              onPress={() => setMood(mood === m ? null : m)}
            />
          ))}

          <MenuDivider />
          <Text style={s.sheetTitle}>Genre</Text>
          {MUSIC_GENRES.map((g) => (
            <MenuRow
              key={g}
              icon="musical-notes-outline"
              title={g}
              active={genre === g}
              onPress={() => setGenre(genre === g ? null : g)}
            />
          ))}

          <Pressable style={s.clearBtn} onPress={() => { clearFilters(); setFiltersOpen(false); }}>
            <Text style={s.clearText}>Clear all filters</Text>
          </Pressable>
        </View>
      </BottomSheet>

      <TrackDetailSheet
        track={detail}
        onClose={() => setDetail(null)}
        playing={detail ? player.isPlaying(detail.id) : false}
        onPlay={() => detail && player.toggle(detail)}
      />
    </View>
  );
}

/* ── Playback ─────────────────────────────────────────────────────────────
   An `original` track's audio_url is only signed by GET /music/{id}, so a row's
   own url would 403. Fetch the detail first for those; library tracks play from
   the url we already have. ── */
function useTrackPlayer() {
  const [track, setTrack] = useState<MusicTrack | null>(null);
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

      setTrack(t);
      setSource(uri);

      // Count the play once per track per session, not on every scrub or resume.
      if (!loggedRef.current.has(t.id)) {
        loggedRef.current.add(t.id);
        musicApi.logPlay(t.id).catch(() => {});
      }
    } finally {
      setLoadingId(null);
    }
  };

  const stop = () => {
    player.pause();
    setTrack(null);
    setSource(null);
  };

  const dur = status?.duration ?? track?.duration ?? 0;
  const pos = status?.currentTime ?? 0;

  return {
    track,
    playing,
    toggle,
    stop,
    isPlaying: (id: number) => track?.id === id && playing,
    isLoading: (id: number) => loadingId === id,
    progress: dur > 0 ? Math.min(1, pos / dur) : 0,
    position: fmtTrackTime(pos),
    total: fmtTrackTime(dur || null),
  };
}

/* ── Rows and bits ────────────────────────────────────────────────────────── */
function Cover({ uri, size, radius: r }: { uri: string | null; size: number; radius: number }) {
  if (uri) {
    return <Image source={{ uri }} style={{ width: size, height: size, borderRadius: r }} />;
  }
  return (
    <View style={[s.coverFallback, { width: size, height: size, borderRadius: r }]}>
      <Music size={size * 0.4} color={colors.white} strokeWidth={2} />
    </View>
  );
}

function TrackRow({
  t, playing, loading, onPlay, onOpen,
}: {
  t: MusicTrack;
  playing: boolean;
  loading: boolean;
  onPlay: () => void;
  onOpen: () => void;
}) {
  // "NEW" for the first week, the same window the website uses.
  const isNew = useMemo(
    () => Date.now() - new Date(t.created_at).getTime() < 7 * 24 * 60 * 60 * 1000,
    [t.created_at],
  );
  const moodColor = t.mood ? MOOD_COLOR[t.mood] ?? colors.textMuted : null;

  return (
    <Pressable style={({ pressed }) => [s.row, pressed && { opacity: 0.85 }]} onPress={onOpen}>
      <Pressable style={[s.playBtn, playing && s.playBtnOn]} onPress={onPlay} hitSlop={6}>
        {loading
          ? <ActivityIndicator size="small" color={playing ? colors.white : colors.brand} />
          : playing
            ? <Pause size={14} color={colors.white} fill={colors.white} />
            : <Play size={14} color={colors.brand} fill={colors.brand} />}
      </Pressable>

      <Cover uri={t.cover_url} size={44} radius={10} />

      <View style={{ flex: 1 }}>
        <View style={s.rowTitleLine}>
          <Text style={s.rowTitle} numberOfLines={1}>{t.title ?? "Untitled"}</Text>
          {isTeezerOriginal(t) && <BadgeCheck size={12} color={colors.brand} strokeWidth={2.6} />}
          {isNew && (
            <View style={s.newChip}>
              <Text style={s.newChipText}>NEW</Text>
            </View>
          )}
        </View>
        <Text style={s.rowArtist} numberOfLines={1}>
          {t.artist_name ?? "Unknown artist"}
        </Text>
        <View style={s.rowMeta}>
          <Text style={s.rowTime}>{fmtTrackTime(t.duration)}</Text>
          {!!moodColor && (
            <View style={[s.moodChip, { backgroundColor: `${moodColor}1a` }]}>
              <Text style={[s.moodText, { color: moodColor }]} numberOfLines={1}>{t.mood}</Text>
            </View>
          )}
          {t.plays_count > 0 && (
            <Text style={s.rowPlays}>{formatCompact(t.plays_count)} plays</Text>
          )}
        </View>
      </View>

      <Ionicons name="chevron-forward" size={16} color={colors.textFaint} />
    </Pressable>
  );
}

/* ── Track detail ─────────────────────────────────────────────────────────── */
function TrackDetailSheet({
  track, onClose, playing, onPlay,
}: {
  track: MusicTrack | null;
  onClose: () => void;
  playing: boolean;
  onPlay: () => void;
}) {
  if (!track) return null;
  const teezer = isTeezerOriginal(track);
  const lic = licenseLabel(track.license_type);

  const facts: [string, string | null][] = [
    ["Genre", track.genre],
    ["Mood", track.mood],
    ["Language", track.language],
    ["Duration", fmtTrackTime(track.duration)],
    ["BPM", track.bpm ? String(track.bpm) : null],
    ["Key", track.music_key],
    ["Album", track.album],
    ["ISRC", track.isrc],
  ];

  return (
    <BottomSheet visible={!!track} onClose={onClose} height={0.8}>
      <View style={s.detail}>
        <View style={s.detailHero}>
          <Cover uri={track.cover_url} size={92} radius={16} />
          <View style={{ flex: 1, gap: 4 }}>
            <View style={[s.originChip, teezer ? s.originBrand : s.originBlue]}>
              <Text style={[s.originText, { color: teezer ? colors.brand : colors.info }]}>
                {teezer ? "Teezer Original" : "Artist upload"}
              </Text>
            </View>
            <Text style={s.detailTitle} numberOfLines={2}>{track.title ?? "Untitled"}</Text>
            <Text style={s.detailArtist} numberOfLines={1}>
              {track.artist_name ?? "Unknown artist"}
            </Text>
          </View>
        </View>

        <Pressable style={s.detailPlay} onPress={onPlay}>
          {playing
            ? <Pause size={16} color={colors.white} fill={colors.white} />
            : <Play size={16} color={colors.white} fill={colors.white} />}
          <Text style={s.detailPlayText}>{playing ? "Pause" : "Play preview"}</Text>
        </Pressable>

        {/* Licensing first: it is the thing that gets a creator claimed. */}
        <View style={[s.licence, lic.ok ? s.licenceOk : s.licenceWarn]}>
          <ShieldCheck size={15} color={lic.ok ? colors.success : colors.warning} strokeWidth={2.5} />
          <Text style={[s.licenceText, { color: lic.ok ? "#166534" : "#92400e" }]}>{lic.text}</Text>
        </View>

        <View style={s.usageRow}>
          {track.allow_reels && <UseChip text="Allowed in Reels" />}
          {track.allow_stories && <UseChip text="Allowed in Stories" />}
          {track.featured && <UseChip text="Featured" />}
          {track.explicit_content && <UseChip text="Explicit" danger />}
        </View>

        <View style={s.factGrid}>
          {facts.filter(([, v]) => !!v).map(([k, v]) => (
            <View key={k} style={s.fact}>
              <Text style={s.factKey}>{k}</Text>
              <Text style={s.factVal} numberOfLines={1}>{v}</Text>
            </View>
          ))}
        </View>

        <View style={s.statRow}>
          <View style={s.stat}>
            <Text style={s.statVal}>{formatCompact(track.plays_count)}</Text>
            <Text style={s.statKey}>Plays</Text>
          </View>
          <View style={s.stat}>
            <Text style={s.statVal}>{formatCompact(track.uses_count)}</Text>
            <Text style={s.statKey}>Uses</Text>
          </View>
        </View>

        {!!track.description && <Text style={s.detailDesc}>{track.description}</Text>}
      </View>
    </BottomSheet>
  );
}

function UseChip({ text, danger }: { text: string; danger?: boolean }) {
  return (
    <View style={[s.useChip, danger && { backgroundColor: "#fef2f2", borderColor: "#fecaca" }]}>
      <Text style={[s.useChipText, danger && { color: colors.danger }]}>{text}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1 },
  body: { padding: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl, gap: spacing.md },

  intro: { gap: 2 },
  title: { fontSize: 22, fontWeight: font.weightHeavy, color: colors.text },
  sub: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },

  controls: { flexDirection: "row", gap: spacing.sm },
  searchWrap: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.md, height: 40,
    backgroundColor: colors.bgMuted, borderRadius: radius.md,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: colors.text, padding: 0 },
  filterBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, height: 40, borderRadius: radius.md,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.borderStrong,
  },
  filterBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  filterCount: { fontSize: 11, fontWeight: font.weightHeavy, color: colors.white },

  tabs: { flexDirection: "row", gap: 6, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: 3 },
  tab: { flex: 1, alignItems: "center", justifyContent: "center", height: 32, borderRadius: 9 },
  tabOn: { backgroundColor: colors.card, shadowColor: "#0f172a", shadowOpacity: 0.06, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  tabText: { fontSize: 12, fontWeight: font.weightMedium, color: colors.textMuted },
  tabTextOn: { color: colors.text, fontWeight: font.weightBold },

  catScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  catRow: { paddingHorizontal: spacing.lg, gap: 6, alignItems: "center" },
  cat: {
    flexDirection: "row", alignItems: "center", gap: 4,
    borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.card,
    borderRadius: radius.pill, paddingHorizontal: 12, height: 30,
  },
  catText: { fontSize: 12, fontWeight: font.weightMedium, color: colors.textSecondary },

  activeRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm,
    backgroundColor: colors.brandTint, borderWidth: 1, borderColor: "#fecdd3",
    borderRadius: radius.md, paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  activeText: { flex: 1, fontSize: 12, fontWeight: font.weightBold, color: colors.brand },

  section: { gap: spacing.sm },
  sectionTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  listHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  listCount: { fontSize: 12, color: colors.textFaint, fontWeight: font.weightBold },

  /* Trending */
  trendRow: { gap: spacing.sm, paddingRight: spacing.lg },
  trendCard: { width: 104, gap: 4 },
  trendArtWrap: { width: 104, height: 104 },
  trendRank: {
    position: "absolute", top: 5, left: 5,
    minWidth: 18, height: 18, borderRadius: 9, paddingHorizontal: 5,
    backgroundColor: "rgba(0,0,0,0.6)", alignItems: "center", justifyContent: "center",
  },
  trendRankText: { fontSize: 10, fontWeight: font.weightHeavy, color: colors.white },
  trendPlay: {
    position: "absolute", bottom: 5, right: 5,
    width: 26, height: 26, borderRadius: 13, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  trendTitle: { fontSize: 12, fontWeight: font.weightBold, color: colors.text },
  trendArtist: { fontSize: 10.5, color: colors.textFaint },

  /* Rows */
  row: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: 14, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
  },
  playBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: "center", justifyContent: "center",
    backgroundColor: colors.brandTint, borderWidth: 1, borderColor: "#fecdd3",
  },
  playBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  rowTitleLine: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  newChip: { backgroundColor: "#dcfce7", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1 },
  newChipText: { fontSize: 8, fontWeight: font.weightHeavy, color: "#16a34a" },
  rowArtist: { marginTop: 1, fontSize: 11.5, color: colors.textMuted, fontWeight: font.weightMedium },
  rowMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  rowTime: { fontSize: 10.5, color: colors.textFaint, fontWeight: font.weightBold },
  moodChip: { borderRadius: radius.pill, paddingHorizontal: 6, paddingVertical: 1.5, maxWidth: 110 },
  moodText: { fontSize: 9.5, fontWeight: font.weightHeavy },
  rowPlays: { fontSize: 10.5, color: colors.textFaint },
  more: { textAlign: "center", fontSize: 11.5, color: colors.textFaint, paddingTop: spacing.sm },

  coverFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },

  /* Empty */
  empty: { alignItems: "center", paddingVertical: spacing.xxl, gap: 4 },
  emptyIcon: {
    width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", marginBottom: 4,
  },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  emptySub: { fontSize: 12.5, color: colors.textMuted },

  /* Rules */
  rules: {
    backgroundColor: colors.card, borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border, gap: 6,
  },
  rulesHead: { flexDirection: "row", alignItems: "center", gap: 7, marginBottom: 2 },
  rulesTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  ruleRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, paddingVertical: 3 },
  ruleDot: { width: 6, height: 6, borderRadius: 3, marginTop: 6 },
  ruleText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textMuted },

  /* Mini player */
  mini: {
    position: "absolute", left: spacing.lg, right: spacing.lg, bottom: TAB_BAR_HEIGHT + spacing.sm,
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.lg, padding: spacing.sm,
    borderWidth: 1, borderColor: colors.border,
    shadowColor: "#0f172a", shadowOpacity: 0.16, shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 }, elevation: 10,
  },
  miniTitle: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.text },
  miniArtist: { fontSize: 10.5, color: colors.textFaint, marginTop: 1 },
  miniTrack: { height: 3, borderRadius: 2, backgroundColor: "#f0f1f5", marginTop: 5, overflow: "hidden" },
  miniFill: { height: "100%", borderRadius: 2, backgroundColor: colors.brand },
  miniBtn: {
    width: 34, height: 34, borderRadius: 17, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },

  /* Sheets */
  sheetPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  sheetTitle: {
    fontSize: 11, fontWeight: font.weightHeavy, color: colors.textFaint,
    textTransform: "uppercase", letterSpacing: 0.7,
    paddingTop: spacing.md, paddingBottom: spacing.xs, paddingHorizontal: 2,
  },
  clearBtn: {
    marginTop: spacing.lg, height: 44, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  clearText: { fontSize: 13, fontWeight: font.weightBold, color: colors.textSecondary },

  /* Detail */
  detail: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },
  detailHero: { flexDirection: "row", gap: spacing.md, alignItems: "center" },
  originChip: { alignSelf: "flex-start", borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  originBrand: { backgroundColor: colors.brandTint },
  originBlue: { backgroundColor: "#eff6ff" },
  originText: { fontSize: 9.5, fontWeight: font.weightHeavy, textTransform: "uppercase", letterSpacing: 0.4 },
  detailTitle: { fontSize: 18, fontWeight: font.weightHeavy, color: colors.text },
  detailArtist: { fontSize: 13, color: colors.textMuted, fontWeight: font.weightMedium },

  detailPlay: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    height: 46, borderRadius: radius.lg, backgroundColor: colors.brand,
  },
  detailPlayText: { fontSize: 14, fontWeight: font.weightBold, color: colors.white },

  licence: {
    flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: radius.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: 10,
  },
  licenceOk: { backgroundColor: "#f0fdf4", borderColor: "#bbf7d0" },
  licenceWarn: { backgroundColor: "#fffbeb", borderColor: "#fde68a" },
  licenceText: { flex: 1, fontSize: 12.5, fontWeight: font.weightBold },

  usageRow: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  useChip: {
    backgroundColor: colors.bgMuted, borderWidth: 1, borderColor: colors.borderStrong,
    borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4,
  },
  useChipText: { fontSize: 10.5, fontWeight: font.weightBold, color: colors.textMuted },

  factGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  fact: {
    minWidth: "30%", flexGrow: 1,
    backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: spacing.sm,
  },
  factKey: { fontSize: 9.5, fontWeight: font.weightHeavy, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.4 },
  factVal: { marginTop: 2, fontSize: 12.5, fontWeight: font.weightBold, color: colors.text },

  statRow: { flexDirection: "row", gap: spacing.sm },
  stat: {
    flex: 1, alignItems: "center", paddingVertical: spacing.md,
    backgroundColor: colors.bgMuted, borderRadius: radius.md,
  },
  statVal: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  statKey: { fontSize: 10.5, color: colors.textFaint, fontWeight: font.weightMedium },

  detailDesc: { fontSize: 13, lineHeight: 19, color: colors.textMuted },
});
