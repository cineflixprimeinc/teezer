import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  Platform,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { useVideoPlayer, VideoView } from "expo-video";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { runOnJS } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFocusEffect, useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import * as MediaLibrary from "expo-media-library/legacy";
import { BottomSheet } from "@/components/BottomSheet";
import { MenuRow } from "@/components/sheet/MenuRow";
import { ReportSheet } from "@/components/report/ReportSheet";
import { storyApi, storySetting, STORY_REACTIONS, STORY_REACTION_EMOJI, type Story, type StoryReactionType } from "@/api/story.api";
import { inboxApi, type ShareSuggestion, type StoryFeedItem } from "@/api/inbox.api";
import { RepostAttributionPill } from "./StoryUploadScreen";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import type { RootStackParamList } from "@/navigation/types";
import { LinearGradient } from "expo-linear-gradient";

/**
 * Story viewer - the design's `storyViewerOpen` surface.
 *
 * One author at a time. Their stories play in order, each for SLIDE_MS (a video
 * for its own length), advancing automatically and closing when the last one
 * ends.
 *
 * The progress bar is the clock. There is no separate timer: the same Animated
 * value drives the bar and fires the advance on completion, so what is on screen
 * and what happens next cannot disagree - which is the usual bug in these.
 */

const SLIDE_MS = 5000;

/* REACTIONS/REACTION_EMOJI moved to story.api.ts as STORY_REACTIONS/
   STORY_REACTION_EMOJI - ChatScreen/InboxScreen need the identical lookup
   for story_reaction messages, and duplicating the literal emoji list a
   third time is exactly how the two lists would eventually drift. */

function CloseGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path d="m6 6 12 12M18 6 6 18" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" />
    </Svg>
  );
}

function DotsGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1.7} fill="#fff" />
      <Circle cx={12} cy={12} r={1.7} fill="#fff" />
      <Circle cx={12} cy={19} r={1.7} fill="#fff" />
    </Svg>
  );
}

function SoundGlyph({ muted }: { muted: boolean }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" stroke="#fff" strokeWidth={1.9} strokeLinejoin="round" />
      {muted ? (
        <Path d="m16 9.5 4 5m0-5-4 5" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" />
      ) : (
        <Path d="M15.5 9a4.2 4.2 0 0 1 0 6" stroke="#fff" strokeWidth={1.9} strokeLinecap="round" />
      )}
    </Svg>
  );
}

function EyeGlyph() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path d="M2.1 12a10.7 10.7 0 0 1 19.8 0 10.7 10.7 0 0 1-19.8 0" stroke="#fff" strokeWidth={1.8} />
      <Circle cx={12} cy={12} r={3} stroke="#fff" strokeWidth={1.8} />
    </Svg>
  );
}

/** The eye on the viewers sheet header - dark, since that sheet is light. */
function EyeGlyphDark() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path d="M2.1 12a10.7 10.7 0 0 1 19.8 0 10.7 10.7 0 0 1-19.8 0" stroke="#121014" strokeWidth={1.8} />
      <Circle cx={12} cy={12} r={3} stroke="#121014" strokeWidth={1.8} />
    </Svg>
  );
}

/** Same send icon ChatScreen's own composer already uses - reused, not a
 *  new global send component, per request. */
function SendGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="#fff">
      <Path d="M19.4999 2.00098C20.0944 2.00063 20.6989 2.15072 21.2499 2.46875C22.924 3.43525 23.4977 5.57598 22.5312 7.25001L15.0311 20.2403C14.0646 21.9142 11.9238 22.488 10.2498 21.5215C9.41372 21.0387 8.85157 20.2605 8.61994 19.3975L7.1209 13.8028L15.8905 8.73927C16.3687 8.46311 16.5327 7.85126 16.2567 7.37306C15.9805 6.89505 15.3686 6.73096 14.8905 7.00685L6.12089 12.0713L2.02515 7.97462C0.658428 6.60771 0.658787 4.39204 2.02515 3.02539C2.65731 2.39319 3.53383 2.00021 4.49978 2L19.4999 2.00098Z" />
    </Svg>
  );
}

/** The one heart path this app already uses for "like/love" everywhere else
 *  (ChatScreen's own double-tap-heart burst) - reused here rather than a
 *  second heart drawn from scratch, so the standalone like action beside the
 *  reply bar reads as the same glyph as the rest of Reelsoo. Always outline,
 *  never a persistent "filled" state - a story reaction has no per-viewer
 *  "you already liked this" field to reflect (react() is a fire-and-forget
 *  event, same as every quick-reaction emoji below), so the tap feedback is
 *  the existing ReactionBurst pop, not the icon itself toggling. */
function HeartGlyph({ color = "#fff" }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7z"
        stroke={color}
        strokeWidth={1.8}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Same curved reply-arrow the feed's own Share control uses
 *  (FeedActionRail.tsx's ShareGlyph) - one canonical "share" glyph reused
 *  here, not a second one invented for the Story viewer specifically. */
function ShareArrowGlyph({ color = "#fff" }: { color?: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={color}>
      <Path d="M13 14H11C7.54202 14 4.53953 15.9502 3.03239 18.8107C3.01093 18.5433 3 18.2729 3 18C3 12.4772 7.47715 8 13 8V3L23 11L13 19V14Z" />
    </Svg>
  );
}

/** The subtle "premium, not excessive" pop a tapped reaction does - floats up
 *  and fades over the emoji it came from, then unmounts itself. The Story
 *  stays fully visible throughout; this never blocks or dims anything. */
function ReactionBurst({ emoji, onDone }: { emoji: string; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 700,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(onDone);
  }, [anim, onDone]);

  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [0, -54] });
  const opacity = anim.interpolate({ inputRange: [0, 0.15, 0.75, 1], outputRange: [0, 1, 1, 0] });
  const scale = anim.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0.6, 1.2, 1] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.reactionBurst, { opacity, transform: [{ translateY }, { scale }] }]}
    >
      <Text style={styles.reactionBurstEmoji}>{emoji}</Text>
    </Animated.View>
  );
}

