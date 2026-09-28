"use client";

import { createContext, useContext, useMemo, useState } from "react";

export type Range = { from: string; to: string; label: string };

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return iso(d);
}

export const RANGE_PRESETS: { key: string; label: string; days: number }[] = [
  { key: "today", label: "Today", days: 0 },
  { key: "7d", label: "Last 7 days", days: 6 },
  { key: "14d", label: "Last 14 days", days: 13 },
  { key: "30d", label: "Last 30 days", days: 29 },
  { key: "90d", label: "Last 90 days", days: 89 },
];

export function presetRange(days: number, label: string): Range {
  return { from: daysAgo(days), to: iso(new Date()), label };
}

type Ctx = {
  range: Range;
  setRange: (r: Range) => void;
};

const DateRangeContext = createContext<Ctx | null>(null);

export function DateRangeProvider({ children }: { children: React.ReactNode }) {
  const [range, setRange] = useState<Range>(() => presetRange(6, "Last 7 days"));
  const value = useMemo(() => ({ range, setRange }), [range]);
  return <DateRangeContext.Provider value={value}>{children}</DateRangeContext.Provider>;
}

export function useDateRange(): Ctx {
  const ctx = useContext(DateRangeContext);
  if (!ctx) throw new Error("useDateRange must be used within DateRangeProvider");
  return ctx;
}
