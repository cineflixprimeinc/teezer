import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import * as Clipboard from "expo-clipboard";
import QRCode from "react-native-qrcode-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { OtpInput } from "@/components/OtpInput";
import { PasswordConfirmModal } from "@/components/settings/EditShell";
import { accountApi } from "@/api/account.api";
import { authApi } from "@/api/auth.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

/** Two-Factor Authentication - set up (QR + code), view recovery codes, disable. */
export function TwoFactorScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const status = useQuery({ queryKey: ["twoFactorStatus"], queryFn: accountApi.twoFactorStatus });
  const [setup, setSetup] = useState<{ secret: string; otpauth_uri: string } | null>(null);
  const [code, setCode] = useState("");
  const [codes, setCodes] = useState<string[] | null>(null);
  const [pwOpen, setPwOpen] = useState(false);

  const setupMut = useMutation({ mutationFn: () => authApi.twoFactorSetup(), onSuccess: setSetup,
    onError: (e) => Alert.alert("Couldn't start setup", apiErrorMessage(e)) });

  // Auto-start setup once we know 2FA is off (and we're not showing codes).
  useEffect(() => {
    if (status.data && !status.data.enabled && !setup && !codes && !setupMut.isPending) setupMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status.data, setup, codes]);

  const confirmMut = useMutation({
    mutationFn: () => authApi.twoFactorConfirm(code.replace(/\D/g, "")),
    onSuccess: (data) => { setCodes(data.recovery_codes); void queryClient.invalidateQueries({ queryKey: ["twoFactorStatus"] }); },
    onError: (e) => Alert.alert("Couldn't enable 2FA", apiErrorMessage(e, "The code may be incorrect.")),
  });

  const disableMut = useMutation({
    mutationFn: (pw: string) => authApi.twoFactorDisable(pw),
    onSuccess: () => { setPwOpen(false); setSetup(null); setCode(""); void queryClient.invalidateQueries({ queryKey: ["twoFactorStatus"] }); Alert.alert("Two-factor disabled", "2FA has been turned off."); },
    onError: (e) => Alert.alert("Couldn't disable", apiErrorMessage(e)),
  });

  const copy = async (text: string, label: string) => { await Clipboard.setStringAsync(text); Alert.alert("Copied", `${label} copied to clipboard.`); };

  const enabled = !!status.data?.enabled;
  const ready = code.replace(/\D/g, "").length === 6;

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={28} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Two-Factor Authentication</Text>
        <View style={styles.back} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {status.isLoading ? (
          <View style={{ paddingTop: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
        ) : codes ? (
          /* ── Recovery codes (one-time) ── */
          <View>
            <View style={styles.successIcon}><Ionicons name="checkmark" size={28} color={colors.white} /></View>
            <Text style={styles.title}>2FA is now on</Text>
            <Text style={styles.help}>Save these recovery codes somewhere safe. Each can be used once if you lose access to your authenticator app.</Text>
            <View style={styles.codesBox}>
              {codes.map((c) => <Text key={c} style={styles.codeText}>{c}</Text>)}
            </View>
            <Pressable style={styles.outlineBtn} onPress={() => copy(codes.join("\n"), "Recovery codes")}>
              <Ionicons name="copy-outline" size={18} color={colors.text} />
              <Text style={styles.outlineBtnText}>Copy codes</Text>
            </Pressable>
            <GradientBtn label="Done" onPress={() => navigation.goBack()} />
          </View>
        ) : enabled ? (
          /* ── Enabled ── */
          <View>
            <View style={styles.onCard}>
              <MaterialCommunityIcons name="shield-check" size={26} color={colors.success} />
              <View style={{ flex: 1 }}>
                <Text style={styles.onTitle}>Two-factor authentication is on</Text>
                <Text style={styles.onDesc}>Your account is protected with an authenticator app.</Text>
              </View>
            </View>
            <Pressable style={[styles.outlineBtn, { borderColor: colors.danger }]} onPress={() => setPwOpen(true)}>
              <Ionicons name="shield-outline" size={18} color={colors.danger} />
              <Text style={[styles.outlineBtnText, { color: colors.danger }]}>Disable 2FA</Text>
            </Pressable>
          </View>
        ) : (
          /* ── Setup ── */
          <View>
            <Text style={styles.title}>Set up authenticator</Text>
            <Text style={styles.help}>Scan this QR code with an authenticator app (Google Authenticator, Authy, 1Password), then enter the 6-digit code it shows.</Text>

            {setupMut.isPending || !setup ? (
              <View style={{ paddingVertical: spacing.xxl, alignItems: "center" }}><ActivityIndicator color={colors.brand} /></View>
            ) : (
              <>
                <View style={styles.qrWrap}>
                  <QRCode value={setup.otpauth_uri} size={196} />
                </View>

                <Text style={styles.manualLabel}>Or enter this key manually</Text>
                <Pressable style={styles.secretBox} onPress={() => copy(setup.secret, "Setup key")}>
                  <Text style={styles.secretText} selectable>{setup.secret}</Text>
                  <Ionicons name="copy-outline" size={18} color={colors.brand} />
                </Pressable>

                <Text style={[styles.manualLabel, { marginTop: spacing.lg }]}>Enter the 6-digit code</Text>
                <View style={{ marginTop: spacing.sm }}>
                  <OtpInput value={code} onChange={setCode} autoFocus />
                </View>

                <GradientBtn
                  label="Verify & Enable"
                  disabled={!ready || confirmMut.isPending}
                  loading={confirmMut.isPending}
                  onPress={() => confirmMut.mutate()}
                />
              </>
            )}
          </View>
        )}
      </ScrollView>

      <PasswordConfirmModal
        visible={pwOpen}
        title="Disable 2FA"
        busy={disableMut.isPending}
        onConfirm={(pw) => disableMut.mutate(pw)}
        onClose={() => setPwOpen(false)}
      />
    </Screen>
  );
}

