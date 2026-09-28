import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Linking,
  Share,
  useWindowDimensions,
} from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import LottieView from "lottie-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  CommonActions,
  StackActions,
  useNavigation,
  useRoute,
  type RouteProp,
} from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";
import { ds, radius } from "@/theme/design";
import { profileApi, profileGridQuery } from "@/api/profile.api";
import { storyApi } from "@/api/story.api";
import { videoApi } from "@/api/video.api";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { ProfileActionsSheet, profileUrl } from "@/components/profile/ProfileActionsSheet";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { useCreatorLayer } from "@/store/creator-layer.store";
import { usePostViewer } from "@/store/post-viewer.store";
import { useFollowList } from "@/store/follow-list.store";
import { SuggestedAccountsPanel } from "./SuggestedAccountsPanel";
import { isNewView, useProfileViewsSeen } from "@/store/profile-views.store";
import type { RootStackParamList } from "@/navigation/types";
import { COUNTRIES } from "@/constants/countries";
import type { ProfileDetails } from "@/types";
import { breadcrumb } from "@/services/sentry";

/** User-supplied illustrations (1024x1024 RGBA). */
const EMPTY_REELS = require("../../assets/empty-noreels.png");
// The "Reels" tab's own empty state (no reels uploaded yet) - a looping
// Lottie replacing the static EMPTY_REELS art for that one case. "Saved"
// still falls back to EMPTY_REELS below: that's "no saved reels", a
// different situation from "hasn't uploaded any reels".
const NO_REELS_UPLOADED = require("../../assets/NOREELSUPLOADEDANIMI.json");
// "Liked reels are private" (the 403 case) has no design right now - its old
// liked-private.png was renamed to no-liked-videos.png rather than replaced,
// so both the "no liked reels yet" and "liked reels are private" states
// share this same illustration until a distinct one is supplied for the
// private case specifically.
const NO_LIKED_VIDEOS = require("../../assets/no-liked-videos.png");
const LIKED_PRIVATE = NO_LIKED_VIDEOS;
const EMPTY_PLAYLIST = require("../../assets/empty-playlist.png");
const EMPTY_TAGGED = require("../../assets/empty-tagged.png");
const STUDIO_MARK = require("../../assets/teezer-studio-mark.png");

/** The website, for the surfaces the app links out to rather than rebuilds. */
const WEB = "https://teezer.live";

/**
 * Profile - the prototype's profile layer, on live data.
 *
 * Layout follows the design: identity is a LEFT-aligned row (88pt avatar beside
 * name / handle / bio / tags / meta), then a four-up stat strip with dividers,
 * the action row, tabs, and a 3-up grid.
 *
 * Own profile only. The design uses this same layer for viewing another
 * creator - which is why it carries a back affordance and Follow/Message - and
 * that path arrives with the creator overlay.
 */

const TABS = [
  { key: "Reels", label: "Reels" },
  { key: "Liked", label: "Liked" },
  { key: "Playlists", label: "Playlists" },
  { key: "Tagged", label: "Tagged" },
  // Yours alone. The endpoint is privacy-enforced anyway, but a "Saved" tab on
  // someone else's profile would advertise a list nobody but them can open.
  { key: "Saved", label: "Saved" },
  // Last of the row. Same "yours alone" reasoning as Saved above - the
  // server 403s anyone but the owner (UserController::drafts).
  { key: "Drafts", label: "Drafts" },
] as const;
/** Follow is a three-state relationship once private accounts exist. */
type FollowState = "none" | "pending" | "accepted";

/** What POST/DELETE /users/{username}/follow answers with - see the website's
 *  FollowController. `follow_status` is the authority; `following` only
 *  separates the last two. */
type FollowResponse = {
  follow_status?: FollowState;
  following?: boolean;
  followers_count?: number;
};

type TabKey =(typeof TABS)[number]["key"];

/**
 * Country as a readable name.
 *
 * `country` arrives as a 2-letter ISO code on some payloads and as a plain name
 * on others, so resolve a code when it looks like one and otherwise trust the
 * string. An unrecognised code is upper-cased rather than dropped - showing
 * "XX" beats showing nothing at all.
 */
function countryName(country: string | null | undefined): string | null {
  const raw = country?.trim();
  if (!raw) return null;
  if (raw.length !== 2) return raw;
  return COUNTRIES.find((c) => c.code === raw.toUpperCase())?.name ?? raw.toUpperCase();
}

function fmt(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  return String(n);
}

/* ── glyphs ─────────────────────────────────────────────────────────────── */

function EyeGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M9.34268 18.7819L7.41083 18.2642L8.1983 15.3254C7.00919 14.8874 5.91661 14.2498 4.96116 13.4534L2.80783 15.6067L1.39362 14.1925L3.54695 12.0392C2.35581 10.6103 1.52014 8.87466 1.17578 6.96818L3.14386 6.61035C3.90289 10.8126 7.57931 14.0001 12.0002 14.0001C16.4211 14.0001 20.0976 10.8126 20.8566 6.61035L22.8247 6.96818C22.4803 8.87466 21.6446 10.6103 20.4535 12.0392L22.6068 14.1925L21.1926 15.6067L19.0393 13.4534C18.0838 14.2498 16.9912 14.8874 15.8021 15.3254L16.5896 18.2642L14.6578 18.7819L13.87 15.8418C13.2623 15.9459 12.6376 16.0001 12.0002 16.0001C11.3629 16.0001 10.7381 15.9459 10.1305 15.8418L9.34268 18.7819Z" />
    </Svg>
  );
}

function UploadGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M13 14H11C7.54202 14 4.53953 15.9502 3.03239 18.8107C3.01093 18.5433 3 18.2729 3 18C3 12.4772 7.47715 8 13 8V2.5L23.5 11L13 19.5V14ZM11 12H15V15.3078L20.3214 11L15 6.69224V10H13C10.5795 10 8.41011 11.0749 6.94312 12.7735C8.20873 12.2714 9.58041 12 11 12Z" />
    </Svg>
  );
}

function CrownGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M3.49709 8.06464L4.78355 18.9996H19.2266L20.513 8.06464L16.5032 10.7379L12.0051 4.44051L7.50694 10.7379L3.49709 8.06464ZM2.80577 5.20006L7.00505 7.99958L11.1913 2.13881C11.5123 1.6894 12.1369 1.58531 12.5863 1.90631C12.6761 1.97045 12.7546 2.04901 12.8188 2.13881L17.0051 7.99958L21.2043 5.20006C21.6639 4.89371 22.2847 5.01788 22.5911 5.47741C22.7228 5.67503 22.7799 5.91308 22.7522 6.14895L21.109 20.1164C21.0497 20.62 20.6229 20.9996 20.1158 20.9996H3.8943C3.38722 20.9996 2.9604 20.62 2.90115 20.1164L1.25792 6.14895C1.19339 5.60045 1.58573 5.10349 2.13423 5.03896C2.37011 5.01121 2.60816 5.06832 2.80577 5.20006ZM12.0051 14.9996C10.9005 14.9996 10.0051 14.1042 10.0051 12.9996C10.0051 11.895 10.9005 10.9996 12.0051 10.9996C13.1096 10.9996 14.0051 11.895 14.0051 12.9996C14.0051 14.1042 13.1096 14.9996 12.0051 14.9996Z" />
    </Svg>
  );
}

function MenuGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M4 7h16M4 12h16M4 17h16" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/**
 * Post notifications for the account being viewed. Outline while off; the whole
 * bell floods with the brand pink once on, so the state reads at a glance
 * without a label next to it.
 */
function BellGlyph({ on }: { on: boolean }) {
  const tint = on ? ds.accent : ds.text;
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path
        d="M18 8A6 6 0 0 0 6 8c0 6-3 7-3 7h18s-3-1-3-7"
        stroke={tint}
        fill={on ? ds.accent : "none"}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M13.73 20a2 2 0 0 1-3.46 0"
        stroke={tint}
        fill={on ? ds.accent : "none"}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The vertical ⋮ on someone else's profile. Deliberately not MenuGlyph: the
 *  hamburger stays the entry to your OWN settings, so the two never collide. */
function DotsVerticalGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={5} r={1.7} fill={ds.text} />
      <Circle cx={12} cy={12} r={1.7} fill={ds.text} />
      <Circle cx={12} cy={19} r={1.7} fill={ds.text} />
    </Svg>
  );
}

function ChevronDownGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="m6 9 6 6 6-6" stroke={ds.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Overlay-only: the way back to the feed without dragging. */
function ChevronLeftGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** lucide's own qr-code icon, geometry unchanged - opens Scan (top-left of
 *  your own profile): scan someone else's profile code, or show your own. */
