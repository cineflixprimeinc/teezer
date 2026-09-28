import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Svg, { Circle, Path } from "react-native-svg";
import { Avatar } from "@/components/Avatar";
import { inboxApi, type Conversation, type MessageRequest } from "@/api/inbox.api";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import { formatWeekdayShort, formatMonthDay } from "@/utils/date-format";

/** User-supplied illustration (1024x1024 RGBA). Shared by both tabs - an empty
 *  request list and an empty spam list are the same "nothing waiting" state,
 *  and the copy beneath already tells them apart. Same art as the first-contact
 *  card in the thread itself, so the two request surfaces read as one thing. */
const EMPTY_ART = require("../../assets/messagerequestemptystate.png");

/**
 * Message requests - people you don't follow who have sent one message.
 *
 * Backed by GET /messages/requests (incoming). Accept / Delete / Block each map
 * to a real endpoint, applied optimistically: the row resolves in place to a
 * green confirmation line rather than vanishing, so you can see what you just
 * did before it goes.
 *
 * The Spam tab is rendered because the design calls for it, but the API has no
 * spam bucket - /messages/requests returns `incoming` and `sent`, nothing more.
 * It therefore shows its empty state rather than inventing filtered messages.
 * When a spam endpoint exists, only `spamQuery` below needs to change.
 */

type Tab = "Requests" | "Archived" | "Spam";

/** What has been done to a row this session. `gone` removes it. */
type Acted = "accepted" | "gone";

const HAIRLINE = "#F4F2F5";
const CHIP_IDLE = "#F1EFF3";
const INK_SOFT = "#4A4653";
const FAINT = "#B6B1BE";
const GREEN = "#2BC48A";

function BackGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function GearGlyph() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={3} stroke={ds.text} strokeWidth={1.9} />
      <Path
        d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"
        stroke={ds.text}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function InfoGlyph() {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={ds.textMuted} strokeWidth={1.9} />
      <Path d="M12 11v5M12 8h.01" stroke={ds.textMuted} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function ago(iso?: string | null) {
  if (!iso) return "";
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 172800) return "Yesterday";
  if (s < 604800) return formatWeekdayShort(iso);
  return formatMonthDay(iso);
}

/** Same fallback-by-type logic as InboxScreen's own `preview()` - kept local
 *  rather than shared, same as every other small helper in these screens. */
function previewOf(c: Conversation) {
  if (c.last_message_type === "shared_video") return "Sent a video";
  if (c.last_message && c.last_message.trim()) return c.last_message;
  switch (c.last_message_type) {
    case "image": return "Photo";
    case "video": return "Video";
    case "voice": return "Voice message";
    case "share": return "Shared a post";
    default: return "Tap to chat";
  }
}

