"use client";

/**
 * The page's sections, in the order they appear in the design.
 *
 * Each takes exactly the slice of DashboardData it renders and nothing else - no
 * section fetches, and none reaches for the whole payload. That keeps the page
 * component a layout, and makes each section trivially testable with a literal.
 */

import { useMemo } from "react";
import Image from "next/image";
import {
  BadgeDollarSign, Bookmark, CalendarDays, CheckCircle2, Clock, Coins, Eye,
  Gauge, Heart, LineChart, type LucideIcon, MessageCircle, Music2, Play, Repeat2,
  Share2, Sparkles, TrendingUp, Users, Wallet,
} from "lucide-react";

import {
  compact, countryName, duration, flag, money, sourceLabel,
  type AudienceRow, type DashboardData, type Insight, type MetricWithSeries,
  type TopAudio, type TopVideo, type TrendingVideo,
} from "@/services/studio-analytics.service";
import { AreaChart, DonutChart, DonutLegend, Heatmap, RetentionChart } from "./charts";
import { Card, CardHeader, EmptyState, GrowthChip, Sparkline } from "./primitives";

/* ── AI insights ────────────────────────────────────────────────────────────── */

const INSIGHT_ICONS: Record<string, LucideIcon> = {
  clock: Clock, timer: Gauge, globe: Users, calendar: CalendarDays, music: Music2,
};

/**
 * Insights are generated server-side from the creator's own data, and the generator
 * returns nothing when the data can't support a claim. So an empty list here is the
 * system working correctly on a small account, not a bug - say that, rather than
 * padding the card with a generic tip that would read as a real finding.
 */
