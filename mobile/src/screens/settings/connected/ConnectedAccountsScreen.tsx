import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SettingsHeader, SettingsLoading, SettingsEmpty } from "@/components/settings/SettingsKit";
import { accountApi, type SocialAccountItem } from "@/api/account.api";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const iconFor = (provider: string): keyof typeof Ionicons.glyphMap =>
  provider === "apple" ? "logo-apple" : provider === "google" ? "logo-google" : "link-outline";

export function ConnectedAccountsScreen() {
  const insets = useSafeAreaInsets();
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["social-accounts"], queryFn: accountApi.socialAccounts });
  const accounts = data ?? [];

  const disconnect = (item: SocialAccountItem) => {
    Alert.alert(
      `Disconnect ${item.label}`,
      `Remove ${item.label} sign-in from your account? You can reconnect any time by signing in with ${item.label}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Disconnect", style: "destructive", onPress: async () => {
            try {
              const res = await accountApi.unlinkSocialAccount(item.provider);
              if (!res.success) { Alert.alert("Couldn't disconnect", res.message); return; }
              qc.invalidateQueries({ queryKey: ["social-accounts"] });
            } catch (e: any) {
              Alert.alert("Couldn't disconnect", e?.response?.data?.message ?? "Please try again.");
            }
          },
        },
      ],
    );
  };

  const connect = (item: SocialAccountItem) => {
    Alert.alert(
      `Connect ${item.label}`,
      `To link your ${item.label} account, sign out and choose "Continue with ${item.label}" on the login screen - it links to this account automatically when the email matches.`,
      [{ text: "Got it" }],
    );
  };

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Connected Accounts" subtitle="Third-party sign-ins linked to your Teezer account." />

        {isLoading ? (
          <SettingsLoading />
        ) : isError ? (
          <SettingsEmpty icon="cloud-offline-outline" title="Couldn't load" desc="Check your connection and try again." />
        ) : (
          <View style={styles.list}>
            {accounts.map((item, i) => (
              <View key={item.provider}>
                <View style={styles.row}>
                  <View style={styles.iconCircle}>
                    <Ionicons name={iconFor(item.provider)} size={22} color={colors.text} />
                  </View>
                  <View style={styles.rowText}>
                    <Text style={styles.rowTitle}>{item.label}</Text>
                    <Text style={styles.rowDesc}>{item.linked ? (item.email ?? "Connected") : "Not connected"}</Text>
                  </View>
                  {item.linked ? (
                    <Pressable hitSlop={8} onPress={() => disconnect(item)} style={({ pressed }) => [styles.btn, styles.btnOutline, pressed && { opacity: 0.6 }]}>
                      <Text style={styles.btnOutlineText}>Disconnect</Text>
                    </Pressable>
                  ) : (
                    <Pressable hitSlop={8} onPress={() => connect(item)} style={({ pressed }) => [styles.btn, styles.btnBrand, pressed && { opacity: 0.85 }]}>
                      <Text style={styles.btnBrandText}>Connect</Text>
                    </Pressable>
                  )}
                </View>
                {i < accounts.length - 1 && <View style={styles.divider} />}
              </View>
            ))}
          </View>
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

  btn: { paddingHorizontal: spacing.md, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  btnOutline: { borderWidth: 1, borderColor: colors.borderStrong },
  btnOutlineText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.danger },
  btnBrand: { backgroundColor: colors.brand },
  btnBrandText: { fontSize: font.xs, fontWeight: font.weightHeavy, color: colors.white },
});
