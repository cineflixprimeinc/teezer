import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import LottieView from "lottie-react-native";
import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigation, useRoute, type RouteProp } from "@react-navigation/native";
import {
  Baby,
  BookOpen,
  Briefcase,
  Car,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Dumbbell,
  Footprints,
  Gamepad2,
  Gem,
  Headphones,
  Heart,
  HeartPulse,
  House,
  LayoutGrid,
  List as ListIcon,
  type LucideIcon,
  Music,
  Package,
  Palette,
  PawPrint,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Share2,
  ShieldCheck,
  Shirt,
  ShoppingBasket,
  ShoppingCart,
  Smartphone,
  Sofa,
  Sparkles,
  Star,
  Tag,
  Trees,
  Truck,
  X,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Avatar } from "@/components/Avatar";
import { BottomSheet } from "@/components/BottomSheet";
import { VerifiedBadge } from "@/components/profile/VerifiedBadge";
import { ds, radius } from "@/theme/design";
import { shopApi, type ProductSort, type ShopProduct } from "@/api/shop.api";
import { useAuthStore } from "@/store/auth.store";
import type { RootStackParamList } from "@/navigation/types";

/** "No products yet" illustration - the user's own looping Lottie, replacing
 *  the previous static noproducts.svg at this one call site. */
const NO_PRODUCTS_ANIMATION = require("../../assets/NOPRODUCTSYET.json");

/** One icon per category slug, for the carousel - a Teezer Shop currently
 *  ships ~20 platform categories (see the shop_categories seed migrations);
 *  Tag is the fallback for any future one added without a matching icon. */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "fashion": Shirt,
  "beauty": Sparkles,
  "electronics": Smartphone,
  "home": House,
  "shoes": Footprints,
  "sports-outdoors": Dumbbell,
  "toys-games": Gamepad2,
  "books-stationery": BookOpen,
  "health-wellness": HeartPulse,
  "groceries-food": ShoppingBasket,
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
const iconForCategory = (slug: string | null) => (slug ? CATEGORY_ICONS[slug] : null) ?? Tag;

type Tab = "products" | "collections" | "reviews";

const SORTS: { key: ProductSort; label: string }[] = [
  { key: "recommended", label: "Recommended" },
  { key: "best_sellers", label: "Best sellers" },
  { key: "new_arrivals", label: "New arrivals" },
];

// Was hardcoded to "NPR" regardless of the product's own currency (each
// product carries its seller's actual currency - see AddProductScreen's
// currency picker) - every non-NPR product's price read wrong on its own
// storefront card.
const money = (n: number, currency: string) => `${currency} ${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K` : `${n}`);

