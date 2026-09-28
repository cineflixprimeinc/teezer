import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, RefreshControl, Animated } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import {
  inboxApi,
  GIFT_NOTIF_TYPES,
  SYSTEM_NOTIF_TYPES,
  type Conversation,
  type InboxNotification,
  type StoryFeedItem,
} from "@/api/inbox.api";
import { walletApi } from "@/api/wallet.api";
import { STORY_REACTION_EMOJI } from "@/api/story.api";
import { useAuthStore } from "@/store/auth.store";
import { BottomSheet } from "@/components/BottomSheet";
import { MenuRow } from "@/components/sheet/MenuRow";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { Avatar } from "@/components/Avatar";
import { ActivityStatusSheet } from "./ActivityStatusSheet";
import { InboxSearchScreen } from "./InboxSearchScreen";
import { PinActionIcon } from "@/components/icons/PinActionIcon";

/**
 * Inbox - the prototype's `isInbox` surface, on live data.
 *
 * Conversations come from GET /messages/conversations; the Activity row's
 * preview and unread dot come from GET /notifications. Both are read-only here;
 * opening a thread is wired when the Chat screen is rebuilt.
 */

function AddPersonGlyph() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Circle cx={8} cy={9} r={3} stroke={ds.text} strokeWidth={1.8} />
      <Path d="M2.5 19c0-3 2.5-5 5.5-5s5.5 2 5.5 5" stroke={ds.text} strokeWidth={1.8} strokeLinecap="round" />
      <Path d="M17 5v6M14 8h6" stroke={ds.text} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

/** 2480 → "2,480". Local rather than shared, matching how `ago()` below is
 *  handled - every inbox screen carries its own copy of its small formatters. */
function groupNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Trailing count for a pinned row. Renders nothing at zero - an empty badge
 *  reads as "something is waiting" when nothing is. */
function CountBadge({ n }: { n: number }) {
  if (!n) return null;
  return (
    <View style={styles.countBadge}>
      <Text style={styles.countBadgeText}>{n > 99 ? "99+" : n}</Text>
    </View>
  );
}

/** One face in a row's avatar stack. */
type Person = { id: number; username: string; avatar: string | null };

/**
 * Who is behind a bucket of notifications, newest first, deduped.
 *
 * Prefers each notification's `actors` list - the backend already ships the
 * latest few per aggregated notification precisely so this stack costs no extra
 * queries - and falls back to the single `actor` on un-aggregated ones.
 */
function peopleFrom(notes: Partial<InboxNotification>[], max: number): Person[] {
  const seen = new Map<number, Person>();
  for (const n of notes) {
    const from = n.actors?.length ? n.actors : n.actor ? [n.actor] : [];
    for (const a of from) {
      if (a && !seen.has(a.id)) {
        seen.set(a.id, { id: a.id, username: a.username, avatar: a.avatar });
      }
    }
    if (seen.size >= max) break;
  }
  return [...seen.values()];
}

/** Overlapping faces, then a +N when there are more than fit. */
function AvatarStack({
  people,
  extra,
  onOpen,
}: {
  people: Person[];
  extra: number;
  /** Makes each face tappable - used on the Gifts row, where knowing WHO sent
   *  something is the point and their profile is the obvious next step. */
  onOpen?: (username: string) => void;
}) {
  if (people.length === 0) return null;
  return (
    <View style={styles.stack}>
      {people.map((p, i) => (
        <Pressable
          key={p.id}
          disabled={!onOpen || !p.username}
          onPress={() => p.username && onOpen?.(p.username)}
          accessibilityRole={onOpen ? "button" : undefined}
          accessibilityLabel={onOpen && p.username ? `Open @${p.username}` : undefined}
          style={[styles.stackItem, i > 0 && styles.stackOverlap]}
        >
          {p.avatar ? (
            <Image source={{ uri: p.avatar }} style={styles.stackImg} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.stackImg, styles.stackFallback]}>
              <Text style={styles.stackFallbackText}>
                {(p.username?.[0] ?? "?").toUpperCase()}
              </Text>
            </View>
          )}
        </Pressable>
      ))}
      {extra > 0 && (
        <View style={[styles.stackItem, styles.stackOverlap, styles.stackMore]}>
          <Text style={styles.stackMoreText}>+{extra > 99 ? "99" : extra}</Text>
        </View>
      )}
    </View>
  );
}

/* The three row marks below are Lucide, kept as supplied: stroke-width 2 on the
   24 viewBox, round caps and joins. Only the stroke colour is bound to the row
   it sits in - white on the tinted circles, muted on the light one. */

