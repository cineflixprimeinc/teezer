"use client";

/**
 * Shared building blocks for the Studio analytics dashboard.
 *
 * Everything visual that repeats across the page lives here - the card shell, the
 * growth chip, sparklines, and the loading / empty / error states - so the section
 * components stay about DATA and the look stays consistent by construction rather
 * than by fifteen copies of the same Tailwind string.
 */

import dynamic from "next/dynamic";
import { useMemo, type ReactNode } from "react";
import { ArrowDownRight, ArrowUpRight, Inbox, TriangleAlert } from "lucide-react";
import type { ApexOptions } from "apexcharts";
import type { Growth, SeriesPoint } from "@/services/studio-analytics.service";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ── Card shell ─────────────────────────────────────────────────────────────── */

/**
 * The white rounded card every panel sits in. `hover` adds the lift the design
 * uses on the KPI row; panels that contain their own interactive controls don't
 * take it, because a whole card that moves under the cursor makes a dropdown
 * inside it feel unstable.
 */
export function Card({
  children,
  className = "",
  hover = false,
}: {
  children: ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={[
        "rounded-2xl border border-slate-100 bg-white p-5",
        "shadow-[0_1px_2px_rgba(16,24,40,0.04),0_4px_16px_rgba(16,24,40,0.04)]",
        hover
          ? "transition-[transform,box-shadow] duration-200 hover:-translate-y-0.5 hover:shadow-[0_4px_8px_rgba(16,24,40,0.06),0_12px_28px_rgba(16,24,40,0.08)]"
          : "",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="flex items-center gap-1.5">
        <h3 className="text-[15px] font-semibold text-slate-900">{title}</h3>
        {hint && (
          <span
            title={hint}
            className="flex size-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[9px] font-bold text-slate-400"
          >
            i
          </span>
        )}
      </div>
      {action}
    </div>
  );
}

/* ── Growth chip ────────────────────────────────────────────────────────────── */

/**
 * The "↑ 18.6% vs May 15 – Jun 11" chip.
 *
 * When `comparable` is false the previous period had no data, so there is no
 * percentage to show. We deliberately render nothing rather than "+100%" or "-":
 * a growth figure computed against a zero baseline is not a fact about the
 * creator's performance, and dressing it up as one is how dashboards start lying.
 */
export function GrowthChip({ growth, compareLabel }: { growth: Growth; compareLabel?: string }) {
  if (!growth.comparable) {
    return <span className="text-[11px] text-slate-400">No prior period</span>;
  }

  const Icon = growth.up ? ArrowUpRight : ArrowDownRight;
  const tone = growth.up ? "text-emerald-600" : "text-rose-600";

  return (
    <span className="flex flex-wrap items-center gap-1 text-[11px]">
      <span className={`flex items-center gap-0.5 font-semibold ${tone}`}>
        <Icon className="size-3" strokeWidth={2.5} />
        {growth.pct}%
      </span>
      {compareLabel && <span className="text-slate-400">vs {compareLabel}</span>}
    </span>
  );
}

/* ── Sparkline ──────────────────────────────────────────────────────────────── */

/**
 * The tiny trend line under each KPI. Deliberately axis-less and tooltip-less: it
 * conveys shape, not values - the number above it is the value.
 */
export function Sparkline({
  data,
  color,
  height = 40,
}: {
  data: SeriesPoint[];
  color: string;
  height?: number;
}) {
  const values = useMemo(() => data.map(d => d.value), [data]);

  const options: ApexOptions = useMemo(
    () => ({
      chart: {
        type: "line",
        sparkline: { enabled: true },
        animations: { enabled: true, speed: 350 },
        parentHeightOffset: 0,
      },
      stroke: { curve: "smooth", width: 2 },
      colors: [color],
      tooltip: { enabled: false },
      // A flat series (all zeroes) would otherwise be drawn dead-centre and read as
      // "steady", which is misleading - pin the floor at 0 so flat means flat.
      yaxis: { min: 0 },
    }),
    [color],
  );

  if (values.length === 0) {
    // No series at all - draw the baseline rather than collapse the card's height,
    // which would make the KPI row ragged.
    return <div style={{ height }} className="flex items-end"><div className="h-px w-full bg-slate-100" /></div>;
  }

  return (
    <ApexChart
      type="line"
      height={height}
      series={[{ name: "", data: values }]}
      options={options}
    />
  );
}

/* ── States ─────────────────────────────────────────────────────────────────── */

export function Skeleton({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-lg bg-slate-100 ${className}`} />;
}

/**
 * Shown when a panel has NO DATA SOURCE - not when a value is zero.
 *
 * The distinction matters. "0 likes" is a fact worth showing. An empty Top Cities
 * card is not a fact about the creator at all; it means we never collected the
 * data. Saying so plainly beats an empty donut that implies their audience is from
 * nowhere.
 */
export function EmptyState({ message, hint }: { message: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 py-10 text-center">
      <Inbox className="size-7 text-slate-300" strokeWidth={1.5} />
      <p className="text-[13px] font-medium text-slate-500">{message}</p>
      {hint && <p className="max-w-[220px] text-[11px] leading-relaxed text-slate-400">{hint}</p>}
    </div>
  );
}

export function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
      <TriangleAlert className="size-8 text-amber-500" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-semibold text-slate-800">Analytics is unavailable</p>
        <p className="mt-1 text-[13px] text-slate-500">
          We couldn&apos;t load your data. Rather than show you numbers we can&apos;t stand behind,
          we&apos;d rather show you nothing.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="mt-1 rounded-full bg-slate-900 px-4 py-2 text-[13px] font-semibold text-white transition hover:bg-slate-700"
      >
        Try again
      </button>
    </div>
  );
}
