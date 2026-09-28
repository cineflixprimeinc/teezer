import { useState } from "react";
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { prefsApi } from "@/api/prefs.api";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

export type PinMode = "set" | "change" | "verify";

/**
 * Parent PIN modal - sets, changes or verifies the 4–6 digit family PIN that
 * gates Child Mode. The PIN is stored hashed server-side (/profile/family/pin);
 * "verify" resolves only when the entered PIN matches.
 */
export function ParentPinModal({ visible, mode, onClose, onSuccess }: {
  visible: boolean; mode: PinMode; onClose: () => void; onSuccess: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => { setCurrent(""); setPin(""); setConfirm(""); setError(null); setBusy(false); onClose(); };

  const title = mode === "verify" ? "Enter Parent PIN" : mode === "change" ? "Change Parent PIN" : "Set Parent PIN";
  const subtitle = mode === "verify"
    ? "Enter your parent PIN to continue."
    : "Your PIN protects Child Mode. Choose a 4–6 digit code you'll remember.";

  const submit = async () => {
    setError(null);
    if (mode === "verify") {
      if (pin.length < 4) { setError("Enter your PIN."); return; }
      setBusy(true);
      const ok = await prefsApi.verifyFamilyPin(pin);
      setBusy(false);
      if (!ok) { setError("Incorrect PIN. Try again."); setPin(""); return; }
      onSuccess(); close();
      return;
    }
    if (pin.length < 4 || pin.length > 6) { setError("PIN must be 4–6 digits."); return; }
    if (pin !== confirm) { setError("PINs don't match."); return; }
    setBusy(true);
    try {
      const res = await prefsApi.setFamilyPin(pin, mode === "change" ? current : undefined);
      setBusy(false);
      if (!res.success) { setError(res.message || "Couldn't save PIN."); return; }
      onSuccess(); close();
    } catch (e: any) {
      setBusy(false);
      setError(e?.response?.data?.message ?? "Couldn't save PIN. Please try again.");
    }
  };

  const pinField = (value: string, setter: (v: string) => void, placeholder: string) => (
    <TextInput
      value={value}
      onChangeText={(t) => setter(t.replace(/[^0-9]/g, "").slice(0, 6))}
      placeholder={placeholder}
      placeholderTextColor={colors.textFaint}
      keyboardType="number-pad"
      secureTextEntry
      maxLength={6}
      style={styles.input}
    />
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.subtitle}>{subtitle}</Text>

          {mode === "change" && pinField(current, setCurrent, "Current PIN")}
          {pinField(pin, setPin, mode === "verify" ? "PIN" : "New PIN")}
          {mode !== "verify" && pinField(confirm, setConfirm, "Confirm PIN")}

          {!!error && <Text style={styles.error}>{error}</Text>}

          <View style={styles.actions}>
            <Pressable style={[styles.btn, styles.btnGhost]} onPress={close} disabled={busy}>
              <Text style={styles.btnGhostText}>Cancel</Text>
            </Pressable>
            <Pressable style={[styles.btn, styles.btnBrand, busy && { opacity: 0.6 }]} onPress={submit} disabled={busy}>
              {busy ? <ActivityIndicator color={colors.white} size="small" /> : <Text style={styles.btnBrandText}>{mode === "verify" ? "Confirm" : "Save PIN"}</Text>}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  card: { width: "100%", maxWidth: 360, backgroundColor: colors.card, borderRadius: 20, padding: spacing.lg },
  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { marginTop: spacing.xs, marginBottom: spacing.md, fontSize: font.sm, lineHeight: 20, color: colors.textMuted },
  input: {
    height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: colors.bgMuted,
    paddingHorizontal: spacing.md, marginTop: spacing.sm, fontSize: font.lg, letterSpacing: 6, color: colors.text,
  },
  error: { marginTop: spacing.sm, fontSize: font.sm, color: colors.danger },
  actions: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg },
  btn: { flex: 1, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  btnGhost: { borderWidth: 1, borderColor: colors.borderStrong },
  btnGhostText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  btnBrand: { backgroundColor: colors.brand },
  btnBrandText: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.white },
});
