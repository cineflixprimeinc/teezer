import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation, useRoute } from "@react-navigation/native";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowDown, ArrowUp, Bookmark, ChevronLeft, Eye, Film, Flag, Heart, Lightbulb,
  MessageCircle, Share2, TrendingUp, type LucideIcon,
} from "lucide-react-native";
import { Screen } from "@/components/Screen";
import { Skeleton } from "@/components/Skeleton";
import { studioApi, type InsightGrowth, type InsightRetention, type PostInsights } from "@/api/studio.api";
import { usePostViewer } from "@/store/post-viewer.store";
import { sd, sr } from "./studio-design";
import { font, spacing } from "@/constants/theme";
import { formatCompact, formatDuration } from "@/utils/format";

type Period = "7" | "28" | "90";

const STATUS_LABEL: Record<string, string> = {
  published: "Public", draft: "Draft", scheduled: "Scheduled",
  private: "Private", unlisted: "Unlisted", removed: "Removed",
};

/** "Posted 2 days ago" - same relative-time helper StudioContentSection uses. */
function ago(iso?: string | null): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const mins = Math.round((Date.now() - then) / 60000);
  const abs = Math.abs(mins);
  const unit =
    abs < 60 ? [abs, "minute"] :
    abs < 1440 ? [Math.round(abs / 60), "hour"] :
    abs < 10080 ? [Math.round(abs / 1440), "day"] :
    abs < 43200 ? [Math.round(abs / 10080), "week"] :
    abs < 525600 ? [Math.round(abs / 43200), "month"] :
    [Math.round(abs / 525600), "year"];
  const n = Math.max(1, unit[0] as number);
  const word = `${n} ${unit[1]}${n === 1 ? "" : "s"}`;
  return mins >= 0 ? `${word} ago` : `in ${word}`;
}

/** The chart holds at most 7 bars. A 28-day series has far more points than
 *  that, so days are summed into equal buckets, each labelled with the day it
 *  ENDS on - same bucketing rule StudioDashboardSection's own hero chart
 *  uses. A 7-point series (or shorter) passes through untouched. */
const CHART_BARS = 7;
function bucketSeries(points: { label: string; value: number }[]): { label: string; value: number }[] {
  if (points.length <= CHART_BARS) return points;
  const size = Math.ceil(points.length / CHART_BARS);
  const out: { label: string; value: number }[] = [];
  for (let i = 0; i < points.length; i += size) {
    const slice = points.slice(i, i + size);
    out.push({ label: slice[slice.length - 1].label, value: slice.reduce((s, p) => s + p.value, 0) });
  }
  return out;
}

/** The one real, data-derived tip this page shows: the point in the video
 *  where the most viewers who leave, leave. Only shown when the drop between
 *  two consecutive retention segments is large enough to actually mean
 *  something - a flat curve gets no tip rather than a manufactured one. */
function biggestDrop(retention: InsightRetention): { markLabel: string; dropPts: number } | null {
  const segs = retention.segments;
  let worst: { markLabel: string; dropPts: number } | null = null;
  for (let i = 1; i < segs.length; i++) {
    const dropPts = segs[i - 1].retention - segs[i].retention;
    if (dropPts >= 15 && (!worst || dropPts > worst.dropPts)) {
      const mark = segs[i - 1].label.split("–")[1]?.trim() ?? segs[i - 1].label;
      worst = { markLabel: mark, dropPts };
    }
  }
  return worst;
}

function GrowthChip({ g, dark }: { g: InsightGrowth; dark?: boolean }) {
  const Icon = g.up ? ArrowUp : ArrowDown;
  const color = g.up ? (dark ? sd.upOnDark : sd.up) : sd.down;
  const bg = dark
    ? (g.up ? "rgba(95,224,174,0.16)" : "rgba(226,59,78,0.16)")
    : (g.up ? sd.upWash : sd.downWash);
  return (
    <View style={[styles.growthChip, { backgroundColor: bg }]}>
      <Icon size={10} color={color} strokeWidth={2.8} />
      <Text style={[styles.growthChipText, { color }]}>{g.pct}%</Text>
    </View>
  );
}

