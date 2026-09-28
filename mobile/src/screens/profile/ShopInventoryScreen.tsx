import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Image, Pressable, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronLeft, Lock, Minus, Plus } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { shopInventoryApi, type SellerProduct } from "@/api/shop-inventory.api";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Shop Settings > Products > Products & Inventory. Stock and visibility
 * only - full re-editing (name/price/images) stays with the "Add New
 * Product" flow, this screen never had a follow-up for either before now.
 * Each stock change is its own PATCH, no batch Save - a stock count is the
 * kind of value a seller expects to take effect the moment they change it.
 */
export function ShopInventoryScreen() {
  const navigation = useNavigation<any>();
  const [products, setProducts] = useState<SellerProduct[] | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    shopInventoryApi.list(1).then((r) => setProducts(r.data)).catch(() => setProducts([]));
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const patch = (product: SellerProduct, payload: { stock?: number; is_active?: boolean }) => {
    setBusyId(product.id);
    shopInventoryApi.update(product.id, payload)
      .then((updated) => setProducts((list) => (list ?? []).map((p) => (p.id === updated.id ? updated : p))))
      .catch(() => {})
      .finally(() => setBusyId(null));
  };

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Products & Inventory</Text>
        <View style={s.back} />
      </View>

      {!products ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <FlatList
          data={products}
          keyExtractor={(p) => String(p.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.empty}>No products yet. Add one from your Shop page.</Text>}
          renderItem={({ item }) => {
            const busy = busyId === item.id;
            return (
              <View style={s.card}>
                <Image source={{ uri: item.image_url ?? undefined }} style={s.thumb} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <View style={s.titleRow}>
                    <Text style={s.name} numberOfLines={1}>{item.name}</Text>
                    {!item.is_active && (
                      <View style={s.draftTag}>
                        <Lock size={9} color={colors.textSecondary} strokeWidth={2.6} />
                        <Text style={s.draftTagText}>Private</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.price}>{item.currency} {item.price.toLocaleString()}</Text>
                  {item.is_low_stock && <Text style={s.lowStock}>Low stock</Text>}

                  <View style={s.row}>
                    <Text style={s.rowLabel}>Stock</Text>
                    <View style={s.stepper}>
                      <Pressable
                        disabled={busy || item.stock <= 0}
                        style={s.stepBtn}
                        onPress={() => patch(item, { stock: Math.max(0, item.stock - 1) })}
                      >
                        <Minus size={14} color={colors.text} strokeWidth={2.4} />
                      </Pressable>
                      <Text style={s.stepValue}>{item.stock}</Text>
                      <Pressable disabled={busy} style={s.stepBtn} onPress={() => patch(item, { stock: item.stock + 1 })}>
                        <Plus size={14} color={colors.text} strokeWidth={2.4} />
                      </Pressable>
                    </View>
                  </View>

                  <View style={s.row}>
                    <Text style={s.rowLabel}>{item.is_active ? "Visible to customers" : "Hidden"}</Text>
                    <Switch
                      disabled={busy}
                      value={item.is_active}
                      onValueChange={(v) => patch(item, { is_active: v })}
                      trackColor={{ true: colors.brand }}
                    />
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  empty: { textAlign: "center", marginTop: 60, color: colors.textMuted, fontSize: font.sm },

  card: {
    flexDirection: "row", gap: spacing.md,
    backgroundColor: colors.bgMuted, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  thumb: { width: 56, height: 56, borderRadius: radius.md, backgroundColor: colors.border },
  titleRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  name: { flexShrink: 1, fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  draftTag: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 6, paddingVertical: 2 },
  draftTagText: { fontSize: 9.5, fontWeight: font.weightBold, color: colors.textSecondary },
  price: { marginTop: 2, fontSize: font.xs, color: colors.textMuted },
  lowStock: { marginTop: 2, fontSize: font.xs, fontWeight: font.weightBold, color: colors.warning },

  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: spacing.sm },
  rowLabel: { fontSize: font.xs, color: colors.textSecondary, fontWeight: font.weightMedium },

  stepper: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  stepBtn: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong, alignItems: "center", justifyContent: "center" },
  stepValue: { minWidth: 20, textAlign: "center", fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
});
