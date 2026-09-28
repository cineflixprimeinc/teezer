"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { ApexOptions } from "apexcharts";

export type ChartPoint = { label: string; value: number };

type Props = {
  data: ChartPoint[];
  color?: string;
  height?: number;
  metricLabel?: string;
};

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

function formatVal(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  if (n % 1 !== 0)    return n.toFixed(2);
  return String(n);
}

export function StudioLineChart({ data, color = "#fe2c55", height = 220, metricLabel = "Value" }: Props) {
  const values = data.map(d => d.value);
  const maxVal = values.length ? Math.max(...values) : 0;
  const allZero = maxVal === 0;

  const series = useMemo(() => [{
    name: metricLabel,
    data: values,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }], [data, metricLabel]);

  const options: ApexOptions = useMemo(() => ({
    chart: {
      type: "area",
      toolbar: { show: false },
      zoom: { enabled: false },
      animations: { enabled: true, speed: 400, easing: "easeinout" },
      background: "transparent",
      fontFamily: "inherit",
    },
    stroke: {
      curve: "smooth",
      width: 3,
      colors: [color],
    },
    fill: {
      type: "gradient",
      gradient: {
        type: "vertical",
        shadeIntensity: 0,
        opacityFrom: 0.25,
        opacityTo: 0.02,
        stops: [0, 90, 100],
        colorStops: [
          { offset: 0,   color, opacity: 0.25 },
          { offset: 90,  color, opacity: 0.05 },
          { offset: 100, color, opacity: 0.0  },
        ],
      },
    },
    markers: {
      size: data.length <= 31 ? 4 : 0,
      colors: ["#ffffff"],
      strokeColors: color,
      strokeWidth: 2.5,
      hover: { size: 7, sizeOffset: 0 },
      shape: "circle",
    },
    xaxis: {
      categories: data.map(d => d.label),
      labels: {
        style: { colors: "#9ca3af", fontSize: "11px", fontFamily: "inherit" },
        rotate: 0,
        hideOverlappingLabels: true,
        maxHeight: 36,
        trim: true,
      },
      axisBorder: { show: false },
      axisTicks: { show: false },
      crosshairs: {
        show: true,
        stroke: { color: "#e5e7eb", width: 1, dashArray: 3 },
      },
      tooltip: { enabled: false },
    },
    yaxis: {
      forceNiceScale: true,
      min: 0,
      /* When all values are 0, give the axis breathing room */
      max: allZero ? 10 : undefined,
      labels: {
        style: { colors: "#9ca3af", fontSize: "11px", fontFamily: "inherit" },
        formatter: (v: number) => formatVal(Math.round(v)),
        offsetX: -4,
      },
    },
    grid: {
      borderColor: "#e5e7eb",
      strokeDashArray: 4,
      xaxis: { lines: { show: false } },
      yaxis: { lines: { show: true } },
      padding: { top: 4, right: 12, bottom: 0, left: 4 },
    },
    dataLabels: { enabled: false },
    tooltip: {
      enabled: true,
      theme: "dark",
      style: { fontSize: "12px", fontFamily: "inherit" },
      x: { show: true },
      y: {
        formatter: (v: number) => formatVal(v),
        title: { formatter: () => `${metricLabel}: ` },
      },
      marker: { show: true },
    },
    colors: [color],
    legend: { show: false },
    responsive: [
      {
        breakpoint: 640,
        options: { markers: { size: 0 }, stroke: { width: 2 } },
      },
    ],
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [data, color, metricLabel, allZero]);

  if (!data.length) {
    return (
      <div className="flex flex-col items-center justify-center text-center" style={{ height }}>
        <svg className="mb-2 h-8 w-8 text-[#d1d5db]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
        </svg>
        <p className="text-[13px] text-[#9ca3af]">No data yet for this period.</p>
      </div>
    );
  }

  return (
    <div style={{ marginLeft: -8 }}>
      <ApexChart
        type="area"
        series={series}
        options={options}
        height={height}
        width="100%"
      />
    </div>
  );
}
