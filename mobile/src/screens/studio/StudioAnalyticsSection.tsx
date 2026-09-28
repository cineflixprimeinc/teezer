import { useMemo, useState } from "react";
import {
  Alert, LayoutChangeEvent, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View,
} from "react-native";
import Svg, {
  Circle, Defs, LinearGradient as SvgGradient, Path, RadialGradient, Stop,
} from "react-native-svg";
import { Image } from "expo-image";
import * as Clipboard from "expo-clipboard";
import {
  Activity, Bookmark, CheckCheck, Clock, Download, Eye, Gauge, Heart, Inbox,
  MessageCircle, Music2, Play, Repeat, Share2, Sparkles, Timer, TrendingUp, UserPlus, Users,
  type LucideIcon,
} from "lucide-react-native";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/Skeleton";
import {
  studioAnalyticsApi, compact, countryName, deviceLabel, duration, rangeLabel, sourceLabel,
  type DashboardData, type Growth as GrowthT, type HeatCell,
  type PeriodPreset, type RetentionPoint, type SeriesPoint,
} from "@/api/studio-analytics.api";
import { sd, sr } from "./studio-design";
import { font, spacing, TAB_BAR_HEIGHT } from "@/constants/theme";

/**
 * Reelsoo Studio → Analytics, drawn to the Claude Design prototype
 * "ReelSoo App.dc.html" (the `studioIsAnalytics` panel), in its order:
 *
 *   dark hero (range control + headline + chart + series tabs) → what we
 *   noticed → snapshot → audience retention → best time to post → engagement →
 *   traffic sources → where viewers are → top videos → trending now → top
 *   audio → followers → export.
 *
 * Every figure comes from ONE call to /studio/analytics/dashboard - the same
 * ClickHouse-backed endpoint the web Studio reads, so a creator who checks
 * their numbers on the phone and then on the laptop sees the same numbers.
 * The payload's rules are what shape this file:
 *
 *  1. An empty list means "we have no data source", NOT "zero". `cities` is
 *     always empty today, so its tab says why rather than drawing an empty
 *     chart that reads as "nobody watched".
 *  2. A growth figure is only shown when `comparable` is true. 0 → 5 views is
 *     not "+100%", it is the first data that has ever existed.
 *  3. Nothing is sampled, estimated or padded. Where the prototype draws
 *     something this payload cannot source - a sparkline on a metric with no
 *     daily series, a dashed profile-visits reference line, follower
 *     demographics - the slot is left empty instead of being filled with a
 *     plausible shape.
 */

/* ── Period ─────────────────────────────────────────────────────────────────── */

const PERIODS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Today" },
  { value: "7",     label: "7 days" },
  { value: "28",    label: "28 days" },
  { value: "90",    label: "90 days" },
];

/* ── Palette ────────────────────────────────────────────────────────────────── */

/** The hero card is the one dark surface on this page, so its inks live here
 *  rather than in the shared `sd` tokens. */
const HERO_BG = "#141318";
const HERO_LABEL = "rgba(255,255,255,0.5)";
const HERO_AXIS = "rgba(255,255,255,0.35)";
const HERO_GRID = "rgba(255,255,255,0.07)";
const HERO_FILL = "rgba(255,255,255,0.07)";
const HERO_TAB_INK = "rgba(255,255,255,0.7)";
/** Mint, for the trend pill on dark. `sd.up` is tuned for white and goes muddy. */
const MINT = "#5FE0AE";
const MINT_WASH = "rgba(95,224,174,0.16)";
const ROSE = "#FF7A9A";
const ROSE_WASH = "rgba(244,43,91,0.18)";

const PILL_OFF = "#F1EFF3";
/** The violet family the "what we noticed" card is drawn in. */
const VIOLET = "#8B5CF6";
const AI_BG = "#F6F4FE";
const AI_TITLE = "#3B2E6E";
const AI_BODY = "#5E5581";
const AI_CHIP = "#EDE7FD";
/** The green the prototype uses for text on a wash - a step darker than `sd.up`,
 *  which is tuned for solid fills. */
const GREEN_INK = "#1F7A5A";

/* ── Charts ─────────────────────────────────────────────────────────────────── */

const GRAPH_H = 128;
const RETENTION_H = 110;
/** The snapshot tile's trace is a fixed 52×20 slot beside the delta, not a
 *  full-width strip under it. */
const SPARK_W = 52;
const SPARK_H = 20;
/** The prototype's axis carries seven labels however long the period is. */
const AXIS_TICKS = 7;

