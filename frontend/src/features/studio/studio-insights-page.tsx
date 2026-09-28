"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { ApexOptions } from "apexcharts";
import {
  BarChart2, Bookmark, Calendar, ChevronDown, Clock,
  Eye, ExternalLink, Heart, Info, MapPin, MessageCircle,
  Play, Share2, TrendingUp,
  Video, Volume2, VolumeX,
} from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/services/api";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared, StudioDateRangePicker } from "./studio-topbar-shared";
import { StudioLineChart } from "./studio-chart";
import type { ReelsooVideo } from "@/types/video";

/* ── ApexCharts (SSR-safe) ──────────────────────────────────────────────── */
const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ── Types ──────────────────────────────────────────────────────────────── */
type InsightMetric = "views"|"likes"|"comments"|"shares"|"saves"|"watch_time"|"avg_watch_duration"|"engagement_rate";
interface GrowthInfo { value: number; pct: number; up: boolean }
interface InsightSummary {
  views: GrowthInfo; likes: GrowthInfo; comments: GrowthInfo;
  shares: GrowthInfo; saves: GrowthInfo;
  watch_time_seconds: GrowthInfo; watch_time_hours: number;
  avg_watch_duration: GrowthInfo; engagement_rate: GrowthInfo;
}
interface ChartPt { date: string; label: string; value: number }
interface Segment { label: string; retention: number }
interface Retention { average: number; segments: Segment[] }
interface TrafficSrc { source: string; count: number; pct: number }
interface LocationEntry { name: string; count: number; pct: number }
interface TopComment { id: number; username: string; name: string; avatar: string|null; text: string; likes: number; date: string }
interface InsightsData {
  video: ReelsooVideo;
  period: { start: string; end: string };
  previous_period: { start: string; end: string };
  summary: InsightSummary;
  chart: ChartPt[];
  retention: Retention;
  traffic_sources: TrafficSrc[];
  audience_locations?: { countries: LocationEntry[]; cities: LocationEntry[] };
  top_comments: TopComment[];
}

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n?: number | null) { return formatCompact(n ?? 0); }
function fmtDate(iso?: string | null) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" });
}
function fmtSec(s: number) {
  const m = Math.floor(s / 60), sec = Math.floor(s % 60);
  return `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}
function fmtPeriod(start: string, end: string) {
  const fmt = (d: string) => new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${fmt(start)} - ${fmt(end)}`;
}

/* ── Retention ring ─────────────────────────────────────────────────────── */
function RetentionRing({ pct }: { pct: number }) {
  const r = 44, circ = 2 * Math.PI * r;
  const dash = circ * (pct / 100);
  return (
    <svg viewBox="0 0 100 100" className="h-[120px] w-[120px] -rotate-90">
      <circle cx="50" cy="50" r={r} fill="none" stroke="#f3f4f6" strokeWidth="10" />
      <circle cx="50" cy="50" r={r} fill="none" stroke="#fd4605" strokeWidth="10"
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }} />
    </svg>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
const STAT_META: Record<InsightMetric, { icon: React.ElementType; iconBg: string; iconColor: string; label: string }> = {
  views:               { icon: Eye,         iconBg: "bg-[#fff3ec]", iconColor: "text-[#fd4605]", label: "Views"             },
  likes:               { icon: Heart,       iconBg: "bg-[#fce7f3]", iconColor: "text-[#ec4899]", label: "Likes"             },
  comments:            { icon: MessageCircle,iconBg:"bg-[#ffedd5]", iconColor: "text-[#f97316]", label: "Comments"          },
  shares:              { icon: Share2,      iconBg: "bg-[#ccfbf1]", iconColor: "text-[#0d9488]", label: "Shares"            },
  saves:               { icon: Bookmark,    iconBg: "bg-[#ede9fe]", iconColor: "text-[#7c3aed]", label: "Saves"             },
  watch_time:          { icon: Clock,       iconBg: "bg-[#dbeafe]", iconColor: "text-[#2563eb]", label: "Watch Time"        },
  avg_watch_duration:  { icon: Clock,       iconBg: "bg-[#fef3c7]", iconColor: "text-[#d97706]", label: "Avg Watch Duration"},
  engagement_rate:     { icon: TrendingUp,  iconBg: "bg-[#dcfce7]", iconColor: "text-[#16a34a]", label: "Engagement Rate"   },
};

