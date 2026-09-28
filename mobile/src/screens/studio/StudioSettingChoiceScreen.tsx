import { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Check, Search, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { SettingsHeader } from "@/components/settings/SettingsKit";
import { useStudioSettingsStore, type StudioSettings } from "@/store/studio-settings.store";
import { STUDIO_CHOICES, payoutThresholdChoices, type StudioChoiceKey } from "./studio-choices";
import { useMoneyRules } from "@/hooks/useMoneyRules";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

/** Full-page single-choice picker (replaces the old bottom-sheet dropdown).
 *  Long lists (languages, timezones, currencies) get a search box. */
export function StudioSettingChoiceScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, { settingKey: StudioChoiceKey }>, string>>();
  const key = route.params.settingKey;
  const config = STUDIO_CHOICES[key];
  const current = useStudioSettingsStore((s) => s.prefs[key]);

  /* The payout threshold is the one choice whose options are not fixed: they
     are multiples of the platform's real minimum withdrawal, so the list can
     never offer a threshold below what the server will pay out. */
  const rules = useMoneyRules();
  const dynamic = key === "minPayout" ? payoutThresholdChoices(rules.minWithdrawUsd) : null;
  const options = key === "minPayout" ? (dynamic?.options ?? []) : config.options;
  const note = dynamic?.note ?? config.note;

  const [query, setQuery] = useState("");
  // Always keep the current value selectable (e.g. an auto-detected timezone not
  // in the base list) by pinning it to the top.
  const base = useMemo(
    () => (current && !options.includes(current) ? [current, ...options] : options),
    [options, current],
  );
  const searchable = base.length > 10;
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? base.filter((o) => o.toLowerCase().includes(q)) : base;
  }, [base, query]);

  const choose = (value: string) => {
    useStudioSettingsStore.getState().update({ [key]: value } as Partial<StudioSettings>);
    navigation.goBack();
  };

  return (
    <Screen edges={["top"]}>
      <SettingsHeader title={config.title} subtitle={note} />

      {searchable && (
        <View style={s.searchBox}>
          <Search size={18} color={colors.textFaint} strokeWidth={2.2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={`Search ${config.title.toLowerCase()}`}
            placeholderTextColor={colors.textFaint}
            style={s.searchInput}
            autoCorrect={false}
            returnKeyType="search"
          />
          {query.length > 0 && (
            <Pressable hitSlop={8} onPress={() => setQuery("")}>
              <X size={16} color={colors.textFaint} strokeWidth={2.4} />
            </Pressable>
          )}
        </View>
      )}

      <ScrollView
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: TAB_BAR_HEIGHT + insets.bottom + spacing.lg }}
      >
        <View style={s.card}>
          {filtered.length === 0 ? (
            <Text style={s.empty}>No matches.</Text>
          ) : (
            filtered.map((opt, i) => {
              const active = opt === current;
              return (
                <View key={opt}>
                  <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={() => choose(opt)}>
                    <Text style={[s.label, active && s.labelActive]}>{opt}</Text>
                    {active && <Check size={20} color={colors.brand} strokeWidth={2.6} />}
                  </Pressable>
                  {i < filtered.length - 1 && <View style={s.divider} />}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>
    </Screen>
  );
}

const s = StyleSheet.create({
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.sm, paddingHorizontal: spacing.md,
    height: 46, borderRadius: radius.md, backgroundColor: colors.bgMuted,
  },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },
  card: {
    marginHorizontal: spacing.lg, marginTop: spacing.sm,
    backgroundColor: colors.card, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg },
  rowPressed: { backgroundColor: colors.bgMuted, borderRadius: radius.sm },
  label: { flex: 1, fontSize: font.md, color: colors.text, fontWeight: font.weightMedium },
  labelActive: { color: colors.brand, fontWeight: font.weightBold },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  empty: { textAlign: "center", paddingVertical: spacing.xl, color: colors.textMuted },
});
