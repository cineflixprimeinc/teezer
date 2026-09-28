import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  SectionList,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { Avatar } from "@/components/Avatar";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import {
  inboxApi,
  GIFT_NOTIF_TYPES,
  SYSTEM_NOTIF_TYPES,
  type InboxNotification,
} from "@/api/inbox.api";
import { videoApi } from "@/api/video.api";
import { suggestionApi } from "@/api/suggestion.api";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import type { RootStackParamList } from "@/navigation/types";

/** User-supplied illustrations (1024x1024 RGBA), one per scope. System has none
 *  yet and stays text-only; adding it is a single line in SCOPES below. */
const ART = {
  activity: require("../../assets/empty-activity.png"),
  gifts: require("../../assets/empty-gifts.png"),
} as const;
import { navigateToDeepLink } from "@/navigation/deep-links";
import { usePostViewer } from "@/store/post-viewer.store";
import { formatWeekdayShort, formatMonthDay } from "@/utils/date-format";

/**
 * The three feeds behind the inbox's pinned rows, over GET /notifications.
 *
 * One screen rather than three: they differ in which slice they take and how a
 * row is dressed, not in what a row IS. Splitting them would be three copies of
 * the same paginated list, drifting apart on the next change.
 *
 *   activity - actor avatars with a kind badge, kind chips, inline Follow,
 *              and suggested accounts at the tail.
 *   system   - Reelsoo speaking: neutral tiles, category chips, date sections,
 *              NEW pills, and a standing anti-phishing notice.
 *   gifts    - the same dressing as system, gift-marked.
 *
 * A colour circle reads as "a person did this"; a neutral tile reads as "this is
 * from Reelsoo". That distinction is the reason both dressings exist.
 */

export type NotifScope = "activity" | "gifts" | "system";

/**
 * Activity chips - the prototype's own `KINDS` map, in its order.
 *
 * "Tagged" is its own chip, separate from "Mentions" - a tag ("Tag people" /
 * "Paid partnership", explicit media tagging with an accept/decline step)
 * and a mention (@username typed into a caption/comment) are different
 * actions with different notification types; conflating them here would put
 * "Alex tagged you in a video" under a "Mentions" filter, which is exactly
 * the wrong bucket for something that isn't a mention at all.
 */
const CHIPS: { key: string; types: string[] | null }[] = [
  { key: "All", types: null },
  { key: "Likes", types: ["like", "comment_like"] },
  { key: "Comments", types: ["comment", "reply"] },
  { key: "Mentions", types: ["mention", "story_mention"] },
  { key: "Tagged", types: [
    "tag_request", "tag_request_accepted", "tag_request_rejected",
    "collab_request", "collab_request_accepted", "collab_request_rejected",
  ] },
  { key: "Followers", types: ["follow", "follow_request"] },
  { key: "Spaces", types: ["space"] },
];

/**
 * What the ACTIVITY scope does not show.
 *
 * `system` and `gift` have their own scopes below, so leaving them in would show
 * the same item twice with two unread counts that disagree. `profile_view` has
 * its own list on the Profile tab and is high-volume, low-signal here - a view
 * is not something you can act on, so it would bury the likes and follows this
 * feed exists for.
 */
/** Activity is engagement only: anything the Gifts or System rows own is
 *  excluded here, or it would be counted and listed in two places at once. */
const NOT_ACTIVITY = (t: string) =>
  SYSTEM_NOTIF_TYPES.has(t) || GIFT_NOTIF_TYPES.has(t) || t === "profile_view";

/**
 * Client-side grouping for system notices.
 *
 * The server sends no category - a system notification is `type: "system"` with
 * an `entity_type` like `admin_action`, nothing finer. These rules classify on
 * the app side, reading entity_type first and the message only as a fallback.
 * Anything unrecognised lands in Updates rather than disappearing, which is the
 * property that matters: this filter may be imprecise, it must never hide.
 *
 * A `category` field on the notification is the real fix.
 */
const SYSTEM_RULES: { key: string; test: RegExp }[] = [
  { key: "Security", test: /login|password|device|session|security|2fa|verif|suspicious/i },
  { key: "Policy", test: /policy|guideline|terms|violation|strike|appeal|ban|moderat|copyright/i },
  { key: "Events", test: /event|tournament|space|live|contest|challenge/i },
];

function systemCategory(n: { entity_type?: string | null; message?: string }): string {
  const hay = (n.entity_type ?? "") + " " + (n.message ?? "");
  return SYSTEM_RULES.find((r) => r.test.test(hay))?.key ?? "Updates";
}

/**
 * A stats digest rather than a product announcement. Checked only WITHIN the
 * Updates bucket, never across all of them - a security notice reading "report
 * suspicious activity" is not a report, and must keep its own mark and its own
 * "Review devices" action.
 */
function isReport(n: { message?: string }): boolean {
  return /report|analytics|insight|summary of your/i.test(n.message ?? "");
}

type ScopeCfg = {
  title: string;
  chips: string[] | null;
  /** Neutral rounded tiles instead of the prototype's colour circles. */
  tiles: boolean;
  /** Group rows under Today / This week / This month / Earlier. */
  sections: boolean;
  keep: (type: string) => boolean;
  emptyTitle: string;
  emptyBody: string;
  /** Standing notice pinned under the list. */
  footer?: string;
  /** Illustration for the empty state. Omitted = text only. */
  art?: number;
};

