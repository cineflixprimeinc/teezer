import { useState } from "react";
import { Alert, Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  Heart, MessageSquare, Clock, UserPlus, Play, TrendingUp, TrendingDown, ChevronRight,
  CloudUpload, Radio, FileEdit, Rocket, MessageCircle, BadgeCheck, CircleCheck, Lock,
  ShieldCheck, Music4, Lightbulb, Settings as SettingsIcon, Gift, Star, WalletCards,
  Users, Sparkles,
  type LucideIcon,
} from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import { LinearGradient } from "expo-linear-gradient";
import { Skeleton } from "@/components/Skeleton";
import { studioApi, type AnalyticsPeriod, type ChartPoint, type GrowthInfo, type SmartInsight, type TopVideo, type VerificationStatus } from "@/api/studio.api";
import { useAuthStore } from "@/store/auth.store";
import { sd, sr } from "./studio-design";
import { colors } from "@/constants/colors";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";
import { formatCompact } from "@/utils/format";

/* The SAME three ranges the section has always offered - the API serves 7 / 28
   / 90 and nothing else. They moved out of a bottom sheet and onto the row of
   chips the prototype uses; the values behind them are unchanged. */
const PERIODS: { value: AnalyticsPeriod; label: string }[] = [
  { value: 7, label: "7 days" },
  { value: 28, label: "28 days" },
  { value: 90, label: "90 days" },
];

const QUICK_ACTIONS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "upload", label: "Upload", icon: CloudUpload },
  { key: "live", label: "Go Live", icon: Radio },
  { key: "drafts", label: "Drafts", icon: FileEdit },
  { key: "promote", label: "Promote", icon: Rocket },
  { key: "comments", label: "Comments", icon: MessageCircle },
];

const CREATOR_TOOLS: { key: string; label: string; icon: LucideIcon }[] = [
  { key: "level", label: "Creator Level", icon: ShieldCheck },
  { key: "audience", label: "Audience", icon: Users },
  { key: "live-tools", label: "Live Tools", icon: Radio },
  { key: "music", label: "Music Library", icon: Music4 },
  { key: "ideas", label: "Ideas Hub", icon: Lightbulb },
  { key: "settings", label: "Settings", icon: SettingsIcon },
];

/** Smart-insight icons, keyed by the `icon` the API sends. */
const INSIGHT_ICONS: Record<string, LucideIcon> = { clock: Clock, heart: Heart, play: Play };

