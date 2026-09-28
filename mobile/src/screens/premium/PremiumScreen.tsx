import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import Svg, {
  Defs,
  Rect,
  Stop,
  LinearGradient as SvgLinearGradient,
  RadialGradient as SvgRadialGradient,
} from "react-native-svg";
import {
  Ban,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  Crown,
  Globe,
  Info,
  Search as SearchIcon,
  Ticket,
  Mic,
  Rocket,
  Sparkles,
  Star,
  Video,
  X as XIcon,
  Zap,
} from "lucide-react-native";
import { premiumApi, formatPrice, type CouponCheck, type PremiumPlan } from "@/api/premium.api";
import { PREMIUM_FALLBACK } from "@/constants/premium-fallback";
import { subscriptionApi } from "@/api/subscription.api";
import { purchaseSubscription, iapAvailable, iapUnavailableReason } from "@/api/iap";
import { apiErrorMessage } from "@/api/client";

/**
 * Teezer Premium - reached from the crown on your own profile.
 *
 * Every word, price and row on this page comes from GET /premium, so the plans,
 * the feature grid, the comparison matrix and the questions are all edited in
 * the admin panel rather than shipped in a build. Sections whose rows are all
 * disabled simply do not render, which is how a whole block is retired without
 * an app release.
 *
 * The one thing NOT taken from that endpoint is whether you are already
 * subscribed - that stays on subscriptionApi.current(), the same source the
 * Studio premium section uses, so the two surfaces can never disagree.
 */

/** Static require, so the art is bundled rather than fetched at runtime. */
const PREMIUM_HERO = require("@/assets/premiumsubsriberdesign.png");

const PINK = "#F42B5B";
const INK = "#121014";
const MUTED = "#8A8592";
const SHEET = "#FFFFFF";
const PAGE = "#F4F2F5";

/** Glyph keys the admin panel can choose from. Unknown keys fall back to a
 *  neutral sparkle rather than leaving a hole in the grid. */
const ICONS: Record<string, any> = {
  chart: BarChart3,
  star: Star,
  video: Video,
  mic: Mic,
  ban: Ban,
  zap: Zap,
  sparkles: Sparkles,
};

/**
 * The mark on each plan card, keyed by plan key.
 *
 * Climbs deliberately - a rocket for the creator just starting, a bolt for the
 * one growing fast, a building for the team - so the three cards read as a
 * ladder at a glance rather than three equal options. Keys come from the server,
 * so an unknown one falls back to the crown rather than leaving an empty tile.
 */
const PLAN_ICONS: Record<string, any> = {
  starter: Rocket,
  pro: Zap,
  studio: Building2,
};

/** Tint per plan, so the tile is not the same grey square three times. */
const PLAN_ICON_TINT: Record<string, { bg: string; fg: string }> = {
  starter: { bg: "#EAF3FF", fg: "#2F7BD8" },
  pro: { bg: "#FFE9EF", fg: PINK },
  studio: { bg: "rgba(255,255,255,.12)", fg: "#FFFFFF" },
};

/* ── Header backdrop ─────────────────────────────────────────────────────── */

/**
 * The header's colour field: a deep violet base with a magenta bloom off-centre,
 * falling away to the page's near-black at the bottom edge.
 *
 * Drawn with SVG radial gradients rather than expo-linear-gradient because the
 * design's light source is a *point*, not an axis - a linear ramp can fake the
 * top-to-bottom fade but not the soft off-centre glow, and stacking several
 * linear layers to approximate one bloom costs more than drawing it properly.
 *
 * Two blooms: the large violet one that lights the whole panel, and a tighter,
 * hotter pink one sitting behind the app mark so the icon reads as the source.
 * Both end at zero opacity, so they composite over the base without a seam.
 */
function HeaderBackdrop() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <View style={styles.headerBase} />
      <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
        <Defs>
          <SvgRadialGradient id="bloom" cx="68%" cy="22%" rx="88%" ry="78%">
            <Stop offset="0" stopColor="#E0479F" stopOpacity="0.95" />
            <Stop offset="0.30" stopColor="#A6339B" stopOpacity="0.78" />
            <Stop offset="0.58" stopColor="#6B2A96" stopOpacity="0.52" />
            <Stop offset="0.82" stopColor="#33194E" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#0E0D11" stopOpacity="0" />
          </SvgRadialGradient>

          {/* A cool counter-light from the opposite corner. Without it the panel
              reads as one flat wash of magenta; the blue keeps the violet in the
              middle from going muddy where the two meet. */}
          <SvgRadialGradient id="cool" cx="6%" cy="88%" rx="66%" ry="58%">
            <Stop offset="0" stopColor="#3B6BE8" stopOpacity="0.42" />
            <Stop offset="0.55" stopColor="#3A2A7A" stopOpacity="0.20" />
            <Stop offset="1" stopColor="#0E0D11" stopOpacity="0" />
          </SvgRadialGradient>

          <SvgRadialGradient id="spark" cx="50%" cy="33%" rx="36%" ry="27%">
            <Stop offset="0" stopColor="#FF4E77" stopOpacity="0.62" />
            <Stop offset="0.6" stopColor="#F42B5B" stopOpacity="0.22" />
            <Stop offset="1" stopColor="#F42B5B" stopOpacity="0" />
          </SvgRadialGradient>

          {/* Settles the bottom edge into the sheet colour so the rounded sheet
              does not sit on a visible band. */}
          <SvgLinearGradient id="foot" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0E0D11" stopOpacity="0" />
            <Stop offset="1" stopColor="#0E0D11" stopOpacity="0.85" />
          </SvgLinearGradient>
        </Defs>

        {/* Order matters: cool light first so the magenta bloom sits on top of
            it, then the icon's spark, then the fade into the sheet. */}
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#cool)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bloom)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#spark)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#foot)" />
      </Svg>
    </View>
  );
}

