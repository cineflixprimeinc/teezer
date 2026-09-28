import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { confirmLogout } from "@/utils/logout-flow";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WEB = "https://teezer.live";

/** The Studio's own mark, not a generic glyph - it is a product in its own
 *  right and the website's menu badges it the same way. */
const STUDIO_MARK = require("../../assets/teezer-studio-mark.png");

interface Row {
  icon: React.ReactNode;
  title: string;
  desc: string;
  url?: string;
  onPress?: () => void;
}

/** The profile three-dot page - a full Settings menu (links to the website settings). */
export function ProfileActionsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const open = (url: string) => Linking.openURL(url).catch(() => {});

  const I = (name: keyof typeof Ionicons.glyphMap, size = 24) => <Ionicons name={name} size={size} color={colors.text} />;
  const M = (name: keyof typeof MaterialCommunityIcons.glyphMap, size = 23) => <MaterialCommunityIcons name={name} size={size} color={colors.text} />;

  const SECTIONS: { title: string; rows: Row[] }[] = [
    {
      title: "ACCOUNT",
      rows: [
        { icon: I("person-outline"), title: "Account Settings", desc: "Manage your account details and personal info", onPress: () => navigation.navigate("AccountSettings") },
        { icon: I("shield-checkmark-outline"), title: "Login & Security", desc: "Password, devices and login activity", onPress: () => navigation.navigate("LoginSecurity") },
        { icon: I("lock-closed-outline"), title: "Privacy & Safety", desc: "Control who can view and interact with you", onPress: () => navigation.navigate("PrivacySafety") },
        { icon: I("person-add-outline"), title: "Follow Requests", desc: "Manage follow requests and approvals", onPress: () => navigation.navigate("FollowRequests") },
        { icon: M("shield-alert-outline"), title: "My Restrictions", desc: "Restrictions applied to your account", onPress: () => navigation.navigate("MyRestrictions") },
        { icon: I("notifications-outline"), title: "Notifications", desc: "Push, email and SMS alerts", onPress: () => navigation.navigate("NotificationSettings") },
        { icon: I("speedometer-outline"), title: "Content Preferences", desc: "Feed, display and content controls", onPress: () => navigation.navigate("ContentPreferences") },
        { icon: I("accessibility-outline"), title: "Accessibility Settings", desc: "Display, motion, captions and assistive options", onPress: () => navigation.navigate("AccessibilitySettings") },
        { icon: M("account-supervisor-outline"), title: "Family Control", desc: "Manage family pairing, parental controls, and digital wellbeing.", onPress: () => navigation.navigate("FamilyControl") },
      ],
    },
    {
      title: "CREATOR & TOOLS",
      rows: [
        // Restored to the slot it held before the teardown. The app has no
        // Studio screens of its own, so this opens the website's Studio - which
        // is exactly what the original row did.
        // Native now - it used to open the website's Studio because the app had
        // none. StudioRoot mounts above the tab shell with its own hierarchy.
        { icon: <Image source={STUDIO_MARK} style={styles.brandIcon} resizeMode="contain" />, title: "Teezer Studio", desc: "Create, edit and manage your content", onPress: () => navigation.navigate("StudioRoot") },
        // "Sell on Teezer" moved to Studio -> Monetization (the "Sell on
        // Teezer" programme row there opens this exact same screen) - it
        // belongs alongside the other monetization programmes, not
        // duplicated here as a second, disconnected entry point.
        { icon: I("wifi-outline"), title: "Live Settings", desc: "Manage live stream options and permissions", url: `${WEB}/settings/live` },
      ],
    },
    {
      title: "APP PREFERENCES",
      rows: [
        { icon: M("theme-light-dark"), title: "Appearance", desc: "Theme, dark mode, text size and app icon", onPress: () => navigation.navigate("Appearance") },
        { icon: I("server-outline"), title: "Storage & Data", desc: "Manage cache, data saver and network usage", onPress: () => navigation.navigate("StorageData") },
        { icon: I("download-outline"), title: "Downloads", desc: "Downloaded videos, quality and Wi-Fi only", onPress: () => navigation.navigate("Downloads") },
        { icon: I("chatbubble-ellipses-outline"), title: "Messages", desc: "Who can message you, read receipts and requests", onPress: () => navigation.navigate("MessagesSettings") },
        { icon: M("heart-pulse"), title: "Digital Wellbeing", desc: "Screen time, break reminders and daily limits", onPress: () => navigation.navigate("DigitalWellbeing") },
        { icon: I("sparkles-outline"), title: "AI Features", desc: "AI recommendations, labels and generative tools", onPress: () => navigation.navigate("AIFeatures") },
      ],
    },
    {
      title: "CONNECTED ACCOUNTS",
      rows: [
        { icon: I("link-outline"), title: "Connected Accounts", desc: "Google, Apple and other linked sign-ins", onPress: () => navigation.navigate("ConnectedAccounts") },
        { icon: I("apps-outline"), title: "Authorized Apps", desc: "Third-party apps with access to your account", onPress: () => navigation.navigate("AuthorizedApps") },
        { icon: M("account-clock-outline"), title: "Active Sessions", desc: "Devices and browsers signed in to your account", onPress: () => navigation.navigate("ActiveSessions") },
      ],
    },
    {
      title: "SUPPORT",
      rows: [
        { icon: I("help-buoy-outline"), title: "Help Center", desc: "Get help and contact support", onPress: () => navigation.navigate("HelpCenter") },
        { icon: I("warning-outline"), title: "Report a Problem", desc: "Send feedback or report an issue", onPress: () => navigation.navigate("ReportProblem") },
        { icon: M("scale-balance"), title: "Community Guidelines", desc: "All Teezer rules and policies", onPress: () => navigation.navigate("Policies") },
      ],
    },
    {
      title: "ABOUT & LEGAL",
      rows: [
        { icon: I("information-circle-outline"), title: "About Teezer", desc: "App info and company details", onPress: () => navigation.navigate("AboutTeezer") },
      ],
    },
  ];

  // Back to the feed on logout, the same as Settings' own logout row.
  //
  // This used to pass an empty callback, on the reasoning that "with the feed
  // gone this page IS the shell's home". The feed is reachable again, so that
  // left someone sitting on a settings page belonging to the account they had
  // just signed out of - every row still listed, none of them theirs.
  //
  // No manual refresh needed: signOut() drops the user-scoped caches and
  // scrubs the per-viewer like/save flags off the public ones it deliberately
  // keeps, so the feed arrives in guest state and carries on playing.
  const logout = () => confirmLogout(() => navigation.navigate("Main", { screen: "Home" }));

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={23} color={colors.text} strokeWidth={2.2} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.backSpacer} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            {/* Rows grouped into one rounded card - the spec's card treatment
                (11-14px radius on a muted fill) rather than edge-to-edge rows. */}
            <View style={styles.card}>
              {section.rows.map((row, i) => (
                <Pressable key={row.title} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={row.onPress ?? (() => row.url && open(row.url))}>
                  <View style={styles.rowIcon}>{row.icon}</View>
                  <View style={[styles.rowContent, i < section.rows.length - 1 && styles.rowDivider]}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Text style={styles.rowDesc}>{row.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={17} color={colors.textFaint} />
                  </View>
                </Pressable>
              ))}
            </View>
          </View>
        ))}

        <Pressable style={({ pressed }) => [styles.logout, pressed && styles.logoutPressed]} onPress={logout}>
          <Ionicons name="log-out-outline" size={20} color={colors.danger} />
          <Text style={styles.logoutText}>Log Out</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, height: 56 },
  // Circular muted back button - matches the profile page's back control.
  back: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center",
  },
  backSpacer: { width: 36 },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 21, fontWeight: font.weightHeavy, color: colors.text, letterSpacing: -0.45 },

  section: { marginTop: spacing.xl },
  sectionLabel: {
    paddingHorizontal: 20, marginBottom: spacing.sm,
    fontSize: font.xs, fontWeight: font.weightHeavy, color: colors.textFaint, letterSpacing: 0.7,
  },
  // Grouped card - 14px radius, muted fill, hairline border (the spec's surface).
  card: {
    marginHorizontal: spacing.lg,
    backgroundColor: colors.bgMuted,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.borderStrong,
    overflow: "hidden",
  },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: 14 },
  rowPressed: { backgroundColor: colors.border },
  // Icon sits on its own white tile, echoing the profile action row's square buttons.
  rowIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  /** A brand mark rather than a glyph - sized to sit on the same 34pt tile. */
  brandIcon: { width: 22, height: 22 },
  rowContent: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingVertical: 13, paddingRight: 14, marginLeft: spacing.md,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderStrong },
  rowTitle: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.text, letterSpacing: -0.15 },
  rowDesc: { marginTop: 2, fontSize: 12.5, color: colors.textMuted, lineHeight: 17 },

  logout: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.xl,
    height: 48, borderRadius: 11,
    backgroundColor: colors.bgMuted,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.borderStrong,
  },
  logoutPressed: { backgroundColor: colors.border },
  logoutText: { fontSize: 14.5, fontWeight: font.weightBold, color: colors.danger },
});
