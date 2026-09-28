import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

interface Row {
  icon: React.ReactNode;
  title: string;
  desc: string;
  route: string;
}

interface Section {
  title: string;
  rows: Row[];
}

/**
 * Family Control - opened from the profile three-dot menu › Family Control.
 * A grouped menu of family-pairing, parental-control and safety areas; each row
 * navigates to its own page (placeholders for now). Same sectioned settings
 * design as the Accessibility and Account Settings pages.
 */
export function FamilyControlScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  const I = (name: keyof typeof Ionicons.glyphMap) => <Ionicons name={name} size={20} color={colors.text} />;
  const M = (name: keyof typeof MaterialCommunityIcons.glyphMap) => <MaterialCommunityIcons name={name} size={20} color={colors.text} />;

  const SECTIONS: Section[] = [
    {
      title: "CHILD SAFETY",
      rows: [
        { icon: M("account-child-outline"), title: "Child Mode", desc: "A safer, limited experience for younger users.", route: "ChildMode" },
        { icon: M("shield-lock-outline"), title: "Content Controls", desc: "Filter mature, sensitive and violent content.", route: "ContentControls" },
      ],
    },
    {
      title: "FAMILY PAIRING",
      rows: [
        { icon: M("account-multiple-plus-outline"), title: "Family Pairing", desc: "Link a parent and child account.", route: "FamilyPairing" },
        { icon: I("people-outline"), title: "Linked Family Members", desc: "View and manage connected family accounts.", route: "LinkedFamilyMembers" },
      ],
    },
    {
      title: "PARENTAL CONTROLS",
      rows: [
        { icon: I("time-outline"), title: "Screen Time", desc: "Set daily usage limits and bedtime schedules.", route: "ScreenTime" },
        { icon: M("shield-lock-outline"), title: "Content Restrictions", desc: "Restrict mature or age-sensitive content.", route: "ContentRestrictions" },
        { icon: I("chatbubbles-outline"), title: "Messaging & Interactions", desc: "Control messaging, comments, follows, mentions, and tags.", route: "MessagingInteractions" },
        { icon: I("radio-outline"), title: "Live Streaming Controls", desc: "Allow or block Live viewing and Live creation.", route: "LiveStreamingControls" },
      ],
    },
    {
      title: "SAFETY",
      rows: [
        { icon: I("stats-chart-outline"), title: "Activity Reports", desc: "View weekly activity summaries and screen time.", route: "ActivityReports" },
        { icon: I("card-outline"), title: "Purchase Approval", desc: "Require approval before coins, gifts, or subscriptions.", route: "PurchaseApproval" },
        { icon: I("call-outline"), title: "Emergency Contact", desc: "Manage trusted family contacts.", route: "EmergencyContact" },
      ],
    },
  ];

  return (
    <Screen edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
      >
        {/* Heading - same treatment as Account / Accessibility Settings */}
        <View style={styles.titleRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Family Control</Text>
        </View>
        <Text style={styles.subtitle}>Manage family pairing, parental controls, and digital wellbeing.</Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.list}>
              {section.rows.map((row, i) => (
                <View key={row.title}>
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => navigation.navigate(row.route)}
                  >
                    <View style={styles.iconCircle}>{row.icon}</View>
                    <View style={styles.rowText}>
                      <Text style={styles.rowTitle}>{row.title}</Text>
                      <Text style={styles.rowDesc}>{row.desc}</Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={colors.textFaint} />
                  </Pressable>
                  {i < section.rows.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 56 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xxl, fontWeight: font.weightHeavy, color: colors.text },
  subtitle: { paddingHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md, fontSize: font.lg, lineHeight: 26, color: colors.textMuted },

  section: { marginTop: spacing.lg },
  sectionLabel: { paddingHorizontal: spacing.lg, marginBottom: spacing.xs, fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6 },
  list: { paddingHorizontal: spacing.lg },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  rowPressed: { backgroundColor: colors.bgMuted, borderRadius: 12 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1 },
  rowTitle: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  rowDesc: { marginTop: 2, fontSize: font.sm, lineHeight: 19, color: colors.textMuted },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 44 + spacing.md },
});
