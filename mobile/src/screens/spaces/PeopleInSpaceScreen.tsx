import { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useInfiniteQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownCircle, Ban, ChevronLeft, Ellipsis, Hand, Mic, MicOff,
  Shield, ShieldCheck, ShieldOff, UserMinus,
} from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { Screen } from "@/components/Screen";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuthStore } from "@/store/auth.store";
import {
  spaceHostApi, spaceModerationApi, spaceRoomApi,
  type ModAction, type PeopleTab, type SpaceRoom, type SpaceSeat,
} from "@/api/spaces.api";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { roleBadge, SPACE_DARK } from "./space-style";
import { ChatTab } from "./ChatTab";
import { RequestToSpeakSheet } from "./RequestToSpeakSheet";

/**
 * People in this Space - the flow's participant sheet, now dark.
 *
 * The design moves this off the app's light lists and onto the room's own dark
 * ground, and adds a fourth tab: Chat. The three people tabs share one paged
 * list; Chat is a different beast (its own list + composer), so it swaps in
 * whole rather than trying to live inside the same FlatList.
 */

const TABS: { id: PeopleTab | "chat"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "speakers", label: "Speakers" },
  { id: "listeners", label: "Listeners" },
  { id: "chat", label: "Chat" },
];

export function PeopleInSpaceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const spaceId: string = String(route.params?.id);

  const meId = useAuthStore((s) => (s.user ? String(s.user.id) : null));
  // Role + settings, read from the room the sheet opened over - no extra request.
  const room = qc.getQueryData<SpaceRoom>(["space-room", spaceId]);
  const myRole = room?.me?.role ?? null;
  const canSpeak = myRole === "host" || myRole === "speaker";
  const isHost = myRole === "host";
  const canModerate = isHost || room?.me?.is_moderator === true;
  const canRequest = !canSpeak
    && (room?.settings?.speaking_permission ?? "request") === "request"
    && room?.settings?.allow_speaker_requests !== false;
  const chatEnabled = room?.settings?.enable_chat !== false;
  const tabs = chatEnabled ? TABS : TABS.filter((t) => t.id !== "chat");

  const [tab, setTab] = useState<PeopleTab | "chat">(
    route.params?.tab && (chatEnabled || route.params.tab !== "chat") ? route.params.tab : "all",
  );
  const [askOpen, setAskOpen] = useState(false);
  const [modTarget, setModTarget] = useState<SpaceSeat | null>(null);

  const q = useInfiniteQuery({
    queryKey: ["space-people", spaceId, tab],
    queryFn: ({ pageParam = 1 }) => spaceHostApi.people(spaceId, tab as PeopleTab, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    enabled: tab !== "chat",
  });

  const requestM = useMutation({
    mutationFn: () => spaceRoomApi.requestSpeak(spaceId),
    onSuccess: (r) => { setAskOpen(false); Alert.alert("Request to speak", r.message); },
    onError: () => { setAskOpen(false); Alert.alert("Request to speak", "Could not send that right now."); },
  });

  const rows: SpaceSeat[] = q.data?.pages.flatMap((p) => p.data) ?? [];
  const meta = q.data?.pages[0]?.meta;

  // The endpoint returns them ordered, so a heading is simply the first row of
  // each role - no client-side grouping pass.
  const headingFor = (row: SpaceSeat, i: number): string | null => {
    if (tab !== "all") return null;
    const prev = rows[i - 1];
    if (prev && prev.role === row.role) return null;
    if (row.role === "host") return "Host";
    if (row.role === "speaker") return `Speakers · ${meta?.speakers ? meta.speakers - 1 : 0}`;
    return `Listeners · ${formatCompact(meta?.listeners ?? 0)}`;
  };

  return (
    <Screen edges={["top"]} bg={SPACE_DARK.bg}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <ChevronLeft size={24} color={SPACE_DARK.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>People in this Space</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.tabs}>
        {tabs.map((t) => {
          const active = t.id === tab;
          return (
            <Pressable key={t.id} onPress={() => setTab(t.id)} style={styles.tab}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {active && <View style={styles.tabUnderline} />}
            </Pressable>
          );
        })}
      </View>

      {tab === "chat" ? (
        <ChatTab spaceId={spaceId} meId={meId} />
      ) : (
        <>
          {q.isLoading ? (
            <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>
          ) : (
            <FlatList
              data={rows}
              keyExtractor={(r) => r.id}
              contentContainerStyle={styles.list}
              onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
              onEndReachedThreshold={0.4}
              ListEmptyComponent={<Text style={styles.empty}>Nobody here yet.</Text>}
              ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={styles.more} color={colors.brand} /> : null}
              renderItem={({ item, index }) => {
                const heading = headingFor(item, index);
                const speaks = item.role !== "listener";
                const badge = roleBadge(item.role);
                return (
                  <>
                    {!!heading && <Text style={styles.heading}>{heading}</Text>}
                    <View style={styles.row}>
                      <Avatar uri={item.avatar} style={styles.avatar} />
                      <View style={styles.rowText}>
                        <View style={styles.nameRow}>
                          <Text style={styles.name} numberOfLines={1}>{item.name}</Text>
                          {item.verified && <VerifiedBadge size={13} />}
                          {item.is_moderator && item.role !== "host" && <ShieldCheck size={13} color={colors.brand} strokeWidth={2.4} />}
                        </View>
                        <Text style={[styles.role, { color: badge.color }]}>
                          {item.is_moderator && item.role !== "host" ? "Moderator" : badge.label}
                        </Text>
                      </View>

                      {/* A speaker's mic state is public - it is what the room hears. */}
                      {speaks && (
                        <View style={[styles.micWrap, !item.muted && styles.micWrapLive]}>
                          {item.muted
                            ? <MicOff size={15} color={SPACE_DARK.faint} strokeWidth={2.2} />
                            : <Mic size={15} color={colors.white} strokeWidth={2.2} />}
                        </View>
                      )}
                      {canModerate && item.role !== "host" && item.user_id !== meId ? (
                        <Pressable hitSlop={8} style={styles.more} onPress={() => setModTarget(item)} accessibilityLabel={`Moderate ${item.name}`}>
                          <Ellipsis size={18} color={SPACE_DARK.dim} strokeWidth={2} />
                        </Pressable>
                      ) : <View style={{ width: 26 }} />}
                    </View>
                  </>
                );
              }}
            />
          )}

          {/* The flow's request button - only under the "request to speak" policy. */}
          {canRequest && (
            <View style={styles.footer}>
              <Pressable
                style={({ pressed }) => [styles.requestBtn, pressed && styles.pressed]}
                onPress={() => requireAuth(() => setAskOpen(true))}
                accessibilityRole="button"
              >
                <Hand size={17} color={colors.white} strokeWidth={2} />
                <Text style={styles.requestText}>Request to speak</Text>
              </Pressable>
            </View>
          )}
        </>
      )}

      <RequestToSpeakSheet
        visible={askOpen}
        sending={requestM.isPending}
        onSend={() => requestM.mutate()}
        onClose={() => setAskOpen(false)}
      />

      <ModSheet spaceId={spaceId} target={modTarget} isHost={isHost} onClose={() => setModTarget(null)} />
    </Screen>
  );
}

