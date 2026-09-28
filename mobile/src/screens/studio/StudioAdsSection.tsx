import { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Image, Modal, Pressable, RefreshControl, ScrollView,
  Share, StyleSheet, Text, TextInput, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Svg, { Circle, Defs, RadialGradient, Stop } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ChevronRight, Clock, CreditCard, FileText, Megaphone, MoreHorizontal, Plus,
  Search, TrendingUp, Wallet, X,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { BottomSheet } from "@/components/BottomSheet";
import { Skeleton } from "@/components/Skeleton";
import { MenuRow, MenuDivider } from "@/components/sheet/MenuRow";
import {
  promotionApi, OBJECTIVES, objectiveLabel,
  type CreatePromotion, type Promotion, type PromotionCard, type PromotionObjective,
} from "@/api/promotion.api";
import { studioApi } from "@/api/studio.api";
import { adInsightsApi } from "@/api/ad-insights.api";
import { apiErrorMessage } from "@/api/client";
import { sd, sr } from "./studio-design";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";
import type { Video } from "@/types";
import { CreateCampaignWizard } from "./CreateCampaignWizard";
import { AdPolicyGate } from "./AdPolicyGate";
import { useOnboardingStore } from "@/store/onboarding.store";
import { AdDetailModal } from "./AdDetailModal";

type AdsFilter = "all" | "active" | "paused" | "ended";

/** The hero's range tabs. `days` is what the insights endpoint is asked for;
 *  "All time" is the server's own one-year cap, not an unbounded scan. */
const RANGES: { days: number; label: string; spoken: string }[] = [
  { days: 7,   label: "7 days",   spoken: "last 7 days" },
  { days: 28,  label: "28 days",  spoken: "last 28 days" },
  { days: 90,  label: "90 days",  spoken: "last 90 days" },
  { days: 365, label: "All time", spoken: "all time" },
];

const TABS: { key: AdsFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "paused", label: "Paused" },
  { key: "ended", label: "Ended" },
];

/** Placement keys the stats table records, in advertiser language. */
const PLACEMENT_LABEL: Record<string, string> = {
  feed: "In feed", explore: "Explore", search: "Search",
  profile: "Profiles", stories: "Stories",
};

/** Mirrors the server's own floor, shown as the design's footnote. */
const MIN_DAILY = 5;

const toNum = (v: string | number | null) => (typeof v === "string" ? parseFloat(v) : v) || 0;

const CUR: Record<string, string> = { USD: "$", INR: "₹", NPR: "Rs ", EUR: "€", GBP: "£", AED: "AED ", PKR: "Rs ", BDT: "৳ " };
const symOf = (c = "USD") => CUR[c] ?? `${c} `;

