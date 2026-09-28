import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { haptics } from "@/services/haptics";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Animated,
  Platform,
  useWindowDimensions,
  type ViewToken,
} from "react-native";
import { PanGestureHandler } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useIsFocused, useNavigation } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { usePrefsStore } from "@/store/prefs.store";
import { useSpeedBoost } from "@/store/speed-boost.store";
import { useOnboarding } from "@/store/onboarding.store";
import { BlurView } from "expo-blur";
import Svg, { Path } from "react-native-svg";
import { ds } from "@/theme/design";
import { feedApi, type FeedTabKey } from "@/api/feed.api";
import { videoApi } from "@/api/video.api";
import { getGpsCountryHint } from "@/services/CountryDetectionService";
import { FeedVideoItem } from "./FeedVideoItem";
import { CommentsSheet } from "./CommentsSheet";
import { ShareSheet } from "./ShareSheet";
import { PlaybackSheet } from "./PlaybackSheet";
import { useFeedSwipe } from "./useFeedSwipe";
import { FeedSwipeOnboarding } from "./FeedSwipeOnboarding";
import { FeedHeader, TABS, TAB_KEYS } from "./FeedHeader";
import { useUploadStore } from "@/store/upload.store";
import type { Video } from "@/types";
import { breadcrumb } from "@/services/sentry";

/** Minimum vertical drag, in px, before the first-time swipe hint counts the
 *  gesture as real and dismisses itself - filters out a stray tap or a
 *  barely-there accidental touch without adding any delay to a genuine swipe. */
const FEED_SWIPE_DISMISS_PX = 30;

/**
 * Home feed - the prototype's `isHome` surface, on real videos.
 *
 * A snapped vertical pager over GET /feed/{for-you,country} and /videos/feed.
 * Only the visible item plays; see FeedVideoItem for why that matters.
 */

