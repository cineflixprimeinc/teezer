import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import { ChevronLeft } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { shopSellerOrdersApi, type SellerOrder } from "@/api/shop-orders-seller.api";
import { apiErrorMessage } from "@/api/client";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-US", { minimumFractionDigits: 2 })}`;

/**
 * One order, from the seller's side. Fulfil/Cancel only - the exact two
 * transitions ShopOrderController::updateOrderStatus allows. No refund
 * button: a settled order's money is already credited to the seller's
 * wallet at capture time, and reversing that is a real-money gateway
 * operation this pass deliberately doesn't build - see that method's own
 * comment.
 */
export function ShopOrderDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const { orderId } = route.params as { orderId: number };

  const [order, setOrder] = useState<SellerOrder | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    shopSellerOrdersApi.show(orderId).then(setOrder).catch(() => {});
  }, [orderId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const act = (status: "fulfilled" | "cancelled") => {
    setBusy(true);
    shopSellerOrdersApi.updateStatus(orderId, status)
      .then(setOrder)
      .catch((e) => Alert.alert("Couldn't update order", apiErrorMessage(e)))
      .finally(() => setBusy(false));
  };

  if (!order) {
    return (
      <Screen edges={["top"]} bg={colors.bg}>
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      </Screen>
    );
  }

  const canFulfil = order.status === "paid" || order.status === "cod_pending";
  const canCancel = order.status !== "fulfilled" && order.status !== "cancelled";
  const addr = order.shipping_address;

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Order #{order.id}</Text>
        <View style={s.back} />
      </View>

      <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
        <View style={s.buyerRow}>
          <Avatar uri={order.buyer.avatar ?? undefined} style={s.avatar} />
          <View>
            <Text style={s.buyerName}>{order.buyer.name ?? order.buyer.username}</Text>
            <Text style={s.buyerHandle}>@{order.buyer.username}</Text>
          </View>
        </View>

        <View style={s.card}>
          {order.items.map((item, i) => (
            <View key={i} style={s.itemRow}>
              <Text style={s.itemName} numberOfLines={1}>{item.product_name} × {item.quantity}</Text>
              <Text style={s.itemPrice}>{money(item.line_total, order.currency)}</Text>
            </View>
          ))}
          <View style={s.divider} />
          <View style={s.itemRow}>
            <Text style={s.totalLabel}>You'll receive</Text>
            <Text style={s.totalValue}>{money(order.net_amount, order.currency)}</Text>
          </View>
        </View>

        {addr && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>Delivery Address</Text>
            <Text style={s.addrLine}>{addr.name} • {addr.phone}</Text>
            <Text style={s.addrLine}>{addr.line1}</Text>
            <Text style={s.addrLine}>{addr.city}, {addr.country}</Text>
          </View>
        )}

        {order.buyer_note && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>Note from buyer</Text>
            <Text style={s.addrLine}>{order.buyer_note}</Text>
          </View>
        )}
      </ScrollView>

      {(canFulfil || canCancel) && (
        <View style={s.actions}>
          {canCancel && (
            <Pressable style={[s.actionBtn, s.cancelBtn]} disabled={busy} onPress={() => act("cancelled")}>
              <Text style={s.cancelText}>Cancel Order</Text>
            </Pressable>
          )}
          {canFulfil && (
            <Pressable style={[s.actionBtn, s.fulfilBtn]} disabled={busy} onPress={() => act("fulfilled")}>
              {busy ? <ActivityIndicator color={colors.white} /> : <Text style={s.fulfilText}>Mark Fulfilled</Text>}
            </Pressable>
          )}
        </View>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.md },

  buyerRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm, marginTop: spacing.sm },
  avatar: { width: 40, height: 40, borderRadius: 20 },
  buyerName: { fontSize: font.md, fontWeight: font.weightBold, color: colors.text },
  buyerHandle: { fontSize: font.xs, color: colors.textMuted },

  card: { backgroundColor: colors.bgMuted, borderRadius: radius.lg, padding: spacing.md, gap: spacing.xs },
  sectionLabel: { fontSize: font.xs, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.5, marginBottom: 2 },
  itemRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 4 },
  itemName: { flex: 1, fontSize: font.sm, color: colors.text, marginRight: spacing.sm },
  itemPrice: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  divider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: spacing.xs },
  totalLabel: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.text },
  totalValue: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.brand },
  addrLine: { fontSize: font.sm, color: colors.textSecondary, lineHeight: 19 },

  actions: {
    flexDirection: "row", gap: spacing.sm,
    paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border,
  },
  actionBtn: { flex: 1, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center" },
  cancelBtn: { backgroundColor: colors.bgMuted },
  cancelText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.danger },
  fulfilBtn: { backgroundColor: colors.brand },
  fulfilText: { fontSize: font.sm, fontWeight: font.weightBold, color: colors.white },
});