/* ── Avatar stack ────────────────────────────────────────────────────────── */

/** Ring colours for people with no picture, so the row still reads as faces. */
const FALLBACK_RINGS = ["#F42B5B", "#8B5CF6", "#2FB6F0", "#FFC53D"];

/**
 * The overlapping faces in the social-proof pill.
 *
 * Falls back to a coloured initial when someone has no avatar, and renders
 * nothing at all when the server sent no people - the pill then shows just its
 * sentence rather than a row of empty circles.
 */
function AvatarStack({ people }: { people: { name?: string | null; avatar?: string | null }[] }) {
  const shown = people.slice(0, 4);
  if (shown.length === 0) return null;

  return (
    <View style={styles.stack}>
      {shown.map((p, i) => {
        const ring = FALLBACK_RINGS[i % FALLBACK_RINGS.length];
        return (
          <View key={i} style={[styles.stackItem, i > 0 && { marginLeft: -9 }]}>
            {p.avatar ? (
              <Image source={{ uri: p.avatar }} style={styles.stackImg} contentFit="cover" />
            ) : (
              <View style={[styles.stackImg, { backgroundColor: ring }]}>
                <Text style={styles.stackInitial}>
                  {(p.name || "?").charAt(0).toUpperCase()}
                </Text>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

/* ── Plan card ───────────────────────────────────────────────────────────── */

function PlanCard({
  plan,
  selected,
  onSelect,
}: {
  plan: PremiumPlan;
  selected: boolean;
  onSelect: () => void;
}) {
  /* The server's verdict, not a local rule. `can_purchase` is absent on an
     older server, and absent must mean "allowed" - defaulting to blocked would
     make every plan unbuyable the moment the app ran against one. */
  const blocked = plan.can_purchase === false;

  const dark = plan.theme === "dark";
  const title = dark ? "#FFFFFF" : INK;
  const sub = dark ? "rgba(255,255,255,.62)" : MUTED;
  const PlanGlyph = PLAN_ICONS[plan.key] ?? Crown;
  const tint = PLAN_ICON_TINT[plan.key] ?? (dark
    ? { bg: "rgba(255,255,255,.12)", fg: "#FFFFFF" }
    : { bg: "#F1EFF3", fg: INK });

  return (
    <View style={styles.planWrap}>
      {plan.is_popular && !!plan.badge_label && (
        <View style={styles.popularRibbon}>
          <Text style={styles.popularText}>★ {plan.badge_label}</Text>
        </View>
      )}

      {/* A plan the server refuses is shown and explained, not hidden.
          Removing it silently is what makes a customer think the app is broken
          - and it leaves them no way to learn WHY they cannot buy it. */}
      <Pressable
        onPress={blocked ? undefined : onSelect}
        disabled={blocked}
        accessibilityRole="radio"
        accessibilityState={{ selected, disabled: blocked }}
        accessibilityLabel={blocked
          ? `${plan.name}, unavailable. ${plan.unavailable_message ?? ""}`
          : `${plan.name}, ${formatPrice(plan.price, plan.currency)} per ${plan.period}`}
        style={[
          styles.planCard,
          dark ? styles.planCardDark : styles.planCardLight,
          selected && (dark ? styles.planCardDarkOn : styles.planCardOn),
          plan.is_popular && !!plan.badge_label && styles.planCardWithRibbon,
          blocked && styles.planCardBlocked,
        ]}
      >
        <View style={styles.planHead}>
          <View style={[styles.planIcon, { backgroundColor: tint.bg }]}>
            <PlanGlyph size={19} color={tint.fg} strokeWidth={2.2} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.planName, { color: title }]}>{plan.name}</Text>
            {!!plan.tagline && (
              <Text style={[styles.planTagline, { color: sub }]}>{plan.tagline}</Text>
            )}
          </View>
          <View
            style={[
              styles.radio,
              dark && styles.radioDark,
              selected && styles.radioOn,
            ]}
          >
            {selected && <Check size={13} color="#FFFFFF" strokeWidth={3.4} />}
          </View>
        </View>

        <View style={styles.priceRow}>
          {/* Server quote first: it is already converted to this user's currency
              and rounded to their market's rule. The bundled snapshot is only
              used offline, where there is nothing live to quote. */}
          <Text style={[styles.price, { color: title }]}>
            {plan.pricing?.formatted ?? formatPrice(plan.price, plan.currency)}
          </Text>
          <Text style={[styles.pricePeriod, { color: sub }]}>/{plan.period}</Text>
        </View>

        {/* Discount. Every figure comes from the server - the struck-through
            price is already converted through the same rate as the price beside
            it, and the percentage is derived there too, so nothing here can
            disagree with what the customer is actually charged. */}
        {!!plan.pricing?.has_discount && (
          <View style={styles.discountRow}>
            <Text style={[styles.discountWas, { color: sub }]}>
              {formatPrice(plan.pricing.compare_at ?? 0, plan.pricing.currency)}
            </Text>
            <View style={styles.discountPill}>
              <Text style={styles.discountPillText}>
                {plan.pricing.discount_label || `Save ${plan.pricing.discount_percent}%`}
              </Text>
            </View>
          </View>
        )}

        {plan.features.length > 0 && (
          <View style={styles.featureList}>
            {plan.features.map((f) => (
              <View key={f} style={styles.featureRow}>
                <Check size={14} color={PINK} strokeWidth={3} />
                <Text style={[styles.featureText, { color: dark ? "rgba(255,255,255,.86)" : INK }]}>
                  {f}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* The server's own message, verbatim. Writing a local one here would
            mean two wordings for the same refusal, and the backend already
            distinguishes country, platform, schedule and eligibility. */}
        {blocked && (
          <View style={styles.blockedNote}>
            <Info size={13} color="#B45309" strokeWidth={2.3} />
            <Text style={styles.blockedText}>
              {plan.unavailable_message ?? "This plan isn't available to you right now."}
            </Text>
          </View>
        )}
      </Pressable>
    </View>
  );
}

/* ── FAQ row ─────────────────────────────────────────────────────────────── */

function FaqRow({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <Pressable
      onPress={() => setOpen((v) => !v)}
      style={styles.faqRow}
      accessibilityRole="button"
      accessibilityState={{ expanded: open }}
      accessibilityLabel={question}
    >
      <View style={styles.faqHead}>
        <Text style={styles.faqQ}>{question}</Text>
        <View style={[styles.faqChevron, open && styles.faqChevronOpen]}>
          <ChevronDown size={16} color={MUTED} strokeWidth={2.4} />
        </View>
      </View>
      {open && <Text style={styles.faqA}>{answer}</Text>}
    </Pressable>
  );
}

/* ── Screen ──────────────────────────────────────────────────────────────── */

export function PremiumScreen() {
  const navigation = useNavigation<any>();
  const insets = useSafeAreaInsets();
  const [picked, setPicked] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [coupon, setCoupon] = useState<CouponCheck | null>(null);
  const [couponBusy, setCouponBusy] = useState(false);
  const [countriesOpen, setCountriesOpen] = useState(false);
  const [countryQuery, setCountryQuery] = useState("");

  const config = useQuery({
    queryKey: ["premium-config"],
    queryFn: () => premiumApi.config(),
    staleTime: 5 * 60_000,
    // One retry, not the default three: this page has a usable answer without
    // the server, so spinning for three round trips before showing it is worse
    // than showing it a second sooner.
    retry: 1,
  });

  /* Whether you already pay. Its own endpoint on purpose - see the file note. */
  const current = useQuery({
    queryKey: ["subscription-current"],
    queryFn: () => subscriptionApi.current(),
    staleTime: 60_000,
  });

  /**
   * Server first, bundled catalogue second.
   *
   * A marketing page has nothing useful to say by failing, so an unreachable or
   * not-yet-deployed /premium falls back to the copy shipped in the bundle
   * rather than showing an error where the plans should be. The fallback's
   * plans all carry product_id: null, so the CTA cannot transact on prices that
   * may have gone stale - see the note in premium-fallback.ts.
   */
  const d = config.data ?? PREMIUM_FALLBACK;
  const usingFallback = !config.data;

  const plans = d.plans;
  /* Default to a plan the caller can actually buy.
     Falling back to `plans[0]` blindly would pre-select a plan the server has
     already refused - the CTA would be dead on arrival with no explanation of
     why. Only if EVERY plan is blocked does it fall through to the first one,
     so the screen still shows something and the card carries the reason. */
  const buyable = useMemo(() => plans.filter((p) => p.can_purchase !== false), [plans]);
  const selectedKey =
    picked
    ?? (buyable.find((p) => p.key === d.default_plan)?.key)
    ?? buyable[0]?.key
    ?? plans[0]?.key
    ?? null;
  const selected = useMemo(
    () => plans.find((p) => p.key === selectedKey) ?? null,
    [plans, selectedKey],
  );
  const selectedBlocked = selected?.can_purchase === false;

  const trialDays = d.trial.enabled ? d.trial.days : 0;

  /**
   * Ask the server what the code is worth. Nothing is redeemed here - that
   * happens at payment, where the server re-checks everything, so a coupon that
   * expires between this call and paying is still caught.
   */
  const applyCoupon = useCallback(async () => {
    const code = couponCode.trim();
    if (!code) return;
    setCouponBusy(true);
    try {
      const amount = selected?.pricing?.amount ?? selected?.price ?? 0;
      const currency = selected?.pricing?.currency ?? selected?.currency ?? "USD";
      setCoupon(await premiumApi.validateCoupon(code, selected?.key, amount, currency));
    } finally {
      setCouponBusy(false);
    }
  }, [couponCode, selected]);

  /* Filtered list for the sheet, with the caller's own country pinned to the
     top - the one row they are most likely looking for should not require
     scrolling past sixty others to find. */
  const visibleCountries = useMemo(() => {
    const all = d.availability?.countries ?? [];
    const q = countryQuery.trim().toLowerCase();
    const mine = d.availability?.country;
    const matched = q
      ? all.filter((c) => c.name.toLowerCase().includes(q) || c.code.toLowerCase().includes(q))
      : all;

    return [...matched].sort((a, b) =>
      a.code === mine ? -1 : b.code === mine ? 1 : 0,
    );
  }, [d.availability, countryQuery]);

  const onPurchase = useCallback(async () => {
    if (!selected) return;

    if (!iapAvailable()) {
      Alert.alert("Not available", iapUnavailableReason);
      return;
    }
    // Tiers are only buyable once a store listing exists for them. Saying so
    // plainly beats a store sheet that fails with a cryptic code. On the
    // bundled catalogue this is always the case by design - those prices are a
    // snapshot and must never be charged.
    if (!selected.product_id) {
      Alert.alert(
        usingFallback ? "Can't reach Teezer" : "Not available yet",
        usingFallback
          ? "We couldn't load current pricing, so checkout is paused. Check your connection and try again."
          : `${selected.name} isn't set up for purchase on this platform yet. Please try again soon.`,
      );
      return;
    }

    const productId = selected.product_id;
    const money = formatPrice(selected.price, selected.currency);
    const per = selected.period === "year" ? "year" : "month";

    const run = async () => {
      setBuying(true);
      try {
        const plan = selected.period === "year" ? "annual" : "monthly";
        // The tier key travels with the receipt so the server records WHICH
        // plan was bought. It resolves price and product id from that key
        // itself - the client is never trusted for either.
        const res = await purchaseSubscription(productId, plan, selected.key);
        if (res.ok) {
          await current.refetch();
          Alert.alert("You're in", `Welcome to ${selected.name}.`);
        } else if (!res.cancelled) {
          Alert.alert("Purchase failed", res.message);
        }
      } catch (e) {
        Alert.alert("Purchase failed", apiErrorMessage(e));
      } finally {
        setBuying(false);
      }
    };

    /**
     * State the terms before opening the store sheet.
     *
     * The store's own sheet shows price and renewal, but it appears after the
     * user has already committed to tapping a pink button that says "free" -
     * this is the last point at which the recurring charge can be declined
     * without it feeling like a trap. It is also the honest place to say WHEN
     * money moves, which is not now: with a store-configured free trial the
     * first charge lands when the trial ends, not at signup.
     */
    Alert.alert(
      trialDays > 0 ? `Start your ${trialDays}-day free trial?` : `Subscribe to ${selected.name}?`,
      trialDays > 0
        ? `${selected.name} is free for ${trialDays} days.\n\nAfter that it renews at ${money} every ${per} until you cancel. Nothing is charged today, and you can cancel any time before the trial ends.`
        : `${selected.name} renews at ${money} every ${per} until you cancel.`,
      [
        { text: "Not now", style: "cancel" },
        { text: trialDays > 0 ? "Start trial" : "Continue", onPress: () => void run() },
      ],
    );
  }, [selected, current, usingFallback, trialDays]);

  if (config.isLoading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator color={PINK} />
      </View>
    );
  }

  /* No error branch: an unreachable /premium renders the bundled catalogue
     above rather than a dead end where the plans should be. */

  const priceLine = selected
    ? (selected.pricing?.formatted ?? formatPrice(selected.price, selected.currency))
    : "";

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 132 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Dark header ── */}
        <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
          <HeaderBackdrop />

          <View style={styles.headerBar}>
            <Pressable
              onPress={() => navigation.goBack()}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              hitSlop={8}
            >
              <XIcon size={17} color="#FFFFFF" strokeWidth={2.4} />
            </Pressable>
            <Pressable
              onPress={() => current.refetch()}
              accessibilityRole="button"
              accessibilityLabel="Restore purchases"
              hitSlop={8}
            >
              <Text style={styles.restore}>Restore</Text>
            </Pressable>
          </View>

          {/* The hero art, in place of the old gradient tile. It is a 3:2
              landscape illustration with a transparent background, so it is
              sized by width and left to keep its own ratio - forcing it into
              the square the star occupied would letterbox it into a stamp. */}
          <Image
            source={PREMIUM_HERO}
            style={styles.hero}
            contentFit="contain"
            transition={180}
            accessibilityLabel="Teezer Premium"
          />

          <Text style={styles.title}>Grow faster with{"\n"}Teezer Premium</Text>

          {!!selected && (
            <Text style={styles.subtitle}>
              {trialDays > 0
                ? `${trialDays} days free, then ${priceLine} a ${selected.period}. Cancel anytime.`
                : `${priceLine} a ${selected.period}. Cancel anytime.`}
            </Text>
          )}

          {/* Real count or nothing at all - the server returns null below the
              threshold rather than a number worth doubting. */}
          {!!d.social_proof && (
            <View style={styles.proofPill}>
              <AvatarStack people={d.social_proof.avatars ?? []} />
              <Text style={styles.proofText}>
                {d.social_proof.count.toLocaleString()}+ creators upgraded this month
              </Text>
            </View>
          )}
        </View>

        {/* ── White sheet ── */}
        <View style={styles.sheet}>
          {plans.map((p) => (
            <PlanCard
              key={p.key}
              plan={p}
              selected={p.key === selectedKey}
              onSelect={() => setPicked(p.key)}
            />
          ))}

          {d.features.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>WHAT YOU GET</Text>
              <View style={styles.grid}>
                {d.features.map((f) => {
                  const Glyph = ICONS[f.icon] ?? Sparkles;
                  return (
                    <View key={f.title} style={styles.gridCard}>
                      <View style={styles.gridHead}>
                        <View style={styles.gridIcon}>
                          <Glyph size={16} color={INK} strokeWidth={2} />
                        </View>
                        {!!f.badge && (
                          <View style={styles.newPill}>
                            <Text style={styles.newPillText}>{f.badge}</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.gridTitle}>{f.title}</Text>
                      {!!f.description && <Text style={styles.gridDesc}>{f.description}</Text>}
                    </View>
                  );
                })}
              </View>
            </>
          )}

          {d.comparison.length > 0 && plans.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>FREE VS PREMIUM</Text>
              <View style={styles.table}>
                <View style={styles.tableHeadRow}>
                  <Text style={[styles.tableHeadCell, styles.tableFirstCol]}>FEATURE</Text>
                  {plans.map((p) => (
                    <Text
                      key={p.key}
                      style={[
                        styles.tableHeadCell,
                        styles.tableCol,
                        p.is_popular && styles.tableHeadCellOn,
                      ]}
                    >
                      {p.name}
                    </Text>
                  ))}
                </View>

                {d.comparison.map((row, i) => (
                  <View
                    key={row.label}
                    style={[styles.tableRow, i === d.comparison.length - 1 && styles.tableRowLast]}
                  >
                    <Text style={[styles.tableLabel, styles.tableFirstCol]}>{row.label}</Text>
                    {plans.map((p) => {
                      // A missing key is a real answer - "not included" - and is
                      // exactly what the design draws as a dash.
                      const v = row.values?.[p.key];
                      const hot = row.highlight_plan === p.key;
                      return (
                        <View key={p.key} style={styles.tableCol}>
                          {hot ? (
                            <View style={styles.tableHot}>
                              <Text style={styles.tableHotText}>{v ?? "—"}</Text>
                            </View>
                          ) : (
                            <Text style={styles.tableValue}>{v ?? "—"}</Text>
                          )}
                        </View>
                      );
                    })}
                  </View>
                ))}
              </View>
            </>
          )}

          {d.faq.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>QUESTIONS</Text>
              <View style={styles.faqCard}>
                {d.faq.map((q) => (
                  <FaqRow key={q.question} question={q.question} answer={q.answer} />
                ))}
              </View>
            </>
          )}

          {/* ── Coupon ──
              The server decides the discount. This only renders what it is
              told, so the app and the website can never quote different
              numbers for the same code. */}
          <View style={[styles.couponBox, coupon?.valid && styles.couponBoxOn]}>
            <View style={styles.couponHead}>
              <View style={styles.couponIcon}>
                <Ticket size={18} color={PINK} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.couponTitle}>Have a coupon?</Text>
                <Text style={styles.couponSub}>Enter a code to see your discount.</Text>
              </View>
            </View>

            <View style={styles.couponRow}>
              <TextInput
                value={couponCode}
                onChangeText={(t) => { setCouponCode(t.toUpperCase()); setCoupon(null); }}
                placeholder="SAVE20"
                placeholderTextColor="#C9C5D0"
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={32}
                style={[styles.couponInput, coupon?.valid && styles.couponInputOn]}
              />
              <Pressable
                onPress={applyCoupon}
                disabled={couponBusy || !couponCode.trim()}
                style={[styles.couponBtn, (couponBusy || !couponCode.trim()) && { opacity: 0.45 }]}
                accessibilityRole="button"
                accessibilityLabel="Apply coupon"
              >
                {couponBusy
                  ? <ActivityIndicator size="small" color="#fff" />
                  : <Text style={styles.couponBtnText}>Apply</Text>}
              </Pressable>
            </View>

            {!!coupon && (
              <View style={[styles.couponMsg, coupon.valid ? styles.couponMsgOk : styles.couponMsgBad]}>
                {coupon.valid
                  ? <Check size={14} color="#15803D" strokeWidth={2.6} style={{ marginTop: 1.5 }} />
                  : <Info size={14} color="#DC2626" strokeWidth={2.4} style={{ marginTop: 1.5 }} />}
                <Text style={[styles.couponMsgText, { color: coupon.valid ? "#15803D" : "#DC2626" }]}>
                  {coupon.valid
                    ? `${coupon.coupon?.name ?? "Coupon"} applied — you save ${formatPrice(coupon.discount, selected?.pricing?.currency ?? selected?.currency ?? "USD")}`
                    : coupon.message}
                </Text>
              </View>
            )}
          </View>

          {/* ── Where we're available ──
              Driven by the same country table the admin panel toggles, so a
              market switched off there disappears here with no app release. */}
          {!!d.availability && (
            <Pressable
              onPress={() => setCountriesOpen(true)}
              style={styles.availRow}
              accessibilityRole="button"
              accessibilityLabel="See all available countries"
            >
              <View style={[styles.availDot, {
                backgroundColor: d.availability.supported ? "#DCFCE7" : "#FEF3C7",
              }]}>
                <Globe
                  size={16}
                  color={d.availability.supported ? "#15803D" : "#B45309"}
                  strokeWidth={2.3}
                />
              </View>
              <Text style={styles.availText}>
                {/* Three distinct states, never conflated: we know where you are
                    and we sell here; we know and we don't; we don't know. */}
                {!d.availability.detected ? (
                  <Text style={styles.availMuted}>Teezer Premium is available in </Text>
                ) : d.availability.supported ? (
                  <>
                    <Text style={{ fontWeight: "700" }}>
                      Available in {d.availability.country_name ?? "your country"}
                    </Text>
                    <Text style={styles.availMuted}> · we're in </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ fontWeight: "700" }}>
                      Not yet in {d.availability.country_name ?? "your country"}
                    </Text>
                    <Text style={styles.availMuted}> · we're in </Text>
                  </>
                )}
                <Text style={styles.availLink}>{d.availability.total_countries} countries</Text>
              </Text>
              <ChevronDown size={15} color={MUTED} strokeWidth={2.2} style={{ transform: [{ rotate: "-90deg" }] }} />
            </Pressable>
          )}

          {!!d.legal_note && (
            <View style={styles.legal}>
              <Info size={14} color={MUTED} strokeWidth={2} />
              <Text style={styles.legalText}>{d.legal_note}</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Country list ──
          The list the server sent, not a bundled copy - so a market the admin
          disables vanishes here without an app update. */}
      <Modal visible={countriesOpen} animationType="slide" transparent onRequestClose={() => setCountriesOpen(false)}>
        {/* The sheet is anchored to the bottom, so an open keyboard sat on top
            of the search field and the user could not see what they were
            typing. KeyboardAvoidingView lifts the whole sheet instead.
            behavior differs by platform on purpose: iOS reports the keyboard
            frame and "padding" tracks it smoothly, while on Android "height"
            is what actually resizes the container under the default
            adjustResize. */}
        <KeyboardAvoidingView
          style={styles.modalRoot}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          {/* The dismiss area is a SIBLING behind the sheet, not a parent.
              Wrapping the sheet in a Pressable made it claim the touch
              responder on press-in, so the list below never received the drag
              and would not scroll. As a sibling it still closes on an outside
              tap and takes no gesture from the content. */}
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => setCountriesOpen(false)}
            accessibilityLabel="Close country list"
          />

          <View style={[styles.modalSheet, { paddingBottom: insets.bottom + 12 }]}>
            <View style={styles.modalGrip} />

            <View style={styles.modalHead}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Where Premium is available</Text>
                <Text style={styles.modalSub}>
                  {d.availability?.total_countries ?? 0} countries and regions
                </Text>
              </View>
              <Pressable onPress={() => setCountriesOpen(false)} hitSlop={10}
                         style={styles.modalClose} accessibilityLabel="Close">
                <XIcon size={16} color={INK} strokeWidth={2.4} />
              </Pressable>
            </View>

            <View style={styles.modalSearch}>
              <SearchIcon size={15} color={MUTED} strokeWidth={2.2} />
              <TextInput
                value={countryQuery}
                onChangeText={setCountryQuery}
                placeholder="Search country"
                placeholderTextColor="#C9C5D0"
                style={styles.modalSearchInput}
                autoCorrect={false}
              />
              {!!countryQuery && (
                <Pressable onPress={() => setCountryQuery("")} hitSlop={8}>
                  <XIcon size={14} color={MUTED} strokeWidth={2.4} />
                </Pressable>
              )}
            </View>

            {/* nestedScrollEnabled is required on Android for a ScrollView
                inside another scrollable container; without it the gesture is
                handed to the parent and the list refuses to move.
                keyboardShouldPersistTaps keeps a row tappable while the search
                keyboard is open, instead of the first tap only dismissing it. */}
            <ScrollView
              style={{ maxHeight: 430 }}
              contentContainerStyle={{ paddingBottom: 8 }}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled
              showsVerticalScrollIndicator
            >
              {visibleCountries.map((c) => {
                const mine = c.code === d.availability?.country;
                return (
                  <View key={c.code} style={styles.countryRow}>
                    <View style={styles.countryFlag}>
                      <Text style={styles.countryCode}>{c.code}</Text>
                    </View>
                    <Text style={[styles.countryName, mine && { fontWeight: "800" }]}>{c.name}</Text>
                    {mine && <Text style={styles.countryYou}>You</Text>}
                  </View>
                );
              })}
              {visibleCountries.length === 0 && (
                <Text style={styles.countryEmpty}>
                  {countryQuery ? `No country matches "${countryQuery}".` : "No countries are enabled yet."}
                </Text>
              )}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Sticky CTA ── */}
      <View style={[styles.cta, { paddingBottom: insets.bottom + 10 }]}>
        <Pressable
          onPress={onPurchase}
          // Blocked here too, not only on the card: the backend refuses this
          // anyway, and letting the tap through would spend a round trip to
          // show an error the screen already knows about.
          disabled={buying || !selected || selectedBlocked}
          style={[styles.ctaBtn, (buying || !selected || selectedBlocked) && styles.ctaBtnOff]}
          accessibilityRole="button"
          accessibilityLabel={selectedBlocked ? "Plan unavailable" : trialDays > 0 ? `Start ${trialDays}-day free trial` : "Subscribe"}
        >
          {buying ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.ctaText}>
              {selectedBlocked
                ? "Not available here"
                : trialDays > 0 ? `Start ${trialDays}-day free trial` : "Subscribe"}
            </Text>
          )}
        </Pressable>
        {!!selected && (
          <Text style={styles.ctaSub}>
            {selectedBlocked
              ? (selected.unavailable_message ?? "This plan isn't available in your region.")
              : `Then ${priceLine} per ${selected.period} · ${selected.name}`}
          </Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: PAGE },
  loading: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: PAGE, gap: 14 },

  header: { paddingHorizontal: 20, paddingBottom: 46, alignItems: "center", overflow: "hidden" },
  /* The colour the blooms composite over. Kept as a plain view under the SVG so
     the panel is never transparent for a frame while the SVG mounts. */
  headerBase: { ...StyleSheet.absoluteFill, backgroundColor: "#1B1026" },
  headerBar: { width: "100%", flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  closeBtn: {
    width: 34, height: 34, borderRadius: 999,
    backgroundColor: "rgba(255,255,255,.13)",
    alignItems: "center", justifyContent: "center",
  },
  restore: { fontSize: 13.5, fontWeight: "700", color: "#FFFFFF" },

  /* 3:2 source (1536x1024). Height is width x 0.667 so the ratio is exact and
     `contain` has nothing to letterbox. */
  hero: { width: 252, height: 168, marginTop: 6 },
  title: {
    marginTop: 6, fontSize: 25, lineHeight: 31, fontWeight: "800",
    color: "#FFFFFF", textAlign: "center", letterSpacing: -0.4,
  },
  subtitle: {
    marginTop: 10, fontSize: 12.5, lineHeight: 18,
    color: "rgba(255,255,255,.62)", textAlign: "center",
  },
  proofPill: {
    marginTop: 18, flexDirection: "row", alignItems: "center", gap: 9,
    paddingLeft: 8, paddingRight: 15, paddingVertical: 7, borderRadius: 999,
    backgroundColor: "rgba(12,10,16,.42)",
    borderWidth: 1, borderColor: "rgba(255,255,255,.14)",
  },
  proofText: { fontSize: 11.5, fontWeight: "600", color: "#FFFFFF" },

  stack: { flexDirection: "row", alignItems: "center" },
  stackItem: {
    width: 24, height: 24, borderRadius: 999,
    /* The ring is what separates one face from the next once they overlap. */
    borderWidth: 2, borderColor: "#2A1836", overflow: "hidden",
  },
  stackImg: { width: "100%", height: "100%", alignItems: "center", justifyContent: "center" },
  stackInitial: { fontSize: 9.5, fontWeight: "800", color: "#FFFFFF" },

  sheet: {
    marginTop: -18, borderTopLeftRadius: 26, borderTopRightRadius: 26,
    backgroundColor: PAGE, paddingHorizontal: 16, paddingTop: 22,
  },

  planWrap: { marginBottom: 14 },
  popularRibbon: {
    position: "absolute", top: -1, left: 12, zIndex: 2,
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, backgroundColor: PINK,
  },
  popularText: { fontSize: 9.5, fontWeight: "800", color: "#FFFFFF", letterSpacing: 0.3 },
  planCard: { borderRadius: 18, padding: 16, borderWidth: 1.5 },
  planCardWithRibbon: { paddingTop: 22 },
  planCardLight: { backgroundColor: SHEET, borderColor: "#EDEBEF" },
  planCardDark: { backgroundColor: "#17151B", borderColor: "#26232C" },
  planCardOn: { borderColor: PINK },
  planCardDarkOn: { borderColor: PINK },

  planHead: { flexDirection: "row", alignItems: "center", gap: 12 },
  planIcon: {
    width: 36, height: 36, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  planName: { fontSize: 16, fontWeight: "800", letterSpacing: -0.2 },
  planTagline: { marginTop: 2, fontSize: 12 },
  radio: {
    width: 22, height: 22, borderRadius: 999, borderWidth: 1.8, borderColor: "#D9D6DD",
    alignItems: "center", justifyContent: "center",
  },
  radioDark: { borderColor: "#3A3543" },
  radioOn: { backgroundColor: PINK, borderColor: PINK },

  priceRow: { flexDirection: "row", alignItems: "flex-end", gap: 4, marginTop: 14 },
  price: { fontSize: 25, fontWeight: "800", letterSpacing: -0.6 },
  pricePeriod: { fontSize: 12.5, marginBottom: 4 },

  /* Discount: struck-through "was" price plus a saving badge. */
  discountRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 5 },
  discountWas: { fontSize: 13, textDecorationLine: "line-through", fontWeight: "600" },
  discountPill: { backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  discountPillText: { fontSize: 10.5, fontWeight: "900", color: "#15803D" },

  /* A plan the server refuses: dimmed, but still readable and still explained.
     Hiding it would leave the customer no way to learn why they cannot buy. */
  planCardBlocked: { opacity: 0.55 },
  blockedNote: {
    flexDirection: "row", alignItems: "flex-start", gap: 7, marginTop: 12,
    backgroundColor: "#FFFBEB", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8,
  },
  blockedText: { flex: 1, fontSize: 11.5, lineHeight: 16.5, fontWeight: "600", color: "#B45309" },

  featureList: { marginTop: 14, gap: 9 },
  featureRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  featureText: { flex: 1, fontSize: 12.5, fontWeight: "500" },

  sectionLabel: {
    marginTop: 24, marginBottom: 11, fontSize: 11, fontWeight: "800",
    color: MUTED, letterSpacing: 0.9,
  },

  grid: { flexDirection: "row", flexWrap: "wrap", gap: 11 },
  gridCard: {
    width: "48%", flexGrow: 1, backgroundColor: SHEET, borderRadius: 15, padding: 14,
    borderWidth: 1, borderColor: "#EDEBEF",
  },
  gridHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" },
  gridIcon: {
    width: 32, height: 32, borderRadius: 9, backgroundColor: "#F4F2F5",
    alignItems: "center", justifyContent: "center",
  },
  newPill: { paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, backgroundColor: "#FFE9EF" },
  newPillText: { fontSize: 8.5, fontWeight: "800", color: PINK, letterSpacing: 0.3 },
  gridTitle: { marginTop: 12, fontSize: 13.5, fontWeight: "800", color: INK, letterSpacing: -0.2 },
  gridDesc: { marginTop: 5, fontSize: 11.5, lineHeight: 16, color: MUTED },

  table: { backgroundColor: SHEET, borderRadius: 15, borderWidth: 1, borderColor: "#EDEBEF", overflow: "hidden" },
  tableHeadRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: "#F1EFF3",
  },
  tableHeadCell: { fontSize: 10.5, fontWeight: "700", color: MUTED, letterSpacing: 0.4, textAlign: "center" },
  tableHeadCellOn: { color: PINK },
  tableFirstCol: { flex: 1.5, textAlign: "left" },
  tableCol: { flex: 1, alignItems: "center" },
  tableRow: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 13,
    borderBottomWidth: 1, borderBottomColor: "#F6F4F7",
  },
  tableRowLast: { borderBottomWidth: 0 },
  tableLabel: { fontSize: 12.5, fontWeight: "700", color: INK },
  tableValue: { fontSize: 12, color: MUTED, textAlign: "center" },
  tableHot: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999, backgroundColor: "#FFE9EF" },
  tableHotText: { fontSize: 11.5, fontWeight: "800", color: INK },

  faqCard: { backgroundColor: SHEET, borderRadius: 15, borderWidth: 1, borderColor: "#EDEBEF" },
  faqRow: { paddingHorizontal: 15, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: "#F6F4F7" },
  faqHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  faqQ: { flex: 1, fontSize: 13.5, fontWeight: "700", color: INK, letterSpacing: -0.2 },
  faqChevron: { transform: [{ rotate: "0deg" }] },
  faqChevronOpen: { transform: [{ rotate: "180deg" }] },
  faqA: { marginTop: 10, fontSize: 12.5, lineHeight: 19, color: MUTED },

  /* ── Coupon ──
     Light theme, same tokens as the plan cards: white sheet, #EDEBEF hairline,
     18px radius. It was previously styled for a dark surface, which on this
     page meant white text on a white card - invisible rather than merely ugly. */
  couponBox: {
    marginTop: 22, borderRadius: 18, borderWidth: 1.5,
    borderColor: "#EDEBEF", backgroundColor: SHEET, padding: 16,
  },
  couponBoxOn: { borderColor: "#BBF7D0", backgroundColor: "#F6FFF9" },
  couponHead: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  couponIcon: {
    width: 36, height: 36, borderRadius: 10, backgroundColor: "#FFE9EF",
    alignItems: "center", justifyContent: "center",
  },
  couponTitle: { fontSize: 15, fontWeight: "800", color: INK, letterSpacing: -0.2 },
  couponSub: { marginTop: 1, fontSize: 11.5, color: MUTED },
  couponRow: { flexDirection: "row", gap: 8 },
  couponInput: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: "#EDEBEF",
    backgroundColor: PAGE, paddingHorizontal: 14, paddingVertical: 12,
    fontSize: 14, color: INK, letterSpacing: 1.2, fontWeight: "800",
  },
  couponInputOn: { borderColor: "#86EFAC", backgroundColor: SHEET },
  couponBtn: {
    borderRadius: 12, backgroundColor: PINK, paddingHorizontal: 22,
    alignItems: "center", justifyContent: "center", minWidth: 88,
  },
  couponBtnText: { fontSize: 13.5, fontWeight: "800", color: "#fff" },
  // Result line gets its own tinted strip so a success and an error are
  // distinguishable at a glance, not only by text colour.
  couponMsg: {
    marginTop: 10, flexDirection: "row", alignItems: "flex-start", gap: 7,
    borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9,
  },
  couponMsgOk: { backgroundColor: "#ECFDF3" },
  couponMsgBad: { backgroundColor: "#FEF2F2" },
  couponMsgText: { flex: 1, fontSize: 12.5, lineHeight: 18, fontWeight: "600" },

  /* ── Availability ── */
  availRow: {
    flexDirection: "row", alignItems: "center", gap: 9, marginTop: 14,
    borderRadius: 14, borderWidth: 1, borderColor: "#EDEBEF",
    backgroundColor: SHEET, paddingHorizontal: 13, paddingVertical: 11,
  },
  availDot: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
  },
  availText: { flex: 1, fontSize: 12.5, lineHeight: 18, color: INK },
  availMuted: { color: MUTED },
  availLink: { color: PINK, fontWeight: "800" },

  /* ── Country sheet ──
     No dark scrim. The screen used to be covered in rgba(18,16,20,.55), which
     read as a heavy black wash over the page. The sheet separates itself with
     an upward shadow instead, so the page behind stays visible and the popup
     still reads as elevated. The dismiss area is transparent and full-screen. */
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  modalSheet: {
    backgroundColor: SHEET, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 18, paddingTop: 10,
    // Replaces the scrim: an upward shadow lifts the sheet off the page
    // without tinting everything behind it. elevation is Android's equivalent
    // and is ignored on iOS, so both are set.
    shadowColor: "#121014",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.16,
    shadowRadius: 18,
    elevation: 24,
  },
  modalGrip: {
    alignSelf: "center", width: 42, height: 4.5, borderRadius: 999,
    backgroundColor: "#E4E1E7", marginBottom: 14,
  },
  modalHead: { flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 4 },
  modalTitle: { fontSize: 17, fontWeight: "900", color: INK, letterSpacing: -0.3 },
  modalSub: { marginTop: 2, fontSize: 12, color: MUTED },
  modalClose: {
    width: 30, height: 30, borderRadius: 999, backgroundColor: PAGE,
    alignItems: "center", justifyContent: "center",
  },
  modalSearch: {
    marginTop: 12, marginBottom: 4, flexDirection: "row", alignItems: "center", gap: 8,
    borderRadius: 12, backgroundColor: PAGE, paddingHorizontal: 12, paddingVertical: 10,
  },
  modalSearchInput: { flex: 1, fontSize: 13.5, color: INK, padding: 0 },
  countryRow: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#F4F2F5",
  },
  countryFlag: {
    width: 30, height: 30, borderRadius: 8, backgroundColor: PAGE,
    alignItems: "center", justifyContent: "center",
  },
  countryCode: { fontSize: 10.5, fontWeight: "900", color: MUTED },
  countryName: { flex: 1, fontSize: 13.5, color: INK },
  countryYou: {
    fontSize: 10, fontWeight: "900", color: "#15803D",
    backgroundColor: "#DCFCE7", paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 999,
    overflow: "hidden",
  },
  countryEmpty: { paddingVertical: 30, textAlign: "center", fontSize: 12.5, color: MUTED },

  legal: { flexDirection: "row", gap: 9, marginTop: 18, paddingHorizontal: 4 },
  legalText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: MUTED },

  cta: {
    position: "absolute", left: 0, right: 0, bottom: 0,
    paddingHorizontal: 16, paddingTop: 12,
    backgroundColor: "rgba(244,242,245,.96)",
    borderTopWidth: 1, borderTopColor: "#EAE7EC",
  },
  ctaBtn: {
    height: 52, borderRadius: 999, backgroundColor: PINK,
    alignItems: "center", justifyContent: "center",
  },
  ctaBtnOff: { opacity: 0.55 },
  ctaText: { fontSize: 15.5, fontWeight: "800", color: "#FFFFFF", letterSpacing: -0.2 },
  ctaSub: { marginTop: 9, fontSize: 11.5, color: MUTED, textAlign: "center" },
});
