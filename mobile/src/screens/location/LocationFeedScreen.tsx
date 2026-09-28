import { useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { locationApi } from "@/api/location.api";
import { usePostViewer } from "@/store/post-viewer.store";
import { useAuthStore } from "@/store/auth.store";
import type { Video } from "@/types";

/**
 * A place, and everything posted from it.
 *
 * Opened by the location chip on a post, from the feed or the profile viewer.
 * Every number here is a live count from GET /locations/{slug}/videos - posts,
 * views and creators come back on that response's `location` header, so the
 * design's stat row needed no new endpoint.
 *
 * Tapping a tile opens the existing post viewer (usePostViewer.showVideo), the
 * same single-reel path a /video/{id} deep link uses. No second viewer was
 * built for this.
 *
 * Palette and metrics follow the supplied design (#F42B5B, not the app's own
 * #fe2c55) rather than the shared tokens, matching how the onboarding flow was
 * built from its own design.
 */

const C = {
  accent: "#F42B5B",
  ink: "#121014",
  body: "#4A4653",
  muted: "#8A8592",
  hint: "#B6B1BE",
  line: "#F4F2F5",
  chip: "#F4F2F5",
  blob: "#FDECF1",
  white: "#fff",
  arrow: "#C7C2CE",
};

type Tab = "top" | "recent" | "about";

/** 2.4K / 1.8M, as the design shows them. */
function compact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1) + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1) + "K";
  return String(n ?? 0);
}

