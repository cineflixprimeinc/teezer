import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { ChevronRight } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { STUDIO_CATEGORY_META, type StudioSettingsCategory } from "./StudioSettingsDetailScreen";
import { sd, sr } from "./studio-design";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

/* ────────────────────────────────────────────────────────────────────────────
 * Teezer Studio → Settings  (menu)
 *
 * A grouped menu of rows (icon + title + description + chevron). Tapping a row
 * opens that category on its OWN page (StudioSettingsDetailScreen) with a back
 * button, so you drill in and come straight back to this menu.
 *
 * Studio-only - nothing the main app already owns is duplicated here.
 *
 * Drawn to the Claude Design prototype's `studioIsSettings` block, which is the
 * same row language the rest of Studio uses: a 40px #F4F2F5 icon tile, a 14px
 * bold label over a 12px muted line, a hairline divider, and a chevron. It used
 * to borrow the main app's SettingsKit (grey cards, brand-pink icons), which is
 * why it read as a different product to every other Studio tab. The groups,
 * their order, every row and where each one navigates are unchanged - this is
 * a re-skin, not a re-shuffle.
 * ──────────────────────────────────────────────────────────────────────────── */

const GROUPS: { title: string; items: StudioSettingsCategory[] }[] = [
  { title: "MONETIZATION & FINANCE", items: ["payments", "tax", "monetization", "business"] },
  { title: "GROWTH & CONTENT", items: ["advertising", "analytics", "ai", "music"] },
  { title: "DEVELOPER & DATA", items: ["developers", "data", "localization", "advanced"] },
  { title: "LEGAL", items: ["legal"] },
];

export function StudioSettingsSection() {
  const navigation = useNavigation<any>();

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.body}>
      <Text style={styles.intro}>
        Manage payments, monetization, business tools and studio preferences.
      </Text>

      {GROUPS.map((group, gi) => (
        <View key={group.title}>
          <Text style={[styles.groupLabel, gi === 0 && styles.groupLabelFirst]}>
            {group.title}
          </Text>

          {group.items.map((key) => {
            const meta = STUDIO_CATEGORY_META[key];
            const Icon = meta.icon;
            return (
              <Pressable
                key={key}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                onPress={() => navigation.navigate("StudioSettingsDetail", { category: key })}
              >
                <View style={styles.iconTile}>
                  <Icon size={19} color={sd.slate} strokeWidth={2} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.label} numberOfLines={1}>{meta.title}</Text>
                  <Text style={styles.sub} numberOfLines={1}>{meta.desc}</Text>
                </View>
                <ChevronRight size={15} color="#C7C2CE" strokeWidth={2.2} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  body: {
    paddingHorizontal: spacing.lg,
    paddingBottom: TAB_BAR_HEIGHT + spacing.xxl,
    backgroundColor: sd.page,
  },
  intro: {
    paddingTop: spacing.md,
    fontSize: 12.5,
    lineHeight: 19,
    color: sd.muted,
  },

  groupLabel: {
    fontSize: 12,
    fontWeight: font.weightBold,
    color: sd.muted,
    letterSpacing: 0.72,
    textTransform: "uppercase",
    paddingTop: 26,
    paddingBottom: 10,
  },
  groupLabelFirst: { paddingTop: 20 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: sd.divider,
  },
  iconTile: {
    width: 40,
    height: 40,
    flex: 0,
    borderRadius: sr.chip,
    backgroundColor: sd.fill,
    alignItems: "center",
    justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  label: {
    fontSize: 14,
    fontWeight: font.weightBold,
    color: sd.text,
    letterSpacing: -0.14,
  },
  sub: { fontSize: 12, color: sd.muted },
});
