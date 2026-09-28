import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import {
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  FileText,
  FolderOpen,
  HelpCircle,
  Package,
  PauseCircle,
  ShoppingBag,
  Star,
  Truck,
  type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { shopSettingsApi } from "@/api/shop-settings.api";
import { shopInventoryApi } from "@/api/shop-inventory.api";
import { shopSellerOrdersApi } from "@/api/shop-orders-seller.api";
import { payoutMethodsApi } from "@/api/payout-methods.api";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Shop Settings - the "Reelsoo Seller Center" hub, opened from the gear
 * button on ShopScreen (owner only).
 *
 * Deliberately does NOT duplicate anything Edit Shop already owns (shop
 * name, description, logo, category) - that screen stays the single place
 * for shop IDENTITY. This one is operations: selling, products, customer
 * experience, policies, pause, support.
 *
 * Row language is StudioSettingsSection.tsx's, not the older SettingsKit
 * one: a 40px icon tile, a 14px bold label over a 12px muted line, hairline
 * divider, chevron, grouped under uppercase section labels. The one
 * addition is a live status line per row (order count, low-stock count,
 * payout connected, shop paused/active) - what makes this read as a seller
 * center rather than a generic settings menu.
 *
 * Rows that another screen already owns link straight out to it rather than
 * reimplementing it: Payments & Payouts -> the shared Studio payout screen
 * (the same one Edit Shop's Account section links to). There used to be a
 * "Customer Messages" row here too, deep-linking to the same Inbox tab every
 * user already has - removed as redundant now that a shop's Message button
 * (ShopScreen.tsx) opens a real Chat thread with the owner, which already
 * shows up in that same Inbox with no shop-specific screen needed.
 */

type Row = {
  key: string;
  icon: LucideIcon;
  title: string;
  desc: string;
  /** Live data line, when loaded - replaces `desc` when present. */
  status?: string | null;
  /** At-a-glance count chip next to the chevron - only when there's something to act on. */
  badge?: { text: string } | null;
  onPress: () => void;
};

export function ShopSettingsScreen() {
  const navigation = useNavigation<any>();
  const authUser = useAuthStore((s) => s.user);

  const [loading, setLoading] = useState(true);
  const [pendingOrders, setPendingOrders] = useState<number | null>(null);
  const [productCount, setProductCount] = useState<number | null>(null);
  const [lowStock, setLowStock] = useState<number | null>(null);
  const [hasPayout, setHasPayout] = useState<boolean | null>(null);
  const [isPaused, setIsPaused] = useState<boolean | null>(null);
  const [notifsOn, setNotifsOn] = useState<number | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);

  /* Re-read on focus, not just mount: every drill-in screen below can change
     one of these numbers (fulfilling an order, editing stock, pausing the
     shop, adding a payout method), and coming straight back to a stale
     status line is exactly what makes a settings hub feel broken. Each
     request is independent and failure-tolerant - one endpoint being down
     degrades that single row to its static description, never the screen. */
  useFocusEffect(
    useCallback(() => {
      let alive = true;

      shopSettingsApi.get()
        .then((s) => {
          if (!alive) return;
          setIsPaused(s.is_paused);
          setShopName(s.shop_name);
          setLogoUrl(s.logo_url);
        })
        .catch(() => {})
        .finally(() => { if (alive) setLoading(false); });

      shopSellerOrdersApi.list(1, "paid")
        .then((r) => { if (alive) setPendingOrders(r.meta.total); })
        .catch(() => {});

      shopInventoryApi.list(1)
        .then((r) => {
          if (!alive) return;
          setProductCount(r.meta.total);
          setLowStock(r.meta.low_stock_count);
        })
        .catch(() => {});

      payoutMethodsApi.list()
        .then((p) => { if (alive) setHasPayout(p.length > 0); })
        .catch(() => {});

      shopSettingsApi.getNotificationPrefs()
        .then((p) => { if (alive) setNotifsOn(Object.values(p).filter(Boolean).length); })
        .catch(() => {});

      return () => { alive = false; };
    }, []),
  );

  const groups: { title: string; rows: Row[] }[] = [
    {
      title: "SELLING",
      rows: [
        {
          key: "orders",
          icon: Package,
          title: "Orders & Returns",
          desc: "Manage customer orders, cancellations and returns.",
          status: pendingOrders == null ? null : pendingOrders === 0 ? "No orders awaiting fulfilment" : `${pendingOrders} order${pendingOrders === 1 ? "" : "s"} to fulfil`,
          badge: pendingOrders ? { text: String(pendingOrders) } : null,
          onPress: () => navigation.navigate("ShopOrders"),
        },
        {
          key: "shipping",
          icon: Truck,
          title: "Shipping & Delivery",
          desc: "Delivery methods, areas, charges and estimated times.",
          onPress: () => navigation.navigate("ShopShippingSettings"),
        },
        {
          key: "payouts",
          icon: CreditCard,
          title: "Payments & Payouts",
          desc: "Payout account, payment methods and payout history.",
          status: hasPayout == null ? null : hasPayout ? "Your payout account is connected" : "No payout account yet",
          onPress: () => navigation.navigate("StudioRoot", { screen: "PaymentMethods" }),
        },
      ],
    },
    {
      title: "PRODUCTS",
      rows: [
        {
          key: "inventory",
          icon: ShoppingBag,
          title: "Products & Inventory",
          desc: "Stock, quantities, visibility and out-of-stock items.",
          status: productCount == null ? null : `${productCount} product${productCount === 1 ? "" : "s"}${lowStock ? ` • ${lowStock} low stock` : ""}`,
          badge: lowStock ? { text: `${lowStock} low` } : null,
          onPress: () => navigation.navigate("ShopInventory"),
        },
        {
          key: "collections",
          icon: FolderOpen,
          title: "Collections",
          desc: "Group and organise your products into collections.",
          onPress: () => navigation.navigate("ShopCollections"),
        },
        {
          key: "reviews",
          icon: Star,
          title: "Product Reviews",
          desc: "Customer reviews, ratings and your replies.",
          onPress: () => navigation.navigate("ShopReviews"),
        },
      ],
    },
    {
      title: "CUSTOMER EXPERIENCE",
      rows: [
        {
          key: "notifications",
          icon: Bell,
          title: "Notifications",
          desc: "Orders, payments, returns, stock, messages and reviews.",
          status: notifsOn == null ? null : notifsOn === 0 ? "All turned off" : `${notifsOn} of 7 enabled`,
          onPress: () => navigation.navigate("ShopNotificationSettings"),
        },
      ],
    },
    {
      title: "POLICIES",
      rows: [
        {
          key: "policies",
          icon: FileText,
          title: "Shop Policies",
          desc: "Returns, refunds, shipping, cancellations and terms.",
          onPress: () => navigation.navigate("ShopPolicies"),
        },
      ],
    },
    {
      title: "SHOP OPERATIONS",
      rows: [
        {
          key: "pause",
          icon: PauseCircle,
          title: "Pause Shop",
          desc: "Temporarily stop accepting new orders.",
          status: isPaused == null ? null : isPaused ? "Paused - not accepting orders" : "Active",
          onPress: () => navigation.navigate("ShopPause"),
        },
      ],
    },
    {
      title: "SUPPORT",
      rows: [
        {
          key: "support",
          icon: HelpCircle,
          title: "Shop Support",
          desc: "Help Centre, contact support and report a problem.",
          onPress: () => navigation.navigate("ShopSupport"),
        },
      ],
    },
  ];

  return (
    <Screen edges={["top"]} bg={colors.bg}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={10} onPress={() => navigation.goBack()} style={s.back}>
          <ChevronLeft size={26} color={colors.text} strokeWidth={2} />
        </Pressable>
        <Text style={s.headerTitle}>Shop Settings</Text>
        <View style={s.back} />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={colors.brand} />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="View your shop as customers see it"
            style={s.previewCard}
            onPress={() => authUser?.username && navigation.navigate("Shop", { username: authUser.username })}
          >
            <Avatar uri={logoUrl} style={s.previewAvatar} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={s.previewLabel}>STORE PREVIEW</Text>
              <Text style={s.previewName} numberOfLines={1}>{shopName ?? "Your shop"}</Text>
            </View>
            <View style={[s.previewBadge, isPaused && s.previewBadgePaused]}>
              <Text style={[s.previewBadgeText, isPaused && s.previewBadgeTextPaused]}>
                {isPaused ? "Paused" : "Live"}
              </Text>
            </View>
            <ChevronRight size={16} color={colors.textFaint} strokeWidth={2.2} />
          </Pressable>

          {isPaused && (
            <View style={s.pausedBanner}>
              <PauseCircle size={18} color={colors.warning} strokeWidth={2.2} />
              <Text style={s.pausedText}>
                Your shop is paused. Customers can't place new orders until you resume.
              </Text>
            </View>
          )}

          {groups.map((group, gi) => (
            <View key={group.title}>
              <Text style={[s.groupLabel, gi === 0 && !isPaused && s.groupLabelFirst]}>{group.title}</Text>

              {group.rows.map((row) => {
                const Icon = row.icon;
                return (
                  <Pressable
                    key={row.key}
                    style={({ pressed }) => [s.row, pressed && { opacity: 0.6 }]}
                    onPress={row.onPress}
                    accessibilityRole="button"
                  >
                    <View style={s.iconTile}>
                      <Icon size={19} color={colors.text} strokeWidth={2} />
                    </View>
                    <View style={s.rowBody}>
                      <Text style={s.label} numberOfLines={1}>{row.title}</Text>
                      <Text style={[s.sub, !!row.status && s.subStatus]} numberOfLines={1}>
                        {row.status ?? row.desc}
                      </Text>
                    </View>
                    {!!row.badge && (
                      <View style={s.badge}>
                        <Text style={s.badgeText}>{row.badge.text}</Text>
                      </View>
                    )}
                    <ChevronRight size={16} color={colors.textFaint} strokeWidth={2.2} />
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </Screen>
  );
}

const s = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: spacing.md, height: 52 },
  back: { width: 34, height: 40, justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text },

  body: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },

  previewCard: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: colors.bgMuted, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  previewAvatar: { width: 44, height: 44, borderRadius: 22 },
  previewLabel: { fontSize: 10.5, fontWeight: font.weightBold, color: colors.textFaint, letterSpacing: 0.6 },
  previewName: { fontSize: 15, fontWeight: font.weightHeavy, color: colors.text, marginTop: 2 },
  previewBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill, backgroundColor: "rgba(22,163,74,0.12)" },
  previewBadgePaused: { backgroundColor: "#fff7ed" },
  previewBadgeText: { fontSize: 11, fontWeight: font.weightBold, color: colors.success },
  previewBadgeTextPaused: { color: "#9a3412" },

  badge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: radius.pill, backgroundColor: "rgba(249,115,22,0.12)" },
  badgeText: { fontSize: 11, fontWeight: font.weightBold, color: colors.warning },

  pausedBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginTop: spacing.md, padding: spacing.md,
    backgroundColor: "#fff7ed", borderRadius: radius.md,
    borderWidth: 1, borderColor: "#fed7aa",
  },
  pausedText: { flex: 1, fontSize: font.sm, lineHeight: 18, color: "#9a3412" },

  groupLabel: {
    fontSize: 12,
    fontWeight: font.weightBold,
    color: colors.textFaint,
    letterSpacing: 0.72,
    textTransform: "uppercase",
    paddingTop: 26,
    paddingBottom: 10,
  },
  groupLabelFirst: { paddingTop: 20 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 13,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  iconTile: {
    width: 40, height: 40, flex: 0,
    borderRadius: radius.md,
    backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center",
  },
  rowBody: { flex: 1, minWidth: 0, gap: 2 },
  label: { fontSize: 14, fontWeight: font.weightBold, color: colors.text, letterSpacing: -0.14 },
  sub: { fontSize: 12, color: colors.textMuted },
  /** A real, loaded status line reads as data, not helper text. */
  subStatus: { color: colors.textSecondary, fontWeight: font.weightMedium },
});
