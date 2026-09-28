import { useMemo, useState } from "react";
import {
  ActivityIndicator, Alert, Dimensions, FlatList, Linking, Platform, Pressable,
  RefreshControl, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import {
  Wallet, Gift, Clock, ShieldCheck, Zap, Coins, ChevronRight, Search, X,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/Skeleton";
import { BottomSheet } from "@/components/BottomSheet";
import { AnimatedGift } from "@/components/AnimatedGift";
import { walletApi, type CoinPackage, type WalletTransaction } from "@/api/wallet.api";
import { fetchCoinProducts, purchaseCoins, iapAvailable, iapUnavailableReason } from "@/api/iap";
// One definition of how a transaction is labelled/coloured/formatted, shared with the
// full history screen - two copies would drift.
import { txMeta, fmtRC, fmtUSD, fmtTxDate as fmtDate } from "./wallet-tx";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { PRICE_BANDS, bandFor, coinsPerDollar } from "@/constants/coin-plans";

/**
 * Studio → Wallets & Coins.
 *
 * Mirrors the web studio page and reads the same three endpoints, so a balance shown
 * here and on the web can never disagree. Buying is deliberately NOT done in-app: the
 * checkout (card / PayPal / UPI / bank) lives on the web, and shipping a coin purchase
 * through an app build would put us in front of Apple's IAP rules. "Buy Coins" hands
 * off to the web studio instead.
 */

const WEB_ORIGIN = "https://teezer.live";
const WEB_COINS_URL = `${WEB_ORIGIN}/studio/wallets-coins`;

/** coin_packages.icon holds a gift slug; the artwork is served by the web app. */
const packIcon = (pkg: CoinPackage) =>
  // An admin upload wins over the artwork shipped with the web app; without this,
  // changing an icon in the admin panel would appear to do nothing.
  pkg.icon_url
    ? pkg.icon_url
    : `${WEB_ORIGIN}/gifts/${String(pkg.sort_order).padStart(3, "0")}-${pkg.icon}.svg`;

/** What the row shows on the right: coins if the movement was in coins, else dollars. */
function txAmount(t: WalletTransaction): { text: string; positive: boolean } {
  if (t.net_coins !== 0) {
    return { text: `${t.net_coins > 0 ? "+" : "-"} ${fmtRC(Math.abs(t.net_coins))} RC`, positive: t.net_coins > 0 };
  }
  if (t.amount_usd !== 0) {
    return { text: `${t.amount_usd > 0 ? "+" : "-"} ${fmtUSD(Math.abs(t.amount_usd))}`, positive: t.amount_usd > 0 };
  }
  return { text: "-", positive: false };
}

/* ══════════════════════════════════════════════════════════════════════════ */
const IS_IOS = Platform.OS === "ios";

/** StoreKit caps a single consumable transaction at 10. */
const MAX_QTY = 10;

/**
 * Buying coins - in the app, always.
 *
 * Coins are digital content, so the store's own billing is the ONLY way to sell them:
 * StoreKit on iOS (Apple Review Guideline 3.1.1), Play Billing on Android. Sending a
 * user out to a web checkout for them is a rejection on iOS and a policy breach on
 * Android, so there is no web hand-off left in this flow - a pack with no store product
 * configured is shown as unavailable rather than linked out.
 *
 * fetchCoinProducts()/purchaseCoins() already key their products by platform, so the
 * same code path serves both stores.
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
    iapQ.data?.products.find(p => p.package_id === packageId)?.product_id ?? null;

  const buy = async (pkg: { id: number; plan_name: string }, quantity = 1) => {
    if (!iapAvailable()) {
      // Expo Go has no native billing module - say so instead of failing mysteriously.
      Alert.alert("Not available here", iapUnavailableReason);
      return;
    }

    if (!iapQ.data?.enabled) {
      Alert.alert("Coming soon", "In-app coin purchases aren't switched on yet.");
      return;
    }

    const productId = productFor(pkg.id);
    if (!productId) {
      Alert.alert(
        "Not available in the app",
        `${pkg.plan_name} isn't offered for purchase in the app yet. Please pick another pack.`,
      );
      return;
    }

    setBuying(pkg.id);
    // This is what opens the store's payment sheet (Face ID / Touch ID / Apple ID, or
    // Google Play).
    const res = await purchaseCoins(productId, quantity);
    setBuying(null);

    if (res.ok) {
      // The balance changed on the server - pull it, don't guess it.
      qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      qc.invalidateQueries({ queryKey: ["wallet-tx"] });
      qc.invalidateQueries({ queryKey: ["coin-wallet"] });
      Alert.alert("Coins added", `${res.coinsAdded.toLocaleString()} RC are now in your wallet.`);
      return true;
    }

    if (!res.cancelled) Alert.alert("Purchase failed", res.message);
    return false;
  };

  return { buy, buying, iapOn, productFor };
}

export function StudioWalletsSection() {
  const qc = useQueryClient();
  const nav = useNavigation<any>();
  const [showPlans, setShowPlans] = useState(false);

  /* `walletApi.dashboard` is gone - summary() returns the same
     { wallet, commission } shape from the same endpoint, and is what the rest
     of the app already reads, so this shares its cache rather than opening a
     second one. transactions() is now positional and resolves to
     { items, hasMore, page }. */
  const dashQ = useQuery({ queryKey: ["wallet-summary"], queryFn: () => walletApi.summary() });
  const pkgsQ = useQuery({ queryKey: ["wallet-packages"], queryFn: () => walletApi.packages(false) });
  const txQ   = useQuery({ queryKey: ["wallet-tx"], queryFn: () => walletApi.transactions(1, 8) });

  const wallet     = dashQ.data?.wallet;
  const commission = dashQ.data?.commission;
  const packs      = pkgsQ.data ?? [];
  const txRows     = txQ.data?.items ?? [];

  const refreshing = dashQ.isRefetching || pkgsQ.isRefetching || txQ.isRefetching;
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["wallet-dash"] });
    qc.invalidateQueries({ queryKey: ["wallet-packages"] });
    qc.invalidateQueries({ queryKey: ["wallet-tx"] });
  };

  const priceRange = useMemo(() => {
    if (!packs.length) return null;
    const prices = packs.map(p => p.price_usd);
    return { lo: Math.min(...prices), hi: Math.max(...prices) };
  }, [packs]);

  const loading = dashQ.isLoading;

  return (
    <>
      <ScrollView
        style={s.root}
        contentContainerStyle={s.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.brand} />}
      >
        {/* ── Balances ─────────────────────────────────────────────────── */}
        <View style={s.grid}>
          <BalanceCard
            loading={loading}
            tint="#fff0f4"
            icon={<Wallet size={20} color={colors.brand} />}
            label="Wallet"
            labelBold="Balance"
            value={wallet ? fmtUSD(wallet.wallet_balance_usd) : "$0.00"}
            sub="Withdrawable"
            action={{ text: "Withdraw", color: colors.brand, onPress: () => Linking.openURL(WEB_COINS_URL) }}
            footLabel="Pending"
            footValue={wallet ? fmtUSD(wallet.pending_balance_usd) : "$0.00"}
            footColor={colors.brand}
          />
          <BalanceCard
            loading={loading}
            tint="#fffbeb"
            icon={<RCBadge size={22} />}
            label="RC"
            labelBold="Balance"
            value={wallet ? fmtRC(wallet.coin_balance) : "0"}
            valueSuffix={<RCBadge size={16} />}
            sub="Spendable coins"
            action={{ text: "Buy Coins", color: colors.brand, onPress: () => setShowPlans(true) }}
            footLabel="Total Purchased"
            footValue={`${wallet ? fmtRC(wallet.total_purchased_coins) : 0} RC`}
            footColor={colors.brand}
          />
          <BalanceCard
            loading={loading}
            tint="#f3e8ff"
            icon={<Gift size={20} color="#7c3aed" />}
            label="Bonus"
            labelBold="Coins"
            value={wallet ? fmtRC(wallet.bonus_coin_balance) : "0"}
            valueSuffix={<RCBadge size={16} />}
            sub="Promo coins"
            footLabel="Earned from gifts"
            footValue={`${wallet ? fmtRC(wallet.earned_coin_balance) : 0} RC`}
            footColor="#7c3aed"
          />
          <BalanceCard
            loading={loading}
            tint="#fff7ed"
            icon={<Clock size={20} color="#f97316" />}
            label="Pending"
            labelBold="Balance"
            value={wallet ? fmtUSD(wallet.pending_balance_usd) : "$0.00"}
            sub="Clears in ~7 days"
            footLabel="Min withdrawal"
            // A dash, not "$10.00". That literal was a stale copy of an old
            // setting, so this card told creators the floor was $10 while the
            // Withdraw screen enforced the real one.
            footValue={commission ? fmtUSD(commission.min_withdrawal_usd) : "--"}
            footColor="#f97316"
          />
        </View>

        {/* ── Buy Teezer Coins ────────────────────────────────────────── */}
        <View style={s.sectionHead}>
          <View style={{ flex: 1 }}>
            <Text style={s.h2}>Buy Teezer Coins</Text>
            <Text style={s.h2sub}>
              {priceRange
                ? `200 animated gifts • ${fmtUSD(priceRange.lo)} – ${fmtUSD(priceRange.hi)}`
                : "200 animated gifts"}
            </Text>
          </View>
          <View style={s.securePill}>
            <ShieldCheck size={13} color={colors.success} />
            <Text style={s.secureTxt}>Secure Payment</Text>
          </View>
        </View>

        {pkgsQ.isLoading ? (
          <View style={s.packRow}>
            {[0, 1, 2].map(i => <Skeleton key={i} width={132} height={168} radius={radius.lg} style={{ marginRight: spacing.sm }} />)}
          </View>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={s.packRow}
          >
            {packs.map(p => <PackCard key={p.id} pkg={p} onPress={() => setShowPlans(true)} />)}

            {/* The 5 front plans are a preview of 200 - make the rest reachable. */}
            <Pressable style={s.morePack} onPress={() => setShowPlans(true)}>
              <View style={s.moreIcon}><Coins size={22} color={colors.brand} /></View>
              <Text style={s.moreTitle}>See all</Text>
              <Text style={s.moreSub}>200 plans</Text>
              <ChevronRight size={16} color={colors.brand} />
            </Pressable>
          </ScrollView>
        )}

        {/* ── Why buy ──────────────────────────────────────────────────── */}
        <View style={s.featureRow}>
          <Feature tint="#eff6ff" color="#2563eb" Icon={Zap} title="Instant Delivery" sub="Coins added instantly" />
          <Feature tint="#ecfdf5" color={colors.success} Icon={ShieldCheck} title="Secure Payments" sub="Bank-level encryption" />
          <Feature tint="#fffbeb" color="#d97706" Icon={Coins} title="Best Value" sub="More coins = better rate" />
          <Feature tint="#f3e8ff" color="#7c3aed" Icon={Gift} title="Use Anywhere" sub="For gifts, boosts & more" />
        </View>

        {/* ── Transaction history ──────────────────────────────────────── */}
        <View style={s.txCard}>
          <View style={s.txHead}>
            <Text style={s.h2}>Transaction History</Text>
            {/* A screen, not a sheet: the ledger is long, paged and filtered, and a sheet
                fights the list for the same vertical drag. */}
            <Pressable onPress={() => nav.navigate("StudioTransactions")} hitSlop={8}>
              <Text style={s.viewAll}>View All</Text>
            </Pressable>
          </View>

          {txQ.isLoading ? (
            <View style={{ padding: spacing.lg, gap: spacing.md }}>
              {[0, 1, 2].map(i => <Skeleton key={i} width="100%" height={44} radius={radius.sm} />)}
            </View>
          ) : txRows.length === 0 ? (
            <View style={s.empty}>
              <View style={s.emptyIcon}><Coins size={26} color={colors.textFaint} /></View>
              <Text style={s.emptyTitle}>No transactions yet</Text>
              <Text style={s.emptySub}>Buy coins or receive a gift to get started</Text>
            </View>
          ) : (
            txRows.map((t, i) => <TxRow key={t.id} tx={t} last={i === txRows.length - 1} />)
          )}
        </View>
      </ScrollView>

      {/* ── All 200 plans ────────────────────────────────────────────────────
          scrollable={false} + dragArea="header": the content brings its own FlatList.
          Left on the defaults, the list sits inside the sheet's managed ScrollView, whose
          offset then never leaves 0 - so every downward swipe reads as "drag the sheet"
          and scrolling the plans dismissed the popup. */}
      <BottomSheet
        visible={showPlans}
        onClose={() => setShowPlans(false)}
        height={0.86}
        scrollable={false}
        dragArea="header"
        keyboardAvoid
      >
        <CoinPlansPanel onClose={() => setShowPlans(false)} />
      </BottomSheet>
    </>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   PIECES
