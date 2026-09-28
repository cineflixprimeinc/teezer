import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Check, ChevronLeft, Search, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { COUNTRIES, countryFlag } from "@/constants/countries";
import { useStudioSettingsStore, type StudioSettings } from "@/store/studio-settings.store";
import { STUDIO_COUNTRY_TITLES, type StudioCountryKey } from "./studio-choices";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/** Full, searchable country list (all countries + flags) that writes the chosen
 *  country NAME to a StudioSettings field. Used by Tax Residency + Business Country. */
export function StudioCountryChoiceScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<Record<string, { settingKey: StudioCountryKey }>, string>>();
  const key = route.params.settingKey;
  const meta = STUDIO_COUNTRY_TITLES[key];
  const current = useStudioSettingsStore((s) => s.prefs[key]);

  const [query, setQuery] = useState("");
  const data = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COUNTRIES;
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase() === q);
  }, [query]);

  const choose = (name: string) => {
    useStudioSettingsStore.getState().update({ [key]: name } as Partial<StudioSettings>);
    navigation.goBack();
  };

  return (
    <Screen edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <Pressable hitSlop={8} style={s.back} onPress={() => navigation.goBack()}>
          <ChevronLeft size={24} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.title}>{meta.title}</Text>
      </View>
      {!!meta.note && <Text style={s.note}>{meta.note}</Text>}

      {/* Search */}
      <View style={s.searchBox}>
        <Search size={18} color={colors.textFaint} strokeWidth={2.2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search countries"
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

      <FlatList
        data={data}
        keyExtractor={(c) => c.code}
        keyboardShouldPersistTaps="handled"
        initialNumToRender={20}
        contentContainerStyle={{ paddingBottom: spacing.xxl }}
        renderItem={({ item }) => {
          const active = item.name === current;
          return (
            <Pressable style={({ pressed }) => [s.row, pressed && s.rowPressed]} onPress={() => choose(item.name)}>
              <Text style={s.flag}>{countryFlag(item.code)}</Text>
              <Text style={[s.name, active && s.nameActive]}>{item.name}</Text>
              {active && <Check size={20} color={colors.brand} strokeWidth={2.6} />}
            </Pressable>
          );
        }}
        ListEmptyComponent={<Text style={s.empty}>No countries found.</Text>}
      />
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingTop: spacing.sm, height: 52 },
  back: { width: 30, height: 40, justifyContent: "center" },
  title: { fontSize: font.xl, fontWeight: font.weightHeavy, color: colors.text },
  note: { paddingHorizontal: spacing.lg, marginBottom: spacing.md, fontSize: font.sm, color: colors.textMuted, lineHeight: 20 },
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginBottom: spacing.md, paddingHorizontal: spacing.md,
    height: 46, borderRadius: radius.md, backgroundColor: colors.bgMuted,
  },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },
  row: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: 14 },
  rowPressed: { backgroundColor: colors.bgMuted },
  flag: { fontSize: 22 },
  name: { flex: 1, fontSize: font.md, color: colors.text },
  nameActive: { color: colors.brand, fontWeight: font.weightBold },
  empty: { textAlign: "center", marginTop: spacing.xxl, color: colors.textMuted },
});
