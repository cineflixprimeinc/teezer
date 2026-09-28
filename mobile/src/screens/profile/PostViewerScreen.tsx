import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haptics } from "@/services/haptics";
import {
  View,
  Text,
  Pressable,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  type LayoutChangeEvent,
  type ViewToken,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import { ds } from "@/theme/design";
import { BAR_H } from "@/components/nav/ReelsooTabBar";
import { profileApi, profileGridQuery, type ProfileGridTab } from "@/api/profile.api";
import { videoApi } from "@/api/video.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { FeedVideoItem } from "@/screens/feed/FeedVideoItem";
import { CommentsSheet } from "@/screens/feed/CommentsSheet";
import { ShareSheet } from "@/screens/feed/ShareSheet";
import { PlaybackSheet } from "@/screens/feed/PlaybackSheet";
import type { Video } from "@/types";

/**
 * Post viewer - the prototype's `postViewerOpen` surface.
 *
 * Opened by tapping a tile in a profile's grid. It is the SAME vertical pager
 * as the feed, scoped to that profile's list and started at the tapped index,
 * so a tap continues into a scrollable run of that creator's posts rather than
 * dead-ending on one video.
 *
 * It reuses FeedVideoItem rather than restating the player: the media, the
 * action rail, the progress bar and the caption are all the feed's, and only
 * the chrome around them differs (a header with search, and a comment
 * composer). FeedVideoItem's `chromeBottomInset` is what lifts its caption and
 * rail clear of that composer; the feed passes nothing and is unchanged.
 *
 * No loading flash on open: the query key and fetcher are byte-identical to
 * ProfileTabScreen's, so react-query serves the list this screen was opened
 * from out of cache and the first frame already has the right post.
 */

/* ── Glyphs ─────────────────────────────────────────────────────────────── */

function ChevronLeftGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.onDark} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The feed's own search mark (HomeScreen's SearchGlyph), same geometry at a
 *  smaller size - not a second magnifier drawn to different proportions. */
function SearchGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={ds.onDark} strokeWidth={2} />
      <Path d="M15.6 15.6L21 21" stroke={ds.onDark} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function DotsGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Circle cx={5} cy={12} r={1.4} fill={ds.onDark} />
      <Circle cx={12} cy={12} r={1.4} fill={ds.onDark} />
      <Circle cx={19} cy={12} r={1.4} fill={ds.onDark} />
    </Svg>
  );
}

/**
 * Composer tools, drawn as one path set each like the rest of the app's
 * glyphs. These four have no equivalent on the feed - the feed has no
 * composer - so they are the design's own marks, kept to the same 1.8 stroke
 * the rest of this screen's outline icons use.
 */
