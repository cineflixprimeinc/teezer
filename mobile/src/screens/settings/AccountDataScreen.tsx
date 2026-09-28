import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { OtpInput } from "@/components/OtpInput";
import { PasswordConfirmModal } from "@/components/settings/EditShell";
import { accountApi } from "@/api/account.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const RESEND_SECONDS = 60;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

type BadgeTone = "neutral" | "good" | "bad";

const STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  active: { label: "Active", tone: "good" },
  pending_verification: { label: "Pending Verification", tone: "neutral" },
  restricted: { label: "Restricted", tone: "bad" },
  suspended: { label: "Suspended", tone: "bad" },
};

/** Account Data - Account Settings › Account Data. */
export function AccountDataScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const signOut = useAuthStore((s) => s.signOut);
  const setUser = useAuthStore((s) => s.setUser);
  const currentEmail = useAuthStore((s) => s.user?.email) ?? "";

  const status = useQuery({ queryKey: ["accountStatus"], queryFn: accountApi.status });
  const [downloading, setDownloading] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);

  // ── Email verification (send OTP → enter code → verify) ──
  const [otpOpen, setOtpOpen] = useState(false);
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const s = status.data;
  const acct = STATUS_LABEL[s?.account_status ?? "active"] ?? STATUS_LABEL.active;
  const visibility = s?.profile_visibility_status === "private" ? "Private" : "Public";
  const emailVerified = !!s?.email_verified;

  function startCountdown() {
    setCountdown(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCountdown((c) => { if (c <= 1 && timer.current) { clearInterval(timer.current); return 0; } return c - 1; });
    }, 1000);
  }

  // Tap "Email Verified" → send a 6-digit code to the registered email, then
  // open the OTP sheet. Sends to the current account email (no address change).
  async function startEmailVerify() {
    if (emailVerified) return;
    if (!currentEmail) { Alert.alert("No email on file", "Add an email to your account first."); return; }
    setSending(true);
    try {
      await accountApi.sendEmailOtp();
      setOtp("");
      setOtpOpen(true);
      startCountdown();
    } catch (e) {
      Alert.alert("Couldn't send code", apiErrorMessage(e, "Please try again."));
    } finally {
      setSending(false);
    }
  }

  async function verifyEmail() {
    const code = otp.replace(/\D/g, "");
    if (code.length < 6) { Alert.alert("Enter the code", "Please enter the full 6-digit code."); return; }
    setVerifying(true);
    try {
      const res = await accountApi.verifyEmailOtp(code);
      const verifiedEmail = res.data?.email ?? currentEmail;
      const u = useAuthStore.getState().user;
      if (u) setUser({ ...u, email: verifiedEmail });
      void queryClient.invalidateQueries({ queryKey: ["accountStatus"] });
      void queryClient.invalidateQueries({ queryKey: ["accountSecurity"] });
      setOtpOpen(false);
      Alert.alert("Email verified", "Your email is now verified.");
    } catch (e) {
      Alert.alert("Verification failed", apiErrorMessage(e, "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  }

  const code = otp.replace(/\D/g, "");

  async function onDownload() {
    setDownloading(true);
    try {
      const json = await accountApi.exportData();
      await Share.share({ message: typeof json === "string" ? json : JSON.stringify(json, null, 2), title: "Your Teezer data" });
    } catch (e) {
      Alert.alert("Couldn't download", apiErrorMessage(e, "Please try again."));
    } finally {
      setDownloading(false);
    }
  }

  const del = useMutation({
    mutationFn: (password: string) => accountApi.deleteAccount(password),
    onSuccess: async () => {
      setPwOpen(false);
      // The account no longer exists - remove its saved quick-login card too.
      await signOut({ removeSaved: true });
      navigation.navigate("Main", { screen: "Home" });
      Alert.alert("Account deleted", "Your account and data have been removed.");
    },
    onError: (e) => Alert.alert("Couldn't delete", apiErrorMessage(e, "Please try again.")),
  });

  function confirmDelete() {
    Alert.alert(
      "Delete account?",
      "This permanently deletes your Teezer account and all associated data. This cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => setPwOpen(true) },
      ],
    );
  }

  return (
    <Screen edges={["top"]}>
      {/* Top bar */}
      <View style={styles.topBar}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={28} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()}>
          <Text style={styles.cancel}>Cancel</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <Text style={styles.title}>Account Data</Text>
        <Text style={styles.helper}>Manage your downloadable data, account status and privacy-related account information.</Text>

        {status.isLoading ? (
          <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
        ) : (
          <View style={{ gap: spacing.md, marginTop: spacing.lg }}>
            {/* Download */}
            <View style={styles.card}>
              <View style={styles.iconBox}><Ionicons name="download-outline" size={24} color={colors.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Download Your Data</Text>
                <Text style={styles.cardDesc}>Get a JSON copy of your Teezer profile and activity.</Text>
              </View>
              <Pressable style={styles.outlineBtn} onPress={onDownload} disabled={downloading}>
                {downloading ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.outlineBtnText}>Download</Text>}
              </Pressable>
            </View>

            {/* Account status */}
            <View style={styles.card}>
              <View style={styles.iconBox}><Ionicons name="shield-checkmark-outline" size={24} color={colors.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Account Status</Text>
                <Text style={styles.cardDesc}>Current standing of your account.</Text>
              </View>
              <Badge label={acct.label} tone={acct.tone} />
            </View>

            {/* Profile visibility */}
            <View style={styles.card}>
              <View style={styles.iconBox}><Ionicons name="eye-outline" size={24} color={colors.text} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Profile Visibility</Text>
                <Text style={styles.cardDesc}>Controlled from Privacy & Safety settings.</Text>
              </View>
              <Badge label={visibility} tone="neutral" />
            </View>

            {/* Email verified - tap to receive a code and verify */}
            <Pressable style={styles.card} disabled={emailVerified || sending} onPress={startEmailVerify}>
              <View style={styles.iconBox}>
                {sending ? <ActivityIndicator size="small" color={colors.text} /> : <Ionicons name="mail-outline" size={24} color={colors.text} />}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>Email Verified</Text>
                <Text style={styles.cardDesc}>
                  {emailVerified ? `${currentEmail || "Your email"} is verified.` : `Tap to send a code to ${currentEmail || "your email"} and verify.`}
                </Text>
              </View>
              <Badge label={emailVerified ? "Verified" : "Pending"} tone={emailVerified ? "good" : "neutral"} />
            </Pressable>

            {/* Danger zone */}
            <Text style={styles.dangerLabel}>DANGER ZONE</Text>
            <View style={styles.dangerCard}>
              <Text style={styles.dangerTitle}>Delete Account</Text>
              <Text style={styles.dangerDesc}>Permanently delete your Teezer account and all associated data. This action cannot be undone.</Text>
              <Pressable style={styles.deleteBtn} onPress={confirmDelete} disabled={del.isPending}>
                {del.isPending ? <ActivityIndicator size="small" color={colors.danger} /> : <Text style={styles.deleteBtnText}>Delete Account</Text>}
              </Pressable>
            </View>
          </View>
        )}
      </ScrollView>

      <PasswordConfirmModal
        visible={pwOpen}
        title="Delete account"
        busy={del.isPending}
        onConfirm={(pw) => del.mutate(pw)}
        onClose={() => setPwOpen(false)}
      />

      {/* Email OTP sheet */}
      <BottomSheet visible={otpOpen} onClose={() => setOtpOpen(false)} scrollable={false} keyboardAvoid>
        <View style={[styles.otpSheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.otpHead}>
            <Text style={styles.otpTitle}>Enter Verification Code</Text>
            <Pressable hitSlop={8} onPress={() => setOtpOpen(false)} style={styles.otpClose}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </Pressable>
          </View>
          <Text style={styles.otpSub}>We sent a 6-digit code to <Text style={styles.otpBold}>{currentEmail}</Text></Text>

          <View style={{ marginTop: spacing.lg }}>
            <OtpInput value={otp} onChange={setOtp} autoFocus />
          </View>

          <View style={styles.resendRow}>
            {countdown > 0 ? (
              <Text style={styles.resendMuted}>Resend code in {mmss(countdown)}</Text>
            ) : (
              <Pressable onPress={startEmailVerify} disabled={sending}><Text style={styles.resendNow}>Resend now</Text></Pressable>
            )}
          </View>

          <Pressable onPress={verifyEmail} disabled={code.length < 6 || verifying} style={{ marginTop: spacing.sm }}>
            <LinearGradient
              colors={code.length < 6 || verifying ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.verifyBtn}
            >
              {verifying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.verifyText}>Verify Email</Text>}
            </LinearGradient>
          </Pressable>
        </View>
      </BottomSheet>
    </Screen>
  );
}

function Badge({ label, tone }: { label: string; tone: BadgeTone }) {
  const map = {
    neutral: { bg: colors.bgMuted, fg: colors.textSecondary },
    good: { bg: "#e7f8ee", fg: colors.success },
    bad: { bg: "#fdeaea", fg: colors.danger },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, height: 48 },
  back: { width: 34, height: 40, justifyContent: "center" },
  cancel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand, paddingHorizontal: spacing.sm },

  title: { fontSize: 32, fontWeight: font.weightHeavy, color: colors.text, marginTop: spacing.sm },
  helper: { marginTop: spacing.sm, fontSize: font.md, color: colors.textMuted, lineHeight: 22 },

  card: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.md },
  iconBox: { width: 54, height: 54, borderRadius: 14, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  cardTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  cardDesc: { marginTop: 3, fontSize: font.sm, color: colors.textMuted, lineHeight: 19 },

  outlineBtn: { borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill, paddingHorizontal: 18, height: 38, alignItems: "center", justifyContent: "center", minWidth: 96 },
  outlineBtnText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },

  badge: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill },
  badgeText: { fontSize: font.sm, fontWeight: font.weightBold },

  dangerLabel: { marginTop: spacing.md, fontSize: font.xs, fontWeight: font.weightBold, color: colors.danger, letterSpacing: 0.7 },
  dangerCard: { borderWidth: 1, borderColor: "#f7c5c5", backgroundColor: "#fff5f5", borderRadius: radius.lg, padding: spacing.lg },
  dangerTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  dangerDesc: { marginTop: spacing.sm, fontSize: font.sm, color: colors.textMuted, lineHeight: 20 },
  deleteBtn: { marginTop: spacing.lg, borderWidth: 1, borderColor: colors.danger, borderRadius: radius.md, height: 50, alignItems: "center", justifyContent: "center" },
  deleteBtnText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.danger },

  otpSheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  otpHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  otpTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  otpClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  otpSub: { marginTop: spacing.sm, fontSize: font.md, color: colors.textMuted },
  otpBold: { fontWeight: font.weightBold, color: colors.text },
  resendRow: { alignItems: "center", paddingVertical: spacing.lg },
  resendMuted: { fontSize: font.sm, color: colors.textMuted },
  resendNow: { fontSize: font.sm, color: colors.text, fontWeight: font.weightBold, textDecorationLine: "underline" },
  verifyBtn: { height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  verifyText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
});
