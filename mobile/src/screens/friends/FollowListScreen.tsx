import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { PanGestureHandler } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { ChevronLeft, Lock, Search, Users } from "lucide-react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { FollowButton } from "@/components/FollowButton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { profileApi } from "@/api/profile.api";
import { suggestionApi } from "@/api/suggestion.api";
import { videoApi } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { useSwipeTabs } from "@/hooks/useSwipeTabs";
import { useCreatorLayer } from "@/store/creator-layer.store";
import {
  FOLLOW_LIST_COMMIT_FRACTION,
  FOLLOW_LIST_COMMIT_VELOCITY,
  paintFollowList,
  useFollowList,
} from "@/store/follow-list.store";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Followers / Following / Suggested for any account.
 *
 * One screen rather than three: the row is identical in all three, and holding
 * them together is what lets the header switch without a push - so Back always
 * means "leave", never "undo the tab I just tapped".
 *
 * The three tabs are backed by two DIFFERENT shapes of endpoint: followers and
 * following are paginated (`useInfiniteQuery` over meta.current_page), while
 * suggestions come back as one ranked array from the recommender. Both are
 * normalised to `Row` here so the list, the search filter and the follow button
 * never have to know which tab produced them.
 *
 * The follow control is deliberately BINARY, not the three-state model on the
 * profile header. `follow_status` is only populated by GET /users/{username};
 * these endpoints annotate `is_following` and leave it at its "none" default, so
 * three states would render "Follow" for accounts you have an open request with.
 * The website's list buttons are binary for the same reason.
 */

type Mode = "followers" | "following" | "suggested";

const TABS: { key: Mode; label: string }[] = [
  { key: "followers", label: "Followers" },
  { key: "following", label: "Following" },
  { key: "suggested", label: "Suggested" },
];

/** Swipe order, and it must stay the header's order - the gesture moves one
 *  step along this list, so the two disagreeing would send a swipe somewhere
 *  the labels say it shouldn't go. */
const TAB_KEYS = TABS.map((t) => t.key);

/** Left strip where a rightward drag means "back" rather than "previous tab",
 *  as a layer. Matches the width both platforms use for their own back
 *  gesture. */
const EDGE_BACK_ZONE = 24;

/** The one row shape the list renders, whichever endpoint filled it. */
type Row = {
  id: number;
  username: string;
  name: string | null;
  avatar: string | null;
  is_verified: boolean;
  is_following?: boolean;
  followers_count?: number;
  /** Secondary line - mutual count on suggestions, follower count elsewhere. */
  meta?: string | null;
};

function Avatar({ uri, name, size }: { uri?: string | null; name?: string | null; size: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  if (uri) {
    return (
      <Image
        source={uri}
        style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bgMuted }}
        contentFit="cover"
      />
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.brand,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ color: colors.white, fontWeight: font.weightHeavy, fontSize: size * 0.4 }}>
        {initial}
      </Text>
    </View>
  );
}

/** The backend answers a private account's list with 403 + `private: true`
 *  rather than an empty page, so an error here is often a state, not a fault. */
function isPrivateError(err: unknown): boolean {
  return (err as { response?: { data?: { private?: boolean } } })?.response?.data?.private === true;
}

type FollowListProps = {
  username?: string;
  type?: Mode;
  /**
   * "screen"  - pushed on the root stack; Back pops it.
   * "overlay" - a LAYER covering the swiped-in creator profile. Back (chevron,
   *             Android back, or the rightward swipe off the first tab) uncovers
   *             that profile instead of popping a route out from under it.
   */
  presentation?: "screen" | "overlay";
  onClose?: () => void;
};