function ToolGlyph({ d }: { d: string[] }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      {d.map((p, i) => (
        <Path
          key={i}
          d={p}
          stroke={COMPOSER_INK}
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </Svg>
  );
}

/**
 * `tool` is which of the sheet's own pickers this icon stands for.
 *
 * Every one of these still opens the comments sheet - that is where the real
 * composer lives - but the photo and GIF marks now land ON their picker instead
 * of merely next to it. Emoji and mention have no picker of their own: the
 * sheet's emoji row and its keyboard are already what they lead to, so they
 * open it plainly, exactly as before.
 */
const COMPOSER_TOOLS: { key: string; label: string; tool: "photo" | "gif" | null; d: string[] }[] = [
  {
    key: "emoji",
    label: "Emoji",
    tool: null,
    d: ["M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Z", "M8.5 14.5a4.2 4.2 0 0 0 7 0", "M9 9.5h.01", "M15 9.5h.01"],
  },
  {
    key: "photo",
    label: "Photo",
    tool: "photo",
    d: ["M3 5.5h18v13H3z", "m5 16 4.2-4.6 3 3.1 2.8-2.6L19 16", "M8.6 9.4h.01"],
  },
  {
    key: "gif",
    label: "GIF",
    tool: "gif",
    d: ["M2.8 6.5h18.4v11H2.8z", "M10.2 10.6a2 2 0 1 0 0 2.8", "M10.2 12h1.1", "M14.4 10v4", "M17 14v-4h2.4", "M17 12.2h1.9"],
  },
  {
    key: "mention",
    label: "Mention",
    tool: null,
    d: ["M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-4 8", "M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"],
  },
];

/* ── Screen ─────────────────────────────────────────────────────────────── */

/**
 * The composer bar is exactly as tall as the feed's tab bar, and for the same
 * reason: it is the bottom chrome of a full-screen pager, so a post here has to
 * occupy the same area a post occupies on the feed.
 *
 * BAR_H is imported rather than restated - two copies of 86 drift the moment
 * one of them moves. Like the tab bar, the safe-area inset is padding INSIDE
 * this height, not extra height stacked on top of it.
 */
const COMPOSER_H = BAR_H;

/** Light ink for the composer's glyphs, against the dark pill behind them. */
const COMPOSER_INK = "rgba(255,255,255,0.82)";

export type PostViewerProps = {
  username: string;
  startIndex?: number;
  tab?: ProfileGridTab;
  /** Deep link: show this one reel. `username` is empty in that case, because
   *  the link carries an id and nothing else. */
  videoId?: number;
  /** Dismiss. The host layer owns the animation and the unmount. */
  onClose: () => void;
};

export function PostViewerScreen({
  username,
  startIndex = 0,
  tab = "Reels",
  videoId,
  onClose,
}: PostViewerProps) {
  const { width, height: windowH } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  /*
   * The page height is MEASURED, not derived - this is the bleed fix.
   *
   * It used to be `windowH - composerH`, computed by hand. That arithmetic is
   * what let the next post show through: useWindowDimensions() is not the same
   * quantity as the space this list is actually laid out into, so any time the
   * window read taller than the real viewport, the items came out shorter than
   * the frame holding them and the top of the FOLLOWING post appeared beneath
   * the current one. Capping the list's height (the previous attempt) could not
   * fix that, because the number being capped to was itself the wrong one.
   *
   * HomeScreen already measures its own viewport for exactly this symptom. The
   * stage below is a plain flex child sitting above the composer, so its
   * onLayout IS the space available - and the item height, the snap interval,
   * the scroll frame and getItemLayout are then all the same number by
   * construction rather than by agreement.
   *
   * Frozen to the largest value ever seen, for HomeScreen's reason: Android
   * applies adjustResize to the activity, so opening the comments keyboard
   * shrinks the window, and re-measuring there would re-size every post
   * mid-scroll.
   */
  const maxStageRef = useRef(0);
  const [stageH, setStageH] = useState(0);
  const onStageLayout = useCallback((e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height;
    if (h > maxStageRef.current) maxStageRef.current = h;
    setStageH(maxStageRef.current);
  }, []);
  /** Pre-measurement fallback only; the list does not render until stageH is real. */
  const height = stageH || Math.max(0, windowH - COMPOSER_H);
  const navigation = useNavigation<any>();

  const me = useAuthStore((s) => s.user);
  /* This is a layer, not a route, so there is no focus to gate on - it is
     mounted only while it is the thing on screen. */
  const focused = true;

  const leave = onClose;

  const [index, setIndex] = useState(startIndex);
  const [muted] = useState(false);
  const [likes, setLikes] = useState<Record<number, boolean>>({});
  const [saves, setSaves] = useState<Record<number, boolean>>({});
  /** Keyed by creator user id, not video id - see HomeScreen's own follows
   *  state for why. */
  const [follows, setFollows] = useState<Record<number, boolean>>({});
  const [commentsFor, setCommentsFor] = useState<number | null>(null);
  /** Which of the sheet's pickers the tap asked for, if any. Cleared on close so
   *  the next open does not re-fire the last one. */
  const [commentsTool, setCommentsTool] = useState<"photo" | "gif" | null>(null);
  /** Same haptic HomeScreen's own openComments fires - unconditional, since
   *  guests can browse comments read-only (CommentsSheet's own guest
   *  handling), matching Feed regardless of which entry point opened it. */
  const openComments = useCallback((id: number, tool: "photo" | "gif" | null = null) => {
    if (Platform.OS !== "web") {
      haptics.light();
    }
    setCommentsTool(tool);
    setCommentsFor(id);
  }, []);
  const [shareFor, setShareFor] = useState<number | null>(null);
  /** Long-press quick-options sheet - same as HomeScreen's own optionsFor.
   *  Was missing here entirely: FeedVideoItem's onHold no-ops without an
   *  onPlaybackOptions handler (see FeedVideoItem.tsx), so a long-press did
   *  nothing in this viewer at all before this. */
  const [optionsFor, setOptionsFor] = useState<number | null>(null);

  // Same key AND same fetcher as ProfileTabScreen, so this resolves from cache
  // on open. Anything else here would refetch and flash an empty pager.
  const videosQuery = useQuery({
    ...profileGridQuery(username, tab),
    enabled: !!username,
    staleTime: 30_000,
  });

  /** The deep-link path. A `/video/{id}` link carries an id and nothing else,
   *  so there is no grid to page through - fetch that one reel and show it. */
  const singleQuery = useQuery({
    queryKey: ["video", videoId],
    queryFn: () => videoApi.get(videoId as number),
    enabled: !username && !!videoId,
    staleTime: 30_000,
  });

  // Paginated<Video>, so the rows are under .data - same unwrap the grid does.
  const videos: Video[] = useMemo(() => {
    if (!username && videoId) return singleQuery.data ? [singleQuery.data] : [];
    return videosQuery.data?.data ?? [];
  }, [username, videoId, singleQuery.data, videosQuery.data]);

  const loading = !username && videoId ? singleQuery.isLoading : videosQuery.isLoading;
  const failed = !username && videoId ? singleQuery.isError : videosQuery.isError;

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) setIndex(first.index);
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const toggleLike = useCallback(
    (v: Video) => {
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => toggleLike(v));
        return;
      }
      const now = likes[v.id] ?? v.is_liked;
      // Only on the way TO liked, not on unlike - same as HomeScreen's own
      // toggleLike haptic (the Feed behavior this screen must match).
      if (!now && Platform.OS !== "web") {
        haptics.light();
      }
      setLikes((p) => ({ ...p, [v.id]: !now }));
      (now ? videoApi.unlike(v.id) : videoApi.like(v.id)).catch(() => {
        setLikes((p) => ({ ...p, [v.id]: now }));
      });
    },
    [likes],
  );

  const toggleSave = useCallback(
    (v: Video) => {
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => toggleSave(v));
        return;
      }
      const now = saves[v.id] ?? v.is_saved;
      // Only on the way TO saved, not on un-save - same reasoning as
      // toggleLike's own haptic above (matches HomeScreen's toggleSave).
      if (!now && Platform.OS !== "web") {
        haptics.light();
      }
      setSaves((p) => ({ ...p, [v.id]: !now }));
      (now ? videoApi.unsave(v.id) : videoApi.save(v.id)).catch(() => {
        setSaves((p) => ({ ...p, [v.id]: now }));
      });
    },
    [saves],
  );

  /** Same fix as HomeScreen's own toggleFollow - FeedActionRail's "+" badge
   *  was a dead button here too, since this screen reuses FeedVideoItem the
   *  same way HomeScreen does but never wired onFollow either. */
  const toggleFollow = useCallback(
    (v: Video) => {
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => toggleFollow(v));
        return;
      }
      const userId = v.user?.id;
      const username = v.user?.username;
      if (!userId || !username) return;
      const now = follows[userId] ?? v.user?.is_following ?? false;
      setFollows((p) => ({ ...p, [userId]: !now }));
      (now ? videoApi.unfollow(username) : videoApi.follow(username)).catch(() => {
        setFollows((p) => ({ ...p, [userId]: now }));
      });
    },
    [follows],
  );

  const renderItem = useCallback(
    ({ item, index: i }: { item: Video; index: number }) => (
      <FeedVideoItem
        video={item}
        active={i === index}
        // Same next-row head start as the main feed - see HomeScreen.
        preload={i === index + 1}
        focused={focused}
        width={width}
        height={height}
        muted={muted}
        liked={likes[item.id] ?? item.is_liked}
        saved={saves[item.id] ?? item.is_saved}
        following={item.user?.id != null ? (follows[item.user.id] ?? item.user?.is_following) : undefined}
        onToggleLike={() => toggleLike(item)}
        onToggleSave={() => toggleSave(item)}
        onToggleFollow={() => toggleFollow(item)}
        onComments={() => openComments(item.id)}
        onShare={() => setShareFor(item.id)}
        onPlaybackOptions={() => setOptionsFor(item.id)}
        // chromeBottomInset is deliberately NOT passed. `height` above already
        // excludes the composer, so the caption and rail sit at the feed's own
        // offsets inside it. Passing an inset too would lift them a second
        // time and leave a gap above the bar.
      />
    ),
    [focused, index, width, height, muted, likes, saves, follows, toggleLike, toggleSave, toggleFollow, openComments],
  );

  /** Same lookup HomeScreen uses for its own PlaybackSheet below. */
  const optionsVideo = useMemo(
    () => videos.find((v) => v.id === optionsFor) ?? null,
    [videos, optionsFor],
  );

  const current = videos[index];
  const listRef = useRef<FlatList<Video>>(null);
  // Clamped, and NaN-proof: a param that arrives as anything but a number
  // would otherwise reach VirtualizedList and fail its viewport invariant.
  const safeStart = Number.isFinite(startIndex)
    ? Math.min(Math.max(0, Math.trunc(startIndex)), Math.max(0, videos.length - 1))
    : 0;

  return (
    <View style={styles.root}>
      {/* The stage is the pager's entire world: one post tall, measured, and
          clipped. The composer below is its sibling rather than an overlay, so
          the space each one gets is decided by the layout instead of by
          arithmetic that could disagree with it. */}
      <View style={styles.stage} onLayout={onStageLayout}>
      {loading || !stageH ? (
        <View style={styles.center}>
          <ActivityIndicator color={ds.accent} />
        </View>
      ) : videos.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>
            {failed ? "This reel couldn't be loaded." : "This post isn't available."}
          </Text>
        </View>
      ) : (
        <FlatList
          ref={listRef}
          /*
           * Fills the stage, which is already exactly one post tall - so the
           * scroll frame, the item and snapToInterval are the same number
           * rather than three numbers that have to be kept in agreement.
           *
           * Nothing renders until stageH is real. Mounting on the fallback
           * height and re-sizing afterwards would leave initialScrollIndex
           * pointing at an offset computed from the wrong item height, which
           * strands the open on the seam between two posts.
           */
          style={styles.list}
          data={videos}
          keyExtractor={(v) => String(v.id)}
          renderItem={renderItem}
          /*
           * snapToInterval, NOT pagingEnabled - the same combination HomeScreen
           * uses.
           *
           * pagingEnabled snaps by the scroll view's own frame, which is the
           * full screen. Each post is now `height` tall (the screen minus the
           * composer), so the two disagree by the composer's height and every
           * swipe lands a little further off than the last - the scroll drifts
           * between posts instead of settling on one.
           *
           * Snapping by the item interval keeps one post per swipe however
           * tall the chrome around it happens to be.
           */
          snapToInterval={height}
          snapToAlignment="start"
          decelerationRate="fast"
          disableIntervalMomentum
          showsVerticalScrollIndicator={false}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
          // Opens on the tapped tile rather than scrolling to it, so there is
          // no visible travel from the top of the list.
          initialScrollIndex={safeStart}
          // getItemLayout should make this unreachable, but an out-of-range
          // index is the one way this list can strand on a blank cell - if the
          // cached page is shorter than the tile that was tapped, say. Falling
          // back to an offset always lands somewhere real.
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: false });
          }}
          windowSize={3}
          maxToRenderPerBatch={3}
          /* removeClippedSubviews is deliberately NOT set - same reasoning as
           * the feed's list in HomeScreen. It detaches off-screen rows from the
           * native view hierarchy and re-attaches them on the way back in, and a
           * row that has just been re-attached can miss touches until the next
           * layout pass. That is exactly the post you swiped to, and exactly the
           * one whose comment/like/save buttons you are about to tap - so the
           * first tap silently does nothing and reads as lag.
           *
           * windowSize={3} already caps this list at about three mounted rows,
           * so clipping was saving almost nothing. Do not re-add it without
           * re-testing swipe-then-immediately-tap. */
        />
      )}
      </View>

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={leave}
          style={styles.circleBtn}
          hitSlop={6}
        >
          <ChevronLeftGlyph />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Search reels"
          onPress={() => navigation.navigate("Search")}
          style={styles.searchPill}
        >
          <SearchGlyph />
          <Text style={styles.searchText} numberOfLines={1}>
            Search reels
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Post options"
          onPress={() => {}}
          style={styles.circleBtn}
          hitSlop={6}
        >
          <DotsGlyph />
        </Pressable>
      </View>

      {/* ── Comment composer ───────────────────────────────────────────────
          Opens the same CommentsSheet the feed uses; this bar is the entry
          point the design gives the viewer, not a second comment system.

          Rendered unconditionally, NOT gated on videos.length > 0 - it used
          to skip its first paint while the grid was still loading, which
          meant the stage's very first onLayout (composer absent) measured
          the FULL window as available space. maxStageRef only ever grows
          upward from there ("frozen to the largest value ever seen"), so
          that oversized first reading stuck permanently even after the
          composer mounted and the real stage shrank by its height - leaving
          FeedVideoItem's caption/rail bottom-anchored against a virtual box
          taller than the real visible area, clipped by the stage's own
          overflow:hidden. Every press handler inside already no-ops without
          a loaded `current`, so keeping this always mounted costs nothing. */}
      <View style={[styles.composer, { paddingBottom: insets.bottom }]}>
        {me?.avatar ? (
          <Image source={{ uri: me.avatar }} style={styles.meAvatar} contentFit="cover" transition={120} />
        ) : (
          <View style={[styles.meAvatar, styles.meAvatarFallback]}>
            <Text style={styles.meAvatarLetter}>
              {(me?.username ?? me?.name ?? "A").charAt(0).toUpperCase()}
            </Text>
          </View>
        )}

        {/* The pill holds the placeholder AND the tools. Every one of them
            opens the comments sheet: that sheet is where the real composer
            lives, so these are entry points into it rather than a second
            composer that would have to be kept in step with it.

            It used to sit beside a separate round comment button, which was
            a third way to open the same sheet. That is gone, and this takes
            the width it was using. */}
        <View style={styles.composerField}>
          <Pressable
            accessibilityRole="button"
            onPress={() => current && openComments(current.id)}
            style={styles.composerLabelHit}
          >
            <Text style={styles.composerPlaceholder} numberOfLines={1}>
              Add a comment…
            </Text>
          </Pressable>

          {COMPOSER_TOOLS.map((t) => (
            <Pressable
              key={t.key}
              accessibilityRole="button"
              accessibilityLabel={t.label}
              onPress={() => current && openComments(current.id, t.tool)}
              style={styles.composerTool}
              hitSlop={4}
            >
              <ToolGlyph d={t.d} />
            </Pressable>
          ))}
        </View>
      </View>

      <CommentsSheet
        videoId={commentsFor}
        // Who a gift from the comments composer goes to.
        creator={(() => {
          const u = videos.find((v) => v.id === commentsFor)?.user;
          return u?.id ? { id: u.id, username: u.username } : null;
        })()}
        open={commentsFor !== null}
        initialTool={commentsTool}
        onClose={() => {
          setCommentsFor(null);
          setCommentsTool(null);
        }}
      />

      <ShareSheet
        video={videos.find((v) => v.id === shareFor) ?? null}
        open={shareFor !== null}
        onClose={() => setShareFor(null)}
      />

      <PlaybackSheet
        video={optionsVideo}
        open={optionsFor != null}
        saved={optionsVideo ? (saves[optionsVideo.id] ?? optionsVideo.is_saved) : false}
        onToggleSave={() => optionsVideo && toggleSave(optionsVideo)}
        onClose={() => setOptionsFor(null)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0A0E" },
  /* The pager's own area: everything above the composer, and nothing else.
     overflow hidden is belt-and-braces - the stage is exactly one post tall, so
     there should be nothing to clip, but a View's default overflow is `visible`
     and this guarantees a second post can never paint outside the frame. */
  stage: { flex: 1, overflow: "hidden" },
  list: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  emptyText: { color: "rgba(255,255,255,0.72)", fontSize: 14 },

  header: {
    position: "absolute",
    left: 0,
    right: 0,
    top: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,0.14)",
    alignItems: "center",
    justifyContent: "center",
  },
  searchPill: {
    flex: 1,
    minWidth: 0,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.22)",
    backgroundColor: "rgba(255,255,255,0.12)",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
  },
  searchText: { flex: 1, fontSize: 13, color: "rgba(255,255,255,0.7)" },

  /* A real bar in the layout, not an overlay floating on the video: it holds
     its own COMPOSER_H of space, which is what the stage above measures around.
     Solid black, so nothing shows through it - it is chrome, not a scrim.
     The safe-area inset is padding inside this height, exactly as the tab bar
     treats it, which is also what settles the row lower than it used to sit. */
  composer: {
    height: COMPOSER_H,
    backgroundColor: "#000000",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 14,
  },
  meAvatar: { width: 32, height: 32, borderRadius: 999 },
  meAvatarFallback: { backgroundColor: "#B33A5B", alignItems: "center", justifyContent: "center" },
  meAvatarLetter: { color: ds.onDark, fontSize: 14, fontWeight: "800", fontStyle: "italic" },
  composerField: {
    flex: 1,
    minWidth: 0,
    height: 40,
    borderRadius: 999,
    // Dark grey pill on the black bar. Solid, not translucent: the bar behind
    // it is opaque black now, so an alpha fill would only be this same value
    // computed the long way and would drift if the bar's colour ever moved.
    backgroundColor: "#282828",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    // Asymmetric on purpose: the text needs its inset, the round tool buttons
    // carry their own so they sit closer to the pill's edge.
    paddingLeft: 16,
    paddingRight: 8,
  },
  composerLabelHit: { flex: 1, minWidth: 0, justifyContent: "center", height: "100%" },
  composerPlaceholder: { fontSize: 13, color: "rgba(255,255,255,0.62)" },
  composerTool: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },
});