const SCOPES: Record<NotifScope, ScopeCfg> = {
  activity: {
    title: "Activity & new followers",
    chips: CHIPS.map((c) => c.key),
    tiles: false,
    sections: true,
    keep: (t) => !NOT_ACTIVITY(t),
    emptyTitle: "Nothing here",
    emptyBody: "Likes, comments and new followers will show up here.",
    art: ART.activity,
  },
  gifts: {
    title: "Gifts & coins",
    chips: null,
    tiles: true,
    sections: true,
    // The wallet writes gift_received / gift_sent / coin_purchase, so a bare
    // "gift" matched nothing and this scope always opened empty.
    keep: (t) => GIFT_NOTIF_TYPES.has(t),
    emptyTitle: "No gifts yet",
    emptyBody: "Gifts people send you will show up here.",
    art: ART.gifts,
  },
  system: {
    title: "System notifications",
    chips: ["All", "Updates", "Security", "Events", "Policy"],
    tiles: true,
    sections: true,
    // Everything Reelsoo itself raises - announcements, security, payments,
    // verification, and anything sent from the admin panel - not just the bare
    // "system" type, which is what left admin notices sitting in Activity.
    keep: (t) => SYSTEM_NOTIF_TYPES.has(t),
    emptyTitle: "Nothing from Teezer",
    emptyBody: "Account, security and product updates will show up here.",
    footer:
      "Teezer will never ask for your password or coins in a message. Official notices only appear here.",
  },
};

/** Every type mark takes a colour and a size: white at 18 inside a colour
 *  circle, white at 11 as the corner badge on an avatar. */
type MarkProps = { c: string; s?: number };
type Mark = (p: MarkProps) => React.ReactElement;

/* ── glyphs ─────────────────────────────────────────────────────────────── */

function ChevronLeftGlyph() {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Header right - opens notification preferences. */
function SettingsGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3.4} stroke={ds.text} strokeWidth={1.9} />
      <Path
        d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4 17 7M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4"
        stroke={ds.text}
        strokeWidth={1.9}
        strokeLinecap="round"
      />
    </Svg>
  );
}

/** Lucide `shield-alert` - the anti-phishing notice under the system feed.
 *  A warning shield, not an info circle: this notice is a caution, not a tip. */
function ShieldAlertGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        stroke={ds.textMuted}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M12 8v4" stroke={ds.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 16h.01" stroke={ds.textMuted} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Marks take a colour: white on a colour circle, ink on a neutral tile. */
function HeartMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24">
      <Path
        d="M12 20.9c-.55 0-1.08-.22-1.47-.6-3.5-3.38-8.13-7.6-8.13-11.9C2.4 5.05 5.1 2.5 8.45 2.5c1.42 0 2.66.5 3.55 1.35.89-.85 2.13-1.35 3.55-1.35 3.35 0 6.05 2.55 6.05 5.9 0 4.3-4.63 8.52-8.13 11.9-.39.38-.92.6-1.47.6Z"
        fill={c}
      />
    </Svg>
  );
}

function UserPlusMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Circle cx={9} cy={8.5} r={3.4} stroke={c} strokeWidth={2} />
      <Path d="M2.8 19.5c0-3.2 2.8-5.4 6.2-5.4s6.2 2.2 6.2 5.4" stroke={c} strokeWidth={2} strokeLinecap="round" />
      <Path d="M18.5 7.5v6M15.5 10.5h6" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function CommentMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20.5 11.5c0 4-3.8 7.2-8.5 7.2-.8 0-1.6-.1-2.3-.3l-4.2 2.1.9-3.3c-1.5-1.3-2.4-3.1-2.4-5.1 0-4 3.8-7.2 8.5-7.2s8 3.2 8 6.6Z"
        stroke={c}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function MicMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M12 3.5a2.6 2.6 0 0 1 2.6 2.6v5.4a2.6 2.6 0 1 1-5.2 0V6.1A2.6 2.6 0 0 1 12 3.5Z" stroke={c} strokeWidth={2} />
      <Path d="M5.8 11.2a6.2 6.2 0 0 0 12.4 0M12 17.4V21" stroke={c} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function BellMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6.2 9.4a5.8 5.8 0 0 1 11.6 0c0 5 2 6.4 2 6.4H4.2s2-1.4 2-6.4ZM10.3 19.5a2 2 0 0 0 3.4 0"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function GiftMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Rect x={3.8} y={9.2} width={16.4} height={11.3} rx={1.4} stroke={c} strokeWidth={2} />
      <Path d="M3 13h18M12 9.2V20.5" stroke={c} strokeWidth={2} strokeLinecap="round" />
      <Path
        d="M12 9.2S10.8 3.5 8.2 3.5a2.4 2.4 0 0 0 0 5.7zM12 9.2s1.2-5.7 3.8-5.7a2.4 2.4 0 0 1 0 5.7z"
        stroke={c}
        strokeWidth={2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/* The system marks below are Lucide, drawn as the set does: stroke-width 2 on
   the 24 viewBox, round caps and joins, fill none. */

/** Lucide `shield-check` - security notices. */
function ShieldMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="m9 12 2 2 4-4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Lucide `file-text` - policy and guideline notices. */
function DocMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path d="M14 2v4a2 2 0 0 0 2 2h4" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M16 13H8M16 17H8M10 9H8" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Lucide `radio` - events, tournaments and anything live. */
function BroadcastMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M16.247 7.761a6 6 0 0 1 0 8.478" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M19.075 4.933a10 10 0 0 1 0 14.134" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4.925 19.067a10 10 0 0 1 0-14.134" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M7.753 16.239a6 6 0 0 1 0-8.478" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Circle cx={12} cy={12} r={2} stroke={c} strokeWidth={2} />
    </Svg>
  );
}

