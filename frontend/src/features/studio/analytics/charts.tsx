"use client";

/**
 * Reusable charts for the Studio analytics dashboard.
 *
 * All of them take already-shaped data and render it - none of them fetch, and none
 * of them invent a point. If a series is empty they say so, because a chart drawn
 * through no data still looks like a chart, and that is how a dashboard ends up
 * confidently showing a trend that does not exist.
 */

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";
import type { AudienceRow, RetentionPoint, SeriesPoint, HeatCell } from "@/services/studio-analytics.service";
import { EmptyState } from "./primitives";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/** Donut palette. Ordered so adjacent slices always contrast. */
export const DONUT_COLORS = ["#fd4605", "#22c55e", "#3b82f6", "#f59e0b", "#a855f7", "#94a3b8"];

function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ── Area chart (Views Over Time, Watch Time Growth, Follower Growth) ───────── */

export function AreaChart({
  data,
  color,
  height = 240,
  valueSuffix = "",
}: {
  data: SeriesPoint[];
  color: string;
  height?: number;
  valueSuffix?: string;
}) {
  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "area",
        toolbar: {
          // Export lives in the toolbar rather than a bespoke button - Apex already
          // does SVG/PNG/CSV correctly, and re-implementing it would be worse.
          show: true,
          tools: { download: true, selection: false, zoom: true, zoomin: true, zoomout: true, pan: false, reset: true },
        },
        zoom: { enabled: true, type: "x", autoScaleYaxis: true },
        animations: { enabled: true, speed: 450, easing: "easeinout" },
        fontFamily: "inherit",
        background: "transparent",
      },
      colors: [color],
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2.5 },
      fill: {
        type: "gradient",
        gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.02, stops: [0, 100] },
      },
      grid: {
        borderColor: "#f1f5f9",
        strokeDashArray: 4,
        xaxis: { lines: { show: false } },
        padding: { left: 8, right: 8, top: 0 },
      },
      markers: { size: 0, hover: { size: 5 } },
      xaxis: {
        categories: data.map(d => shortDate(d.date)),
        // With 90 days of points, printing every label turns the axis into a smear.
        tickAmount: Math.min(7, Math.max(1, data.length - 1)),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
      },
      yaxis: {
        min: 0,
        labels: {
          style: { colors: "#94a3b8", fontSize: "11px" },
          formatter: (v: number) =>
            v >= 1000 ? `${(v / 1000).toFixed(0)}K` : `${Math.round(v * 10) / 10}`,
        },
      },
      tooltip: {
        theme: "light",
        x: { show: true },
        y: { formatter: (v: number) => `${v.toLocaleString()}${valueSuffix}` },
      },
    }),
    [data, color, valueSuffix],
  );

  if (data.length === 0) {
    return <EmptyState message="No data in this period" />;
  }

  return (
    <ApexChart
      type="area"
      height={height}
      series={[{ name: "Value", data: data.map(d => d.value) }]}
      options={options}
    />
  );
}

/* ── Retention curve ────────────────────────────────────────────────────────── */

/**
 * Audience retention: what share of viewers is still watching at each point of the
 * video. Always starts at 100% and decreases - if it ever ticks up, the curve is
 * being computed wrong (the quantiles are an inverse CDF and are easy to transpose).
 */
export function RetentionChart({ data, height = 240 }: { data: RetentionPoint[]; height?: number }) {
  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "area",
        toolbar: { show: false },
        zoom: { enabled: false },
        animations: { enabled: true, speed: 450 },
        fontFamily: "inherit",
      },
      colors: ["#fd4605"],
      dataLabels: { enabled: false },
      stroke: { curve: "smooth", width: 2.5 },
      fill: {
        type: "gradient",
        gradient: { shadeIntensity: 1, opacityFrom: 0.25, opacityTo: 0.02, stops: [0, 100] },
      },
      grid: { borderColor: "#f1f5f9", strokeDashArray: 4, padding: { left: 8, right: 8 } },
      markers: { size: 3, strokeWidth: 0, hover: { size: 6 } },
      xaxis: {
        categories: data.map(d => `${d.pct}%`),
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: "#94a3b8", fontSize: "11px" } },
        title: { text: "Video position", style: { color: "#cbd5e1", fontSize: "10px", fontWeight: 500 } },
      },
      yaxis: {
        min: 0,
        max: 100,
        tickAmount: 4,
        labels: {
          style: { colors: "#94a3b8", fontSize: "11px" },
          formatter: (v: number) => `${Math.round(v)}%`,
        },
      },
      tooltip: {
        theme: "light",
        x: { formatter: (_v, opts) => `At ${data[opts?.dataPointIndex ?? 0]?.pct ?? 0}% of the video` },
        y: { formatter: (v: number) => `${v}% still watching` },
      },
    }),
    [data],
  );

  if (data.length === 0) {
    return (
      <EmptyState
        message="Not enough playback data"
        hint="Retention needs viewers who watched far enough to report progress."
      />
    );
  }

  return (
    <ApexChart
      type="area"
      height={height}
      series={[{ name: "Retention", data: data.map(d => d.retention) }]}
      options={options}
    />
  );
}

/* ── Donut (Countries / Cities / Devices / Traffic Sources) ─────────────────── */

