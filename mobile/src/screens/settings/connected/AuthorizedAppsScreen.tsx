import { Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Screen } from "@/components/Screen";
import { SettingsHeader, SettingsLoading, SettingsEmpty } from "@/components/settings/SettingsKit";
import { accountApi, type AuthorizedApp } from "@/api/account.api";
import { colors } from "@/constants/colors";
import { font, spacing, radius, TAB_BAR_HEIGHT } from "@/constants/theme";

/** Human labels for the internal permission scopes. */
const SCOPE_LABEL: Record<string, string> = {
  profile: "Basic profile",
  email: "Email address",
  business: "Business account access",
  "ads.manage": "Advertising account management",
};

/** Per-client logo shown in the list (served from the app's public assets). */
const CLIENT_LOGO: Record<string, string> = {
  ads: "https://ads.teezer.live/favicon.png",
};

function formatDate(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function AppRow({ app }: { app: AuthorizedApp }) {
  const logo = CLIENT_LOGO[app.client];
  const granted = formatDate(app.granted_at);
  const scopes = (app.scopes ?? []).map((s) => SCOPE_LABEL[s] ?? s);

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.iconCircle}>
          {logo ? (
            <Image source={{ uri: logo }} style={styles.logo} resizeMode="contain" />
          ) : (
            <Ionicons name="cube-outline" size={22} color={colors.text} />
          )}
        </View>
        <View style={styles.headText}>
          <Text style={styles.title}>{app.display_name}</Text>
          <Text style={styles.sub}>
            Signed in with your Teezer Account{granted ? ` · authorized ${granted}` : ""}
          </Text>
        </View>
      </View>

      {scopes.length > 0 && (
        <View style={styles.perms}>
          <Text style={styles.permsLabel}>Has access to</Text>
          {scopes.map((label, i) => (
            <View key={i} style={styles.permRow}>
              <Ionicons name="checkmark-circle" size={16} color={colors.brand} />
              <Text style={styles.permText}>{label}</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.note}>
        <Ionicons name="shield-checkmark-outline" size={14} color={colors.textMuted} />
        <Text style={styles.noteText}>
          You can revoke access anytime from ads.teezer.live. This does not affect your Teezer login.
        </Text>
      </View>
    </View>
  );
}

export function AuthorizedAppsScreen() {
  const insets = useSafeAreaInsets();
  const { data, isLoading, isError } = useQuery({ queryKey: ["authorized-apps"], queryFn: accountApi.authorizedApps });
  const apps = data ?? [];

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ flexGrow: 1, paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        <SettingsHeader title="Authorized Apps" subtitle="Teezer services you've granted access to your Teezer account." />

        {isLoading ? (
          <SettingsLoading />
        ) : isError ? (
          <SettingsEmpty icon="cloud-offline-outline" title="Couldn't load" desc="Check your connection and try again." />
        ) : apps.length === 0 ? (
          <SettingsEmpty
            icon="shield-checkmark-outline"
            title="No authorized apps"
            desc="Apps like Teezer Ads that you sign into with your Teezer account will appear here."
          />
        ) : (
          <View style={styles.list}>
            {apps.map((app) => (
              <AppRow key={app.client} app={app} />
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: spacing.lg, gap: spacing.md },
  card: {
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, borderRadius: radius.lg,
    backgroundColor: colors.white, padding: spacing.lg, gap: spacing.md,
  },
  head: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  iconCircle: {
    width: 46, height: 46, borderRadius: 23, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", overflow: "hidden",
  },
  logo: { width: 30, height: 30 },
  headText: { flex: 1 },
  title: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  sub: { marginTop: 2, fontSize: font.xs, lineHeight: 17, color: colors.textMuted },

  perms: { gap: spacing.xs },
  permsLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.4 },
  permRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  permText: { fontSize: font.sm, color: colors.textSecondary },

  note: { flexDirection: "row", alignItems: "flex-start", gap: spacing.sm, paddingTop: spacing.xs },
  noteText: { flex: 1, fontSize: font.xs, lineHeight: 16, color: colors.textMuted },
});
