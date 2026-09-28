import { Dimensions, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Check, X } from "lucide-react-native";
import { BottomSheet } from "@/components/BottomSheet";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";
import { SPACE_LIGHT } from "./space-style";
import type { SpacesQuery } from "@/api/spaces.api";

/**
 * "Filter spaces" - the sheet behind the header's slider button.
 *
 * Every option here maps to a column the endpoint actually filters on
 * (sort/language/listeners_count/is_recorded/speaking_permission/host follows),
 * so nothing on it is decorative. Topic is deliberately absent: the chips above
 * the list already own that, and offering it twice invites the two to disagree.
 */

/** The filter state the page holds. `null` language means "any". */
export type SpacesFilter = {
  sort: NonNullable<SpacesQuery["sort"]>;
  size: NonNullable<SpacesQuery["size"]>;
  language: string | null;
  following: boolean;
  recorded: boolean;
  openMic: boolean;
};

export const DEFAULT_FILTER: SpacesFilter = {
  sort: "listeners",
  size: "any",
  language: null,
  following: false,
  recorded: false,
  openMic: false,
};

const SORTS: { id: SpacesFilter["sort"]; label: string }[] = [
  { id: "listeners", label: "Most listeners" },
  { id: "newest", label: "Just started" },
];

const SIZES: { id: SpacesFilter["size"]; label: string }[] = [
  { id: "any", label: "Any size" },
  { id: "small", label: "Under 50" },
  { id: "medium", label: "50 - 500" },
  { id: "large", label: "500+" },
];

/** Each label is written in its own language, as the spec asks. */
const LANGUAGES: { id: string | null; label: string }[] = [
  { id: null, label: "Any" },
  { id: "en", label: "English" },
  { id: "ne", label: "नेपाली" },
  { id: "hi", label: "हिन्दी" },
  { id: "es", label: "Español" },
];

const TOGGLES: { key: "following" | "recorded" | "openMic"; label: string; sub: string }[] = [
  { key: "following", label: "People I follow", sub: "Only rooms hosted by accounts you follow" },
  { key: "recorded", label: "Recorded rooms", sub: "Rooms that will be available as a replay" },
  { key: "openMic", label: "Open mic", sub: "Anyone who joins can speak" },
];

/** How many of the six controls are off their default - drives the badge. */
export function filterCount(f: SpacesFilter): number {
  let n = 0;
  if (f.sort !== DEFAULT_FILTER.sort) n++;
  if (f.size !== DEFAULT_FILTER.size) n++;
  if (f.language !== null) n++;
  if (f.following) n++;
  if (f.recorded) n++;
  if (f.openMic) n++;
  return n;
}

/** The one-line summary on the banner above the list. */
export function filterSummary(f: SpacesFilter): string {
  const parts: string[] = [];
  if (f.sort !== DEFAULT_FILTER.sort) parts.push(SORTS.find((s) => s.id === f.sort)!.label);
  if (f.size !== "any") parts.push(SIZES.find((s) => s.id === f.size)!.label);
  if (f.language) parts.push(LANGUAGES.find((l) => l.id === f.language)?.label ?? f.language);
  if (f.following) parts.push("People I follow");
  if (f.recorded) parts.push("Recorded");
  if (f.openMic) parts.push("Open mic");
  return parts.join(" · ");
}

