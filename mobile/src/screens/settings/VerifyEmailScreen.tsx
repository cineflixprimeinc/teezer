import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { OtpInput } from "@/components/OtpInput";
import { accountApi } from "@/api/account.api";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const RESEND_SECONDS = 60;
const mmss = (s: number) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/**
 * Verify Email - sends a 6-digit code (via the backend mailer / AWS SES) to the
 * user's email, or to a new address ("Change email address"), then verifies it.
 */
export function VerifyEmailScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const setUser = useAuthStore((s) => s.setUser);
  const currentEmail = useAuthStore((s) => s.user?.email) ?? "";

  const [email, setEmail] = useState(currentEmail);
  const [changing, setChanging] = useState(false);
  const [sending, setSending] = useState(false);

  const [sheetOpen, setSheetOpen] = useState(false);
  const [sentTo, setSentTo] = useState("");
  const [otp, setOtp] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  function startCountdown() {
    setCountdown(RESEND_SECONDS);
    if (timer.current) clearInterval(timer.current);
    timer.current = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1 && timer.current) { clearInterval(timer.current); return 0; }
        return c - 1;
      });
    }, 1000);
  }

  const target = changing ? email.trim() : currentEmail;
  const validTarget = changing ? EMAIL_RE.test(email.trim()) && email.trim().toLowerCase() !== currentEmail.toLowerCase() : true;

  async function sendCode() {
    if (changing && !validTarget) { Alert.alert("Invalid email", "Enter a valid new email address."); return; }
    setSending(true);
    try {
      await accountApi.sendEmailOtp(changing ? email.trim() : undefined);
      setSentTo(target);
      setOtp("");
      setSheetOpen(true);
      startCountdown();
    } catch (e) {
      Alert.alert("Couldn't send code", apiErrorMessage(e, "Please try again."));
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    const code = otp.replace(/\D/g, "");
    if (code.length < 6) { Alert.alert("Enter the code", "Please enter the full 6-digit code."); return; }
    setVerifying(true);
    try {
      const res = await accountApi.verifyEmailOtp(code);
      const newEmail = res.data?.email ?? sentTo;
      const u = useAuthStore.getState().user;
      if (u) setUser({ ...u, email: newEmail });
      void queryClient.invalidateQueries({ queryKey: ["accountStatus"] });
      void queryClient.invalidateQueries({ queryKey: ["accountSecurity"] });
      setSheetOpen(false);
      Alert.alert("Email verified", "Your email is now verified.", [{ text: "OK", onPress: () => navigation.goBack() }]);
    } catch (e) {
      Alert.alert("Verification failed", apiErrorMessage(e, "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  }

  async function paste() {
    const text = await Clipboard.getStringAsync();
    const digits = (text.match(/\d/g) ?? []).join("").slice(0, 6);
    if (digits) setOtp(digits);
  }

  const code = otp.replace(/\D/g, "");

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

      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }}>
        <Text style={styles.title}>Verify Email</Text>
        <Text style={styles.subtitle}>Confirm your email address to unlock full account access and security features.</Text>

        {/* Email card */}
        <View style={styles.card}>
          <View style={styles.iconCircle}><Ionicons name="mail-outline" size={24} color={colors.text} /></View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardLabel}>Email Address</Text>
            {changing ? (
              <TextInput
                style={styles.emailInput}
                value={email}
                onChangeText={setEmail}
                autoFocus
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                placeholder="you@example.com"
                placeholderTextColor={colors.textFaint}
              />
            ) : (
              <Text style={styles.cardEmail}>{currentEmail || "-"}</Text>
            )}
            <Text style={styles.cardHint}>We will send a 6-digit verification code to this email address.</Text>
          </View>
        </View>

        {/* Send button */}
        <Pressable onPress={sendCode} disabled={sending || (changing && !validTarget)} style={{ marginTop: spacing.xl }}>
          <LinearGradient
            colors={sending || (changing && !validTarget) ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.sendBtn}
          >
            {sending ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>Send Verification Code</Text>}
          </LinearGradient>
        </Pressable>

        <Pressable style={styles.changeLink} onPress={() => { setChanging((v) => !v); if (changing) setEmail(currentEmail); }}>
          <Text style={styles.changeText}>{changing ? "Use current email" : "Change email address"}</Text>
        </Pressable>
      </ScrollView>

      {/* OTP bottom sheet */}
      <BottomSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} scrollable={false} keyboardAvoid>
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Enter Verification Code</Text>
              <Pressable hitSlop={8} onPress={() => setSheetOpen(false)} style={styles.sheetClose}>
                <Ionicons name="close" size={20} color={colors.textMuted} />
              </Pressable>
            </View>
            <Text style={styles.sheetSub}>We sent a 6-digit code to <Text style={styles.bold}>{sentTo}</Text></Text>

            <View style={{ marginTop: spacing.lg }}>
              <OtpInput value={otp} onChange={setOtp} autoFocus />
            </View>

            <View style={styles.resendRow}>
              {countdown > 0 ? (
                <Text style={styles.resendMuted}>Resend code in {mmss(countdown)}</Text>
              ) : (
                <Pressable onPress={sendCode} disabled={sending}><Text style={styles.resendNow}>Resend now</Text></Pressable>
              )}
            </View>

            <Pressable onPress={verify} disabled={code.length < 6 || verifying} style={{ marginTop: spacing.sm }}>
              <LinearGradient
                colors={code.length < 6 || verifying ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
                start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
                style={styles.sendBtn}
              >
                {verifying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.sendText}>Verify Email</Text>}
              </LinearGradient>
            </Pressable>

            <Pressable style={styles.pasteBtn} onPress={paste}><Text style={styles.pasteText}>Paste code</Text></Pressable>
      </View>
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.md, height: 48 },
  back: { width: 34, height: 40, justifyContent: "center" },
  cancel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand, paddingHorizontal: spacing.sm },

  title: { fontSize: 32, fontWeight: font.weightHeavy, color: colors.text, marginTop: spacing.sm },
  subtitle: { marginTop: spacing.sm, fontSize: font.md, color: colors.textMuted, lineHeight: 22 },

  card: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xl, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: spacing.lg },
  iconCircle: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  cardEmail: { marginTop: 4, fontSize: font.md, color: colors.text },
  emailInput: { marginTop: 4, fontSize: font.md, color: colors.text, borderBottomWidth: 1, borderBottomColor: colors.borderStrong, paddingVertical: 4 },
  cardHint: { marginTop: spacing.sm, fontSize: font.sm, color: colors.textMuted, lineHeight: 20 },

  sendBtn: { height: 56, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  sendText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
  changeLink: { alignItems: "center", paddingVertical: spacing.lg },
  changeText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand },

  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm },
  sheetHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sheetTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  sheetClose: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  sheetSub: { marginTop: spacing.sm, fontSize: font.md, color: colors.textMuted },
  bold: { fontWeight: font.weightBold, color: colors.text },
  resendRow: { alignItems: "center", paddingVertical: spacing.lg },
  resendMuted: { fontSize: font.sm, color: colors.textMuted },
  resendNow: { fontSize: font.sm, color: colors.text, fontWeight: font.weightBold, textDecorationLine: "underline" },
  pasteBtn: { alignItems: "center", paddingVertical: spacing.md },
  pasteText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand },
});
