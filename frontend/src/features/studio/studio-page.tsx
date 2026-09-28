"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CentrifugoWebSocket, type RealtimeSocket } from "@/services/realtime/centrifugo";
import {
  BarChart2, Bell, BookOpen, Bookmark, ChevronDown, ChevronLeft, ChevronRight,
  CircleDollarSign, Clapperboard, Code2, Coins, Crown, Edit3, ExternalLink, Eye, Flame,
  Headphones, Heart, HelpCircle, Info, Layers, LayoutDashboard, Lightbulb,
  Lock, LogOut, Megaphone, MessageCircle, MessageSquare, Mic2, MoreHorizontal,
  Music, Music2, Play, Plus, Radio, RefreshCw, Search, Settings, Share2, Shield, ShieldCheck,
  Sparkles, Star, TrendingUp, Upload, User, UserPlus, Users, Video, Wallet, Wand2, Zap,
} from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { userService } from "@/services/user.service";
import { studioService, type AnalyticsMetric } from "@/services/studio.service";
import type { ReelsooVideo } from "@/types/video";
import { StudioLineChart, type ChartPoint } from "./studio-chart";

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════════════ */
function fmt(n: number | undefined | null): string {
  if (!n) return "0";
  return formatCompact(n);
}

/** Currency, always to the cent. An earnings figure rounded to "$5K" is not useful. */
function money(n: number | undefined | null): string {
  return `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDuration(s: number | null | undefined): string {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function daysActive(createdAt?: string): number {
  if (!createdAt) return 0;
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR NAV
═══════════════════════════════════════════════════════════════════════════ */
type NavItem = {
  label:     string;
  icon:      React.ElementType;
  href:      string;
  badge?:    number;
  external?: boolean;
  children?: NavItem[];
};

const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard",      icon: LayoutDashboard, href: "/studio"},
  { label: "Content",        icon: Clapperboard,    href: "/studio/content"},
  { label: "Analytics",      icon: BarChart2,       href: "/studio/analytics"},
  { label: "Monetization",   icon: CircleDollarSign,href: "/studio/monetization"},
  { label: "Premium",        icon: Crown,           href: "/studio/premium"},
  { label: "Wallet & Coins", icon: Wallet,          href: "/studio/wallets-coins"},
  { label: "Verification",   icon: ShieldCheck,     href: "/studio/verification"},
  { label: "Comments",       icon: MessageCircle,   href: "/studio/comments"},
  { label: "Music Library",  icon: Music,           href: "/studio/music"},
  // Settings removed from the sidebar on request. The /studio/settings ROUTE is
  // deliberately left in place - it still renders and anything already linking
  // to it keeps working; it simply is not advertised in the nav any more.
  { label: "For Developers", icon: Code2,     href: "https://developers.teezer.live", external: true },
  { label: "Ads Manager",    icon: Megaphone, href: "/ads-manager"},
];

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════════════════════════ */
export function StudioSidebar({
  collapsed, onToggle, activeHref,
}: {
  collapsed: boolean;
  onToggle: () => void;
  activeHref: string;
}) {
  // Auto-expand any group whose child is currently active
  const defaultOpen = NAV_ITEMS
    .filter((i) => i.children?.some((c) => c.href === activeHref))
    .map((i) => i.href);
  const [openGroups, setOpenGroups] = React.useState<string[]>(defaultOpen);

  // Immediate role checks from auth store - available before API responds
  const isAuthCreator    = useAuthStore((s) => s.isCreator());
  const isAuthAdmin      = useAuthStore((s) => s.isAdmin());
  const hasUploadedVideo = useAuthStore((s) => !!(s.user?.videos_count && s.user.videos_count > 0));
  const router = useRouter();

  function toggleGroup(href: string) {
    setOpenGroups((prev) =>
      prev.includes(href) ? prev.filter((h) => h !== href) : [...prev, href],
    );
  }



  return (
    <aside
      className="flex flex-shrink-0 flex-col border-r border-[#f0f0f0] bg-white transition-all duration-200"
      style={{ width: collapsed ? 64 : 220 }}
    >
      {/* Logo */}
      <div className="flex h-16 items-center justify-between px-4 border-b border-[#f0f0f0]">
        {!collapsed && (
          <span className="flex items-center gap-2"><Image src="/favicon.png" alt="Teezer Studio" width={32} height={32} className="rounded-lg object-contain" /><span className="text-[15px] font-bold text-[#111827]">Teezer Studio</span></span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[#6b7280] transition hover:bg-[#f8f9fb] hover:text-[#fd4605]",
            collapsed && "mx-auto",
          )}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3" style={{ scrollbarWidth: "none" }}>
        {NAV_ITEMS.map((item) => {
          const Icon          = item.icon;
          const hasChildren   = !!(item.children?.length);
          const isGroupOpen   = openGroups.includes(item.href);
          const childActive   = hasChildren && item.children!.some((c) => c.href === activeHref);
          const selfActive    = !item.external && !hasChildren && activeHref === item.href;
          const parentActive  = childActive; // parent row highlighted when a child is active

          const tip    = collapsed ? item.label : undefined;



          // Normal unlocked flat item
          return (
            <Link key={item.href} href={item.href}
              target={item.external ? "_blank" : undefined}
              rel={item.external ? "noopener noreferrer" : undefined}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 text-[13px] font-medium transition",
                collapsed ? "justify-center px-0" : "",
                selfActive
                  ? "bg-[#fff3ec] text-[#fd4605]"
                  : "text-[#374151] hover:bg-[#f8f9fb] hover:text-[#fd4605]",
              )}
              title={tip}
            >
              <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", selfActive && "text-[#fd4605]")} />
              {!collapsed && <span className="truncate">{item.label}</span>}
              {!collapsed && item.external && <ExternalLink className="ml-auto h-3 w-3 text-[#9ca3af]" />}
              {!collapsed && !item.external && item.badge != null && item.badge > 0 && (
                <span className="ml-auto grid h-5 min-w-5 place-items-center rounded-full bg-[#fd4605] px-1 text-[10px] font-bold text-white">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Reelsoo Pro card */}
      {!collapsed && (
        <div className="mx-3 mb-2 overflow-hidden rounded-xl bg-gradient-to-br from-[#fd4605] to-[#b83203] px-3 py-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5">
              <Crown className="h-3.5 w-3.5 flex-shrink-0 text-yellow-300" />
              <p className="text-[12px] font-extrabold text-white">Teezer Pro</p>
            </div>
            <button className="rounded-full bg-white px-2.5 py-0.5 text-[10px] font-bold text-[#fd4605] transition hover:bg-yellow-50">
              Upgrade
            </button>
          </div>
        </div>
      )}

      {/* Back to Reelsoo */}
      <div className={cn("px-3 pb-4", collapsed && "px-1")}>
        <Link
          href="/"
          className={cn(
            "flex items-center gap-2.5 rounded-[10px] border border-[#e5e7eb] bg-white px-3 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]",
            collapsed && "justify-center px-0",
          )}
          title="Back to Teezer"
        >
          <ChevronLeft className="h-4 w-4 flex-shrink-0" />
          {!collapsed && <span>Back to Teezer</span>}
        </Link>
      </div>
    </aside>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   DATE RANGE PICKER
═══════════════════════════════════════════════════════════════════════════ */
const DateRangePicker = React.forwardRef<HTMLDivElement, {
  dateRange: { start: Date; end: Date };
  open: boolean;
  onToggle: (v: boolean) => void;
  onChange: (r: { start: Date; end: Date }) => void;
}>(function DateRangePicker({ dateRange, open, onToggle, onChange }, ref) {
  const today = new Date(); today.setHours(0,0,0,0);
  const [customStart, setCustomStart] = useState("");
  const [customEnd,   setCustomEnd]   = useState("");
  const [error, setError]             = useState("");

  const fmtBtn = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const PRESETS = [
    { label: "Last 7 days",  days: 7  },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
  ];

  function applyPreset(days: number) {
    const end   = new Date(); end.setHours(23,59,59,999);
    const start = new Date(Date.now() - (days - 1) * 86400000); start.setHours(0,0,0,0);
    onChange({ start, end });
    onToggle(false); setError("");
  }

  function applyCustom() {
    if (!customStart || !customEnd) { setError("Select both dates."); return; }
    const s = new Date(customStart); const e = new Date(customEnd);
    if (s > e)      { setError("Start date must be before end date."); return; }
    const maxE = new Date(); maxE.setHours(23,59,59,999);
    if (e > maxE)   { setError("End date cannot be in the future."); return; }
    const diffDays = (e.getTime() - s.getTime()) / 86400000;
    if (diffDays > 92) { setError("Maximum date range is 3 months."); return; }
    onChange({ start: s, end: e });
    onToggle(false); setError("");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => onToggle(!open)}
        className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-medium text-[#374151] transition hover:border-[#fd4605]"
      >
        <span className="text-[#fd4605]">📅</span>
        <span>{fmtBtn(dateRange.start)} - {dateRange.end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute right-0 top-full z-50 mt-2 w-[300px] rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-xl">
          {/* Presets */}
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Quick select</p>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {PRESETS.map(p => (
              <button key={p.days} onClick={() => applyPreset(p.days)}
                className="rounded-lg border border-[#e5e7eb] py-1.5 text-[11px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:bg-[#fff5f5]">
                {p.label}
              </button>
            ))}
          </div>
          {/* Custom */}
          <div className="border-t border-[#f0f0f0] pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Custom range</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-0.5 block text-[10px] text-[#6b7280]">Start</label>
                <input type="date" value={customStart} max={new Date().toISOString().split("T")[0]}
                  onChange={e => { setCustomStart(e.target.value); setError(""); }}
                  className="w-full rounded-lg border border-[#e5e7eb] px-2 py-1.5 text-[12px] text-[#374151] outline-none focus:border-[#fd4605]" />
              </div>
              <div>
                <label className="mb-0.5 block text-[10px] text-[#6b7280]">End</label>
                <input type="date" value={customEnd} max={new Date().toISOString().split("T")[0]}
                  onChange={e => { setCustomEnd(e.target.value); setError(""); }}
                  className="w-full rounded-lg border border-[#e5e7eb] px-2 py-1.5 text-[12px] text-[#374151] outline-none focus:border-[#fd4605]" />
              </div>
            </div>
            {error && <p className="mt-1.5 text-[11px] font-medium text-red-500">{error}</p>}
            <button onClick={applyCustom}
              className="mt-2.5 w-full rounded-lg bg-[#fd4605] py-2 text-[12px] font-bold text-white transition hover:bg-[#e03e04]">
              Apply Range
            </button>
            <p className="mt-1.5 text-center text-[10px] text-[#9ca3af]">Max 3 months · No future dates</p>
          </div>
        </div>
      )}
    </div>
  );
});

/* ═══════════════════════════════════════════════════════════════════════════
   ACCOUNT SWITCHER MODAL
═══════════════════════════════════════════════════════════════════════════ */
function AccountSwitcherModal({ onClose, currentUser, avatar }: {
  onClose: () => void; currentUser: string; avatar?: string | null;
}) {
  const { savedAccounts, login, switchAccount, removeAccountFromSaved, user } = useAuthStore();
  const [showLogin, setShowLogin] = useState(false);
  const [loginVal,  setLoginVal]  = useState("");
  const [password,  setPassword]  = useState("");
  const [loading,   setLoading]   = useState(false);
  const [err,       setErr]       = useState("");

  const initials = (currentUser || "U")[0].toUpperCase();
  const othersAccounts = savedAccounts.filter(a => a.id !== (user?.id as number));

  async function addAccount() {
    if (!loginVal || !password) { setErr("Enter email / username and password."); return; }
    setLoading(true); setErr("");
    try {
      await login({ login: loginVal, password });
      setShowLogin(false); setLoginVal(""); setPassword("");
    } catch (e: any) {
      setErr(e?.response?.data?.message || e?.message || "Login failed.");
    } finally { setLoading(false); }
  }

  async function switchTo(acc: { id: number; token: string }) {
    onClose();
    await switchAccount(acc.id, acc.token);
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[360px] rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f5f5f5] px-5 py-4">
          <p className="text-[15px] font-extrabold text-[#111827]">{showLogin ? "Add Account" : "Switch Account"}</p>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f3f4f6]">✕</button>
        </div>

        {!showLogin ? (
          <div className="p-4 space-y-2">
            {/* Current account */}
            <div className="flex items-center gap-3 rounded-xl border-2 border-[#fd4605] bg-[#fff6f1] px-4 py-3">
              {avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatar} alt={currentUser} className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                : <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#fd4605] text-[13px] font-bold text-white">{initials}</div>}
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#111827]">{currentUser}</p>
                <p className="text-[11px] text-[#fd4605] font-semibold">Active</p>
              </div>
            </div>

            {/* Saved accounts */}
            {othersAccounts.map(acc => (
              <div key={acc.id} className="flex items-center gap-3 rounded-xl border border-[#f0f0f0] px-4 py-3 hover:border-[#e5e7eb]">
                {acc.avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={acc.avatar} alt={acc.name} className="h-9 w-9 rounded-full object-cover flex-shrink-0" />
                  : <div className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#6b7280] text-[13px] font-bold text-white">{acc.name[0]?.toUpperCase()}</div>}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-semibold text-[#111827]">{acc.name}</p>
                  <p className="text-[11px] text-[#9ca3af]">@{acc.username}</p>
                </div>
                <button onClick={() => switchTo(acc)} className="rounded-lg bg-[#f3f4f6] px-3 py-1 text-[11px] font-bold text-[#374151] hover:bg-[#e5e7eb]">Switch</button>
                <button onClick={() => removeAccountFromSaved(acc.id)} className="ml-1 grid h-6 w-6 place-items-center rounded-full text-[#9ca3af] hover:bg-[#fee2e2] hover:text-red-500" title="Remove">✕</button>
              </div>
            ))}

            {/* Add Account */}
            <button onClick={() => setShowLogin(true)}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-[#e5e7eb] py-3 text-[13px] font-semibold text-[#6b7280] transition hover:border-[#fd4605] hover:text-[#fd4605]">
              <Plus className="h-4 w-4" />
              Add Account
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            <input type="text" value={loginVal} onChange={e => { setLoginVal(e.target.value); setErr(""); }}
              placeholder="Email or username"
              className="w-full rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-[13px] outline-none focus:border-[#fd4605]" />
            <input type="password" value={password} onChange={e => { setPassword(e.target.value); setErr(""); }}
              placeholder="Password"
              className="w-full rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-[13px] outline-none focus:border-[#fd4605]"
              onKeyDown={e => e.key === "Enter" && addAccount()} />
            {err && <p className="text-[12px] text-red-500">{err}</p>}
            <button onClick={addAccount} disabled={loading}
              className="w-full rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e03e04] disabled:opacity-60">
              {loading ? "Signing in…" : "Sign In & Add"}
            </button>
            <button onClick={() => { setShowLogin(false); setErr(""); }}
              className="w-full rounded-xl border border-[#e5e7eb] py-2 text-[12px] font-semibold text-[#6b7280] hover:bg-[#f8f9fb]">
              Back
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOP BAR
═══════════════════════════════════════════════════════════════════════════ */
function StudioTopbar({
  userName,
  avatar,
  notificationCount,
  dateRange,
  onDateRangeChange,
  datePickerOpen,
  onDatePickerToggle,
}: {
  userName: string;
  avatar?: string | null;
  notificationCount: number;
  dateRange: { start: Date; end: Date };
  onDateRangeChange: (range: { start: Date; end: Date }) => void;
  datePickerOpen: boolean;
  onDatePickerToggle: (open: boolean) => void;
}) {
  const [searchQ,          setSearchQ]          = useState("");
  const [avatarMenuOpen,   setAvatarMenuOpen]   = useState(false);
  const [switcherOpen,     setSwitcherOpen]     = useState(false);
  const avatarRef = useRef<HTMLDivElement>(null);
  const datePickerRef = useRef<HTMLDivElement>(null);
  const router    = useRouter();
  const { logout } = useAuthStore();
  const initials  = (userName || "U")[0].toUpperCase();

  /* Close dropdown on outside click */
  useEffect(() => {
    if (!avatarMenuOpen && !datePickerOpen) return;
    const h = (e: MouseEvent) => {
      if (avatarRef.current && !avatarRef.current.contains(e.target as Node)) setAvatarMenuOpen(false);
      if (datePickerRef.current && !datePickerRef.current.contains(e.target as Node)) onDatePickerToggle(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [avatarMenuOpen, datePickerOpen, onDatePickerToggle]);

  return (
    <>
    <header className="flex h-16 flex-shrink-0 items-center gap-4 border-b border-[#f0f0f0] bg-white px-6">
      <h1 className="text-[20px] font-extrabold text-[#111827]">Teezer Studio</h1>

      {/* Search */}
      <div className="relative ml-4 flex-1 max-w-[420px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
        <input
          value={searchQ}
          onChange={e => setSearchQ(e.target.value)}
          placeholder="Search content, analytics, and more..."
          className="w-full rounded-full border border-[#e5e7eb] bg-[#f9fafb] py-2 pl-9 pr-4 text-[13px] text-[#111827] outline-none transition focus:border-[#fd4605] focus:bg-white"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Date range picker */}
        <DateRangePicker
          ref={datePickerRef}
          dateRange={dateRange}
          open={datePickerOpen}
          onToggle={onDatePickerToggle}
          onChange={onDateRangeChange}
        />

        {/* Notifications */}
        <button className="relative grid h-10 w-10 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
          <Bell className="h-5 w-5" />
          {notificationCount > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-[#fd4605] text-[9px] font-bold text-white">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>

        {/* User avatar + dropdown */}
        <div ref={avatarRef} className="relative">
          <button
            onClick={() => setAvatarMenuOpen(o => !o)}
            className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white pl-1 pr-3 py-1 transition hover:border-[#fd4605]"
          >
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt={userName} className="h-8 w-8 rounded-full object-cover" />
              : <div className="grid h-8 w-8 place-items-center rounded-full bg-[#fd4605] text-[13px] font-bold text-white">{initials}</div>}
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", avatarMenuOpen && "rotate-180")} />
          </button>

          {/* Dropdown menu */}
          {avatarMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-2 w-52 overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-xl">
              {/* User info header */}
              <div className="flex items-center gap-2.5 border-b border-[#f5f5f5] px-4 py-3">
                {avatar
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={avatar} alt={userName} className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                  : <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#fd4605] text-[13px] font-bold text-white">{initials}</div>}
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-bold text-[#111827]">{userName}</p>
                  <p className="text-[11px] text-[#9ca3af]">Creator</p>
                </div>
              </div>
              {/* Menu items */}
              <div className="py-1">
                <Link href="/profile/me"
                  onClick={() => setAvatarMenuOpen(false)}
                  className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[#374151] transition hover:bg-[#f8f9fb]">
                  <Users className="h-4 w-4 text-[#6b7280]" />
                  My Profile
                </Link>
                <button type="button"
                  onClick={() => { setAvatarMenuOpen(false); setSwitcherOpen(true); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-[#374151] transition hover:bg-[#f8f9fb]">
                  <UserPlus className="h-4 w-4 text-[#6b7280]" />
                  Switch Account
                </button>
                <div className="my-1 border-t border-[#f5f5f5]" />
                <button type="button"
                  onClick={() => { setAvatarMenuOpen(false); logout(); router.push("/"); }}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-red-500 transition hover:bg-[#fff5f5]">
                  <LogOut className="h-4 w-4" />
                  Log out
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>

    {/* Account Switcher Modal */}
    {switcherOpen && (
      <AccountSwitcherModal
        onClose={() => setSwitcherOpen(false)}
        currentUser={userName}
        avatar={avatar}
      />
    )}
  </>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   STAT CARD
═══════════════════════════════════════════════════════════════════════════ */
type StatCardProps = {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  growth: string;
  growthUp: boolean;
  sub: string;
  isActive?: boolean;
  loading?: boolean;
  onClick?: () => void;
};
function StatCard({ icon: Icon, iconBg, iconColor, label, value, growth, growthUp, sub, isActive, loading, onClick }: StatCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-1 items-center gap-4 rounded-2xl border bg-white px-5 py-4 transition",
        onClick && "cursor-pointer hover:shadow-sm",
        isActive ? "border-[#fd4605] ring-1 ring-[#fd4605]/20" : "border-[#f0f0f0]",
      )}>
      {/* Icon */}
      <div className={cn("grid h-[46px] w-[46px] flex-shrink-0 place-items-center rounded-[12px]", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      {/* Content */}
      {loading ? (
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="h-3 w-16 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-5 w-24 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-2.5 w-20 animate-pulse rounded bg-[#f3f4f6]" />
        </div>
      ) : (
        <div className="min-w-0">
          <p className="text-[12px] font-medium text-[#6b7280]">{label}</p>
          <div className="mt-0.5 flex items-center gap-1.5">
            <p className="text-[18px] font-extrabold leading-none text-[#111827]">{value}</p>
            <span className={cn("flex items-center gap-0.5 text-[11px] font-bold", growthUp ? "text-[#22c55e]" : "text-red-500")}>
              <span>{growthUp ? "↑" : "↓"}</span>
              <span>{growth}</span>
            </span>
          </div>
          <p className="mt-1 text-[11px] text-[#9ca3af]">{sub}</p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   SECONDARY STAT CARD (smaller, second row)
═══════════════════════════════════════════════════════════════════════════ */
type SecondaryStatCardProps = {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  growth?: { pct: number; up: boolean };
  sub: string;
  isActive?: boolean;
  loading?: boolean;
  onClick?: () => void;
};
function SecondaryStatCard({ icon: Icon, iconBg, iconColor, label, value, growth, sub, isActive, loading, onClick }: SecondaryStatCardProps) {
  const pct = growth?.pct ?? 0;
  const up  = growth?.up ?? true;
  const neutral = pct === 0;

  return (
    <div
      onClick={onClick}
      className={cn(
        "flex flex-1 flex-col rounded-2xl border bg-white px-4 py-3.5 transition",
        onClick && "cursor-pointer hover:shadow-sm",
        isActive ? "border-[#fd4605] ring-1 ring-[#fd4605]/20" : "border-[#f0f0f0]",
      )}
    >
      {loading ? (
        <div className="space-y-1.5">
          <div className="h-3 w-14 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-4 w-16 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-2.5 w-20 animate-pulse rounded bg-[#f3f4f6]" />
        </div>
      ) : (
        <>
          <div className="flex items-center gap-2 mb-2">
            <div className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-[10px]", iconBg)}>
              <Icon className={cn("h-4 w-4", iconColor)} />
            </div>
            <p className="text-[12px] font-medium text-[#6b7280]">{label}</p>
          </div>
          <p className="text-[17px] font-extrabold leading-none text-[#111827]">{value}</p>
          <div className="mt-1 flex items-center gap-1">
            {neutral ? (
              <span className="text-[11px] font-semibold text-[#9ca3af]">0 (--)</span>
            ) : (
              <span className={cn("flex items-center gap-0.5 text-[11px] font-bold", up ? "text-[#22c55e]" : "text-red-500")}>
                <span>{up ? "↑" : "↓"}</span>
                <span>{pct}%</span>
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[10px] text-[#9ca3af]">{sub}</p>
        </>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   QUICK ACTION BUTTON
═══════════════════════════════════════════════════════════════════════════ */
function QuickAction({ icon, iconBg, label, badge, href }: { icon: React.ReactNode; iconBg: string; label: string; badge?: number; href?: string }) {
  const C = href ? Link : "button";
  return (
    <C
      href={href as string}
      type={href ? undefined : "button"}
      className="flex flex-1 items-center gap-3 rounded-2xl border border-[#f0f0f0] bg-white px-4 py-4 text-[13px] font-semibold text-[#111827] transition hover:border-[#fd4605] hover:text-[#fd4605]"
    >
      <div className={cn("grid h-10 w-10 flex-shrink-0 place-items-center rounded-full", iconBg)}>
        {icon}
      </div>
      <span>{label}</span>
      {badge != null && badge > 0 && (
        <span className="ml-auto grid h-6 min-w-6 place-items-center rounded-full bg-[#fd4605] px-1.5 text-[11px] font-bold text-white">{badge}</span>
      )}
    </C>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   RECENT CONTENT ROW
═══════════════════════════════════════════════════════════════════════════ */
function ContentRow({ video }: { video: ReelsooVideo }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isVideo = video.media_type !== "image" && video.media_type !== "image_carousel";
  return (
    <div className="flex items-start gap-4 rounded-2xl border border-[#f0f0f0] bg-white p-4 transition hover:border-[#e5e7eb] hover:shadow-sm">
      {/* Thumbnail */}
      <div className="relative h-[72px] w-[128px] flex-shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6]">
        {video.thumbnail_url
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={video.thumbnail_url} alt={video.title ?? ""} className="h-full w-full object-cover" />
          : <div className="flex h-full w-full items-center justify-center"><Video className="h-7 w-7 text-[#d1d5db]" /></div>}
        {isVideo && video.duration && (
          <span className="absolute bottom-1 right-1 rounded-md bg-black/70 px-1 py-0.5 text-[9px] font-bold text-white">
            {fmtDuration(video.duration)}
          </span>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-bold text-[#111827]">{video.title || video.caption || "Untitled"}</p>
        <p className="mt-0.5 text-[11px] text-[#9ca3af]">
          {video.created_at ? new Date(video.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" }) : ""}
        </p>
        <div className="mt-2 flex items-center gap-3 text-[11px] text-[#6b7280]">
          <span className="flex items-center gap-1"><Play className="h-3 w-3" />{fmt(video.views_count)}</span>
          <span className="flex items-center gap-1"><Heart className="h-3 w-3" />{fmt(video.likes_count)}</span>
          <span className="flex items-center gap-1"><MessageCircle className="h-3 w-3" />{fmt(video.comments_count)}</span>
        </div>
      </div>

      {/* Menu */}
      <div className="relative flex-shrink-0">
        <button type="button" onClick={e => { e.stopPropagation(); setMenuOpen(o => !o); }}
          className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] transition hover:bg-[#f3f4f6] hover:text-[#111827]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && (
          <div className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
            {[
              { label: "View",   icon: <Eye className="h-3.5 w-3.5" />,  href: `/videos/${video.id}` },
              { label: "Edit",   icon: <Edit3 className="h-3.5 w-3.5" />, href: `/videos/${video.id}` },
            ].map(item => (
              <Link key={item.label} href={item.href}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#111827] transition hover:bg-[#f8f9fb]"
                onClick={() => setMenuOpen(false)}>
                <span className="text-[#6b7280]">{item.icon}</span>
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   CHART METRIC DROPDOWN
═══════════════════════════════════════════════════════════════════════════ */
const METRICS = ["Views", "Watch Time", "Followers", "Engagement", "Profile Views", "Likes", "Comments", "Shares", "Est. Rewards"] as const;
type Metric = typeof METRICS[number];

/* Map display label → API metric key */
const METRIC_MAP: Record<Metric, AnalyticsMetric> = {
  "Views":         "views",
  "Watch Time":    "watch_time",
  "Followers":     "followers",
  "Engagement":    "engagement_rate",
  "Profile Views": "profile_views",
  "Likes":         "likes",
  "Comments":      "comments",
  "Shares":        "shares",
  "Est. Rewards":  "estimated_rewards",
};

/* Icon + color per metric for the dropdown */
type MetricMeta = { icon: React.ElementType; color: string };
const METRIC_META: Record<Metric, MetricMeta> = {
  "Views":         { icon: Play,             color: "text-[#fd4605]"  },
  "Watch Time":    { icon: Eye,              color: "text-[#7c3aed]"  },
  "Followers":     { icon: Users,            color: "text-[#10b981]"  },
  "Engagement":    { icon: TrendingUp,       color: "text-[#f97316]"  },
  "Profile Views": { icon: User,             color: "text-[#2563eb]"  },
  "Likes":         { icon: Heart,            color: "text-[#ec4899]"  },
  "Comments":      { icon: MessageCircle,    color: "text-[#f97316]"  },
  "Shares":        { icon: Share2,           color: "text-[#0d9488]"  },
  "Est. Rewards":  { icon: CircleDollarSign, color: "text-[#16a34a]"  },
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/* ═══════════════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════════════ */
export function StudioPage() {
  const router = useRouter();
  const { user, isAuthenticated, authReady } = useAuthStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeMetric, setActiveMetric] = useState<Metric>("Views");
  const [metricDropOpen, setMetricDropOpen] = useState(false);
  const [notificationCount, setNotificationCount] = useState(0);
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 7 * 86400000),
    end: new Date()
  });
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  /* Websocket for real-time notifications */
  useEffect(() => {
    if (!isAuthenticated) return;
    const token = localStorage.getItem("reelsoo_token");
    if (!token) return;

    const socket: RealtimeSocket = new CentrifugoWebSocket(user?.id ?? 0);
    socket.on("notification:new", (data: any) => {
      setNotificationCount(c => c + 1);
    });
    return () => { socket.off("notification:new"); socket.disconnect(); };
  }, [isAuthenticated]);

  /* Auth guard */
  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  const username = user?.username ?? "";

  const profileQ = useQuery({
    queryKey:  ["studio-profile", username],
    queryFn:   () => userService.profile(username),
    enabled:   !!username,
    staleTime: 60_000,
  });

  const videosQ = useQuery({
    queryKey:  ["studio-videos", username],
    queryFn:   () => userService.videos(username, "latest"),
    enabled:   !!username,
    staleTime: 60_000,
  });

  /* Creator level rules:
     - admin / super_admin : no creator progression → hide entirely
     - creator (role==="creator" OR creatorStatus==="approved") : real level 1-10
     - normal user : level row hidden entirely
     Use profileQ (fresh API data) as the authoritative role source so a
     stale auth-store value never hides the level row for real creators. */
  const profileRole     = (profileQ.data as any)?.role ?? user?.role;
  const isAdminRole     = profileRole === "admin" || profileRole === "super_admin";
  const isActualCreator = !isAdminRole && (
    profileRole === "creator" ||
    user?.creatorStatus === "approved" ||
    user?.role === "creator"
  );

  /* Monetization card - reads the real overview endpoint. */

  const monetizationQ = useQuery({
    queryKey:  ["studio-monetization-overview"],
    queryFn:   () => studioService.monetizationOverview({ range: "28d" }),
    enabled:   isAuthenticated,
    staleTime: 60_000,
  });

  /* Studio analytics - re-fetches when active metric or date range changes */
  const analyticsQ = useQuery({
    queryKey:  ["studio-analytics", METRIC_MAP[activeMetric], dateRange.start.toISOString(), dateRange.end.toISOString()],
    queryFn:   () => studioService.analytics({
      metric: METRIC_MAP[activeMetric],
      start_date: dateRange.start.toISOString().split("T")[0],
      end_date: dateRange.end.toISOString().split("T")[0],
    }),
    enabled:   isAuthenticated,
    staleTime: 120_000,
    retry:     1,
  });
  const analytics      = analyticsQ.data;
  const analyticsLoading = analyticsQ.isLoading;

  const profile  = profileQ.data ?? user;
  const videos   = videosQ.data?.data ?? [];
  const recentVideos = videos.slice(0, 6);

  /* Chart: use real data from API, or empty array while loading */
  const chartData: ChartPoint[] = useMemo(() => {
    if (analytics?.chart?.length) {
      return analytics.chart.map(p => ({ label: p.label, value: p.value }));
    }
    return [];
  }, [analytics]);

  /* Fallback values (shown while query is in-flight or on error) */
  const fallbackViews    = videos.reduce((s, v) => s + (v.views_count ?? 0), 0);
  const fallbackFollowers = (profile as any)?.followers_count ?? 0;

  /* Real values from API or fallback */
  const totalViews    = (analytics?.summary?.views ?? undefined) !== undefined ? analytics!.summary.views : fallbackViews;
  const followerCount = (analytics?.summary?.followers ?? undefined) !== undefined ? analytics!.summary.followers : fallbackFollowers;
  const followingCount = (profile as any)?.following_count ?? 0;
  const draftCount    = videos.filter(v => v.status === "draft").length;

  /* Growth info */
  const g = analytics?.summary?.growth;
  const prevLabel = analytics?.previous_period
    ? `vs ${fmtDate(analytics.previous_period.start)} - ${fmtDate(analytics.previous_period.end)}`
    : "vs prev. period";

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      {/* Sidebar */}
      <StudioSidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(o => !o)}
        activeHref="/studio"
      />

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <StudioTopbar
          userName={profile?.name ?? username}
          avatar={(profile as any)?.avatar ?? null}
          notificationCount={notificationCount}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          datePickerOpen={datePickerOpen}
          onDatePickerToggle={setDatePickerOpen}
        />

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto max-w-[1400px] p-6">
            <div className="flex gap-6">

              {/* ── LEFT + CENTER ───────────────────────────────────── */}
              <div className="min-w-0 flex-1 space-y-5">

                {/* ── Profile Summary Card ─────────────────────────── */}
                <div className="rounded-2xl border border-[#eeeeee] bg-white px-7 py-6">
                  <div className="flex items-center gap-6">

                    {/* Avatar with pink ring + verified badge */}
                    <div className="relative flex-shrink-0">
                      {/* Outer pink ring */}
                      <div className="flex h-[88px] w-[88px] items-center justify-center rounded-full p-[3px]"
                        style={{ background: "linear-gradient(135deg,#fd4605,#ff6b8a)" }}>
                        <div className="h-full w-full overflow-hidden rounded-full bg-white p-[2px]">
                          <div className="h-full w-full overflow-hidden rounded-full">
                            {(profile as any)?.avatar
                              // eslint-disable-next-line @next/next/no-img-element
                              ? <img src={(profile as any).avatar} alt={profile?.name ?? username}
                                  className="h-full w-full object-cover" />
                              : <div className="flex h-full w-full items-center justify-center rounded-full bg-gradient-to-br from-[#fd4605] to-[#b83203] text-[28px] font-black text-white">
                                  {(profile?.name || username || "U")[0].toUpperCase()}
                                </div>}
                          </div>
                        </div>
                      </div>
                      {/* Blue verified badge - only for verified users */}
                      {(profile as any)?.is_verified && (
                        <div className="absolute bottom-0 right-0 grid h-[22px] w-[22px] place-items-center rounded-full border-2 border-white bg-[#1d9bf0]">
                          <svg viewBox="0 0 10 10" fill="none" className="h-[11px] w-[11px]">
                            <path d="M2 5l2 2 4-4" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>

                    {/* Name / username / level / XP */}
                    <div className="min-w-0 flex-shrink-0" style={{ minWidth: 220 }}>
                      {/* Name row */}
                      <div className="flex items-center gap-2">
                        <h2 className="text-[20px] font-extrabold leading-none text-[#111827]">
                          {profile?.name || username}
                        </h2>
                        {/* Inline verified badge - only for verified users */}
                        {(profile as any)?.is_verified && (
                          <svg viewBox="0 0 22 22" fill="none" className="h-[18px] w-[18px] flex-shrink-0" aria-label="Verified">
                            <path fill="#1d9bf0" d="M20.396 11c-.018-.646-.215-1.275-.57-1.816-.354-.54-.852-.972-1.438-1.246.223-.607.27-1.264.14-1.897-.131-.634-.437-1.218-.882-1.687-.47-.445-1.053-.75-1.687-.882-.633-.13-1.29-.083-1.897.14-.273-.587-.704-1.086-1.245-1.44S11.647 1.62 11 1.604c-.646.017-1.273.213-1.813.568s-.969.854-1.24 1.44c-.608-.223-1.267-.272-1.902-.14-.635.13-1.22.436-1.69.882-.445.47-.749 1.055-.878 1.688-.13.633-.08 1.29.144 1.896-.587.274-1.087.705-1.443 1.245-.356.54-.555 1.17-.574 1.817.02.647.218 1.276.574 1.817.356.54.856.972 1.443 1.245-.224.606-.274 1.263-.144 1.896.13.634.433 1.218.877 1.688.47.443 1.054.747 1.687.878.633.132 1.29.084 1.897-.136.274.586.705 1.084 1.246 1.439.54.354 1.17.551 1.816.569.647-.016 1.276-.213 1.817-.567s.972-.854 1.245-1.44c.604.239 1.266.296 1.903.164.636-.132 1.22-.447 1.68-.907.46-.46.776-1.044.908-1.681s.075-1.299-.165-1.903c.586-.274 1.084-.705 1.439-1.246.354-.54.551-1.17.569-1.816z"/>
                            <path fill="#fff" d="M9.662 14.85l-3.429-3.428 1.293-1.302 2.072 2.072 4.4-4.794 1.347 1.246z"/>
                          </svg>
                        )}
                      </div>

                      {/* Username + role badge */}
                      <div className="mt-1 flex items-center gap-2">
                        <span className="text-[13px] text-[#9ca3af]">@{username}</span>
                        {(user?.role === "admin" || user?.role === "super_admin") && (
                          <span className="rounded-full border border-[#e5e7eb] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">Admin</span>
                        )}
                        {user?.role === "creator" && (
                          <span className="rounded-full border border-[#fecdd3] bg-[#fff3ec] px-2 py-0.5 text-[11px] font-semibold text-[#fd4605]">Creator</span>
                        )}
                      </div>

                      {/* Followers count */}
                      <div className="mt-1 text-[12px] text-[#6b7280] font-medium">
                        {fmt(followerCount)} Followers
                      </div>
                    </div>

                    {/* Vertical divider */}
                    <div className="mx-2 h-[80px] w-px flex-shrink-0 bg-[#f0f0f0]" />

                    {/* Stats - each with divider between */}
                    <div className="flex flex-1 items-center justify-around">
                      {/* Days Active */}
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#fff0f2]">
                          <Flame className="h-5 w-5 text-[#fd4605]" />
                        </div>
                        <div>
                          <p className="text-[20px] font-extrabold leading-none text-[#111827]">
                            {daysActive((profile as any)?.created_at)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#9ca3af]">Days Active</p>
                        </div>
                      </div>

                      <div className="h-10 w-px flex-shrink-0 bg-[#f0f0f0]" />

                      {/* Total Views */}
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#f3f0ff]">
                          {/* Filled play circle */}
                          <svg viewBox="0 0 20 20" fill="none" className="h-5 w-5">
                            <circle cx="10" cy="10" r="10" fill="#8b5cf6"/>
                            <path d="M8 7l6 3-6 3V7z" fill="white"/>
                          </svg>
                        </div>
                        <div>
                          <p className="text-[20px] font-extrabold leading-none text-[#111827]">
                            {fmt(totalViews)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#9ca3af]">Total Views</p>
                        </div>
                      </div>

                      <div className="h-10 w-px flex-shrink-0 bg-[#f0f0f0]" />

                      {/* Total Followers */}
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-full bg-[#f0fdf4]">
                          <Users className="h-5 w-5 text-[#16a34a]" />
                        </div>
                        <div>
                          <p className="text-[20px] font-extrabold leading-none text-[#111827]">
                            {fmt(followerCount)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#9ca3af]">Total Followers</p>
                        </div>
                      </div>

                    </div>

                  </div>
                </div>

                {/* Stat Cards - clickable, drive graph metric */}
                <div className="flex gap-4">
                  <StatCard
                    icon={Play} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]"
                    label="Views"
                    value={fmt(totalViews)}
                    growth={`${g?.views?.pct ?? 0}%`}
                    growthUp={g?.views?.up ?? true}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Views"}
                    onClick={() => setActiveMetric("Views")}
                  />
                  <StatCard
                    icon={Eye} iconBg="bg-[#f3f0ff]" iconColor="text-[#7c3aed]"
                    label="Watch Time"
                    value={analytics?.summary?.watch_time_hours ? `${analytics.summary.watch_time_hours.toLocaleString()}h` : "0h"}
                    growth={`${g?.watch_time?.pct ?? 0}%`}
                    growthUp={g?.watch_time?.up ?? true}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Watch Time"}
                    onClick={() => setActiveMetric("Watch Time")}
                  />
                  <StatCard
                    icon={Users} iconBg="bg-[#ecfdf5]" iconColor="text-[#10b981]"
                    label="Followers"
                    value={fmt(followerCount)}
                    growth={`${g?.followers?.pct ?? 0}%`}
                    growthUp={g?.followers?.up ?? true}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Followers"}
                    onClick={() => setActiveMetric("Followers")}
                  />
                  <StatCard
                    icon={Heart} iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
                    label="Engagement Rate"
                    value={analytics?.summary?.engagement_rate !== undefined ? `${analytics.summary.engagement_rate}%` : "0%"}
                    growth={`${g?.engagement_rate?.pct ?? 0}%`}
                    growthUp={g?.engagement_rate?.up ?? true}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Engagement"}
                    onClick={() => setActiveMetric("Engagement")}
                  />
                </div>

                {/* ── Secondary Metric Cards ───────────────────────────── */}
                <div className="flex gap-3">
                  {/* Profile Views */}
                  <SecondaryStatCard
                    icon={Users} iconBg="bg-[#dbeafe]" iconColor="text-[#2563eb]"
                    label="Profile Views"
                    value={fmt(analytics?.summary?.profile_views ?? 0)}
                    growth={analytics?.summary?.growth?.profile_views}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Profile Views"}
                    onClick={() => setActiveMetric("Profile Views")}
                  />
                  {/* Likes */}
                  <SecondaryStatCard
                    icon={Heart} iconBg="bg-[#fce7f3]" iconColor="text-[#ec4899]"
                    label="Likes"
                    value={fmt(analytics?.summary?.likes ?? 0)}
                    growth={analytics?.summary?.growth?.likes}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Likes"}
                    onClick={() => setActiveMetric("Likes")}
                  />
                  {/* Comments */}
                  <SecondaryStatCard
                    icon={MessageCircle} iconBg="bg-[#ffedd5]" iconColor="text-[#f97316]"
                    label="Comments"
                    value={fmt(analytics?.summary?.comments ?? 0)}
                    growth={analytics?.summary?.growth?.comments}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Comments"}
                    onClick={() => setActiveMetric("Comments")}
                  />
                  {/* Shares */}
                  <SecondaryStatCard
                    icon={Share2} iconBg="bg-[#ccfbf1]" iconColor="text-[#0d9488]"
                    label="Shares"
                    value={fmt(analytics?.summary?.shares ?? 0)}
                    growth={analytics?.summary?.growth?.shares}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Shares"}
                    onClick={() => setActiveMetric("Shares")}
                  />
                  {/* Est. Rewards */}
                  <SecondaryStatCard
                    icon={CircleDollarSign} iconBg="bg-[#dcfce7]" iconColor="text-[#16a34a]"
                    label="Est. Rewards"
                    value={`$${(analytics?.summary?.estimated_rewards ?? 0).toFixed(2)}`}
                    growth={analytics?.summary?.growth?.estimated_rewards}
                    sub={prevLabel}
                    loading={analyticsLoading}
                    isActive={activeMetric === "Est. Rewards"}
                    onClick={() => setActiveMetric("Est. Rewards")}
                  />
                </div>

                {/* Performance Chart */}
                <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <h3 className="text-[15px] font-extrabold text-[#111827]">Performance Overview</h3>
                      <Info className="h-4 w-4 text-[#9ca3af]" />
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Refresh button */}
                      <button
                        onClick={() => analyticsQ.refetch()}
                        title="Refresh chart"
                        className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e7eb] text-[#6b7280] transition hover:border-[#fd4605] hover:text-[#fd4605]"
                      >
                        <RefreshCw className={cn("h-3.5 w-3.5", analyticsQ.isFetching && "animate-spin")} />
                      </button>

                      {/* Metric selector */}
                      <div className="relative">
                        <button
                          onClick={() => setMetricDropOpen(o => !o)}
                          className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] px-3 py-1.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fd4605]"
                        >
                          {(() => { const M = METRIC_META[activeMetric]; return <M.icon className={cn("h-3.5 w-3.5", M.color)} />; })()}
                          {activeMetric}
                          <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", metricDropOpen && "rotate-180")} />
                        </button>
                        {metricDropOpen && (
                          <div className="absolute right-0 top-full z-10 mt-1 w-48 overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
                            {METRICS.map(m => {
                              const M = METRIC_META[m];
                              return (
                                <button key={m} type="button"
                                  onClick={() => { setActiveMetric(m); setMetricDropOpen(false); }}
                                  className={cn("flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-left transition",
                                    m === activeMetric ? "bg-[#fff3ec] text-[#fd4605] font-semibold" : "text-[#374151] hover:bg-[#f8f9fb]")}>
                                  <M.icon className={cn("h-3.5 w-3.5 flex-shrink-0", m === activeMetric ? "text-[#fd4605]" : M.color)} />
                                  {m}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  {analyticsLoading ? (
                    <div className="flex h-[220px] items-center justify-center">
                      <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
                    </div>
                  ) : (
                    <StudioLineChart data={chartData} height={220} metricLabel={activeMetric} />
                  )}
                </div>

                {/* Quick Actions */}
                <div>
                  <h3 className="mb-3 text-[15px] font-extrabold text-[#111827]">Quick Actions</h3>
                  <div className="flex flex-wrap gap-3">
                    <QuickAction href="/upload" iconBg="bg-[#fff3ec]"
                      icon={<Upload className="h-5 w-5 text-[#fd4605]" />} label="Upload Video" />
                    <QuickAction href="#" iconBg="bg-[#fce7f3]"
                      icon={<Radio className="h-5 w-5 text-[#ec4899]" />} label="Go Live" />
                    <QuickAction href="/studio/content" iconBg="bg-[#ede9fe]"
                      icon={<Bookmark className="h-5 w-5 text-[#7c3aed]" />} label="Drafts" badge={draftCount} />
                    <QuickAction href="#" iconBg="bg-[#fff7ed]"
                      icon={<Zap className="h-5 w-5 text-[#f97316]" />} label="Promote" />
                    <QuickAction href="/studio/comments" iconBg="bg-[#fef9c3]"
                      icon={<MessageSquare className="h-5 w-5 text-[#ca8a04]" />} label="Comments" />
                  </div>
                </div>

                {/* Recent Content */}
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[15px] font-extrabold text-[#111827]">Recent Content</h3>
                    <Link href="/studio/content"
                      className="flex items-center gap-1 text-[13px] font-semibold text-[#fd4605] hover:underline">
                      See all <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                  {videosQ.isLoading ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <div key={i} className="h-[120px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
                      ))}
                    </div>
                  ) : recentVideos.length ? (
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {recentVideos.map(v => <ContentRow key={v.id} video={v} />)}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[#e5e7eb] py-12 text-center">
                      <Video className="mb-2 h-10 w-10 text-[#d1d5db]" />
                      <p className="text-[14px] font-semibold text-[#6b7280]">No content yet</p>
                      <p className="mt-1 text-[12px] text-[#9ca3af]">Upload your first video to get started.</p>
                      <Link href="/upload" className="mt-4 rounded-full bg-[#fd4605] px-5 py-2 text-[13px] font-bold text-white transition hover:bg-[#e03e04]">
                        Upload Now
                      </Link>
                    </div>
                  )}
                </div>
              </div>

              {/* ── RIGHT SIDEBAR ────────────────────────────────────── */}
              <div className="w-[300px] flex-shrink-0 space-y-4">

                {/* Monetization */}
                <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[14px] font-extrabold text-[#111827]">Monetization</h3>
                    {(
                      <Link href="/studio/monetization" className="text-[12px] font-semibold text-[#fd4605] hover:underline">
                        See all →
                      </Link>
                    )}
                  </div>

                    <>
                      <div className="space-y-3">
                        {[
                          {
                            icon: <Wallet className="h-4 w-4 text-[#22c55e]" />, bg: "bg-[#dcfce7]", label: "Wallet Balance",
                            value: money(monetizationQ.data?.payouts?.available_balance),
                          },
                          {
                            icon: <span className="text-[14px]">🪙</span>, bg: "bg-[#fef9c3]", label: "Gifts",
                            value: money(monetizationQ.data?.revenue_sources?.live_gift),
                          },
                          {
                            icon: <Users className="h-4 w-4 text-[#7c3aed]" />, bg: "bg-[#ede9fe]", label: "Subscriptions",
                            value: money(monetizationQ.data?.revenue_sources?.subscription),
                          },
                        ].map(({ icon, bg, label, value }) => (
                          <div key={label} className="flex items-center justify-between">
                            <div className="flex items-center gap-2.5">
                              <div className={cn("grid h-8 w-8 place-items-center rounded-full", bg)}>{icon}</div>
                              <span className="text-[13px] text-[#374151]">{label}</span>
                            </div>
                            {monetizationQ.isLoading
                              ? <div className="h-3.5 w-14 animate-pulse rounded bg-[#f0f0f0]" />
                              : <span className="text-[13px] font-bold text-[#111827]">{value}</span>}
                          </div>
                        ))}
                      </div>
                      <Link
                        href="/studio/wallets-coins"
                        className="mt-4 block w-full rounded-full bg-[#fd4605] py-2.5 text-center text-[13px] font-bold text-white transition hover:bg-[#e03e04]"
                      >
                        View earnings
                      </Link>
                    </>
                </div>

                {/* Verification */}
                <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5">
                  <h3 className="mb-3 text-[14px] font-extrabold text-[#111827]">Verification &amp; Status</h3>
                  <div className="flex items-center gap-3 rounded-xl bg-[#f8f9fb] p-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#fff3ec]">
                      {(profile as any)?.is_verified
                        ? <ShieldCheck className="h-5 w-5 text-[#fd4605]" />
                        : <Shield className="h-5 w-5 text-[#9ca3af]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-bold text-[#111827]">
                        {(profile as any)?.is_verified ? "Verified Creator" : "Not Verified"}
                      </p>
                      <p className="text-[11px] text-[#6b7280]">
                        {(profile as any)?.is_verified ? "You're verified and in good standing." : "Apply for verification."}
                      </p>
                    </div>
                    <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold",
                      (profile as any)?.is_verified ? "bg-[#dcfce7] text-[#16a34a]" : "bg-[#f3f4f6] text-[#6b7280]")}>
                      {(profile as any)?.is_verified ? "All good" : "Pending"}
                    </span>
                  </div>
                  <Link href="/studio/verification" className="mt-3 flex items-center justify-between text-[12px] font-semibold text-[#fd4605] hover:underline">
                    Learn more about verification <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </div>

                {/* Creator Tools */}
                <div className="rounded-2xl border border-[#f0f0f0] bg-white p-5">
                  <div className="mb-3 flex items-center justify-between">
                    <h3 className="text-[14px] font-extrabold text-[#111827]">Creator Tools</h3>
                    <Link href="/studio/tools" className="text-[12px] font-semibold text-[#fd4605] hover:underline">
                      See all →
                    </Link>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      { icon: <Users className="h-5 w-5 text-[#7c3aed]" />, bg: "bg-[#ede9fe]", label: "Audience" },
                      { icon: <Radio className="h-5 w-5 text-[#fd4605]" />, bg: "bg-[#fff3ec]", label: "Live Tools" },
                      { icon: <Music2 className="h-5 w-5 text-[#2563eb]" />, bg: "bg-[#dbeafe]", label: "Music Library" },
                      { icon: <Lightbulb className="h-5 w-5 text-[#f59e0b]" />, bg: "bg-[#fef3c7]", label: "Ideas Hub" },
                      { icon: <Settings className="h-5 w-5 text-[#6b7280]" />, bg: "bg-[#f3f4f6]", label: "Settings" },
                    ].map(({ icon, bg, label }) => (
                      <button key={label} type="button"
                        className="flex flex-col items-center gap-1.5 rounded-xl border border-[#f0f0f0] p-2.5 transition hover:border-[#fd4605]">
                        <div className={cn("grid h-10 w-10 place-items-center rounded-full", bg)}>{icon}</div>
                        <span className="text-[10px] font-semibold text-[#374151] text-center leading-tight">{label}</span>
                      </button>
                    ))}
                  </div>
                </div>

              </div>
              {/* ── /RIGHT SIDEBAR ───────────────────────────────────── */}

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
