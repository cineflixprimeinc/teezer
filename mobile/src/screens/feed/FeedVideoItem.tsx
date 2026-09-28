import { memo, useCallback, useEffect, useRef, useState } from "react";
import { haptics } from "@/services/haptics";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Platform,
  useWindowDimensions,
  type GestureResponderEvent,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import type { TeezerPlayer } from "@/playback/types";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { MapPin } from "lucide-react-native";
import { ds } from "@/theme/design";
import { usePrefsStore } from "@/store/prefs.store";
import { useAuthStore } from "@/store/auth.store";
import { useNavigation } from "@react-navigation/native";
import { useCreatorLayer } from "@/store/creator-layer.store";
import { usePostViewer } from "@/store/post-viewer.store";
import { locationSlug } from "@/api/location.api";
import { renderMentionText } from "@/utils/mentions";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { Avatar } from "@/components/Avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { FeedActionRail } from "./FeedActionRail";
import { SoundSheet, type SoundSheetVideo } from "./SoundSheet";
import { SoundPageScreen } from "./SoundPageScreen";
import { FeedProgressBar, type ProgressBarHandle } from "./FeedProgressBar";
import { FeedVideoPlayer } from "./FeedVideoPlayer";
import { KnowledgeCard } from "@/components/KnowledgeCard";
import { fetchSoundVideos } from "@/api/music.api";
import { PlaybackManager } from "@/services/playback-manager";
import { useWatchTracker } from "@/hooks/useWatchTracker";
import { useSpeedBoost } from "@/store/speed-boost.store";
import { openPolicy } from "@/store/policy.store";
import { BAR_H } from "@/components/nav/TeezerTabBar";
import { ContentLinkBar } from "@/components/feed/ContentLinkBar";
import type { Video } from "@/types";

/**
 * One post in the feed: the media plus the chrome that floats over it.
 *
 * Only the active row and exactly the next one in scroll direction get a
 * player (see FeedVideoPlayer). react-native-video holds real native decoder
 * state per instance, so giving every mounted row one is how a feed runs out
 * of decoders and stalls - `active || preload` is what gates that, and the
 * next-row player never gets a VideoView (no decoder surface) until it
 * actually becomes active.
 */

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

function NoteGlyph({ size = 13, color = "rgba(255,255,255,0.72)" }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 18V5l12-2v13" stroke={color} strokeWidth={2} strokeLinecap="round" />
      <Circle cx={6} cy={18} r={3} stroke={color} strokeWidth={2} />
      <Circle cx={18} cy={16} r={3} stroke={color} strokeWidth={2} />
    </Svg>
  );
}

/** "This post has tagged people" - the exact glyph supplied, white on
 *  transparent (no filled backing shape of its own). */
function TagIconGlyph({ size = 15 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <Path d="M19.2914 5.99994H20.0002C20.5525 5.99994 21.0002 6.44766 21.0002 6.99994V13.9999C21.0002 14.5522 20.5525 14.9999 20.0002 14.9999H18.0002L13.8319 9.16427C13.3345 8.46797 12.4493 8.16522 11.6297 8.41109L9.14444 9.15668C8.43971 9.3681 7.6758 9.17551 7.15553 8.65524L6.86277 8.36247C6.41655 7.91626 6.49011 7.17336 7.01517 6.82332L12.4162 3.22262C13.0752 2.78333 13.9312 2.77422 14.5994 3.1994L18.7546 5.8436C18.915 5.94571 19.1013 5.99994 19.2914 5.99994ZM5.02708 14.2947L3.41132 15.7085C2.93991 16.1209 2.95945 16.8603 3.45201 17.2474L8.59277 21.2865C9.07284 21.6637 9.77592 21.5264 10.0788 20.9963L10.7827 19.7645C11.2127 19.012 11.1091 18.0682 10.5261 17.4269L7.82397 14.4545C7.09091 13.6481 5.84722 13.5771 5.02708 14.2947ZM7.04557 5H3C2.44772 5 2 5.44772 2 6V13.5158C2 13.9242 2.12475 14.3173 2.35019 14.6464C2.3741 14.6238 2.39856 14.6015 2.42357 14.5796L4.03933 13.1658C5.47457 11.91 7.65103 12.0343 8.93388 13.4455L11.6361 16.4179C12.6563 17.5401 12.8376 19.1918 12.0851 20.5087L11.4308 21.6538C11.9937 21.8671 12.635 21.819 13.169 21.4986L17.5782 18.8531C18.0786 18.5528 18.2166 17.8896 17.8776 17.4146L12.6109 10.0361C12.4865 9.86205 12.2652 9.78636 12.0603 9.84783L9.57505 10.5934C8.34176 10.9634 7.00492 10.6264 6.09446 9.7159L5.80169 9.42313C4.68615 8.30759 4.87005 6.45035 6.18271 5.57524L7.04557 5Z" />
    </Svg>
  );
}

/** "This post has collab (paid partnership) tags" - the exact user-supplied
 *  collaboration_handshake_icon.svg (mobile/src/assets), reproduced as
 *  react-native-svg primitives. Stroke-based like the source; rendered in
 *  yellow at the call site to read distinctly from the plain tag icon. */
function CollabIconGlyph({ size = 15, color = "#F5C518" }: { size?: number; color?: string }) {
  const strokeProps = { stroke: color, strokeWidth: 18, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <Svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <Circle cx={190} cy={256} r={105} {...strokeProps} />
      <Circle cx={322} cy={256} r={105} {...strokeProps} />
      <Path d="M205 250l35-31c9-8 22-9 32-2l17 12" {...strokeProps} />
      <Path d="M307 229l17-12c10-7 23-6 32 2l35 31" {...strokeProps} />
      <Path d="M221 267l31 30c8 8 21 8 29 0l11-11" {...strokeProps} />
      <Path d="M291 286l11 11c8 8 21 8 29 0l31-30" {...strokeProps} />
      <Path d="M252 297l-13 13c-7 7-18 7-25 0l-17-17" {...strokeProps} />
      <Path d="M291 297l13 13c7 7 18 7 25 0l17-17" {...strokeProps} />
      <Path d="M240 250l22 21c7 7 18 7 25 0l20-20" {...strokeProps} />
      <Path d="M218 266l15 15" {...strokeProps} />
      <Path d="M333 266l-15 15" {...strokeProps} />
    </Svg>
  );
}

/** "AI-generated content" - Remix Icon `sparkling-2-fill`, the exact glyph
 *  the compose screen's own "AI-generated content" Media & safety toggle
 *  already uses (PostCameraScreenImpl.tsx's SparkleGlyph) - reproduced
 *  here, not a new icon, since is_ai_generated needs to read the same way
 *  wherever it shows. */
function SparkleGlyph({ size = 13, color = "#fff" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M17.0007 1.20825 18.3195 3.68108 20.7923 4.99992 18.3195 6.31876 17.0007 8.79159 15.6818 6.31876 13.209 4.99992 15.6818 3.68108 17.0007 1.20825ZM8.00065 4.33325 10.6673 9.33325 15.6673 11.9999 10.6673 14.6666 8.00065 19.6666 5.33398 14.6666.333984 11.9999 5.33398 9.33325 8.00065 4.33325ZM19.6673 16.3333 18.0007 13.2083 16.334 16.3333 13.209 17.9999 16.334 19.6666 18.0007 22.7916 19.6673 19.6666 22.7923 17.9999 19.6673 16.3333Z" />
    </Svg>
  );
}

/** A small "there's more info here" hint beside the AI-generated label -
 *  a plain outlined info circle, not a new brand icon. */
function InfoDotGlyph({ size = 12, color = "rgba(255,255,255,0.55)" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={color} strokeWidth={1.6} />
      <Path d="M12 11v5.5" stroke={color} strokeWidth={1.6} strokeLinecap="round" />
      <Circle cx={12} cy={7.7} r={1.1} fill={color} />
    </Svg>
  );
}

