import { useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Platform, Pressable,
  ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Search, X } from "lucide-react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatedGift } from "@/components/AnimatedGift";
import { walletApi, type CoinPackage } from "@/api/wallet.api";
import { fetchCoinProducts, purchaseCoins, iapAvailable, iapUnavailableReason } from "@/api/iap";
import { PRICE_BANDS, bandFor, coinsPerDollar } from "@/constants/coin-plans";
import { colors } from "@/constants/colors";
import { font, radius, spacing } from "@/constants/theme";

/**
 * Buy Teezer Coins - all 200 plans, banded by price, with a review-then-pay step.
 *
 * It is a plain View, NOT a sheet - callers drop it into a BottomSheet they own.
 * That matters: only one modal can be presented at a time, so a picker that
 * wrapped itself in its own <Modal> could never open from inside another sheet,
 * which is exactly how the gift sheet in comments uses it.
 */

const WEB_ORIGIN = "https://teezer.live";

const fmtRC = (n: number) => n.toLocaleString("en-US");
const fmtUSD = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** coin_packages.icon holds a gift slug; the artwork is served by the web app. */
const packIcon = (pkg: CoinPackage) =>
  // An admin upload wins over the artwork shipped with the web app; without this,
  // changing an icon in the admin panel would appear to do nothing.
  pkg.icon_url
    ? pkg.icon_url
    : `${WEB_ORIGIN}/gifts/${String(pkg.sort_order).padStart(3, "0")}-${pkg.icon}.svg`;

const IS_IOS = Platform.OS === "ios";

/** StoreKit caps a single consumable transaction at 10. */
const MAX_QTY = 10;

/**
 * Buying coins - in the app, always.
 *
 * Coins are digital content, so the store's own billing is the ONLY way to sell
 * them: StoreKit on iOS (Apple Review Guideline 3.1.1), Play Billing on Android.
 * Sending a user out to a web checkout for them is a rejection on iOS and a
 * policy breach on Android, so there is no web hand-off left in this flow - a
 * pack with no store product configured is shown as unavailable rather than
 * linked out.
 *
 * fetchCoinProducts()/purchaseCoins() already key their products by platform, so
 * the same code path serves both stores.
 */
export function useCoinPurchase() {
  const qc = useQueryClient();
  const [buying, setBuying] = useState<number | null>(null);

  const iapQ = useQuery({
    queryKey: ["coin-iap-products"],
    queryFn: fetchCoinProducts,
    staleTime: 5 * 60_000,
  });

  const iapOn = Boolean(iapQ.data?.enabled) && iapAvailable();
  const productFor = (packageId: number) =>
    iapQ.data?.products.find((p) => p.package_id === packageId)?.product_id ?? null;

  const buy = async (pkg: { id: number; plan_name: string }, quantity = 1) => {
    if (!iapAvailable()) {
      // Expo Go has no native billing module - say so instead of failing mysteriously.
      Alert.alert("Not available here", iapUnavailableReason);
      return false;
    }

    if (!iapQ.data?.enabled) {
      Alert.alert("Coming soon", "In-app coin purchases aren't switched on yet.");
      return false;
    }

    const productId = productFor(pkg.id);
    if (!productId) {
      Alert.alert(
        "Not available in the app",
        `${pkg.plan_name} isn't offered for purchase in the app yet. Please pick another pack.`,
      );
      return false;
    }

    setBuying(pkg.id);
    // This is what opens the store's payment sheet (Face ID / Touch ID / Apple ID,
    // or Google Play).
    const res = await purchaseCoins(productId, quantity);
    setBuying(null);

    if (res.ok) {
      // The balance changed on the server - pull it, don't guess it.
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["wallet-transactions"] });
      qc.invalidateQueries({ queryKey: ["coin-wallet"] });
      Alert.alert("Coins added", `${res.coinsAdded.toLocaleString()} RC are now in your wallet.`);
      return true;
    }

    if (!res.cancelled) Alert.alert("Purchase failed", res.message);
    return false;
  };

  return { buy, buying, iapOn, productFor };
}

