import { useState } from "react";
import { BackHandler, Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useScreenTimeStore } from "@/store/screen-time.store";
import { useFamilyStore } from "@/store/app-prefs.store";
import { ParentPinModal } from "@/screens/settings/family/ParentPinModal";
import { activityTracker } from "@/services/activity-tracker";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

function fmt(sec: number): string {
  const m = Math.round(sec / 60);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/**
 * Root-level enforcement overlay. Watches the screen-time store and shows the
 * break popup and the full-screen daily-limit page over the whole app. When
 * Family Control's Child Mode is on, extending past the limit requires the
 * parent PIN.
 */
export function ScreenTimeGate() {
  const insets = useSafeAreaInsets();
  const limitReached = useScreenTimeStore((s) => s.limitReached);
  const breakDue = useScreenTimeStore((s) => s.breakDue);
  /**
   * Only track the ticking counter while a gate is actually on screen.
   *
   * `todaySeconds` is written by activity-tracker every second, and this
   * component sits above the whole app rendering three <Modal>s. Subscribing to
   * it unconditionally re-rendered all three - native dialog windows on Android
   * - once per second for the entire app lifetime, purely to keep a number that
   * is not visible unless a gate is open. That constant native churn is enough
   * to make taps anywhere in the app drop and need repeating.
   *
   * Closed, the selector returns a constant, so nothing re-renders.
   */
  const gateOpen = breakDue || limitReached;
  const todaySeconds = useScreenTimeStore((s) => (gateOpen ? s.todaySeconds : 0));
  const childGated = useFamilyStore((s) => s.prefs.child_mode_enabled && s.prefs.pin_set);
  const [pinOpen, setPinOpen] = useState(false);

  const closeApp = () => { if (Platform.OS === "android") BackHandler.exitApp(); };
  const grant = () => useScreenTimeStore.getState().grantContinue(15);

  const onContinue = () => { if (childGated) { setPinOpen(true); return; } grant(); };
  const onBreakTake = () => { useScreenTimeStore.getState().dismissBreak(); activityTracker.resetBreak(); closeApp(); };
  const onBreakContinue = () => { useScreenTimeStore.getState().dismissBreak(); activityTracker.resetBreak(); };

  return (
    <>
      {/* Break popup */}
      <Modal visible={breakDue && !limitReached} transparent animationType="fade" onRequestClose={onBreakContinue}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.breakIcon}><Ionicons name="cafe-outline" size={30} color={colors.brand} /></View>
            <Text style={styles.title}>Time for a break</Text>
            <Text style={styles.msg}>You've been using Teezer for {fmt(todaySeconds)}. Time for a short break.</Text>
            <View style={styles.row}>
              <Pressable style={[styles.btn, styles.ghost]} onPress={onBreakContinue}><Text style={styles.ghostT}>Continue</Text></Pressable>
              <Pressable style={[styles.btn, styles.brand]} onPress={onBreakTake}><Text style={styles.brandT}>Take Break</Text></Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {/* Daily limit fullscreen */}
      <Modal visible={limitReached} animationType="fade" onRequestClose={() => {}}>
        <LinearGradient colors={["#1d1130", "#2a1548"]} style={[styles.full, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.fullIcon}><Ionicons name="hourglass-outline" size={40} color="#fff" /></View>
          <Text style={styles.fullTitle}>Daily Screen Time Limit Reached</Text>
          <Text style={styles.fullMsg}>You've reached today's Teezer limit. Take a break and come back tomorrow.</Text>
          <Text style={styles.fullTime}>{fmt(todaySeconds)} used today</Text>

          <View style={{ flex: 1 }} />

          <Pressable style={[styles.fullBtn, styles.fullBrand]} onPress={onContinue}>
            <Text style={styles.fullBrandT}>Continue for 15 Minutes</Text>
          </Pressable>
          {childGated && <Text style={styles.pinHint}>Parent PIN required to continue</Text>}
          <Pressable style={[styles.fullBtn, styles.fullGhost]} onPress={closeApp}>
            <Text style={styles.fullGhostT}>Close Teezer</Text>
          </Pressable>
        </LinearGradient>
      </Modal>

      <ParentPinModal visible={pinOpen} mode="verify" onClose={() => setPinOpen(false)} onSuccess={() => { setPinOpen(false); grant(); }} />
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: spacing.xl },
  sheet: { width: "100%", maxWidth: 360, backgroundColor: colors.card, borderRadius: 22, padding: spacing.xl, alignItems: "center" },
  breakIcon: { width: 64, height: 64, borderRadius: 32, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.md },
  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  msg: { marginTop: spacing.xs, fontSize: font.sm, lineHeight: 21, color: colors.textMuted, textAlign: "center" },
  row: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.lg, alignSelf: "stretch" },
  btn: { flex: 1, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  ghost: { borderWidth: 1, borderColor: colors.borderStrong },
  ghostT: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.textSecondary },
  brand: { backgroundColor: colors.brand },
  brandT: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.white },

  full: { flex: 1, alignItems: "center", paddingHorizontal: spacing.xl },
  fullIcon: { width: 88, height: 88, borderRadius: 44, backgroundColor: "rgba(255,255,255,0.12)", alignItems: "center", justifyContent: "center", marginBottom: spacing.xl },
  fullTitle: { fontSize: 26, fontWeight: font.weightHeavy, color: "#fff", textAlign: "center", lineHeight: 32 },
  fullMsg: { marginTop: spacing.md, fontSize: font.md, lineHeight: 24, color: "rgba(255,255,255,0.75)", textAlign: "center", maxWidth: 320 },
  fullTime: { marginTop: spacing.lg, fontSize: font.sm, fontWeight: font.weightBold, color: "rgba(255,255,255,0.55)" },
  fullBtn: { alignSelf: "stretch", height: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", marginTop: spacing.md },
  fullBrand: { backgroundColor: colors.brand },
  fullBrandT: { fontSize: font.md, fontWeight: font.weightHeavy, color: "#fff" },
  fullGhost: { borderWidth: 1, borderColor: "rgba(255,255,255,0.25)" },
  fullGhostT: { fontSize: font.md, fontWeight: font.weightBold, color: "#fff" },
  pinHint: { marginTop: spacing.sm, fontSize: font.xs, color: "rgba(255,255,255,0.5)" },
});
