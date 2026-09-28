import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { ChangePasswordModal } from "@/components/settings/ChangePasswordModal";
import { accountApi } from "@/api/account.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WEB = "https://teezer.live";

function maskEmail(e?: string | null): string {
  if (!e) return "-";
  const [local, domain] = e.split("@");
  if (!domain) return e;
  const head = local.slice(0, 2);
  return `${head}${"*".repeat(Math.max(3, local.length - 2))}@${domain}`;
}
function maskPhone(p?: string | null): string {
  if (!p) return "Not set";
  const head = p.slice(0, 4);
  const tail = p.slice(-2);
  return `${head}${"*".repeat(Math.max(3, p.length - 6))}${tail}`;
}

const TIPS = [
  "Use a strong password with at least 8 characters",
  "Enable Two-Factor Authentication",
  "Don't share your password with anyone",
  "Log out from unused devices",
  "Keep your recovery information up to date",
];

/** Login & Security - three-dot menu › Login & Security. */
export function LoginSecurityScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const signOut = useAuthStore((s) => s.signOut);

  const security = useQuery({ queryKey: ["accountSecurity"], queryFn: accountApi.security });
  const twoFactor = useQuery({ queryKey: ["twoFactorStatus"], queryFn: accountApi.twoFactorStatus });

  const [pwOpen, setPwOpen] = useState(false);
  const [alerts, setAlerts] = useState(false);

  useEffect(() => {
    if (security.data) setAlerts(security.data.login_alerts);
  }, [security.data]);

  const toggleAlerts = useMutation({
    mutationFn: (enabled: boolean) => accountApi.setLoginAlerts(enabled),
    onError: (e) => { setAlerts((v) => !v); Alert.alert("Couldn't update", apiErrorMessage(e)); },
  });
  function onToggleAlerts(v: boolean) { setAlerts(v); toggleAlerts.mutate(v); }

  async function onPasswordChanged() {
    setPwOpen(false);
    await signOut();
    navigation.navigate("Main", { screen: "Home" });
    Alert.alert("Password changed", "Please log in again with your new password.");
  }

  const sec = security.data;
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {/* Heading */}
        <View style={styles.titleRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Login & Security</Text>
        </View>
        <Text style={styles.subtitle}>Manage your password, recovery options, login activity and account access.</Text>

        {security.isLoading ? (
          <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <View style={{ paddingHorizontal: spacing.lg }}>
            {/* ACCOUNT SECURITY */}
            <Text style={styles.section}>ACCOUNT SECURITY</Text>

            <Row
              icon={<Ionicons name="lock-closed-outline" size={20} color={colors.text} />}
              title="Password"
              desc="Keep your account secure with a strong password"
              right={<Pressable style={styles.outlineBtn} onPress={() => setPwOpen(true)}><Text style={styles.outlineBtnText}>Change Password</Text><Ionicons name="chevron-forward" size={15} color={colors.text} /></Pressable>}
            />
            <Row
              icon={<MaterialCommunityIcons name="shield-check-outline" size={21} color={colors.text} />}
              title="Two-Factor Authentication (2FA)"
              desc="Add an extra layer of security to your account"
              onPress={() => navigation.navigate("TwoFactor")}
              right={<View style={styles.rowRight}><Badge label={twoFactor.data?.enabled ? "On" : "Off"} tone={twoFactor.data?.enabled ? "good" : "neutral"} /><Ionicons name="chevron-forward" size={18} color={colors.textFaint} /></View>}
            />
            <Row
              icon={<Ionicons name="notifications-outline" size={20} color={colors.text} />}
              title="Login Alerts"
              desc="Get notified about new logins to your account"
              right={<Switch value={alerts} onValueChange={onToggleAlerts} trackColor={{ true: colors.brand, false: "#d1d5db" }} thumbColor={colors.white} />}
            />
            <Row
              icon={<Ionicons name="desktop-outline" size={20} color={colors.text} />}
              title="Active Sessions"
              desc="Devices and browsers signed in to your account"
              onPress={() => navigation.navigate("ActiveSessions")}
              right={<View style={styles.rowRight}><Text style={styles.countText}>{sec?.session_count ?? 0} Active</Text><Ionicons name="chevron-forward" size={18} color={colors.textFaint} /></View>}
              last
            />

            {/* RECOVERY OPTIONS */}
            <Text style={styles.section}>RECOVERY OPTIONS</Text>
            <Row
              icon={<Ionicons name="mail-outline" size={20} color={colors.text} />}
              title="Recovery Email"
              desc={maskEmail(sec?.email)}
              onPress={() => navigation.navigate("VerifyEmail")}
              right={<View style={styles.rowRight}><Badge label={sec?.email_verified ? "Verified" : "Unverified"} tone={sec?.email_verified ? "good" : "bad"} /><Ionicons name="chevron-forward" size={18} color={colors.textFaint} /></View>}
            />
            <Row
              icon={<Ionicons name="call-outline" size={20} color={colors.text} />}
              title="Recovery Phone"
              desc={maskPhone(sec?.phone)}
              onPress={() => navigation.navigate("EditPhone", { value: sec?.phone ?? "" })}
              right={<View style={styles.rowRight}><Badge label={sec?.phone_verified ? "Verified" : "Unverified"} tone={sec?.phone_verified ? "good" : "neutral"} /><Ionicons name="chevron-forward" size={18} color={colors.textFaint} /></View>}
              last
            />

            {/* SECURITY TIPS */}
            <Text style={styles.section}>SECURITY TIPS</Text>
            {TIPS.map((t) => (
              <View key={t} style={styles.tipRow}>
                <MaterialCommunityIcons name="shield-check-outline" size={18} color={colors.text} />
                <Text style={styles.tipText}>{t}</Text>
              </View>
            ))}
            <Pressable style={styles.linkRow} onPress={() => open(`${WEB}/settings/security`)}>
              <Text style={styles.link}>Learn More</Text>
              <Ionicons name="chevron-forward" size={15} color={colors.brand} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      <ChangePasswordModal visible={pwOpen} onClose={() => setPwOpen(false)} onChanged={onPasswordChanged} />
    </Screen>
  );
}

function Row({
  icon, title, desc, right, onPress, last,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
  right?: React.ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  return (
    <Pressable style={[styles.row, !last && styles.rowDivider]} onPress={onPress} disabled={!onPress}>
      <View style={styles.iconCircle}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDesc} numberOfLines={1}>{desc}</Text>
      </View>
      {right}
    </Pressable>
  );
}

function Badge({ label, tone }: { label: string; tone: "good" | "bad" | "neutral" }) {
  const m = { good: { bg: "#e7f8ee", fg: colors.success }, bad: { bg: "#fdeaea", fg: colors.danger }, neutral: { bg: colors.bgMuted, fg: colors.textSecondary } }[tone];
  return <View style={[styles.badge, { backgroundColor: m.bg }]}><Text style={[styles.badgeText, { color: m.fg }]}>{label}</Text></View>;
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 52 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: 28, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: font.md, color: colors.textMuted, lineHeight: 22 },

  section: { marginTop: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textMuted, letterSpacing: 0.7 },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  iconCircle: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  rowTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, color: colors.textMuted },
  rowRight: { flexDirection: "row", alignItems: "center", gap: 6 },
  countText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },

  outlineBtn: { flexDirection: "row", alignItems: "center", gap: 2, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingLeft: 14, paddingRight: 8, height: 38 },
  outlineBtnText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },

  badge: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: radius.pill },
  badgeText: { fontSize: font.sm, fontWeight: font.weightBold },

  linkRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 3, paddingVertical: spacing.md },
  link: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.brand },

  tipRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  tipText: { flex: 1, fontSize: font.md, color: colors.text },
  empty: { paddingVertical: spacing.md, color: colors.textFaint, fontSize: font.sm },
});
