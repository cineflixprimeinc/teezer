import { useMemo, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useRoute } from "@react-navigation/native";
import { EditShell } from "@/components/settings/EditShell";
import { useProfileFieldSave } from "./useProfileSave";
import { CATEGORIES, CATEGORY_MAX } from "./profileFields";
import { colors } from "@/constants/colors";
import { font, spacing } from "@/constants/theme";

/** Edit Profile Category / Interests - searchable multi-select, up to 3. */
export function EditCategoryScreen() {
  const route = useRoute();
  const initial = ((route.params ?? {}) as { value?: string[] }).value ?? [];
  const [selected, setSelected] = useState<string[]>(initial);
  const [search, setSearch] = useState("");
  const save = useProfileFieldSave();

  const changed = JSON.stringify([...selected].sort()) !== JSON.stringify([...initial].sort());
  const canSave = changed && selected.length >= 1;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES;
    return CATEGORIES.filter((c) => c.toLowerCase().includes(q));
  }, [search]);

  function toggle(cat: string) {
    setSelected((prev) => {
      if (prev.includes(cat)) return prev.filter((c) => c !== cat);
      if (prev.length >= CATEGORY_MAX) {
        Alert.alert("Limit reached", `You can select up to ${CATEGORY_MAX} categories.`);
        return prev;
      }
      return [...prev, cat];
    });
  }

  return (
    <EditShell
      title="Profile Category / Interests"
      helper="Select one or more categories that best describe you."
      canSave={canSave}
      saving={save.isPending}
      onSave={() => save.mutate({ categories: selected })}
    >
      {/* Search */}
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={colors.textFaint} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search categories"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable hitSlop={8} onPress={() => setSearch("")}>
            <Ionicons name="close-circle" size={18} color="#b9bdc6" />
          </Pressable>
        )}
      </View>

      <Text style={styles.count}>{selected.length}/{CATEGORY_MAX} selected</Text>

      <View style={styles.list}>
        {filtered.map((cat) => {
          const on = selected.includes(cat);
          return (
            <Pressable key={cat} style={styles.row} onPress={() => toggle(cat)}>
              <Text style={styles.label}>{cat}</Text>
              {on ? (
                <View style={styles.checkOn}><Ionicons name="checkmark" size={14} color={colors.white} /></View>
              ) : (
                <View style={styles.checkOff} />
              )}
            </Pressable>
          );
        })}
        {filtered.length === 0 && <Text style={styles.empty}>No categories match “{search}”.</Text>}
      </View>
    </EditShell>
  );
}

const styles = StyleSheet.create({
  searchBox: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: colors.bgMuted, borderRadius: 12, paddingHorizontal: 14, height: 46 },
  searchInput: { flex: 1, fontSize: font.md, color: colors.text, padding: 0 },
  count: { marginTop: spacing.md, marginBottom: spacing.sm, fontSize: font.sm, color: colors.textMuted, fontWeight: font.weightMedium },
  list: { gap: spacing.sm },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", backgroundColor: colors.bgMuted, borderRadius: 12, paddingHorizontal: 16, height: 50 },
  label: { fontSize: font.md, color: colors.text, fontWeight: font.weightMedium },
  checkOn: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  checkOff: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: colors.borderStrong },
  empty: { paddingVertical: spacing.lg, textAlign: "center", color: colors.textFaint, fontSize: font.sm },
});
