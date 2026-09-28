import { useCallback, useMemo, useState } from "react";
import {
  View, Text, Pressable, FlatList, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import { Image } from "expo-image";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react-native";
import Svg, { Circle, Defs, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import { ds } from "@/theme/design";
import { font } from "@/constants/theme";
import { AnimatedGift } from "@/components/AnimatedGift";
import { walletApi, type WalletTransaction } from "@/api/wallet.api";
import {
  giftApi,
  type Gift,
  type GiftHistoryItem,
  type TopSupporter,
} from "@/api/gift.api";
import { useAuthStore } from "@/store/auth.store";
import { useRelativeTimeTick } from "@/utils/format";
import { pct, plainUsd } from "@/utils/money";
import { formatWeekdayShort, formatMonthDay } from "@/utils/date-format";

/**
 * Gifts & coins - the prototype's `giftsOpen` surface, on live data.
 *
 * Reached from the Inbox's "Gifts & coins" row. The gift NOTIFICATION feed it
 * used to open is still one tap away, on the history button in the header.
 *
 * Three sections of the design have no endpoint behind them and are therefore
 * NOT drawn, rather than filled with plausible numbers:
 *
 *   Top supporters  - `wallet_transactions` records a description string but no
 *                     sender id, so "who sent me the most" is not derivable
 *                     from any current API.
 *   Payouts tab     - nothing writes a payout/withdrawal row into the coin
 *                     ledger; the only types are gift_sent, gift_received,
 *                     coin_purchase, premium_bonus and ad_income. The third tab
 *                     is the unfiltered ledger instead, which is the only place
 *                     purchases, bonuses and ad income are visible at all.
 *   Stat tiles      - the design's "this week" / "supporters" framing needs a
 *                     time-windowed aggregate that does not exist. The tiles
 *                     carry the wallet's real lifetime totals instead, labelled
 *                     for what they actually are.
 *
 * The payout card and the trend pill DO have a source, but a separate one:
 * coins live in `wallets` while cash-out lives in `creator_wallets`, so the
 * screen reads two endpoints. See wallet.api.ts.
 */

/* The prototype's chrome grey. Close to but not the same as any `ds` surface
 * token, and design.ts is explicit that the values there are literal prototype
 * hexes - so these stay local rather than bending a shared token to fit. */
const CHROME = "#F4F2F5";
const TILE = "#F7F6F8";
const TREND_UP_BG = "rgba(43,196,138,.16)";
const TREND_UP_FG = "#5FE0AE";
const AMOUNT_UP = "#1F9D6B";

/* ── Glyphs ─────────────────────────────────────────────────────────────── */

/** The transaction-row icon set, mirroring the prototype's `gi(d)` helper -
 *  path data only, so one component draws every ledger icon. */
function PathGlyph({ d, size = 19, stroke = ds.text, width = 1.8 }: {
  d: string[];
  size?: number;
  stroke?: string;
  width?: number;
}) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {d.map((p, i) => (
        <Path key={i} d={p} stroke={stroke} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

const GIFT = [
  "M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8",
  "M2.5 7.5h19v4.5h-19z",
  "M12 22V7.5",
  "M12 7.5H7.6a2.55 2.55 0 0 1 0-5.1C11 2.4 12 7.5 12 7.5Z",
  "M12 7.5h4.4a2.55 2.55 0 0 0 0-5.1C13 2.4 12 7.5 12 7.5Z",
];
const STAR = [
  "m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z",
  "M19 15.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z",
];
const BANK = ["M3 21h18", "M5 21V10", "M19 21V10", "M12 3 21 8H3z", "M9.5 21v-6h5v6"];
const COIN_PATHS = ["M12 4a8 8 0 1 0 0 16 8 8 0 1 0 0-16", "M14.8 9.3a3.5 3.5 0 1 0 0 5.4"];
const GIFT_EMPTY = ["M20 12v8a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-8", "M2.5 7.5h19v4.5h-19z", "M12 22V7.5"];

function ChevronLeftGlyph() {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="m15 18-6-6 6-6" stroke={ds.text} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function HistoryGlyph() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M3 3v5h5" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M3.5 13a9 9 0 1 0 2-5.7L3 8" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M12 7.5V12l3 2" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CoinGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke={ds.onDark} strokeWidth={2} />
      <Path d="M14.8 9.3a3.5 3.5 0 1 0 0 5.4" stroke={ds.onDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function PlusGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={ds.onDark} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

function WithdrawGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M12 4v12" stroke={ds.onDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="m7 11 5 5 5-5" stroke={ds.onDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M4 20h16" stroke={ds.onDark} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function CardGlyph() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={5.5} width={19} height={13} rx={3} stroke={ds.text} strokeWidth={1.9} />
      <Path d="M2.5 10h19" stroke={ds.text} strokeWidth={1.9} strokeLinecap="round" />
    </Svg>
  );
}

function InfoGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={9} stroke={ds.textMuted} strokeWidth={1.9} />
      <Path d="M12 11v5M12 8h.01" stroke={ds.textMuted} strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TrendGlyph({ up }: { up: boolean }) {
  return (
    <Svg width={11} height={11} viewBox="0 0 24 24" fill="none">
      <Path
        d={up ? "m5 15 7-7 7 7" : "m5 9 7 7 7-7"}
        stroke={up ? TREND_UP_FG : "rgba(255,255,255,.7)"}
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** The pink bloom behind the balance figure. CSS `radial-gradient` has no RN
 *  equivalent, so it is an SVG radial fill at the same size and offsets. */
function CardGlow() {
  return (
    <View style={styles.glow} pointerEvents="none">
      <Svg width={190} height={190}>
        <Defs>
          <RadialGradient id="coinGlow" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={ds.accent} stopOpacity={0.32} />
            <Stop offset="0.68" stopColor={ds.accent} stopOpacity={0} />
          </RadialGradient>
        </Defs>
        <Circle cx={95} cy={95} r={95} fill="url(#coinGlow)" />
      </Svg>
    </View>
  );
}

/* ── Formatting ─────────────────────────────────────────────────────────── */

/** 2480 → "2,480". Intl grouping is not dependable across JS engines here, and
 *  the balance is the one number on the screen that must never render wrong. */
function groupNum(n: number): string {
  if (!Number.isFinite(n)) return "0";
  return Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** Magnitude only - callers here supply their own +/- prefix. Grouped, so a
 *  four-figure balance reads "$12,345.67" here as it does everywhere else;
 *  `toFixed` alone gave "$12345.67" on this screen and nowhere else. */
function usd(n: number): string {
  return `$${plainUsd(Math.abs(n))}`;
}

/** 30 → "30", 30.5 → "30.5". The admin setting is a float, and "30.00%" in a
 *  sentence reads like a quoted price rather than a rate. */
const trimRate = pct;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The API preformats the payout date as "Aug 05, 2026"; the design wants
 *  "5 Aug". Falls back to the server's own string if it will not parse. */
function shortDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

function ago(iso?: string | null) {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return formatWeekdayShort(t);
  return formatMonthDay(t);
}

function updatedLabel(ts?: number): string {
  if (!ts) return "Updated just now";
  const s = Math.max(0, (Date.now() - ts) / 1000);
  if (s < 60) return "Updated just now";
  if (s < 3600) return `Updated ${Math.floor(s / 60)}m ago`;
  return `Updated ${Math.floor(s / 3600)}h ago`;
}

/* ── Ledger row mapping ─────────────────────────────────────────────────── */

const TX_META: Record<string, { label: string; d: string[] }> = {
  gift_received: { label: "Gift received", d: GIFT },
  gift_sent: { label: "Gift sent", d: GIFT },
  coin_purchase: { label: "Coins purchased", d: COIN_PATHS },
  premium_bonus: { label: "Premium bonus", d: STAR },
  ad_income: { label: "Ad revenue", d: BANK },
};

function metaOf(type: string) {
  return (
    TX_META[type] ?? {
      label: type ? type.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Transaction",
      d: GIFT,
    }
  );
}

/** The gift name, without the type prefix the backend repeats in every
 *  description ("Gift received: Roses" → "Roses"). */
function detailOf(t: WalletTransaction, label: string): string {
  // The gift's own name, when the row is a gift. Beats parsing it back out of a
  // sentence, and is the only source that stays right as copy changes.
  if (t.gift_name) return t.gift_name;

  const desc = stripCommissionNote((t.description ?? "").trim());
  if (!desc) return t.status ?? "";
  const i = desc.indexOf(":");
  if (i > 0 && desc.slice(0, i).trim().toLowerCase() === label.toLowerCase()) {
    return desc.slice(i + 1).trim();
  }
  return desc;
}

/**
 * Drop "(30% commission deducted)" from historic descriptions.
 *
 * Commission is no longer taken when a gift lands - it applies at withdrawal -
 * but rows written before that change still carry the phrase in the string the
 * server stored. Showing it would tell a creator their gift was cut when it
 * was not, so it is stripped on the way out. New rows never contain it.
 */
function stripCommissionNote(s: string): string {
  return s.replace(/\s*\(\s*\d+(?:\.\d+)?%\s*commission\s*deducted\s*\)/i, "").trim();
}

/** Coins where the row moves coins, dollars where it does not - `ad_income`
 *  writes a USD amount and leaves every coin column at zero, so reading
 *  `net_coins` alone would render it as a flat "0". */
function amountOf(t: WalletTransaction): { text: string; tone: "up" | "down" | "flat" } {
  if (t.net_coins) {
    const up = t.net_coins > 0;
    return { text: `${up ? "+" : "-"}${groupNum(Math.abs(t.net_coins))}`, tone: up ? "up" : "down" };
  }
  if (t.amount_usd) {
    const up = t.amount_usd > 0;
    return { text: `${up ? "+" : "-"}${usd(t.amount_usd)}`, tone: up ? "up" : "down" };
  }
  return { text: "0", tone: "flat" };
}

/* ── Tabs ───────────────────────────────────────────────────────────────── */

/**
 * The design's four tabs.
 *
 *   All       - the unfiltered coin ledger: the only view where purchases,
 *               premium bonuses and ad income appear at all.
 *   Received  - gifts sent TO you, from coin_gifts, so each row names the
 *               sender and the gift. The ledger cannot do this: it stores a
 *               description string and no counterparty.
 *   Sent      - the same, the other way round.
 *
 * Payouts is NOT a tab: it lives in a different system (creator_wallets), it is
 * a schedule rather than a list of coin movements, and it is where Reelsoo's
 * commission is now applied - so it belongs on the withdrawal screen behind the
 * Withdraw button, not as a filter over this ledger.
 */
type TabKey = "All" | "Received" | "Sent";
const TABS: TabKey[] = ["All", "Received", "Sent"];

const EMPTY_COPY: Record<TabKey, { title: string; sub: string }> = {
  Received: { title: "No gifts received yet", sub: "Gifts people send you will show up here." },
  Sent: { title: "No gifts sent yet", sub: "Gifts you send will show up here." },
  All: { title: "No transactions yet", sub: "Your coin activity will show up here." },
};

/* ── Screen ─────────────────────────────────────────────────────────────── */

export function GiftsCoinsScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  // Set only by GiftsIntroScreen's one-time "You're Set Up!" confirmation,
  // right after a creator becomes eligible for Gifts & Coins - a route
  // param rather than anything persisted, so it naturally shows exactly
  // once and never reappears on a later, ordinary visit to this screen.
  const justSetUp = !!route.params?.justSetUp;
  const authed = useAuthStore((s) => s.status === "authenticated");
  const [tab, setTab] = useState<TabKey>("All");
  const [notice, setNotice] = useState<string | null>(null);

  // Keeps the "Updated Nm ago" line honest while the screen sits open.
  useRelativeTimeTick(30_000);

  const summary = useQuery({
    queryKey: ["wallet-summary"],
    queryFn: () => walletApi.summary(),
    enabled: authed,
    staleTime: 30_000,
  });

  const payouts = useQuery({
    queryKey: ["wallet-payouts"],
    queryFn: () => walletApi.payouts(),
    enabled: authed,
    staleTime: 60_000,
  });

  const isGiftTab = tab === "Received" || tab === "Sent";

  /** The unfiltered coin ledger - "All" only. */
  const ledger = useInfiniteQuery({
    queryKey: ["wallet-transactions", "all"],
    queryFn: ({ pageParam = 1 }) => walletApi.transactions(pageParam, 20),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: authed && tab === "All",
    staleTime: 20_000,
  });

  /** Gifts with the other person attached - Received / Sent. */
  const giftLog = useInfiniteQuery({
    queryKey: ["gift-history", isGiftTab ? tab.toLowerCase() : "received"],
    queryFn: ({ pageParam = 1 }) =>
      giftApi.history(tab === "Sent" ? "sent" : "received", pageParam as number, 20),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.hasMore ? last.page + 1 : undefined),
    enabled: authed && isGiftTab,
    staleTime: 20_000,
  });

  /** Who has gifted you the most. Shown above the tabs, on any tab. */
  const supporters = useQuery({
    queryKey: ["gift-top-supporters"],
    queryFn: () => giftApi.topSupporters("month", 10),
    enabled: authed,
    staleTime: 120_000,
  });

  /** The gift catalog, so a row can show the artwork of the gift that was sent
   *  rather than a generic icon. Matched on name, which is what coin_gifts
   *  stores. */
  const catalog = useQuery({
    queryKey: ["gifts"],
    queryFn: giftApi.gifts,
    enabled: authed,
    staleTime: 10 * 60_000,
  });
  const giftByName = useMemo(() => {
    const m = new Map<string, Gift>();
    for (const g of catalog.data ?? []) m.set(g.name.toLowerCase(), g);
    return m;
  }, [catalog.data]);

  const rows = useMemo(
    () => ledger.data?.pages.flatMap((p) => p.items) ?? [],
    [ledger.data],
  );
  const giftRows = useMemo(
    () => giftLog.data?.pages.flatMap((p) => p.items) ?? [],
    [giftLog.data],
  );

  const wallet = summary.data?.wallet;
  const payout = payouts.data ?? null;
  const growth = payout?.growth ?? null;

  const refreshAll = useCallback(() => {
    void summary.refetch();
    void payouts.refetch();
    void ledger.refetch();
  }, [summary, payouts, ledger]);

  /**
   * The withdraw flow is its own screen now - it has to pick an amount, choose
   * a destination and show the commission before anything is requested, none of
   * which fits a toast. The gates (approved tax form, a payout method, the
   * minimum) live there and on the server; this is just the door.
   */
  const onWithdraw = useCallback(() => {
    navigation.navigate("Withdraw");
  }, [navigation]);

  /** Coins are bought through the store's own billing - see CoinTopUpScreen. */
  const onTopUp = useCallback(() => {
    navigation.navigate("CoinTopUp");
  }, [navigation]);

  const header = (
    <View style={styles.headerBar} pointerEvents="box-none">
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={() => navigation.goBack()}
          style={styles.circleBtn}
        >
          <ChevronLeftGlyph />
        </Pressable>
        <View style={styles.headerText}>
          <Text style={styles.title} numberOfLines={1}>
            Gifts &amp; coins
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {authed ? updatedLabel(summary.dataUpdatedAt) : "Coins and gifts"}
          </Text>
        </View>
        {/* The full ledger, filterable. It used to open the gift NOTIFICATION
            feed, which the backend never writes to - so the screen opened
            empty and the button looked dead. The transactions endpoint has the
            real history. */}
        <Pressable
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Transaction history"
          onPress={() => navigation.navigate("WalletHistory")}
          style={styles.circleBtn}
        >
          <HistoryGlyph />
        </Pressable>
      </View>
    </View>
  );

  if (!authed) {
    return (
      <View style={styles.root}>
        {header}
        <View style={styles.center}>
          <View style={styles.emptyIcon}>
            <PathGlyph d={GIFT_EMPTY} size={22} stroke={ds.silver} width={1.9} />
          </View>
          <Text style={styles.emptyTitle}>Log in to see your Teezer Coins</Text>
          <Text style={styles.emptySub}>Your balance, gifts and payouts live here.</Text>
        </View>
      </View>
    );
  }

  const listHeader = (
    <View>
      {/* ── Balance card ───────────────────────────────────────────────── */}
      <View style={styles.card}>
        <CardGlow />
        <View style={styles.cardTop}>
          <Text style={styles.cardLabel}>COIN BALANCE</Text>
          <View style={styles.balanceRow}>
            <View style={styles.coinBadge}>
              <CoinGlyph />
            </View>
            <Text style={styles.balance}>{summary.isLoading ? "—" : groupNum(wallet?.coin_balance ?? 0)}</Text>
            <Text style={styles.balanceUnit}>Teezer Coins</Text>
          </View>
          <View style={styles.worthRow}>
            <Text style={styles.worth}>
              {wallet ? `≈ ${usd(wallet.wallet_balance_usd)} available` : " "}
            </Text>
            {/* Only drawn when the earnings endpoint actually returned a
                change - a "0% vs last week" pill is noise, not information. */}
            {!!growth && growth.percentage !== 0 && (
              <View style={[styles.trendPill, !growth.up && styles.trendPillDown]}>
                <TrendGlyph up={growth.up} />
                <Text style={[styles.trendText, !growth.up && styles.trendTextDown]}>
                  {Math.abs(growth.percentage)}% vs last week
                </Text>
              </View>
            )}
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={onTopUp} style={[styles.actionBtn, styles.topUpBtn]}>
            <PlusGlyph />
            <Text style={styles.actionText}>Top up</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onWithdraw} style={[styles.actionBtn, styles.withdrawBtn]}>
            <WithdrawGlyph />
            <Text style={styles.actionText}>Withdraw</Text>
          </Pressable>
        </View>
      </View>

      {!!notice && (
        <Pressable style={styles.notice} onPress={() => setNotice(null)} accessibilityRole="button">
          <InfoGlyph />
          <Text style={styles.noticeText}>{notice}</Text>
        </Pressable>
      )}

      {/* ── Payout schedule ────────────────────────────────────────────────
          Two independent facts, either of which can be absent. The card is
          skipped entirely when neither exists. "Manage" is not drawn: no
          payout-method screen exists to send anyone to. */}
      {!!payout && (!!payout.next_payout?.date || !!payout.payment_method) && (
        <View style={styles.payout}>
          <View style={styles.payoutIcon}>
            <CardGlyph />
          </View>
          <View style={styles.payoutText}>
            <Text style={styles.payoutTitle} numberOfLines={1}>
              {payout.next_payout?.date
                ? `Next payout ${shortDate(payout.next_payout.date)}`
                : "No payout scheduled"}
            </Text>
            <Text style={styles.payoutSub} numberOfLines={1}>
              {payout.payment_method
                ? [payout.payment_method.provider, payout.payment_method.masked_account ?? payout.payment_method.account_email]
                    .filter(Boolean)
                    .join(" · ")
                : "No payout method yet"}
            </Text>
          </View>
        </View>
      )}

      {/* ── Lifetime totals ───────────────────────────────────────────────
          The design's tiles read "Coins this week / Gifts received /
          Supporters". None of those three is available: there is no
          time-windowed aggregate and no per-sender grouping. These are the
          wallet's real lifetime coin totals, labelled for what they are. */}
      {!!wallet && (
        <View style={styles.stats}>
          <Stat value={wallet.total_received_coins} label="Coins received" />
          <Stat value={wallet.total_spent_coins} label="Coins sent" />
          <Stat value={wallet.total_purchased_coins} label="Coins purchased" />
        </View>
      )}

      {/* ── Top supporters ────────────────────────────────────────────── */}
      <TopSupporters
        data={supporters.data ?? []}
        onOpenUser={(username) => navigation.navigate("UserProfile", { username })}
      />


      {/* ── Ledger filter ─────────────────────────────────────────────── */}
      <View style={styles.tabs}>
        {TABS.map((t) => {
          const active = t === tab;
          return (
            <Pressable
              key={t}
              onPress={() => setTab(t)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              style={[styles.tab, active ? styles.tabOn : styles.tabOff]}
            >
              <Text style={[styles.tabText, active ? styles.tabTextOn : styles.tabTextOff]}>{t}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );

  const empty = ledger.isLoading ? (
    <View style={styles.center}>
      <ActivityIndicator color={ds.accent} />
    </View>
  ) : ledger.isError ? (
    <View style={styles.center}>
      <Text style={styles.emptyTitle}>Couldn&apos;t load transactions</Text>
      <Text style={styles.emptySub}>Pull down to try again.</Text>
    </View>
  ) : (
    <View style={styles.emptyBlock}>
      <View style={styles.emptyIcon}>
        <PathGlyph d={GIFT_EMPTY} size={22} stroke={ds.silver} width={1.9} />
      </View>
      <Text style={styles.emptyTitle}>{EMPTY_COPY[tab].title}</Text>
      <Text style={styles.emptySub}>{EMPTY_COPY[tab].sub}</Text>
    </View>
  );

  return (
    <View style={styles.root}>
      {header}
      <FlatList
        // One list, three kinds of row: the ledger on All, named gifts on
        // Received/Sent, and nothing on Payouts (which is a panel in the
        // header, not a feed).
        data={tab === "All" ? rows : isGiftTab ? giftRows : []}
        keyExtractor={(t: any) => `${tab}-${t.id}`}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={empty}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (tab === "All") {
            if (ledger.hasNextPage && !ledger.isFetchingNextPage) void ledger.fetchNextPage();
          } else if (isGiftTab) {
            if (giftLog.hasNextPage && !giftLog.isFetchingNextPage) void giftLog.fetchNextPage();
          }
        }}
        refreshControl={
          <RefreshControl
            refreshing={summary.isRefetching || ledger.isRefetching || giftLog.isRefetching}
            onRefresh={refreshAll}
            tintColor={ds.textMuted}
          />
        }
        renderItem={({ item }: any) =>
          isGiftTab ? (
            <GiftRow
              g={item as GiftHistoryItem}
              gift={giftByName.get(String((item as GiftHistoryItem).gift_name ?? "").toLowerCase())}
              onOpenUser={(username) => navigation.navigate("UserProfile", { username })}
            />
          ) : (
            <LedgerRow
              tx={item as WalletTransaction}
              gift={giftByName.get(String((item as WalletTransaction).gift_name ?? "").toLowerCase())}
              onOpenUser={(username) => navigation.navigate("UserProfile", { username })}
            />
          )
        }
        ListFooterComponent={
          <View>
            {ledger.isFetchingNextPage && (
              <View style={{ paddingVertical: 18 }}>
                <ActivityIndicator color={ds.accent} />
              </View>
            )}
            {justSetUp && (
              <View style={styles.setUpNote}>
                <CheckCircle2 size={18} color={TREND_UP_FG} strokeWidth={2.2} />
                <View style={styles.footerNoteBody}>
                  <Text style={styles.setUpNoteTitle}>You&apos;re Set Up!</Text>
                  <Text style={styles.footerNoteText}>
                    Gifts & Coins is active on your account - fans can send you gifts right here, credited to your wallet instantly.
                  </Text>
                </View>
              </View>
            )}
            {/* Three separate facts, on three lines. As one run-on sentence the
                thing creators most need to know - that gifts arrive whole - was
                buried between a refund policy and a tax clause. */}
            <View style={styles.footerNote}>
              <View style={styles.footerNoteIcon}>
                <InfoGlyph />
              </View>
              <View style={styles.footerNoteBody}>
                <Text style={styles.footerNoteTitle}>How earnings work</Text>
                {/* The rate is named rather than described, and it comes from the
                    admin setting - creators asked what "commission" actually
                    costs them, and a hard-coded 30 would go stale the moment the
                    setting moves. */}
                <Text style={styles.footerNoteText}>
                  Gifts are credited to you <Text style={styles.footerNoteStrong}>in full</Text>. Teezer&apos;s
                  {payout?.commission_rate ? ` ${trimRate(payout.commission_rate)}%` : ""} platform commission is
                  deducted only at the time of withdrawal — never when a gift arrives.
                </Text>
                <Text style={styles.footerNoteText}>
                  Coins you top up are for sending gifts — they can&apos;t be withdrawn. Only coins you&apos;ve
                  earned from gifts can be cashed out.
                </Text>
                <Text style={styles.footerNoteText}>
                  Payouts need an approved tax form and go out on your payout schedule.
                </Text>
                <Text style={styles.footerNoteText}>
                  Coins are non-refundable and subject to Teezer&apos;s creator terms and local tax rules.
                </Text>
              </View>
            </View>
          </View>
        }
      />
    </View>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue} numberOfLines={1}>
        {groupNum(value)}
      </Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

/** gifts.icon_url is stored site-relative, so RN needs it absolutified. */
const WEB_ORIGIN = "https://teezer.live";
const giftIconUrl = (icon: string) => (icon.startsWith("/") ? `${WEB_ORIGIN}${icon}` : icon);

/**
 * One gift, named. This is the row the ledger could never draw: it knows WHO
 * (from coin_gifts) and WHICH gift, so it shows their avatar, their handle and
 * the gift's own artwork instead of a generic coin glyph.
 */
function GiftRow({
  g,
  gift,
  onOpenUser,
}: {
  g: GiftHistoryItem;
  gift?: Gift;
  onOpenUser: (username: string) => void;
}) {
  const received = g.direction === "received";
  // Received lands the net; sent spends the gross. Show what moved for you.
  const coins = received ? g.net_coins : g.gross_coins;
  const who = g.user;

  return (
    <View style={styles.row}>
      <Pressable
        disabled={!who}
        onPress={() => who && onOpenUser(who.username)}
        accessibilityRole={who ? "button" : undefined}
        accessibilityLabel={who ? `Open @${who.username}` : undefined}
      >
        <View style={styles.giftAvatarWrap}>
          {who?.avatar ? (
            <Image source={{ uri: who.avatar }} style={styles.giftAvatar} contentFit="cover" transition={120} />
          ) : (
            <View style={[styles.giftAvatar, styles.giftAvatarFallback]}>
              <Text style={styles.giftAvatarText}>
                {(who?.name || who?.username || "?").charAt(0).toUpperCase()}
              </Text>
            </View>
          )}
          {/* The gift itself, badged on the corner of who sent it. */}
          {gift?.icon_url ? (
            <View style={styles.giftBadge}>
              <AnimatedGift uri={giftIconUrl(gift.icon_url)} slug={gift.slug} size={20} />
            </View>
          ) : null}
        </View>
      </Pressable>

      <View style={styles.rowText}>
        {/* The HANDLE, as the design shows it - "sunita.eats", not a display
            name. It is what identifies the person across the app. */}
        <Pressable disabled={!who} onPress={() => who && onOpenUser(who.username)}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {who ? who.username : "Someone"}
          </Text>
        </Pressable>
        {/* Gift then time, the gift carrying the accent so the eye lands on
            WHAT was sent before when. */}
        <Text style={styles.giftSub} numberOfLines={1}>
          {g.gift_name}
          <Text style={styles.giftSubTime}>{ago(g.created_at) ? ` · ${ago(g.created_at)}` : ""}</Text>
        </Text>
        {/* What was sent vs what landed, on received gifts where a cut applies. */}
        {received && g.commission_coins > 0 && (
          <Text style={styles.rowSplit} numberOfLines={1}>
            {groupNum(g.gross_coins)} sent · {groupNum(g.commission_coins)} fee
          </Text>
        )}
      </View>

      <Text style={[styles.rowAmount, received ? styles.rowAmountUp : styles.rowAmountDown]}>
        {received ? "+" : "-"}
        {groupNum(coins)}
      </Text>
    </View>
  );
}

/** Who has gifted you the most this month - the design's supporters carousel. */
function TopSupporters({
  data,
  onOpenUser,
}: {
  data: TopSupporter[];
  onOpenUser: (username: string) => void;
}) {
  if (data.length === 0) return null;
  return (
    <View style={styles.suppWrap}>
      <View style={styles.suppHead}>
        <Text style={styles.suppTitle}>Top supporters</Text>
        <Text style={styles.suppPeriod}>This month</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.suppRail}>
        {data.map((s, i) => (
          <Pressable
            key={s.user.id}
            onPress={() => onOpenUser(s.user.username)}
            accessibilityRole="button"
            accessibilityLabel={`Open @${s.user.username}`}
            style={styles.suppCard}
          >
            <Text style={styles.suppRank}>{String(i + 1).padStart(2, "0")}</Text>
            {s.user.avatar ? (
              <Image source={{ uri: s.user.avatar }} style={styles.suppAvatar} contentFit="cover" transition={120} />
            ) : (
              <View style={[styles.suppAvatar, styles.giftAvatarFallback]}>
                <Text style={styles.suppAvatarText}>
                  {(s.user.name || s.user.username).charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
            <Text style={styles.suppName} numberOfLines={1}>
              {s.user.username}
            </Text>
            <Text style={styles.suppCoins} numberOfLines={1}>
              {groupNum(s.coins)} coins
            </Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

function LedgerRow({
  tx,
  gift,
  onOpenUser,
}: {
  tx: WalletTransaction;
  gift?: Gift;
  onOpenUser: (u: string) => void;
}) {
  const meta = metaOf(tx.type);
  const amount = amountOf(tx);
  const detail = detailOf(tx, meta.label);
  const when = ago(tx.created_at);
  // On a gift the person IS the row - "Gift received" says nothing you cannot
  // see from the icon and the colour of the number.
  const who = tx.counterparty ?? null;

  return (
    <View style={styles.row}>
      {/* The gift's own artwork on a gift row, the type glyph on everything
          else. A generic outline said "a gift happened"; the artwork says
          WHICH, which is the part people remember. */}
      <View style={styles.rowIcon}>
        {gift?.icon_url ? (
          <AnimatedGift uri={giftIconUrl(gift.icon_url)} slug={gift.slug} size={26} />
        ) : (
          <PathGlyph d={meta.d} />
        )}
      </View>
      <View style={styles.rowText}>
        <Pressable disabled={!who} onPress={() => who && onOpenUser(who.username)}>
          <Text style={styles.rowTitle} numberOfLines={1}>
            {who ? who.username : meta.label}
          </Text>
        </Pressable>
        <Text style={styles.rowSub} numberOfLines={1}>
          {[who ? detail : detail, when].filter(Boolean).join(" · ")}
        </Text>
      </View>
      <Text
        style={[
          styles.rowAmount,
          amount.tone === "up" && styles.rowAmountUp,
          amount.tone === "down" && styles.rowAmountDown,
        ]}
      >
        {amount.text}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },

  headerBar: { backgroundColor: ds.surface },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 10 },
  circleBtn: {
    width: 38,
    height: 38,
    borderRadius: 999,
    backgroundColor: CHROME,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1, minWidth: 0, gap: 2 },
  title: { fontSize: 16.5, fontWeight: font.weightHeavy, color: ds.text, letterSpacing: -0.3 },
  subtitle: { fontSize: 11.5, color: ds.textMuted },

  list: { paddingHorizontal: 16, paddingTop: 6, paddingBottom: 120 },

  /* ── Balance card ── */
  card: { borderRadius: 22, backgroundColor: "#141318", padding: 20, paddingTop: 22, gap: 18, overflow: "hidden" },
  glow: { position: "absolute", top: -70, right: -50, width: 190, height: 190 },
  cardTop: { gap: 8 },
  cardLabel: {
    fontSize: 11,
    fontWeight: font.weightBold,
    color: "rgba(255,255,255,.5)",
    letterSpacing: 1.1,
  },
  balanceRow: { flexDirection: "row", alignItems: "flex-end", gap: 9 },
  coinBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: "rgba(255,255,255,.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 3,
  },
  balance: { fontSize: 38, fontWeight: font.weightHeavy, color: ds.onDark, letterSpacing: -1.5, lineHeight: 40 },
  balanceUnit: { fontSize: font.sm, color: "rgba(255,255,255,.55)", paddingBottom: 6 },
  worthRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2, flexWrap: "wrap" },
  worth: { fontSize: 12.5, color: "rgba(255,255,255,.62)" },
  trendPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: TREND_UP_BG,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  trendPillDown: { backgroundColor: "rgba(255,255,255,.10)" },
  trendText: { fontSize: font.xs, fontWeight: font.weightBold, color: TREND_UP_FG },
  trendTextDown: { color: "rgba(255,255,255,.7)" },

  actions: { flexDirection: "row", gap: 9 },
  actionBtn: {
    flex: 1,
    height: 46,
    borderRadius: 999,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
  },
  topUpBtn: { backgroundColor: ds.accent },
  withdrawBtn: { borderWidth: 1, borderColor: "rgba(255,255,255,.2)" },
  actionText: { fontSize: 13.5, fontWeight: font.weightBold, color: ds.onDark },

  /* ── Inline honest notice ── */
  notice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 12,
    padding: 14,
    borderRadius: 14,
    backgroundColor: ds.surfaceMuted,
  },
  noticeText: { flex: 1, fontSize: 12, color: ds.textDim, lineHeight: 17 },

  /* ── Payout ── */
  payout: {
    flexDirection: "row",
    alignItems: "center",
    gap: 11,
    marginTop: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 16,
    backgroundColor: TILE,
  },
  payoutIcon: {
    width: 36,
    height: 36,
    borderRadius: 999,
    backgroundColor: ds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  payoutText: { flex: 1, minWidth: 0, gap: 2 },
  payoutTitle: { fontSize: 13.5, fontWeight: font.weightBold, color: ds.text },
  payoutSub: { fontSize: 12, color: ds.textMuted },

  /* ── Stat tiles ── */
  stats: { flexDirection: "row", gap: 9, paddingTop: 12 },
  stat: { flex: 1, backgroundColor: TILE, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 14, gap: 5 },
  statValue: { fontSize: 19, fontWeight: font.weightHeavy, color: ds.text, letterSpacing: -0.5 },
  statLabel: { fontSize: font.xs, color: ds.textMuted, lineHeight: 15 },

  /* ── Tabs ── */
  tabs: { flexDirection: "row", gap: 6, paddingTop: 26, paddingBottom: 8 },
  tab: { borderRadius: 8, paddingHorizontal: 15, paddingVertical: 9 },
  tabOn: { backgroundColor: ds.text },
  tabOff: { backgroundColor: ds.surfaceSunken },
  tabText: { fontSize: 12.5, fontWeight: font.weightMedium },
  tabTextOn: { color: ds.onDark },
  tabTextOff: { color: ds.slate },

  /* ── Ledger rows ── */
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: CHROME },
  rowIcon: { width: 44, height: 44, borderRadius: 13, backgroundColor: CHROME, alignItems: "center", justifyContent: "center" },
  rowText: { flex: 1, minWidth: 0, gap: 3 },
  rowTitle: { fontSize: 14, fontWeight: font.weightBold, color: ds.text },
  rowSub: { fontSize: 12.5, color: ds.textMuted },
  rowAmount: { fontSize: 13.5, fontWeight: font.weightHeavy, color: ds.text },
  rowAmountUp: { color: AMOUNT_UP },
  rowAmountDown: { color: ds.textMuted },

  /* ── Named gift rows ─────────────────────────────────────────────────── */
  giftAvatarWrap: { width: 44, height: 44 },
  giftAvatar: { width: 44, height: 44, borderRadius: 999, backgroundColor: ds.surfaceSunken },
  giftAvatarFallback: { alignItems: "center", justifyContent: "center", backgroundColor: ds.accent },
  giftAvatarText: { color: ds.onDark, fontSize: 17, fontWeight: "800" },
  /* The gift itself, badged on the sender's avatar. */
  giftBadge: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 999,
    backgroundColor: ds.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  giftSub: { fontSize: 12.5, color: ds.accent, fontWeight: "600" },
  giftSubTime: { color: ds.textMuted, fontWeight: "400" },
  rowSplit: { fontSize: 11.5, color: ds.textFaint },

  /* ── Top supporters ──────────────────────────────────────────────────── */
  suppWrap: { paddingTop: 18 },
  suppHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingBottom: 10,
  },
  suppTitle: { fontSize: 15, fontWeight: "800", color: ds.text },
  suppPeriod: { fontSize: 12, fontWeight: "600", color: ds.accent },
  suppRail: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 4 },
  suppCard: {
    width: 104,
    alignItems: "center",
    gap: 5,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.line,
    backgroundColor: ds.surface,
  },
  suppRank: { alignSelf: "flex-start", fontSize: 9.5, fontWeight: "900", color: ds.silver },
  suppAvatar: { width: 44, height: 44, borderRadius: 999, backgroundColor: ds.surfaceSunken },
  suppAvatarText: { color: ds.onDark, fontSize: 17, fontWeight: "800" },
  suppName: { fontSize: 12, fontWeight: "700", color: ds.text, maxWidth: "100%" },
  suppCoins: { fontSize: 11, fontWeight: "700", color: ds.accent },

  /* ── Payouts panel ───────────────────────────────────────────────────── */
  payoutPanel: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: ds.line,
    backgroundColor: ds.surfaceMuted,
    gap: 10,
  },
  payoutRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  payoutLabel: { fontSize: 13, color: ds.textMuted },
  payoutValue: { fontSize: 13.5, fontWeight: "700", color: ds.text },
  payoutNote: { fontSize: 12, color: ds.accent, lineHeight: 17 },

  /* ── Empty / loading ── */
  center: { paddingVertical: 44, alignItems: "center", gap: 8 },
  emptyBlock: { paddingVertical: 44, paddingHorizontal: 30, alignItems: "center", gap: 8 },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: 999,
    backgroundColor: CHROME,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 14.5, fontWeight: font.weightBold, color: ds.text, textAlign: "center" },
  emptySub: { fontSize: 12.5, color: ds.textMuted, lineHeight: 19, textAlign: "center" },

  /* ── Footer ── */
  footerNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: ds.surfaceMuted,
  },
  footerNoteIcon: { paddingTop: 1 },
  footerNoteBody: { flex: 1, gap: 6 },
  footerNoteTitle: { fontSize: 12.5, fontWeight: "700", color: ds.text },
  footerNoteText: { fontSize: 12, color: ds.textDim, lineHeight: 17.5 },
  footerNoteStrong: { fontWeight: font.weightBold, color: ds.text },

  /* One-time "You're Set Up!" confirmation - same shape as footerNote, tinted
   * with the same green the trend pill already uses for "good news". */
  setUpNote: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginTop: 20,
    paddingHorizontal: 15,
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: TREND_UP_BG,
  },
  setUpNoteTitle: { fontSize: 12.5, fontWeight: "700", color: ds.text },
});
