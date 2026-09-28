"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, RotateCcw, CheckCircle, ChevronRight, Check } from "lucide-react";

export const BRAND = "#fe2c55";

/* ─── Section Badge ───────────────────────────────────────────────────────── */
export function SectionBadge({ n }: { n: number }) {
  return (
    <span
      className="inline-flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
      style={{ background: BRAND }}
    >
      {n}
    </span>
  );
}

/* ─── Section Title ───────────────────────────────────────────────────────── */
export function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
      {children}
    </p>
  );
}

/* ─── Page Header ─────────────────────────────────────────────────────────── */
export function PageHeader({
  title,
  subtitle,
  backHref = "/more",
}: {
  title: string;
  subtitle: string;
  backHref?: string;
}) {
  return (
    <header className="mb-6 flex items-center gap-3">
      <Link
        href={backHref}
        className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-[10px] border border-[#e8eaf0] bg-white text-[#6b7280] shadow-sm transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
      >
        <ArrowLeft className="h-4 w-4" />
      </Link>
      <div>
        <h1 className="text-[20px] font-bold leading-tight text-[#111827]">{title}</h1>
        <p className="mt-0.5 text-[12px] leading-none text-[#9ca3af]">{subtitle}</p>
      </div>
    </header>
  );
}

/* ─── Settings Card ───────────────────────────────────────────────────────── */
export function SettingsCard({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-[#e8eaf0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)] ${className}`}
    >
      {children}
    </div>
  );
}

/* ─── Card Header ─────────────────────────────────────────────────────────── */
export function CardHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="flex items-center gap-2 border-b border-[#f0f1f5] px-5 py-3.5">
      <SectionBadge n={n} />
      <SectionTitle>{title}</SectionTitle>
    </div>
  );
}

/* ─── Settings Row ────────────────────────────────────────────────────────── */
export function SettingsRow({
  icon: Icon,
  iconBg = "bg-[#f4f5f7]",
  iconColor = "text-[#6b7280]",
  title,
  desc,
  right,
  last,
  onClick,
}: {
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  title: string;
  desc?: string;
  right?: React.ReactNode;
  last?: boolean;
  onClick?: () => void;
}) {
  const inner = (
    <div
      className={`flex items-center gap-3 px-5 py-3.5 ${
        !last ? "border-b border-[#f0f1f5]" : ""
      } ${onClick ? "cursor-pointer hover:bg-[#fafbfc] transition-colors" : ""}`}
      onClick={onClick}
    >
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}
      >
        <Icon className={`h-[17px] w-[17px] ${iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-[#111827]">{title}</p>
        {desc && (
          <p className="mt-0.5 text-[11px] leading-snug text-[#9ca3af]">{desc}</p>
        )}
      </div>
      {right !== undefined && (
        <div className="flex flex-shrink-0 items-center gap-2">{right}</div>
      )}
    </div>
  );
  return inner;
}

/* ─── Chevron Row (navigable row with arrow) ──────────────────────────────── */
export function ChevronRow({
  icon: Icon,
  iconBg = "bg-[#f4f5f7]",
  iconColor = "text-[#6b7280]",
  title,
  desc,
  badge,
  last,
  href,
}: {
  icon: React.ElementType;
  iconBg?: string;
  iconColor?: string;
  title: string;
  desc?: string;
  badge?: React.ReactNode;
  last?: boolean;
  href?: string;
}) {
  const content = (
    <div
      className={`flex cursor-pointer items-center gap-3 px-5 py-3.5 transition-colors hover:bg-[#fafbfc] ${
        !last ? "border-b border-[#f0f1f5]" : ""
      }`}
    >
      <span
        className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${iconBg}`}
      >
        <Icon className={`h-[17px] w-[17px] ${iconColor}`} />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold leading-tight text-[#111827]">{title}</p>
        {desc && (
          <p className="mt-0.5 text-[11px] leading-snug text-[#9ca3af]">{desc}</p>
        )}
      </div>
      <div className="flex flex-shrink-0 items-center gap-2">
        {badge}
        <ChevronRight className="h-4 w-4 text-[#d1d5db]" />
      </div>
    </div>
  );

  if (href) return <Link href={href}>{content}</Link>;
  return content;
}

