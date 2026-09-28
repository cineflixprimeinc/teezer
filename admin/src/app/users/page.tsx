"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  Search, Filter, Download, Plus, Eye, MoreVertical,
  TrendingUp, TrendingDown, ChevronDown, ChevronLeft, ChevronRight,
  UserPlus, Upload, Layers, Shield, CheckCircle2, Clock,
  CalendarDays, UserCheck, UserX, AlertTriangle, Trash2,
  ShieldCheck, ShieldOff, Users, Minus, X, Globe,
  FileDown, Loader2,
} from "lucide-react";
import { adminService } from "@/services/admin.service";

const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live";

/* ── Types ───────────────────────────────────────────────────────────────── */
interface AdminUser {
  id: number;
  name: string;
  username: string;
  email: string;
  avatar: string | null;
  role: string;
  is_verified: boolean;
  is_banned: boolean;
  is_active: boolean;
  active_status?: boolean | string | number;
  followers_count?: number;
  videos_count?: number;
  reports_count?: number;
  verification_status?: "verified" | "pending" | "none";
  created_at: string;
  updated_at?: string;
  selected_country_code?: string;
}
interface UserStats {
  total: number; active: number; verified: number; banned: number;
  suspended: number; new_signups: number;
  growth: { total: number; active: number; verified: number; suspended: number; new_signups: number };
  top_countries?: { country: string; count: number; pct: number }[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
function fmt(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(2).replace(/\.?0+$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString("en-US");
}
function fmtDate(s: string) {
  return new Date(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function fmtShort(d: Date) {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function timeAgo(s: string) {
  const diff = Date.now() - new Date(s).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1)  return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7)  return `${d} day${d > 1 ? "s" : ""} ago`;
  if (d < 30) return `${Math.floor(d / 7)} wk ago`;
  return `${Math.floor(d / 30)} mo ago`;
}

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

const COUNTRY_FLAGS: Record<string, string> = {
  US:"🇺🇸",IN:"🇮🇳",BR:"🇧🇷",ID:"🇮🇩",PH:"🇵🇭",GB:"🇬🇧",DE:"🇩🇪",FR:"🇫🇷",
  JP:"🇯🇵",NG:"🇳🇬",MX:"🇲🇽",PK:"🇵🇰",NP:"🇳🇵",AU:"🇦🇺",CA:"🇨🇦",
};
const COUNTRY_NAMES: Record<string, string> = {
  US:"United States",IN:"India",BR:"Brazil",ID:"Indonesia",PH:"Philippines",
  GB:"United Kingdom",DE:"Germany",FR:"France",JP:"Japan",NG:"Nigeria",
  MX:"Mexico",PK:"Pakistan",NP:"Nepal",AU:"Australia",CA:"Canada",
};
const REASON_LABELS: Record<string, string> = {
  spam:            "Spam or misleading",
  harassment:      "Harassment or bullying",
  inappropriate:   "Inappropriate content",
  violence:        "Violence or harmful",
  hate:            "Hate speech",
  nudity:          "Nudity / sexual content",
  copyright:       "Copyright violation",
  misinformation:  "Misinformation",
  other:           "Other",
};
const FALLBACK_STATS: UserStats = {
  total:0, active:0, verified:0, banned:0, suspended:0, new_signups:0,
  growth:{total:0, active:0, verified:0, suspended:0, new_signups:0},
  top_countries:[],
};

/* ── Avatar ──────────────────────────────────────────────────────────────── */
const PALETTE = ["#3b82f6","#8b5cf6","#f59e0b","#10b981","#fe2c55","#06b6d4","#ec4899","#14b8a6","#f97316","#6366f1"];
function Avatar({ name, src, size = 40 }: { name: string; src: string | null; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = (name||"?").split(" ").map((w:string)=>w[0]).join("").slice(0,2).toUpperCase();
  const bg = PALETTE[(name||"?").charCodeAt(0) % PALETTE.length];
  if (src && !err)
    return <img src={src} alt={name} onError={()=>setErr(true)}
      className="rounded-full object-cover shrink-0" style={{width:size,height:size}}/>;
  return <div className="rounded-full flex items-center justify-center text-white font-bold shrink-0"
    style={{width:size,height:size,background:bg,fontSize:Math.max(Math.round(size*0.36),10)}}>{initials}</div>;
}

/* ── KPI Card ────────────────────────────────────────────────────────────── */
function KpiCard({ label, value, growth, icon, iconBg }: {
  label:string; value:string; growth:number; icon:React.ReactNode; iconBg:string;
}) {
  const up = growth >= 0;
  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-4 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3">
        <div className={`w-[52px] h-[52px] rounded-2xl flex items-center justify-center shrink-0 ${iconBg}`}>{icon}</div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-medium text-gray-400 mb-0.5">{label}</p>
          <p className="text-[18px] font-bold text-gray-900 leading-tight">{value}</p>
          <span className={`text-[11px] font-semibold flex items-center gap-0.5 mt-0.5 ${up?"text-emerald-500":"text-red-500"}`}>
            {up?<TrendingUp size={10}/>:<TrendingDown size={10}/>}{up?"+":""}{growth.toFixed(1)}%
          </span>
        </div>
      </div>
    </div>
  );
}

/* ── Badges ──────────────────────────────────────────────────────────────── */
function RoleBadge({ role }: { role: string }) {
  const map: Record<string,string> = {
    admin:  "bg-red-50 text-red-600 border-red-100",
    creator:"bg-blue-50 text-blue-600 border-blue-100",
    user:   "bg-gray-50 text-gray-500 border-gray-100",
  };
  return <span className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border capitalize ${map[role]||"bg-gray-50 text-gray-500 border-gray-100"}`}>
    {role.charAt(0).toUpperCase()+role.slice(1)}</span>;
}
function StatusBadge({ user }: { user: AdminUser }) {
  if (user.is_banned)   return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-red-500"><span className="w-2 h-2 rounded-full bg-red-500 shrink-0"/>Banned</span>;
  if (!user.is_active)  return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-orange-500"><span className="w-2 h-2 rounded-full bg-orange-400 shrink-0"/>Suspended</span>;
  return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0"/>Active</span>;
}
function VerifBadge({ user }: { user: AdminUser }) {
  const vs = user.verification_status ?? (user.is_verified ? "verified" : "none");
  if (vs==="verified") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-100"><CheckCircle2 size={11}/>Verified</span>;
  if (vs==="pending")  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold text-orange-500 bg-orange-50 border border-orange-100"><Clock size={11}/>Pending</span>;
  return <span className="inline-flex items-center gap-1 text-[11px] text-gray-400"><Minus size={11}/>None</span>;
}
function LastActive({ user }: { user: AdminUser }) {
  const isOnline = user.active_status===true||user.active_status==="online"||user.active_status===1;
  if (isOnline) return <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-600"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0"/>Online</span>;
  return <span className="text-[12px] text-gray-500">{timeAgo(user.updated_at||user.created_at)}</span>;
}

/* ── Full Calendar Date Range Picker ────────────────────────────────────── */
interface DateRange { start: Date | null; end: Date | null; }

const PRESETS = [
  { label: "Today",        getDates: () => { const d = new Date(); return { start: d, end: d }; } },
  { label: "Yesterday",    getDates: () => { const d = new Date(); d.setDate(d.getDate()-1); return { start:d, end:d }; } },
  { label: "Last 7 Days",  getDates: () => { const e=new Date(),s=new Date(); s.setDate(e.getDate()-6); return {start:s,end:e}; } },
  { label: "Last 30 Days", getDates: () => { const e=new Date(),s=new Date(); s.setDate(e.getDate()-29); return {start:s,end:e}; } },
  { label: "Last 90 Days", getDates: () => { const e=new Date(),s=new Date(); s.setDate(e.getDate()-89); return {start:s,end:e}; } },
  { label: "This Month",   getDates: () => { const n=new Date(); return {start:new Date(n.getFullYear(),n.getMonth(),1),end:new Date(n.getFullYear(),n.getMonth()+1,0)}; } },
  { label: "Last Month",   getDates: () => { const n=new Date(); return {start:new Date(n.getFullYear(),n.getMonth()-1,1),end:new Date(n.getFullYear(),n.getMonth(),0)}; } },
  { label: "This Year",    getDates: () => { const n=new Date(); return {start:new Date(n.getFullYear(),0,1),end:new Date(n.getFullYear(),11,31)}; } },
];

function isSameDay(a: Date, b: Date) {
  return a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function startOfDay(d: Date) { const c = new Date(d); c.setHours(0,0,0,0); return c; }

function CalendarMonth({
  year, month, range, hovering, onDay, onHover
}: {
  year: number; month: number;
  range: DateRange; hovering: Date | null;
  onDay: (d: Date) => void; onHover: (d: Date | null) => void;
}) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = startOfDay(new Date());

  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  function getState(d: Date) {
    const { start, end } = range;
    const effectiveEnd = end || hovering;
    const lo = start && effectiveEnd ? (start <= effectiveEnd ? start : effectiveEnd) : start;
    const hi = start && effectiveEnd ? (start <= effectiveEnd ? effectiveEnd : start) : effectiveEnd;
    const isStart = start && isSameDay(d, start);
    const isEnd   = end   && isSameDay(d, end);
    const inRange = lo && hi && d >= startOfDay(lo) && d <= startOfDay(hi);
    return { isStart, isEnd, inRange };
  }

  return (
    <div className="w-[224px]">
      <div className="grid grid-cols-7 mb-1">
        {DAYS.map(d => <div key={d} className="text-center text-[10px] font-semibold text-gray-400 py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`}/>;
          const { isStart, isEnd, inRange } = getState(d);
          const isToday = isSameDay(d, today);
          const selected = isStart || isEnd;
          return (
            <button key={i}
              onClick={() => onDay(d)}
              onMouseEnter={() => onHover(d)}
              onMouseLeave={() => onHover(null)}
              className={[
                "relative h-8 w-full text-[12px] font-medium transition-colors select-none",
                selected ? "z-10" : "",
                inRange && !selected ? "bg-blue-50 text-blue-700" : "",
                selected ? "bg-[#fe2c55] text-white rounded-lg" : "hover:bg-gray-100 rounded-lg text-gray-700",
                isToday && !selected ? "font-bold text-[#fe2c55]" : "",
              ].filter(Boolean).join(" ")}>
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FullCalendarPicker({ value, onChange }: {
  value: { start: Date; end: Date };
  onChange: (r: { start: Date; end: Date }) => void;
}) {
  const [open, setOpen] = useState(false);
  const [range, setRange] = useState<DateRange>({ start: value.start, end: value.end });
  const [hovering, setHovering] = useState<Date | null>(null);
  const [step, setStep] = useState<"start" | "end">("start");
  const now = new Date();
  const [leftMonth,  setLeftMonth]  = useState({ year: now.getFullYear(), month: now.getMonth() - 1 < 0 ? 11 : now.getMonth() - 1 });
  const [rightMonth, setRightMonth] = useState({ year: now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear(), month: now.getMonth() });
  const ref = useRef<HTMLDivElement>(null);

  // Sync right month to always be one ahead of left
  function setLeft(y: number, m: number) {
    setLeftMonth({ year: y, month: m });
    const next = m + 1 > 11 ? { year: y + 1, month: 0 } : { year: y, month: m + 1 };
    setRightMonth(next);
  }
  function prevMonth() {
    const m = leftMonth.month - 1;
    setLeft(m < 0 ? leftMonth.year - 1 : leftMonth.year, m < 0 ? 11 : m);
  }
  function nextMonth() {
    const m = rightMonth.month + 1;
    setRightMonth({ year: m > 11 ? rightMonth.year + 1 : rightMonth.year, month: m > 11 ? 0 : m });
    setLeftMonth({ year: rightMonth.year, month: rightMonth.month });
  }

  useEffect(() => {
    if (!open) return;
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [open]);

  function handleDay(d: Date) {
    if (step === "start") {
      setRange({ start: d, end: null });
      setStep("end");
    } else {
      const s = range.start!;
      const [lo, hi] = d >= s ? [s, d] : [d, s];
      setRange({ start: lo, end: hi });
      setStep("start");
    }
  }

  function applyPreset(preset: typeof PRESETS[0]) {
    const { start, end } = preset.getDates();
    const lo = startOfDay(start), hi = startOfDay(end);
    setRange({ start: lo, end: hi });
    setStep("start");
    // Navigate calendar to show the range
    setLeft(lo.getFullYear(), lo.getMonth());
  }

  function apply() {
    if (range.start && range.end) {
      onChange({ start: range.start, end: range.end });
      setOpen(false);
    }
  }

  function cancel() {
    setRange({ start: value.start, end: value.end });
    setStep("start");
    setOpen(false);
  }

  const displayStr = `${fmtShort(value.start)} – ${fmtShort(value.end)}`;
  const pendingStr = range.start && range.end
    ? `${fmtShort(range.start)} – ${fmtShort(range.end)}`
    : range.start ? `${fmtShort(range.start)} – select end date` : displayStr;

  return (
    <div className="relative" ref={ref}>
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 border border-gray-200 bg-white rounded-xl px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50 shadow-sm whitespace-nowrap">
        <CalendarDays size={13} className="text-gray-400"/>
        <span>{displayStr}</span>
        <ChevronDown size={11} className="text-gray-400"/>
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl flex overflow-hidden"
          style={{ minWidth: 580 }}>

          {/* Presets sidebar */}
          <div className="w-36 border-r border-gray-100 py-3 flex flex-col gap-0.5">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide px-3 mb-1">Quick Select</p>
            {PRESETS.map(p => {
              const { start: ps, end: pe } = p.getDates();
              const active = range.start && range.end
                && isSameDay(range.start, startOfDay(ps))
                && isSameDay(range.end,   startOfDay(pe));
              return (
                <button key={p.label} onClick={() => applyPreset(p)}
                  className={`text-left px-3 py-1.5 text-[12px] font-medium rounded-lg mx-1 transition-colors ${active ? "bg-[#fe2c55]/10 text-[#fe2c55]" : "text-gray-600 hover:bg-gray-50"}`}>
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Calendar area */}
          <div className="flex flex-col p-4">
            {/* Status bar */}
            <div className="flex items-center justify-between mb-3 px-1">
              <span className="text-[11px] text-gray-500">
                {step === "start" ? "Select start date" : "Now select end date"}
              </span>
              <span className="text-[11px] font-semibold text-gray-700">{pendingStr}</span>
            </div>

            {/* Month navigation */}
            <div className="flex items-center gap-4">
              <button onClick={prevMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronLeft size={15}/>
              </button>

              <div className="flex gap-6">
                {/* Left month */}
                <div>
                  <p className="text-[12px] font-bold text-gray-800 text-center mb-2">
                    {MONTHS[leftMonth.month]} {leftMonth.year}
                  </p>
                  <CalendarMonth year={leftMonth.year} month={leftMonth.month}
                    range={range} hovering={hovering} onDay={handleDay} onHover={setHovering}/>
                </div>

                <div className="w-px bg-gray-100 self-stretch"/>

                {/* Right month */}
                <div>
                  <p className="text-[12px] font-bold text-gray-800 text-center mb-2">
                    {MONTHS[rightMonth.month]} {rightMonth.year}
                  </p>
                  <CalendarMonth year={rightMonth.year} month={rightMonth.month}
                    range={range} hovering={hovering} onDay={handleDay} onHover={setHovering}/>
                </div>
              </div>

              <button onClick={nextMonth}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-500 transition-colors">
                <ChevronRight size={15}/>
              </button>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between mt-4 pt-3 border-t border-gray-100">
              <span className="text-[11px] text-gray-400">
                {range.start && range.end
                  ? `${Math.round((range.end.getTime() - range.start.getTime()) / 86400000) + 1} days selected`
                  : "Click to select dates"}
              </span>
              <div className="flex gap-2">
                <button onClick={cancel}
                  className="px-4 py-1.5 rounded-xl text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50">
                  Cancel
                </button>
                <button onClick={apply} disabled={!range.start || !range.end}
                  className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-[#fe2c55] text-white hover:bg-[#e02249] disabled:opacity-40 disabled:cursor-not-allowed transition-colors">
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Three-dot Menu (portal → escapes overflow:hidden, opens up when near bottom) */
const MENU_HEIGHT = 300; // approximate max height of the dropdown

function ActionMenu({ user, onAction }: { user: AdminUser; onAction: (a: string, u: AdminUser) => void }) {
  const [open,    setOpen]    = useState(false);
  const [style,   setStyle]   = useState<React.CSSProperties>({});
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const onOutside = (e: MouseEvent) => {
      if (
        menuRef.current && !menuRef.current.contains(e.target as Node) &&
        btnRef.current  && !btnRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    const onScroll = () => setOpen(false);
    document.addEventListener("mousedown", onOutside);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onOutside);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [open]);

  function toggle(e: React.MouseEvent) {
    e.stopPropagation();
    if (!open && btnRef.current) {
      const rect  = btnRef.current.getBoundingClientRect();
      const right = window.innerWidth - rect.right;
      const spaceBelow = window.innerHeight - rect.bottom;
      // If not enough space below, open upward
      if (spaceBelow < MENU_HEIGHT) {
        setStyle({ position: "fixed", bottom: window.innerHeight - rect.top + 4, right, zIndex: 9999 });
      } else {
        setStyle({ position: "fixed", top: rect.bottom + 4, right, zIndex: 9999 });
      }
    }
    setOpen(o => !o);
  }

  const act = (a: string) => { setOpen(false); onAction(a, user); };

  type MI = { id: string; label?: string; icon?: React.ReactNode; cls?: string };
  const items: MI[] = [
    { id:"view",   label:"View Profile (new tab)", icon:<Eye size={13}/>,              cls:"text-gray-700" },
    { id:"sep0" },
    user.is_verified
      ? { id:"unverify", label:"Remove Verification", icon:<ShieldOff size={13}/>,  cls:"text-gray-700" }
      : { id:"verify",   label:"Verify User",          icon:<ShieldCheck size={13}/>,cls:"text-blue-600" },
    (!user.is_active && !user.is_banned)
      ? { id:"unsuspend", label:"Lift Suspension", icon:<UserCheck size={13}/>,     cls:"text-emerald-600" }
      : { id:"suspend",   label:"Suspend User",    icon:<AlertTriangle size={13}/>, cls:"text-orange-500" },
    user.is_banned
      ? { id:"unban", label:"Unban User", icon:<UserCheck size={13}/>, cls:"text-emerald-600" }
      : { id:"ban",   label:"Ban User",   icon:<UserX size={13}/>,     cls:"text-red-500" },
    { id:"warn",   label:"Send Warning", icon:<AlertTriangle size={13}/>, cls:"text-amber-600" },
    { id:"sep1" },
    { id:"delete", label:"Delete User",  icon:<Trash2 size={13}/>,        cls:"text-red-600 font-semibold" },
  ];

  const dropdown = open && mounted ? createPortal(
    <div ref={menuRef} style={style}
      className="bg-white border border-gray-100 rounded-2xl shadow-2xl py-1.5 w-52"
      onClick={e => e.stopPropagation()}>
      {items.map((item, i) => {
        if (item.id.startsWith("sep")) return <div key={i} className="my-1 border-t border-gray-100"/>;
        return (
          <button key={item.id} onClick={e => { e.stopPropagation(); act(item.id); }}
            className={`w-full text-left px-4 py-2.5 text-xs flex items-center gap-2.5 hover:bg-gray-50 transition-colors ${item.cls}`}>
            {item.icon}{item.label}
          </button>
        );
      })}
    </div>,
    document.body
  ) : null;

  return (
    <>
      <button ref={btnRef} onClick={toggle}
        className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors">
        <MoreVertical size={16}/>
      </button>
      {dropdown}
    </>
  );
}

/* ── Confirm Modal ───────────────────────────────────────────────────────── */
function ConfirmModal({ open, title, message, confirmLabel, danger, loading, onCancel, onConfirm, children }: {
  open:boolean; title:string; message:string; confirmLabel:string;
  danger?:boolean; loading?:boolean; onCancel:()=>void; onConfirm:()=>void; children?:React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm">
        <h3 className="text-[15px] font-bold text-gray-900 mb-1">{title}</h3>
        <p className="text-xs text-gray-500 mb-3">{message}</p>
        {children}
        <div className="flex gap-2.5 mt-4 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-medium border border-gray-200 text-gray-700 hover:bg-gray-50">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${danger?"bg-red-500 hover:bg-red-600":"bg-[#fe2c55] hover:bg-[#e02249]"}`}>
            {loading ? "Loading…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Pagination ──────────────────────────────────────────────────────────── */
function Pager({ page, lastPage, total, perPage, onPage, onPerPage }: {
  page:number; lastPage:number; total:number; perPage:number;
  onPage:(p:number)=>void; onPerPage:(n:number)=>void;
}) {
  const start = Math.min((page-1)*perPage+1, total);
  const end   = Math.min(page*perPage, total);

  const pages: (number|"...")[] = [];
  if (lastPage <= 7) {
    for (let i = 1; i <= lastPage; i++) pages.push(i);
  } else if (page <= 4) {
    pages.push(1,2,3,4,5,"...",lastPage);
  } else if (page >= lastPage-3) {
    pages.push(1,"...",lastPage-4,lastPage-3,lastPage-2,lastPage-1,lastPage);
  } else {
    pages.push(1,"...",page-1,page,page+1,"...",lastPage);
  }

  return (
    <div className="flex items-center justify-between px-5 py-3.5 border-t border-gray-100 flex-wrap gap-3">
      <span className="text-xs text-gray-500">Showing {start.toLocaleString()} to {end.toLocaleString()} of {total.toLocaleString()} users</span>
      <div className="flex items-center gap-1.5">
        <button onClick={()=>onPage(page-1)} disabled={page<=1}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronLeft size={13}/>
        </button>
        {pages.map((p,i) => p==="..." ? (
          <span key={`e${i}`} className="text-xs text-gray-400 px-1">···</span>
        ) : (
          <button key={p} onClick={()=>onPage(p as number)}
            className={`w-7 h-7 text-xs font-medium rounded-lg transition-colors ${p===page?"bg-[#fe2c55] text-white":"border border-gray-200 text-gray-700 hover:bg-gray-50"}`}>
            {p}
          </button>
        ))}
        <button onClick={()=>onPage(page+1)} disabled={page>=lastPage}
          className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed">
          <ChevronRight size={13}/>
        </button>
        <div className="flex items-center gap-1.5 ml-3">
          <span className="text-xs text-gray-500 whitespace-nowrap">Rows per page</span>
          <div className="relative">
            <select value={perPage} onChange={e=>onPerPage(Number(e.target.value))}
              className="appearance-none border border-gray-200 rounded-lg pl-2.5 pr-6 py-1 text-xs text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-[#fe2c55] cursor-pointer">
              {[10,12,25,50,100].map(n=><option key={n} value={n}>{n}</option>)}
            </select>
            <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Tabs ────────────────────────────────────────────────────────────────── */
const TABS = [
  {label:"All Users",value:""},{label:"Active",value:"active"},
  {label:"Suspended",value:"suspended"},{label:"Banned",value:"banned"},
  {label:"Verified",value:"verified"},{label:"Reported",value:"reported"},
  {label:"Admin",value:"admin"},
];

/* ── Main Page ───────────────────────────────────────────────────────────── */
export default function UsersPage() {
  const router = useRouter();
  const qc     = useQueryClient();

  // Default date range: last 7 days
  const [dateRange, setDateRange] = useState(() => {
    const e = new Date(), s = new Date();
    s.setDate(e.getDate() - 6);
    return { start: startOfDay(s), end: startOfDay(e) };
  });

  const [tab,          setTab]          = useState("");
  const [page,         setPage]         = useState(1);
  const [perPage,      setPerPage]      = useState(12);
  const [searchInput,  setSearchInput]  = useState("");
  const [q,            setQ]            = useState("");
  const [role,         setRole]         = useState("");
  const [sort,         setSort]         = useState("newest");
  // advanced filters
  const [filterOpen,   setFilterOpen]   = useState(false);
  const [verifFilter,  setVerifFilter]  = useState("");   // ""|"verified"|"pending"|"unverified"
  const [countryFilter,setCountryFilter]= useState("");
  const [hasVideos,    setHasVideos]    = useState("");   // ""|"yes"|"no"
  const [exporting,    setExporting]    = useState(false);
  const [reason,       setReason]       = useState("");
  const [modal,        setModal]        = useState<{type:string;user:AdminUser|null}>({type:"",user:null});
  const closeModal = useCallback(()=>{setModal({type:"",user:null});setReason("");},[]);
  const filterRef = useRef<HTMLDivElement>(null);

  // Debounce search input → 400 ms
  useEffect(() => {
    const t = setTimeout(() => { setQ(searchInput); setPage(1); }, 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  // Close filter panel on outside click
  useEffect(() => {
    if (!filterOpen) return;
    const fn = (e: MouseEvent) => {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) setFilterOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [filterOpen]);

  const activeFilters = [verifFilter, countryFilter, hasVideos].filter(Boolean).length;
  function clearFilters() { setVerifFilter(""); setCountryFilter(""); setHasVideos(""); setPage(1); }

  const statsQ = useQuery({
    queryKey: ["admin-user-stats"],
    queryFn:  adminService.userStats,
    staleTime: 30_000, refetchInterval: 60_000,
  });
  const stats: UserStats = (statsQ.data as UserStats) ?? FALLBACK_STATS;

  const params: Record<string, string|number> = {
    page, per_page: perPage, sort,
    ...(q             && {q}),
    ...(role          && {role}),
    ...(tab           && {status: tab}),
    ...(verifFilter === "verified"   && {verified: 1}),
    ...(verifFilter === "unverified" && {verified: 0}),
    ...(verifFilter === "pending"    && {verif_status: "pending"}),
    ...(countryFilter  && {country: countryFilter}),
    ...(hasVideos === "yes" && {has_videos: 1}),
    ...(hasVideos === "no"  && {has_videos: 0}),
  };
  const usersQ = useQuery({
    queryKey: ["admin-users", params],
    queryFn:  () => adminService.users(params),
    placeholderData: (prev: unknown) => prev,
    staleTime: 15_000, refetchInterval: 30_000,
  });
  const users: AdminUser[] = (usersQ.data as any)?.data ?? [];
  const meta = (usersQ.data as any)?.meta ?? {current_page:1,last_page:1,total:0,per_page:perPage};

  // Real top creators by follower count
  const topCreatorsQ = useQuery({
    queryKey: ["admin-top-creators"],
    queryFn:  () => adminService.users({ role: "creator", sort: "followers", per_page: 5 }),
    staleTime: 60_000,
  });
  const topCreators: AdminUser[] = (topCreatorsQ.data as any)?.data ?? [];

  // Real report stats for sidebar
  const reportStatsQ = useQuery({
    queryKey: ["admin-report-stats-sidebar"],
    queryFn:  adminService.reportStats,
    staleTime: 60_000, refetchInterval: 120_000,
  });
  const rStats = reportStatsQ.data as any;
  const pendingReportCount: number = rStats?.pending_count ?? 0;
  const byReason: Record<string, number> = rStats?.by_reason ?? {};
  const topReasons = Object.entries(byReason)
    .sort(([,a],[,b]) => b - a)
    .slice(0, 5);

  // CSV Export
  async function handleExport() {
    setExporting(true);
    try {
      const total = meta.total || 100;
      const exportParams = { ...params, page: 1, per_page: Math.min(total, 5000) };
      const data = await adminService.users(exportParams);
      const rows: AdminUser[] = data.data ?? [];
      const headers = ["ID","Name","Username","Email","Role","Status","Verification","Followers","Videos","Country","Joined"];
      const escape = (v: unknown) => {
        const s = String(v ?? "");
        return s.includes(",") || s.includes('"') || s.includes("\n") ? `"${s.replace(/"/g,'""')}"` : s;
      };
      const csv = [
        headers.join(","),
        ...rows.map((u: AdminUser) => [
          u.id, escape(u.name), escape(`@${u.username}`), escape(u.email),
          u.role,
          u.is_banned ? "Banned" : !u.is_active ? "Suspended" : "Active",
          u.verification_status ?? (u.is_verified ? "verified" : "none"),
          u.followers_count ?? 0,
          u.videos_count ?? 0,
          u.selected_country_code ?? "",
          u.created_at ? new Date(u.created_at).toLocaleDateString() : "",
        ].join(","))
      ].join("\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href = url;
      a.download = `users-${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${rows.length} users`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  }

  function inv() {
    qc.invalidateQueries({queryKey:["admin-users"]});
    qc.invalidateQueries({queryKey:["admin-user-stats"]});
  }

  const banM    = useMutation({mutationFn:({id,r}:{id:number;r:string})=>adminService.banUser(id,r),    onSuccess:()=>{toast.success("User banned");          closeModal();inv();}});
  const unbanM  = useMutation({mutationFn:(id:number)=>adminService.unbanUser(id),                      onSuccess:()=>{toast.success("User unbanned");        inv();}});
  const suspM   = useMutation({mutationFn:({id,r}:{id:number;r:string})=>adminService.suspendUser(id,r),onSuccess:()=>{toast.success("User suspended");       closeModal();inv();}});
  const warnM   = useMutation({mutationFn:({id,r}:{id:number;r:string})=>adminService.warnUser(id,r),   onSuccess:()=>{toast.success("Warning sent");         closeModal();inv();}});
  const verifyM = useMutation({mutationFn:(id:number)=>adminService.verifyUser(id),                     onSuccess:()=>{toast.success("User verified");        inv();}});
  const unverM  = useMutation({mutationFn:(id:number)=>adminService.unverifyUser(id),                   onSuccess:()=>{toast.success("Verification removed"); inv();}});
  const delM    = useMutation({mutationFn:(id:number)=>adminService.deleteUser(id),                     onSuccess:()=>{toast.success("User deleted");         closeModal();inv();}});

  function handleAction(action: string, user: AdminUser) {
    switch (action) {
      case "view":      window.open(`${FRONTEND_URL}/profile/${user.username}`, "_blank"); break;
      case "ban":       setModal({type:"ban",user}); break;
      case "unban":     unbanM.mutate(user.id); break;
      case "suspend":   setModal({type:"suspend",user}); break;
      case "unsuspend": suspM.mutate({id:user.id,r:"Suspension lifted"}); break;
      case "verify":    verifyM.mutate(user.id); break;
      case "unverify":  unverM.mutate(user.id); break;
      case "warn":      setModal({type:"warn",user}); break;
      case "delete":    setModal({type:"delete",user}); break;
    }
  }

  const kpis = [
    {label:"Total Users",    value:fmt(stats.total),       growth:stats.growth.total,       iconBg:"bg-blue-50",   icon:<TotalUsersIcon/>},
    {label:"Active Users",   value:fmt(stats.active),      growth:stats.growth.active,      iconBg:"bg-green-50",  icon:<ActiveIcon/>},
    {label:"Verified Users", value:fmt(stats.verified),    growth:stats.growth.verified,    iconBg:"bg-purple-50", icon:<VerifiedIcon/>},
    {label:"Suspended Users",value:fmt(stats.suspended),   growth:stats.growth.suspended,   iconBg:"bg-orange-50", icon:<SuspendedIcon/>},
    {label:"New Signups",    value:fmt(stats.new_signups), growth:stats.growth.new_signups, iconBg:"bg-pink-50",   icon:<NewSignupIcon/>},
  ];


  return (
    <AdminShell title="Users">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Users</h1>
          <p className="text-xs text-gray-400 mt-0.5">Home › Users › User List</p>
        </div>
        <FullCalendarPicker value={dateRange} onChange={setDateRange}/>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3 mb-5">
        {kpis.map(c=><KpiCard key={c.label} {...c}/>)}
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-3">

          {/* Tabs + Toolbar */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm">
            <div className="flex overflow-x-auto scrollbar-hide px-4 pt-3 border-b border-gray-100">
              {TABS.map(t => (
                <button key={t.value} onClick={()=>{setTab(t.value);setPage(1);}}
                  className={`shrink-0 pb-3 mr-6 text-xs font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap ${tab===t.value?"border-[#fe2c55] text-[#fe2c55]":"border-transparent text-gray-400 hover:text-gray-600"}`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 items-center p-3">
              <div className="relative">
                <select value={role} onChange={e=>{setRole(e.target.value);setPage(1);}}
                  className="appearance-none border border-gray-200 rounded-xl pl-3 pr-7 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#fe2c55] cursor-pointer">
                  <option value="">All Roles</option>
                  <option value="user">User</option>
                  <option value="creator">Creator</option>
                  <option value="admin">Admin</option>
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
              </div>
              <div className="relative">
                <select value={sort} onChange={e=>setSort(e.target.value)}
                  className="appearance-none border border-gray-200 rounded-xl pl-3 pr-7 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#fe2c55] cursor-pointer">
                  <option value="newest">Newest First</option>
                  <option value="oldest">Oldest First</option>
                  <option value="followers">Most Followers</option>
                  <option value="videos">Most Videos</option>
                </select>
                <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
              </div>
              <div className="relative flex-1 min-w-[200px]">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                <input value={searchInput} onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search name, username, email…"
                  className="w-full border border-gray-200 rounded-xl pl-8 pr-3 py-2 text-xs text-gray-700 focus:outline-none focus:ring-1 focus:ring-[#fe2c55] placeholder:text-gray-400"/>
                {searchInput && (
                  <button onClick={() => setSearchInput("")}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                    <X size={12}/>
                  </button>
                )}
              </div>

              {/* Advanced Filter button + dropdown */}
              <div className="relative" ref={filterRef}>
                <button onClick={() => setFilterOpen(o => !o)}
                  className={`flex items-center gap-1.5 border rounded-xl px-3 py-2 text-xs font-medium transition-colors ${activeFilters > 0 ? "border-[#fe2c55] text-[#fe2c55] bg-red-50" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                  <Filter size={12}/>Filter
                  {activeFilters > 0 && (
                    <span className="w-4 h-4 rounded-full bg-[#fe2c55] text-white text-[10px] font-bold flex items-center justify-center">{activeFilters}</span>
                  )}
                </button>

                {filterOpen && (
                  <div className="absolute top-full left-0 mt-2 z-50 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 w-80">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-[13px] font-bold text-gray-900">Advanced Filters</p>
                      {activeFilters > 0 && (
                        <button onClick={clearFilters} className="text-[11px] text-red-500 hover:underline font-medium">Clear all</button>
                      )}
                    </div>

                    {/* Verification */}
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Verification Status</p>
                      <div className="flex flex-wrap gap-1.5">
                        {([["","All"],["verified","Verified"],["pending","Pending"],["unverified","Unverified"]] as [string,string][]).map(([v,l]) => (
                          <button key={v} onClick={() => setVerifFilter(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${verifFilter === v ? "bg-[#fe2c55] text-white border-[#fe2c55]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Content */}
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Content</p>
                      <div className="flex flex-wrap gap-1.5">
                        {([["","Any"],["yes","Has Videos"],["no","No Videos"]] as [string,string][]).map(([v,l]) => (
                          <button key={v} onClick={() => setHasVideos(v)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${hasVideos === v ? "bg-[#fe2c55] text-white border-[#fe2c55]" : "border-gray-200 text-gray-600 hover:bg-gray-50"}`}>
                            {l}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Country */}
                    <div className="mb-4">
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wide mb-2">Country</p>
                      <div className="relative">
                        <Globe size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
                        <select value={countryFilter} onChange={e => setCountryFilter(e.target.value)}
                          className="w-full appearance-none border border-gray-200 rounded-xl pl-8 pr-7 py-2 text-xs text-gray-600 bg-white focus:outline-none focus:ring-1 focus:ring-[#fe2c55]">
                          <option value="">All Countries</option>
                          {Object.entries(COUNTRY_NAMES).map(([code, name]) => (
                            <option key={code} value={code}>{COUNTRY_FLAGS[code]} {name}</option>
                          ))}
                        </select>
                        <ChevronDown size={10} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"/>
                      </div>
                    </div>

                    <button onClick={() => { setPage(1); setFilterOpen(false); }}
                      className="w-full py-2 bg-[#fe2c55] text-white rounded-xl text-xs font-semibold hover:bg-[#e02249] transition-colors">
                      Apply Filters
                    </button>
                  </div>
                )}
              </div>

              {/* Export CSV */}
              <button onClick={handleExport} disabled={exporting}
                className="flex items-center gap-1.5 border border-gray-200 rounded-xl px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors">
                {exporting ? <Loader2 size={12} className="animate-spin"/> : <FileDown size={12}/>}
                {exporting ? "Exporting…" : "Export"}
              </button>
              <button onClick={()=>router.push("/users/new")}
                className="flex items-center gap-1.5 bg-[#fe2c55] hover:bg-[#e02249] text-white rounded-xl px-4 py-2 text-xs font-semibold transition-colors">
                <Plus size={13}/>Add User
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px]">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50/60">
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide">User</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24">Role</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28">Status</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28">Verification</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-24 cursor-pointer hover:text-gray-600 select-none" onClick={()=>setSort("followers")}>
                      Followers {sort==="followers"&&"↓"}
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-16">Videos</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20">Reports</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28 cursor-pointer hover:text-gray-600 select-none" onClick={()=>setSort(sort==="newest"?"oldest":"newest")}>
                      Joined {(sort==="newest"||sort==="oldest")?(sort==="newest"?"↓":"↑"):""}
                    </th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-28">Last Active</th>
                    <th className="text-left px-4 py-3 text-[11px] font-semibold text-gray-400 uppercase tracking-wide w-20">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {usersQ.isLoading ? (
                    Array.from({length:Math.min(perPage,8)}).map((_,i)=>(
                      <tr key={i}>
                        {Array(10).fill(0).map((__,j)=>(
                          <td key={j} className="px-4 py-4">
                            <div className="h-3.5 bg-gray-100 animate-pulse rounded-full" style={{width:j===0?"140px":"60px"}}/>
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : users.length === 0 ? (
                    <tr><td colSpan={10} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-2">
                        <Users size={32} className="text-gray-200"/>
                        <p className="text-sm text-gray-400">No users match your filters.</p>
                      </div>
                    </td></tr>
                  ) : users.map((u: AdminUser) => {
                    const isVerified = u.verification_status === "verified" || (u.verification_status === undefined && u.is_verified);
                    return (
                      <tr key={u.id}
                        className="hover:bg-blue-50/20 cursor-pointer transition-colors"
                        onClick={()=>router.push(`/users/${u.id}`)}>
                        <td className="px-4 py-3.5" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-3">
                            {/* Avatar with verified ring */}
                            <div className="relative shrink-0">
                              <Avatar name={u.name} src={u.avatar} size={44}/>
                              {isVerified && (
                                <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white flex items-center justify-center shadow-sm">
                                  <CheckCircle2 size={14} className="text-blue-500" fill="#3b82f6" color="white"/>
                                </div>
                              )}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-[13px] font-semibold text-gray-900 leading-tight truncate max-w-[130px]">{u.name}</p>
                                {isVerified && (
                                  <CheckCircle2 size={13} className="text-blue-500 shrink-0" fill="#3b82f6" color="white"/>
                                )}
                              </div>
                              <p className="text-[11px] text-gray-400 truncate">@{u.username}</p>
                              <p className="text-[10px] text-gray-300 truncate">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><RoleBadge role={u.role}/></td>
                        <td className="px-4 py-3.5"><StatusBadge user={u}/></td>
                        <td className="px-4 py-3.5"><VerifBadge user={u}/></td>
                        <td className="px-4 py-3.5 text-[13px] font-semibold text-gray-800">{fmt(u.followers_count??0)}</td>
                        <td className="px-4 py-3.5 text-[13px] text-gray-700">{(u.videos_count??0).toLocaleString()}</td>
                        <td className="px-4 py-3.5">
                          {(u.reports_count??0)>0
                            ?<span className="text-[13px] font-bold text-red-500">{u.reports_count}</span>
                            :<span className="text-[13px] text-gray-400">0</span>}
                        </td>
                        <td className="px-4 py-3.5 text-[12px] text-gray-600 whitespace-nowrap">{fmtDate(u.created_at)}</td>
                        <td className="px-4 py-3.5"><LastActive user={u}/></td>
                        <td className="px-4 py-3.5" onClick={e=>e.stopPropagation()}>
                          <div className="flex items-center gap-0.5">
                            <button onClick={()=>router.push(`/users/${u.id}`)}
                              className="w-8 h-8 flex items-center justify-center rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                              title="View User 360 Profile">
                              <Eye size={15}/>
                            </button>
                            <ActionMenu user={u} onAction={handleAction}/>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <Pager page={meta.current_page} lastPage={meta.last_page} total={meta.total}
              perPage={perPage} onPage={setPage} onPerPage={n=>{setPerPage(n);setPage(1);}}/>
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="w-[260px] shrink-0 space-y-4">
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-7 h-7 rounded-xl bg-blue-50 flex items-center justify-center">
                <Users size={14} className="text-blue-500"/>
              </div>
              <h3 className="text-[13px] font-bold text-gray-900">User Insights</h3>
            </div>

            {/* Top Countries */}
            <div className="mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-bold text-gray-700">Top Countries</p>
                <button className="text-[11px] text-[#fe2c55] font-medium hover:underline">View all</button>
              </div>
              <div className="space-y-2">
                {(stats.top_countries??FALLBACK_STATS.top_countries!).map(c=>(
                  <div key={c.country} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[18px] leading-none">{COUNTRY_FLAGS[c.country]??"🌍"}</span>
                      <span className="text-[12px] text-gray-700">{COUNTRY_NAMES[c.country]??c.country}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-gray-900">{c.pct}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Top Creators by Followers */}
            <div className="border-t border-gray-100 pt-3.5 mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-bold text-gray-700">Top Creators</p>
                <button onClick={()=>{setRole("creator");setSort("followers");setPage(1);setTab("");}}
                  className="text-[11px] text-[#fe2c55] font-medium hover:underline">View all</button>
              </div>
              <div className="space-y-2.5">
                {topCreatorsQ.isLoading ? (
                  Array.from({length:3}).map((_,i)=>(
                    <div key={i} className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-gray-100 animate-pulse shrink-0"/>
                      <div className="flex-1 h-3 bg-gray-100 animate-pulse rounded-full"/>
                    </div>
                  ))
                ) : topCreators.length > 0 ? topCreators.map((u:AdminUser)=>(
                  <div key={u.id} className="flex items-center justify-between group cursor-pointer"
                    onClick={()=>window.open(`${FRONTEND_URL}/profile/${u.username}`,"_blank")}>
                    <div className="flex items-center gap-2">
                      <div className="relative shrink-0">
                        <Avatar name={u.name} src={u.avatar} size={28}/>
                        {(u.verification_status==="verified"||u.is_verified) && (
                          <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center">
                            <CheckCircle2 size={10} className="text-blue-500" fill="#3b82f6" color="white"/>
                          </div>
                        )}
                      </div>
                      <span className="text-[12px] text-gray-600 truncate max-w-[90px] group-hover:text-[#fe2c55] transition-colors">@{u.username}</span>
                    </div>
                    <span className="text-[12px] font-semibold text-gray-900">{fmt(u.followers_count??0)}</span>
                  </div>
                )) : <p className="text-[11px] text-gray-400 italic">No creators yet</p>}
              </div>
            </div>

            {/* Pending Reports - real data */}
            <div className="border-t border-gray-100 pt-3.5">
              <div className="flex items-center justify-between mb-2.5">
                <p className="text-[11px] font-bold text-gray-700">Pending Reports</p>
                {pendingReportCount > 0 && (
                  <span className="text-[10px] font-bold text-white bg-red-500 rounded-full px-2 py-0.5">
                    {pendingReportCount}
                  </span>
                )}
              </div>
              {reportStatsQ.isLoading ? (
                <div className="space-y-1.5">
                  {Array.from({length:4}).map((_,i)=>(
                    <div key={i} className="h-3 bg-gray-100 animate-pulse rounded-full" style={{width:`${70+i*5}%`}}/>
                  ))}
                </div>
              ) : topReasons.length > 0 ? (
                <div className="space-y-1.5">
                  {topReasons.map(([key, count])=>{
                    const total = topReasons.reduce((s,[,c])=>s+c,0);
                    const pct   = total > 0 ? Math.round(count/total*100) : 0;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="text-[11px] text-gray-600 truncate max-w-[170px]">{REASON_LABELS[key]??key}</span>
                          <span className="text-[11px] font-semibold text-gray-800 ml-1">{count}</span>
                        </div>
                        <div className="h-1 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-[#fe2c55] rounded-full transition-all" style={{width:`${pct}%`}}/>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : <p className="text-[11px] text-gray-400 italic">No reports found</p>}
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-7 h-7 rounded-xl bg-amber-50 flex items-center justify-center">
                <ZapIcon size={14} className="text-amber-500"/>
              </div>
              <h3 className="text-[13px] font-bold text-gray-900">Quick Actions</h3>
            </div>
            <div className="space-y-1">
              {[
                {label:"Add New User",icon:<UserPlus size={14} className="text-[#fe2c55]"/>,bg:"bg-red-50",    fn:()=>router.push("/users/new")},
                {label:"Import Users",icon:<Upload size={14} className="text-blue-500"/>,   bg:"bg-blue-50",   fn:()=>{}},
                {label:"Bulk Actions",icon:<Layers size={14} className="text-purple-500"/>, bg:"bg-purple-50", fn:()=>{}},
                {label:"User Roles",  icon:<Shield size={14} className="text-emerald-500"/>,bg:"bg-emerald-50",fn:()=>router.push("/roles")},
              ].map(item=>(
                <button key={item.label} onClick={item.fn}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-gray-50 transition-colors text-left">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${item.bg}`}>{item.icon}</div>
                  <span className="text-[12px] font-medium text-gray-700">{item.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      <ConfirmModal open={modal.type==="ban"} title={`Ban ${modal.user?.name}?`}
        message="User will be banned immediately and all sessions invalidated."
        confirmLabel="Ban User" danger loading={banM.isPending}
        onCancel={closeModal} onConfirm={()=>modal.user&&banM.mutate({id:modal.user.id,r:reason||"Banned by admin"})}>
        <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Ban reason (optional)…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-red-400 mt-1"/>
      </ConfirmModal>
      <ConfirmModal open={modal.type==="suspend"} title={`Suspend ${modal.user?.name}?`}
        message="User account will be suspended and signed out."
        confirmLabel="Suspend" loading={suspM.isPending}
        onCancel={closeModal} onConfirm={()=>modal.user&&suspM.mutate({id:modal.user.id,r:reason||"Suspended by admin"})}>
        <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Suspension reason (optional)…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-orange-400 mt-1"/>
      </ConfirmModal>
      <ConfirmModal open={modal.type==="warn"} title={`Warn ${modal.user?.name}?`}
        message="A warning notification will be sent to this user."
        confirmLabel="Send Warning" loading={warnM.isPending}
        onCancel={closeModal} onConfirm={()=>modal.user&&warnM.mutate({id:modal.user.id,r:reason||"Warning from admin"})}>
        <input value={reason} onChange={e=>setReason(e.target.value)} placeholder="Warning message…"
          className="w-full border border-gray-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-1 focus:ring-amber-400 mt-1"/>
      </ConfirmModal>
      <ConfirmModal open={modal.type==="delete"} title={`Delete ${modal.user?.name}?`}
        message="This is permanent. All user data, videos, and content will be deleted."
        confirmLabel="Delete Forever" danger loading={delM.isPending}
        onCancel={closeModal} onConfirm={()=>modal.user&&delM.mutate(modal.user.id)}/>
    </AdminShell>
  );
}

/* ── SVG Icons ───────────────────────────────────────────────────────────── */
function ZapIcon({size=14,className=""}:{size?:number;className?:string}) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" className={className}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>;
}
function TotalUsersIcon() {
  return <svg width={28} height={28} viewBox="0 0 28 28" fill="none"><circle cx="10" cy="9" r="4.5" fill="#3b82f6" opacity="0.85"/><ellipse cx="10" cy="19.5" rx="7" ry="4" fill="#3b82f6" opacity="0.45"/><circle cx="19.5" cy="9.5" r="3.5" fill="#3b82f6" opacity="0.6"/><ellipse cx="21" cy="19" rx="5" ry="3.5" fill="#3b82f6" opacity="0.3"/></svg>;
}
function ActiveIcon() {
  return <svg width={28} height={28} viewBox="0 0 28 28" fill="none"><rect x="3" y="17" width="4" height="8" rx="1.5" fill="#22c55e" opacity="0.4"/><rect x="9" y="13" width="4" height="12" rx="1.5" fill="#22c55e" opacity="0.65"/><rect x="15" y="8" width="4" height="17" rx="1.5" fill="#22c55e" opacity="0.8"/><rect x="21" y="5" width="4" height="20" rx="1.5" fill="#22c55e"/></svg>;
}
function VerifiedIcon() {
  return <svg width={28} height={28} viewBox="0 0 28 28" fill="none"><path d="M14 3l2.8 4.8 5.4.5-3.6 4 1.6 5.8L14 15.2 7.8 18l1.6-5.8-3.6-4 5.4-.5z" fill="#8b5cf6" opacity="0.7"/><path d="M10 14l2.5 2.5 5-5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;
}
function SuspendedIcon() {
  return <svg width={28} height={28} viewBox="0 0 28 28" fill="none"><circle cx="14" cy="10" r="5" fill="#f97316" opacity="0.75"/><ellipse cx="14" cy="21" rx="8" ry="4.5" fill="#f97316" opacity="0.45"/><rect x="10" y="9.5" width="8" height="2" rx="1" fill="white"/></svg>;
}
function NewSignupIcon() {
  return <svg width={28} height={28} viewBox="0 0 28 28" fill="none"><circle cx="12" cy="10" r="4.5" fill="#ec4899" opacity="0.75"/><ellipse cx="12" cy="20.5" rx="6.5" ry="3.5" fill="#ec4899" opacity="0.45"/><path d="M21 14.5v6M18 17.5h6" stroke="#ec4899" strokeWidth="2.2" strokeLinecap="round"/></svg>;
}