function GradientBtn({ label, onPress, disabled, loading }: { label: string; onPress: () => void; disabled?: boolean; loading?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={{ marginTop: spacing.xl }}>
      <LinearGradient
        colors={disabled ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.gradBtn}
      >
        {loading ? <ActivityIndicator color={colors.white} /> : <Text style={styles.gradBtnText}>{label}</Text>}
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 56 },
  back: { width: 36, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },

  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  help: { marginTop: spacing.sm, fontSize: font.md, color: colors.textMuted, lineHeight: 21 },

  qrWrap: { alignSelf: "center", marginTop: spacing.xl, padding: spacing.lg, backgroundColor: colors.white, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border },
  manualLabel: { marginTop: spacing.xl, fontSize: font.sm, fontWeight: font.weightBold, color: colors.textMuted },
  secretBox: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.md, marginTop: spacing.sm, backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: 14, height: 50 },
  secretText: { flex: 1, fontSize: 15, letterSpacing: 1.5, color: colors.text, fontWeight: font.weightBold },

  gradBtn: { height: 54, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  gradBtnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },

  outlineBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, marginTop: spacing.lg, height: 50, borderRadius: radius.md, borderWidth: 1, borderColor: colors.borderStrong },
  outlineBtnText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },

  onCard: { flexDirection: "row", alignItems: "center", gap: spacing.md, backgroundColor: "#e7f8ee", borderRadius: radius.lg, padding: spacing.lg },
  onTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },
  onDesc: { marginTop: 2, fontSize: font.sm, color: colors.textMuted },

  successIcon: { alignSelf: "center", width: 56, height: 56, borderRadius: 28, backgroundColor: colors.success, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  codesBox: { marginTop: spacing.lg, backgroundColor: colors.bgMuted, borderRadius: radius.lg, padding: spacing.lg, gap: 8 },
  codeText: { fontSize: 16, letterSpacing: 2, color: colors.text, fontWeight: font.weightBold, textAlign: "center" },
});