══════════════════════════════════════════════════════════════════════════ */

/** The RC coin chip. Drawn, not an asset - it sits inline with text at any size. */
function RCBadge({ size = 18 }: { size?: number }) {
  return (
    <View style={[s.rc, { width: size, height: size, borderRadius: size / 2 }]}>
      <Text style={[s.rcTxt, { fontSize: size * 0.45 }]}>RC</Text>
    </View>
  );
}

function BalanceCard({
  loading, tint, icon, label, labelBold, value, valueSuffix, sub, action, footLabel, footValue, footColor,
}: {
  loading: boolean;
  tint: string;
  icon: React.ReactNode;
  label: string;
  labelBold: string;
  value: string;
  valueSuffix?: React.ReactNode;
  sub: string;
  action?: { text: string; color: string; onPress: () => void };
  footLabel: string;
  footValue: string;
  footColor: string;
}) {
  return (
    <View style={s.card}>
      <View style={s.cardBody}>
        <View style={[s.cardIcon, { backgroundColor: tint }]}>{icon}</View>

        <Text style={s.cardLabel}>
          <Text style={s.cardLabelBold}>{label}</Text> {labelBold}
        </Text>

        {loading ? (
          <Skeleton width={72} height={26} radius={radius.sm} style={{ marginTop: 4 }} />
        ) : (
          <View style={s.valueRow}>
            <Text style={s.value}>{value}</Text>
            {valueSuffix}
          </View>
        )}

        <Text style={s.cardSub}>{sub}</Text>

        {action && (
          <Pressable
            style={({ pressed }) => [s.cardBtn, { borderColor: action.color }, pressed && { opacity: 0.7 }]}
            onPress={action.onPress}
          >
            <Text style={[s.cardBtnTxt, { color: action.color }]}>{action.text}</Text>
          </Pressable>
        )}
      </View>

      <View style={s.cardFoot}>
        <Text style={s.footLabel}>{footLabel}</Text>
        <Text style={[s.footValue, { color: footColor }]}>{footValue}</Text>
      </View>
    </View>
  );
}

