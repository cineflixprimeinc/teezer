import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  InteractionManager,
  FlatList,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { searchApi, MIN_QUERY_LENGTH } from "@/api/search.api";
import { videoApi } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { usePostViewer } from "@/store/post-viewer.store";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import { KnowledgeCard } from "@/components/KnowledgeCard";

/**
 * Search - GET /search, the backend's Meilisearch proxy.
 *
 * Public, so it works signed-out. The query is DEBOUNCED (250ms) rather than
 * fired per keystroke: the endpoint is throttled at 60/min, and a fast typist
 * would exhaust that in a few seconds and start getting 429s mid-word.
 *
 * Recent searches are stored on the device. They are a local convenience, not
 * an account feature - there is no recents endpoint, and syncing what someone
 * typed into a search box is not something to invent silently.
 */

const RECENTS_KEY = "teezer:search:recents";
const MAX_RECENTS = 8;
const HAIRLINE = "#EFECF1";
const FILL = "#F1EFF3";
const TABS = ["Top", "Videos", "Creators", "Sounds", "Hashtags"] as const;
type Tab = (typeof TABS)[number];

function BackGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function MagnifierGlyph({ c = ds.textMuted, s = 16 }: { c?: string; s?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={c} strokeWidth={2.4} />
      <Path d="M15.6 15.6L21 21" stroke={c} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function ClockGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={ds.textMuted} strokeWidth={1.9} />
      <Path d="M12 7.5V12l3 1.8" stroke={ds.textMuted} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function XGlyph({ c = "#fff", s = 11 }: { c?: string; s?: number }) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="m18 6-12 12M6 6l12 12" stroke={c} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

function PlayCountGlyph() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M6 4l14 8-14 8z" fill="#fff" />
    </Svg>
  );
}

