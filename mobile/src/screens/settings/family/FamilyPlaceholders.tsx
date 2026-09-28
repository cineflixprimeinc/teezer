import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/**
 * Shared placeholder used by every Family Control sub-page until each feature is
 * built out. Keeps the same heading treatment as the Account / Accessibility
 * settings pages, with a centered "coming soon" state. Each sub-page below is a
 * thin wrapper so it can be replaced with the real UI later, one file at a time.
 */
function FamilyPlaceholder({ title, subtitle, icon }: { title: string; subtitle: string; icon: React.ReactNode }) {
  const navigation = useNavigation<any>();
  return (
    <Screen edges={["top"]}>
      {/* Heading - same treatment as the other settings pages */}
      <View style={styles.titleRow}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.subtitle}>{subtitle}</Text>

      <View style={styles.empty}>
        <View style={styles.emptyIcon}>{icon}</View>
        <Text style={styles.emptyTitle}>Coming soon</Text>
        <Text style={styles.emptyDesc}>
          This section isn&apos;t available yet. We&apos;re building it - check back in a future update.
        </Text>
      </View>
    </Screen>
  );
}

export const FamilyPairingScreen = () => (
  <FamilyPlaceholder
    title="Family Pairing"
    subtitle="Link a parent and child account."
    icon={<MaterialCommunityIcons name="account-multiple-plus-outline" size={30} color={colors.brand} />}
  />
);

export const LinkedFamilyMembersScreen = () => (
  <FamilyPlaceholder
    title="Linked Family Members"
    subtitle="View and manage connected family accounts."
    icon={<Ionicons name="people-outline" size={30} color={colors.brand} />}
  />
);

export const ContentRestrictionsScreen = () => (
  <FamilyPlaceholder
    title="Content Restrictions"
    subtitle="Restrict mature or age-sensitive content."
    icon={<MaterialCommunityIcons name="shield-lock-outline" size={30} color={colors.brand} />}
  />
);

export const MessagingInteractionsScreen = () => (
  <FamilyPlaceholder
    title="Messaging & Interactions"
    subtitle="Control messaging, comments, follows, mentions, and tags."
    icon={<Ionicons name="chatbubbles-outline" size={30} color={colors.brand} />}
  />
);

export const LiveStreamingControlsScreen = () => (
  <FamilyPlaceholder
    title="Live Streaming Controls"
    subtitle="Allow or block Live viewing and Live creation."
    icon={<Ionicons name="radio-outline" size={30} color={colors.brand} />}
  />
);

export const ActivityReportsScreen = () => (
  <FamilyPlaceholder
    title="Activity Reports"
    subtitle="View weekly activity summaries and screen time."
    icon={<Ionicons name="stats-chart-outline" size={30} color={colors.brand} />}
  />
);

export const PurchaseApprovalScreen = () => (
  <FamilyPlaceholder
    title="Purchase Approval"
    subtitle="Require approval before coins, gifts, or subscriptions."
    icon={<Ionicons name="card-outline" size={30} color={colors.brand} />}
  />
);

export const EmergencyContactScreen = () => (
  <FamilyPlaceholder
    title="Emergency Contact"
    subtitle="Manage trusted family contacts."
    icon={<Ionicons name="call-outline" size={30} color={colors.brand} />}
  />
);

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 56 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: font.lg, lineHeight: 26, color: colors.textMuted },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  emptyTitle: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  emptyDesc: { marginTop: spacing.sm, fontSize: font.sm, lineHeight: 20, color: colors.textMuted, textAlign: "center", maxWidth: 300 },
});
