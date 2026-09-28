import { useEffect, useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { Check, ChevronLeft, ChevronRight, Layers } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { ds, radius } from "@/theme/design";
import { shopApi } from "@/api/shop.api";
import type { RootStackParamList } from "@/navigation/types";

/**
 * Add Product -> Add Variation. Was a BottomSheet dropdown, then a single
 * page with an inline Type search+pill picker; Type is now its own NavRow
 * that opens AddVariationTypePickerScreen - the exact same NavRow ->
 * dedicated-page pattern AddProductScreen's own Category row already uses,
 * rather than a second, differently-shaped picker living inline on this
 * page. Choosing a type there reveals this page's "Choose options" submenu
 * for that type's preset choices, same as before.
 *
 * Returns straight back to AddProduct with the finished variation as a nav
 * param, same picked*-param round-trip AddProduct already uses for its
 * category/subcategory pick.
 */
export function AddVariationScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "AddVariation">>();
  const { username } = route.params;

  // Same query key AddVariationTypePickerScreen uses - whichever screen
  // fetches first, the other reads the cache instead of a second request.
  const variationTypesQ = useQuery({ queryKey: ["shop-variation-types"], queryFn: shopApi.variationTypes });

  // id: null means "Custom" was explicitly chosen (freeform, no preset
  // options to offer); the whole field being null means the picker was
  // never opened - the NavRow shows its placeholder either way, but a
  // typed name/choices pair still works without ever touching Type at all.
  const [pickedType, setPickedType] = useState<{ id: number | null; name: string } | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<string[]>([]);
  const [variationName, setVariationName] = useState("");
  const [variationOptions, setVariationOptions] = useState("");

  // AddVariationTypePickerScreen's return value - same picked*-param
  // round-trip pattern AddProduct itself uses for category/subcategory.
  const pickedTypeId = route.params?.pickedTypeId;
  useEffect(() => {
    if (pickedTypeId === undefined) return;
    const name = pickedTypeId === null ? "Custom" : (route.params?.pickedTypeName ?? "");
    setPickedType({ id: pickedTypeId, name });
    setVariationName(pickedTypeId === null ? "" : name);
    setSelectedOptions([]);
    setVariationOptions("");
    navigation.setParams({ pickedTypeId: undefined, pickedTypeName: undefined });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickedTypeId]);

  const presetOptions = useMemo(() => {
    if (pickedType?.id == null) return [];
    return variationTypesQ.data?.find((t) => t.id === pickedType.id)?.options ?? [];
  }, [variationTypesQ.data, pickedType]);

  const toggleOptionChip = (opt: string) => {
    setSelectedOptions((prev) => {
      const next = prev.includes(opt) ? prev.filter((o) => o !== opt) : [...prev, opt];
      setVariationOptions(next.join(", "));
      return next;
    });
  };

  const canAdd = !!variationName.trim() && !!variationOptions.trim();

  const addVariation = () => {
    const opts = variationOptions.split(",").map((o) => o.trim()).filter(Boolean);
    if (!variationName.trim() || !opts.length) return;
    // { pop: true, merge: true } - without it `navigate` from this screen
    // pushes a brand-new AddProduct instance instead of popping back to the
    // existing one, discarding its unsaved form state (title, images,
    // category, other variations already added) - same fix and same root
    // cause as ShopCategoryPickerScreen's own return call.
    navigation.navigate(
      "AddProduct",
      { username, newVariationName: variationName.trim(), newVariationOptions: opts },
      { pop: true, merge: true },
    );
  };

  return (
    <Screen bg={ds.bg}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} onPress={() => navigation.goBack()} style={styles.headerBtn}>
          <ChevronLeft size={22} color={ds.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Add Variation</Text>
        <View style={styles.headerBtn} />
      </View>

      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>Type</Text>
        <Pressable
          accessibilityRole="button"
          style={styles.navRow}
          onPress={() => navigation.navigate("AddVariationTypePicker", { selectedId: pickedType?.id ?? null })}
        >
          <View style={styles.navRowLeft}>
            <Layers size={16} color={pickedType ? ds.accent : ds.textFaint} />
            <Text style={pickedType ? styles.navRowValue : styles.navRowPlaceholder}>
              {pickedType?.name ?? "Select type (optional)"}
            </Text>
          </View>
          <ChevronRight size={17} color={ds.textFaint} />
        </Pressable>

        {pickedType?.id != null && (
          <View style={styles.field}>
            <Text style={styles.label}>Choose options</Text>
            <View style={styles.presetPillWrap}>
              {presetOptions.map((opt) => {
                const on = selectedOptions.includes(opt);
                return (
                  <Pressable
                    key={opt}
                    accessibilityRole="button"
                    style={[styles.optionChip, on && styles.optionChipOn]}
                    onPress={() => toggleOptionChip(opt)}
                  >
                    {on && <Check size={13} color={ds.onDark} strokeWidth={3} />}
                    <Text style={[styles.optionChipText, on && styles.optionChipTextOn]}>{opt}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <View style={styles.field}>
          <Text style={styles.label}>Option name</Text>
          <TextInput style={styles.input} value={variationName} onChangeText={setVariationName} placeholder="e.g. Size, Color" placeholderTextColor={ds.textFaint} />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>
            Choices <Text style={styles.fieldHintInline}>{pickedType?.id != null ? "add more, comma separated" : "comma separated"}</Text>
          </Text>
          <TextInput style={styles.input} value={variationOptions} onChangeText={setVariationOptions} placeholder="e.g. Small, Medium, Large" placeholderTextColor={ds.textFaint} />
        </View>

        <Pressable
          accessibilityRole="button"
          disabled={!canAdd}
          style={[styles.addBtn, !canAdd && styles.btnDisabled]}
          onPress={addVariation}
        >
          <Text style={styles.addBtnText}>Add</Text>
        </Pressable>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: ds.line, backgroundColor: ds.surface },
  headerBtn: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 16, fontWeight: "800", color: ds.text },

  body: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },

  navRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 13, backgroundColor: ds.surfaceMuted },
  navRowLeft: { flexDirection: "row", alignItems: "center", gap: 10, flex: 1 },
  navRowValue: { fontSize: 14, color: ds.text },
  navRowPlaceholder: { fontSize: 14, color: ds.textFaint },

  presetPillWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  optionChip: { flexDirection: "row", alignItems: "center", gap: 5, borderWidth: 1, borderColor: ds.line, borderRadius: radius.pill, paddingHorizontal: 13, paddingVertical: 8, backgroundColor: ds.surface },
  optionChipOn: { borderColor: ds.accent, backgroundColor: ds.accent },
  optionChipText: { fontSize: 12.5, fontWeight: "600", color: ds.text },
  optionChipTextOn: { color: ds.onDark },

  field: { marginTop: 18 },
  label: { fontSize: 13, fontWeight: "700", color: ds.text, marginBottom: 9 },
  fieldHintInline: { fontSize: 12, color: ds.textMuted, fontWeight: "400" },
  input: { borderWidth: 1, borderColor: ds.line, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, color: ds.text, backgroundColor: ds.surfaceMuted },

  addBtn: { marginTop: 26, backgroundColor: ds.accent, borderRadius: radius.pill, height: 52, alignItems: "center", justifyContent: "center" },
  addBtnText: { color: ds.onDark, fontWeight: "800", fontSize: 15.5 },
  btnDisabled: { opacity: 0.5 },
});
