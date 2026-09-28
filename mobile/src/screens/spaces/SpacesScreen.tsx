import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Easing, Linking, Pressable, RefreshControl,
  ScrollView, StyleSheet, Text, View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import {
  AudioLines, Bell, BellRing, Check, ChevronRight, Headphones, Mic,
  Play, RotateCcw, Search, Settings, SlidersHorizontal, Sparkles, Timer, Users,
} from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { Screen } from "@/components/Screen";
import { WelcomePopup } from "@/components/WelcomePopup";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { useAuthStore } from "@/store/auth.store";
import { useOnboarding } from "@/store/onboarding.store";
import {
  spacesApi,
  type HappeningSpace,
  type ReplaySpace,
  type ScheduledSpace,
  type SpacesQuery,
} from "@/api/spaces.api";
import { SPACE_LIGHT } from "./space-style";
import {
  DEFAULT_FILTER, SpacesFilterSheet, filterCount, filterSummary,
  type SpacesFilter,
} from "./SpacesFilterSheet";
import { SpacesSettingsSheet } from "./SpacesSettingsSheet";
import { SpacesSearchScreen } from "./SpacesSearchScreen";

/**
 * Spaces - the browse tab, built to the design's SPACES page.
 *
 * Three sections off one request: what is live now, what is scheduled next, and
 * what is left to replay. Everything on the page is a real row - the live cards
 * are live rooms, "N going" is the reminders table, a replay's length is its
 * own start/end stamps - and the only thing decided on this side is the look
 * (space-style.ts), which is why the API has no colour fields to keep in sync.
 *
 * One deliberate departure from the mockup: brand pink is the app's #fe2c55,
 * not the mockup's #f5194e (see SPACE_LIGHT). No back/close button - this is
 * a root bottom-tab, not the mockup's overlay-from-Explore, and a root tab
 * has nowhere to "close" to (matches the real design render, not just the
 * raw markup, which still carries the overlay-only close button).
 */

/**
 * The chip row. Each one narrows the page in a way the data can actually back:
 * three pick which sections show, and three add a real query constraint.
 * `sections` is which of live / scheduled / replays survive the chip.
 */
type Chip = {
  id: string;
  label: string;
  sections: ("live" | "scheduled" | "replays")[];
  topic?: string;
  following?: boolean;
  dot?: boolean;
};

const ALL_SECTIONS: Chip["sections"] = ["live", "scheduled", "replays"];

// The three status chips first, then real categories - each `topic` value is
// the exact-case string CreateSpaceScreen's topic picker offers (the room's
// `topic` column is the host's first pick from that same list), so every
// category chip actually matches rooms hosts can really tag themselves with.
const CHIPS: Chip[] = [
  { id: "live", label: "Live now", sections: ["live"], dot: true },
  { id: "upcoming", label: "Upcoming", sections: ["scheduled"] },
  { id: "following", label: "Following", sections: ALL_SECTIONS, following: true },
  { id: "comedy", label: "Comedy", sections: ALL_SECTIONS, topic: "Comedy" },
  { id: "food", label: "Food", sections: ALL_SECTIONS, topic: "Food" },
  { id: "gaming", label: "Gaming", sections: ALL_SECTIONS, topic: "Gaming" },
  { id: "business", label: "Business", sections: ALL_SECTIONS, topic: "Business" },
  { id: "tech", label: "Tech", sections: ALL_SECTIONS, topic: "Tech" },
  { id: "fitness", label: "Fitness", sections: ALL_SECTIONS, topic: "Fitness" },
  { id: "health", label: "Health", sections: ALL_SECTIONS, topic: "Health" },
  { id: "sports", label: "Sports", sections: ALL_SECTIONS, topic: "Sports" },
  { id: "beauty", label: "Beauty", sections: ALL_SECTIONS, topic: "Beauty" },
  { id: "travel", label: "Travel", sections: ALL_SECTIONS, topic: "Travel" },
  { id: "news", label: "News", sections: ALL_SECTIONS, topic: "News" },
  { id: "late-night", label: "Late night", sections: ALL_SECTIONS, topic: "Late night" },
];

