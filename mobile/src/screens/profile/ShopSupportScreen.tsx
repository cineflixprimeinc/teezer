import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import { ChevronLeft, ChevronRight, Flag, HelpCircle, MessageSquareWarning } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Shop Settings > Support > Shop Support. Reuses the app's existing help
 * system entirely, not a new shop-specific one. "Help Centre" opens
 * ShopHelpScreen - already a shop-topic-scoped help browser (search +
 * Applying/Selling/Payments articles, opened today from the Sell on Teezer
 * intro screen's "?") and already has its own "Contact Support" action
 * built in, so it's the closer reuse than the platform-wide HelpCenter here.
 * "Contact Support" and "Report a Shop Problem" both open ReportProblemScreen
 * - the same generic issue-report flow every other "report a problem" entry
 * point in the app already uses (mailto-based) - rather than a new backend
 * reports table.
 */
export function ShopSupportScreen() {
  const navigation = useNavigation<any>();

  const rows = [
    { icon: HelpCircle, title: "Help Centre", desc: "Guides for selling, applying and getting paid.", onPress: () => navigation.navigate("ShopHelp") },
    { icon: MessageSquareWarning, title: "Contact Support", desc: "Get in touch with the Teezer team.", onPress: () => navigation.navigate("ReportProblem") },
    { icon: Flag, title: "Report a Shop Problem", desc: "Tell us about an issue with your shop.", onPress: () => navigation.navigate("ReportProblem") },
  ];

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Shop Support</Text>
        <View style={s.back} />
      </View>

      <View style={s.body}>
        {rows.map((row) => {
          const Icon = row.icon;
          return (
            <Pressable key={row.title} style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]} onPress={row.onPress}>
              <View style={s.iconTile}>
                <Icon size={19} color={colors.text} strokeWidth={2} />
              </View>
              <View style={s.rowBody}>
                <Text style={s.label}>{row.title}</Text>
                <Text style={s.sub}>{row.desc}</Text>
              </View>
              <ChevronRight size={16} color={colors.textFaint} strokeWidth={2.2} />
            </Pressable>
          );
        })}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  body: { paddingHorizontal: spacing.lg, paddingTop: spacing.md },
  row: {
    flexDirection: "row", alignItems: "center", gap: 13, paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  iconTile: { width: 40, height: 40, borderRadius: radius.md, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  rowBody: { flex: 1, gap: 2 },
  label: { fontSize: 14, fontWeight: font.weightBold, color: colors.text },
  sub: { fontSize: 12, color: colors.textMuted },
});