/** Lucide `gift` - the amber "Gifts & coins" row. */
function GiftGlyph() {
  return (
    <Svg width={27} height={27} viewBox="0 0 24 24" fill="#fff">
      <Path d="M14.5049 2.00281C16.4379 2.00281 18.0049 3.56981 18.0049 5.50281C18.0049 6.04001 17.8839 6.54895 17.6676 7.00385L21.0049 7.00281C21.5572 7.00281 22.0049 7.45052 22.0049 8.00281V12.0028C22.0049 12.5551 21.5572 13.0028 21.0049 13.0028H20.0049V21.0028C20.0049 21.5551 19.5572 22.0028 19.0049 22.0028H5.00488C4.4526 22.0028 4.00488 21.5551 4.00488 21.0028V13.0028H3.00488C2.4526 13.0028 2.00488 12.5551 2.00488 12.0028V8.00281C2.00488 7.45052 2.4526 7.00281 3.00488 7.00281L6.34219 7.00385C6.12591 6.54895 6.00488 6.04001 6.00488 5.50281C6.00488 3.56981 7.57189 2.00281 9.50488 2.00281C10.4849 2.00281 11.3708 2.40557 12.0061 3.05459C12.639 2.40557 13.5249 2.00281 14.5049 2.00281ZM18.0049 13.0028H6.00488V20.0028H18.0049V13.0028ZM20.0049 9.00281H4.00488V11.0028H20.0049V9.00281ZM9.50488 4.00281C8.67646 4.00281 8.00488 4.67438 8.00488 5.50281C8.00488 6.2825 8.59977 6.92326 9.36042 6.99594L9.50488 7.00281H11.0049V5.50281C11.0049 4.72311 10.41 4.08236 9.64934 4.00967L9.50488 4.00281ZM14.5049 4.00281L14.3604 4.00967C13.6473 4.07782 13.0799 4.64524 13.0117 5.35835L13.0049 5.50281V7.00281H14.5049L14.6493 6.99594C15.41 6.92326 16.0049 6.2825 16.0049 5.50281C16.0049 4.72311 15.41 4.08236 14.6493 4.00967L14.5049 4.00281Z" />
    </Svg>
  );
}

/** Lucide `message-square-text` - the guest empty-state's own icon
 *  ("Your inbox is waiting"), untouched. Kept separate from
 *  ChatRequestGlyph below so restyling the "Chats & Message Requests"
 *  row's own icon doesn't also change this unrelated one. */
function ChatGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 17a2 2 0 0 1-2 2H6.828a2 2 0 0 0-1.414.586l-2.202 2.202A.71.71 0 0 1 2 21.286V5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2z"
        stroke={ds.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M7 11h10" stroke={ds.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 15h6" stroke={ds.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7 7h8" stroke={ds.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** The "Chats & Message Requests" row's own icon - user-supplied SVG,
 *  filled/bold rather than stroked, matching the row's neutral
 *  (ds.surfaceSunken) tile the same way ChatGlyph's stroke colour did. */
function ChatRequestGlyph() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill={ds.text}>
      <Path d="M2 5.5V3.9934C2 3.44476 2.45531 3 2.9918 3H21.0082C21.556 3 22 3.44495 22 3.9934V20.0066C22 20.5552 21.5447 21 21.0082 21H2.9918C2.44405 21 2 20.5551 2 20.0066V19H20V7.3L12 14.5L2 5.5ZM0 10H5V12H0V10ZM0 15H8V17H0V15Z" />
    </Svg>
  );
}

/** Header caret beside "Inbox" - the design's account/filter affordance. */
function ChevronDownGlyph() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M5 9l7 7 7-7" stroke={ds.text} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function SearchGlyph() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none">
      <Circle cx={10.5} cy={10.5} r={6.8} stroke={ds.text} strokeWidth={2} />
      <Path d="M15.6 15.6L21 21" stroke={ds.text} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

/** Lucide `zap` - the "Activity & new followers" row. Stroked, as supplied,
 *  rather than the solid bolt it replaces. */
function BoltGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15.914 4a1.5 1.5 0 00-2.474-1.561l-9 9A1.5 1.5 0 005.5 14h4.002a.5.5 0 01.471.666L8.086 20a1.5 1.5 0 002.475 1.56l9-9A1.5 1.5 0 0018.5 10h-3.997a.5.5 0 01-.472-.667z"
        stroke={ds.onDark}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Lucide `megaphone` - the "System notifications" row. Reelsoo announcing,
 *  which is a better read on that row than the padlock it replaces. */
function MegaphoneGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11 6a13 13 0 0 0 8.4-2.8A1 1 0 0 1 21 4v12a1 1 0 0 1-1.6.8A13 13 0 0 0 11 14H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2z"
        stroke={ds.onDark}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6 14a12 12 0 0 0 2.4 7.2 2 2 0 0 0 3.2-2.4A8 8 0 0 1 10 14"
        stroke={ds.onDark}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M8 6v8" stroke={ds.onDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CameraGlyph() {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Rect x={3} y={6} width={14} height={12} rx={2} stroke={ds.textMuted} strokeWidth={1.7} />
      <Path d="M17 10.5l4-2.5v8l-4-2.5" stroke={ds.textMuted} strokeWidth={1.7} />
    </Svg>
  );
}