/** Trailing chevron for the policy/terms link rows in the AI info sheet. */
function ChevronGlyph({ size = 15, color = "#9A96A3" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/* Centre-indicator glyphs: Lucide `pause` and `play`, kept as supplied - stroked
   rather than filled, drawn on the 24 viewBox the set is designed for with
   stroke-width 2. The whole SVG scales to 52, so the stroke scales with it and
   the weight stays true to the icon. */

/* Solid, and larger than the 52px outlines they replace. Over moving video an
 * outline competes with whatever is behind it; a filled mark reads at a glance,
 * which is all this indicator has to do. */
const INDICATOR_SIZE = 64;
/** The circle behind the glyph, and the ring that expands out of it. */
const DISC_SIZE = 104;

/** Rate while either side is held down. */
const HOLD_SPEED = 2;
/**
 * What counts as a hold rather than a tap - for the 2x boost on the sides AND
 * for the playback sheet's long-press in the centre.
 *
 * ONE constant for both on purpose. They are the same physical gesture judged
 * on the same surface, and letting them drift apart is what produces a dead
 * zone: at the first attempt here the boost was set to the 2000ms literally
 * asked for while the sheet stayed at 350, so a side-hold did nothing at all
 * for most of two seconds and read as broken.
 *
 * Some delay is unavoidable - with none, a plain tap to pause would spike the
 * rate on its way down. 350ms is the app's existing long-press threshold and is
 * in the 300-500ms band TikTok and Instagram use.
 */
const HOLD_DELAY_MS = 350;
/**
 * How far up from the bottom of the WINDOW counts as "pulled down".
 *
 * Measured against the window, not this item: the drop target is the tab bar,
 * which sits below the pager entirely, so an item-relative coordinate can never
 * reach it. A little taller than the bar itself, so the lock arms as the finger
 * arrives rather than only once it is fully inside a 86pt strip.
 */
const LOCK_ZONE_H = BAR_H + 24;

function PauseGlyph() {
  return (
    <Svg width={INDICATOR_SIZE} height={INDICATOR_SIZE} viewBox="0 0 24 24">
      <Rect x={5.5} y={3.5} width={4.6} height={17} rx={1.6} fill={ds.onDark} />
      <Rect x={13.9} y={3.5} width={4.6} height={17} rx={1.6} fill={ds.onDark} />
    </Svg>
  );
}

function PlayGlyph() {
  return (
    <Svg width={INDICATOR_SIZE} height={INDICATOR_SIZE} viewBox="0 0 24 24">
      <Path
        d="M7.2 4.3a1.6 1.6 0 0 1 2.44-1.36l9.3 6.5a1.9 1.9 0 0 1 0 3.12l-9.3 6.5A1.6 1.6 0 0 1 7.2 17.6z"
        fill={ds.onDark}
      />
    </Svg>
  );
}

/** One heart thrown by a double-tap. Scales in, drifts up, fades out, then
 *  tells the item to drop it - 900ms, the same burst the website uses. */
function HeartBurst({ x, y, rotate, onDone }: { x: number; y: number; rotate: number; onDone: () => void }) {
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start(onDone);
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: x - 44,
        top: y - 44,
        opacity: t.interpolate({ inputRange: [0, 0.15, 0.7, 1], outputRange: [0, 1, 1, 0] }),
        transform: [
          { rotate: `${rotate}deg` },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, -70] }) },
          { scale: t.interpolate({ inputRange: [0, 0.18, 0.5, 1], outputRange: [0.3, 1.25, 1, 1.05] }) },
        ],
      }}
    >
      <Svg width={88} height={88} viewBox="0 0 24 24">
        <Path
          d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7z"
          fill={ds.accent}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * Cover art for the rail's disc: the post's own cover - the thumbnail the
 * uploader picked - falling back to the sound's artwork only when the post has
 * no thumbnail at all.
 */
function discCover(v: Video): string | null {
  const sound = v.main_sound ?? v.music_track ?? null;
  return v.thumbnail_url ?? (sound as { cover_url?: string | null } | null)?.cover_url ?? null;
}

/**
 * Whether the post has real playable audio. Gates both the sound line and the
 * rail's disc, matching the rule the website already applies:
 *
 *   "Sound disc - only shown when the post has real playable audio (video
 *    original or library music). Photo and text posts without selected music
 *    have mainSound=null and no music_track, so no disc."
 *
 * A video always carries original audio, so in practice this only hides them on
 * a photo published without a track.
 */
function hasAudio(v: Video): boolean {
  return !!(v.main_sound ?? v.music_track);
}

/** 9:16 = 0.5625. Same field precedence as the website's own
 *  resolveAspectRatio() (frontend/src/features/feed/feed-page.tsx):
 *  aspect_ratio first, then derived from width/height, falling back to
 *  9:16 when neither is known yet (metadata not loaded) - the same
 *  fallback the website uses, and the safer default here since the large
 *  majority of Teezer posts genuinely are 9:16. */
const NINE_SIXTEEN = 9 / 16;
function resolveAspectRatio(v: Video): number {
  if (v.aspect_ratio && v.aspect_ratio > 0) return v.aspect_ratio;
  if (v.width && v.height) return v.width / v.height;
  return NINE_SIXTEEN;
}

/**
 * Whether this post is close enough to a true 9:16 vertical video to use
 * `cover` (crop-fill, zero letterbox gap) instead of `contain`. Scoped
 * deliberately narrow - a small tolerance around 0.5625 for real-world
 * encoding variance, NOT the website's much looser "portrait" bucket
 * (anything under 0.8), so a 3:4 or 4:5 portrait post (still "portrait",
 * but visibly not 9:16) is left alone rather than zoomed in to match a
 * ratio it was never framed for. Landscape and square posts are nowhere
 * near this tolerance and always stay `contain`.
 */
const NINE_SIXTEEN_TOLERANCE = 0.03;
function isNineSixteen(v: Video): boolean {
  return Math.abs(resolveAspectRatio(v) - NINE_SIXTEEN) < NINE_SIXTEEN_TOLERANCE;
}

/** Label for the sound line. Only rendered when hasAudio() is true, so there is
 *  no "original sound" fallback here - that would name audio that isn't there. */
function soundLine(v: Video): string {
  const s = v.main_sound ?? v.music_track ?? null;
  if (!s?.title) return `Original Track - @${v.user?.username ?? "teezer"}`;
  const artist = (s as { artist_name?: string | null }).artist_name;
  return artist ? `${s.title} · ${artist}` : s.title;
}

