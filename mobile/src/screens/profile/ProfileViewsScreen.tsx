import { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Path } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { ds } from "@/theme/design";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { profileApi, type ProfileViewer } from "@/api/profile.api";
import { videoApi } from "@/api/video.api";
import { isNewView, useProfileViewsSeen } from "@/store/profile-views.store";

/**
 * Profile views - the design's `viewersOpen` screen, on GET /profile/views.
 *
 * Two numbers on this page are the server's and are not recomputed here: the
 * headline count, and whether the list is available at all. `enabled: false`
 * is the reciprocal-privacy rule - the backend returns it when your own view
 * privacy is "private", because someone who browses invisibly does not get to
 * see who browsed them. That is the state the design's footnote describes, so
 * it is rendered as the whole page rather than as a note under an empty list.
 *
 * Departures from the prototype, both because the data does not exist:
 *   - the window is the backend's SEVEN days, not the mockup's thirty
 *     (ProfileController::profileViews → now()->subDays(7))
 *   - the "+x% vs last month" line is dropped; there is no previous-period
 *     figure in the payload and inventing one would be a made-up statistic
 * The daily chart is real, but only drawn once the whole list is loaded -
 * built from a partial page it would understate its own most recent bars.
 */

const DAY_MS = 86_400_000;
/** The backend's own window - keep in step with profileViews()'s subDays(7). */
const WINDOW_DAYS = 7;

type Tab = "All viewers" | "New" | "Not following back";
const TABS: Tab[] = ["All viewers", "New", "Not following back"];

function BackGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GearGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={ds.text} strokeWidth={1.9} />
      <Path
        d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
        stroke={ds.text}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

function InfoGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9.5} stroke={ds.textMuted} strokeWidth={1.9} />
      <Path d="M12 16v-4.5M12 8h.01" stroke={ds.textMuted} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function EyeOffGlyph() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none">
      <Path
        d="M10.7 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4 9.9 6.7a1 1 0 0 1 0 .6 12 12 0 0 1-2.3 3.4M6.6 6.6A12.4 12.4 0 0 0 2.1 11.7a1 1 0 0 0 0 .6C3 15 7 19 12 19a10.9 10.9 0 0 0 4.6-1"
        stroke={ds.textMuted}
        strokeWidth={1.8}
        strokeLinecap="round"
      />
      <Path d="m3 3 18 18" stroke={ds.textMuted} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** "3 hours ago" / "Tuesday" - the row's secondary line. */
