import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SettingsHeader, SettingsLoading, SettingsEmpty } from "@/components/settings/SettingsKit";
import { accountApi, type SessionItem } from "@/api/account.api";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

function timeAgo(iso: string | null): string {
  if (!iso) return "-";
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return "Just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

/**
 * Active Sessions - the single place to see and manage everywhere the account is
 * signed in (Sanctum personal access tokens with device / browser / IP metadata
 * from /account/sessions). The current session can't be revoked.
 */
export function ActiveSessionsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["account-sessions"], queryFn: accountApi.sessions });
  const sessions = data ?? [];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["account-sessions"] });

  const revokeOne = (item: SessionItem) => {
    Alert.alert("End session", `Sign out ${item.label}? You'll need to log in again there.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "End", style: "destructive", onPress: async () => {
          try { await accountApi.revokeSession(item.id); invalidate(); }
          catch { Alert.alert("Error", "Couldn't complete that. Please try again."); }
        },
      },
    ]);
  };

  const revokeAll = () => {
    Alert.alert("Log out everywhere else", "Signs out all other devices and sessions. This one stays logged in.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out others", style: "destructive", onPress: async () => {
          try { await accountApi.revokeAllSessions(); invalidate(); }
          catch { Alert.alert("Error", "Couldn't complete that. Please try again."); }
        },
      },
    ]);
  };

  const iconFor = (t: string): keyof typeof Ionicons.glyphMap => (t === "mobile" ? "phone-portrait-outline" : "desktop-outline");
  const others = sessions.filter((s) => !s.is_current).length;

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Active Sessions" subtitle="Devices and browsers signed in to your account. End any you don't recognize." />

        {isLoading ? (
          <SettingsLoading />
        ) : isError ? (
          <SettingsEmpty icon="cloud-offline-outline" title="Couldn't load" desc="Check your connection and try again." />
        ) : sessions.length === 0 ? (
          <SettingsEmpty icon="shield-checkmark-outline" title="No active sessions" />
        ) : (
          <View style={styles.list}>
            {sessions.map((item, i) => (
              <View key={item.id}>
                <View style={styles.row}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={iconFor(item.type)} size={20} color={colors.text} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.label}</Text>
                    <Text style={styles.rowDesc}>
                      {[item.ip, item.is_current ? "Active now" : timeAgo(item.last_used)].filter(Boolean).join(" · ")}
                    </Text>
                  </View>
                  {item.is_current ? (
                    <View style={styles.currentChip}><Text style={styles.currentText}>This device</Text></View>
                  ) : (
                    <Pressable hitSlop={8} onPress={() => revokeOne(item)} style={({ pressed }) => [styles.revokeBtn, pressed && { opacity: 0.6 }]}>
                      <Text style={styles.revokeText}>End</Text>
                    </Pressable>
                  )}
                </View>
                {i < sessions.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
        )}

        {others > 0 && (
          <Pressable onPress={revokeAll} style={({ pressed }) => [styles.logoutAll, pressed && { opacity: 0.6 }]}>
            <Ionicons name="log-out-outline" size={20} color={colors.danger} />
            <Text style={styles.logoutAllText}>Log out all other sessions</Text>
          </Pressable>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 44 + spacing.md },

  currentChip: { paddingHorizontal: spacing.sm, height: 26, borderRadius: 999, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  currentText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.brand },
  revokeBtn: { paddingHorizontal: spacing.md, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  revokeText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.danger },

  logoutAll: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm, marginTop: spacing.lg, marginHorizontal: spacing.lg, height: 48, borderRadius: 12, borderWidth: 1, borderColor: colors.borderStrong },
  logoutAllText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.danger },
});
