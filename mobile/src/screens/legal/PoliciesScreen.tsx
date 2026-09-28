import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { ChevronLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Screen } from "@/components/Screen";
import { openPolicy } from "@/store/policy.store";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

const WEB = "https://teezer.live";
type Ion = keyof typeof Ionicons.glyphMap;

interface PolicyRow {
  icon: Ion;
  title: string;
  desc: string;
  url: string;
}

/* Every Teezer policy, line by line. Each row opens its own dedicated live
   policy page in the in-app viewer, so nothing here can go stale. */
const SECTIONS: { title: string; rows: PolicyRow[] }[] = [
  {
    title: "CORE POLICIES",
    rows: [
      { icon: "people-outline", title: "Community Guidelines", desc: "What's allowed on Teezer, and what's not", url: `${WEB}/guidelines` },
      { icon: "document-text-outline", title: "Terms of Service", desc: "The agreement that governs your use of Teezer", url: `${WEB}/terms` },
      { icon: "shield-checkmark-outline", title: "Privacy Policy", desc: "How we collect, use and protect your data", url: `${WEB}/privacy` },
    ],
  },
  {
    title: "SAFETY & COMMUNITY RULES",
    rows: [
      { icon: "alert-circle-outline", title: "Safety Policy", desc: "Violence, self-harm and dangerous acts", url: `${WEB}/policies/safety` },
      { icon: "eye-off-outline", title: "Adult Content Policy", desc: "Nudity and sexual content rules", url: `${WEB}/policies/adult-content` },
      { icon: "happy-outline", title: "Minor Safety Policy", desc: "Protecting children and teens", url: `${WEB}/policies/minor-safety` },
      { icon: "hand-left-outline", title: "Harassment & Bullying Policy", desc: "Respectful behaviour and anti-doxxing rules", url: `${WEB}/policies/harassment` },
      { icon: "heart-dislike-outline", title: "Hateful Behaviour Policy", desc: "Zero tolerance for hate speech", url: `${WEB}/policies/hateful-behavior` },
      { icon: "checkmark-done-outline", title: "Integrity & Authenticity Policy", desc: "No impersonation, spam or fake engagement", url: `${WEB}/policies/integrity` },
      { icon: "sparkles-outline", title: "AI-Generated Content Policy", desc: "Labels and rules for synthetic media", url: `${WEB}/policies/ai-content` },
      { icon: "scale-outline", title: "Enforcement & Appeals", desc: "How rules are enforced and how to appeal", url: `${WEB}/policies/enforcement` },
    ],
  },
  {
    title: "LEGAL & DATA RULES",
    rows: [
      { icon: "briefcase-outline", title: "Copyright Policy", desc: "Reporting infringement, counter-notices and music rules", url: `${WEB}/copyright` },
      { icon: "diamond-outline", title: "Virtual Items Policy", desc: "Coins, Gifts, wallets, refunds and payouts", url: `${WEB}/virtual-items` },
      { icon: "cash-outline", title: "Creator Earnings & Payouts", desc: "Monetization eligibility and payout rules", url: `${WEB}/policies/creator-earnings` },
      { icon: "disc-outline", title: "Cookie Policy", desc: "Cookies and storage used on the website", url: `${WEB}/cookies` },
      { icon: "server-outline", title: "Data Collection Policy", desc: "What information Teezer collects and why", url: `${WEB}/policies/data-collection` },
      { icon: "share-social-outline", title: "Data Sharing Policy", desc: "Who receives your information and why", url: `${WEB}/policies/data-sharing` },
      { icon: "time-outline", title: "Data Retention & Deletion", desc: "How long data is kept and what deletion does", url: `${WEB}/policies/data-retention` },
      { icon: "lock-closed-outline", title: "Security Policy", desc: "How Teezer protects your account and data", url: `${WEB}/policies/security` },
      { icon: "person-outline", title: "Your Rights & Controls", desc: "Access, export, correction and deletion rights", url: `${WEB}/policies/your-rights` },
      { icon: "business-outline", title: "Law Enforcement Guidelines", desc: "How authorities can request data from Teezer", url: `${WEB}/law-enforcement` },
    ],
  },
];

/**
 * All Teezer policies in one place - opened from the three-dot menu's
 * Community Guidelines row. Every row opens the live website page (or the
 * exact policy section) in the in-app viewer, so nothing here can go stale.
 */
export function PoliciesScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();

  return (
    <Screen edges={["top"]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
      >
        {/* Heading - same treatment as Account Settings */}
        <View style={styles.titleRow}>
          <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
            <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
          </Pressable>
          <Text style={styles.title}>Guidelines & Policies</Text>
        </View>
        <Text style={styles.subtitle}>
          The rules that keep Teezer safe, and the policies that protect you.
        </Text>

        {SECTIONS.map((section) => (
          <View key={section.title} style={styles.section}>
            <Text style={styles.sectionLabel}>{section.title}</Text>
            <View style={styles.list}>
              {section.rows.map((row, i) => (
                <View key={row.title}>
                  <Pressable
                    style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
                    onPress={() => openPolicy({ url: row.url, title: row.title })}
                  >
                    <View style={styles.iconCircle}>
                      <Ionicons name={row.icon} size={20} color={colors.text} />
                    </View>
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
