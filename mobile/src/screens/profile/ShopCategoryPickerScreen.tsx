import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Check, Search, X } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { SettingsHeader } from "@/components/settings/SettingsKit";
import { shopApi, type ShopCategory } from "@/api/shop.api";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";
import type { RootStackParamList } from "@/navigation/types";

/**
 * A dedicated page for choosing a category, opened from two places:
 *
 *  - EditShopScreen (Edit Shop -> Category) - the original caller, still the
 *    default when `returnTo` is omitted. Was an inline row of chips, fine for
 *    the original 5 categories, not once the list grew - so this became its
 *    own searchable, single-select page, matching how a picker with more
 *    than a handful of options looks everywhere else in the app.
 *  - AddProductScreen (Category / Subcategory), `returnTo: "AddProduct"` -
 *    the same list, filtered to one parent's children when `forSubcategory`
 *    is set, so the two screens share one well-built picker instead of
 *    AddProduct growing its own second copy.
 *
 * Selecting a row navigates straight back to the caller with the choice as a
 * param - no separate "Done" step needed. This MUST pass `{ pop: true, merge:
 * true }`: a plain `navigate(name, params)` only reuses an existing route
 * when it's already the current one (or via `getId`/an explicit `pop`) - from
 * a different screen it otherwise pushes a brand-new instance of the caller
 * with fresh params instead of popping back to the real one, silently
 * discarding all of its in-progress, unsaved form state (confirmed against
 * @react-navigation/routers' StackRouter `NAVIGATE` case). `pop: true` makes
 * it pop back to the existing instance; `merge: true` keeps that instance's
 * other params (e.g. AddProduct's `username`) instead of replacing them with
 * only what's passed here.
 */
export function ShopCategoryPickerScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "ShopCategoryPicker">>();
  const { selectedId = null, returnTo, forSubcategory, parentId, parentName } = route.params ?? {};

  const [categories, setCategories] = useState<ShopCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    shopApi.categories().then(setCategories).finally(() => setLoading(false));
  }, []);

  // EditShop's own call (returnTo unset) keeps its original, unfiltered
  // behaviour - every category flat in one list, unchanged from before this
  // screen was shared. AddProduct scopes to top-level categories, or one
  // parent's children when picking a subcategory.
  const scoped = useMemo(() => {
    if (returnTo !== "AddProduct") return categories;
    return forSubcategory ? categories.filter((c) => c.parent_id === parentId) : categories.filter((c) => !c.parent_id);
  }, [categories, returnTo, forSubcategory, parentId]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter((c) => c.name.toLowerCase().includes(q));
  }, [scoped, query]);

  const pick = (c: ShopCategory) => {
    if (returnTo === "AddProduct") {
      navigation.navigate(
        "AddProduct",
        forSubcategory
          ? { pickedSubcategoryId: c.id, pickedSubcategoryName: c.name }
          : { pickedCategoryId: c.id, pickedCategoryName: c.name },
        { pop: true, merge: true },
      );
      return;
    }
    navigation.navigate("EditShop", { pickedCategoryId: c.id, pickedCategoryName: c.name }, { pop: true, merge: true });
  };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <SettingsHeader
        title={returnTo === "AddProduct" ? (forSubcategory ? "Subcategory" : "Category") : "Shop Category"}
        subtitle={
          returnTo !== "AddProduct"
            ? "What your shop mainly sells - shown to customers and used for browsing."
            : forSubcategory
              ? `Narrow down "${parentName ?? "this category"}" - optional, but helps customers find it.`
              : "What kind of product this is - shown to customers and used for browsing."
        }
      />

      <View style={s.searchBox}>
        <Search size={17} color={colors.textFaint} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search categories"
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

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={s.list}
          keyboardShouldPersistTaps="handled"
          ItemSeparatorComponent={() => <View style={s.divider} />}
          ListEmptyComponent={<Text style={s.empty}>No categories match &quot;{query}&quot;.</Text>}
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