/** "$3,245.60" - the money format the design uses everywhere on this screen. */
function money(amount: number): string {
  return `$${amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The hero holds 7 bars. A 28- or 90-day series has far more points than that,
 *  so days are summed into equal buckets and each bar is labelled with the day
 *  it ENDS on - "the week ending Mar 14" rather than a day picked out of the
 *  middle. A 7-day series passes through untouched. */
const HERO_BARS = 7;
function bucketSeries(points: ChartPoint[]): { label: string; value: number }[] {
  if (points.length <= HERO_BARS) return points.map((p) => ({ label: p.label, value: p.value }));
  const size = Math.ceil(points.length / HERO_BARS);
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    out.push({
      label: slice[slice.length - 1].label,
      value: slice.reduce((sum, p) => sum + p.value, 0),
    });
  }
  return out;
}

/** How much of a post people actually sit through: total watch time spread over
 *  its views, against its own length. Returns null when there is nothing to
 *  divide by, so the bar is hidden rather than drawn at a made-up 0%. */
function watchedPct(v: TopVideo): number | null {
  if (v.views <= 0 || v.duration <= 0) return null;
  const avgSeconds = (v.watch_time_hours * 3600) / v.views;
  return Math.min(100, Math.max(0, Math.round((avgSeconds / v.duration) * 100)));
}

/* ── Verification Center ─────────────────────────────────────────────────
   The three steps mirror the web verification flow. Progress is derived from
   the creator's latest request: applying at all clears the eligibility +
   authenticity checks, and documents stay "in progress" until every file is
   uploaded. An approved request (or an already-verified account) shows the
   whole checklist complete. ── */
type StepState = "completed" | "in_progress" | "locked";
type Step = { key: string; label: string; state: StepState };

function verificationSteps(v: VerificationStatus, isVerified: boolean): Step[] {
  const approved = isVerified || v?.status === "approved";
  const applied = !!v;
  const docsDone = !!v && v.document_uploaded && v.selfie_uploaded;

  const state = (done: boolean, active: boolean): StepState =>
    done ? "completed" : active ? "in_progress" : "locked";

  return [
    { key: "eligibility", label: "Eligibility Check", state: state(approved || applied, !applied) },
    { key: "authenticity", label: "Profile Authenticity", state: state(approved || applied, !applied) },
    { key: "documents", label: "Required Documents", state: state(approved || docsDone, applied) },
  ];
}

/** Reelsoo Studio → Dashboard section (the header + chip row live in StudioScreen).
 *  `onViewContent` switches the parent to the Content tab - where a video can
 *  actually be opened in the player, which the dashboard's summary rows can't do.
 *  `onOpenTools` switches to Creator Tools, which is where every tile in the
 *  Creator Tools card now leads. */
export function StudioDashboardSection({
  onViewContent,
  onOpenTools,
  onOpenComments,
}: {
  onViewContent: () => void;
  onOpenTools: () => void;
  onOpenComments: () => void;
}) {
  const navigation = useNavigation<any>();
  const user = useAuthStore((s) => s.user);

  const [period, setPeriod] = useState<AnalyticsPeriod>(7);

  const overviewQ = useQuery({
    queryKey: ["studio-overview", period],
    queryFn: () => studioApi.overview(period),
    staleTime: 60_000,
  });
  const moneyQ = useQuery({
    queryKey: ["studio-monetization", "28d"],
    queryFn: () => studioApi.monetizationOverview("28d"),
    staleTime: 60_000,
  });
  const commentsQ = useQuery({
    queryKey: ["studio-comment-stats"],
    queryFn: studioApi.commentStats,
    staleTime: 60_000,
  });
  const verifyQ = useQuery({
    queryKey: ["studio-verification"],
    queryFn: studioApi.verification,
    staleTime: 5 * 60_000,
  });

  const data = overviewQ.data;
  const comingSoon = (what: string) => Alert.alert(what, "Coming soon.");

  const onQuickAction = (key: string) => {
    if (key === "upload" || key === "live") return navigation.navigate("Main", { screen: "Create" });
    if (key === "comments") return onOpenComments();
    comingSoon(QUICK_ACTIONS.find((a) => a.key === key)?.label ?? "Studio");
  };

  const refreshing =
    (overviewQ.isFetching && !overviewQ.isLoading) || (moneyQ.isFetching && !moneyQ.isLoading);

  const refetchAll = () => {
    overviewQ.refetch();
    moneyQ.refetch();
    commentsQ.refetch();
    verifyQ.refetch();
  };

  /* The four tiles under the hero. Views is the hero itself, so it is not
     repeated here - these are the next four numbers the design shows. */
  const metrics = data
    ? [
        { key: "likes", label: "Likes", icon: Heart, value: formatCompact(data.summary.likes.value), growth: data.summary.likes.growth },
        { key: "comments", label: "Comments", icon: MessageSquare, value: formatCompact(data.summary.comments.value), growth: data.summary.comments.growth },
        { key: "watch", label: "Watch time", icon: Clock, value: `${formatCompact(data.summary.watch_time_hours.value)} hrs`, growth: data.summary.watch_time_hours.growth },
        { key: "followers", label: "New followers", icon: UserPlus, value: `+${formatCompact(data.summary.followers_gained.value)}`, growth: data.summary.followers_gained.growth },
      ]
    : [];

  const bars = data ? bucketSeries(data.main_charts.views_over_time) : [];
  const peak = bars.reduce((max, b) => Math.max(max, b.value), 0);

  const m = moneyQ.data;
  const goalPct = m?.revenue_goal.percentage ?? 0;
  const steps = verificationSteps(verifyQ.data ?? null, !!user?.is_verified);
  const verified = !!user?.is_verified || verifyQ.data?.status === "approved";

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refetchAll} tintColor={sd.accent} />}
    >
      {overviewQ.isLoading ? (
        <View style={{ gap: spacing.md }}>
          <Skeleton height={38} radius={sr.chip} />
          <Skeleton height={196} radius={sr.hero} />
          <Skeleton height={150} radius={sr.card} />
          <Skeleton height={120} radius={sr.card} />
        </View>
      ) : overviewQ.isError || !data ? (
        <View style={styles.errorBox}>
          <Ionicons name="alert-circle-outline" size={28} color={sd.faint} />
          <Text style={styles.errorText}>Couldn't load your dashboard.</Text>
          <Pressable style={styles.retryBtn} onPress={refetchAll}>
            <Text style={styles.retryText}>Retry</Text>
          </Pressable>
        </View>
      ) : (
        <>
          {/* ── Range chips ────────────────────────────────────────── */}
          <View style={styles.rangeRow}>
            {PERIODS.map((p) => {
              const on = p.value === period;
              return (
                <Pressable
                  key={p.value}
                  style={[styles.rangeChip, on && styles.rangeChipOn]}
                  onPress={() => setPeriod(p.value)}
                >
                  <Text style={[styles.rangeChipText, on && styles.rangeChipTextOn]}>{p.label}</Text>
                </Pressable>
              );
            })}
          </View>

          {/* ── Hero: views over the range ─────────────────────────── */}
          <View style={styles.hero}>
            {/* Stands in for the prototype's radial glow - RN has no radial
                gradient, so the accent is washed in from the top-right corner. */}
            <LinearGradient
              colors={["rgba(244,43,91,0.30)", "rgba(244,43,91,0)"]}
              start={{ x: 1, y: 0 }}
              end={{ x: 0.15, y: 0.75 }}
              style={StyleSheet.absoluteFill}
              pointerEvents="none"
            />
            <View style={styles.heroHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroCaption}>VIDEO VIEWS</Text>
                <Text style={styles.heroValue} numberOfLines={1}>
                  {formatCompact(data.summary.views.value)}
                </Text>
              </View>
              <HeroTrend g={data.summary.views.growth} />
            </View>

            <View style={styles.chartRow}>
              {bars.map((b, i) => {
                const isPeak = peak > 0 && b.value === peak;
                // 4pt floor so an empty day still reads as a bar, not a gap.
                const h = peak > 0 ? Math.max(4, Math.round((b.value / peak) * 76)) : 4;
                return (
                  <View key={`${b.label}-${i}`} style={styles.chartCol}>
                    <View
                      style={[styles.chartBar, { height: h }, isPeak && styles.chartBarPeak]}
                    />
                    <Text style={styles.chartLabel} numberOfLines={1}>{b.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* ── Metric tiles ───────────────────────────────────────── */}
          <View style={styles.metricGrid}>
            {metrics.map((s) => (
              <View key={s.key} style={styles.metricCard}>
                <View style={styles.metricHead}>
                  <View style={styles.metricIcon}>
                    <s.icon size={14} color={sd.text} strokeWidth={2.1} />
                  </View>
                  <Text style={styles.metricLabel} numberOfLines={1}>{s.label}</Text>
                </View>
                <View style={styles.metricValueRow}>
                  <Text style={styles.metricValue} numberOfLines={1}>{s.value}</Text>
                  <Text style={[styles.metricDelta, { color: s.growth.up ? sd.up : sd.down }]}>
                    {s.growth.up ? "+" : "-"}{s.growth.pct}%
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {/* ── Quick actions ──────────────────────────────────────── */}
          <Text style={styles.sectionLabel}>QUICK ACTIONS</Text>
          {/* Scrolls rather than wraps: the tiles are sized four-to-a-screen as
              in the prototype, and there are five actions. */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
            {QUICK_ACTIONS.map((a) => {
              const badge = a.key === "comments" ? commentsQ.data?.unread ?? 0 : 0;
              return (
                <Pressable key={a.key} style={styles.quickTile} onPress={() => onQuickAction(a.key)}>
                  <View style={styles.quickSquare}>
                    <a.icon size={21} color={sd.text} strokeWidth={1.9} />
                    {badge > 0 && (
                      <View style={styles.quickBadge}>
                        <Text style={styles.quickBadgeText}>{badge > 99 ? "99+" : badge}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.quickLabel} numberOfLines={2}>{a.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {/* ── Top posts ──────────────────────────────────────────
              Named for what the API actually returns: the five most-viewed
              published posts, best first - which is what the TOP flag marks. */}
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Top posts</Text>
            <Pressable hitSlop={8} onPress={onViewContent}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          {data.top_videos.length === 0 ? (
            <View style={styles.emptyBox}>
              <Ionicons name="videocam-outline" size={26} color={sd.faint} />
              <Text style={styles.emptyText}>No content yet</Text>
            </View>
          ) : (
            data.top_videos.map((v, i) => (
              <PostRow key={v.id} video={v} top={i === 0} onPress={onViewContent} />
            ))
          )}

          {/* ── Grow faster - the API's smart insights ───────────────
              Nullish-guarded: this block is the first consumer of
              `smart_insights`, and an older deploy can answer without it. */}
          {(data.smart_insights ?? []).length > 0 && (
            <>
              <Text style={styles.sectionLabel}>GROW FASTER</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tipRow}>
                {data.smart_insights.map((t) => (
                  <InsightCard key={t.type} insight={t} />
                ))}
              </ScrollView>
            </>
          )}

          {/* ── Monetization ───────────────────────────────────────── */}
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Monetization</Text>
            <Pressable hitSlop={8} onPress={() => comingSoon("Monetization")}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <View style={styles.balanceRow}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.balanceCaption}>Estimated balance</Text>
                <Text style={styles.balanceValue} numberOfLines={1}>
                  {money(m?.summary.total_earnings.amount ?? 0)}
                </Text>
              </View>
              {!!m && (
                <View style={[styles.chip, goalPct >= 50 ? styles.chipUp : styles.chipNeutral]}>
                  <Text style={[styles.chipText, goalPct >= 50 ? styles.chipTextUp : styles.chipTextNeutral]}>
                    {goalPct >= 50 ? "On track" : `${Math.round(goalPct)}% of goal`}
                  </Text>
                </View>
              )}
            </View>

            {/* Monthly revenue goal - the chip above says whether you're on
                track; this shows by how much. */}
            {!!m && m.revenue_goal.monthly_goal > 0 && (
              <View style={styles.goalWrap}>
                <View style={styles.track}>
                  <View style={[styles.trackFill, { width: `${Math.min(100, Math.max(2, goalPct))}%` }]} />
                </View>
                <Text style={styles.goalText}>
                  {money(m.revenue_goal.current)} of {money(m.revenue_goal.monthly_goal)} monthly goal
                </Text>
              </View>
            )}

            <View style={styles.moneyRows}>
              <MoneyRow icon={WalletCards} label="Wallet balance" amount={m?.payouts.available_balance ?? 0} />
              <MoneyRow icon={Gift} label="Gifts & coins" amount={m?.revenue_sources.live_gift ?? 0} />
              <MoneyRow icon={Star} label="Premium subscriptions" amount={m?.revenue_sources.subscription ?? 0} />
            </View>

            <Pressable style={styles.primaryBtn} onPress={() => comingSoon("Earnings")}>
              <Text style={styles.primaryBtnText}>View earnings</Text>
            </Pressable>
          </View>

          {/* ── Verification Center ────────────────────────────────── */}
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Verification</Text>
            <Pressable hitSlop={8} onPress={() => comingSoon("Verification")}>
              <Text style={styles.seeAll}>Manage</Text>
            </Pressable>
          </View>

          <View style={styles.panel}>
            <View style={styles.verifyHead}>
              <View style={[styles.verifyIcon, verified && styles.verifyIconOn]}>
                <BadgeCheck size={20} color={verified ? "#2FA0F0" : sd.faint} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.verifyStatus}>{verified ? "Verified" : "Not verified"}</Text>
                <Text style={styles.verifyHint}>
                  {verified ? "Your blue badge is active on your profile." : "Get a blue badge and build more trust."}
                </Text>
              </View>
            </View>

            <View style={styles.stepRows}>
              {steps.map((s) => (
                <StepRow key={s.key} step={s} />
              ))}
            </View>

            {!verified && (
              <Pressable style={styles.outlineBtn} onPress={() => comingSoon("Verification")}>
                <Text style={styles.outlineBtnText}>
                  {verifyQ.data ? "Continue verification" : "Apply for verification"}
                </Text>
              </Pressable>
            )}
          </View>

          {/* ── Creator tools ──────────────────────────────────────── */}
          <View style={styles.headingRow}>
            <Text style={styles.heading}>Creator tools</Text>
            <Pressable hitSlop={8} onPress={onOpenTools}>
              <Text style={styles.seeAll}>See all</Text>
            </Pressable>
          </View>
          <View style={styles.toolsGrid}>
            {CREATOR_TOOLS.map((t) => (
              <Pressable
                key={t.key}
                style={styles.toolTile}
                onPress={() => (t.key === "ideas" ? navigation.navigate("IdeaHub") : onOpenTools())}
              >
                <View style={styles.toolIcon}>
                  <t.icon size={19} color={sd.text} strokeWidth={1.9} />
                </View>
                <Text style={styles.toolLabel} numberOfLines={2}>{t.label}</Text>
              </Pressable>
            ))}
          </View>

          {/* ── Idea Hub ────────────────────────────────────────────
              Community feedback board, anchored at the bottom of the dashboard. */}
          <IdeaHubBanner onPress={() => navigation.navigate("IdeaHub")} />
        </>
      )}
    </ScrollView>
  );
}

/* ── Pieces ───────────────────────────────────────────────────────────── */

function HeroTrend({ g }: { g: GrowthInfo }) {
  const Icon = g.up ? TrendingUp : TrendingDown;
  return (
    <View style={styles.heroTrend}>
      <Icon size={12} color={sd.upOnDark} strokeWidth={2.8} />
      <Text style={styles.heroTrendText}>{g.pct}%</Text>
    </View>
  );
}

function MoneyRow({ icon: Icon, label, amount }: { icon: LucideIcon; label: string; amount: number }) {
  return (
    <View style={styles.moneyRow}>
      <View style={styles.moneyRowIcon}>
        <Icon size={16} color={sd.text} strokeWidth={1.9} />
      </View>
      <Text style={styles.moneyRowLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.moneyRowAmount}>{money(amount)}</Text>
    </View>
  );
}

function StepRow({ step }: { step: Step }) {
  const done = step.state === "completed";
  const active = step.state === "in_progress";
  const Icon = done ? CircleCheck : Lock;

  return (
    <View style={styles.stepRow}>
      <Icon size={15} color={done ? sd.up : active ? "#2FA0F0" : sd.faint} strokeWidth={2} />
      <Text style={styles.stepLabel} numberOfLines={1}>{step.label}</Text>
      <View style={[styles.chip, done ? styles.chipUp : active ? styles.chipInfo : styles.chipNeutral]}>
        <Text style={[styles.chipText, done ? styles.chipTextUp : active ? styles.chipTextInfo : styles.chipTextNeutral]}>
          {done ? "Completed" : active ? "In progress" : "Locked"}
        </Text>
      </View>
    </View>
  );
}

function PostRow({ video, top, onPress }: { video: TopVideo; top: boolean; onPress: () => void }) {
  const pct = watchedPct(video);
  return (
    <Pressable style={styles.postRow} onPress={onPress}>
      <View style={styles.postThumbWrap}>
        {video.thumbnail ? (
          <Image source={{ uri: video.thumbnail }} style={styles.postThumb} />
        ) : (
          <View style={[styles.postThumb, styles.postThumbFallback]}>
            <Ionicons name="videocam-outline" size={18} color={sd.faint} />
          </View>
        )}
        {top && (
          <View style={styles.topBadge}>
            <Text style={styles.topBadgeText}>TOP</Text>
          </View>
        )}
      </View>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={styles.postCaption} numberOfLines={1}>{video.title}</Text>
        <View style={styles.postStats}>
          <PostStat icon={Play} value={formatCompact(video.views)} />
          <PostStat icon={Heart} value={formatCompact(video.likes)} />
          <PostStat icon={MessageSquare} value={formatCompact(video.comments)} />
        </View>
        {/* Only drawn when there is real watch data behind it. */}
        {pct !== null && (
          <View style={styles.retentionRow}>
            <View style={styles.retentionTrack}>
              <View style={[styles.retentionFill, { width: `${Math.max(2, pct)}%` }]} />
            </View>
            <Text style={styles.retentionText}>{pct}% watched</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}

function PostStat({ icon: Icon, value }: { icon: LucideIcon; value: string }) {
  return (
    <View style={styles.postStat}>
      <Icon size={12} color={sd.muted} strokeWidth={2} />
      <Text style={styles.postStatText}>{value}</Text>
    </View>
  );
}

function InsightCard({ insight }: { insight: SmartInsight }) {
  const Icon = INSIGHT_ICONS[insight.icon] ?? Sparkles;
  return (
    <View style={styles.tipCard}>
      <View style={styles.tipIcon}>
        <Icon size={17} color={sd.text} strokeWidth={1.9} />
      </View>
      <Text style={styles.tipTitle} numberOfLines={2}>{insight.label}</Text>
      <Text style={styles.tipValue} numberOfLines={1}>{insight.value}</Text>
      <Text style={styles.tipSub} numberOfLines={2}>{insight.detail}</Text>
    </View>
  );
}

function IdeaHubBanner({ onPress }: { onPress: () => void }) {
  return (
    <Pressable style={({ pressed }) => pressed && { opacity: 0.9 }} onPress={onPress}>
      <LinearGradient
        colors={["#ff4d6d", "#ff7a4d"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.ideaBanner}
      >
        <View style={styles.ideaBannerIcon}>
          <Lightbulb size={20} color={colors.white} strokeWidth={2.4} />
        </View>
        <View style={{ flex: 1 }}>
          <View style={styles.ideaBannerTitleRow}>
            <Text style={styles.ideaBannerTitle}>Idea Hub</Text>
            <View style={styles.ideaBannerPill}>
              <Text style={styles.ideaBannerPillText}>NEW</Text>
            </View>
          </View>
          <Text style={styles.ideaBannerSub}>Share ideas, upvote features and help shape Teezer</Text>
        </View>
        <ChevronRight size={20} color={colors.white} strokeWidth={2.6} />
      </LinearGradient>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  scrollContent: { paddingHorizontal: 18, paddingTop: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  /* Range chips */
  rangeRow: { flexDirection: "row", gap: 7, paddingBottom: 14 },
  rangeChip: {
    flex: 1, alignItems: "center", justifyContent: "center", height: 36,
    borderRadius: sr.chip, borderWidth: 1, borderColor: sd.line, backgroundColor: sd.page,
  },
  rangeChipOn: { backgroundColor: sd.ink, borderColor: sd.ink },
  rangeChipText: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted },
  rangeChipTextOn: { color: "#FFFFFF" },

  /* Hero */
  hero: { borderRadius: sr.hero, backgroundColor: sd.ink, padding: 20, paddingTop: 22, gap: 18, overflow: "hidden" },
  heroHead: { flexDirection: "row", alignItems: "flex-start", gap: spacing.md },
  heroCaption: { fontSize: 10.5, fontWeight: font.weightHeavy, letterSpacing: 1.26, color: "rgba(255,255,255,0.45)" },
  heroValue: { marginTop: 7, fontSize: 40, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -1.8, lineHeight: 44 },
  heroTrend: {
    flexDirection: "row", alignItems: "center", gap: 4,
    backgroundColor: "rgba(43,196,138,0.16)", paddingHorizontal: 10, paddingVertical: 6, borderRadius: sr.pill,
  },
  heroTrendText: { fontSize: 11.5, fontWeight: font.weightHeavy, color: sd.upOnDark },

  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 96 },
  chartCol: { flex: 1, alignItems: "center", justifyContent: "flex-end", gap: 7 },
  chartBar: { width: "100%", borderRadius: 5, backgroundColor: "rgba(255,255,255,0.12)" },
  chartBarPeak: { backgroundColor: sd.accent },
  chartLabel: { fontSize: 9.5, fontWeight: font.weightMedium, color: "rgba(255,255,255,0.4)" },

  /* Metric tiles */
  metricGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9, paddingTop: 10 },
  metricCard: {
    width: "47.6%", flexGrow: 1, gap: 8,
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.card, padding: 14,
  },
  metricHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  metricIcon: { width: 28, height: 28, borderRadius: 9, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  metricLabel: { flex: 1, minWidth: 0, fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  metricValueRow: { flexDirection: "row", alignItems: "baseline", gap: 7 },
  metricValue: { fontSize: 20, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.7 },
  metricDelta: { fontSize: 11.5, fontWeight: font.weightBold },

  /* Section headings */
  sectionLabel: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted, letterSpacing: 0.72, paddingTop: 26, paddingBottom: 10 },
  headingRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", paddingTop: 26, paddingBottom: 10 },
  heading: { fontSize: 15, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.3 },
  seeAll: { fontSize: 12.5, fontWeight: font.weightBold, color: sd.accent },

  /* Quick actions */
  quickRow: { gap: 9, paddingRight: 2 },
  // 78pt keeps four tiles plus their gaps inside a 393pt screen's 18pt gutters.
  quickTile: { width: 78, alignItems: "center", gap: 8 },
  quickSquare: {
    width: 78, height: 78, borderRadius: sr.tile,
    backgroundColor: sd.fillSoft, borderWidth: 1, borderColor: sd.line,
    alignItems: "center", justifyContent: "center",
  },
  quickBadge: {
    position: "absolute", top: 6, right: 6, minWidth: 17, height: 17, borderRadius: sr.pill,
    backgroundColor: sd.accent, alignItems: "center", justifyContent: "center", paddingHorizontal: 4,
  },
  quickBadgeText: { color: "#FFFFFF", fontSize: 9.5, fontWeight: font.weightHeavy },
  quickLabel: { fontSize: 10.5, lineHeight: 13, fontWeight: font.weightMedium, color: sd.slate, textAlign: "center" },

  /* Top posts */
  postRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10 },
  postThumbWrap: { width: 52, height: 68, borderRadius: 11, overflow: "hidden", backgroundColor: sd.thumbA },
  postThumb: { width: "100%", height: "100%" },
  postThumbFallback: { alignItems: "center", justifyContent: "center", backgroundColor: sd.thumbB },
  topBadge: { position: "absolute", top: 5, left: 5, backgroundColor: sd.accent, paddingHorizontal: 5, paddingVertical: 2, borderRadius: 5 },
  topBadgeText: { color: "#FFFFFF", fontSize: 8.5, fontWeight: font.weightHeavy, letterSpacing: 0.5 },
  postCaption: { fontSize: 13, fontWeight: font.weightMedium, color: sd.text, lineHeight: 17.5 },
  postStats: { flexDirection: "row", alignItems: "center", gap: 12 },
  postStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  postStatText: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  retentionRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  retentionTrack: { flex: 1, height: 4, borderRadius: sr.pill, backgroundColor: "#F1EFF3", overflow: "hidden" },
  retentionFill: { height: "100%", borderRadius: sr.pill, backgroundColor: sd.ink },
  retentionText: { fontSize: 10.5, fontWeight: font.weightBold, color: sd.muted },

  /* Grow faster */
  tipRow: { gap: 10, paddingRight: 2, paddingBottom: 4 },
  tipCard: { width: 176, gap: 9, borderWidth: 1, borderColor: sd.line, borderRadius: sr.tile, padding: 15 },
  tipIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  tipTitle: { fontSize: 13, fontWeight: font.weightBold, color: sd.text, lineHeight: 17 },
  tipValue: { fontSize: 13, fontWeight: font.weightHeavy, color: sd.accent, letterSpacing: -0.2 },
  tipSub: { fontSize: 11.5, color: sd.muted, lineHeight: 16 },

  /* Panels (monetization, verification) */
  panel: { borderWidth: 1, borderColor: sd.line, borderRadius: sr.panel, padding: 16 },
  balanceRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  balanceCaption: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  balanceValue: { marginTop: 4, fontSize: 26, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -1 },
  goalWrap: { marginTop: 14, gap: 7 },
  track: { height: 6, borderRadius: sr.pill, backgroundColor: sd.fill, overflow: "hidden" },
  trackFill: { height: "100%", borderRadius: sr.pill, backgroundColor: sd.ink },
  goalText: { fontSize: 11, fontWeight: font.weightMedium, color: sd.muted },
  moneyRows: { gap: 12, marginTop: 16 },
  moneyRow: { flexDirection: "row", alignItems: "center", gap: 11 },
  moneyRowIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  moneyRowLabel: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: font.weightMedium, color: sd.slate },
  moneyRowAmount: { fontSize: 13.5, fontWeight: font.weightHeavy, color: sd.text },
  primaryBtn: { marginTop: 16, height: 48, borderRadius: sr.pill, backgroundColor: sd.accent, alignItems: "center", justifyContent: "center" },
  primaryBtnText: { color: "#FFFFFF", fontSize: 14, fontWeight: font.weightBold },

  /* Verification */
  verifyHead: { flexDirection: "row", alignItems: "center", gap: 11 },
  verifyIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  verifyIconOn: { backgroundColor: "#EAF3FD" },
  verifyStatus: { fontSize: 14.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.2 },
  verifyHint: { marginTop: 2, fontSize: 12, color: sd.muted, lineHeight: 16.5 },
  stepRows: { gap: 13, marginTop: 16 },
  stepRow: { flexDirection: "row", alignItems: "center", gap: 9 },
  stepLabel: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: font.weightMedium, color: sd.slate },
  outlineBtn: { marginTop: 16, height: 46, borderRadius: sr.pill, borderWidth: 1, borderColor: sd.line, alignItems: "center", justifyContent: "center" },
  outlineBtnText: { fontSize: 13.5, fontWeight: font.weightBold, color: sd.text },

  chip: { borderRadius: sr.pill, paddingHorizontal: 9, paddingVertical: 4 },
  chipText: { fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 0.3 },
  chipUp: { backgroundColor: sd.upWash },
  chipTextUp: { color: sd.up },
  chipInfo: { backgroundColor: "#EAF3FD" },
  chipTextInfo: { color: "#1F7FD0" },
  chipNeutral: { backgroundColor: sd.fill },
  chipTextNeutral: { color: sd.muted },

  /* Creator tools */
  toolsGrid: { flexDirection: "row", flexWrap: "wrap", gap: 9 },
  toolTile: {
    width: "31.4%", flexGrow: 1, alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: 1, borderColor: sd.line, borderRadius: sr.tile, paddingVertical: 15, paddingHorizontal: 6,
  },
  toolIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  toolLabel: { fontSize: 10.5, lineHeight: 14, fontWeight: font.weightMedium, color: sd.slate, textAlign: "center" },

  /* Idea Hub entry banner */
  ideaBanner: {
    flexDirection: "row", alignItems: "center", gap: spacing.md,
    marginTop: 26, borderRadius: sr.tile, padding: spacing.lg,
    shadowColor: sd.accent, shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  ideaBannerIcon: {
    width: 44, height: 44, borderRadius: 13, backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center", justifyContent: "center",
  },
  ideaBannerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  ideaBannerTitle: { fontSize: font.md, fontWeight: font.weightHeavy, color: colors.white },
  ideaBannerPill: { backgroundColor: "rgba(255,255,255,0.25)", borderRadius: sr.pill, paddingHorizontal: 7, paddingVertical: 2 },
  ideaBannerPillText: { fontSize: 9, fontWeight: font.weightBold, color: colors.white, letterSpacing: 0.5 },
  ideaBannerSub: { marginTop: 2, fontSize: 11.5, color: "rgba(255,255,255,0.9)", fontWeight: font.weightMedium, lineHeight: 16 },

  emptyBox: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xl, gap: spacing.xs },
  emptyText: { fontSize: font.sm, color: sd.muted },

  errorBox: { alignItems: "center", justifyContent: "center", paddingVertical: spacing.xxl, gap: spacing.sm },
  errorText: { fontSize: font.sm, color: sd.muted },
  retryBtn: { borderRadius: sr.pill, backgroundColor: sd.accent, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  retryText: { color: "#FFFFFF", fontSize: font.sm, fontWeight: font.weightBold },
});
