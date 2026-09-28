"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Bell, Calendar, Check, ChevronDown, ChevronLeft, Loader2,
  LogOut, Plus, Search, User, UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/services/api";

/* ── Types ──────────────────────────────────────────────────────────────── */
export type DateRange = { start: Date; end: Date };
type SavedAccount = { id: number; name: string; username: string; avatar: string|null; token: string; lastUsed: number };

export interface StudioTopbarProps {
  title?: string;
  subtitle?: string;
  showBack?: boolean;
  onBack?: () => void;
  dateRange: DateRange;
  onDateRangeChange: (r: DateRange) => void;
  onClearDateFilter?: () => void;
  isDateFilterActive?: boolean;
  searchPlaceholder?: string;
  externalNotifCount?: number;
}

/* ── Shared date range picker ───────────────────────────────────────────── */
export function StudioDateRangePicker({ dateRange, open, onToggle, onChange, onClearFilter, isAllTime }: {
  dateRange: DateRange; open: boolean;
  onToggle: (v: boolean) => void; onChange: (r: DateRange) => void;
  onClearFilter?: () => void;
  isAllTime?: boolean;
}) {
  const [cs, setCs] = useState(""); const [ce, setCe] = useState(""); const [err, setErr] = useState("");
  const fmtBtn = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const PRESETS = [
    { label: "Last 7 days",  days: 7  },
    { label: "Last 30 days", days: 30 },
    { label: "Last 90 days", days: 90 },
  ];

  return (
    <div className="relative">
      <button type="button" onClick={() => onToggle(!open)}
        className="flex items-center gap-2 rounded-lg border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-medium text-[#374151] transition hover:border-[#fe2c55]">
        <Calendar className="h-3.5 w-3.5 text-[#9ca3af]" />
        <span>
          {isAllTime ? "All time" : `${fmtBtn(dateRange.start)} - ${dateRange.end.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})}`}
        </span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[200] mt-2 w-[280px] rounded-2xl border border-[#f0f0f0] bg-white p-4 shadow-xl">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Quick select</p>
          <div className={cn("grid gap-2 mb-3", onClearFilter ? "grid-cols-2" : "grid-cols-3")}>
            {onClearFilter && (
              <button type="button"
                onClick={() => { onClearFilter(); onToggle(false); setErr(""); }}
                className={cn("rounded-lg border py-1.5 text-[11px] font-semibold transition hover:border-[#fe2c55] hover:bg-[#fff5f5]",
                  isAllTime ? "border-[#fe2c55] bg-[#fff0f4] text-[#fe2c55]" : "border-[#e5e7eb] text-[#374151]")}>
                All time
              </button>
            )}
            {PRESETS.map(p => (
              <button key={p.days} type="button"
                onClick={() => {
                  const end = new Date(); end.setHours(23,59,59,999);
                  const start = new Date(Date.now()-(p.days-1)*86400000); start.setHours(0,0,0,0);
                  onChange({start,end}); onToggle(false); setErr("");
                }}
                className="rounded-lg border border-[#e5e7eb] py-1.5 text-[11px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:bg-[#fff5f5]">
                {p.label}
              </button>
            ))}
          </div>
          <div className="border-t border-[#f0f0f0] pt-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Custom range</p>
            <div className="grid grid-cols-2 gap-2">
              <div><label className="mb-0.5 block text-[10px] text-[#6b7280]">Start</label>
                <input type="date" value={cs} max={new Date().toISOString().split("T")[0]}
                  onChange={e => { setCs(e.target.value); setErr(""); }}
                  className="w-full rounded-lg border border-[#e5e7eb] px-2 py-1.5 text-[12px] outline-none focus:border-[#fe2c55]" /></div>
              <div><label className="mb-0.5 block text-[10px] text-[#6b7280]">End</label>
                <input type="date" value={ce} max={new Date().toISOString().split("T")[0]}
                  onChange={e => { setCe(e.target.value); setErr(""); }}
                  className="w-full rounded-lg border border-[#e5e7eb] px-2 py-1.5 text-[12px] outline-none focus:border-[#fe2c55]" /></div>
            </div>
            {err && <p className="mt-1 text-[11px] text-red-500">{err}</p>}
            <button type="button"
              onClick={() => {
                if (!cs||!ce){setErr("Select both dates.");return;}
                const s2=new Date(cs),e2=new Date(ce);
                if (s2>e2){setErr("Start must be before end.");return;}
                if (e2>new Date()){setErr("No future dates.");return;}
                if ((e2.getTime()-s2.getTime())/86400000>92){setErr("Max 3 months.");return;}
                onChange({start:s2,end:e2}); onToggle(false); setErr("");
              }}
              className="mt-2 w-full rounded-lg bg-[#fe2c55] py-2 text-[12px] font-bold text-white hover:bg-[#e0243d]">
              Apply Range
            </button>
            <p className="mt-1 text-center text-[10px] text-[#9ca3af]">Max 3 months · No future dates</p>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Main shared topbar ─────────────────────────────────────────────────── */
export function StudioTopbarShared({
  title, subtitle, showBack, onBack,
  dateRange, onDateRangeChange, onClearDateFilter, isDateFilterActive = true,
  searchPlaceholder = "Search content, analytics, and more...",
  externalNotifCount,
}: StudioTopbarProps) {
  const router  = useRouter();
  const { user, login, logout, savedAccounts, switchAccount, addAccountToSaved, removeAccountFromSaved } = useAuthStore();

  const [dateOpen,      setDateOpen]      = useState(false);
  const [avatarOpen,    setAvatarOpen]    = useState(false);
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [notifCount,    setNotifCount]    = useState(0);
  const [showAddForm,   setShowAddForm]   = useState(false);
  const [addLogin,      setAddLogin]      = useState("");
  const [addPassword,   setAddPassword]   = useState("");
  const [addLoading,    setAddLoading]    = useState(false);
  const [addError,      setAddError]      = useState("");

  const dateRef   = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);
  const notifRef  = useRef<HTMLDivElement>(null);

  /* Poll unread notification count */
  useEffect(() => {
    if (externalNotifCount !== undefined) { setNotifCount(externalNotifCount); return; }
    let cancelled = false;
    const refresh = async () => {
      try {
        const { data } = await api.get("/notifications/unread-count");
        if (!cancelled) setNotifCount(data.data?.count ?? 0);
      } catch { /* silent */ }
    };
    refresh();
    const iv = setInterval(refresh, 30_000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [externalNotifCount]);

  /* Ensure current user is in saved accounts when avatar opens */
  useEffect(() => {
    if (!avatarOpen || !user) return;
    const token = typeof window !== "undefined" ? window.localStorage.getItem("reelsoo_token") : null;
    if (token) {
      addAccountToSaved({ id: user.id as number, name: user.name ?? "", username: user.username ?? "", avatar: (user as any).avatar ?? null, token, lastUsed: Date.now() });
    }
    setShowAddForm(false); setAddLogin(""); setAddPassword(""); setAddError("");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avatarOpen, user]);

  /* Outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!dateRef.current?.contains(e.target as Node))   setDateOpen(false);
      if (!avatarRef.current?.contains(e.target as Node)) { setAvatarOpen(false); setShowAddForm(false); }
      if (!notifRef.current?.contains(e.target as Node))  setNotifOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* Escape key */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setDateOpen(false); setAvatarOpen(false); setNotifOpen(false); }
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, []);

  const initials = (user?.name || user?.username || "U")[0].toUpperCase();
  const otherAccounts = (savedAccounts as SavedAccount[]).filter(a => a.id !== (user?.id as number));

  async function handleAddAccount() {
    if (!addLogin || !addPassword) { setAddError("Enter email / username and password."); return; }
    setAddLoading(true); setAddError("");
    try {
      await login({ login: addLogin, password: addPassword });
      setShowAddForm(false); setAddLogin(""); setAddPassword("");
    } catch (e: any) {
      setAddError(e?.response?.data?.message || e?.message || "Login failed.");
    } finally { setAddLoading(false); }
  }

  return (
    <header className="flex flex-shrink-0 items-center gap-4 border-b border-[#f0f0f0] bg-white px-6 py-3">
      {/* Back button + title */}
      <div className="flex items-center gap-3 flex-shrink-0">
        {showBack && (
          <button type="button"
            onClick={onBack ?? (() => router.back())}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full border border-[#e5e7eb] text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        {(title || subtitle) && (
          <div>
            {title   && <h1 className="text-[18px] font-extrabold leading-tight text-[#111827]">{title}</h1>}
            {subtitle && <p className="text-[11px] text-[#9ca3af]">{subtitle}</p>}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative flex-1 max-w-[440px]">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
        <input placeholder={searchPlaceholder}
          className="w-full rounded-full border border-[#e5e7eb] bg-[#f9fafb] py-2 pl-9 pr-4 text-[13px] text-[#111827] outline-none transition focus:border-[#fe2c55] focus:bg-white" />
      </div>

      <div className="ml-auto flex items-center gap-3">
        {/* Date range */}
        <div ref={dateRef}>
          <StudioDateRangePicker
            dateRange={dateRange} open={dateOpen}
            onToggle={setDateOpen} onChange={r => { onDateRangeChange(r); setDateOpen(false); }}
            onClearFilter={onClearDateFilter}
            isAllTime={!!onClearDateFilter && !isDateFilterActive} />
        </div>

        {/* Bell */}
        <div ref={notifRef} className="relative">
          <button type="button" onClick={() => setNotifOpen(o => !o)}
            className="relative grid h-9 w-9 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
            <Bell className="h-[18px] w-[18px]" />
            {(externalNotifCount ?? notifCount) > 0 && (
              <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#fe2c55] px-1 text-[9px] font-bold text-white">
                {(externalNotifCount ?? notifCount) > 9 ? "9+" : (externalNotifCount ?? notifCount)}
              </span>
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-full z-[200] mt-2 w-[300px] overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-xl">
              <div className="flex items-center justify-between border-b border-[#f5f5f5] px-4 py-3">
                <p className="text-[14px] font-bold text-[#111827]">Notifications</p>
                {(externalNotifCount ?? notifCount) > 0 && (
                  <span className="rounded-full bg-[#fee2e2] px-2 py-0.5 text-[11px] font-bold text-red-500">{externalNotifCount ?? notifCount} new</span>
                )}
              </div>
              <div className="flex flex-col items-center justify-center py-10 text-center">
                <Bell className="mb-2 h-8 w-8 text-[#d1d5db]" />
                <p className="text-[13px] font-semibold text-[#374151]">No new notifications</p>
                <p className="mt-1 text-[12px] text-[#9ca3af]">You're all caught up!</p>
              </div>
              <div className="border-t border-[#f0f0f0] px-4 py-3">
                <Link href="/notifications" onClick={() => setNotifOpen(false)}
                  className="text-[13px] font-semibold text-[#fe2c55] hover:underline">
                  View all notifications
                </Link>
              </div>
            </div>
          )}
        </div>

        {/* Avatar dropdown */}
        <div ref={avatarRef} className="relative">
          <button type="button" onClick={() => setAvatarOpen(o => !o)}
            className="flex items-center gap-1.5 rounded-full border border-[#e5e7eb] bg-white pl-1 pr-3 py-1 transition hover:border-[#fe2c55]">
            {(user as any)?.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={(user as any).avatar} alt={user?.name ?? ""} className="h-8 w-8 rounded-full object-cover" />
              : <div className="grid h-8 w-8 place-items-center rounded-full bg-[#fe2c55] text-[13px] font-bold text-white">{initials}</div>}
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", avatarOpen && "rotate-180")} />
          </button>

          {avatarOpen && (
            <div className="absolute right-0 top-full z-[200] mt-2 w-[250px] overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white shadow-xl">
              {showAddForm ? (
                /* ── Add Account form ── */
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <button type="button" onClick={() => { setShowAddForm(false); setAddError(""); }}
                      className="grid h-7 w-7 place-items-center rounded-full text-[#5f6675] hover:bg-[#f3f4f6]">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    <p className="text-[13px] font-bold text-[#111827]">Add Account</p>
                  </div>
                  <input type="text" value={addLogin} onChange={e => { setAddLogin(e.target.value); setAddError(""); }}
                    placeholder="Email or username"
                    className="mb-2 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
                  <input type="password" value={addPassword} onChange={e => { setAddPassword(e.target.value); setAddError(""); }}
                    placeholder="Password" onKeyDown={e => e.key === "Enter" && handleAddAccount()}
                    className="mb-2 w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
                  {addError && <p className="mb-2 text-[12px] text-red-500">{addError}</p>}
                  <button onClick={handleAddAccount} disabled={addLoading}
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#fe2c55] py-2 text-[13px] font-bold text-white hover:bg-[#e0243d] disabled:opacity-60">
                    {addLoading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {addLoading ? "Signing in…" : "Sign In & Save"}
                  </button>
                </div>
              ) : (
                <>
                  {/* Current account */}
                  <div className="flex items-center gap-2.5 border-b border-[#f5f5f5] px-4 py-3">
                    {(user as any)?.avatar
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={(user as any).avatar} alt="" className="h-8 w-8 rounded-full object-cover flex-shrink-0" />
                      : <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#fe2c55] text-[13px] font-bold text-white">{initials}</div>}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13px] font-bold text-[#111827]">{user?.name}</p>
                      <p className="truncate text-[11px] text-[#9ca3af]">@{user?.username}</p>
                    </div>
                    <span className="rounded-full bg-[#dcfce7] px-2 py-0.5 text-[10px] font-bold text-[#16a34a]">Active</span>
                  </div>

                  {/* Saved other accounts */}
                  {otherAccounts.map(acc => (
                    <div key={acc.id} className="flex items-center gap-2 px-3 py-2 hover:bg-[#f8f9fb]">
                      {acc.avatar
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={acc.avatar} alt={acc.name} className="h-7 w-7 flex-shrink-0 rounded-full object-cover" />
                        : <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#6b7280] text-[11px] font-bold text-white">{acc.name[0]?.toUpperCase()}</div>}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-semibold text-[#111827]">{acc.name}</p>
                        <p className="truncate text-[10px] text-[#9ca3af]">@{acc.username}</p>
                      </div>
                      <button onClick={() => { void switchAccount(acc.id, acc.token); setAvatarOpen(false); }}
                        className="rounded-lg bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-bold text-[#374151] hover:bg-[#e5e7eb]">
                        Switch
                      </button>
                      <button onClick={() => removeAccountFromSaved(acc.id)}
                        className="ml-0.5 grid h-5 w-5 place-items-center rounded-full text-[#9ca3af] hover:bg-[#fee2e2] hover:text-red-500">✕</button>
                    </div>
                  ))}

                  <div className="border-t border-[#f5f5f5] py-1">
                    <Link href={`/profile/${user?.username}`} onClick={() => setAvatarOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
                      <User className="h-4 w-4 text-[#6b7280]" /> My Profile
                    </Link>
                    <button type="button" onClick={() => setShowAddForm(true)}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
                      <UserPlus className="h-4 w-4 text-[#6b7280]" /> Add Account
                    </button>
                    <div className="my-1 border-t border-[#f5f5f5]" />
                    <button type="button" onClick={() => { setAvatarOpen(false); void logout(); router.push("/"); }}
                      className="flex w-full items-center gap-3 px-4 py-2.5 text-[13px] text-red-500 hover:bg-[#fff5f5]">
                      <LogOut className="h-4 w-4" /> Log out
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
