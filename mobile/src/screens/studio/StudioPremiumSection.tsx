import { useState } from "react";
import {
  ActivityIndicator, Alert, Image, Pressable, RefreshControl, ScrollView,
  StyleSheet, Text, View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar } from "@/components/Avatar";
import {
  BadgeCheck, BarChart3, Check, Coins, Crown, Gauge, Palette, Rocket,
  ShieldCheck, Sparkles, TrendingUp, Video, X as XIcon,
} from "lucide-react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Skeleton } from "@/components/Skeleton";
import { subscriptionApi } from "@/api/subscription.api";
import { fetchSubProducts, purchaseSubscription, iapAvailable, iapUnavailableReason, type SubPlan } from "@/api/iap";
import { apiErrorMessage } from "@/api/client";
import { useAuthStore } from "@/store/auth.store";
import { colors } from "@/constants/colors";
import { font, radius, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

/* Marketing copy, same as the website's Premium page. NOTE: none of these limits
   are enforced anywhere yet - a subscription records a plan and an expiry, and
   nothing checks it to unlock 4K, longer uploads or the coin drop. The ONE thing
   that is real is the bonus coins: PremiumBonusService pays 200 RC a month. */
const BENEFITS = [
  { icon: XIcon,     tint: "#fff0f4", color: "#fe2c55", title: "Ad-free",           desc: "Watch without interruptions" },
  { icon: Crown,     tint: "#fff0f4", color: "#fe2c55", title: "Exclusive badge",   desc: "Stand out on your profile" },
  { icon: Video,     tint: "#fff0f4", color: "#fe2c55", title: "HD uploads",        desc: "Upload in up to 4K" },
  { icon: BarChart3, tint: "#f5f3ff", color: "#7c3aed", title: "Advanced analytics",desc: "Deeper insight into performance" },
  { icon: Gauge,     tint: "#eff6ff", color: "#2563eb", title: "Longer videos",     desc: "Higher upload limits" },
  { icon: Palette,   tint: "#f0fdfa", color: "#0d9488", title: "Profile themes",    desc: "Unlock premium themes" },
];

const COMPARE: { label: string; free: string | boolean; premium: string | boolean }[] = [
  { label: "Ad-free experience",  free: false,   premium: true },
  { label: "HD / 4K uploads",     free: false,   premium: true },
  { label: "Advanced analytics",  free: false,   premium: true },
  { label: "Upload limit",        free: "5 min", premium: "30 min" },
  { label: "Exclusive badge",     free: false,   premium: true },
  { label: "Bonus coins / month", free: "0",     premium: "200" },
  { label: "Priority support",    free: false,   premium: true },
];

const PERKS = [
  { icon: Rocket,     tint: "#f5f3ff", color: "#7c3aed", title: "Get discovered", desc: "Boost your visibility" },
  { icon: TrendingUp, tint: "#fffbeb", color: "#f59e0b", title: "Earn more",      desc: "Premium monetization opportunities" },
  { icon: Sparkles,   tint: "#f0fdfa", color: "#0d9488", title: "Build your brand", desc: "Exclusive tools to grow" },
];

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "-";

/** Teezer Studio -> Premium.
 *
 *  Premium is digital content, so in the app it is sold ONLY through StoreKit /
 *  Play Billing. There is deliberately no card form and no link to the web
 *  checkout: both are an App Store 3.1.1 rejection. When the store isn't
 *  configured for a platform, the screen says so rather than offering a button
 *  that cannot work. */
export function StudioPremiumSection() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [plan, setPlan] = useState<SubPlan>("annual");
  const [buying, setBuying] = useState(false);

  const subQ = useQuery({
    queryKey: ["premium-subscription"],
    queryFn: subscriptionApi.current,
    staleTime: 30_000,
  });

  const priceQ = useQuery({
    queryKey: ["premium-pricing"],
    queryFn: subscriptionApi.pricing,
    staleTime: 10 * 60_000,
  });

  const productsQ = useQuery({
    queryKey: ["premium-iap-products"],
    queryFn: fetchSubProducts,
    staleTime: 5 * 60_000,
  });

  const cancelM = useMutation({
    mutationFn: subscriptionApi.cancel,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["premium-subscription"] });
      Alert.alert("Cancelled", r.message ?? "You keep Premium until it expires.");
    },
    onError: (e) => Alert.alert("Couldn't cancel", apiErrorMessage(e, "Please try again.")),
  });

  const sub = subQ.data;
  const monthly = priceQ.data?.subscription_monthly ?? 4.99;
  const annual = priceQ.data?.subscription_annual ?? 39.99;

  const storeOn = !!productsQ.data?.enabled && iapAvailable();
  const productFor = (p: SubPlan) => productsQ.data?.products.find((x) => x.plan === p)?.product_id ?? null;
  const productId = productFor(plan);

  const price = plan === "annual" ? annual : monthly;
  const savePct = Math.round((1 - annual / (monthly * 12)) * 100);

  const buy = async () => {
    if (!iapAvailable()) {
      Alert.alert("Not available here", iapUnavailableReason);
      return;
    }
    if (!storeOn || !productId) {
      Alert.alert("Coming soon", "Premium isn't on sale in the app yet.");
      return;
    }

    setBuying(true);
    const res = await purchaseSubscription(productId, plan);
    setBuying(false);

    if (res.ok) {
      await qc.invalidateQueries({ queryKey: ["premium-subscription"] });
      // The signup bonus lands server-side, so the wallet is stale now.
      qc.invalidateQueries({ queryKey: ["wallet-dash"] });
      qc.invalidateQueries({ queryKey: ["coin-wallet"] });
      Alert.alert("Welcome to Premium", "Your benefits are live, and your bonus coins are in your wallet.");
      return;
    }
    if (!res.cancelled) Alert.alert("Purchase failed", res.message);
  };

  const loading = subQ.isLoading || priceQ.isLoading;

  return (
    <ScrollView
      contentContainerStyle={s.body}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={subQ.isFetching && !subQ.isLoading}
          onRefresh={() => { subQ.refetch(); productsQ.refetch(); }}
          tintColor={colors.brand}
        />
      }
    >
      {loading ? (
        <>
          <Skeleton height={150} radius={20} />
          <Skeleton height={120} radius={20} />
          <Skeleton height={220} radius={20} />
        </>
      ) : (
        <>
          {/* Hero */}
          <LinearGradient
            colors={["#fff5f7", "#ffeef3"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={s.hero}
          >
            <View style={{ flex: 1, gap: 5 }}>
              <View style={s.heroTitleRow}>
                <Text style={s.heroTitle}>Teezer </Text>
                <Text style={[s.heroTitle, { color: colors.brand }]}>Premium</Text>
                <Sparkles size={15} color="#fbbf24" strokeWidth={2.4} />
              </View>
              <Text style={s.heroSub}>
                Unlock the ultimate Teezer experience, built for creators and fans.
              </Text>
            </View>
            <View style={s.heroCrown}>
              <Crown size={34} color={colors.brand} strokeWidth={1.8} />
            </View>
          </LinearGradient>

          {/* Active subscription */}
          {sub?.is_active ? (
            <View style={s.activeCard}>
              <View style={s.activeTop}>
                <View style={s.activeIcon}>
                  <Crown size={18} color="#7c3aed" strokeWidth={2.4} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.activeTitle}>
                    {sub.plan === "annual" ? "Yearly" : "Monthly"} Premium active
                  </Text>
                  <Text style={s.activeSub}>
                    {sub.cancelled_at ? "Ends" : "Renews"} {fmtDate(sub.expires_at)}
                  </Text>
                </View>
              </View>

              {!sub.cancelled_at && (
                <Pressable
                  style={s.cancelBtn}
                  onPress={() =>
                    Alert.alert(
                      "Cancel Premium",
                      "You'll keep your benefits until the period ends.",
                      [
                        { text: "Keep Premium", style: "cancel" },
                        { text: "Cancel", style: "destructive", onPress: () => cancelM.mutate() },
                      ],
                    )
                  }
                  disabled={cancelM.isPending}
                >
                  {cancelM.isPending
                    ? <ActivityIndicator size="small" color="#6d28d9" />
                    : <Text style={s.cancelText}>Cancel subscription</Text>}
                </Pressable>
              )}
            </View>
          ) : (
            <>
              {/* Plans */}
              <View style={s.plans}>
                <PlanCard
                  title="Monthly"
                  price={monthly}
                  unit="/ month"
                  note="Billed monthly"
                  selected={plan === "monthly"}
                  onPress={() => setPlan("monthly")}
                />
                <PlanCard
                  title="Yearly"
                  price={annual}
                  unit="/ year"
                  note={`$${(annual / 12).toFixed(2)} / month`}
                  badge="BEST VALUE"
                  savePct={savePct > 0 ? savePct : undefined}
                  selected={plan === "annual"}
                  onPress={() => setPlan("annual")}
                />
              </View>

              {/* Buy */}
              <View style={s.card}>
                <View style={s.summaryRow}>
                  <Text style={s.summaryKey}>{plan === "annual" ? "Yearly" : "Monthly"} plan</Text>
                  <Text style={s.summaryVal}>${price.toFixed(2)}</Text>
                </View>
                {plan === "annual" && savePct > 0 && (
                  <View style={s.summaryRow}>
                    <Text style={s.summaryKey}>You save</Text>
                    <Text style={[s.summaryVal, { color: colors.success }]}>
                      -${(monthly * 12 - annual).toFixed(2)}
                    </Text>
                  </View>
                )}
                <View style={s.totalRow}>
                  <Text style={s.totalKey}>Total</Text>
                  <Text style={s.totalVal}>${price.toFixed(2)}</Text>
                </View>

                <Pressable
                  style={[s.buyBtn, (!storeOn || buying) && s.buyBtnOff]}
                  onPress={buy}
                  disabled={buying}
                >
                  {buying ? (
                    <ActivityIndicator color={colors.white} />
                  ) : (
                    <>
                      <Crown size={16} color={colors.white} strokeWidth={2.5} />
                      <Text style={s.buyText}>
                        {storeOn ? `Upgrade - $${price.toFixed(2)}` : "Not available in the app yet"}
                      </Text>
                    </>
                  )}
                </Pressable>

                <Text style={s.buyNote}>
                  <ShieldCheck size={11} color={colors.textFaint} />{" "}
                  {storeOn
                    ? "Billed by the App Store. Cancel any time."
                    : "Premium is sold through the app store, and that isn't switched on yet."}
                </Text>
              </View>
            </>
          )}

          {/* Benefits */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Premium benefits</Text>
            <View style={s.benefitGrid}>
              {BENEFITS.map((b) => (
                <View key={b.title} style={s.benefit}>
                  <View style={[s.benefitIcon, { backgroundColor: b.tint }]}>
                    <b.icon size={15} color={b.color} strokeWidth={2.3} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.benefitTitle}>{b.title}</Text>
                    <Text style={s.benefitDesc} numberOfLines={2}>{b.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Bonus coins - the one benefit that is actually wired up */}
          <View style={s.coinCard}>
            <View style={s.coinIcon}>
              <Coins size={18} color="#d97706" strokeWidth={2.4} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.coinTitle}>200 bonus coins, every month</Text>
              <Text style={s.coinSub}>
                Paid on your renewal day, straight into your wallet. Spend them on gifts.
              </Text>
            </View>
          </View>

          {/* Free vs Premium */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Free vs Premium</Text>
            <View style={s.compareHead}>
              <Text style={s.compareFeat}>Feature</Text>
              <Text style={s.compareCol}>Free</Text>
              <Text style={[s.compareCol, { color: colors.brand }]}>Premium</Text>
            </View>
            {COMPARE.map((r) => (
              <View key={r.label} style={s.compareRow}>
                <Text style={s.compareLabel}>{r.label}</Text>
                <View style={s.compareCell}><Cell v={r.free} /></View>
                <View style={s.compareCell}><Cell v={r.premium} premium /></View>
              </View>
            ))}
          </View>

          {/* Preview */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Your Premium preview</Text>
            <View style={s.preview}>
              <LinearGradient
                colors={["#c91f78", "#7c3aed", "#1d4ed8"]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.previewBanner}
              />
              <View style={s.previewBody}>
                <View style={s.avatarWrap}>
                  <Avatar uri={user?.avatar} style={s.avatar} />
                  <View style={s.crownBadge}>
                    <Crown size={11} color={colors.white} strokeWidth={2.6} />
                  </View>
                </View>

                <View style={s.previewName}>
                  <Text style={s.previewUser}>{user?.username ?? "you"}</Text>
                  {user?.is_verified && <BadgeCheck size={13} color={colors.info} strokeWidth={2.6} />}
                </View>

                <View style={s.premiumChip}>
                  <Crown size={10} color={colors.brand} strokeWidth={2.8} />
                  <Text style={s.premiumChipText}>Premium</Text>
                </View>

                <View style={s.previewStats}>
                  <Stat value={user?.profile?.total_followers} label="Followers" />
                  <Stat value={user?.profile?.total_following} label="Following" />
                  <Stat value={user?.profile?.total_likes} label="Likes" />
                </View>
              </View>
            </View>
          </View>

          {/* Perks */}
          <View style={s.card}>
            <Text style={s.cardTitle}>Creator perks</Text>
            <View style={{ gap: spacing.md }}>
              {PERKS.map((p) => (
                <View key={p.title} style={s.perk}>
                  <View style={[s.benefitIcon, { backgroundColor: p.tint }]}>
                    <p.icon size={15} color={p.color} strokeWidth={2.3} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.benefitTitle}>{p.title}</Text>
                    <Text style={s.benefitDesc}>{p.desc}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </>
      )}
    </ScrollView>
  );
}

/* ── Bits ─────────────────────────────────────────────────────────────────── */
function PlanCard({
  title, price, unit, note, badge, savePct, selected, onPress,
}: {
  title: string; price: number; unit: string; note: string;
  badge?: string; savePct?: number; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable style={[s.plan, selected && s.planOn]} onPress={onPress}>
      {!!badge && (
        <View style={s.planBadge}>
          <Text style={s.planBadgeText}>{badge}</Text>
        </View>
      )}
      <View style={s.planHead}>
        <Text style={s.planTitle}>{title}</Text>
        <View style={[s.radio, selected && s.radioOn]}>
          {selected && <View style={s.radioDot} />}
        </View>
      </View>
      <Text style={s.planPrice}>
        ${price.toFixed(2)}
        <Text style={s.planUnit}> {unit}</Text>
      </Text>
      <View style={s.planFoot}>
        <Text style={s.planNote}>{note}</Text>
        {typeof savePct === "number" && (
          <View style={s.saveChip}>
            <Text style={s.saveText}>Save {savePct}%</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function Cell({ v, premium }: { v: string | boolean; premium?: boolean }) {
  if (typeof v === "string") {
    return (
      <Text style={[s.cellText, premium && { color: colors.brand, fontWeight: font.weightHeavy }]}>
        {v}
      </Text>
    );
  }
  return v
    ? <Check size={14} color={colors.brand} strokeWidth={3.2} />
    : <XIcon size={14} color={colors.borderStrong} strokeWidth={3.2} />;
}

function Stat({ value, label }: { value?: number; label: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }}>
      <Text style={s.statVal}>{formatCompact(value ?? 0)}</Text>
      <Text style={s.statKey}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  body: { padding: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl, gap: spacing.md },

  /* Hero */
  hero: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    borderRadius: 20, borderWidth: 1, borderColor: "#fde2e8", padding: spacing.lg,
  },
  heroTitleRow: { flexDirection: "row", alignItems: "center" },
  heroTitle: { fontSize: 21, fontWeight: font.weightHeavy, color: colors.text },
  heroSub: { fontSize: 12, lineHeight: 17, color: colors.textMuted, fontWeight: font.weightMedium },
  heroCrown: {
    width: 62, height: 62, borderRadius: 31, backgroundColor: "#ffe3ec",
    alignItems: "center", justifyContent: "center",
  },

  /* Active */
  activeCard: {
    borderRadius: 16, borderWidth: 1, borderColor: "#e0e7ff",
    backgroundColor: "#f5f3ff", padding: spacing.lg, gap: spacing.md,
  },
  activeTop: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  activeIcon: {
    width: 36, height: 36, borderRadius: 18, backgroundColor: "#ede9fe",
    alignItems: "center", justifyContent: "center",
  },
  activeTitle: { fontSize: 14, fontWeight: font.weightHeavy, color: "#4c1d95" },
  activeSub: { marginTop: 1, fontSize: 11.5, color: "#6d28d9", fontWeight: font.weightMedium },
  cancelBtn: {
    height: 38, borderRadius: radius.md, borderWidth: 1, borderColor: "#c4b5fd",
    alignItems: "center", justifyContent: "center",
  },
  cancelText: { fontSize: 12.5, fontWeight: font.weightBold, color: "#6d28d9" },

  /* Plans */
  plans: { flexDirection: "row", gap: spacing.sm },
  plan: {
    flex: 1, borderRadius: 16, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.card, padding: spacing.md, paddingTop: spacing.lg,
  },
  planOn: { borderColor: colors.brand, borderWidth: 2 },
  planBadge: {
    position: "absolute", top: -1, alignSelf: "center", left: 0, right: 0,
    marginHorizontal: "auto",
  },
  planBadgeText: {
    alignSelf: "center", backgroundColor: colors.brand, color: colors.white,
    fontSize: 8.5, fontWeight: font.weightHeavy, letterSpacing: 0.5,
    paddingHorizontal: 8, paddingVertical: 2,
    borderBottomLeftRadius: 6, borderBottomRightRadius: 6,
    overflow: "hidden",
  },
  planHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  planTitle: { fontSize: 13.5, fontWeight: font.weightHeavy, color: colors.text },
  planPrice: { marginTop: 6, fontSize: 20, fontWeight: font.weightHeavy, color: colors.text },
  planUnit: { fontSize: 10.5, fontWeight: font.weightMedium, color: colors.textFaint },
  planFoot: { marginTop: 6, gap: 4 },
  planNote: { fontSize: 10.5, color: colors.textFaint, fontWeight: font.weightMedium },
  saveChip: {
    alignSelf: "flex-start", backgroundColor: colors.brandTint,
    borderRadius: radius.pill, paddingHorizontal: 7, paddingVertical: 2,
  },
  saveText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: colors.brand },

  radio: {
    width: 16, height: 16, borderRadius: 8, borderWidth: 2, borderColor: colors.borderStrong,
    alignItems: "center", justifyContent: "center",
  },
  radioOn: { borderColor: colors.brand },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.brand },

  /* Cards */
  card: {
    backgroundColor: colors.card, borderRadius: 16, padding: spacing.lg,
    borderWidth: 1, borderColor: colors.border,
  },
  cardTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.text, marginBottom: spacing.md },

  summaryRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  summaryKey: { fontSize: 12.5, color: colors.textMuted, fontWeight: font.weightMedium },
  summaryVal: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  totalRow: {
    flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between",
    borderTopWidth: 1, borderTopColor: colors.border,
    marginTop: spacing.sm, paddingTop: spacing.sm,
  },
  totalKey: { fontSize: 13, fontWeight: font.weightHeavy, color: colors.text },
  totalVal: { fontSize: 22, fontWeight: font.weightHeavy, color: colors.text },

  buyBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 7,
    marginTop: spacing.md, height: 50, borderRadius: radius.lg, backgroundColor: colors.brand,
  },
  buyBtnOff: { backgroundColor: colors.borderStrong },
  buyText: { fontSize: font.md, fontWeight: font.weightBold, color: colors.white },
  buyNote: {
    marginTop: spacing.sm, fontSize: 10.5, lineHeight: 15,
    color: colors.textFaint, textAlign: "center",
  },

  /* Benefits */
  benefitGrid: { gap: spacing.md },
  benefit: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  benefitIcon: {
    width: 32, height: 32, borderRadius: 10,
    alignItems: "center", justifyContent: "center",
  },
  benefitTitle: { fontSize: 13, fontWeight: font.weightBold, color: colors.text },
  benefitDesc: { marginTop: 1, fontSize: 11.5, color: colors.textMuted, lineHeight: 16 },
  perk: { flexDirection: "row", alignItems: "center", gap: spacing.sm },

  /* Coins */
  coinCard: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    backgroundColor: "#fffbeb", borderWidth: 1, borderColor: "#fde68a",
    borderRadius: 16, padding: spacing.lg,
  },
  coinIcon: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: "#fef3c7",
    alignItems: "center", justifyContent: "center",
  },
  coinTitle: { fontSize: 13.5, fontWeight: font.weightHeavy, color: "#92400e" },
  coinSub: { marginTop: 2, fontSize: 11.5, lineHeight: 16, color: "#b45309" },

  /* Compare */
  compareHead: {
    flexDirection: "row", alignItems: "center",
    paddingBottom: spacing.sm, borderBottomWidth: 1, borderBottomColor: colors.border,
  },
  compareFeat: { flex: 1, fontSize: 10.5, fontWeight: font.weightHeavy, color: colors.textFaint },
  compareCol: { width: 56, textAlign: "center", fontSize: 10.5, fontWeight: font.weightHeavy, color: colors.textFaint },
  compareRow: {
    flexDirection: "row", alignItems: "center", paddingVertical: 9,
    borderBottomWidth: 1, borderBottomColor: colors.bgMuted,
  },
  compareLabel: { flex: 1, fontSize: 12.5, color: colors.textSecondary },
  compareCell: { width: 56, alignItems: "center" },
  cellText: { fontSize: 11.5, fontWeight: font.weightBold, color: colors.textFaint },

  /* Preview */
  preview: { borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden" },
  previewBanner: { height: 56 },
  previewBody: { alignItems: "center", paddingBottom: spacing.md, marginTop: -28 },
  avatarWrap: { width: 62, height: 62 },
  avatar: { width: 62, height: 62, borderRadius: 31, borderWidth: 3, borderColor: colors.white },
  avatarFallback: { backgroundColor: colors.brand, alignItems: "center", justifyContent: "center" },
  avatarLetter: { color: colors.white, fontSize: 22, fontWeight: font.weightHeavy },
  crownBadge: {
    position: "absolute", bottom: 0, right: -2,
    width: 22, height: 22, borderRadius: 11, backgroundColor: colors.brand,
    alignItems: "center", justifyContent: "center",
    borderWidth: 2, borderColor: colors.white,
  },
  previewName: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  previewUser: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.text },
  premiumChip: {
    flexDirection: "row", alignItems: "center", gap: 3, marginTop: 4,
    backgroundColor: colors.brandTint, borderRadius: radius.pill,
    paddingHorizontal: 8, paddingVertical: 3,
  },
  premiumChipText: { fontSize: 10, fontWeight: font.weightHeavy, color: colors.brand },
  previewStats: { flexDirection: "row", marginTop: spacing.md, alignSelf: "stretch" },
  statVal: { fontSize: 14, fontWeight: font.weightHeavy, color: colors.text },
  statKey: { fontSize: 10, color: colors.textFaint, fontWeight: font.weightMedium },
});