function PackCard({ pkg, onPress }: { pkg: CoinPackage; onPress: () => void }) {
  const rate = coinsPerDollar(pkg.coins, pkg.price_usd);

  return (
    <Pressable style={({ pressed }) => [s.pack, pressed && { opacity: 0.85 }]} onPress={onPress}>
      {pkg.badge && (
        <View style={s.packBadge}>
          <Text style={s.packBadgeTxt}>{pkg.badge.toUpperCase()}</Text>
        </View>
      )}

      <AnimatedGift uri={packIcon(pkg)} slug={pkg.icon} size={56} style={s.packImg} />

      {/* The headline is the coins the pack SELLS, never the bonus-inflated
          total. Leading with the total was also inconsistent with the rate
          line below, which divides the BASE coins by the price - a pack read
          "25 RC" and "79 RC per $1" when 25 for $0.19 is really 131. A bonus
          is an extra, and is stated as one. */}
      <Text style={s.packCoins}>{fmtRC(pkg.coins)}</Text>
      <Text style={s.packRc}>RC</Text>
      {pkg.bonus?.has_bonus && (
        <>
          {/* Amount first - a promo tag like "New Now" cannot stand in for it. */}
          <View style={s.packBonusPill}>
            <Text style={s.packBonusText}>
              {pkg.bonus.bonus_text ?? `+${fmtRC(pkg.bonus.bonus_coins)} bonus coins`}
            </Text>
          </View>
          {!!pkg.bonus.bonus_label && (
            <Text style={s.packBonusTag}>{pkg.bonus.bonus_label}</Text>
          )}
          {/* What actually lands in the wallet, once and plainly. */}
          <Text style={s.packTotal}>You get {fmtRC(pkg.bonus.total_coins)} RC</Text>
        </>
      )}
      <Text style={s.packPrice}>{fmtUSD(pkg.price_usd)}</Text>
      {/* Computed from the same number the headline shows, so the two cannot
          contradict each other. The bonus rate is its own claim beside it. */}
      <Text style={s.packRate}>{rate} RC per $1</Text>
      {pkg.bonus?.has_bonus && pkg.price_usd > 0 && (
        <Text style={s.packRateBonus}>
          {Math.round(pkg.bonus.total_coins / pkg.price_usd)} with bonus
        </Text>
      )}
    </Pressable>
  );
}

