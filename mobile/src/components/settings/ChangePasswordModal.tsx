import { useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { authApi } from "@/api/auth.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Change password. On success the backend revokes ALL sessions (incl. this one),
 * so onChanged() should sign the user out.
 */
export function ChangePasswordModal({
  visible,
  onClose,
  onChanged,
}: {
  visible: boolean;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() { setCurrent(""); setNext(""); setConfirm(""); setError(null); }

  const valid = current.length > 0 && next.length >= 8 && next === confirm;

  async function submit() {
    if (!current) { setError("Enter your current password."); return; }
    if (next.length < 8) { setError("New password must be at least 8 characters."); return; }
    if (next !== confirm) { setError("New passwords don't match."); return; }
    setBusy(true);
    setError(null);
    try {
      await authApi.changePassword({ current_password: current, password: next, password_confirmation: confirm });
      reset();
      onChanged();
    } catch (e) {
      setError(apiErrorMessage(e, "Couldn't change password."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={styles.title}>Change Password</Text>
          <Text style={styles.subtitle}>You'll be signed out and need to log in again.</Text>

          <Field placeholder="Current password" value={current} onChangeText={setCurrent} />
          <Field placeholder="New password (min 8 chars)" value={next} onChangeText={setNext} />
          <Field placeholder="Confirm new password" value={confirm} onChangeText={setConfirm} />

          {!!error && <Text style={styles.error}>{error}</Text>}

          <Pressable onPress={submit} disabled={!valid || busy} style={{ marginTop: spacing.lg }}>
            <LinearGradient
              colors={!valid || busy ? ["#f4b6c2", "#f4b6c2"] : ["#ff3b63", "#fe2c55"]}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.btn}
            >
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.btnText}>Update Password</Text>}
            </LinearGradient>
          </Pressable>
          <Pressable onPress={() => { reset(); onClose(); }} style={styles.cancel}><Text style={styles.cancelText}>Cancel</Text></Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field(props: { placeholder: string; value: string; onChangeText: (t: string) => void }) {
  return (
    <TextInput
      style={styles.input}
      secureTextEntry
      autoCapitalize="none"
      autoCorrect={false}
      placeholderTextColor={colors.textFaint}
      {...props}
    />
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
  subtitle: { marginTop: 4, marginBottom: spacing.md, fontSize: font.sm, color: colors.textMuted },
  input: { marginTop: spacing.sm, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md, paddingHorizontal: 14, height: 48, fontSize: font.md, color: colors.text },
  error: { marginTop: spacing.md, fontSize: font.sm, color: colors.danger, fontWeight: font.weightMedium },
  btn: { height: 52, borderRadius: radius.lg, alignItems: "center", justifyContent: "center" },
  btnText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
  cancel: { marginTop: spacing.md, alignItems: "center" },
  cancelText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.textMuted },
});
