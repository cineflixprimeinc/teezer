import { useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Check, Search, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { SettingsHeader } from "@/components/settings/SettingsKit";
import { shopApi, type ShopVariationType } from "@/api/shop.api";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Add Variation -> Type. Same dedicated-searchable-list pattern as
 * ShopCategoryPickerScreen (search box, then a real list instead of a
 * cramped inline picker) - not that screen itself, since the data shape
 * (id/name/options) and the leading "Custom" row don't fit its
 * category-only contract.
 *
 * "Custom" is pinned above the fetched list regardless of the search text -
 * it's not a real row to search for, it's the escape hatch back to a
 * freeform name/options pair with no preset behind it.
 *
 * Selecting a row navigates straight back to AddVariation (already on the
 * stack) with the choice as a param - no separate "Done" step needed.
 */
export function AddVariationTypePickerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "AddVariationTypePicker">>();
  const { selectedId } = route.params;

  const typesQ = useQuery({ queryKey: ["shop-variation-types"], queryFn: shopApi.variationTypes });
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = typesQ.data ?? [];
    if (!q) return list;
    return list.filter((t) => t.name.toLowerCase().includes(q));
  }, [typesQ.data, query]);

  const pick = (t: ShopVariationType | null) => {
    navigation.navigate("AddVariation", { pickedTypeId: t?.id ?? null, pickedTypeName: t?.name });
  };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <SettingsHeader title="Type" subtitle="What kind of variant this is - Size, Color, Material, or your own." />

      <View style={s.searchBox}>
        <Search size={17} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search variation types"
          placeholderTextColor={colors.textFaint}
          style={s.searchInput}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {!!query && (
          <Pressable hitSlop={8} onPress={() => setQuery("")}>
            <X size={16} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      {typesQ.isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(t) => String(t.id)}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={s.divider} />}
          ListHeaderComponent={
            <>
              <Pressable style={s.row} onPress={() => pick(null)}>
                <Text style={[s.rowText, selectedId == null && s.rowTextOn]}>Custom</Text>
                {selectedId == null && <Check size={18} color={colors.brand} strokeWidth={2.6} />}
              </Pressable>
              <View style={s.divider} />
            </>
          }
          ListEmptyComponent={
            !query ? null : <Text style={s.empty}>No type matches &quot;{query}&quot;.</Text>
          }
          renderItem={({ item }) => {
            const on = item.id === selectedId;
            return (
              <Pressable style={s.row} onPress={() => pick(item)}>
                <Text style={[s.rowText, on && s.rowTextOn]}>{item.name}</Text>
                {on && <Check size={18} color={colors.brand} strokeWidth={2.6} />}
              </Pressable>
            );
          }}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  searchBox: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.sm, marginBottom: spacing.md,
    backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44,
  },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: spacing.lg },
  rowText: { fontSize: font.md, fontWeight: font.weightMedium, color: colors.text },
  rowTextOn: { fontWeight: font.weightBold, color: colors.brand },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },

  empty: { textAlign: "center", marginTop: spacing.xxl, fontSize: font.sm, color: colors.textMuted },
});
