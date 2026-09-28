import { useMemo, useState } from "react";
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { ChevronLeft, Radio, Search, Users } from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { Screen } from "@/components/Screen";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { liveStreamsApi, type LiveStreamCard } from "@/api/live-streams.api";
import { spacesApi, type HappeningSpace } from "@/api/spaces.api";

/**
 * Live discovery - browse live video broadcasts and Spaces side by side, per
 * the design's two `modes`. Opened from the feed's top-left Live icon
 * (HomeScreen's LiveGlyph, previously decorative).
 *
 * Live mode is genuinely new (mirrors SpacesScreen's data-fetch shape against
 * the live-streams API instead). Spaces mode reuses spacesApi.index()
 * verbatim and hands off to the existing SpaceRoom screen - no Spaces code
 * changes here.
 *
 * The design's desktop layout also has a "leaderboard" rail alongside the
 * grid - dropped here rather than faked, since GET /live-streams returns no
 * ranking data to back it (see LiveStreamController::index, only
 * data/meta/categories).
 */

type Mode = "live" | "spaces";

const PLACEHOLDER_GRADIENTS: [string, string][] = [
  ["#FDECF1", "#FFF3F6"], ["#EAF3FD", "#F4F8FE"], ["#F1EFF3", "#FAF9FB"],
];
function placeholderGradient(id: number): [string, string] {
  return PLACEHOLDER_GRADIENTS[id % PLACEHOLDER_GRADIENTS.length];
}

