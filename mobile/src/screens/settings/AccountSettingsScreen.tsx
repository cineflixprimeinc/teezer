import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WEB = "https://teezer.live";

interface Row {
  icon: React.ReactNode;
  title: string;
  desc: string;
  url?: string;
  onPress?: () => void;
}

/**
 * Account Settings - opened from the profile three-dot menu › Account Settings.
 * A grouped menu of the account-management areas; each row deep-links to the
 * matching web settings page (same hybrid pattern the rest of the app uses).
 */
export function AccountSettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  const ROWS: Row[] = [
    {
      icon: <Ionicons name="person-outline" size={22} color={colors.text} />,
      title: "Profile Information",
      desc: "Manage name, username, bio, profile photo and category",
      onPress: () => navigation.navigate("ProfileInfo"),
    },
    {
      icon: <Ionicons name="link-outline" size={22} color={colors.text} />,
      title: "Social Links",
      desc: "Add or update Facebook, Instagram, TikTok, YouTube, X/Twitter and website",
      onPress: () => navigation.navigate("SocialLinks"),
    },
    {
      icon: <Ionicons name="globe-outline" size={22} color={colors.text} />,
      title: "Country & Region",
      desc: "Manage detected country, region and country change request",
      onPress: () => navigation.navigate("CountryRegion"),
    },
    {
      icon: <MaterialCommunityIcons name="database-outline" size={22} color={colors.text} />,
      title: "Account Data",
      desc: "Download data, account status, profile visibility and email verification",
      onPress: () => navigation.navigate("AccountData"),
    },
  ];

  return (
    <Screen edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
      >
        {/* Heading */}
        <View style={styles.titleRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Account Settings</Text>
        </View>
        <Text style={styles.subtitle}>
          Manage your profile, social links, country settings and account data.
        </Text>

        {/* Rows */}
        <View style={styles.list}>
          {ROWS.map((row, i) => (
            <View key={row.title}>
              <Pressable
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                onPress={row.onPress ?? (() => row.url && open(row.url))}
              >
                <View style={styles.iconCircle}>{row.icon}</View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowDesc}>{row.desc}</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
              </Pressable>
              {i < ROWS.length - 1 && <View style={styles.divider} />}
            </View>
          ))}
        </View>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    height: 56,
  },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.sm,
    marginBottom: spacing.xl,
    fontSize: font.lg,
    lineHeight: 26,
    color: colors.textMuted,
  },

  list: { paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.lg },
  rowPressed: { backgroundColor: colors.bgMuted, borderRadius: 12 },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.bgMuted,
    alignItems: "center",
    justifyContent: "center",
  },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  rowDesc: { marginTop: 4, fontSize: font.sm, lineHeight: 20, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 48 + spacing.md },
});
