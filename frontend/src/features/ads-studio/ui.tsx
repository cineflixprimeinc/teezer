"use client";

import Link from "next/link";
import { TrendingUp, TrendingDown, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { delta } from "./format";

/* ── Card shell ────────────────────────────────────────────────────────── */
export function Card({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-[#eef0f3] bg-white", className)}>{children}</div>
  );
}

export function CardHead({
  title, action, subtitle,
}: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 px-5 pt-5">
      <div>
        <h2 className="text-[15px] font-bold text-[#111827]">{title}</h2>
        {subtitle && <p className="mt-0.5 text-[12px] text-[#9ca3af]">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ── Growth pill (▲ +12.4%) ────────────────────────────────────────────── */
export function Growth({ value, positive }: { value: number; positive?: boolean }) {
  const good = positive ?? value >= 0;
  const Icon = value >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 text-[12px] font-semibold",
        good ? "text-[#16a34a]" : "text-[#e11d48]",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
      {delta(value)}
    </span>
  );
}

/* ── Stat tile (icon + value + vs-prior delta) ─────────────────────────── */
export function StatTile({
  icon: Icon, iconBg, iconColor, label, value, compareLabel, deltaPct, positive, hint,
}: {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  compareLabel?: string;
  deltaPct?: number;
  positive?: boolean;
  hint?: string;
}) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center gap-2.5">
        <span className={cn("grid h-9 w-9 place-items-center rounded-full", iconBg)}>
          <Icon className={cn("h-[18px] w-[18px]", iconColor)} />
        </span>
        <span className="text-[13px] font-semibold text-[#6b7280]">{label}</span>
      </div>
      <p className="text-[26px] font-extrabold leading-none tracking-tight text-[#111827] tabular-nums">
        {value}
      </p>
      <div className="mt-2 flex items-center gap-2 text-[11px] text-[#9ca3af]">
        {compareLabel && <span>{compareLabel}</span>}
        {deltaPct !== undefined && <Growth value={deltaPct} positive={positive} />}
        {hint && !compareLabel && <span>{hint}</span>}
      </div>
    </Card>
  );
}

/* ── Status / delivery pills ───────────────────────────────────────────── */
const STATUS_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  draft:             { bg: "bg-[#f3f4f6]", text: "text-[#6b7280]", label: "Draft" },
  pending_review:    { bg: "bg-[#fef3c7]", text: "text-[#b45309]", label: "In review" },
  changes_requested: { bg: "bg-[#ffedd5]", text: "text-[#c2410c]", label: "Needs changes" },
  approved:          { bg: "bg-[#dbeafe]", text: "text-[#1d4ed8]", label: "Approved" },
  active:            { bg: "bg-[#dcfce7]", text: "text-[#15803d]", label: "Active" },
  paused:            { bg: "bg-[#fff0f4]", text: "text-[#be123c]", label: "Paused" },
  rejected:          { bg: "bg-[#fee2e2]", text: "text-[#b91c1c]", label: "Rejected" },
  completed:         { bg: "bg-[#e0e7ff]", text: "text-[#4338ca]", label: "Completed" },
  archived:          { bg: "bg-[#e5e7eb]", text: "text-[#374151]", label: "Archived" },
};

export function StatusPill({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span className={cn("inline-block rounded-full px-2.5 py-0.5 text-[11px] font-bold", s.bg, s.text)}>
      {s.label}
    </span>
  );
}

/* ── Delivery dot (matches the ● Learning / ● Active row) ──────────────── */
const DELIVERY_DOT: Record<string, string> = {
  Active: "bg-[#22c55e]",
  Off: "bg-[#9ca3af]",
  Completed: "bg-[#6366f1]",
  "In review": "bg-[#f59e0b]",
  Rejected: "bg-[#ef4444]",
  "Needs changes": "bg-[#f97316]",
};

export function DeliveryDot({ delivery }: { delivery: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[13px] text-[#374151]">
      <span className={cn("h-2 w-2 rounded-full", DELIVERY_DOT[delivery] ?? "bg-[#9ca3af]")} />
      {delivery}
    </span>
  );
}

/* ── Empty / loading states ────────────────────────────────────────────── */
export function EmptyState({
  icon: Icon, title, desc, action,
}: { icon: LucideIcon; title: string; desc: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[#e5e7eb] py-14 text-center">
      <div className="mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#fff0f4]">
        <Icon className="h-7 w-7 text-[#fe2c55]" />
      </div>
      <p className="text-[15px] font-bold text-[#374151]">{title}</p>
      <p className="mt-1 max-w-[320px] text-[13px] text-[#9ca3af]">{desc}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-lg bg-[#f1f3f5]", className)} />;
}

/* ── Buttons ───────────────────────────────────────────────────────────── */
export function PrimaryButton({
  children, onClick, href, className, type = "button",
}: {
  children: React.ReactNode; onClick?: () => void; href?: string;
  className?: string; type?: "button" | "submit";
}) {
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-full bg-[#fe2c55] px-5 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#e0243d] disabled:opacity-50",
    className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type={type} onClick={onClick} className={cls}>{children}</button>;
}

export function GhostButton({
  children, onClick, href, className,
}: { children: React.ReactNode; onClick?: () => void; href?: string; className?: string }) {
  const cls = cn(
    "inline-flex items-center justify-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f9fafb]",
    className,
  );
  if (href) return <Link href={href} className={cls}>{children}</Link>;
  return <button type="button" onClick={onClick} className={cls}>{children}</button>;
}

/* ── Page header (title + subtitle + actions) ──────────────────────────── */
export function PageHeader({
  title, subtitle, children,
}: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-[24px] font-extrabold tracking-tight text-[#111827]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-[#6b7280]">{subtitle}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