function InsightCard({ metric, summary, prevPeriod, isActive, onClick, loading }: {
  metric: InsightMetric; summary?: InsightSummary; prevPeriod?: { start: string; end: string };
  isActive: boolean; onClick: () => void; loading: boolean;
}) {
  const cfg   = STAT_META[metric];
  const Icon  = cfg.icon;
  const summaryKey = metric === "watch_time" ? "watch_time_seconds" : metric;
  const g     = summary?.[summaryKey as keyof InsightSummary] as GrowthInfo | undefined;
  const prevL = prevPeriod ? fmtPeriod(prevPeriod.start, prevPeriod.end) : "-";

  let valueStr = "-";
  if (summary) {
    if (metric === "watch_time")         valueStr = `${summary.watch_time_hours}h`;
    else if (metric === "avg_watch_duration") valueStr = fmtSec(g?.value ?? 0);
    else if (metric === "engagement_rate")    valueStr = `${g?.value ?? 0}%`;
    else                                      valueStr = fmt(g?.value);
  }

  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex flex-col gap-1.5 rounded-2xl border bg-white px-4 py-3.5 text-left transition hover:shadow-sm",
        isActive ? "border-[#fd4605] ring-1 ring-[#fd4605]/15" : "border-[#f0f0f0]",
      )}>
      <div className="flex items-center gap-2">
        <div className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-xl", cfg.iconBg)}>
          <Icon className={cn("h-4 w-4", cfg.iconColor)} />
        </div>
        <p className="text-[12px] font-semibold text-[#6b7280]">{cfg.label}</p>
      </div>
      {loading
        ? <div className="h-6 w-20 animate-pulse rounded bg-[#f3f4f6]" />
        : <p className="text-[20px] font-extrabold leading-none text-[#111827]">{valueStr}</p>}
      {loading ? (
        <div className="h-3.5 w-28 animate-pulse rounded bg-[#f3f4f6]" />
      ) : g ? (
        <p className="text-[11px]">
          <span className={cn("font-semibold", g.up ? "text-[#16a34a]" : "text-red-500")}>
            {g.up ? "▲" : "▼"} {g.pct}%
          </span>
          <span className="ml-1 text-[#9ca3af]">vs {prevL}</span>
        </p>
      ) : null}
    </button>
  );
}