function PerfCard({ Icon, tint, label, g }: {
  Icon: LucideIcon; tint: string; label: string; g: InsightGrowth;
}) {
  return (
    <View style={styles.perfCard}>
      <View style={styles.perfHead}>
        <View style={[styles.perfIcon, { backgroundColor: `${tint}1A` }]}>
          <Icon size={14} color={tint} strokeWidth={2} />
        </View>
        <Text style={styles.perfLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={styles.perfValue} numberOfLines={1}>{formatCompact(g.value)}</Text>
      <Text style={[styles.perfGrowth, { color: g.up ? sd.up : sd.down }]}>{g.up ? "+" : "-"}{g.pct}%</Text>
    </View>
  );
}

function Bar({ source, pct }: { source: string; pct: number }) {
  return (
    <View style={styles.barRow}>
      <View style={styles.barHead}>
        <Text style={styles.barLabel} numberOfLines={1}>{source}</Text>
        <Text style={styles.barPct}>{pct}%</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(2, Math.min(100, pct))}%` }]} />
      </View>
    </View>
  );
}

/**
 * Reelsoo Studio → Post insights - one video's own performance, opened from
 * the Content tab's "Insight" button. Every figure here comes from
 * GET /studio/content/{id}/insights - the same endpoint the website's own
 * Post Insights page (studio-insights-page.tsx) already calls. Sections the
 * backend has no real data for (a "top X% of your posts" ranking, feed
 * impressions, follow-attribution) are left out rather than filled with
 * placeholder numbers - the website's own page makes the same omissions.
 */
export function PostInsightsScreen() {
  const navigation = useNavigation<any>();
  const route = useRoute<any>();
  const id: number = route.params?.id;

  const [period, setPeriod] = useState<Period>("7");

  const rangeParams = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (period === "7" ? 6 : period === "28" ? 27 : 89));
    return { start_date: start.toISOString().slice(0, 10), end_date: end.toISOString().slice(0, 10) };
  }, [period]);

  const q = useQuery({
    queryKey: ["post-insights", id, rangeParams.start_date, rangeParams.end_date],
    queryFn: () => studioApi.insights(id, { metric: "views", ...rangeParams }),
    enabled: !!id,
    staleTime: 30_000,
  });

  const data: PostInsights | undefined = q.data;
  const video = data?.video;
  const loading = q.isLoading;

  // Opens this exact post in the app via the real, already-shipped
  // single-reel viewer - not navigation.navigate("VideoPlayer"), which this
  // used to call. That route was never registered anywhere (see
  // StudioContentSection's identical fix), so every tap threw a real
  // navigation error instead of opening the post.
  const openPublic = () => {
    if (!video) return;
    usePostViewer.getState().showVideo(video.id);
  };

  const chartBars = useMemo(() => (data ? bucketSeries(data.chart) : []), [data]);
  const chartPeak = chartBars.length ? Math.max(...chartBars.map((b) => b.value)) : 0;

  const drop = data ? biggestDrop(data.retention) : null;
  const avgWatchSec = data && video?.duration ? Math.round((data.retention.average / 100) * video.duration) : 0;

  const [locTab, setLocTab] = useState<"countries" | "cities">("countries");
  const locations = locTab === "countries" ? data?.audience_locations.countries : data?.audience_locations.cities;

  const periodLabel = period === "7" ? "this week" : period === "28" ? "this month" : "last 90 days";

  return (
    <Screen edges={["top"]} bg="#FAFAFB">
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.circleBtn}>
          <ChevronLeft size={19} color={sd.text} strokeWidth={2.3} />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.headerTitle} numberOfLines={1}>Post insights</Text>
          <Text style={styles.headerSub} numberOfLines={1}>
            {video ? `Posted ${ago(video.created_at)} · ${STATUS_LABEL[video.status ?? "published"]}` : " "}
          </Text>
        </View>
        <Pressable onPress={openPublic} hitSlop={8} style={styles.circleBtn} accessibilityLabel="Open this post">
          <Eye size={17} color={sd.text} strokeWidth={2} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={{ gap: 10 }}>
            <Skeleton height={230} radius={sr.hero} />
            <Skeleton height={90} radius={sr.panel} />
            <Skeleton height={160} radius={sr.panel} />
          </View>
        ) : !data || !video ? (
          <View style={styles.emptyWrap}>
            <Film size={26} color={sd.faint} strokeWidth={1.9} />
            <Text style={styles.emptyText}>Couldn't load this video's insights.</Text>
          </View>
        ) : (
          <>
            {/* HERO */}
            <View style={styles.hero}>
              <LinearGradient
                colors={["rgba(244,43,91,0.3)", "rgba(244,43,91,0)"]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.15, y: 0.75 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
              />
              <View style={styles.heroTop}>
                <View style={styles.heroThumb}>
                  {video.thumbnail_url ? (
                    <Image source={video.thumbnail_url} style={StyleSheet.absoluteFill} contentFit="cover" />
                  ) : (
                    <View style={[StyleSheet.absoluteFill, styles.heroThumbFallback]}>
                      <Film size={18} color="rgba(255,255,255,0.5)" />
                    </View>
                  )}
                </View>
                <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
                  <Text style={styles.heroCaption} numberOfLines={2}>{video.title || video.caption || "Untitled"}</Text>
                  {!!video.duration && (
                    <View style={styles.heroDurationPill}>
                      <Text style={styles.heroDurationText}>{formatDuration(video.duration)}</Text>
                    </View>
                  )}
                </View>
              </View>

              <View style={styles.periodTabs}>
                {(["7", "28", "90"] as Period[]).map((p) => (
                  <Pressable key={p} style={[styles.periodTab, period === p && styles.periodTabOn]} onPress={() => setPeriod(p)}>
                    <Text style={[styles.periodTabText, period === p && styles.periodTabTextOn]}>
                      {p} days
                    </Text>
                  </Pressable>
                ))}
              </View>

              <View style={styles.heroValueRow}>
                <View style={{ minWidth: 0 }}>
                  <Text style={styles.heroValueLabel} numberOfLines={1}>Views {periodLabel}</Text>
                  <Text style={styles.heroValue} numberOfLines={1}>{formatCompact(data.summary.views.value)}</Text>
                </View>
                <GrowthChip g={data.summary.views} dark />
              </View>

              {chartBars.length > 1 && (
                <View style={styles.chartRow}>
                  {chartBars.map((b, i) => {
                    const isPeak = chartPeak > 0 && b.value === chartPeak;
                    const h = chartPeak > 0 ? Math.max(4, Math.round((b.value / chartPeak) * 68)) : 4;
                    return (
                      <View key={`${b.label}-${i}`} style={styles.chartCol}>
                        <View style={[styles.chartBar, { height: h }, isPeak && styles.chartBarPeak]} />
                        <Text style={styles.chartBarLabel} numberOfLines={1}>{b.label.slice(0, 1)}</Text>
                      </View>
                    );
                  })}
                </View>
              )}
            </View>

            {/* SMART TIP - only when the retention data actually shows one */}
            {drop && (
              <View style={styles.tipCard}>
                <View style={styles.tipIcon}><Lightbulb size={15} color="#8B5CF6" strokeWidth={1.9} /></View>
                <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
                  <View style={styles.tipHeadRow}>
                    <Text style={styles.tipHeading}>How to improve this</Text>
                    <View style={styles.tipBadge}><Text style={styles.tipBadgeText}>SMART TIP</Text></View>
                  </View>
                  <Text style={styles.tipBody}>
                    Most viewers who drop off leave around {drop.markLabel} into the video - a stronger hook in that stretch could help people keep watching.
                  </Text>
                </View>
              </View>
            )}

            {/* PERFORMANCE */}
            <Text style={styles.sectionLabel}>Performance</Text>
            <View style={styles.perfGrid}>
              <PerfCard Icon={Heart} tint="#F42B5B" label="Likes" g={data.summary.likes} />
              <PerfCard Icon={MessageCircle} tint="#2FA0F0" label="Comments" g={data.summary.comments} />
              <PerfCard Icon={Share2} tint="#2BC48A" label="Shares" g={data.summary.shares} />
              <PerfCard Icon={Bookmark} tint="#8B5CF6" label="Saves" g={data.summary.saves} />
            </View>

            {/* RETENTION */}
            <Text style={styles.sectionLabel}>Retention curve</Text>
            <View style={styles.card}>
              <View style={styles.retentionHead}>
                <View>
                  <Text style={styles.retentionLabel}>Watched to the end</Text>
                  <Text style={styles.retentionValue}>{data.retention.average}%</Text>
                </View>
                <View style={{ alignItems: "flex-end", gap: 3 }}>
                  <Text style={styles.retentionAvgLabel}>Avg. watch</Text>
                  <Text style={styles.retentionAvgValue}>{formatDuration(avgWatchSec)}</Text>
                </View>
              </View>
              {data.retention.segments.length > 0 ? (
                <>
                  <View style={styles.retentionBars}>
                    {data.retention.segments.map((seg, i) => (
                      <View key={i} style={styles.retentionCol}>
                        <View style={[styles.retentionBar, { height: Math.max(6, seg.retention * 0.8), backgroundColor: `rgba(244,43,91,${1 - i * 0.2})` }]} />
                      </View>
                    ))}
                  </View>
                  <View style={styles.retentionAxis}>
                    {data.retention.segments.map((seg, i) => (
                      <Text key={i} style={styles.retentionAxisText} numberOfLines={1}>{seg.label.split("–")[0]?.trim()}</Text>
                    ))}
                  </View>
                </>
              ) : (
                <View style={styles.emptyWrap}>
                  <TrendingUp size={22} color={sd.faint} />
                  <Text style={styles.emptyText}>No retention data yet</Text>
                </View>
              )}
            </View>

            {/* TRAFFIC SOURCES */}
            <Text style={styles.sectionLabel}>Traffic sources</Text>
            <View style={styles.card}>
              {data.traffic_sources.length > 0 ? (
                <View style={{ gap: 13 }}>
                  {data.traffic_sources.map((s) => (
                    <Bar key={s.source} source={s.source} pct={s.pct} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <TrendingUp size={22} color={sd.faint} />
                  <Text style={styles.emptyText}>Source tracking not yet available</Text>
                </View>
              )}
            </View>

            {/* AUDIENCE */}
            <Text style={styles.sectionLabel}>Audience</Text>
            <View style={styles.card}>
              <View style={styles.locTabs}>
                {(["countries", "cities"] as const).map((t) => (
                  <Pressable key={t} style={[styles.locTab, locTab === t && styles.locTabOn]} onPress={() => setLocTab(t)}>
                    <Text style={[styles.locTabText, locTab === t && styles.locTabTextOn]}>{t === "countries" ? "Countries" : "Cities"}</Text>
                  </Pressable>
                ))}
              </View>
              {locations && locations.length > 0 ? (
                <View style={{ gap: 13, marginTop: 13 }}>
                  {locations.map((l) => (
                    <Bar key={l.name} source={l.name} pct={l.pct} />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyWrap}>
                  <Film size={22} color={sd.faint} />
                  <Text style={styles.emptyText}>Location data not yet available</Text>
                </View>
              )}
            </View>

            {/* TOP COMMENTS */}
            {data.top_comments.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>Top comments</Text>
                <View style={styles.card}>
                  <View style={{ gap: 13 }}>
                    {data.top_comments.map((c) => (
                      <View key={c.id} style={styles.commentRow}>
                        {c.avatar ? (
                          <Image source={c.avatar} style={styles.commentAvatar} contentFit="cover" />
                        ) : (
                          <View style={[styles.commentAvatar, styles.commentAvatarFallback]}>
                            <Text style={styles.commentAvatarLetter}>{(c.name || "?")[0]?.toUpperCase()}</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                          <View style={styles.commentHead}>
                            <Text style={styles.commentUsername} numberOfLines={1}>@{c.username}</Text>
                            <View style={styles.commentLikes}>
                              <Heart size={10} color={sd.muted} />
                              <Text style={styles.commentLikesText}>{formatCompact(c.likes)}</Text>
                            </View>
                          </View>
                          <Text style={styles.commentText} numberOfLines={2}>{c.text}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                </View>
              </>
            )}

            <Pressable
              style={styles.promoteBtn}
              onPress={() => navigation.navigate("Studio", { section: "ads", promoteVideo: video })}
            >
              <Flag size={16} color="#FFFFFF" strokeWidth={2.1} />
              <Text style={styles.promoteBtnText}>Promote this post</Text>
            </Pressable>
            <Text style={styles.footerNote}>Stats update as new activity comes in</Text>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row", alignItems: "center", gap: 10,
    paddingHorizontal: spacing.lg, paddingBottom: spacing.md,
    backgroundColor: "#FFFFFF", borderBottomWidth: 1, borderBottomColor: sd.divider,
  },
  circleBtn: { width: 36, height: 36, borderRadius: sr.pill, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  headerTitle: { fontSize: 17, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.3 },
  headerSub: { fontSize: 11.5, color: sd.muted, marginTop: 1 },

  scroll: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: spacing.xxl, gap: 0 },

  emptyWrap: { alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 30 },
  emptyText: { fontSize: 12.5, color: sd.muted, textAlign: "center" },

  /* Hero */
  hero: { borderRadius: sr.hero, backgroundColor: sd.ink, padding: 16, gap: 16, overflow: "hidden" },
  heroTop: { flexDirection: "row", gap: 12, alignItems: "center" },
  heroThumb: { width: 58, height: 76, borderRadius: 13, overflow: "hidden", backgroundColor: "rgba(255,255,255,0.08)" },
  heroThumbFallback: { alignItems: "center", justifyContent: "center" },
  heroCaption: { fontSize: 13.5, fontWeight: font.weightBold, color: "#FFFFFF", lineHeight: 18, letterSpacing: -0.2 },
  heroDurationPill: { alignSelf: "flex-start", backgroundColor: "rgba(255,255,255,0.08)", borderRadius: sr.pill, paddingHorizontal: 8, paddingVertical: 4 },
  heroDurationText: { fontSize: 9.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.6)" },

  periodTabs: { flexDirection: "row", gap: 4, backgroundColor: "rgba(255,255,255,0.07)", padding: 3, borderRadius: sr.pill },
  periodTab: { flex: 1, borderRadius: sr.pill, paddingVertical: 8, alignItems: "center" },
  periodTabOn: { backgroundColor: "#FFFFFF" },
  periodTabText: { fontSize: 11.5, fontWeight: font.weightHeavy, color: "rgba(255,255,255,0.55)" },
  periodTabTextOn: { color: sd.text },

  heroValueRow: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  heroValueLabel: { fontSize: 11.5, fontWeight: font.weightBold, color: "rgba(255,255,255,0.5)" },
  heroValue: { marginTop: 5, fontSize: 34, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -1.5, lineHeight: 36 },
  growthChip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: sr.pill, paddingHorizontal: 9, paddingVertical: 6 },
  growthChipText: { fontSize: 11, fontWeight: font.weightHeavy },

  chartRow: { flexDirection: "row", alignItems: "flex-end", gap: 5, height: 78, marginHorizontal: 2 },
  chartCol: { flex: 1, height: "100%", alignItems: "center", justifyContent: "flex-end", gap: 6 },
  chartBar: { width: "100%", borderRadius: 6, backgroundColor: "#F1EFF3" },
  chartBarPeak: { backgroundColor: sd.accent },
  chartBarLabel: { fontSize: 9, fontWeight: font.weightBold, color: "rgba(255,255,255,0.35)" },

  /* Smart tip */
  tipCard: { flexDirection: "row", gap: 12, borderRadius: sr.panel, backgroundColor: "#F6F4FE", padding: 15, marginTop: 11 },
  tipIcon: { width: 30, height: 30, borderRadius: 10, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" },
  tipHeadRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  tipHeading: { fontSize: 12.5, fontWeight: font.weightHeavy, color: "#3B2E6E", letterSpacing: -0.1 },
  tipBadge: { backgroundColor: "#EDE7FD", borderRadius: sr.pill, paddingHorizontal: 7, paddingVertical: 3 },
  tipBadgeText: { fontSize: 8.5, fontWeight: font.weightHeavy, color: "#8B5CF6", letterSpacing: 0.5 },
  tipBody: { fontSize: 12, color: "#5E5581", lineHeight: 17.5 },

  sectionLabel: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.muted, letterSpacing: 0.7, textTransform: "uppercase", paddingTop: 24, paddingBottom: 9 },

  card: { borderRadius: sr.panel, backgroundColor: "#FFFFFF", padding: 16 },

  /* Performance */
  perfGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  perfCard: { flexBasis: "47%", flexGrow: 1, minWidth: 0, borderRadius: sr.tile, backgroundColor: "#FFFFFF", padding: 14, gap: 7 },
  perfHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  perfIcon: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  perfLabel: { flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: font.weightMedium, color: sd.muted },
  perfValue: { fontSize: 21, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.8 },
  perfGrowth: { fontSize: 11, fontWeight: font.weightHeavy },

  /* Retention */
  retentionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  retentionLabel: { fontSize: 11.5, color: sd.muted, fontWeight: font.weightMedium },
  retentionValue: { marginTop: 4, fontSize: 26, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -1 },
  retentionAvgLabel: { fontSize: 11, color: sd.muted, fontWeight: font.weightMedium },
  retentionAvgValue: { fontSize: 13, fontWeight: font.weightBold, color: sd.text },
  retentionBars: { flexDirection: "row", alignItems: "flex-end", gap: 6, height: 70, marginTop: 16 },
  retentionCol: { flex: 1, height: "100%", justifyContent: "flex-end" },
  retentionBar: { width: "100%", borderRadius: 5 },
  retentionAxis: { flexDirection: "row", gap: 6, marginTop: 6 },
  retentionAxisText: { flex: 1, fontSize: 9, fontWeight: font.weightMedium, color: sd.faint, textAlign: "center" },

  /* Bars (traffic + audience, shared shape) */
  barRow: { gap: 6 },
  barHead: { flexDirection: "row", alignItems: "center", gap: 9 },
  barLabel: { flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: font.weightMedium, color: sd.slate },
  barPct: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.text },
  barTrack: { height: 7, borderRadius: sr.pill, backgroundColor: sd.divider, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: sr.pill, backgroundColor: sd.accent },

  /* Audience tabs */
  locTabs: { flexDirection: "row", gap: 4, backgroundColor: sd.fillSoft, padding: 3, borderRadius: sr.chip, alignSelf: "flex-start" },
  locTab: { paddingHorizontal: 13, paddingVertical: 6, borderRadius: sr.chip - 2 },
  locTabOn: { backgroundColor: "#FFFFFF" },
  locTabText: { fontSize: 11.5, fontWeight: font.weightBold, color: sd.muted },
  locTabTextOn: { color: sd.accent },

  /* Top comments */
  commentRow: { flexDirection: "row", gap: 10, alignItems: "flex-start" },
  commentAvatar: { width: 32, height: 32, borderRadius: 16 },
  commentAvatarFallback: { backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  commentAvatarLetter: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.muted },
  commentHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  commentUsername: { flex: 1, minWidth: 0, fontSize: 12, fontWeight: font.weightHeavy, color: sd.text },
  commentLikes: { flexDirection: "row", alignItems: "center", gap: 3 },
  commentLikesText: { fontSize: 11, color: sd.muted },
  commentText: { fontSize: 11.5, color: sd.slate, lineHeight: 16 },

  /* Footer CTA */
  promoteBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 50, borderRadius: sr.pill, backgroundColor: sd.accent, marginTop: 22,
    shadowColor: sd.accent, shadowOpacity: 0.28, shadowRadius: 14, shadowOffset: { width: 0, height: 8 }, elevation: 4,
  },
  promoteBtnText: { fontSize: 14, fontWeight: font.weightHeavy, color: "#FFFFFF" },
  footerNote: { textAlign: "center", fontSize: 11, color: sd.faint, paddingTop: 9 },
});