function Feature({ tint, color, Icon, title, sub }: {
  tint: string; color: string; Icon: typeof Zap; title: string; sub: string;
}) {
  return (
    <View style={s.feature}>
      <View style={[s.featureIcon, { backgroundColor: tint }]}>
        <Icon size={15} color={color} />
      </View>
      <Text style={s.featureTitle}>{title}</Text>
      <Text style={s.featureSub}>{sub}</Text>
    </View>
  );
}

function TxRow({ tx, last }: { tx: WalletTransaction; last?: boolean }) {
  const m = txMeta(tx.type);
  const amt = txAmount(tx);

  return (
    <View style={[s.txRow, last && { borderBottomWidth: 0 }]}>
      <View style={[s.txIcon, { backgroundColor: m.bg }]}>
        <Ionicons name={m.ion} size={16} color={m.color} />
      </View>

      <View style={{ flex: 1 }}>
        <Text style={s.txDesc} numberOfLines={1}>{tx.description}</Text>
        <Text style={s.txDate}>{fmtDate(tx.created_at)}</Text>
      </View>

      <View style={{ alignItems: "flex-end", gap: 4 }}>
        <Text style={[s.txAmt, { color: amt.positive ? colors.success : colors.brand }]}>{amt.text}</Text>
        <View style={[s.txStatus, tx.status !== "completed" && { backgroundColor: "#fef3c7" }]}>
          <Text style={[s.txStatusTxt, tx.status !== "completed" && { color: "#d97706" }]}>
            {tx.status ?? "completed"}
          </Text>
        </View>
      </View>
    </View>
  );
}