export function SpacesFilterSheet({
  visible, filter, onChange, onClose, resultCount,
}: {
  visible: boolean;
  filter: SpacesFilter;
  onChange: (next: SpacesFilter) => void;
  onClose: () => void;
  /** Rooms currently matching - the apply button counts what you will get. */
  resultCount: number;
}) {
  const set = <K extends keyof SpacesFilter>(key: K, value: SpacesFilter[K]) =>
    onChange({ ...filter, [key]: value });

  const dirty = filterCount(filter) > 0;

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      maxHeightRatio={0.86}
      // Own the scrolling so Reset / Apply can sit in a footer that never
      // scrolls away - the spec's sticky bar.
      scrollable={false}
      dragArea="header"
      header={
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Filter spaces</Text>
          <Pressable onPress={onClose} hitSlop={8} style={styles.headerClose} accessibilityLabel="Close filters">
            <X size={14} color={SPACE_LIGHT.text} strokeWidth={2.8} />
          </Pressable>
        </View>
      }
    >
    <View style={styles.body}>
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
      <Group title="SORT BY">
        {SORTS.map((s) => (
          <Option key={s.id} label={s.label} on={filter.sort === s.id} onPress={() => set("sort", s.id)} />
        ))}
      </Group>

      <Group title="ROOM SIZE">
        {SIZES.map((s) => (
          <Option key={s.id} label={s.label} on={filter.size === s.id} onPress={() => set("size", s.id)} />
        ))}
      </Group>

      <Group title="LANGUAGE">
        {LANGUAGES.map((l) => (
          <Option
            key={l.id ?? "any"}
            label={l.label}
            on={filter.language === l.id}
            onPress={() => set("language", l.id)}
          />
        ))}
      </Group>

      <Text style={styles.groupLabel}>ONLY SHOW</Text>
      <View style={styles.toggleGroup}>
        {TOGGLES.map((t) => (
          <Pressable
            key={t.key}
            style={styles.toggleRow}
            onPress={() => set(t.key, !filter[t.key])}
            accessibilityRole="switch"
            accessibilityState={{ checked: filter[t.key] }}
          >
            <View style={styles.toggleText}>
              <Text style={styles.toggleLabel} numberOfLines={1}>{t.label}</Text>
              <Text style={styles.toggleSub} numberOfLines={1}>{t.sub}</Text>
            </View>
            <Switch on={filter[t.key]} />
          </Pressable>
        ))}
      </View>

    </ScrollView>

      {/* Sticky footer - always reachable, however long the groups get. */}
      <View style={styles.footer}>
        <Pressable
          onPress={() => onChange(DEFAULT_FILTER)}
          disabled={!dirty}
          style={({ pressed }) => [styles.resetBtn, pressed && styles.pressed]}
        >
          <Text style={[styles.reset, !dirty && styles.resetOff]}>Reset all</Text>
        </Pressable>
        <Pressable style={({ pressed }) => [styles.apply, pressed && styles.pressed]} onPress={onClose}>
          <Text style={styles.applyText}>
            {resultCount === 0 ? "No spaces match" : `Show ${resultCount} space${resultCount === 1 ? "" : "s"}`}
          </Text>
        </Pressable>
      </View>
    </View>
    </BottomSheet>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View>
      <Text style={styles.groupLabel}>{title}</Text>
      <View style={styles.options}>{children}</View>
    </View>
  );
}

function Option({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.option, on && styles.optionOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
    >
      {on && <Check size={12} color={colors.white} strokeWidth={3} />}
      <Text style={[styles.optionText, on && styles.optionTextOn]}>{label}</Text>
    </Pressable>
  );
}

/** The design's square-ish switch, shared with the settings sheet. */
export function Switch({ on }: { on: boolean }) {
  return (
    <View style={[styles.track, on && styles.trackOn]}>
      <View style={[styles.knob, on && styles.knobOn]} />
    </View>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },

  header: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 18, paddingTop: 4, paddingBottom: 10,
  },
  headerTitle: { fontSize: 17, fontWeight: font.weightHeavy, color: SPACE_LIGHT.text, letterSpacing: -0.3 },
  headerClose: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: SPACE_LIGHT.chip,
    alignItems: "center", justifyContent: "center",
  },
  // The list gets whatever is left after the footer; the footer never moves.
  body: { maxHeight: Math.round(Dimensions.get("window").height * 0.86) - 108 },
  scrollBody: { paddingBottom: 12 },
  footer: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: spacing.lg, paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: SPACE_LIGHT.line,
    backgroundColor: colors.bg,
  },
  resetBtn: { height: 48, paddingHorizontal: 16, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  reset: { fontSize: 13.5, fontWeight: font.weightHeavy, color: colors.brand },
  resetOff: { color: SPACE_LIGHT.faint },

  groupLabel: {
    paddingHorizontal: 18, paddingTop: 12, paddingBottom: 9,
    fontSize: 11.5, fontWeight: font.weightHeavy, color: SPACE_LIGHT.label, letterSpacing: 0.7,
  },
  options: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, paddingHorizontal: spacing.lg },
  option: {
    height: 36, paddingHorizontal: 14, borderRadius: 9,
    flexDirection: "row", alignItems: "center", gap: 6,
    backgroundColor: colors.white, borderWidth: 1, borderColor: SPACE_LIGHT.line,
  },
  optionOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  optionText: { fontSize: 13, fontWeight: font.weightBold, color: SPACE_LIGHT.text },
  optionTextOn: { color: colors.white },

  toggleGroup: { marginHorizontal: 14, borderRadius: 14, backgroundColor: SPACE_LIGHT.group, paddingVertical: 3 },
  toggleRow: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 12, paddingVertical: 11 },
  toggleText: { flex: 1, minWidth: 0 },
  toggleLabel: { fontSize: 14, fontWeight: font.weightBold, color: SPACE_LIGHT.text },
  toggleSub: { fontSize: 11.5, color: SPACE_LIGHT.dim, marginTop: 2 },

  track: {
    width: 44, height: 26, borderRadius: 8, padding: 3,
    backgroundColor: "#d9d9de", justifyContent: "center",
  },
  trackOn: { backgroundColor: colors.brand },
  knob: {
    width: 20, height: 20, borderRadius: 6, backgroundColor: colors.white,
    shadowColor: "#000", shadowOpacity: 0.18, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    elevation: 2,
  },
  knobOn: { alignSelf: "flex-end" },

  apply: {
    flex: 1, height: 48, borderRadius: 13, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  applyText: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.white },
});