/** Format an amount (already in the currency's major unit) with grouped thousands. */
const money = (v: string | number, currency = "USD", decimals = 2) => {
  const n = typeof v === "string" ? parseFloat(v) : v;
  const [int, dec] = (Number.isFinite(n) ? n : 0).toFixed(decimals).split(".");
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${symOf(currency)}${grouped}${dec !== undefined ? "." + dec : ""}`;
};
/** Cents → money. */
const moneyC = (cents: number, currency = "USD") => money((cents || 0) / 100, currency);
/** Cost-per-result: show 4 decimals for sub-unit costs (e.g. ₹0.0502). */
const costC = (cents: number, currency = "USD") => {
  const v = (cents || 0) / 100;
  return money(v, currency, v > 0 && v < 1 ? 4 : 2);
};
const compact = (n: number) => n >= 1_000_000 ? (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M" : n >= 1_000 ? (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K" : String(n || 0);
/** Grouped whole number, for the hero where the currency sits in its own slot. */
const groupInt = (n: number) => Math.round(n || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");

/** Teezer Studio -> Teezer Ads.
 *
 *  Campaigns are `promotions` server-side. The table records an objective,
 *  targeting, budgets, dates and a status - and nothing about delivery. There is
 *  no impressions, clicks or spend column anywhere, so this screen does not show
 *  any: the numbers on each card are the promoted VIDEO's own counters, which are
 *  real, and the budget shown is what was committed, not what was burnt. */
export function StudioAdsSection({ initialPromoteVideo, onConsumedInitialPromoteVideo }: {
  /** A post handed in from elsewhere in Studio (Post Insights' "Promote this
   *  post") - opens the campaign wizard already pointed at it, same as
   *  picking it from "Promote a post" below, without asking the creator to
   *  pick it again. */
  initialPromoteVideo?: Video;
  onConsumedInitialPromoteVideo?: () => void;
} = {}) {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [policyGate, setPolicyGate] = useState(false);
  /** The post chosen on "Promote a post", handed to the wizard so it does not
   *  ask for it a second time. Null when creating from scratch. */
  const [promoteVideo, setPromoteVideo] = useState<Video | null>(null);
  // Gate the campaign wizard behind a one-time Advertising Policy acceptance:
  // the first time a creator taps Create, they must accept before proceeding.
  const startCreate = (video: Video | null = null) => {
    setPromoteVideo(video);
    if (useOnboardingStore.getState().seen["ads.policy"]) setCreateOpen(true);
    else setPolicyGate(true);
  };

  // Runs once, on mount only: this section remounts fresh every time the
  // creator switches to the Ads tab, so a plain mount effect is enough - and
  // exactly what's wanted, since consuming immediately clears the parent's
  // copy (see StudioScreen), so switching away and back later doesn't
  // reopen the wizard on a stale video.
  useEffect(() => {
    if (initialPromoteVideo) {
      startCreate(initialPromoteVideo);
      onConsumedInitialPromoteVideo?.();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [actionsFor, setActionsFor] = useState<Promotion | null>(null);
  const [editFor, setEditFor] = useState<Promotion | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [listOpen, setListOpen] = useState(false);
  const [listFilter, setListFilter] = useState<AdsFilter>("all");
  const [tab, setTab] = useState<AdsFilter>("all");
  const [rangeDays, setRangeDays] = useState<number>(28);
  const navigation = useNavigation<any>();

  const overviewQ = useQuery({
    queryKey: ["studio-ads-overview"],
    queryFn: promotionApi.overview,
    staleTime: 30_000,
  });

  /* Delivery (spend, impressions, clicks, CTR, conversions) lives in
     ad_stats_daily, not on the promotions table, so the hero and the KPI grid
     come from here while the campaign list keeps using the overview above. */
  const insightsQ = useQuery({
    queryKey: ["studio-ad-insights", rangeDays],
    queryFn: () => adInsightsApi.dashboard(rangeDays),
    staleTime: 30_000,
  });

  /* Posts to promote - the creator's own published videos, newest first. */
  const contentQ = useQuery({
    queryKey: ["studio-ads-promotable"],
    queryFn: () => studioApi.content({ status: "published", sort: "newest", per_page: 12 }),
    staleTime: 60_000,
  });

  const removeM = useMutation({
    mutationFn: (id: number) => promotionApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-ads-overview"] });
      setActionsFor(null);
    },
    onError: (e) => Alert.alert("Couldn't delete", apiErrorMessage(e, "Turn the ad off first, then you can delete it.")),
  });

  const duplicateM = useMutation({
    mutationFn: (p: Promotion) => promotionApi.create({
      video_id: p.video_id,
      objective: p.objective,
      daily_budget: toNum(p.daily_budget),
      total_budget: toNum(p.total_budget),
      country: p.country ?? undefined,
      city: p.city ?? undefined,
      region: p.region ?? undefined,
      target_lat: p.target_lat ?? undefined,
      target_lng: p.target_lng ?? undefined,
      target_radius_km: p.target_radius_km ?? undefined,
      age_range: p.age_range ?? undefined,
      gender: p.gender ?? undefined,
      interests: p.interests ?? undefined,
      duration_days: p.duration_days ?? undefined,
      status: "draft",
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["studio-ads-overview"] });
      setActionsFor(null);
      Alert.alert("Duplicated", "An editable draft copy was created.");
    },
    onError: (e) => Alert.alert("Couldn't duplicate", apiErrorMessage(e, "Please try again.")),
  });

  const shareCampaign = (p: Promotion) => {
    const label = p.video?.title || p.video?.caption || "my video";
    Share.share({ message: `Check out "${label}" on Teezer: https://teezer.live/video/${p.video_id}` }).catch(() => {});
    setActionsFor(null);
  };

  const openList = (f: AdsFilter) => { setListFilter(f); setListOpen(true); };

  const overview = overviewQ.data;
  const insights = insightsQ.data ?? null;
  const allCampaigns: PromotionCard[] = overview?.campaigns ?? [];

  const rangeLabel = RANGES.find((r) => r.days === rangeDays)?.spoken ?? "this period";

  /** Videos with no live campaign yet - the ones worth offering to promote. */
  const promoted = new Set(allCampaigns.map((c) => c.video_id));
  const promotable: Video[] = (contentQ.data?.data ?? []).filter((v: Video) => !promoted.has(v.id)).slice(0, 8);

  /** Placement share of impressions - the bars the design draws. */
  const placements = (() => {
    const rows = insights?.placements ?? [];
    const total = rows.reduce((n, r) => n + r.impressions, 0);
    if (!total) return [];
    return rows.slice(0, 5).map((r) => ({
      placement: PLACEMENT_LABEL[r.placement] ?? r.placement,
      pct: Math.round((r.impressions / total) * 100),
    }));
  })();

  const summary = overview?.summary;
  const currency = insights?.currency ?? summary?.currency ?? "USD";

  /* The design's four campaign tabs. `delivery` is the advertiser-facing status
     the server already derives, so these are a filter over real values rather
     than a second status vocabulary. */
  const bucketOf = (c: PromotionCard): AdsFilter =>
    c.delivery === "Active" ? "active"
      : c.delivery === "Off" ? "paused"
      : c.delivery === "Completed" ? "ended"
      : "all";
  const countIn = (f: AdsFilter) =>
    f === "all" ? allCampaigns.length : allCampaigns.filter((c) => bucketOf(c) === f).length;
  const campaigns = tab === "all" ? allCampaigns : allCampaigns.filter((c) => bucketOf(c) === tab);
  const running = allCampaigns.filter((c) => c.delivery === "Active").length;

  const t = insights?.tiles;
  const acct = insights?.account;

  /* The budget bar. "Used" is what this month actually cost; "left" is the ad
     account's real spendable balance from the ledger - not a target someone
     typed in, because nothing on the account stores a monthly cap. */
  const spentMonth = acct?.spent_this_month_cents ?? 0;
  const balance = acct?.balance_cents ?? 0;
  const budgetTotal = spentMonth + balance;
  const usedPct = budgetTotal > 0 ? Math.min(100, Math.round((spentMonth / budgetTotal) * 100)) : 0;

  const billingRows = [
    {
      key: "method", icon: CreditCard, label: "Payment method",
      sub: "Cards and payout accounts",
      act: () => navigation.navigate("PaymentMethods"),
    },
    {
      key: "billing", icon: FileText, label: "Billing & invoices",
      sub: `${moneyC(insights?.account.lifetime_spent_cents ?? 0, currency)} spent all time`,
      act: () => navigation.navigate("AdBilling"),
    },
    {
      key: "history", icon: Clock, label: "Payment history",
      sub: `${moneyC(spentMonth, currency)} this month`,
      act: () => navigation.navigate("AdPaymentHistory"),
    },
    {
      key: "account", icon: Wallet, label: "Ad account",
      sub: `${currency} · ${moneyC(balance, currency)} available`,
      act: () => navigation.navigate("AdAccount"),
    },
  ];

  const kpis = t ? [
    { key: "cpr",  label: "Cost per result", value: costC(t.cost_per_result_cents.value, currency), tile: t.cost_per_result_cents },
    { key: "conv", label: "Conversions",     value: compact(t.conversions.value),                   tile: t.conversions },
    { key: "spend", label: "Spent",          value: moneyC(t.spend_cents.value, currency),          tile: t.spend_cents },
    { key: "ctr",  label: "CTR",             value: `${t.ctr.value}%`,                              tile: t.ctr },
  ] : [];

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={s.body}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={overviewQ.isFetching && !overviewQ.isLoading}
            onRefresh={() => { overviewQ.refetch(); insightsQ.refetch(); }}
            tintColor={sd.accent}
          />
        }
      >
        {/* Create sits at the top where an ads manager is expected to put it -
            the campaign list below can be long, and burying the only way to
            start a campaign under it is not a real entry point. */}
        <View style={s.topBar}>
          <Text style={s.topTitle}>Ads Manager</Text>
          <Pressable
            style={({ pressed }) => [s.createBtn, pressed && { opacity: 0.85 }]}
            onPress={() => startCreate()}
            hitSlop={8}
            accessibilityLabel="Create ad campaign"
          >
            <Plus size={20} color="#FFFFFF" strokeWidth={2.8} />
          </Pressable>
        </View>

        {/* ── Hero ──────────────────────────────────────────────────────── */}
        <View style={s.hero}>
          <Svg width={260} height={260} style={s.glow} pointerEvents="none">
            <Defs>
              <RadialGradient id="adsGlow" cx="50%" cy="50%" r="50%">
                <Stop offset="0" stopColor={sd.accent} stopOpacity={0.3} />
                <Stop offset="0.66" stopColor={sd.accent} stopOpacity={0} />
              </RadialGradient>
            </Defs>
            <Circle cx={130} cy={130} r={130} fill="url(#adsGlow)" />
          </Svg>

          <View style={s.rangeBar}>
            {RANGES.map((r) => {
              const on = r.days === rangeDays;
              return (
                <Pressable key={r.days} style={[s.rangeTab, on && s.rangeTabOn]} onPress={() => setRangeDays(r.days)}>
                  <Text style={[s.rangeText, on && s.rangeTextOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>

          <View style={s.heroTop}>
            <View style={{ minWidth: 0, gap: 6 }}>
              <Text style={s.heroLabel} numberOfLines={1}>Ad spend · {rangeLabel}</Text>
              <View style={s.heroAmount}>
                <Text style={s.heroCur}>{symOf(currency).trim()}</Text>
                {insightsQ.isLoading
                  ? <Skeleton width={110} height={38} radius={8} />
                  : <Text style={s.heroValue}>{groupInt((t?.spend_cents.value ?? 0) / 100)}</Text>}
              </View>
            </View>

            {!!t && (
              <View style={[s.roas, !t.spend_cents.positive && s.roasDown]}>
                <TrendingUp size={11} color={t.spend_cents.positive ? sd.upOnDark : sd.down} strokeWidth={2.8} />
                <Text style={[s.roasText, !t.spend_cents.positive && { color: sd.down }]}>
                  {t.spend_cents.delta_pct > 0 ? "+" : ""}{t.spend_cents.delta_pct}% vs prev
                </Text>
              </View>
            )}
          </View>

          <View style={s.budgetWrap}>
            <View style={s.budgetTrack}>
              <View style={[s.budgetFill, { width: `${usedPct}%` }]} />
            </View>
            <View style={s.budgetRow}>
              <Text style={s.budgetUsed}>{usedPct}% of this month's funds used</Text>
              <Text style={s.budgetLeft}>{moneyC(balance, currency)} left</Text>
            </View>
          </View>

          <View style={s.strip}>
            <StripCell value={t ? compact(t.impressions.value) : null} label="Impressions" />
            <StripCell value={t ? compact(t.clicks.value) : null} label="Clicks" divider />
            <StripCell value={t ? `${t.ctr.value}%` : null} label="CTR" divider />
          </View>
        </View>

        {/* ── Performance ───────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Performance</Text>
        <View style={s.kpiGrid}>
          {insightsQ.isLoading
            ? [0, 1, 2, 3].map((i) => <View key={i} style={s.kpiCard}><Skeleton height={54} radius={8} /></View>)
            : kpis.map((k) => (
                <Pressable key={k.key} style={s.kpiCard} onPress={() => openList("all")}>
                  <Text style={s.kpiLabel} numberOfLines={1}>{k.label}</Text>
                  <Text style={s.kpiValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{k.value}</Text>
                  <View style={s.kpiDeltaRow}>
                    <Text style={[s.kpiDelta, k.tile.positive ? s.kpiUp : s.kpiDown]}>
                      {k.tile.delta_pct > 0 ? "+" : ""}{k.tile.delta_pct}%
                    </Text>
                    <Text style={s.kpiVs}>vs prev</Text>
                  </View>
                </Pressable>
              ))}
        </View>

        {/* ── Campaigns ─────────────────────────────────────────────────── */}
        <View style={s.sectionHeadRow}>
          <Text style={s.sectionLabelInline}>Campaigns</Text>
          <Pressable onPress={() => openList("all")} hitSlop={8}>
            <Text style={s.sectionCount}>{running} running</Text>
          </Pressable>
        </View>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={s.tabScroll}
          contentContainerStyle={s.tabRow}
        >
          {TABS.map((f) => {
            const on = f.key === tab;
            return (
              <Pressable key={f.key} style={[s.tab, on && s.tabOn]} onPress={() => setTab(f.key)}>
                <Text style={[s.tabText, on && s.tabTextOn]}>{f.label}</Text>
                <View style={[s.tabCount, on && s.tabCountOn]}>
                  <Text style={[s.tabCountText, on && s.tabCountTextOn]}>{countIn(f.key)}</Text>
                </View>
              </Pressable>
            );
          })}
          {/* Kept so a campaign can still be created when nothing is promotable. */}
          <Pressable style={s.newPill} onPress={() => startCreate()}>
            <Plus size={13} color={sd.accent} strokeWidth={2.8} />
            <Text style={s.newPillText}>New</Text>
          </Pressable>
        </ScrollView>

        {overviewQ.isLoading ? (
          <View style={{ gap: 9 }}>
            {[0, 1, 2].map((i) => <Skeleton key={i} height={188} radius={20} />)}
          </View>
        ) : campaigns.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyIcon}>
              <Megaphone size={24} color="#C7C2CE" strokeWidth={1.9} />
            </View>
            <Text style={s.emptyTitle}>No campaigns here</Text>
            <Text style={s.emptySub}>
              {tab === "all"
                ? "Promote a video to reach people beyond your followers."
                : "Nothing matches this filter right now."}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 9 }}>
            {campaigns.map((c) => (
              <CampaignCard
                key={c.id}
                c={c}
                currency={currency}
                onMore={() => setActionsFor(c)}
                onOpen={() => setDetailId(c.id)}
              />
            ))}
          </View>
        )}

        {/* ── Promote a post ────────────────────────────────────────────── */}
        {promotable.length > 0 && (
          <>
            <Text style={s.sectionLabel}>Promote a post</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={s.promoScroll}
              contentContainerStyle={s.promoRow}
            >
              {promotable.map((v) => (
                <Pressable key={v.id} style={s.promoCard} onPress={() => startCreate(v)}>
                  {v.thumbnail_url
                    ? <Image source={{ uri: v.thumbnail_url }} style={s.promoThumb} />
                    : <View style={[s.promoThumb, s.promoThumbFallback]} />}
                  <View style={{ gap: 3 }}>
                    <Text style={s.promoTitle} numberOfLines={1}>{v.title || v.caption || "Untitled"}</Text>
                    <Text style={s.promoMeta} numberOfLines={1}>
                      {formatCompact(v.views_count)} views · {formatCompact(v.likes_count)} likes
                    </Text>
                  </View>
                  <View style={s.promoBtn}><Text style={s.promoBtnText}>Promote</Text></View>
                </Pressable>
              ))}
            </ScrollView>
          </>
        )}

        {/* ── Where ads were shown ──────────────────────────────────────── */}
        {!!placements.length && (
          <>
            {/* The design calls this "Audience reached". Nothing on the server
                records who was reached - only WHERE an ad ran - so the block
                keeps the design and is named for the data behind it. */}
            <Text style={s.sectionLabel}>Where your ads ran</Text>
            <View style={s.audienceCard}>
              {placements.map((p) => (
                <View key={p.placement} style={s.audienceRow}>
                  <Text style={s.audienceName} numberOfLines={1}>{p.placement}</Text>
                  <View style={s.audienceTrack}>
                    <View style={[s.audienceFill, { width: `${p.pct}%` }]} />
                  </View>
                  <Text style={s.audiencePct}>{p.pct}%</Text>
                </View>
              ))}
            </View>
          </>
        )}

        {/* ── Billing ───────────────────────────────────────────────────── */}
        <Text style={s.sectionLabel}>Billing</Text>
        <View style={s.billCard}>
          {billingRows.map((b, i) => (
            <Pressable
              key={b.key}
              style={[s.billRow, i === billingRows.length - 1 && s.billRowLast]}
              onPress={b.act}
            >
              <View style={s.billIcon}><b.icon size={16} color={sd.slate} strokeWidth={2.1} /></View>
              <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                <Text style={s.billLabel} numberOfLines={1}>{b.label}</Text>
                <Text style={s.billSub} numberOfLines={1}>{b.sub}</Text>
              </View>
              <ChevronRight size={15} color="#C7C2CE" strokeWidth={2.2} />
            </Pressable>
          ))}
        </View>

        <Text style={s.footNote}>Minimum budget {money(MIN_DAILY, currency, 0)} per day</Text>
      </ScrollView>

      {/* Campaign actions */}
      <BottomSheet visible={!!actionsFor} onClose={() => setActionsFor(null)} scrollable={false}>
        {!!actionsFor && (
          <View style={s.sheetPad}>
            {!!actionsFor.rejection_reason && (
              <View style={s.rejectBox}>
                <Text style={s.rejectLabel}>Rejected</Text>
                <Text style={s.rejectText}>{actionsFor.rejection_reason}</Text>
              </View>
            )}
            <MenuRow
              icon="information-circle-outline"
              title={objectiveLabel(actionsFor.objective)}
              subtitle={`${money(actionsFor.daily_budget, actionsFor.currency)} / day · ${money(actionsFor.total_budget, actionsFor.currency)} total`}
            />
            <MenuDivider />
            <MenuRow icon="create-outline" title="Edit" arrow
              onPress={() => { const p = actionsFor; setActionsFor(null); setEditFor(p); }} />
            <MenuRow icon="copy-outline" title="Duplicate" subtitle="Create an editable draft copy"
              loading={duplicateM.isPending} onPress={() => duplicateM.mutate(actionsFor)} />
            <MenuRow icon="albums-outline" title="View Ad Details" subtitle="Setup, delivery & results" arrow
              onPress={() => { const p = actionsFor; setActionsFor(null); setDetailId(p.id); }} />
            <MenuRow icon="share-social-outline" title="Share" onPress={() => shareCampaign(actionsFor)} />
            <MenuDivider />
            <MenuRow
              icon="trash-outline"
              title="Delete campaign"
              subtitle="Turn a live ad off first, then delete"
              destructive
              loading={removeM.isPending}
              onPress={() => {
                if (actionsFor.status === "active") {
                  Alert.alert("Turn the ad off first", "This ad is live. Turn it off from Ad Details, then you can delete it.");
                  return;
                }
                Alert.alert("Delete campaign", "This can't be undone.", [
                  { text: "Cancel", style: "cancel" },
                  { text: "Delete", style: "destructive", onPress: () => removeM.mutate(actionsFor.id) },
                ]);
              }}
            />
          </View>
        )}
      </BottomSheet>

      <EditCampaignSheet
        promo={editFor}
        onClose={() => setEditFor(null)}
        onSaved={() => { setEditFor(null); qc.invalidateQueries({ queryKey: ["studio-ads-overview"] }); Alert.alert("Saved", "Your campaign was updated."); }}
      />
      <AdDetailModal
        promotionId={detailId}
        currency={currency}
        onClose={() => setDetailId(null)}
        onEdit={(p) => { setDetailId(null); setEditFor(p); }}
        onDuplicate={(p) => { setDetailId(null); duplicateM.mutate(p); }}
        onMore={(p) => { setDetailId(null); setActionsFor(p); }}
      />
      <AdsManagerModal
        visible={listOpen}
        onClose={() => setListOpen(false)}
        campaigns={allCampaigns}
        currency={currency}
        initialFilter={listFilter}
        onMore={(p) => { setListOpen(false); setActionsFor(p); }}
        onOpen={(p) => { setListOpen(false); setDetailId(p.id); }}
      />

      <AdPolicyGate
        visible={policyGate}
        onClose={() => setPolicyGate(false)}
        onAccept={() => { useOnboardingStore.getState().markSeen("ads.policy"); setPolicyGate(false); setCreateOpen(true); }}
      />

      <CreateCampaignWizard
        visible={createOpen}
        initialVideo={promoteVideo}
        onClose={() => { setCreateOpen(false); setPromoteVideo(null); }}
        onCreated={() => {
          setCreateOpen(false);
          setPromoteVideo(null);
          qc.invalidateQueries({ queryKey: ["studio-ads-overview"] });
          qc.invalidateQueries({ queryKey: ["studio-ad-insights"] });
        }}
      />
    </View>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────────── */
const DELIVERY_DOT: Record<string, string> = {
  Active: "#22c55e", Off: "#9ca3af", Completed: "#9ca3af",
  "In review": "#f59e0b", Rejected: "#ef4444", "Needs changes": "#f97316",
};
const SHORT_OBJ: Record<string, string> = {
  more_views: "Engagement", more_engagement: "Engagement", more_followers: "Followers", more_profile_visits: "Profile visits",
};

/** Meta-style campaign card: status tag, title, delivery · objective, then a
 *  three-up metrics row (results / cost-per-result / spent) - all real data. */
function CampaignCard({ c, currency, onMore, onOpen }: { c: PromotionCard; currency: string; onMore: () => void; onOpen?: () => void }) {
  const v = c.video;
  const title = v?.title || v?.caption || `Campaign #${c.id}`;

  // Budget burn. `total_budget` is what was committed at create time and
  // `spent_cents` is what has actually been billed, so the bar is real.
  const budget = toNum(c.total_budget);
  const spent = (c.spent_cents || 0) / 100;
  const pct = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0;
  const dot = DELIVERY_DOT[c.delivery] ?? "#9ca3af";

  // The design's primary button changes verb with the campaign's state. Every
  // one of them opens Ad Details, which is where start/stop actually lives -
  // this card does not mutate delivery behind a single tap.
  const primary =
    c.delivery === "Active" ? "Pause"
      : c.delivery === "Off" ? "Resume"
      : c.delivery === "Completed" ? "Duplicate"
      : "Manage";

  return (
    <Pressable style={s.campaign} onPress={onOpen} disabled={!onOpen}>
      <View style={s.campTop}>
        {v?.thumbnail_url ? (
          <Image source={{ uri: v.thumbnail_url }} style={s.thumb} />
        ) : (
          <View style={[s.thumb, s.thumbEmpty]}><Megaphone size={16} color={sd.faint} /></View>
        )}

        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text style={s.campaignTitle} numberOfLines={1}>{title}</Text>
          <View style={s.deliveryRow}>
            <View style={[s.dot, { backgroundColor: dot }]} />
            <Text style={[s.deliveryText, { color: dot }]} numberOfLines={1}>{c.delivery}</Text>
            {!!c.tag && (
              <>
                <Text style={s.deliverySep}>·</Text>
                <Text style={s.deliveryMeta} numberOfLines={1}>{c.tag}</Text>
              </>
            )}
          </View>
        </View>

        <Pressable hitSlop={10} onPress={onMore} style={s.moreBtn}>
          <MoreHorizontal size={15} color="#C7C2CE" strokeWidth={2.4} />
        </Pressable>
      </View>

      <View style={{ gap: 7 }}>
        <View style={s.campTrack}>
          <View style={[s.campFill, { width: `${pct}%`, backgroundColor: c.delivery === "Active" ? sd.accent : "#C7C2CE" }]} />
        </View>
        <View style={s.campBudgetRow}>
          <Text style={s.campBudget} numberOfLines={1}>
            {moneyC(c.spent_cents, currency)} of {money(budget, c.currency ?? currency, 0)}
          </Text>
          <Text style={s.campObjective} numberOfLines={1}>{SHORT_OBJ[c.objective] ?? objectiveLabel(c.objective)}</Text>
        </View>
      </View>

      <View style={s.metricsRow}>
        <MetricCell value={compact(c.result_count)} label={c.result_label} />
        <MetricCell value={costC(c.cost_per_result_cents, currency)} label={`Cost per ${c.result_label.replace(/s$/, "")}`} />
        <MetricCell value={moneyC(c.spent_cents, currency)} label="Spent" />
      </View>

      <View style={s.campActions}>
        <Pressable style={s.campPrimary} onPress={onOpen}>
          <Text style={s.campPrimaryText}>{primary}</Text>
        </Pressable>
        <Pressable style={s.campGhost} onPress={onOpen}>
          <Text style={s.campGhostText}>See results</Text>
        </Pressable>
      </View>
    </Pressable>
  );
}

/** One cell of the hero's stat strip. */
function StripCell({ value, label, divider }: { value: string | null; label: string; divider?: boolean }) {
  return (
    <View style={[s.stripCell, divider && s.stripDivider]}>
      {value === null
        ? <Skeleton width={38} height={14} radius={4} />
        : <Text style={s.stripValue} numberOfLines={1}>{value}</Text>}
      <Text style={s.stripLabel} numberOfLines={1}>{label}</Text>
    </View>
  );
}

function MetricCell({ value, label }: { value: string; label: string }) {
  return (
    <View style={s.metricCell}>
      <Text style={s.metricValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>{value}</Text>
      <Text style={s.metricLabel} numberOfLines={2}>{label}</Text>
    </View>
  );
}

/* ── Edit ─────────────────────────────────────────────────────────────────── */
function EditCampaignSheet({ promo, onClose, onSaved }: {
  promo: Promotion | null; onClose: () => void; onSaved: () => void;
}) {
  const editable = !!promo && (promo.status === "draft" || promo.status === "rejected");
  const [daily, setDaily] = useState("");
  const [days, setDays] = useState("");
  useEffect(() => {
    if (promo) { setDaily(String(toNum(promo.daily_budget) || 5)); setDays(String(promo.duration_days ?? 7)); }
  }, [promo]);

  const saveM = useMutation({
    mutationFn: () => {
      const d = parseFloat(daily) || 0;
      const n = parseInt(days, 10) || 0;
      return promotionApi.update(promo!.id, { daily_budget: d, total_budget: d * n, duration_days: n });
    },
    onSuccess: onSaved,
    onError: (e) => Alert.alert("Couldn't save", apiErrorMessage(e, "Only draft or rejected campaigns can be edited.")),
  });

  const total = (parseFloat(daily) || 0) * (parseInt(days, 10) || 0);

  return (
    <BottomSheet visible={!!promo} onClose={onClose} height={0.5} scrollable={false} keyboardAvoid
      header={
        <View style={s.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={s.sheetTitle}>Edit campaign</Text>
            <Text style={s.sheetSub}>{promo ? objectiveLabel(promo.objective) : ""}</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose} style={s.sheetClose}><Ionicons name="close" size={19} color={colors.textSecondary} /></Pressable>
        </View>
      }>
      <View style={s.sheetPad}>
        {!editable ? (
          <Text style={s.formNote}>Only draft or rejected campaigns can be edited. To change a live campaign, duplicate it and edit the copy.</Text>
        ) : (
          <>
            <Text style={s.formLabel}>Budget</Text>
            <View style={s.budgetFieldsRow}>
              <View style={s.budgetField}><Text style={s.budgetKey}>Daily ($)</Text><TextInput value={daily} onChangeText={setDaily} keyboardType="decimal-pad" style={s.budgetInput} placeholderTextColor={colors.textFaint} /></View>
              <View style={s.budgetField}><Text style={s.budgetKey}>Days</Text><TextInput value={days} onChangeText={setDays} keyboardType="number-pad" style={s.budgetInput} placeholderTextColor={colors.textFaint} /></View>
            </View>
            <View style={s.totalRow}><Text style={s.totalKey}>Total budget</Text><Text style={s.totalVal}>{money(total)}</Text></View>
            <Pressable style={[s.submit, saveM.isPending && s.submitOff]} disabled={saveM.isPending} onPress={() => saveM.mutate()}>
              {saveM.isPending ? <ActivityIndicator color={colors.white} /> : <Text style={s.submitText}>Save changes</Text>}
            </Pressable>
          </>
        )}
      </View>
    </BottomSheet>
  );
}

/* ── Ads Manager (FB-style full list, opened from the "Ads running" stat) ───── */
function AdsManagerModal({ visible, onClose, campaigns, currency, initialFilter, onMore, onOpen }: {
  visible: boolean; onClose: () => void; campaigns: PromotionCard[]; currency: string; initialFilter: AdsFilter; onMore: (p: Promotion) => void; onOpen: (p: Promotion) => void;
}) {
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<AdsFilter>(initialFilter);
  useEffect(() => { if (visible) setFilter(initialFilter); }, [visible, initialFilter]);

  const TABS: { id: AdsFilter; label: string }[] = [
    { id: "all", label: "All" }, { id: "active", label: "Active" }, { id: "paused", label: "Paused" }, { id: "ended", label: "Ended" },
  ];
  const shown = campaigns.filter((c) =>
    filter === "all" ? true
      : filter === "active" ? c.status === "active"
      : filter === "paused" ? c.status === "paused"
      : ["completed", "rejected"].includes(c.status));

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[s.mgr, { paddingTop: insets.top }]}>
        <View style={s.mgrTop}>
          <Pressable hitSlop={10} onPress={onClose} style={s.mgrTopIcon}><X size={22} color={colors.text} /></Pressable>
          <Text style={s.mgrTitle}>Ads Manager</Text>
          <View style={{ width: 30 }} />
        </View>
        <View style={s.mgrTabs}>
          {TABS.map((t) => (
            <Pressable key={t.id} style={[s.mgrTab, filter === t.id && s.mgrTabOn]} onPress={() => setFilter(t.id)}>
              <Text style={[s.mgrTabText, filter === t.id && s.mgrTabTextOn]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
        <ScrollView contentContainerStyle={{ padding: spacing.lg, gap: spacing.sm, paddingBottom: insets.bottom + spacing.xl }} showsVerticalScrollIndicator={false}>
          {shown.length === 0 ? (
            <View style={s.empty}><View style={s.emptyIcon}><Megaphone size={22} color={colors.textFaint} /></View><Text style={s.emptySub}>No campaigns here yet.</Text></View>
          ) : shown.map((c) => <CampaignCard key={c.id} c={c} currency={currency} onMore={() => onMore(c)} onOpen={() => onOpen(c)} />)}
        </ScrollView>
      </View>
    </Modal>
  );
}

/* ── Create ───────────────────────────────────────────────────────────────── */
function CreateCampaignSheet({
  visible, onClose, onCreated,
}: {
  visible: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [video, setVideo] = useState<Video | null>(null);
  const [objective, setObjective] = useState<PromotionObjective>("more_views");
  const [daily, setDaily] = useState("5");
  const [days, setDays] = useState("7");
  const [videoPickOpen, setVideoPickOpen] = useState(false);

  const contentQ = useQuery({
    queryKey: ["studio-content", "promotable"],
    queryFn: () => studioApi.content({ status: "published", per_page: 50 }),
    enabled: visible,
    staleTime: 60_000,
  });

  const dailyNum = parseFloat(daily) || 0;
  const daysNum = parseInt(days, 10) || 0;
  const total = dailyNum * daysNum;
  const valid = !!video && dailyNum >= 1 && daysNum >= 1 && total >= 1;

  const createM = useMutation({
    mutationFn: (body: CreatePromotion) => promotionApi.create(body),
    onSuccess: (r) => {
      Alert.alert("Campaign submitted", r.message ?? "Your campaign is in review.");
      setVideo(null);
      setDaily("5");
      setDays("7");
      onCreated();
    },
    onError: (e) => Alert.alert("Couldn't create the campaign", apiErrorMessage(e, "Please try again.")),
  });

  const submit = () => {
    if (!valid || !video) return;
    createM.mutate({
      video_id: video.id,
      objective,
      daily_budget: dailyNum,
      total_budget: total,
      duration_days: daysNum,
      status: "pending_review",
    });
  };

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      height={0.88}
      scrollable={false}
      dragArea="header"
      keyboardAvoid
      header={
        <View style={s.sheetHead}>
          <View style={{ flex: 1 }}>
            <Text style={s.sheetTitle}>Create Ad Campaign</Text>
            <Text style={s.sheetSub}>Promote a published video</Text>
          </View>
          <Pressable hitSlop={10} onPress={onClose} style={s.sheetClose}>
            <Ionicons name="close" size={19} color={colors.textSecondary} />
          </Pressable>
        </View>
      }
    >
      <ScrollView contentContainerStyle={s.form} showsVerticalScrollIndicator={false}>
        {/* Video */}
        <Text style={s.formLabel}>Video</Text>
        <Pressable style={s.videoPick} onPress={() => setVideoPickOpen(true)}>
          {video?.thumbnail_url ? (
            <Image source={{ uri: video.thumbnail_url }} style={s.pickThumb} />
          ) : (
            <View style={[s.pickThumb, s.thumbEmpty]}>
              <Plus size={16} color={colors.textFaint} />
            </View>
          )}
          <Text style={[s.pickText, !video && { color: colors.textFaint }]} numberOfLines={1}>
            {video ? (video.title || video.caption || `Video #${video.id}`) : "Choose a video"}
          </Text>
          <ChevronRight size={16} color={colors.textFaint} />
        </Pressable>

        {/* Objective */}
        <Text style={s.formLabel}>Objective</Text>
        <View style={{ gap: 6 }}>
          {OBJECTIVES.map((o) => {
            const on = o.key === objective;
            return (
              <Pressable
                key={o.key}
                style={[s.objective, on && s.objectiveOn]}
                onPress={() => setObjective(o.key)}
              >
                <View style={[s.radio, on && s.radioOn]}>
                  {on && <View style={s.radioDot} />}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[s.objectiveLabel, on && { color: colors.brand }]}>{o.label}</Text>
                  <Text style={s.objectiveDesc}>{o.desc}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        {/* Budget */}
        <Text style={s.formLabel}>Budget</Text>
        <View style={s.budgetFieldsRow}>
          <View style={s.budgetField}>
            <Text style={s.budgetKey}>Daily ($)</Text>
            <TextInput
              value={daily}
              onChangeText={setDaily}
              keyboardType="decimal-pad"
              style={s.budgetInput}
              placeholderTextColor={colors.textFaint}
            />
          </View>
          <View style={s.budgetField}>
            <Text style={s.budgetKey}>Days</Text>
            <TextInput
              value={days}
              onChangeText={setDays}
              keyboardType="number-pad"
              style={s.budgetInput}
              placeholderTextColor={colors.textFaint}
            />
          </View>
        </View>

        <View style={s.totalRow}>
          <Text style={s.totalKey}>Total budget</Text>
          <Text style={s.totalVal}>{money(total)}</Text>
        </View>
        <Text style={s.formNote}>
          Both budgets must be at least $1. The campaign goes to review before it runs.
        </Text>

        <Pressable
          style={[s.submit, (!valid || createM.isPending) && s.submitOff]}
          disabled={!valid || createM.isPending}
          onPress={submit}
        >
          {createM.isPending
            ? <ActivityIndicator color={colors.white} />
            : <Text style={s.submitText}>Submit for review</Text>}
        </Pressable>
      </ScrollView>

      {/* Video picker */}
      <BottomSheet visible={videoPickOpen} onClose={() => setVideoPickOpen(false)} height={0.7}>
        <View style={s.sheetPad}>
          <Text style={s.formLabel}>Choose a published video</Text>
          {contentQ.isLoading ? (
            <ActivityIndicator color={colors.brand} style={{ marginTop: spacing.lg }} />
          ) : (contentQ.data?.data ?? []).length === 0 ? (
            <Text style={s.formNote}>You have no published videos to promote.</Text>
          ) : (
            (contentQ.data?.data ?? []).map((v) => (
              <Pressable
                key={v.id}
                style={s.videoRow}
                onPress={() => { setVideo(v); setVideoPickOpen(false); }}
              >
                {v.thumbnail_url ? (
                  <Image source={{ uri: v.thumbnail_url }} style={s.pickThumb} />
                ) : (
                  <View style={[s.pickThumb, s.thumbEmpty]} />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={s.videoTitle} numberOfLines={1}>
                    {v.title || v.caption || `Video #${v.id}`}
                  </Text>
                  <Text style={s.videoMeta}>{formatCompact(v.views_count ?? 0)} views</Text>
                </View>
                {video?.id === v.id && (
                  <Ionicons name="checkmark-circle" size={18} color={colors.brand} />
                )}
              </Pressable>
            ))
          )}
        </View>
      </BottomSheet>
    </BottomSheet>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: sd.page },
  body: { paddingHorizontal: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  /* ── Hero ───────────────────────────────────────────────────────────── */
  glow: { position: "absolute", top: -125, right: -85 },
  rangeBar: {
    flexDirection: "row", gap: 4, padding: 3,
    backgroundColor: "rgba(255,255,255,0.07)", borderRadius: sr.pill,
  },
  rangeTab: { flex: 1, height: 30, borderRadius: sr.pill, alignItems: "center", justifyContent: "center" },
  rangeTabOn: { backgroundColor: "#FFFFFF" },
  rangeText: { fontSize: 11.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.6)" },
  rangeTextOn: { color: sd.ink },

  heroTop: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  heroLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.5)" },
  heroAmount: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  heroCur: { fontSize: 15, fontWeight: font.weightBold, color: "rgba(255,255,255,0.42)" },
  heroValue: { fontSize: 38, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -1.9, lineHeight: 40 },
  roas: {
    flexDirection: "row", alignItems: "center", gap: 5,
    backgroundColor: "rgba(95,224,174,0.16)", paddingHorizontal: 11, paddingVertical: 7, borderRadius: sr.pill,
  },
  roasDown: { backgroundColor: "rgba(226,59,78,0.18)" },
  roasText: { fontSize: 11.5, fontWeight: font.weightHeavy, color: sd.upOnDark },

  budgetWrap: { gap: 8, marginHorizontal: 2 },
  budgetTrack: { height: 8, borderRadius: sr.pill, backgroundColor: "rgba(255,255,255,0.08)", overflow: "hidden" },
  budgetFill: { height: "100%", borderRadius: sr.pill, backgroundColor: sd.accent },
  budgetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  budgetUsed: { fontSize: 10.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.45)" },
  budgetLeft: { fontSize: 10.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.7)" },

  strip: { flexDirection: "row", borderRadius: sr.card, backgroundColor: "rgba(255,255,255,0.07)", overflow: "hidden" },
  stripCell: { flex: 1, alignItems: "center", gap: 3, paddingVertical: 12, paddingHorizontal: 6 },
  stripDivider: { borderLeftWidth: 1, borderLeftColor: "rgba(255,255,255,0.07)" },
  stripValue: { fontSize: 14.5, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.29 },
  stripLabel: { fontSize: 9.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.45)" },

  /* ── Sections ───────────────────────────────────────────────────────── */
  sectionLabel: {
    fontSize: 12, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, textTransform: "uppercase", paddingTop: 26, paddingBottom: 10,
  },
  sectionHeadRow: {
    flexDirection: "row", alignItems: "baseline", justifyContent: "space-between",
    paddingTop: 26, paddingBottom: 10,
  },
  sectionLabelInline: {
    fontSize: 12, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, textTransform: "uppercase",
  },
  sectionCount: { fontSize: 11, fontWeight: font.weightBold, color: sd.faint },

  /* ── Performance grid ───────────────────────────────────────────────── */
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: {
    width: "48.4%", flexGrow: 1,
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.tile,
    padding: 14, gap: 7, backgroundColor: sd.page,
  },
  kpiLabel: { fontSize: 10.5, fontWeight: font.weightMedium, color: sd.muted },
  kpiValue: { fontSize: 22, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.99 },
  kpiDeltaRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  kpiDelta: { fontSize: 10.5, fontWeight: font.weightHeavy },
  kpiUp: { color: sd.up },
  kpiDown: { color: sd.down },
  kpiVs: { fontSize: 10, color: "#C7C2CE" },

  /* ── Campaign tabs ──────────────────────────────────────────────────── */
  tabScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  tabRow: { paddingHorizontal: spacing.lg, gap: 6, alignItems: "center", paddingBottom: 11 },
  tab: {
    flexDirection: "row", alignItems: "center", gap: 6, height: 34, paddingHorizontal: 14,
    borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line, backgroundColor: sd.page,
  },
  tabOn: { backgroundColor: sd.ink, borderColor: sd.ink },
  tabText: { fontSize: 12, fontWeight: font.weightBold, color: sd.slate },
  tabTextOn: { color: "#FFFFFF" },
  tabCount: {
    minWidth: 18, paddingHorizontal: 5, paddingVertical: 1,
    borderRadius: sr.pill, backgroundColor: sd.fill, alignItems: "center",
  },
  tabCountOn: { backgroundColor: "rgba(255,255,255,0.18)" },
  tabCountText: { fontSize: 10, fontWeight: font.weightHeavy, color: sd.muted },
  tabCountTextOn: { color: "rgba(255,255,255,0.85)" },
  newPill: {
    flexDirection: "row", alignItems: "center", gap: 5, height: 34, paddingHorizontal: 13,
    borderRadius: sr.pill, borderWidth: 1, borderStyle: "dashed", borderColor: "#F7C4D2", backgroundColor: sd.page,
  },
  newPillText: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.accent },

  /* ── Promote a post ─────────────────────────────────────────────────── */
  promoScroll: { flexGrow: 0, marginHorizontal: -spacing.lg },
  promoRow: { paddingHorizontal: spacing.lg, gap: 9, paddingBottom: 2 },
  promoCard: {
    width: 138, borderWidth: 1, borderColor: sd.line, borderRadius: sr.tile,
    padding: 11, gap: 9, backgroundColor: sd.page,
  },
  promoThumb: { width: "100%", height: 84, borderRadius: 13, backgroundColor: sd.thumbA },
  promoThumbFallback: { backgroundColor: sd.fill },
  promoTitle: { fontSize: 12, fontWeight: font.weightBold, color: sd.text },
  promoMeta: { fontSize: 10.5, color: sd.muted },
  promoBtn: { alignSelf: "flex-start", borderRadius: sr.pill, backgroundColor: "#FDECF1", paddingHorizontal: 9, paddingVertical: 5 },
  promoBtnText: { fontSize: 10, fontWeight: font.weightHeavy, color: sd.accent },

  /* ── Placement bars ─────────────────────────────────────────────────── */
  audienceCard: { borderWidth: 1, borderColor: sd.line, borderRadius: 22, padding: 16, gap: 13 },
  audienceRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  audienceName: { width: 88, fontSize: 12, fontWeight: font.weightMedium, color: sd.slate },
  audienceTrack: { flex: 1, height: 7, borderRadius: sr.pill, backgroundColor: sd.fill, overflow: "hidden" },
  audienceFill: { height: "100%", borderRadius: sr.pill, backgroundColor: sd.ink },
  audiencePct: { width: 34, textAlign: "right", fontSize: 11.5, fontWeight: font.weightBold, color: sd.text },

  /* ── Billing ────────────────────────────────────────────────────────── */
  billCard: { borderWidth: 1, borderColor: sd.line, borderRadius: 22, paddingHorizontal: 16, paddingVertical: 2 },
  billRow: {
    minHeight: 44, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: sd.fillSoft,
  },
  billRowLast: { borderBottomWidth: 0 },
  billIcon: {
    width: 34, height: 34, borderRadius: 11, backgroundColor: sd.fillSoft,
    alignItems: "center", justifyContent: "center",
  },
  billLabel: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text },
  billSub: { fontSize: 11.5, color: sd.muted },
  footNote: { textAlign: "center", fontSize: 11, color: sd.faint, paddingTop: 22 },

  /* ── Campaign card ──────────────────────────────────────────────────── */
  campTrack: { height: 6, borderRadius: sr.pill, backgroundColor: sd.divider, overflow: "hidden" },
  campFill: { height: "100%", borderRadius: sr.pill },
  campBudgetRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  campBudget: { flex: 1, fontSize: 11, color: sd.muted },
  campObjective: { fontSize: 11, fontWeight: font.weightBold, color: sd.muted },
  campActions: { flexDirection: "row", alignItems: "center", gap: 7 },
  campPrimary: {
    flex: 1, height: 40, borderRadius: sr.pill, backgroundColor: sd.ink,
    alignItems: "center", justifyContent: "center",
  },
  campPrimaryText: { fontSize: 12.5, fontWeight: font.weightBold, color: "#FFFFFF" },
  campGhost: {
    flex: 1, height: 40, borderRadius: sr.pill, backgroundColor: sd.page,
    borderWidth: 1, borderColor: sd.line, alignItems: "center", justifyContent: "center",
  },
  campGhostText: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.text },
  deliveryMeta: { flexShrink: 1, fontSize: 11.5, color: sd.muted },

  topBar: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingTop: spacing.md, paddingBottom: 2,
  },
  topTitle: { fontSize: 17, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.34 },
  createBtn: {
    width: 40, height: 40, borderRadius: sr.pill, backgroundColor: sd.accent,
    alignItems: "center", justifyContent: "center",
    shadowColor: sd.accent, shadowOpacity: 0.32, shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 }, elevation: 6,
  },

  /* The prototype's spend hero: near-black, one pink glow, 26px corners. */
  hero: {
    borderRadius: 26, backgroundColor: sd.ink, padding: 17, gap: 15,
    overflow: "hidden", marginTop: spacing.md,
  },


  /* Compact stat row: Total spent | Ads running */

  /* Sections */

  /* Filter row */

  /* Info cards */

  /* Campaigns header */

  /* Campaign card (Meta-style) */
  campaign: {
    backgroundColor: sd.page, borderRadius: sr.panel, padding: 13, gap: 11,
    borderWidth: 1, borderColor: sd.line,
  },
  tagRow: { flexDirection: "row", alignItems: "center", gap: 5 },
  tagText: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted },
  campTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  thumb: { width: 46, height: 46, borderRadius: 13, backgroundColor: sd.thumbA },
  thumbEmpty: { alignItems: "center", justifyContent: "center", backgroundColor: sd.fill },
  campaignTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.28 },
  deliveryRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  deliveryText: { fontSize: 11.5, fontWeight: font.weightMedium },
  deliverySep: { fontSize: 11.5, color: "#C7C2CE" },
  moreBtn: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  metricsRow: { flexDirection: "row", borderTopWidth: 1, borderTopColor: sd.divider, paddingTop: 11 },
  metricCell: { flex: 1, gap: 2, alignItems: "center" },
  metricValue: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.35 },
  metricLabel: { fontSize: 9.5, fontWeight: font.weightMedium, color: sd.muted },


  /* Empty */
  empty: { alignItems: "center", gap: 9, paddingVertical: 44, paddingHorizontal: 20 },
  emptyIcon: {
    width: 52, height: 52, borderRadius: sr.pill, backgroundColor: sd.fill,
    alignItems: "center", justifyContent: "center",
  },
  emptyTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.21 },
  emptySub: { fontSize: 12, color: sd.muted, textAlign: "center", lineHeight: 18 },

  /* Tools */

  /* Sheets */
  sheetPad: { paddingHorizontal: spacing.lg, paddingBottom: spacing.lg },
  sheetHead: {
    flexDirection: "row", alignItems: "center",
    paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.md,
    borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  sheetTitle: { fontSize: font.lg, fontWeight: font.weightHeavy, color: colors.text },
  sheetSub: { marginTop: 1, fontSize: font.xs, color: colors.textMuted },
  sheetClose: {
    width: 30, height: 30, borderRadius: 15, backgroundColor: colors.bgMuted,
    alignItems: "center", justifyContent: "center",
  },

  /* Form */
  form: { padding: spacing.lg, paddingBottom: spacing.xxl, gap: spacing.sm },
  formLabel: {
    marginTop: spacing.sm, fontSize: 10.5, fontWeight: font.weightHeavy,
    color: colors.textFaint, textTransform: "uppercase", letterSpacing: 0.6,
  },
  formNote: { fontSize: 11, lineHeight: 16, color: colors.textFaint },

  videoPick: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    padding: spacing.sm,
  },
  pickThumb: { width: 38, height: 46, borderRadius: 8, backgroundColor: colors.bgMuted },
  pickText: { flex: 1, fontSize: 13, fontWeight: font.weightMedium, color: colors.text },

  objective: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    padding: spacing.md,
  },
  objectiveOn: { borderColor: colors.brand, backgroundColor: colors.brandTint },
  radio: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },
  objectiveLabel: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  objectiveDesc: { marginTop: 1, fontSize: 11, color: colors.textMuted },

  budgetFieldsRow: { flexDirection: "row", gap: spacing.sm },
  budgetField: {
    flex: 1, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: 8,
  },
  budgetKey: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightBold },
  budgetInput: { fontSize: 16, fontWeight: font.weightBold, color: colors.text, padding: 0, marginTop: 2 },

  totalRow: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    backgroundColor: colors.bgMuted, borderRadius: radius.md,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md,
  },
  totalKey: { fontSize: 12.5, color: colors.textSecondary, fontWeight: font.weightMedium },
  totalVal: { fontSize: 17, fontWeight: font.weightHeavy, color: colors.text },

  submit: {
    marginTop: spacing.md, height: 50, borderRadius: radius.lg, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
  },
  submitOff: { backgroundColor: colors.borderStrong },
  submitText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },

  videoRow: {
    flexDirection: "row", alignItems: "center", gap: spacing.sm,
    paddingVertical: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  videoTitle: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  videoMeta: { marginTop: 1, fontSize: 11, color: colors.textFaint },

  rejectBox: {
    backgroundColor: "#fef2f2", borderWidth: 1, borderColor: "#fecaca",
    borderRadius: radius.md, padding: spacing.md, marginBottom: spacing.sm,
  },
  rejectLabel: { fontSize: 10, fontWeight: font.weightHeavy, color: colors.danger, textTransform: "uppercase" },
  rejectText: { marginTop: 2, fontSize: 12, color: "#991b1b", lineHeight: 17 },

  /* Tappable "Ads running" pod */
  podValueRow: { flexDirection: "row", alignItems: "center", gap: 4 },

  /* Ad Set / Performance detail */
  detailRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12, paddingVertical: 11,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
  },
  detailLabel: { fontSize: 11.5, color: colors.textFaint, fontWeight: font.weightMedium },
  detailValue: { marginTop: 2, fontSize: 14, color: colors.text, fontWeight: font.weightBold, lineHeight: 19 },
  perfGrid: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm, marginBottom: spacing.md },
  perfTile: { width: "47%", flexGrow: 1, backgroundColor: colors.bgMuted, borderRadius: radius.md, padding: spacing.md, gap: 2 },
  perfValue: { fontSize: 20, fontWeight: font.weightHeavy, color: colors.text },
  perfLabel: { fontSize: 11.5, color: colors.textMuted, fontWeight: font.weightMedium },

  /* Ads Manager modal */
  mgr: { flex: 1, backgroundColor: colors.bg },
  mgrTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: spacing.lg, height: 52 },
  mgrTopIcon: { width: 30, height: 30, alignItems: "center", justifyContent: "center" },
  mgrTitle: { fontSize: 16, fontWeight: font.weightHeavy, color: colors.text },
  mgrTabs: { flexDirection: "row", gap: 8, paddingHorizontal: spacing.lg, paddingBottom: spacing.sm },
  mgrTab: { paddingHorizontal: 16, height: 34, borderRadius: radius.pill, backgroundColor: colors.bgMuted, alignItems: "center", justifyContent: "center" },
  mgrTabOn: { backgroundColor: colors.brand },
  mgrTabText: { fontSize: 12.5, fontWeight: font.weightBold, color: colors.textSecondary },
  mgrTabTextOn: { color: colors.white },
});
