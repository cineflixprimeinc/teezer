import { useState } from "react";
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Check, ChevronDown, ChevronLeft, Minus, Plus, Share2, ShieldCheck, Star, Store } from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { BottomSheet } from "@/components/BottomSheet";
import { SendToSheet } from "@/components/SendToSheet";
import { ds, radius } from "@/theme/design";
import { shopApi } from "@/api/shop.api";
import { inboxApi } from "@/api/inbox.api";
import type { RootStackParamList } from "@/navigation/types";

/**
 * A single product's page - opened from a shop's product grid
 * (ShopScreen.tsx's ProductCard, previously undecorated/unpressable).
 *
 * "Buy Now" hands off to the web checkout (reelsoo.com/shop/checkout/{id}),
 * same reasoning and same pattern as coins' web hand-off in
 * StudioWalletsSection.tsx: no Stripe/Razorpay SDK exists in this app, and
 * Shop products are physical/digital goods, not "digital content" under
 * Apple's in-app-purchase rule the way coins are, so there is no App Store
 * requirement pulling this in-app instead.
 */
const WEB_ORIGIN = "https://teezer.live";

const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

export function ProductDetailScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "ProductDetail">>();
  const { productId } = route.params;
  const insets = useSafeAreaInsets();

  const [qty, setQty] = useState(1);
  const [variation, setVariation] = useState<Record<string, string>>({});
  const [imgIndex, setImgIndex] = useState(0);
  // Which variation group's dropdown sheet is open (its name), or none.
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);

  const productQ = useQuery({ queryKey: ["product", productId], queryFn: () => shopApi.product(productId) });
  const product = productQ.data;

  const images = product ? (product.images.length ? product.images : product.image_url ? [product.image_url] : []) : [];
  // Defensive: variations/options come back as a nullable JSON blob a seller
  // filled in free-form (server/database/migrations/2026_08_18_000007_add_
  // product_details_to_products_table.php - variations is a nullable json
  // column with no default) - guard both levels rather than trust the shape,
  // same reasoning as the ${name}-${index} keys below.
  const variationGroups = (product?.variations ?? [])
    .map((v) => ({ name: v.name, options: Array.isArray(v.options) ? v.options : [] }))
    .filter((v) => v.options.length > 0);
  const openGroupOptions = variationGroups.find((v) => v.name === openGroup)?.options ?? [];

  const buyNow = () => {
    if (!product) return;
    Linking.openURL(`${WEB_ORIGIN}/shop/checkout/${product.id}`).catch(() => {});
  };

  return (
    <Screen bg={ds.surface} edges={["top"]}>
      <View style={styles.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back" hitSlop={8} style={styles.headerBtn} onPress={() => navigation.goBack()}>
          <ChevronLeft size={22} color={ds.text} />
        </Pressable>
        <Text style={styles.headerTitle} numberOfLines={1}>{product?.name ?? ""}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Share"
          hitSlop={8}
          style={styles.headerBtn}
          onPress={() => setSendOpen(true)}
          disabled={!product}
        >
          <Share2 size={20} color={ds.text} />
        </Pressable>
      </View>

      {productQ.isLoading ? (
        <ActivityIndicator style={{ marginTop: 60 }} color={ds.accent} />
      ) : !product ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>This product isn't available.</Text>
        </View>
      ) : (
        <>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 140 }}>
            <View style={styles.imageWrap}>
              {images.length ? (
                <Image source={{ uri: images[imgIndex] }} style={styles.image} resizeMode="cover" />
              ) : (
                <View style={[styles.image, styles.imageFallback]} />
              )}
            </View>
            {images.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.thumbRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}>
                {images.map((uri, i) => (
                  <Pressable key={uri + i} onPress={() => setImgIndex(i)} style={[styles.thumb, i === imgIndex && styles.thumbActive]}>
                    <Image source={{ uri }} style={styles.thumbImg} />
                  </Pressable>
                ))}
              </ScrollView>
            )}

            <View style={styles.body}>
              <View style={styles.shopRow}>
                <Store size={13} color={ds.textMuted} />
                <Text style={styles.shopName}>{product.shop.name ?? product.shop.username}</Text>
              </View>

              <Text style={styles.name}>{product.name}</Text>

              <View style={styles.priceRow}>
                <Text style={styles.price}>{money(product.price, product.currency)}</Text>
                {product.compare_at_price != null && product.compare_at_price > product.price && (
                  <Text style={styles.comparePrice}>{money(product.compare_at_price, product.currency)}</Text>
                )}
              </View>

              <View style={styles.ratingRow}>
                <Star size={13} color="#F5A623" fill="#F5A623" />
                <Text style={styles.ratingText}>
                  {product.rating_avg.toFixed(1)} ({product.rating_count}) · {product.sold_count} sold
                </Text>
              </View>

              {product.stock <= 0 && <Text style={styles.outOfStock}>Out of stock</Text>}

              {!!product.description && <Text style={styles.description}>{product.description}</Text>}

              {variationGroups.map((v, vi) => (
                <View key={`${v.name}-${vi}`} style={styles.variationGroup}>
                  <Text style={styles.variationLabel}>{v.name}</Text>
                  <Pressable
                    accessibilityRole="button"
                    style={styles.variationDropdown}
                    onPress={() => setOpenGroup(v.name)}
                  >
                    <Text style={[styles.variationDropdownText, !variation[v.name] && styles.variationDropdownPlaceholder]}>
                      {variation[v.name] ?? `Select ${v.name}`}
                    </Text>
                    <ChevronDown size={16} color={ds.textMuted} />
                  </Pressable>
                </View>
              ))}

              <View style={styles.qtyRow}>
                <Text style={styles.variationLabel}>Quantity</Text>
                <View style={styles.stepper}>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setQty((n) => Math.max(1, n - 1))} style={styles.stepperBtn}>
                    <Minus size={14} color={ds.text} />
                  </Pressable>
                  <Text style={styles.stepperValue}>{qty}</Text>
                  <Pressable accessibilityRole="button" hitSlop={8} onPress={() => setQty((n) => Math.min(product.stock || 1, n + 1))} style={styles.stepperBtn}>
                    <Plus size={14} color={ds.text} />
                  </Pressable>
                </View>
              </View>

              <View style={styles.secureRow}>
                <ShieldCheck size={13} color={ds.textMuted} />
                <Text style={styles.secureText}>Checkout opens securely in your browser</Text>
              </View>
            </View>
          </ScrollView>

          <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
            <Pressable
              accessibilityRole="button"
              disabled={product.stock <= 0}
              onPress={buyNow}
              style={[styles.buyBtn, product.stock <= 0 && styles.buyBtnDisabled]}
            >
              <Text style={styles.buyBtnText}>{product.stock <= 0 ? "Out of Stock" : `Buy Now · ${money(product.price * qty, product.currency)}`}</Text>
            </Pressable>
          </View>
        </>
      )}

      <BottomSheet visible={openGroup !== null} onClose={() => setOpenGroup(null)} height="auto" scrollable={false}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>{openGroup}</Text>
          {/* Keyed on index too, not just the option text: a seller's own
             free-text "Choices" field (AddProductScreen) doesn't dedupe, so
             two identical option strings in one group are possible and
             previously collided as React keys. */}
          {openGroupOptions.map((opt, oi) => {
            const on = openGroup !== null && variation[openGroup] === opt;
            return (
              <Pressable
                key={`${opt}-${oi}`}
                accessibilityRole="button"
                style={styles.sheetOptionRow}
                onPress={() => {
                  if (openGroup !== null) setVariation((prev) => ({ ...prev, [openGroup]: opt }));
                  setOpenGroup(null);
                }}
              >
                <Text style={[styles.sheetOptionText, on && styles.sheetOptionTextOn]}>{opt}</Text>
                {on && <Check size={16} color={ds.accent} strokeWidth={3} />}
              </Pressable>
            );
          })}
        </View>
      </BottomSheet>

      <SendToSheet
        visible={sendOpen}
        onClose={() => setSendOpen(false)}
        title={product ? `Send "${product.name}"` : "Send product"}
        onSend={(friendId) => inboxApi.shareProduct(friendId, productId)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, height: 52 },
  headerBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "800", color: ds.text },

  emptyWrap: { flex: 1, alignItems: "center", justifyContent: "center", padding: 40 },
  emptyText: { fontSize: 13.5, color: ds.textMuted, textAlign: "center" },

  imageWrap: { width: "100%", aspectRatio: 1, backgroundColor: ds.surfaceSunken },
  image: { width: "100%", height: "100%" },
  imageFallback: { backgroundColor: ds.surfaceSunken },
  thumbRow: { marginTop: 10 },
  thumb: { width: 54, height: 54, borderRadius: radius.sm, overflow: "hidden", borderWidth: 1.5, borderColor: "transparent" },
  thumbActive: { borderColor: ds.accent },
  thumbImg: { width: "100%", height: "100%" },

  body: { padding: 16 },
  shopRow: { flexDirection: "row", alignItems: "center", gap: 5, marginBottom: 6 },
  shopName: { fontSize: 12, fontWeight: "700", color: ds.textMuted },
  name: { fontSize: 18, fontWeight: "800", color: ds.text, lineHeight: 24 },
  priceRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginTop: 8 },
  price: { fontSize: 21, fontWeight: "900", color: ds.accent },
  comparePrice: { fontSize: 13, color: ds.textFaint, textDecorationLine: "line-through" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 },
  ratingText: { fontSize: 12, color: ds.textMuted },
  outOfStock: { marginTop: 8, fontSize: 12, fontWeight: "700", color: "#DC2626" },
  description: { marginTop: 14, fontSize: 13.5, lineHeight: 20, color: ds.textDim },

  variationGroup: { marginTop: 18 },
  variationLabel: { fontSize: 11.5, fontWeight: "800", color: ds.textFaint, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 },
  variationDropdown: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    height: 44, paddingHorizontal: 14, borderRadius: radius.md, borderWidth: 1, borderColor: ds.line,
  },
  variationDropdownText: { fontSize: 13.5, fontWeight: "700", color: ds.text },
  variationDropdownPlaceholder: { fontWeight: "500", color: ds.textFaint },

  sheetContent: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },
  sheetTitle: { fontSize: 15, fontWeight: "800", color: ds.text, marginBottom: 10 },
  sheetOptionRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    height: 46, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: ds.lineSoft,
  },
  sheetOptionText: { fontSize: 14, color: ds.text },
  sheetOptionTextOn: { fontWeight: "800", color: ds.accent },

  qtyRow: { marginTop: 18, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  stepper: { flexDirection: "row", alignItems: "center", gap: 14, borderWidth: 1, borderColor: ds.line, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  stepperBtn: { width: 22, height: 22, alignItems: "center", justifyContent: "center" },
  stepperValue: { fontSize: 13, fontWeight: "800", color: ds.text, minWidth: 16, textAlign: "center" },

  secureRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 20, justifyContent: "center" },
  secureText: { fontSize: 11, color: ds.textFaint },

  bottomBar: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 10,
    backgroundColor: ds.surface, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ds.line,
  },
  buyBtn: { height: 48, borderRadius: radius.md, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  buyBtnDisabled: { backgroundColor: ds.silverSoft },
  buyBtnText: { fontSize: 14.5, fontWeight: "800", color: ds.onDark },
});
