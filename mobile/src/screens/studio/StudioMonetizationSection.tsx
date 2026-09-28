import { useMemo, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import Svg, { Circle, Defs, Path, RadialGradient, Stop } from "react-native-svg";
import {
  ChevronRight, Clock, Film, Gift, Handshake, Heart, Info, Layers, Store,
  UserRound, Wallet,
  type LucideIcon,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/Skeleton";
import { studioApi, type MonetizationOverview, type MonetizationRange } from "@/api/studio.api";
import { usePostViewer } from "@/store/post-viewer.store";
import { uiFor } from "./studio-programmes";
import {
  monetizationProgramsApi, type MonetizationProgram, type ProgramStatus,
} from "@/api/monetization-programs.api";
import { sd, sr } from "./studio-design";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import { pct, plainUsd, usd } from "@/utils/money";

/**
 * Teezer Studio → Monetization, drawn to the Claude Design prototype
 * "Teezer App.dc.html" (the `studioIsMonetization` panel, second revision).
 *
 * The prototype replaced the lock screen with a full earnings dashboard, and
 * this follows it block for block: the balance hero, the payout timeline, the
 * Earnings chart, Revenue mix, Top earning post, Programmes, Unlock Creator
 * Rewards, the two meta tiles and the commission footnote.
 *
 * `GET /studio/monetization/overview` is not gated server-side - it creates a
 * zero wallet for a creator who has never earned - so the page renders for
 * everyone and the unlock progress lives inside it, exactly as the prototype
 * has it. No separate locked screen.
 *
 * Two places the prototype's sample data does not describe this app, where the
 * layout is kept and the value corrected:
 *
 *  - The prototype prices everything in NPR. The platform is USD
 *    (`min_withdrawal_usd`, `coin_usd_rate`), so the hero's separated currency
 *    word reads USD.
 *  - The footnote's "30% platform commission" is read from the payload's
 *    `commission_rate` rather than typed in, because it is an admin setting
 *    that can change without anyone touching this file.
 */

/* ── Ranges ─────────────────────────────────────────────────────────────────── */

const RANGES: { value: MonetizationRange; label: string; short: string }[] = [
  { value: "7d",  label: "the last 7 days",  short: "7D"  },
  { value: "28d", label: "the last 28 days", short: "28D" },
  { value: "90d", label: "the last 90 days", short: "90D" },
];

/** The prototype's chart holds seven bars whatever the range. */
const BARS = 7;

/* Hexes the prototype uses on this page alone. `#E4E0E8` is its inactive track,
   `#6EC2FA` the blue it uses in the verification hero, `#C7C2CE` its chevrons. */
const BAR_IDLE = "#E4E0E8";
const BLUE = "#6EC2FA";
const CHEVRON = "#C7C2CE";
/** The waiting-room amber, for a programme that is neither open nor level-locked. */
const AMBER = "#B4720E";
const AMBER_WASH = "#FDF3E2";

/* ── Formatting ─────────────────────────────────────────────────────────────── */

/** "$1,480" - cents only when there are any, which is how the prototype reads. */
/* Money comes from the shared formatters, so a balance is spelled the same
   here, on the Withdraw screen and in the wallet. `plain` is the hero's -
   the currency word is set apart there, so its number carries no symbol. */
const money = usd;
const plain = plainUsd;
/** "Aug 2" from either an ISO date or the API's own "Aug 02, 2026". */
function shortDate(s?: string | null): string {
  if (!s) return "";
  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? s
    : d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ── Revenue mix ────────────────────────────────────────────────────────────── */

/** Each row is a real key on `revenue_sources`; nothing here is derived or padded. */
/**
 * The revenue mix, in the order and colours the design draws it: brand pink,
 * a lighter pink, ink, then grey.
 *
 * `color` is used by the stacked bar ONLY. The row icons are neutral ink on a
 * grey tile - a coloured glyph next to a coloured segment says the same thing
 * twice and turns the list into a paint chart. `note` is a count where the
 * payload carries one and a plain descriptor where it does not, never an
 * invented figure.
 */
const SOURCES: {
  key: keyof MonetizationOverview["revenue_sources"];
  label: string; note: string; color: string; icon: LucideIcon;
}[] = [
  { key: "live_gift",    label: "Gifts in Spaces", note: "Sent on lives and posts",   color: sd.accent,  icon: Gift },
  { key: "ad_revenue",   label: "Video gifts",     note: "Sent on your posts",         color: "#FF7B9C", icon: Heart },
  { key: "brand_collab", label: "Brand campaigns", note: "Paid partnerships",          color: sd.ink,    icon: Handshake },
  { key: "subscription", label: "Subscriptions",   note: "Monthly supporters",         color: sd.faint,  icon: UserRound },
  { key: "series",       label: "Series",          note: "Paid multi-part content",    color: "#C7C2CE", icon: Layers },
  // Same label as the programme itself (studio-programmes.ts's "affiliate"
  // entry) and CreatorEarning::sourceLabelMap() on the server, so a Shop sale
  // is named identically everywhere it shows up.
  { key: "shop",         label: "Sell on Teezer", note: "Products sold from your shop", color: "#8B5CF6", icon: Store },
];

/* ── Programmes ─────────────────────────────────────────────────────────────── */

// The five programmes and their per-page copy live in studio-programmes.ts, so
// this list and the detail screen can never describe a different programme.


/* ── Small pieces ───────────────────────────────────────────────────────────── */

/** The prototype's 52pt progress ring. RN has no conic-gradient, so it is an
 *  SVG arc - same read, and it anti-aliases properly. */
function Ring({ pct, label }: { pct: number; label: string }) {
  const r = 23;
  const c = 2 * Math.PI * r;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <View style={styles.ring}>
      <Svg width={52} height={52}>
        <Circle cx={26} cy={26} r={r} stroke={sd.fill} strokeWidth={6} fill="none" />
        <Circle
          cx={26} cy={26} r={r} stroke={sd.accent} strokeWidth={6} fill="none"
          strokeDasharray={`${c}`} strokeDashoffset={c * (1 - shown / 100)}
          strokeLinecap="round" transform="rotate(-90 26 26)"
        />
      </Svg>
      <View style={styles.ringInner}>
        <Text style={styles.ringText}>{label}</Text>
      </View>
    </View>
  );
}

function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

/* ── Screen ─────────────────────────────────────────────────────────────────── */

export function StudioMonetizationSection() {
  const navigation = useNavigation<any>();
  const [range, setRange] = useState<MonetizationRange>("28d");

  // Same keys the dashboard already uses, so at 28d this costs no extra request.
  const permsQ = useQuery({
    queryKey: ["studio-permissions"],
    queryFn: studioApi.permissions,
    staleTime: 5 * 60_000,
  });
  const q = useQuery({
    queryKey: ["studio-monetization", range],
    queryFn: () => studioApi.monetizationOverview(range),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });

  const data = q.data;

  /* The admin-controlled programme list, already measured against this
     creator. Disabled programmes are not in the payload at all. */
  const programsQ = useQuery({
    queryKey: ["monetization-programs"],
    queryFn: monetizationProgramsApi.list,
    staleTime: 60_000,
  });
  const programs: MonetizationProgram[] = programsQ.data?.programs ?? [];

  /**
   * The chart's seven bars. A 28- or 90-day series has far more points than
   * that, so days are summed into equal buckets and each bar is labelled with
   * the day it ENDS on - "the week ending Aug 2" rather than a day picked out
   * of the middle. A 7-day series passes through untouched.
   */
  const bars = useMemo(() => {
    const pts = data?.revenue_overview ?? [];
    if (pts.length === 0) return [] as { label: string; value: number }[];
    if (pts.length <= BARS) return pts.map((p) => ({ label: shortDate(p.date), value: p.amount }));
    const size = Math.ceil(pts.length / BARS);
    const out: { label: string; value: number }[] = [];
    for (let i = 0; i < pts.length; i += size) {
      const slice = pts.slice(i, i + size);
      out.push({
        label: shortDate(slice[slice.length - 1].date),
        value: slice.reduce((sum, p) => sum + p.amount, 0),
      });
    }
    return out;
  }, [data?.revenue_overview]);

  if (q.isLoading || (!data && !q.isError)) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Skeleton height={252} radius={24} />
        <View style={{ height: 12 }} />
        <Skeleton height={190} radius={sr.panel} />
        <View style={{ height: 26 }} />
        <Skeleton height={250} radius={sr.panel} />
        <View style={{ height: 26 }} />
        <Skeleton height={210} radius={sr.panel} />
      </ScrollView>
    );
  }

  if (q.isError || !data) {
    return (
      <View style={styles.errorBox}>
        <View style={styles.errorIcon}>
          <Wallet size={24} color={sd.faint} strokeWidth={1.9} />
        </View>
        <Text style={styles.errorTitle}>Monetization is unavailable</Text>
        <Text style={styles.errorText}>
          We couldn&apos;t load your earnings. Rather than show you a balance we can&apos;t
          stand behind, we&apos;d rather show you nothing.
        </Text>
        <Pressable style={styles.retryBtn} onPress={() => q.refetch()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const p = data.payouts;
  const sum = data.summary;
  const next = p.next_payout;
  const src = data.revenue_sources;
  const top = data.top_earning_content[0];
  const activeRange = RANGES.find((r) => r.value === range) ?? RANGES[1];
  const peak = bars.reduce((m, b) => Math.max(m, b.value), 0);


  /* The payout pipeline. `Earned` is always true - the money is in the wallet -
     and the other two read the scheduled payout's own status rather than being
     inferred from the date. */
  const st = (next?.status ?? "").toLowerCase();
  const paid = st === "paid" || st === "completed";
  const reviewing = paid || st === "processing" || st === "approved";
  const payoutSteps = [
    { label: "Earned",    sub: "In your wallet", done: true },
    { label: "In review", sub: "14-day hold",    done: reviewing },
    { label: "Paid out",  sub: next?.date ? shortDate(next.date) : "Not scheduled", done: paid },
  ];


  return (
    <>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={q.isFetching && !q.isLoading}
            onRefresh={() => { q.refetch(); permsQ.refetch(); }}
            tintColor={sd.accent}
          />
        }
      >
        {/* ── Balance hero ──────────────────────────────────────────── */}
        <View style={styles.hero}>
          <Svg width={250} height={250} style={styles.glowA} pointerEvents="none">
            <Defs>
              <RadialGradient id="monGlowA" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sd.accent} stopOpacity={0.34} />
                <Stop offset="0.66" stopColor={sd.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={125} cy={125} r={125} fill="url(#monGlowA)" />
          </Svg>
          <Svg width={230} height={230} style={styles.glowB} pointerEvents="none">
            <Defs>
              <RadialGradient id="monGlowB" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sd.upOnDark} stopOpacity={0.13} />
                <Stop offset="0.68" stopColor={sd.upOnDark} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={115} cy={115} r={115} fill="url(#monGlowB)" />
          </Svg>

          <View style={styles.heroTop}>
            <View style={styles.heroPill}>
              <View style={styles.heroDot} />
              <Text style={styles.heroPillText}>CREATOR BALANCE</Text>
            </View>
            <Pressable style={styles.heroHistory} onPress={() => navigation.navigate("StudioTransactions")}>
              <Clock size={12} color="#FFFFFF" strokeWidth={2.1} />
              <Text style={styles.heroHistoryText}>History</Text>
            </Pressable>
          </View>

          <View style={styles.heroAmountBlock}>
            <View style={styles.heroAmountRow}>
              <Text style={styles.heroCurrency}>USD</Text>
              <Text style={styles.heroAmount} numberOfLines={1}>{plain(p.available_balance)}</Text>
            </View>
            <Text style={styles.heroCaption}>Available to withdraw now</Text>
          </View>

          <View style={styles.split}>
            {[
              { label: "Pending",    value: money(p.pending_balance) },
              { label: "This month", value: money(sum.this_month.amount) },
              { label: "Lifetime",   value: money(p.lifetime_earnings) },
            ].map((k, i) => (
              <View key={k.label} style={[styles.splitCell, i > 0 && styles.splitDivider]}>
                <Text style={styles.splitValue} numberOfLines={1}>{k.value}</Text>
                <Text style={styles.splitLabel} numberOfLines={1}>{k.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.heroBtns}>
            {/* The Withdraw screen owns the tax-form and payout-method gates, so
                the button always opens it rather than going dead with no reason. */}
            <Pressable style={styles.withdrawBtn} onPress={() => navigation.navigate("Withdraw")}>
              <Text style={styles.withdrawText}>Withdraw</Text>
            </Pressable>
            <Pressable style={styles.methodBtn} onPress={() => navigation.navigate("PaymentMethods")}>
              <Text style={styles.methodText}>Payout method</Text>
            </Pressable>
          </View>
        </View>

        {/* ── Next payout ───────────────────────────────────────────── */}
        <View style={[styles.panel, { marginTop: 12, gap: 13 }]}>
          <View style={styles.rowBetween}>
            <Text style={styles.panelTitle}>Next payout</Text>
            <Text style={styles.eta}>
              {next
                ? next.days_until <= 0 ? "Today" : `in ${Math.round(next.days_until)} days`
                : "Not scheduled"}
            </Text>
          </View>

          <View style={styles.steps}>
            {payoutSteps.map((s, i) => (
              <View key={s.label} style={styles.step}>
                <View style={styles.stepTop}>
                  <View style={[styles.stepDot, s.done ? styles.stepDotOn : styles.stepDotOff]}>
                    {s.done && (
                      <Svg width={9} height={9} viewBox="0 0 24 24">
                        <Path d="M4 12.5l5 5L20 6.5" stroke="#FFFFFF" strokeWidth={3.4} fill="none" strokeLinecap="round" strokeLinejoin="round" />
                      </Svg>
                    )}
                  </View>
                  {i < payoutSteps.length - 1 && (
                    <View style={[styles.stepLine, s.done && styles.stepLineOn]} />
                  )}
                </View>
                <View style={styles.stepBody}>
                  <Text style={[styles.stepLabel, { color: s.done ? sd.text : sd.faint }]} numberOfLines={1}>{s.label}</Text>
                  <Text style={styles.stepSub} numberOfLines={1}>{s.sub}</Text>
                </View>
              </View>
            ))}
          </View>

          <Pressable style={styles.methodRow} onPress={() => navigation.navigate("PaymentMethods")}>
            <View style={styles.methodBadge}>
              <Text style={styles.methodBadgeText}>
                {(p.payment_method?.provider ?? "--").slice(0, 2).toUpperCase()}
              </Text>
            </View>
            <View style={styles.methodBody}>
              <Text style={styles.methodName} numberOfLines={1}>
                {p.payment_method
                  ? `${p.payment_method.provider} ${p.payment_method.masked_account}`
                  : "No payout method yet"}
              </Text>
              <Text style={styles.methodSub} numberOfLines={1}>
                {p.payment_method ? "Default payout method" : "Add one to get paid"}
              </Text>
            </View>
            <View style={styles.changeBtn}>
              <Text style={styles.changeText}>{p.payment_method ? "Change" : "Add"}</Text>
            </View>
          </Pressable>
        </View>

        {/* ── Earnings ──────────────────────────────────────────────── */}
        <View style={styles.headingRow}>
          <Text style={styles.heading}>Earnings</Text>
          <View style={styles.segmented}>
            {RANGES.map((r) => {
              const on = r.value === range;
              return (
                <Pressable
                  key={r.value}
                  style={[styles.segment, on && styles.segmentOn]}
                  onPress={() => setRange(r.value)}
                >
                  <Text style={[styles.segmentText, on && styles.segmentTextOn]}>{r.short}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={[styles.panel, { gap: 16 }]}>
          <View style={styles.chartHead}>
            <View style={{ flexShrink: 1 }}>
              <Text style={styles.chartLabel} numberOfLines={1}>Earned {activeRange.label}</Text>
              <Text style={styles.chartTotal} numberOfLines={1}>{money(sum.revenue_growth.current)}</Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 5 }}>
              <View style={[styles.trendPill, { backgroundColor: sum.revenue_growth.up ? sd.upWash : sd.downWash }]}>
                <Svg width={11} height={11} viewBox="0 0 24 24">
                  <Path
                    d={sum.revenue_growth.up ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"}
                    stroke={sum.revenue_growth.up ? sd.up : sd.down} strokeWidth={2.8} fill="none"
                    strokeLinecap="round" strokeLinejoin="round"
                  />
                </Svg>
                <Text style={[styles.trendText, { color: sum.revenue_growth.up ? sd.up : sd.down }]}>
                  {Math.abs(sum.revenue_growth.percentage)}%
                </Text>
              </View>
              <Text style={styles.compare} numberOfLines={1}>
                vs {money(sum.revenue_growth.previous)} before
              </Text>
            </View>
          </View>

          {bars.length === 0 || peak <= 0 ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyText}>No earnings in this period yet.</Text>
            </View>
          ) : (
            <View style={styles.bars}>
              {bars.map((b, i) => {
                const isPeak = b.value === peak;
                return (
                  <View key={`${b.label}-${i}`} style={styles.barCol}>
                    <Text style={styles.barCap} numberOfLines={1}>{isPeak ? money(b.value) : ""}</Text>
                    <View
                      style={[
                        styles.bar,
                        {
                          height: Math.max(4, (b.value / peak) * 74),
                          backgroundColor: isPeak ? sd.accent : BAR_IDLE,
                        },
                      ]}
                    />
                    <Text style={styles.barLabel} numberOfLines={1}>{b.label}</Text>
                  </View>
                );
              })}
            </View>
          )}

          <View style={styles.quickStats}>
            {[
              { label: "Average per day", value: money(sum.revenue_growth.current / Math.max(1, data.revenue_overview.length)) },
              { label: "Best day",        value: money(Math.max(0, ...data.revenue_overview.map((r) => r.amount))) },
            ].map((s) => (
              <View key={s.label} style={styles.quickStat}>
                <Text style={styles.quickLabel} numberOfLines={1}>{s.label}</Text>
                <Text style={styles.quickValue} numberOfLines={1}>{s.value}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Revenue mix ───────────────────────────────────────────── */}
        <SectionLabel>REVENUE MIX</SectionLabel>
        <View style={[styles.panel, { paddingBottom: 0 }]}>
          {src.total > 0 ? (
            <View style={styles.mixBar}>
              {SOURCES.filter((s) => src[s.key] > 0).map((s) => (
                <View key={s.key} style={{ flex: src[s.key], backgroundColor: s.color }} />
              ))}
            </View>
          ) : (
            <View style={styles.mixBar}>
              <View style={{ flex: 1, backgroundColor: sd.divider }} />
            </View>
          )}

          {SOURCES.map((s, i) => {
            const amount = src[s.key];
            const pct = src.total > 0 ? Math.round((amount / src.total) * 100) : 0;
            const Icon = s.icon;
            return (
              <View key={s.key} style={[styles.mixRow, i === SOURCES.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={styles.mixTile}>
                  <Icon size={18} color={sd.text} strokeWidth={2} />
                </View>
                <View style={styles.mixBody}>
                  <Text style={styles.mixLabel} numberOfLines={1}>{s.label}</Text>
                  <Text style={styles.mixNote} numberOfLines={1}>{s.note}</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 2 }}>
                  <Text style={styles.mixAmount} numberOfLines={1}>{money(amount)}</Text>
                  <Text style={styles.mixPct} numberOfLines={1}>{pct}%</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Top earning post ──────────────────────────────────────── */}
        <SectionLabel>TOP EARNING POST</SectionLabel>
        {top ? (
          <Pressable style={styles.topPost} onPress={() => usePostViewer.getState().showVideo(top.id)}>
            <View style={styles.topThumb}>
              {top.thumbnail_url ? (
                <Image source={top.thumbnail_url} style={styles.topThumbImg} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.topThumbImg, styles.topThumbFallback]}>
                  <Film size={16} color={sd.faint} />
                </View>
              )}
              <View style={styles.topRank}><Text style={styles.topRankText}>#1</Text></View>
            </View>
            <View style={styles.topBody}>
              <Text style={styles.topTitle} numberOfLines={1}>{top.title || "Untitled"}</Text>
              <Text style={styles.topMeta} numberOfLines={1}>
                {formatCompact(top.views)} views · RPM {money(top.rpm)}
              </Text>
              <View style={styles.topEarnRow}>
                <Text style={styles.topEarned} numberOfLines={1}>{money(top.revenue)}</Text>
                <View style={styles.topChip}><Text style={styles.topChipText}>EARNED</Text></View>
              </View>
            </View>
            <ChevronRight size={16} color={CHEVRON} strokeWidth={2.2} />
          </Pressable>
        ) : (
          <View style={styles.panel}>
            <Text style={styles.mixNote}>No post has earned yet in this period.</Text>
          </View>
        )}

        {/* ── Programmes ────────────────────────────────────────────── */}
        <SectionLabel>PROGRAMMES</SectionLabel>
        <View style={{ gap: 9 }}>
          {programs.map((prog) => {
            const state: ProgramStatus = prog.status;
            const Icon = uiFor(prog.key).icon;

            // Gifts shows what has actually been earned; everything else shows
            // how far along the creator is.
            const note =
              prog.key === "gifts"
                ? `${money(p.lifetime_earnings)} earned`
                : `${prog.met_count}/${prog.total_count} requirements met`;

            return (
              <Pressable
                key={prog.key}
                style={styles.progCard}
                // Every row opens its own page. All five programmes now have
                // a real, purpose-built destination instead of the generic
                // requirements-checklist template (StudioProgrammeScreen) -
                // Sell on Teezer's application + wizard; Gifts & Coins'
                // pitch + live requirements + "Get Coins Now"; Creator
                // Rewards/Subscriptions/Brand Marketplace's pitch + live
                // requirements + a real waitlist signup. The generic
                // template is now only reachable for a future sixth
                // programme an admin adds with no dedicated screen yet.
                onPress={() => {
                  if (prog.key === "affiliate") return navigation.navigate("SellerApplication");
                  if (prog.key === "gifts") return navigation.navigate("GiftsIntro");
                  if (prog.key === "rewards") return navigation.navigate("CreatorRewards");
                  if (prog.key === "subscriptions") return navigation.navigate("Subscriptions");
                  if (prog.key === "marketplace") return navigation.navigate("BrandMarketplace");
                  return navigation.navigate("StudioProgramme", { key: prog.key });
                }}
              >
                <View style={[styles.progTile, state === "active" && styles.progTileOn]}>
                  <Icon size={19} color={state === "active" ? sd.text : sd.faint} strokeWidth={2} />
                </View>
                <View style={styles.progBody}>
                  <Text style={styles.progLabel} numberOfLines={1}>{prog.label}</Text>
                  <Text style={styles.progSub}>{prog.description}</Text>
                  {!!note && (
                    <Text style={[styles.progNote, prog.key === "gifts" && styles.progNoteEarned]}>
                      {note}
                    </Text>
                  )}
                </View>
                <View style={[styles.chip, CHIP_BG[state]]}>
                  <Text style={[styles.chipText, CHIP_FG[state]]}>{CHIP_LABEL[state]}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>


        {/* ── Meta tiles ────────────────────────────────────────────── */}
        <View style={styles.metaRow}>
          {[
            { label: "Lifetime earnings", value: money(p.lifetime_earnings) },
            {
              label: "Last payout",
              // The scheduled payout is the only dated one the payload carries;
              // "--" rather than a guess when nothing has been paid.
              value: next ? `${money(next.amount)} · ${shortDate(next.date)}` : "--",
            },
          ].map((k) => (
            <View key={k.label} style={styles.metaTile}>
              <Text style={styles.metaLabel} numberOfLines={1}>{k.label}</Text>
              <Text style={styles.metaValue} numberOfLines={1}>{k.value}</Text>
            </View>
          ))}
        </View>

        {/* ── Footnote ──────────────────────────────────────────────── */}
        <View style={styles.footnote}>
          <Info size={14} color={sd.faint} strokeWidth={1.9} style={{ marginTop: 1 }} />
          <Text style={styles.footnoteText}>
            Earnings update daily and settle after a 14-day review. Teezer keeps
            {p.commission_rate == null ? " a" : ` a ${pct(p.commission_rate)}%`} platform
            commission, taken when you withdraw - gifts and coins credit in full.
          </Text>
        </View>
      </ScrollView>

    </>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingTop: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  /* Balance hero */
  hero: {
    borderRadius: 24, backgroundColor: sd.ink, overflow: "hidden",
    paddingHorizontal: 18, paddingTop: 20, paddingBottom: 18, gap: 18,
  },
  glowA: { position: "absolute", top: -110, right: -70 },
  glowB: { position: "absolute", bottom: -130, left: -80 },
  heroTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  heroPill: {
    flexDirection: "row", alignItems: "center", gap: 7,
    backgroundColor: "rgba(255,255,255,0.09)", paddingHorizontal: 11, paddingVertical: 6, borderRadius: sr.pill,
  },
  heroDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: sd.upOnDark },
  heroPillText: { fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 1.14, color: "rgba(255,255,255,0.72)" },
  heroHistory: {
    flexDirection: "row", alignItems: "center", gap: 5, borderRadius: sr.pill,
    paddingHorizontal: 12, paddingVertical: 7, backgroundColor: "rgba(255,255,255,0.11)",
  },
  heroHistoryText: { fontSize: 11.5, fontWeight: font.weightBold, color: "#FFFFFF" },

  heroAmountBlock: { gap: 5 },
  heroAmountRow: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  heroCurrency: { fontSize: 16, fontWeight: font.weightBold, color: "rgba(255,255,255,0.42)" },
  heroAmount: { fontSize: 44, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -2.2, lineHeight: 46 },
  heroCaption: { fontSize: 12.5, color: "rgba(255,255,255,0.5)" },

  split: { flexDirection: "row", borderRadius: 16, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  splitCell: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 12, paddingHorizontal: 6 },
  splitDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.07)" },
  splitValue: { fontSize: 15, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.28 },
  splitLabel: { fontSize: 10.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.45)" },

  heroBtns: { flexDirection: "row", gap: 8 },
  withdrawBtn: {
    flex: 1.4, height: 46, borderRadius: sr.pill, backgroundColor: sd.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: sd.accent, shadowOpacity: 0.32, shadowRadius: 20, shadowOffset: { width: 0, height: 8 }, elevation: 6,
  },
  withdrawText: { fontSize: 14, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.14 },
  methodBtn: {
    flex: 1, height: 46, borderRadius: sr.pill, backgroundColor: "rgba(255,255,255,0.13)",
    alignItems: "center", justifyContent: "center",
  },
  methodText: { fontSize: 13.5, fontWeight: font.weightBold, color: "#FFFFFF" },

  /* Panels */
  panel: { borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, padding: 16 },
  panelTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.2 },
  rowBetween: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  eta: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.accent },

  /* Payout timeline */
  steps: { flexDirection: "row", alignItems: "flex-start" },
  step: { flex: 1, minWidth: 0, gap: 7 },
  stepTop: { flexDirection: "row", alignItems: "center" },
  stepDot: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  stepDotOn: { backgroundColor: sd.ink },
  stepDotOff: { backgroundColor: sd.fill, borderWidth: 1, borderColor: sd.line },
  stepLine: { flex: 1, height: 2, backgroundColor: sd.divider, marginLeft: 2 },
  stepLineOn: { backgroundColor: sd.ink },
  stepBody: { gap: 2, paddingRight: 8 },
  stepLabel: { fontSize: 12.5, fontWeight: font.weightBold },
  stepSub: { fontSize: 11, color: sd.faint },

  methodRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: 13, paddingVertical: 11, borderRadius: 14, backgroundColor: sd.fillSoft,
  },
  methodBadge: {
    width: 30, height: 30, borderRadius: 9, backgroundColor: "#5AC17A",
    alignItems: "center", justifyContent: "center",
  },
  methodBadgeText: { fontSize: 11, fontWeight: font.weightHeavy, color: "#FFFFFF" },
  methodBody: { flex: 1, minWidth: 0, gap: 1 },
  methodName: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text },
  methodSub: { fontSize: 11.5, color: sd.muted },
  changeBtn: { borderRadius: sr.pill, backgroundColor: sd.page, paddingHorizontal: 13, paddingVertical: 7 },
  changeText: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.text },

  /* Earnings heading + chart */
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 26, paddingBottom: 10 },
  heading: { fontSize: 16.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.3 },
  segmented: { flexDirection: "row", gap: 4, backgroundColor: sd.fill, padding: 3, borderRadius: sr.pill },
  segment: { paddingHorizontal: 11, paddingVertical: 5, borderRadius: sr.pill },
  segmentOn: { backgroundColor: sd.page },
  segmentText: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted },
  segmentTextOn: { color: sd.text },

  chartHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  chartLabel: { fontSize: 12.5, fontWeight: font.weightMedium, color: sd.muted, marginBottom: 5 },
  chartTotal: { fontSize: 30, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -1.26, lineHeight: 29 },
  trendPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: sr.pill, paddingHorizontal: 9, paddingVertical: 5 },
  trendText: { fontSize: 11, fontWeight: font.weightHeavy },
  compare: { fontSize: 10.5, color: sd.faint },

  bars: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 110 },
  barCol: { flex: 1, height: "100%", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", gap: 7 },
  barCap: { fontSize: 9.5, fontWeight: font.weightHeavy, color: sd.text },
  bar: { width: "100%", borderRadius: 6 },
  barLabel: { fontSize: 9, fontWeight: font.weightBold, color: sd.faint },
  chartEmpty: { height: 110, alignItems: "center", justifyContent: "center" },
  chartEmptyText: { fontSize: 12.5, color: sd.muted },

  quickStats: { flexDirection: "row", gap: 9, paddingTop: 2, borderTopWidth: 1, borderTopColor: sd.divider },
  quickStat: { flex: 1, gap: 3, paddingTop: 12 },
  quickLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  quickValue: { fontSize: 16, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.38 },

  /* Section headings */
  sectionLabel: {
    fontSize: 12.5, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, paddingTop: 26, paddingBottom: 10,
  },

  /* Revenue mix */
  mixBar: { flexDirection: "row", height: 10, borderRadius: sr.pill, overflow: "hidden", gap: 2 },
  mixRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: sd.fillSoft },
  mixTile: { width: 38, height: 38, borderRadius: 12, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  mixBody: { flex: 1, minWidth: 0, gap: 2 },
  mixLabel: { fontSize: 14.5, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.15 },
  mixNote: { fontSize: 12, color: sd.muted },
  mixAmount: { fontSize: 14.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.22 },
  mixPct: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.faint },

  /* Top earning post */
  topPost: {
    flexDirection: "row", alignItems: "center", gap: 13,
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, padding: 14, backgroundColor: sd.page,
  },
  topThumb: { width: 56, height: 74, borderRadius: 12, overflow: "hidden", backgroundColor: sd.thumbA },
  topThumbImg: { width: "100%", height: "100%" },
  topThumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: sd.thumbB },
  topRank: { position: "absolute", top: 5, left: 5, backgroundColor: sd.accent, borderRadius: 5, paddingHorizontal: 5, paddingVertical: 2 },
  topRankText: { fontSize: 8.5, fontWeight: font.weightHeavy, letterSpacing: 0.51, color: "#FFFFFF" },
  topBody: { flex: 1, minWidth: 0, gap: 6 },
  topTitle: { fontSize: 14, fontWeight: font.weightBold, color: sd.text, lineHeight: 17.5 },
  topMeta: { fontSize: 12, color: sd.muted },
  topEarnRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  topEarned: { fontSize: 16, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.38 },
  topChip: { backgroundColor: sd.upWash, borderRadius: sr.pill, paddingHorizontal: 7, paddingVertical: 3 },
  topChipText: { fontSize: 10, fontWeight: font.weightHeavy, color: "#1F7A5A" },

  /* Programmes */
  progCard: {
    flexDirection: "row", alignItems: "center", gap: 13,
    borderWidth: 1, borderColor: sd.line, borderRadius: 18,
    paddingHorizontal: 15, paddingVertical: 15, backgroundColor: sd.page,
  },
  progTile: { width: 44, height: 44, borderRadius: 13, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  progTileOn: { backgroundColor: sd.fill },
  progBody: { flex: 1, minWidth: 0, gap: 3 },
  progLabel: { fontSize: 14.5, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.15 },
  progSub: { fontSize: 12.5, color: sd.muted, lineHeight: 17 },
  progNote: { fontSize: 12, fontWeight: font.weightBold, color: sd.faint },
  /** The one note that is money rather than a requirement, so it reads as good news. */
  progNoteEarned: { color: sd.up },
  chip: { borderRadius: sr.pill, paddingHorizontal: 10, paddingVertical: 5 },
  chipOn: { backgroundColor: sd.upWash },
  chipOff: { backgroundColor: sd.fill },
  chipWait: { backgroundColor: AMBER_WASH },
  chipText: { fontSize: 11, fontWeight: font.weightHeavy, letterSpacing: 0.4 },
  chipTextOn: { color: sd.up },
  chipTextOff: { color: sd.muted },
  chipTextWait: { color: AMBER },

  /* Unlock */
  unlockHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  ring: { width: 52, height: 52, alignItems: "center", justifyContent: "center" },
  ringInner: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
  ringText: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.text },
  unlockBody: { flex: 1, minWidth: 0, gap: 3 },
  unlockTitle: { fontSize: 13.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.2 },
  unlockSub: { fontSize: 11.5, color: sd.muted, lineHeight: 16.1 },

  reqRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  tick: { width: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  tickDone: { backgroundColor: sd.ink },
  tickTodo: { backgroundColor: sd.fill },
  tickNum: { fontSize: 10.5, fontWeight: font.weightHeavy, color: sd.faint },
  reqLabel: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: font.weightBold, color: sd.text },
  reqValue: { fontSize: 11.5, fontWeight: font.weightHeavy, color: sd.muted },
  reqTrack: { height: 6, borderRadius: sr.pill, backgroundColor: sd.fill, overflow: "hidden", marginLeft: 32 },
  reqFill: { height: "100%", borderRadius: sr.pill },
  reqCta: {
    height: 44, alignItems: "center", justifyContent: "center",
    borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line, backgroundColor: sd.page,
  },
  reqCtaText: { fontSize: 13, fontWeight: font.weightBold, color: sd.text },

  /* Meta tiles + footnote */
  metaRow: { flexDirection: "row", gap: 9, paddingTop: 14 },
  metaTile: { flex: 1, borderRadius: 16, backgroundColor: sd.fillSoft, paddingHorizontal: 14, paddingVertical: 13, gap: 4 },
  metaLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  metaValue: { fontSize: 16, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.38 },

  footnote: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingTop: 16 },
  footnoteText: { flex: 1, minWidth: 0, fontSize: 12.5, color: sd.muted, lineHeight: 17.25 },

  /* Error */
  errorBox: { alignItems: "center", gap: 8, paddingTop: 56, paddingHorizontal: 34 },
  errorIcon: { width: 56, height: 56, borderRadius: sr.pill, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  errorTitle: { fontSize: 15, fontWeight: font.weightBold, color: sd.text, textAlign: "center" },
  errorText: { fontSize: 13, color: sd.muted, lineHeight: 19.5, textAlign: "center" },
  retryBtn: { marginTop: 6, borderRadius: sr.pill, backgroundColor: sd.accent, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 13, fontWeight: font.weightBold, color: "#FFFFFF" },
});

/* The programme chip, by state. Declared AFTER `styles` because they read from
   it - a const above the StyleSheet would be evaluated before it exists. */
/* `eligible` and `coming_soon` share the amber chip: both mean the platform is
   not ready, not that the creator fell short. */
const CHIP_BG = {
  active: styles.chipOn, eligible: styles.chipWait, coming_soon: styles.chipWait,
  locked: styles.chipOff, disabled: styles.chipOff,
} as const;
const CHIP_FG = {
  active: styles.chipTextOn, eligible: styles.chipTextWait, coming_soon: styles.chipTextWait,
  locked: styles.chipTextOff, disabled: styles.chipTextOff,
} as const;
const CHIP_LABEL = {
  active: "ACTIVE", eligible: "ELIGIBLE", coming_soon: "COMING SOON",
  locked: "LOCKED", disabled: "UNAVAILABLE",
} as const;