/** "2m", "4h", "3d" - the compact stamp the design uses on a conversation row. */
function ago(iso: string | null) {
  if (!iso) return "";
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d`;
  return `${Math.floor(secs / 604800)}w`;
}

function preview(c: Conversation) {
  // Checked BEFORE last_message: a shared reel carries the video's caption as
  // its body, so falling through would show that caption as though the sender
  // had typed it. The row's title is already the sender, so "Sent a video"
  // reads as "<name> · Sent a video".
  if (c.last_message_type === "shared_video") return "Sent a video";
  if (c.last_message_type === "shared_story") return "Sent a story";
  // Same reason as shared_video above: last_message here is the raw
  // reaction_type key ("heart"), not text meant to be shown as-is.
  if (c.last_message_type === "story_reaction") {
    return `${STORY_REACTION_EMOJI[c.last_message ?? ""] ?? "❤️"} Reacted to your Story`;
  }

  if (c.last_message && c.last_message.trim()) return c.last_message;
  // A media-only message has no text; naming the kind beats an empty row.
  switch (c.last_message_type) {
    case "image":
      return "Photo";
    case "video":
      return "Video";
    case "voice":
      return "Voice message";
    case "share":
      return "Shared a post";
    default:
      return "Tap to chat";
  }
}

const SWIPE_ACTION_WIDTH = 60;
const SWIPE_ACTIONS_COUNT = 3;
const SWIPE_REVEAL = SWIPE_ACTION_WIDTH * SWIPE_ACTIONS_COUNT;
const SWIPE_OPEN_TRIGGER = 44;

/**
 * Swipe-left-to-reveal actions on a DM conversation row - Pin/Mute/Archive,
 * the same three the long-press menu already offers (this doesn't add new
 * capabilities, just a second, faster way into the existing ones). Only one
 * row is ever open at a time (`openId` lives in InboxScreen, not here), and
 * opening a different row or tapping the open one closes it, matching the
 * existing chatMenu bottom sheet's own single-thing-open discipline.
 *
 * Deliberately NOT wrapping the generic `Row` component used by the pinned
 * Activity/Gifts/System rows above it - only DM rows get this, so nothing
 * about those unrelated rows changes.
 */
function SwipeableConversationRow({
  id, openId, onOpenChange, onPin, onMute, onArchive, pinned, muted, children,
}: {
  id: number;
  openId: number | null;
  onOpenChange: (id: number | null) => void;
  onPin: () => void;
  onMute: () => void;
  onArchive: () => void;
  pinned: boolean;
  muted: boolean;
  children: React.ReactNode;
}) {
  const isOpen = openId === id;
  const translateX = useRef(new Animated.Value(0)).current;
  const dragX = useRef(0);

  const springTo = (open: boolean) => {
    Animated.spring(translateX, { toValue: open ? -SWIPE_REVEAL : 0, useNativeDriver: true, speed: 20, bounciness: 0 }).start();
  };

  // Closed/opened from elsewhere (another row opened, or a button inside
  // this one's own reveal was tapped) - snap to match.
  useEffect(() => {
    dragX.current = isOpen ? -SWIPE_REVEAL : 0;
    springTo(isOpen);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pan = useMemo(
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
        .activeOffsetX([-10, 10000])
        .failOffsetX([10, 10000])
        .failOffsetY([-10, 10])
        .onUpdate((e) => {
          const base = isOpen ? -SWIPE_REVEAL : 0;
          const dx = Math.max(-SWIPE_REVEAL, Math.min(0, base + e.translationX));
          dragX.current = dx;
          translateX.setValue(dx);
        })
        .onEnd(() => {
          const shouldOpen = dragX.current < -SWIPE_OPEN_TRIGGER;
          springTo(shouldOpen);
          onOpenChange(shouldOpen ? id : null);
        }),
    [id, isOpen, onOpenChange],
  );

  return (
    <View style={styles.swipeWrap}>
      <View style={styles.swipeActions}>
        <Pressable
          style={[styles.swipeAction, { backgroundColor: "#8B7FD6" }]}
          onPress={() => { onOpenChange(null); onPin(); }}
          accessibilityRole="button"
          accessibilityLabel={pinned ? "Unpin chat" : "Pin chat"}
        >
          <PinActionIcon size={20} color="#fff" />
        </Pressable>
        <Pressable
          style={[styles.swipeAction, { backgroundColor: "#5F6675" }]}
          onPress={() => { onOpenChange(null); onMute(); }}
          accessibilityRole="button"
          accessibilityLabel={muted ? "Unmute chat" : "Mute chat"}
        >
          <Ionicons name={muted ? "notifications-outline" : "notifications-off-outline"} size={20} color="#fff" />
        </Pressable>
        <Pressable
          style={[styles.swipeAction, { backgroundColor: ds.accent }]}
          onPress={() => { onOpenChange(null); onArchive(); }}
          accessibilityRole="button"
          accessibilityLabel="Archive chat"
        >
          <Ionicons name="archive-outline" size={20} color="#fff" />
        </Pressable>
      </View>
      <GestureDetector gesture={pan}>
        <Animated.View style={{ transform: [{ translateX }], backgroundColor: ds.surface }}>
          {isOpen && (
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={() => onOpenChange(null)}
              accessibilityLabel="Close swipe actions"
            />
          )}
          {children}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

function Row({
  avatar,
  title,
  sub,
  unread,
  verified,
  onPress,
  tint,
  glyph,
  right,
  people,
  peopleExtra = 0,
  onOpenPerson,
  onLongPress,
  hasStory,
  storySeen,
}: {
  avatar?: string | null;
  title: string;
  sub: string;
  unread?: boolean;
  /** DM rows only - the other person's blue check, next to their name. The
   *  pinned Activity/Gifts/System rows above never pass this; they're a
   *  category, not one person's identity. */
  verified?: boolean;
  onPress?: () => void;
  tint?: string;
  glyph?: React.ReactNode;
  /** Trailing slot. Omit it and the row falls back to the DM behaviour - an
   *  unread dot, or the camera affordance. The pinned rows at the top of the
   *  inbox each want something different there, so they pass their own. */
  right?: React.ReactNode;
  /** Faces of the people behind this row, shown under the preview line. */
  people?: Person[];
  /** How many more there are than the stack shows. */
  peopleExtra?: number;
  /** Passed through to the stack so a face can open that person's profile. */
  onOpenPerson?: (username: string) => void;
  /** Chat rows only: opens pin / archive / mute for that thread. */
  onLongPress?: () => void;
  /** DM rows only - draws the same gradient "live story" ring the profile
   *  screen and the story rail above already use, around this person's own
   *  avatar here too. */
  hasStory?: boolean;
  /** Only consulted when hasStory is true - true switches the ring to the
   *  same flat "seen" color the story rail above already uses. */
  storySeen?: boolean;
}) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} delayLongPress={300} accessibilityRole="button" style={styles.row}>
      {glyph ? (
        <View style={[styles.rowAvatar, { backgroundColor: tint ?? ds.surfaceSunken }]}>{glyph}</View>
      ) : avatar ? (
        // The prop was always accepted here but never drawn, so every DM row
        // rendered the grey placeholder no matter who it was from.
        <Avatar uri={avatar} style={styles.rowAvatar} hasStory={hasStory} storySeen={storySeen} />
      ) : (
        <View style={[styles.rowAvatar, styles.rowAvatarPlaceholder]}>
          <Text style={styles.rowAvatarLetter}>{(title?.[0] ?? "?").toUpperCase()}</Text>
        </View>
      )}
      <View style={styles.rowText}>
        <View style={styles.rowTitleRow}>
          <Text style={[styles.rowTitle, unread && styles.rowTitleUnread]} numberOfLines={1}>
            {title}
          </Text>
          {verified && <VerifiedBadge size={13} />}
        </View>
        <Text style={[styles.rowSub, unread && styles.rowSubUnread]} numberOfLines={1}>
          {sub}
        </Text>
        {!!people?.length && (
          <AvatarStack people={people} extra={peopleExtra} onOpen={onOpenPerson} />
        )}
      </View>
      {right !== undefined ? right : unread ? <View style={styles.unreadDot} /> : <CameraGlyph />}
    </Pressable>
  );
}

export function InboxScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const [statusOpen, setStatusOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const me = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.status !== "authenticated");

  /**
   * The story rail. Own story is excluded - it belongs on the "You" tile, and
   * showing it twice reads as two different stories.
   *
   * Unseen first, then whatever order the server returned, which is recency.
   * Ranking by affinity (whose posts you like, whose profile you open) is what
   * was asked for, but /stories/feed carries no such signal - it is a flat list
   * of people you follow. That ordering has to come from the server.
   */
  const stories = useQuery({
    queryKey: ["stories-feed"],
    queryFn: () => inboxApi.storyFeed(),
    enabled: !!me,
    staleTime: 60_000,
  });
  /** The conversation whose pin / archive / mute sheet is open. */
  const [chatMenu, setChatMenu] = useState<Conversation | null>(null);
  /** Which DM row currently has its swipe actions revealed, if any - only
   *  one at a time, same discipline chatMenu's own bottom sheet already has. */
  const [openSwipeId, setOpenSwipeId] = useState<number | null>(null);

  /** Apply a change and refresh the list, which is what re-sorts the pins. */
  const patchChat = (c: Conversation, patch: Parameters<typeof inboxApi.updateConversationSettings>[1]) => {
    setChatMenu(null);
    inboxApi
      .updateConversationSettings(c.user_id, patch)
      .then(() => convos.refetch())
      .catch(() => {});
  };

  /** Your own live story, which leads the carousel. */
  const myStory = useMemo(
    () => (stories.data ?? []).find((s: StoryFeedItem) => s.is_own && !!s.stories?.length) ?? null,
    [stories.data],
  );

  const storyAuthors = useMemo(() => {
    const rows = (stories.data ?? []).filter(
      (s: StoryFeedItem) => !s.is_own && !!s.stories?.length,
    );
    /**
     * Unseen first, watched pushed to the back - so someone you have already
     * caught up on moves out of the way and stops holding the front of the rail.
     *
     * Within each group the server's order is kept, which is newest first. The
     * sort is stable, so that survives - and it has to be done this way, because
     * StoryFeedItem exposes no timestamp to sort by directly.
     */
    return [...rows].sort((a, b) => Number(b.has_unseen) - Number(a.has_unseen));
  }, [stories.data]);

  const convos = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => inboxApi.conversations(),
    // Every surface on this screen - conversations, notifications, requests,
    // the balance - is behind auth. Signed out they would each 401 on mount,
    // so none of them run and the guest panel below takes the whole screen.
    enabled: !isGuest,
    staleTime: 20_000,
  });

  // Powers the Gifts & coins row's trailing balance. Guest-safe: the endpoint
  // is behind auth, so it only runs with a session and the row falls back to
  // its unread count until (or unless) a balance actually arrives.
  const wallet = useQuery({
    queryKey: ["wallet-summary"],
    queryFn: () => walletApi.summary(),
    enabled: !!me,
    staleTime: 30_000,
  });

  const notes = useQuery({
    queryKey: ["inbox-notifications"],
    // 50, not 20: the pinned-row badges count unread rows off this page, so a
    // page too short undercounted them - unreads sitting deeper than the fetch
    // showed no badge at all.
    queryFn: () => inboxApi.notifications(50),
    enabled: !isGuest,
    staleTime: 30_000,
  });

  // The endpoint has shipped both a bare array and a paginated envelope; accept
  // either rather than assuming one and rendering nothing on the other.
  const noteList = Array.isArray(notes.data)
    ? notes.data
    : ((notes.data as { data?: unknown[] } | undefined)?.data ?? []);

  type Note = Partial<InboxNotification>;

  /**
   * Newest first, and profile views dropped entirely.
   *
   * Each pinned row shows `[0].message` as its preview, so one out-of-order
   * row puts a stale line under a count that disagrees with it. The server
   * orders this way already; sorting here means the page does not depend on
   * that staying true.
   *
   * `profile_view` is excluded for the same reason the Activity feed excludes
   * it (see NOT_ACTIVITY in NotificationsScreen): it is a statistic, not
   * something you can act on. That filter was only applied there, so on this
   * page profile views were still falling through into Activity - counted and
   * previewed as though someone had engaged with you.
   */
  const all = (noteList as Note[])
    .filter((n) => n?.type !== "profile_view")
    .sort((a, b) => +new Date(b?.created_at ?? 0) - +new Date(a?.created_at ?? 0));

  /** Faces to show per row before the +N takes over. */
  const STACK = 4;
  /** Unread is what a badge should count - a number that never clears is not a
   *  notification, it is a statistic. */
  const unreadOf = (ns: Note[]) => ns.filter((n) => n?.is_read === false).length;

  // The design splits one notification feed into three pinned rows, so split it
  // on the axis the backend already types. Each notification lands in exactly
  // one bucket - otherwise a gift would be counted twice and the unread dots
  // would disagree with each other.
  /*
   * Matched against the shared type SETS, not two literal strings.
   *
   * It used to be `type === "system"` and `type === "gift"` exactly, which meant
   * every other system type the backend sends - announcement, maintenance,
   * security, account_warning, payment, verification, report_actioned and
   * anything raised from the admin panel ("admin") - fell through to Activity.
   * Those are messages FROM Reelsoo, not engagement, and the System row is where
   * they belong.
   *
   * The gift types are listed for the same reason: the wallet writes gift_sent /
   * gift_received / coin_purchase, so a bare "gift" never matched.
   */
  const bucket = (n: Note): "system" | "gift" | "activity" => {
    const t = n?.type ?? "";
    return GIFT_NOTIF_TYPES.has(t) ? "gift" : SYSTEM_NOTIF_TYPES.has(t) ? "system" : "activity";
  };
  const activity = all.filter((n) => bucket(n) === "activity");
  const gifts = all.filter((n) => bucket(n) === "gift");
  const system = all.filter((n) => bucket(n) === "system");

  const activityPreview = activity[0]?.message ?? "Likes, comments and new followers";
  const activityCount = unreadOf(activity);
  const activityPeople = peopleFrom(activity, STACK);

  const giftPreview = gifts[0]?.message ?? "Gifts people sent you";
  const giftCount = unreadOf(gifts);
  const giftPeople = peopleFrom(gifts, STACK);

  const systemPreview = system[0]?.message ?? "Account, security and Teezer updates";
  const systemCount = unreadOf(system);

  // Total people behind a bucket, so the +N counts everyone rather than just
  // the ones the fetched page happened to include. `actor_count` is the
  // server's own tally for an aggregated notification.
  const reachOf = (ns: Note[]) =>
    ns.reduce((sum, n) => sum + Math.max(1, n?.actor_count ?? 1), 0);

  /* ── message requests ─────────────────────────────────────────────────────
   * Pending chats from people you do not follow. Fetched rather than derived:
   * they never appear in the conversation list (that is the point of a
   * request) and they are not notifications either. */
  const requests = useQuery({
    queryKey: ["inbox-message-requests"],
    queryFn: () => inboxApi.messageRequests(),
    enabled: !isGuest,
    staleTime: 30_000,
  });
  const incoming = requests.data?.incoming ?? [];
  const requestPreview =
    incoming.length === 0
      ? "No pending requests"
      : incoming.length === 1
        ? `@${incoming[0].username} wants to chat`
        : `@${incoming[0].username} and ${incoming.length - 1} other${
            incoming.length - 1 === 1 ? "" : "s"
          } want to chat`;
  const requestPeople: Person[] = incoming
    .slice(0, STACK)
    .map((r) => ({ id: r.user_id, username: r.username, avatar: r.avatar }));

  /* Archived threads are reported by the API but not filtered by it - the list
     query paginates over a derived table, so hiding them there would shorten
     pages unpredictably. Hidden here instead, which is why this is a filter and
     not just a render. */
  const list = (convos.data ?? []).filter((c) => !c.archived);
  const loading = convos.isLoading || notes.isLoading;

  // Search takes over this tab rather than pushing a route, so the bottom tab
  // bar stays where it is - the same way the Spaces tab opens its own search.
  if (searchOpen) return <InboxSearchScreen onClose={() => setSearchOpen(false)} />;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        {/* Add-friends, the status dropdown and search all lead to per-account
            data or actions - a guest has none, so they're dropped rather than
            offered and gated one tap later. */}
        {!isGuest && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Find people"
            hitSlop={8}
            onPress={() => navigation.navigate("SettingsShell", { screen: "FindFriends" })}
          >
            <AddPersonGlyph />
          </Pressable>
        )}
        {isGuest ? (
          <View style={styles.titleWrap}>
            <Text style={styles.title}>Inbox</Text>
          </View>
        ) : (
          <Pressable
            style={styles.titleWrap}
            accessibilityRole="button"
            accessibilityLabel="Choose who can see when you're active"
            hitSlop={8}
            onPress={() => setStatusOpen(true)}
          >
            <Text style={styles.title}>Inbox</Text>
            <View style={styles.onlineDot} />
            <ChevronDownGlyph />
          </Pressable>
        )}
        {!isGuest && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Search inbox"
            hitSlop={8}
            onPress={() => setSearchOpen(true)}
          >
            <SearchGlyph />
          </Pressable>
        )}
      </View>

      {/* Signed out, there is nothing on this page that can load: messages,
          activity, gifts and requests are all per-account. Rather than four
          rows of zeroes, guests get the two buttons that fix it. "Log in"
          follows the app's own rule - straight to Saved accounts when the
          device has one, otherwise the login options. */}
      {isGuest ? (
        <View style={styles.guest}>
          <View style={styles.guestIcon}>
            <ChatGlyph />
          </View>
          <Text style={styles.guestTitle}>Your inbox is waiting</Text>
          <Text style={styles.guestBody}>
            Log in to see your messages, activity, gifts and follow requests.
          </Text>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.guestPrimary, pressed && styles.pressed]}
            onPress={() =>
              navigation.navigate(
                useAuthStore.getState().accounts.length > 0 ? "SavedAccounts" : "Login",
              )
            }
          >
            <Text style={styles.guestPrimaryText}>Log in</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={({ pressed }) => [styles.guestSecondary, pressed && styles.pressed]}
            onPress={() => navigation.navigate("Signup")}
          >
            <Text style={styles.guestSecondaryText}>Sign up</Text>
          </Pressable>
        </View>
      ) : (
      // One scroll container, not two: the story rail used to be its own
      // horizontal ScrollView sitting OUTSIDE this one, which meant scrolling
      // the inbox left it pinned at the top like a sticky header - never the
      // intent, it's just supposed to scroll away with everything else.
      // Nesting it in here as the first child fixes that.
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
        refreshControl={
          <RefreshControl
            refreshing={convos.isRefetching}
            onRefresh={() => {
              convos.refetch();
              notes.refetch();
            }}
            tintColor={ds.textMuted}
          />
        }
      >
      {/* A carousel, because the number of people you follow with a live story
          is unbounded - a fixed row would simply hide the rest. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        {/* You, first and always. One tile, not two: your own photo with a +
            on it, which is the affordance every story tray uses.

            Tapping it watches your story when you have one and opens the
            composer when you do not - the + is what adds another either way, so
            posting is never more than one tap from here. */}
        <Pressable
          onPress={() =>
            myStory
              ? navigation.navigate("StoryViewer", { username: me!.username })
              : navigation.navigate("StoryComposer")
          }
          style={styles.railItem}
          accessibilityRole="button"
          accessibilityLabel={myStory ? "Your story" : "Create a story"}
        >
          {/* Ring only when there is something to open. */}
          {myStory?.has_unseen ? (
            <LinearGradient
              colors={["#F42B5B", "#FF6E90", "#8B5CF6"]}
              start={{ x: 0, y: 1 }}
              end={{ x: 1, y: 0 }}
              style={styles.railRing}
            />
          ) : myStory ? (
            <View style={[styles.railRing, styles.railRingSeen]} />
          ) : null}

          {/* The badge is positioned against THIS, a box exactly the size of the
              photo - not against the tile, which is taller by the label and left
              the + floating up the side. Same arrangement the profile uses. */}
          <View style={styles.railAvatarBox}>
            {me?.avatar ? (
              <Image source={{ uri: me.avatar }} style={styles.railAvatarMe} contentFit="cover" />
            ) : (
              <View style={[styles.railAvatarMe, styles.railAvatarFallback]}>
                <Text style={styles.railAvatarLetter}>
                  {(me?.name || me?.username || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}

            <Pressable
              onPress={() => navigation.navigate("StoryComposer")}
              hitSlop={8}
              style={styles.railPlus}
              accessibilityRole="button"
              accessibilityLabel="Create a story"
            >
              <Text style={styles.railPlusText}>+</Text>
            </Pressable>
          </View>

          <Text style={styles.railLabel} numberOfLines={1}>Your story</Text>
        </Pressable>

        {/* Everyone you follow who has a live story. Unseen first, then most
            recent - the order every story tray uses, and the only ranking the
            server gives us today. Ordering by how much you like someone's posts
            needs affinity signals the stories feed does not carry. */}
        {storyAuthors.map((s) => (
          <Pressable
            key={s.user.id}
            onPress={() => navigation.navigate("StoryViewer", { username: s.user.username })}
            style={styles.railItem}
            accessibilityRole="button"
            accessibilityLabel={`${s.user.display_name || s.user.username}'s story`}
          >
            {/* Gradient while unseen, flat once watched - the ring IS the
                unread state here, exactly as on the profile. */}
            {s.has_unseen ? (
              <LinearGradient
                colors={["#F42B5B", "#FF6E90", "#8B5CF6"]}
                start={{ x: 0, y: 1 }}
                end={{ x: 1, y: 0 }}
                style={styles.railRing}
              />
            ) : (
              <View style={[styles.railRing, styles.railRingSeen]} />
            )}
            {s.user.avatar ? (
              <Image source={{ uri: s.user.avatar }} style={styles.railAvatarMe} contentFit="cover" />
            ) : (
              <View style={[styles.railAvatarMe, styles.railAvatarFallback]}>
                <Text style={styles.railAvatarLetter}>
                  {(s.user.display_name || s.user.username || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.railLabel} numberOfLines={1}>
              {s.user.display_name?.split(" ")[0] || s.user.username}
            </Text>
          </Pressable>
        ))}

      </ScrollView>

        <Row
          title="Activity & new followers"
          sub={activityPreview}
          tint={ds.accent}
          glyph={<BoltGlyph />}
          onPress={() => navigation.navigate("Notifications")}
          right={<CountBadge n={activityCount} />}
          people={activityPeople}
          peopleExtra={Math.max(0, reachOf(activity) - activityPeople.length)}
        />
        <Row
          title="Gifts & coins"
          sub={giftPreview}
          tint="#F5B93B"
          glyph={<GiftGlyph />}
          onPress={() =>
            // The badge counts unread gift notifications, so while it is up the
            // tap has to show what it counts - the gifts feed, which nothing
            // else linked to and which used to be reachable from nowhere.
            // With nothing unread, the row stays the wallet shortcut it is.
            giftCount > 0
              ? navigation.navigate("Notifications", { scope: "gifts" })
              : navigation.navigate("GiftsCoins")
          }
          // The design shows the coin balance here, which is now a real number:
          // GET /studio/wallets-coins is wired for the Gifts & coins screen this
          // row opens. Until it resolves - and for guests, who never call it -
          // the slot keeps its unread count rather than showing a placeholder
          // balance.
          right={
            wallet.data ? (
              <Text style={styles.rowBalance}>{groupNum(wallet.data.wallet.coin_balance)}</Text>
            ) : (
              <CountBadge n={giftCount} />
            )
          }
          people={giftPeople}
          peopleExtra={Math.max(0, reachOf(gifts) - giftPeople.length)}
          // Who sent it is the point of this row, so a face opens that profile
          // rather than only the Gifts & coins screen.
          onOpenPerson={(username) => navigation.navigate("UserProfile", { username })}
        />
        <Row
          title="System notifications"
          sub={systemPreview}
          tint="#1A1A22"
          glyph={<MegaphoneGlyph />}
          onPress={() => navigation.navigate("Notifications", { scope: "system" })}
          // Reelsoo talking to you - there is no one behind it, so no faces.
          right={<CountBadge n={systemCount} />}
        />
        <Row
          title="Chats & Message Requests"
          sub={requestPreview}
          tint={ds.surfaceSunken}
          glyph={<ChatRequestGlyph />}
          onPress={() => navigation.navigate("MessageRequests")}
          right={<CountBadge n={incoming.length} />}
          people={requestPeople}
          peopleExtra={Math.max(0, incoming.length - requestPeople.length)}
        />

        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={ds.accent} />
          </View>
        )}

        {!loading && convos.isError && (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>Couldn&apos;t load messages</Text>
            <Text style={styles.emptyBody}>Pull down to try again.</Text>
          </View>
        )}

        {!loading && !convos.isError && list.length === 0 && (
          <View style={styles.center}>
            <Text style={styles.emptyTitle}>No messages yet</Text>
            <Text style={styles.emptyBody}>
              Conversations with people you follow will show up here.
            </Text>
          </View>
        )}

        {list.map((c) => (
          <SwipeableConversationRow
            key={c.user_id}
            id={c.user_id}
            openId={openSwipeId}
            onOpenChange={setOpenSwipeId}
            pinned={!!c.pinned}
            muted={!!c.muted}
            onPin={() => patchChat(c, { pinned: !c.pinned })}
            onMute={() => patchChat(c, { mute: c.muted ? "off" : "8h" })}
            onArchive={() => patchChat(c, { archived: true })}
          >
            <Row
              onLongPress={() => setChatMenu(c)}
              avatar={c.avatar}
              hasStory={!!c.has_story}
              storySeen={!!c.has_story && !c.has_unseen}
              onPress={() =>
                navigation.navigate("Chat", {
                  userId: c.user_id,
                  username: c.username,
                  name: c.name,
                  avatar: c.avatar,
                  isVerified: !!c.is_verified,
                })
              }
              title={c.name || c.username}
              sub={`${preview(c)} · ${ago(c.last_ts)}`}
              unread={c.unread_count > 0}
              verified={!!c.is_verified}
            />
          </SwipeableConversationRow>
        ))}
      </ScrollView>
      )}

      {/* Pin / archive / mute, on the thread that was long-pressed. Labels
          follow its current state, so each row says what tapping it will do. */}
      <BottomSheet visible={!!chatMenu} onClose={() => setChatMenu(null)} scrollable={false}>
        <View style={{ paddingTop: 4, paddingBottom: insets.bottom + 12 }}>
          <MenuRow
            icon={<PinActionIcon color={chatMenu?.pinned ? ds.accent : ds.text} />}
            title={chatMenu?.pinned ? "Unpin chat" : "Pin chat"}
            subtitle="Pinned chats stay at the top for you only"
            onPress={() => chatMenu && patchChat(chatMenu, { pinned: !chatMenu.pinned })}
          />
          <MenuRow
            icon={chatMenu?.muted ? "notifications-outline" : "notifications-off-outline"}
            title={chatMenu?.muted ? "Unmute" : "Mute for 8 hours"}
            subtitle={chatMenu?.muted ? "Notifications on again" : "Messages still arrive, quietly"}
            onPress={() => chatMenu && patchChat(chatMenu, { mute: chatMenu.muted ? "off" : "8h" })}
          />
          {!chatMenu?.muted && (
            <MenuRow
              icon="notifications-off-outline"
              title="Mute always"
              onPress={() => chatMenu && patchChat(chatMenu, { mute: "always" })}
            />
          )}
          <MenuRow
            icon="archive-outline"
            title="Archive chat"
            subtitle="Hidden from your inbox until they write again"
            onPress={() => chatMenu && patchChat(chatMenu, { archived: true })}
          />
        </View>
      </BottomSheet>

      <ActivityStatusSheet open={statusOpen} onClose={() => setStatusOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingHorizontal: 16,
  },
  titleWrap: { flexDirection: "row", alignItems: "center", gap: 6 },
  title: { fontSize: font.lg, fontWeight: font.weightBold, color: ds.text },
  onlineDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: "#2BC48A" },

  /** Pill, not a dot: a request count is a number you act on, and the design
   *  gives it the same weight as the tab bar's badge. */
  countBadge: {
    minWidth: 22,
    height: 22,
    borderRadius: 999,
    paddingHorizontal: 6,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  countBadgeText: { color: ds.onDark, fontSize: font.xs, fontWeight: font.weightHeavy },

  /** The coin balance in the Gifts & coins row - plain heavy text, not a pill:
   *  it is a figure to read, not a count to clear. */
  rowBalance: { fontSize: font.sm, fontWeight: font.weightHeavy, color: ds.text },

  /** Faces under the preview line. The white ring is what separates one
   *  overlapping avatar from the next; without it they read as one blob. */
  stack: { flexDirection: "row", alignItems: "center", marginTop: 6 },
  stackItem: {
    width: 22,
    height: 22,
    borderRadius: 999,
    borderWidth: 1.5,
    borderColor: ds.surface,
    overflow: "hidden",
  },
  stackOverlap: { marginLeft: -7 },
  stackImg: { width: "100%", height: "100%", borderRadius: 999 },
  stackFallback: { backgroundColor: ds.surfaceSunken, alignItems: "center", justifyContent: "center" },
  stackFallbackText: { fontSize: 9.5, fontWeight: font.weightBold, color: ds.textMuted },
  stackMore: {
    backgroundColor: ds.surfaceSunken,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 2,
    minWidth: 22,
    width: undefined,
  },
  stackMoreText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: ds.textMuted },

  rail: { flexDirection: "row", gap: 22, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 },
  /** Behind the 56px avatar, 3px proud of it - the tray's unseen indicator. */
  railRing: { position: "absolute", top: -3, left: -3, width: 62, height: 62, borderRadius: 999 },
  railRingSeen: { backgroundColor: "#E3DFE7" },
  railAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#D6D1DB" },
  rowAvatarLetter: { color: ds.textMuted, fontSize: font.lg, fontWeight: font.weightBold },
  railItem: { alignItems: "center", gap: 7, width: 56 },
  /** Exactly the photo's footprint, so the + badge has something honest to hang
   *  off. Overflow is visible by default, which is what lets it sit proud. */
  railAvatarBox: { width: 56, height: 56 },
  railAvatarLetter: { color: ds.onDark, fontWeight: font.weightBold, fontSize: font.lg },
  /**
   * The same badge the profile puts on your avatar - a white disc with a dark
   * +, sitting on the rim, lifted by a soft shadow. Copied deliberately rather
   * than restyled: it is the one control that means "add a story", and it
   * should not look like two different things in two places.
   *
   * Its parent is railAvatarBox - the photo's own footprint - so these offsets
   * are the profile's, unchanged. Measuring from the tile instead is what put it
   * up the side of the circle.
   */
  railPlus: {
    position: "absolute",
    right: -2,
    bottom: 0,
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: ds.surface,
    borderWidth: 2,
    borderColor: "#F4F2F5",
    shadowColor: "#000",
    shadowOpacity: 0.16,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  railPlusText: { color: ds.text, fontSize: 15, lineHeight: 17, fontWeight: "600" },
  railAvatarMe: {
    width: 56,
    height: 56,
    borderRadius: 999,
    backgroundColor: ds.line,
    borderWidth: 2,
    borderColor: ds.lineSoft,
  },
  railLabel: { fontSize: font.xs, color: ds.text, fontWeight: font.weightMedium, maxWidth: 62 },

  swipeWrap: { overflow: "hidden" },
  swipeActions: {
    ...StyleSheet.absoluteFill,
    flexDirection: "row",
    justifyContent: "flex-end",
  },
  swipeAction: { width: SWIPE_ACTION_WIDTH, alignItems: "center", justifyContent: "center" },

  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 12 },
  rowAvatar: { width: 55, height: 55, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  rowAvatarPlaceholder: { backgroundColor: ds.line },
  rowText: { flex: 1, gap: 3, minWidth: 0 },
  rowTitleRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  rowTitle: { fontSize: font.md + 1, fontWeight: font.weightMedium, color: ds.text, flexShrink: 1 },
  rowTitleUnread: { fontWeight: font.weightBold },
  rowSub: { fontSize: font.sm + 1, color: ds.textMuted },
  // Message preview reads bold while the conversation has unread messages -
  // same signal as rowTitleUnread above, just not previously applied here.
  // weightHeavy (800, a step past rowTitleUnread's 700), ds.text (the same
  // near-black the title itself uses, replacing rowSub's muted grey), and a
  // point larger than rowSub - all per follow-up requests for a stronger,
  // darker, slightly bigger unread preview. Bumped alongside rowSub's own
  // size so the relationship between the two stays the same.
  rowSubUnread: { fontWeight: font.weightHeavy, color: ds.text, fontSize: font.sm + 2 },
  unreadDot: { width: 9, height: 9, borderRadius: 999, backgroundColor: ds.accent },

  center: { paddingVertical: 44, alignItems: "center", gap: 6 },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text },
  emptyBody: { fontSize: font.sm, color: ds.textMuted, textAlign: "center", maxWidth: 260 },

  /* Guest panel - takes the whole page below the header. */
  guest: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingBottom: 90 },
  guestIcon: {
    width: 68, height: 68, borderRadius: 34, backgroundColor: ds.surfaceSunken,
    alignItems: "center", justifyContent: "center", marginBottom: 16,
  },
  guestTitle: { fontSize: font.lg, fontWeight: font.weightBold, color: ds.text, textAlign: "center" },
  guestBody: { marginTop: 6, fontSize: font.sm, color: ds.textMuted, textAlign: "center", lineHeight: 19, maxWidth: 280 },
  guestPrimary: {
    alignSelf: "stretch", marginTop: 22, height: 48, borderRadius: 999,
    backgroundColor: ds.accent, alignItems: "center", justifyContent: "center",
  },
  guestPrimaryText: { fontSize: 15, fontWeight: font.weightBold, color: "#FFFFFF" },
  guestSecondary: {
    alignSelf: "stretch", marginTop: 10, height: 48, borderRadius: 999,
    borderWidth: 1, borderColor: ds.line, alignItems: "center", justifyContent: "center",
  },
  guestSecondaryText: { fontSize: 15, fontWeight: font.weightBold, color: ds.text },
  pressed: { opacity: 0.85 },
});