/* ── All 200 plans ────────────────────────────────────────────────────────
   Exported because the gift sheet needs the SAME picker and the same store
   billing path. A second copy would drift on price, on the IAP rules, or on
   both, and the one in the feed would be the copy nobody remembered to update.

   It is a plain View, NOT a sheet - callers drop it into a BottomSheet they own.
   That matters: only one modal can be presented at a time, so a picker that
   wrapped itself in its own <Modal> could never open from inside another sheet. ── */
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
      .filter(p => p.price_usd >= b.minUsd && p.price_usd <= b.maxUsd)
      .filter(p => {
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
        {PRICE_BANDS.map(b => (
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
        // FlatList over 200 animated tiles: windowed, so only what's on screen is mounted
        // and only those icons are animating.
        <FlatList
          data={packs}
          keyExtractor={p => String(p.id)}
          numColumns={PLAN_COLS}
          // Fills whatever the header and the review card leave behind. A fixed
          // cap here (it used to be 48% of the screen) left dead space under the
          // grid whenever the sheet was taller than header + cap, and squeezed
          // the grid on short screens.
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
            // On iOS a pack with no App Store product cannot be sold - and must not be
            // linked out to the web either, so it is shown as unavailable instead.
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
                // Tapping picks the gift; nothing is charged until it is confirmed below.
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
                <Text style={s.planCoins}>{fmtRC(p.coins)} RC</Text>
                <Text style={s.planPrice}>{fmtUSD(p.price_usd)}</Text>
                <Text style={s.planRate}>
                  {unavailable ? "Not in app" : `${coinsPerDollar(p.coins, p.price_usd)} RC / $1`}
                </Text>
              </Pressable>
            );
          }}
        />
      )}

      {/* Review before paying: what you picked, what it costs, how many - then the button
          that actually opens Apple's payment sheet. Nothing is charged before this. */}
      {selected ? (() => {
        // On iOS, only packs with an App Store product can be sold. Say so on the button
        // rather than letting the tap fail.
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
            </View>

            <Pressable onPress={() => setSelected(null)} hitSlop={8} style={s.reviewClear}>
              <X size={15} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Quantity. iOS only: StoreKit can buy N of a consumable in one transaction,
              Play Billing cannot. The RECEIPT carries the count and the server multiplies
              the coins by it - the client never says how many to credit. */}
          {IS_IOS && (
            <View style={s.qtyRow}>
              <Text style={s.qtyLabel}>Quantity</Text>
              <View style={s.qtyBox}>
                <Pressable
                  style={[s.qtyBtn, qty <= 1 && s.qtyBtnOff]}
                  disabled={qty <= 1}
                  onPress={() => setQty(n => Math.max(1, n - 1))}
                  hitSlop={6}
                >
                  <Ionicons name="remove" size={16} color={qty <= 1 ? colors.textFaint : colors.text} />
                </Pressable>

                <Text style={s.qtyVal}>{qty}</Text>

                <Pressable
                  style={[s.qtyBtn, qty >= MAX_QTY && s.qtyBtnOff]}
                  disabled={qty >= MAX_QTY}
                  onPress={() => setQty(n => Math.min(MAX_QTY, n + 1))}
                  hitSlop={6}
                >
                  <Ionicons name="add" size={16} color={qty >= MAX_QTY ? colors.textFaint : colors.text} />
                </Pressable>
              </View>
            </View>
          )}

          {/* Same fix as the shared plans panel: "You get" is what the WALLET
              receives, so it counts the bonus. It read 15 RC on a pack that
              credits 25 - the one line here that has to match reality exactly.
              total_coins is derived and credited by the server, so this reads
              its answer rather than doing arithmetic of its own. */}
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
                    ? `Purchase ${qty} gifts · ${fmtUSD(selected.price_usd * qty)}`
                    : `Purchase gift · ${fmtUSD(selected.price_usd)}`}
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
          {iapOn ? "Pick a gift to buy coins." : "In-app coin purchases aren't switched on yet."}
        </Text>
      )}
    </View>
  );
}