export function LiveDiscoveryScreen() {
  const navigation = useNavigation<any>();
  const requireAuth = useRequireAuth();
  const [mode, setMode] = useState<Mode>("live");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const live = useQuery({
    queryKey: ["live-streams", { q: query, category }],
    queryFn: () => liveStreamsApi.index({ q: query || undefined, category: category || undefined }),
    enabled: mode === "live",
    staleTime: 15_000,
  });

  const spaces = useQuery({
    queryKey: ["spaces", { topic: "trending" }],
    queryFn: () => spacesApi.index({ topic: "trending" }),
    enabled: mode === "spaces",
    staleTime: 30_000,
  });

  const cards = live.data?.data ?? [];
  const categories = live.data?.categories ?? [];
  const happeningSpaces = spaces.data?.live ?? [];

  const loading = mode === "live" ? live.isLoading : spaces.isLoading;
  const isError = mode === "live" ? live.isError : spaces.isError;
  const empty = !loading && !isError && (mode === "live" ? cards.length === 0 : happeningSpaces.length === 0);

  const watchLive = (id: number) => navigation.navigate("WatchLive", { id });
  const joinSpace = (id: string) => requireAuth(() => navigation.navigate("SpaceRoom", { id }));

  const subtitle = useMemo(
    () => (mode === "live" ? "Live video broadcasts happening right now" : "Live audio rooms from creators you follow"),
    [mode],
  );

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
            <ChevronLeft size={22} color={colors.text} strokeWidth={2.3} />
          </Pressable>
          <View style={styles.titleWrap}>
            <View style={styles.titleRow}>
              <Radio size={20} color={colors.brand} strokeWidth={2.2} />
              <Text style={styles.title}>Live</Text>
            </View>
            <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
          </View>
        </View>

        <View style={styles.searchBar}>
          <Search size={16} color={colors.textFaint} strokeWidth={2.1} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={mode === "live" ? "Search live broadcasts" : "Search spaces"}
            placeholderTextColor={colors.textFaint}
            style={styles.searchInput}
            returnKeyType="search"
          />
        </View>

        <View style={styles.modeRow}>
          {(["live", "spaces"] as Mode[]).map((m) => {
            const on = m === mode;
            return (
              <Pressable
                key={m}
                onPress={() => { setMode(m); setCategory(null); }}
                style={[styles.modeBtn, on && styles.modeBtnOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <Text style={[styles.modeText, on && styles.modeTextOn]}>{m === "live" ? "Live" : "Spaces"}</Text>
              </Pressable>
            );
          })}
        </View>

        {mode === "live" && categories.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {categories.map((c) => {
              const on = c.category === category;
              return (
                <Pressable
                  key={c.category}
                  onPress={() => setCategory(on ? null : c.category)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.category}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}

        {mode === "live" && !loading && cards.length > 0 && (
          <View style={styles.grid}>
            {cards.map((c) => (
              <LiveGridCard key={c.id} card={c} onPress={() => watchLive(c.id)} />
            ))}
          </View>
        )}

        {mode === "spaces" && !loading && happeningSpaces.length > 0 && (
          <View style={styles.list}>
            {happeningSpaces.map((s) => (
              <SpaceListCard key={s.id} space={s} onPress={() => joinSpace(s.id)} />
            ))}
          </View>
        )}

        {empty && (
          <View style={styles.empty}>
            <Radio size={26} color={colors.textFaint} strokeWidth={1.8} />
            <Text style={styles.emptyText}>
              {mode === "live" ? "Nothing live right now. Check back soon." : "No one is live right now."}
            </Text>
          </View>
        )}

        {isError && (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>Could not load this.</Text>
            <Pressable onPress={() => (mode === "live" ? live.refetch() : spaces.refetch())} hitSlop={8}>
              <Text style={styles.emptyAction}>Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

/* ── live video card (2-column grid) ─────────────────────────────────── */

function LiveGridCard({ card, onPress }: { card: LiveStreamCard; onPress: () => void }) {
  const [g1, g2] = placeholderGradient(card.id);
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.thumb}>
        <LinearGradient colors={[g1, g2]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={StyleSheet.absoluteFill} />
        <View style={styles.liveTag}>
          <View style={styles.liveDotSm} />
          <Text style={styles.liveTagText}>LIVE</Text>
        </View>
        <View style={styles.viewersTag}>
          <Users size={10} color={colors.white} strokeWidth={2.4} />
          <Text style={styles.viewersTagText}>{formatCompact(card.viewers)}</Text>
        </View>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle} numberOfLines={2}>{card.title}</Text>
        <View style={styles.cardHostRow}>
          <Avatar uri={card.host?.avatar ?? null} style={styles.cardAvatar} />
          <Text style={styles.cardHost} numberOfLines={1}>{card.host?.name ?? card.host?.username ?? "Teezer"}</Text>
        </View>
        {!!card.category && <Text style={styles.cardCategory} numberOfLines={1}>{card.category}</Text>}
      </View>
    </Pressable>
  );
}

/* ── space row (Spaces mode) ─────────────────────────────────────────── */

function SpaceListCard({ space, onPress }: { space: HappeningSpace; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.spaceRow, pressed && styles.pressed]}>
      <View style={styles.spaceStack}>
        {(space.speakers.length ? space.speakers : space.host ? [{ id: "h", name: space.host.name, avatar: space.host.avatar }] : [])
          .slice(0, 3)
          .map((sp, i) => (
            <Avatar key={sp.id} uri={sp.avatar} style={[styles.spaceAvatar, i > 0 && styles.spaceAvatarOverlap]} />
          ))}
      </View>
      <View style={styles.spaceText}>
        <Text style={styles.spaceTitle} numberOfLines={1}>{space.title}</Text>
        <View style={styles.spaceMetaRow}>
          <View style={styles.liveDotSm} />
          <Text style={styles.spaceMeta} numberOfLines={1}>{formatCompact(space.listening)} listening</Text>
        </View>
      </View>
      <View style={styles.joinBtn}>
        <Text style={styles.joinBtnText}>Join</Text>
      </View>
    </Pressable>
  );
}

/* ── styles ──────────────────────────────────────────────────────────── */

const CARD_GAP = 10;

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },

  header: { backgroundColor: colors.bg },
  headerTop: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 10 },
  backBtn: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  titleWrap: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 24, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.6 },
  subtitle: { marginTop: 3, fontSize: 12.5, color: colors.textMuted },

  searchBar: {
    flexDirection: "row", alignItems: "center", gap: 8, height: 42,
    marginHorizontal: spacing.lg, marginBottom: 10, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card,
  },
  searchInput: { flex: 1, fontSize: 13.5, color: colors.text, padding: 0 },

  modeRow: { flexDirection: "row", gap: 8, marginHorizontal: spacing.lg, marginBottom: 10 },
  modeBtn: { flex: 1, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted },
  modeBtnOn: { backgroundColor: colors.brand },
  modeText: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.textSecondary },
  modeTextOn: { color: colors.white },

  chipRow: { gap: 8, paddingHorizontal: spacing.lg, paddingBottom: 12 },
  chip: { height: 32, paddingHorizontal: 13, borderRadius: 8, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted },
  chipOn: { backgroundColor: colors.brand },
  chipText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  chipTextOn: { color: colors.white },

  content: { paddingBottom: TAB_BAR_HEIGHT + spacing.xxl, paddingTop: 4 },
  loading: { paddingVertical: spacing.xxl * 2, alignItems: "center" },

  // live grid
  grid: { flexDirection: "row", flexWrap: "wrap", gap: CARD_GAP, paddingHorizontal: spacing.lg },
  card: { width: `${(100 - 4) / 2}%`, borderRadius: 16, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  thumb: { aspectRatio: 9 / 12, position: "relative" },
  liveTag: {
    position: "absolute", top: 8, left: 8, flexDirection: "row", alignItems: "center", gap: 4,
    height: 20, paddingHorizontal: 7, borderRadius: 5, backgroundColor: colors.brand,
  },
  liveDotSm: { width: 5, height: 5, borderRadius: 2.5, backgroundColor: colors.white },
  liveTagText: { color: colors.white, fontSize: 9, fontWeight: font.weightHeavy, letterSpacing: 0.4 },
  viewersTag: {
    position: "absolute", top: 8, right: 8, flexDirection: "row", alignItems: "center", gap: 4,
    height: 20, paddingHorizontal: 7, borderRadius: 5, backgroundColor: "rgba(0,0,0,0.5)",
  },
  viewersTagText: { color: colors.white, fontSize: 10, fontWeight: font.weightBold },
  cardBody: { padding: 10, gap: 6 },
  cardTitle: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.text, lineHeight: 16 },
  cardHostRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  cardAvatar: { width: 18, height: 18, borderRadius: 9 },
  cardHost: { flex: 1, minWidth: 0, fontSize: 11, color: colors.textMuted },
  cardCategory: { fontSize: 10, fontWeight: font.weightBold, color: colors.textFaint },

  // spaces list
  list: { paddingHorizontal: spacing.lg, gap: 10 },
  spaceRow: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12,
    borderRadius: 14, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  spaceStack: { flexDirection: "row" },
  spaceAvatar: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: colors.card },
  spaceAvatarOverlap: { marginLeft: -12 },
  spaceText: { flex: 1, minWidth: 0 },
  spaceTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.text },
  spaceMetaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
  spaceMeta: { fontSize: 11.5, color: colors.textMuted },
  joinBtn: { height: 32, paddingHorizontal: 16, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  joinBtnText: { color: colors.white, fontSize: 12.5, fontWeight: font.weightHeavy },

  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: font.sm, color: colors.textMuted, textAlign: "center" },
  emptyAction: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
});