function ScanGlyph() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect width={5} height={5} x={3} y={3} rx={1} stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Rect width={5} height={5} x={16} y={3} rx={1} stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Rect width={5} height={5} x={3} y={16} rx={1} stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 16h-3a2 2 0 0 0-2 2v3" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 21v.01" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7v3a2 2 0 0 1-2 2H7" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3 12h.01" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 3h.01" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16v.01" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 12h1" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M21 12v.01" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 21v-1" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PinGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" stroke={ds.textMuted} strokeWidth={1.9} strokeLinejoin="round" />
      <Circle cx={12} cy={10} r={2.6} stroke={ds.textMuted} strokeWidth={1.9} />
    </Svg>
  );
}

function CalendarGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={16} rx={2} stroke={ds.textMuted} strokeWidth={1.9} />
      <Path d="M3.5 10h17M8 3v3.5M16 3v3.5" stroke={ds.textMuted} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

/** User-supplied solid person glyph, shown above "Your profile lives
 *  here" on the guest wall below - same treatment (circle badge,
 *  ds.surfaceSunken) as InboxScreen's own guest wall icon. */
function GuestProfileGlyph() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill={ds.textMuted}>
      <Path d="M11.9999 17C15.6623 17 18.8649 18.5751 20.607 20.9247L18.765 21.796C17.3473 20.1157 14.8473 19 11.9999 19C9.15248 19 6.65252 20.1157 5.23479 21.796L3.39355 20.9238C5.13576 18.5747 8.33796 17 11.9999 17ZM11.9999 2C14.7613 2 16.9999 4.23858 16.9999 7V10C16.9999 12.6888 14.8776 14.8818 12.2168 14.9954L11.9999 15C9.23847 15 6.9999 12.7614 6.9999 10V7C6.9999 4.31125 9.1222 2.11818 11.783 2.00462L11.9999 2ZM11.9999 4C10.4022 4 9.09623 5.24892 9.00499 6.82373L8.9999 7V10C8.9999 11.6569 10.343 13 11.9999 13C13.5976 13 14.9036 11.7511 14.9948 10.1763L14.9999 10V7C14.9999 5.34315 13.6567 4 11.9999 4Z" />
    </Svg>
  );
}

// 22, not the old 15, and stroke 2.6, not 1.9: the tab row lost its text
// labels (icon-only now), so each icon carries the whole tab on its own
// and needs to read clearly at a glance rather than sit beside a label.
function TabIcon({ name, color }: { name: TabKey; color: string }) {
  const p = { stroke: color, strokeWidth: 2.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, fill: "none" };
  if (name === "Reels") return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="m6 3 14 9-14 9V3z" {...p} /></Svg>;
  if (name === "Liked")
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7z" {...p} />
      </Svg>
    );
  if (name === "Playlists")
    return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"><Path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2" {...p} /></Svg>;
  // Bookmark - the same mark the feed rail and the playback sheet use for save,
  // so the tab reads as "the things I tapped that icon on".
  if (name === "Saved")
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
        <Path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" {...p} />
      </Svg>
    );
  // User-supplied solid lock-box glyph, last of the row - unpublished
  // posts read as drafts kept private until finished, not a tag or a
  // bookmark. Solid fill, unlike the stroke outlines above.
  if (name === "Drafts")
    return (
      <Svg width={22} height={22} viewBox="0 0 24 24" fill={color}>
        <Path d="M6 10V20H19V10H6ZM18 8H20C20.5523 8 21 8.44772 21 9V21C21 21.5523 20.5523 22 20 22H4C3.44772 22 3 21.5523 3 21V9C3 8.44772 3.44772 8 4 8H6V7C6 3.68629 8.68629 1 12 1C15.3137 1 18 3.68629 18 7V8ZM16 8V7C16 4.79086 14.2091 3 12 3C9.79086 3 8 4.79086 8 7V8H16ZM7 11H9V13H7V11ZM7 14H9V16H7V14ZM7 17H9V19H7V17Z" />
      </Svg>
    );
  // Tagged - a price-tag shape, the only key left once the branches above
  // are exhausted.
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Path d="M20.6 13.6 12 22.2l-9-9V4.5A1.5 1.5 0 0 1 4.5 3h8.7l8.6 8.6a1.4 1.4 0 0 1 0 2Z" {...p} />
      <Path d="M7.5 7.5h.01" {...p} />
    </Svg>
  );
}

function PlayMini() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4.5 19 12 7 19.5Z" stroke={ds.onDark} strokeWidth={2} strokeLinejoin="round" />
    </Svg>
  );
}

function HeartMini() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24">
      <Path d="M12 20.4C10.9 19.5 3.6 14.6 3.6 9.5A4.4 4.4 0 0 1 12 7.3a4.4 4.4 0 0 1 8.4 2.2c0 5.1-7.3 10-8.4 10.9Z" fill={ds.onDark} />
    </Svg>
  );
}

/* ── screen ─────────────────────────────────────────────────────────────── */

export type ProfileScreenProps = {
  /** Whose profile to show. Omitted means the signed-in user's own, which is
   *  how the Profile tab mounts it. */
  username?: string;
  /**
   * "tab"     - the Profile tab: below the bottom bar, full clearance, no back.
   * "overlay" - the creator layer swiped in from the feed.
   * "pushed"  - a route pushed from a list (followers, following, suggested).
   *
   * The latter two both cover the bottom bar - one by drawing over it, one by
   * being a root-stack screen above the tab navigator - so both carry a back
   * control and both drop the padding that existed only to clear a bar now
   * hidden behind them. They differ only in what "back" means.
   */
  presentation?: "tab" | "overlay" | "pushed";
};