/** Sections hide rather than show an empty container, as the design's flags do. */
export function SpacesScreen() {
  const requireAuth = useRequireAuth();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();

  const [topic, setTopic] = useState("");
  const [filter, setFilter] = useState<SpacesFilter>(DEFAULT_FILTER);
  const [filterOpen, setFilterOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  // Re-tapping the Spaces tab while already on it resets to the default browse
  // view, same as switching away and back does (see MainTabs).
  useEffect(() => {
    return navigation.addListener("tabPress", () => {
      if (navigation.isFocused()) { setTopic(""); setFilter(DEFAULT_FILTER); }
    });
  }, [navigation]);

  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  const welcome = useOnboarding("spaces", isAuthed);

  // No chip selected = the whole page. Tapping the active chip clears it.
  const chip = CHIPS.find((c) => c.id === topic) ?? null;
  const shown = chip?.sections ?? ALL_SECTIONS;

  // Only non-default filters travel; the endpoint reads an absent param as "any".
  // A chip can carry its own topic / following constraint on top of the sheet's.
  const params: SpacesQuery = useMemo(() => ({
    topic: chip?.topic ?? "trending",
    ...(filter.sort !== "listeners" && { sort: filter.sort }),
    ...(filter.size !== "any" && { size: filter.size }),
    ...(filter.language && { language: filter.language }),
    ...((filter.following || chip?.following) && { following: true }),
    ...(filter.recorded && { recorded: true }),
    ...(filter.openMic && { open_mic: true }),
  }), [chip, filter]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["spaces", params],
    queryFn: () => spacesApi.index(params),
    // Listener counts move constantly; a minute-old number is a wrong number.
    staleTime: 30_000,
  });

  // "Happening now" is the one section that can plausibly run past one page
  // of rooms, so it is the one section that loads more on demand - pages
  // accumulate in local state (outside react-query's own cache) and reset
  // whenever the base query's params change under it.
  const [liveExtra, setLiveExtra] = useState<HappeningSpace[]>([]);
  const [loadingMoreLive, setLoadingMoreLive] = useState(false);
  const liveNextPage = useRef(2);
  useEffect(() => {
    setLiveExtra([]);
    liveNextPage.current = 2;
  }, [params]);
  const live = [...(data?.live ?? []), ...liveExtra];
  const liveHasMore = !!data?.live_has_more;
  const loadMoreLive = () => {
    if (loadingMoreLive || !liveHasMore) return;
    setLoadingMoreLive(true);
    spacesApi.index({ ...params, live_page: liveNextPage.current })
      .then((res) => {
        setLiveExtra((prev) => [...prev, ...res.live]);
        liveNextPage.current += 1;
        // A later page reporting no-more overrides the base query's flag.
        if (!res.live_has_more) qc.setQueryData(["spaces", params], (cur: typeof data) => cur ? { ...cur, live_has_more: false } : cur);
      })
      .catch(() => {})
      .finally(() => setLoadingMoreLive(false));
  };

  const scheduled = data?.scheduled ?? [];
  const replays = data?.replays ?? [];
  const dirty = filterCount(filter) > 0;

  // Optimistic: the button is a toggle, and a toggle that waits for a round trip
  // reads as a broken button. The server's own count replaces ours on success.
  const remind = useMutation({
    mutationFn: (id: string) => spacesApi.remind(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["spaces", params] });
      const prev = qc.getQueryData<typeof data>(["spaces", params]);
      if (prev) {
        qc.setQueryData(["spaces", params], {
          ...prev,
          scheduled: prev.scheduled.map((s) =>
            s.id === id
              ? { ...s, reminded: !s.reminded, going: s.going + (s.reminded ? -1 : 1) }
              : s,
          ),
        });
      }
      return { prev };
    },
    onError: (_e, _id, ctx) => { if (ctx?.prev) qc.setQueryData(["spaces", params], ctx.prev); },
    onSuccess: (res, id) => {
      const cur = qc.getQueryData<typeof data>(["spaces", params]);
      if (!cur) return;
      qc.setQueryData(["spaces", params], {
        ...cur,
        scheduled: cur.scheduled.map((s) =>
          s.id === id ? { ...s, reminded: res.reminded, going: res.going } : s,
        ),
      });
    },
  });

  const onRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  // You can browse Spaces signed out, but taking a seat is a real seat.
  const openRoom = (id: string) =>
    requireAuth(() => navigation.navigate("SpaceRoom", { id }));
  const startSpace = () => requireAuth(() => navigation.navigate("CreateSpace"));

  // The recording opens in the system player: counting the play is this app's
  // job, playing it is not - there is no in-app replay player yet.
  const openReplay = async (r: ReplaySpace) => {
    try {
      const { recording_url } = await spacesApi.playReplay(r.id);
      const url = recording_url || r.recording_url;
      if (url) await Linking.openURL(url);
      else Alert.alert("Replay unavailable", "That recording is no longer available.");
    } catch {
      Alert.alert("Replay unavailable", "Could not open that recording.");
    }
  };

  const nothingAtAll = !isLoading && !isError && !live.length && !scheduled.length && !replays.length;

  // The search icon opens the design's own Spaces search page. It takes over
  // this tab rather than pushing a route so the bottom tab bar stays visible,
  // which is what that design shows.
  if (searchOpen) {
    return (
      <SpacesSearchScreen
        onClose={() => setSearchOpen(false)}
        onOpenSpace={openRoom}
        onOpenReplay={openReplay}
      />
    );
  }

  return (
    <Screen edges={["top"]}>
      {/* ── header (the design's sticky block: title, actions, chips) ── */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={styles.headerText}>
            <View style={styles.titleRow}>
              <Text style={styles.title}>Spaces</Text>
              {(data?.live_count ?? 0) > 0 && <View style={styles.liveDot} />}
            </View>
          </View>

          <View style={styles.headerActions}>
            <Pressable
              onPress={() => setFilterOpen(true)}
              style={[styles.iconBtn, dirty && styles.iconBtnOn]}
              accessibilityRole="button"
              accessibilityLabel="Filter spaces"
            >
              <SlidersHorizontal size={17} color={dirty ? colors.brand : SPACE_LIGHT.text} strokeWidth={2.1} />
              {dirty && <View style={styles.iconBtnBadge} />}
            </Pressable>
            <Pressable
              onPress={() => requireAuth(() => setSettingsOpen(true))}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Spaces settings"
            >
              <Settings size={17} color={SPACE_LIGHT.text} strokeWidth={2} />
            </Pressable>
            <Pressable
              onPress={() => setSearchOpen((o) => !o)}
              style={[styles.iconBtn, searchOpen && styles.iconBtnOn]}
              accessibilityRole="button"
              accessibilityLabel="Search spaces"
            >
              <Search size={17} color={searchOpen ? colors.brand : SPACE_LIGHT.text} strokeWidth={2.1} />
            </Pressable>
          </View>
        </View>

        {/* Its own full-width line, so a long subtitle never squeezes the title. */}
        <Text style={styles.subtitle} numberOfLines={1}>
          Live audio rooms from creators you follow
        </Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {CHIPS.map((c) => {
            const on = c.id === topic;
            return (
              <Pressable
                key={c.id}
                // Tapping the active chip clears it and the whole page returns.
                onPress={() => setTopic(on ? "" : c.id)}
                style={[styles.chip, on && styles.chipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                {c.dot && <View style={[styles.chipDot, on && styles.chipDotOn]} />}
                <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brand} />}
      >
        {dirty && (
          <View style={styles.banner}>
            <SlidersHorizontal size={14} color={colors.brand} strokeWidth={2.2} />
            <Text style={styles.bannerText} numberOfLines={1}>{filterSummary(filter)}</Text>
            <Pressable onPress={() => setFilter(DEFAULT_FILTER)} hitSlop={8}>
              <Text style={styles.bannerReset}>Reset</Text>
            </Pressable>
          </View>
        )}

        {/* ── start a space ── */}
        <Pressable onPress={startSpace} style={({ pressed }) => [pressed && styles.pressed]}>
          <LinearGradient
            colors={[SPACE_LIGHT.brandWash, "#fbe6f1"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.start}
          >
            <View style={styles.startIcon}>
              <Mic size={21} color={colors.white} strokeWidth={2.1} />
            </View>
            <View style={styles.startText}>
              <Text style={styles.startTitle} numberOfLines={1}>Start a space</Text>
              <Text style={styles.startSub} numberOfLines={1}>Go live with audio in a few seconds</Text>
            </View>
            <ChevronRight size={16} color={colors.brand} strokeWidth={2.4} />
          </LinearGradient>
        </Pressable>

        {isLoading && (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.brand} />
          </View>
        )}

        {/* ── happening now ── */}
        {shown.includes("live") && live.length > 0 && (
          <>
            <SectionHeader icon={AudioLines} title="Happening now" />
            <View style={styles.liveList}>
              {live.map((s) => (
                <LiveCard key={s.id} space={s} onJoin={() => openRoom(s.id)} />
              ))}
              {liveHasMore && (
                <Pressable onPress={loadMoreLive} disabled={loadingMoreLive} style={styles.showMore}>
                  {loadingMoreLive
                    ? <ActivityIndicator color={colors.brand} size="small" />
                    : <Text style={styles.showMoreText}>Show more</Text>}
                </Pressable>
              )}
            </View>
          </>
        )}

        {/* ── scheduled ── */}
        {shown.includes("scheduled") && scheduled.length > 0 && (
          <>
            <SectionHeader icon={Timer} title="Scheduled" />
            <View style={styles.group}>
              {scheduled.map((s) => (
                <ScheduledRow
                  key={s.id}
                  space={s}
                  onRemind={() => requireAuth(() => remind.mutate(s.id))}
                />
              ))}
            </View>
          </>
        )}

        {/* ── replays ── */}
        {shown.includes("replays") && replays.length > 0 && (
          <>
            <SectionHeader icon={RotateCcw} title="Replays" />
            <View style={styles.replayList}>
              {replays.map((r) => (
                <ReplayRow key={r.id} replay={r} onPress={() => openReplay(r)} />
              ))}
            </View>
          </>
        )}

        {nothingAtAll && (
          <View style={styles.empty}>
            <AudioLines size={26} color={SPACE_LIGHT.faint} strokeWidth={1.8} />
            <Text style={styles.emptyText}>
              {dirty || topic !== "trending"
                ? "No spaces match that yet."
                : "No one is live right now. Check back soon."}
            </Text>
            {dirty && (
              <Pressable onPress={() => setFilter(DEFAULT_FILTER)} hitSlop={8}>
                <Text style={styles.emptyAction}>Clear filters</Text>
              </Pressable>
            )}
          </View>
        )}

        {isError && (
          <View style={styles.empty}>
            <AudioLines size={26} color={SPACE_LIGHT.faint} strokeWidth={1.8} />
            <Text style={styles.emptyText}>Could not load spaces.</Text>
            <Pressable onPress={() => refetch()} hitSlop={8}>
              <Text style={styles.emptyAction}>Try again</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>

      <SpacesFilterSheet
        visible={filterOpen}
        filter={filter}
        onChange={setFilter}
        onClose={() => setFilterOpen(false)}
        resultCount={live.length + scheduled.length + replays.length}
      />
      <SpacesSettingsSheet visible={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <WelcomePopup
        visible={welcome.open}
        onClose={welcome.dismiss}
        icon={AudioLines}
        title="Welcome to Teezer Spaces"
        description="Discover live audio conversations where creators, communities, and friends connect in real time."
        features={[
          { Icon: Headphones, title: "Listen Live", body: "Join live audio spaces anytime and discover interesting conversations." },
          { Icon: Mic, title: "Speak Up", body: "Request to speak or instantly join the conversation when the host allows it." },
          { Icon: Users, title: "Meet New People", body: "Connect with creators, communities, and people who share your interests." },
          { Icon: Sparkles, title: "Discover Communities", body: "Explore trending topics, discussions, and live events from around the world." },
        ]}
      />
    </Screen>
  );
}

/* ── happening now ───────────────────────────────────────────────────── */

function LiveCard({ space, onJoin }: { space: HappeningSpace; onJoin: () => void }) {
  // Faces beyond the three the stack draws - the "+N" chip.
  const beyond = Math.max(0, space.speakers_count - space.speakers.length);
  const others = Math.max(0, space.speakers_count - 1);
  const hostLine = space.host
    ? `${space.host.name}${others > 0 ? ` + ${others} speaker${others === 1 ? "" : "s"}` : ""}`
    : `${space.speakers_count} on stage`;

  return (
    <Pressable onPress={onJoin} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.cardTop}>
        <View style={styles.liveTag}>
          <PulseDot color={colors.white} size={4} />
          <Text style={styles.liveTagText}>LIVE</Text>
        </View>
        <View style={styles.listeningRow}>
          <Headphones size={12} color={SPACE_LIGHT.dim} strokeWidth={2.4} />
          <Text style={styles.listening}>{formatCompact(space.listening)} listening</Text>
        </View>
      </View>

      <Text style={styles.cardTitle} numberOfLines={2}>{space.title}</Text>
      {!!(space.description || space.topic) && (
        <Text style={styles.cardTopic} numberOfLines={1}>
          {space.description || space.topic}
        </Text>
      )}

      <View style={styles.cardBottom}>
        <View style={styles.stack}>
          {space.speakers.map((sp, i) => (
            <Avatar
              key={sp.id}
              uri={sp.avatar}
              style={[styles.stackAvatar, i > 0 && styles.stackAvatarOverlap]}
            />
          ))}
          {beyond > 0 && (
            <View style={[styles.stackMore, space.speakers.length > 0 && styles.stackAvatarOverlap]}>
              <Text style={styles.stackMoreText}>+{formatCompact(beyond)}</Text>
            </View>
          )}
        </View>
        <Text style={styles.hostLine} numberOfLines={1}>{hostLine}</Text>
        <Pressable onPress={onJoin} style={({ pressed }) => [styles.joinBtn, pressed && styles.pressed]}>
          <Text style={styles.joinBtnText}>Join</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/* ── scheduled ───────────────────────────────────────────────────────── */

function ScheduledRow({ space, onRemind }: { space: ScheduledSpace; onRemind: () => void }) {
  const { time, day } = scheduleParts(space.scheduled_for);
  const RemindIcon = space.reminded ? BellRing : Bell;

  return (
    <View style={styles.schedRow}>
      {/* Day over time in one tinted square - "SAT" / "8:00 PM". */}
      <View style={styles.schedWhen}>
        <Text style={styles.schedDay} numberOfLines={1}>{day.toUpperCase()}</Text>
        <Text style={styles.schedTime} numberOfLines={1}>{time}</Text>
      </View>
      <View style={styles.schedDivider} />
      <View style={styles.schedText}>
        <Text style={styles.schedTitle} numberOfLines={1}>{space.title}</Text>
        <Text style={styles.schedMeta} numberOfLines={1}>
          hosted by @{space.host?.username ?? "teezer"}
        </Text>
        <Text style={styles.schedGoing} numberOfLines={1}>{formatCompact(space.going)} going</Text>
      </View>
      <Pressable
        onPress={onRemind}
        style={[styles.remindBtn, space.reminded && styles.remindBtnOn]}
        accessibilityRole="button"
        accessibilityState={{ selected: space.reminded }}
        accessibilityLabel={space.reminded ? "Cancel reminder" : "Remind me"}
      >
        {space.reminded
          ? <Check size={12} color={colors.white} strokeWidth={3} />
          : <RemindIcon size={12} color={SPACE_LIGHT.text} strokeWidth={2.2} />}
        <Text style={[styles.remindText, space.reminded && styles.remindTextOn]} numberOfLines={1}>
          {space.reminded ? "Reminder set" : "Remind me"}
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * A scheduled room's two-line stamp, in the device's own timezone.
 *
 * Formatted by hand rather than through Intl: this is two short strings, and
 * toLocaleTimeString's output varies with the device locale in ways the 56pt
 * column cannot absorb.
 */
function scheduleParts(iso: string | null): { time: string; day: string } {
  if (!iso) return { time: "--", day: "" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { time: "--", day: "" };

  const h24 = d.getHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const time = `${h}:${String(d.getMinutes()).padStart(2, "0")} ${h24 < 12 ? "AM" : "PM"}`;

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((startOfDay(d) - startOfDay(new Date())) / 86_400_000);

  if (days === 0) return { time, day: "Today" };
  if (days === 1) return { time, day: "Tomorrow" };
  if (days > 1 && days < 7) {
    return { time, day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getDay()] };
  }
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return { time, day: `${d.getDate()} ${months[d.getMonth()]}` };
}

/* ── replays ─────────────────────────────────────────────────────────── */

function ReplayRow({ replay, onPress }: { replay: ReplaySpace; onPress: () => void }) {
  const meta = [
    replay.host?.name,
    formatDuration(replay.duration_minutes),
    `${formatCompact(replay.plays)} plays`,
  ].filter(Boolean).join(" · ");

  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.replayRow, pressed && styles.pressed]}>
      <View style={styles.replayTile}>
        <Play size={17} color={colors.white} fill={colors.white} />
      </View>
      <View style={styles.replayText}>
        <Text style={styles.replayTitle} numberOfLines={1}>{replay.title}</Text>
        <Text style={styles.replayMeta} numberOfLines={1}>{meta}</Text>
      </View>
      <ChevronRight size={15} color={SPACE_LIGHT.chevron} strokeWidth={2.2} />
    </Pressable>
  );
}

function formatDuration(minutes: number | null): string | null {
  if (minutes == null || minutes <= 0) return null;
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The live indicator - a dot that actually pulses, so "live" reads as live. */
function PulseDot({ color = colors.brand, size = 6 }: { color?: string; size?: number }) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(v, { toValue: 1, duration: 800, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(v, { toValue: 0, duration: 800, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [v]);
  const opacity = v.interpolate({ inputRange: [0, 1], outputRange: [1, 0.35] });
  const scale = v.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  return (
    <Animated.View
      style={{
        width: size, height: size, borderRadius: size / 2, backgroundColor: color,
        opacity, transform: [{ scale }],
      }}
    />
  );
}

function SectionHeader({ icon: Icon, title }: { icon: typeof AudioLines; title: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Icon size={16} color={colors.brand} strokeWidth={2.3} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );
}

/* ── styles ──────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },

  // header
  header: { backgroundColor: colors.bg },
  headerTop: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingTop: 4, paddingBottom: 12,
  },
  headerText: { flex: 1, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  title: { fontSize: 27, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text, letterSpacing: -0.8 },
  // A plain dot beside the title, not a "N LIVE" pill - the live count already
  // has a real home in the "Live now" chip's own dot.
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: colors.brand },
  subtitle: { paddingHorizontal: spacing.lg, paddingBottom: 12, fontSize: 12.5, color: SPACE_LIGHT.dim },
  headerActions: { flexDirection: "row", gap: spacing.sm, marginLeft: spacing.md },
  iconBtn: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: SPACE_LIGHT.chip,
    alignItems: "center", justifyContent: "center",
  },
  iconBtnOn: { backgroundColor: SPACE_LIGHT.brandWash },
  iconBtnBadge: {
    position: "absolute", top: -2, right: -2, width: 9, height: 9, borderRadius: 5,
    backgroundColor: colors.brand, borderWidth: 2, borderColor: colors.bg,
  },

  chipRow: { gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: 12 },
  chip: {
    height: 34, paddingHorizontal: 14, borderRadius: 8,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: SPACE_LIGHT.chip,
  },
  chipOn: { backgroundColor: colors.brand },
  chipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand },
  chipDotOn: { backgroundColor: colors.white },
  chipText: { fontSize: 13.5, fontWeight: font.weightBold, color: SPACE_LIGHT.text },
  chipTextOn: { color: colors.white },

  content: { paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  // filter banner
  banner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: 4,
    paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 11, backgroundColor: SPACE_LIGHT.brandWash,
  },
  bannerText: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: font.weightBold, color: SPACE_LIGHT.brandInk },
  bannerReset: { fontSize: 11.5, fontWeight: font.weightHeavy, color: colors.brand },

  // start a space
  start: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginHorizontal: spacing.lg, marginTop: 4,
    padding: 14, borderRadius: 14,
  },
  startIcon: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  startText: { flex: 1, minWidth: 0 },
  startTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text, letterSpacing: -0.2 },
  startSub: { marginTop: 3, fontSize: 12, color: "#9a4a63" },

  // sections
  sectionHeader: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: 20, paddingBottom: 10,
  },
  sectionTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text, letterSpacing: -0.2 },

  // live cards - a flat neutral card throughout (no cover art exists, and the
  // design's own render is one plain surface, not a colourful banner).
  liveList: { paddingHorizontal: spacing.lg, gap: 10 },
  showMore: {
    height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center",
    backgroundColor: SPACE_LIGHT.chip,
  },
  showMoreText: { fontSize: 13.5, fontWeight: font.weightBold, color: colors.brand },
  card: { borderRadius: 16, backgroundColor: SPACE_LIGHT.card, padding: 14 },
  cardTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  liveTag: {
    flexDirection: "row", alignItems: "center", gap: 5,
    height: 20, paddingHorizontal: 7, borderRadius: 5, backgroundColor: colors.brand,
  },
  liveTagText: { color: colors.white, fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 0.5 },
  listeningRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  listening: { fontSize: 11.5, fontWeight: font.weightBold, color: SPACE_LIGHT.dim },
  cardTitle: {
    marginTop: 10, fontSize: 16, fontWeight: font.weightHeavy,
    color: SPACE_LIGHT.text, letterSpacing: -0.3, lineHeight: 21,
  },
  cardTopic: { marginTop: 5, fontSize: 12, color: SPACE_LIGHT.dim },
  stackMore: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: SPACE_LIGHT.chip,
    borderWidth: 2, borderColor: SPACE_LIGHT.card, alignItems: "center", justifyContent: "center",
  },
  stackMoreText: { fontSize: 10, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text },
  cardBottom: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  stack: { flexDirection: "row" },
  stackAvatar: {
    width: 30, height: 30, borderRadius: 15,
    borderWidth: 2, borderColor: SPACE_LIGHT.card,
  },
  stackAvatarOverlap: { marginLeft: -10 },
  hostLine: { flex: 1, minWidth: 0, fontSize: 11.5, color: SPACE_LIGHT.dim },
  joinBtn: {
    height: 32, paddingHorizontal: 16, borderRadius: 9,
    alignItems: "center", justifyContent: "center", backgroundColor: colors.brand,
  },
  joinBtnText: { color: colors.white, fontSize: 12.5, fontWeight: font.weightHeavy },

  // scheduled
  group: {
    marginHorizontal: spacing.lg, borderRadius: 14,
    backgroundColor: SPACE_LIGHT.group, paddingVertical: 3,
  },
  schedRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  // A tinted square holding day over time - "SAT" / "8:00 PM".
  schedWhen: {
    width: 58, paddingVertical: 7, borderRadius: 11,
    backgroundColor: SPACE_LIGHT.brandWash, alignItems: "center",
  },
  schedDay: { fontSize: 9.5, fontWeight: font.weightHeavy, color: colors.brand, letterSpacing: 0.5 },
  schedTime: { marginTop: 1, fontSize: 12, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text },
  schedDivider: { width: 1.5, height: 34, borderRadius: 1, backgroundColor: SPACE_LIGHT.line },
  schedText: { flex: 1, minWidth: 0 },
  schedTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: SPACE_LIGHT.text, letterSpacing: -0.1 },
  schedMeta: { marginTop: 3, fontSize: 11.5, color: SPACE_LIGHT.dim },
  schedGoing: { marginTop: 2, fontSize: 11, fontWeight: font.weightBold, color: SPACE_LIGHT.faint },
  remindBtn: {
    flexDirection: "row", alignItems: "center", gap: 5,
    height: 30, paddingHorizontal: 10, borderRadius: 8,
    backgroundColor: colors.white, borderWidth: 1, borderColor: SPACE_LIGHT.line,
  },
  remindBtnOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  remindText: { fontSize: 12, fontWeight: font.weightBold, color: SPACE_LIGHT.text },
  remindTextOn: { color: colors.white },

  // replays
  replayList: { paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  replayRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingVertical: 10 },
  replayTile: {
    width: 46, height: 46, borderRadius: 12, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  replayText: { flex: 1, minWidth: 0 },
  replayTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: SPACE_LIGHT.text, letterSpacing: -0.1 },
  replayMeta: { marginTop: 3, fontSize: 11.5, color: SPACE_LIGHT.dim },

  // loading / empty
  loading: { paddingVertical: spacing.xxl * 2, alignItems: "center" },
  empty: { alignItems: "center", gap: spacing.sm, paddingVertical: spacing.xxl, paddingHorizontal: spacing.xl },
  emptyText: { fontSize: font.sm, color: SPACE_LIGHT.dim, textAlign: "center" },
  emptyAction: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.brand },
});