export function FollowListView({
  username: userProp,
  type: typeProp,
  presentation = "screen",
  onClose,
}: FollowListProps = {}) {
  const navigation = useNavigation<any>();
  const username = userProp ?? "";
  const overlay = presentation === "overlay";

  const [tab, setTab] = useState<Mode>(typeProp ?? "followers");
  const [query, setQuery] = useState("");
  const { width } = useWindowDimensions();

  /** Leave: uncover the profile underneath, or pop the route. */
  const close = useCallback(() => {
    if (overlay) onClose?.();
    else navigation.goBack();
  }, [overlay, onClose, navigation]);

  /**
   * Open one of these people.
   *
   * As a layer there is no route to push onto: one would mount underneath this
   * list and the tap would look like it did nothing (the same trap documented
   * on the profile's own openPost). They are pushed onto the creator layer's
   * stack instead, which lifts itself over this list for as long as the new
   * profile is there (see CreatorProfileLayer).
   *
   * It is an ORDINARY animated push, and this list is deliberately left
   * mounted. The old version did the opposite - it pushed un-animated and then
   * dismissed the list - which meant the new profile was already sitting there
   * fully laid out, still fetching, while the list slid off it. What you saw
   * was a finished-looking page flashing through its own loading state, and
   * back skipped the list entirely because it had been torn down. Sliding the
   * profile in over a list that stays put makes it read like any other page,
   * and leaves the list underneath with its tab, scroll offset and results
   * intact for the way back.
   */
  const openPerson = useCallback(
    (handle: string) => {
      if (!overlay) {
        // push, not navigate: drilling person -> person must stack, so Back
        // walks the path you actually took.
        navigation.push("UserProfile", { username: handle });
        return;
      }
      useCreatorLayer.getState().push(handle);
    },
    [overlay, navigation],
  );

  /** One route in for taps and swipes alike. Clearing the search is part of
   *  changing tab: a term typed against followers means nothing against
   *  suggestions, and carrying it over would show an empty list that looks
   *  like the new tab simply had no results. */
  const goToTab = useCallback((next: Mode) => {
    setTab(next);
    setQuery("");
  }, []);

  /**
   * Swipe-back, as a layer.
   *
   * The horizontal swipe already means "change tab", so this cannot be a second
   * handler wrapped around the pane. It takes the two cases the tabs have no
   * answer for:
   *
   *   - a rightward swipe on the FIRST tab, which otherwise only rubber-bands
   *   - a rightward swipe begun at the LEFT EDGE, from any tab - the platform's
   *     own back gesture, which cannot collide with a tab swipe because a tab
   *     swipe starts mid-screen
   *
   * Either drags the whole list off to the right and uncovers the profile,
   * which is the same gesture that opened the profile from the feed.
   */
  const escape = useMemo(
    () =>
      overlay
        ? {
            dir: 1 as const,
            begin: (startX: number, hasTab: boolean) => !hasTab || startX <= EDGE_BACK_ZONE,
            move: (dx: number) => paintFollowList(dx, width),
            end: (translationX: number, velocityX: number) => {
              const far = translationX > width * FOLLOW_LIST_COMMIT_FRACTION;
              const fast = velocityX > FOLLOW_LIST_COMMIT_VELOCITY;
              useFollowList.getState().settle(far || fast);
            },
          }
        : undefined,
    [overlay, width],
  );

  const swipe = useSwipeTabs<Mode>({
    tabs: TAB_KEYS,
    current: tab,
    width,
    onChange: goToTab,
    escape,
  });
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  const me = useAuthStore((s) => s.user);
  const isSelf = !!me?.username && me.username === username;

  /* ── the two relationship tabs: paginated ──────────────────────────────── */
  const listQ = useInfiniteQuery({
    queryKey: ["follow-list", username, tab],
    queryFn: ({ pageParam }) =>
      tab === "followers"
        ? profileApi.followers(username, pageParam as number)
        : profileApi.following(username, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const m = last.meta;
      if (!m) return undefined;
      return m.current_page < m.last_page ? m.current_page + 1 : undefined;
    },
    // Both routes live behind auth:sanctum, so a guest cannot load either.
    enabled: !!username && isAuthed && tab !== "suggested",
    // A 403 means "private", which is a final answer - retrying only delays the
    // panel that explains why the list is empty.
    retry: (count, err) => !isPrivateError(err) && count < 2,
    staleTime: 30_000,
  });

  /* ── suggestions: one ranked array, same source the Suggested page uses ── */
  const suggestQ = useQuery({
    queryKey: ["follow-list-suggested"],
    queryFn: () => suggestionApi.profiles("friends", 50),
    enabled: isAuthed && tab === "suggested",
    staleTime: 60_000,
  });

  const rows: Row[] = useMemo(() => {
    if (tab === "suggested") {
      return (suggestQ.data ?? []).map((s) => ({
        id: s.id,
        username: s.username,
        name: s.display_name ?? s.username,
        avatar: s.avatar,
        is_verified: s.is_verified,
        is_following: s.is_following,
        followers_count: s.followers_count,
        meta:
          s.mutual_followers_count > 0
            ? `${formatCompact(s.mutual_followers_count)} mutual friends`
            : `${formatCompact(s.followers_count)} followers`,
      }));
    }
    return (listQ.data?.pages ?? [])
      .flatMap((p) => p.data ?? [])
      .map((u) => ({
        id: u.id,
        username: u.username,
        name: u.name,
        avatar: u.avatar,
        is_verified: u.is_verified,
        is_following: u.is_following,
        followers_count: u.followers_count,
        meta:
          typeof u.followers_count === "number"
            ? `${formatCompact(u.followers_count)} followers`
            : null,
      }));
  }, [tab, suggestQ.data, listQ.data]);

  // Filters what has been loaded, not the whole list server-side - neither
  // endpoint takes a search term. Fine for the pages in hand; it will not find
  // someone who lives on a page the list has not reached yet.
  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter(
      (r) =>
        r.username.toLowerCase().includes(needle) ||
        (r.name ?? "").toLowerCase().includes(needle),
    );
  }, [rows, query]);

  /** Local follow overrides so a tap answers before the round trip. */
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const isFollowing = (r: Row) => followMap[r.username] ?? !!r.is_following;

  const toggleFollow = useCallback(
    (r: Row) => {
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => toggleFollow(r));
        return;
      }
      const next = !isFollowing(r);
      setFollowMap((m) => ({ ...m, [r.username]: next }));
      (next ? videoApi.follow(r.username) : videoApi.unfollow(r.username)).catch(() =>
        setFollowMap((m) => ({ ...m, [r.username]: !next })),
      );
      // Tells the recommender this suggestion landed, so it stops offering it.
      if (next && tab === "suggested") suggestionApi.markFollowed(r.id);
    },
    [followMap, tab],
  );

  /** Who this list is, in the person's own terms. */
  const subtitle =
    tab === "suggested"
      ? "Accounts picked for you"
      : tab === "followers"
        ? isSelf
          ? "People who follow you"
          : `People who follow @${username}`
        : isSelf
          ? "People you follow"
          : `People @${username} follows`;

  const placeholder =
    tab === "followers"
      ? "Search followers"
      : tab === "following"
        ? "Search following"
        : "Search suggestions";

  const loading = tab === "suggested" ? suggestQ.isLoading : listQ.isLoading;
  const priv = isPrivateError(listQ.error);
  const errored = tab === "suggested" ? suggestQ.isError : listQ.isError && !priv;

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <Pressable
          hitSlop={10}
          onPress={close}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <ChevronLeft size={22} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            @{username}
          </Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {subtitle}
          </Text>
        </View>
      </View>

      {/* Switching here rather than pushing keeps Back meaning "leave". */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t.key === tab;
          return (
            <Pressable
              key={t.key}
              onPress={() => goToTab(t.key)}
              style={styles.tab}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              {/* Label only - no count. The tally belongs on the profile's
                  stat tiles, which is where you tapped to get here; repeating
                  it in the tab just crowds the row. */}
              <Text style={[styles.tabLabel, active ? styles.tabActive : styles.tabIdle]}>
                {t.label}
              </Text>
              {active && <View style={styles.tabUnderline} />}
            </Pressable>
          );
        })}
      </View>

      <View style={styles.searchWrap}>
        <Search size={17} color={colors.textFaint} strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          style={styles.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {/* Swipe moves between the three tabs. 10px sideways claims the gesture,
          8px downward hands it back to the list - the same offsets the feed
          uses, so both surfaces feel identical under the thumb. Only the pane
          travels; the header, tabs and search bar stay put. */}
      <PanGestureHandler
        onGestureEvent={swipe.onGestureEvent}
        onHandlerStateChange={swipe.onHandlerStateChange}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-8, 8]}
      >
        <Animated.View style={swipe.paneStyle}>
      {!isAuthed ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Lock size={30} color={colors.brand} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>Log in to see this list</Text>
          <Text style={styles.emptySub}>
            Followers, following and suggestions are only available when you're signed in.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={() => useAuthGate.getState().open()}>
            <Text style={styles.primaryBtnText}>Log in or sign up</Text>
          </Pressable>
        </View>
      ) : priv && tab !== "suggested" ? (
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <Lock size={30} color={colors.brand} strokeWidth={2} />
          </View>
          <Text style={styles.emptyTitle}>This account is private</Text>
          <Text style={styles.emptySub}>
            Follow @{username} to see who they follow and who follows them.
          </Text>
        </View>
      ) : loading ? (
        <View style={{ paddingTop: spacing.sm }}>
          {Array.from({ length: 10 }).map((_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={52} height={52} radius={26} />
              <View style={{ flex: 1 }}>
                <Skeleton width="45%" height={13} />
                <Skeleton width="30%" height={11} style={{ marginTop: 7 }} />
              </View>
              <Skeleton width={86} height={36} radius={radius.sm} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(r) => String(r.id)}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl
              refreshing={
                tab === "suggested"
                  ? suggestQ.isRefetching
                  : listQ.isRefetching && !listQ.isFetchingNextPage
              }
              onRefresh={() => (tab === "suggested" ? suggestQ.refetch() : listQ.refetch())}
              tintColor={colors.brand}
            />
          }
          onEndReachedThreshold={0.5}
          onEndReached={() => {
            // Suggestions arrive complete; only the paginated tabs page.
            if (tab === "suggested") return;
            if (listQ.hasNextPage && !listQ.isFetchingNextPage) void listQ.fetchNextPage();
          }}
          ListFooterComponent={
            listQ.isFetchingNextPage ? (
              <View style={{ paddingVertical: spacing.lg }}>
                <ActivityIndicator color={colors.brand} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}>
                <Users size={30} color={colors.brand} strokeWidth={2} />
              </View>
              <Text style={styles.emptyTitle}>
                {errored
                  ? "Couldn't load this list"
                  : query.trim()
                    ? "No matches"
                    : tab === "followers"
                      ? "No followers yet"
                      : tab === "following"
                        ? "Not following anyone yet"
                        : "No suggestions right now"}
              </Text>
              <Text style={styles.emptySub}>
                {errored
                  ? "Check your connection and try again."
                  : query.trim()
                    ? `Nobody loaded here matches "${query.trim()}".`
                    : tab === "followers"
                      ? "When someone follows this account, they'll show up here."
                      : tab === "following"
                        ? "Accounts they follow will show up here."
                        : "Follow a few creators and the algorithm will find people for you."}
              </Text>
              {errored && (
                <Pressable
                  style={styles.primaryBtn}
                  onPress={() => (tab === "suggested" ? suggestQ.refetch() : listQ.refetch())}
                >
                  <Text style={styles.primaryBtnText}>Try again</Text>
                </Pressable>
              )}
            </View>
          }
          renderItem={({ item: r }) => (
            <View style={styles.row}>
              <Pressable
                style={styles.rowLeft}
                accessibilityRole="button"
                onPress={() => openPerson(r.username)}
              >
                <Avatar uri={r.avatar} name={r.name || r.username} size={52} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {r.name || r.username}
                    </Text>
                    {r.is_verified && <VerifiedBadge size={14} />}
                  </View>
                  <Text style={styles.handle} numberOfLines={1}>
                    @{r.username}
                  </Text>
                  {!!r.meta && (
                    <Text style={styles.metaText} numberOfLines={1}>
                      {r.meta}
                    </Text>
                  )}
                </View>
              </Pressable>

              {/* No follow button against yourself - the server rejects a
                  self-follow with 422, so it must never be offered. */}
              {r.username !== me?.username && (
                <FollowButton following={isFollowing(r)} onPress={() => toggleFollow(r)} />
              )}
            </View>
          )}
        />
      )}
        </Animated.View>
      </PanGestureHandler>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  headerSub: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },

  tabs: {
    flexDirection: "row",
    gap: spacing.xl,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  tab: { paddingVertical: spacing.sm },
  tabLabel: { fontSize: font.md },
  tabActive: { color: colors.text, fontWeight: font.weightHeavy },
  tabIdle: { color: colors.textMuted, fontWeight: font.weightBold },
  tabUnderline: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: colors.text,
    borderRadius: 2,
  },

  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    height: 42,
    borderRadius: radius.pill,
    backgroundColor: colors.bgMuted,
  },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, flexShrink: 1 },
  handle: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  metaText: { fontSize: font.xs, color: colors.textFaint, marginTop: 3 },

  center: {
    alignItems: "center",
    justifyContent: "center",
    paddingTop: spacing.xxl * 2,
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.brandTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  emptySub: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
  primaryBtn: {
    marginTop: spacing.md,
    backgroundColor: colors.brand,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
  },
  primaryBtnText: { color: colors.white, fontWeight: font.weightHeavy, fontSize: font.md },
});

/**
 * Route wrapper: the same list, pushed on the root stack.
 *
 * Kept separate because `useRoute` only resolves inside a screen, and the
 * overlay presentation renders this outside the navigator's tree - see
 * FollowListLayer. Same split as ProfileTabScreen / UserProfileScreen.
 */
export function FollowListScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "FollowList">>();
  return <FollowListView username={route.params.username} type={route.params.type} />;
}