function hourLabel(h: number): string {
  const to12 = (x: number) => `${x % 12 === 0 ? 12 : x % 12}${x < 12 ? " AM" : " PM"}`;
  return `${to12(h)}–${to12((h + 3) % 24)}`;
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{compact(value)}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function AboutRow({ icon, title, sub }: { icon: string; title: string; sub: string }) {
  return (
    <View style={styles.aboutRow}>
      <View style={styles.aboutTile}><Ionicons name={icon as never} size={16} color={C.ink} /></View>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text style={styles.aboutTitle} numberOfLines={1}>{title}</Text>
        <Text style={styles.aboutSub} numberOfLines={1}>{sub}</Text>
      </View>
    </View>
  );
}

export function LocationFeedScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const slug: string = route.params?.slug ?? "";
  const fallbackName: string = route.params?.name ?? "";
  const isAuthed = useAuthStore((s) => s.status === "authenticated");

  const [tab, setTab] = useState<Tab>("top");

  // "Top" and "Recent" are the same endpoint with a different sort, so they are
  // separate cache entries and switching back is instant rather than refetching.
  const sort = tab === "recent" ? "recent" : "popular";

  const query = useInfiniteQuery({
    queryKey: ["location-videos", slug, sort],
    queryFn: ({ pageParam = 1 }) => locationApi.videos(slug, pageParam, { sort }),
    getNextPageParam: (last, pages) => (last.meta.next_page_url ? pages.length + 1 : undefined),
    initialPageParam: 1,
    enabled: !!slug && tab !== "about",
  });

  // Only fetched once About is actually opened - most visitors never do.
  const about = useQuery({
    queryKey: ["location-about", slug],
    queryFn: () => locationApi.about(slug),
    enabled: !!slug && tab === "about",
  });
  const nearby = useQuery({
    queryKey: ["location-nearby-places", slug],
    queryFn: () => locationApi.nearbyPlaces(slug),
    enabled: !!slug && tab === "about",
  });

  const pages = query.data?.pages ?? [];
  const header = pages[0]?.location ?? null;
  const videos: Video[] = pages.flatMap((p) => p.data);
  const name = header?.name || fallbackName || "Location";

  return (
    <View style={styles.root}>
      {/* Header */}
      <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={17} color={C.ink} />
        </Pressable>
        <Text style={styles.topBarTitle} numberOfLines={1}>Location</Text>
        <Pressable
          onPress={() => navigation.navigate("Main", { screen: "Home" })}
          hitSlop={10}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Share this place"
        >
          <Ionicons name="share-outline" size={16} color={C.ink} />
        </Pressable>
      </View>

      <ScrollView
        style={styles.flex}
        contentContainerStyle={{ paddingBottom: 40 + insets.bottom }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={({ nativeEvent: e }) => {
          if (tab === "about") return;
          const nearEnd = e.layoutMeasurement.height + e.contentOffset.y >= e.contentSize.height - 400;
          if (nearEnd && query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
      >
        {/* Place */}
        <View style={styles.placeRow}>
          <View style={styles.placeIcon}>
            <Ionicons name="location-outline" size={22} color={C.accent} />
          </View>
          <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
            <Text style={styles.placeName}>{name}</Text>
            {!!header?.region && <Text style={styles.placeRegion} numberOfLines={1}>{header.region}</Text>}
          </View>
        </View>

        {/* Real counts, straight off the videos response - no separate call. */}
        <View style={styles.statsRow}>
          <Stat value={header?.posts_count ?? 0} label="posts" />
          <Stat value={header?.views_count ?? 0} label="views" />
          <Stat value={header?.creators_count ?? 0} label="creators" />
        </View>

        <View style={styles.ctaWrap}>
          <Pressable
            style={styles.cta}
            accessibilityRole="button"
            onPress={() => navigation.navigate(isAuthed ? "PostCamera" : "Login")}
          >
            <Text style={styles.ctaTxt}>Post from here</Text>
          </Pressable>
        </View>

        {/* Tabs */}
        <View style={styles.tabs}>
          {(["top", "recent", "about"] as Tab[]).map((t) => (
            <Pressable key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabOn]} accessibilityRole="button">
              <Text style={[styles.tabTxt, tab === t && styles.tabTxtOn]}>
                {t === "top" ? "Top" : t === "recent" ? "Recent" : "About"}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Grid ── */}
        {tab !== "about" && (
          <View style={styles.gridWrap}>
            {query.isLoading ? (
              <ActivityIndicator style={{ marginTop: 40 }} color={C.accent} />
            ) : videos.length === 0 ? (
              <Text style={styles.empty}>No posts from here yet.</Text>
            ) : (
              <View style={styles.grid}>
                {videos.map((v, i) => (
                  <Pressable
                    key={v.id}
                    style={styles.tile}
                    accessibilityRole="button"
                    accessibilityLabel={`Open post with ${compact(v.views_count ?? 0)} views`}
                    onPress={() => usePostViewer.getState().showVideo(v.id)}
                  >
                    {v.thumbnail_url ? (
                      <Image source={{ uri: v.thumbnail_url }} style={styles.tileImg} contentFit="cover" transition={120} />
                    ) : (
                      <View style={[styles.tileImg, { backgroundColor: C.chip }]} />
                    )}
                    {/* Only on the single most-viewed post, and only under Top -
                        under Recent the first tile is merely the newest. */}
                    {tab === "top" && i === 0 && (
                      <View style={styles.topBadge}><Text style={styles.topBadgeTxt}>TOP</Text></View>
                    )}
                    <View style={styles.playPill}>
                      <Ionicons name="play" size={9} color={C.white} />
                      <Text style={styles.playTxt}>{compact(v.views_count ?? 0)}</Text>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}

            {query.hasNextPage && (
              <Pressable
                onPress={() => void query.fetchNextPage()}
                style={styles.loadMore}
                disabled={query.isFetchingNextPage}
                accessibilityRole="button"
              >
                {query.isFetchingNextPage
                  ? <ActivityIndicator size="small" color={C.body} />
                  : <Text style={styles.loadMoreTxt}>Load more</Text>}
              </Pressable>
            )}
          </View>
        )}

        {/* ── About ── */}
        {tab === "about" && (
          <View style={styles.aboutWrap}>
            {about.isLoading || nearby.isLoading ? (
              <ActivityIndicator style={{ marginTop: 30 }} color={C.accent} />
            ) : (
              <>
                {!!header && (
                  <Text style={styles.aboutIntro}>
                    Creators have shared {compact(header.posts_count)} posts from {header.name}
                    {header.creators_count ? ` across ${compact(header.creators_count)} accounts` : ""}.
                  </Text>
                )}

                <View>
                  {/* Every row is omitted rather than faked when the data is
                      not there - a place with no hashtags shows no topics. */}
                  {!!about.data?.peak_hour && (
                    <AboutRow
                      icon="time-outline"
                      title="Most posts uploaded"
                      sub={`${hourLabel(about.data.peak_hour.hour)} · ${about.data.peak_hour.posts} posts`}
                    />
                  )}
                  {!!about.data?.top_topics?.length && (
                    <AboutRow
                      icon="pricetags-outline"
                      title="Top topics"
                      sub={about.data.top_topics.map((t) => `#${t}`).join(" · ")}
                    />
                  )}
                  {!!about.data?.busiest_month && (
                    <AboutRow
                      icon="calendar-outline"
                      title="Busiest month"
                      sub={`${about.data.busiest_month.label} · ${about.data.busiest_month.posts} posts`}
                    />
                  )}
                </View>

                {!!nearby.data?.length && (
                  <>
                    <Text style={styles.sectionLabel}>NEARBY PLACES</Text>
                    <View>
                      {nearby.data.map((p) => (
                        <Pressable
                          key={p.slug}
                          style={styles.nearbyRow}
                          accessibilityRole="button"
                          onPress={() => navigation.push("LocationFeed", { slug: p.slug, name: p.name })}
                        >
                          <View style={styles.nearbyTile}>
                            <Ionicons name="location-outline" size={16} color={C.body} />
                          </View>
                          <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                            <Text style={styles.nearbyName} numberOfLines={1}>{p.name}</Text>
                            <Text style={styles.nearbySub} numberOfLines={1}>{compact(p.posts_count)} posts</Text>
                          </View>
                          <Ionicons name="chevron-forward" size={15} color={C.arrow} />
                        </Pressable>
                      ))}
                    </View>
                  </>
                )}
              </>
            )}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.white },
  flex: { flex: 1 },

  topBar: {
    flexDirection: "row", alignItems: "center", gap: 11,
    paddingHorizontal: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: C.line,
  },
  circleBtn: { width: 36, height: 36, borderRadius: 999, backgroundColor: C.chip, alignItems: "center", justifyContent: "center" },
  topBarTitle: { flex: 1, fontSize: 13, fontWeight: "700", color: C.muted, letterSpacing: -0.1 },

  placeRow: { flexDirection: "row", gap: 13, alignItems: "flex-start", paddingHorizontal: 18, paddingTop: 18 },
  placeIcon: { width: 46, height: 46, borderRadius: 14, backgroundColor: C.blob, alignItems: "center", justifyContent: "center" },
  placeName: { fontSize: 19, fontWeight: "800", color: C.ink, letterSpacing: -0.55, lineHeight: 24 },
  placeRegion: { fontSize: 12.5, color: C.muted },

  statsRow: { flexDirection: "row", alignItems: "center", gap: 16, paddingHorizontal: 18, paddingTop: 14 },
  stat: { flexDirection: "row", alignItems: "baseline", gap: 5 },
  statValue: { fontSize: 14, fontWeight: "800", color: C.ink, letterSpacing: -0.4 },
  statLabel: { fontSize: 11, color: C.muted },

  ctaWrap: { paddingHorizontal: 18, paddingTop: 16 },
  cta: { height: 44, borderRadius: 12, backgroundColor: C.accent, alignItems: "center", justifyContent: "center" },
  ctaTxt: { fontSize: 13.5, fontWeight: "800", color: C.white },

  tabs: { flexDirection: "row", gap: 20, paddingHorizontal: 18, paddingTop: 18, borderBottomWidth: 1, borderBottomColor: C.line },
  tab: { paddingTop: 13, paddingBottom: 11, borderBottomWidth: 2.5, borderBottomColor: "transparent", marginBottom: -1 },
  tabOn: { borderBottomColor: C.accent },
  tabTxt: { fontSize: 13.5, fontWeight: "600", color: C.muted, letterSpacing: -0.2 },
  tabTxtOn: { fontWeight: "800", color: C.ink },

  gridWrap: { paddingHorizontal: 18, paddingTop: 12, gap: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 5 },
  // Three across with two 5pt gaps: (100% - 10) / 3.
  tile: { width: "31.9%", aspectRatio: 9 / 14, borderRadius: 10, overflow: "hidden", backgroundColor: C.chip },
  tileImg: { width: "100%", height: "100%" },
  topBadge: { position: "absolute", top: 6, left: 6, paddingHorizontal: 6, paddingVertical: 3, borderRadius: 5, backgroundColor: C.accent },
  topBadgeTxt: { fontSize: 8, fontWeight: "800", letterSpacing: 0.4, color: C.white },
  playPill: {
    position: "absolute", left: 6, bottom: 6, flexDirection: "row", alignItems: "center", gap: 3,
    paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6, backgroundColor: "rgba(10,9,12,0.55)",
  },
  playTxt: { fontSize: 9.5, fontWeight: "700", color: C.white },

  loadMore: { alignSelf: "center", borderRadius: 999, backgroundColor: C.chip, paddingVertical: 11, paddingHorizontal: 22, marginTop: 4 },
  loadMoreTxt: { fontSize: 12.5, fontWeight: "700", color: C.body },
  empty: { textAlign: "center", color: C.muted, fontSize: 13, paddingVertical: 40 },

  aboutWrap: { paddingHorizontal: 18, paddingTop: 16, gap: 18 },
  aboutIntro: { fontSize: 13, color: C.body, lineHeight: 21 },
  aboutRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  aboutTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: C.chip, alignItems: "center", justifyContent: "center" },
  aboutTitle: { fontSize: 12.5, fontWeight: "700", color: C.ink },
  aboutSub: { fontSize: 11.5, color: C.muted },

  sectionLabel: { fontSize: 11, fontWeight: "800", letterSpacing: 1.3, color: C.hint },
  nearbyRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.line },
  nearbyTile: { width: 34, height: 34, borderRadius: 11, backgroundColor: C.chip, alignItems: "center", justifyContent: "center" },
  nearbyName: { fontSize: 13, fontWeight: "700", color: C.ink },
  nearbySub: { fontSize: 11.5, color: C.muted },
});
