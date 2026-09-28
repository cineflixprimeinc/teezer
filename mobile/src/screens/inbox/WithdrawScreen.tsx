import { useCallback, useMemo, useState } from "react";
import {
  View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator, RefreshControl,
} from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ds } from "@/theme/design";
import { walletApi, type PayoutMethodRow } from "@/api/wallet.api";
import { giftApi } from "@/api/gift.api";
import { useAuthStore } from "@/store/auth.store";
import { coins, plainUsd, pct as fmtPct, usd } from "@/utils/money";

/**
 * Withdraw earnings, to the supplied design.
 *
 * Every gate here is the backend's and is enforced there - this screen only
 * declines to offer what requestWithdraw would refuse, and says why in the
 * server's own words rather than inventing its own:
 *
 *   - An APPROVED tax form is required. Submitted is not enough; "under review"
 *     and "rejected" both still block, which is why the copy comes from
 *     `payout.tax.message` and not from a local string.
 *   - A payout method is required - there is nowhere to send money without one.
 *   - The amount must clear `minimum_withdraw` and cannot exceed the balance.
 *   - Reelsoo's commission is taken HERE, not when each gift arrived, so the
 *     "you receive" figure is the gross minus that fee. Gifts credit in full.
 *
 * The fee is previewed with the rate the server sends; the server recomputes it
 * on the request, so a rate change between load and tap cannot be exploited -
 * the preview is only ever a preview.
 */

const CARD = "#141317";
const CARD_SOFT = "#1E1C22";
const GREEN = "#2BC48A";

/* Money and coins come from the shared formatters so this screen spells a
   balance exactly as the Studio does. The local pair used the DEVICE locale,
   so the same $1,234.50 read as "1.234,50" on a German handset while every
   Studio screen showed "1,234.50". */
const money = usd;
const groupNum = coins;

function BackGlyph() {
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
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8} stroke="#0E0D11" strokeWidth={2} />
      <Path d="M14.8 9.3a3.5 3.5 0 1 0 0 5.4" stroke="#0E0D11" strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}

function ArrowGlyph() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Path d="M4 12h15M13 6l6 6-6 6" stroke="rgba(255,255,255,.5)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

