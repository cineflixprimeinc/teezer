import { useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { accountApi, ActiveRestriction } from "@/api/account.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const SUPPORT_MAIL = "mailto:support@teezer.live?subject=Restriction%20Support";
const APPEALS_MAIL = "mailto:appeals@teezer.live?subject=Restriction%20Appeal";

/* ── Live countdown from an ISO timestamp (mirrors the website) ── */
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);
  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }
    const calc = () => {
      const diff = Math.max(0, new Date(expiresAt).getTime() - Date.now());
      if (diff === 0) { setRemaining(null); return; }
      const s = Math.floor(diff / 1000);
      setRemaining({
        days: Math.floor(s / 86400),
        hours: Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
      });
    };
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);
  return remaining;
}

/* ── Single restriction card - website rules, light Reelsoo styling ── */
function RestrictionCard({ r }: { r: ActiveRestriction }) {
  const countdown = useCountdown(r.is_permanent ? null : r.expires_at);
  const isMessaging = r.category === "messaging";

  return (
    <View style={styles.card}>
      {/* Header: icon, label, meta, permanent/temporary badge */}
      <View style={styles.cardHead}>
        <View style={styles.iconCircle}>
          <MaterialCommunityIcons name="shield-alert-outline" size={20} color={colors.text} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>{r.label}</Text>
          <Text style={styles.cardMeta}>
            {isMessaging ? "Messaging" : "Account"}
            {r.applied_at_label ? ` · Applied ${r.applied_at_label}` : ""}
          </Text>
        </View>
        <View style={styles.badge}>
          <Text style={[styles.badgeText, r.is_permanent && { color: colors.danger }]}>
            {r.is_permanent ? "Permanent" : "Temporary"}
          </Text>
        </View>
      </View>

      {/* Reason */}
      {!!r.reason && (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonText}>
            <Text style={{ fontWeight: font.weightBold }}>Reason: </Text>{r.reason}
          </Text>
        </View>
      )}

      {/* Timing */}
      {r.is_permanent ? (
        <View style={styles.infoBox}>
          <Text style={styles.infoTitle}>No expiry set</Text>
          <Text style={styles.infoSub}>This restriction is permanent until removed by Teezer.</Text>
        </View>
      ) : countdown ? (
        <View style={{ marginTop: spacing.md }}>
          <Text style={styles.countLabel}>TIME REMAINING</Text>
          <View style={styles.countRow}>
            {[
              { val: countdown.days, label: "DAYS" },
              { val: countdown.hours, label: "HOURS" },
              { val: countdown.minutes, label: "MINUTES" },
              { val: countdown.seconds, label: "SECONDS" },
            ].map(({ val, label }) => (
              <View key={label} style={styles.countCell}>
                <Text style={styles.countValue}>{String(val).padStart(2, "0")}</Text>
                <Text style={styles.countUnit}>{label}</Text>
              </View>
            ))}
          </View>
          {!!r.expires_at_label && (
            <Text style={styles.expiresText}>
              Expires on <Text style={{ fontWeight: font.weightBold, color: colors.textSecondary }}>{r.expires_at_label}</Text>
            </Text>
          )}
        </View>
      ) : (
        <View style={styles.infoBox}>
          <Text style={styles.infoSub}>Expiry: {r.expires_at_label ?? "Unknown"}</Text>
        </View>
      )}

      {/* Support / appeal */}
      <View style={styles.actionsRow}>
        <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(SUPPORT_MAIL).catch(() => {})}>
          <Ionicons name="chatbubble-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.actionText}>Contact Support</Text>
        </Pressable>
        <Pressable style={styles.actionBtn} onPress={() => Linking.openURL(APPEALS_MAIL).catch(() => {})}>
          <Ionicons name="document-text-outline" size={13} color={colors.textSecondary} />
          <Text style={styles.actionText}>File Appeal</Text>
        </Pressable>
      </View>
    </View>
  );
}

/**
 * "My Restrictions" - active restrictions Reelsoo has applied to YOUR account.
 * Mirrors the website's /settings/restrictions rules (same
 * GET /account/restrictions data, permanent/temporary handling, reason, live
 * countdown, appeal paths) in the app's light settings design.
 */