/** Host/moderator actions on one participant (§ Moderator Settings). */
function ModSheet({ spaceId, target, isHost, onClose }: {
  spaceId: string; target: SpaceSeat | null; isHost: boolean; onClose: () => void;
}) {
  const qc = useQueryClient();
  const actM = useMutation({
    mutationFn: (a: ModAction) => spaceModerationApi.act(spaceId, target!.user_id, a),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["space-people", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-room", spaceId] });
      qc.invalidateQueries({ queryKey: ["space-listeners", spaceId] });
      onClose();
    },
    onError: (e: any) => Alert.alert("Moderation", e?.response?.data?.message ?? "Could not do that."),
  });

  if (!target) return null;

  const run = (a: ModAction, label: string, danger?: boolean) => {
    if (!danger) return actM.mutate(a);
    Alert.alert(label, `${label} @${target.username}?`, [
      { text: "Cancel", style: "cancel" },
      { text: label, style: "destructive", onPress: () => actM.mutate(a) },
    ]);
  };

  const items: { a: ModAction; label: string; Icon: any; danger?: boolean }[] = [];
  if (target.role === "listener") items.push({ a: "promote", label: "Make speaker", Icon: Mic });
  if (target.role === "speaker") {
    items.push({ a: "demote", label: "Move to listener", Icon: ArrowDownCircle });
    if (!target.muted) items.push({ a: "mute", label: "Mute speaker", Icon: MicOff });
  }
  if (isHost) {
    items.push(target.is_moderator
      ? { a: "remove-moderator", label: "Remove moderator", Icon: ShieldOff }
      : { a: "promote-moderator", label: "Make moderator", Icon: Shield });
  }
  items.push({ a: "remove", label: "Remove from space", Icon: UserMinus, danger: true });
  items.push({ a: "block", label: "Block user", Icon: Ban, danger: true });

  return (
    <BottomSheet visible={!!target} onClose={onClose} scrollable={false}>
      <View style={styles.modSheet}>
        <Text style={styles.modName} numberOfLines={1}>{target.name}</Text>
        {items.map(({ a, label, Icon, danger }) => (
          <Pressable key={a} style={styles.modItem} disabled={actM.isPending} onPress={() => run(a, label, danger)}>
            <Icon size={20} color={danger ? colors.danger : colors.text} strokeWidth={2} />
            <Text style={[styles.modItemText, danger && { color: colors.danger }]}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.85 },
  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
  },
  headerTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: SPACE_DARK.text },

  tabs: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: SPACE_DARK.line },
  tab: { flex: 1, alignItems: "center", paddingVertical: spacing.md },
  tabText: { fontSize: font.md, fontWeight: font.weightMedium, color: SPACE_DARK.faint },
  tabTextActive: { color: SPACE_DARK.text, fontWeight: font.weightBold },
  tabUnderline: {
    position: "absolute", bottom: -1, height: 2, width: "60%",
    borderRadius: 1, backgroundColor: colors.brand,
  },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  heading: { marginTop: spacing.lg, marginBottom: spacing.sm, fontSize: font.sm, fontWeight: font.weightBold, color: SPACE_DARK.faint },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  avatar: { width: 42, height: 42, borderRadius: 21 },
  rowText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: font.md, fontWeight: font.weightBold, color: SPACE_DARK.text, flexShrink: 1 },
  role: { marginTop: 1, fontSize: font.xs, fontWeight: font.weightMedium },
  micWrap: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: SPACE_DARK.glassLine,
  },
  micWrapLive: { backgroundColor: colors.brand, borderColor: colors.brand },
  more: { padding: spacing.xs },
  empty: { textAlign: "center", marginTop: spacing.xxl, fontSize: font.sm, color: SPACE_DARK.faint },

  footer: {
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    borderTopWidth: 1, borderTopColor: SPACE_DARK.line,
  },
  requestBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    height: 52, borderRadius: radius.pill, backgroundColor: colors.brand,
  },
  requestText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },

  modSheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs, paddingBottom: spacing.lg },
  modName: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },
  modItem: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  modItemText: { fontSize: font.md, color: colors.text, fontWeight: font.weightMedium },
});