/* ══════════════════════════════════════════════════════════════════════════ */
const CARD_W = (Dimensions.get("window").width - spacing.lg * 2 - spacing.md) / 2;

/** 3 plan tiles per row, with even gaps that survive the sheet's padding. */
const PLAN_COLS = 3;
const PLAN_W =
  (Dimensions.get("window").width - spacing.lg * 2 - spacing.sm * (PLAN_COLS - 1)) / PLAN_COLS;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bgMuted },
  content: { padding: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  /* balances */
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.md },
  card: {
    width: CARD_W,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  cardBody: { padding: spacing.md },
  cardIcon: {
    width: 40, height: 40, borderRadius: radius.md,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  cardLabel: { fontSize: font.sm, color: colors.textMuted },
  cardLabelBold: { fontWeight: "800", color: colors.text },
  valueRow: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: 2 },
  value: { fontSize: 24, fontWeight: "900", color: colors.text, letterSpacing: -0.5 },
  cardSub: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
  cardBtn: {
    marginTop: spacing.md, alignSelf: "flex-start",
    borderWidth: 1.5, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  cardBtnTxt: { fontSize: font.sm, fontWeight: "800" },
  cardFoot: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: colors.border,
    paddingHorizontal: spacing.md, paddingVertical: spacing.sm,
  },
  footLabel: { fontSize: font.xs, color: colors.textFaint },
  footValue: { fontSize: font.xs, fontWeight: "800" },

  rc: { backgroundColor: "#f7b731", alignItems: "center", justifyContent: "center" },
  rcTxt: { color: "#fff", fontWeight: "900" },

  /* buy coins */
  sectionHead: {
    flexDirection: "row", alignItems: "center",
    marginTop: spacing.xl, marginBottom: spacing.md, gap: spacing.sm,
  },
  h2: { fontSize: font.lg, fontWeight: "900", color: colors.text },
  h2sub: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
  securePill: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "#f0fdf4", borderWidth: 1, borderColor: "#dcfce7",
    borderRadius: radius.pill, paddingHorizontal: spacing.sm, paddingVertical: 5,
  },
  secureTxt: { fontSize: font.xs, fontWeight: "800", color: colors.success },

  packRow: { gap: spacing.sm, paddingRight: spacing.lg },
  pack: {
    width: 132, alignItems: "center",
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
    paddingVertical: spacing.md, paddingHorizontal: spacing.sm,
  },
  packBadge: {
    position: "absolute", top: -1, alignSelf: "center",
    backgroundColor: colors.brand, borderRadius: radius.pill,
    paddingHorizontal: spacing.sm, paddingVertical: 2, zIndex: 2,
  },
  packBadgeTxt: { fontSize: 9, fontWeight: "900", color: "#fff", letterSpacing: 0.4 },
  packImg: { width: 56, height: 56, marginTop: spacing.xs },
  packCoins: { fontSize: 20, fontWeight: "900", color: colors.text, marginTop: spacing.xs },
  packRc: { fontSize: 10, fontWeight: "800", color: colors.textFaint },
  packBonusPill: { marginTop: 3, borderRadius: 999, backgroundColor: "#fef3c7", paddingHorizontal: 6, paddingVertical: 2 },
  packBonusText: { fontSize: 9, fontWeight: "800", color: "#92400e" },
  packBonusTag: { marginTop: 2, fontSize: 8.5, fontWeight: "700", color: "#b45309", textTransform: "uppercase" },
  packPrice: { fontSize: font.md, fontWeight: "900", color: colors.text, marginTop: spacing.sm },
  packRate: { fontSize: 9.5, color: colors.textFaint, marginTop: 2 },
  /* The bonus claims, green so they read as a gain rather than more grey text. */
  packTotal: { fontSize: 9.5, fontWeight: "800", color: "#16a34a", marginTop: 3 },
  packRateBonus: { fontSize: 9.5, fontWeight: "800", color: "#16a34a", marginTop: 1 },
  totalSub: { fontSize: font.xs, color: "#16a34a", fontWeight: "700" },

  morePack: {
    width: 108, alignItems: "center", justifyContent: "center", gap: 3,
    backgroundColor: colors.brandTint, borderRadius: radius.lg,
    borderWidth: 1, borderColor: "#fecdd3", borderStyle: "dashed",
    paddingVertical: spacing.md,
  },
  moreIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#fff",
    alignItems: "center", justifyContent: "center", marginBottom: 2,
  },
  moreTitle: { fontSize: font.sm, fontWeight: "900", color: colors.text },
  moreSub: { fontSize: font.xs, color: colors.textMuted },

  /* features */
  featureRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginTop: spacing.lg },
  feature: {
    width: CARD_W - spacing.xs,
    backgroundColor: colors.card, borderRadius: radius.md,
    borderWidth: 1, borderColor: colors.border,
    padding: spacing.md,
  },
  featureIcon: {
    width: 28, height: 28, borderRadius: radius.sm,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  featureTitle: { fontSize: font.sm, fontWeight: "800", color: colors.text },
  featureSub: { fontSize: font.xs, color: colors.textFaint, marginTop: 1 },

  /* transactions */
  txCard: {
    marginTop: spacing.xl,
    backgroundColor: colors.card, borderRadius: radius.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  txHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    padding: spacing.lg, paddingBottom: spacing.md,
  },
  viewAll: { fontSize: font.sm, fontWeight: "800", color: colors.brand },
  txRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    paddingHorizontal: spacing.lg, paddingVertical: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  txIcon: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center" },
  txDesc: { fontSize: font.sm, fontWeight: "700", color: colors.text },
  txDate: { fontSize: font.xs, color: colors.textFaint, marginTop: 2 },
  txAmt: { fontSize: font.sm, fontWeight: "900" },
  txStatus: { backgroundColor: "#dcfce7", borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2 },
  txStatusTxt: { fontSize: 9.5, fontWeight: "800", color: colors.success },

  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: 4 },
  emptyIcon: {
    width: 54, height: 54, borderRadius: 27, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center", marginBottom: spacing.sm,
  },
  emptyTitle: { fontSize: font.md, fontWeight: "800", color: colors.textSecondary },
  emptySub: { fontSize: font.xs, color: colors.textFaint },

  /* sheets */
  // flex:1 so the column actually fills the sheet's fixed height. Without it the
  // root sized to its content: the review card ran off the bottom edge and got
  // clipped, and whatever height it didn't use showed as a blank band.
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
  planNo: { alignSelf: "flex-start", fontSize: 9, fontWeight: "900", color: "#c2c7d0", marginBottom: 2 },
  planName: { fontSize: font.xs, fontWeight: "800", color: colors.text, marginTop: 4 },

  searchWrap: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    marginHorizontal: spacing.lg, marginTop: spacing.md,
    backgroundColor: colors.bgMuted,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 9,
  },
  searchInput: { flex: 1, fontSize: font.sm, color: colors.text, padding: 0 },

  resetBtn: {
    marginTop: spacing.md,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  resetTxt: { fontSize: font.sm, fontWeight: "800", color: colors.textSecondary },
  planCoins: { fontSize: 10, fontWeight: "800", color: colors.brand, marginTop: 1 },
  planPrice: { fontSize: font.sm, fontWeight: "900", color: colors.text, marginTop: 2 },
  planRate: { fontSize: 9, color: colors.textFaint, marginTop: 1 },

  bandScroll: { flexGrow: 0 },
  bandRow: { gap: 6, paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, alignItems: "center" },
  bandChip: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.pill,
    paddingHorizontal: 11, height: 30, justifyContent: "center",
    backgroundColor: colors.card,
  },
  bandChipOn: { backgroundColor: colors.brand, borderColor: colors.brand },
  bandTxt: { fontSize: 12, fontWeight: "700", color: colors.textMuted },
  bandTxtOn: { color: "#fff" },

  sheetNote: {
    marginHorizontal: spacing.lg, marginTop: spacing.md, marginBottom: spacing.md,
    fontSize: font.xs, color: colors.textFaint, textAlign: "center",
  },

  planOff: { opacity: 0.55 },
  planSel: { borderColor: colors.brand, borderWidth: 1.5, backgroundColor: colors.brandTint },
  planTick: {
    position: "absolute", top: 4, right: 4, zIndex: 2,
    width: 16, height: 16, borderRadius: 8, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
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

  pager: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: spacing.lg, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.border,
  },
  pageBtn: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: 7,
  },
  pageBtnOff: { opacity: 0.45 },
  pageBtnTxt: { fontSize: font.sm, fontWeight: "800", color: colors.textSecondary },
  pageTxt: { fontSize: font.xs, fontWeight: "700", color: colors.textMuted },
});
