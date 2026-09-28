import { useEffect, useMemo, useState } from "react";
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation } from "@react-navigation/native";
import {
  Baby,
  BookOpen,
  Briefcase,
  Car,
  ChevronLeft,
  Dumbbell,
  Footprints,
  Gamepad2,
  Gem,
  Headphones,
  Heart,
  HeartPulse,
  House,
  Mic,
  MoreHorizontal,
  Music,
  Package,
  Palette,
  PawPrint,
  Search,
  Shirt,
  ShoppingBag,
  SlidersHorizontal,
  Sofa,
  Sparkles,
  Star,
  Tag,
  Trees,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { useAuthStore } from "@/store/auth.store";
import { useAuthGate } from "@/store/auth-gate.store";
import { ds, radius } from "@/theme/design";
import {
  shopApi,
  type ShopCategory,
  type ShopCoupon,
  type ShopDeal,
  type ShopPromoBanner,
} from "@/api/shop.api";

/**
 * Teezer Shop - the destination behind the feed header's "Shop" menu AND a
 * swipe-right off the feed's first tab (see useFeedSwipe.ts's shop mode).
 *
 * Promo banners, coupons, deals-of-the-day, and the featured category grid
 * are all real now - admin-authored via the "Teezer Shop" admin panel
 * section (AdminShopPromoBannerController/AdminShopDealController/
 * AdminShopCouponController) and read here through
 * shopApi.homeBanners/homeDeals/homeCoupons/categories. There is still no
 * cross-seller "browse all products" endpoint (every shop/product route
 * stays scoped to a username) - deals sidestep that by pointing at one
 * real, existing product each, picked by an admin. Search, filters, and
 * the cart button remain honest stubs - out of that scope. Any section
 * with nothing to show (0 active banners/deals/coupons) hides itself
 * entirely rather than rendering an empty card.
 */

const stub = (what: string) => Alert.alert(what, "This part of Shop isn't connected yet.");

/** ~10 of the ~20 platform categories (see ShopScreen.tsx's own, larger copy
 *  of this map for the full set) - just the ones this screen's grid shows.
 *  Tag is the fallback for any category returned without a matching icon. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "fashion": Shirt,
  "beauty": Sparkles,
  "electronics": Headphones,
  "home": House,
  "shoes": Footprints,
  "sports-outdoors": Dumbbell,
  "toys-games": Gamepad2,
  "books-stationery": BookOpen,
  "health-wellness": HeartPulse,
  "groceries-food": UtensilsCrossed,
  "baby-kids": Baby,
  "automotive": Car,
  "jewelry-accessories": Gem,
  "pet-supplies": PawPrint,
  "art-crafts": Palette,
  "music-instruments": Music,
  "furniture": Sofa,
  "garden-outdoor-living": Trees,
  "office-supplies": Briefcase,
  "digital-goods": Package,
};
/** A soft tint per tile, cycling - the reference gives each category tile its
 *  own colour rather than one repeated chip background. */
const TILE_TINTS = ["#FDECF1", "#F1EBF9", "#E9F1FB", "#FBF0E3", "#E7F5EC", "#FBF0E3", "#E9F1FB", "#F1EFF3"];
const iconForCategory = (slug: string) => CATEGORY_ICONS[slug] ?? Tag;

const money = (n: number) => `Rs ${n.toLocaleString("en-US")}`;

/** [HH, MM, SS], each already zero-padded - matches the three countdown
 *  chip boxes the design already renders. Clamped at 0, never negative. */
function countdownParts(ms: number): [string, string, string] {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")) as [string, string, string];
}

/**
 * The scrollable body of Shop, without the back-button header - used by
 * the standalone `ShopHomeScreen` route below. Was also shared with a
 * feed-swiped-in Shop layer (ShopFeedLayer.tsx), removed when the feed's
 * own Shop tab was removed; `topInset` still exists for a future caller
 * that renders this under its own header row instead of this file's own.
 */
export function ShopHomeContent({ topInset }: { topInset?: number } = {}) {
  const qc = useQueryClient();
  const me = useAuthStore((s) => s.user);
  const categoriesQ = useQuery({ queryKey: ["shop-categories-global"], queryFn: shopApi.categories });
  const bannersQ = useQuery({ queryKey: ["shop-banners-global"], queryFn: shopApi.homeBanners });
  const dealsQ = useQuery({ queryKey: ["shop-deals-global"], queryFn: shopApi.homeDeals });
  const couponsQ = useQuery({ queryKey: ["shop-coupons-global"], queryFn: shopApi.homeCoupons });

  const claim = useMutation({
    mutationFn: (id: number) => shopApi.claimCoupon(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["shop-coupons-global"] }),
    onError: (e) => {
      const msg =
        (e as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        "Couldn't claim that - try again.";
      Alert.alert("Not claimed", msg);
    },
  });

  const featuredCategories = useMemo(
    () =>
      (categoriesQ.data ?? [])
        .filter((c) => c.is_featured_home)
        .sort((a, b) => (a.home_sort_order ?? 0) - (b.home_sort_order ?? 0)),
    [categoriesQ.data],
  );

  /** The soonest deal to end, among whatever's currently active - the
   *  countdown tracks THAT, not a fixed "today at midnight" that would say
   *  the same thing regardless of what's actually live. */
  const soonestEndsAt = useMemo(() => {
    const times = (dealsQ.data ?? [])
      .map((d) => (d.ends_at ? new Date(d.ends_at).getTime() : null))
      .filter((t): t is number => t !== null);
    return times.length ? Math.min(...times) : null;
  }, [dealsQ.data]);

  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (soonestEndsAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [soonestEndsAt]);

  return (
    <ScrollView
      // Explicit light background of its own - without it, the inline feed
      // tab pane (HomeScreen.tsx) shows the video feed's black root through
      // any gap (top inset, bottom overscroll bounce) instead of Shop's own
      // light surface. The standalone route doesn't need this (its own
      // <Screen bg={ds.surfaceMuted}> already covers it), but setting it
      // here too is harmless - same color either way.
      style={{ flex: 1, backgroundColor: ds.surfaceMuted }}
      showsVerticalScrollIndicator={false}
      contentContainerStyle={[styles.scrollBody, topInset ? { paddingTop: topInset } : null]}
    >
        {/* ── Search + filter + cart ─────────────────────────────────── */}
        <View style={styles.searchRow}>
          <Pressable style={styles.searchBox} onPress={() => stub("Search")}>
            <Search size={16} color={ds.textFaint} />
            <Text style={styles.searchPlaceholder}>Search products and shops</Text>
          </Pressable>
          <Pressable style={styles.iconSquare} onPress={() => stub("Filters")} accessibilityLabel="Filters">
            <SlidersHorizontal size={17} color={ds.text} />
          </Pressable>
          <Pressable style={styles.cartSquare} onPress={() => stub("Cart")} accessibilityLabel="Cart">
            <ShoppingBag size={17} color={ds.onDark} />
          </Pressable>
        </View>

        {/* ── Filter pills ───────────────────────────────────────────── */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pillRow}>
          {["For You", "Mall", "Flash Sale", "Beauty", "Fashion"].map((label, i) => (
            <Pressable key={label} style={[styles.pill, i === 0 && styles.pillActive]} onPress={() => stub(label)}>
              <Text style={[styles.pillText, i === 0 && styles.pillTextActive]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        {/* ── Promo banners ──────────────────────────────────────────── */}
        {!!bannersQ.data?.length && (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.bannerRow}>
              {bannersQ.data.map((b: ShopPromoBanner) => (
                <Pressable
                  key={b.id}
                  style={[
                    styles.banner,
                    !b.image_url && { backgroundColor: b.gradient_start ?? ds.accent },
                  ]}
                  onPress={() => (b.cta_link ? void Linking.openURL(b.cta_link) : stub(b.cta_label))}
                >
                  {b.image_url ? (
                    <Image source={{ uri: b.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <>
                      <View style={styles.bannerBubbleBig} />
                      <View style={styles.bannerBubbleSmall} />
                    </>
                  )}
                  {!!b.subtitle && <Text style={styles.bannerEyebrow}>{b.subtitle.toUpperCase()}</Text>}
                  <Text style={styles.bannerHeadline}>{b.title}</Text>
                  {!!b.description && <Text style={styles.bannerSub}>{b.description}</Text>}
                  <View style={styles.bannerCta}>
                    <Text style={styles.bannerCtaText}>{b.cta_label}</Text>
                  </View>
                  {!b.image_url && (
                    <View style={styles.bannerIconWrap}>
                      <ShoppingBag size={30} color="#fff" strokeWidth={1.8} />
                    </View>
                  )}
                </Pressable>
              ))}
            </ScrollView>
            {bannersQ.data.length > 1 && (
              <View style={styles.dots}>
                {bannersQ.data.map((b, i) => (
                  <View key={b.id} style={[styles.dot, i === 0 && styles.dotActive]} />
                ))}
              </View>
            )}
          </>
        )}

        {/* ── Coupons ────────────────────────────────────────────────── */}
        {!!couponsQ.data?.length && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Your coupons</Text>
            </View>
            <View style={styles.couponRow}>
              {couponsQ.data.map((c: ShopCoupon) => (
                <View key={c.id} style={styles.couponCard}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.couponTitle}>{c.title}</Text>
                    {!!c.description && <Text style={styles.couponSub}>{c.description}</Text>}
                  </View>
                  {c.claimed ? (
                    <View style={styles.couponClaimed}>
                      <Text style={styles.couponClaimedText}>Claimed</Text>
                    </View>
                  ) : (
                    <Pressable
                      style={styles.couponClaim}
                      disabled={claim.isPending}
                      onPress={() => {
                        // Claiming credits the signed-in account. Had no
                        // check at all - a guest's tap 401'd and just
                        // showed the generic "Couldn't claim that" alert.
                        if (!me) {
                          useAuthGate.getState().open(() => claim.mutate(c.id));
                          return;
                        }
                        claim.mutate(c.id);
                      }}
                    >
                      <Text style={styles.couponClaimText}>Claim</Text>
                    </Pressable>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Category grid - admin-curated ─────────────────────────── */}
        {!!featuredCategories.length && (
          <View style={styles.categoryCard}>
            <View style={styles.categoryGrid}>
              {featuredCategories.map((c: ShopCategory, i) => {
                const Icon = iconForCategory(c.slug);
                return (
                  <Pressable key={c.id} style={styles.categoryTile} onPress={() => stub(c.name)}>
                    <View style={[styles.categoryIconWrap, { backgroundColor: TILE_TINTS[i % TILE_TINTS.length] }]}>
                      <Icon size={22} color={ds.text} strokeWidth={1.8} />
                    </View>
                    <Text style={styles.categoryLabel} numberOfLines={1}>{c.name}</Text>
                  </Pressable>
                );
              })}
              <Pressable style={styles.categoryTile} onPress={() => stub("All categories")}>
                <View style={[styles.categoryIconWrap, { backgroundColor: ds.surfaceSunken }]}>
                  <MoreHorizontal size={22} color={ds.textMuted} strokeWidth={1.8} />
                </View>
                <Text style={styles.categoryLabel}>All</Text>
              </Pressable>
            </View>
          </View>
        )}

        {/* ── Deals of the day ───────────────────────────────────────── */}
        {!!dealsQ.data?.length && (
          <>
            <View style={styles.sectionHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Text style={styles.sectionTitle}>Deals of the day</Text>
                {/* Only shown once a deal actually HAS an end time - no fake
                    countdown to a time nothing is really ending at. */}
                {soonestEndsAt !== null && (
                  <View style={styles.countdown}>
                    {countdownParts(soonestEndsAt - now).map((n, i) => (
                      <View key={i} style={styles.countdownRow}>
                        <View style={styles.countdownChip}><Text style={styles.countdownText}>{n}</Text></View>
                        {i < 2 && <Text style={styles.countdownColon}>:</Text>}
                      </View>
                    ))}
                  </View>
                )}
              </View>
            </View>

            <View style={styles.grid}>
              {dealsQ.data.map((d: ShopDeal) => (
                <Pressable key={d.id} style={styles.card} onPress={() => stub(d.name)}>
                  <View style={styles.cardImage}>
                    {d.image_url ? (
                      <Image source={{ uri: d.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
                    ) : (
                      <View style={[StyleSheet.absoluteFill, { backgroundColor: ds.surfaceSunken }]} />
                    )}
                    <View style={styles.discountBadge}>
                      <Text style={styles.discountText}>-{d.discount_percent}%</Text>
                    </View>
                    <Pressable style={styles.heartBtn} hitSlop={6} onPress={() => stub("Wishlist")}>
                      <Heart size={14} color={ds.text} />
                    </Pressable>
                  </View>
                  <Text style={styles.cardName} numberOfLines={1}>{d.name}</Text>
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                    <Text style={styles.cardPrice}>{money(d.deal_price)}</Text>
                    <Text style={styles.cardWasPrice}>{money(d.original_price)}</Text>
                  </View>
                  {(d.rating_avg > 0 || d.sold_count > 0) && (
                    <View style={styles.ratingRow}>
                      <Star size={11} color="#F5A623" fill="#F5A623" />
                      <Text style={styles.cardMeta}>{d.rating_avg.toFixed(1)} · {d.sold_count.toLocaleString()} sold</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </View>
          </>
        )}

        <View style={{ height: 24 }} />
    </ScrollView>
  );
}

/** Standalone Shop route (`ShopHome`) - a back-button header wrapping the
 *  same `ShopHomeContent` the feed's inline Shop tab renders, so both share
 *  one React Query cache and never drift apart. */
export function ShopHomeScreen() {
  const navigation = useNavigation<any>();
  return (
    <Screen edges={["top"]} bg={ds.surfaceMuted}>
      <View style={styles.headerRow}>
        <Pressable hitSlop={10} onPress={() => navigation.goBack()} style={styles.back}>
          <ChevronLeft size={22} color={ds.text} strokeWidth={2} />
        </Pressable>
        <Text style={styles.title}>Shop</Text>
      </View>
      <ShopHomeContent />
    </Screen>
  );
}

const styles = StyleSheet.create({
  headerRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    paddingHorizontal: 16, paddingTop: 6, paddingBottom: 8, backgroundColor: ds.surfaceMuted,
  },
  back: {
    width: 38, height: 38, borderRadius: 19, backgroundColor: ds.surface,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 22, fontWeight: "800", color: ds.text, letterSpacing: -0.4 },

  scrollBody: { paddingTop: 4 },

  searchRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, marginBottom: 14 },
  searchBox: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    height: 42, borderRadius: radius.md, backgroundColor: ds.surface, paddingHorizontal: 12,
  },
  searchPlaceholder: { fontSize: 14, color: ds.textFaint },
  iconSquare: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: ds.surface,
    alignItems: "center", justifyContent: "center",
  },
  cartSquare: {
    width: 42, height: 42, borderRadius: radius.md, backgroundColor: ds.text,
    alignItems: "center", justifyContent: "center",
  },

  pillRow: { paddingHorizontal: 16, gap: 8, paddingBottom: 18 },
  pill: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: ds.surface },
  pillActive: { backgroundColor: ds.text },
  pillText: { fontSize: 13.5, fontWeight: "700", color: ds.textDim },
  pillTextActive: { color: ds.onDark },

  bannerRow: { flexDirection: "row", paddingHorizontal: 16, gap: 12 },
  banner: {
    width: 317, height: 178, borderRadius: radius.xl, overflow: "hidden",
    backgroundColor: ds.accent, padding: 18, justifyContent: "center", gap: 6,
  },
  bannerBubbleBig: { position: "absolute", right: -30, top: -30, width: 150, height: 150, borderRadius: 75, backgroundColor: "rgba(255,255,255,0.1)" },
  bannerBubbleSmall: { position: "absolute", right: 30, bottom: -44, width: 110, height: 110, borderRadius: 55, backgroundColor: "rgba(255,255,255,0.1)" },
  bannerEyebrow: { fontSize: 11, fontWeight: "800", letterSpacing: 0.8, color: "rgba(255,255,255,0.85)" },
  bannerHeadline: { fontSize: 21, fontWeight: "800", color: "#fff", lineHeight: 26, maxWidth: 210 },
  bannerSub: { fontSize: 12.5, color: "rgba(255,255,255,0.9)", maxWidth: 220, lineHeight: 17 },
  bannerCta: { marginTop: 8, alignSelf: "flex-start", backgroundColor: "#fff", borderRadius: radius.pill, paddingHorizontal: 16, paddingVertical: 9 },
  bannerCtaText: { fontSize: 12.5, fontWeight: "800", color: ds.accent },
  bannerIconWrap: {
    position: "absolute", right: 18, top: 18, width: 56, height: 56, borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.16)", alignItems: "center", justifyContent: "center",
  },

  dots: { flexDirection: "row", justifyContent: "center", gap: 6, marginTop: 12, marginBottom: 22 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: ds.lineStrong },
  dotActive: { width: 16, backgroundColor: ds.accent },

  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, marginBottom: 12 },
  sectionTitle: { fontSize: 17, fontWeight: "800", color: ds.text, letterSpacing: -0.2 },
  sectionLink: { fontSize: 12.5, fontWeight: "700", color: ds.accent },

  couponRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 24 },
  couponCard: {
    flex: 1, flexDirection: "row", alignItems: "center", gap: 8,
    padding: 12, borderRadius: radius.lg, backgroundColor: ds.accentWash,
    borderWidth: 1, borderColor: "#f7d9e2", borderStyle: "dashed",
  },
  couponTitle: { fontSize: 14, fontWeight: "800", color: ds.text },
  couponSub: { fontSize: 11, color: ds.textMuted, marginTop: 1 },
  couponClaim: { backgroundColor: ds.accent, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 8 },
  couponClaimText: { fontSize: 12, fontWeight: "800", color: ds.onDark },
  couponClaimed: { backgroundColor: ds.surfaceAlt, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 8 },
  couponClaimedText: { fontSize: 11.5, fontWeight: "700", color: ds.textFaint },

  categoryCard: { marginHorizontal: 16, marginBottom: 24, padding: 16, borderRadius: radius.xl, backgroundColor: ds.surface },
  categoryGrid: { flexDirection: "row", flexWrap: "wrap", rowGap: 18 },
  categoryTile: { width: "25%", alignItems: "center", gap: 8 },
  categoryIconWrap: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center" },
  categoryLabel: { fontSize: 11.5, fontWeight: "700", color: ds.text, textAlign: "center" },

  countdown: { flexDirection: "row", alignItems: "center", gap: 2 },
  countdownRow: { flexDirection: "row", alignItems: "center" },
  countdownChip: { backgroundColor: ds.text, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2, minWidth: 22, alignItems: "center" },
  countdownText: { fontSize: 11, fontWeight: "800", color: ds.onDark },
  countdownColon: { fontSize: 11, fontWeight: "800", color: ds.text, marginHorizontal: 1 },

  grid: { paddingHorizontal: 16, flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", rowGap: 18 },
  card: { width: "48%" },
  cardImage: { position: "relative", aspectRatio: 1, borderRadius: radius.lg, overflow: "hidden" },
  discountBadge: { position: "absolute", top: 8, left: 8, backgroundColor: ds.accent, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  discountText: { fontSize: 10, fontWeight: "800", color: ds.onDark },
  heartBtn: {
    position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13,
    backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center",
  },
  cardName: { fontSize: 13, fontWeight: "600", color: ds.text, marginTop: 8 },
  cardPrice: { fontSize: 14, fontWeight: "800", color: ds.accent },
  cardWasPrice: { fontSize: 11.5, color: ds.textFaint, textDecorationLine: "line-through" },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 5 },
  cardMeta: { fontSize: 11.5, color: ds.textMuted },
});