export function ProfileTabScreen({ username: forUser, presentation = "tab" }: ProfileScreenProps = {}) {
  useEffect(() => { breadcrumb("nav", "Profile opened"); }, []);
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const authUser = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<TabKey>("Reels");

  const qc = useQueryClient();
  // Your own handle arriving by any route - swiping to your own reel, say - is
  // still your own profile. The server 422s a self-follow, so the button must
  // never be offered in the first place.
  const isSelf = !forUser || forUser === authUser?.username;
  const overlay = presentation === "overlay";
  /** Either non-tab presentation hides the bottom bar behind it. */
  const covering = overlay || presentation === "pushed";
  const isGuest = !authUser;

  /* ── Another account's header: post notifications + the ⋮ menu ───────────
   * The bell's real state/toggle (notifyOn/toggleNotify, backed by
   * followers.notify_posts) is declared further down, alongside follow -
   * both need `p`/`username`/`showToast`, which aren't in scope yet here. */

  const [actionsOpen, setActionsOpen] = useState(false);

  /**
   * Sticky Follow button: once scrolling has carried the real Follow button
   * (in the actions row below, someone else's profile only) up to where the
   * fixed top bar covers it, a compact copy takes its place in the bar -
   * first of the group (Follow, Share, Notification, three-dot) - so it
   * stays reachable instead of disappearing off-screen along with the
   * identity/stats section above it.
   *
   * `actionsY` is that row's own top, measured once via onLayout (a direct
   * child of the ScrollView's content, so its layout y IS the scroll offset
   * at which the bar would start covering it). `stickyFollowRef` mirrors
   * `stickyFollow` so onScroll can compare against the latest value without
   * setState firing (and re-rendering the whole screen) on every scroll
   * frame - only the one frame that actually crosses the threshold flips it.
   */
  const [actionsY, setActionsY] = useState(0);
  const [stickyFollow, setStickyFollow] = useState(false);
  const stickyFollowRef = useRef(false);

  /**
   * Sticky Reels/Liked/Playlists/Tagged tab row: same idea as stickyFollow
   * above, one step further down. Once scrolling carries the tab row's own
   * top up past where the fixed top bar ends, a second copy of it takes
   * over there (position:absolute, top: topBarH) so it stays pinned in
   * place - a "freeze it there" collapsing-header effect - instead of
   * scrolling out of view along with the identity/stats/actions section
   * above it. `topBarH` is the bar's own measured height (varies with
   * insets.top), so the sticky copy sits exactly flush under it on every
   * device rather than a guessed constant.
   */
  const [topBarH, setTopBarH] = useState(0);
  const [tabsY, setTabsY] = useState(0);
  const [stickyTabs, setStickyTabs] = useState(false);
  const stickyTabsRef = useRef(false);

  /**
   * Current scroll offset, kept live on every scroll frame regardless of
   * whether either threshold is known yet - see the re-check effects below,
   * which need this to recompute stickiness the moment a measurement
   * lands, not just on the next scroll gesture.
   */
  const scrollYRef = useRef(0);

  const handleProfileScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollYRef.current = y;
      if (actionsY) {
        const shouldFollow = y >= actionsY;
        if (shouldFollow !== stickyFollowRef.current) {
          stickyFollowRef.current = shouldFollow;
          setStickyFollow(shouldFollow);
        }
      }
      if (tabsY) {
        const shouldTabs = y >= tabsY;
        if (shouldTabs !== stickyTabsRef.current) {
          stickyTabsRef.current = shouldTabs;
          setStickyTabs(shouldTabs);
        }
      }
    },
    [actionsY, tabsY],
  );

  /**
   * Re-check both thresholds the moment either measurement itself changes,
   * not just on the next scroll event.
   *
   * Own-profile pages carry more variable content above the tab row
   * (Suggested accounts panel, Studio/Shop buttons, the extra Saved/Drafts
   * tabs) than someone else's, so actionsY/tabsY are more likely to be
   * measured - or re-measured, if that content's own layout settles a
   * frame late - AFTER the user has already scrolled past where they'd
   * land. Without this, onScroll's own compare-and-flip above only runs on
   * an actual scroll gesture, so a measurement landing late while already
   * scrolled past it left the sticky row stuck off until the next scroll -
   * on some profiles never, reading as "the icons don't freeze here."
   * This closes that gap on every profile, not just ones where the
   * layout happens to settle before scrolling starts.
   */
  useEffect(() => {
    if (!actionsY) return;
    const should = scrollYRef.current >= actionsY;
    if (should === stickyFollowRef.current) return;
    stickyFollowRef.current = should;
    setStickyFollow(should);
  }, [actionsY]);
  useEffect(() => {
    if (!tabsY) return;
    const should = scrollYRef.current >= tabsY;
    if (should === stickyTabsRef.current) return;
    stickyTabsRef.current = should;
    setStickyTabs(should);
  }, [tabsY]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  /* Swiping the profile away mid-toast must not leave a timer running. */
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const profile = useQuery({
    queryKey: isSelf ? ["profile-me"] : ["profile-user", forUser],
    queryFn: () => (isSelf ? profileApi.me() : profileApi.user(forUser as string)),
    // Someone else's profile is readable signed-out; your own has nothing to
    // fetch until you are.
    enabled: isSelf ? !isGuest : !!forUser,
    staleTime: 60_000,
  });

  const username = forUser ?? profile.data?.username ?? authUser?.username ?? "";

  /** Same Share.share() + profileUrl() the ⋮ menu's own "Share profile"
   *  row already uses (ProfileActionsSheet.tsx) - the top bar's icon had
   *  no handler at all until now. */
  const shareProfile = useCallback(() => {
    Share.share({ message: `@${username} on Teezer\n${profileUrl(username)}` }).catch(() => {});
  }, [username]);

  /** Saved and Drafts are yours to see; neither is offered on anyone
   *  else's profile. */
  const canSave = isSelf && !isGuest;
  const visibleTabs = useMemo(
    () => TABS.filter((t) => (t.key !== "Saved" && t.key !== "Drafts") || canSave),
    [canSave],
  );

  // Signing out on your own profile takes the Saved tab away underneath you;
  // without this the grid would sit on a tab that is no longer on the strip.
  useEffect(() => {
    if (!visibleTabs.some((t) => t.key === tab)) setTab("Reels");
  }, [visibleTabs, tab]);

  /** Rendered in two places once stickyTabs exists (the normal inline strip,
   *  and the pinned-under-the-top-bar copy) - computed once and reused so
   *  the two can never drift apart. */
  const tabItems = useMemo(
    () =>
      visibleTabs.map((t) => {
        const on = t.key === tab;
        const col = on ? ds.accent : ds.textMuted;
        return (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            accessibilityRole="button"
            accessibilityLabel={t.label}
            style={styles.tabBtn}
          >
            <View style={styles.tabInner}>
              <TabIcon name={t.key} color={col} />
            </View>
            {on && <View style={styles.tabUnderline} />}
          </Pressable>
        );
      }),
    [visibleTabs, tab],
  );

  // Only Reels, Liked, Saved and Drafts have endpoints. Playlists and
  // Tagged say so rather than quietly showing the wrong list.
  const gridTab = tab === "Reels" || tab === "Liked" || tab === "Saved" || tab === "Drafts";

  const videos = useQuery({
    // Shared with the post viewer so a tapped tile opens from this cache entry
    // instead of refetching - see profileGridQuery.
    ...profileGridQuery(username, gridTab ? tab : "Reels"),
    enabled: (!isSelf || !isGuest) && !!username && gridTab,
    staleTime: 30_000,
  });

  /** The liked endpoint 403s with `private: true` when the owner has hidden it. */
  const likedPrivate =
    (videos.error as { response?: { data?: { private?: boolean } }; status?: number } | null)
      ?.response?.data?.private === true ||
    (videos.error as { response?: { status?: number } } | null)?.response?.status === 403;

  const p = profile.data;
  const stats = p?.profile ?? null;
  // GET /profile nests counts as total_*; GET /users/{name} returns them flat.
  const counts = [
    { label: "Following", value: stats?.total_following ?? p?.following_count ?? 0 },
    { label: "Followers", value: stats?.total_followers ?? p?.followers_count ?? 0 },
    { label: "Likes", value: stats?.total_likes ?? p?.likes_count ?? 0 },
    { label: "Videos", value: stats?.total_videos ?? p?.videos_count ?? 0 },
  ];

  /* ── follow ───────────────────────────────────────────────────────────────
   * Three states, not two. Following a PRIVATE account creates a request, and
   * a request is neither followed nor not-followed - labelling it "Following"
   * would promise the viewer access they have not been granted yet.
   *
   *   none      -> "Follow"     accent, the invitation
   *   pending   -> "Requested"  quiet, sent and awaiting their approval
   *   accepted  -> "Following"  quiet, the relationship exists
   *
   * `follow_status` is authoritative. `is_following` is the older flat flag and
   * is only consulted when the backend did not send the richer one, where it
   * can only tell those last two apart.
   *
   * There is deliberately no "Follow back" state: the public profile payload
   * carries no "they follow you" flag, and inferring one would mean showing a
   * relationship the server never claimed.
   */
  const serverFollow: FollowState = p?.follow_status ?? (p?.is_following ? "accepted" : "none");
  /** Local override so a tap answers instantly; null means "trust the server". */
  const [followOverride, setFollowOverride] = useState<FollowState | null>(null);
  /** Blocks a second tap mid-flight, as the website's `mut.isPending` guard does. */
  const [followBusy, setFollowBusy] = useState(false);
  const followState = followOverride ?? serverFollow;

  /* ── post notifications (the profile page's bell icon) ──────────────────
   * PUT /users/{username}/follow/notify - a per-follow flag (Follower.
   * notify_posts), independent of the app's global push_creator preference.
   * Same optimistic-override-with-rollback shape as follow above; `p` is
   * the same profile payload follow reads, so no extra query. */
  const serverNotify = p?.notify_posts ?? false;
  const [notifyOverride, setNotifyOverride] = useState<boolean | null>(null);
  const [notifyBusy, setNotifyBusy] = useState(false);
  const notifyOn = notifyOverride ?? serverNotify;

  // A different profile is a different answer - never inherit the last one's.
  // Also resets the sticky-Follow/sticky-tabs tracking (see their own
  // comments above) for the same reason: this screen's instance can be
  // reused for a different profile via a param change (the swiped-in
  // creator layer does exactly this between creators), not a remount, so
  // nothing else clears it.
  useEffect(() => {
    setFollowOverride(null);
    setNotifyOverride(null);
    setActionsY(0);
    setStickyFollow(false);
    stickyFollowRef.current = false;
    setTabsY(0);
    setStickyTabs(false);
    stickyTabsRef.current = false;
    scrollYRef.current = 0;
  }, [username]);

  const toggleFollow = useCallback(() => {
    if (!authUser) {
      // Guests get the app's existing gate, with the tap replayed after login -
      // the same contract the feed's like and save use, and the same thing the
      // website does with its auth modal.
      useAuthGate.getState().open(() => toggleFollow());
      return;
    }
    if (!username || followBusy) return;

    const now = followState;
    setFollowBusy(true);
    // Un-following and withdrawing a request are the SAME call - there is no
    // separate cancel route; DELETE removes the edge either way.
    setFollowOverride(now === "none" ? (p?.is_private ? "pending" : "accepted") : "none");

    (now === "none" ? videoApi.follow(username) : videoApi.unfollow(username))
      .then((res) => {
        // The response IS the answer: the endpoint returns
        // { follow_status, following, followers_count }. Settle straight from
        // it rather than refetching - only the server knows whether a follow
        // landed accepted or pending, and it has just said so.
        const d = (res?.data ?? {}) as FollowResponse;
        const settled: FollowState =
          d.follow_status === "pending" ? "pending" : d.following ? "accepted" : "none";
        setFollowOverride(settled);

        // Counters move only for accepted follows - a pending request changes
        // nothing - so take the number the server sends instead of doing our
        // own arithmetic on it.
        const nextCount = d.followers_count;
        if (typeof nextCount === "number") {
          qc.setQueryData<ProfileDetails>(["profile-user", forUser], (old) =>
            old
              ? {
                  ...old,
                  followers_count: nextCount,
                  is_following: settled === "accepted",
                  follow_status: settled,
                }
              : old,
          );
        }
      })
      .catch((err) => {
        setFollowOverride(now);
        // The backend's refusals are specific and worth reading out: you cannot
        // follow yourself (422), an admin has restricted following (403), one
        // of you has blocked the other (404, deliberately indistinguishable
        // from "no such user"), or you are going too fast (429 - 30/min,
        // 300/day). The website toasts these; the app has no toast.
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
        if (msg) Alert.alert("", String(msg));
      })
      .finally(() => setFollowBusy(false));
  }, [authUser, username, followBusy, followState, p?.is_private, forUser, qc]);

  /** The bell only shows once already following (see the top-bar render
   *  below), so a signed-out tap can't actually reach here in practice -
   *  the auth-gate replay is kept anyway, matching toggleFollow's guard. */
  const toggleNotify = useCallback(() => {
    if (!authUser) {
      useAuthGate.getState().open(() => toggleNotify());
      return;
    }
    if (!username || notifyBusy) return;

    const next = !notifyOn;
    setNotifyBusy(true);
    setNotifyOverride(next);
    showToast(next ? "Notifications on" : "Notifications off");

    videoApi
      .toggleFollowNotify(username)
      .then((res) => {
        // The response is the settled value - trust it over our own guess.
        setNotifyOverride(res.notify_posts);
        qc.setQueryData<ProfileDetails>(["profile-user", forUser], (old) =>
          old ? { ...old, notify_posts: res.notify_posts } : old,
        );
      })
      .catch((err) => {
        setNotifyOverride(!next);
        // 422 when there is no accepted follow to attach the flag to (the
        // bell shouldn't be visible then, but the server is the last word).
        const msg = (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message;
        if (msg) Alert.alert("", String(msg));
      })
      .finally(() => setNotifyBusy(false));
  }, [authUser, username, notifyBusy, notifyOn, forUser, qc, showToast]);

  /* ── Profile views ───────────────────────────────────────────────────────
   * Your own profile only. The endpoint answers `enabled: false` when your own
   * view privacy is "private" - the reciprocal rule - and that case has nothing
   * to show, so the button falls back to a plain eye.
   *
   * The key is deliberately NOT the views screen's. That screen pages through
   * the same endpoint with useInfiniteQuery, whose cache entry is {pages,
   * pageParams}; sharing one key between an infinite query and a plain one puts
   * two incompatible shapes in the same slot and whichever mounted second reads
   * the other's data. This is one page, for three faces and a count. */
  const viewsQuery = useQuery({
    queryKey: ["profile-views", "summary"],
    queryFn: () => profileApi.profileViews(),
    enabled: isSelf && !isGuest,
    staleTime: 30_000,
  });
  const viewsEnabled = viewsQuery.data?.enabled ?? true;
  const viewsTotal = viewsEnabled ? (viewsQuery.data?.count ?? 0) : 0;
  const viewerFaces = viewsEnabled ? (viewsQuery.data?.viewers ?? []).slice(0, 3) : [];
  const moreViewers = Math.max(0, viewsTotal - viewerFaces.length);

  const viewsSeenAt = useProfileViewsSeen((s) => s.lastSeenAt);
  useEffect(() => { void useProfileViewsSeen.getState().hydrate(); }, []);
  const hasNewViews = useMemo(
    () => (viewsQuery.data?.viewers ?? []).some((v) => isNewView(v.viewed_at, viewsSeenAt)),
    [viewsQuery.data, viewsSeenAt],
  );

  /** Suggested-accounts panel, toggled by the action row's chevron. */
  const [suggestOpen, setSuggestOpen] = useState(false);

  /**
   * Open a suggested account.
   *
   * Deliberately does NOT close the panel. Both routes here leave this screen
   * mounted - pushed on the stack, or covered by the layer's own stack - so
   * coming back lands on the very same instance, and collapsing the panel on
   * the way out would be throwing away state the user never asked to lose.
   *
   * Swiped in, this screen IS the creator layer, so a pushed route would mount
   * underneath it; pushing onto the layer's stack keeps this profile alive
   * beneath the new one instead.
   */
  const openSuggested = useCallback(
    (handle: string) => {
      if (overlay) {
        useCreatorLayer.getState().push(handle);
        return;
      }
      navigation.push("UserProfile", { username: handle });
    },
    [overlay, navigation],
  );

  const openFollowList = useCallback(
    (type: "followers" | "following" | "suggested") => {
      if (!username) return;
      // Same rule as openPost: the list is a LAYER above this one, not a route,
      // so this profile is simply covered - it does not move, re-render or
      // unmount. `suspend` only makes it inert underneath so its swipe cannot
      // compete with the list's.
      //
      // This used to dismiss the layer and push a route, which is precisely why
      // Back from the list landed on the feed: by then the profile had already
      // been torn down.
      if (overlay) {
        useCreatorLayer.getState().suspend();
        useFollowList.getState().show({ username, type });
        return;
      }
      navigation.navigate("FollowList", { username, type });
    },
    [username, overlay, navigation],
  );

  /** Open a grid tile in the full-screen viewer.
   *
   *  Same overlay rule as openFollowList/openChat: swiped in from the feed
   *  this screen sits ABOVE the navigator, so the pushed viewer mounted and
   *  played underneath it and the tap looked like it did nothing. Dropping the
   *  layer first is what makes a tile behave identically on your own profile,
   *  a pushed profile and a swiped-in one.
   *
   *  Index rather than the row: the viewer re-reads the same cached
   *  `profile-videos` entry this grid was rendered from, so it opens on the
   *  tapped post with no refetch. */
  const openPost = useCallback(
    (i: number) => {
      if (!username) return;
      // Only the grid tabs render tiles, and only they have an endpoint the
      // viewer can re-read. Inline in the JSX this was narrowed by the
      // `gridTab` branch; out here it has to be explicit.
      if (tab !== "Reels" && tab !== "Liked" && tab !== "Saved") return;
      // The viewer is a LAYER above this one, not a route, so this profile is
      // simply covered - it does not move, re-render or unmount, whichever
      // presentation it is in. `suspend` only makes it inert underneath so its
      // swipe cannot compete with the viewer's.
      if (overlay) useCreatorLayer.getState().suspend();
      usePostViewer.getState().show({ username, index: i, tab });
    },
    [username, overlay, navigation, tab],
  );

  /** Message. Unblocked now that the Chat thread screen exists - this button
   *  could not be built before, because there was nowhere for it to go. */
  const openChat = useCallback(() => {
    if (!p?.id || !username) return;
    if (!authUser) {
      useAuthGate.getState().open(() => openChat());
      return;
    }
    const chat = {
      userId: p.id,
      username,
      name: p.name,
      avatar: p.avatar,
      isVerified: p.is_verified,
    };

    if (!overlay) {
      navigation.navigate("Chat", chat);
      return;
    }

    /**
     * Swiped in, this profile is a LAYER, not a route - and that is the whole
     * problem with opening a chat from it.
     *
     * Whatever the layer draws, a native swipe-back from Chat reveals the
     * screen actually beneath it in the stack, which is the feed. Drawing the
     * profile on top cannot change that: the gesture is dragging the real stack,
     * so the feed is what appears under the user's finger.
     *
     * So the profile is put INTO the stack - the same shape the search path
     * already has, Main → UserProfile → Chat, which is why a chat opened from
     * there animates and goes back correctly with no help from here. Both routes
     * go in on ONE dispatch so there is a single transition (the chat arriving
     * over the profile) rather than two stacked ones.
     *
     * The layer stays drawn over all of it until the chat has arrived, so the
     * feed is never on screen, and is then dropped - by then the route below is
     * the profile, and keeping the layer would just be a second stale copy.
     *
     * Both go in on ONE dispatch. `navigate` and `push` bubble up to whoever
     * can handle them, so two pushes did land correctly, but they arrive as two
     * actions and animate as two transitions back to back: the "opens a little
     * slow". Rewriting state gets both in at once.
     *
     * Rewriting does NOT bubble though, so it has to be aimed at the navigator
     * that declares these routes - `useNavigation` here gives back whichever
     * navigator encloses this screen, which is the bottom tabs, and aimed there
     * it produced "The action 'RESET' ... routeNames: [Home, Spaces, Inbox,
     * Profile]".
     */
    /* Walk up to the navigator that declares these routes, rather than assuming
       the topmost one does. Which navigator `useNavigation` hands back here
       depends on how this screen was reached - tab, pushed route, or drawn by
       the layer outside the navigator tree entirely - so the owner is asked for
       by name instead of guessed at by position. */
    const owns = (nav: any) => {
      const s = nav?.getState?.();
      return !!s?.routeNames?.includes("Chat") && !!s?.routeNames?.includes("UserProfile");
    };
    let target: any = navigation;
    while (target && !owns(target)) target = target.getParent?.();

    useCreatorLayer.getState().coverForRoute();

    if (!target) {
      /* Decided out here, never inside a dispatch callback. Returning null from
         one is not "do nothing" - react-navigation reads `.target` off whatever
         comes back and throws "Cannot read property 'target' of null". Two
         pushes are two transitions, but they bubble, so they always land. */
      navigation.dispatch(StackActions.push("UserProfile", { username }));
      navigation.dispatch(StackActions.push("Chat", chat));
      return;
    }

    const state = target.getState();
    target.dispatch(
      CommonActions.reset({
        ...state,
        routes: [
          ...state.routes,
          { name: "UserProfile", params: { username } },
          { name: "Chat", params: chat },
        ],
        index: state.routes.length + 1,
      }),
    );
  }, [p, username, authUser, overlay, navigation]);

  /**
   * Open this creator's shop from the profile.
   *
   * A plain navigate() looked like it did nothing. Routes mount UNDER the
   * creator layer (see CreatorProfileLayer), so the Shop screen was pushed and
   * then covered by the profile still painted on top of it - and going back
   * dismissed that layer and revealed a Shop screen that had been sitting there
   * the whole time.
   *
   * Same treatment openChat above already uses, for the same reason: hand the
   * layer over with coverForRoute() so it goes transparent, and put a real
   * UserProfile route underneath so Back returns to the profile instead of
   * falling through to the feed. Written out here rather than by refactoring
   * openChat into something shared - that path works, and reshaping it to serve
   * two callers risks a regression in a flow nobody reported a problem with.
   */
  const openShop = useCallback(() => {
    if (!p?.username) return;
    const shopParams = { username: p.username };

    const owns = (nav: any) => {
      const s = nav?.getState?.();
      return !!s?.routeNames?.includes("Shop") && !!s?.routeNames?.includes("UserProfile");
    };
    let target: any = navigation;
    while (target && !owns(target)) target = target.getParent?.();

    useCreatorLayer.getState().coverForRoute();

    if (!target) {
      navigation.dispatch(StackActions.push("UserProfile", { username: p.username }));
      navigation.dispatch(StackActions.push("Shop", shopParams));
      return;
    }

    // Both routes in ONE reset: two pushes bubble and land, but animate as two
    // transitions back to back, which reads as a slow open.
    const state = target.getState();
    target.dispatch(
      CommonActions.reset({
        ...state,
        routes: [
          ...state.routes,
          { name: "UserProfile", params: { username: p.username } },
          { name: "Shop", params: shopParams },
        ],
        index: state.routes.length + 1,
      }),
    );
  }, [p, navigation]);

  const followLabel =
    followState === "accepted" ? "Following" : followState === "pending" ? "Requested" : "Follow";

  /**
   * Whether to draw the ring.
   *
   * Three sources, because no single one covers every profile. The public
   * endpoint returns has_story; the own-profile endpoint returns it only on
   * servers running the change that added it, and until that is deployed your
   * own profile reports nothing at all - which is exactly why the ring appeared
   * above the inbox (a different endpoint) but not here.
   *
   * /stories/active-user-ids exists for precisely this and is already live, so
   * it answers for anyone the other two cannot. Cheap: one small id list, shared
   * by every profile opened this session.
   */
  const activeStoryIds = useQuery({
    queryKey: ["story-ring-ids"],
    queryFn: () => storyApi.activeUserIds(),
    staleTime: 60_000,
  });
  /**
   * Your own stories, asked for directly.
   *
   * active-user-ids only lists everyone/followers stories - correct for other
   * people, since a ring must not advertise a story the viewer cannot open, but
   * wrong for you: a close-friends or only-me story is still yours to watch and
   * still deserves a ring. This asks the one endpoint that returns your stories
   * whatever their visibility.
   */
  const myStories = useQuery({
    queryKey: ["my-stories"],
    queryFn: () => storyApi.myStories(),
    enabled: isSelf && !isGuest,
    staleTime: 60_000,
  });
  const myLive = (myStories.data ?? []).some(
    (s) => s.status === "published" && (!s.expires_at || new Date(s.expires_at) > new Date()),
  );

  const hasStory = !!(
    p?.has_story
    || p?.has_active_story
    || myLive
    || (p?.id && activeStoryIds.data?.includes(p.id))
  );

  /**
   * Gradient-vs-seen ring color, same distinction the Inbox story rail
   * already draws. Single-user lookup (not a list, no N+1 concern), only
   * fetched once we know there's a story to check. Your OWN story is always
   * drawn as unseen/gradient - "have you seen your own story" isn't a
   * meaningful question, and IG/TikTok both keep the owner's ring live too.
   */
  const otherUserStory = useQuery({
    queryKey: ["story-user", username],
    queryFn: () => storyApi.userStories(username as string),
    enabled: hasStory && !isSelf && !!username,
    staleTime: 30_000,
  });
  const storySeen = hasStory && !isSelf && otherUserStory.data ? !otherUserStory.data.has_unseen : false;

  const tags = (p?.categories ?? []).filter(Boolean);
  // Country only, on every profile - your own included. `location` is free text
  // and routinely holds a street or neighbourhood ("Thamel, Kathmandu"), which
  // is not something a public profile should broadcast. It is deliberately not
  // read here, and there is no fall back to it: no country means no row rather
  // than the address leaking through the gap.
  const place = countryName(p?.country);
  const joined = p?.created_at
    ? `Joined ${new Date(p.created_at).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`
    : null;

  const rows = (videos.data?.data ?? []) as {
    id: number;
    thumbnail_url?: string | null;
    views_count?: number;
    likes_count?: number;
  }[];
  const cell = (width - 4) / 3;

  // Only your OWN profile needs a login wall - a creator's is public, and the
  // layer that swipes it in must work signed-out too.
  if (isSelf && isGuest) {
    // The app already has a login/signup design - the AuthGateModal mounted at
    // the root, which routes into the existing Login/Signup screens. Guests get
    // that, not a bespoke page.
    return (
      <View style={[styles.root, styles.guest, { paddingTop: insets.top }]}>
        <View style={styles.guestIcon}>
          <GuestProfileGlyph />
        </View>
        <Text style={styles.emptyTitle}>Your profile lives here</Text>
        <Text style={styles.emptyBody}>Log in or sign up to see your posts, likes and saved reels.</Text>
        <Pressable
          accessibilityRole="button"
          style={[styles.primaryBtn, styles.guestBtn]}
          onPress={() => useAuthGate.getState().open()}
        >
          <Text style={styles.primaryBtnText}>Log in or sign up</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {/* Sticky header: lives outside the ScrollView so the icons never move,
          and reserves its own bar space above the scrolling content. */}
      <View
        style={[styles.topBar, { paddingTop: insets.top + 10 }]}
        onLayout={(e) => setTopBarH(e.nativeEvent.layout.height)}
      >
        {covering ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={overlay ? "Back to feed" : "Back"}
            hitSlop={10}
            style={{ width: 38 }}
            // The swiped-in layer is not a route, so it cannot be popped - it
            // has to settle closed. A pushed profile is an ordinary screen.
            onPress={() =>
              // `back`, not `dismiss`: with a profile stacked on another this
              // uncovers the one beneath, and only leaves at the root.
              overlay ? useCreatorLayer.getState().back() : navigation.goBack()
            }
          >
            <ChevronLeftGlyph />
          </Pressable>
        ) : isSelf ? (
          // Not reachable when covering (that slot is already the back
          // button above) - Scan only makes sense on your own, root profile
          // tab, same footing as Views/Premium/Settings on the other side.
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Scan"
            hitSlop={10}
            style={{ width: 38 }}
            onPress={() => navigation.navigate("Scan")}
          >
            <ScanGlyph />
          </Pressable>
        ) : (
          <View style={{ width: 38 }} />
        )}
        <View style={styles.topActions}>
          {/* Views, premium and settings are yours alone - they have no meaning
              pointed at someone else's profile. */}
          {/* The design's viewer button: the eye, then the faces of who has
              actually looked, then how many more there are. A bare eye said
              nothing about whether anyone had been. */}
          {isSelf && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                viewsTotal > 0 ? `Profile views, ${viewsTotal} viewers` : "Profile views"
              }
              hitSlop={8}
              onPress={() => navigation.navigate("ProfileViews")}
              style={styles.viewsBtn}
            >
              <View>
                <EyeGlyph />
                {hasNewViews && <View style={styles.viewsNewDot} />}
              </View>
              {viewerFaces.length > 0 && (
                <View style={styles.viewsFaces}>
                  {viewerFaces.map((v, i) => (
                    <View key={v.id} style={[styles.viewsFace, i > 0 && { marginLeft: -7 }]}>
                      {v.avatar ? (
                        <Image source={{ uri: v.avatar }} style={styles.viewsFaceImg} contentFit="cover" />
                      ) : (
                        <View style={[styles.viewsFaceImg, styles.viewsFaceFallback]}>
                          <Text style={styles.viewsFaceInitial}>
                            {(v.name || v.username || "?").charAt(0).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                  ))}
                  {moreViewers > 0 && (
                    <View style={styles.viewsMore}>
                      <Text style={styles.viewsMoreText}>+{moreViewers}</Text>
                    </View>
                  )}
                </View>
              )}
            </Pressable>
          )}
          {/* Compact Follow, first of the group (Follow, Share, Notification,
              three-dot) - see stickyFollow's own comment above. Someone
              else's profile only; own profile shows Edit in the content
              row instead, nothing to mirror up here. */}
          {!isSelf && stickyFollow && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={followLabel}
              style={followState === "none" ? styles.stickyFollowBtn : styles.stickyFollowBtnOutline}
              onPress={toggleFollow}
            >
              <Text
                style={
                  followState === "none" ? styles.stickyFollowBtnText : styles.stickyFollowBtnTextOutline
                }
              >
                {followLabel}
              </Text>
            </Pressable>
          )}
          {/* Removed on your own profile, per request - shown only on
              someone else's, where it sits beside the notification bell
              and the ⋮ menu (which has its own "Share profile" row there
              too, per ProfileActionsSheet.tsx). */}
          {!isSelf && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Share profile"
              hitSlop={8}
              onPress={shareProfile}
            >
              <UploadGlyph />
            </Pressable>
          )}
          {/* Premium (design's crown) - opens the plans page. */}
          {isSelf && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Premium"
              hitSlop={8}
              onPress={() => navigation.navigate("Premium")}
            >
              <CrownGlyph />
            </Pressable>
          )}
          {!isSelf && (
            <Pressable
              accessibilityRole="switch"
              accessibilityLabel="Post notifications"
              accessibilityState={{ checked: notifyOn }}
              accessibilityValue={{ text: notifyOn ? "on" : "off" }}
              hitSlop={8}
              onPress={toggleNotify}
            >
              <BellGlyph on={notifyOn} />
            </Pressable>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={isSelf ? "Settings" : "More"}
            hitSlop={8}
            onPress={
              isSelf ? () => navigation.navigate("SettingsShell") : () => setActionsOpen(true)
            }
          >
            {isSelf ? <MenuGlyph /> : <DotsVerticalGlyph />}
          </Pressable>
        </View>
      </View>

      {/* Pinned copy of the tab row, shown only once scrolling has carried
          the real one (below, in the ScrollView) up to here - see
          stickyTabs's own comment above. topBarH is measured, not guessed,
          so this sits flush under the bar on every device regardless of
          insets.top. */}
      {stickyTabs && (
        <View style={[styles.stickyTabsWrap, { top: topBarH }]}>
          <View style={styles.tabsContent}>
            {tabItems}
          </View>
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        // 120 clears this app's 86pt tab bar plus the home indicator. The
        // overlay covers that bar, so it only needs to clear the indicator -
        // the design's 34.
        contentContainerStyle={{ paddingBottom: covering ? 34 : 120 }}
        onScroll={handleProfileScroll}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={profile.isRefetching}
            onRefresh={() => {
              profile.refetch();
              if (gridTab) videos.refetch();
            }}
            tintColor={ds.textMuted}
          />
        }
      >
        {profile.isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={ds.accent} />
          </View>
        ) : (
          <>
            {/* identity: avatar left, everything else in a column beside it */}
            <View style={styles.identity}>
              {/* Wrapper so the + can be positioned against the avatar. It is
                  exactly the avatar's 88 with no padding, so the identity row
                  lays out as it did before. */}
              <View style={styles.avatarWrap}>
                {/* The website's gradient ring, drawn only when there is a live
                    story to open. `has_story` is what the public profile returns;
                    `has_active_story` is the same fact under the name some other
                    endpoints use, so both are honoured rather than guessing which
                    one this payload came with. It sits BEHIND the avatar - the
                    avatar's own 3px light border is what separates the two, as on
                    the web. */}
                {hasStory && (storySeen
                  ? <View style={[styles.storyRing, styles.storyRingSeen]} />
                  : (
                    <LinearGradient
                      colors={["#F42B5B", "#FF6E90", "#8B5CF6"]}
                      start={{ x: 0, y: 1 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.storyRing}
                    />
                  )
                )}
                {/* The ring is an affordance, so the avatar under it has to be
                    one too - drawing a ring around something that does nothing
                    when tapped is the whole reason stories looked broken here.
                    Only pressable while there IS a story: an avatar that
                    sometimes responds and sometimes does not is worse than one
                    that never does. */}
                <Pressable
                  disabled={!hasStory || !username}
                  onPress={() => navigation.navigate("StoryViewer", { username })}
                  accessibilityRole={hasStory ? "button" : undefined}
                  accessibilityLabel={hasStory ? `Watch ${isSelf ? "your" : `@${username}'s`} story` : undefined}
                >
                  {p?.avatar ? (
                    <Image source={{ uri: p.avatar }} style={styles.avatar} contentFit="cover" transition={140} />
                  ) : (
                    <View style={[styles.avatar, styles.avatarFallback]}>
                      <Text style={styles.avatarLetter}>
                        {(p?.name || p?.username || "R").charAt(0).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </Pressable>

                {/* Own profile only, and a real button now that it has
                    somewhere to go: the story composer. */}
                {isSelf && (
                  <Pressable
                    onPress={() => navigation.navigate("StoryComposer")}
                    style={styles.avatarPlus}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel="Add to your story"
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
                      <Path
                        d="M12 5v14M5 12h14"
                        stroke={ds.text}
                        strokeWidth={2.4}
                        strokeLinecap="round"
                      />
                    </Svg>
                  </Pressable>
                )}
              </View>

              <View style={styles.identityCol}>
                <View style={{ gap: 3 }}>
                  {/* The name row is the account switcher: the arrow opens the
                      existing SavedAccounts modal (the app's own switch design),
                      which also carries the path to ManageSavedAccounts. */}
                  {isSelf ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Switch account"
                      onPress={() => navigation.navigate("SavedAccounts")}
                      style={styles.nameRow}
                      hitSlop={6}
                    >
                      <Text style={styles.name} numberOfLines={1}>
                        {p?.name || p?.username}
                      </Text>
                      {p?.is_verified && <VerifiedBadge size={17} />}
                      <ChevronDownGlyph />
                    </Pressable>
                  ) : (
                    // Someone else's profile has no account to switch to. The
                    // arrow was only half the problem - the whole row was
                    // pressable, so tapping a creator's name opened YOUR saved
                    // accounts from their page.
                    <View style={styles.nameRow}>
                      <Text style={styles.name} numberOfLines={1}>
                        {p?.name || p?.username}
                      </Text>
                      {p?.is_verified && <VerifiedBadge size={17} />}
                    </View>
                  )}
                  <Text style={styles.handle}>@{p?.username}</Text>
                </View>

                {!!p?.bio && <Text style={styles.bio}>{p.bio}</Text>}

                {tags.length > 0 && (
                  <View style={styles.tagRow}>
                    {tags.map((t, i) => (
                      <View key={t} style={styles.tagItem}>
                        <Text style={styles.tagText}>{t}</Text>
                        {i < tags.length - 1 && <Text style={styles.tagDot}>·</Text>}
                      </View>
                    ))}
                  </View>
                )}

                {(place || joined) && (
                  <View style={styles.metaRow}>
                    {!!place && (
                      <View style={styles.metaItem}>
                        <PinGlyph />
                        <Text style={styles.metaText}>{place}</Text>
                      </View>
                    )}
                    {!!joined && (
                      <View style={styles.metaItem}>
                        <CalendarGlyph />
                        <Text style={styles.metaText}>{joined}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            </View>

            {/* four-up stats with dividers between, per the design */}
            <View style={styles.stats}>
              {counts.map((c, i) => {
                // Only the two relationship tiles lead anywhere. Likes and
                // Videos are totals, not lists, and making them look tappable
                // would promise a screen that does not exist.
                const opens =
                  c.label === "Followers" ? "followers" : c.label === "Following" ? "following" : null;
                const Tile = opens ? Pressable : View;
                return (
                  <Tile
                    key={c.label}
                    style={[styles.stat, i < counts.length - 1 && styles.statDivider]}
                    {...(opens
                      ? {
                          accessibilityRole: "button" as const,
                          accessibilityLabel: `${c.label}, ${fmt(c.value)}`,
                          onPress: () => openFollowList(opens as "followers" | "following"),
                        }
                      : {})}
                  >
                    <Text style={styles.statValue}>{fmt(c.value)}</Text>
                    <Text style={styles.statLabel}>{c.label}</Text>
                  </Tile>
                );
              })}
            </View>

            {/* own profile: Edit replaces the design's Follow/Message pair */}
            <View style={styles.actions} onLayout={(e) => setActionsY(e.nativeEvent.layout.y)}>
              {isSelf ? (
                <Pressable
                  accessibilityRole="button"
                  style={styles.primaryBtn}
                  /*
                   * Straight to Profile Information, not to the settings root.
                   * "Edit profile" landed on ProfileActions, from which the
                   * fields were two more taps away - Account Settings, then
                   * Profile Information - for a button that names exactly one
                   * destination.
                   *
                   * `initial` is left at its default of true on purpose: that
                   * makes ProfileInfo the nested stack's initial route, so back
                   * leaves SettingsShell and lands on this profile. Passing
                   * initial:false would insert ProfileActions underneath and
                   * send back there instead, which is the thing being removed.
                   */
                  onPress={() => navigation.navigate("SettingsShell", { screen: "ProfileInfo" })}
                >
                  <Text style={[styles.primaryBtnText, styles.editProfileBtnText]}>Edit profile</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={followLabel}
                  // Only the invitation gets the accent. Once the relationship
                  // exists the button is a quiet way OUT of it, and an accent
                  // there reads as "press me" for something already done.
                  style={followState === "none" ? styles.primaryBtn : styles.secondaryBtn}
                  onPress={toggleFollow}
                >
                  <Text
                    style={
                      followState === "none" ? styles.primaryBtnText : styles.secondaryBtnText
                    }
                  >
                    {followLabel}
                  </Text>
                </Pressable>
              )}

              {/* The prototype's Follow/Message pair. Message is only offered on
                  someone else's profile - there is no thread with yourself. */}
              {!isSelf && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Message"
                  style={styles.secondaryBtn}
                  onPress={openChat}
                >
                  <Text style={styles.secondaryBtnText}>Message</Text>
                </Pressable>
              )}
              {/* Teezer Studio, between Edit profile and Share. Your own
                  profile only - the Studio is your creator dashboard, so it has
                  no meaning pointed at someone else's page. The app has no
                  Studio screens, so it opens the website's, the same
                  destination the three-dot menu's Studio row uses. */}
              {isSelf && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Teezer Studio"
                  style={styles.squareBtn}
                  // Native Studio, not the website - see StudioStack.
                  onPress={() => navigation.navigate("StudioRoot")}
                >
                  <Image source={STUDIO_MARK} style={styles.studioIcon} contentFit="contain" />
                </Pressable>
              )}
              {/* Shop is not a default profile feature - this slot is only
                  occupied once the owner has an admin-APPROVED shop (server-
                  authoritative: has_approved_shop, see ShopController::
                  approvedShop() / UserResource.php). No Share fallback here
                  anymore - the slot is simply absent otherwise, on both your
                  own profile (beside Teezer Studio) and anyone else's
                  (beside Message). */}
              {!!p?.has_approved_shop && (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Shop"
                  style={styles.squareBtn}
                  onPress={openShop}
                >
                  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                    <Path d="M15 21v-5a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                    <Path
                      d="M17.774 10.31a1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.451 0 1.12 1.12 0 0 0-1.548 0 2.5 2.5 0 0 1-3.452 0 1.12 1.12 0 0 0-1.549 0 2.5 2.5 0 0 1-3.77-3.248l2.889-4.184A2 2 0 0 1 7 2h10a2 2 0 0 1 1.653.873l2.895 4.192a2.5 2.5 0 0 1-3.774 3.244"
                      stroke={ds.text}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Path d="M4 10.95V19a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8.05" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                  </Svg>
                </Pressable>
              )}
              {/* The website's suggested-accounts chevron, which is on every
                  profile there. It used to open your own settings from your
                  page and do nothing at all from anyone else's; settings are
                  still one tap away on the top bar. */}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Suggested accounts"
                accessibilityState={{ expanded: suggestOpen }}
                style={[styles.squareBtn, suggestOpen && styles.squareBtnOn]}
                onPress={() => setSuggestOpen((o) => !o)}
              >
                <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
                  <Path
                    d={suggestOpen ? "m5 15 7-7 7 7" : "m5 9 7 7 7-7"}
                    stroke={suggestOpen ? ds.accent : ds.text}
                    strokeWidth={2.1}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </Svg>
              </Pressable>
            </View>

            {suggestOpen && (
              <SuggestedAccountsPanel
                profileUserId={p?.id}
                isOwnProfile={isSelf}
                onOpenProfile={openSuggested}
                onViewAll={() => openFollowList("suggested")}
              />
            )}

            {/* tabs */}
            {/* Plain row, not a horizontal ScrollView - icon-only tabs (no
                text label) comfortably fit any phone width even at six of
                them, unlike the old wider icon+text buttons this row used
                to hold. justifyContent: space-between spreads them across
                the row's own full width instead of left-packing with a gap
                on the right.
                onLayout measures this row's own top for stickyTabs above -
                once scrolling reaches it, the pinned copy below takes over. */}
            <View
              style={[styles.tabs, styles.tabsContent]}
              onLayout={(e) => setTabsY(e.nativeEvent.layout.y)}
            >
              {tabItems}
            </View>

            {!gridTab ? (
              <View style={styles.center}>
                <Image
                  source={tab === "Playlists" ? EMPTY_PLAYLIST : EMPTY_TAGGED}
                  style={styles.emptyArt}
                  contentFit="contain"
                  transition={120}
                />
                <Text style={styles.emptyTitle}>
                  {tab === "Playlists" ? "No playlists yet" : "No tagged reels yet"}
                </Text>
                <Text style={styles.emptyBody}>
                  {tab === "Playlists"
                    ? isSelf
                      ? "Collections you create will show up here."
                      : `@${username} hasn't made any playlists yet.`
                    : isSelf
                      ? "Reels other people tag you in will show up here."
                      : `Reels @${username} is tagged in will show up here.`}
                </Text>
              </View>
            ) : videos.isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator color={ds.accent} />
              </View>
            ) : rows.length === 0 ? (
              <View style={styles.center}>
                {/* Liked is WITHHELD, not empty - the endpoint 403s when the
                    owner has set "who can see liked" to only-me, same shape the
                    followers list uses. Saying "no liked reels" there would be a
                    plain lie about someone else's account. */}
                {tab === "Reels" ? (
                  <LottieView
                    source={NO_REELS_UPLOADED}
                    autoPlay
                    loop
                    resizeMode="contain"
                    style={styles.emptyArt}
                  />
                ) : (
                  <Image
                    source={tab === "Liked" && likedPrivate ? LIKED_PRIVATE : tab === "Liked" ? NO_LIKED_VIDEOS : EMPTY_REELS}
                    style={styles.emptyArt}
                    contentFit="contain"
                    transition={120}
                  />
                )}
                <Text style={styles.emptyTitle}>
                  {tab === "Liked"
                    ? likedPrivate
                      ? "Liked reels are private"
                      : "No liked reels yet"
                    : tab === "Saved"
                      ? "No saved reels yet"
                      : tab === "Drafts"
                        ? "No drafts yet"
                        : "No videos yet"}
                </Text>
                <Text style={styles.emptyBody}>
                  {tab === "Liked"
                    ? likedPrivate
                      ? `@${username} keeps their liked reels to themselves.`
                      : "Reels they like will show up here."
                    : tab === "Saved"
                      ? // Saved is self-only, so this never needs the "someone
                        // else's profile" wording the other tabs carry.
                        "Reels you save will show up here. Only you can see them."
                      : tab === "Drafts"
                        ? // Same self-only reasoning as Saved above.
                          "Reels you save as a draft will show up here. Only you can see them."
                        : isSelf
                          ? "Reels you publish will show up here."
                          : `@${username} hasn't posted any reels yet.`}
                </Text>
              </View>
            ) : (
              <View style={styles.grid}>
                {rows.map((v, i) => (
                  // The tiles were plain Views, so tapping a post did nothing.
                  // Index rather than id: the viewer opens the same cached list
                  // at the same position.
                  <Pressable
                    key={v.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open post ${i + 1}`}
                    onPress={() => openPost(i)}
                    style={{ width: cell, height: cell * 1.55 }}
                  >
                    {v.thumbnail_url ? (
                      <Image source={{ uri: v.thumbnail_url }} style={styles.thumb} contentFit="cover" transition={120} />
                    ) : (
                      <View style={[styles.thumb, styles.thumbFallback]} />
                    )}
                    <View style={styles.thumbBottom}>
                      <View style={styles.thumbStat}>
                        <PlayMini />
                        <Text style={styles.thumbCount}>{fmt(v.views_count ?? 0)}</Text>
                      </View>
                      <View style={styles.thumbStat}>
                        <HeartMini />
                        <Text style={styles.thumbCount}>{fmt(v.likes_count ?? 0)}</Text>
                      </View>
                    </View>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </ScrollView>

      {/* Someone else's profile only - the ⋮ menu and the bell's confirmation.
          Gated on p?.id, not just !isSelf: this renders on every pass,
          including the very first one before the profile query resolves -
          p!.id's non-null assertion only silenced the type-checker, it did
          nothing at runtime, so opening any not-yet-cached profile crashed
          with "Cannot read property 'id' of undefined" the instant this
          screen rendered, before the user could do anything at all. */}
      {!isSelf && p?.id != null && (
        <ProfileActionsSheet
          visible={actionsOpen}
          onClose={() => setActionsOpen(false)}
          username={username}
        />
      )}
      {!!toast && (
        <View style={[styles.toast, { bottom: covering ? 46 : 132 }]} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  guest: { alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 32 },
  // Same circle-badge treatment as InboxScreen's own guest wall icon.
  // marginBottom: 10, not 16 - `guest` above already contributes 6px via
  // its own `gap`, so 10 + 6 = the same 16px separation before the title.
  guestIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: ds.surfaceSunken,
    alignItems: "center", justifyContent: "center", marginBottom: 10,
  },

  topBar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  topActions: { flexDirection: "row", alignItems: "center", gap: 18 },
  // Compact pill version of primaryBtn/secondaryBtn below, sized to sit in
  // this slim icon row rather than the full-width content one they're
  // normally in. Same two-state look (accent = invitation, bordered = quiet
  // way out) as the content row's own Follow button - see stickyFollow.
  stickyFollowBtn: {
    height: 30, paddingHorizontal: 14, borderRadius: 999,
    backgroundColor: ds.accent, alignItems: "center", justifyContent: "center",
  },
  stickyFollowBtnOutline: {
    height: 30, paddingHorizontal: 14, borderRadius: 999,
    borderWidth: 1, borderColor: ds.line, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center",
  },
  stickyFollowBtnText: { color: ds.onDark, fontSize: 12.5, fontWeight: "700" },
  stickyFollowBtnTextOutline: { color: ds.text, fontSize: 12.5, fontWeight: "700" },

  /** Bell confirmation. `bottom` is set at the call site: the overlay covers the
   *  tab bar and only clears the home indicator, a tab profile must clear both. */
  toast: {
    position: "absolute",
    alignSelf: "center",
    maxWidth: "86%",
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 999,
    backgroundColor: "rgba(20,20,20,0.94)",
  },
  toastText: { color: ds.onDark, fontSize: 13, fontWeight: "500", textAlign: "center" },

  identity: { flexDirection: "row", gap: 15, alignItems: "flex-start", paddingHorizontal: 16, paddingTop: 8 },
  avatarWrap: { width: 88, height: 88, alignItems: "center", justifyContent: "center" },
  /** Behind the 88px avatar and 4px proud of it on every side, so the ring reads
   *  as a rim around the photo rather than a disc the photo sits on. */
  storyRing: {
    position: "absolute",
    width: 96,
    height: 96,
    borderRadius: 999,
  },
  /** Same flat "seen" color the Inbox story rail already uses. */
  storyRingSeen: { backgroundColor: "#E3DFE7" },
  avatar: { width: 88, height: 88, borderRadius: 999, borderWidth: 3, borderColor: "#F4F2F5", backgroundColor: ds.surfaceSunken },
  /* Sits on the avatar's lower-right, overlapping the rim rather than floating
     clear of it - that overlap is what reads as "attached to this photo". The
     ring is the page background, so the badge punches a clean hole in the rim
     instead of colliding with it. */
  avatarPlus: {
    position: "absolute",
    right: -2,
    bottom: 2,
    width: 28,
    height: 28,
    borderRadius: 999,
    backgroundColor: ds.surface,
    borderWidth: 2,
    borderColor: "#F4F2F5",
    alignItems: "center",
    justifyContent: "center",
    // Android ignores shadow*, iOS ignores elevation; both are set so the badge
    // lifts off the avatar on either.
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  avatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: ds.accent },
  avatarLetter: { color: ds.onDark, fontSize: 38, fontWeight: "800", fontStyle: "italic" },
  identityCol: { flex: 1, minWidth: 0, gap: 8 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  name: { fontSize: 18.5, fontWeight: "800", color: ds.text, letterSpacing: -0.3, flexShrink: 1 },
  handle: { fontSize: 13.5, color: ds.textMuted },
  bio: { fontSize: 13.5, color: ds.text, lineHeight: 20 },
  tagRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 7 },
  tagItem: { flexDirection: "row", alignItems: "center", gap: 7 },
  tagText: { fontSize: 13, fontWeight: "700", color: ds.text },
  tagDot: { fontSize: 13, color: ds.silver },
  metaRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 16 },
  metaItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  metaText: { fontSize: 13, color: ds.textMuted },

  stats: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 20 },
  stat: { flex: 1, alignItems: "center", gap: 3 },
  statDivider: { borderRightWidth: StyleSheet.hairlineWidth, borderRightColor: ds.lineSoft },
  statValue: { fontSize: 17, fontWeight: "800", color: ds.text },
  statLabel: { fontSize: 12.5, color: ds.textMuted },

  actions: { flexDirection: "row", gap: 9, paddingHorizontal: 16, paddingTop: 18 },
  primaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  primaryBtnText: { color: ds.onDark, fontSize: 14, fontWeight: "700" },
  // "Edit profile" text only, bumped from primaryBtnText's 14 - the button
  // itself (primaryBtn: height 48) is unchanged, and this must not also
  // grow the Follow button's own text, which shares primaryBtnText too.
  editProfileBtnText: { fontSize: 16 },
  guestBtn: { flex: 0, alignSelf: "stretch", marginTop: 12 },
  /** "Following" / "Requested": present but not shouting, per the design's
   *  white-with-hairline treatment for anything that is not the primary CTA. */
  secondaryBtn: {
    flex: 1,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ds.line,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryBtnText: { color: ds.text, fontSize: 14, fontWeight: "700" },
  squareBtn: {
    width: 52,
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: ds.line,
    backgroundColor: ds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  /** Open state for the suggested-accounts chevron, so the panel below it
   *  clearly belongs to this button. */
  squareBtnOn: { borderColor: ds.accent, backgroundColor: ds.accentWash },
  /** Matches the 18pt SVG glyphs in the square buttons either side of it. */
  studioIcon: { width: 20, height: 20 },

  /* Profile-views button: eye, overlapping viewer faces, then "+N". */
  viewsBtn: { flexDirection: "row", alignItems: "center", gap: 7 },
  viewsNewDot: {
    position: "absolute",
    top: -3,
    right: -4,
    width: 9,
    height: 9,
    borderRadius: 999,
    backgroundColor: ds.accent,
    borderWidth: 1.5,
    borderColor: ds.surface,
  },
  viewsFaces: { flexDirection: "row", alignItems: "center" },
  viewsFace: { width: 22, height: 22, borderRadius: 999, borderWidth: 1.5, borderColor: ds.surface, overflow: "hidden" },
  viewsFaceImg: { width: "100%", height: "100%", borderRadius: 999, backgroundColor: ds.surfaceSunken },
  viewsFaceFallback: { backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  viewsFaceInitial: { color: ds.onDark, fontSize: 9.5, fontWeight: "800" },
  viewsMore: {
    height: 22,
    marginLeft: -7,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: ds.surfaceSunken,
    borderWidth: 1.5,
    borderColor: ds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  viewsMoreText: { fontSize: 9.5, fontWeight: "800", color: ds.slate },

  tabs: { marginTop: 20, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ds.lineSoft },
  // Pinned copy of the row above - see stickyTabs. `top` is set inline
  // (topBarH, measured). Opaque background: this sits directly over the
  // scrolling grid, so it has to occlude it, not just the tab row's own
  // old space.
  stickyTabsWrap: {
    position: "absolute", left: 0, right: 0, zIndex: 5,
    backgroundColor: ds.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ds.lineSoft,
  },
  // justifyContent: space-between, not a fixed gap - spreads the icons
  // across this row's own full width (a plain View now, not a horizontal
  // ScrollView - see the tabs row's own comment) instead of left-packing
  // them with unused space on the right.
  // space-between keeps the generous even spacing between icons; just the
  // corner room (paddingHorizontal) nudged up a bit more, 20 -> 26.
  tabsContent: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 26 },
  tabBtn: { paddingVertical: 13, alignItems: "center" },
  // Icon-only now (no label text) - flexDirection/gap from the old icon+text
  // row are gone since there's only ever one child, but the wrapper stays so
  // the underline below still measures against the same box.
  tabInner: { alignItems: "center" },
  tabUnderline: { position: "absolute", bottom: 0, left: 0, right: 0, height: 2, backgroundColor: ds.accent, borderRadius: 2 },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 2, paddingTop: 2 },
  thumb: { width: "100%", height: "100%", backgroundColor: ds.line },
  thumbFallback: { backgroundColor: "#DED9E2" },
  thumbBottom: {
    position: "absolute",
    left: 7,
    right: 7,
    bottom: 7,
    flexDirection: "row",
    justifyContent: "space-between",
  },
  thumbStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  thumbCount: { color: ds.onDark, fontSize: 11.5, fontWeight: "700" },

  center: { paddingVertical: 28, alignItems: "center", gap: 6, paddingHorizontal: 40 },
  emptyArt: { width: 300, height: 300, marginBottom: -8 },
  emptyTitle: { fontSize: 15, fontWeight: "700", color: ds.text },
  emptyBody: { fontSize: 13, color: ds.textMuted, textAlign: "center", maxWidth: 280 },
});

/**
 * Route wrapper: the same screen, pushed for one creator.
 *
 * Pushed on the ROOT stack, so it sits above the tab navigator and covers the
 * bar - which is why it takes the "pushed" presentation rather than "tab".
 * Opened by tapping anyone in a followers / following / suggested list.
 */
export function UserProfileScreen() {
  const route = useRoute<RouteProp<RootStackParamList, "UserProfile">>();
  return <ProfileTabScreen username={route.params.username} presentation="pushed" />;
}