export function MyRestrictionsScreen() {
  const navigation = useNavigation<any>();
  const isAuthed = useAuthStore((s) => s.status === "authenticated");

  const q = useQuery({
    queryKey: ["account-restrictions"],
    queryFn: accountApi.restrictions,
    enabled: isAuthed,
    staleTime: 30_000,
  });
  const restrictions = q.data?.active_restrictions ?? [];
  const messagingCount = restrictions.filter((r) => r.category === "messaging").length;

  return (
    <Screen edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        refreshControl={<RefreshControl refreshing={q.isRefetching} onRefresh={() => q.refetch()} tintColor={colors.brand} />}
      >
        {/* Heading - same treatment as Account Settings */}
        <View style={styles.titleRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>My Restrictions</Text>
        </View>
        <Text style={styles.subtitle}>View active restrictions applied to your account by Teezer.</Text>

        <View style={{ paddingHorizontal: spacing.lg }}>
          {q.isLoading ? (
            <View style={{ gap: spacing.md }}>
              <Skeleton width="100%" height={160} radius={radius.lg} />
              <Skeleton width="100%" height={160} radius={radius.lg} />
            </View>
          ) : restrictions.length === 0 ? (
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <Ionicons name="shield-checkmark-outline" size={28} color={colors.text} />
              </View>
              <Text style={styles.emptyTitle}>No Active Restrictions</Text>
              <Text style={styles.emptySub}>
                Your account has no active restrictions. Keep following community guidelines to stay restriction-free.
              </Text>
            </View>
          ) : (
            <View style={{ gap: spacing.md }}>
              <Text style={styles.summary}>
                {restrictions.length} active {restrictions.length === 1 ? "restriction" : "restrictions"} - {messagingCount} messaging, {restrictions.length - messagingCount} account
              </Text>
              {restrictions.map((r) => <RestrictionCard key={r.type} r={r} />)}
              <Text style={styles.footNote}>
                Use Contact Support or File Appeal on a restriction card for help.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 56 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.xl, fontSize: font.lg, lineHeight: 26, color: colors.textMuted },

  summary: { fontSize: font.sm, fontWeight: font.weightMedium, color: colors.textMuted },
  footNote: { textAlign: "center", fontSize: font.xs, color: colors.textFaint, marginTop: spacing.xs },

  card: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.card, padding: spacing.lg },
  cardHead: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  cardMeta: { marginTop: 2, fontSize: font.xs, color: colors.textMuted },
  badge: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 3, backgroundColor: colors.white },
  badgeText: { fontSize: 10.5, fontWeight: font.weightHeavy, color: colors.textSecondary },

  reasonBox: { marginTop: spacing.md, backgroundColor: colors.bgMuted, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reasonText: { fontSize: font.xs, color: colors.textSecondary, lineHeight: 17 },

  infoBox: { marginTop: spacing.md, backgroundColor: colors.bgMuted, borderRadius: radius.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  infoTitle: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.danger },
  infoSub: { marginTop: 2, fontSize: font.xs, color: colors.textMuted },

  countLabel: { fontSize: 10.5, fontWeight: font.weightBold, color: colors.textFaint, marginBottom: 6, letterSpacing: 0.4 },
  countRow: { flexDirection: "row", gap: spacing.sm },
  countCell: { flex: 1, alignItems: "center", borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bgMuted, borderRadius: 10, paddingVertical: spacing.sm },
  countValue: { fontSize: 22, fontWeight: font.weightHeavy, color: colors.text, fontVariant: ["tabular-nums"] },
  countUnit: { marginTop: 1, fontSize: 9, fontWeight: font.weightBold, color: colors.textMuted, letterSpacing: 0.4 },
  expiresText: { marginTop: spacing.sm, textAlign: "center", fontSize: font.xs, color: colors.textFaint },

  actionsRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: spacing.md },
  actionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 5, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.white, borderRadius: 10, paddingVertical: spacing.sm },
  actionText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary },

  empty: { alignItems: "center", gap: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.lg, backgroundColor: colors.card, paddingVertical: spacing.xxl * 1.5, paddingHorizontal: spacing.xl },
  emptyIcon: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  emptySub: { fontSize: font.xs, color: colors.textFaint, textAlign: "center", lineHeight: 18, maxWidth: 280 },
});