function compact(n?: number) {
  const v = n ?? 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1000) return `${(v / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(v);
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

export function SearchScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const { width } = useWindowDimensions();

  const [raw, setRaw] = useState("");
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<Tab>("Top");
  const [recents, setRecents] = useState<string[]>([]);
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const inputRef = useRef<TextInput>(null);

  /**
   * Focus AFTER the screen transition, not during it.
   *
   * `autoFocus` raises the keyboard on mount, so the keyboard animation and the
   * navigation animation run at the same time and fight for the main thread -
   * which is what made opening search feel slow. Waiting for interactions to
   * settle costs a few frames and removes the stall entirely.
   */
  useEffect(() => {
    const task = InteractionManager.runAfterInteractions(() => inputRef.current?.focus());
    return () => task.cancel();
  }, []);

  const has = raw.trim().length > 0;

  // Debounce. The endpoint is throttled 60/min - one request per keystroke
  // would 429 a fast typist mid-word.
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
    if (!t) return;
    setRecents((prev) => {
      const next = [t, ...prev.filter((p) => p !== t)].slice(0, MAX_RECENTS);
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

  const type =
    tab === "Creators" ? "users"
    : tab === "Videos" ? "videos"
    : tab === "Sounds" ? "sounds"
    : tab === "Hashtags" ? "hashtags"
    : "all";

  const trending = useQuery({
    queryKey: ["trending-hashtags"],
    queryFn: () => searchApi.trendingHashtags(),
    enabled: !has,
    staleTime: 30 * 60_000,
  });

  // Short queries are never sent. The endpoint rejects them with a 422, and this
  // screen renders any error as "Search is unavailable" - so asking anyway made
  // a single typed character look like a search outage.
  /**
   * Hashtag mode: a leading "#", either typed or set by tapping a tag row.
   *
   * The tag itself is searched WITHOUT the hash (tags are stored bare, so
   * "#food" matches nothing), while the "#" is what tells this screen to also
   * ask the real tag endpoint for everything filed under it.
   */
  const isTag = q.startsWith("#");
  const term = q.replace(/^#/, "");
  const tooShort = term.length > 0 && term.length < MIN_QUERY_LENGTH;

  const results = useQuery({
    queryKey: ["search", term, type],
    queryFn: () => searchApi.query(term, type),
    enabled: term.length >= MIN_QUERY_LENGTH,
    staleTime: 60_000,
    retry: 1,
  });

  /**
   * Videos filed under the tag. Runs alongside the text search rather than
   * instead of it, so a hashtag still surfaces creators and sounds.
   */
  const tagVideos = useQuery({
    queryKey: ["hashtag-videos", term],
    queryFn: () => searchApi.hashtagVideos(term),
    enabled: isTag && term.length >= MIN_QUERY_LENGTH,
    staleTime: 60_000,
  });

  const toggleFollow = useCallback(
    (username: string, current?: boolean) => {
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => toggleFollow(username, current));
        return;
      }
      const now = followMap[username] ?? !!current;
      setFollowMap((m) => ({ ...m, [username]: !now }));
      (now ? videoApi.unfollow(username) : videoApi.follow(username)).catch(() =>
        setFollowMap((m) => ({ ...m, [username]: now })),
      );
    },
    [followMap],
  );

  const cell = (width - 42) / 2;
  const users = results.data?.users ?? [];
  /**
   * The tag's own videos win when it returned any; otherwise fall back to the
   * text match. `video_hashtags` is not populated for every post yet, so the
   * tag endpoint can answer empty for a tag that plainly has content - falling
   * back means a hashtag search still shows something instead of going blank,
   * and it upgrades by itself once that data is backfilled.
   */
  const videos = (isTag && (tagVideos.data?.length ?? 0) > 0)
    ? (tagVideos.data ?? [])
    : (results.data?.videos ?? []);
  const sounds = results.data?.sounds ?? [];
  const hashtags = results.data?.hashtags ?? [];
  const nothing = term.length >= MIN_QUERY_LENGTH && !results.isLoading && !results.isError
    && users.length === 0 && videos.length === 0 && sounds.length === 0 && hashtags.length === 0;

  /** Open one reel full-screen. The viewer is a layer above the navigator, not a
   *  route, so this is a store call rather than a navigation push. */
  const openVideo = useCallback((id: number) => {
    remember(q);
    usePostViewer.getState().showVideo(id);
  }, [q, remember]);

  /** Search the tag itself. There is no Hashtag screen registered - the route is
   *  declared in navigation/types but never mounted - so this re-queries instead
   *  of pushing one. The name is already bare, so the query actually matches. */
  const openHashtag = useCallback((name: string) => {
    // Keep the "#" - it is what puts the screen into tag mode, and it is
    // stripped again before either request goes out.
    setRaw(`#${name.replace(/^#/, "")}`);
    setTab("Top");
  }, []);

  const videoGrid = (
    <View style={styles.grid}>
      {videos.map((v) => (
        <Pressable
          key={v.id}
          style={{ width: cell }}
          accessibilityRole="button"
          onPress={() => openVideo(v.id)}
        >
          <View style={[styles.tile, { width: cell, height: cell * 1.5 }]}>
            {v.thumbnail_url ? (
              <Image source={{ uri: v.thumbnail_url }} style={styles.tileFill} contentFit="cover" transition={120} />
            ) : (
              <View style={[styles.tileFill, styles.tilePlaceholder]} />
            )}
            <View style={styles.playCount}>
              <PlayCountGlyph />
              <Text style={styles.playCountText}>{compact(v.views_count)}</Text>
            </View>
          </View>
          {!!(v.caption || v.title) && (
            <Text style={styles.tileCaption} numberOfLines={2}>
              {v.caption || v.title}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.searchRow, { paddingTop: insets.top + 8 }]}>
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Back" onPress={() => navigation.goBack()}>
          <BackGlyph />
        </Pressable>

        <View style={styles.field}>
          <MagnifierGlyph />
          <TextInput
            value={raw}
            onChangeText={setRaw}
            placeholder="Search Teezer"
            placeholderTextColor={ds.textMuted}
            style={styles.input}
            ref={inputRef}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
            onSubmitEditing={() => remember(raw)}
          />
          {has && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear"
              onPress={() => setRaw("")}
              style={styles.clear}
            >
              <XGlyph />
            </Pressable>
          )}
        </View>

        <Pressable accessibilityRole="button" hitSlop={8} onPress={() => remember(raw)}>
          <Text style={styles.searchBtn}>Search</Text>
        </Pressable>
      </View>

      {!has ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.pad}
        >
          {recents.length > 0 && (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.blockTitle}>Recent</Text>
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
                  <ClockGlyph />
                  <Pressable style={{ flex: 1 }} accessibilityRole="button" onPress={() => setRaw(t)}>
                    <Text style={styles.recentText} numberOfLines={1}>
                      {t}
                    </Text>
                  </Pressable>
                  <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel={`Remove ${t}`} onPress={() => forget(t)}>
                    <XGlyph c={ds.textMuted} s={13} />
                  </Pressable>
                </View>
              ))}
            </>
          )}

          {/* Placeholder rows while the first fetch lands. The list is a fixed
              shape, so reserving its space stops the panel jumping when data
              arrives - and stops an empty screen reading as "slow". */}
          {trending.isLoading && (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.blockTitle}>You may like</Text>
              </View>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <View key={i} style={styles.trendRow}>
                  <Text style={styles.rank}>{i + 1}</Text>
                  <View style={{ flex: 1, gap: 7 }}>
                    <View style={[styles.skel, { width: "55%", height: 13 }]} />
                    <View style={[styles.skel, { width: "30%", height: 11 }]} />
                  </View>
                </View>
              ))}
            </>
          )}

          {/* Top hashtags by video count. Ranked, with the leading three in
              accent the way every chart does it. */}
          {trending.data && trending.data.length > 0 && (
            <>
              <View style={styles.recentHead}>
                <Text style={styles.blockTitle}>You may like</Text>
                <View style={styles.trendPill}>
                  <Text style={styles.trendPillText}>TRENDING</Text>
                </View>
              </View>
              {trending.data.slice(0, 8).map((h, i) => (
                <Pressable
                  key={h.name}
                  style={styles.trendRow}
                  accessibilityRole="button"
                  onPress={() => openHashtag(h.name)}
                >
                  <Text style={[styles.rank, i < 3 && styles.rankTop]}>{i + 1}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.trendName} numberOfLines={1}>
                      #{h.name.replace(/^#/, "")}
                    </Text>
                    <Text style={styles.trendMeta}>{compact(h.videos_count)} reels</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {recents.length === 0 && !trending.data?.length && (
            <View style={styles.blank}>
              <MagnifierGlyph c="#B6B1BE" s={34} />
              <Text style={styles.blankTitle}>Search Teezer</Text>
              <Text style={styles.blankBody}>Find creators, reels and sounds.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <>
          {/* Scrollable: five labels overflow a narrow screen, and a clipped tab
              cannot be tapped. Identical to a plain row whenever they all fit. */}
          <View style={styles.tabsWrap}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={styles.tabs}
            >
              {TABS.map((t) => {
                const on = t === tab;
                return (
                  <Pressable key={t} onPress={() => setTab(t)} accessibilityRole="button" style={[styles.tab, on && styles.tabOn]}>
                    <Text style={[styles.tabText, on ? styles.tabTextOn : styles.tabTextOff]}>{t}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={styles.pad}
          >
            {/*
              Wikipedia context, above the Teezer results as specified.
              Deliberately outside the loading/error/empty branches below: it
              fetches on its own clock and renders nothing when the query is
              not a real-world topic, so it must neither wait on Teezer's
              search nor disappear while that is loading. It also still shows
              when Teezer has no results, which is exactly when a user most
              wants some context for what they typed.
            */}
            {!tooShort && (
              <KnowledgeCard query={term} variant="compact" style={styles.knowledgeCard} />
            )}

            {tooShort ? (
              <View style={styles.blank}>
                <Text style={styles.blankTitle}>Keep typing</Text>
                <Text style={styles.blankBody}>
                  Enter at least {MIN_QUERY_LENGTH} characters to search.
                </Text>
              </View>
            ) : results.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={ds.accent} />
              </View>
            ) : results.isError ? (
              <View style={styles.blank}>
                <Text style={styles.blankTitle}>Search is unavailable</Text>
                {/* A 503 here means the index is down, NOT that nothing matched -
                    saying "no results" would blame the query for an outage. */}
                <Text style={styles.blankBody}>This is temporary. Try again in a moment.</Text>
              </View>
            ) : nothing ? (
              <View style={styles.blank}>
                <Text style={styles.blankTitle}>No results for “{q}”</Text>
                <Text style={styles.blankBody}>Check the spelling or try something broader.</Text>
              </View>
            ) : (
              <>
                {users.length > 0 && (tab === "Top" || tab === "Creators") && (
                  <>
                    <SectionLabel>Creators</SectionLabel>
                    {users.map((u) => {
                      const on = followMap[u.username] ?? !!u.is_following;
                      return (
                        <View key={u.id} style={styles.userRow}>
                          <Pressable
                            style={styles.userLeft}
                            accessibilityRole="button"
                            onPress={() => {
                              remember(q);
                              navigation.push("UserProfile", { username: u.username });
                            }}
                          >
                            <Avatar
                              uri={u.avatar}
                              style={styles.userAvatar}
                              hasStory={!!u.has_story}
                              storySeen={!!u.has_story && !u.has_unseen}
                            />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              {/* The badge sits beside the name, so the row has
                                  to be one line that can shrink - otherwise a
                                  long display name pushes the tick off. */}
                              <View style={styles.userNameRow}>
                                <Text style={styles.userName} numberOfLines={1}>
                                  {u.name || u.username}
                                </Text>
                                {!!u.is_verified && <VerifiedBadge size={13} />}
                              </View>
                              <Text style={styles.userMeta} numberOfLines={1}>
                                @{u.username} · {compact(u.followers_count)} followers
                              </Text>
                            </View>
                          </Pressable>
                          <Pressable
                            accessibilityRole="button"
                            onPress={() => toggleFollow(u.username, u.is_following)}
                            style={[styles.followBtn, on ? styles.followOn : styles.followOff]}
                          >
                            <Text style={on ? styles.followTextOn : styles.followTextOff}>
                              {on ? "Following" : "Follow"}
                            </Text>
                          </Pressable>
                        </View>
                      );
                    })}
                  </>
                )}

                {videos.length > 0 && (tab === "Top" || tab === "Videos") && (
                  <>
                    <SectionLabel>Videos</SectionLabel>
                    {videoGrid}
                  </>
                )}

                {sounds.length > 0 && (tab === "Top" || tab === "Sounds") && (
                  <>
                    <SectionLabel>Sounds</SectionLabel>
                    {sounds.map((s) => (
                      <View key={s.id} style={styles.userRow}>
                        {/* Cover art, with the note tile kept as the fallback for
                            tracks that genuinely have no artwork. */}
                        {s.cover_url ? (
                          <Image
                            source={{ uri: s.cover_url }}
                            style={styles.soundTile}
                            contentFit="cover"
                            transition={120}
                          />
                        ) : (
                          <View style={styles.soundTile}>
                            <Text style={styles.soundNote}>♪</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.userName} numberOfLines={1}>
                            {s.title || "Original sound"}
                          </Text>
                          <Text style={styles.userMeta} numberOfLines={1}>
                            {s.artist_name ? `${s.artist_name} · ` : ""}
                            {compact(s.videos_count)} reels
                          </Text>
                        </View>
                      </View>
                    ))}
                  </>
                )}

                {/* The server has always returned this bucket; the screen used to
                    drop it on the floor. */}
                {hashtags.length > 0 && (tab === "Top" || tab === "Hashtags") && (
                  <>
                    <SectionLabel>Hashtags</SectionLabel>
                    {hashtags.map((h) => (
                      <Pressable
                        key={h.name}
                        style={styles.userRow}
                        accessibilityRole="button"
                        onPress={() => openHashtag(h.name)}
                      >
                        <View style={styles.soundTile}>
                          <Text style={styles.hashGlyph}>#</Text>
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.userName} numberOfLines={1}>
                            #{h.name}
                          </Text>
                          <Text style={styles.userMeta} numberOfLines={1}>
                            {compact(h.videos_count)} reels
                          </Text>
                        </View>
                      </Pressable>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  pad: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 100 },
  // Applied to the card itself, not a wrapper - the card renders null on any
  // non-topic query, and a wrapper would keep this margin as an empty gap.
  knowledgeCard: { marginBottom: 16 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  field: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: FILL, borderRadius: 10, paddingHorizontal: 12, height: 38 },
  input: { flex: 1, minWidth: 0, fontSize: font.sm, color: ds.text, padding: 0 },
  clear: { width: 18, height: 18, borderRadius: 999, backgroundColor: "#C9C4CF", alignItems: "center", justifyContent: "center" },
  searchBtn: { fontSize: font.sm, fontWeight: font.weightMedium, color: ds.accent },

  // The underline lives on the wrapper so it spans the full width; the row
  // itself scrolls inside it.
  tabsWrap: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: HAIRLINE },
  tabs: { flexDirection: "row", gap: 18, paddingHorizontal: 16 },
  tab: { paddingBottom: 11, borderBottomWidth: 2.5, borderBottomColor: "transparent" },
  tabOn: { borderBottomColor: ds.text },
  tabText: { fontSize: font.md },
  tabTextOn: { color: ds.text, fontWeight: font.weightBold },
  tabTextOff: { color: ds.textMuted, fontWeight: font.weightMedium },

  recentHead: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 14, marginBottom: 4 },
  blockTitle: { flex: 1, fontSize: font.lg, fontWeight: font.weightHeavy, color: ds.text },
  clearAll: { fontSize: font.sm, color: ds.accent, fontWeight: font.weightMedium },
  trendPill: { backgroundColor: "#FDE7EE", borderRadius: 5, paddingHorizontal: 7, paddingVertical: 3 },
  trendPillText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: ds.accent, letterSpacing: 0.5 },

  trendRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  rank: { width: 16, fontSize: font.sm, fontWeight: font.weightHeavy, color: ds.textMuted },
  rankTop: { color: ds.accent },
  trendName: { fontSize: font.base, fontWeight: font.weightBold, color: ds.text },
  trendMeta: { fontSize: font.sm, color: ds.textMuted, marginTop: 2 },
  skel: { backgroundColor: "#EFECF1", borderRadius: 6 },
  // No thumbnail here: /explore/hashtags returns id/name/videos_count only, so
  // the tile was permanently an empty grey box. Removed rather than faked.

  sectionLabel: { fontSize: font.sm, fontWeight: font.weightBold, letterSpacing: 0.9, color: ds.textMuted, textTransform: "uppercase", marginTop: 6, marginBottom: 12 },

  recentRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 11 },
  recentText: { fontSize: font.base, color: ds.text },

  userRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9 },
  userLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  userAvatar: { width: 46, height: 46, borderRadius: 999 },
  // minWidth:0 on the row lets the name ellipsize instead of shoving the badge
  // out of the row; flexShrink on the text is what actually does the clipping.
  userNameRow: { flexDirection: "row", alignItems: "center", gap: 4, minWidth: 0 },
  userName: { flexShrink: 1, fontSize: font.sm, fontWeight: font.weightBold, color: ds.text },
  userMeta: { fontSize: font.xs, color: ds.textMuted, marginTop: 2 },
  followBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
  followOff: { backgroundColor: ds.accent },
  followOn: { backgroundColor: FILL },
  followTextOff: { color: ds.onDark, fontSize: font.sm, fontWeight: font.weightBold },
  followTextOn: { color: "#4A4653", fontSize: font.sm, fontWeight: font.weightBold },

  soundTile: { width: 46, height: 46, borderRadius: 12, backgroundColor: FILL, alignItems: "center", justifyContent: "center" },
  soundNote: { fontSize: 20, color: ds.textMuted },
  hashGlyph: { fontSize: 19, fontWeight: font.weightHeavy, color: ds.textMuted },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tile: { borderRadius: 12, overflow: "hidden", backgroundColor: "#E7E4EA" },
  tileFill: { width: "100%", height: "100%" },
  tilePlaceholder: { backgroundColor: "#E3DFE7" },
  playCount: { position: "absolute", left: 8, bottom: 8, flexDirection: "row", alignItems: "center", gap: 4 },
  playCountText: { color: "#fff", fontSize: font.xs, fontWeight: font.weightBold },
  tileCaption: { fontSize: font.sm, color: "#4A4653", lineHeight: 17, marginTop: 7 },

  center: { paddingTop: 50, alignItems: "center" },
  blank: { paddingTop: 70, alignItems: "center", gap: 8, paddingHorizontal: 30 },
  blankTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text, textAlign: "center" },
  blankBody: { fontSize: font.sm, color: ds.textMuted, textAlign: "center", lineHeight: 20 },
});
