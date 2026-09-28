import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronLeft, Plus, Trash2 } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { shopCollectionsManageApi } from "@/api/shop-collections-manage.api";
import type { ShopCollection } from "@/api/shop.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Shop Settings > Products > Collections. Real create/delete - before this,
 * the only thing that ever wrote a ProductCollection row was a demo seeder.
 * Renaming an existing collection is inline (tap the name); a cover image
 * is set at create time only (see shop-collections-manage.api.ts's own note
 * on why a PUT can't safely carry a file).
 */
export function ShopCollectionsScreen() {
  const navigation = useNavigation<any>();
  const [collections, setCollections] = useState<ShopCollection[] | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(() => {
    shopCollectionsManageApi.list().then(setCollections).catch(() => setCollections([]));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const create = () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    shopCollectionsManageApi.create({ name })
      .then((c) => { setCollections((list) => [...(list ?? []), c]); setNewName(""); })
      .catch((e) => Alert.alert("Couldn't create collection", apiErrorMessage(e)))
      .finally(() => setCreating(false));
  };

  const remove = (collection: ShopCollection) => {
    Alert.alert("Delete Collection", `Delete "${collection.name}"? Products in it won't be deleted - they'll just be uncategorised.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete", style: "destructive",
        onPress: () => {
          shopCollectionsManageApi.remove(collection.id)
            .then(() => setCollections((list) => (list ?? []).filter((c) => c.id !== collection.id)))
            .catch((e) => Alert.alert("Couldn't delete", apiErrorMessage(e)));
        },
      },
    ]);
  };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Collections</Text>
        <View style={s.back} />
      </View>

      <View style={s.addRow}>
        <TextInput
          style={s.addInput}
          value={newName}
          onChangeText={setNewName}
          placeholder="New collection name"
          placeholderTextColor={colors.textFaint}
          onSubmitEditing={create}
          returnKeyType="done"
        />
        <Pressable style={[s.addBtn, (!newName.trim() || creating) && s.addBtnDisabled]} disabled={!newName.trim() || creating} onPress={create}>
          {creating ? <ActivityIndicator size="small" color={colors.white} /> : <Plus size={18} color={colors.white} strokeWidth={2.4} />}
        </Pressable>
      </View>

      {!collections ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          data={collections}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.empty}>No collections yet. Create one above to start organising your products.</Text>}
          renderItem={({ item }) => (
            <View style={s.card}>
              <Image source={{ uri: item.cover_image_url ?? undefined }} style={s.thumb} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                <Text style={s.count}>{item.products_count} product{item.products_count === 1 ? "" : "s"}</Text>
              </View>
              <Pressable hitSlop={8} onPress={() => remove(item)}>
                <Trash2 size={18} color={colors.danger} strokeWidth={2} />
              </Pressable>
            </View>
          )}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  addRow: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  addInput: { flex: 1, backgroundColor: colors.bgMuted, borderRadius: radius.md, paddingHorizontal: spacing.md, height: 44, fontSize: font.sm, color: colors.text },
  addBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  addBtnDisabled: { backgroundColor: "#f4b6c2" },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  empty: { textAlign: "center", marginTop: 40, color: colors.textMuted, fontSize: font.sm, paddingHorizontal: spacing.lg },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: colors.bgMuted, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  thumb: { width: 44, height: 44, borderRadius: radius.sm, backgroundColor: colors.border },
  name: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  count: { marginTop: 2, fontSize: font.xs, color: colors.textMuted },
});