export function InsightsCard({ insights }: { insights: Insight[] }) {
  return (
    <Card className="border-0 bg-gradient-to-r from-rose-50 via-fuchsia-50 to-indigo-50">
      <div className="mb-3 flex items-center gap-2">
        <span className="flex size-7 items-center justify-center rounded-lg bg-white/80 shadow-sm">
          <Sparkles className="size-4 text-fuchsia-600" />
        </span>
        <h3 className="text-[15px] font-semibold text-slate-900">AI Insights</h3>
      </div>

      {insights.length === 0 ? (
        <p className="text-[13px] text-slate-500">
          Not enough activity yet to draw a reliable conclusion. Insights appear once
          there&apos;s enough data to say something that&apos;s actually true.
        </p>
      ) : (
        <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {insights.map((insight, i) => {
            const Icon = INSIGHT_ICONS[insight.icon] ?? Sparkles;
            return (
              <li
                key={`${insight.type}-${i}`}
                className="flex items-start gap-2 rounded-xl bg-white/70 p-2.5 text-[12.5px] leading-snug text-slate-700 backdrop-blur-sm"
              >
                <Icon className="mt-px size-4 shrink-0 text-fuchsia-500" strokeWidth={2} />
                <span>{insight.text}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

/* ── Row 1: KPI cards ───────────────────────────────────────────────────────── */

type KpiSpec = {
  key: keyof DashboardData["summary"];
  label: string;
  icon: LucideIcon;
  tint: string;   // icon chip background
  fg: string;     // icon colour
  stroke: string; // sparkline colour
  format: (n: number) => string;
  series: (d: DashboardData) => { date: string; value: number }[];
};

const KPIS: KpiSpec[] = [
  { key: "views", label: "Views", icon: Eye, tint: "bg-rose-50", fg: "text-rose-500", stroke: "#fe2c55",
    format: compact, series: d => d.charts.views_over_time },
  { key: "watch_time_hours", label: "Watch Time", icon: Clock, tint: "bg-violet-50", fg: "text-violet-500", stroke: "#8b5cf6",
    format: n => `${compact(n)} h`, series: d => d.charts.watch_time_growth },
  { key: "avg_watch_duration", label: "Avg. Watch Duration", icon: Play, tint: "bg-sky-50", fg: "text-sky-500", stroke: "#3b82f6",
    format: duration, series: d => d.charts.watch_time_growth },
  { key: "engagement_rate", label: "Engagement Rate", icon: Heart, tint: "bg-orange-50", fg: "text-orange-500", stroke: "#f97316",
    format: n => `${n}%`, series: d => d.engagement.likes.series },
  { key: "followers_gained", label: "Followers Gained", icon: Users, tint: "bg-blue-50", fg: "text-blue-500", stroke: "#3b82f6",
    format: compact, series: d => d.followers.series },
  { key: "profile_visits", label: "Profile Visits", icon: TrendingUp, tint: "bg-emerald-50", fg: "text-emerald-500", stroke: "#22c55e",
    format: compact, series: d => d.charts.views_over_time },
  { key: "estimated_earnings", label: "Estimated Earnings", icon: BadgeDollarSign, tint: "bg-amber-50", fg: "text-amber-500", stroke: "#f59e0b",
    format: money, series: d => d.charts.views_over_time },
];

function compareLabel(prev: { start: string; end: string }): string {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${fmt(prev.start)} - ${fmt(prev.end)}`;
}

export function KpiRow({ data }: { data: DashboardData }) {
  const label = useMemo(() => compareLabel(data.previous_period), [data.previous_period]);

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-7">
      {KPIS.map(kpi => {
        const metric = data.summary[kpi.key];
        const Icon = kpi.icon;

        return (
          <Card key={kpi.key} hover className="p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <span className={`flex size-7 items-center justify-center rounded-lg ${kpi.tint}`}>
                <Icon className={`size-3.5 ${kpi.fg}`} strokeWidth={2.2} />
              </span>
              <span className="truncate text-[11.5px] font-medium text-slate-500">{kpi.label}</span>
            </div>

            <p className="text-[22px] font-bold leading-none tracking-tight text-slate-900">
              {kpi.format(metric.value)}
            </p>

            <div className="mt-2">
              <GrowthChip growth={metric.growth} compareLabel={label} />
            </div>

            <div className="-mx-1 mt-1">
              <Sparkline data={kpi.series(data)} color={kpi.stroke} height={36} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Row 2: main charts ─────────────────────────────────────────────────────── */

export function MainCharts({ data }: { data: DashboardData }) {
  const totalViews = data.summary.views.value;
  const totalHours = data.summary.watch_time_hours.value;

  return (
    <div className="grid gap-3 xl:grid-cols-3">
      <Card>
        <CardHeader title="Views Over Time" hint="Daily views across the selected period." />
        <p className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
          {totalViews.toLocaleString()}
        </p>
        <div className="mt-1"><GrowthChip growth={data.summary.views.growth} /></div>
        <AreaChart data={data.charts.views_over_time} color="#fe2c55" />
      </Card>

      <Card>
        <CardHeader title="Watch Time Growth" hint="Total hours watched per day." />
        <p className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
          {compact(totalHours)} <span className="text-base font-semibold text-slate-400">h</span>
        </p>
        <div className="mt-1"><GrowthChip growth={data.summary.watch_time_hours.growth} /></div>
        <AreaChart data={data.charts.watch_time_growth} color="#8b5cf6" valueSuffix=" h" />
      </Card>

      <Card>
        <CardHeader
          title="Audience Retention Curve"
          hint="Share of viewers still watching at each point of the video. Always starts at 100%."
        />
        <p className="text-[26px] font-bold leading-none tracking-tight text-slate-900">
          {data.charts.retention_average}%
        </p>
        <div className="mt-1"><GrowthChip growth={data.summary.audience_retention.growth} /></div>
        <RetentionChart data={data.charts.retention_curve} />
      </Card>
    </div>
  );
}

/* ── Row 3-4: best time + audience ──────────────────────────────────────────── */

/**
 * One audience panel: donut + ranked legend, or an honest empty state.
 *
 * Donut and legend sit side by side only once the card is actually wide enough for
 * both (`@md`, i.e. the CARD's width, not the viewport's). These panels live in a
 * 3-up grid, so a viewport breakpoint would tell them the screen is wide while the
 * column they're in is 230px - which is how the device legend ended up rendering as
 * "[ 68.8%" with the label itself clipped away. Below that width they stack, and the
 * legend gets the full column.
 */
function AudiencePanel({
  title,
  rows,
  centerValue,
  labelFor,
  prefixFor,
  emptyMessage,
  emptyHint,
}: {
  title: string;
  rows: AudienceRow[];
  centerValue: string;
  labelFor?: (n: string) => string;
  prefixFor?: (n: string) => string;
  emptyMessage: string;
  emptyHint?: string;
}) {
  return (
    <Card className="@container flex h-full flex-col">
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState message={emptyMessage} hint={emptyHint} />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-3 @md:flex-row">
          <div className="w-[164px] shrink-0">
            <DonutChart rows={rows} centerValue={centerValue} centerLabel="Views" labelFor={labelFor} />
          </div>
          <div className="min-w-0 w-full flex-1 self-center">
            <DonutLegend rows={rows} labelFor={labelFor} prefixFor={prefixFor} />
          </div>
        </div>
      )}
    </Card>
  );
}

export function AudienceRow_({ data }: { data: DashboardData }) {
  const views = compact(data.summary.views.value);

  return (
    <div className="flex flex-col gap-3">
      {/*
        Best Time to Post needs real horizontal room - it is a 24-column grid, and at a
        fifth of the page it was scrolling sideways inside its own card. Two thirds of
        a row gives every hour a legible column.
      */}
      <div className="grid gap-3 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader
            title="Best Time to Post"
            hint={
              data.best_time.timezone
                ? `When your audience is active, in ${data.best_time.timezone}.`
                : "When your audience is active."
            }
            action={
              data.best_time.peak && (
                <div className="shrink-0 text-right">
                  <p className="text-[11px] text-slate-400">Peak</p>
                  <p className="whitespace-nowrap text-[12px] font-semibold text-slate-900">
                    {data.best_time.peak.day}, {data.best_time.peak.window}
                  </p>
                </div>
              )
            }
          />
          {data.best_time.has_data ? (
            <Heatmap cells={data.best_time.cells} />
          ) : (
            <EmptyState message="No activity yet" hint="Your heatmap fills in as people watch your videos." />
          )}
        </Card>

        <TrafficSources rows={data.audience.traffic_sources} views={views} />
      </div>

      {/* The three donut panels, evenly sized so their legends all have room. */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <AudiencePanel
          title="Top Countries"
          rows={data.audience.countries}
          centerValue={views}
          labelFor={countryName}
          prefixFor={flag}
          emptyMessage="No country data yet"
        />

        {/*
          Cities is ALWAYS empty right now: video_views.city is never written, because
          Cloudflare only sends CF-IPCity on Enterprise plans. Rather than fabricate a
          plausible city split - which would look completely real and be entirely
          invented - the card says exactly why it's blank.
        */}
        <AudiencePanel
          title="Top Cities"
          rows={data.audience.cities}
          centerValue={views}
          emptyMessage="City data not available"
          emptyHint="Requires GeoIP lookup - we only receive country-level location today."
        />

        <AudiencePanel
          title="Devices"
          rows={data.audience.devices}
          centerValue={views}
          labelFor={n => n.charAt(0).toUpperCase() + n.slice(1)}
          emptyMessage="No device data yet"
        />
      </div>
    </div>
  );
}

export function TrafficSources({ rows, views }: { rows: AudienceRow[]; views: string }) {
  return (
    <Card className="@container flex h-full flex-col">
      <CardHeader title="Traffic Sources" hint="Where viewers found your videos." />
      {rows.length === 0 ? (
        <div className="flex flex-1 items-center justify-center">
          <EmptyState message="No traffic data yet" />
        </div>
      ) : (
        <div className="flex flex-1 flex-col items-center gap-3 @md:flex-row">
          <div className="w-[164px] shrink-0">
            <DonutChart rows={rows} centerValue={views} centerLabel="Views" labelFor={sourceLabel} />
          </div>
          <div className="min-w-0 w-full flex-1 self-center">
            <DonutLegend rows={rows} labelFor={sourceLabel} />
          </div>
        </div>
      )}
    </Card>
  );
}

/* ── Row 5: engagement strip ────────────────────────────────────────────────── */

const ENGAGEMENT: Array<{
  key: keyof DashboardData["engagement"];
  label: string;
  icon: LucideIcon;
  tint: string;
  fg: string;
  stroke: string;
  isRate?: boolean;
}> = [
  { key: "likes",           label: "Likes",           icon: Heart,         tint: "bg-rose-50",    fg: "text-rose-500",    stroke: "#fe2c55" },
  { key: "comments",        label: "Comments",        icon: MessageCircle, tint: "bg-violet-50",  fg: "text-violet-500",  stroke: "#8b5cf6" },
  { key: "shares",          label: "Shares",          icon: Share2,        tint: "bg-sky-50",     fg: "text-sky-500",     stroke: "#3b82f6" },
  { key: "saves",           label: "Saves",           icon: Bookmark,      tint: "bg-amber-50",   fg: "text-amber-500",   stroke: "#f59e0b" },
  { key: "rewatch_rate",    label: "Rewatch Rate",    icon: Repeat2,       tint: "bg-emerald-50", fg: "text-emerald-500", stroke: "#22c55e", isRate: true },
  { key: "completion_rate", label: "Completion Rate", icon: CheckCircle2,  tint: "bg-fuchsia-50", fg: "text-fuchsia-500", stroke: "#a855f7", isRate: true },
];

/**
 * Label, value, change and sparkline stack vertically.
 *
 * They used to share a row with the growth chip, which meant "Completion Rate" and
 * "No prior period" fought over ~90px and both lost - the label rendered as "C.." and
 * the number underneath was the only readable thing on the card. Stacking costs a few
 * pixels of height and buys every card its full width for each line.
 */
export function EngagementStrip({ engagement }: { engagement: DashboardData["engagement"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
      {ENGAGEMENT.map(spec => {
        const m: MetricWithSeries = engagement[spec.key];
        const Icon = spec.icon;

        return (
          <Card key={spec.key} hover className="p-4">
            <div className="mb-2.5 flex items-center gap-2">
              <span className={`flex size-7 shrink-0 items-center justify-center rounded-lg ${spec.tint}`}>
                <Icon className={`size-3.5 ${spec.fg}`} strokeWidth={2.2} />
              </span>
              <span className="min-w-0 flex-1 truncate text-[11.5px] font-medium text-slate-500">
                {spec.label}
              </span>
            </div>

            <p className="text-[20px] font-bold leading-none tracking-tight text-slate-900">
              {spec.isRate ? `${m.value}%` : compact(m.value)}
            </p>

            <div className="mt-2">
              <GrowthChip growth={m.growth} />
            </div>

            <div className="-mx-1 mt-1">
              <Sparkline data={m.series} color={spec.stroke} height={34} />
            </div>
          </Card>
        );
      })}
    </div>
  );
}

/* ── Row 6: top performing videos ───────────────────────────────────────────── */

function Thumb({ src, alt, seconds }: { src: string | null; alt: string; seconds?: number }) {
  const label = seconds
    ? `${Math.floor(seconds / 60)}:${String(Math.round(seconds % 60)).padStart(2, "0")}`
    : null;

  return (
    <div className="relative size-11 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {src ? (
        <Image src={src} alt={alt} fill sizes="44px" className="object-cover" unoptimized />
      ) : (
        <div className="flex size-full items-center justify-center">
          <Play className="size-4 text-slate-300" />
        </div>
      )}
      {label && (
        <span className="absolute bottom-0.5 left-0.5 rounded bg-black/70 px-1 text-[8px] font-medium text-white">
          {label}
        </span>
      )}
    </div>
  );
}

export function TopVideosTable({ videos }: { videos: TopVideo[] }) {
  return (
    <Card className="xl:col-span-2">
      <CardHeader
        title="Top Performing Videos"
        hint="Ranked by views in the selected period."
        action={
          <a href="/studio/content" className="text-[12px] font-semibold text-rose-500 hover:text-rose-600">
            See all
          </a>
        }
      />

      {videos.length === 0 ? (
        <EmptyState message="No videos with views in this period" />
      ) : (
        <div className="-mx-2 overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse">
            <thead>
              <tr className="text-left text-[10.5px] font-medium uppercase tracking-wide text-slate-400">
                <th className="px-2 pb-2 font-medium">Video</th>
                <th className="px-2 pb-2 text-right font-medium">Views</th>
                <th className="px-2 pb-2 text-right font-medium">Watch Time</th>
                <th className="px-2 pb-2 text-right font-medium">Avg. Watch</th>
                <th className="px-2 pb-2 text-right font-medium">Completion</th>
                <th className="px-2 pb-2 text-right font-medium">Likes</th>
                <th className="px-2 pb-2 text-right font-medium">Comments</th>
                <th className="px-2 pb-2 text-right font-medium">Shares</th>
                <th className="px-2 pb-2 text-right font-medium">Revenue</th>
                <th className="px-2 pb-2" />
              </tr>
            </thead>
            <tbody>
              {videos.map(v => (
                <tr key={v.id} className="border-t border-slate-50 transition hover:bg-slate-50/70">
                  <td className="px-2 py-2.5">
                    <div className="flex items-center gap-2.5">
                      <Thumb src={v.thumbnail} alt={v.title} seconds={v.duration} />
                      <div className="min-w-0">
                        <p className="truncate text-[12.5px] font-medium text-slate-800">{v.title}</p>
                        <p className="text-[10.5px] text-slate-400">
                          {new Date(v.created_at).toLocaleDateString(undefined, {
                            month: "short", day: "numeric", year: "numeric",
                          })}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 text-right text-[12.5px] font-semibold text-slate-800">{compact(v.views)}</td>
                  <td className="px-2 text-right text-[12.5px] text-slate-600">{compact(v.watch_time_hours)} h</td>
                  <td className="px-2 text-right text-[12.5px] text-slate-600">{duration(v.avg_watch_duration)}</td>
                  <td className="px-2 text-right text-[12.5px] text-slate-600">{v.completion}%</td>
                  <td className="px-2 text-right text-[12.5px] text-slate-600">{compact(v.likes)}</td>
                  <td className="px-2 text-right text-[12.5px] text-slate-600">{compact(v.comments)}</td>
                  <td className="px-2 text-right text-[12.5px] text-slate-600">{compact(v.shares)}</td>
                  <td className="px-2 text-right text-[12.5px] font-semibold text-emerald-600">{money(v.revenue)}</td>
                  <td className="px-2 text-right">
                    <a
                      href={`/studio/content/${v.id}/insights`}
                      className="whitespace-nowrap rounded-full border border-slate-200 px-2.5 py-1 text-[11px] font-semibold text-slate-600 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                    >
                      Analytics
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

/* ── Row 7-8: audio + trending ──────────────────────────────────────────────── */

export function TopAudioCard({ tracks }: { tracks: TopAudio[] }) {
  return (
    <Card>
      <CardHeader title="Top Performing Audio" hint="Tracks used across your videos." />

      {tracks.length === 0 ? (
        <EmptyState
          message="No library audio used"
          hint="This fills in once your videos use tracks from the Teezer audio library."
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {tracks.map(t => (
            <li key={t.id} className="flex items-center gap-2.5 rounded-xl p-1.5 transition hover:bg-slate-50">
              <div className="relative size-9 shrink-0 overflow-hidden rounded-lg bg-slate-100">
                {t.cover ? (
                  <Image src={t.cover} alt={t.title} fill sizes="36px" className="object-cover" unoptimized />
                ) : (
                  <div className="flex size-full items-center justify-center">
                    <Music2 className="size-4 text-slate-300" />
                  </div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[12.5px] font-medium text-slate-800">{t.title}</p>
                <p className="truncate text-[10.5px] text-slate-400">by {t.artist ?? "Unknown"}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[12px] font-semibold text-slate-800">{compact(t.views)}</p>
                <p className="text-[10px] text-slate-400">{t.videos_count} video{t.videos_count === 1 ? "" : "s"}</p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function TrendingVideosCard({ videos }: { videos: TrendingVideo[] }) {
  return (
    <Card>
      <CardHeader
        title="Trending Videos"
        hint="Ranked by growth velocity vs the previous week, not by total views."
      />

      {videos.length === 0 ? (
        <EmptyState message="Nothing trending right now" hint="Videos appear here when their views accelerate." />
      ) : (
        // auto-fill against the CARD's width rather than the viewport's. This card sits
        // in a third-width column at xl, where `sm:grid-cols-4` was still handing it
        // four columns and squeezing each poster to ~100px.
        <ul className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(132px,1fr))]">
          {videos.map((v, i) => (
            <li key={v.id}>
              <a
                href={`/studio/content/${v.id}/insights`}
                className="group relative block overflow-hidden rounded-xl bg-slate-100 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
              >
                <div className="relative aspect-[3/4] w-full">
                  {v.thumbnail ? (
                    <Image
                      src={v.thumbnail}
                      alt={v.title}
                      fill
                      sizes="180px"
                      className="object-cover transition duration-300 group-hover:scale-105"
                      unoptimized
                    />
                  ) : (
                    <div className="flex size-full items-center justify-center">
                      <Play className="size-5 text-slate-300" />
                    </div>
                  )}

                  <span className="absolute left-1.5 top-1.5 flex size-5 items-center justify-center rounded-md bg-white/90 text-[10px] font-bold text-slate-800 shadow-sm">
                    {i + 1}
                  </span>
                  <span className="absolute right-1.5 top-1.5 rounded-md bg-emerald-500/90 px-1.5 py-0.5 text-[10px] font-bold text-white shadow-sm">
                    ↑{v.growth}%
                  </span>

                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-2 pt-8">
                    <p className="truncate text-[11.5px] font-semibold leading-snug text-white">{v.title}</p>
                    <p className="text-[10px] text-white/75">{compact(v.views)} views</p>
                  </div>
                </div>
              </a>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/* ── Row 9: follower analytics ──────────────────────────────────────────────── */

export function FollowerAnalytics({ followers }: { followers: DashboardData["followers"] }) {
  const stats = [
    { label: "Total Followers", value: compact(followers.total), tone: "text-slate-900" },
    { label: "New Followers",   value: `+${compact(followers.gained)}`, tone: "text-emerald-600" },
    { label: "Lost Followers",  value: `-${compact(followers.lost)}`,   tone: "text-rose-600" },
    { label: "Net Followers",   value: `${followers.net >= 0 ? "+" : ""}${compact(followers.net)}`, tone: followers.net >= 0 ? "text-emerald-600" : "text-rose-600" },
  ];

  return (
    <Card className="xl:col-span-2">
      <CardHeader title="Follower Analytics" hint="New followers per day across the period." />

      <div className="mb-3 grid grid-cols-4 gap-2">
        {stats.map(s => (
          <div key={s.label} className="rounded-xl bg-slate-50 p-2.5">
            <p className="text-[10.5px] text-slate-500">{s.label}</p>
            <p className={`mt-0.5 text-[17px] font-bold leading-none ${s.tone}`}>{s.value}</p>
          </div>
        ))}
      </div>

      <AreaChart data={followers.series} color="#3b82f6" height={180} />

      {followers.lost === 0 && (
        // Worth saying out loud: an unfollow is a hard DELETE in Postgres, so unless
        // the nightly rollup happened to snapshot it, "0 lost" may mean "not recorded"
        // rather than "nobody left". Better to admit the limit than imply a perfect record.
        <p className="mt-2 text-[10.5px] leading-relaxed text-slate-400">
          Lost followers are only counted from the daily rollup - historic unfollows before
          it ran aren&apos;t recoverable.
        </p>
      )}
    </Card>
  );
}

/* ── Row 10: monetization ───────────────────────────────────────────────────── */

export function Monetization({ m }: { m: DashboardData["monetization"] }) {
  const tiles = [
    { label: "Estimated Earnings", value: money(m.estimated),     icon: BadgeDollarSign, tint: "bg-emerald-50", fg: "text-emerald-500" },
    { label: "Coins Received",     value: compact(m.coins),       icon: Coins,           tint: "bg-amber-50",   fg: "text-amber-500" },
    { label: "Creator Fund",       value: money(m.creator_fund),  icon: Wallet,          tint: "bg-violet-50",  fg: "text-violet-500" },
    { label: "Ad Revenue",         value: money(m.ad_revenue),    icon: LineChart,       tint: "bg-sky-50",     fg: "text-sky-500" },
    { label: "Subscriptions",      value: money(m.subscriptions), icon: Users,           tint: "bg-rose-50",    fg: "text-rose-500" },
  ];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader title="Monetization Overview" />

      {/*
        Two columns, not six. This card is a third of the row, so `lg:grid-cols-6` gave
        each tile ~70px - an icon chip plus barely a word, which is why every label read
        as "Estimat…". The tiles stack under the icon instead of beside it, so a label
        like "Estimated Earnings" gets the tile's full width.
      */}
      <div className="grid flex-1 grid-cols-2 gap-2.5">
        {tiles.map(t => {
          const Icon = t.icon;
          return (
            <div
              key={t.label}
              className="flex flex-col gap-2 rounded-xl border border-slate-100 p-3 transition hover:border-slate-200 hover:bg-slate-50/60"
            >
              <span className={`flex size-8 shrink-0 items-center justify-center rounded-lg ${t.tint}`}>
                <Icon className={`size-4 ${t.fg}`} strokeWidth={2.2} />
              </span>
              <div className="min-w-0">
                <p className="text-[11px] leading-snug text-slate-500">{t.label}</p>
                <p className="mt-0.5 text-[17px] font-bold leading-none tracking-tight text-slate-900">
                  {t.value}
                </p>
              </div>
            </div>
          );
        })}

        <div className="col-span-2 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-500 p-3.5">
          <div className="min-w-0">
            <p className="text-[11px] text-white/80">Payout Balance</p>
            <p className="mt-0.5 text-[19px] font-bold leading-none text-white">{money(m.payout_balance)}</p>
          </div>
          <a
            href="/studio/wallets-coins"
            className="shrink-0 rounded-full bg-white px-3.5 py-1.5 text-[11.5px] font-bold text-rose-600 shadow-sm transition hover:bg-rose-50"
          >
            Withdraw
          </a>
        </div>
      </div>
    </Card>
  );
}
