import { useMemo, useState } from "react";
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { profileApi } from "@/api/profile.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import { relativeTime, useRelativeTimeTick } from "@/utils/format";

function Avatar({ uri, name, size }: { uri?: string | null; name?: string | null; size: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
  if (uri) {
    return <Image source={uri} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.bgMuted }} contentFit="cover" />;
  }
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" }}>
      <Text style={{ color: colors.white, fontWeight: font.weightHeavy, fontSize: size * 0.4 }}>{initial}</Text>
    </View>
  );
}

/**
 * Pending follow requests - the private-account flow, mirroring the website:
 * when your account is private, a follow lands as a `pending` row until you
 * accept it (they become a follower, they're notified) or decline it (the
 * request is deleted, they're notified). Backed by the same
 * /users/follow-requests endpoints the website uses.
 */
export function FollowRequestsScreen() {
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const isAuthed = useAuthStore((s) => s.status === "authenticated");
  const me = useAuthStore((s) => s.user);
  useRelativeTimeTick();

  const [hidden, setHidden] = useState<Set<number>>(new Set());

  // Same cache key the Friends tab and Find Friends use → all badges stay in sync.
  const requestsQ = useQuery({ queryKey: ["friends-requests"], queryFn: profileApi.followRequests, enabled: isAuthed });
  const requests = useMemo(() => (requestsQ.data ?? []).filter((r) => !hidden.has(r.id)), [requestsQ.data, hidden]);

  const goProfile = (_username: string) => {};

  const hide = (id: number) => setHidden((s) => new Set(s).add(id));
  const unhide = (id: number) => setHidden((s) => { const n = new Set(s); n.delete(id); return n; });

  const onAccept = (id: number) => {
    hide(id);
    profileApi.acceptFollowRequest(id)
      .then(() => {
        qc.invalidateQueries({ queryKey: ["friends-requests"] });
        if (me?.username) qc.invalidateQueries({ queryKey: ["friends-followers", me.username] });
      })
      .catch(() => unhide(id));
  };
  const onDecline = (id: number) => {
    hide(id);
    profileApi.declineFollowRequest(id)
      .then(() => qc.invalidateQueries({ queryKey: ["friends-requests"] }))
      .catch(() => unhide(id));
  };

  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.backBtn}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </Pressable>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Follow requests</Text>
          {requests.length > 0 && <View style={styles.badge}><Text style={styles.badgeText}>{requests.length}</Text></View>}
        </View>
      </View>
      <Text style={styles.headerSub}>
        Your account is set up so new followers need your approval. Accept to let them follow you, or delete the request - they'll be notified either way.
      </Text>

      {requestsQ.isLoading ? (
        <View style={{ paddingTop: spacing.sm }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <View key={i} style={styles.row}>
              <Skeleton width={52} height={52} radius={26} />
              <View style={{ flex: 1 }}><Skeleton width="45%" height={13} /><Skeleton width="30%" height={11} style={{ marginTop: 7 }} /></View>
              <Skeleton width={150} height={36} radius={radius.sm} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(r) => String(r.id)}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: spacing.xxl }}
          refreshControl={
            <RefreshControl refreshing={requestsQ.isRefetching} onRefresh={() => requestsQ.refetch()} tintColor={colors.brand} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <View style={styles.emptyIcon}><Ionicons name="person-add-outline" size={34} color={colors.brand} /></View>
              <Text style={styles.emptyTitle}>No pending requests</Text>
              <Text style={styles.emptySub}>When someone asks to follow you, their request will show up here.</Text>
            </View>
          }
          renderItem={({ item: r }) => (
            <View style={styles.row}>
              <Pressable style={styles.rowLeft} onPress={() => goProfile(r.user.username)}>
                <Avatar uri={r.user.avatar} name={r.user.name ?? r.user.username} size={52} />
                <View style={{ flex: 1 }}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name} numberOfLines={1}>{r.user.name ?? r.user.username}</Text>
                    {r.user.is_verified && <VerifiedBadge size={14} />}
                  </View>
                  <Text style={styles.handle} numberOfLines={1}>@{r.user.username} · {relativeTime(r.created_at)}</Text>
                  {!!r.user.bio && <Text style={styles.bio} numberOfLines={1}>{r.user.bio}</Text>}
                </View>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnPrimary]} onPress={() => onAccept(r.id)}>
                <Text style={styles.btnPrimaryText}>Accept</Text>
              </Pressable>
              <Pressable style={[styles.btn, styles.btnGhost]} onPress={() => onDecline(r.id)}>
                <Text style={styles.btnGhostText}>Delete</Text>
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  backBtn: { marginLeft: -spacing.xs },
  headerTitleRow: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.sm },
  headerTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  badgeText: { color: colors.white, fontSize: 12, fontWeight: font.weightHeavy },
  headerSub: { fontSize: font.sm, color: colors.textMuted, lineHeight: 19, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  rowLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  name: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, flexShrink: 1 },
  handle: { fontSize: font.sm, color: colors.textMuted, marginTop: 1 },
  bio: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },

  btn: { height: 36, paddingHorizontal: spacing.md, borderRadius: radius.sm, alignItems: "center", justifyContent: "center" },
  btnPrimary: { backgroundColor: colors.brand },
  btnPrimaryText: { color: colors.white, fontSize: font.sm, fontWeight: font.weightBold },
  btnGhost: { backgroundColor: colors.bgMuted },
  btnGhostText: { color: colors.text, fontSize: font.sm, fontWeight: font.weightBold },

  center: { alignItems: "center", justifyContent: "center", paddingTop: spacing.xxl * 2, paddingHorizontal: spacing.xl, gap: spacing.sm },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  emptyTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  emptySub: { fontSize: font.sm, color: colors.textMuted, textAlign: "center", lineHeight: 20 },
});