export function CoinPlansPanel({ onClose }: { onClose: () => void }) {
  // BottomSheet only pads for the home indicator on its scrollable branch, and
  // this sheet opts out of that - so the buy button would sit under it.
  const insets = useSafeAreaInsets();
  const [band, setBand] = useState("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CoinPackage | null>(null);
  const [qty, setQty] = useState(1);
  const { buy, buying, iapOn, productFor } = useCoinPurchase();
  const q = useQuery({ queryKey: ["wallet-packages-all"], queryFn: () => walletApi.packages(true) });

  // Same rules as the web picker: banded by price, listed in catalog order 1 → 200.
  const packs = useMemo(() => {
    const b = bandFor(band);
    const term = search.trim().toLowerCase();
    return (q.data ?? [])
      .filter((p) => p.price_usd >= b.minUsd && p.price_usd <= b.maxUsd)
      .filter((p) => {
        if (!term) return true;
        // Name, coins, price and catalog number - people search by any of them.
        return p.plan_name.toLowerCase().includes(term)
          || String(p.coins).includes(term)
          || String(p.price_usd).includes(term)
          || String(p.sort_order) === term;
      })
      .sort((a, b2) => a.sort_order - b2.sort_order);
  }, [q.data, band, search]);

  return (
    <View style={[s.sheet, { paddingBottom: spacing.lg + insets.bottom }]}>
      <View style={s.sheetHead}>
        <View style={{ flex: 1 }}>
          <Text style={s.sheetTitle}>Buy Teezer Coins</Text>
          <Text style={s.sheetSub}>
            {q.isLoading
              ? "Loading…"
              : `${packs.length} of 200 plans • bigger plans earn a better rate`}
          </Text>
        </View>
        <Pressable style={s.sheetClose} onPress={onClose} hitSlop={8}>
          <X size={18} color={colors.textSecondary} />
        </Pressable>
      </View>

      {/* Search */}
      <View style={s.searchWrap}>
        <Search size={16} color={colors.textFaint} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by name, RC, price or number…"
          placeholderTextColor={colors.textFaint}
          style={s.searchInput}
          autoCorrect={false}
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")} hitSlop={8}>
            <X size={15} color={colors.textFaint} />
          </Pressable>
        )}
      </View>

      {/* flexGrow:0 - without it this ScrollView is a growable child of the sheet's
          flex column and stretches, opening a gap between the chips and the grid. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={s.bandScroll}
        contentContainerStyle={s.bandRow}
      >
        {PRICE_BANDS.map((b) => (
          <Pressable
            key={b.key}
            onPress={() => setBand(b.key)}
            style={[s.bandChip, band === b.key && s.bandChipOn]}
          >
            <Text style={[s.bandTxt, band === b.key && s.bandTxtOn]}>{b.short}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {q.isLoading ? (
        <View style={{ flex: 1, justifyContent: "center" }}><ActivityIndicator color={colors.brand} /></View>
      ) : packs.length === 0 ? (
        <View style={s.empty}>
          <View style={s.emptyIcon}><Search size={24} color={colors.textFaint} /></View>
          <Text style={s.emptyTitle}>No plans match</Text>
          <Text style={s.emptySub}>Try another name, price or number</Text>
          <Pressable style={s.resetBtn} onPress={() => { setSearch(""); setBand("all"); }}>
            <Text style={s.resetTxt}>Clear filters</Text>
          </Pressable>
        </View>
      ) : (
        // FlatList over 200 animated tiles: windowed, so only what's on screen is
        // mounted and only those icons are animating.
        <FlatList
          data={packs}
          keyExtractor={(p) => String(p.id)}
          numColumns={PLAN_COLS}
          // Fills whatever the header and the review card leave behind.
          style={{ flex: 1 }}
          columnWrapperStyle={s.planRow}
          contentContainerStyle={s.planList}
          showsVerticalScrollIndicator={false}
          initialNumToRender={12}
          maxToRenderPerBatch={12}
          windowSize={5}
          removeClippedSubviews
          keyboardShouldPersistTaps="handled"
          renderItem={({ item: p, index }) => {
            // On iOS a pack with no App Store product cannot be sold - and must not
            // be linked out to the web either, so it is shown as unavailable.
            const unavailable = iapOn && !productFor(p.id);
            const isSel = selected?.id === p.id;

            return (
              <Pressable
                style={({ pressed }) => [
                  s.plan,
                  pressed && { opacity: 0.85 },
                  unavailable && s.planOff,
                  isSel && s.planSel,
                ]}
                // Tapping picks the pack; nothing is charged until it is confirmed below.
                onPress={() => { setSelected(p); setQty(1); }}
                disabled={buying !== null}
              >
                {isSel && (
                  <View style={s.planTick}>
                    <Ionicons name="checkmark" size={10} color="#fff" />
                  </View>
                )}

                <Text style={s.planNo}>{String(p.sort_order).padStart(2, "0")}</Text>

                <AnimatedGift
                  uri={packIcon(p)}
                  slug={p.icon}
                  size={44}
                  delay={(index % PLAN_COLS) * 160}
                />

                <Text style={s.planName} numberOfLines={1}>{p.plan_name}</Text>
                {/* Base coins, as everywhere else - the bonus is an extra and
                    is stated as one rather than folded into this number. */}
                <Text style={s.planCoins}>{fmtRC(p.coins)} RC</Text>

                {/* The bonus was missing entirely from this panel, which is the
                    one the gift sheet and the top-up screen both use - so a
                    running promotion was invisible in the two places people
                    actually buy coins. */}
                {p.bonus?.has_bonus && (
                  <View style={s.planBonusPill}>
                    <Text style={s.planBonusText}>+{fmtRC(p.bonus.bonus_coins)}</Text>
                  </View>
                )}

                <Text style={s.planPrice}>{fmtUSD(p.price_usd)}</Text>
                <Text style={s.planRate}>
                  {unavailable ? "Not in app" : `${coinsPerDollar(p.coins, p.price_usd)} RC / $1`}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* Review before paying: what you picked, what it costs, how many - then the
          button that actually opens the store's payment sheet. Nothing is charged
          before this. */}
      {selected ? (() => {
        // On iOS, only packs with an App Store product can be sold. Say so on the
        // button rather than letting the tap fail.
        const sellable = !iapOn || Boolean(productFor(selected.id));
        return (
        <View style={s.review}>
          <View style={s.reviewTop}>
            <AnimatedGift uri={packIcon(selected)} slug={selected.icon} size={46} />

            <View style={{ flex: 1 }}>
              <Text style={s.reviewName} numberOfLines={1}>{selected.plan_name}</Text>
              <Text style={s.reviewCoins}>
                {fmtRC(selected.coins)} RC · {fmtUSD(selected.price_usd)} each
              </Text>
              {selected.bonus?.has_bonus && (
                <Text style={s.reviewBonus}>
                  {selected.bonus.bonus_text ?? `+${fmtRC(selected.bonus.bonus_coins)} bonus coins`}
                </Text>
              )}
            </View>

            <Pressable onPress={() => setSelected(null)} hitSlop={8} style={s.reviewClear}>
              <X size={15} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Quantity. iOS only: StoreKit can buy N of a consumable in one
              transaction, Play Billing cannot. The RECEIPT carries the count and the
              server multiplies the coins by it - the client never says how many to
              credit. */}
          {IS_IOS && (
            <View style={s.qtyRow}>
              <Text style={s.qtyLabel}>Quantity</Text>
              <View style={s.qtyBox}>
                <Pressable
                  style={[s.qtyBtn, qty <= 1 && s.qtyBtnOff]}
                  disabled={qty <= 1}
                  onPress={() => setQty((n) => Math.max(1, n - 1))}
                  hitSlop={6}
                >
                  <Ionicons name="remove" size={16} color={qty <= 1 ? colors.textFaint : colors.text} />
                </Pressable>

                <Text style={s.qtyVal}>{qty}</Text>

                <Pressable
                  style={[s.qtyBtn, qty >= MAX_QTY && s.qtyBtnOff]}
                  disabled={qty >= MAX_QTY}
                  onPress={() => setQty((n) => Math.min(MAX_QTY, n + 1))}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={16} color={qty >= MAX_QTY ? colors.textFaint : colors.text} />
                </Pressable>
              </View>
            </View>
          )}

          {/* "You get" must be what the WALLET receives, so it counts the
              bonus - it said 15 RC on a pack that credits 25, which is the one
              line on this panel that has to match reality exactly. The server
              derives total_coins and credits that same number, so this is a
              read of its answer rather than arithmetic of our own. */}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>You get</Text>
            <Text style={s.totalCoins}>
              {fmtRC((selected.bonus?.has_bonus ? selected.bonus.total_coins : selected.coins) * qty)} RC
            </Text>
          </View>
          {selected.bonus?.has_bonus && (
            <View style={s.totalRow}>
              <Text style={s.totalSub}>
                {fmtRC(selected.coins * qty)} base + {fmtRC(selected.bonus.bonus_coins * qty)} bonus
              </Text>
            </View>
          )}
          <View style={s.totalRow}>
            <Text style={s.totalLabel}>Total</Text>
            <Text style={s.totalPrice}>{fmtUSD(selected.price_usd * qty)}</Text>
          </View>

          <Pressable
            style={({ pressed }) => [
              s.buyBtn,
              pressed && { opacity: 0.9 },
              (buying !== null || sellable === false) && s.buyBtnOff,
            ]}
            disabled={buying !== null || sellable === false}
            onPress={async () => {
              const done = await buy(selected, qty);
              if (done) { setSelected(null); setQty(1); onClose(); }
            }}
          >
            {buying === selected.id ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <>
                {IS_IOS && sellable && <Ionicons name="logo-apple" size={16} color="#fff" />}
                <Text style={s.buyTxt}>
                  {sellable === false
                    ? "Not available in the app"
                    : qty > 1
                    ? `Purchase ${qty} packs · ${fmtUSD(selected.price_usd * qty)}`
                    : `Purchase · ${fmtUSD(selected.price_usd)}`}
                </Text>
              </>
            )}
          </Pressable>

          {sellable && (
            <Text style={s.buyNote}>
              {IS_IOS
                ? "Paid with your Apple ID. Coins are added instantly."
                : "Paid through Google Play. Coins are added instantly."}
            </Text>
          )}
        </View>
        );
      })() : (
        // No web hand-off, on either platform: coins are digital content and must be
        // sold through the store's own billing.
        <Text style={s.sheetNote}>
          {iapOn ? "Pick a pack to buy coins." : "In-app coin purchases aren't switched on yet."}
        </Text>
      )}
    </View>
  );
}