export function ShopScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<RouteProp<RootStackParamList, "Shop">>();
  const { username } = route.params;
  const authUser = useAuthStore((s) => s.user);
  const isOwner = !!authUser && authUser.username === username;

  const [tab, setTab] = useState<Tab>("products");
  const [sort, setSort] = useState<ProductSort>("recommended");
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [grid, setGrid] = useState(true);
  const [category, setCategory] = useState<string | null>(null); // null = "All"
  const [policiesOpen, setPoliciesOpen] = useState(false);
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");

  // Debounced, same 250ms pattern as SearchScreen.tsx - one request per
  // keystroke would spam the endpoint for no benefit to a typing user.
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw.trim()), 250);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const shopQ = useQuery({ queryKey: ["shop", username], queryFn: () => shopApi.profile(username) });
  const shop = shopQ.data;
  const categoriesQ = useQuery({ queryKey: ["shop-categories-global"], queryFn: shopApi.categories });

  /* Products/Collections/Reviews each own their query in their own child
   * component (ProductsGrid/CollectionsGrid/CollectionsPreview/ReviewsList
   * below), keyed on username - invalidating by that key prefix refetches
   * whichever of them is actually mounted for the active tab, without this
   * screen needing to know their exact params (sort/category/pagination). */
  const qc = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        shopQ.refetch(),
        categoriesQ.refetch(),
        qc.invalidateQueries({ queryKey: ["shop-products"] }),
        qc.invalidateQueries({ queryKey: ["shop-collections"] }),
        qc.invalidateQueries({ queryKey: ["shop-reviews"] }),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  /* Backend-enforced gate, not just "was this button hidden on the profile
   * that linked here" - shopApi.profile() (GET /shops/{username}) only ever
   * reports `available: true` once ShopController::approvedShop() confirms
   * an admin-approved Shop row exists, regardless of how this screen was
   * reached (the profile's Shop button, a deep link, a stale nav state).
   * Loading and "no such account" are handled separately so a legitimately
   * slow request doesn't flash the unavailable message. */
  const headerBar = (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Back"
        hitSlop={8}
        style={styles.headerBtn}
        onPress={() => navigation.goBack()}
      >
        <ChevronLeft size={22} color={ds.text} />
      </Pressable>
      <View style={styles.headerRight}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Refresh shop"
          hitSlop={8}
          style={styles.headerBtn}
          onPress={onRefresh}
          disabled={refreshing}
        >
          {refreshing ? <ActivityIndicator size="small" color={ds.text} /> : <RefreshCw size={18} color={ds.text} />}
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Share shop" hitSlop={8} style={styles.headerBtn}>
          <Share2 size={19} color={ds.text} />
        </Pressable>
        {isOwner && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Shop Settings"
            hitSlop={8}
            style={styles.headerBtn}
            onPress={() => navigation.navigate("ShopSettings")}
          >
            <Settings size={20} color={ds.text} />
          </Pressable>
        )}
      </View>
    </View>
  );

  if (shopQ.isLoading) {
    return (
      <Screen bg={ds.surface}>
        {headerBar}
        <ActivityIndicator style={{ marginTop: 60 }} color={ds.accent} />
      </Screen>
    );
  }

  if (!shop?.available) {
    const paused = !!shop?.is_paused;
    return (
      <Screen bg={ds.surface}>
        {headerBar}
        <View style={styles.unavailable}>
          {paused && <Avatar uri={shop?.logo_url} style={styles.unavailableAvatar} />}
          <Text style={styles.unavailableTitle}>
            {paused ? `${shop?.shop_name ?? username} is temporarily paused` : "Shop unavailable"}
          </Text>
          <Text style={styles.unavailableText}>
            {paused
              ? shop?.pause_message || "This shop isn't accepting new orders right now. Please check back later."
              : isOwner
              ? "Your shop isn't active yet. Go to Settings → Sell on Teezer to check your application status."
              : "This shop isn't available right now."}
          </Text>
          {paused && !!shop?.paused_until && (
            <Text style={styles.unavailableSub}>
              Expected back {new Date(shop.paused_until).toLocaleDateString()}
            </Text>
          )}
        </View>
      </Screen>
    );
  }

  // Trust strip - derived from the seller's own Shipping & Delivery / Shop
  // Policies settings, each with an honest fallback for whatever the seller
  // hasn't configured yet (never a fabricated claim - see accepts_returns
  // below in particular).
  const shipping = shop?.policies?.shipping;
  const returns = shop?.policies?.returns;
  const support = shop?.policies?.support;

  const shippingDesc = shipping?.free_threshold
    ? `On orders over ${shipping.free_threshold}`
    : shipping?.delivery_time
    ? `Delivered in ${shipping.delivery_time}`
    : shipping?.method
    ? shipping.method
    : "Contact seller for shipping details";

  // Three states, not two: a seller who explicitly said "no returns" must
  // never see that render as a false "Easy returns" claim - only the
  // never-configured case (accepts_returns undefined) gets the neutral line.
  const returnsDesc =
    returns?.accepts_returns === true
      ? returns.period
        ? `${returns.period} return window`
        : "Returns accepted"
      : returns?.accepts_returns === false
      ? "This shop does not accept returns"
      : "Contact seller about returns";

  const supportDesc = support?.email || support?.phone || "We're here to help";

  return (
    <Screen bg={ds.surface}>
      {headerBar}

      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={ds.accent} />}
      >
        {/* ── Identity ─────────────────────────────────────────────────── */}
        <View style={styles.identity}>
          <View style={styles.avatarCol}>
            <Avatar uri={shop?.logo_url} style={styles.avatar} />
            {shop?.is_live && (
              <View style={styles.liveBadge}>
                <Text style={styles.liveBadgeText}>▶ LIVE</Text>
              </View>
            )}
          </View>

          <View style={styles.identityMain}>
            <View style={styles.nameRow}>
              <Text style={styles.shopName} numberOfLines={1}>
                {shop?.shop_name ?? username}
              </Text>
              {shop?.user.is_verified && <VerifiedBadge size={16} />}
            </View>
            {!!shop?.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{shop.category}</Text>
              </View>
            )}
            <Text style={styles.handle}>@{shop?.user.username ?? username}</Text>
            {!!shop?.tagline && <Text style={styles.tagline}>{shop.tagline}</Text>}
            <View style={styles.ratingRow}>
              <Star size={13} color="#F5A623" fill="#F5A623" />
              <Text style={styles.ratingText}>
                {(shop?.rating_avg ?? 0).toFixed(1)} ({compact(shop?.rating_count ?? 0)})
              </Text>
              <Text style={styles.ratingDot}>·</Text>
              <Text style={styles.ratingText}>{compact(shop?.sold_count ?? 0)} sold</Text>
              <Text style={styles.ratingDot}>·</Text>
              <Text style={styles.ratingText}>Active today</Text>
            </View>
          </View>
        </View>

        <View style={styles.actionsRow}>
          {isOwner ? (
            <>
              {/* Follow/Message make no sense on your own shop - Edit Shop
               *  (the wizard everything else in the app calls "Manage Shop")
               *  and a real, labelled Add Products button replace them,
               *  rather than the icon-only "+" this used to be. */}
              <Pressable
                accessibilityRole="button"
                style={styles.messageBtn}
                onPress={() => navigation.navigate("EditShop")}
              >
                <Text style={styles.messageBtnText}>Edit Shop</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.followBtn}
                onPress={() => navigation.navigate("AddProduct", { username })}
              >
                <Text style={styles.followBtnText}>Add Products</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Pressable accessibilityRole="button" style={styles.followBtn}>
                <Text style={styles.followBtnText}>Follow</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                style={styles.messageBtn}
                onPress={() => {
                  if (!shop) return;
                  navigation.navigate("Chat", {
                    userId: shop.user.id,
                    username: shop.user.username,
                    name: shop.shop_name,
                    avatar: shop.logo_url,
                    isVerified: shop.user.is_verified,
                  });
                }}
              >
                <Text style={styles.messageBtnText}>Message</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="More options" style={styles.moreBtn}>
                <ChevronDown size={16} color={ds.text} />
              </Pressable>
            </>
          )}
        </View>

        {/* ── Trust strip ──────────────────────────────────────────────── */}
        <View style={styles.trustStrip}>
          <TrustItem icon={<Truck size={18} color={ds.accent} />} title="Shipping" desc={shippingDesc} onPress={() => setPoliciesOpen(true)} />
          <TrustItem icon={<RotateCcw size={18} color="#16a34a" />} title="Returns" desc={returnsDesc} onPress={() => setPoliciesOpen(true)} />
          <TrustItem icon={<ShieldCheck size={18} color="#6b5fc9" />} title="Secure payment" desc="100% secure checkout" />
          <TrustItem icon={<Headphones size={18} color="#e08a2b" />} title="Support" desc={supportDesc} onPress={() => setPoliciesOpen(true)} />
        </View>

        {/* ── Tabs ─────────────────────────────────────────────────────── */}
        <View style={styles.tabsRow}>
          <TabButton label={`Products ${shop?.counts.products ?? ""}`} active={tab === "products"} onPress={() => setTab("products")} />
          <TabButton label={`Collections ${shop?.counts.collections ?? ""}`} active={tab === "collections"} onPress={() => setTab("collections")} />
          <TabButton label={`Reviews (${shop?.counts.reviews ?? 0})`} active={tab === "reviews"} onPress={() => setTab("reviews")} />
        </View>

        {tab === "products" && (
          <>
            {/* ── Product search ───────────────────────────────────── */}
            <View style={styles.searchBox}>
              <Search size={16} color={ds.textFaint} />
              <TextInput
                value={searchRaw}
                onChangeText={setSearchRaw}
                placeholder="Search products"
                placeholderTextColor={ds.textFaint}
                style={styles.searchInput}
                autoCapitalize="none"
                autoCorrect={false}
              />
              {!!searchRaw && (
                <Pressable hitSlop={8} onPress={() => setSearchRaw("")}>
                  <X size={15} color={ds.textFaint} />
                </Pressable>
              )}
            </View>

            {/* ── Category carousel ─────────────────────────────────── */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryRow}>
              <CategoryPill icon={LayoutGrid} label="All" active={category === null} onPress={() => setCategory(null)} />
              {(categoriesQ.data ?? []).map((c) => (
                <CategoryPill
                  key={c.id}
                  icon={iconForCategory(c.slug)}
                  label={c.name}
                  active={category === c.slug}
                  onPress={() => setCategory(c.slug)}
                />
              ))}
            </ScrollView>

            {/* ── Filter row ─────────────────────────────────────────── */}
            <View style={styles.filterRow}>
              <Pressable
                accessibilityRole="button"
                style={styles.sortPill}
                onPress={() => setSortMenuOpen((o) => !o)}
              >
                <Text style={styles.sortPillText}>{SORTS.find((s) => s.key === sort)?.label}</Text>
                <ChevronDown size={13} color={ds.accent} />
              </Pressable>
              {sortMenuOpen &&
                SORTS.filter((s) => s.key !== sort).map((s) => (
                  <Pressable
                    key={s.key}
                    accessibilityRole="button"
                    style={styles.filterChip}
                    onPress={() => {
                      setSort(s.key);
                      setSortMenuOpen(false);
                    }}
                  >
                    <Text style={styles.filterChipText}>{s.label}</Text>
                  </Pressable>
                ))}
              <View style={{ flex: 1 }} />
              <Pressable accessibilityRole="button" accessibilityLabel="Grid view" hitSlop={6} onPress={() => setGrid(true)}>
                <LayoutGrid size={18} color={grid ? ds.accent : ds.textMuted} />
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="List view" hitSlop={6} onPress={() => setGrid(false)} style={{ marginLeft: 14 }}>
                <ListIcon size={18} color={!grid ? ds.accent : ds.textMuted} />
              </Pressable>
            </View>

            <ProductsGrid username={username} sort={sort} category={category} search={search} numColumns={grid ? 2 : 1} />
            <CollectionsPreview username={username} />
          </>
        )}

        {tab === "collections" && <CollectionsGrid username={username} />}
        {tab === "reviews" && <ReviewsList username={username} shopName={shop?.shop_name} />}

        <View style={{ height: 24 }} />
      </ScrollView>

      {/* Full policy detail - the trust strip above only ever fit one derived
         line per topic; everything the seller actually filled in under Shop
         Settings > Shipping & Delivery / Shop Policies lives here instead of
         nowhere. */}
      <BottomSheet visible={policiesOpen} onClose={() => setPoliciesOpen(false)} height={0.75}>
        <View style={styles.sheetContent}>
          <Text style={styles.sheetTitle}>Shop Policies</Text>

          <PolicySection icon={<Truck size={16} color={ds.accent} />} title="Shipping & Delivery">
            <PolicyRow label="Ships from" value={shipping?.ships_from} />
            <PolicyRow label="Delivery areas" value={shipping?.delivery_regions} />
            <PolicyRow label="Method" value={shipping?.method} />
            <PolicyRow label="Delivery time" value={shipping?.delivery_time} />
            <PolicyRow label="Shipping fee" value={shipping?.fee} />
            <PolicyRow label="Free shipping" value={shipping?.free_threshold ? `On orders over ${shipping.free_threshold}` : undefined} />
            {!shipping && <Text style={styles.policyFallback}>The seller hasn't set shipping details yet - contact them directly.</Text>}
          </PolicySection>

          <PolicySection icon={<RotateCcw size={16} color="#16a34a" />} title="Returns & Refunds">
            <PolicyRow
              label="Accepts returns"
              value={returns?.accepts_returns === true ? "Yes" : returns?.accepts_returns === false ? "No" : undefined}
            />
            <PolicyRow label="Return window" value={returns?.period} />
            <PolicyRow label="Conditions" value={returns?.conditions} />
            <PolicyRow label="Refund method" value={returns?.refund_method} />
            {!!shop?.policies?.refund_policy && <Text style={styles.policyFreeText}>{shop.policies.refund_policy}</Text>}
            {!returns && !shop?.policies?.refund_policy && <Text style={styles.policyFallback}>The seller hasn't set a returns policy yet - contact them directly.</Text>}
          </PolicySection>

          {!!shop?.policies?.cancellation_policy && (
            <PolicySection icon={<RotateCcw size={16} color="#e08a2b" />} title="Cancellations">
              <Text style={styles.policyFreeText}>{shop.policies.cancellation_policy}</Text>
            </PolicySection>
          )}

          <PolicySection icon={<Headphones size={16} color="#e08a2b" />} title="Contact & Support">
            <PolicyRow label="Email" value={support?.email} />
            <PolicyRow label="Phone" value={support?.phone} />
            {!support?.email && !support?.phone && <Text style={styles.policyFallback}>Message the seller directly from their shop page.</Text>}
          </PolicySection>

          {!!shop?.policies?.terms && (
            <PolicySection icon={<ShieldCheck size={16} color="#6b5fc9" />} title="Terms">
              <Text style={styles.policyFreeText}>{shop.policies.terms}</Text>
            </PolicySection>
          )}
        </View>
      </BottomSheet>
    </Screen>
  );
}

