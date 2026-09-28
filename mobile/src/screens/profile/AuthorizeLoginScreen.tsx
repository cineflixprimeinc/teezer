import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Laptop, ShieldCheck, XCircle } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { qrLoginApi, type QrScanResult } from "@/api/qr-login.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Reached only from ScanScreen.tsx's Scan tab, after it decodes a QR-login
 * URL (qrLoginUrl() in ProfileActionsSheet.tsx) - "Log in to Teezer on the
 * web?" with Confirm/Deny, the phone-side half of the website's "Use QR
 * code" login. See QrLoginController.php's own docblock for the full flow.
 *
 * scan() is called once, on mount, both to claim the ticket (so a second
 * phone can't also scan the same code) and to fetch what to actually show -
 * this screen never trusts the QR payload itself for anything beyond the
 * ticket id.
 */
type Status = "loading" | "ready" | "confirming" | "denying" | "done" | "error";

export function AuthorizeLoginScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "AuthorizeLogin">>();
  const { ticket } = route.params;

  const [status, setStatus] = useState<Status>("loading");
  const [info, setInfo] = useState<QrScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    qrLoginApi.scan(ticket)
      .then((data) => { if (!cancelled) { setInfo(data); setStatus("ready"); } })
      .catch((e) => { if (!cancelled) { setError(apiErrorMessage(e, "This code can't be used.")); setStatus("error"); } });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticket]);

  const done = (message: string) => {
    setStatus("done");
    setTimeout(() => {
      // Back past both this screen and the Scan camera it came from.
      if (navigation.canGoBack()) navigation.pop(2);
    }, 900);
    setError(message);
  };

  const onConfirm = async () => {
    setStatus("confirming");
    try {
      await qrLoginApi.confirm(ticket);
      done("Logged in on the web.");
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't approve this login."));
      setStatus("error");
    }
  };

  const onDeny = async () => {
    setStatus("denying");
    try {
      await qrLoginApi.deny(ticket);
      done("Login request denied.");
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't deny this login."));
      setStatus("error");
    }
  };

  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <View style={s.center}>
        {status === "loading" && <ActivityIndicator color={colors.brand} />}

        {status === "error" && (
          <>
            <View style={[s.iconCircle, s.iconCircleMuted]}><XCircle size={30} color={colors.textMuted} /></View>
            <Text style={s.title}>{error}</Text>
            <Pressable style={s.doneBtn} onPress={() => navigation.goBack()}>
              <Text style={s.doneBtnText}>Done</Text>
            </Pressable>
          </>
        )}

        {status === "done" && (
          <>
            <View style={s.iconCircle}><ShieldCheck size={30} color={colors.white} /></View>
            <Text style={s.title}>{error /* reused as the success message */}</Text>
          </>
        )}

        {(status === "ready" || status === "confirming" || status === "denying") && info && (
          <>
            <View style={s.iconCircleOutline}><Laptop size={28} color={colors.brand} strokeWidth={2} /></View>
            <Text style={s.title}>Log in on the web?</Text>
            <Text style={s.subtitle}>
              {info.label}
              {info.country ? ` · ${info.country}` : ""}
            </Text>
            <Text style={s.hint}>
              Someone is trying to log in to your Teezer account from this browser. If this isn&apos;t you, deny it.
            </Text>

            <View style={s.actions}>
              <Pressable style={s.denyBtn} disabled={status !== "ready"} onPress={onDeny}>
                {status === "denying" ? <ActivityIndicator color={colors.text} /> : <Text style={s.denyBtnText}>Deny</Text>}
              </Pressable>
              <Pressable style={s.confirmBtn} disabled={status !== "ready"} onPress={onConfirm}>
                {status === "confirming" ? <ActivityIndicator color={colors.white} /> : <Text style={s.confirmBtnText}>Confirm</Text>}
              </Pressable>
            </View>
          </>
        )}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, gap: spacing.sm },

  iconCircle: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },
  iconCircleMuted: { backgroundColor: colors.bgMuted },
  iconCircleOutline: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.sm },

  title: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text, textAlign: "center" },
  subtitle: { marginTop: 2, fontSize: font.md, fontWeight: font.weightBold, color: colors.textSecondary, textAlign: "center" },
  hint: { marginTop: spacing.sm, fontSize: font.xs, color: colors.textMuted, textAlign: "center", lineHeight: 18, maxWidth: 300 },

  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.xl, alignSelf: "stretch" },
  denyBtn: { flex: 1, height: 48, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  denyBtnText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  confirmBtn: { flex: 1, height: 48, borderRadius: radius.pill, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  confirmBtnText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },

  doneBtn: { marginTop: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.sm, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  doneBtnText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
});
