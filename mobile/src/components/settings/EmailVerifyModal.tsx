import { useEffect, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { OtpInput } from "@/components/OtpInput";
import { accountApi } from "@/api/account.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Verify the user's current (pending) email by OTP. Sends a code on open, takes
 * the 6-digit code, verifies it, then calls onVerified.
 */
export function EmailVerifyModal({
  visible,
  email,
  onClose,
  onVerified,
}: {
  visible: boolean;
  email: string;
  onClose: () => void;
  onVerified: () => void;
}) {
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState(false);

  // Send a code as soon as the sheet opens.
  useEffect(() => {
    if (!visible) { setOtp(""); setError(null); setSentTo(false); return; }
    void send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function send() {
    setSending(true);
    setError(null);
    try {
      await accountApi.sendEmailOtp();
      setSentTo(true);
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't send the code."));
    } finally {
      setSending(false);
    }
  }

  async function verify() {
    const code = otp.replace(/\D/g, "");
    if (code.length < 6) { setError("Enter the full 6-digit code."); return; }
    setVerifying(true);
    setError(null);
    try {
      await accountApi.verifyEmailOtp(code);
      onVerified();
      onClose();
    } catch (e) {
      setError(apiErrorMessage(e, "Invalid or expired code."));
    } finally {
      setVerifying(false);
    }
  }

  const code = otp.replace(/\D/g, "");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>Verify your email</Text>
          <Text style={styles.subtitle}>
            {sending ? "Sending a code…" : `Enter the 6-digit code we sent to ${email}.`}
          </Text>

          <View style={{ marginTop: spacing.lg }}>
            <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(null); }} autoFocus />
          </View>

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={verify} disabled={code.length < 6 || verifying || sending} style={{ marginTop: spacing.lg }}>
            <LinearGradient
              colors={code.length < 6 || verifying || sending ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.verifyBtn}
            >
              {verifying ? <ActivityIndicator color={colors.white} /> : <Text style={styles.verifyText}>Verify Email</Text>}
            </LinearGradient>
          </Pressable>

          <View style={styles.footer}>
            <Pressable onPress={onClose} hitSlop={8}><Text style={styles.cancel}>Cancel</Text></Pressable>
            <Pressable onPress={send} disabled={sending} hitSlop={8}>
              <Text style={[styles.resend, sending && styles.resendDisabled]}>{sentTo ? "Resend code" : "Send code"}</Text>
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // No dim - the dialog floats on its own soft shadow (global popup style).
  backdrop: { flex: 1, justifyContent: "center", paddingHorizontal: spacing.xl },
  card: {
    backgroundColor: colors.bg, borderRadius: radius.xl, padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { marginTop: spacing.sm, fontSize: font.sm, color: colors.textMuted, lineHeight: 20 },
  error: { marginTop: spacing.md, fontSize: font.sm, color: colors.danger, fontWeight: font.weightMedium },
  verifyBtn: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  verifyText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
  footer: { flexDirection: "row", justifyContent: "space-between", marginTop: spacing.lg },
  cancel: { fontSize: font.md, fontWeight: font.weightBold, color: colors.textMuted },
  resend: { fontSize: font.md, fontWeight: font.weightBold, color: colors.brand },
  resendDisabled: { color: colors.textFaint },
});
