import { ScrollView, StyleSheet, Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { ArrowUpRight, ChevronRight, FileText } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { SettingsHeader } from "@/components/settings/SettingsKit";
import { openPolicy } from "@/store/policy.store";
import { STUDIO_LEGAL, type StudioLegalDoc } from "./studio-legal-content";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

export function StudioLegalScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, { doc: StudioLegalDoc }>, string>>();
  const doc = route.params?.doc ?? "creator-agreement";
  const content = STUDIO_LEGAL[doc];

  return (
    <Screen edges={["top"]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.xl }}>
        <SettingsHeader title={content.title} />

        <View style={s.body}>
          <Text style={s.updated}>Last updated {content.updated}</Text>
          <Text style={s.intro}>{content.intro}</Text>

          {content.sections.map((sec) => (
            <View key={sec.heading} style={s.section}>
              <Text style={s.heading}>{sec.heading}</Text>
              {sec.paragraphs?.map((p, i) => <Text key={i} style={s.paragraph}>{p}</Text>)}
              {sec.bullets?.map((b, i) => (
                <View key={i} style={s.bulletRow}>
                  <View style={s.bulletDot} />
                  <Text style={s.bulletText}>{b}</Text>
                </View>
              ))}
            </View>
          ))}

          {/* Related policies - links to the binding site policies + sibling docs */}
          <Text style={s.relatedHead}>Related policies</Text>
          <View style={s.relatedCard}>
            {content.related.map((link, i) => (
              <View key={link.label}>
                <Pressable
                  style={({ pressed }) => [s.relatedRow, pressed && s.relatedRowPressed]}
                  onPress={() => (link.kind === "policy" ? openPolicy(link.policy) : navigation.navigate("StudioLegal", { doc: link.doc }))}
                >
                  <View style={s.relatedIcon}><FileText size={17} color={colors.brand} strokeWidth={2.2} /></View>
                  <Text style={s.relatedLabel}>{link.label}</Text>
                  {link.kind === "policy"
                    ? <ArrowUpRight size={18} color={colors.textFaint} strokeWidth={2.2} />
                    : <ChevronRight size={18} color={colors.textFaint} strokeWidth={2.2} />}
                </Pressable>
                {i < content.related.length - 1 && <View style={s.divider} />}
              </View>
            ))}
          </View>

          <Text style={s.note}>
            This is a plain-language summary for creators. Where it refers to broader rules, Teezer’s Terms of Service and
            Privacy Policy are the full and binding versions.
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { paddingHorizontal: spacing.lg },
  updated: { fontSize: font.xs, color: colors.textFaint, fontWeight: font.weightMedium, marginBottom: spacing.md },
  intro: { fontSize: font.md, lineHeight: 23, color: colors.textSecondary },

  section: { marginTop: spacing.xl },
  heading: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.sm },
  paragraph: { fontSize: font.sm, lineHeight: 22, color: colors.textSecondary, marginBottom: spacing.sm },
  bulletRow: { flexDirection: "row", gap: spacing.sm, marginTop: 4, paddingRight: spacing.xs },
  bulletDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.brand, marginTop: 8 },
  bulletText: { flex: 1, fontSize: font.sm, lineHeight: 22, color: colors.textSecondary },

  relatedHead: { fontSize: font.sm, fontWeight: font.weightHeavy, color: colors.text, marginTop: spacing.xxl, marginBottom: spacing.sm },
  relatedCard: { backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border, paddingHorizontal: spacing.lg },
  relatedRow: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.md },
  relatedRowPressed: { backgroundColor: colors.bgMuted, borderRadius: radius.sm },
  relatedIcon: { width: 34, height: 34, borderRadius: radius.md, backgroundColor: colors.brandTint, alignItems: "center", justifyContent: "center" },
  relatedLabel: { flex: 1, fontSize: font.md, fontWeight: font.weightMedium, color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginLeft: 34 + spacing.md },

  note: { marginTop: spacing.xl, fontSize: font.xs, lineHeight: 17, color: colors.textFaint },
});