export function MessageRequestsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();

  const [tab, setTab] = useState<Tab>("Requests");
  const [acted, setActed] = useState<Record<number, Acted>>({});

  const q = useQuery({
    queryKey: ["message-requests"],
    queryFn: () => inboxApi.messageRequests(),
    staleTime: 30_000,
  });

  const incoming = useMemo(() => q.data?.incoming ?? [], [q.data]);
  const rows = incoming.filter((r) => acted[r.conversation_id] !== "gone");
  const spam = tab === "Spam";
  const archivedTab = tab === "Archived";

  /** Counts show what is still PENDING - a resolved row is no longer waiting. */
  const pendingCount = incoming.filter((r) => !acted[r.conversation_id]).length;

  /* ── archived chats ───────────────────────────────────────────────────────
   * Same query/cache key InboxScreen's own conversation list uses - archiving
   * a chat there only ever hid it (list = convos.filter(c => !c.archived)),
   * it never actually became visible anywhere. This is that "somewhere". */
  const convos = useQuery({
    queryKey: ["inbox-conversations"],
    queryFn: () => inboxApi.conversations(),
    enabled: archivedTab,
    staleTime: 30_000,
  });
  const archived = useMemo(() => (convos.data ?? []).filter((c) => c.archived), [convos.data]);

  const unarchive = useCallback(
    (c: Conversation) => {
      inboxApi
        .updateConversationSettings(c.user_id, { archived: false })
        .then(() => {
          void convos.refetch();
          void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
        })
        .catch(() => {});
    },
    [convos, qc],
  );

  const settle = useCallback(
    (r: MessageRequest, next: Acted, call: Promise<void>) => {
      setActed((m) => ({ ...m, [r.conversation_id]: next }));
      call
        .then(() => {
          // The inbox row's count and preview read the same query.
          void qc.invalidateQueries({ queryKey: ["inbox-message-requests"] });
          void qc.invalidateQueries({ queryKey: ["inbox-conversations"] });
        })
        .catch(() => {
          // Put the row back rather than leaving a lie on screen.
          setActed((m) => {
            const n = { ...m };
            delete n[r.conversation_id];
            return n;
          });
        });
    },
    [qc],
  );

  const onAccept = (r: MessageRequest) => settle(r, "accepted", inboxApi.acceptRequest(r.conversation_id));
  const onDelete = (r: MessageRequest) => settle(r, "gone", inboxApi.declineRequest(r.conversation_id));
  const onBlock = (r: MessageRequest) => settle(r, "gone", inboxApi.blockRequest(r.conversation_id));

  const note = archivedTab
    ? "Chats you archived stay out of your inbox until you bring them back."
    : spam
      ? "Teezer filtered these automatically. They can't see your activity, and messages are deleted after 30 days."
      : "People you don't follow can send one message. They won't know you've seen it until you accept.";

  const visible = spam ? [] : rows;
  const loading = archivedTab ? convos.isLoading : q.isLoading;

  return (
    <View style={styles.root}>
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
          style={styles.roundBtn}
        >
          <BackGlyph />
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          Chats & Message Requests
        </Text>
        <Pressable
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Who can message you"
          onPress={() => navigation.navigate("SettingsShell", { screen: "MessagesSettings" })}
        >
          <GearGlyph />
        </Pressable>
      </View>

      <View style={styles.chips}>
        {(["Requests", "Archived", "Spam"] as Tab[]).map((t) => {
          const on = t === tab;
          const n = t === "Requests" ? pendingCount : t === "Archived" ? archived.length : 0;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              style={[styles.chip, on ? styles.chipOn : styles.chipOff]}
            >
              <Text style={[styles.chipText, on ? styles.chipTextOn : styles.chipTextOff]}>
                {t}
                {n > 0 ? ` · ${n}` : ""}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.noteRow}>
        <InfoGlyph />
        <Text style={styles.noteText}>{note}</Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={ds.accent} />
        </View>
      ) : archivedTab ? (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={convos.isRefetching} onRefresh={() => convos.refetch()} tintColor={ds.textMuted} />
          }
        >
          {archived.map((c) => (
            <View key={c.user_id} style={styles.row}>
              <Pressable
                style={styles.rowTapArea}
                accessibilityRole="button"
                onPress={() =>
                  navigation.navigate("Chat", {
                    userId: c.user_id,
                    username: c.username,
                    name: c.name,
                    avatar: c.avatar,
                    isVerified: !!c.is_verified,
                  })
                }
              >
                <Avatar uri={c.avatar} style={styles.avatar} />
                <View style={styles.rowBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{c.name || c.username}</Text>
                    <Text style={styles.time}>{ago(c.last_ts)}</Text>
                  </View>
                  <Text style={styles.message} numberOfLines={1}>{previewOf(c)}</Text>
                </View>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Unarchive ${c.username}`}
                onPress={() => unarchive(c)}
                style={[styles.pill, styles.pillSecondary, { alignSelf: "center" }]}
              >
                <Text style={styles.pillSecondaryText}>Unarchive</Text>
              </Pressable>
            </View>
          ))}

          {archived.length === 0 && (
            <View style={styles.empty}>
              <Image source={EMPTY_ART} style={styles.emptyArt} contentFit="contain" transition={120} />
              <Text style={styles.emptyTitle}>No archived chats</Text>
              <Text style={styles.emptyBody}>Chats you archive from the inbox show up here.</Text>
            </View>
          )}
        </ScrollView>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 40 }}
          refreshControl={
            <RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={ds.textMuted} />
          }
        >
          {visible.map((r) => {
            const state = acted[r.conversation_id];
            return (
              <View key={r.conversation_id} style={styles.row}>
                <Avatar uri={r.avatar} style={styles.avatar} />

                <View style={styles.rowBody}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>
                      {r.name || r.username}
                    </Text>
                    <Text style={styles.time}>{ago(r.last_ts)}</Text>
                  </View>

                  {/* The design's "2 mutual follows" line has no field behind it -
                      /messages/requests carries no bio or mutual count - so this
                      shows the handle, which is real. */}
                  <Text style={styles.meta} numberOfLines={1}>
                    @{r.username}
                  </Text>

                  <Text style={styles.message}>{r.last_message || "Sent you a message"}</Text>

                  {!state && (
                    <View style={styles.actions}>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => onAccept(r)}
                        style={[styles.pill, styles.pillPrimary]}
                      >
                        <Text style={styles.pillPrimaryText}>Accept</Text>
                      </Pressable>
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => onDelete(r)}
                        style={[styles.pill, styles.pillSecondary]}
                      >
                        <Text style={styles.pillSecondaryText}>Delete</Text>
                      </Pressable>
                      <Pressable accessibilityRole="button" onPress={() => onBlock(r)} style={styles.blockBtn}>
                        <Text style={styles.blockText}>Block</Text>
                      </Pressable>
                    </View>
                  )}

                  {state === "accepted" && (
                    <Text style={styles.resolved}>Accepted — chat moved to Inbox</Text>
                  )}
                </View>
              </View>
            );
          })}

          {visible.length === 0 && (
            <View style={styles.empty}>
              <Image source={EMPTY_ART} style={styles.emptyArt} contentFit="contain" transition={120} />
              <Text style={styles.emptyTitle}>{spam ? "No spam" : "No message requests"}</Text>
              <Text style={styles.emptyBody}>
                {spam
                  ? "Filtered messages will land here."
                  : "New requests from people you don't follow show up here."}
              </Text>
            </View>
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16 },
  roundBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: HAIRLINE,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { flex: 1, fontSize: font.lg, fontWeight: font.weightBold, color: ds.text },

  chips: { flexDirection: "row", gap: 6, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 },
  chip: { borderRadius: 8, paddingHorizontal: 15, paddingVertical: 9 },
  chipOn: { backgroundColor: ds.text },
  chipOff: { backgroundColor: CHIP_IDLE },
  chipText: { fontSize: font.sm, fontWeight: font.weightMedium },
  chipTextOn: { color: ds.onDark },
  chipTextOff: { color: INK_SOFT },

  noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingHorizontal: 16, paddingBottom: 12 },
  noteText: { flex: 1, fontSize: font.sm, color: ds.textMuted, lineHeight: 18 },

  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: HAIRLINE,
  },
  avatar: { width: 46, height: 46, borderRadius: 999 },
  // Archived rows split into a tappable avatar+text area and a separate
  // Unarchive pill - the request rows above are one non-pressable View
  // because the whole row has no single tap action of its own.
  rowTapArea: { flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minWidth: 0 },
  rowBody: { flex: 1, minWidth: 0, gap: 5 },
  nameRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  name: { flexShrink: 1, fontSize: font.md, fontWeight: font.weightBold, color: ds.text },
  time: { fontSize: font.xs, color: FAINT },
  meta: { fontSize: font.sm, color: ds.textMuted },
  message: { fontSize: font.sm, lineHeight: 20, color: ds.text },

  actions: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 4 },
  pill: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 999 },
  pillPrimary: { backgroundColor: ds.accent },
  pillPrimaryText: { color: ds.onDark, fontSize: font.sm, fontWeight: font.weightBold },
  pillSecondary: { backgroundColor: HAIRLINE },
  pillSecondaryText: { color: INK_SOFT, fontSize: font.sm, fontWeight: font.weightBold },
  blockBtn: { paddingHorizontal: 6, paddingVertical: 9 },
  blockText: { color: ds.textMuted, fontSize: font.sm, fontWeight: font.weightBold },

  resolved: { fontSize: font.sm, fontWeight: font.weightBold, color: GREEN, paddingTop: 2 },

  center: { paddingTop: 60, alignItems: "center" },
  empty: { paddingTop: 28, paddingHorizontal: 40, alignItems: "center", gap: 8 },
  // Negative margin cancels the container gap so the copy sits right under it.
  emptyArt: { width: 300, height: 300, marginBottom: -8 },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightBold, color: ds.text },
  emptyBody: { fontSize: font.sm, color: ds.textMuted, textAlign: "center", lineHeight: 20 },
});