/* ─── Toggle ──────────────────────────────────────────────────────────────── */
export function Toggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="relative flex-shrink-0 cursor-pointer rounded-full focus:outline-none"
      style={{
        width: 50,
        height: 28,
        background: on ? BRAND : "#d1d5db",
        border: "none",
        padding: 0,
        transition: "background 220ms",
      }}
    >
      <span
        style={{
          position: "absolute",
          width: 22,
          height: 22,
          top: 3,
          left: on ? 25 : 3,
          borderRadius: "50%",
          background: "#ffffff",
          boxShadow: "0 2px 6px rgba(0,0,0,0.22)",
          transition: "left 220ms cubic-bezier(0.4,0,0.2,1)",
        }}
      />
    </button>
  );
}

/* ─── Status Badge ────────────────────────────────────────────────────────── */
type BadgeColor = "green" | "blue" | "red" | "yellow" | "purple" | "gray" | "orange";
const BADGE_CLS: Record<BadgeColor, string> = {
  green:  "bg-[#dcfce7] text-[#16a34a]",
  blue:   "bg-[#dbeafe] text-[#2563eb]",
  red:    "bg-[#fee2e2] text-[#dc2626]",
  yellow: "bg-[#fef9c3] text-[#ca8a04]",
  purple: "bg-[#f3e8ff] text-[#7c3aed]",
  gray:   "bg-[#f3f4f6] text-[#6b7280]",
  orange: "bg-[#ffedd5] text-[#ea580c]",
};
export function StatusBadge({
  label,
  color = "green",
}: {
  label: string;
  color?: BadgeColor;
}) {
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${BADGE_CLS[color]}`}>
      {label}
    </span>
  );
}

/* ─── Inline Button ───────────────────────────────────────────────────────── */
type BtnVariant = "default" | "primary" | "danger" | "warning";
const BTN_CLS: Record<BtnVariant, string> = {
  default: "border border-[#e8eaf0] bg-white text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55]",
  primary: "text-white hover:opacity-90",
  danger:  "border border-[#fee2e2] bg-[#fff0f0] text-[#dc2626] hover:bg-[#fee2e2]",
  warning: "border border-[#fef3c7] bg-[#fffbeb] text-[#d97706] hover:bg-[#fef3c7]",
};
export function Btn({
  label,
  onClick,
  variant = "default",
}: {
  label: string;
  onClick?: () => void;
  variant?: BtnVariant;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ${BTN_CLS[variant]}`}
      style={variant === "primary" ? { background: BRAND } : undefined}
    >
      {label}
    </button>
  );
}

