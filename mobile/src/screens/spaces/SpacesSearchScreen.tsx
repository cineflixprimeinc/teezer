import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Clock, Headphones, Search, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import {
  spacesApi,
  type HappeningSpace,
  type ReplaySpace,
  type ScheduledSpace,
} from "@/api/spaces.api";
import { COVER_TINTS, SPACE_LIGHT, topicIcon } from "./space-style";

/**
 * Spaces search - the design's SEARCH SPACES page.
 *
 * Scoped to Spaces on purpose: every row here is a room from GET /spaces, so
 * the results can only ever be spaces, hosts and topics. It deliberately does
 * NOT call the global /search endpoint - that one answers with creators, reels
 * and sounds, none of which belong on this page.
 *
 * Rendered inside the Spaces tab rather than pushed as a route, so the bottom
 * tab bar stays visible exactly as the design shows it.
 *
 * Cover art: rooms have none, so a tint from COVER_TINTS carries the room's
 * topic glyph - the same stand-in the browse page and Explore already use,
 * rather than an empty grey box.
 */

const RECENTS_KEY = "reelsoo:spaces:recents";
const MAX_RECENTS = 8;
/** The endpoint trims and matches server-side; below this a query is noise. */
const MIN_QUERY = 2;

function CoverThumb({ topic, index, size = 46 }: { topic: string | null; index: number; size?: number }) {
  const Icon = topicIcon(topic);
  const tint = COVER_TINTS[index % COVER_TINTS.length];
  return (
    <LinearGradient
      colors={[tint[0], tint[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.cover, { width: size, height: size }]}
    >
      <Icon size={size * 0.42} color={colors.white} strokeWidth={2} />
    </LinearGradient>
  );
}

/** One room in a ranked list. `rank` is omitted for plain result rows. */
function SpaceRow({
  title, sub, topic, index, rank, onPress,
}: {
  title: string;
  sub: string;
  topic: string | null;
  index: number;
  rank?: number;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      {rank !== undefined && (
        <Text style={[styles.rank, rank <= 3 && styles.rankTop]}>{rank}</Text>
      )}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>{sub}</Text>
      </View>
      <CoverThumb topic={topic} index={index} />
    </Pressable>
  );
}

export function SpacesSearchScreen({
  onClose,
  onOpenSpace,
  onOpenReplay,
}: {
  onClose: () => void;
  onOpenSpace: (id: string) => void;
  onOpenReplay: (replay: ReplaySpace) => void;
}) {
  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [recents, setRecents] = useState<string[]>([]);
  const inputRef = useRef<TextInput>(null);

  // Debounced, like the global search box: /spaces is a real query per keystroke
  // otherwise, and the list re-sorts under the thumb while someone is typing.
  useEffect(() => {
    const t = setTimeout(() => setQ(raw.trim()), 250);
    return () => clearTimeout(t);
  }, [raw]);

  useEffect(() => {
    void AsyncStorage.getItem(RECENTS_KEY).then((v) => {
      if (v) try { setRecents(JSON.parse(v)); } catch { /* corrupt entry, ignore */ }
    });
  }, []);

  const remember = useCallback((term: string) => {
    const t = term.trim();
    if (t.length < MIN_QUERY) return;
    setRecents((prev) => {
      const next = [t, ...prev.filter((p) => p.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENTS);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forget = useCallback((term: string) => {
    setRecents((prev) => {
      const next = prev.filter((p) => p !== term);
      void AsyncStorage.setItem(RECENTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const searching = q.length >= MIN_QUERY;

  // Browse state - what the page shows before anything is typed.
  const browse = useQuery({
    queryKey: ["spaces-search-browse"],
    queryFn: () => spacesApi.index({ sort: "listeners" }),
    enabled: !searching,
    staleTime: 60_000,
  });

  const results = useQuery({
    queryKey: ["spaces-search", q],
    queryFn: () => spacesApi.index({ q, sort: "listeners" }),
    enabled: searching,
    staleTime: 30_000,
    retry: 1,
  });

  const active = searching ? results : browse;
  const live: HappeningSpace[] = active.data?.live ?? [];
  const scheduled: ScheduledSpace[] = searching ? active.data?.scheduled ?? [] : [];
  const replays: ReplaySpace[] = searching ? active.data?.replays ?? [] : [];

  /** Server already orders by listeners; this only trims the ranked block. */
  const popular = useMemo(() => live.slice(0, 5), [live]);

  const nothing = searching && !active.isLoading && !active.isError
    && live.length === 0 && scheduled.length === 0 && replays.length === 0;

  return (
    <Screen edges={["top"]} bg={colors.white}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={onClose} accessibilityRole="button" accessibilityLabel="Back">
          <ChevronLeft size={22} color={SPACE_LIGHT.text} strokeWidth={2.2} />
        </Pressable>

        <View style={styles.field}>
          <Search size={15} color={SPACE_LIGHT.dim} strokeWidth={2.1} />
          <TextInput
            ref={inputRef}
            value={raw}
            onChangeText={setRaw}
            placeholder="Search Spaces and hosts"
            placeholderTextColor={SPACE_LIGHT.faint}
            style={styles.input}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => remember(raw)}
          />
          {raw.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setRaw("")} accessibilityRole="button" accessibilityLabel="Clear">
              <X size={15} color={SPACE_LIGHT.dim} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>

        <Pressable hitSlop={8} onPress={() => remember(raw)} accessibilityRole="button">
          <Text style={styles.searchBtn}>Search</Text>
        </Pressable>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.content}
      >
        {/* ── recent ── */}
        {!searching && recents.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Recent</Text>
              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                onPress={() => {
                  setRecents([]);
                  void AsyncStorage.removeItem(RECENTS_KEY);
                }}
              >
                <Text style={styles.clearAll}>Clear all</Text>
              </Pressable>
            </View>
            {recents.map((t) => (
              <View key={t} style={styles.recentRow}>
                <Clock size={16} color={SPACE_LIGHT.faint} strokeWidth={2} />
                <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => setRaw(t)}>
                  <Text style={styles.recentText} numberOfLines={1}>{t}</Text>
                </Pressable>
                <Pressable
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${t}`}
                  onPress={() => forget(t)}
                >
                  <X size={14} color={SPACE_LIGHT.faint} strokeWidth={2.4} />
                </Pressable>
              </View>
            ))}
          </>
        )}

        {active.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}

        {active.isError && (
          <View style={styles.blank}>
            <Text style={styles.blankTitle}>Spaces are unavailable</Text>
            <Text style={styles.blankBody}>This is temporary. Try again in a moment.</Text>
          </View>
        )}

        {nothing && (
          <View style={styles.blank}>
            <Text style={styles.blankTitle}>No spaces for “{q}”</Text>
            <Text style={styles.blankBody}>Try a host&apos;s name, or a broader topic.</Text>
          </View>
        )}

        {/* ── popular (browse only) ── */}
        {!searching && popular.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Popular Spaces</Text>
              <View style={styles.trendPill}>
                <Text style={styles.trendPillText}>TRENDING</Text>
              </View>
            </View>
            {popular.map((s, i) => (
              <SpaceRow
                key={s.id}
                rank={i + 1}
                title={s.title}
                sub={`${formatCompact(s.listening)} listening`}
                topic={s.topic}
                index={i}
                onPress={() => onOpenSpace(s.id)}
              />
            ))}
          </>
        )}

        {/* ── live now: the design's horizontal rail ── */}
        {!searching && live.length > 0 && (
          <>
            <View style={styles.sectionHead}>
              <Text style={styles.sectionTitle}>Live now</Text>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.rail}
            >
              {live.map((s, i) => (
                <Pressable
                  key={s.id}
                  onPress={() => onOpenSpace(s.id)}
                  style={({ pressed }) => [styles.liveCard, pressed && styles.pressed]}
                >
                  <CoverThumb topic={s.topic} index={i} size={132} />
                  <View style={styles.liveTag}>
                    <View style={styles.liveDot} />
                    <Text style={styles.liveTagText}>LIVE</Text>
                  </View>
                  <View style={styles.liveCount}>
                    <Headphones size={11} color={colors.white} strokeWidth={2.6} />
                    <Text style={styles.liveCountText}>{formatCompact(s.listening)}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── results ── */}
        {searching && live.length > 0 && (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Live spaces</Text></View>
            {live.map((s, i) => (
              <SpaceRow
                key={s.id}
                title={s.title}
                sub={`${formatCompact(s.listening)} listening${s.host ? ` · ${s.host.name}` : ""}`}
                topic={s.topic}
                index={i}
                onPress={() => onOpenSpace(s.id)}
              />
            ))}
          </>
        )}

        {searching && scheduled.length > 0 && (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Scheduled</Text></View>
            {scheduled.map((s, i) => (
              <SpaceRow
                key={s.id}
                title={s.title}
                sub={`${formatCompact(s.going)} going${s.host ? ` · ${s.host.name}` : ""}`}
                topic={s.topic}
                index={i}
                onPress={() => onOpenSpace(s.id)}
              />
            ))}
          </>
        )}

        {searching && replays.length > 0 && (
          <>
            <View style={styles.sectionHead}><Text style={styles.sectionTitle}>Replays</Text></View>
            {replays.map((r, i) => (
              <SpaceRow
                key={r.id}
                title={r.title}
                sub={`${formatCompact(r.plays)} plays${r.duration_minutes ? ` · ${r.duration_minutes} min` : ""}`}
                topic={r.topic}
                index={i}
                onPress={() => onOpenReplay(r)}
              />
            ))}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: spacing.md,
    paddingBottom: 12,
  },
  field: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: SPACE_LIGHT.chip,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 38,
  },
  input: { flex: 1, minWidth: 0, fontSize: font.sm, color: SPACE_LIGHT.text, padding: 0 },
  searchBtn: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },

  content: { paddingHorizontal: spacing.md, paddingBottom: TAB_BAR_HEIGHT + spacing.xl },

  sectionHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 18, marginBottom: 6 },
  sectionTitle: { flex: 1, fontSize: font.md, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text },
  clearAll: { fontSize: font.sm, fontWeight: font.weightMedium, color: colors.brand },
  trendPill: { backgroundColor: SPACE_LIGHT.brandWash, borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  trendPillText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: SPACE_LIGHT.brandInk, letterSpacing: 0.5 },

  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  recentText: { fontSize: font.base, color: SPACE_LIGHT.text },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  rank: { width: 16, fontSize: font.sm, fontWeight: font.weightHeavy, color: SPACE_LIGHT.faint },
  rankTop: { color: colors.brand },
  rowTitle: { fontSize: font.base, fontWeight: font.weightBold, color: SPACE_LIGHT.text },
  rowSub: { fontSize: font.sm, color: colors.brand, marginTop: 2 },

  cover: { borderRadius: 10, alignItems: "center", justifyContent: "center", overflow: "hidden" },

  rail: { gap: 10, paddingVertical: 4, paddingRight: spacing.md },
  liveCard: { width: 132, borderRadius: 12, overflow: "hidden" },
  liveTag: {
    position: "absolute", top: 8, left: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: colors.brand, borderRadius: 999,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  liveDot: { width: 4, height: 4, borderRadius: 999, backgroundColor: colors.white },
  liveTagText: { color: colors.white, fontSize: 9, fontWeight: font.weightHeavy, letterSpacing: 0.4 },
  liveCount: {
    position: "absolute", left: 8, bottom: 8,
    flexDirection: "row", alignItems: "center", gap: 4,
  },
  liveCountText: { color: colors.white, fontSize: font.xs, fontWeight: font.weightBold },

  center: { paddingTop: 40, alignItems: "center" },
  blank: { paddingTop: 60, alignItems: "center", gap: 8, paddingHorizontal: 30 },
  blankTitle: { fontSize: font.md, fontWeight: font.weightBold, color: SPACE_LIGHT.text, textAlign: "center" },
  blankBody: { fontSize: font.sm, color: SPACE_LIGHT.dim, textAlign: "center", lineHeight: 20 },

  pressed: { opacity: 0.85 },
});