/* ── Mini video player ──────────────────────────────────────────────────── */
function PortraitVideoPreview({ src, poster, duration }: { src?: string|null; poster?: string|null; duration?: number|null }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying]   = useState(false);
  const [muted,   setMuted]     = useState(true);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    const v = ref.current; if (!v) return;
    v.paused ? void v.play() : v.pause();
  }

  return (
    <div className="relative w-full overflow-hidden rounded-2xl bg-black" style={{ aspectRatio: "9/16" }}
      onClick={toggle}>
      {src ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <video ref={ref} src={src} poster={poster ?? undefined} muted playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Video className="h-10 w-10 text-white/20" />
        </div>
      )}

      {/* Overlay */}
      {!playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-white/25 backdrop-blur-sm">
            <Play className="ml-1 h-6 w-6 fill-white text-white" />
          </div>
        </div>
      )}

      {duration && (
        <span className="absolute bottom-2.5 left-2.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
          {fmtSec(duration)}
        </span>
      )}

      {src && (
        <button type="button" onClick={e => { e.stopPropagation(); const v = ref.current; if (!v) return; v.muted = !v.muted; setMuted(v.muted); }}
          className="absolute bottom-2.5 right-2.5 grid h-7 w-7 place-items-center rounded-full bg-black/50 text-white transition hover:bg-black/70">
          {muted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────── */

/* ════════════════════════════════════════════════════════════════════════
   MAIN PAGE
════════════════════════════════════════════════════════════════════════ */
export function StudioInsightsPage({ videoId }: { videoId: number }) {
  const router = useRouter();
  const { user, isAuthenticated, authReady } = useAuthStore();

  const [collapsed,      setCollapsed]      = useState(false);
  const [metric,         setMetric]         = useState<InsightMetric>("views");
  const [metricOpen,     setMetricOpen]     = useState(false);
  const [chartDateOpen,  setChartDateOpen]  = useState(false);
  const [dateRange,      setDateRange]      = useState({ start: new Date(Date.now()-6*86400000), end: new Date() });
  const [locationTab,    setLocationTab]    = useState<"countries"|"cities">("countries");
  const [showRetModal,   setShowRetModal]   = useState(false);
  const [showSrcModal,   setShowSrcModal]   = useState(false);
  const [showLocModal,   setShowLocModal]   = useState(false);
  const [showCmtModal,   setShowCmtModal]   = useState(false);

  const metricRef    = useRef<HTMLDivElement>(null);
  const chartDateRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (authReady && !isAuthenticated) router.replace("/"); }, [authReady, isAuthenticated, router]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!metricRef.current?.contains(e.target as Node))    setMetricOpen(false);
      if (!chartDateRef.current?.contains(e.target as Node)) setChartDateOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const queryParams = {
    metric,
    start_date: dateRange.start.toISOString().split("T")[0],
    end_date:   dateRange.end.toISOString().split("T")[0],
  };

  const insightsQ = useQuery({
    queryKey:  ["video-insights", videoId, queryParams],
    queryFn:   () => api.get<{ success: boolean; data: InsightsData }>(`/studio/content/${videoId}/insights`, { params: queryParams }).then(r => r.data.data),
    enabled:   isAuthenticated && !!videoId,
    staleTime: 60_000,
    retry: 1,
  });

  const data    = insightsQ.data;
  const video   = data?.video;
  const summary = data?.summary;
  const loading = insightsQ.isLoading;
  const prevP   = data?.previous_period;

  /* Chart data */
  const chartData = data?.chart?.map(p => ({ label: p.label, value: p.value })) ?? [];

  const METRICS: { key: InsightMetric; label: string }[] = [
    { key: "views",              label: "Views"             },
    { key: "likes",              label: "Likes"             },
    { key: "comments",           label: "Comments"          },
    { key: "shares",             label: "Shares"            },
    { key: "saves",              label: "Saves"             },
    { key: "watch_time",         label: "Watch Time"        },
    { key: "avg_watch_duration", label: "Avg Watch Duration"},
    { key: "engagement_rate",    label: "Engagement Rate"   },
  ];

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} activeHref="/studio/content" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Topbar ── */}
        <StudioTopbarShared
          title="Video Insights"
          subtitle="Track performance, engagement, and audience behavior for this video."
          showBack
          onBack={() => router.push("/studio/content")}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto pb-8" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto max-w-[1440px] space-y-5 p-6">

            {/* ══ TOP SECTION: Video card + Stat cards ══ */}
            <div className="flex gap-5">

              {/* Left: Video info card */}
              <div className="w-[240px] flex-shrink-0 space-y-4">
                <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white p-4">
                  {/* Portrait preview */}
                  <PortraitVideoPreview
                    src={video?.video_url ?? null}
                    poster={video?.thumbnail_url ?? null}
                    duration={video?.duration}
                  />

                  {/* Info */}
                  <div className="mt-3 space-y-0">
                    <p className="truncate text-[15px] font-extrabold text-[#111827]">
                      {loading ? <span className="inline-block h-5 w-36 animate-pulse rounded bg-[#f3f4f6]" /> : (video?.title || video?.caption || "Untitled")}
                    </p>

                    <div className="mt-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <Calendar className="h-3.5 w-3.5" /> Published
                        </span>
                        <span className="text-right text-[11px] font-medium text-[#374151]">{fmtDate(video?.created_at)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <Clock className="h-3.5 w-3.5" /> Duration
                        </span>
                        <span className="text-[11px] font-medium text-[#374151]">{fmtSec(video?.duration ?? 0)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <div className={cn("h-2 w-2 rounded-full",
                            video?.status === "published" ? "bg-[#22c55e]" :
                            video?.status === "draft"     ? "bg-[#3b82f6]" : "bg-[#9ca3af]")} />
                          Status
                        </span>
                        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
                          video?.status === "published" ? "bg-[#dcfce7] text-[#15803d]" :
                          video?.status === "draft"     ? "bg-[#dbeafe] text-[#1d4ed8]" : "bg-[#f3f4f6] text-[#4b5563]")}>
                          {video?.status || "-"}
                        </span>
                      </div>
                    </div>

                    {/* Buttons */}
                    <div className="mt-4 space-y-2">
                      <Link href={`/studio/content/${videoId}/edit`}
                        className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e03e04]">
                        Edit Video
                      </Link>
                      <Link href={`/videos/${videoId}`} target="_blank"
                        className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#fd4605] py-2.5 text-[13px] font-bold text-[#fd4605] transition hover:bg-[#fff6f1]">
                        View Public Video <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* Right: stat cards + performance chart stacked */}
              <div className="flex min-w-0 flex-1 flex-col gap-4">

                {/* 4x2 stat cards */}
                <div className="grid grid-cols-4 gap-3">
                  {(["views","likes","comments","shares","saves","watch_time","avg_watch_duration","engagement_rate"] as InsightMetric[]).map(m => (
                    <InsightCard key={m} metric={m} summary={summary} prevPeriod={prevP}
                      isActive={metric === m} loading={loading}
                      onClick={() => setMetric(m)} />
                  ))}
                </div>

                {/* ══ PERFORMANCE CHART ══ */}
                <div className="flex-1 overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-extrabold text-[#111827]">Performance Overview</h3>
                      <Info className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                    <div className="flex items-center gap-2.5">
                      {/* Metric dropdown */}
                      <div ref={metricRef} className="relative flex items-center gap-2">
                        <span className="text-[12px] text-[#9ca3af]">Metric</span>
                        <button type="button" onClick={() => setMetricOpen(o => !o)}
                          className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fd4605]">
                          <BarChart2 className="h-3.5 w-3.5 text-[#9ca3af]" />
                          {METRICS.find(m => m.key === metric)?.label ?? "Views"}
                          <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", metricOpen && "rotate-180")} />
                        </button>
                        {metricOpen && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-[185px] overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
                            {METRICS.map(m => (
                              <button key={m.key} type="button"
                                onClick={() => { setMetric(m.key); setMetricOpen(false); }}
                                className={cn("flex w-full items-center px-4 py-2.5 text-[13px] transition",
                                  m.key === metric ? "bg-[#fff3ec] font-semibold text-[#fd4605]" : "text-[#374151] hover:bg-[#f8f9fb]")}>
                                {m.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Date range in chart header */}
                      <div ref={chartDateRef}>
                        <StudioDateRangePicker
                          dateRange={dateRange}
                          open={chartDateOpen}
                          onToggle={setChartDateOpen}
                          onChange={r => { setDateRange(r); setChartDateOpen(false); }}
                        />
                      </div>
                    </div>
                  </div>

                  {loading ? (
                    <div className="flex h-[220px] items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
                    </div>
                  ) : (
                    <StudioLineChart data={chartData} height={220} metricLabel={METRICS.find(m=>m.key===metric)?.label} />
                  )}
                </div>

              </div>
            </div>

            {/* ══ BOTTOM ROW ══ */}
            <div className="grid grid-cols-4 gap-4">

              {/* A: Audience Retention */}
              <div className="flex flex-col rounded-2xl border border-[#f0f0f0] bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-[14px] font-extrabold text-[#111827]">Audience Retention</h3>
                  <Info className="h-3.5 w-3.5 text-[#9ca3af]" />
                </div>
                {loading ? (
                  <div className="flex-1 space-y-3">
                    <div className="mx-auto h-[120px] w-[120px] animate-pulse rounded-full bg-[#f3f4f6]" />
                  </div>
                ) : data?.retention?.average != null ? (
                  <div className="flex-1 space-y-4">
                    <div className="relative mx-auto flex h-[120px] w-[120px] items-center justify-center">
                      <RetentionRing pct={data.retention.average} />
                      <div className="absolute text-center">
                        <p className="text-[20px] font-extrabold text-[#111827]">{data.retention.average}%</p>
                        <p className="text-[10px] leading-tight text-[#9ca3af]">Average<br />Retention</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {data.retention.segments.map((seg, i) => (
                        <div key={i} className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="h-2.5 w-2.5 rounded-full" style={{ background: `rgba(253,70,5,${1 - i * 0.2})` }} />
                            <span className="text-[11px] text-[#374151]">{seg.retention}%</span>
                          </div>
                          <span className="text-[11px] text-[#9ca3af]">{seg.label}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
                    <BarChart2 className="mb-2 h-8 w-8 text-[#d1d5db]" />
                    <p className="text-[12px] text-[#9ca3af]">No retention data yet</p>
                  </div>
                )}
                <button type="button" onClick={() => setShowRetModal(true)}
                  className="mt-4 w-full rounded-xl border border-[#e5e7eb] py-2 text-[12px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                  View Retention Graph
                </button>
              </div>

              {/* B: Traffic Sources */}
              <div className="flex flex-col rounded-2xl border border-[#f0f0f0] bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-[14px] font-extrabold text-[#111827]">Traffic Sources</h3>
                  <Info className="h-3.5 w-3.5 text-[#9ca3af]" />
                </div>
                <div className="flex-1 space-y-3">
                  {data?.traffic_sources?.length ? (
                    data.traffic_sources.map(s => (
                      <div key={s.source}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[12px] font-medium text-[#374151]">{s.source}</span>
                          <span className="text-[12px] font-bold text-[#111827]">{s.pct}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-[#f3f4f6]">
                          <div className="h-full rounded-full bg-[#fd4605]" style={{ width: `${s.pct}%` }} />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-6 text-center">
                      <TrendingUp className="mb-2 h-8 w-8 text-[#d1d5db]" />
                      <p className="text-[12px] text-[#9ca3af]">Source tracking not yet available</p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setShowSrcModal(true)}
                  className="mt-4 w-full rounded-xl border border-[#e5e7eb] py-2 text-[12px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                  View All Sources
                </button>
              </div>

              {/* C: Audience Locations */}
              <div className="flex flex-col rounded-2xl border border-[#f0f0f0] bg-white p-5">
                <div className="mb-3 flex items-center gap-2">
                  <h3 className="text-[14px] font-extrabold text-[#111827]">Audience Locations</h3>
                  <Info className="h-3.5 w-3.5 text-[#9ca3af]" />
                </div>
                {/* Tabs */}
                <div className="mb-3 flex gap-1 rounded-xl border border-[#e5e7eb] bg-[#f8f9fb] p-1" style={{ width: "fit-content" }}>
                  {(["countries","cities"] as const).map(t => (
                    <button key={t} type="button" onClick={() => setLocationTab(t)}
                      className={cn("rounded-lg px-3 py-1 text-[11px] font-semibold capitalize transition",
                        locationTab === t ? "bg-white text-[#fd4605] shadow-sm" : "text-[#6b7280] hover:text-[#374151]")}>
                      Top {t === "countries" ? "Countries" : "Cities"}
                    </button>
                  ))}
                </div>
                <div className="flex-1">
                  {loading ? (
                    <div className="space-y-2.5">
                      {Array.from({ length: 4 }).map((_, i) => (
                        <div key={i} className="h-8 animate-pulse rounded bg-[#f3f4f6]" />
                      ))}
                    </div>
                  ) : (() => {
                    const locData = locationTab === "countries"
                      ? data?.audience_locations?.countries
                      : data?.audience_locations?.cities;
                    return locData?.length ? (
                      <div className="space-y-2.5">
                        {locData.map((l, i) => (
                          <div key={i}>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-[12px] font-medium text-[#374151]">{l.name}</span>
                              <span className="text-[12px] font-bold text-[#111827]">{l.pct}%</span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-[#f3f4f6]">
                              <div className="h-full rounded-full bg-[#fd4605]" style={{ width: `${l.pct}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-6 text-center">
                        <MapPin className="mb-2 h-8 w-8 text-[#d1d5db]" />
                        <p className="text-[12px] text-[#9ca3af]">Location data not yet available</p>
                      </div>
                    );
                  })()}
                </div>
                <button type="button" onClick={() => setShowLocModal(true)}
                  className="mt-4 w-full rounded-xl border border-[#e5e7eb] py-2 text-[12px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                  View All Locations
                </button>
              </div>

              {/* D: Top Comments */}
              <div className="flex flex-col rounded-2xl border border-[#f0f0f0] bg-white p-5">
                <div className="mb-4 flex items-center gap-2">
                  <h3 className="text-[14px] font-extrabold text-[#111827]">Top Comments</h3>
                  <Info className="h-3.5 w-3.5 text-[#9ca3af]" />
                </div>
                <div className="flex-1 space-y-3">
                  {loading ? (
                    Array.from({length:3}).map((_,i)=>(
                      <div key={i} className="flex gap-2">
                        <div className="h-8 w-8 flex-shrink-0 animate-pulse rounded-full bg-[#f3f4f6]" />
                        <div className="flex-1 space-y-1.5">
                          <div className="h-3 w-20 animate-pulse rounded bg-[#f3f4f6]" />
                          <div className="h-3 w-full animate-pulse rounded bg-[#f3f4f6]" />
                        </div>
                      </div>
                    ))
                  ) : data?.top_comments?.length ? (
                    data.top_comments.map(c => (
                      <div key={c.id} className="flex items-start gap-2.5">
                        {c.avatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={c.avatar} alt={c.name} className="h-8 w-8 flex-shrink-0 rounded-full object-cover" />
                          : <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#f3f4f6] text-[12px] font-bold text-[#6b7280]">
                              {c.name[0]?.toUpperCase()}
                            </div>}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between">
                            <span className="text-[12px] font-bold text-[#111827]">@{c.username}</span>
                            <div className="flex items-center gap-1 text-[11px] text-[#9ca3af]">
                              <Heart className="h-3 w-3" />{fmt(c.likes)}
                            </div>
                          </div>
                          <p className="mt-0.5 line-clamp-2 text-[11px] text-[#374151]">{c.text}</p>
                          <p className="mt-0.5 text-[10px] text-[#9ca3af]">{c.date}</p>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-4 text-center">
                      <MessageCircle className="mb-2 h-8 w-8 text-[#d1d5db]" />
                      <p className="text-[12px] text-[#9ca3af]">No comments yet</p>
                    </div>
                  )}
                </div>
                <button type="button" onClick={() => setShowCmtModal(true)}
                  className="mt-4 w-full rounded-xl border border-[#e5e7eb] py-2 text-[12px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                  View All Comments
                </button>
              </div>

            </div>
          </div>
        </div>
      </div>

      {/* ── Simple placeholder modals ── */}
      {[
        [showRetModal, setShowRetModal, "Retention Graph"],
        [showSrcModal, setShowSrcModal, "All Traffic Sources"],
        [showLocModal, setShowLocModal, "Audience Locations"],
        [showCmtModal, setShowCmtModal, "All Comments"],
      ].map(([open, setOpen, title]) => open ? (
        <div key={title as string} className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4"
          onClick={() => (setOpen as (v: boolean) => void)(false)}>
          <div className="w-full max-w-[400px] rounded-2xl bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[16px] font-extrabold text-[#111827]">{title as string}</h3>
            <p className="mt-2 text-[13px] text-[#9ca3af]">Detailed view coming soon.</p>
            <button onClick={() => (setOpen as (v: boolean) => void)(false)}
              className="mt-4 w-full rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-bold text-white hover:bg-[#e03e04]">
              Close
            </button>
          </div>
        </div>
      ) : null)}
    </div>
  );
}
