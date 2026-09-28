import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { BottomSheet } from "@/components/BottomSheet";
import { useAuthStore } from "@/store/auth.store";
import { useSaveAccountPrompt } from "@/store/save-account-prompt.store";
import { navigationRef } from "@/navigation/ref";
import { ACCENT, AccountIdentity } from "@/components/auth/account-ui";
import { MAX_SAVED_ACCOUNTS, type SavedAccount } from "@/utils/secure-store";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/**
 * Rendered once at the root. After a first-time sign-in on this device the auth
 * store opens this via `useSaveAccountPrompt`, offering to save the account for
 * one-tap login. If the device is already at the 5-account cap it flips to the
 * "maximum reached" message with a shortcut to Manage.
 */
export function SaveAccountPromptModal() {
  const insets = useSafeAreaInsets();
  const account = useSaveAccountPrompt((s) => s.account);
  const limitReached = useSaveAccountPrompt((s) => s.limitReached);
  const showLimit = useSaveAccountPrompt((s) => s.showLimit);
  const dismiss = useSaveAccountPrompt((s) => s.dismiss);
  const saveAccount = useAuthStore((s) => s.saveAccount);
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    setSaving(true);
    const res = await saveAccount();
    setSaving(false);
    if (res.limit) { showLimit(); return; } // at cap → show the max-reached variant
    dismiss();
  };

  const onManage = () => {
    dismiss();
    if (navigationRef.isReady()) navigationRef.navigate("ManageSavedAccounts" as never);
  };

  const display: SavedAccount | null = account ? { ...account, token: "" } : null;

  return (
    <BottomSheet visible={account != null} onClose={dismiss} scrollable={false}>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        {limitReached ? (
          <>
            <View style={styles.iconWrap}><Ionicons name="albums-outline" size={26} color={ACCENT} /></View>
            <Text style={styles.title}>Maximum Saved Accounts Reached</Text>
            <Text style={styles.subtitle}>
              You can save up to {MAX_SAVED_ACCOUNTS} Teezer accounts on this device. To save another account, please remove one of your existing saved accounts.
            </Text>
            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed]} onPress={onManage}>
              <Text style={styles.primaryText}>Manage Saved Accounts</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.ghost, pressed && styles.pressed]} onPress={dismiss}>
              <Text style={styles.ghostText}>Cancel</Text>
            </Pressable>
          </>
        ) : (
          <>
            <Text style={styles.title}>Save this account?</Text>
            <Text style={styles.subtitle}>Save it on this device to log back in with one tap. We store a secure token - never your password.</Text>

            {display && (
              <View style={styles.preview}>
                <AccountIdentity account={display} avatarSize={46} />
              </View>
            )}

            <Pressable style={({ pressed }) => [styles.primary, pressed && styles.pressed, saving && styles.pressed]} onPress={onSave} disabled={saving}>
              <Text style={styles.primaryText}>{saving ? "Saving…" : "Save Account"}</Text>
            </Pressable>
            <Pressable style={({ pressed }) => [styles.ghost, pressed && styles.pressed]} onPress={dismiss}>
              <Text style={styles.ghostText}>Not Now</Text>
            </Pressable>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: spacing.xl, paddingTop: spacing.md },
  iconWrap: { alignSelf: "center", width: 56, height: 56, borderRadius: 28, backgroundColor: "#FFEAF0", alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  title: { fontSize: 20, fontWeight: "800", color: colors.text, textAlign: "center", letterSpacing: -0.3 },
  subtitle: { marginTop: spacing.sm, fontSize: 14, lineHeight: 20, color: colors.textMuted, textAlign: "center" },

  preview: {
    flexDirection: "row", alignItems: "center", gap: 12, marginTop: spacing.lg,
    backgroundColor: colors.bgMuted, borderRadius: 16, padding: 12,
  },

  primary: { marginTop: spacing.xl, height: 54, borderRadius: 16, backgroundColor: ACCENT, alignItems: "center", justifyContent: "center" },
  primaryText: { color: colors.white, fontSize: font.md, fontWeight: font.weightHeavy },
  ghost: { marginTop: spacing.sm, height: 50, borderRadius: 16, alignItems: "center", justifyContent: "center" },
  ghostText: { color: colors.textSecondary, fontSize: font.md, fontWeight: font.weightBold },
  pressed: { opacity: 0.7 },
});