/** "Just now", "3h" - a story never lives past 24h, so hours is the widest unit. */
function ago(iso?: string | null): string {
  if (!iso) return "";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h`;
}

/** Just enough to paint the sliding-in layer of a Story-to-Story transition
 *  before the real thing (video player, reactions, viewers, everything else
 *  `story`/`author_` drive) is actually committed as current. */
interface IncomingPreview {
  avatar: string | null;
  name: string | null;
  username: string;
  isVerified?: boolean;
  thumbnailUrl: string | null;
  isVideo: boolean;
}

export function StoryViewerScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "StoryViewer">>();
  const { width } = useWindowDimensions();
  const me = useAuthStore((s) => s.user);
  const qc = useQueryClient();

  const { username, storyId } = route.params;
  const [index, setIndex] = useState(0);
  /** Set when a specific storyId was requested (e.g. tapping a story-context
   *  chat bubble) and it isn't among this author's current stories - expired
   *  or deleted since. Distinct from "author has nothing at all", so the
   *  right copy shows: "Story is no longer available", not the generic
   *  empty state. */
  const [storyUnavailable, setStoryUnavailable] = useState(false);
  const [muted, setMuted] = useState(false);
  const [paused, setPaused] = useState(false);
  const [reply, setReply] = useState("");
  const [viewersOpen, setViewersOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [aiInfoOpen, setAiInfoOpen] = useState(false);
  /** Brief acknowledgement - a reply or reaction leaves nothing visible behind. */
  const [sent, setSent] = useState<string | null>(null);
  /** While the reply input is focused, the tap-zones (advance/pause) are
   *  disabled - typing takes priority over Story navigation gestures. */
  const [replyFocused, setReplyFocused] = useState(false);
  /** The design keeps quick reactions hidden until the smiley is tapped. */
  const [reactionsOpen, setReactionsOpen] = useState(false);
  /** One floating reaction pop at a time - subtle, not a stacked-particle
   *  system; a fast double-tap just restarts it (see the `key` on mount). */
  const [burst, setBurst] = useState<{ key: number; emoji: string } | null>(null);
  const burstKeyRef = useRef(0);
  /** Measured height of the reply bar's own content (message box + reaction
   *  row), so the media above it can be inset by exactly that much rather
   *  than a guessed constant - the bar is now a solid, fixed footer, not a
   *  translucent overlay floating on top of the media, so the media must
   *  actually stop above it instead of rendering (and being hidden) behind
   *  it. Falls back to a reasonable estimate before the first layout pass. */
  const [barHeight, setBarHeight] = useState(0);

  /* Reply bar's live "bottom" offset - insets.bottom+12 at rest, the
     keyboard's own reported height (flush, no added gap) while it's open.
     One continuous Animated value rather than two conditional styles, so the
     transition itself animates instead of jumping the moment the keyboard
     crosses open/closed - same reasoning CommentsSheet.tsx's own kbAnim doc
     comment gives. */
  const kbAnim = useRef(new Animated.Value(insets.bottom + 12)).current;

  useEffect(() => {
    const ios = Platform.OS === "ios";
    const slide = (to: number, duration?: number) =>
      Animated.timing(kbAnim, {
        toValue: to,
        duration: duration && duration > 0 ? duration : 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false,
      }).start();

    // keyboardWill*/keyboardDid* is the exact same iOS/Android split
    // CommentsSheet.tsx already uses - iOS fires the "will" events ahead of
    // the animation so this can track it in step; Android has no "will"
    // event at all.
    const onShow = Keyboard.addListener(ios ? "keyboardWillShow" : "keyboardDidShow", (e) => {
      const h = e.endCoordinates?.height ?? 0;
      // Flush against the keyboard, not +12 above it - that gap used to show
      // a sliver of the Story's own dark background between the reply bar
      // and the keyboard instead of one continuous surface.
      if (h > 0) slide(h, e.duration);
    });
    const onHide = Keyboard.addListener(ios ? "keyboardWillHide" : "keyboardDidHide", (e) => {
      slide(insets.bottom + 12, e?.duration);
    });
    return () => { onShow.remove(); onHide.remove(); };
  }, [kbAnim, insets.bottom]);

  const author = useQuery({
    queryKey: ["user-stories", username],
    queryFn: () => storyApi.userStories(username),
    staleTime: 30_000,
  });

  const stories: Story[] = useMemo(() => author.data?.stories ?? [], [author.data]);
  const story: Story | undefined = stories[index];

  /**
   * Same query key + ordering the Inbox rail itself uses (InboxScreen.tsx's
   * `myStory`/`storyAuthors`), so opening the viewer from there hits an
   * already-warm cache instead of a second fetch, and "next/previous author"
   * moves through the exact sequence the rail shows - own story leading,
   * then everyone else unseen-first, stable within each group.
   */
  const rail = useQuery({
    queryKey: ["stories-feed"],
    queryFn: () => inboxApi.storyFeed(),
    enabled: !!me,
    staleTime: 60_000,
  });
  const authorSequence = useMemo(() => {
    const rows = rail.data ?? [];
    const mine = rows.find((s: StoryFeedItem) => s.is_own && !!s.stories?.length);
    const others = rows
      .filter((s: StoryFeedItem) => !s.is_own && !!s.stories?.length)
      .sort((a, b) => Number(b.has_unseen) - Number(a.has_unseen));
    return [...(mine ? [mine] : []), ...others].map((s) => s.user.username);
  }, [rail.data]);

  /**
   * Warms whatever the NEXT `navigation.setParams({ username })` hop is
   * going to need, before advance() ever makes it.
   *
   * This is the actual cause of the user-to-user jump/flash: crossing into
   * the next author swaps `route.params.username`, which re-keys the
   * `author` useQuery above cold - so the screen fell through to the
   * full-screen "author.isLoading" spinner for however long that fetch
   * took, right in the middle of what was supposed to read as one smooth
   * transition. Same story metadata request `userStories()` already makes,
   * just started a slide early instead of at the exact moment it's needed -
   * by the time the boundary is actually crossed, react-query's own cache
   * (staleTime: 30_000, matching the `author` query above) already has it,
   * so `author.isLoading` is false on arrival.
   *
   * Only ever prefetches ONE user (the very next hand-off, in whichever
   * direction is currently reachable) - not the whole rail - and only once
   * that hand-off is actually one tap away (the current story is the first
   * or last in this author's own list).
   */
  /** Populated once the prefetch below resolves - read by advance() to build
   *  the sliding-in preview layer for a cross-author hand-off. Correctness
   *  doesn't depend on this: advance() always has the header half (avatar/
   *  name) synchronously from `rail.data` regardless, and simply shows no
   *  thumbnail yet if this hasn't resolved in time. */
  const nextAuthorPreview = useRef<IncomingPreview | null>(null);
  const prevAuthorPreview = useRef<IncomingPreview | null>(null);

  useEffect(() => {
    if (stories.length === 0) return;
    const pos = authorSequence.indexOf(username);
    if (pos < 0) return;
    const goingForward = index === stories.length - 1;
    const goingBackward = index === 0;
    const candidate = goingForward ? authorSequence[pos + 1] : goingBackward ? authorSequence[pos - 1] : undefined;
    if (!candidate) return;
    const railUser = (rail.data ?? []).find((r: StoryFeedItem) => r.user.username === candidate)?.user;
    qc.prefetchQuery({
      queryKey: ["user-stories", candidate],
      queryFn: () => storyApi.userStories(candidate),
      staleTime: 30_000,
    })
      .then((data) => {
        // The slide the handoff will actually land on - not every one of
        // theirs, just the one about to become visible.
        const first = (data as { stories?: Story[] } | undefined)?.stories?.[0];
        const firstMedia = first?.media?.[0];
        const preview: IncomingPreview = {
          avatar: railUser?.avatar ?? null,
          name: railUser?.display_name ?? null,
          username: candidate,
          isVerified: railUser?.is_verified,
          thumbnailUrl: firstMedia
            ? (firstMedia.media_type === "video" ? (firstMedia.thumbnail_url ?? null) : (firstMedia.media_url ?? null))
            : null,
          isVideo: firstMedia?.media_type === "video",
        };
        if (goingForward) nextAuthorPreview.current = preview;
        else prevAuthorPreview.current = preview;
        if (firstMedia?.media_type === "image" && firstMedia.media_url) {
          void Image.prefetch(firstMedia.media_url).catch(() => {});
        }
      })
      .catch(() => {});
  }, [index, stories.length, username, authorSequence, qc, rail.data]);

  /** Same idea, one slide ahead, for images within the SAME author's list -
   *  the cross-author case above only ever needs the first slide fetched
   *  early; this covers every other slide boundary. */
  useEffect(() => {
    const next = stories[index + 1];
    const url = next?.media?.[0]?.media_url;
    if (url && next?.media?.[0]?.media_type === "image") {
      void Image.prefetch(url).catch(() => {});
    }
  }, [stories, index]);

  /**
   * Is this mine?
   *
   * By id first - the only comparison that cannot be wrong. Username was the
   * sole test before, and handles differ by case between endpoints, so one
   * mismatch made your own story report as someone else's: the menu then hid
   * Delete and offered Report on your own post.
   *
   * The story's own user_id is preferred over the author payload, since that is
   * the record being acted on. Username stays as a last resort, case-folded, for
   * payloads that carry no id.
   */
  const isOwn = !!me && (
    (story?.user_id != null && story.user_id === me.id)
    || (author.data?.user?.id != null && author.data.user.id === me.id)
    || (!!author.data?.user?.username
        && author.data.user.username.toLowerCase() === (me.username ?? "").toLowerCase())
  );

  /* Only for your own story - nobody else may see who watched. */
  const viewers = useQuery({
    queryKey: ["story-viewers", story?.id],
    queryFn: () => storyApi.viewers(story!.id),
    enabled: !!story?.id && isOwn,
    staleTime: 30_000,
  });

  const media = story?.media?.[0];
  const isVideo = media?.media_type === "video";
  /** Whether this story can make a sound at all - see the control below. */
  const hasSound = isVideo || !!story?.music_id;

  /**
   * ONE player for the whole time this viewer is open, not one per slide.
   *
   * useVideoPlayer keys the player on the source, so picking a new rendition
   * used to tear the old native player down and build a new one on every
   * single story-to-story move that involved video - exactly the
   * destroy → recreate → wait → load sequence that flickers between
   * stories. replaceAsync() below swaps the loaded asset on this same
   * persistent player instead, which is the pattern expo-video itself
   * recommends over remounting the hook.
   */
  const player = useVideoPlayer(null, (p) => {
    p.loop = false;
  });

  /** Loads whichever video is now active onto the persistent player above.
   *  Runs once per actual video change, not per render - re-calling
   *  replaceAsync with the same source it already has would restart
   *  playback from zero every time an unrelated prop (mute, pause) changed. */
  useEffect(() => {
    if (!isVideo || !media?.media_url) return;
    let cancelled = false;
    player.replaceAsync(media.media_url).then(() => {
      if (cancelled) return;
      player.muted = muted;
      player.play();
    }).catch(() => {});
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isVideo, media?.media_url]);

  /** Hold-to-pause (and the reply input stealing focus) is supposed to pause
   *  the story - it always paused the progress bar's own clock, but nothing
   *  ever told the actual video player to stop, so audio/playback quietly
   *  kept running underneath a "paused" story. */
  useEffect(() => {
    if (!isVideo) return;
    if (paused) player.pause();
    else player.play();
  }, [paused, isVideo, player]);

  /* ── the clock ─────────────────────────────────────────────────────────── */

  const progress = useRef(new Animated.Value(0)).current;
  const indexRef = useRef(index);
  indexRef.current = index;
  const countRef = useRef(stories.length);
  countRef.current = stories.length;

  const close = useCallback(() => navigation.goBack(), [navigation]);

  /**
   * The root cause of "reposting can silently cancel the upload page":
   * navigating to StoryComposer (Repost to My Story) PUSHES it on top of
   * this screen - it does not unmount StoryViewer, which stays mounted
   * underneath with no built-in awareness that it's no longer the active
   * screen. Its own progress timer and video player kept running exactly as
   * if it were still visible, so a few seconds into editing the repost, the
   * still-ticking background viewer would auto-advance or even close() -
   * navigation.goBack(), popping whatever screen actually happens to be on
   * top of the stack at that moment, which is the composer. There was
   * previously no useFocusEffect/isFocused check anywhere in this file.
   *
   * This is the general fix, not a repost-specific patch: whenever this
   * screen loses navigation focus for ANY reason (repost, tapping into a
   * shared profile/product from a Story reply preview, anything future),
   * force `paused` true so the progress timer and video both stop - the
   * exact same `paused` the three-dot menu/share/reactions/message-input
   * already use, just driven by focus instead of a local overlay. Regaining
   * focus resumes normally, from the exact position it was left at (the
   * progress bar's own value was never touched, only its clock).
   */
  useFocusEffect(
    useCallback(() => {
      setPaused(false);
      return () => setPaused(true);
    }, []),
  );

  /**
   * Horizontal Story-to-Story handoff, replacing the old rotateY/perspective
   * page-turn: one Animated.Value drives BOTH layers at once - the outgoing
   * Story slides fully off in `direction`, the incoming preview (rendered
   * from `incoming`, prepared and passed in below) slides in from the
   * opposite edge over the exact same motion, because its own translateX is
   * this same value offset by one screen width. They are the same
   * transition, not two independent ones cued to start together.
   *
   * -width..0..+width: at rest this sits at 0. A forward move animates to
   * -width (current Story exits left, next enters from the right); backward
   * mirrors it to +width.
   */
  const slideX = useRef(new Animated.Value(0)).current;
  const SLIDE_TRANSITION_MS = 300;
  const SLIDE_SETTLE_MS = 90;
  /** Locks out a second transition while one is already running - advance()
   *  goes through here for BOTH the same-user and cross-user case, so this
   *  one guard covers both. Without it, a rapid double-tap started a second
   *  Animated.timing on the same value before the first's callback fired;
   *  RN's Animated cancels the interrupted one, but the interrupted run's
   *  callback still fired (with `finished: false`, which was never checked)
   *  and called `apply()` anyway - two index/author advances for one
   *  story-length of taps, corrupting index/progress state. */
  const transitioning = useRef(false);
  /** The next Story's header + thumbnail, shown as the sliding-in layer
   *  while the real one (video player, reactions, everything else) is still
   *  either mid-fetch (cross-author) or simply about to become the active
   *  `story` (same-author) - see runSlide. `direction` is what the render
   *  below offsets the preview layer's own translateX by (one screen width,
   *  the opposite sign of where the outgoing layer is headed), so the two
   *  move as one motion. `preview` is null only in the rare case a cross-
   *  author prefetch hasn't resolved yet - the render below still slides a
   *  plain placeholder in rather than showing nothing. Cleared the instant
   *  the real content takes over, at the same on-screen position, so there
   *  is nothing to visibly hand off. */
  const [transition, setTransition] = useState<{ direction: 1 | -1; preview: IncomingPreview | null } | null>(null);

  /**
   * Finishes a transition already in progress - animates slideX the rest of
   * the way to -direction*width from wherever it currently sits (0 for the
   * tap/auto path below; wherever a finger left it for the manual-swipe
   * path further down), then commits. Assumes the caller already set
   * `transitioning.current = true` and populated `transition` - both paths
   * do this at their own start, not here, since manual swipe needs to set
   * them the moment a drag begins, before it's known whether it will finish
   * or spring back.
   */
  const settle = useCallback((direction: 1 | -1, apply: () => void) => {
    Animated.timing(slideX, {
      toValue: -direction * width,
      duration: SLIDE_TRANSITION_MS,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (!finished) { transitioning.current = false; setTransition(null); return; }
      // apply() commits the real index/author state, but React hasn't
      // necessarily re-rendered with it yet at this exact line - snapping
      // slideX straight to 0 here would reveal whatever the main layer
      // still happens to be showing at that instant, which risks one frame
      // of the OLD Story at the final position. Instead land the main layer
      // at direction*width (still fully off-screen, exactly where the
      // preview layer already was) and let it glide the short last stretch
      // in - same trick the previous flip animation used (commit while
      // still hidden, then reveal), so React has a beat to actually commit
      // the new content before any of it becomes visible.
      apply();
      slideX.setValue(direction * width);
      setTransition(null);
      Animated.timing(slideX, {
        toValue: 0,
        duration: SLIDE_SETTLE_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => { transitioning.current = false; });
    });
  }, [slideX, width]);

  /** Tap/auto path: starts a transition from rest (slideX at 0). Manual
   *  swipe further down drives slideX itself while dragging and only calls
   *  `settle` directly once released past the threshold - it's already
   *  mid-flight by then, so it doesn't go through this. */
  const runSlide = useCallback((direction: 1 | -1, apply: () => void, preview: IncomingPreview | null) => {
    if (transitioning.current) return;
    transitioning.current = true;
    setTransition({ direction, preview });
    settle(direction, apply);
  }, [settle]);

  /** Which end of the incoming author's own story list to land on - "start"
   *  for a forward hand-off (their first story), "end" for backward (their
   *  last) - the same convention Instagram/TikTok's own trays use. Read once
   *  their story list has actually loaded, by the effect below. */
  const enterAt = useRef<"start" | "end">("start");
  const appliedFor = useRef(username);

  useEffect(() => {
    if (author.isLoading || appliedFor.current === username) return;
    appliedFor.current = username;

    if (storyId != null) {
      // Don't attempt to open unavailable content - jump to the exact
      // story that was requested, or flag it missing rather than silently
      // opening a different one of this author's stories in its place.
      const at = stories.findIndex((s) => s.id === storyId);
      if (at === -1) {
        setStoryUnavailable(true);
        setPaused(true);
        return;
      }
      setIndex(at);
    } else if (stories.length > 0) {
      setIndex(enterAt.current === "end" ? stories.length - 1 : 0);
    } else {
      // This author's stories vanished (expired/deleted) between the rail's
      // own fetch and this hand-off actually landing - authorSequence still
      // lists them, but userStories() just came back empty. Move on to
      // whichever neighbour the hand-off was heading toward rather than
      // trapping the viewer on a dead "No stories to show" screen.
      const pos = authorSequence.indexOf(username);
      const fallback = enterAt.current === "end" ? authorSequence[pos - 1] : authorSequence[pos + 1];
      if (fallback) {
        navigation.setParams({ username: fallback });
      } else {
        close();
      }
      return;
    }
    setStoryUnavailable(false);
    setPaused(false);
    setReply("");
    setViewersOpen(false);
    setActionsOpen(false);
  }, [username, storyId, author.isLoading, stories.length, authorSequence, navigation, close]);

  /** Work held until the options sheet has finished animating out - see it. */
  const pendingAction = useRef<null | (() => void)>(null);
  const closeThen = useCallback((fn: () => void) => {
    pendingAction.current = fn;
    setActionsOpen(false);
  }, []);

  /** Shown for a moment, then gone - it is an acknowledgement, not a status. */
  const flash = useCallback((msg: string) => {
    setSent(msg);
    setTimeout(() => setSent((s) => (s === msg ? null : s)), 1800);
  }, []);

  const sendReply = useCallback(() => {
    const body = reply.trim();
    if (!body || !story) return;
    // Replying is tied to an account, same as every other write action on
    // a story - this had no check at all, so a guest's reply silently
    // 401'd and just showed "Couldn't send that".
    if (!me) {
      useAuthGate.getState().open(() => sendReply());
      return;
    }
    setReply("");
    storyApi
      .reply(story.id, body)
      .then(() => flash("Reply sent"))
      .catch(() => flash("Couldn't send that"));
  }, [reply, story?.id, flash, me]);

  /** Save the media to the gallery. Not an API field - a local copy. */
  const download = useCallback(async () => {
    const uri = story?.media?.[0]?.media_url;
    if (!uri) return;
    try {
      const perm = await MediaLibrary.requestPermissionsAsync();
      if (!perm.granted) return flash("Photo access is off");
      await MediaLibrary.saveToLibraryAsync(uri);
      flash("Saved to your gallery");
    } catch {
      flash("Couldn't save that");
    }
  }, [story?.id, flash]);

  /* `username` from the route, not the fetched author - it is the same handle
     and is available before the query resolves. */
  const shareStory = useCallback(async () => {
    if (!story) return;
    try {
      await Share.share({
        message: `@${username} on Teezer\nhttps://teezer.live/stories/${story.id}`,
      });
    } catch { /* the OS sheet was dismissed */ }
  }, [story?.id, username]);

  /* "Share to..." picker's own list - the exact same ranked-by-chat-frequency
     suggestions the Feed's own Share sheet already uses, not a second list.
     Only fetched once the sheet is actually open. */
  const shareTargets = useQuery({
    queryKey: ["share-suggestions"],
    queryFn: () => inboxApi.shareSuggestions(30),
    enabled: shareOpen,
    staleTime: 60_000,
  });
  const [sendingTo, setSendingTo] = useState<number | null>(null);

  /* Sending a story is an ordinary message with everything an ordinary
     message already goes through - the recipient's message-privacy rules
     (mutual/followers-only/requires-request), blocks, and word filters are
     all enforced server-side by the same endpoint every other DM uses. This
     never bypasses any of that; a picker row is not a special case. */
  const sendStoryTo = useCallback(
    (target: ShareSuggestion) => {
      if (!story || sendingTo) return;
      setSendingTo(target.id);
      inboxApi
        .shareStory(target.id, { id: story.id, thumbnail_url: media?.thumbnail_url ?? media?.media_url })
        .then((res) => {
          void storyApi.share(story.id, "dm", target.id);
          setShareOpen(false);
          flash(
            res.status === "pending_request"
              ? `Sent - @${target.username} will see it once they accept your request`
              : `Sent to @${target.username}`,
          );
        })
        .catch((e) => {
          const msg =
            (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
            "Couldn't send that - try again.";
          Alert.alert("Not sent", msg);
        })
        .finally(() => setSendingTo(null));
    },
    [story, sendingTo, media?.thumbnail_url, media?.media_url, flash],
  );

  const confirmDelete = useCallback(() => {
    if (!story) return;
    Alert.alert("Delete story?", "This removes it from your story now.", [
      { text: "Cancel", style: "cancel", onPress: () => setPaused(false) },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          storyApi
            .delete(story.id)
            .then(() => {
              void qc.invalidateQueries({ queryKey: ["stories-feed"] });
              void qc.invalidateQueries({ queryKey: ["story-ring-ids"] });
              void qc.invalidateQueries({ queryKey: ["my-stories"] });
              close();
            })
            .catch(() => flash("Couldn't delete that"));
        },
      },
    ]);
  }, [story?.id, qc, close, flash]);

  /**
   * Opens the reasons sheet - an Alert cannot ask this properly.
   *
   * Always called via closeThen(confirmReport) below, so the actions
   * BottomSheet has already finished its own close animation by the time
   * this runs - opening the auth-gate popup here is safe, no separate
   * close-and-delay dance needed (see gateGuest in CommentsSheet/
   * ShareSheet for the version of this fix that's needed when there ISN'T
   * an existing deferred-close mechanism already doing that job).
   */
  const confirmReport = useCallback(() => {
    if (!me) {
      useAuthGate.getState().open(() => setReportOpen(true));
      return;
    }
    setReportOpen(true);
  }, [me]);

  const sendReaction = useCallback(
    (kind: StoryReactionType) => {
      if (!story) return;
      // Same rule as replying: reacting is tied to an account. No check
      // existed here either - the burst animation played for a guest even
      // though the reaction itself always 401'd.
      if (!me) {
        useAuthGate.getState().open(() => sendReaction(kind));
        return;
      }
      burstKeyRef.current += 1;
      setBurst({ key: burstKeyRef.current, emoji: STORY_REACTION_EMOJI[kind] ?? "❤️" });
      storyApi
        .react(story.id, kind)
        .then(() => flash("Reaction sent"))
        .catch(() => flash("Couldn't react"));
    },
    [story?.id, flash, me],
  );

  /**
   * What moving `by` would mean right now, without touching any state -
   * shared between tap navigation, auto-advance, AND manual swipe below, so
   * all three are driven by the exact same logic rather than three copies
   * that could quietly drift apart (which is exactly how "manual swipe
   * doesn't match automatic" bugs happen). Returns null when there's
   * nowhere to go that way (e.g. swiping back past the very first story in
   * the whole sequence, or forward off someone's own last story with no one
   * after them).
   */
  const computeMove = useCallback(
    (by: 1 | -1): { apply: () => void; preview: IncomingPreview | null } | null => {
      const next = indexRef.current + by;
      if (next >= 0 && next < countRef.current) {
        // Same author, next/previous slide - header is already on screen
        // (author.data), so the preview only ever needs to swap the media.
        const s = stories[next];
        if (!s) return null;
        const m = s.media?.[0];
        const au = author.data?.user;
        const preview: IncomingPreview = {
          avatar: au?.avatar ?? null,
          name: au?.display_name ?? null,
          username: au?.username ?? username,
          isVerified: au?.is_verified,
          thumbnailUrl: m ? (m.media_type === "video" ? (m.thumbnail_url ?? null) : (m.media_url ?? null)) : null,
          isVideo: m?.media_type === "video",
        };
        return { apply: () => setIndex(next), preview };
      }
      const pos = authorSequence.indexOf(username);
      if (by === -1) {
        // Off the front of this author's stories - hand off to the previous
        // author in the rail's own order, if there is one. Backward never
        // closes the viewer - the first story anywhere in the sequence must
        // not break navigation, it just has nowhere further back to go.
        if (pos <= 0) return null;
        const prevUsername = authorSequence[pos - 1];
        const preview = prevAuthorPreview.current?.username === prevUsername ? prevAuthorPreview.current : null;
        return { apply: () => { enterAt.current = "end"; navigation.setParams({ username: prevUsername }); }, preview };
      }
      // Off the end of this author's stories - hand off to the next author.
      // `pos < 0` (this author isn't in the rail's own sequence at all -
      // reached via a route the rail doesn't cover) falls through to null,
      // same as "nobody after them".
      const nextUsername = pos >= 0 ? authorSequence[pos + 1] : undefined;
      if (!nextUsername) return null;
      const preview = nextAuthorPreview.current?.username === nextUsername ? nextAuthorPreview.current : null;
      return { apply: () => { enterAt.current = "start"; navigation.setParams({ username: nextUsername }); }, preview };
    },
    [stories, author.data, username, authorSequence, navigation],
  );

  const advance = useCallback(
    (by: 1 | -1) => {
      const move = computeMove(by);
      if (!move) {
        // Forward with nowhere left to go closes the viewer (nothing left to
        // show); backward with nowhere left to go is just a no-op - the
        // first story anywhere must not break navigation.
        if (by === 1) close();
        return;
      }
      runSlide(by, move.apply, move.preview);
    },
    [computeMove, runSlide, close],
  );

  /**
   * Manual horizontal swipe - the same engine as tap/auto (computeMove +
   * settle), just driven by a finger instead of a timer, so the two can
   * never visually disagree. `activeOffsetX`/`failOffsetY` mirror the same
   * disambiguation-from-vertical-scroll pattern already used elsewhere in
   * the app (e.g. ChatScreen's own swipe-to-reply): only a clearly
   * horizontal drag claims the gesture at all.
   */
  const panDirRef = useRef<1 | -1 | null>(null);
  const panMoveRef = useRef<{ apply: () => void; preview: IncomingPreview | null } | null>(null);
  const panLockedRef = useRef(false);

  const handlePanStart = useCallback(() => {
    if (transitioning.current) { panLockedRef.current = false; return; }
    panLockedRef.current = true;
    transitioning.current = true;
    setPaused(true);
    panDirRef.current = null;
    panMoveRef.current = null;
  }, []);

  const handlePanUpdate = useCallback(
    (dx: number) => {
      if (!panLockedRef.current) return;
      const dir: 1 | -1 = dx < 0 ? 1 : -1;
      if (panDirRef.current !== dir) {
        panDirRef.current = dir;
        const move = computeMove(dir);
        panMoveRef.current = move;
        setTransition(move ? { direction: dir, preview: move.preview } : null);
      }
      // Rubber-band lightly when there's genuinely nowhere to go that way
      // (the very first story, or the very last with no one after) rather
      // than either refusing to move at all (reads as broken) or travelling
      // the full screen width with nothing behind it to reveal.
      const limit = panMoveRef.current ? width : width * 0.22;
      slideX.setValue(Math.max(-limit, Math.min(limit, dx)));
    },
    [computeMove, slideX, width],
  );

  const handlePanEnd = useCallback(
    (dx: number, vx: number) => {
      if (!panLockedRef.current) return;
      panLockedRef.current = false;
      setPaused(false);
      const dir = panDirRef.current;
      const move = panMoveRef.current;
      panDirRef.current = null;
      panMoveRef.current = null;
      const COMPLETE_DISTANCE = width * 0.28;
      const COMPLETE_VELOCITY = 700;
      const shouldComplete = !!dir && !!move && (Math.abs(dx) > COMPLETE_DISTANCE || Math.abs(vx) > COMPLETE_VELOCITY);
      if (shouldComplete && dir && move) {
        settle(dir, move.apply);
        return;
      }
      // Below threshold, or nowhere to go that direction - spring back to
      // the current Story rather than an abrupt reset.
      setTransition(null);
      Animated.spring(slideX, { toValue: 0, useNativeDriver: true, speed: 16, bounciness: 6 })
        .start(() => { transitioning.current = false; });
    },
    [width, settle, slideX],
  );

  const storyPan = useMemo(
    () =>
      Gesture.Pan()
      // Runs on the JS thread, NOT as a worklet.
      //
      // These callbacks drive a legacy RN Animated.Value. Gesture handlers are
      // workletized by default, which serialises the callback's whole closure
      // to the UI thread - and an Animated.Value cannot be serialised:
      //   "[Worklets] Cannot copy value of type `AnimatedValue`"
      // Reanimated 3 tolerated this; Reanimated 4 / react-native-worklets,
      // which arrived with the SDK 54 -> 57 upgrade, throws. In a release build
      // that throw is fatal, which is what was aborting the app on every screen
      // that opens a sheet.
      .runOnJS(true)
        .enabled(!replyFocused)
        .activeOffsetX([-12, 12])
        .failOffsetY([-14, 14])
        .onStart(() => { runOnJS(handlePanStart)(); })
        .onUpdate((e) => { runOnJS(handlePanUpdate)(e.translationX); })
        // e.velocityX, not just distance travelled - a fast flick that
        // hasn't moved far yet should still complete, the same as any
        // native swipe gesture.
        .onEnd((e) => { runOnJS(handlePanEnd)(e.translationX, e.velocityX); }),
    [replyFocused, handlePanStart, handlePanUpdate, handlePanEnd],
  );

  useEffect(() => {
    if (!story || paused) return;
    progress.setValue(0);
    const anim = Animated.timing(progress, {
      toValue: 1,
      duration: SLIDE_MS,
      useNativeDriver: false,
    });
    anim.start(({ finished }) => {
      // Only a run to completion advances. A cancelled one is a pause or a
      // manual move, and both already decided what happens next.
      if (finished) advance(1);
    });
    return () => anim.stop();
  }, [story?.id, paused, progress, advance]);

  /* Every author actually viewed this session (not your own) - so that on
     the way out, the "have I seen them" ring caches for ALL of them get
     refreshed, not just whichever author happened to be on screen last.
     Swiping through several authors' trays in one viewer session (via
     navigation.setParams({ username }) below) keeps this screen mounted the
     whole time, so a single "invalidate the current username" on unmount
     would have missed everyone but the last one. */
  const viewedUsernamesRef = useRef<Set<string>>(new Set());

  /* Seen is recorded once per story, and not for your own - the server would
     count the author as a viewer of their own story. */
  useEffect(() => {
    if (!story || isOwn) return;
    const storyId = story.id;
    const startedAt = Date.now();
    viewedUsernamesRef.current.add(username);

    // Recorded on ENTER, not on exit: the view is the thing that must never be
    // lost, and someone who force-quits mid-story still watched it. The server
    // decides whether this is a new unique viewer - nothing here counts.
    void storyApi.markViewed(storyId, { slide_index: index }).catch(() => {});

    // How long it was actually watched is only knowable on the way out, so it
    // goes up separately. progress_only folds it into the view above instead of
    // counting a second watch, so it can never inflate the viewer count.
    return () => {
      const watchedSec = Math.round((Date.now() - startedAt) / 1000);
      if (watchedSec <= 0) return;
      void storyApi
        .reportProgress(storyId, {
          watch_duration: watchedSec,
          // 90% of the slide's own length counts as watched through; an exact
          // match would almost never fire once the timer and the wall clock
          // drift apart with the app backgrounded.
          completed: watchedSec * 1000 >= SLIDE_MS * 0.9,
          slide_index: index,
        })
        .catch(() => {});
    };
  }, [story?.id, isOwn, index, username]);

  useEffect(() => {
    player.muted = muted;
  }, [muted, player]);

  /* On the way out, refresh the trays. Marking a story seen changes has_unseen,
     which is what orders the inbox rail and draws the rings - without this the
     author stays at the front, still ringed, until the cache expires.

     On unmount rather than per slide: one refetch when you are done, not one per
     story watched.

     ["story-user", username] is the query ProfileTabScreen/ChatScreen use to
     decide gradient-vs-seen - invalidated per author actually watched
     (viewedUsernamesRef, built up above) rather than just the one on screen
     when the viewer closes, since a viewer session can cross several authors.
     ["inbox-conversations"] is invalidated too - the Inbox row's ring reads
     has_unseen straight off that list, not from a "story-user" query. */
  useEffect(
    () => () => {
      void qc.invalidateQueries({ queryKey: ["stories-feed"] });
      void qc.invalidateQueries({ queryKey: ["story-ring-ids"] });
      void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
      for (const u of viewedUsernamesRef.current) {
        void qc.invalidateQueries({ queryKey: ["story-user", u] });
      }
    },
    [qc],
  );

  /* ── render ────────────────────────────────────────────────────────────── */

  if (author.isLoading) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color="#fff" />
      </View>
    );
  }

  if (storyUnavailable) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emptyText}>Story is no longer available.</Text>
        <Pressable onPress={close} style={styles.emptyBtn} accessibilityRole="button">
          <Text style={styles.emptyBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  if (!story) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emptyText}>No stories to show.</Text>
        <Pressable onPress={close} style={styles.emptyBtn} accessibilityRole="button">
          <Text style={styles.emptyBtnText}>Close</Text>
        </Pressable>
      </View>
    );
  }

  const author_ = author.data?.user;
  /** What the bottom bar is allowed to offer for THIS story - checked
   *  independently, same as the server checks them independently. */
  const canReply = story.allow_replies !== false;
  const canReact = storySetting(story, "allow_reactions");
  /* The Story type carries no view count, so it is read off the viewers
     endpoint - which is also the only thing that knows it. Own story only,
     because that is the only place it is shown. */
  const viewsCount = viewers.data?.total ?? 0;

  /* All four counters come from the backend rollup, not from totalling the
     viewer list. That is the whole point of the analytics service: two clients
     counting the same rows their own way is exactly how the app and the website
     came to disagree, so neither counts anything any more.

     Reactions and replies are SUBSETS of viewers - you have to have seen a
     story to react to it - so they sit BESIDE the viewer count and are never
     added to it. Adding them would double-count everyone who watched and then
     reacted. Shares are the exception: a share is an event, not a state, so its
     count can legitimately exceed the viewer count and is never clamped. */
  const reactionsCount = viewers.data?.reaction_count ?? 0;
  const repliesCount = viewers.data?.reply_count ?? 0;
  const sharesCount = viewers.data?.share_count ?? 0;
  const breakdown = viewers.data?.reactions_breakdown ?? {};

  /* Clamped only for the percentage: reactions can never really exceed
     viewers, but a rollup read mid-recompute could momentarily pair a fresh
     reaction count with an older viewer count, and "150% engaged" is a worse
     answer than a capped one. Guarded on viewsCount because 0 views is the
     normal opening state and 0/0 renders as "NaN%". */
  const engagementRate =
    viewsCount > 0 ? Math.min(100, Math.round((reactionsCount / viewsCount) * 100)) : 0;

  /** Same condition the reply bar itself renders on - only reserve room for
   *  it (and only paint that room solid black) when there's actually a bar
   *  there to reserve room for. On your own story (no bar at all) media
   *  still goes full-bleed, exactly as before.
   *
   * This has to track the keyboard too, not just the bar's own resting
   * height - kbAnim already slides the bar itself up to sit right above the
   * keyboard, but the media's own inset used to stay frozen at the bar's
   * small resting height regardless. That left an uncovered gap between the
   * media's (unchanged) bottom edge and the bar's new, much higher
   * position - a plain white/black void with the input floating in it,
   * instead of the Story content actually shrinking upward the way a real
   * keyboard-aware layout does. Animated.add(kbAnim, barHeight) is exactly
   * "how far the TOP of the reply bar currently is from the true screen
   * bottom" - at rest or pushed above the keyboard, the media now always
   * stops exactly there, so there is never a gap to show through. */
  const showReplyBar = !isOwn && (canReply || canReact);
  const FALLBACK_BAR_HEIGHT = 92;
  const mediaBottomInset = showReplyBar ? Animated.add(kbAnim, barHeight || FALLBACK_BAR_HEIGHT) : 0;

  // The incoming layer's own translateX: it sits one screen width to
  // whichever side the outgoing layer is heading TOWARD, and animates back
  // to 0 over the exact same `slideX` motion - offset, not a second
  // animation, so the two are physically locked together.
  const incomingTranslateX = transition ? Animated.add(slideX, transition.direction * width) : slideX;

  /**
   * Two equal, equally-bright, hard-edged rectangles sliding past each
   * other is exactly what reads as "two pages", seam and all - a plain
   * symmetric translateX swap never stops looking like that no matter how
   * the timing is tuned, because nothing distinguishes "the Story you're
   * leaving" from "the Story you're arriving at". Real Story viewers break
   * that symmetry: the outgoing side recedes (dims + shrinks slightly)
   * while the incoming side stays the crisp, full-scale one - so it reads
   * as one continuous surface with new content taking over, not a hard cut
   * between two identical cards.
   */
  const outgoingScale = slideX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0.94, 1, 0.94],
    extrapolate: "clamp",
  });
  const outgoingDim = slideX.interpolate({
    inputRange: [-width, 0, width],
    outputRange: [0.45, 0, 0.45],
    extrapolate: "clamp",
  });

  return (
    <GestureDetector gesture={storyPan}>
    <View style={styles.root}>
      {/* Media + its overlays slide together as one layer - translateX
          covers both, so the text/emoji never drift independently of the
          photo/video underneath during the handoff. Bottom is inset to
          clear the reply bar's own reserved footer below - the media stops
          above it rather than rendering (and being hidden) behind it; the
          root's own near-black background shows through that gap. */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { bottom: mediaBottomInset, transform: [{ translateX: slideX }, { scale: outgoingScale }] },
        ]}
      >
        {isVideo ? (
          <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="contain" nativeControls={false} />
        ) : media?.media_url ? (
          <Image source={{ uri: media.media_url }} style={StyleSheet.absoluteFill} contentFit="contain" transition={140} />
        ) : null}

        {/* Text and emoji laid on at upload.
            Percentages, so a story composed on a phone lands identically here at
            any size - and the full transform, not just the position. scale and
            rotation were being dropped, so anything the author resized or turned
            played back at 1x and upright, which is not the story they posted.
            `translate(-50%,-50%)` in RN terms: x/y address the layer's CENTRE, so
            it is pulled back by half its own measured box before rotating and
            scaling about that centre - the same order the editor uses. */}
        {[...(story.layers ?? [])]
          .sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0))
          .map((l, i) => (
            <View
              key={l.id ?? i}
              style={[
                styles.layer,
                {
                  left: `${l.x}%`,
                  top: `${l.y}%`,
                  zIndex: l.zIndex ?? i,
                  transform: [
                    { translateX: "-50%" },
                    { translateY: "-50%" },
                    { rotate: `${l.rotation ?? 0}deg` },
                    { scale: l.scale || 1 },
                  ],
                },
              ]}
              pointerEvents="none"
            >
              {l.type === "emoji" ? (
                <Text style={styles.layerEmoji}>{l.text}</Text>
              ) : (
                <Text style={[styles.layerText, { color: l.color || "#fff" }]}>{l.text}</Text>
              )}
            </View>
          ))}

        {/* Recedes as this layer leaves - see the outgoingDim/outgoingScale
            comment above. Purely visual, never intercepts a touch. */}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: "#000", opacity: outgoingDim }]} />
      </Animated.View>

      {/* The Story sliding in - a static thumbnail (no live video player;
          the real one only exists once this layer is committed as `story`
          itself, which is near-instant since it's already been prepared by
          the preload effects above), sliding in lockstep with the outgoing
          layer via the shared `slideX`. No thumbnail yet (a cross-author
          prefetch that hasn't resolved) still slides in as a plain dark
          panel rather than showing nothing. */}
      {!!transition && (
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.incomingLayer,
            { bottom: mediaBottomInset, transform: [{ translateX: incomingTranslateX }] },
          ]}
        >
          {transition.preview?.thumbnailUrl ? (
            <Image
              source={{ uri: transition.preview.thumbnailUrl }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : null}
        </Animated.View>
      )}

      {/* "Reposted from @..." - what makes the original creator's credit
          survive a repost from the VIEWER's side, mirroring what the
          reposter set up at publish time (StoryUploadScreen). Not one of
          `story.layers`, so there is nothing here for a viewer to mistake
          for User A's own attribution and nothing they placed to remove. */}
      {story.reposted_from && (
        <RepostAttributionPill
          user={story.reposted_from}
          onPress={() => {
            const username = story.reposted_from?.username;
            if (username) navigation.navigate("UserProfile", { username });
          }}
          bottom={insets.bottom + (isOwn ? 78 : 128)}
        />
      )}

      {/* Tap zones sit UNDER the chrome, so the buttons still win. Replaced
          entirely by a single tap-anywhere-to-dismiss layer while typing -
          the keyboard/input interaction takes priority, so a tap that lands
          on the visible media above the keyboard no longer advances/pauses
          the story out from under the person composing a reply; instead it
          closes the keyboard. Keyboard.dismiss() is a direct native call
          (not routed through any JS-side animation/timeout of ours), so
          this is as instant as the OS's own keyboard-dismiss animation -
          nothing here adds extra lag on top of it. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
        {replyFocused ? (
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => Keyboard.dismiss()}
            accessibilityRole="button"
            accessibilityLabel="Dismiss keyboard"
          />
        ) : (
          <>
            <Pressable
              style={[styles.zone, { width: width * 0.3, left: 0 }]}
              onPress={() => advance(-1)}
              onLongPress={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
              delayLongPress={220}
              accessibilityLabel="Previous story"
            />
            <Pressable
              style={[styles.zone, { width: width * 0.7, right: 0 }]}
              onPress={() => advance(1)}
              onLongPress={() => setPaused(true)}
              onPressOut={() => setPaused(false)}
              delayLongPress={220}
              accessibilityLabel="Next story"
            />
          </>
        )}
      </View>

      {/* ── top chrome ──
          Progress bars and the avatar/username/timestamp identity block
          slide with the media (same `slideX`) - they're what "whose Story
          is this" actually means, so they hand off together with it rather
          than snapping the moment index/author commits. Mute/⋮/close stay
          put - they're viewer controls, not Story content, and the spec
          calls for keeping them exactly as they are. */}
      <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
        <Animated.View style={{ transform: [{ translateX: slideX }] }}>
          <View style={styles.bars}>
            {stories.map((s, i) => (
              <View key={s.id} style={styles.barTrack}>
                <Animated.View
                  style={[
                    styles.barFill,
                    {
                      width:
                        i < index
                          ? "100%"
                          : i > index
                            ? "0%"
                            : progress.interpolate({
                                inputRange: [0, 1],
                                outputRange: ["0%", "100%"],
                              }),
                    },
                  ]}
                />
              </View>
            ))}
          </View>
        </Animated.View>

        <View style={styles.who}>
          <Animated.View style={[styles.whoIdentity, { transform: [{ translateX: slideX }] }]}>
            {/* The design's ring: a gradient disc with the avatar inset on
                top, and a black hairline between the two so the ring reads as
                a ring rather than a border on the photo. */}
            <View style={styles.avatarRing}>
              <LinearGradient
                colors={["#F42B5B", "#FF8AA6"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
                // The gradient is decoration behind the avatar; without this a
                // screen reader announces an unlabelled view before the name.
                accessibilityElementsHidden
                importantForAccessibility="no-hide-descendants"
              />
              {author_?.avatar ? (
                <Image source={{ uri: author_.avatar }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>
                    {(author_?.display_name || author_?.username || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.handle} numberOfLines={1}>{author_?.username}</Text>
              <Text style={styles.time} numberOfLines={1}>{ago(story.created_at)}</Text>
            </View>
          </Animated.View>

          {/* Small and subtle by design (spec: "near the ⋮ button"), not a
              banner - it discloses without editorialising. Set once, server-
              side, and (per repost()) never removable by reposting it. */}
          {story.is_ai_generated && (
            <Pressable
              onPress={() => { setPaused(true); setAiInfoOpen(true); }}
              style={styles.aiPill}
              accessibilityRole="button"
              accessibilityLabel="AI Generated. Tap for more information."
            >
              <Text style={styles.aiPillText}>✦ AI Generated</Text>
            </Pressable>
          )}

          {/* Only when there is something to hear: a track chosen in the
              composer, or a video carrying its own audio. A photo with no music
              has nothing to mute, and offering the control there is a button
              that does nothing. */}
          {/* Mute and More sit together in one translucent capsule, per the
              design. hasSound still gates mute on its own, so a photo with no
              music shows a capsule holding just the ⋮ rather than a control
              that governs nothing. */}
          <View style={styles.capsule}>
            {hasSound && (
              <Pressable
                onPress={() => setMuted((m) => !m)}
                hitSlop={6}
                style={styles.iconBtn}
                accessibilityRole="button"
                accessibilityLabel={muted ? "Unmute" : "Mute"}
              >
                <SoundGlyph muted={muted} />
              </Pressable>
            )}
          {/* Pauses the story while the actions sheet (Download, Share,
              Repost, Delete, Report) is open, so it doesn't keep advancing
              underneath a menu the viewer is reading. */}
            <Pressable
              onPress={() => { setPaused(true); setActionsOpen(true); }}
              hitSlop={6}
              style={styles.iconBtn}
              accessibilityRole="button"
              accessibilityLabel="Story options"
            >
              <DotsGlyph />
            </Pressable>
          </View>
          <Pressable onPress={close} hitSlop={6} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
            <CloseGlyph />
          </Pressable>
        </View>
      </View>

      {/* Incoming header preview - the sliding-in half of the same handoff,
          mirroring `styles.top`'s own position/padding so it lines up with
          the outgoing one exactly. Bars start empty (the new Story hasn't
          played any progress yet); avatar/username come from `transition`,
          the same data the incoming media layer above uses. */}
      {!!transition && (
        <View style={[styles.top, { paddingTop: insets.top + 8 }]} pointerEvents="none">
          <Animated.View style={{ transform: [{ translateX: incomingTranslateX }] }}>
            <View style={styles.bars}>
              <View style={styles.barTrack}><View style={[styles.barFill, { width: "0%" }]} /></View>
            </View>
            <View style={[styles.who, styles.whoIdentity]}>
              {transition.preview?.avatar ? (
                <Image source={{ uri: transition.preview.avatar }} style={styles.avatar} contentFit="cover" />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Text style={styles.avatarLetter}>
                    {(transition.preview?.name || transition.preview?.username || "?").charAt(0).toUpperCase()}
                  </Text>
                </View>
              )}
              {!!transition.preview && (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.handle} numberOfLines={1}>@{transition.preview.username}</Text>
                </View>
              )}
            </View>
          </Animated.View>
        </View>
      )}

      {/* ── reply + react, on someone else's story only ──
          A solid, fixed footer now, not a translucent overlay floating over
          the media - the media above is inset (mediaBottomInset) to clear
          it, so nothing renders behind it and this area is always plain
          black. Message box and reaction row sit BESIDE each other in one
          row, not stacked. Not on your own story: you cannot reply to
          yourself, and the space belongs to the viewer count there instead.
          Both independently respect the author's settings - a story with
          replies off shows no input at all (not just a disabled one), a
          story with reactions off shows no reaction row - so nothing is
          offered here that the server would refuse. If both are off, this
          renders nothing (and mediaBottomInset above correctly falls back
          to 0 for that case). */}
      {!isOwn && (canReply || canReact) && (
        <Animated.View
          style={[
            styles.replyBar,
            // Bleeds the white bar a few px UNDER the keyboard's own
            // reported top edge, focused only - the keyboard's top corners
            // are rounded, so its actual visible surface recedes below that
            // edge right at the corners, otherwise exposing a sliver of the
            // Story's dark background there instead of the keyboard's own
            // colour. The keyboard itself (an opaque OS overlay) still
            // covers the rest of this overlap completely; only those corner
            // slivers are ever affected. Not applied at rest - it would
            // just eat into the intended safe-area clearance for no reason.
            { bottom: replyFocused ? Animated.subtract(kbAnim, 10) : kbAnim },
            replyFocused && styles.replyBarFocused,
          ]}
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
        >
          {/* Reactions live in their own row above the composer and are
              revealed by the smiley in the input, per the design - not inline
              beside it. Focusing the input closes them, so the keyboard never
              opens underneath a row that is about to be pushed off screen. */}
          {canReact && reactionsOpen && reply.trim().length === 0 && (
            <View style={styles.reactRow}>
              {burst && (
                <View pointerEvents="none" style={styles.reactionBurstWrap}>
                  <ReactionBurst key={burst.key} emoji={burst.emoji} onDone={() => setBurst(null)} />
                </View>
              )}
              {STORY_REACTIONS.map((r) => (
                <Pressable
                  key={r.key}
                  onPress={() => { setReactionsOpen(false); sendReaction(r.key); }}
                  style={styles.reactBtn}
                  accessibilityRole="button"
                  accessibilityLabel={`React ${r.emoji}`}
                >
                  <Text style={styles.reactEmoji}>{r.emoji}</Text>
                </Pressable>
              ))}
            </View>
          )}

          <View style={styles.replyRow}>
            {canReply && (
              <View style={[styles.replyInputWrap, replyFocused && styles.replyInputWrapFocused]}>
                <TextInput
                  value={reply}
                  onChangeText={setReply}
                  placeholder={`Reply to @${author_?.username ?? ""}…`}
                  placeholderTextColor={replyFocused ? "rgba(0,0,0,.4)" : "rgba(255,255,255,.55)"}
                  style={[styles.replyInput, replyFocused && styles.replyInputFocused]}
                  onFocus={() => { setPaused(true); setReplyFocused(true); setReactionsOpen(false); }}
                  onBlur={() => { setPaused(false); setReplyFocused(false); }}
                  returnKeyType="send"
                  onSubmitEditing={sendReply}
                  // Forces the iOS keyboard itself to render light (light
                  // gray keys), regardless of the device's own system-wide
                  // dark/light setting - without this, a phone in dark mode
                  // pops a BLACK keyboard directly under the now-white reply
                  // bar, which is the opposite of "blended". No Android
                  // equivalent prop exists; Gboard already follows the
                  // app's own light theme here in practice.
                  keyboardAppearance="light"
                />
                {canReact && (
                  <Pressable
                    onPress={() => setReactionsOpen((o) => !o)}
                    style={styles.emojiToggle}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: reactionsOpen }}
                    accessibilityLabel={reactionsOpen ? "Hide reactions" : "Show reactions"}
                  >
                    <Text style={styles.emojiToggleTxt}>😊</Text>
                  </Pressable>
                )}
              </View>
            )}

            {/* Heart and Share keep the behaviour they already had - Heart is
                the same react("heart") the row above sends, Share opens the
                same sheet the ⋮ menu does. Only their shape changed. */}
            {canReact && (
              <Pressable
                onPress={() => sendReaction("heart")}
                style={styles.roundBtn}
                accessibilityRole="button"
                accessibilityLabel="Send a heart"
              >
                <HeartGlyph color={replyFocused ? "#151316" : "#fff"} />
              </Pressable>
            )}
            <Pressable
              onPress={() => {
                // Sending to a friend needs an account - was opening the
                // picker unconditionally, which just showed a guest an
                // empty/broken friend list.
                if (!me) {
                  useAuthGate.getState().open(() => { setPaused(true); setShareOpen(true); });
                  return;
                }
                setPaused(true);
                setShareOpen(true);
              }}
              style={styles.roundBtn}
              accessibilityRole="button"
              accessibilityLabel="Share this story"
            >
              <ShareArrowGlyph color={replyFocused ? "#151316" : "#fff"} />
            </Pressable>
            {canReply && (
              <Pressable
                onPress={sendReply}
                style={styles.sendBtn}
                accessibilityRole="button"
                accessibilityLabel="Send reply"
              >
                <SendGlyph />
              </Pressable>
            )}
          </View>

          {!!sent && <Text style={[styles.sentNote, replyFocused && styles.sentNoteFocused]}>{sent}</Text>}
        </Animated.View>
      )}

      {/* ── viewers, own story only ── */}
      {isOwn && (
        <Pressable
          onPress={() => { setPaused(true); setViewersOpen(true); }}
          style={[styles.viewers, { bottom: insets.bottom + 18 }]}
          accessibilityRole="button"
          accessibilityLabel={`${viewsCount} viewed your story. See who.`}
        >
          <EyeGlyph />
          <Text style={styles.viewersText}>
            {(viewsCount).toLocaleString()} viewed
          </Text>
        </Pressable>
      )}

      {/* Who watched it. Own story only - nobody else may see this list, which
          is why the query behind it is gated the same way. */}
      <BottomSheet
        visible={viewersOpen}
        onClose={() => { setViewersOpen(false); setPaused(false); }}
        height={0.62}
      >
        <View style={styles.vHead}>
          <EyeGlyphDark />
          <Text style={styles.vTitle}>{viewsCount.toLocaleString()} viewed your story</Text>
        </View>

        {/* Views and reactions side by side, never summed - see the note where
            these are computed. Hidden at zero views because "0 views · 0
            reactions · 0% engaged" is noise on top of the empty state below,
            which already says nobody has watched. */}
        {viewsCount > 0 && (
          <>
            <View style={styles.vStats}>
              <Text style={styles.vStat}>
                <Text style={styles.vStatNum}>{viewsCount.toLocaleString()}</Text> views
              </Text>
              <Text style={styles.vStatDot}>·</Text>
              <Text style={styles.vStat}>
                <Text style={styles.vStatNum}>{reactionsCount.toLocaleString()}</Text>{" "}
                {reactionsCount === 1 ? "reaction" : "reactions"}
              </Text>
              <Text style={styles.vStatDot}>·</Text>
              <Text style={styles.vStat}>
                <Text style={styles.vStatNum}>{repliesCount.toLocaleString()}</Text>{" "}
                {repliesCount === 1 ? "reply" : "replies"}
              </Text>
              <Text style={styles.vStatDot}>·</Text>
              <Text style={styles.vStat}>
                <Text style={styles.vStatNum}>{sharesCount.toLocaleString()}</Text>{" "}
                {sharesCount === 1 ? "share" : "shares"}
              </Text>
              <Text style={styles.vStatDot}>·</Text>
              <Text style={styles.vStat}>
                <Text style={styles.vStatNum}>{engagementRate}%</Text> engaged
              </Text>
            </View>

            {/* Per-type breakdown. Zero-count types are filtered out rather
                than rendered as "🔥 0" - the row is a summary of what happened,
                not a list of what could have. */}
            {reactionsCount > 0 && (
              <View style={styles.vChips}>
                {Object.entries(breakdown)
                  .filter(([, n]) => (n as number) > 0)
                  .map(([type, n]) => (
                    <View key={type} style={styles.vChip}>
                      <Text style={styles.vChipEmoji}>{STORY_REACTION_EMOJI[type] ?? "❤️"}</Text>
                      <Text style={styles.vChipNum}>{(n as number).toLocaleString()}</Text>
                    </View>
                  ))}
              </View>
            )}
          </>
        )}
        {viewers.isLoading ? (
          <View style={styles.vCenter}><ActivityIndicator color="#F42B5B" /></View>
        ) : !viewers.data?.viewers?.length ? (
          <Text style={styles.vEmpty}>No one has watched this yet.</Text>
        ) : (
          viewers.data.viewers.map((v: any) => (
            <View key={v.id ?? v.user_id} style={styles.vRow}>
              <Pressable
                onPress={() => navigation.navigate("UserProfile", { username: v.username })}
                accessibilityRole="button"
                accessibilityLabel={`Open @${v.username}`}
              >
                {v.avatar ? (
                  <Image source={{ uri: v.avatar }} style={styles.vAvatar} contentFit="cover" />
                ) : (
                  <View style={[styles.vAvatar, styles.vAvatarFallback]}>
                    <Text style={styles.vInitial}>
                      {(v.display_name || v.username || "?").charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </Pressable>
              <Pressable
                style={{ flex: 1, minWidth: 0 }}
                onPress={() => navigation.navigate("UserProfile", { username: v.username })}
                accessibilityRole="button"
                accessibilityLabel={`Open @${v.username}`}
              >
                <Text style={styles.vName} numberOfLines={1}>{v.display_name || v.username}</Text>
                <Text style={styles.vWhen} numberOfLines={1}>{ago(v.viewed_at)}</Text>
              </Pressable>
              {/* Only for those who actually reacted - the design's trailing
                  heart is a fact about that viewer, not decoration on every row. */}
              {!!v.reaction_type && <Text style={styles.vHeart}>❤️</Text>}
            </View>
          ))
        )}
      </BottomSheet>

      {/* The ⋮ menu. Author-only actions are hidden on someone else's story
          rather than shown and refused. */}
      {/* Every action runs in onClosed, after the exit animation. Raising an
          Alert or the OS share sheet while this Modal is still up puts it
          UNDERNEATH - which reads as a menu that closed and did nothing, with
          the screen apparently stuck. */}
      <BottomSheet
        visible={actionsOpen}
        onClose={() => setActionsOpen(false)}
        onClosed={() => {
          const run = pendingAction.current;
          pendingAction.current = null;
          /* Resume either way. Dismissing the menu should hand the story back,
             and so should finishing an action - otherwise a download leaves the
             story frozen on the slide it was opened from. Delete is the
             exception and does not care: it closes the screen. */
          setPaused(false);
          run?.();
        }}
        scrollable={false}
      >
        <View style={{ paddingTop: 4, paddingBottom: insets.bottom + 12 }}>
          {/* Download stays gated by the author's own story settings, and per
              request no longer offered on your OWN story at all - not
              "missing" when hidden either way, allow_save is a choice the
              author made and showing the row anyway would override it. */}
          {!isOwn && storySetting(story, "allow_save") && (
          <MenuRow
            icon="download-outline"
            title="Download"
            subtitle="Save a copy to this device"
            onPress={() => closeThen(() => void download())}
          />
          )}
          {(isOwn || story.allow_resharing !== false) && (
          <MenuRow
            icon="share-outline"
            title="Share to…"
            subtitle="Send this story to a chat"
            onPress={() => closeThen(() => {
              // Same guard as the bar's share icon - deferred via
              // closeThen, so the actions sheet is already closed by the
              // time this runs.
              if (!me) {
                useAuthGate.getState().open(() => setShareOpen(true));
                return;
              }
              setShareOpen(true);
            })}
          />
          )}
          {!isOwn && story.allow_resharing !== false && (
            <MenuRow
              icon="repeat-outline"
              title="Repost story"
              subtitle="Share this to your own story"
              onPress={() => closeThen(() => {
                // Server-enforced too (StoryController::repost re-checks
                // canViewStory + allow_resharing) - this gate is a UI
                // convenience, not the only thing standing in the way.
                if (!author_) return;
                // Reposting publishes a new story on the guest's OWN
                // account - there is no such account. Had no check at
                // all, so a guest could walk the entire composer flow
                // (pick caption, settings, tap Share) before it 401'd.
                const openComposer = () => navigation.navigate("StoryComposer", {
                  repostOf: {
                    id: story.id,
                    media_url: media?.media_url ?? "",
                    thumbnail_url: media?.thumbnail_url ?? null,
                    isVideo,
                    user: {
                      username: author_.username,
                      name: author_.display_name,
                      avatar: author_.avatar,
                      is_verified: author_.is_verified,
                    },
                    is_ai_generated: story.is_ai_generated,
                  },
                });
                if (!me) {
                  useAuthGate.getState().open(openComposer);
                  return;
                }
                openComposer();
              })}
            />
          )}
          {isOwn && (
            <MenuRow
              icon="trash-outline"
              title="Delete story"
              subtitle="Remove this from your story now"
              destructive
              onPress={() => closeThen(confirmDelete)}
            />
          )}
          {!isOwn && (
            <MenuRow
              icon="flag-outline"
              title="Report"
              destructive
              onPress={() => closeThen(confirmReport)}
            />
          )}
        </View>
      </BottomSheet>

      {/* "Share to..." - who to send this story to, from the same ranked
          chat-frequency list the Feed's own Share sheet already uses. Every
          send below still goes through the ordinary message-send endpoint,
          so the recipient's own inbox/message-request policy (mutual only,
          followers, requires a request, blocked, word filters...) applies
          exactly as it would to anything else sent to them - nothing here
          skips that. */}
      <BottomSheet
        visible={shareOpen}
        onClose={() => { setShareOpen(false); setPaused(false); }}
        height={0.62}
      >
        <View style={styles.vHead}>
          <Text style={styles.vTitle}>Share to</Text>
        </View>

        <MenuRow
          icon="arrow-redo-outline"
          title="Share externally"
          subtitle="Other apps, copy link"
          onPress={() => { setShareOpen(false); void shareStory(); }}
        />

        {shareTargets.isLoading ? (
          <View style={styles.vCenter}><ActivityIndicator color="#F42B5B" /></View>
        ) : !shareTargets.data?.length ? (
          <Text style={styles.vEmpty}>Message a few people first, and they'll show up here.</Text>
        ) : (
          shareTargets.data.map((f: ShareSuggestion) => (
            <Pressable
              key={f.id}
              onPress={() => sendStoryTo(f)}
              disabled={sendingTo != null}
              style={styles.vRow}
              accessibilityRole="button"
              accessibilityLabel={`Send to @${f.username}`}
            >
              {f.avatar ? (
                <Image source={{ uri: f.avatar }} style={styles.vAvatar} contentFit="cover" />
              ) : (
                <View style={[styles.vAvatar, styles.vAvatarFallback]}>
                  <Text style={styles.vInitial}>{(f.name || f.username || "?").charAt(0).toUpperCase()}</Text>
                </View>
              )}
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.vName} numberOfLines={1}>{f.name || f.username}</Text>
                <Text style={styles.vWhen} numberOfLines={1}>@{f.username}</Text>
              </View>
              {sendingTo === f.id ? (
                <ActivityIndicator size="small" color="#F42B5B" />
              ) : (
                <Text style={styles.shareSendText}>Send</Text>
              )}
            </Pressable>
          ))
        )}
      </BottomSheet>

      {/* What the small "AI Generated" pill means, tapped open. Fixed, short
          content - no need to scroll. */}
      <BottomSheet
        visible={aiInfoOpen}
        onClose={() => { setAiInfoOpen(false); setPaused(false); }}
        scrollable={false}
      >
        <View style={[styles.aiInfo, { paddingBottom: insets.bottom + 20 }]}>
          <Text style={styles.aiInfoTitle}>AI Generated Content</Text>
          <Text style={styles.aiInfoBody}>
            This Story was labeled by its creator as containing AI-generated content.
            The label stays visible even if this Story is reposted.
          </Text>
          <Pressable
            onPress={() => { setAiInfoOpen(false); setPaused(false); }}
            style={styles.aiInfoClose}
            accessibilityRole="button"
          >
            <Text style={styles.aiInfoCloseText}>Got it</Text>
          </Pressable>
        </View>
      </BottomSheet>

      {/* Reporting asks WHY, because a reason is what makes a report actionable
          - "reported" with no category tells a moderator nothing. Its own
          sheet, with a details field and evidence upload - the same
          ReportSheet every other reportable thing in the app uses. */}
      <ReportSheet
        visible={reportOpen}
        entityType="story"
        entityId={story?.id ?? null}
        onClose={() => { setReportOpen(false); setPaused(false); }}
        onSubmitted={() => flash("Thanks - our team will review this")}
      />
    </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0A090C" },
  center: { alignItems: "center", justifyContent: "center", gap: 14 },
  emptyText: { color: "rgba(255,255,255,.7)", fontSize: 14 },
  emptyBtn: { paddingHorizontal: 18, paddingVertical: 10, borderRadius: 999, backgroundColor: "rgba(255,255,255,.14)" },
  emptyBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },

  zone: { position: "absolute", top: 0, bottom: 0 },

  /** The sliding-in Story-to-Story preview layer, behind its thumbnail (or
   *  alone, on the rare cold prefetch) - same tone as `root`'s own backdrop,
   *  so a still-loading thumbnail reads as "arriving", never as a flash of
   *  an unrelated colour. */
  incomingLayer: { backgroundColor: "#0A090C" },

  top: { position: "absolute", left: 0, right: 0, top: 0, paddingHorizontal: 14, gap: 12 },
  bars: { flexDirection: "row", gap: 5 },
  barTrack: { flex: 1, height: 3, borderRadius: 999, backgroundColor: "rgba(255,255,255,.28)", overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: "#fff" },

  who: { flexDirection: "row", alignItems: "center", gap: 10 },
  // Only the avatar+name portion of `who` slides with the Story handoff -
  // mute/⋮/close are siblings of this, outside it, and stay put. Mirrors
  // `who`'s own row layout so wrapping these two children one level deeper
  // changes nothing visually.
  whoIdentity: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1, minWidth: 0 },
  /** The gradient disc. overflow hidden keeps the gradient inside the circle
   *  rather than painting a square behind it. */
  avatarRing: {
    width: 38, height: 38, borderRadius: 999, overflow: "hidden",
    alignItems: "center", justifyContent: "center",
  },
  /** Inset by 2.5pt all round, with a black rim so the ring reads as a ring
   *  and not as a coloured border drawn on the photo itself. */
  avatar: {
    width: 33, height: 33, borderRadius: 999, backgroundColor: "#3D5A80",
    borderWidth: 2, borderColor: "#000",
  },
  /** Mute + More share one translucent capsule; Close stands alone beside it. */
  capsule: {
    flexDirection: "row", alignItems: "center", gap: 2,
    padding: 4, borderRadius: 999, backgroundColor: "rgba(255,255,255,.1)",
  },
  iconBtn: { width: 32, height: 32, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  closeBtn: {
    width: 36, height: 36, borderRadius: 999, backgroundColor: "rgba(255,255,255,.1)",
    alignItems: "center", justifyContent: "center",
  },
  avatarFallback: { alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: "#fff", fontSize: 14, fontWeight: "800", fontStyle: "italic" },
  handle: { fontSize: 13.5, fontWeight: "800", color: "#fff", letterSpacing: -0.14 },
  time: { marginTop: 1, fontSize: 11, color: "rgba(255,255,255,.62)" },

  aiPill: { paddingHorizontal: 9, paddingVertical: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,.16)" },
  aiPillText: { fontSize: 10.5, fontWeight: "800", color: "rgba(255,255,255,.9)" },

  /** Percent-positioned like the editor wrote them. */
  layer: { position: "absolute" },
  /* Deliberately identical to StoryEditor's overlayText, down to the wrap
     width: the two have to break lines at the same place or a caption that
     was two lines on the canvas becomes three here, and the transform the
     author set would be applied to a differently-shaped box. */
  layerText: {
    maxWidth: 260,
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.3,
    lineHeight: 34,
    textAlign: "center",
    textShadowColor: "rgba(0,0,0,.35)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  /** Matches StoryEditor's overlayEmoji, for the same reason. */
  layerEmoji: { fontSize: 44, lineHeight: 52 },

  viewers: {
    position: "absolute",
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,.5)",
  },
  viewersText: { fontSize: 13, fontWeight: "800", color: "#fff" },

  /* Reply + react bar, on someone else's story. A solid fixed footer, not a
   *  translucent overlay - the media above is inset (mediaBottomInset) to
   *  clear it instead of rendering underneath it, so this can just be plain
   *  black rather than needing to stay subtle over visible media. */
  replyBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 14, paddingVertical: 14, gap: 8,
    backgroundColor: "#000",
  },
  /** Once focused, the whole bar goes solid white and sits flush against
   *  the keyboard (see kbAnim's onShow above - no more +12 gap) so the two
   *  read as one continuous surface, matching the uploaded reference. */
  replyBarFocused: { backgroundColor: "#fff", borderTopLeftRadius: 22, borderTopRightRadius: 22 },
  /** Message box and reaction row, side by side - not stacked. */
  replyRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  replyInputWrap: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    height: 44,
    // Asymmetric on purpose: the text starts at the design's 16pt inset, while
    // the right side tightens to 6 so the 34pt smiley sits inside the pill's
    // edge rather than pushing the input's text off-centre.
    paddingLeft: 16,
    paddingRight: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,.14)",
    backgroundColor: "rgba(255,255,255,.1)",
  },
  /** Once focused, replyBarFocused above already turned the whole bar
   *  white - the pill itself just needs to dissolve into it rather than
   *  keep its own dark-glass fill/border on top of that. */
  replyInputWrapFocused: {
    backgroundColor: "transparent",
    borderColor: "transparent",
  },
  replyInput: { flex: 1, minWidth: 0, color: "#fff", fontSize: 13.5, padding: 0 },
  replyInputFocused: { color: "#151316" },
  sendBtn: {
    width: 44, height: 44, borderRadius: 999, backgroundColor: "#F42B5B",
    alignItems: "center", justifyContent: "center",
  },
  /** Its own row above the composer: six equal pills, not inline glyphs. */
  reactRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    gap: 4, paddingBottom: 10,
  },
  reactBtn: {
    flex: 1, height: 38, borderRadius: 999, backgroundColor: "rgba(255,255,255,.08)",
    alignItems: "center", justifyContent: "center",
  },
  reactEmoji: { fontSize: 19, lineHeight: 23 },
  /** Like and Share: 44pt translucent circles beside the composer. */
  roundBtn: {
    width: 44, height: 44, borderRadius: 999, backgroundColor: "rgba(255,255,255,.1)",
    alignItems: "center", justifyContent: "center",
  },
  /** The smiley that reveals the reactions row, inside the input's right edge. */
  emojiToggle: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  emojiToggleTxt: { fontSize: 18, lineHeight: 22 },
  /** Heart and Share - standalone controls beside the input/reaction
   *  cluster, not squeezed into either. */
  barIconBtn: { padding: 4 },
  sentNote: { textAlign: "center", fontSize: 12, fontWeight: "600", color: "rgba(255,255,255,.85)" },
  sentNoteFocused: { color: "rgba(0,0,0,.6)" },

  reactionBurstWrap: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  reactionBurst: { position: "absolute" },
  reactionBurstEmoji: { fontSize: 34 },

  /* Viewers sheet. */
  vHead: { flexDirection: "row", alignItems: "center", gap: 9, paddingHorizontal: 18, paddingBottom: 10 },
  vTitle: { fontSize: 15.5, fontWeight: "800", color: "#121014" },

  aiInfo: { paddingHorizontal: 20, paddingTop: 6, gap: 12 },
  aiInfoTitle: { fontSize: 16.5, fontWeight: "800", color: "#121014" },
  aiInfoBody: { fontSize: 13.5, lineHeight: 19, color: "#59535F" },
  aiInfoClose: {
    marginTop: 6, height: 46, borderRadius: 999, backgroundColor: "#F1EEF2",
    alignItems: "center", justifyContent: "center",
  },
  aiInfoCloseText: { fontSize: 14, fontWeight: "800", color: "#121014" },
  vStats: { flexDirection: "row", alignItems: "center", gap: 7, paddingHorizontal: 18, paddingBottom: 12 },
  vStat: { fontSize: 12.5, color: "#8A8592" },
  vStatNum: { fontWeight: "800", color: "#121014" },
  vStatDot: { fontSize: 12.5, color: "#C9C5D0" },
  vChips: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 18, paddingBottom: 12 },
  vChip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#F1EFF3", borderRadius: 999, paddingHorizontal: 9, paddingVertical: 4,
  },
  vChipEmoji: { fontSize: 13 },
  vChipNum: { fontSize: 12.5, fontWeight: "800", color: "#121014" },
  vCenter: { paddingVertical: 40, alignItems: "center" },
  vEmpty: { paddingVertical: 28, textAlign: "center", fontSize: 13, color: "#8A8592" },
  vRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingVertical: 9 },
  vAvatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: "#F1EFF3" },
  vAvatarFallback: { alignItems: "center", justifyContent: "center" },
  vInitial: { fontSize: 16, fontWeight: "800", color: "#8A8592" },
  vName: { fontSize: 14, fontWeight: "700", color: "#121014" },
  vWhen: { marginTop: 2, fontSize: 12, color: "#8A8592" },
  vHeart: { fontSize: 15 },
  shareSendText: { fontSize: 13, fontWeight: "800", color: "#F42B5B" },
});