export function DonutChart({
  rows,
  centerValue,
  centerLabel,
  height = 190,
  labelFor,
}: {
  rows: AudienceRow[];
  centerValue: string;
  centerLabel: string;
  height?: number;
  labelFor?: (name: string) => string;
}) {
  const labels = useMemo(() => rows.map(r => (labelFor ? labelFor(r.name) : r.name)), [rows, labelFor]);

  const options: ApexOptions = useMemo(
    () => ({
      chart: { type: "donut", fontFamily: "inherit", animations: { enabled: true, speed: 450 } },
      labels,
      colors: DONUT_COLORS,
      legend: { show: false },
      dataLabels: { enabled: false },
      stroke: { width: 2, colors: ["#fff"] },
      plotOptions: {
        pie: {
          donut: {
            size: "72%",
            labels: {
              show: true,
              name:  { show: true, offsetY: 18, color: "#94a3b8", fontSize: "11px" },
              value: { show: true, offsetY: -14, color: "#0f172a", fontSize: "19px", fontWeight: 700 },
              total: {
                show: true,
                showAlways: true,
                label: centerLabel,
                color: "#94a3b8",
                fontSize: "11px",
                formatter: () => centerValue,
              },
            },
          },
        },
      },
      tooltip: { theme: "light", y: { formatter: (v: number) => `${v.toLocaleString()} views` } },
    }),
    [labels, centerValue, centerLabel],
  );

  if (rows.length === 0) return null; // caller renders the empty state with context

  return (
    <ApexChart type="donut" height={height} series={rows.map(r => r.count)} options={options} />
  );
}

/**
 * The ranked list beside each donut - flag/label, then the percentage, matching the
 * design's two-column audience panels.
 */
export function DonutLegend({
  rows,
  labelFor,
  prefixFor,
}: {
  rows: AudienceRow[];
  labelFor?: (name: string) => string;
  prefixFor?: (name: string) => string;
}) {
  return (
    <ul className="flex w-full flex-col gap-2.5">
      {rows.map((r, i) => {
        const label = labelFor ? labelFor(r.name) : r.name;
        return (
          <li key={r.name} className="flex items-center gap-2 text-[12px]">
            <span
              className="size-2 shrink-0 rounded-full"
              style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
            />
            {prefixFor && <span className="shrink-0 text-sm leading-none">{prefixFor(r.name)}</span>}
            {/* min-w-0 is what lets truncate actually engage inside the flex row - without
                it the label sets the row's floor width and pushes the percentage out. */}
            <span className="min-w-0 flex-1 truncate text-slate-600" title={label}>
              {label}
            </span>
            <span className="shrink-0 font-semibold tabular-nums text-slate-900">{r.pct}%</span>
          </li>
        );
      })}
    </ul>
  );
}

/* ── Best-time-to-post heatmap ──────────────────────────────────────────────── */

/**
 * GitHub-contributions-style 7x24 grid.
 *
 * Built with CSS grid rather than a charting library: it is 168 divs, we want exact
 * control over cell size and hover, and Apex's heatmap fights us on all three.
 *
 * Intensity is normalised server-side (peak cell = 1.0), so the shading is relative
 * to this creator's own best hour rather than to some absolute scale that would
 * leave a small creator's map uniformly blank.
 */
export function Heatmap({ cells }: { cells: HeatCell[] }) {
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  // Sparse -> dense lookup: most (day, hour) pairs have no views at all.
  const byKey = useMemo(() => {
    const m = new Map<string, HeatCell>();
    for (const c of cells) m.set(`${c.dow}-${c.hour}`, c);
    return m;
  }, [cells]);

  const shade = (intensity: number): string => {
    if (intensity <= 0)    return "#f8fafc";
    if (intensity < 0.2)   return "#ffe4ea";
    if (intensity < 0.4)   return "#ffc2d0";
    if (intensity < 0.6)   return "#ff8fa8";
    if (intensity < 0.8)   return "#ff5c80";
    return "#fd4605";
  };

  const hourLabel = (h: number) => {
    const suffix = h < 12 ? "AM" : "PM";
    const display = h % 12 === 0 ? 12 : h % 12;
    return `${display} ${suffix}`;
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[420px]">
        <div className="flex gap-1">
          {/* Day labels */}
          <div className="flex shrink-0 flex-col gap-[3px] pr-1 pt-[1px]">
            {DAYS.map(d => (
              <div key={d} className="flex h-[15px] items-center text-[9px] font-medium text-slate-400">
                {d}
              </div>
            ))}
          </div>

          {/* 7 rows x 24 hours */}
          <div className="flex flex-1 flex-col gap-[3px]">
            {DAYS.map((day, dow) => (
              <div key={day} className="grid flex-1 gap-[3px]" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
                {Array.from({ length: 24 }, (_, hour) => {
                  const cell = byKey.get(`${dow}-${hour}`);
                  const views = cell?.views ?? 0;
                  return (
                    <div
                      key={hour}
                      title={`${day} ${hourLabel(hour)} - ${views} view${views === 1 ? "" : "s"}`}
                      className="h-[15px] rounded-[3px] transition-transform duration-100 hover:scale-125 hover:ring-1 hover:ring-slate-300"
                      style={{ background: shade(cell?.intensity ?? 0) }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {/* Hour axis - every 4th hour, matching the design */}
        <div className="mt-1.5 flex gap-1">
          <div className="w-[26px] shrink-0" />
          <div className="grid flex-1" style={{ gridTemplateColumns: "repeat(24, minmax(0, 1fr))" }}>
            {Array.from({ length: 24 }, (_, h) =>
              h % 4 === 0 ? (
                <span key={h} className="col-span-4 text-[9px] text-slate-400">
                  {hourLabel(h)}
                </span>
              ) : null,
            )}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center justify-center gap-1.5">
          <span className="text-[9px] text-slate-400">Low activity</span>
          {[0, 0.25, 0.45, 0.65, 0.85, 1].map(i => (
            <span key={i} className="size-2.5 rounded-[2px]" style={{ background: shade(i) }} />
          ))}
          <span className="text-[9px] text-slate-400">High activity</span>
        </div>
      </div>
    </div>
  );
}
