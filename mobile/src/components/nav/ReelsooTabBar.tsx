import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable, StyleSheet, Dimensions, Animated, Easing } from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Path } from "react-native-svg";
import type { BottomTabBarProps } from "@react-navigation/bottom-tabs";
import { useQuery } from "@tanstack/react-query";
import { ds, tabPalette, radius, type as t } from "@/theme/design";
import { inboxApi, type InboxNotification } from "@/api/inbox.api";
import { useAuthStore } from "@/store/auth.store";
import { useSpeedBoost } from "@/store/speed-boost.store";

/**
 * The prototype's bottom bar.
 *
 * Glyphs are inline SVG rather than DsIcon, which only carries the stroke-
 * outline set. Home/Profile are Remix Icon (remixicon.com) fill glyphs -
 * transparent background, no stroke outline; Spaces/Inbox stayed on their
 * original supplied icons per explicit request.
 *
 * The bar inverts on Home: Home is full-bleed video, so a light opaque bar would
 * cut a slab out of the frame. `light` mirrors the design's `s.tab !== "home"`.
 */


/** Remix Icon `home-5-fill`, transparent bg, no stroke outline. */
function HomeGlyph({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill={color}>
      <Path d="M21 20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V9.48907C3 9.18048 3.14247 8.88917 3.38606 8.69972L11.3861 2.47749C11.7472 2.19663 12.2528 2.19663 12.6139 2.47749L20.6139 8.69972C20.8575 8.88917 21 9.18048 21 9.48907V20ZM11 13V19H13V13H11Z" />
    </Svg>
  );
}

/** Lucide `audio-waveform`, as supplied - reverted to this per explicit
 *  request (the Remix Icon `broadcast-fill` swap was not wanted here). One
 *  continuous stroke. */
