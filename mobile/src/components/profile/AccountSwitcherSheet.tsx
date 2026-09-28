import { useRef, useState } from "react";
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Avatar } from "@/components/Avatar";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { BottomSheet } from "@/components/BottomSheet";
import { useAuthStore } from "@/store/auth.store";
import { VerifiedBadge } from "./VerifiedBadge";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import { confirmWithBiometrics } from "@/utils/biometric-gate";

/**
 * Account switcher bottom sheet - uses the app-wide BottomSheet shell.
 *
 * NAVIGATION (Add account / Manage / expired re-login) runs AFTER the exit
 * animation finishes and the Modal unmounts (closeThen → BottomSheet.onClosed),
 * so it never stacks a nav screen on top of a live native Modal (which corrupts
 * the back stack).
 *
 * The SWITCH ITSELF does NOT navigate - it only swaps the session in the store -
 * so it runs IMMEDIATELY on tap (with a per-row spinner), exactly like the
 * "Welcome back" screen. It must never be deferred into the close animation:
 * that made the whole switch hostage to onClosed firing, which is why tapping an
 * account could silently do nothing.
 */
export function AccountSwitcherSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const accounts = useAuthStore((s) => s.accounts);
  const activeId = useAuthStore((s) => s.user?.id);
  const switchAccount = useAuthStore((s) => s.switchAccount);

  const pending = useRef<(() => void) | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Request a close, optionally running `after` once the sheet has fully closed.
  const closeThen = (after?: () => void) => {
    pending.current = after ?? null;
    onClose();
  };

  // Switch to another saved account - runs NOW, not on close. A valid token swaps
  // the session (switchAccount clears caches + bumps loginCount, so the whole app
  // refreshes) and we close the sheet. An expired token needs the password screen,
  // which IS a navigation, so that one waits for the sheet to fully close. Anything
  // else surfaces an error instead of silently doing nothing. Works logged in/out.
  const onSwitch = async (id: number) => {
    if (busyId != null) return;              // a switch is already in flight
    if (id === activeId) { onClose(); return; } // already active → just close
    setBusyId(id);
    // Confirm it's actually the device owner before swapping the session -
    // saved-account tokens live decrypted-at-rest, so an unlocked phone alone
    // used to be enough to pivot into any of them.
    const target = accounts.find((a) => a.id === id);
    const confirmed = await confirmWithBiometrics(`Switch to @${target?.username ?? "this account"}?`);
    if (!confirmed) { setBusyId(null); return; }
    const res = await switchAccount(id);
    setBusyId(null);
    if (res.ok) { onClose(); return; }       // session swapped → close the sheet
    if (res.expired) {
      closeThen(() => navigation.navigate("LoginForm", { prefillLogin: res.account?.username, expired: true }));
      return;
    }
    Alert.alert("Couldn't switch account", "Something went wrong. Please try again.");
  };
  const onAdd = () => closeThen(() => navigation.navigate("Login"));
  const onManage = () => closeThen(() => navigation.navigate("ManageSavedAccounts"));

  return (
    <BottomSheet
      visible={visible}
      onClose={() => closeThen()}
      onClosed={() => { const cb = pending.current; pending.current = null; cb?.(); }}
      scrollable={false}
      maxHeightRatio={0.8}
    >
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Switch account</Text>
          <View style={styles.headerRight}>
            {accounts.length > 0 && (
              <Pressable hitSlop={8} onPress={onManage} accessibilityRole="button" accessibilityLabel="Manage saved accounts">
                <Text style={styles.manageLink}>Manage</Text>
              </Pressable>
            )}
            <Pressable hitSlop={10} onPress={() => closeThen()} style={styles.closeBtn} accessibilityRole="button" accessibilityLabel="Close">
              <Ionicons name="close" size={20} color={colors.text} />
            </Pressable>
          </View>
        </View>

        {accounts.map((a) => {
          const active = a.id === activeId;
          const busy = busyId === a.id;
          return (
            <Pressable
              key={a.id}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed, busyId != null && !busy && styles.rowDisabled]}
              onPress={() => onSwitch(a.id)}
              disabled={busyId != null}
            >
              <Avatar uri={a.avatar} style={styles.avatar} />
              <View style={{ flex: 1 }}>
                <View style={styles.nameRow}>
                  <Text style={styles.name} numberOfLines={1}>{a.name || a.username}</Text>
                  {a.is_verified && <VerifiedBadge size={15} />}
                </View>
                <Text style={styles.handle} numberOfLines={1}>@{a.username}</Text>
              </View>
              {busy
                ? <ActivityIndicator size="small" color={colors.brand} />
                : active
                  ? <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
                  : <Ionicons name="ellipse-outline" size={22} color={colors.borderStrong} />}
            </Pressable>
          );
        })}

        <Pressable style={({ pressed }) => [styles.addRow, pressed && styles.rowPressed]} onPress={onAdd}>
          <View style={styles.addIcon}>
            <Ionicons name="add" size={22} color={colors.brand} />
          </View>
          <Text style={styles.addText}>Add account</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
        </Pressable>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  sheet: { paddingHorizontal: spacing.lg, paddingTop: spacing.xs },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  headerRight: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  manageLink: { fontSize: font.sm, fontWeight: font.weightHeavy, color: "#F5074D" },
  title: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },

  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowPressed: { opacity: 0.6 },
  rowDisabled: { opacity: 0.4 },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.bgMuted },
  avatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.white, fontSize: 20, fontWeight: font.weightHeavy },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  name: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text, flexShrink: 1 },
  handle: { marginTop: 1, fontSize: font.sm, color: colors.textMuted },

  addRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingVertical: spacing.md,
    marginTop: spacing.xs,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  addIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    borderWidth: 1.5,
    borderColor: colors.brand,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  addText: { flex: 1, fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
});