/** Lucide `chart-column` - reports and analytics. */
function ChartMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3v16a2 2 0 0 0 2 2h16" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M18 17V9M13 17V5M8 17v-3" stroke={c} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Lucide `sparkles` - product updates, the default system mark. */
function SparklesMark({ c, s = 18 }: MarkProps) {
  return (
    <Svg width={s} height={s} viewBox="0 0 24 24" fill="none">
      <Path
        d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"
        stroke={c}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Colour circle: which mark, and the tint behind it - the prototype's palette. */
function badgeFor(type: string | undefined): { bg: string; Mark: Mark } {
  const t = type ?? "";
  if (t === "like" || t === "comment_like") return { bg: ds.accent, Mark: HeartMark };
  if (t === "follow" || t === "follow_request") return { bg: "#3C7DF2", Mark: UserPlusMark };
  if (t === "comment" || t === "reply") return { bg: "#2BC48A", Mark: CommentMark };
  if (t === "space") return { bg: "#F2884B", Mark: MicMark };
  if (t === "gift") return { bg: "#F5B93B", Mark: GiftMark };
  return { bg: "#8A6BF2", Mark: BellMark };
}

/** Neutral tile: the mark follows the notice's CATEGORY, not its type - every
 *  system notification shares one type, so the type carries no information. */
function tileMarkFor(n: InboxNotification): Mark {
  if (n.type === "gift") return GiftMark;
  switch (systemCategory(n)) {
    case "Security":
      return ShieldMark;
    case "Policy":
      return DocMark;
    case "Events":
      return BroadcastMark;
    default:
      // Finer than the chip, and scoped the same way the action is.
      return isReport(n) ? ChartMark : SparklesMark;
  }
}

function ago(iso?: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 604800) return formatWeekdayShort(iso);
  return formatMonthDay(iso);
}

/**
 * The message arrives as one sentence beginning with the actor's name. Split it
 * so the name can be bold without the server sending it twice - and fall back to
 * the whole string when the name is not the prefix, rather than slicing at a
 * position that might not exist.
 */
function splitMessage(n: InboxNotification): { who: string; rest: string } {
  const msg = n.message ?? "";

  // The server writes the whole sentence, including the aggregation:
  // "sunita.eats and 2,418 others liked your reel". Splitting is only so the
  // leading name can be bold - try BOTH name and username, because
  // displayMessage() builds the sentence from actor names which need not match
  // this actor row's `name`.
  for (const who of [n.actor?.name, n.actor?.username]) {
    if (who && msg.startsWith(who)) return { who, rest: msg.slice(who.length).trimStart() };
  }

  // Never return a `who` that isn't actually the message's prefix. The row
  // renders `who` followed by `rest`, so doing that printed the name twice and
  // pushed the "and N others" count past the two-line clamp - which is exactly
  // why the count looked missing.
  return { who: "", rest: msg };
}

/**
 * Last-resort sentence when the server sent none.
 *
 * The Go backend's aggregation verb map is not in sync with Laravel's - it is
 * missing entries PHP has - so those types come back with an EMPTY message
 * through Go and a correct one through Laravel. Rather than render a blank row,
 * rebuild the sentence from the actor and the count the payload does carry.
 */
function fallbackMessage(n: InboxNotification): string {
  const who = n.actor?.name || n.actor?.username || "Someone";
  const others = Math.max(0, (n.actor_count ?? 1) - 1);
  const subject =
    others === 0 ? who : others === 1 ? `${who} and 1 other` : `${who} and ${others.toLocaleString()} others`;
  return `${subject} sent you a notification`;
}

/** Buckets, newest first. The row itself carries the weekday ("Tue", "Mon"),
 *  so the header only has to say how far back you are looking. */
const SECTION_ORDER = ["Today", "This week", "This month", "Earlier"];

function sectionFor(iso?: string | null): string {
  if (!iso) return "Earlier";
  const days = (Date.now() - new Date(iso).getTime()) / 86_400_000;
  if (days < 1) return "Today";
  if (days < 7) return "This week";
  if (days < 31) return "This month";
  return "Earlier";
}

/**
 * The red call-to-action under a notice.
 *
 * Only rendered where the app actually has somewhere to send you. The API
 * carries no action label or target - no `action_url`, no deep link - so these
 * are derived from the notice's category, and a category with no destination
 * gets no link rather than a dead one.
 */
function actionFor(n: InboxNotification): { label: string; route?: string } | null {
  if (n.type !== "system") return null;
  switch (systemCategory(n)) {
    case "Security":
      return { label: "Review devices", route: "ActiveSessions" };
    case "Policy":
      return { label: "Read summary", route: "Policies" };
    default:
      // Events ("Set reminder") and Updates ("Open report" / "See what's new")
      // used to render here as accent-styled text with no destination - a link
      // that did nothing, dressed exactly like the working ones above. A call
      // to action with nowhere to go is not rendered at all.
      return null;
  }
}

/** Unread AND recent - an old unread notice is not "new", it is just unread.
 *  Freshness is the group's latest activity (`updated_at` carries the server's
 *  latest_activity_at), the same clock the sections sort by - otherwise a
 *  group bumped today but first opened weeks ago showed a grey dot under a
 *  Today header. */
function isNew(n: InboxNotification) {
  const at = n.updated_at ?? n.created_at;
  if (n.is_read || !at) return false;
  return (Date.now() - new Date(at).getTime()) / 86_400_000 < 2;
}

export function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "Notifications">>();
  const qc = useQueryClient();
  const [chip, setChip] = useState("All");

  const scope: NotifScope = route.params?.scope ?? "activity";
  const cfg = SCOPES[scope];

  const q = useInfiniteQuery({
    queryKey: ["notifications-feed"],
    queryFn: ({ pageParam }) => inboxApi.notificationsPage(pageParam as number, 20),
    initialPageParam: 1,
    // notificationsPage resolves to { items, hasMore, page } - it has already
    // unwrapped the envelope. Reading `meta`/`data` off it yields an empty list.
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    staleTime: 20_000,
  });

  const rows: InboxNotification[] = useMemo(() => {
    const all = (q.data?.pages ?? []).flatMap((p) => p.items)
      // Newest activity first, always. The server already orders this way, but
      // pages arrive separately and a group bumped after page 1 was fetched
      // would otherwise sit wherever its page landed.
      .sort((a, b) => {
        const ta = Date.parse(a.updated_at ?? a.created_at);
        const tb = Date.parse(b.updated_at ?? b.created_at);
        return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
      });
    const inScope = all.filter((n) => cfg.keep(n.type));
    if (!cfg.chips || chip === "All") return inScope;
    // Activity chips select by notification type; system chips select by the
    // client-side category, since the server does not send one.
    if (scope === "system") return inScope.filter((n) => systemCategory(n) === chip);
    const want = CHIPS.find((c) => c.key === chip)?.types;
    return want ? inScope.filter((n) => want.includes(n.type)) : inScope;
  }, [q.data, chip, cfg, scope]);

  /**
   * When a notification last had activity.
   *
   * `updated_at` is the server's `latest_activity_at`, which an aggregated group
   * bumps every time a new actor joins it. `created_at` is when the group first
   * opened, and grouping on that filed a just-bumped group under "Earlier" while
   * the server had it at the top - so a brand-new like on an old post appeared
   * buried. Newest activity is what "new" means here.
   */
  const freshness = (n: InboxNotification) => n.updated_at ?? n.created_at;

  /** Rows grouped by recency, empty buckets dropped. */
  const sections = useMemo(() => {
    if (!cfg.sections) return [];
    const by = new Map<string, InboxNotification[]>();
    for (const n of rows) {
      const k = sectionFor(freshness(n));
      const list = by.get(k);
      if (list) list.push(n);
      else by.set(k, [n]);
    }
    return SECTION_ORDER
      .filter((k) => (by.get(k)?.length ?? 0) > 0)
      .map((k) => ({ title: k, data: by.get(k) as InboxNotification[] }));
  }, [rows, cfg.sections]);

  /** Local follow overrides so the inline button answers instantly. */
  const [followMap, setFollowMap] = useState<Record<string, boolean>>({});
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());

  const toggleFollow = useCallback(
    (n: InboxNotification) => {
      const u = n.actor?.username;
      if (!u) return;
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => toggleFollow(n));
        return;
      }
      const next = !(followMap[u] ?? false);
      setFollowMap((m) => ({ ...m, [u]: next }));
      (next ? videoApi.follow(u) : videoApi.unfollow(u)).catch(() =>
        setFollowMap((m) => ({ ...m, [u]: !next })),
      );
    },
    [followMap],
  );

  /** Local "Tag people" / "Paid partnership" collab approval overrides,
   *  keyed by notification id, so the inline Accept/Decline row answers
   *  instantly instead of waiting on a refetch - same reasoning as
   *  followMap above. One map + one responder for both request types,
   *  since they're the identical accept/decline shape - only which API
   *  pair to call differs. */
  const [tagRequestMap, setTagRequestMap] = useState<Record<number, "approved" | "rejected">>({});

  const respondTagRequest = useCallback(
    (n: InboxNotification, decision: "approved" | "rejected") => {
      if (!n.entity_id) return;
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => respondTagRequest(n, decision));
        return;
      }
      setTagRequestMap((m) => ({ ...m, [n.id]: decision }));
      const isCollab = n.type === "collab_request";
      (decision === "approved"
        ? (isCollab ? inboxApi.acceptCollabRequest(n.entity_id) : inboxApi.acceptTagRequest(n.entity_id))
        : (isCollab ? inboxApi.declineCollabRequest(n.entity_id) : inboxApi.declineTagRequest(n.entity_id))
      ).catch(() => {
        setTagRequestMap((m) => {
          const next = { ...m };
          delete next[n.id];
          return next;
        });
      });
    },
    [],
  );

  /** Flips once the server confirms - shown only after the mark-all-read call
   *  actually succeeds, so the label never claims "done" while the server
   *  still has everything unread (which used to bring the badge count right
   *  back on the next poll). */
  const [markedAll, setMarkedAll] = useState(false);

  const markAllRead = useCallback(() => {
    void inboxApi
      .markAllNotificationsReadStrict()
      .then(() => {
        setMarkedAll(true);
        void q.refetch();
        // The inbox's pinned rows and the tab badge read the same feed.
        void qc.invalidateQueries({ queryKey: ["inbox-notifications"] });
        void qc.invalidateQueries({ queryKey: ["notificationsUnreadBadge"] });
        void qc.invalidateQueries({ queryKey: ["inboxNotifPopupList"] });
      })
      .catch(() => {
        // The server still has these unread - don't claim "All read" or
        // invalidate the badge, or it would only refetch the same count back.
      });
  }, [q, qc]);

  /**
   * Flip rows to read (or, on `read: false`, back to unread) in the cached feed.
   *
   * Written straight into the query's own pages rather than refetched: the list
   * the user is looking at must not reorder or jump under them, and the badges
   * on the Inbox read this same feed, so correcting it here corrects both. The
   * `false` direction undoes an optimistic flip when the server call behind it
   * failed - otherwise the row keeps claiming "read" on-device while the server
   * still has it unread.
   */
  const markReadLocally = useCallback(
    (ids: number[], read = true) => {
      if (ids.length === 0) return;
      const set = new Set(ids);
      qc.setQueryData(["notifications-feed"], (cur: typeof q.data) =>
        cur
          ? {
              ...cur,
              pages: cur.pages.map((p) => ({
                ...p,
                items: p.items.map((n) => (set.has(n.id) ? { ...n, is_read: read } : n)),
              })),
            }
          : cur,
      );
      // The Inbox's per-menu badges count unread rows off this same feed - and
      // so do the tab-bar badge and the popup nudge. All three have to be
      // told, or reading a single row left the tab badge counting it until its
      // next poll while the list below had already dropped it.
      void qc.invalidateQueries({ queryKey: ["inbox-notifications"] });
      void qc.invalidateQueries({ queryKey: ["notificationsUnreadBadge"] });
      void qc.invalidateQueries({ queryKey: ["inboxNotifPopupList"] });
    },
    [qc, q.data],
  );

  /** One notification, read because it was opened. */
  const markRead = useCallback(
    (n: InboxNotification) => {
      if (n.is_read) return;
      markReadLocally([n.id]);
      void inboxApi.markNotificationRead(n.id).catch(() => {
        // The server never got this - undo the optimistic flip so the row
        // doesn't keep claiming it's read when it isn't.
        markReadLocally([n.id], false);
      });
    },
    [markReadLocally],
  );

  /* Opening a category IS reading it.
   *
   * Keyed off the SCOPE, not the visible rows: the chips filter the same menu,
   * and "Likes" should not leave "Comments" unread when the user opened the one
   * menu that holds both. Ids already sent are remembered so a later page - or
   * any re-render - re-sends nothing, while rows that arrive from scrolling
   * still get marked as they appear. */
  const sentIds = useRef<Set<number>>(new Set());
  useEffect(() => {
    const unread = (q.data?.pages ?? [])
      .flatMap((p) => p.items)
      .filter((n) => cfg.keep(n.type) && !n.is_read && !sentIds.current.has(n.id))
      .map((n) => n.id);
    if (unread.length === 0) return;
    unread.forEach((id) => sentIds.current.add(id));
    markReadLocally(unread);
    void inboxApi.markNotificationsRead(unread).catch(() => {
      // The server never got these - undo the optimistic flip AND forget we
      // sent them, so the next pass through this effect retries them.
      unread.forEach((id) => sentIds.current.delete(id));
      markReadLocally(unread, false);
    });
  }, [q.data, cfg, markReadLocally]);

  /* Opening a menu clears ITS OWN badge outright, once per visit - scoped to
   * that menu's types, so opening System never wipes Activity's unread state
   * (and vice versa). It used to call the bare mark-everything endpoint, which
   * zeroed every other menu's badge for content the user never saw.
   *
   * Why clear at all, when the pass above marks loaded rows? The pass can only
   * reach rows actually LOADED - 20 per page - while the Inbox counts across
   * the 50 it fetches. Opening the menu is the user saying they have seen it,
   * so the feed is cleared server-side rather than row by row.
   *
   * The three invalidations are the Inbox's pinned rows, the tab-bar badge and
   * the popup list - all three read this same feed, so all three have to be
   * told, or one of them keeps showing a number the others have dropped. */
  const clearedRef = useRef(false);
  useEffect(() => {
    if (clearedRef.current) return;
    clearedRef.current = true;
    const systemTypes = [...SYSTEM_NOTIF_TYPES];
    const giftTypes = [...GIFT_NOTIF_TYPES];
    const scopeClear =
      scope === "system"
        ? { types: systemTypes }
        : scope === "gifts"
          ? { types: giftTypes }
          : { excludeTypes: [...systemTypes, ...giftTypes, "profile_view"] };
    inboxApi
      .markAllNotificationsReadStrict(scopeClear)
      .then(() => {
        void qc.invalidateQueries({ queryKey: ["inbox-notifications"] });
        void qc.invalidateQueries({ queryKey: ["notificationsUnreadBadge"] });
        void qc.invalidateQueries({ queryKey: ["inboxNotifPopupList"] });
      })
      .catch(() => {
        // The server still has these unread, so DON'T invalidate - refetching
        // would only pull the same count back and make the badge flicker. Allow
        // a retry on the next visit instead of pretending this worked.
        clearedRef.current = false;
      });
  }, [qc, scope]);

  /* ── suggested accounts ───────────────────────────────────────────────────
   * Tail of the activity feed only. A notification list has a natural floor,
   * and landing on "that's everything" with nothing to do next is a dead end -
   * the same recommender that backs the Suggested tab fills it. */
  const suggestQ = useQuery({
    queryKey: ["activity-suggestions"],
    queryFn: () => suggestionApi.profiles("friends", 8),
    enabled: scope === "activity" && !!useAuthStore.getState().user,
    staleTime: 5 * 60_000,
  });
  const suggestions = (suggestQ.data ?? []).filter((p) => !dismissed.has(p.id));

  const followSuggestion = useCallback(
    (id: number, username: string) => {
      if (!useAuthStore.getState().user) {
        useAuthGate.getState().open(() => followSuggestion(id, username));
        return;
      }
      const next = !(followMap[username] ?? false);
      setFollowMap((m) => ({ ...m, [username]: next }));
      (next ? videoApi.follow(username) : videoApi.unfollow(username)).catch(() =>
        setFollowMap((m) => ({ ...m, [username]: !next })),
      );
      if (next) suggestionApi.markFollowed(id);
    },
    [followMap],
  );

  const renderRow = (n: InboxNotification) => {
    const { bg, Mark } = badgeFor(n.type);
    const TileMark = tileMarkFor(n);
    const { who, rest } = splitMessage(n);
    const line = rest || fallbackMessage(n);
    const isFollow = n.type === "follow" || n.type === "follow_request";
    const following = followMap[n.actor?.username ?? ""] ?? false;
    const isTagRequest = n.type === "tag_request" || n.type === "collab_request";
    const tagDecision = tagRequestMap[n.id] ?? (n.action_status === "approved" || n.action_status === "rejected" ? n.action_status : null);
    const fresh = isNew(n);
    const action = actionFor(n);

    return (
      <Pressable
        style={styles.row}
        accessibilityRole="button"
        onPress={() => {
          // Opening one is reading it.
          markRead(n);
          // Comment-anchored notices first: the server's /comment/{id} link is
          // still "pending" on mobile, but when the row carries the reel it
          // belongs to, raise the post viewer on THAT reel instead of
          // dead-ending on the feed.
          if (n.target_reel_id) {
            usePostViewer.getState().showVideo(n.target_reel_id);
            return;
          }
          if (n.deep_link && navigateToDeepLink(n.deep_link)) return;
          // Older rows predate the field; fall back to the actor.
          if (n.actor?.username) {
            navigation.push("UserProfile", { username: n.actor.username });
            return;
          }
          // Actor-less rows old enough to predate deep_link used to be dead
          // taps - silent, not even feedback. Their home is the System feed,
          // so land there rather than nowhere.
          if (SYSTEM_NOTIF_TYPES.has(n.type)) {
            navigation.navigate("Notifications", { scope: "system" });
          }
        }}
      >
        {cfg.tiles ? (
          <View style={styles.tile}>
            <TileMark c={ds.text} />
          </View>
        ) : (
          /* The person, not the verb. Their face identifies the notification
             far faster than a coloured icon does; the icon shrinks to a corner
             badge so you can still tell a like from a comment at a glance. */
          <View style={styles.avatarWrap}>
            {/* The app's shared Avatar: photo when there is one, the same
                neutral silhouette for everyone when there is not. */}
            <Avatar uri={n.actor?.avatar} style={styles.avatar} />
            <View style={[styles.typeBadge, { backgroundColor: bg }]}>
              <Mark c="#fff" s={11} />
            </View>
          </View>
        )}

        <View style={styles.rowText}>
          <View style={styles.titleRow}>
            {/* `who` and the sentence that follows are separate Text nodes
                (not one, split by literal " ") so the verified check - a
                react-native-svg component - can sit between them as a real
                flex sibling: RN can't reliably nest a non-text component
                like VerifiedBadge inside a Text. Wrapping them together in
                a flexWrap row (rather than the avatar's corner, where this
                used to ride) is what lets it land right after the name, in
                the reading order, instead of floating over the photo. */}
            <View style={styles.titleTextWrap}>
              {!!who && <Text style={[cfg.tiles ? styles.tileTitle : styles.line, styles.who]}>{who}</Text>}
              {n.actor?.is_verified && <VerifiedBadge size={13} />}
              <Text style={cfg.tiles ? styles.tileTitle : styles.line} numberOfLines={isTagRequest ? undefined : 2}>
                {cfg.tiles ? n.message || line : line}
              </Text>
            </View>
            {fresh && (
              <View style={styles.newPill}>
                <Text style={styles.newPillText}>NEW</Text>
              </View>
            )}
          </View>

          {/* Only notices that actually carry a body get one. */}
          {cfg.tiles && !!n.message_preview && n.message_preview !== n.message && (
            <Text style={styles.body} numberOfLines={2}>
              {n.message_preview}
            </Text>
          )}

          {/* Time and its call-to-action share a line, as the design has it. */}
          <View style={styles.metaRow}>
            <Text style={styles.sub}>{ago(n.created_at)}</Text>
            {!!action &&
              (action.route ? (
                <Pressable
                  hitSlop={6}
                  accessibilityRole="link"
                  accessibilityLabel={action.label}
                  onPress={() => navigation.navigate("SettingsShell", { screen: action.route })}
                >
                  <Text style={styles.action}>{action.label}</Text>
                </Pressable>
              ) : (
                <Text style={styles.action}>{action.label}</Text>
              ))}
          </View>

          {/* Tag-people / collab approval - Accept/Decline BELOW the message
              (not squeezed beside it on the same row, which is what was
              clipping the text down to a couple of words) - own row, full
              width, so the sentence above always has room to read in full. */}
          {isTagRequest &&
            (tagDecision ? (
              <Text style={tagDecision === "approved" ? styles.tagDecisionAccepted : styles.tagDecisionDeclined}>
                {tagDecision === "approved" ? "Accepted" : "Declined"}
              </Text>
            ) : (
              <View style={styles.tagActionRow}>
                <Pressable
                  onPress={() => respondTagRequest(n, "rejected")}
                  accessibilityRole="button"
                  accessibilityLabel={n.type === "collab_request" ? "Decline collab" : "Decline tag"}
                  style={[styles.followBtn, styles.followBtnOn]}
                >
                  <Text style={styles.followTextOn}>Decline</Text>
                </Pressable>
                <Pressable
                  onPress={() => respondTagRequest(n, "approved")}
                  accessibilityRole="button"
                  accessibilityLabel={n.type === "collab_request" ? "Accept collab" : "Accept tag"}
                  style={[styles.followBtn, styles.followBtnOff]}
                >
                  <Text style={styles.followTextOff}>Accept</Text>
                </Pressable>
              </View>
            ))}
        </View>

        {/* The related post's own thumbnail, whenever the server could
            resolve one - now also covers tag/collab requests (their video
            comes from the tagged comment_mention row, same as a reply's
            comes from its parent comment; see NotificationController's
            attachCommentVideoIds/thumbnail batch), not just direct likes/
            comments on a video. The whole row is already one Pressable, so
            tapping the thumbnail opens the same video the rest of the row
            does - no separate handler needed. */}
        {!isFollow && !cfg.tiles && !!n.thumbnail && (
          <Image source={{ uri: n.thumbnail }} style={styles.thumb} contentFit="cover" transition={120} />
        )}

        {isFollow && (
          <Pressable
            onPress={() => toggleFollow(n)}
            accessibilityRole="button"
            style={[styles.followBtn, following ? styles.followBtnOn : styles.followBtnOff]}
          >
            <Text style={following ? styles.followTextOn : styles.followTextOff}>
              {following ? "Following" : "Follow"}
            </Text>
          </Pressable>
        )}

        {/* Unread, but not recent enough for a pill - a quiet dot instead. */}
        {!n.is_read && !fresh && <View style={styles.dot} />}
      </Pressable>
    );
  };

  const suggestedBlock =
    scope === "activity" && suggestions.length > 0 ? (
      <View style={styles.suggestWrap}>
        <View style={styles.suggestHead}>
          <Text style={styles.suggestTitle}>Suggested accounts</Text>
          <Pressable
            hitSlop={8}
            accessibilityRole="button"
            onPress={() => navigation.navigate("SettingsShell", { screen: "SuggestedAccounts" })}
          >
            <Text style={styles.action}>See all</Text>
          </Pressable>
        </View>

        {suggestions.map((p) => {
          const on = followMap[p.username] ?? p.is_following;
          return (
            <View key={p.id} style={styles.suggestRow}>
              <Pressable
                style={styles.suggestLeft}
                accessibilityRole="button"
                onPress={() => navigation.push("UserProfile", { username: p.username })}
              >
                <Avatar uri={p.avatar} style={styles.suggestAvatar} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={styles.suggestNameRow}>
                    <Text style={styles.suggestName} numberOfLines={1}>
                      {p.display_name || p.username}
                    </Text>
                    {p.is_verified && <VerifiedBadge size={13} />}
                  </View>
                  <Text style={styles.suggestMeta} numberOfLines={1}>
                    {p.mutual_followers_count > 0
                      ? `${p.mutual_followers_count} mutual`
                      : `@${p.username}`}
                  </Text>
                </View>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                onPress={() => followSuggestion(p.id, p.username)}
                style={[styles.followBtn, on ? styles.followBtnOn : styles.followBtnOff]}
              >
                <Text style={on ? styles.followTextOn : styles.followTextOff}>
                  {on ? "Following" : "Follow"}
                </Text>
              </Pressable>

              <Pressable
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Dismiss suggestion"
                onPress={() => {
                  setDismissed((d) => new Set(d).add(p.id));
                  suggestionApi.dismiss(p.id);
                }}
              >
                <Text style={styles.dismissX}>×</Text>
              </Pressable>
            </View>
          );
        })}
      </View>
    ) : null;

  const empty = (
    <View style={styles.empty}>
      {/* No art on an ERROR - the illustration says "nothing here yet", which
          is the wrong thing to say when the fetch simply failed. */}
      {!!cfg.art && !q.isError && (
        <Image source={cfg.art} style={styles.emptyArt} contentFit="contain" transition={120} />
      )}
      <Text style={styles.emptyTitle}>{q.isError ? "Couldn't load this feed" : cfg.emptyTitle}</Text>
      <Text style={styles.emptyBody}>
        {q.isError
          ? "Pull down to try again."
          : chip !== "All"
            ? "Nothing matches this filter yet."
            : cfg.emptyBody}
      </Text>
    </View>
  );

  const notice = cfg.footer ? (
    <View style={styles.notice}>
      <ShieldAlertGlyph />
      <Text style={styles.noticeText}>{cfg.footer}</Text>
    </View>
  ) : null;

  const refresh = (
    <RefreshControl
      refreshing={q.isRefetching && !q.isFetchingNextPage}
      onRefresh={() => q.refetch()}
      tintColor={ds.textMuted}
    />
  );

  const onEnd = () => {
    if (q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  };

  const spinner = q.isFetchingNextPage ? (
    <View style={{ paddingVertical: 18 }}>
      <ActivityIndicator color={ds.accent} />
    </View>
  ) : null;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
        >
          <ChevronLeftGlyph />
        </Pressable>
        {/* One line, always. "Activity & new followers" is long enough to wrap
            beside the back arrow, Mark read and the gear - and a two-line header
            grows downward, swallowing the gap under it. */}
        <Text style={styles.title} numberOfLines={1}>
          {cfg.title}
        </Text>
        {/* Not gated on this scope's unread count any more: opening a menu marks
            what it lists as read, so that count is zero by the time the header
            renders and the action vanished the moment it became reachable. It
            clears EVERY category, including rows this scope never listed and
            pages not fetched yet, which is the thing the per-menu auto-mark
            cannot do. */}
        {rows.length > 0 && (
          <Pressable hitSlop={8} accessibilityRole="button" onPress={markAllRead}>
            <Text style={styles.markRead}>{markedAll ? "All read" : "Mark all as read"}</Text>
          </Pressable>
        )}
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Notification settings"
          onPress={() => navigation.navigate("SettingsShell", { screen: "NotificationSettings" })}
        >
          <SettingsGlyph />
        </Pressable>
      </View>

      {!!cfg.chips && (
        <View style={styles.chipsWrap}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {cfg.chips.map((key) => {
              const active = key === chip;
              return (
                <Pressable
                  key={key}
                  onPress={() => setChip(key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={[styles.chip, active ? styles.chipOn : styles.chipOff]}
                >
                  <Text style={[styles.chipText, active ? styles.chipTextOn : styles.chipTextOff]}>
                    {key}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {q.isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ds.accent} />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(n) => String(n.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 120 }}
          stickySectionHeadersEnabled={false}
          refreshControl={refresh}
          onEndReachedThreshold={0.5}
          onEndReached={onEnd}
          renderSectionHeader={({ section }) => (
            <Text style={styles.sectionHead}>{section.title.toUpperCase()}</Text>
          )}
          renderItem={({ item }) => renderRow(item)}
          ListEmptyComponent={empty}
          ListFooterComponent={
            <View>
              {spinner}
              {suggestedBlock}
              {rows.length > 0 ? notice : null}
            </View>
          }
        />
      )}
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
  },
  title: { flex: 1, fontSize: font.lg, fontWeight: font.weightBold, color: ds.text },
  markRead: { fontSize: font.sm, fontWeight: font.weightBold, color: ds.accent },

  // The chips need room to breathe under the title - butted up against it they
  // read as part of the header rather than as a filter over the list.
  chipsWrap: { paddingTop: 10, paddingBottom: 14 },
  chips: { gap: 8, paddingHorizontal: 16, alignItems: "center" },
  // Rounded rectangles, not pills: the design softens the corners but keeps the
  // sides straight, which is what makes a row of them read as a segmented
  // filter rather than a row of tags.
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 9, borderWidth: 1 },
  chipOn: { backgroundColor: "#17161A", borderColor: "#17161A" },
  chipOff: { backgroundColor: "#F6F5F8", borderColor: "#E9E6EE" },
  chipText: { fontSize: font.sm, fontWeight: font.weightMedium },
  chipTextOn: { color: "#FFFFFF", fontWeight: font.weightBold },
  chipTextOff: { color: "#6B6675" },

  sectionHead: {
    fontSize: font.xs,
    fontWeight: font.weightBold,
    letterSpacing: 0.9,
    color: ds.textMuted,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },

  /** Actor's face, with the notification kind riding its corner. */
  avatarWrap: { width: 52, height: 52 },
  avatar: { width: 52, height: 52, borderRadius: 999, backgroundColor: ds.surfaceSunken },
  typeBadge: {
    position: "absolute",
    right: -2,
    bottom: -2,
    width: 23,
    height: 23,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    // The ring is what separates the badge from the avatar under it.
    borderWidth: 2,
    borderColor: ds.surface,
  },

  /** Suggested accounts, at the tail of the activity feed. */
  suggestWrap: {
    marginTop: 8,
    paddingTop: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#EAE7EE",
  },
  suggestHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  suggestTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text },
  suggestRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 9,
  },
  suggestLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  suggestAvatar: { width: 48, height: 48, borderRadius: 999, backgroundColor: ds.surfaceSunken },
  suggestNameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  suggestName: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text, flexShrink: 1 },
  suggestMeta: { fontSize: font.sm, color: ds.textMuted, marginTop: 2 },
  dismissX: { fontSize: 20, color: ds.textMuted, lineHeight: 22 },
  /** Neutral and squared-off: this came from Reelsoo, not from a person. */
  tile: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F4F3F6",
    borderWidth: 1,
    borderColor: "#EAE7EE",
    alignItems: "center",
    justifyContent: "center",
  },

  rowText: { flex: 1, gap: 3, minWidth: 0 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  // `who`, the verified check and the rest of the sentence are separate
  // flex siblings here (see the render comment above) rather than one Text -
  // this is what lets them wrap together as a paragraph while still letting
  // a real (non-text) VerifiedBadge sit between two of them.
  titleTextWrap: { flex: 1, flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 4 },
  line: { fontSize: font.base, color: ds.text, lineHeight: 21 },
  tileTitle: { fontSize: font.base, fontWeight: font.weightBold, color: ds.text, lineHeight: 21 },
  who: { fontWeight: font.weightBold },
  body: { fontSize: font.md, color: ds.textMuted, lineHeight: 20 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 14, marginTop: 3 },
  sub: { fontSize: font.sm, color: ds.textMuted },
  /** The design's red call-to-action. Accent, not a button - it sits inline
   *  with the timestamp and must not compete with the title above it. */
  action: { fontSize: font.sm, fontWeight: font.weightBold, color: ds.accent },

  newPill: { backgroundColor: ds.accent, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2.5 },
  newPillText: { color: ds.onDark, fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 0.4 },

  thumb: { width: 42, height: 54, borderRadius: 6, backgroundColor: ds.surfaceSunken },

  followBtn: { paddingHorizontal: 15, paddingVertical: 9.5, borderRadius: 7 },
  followBtnOff: { backgroundColor: ds.accent },
  followBtnOn: { backgroundColor: "#F1EFF3" },
  followTextOff: { color: ds.onDark, fontSize: font.sm, fontWeight: font.weightBold },
  followTextOn: { color: "#4A4653", fontSize: font.sm, fontWeight: font.weightBold },

  tagActionRow: { flexDirection: "row", gap: 7, marginTop: 5 },
  tagDecisionAccepted: { color: ds.accent, fontSize: font.sm, fontWeight: font.weightBold },
  tagDecisionDeclined: { color: "#8A8592", fontSize: font.sm, fontWeight: font.weightBold },

  dot: { width: 8, height: 8, borderRadius: 999, backgroundColor: ds.accent, marginTop: 6 },

  /** Standing anti-phishing notice - deliberately quiet, and deliberately the
   *  last thing in the list rather than a dismissible banner. */
  notice: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    marginHorizontal: 16,
    marginTop: 20,
    padding: 13,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#EAE7EE",
    backgroundColor: "#FAFAFB",
  },
  noticeText: { flex: 1, fontSize: font.sm, color: ds.textMuted, lineHeight: 18 },

  center: { paddingTop: 60, alignItems: "center" },
  empty: { paddingTop: 28, paddingHorizontal: 30, alignItems: "center", gap: 6 },
  emptyArt: { width: 300, height: 300, marginBottom: -8 },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text },
  emptyBody: { fontSize: font.sm, color: ds.textMuted, textAlign: "center", lineHeight: 19 },
});
