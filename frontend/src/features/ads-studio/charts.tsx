"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import type { ApexOptions } from "apexcharts";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/** Gate chart render until mounted so SSR/client markup can't mismatch. */
function useMounted() {
  const [m, setM] = useState(false);
  useEffect(() => setM(true), []);
  return m;
}

function shortNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return `${Math.round(n)}`;
}

/* ── Multi-series performance line chart ───────────────────────────────── */
export type PerfSeries = { name: string; color: string; data: number[]; isMoney?: boolean };

export function PerformanceChart({
  categories, series, height = 300,
}: { categories: string[]; series: PerfSeries[]; height?: number }) {
  const mounted = useMounted();

  const apexSeries = useMemo(
    () => series.map((s) => ({ name: s.name, data: s.data })),
    [series],
  );

  const options: ApexOptions = useMemo(() => ({
    chart: {
      type: "line",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 450 },
      background: "transparent",
      fontFamily: "inherit",
    },
    colors: series.map((s) => s.color),
    stroke: { curve: "smooth", width: 3 },
    markers: {
      size: categories.length <= 32 ? 4 : 0,
      colors: ["#ffffff"],
      strokeColors: series.map((s) => s.color),
      strokeWidth: 2.5,
      hover: { size: 6 },
    },
    xaxis: {
      categories,
      labels: { style: { colors: "#9ca3af", fontSize: "11px", fontFamily: "inherit" }, hideOverlappingLabels: true, trim: true },
      axisBorder: { show: false },
      axisTicks: { show: false },
      tooltip: { enabled: false },
    },
    yaxis: {
      forceNiceScale: true,
      min: 0,
      labels: {
        style: { colors: "#9ca3af", fontSize: "11px", fontFamily: "inherit" },
        formatter: (v: number) => shortNum(v),
      },
    },
    grid: { borderColor: "#eef0f3", strokeDashArray: 4, xaxis: { lines: { show: false } }, padding: { left: 4, right: 8 } },
    dataLabels: { enabled: false },
    legend: { show: false },
    tooltip: {
      theme: "dark",
      style: { fontSize: "12px", fontFamily: "inherit" },
      y: {
        formatter: (v: number, opts?: { seriesIndex: number }) => {
          const s = opts ? series[opts.seriesIndex] : undefined;
          return s?.isMoney ? shortNum(v) : new Intl.NumberFormat().format(Math.round(v));
        },
      },
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [categories, series]);

  if (!mounted) return <div style={{ height }} />;

  return <ApexChart type="line" series={apexSeries} options={options} height={height} width="100%" />;
}

/* ── Status donut ──────────────────────────────────────────────────────── */
export function StatusDonut({
  values, labels, colors, total, height = 260,
}: { values: number[]; labels: string[]; colors: string[]; total: number; height?: number }) {
  const mounted = useMounted();

  const options: ApexOptions = useMemo(() => ({
    chart: { type: "donut", background: "transparent", fontFamily: "inherit" },
    labels,
    colors,
    stroke: { width: 0 },
    legend: { show: false },
    dataLabels: { enabled: false },
    plotOptions: {
      pie: {
        donut: {
          size: "72%",
          labels: {
            show: true,
            name: { show: true, offsetY: 22, color: "#9ca3af", fontSize: "12px" },
            value: {
              show: true, offsetY: -14, color: "#111827", fontSize: "28px", fontWeight: 800,
              formatter: () => `${total}`,
            },
            total: { show: true, showAlways: true, label: "Total", color: "#9ca3af", fontSize: "12px", formatter: () => `${total}` },
          },
        },
      },
    },
    tooltip: { theme: "dark", y: { formatter: (v: number) => `${v}` } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [labels, colors, total]);

  if (!mounted) return <div style={{ height }} />;
  if (values.every((v) => v === 0)) {
    return (
      <div className="flex items-center justify-center text-[13px] text-[#9ca3af]" style={{ height }}>
        No campaigns yet
      </div>
    );
  }

  return <ApexChart type="donut" series={values} options={options} height={height} width="100%" />;
}

/* ── Revenue / bar chart (Reports) ─────────────────────────────────────── */
export function BarChart({
  categories, data, color = "#fe2c55", height = 260, money = false,
}: { categories: string[]; data: number[]; color?: string; height?: number; money?: boolean }) {
  const mounted = useMounted();

  const options: ApexOptions = useMemo(() => ({
    chart: { type: "bar", toolbar: { show: false }, background: "transparent", fontFamily: "inherit" },
    colors: [color],
    plotOptions: { bar: { borderRadius: 6, columnWidth: "52%" } },
    dataLabels: { enabled: false },
    xaxis: {
      categories,
      labels: { style: { colors: "#9ca3af", fontSize: "11px", fontFamily: "inherit" }, hideOverlappingLabels: true, trim: true },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "11px", fontFamily: "inherit" }, formatter: (v: number) => shortNum(v) } },
    grid: { borderColor: "#eef0f3", strokeDashArray: 4, xaxis: { lines: { show: false } } },
    tooltip: { theme: "dark", y: { formatter: (v: number) => (money ? shortNum(v) : new Intl.NumberFormat().format(Math.round(v))) } },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [categories, color]);

  if (!mounted) return <div style={{ height }} />;
  return <ApexChart type="bar" series={[{ name: "Value", data }]} options={options} height={height} width="100%" />;
}
