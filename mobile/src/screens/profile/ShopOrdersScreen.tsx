import { useCallback, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { shopSellerOrdersApi, type SellerOrder, type ShopOrderStatus } from "@/api/shop-orders-seller.api";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/** Shop Settings > Selling > Orders & Returns - the seller's own order list. */

const FILTERS: { key: ShopOrderStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "paid", label: "To fulfil" },
  { key: "fulfilled", label: "Fulfilled" },
  { key: "cancelled", label: "Cancelled" },
];

const STATUS_LABEL: Record<ShopOrderStatus, string> = {
  pending: "Pending payment",
  paid: "To fulfil",
  cod_pending: "Cash on delivery",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
  failed: "Failed",
};

const STATUS_COLOR: Record<ShopOrderStatus, string> = {
  pending: colors.textMuted,
  paid: colors.brand,
  cod_pending: colors.warning,
  fulfilled: colors.success,
  cancelled: colors.danger,
  failed: colors.danger,
};

const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

export function ShopOrdersScreen() {
  const navigation = useNavigation<any>();
  const [filter, setFilter] = useState<ShopOrderStatus | "all">("all");
  const [orders, setOrders] = useState<SellerOrder[] | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    shopSellerOrdersApi.list(1, filter === "all" ? undefined : filter)
      .then((r) => setOrders(r.data))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Orders & Returns</Text>
        <View style={s.back} />
      </View>

      <View style={s.filters}>
        {FILTERS.map((f) => (
          <Pressable key={f.key} style={[s.filterChip, filter === f.key && s.filterChipOn]} onPress={() => setFilter(f.key)}>
            <Text style={[s.filterText, filter === f.key && s.filterTextOn]}>{f.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading && !orders ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={colors.brand} />
      ) : (
        <FlatList
          data={orders ?? []}
          keyExtractor={(o) => String(o.id)}
          contentContainerStyle={s.list}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={<Text style={s.empty}>No orders here yet.</Text>}
          renderItem={({ item }) => (
            <Pressable style={s.card} onPress={() => navigation.navigate("ShopOrderDetail", { orderId: item.id })}>
              <View style={{ flex: 1 }}>
                <Text style={s.cardTitle} numberOfLines={1}>
                  {item.items[0]?.product_name}{item.items.length > 1 ? ` +${item.items.length - 1} more` : ""}
                </Text>
                <Text style={s.cardSub}>{item.buyer.name ?? item.buyer.username} • {money(item.subtotal, item.currency)}</Text>
                <Text style={[s.statusTag, { color: STATUS_COLOR[item.status] }]}>{STATUS_LABEL[item.status]}</Text>
              </View>
              <ChevronRight size={16} color={colors.textFaint} />
            </Pressable>
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

  filters: { flexDirection: "row", gap: spacing.sm, paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
  filterChip: { paddingHorizontal: spacing.md, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: colors.bgMuted },
  filterChipOn: { backgroundColor: colors.brand },
  filterText: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textSecondary },
  filterTextOn: { color: colors.white },

  list: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  empty: { textAlign: "center", marginTop: 60, color: colors.textMuted, fontSize: font.sm },
  card: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    backgroundColor: colors.bgMuted, borderRadius: radius.lg,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  cardTitle: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  cardSub: { marginTop: 2, fontSize: font.xs, color: colors.textMuted },
  statusTag: { marginTop: 6, fontSize: font.xs, fontWeight: font.weightBold },
});