/** Wallet vs bank, so the row reads at a glance like the design's. */
function MethodGlyph({ bank, on }: { bank: boolean; on: boolean }) {
  const c = on ? ds.onDark : ds.text;
  return bank ? (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path d="M3 21h18M5 21V10M19 21V10M12 3l9 5H3zM9.5 21v-6h5v6" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  ) : (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Rect x={2.5} y={5.5} width={19} height={13} rx={3} stroke={c} strokeWidth={1.8} />
      <Path d="M2.5 10h19" stroke={c} strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

function TickGlyph() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Path d="M20 6 9 17l-5-5" stroke={ds.onDark} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

const labelFor = (m: PayoutMethodRow) => {
  const p = m.provider?.trim() || "Payout method";
  return p.charAt(0).toUpperCase() + p.slice(1);
};
const isBank = (m: PayoutMethodRow) => /bank/i.test(m.provider ?? "");

export function WithdrawScreen() {
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  const qc = useQueryClient();
  const authed = useAuthStore((s) => s.status === "authenticated");

  const [amount, setAmount] = useState<number | null>(null);
  const [methodId, setMethodId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const payoutsQ = useQuery({
    queryKey: ["wallet-payouts"],
    queryFn: () => walletApi.payouts(),
    enabled: authed,
    staleTime: 30_000,
  });
  const methodsQ = useQuery({
    queryKey: ["payout-methods"],
    queryFn: () => walletApi.payoutMethods(),
    enabled: authed,
    staleTime: 60_000,
  });
  const walletQ = useQuery({
    queryKey: ["coin-wallet"],
    queryFn: giftApi.wallet,
    enabled: authed,
    staleTime: 60_000,
  });

  const payout = payoutsQ.data ?? null;
  const methods = methodsQ.data ?? [];
  const available = payout?.available_balance ?? 0;
  const minimum = payout?.minimum_withdraw ?? 0;
  /* The fee and the coin rate are the admin panel's, and `null` means "not
     known yet" rather than a guess. They used to default to 0 and 100: a
     missing fee rendered as "you receive $50" on a withdrawal that would pay
     $35, and a missing rate quoted a conversion Reelsoo might not offer. The
     blocker below keeps the button off while either is unknown. */
  const rate = payout?.commission_rate ?? null;
  const coinRate = payout?.coin_usd_rate ?? null;

  /*
   * Only EARNED coins are withdrawable.
   *
   * `coins_balance` is what the user bought, and bought coins are for spending -
   * they are not earnings and cashing them out would be a refund by another
   * route. `earned_coin_balance` is what gifts credited, and it is the figure
   * the payout wallet mirrors.
   */
  const earnedCoins = walletQ.data?.earned_coin_balance ?? 0;
  const spendableCoins = walletQ.data?.coin_balance ?? 0;

  // Default to the account's default method once they arrive.
  const selected = methodId ?? methods.find((m) => m.is_default)?.id ?? methods[0]?.id ?? null;
  const selectedMethod = methods.find((m) => m.id === selected) ?? null;

  /**
   * Preset amounts, scaled off the minimum rather than fixed at the design's
   * NPR figures: with a $50 floor, offering $1,000 to someone holding $60 is
   * three dead buttons. Only ones the balance can actually cover are shown.
   */
  const presets = useMemo(() => {
    // Scaled off the real floor only. The old `: 50` fallback offered $50 /
    // $100 / $200 chips on a platform whose minimum might be anything.
    if (minimum <= 0) return [];
    return [minimum, minimum * 2, minimum * 4].filter((n) => n <= available);
  }, [minimum, available]);

  // Default to the largest preset that fits, else the whole balance once it
  // clears the floor - never a number the button would then refuse.
  const chosen =
    amount ?? (presets.length ? presets[presets.length - 1] : available >= minimum ? available : 0);
  const commission = Math.round(chosen * (rate ?? 0)) / 100;
  const receives = Math.max(0, Math.round((chosen - commission) * 100) / 100);
  const stays = Math.max(0, Math.round((available - chosen) * 100) / 100);
  const pct = available > 0 ? Math.min(100, Math.round((chosen / available) * 100)) : 0;

  /* Why the button is off, in priority order - the same order requestWithdraw
     checks them, so the reason shown is the one that would come back. */
  const blocker = !payout
    ? "Payout details are unavailable right now."
    : rate === null || coinRate === null
      ? "Fee details are unavailable right now."
      : !payout.can_withdraw
      ? (payout.tax?.message ?? "Submit and get your tax form approved to withdraw.")
      : methods.length === 0
        ? "Add a payout method to withdraw."
        : available < minimum
          ? `You need at least ${money(minimum)} to withdraw.`
          : chosen < minimum
            ? `Minimum withdrawal is ${money(minimum)}.`
            : chosen > available
              ? "That's more than your available balance."
              : null;

  const submit = useCallback(() => {
    if (busy || blocker || !selectedMethod) return;
    setBusy(true);
    setNotice(null);
    // A stable key per attempt: without it a double-tap or a retry after a
    // timeout creates two payouts. The server replays the first on a repeat.
    const key = `wd-${Date.now()}-${Math.round(chosen * 100)}`;
    walletApi
      .withdraw(chosen, key)
      .then((r) => {
        setNotice(r.message ?? "Withdrawal requested.");
        void qc.invalidateQueries({ queryKey: ["wallet-payouts"] });
        void qc.invalidateQueries({ queryKey: ["wallet-summary"] });
      })
      .catch((e) => {
        // The gates all come back as 422 with the reason written out.
        const msg = (e as { response?: { data?: { message?: string } } })?.response?.data?.message;
        setNotice(msg ?? "Couldn't request that withdrawal. Please try again.");
      })
      .finally(() => setBusy(false));
  }, [busy, blocker, selectedMethod, chosen, qc]);

  const loading = payoutsQ.isLoading || methodsQ.isLoading;

  return (
    <View style={styles.root}>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.circleBtn} accessibilityRole="button" accessibilityLabel="Back">
          <BackGlyph />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Withdraw earnings</Text>
          <Text style={styles.sub}>{money(available)} available</Text>
        </View>
        <Pressable
          onPress={() => navigation.navigate("WalletHistory")}
          hitSlop={10}
          style={styles.circleBtn}
          accessibilityRole="button"
          accessibilityLabel="Payout history"
        >
          <HistoryGlyph />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 130 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={payoutsQ.isRefetching}
            onRefresh={() => {
              void payoutsQ.refetch();
              void methodsQ.refetch();
            }}
            tintColor={ds.textMuted}
          />
        }
      >
        {loading ? (
          <View style={styles.center}><ActivityIndicator color={ds.accent} /></View>
        ) : (
          <>
            {/* ── Amount card ────────────────────────────────────────── */}
            <View style={styles.card}>
              <View style={[styles.pill, !payout?.can_withdraw && styles.pillOff]}>
                <View style={[styles.pillDot, !payout?.can_withdraw && styles.pillDotOff]} />
                <Text style={styles.pillText}>
                  {payout?.can_withdraw ? "READY TO WITHDRAW" : "NOT READY"}
                </Text>
              </View>

              <View style={styles.amountRow}>
                <Text style={styles.amountCur}>$</Text>
                {/* To the cent. This was `groupNum`, which rounds: withdrawing
                    $49.60 put a giant "$50" directly above a line reading "of
                    $49.60 available". */}
                <Text style={styles.amountBig}>{plainUsd(chosen)}</Text>
              </View>
              <Text style={styles.amountOf}>of {money(available)} available</Text>

              {/* What is taken and what actually arrives. Gifts credited in
                  full, so this is the only place a fee appears. */}
              <View style={styles.breakdown}>
                <View style={styles.breakLeft}>
                  <View style={styles.coinBadge}><CoinGlyph /></View>
                  <View>
                    {/* Coins are the unit creators earn in, so the row leads
                        with them and states the rate it converted at. */}
                    <Text style={styles.breakTop}>
                      {coinRate === null ? "--" : `${groupNum(chosen * coinRate)} coins`}
                    </Text>
                    <Text style={styles.breakSub}>
                      {coinRate === null ? money(chosen) : `${groupNum(coinRate)} coins = $1 · ${money(chosen)}`}
                    </Text>
                  </View>
                </View>
                <ArrowGlyph />
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={styles.breakTop}>{money(receives)}</Text>
                  <Text style={styles.breakSub}>
                    {rate !== null && rate > 0 ? `after ${fmtPct(rate)}% fee` : "you receive"}
                  </Text>
                </View>
              </View>

              <View style={styles.track}>
                <View style={[styles.trackFill, { width: `${pct}%` }]} />
              </View>
              <View style={styles.trackLabels}>
                <Text style={styles.trackText}>{pct}% of balance</Text>
                <Text style={styles.trackText}>{money(stays)} stays</Text>
              </View>
            </View>

            {/* ── Amount chips ───────────────────────────────────────── */}
            <View style={styles.chips}>
              {presets.map((p) => {
                const on = chosen === p;
                return (
                  <Pressable
                    key={p}
                    onPress={() => setAmount(p)}
                    style={[styles.chip, on && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{money(p)}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                onPress={() => setAmount(available)}
                style={[styles.chip, chosen === available && available > 0 && styles.chipOn]}
                accessibilityRole="button"
              >
                <Text style={[styles.chipText, chosen === available && available > 0 && styles.chipTextOn]}>
                  Max
                </Text>
              </Pressable>
            </View>

            {/* ── Destination ────────────────────────────────────────── */}
            <View style={styles.sendHead}>
              <Text style={styles.sendLabel}>SEND TO</Text>
              <Pressable
                onPress={() => navigation.navigate("SettingsShell", { screen: "MonetizationSettings" })}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text style={styles.addNew}>Add new</Text>
              </Pressable>
            </View>

            {methods.length === 0 ? (
              <View style={styles.emptyMethods}>
                <Text style={styles.emptyTitle}>No payout method yet</Text>
                <Text style={styles.emptyBody}>
                  Add where you&apos;d like to be paid before requesting a withdrawal.
                </Text>
              </View>
            ) : (
              methods.map((m) => {
                const on = m.id === selected;
                return (
                  <Pressable
                    key={m.id}
                    onPress={() => setMethodId(m.id)}
                    style={[styles.method, on && styles.methodOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    <View style={[styles.methodIcon, on && styles.methodIconOn]}>
                      <MethodGlyph bank={isBank(m)} on={on} />
                    </View>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text style={[styles.methodName, on && styles.methodNameOn]} numberOfLines={1}>
                        {labelFor(m)}
                      </Text>
                      <Text style={[styles.methodSub, on && styles.methodSubOn]} numberOfLines={1}>
                        {[m.masked_account ?? m.account_email, m.is_default ? "default" : null]
                          .filter(Boolean)
                          .join(" · ")}
                      </Text>
                    </View>
                    <View style={[styles.radio, on && styles.radioOn]}>{on && <TickGlyph />}</View>
                  </Pressable>
                );
              })
            )}

            {!!notice && <Text style={styles.notice}>{notice}</Text>}

            {/* The rule creators most often trip on: a big coin balance is not
                a big withdrawable balance if most of it was bought. */}
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>What you can withdraw</Text>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Earned from gifts</Text>
                <Text style={styles.infoValue}>{groupNum(earnedCoins)} coins</Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Bought for spending</Text>
                <Text style={styles.infoValueMuted}>{groupNum(spendableCoins)} coins</Text>
              </View>
              <Text style={styles.infoNote}>
                Coins you top up are for sending gifts — they can&apos;t be withdrawn or refunded. Only coins
                you&apos;ve earned from gifts count towards your balance.
              </Text>
              <Text style={styles.infoNote}>
                Gifts are credited in full{coinRate === null ? "" : ` at ${groupNum(coinRate)} coins = $1`}. Teezer&apos;s
                {rate !== null && rate > 0 ? ` ${fmtPct(rate)}%` : ""} commission is deducted here, at withdrawal — never on the gift.
              </Text>
              {minimum > 0 && (
                <Text style={styles.infoNote}>
                  Minimum withdrawal is {money(minimum)}, and payouts need an approved tax form.
                </Text>
              )}
            </View>
          </>
        )}
      </ScrollView>

      {/* ── Confirm ──────────────────────────────────────────────────── */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
        {!!blocker && <Text style={styles.blocker}>{blocker}</Text>}
        <Pressable
          onPress={submit}
          disabled={!!blocker || busy}
          style={[styles.cta, (!!blocker || busy) && styles.ctaOff]}
          accessibilityRole="button"
        >
          {busy ? (
            <ActivityIndicator size="small" color={ds.onDark} />
          ) : (
            <Text style={styles.ctaText}>Withdraw {money(receives)}</Text>
          )}
        </Pressable>
        {!!selectedMethod && !blocker && (
          <Text style={styles.ctaSub}>
            To {labelFor(selectedMethod)} {selectedMethod.masked_account ?? selectedMethod.account_email ?? ""}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: ds.surface },

  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  circleBtn: {
    width: 36, height: 36, borderRadius: 999, backgroundColor: ds.surfaceSunken,
    alignItems: "center", justifyContent: "center",
  },
  title: { fontSize: 17, fontWeight: "800", color: ds.text },
  sub: { fontSize: 12.5, color: ds.accent, fontWeight: "600", marginTop: 1 },

  center: { paddingVertical: 60, alignItems: "center" },

  card: { margin: 16, borderRadius: 22, backgroundColor: CARD, padding: 18, gap: 10 },
  pill: {
    alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, height: 26, borderRadius: 999, backgroundColor: "rgba(255,255,255,.07)",
  },
  pillOff: { backgroundColor: "rgba(255,255,255,.06)" },
  pillDot: { width: 6, height: 6, borderRadius: 999, backgroundColor: GREEN },
  pillDotOff: { backgroundColor: ds.silver },
  pillText: { fontSize: 10, fontWeight: "800", color: "rgba(255,255,255,.85)", letterSpacing: 0.8 },

  amountRow: { flexDirection: "row", alignItems: "flex-start", justifyContent: "center", gap: 4, marginTop: 4 },
  amountCur: { fontSize: 18, fontWeight: "700", color: "rgba(255,255,255,.5)", marginTop: 8 },
  amountBig: { fontSize: 44, fontWeight: "800", color: ds.onDark, letterSpacing: -1.5, lineHeight: 50 },
  amountOf: { fontSize: 12.5, color: "rgba(255,255,255,.45)", textAlign: "center" },

  breakdown: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10,
    backgroundColor: CARD_SOFT, borderRadius: 14, padding: 12, marginTop: 6,
  },
  breakLeft: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 1 },
  coinBadge: {
    width: 30, height: 30, borderRadius: 999, backgroundColor: "#F5C451",
    alignItems: "center", justifyContent: "center",
  },
  breakTop: { fontSize: 14, fontWeight: "800", color: ds.onDark },
  breakSub: { fontSize: 11, color: "rgba(255,255,255,.45)", marginTop: 1 },

  track: { height: 5, borderRadius: 999, backgroundColor: "rgba(255,255,255,.12)", overflow: "hidden", marginTop: 8 },
  trackFill: { height: "100%", borderRadius: 999, backgroundColor: ds.accent },
  trackLabels: { flexDirection: "row", justifyContent: "space-between" },
  trackText: { fontSize: 11, color: "rgba(255,255,255,.45)" },

  chips: { flexDirection: "row", gap: 8, paddingHorizontal: 16, flexWrap: "wrap" },
  chip: {
    flexGrow: 1, minWidth: 72, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth, borderColor: ds.line, backgroundColor: ds.surface,
  },
  chipOn: { backgroundColor: ds.text, borderColor: ds.text },
  chipText: { fontSize: 13, fontWeight: "700", color: ds.text },
  chipTextOn: { color: ds.onDark },

  sendHead: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 16, paddingTop: 22, paddingBottom: 10,
  },
  sendLabel: { fontSize: 11, fontWeight: "800", color: ds.textMuted, letterSpacing: 1 },
  addNew: { fontSize: 12.5, fontWeight: "700", color: ds.accent },

  method: {
    flexDirection: "row", alignItems: "center", gap: 12,
    marginHorizontal: 16, marginBottom: 10, padding: 14, borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth, borderColor: ds.line, backgroundColor: ds.surface,
  },
  methodOn: { backgroundColor: CARD, borderColor: CARD },
  methodIcon: {
    width: 38, height: 38, borderRadius: 10, backgroundColor: ds.surfaceSunken,
    alignItems: "center", justifyContent: "center",
  },
  methodIconOn: { backgroundColor: "rgba(255,255,255,.1)" },
  methodName: { fontSize: 14, fontWeight: "700", color: ds.text },
  methodNameOn: { color: ds.onDark },
  methodSub: { fontSize: 12, color: ds.textMuted },
  methodSubOn: { color: "rgba(255,255,255,.5)" },
  radio: {
    width: 22, height: 22, borderRadius: 999, borderWidth: 1.6, borderColor: ds.lineStrong,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { backgroundColor: ds.accent, borderColor: ds.accent },

  emptyMethods: { paddingHorizontal: 16, paddingVertical: 18, gap: 4 },
  emptyTitle: { fontSize: 14, fontWeight: "700", color: ds.text },
  emptyBody: { fontSize: 12.5, color: ds.textMuted, lineHeight: 18 },

  notice: { fontSize: 12.5, color: ds.accent, paddingHorizontal: 16, paddingTop: 10, lineHeight: 18 },

  infoCard: {
    marginHorizontal: 16, marginTop: 20, padding: 16, borderRadius: 14,
    backgroundColor: ds.surfaceMuted, gap: 8,
  },
  infoTitle: { fontSize: 12.5, fontWeight: "700", color: ds.text },
  infoRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  infoLabel: { fontSize: 12.5, color: ds.textMuted },
  infoValue: { fontSize: 13, fontWeight: "700", color: ds.text },
  infoValueMuted: { fontSize: 13, fontWeight: "700", color: ds.textFaint },
  infoNote: { fontSize: 11.5, color: ds.textDim, lineHeight: 17 },

  footer: {
    paddingHorizontal: 16, paddingTop: 12, gap: 8,
    borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ds.lineSoft, backgroundColor: ds.surface,
  },
  blocker: { fontSize: 12, color: ds.textDim, textAlign: "center", lineHeight: 17 },
  cta: { height: 52, borderRadius: 999, backgroundColor: ds.accent, alignItems: "center", justifyContent: "center" },
  ctaOff: { opacity: 0.45 },
  ctaText: { fontSize: 15.5, fontWeight: "800", color: ds.onDark },
  ctaSub: { fontSize: 11.5, color: ds.textMuted, textAlign: "center" },
});