function SpacesGlyph({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill="none">
      <Path
        d="M2 13a2 2 0 0 0 2-2V7a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0V4a2 2 0 0 1 4 0v13a2 2 0 0 0 4 0v-4a2 2 0 0 1 2-2"
        stroke={color}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Message-box glyph, as supplied - reverted to this per explicit request
 *  (the Remix Icon `chat-3-fill` swap was not wanted here). Fill-based like
 *  Home, not stroked. */
function InboxGlyph({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill={color}>
      <Path d="M6.45455 19L2 22.5V4C2 3.44772 2.44772 3 3 3H21C21.5523 3 22 3.44772 22 4V18C22 18.5523 21.5523 19 21 19H6.45455ZM5.76282 17H20V5H4V18.3851L5.76282 17ZM11 10H13V12H11V10ZM7 10H9V12H7V10ZM15 10H17V12H15V10Z" />
    </Svg>
  );
}

/** Remix Icon `user-3-fill`, transparent bg, no stroke outline. */
function ProfileGlyph({ color }: { color: string }) {
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24" fill={color}>
      <Path d="M20 22H4V20C4 17.2386 6.23858 15 9 15H15C17.7614 15 20 17.2386 20 20V22ZM12 13C8.68629 13 6 10.3137 6 7C6 3.68629 8.68629 1 12 1C15.3137 1 18 3.68629 18 7C18 10.3137 15.3137 13 12 13Z" />
    </Svg>
  );
}

const GLYPHS = {
  Home: HomeGlyph,
  Spaces: SpacesGlyph,
  Inbox: InboxGlyph,
  Profile: ProfileGlyph,
} as const;

type TabItem = { route: keyof typeof GLYPHS; label: string };

/** Create sits between Spaces and Inbox and is not a tab - it opens a sheet. */
const LEFT: TabItem[] = [
  { route: "Home", label: "Home" },
  { route: "Spaces", label: "Spaces" },
];
const RIGHT: TabItem[] = [
  { route: "Inbox", label: "Inbox" },
  { route: "Profile", label: "Profile" },
];

/** Unread-notification breakdown shown in the Inbox nudge.
 *
 *  One unread ROW counts once - the same semantics as the server's
 *  /notifications/unread-count and the tab badge ("one unread group == one
 *  card"). Counting actor_count here instead made the pill disagree with the
 *  badge it sits under: "Rahul and 17 others liked…" added 18 to the pill but
 *  1 to the badge, both visible at the same time. */
type NotifSummary = {
  likes: number;
  comments: number;
  mentions: number;
  followers: number;
  other: number;
  /** Unread DMs - sourced separately from ["messagesUnreadBadge"], not from
   *  the /notifications feed deriveNotifSummary reads below. */
  messages: number;
  total: number;
};

function deriveNotifSummary(items: InboxNotification[]): NotifSummary {
  let likes = 0, comments = 0, mentions = 0, followers = 0;
  for (const n of items) {
    if (n.is_read) continue;
    switch (n.type) {
      case "like": likes += 1; break;
      case "comment": comments += 1; break;
      case "mention": case "story_mention": mentions += 1; break;
      case "follow": case "follow_request": followers += 1; break;
    }
  }
  // messages: 0 here - DMs aren't in this feed, the caller merges them in
  // from ["messagesUnreadBadge"] separately.
  return { likes, comments, mentions, followers, other: 0, messages: 0, total: likes + comments + mentions + followers };
}

/** The nudge's rows, in display order. Each renders ONLY when its count is > 0,
 *  so the pill shows just the types the user actually has. `other` catches
 *  unread rows that are none of the four engagement kinds - gifts, system
 *  notices, profile views - which used to be forced into the LIKES bucket by
 *  the fallback below, labelling a security notice with a heart. */
const POPUP_ROWS = [
  // Same bubble-with-dots shape as InboxGlyph above - this row is DMs, so it
  // reuses the Inbox tab's own mark rather than a new one.
  { key: "messages", d: ["M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719", "M8 12h.01M12 12h.01M16 12h.01"] },
  { key: "comments", d: ["M21 11.5a8.4 8.4 0 0 1-9 8.4L3 21l1.1-9A8.4 8.4 0 1 1 21 11.5Z"] },
  { key: "mentions", d: ["M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z", "M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.9 7.9"] },
  { key: "likes", d: ["M19 14c1.5-1.5 3-3.2 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.8 0-3 .5-4.5 2-1.5-1.5-2.7-2-4.5-2A5.5 5.5 0 0 0 2 8.5C2 10.8 3.5 12.5 5 14l7 7z"] },
  { key: "followers", d: ["M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2", "M12 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z"] },
  // Lucide `bell` - the neutral "something else is waiting" mark.
  { key: "other", d: ["M6.2 9.4a5.8 5.8 0 0 1 11.6 0c0 5 2 6.4 2 6.4H4.2s2-1.4 2-6.4ZM10.3 19.5a2 2 0 0 0 3.4 0"] },
] as const;

const SCREEN_W = Dimensions.get("window").width;
/** The bar's own height. It is FIXED - the safe-area inset is padding inside it,
 *  not extra height - so anything positioned against the bar measures from this
 *  alone. Adding the inset as well is what floated the nudge a whole bar-height
 *  too high. */
export const BAR_H = 86;

/**
 * "Pull down to lock on 2x Speed" - what this bar shows instead of the tabs
 * while a side of a feed video is held.
 *
 * The chevron pulses downward on a loop rather than sitting still: the whole
 * instruction is a direction, and a static arrow reads as decoration. Native
 * driver, because this animates while a finger is already down and the JS
 * thread is busy with the gesture.
 */
function BoostHint() {
  const bob = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(bob, { toValue: 1, duration: 520, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(bob, { toValue: 0, duration: 520, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [bob]);

  return (
    <View style={styles.boostHint}>
      <Animated.View
        style={{ transform: [{ translateY: bob.interpolate({ inputRange: [0, 1], outputRange: [-3, 5] }) }] }}
      >
        <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
          <Path
            d="M7 10l5 5 5-5"
            stroke={ds.onDark}
            strokeWidth={2.2}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </Animated.View>
      <Text style={styles.boostHintText}>Pull down to lock on 2x Speed</Text>
    </View>
  );
}
/** Five equal slices; Inbox is the fourth. Mirrors LEFT + Create + RIGHT. */
const INBOX_SLICE = 3;
const SLICES = 5;

export function ReelsooTabBar({ state, navigation, onCreate, inboxBadge }: BottomTabBarProps & {
  onCreate?: () => void;
  /** Override for the computed count. Normally omitted - the bar reads it. */
  inboxBadge?: number;
}) {
  const insets = useSafeAreaInsets();
  const current = state.routes[state.index]?.name;
  // Home is presumed full-bleed video, so the bar inverts to light everywhere else.
  const pal = tabPalette(current !== "Home");
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  /* Only ever true on Home - the feed is the one surface with the hold gesture -
     but read unconditionally, because a hook cannot be called behind an `if`. */
  const speedHinting = useSpeedBoost((s) => s.hinting);

  /* Inbox badge = unread notifications + unread DMs + pending message requests.
   * The one number the Inbox tab stands for, kept fresh on a light poll. It used
   * to be passed in as a hard-coded 0, which is why the tab never counted
   * anything even though the badge itself was fully drawn. */
  const msgQ = useQuery({
    queryKey: ["messagesUnreadBadge"],
    queryFn: inboxApi.messagesUnread,
    enabled: isAuthed,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const notifQ = useQuery({
    queryKey: ["notificationsUnreadBadge"],
    // profile_view never renders as an unread row anywhere in the inbox, so
    // the tab badge must not count it or the number can never reach zero.
    queryFn: () => inboxApi.notificationsUnread(["profile_view"]),
    enabled: isAuthed,
    refetchInterval: 30_000,
    staleTime: 15_000,
  });
  const notifUnread = notifQ.data ?? 0;
  const computedBadge = isAuthed
    ? notifUnread + (msgQ.data?.count ?? 0) + (msgQ.data?.requestCount ?? 0)
    : 0;
  const badgeCount = inboxBadge ?? computedBadge;

  /* Per-type breakdown for the nudge. Only fetched once something is unread. */
  const notifListQ = useQuery({
    queryKey: ["inboxNotifPopupList"],
    queryFn: () => inboxApi.notifications(40),
    enabled: isAuthed && notifUnread >= 1,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const derived = useMemo(() => deriveNotifSummary(notifListQ.data ?? []), [notifListQ.data]);
  // Unread DMs, merged into the same nudge rather than a second popup -
  // sourced from the badge query above (msgQ), not the /notifications feed.
  const messagesUnread = msgQ.data?.count ?? 0;
  // If the breakdown comes to nothing (gift/system/profile_view unreads), show
  // the real count under the neutral bell rather than a pill of zeros - or
  // worse, mislabelled as likes.
  const summary: NotifSummary = derived.total > 0
    ? { ...derived, messages: messagesUnread, total: derived.total + messagesUnread }
    : { comments: 0, mentions: 0, likes: 0, followers: 0, other: notifUnread, messages: messagesUnread, total: notifUnread + messagesUnread };

  /* The nudge used to hang around until the user acted on it (tapped it, or
   * opened the Inbox) rather than timing out - now it auto-hides after
   * AUTO_HIDE_MS, same as a native heads-up notification. A fresh arrival
   * (notifUnread or messagesUnread actually changing, not just staying >= 1)
   * re-shows it and restarts the timer; the count/bold-preview/badge state
   * this points at is untouched by the popup showing or hiding either way. */
  const AUTO_HIDE_MS = 6500;
  const onInbox = current === "Inbox";
  const [popupVisible, setPopupVisible] = useState(false);
  const [pillW, setPillW] = useState(0);
  const dismissed = useRef(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isAuthed || onInbox) { setPopupVisible(false); return; }
    if (dismissed.current) return;
    if (notifUnread >= 1 || messagesUnread >= 1) {
      setPopupVisible(true);
      if (hideTimer.current) clearTimeout(hideTimer.current);
      hideTimer.current = setTimeout(() => setPopupVisible(false), AUTO_HIDE_MS);
    }
  }, [notifUnread, messagesUnread, isAuthed, onInbox]);
  // Screen unmount / backgrounding must not leave a timer waiting to fire a
  // setState on a gone component.
  useEffect(() => () => { if (hideTimer.current) clearTimeout(hideTimer.current); }, []);

  const showPopup = popupVisible && summary.total > 0;
  // Centre of the Inbox slice, allowing for the bar's own horizontal padding.
  const inner = SCREEN_W - 16;
  const inboxCenterX = 8 + (INBOX_SLICE + 0.5) * (inner / SLICES);
  const EDGE = 8;
  const pillLeft = pillW > 0
    ? Math.min(Math.max(inboxCenterX - pillW / 2, EDGE), SCREEN_W - pillW - EDGE)
    : inboxCenterX;
  // The arrow stays under the Inbox icon wherever the clamped pill landed.
  const pointerLeft = inboxCenterX - pillLeft;

  const renderTab = ({ route, label }: TabItem) => {
    const focused = current === route;
    const color = focused ? pal.active : pal.inactive;
    const Glyph = GLYPHS[route];
    const badge = route === "Inbox" ? badgeCount : 0;

    return (
      <Pressable
        key={route}
        accessibilityRole="button"
        accessibilityState={{ selected: focused }}
        accessibilityLabel={label}
        onPress={() => {
          const event = navigation.emit({ type: "tabPress", target: route, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) navigation.navigate(route);
        }}
        style={styles.tab}
      >
        <View>
          <Glyph color={color} />
          {badge > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText} numberOfLines={1}>
                {badge > 99 ? "99+" : badge}
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.label, { color }]}>{label}</Text>
      </Pressable>
    );
  };

  /* While a side of the video is held, this bar becomes the drop target for the
     pull-down that locks 2x. Same View, same BAR_H, same padding - only the
     contents swap, so the bar cannot change height under a finger that is
     travelling towards it. */
  if (speedHinting) {
    return (
      <View
        style={[
          styles.bar,
          styles.boostBar,
          { backgroundColor: pal.bg, borderTopColor: pal.line, paddingBottom: insets.bottom },
        ]}
        pointerEvents="none"
      >
        <BoostHint />
      </View>
    );
  }

  return (
    <View
      style={[
        styles.bar,
        { backgroundColor: pal.bg, borderTopColor: pal.line, paddingBottom: insets.bottom },
      ]}
    >
      {/* The nudge: what is waiting (notifications + unread DMs), by type,
          pointing at the Inbox tab. Auto-hides itself after AUTO_HIDE_MS;
          tapping it opens the Inbox and it does not come back this session -
          either way, dismissing it never marks anything as read itself. */}
      {showPopup && (
        <Pressable
          style={[
            styles.popupWrap,
            // Sits just clear of the bar's top edge, pointing down at the tab.
            { bottom: BAR_H + 6, left: pillLeft, opacity: pillW > 0 ? 1 : 0 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`${summary.total} new notifications`}
          onPress={() => {
            dismissed.current = true;
            if (hideTimer.current) clearTimeout(hideTimer.current);
            setPopupVisible(false);
            navigation.navigate("Inbox");
          }}
        >
          <View style={styles.popupPill} onLayout={(e) => setPillW(e.nativeEvent.layout.width)}>
            {POPUP_ROWS.map(({ key, d }) =>
              summary[key] > 0 ? (
                <View key={key} style={styles.popupItem}>
                  <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
                    {d.map((p, i) => (
                      <Path
                        key={i}
                        d={p}
                        stroke={ds.onDark}
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    ))}
                  </Svg>
                  <Text style={styles.popupText}>{summary[key] > 99 ? "99+" : summary[key]}</Text>
                </View>
              ) : null,
            )}
            <View style={[styles.popupPointer, { left: pointerLeft - 7 }]} />
          </View>
        </Pressable>
      )}

      {LEFT.map(renderTab)}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Create"
        onPress={onCreate}
        style={styles.createTab}
      >
        <View style={styles.createBtn}>
          <Image source={require("../../assets/upload-icon.png")} style={styles.createIcon} contentFit="contain" />
        </View>
      </Pressable>

      {RIGHT.map(renderTab)}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    height: BAR_H,
    paddingTop: 8,
    paddingHorizontal: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  // Overrides the row layout the tabs need, without touching the box itself.
  boostBar: { flexDirection: "column", alignItems: "center", justifyContent: "center" },
  boostHint: { alignItems: "center", gap: 2 },
  boostHintText: { color: ds.onDark, fontSize: 13, fontWeight: "700" },
  tab: { flex: 1, alignItems: "center", paddingTop: 6, gap: 5 },
  label: { fontSize: t.tab.size, fontWeight: t.tab.weight },
  createTab: { flex: 1, alignItems: "center", paddingTop: 8 },
  // The supplied icon graphic (upload-icon.png) is already a complete button
  // - its own pink capsule shape and white "+" baked in - so this wrapper no
  // longer fills/rounds a background itself, only centers the icon and
  // keeps the same coloured lift the old plain "+" pill had.
  createBtn: {
    width: 52,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    // The design's `0 6px 16px -4px rgba(244,43,91,.6)` - a coloured lift, not a
    // neutral drop shadow.
    shadowColor: ds.accent,
    shadowOpacity: 0.6,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  createIcon: { width: 52, height: 32.5 },
  /* Inbox nudge - sits above the bar, pointing down at the Inbox tab. */
  popupWrap: { position: "absolute", zIndex: 30, elevation: 12 },
  popupPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    backgroundColor: ds.accent,
    borderRadius: 20,
    paddingHorizontal: 15,
    paddingVertical: 8,
    shadowColor: ds.accent,
    shadowOpacity: 0.45,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 5 },
    elevation: 8,
  },
  popupItem: { flexDirection: "row", alignItems: "center", gap: 4 },
  popupText: { color: ds.onDark, fontSize: 13, fontWeight: "800" },
  popupPointer: {
    position: "absolute",
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    borderTopColor: ds.accent,
  },

  badge: {
    position: "absolute",
    top: -5,
    left: 13,
    minWidth: 18,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 5,
    backgroundColor: ds.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeText: { color: ds.onDark, fontSize: 10, fontWeight: "700" },
});