function PolicySection({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <View style={styles.policySection}>
      <View style={styles.policySectionHeader}>
        {icon}
        <Text style={styles.policySectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function PolicyRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <View style={styles.policyRow}>
      <Text style={styles.policyRowLabel}>{label}</Text>
      <Text style={styles.policyRowValue}>{value}</Text>
    </View>
  );
}

/* ── sections ─────────────────────────────────────────────────────────── */

function TrustItem({
  icon, title, desc, onPress,
}: { icon: React.ReactNode; title: string; desc: string; onPress?: () => void }) {
  const Wrap = onPress ? Pressable : View;
  return (
    <Wrap accessibilityRole={onPress ? "button" : undefined} style={styles.trustItem} onPress={onPress}>
      {icon}
      <Text style={styles.trustTitle}>{title}</Text>
      <Text style={styles.trustDesc} numberOfLines={1}>{desc}</Text>
    </Wrap>
  );
}

function TabButton({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.tabBtn}>
      <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{label}</Text>
      {active && <View style={styles.tabUnderline} />}
    </Pressable>
  );
}

function CategoryPill({
  icon: Icon, label, active, onPress,
}: { icon: LucideIcon; label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.categoryPill, active && styles.categoryPillActive]}>
      <Icon size={14} color={active ? ds.onDark : ds.textDim} />
      <Text style={[styles.categoryPillText, active && styles.categoryPillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ProductsGrid({
  username,
  sort,
  category,
  search,
  numColumns,
}: {
  username: string;
  sort: ProductSort;
  category: string | null;
  search: string;
  numColumns: number;
}) {
  const navigation = useNavigation<any>();
  const q = useInfiniteQuery({
    queryKey: ["shop-products", username, sort, category, search],
    queryFn: ({ pageParam }) => shopApi.products(username, pageParam as number, sort, category, search),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  });
  const products = (q.data?.pages ?? []).flatMap((p) => p.data);
  const authUser = useAuthStore((s) => s.user);
  const isOwner = !!authUser && authUser.username === username;

  if (q.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={ds.accent} />;
  if (!products.length) {
    // A search with no matches isn't "the shop has no products" - the
    // illustration/Add Products button belong to the genuinely-empty case
    // only, not to "your search didn't match anything".
    return search ? (
      <EmptyState text={`No products match "${search}"`} />
    ) : (
      <EmptyState
        text="No products yet"
        illustration
        onAddPress={isOwner ? () => navigation.navigate("AddProduct", { username }) : undefined}
      />
    );
  }

  return (
    <FlatList
      data={products}
      key={numColumns}
      numColumns={numColumns}
      keyExtractor={(p) => String(p.id)}
      scrollEnabled={false}
      columnWrapperStyle={numColumns > 1 ? styles.gridRow : undefined}
      contentContainerStyle={styles.gridContent}
      onEndReached={() => q.hasNextPage && q.fetchNextPage()}
      renderItem={({ item }) => <ProductCard product={item} wide={numColumns === 1} />}
    />
  );
}

function ProductCard({ product, wide }: { product: ShopProduct; wide: boolean }) {
  const navigation = useNavigation<any>();
  return (
    <Pressable
      style={[styles.productCard, wide && styles.productCardWide]}
      onPress={() => navigation.navigate("ProductDetail", { productId: product.id })}
    >
      <View style={styles.productImageWrap}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.productImage} />
        ) : (
          <View style={[styles.productImage, styles.productImageFallback]} />
        )}
        {!!product.badge && (
          <View style={[styles.badgeRibbon, product.badge === "bestseller" ? styles.badgeBestseller : styles.badgeNew]}>
            <Text style={styles.badgeRibbonText}>{product.badge === "bestseller" ? "Bestseller" : "New"}</Text>
          </View>
        )}
        <Pressable accessibilityRole="button" accessibilityLabel="Wishlist" style={styles.heartBtn} hitSlop={6}>
          <Heart size={15} color={ds.text} />
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Add to cart" style={styles.cartBtn} hitSlop={6}>
          <ShoppingCart size={15} color={ds.onDark} />
        </Pressable>
      </View>
      <Text style={styles.productName} numberOfLines={1}>{product.name}</Text>
      <Text style={styles.productPrice}>{money(product.price, product.currency)}</Text>
      <View style={styles.ratingRow}>
        <Star size={11} color="#F5A623" fill="#F5A623" />
        <Text style={styles.productMeta}>{product.rating_avg.toFixed(1)} · {compact(product.sold_count)} sold</Text>
      </View>
      {!!product.colors.length && (
        <View style={styles.swatchRow}>
          {product.colors.slice(0, 3).map((c, i) => (
            <View key={i} style={[styles.swatch, { backgroundColor: c.hex }]} />
          ))}
          {product.colors.length > 3 && <Text style={styles.swatchMore}>+{product.colors.length - 3}</Text>}
        </View>
      )}
    </Pressable>
  );
}

