import { useState } from "react";
import {
  ActivityIndicator, Alert, FlatList, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { StatusBar } from "expo-status-bar";
import { useNavigation, useRoute } from "@react-navigation/native";
import {
  useInfiniteQuery, useMutation, useQuery, useQueryClient,
} from "@tanstack/react-query";
import {
  Check, ChevronLeft, Crown, Hand, Heart, Sparkles, X,
} from "lucide-react-native";
import { Avatar } from "@/components/Avatar";
import { Screen } from "@/components/Screen";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { useAuthStore } from "@/store/auth.store";
import {
  spaceListenersApi, spaceRequestApi, spaceRoomApi,
  type SpaceListener, type SpaceRequestRow, type SpaceRoom,
} from "@/api/spaces.api";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { formatCompact, relativeTime, useRelativeTimeTick } from "@/utils/format";
import { SPACE_DARK } from "./space-style";
import { RequestToSpeakSheet } from "./RequestToSpeakSheet";

/**
 * The Listeners screen - the flow's "who is here, and who wants in".
 *
 * Two tabs, but the second only exists for the host: "All" is the room's
 * audience (a reacting-led podium over the full list), "Requests" is the host's
 * moderation queue (approve onto the stage, or decline). A listener never sees
 * the Requests tab, so the screen quietly collapses to a single list for them.
 */

type Tab = "all" | "requests";

export function ListenersScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const qc = useQueryClient();
  const requireAuth = useRequireAuth();
  const spaceId: string = String(route.params?.id);

  const meId = useAuthStore((s) => (s.user ? String(s.user.id) : null));
  const myRole = qc.getQueryData<SpaceRoom>(["space-room", spaceId])?.me?.role ?? null;
  const isHost = myRole === "host";
  const canSpeak = myRole === "host" || myRole === "speaker";

  const [tab, setTab] = useState<Tab>("all");
  const [askOpen, setAskOpen] = useState(false);

  const requestM = useMutation({
    mutationFn: () => spaceRoomApi.requestSpeak(spaceId),
    onSuccess: (r) => { setAskOpen(false); Alert.alert("Request to speak", r.message); },
    onError: () => { setAskOpen(false); Alert.alert("Request to speak", "Could not send that right now."); },
  });

  // The host's queue count, for the tab label. Only fetched for the host.
  const requestsQ = useQuery({
    queryKey: ["space-requests", spaceId],
    queryFn: () => spaceRequestApi.list(spaceId),
    enabled: isHost,
    refetchInterval: isHost ? 5000 : false,
  });

  return (
    <Screen edges={["top"]} bg={SPACE_DARK.bg}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back">
          <ChevronLeft size={24} color={SPACE_DARK.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>{tab === "requests" ? "Requests" : "Listeners"}</Text>
        <View style={{ width: 24 }} />
      </View>

      {isHost && (
        <View style={styles.tabs}>
          <TabButton label="All" active={tab === "all"} onPress={() => setTab("all")} />
          <TabButton
            label={`Requests${requestsQ.data?.meta.pending ? ` ${requestsQ.data.meta.pending}` : ""}`}
            active={tab === "requests"}
            onPress={() => setTab("requests")}
          />
        </View>
      )}

      {tab === "requests" && isHost ? (
        <RequestsTab spaceId={spaceId} />
      ) : (
        <AllListeners
          spaceId={spaceId}
          canSpeak={canSpeak}
          onJoin={() => requireAuth(() => setAskOpen(true))}
        />
      )}

      <RequestToSpeakSheet
        visible={askOpen}
        sending={requestM.isPending}
        onSend={() => requestM.mutate()}
        onClose={() => setAskOpen(false)}
      />
    </Screen>
  );
}

/* ── the "All" tab: podium + full list ───────────────────────────────── */

function AllListeners({ spaceId, canSpeak, onJoin }: {
  spaceId: string;
  canSpeak: boolean;
  onJoin: () => void;
}) {
  useRelativeTimeTick();

  const q = useInfiniteQuery({
    queryKey: ["space-listeners", spaceId],
    queryFn: ({ pageParam = 1 }) => spaceListenersApi.list(spaceId, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) =>
      last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined,
    refetchInterval: 10_000,
  });

  const rows: SpaceListener[] = q.data?.pages.flatMap((p) => p.data) ?? [];
  const top: SpaceListener[] = q.data?.pages[0]?.top ?? [];

  if (q.isLoading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.id}
      contentContainerStyle={styles.list}
      onEndReached={() => q.hasNextPage && !q.isFetchingNextPage && q.fetchNextPage()}
      onEndReachedThreshold={0.5}
      showsVerticalScrollIndicator={false}
      ListHeaderComponent={
        <View>
          {/* Join-as-speaker card - only for those who cannot already. */}
          {!canSpeak && (
            <Pressable onPress={onJoin} accessibilityRole="button">
              <LinearGradient
                colors={["rgba(139,92,246,0.30)", "rgba(139,92,246,0.10)"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.joinCard}
              >
                <View style={styles.joinText}>
                  <Text style={styles.joinTitle}>Join as speaker</Text>
                  <Text style={styles.joinBody}>Request to speak in this space and share your thoughts.</Text>
                  <View style={styles.joinBtn}>
                    <Hand size={14} color={colors.white} strokeWidth={2} />
                    <Text style={styles.joinBtnText}>Request to speak</Text>
                  </View>
                </View>
                <Sparkles size={40} color={SPACE_DARK.purple} strokeWidth={1.6} />
              </LinearGradient>
            </Pressable>
          )}

          {top.length > 0 && (
            <>
              <Text style={styles.section}>Top listeners</Text>
              <View style={styles.podium}>
                {top.map((l, i) => <TopListener key={l.id} l={l} rank={i + 1} />)}
              </View>
            </>
          )}

          <Text style={styles.section}>All listeners</Text>
        </View>
      }
      ListEmptyComponent={<Text style={styles.empty}>No listeners yet.</Text>}
      ListFooterComponent={q.isFetchingNextPage ? <ActivityIndicator style={styles.footerSpin} color={colors.brand} /> : null}
      renderItem={({ item }) => <ListenerRow l={item} />}
    />
  );
}

const CROWN = ["#f5c518", "#c9d1d9", "#cd7f32", "#8b5cf6"];

function TopListener({ l, rank }: { l: SpaceListener; rank: number }) {
  const tint = CROWN[rank - 1] ?? SPACE_DARK.purple;
  return (
    <View style={styles.top}>
      <View>
        <Avatar uri={l.avatar} style={styles.topAvatar} />
        <View style={[styles.rankBadge, { backgroundColor: tint }]}>
          <Text style={styles.rankNum}>{rank}</Text>
        </View>
        {rank === 1 && <Crown size={16} color={tint} fill={tint} strokeWidth={1.5} style={styles.crown} />}
      </View>
      <Text style={styles.topName} numberOfLines={1}>{l.name.split(" ")[0]}</Text>
      <Text style={styles.topHearts}>{formatCompact(l.hearts)}</Text>
    </View>
  );
}

function ListenerRow({ l }: { l: SpaceListener }) {
  return (
    <View style={styles.row}>
      <Avatar uri={l.avatar} style={styles.avatar} />
      <View style={styles.rowText}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{l.name}</Text>
          {l.verified && <VerifiedBadge size={13} />}
        </View>
        <Text style={styles.sub}>Listening · {listenTime(l.listening_minutes)}</Text>
      </View>
      <View style={styles.heartTally}>
        <Heart size={14} color={SPACE_DARK.brand} fill={SPACE_DARK.brand} strokeWidth={2} />
        <Text style={styles.heartCount}>{formatCompact(l.hearts)}</Text>
      </View>
    </View>
  );
}

/* ── the "Requests" tab (host only) ──────────────────────────────────── */

function RequestsTab({ spaceId }: { spaceId: string }) {
  const qc = useQueryClient();
  useRelativeTimeTick();

  const q = useQuery({
    queryKey: ["space-requests", spaceId],
    queryFn: () => spaceRequestApi.list(spaceId),
    refetchInterval: 5000,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["space-requests", spaceId] });
    qc.invalidateQueries({ queryKey: ["space-room", spaceId] });
    qc.invalidateQueries({ queryKey: ["space-people", spaceId] });
    qc.invalidateQueries({ queryKey: ["space-listeners", spaceId] });
  };

  const approveM = useMutation({
    mutationFn: (userId: string) => spaceRequestApi.approve(spaceId, userId),
    onSuccess: refresh,
  });
  const declineM = useMutation({
    mutationFn: (userId: string) => spaceRequestApi.decline(spaceId, userId),
    onSuccess: refresh,
  });

  if (q.isLoading) {
    return <View style={styles.center}><ActivityIndicator color={colors.brand} /></View>;
  }

  const pending = q.data?.pending ?? [];
  const approved = q.data?.approved ?? [];

  return (
    <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
      <Text style={styles.section}>Pending requests{pending.length ? ` · ${pending.length}` : ""}</Text>
      {pending.length === 0 && <Text style={styles.empty}>No pending requests.</Text>}
      {pending.map((r) => (
        <View key={r.id} style={styles.row}>
          <Avatar uri={r.avatar} style={styles.avatar} />
          <View style={styles.rowText}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
              {r.verified && <VerifiedBadge size={13} />}
            </View>
            <Text style={styles.sub}>Requested · {relativeTime(r.at)}</Text>
          </View>
          <Pressable
            onPress={() => approveM.mutate(r.user_id)}
            disabled={approveM.isPending}
            style={({ pressed }) => [styles.accept, pressed && styles.pressed]}
            accessibilityLabel={`Accept ${r.name}`}
          >
            <Check size={18} color={SPACE_DARK.green} strokeWidth={2.6} />
          </Pressable>
          <Pressable
            onPress={() => declineM.mutate(r.user_id)}
            disabled={declineM.isPending}
            style={({ pressed }) => [styles.decline, pressed && styles.pressed]}
            accessibilityLabel={`Decline ${r.name}`}
          >
            <X size={18} color={SPACE_DARK.brand} strokeWidth={2.6} />
          </Pressable>
        </View>
      ))}

      {approved.length > 0 && (
        <>
          <Text style={[styles.section, { marginTop: spacing.xl }]}>Approved · {approved.length}</Text>
          {approved.map((r: SpaceRequestRow) => (
            <View key={r.id} style={styles.row}>
              <Avatar uri={r.avatar} style={styles.avatar} />
              <View style={styles.rowText}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{r.name}</Text>
                  {r.verified && <VerifiedBadge size={13} />}
                </View>
                <Text style={styles.sub}>Approved · {relativeTime(r.at)}</Text>
              </View>
              <View style={styles.onStage}>
                <View style={styles.onStageDot} />
                <Text style={styles.onStageText}>On stage</Text>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}

/* ── bits ────────────────────────────────────────────────────────────── */

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.tab}>
      <Text style={[styles.tabText, active && styles.tabTextActive]}>{label}</Text>
      {active && <View style={styles.tabUnderline} />}
    </Pressable>
  );
}

/** Minutes → "45m" / "1h 5m". */
function listenTime(mins: number): string {
  if (mins < 60) return `${Math.max(0, mins)}m`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/* ── styles ─────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  pressed: { opacity: 0.7 },

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
    position: "absolute", bottom: -1, height: 2, width: "50%",
    borderRadius: 1, backgroundColor: colors.brand,
  },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  section: { marginTop: spacing.lg, marginBottom: spacing.md, fontSize: font.sm, fontWeight: font.weightBold, color: SPACE_DARK.faint },
  empty: { textAlign: "center", marginVertical: spacing.xl, fontSize: font.sm, color: SPACE_DARK.faint },
  footerSpin: { marginVertical: spacing.lg },

  joinCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginTop: spacing.md, padding: spacing.lg, borderRadius: radius.lg,
    borderWidth: 1, borderColor: "rgba(139,92,246,0.35)",
  },
  joinText: { flex: 1 },
  joinTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: SPACE_DARK.text },
  joinBody: { marginTop: 3, fontSize: font.xs, color: SPACE_DARK.dim, lineHeight: 17 },
  joinBtn: {
    flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start",
    marginTop: spacing.md, paddingHorizontal: spacing.md, height: 34, borderRadius: radius.pill,
    backgroundColor: SPACE_DARK.purple,
  },
  joinBtnText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.white },

  podium: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  top: { alignItems: "center", width: 72 },
  topAvatar: { width: 56, height: 56, borderRadius: 28 },
  rankBadge: {
    position: "absolute", top: -4, right: -4,
    minWidth: 20, height: 20, borderRadius: 10, paddingHorizontal: 4,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: SPACE_DARK.bg,
  },
  rankNum: { fontSize: 11, fontWeight: font.weightHeavy, color: "#1a1420" },
  crown: { position: "absolute", top: -16, alignSelf: "center", left: 0, right: 0 },
  topName: { marginTop: spacing.sm, fontSize: font.xs, fontWeight: font.weightBold, color: SPACE_DARK.text },
  topHearts: { marginTop: 1, fontSize: font.xs, color: SPACE_DARK.faint },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  rowText: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: font.md, fontWeight: font.weightBold, color: SPACE_DARK.text, flexShrink: 1 },
  sub: { marginTop: 1, fontSize: font.xs, color: SPACE_DARK.faint },

  heartTally: { flexDirection: "row", alignItems: "center", gap: 5 },
  heartCount: { fontSize: font.sm, fontWeight: font.weightBold, color: SPACE_DARK.dim },

  accept: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: SPACE_DARK.greenSoft, borderWidth: 1, borderColor: "rgba(40,199,111,0.4)",
  },
  decline: {
    width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center",
    backgroundColor: SPACE_DARK.brandSoft, borderWidth: 1, borderColor: "rgba(254,44,85,0.4)",
  },
  onStage: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: spacing.md, height: 30, borderRadius: radius.pill,
    backgroundColor: SPACE_DARK.greenSoft,
  },
  onStageDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: SPACE_DARK.green },
  onStageText: { fontSize: font.xs, fontWeight: font.weightBold, color: SPACE_DARK.green },
});