/* ─── Wide Button (full-width or block) ───────────────────────────────────── */
export function WideBtn({
  label,
  onClick,
  variant = "default",
  icon: Icon,
}: {
  label: string;
  onClick?: () => void;
  variant?: BtnVariant;
  icon?: React.ElementType;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center justify-center gap-2 rounded-[10px] px-4 py-2.5 text-[13px] font-semibold transition-colors ${BTN_CLS[variant]}`}
      style={variant === "primary" ? { background: BRAND } : undefined}
    >
      {Icon && <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

/* ─── Small Select ────────────────────────────────────────────────────────── */
export function SmallSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 appearance-none rounded-full border border-[#e8eaf0] bg-white pl-3 pr-7 text-[12px] font-semibold text-[#374151] outline-none focus:border-[#fe2c55]"
      >
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9ca3af]" />
    </div>
  );
}

/* ─── Nice Select (custom styled dropdown, replaces native select) ────────── */
export function NiceSelect({
  value,
  onChange,
  options,
  placeholder,
  fullWidth,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder?: string;
  fullWidth?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: fullWidth ? undefined : 0, width: fullWidth ? "100%" : undefined }}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-[10px] border bg-white pl-3 pr-2.5 text-[13px] font-semibold transition-colors focus:outline-none"
        style={{
          height: fullWidth ? 34 : 32,
          width: fullWidth ? "100%" : undefined,
          minWidth: fullWidth ? undefined : 110,
          borderColor: open ? BRAND : "#e8eaf0",
          color: value ? "#374151" : "#9ca3af",
          boxShadow: open ? `0 0 0 3px rgba(254,44,85,0.10)` : "none",
        }}
      >
        <span className="flex-1 truncate text-left">{value || placeholder || "Select…"}</span>
        <ChevronDown
          className="h-3 w-3 flex-shrink-0 transition-transform duration-200"
          style={{ color: open ? BRAND : "#9ca3af", transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div
          className="nice-select-scroll absolute left-0 top-[calc(100%+4px)] z-[200] min-w-[160px] overflow-y-auto overscroll-contain rounded-[14px] border border-[#e8eaf0] bg-white"
          style={{
            boxShadow: "0 8px 32px rgba(0,0,0,0.13)",
            width: fullWidth ? "100%" : undefined,
            maxHeight: 280,
            scrollbarWidth: "thin",
            scrollbarColor: "#cbd5e1 transparent",
          }}
          onWheel={(e) => e.stopPropagation()}
        >
          {options.map((opt) => {
            const selected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-[12.5px] font-semibold transition-colors"
                style={{
                  background: selected ? "#fff0f4" : "transparent",
                  color: selected ? BRAND : "#374151",
                }}
                onMouseEnter={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "#f8fafc"; }}
                onMouseLeave={(e) => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = "transparent"; }}
              >
                <span
                  className="flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border"
                  style={{
                    borderColor: selected ? BRAND : "#e8eaf0",
                    background: selected ? BRAND : "transparent",
                  }}
                >
                  {selected && <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />}
                </span>
                {opt}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ─── Field (label + input/textarea) ─────────────────────────────────────── */
export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  rows,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  rows?: number;
}) {
  const base =
    "w-full rounded-[10px] border border-[#e8eaf0] bg-white px-3 text-[13px] text-[#111827] placeholder:text-[#c0c4cc] outline-none transition-colors focus:border-[#fe2c55]";
  return (
    <div className="flex flex-col gap-[3px]">
      <label className="text-[11px] font-semibold text-[#6b7280]">{label}</label>
      {rows ? (
        <div className="relative">
          <textarea
            rows={rows}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            maxLength={150}
            className={`${base} resize-none py-2 leading-snug`}
          />
          <span className="absolute bottom-1.5 right-2 text-[10px] text-[#c0c4cc]">
            {value.length} / 150
          </span>
        </div>
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className={`${base} h-8`}
        />
      )}
    </div>
  );
}

/* ─── Amount Card (balance/stat display) ─────────────────────────────────── */
export function AmountCard({
  icon: Icon,
  iconBg,
  iconColor,
  label,
  amount,
  currency = "",
  sub,
}: {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  amount: string;
  currency?: string;
  sub?: string;
}) {
  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-[#f0f1f5] bg-gradient-to-r from-[#fafbfc] to-white p-4">
      <span
        className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-2xl ${iconBg}`}
      >
        <Icon className={`h-6 w-6 ${iconColor}`} />
      </span>
      <div>
        <p className="text-[11px] font-semibold text-[#9ca3af]">{label}</p>
        <p className="text-[22px] font-extrabold leading-tight text-[#111827]">
          {currency && (
            <span className="mr-1 text-[14px] font-bold text-[#9ca3af]">{currency}</span>
          )}
          {amount}
        </p>
        {sub && <p className="text-[10px] text-[#9ca3af]">{sub}</p>}
      </div>
    </div>
  );
}

/* ─── Action Bar ──────────────────────────────────────────────────────────── */
export function ActionBar({
  onReset,
  onSave,
  saveLabel = "Save Changes",
}: {
  onReset?: () => void;
  onSave?: () => void;
  saveLabel?: string;
}) {
  return (
    <div className="mt-6 flex items-center justify-between rounded-2xl border border-[#e8eaf0] bg-white px-5 py-3 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      <button
        onClick={onReset}
        className="flex items-center gap-2 rounded-[10px] border border-[#e8eaf0] bg-white px-4 py-1.5 text-[13px] font-semibold text-[#6b7280] transition hover:border-[#d1d5db] hover:text-[#374151]"
      >
        <RotateCcw className="h-3.5 w-3.5" />
        Reset Changes
      </button>
      <button
        onClick={onSave}
        className="flex items-center gap-2 rounded-[10px] px-5 py-1.5 text-[13px] font-bold text-white shadow-sm transition hover:opacity-90 active:scale-[0.98]"
        style={{ background: BRAND, boxShadow: "0 2px 12px rgba(254,44,85,0.30)" }}
      >
        <CheckCircle className="h-4 w-4" />
        {saveLabel}
      </button>
    </div>
  );
}

/* ─── Divider ─────────────────────────────────────────────────────────────── */
export function Divider() {
  return <div className="mx-5 border-t border-[#f0f1f5]" />;
}
