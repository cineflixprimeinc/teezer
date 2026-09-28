import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator, Alert, Animated, Easing, Pressable, ScrollView, StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { StatusBar } from "expo-status-bar";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { Logo } from "@/components/Logo";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { ACCENT, AccountIdentity, PressCard } from "@/components/auth/account-ui";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import type { SavedAccount } from "@/utils/secure-store";
import { confirmWithBiometrics } from "@/utils/biometric-gate";

/**
 * Teezer Saved Accounts - the "Welcome back" landing shown (instead of the plain
 * login screen) whenever the device has one or more saved accounts. One tap on a
 * card resumes that account's saved session; no password unless it expired.
 *
 * Guest-first app: this is presented as a modal over the feed, so dismissing it
 * (X) just returns to the guest feed. A successful switch flips auth status →
 * RootNavigator dismisses the modal automatically.
 */
export function SavedAccountsScreen() {
  const navigation = useNavigation<any>();
  const accounts = useAuthStore((s) => s.accounts);
  const activeId = useAuthStore((s) => s.user?.id);
  const switchAccount = useAuthStore((s) => s.switchAccount);
  const [busyId, setBusyId] = useState<number | null>(null);

  // Fade + rise in on mount (native driver → 60/120fps).
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, { toValue: 1, duration: 320, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, [anim]);
  const translateY = anim.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });

  const onTap = async (acc: SavedAccount) => {
    if (busyId) return;
    setBusyId(acc.id);
    // Confirm it's actually the device owner before swapping the session -
    // saved-account tokens live decrypted-at-rest, so an unlocked phone alone
    // used to be enough to pivot into any of them.
    const confirmed = await confirmWithBiometrics(`Switch to @${acc.username}?`);
    if (!confirmed) { setBusyId(null); return; }
    const res = await switchAccount(acc.id);
    setBusyId(null);
    if (res.ok) return; // auth status flips → RootNavigator pops this modal
    if (res.expired) {
      // Saved session expired → re-enter the password for THIS account.
      navigation.navigate("LoginForm", { prefillLogin: acc.username, expired: true });
      return;
    }
    Alert.alert("Couldn't switch account", "Something went wrong. Please try again.");
  };

  const goLogin = () => navigation.navigate("Login");

  return (
    <Screen edges={["top", "bottom"]} bg={colors.bg}>
      <StatusBar style="dark" />

      {/* Top controls: close (→ guest feed) and Manage. */}
      <View style={styles.topBar}>
        <Pressable
          hitSlop={10}
          onPress={() => { useAuthGate.getState().close(); navigation.popToTop(); }}
          style={styles.iconBtn}
          accessibilityLabel="Close"
        >
          <Ionicons name="close" size={24} color={colors.text} />
        </Pressable>
        <Pressable hitSlop={10} onPress={() => navigation.navigate("ManageSavedAccounts")} style={styles.manageBtn}>
          <Ionicons name="settings-outline" size={15} color={ACCENT} />
          <Text style={styles.manageText}>Manage</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
        <Animated.View style={{ opacity: anim, transform: [{ translateY }] }}>
          {/* Top section */}
          <View style={styles.header}>
            <Logo height={34} />
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.subtitle}>Choose an account to continue</Text>
          </View>

          {/* Saved account cards */}
          <View style={styles.cards}>
            {accounts.map((acc) => {
              const active = acc.id === activeId;
              const busy = busyId === acc.id;
              return (
                <PressCard key={acc.id} onPress={() => onTap(acc)} disabled={!!busyId && !busy}>
                  <AccountIdentity account={acc} active={active} />
                  {busy
                    ? <ActivityIndicator color={ACCENT} />
                    : <View style={styles.arrow}><Ionicons name="arrow-forward" size={18} color={ACCENT} /></View>}
                </PressCard>
              );
            })}
          </View>

          {/* Bottom action: only path to a non-saved account is the normal login. */}
          <Pressable style={({ pressed }) => [styles.addBtn, pressed && styles.pressed]} onPress={goLogin}>
            <Ionicons name="add" size={20} color={ACCENT} />
            <Text style={styles.addText}>Login to Another Account</Text>
          </Pressable>
        </Animated.View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, height: 48, marginTop: spacing.lg },
  iconBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  manageBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, backgroundColor: "#FFEAF0" },
  manageText: { fontSize: font.sm, fontWeight: font.weightHeavy, color: ACCENT },

  body: { paddingHorizontal: spacing.xl, paddingTop: spacing.md, paddingBottom: spacing.xxl },
  header: { alignItems: "center", marginBottom: spacing.xl },
  welcome: { marginTop: spacing.xl, fontSize: 26, fontWeight: "800", color: colors.text, letterSpacing: -0.5 },
  subtitle: { marginTop: 6, fontSize: 15, color: colors.textMuted },

  cards: { gap: spacing.md },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: "#FFEAF0", alignItems: "center", justifyContent: "center" },

  addBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    marginTop: spacing.xl, height: 54, borderRadius: 18,
    borderWidth: 1.5, borderColor: ACCENT, borderStyle: "dashed", backgroundColor: colors.white,
  },
  addText: { fontSize: font.md, fontWeight: font.weightHeavy, color: ACCENT },
  pressed: { opacity: 0.6 },

  dividerRow: { flexDirection: "row", alignItems: "center", gap: 12, marginVertical: spacing.xl },
  line: { flex: 1, height: StyleSheet.hairlineWidth, backgroundColor: colors.borderStrong },
  dividerText: { fontSize: font.xs, color: colors.textFaint, fontWeight: font.weightMedium },

  socialCol: { gap: spacing.md },
  social: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10,
    height: 52, borderRadius: 16, borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.white,
  },
  socialText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
});