function CollectionsPreview({ username }: { username: string }) {
  const q = useQuery({ queryKey: ["shop-collections", username], queryFn: () => shopApi.collections(username) });
  if (!q.data?.length) return null;
  return (
    <View style={styles.collectionsSection}>
      <View style={styles.collectionsHeader}>
        <Text style={styles.collectionsTitle}>Collections</Text>
        <Text style={styles.seeAll}>See all ›</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 16 }}>
        {q.data.map((c) => (
          <View key={c.id} style={styles.collectionCard}>
            {c.cover_image_url ? (
              <Image source={{ uri: c.cover_image_url }} style={styles.collectionImage} />
            ) : (
              <View style={[styles.collectionImage, styles.productImageFallback]} />
            )}
            <Text style={styles.collectionName} numberOfLines={1}>{c.name}</Text>
            <Text style={styles.collectionCount}>{c.products_count} products</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

function CollectionsGrid({ username }: { username: string }) {
  const q = useQuery({ queryKey: ["shop-collections", username], queryFn: () => shopApi.collections(username) });
  if (q.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={ds.accent} />;
  if (!q.data?.length) return <EmptyState text="No collections yet" />;
  return (
    <View style={[styles.gridContent, styles.gridRow]}>
      {q.data.map((c) => (
        <View key={c.id} style={styles.collectionCard}>
          {c.cover_image_url ? (
            <Image source={{ uri: c.cover_image_url }} style={styles.collectionImage} />
          ) : (
            <View style={[styles.collectionImage, styles.productImageFallback]} />
          )}
          <Text style={styles.collectionName} numberOfLines={1}>{c.name}</Text>
          <Text style={styles.collectionCount}>{c.products_count} products</Text>
        </View>
      ))}
    </View>
  );
}

function ReviewsList({ username, shopName }: { username: string; shopName?: string }) {
  const q = useInfiniteQuery({
    queryKey: ["shop-reviews", username],
    queryFn: ({ pageParam }) => shopApi.reviews(username, pageParam as number),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.current_page < last.meta.last_page ? last.meta.current_page + 1 : undefined),
  });
  const reviews = (q.data?.pages ?? []).flatMap((p) => p.data);

  if (q.isLoading) return <ActivityIndicator style={{ marginTop: 40 }} color={ds.accent} />;
  if (!reviews.length) return <EmptyState text="No reviews yet" />;

  return (
    <View style={{ paddingHorizontal: 16 }}>
      {reviews.map((r) => (
        <View key={r.id} style={styles.reviewRow}>
          <Avatar uri={r.user.avatar} style={styles.reviewAvatar} />
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewName}>{r.user.name ?? r.user.username}</Text>
            <View style={styles.ratingRow}>
              {Array.from({ length: 5 }).map((_, i) => (
                <Star key={i} size={12} color="#F5A623" fill={i < r.rating ? "#F5A623" : "transparent"} />
              ))}
            </View>
            {!!r.comment && <Text style={styles.reviewComment}>{r.comment}</Text>}
            {!!r.seller_reply && (
              <View style={styles.sellerReplyBox}>
                <Text style={styles.sellerReplyLabel}>Reply from {shopName ?? "the seller"}</Text>
                <Text style={styles.sellerReplyText}>{r.seller_reply}</Text>
              </View>
            )}
          </View>
        </View>
      ))}
    </View>
  );
}

function EmptyState({ text, illustration, onAddPress }: { text: string; illustration?: boolean; onAddPress?: () => void }) {
  return (
    <View style={styles.empty}>
      {illustration && (
        <LottieView
          source={NO_PRODUCTS_ANIMATION}
          autoPlay
          loop
          resizeMode="contain"
          style={styles.emptyArt}
        />
      )}
      <Text style={styles.emptyText}>{text}</Text>
      {!!onAddPress && (
        <Pressable accessibilityRole="button" style={styles.emptyAddBtn} onPress={onAddPress}>
          <Text style={styles.followBtnText}>Add Products</Text>
        </Pressable>
      )}
    </View>
  );
}

/* ── styles ───────────────────────────────────────────────────────────── */

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 12, paddingVertical: 8 },
  headerRight: { flexDirection: "row", gap: 8 },
  headerBtn: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center", backgroundColor: ds.surfaceMuted },

  identity: { flexDirection: "row", paddingHorizontal: 16, paddingTop: 8, gap: 14 },
  avatarCol: { alignItems: "center" },
  avatar: { width: 76, height: 76, borderRadius: 38, backgroundColor: ds.accentWash },
  liveBadge: { marginTop: -10, backgroundColor: ds.accent, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2 },
  liveBadgeText: { color: ds.onDark, fontSize: 10, fontWeight: "700" },

  identityMain: { flex: 1, justifyContent: "center" },
  nameRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  shopName: { fontSize: 19, fontWeight: "800", color: ds.text, flexShrink: 1 },
  categoryBadge: { alignSelf: "flex-start", backgroundColor: ds.surfaceMuted, borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 4 },
  categoryBadgeText: { fontSize: 11, fontWeight: "700", color: ds.textDim },
  handle: { fontSize: 13, color: ds.textMuted, marginTop: 2 },
  tagline: { fontSize: 13, color: ds.textDim, marginTop: 3 },
  ratingRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  ratingText: { fontSize: 12.5, color: ds.textDim, fontWeight: "600" },
  ratingDot: { color: ds.textFaint },

  actionsRow: { flexDirection: "row", gap: 8, paddingHorizontal: 16, marginTop: 14 },
  followBtn: { flex: 1, backgroundColor: ds.accent, borderRadius: radius.pill, height: 40, alignItems: "center", justifyContent: "center" },
  followBtnText: { color: ds.onDark, fontWeight: "700", fontSize: 14.5 },
  messageBtn: { flex: 1, borderWidth: 1, borderColor: ds.line, borderRadius: radius.pill, height: 40, alignItems: "center", justifyContent: "center" },
  messageBtnText: { color: ds.text, fontWeight: "700", fontSize: 14.5 },
  moreBtn: { width: 40, height: 40, borderRadius: radius.pill, borderWidth: 1, borderColor: ds.line, alignItems: "center", justifyContent: "center" },

  trustStrip: { flexDirection: "row", marginHorizontal: 16, marginTop: 16, backgroundColor: ds.accentWash, borderRadius: radius.lg, borderWidth: 1, borderColor: "#f7d9e2", paddingVertical: 12 },
  trustItem: { flex: 1, alignItems: "center", gap: 3, paddingHorizontal: 4 },
  trustTitle: { fontSize: 11.5, fontWeight: "700", color: ds.text, textAlign: "center" },
  trustDesc: { fontSize: 9.5, color: ds.textMuted, textAlign: "center" },

  tabsRow: { flexDirection: "row", marginTop: 20, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: ds.line },
  tabBtn: { marginRight: 22, paddingBottom: 10 },
  tabLabel: { fontSize: 14, color: ds.textMuted, fontWeight: "600" },
  tabLabelActive: { color: ds.text, fontWeight: "800" },
  tabUnderline: { position: "absolute", bottom: -1, left: 0, right: 0, height: 2, backgroundColor: ds.accent, borderRadius: 1 },

  searchBox: {
    flexDirection: "row", alignItems: "center", gap: 8,
    marginHorizontal: 16, marginTop: 14,
    backgroundColor: ds.surfaceMuted, borderRadius: radius.md, paddingHorizontal: 12, height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: ds.text, padding: 0 },

  categoryRow: { paddingHorizontal: 16, paddingTop: 14, gap: 8 },
  categoryPill: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: ds.surfaceMuted, marginRight: 8 },
  categoryPillActive: { backgroundColor: ds.accent },
  categoryPillText: { fontSize: 13, fontWeight: "600", color: ds.textDim },
  categoryPillTextActive: { color: ds.onDark },

  filterRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8, flexWrap: "wrap" },
  sortPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: ds.accentWash, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  sortPillText: { color: ds.accent, fontWeight: "700", fontSize: 12.5 },
  filterChip: { paddingHorizontal: 10, paddingVertical: 6 },
  filterChipText: { color: ds.textDim, fontSize: 12.5, fontWeight: "600" },

  gridContent: { paddingHorizontal: 16 },
  gridRow: { justifyContent: "space-between" },

  productCard: { width: "48%", marginBottom: 18 },
  productCardWide: { width: "100%" },
  productImageWrap: { aspectRatio: 1, borderRadius: radius.lg, overflow: "hidden", backgroundColor: ds.surfaceSunken },
  productImage: { width: "100%", height: "100%" },
  productImageFallback: { backgroundColor: ds.surfaceSunken },
  badgeRibbon: { position: "absolute", top: 8, left: 8, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  badgeBestseller: { backgroundColor: ds.accent },
  badgeNew: { backgroundColor: "#16a34a" },
  badgeRibbonText: { color: ds.onDark, fontSize: 10, fontWeight: "700" },
  heartBtn: { position: "absolute", top: 8, right: 8, width: 26, height: 26, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center" },
  cartBtn: { position: "absolute", bottom: 8, right: 8, width: 30, height: 30, borderRadius: 15, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  productName: { fontSize: 13, color: ds.text, fontWeight: "600", marginTop: 8 },
  productPrice: { fontSize: 14, color: ds.accent, fontWeight: "800", marginTop: 2 },
  productMeta: { fontSize: 11.5, color: ds.textMuted },
  swatchRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 },
  swatch: { width: 14, height: 14, borderRadius: 7, borderWidth: 1, borderColor: ds.line },
  swatchMore: { fontSize: 11, color: ds.textMuted },

  collectionsSection: { marginTop: 8, paddingTop: 16 },
  collectionsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 12 },
  collectionsTitle: { fontSize: 17, fontWeight: "800", color: ds.text },
  seeAll: { fontSize: 13, color: ds.accent, fontWeight: "700" },
  collectionCard: { width: 130, marginLeft: 16 },
  collectionImage: { width: 130, height: 100, borderRadius: radius.md, backgroundColor: ds.surfaceSunken },
  collectionName: { fontSize: 13, fontWeight: "700", color: ds.text, marginTop: 6 },
  collectionCount: { fontSize: 11.5, color: ds.textMuted, marginTop: 1 },

  reviewRow: { flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: ds.lineSoft },
  reviewAvatar: { width: 36, height: 36, borderRadius: 18 },
  reviewName: { fontSize: 13.5, fontWeight: "700", color: ds.text },
  reviewComment: { fontSize: 13, color: ds.textDim, marginTop: 4 },
  sellerReplyBox: { marginTop: 8, marginLeft: 8, padding: 10, borderRadius: radius.md, backgroundColor: ds.accentWash, borderLeftWidth: 2, borderLeftColor: ds.accent },
  sellerReplyLabel: { fontSize: 11.5, fontWeight: "700", color: ds.accent, marginBottom: 2 },
  sellerReplyText: { fontSize: 12.5, color: ds.textDim },

  empty: { paddingVertical: 60, alignItems: "center" },
  // 400x300 source - width matches the old SvgUri's 260, aspectRatio keeps
  // its native 4:3 shape instead of the old fixed 260x260 square box.
  emptyArt: { width: 260, aspectRatio: 4 / 3, marginBottom: 12 },
  emptyText: { color: ds.textMuted, fontSize: 13.5 },
  emptyAddBtn: { marginTop: 16, backgroundColor: ds.accent, borderRadius: radius.pill, height: 40, paddingHorizontal: 28, alignItems: "center", justifyContent: "center" },

  unavailable: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 8 },
  unavailableAvatar: { width: 64, height: 64, borderRadius: 32, marginBottom: 4 },
  unavailableTitle: { fontSize: 17, fontWeight: "800", color: ds.text, textAlign: "center" },
  unavailableText: { fontSize: 13.5, color: ds.textMuted, textAlign: "center" },
  unavailableSub: { fontSize: 12.5, color: ds.textFaint, textAlign: "center" },

  sheetContent: { paddingHorizontal: 16, paddingBottom: 4 },
  sheetTitle: { fontSize: 16, fontWeight: "800", color: ds.text, marginBottom: 14 },

  policySection: { marginBottom: 20 },
  policySectionHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
  policySectionTitle: { fontSize: 13.5, fontWeight: "800", color: ds.text },
  policyRow: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: ds.lineSoft },
  policyRowLabel: { fontSize: 12.5, color: ds.textMuted, flexShrink: 0 },
  policyRowValue: { fontSize: 12.5, color: ds.text, fontWeight: "600", flex: 1, textAlign: "right" },
  policyFallback: { fontSize: 12.5, color: ds.textFaint, fontStyle: "italic", paddingVertical: 4 },
  policyFreeText: { fontSize: 12.5, color: ds.textDim, lineHeight: 18, marginTop: 4 },
});
