import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 1234567 → "1.2M" */
export function formatCompact(value?: number | string | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
}

/** 1234567 → "1,234,567" */
export function formatNumber(value?: number | string | null): string {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("en");
}

/** "2026-05-30T13:28:42Z" → "May 30, 2026" */
export function formatDate(value?: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

/** "2026-05-30T13:28:42Z" → "2 hours ago" */
export function timeAgo(value?: string | null): string {
  if (!value) return "-";
  const secs = Math.floor((Date.now() - new Date(value).getTime()) / 1000);
  if (secs < 60)   return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400)return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800)return `${Math.floor(secs / 86400)}d ago`;
  return formatDate(value);
}

/** 12500.5 → "$12,500.50" */
export function formatCurrency(value?: number | string | null, currency = "USD"): string {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en", { style: "currency", currency }).format(n);
}

/** "%10.7" → "+10.7%" with correct sign styling class */
export function trendClass(val?: number | null): string {
  if (!val) return "text-[#6b7280]";
  return val > 0 ? "text-emerald-600" : "text-red-500";
}

export function trendLabel(val?: number | null): string {
  if (!val) return "-";
  return (val > 0 ? "+" : "") + val.toFixed(1) + "%";
}

/** Generate sparkline data (7 days of random for placeholder) */
export function mockSpark(base: number, count = 7): number[] {
  let v = base;
  return Array.from({ length: count }, () => {
    v = v + (Math.random() - 0.45) * v * 0.1;
    return Math.max(0, Math.round(v));
  });
}