/** Smooth, gentle curve through the points (horizontal-tangent Bezier) - reads
 *  far cleaner at these heights than sharp point-to-point segments. */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)} ${points[0].y.toFixed(1)}`;
  for (let i = 1; i < points.length; i++) {
    const p0 = points[i - 1];
    const p1 = points[i];
    const midX = (p0.x + p1.x) / 2;
    d += ` C ${midX.toFixed(1)} ${p0.y.toFixed(1)}, ${midX.toFixed(1)} ${p1.y.toFixed(1)}, ${p1.x.toFixed(1)} ${p1.y.toFixed(1)}`;
  }
  return d;
}

/** Series → plot coordinates, normalised to the series' own maximum. */
function plot(values: number[], width: number, height: number, pad = 3) {
  const max = Math.max(1, ...values);
  return values.map((v, i) => ({
    x: values.length > 1 ? (i / (values.length - 1)) * width : width / 2,
    y: height - (v / max) * (height - pad * 2) - pad,
  }));
}

/**
 * The hero's line-and-area chart.
 *
 * One series at a time, chosen by the tabs under it. Views, watch time,
 * followers and engagement share no unit, so drawing them together would
 * flatten whichever number is smaller into the baseline - the prototype's tabs
 * are what make a single honest scale possible. The last point carries a ring,
 * as the prototype draws it.
 */
function Chart({ points, color }: { points: SeriesPoint[]; color: string }) {
  const [width, setWidth] = useState(0);

  const pts = width > 0 ? plot(points.map((p) => p.value), width, GRAPH_H) : [];
  const line = smoothPath(pts);
  const area = pts.length
    ? `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${GRAPH_H} L ${pts[0].x.toFixed(1)} ${GRAPH_H} Z`
    : "";
  const last = pts.length ? pts[pts.length - 1] : null;

  return (
    <View style={styles.graphBox} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.gridLines} pointerEvents="none">
        {[0, 1, 2, 3].map((i) => <View key={i} style={styles.gridLine} />)}
      </View>

      {width > 0 && (
        <Svg width={width} height={GRAPH_H}>
          <Defs>
            <SvgGradient id="studioChartFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={color} stopOpacity={0.3} />
              <Stop offset="1" stopColor={color} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          {pts.length > 1 && <Path d={area} fill="url(#studioChartFill)" />}
          {pts.length > 1 && (
            <Path
              d={line} stroke={color} strokeWidth={2.4} fill="none"
              strokeLinejoin="round" strokeLinecap="round"
            />
          )}
          {/* "Today" is a single day, so there is no line to draw - one dot is
              the honest way to plot one measurement. */}
          {pts.length === 1 && <Circle cx={pts[0].x} cy={pts[0].y} r={4} fill={color} />}
          {!!last && pts.length > 1 && (
            <Circle cx={last.x} cy={last.y} r={4} fill={HERO_BG} stroke={color} strokeWidth={2.2} />
          )}
        </Svg>
      )}
    </View>
  );
}

/** The 52×20 trace on a snapshot tile. Only drawn for metrics that really do
 *  carry a daily series; the rest keep the empty slot so tiles stay level. */
function Sparkline({ points, color }: { points: SeriesPoint[]; color: string }) {
  if (points.length < 2) return <View style={styles.sparkSlot} />;
  const pts = plot(points.map((p) => p.value), SPARK_W, SPARK_H, 2);
  return (
    <View style={styles.sparkSlot}>
      <Svg width={SPARK_W} height={SPARK_H}>
        <Path
          d={smoothPath(pts)} stroke={color} strokeWidth={1.8} fill="none"
          strokeLinejoin="round" strokeLinecap="round"
        />
      </Svg>
    </View>
  );
}

/** The retention curve: x is the position through the video, not a date. */
function RetentionChart({ curve }: { curve: RetentionPoint[] }) {
  const [width, setWidth] = useState(0);

  const max = Math.max(1, ...curve.map((p) => p.retention));
  const pts = width > 0
    ? curve.map((p) => ({
        x: (Math.max(0, Math.min(100, p.pct)) / 100) * width,
        y: RETENTION_H - (p.retention / max) * (RETENTION_H - 6) - 3,
      }))
    : [];
  const line = smoothPath(pts);
  const area = pts.length
    ? `${line} L ${pts[pts.length - 1].x.toFixed(1)} ${RETENTION_H} L ${pts[0].x.toFixed(1)} ${RETENTION_H} Z`
    : "";

  return (
    <View style={styles.retentionBox} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
      <View style={styles.gridLinesLight} pointerEvents="none">
        {[0, 1, 2].map((i) => <View key={i} style={styles.gridLineLight} />)}
      </View>

      {width > 0 && (
        <Svg width={width} height={RETENTION_H}>
          <Defs>
            <SvgGradient id="studioRetentionFill" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={sd.accent} stopOpacity={0.2} />
              <Stop offset="1" stopColor={sd.accent} stopOpacity={0} />
            </SvgGradient>
          </Defs>
          {pts.length > 1 && <Path d={area} fill="url(#studioRetentionFill)" />}
          {pts.length > 1 && (
            <Path
              d={line} stroke={sd.accent} strokeWidth={2.4} fill="none"
              strokeLinejoin="round" strokeLinecap="round"
            />
          )}
        </Svg>
      )}
    </View>
  );
}

/**
 * Several daily series summed date-by-date.
 *
 * Used for the Engagement tab, where the payload carries likes, comments,
 * shares and saves as four separate ClickHouse series but no combined one.
 * Adding real per-day counts is an aggregation, not an estimate - the legend
 * names exactly which four go into the line.
 */
function mergeSeries(...lists: SeriesPoint[][]): SeriesPoint[] {
  const byDate = new Map<string, number>();
  for (const list of lists) {
    for (const p of list) byDate.set(p.date, (byDate.get(p.date) ?? 0) + p.value);
  }
  return [...byDate.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([date, value]) => ({ date, value }));
}

/** Up to seven evenly-spaced dates from the series, as "8/2". */
function axisLabels(points: SeriesPoint[]): string[] {
  if (points.length === 0) return [];
  const step = points.length <= AXIS_TICKS ? 1 : (points.length - 1) / (AXIS_TICKS - 1);
  const idx: number[] = [];
  for (let i = 0; i < Math.min(points.length, AXIS_TICKS); i++) {
    const at = Math.round(i * step);
    if (!idx.includes(at)) idx.push(at);
  }
  return idx.map((i) => {
    const d = new Date(points[i].date);
    return Number.isNaN(d.getTime())
      ? points[i].date
      : d.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
  });
}

/**
 * Where the curve loses the most viewers at once.
 *
 * Measured as the steepest single step DOWN between neighbouring samples, which
 * is the moment a creator can actually act on. Null when the curve only ever
 * holds or climbs - claiming a "biggest drop" on a flat line would invent a
 * problem that isn't there.
 */
function retentionInfo(curve: RetentionPoint[]) {
  if (curve.length === 0) return null;
  const end = curve[curve.length - 1].retention;
  let at: number | null = null;
  let size = 0;
  for (let i = 1; i < curve.length; i++) {
    const fall = curve[i - 1].retention - curve[i].retention;
    if (fall > size) { size = fall; at = curve[i].pct; }
  }
  return { end, at, size };
}

/* ── Growth ─────────────────────────────────────────────────────────────────── */

/** The pill beside the hero headline. Says "No prior period" rather than a
 *  percentage when the previous period held no data at all. */
function TrendPill({ g }: { g: GrowthT }) {
  if (!g?.comparable) {
    return (
      <View style={[styles.trendPill, { backgroundColor: HERO_FILL }]}>
        <Text style={[styles.trendText, { color: HERO_LABEL }]}>No prior period</Text>
      </View>
    );
  }
  const up = g.up;
  return (
    <View style={[styles.trendPill, { backgroundColor: up ? MINT_WASH : ROSE_WASH }]}>
      <Svg width={11} height={11} viewBox="0 0 24 24">
        <Path
          d={up ? "M5 15l7-7 7 7" : "M5 9l7 7 7-7"}
          stroke={up ? MINT : ROSE} strokeWidth={2.8} fill="none"
          strokeLinecap="round" strokeLinejoin="round"
        />
      </Svg>
      <Text style={[styles.trendText, { color: up ? MINT : ROSE }]}>{g.pct}%</Text>
    </View>
  );
}

/** The small delta chip on a snapshot tile and at the end of an engagement row. */
function Delta({ g }: { g: GrowthT }) {
  if (!g?.comparable) {
    return <Text style={[styles.deltaText, { color: sd.faint }]}>No prior data</Text>;
  }
  const up = g.up;
  return (
    <Text style={[styles.deltaText, { color: up ? sd.up : sd.down }]}>
      {up ? "+" : "-"}{g.pct}%
    </Text>
  );
}

/* ── Best time to post ──────────────────────────────────────────────────────── */

/** The prototype's heatmap is six columns wide, so the day is read in four-hour
 *  blocks rather than 24 single hours. */
const HEAT_COLS = [
  { label: "12A", from: 0 },  { label: "4A", from: 4 },   { label: "8A", from: 8 },
  { label: "12P", from: 12 }, { label: "4P", from: 16 },  { label: "8P", from: 20 },
];
/** `dow` arrives 0-based MONDAY-first (ClickHouse `toDayOfWeek() - 1`), which is
 *  the order the rows are drawn in - no rotation needed. */
const HEAT_DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
/** Five steps, matching the five swatches in the Fewer → More scale. */
const HEAT_STEPS = ["#F4F2F5", "rgba(20,19,24,0.16)", "rgba(20,19,24,0.34)", "rgba(20,19,24,0.60)", sd.ink];

/**
 * HeatCell[] → a 7×6 grid of 0-4 levels.
 *
 * Views are summed into each four-hour block and the whole grid is then scaled
 * against its own busiest block, so the darkest cell is always the creator's
 * real peak rather than an absolute threshold that would leave a small account
 * with a uniformly blank chart.
 */
function toHeatLevels(cells: HeatCell[]): number[][] {
  const sums = HEAT_DAYS.map(() => HEAT_COLS.map(() => 0));
  for (const c of cells) {
    if (c.dow < 0 || c.dow > 6 || c.hour < 0 || c.hour > 23) continue;
    sums[c.dow][Math.floor(c.hour / 4)] += c.views;
  }
  const max = Math.max(0, ...sums.flat());
  if (max <= 0) return sums.map((row) => row.map(() => 0));
  return sums.map((row) => row.map((v) => (v <= 0 ? 0 : Math.max(1, Math.ceil((v / max) * 4)))));
}

/* ── Shared bits ────────────────────────────────────────────────────────────── */

/** One "name — bar — %" row. Traffic sources fill in ink, geography in brand. */
function BarRow({ name, pct, fill, nameWidth, pctWidth }: {
  name: string; pct: number; fill: string; nameWidth: number; pctWidth: number;
}) {
  return (
    <View style={styles.barRow}>
      <Text style={[styles.barName, { flexBasis: nameWidth, width: nameWidth }]} numberOfLines={1}>
        {name}
      </Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(0, Math.min(100, pct))}%`, backgroundColor: fill }]} />
      </View>
      <Text style={[styles.barPct, { flexBasis: pctWidth, width: pctWidth }]} numberOfLines={1}>{pct}%</Text>
    </View>
  );
}