function ago(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60_000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days}d ago`;
}

/** Midnight-aligned day index, so "today" means the calendar day. */
function dayStart(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function groupLabel(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "EARLIER";
  const diff = dayStart(Date.now()) - dayStart(t);
  if (diff <= 0) return "TODAY";
  if (diff <= DAY_MS) return "YESTERDAY";
  return "EARLIER THIS WEEK";
}

function Row({
  v,
  isNew,
  following,
  busy,
  onFollow,
  onOpen,
}: {
  v: ProfileViewer;
  isNew: boolean;
  following: boolean;
  busy: boolean;
  onFollow: () => void;
  onOpen: () => void;
}) {
  const times = v.view_count > 1 ? ` · Viewed ${v.view_count} times` : "";
  return (
    <View style={styles.row}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open @${v.username}`}>
        <View style={styles.avatarWrap}>
          {v.avatar ? (
            <Image source={{ uri: v.avatar }} style={styles.avatar} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.avatar, styles.avatarFallback]}>
              <Text style={styles.avatarInitial}>{(v.name || v.username || "?").charAt(0).toUpperCase()}</Text>
            </View>
          )}
          {isNew && <View style={styles.newDot} />}
        </View>
      </Pressable>

      <Pressable style={styles.rowText} onPress={onOpen} accessibilityRole="button">
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>
            {v.name || v.username}
          </Text>
          {v.is_verified && <VerifiedBadge size={13} />}
        </View>
        <Text style={styles.meta} numberOfLines={1}>
          {ago(v.viewed_at)}
          {times}
          {v.is_mutual ? " · Follows you" : ""}
        </Text>
      </Pressable>

      <Pressable
        onPress={onFollow}
        disabled={busy || following}
        accessibilityRole="button"
        accessibilityState={{ selected: following }}
        style={[styles.followBtn, following && styles.followBtnOn]}
      >
        {busy ? (
          <ActivityIndicator size="small" color={following ? ds.text : ds.onDark} />
        ) : (
          <Text style={[styles.followText, following && styles.followTextOn]}>
            {following ? "Following" : "Follow"}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

export function ProfileViewsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("All viewers");
  const [followed, setFollowed] = useState<Record<number, boolean>>({});
  const [busy, setBusy] = useState<Record<number, boolean>>({});

  /* The dots have to be worked out against the PREVIOUS visit, so the boundary
     is captured on mount and only then pushed forward - marking first would
     clear every dot before the page that shows them has rendered. */
  const lastSeenAt = useProfileViewsSeen((s) => s.lastSeenAt);
  const hydrated = useProfileViewsSeen((s) => s.hydrated);
  const [boundary, setBoundary] = useState<string | null>(null);
  const [boundaryReady, setBoundaryReady] = useState(false);

  useEffect(() => {
    void useProfileViewsSeen.getState().hydrate();
  }, []);

  useEffect(() => {
    if (!hydrated || boundaryReady) return;
    setBoundary(lastSeenAt);
    setBoundaryReady(true);
    useProfileViewsSeen.getState().markSeen();
  }, [hydrated, boundaryReady, lastSeenAt]);

  const q = useInfiniteQuery({
    // "list", not a bare ["profile-views"]: the profile header reads the same
    // endpoint with a plain useQuery for its three faces and a count. An
    // infinite query's cache entry is {pages, pageParams} and a plain one's is
    // the page itself, so sharing a key hands one observer the other's shape -
    // which crashed here, in getNextPageParam, on `pages.length` of undefined.
    queryKey: ["profile-views", "list"],
    queryFn: ({ pageParam }) => profileApi.profileViews(pageParam as string | null),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
    staleTime: 30_000,
  });

  const pages = q.data?.pages ?? [];
  const enabled = pages[0]?.enabled ?? true;
  const total = pages[0]?.count ?? 0;
  const viewers = useMemo(() => pages.flatMap((p) => p.viewers), [pages]);
  /** Only true once every page is in - the chart depends on it. */
  const complete = !q.hasNextPage && pages.length > 0;

  const isFollowing = useCallback(
    (v: ProfileViewer) => followed[v.id] ?? v.is_following,
    [followed],
  );

  const follow = useCallback(
    (v: ProfileViewer) => {
      if (busy[v.id] || isFollowing(v)) return;
      setBusy((b) => ({ ...b, [v.id]: true }));
      videoApi
        .follow(v.username)
        .then(() => setFollowed((f) => ({ ...f, [v.id]: true })))
        .catch(() => {})
        .finally(() => setBusy((b) => ({ ...b, [v.id]: false })));
    },
    [busy, isFollowing],
  );

  const openProfile = useCallback(
    (username: string) => navigation.navigate("UserProfile", { username }),
    [navigation],
  );

  const shown = useMemo(() => {
    if (tab === "New") return viewers.filter((v) => isNewView(v.viewed_at, boundary));
    if (tab === "Not following back") return viewers.filter((v) => !isFollowing(v));
    return viewers;
  }, [tab, viewers, boundary, isFollowing]);

  /** Rows in the design's dated sections, order preserved (newest first). */
  const groups = useMemo(() => {
    const out: { label: string; items: ProfileViewer[] }[] = [];
    for (const v of shown) {
      const label = groupLabel(v.viewed_at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(v);
      else out.push({ label, items: [v] });
    }
    return out;
  }, [shown]);

  /** One bar per day across the backend's window, from real view stamps. */
  const bars = useMemo(() => {
    if (!complete) return null;
    const today = dayStart(Date.now());
    const counts = Array.from({ length: WINDOW_DAYS }, () => 0);
    for (const v of viewers) {
      const t = Date.parse(v.viewed_at);
      if (!Number.isFinite(t)) continue;
      const idx = WINDOW_DAYS - 1 - Math.round((today - dayStart(t)) / DAY_MS);
      if (idx >= 0 && idx < WINDOW_DAYS) counts[idx] += 1;
    }
    const peak = Math.max(...counts, 1);
    return counts.map((c, i) => ({
      pct: Math.max(8, Math.round((c / peak) * 100)),
      // The design colours by RECENCY, not by value: the run of bars nearest
      // today is the accent, everything behind it is the quiet wash. A zero day
      // still draws its stub, so the row reads as a timeline rather than a
      // gap-toothed set of columns.
      recent: i >= WINDOW_DAYS - 3,
    }));
  }, [complete, viewers]);

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityRole="button" accessibilityLabel="Back">
          <BackGlyph />
        </Pressable>
        <Text style={styles.title}>Profile views</Text>
        <Pressable
          onPress={() => navigation.navigate("SettingsShell", { screen: "PrivacySafety" })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="View settings"
        >
          <GearGlyph />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 34 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={q.isRefetching && !q.isFetchingNextPage} onRefresh={q.refetch} tintColor={ds.textMuted} />
        }
      >
        {q.isLoading && (
          <View style={styles.center}>
            <ActivityIndicator color={ds.accent} />
          </View>
        )}

        {/* The reciprocal-privacy rule, as its own state. Browsing invisibly is
            a trade: you also stop being told who looked at you. */}
        {!q.isLoading && !enabled && (
          <View style={styles.blocked}>
            <EyeOffGlyph />
            <Text style={styles.blockedTitle}>Your view history is off</Text>
            <Text style={styles.blockedBody}>
              You&apos;re browsing profiles invisibly, so Teezer doesn&apos;t show you who viewed yours. Turn view
              history back on to see this list.
            </Text>
            <Pressable
              style={styles.blockedBtn}
              onPress={() => navigation.navigate("SettingsShell", { screen: "PrivacySafety" })}
              accessibilityRole="button"
            >
              <Text style={styles.blockedBtnText}>Open privacy settings</Text>
            </Pressable>
          </View>
        )}

        {!q.isLoading && enabled && (
          <>
            <View style={styles.summary}>
              <Text style={styles.count}>{total}</Text>
              <Text style={styles.countSub}>profile views in the last {WINDOW_DAYS} days</Text>
            </View>

            {!!bars && (
              <>
                <View style={styles.chart}>
                  {bars.map((b, i) => (
                    <View key={i} style={styles.barCol}>
                      <View
                        style={[
                          styles.bar,
                          { height: `${b.pct}%`, backgroundColor: b.recent ? ds.accent : ds.accentWash },
                        ]}
                      />
                    </View>
                  ))}
                </View>
                <View style={styles.chartAxis}>
                  <Text style={styles.axisLabel}>{WINDOW_DAYS} days ago</Text>
                  <Text style={styles.axisLabel}>Today</Text>
                </View>
              </>
            )}

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.tabsRow}
            >
              {TABS.map((t) => {
                const on = t === tab;
                return (
                  <Pressable
                    key={t}
                    onPress={() => setTab(t)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    style={[styles.tab, on && styles.tabOn]}
                  >
                    <Text style={[styles.tabText, on && styles.tabTextOn]}>{t}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {groups.map((g) => (
              <View key={g.label} style={{ paddingTop: 8 }}>
                <Text style={styles.groupLabel}>{g.label}</Text>
                {g.items.map((v) => (
                  <Row
                    key={v.id}
                    v={v}
                    isNew={isNewView(v.viewed_at, boundary)}
                    following={isFollowing(v)}
                    busy={!!busy[v.id]}
                    onFollow={() => follow(v)}
                    onOpen={() => openProfile(v.username)}
                  />
                ))}
              </View>
            ))}

            {shown.length === 0 && (
              <View style={styles.center}>
                <Text style={styles.emptyTitle}>
                  {tab === "All viewers" ? "No views yet" : "Nothing here"}
                </Text>
                <Text style={styles.emptyBody}>
                  {tab === "All viewers"
                    ? `People who open your profile in the next ${WINDOW_DAYS} days will show up here.`
                    : "No viewers match this filter."}
                </Text>
              </View>
            )}

            {q.hasNextPage && (
              <Pressable
                onPress={() => q.fetchNextPage()}
                disabled={q.isFetchingNextPage}
                style={styles.more}
                accessibilityRole="button"
              >
                {q.isFetchingNextPage ? (
                  <ActivityIndicator size="small" color={ds.accent} />
                ) : (
                  <Text style={styles.moreText}>Show more</Text>
                )}
              </Pressable>
            )}

            <View style={styles.note}>
              <InfoGlyph />
              <Text style={styles.noteText}>
                Viewers only appear while your own view history is on. Turn it off and you&apos;ll stop seeing who
                viewed you.
              </Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: ds.lineSoft,
  },
  title: { flex: 1, fontSize: 15.5, fontWeight: "700", color: ds.text },

  center: { paddingVertical: 46, alignItems: "center", gap: 6, paddingHorizontal: 30 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: ds.text },
  emptyBody: { fontSize: 12.5, color: ds.textMuted, textAlign: "center", lineHeight: 18 },

  summary: { paddingHorizontal: 16, paddingTop: 18, paddingBottom: 4, gap: 3 },
  count: { fontSize: 34, fontWeight: "800", color: ds.text, letterSpacing: -1, lineHeight: 38 },
  countSub: { fontSize: 13, color: ds.textMuted },

  chart: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 86, paddingHorizontal: 16, paddingTop: 18 },
  barCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  // Rounded on all four corners, as the design draws them - a stub day then
  // reads as a rounded tick rather than a clipped rectangle.
  bar: { width: "100%", borderRadius: 4, minHeight: 6 },
  chartAxis: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 8 },
  axisLabel: { fontSize: 11, color: ds.silver },

  tabsRow: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 18, paddingBottom: 6 },
  tab: { paddingHorizontal: 14, height: 32, borderRadius: 999, backgroundColor: ds.surfaceSunken, alignItems: "center", justifyContent: "center" },
  tabOn: { backgroundColor: ds.text },
  tabText: { fontSize: 12.5, fontWeight: "600", color: ds.textDim },
  tabTextOn: { color: ds.onDark },

  groupLabel: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    fontSize: 12,
    fontWeight: "700",
    color: ds.textMuted,
    letterSpacing: 1,
  },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 11 },
  avatarWrap: { width: 48, height: 48 },
  avatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: ds.surfaceSunken },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: ds.accent },
  avatarInitial: { color: ds.onDark, fontSize: 19, fontWeight: "800" },
  newDot: {
    position: "absolute",
    right: -1,
    bottom: -1,
    width: 14,
    height: 14,
    borderRadius: 999,
    backgroundColor: ds.accent,
    borderWidth: 2,
    borderColor: ds.surface,
  },
  rowText: { flex: 1, gap: 3, minWidth: 0 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: 14, fontWeight: "600", color: ds.text, flexShrink: 1 },
  meta: { fontSize: 12.5, color: ds.textMuted },

  followBtn: {
    minWidth: 84,
    height: 34,
    borderRadius: 9,
    paddingHorizontal: 12,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  followBtnOn: { backgroundColor: ds.surfaceAlt2 },
  followText: { fontSize: 12.5, fontWeight: "700", color: ds.onDark },
  followTextOn: { color: ds.textDim },

  more: { alignItems: "center", paddingVertical: 14 },
  moreText: { fontSize: 13, fontWeight: "700", color: ds.accent },

  note: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 11,
    backgroundColor: ds.surfaceMuted,
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 12,
  },
  noteText: { flex: 1, fontSize: 12.5, color: ds.textDim, lineHeight: 18 },

  blocked: { alignItems: "center", gap: 10, paddingHorizontal: 34, paddingTop: 54 },
  blockedTitle: { fontSize: 15.5, fontWeight: "700", color: ds.text, marginTop: 4 },
  blockedBody: { fontSize: 13, color: ds.textMuted, textAlign: "center", lineHeight: 19 },
  blockedBtn: {
    marginTop: 8,
    height: 42,
    paddingHorizontal: 20,
    borderRadius: 999,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  blockedBtnText: { fontSize: 13.5, fontWeight: "700", color: ds.onDark },
});
