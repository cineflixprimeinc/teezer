import { useState } from "react";
import { Alert, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { Avatar } from "@/components/Avatar";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, Settings as SettingsIcon, ShieldCheck, SlidersHorizontal } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { WelcomePopup } from "@/components/WelcomePopup";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { AccountSwitcherSheet } from "@/components/profile/AccountSwitcherSheet";
import { useOnboarding } from "@/store/onboarding.store";
import { useAuthStore } from "@/store/auth.store";
import { confirmLogout } from "@/utils/logout-flow";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WEB = "https://teezer.live";

interface Row {
  icon: React.ReactNode;
  label: string;
  danger?: boolean;
  onPress: () => void;
}

/** Settings page (opened from the profile gear icon). */
export function SettingsScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const user = useAuthStore((s) => s.user);
  const welcome = useOnboarding("settings");
  const [switcherOpen, setSwitcherOpen] = useState(false);

  const username = user?.username ?? "";
  const name = user?.name || username;

  const open = (url: string) => Linking.openURL(url).catch(() => {});
  const soon = (what: string) => Alert.alert(what, "Coming soon.");
  const shareProfile = () => Share.share({ message: `Check out @${username} on Teezer · ${WEB}/@${username}` }).catch(() => {});
  const logout = () => confirmLogout(() => navigation.navigate("Main", { screen: "Home" }));

  const I = (name: keyof typeof Ionicons.glyphMap, size = 23, color: string = colors.text) => <Ionicons name={name} size={size} color={color} />;
  const M = (name: keyof typeof MaterialCommunityIcons.glyphMap, size = 22) => <MaterialCommunityIcons name={name} size={size} color={colors.text} />;

  const SECTIONS: { title: string; rows: Row[] }[] = [
    {
      title: "SHARE & IDENTITY",
      rows: [
        { icon: I("globe-outline"), label: "View as Public", onPress: () => soon("View as Public") },
        { icon: I("share-outline"), label: "Share Profile", onPress: shareProfile },
        { icon: I("link-outline"), label: "Copy Profile Link", onPress: () => soon("Copy Profile Link") },
        { icon: M("qrcode"), label: "My QR Code", onPress: () => soon("My QR Code") },
        { icon: I("information-circle-outline"), label: "About This Account", onPress: () => soon("About This Account") },
      ],
    },
    {
      title: "LIBRARY & ACTIVITY",
      rows: [
        { icon: I("bookmark-outline"), label: "Saved Videos", onPress: () => soon("Saved Videos") },
        { icon: I("time-outline"), label: "Watch History", onPress: () => open(`${WEB}/settings/history`) },
        { icon: I("create-outline"), label: "Drafts", onPress: () => soon("Drafts") },
        { icon: I("archive-outline"), label: "Archive", onPress: () => soon("Archive") },
      ],
    },
    {
      title: "SAFETY & CONTROLS",
      rows: [
        { icon: M("block-helper"), label: "Block User List", onPress: () => open(`${WEB}/settings/restrictions`) },
        { icon: I("flag-outline"), label: "Report Profile", onPress: () => soon("Report Profile") },
      ],
    },
    {
      // Legal pages open in the in-app popup (live website pages, never stale).
      title: "TERMS & POLICIES",
      rows: [
        { icon: I("document-text-outline"), label: "Terms of Service", onPress: () => openPolicy("terms") },
        { icon: I("shield-checkmark-outline"), label: "Privacy Policy", onPress: () => openPolicy("privacy") },
        { icon: I("people-outline"), label: "Community Guidelines", onPress: () => openPolicy("guidelines") },
      ],
    },
    {
      title: "ACCOUNT SHORTCUTS",
      rows: [
        { icon: M("account-switch-outline"), label: "Switch Account", onPress: () => setSwitcherOpen(true) },
        { icon: I("log-out-outline", 23, colors.danger), label: "Log Out", danger: true, onPress: logout },
      ],
    },
  ];

  return (
    <Screen edges={["top"]}>
      <View style={styles.header}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.headerTitle}>Settings</Text>
        <View style={styles.back} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}>
        {/* User card */}
        <Pressable style={styles.userCard} onPress={() => open(`${WEB}/settings/account`)}>
          <View style={styles.avatarRing}>
            <Avatar uri={user?.avatar} style={styles.avatar} />
            <View style={styles.musicBadge}>
              <Ionicons name="musical-note" size={13} color={colors.white} />
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{name}</Text>
              {user?.is_verified && <VerifiedBadge size={18} />}
            </View>
            <Text style={styles.handle} numberOfLines={1}>@{username}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textFaint} />
        </Pressable>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            {section.rows.map((row, i) => (
              <Pressable key={row.label} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]} onPress={row.onPress}>
                <View style={styles.rowIcon}>{row.icon}</View>
                <View style={[styles.rowContent, i < section.rows.length - 1 && styles.rowDivider]}>
                  <Text style={[styles.rowLabel, row.danger && styles.rowLabelDanger]}>{row.label}</Text>
                  <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                </View>
              </Pressable>
            ))}
          </View>
        ))}
      </ScrollView>

      <AccountSwitcherSheet visible={switcherOpen} onClose={() => setSwitcherOpen(false)} />

      <WelcomePopup
        visible={welcome.open}
        onClose={welcome.dismiss}
        icon={SettingsIcon}
        title="Welcome to Settings"
        description="Your account, privacy and preferences - all in one place."
        features={[
          { Icon: ShieldCheck, title: "Control your account", body: "Manage privacy, safety and who can reach you." },
          { Icon: SlidersHorizontal, title: "Make it yours", body: "Preferences, activity and account shortcuts, together." },
        ]}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.lg, height: 56 },
  back: { width: 40, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },

  userCard: { flexDirection: "row", alignItems: "center", gap: spacing.lg, paddingHorizontal: spacing.lg, paddingVertical: spacing.lg },
  avatarRing: { width: 76, height: 76, borderRadius: 38, borderWidth: 2.5, borderColor: colors.brand, padding: 3, backgroundColor: colors.white },
  avatar: { flex: 1, borderRadius: 34 },
  avatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.white, fontSize: 28, fontWeight: font.weightHeavy },
  musicBadge: {
    position: "absolute", right: -1, bottom: -1, width: 25, height: 25, borderRadius: 12.5,
    backgroundColor: colors.brand, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: colors.white,
  },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  name: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text, flexShrink: 1 },
  handle: { marginTop: 2, fontSize: font.md, color: colors.textMuted },

  section: { marginTop: spacing.md },
  sectionLabel: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6 },
  row: { flexDirection: "row", alignItems: "center", paddingLeft: spacing.lg },
  rowPressed: { backgroundColor: colors.bgMuted },
  rowIcon: { width: 40, alignItems: "flex-start", justifyContent: "center" },
  rowContent: {
    flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingVertical: 16, paddingRight: spacing.lg,
  },
  rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowLabel: { fontSize: font.md, fontWeight: font.weightMedium, color: colors.text },
  rowLabelDanger: { color: colors.danger, fontWeight: font.weightBold },
});