/** Shown when a block has NO DATA SOURCE - not when a value is zero. */
function EmptyBlock({ title, sub }: { title: string; sub: string }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyCircle}>
        <Inbox size={24} color={sd.faint} strokeWidth={1.9} />
      </View>
      <Text style={styles.emptyTitle}>{title}</Text>
      <Text style={styles.emptySub}>{sub}</Text>
    </View>
  );
}

/** The light pill row the geography tabs use, below the hero. */
function PillRow<T extends string>({ items, value, onPick }: {
  items: { value: T; label: string }[];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <View style={styles.tabRowStatic}>
      {items.map((it) => {
        const on = it.value === value;
        return (
          <Pressable
            key={it.value}
            style={[styles.pill, on ? styles.pillOn : styles.pillOff]}
            onPress={() => onPick(it.value)}
          >
            <Text style={[styles.pillText, on ? styles.pillTextOn : styles.pillTextOff]}>{it.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/* ── Export ─────────────────────────────────────────────────────────────────── */

function cell(v: string | number): string {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * The whole dashboard payload as CSV, built from what is already in memory.
 *
 * There is no export endpoint on the server, so nothing here is re-fetched and
 * nothing is invented - the report can only ever contain what the page was
 * showing. Growth columns carry the comparable flag rather than silently
 * printing a percentage computed against a zero baseline.
 */
function buildCsv(d: DashboardData): string {
  const rows: string[] = [];
  const line = (...cols: (string | number)[]) => rows.push(cols.map(cell).join(","));
  const gap = () => rows.push("");

  line("Teezer Studio Analytics");
  line("Period", d.period.start, d.period.end);
  line("Compared to", d.previous_period.start, d.previous_period.end);
  gap();

  line("Metric", "Value", "Change %", "Comparable");
  const summary: [string, keyof DashboardData["summary"]][] = [
    ["Views", "views"],
    ["Watch time (hours)", "watch_time_hours"],
    ["Average watch (seconds)", "avg_watch_duration"],
    ["Audience retention (%)", "audience_retention"],
    ["Engagement rate (%)", "engagement_rate"],
    ["Followers gained", "followers_gained"],
    ["Profile visits", "profile_visits"],
    ["Estimated earnings (USD)", "estimated_earnings"],
  ];
  for (const [label, key] of summary) {
    const m = d.summary[key];
    line(label, m.value, m.growth.comparable ? (m.growth.up ? m.growth.pct : -m.growth.pct) : "", m.growth.comparable ? "yes" : "no");
  }
  gap();

  line("Engagement", "Value", "Change %", "Comparable");
  const engagement: [string, keyof DashboardData["engagement"]][] = [
    ["Likes", "likes"], ["Comments", "comments"], ["Shares", "shares"],
    ["Saves", "saves"], ["Rewatch rate (%)", "rewatch_rate"], ["Completion rate (%)", "completion_rate"],
  ];
  for (const [label, key] of engagement) {
    const m = d.engagement[key];
    line(label, m.value, m.growth.comparable ? (m.growth.up ? m.growth.pct : -m.growth.pct) : "", m.growth.comparable ? "yes" : "no");
  }
  gap();

  line("Date", "Views", "Watch time (hours)", "Followers gained");
  const watchByDate = new Map(d.charts.watch_time_growth.map((p) => [p.date, p.value]));
  const followersByDate = new Map(d.followers.series.map((p) => [p.date, p.value]));
  for (const p of d.charts.views_over_time) {
    line(p.date, p.value, watchByDate.get(p.date) ?? "", followersByDate.get(p.date) ?? "");
  }
  gap();

  line("Video position %", "Retention %");
  for (const p of d.charts.retention_curve) line(p.pct, p.retention);
  gap();

  line("Traffic source", "Views", "Share %");
  for (const r of d.audience.traffic_sources) line(sourceLabel(r.name), r.count, r.pct);
  gap();

  line("Territory", "Views", "Share %");
  for (const r of d.audience.countries) line(countryName(r.name), r.count, r.pct);
  gap();

  line("Device", "Views", "Share %");
  for (const r of d.audience.devices) line(deviceLabel(r.name), r.count, r.pct);
  gap();

  line("Top video", "Views", "Watch time (hours)", "Completion %", "Likes", "Comments", "Shares", "Saves");
  for (const v of d.top_videos) {
    line(v.title, v.views, v.watch_time_hours, v.completion, v.likes, v.comments, v.shares, v.saves);
  }
  gap();

  line("Trending video", "Views", "Growth %");
  for (const v of d.trending_videos) line(v.title, v.views, v.growth);
  gap();

  line("Top audio", "Artist", "Videos", "Views");
  for (const a of d.top_audio) line(a.title, a.artist ?? "", a.videos_count, a.views);
  gap();

  line("Followers total", d.followers.total);
  line("Followers gained", d.followers.gained);
  line("Followers lost", d.followers.lost);
  line("Followers net", d.followers.net);

  if (d.best_time.peak) {
    gap();
    line("Best time to post", `${d.best_time.peak.day}, ${d.best_time.peak.window}`);
  }

  return rows.join("\n");
}

/* ── Screen ─────────────────────────────────────────────────────────────────── */

type ChartKey = "views" | "watch" | "followers" | "engagement";
type GeoKey = "countries" | "cities" | "devices";

const CHART_TABS: { value: ChartKey; label: string }[] = [
  { value: "views",      label: "Views" },
  { value: "watch",      label: "Watch time" },
  { value: "followers",  label: "Followers" },
  { value: "engagement", label: "Engagement" },
];

const GEO_TABS: { value: GeoKey; label: string }[] = [
  { value: "countries", label: "Countries" },
  { value: "cities",    label: "Cities" },
  { value: "devices",   label: "Devices" },
];

export function StudioAnalyticsSection({ onSeeAllVideos }: { onSeeAllVideos?: () => void }) {
  const [period, setPeriod] = useState<PeriodPreset>("28");
  const [chart, setChart] = useState<ChartKey>("views");
  const [geo, setGeo] = useState<GeoKey>("countries");
  const [allInsights, setAllInsights] = useState(false);

  const q = useQuery({
    queryKey: ["studio", "analytics", "dashboard", period],
    queryFn: () => studioAnalyticsApi.dashboard({ period }),
    // Matches the server's 5-minute cache; refetching sooner only ever returns
    // the same cached payload.
    staleTime: 5 * 60_000,
    placeholderData: (prev) => prev,
    retry: 1,
  });

  const data = q.data;
  const heat = useMemo(() => toHeatLevels(data?.best_time.cells ?? []), [data?.best_time.cells]);
  const retention = useMemo(() => retentionInfo(data?.charts.retention_curve ?? []), [data?.charts.retention_curve]);

  /** The Engagement tab's line: the four interaction series added per day. */
  const interactions = useMemo(() => {
    const e = data?.engagement;
    if (!e) return [];
    return mergeSeries(e.likes.series, e.comments.series, e.shares.series, e.saves.series);
  }, [data?.engagement]);

  const series =
    chart === "views"     ? data?.charts.views_over_time ?? []
    : chart === "watch"   ? data?.charts.watch_time_growth ?? []
    // Verified against the endpoint: this is COUNT(*) of new followers grouped
    // by day, so it is followers GAINED per day - not a running total.
    : chart === "followers" ? data?.followers.series ?? []
    : interactions;
  const axis = useMemo(() => axisLabels(series), [series]);

  async function onExport() {
    if (!data) return;
    try {
      await Clipboard.setStringAsync(buildCsv(data));
      Alert.alert("Report copied", "The CSV is on your clipboard - paste it into Sheets, Excel or Numbers.");
    } catch {
      Alert.alert("Couldn't copy", "The report couldn't be written to your clipboard.");
    }
  }

  /** The segmented range control that lives at the top of the dark hero. It is
   *  rendered in every state so the period can still be changed while a slower
   *  range is loading. */
  const rangeControl = (
    <View style={styles.segment}>
      {PERIODS.map((p) => {
        const on = p.value === period;
        return (
          <Pressable
            key={p.value}
            style={[styles.segmentItem, on && styles.segmentItemOn]}
            onPress={() => setPeriod(p.value)}
          >
            <Text style={[styles.segmentText, on && styles.segmentTextOn]} numberOfLines={1}>
              {p.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  if (q.isLoading || (!data && !q.isError)) {
    return (
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>{rangeControl}</View>
        <View style={{ height: 11 }} />
        <Skeleton height={86} radius={sr.panel} />
        <View style={{ height: 26 }} />
        <View style={styles.kpiGrid}>
          {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} width="48%" height={104} radius={18} />)}
        </View>
        <View style={{ height: 26 }} />
        <Skeleton height={230} radius={22} />
      </ScrollView>
    );
  }

  if (q.isError || !data) {
    return (
      <View style={styles.errorBox}>
        <View style={styles.emptyCircle}>
          <Inbox size={24} color={sd.faint} strokeWidth={1.9} />
        </View>
        <Text style={styles.emptyTitle}>Analytics is unavailable</Text>
        <Text style={styles.emptySub}>
          We couldn&apos;t load your data. Rather than show you numbers we can&apos;t stand behind,
          we&apos;d rather show you nothing.
        </Text>
        <Pressable style={styles.retryBtn} onPress={() => q.refetch()}>
          <Text style={styles.retryText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  const s = data.summary;
  const peak = data.best_time.peak;
  const tz = data.best_time.timezone;
  const range = rangeLabel(data.period.start, data.period.end);
  const insights = data.insights ?? [];

  /* Each tab's headline, trend and line. Line colours are picked to read on the
     dark hero - `sd.ink` would be invisible there. The Engagement tab is the
     one place the headline and the line are different measures: the payload has
     no combined previous-period interaction total, so inventing one to put in
     the pill was not an option. The rate is the real figure with a real
     comparison, and the legend names precisely what the line adds up. */
  const chartMeta = {
    views: {
      label: "Video views", total: compact(s.views.value),
      g: s.views.growth, color: sd.accent, legend: "Views",
    },
    watch: {
      label: "Watch time", total: `${compact(s.watch_time_hours.value)}h`,
      g: s.watch_time_hours.growth, color: "#6EC2FA", legend: "Watch time (hours)",
    },
    followers: {
      label: "Followers gained", total: compact(data.followers.gained),
      g: s.followers_gained.growth, color: "#FFB661", legend: "New followers per day",
    },
    engagement: {
      label: "Engagement rate", total: `${s.engagement_rate.value}%`,
      g: s.engagement_rate.growth, color: "#B69BFF", legend: "Likes + comments + shares + saves",
    },
  }[chart];

  /* ── Snapshot ───────────────────────────────────────────────────────────
     Six of the payload's eight summary metrics. Retention and earnings are
     left out here because retention has its own block below and earnings
     belong to the Monetization page - showing them twice would invite the two
     to disagree. `spark` is only set where a real daily series exists. */
  const kpis: {
    key: string; label: string; value: string; icon: LucideIcon;
    tint: string; ink: string; g: GrowthT; spark?: SeriesPoint[];
  }[] = [
    {
      key: "views", label: "Views", value: compact(s.views.value), icon: Eye,
      tint: "#FDECF1", ink: sd.accent, g: s.views.growth, spark: data.charts.views_over_time,
    },
    {
      key: "watch", label: "Watch time", value: `${compact(s.watch_time_hours.value)}h`, icon: Clock,
      tint: "#EAF3FD", ink: "#2FA0F0", g: s.watch_time_hours.growth, spark: data.charts.watch_time_growth,
    },
    {
      key: "avg", label: "Avg. watch", value: duration(s.avg_watch_duration.value), icon: Timer,
      tint: "#F0ECFB", ink: VIOLET, g: s.avg_watch_duration.growth,
    },
    {
      key: "engagement", label: "Engagement rate", value: `${s.engagement_rate.value}%`, icon: Gauge,
      tint: sd.upWash, ink: sd.up, g: s.engagement_rate.growth,
    },
    {
      key: "followers", label: "Followers gained", value: compact(s.followers_gained.value), icon: UserPlus,
      tint: "#FFF4E8", ink: "#E08A2E", g: s.followers_gained.growth, spark: data.followers.series,
    },
    {
      key: "visits", label: "Profile visits", value: compact(s.profile_visits.value), icon: Users,
      tint: sd.fillSoft, ink: sd.slate, g: s.profile_visits.growth,
    },
  ];

  const engagementRows: { key: string; label: string; icon: LucideIcon; value: string; g: GrowthT }[] = [
    { key: "likes",      label: "Likes",           icon: Heart,         value: compact(data.engagement.likes.value),    g: data.engagement.likes.growth },
    { key: "comments",   label: "Comments",        icon: MessageCircle, value: compact(data.engagement.comments.value), g: data.engagement.comments.growth },
    { key: "shares",     label: "Shares",          icon: Share2,        value: compact(data.engagement.shares.value),   g: data.engagement.shares.growth },
    { key: "saves",      label: "Saves",           icon: Bookmark,      value: compact(data.engagement.saves.value),    g: data.engagement.saves.growth },
    { key: "rewatch",    label: "Rewatch rate",    icon: Repeat,        value: `${data.engagement.rewatch_rate.value}%`,    g: data.engagement.rewatch_rate.growth },
    { key: "completion", label: "Completion rate", icon: CheckCheck,    value: `${data.engagement.completion_rate.value}%`, g: data.engagement.completion_rate.growth },
  ];

  const geoRows = data.audience[geo];
  const geoEmpty = {
    countries: {
      title: "No country data yet",
      sub: "Territories are resolved from where your viewers watched.",
    },
    cities: {
      title: "City data isn't available",
      sub: "Our CDN only reports a viewer's city on plans we're not on, so there is no source for this yet. It is blank rather than zero.",
    },
    devices: {
      title: "No device data yet",
      sub: "Devices are recorded from the app or browser your viewers watch on.",
    },
  }[geo];

  const f = data.followers;
  const followerStats: { label: string; value: string; fg: string }[] = [
    { label: "Total followers", value: compact(f.total), fg: sd.text },
    { label: "Gained",          value: `+${compact(f.gained)}`, fg: sd.up },
    { label: "Lost",            value: `-${compact(f.lost)}`,   fg: sd.down },
    { label: "Net change",      value: `${f.net >= 0 ? "+" : "-"}${compact(Math.abs(f.net))}`, fg: f.net >= 0 ? sd.up : sd.down },
  ];

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scroll}
      refreshControl={
        <RefreshControl
          refreshing={q.isFetching && !q.isLoading}
          onRefresh={() => q.refetch()}
          tintColor={sd.accent}
        />
      }
    >
      {/* ── Hero: range, headline, chart, series tabs ─────────────────── */}
      <View style={styles.hero}>
        <Svg width={280} height={280} style={styles.heroGlow} pointerEvents="none">
          <Defs>
            <RadialGradient id="studioHeroGlow" cx="50%" cy="50%" r="50%">
              <Stop offset="0" stopColor={sd.accent} stopOpacity={0.3} />
              <Stop offset="0.66" stopColor={sd.accent} stopOpacity={0} />
            </RadialGradient>
          </Defs>
          <Circle cx={140} cy={140} r={140} fill="url(#studioHeroGlow)" />
        </Svg>

        {rangeControl}

        <View style={styles.heroHead}>
          <View style={styles.heroHeadLeft}>
            <Text style={styles.heroLabel} numberOfLines={1}>
              {chartMeta.label}{range ? ` · ${range}` : ""}
            </Text>
            <Text style={styles.heroTotal} numberOfLines={1}>{chartMeta.total}</Text>
          </View>
          <TrendPill g={chartMeta.g} />
        </View>

        {series.length === 0 ? (
          <View style={styles.heroEmpty}>
            <Text style={styles.heroEmptyText}>
              Nothing to plot yet. The graph fills in from the day your first view lands.
            </Text>
          </View>
        ) : (
          <>
            <Chart points={series} color={chartMeta.color} />
            <View style={styles.heroAxisRow}>
              {axis.map((label, i) => (
                <Text key={`${label}-${i}`} style={styles.heroAxisLabel}>{label}</Text>
              ))}
            </View>
          </>
        )}

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.heroTabs}
          style={styles.heroTabsOuter}
        >
          {CHART_TABS.map((t) => {
            const on = t.value === chart;
            return (
              <Pressable
                key={t.value}
                style={[styles.heroTab, on && styles.heroTabOn]}
                onPress={() => setChart(t.value)}
              >
                <Text style={[styles.heroTabText, on && styles.heroTabTextOn]}>{t.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── What we noticed ───────────────────────────────────────────
          The payload's own `insights` array. Not rendered at all when the
          server sent none - an insights card with nothing in it is worse than
          no card. */}
      {insights.length > 0 && (
        <Pressable
          style={styles.aiCard}
          onPress={() => setAllInsights((v) => !v)}
          disabled={insights.length < 2}
        >
          <View style={styles.aiIcon}>
            <Sparkles size={15} color={VIOLET} strokeWidth={1.9} />
          </View>
          <View style={styles.aiBody}>
            <View style={styles.aiHead}>
              <Text style={styles.aiTitle} numberOfLines={1}>What we noticed</Text>
              <View style={styles.aiChip}>
                <Text style={styles.aiChipText}>AI</Text>
              </View>
              {insights.length > 1 && (
                <Text style={styles.aiMore}>{allInsights ? "Less" : `+${insights.length - 1}`}</Text>
              )}
            </View>
            {(allInsights ? insights : insights.slice(0, 1)).map((it, i) => (
              <Text key={`${it.type}-${i}`} style={styles.aiText}>{it.text}</Text>
            ))}
          </View>
        </Pressable>
      )}

      {/* ── Snapshot ──────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>SNAPSHOT</Text>
      <View style={styles.kpiGrid}>
        {kpis.map((k) => {
          const Icon = k.icon;
          return (
            <View key={k.key} style={styles.kpiCard}>
              <View style={styles.kpiHead}>
                <View style={[styles.kpiTile, { backgroundColor: k.tint }]}>
                  <Icon size={13} color={k.ink} strokeWidth={2.2} />
                </View>
                <Text style={styles.kpiLabel} numberOfLines={1}>{k.label}</Text>
              </View>
              <Text style={styles.kpiValue} numberOfLines={1}>{k.value}</Text>
              <View style={styles.kpiFoot}>
                <Delta g={k.g} />
                {k.spark
                  ? <Sparkline points={k.spark} color={k.ink} />
                  : <View style={styles.sparkSlot} />}
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Audience retention ────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>AUDIENCE RETENTION</Text>
      <View style={styles.panel}>
        {!retention || data.charts.retention_curve.length < 2 ? (
          <EmptyBlock
            title="No retention curve yet"
            sub="It is measured from how far through your videos people watch, so it needs a few plays first."
          />
        ) : (
          <>
            <View style={styles.retentionHead}>
              <View style={styles.retentionHeadLeft}>
                <Text style={styles.panelLabel} numberOfLines={1}>Watched to the end</Text>
                <Text style={styles.panelTotal} numberOfLines={1}>{Math.round(retention.end)}%</Text>
              </View>
              {retention.at !== null && retention.size > 0 && (
                <View style={styles.retentionHeadRight}>
                  <Text style={styles.dropLabel} numberOfLines={1}>
                    Biggest drop {Math.round(retention.at)}%
                  </Text>
                  <Text style={styles.dropSub} numberOfLines={1}>
                    −{Math.round(retention.size)}% of viewers
                  </Text>
                </View>
              )}
            </View>

            <RetentionChart curve={data.charts.retention_curve} />

            <View style={styles.axisRow}>
              {["0%", "20%", "40%", "60%", "80%", "100%"].map((l) => (
                <Text key={l} style={styles.axisLabel}>{l}</Text>
              ))}
            </View>
            <Text style={styles.retentionFoot}>Video position</Text>
          </>
        )}
      </View>

      {/* ── Best time to post ─────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>BEST TIME TO POST</Text>
      <View style={styles.panel}>
        {data.best_time.has_data ? (
          <>
            {!!peak && (
              <View style={styles.peakRow}>
                <View style={styles.peakIcon}>
                  <Clock size={17} color="#FFFFFF" strokeWidth={2} />
                </View>
                <View style={styles.peakBody}>
                  <Text style={styles.peakLabel} numberOfLines={1}>{peak.day}, {peak.window}</Text>
                  <Text style={styles.peakSub} numberOfLines={1}>
                    {tz ? `Times shown in ${tz}` : "Your most-watched slot this period"}
                  </Text>
                </View>
                <View style={styles.peakBadge}>
                  <Text style={styles.peakBadgeText}>PEAK</Text>
                </View>
              </View>
            )}

            <View style={styles.heat}>
              <View style={styles.heatHead}>
                {HEAT_COLS.map((c) => <Text key={c.label} style={styles.heatColLabel}>{c.label}</Text>)}
              </View>
              {HEAT_DAYS.map((day, r) => (
                <View key={day} style={styles.heatRow}>
                  <Text style={styles.heatDay}>{day}</Text>
                  {HEAT_COLS.map((c, i) => (
                    <View key={c.label} style={[styles.heatCell, { backgroundColor: HEAT_STEPS[heat[r][i]] }]} />
                  ))}
                </View>
              ))}
            </View>

            <View style={styles.scaleRow}>
              <Text style={styles.scaleText}>Fewer</Text>
              <View style={styles.scaleSwatches}>
                {HEAT_STEPS.map((c, i) => (
                  <View key={i} style={[styles.scaleSwatch, { backgroundColor: c }]} />
                ))}
              </View>
              <Text style={styles.scaleText}>More online</Text>
            </View>
          </>
        ) : (
          <EmptyBlock
            title="No activity yet"
            sub="Your heatmap fills in as people watch your videos."
          />
        )}
      </View>

      {/* ── Engagement ────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>ENGAGEMENT</Text>
      <View style={styles.listCard}>
        {engagementRows.map((e, i) => {
          const Icon = e.icon;
          return (
            <View key={e.key} style={[styles.listRow, i === engagementRows.length - 1 && styles.listRowLast]}>
              <View style={styles.listTile}>
                <Icon size={15} color={sd.slate} strokeWidth={2.1} />
              </View>
              <Text style={styles.rowLabel} numberOfLines={1}>{e.label}</Text>
              <View style={styles.listTail}>
                <Text style={styles.listValue} numberOfLines={1}>{e.value}</Text>
                <Delta g={e.g} />
              </View>
            </View>
          );
        })}
      </View>

      {/* ── Traffic sources ───────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>TRAFFIC SOURCES</Text>
      <View style={[styles.panel, { gap: 13 }]}>
        {data.audience.traffic_sources.length === 0 ? (
          <EmptyBlock
            title="No traffic data yet"
            sub="Sources appear once your posts start being opened from the feed, search or a shared link."
          />
        ) : (
          data.audience.traffic_sources.map((r) => (
            <BarRow key={r.name} name={sourceLabel(r.name)} pct={r.pct} fill={sd.ink} nameWidth={84} pctWidth={34} />
          ))
        )}
      </View>

      {/* ── Where viewers are ─────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>WHERE VIEWERS ARE</Text>
      <PillRow items={GEO_TABS} value={geo} onPick={setGeo} />
      <View style={[styles.panel, { gap: 12 }]}>
        {geoRows.length === 0 ? (
          <EmptyBlock title={geoEmpty.title} sub={geoEmpty.sub} />
        ) : (
          geoRows.map((r) => (
            <BarRow
              key={r.name}
              name={geo === "countries" ? countryName(r.name) : geo === "devices" ? deviceLabel(r.name) : r.name}
              pct={r.pct}
              fill={sd.accent}
              nameWidth={86}
              pctWidth={38}
            />
          ))
        )}
      </View>

      {/* ── Top performing videos ─────────────────────────────────────── */}
      <View style={styles.headRow}>
        <Text style={styles.sectionLabelFlush}>TOP PERFORMING VIDEOS</Text>
        {!!onSeeAllVideos && data.top_videos.length > 0 && (
          <Pressable onPress={onSeeAllVideos} hitSlop={8}>
            <Text style={styles.seeAll}>See all</Text>
          </Pressable>
        )}
      </View>
      {data.top_videos.length === 0 ? (
        <View style={styles.panel}>
          <EmptyBlock
            title="No ranked videos yet"
            sub="Your best performers show up here once they start collecting views in this period."
          />
        </View>
      ) : (
        <View style={{ gap: 9 }}>
          {data.top_videos.map((v, i) => (
            <View key={v.id} style={styles.videoRow}>
              <View style={styles.thumb}>
                {v.thumbnail
                  ? <Image source={v.thumbnail} style={styles.thumbImg} contentFit="cover" transition={150} />
                  : <View style={[styles.thumbImg, styles.thumbFallback]}><Play size={16} color={sd.faint} strokeWidth={2} /></View>}
                <View style={styles.rank}><Text style={styles.rankText}>{i + 1}</Text></View>
              </View>
              <View style={styles.videoBody}>
                <Text style={styles.videoTitle} numberOfLines={1}>{v.title || "Untitled"}</Text>
                <Text style={styles.videoMeta} numberOfLines={1}>
                  {compact(v.views)} views · {duration(v.avg_watch_duration)} avg
                </Text>
                <View style={styles.videoPill}>
                  <Text style={styles.videoPillText}>{Math.round(v.completion)}% watched</Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      )}

      {/* ── Trending now ──────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>TRENDING NOW</Text>
      <View style={styles.listCard}>
        {data.trending_videos.length === 0 ? (
          <EmptyBlock
            title="Nothing trending right now"
            sub="A video lands here when its views are climbing faster than the rest of your library."
          />
        ) : (
          data.trending_videos.map((t, i) => (
            <View key={t.id} style={[styles.listRow, i === data.trending_videos.length - 1 && styles.listRowLast]}>
              <View style={styles.trendTile}>
                <TrendingUp size={15} color={sd.accent} strokeWidth={2.2} />
              </View>
              <View style={styles.listBody}>
                <Text style={styles.listLabel} numberOfLines={1}>{t.title || "Untitled"}</Text>
                <Text style={styles.listSub} numberOfLines={1}>{compact(t.views)} views</Text>
              </View>
              <Text style={[styles.trendDelta, { color: t.growth >= 0 ? GREEN_INK : sd.down }]} numberOfLines={1}>
                {t.growth >= 0 ? "+" : ""}{t.growth}%
              </Text>
            </View>
          ))
        )}
      </View>

      {/* ── Top performing audio ──────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>TOP PERFORMING AUDIO</Text>
      <View style={styles.listCard}>
        {data.top_audio.length === 0 ? (
          <EmptyBlock
            title="No audio data yet"
            sub="Sounds appear here once videos using them start being watched."
          />
        ) : (
          data.top_audio.map((a, i) => (
            <View key={a.id} style={[styles.listRow, i === data.top_audio.length - 1 && styles.listRowLast]}>
              <View style={styles.audioTile}>
                {a.cover
                  ? <Image source={a.cover} style={styles.audioCover} contentFit="cover" transition={150} />
                  : <Music2 size={15} color="#FFFFFF" strokeWidth={2} />}
              </View>
              <View style={styles.listBody}>
                <Text style={styles.listLabel} numberOfLines={1}>{a.title || "Original sound"}</Text>
                <Text style={styles.listSub} numberOfLines={1}>
                  {a.artist ? `${a.artist} · ` : ""}{a.videos_count} {a.videos_count === 1 ? "video" : "videos"}
                </Text>
              </View>
              <Text style={styles.audioViews} numberOfLines={1}>{compact(a.views)}</Text>
            </View>
          ))
        )}
      </View>

      {/* ── Followers ─────────────────────────────────────────────────── */}
      <Text style={styles.sectionLabel}>FOLLOWERS</Text>
      <View style={styles.panel}>
        <View style={styles.followerGrid}>
          {followerStats.map((k) => (
            <View key={k.label} style={styles.followerTile}>
              <Text style={styles.followerLabel} numberOfLines={1}>{k.label}</Text>
              <Text style={[styles.followerValue, { color: k.fg }]} numberOfLines={1}>{k.value}</Text>
            </View>
          ))}
        </View>
        <View style={styles.followerNoteRow}>
          <Activity size={14} color={sd.faint} strokeWidth={2} style={{ marginTop: 1 }} />
          <Text style={styles.followerNote}>
            Gained and lost are counted over {range || "this period"}. Total is your follower count right now.
          </Text>
        </View>
      </View>

      {/* ── Export ────────────────────────────────────────────────────── */}
      <Pressable style={styles.exportBtn} onPress={onExport}>
        <Download size={16} color="#FFFFFF" strokeWidth={2} />
        <Text style={styles.exportText}>Export full report</Text>
      </Pressable>
      <Text style={styles.footNote}>
        Figures are cached for about 5 minutes{range ? ` · ${range}` : ""}
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { paddingHorizontal: 18, paddingTop: spacing.lg, paddingBottom: TAB_BAR_HEIGHT + spacing.xxl },

  /* ── Hero ─────────────────────────────────────────────────────────── */
  hero: {
    borderRadius: 26, overflow: "hidden", backgroundColor: HERO_BG,
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 14, gap: 15,
  },
  heroGlow: { position: "absolute", top: -130, right: -90 },

  segment: { flexDirection: "row", gap: 4, padding: 3, borderRadius: sr.pill, backgroundColor: HERO_FILL },
  segmentItem: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: sr.pill, paddingVertical: 8 },
  segmentItemOn: { backgroundColor: "#FFFFFF" },
  segmentText: { fontSize: 12, fontWeight: font.weightBold, color: "rgba(255,255,255,0.55)" },
  segmentTextOn: { color: sd.text },

  heroHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12, paddingHorizontal: 2 },
  heroHeadLeft: { flex: 1, minWidth: 0, gap: 6 },
  heroLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: HERO_LABEL },
  heroTotal: { fontSize: 40, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -2, lineHeight: 41 },
  trendPill: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: sr.pill, paddingHorizontal: 10, paddingVertical: 6 },
  trendText: { fontSize: 11.5, fontWeight: font.weightHeavy },

  graphBox: { height: GRAPH_H, marginHorizontal: 2, justifyContent: "center" },
  gridLines: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "space-between" },
  gridLine: { height: 1, backgroundColor: HERO_GRID },

  heroEmpty: { height: GRAPH_H, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 },
  heroEmptyText: { fontSize: 12.5, color: HERO_LABEL, textAlign: "center", lineHeight: 19 },

  heroAxisRow: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 2 },
  heroAxisLabel: { fontSize: 9.5, fontWeight: font.weightMedium, color: HERO_AXIS },

  heroTabsOuter: { flexGrow: 0, marginTop: -4 },
  heroTabs: { gap: 6, paddingTop: 4 },
  heroTab: { borderRadius: sr.pill, backgroundColor: HERO_FILL, paddingHorizontal: 14, paddingVertical: 8 },
  heroTabOn: { backgroundColor: sd.accent },
  heroTabText: { fontSize: 12, fontWeight: font.weightBold, color: HERO_TAB_INK },
  heroTabTextOn: { color: "#FFFFFF" },

  /* ── What we noticed ──────────────────────────────────────────────── */
  aiCard: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    marginTop: 11, borderRadius: sr.panel, padding: 15, backgroundColor: AI_BG,
  },
  aiIcon: {
    width: 30, height: 30, borderRadius: 10, backgroundColor: "#FFFFFF",
    alignItems: "center", justifyContent: "center", marginTop: 1,
  },
  aiBody: { flex: 1, minWidth: 0, gap: 5 },
  aiHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  aiTitle: { fontSize: 12.5, fontWeight: font.weightHeavy, color: AI_TITLE, letterSpacing: -0.13 },
  aiChip: { borderRadius: sr.pill, backgroundColor: AI_CHIP, paddingHorizontal: 7, paddingVertical: 3 },
  aiChipText: { fontSize: 8.5, fontWeight: font.weightHeavy, letterSpacing: 0.77, color: VIOLET },
  aiMore: { fontSize: 10.5, fontWeight: font.weightBold, color: VIOLET },
  aiText: { fontSize: 12, color: AI_BODY, lineHeight: 18.6 },

  /* ── Section headings ─────────────────────────────────────────────── */
  headRow: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 12, paddingTop: 26, paddingBottom: 10 },
  sectionLabel: {
    fontSize: 12, fontWeight: font.weightBold, color: sd.muted,
    letterSpacing: 0.72, paddingTop: 26, paddingBottom: 10,
  },
  sectionLabelFlush: { fontSize: 12, fontWeight: font.weightBold, color: sd.muted, letterSpacing: 0.72 },
  seeAll: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.accent },

  /* ── Snapshot ─────────────────────────────────────────────────────── */
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { width: "48%", flexGrow: 1, gap: 6, borderRadius: 18, padding: 14, backgroundColor: sd.fillSoft },
  kpiHead: { flexDirection: "row", alignItems: "center", gap: 7 },
  kpiTile: { width: 22, height: 22, borderRadius: 7, alignItems: "center", justifyContent: "center" },
  kpiLabel: { flex: 1, minWidth: 0, fontSize: 10.5, fontWeight: font.weightMedium, color: sd.muted },
  kpiValue: { fontSize: 21, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.88, lineHeight: 22 },
  kpiFoot: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  deltaText: { fontSize: 11, fontWeight: font.weightHeavy },
  sparkSlot: { width: SPARK_W, height: SPARK_H, justifyContent: "flex-end" },

  /* ── Panels ───────────────────────────────────────────────────────── */
  panel: { borderWidth: 1, borderColor: sd.line, borderRadius: 22, padding: 16, gap: 14, backgroundColor: sd.page },
  listCard: {
    borderWidth: 1, borderColor: sd.line, borderRadius: 22,
    paddingHorizontal: 16, paddingVertical: 2, backgroundColor: sd.page,
  },
  panelLabel: { fontSize: 11.5, fontWeight: font.weightMedium, color: sd.muted },
  panelTotal: { fontSize: 26, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -1.04, lineHeight: 27 },

  /* ── Retention ────────────────────────────────────────────────────── */
  retentionBox: { height: RETENTION_H, justifyContent: "center" },
  gridLinesLight: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, justifyContent: "space-between" },
  gridLineLight: { height: 1, backgroundColor: sd.divider },
  retentionHead: { flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: 12 },
  retentionHeadLeft: { flex: 1, minWidth: 0, gap: 4 },
  retentionHeadRight: { alignItems: "flex-end", gap: 3 },
  dropLabel: { fontSize: 11, fontWeight: font.weightHeavy, color: sd.accent },
  dropSub: { fontSize: 10.5, color: sd.faint },
  retentionFoot: { fontSize: 10.5, color: sd.faint, textAlign: "center" },
  axisRow: { flexDirection: "row", justifyContent: "space-between" },
  axisLabel: { fontSize: 9.5, fontWeight: font.weightMedium, color: sd.faint },

  /* ── Best time to post ────────────────────────────────────────────── */
  peakRow: {
    flexDirection: "row", alignItems: "center", gap: 11, borderRadius: 16,
    backgroundColor: sd.fillSoft, paddingHorizontal: 14, paddingVertical: 12,
  },
  peakIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: sd.ink, alignItems: "center", justifyContent: "center" },
  peakBody: { flex: 1, minWidth: 0, gap: 2 },
  peakLabel: { fontSize: 14, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.21 },
  peakSub: { fontSize: 11, color: sd.muted },
  peakBadge: { borderRadius: sr.pill, backgroundColor: sd.upWash, paddingHorizontal: 8, paddingVertical: 4 },
  peakBadgeText: { fontSize: 9.5, fontWeight: font.weightHeavy, letterSpacing: 0.76, color: GREEN_INK },

  heat: { gap: 5 },
  heatHead: { flexDirection: "row", gap: 4, paddingLeft: 26 },
  heatColLabel: { flex: 1, textAlign: "center", fontSize: 9, fontWeight: font.weightBold, color: sd.faint },
  heatRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  heatDay: { width: 22, fontSize: 9.5, fontWeight: font.weightBold, color: sd.muted },
  heatCell: { flex: 1, height: 18, borderRadius: 5 },

  scaleRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingTop: 2 },
  scaleText: { fontSize: 10, fontWeight: font.weightMedium, color: sd.faint },
  scaleSwatches: { flex: 1, flexDirection: "row", gap: 3 },
  scaleSwatch: { flex: 1, height: 7, borderRadius: 3 },

  /* ── List rows ────────────────────────────────────────────────────── */
  listRow: {
    flexDirection: "row", alignItems: "center", gap: 11, minHeight: 44, paddingVertical: 11,
    borderBottomWidth: 1, borderBottomColor: sd.fillSoft,
  },
  listRowLast: { borderBottomWidth: 0 },
  listTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: sd.fillSoft, alignItems: "center", justifyContent: "center" },
  listBody: { flex: 1, minWidth: 0, gap: 2 },
  /* Inside `listBody` (a column), so NO flex - flex:1 here would claim the
     row's spare vertical space and float the label off the sub-line. */
  listLabel: { fontSize: 13, fontWeight: font.weightBold, color: sd.text },
  /* The same label used as a direct row child, where it does need to take the
     space between the tile and the value. */
  rowLabel: { flex: 1, minWidth: 0, fontSize: 13, fontWeight: font.weightBold, color: sd.text },
  listSub: { fontSize: 11, color: sd.muted },
  listTail: { flexDirection: "row", alignItems: "center", gap: 7 },
  listValue: { fontSize: 14.5, fontWeight: font.weightHeavy, color: sd.text, letterSpacing: -0.36 },

  trendTile: { width: 32, height: 32, borderRadius: sr.pill, backgroundColor: "#FDECF1", alignItems: "center", justifyContent: "center" },
  trendDelta: { fontSize: 11.5, fontWeight: font.weightHeavy },

  audioTile: { width: 32, height: 32, borderRadius: 10, backgroundColor: sd.ink, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  audioCover: { width: 32, height: 32 },
  audioViews: { fontSize: 12, fontWeight: font.weightHeavy, color: sd.text },

  /* ── Bars ─────────────────────────────────────────────────────────── */
  barRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  barName: { flexGrow: 0, flexShrink: 0, fontSize: 12, fontWeight: font.weightMedium, color: sd.slate },
  barTrack: { flex: 1, height: 7, borderRadius: sr.pill, backgroundColor: sd.divider, overflow: "hidden" },
  barFill: { height: "100%", borderRadius: sr.pill },
  barPct: { flexGrow: 0, flexShrink: 0, textAlign: "right", fontSize: 11.5, fontWeight: font.weightBold, color: sd.text },

  /* Geography tabs */
  tabRowStatic: { flexDirection: "row", gap: 6, paddingBottom: 11 },
  pill: { borderRadius: sr.pill, paddingHorizontal: 15, paddingVertical: 9 },
  pillOff: { backgroundColor: PILL_OFF },
  pillOn: { backgroundColor: sd.text },
  pillText: { fontSize: 12.5, fontWeight: font.weightBold },
  pillTextOff: { color: sd.slate },
  pillTextOn: { color: "#FFFFFF" },

  /* ── Top videos ───────────────────────────────────────────────────── */
  videoRow: {
    flexDirection: "row", alignItems: "center", gap: 12,
    borderWidth: 1, borderColor: sd.line, borderRadius: 20, padding: 12, backgroundColor: sd.page,
  },
  thumb: { width: 44, height: 58, borderRadius: 12, overflow: "hidden", backgroundColor: sd.fill },
  thumbImg: { width: 44, height: 58 },
  thumbFallback: { alignItems: "center", justifyContent: "center" },
  rank: {
    position: "absolute", top: 5, left: 5, borderRadius: 5,
    backgroundColor: "rgba(0,0,0,0.55)", paddingHorizontal: 5, paddingVertical: 2,
  },
  rankText: { fontSize: 8.5, fontWeight: font.weightHeavy, color: "#FFFFFF" },
  videoBody: { flex: 1, minWidth: 0, gap: 5 },
  videoTitle: { fontSize: 13, fontWeight: font.weightBold, color: sd.text, letterSpacing: -0.13 },
  videoMeta: { fontSize: 11, color: sd.muted },
  videoPill: { alignSelf: "flex-start", borderRadius: sr.pill, backgroundColor: sd.upWash, paddingHorizontal: 7, paddingVertical: 3 },
  videoPillText: { fontSize: 9.5, fontWeight: font.weightHeavy, color: GREEN_INK },

  /* ── Followers ────────────────────────────────────────────────────── */
  followerGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  followerTile: { width: "48%", flexGrow: 1, gap: 3, borderRadius: 16, backgroundColor: sd.fillSoft, paddingHorizontal: 13, paddingVertical: 12 },
  followerLabel: { fontSize: 10.5, fontWeight: font.weightMedium, color: sd.muted },
  followerValue: { fontSize: 17, fontWeight: font.weightHeavy, letterSpacing: -0.51 },
  followerNoteRow: { flexDirection: "row", alignItems: "flex-start", gap: 9, paddingTop: 12, borderTopWidth: 1, borderTopColor: sd.divider },
  followerNote: { flex: 1, minWidth: 0, fontSize: 11, color: sd.muted, lineHeight: 16.5 },

  /* ── Export ───────────────────────────────────────────────────────── */
  exportBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
    height: 50, marginTop: 20, borderRadius: sr.pill, backgroundColor: sd.ink,
  },
  exportText: { fontSize: 14, fontWeight: font.weightHeavy, color: "#FFFFFF", letterSpacing: -0.14 },
  footNote: { fontSize: 11, color: sd.faint, textAlign: "center", paddingTop: 9 },

  /* ── States ───────────────────────────────────────────────────────── */
  empty: { alignItems: "center", gap: 8, paddingVertical: 34, paddingHorizontal: 12 },
  emptyCircle: { width: 56, height: 56, borderRadius: sr.pill, backgroundColor: sd.fill, alignItems: "center", justifyContent: "center" },
  emptyTitle: { fontSize: 15, fontWeight: font.weightBold, color: sd.text, textAlign: "center" },
  emptySub: { fontSize: 13, color: sd.muted, lineHeight: 19.5, textAlign: "center" },

  errorBox: { alignItems: "center", gap: 8, paddingTop: 56, paddingHorizontal: 34 },
  retryBtn: { marginTop: 6, borderRadius: sr.pill, backgroundColor: sd.accent, paddingHorizontal: 18, paddingVertical: 10 },
  retryText: { fontSize: 13, fontWeight: font.weightBold, color: "#FFFFFF" },
});