/** The mark on the save confirmation - filled when saved, outline when removed. */
function ToastBookmarkGlyph({ filled }: { filled: boolean }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4-6.5 4v-16a1 1 0 0 1 1-1z"
        stroke={filled ? ds.onDark : ds.onDark}
        fill={filled ? ds.onDark : "none"}
        strokeWidth={1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Mirrors IpCountryService::DEFAULT_COUNTRY_CODE server-side - shown only
 *  once GET /feed/country has genuinely confirmed it can't resolve anything
 *  (never while still resolving; see countryTabLabel). */
const COUNTRY_FALLBACK_LABEL = "Nepal";

export function HomeScreen() {
  const { width, height: rawWindowH } = useWindowDimensions();
  // The pager's own height, not the window's. The tab bar takes ~86pt off the
  // bottom, so sizing items to the window makes every snap overshoot the
  // viewport and pushes the bottom of each post (where the scrubber lives) off
  // screen. Window height is only the pre-measurement fallback.
  const [listH, setListH] = useState(0);

  /**
   * The feed must not react to the keyboard at all.
   *
   * Android applies adjustResize to the ACTIVITY, so opening the keyboard in
   * the comments sheet shrinks the window - and with it both
   * useWindowDimensions() and this pager's own onLayout. Every post then
   * re-sized, which slid the video up and pushed its caption out from under
   * the sheet and into it.
   *
   * The app is portrait-locked (see app.config.ts), so the pager's real height
   * never legitimately shrinks: a smaller measurement only ever means a
   * keyboard is open somewhere above. Keeping the largest height ever seen
   * makes the feed a frozen background, which is what Instagram shows. The
   * root view still shrinks underneath - the feed is simply clipped at the
   * bottom, behind the sheet that caused it, rather than re-laid out.
   *
   * The window and the pager are frozen SEPARATELY. They are different
   * quantities - the pager is about a tab bar shorter than the window - so
   * running both through one high-water mark hands the pager the window's
   * height, making every page overshoot the viewport and pushing the video and
   * its caption down off the bottom. That is the exact failure the note above
   * about the tab bar warns against.
   */
  const maxWindowRef = useRef(0);
  const maxListRef = useRef(0);
  const freeze = useCallback((ref: { current: number }, h: number) => {
    if (h > ref.current) ref.current = h;
    return ref.current;
  }, []);

  const windowH = freeze(maxWindowRef, rawWindowH);
  const height = listH || windowH;
  const insets = useSafeAreaInsets();
  // Tab screens stay mounted, so leaving Home never unmounts the feed - without
  // this the active video keeps playing (with audio) under the other tabs.
  // Losing focus makes every item inactive, which hard-pauses the player via
  // the existing effect; regaining focus resumes the on-screen post.
  const focused = useIsFocused();
  const navigation = useNavigation<any>();
  const [tabKey, setTabKey] = useState<FeedTabKey>("for-you");
  const [index, setIndex] = useState(0);

  // Sound is a feed-wide preference, not per-post: unmuting one video and
  // scrolling should not silently re-mute the next.
  // Feed plays with sound. State is kept (and still applied to every player)
  // so a sound control can be dropped in later without rewiring; nothing
  // toggles it right now.
  const [muted] = useState(false);

  // Local overrides so a tap responds immediately; the server value stays the
  // baseline underneath and is what the count is derived from.
  const [likes, setLikes] = useState<Record<number, boolean>>({});
  const [saves, setSaves] = useState<Record<number, boolean>>({});

  /* These are the SIGNED-IN user's answers, and the tab tree is never unmounted
   * on logout - so without this a guest kept seeing the previous account's
   * hearts and bookmarks lit on the feed. The cached rows are scrubbed by
   * signOut; this clears the overrides sitting on top of them. */
  const authed = useAuthStore((s) => s.status === "authenticated");
  useEffect(() => {
    if (!authed) {
      setLikes({});
      setSaves({});
    }
  }, [authed]);

  // Which post's comments are open. Null = closed.
  const [commentsFor, setCommentsFor] = useState<number | null>(null);

  /** Which post's share sheet is open. Null = closed. */
  const [shareFor, setShareFor] = useState<number | null>(null);

  /** Which post's playback options (long-press) sheet is open. Null = closed. */
  const [optionsFor, setOptionsFor] = useState<number | null>(null);

  /** A side of the current video is held for 2x - see the pager's scrollEnabled. */
  const speedHinting = useSpeedBoost((s) => s.hinting);

  /* Playback preferences (speed / quality / loop / auto-scroll) drive the
   * players below, so the feed is what boots them: the cached snapshot first so
   * they are right on the first frame, then the server copy. Nothing else in
   * the app called hydrate(), which is why a speed set on one run used to come
   * back as 1x on the next. */
  useEffect(() => {
    void usePrefsStore.getState().hydrate().then(() => usePrefsStore.getState().sync());
  }, []);

  const query = useInfiniteQuery({
    queryKey: ["feed", tabKey],
    queryFn: async ({ pageParam }) => {
      // Only the country tab needs the GPS hint - it's a no-op (cached/instant)
      // for a guest who never granted location, and irrelevant to the other two.
      const hint = tabKey === "country" ? await getGpsCountryHint().catch(() => null) : null;
      return feedApi.byTab(tabKey, pageParam as number, 8, hint);
    },
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    staleTime: 60_000,
  });

  /**
   * The country tab's label, resolved independently of which tab is active -
   * it must be right on the very first frame, not only once the user taps
   * the tab. `per_page: 1` since only `meta.country_name` is needed here; the
   * tab's own query above already carries the same GPS hint, so the two stay
   * in agreement (never a label that names one country while the tab, once
   * opened, shows a different one's videos).
   */
  const countryMetaQuery = useQuery({
    queryKey: ["feed", "country-meta"],
    queryFn: async () => {
      const hint = await getGpsCountryHint().catch(() => null);
      return feedApi.country(1, 1, hint);
    },
    staleTime: 60_000,
  });

  /** Sticky across a transient failure - a `Nothing here yet` blip must not
   *  flash the tab back to the "still resolving" skeleton or the fallback. */
  const lastGoodCountryRef = useRef<{ code: string; name: string } | null>(null);
  const activeCountryMeta = tabKey === "country" ? query.data?.pages[0]?.meta : countryMetaQuery.data?.meta;
  if (activeCountryMeta?.country_code && activeCountryMeta?.country_name) {
    lastGoodCountryRef.current = { code: activeCountryMeta.country_code, name: activeCountryMeta.country_name };
  }
  const countryStillResolving =
    tabKey === "country" ? query.isLoading && !query.data : countryMetaQuery.isLoading && !countryMetaQuery.data;
  /** null while genuinely still resolving (renders the skeleton below); once
   *  GET /feed/country has actually answered - even with `country_code: null`
   *  - this always has a string, so the tab never flickers between names. */
  const countryTabLabel: string | null =
    activeCountryMeta?.country_name ??
    lastGoodCountryRef.current?.name ??
    (countryStillResolving ? null : COUNTRY_FALLBACK_LABEL);

  /**
   * The post the viewer just published, shown once at the top of the feed as
   * confirmation of what actually went up.
   *
   * Publishing happens in the background and returns the viewer here (see
   * upload.store.ts), so without this the post they just made is nowhere in
   * sight - a ranked feed has no reason to put their own new video first, and
   * "did that work?" is exactly the question they have at that moment.
   *
   * Taken from the store once and held locally, so it survives the tab
   * switching and refetching that would otherwise drop it, and disappears for
   * good when the feed unmounts. Consumed - not read - so a remount cannot
   * resurrect an old post.
   */
  const [justPublished, setJustPublished] = useState<Video | null>(null);
  const publishedWaiting = useUploadStore((s) => s.published);
  const consumePublished = useUploadStore((s) => s.consumePublished);

  useEffect(() => {
    if (!publishedWaiting) return;
    const v = consumePublished();
    if (v) setJustPublished(v);
  }, [publishedWaiting, consumePublished]);

  const videos: Video[] = useMemo(() => {
    const base = (query.data?.pages ?? []).flatMap((p) => p.data);
    if (!justPublished) return base;

    // Never twice: once the feed's own data catches up and includes the post,
    // the pinned copy steps aside rather than rendering a duplicate row (and a
    // duplicate key).
    return base.some((v) => v.id === justPublished.id) ? base : [justPublished, ...base];
  }, [query.data, justPublished]);


  /**
   * First-time Feed swipe hint (device-level, matching every other one-shot
   * popup on useOnboardingStore - see that file's own note on why this isn't
   * account-synced: the account-aware variant needs a backend field that
   * isn't deployed anywhere yet). Held back until real feed rows are on
   * screen so it never appears over the loading spinner or an empty tab.
   */
  const feedOnboarding = useOnboarding("feed.swipe", videos.length > 0);
  const swipeStartYRef = useRef<number | null>(null);
  const handleFeedSwipeStart = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    swipeStartYRef.current = e.nativeEvent.contentOffset.y;
  }, []);
  /** Runs on every scroll frame while the hint is up; once it's dismissed
   *  `feedOnboarding.open` is false and this is a single cheap no-op check -
   *  the vertical FlatList's own scrolling/snapping is untouched either way. */
  const handleFeedSwipeMove = useCallback((e: { nativeEvent: { contentOffset: { y: number } } }) => {
    if (!feedOnboarding.open || swipeStartYRef.current == null) return;
    if (Math.abs(e.nativeEvent.contentOffset.y - swipeStartYRef.current) > FEED_SWIPE_DISMISS_PX) {
      feedOnboarding.dismiss();
    }
  }, [feedOnboarding]);

  const onViewable = useRef(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const first = viewableItems[0];
    if (first?.index != null) {
      setIndex(first.index);
      // Which post was on screen when something broke. The id and position
      // only - never the caption, the author or anything the creator wrote.
      breadcrumb("feed", "Video changed", {
        index: first.index,
        videoId: (first.item as Video | undefined)?.id,
      });
    }
  }).current;
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const listRef = useRef<FlatList<Video>>(null);

  // Feed opened - the entry point for most sessions, and the screen most of
  // the TestFlight crash reports started from.
  useEffect(() => { breadcrumb("nav", "Feed opened"); }, []);

  /* Put the just-published post in front of them rather than leaving it above
   * the current scroll position. Declared after listRef, which it needs. */
  useEffect(() => {
    if (justPublished) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [justPublished]);

  /* ── tab changes ──────────────────────────────────────────────────────────
   * One route in, for both the header taps and the swipe.
   *
   * The pager keeps its scroll offset across a data change, so the offset has
   * to be set deliberately on every switch or a tab opens partway down a feed
   * it has never shown. It used to be set to 0 every time, which also threw away
   * where you were on a tab you had already been watching: leaving Following for
   * For You and coming back restarted Following from the top.
   *
   * So each tab's last position is remembered and restored instead. Refs, not
   * state: `goToTab` is handed to useFeedSwipe and read inside its gesture, so
   * its identity is kept stable rather than changing on every scroll. */
  const tabIndex = useRef<Partial<Record<FeedTabKey, number>>>({});
  const tabKeyRef = useRef(tabKey);
  tabKeyRef.current = tabKey;
  const indexRef = useRef(index);
  indexRef.current = index;
  const heightRef = useRef(height);
  heightRef.current = height;
  /**
   * Where the tab being entered should land, applied once its data is on screen.
   *
   * Not applied inline: the scroll would run in the same tick as setTabKey,
   * while the list still holds the OUTGOING tab's rows, and the offset would be
   * clamped against the wrong data. The effect below waits for the new rows.
   */
  const pendingRestore = useRef<number | null>(null);

  const goToTab = useCallback((key: FeedTabKey) => {
    /* Re-tapping the tab you are already on still jumps to the top, exactly as
       it did before positions were remembered. Only a header tap can land here
       - a committed swipe always targets a different tab. */
    if (key === tabKeyRef.current) {
      pendingRestore.current = null;
      tabIndex.current[key] = 0;
      setIndex(0);
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
      return;
    }
    tabIndex.current[tabKeyRef.current] = indexRef.current;
    const restore = tabIndex.current[key] ?? 0;
    pendingRestore.current = restore;
    setTabKey(key);
    setIndex(restore);
    // Nothing to wait for when returning to the top - and this keeps a fresh
    // tab pinned at 0 from the first frame, as before.
    if (restore === 0) listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  /** Put the entered tab back where it was left, once its rows exist. */
  useEffect(() => {
    const target = pendingRestore.current;
    if (target == null || !videos.length) return;
    pendingRestore.current = null;
    if (target === 0) return;
    // A feed can come back shorter than it was left - clamp rather than scroll
    // past the end, which strands the pager on a blank slide.
    const i = Math.min(target, videos.length - 1);
    listRef.current?.scrollToOffset({ offset: i * heightRef.current, animated: false });
    setIndex(i);
  }, [videos]);

  /** Whose profile a left-swipe off the last tab opens. The design derives this
   *  from scrollTop/slideHeight; `index` is already exactly that, kept by the
   *  pager's own viewability callback. */
  const creatorForCurrentReel = useCallback(
    () => videos[index]?.user?.username ?? null,
    [videos, index],
  );

  const swipe = useFeedSwipe({
    tabs: TAB_KEYS,
    current: tabKey,
    width,
    onChange: goToTab,
    creatorForCurrentReel,
  });

  const toggleLike = useCallback((v: Video) => {
    // Guests get the app's existing login/signup gate, with the tap replayed
    // after login - not an optimistic flip that a 401 quietly rolls back.
    if (!useAuthStore.getState().user) {
      useAuthGate.getState().open(() => toggleLike(v));
      return;
    }
    breadcrumb("action", "Like pressed", { videoId: v.id });
    const now = likes[v.id] ?? v.is_liked;
    // Only on the way TO liked, not on unlike - matches how the rest of
    // this app reserves a buzz for the positive action (FeedVideoItem's
    // own 2x-speed-hold and long-press haptics follow the same idea).
    if (!now && Platform.OS !== "web") {
      haptics.light();
    }
    setLikes((p) => ({ ...p, [v.id]: !now }));
    // Fire and forget: the optimistic flag already moved, and a failed like is
    // not worth yanking the UI back under the user's thumb mid-scroll.
    (now ? videoApi.unlike(v.id) : videoApi.like(v.id)).catch(() => {
      setLikes((p) => ({ ...p, [v.id]: now }));
    });
  }, [likes]);

  /**
   * The confirmation that slides up over the feed.
   *
   * One Animated value drives both the slide and the fade, and each new message
   * restarts it rather than queueing - tapping save twice should replace the
   * message, not show two in a row over a video the user is watching.
   */
  const [toast, setToast] = useState<{ text: string; saved: boolean } | null>(null);
  const toastY = useRef(new Animated.Value(0)).current;
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((text: string, saved: boolean) => {
    setToast({ text, saved });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastY.stopAnimation();
    toastY.setValue(0);
    Animated.spring(toastY, { toValue: 1, useNativeDriver: true, bounciness: 6, speed: 14 }).start();
    toastTimer.current = setTimeout(() => {
      Animated.timing(toastY, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
        setToast(null),
      );
    }, 2200);
  }, [toastY]);

  /* Swiping away mid-toast must not leave a timer running. */
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const toggleSave = useCallback((v: Video) => {
    if (!useAuthStore.getState().user) {
      useAuthGate.getState().open(() => toggleSave(v));
      return;
    }
    const now = saves[v.id] ?? v.is_saved;
    // Only on the way TO saved, not on un-save - same reasoning as toggleLike's own haptic above.
    if (!now && Platform.OS !== "web") {
      haptics.light();
    }
    setSaves((p) => ({ ...p, [v.id]: !now }));
    /* Said on the optimistic flip, not after the request: the bookmark has
       already filled in, and a confirmation that arrives a round trip later
       reads as a second, separate event. The catch below takes it back if the
       save did not stick, so nothing claims success that failed. */
    showToast(now ? "Removed from your saved reels" : "Saved to your reels", !now);
    (now ? videoApi.unsave(v.id) : videoApi.save(v.id)).catch(() => {
      setSaves((p) => ({ ...p, [v.id]: now }));
      showToast("Couldn't save that - try again", false);
    });
  }, [saves, showToast]);

  /**
   * Follow, from the feed rail's avatar "+" badge.
   *
   * Was a dead button - FeedActionRail already computed `showFollow` and
   * accepted an `onFollow` prop, but FeedVideoItem never passed one, so the
   * "+" did nothing for anyone, guest or logged in.
   *
   * Keyed by creator user id, NOT video id like likes/saves above: following
   * one creator has to update the badge on every OTHER post of theirs
   * already in the feed, not just the post the tap happened on.
   *
   * Deliberately simpler than ProfileTabScreen's own toggleFollow: this is a
   * compact rail badge with no room for a "requested" state, so a private
   * account's pending follow still just hides the "+" here (the request was
   * sent either way) rather than tracking pending/accepted separately -
   * ProfileTabScreen's own toggleFollow is still the one place that
   * distinction is shown.
   */
  const [follows, setFollows] = useState<Record<number, boolean>>({});
  const toggleFollow = useCallback((v: Video) => {
    if (!useAuthStore.getState().user) {
      useAuthGate.getState().open(() => toggleFollow(v));
      return;
    }
    const userId = v.user?.id;
    const username = v.user?.username;
    if (!userId || !username) return;
    // The id identifies the account for correlation; the username would put a
    // real person's handle in the dashboard for no diagnostic gain.
    breadcrumb("action", "Follow pressed", { targetUserId: userId });
    const now = follows[userId] ?? v.user?.is_following ?? false;
    setFollows((p) => ({ ...p, [userId]: !now }));
    (now ? videoApi.unfollow(username) : videoApi.follow(username)).catch(() => {
      setFollows((p) => ({ ...p, [userId]: now }));
    });
  }, [follows]);

  /**
   * Auto scroll: the active post reached its end, so move to the next one.
   *
   * Guarded on being the last item - at the end of what is loaded there is
   * nowhere to go, and scrollToIndex past the data throws. The next page is
   * already being fetched by onEndReached, so the feed simply stops here.
   */
  const advance = useCallback(() => {
    const next = index + 1;
    if (next >= videos.length) return;
    listRef.current?.scrollToIndex({ index: next, animated: true });
  }, [index, videos.length]);

  /** Opening the comments sheet is not gated on auth (guests can browse
   *  comments read-only - see CommentsSheet's own guest handling), so the
   *  haptic fires unconditionally here rather than only-on-the-positive-
   *  outcome like toggleLike/toggleSave's own. */
  const openComments = useCallback((videoId: number) => {
    if (Platform.OS !== "web") {
      haptics.light();
    }
    breadcrumb("action", "Comments opened", { videoId });
    setCommentsFor(videoId);
  }, []);

  const renderItem = useCallback(
    ({ item, index: i }: { item: Video; index: number }) => (
      <FeedVideoItem
        video={item}
        active={i === index}
        // Adjacent rows get a bounded head start on buffering. windowSize=3
        // below means this stays to previous/current/next, not the whole feed.
        preload={Math.abs(i - index) === 1}
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
        onShare={() => { breadcrumb("action", "Share opened", { videoId: item.id }); setShareFor(item.id); }}
        onPlaybackOptions={() => setOptionsFor(item.id)}
        onEnded={advance}
      />
    ),
    [focused, index, width, height, muted, likes, saves, follows, toggleLike, toggleSave, toggleFollow, openComments, advance],
  );

  /** The post whose playback sheet is open. Resolved once so the sheet's save
   *  state and its toggle act on the same row. */
  const optionsVideo = useMemo(
    () => videos.find((v) => v.id === optionsFor) ?? null,
    [videos, optionsFor],
  );

  const empty = !query.isLoading && videos.length === 0;

  return (
    <View style={styles.root}>
      {/* The whole pane travels with the finger - loading and empty states
          included, since an empty tab is exactly when you want to swipe off it.
          The two offsets are what keep the vertical pager intact: 10px sideways
          claims the gesture, 8px downward hands it back to the list. That ratio
          is the prototype's own axis rule (horizontal only when it clearly beats
          vertical), expressed the way gesture-handler wants it. */}
      <PanGestureHandler
        onGestureEvent={swipe.onGestureEvent}
        onHandlerStateChange={swipe.onHandlerStateChange}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-8, 8]}
      >
        <Animated.View style={[swipe.paneStyle, styles.videoPaneBg]}>
          {query.isLoading ? (
            <View style={[styles.fill, styles.center]}>
              <ActivityIndicator color={ds.onDark} />
            </View>
          ) : empty ? (
            <View style={[styles.fill, styles.center, { paddingHorizontal: 40 }]}>
              <Text style={styles.emptyTitle}>
                {query.isError ? "Couldn't load the feed" : "Nothing here yet"}
              </Text>
              <Text style={styles.emptyBody}>
                {query.isError
                  ? "Check your connection and try again."
                  : tabKey === "following"
                    ? "Follow some creators and their posts will show up here."
                    : "No videos to show right now."}
              </Text>
              <Pressable onPress={() => query.refetch()} style={styles.retry} accessibilityRole="button">
                <Text style={styles.retryText}>Try again</Text>
              </Pressable>
            </View>
          ) : (
            <FlatList
              ref={listRef}
              onLayout={(e) => setListH(freeze(maxListRef, e.nativeEvent.layout.height))}
              data={videos}
              keyExtractor={(v, i) => `${v.id}-${i}`}
              renderItem={renderItem}
              // No pagingEnabled: it snaps by the scroll view's FRAME while
              // snapToInterval below snaps by the ITEM. They agree here only
              // because the list is measured to its own viewport - the moment
              // anything insets it they fight, which is exactly how the profile
              // viewer's scroll started drifting between posts. snapToInterval
              // alone is correct at any height.
              showsVerticalScrollIndicator={false}
              // The feed is a frozen background while the comments sheet is up.
              // iOS otherwise inserts its own keyboard inset into the nearest
              // scroll view and shifts the content - which slid the video up and
              // pushed its caption into the sheet. Android's equivalent (the
              // activity resizing under adjustResize) is handled by freezeH.
              automaticallyAdjustKeyboardInsets={false}
              contentInsetAdjustmentBehavior="never"
              automaticallyAdjustContentInsets={false}
              /* Frozen while a side of the video is held for 2x. Not cosmetic:
                 this list takes the responder as soon as a touch moves
                 vertically, so without it the pull-down towards the tab bar
                 scrolls to the previous post and the lock can never be
                 reached. */
              scrollEnabled={!speedHinting}
              snapToInterval={height}
              snapToAlignment="start"
              decelerationRate="fast"
              // Caps a hard flick at one post instead of letting momentum skip
              // several - the "one content per swipe" rule, same as the viewer.
              disableIntervalMomentum
              onViewableItemsChanged={onViewable}
              viewabilityConfig={viewabilityConfig}
              getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
              windowSize={3}
              initialNumToRender={2}
              maxToRenderPerBatch={2}
              /* ── removeClippedSubviews is deliberately NOT set ────────────
               * It used to be on, and it was eating the first tap on the
               * action rail (comment, like, save, share) of a post the user
               * had just swiped to. The failure is invisible: the button
               * simply does nothing, a second tap works, and it reads as lag
               * rather than as a dropped touch.
               *
               * The mechanism is that removeClippedSubviews detaches
               * off-screen rows from the native view hierarchy and re-attaches
               * them on the way back in. A row that has just been re-attached
               * can miss touches until the next layout pass - and that is
               * precisely the row you swiped to, which is the one you are
               * about to tap.
               *
               * Turning it off costs almost nothing here. windowSize={3} with
               * maxToRenderPerBatch={2} already caps this list at roughly
               * three mounted rows, so there is barely anything off-screen
               * left to clip: the setting was buying a rounding error in
               * memory and charging a dropped tap for it.
               *
               * Do not re-add it without re-testing this interaction. */
              onEndReachedThreshold={0.6}
              onEndReached={() => {
                if (query.hasNextPage && !query.isFetchingNextPage) query.fetchNextPage();
              }}
              // Purely observational - dismisses the first-time swipe hint on
              // a real drag (see FEED_SWIPE_DISMISS_PX above). Doesn't touch
              // scrolling/snapping itself, and is a no-op once the hint has
              // already been dismissed once.
              onScrollBeginDrag={handleFeedSwipeStart}
              onScroll={handleFeedSwipeMove}
              scrollEventThrottle={16}
            />
          )}
        </Animated.View>
      </PanGestureHandler>

      <FeedHeader
        tabKey={tabKey}
        countryTabLabel={countryTabLabel}
        topInset={insets.top + 8}
        onTabPress={goToTab}
        onLivePress={() => navigation.navigate("Live")}
        onSearchPress={() => navigation.navigate("Search")}
      />

      {feedOnboarding.open && <FeedSwipeOnboarding />}

      <CommentsSheet
        videoId={commentsFor}
        // Who a gift from the comments composer goes to.
        creator={(() => {
          const u = videos.find((v) => v.id === commentsFor)?.user;
          return u?.id ? { id: u.id, username: u.username } : null;
        })()}
        // `allow_comments === false` is the creator switching them off; an
        // absent field means the older default, which is on.
        commentsDisabled={videos.find((v) => v.id === commentsFor)?.allow_comments === false}
        open={commentsFor != null}
        onClose={() => setCommentsFor(null)}
        hideComposerForGuest
      />

      <ShareSheet
        video={videos.find((v) => v.id === shareFor) ?? null}
        open={shareFor != null}
        onClose={() => setShareFor(null)}
      />

      <PlaybackSheet
        video={optionsVideo}
        open={optionsFor != null}
        saved={optionsVideo ? (saves[optionsVideo.id] ?? optionsVideo.is_saved) : false}
        onToggleSave={() => optionsVideo && toggleSave(optionsVideo)}
        onClose={() => setOptionsFor(null)}
      />

      {/* Above the tab bar, never over it - the bar is how you leave, and a
          confirmation that covers it is worse than no confirmation. */}
      {!!toast && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.toastWrap,
            {
              // Just clear of the tab bar rather than floating well above it -
              // 86pt bar, so this rides a few points over its top edge.
              bottom: insets.bottom + 92,
              opacity: toastY,
              transform: [{ translateY: toastY.interpolate({ inputRange: [0, 1], outputRange: [22, 0] }) }],
            },
          ]}
        >
          {/* Real blur, not a flat translucent fill: over video the frame keeps
              moving behind it, which is what sells the glass. The border is the
              other half - a hairline of white at low alpha is what gives it an
              edge instead of looking like a smudge. */}
          <BlurView intensity={38} tint="dark" style={styles.toast}>
            <View style={[styles.toastIcon, toast.saved && styles.toastIconOn]}>
              <ToastBookmarkGlyph filled={toast.saved} />
            </View>
            <Text style={styles.toastText} numberOfLines={2}>{toast.text}</Text>
          </BlurView>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * Save confirmation.
   *
   * Two views, not one: the wrapper carries the shadow and the animation, the
   * inner BlurView carries the glass and clips to the radius. They cannot be
   * merged - `overflow: hidden` is what rounds the blur, and it would clip the
   * shadow off at the same edge.
   *
   * Sized to its content and centred rather than stretched across the screen. A
   * full-width bar reads as chrome; a pill reads as a passing confirmation.
   */
  toastWrap: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "86%",
    borderRadius: 999,
    shadowColor: "#000",
    shadowOpacity: 0.28,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  toast: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 9,
    paddingRight: 18,
    borderRadius: 999,
    overflow: "hidden",
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.22)",
  },
  toastIcon: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.16)",
  },
  toastIconOn: { backgroundColor: ds.accent },
  toastText: { flexShrink: 1, color: ds.onDark, fontSize: 13, fontWeight: "600", lineHeight: 17 },

  // True black, matching each item's letterbox - otherwise the gap between
  // snapped items reads as a lighter band.
  root: { flex: 1, backgroundColor: "#000000" },
  videoPaneBg: { backgroundColor: "#000000" },
  fill: { ...StyleSheet.absoluteFill },
  center: { alignItems: "center", justifyContent: "center", gap: 8 },
  emptyTitle: { color: ds.onDark, fontSize: 16, fontWeight: "700", textAlign: "center" },
  emptyBody: { color: "rgba(255,255,255,0.65)", fontSize: 13.5, textAlign: "center", lineHeight: 19 },
  retry: {
    marginTop: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ds.accent,
  },
  retryText: { color: ds.onDark, fontWeight: "700", fontSize: 13.5 },
});