/** Upload date beside the handle, as "DD-MM" - e.g. 2026-05-27 -> "27-05". */
function shortDate(iso: string): string {
  const d = new Date(iso);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}-${mm}`;
}

/** Just the track name, for the sound sheet's heading. soundLine() is the
 *  combined "title · artist" caption line and is too long for a title. */
function soundTitle(v: Video): string {
  const s = v.main_sound ?? v.music_track ?? null;
  return s?.title ?? "Original Track";
}

export type FeedItemProps = {
  video: Video;
  /** This item is the pager's current row - it holds the player/source. */
  active: boolean;
  /** Exactly the next row in scroll direction: gets a player and a head
   *  start on buffering, but never plays. See FeedVideoPlayer's preload
   *  effect. Never true at the same time as `active`. */
  preload?: boolean;
  /** The feed tab is on screen. Gates playback only, NOT the source: dropping
   *  the source on tab-switch unloads the player and loses the position. */
  focused: boolean;
  width: number;
  height: number;
  muted: boolean;
  liked: boolean;
  saved: boolean;
  /** Overrides `video.user?.is_following` with the caller's own optimistic
   *  state (same idea as `liked`/`saved` above) - undefined falls back to
   *  the server's own field, so a caller that doesn't pass this keeps
   *  today's exact behavior. */
  following?: boolean;
  onToggleLike: () => void;
  onToggleSave: () => void;
  /** Follow, from the avatar's "+" badge. Optional, matching onPlaybackOptions
   *  below - a caller that omits it gets FeedActionRail's existing inert-
   *  Pressable behavior rather than a crash. */
  onToggleFollow?: () => void;
  onComments: () => void;
  onShare: () => void;
  /** Long-press on the video opens the playback options sheet. Optional: the
   *  profile post viewer reuses this item and has no sheet of its own. */
  onPlaybackOptions?: () => void;
  /** The post played to its end. Only ever fires with looping off, which is
   *  what auto-scroll turns off - the feed uses this to advance. */
  onEnded?: () => void;
  /** Extra space to keep clear at the bottom of the post's chrome. 0 on the
   *  feed - the default, which leaves the caption and rail exactly where they
   *  have always been. The profile post viewer passes its comment composer's
   *  height so neither sits under it. */
  chromeBottomInset?: number;
};

export const FeedVideoItem = memo(function FeedVideoItem({
  video,
  active,
  preload = false,
  focused,
  width,
  height,
  muted,
  liked,
  saved,
  following,
  onToggleLike,
  onToggleSave,
  onToggleFollow,
  onComments,
  onShare,
  onPlaybackOptions,
  onEnded,
  chromeBottomInset = 0,
}: FeedItemProps) {
  const isVideo = video.media_type === "video";
  // Only a true 9:16 post gets the crop-fill "cover" treatment below -
  // landscape, square, and other portrait ratios (3:4, 4:5...) keep the
  // original never-crop "contain" behavior untouched.
  const nineSixteen = isNineSixteen(video);

  /* ── playback preferences ────────────────────────────────────────────────
   * The shared content-preferences cache, the same one Settings writes and the
   * long-press sheet edits. Subscribed field by field so a change to an
   * unrelated pref (language, sensitive filter…) doesn't re-render every post. */
  /**
   * Whether to offer "follow" on this post's avatar.
   *
   * Two reasons not to: the viewer already follows this creator, or the post is
   * the viewer's own. Subscribed to the id alone rather than the whole user
   * object, so an unrelated profile edit does not re-render every post in the
   * pager.
   *
   * `is_following` is the server's answer, sent on user for every feed row
   * (VideoResource batches it via is_following_creator). A guest gets false for
   * it and has no id, so the + shows - which is right: tapping it is how they
   * hit the auth gate.
   */
  /**
   * Open a profile in the creator layer, from wherever this card is
   * currently rendered.
   *
   * begin() mounts the layer and seeds the stack; settle(true) runs it home.
   * They are the pair useFeedSwipe calls on drag and release, so a tap reuses
   * the gesture's own path rather than a second way in that could drift from
   * it.
   *
   * FeedVideoItem is also rendered inside PostViewerScreen (opened from a
   * profile grid, search, notifications, chat, Studio, or a /video/{id} deep
   * link) - that screen is itself a LAYER mounted ABOVE the creator layer
   * (PostViewerLayer, zIndex 40 vs. CreatorProfileLayer's 32 - see both
   * files' own comments on why). Opening the creator layer from in there
   * used to work invisibly: begin()/settle() correctly opened it, but it
   * painted underneath the still-covering viewer, so nothing visibly
   * happened until the viewer was dismissed and revealed the already-open
   * profile underneath. Hiding the viewer first (a no-op when it isn't
   * mounted, e.g. tapping from the plain Home feed) is what makes the open
   * actually visible right away, instead of only after backing out.
   */
  const openProfileLayer = useCallback((handle: string) => {
    if (usePostViewer.getState().mounted) usePostViewer.getState().hide();
    useCreatorLayer.getState().begin(handle);
    useCreatorLayer.getState().settle(true);
  }, []);

  /** This post's own creator - read off the store rather than subscribed
   *  to, since this only ever fires from a press, and subscribing would
   *  re-render every post whenever any profile card moved. */
  const openCreator = useCallback(() => {
    const handle = video.user?.username;
    if (!handle) return;
    openProfileLayer(handle);
  }, [video.user?.username, openProfileLayer]);

  /** Same open, for an arbitrary @mention tapped inside the caption (or a
   *  tagged person, below) - not necessarily this post's own creator, so
   *  it can't reuse openCreator's video.user?.username. */
  const openMentionedProfile = useCallback((username: string) => {
    openProfileLayer(username);
  }, [openProfileLayer]);

  /** The location chip above the handle - "View location feed", the same
   *  destination the website's own location pin opens (its "View location
   *  feed" row), scoped by the exact same slug algorithm. A real stack push
   *  (this is the first thing in this file that navigates directly rather
   *  than through the creator-layer store), since a location feed isn't a
   *  profile and has no layer of its own to slide in. */
  const navigation = useNavigation<any>();
  const openLocation = useCallback(() => {
    if (!video.location) return;
    navigation.navigate("LocationFeed", { slug: locationSlug(video.location), name: video.location });
  }, [navigation, video.location]);

  const myId = useAuthStore((s) => s.user?.id);
  const isOwnPost = myId != null && video.user?.id === myId;
  const isFollowingCreator = !!(following ?? video.user?.is_following);
  const showFollow = !isOwnPost && !isFollowingCreator;
  /** The rail's avatar badge switches to a green check once already
   *  following - mutually exclusive with showFollow, neither on your own post. */
  const showFollowing = !isOwnPost && isFollowingCreator;

  const quality = usePrefsStore((s) => s.prefs.default_quality);
  const speed = usePrefsStore((s) => s.prefs.playback_speed);
  const loopVideo = usePrefsStore((s) => s.prefs.loop_video);
  const autoScroll = usePrefsStore((s) => s.prefs.auto_scroll);

  /**
   * Auto-scroll is the ONLY thing that moves the feed on its own.
   *
   * With it off, a finished video replays from the start - which is what it did
   * before any of this existed. It used to be `loopVideo && !autoScroll`, so
   * turning Loop off with Auto scroll off left the post neither looping nor
   * advancing... except `playToEnd` still fired and the listener below scrolled
   * anyway. The feed auto-advanced for people who had never switched it on.
   *
   * Loop only has a say while auto-scroll is ON, where "don't loop" is what
   * lets the post reach its end and hand over to the next one.
   */
  const shouldLoop = !autoScroll;

  // An explicit quality pick wins - the user asked for that rendition. Otherwise
  // prefer the HLS ladder, which starts small and climbs instead of committing
  // to one file size before the connection is measured; video_url is the
  // fallback while a transcode is still queued, which is exactly when a fresh
  // upload would otherwise be unplayable. Same rule as the website.
  //
  // Gated on (active || preload), not just active: adjacent rows get a source
  // too, so their players can start buffering ahead of the swipe - see
  // FeedVideoPlayer's preload effect. Everything beyond that bounded window
  // stays null, which keeps the feed to "previous + current + next".
  const source = !((active || preload) && isVideo)
    ? null
    : quality !== "auto" && video.quality_urls?.[quality]
      ? video.quality_urls[quality]
      : (video.hls_url ?? video.video_url ?? null);

  /* Player creation, property sync, quality-switch resume, the PlaybackManager
   * registration and the auto-scroll listener all live in FeedVideoPlayer now
   * - the one file in the feed that imports react-native-video, so it is the
   * one file an Expo Go build must never mount. FeedVideoItem gets the live
   * player back as STATE (not a ref) because FeedProgressBar and the
   * 2x-speed-hold gesture below both need it during THIS component's own
   * render, and a ref written by a child does not trigger the re-render that
   * would require. */
  const [player, setPlayer] = useState<TeezerPlayer | null>(null);

  /* ── playback telemetry ──────────────────────────────────────────────────
   * Watch sessions, progress beats and completion milestones for Studio
   * analytics. Gated on `active && focused` - the same pair FeedVideoPlayer
   * gates actual playback on - so a preloading row and a backgrounded tab
   * never open a session for something nobody is watching.
   *
   * Only videos: a photo post has no playback to measure, and `duration` is
   * null on one, which would make every completion percentage meaningless.
   *
   * The hook is fire-and-forget throughout and holds no state this component
   * renders, so it cannot stall or re-render the feed. */
  useWatchTracker({
    videoId: isVideo ? video.id : 0,
    player,
    isActive: active && focused && isVideo,
    duration: video.duration ?? 0,
  });

  // A manual pause has to survive the active-item effect below, or the next
  // render would immediately resume what the user just paused. Read by
  // FeedVideoPlayer, which owns the actual play()/pause() calls and the
  // PlaybackManager registration - see its module comment.
  const [paused, setPaused] = useState(false);

  // Scrolling away clears a manual pause, so returning to a post plays it
  // rather than showing a stalled frame. (Dropping the source below
  // unmounts FeedVideoPlayer entirely, which is what forgets the playback
  // position - a post already restarts from zero when you come back to it,
  // same as before.)
  useEffect(() => {
    if (!active) setPaused(false);
  }, [active]);

  /* ── centre indicator ────────────────────────────────────────────────────
   * The glyph reports the player's CURRENT state, not the action on offer:
   * pause holds for as long as the video is paused, and the instant you resume
   * it becomes play on the way out. (The prototype and TikTok do the opposite -
   * a play triangle you press to resume - so this is a deliberate departure.)
   *
   * Driven by `paused` rather than fired once per tap, so the icon can never
   * disagree with the player.
   *
   * One value carries both directions: opacity is the value itself, and scale
   * interpolates 1.25 -> 1, so entering shrinks it into place with the spring's
   * overshoot, and leaving grows it as it fades. The glyph swap rides that same
   * exit - no cross-fade, it changes as it goes. */
  const indicator = useRef(new Animated.Value(0)).current;

  /**
   * The ring that expands out of the disc on every toggle.
   *
   * Driven from togglePlay, NOT from an effect on `paused`. An effect would
   * also fire on the setPaused(false) that runs when a post's source changes,
   * so scrolling the feed would pulse a ring at every video the user never
   * touched. This way it marks exactly one thing: the tap.
   *
   * Runs 0 -> 1 once per tap and is otherwise parked at 1, where the ring is
   * fully transparent, so it costs nothing at rest.
   */
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    indicator.stopAnimation();
    if (paused) {
      Animated.spring(indicator, {
        toValue: 1,
        damping: 13,
        stiffness: 280,
        mass: 0.6,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(indicator, {
        toValue: 0,
        duration: 200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start();
    }
  }, [paused, indicator]);

  const barRef = useRef<ProgressBarHandle>(null);

  const [scrubbing, setScrubbing] = useState(false);

  /* Collapsed by default, and re-collapsed the moment this post scrolls away.
     The reset is not optional: the feed recycles this component, so a caption
     left expanded on one post would come back expanded on the next one. */
  const [captionOpen, setCaptionOpen] = useState(false);
  /** Measured height of the caption block, so the product bar can float
   *  directly above it without joining its layout flow - see the bar's own
   *  render below for why that matters. */
  const [captionH, setCaptionH] = useState(0);
  useEffect(() => {
    if (!active) setCaptionOpen(false);
  }, [active]);

  /* Tapping the tag icon beside the handle opens the "tagged in this post"
     list - only people who ACCEPTED their tag ever land in tagged_users
     (see Video::taggedUsers()), so this list needs no further filtering. */
  const [taggedListOpen, setTaggedListOpen] = useState(false);

  /* Same idea, for "Paid partnership" collab tags - only accepted
     collaborators ever land in collab_users (see Video::collabUsers()). */
  const [collabListOpen, setCollabListOpen] = useState(false);

  /* Tapping the "AI-generated content" label opens a short explanation of
     what the creator's own upload-time toggle means - same tap-for-more-info
     shape as the tag/collab icons above, just with static copy instead of a
     people list. */
  const [aiInfoOpen, setAiInfoOpen] = useState(false);

  /* The sound sheet is owned here rather than by the screen above, so the disc
     works identically in the feed and in the profile post viewer - both render
     this component, and neither has to wire anything up. */
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundPageOpen, setSoundPageOpen] = useState(false);

  /**
   * Wraps `onToggleSave` for SoundSheet/SoundPageScreen only (the rail's own
   * save button below calls onToggleSave directly and is unaffected).
   *
   * Both of those are this file's own native `<Modal>`s (soundOpen/
   * soundPageOpen), and `onToggleSave` (owned by the feed screen) already
   * opens the guest auth-gate popup internally when there is no session -
   * which is ALSO its own native Modal. Presenting it while this file's
   * sound Modal is still open stacks two native Modals - the identical
   * freeze already fixed in CommentsSheet/ShareSheet/PlaybackSheet. Closing
   * the open sound Modal first, with the same 220ms handoff those three
   * files use, avoids it here too.
   */
  const handleSoundSave = useCallback(() => {
    if (!myId) {
      setSoundOpen(false);
      setSoundPageOpen(false);
      setTimeout(() => onToggleSave(), 220);
      return;
    }
    onToggleSave();
  }, [myId, onToggleSave]);

  /* Any overlay this item owns silences playback while it is up, and lifts the
     suspension on close. Counted inside the manager, so a sheet opened over an
     already-suspended screen does not un-suspend the feed when only it closes. */
  useEffect(() => {
    if (!(soundOpen || soundPageOpen)) return;
    PlaybackManager.suspend();
    return () => PlaybackManager.resume();
  }, [soundOpen, soundPageOpen]);

  /*
   * Posts using this sound. Fetched lazily - only once the sheet or the page is
   * actually opened - so scrolling the feed never issues a request per post.
   */
  const trackId = (video.main_sound ?? video.music_track ?? null)?.id ?? null;
  const [soundVideos, setSoundVideos] = useState<SoundSheetVideo[]>([]);
  const [soundTotal, setSoundTotal] = useState<number | null>(null);
  const [soundLoading, setSoundLoading] = useState(false);
  /** Which track the grid currently holds, so a failed load can retry. */
  const loadedTrackRef = useRef<number | null>(null);

  useEffect(() => {
    if (!(soundOpen || soundPageOpen) || trackId == null) return;

    /*
     * Dedupe on the TRACK, not on "have we got a total yet".
     *
     * The guard here was `if (soundTotal !== null) return`, which looked
     * equivalent but was not: once a total had been stored, nothing could ever
     * refetch. A fetch that set the total but returned no rows - which is what
     * the old parser did - left the component permanently stuck showing
     * "1 posts" above an empty grid, and because this item stays mounted and
     * Fast Refresh preserves state, not even reloading the bundle cleared it.
     *
     * Keying on the track id means a successful load is still fetched once,
     * while a change of sound (or a corrected parser) can always load again.
     */
    if (loadedTrackRef.current === trackId) return;
    loadedTrackRef.current = trackId;

    let alive = true;
    setSoundLoading(true);
    fetchSoundVideos(trackId)
      .then(({ videos, total }) => {
        if (!alive) return;
        setSoundTotal(total);
        const mapped: SoundSheetVideo[] = videos.map((v: any) => ({
          id: v.id,
          thumbnailUrl: v.thumbnail_url ?? null,
          views: fmt(Number(v.views_count ?? 0)),
          // The original is the post by whoever the sound is credited to.
          // The API sorts by views, so position says nothing about who was
          // first - this has to be decided by author, not by rank.
          tag:
            v.user?.username && v.user.username === video.user?.username
              ? ("original" as const)
              : undefined,
        }));

        /*
         * Pin the original to the front.
         *
         * The endpoint sorts by views, and an original is usually the NEWEST
         * post on its own sound - so it has the fewest views and sinks to the
         * bottom, or off the first page entirely. That is why it looked
         * missing. Everything else keeps the server's popularity order.
         */
        mapped.sort((a, b) =>
          a.tag === "original" ? -1 : b.tag === "original" ? 1 : 0,
        );

        setSoundVideos(mapped);
      })
      .finally(() => {
        if (alive) setSoundLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [soundOpen, soundPageOpen, trackId, video.user?.username]);

  const togglePlay = useCallback(() => {
    setPaused((v) => !v);
    // Restart from 0 rather than animating from wherever the last one got to,
    // so a fast double toggle gives two distinct rings instead of one that
    // stalls halfway and jumps.
    pulse.setValue(0);
    Animated.timing(pulse, {
      toValue: 1,
      duration: 420,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [pulse]);

  /* ── Tap: play/pause once, LIKE on two or more ──────────────────────────
   * Same rule as the website: a second tap within 300ms (and 50ms after the
   * first, so one physical press cannot register twice) and within 60px counts
   * as a double-tap. The single-tap play toggle is held on a timer until that
   * window passes, so a double-tap never flickers the video between states.
   *
   * Only ever LIKES. Tapping twice on something already liked leaves it liked -
   * an accidental unlike is the one outcome nobody wants from this gesture, and
   * it is why this cannot just call onToggleLike.
   *
   * Every tap past the second throws another heart, so a fast triple or
   * quadruple tap keeps bursting the way it does on TikTok. */
  const [hearts, setHearts] = useState<{ id: number; x: number; y: number; rotate: number }[]>([]);
  const lastTap = useRef({ t: 0, x: 0, y: 0 });
  const singleTap = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartId = useRef(0);

  /* ── Hold either side to run at 2x ───────────────────────────────────────
   *
   * Replaces the ±5s tap-seek that used to live on these zones.
   *
   * The boost restores to `speed` - the user's saved playback preference - and
   * NOT to 1. Someone who set 0.75x in the playback sheet must get 0.75x back
   * when they let go, or this gesture silently overwrites a setting they chose.
   *
   * `boosting` is state because an indicator reads it, but `boostedRef` is a
   * ref: the release handler needs to know a boost happened during the very
   * same gesture, and a state update queued in onPressOut is not readable by
   * the onPress that follows it in the same tick. */
  const [boosting, setBoosting] = useState(false);
  const boostTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boostedRef = useRef(false);
  /* The window, NOT the `height` prop: that one is the pager's, which stops
     above the tab bar the pull-down is aimed at. */
  const { height: windowH } = useWindowDimensions();



  /** Pulled down onto the tab bar: 2x outlives the release, until the next tap.
   *  The ref is what the handlers read (synchronously, mid-gesture); the store
   *  value is what the badge renders from. */
  const lockedRef = useRef(false);
  const locked = useSpeedBoost((s) => s.locked);

  /**
   * Drop the boost and put the rate back.
   *
   * `keepRate` is what separates a release that LOCKED from one that did not.
   * Locking still ends the gesture - the hint comes down, the pager unfreezes -
   * but the player must stay at 2x, so the one thing it skips is the restore.
   */
  const endBoost = useCallback(
    (keepRate = false) => {
      if (boostTimer.current) {
        clearTimeout(boostTimer.current);
        boostTimer.current = null;
      }
      useSpeedBoost.getState().setHinting(false);
      if (!boostedRef.current) return;
      if (!keepRate && player) player.setRate(speed);
      setBoosting(false);
    },
    [player, speed],
  );

  /** Back to normal speed from a locked state. Idempotent. */
  const releaseLock = useCallback(() => {
    if (!lockedRef.current) return;
    lockedRef.current = false;
    useSpeedBoost.getState().setLocked(false);
    if (player) player.setRate(speed);
  }, [player, speed]);

  const onPressIn = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      // A tap while locked is the way out, and is handled in onTap. Arming a
      // fresh boost on the same touch would re-enter 2x as it left it.
      if (lockedRef.current) return;
      /*
       * Nothing to speed up while the post is paused.
       *
       * playbackRate is a property of the player, not of the act of playing, so
       * setting it on a paused video is silently stored and applied the moment
       * playback resumes - the user pauses, rests a thumb on the edge, taps to
       * resume, and the video takes off at 2x for no reason they can see. The
       * badge would have appeared over a still frame too, announcing a speed
       * that was not happening.
       */
      if (paused) return;
      // Photos have no rate to change, and the scrubber owns the bottom strip.
      if (!isVideo || y > height - 130) return;
      // Centre is the popup's zone, so it never arms a boost.
      const side = x < width * 0.3 || x > width * 0.7;
      if (!side) return;

      if (boostTimer.current) clearTimeout(boostTimer.current);
      boostTimer.current = setTimeout(() => {
        boostTimer.current = null;
        // Nothing to boost without a player yet (Expo Go, or the source
        // hasn't resolved). The badge/haptic would announce a speed change
        // that never actually happens.
        if (!player) return;
        boostedRef.current = true;
        player.setRate(HOLD_SPEED);
        setBoosting(true);
        // Swaps the tab bar for the pull-down hint AND freezes the pager. The
        // freeze is not decoration: the FlatList takes the responder the moment
        // a touch moves vertically, so without it the drag towards the bar
        // scrolls to the previous post instead of ever reaching it.
        useSpeedBoost.getState().setHinting(true);
        if (Platform.OS !== "web") {
          haptics.medium();
        }
      }, HOLD_DELAY_MS);
    },
    // `paused` is load-bearing here, not incidental: without it this callback
    // closes over the value from its last render and the guard above reads a
    // stale pause state, so the boost would still arm on a paused post.
    [isVideo, height, width, player, paused],
  );

  /**
   * Finger travel during a hold, which is the whole pull-down gesture.
   *
   * pageY, not locationY: locationY is measured against this item, and the drop
   * target is the TAB BAR, which is below the item entirely. Only a
   * screen-space coordinate can tell whether the finger has actually got there.
   *
   * Arriving is enough - the lock is set on entry rather than on release, so
   * the haptic lands while the finger is still over the bar and confirms it.
   */
  const onTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (!boostedRef.current || lockedRef.current) return;
      if (e.nativeEvent.pageY < windowH - LOCK_ZONE_H) return;
      lockedRef.current = true;
      useSpeedBoost.getState().setLocked(true);
      if (Platform.OS !== "web") {
        haptics.success();
      }
    },
    [windowH],
  );

  const onPressOut = useCallback(() => {
    endBoost(lockedRef.current);
    // Cleared on the NEXT tick, not here: onPress fires after onPressOut, and
    // it reads this flag to suppress the tap that ending a hold would otherwise
    // register - a release must not also pause or flash the scrubber.
    setTimeout(() => {
      boostedRef.current = false;
    }, 0);
  }, [endBoost]);

  /* Scrolling away, unmounting, or a source swap must not strand the player at
     2x. The player outlives any one gesture, so a release that never arrives -
     the finger leaves during a scroll, say - would otherwise be permanent. */
  useEffect(
    () => () => {
      if (boostTimer.current) clearTimeout(boostTimer.current);
      if (boostedRef.current || lockedRef.current) {
        boostedRef.current = false;
        lockedRef.current = false;
        if (player) player.setRate(speed);
      }
      // Unconditional: a hint left up would sit on the tab bar forever, over a
      // gesture whose item no longer exists.
      useSpeedBoost.getState().clear();
    },
    [player, speed],
  );

  /* Scrolling to another post ends both the boost and the lock. A lock is tied
     to the video it was set on - carrying 2x silently into the next post is not
     something the user asked for and there would be no hint that it happened. */
  useEffect(() => {
    if (active) return;
    if (boostedRef.current || lockedRef.current) {
      boostedRef.current = false;
      lockedRef.current = false;
      if (player) player.setRate(speed);
      setBoosting(false);
    }
    useSpeedBoost.getState().clear();
  }, [active, player, speed]);

  useEffect(
    () => () => {
      if (singleTap.current) clearTimeout(singleTap.current);
    },
    [],
  );

  const onTap = useCallback(
    (e: GestureResponderEvent) => {
      const { locationX: x, locationY: y } = e.nativeEvent;

      // Releasing a 2x hold must not also count as a tap.
      if (boostedRef.current) return;

      // While 2x is locked, the first tap anywhere is the way out and does
      // nothing else - it must not also pause, which is what a tap normally
      // does in the centre.
      if (lockedRef.current) {
        releaseLock();
        return;
      }

      const now = Date.now();
      const prev = lastTap.current;
      const gap = now - prev.t;
      const near = Math.hypot(x - prev.x, y - prev.y) < 60;

      if (gap > 50 && gap < 300 && near) {
        if (singleTap.current) {
          clearTimeout(singleTap.current);
          singleTap.current = null;
        }
        setHearts((p) => [...p, { id: ++heartId.current, x, y, rotate: Math.random() * 40 - 20 }]);
        if (!liked) onToggleLike();
        // Keep the streak open so a third and fourth tap also burst.
        lastTap.current = { t: now, x, y };
        return;
      }

      lastTap.current = { t: now, x, y };
      if (singleTap.current) clearTimeout(singleTap.current);
      singleTap.current = setTimeout(() => {
        singleTap.current = null;

        /*
         * Two zones: the outer 30% either side, and the centre 40%.
         *
         * Centre is play/pause, exactly as it always was. The sides no longer
         * do anything on a TAP - the ±5s seek that used to live there is gone,
         * and they are the 2x hold's territory now, armed in onPressIn.
         *
         * Still inside the SAME timeout that separates a single tap from a
         * double tap, which is what keeps this off the like gesture: a second
         * tap cancels this callback before it runs, so double-tapping the
         * centre throws a heart instead of pausing.
         */

        /* Every single tap reveals the scrubber, whatever the zone then does.
           Being inside the double-tap timeout is what keeps a like from
           flashing it. Photos mount no bar, so the optional call no-ops. */
        barRef.current?.reveal();

        /* A tap anywhere toggles - the zones apply to the HOLD, not to this.
           The sides used to fall through to nothing on a tap, which meant two
           thirds of the screen looked dead to a quick press. Tap and hold are
           already separated by the 350ms timer, so the sides can carry both:
           tap pauses, hold runs at 2x. */
        togglePlay();
      }, 300);
    },
    [liked, onToggleLike, togglePlay, releaseLock],
  );

  /**
   * Press and hold the CENTRE: playback options, at the same 350ms it always
   * opened on.
   *
   * Centre-only is forced by the 2x hold rather than chosen. onLongPress fires
   * at 350ms and the boost does not arm until 2000ms, so a long-press that
   * still covered the sides would open this sheet on the way to every boost and
   * the boost could never be reached at all. The sides are the hold's, the
   * centre is the sheet's. A photo has no boost, so its whole surface still
   * opens the sheet the way it used to.
   *
   * RN suppresses onPress once a long press has fired, so the play/pause toggle
   * cannot also run - but a timer armed by an EARLIER tap still can, and is
   * cleared here.
   */
  const onHold = useCallback(
    (e: GestureResponderEvent) => {
      if (!onPlaybackOptions) return;
      const { locationX: x, locationY: y } = e.nativeEvent;
      // The bottom strip belongs to the scrubber, same as a tap.
      if (y > height - 130) return;
      if (isVideo && (x < width * 0.3 || x > width * 0.7)) return;
      if (singleTap.current) {
        clearTimeout(singleTap.current);
        singleTap.current = null;
      }
      if (Platform.OS !== "web") haptics.medium();
      onPlaybackOptions();
    },
    [height, width, isVideo, onPlaybackOptions],
  );

  const stillImage = video.thumbnail_url ?? null;

  // Most posts have no separate title at all (the compose screen has no
  // title field - only caption), so `title` is empty and `headline` falls
  // back to `caption`. The old guard here only compared `caption !== title`,
  // which is vacuously true once `title` is "" - so `body` collapsed to the
  // exact same string as `headline`, rendering the one caption as two
  // identical stacked lines. Requiring `title` to be non-empty first is what
  // actually means "there IS a second, different field to show".
  const title = video.title?.trim() ?? "";
  const caption = video.caption?.trim() ?? "";
  const headline = title || caption;
  const body = title && caption && caption !== title ? caption : "";

  /**
   * Collapsed caption: line 1 shows in full, and IF there is a real line 3
   * or beyond, line 2 is cut to about half of its own text with a custom
   * "...more" appended - not the system ellipsis, and not a uniform width
   * cap on the whole block (that shrank line 1 too, which was wrong - only
   * line 2 should ever be short).
   *
   * RN can't answer "how many lines does this actually need" from the
   * collapsed Text alone, so a fully unclamped, invisible clone of the same
   * text/style measures it for real: onTextLayout's `lines` array reports
   * each wrapped line's own text. null means "fits within 2 lines as-is,
   * nothing to cut"; otherwise this holds line 1 + half of line 2, ready to
   * render with "...more" after it. Reset whenever the caption text itself
   * changes (this component is recycled by the feed - a stale value from
   * the previous post must not leak in for a frame before the new
   * measurement lands).
   *
   * Scoped to the common case only (a post with just a caption, no separate
   * title) - when a title AND caption both exist, headline/body keep their
   * original one-line-each layout untouched, matching the anchoring
   * invariant documented above the caption block below.
   */
  const [captionPreview, setCaptionPreview] = useState<string | null>(null);
  useEffect(() => {
    setCaptionPreview(null);
  }, [headline]);

  return (
    <View style={{ width, height }}>
      {/* Solid black fallback behind the media. With "cover" (below) the
          video/poster always fills this box completely, so this is never
          actually visible in normal use - kept only as a safety background
          for the moment before either has painted anything (a blurred
          cover-fit copy of the thumbnail was tried here instead and
          removed; do not re-add it without checking that history first). */}
      <View style={[styles.fill, styles.letterbox]} pointerEvents="none" />

      {/* Poster under the player so there is no gap while the first frame
          decodes. It must use the SAME contentFit as the VideoView below -
          a still framed differently from the video visibly jumps the moment
          playback starts. */}
      {stillImage ? (
        <Image
          source={{ uri: stillImage }}
          style={styles.fill}
          contentFit={nineSixteen ? "cover" : "contain"}
          transition={120}
        />
      ) : null}

      {/* 9:16 posts use "cover" - fills the box edge-to-edge with no
          letterbox gap, at the cost of cropping roughly 5% off each side
          on a device taller than 9:16 (about 33pt top+bottom on a
          393x852 screen under the previous "contain" choice, which
          avoided any crop but could never make the video's bottom edge
          meet the bottom nav with zero gap - the requirement this
          reverses the trade for). Every other ratio (landscape, square,
          other portraits) keeps "contain" - see isNineSixteen() above.
          Set inside FeedVideoPlayer via VideoView's contentFit. */}
      {source ? (
        <FeedVideoPlayer
          source={source}
          active={active}
          preload={preload}
          focused={focused}
          paused={paused}
          loop={shouldLoop}
          muted={muted}
          rate={speed}
          quality={quality}
          fitMode={nineSixteen ? "cover" : "contain"}
          onEnded={autoScroll ? onEnded : undefined}
          onPlayerChange={setPlayer}
        />
      ) : active && isVideo ? (
        <View style={[styles.fill, styles.center]}>
          <ActivityIndicator color={ds.onDark} />
        </View>
      ) : null}

      <Pressable
        style={styles.fill}
        onPress={onTap}
        onLongPress={onHold}
        delayLongPress={HOLD_DELAY_MS}
        onPressIn={onPressIn}
        onPressOut={onPressOut}
        onTouchMove={onTouchMove}
        accessibilityRole="button"
        accessibilityLabel={paused ? "Play" : "Pause"}
        accessibilityHint={
          onPlaybackOptions
            ? "Press and hold the centre for playback options, or hold either side to play at double speed"
            : undefined
        }
      />

      {/* 2x badge, centred at the top the way TikTok's is - the gesture works
          on either side, so anchoring it to one of them would misreport which
          half is held. pointerEvents none: the finger is still down on the
          surface underneath and must keep owning the gesture. */}
      {boosting || locked ? (
        <View pointerEvents="none" style={styles.boostBadge}>
          <Text style={styles.boostText}>
            {locked ? "2× speed · tap to stop" : "2× speed"}
          </Text>
        </View>
      ) : null}

      {hearts.map((h) => (
        <HeartBurst
          key={h.id}
          x={h.x}
          y={h.y}
          rotate={h.rotate}
          onDone={() => setHearts((p) => p.filter((k) => k.id !== h.id))}
        />
      ))}

      {/* The ring lives OUTSIDE the indicator below, and has to: that wrapper's
          opacity is the `indicator` value, which is 0 whenever the video is
          playing - so a ring nested inside it would be invisible on exactly the
          half of the toggles that resume playback. Its own layer means the
          pulse reads the same pausing and playing. */}
      <Animated.View pointerEvents="none" style={styles.indicator}>
        <Animated.View
          style={[
            styles.ring,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 0] }),
              transform: [
                { scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1.65] }) },
              ],
            },
          ]}
        />
      </Animated.View>

      {/* pointerEvents none: the indicator must never swallow the next tap. */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.indicator,
          {
            opacity: indicator,
            transform: [
              { scale: indicator.interpolate({ inputRange: [0, 1], outputRange: [1.25, 1] }) },
            ],
          },
        ]}
      >
        <View style={styles.disc}>{paused ? <PauseGlyph /> : <PlayGlyph />}</View>
      </Animated.View>

      <LinearGradient
        colors={["rgba(8,7,10,0.7)", "rgba(8,7,10,0)"]}
        style={[styles.topScrim, { height: 190 }]}
        pointerEvents="none"
      />
      <LinearGradient
        colors={["rgba(8,7,10,0)", "rgba(8,7,10,0.86)"]}
        style={[styles.bottomScrim, { height: 340 }]}
        pointerEvents="none"
      />

      <FeedActionRail
        avatarUri={video.user?.avatar ?? null}
        avatarInitial={(video.user?.username ?? "R").charAt(0).toUpperCase()}
        hasStory={!!video.user?.has_story}
        storySeen={!!video.user?.has_story && !video.user?.has_unseen}
        showFollow={showFollow}
        showFollowing={showFollowing}
        onFollow={onToggleFollow}
        onOpenProfile={openCreator}
        liked={liked}
        likeLabel={fmt(video.likes_count + (liked && !video.is_liked ? 1 : !liked && video.is_liked ? -1 : 0))}
        commentLabel={fmt(video.comments_count)}
        saved={saved}
        saveLabel={fmt(video.saves_count + (saved && !video.is_saved ? 1 : !saved && video.is_saved ? -1 : 0))}
        shareLabel={fmt(video.shares_count)}
        onLike={onToggleLike}
        onSave={onToggleSave}
        onComments={onComments}
        onShare={onShare}
        discCoverUri={discCover(video)}
        showDisc={hasAudio(video)}
        onSound={() => setSoundOpen(true)}
        bottomInset={chromeBottomInset}
      />

      {isVideo && (
        <FeedProgressBar ref={barRef} player={player} active={active} onScrubbingChange={setScrubbing} />
      )}

      {/* Content-attached link/product bar.

          Deliberately NOT a child of captionBlock: as a child it joined that
          block's flow, and the handle/location/caption/sound rows shifted to
          make room for it. Floating it above the block instead - anchored off
          the block's own measured height - means those rows keep exactly the
          positions they had before this feature existed, and the bar simply
          sits above them.

          Rendered only once the block has been measured, so it never flashes
          in at the wrong offset on first paint. */}
      {!scrubbing && captionH > 0 && (
        <View
          style={[styles.linkBarFloat, { bottom: 12 + chromeBottomInset + captionH + 8 }]}
          pointerEvents="box-none"
        >
          <ContentLinkBar video={video} />
        </View>
      )}

      {!scrubbing && (
      /* This block sits over the scrubber's grab strip, so it must not swallow
         touches - taking them would cost the user the bottom of the seek zone.
         It was pointerEvents="none" while it held nothing tappable; it is
         "box-none" now that the Wikipedia "Learn more" card below can be
         tapped:

           none     - neither this view NOR its children take touches
           box-none - this view never takes touches, but children may

         The touchable children are the Wikipedia card and the caption, which
         now expands on tap. Everything else is a Text, so taps over the handle
         and the sound line still fall through to play/pause and seek exactly
         as before. "auto" would have made the whole block swallow taps. */
      <View
        style={[styles.captionBlock, !!chromeBottomInset && { bottom: 12 + chromeBottomInset }]}
        onLayout={(e) => setCaptionH(e.nativeEvent.layout.height)}
        pointerEvents="box-none"
      >
        {/* Location - just above the handle, only when the creator tagged
            one at upload. Opens the same "all videos from here" feed the
            website's own location pin links to (see openLocation above). */}
        {!!video.location && (
          <Pressable
            onPress={openLocation}
            style={styles.locationRow}
            accessibilityRole="button"
            accessibilityLabel={`View ${video.location} location feed`}
            hitSlop={4}
          >
            <MapPin size={11} color="#3DDC84" />
            <Text style={styles.locationText} numberOfLines={1}>{video.location}</Text>
            <Text style={styles.locationView}> · View</Text>
          </Pressable>
        )}

        {/* The handle opens the creator. Through the creator LAYER rather than
            a route push, because that is what the feed's own swipe-right does
            (useFeedSwipe: begin on drag, settle on release) - so a tap and a
            swipe land on the same card, animated the same way, instead of the
            tap arriving as a differently-moving screen.

            The verified badge is inside the target on purpose: it reads as part
            of the name, and a dead 15pt gap in the middle of a tappable row is
            the kind of thing that feels broken without being visible. */}
        <View style={styles.handleLine}>
          <Pressable
            onPress={openCreator}
            disabled={!video.user?.username}
            style={styles.handleRow}
            accessibilityRole="button"
            accessibilityLabel={`Open @${video.user?.username ?? ""}'s profile`}
            hitSlop={{ top: 6, bottom: 6, right: 10 }}
          >
            <Text style={styles.handle}>@{video.user?.username}</Text>
            {video.user?.is_verified && <VerifiedBadge size={15} />}
            {!!video.created_at && <Text style={styles.uploadDate}>{shortDate(video.created_at)}</Text>}
          </Pressable>

          {/* Nested Pressable, not part of handleRow above - a tap here opens
              the tagged-people list instead of the creator's own profile. */}
          {!!video.tagged_users?.length && (
            <Pressable
              onPress={() => setTaggedListOpen(true)}
              style={styles.taggedIconBtn}
              accessibilityRole="button"
              accessibilityLabel="View tagged people"
              hitSlop={8}
            >
              <TagIconGlyph size={18} />
            </Pressable>
          )}

          {/* Same idea, for "Paid partnership" collab tags - yellow so it
              reads distinctly from the plain tag icon. */}
          {!!video.collab_users?.length && (
            <Pressable
              onPress={() => setCollabListOpen(true)}
              style={styles.taggedIconBtn}
              accessibilityRole="button"
              accessibilityLabel="View collab partners"
              hitSlop={8}
            >
              <CollabIconGlyph size={25} color="#F5C518" />
            </Pressable>
          )}
        </View>

        {/*
          Collapsed: a post with both a title and a caption keeps each to
          exactly ONE line, unchanged - that is what pins the block (anchored
          to the bottom, grows upward) so its length doesn't shove the handle
          up the screen. The common case - just a caption, no separate title -
          shows line 1 in full and, only when there really is more beyond
          line 2, cuts line 2 to about half its own text with a custom
          "...more" appended (see captionPreview above) - not the system
          ellipsis, and not a width cap on the whole block.

          Tapping shows the whole thing. Collapsing again is the same tap, and
          scrolling away resets it. The Pressable does mean a tap here no
          longer reaches play/pause or the seek zones underneath - that is the
          trade the expand gesture costs, and it is confined to the caption.
        */}
        {(!!headline || !!body) && (
          <Pressable
            onPress={() => setCaptionOpen((v) => !v)}
            accessibilityRole="button"
            style={styles.captionRow}
          >
            {!!headline && !body && (
              // Invisible clone, unclamped - the only reliable way to get
              // each real wrapped line's own text (RN's numberOfLines
              // truncation alone can't say what line 2 actually contains).
              <Text
                numberOfLines={0}
                style={[styles.title, styles.captionMeasure]}
                onTextLayout={(e) => {
                  const lines = e.nativeEvent.lines;
                  if (active) {
                    console.log("[CAP_PROBE]", JSON.stringify({
                      hasProducts: !!video.featured_products?.length,
                      lineCount: lines.length,
                      lineTexts: lines.map((l) => l.text).slice(0, 4),
                      headlineLen: headline.length,
                    }));
                  }
                  if (lines.length > 2) {
                    const line2 = lines[1].text.trimEnd();
                    const half = line2.slice(0, Math.ceil(line2.length / 2)).trimEnd();
                    setCaptionPreview(lines[0].text + half);
                  } else {
                    setCaptionPreview(null);
                  }
                }}
              >
                {headline}
              </Text>
            )}
            {!!headline && (
              <Text
                numberOfLines={captionOpen ? undefined : (body ? 1 : 2)}
                ellipsizeMode="tail"
              >
                {renderMentionText(
                  captionOpen || body || !captionPreview ? headline : captionPreview,
                  styles.title,
                  [styles.title, styles.mention],
                  openMentionedProfile,
                  "h",
                )}
                {!captionOpen && !body && !!captionPreview && (
                  <Text style={styles.captionMore}>...more</Text>
                )}
              </Text>
            )}
            {!!body && (
              <Text
                numberOfLines={captionOpen ? undefined : 1}
                ellipsizeMode="tail"
              >
                {renderMentionText(
                  body,
                  [styles.caption, !!headline && styles.captionSpaced],
                  [styles.caption, !!headline && styles.captionSpaced, styles.mention],
                  openMentionedProfile,
                  "b",
                )}
              </Text>
            )}
          </Pressable>
        )}

        {/* "AI-generated content" - the creator's own is_ai_generated toggle
            from the upload screen's Media & safety page, surfaced below the
            caption the same way it's labelled there ("AI-generated
            content", SparkleGlyph). Independent of the tag/collab icons
            above - shown whenever the field is true, collapsed or open.
            Tappable, same as those, to explain what the label means. */}
        {!!video.is_ai_generated && (
          <Pressable
            onPress={() => setAiInfoOpen(true)}
            style={styles.aiRow}
            accessibilityRole="button"
            accessibilityLabel="About AI-generated content"
            hitSlop={6}
          >
            <SparkleGlyph size={13} />
            <Text style={styles.aiLabel}>AI-generated content</Text>
            <InfoDotGlyph />
          </Pressable>
        )}

        {/*
          "Learn more" - Wikipedia context, below the caption.

          Keyed on the FIRST hashtag, not the caption: a caption is free prose
          that would never resolve to an article, while a hashtag is already
          the creator's own one-word label for the subject. Only the first is
          used, so a video can never cost more than one lookup however many
          tags it carries, and the backend's entity gate discards the junk ones
          (#fyp, #viral) with no network call at all.

          Collapsed to a single line by default so it cannot cover the video,
          and it loads well after playback starts - nothing here is awaited by
          the player.
        */}
        {video.hashtags?.length > 0 && (
          <KnowledgeCard
            query={video.hashtags[0]}
            variant="inline"
            dark
            style={styles.knowledgeCard}
          />
        )}

        {/* Opens the same sheet the rail's disc opens - note, title and
            "Original track - @user" are one target, so either half works.

            This line was deliberately made a plain label once, to stop a tap
            here being ambiguous with the play/pause and seek zones underneath.
            That trade is taken again on request, and it is the same one the
            caption above now makes. hitSlop because the row is only ~15pt
            tall: without it the strip is smaller than a fingertip. */}
        {hasAudio(video) && (
          <Pressable
            style={styles.soundRow}
            onPress={() => setSoundOpen(true)}
            hitSlop={{ top: 8, bottom: 8, left: 6, right: 6 }}
            accessibilityRole="button"
            accessibilityLabel={`Sound: ${soundLine(video)}`}
          >
            <NoteGlyph />
            <Text style={styles.sound} numberOfLines={1}>
              {soundLine(video)}
            </Text>
          </Pressable>
        )}
      </View>
      )}

      {/* Rendered only while open so an off-screen post carries no Modal.
          Grid is empty for now - there is no endpoint yet for "posts using
          this sound", so the sheet shows the track's own details and the
          section stays blank rather than showing invented tiles. */}
      {soundOpen && (
        <SoundSheet
          visible={soundOpen}
          onClose={() => setSoundOpen(false)}
          title={soundTitle(video)}
          subtitle={soundLine(video)}
          coverUrl={discCover(video)}
          originalBy={video.user?.username ?? null}
          videos={soundVideos}
          postCount={soundTotal !== null ? `${fmt(soundTotal)} posts` : null}
          // Save bookmarks THIS POST, using the same /videos/{id}/save the rail
          // uses - so it lands in Profile > Saved with everything else.
          //
          // Not a music_tracks favourite: no such endpoint exists, and
          // /audio/{id}/favorite writes audio_favorites, keyed to audio_tracks,
          // which is a different table. Saving the post is what the user asked
          // for and what the backend can already honour today.
          saved={saved}
          onToggleSave={handleSoundSave}
          // ↗ hands off to the full page: close the sheet, open the page.
          // Presented as a modal rather than a route so the post underneath
          // stays mounted - going back returns to this exact frame, and the
          // profile post viewer gets it without registering a screen too.
          onExpand={() => {
            setSoundOpen(false);
            setSoundPageOpen(true);
          }}
        />
      )}

      <Modal
        visible={soundPageOpen}
        animationType="slide"
        presentationStyle="fullScreen"
        onRequestClose={() => setSoundPageOpen(false)}
      >
        <SoundPageScreen
          title={soundTitle(video)}
          subtitle={soundLine(video)}
          coverUrl={discCover(video)}
          originalBy={video.user?.username ?? null}
          videos={soundVideos}
          postCount={soundTotal !== null ? fmt(soundTotal) : null}
          loading={soundLoading}
          saved={saved}
          onToggleSave={handleSoundSave}
          onBack={() => setSoundPageOpen(false)}
        />
      </Modal>

      <BottomSheet
        visible={taggedListOpen}
        onClose={() => setTaggedListOpen(false)}
        height="auto"
        header={<Text style={styles.taggedSheetTitle}>Tagged people</Text>}
      >
        {video.tagged_users?.map((u) => (
          <Pressable
            key={u.id}
            style={styles.taggedRow}
            onPress={() => {
              setTaggedListOpen(false);
              openMentionedProfile(u.username);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open @${u.username}'s profile`}
          >
            <Avatar uri={u.avatar_url} style={styles.taggedAvatar} />
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.taggedName}>{u.display_name || u.username}</Text>
                {u.verified && <VerifiedBadge size={14} />}
              </View>
              <Text style={styles.taggedUsername}>@{u.username}</Text>
            </View>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={collabListOpen}
        onClose={() => setCollabListOpen(false)}
        height="auto"
        header={<Text style={styles.taggedSheetTitle}>Collab partners</Text>}
      >
        {video.collab_users?.map((u) => (
          <Pressable
            key={u.id}
            style={styles.taggedRow}
            onPress={() => {
              setCollabListOpen(false);
              openMentionedProfile(u.username);
            }}
            accessibilityRole="button"
            accessibilityLabel={`Open @${u.username}'s profile`}
          >
            <Avatar uri={u.avatar_url} style={styles.taggedAvatar} />
            <View>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Text style={styles.taggedName}>{u.display_name || u.username}</Text>
                {u.verified && <VerifiedBadge size={14} />}
              </View>
              <Text style={styles.taggedUsername}>@{u.username}</Text>
            </View>
          </Pressable>
        ))}
      </BottomSheet>

      <BottomSheet
        visible={aiInfoOpen}
        onClose={() => setAiInfoOpen(false)}
        height="auto"
        header={
          <View style={styles.aiInfoHeader}>
            <SparkleGlyph size={16} color="#121014" />
            <Text style={styles.taggedSheetTitle}>AI-generated content</Text>
          </View>
        }
      >
        <Text style={styles.aiInfoBody}>
          The creator disclosed that this content was created or meaningfully
          edited using artificial intelligence tools, in line with Teezer's
          AI-generated content requirements. This label reflects the
          creator's own disclosure at the time of publishing.
        </Text>

        <View style={styles.aiInfoDivider} />

        {/* Same URLs PoliciesScreen.tsx's own rows use - not restated text,
            the live pages themselves, opened the same way every other
            policy link in the app already opens (openPolicy -> the in-app
            PolicyViewer). Sheet closes first so the transition is clean. */}
        <Pressable
          style={styles.policyLinkRow}
          onPress={() => {
            setAiInfoOpen(false);
            openPolicy({ url: "https://teezer.live/policies/ai-content", title: "AI-Generated Content Policy" });
          }}
          accessibilityRole="button"
          accessibilityLabel="Open AI-Generated Content Policy"
        >
          <Text style={styles.policyLinkText}>AI-Generated Content Policy</Text>
          <ChevronGlyph />
        </Pressable>
        <Pressable
          style={styles.policyLinkRow}
          onPress={() => {
            setAiInfoOpen(false);
            openPolicy("terms");
          }}
          accessibilityRole="button"
          accessibilityLabel="Open Terms of Service"
        >
          <Text style={styles.policyLinkText}>Terms of Service</Text>
          <ChevronGlyph />
        </Pressable>
      </BottomSheet>
    </View>
  );
});

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill },
  center: { alignItems: "center", justifyContent: "center" },
  letterbox: { backgroundColor: "#000000" },
  // The Expo Go / native-module-missing notice. Sits over the poster, which
  // is why it needs its own dim backing - without one the message would be
  // unreadable over a bright thumbnail.

  // Top-centre, clear of the thumb holding either edge.
  boostBadge: {
    position: "absolute",
    top: "12%",
    alignSelf: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: "rgba(0,0,0,0.55)",
  },
  boostText: { color: ds.onDark, fontSize: 14, fontWeight: "800" },
  indicator: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
  },
  /* The disc the glyph now sits on. A bare mark had to fight whatever was
     behind it - a white pause over a bright frame all but disappeared - and a
     translucent black circle fixes that without hiding the video. */
  disc: {
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    backgroundColor: "rgba(0,0,0,0.42)",
    alignItems: "center",
    justifyContent: "center",
  },
  /* Expands out of the disc and fades. Border-only, so it reads as a ripple
     leaving the button rather than a second disc growing over the video. */
  ring: {
    position: "absolute",
    width: DISC_SIZE,
    height: DISC_SIZE,
    borderRadius: DISC_SIZE / 2,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.9)",
  },
  topScrim: { position: "absolute", left: 0, right: 0, top: 0 },
  bottomScrim: { position: "absolute", left: 0, right: 0, bottom: 0 },

  // 22, not the design's 106: that offset assumed the post ran underneath an
  // overlaying tab bar. Ours reserves its own space, so the old value left an
  // 80pt dead band above it. Tuned by eye - 26 originally, 14 was a step too
  // far down, 22 sits between them. The floor is the scrubber's grab strip,
  // which this must stay clear of.
  // left 14, not 22: sits a little closer to the edge, which also buys the
  // caption back some width against the action rail on the right.
  captionBlock: { position: "absolute", left: 14, right: 86, bottom: 12, gap: 7 },
  linkBarFloat: { position: "absolute", left: 14, right: 86 },
  /** A little extra room between the username row and the caption below it,
   *  on top of captionBlock's own 7px gap. */
  captionRow: { marginTop: 3 },
  // The parent's `gap: 7` already spaces this from the caption; no extra
  // margin, or the collapsed one-line card would sit too far from the text it
  // belongs to.
  knowledgeCard: {},
  locationRow: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 3, alignSelf: "flex-start", maxWidth: "100%" },
  locationText: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.85)", flexShrink: 1 },
  locationView: { fontSize: 11, fontWeight: "600", color: "rgba(255,255,255,0.55)", flexShrink: 0 },
  handleLine: { flexDirection: "row", alignItems: "center" },
  handleRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  taggedIconBtn: { marginLeft: 12, opacity: 0.9 },
  taggedRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 12 },
  taggedAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "#EFECF1" },
  taggedName: { fontSize: 15, fontWeight: "700", color: "#121014" },
  taggedUsername: { fontSize: 13, color: "#8A8592", marginTop: 1 },
  taggedSheetTitle: { fontSize: 16, fontWeight: "700", color: "#121014", textAlign: "center", paddingVertical: 14 },
  handle: { color: ds.onDark, fontSize: 19, fontWeight: "700" },
  uploadDate: { color: "rgba(255,255,255,0.7)", fontSize: 13.5, fontWeight: "500", marginLeft: 1 },
  // lineHeight tracks fontSize on both of these - bumping the size alone would
  // have tightened the wrap on two- and three-line captions.
  title: { color: ds.onDark, fontSize: 15.5, fontWeight: "600", lineHeight: 20.5 },
  caption: { color: "rgba(255,255,255,0.92)", fontSize: 15, lineHeight: 20 },
  // The two caption lines share a Pressable now, so the block's `gap: 7` no
  // longer falls between them - this puts it back, and only when both show.
  captionSpaced: { marginTop: 7 },
  /** An @mention inside the caption - tappable, so it reads distinctly
   *  from the surrounding plain text. */
  mention: { color: ds.accent, fontWeight: "700" },
  /** Invisible unclamped clone used only to measure the caption's real
   *  wrapped lines - see captionPreview above. Absolute so it takes no
   *  layout space of its own. */
  captionMeasure: { position: "absolute", left: 0, right: 0, opacity: 0 },
  /** The custom "...more" appended to a truncated caption. */
  captionMore: { color: "rgba(255,255,255,0.6)", fontWeight: "700" },
  aiRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  aiLabel: { color: "rgba(255,255,255,0.75)", fontSize: 12.5, fontWeight: "600" },
  aiInfoHeader: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 },
  aiInfoBody: { fontSize: 14.5, lineHeight: 21, color: "#3A3642", paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16 },
  aiInfoDivider: { height: StyleSheet.hairlineWidth, backgroundColor: "#EFECF1", marginHorizontal: 20 },
  policyLinkRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  policyLinkText: { fontSize: 14.5, fontWeight: "600", color: "#121014" },
  soundRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  sound: { color: "rgba(255,255,255,0.72)", fontSize: 12.5, flexShrink: 1 },
});
