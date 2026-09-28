"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import type { ApexOptions, ApexAxisChartSeries } from "apexcharts";
import { BarChart2, Info } from "lucide-react";
import { studioService, type BestTimeData } from "@/services/studio.service";

/* ApexCharts must be loaded client-side only (uses window) */
const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ── Fallback used while loading or if API fails ───────────────────────── */
const FALLBACK: BestTimeData = (() => {
  const pat = [18,12,10,8,6,7,14,20,25,32,38,46,55,48,40,36,44,58,72,84,100,75,62,50];
  const lbl = (h: number) =>
    h === 0 ? "12AM" : h === 12 ? "12PM" : h < 12 ? `${h}AM` : `${h - 12}PM`;
  return {
    bestDay: "Today", bestTime: "8:00 PM", bestHour: 20,
    timezone: "UTC",  hasEnoughData: false,
    activityByHour: pat.map((score, hour) => ({ hour, label: lbl(hour), score })),
  };
})();

/* ── Labels shown on X-axis (sparse) ──────────────────────────────────── */
const SHOW_LABELS = new Set([0, 6, 12, 18]);

export function BestTimeToPostCard() {
  const router              = useRouter();
  const [data, setData]     = useState<BestTimeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studioService.bestTimeToPost()
      .then(setData)
      .finally(() => setLoading(false));
  }, []);

  const display  = data ?? FALLBACK;
  const bars     = display.activityByHour;
  const bestHour = display.bestHour;

  /* ── ApexCharts config ─────────────────────────────────────────────── */
  const series: ApexAxisChartSeries = useMemo(
    () => [{ name: "Activity", data: bars.map(b => b.score) }],
    [bars],
  );

  const options: ApexOptions = useMemo(() => ({
    chart: {
      type:      "bar",
      toolbar:   { show: false },
      zoom:      { enabled: false },
      animations:{ enabled: !loading, speed: 350 },
      background:"transparent",
      fontFamily:"inherit",
      sparkline: { enabled: false },
      events:    {},
    },
    plotOptions: {
      bar: {
        columnWidth: "78%",
        borderRadius: 2,
        distributed: true,         // each bar gets its own color
        dataLabels: { position: "top" },
      },
    },
    /* Highlight best-hour bar; others get soft pink */
    colors: bars.map(({ hour }) => hour === bestHour ? "#fe2c55" : "#fecdd3"),
    dataLabels: { enabled: false },
    legend:     { show: false },
    states: {
      hover:  { filter: { type: "darken",  value: 0.85 } },
      active: { filter: { type: "darken",  value: 0.85 } },
    },
    xaxis: {
      /* Sparse labels: 12AM · 6AM · 12PM · 6PM (end handled by 11PM → "12AM") */
      categories: bars.map(({ hour, label }) => {
        if (SHOW_LABELS.has(hour))  return label;
        if (hour === 23)            return "12AM";  // end-of-day marker
        return "";
      }),
      labels: {
        show:   true,
        rotate: 0,
        style:  { fontSize: "7px", colors: "#9aa1ad", fontFamily: "inherit" },
        offsetY: 2,
      },
      axisBorder: { show: false },
      axisTicks:  { show: false },
    },
    yaxis: { show: false },
    grid: {
      show:    false,
      padding: { left: -8, right: -8, top: -12, bottom: -8 },
    },
    tooltip: {
      enabled: true,
      theme:   "dark",
      style:   { fontSize: "11px", fontFamily: "inherit" },
      x:       { show: false },
      y: {
        formatter: (v: number, opts?: { dataPointIndex?: number }) => {
            const bar = bars[opts?.dataPointIndex ?? 0];
            const parts = [`Score ${Math.round(v)}`];
            if (bar?.posts_count) parts.push(`${bar.posts_count} post${bar.posts_count !== 1 ? "s" : ""}`);
            return parts.join(" · ");
          },
        title: {
          formatter: (_: string, opts?: { dataPointIndex?: number }) =>
            `${bars[opts?.dataPointIndex ?? 0]?.label ?? ""} •`,
        },
      },
    },
  }), [bars, bestHour, loading]);

  return (
    <div className="shrink-0 rounded-2xl border border-[#eeeeee] bg-white p-3">

      {/* Header */}
      <div className="flex items-center gap-1.5">
        <div className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#fff0f4]">
          <BarChart2 className="h-3 w-3 text-[#fe2c55]" />
        </div>
        <p className="flex-1 text-[12px] font-bold leading-none text-black">Best time to post</p>
        <span title={display.hasEnoughData ? "Based on your past post performance" : "Based on general audience activity - post more to get personalised data"}>
          <Info className="h-3 w-3 cursor-help text-[#9aa1ad]" />
        </span>
      </div>

      {/* Subtitle */}
      <p className="mt-0.5 text-[10px] text-[#9aa1ad]">
        {display.message ?? (display.hasEnoughData
          ? "Based on your past post performance"
          : "Based on general activity - post more for personalized data")}
      </p>

      {/* Recommendation */}
      {loading ? (
        <div className="mt-2 h-5 w-36 animate-pulse rounded bg-[#f3f4f6]" />
      ) : (
        <p className="mt-1.5 text-[15px] font-bold leading-none text-black">
          {display.bestDay},{" "}
          <span className="text-[#fe2c55]">{display.bestTime}</span>
        </p>
      )}

      {/* Bar chart */}
      <div className="mt-2">
        {loading ? (
          <div className="h-[68px] animate-pulse rounded bg-[#f3f4f6]" />
        ) : (
          <div style={{ marginLeft: -8, marginRight: -8 }}>
            <ApexChart
              type="bar"
              series={series}
              options={options}
              height={68}
              width="100%"
            />
          </div>
        )}
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={() => router.push("/studio/analytics")}
        className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-[10px] border border-[#e5e7eb] bg-white py-1.5 text-[11px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
      >
        <BarChart2 className="h-3 w-3" />
        See full analytics
      </button>
    </div>
  );
}