/** 3 plan tiles per row, with even gaps that survive the sheet's padding. */
const PLAN_COLS = 3;
const PLAN_W =
  (Dimensions.get("window").width - spacing.lg * 2 - spacing.sm * (PLAN_COLS - 1)) / PLAN_COLS;

const s = StyleSheet.create({
  sheet: { flex: 1, paddingBottom: spacing.lg },
  sheetHead: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: font.lg, fontWeight: "900", color: colors.text },
  sheetSub: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
  sheetClose: {
    width: 32, height: 32, borderRadius: 16, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center",
  },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.bgMuted,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: font.sm, color: colors.text, padding: 0 },

  bandScroll: { flexGrow: 0 },
  bandRow: {
    gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    paddingBottom: spacing.sm, alignItems: "center",
  },
  bandChip: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingHorizontal: 11, height: 30, justifyContent: "center",
    backgroundColor: colors.card,
  },
  bandChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  bandTxt: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  bandTxtOn: { color: "#fff" },

  /* 3 plans per row, evenly gapped - the grid the design asks for. */
  planList: { paddingHorizontal: spacing.lg, paddingTop: 2, paddingBottom: spacing.md, gap: spacing.sm },
  planRow: { gap: spacing.sm },
  plan: {
    width: PLAN_W,
    alignItems: "center",
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.md, paddingHorizontal: spacing.xs,
  },
  planOff: { opacity: 0.55 },
  planSel: { borderColor: colors.brand, borderWidth: 1.5, backgroundColor: colors.brandTint },
  planTick: {
    position: "absolute", top: 4, right: 4, zIndex: 2,
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  planNo: { alignSelf: "flex-start", fontSize: 9, fontWeight: "900", color: "#c2c7d0", marginBottom: 2 },
  planName: { fontSize: font.xs, fontWeight: "800", color: colors.text, marginTop: 4 },
  planCoins: { fontSize: 10, fontWeight: "800", color: colors.brand, marginTop: 1 },
  planPrice: { fontSize: font.sm, fontWeight: "900", color: colors.text, marginTop: 2 },
  planRate: { fontSize: 9, color: colors.textFaint, marginTop: 1 },
  /* Green so a running promotion reads as a gain, not as more grey metadata. */
  planBonusPill: {
    marginTop: 3, backgroundColor: "#DCFCE7", borderRadius: 999,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  planBonusText: { fontSize: 9, fontWeight: "900", color: "#15803D" },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: 4 },
  emptyIcon: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: font.md, fontWeight: "800", color: colors.textSecondary },
  emptySub: { fontSize: font.xs, color: colors.textFaint },
  resetBtn: {
    marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  resetTxt: { fontSize: font.sm, fontWeight: "800", color: colors.textSecondary },

  sheetNote: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.md,
    fontSize: font.xs, color: colors.textFaint, textAlign: "center",
  },

  /* review + pay */
  review: {
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingTop: spacing.md, gap: spacing.sm,
  },
  reviewTop: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  reviewName: { fontSize: font.md, fontWeight: "900", color: colors.text },
  reviewCoins: { fontSize: font.xs, color: colors.textMuted, marginTop: 1 },
  reviewBonus: { fontSize: font.xs, fontWeight: "800", color: "#15803D", marginTop: 2 },
  reviewClear: {
    width: 28, height: 28, borderRadius: 14, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center",
  },

  qtyRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  qtyLabel: { fontSize: font.sm, fontWeight: "700", color: colors.textSecondary },
  qtyBox: {
    flexDirection: "row", alignItems: "center",
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
    overflow: "hidden",
  },
  qtyBtn: { width: 36, height: 32, alignItems: "center", justifyContent: "center", backgroundColor: colors.bgMuted },
  qtyBtnOff: { opacity: 0.5 },
  qtyVal: { minWidth: 36, textAlign: "center", fontSize: font.sm, fontWeight: "900", color: colors.text },

  totalRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  totalLabel: { fontSize: font.sm, color: colors.textMuted },
  totalSub: { fontSize: font.xs, color: "#15803D", fontWeight: "700" },
  totalCoins: { fontSize: font.sm, fontWeight: "900", color: colors.brand },
  totalPrice: { fontSize: font.lg, fontWeight: "900", color: colors.text },

  buyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
    backgroundColor: "#000", borderRadius: radius.md,
    paddingVertical: spacing.md, marginTop: spacing.xs,
  },
  buyBtnOff: { opacity: 0.6 },
  buyTxt: { fontSize: font.md, fontWeight: "900", color: "#fff" },
  buyNote: { fontSize: font.xs, color: colors.textFaint, textAlign: "center" },
});
