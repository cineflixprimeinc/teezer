"use client";

import { use, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, BadgeCheck, CheckCircle2, Edit2, ExternalLink, FileText, Globe,
  Lock, MapPin, MessageSquare, ShieldAlert, ShieldOff,
  ShieldCheck, Star, Trash2, UserCheck, UserX, AlertTriangle,
  Calendar, Eye, Video, Activity, ChevronDown, Plus, X, Save,
  TrendingUp, TrendingDown, Pause, Flag, Smartphone,
  DollarSign, BarChart2, Heart, Zap, Cpu,
  MoreVertical, Ticket, Pencil, Info, Camera, Search, RotateCcw,
  MessageCircle, ChevronLeft, ChevronRight, XCircle, Mail,
  Receipt, Download, Wallet, Clock, Loader2,
  Megaphone, Play,
  Copy, Ban, CreditCard, Filter, ArrowUpRight, Gift,
  Send, RefreshCw,
} from "lucide-react";
import { api, apiMessage } from "@/admin-panel/services/api";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import MessagesTab from "@/admin-panel/components/messages-tab";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatCompact, formatDate, timeAgo } from "@/admin-panel/lib/utils";
import { VerificationReview } from "@/admin-panel/components/verification/verification-review";

const ApexChart = dynamic(() => import("react-apexcharts"), { ssr: false });

/* ── Static option lists (mirrors user account settings) ───────────────────── */
const ALL_INTERESTS = [
  "Creator", "Photography", "Music", "Travel", "Dance", "Lifestyle", "Food",
  "Fashion", "Beauty", "Fitness", "Sports", "Gaming", "Education", "Technology",
  "Business", "Motivation", "News", "Entertainment", "Vlog", "Art",
  "Animals & Pets", "Nature", "Cars & Bikes", "Health", "DIY & Crafts", "Reviews",
  "Tutorials", "Religious / Spiritual", "Other",
];
const PROFILE_CATEGORIES = [
  "Creator", "Vlogger", "Blogger", "Podcaster", "Streamer", "Influencer",
  "Music", "Singer", "Musician", "Dance", "Choreography", "Comedy", "Acting",
  "Drama", "Memes", "Movies", "Animation", "Voice Over",
  "Photography", "Videography", "Cinematography", "Art", "Painting",
  "Illustration", "Design", "Graphic Design", "Animation Artist",
  "Lifestyle", "Fashion", "Beauty", "Makeup", "Skincare", "Hair", "Nails",
  "Streetwear", "Modeling",
  "Food", "Cooking", "Baking", "Recipes", "Restaurant Reviews", "Street Food",
  "Travel", "Adventure", "Backpacking", "Camping", "Road Trips", "Outdoors",
  "Hiking", "Mountaineering",
  "Fitness", "Gym", "Yoga", "Football", "Basketball", "Cricket",
  "Martial Arts", "Boxing", "Running", "Cycling", "Skating",
  "Gaming", "Esports", "Streamer (Gaming)", "Game Reviews",
  "Technology", "AI & ML", "Coding", "Web Development", "Mobile Apps", "Gadgets",
  "Cybersecurity", "Web3", "Crypto", "Science", "Astronomy",
  "Education", "Teacher", "Tutoring", "Languages", "Books", "Writing",
  "Poetry", "History",
  "Business", "Entrepreneurship", "Startup", "Marketing", "Finance",
  "Investing", "Stock Market", "Real Estate",
  "Health", "Mental Health", "Meditation", "Wellness", "Nutrition",
  "Cars", "Bikes", "Motorsports", "Auto Reviews",
  "Animals & Pets", "Pet Care", "Dog Training", "Wildlife", "Nature",
  "Environment", "Gardening",
  "DIY & Crafts", "Home Improvement", "Woodworking", "Crochet",
  "Reviews", "Tutorials", "How-To", "Tips & Tricks",
  "Religious / Spiritual", "Astrology",
  "News", "Politics", "Current Affairs",
  "Charity", "Activism", "Other",
];

/* ── Types ─────────────────────────────────────────────────────────────────── */
type TabKey = "overview"|"content"|"messages"|"comments"|"analytics"|"security"|"monetization"|"finance"|"ads"|"verification"|"reports"|"audit";

type U360 = {
  id: number; name: string; username: string; email: string; phone: string|null;
  bio: string|null; avatar: string|null; role: string;
  is_verified: boolean; is_active: boolean; is_banned: boolean; is_private: boolean;
  ban_reason: string|null; date_of_birth: string|null; gender: string|null;
  language: string|null; categories: string[]; interests: string[];
  country: string|null; selected_country_code: string|null; selected_country_name: string|null;
  email_verified_at: string|null; created_at: string; last_active_at: string|null;
  last_login_at: string|null; is_online: boolean; computed_status: 'online'|'offline';
  total_active_days: number;
  videos_count: number; followers_count: number; following_count: number;
  profile: { total_followers: number; total_following: number; total_likes: number; total_videos: number; profile_views: number; location: string|null; creator_badge: string|null }|null;
  wallet: { balance: string; coins_balance: number; gift_earnings: string; subscription_earnings: string; ad_earnings: string; total_withdrawn: string }|null;
  creator_level: { level_number: number; level_name: string; current_xp: number; total_xp: number; max_xp: number|null }|null;
  verification: { status: string; category: string }|null;
  devices: { id: number; device_type: string; device_id: string; last_seen: string }[];
  content_summary: { total_videos: number; published_videos: number; draft_videos: number; private_videos: number; total_views: number; total_likes: number; total_comments: number; avg_views: number; watch_time_mins: number };
  quick_stats: Record<string, { total: number; pct: number; spark: number[] }>;
  reports_received: number; user_reports: number; reports_open: number; content_removed: number; policy_violations: number; open_appeals: number;
  risk_score: number; risk_label: string;
  account_health: number; health_label: string;
  health_checks: { profile_completeness: boolean; email_verified: boolean; phone_verified: boolean; no_policy_violations: boolean };
  profile_completeness: { avatar: boolean; bio: boolean; email_ok: boolean; phone_ok: boolean; complete: number };
  default_upload_limit: number;
  blocked_count: number;
  hidden_words_count: number;
  data_download_requests_count: number;
  deletion_requests_count: number;
  moderation_settings: {
    restrict_uploads: boolean; post_approval_required: boolean; block_live_access: boolean;
    disable_drafts: boolean; disable_commenting: boolean;
    disable_commenting_on_others: boolean; disable_following_others: boolean;
    daily_upload_limit: number|null;
    nsfw_review_required: boolean; copyright_hold: boolean; upload_suspension_until: string|null;
    shadowban: boolean; temporary_suspension: boolean; temporary_suspension_until: string|null; warning_level: number;
    content_review_mode: string; comment_moderation: string; message_monitoring: boolean;
    strike_count: number; last_warning_at: string|null; last_strike_at: string|null;
    last_appeal_at: string|null; appeal_status: string|null;
    // Safety preferences
    allow_dm: string; allow_mentions: string; content_filter: string;
    sensitive_filter: boolean; activity_visibility: string;
  };
  permission_settings: { live_permission: boolean; duet_permission: boolean; download_permission: boolean; collaboration_permission: boolean; messaging_permission: string; access_level: string };
  admin_notes: { id: number; note: string; created_at: string; admin: { id: number; name: string } }[];
  timeline: { id: number; action: string; description: string; severity: string; created_at: string; reference: string; admin: { id: number; name: string }|null }[];
};

/* ── Atoms ──────────────────────────────────────────────────────────────────── */
function Toggle({ value, onChange, disabled }: { value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" disabled={disabled} onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors
        ${value ? "bg-[#fe2c55]" : "bg-[#d1d5db]"} ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}>
      <span className={`pointer-events-none h-4 w-4 rounded-full bg-white shadow-md transition-transform ${value ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#f3f4f6] last:border-0">
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-medium text-[#111827] leading-tight">{label}</p>
        {sub && <p className="text-[11px] text-[#9ca3af] mt-0.5">{sub}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function SectionCard({ title, number, children, action }: { title: string; number: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-3.5">
        <h3 className="text-[13px] font-bold text-[#111827]">
          <span className="text-[#fe2c55] mr-1.5">{number}.</span>{title}
        </h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

function Btn({ children, variant = "outline", size = "sm", disabled, onClick, className = "" }: {
  children: React.ReactNode; variant?: "outline"|"primary"|"success"|"warning"|"danger"|"ghost";
  size?: "sm"|"md"; disabled?: boolean; onClick?: () => void; className?: string;
}) {
  const base = "inline-flex items-center gap-1.5 font-semibold rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sz   = size === "sm" ? "px-3 py-1.5 text-[12px]" : "px-4 py-2 text-[13px]";
  const cls: Record<string,string> = {
    outline:  "border border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]",
    primary:  "bg-[#fe2c55] text-white hover:bg-[#e02249]",
    success:  "bg-emerald-500 text-white hover:bg-emerald-600",
    warning:  "bg-amber-500 text-white hover:bg-amber-600",
    danger:   "bg-red-500 text-white hover:bg-red-600",
    ghost:    "text-[#6b7280] hover:bg-[#f4f5f7]",
  };
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${sz} ${cls[variant]} ${className}`}>
      {children}
    </button>
  );
}

function Modal({ open, title, message, confirmLabel, danger, loading, onCancel, onConfirm, children }: {
  open: boolean; title: string; message: string; confirmLabel: string;
  danger?: boolean; loading?: boolean; onCancel: () => void; onConfirm: () => void; children?: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onCancel}/>
      <div className="relative bg-white rounded-2xl shadow-2xl p-6 w-full max-w-sm z-10">
        <h3 className="text-[15px] font-bold text-[#111827] mb-1">{title}</h3>
        <p className="text-xs text-[#9ca3af] mb-3">{message}</p>
        {children}
        <div className="flex gap-2.5 mt-4 justify-end">
          <button onClick={onCancel} className="px-4 py-2 rounded-xl text-xs font-medium border border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]">Cancel</button>
          <button onClick={onConfirm} disabled={loading}
            className={`px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50 ${danger ? "bg-red-500 hover:bg-red-600" : "bg-[#fe2c55] hover:bg-[#e02249]"}`}>
            {loading ? "Loading…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── ApexCharts sparkline ──────────────────────────────────────────────────── */
function Sparkline({ data, color }: { data: number[]; color: string }) {
  /* No series means no chart. This used to fall back to mockSpark(), which
     draws a plausible-looking invented line - indistinguishable from real
     activity, on a page whose whole job is to report what an account actually
     did. An explicit "no data" mark is the honest render. */
  if (!data || data.length < 3 || data.every(n => n === 0)) {
    return (
      <div className="flex h-[38px] w-20 items-center justify-center" title="No activity in this period">
        <span className="h-px w-10 bg-[#e8eaed]"/>
      </div>
    );
  }

  const safe = data;
  return (
    <ApexChart type="area" series={[{ data: safe }]} width={80} height={38}
      options={{
        chart: { sparkline: { enabled: true }, animations: { enabled: false } },
        stroke: { curve: "smooth", width: 1.5 },
        fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.35, opacityTo: 0, stops: [0, 100] } },
        colors: [color],
        tooltip: { enabled: false },
      }} />
  );
}

/* ── Tag picker (categories / interests) ──────────────────────────────────── */
function AdminTagPicker({
  selected, onChange, options, max, noun = "tag",
}: { selected: string[]; onChange: (v: string[]) => void; options: string[]; max: number; noun?: string }) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");

  const available = options.filter(t => !selected.includes(t) && t.toLowerCase().includes(query.toLowerCase()));
  const atMax = selected.length >= max;

  return (
    <div className="relative">
      <div className="flex min-h-[36px] flex-wrap items-center gap-1 rounded-[10px] border border-[#e8eaed] bg-white px-2 py-1.5 transition-colors focus-within:border-[#fe2c55]">
        {selected.map(tag => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-[#fe2c55] px-2 py-0.5 text-[11px] font-semibold text-white">
            {tag}
            <button type="button" onClick={() => onChange(selected.filter(t => t !== tag))} className="opacity-80 hover:opacity-100">
              <X className="h-2.5 w-2.5"/>
            </button>
          </span>
        ))}
        <button type="button" disabled={atMax} onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-0.5 rounded-full border border-dashed border-[#d1d5db] px-2 py-0.5 text-[11px] text-[#9ca3af] hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-40">
          <Plus className="h-2.5 w-2.5"/>{atMax ? `${max} max` : "Add"}
        </button>
      </div>
      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-[300] overflow-hidden rounded-[10px] border border-[#e8eaed] bg-white shadow-xl">
          <div className="flex items-center gap-2 border-b border-[#f0f1f5] px-3 py-2">
            <Search className="h-3 w-3 shrink-0 text-[#9ca3af]"/>
            <input autoFocus type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder={`Search ${noun}…`}
              className="flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"/>
            {query && <button onClick={() => setQuery("")}><X className="h-3 w-3 text-[#9ca3af]"/></button>}
          </div>
          <div className="flex max-h-[160px] flex-wrap gap-1 overflow-y-auto p-2">
            {available.length === 0
              ? <p className="w-full py-2 text-center text-[11px] text-[#9ca3af]">No results</p>
              : available.map(tag => (
                <button key={tag} type="button"
                  onClick={() => { onChange([...selected, tag]); setQuery(""); if (selected.length + 1 >= max) setOpen(false); }}
                  className="rounded-full border border-[#e8eaed] px-2 py-0.5 text-[11px] text-[#374151] hover:border-[#fe2c55] hover:bg-[#fff1f3] hover:text-[#fe2c55] transition-colors">
                  + {tag}
                </button>
              ))
            }
          </div>
        </div>
      )}
      {open && <div className="fixed inset-0 z-[299]" onClick={() => setOpen(false)}/>}
    </div>
  );
}

/* ── Quick Stat widget ─────────────────────────────────────────────────────── */
function QuickStatWidget({ label, total, pct, spark, color }: { label: string; total: number; pct: number; spark: number[]; color: string }) {
  const up = pct >= 0;
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#f3f4f6] last:border-0">
      <div>
        <p className="text-[12px] text-[#9ca3af]">{label}</p>
        <p className="text-[15px] font-bold text-[#111827] mt-0.5">{formatCompact(total)}</p>
        <span className={`flex items-center gap-0.5 text-[11px] font-semibold mt-0.5 ${up ? "text-emerald-600" : "text-red-500"}`}>
          {up ? <TrendingUp size={10}/> : <TrendingDown size={10}/>} {up ? "↑" : "↓"} {Math.abs(pct).toFixed(1)}%
        </span>
      </div>
      <Sparkline data={spark} color={color} />
    </div>
  );
}

/* ── Quick Stats Card (with period filter) ─────────────────────────────────── */
type QuickStatsData = Record<string, { total: number; pct: number; spark: number[] }>;
const QS_PERIODS = [{ key: "7d", label: "7D" }, { key: "30d", label: "30D" }, { key: "90d", label: "90D" }] as const;

function QuickStatsCard({ userId, defaultStats }: { userId: number; defaultStats: QuickStatsData }) {
  const [period, setPeriod] = useState<string>("30d");

  const { data, isFetching } = useQuery<QuickStatsData>({
    queryKey: ["quickStats", userId, period],
    queryFn: () => adminService.quickStats(userId, period),
    initialData: period === "30d" ? defaultStats : undefined,
    staleTime: 60_000,
  });

  const stats = data ?? defaultStats;

  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3">
        <p className="text-[13px] font-bold text-[#111827]">Quick Stats</p>
        <div className="flex items-center gap-1">
          {QS_PERIODS.map(p => (
            <button key={p.key} onClick={() => setPeriod(p.key)} disabled={isFetching}
              className={`px-2 py-0.5 rounded-md text-[11px] font-semibold transition-all ${
                period === p.key
                  ? "bg-[#fe2c55] text-white shadow-sm"
                  : "text-[#9ca3af] hover:text-[#374151] hover:bg-[#f3f4f6]"
              } disabled:opacity-60`}>
              {p.label}
            </button>
          ))}
          {isFetching && <span className="ml-1 h-3 w-3 animate-spin rounded-full border-2 border-[#fe2c55] border-t-transparent"/>}
        </div>
      </div>
      <div className="px-4 py-2">
        <QuickStatWidget label="Public Views"   total={stats.public_views?.total??0}  pct={stats.public_views?.pct??0}  spark={stats.public_views?.spark??[]}  color="#3b82f6"/>
        <QuickStatWidget label="Interactions"   total={stats.interactions?.total??0}  pct={stats.interactions?.pct??0}  spark={stats.interactions?.spark??[]}  color="#10b981"/>
        <QuickStatWidget label="Video Views"    total={stats.video_views?.total??0}   pct={stats.video_views?.pct??0}   spark={stats.video_views?.spark??[]}   color="#fe2c55"/>
        <QuickStatWidget label="Watch Time (m)" total={stats.watch_time?.total??0}    pct={stats.watch_time?.pct??0}    spark={stats.watch_time?.spark??[]}    color="#f59e0b"/>
      </div>
    </div>
  );
}

/* ── Risk Score + Account Health Card ─────────────────────────────────────── */
function RiskHealthCard({ user }: { user: U360 }) {
  const riskScore   = user.risk_score;
  const healthPct   = user.account_health;
  const riskLabel   = user.risk_label   ?? (riskScore  <= 20 ? "Low Risk" : riskScore  <= 50 ? "Medium Risk" : riskScore  <= 75 ? "High Risk" : "Critical Risk");
  const healthLabel = user.health_label ?? (healthPct  >= 90 ? "Excellent" : healthPct >= 70 ? "Good"        : healthPct  >= 50 ? "Fair"       : "Poor");
  const checks      = user.health_checks ?? {
    profile_completeness: user.profile_completeness.complete >= 75,
    email_verified:       user.profile_completeness.email_ok,
    phone_verified:       user.profile_completeness.phone_ok,
    no_policy_violations: user.policy_violations === 0,
  };

  const riskColor   = riskScore  <= 20 ? "#10b981" : riskScore  <= 50 ? "#f59e0b" : riskScore  <= 75 ? "#f97316" : "#ef4444";
  const healthColor = healthPct  >= 90 ? "#10b981" : healthPct  >= 70 ? "#3b82f6" : healthPct  >= 50 ? "#f97316" : "#ef4444";

  const CHART_OPTS = (color: string, formatter: (v: number) => string) => ({
    chart: { sparkline: { enabled: true }, animations: { enabled: false } },
    plotOptions: {
      radialBar: {
        hollow: { size: "52%" },
        track: { background: "#f3f4f6", strokeWidth: "100%", margin: 0 },
        dataLabels: {
          name: { show: false },
          value: { offsetY: 6, fontSize: "19px", fontWeight: "900", color: "#111827", formatter },
        },
      },
    },
    fill: { colors: [color] },
    stroke: { lineCap: "round" as const },
  });

  const riskTooltip = "Risk score (0–100) is calculated from: profile completeness, email/phone verification, active strikes, policy violations, reports this month, copyright/NSFW flags, shadowban, and suspension history.";
  const healthTooltip = "Account health (0–100%) = Profile complete (25) + Email verified (25) + Phone verified (20) + No policy violations (30).";

  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
      {/* Header */}
      <div className="grid grid-cols-2 divide-x divide-[#e8eaed] border-b border-[#e8eaed]">
        <div className="flex items-center gap-1.5 px-4 py-2.5">
          <p className="text-[12px] font-bold text-[#111827]">Risk Score</p>
          <button title={riskTooltip} className="text-[#c4c7ce] hover:text-[#6b7280] transition-colors shrink-0">
            <Info size={11}/>
          </button>
        </div>
        <div className="flex items-center gap-1.5 px-4 py-2.5">
          <p className="text-[12px] font-bold text-[#111827]">Account Health</p>
          <button title={healthTooltip} className="text-[#c4c7ce] hover:text-[#6b7280] transition-colors shrink-0">
            <Info size={11}/>
          </button>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 divide-x divide-[#f3f4f6]">
        {/* Left: Risk */}
        <div className="flex flex-col items-center px-2 pt-3 pb-2">
          <ApexChart type="radialBar" series={[riskScore]} width={118} height={112}
            options={CHART_OPTS(riskColor, (v) => Math.round(v).toString())} />
          <p className="text-[10px] text-[#9ca3af] -mt-3 mb-0.5">/ 100</p>
          <p className="text-[11px] font-bold" style={{ color: riskColor }}>{riskLabel}</p>
        </div>

        {/* Right: Health */}
        <div className="flex flex-col items-center px-2 pt-3 pb-2">
          <ApexChart type="radialBar" series={[healthPct]} width={118} height={112}
            options={CHART_OPTS(healthColor, (v) => `${Math.round(v)}%`)} />
          <p className="text-[11px] font-bold -mt-1" style={{ color: healthColor }}>{healthLabel}</p>
        </div>
      </div>

      {/* Checklist */}
      <div className="px-4 py-3 border-t border-[#f3f4f6] space-y-2.5">
        {([
          ["Profile Completeness", checks.profile_completeness],
          ["Email Verified",       checks.email_verified],
          ["Phone Verified",       checks.phone_verified],
          ["No Policy Violations", checks.no_policy_violations],
        ] as [string, boolean][]).map(([label, ok]) => (
          <div key={label} className="flex items-center gap-2 text-[12px]">
            <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${ok ? "bg-emerald-500" : "bg-red-400"}`}/>
            <span className="flex-1 text-[#6b7280]">{label}</span>
            <span className={`text-[11px] font-semibold ${ok ? "text-emerald-600" : "text-red-400"}`}>
              {ok ? "100%" : "-"}
            </span>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-center gap-1 px-4 py-2 border-t border-[#f3f4f6]">
        <p className="text-[10px] text-[#9ca3af]">
          Data as of {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
        </p>
        <Info size={10} className="text-[#c4c7ce]"/>
      </div>
    </div>
  );
}

/* ── Section 1: Content Restrictions ──────────────────────────────────────── */
function tierLabel(user: U360): string {
  if (user.role !== "creator") return "Normal User";
  const lvl = user.creator_level?.level_number ?? 1;
  if (lvl <= 1) return "Creator Lv 1";
  if (lvl <= 4) return `Creator Lv ${lvl}`;
  if (lvl <= 6) return `Creator Lv ${lvl}`;
  return `Creator Lv ${lvl}`;
}

function toLocalDTL(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type BoolFormKey = "restrict_uploads"|"post_approval_required"|"block_live_access"|"disable_drafts"|"disable_commenting"|"disable_commenting_on_others"|"disable_following_others";
type RestType = "restrict_uploads"|"post_approval_required"|"block_live_access"|"disable_draft_creation"|"disable_commenting_on_uploads"|"disable_commenting_on_others"|"disable_following_others";
type ExpiryState = { expires_at: string; reason: string; open: boolean };
type ExpiryMap = Record<BoolFormKey, ExpiryState>;

const BOOL_ROWS: { fk: BoolFormKey; rt: RestType; label: string; sub: string }[] = [
  { fk: "restrict_uploads",       rt: "restrict_uploads",              label: "Restrict Uploads",               sub: "Prevent user from uploading new content" },
  { fk: "post_approval_required", rt: "post_approval_required",        label: "Post Approval Required",         sub: "All uploads require admin approval" },
  { fk: "block_live_access",      rt: "block_live_access",             label: "Block Live Access",              sub: "Disable ability to go live" },
  { fk: "disable_drafts",                 rt: "disable_draft_creation",        label: "Disable Draft Creation",         sub: "Prevent creating new drafts" },
  { fk: "disable_commenting",             rt: "disable_commenting_on_uploads", label: "Disable Commenting on Uploads",  sub: "Block comments on user's uploaded content" },
  { fk: "disable_commenting_on_others",   rt: "disable_commenting_on_others",  label: "Disable Comments to Others",     sub: "Prevent user from commenting on others' content" },
  { fk: "disable_following_others",       rt: "disable_following_others",      label: "Disable Following Others",       sub: "Prevent user from following other accounts" },
];

const emptyExpiry = (): ExpiryState => ({ expires_at: "", reason: "", open: false });
const initExpiryMap = (): ExpiryMap => Object.fromEntries(BOOL_ROWS.map(r => [r.fk, emptyExpiry()])) as ExpiryMap;

function ContentRestrictionsSection({ user, qKey }: { user: U360; qKey: string }) {
  const qc = useQueryClient();
  const ms = user.moderation_settings;
  const tierDefault = user.default_upload_limit;

  const buildForm = () => ({
    restrict_uploads:             ms.restrict_uploads,
    post_approval_required:       ms.post_approval_required,
    block_live_access:            ms.block_live_access,
    disable_drafts:               ms.disable_drafts,
    disable_commenting:           ms.disable_commenting,
    disable_commenting_on_others: ms.disable_commenting_on_others,
    disable_following_others:     ms.disable_following_others,
    daily_upload_limit:           ms.daily_upload_limit !== null ? String(ms.daily_upload_limit) : "",
    nsfw_review_required:         ms.nsfw_review_required,
    copyright_hold:               ms.copyright_hold,
    upload_suspension_until:      ms.upload_suspension_until ? ms.upload_suspension_until.substring(0, 16) : "",
  });

  const [form, setForm] = useState(buildForm);
  const [expiry, setExpiry] = useState<ExpiryMap>(initExpiryMap);

  useEffect(() => { setForm(buildForm()); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.id, ms.restrict_uploads, ms.post_approval_required, ms.block_live_access,
     ms.disable_drafts, ms.disable_commenting, ms.disable_commenting_on_others,
     ms.disable_following_others, ms.daily_upload_limit,
     ms.nsfw_review_required, ms.copyright_hold, ms.upload_suspension_until]);

  // ── Load per-restriction expiry data ──────────────────────────────────────
  const { data: restData } = useQuery({
    queryKey: ["restrictions", user.id],
    queryFn: () => adminService.getRestrictions(user.id),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!restData) return;
    setExpiry(prev => {
      const next = { ...prev };
      for (const { fk, rt } of BOOL_ROWS) {
        const r = restData[rt];
        if (r) {
          next[fk] = {
            expires_at: r.expires_at ? toLocalDTL(new Date(r.expires_at)) : "",
            reason:     r.reason ?? "",
            open:       !!r.expires_at,
          };
        }
      }
      return next;
    });
  }, [restData]);

  const updExp = (fk: BoolFormKey, patch: Partial<ExpiryState>) =>
    setExpiry(prev => ({ ...prev, [fk]: { ...prev[fk], ...patch } }));

  const addDaysStr = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(23, 59, 0, 0);
    return toLocalDTL(d);
  };

  // ── Toggle (also auto-open / auto-close expiry panel) ─────────────────────
  const tog = (fk: BoolFormKey) => {
    const nowOn = !form[fk];
    setForm(f => ({ ...f, [fk]: !f[fk] }));
    if (nowOn) updExp(fk, { open: true });
    else       updExp(fk, { open: false, expires_at: "" });
  };
  const togOther = (k: "nsfw_review_required" | "copyright_hold") =>
    setForm(f => ({ ...f, [k]: !f[k] }));

  // ── Save: both updateModeration + updateRestrictions ─────────────────────
  const save = useMutation({
    mutationFn: async () => {
      const restrictions = BOOL_ROWS.map(({ fk, rt }) => ({
        type:       rt,
        is_active:  form[fk],
        expires_at: (form[fk] && expiry[fk].expires_at)
                      ? new Date(expiry[fk].expires_at).toISOString()
                      : null,
        reason:     expiry[fk].reason || null,
      }));
      await Promise.all([
        adminService.updateModeration(user.id, {
          ...form,
          daily_upload_limit:      form.daily_upload_limit !== "" ? Number(form.daily_upload_limit) : null,
          upload_suspension_until: form.upload_suspension_until || null,
        }),
        adminService.updateRestrictions(user.id, restrictions),
      ]);
    },
    onSuccess: () => {
      toast.success("Content restrictions saved");
      qc.invalidateQueries({ queryKey: [qKey] });
      qc.invalidateQueries({ queryKey: ["restrictions", user.id] });
    },
    onError: () => toast.error("Save failed"),
  });

  const effectiveLimit = form.daily_upload_limit !== "" ? Number(form.daily_upload_limit) : tierDefault;
  const nowDTL = toLocalDTL(new Date());

  return (
    <SectionCard title="Content Restrictions & Upload Controls" number={1}
      action={<Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate()}><Save size={12}/>{save.isPending?"Saving…":"Save"}</Btn>}>
      <div className="grid grid-cols-2 gap-x-8">

        {/* ── Left: 5 main restriction toggles with expiry ─────────────── */}
        <div>
          {BOOL_ROWS.map(({ fk, label, sub }) => {
            const ex = expiry[fk];
            const isOn = form[fk];
            const expDate = ex.expires_at ? new Date(ex.expires_at) : null;
            const expiryLabel = expDate && expDate > new Date()
              ? `Until: ${expDate.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`
              : "No expiry - until manually removed";

            return (
              <div key={fk}>
                {/* Row */}
                <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#f3f4f6]">
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-[#111827] leading-tight">{label}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-0.5">{sub}</p>
                    {/* Expiry label when panel is closed */}
                    {isOn && !ex.open && (
                      <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-medium text-amber-600">
                        <Calendar size={9}/>{expiryLabel}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Calendar toggle button */}
                    <button type="button" title="Set expiry date"
                      onClick={() => updExp(fk, { open: !ex.open })}
                      className={`p-1 rounded-lg transition-colors ${ex.open ? "text-[#fe2c55] bg-[#fe2c55]/10" : "text-[#9ca3af] hover:text-[#fe2c55] hover:bg-[#f9fafb]"}`}>
                      <Calendar size={12}/>
                    </button>
                    <Toggle value={isOn} onChange={() => tog(fk)}/>
                  </div>
                </div>

                {/* Expiry panel */}
                {ex.open && (
                  <div className="mb-2 rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 pt-2.5 pb-3 space-y-2">
                    {/* Status */}
                    {isOn && (
                      <span className={`inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-[10px] font-semibold ${ex.expires_at ? "bg-amber-50 text-amber-700 border border-amber-200" : "bg-[#f0f0f0] text-[#6b7280]"}`}>
                        <Calendar size={9}/>{expiryLabel}
                      </span>
                    )}
                    {/* Quick presets */}
                    <div className="flex flex-wrap gap-1 items-center">
                      <span className="text-[10px] text-[#9ca3af]">Expires in:</span>
                      {([["24h", 1], ["7d", 7], ["30d", 30]] as [string, number][]).map(([lbl, d]) => (
                        <button key={lbl} type="button"
                          onClick={() => updExp(fk, { expires_at: addDaysStr(d) })}
                          className="px-2 py-0.5 text-[11px] rounded-lg border border-[#e8eaed] bg-white text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors">
                          {lbl}
                        </button>
                      ))}
                      <button type="button" onClick={() => updExp(fk, { expires_at: "" })}
                        className="px-2 py-0.5 text-[11px] rounded-lg border border-[#e8eaed] bg-white text-[#9ca3af] hover:border-[#374151] hover:text-[#374151] transition-colors">
                        No expiry
                      </button>
                    </div>
                    {/* Date/time picker */}
                    <input type="datetime-local" value={ex.expires_at} min={nowDTL}
                      onChange={e => updExp(fk, { expires_at: e.target.value })}
                      className="h-8 w-full rounded-lg border border-[#e8eaed] px-2 text-[11px] text-[#111827] outline-none focus:border-[#fe2c55]"/>
                    {/* Reason */}
                    <input type="text" value={ex.reason} maxLength={500}
                      onChange={e => updExp(fk, { reason: e.target.value })}
                      placeholder="Reason (optional)"
                      className="h-8 w-full rounded-lg border border-[#e8eaed] px-2 text-[11px] text-[#111827] placeholder-[#9ca3af] outline-none focus:border-[#fe2c55]"/>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ── Right: upload limit, nsfw, copyright, suspension ─────────── */}
        <div>
          {/* Daily Upload Limit */}
          <div className="py-2.5 border-b border-[#f3f4f6]">
            <div className="flex items-center justify-between mb-1.5">
              <div>
                <p className="text-[13px] font-medium text-[#111827]">Daily Upload Limit</p>
                <p className="text-[11px] text-[#9ca3af]">Max videos per 24 hours</p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number" min={1} max={200}
                  value={form.daily_upload_limit}
                  onChange={e => setForm(f => ({ ...f, daily_upload_limit: e.target.value }))}
                  placeholder={String(tierDefault)}
                  className="h-8 w-16 rounded-lg border border-[#e8eaed] px-2 text-[13px] text-center outline-none focus:border-[#fe2c55]"/>
                {form.daily_upload_limit !== "" && (
                  <button onClick={() => setForm(f => ({ ...f, daily_upload_limit: "" }))}
                    className="text-[11px] text-[#fe2c55] font-semibold hover:underline whitespace-nowrap">
                    Reset
                  </button>
                )}
              </div>
            </div>
            <div className="mt-2 rounded-xl bg-[#f9fafb] border border-[#f3f4f6] p-3">
              <p className="text-[11px] font-semibold text-[#374151] mb-2">Tier-based defaults</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {([
                  ["Normal User",        5,  user.role !== "creator"],
                  ["Creator Level 1",   10,  user.role === "creator" && (user.creator_level?.level_number ?? 0) === 1],
                  ["Creator Level 2–4", 15,  user.role === "creator" && (user.creator_level?.level_number ?? 0) >= 2 && (user.creator_level?.level_number ?? 0) <= 4],
                  ["Creator Level 5–6", 25,  user.role === "creator" && (user.creator_level?.level_number ?? 0) >= 5 && (user.creator_level?.level_number ?? 0) <= 6],
                  ["Creator Level 7–10",50,  user.role === "creator" && (user.creator_level?.level_number ?? 0) >= 7],
                ] as [string, number, boolean][]).map(([label, limit, active]) => (
                  <div key={label} className={`flex items-center justify-between rounded-lg px-2 py-1 text-[11px] transition-colors
                    ${active ? "bg-[#fe2c55]/8 font-bold text-[#fe2c55]" : "text-[#9ca3af]"}`}>
                    <span>{label}</span>
                    <span className={`font-bold ${active ? "text-[#fe2c55]" : "text-[#374151]"}`}>{limit}/day</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[10px] text-[#9ca3af]">
                Current tier: <span className="font-semibold text-[#374151]">{tierLabel(user)}</span>
                {" · "}Effective limit: <span className="font-semibold text-[#fe2c55]">{effectiveLimit}/day</span>
                {form.daily_upload_limit !== "" && <span className="ml-1 text-amber-600">(admin override)</span>}
              </p>
            </div>
          </div>

          <SettingRow label="NSFW Review Required" sub="Flag all uploads for NSFW review">
            <Toggle value={form.nsfw_review_required} onChange={() => togOther("nsfw_review_required")}/>
          </SettingRow>
          <SettingRow label="Copyright Hold" sub="Hold content for copyright review">
            <Toggle value={form.copyright_hold} onChange={() => togOther("copyright_hold")}/>
          </SettingRow>
          <div className="py-2.5">
            <p className="text-[13px] font-medium text-[#111827] mb-1 flex items-center gap-1.5">
              <Calendar size={13} className="text-[#fe2c55]"/>
              Upload Suspension Expiry
            </p>
            {(() => {
              const until = form.upload_suspension_until ? new Date(form.upload_suspension_until) : null;
              const isActive = until && until > new Date();
              if (!isActive) return null;
              return (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                  <ShieldAlert size={14} className="mt-0.5 shrink-0 text-amber-600"/>
                  <div>
                    <p className="text-[11px] font-semibold text-amber-800">Restriction active</p>
                    <p className="text-[11px] text-amber-700">
                      Locked until{" "}
                      {until.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}
                      {" at "}
                      {until.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                </div>
              );
            })()}
            <div className="relative">
              <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2">
                <Calendar size={12} className="text-[#9ca3af]"/>
              </span>
              <input type="datetime-local" value={form.upload_suspension_until}
                onChange={e => setForm(f => ({ ...f, upload_suspension_until: e.target.value }))}
                className="h-9 w-full rounded-xl border border-[#e8eaed] pl-7 pr-3 text-[12px] text-[#111827] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10"/>
            </div>
            {form.upload_suspension_until && (
              <button type="button" onClick={() => setForm(f => ({ ...f, upload_suspension_until: "" }))}
                className="mt-1.5 flex items-center gap-1 text-[11px] text-[#9ca3af] hover:text-red-500 transition-colors">
                <X size={10}/> Clear expiry
              </button>
            )}
          </div>
        </div>
      </div>
    </SectionCard>
  );
}

/* ── Section 2: Moderation Settings ───────────────────────────────────────── */
function ModerationSettingsSection({ user, qKey }: { user: U360; qKey: string }) {
  const qc = useQueryClient();
  const ms = user.moderation_settings;

  const buildForm = () => ({
    warning_level:               ms.warning_level,
    content_review_mode:         ms.content_review_mode,
    comment_moderation:          ms.comment_moderation,
    message_monitoring:          ms.message_monitoring,
    shadowban:                   ms.shadowban,
    temporary_suspension:        ms.temporary_suspension,
    temporary_suspension_until:  ms.temporary_suspension_until
      ? ms.temporary_suspension_until.substring(0, 16)
      : "",
    appeal_status:               ms.appeal_status ?? "",
  });

  const [form, setForm] = useState(buildForm);

  useEffect(() => { setForm(buildForm()); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.id, ms.warning_level, ms.content_review_mode, ms.comment_moderation,
     ms.message_monitoring, ms.shadowban, ms.temporary_suspension,
     ms.temporary_suspension_until, ms.appeal_status]);

  const [modal, setModal]       = useState<{type:string;open:boolean}>({type:"",open:false});
  const [reason, setReason]     = useState("");
  const [suspendUntil, setSuspendUntil] = useState("");
  const [moreOpen, setMoreOpen] = useState(false);

  const save    = useMutation({
    mutationFn: () => adminService.updateModeration(user.id, {
      ...form,
      temporary_suspension_until: form.temporary_suspension && form.temporary_suspension_until
        ? new Date(form.temporary_suspension_until).toISOString()
        : null,
    }),
    onSuccess: () => { toast.success("Moderation settings saved"); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError:   () => toast.error("Save failed"),
  });
  const strike  = useMutation({ mutationFn: (r:string) => adminService.addStrike(user.id, r), onSuccess: () => { toast.success("Strike added"); qc.invalidateQueries({ queryKey: [qKey] }); setModal({type:"",open:false}); setReason(""); }, onError: () => toast.error("Failed") });
  const warn    = useMutation({ mutationFn: (r:string) => adminService.issueWarning360(user.id, r), onSuccess: () => { toast.success("Warning issued"); qc.invalidateQueries({ queryKey: [qKey] }); setModal({type:"",open:false}); setReason(""); }, onError: () => toast.error("Failed") });
  const suspend = useMutation({
    mutationFn: (r:string) => adminService.suspendUser(user.id, r, suspendUntil || null),
    onSuccess: () => { toast.success("User suspended"); qc.invalidateQueries({ queryKey: [qKey] }); setModal({type:"",open:false}); setReason(""); setSuspendUntil(""); },
    onError: () => toast.error("Failed"),
  });

  const SEL_CLS = "h-8 rounded-lg border border-[#e8eaed] px-2 text-[13px] outline-none focus:border-[#fe2c55] bg-white";

  return (
    <SectionCard title="Moderation Settings & Enforcement" number={2}
      action={<Btn variant="primary" disabled={save.isPending} onClick={() => save.mutate()}><Save size={12}/>{save.isPending?"Saving…":"Save"}</Btn>}>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <SettingRow label="Warning Level">
            <select value={form.warning_level} onChange={e => setForm(f => ({...f, warning_level: Number(e.target.value)}))} className={SEL_CLS}>
              {[0,1,2,3,4,5].map(l => <option key={l} value={l}>{l===0?"None":`Level ${l}`}</option>)}
            </select>
          </SettingRow>
          <SettingRow label="Content Review Mode">
            <select value={form.content_review_mode} onChange={e => setForm(f => ({...f, content_review_mode: e.target.value}))} className={SEL_CLS}>
              <option value="none">None</option><option value="standard">Standard</option><option value="strict">Strict</option>
            </select>
          </SettingRow>
          <SettingRow label="Comment Moderation">
            <select value={form.comment_moderation} onChange={e => setForm(f => ({...f, comment_moderation: e.target.value}))} className={SEL_CLS}>
              <option value="off">Off</option><option value="light">Light</option><option value="standard">Standard</option><option value="strong">Strong</option>
            </select>
          </SettingRow>
          <SettingRow label="Message Monitoring Flag">
            <Toggle value={form.message_monitoring} onChange={v => setForm(f => ({...f, message_monitoring: v}))}/>
          </SettingRow>
          <SettingRow label="Shadowban">
            <Toggle value={form.shadowban} onChange={v => setForm(f => ({...f, shadowban: v}))}/>
          </SettingRow>
          <div>
            <div className="flex items-center justify-between gap-3 py-2.5 border-b border-[#f3f4f6]">
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-medium text-[#111827] leading-tight">Temporary Suspension</p>
                {form.temporary_suspension && form.temporary_suspension_until && (() => {
                  const d = new Date(form.temporary_suspension_until);
                  return d > new Date()
                    ? <p className="text-[11px] text-amber-600 mt-0.5 flex items-center gap-1"><Calendar size={9}/>Until: {d.toLocaleDateString(undefined,{day:"numeric",month:"short",year:"numeric"})}</p>
                    : <p className="text-[11px] text-red-400 mt-0.5">Expired</p>;
                })()}
              </div>
              <Toggle value={form.temporary_suspension} onChange={v => {
                setForm(f => ({...f, temporary_suspension: v, temporary_suspension_until: v ? f.temporary_suspension_until : ""}));
              }}/>
            </div>
            {form.temporary_suspension && (
              <div className="mb-2 rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 pt-2.5 pb-3 space-y-2">
                <div className="flex flex-wrap gap-1 items-center">
                  <span className="text-[10px] text-[#9ca3af]">Suspend for:</span>
                  {([["1 hour", 1/24], ["24 hours", 1], ["7 days", 7], ["30 days", 30]] as [string, number][]).map(([lbl, d]) => (
                    <button key={lbl} type="button"
                      onClick={() => {
                        const dt = new Date();
                        if (d < 1) dt.setHours(dt.getHours() + 1);
                        else { dt.setDate(dt.getDate() + Math.floor(d)); dt.setHours(23, 59, 0, 0); }
                        setForm(f => ({...f, temporary_suspension_until: toLocalDTL(dt)}));
                      }}
                      className="px-2 py-0.5 text-[11px] rounded-lg border border-[#e8eaed] bg-white text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors">
                      {lbl}
                    </button>
                  ))}
                  <button type="button" onClick={() => setForm(f => ({...f, temporary_suspension_until: ""}))}
                    className="px-2 py-0.5 text-[11px] rounded-lg border border-[#e8eaed] bg-white text-[#9ca3af] hover:text-[#374151] transition-colors">
                    Until removed
                  </button>
                </div>
                <input type="datetime-local" value={form.temporary_suspension_until} min={toLocalDTL(new Date())}
                  onChange={e => setForm(f => ({...f, temporary_suspension_until: e.target.value}))}
                  className="h-8 w-full rounded-lg border border-[#e8eaed] px-2 text-[11px] text-[#111827] outline-none focus:border-[#fe2c55]"/>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#f9fafb] p-3 border border-[#f3f4f6]">
              <p className="text-[11px] text-[#9ca3af]">Strike Count</p>
              <p className="text-[20px] font-black text-[#111827] mt-0.5">
                {ms.strike_count}<span className="text-[12px] font-normal text-[#9ca3af]"> / 5</span>
              </p>
            </div>
            <div className="rounded-xl bg-[#f9fafb] p-3 border border-[#f3f4f6]">
              <p className="text-[11px] text-[#9ca3af]">Appeal Status</p>
              <div className="mt-1">
                {ms.appeal_status ? (
                  <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold
                    ${ms.appeal_status==="pending"?"bg-amber-50 text-amber-700 border border-amber-200":"bg-emerald-50 text-emerald-700 border border-emerald-200"}`}>
                    {ms.appeal_status.charAt(0).toUpperCase()+ms.appeal_status.slice(1)}
                  </span>
                ) : <span className="text-[13px] text-[#9ca3af]">-</span>}
              </div>
            </div>
          </div>
          <div className="rounded-xl bg-[#f9fafb] border border-[#f3f4f6] divide-y divide-[#f3f4f6]">
            {([["Last Appeal",ms.last_appeal_at],["Last Warning",ms.last_warning_at],["Last Strike",ms.last_strike_at]] as [string,string|null][]).map(([k,v])=>(
              <div key={k} className="flex justify-between text-[12px] px-3 py-2">
                <span className="text-[#9ca3af]">{k}</span>
                <span className="font-medium text-[#374151]">{v ? formatDate(v) : "-"}</span>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <button onClick={()=>setModal({type:"warn",open:true})}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 hover:bg-amber-100 transition-colors">
              <AlertTriangle size={12}/>Issue Warning
            </button>
            <button onClick={()=>setModal({type:"strike",open:true})}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 transition-colors">
              <ShieldAlert size={12}/>Add Strike
            </button>
            <button onClick={()=>setModal({type:"suspend",open:true})}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-white bg-[#fe2c55] hover:bg-[#e02249] transition-colors">
              <UserX size={12}/>Suspend User
            </button>
            <div className="relative">
              <button onClick={() => setMoreOpen(v => !v)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[12px] font-semibold text-gray-600 bg-white border border-[#e8eaed] hover:bg-gray-50 transition-colors">
                More Actions<ChevronDown size={12}/>
              </button>
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)}/>
                  <div className="absolute left-0 top-full z-20 mt-1.5 w-52 rounded-2xl border border-[#e8eaed] bg-white p-1.5 shadow-xl">
                    {[
                      { label: "Clear All Strikes",  fn: () => { if(confirm("Clear all strikes for this user?")) { adminService.updateModeration(user.id, { strike_count: 0 } as never).then(() => { toast.success("Strikes cleared"); qc.invalidateQueries({ queryKey: [qKey] }); }); } } },
                      { label: "Resolve Appeal",     fn: () => { adminService.updateModeration(user.id, { appeal_status: "resolved" }).then(() => { toast.success("Appeal resolved"); qc.invalidateQueries({ queryKey: [qKey] }); }); } },
                      { label: "Reset Warning Level",fn: () => { adminService.updateModeration(user.id, { warning_level: 0 }).then(() => { toast.success("Warning level reset"); qc.invalidateQueries({ queryKey: [qKey] }); }); } },
                    ].map(({ label, fn }) => (
                      <button key={label} onClick={() => { fn(); setMoreOpen(false); }}
                        className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f4f5f7] transition-colors text-left">
                        {label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {(["warn","strike","suspend"] as const).map(type => (
        <Modal key={type}
          open={modal.type===type && modal.open}
          title={type==="warn"?"Issue Warning":type==="strike"?"Add Strike":"Suspend User"}
          message={type==="suspend"?"Enter reason and optionally choose a suspension end date:":"Enter a reason:"}
          confirmLabel={type==="warn"?"Issue Warning":type==="strike"?"Add Strike":"Suspend"}
          danger={type!=="warn"}
          loading={type==="warn"?warn.isPending:type==="strike"?strike.isPending:suspend.isPending}
          onCancel={()=>{setModal({type:"",open:false});setReason("");setSuspendUntil("");}}
          onConfirm={()=>{const r=reason||`${type} by admin`; if(type==="warn")warn.mutate(r); if(type==="strike")strike.mutate(r); if(type==="suspend")suspend.mutate(r);}}>
          <input value={reason} onChange={e=>setReason(e.target.value)}
            placeholder={`Reason for ${type}…`}
            className="mt-2 h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[13px] outline-none focus:border-[#fe2c55]"/>
          {type==="suspend" && (
            <div className="mt-2 space-y-1.5">
              <p className="text-[11px] text-[#9ca3af]">Suspend until (optional):</p>
              <div className="flex flex-wrap gap-1">
                {([["24h",1],["7d",7],["30d",30]] as [string,number][]).map(([lbl,d])=>(
                  <button key={lbl} type="button"
                    onClick={()=>{const dt=new Date();dt.setDate(dt.getDate()+d);dt.setHours(23,59,0,0);setSuspendUntil(toLocalDTL(dt));}}
                    className="px-2 py-0.5 rounded-lg border border-[#e8eaed] text-[11px] text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors">
                    {lbl}
                  </button>
                ))}
                <button type="button" onClick={()=>setSuspendUntil("")}
                  className="px-2 py-0.5 rounded-lg border border-[#e8eaed] text-[11px] text-[#9ca3af] hover:text-[#374151] transition-colors">
                  Indefinite
                </button>
              </div>
              <input type="datetime-local" value={suspendUntil} min={toLocalDTL(new Date())}
                onChange={e=>setSuspendUntil(e.target.value)}
                className="h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[12px] outline-none focus:border-[#fe2c55]"/>
            </div>
          )}
        </Modal>
      ))}
    </SectionCard>
  );
}

/* ── Section 3: Permissions & Access ──────────────────────────────────────── */
function PermissionsSection({ user, qKey }: { user: U360; qKey: string }) {
  const qc = useQueryClient();
  const ps = user.permission_settings;
  const [perm, setPerm] = useState({ ...ps });
  const [role, setRole] = useState(user.role);

  useEffect(() => {
    setPerm({ ...user.permission_settings });
    setRole(user.role);
  }, [user.id, user.role, user.permission_settings.live_permission, user.permission_settings.duet_permission,
      user.permission_settings.download_permission, user.permission_settings.collaboration_permission,
      user.permission_settings.messaging_permission, user.permission_settings.access_level]); // eslint-disable-line react-hooks/exhaustive-deps

  const SEL_CLS = "h-8 rounded-lg border border-[#e8eaed] px-2 text-[13px] outline-none focus:border-[#fe2c55] bg-white";

  const savePerms  = useMutation({ mutationFn: () => adminService.updatePermissions(user.id, perm), onSuccess: () => { toast.success("Permissions saved"); qc.invalidateQueries({ queryKey: [qKey] }); } });
  const changeRole = useMutation({ mutationFn: (r:string) => adminService.promoteUser(user.id, r), onSuccess: () => { toast.success("Role updated"); qc.invalidateQueries({ queryKey: [qKey] }); } });

  return (
    <SectionCard title="Permissions & Access Controls" number={3}
      action={<Btn variant="primary" disabled={savePerms.isPending} onClick={()=>savePerms.mutate()}><Save size={12}/>{savePerms.isPending?"Saving…":"Save"}</Btn>}>
      <div className="grid grid-cols-2 gap-x-8">
        <div>
          <SettingRow label="Role">
            <div className="flex items-center gap-2">
              <select value={role} onChange={e=>setRole(e.target.value)} className={SEL_CLS}>
                <option value="user">User</option><option value="creator">Creator</option><option value="admin">Admin</option>
              </select>
              {role!==user.role && <Btn variant="primary" onClick={()=>changeRole.mutate(role)}>Apply</Btn>}
            </div>
          </SettingRow>
          {/* Verification State lived here as a bare Verify/Remove toggle. Removed: the
              badge is not a permission, and this was a third place to change it - the
              profile header already has Verify/Remove, and the Verification Badge tab is
              where the decision is actually made, with the documents in front of you. */}
          <SettingRow label="Monetization Eligibility">
            <span className="text-[13px] font-semibold text-emerald-600">Eligible</span>
          </SettingRow>
          <SettingRow label="Ad Eligibility">
            <span className="text-[13px] font-semibold text-emerald-600">Eligible</span>
          </SettingRow>
          <SettingRow label="Access Level">
            <select value={perm.access_level} onChange={e=>setPerm(p=>({...p,access_level:e.target.value}))} className={SEL_CLS}>
              <option value="full">Full Access</option><option value="limited">Limited Access</option><option value="read_only">Read Only</option>
            </select>
          </SettingRow>
        </div>
        <div>
          <SettingRow label="Live Permission">
            <Toggle value={perm.live_permission} onChange={v=>setPerm(p=>({...p,live_permission:v}))}/>
          </SettingRow>
          <SettingRow label="Duet / Stitch Permission">
            <Toggle value={perm.duet_permission} onChange={v=>setPerm(p=>({...p,duet_permission:v}))}/>
          </SettingRow>
          <SettingRow label="Download Permission">
            <Toggle value={perm.download_permission} onChange={v=>setPerm(p=>({...p,download_permission:v}))}/>
          </SettingRow>
          <SettingRow label="Collaboration Permission">
            <Toggle value={perm.collaboration_permission} onChange={v=>setPerm(p=>({...p,collaboration_permission:v}))}/>
          </SettingRow>
          <SettingRow label="Messaging Permission">
            <select value={perm.messaging_permission} onChange={e=>setPerm(p=>({...p,messaging_permission:e.target.value}))} className={SEL_CLS}>
              <option value="everyone">Everyone</option><option value="followers">Followers</option><option value="friends">Friends</option><option value="none">None</option>
            </select>
          </SettingRow>
        </div>
      </div>
    </SectionCard>
  );
}

/* ── Section 4: Safety Controls ────────────────────────────────────────────── */
type SafetyModal = "blocked" | "hidden_words" | "data_requests" | "deletion_requests" | null;

function SafetySection({ user, qKey }: { user: U360; qKey: string }) {
  const qc = useQueryClient();
  const ms = user.moderation_settings;
  const [modal, setModal] = useState<SafetyModal>(null);

  const buildForm = () => ({
    is_private:          user.is_private,
    dm_permissions:      ms.allow_dm            ?? "everyone",
    mention_permissions: ms.allow_mentions      ?? "everyone",
    content_filter:      ms.content_filter      ?? "standard",
    sensitive_filter:    ms.sensitive_filter    ?? true,
    activity_visibility: ms.activity_visibility ?? "everyone",
  });

  const [form, setForm] = useState(buildForm);
  useEffect(() => { setForm(buildForm()); },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [user.id, user.is_private, ms.allow_dm, ms.allow_mentions,
     ms.content_filter, ms.sensitive_filter, ms.activity_visibility]);

  const save = useMutation({
    mutationFn: () => adminService.updateSafety(user.id, {
      is_private:          form.is_private,
      allow_dm:            form.dm_permissions,
      allow_mentions:      form.mention_permissions,
      content_filter:      form.content_filter,
      sensitive_filter:    form.sensitive_filter,
      activity_visibility: form.activity_visibility,
    }),
    onSuccess: () => { toast.success("Safety settings saved"); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError:   () => toast.error("Save failed"),
  });

  // ── Modal data queries (lazy - only when modal is open) ───────────────────
  const blockedQ = useQuery({
    queryKey: ["blocked", user.id],
    queryFn:  () => adminService.getBlockedUsers(user.id),
    enabled:  modal === "blocked",
  });
  const wordsQ = useQuery({
    queryKey: ["hidden-words", user.id],
    queryFn:  () => adminService.getHiddenWords(user.id),
    enabled:  modal === "hidden_words",
  });
  const dataQ = useQuery({
    queryKey: ["data-requests", user.id],
    queryFn:  () => adminService.getDataRequests(user.id),
    enabled:  modal === "data_requests",
  });
  const deletionQ = useQuery({
    queryKey: ["deletion-requests", user.id],
    queryFn:  () => adminService.getDeletionRequests(user.id),
    enabled:  modal === "deletion_requests",
  });

  const delWord = useMutation({
    mutationFn: (wid: number) => adminService.deleteHiddenWord(user.id, wid),
    onSuccess: () => { toast.success("Word removed"); qc.invalidateQueries({ queryKey: ["hidden-words", user.id] }); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError:   () => toast.error("Failed to remove word"),
  });
  const updateData = useMutation({
    mutationFn: ({ rid, status }: { rid: number; status: string }) => adminService.updateDataRequest(user.id, rid, status),
    onSuccess: () => { toast.success("Request updated"); qc.invalidateQueries({ queryKey: ["data-requests", user.id] }); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError: () => toast.error("Update failed"),
  });
  const updateDeletion = useMutation({
    mutationFn: ({ rid, status }: { rid: number; status: string }) => adminService.updateDeletionRequest(user.id, rid, status),
    onSuccess: () => { toast.success("Request updated"); qc.invalidateQueries({ queryKey: ["deletion-requests", user.id] }); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError: () => toast.error("Update failed"),
  });

  const SEL_CLS = "h-8 rounded-lg border border-[#e8eaed] px-2 text-[13px] outline-none focus:border-[#fe2c55] bg-white";
  const STATUS_COLORS: Record<string, string> = {
    pending:    "bg-amber-50 text-amber-700 border border-amber-200",
    processing: "bg-blue-50 text-blue-700 border border-blue-200",
    ready:      "bg-emerald-50 text-emerald-700 border border-emerald-200",
    expired:    "bg-gray-100 text-gray-500 border border-gray-200",
    approved:   "bg-emerald-50 text-emerald-700 border border-emerald-200",
    rejected:   "bg-red-50 text-red-600 border border-red-200",
    cancelled:  "bg-gray-100 text-gray-500 border border-gray-200",
  };

  return (
    <>
    <SectionCard title="User Preferences & Safety Controls" number={4}
      action={<Btn variant="primary" disabled={save.isPending} onClick={()=>save.mutate()}><Save size={12}/>{save.isPending?"Saving…":"Save"}</Btn>}>
      <div className="grid grid-cols-2 gap-x-8">
        {/* ── Left column ─────────────────────────────────── */}
        <div>
          <SettingRow label="Private Account" sub="Control who can see this user's content">
            <Toggle value={form.is_private} onChange={v=>setForm(f=>({...f,is_private:v}))}/>
          </SettingRow>
          <SettingRow label="DM Permissions" sub="Who can send direct messages">
            <select value={form.dm_permissions} onChange={e=>setForm(f=>({...f,dm_permissions:e.target.value}))} className={SEL_CLS}>
              <option value="everyone">Everyone</option><option value="followers">Followers</option><option value="friends">Friends</option><option value="none">None</option>
            </select>
          </SettingRow>
          <SettingRow label="Mention/Tag Permissions" sub="Who can mention or tag this user">
            <select value={form.mention_permissions} onChange={e=>setForm(f=>({...f,mention_permissions:e.target.value}))} className={SEL_CLS}>
              <option value="everyone">Everyone</option><option value="followers">Followers</option><option value="friends">Friends</option><option value="none">None</option>
            </select>
          </SettingRow>
          <SettingRow label="Blocked Accounts" sub="Users blocked by this account">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#111827]">{user.blocked_count ?? 0}</span>
              <button onClick={()=>setModal("blocked")} className="text-[12px] text-[#fe2c55] font-semibold hover:underline">View</button>
            </div>
          </SettingRow>
          <SettingRow label="Hidden Words Filter" sub="Words filtered from comments">
            <div className="flex items-center gap-2">
              {(user.hidden_words_count ?? 0) > 0
                ? <span className="text-[12px] font-semibold text-emerald-600">{user.hidden_words_count} words</span>
                : <span className="text-[12px] text-[#9ca3af]">None</span>}
              <button onClick={()=>setModal("hidden_words")} className="text-[12px] text-[#fe2c55] font-semibold hover:underline">Manage</button>
            </div>
          </SettingRow>
        </div>

        {/* ── Right column ────────────────────────────────── */}
        <div>
          <SettingRow label="Content Exposure Filter" sub="Controls feed content diversity">
            <select value={form.content_filter} onChange={e=>setForm(f=>({...f,content_filter:e.target.value}))} className={SEL_CLS}>
              <option value="off">Off</option><option value="standard">Standard</option><option value="strict">Strict</option>
            </select>
          </SettingRow>
          <SettingRow label="Sensitive Content Filter" sub="Hide mature or sensitive content">
            <Toggle value={form.sensitive_filter} onChange={v=>setForm(f=>({...f,sensitive_filter:v}))}/>
          </SettingRow>
          <SettingRow label="Activity Status Visibility" sub="Who can see online status">
            <select value={form.activity_visibility} onChange={e=>setForm(f=>({...f,activity_visibility:e.target.value}))} className={SEL_CLS}>
              <option value="everyone">Everyone</option><option value="followers">Followers</option><option value="friends">Friends</option><option value="none">None</option>
            </select>
          </SettingRow>
          <SettingRow label="Data Download Requests" sub="GDPR data export requests">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#111827]">{user.data_download_requests_count ?? 0}</span>
              <button onClick={()=>setModal("data_requests")} className="text-[12px] text-[#fe2c55] font-semibold hover:underline">View</button>
            </div>
          </SettingRow>
          <SettingRow label="Delete Account Requests" sub="Pending account deletion requests">
            <div className="flex items-center gap-2">
              <span className={`text-[13px] font-bold ${(user.deletion_requests_count ?? 0) > 0 ? "text-red-600" : "text-[#111827]"}`}>
                {user.deletion_requests_count ?? 0}
              </span>
              <button onClick={()=>setModal("deletion_requests")} className="text-[12px] text-[#fe2c55] font-semibold hover:underline">View</button>
            </div>
          </SettingRow>
        </div>
      </div>
    </SectionCard>

    {/* ── Modals ─────────────────────────────────────────────────────────── */}
    {modal && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={()=>setModal(null)}>
        <div className="relative w-full max-w-md rounded-2xl bg-white shadow-2xl" onClick={e=>e.stopPropagation()}>
          {/* Modal header */}
          <div className="flex items-center justify-between border-b border-[#f0f1f5] px-5 py-4">
            <p className="text-[14px] font-bold text-[#111827]">
              {modal === "blocked"           && `Blocked Accounts (${user.blocked_count ?? 0})`}
              {modal === "hidden_words"      && `Hidden Words Filter (${user.hidden_words_count ?? 0})`}
              {modal === "data_requests"     && `Data Download Requests (${user.data_download_requests_count ?? 0})`}
              {modal === "deletion_requests" && `Delete Account Requests (${user.deletion_requests_count ?? 0})`}
            </p>
            <button onClick={()=>setModal(null)} className="rounded-lg p-1 text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151]">
              <X size={16}/>
            </button>
          </div>

          {/* Modal body */}
          <div className="max-h-[420px] overflow-y-auto p-4 space-y-2">

            {/* Blocked users */}
            {modal === "blocked" && (
              blockedQ.isLoading ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">Loading…</p>
              : !blockedQ.data?.length ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">No blocked accounts.</p>
              : blockedQ.data.map(b => (
                <div key={b.id} className="flex items-center gap-3 rounded-xl border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2.5">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[12px] font-bold text-[#374151]">
                    {b.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#111827]">{b.name ?? "Unknown"}</p>
                    <p className="truncate text-[11px] text-[#9ca3af]">@{b.username ?? "-"}</p>
                  </div>
                  <p className="shrink-0 text-[10px] text-[#c4c7ce]">{b.blocked_at ? new Date(b.blocked_at).toLocaleDateString() : ""}</p>
                </div>
              ))
            )}

            {/* Hidden words */}
            {modal === "hidden_words" && (
              wordsQ.isLoading ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">Loading…</p>
              : !wordsQ.data?.length ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">No hidden words configured.</p>
              : wordsQ.data.map(w => (
                <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2">
                  <span className="text-[13px] font-medium text-[#111827]">{w.word}</span>
                  <button
                    onClick={()=>delWord.mutate(w.id)}
                    disabled={delWord.isPending}
                    className="flex h-6 w-6 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-red-50 hover:text-red-500 transition-colors disabled:opacity-50">
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))
            )}

            {/* Data download requests */}
            {modal === "data_requests" && (
              dataQ.isLoading ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">Loading…</p>
              : !dataQ.data?.length ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">No data download requests.</p>
              : dataQ.data.map(r => (
                <div key={r.id} className="rounded-xl border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[#9ca3af]">#{r.id} · {new Date(r.created_at).toLocaleDateString()}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? ""}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button onClick={()=>updateData.mutate({rid:r.id,status:"processing"})} disabled={updateData.isPending}
                        className="flex-1 rounded-lg border border-[#e8eaed] py-1 text-[11px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors disabled:opacity-50">
                        Mark Processing
                      </button>
                      <button onClick={()=>updateData.mutate({rid:r.id,status:"expired"})} disabled={updateData.isPending}
                        className="flex-1 rounded-lg border border-[#e8eaed] py-1 text-[11px] font-semibold text-[#9ca3af] hover:border-[#374151] hover:text-[#374151] transition-colors disabled:opacity-50">
                        Expire
                      </button>
                    </div>
                  )}
                  {r.status === "processing" && (
                    <button onClick={()=>updateData.mutate({rid:r.id,status:"ready"})} disabled={updateData.isPending}
                      className="w-full rounded-lg border border-emerald-200 bg-emerald-50 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50">
                      Mark Ready
                    </button>
                  )}
                </div>
              ))
            )}

            {/* Account deletion requests */}
            {modal === "deletion_requests" && (
              deletionQ.isLoading ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">Loading…</p>
              : !deletionQ.data?.length ? <p className="py-8 text-center text-[12px] text-[#9ca3af]">No deletion requests.</p>
              : deletionQ.data.map(r => (
                <div key={r.id} className="rounded-xl border border-[#f0f1f5] bg-[#fafbfc] px-3 py-2.5 space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] text-[#9ca3af]">#{r.id} · {new Date(r.created_at).toLocaleDateString()}</p>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATUS_COLORS[r.status] ?? ""}`}>
                      {r.status}
                    </span>
                  </div>
                  {r.reason && <p className="text-[11.5px] text-[#374151]">Reason: {r.reason}</p>}
                  {r.status === "pending" && (
                    <div className="flex gap-1.5">
                      <button onClick={()=>updateDeletion.mutate({rid:r.id,status:"approved"})} disabled={updateDeletion.isPending}
                        className="flex-1 rounded-lg border border-red-200 bg-red-50 py-1 text-[11px] font-semibold text-red-600 hover:bg-red-100 transition-colors disabled:opacity-50">
                        Approve
                      </button>
                      <button onClick={()=>updateDeletion.mutate({rid:r.id,status:"rejected"})} disabled={updateDeletion.isPending}
                        className="flex-1 rounded-lg border border-[#e8eaed] py-1 text-[11px] font-semibold text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors disabled:opacity-50">
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}

/* ── Section 5: Timeline ───────────────────────────────────────────────────── */
function TimelineSection({ timeline }: { timeline: U360["timeline"] }) {
  return (
    <SectionCard title="Account Timeline & Admin Actions" number={5}>
      {timeline.length === 0 ? (
        <div className="py-10 text-center">
          <BarChart2 size={32} className="mx-auto text-[#e8eaed] mb-2"/>
          <p className="text-[13px] text-[#9ca3af]">No admin actions recorded for this user.</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#e8eaed] bg-[#f9fafb]">
                {["Date & Time","Action","Performed By","Details","Reference",""].map(h => (
                  <th key={h} className="px-3 py-2.5 text-left text-[11px] font-semibold text-[#6b7280] uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {timeline.map(t => (
                <tr key={t.id} className="hover:bg-[#f9fafb] transition-colors">
                  <td className="px-3 py-3 whitespace-nowrap text-[#9ca3af]">{formatDate(t.created_at)}</td>
                  <td className="px-3 py-3">
                    <span className="font-mono text-[11px] font-semibold text-[#111827] bg-[#f3f4f6] px-2 py-0.5 rounded-md">
                      {t.action.replace(/_/g," ")}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-[#374151]">{t.admin?.name ?? "System"}</td>
                  <td className="px-3 py-3 max-w-[200px] truncate text-[#6b7280]">{t.description}</td>
                  <td className="px-3 py-3 font-mono text-[11px] text-[#9ca3af]">{t.reference}</td>
                  <td className="px-3 py-3">
                    <button className="text-[#fe2c55] text-[11px] font-semibold hover:underline">View</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

/* ── Admin Notes Panel ─────────────────────────────────────────────────────── */
function AdminNotesPanel({ user, qKey }: { user: U360; qKey: string }) {
  const qc = useQueryClient();
  const [draft,  setDraft]  = useState("");
  const [adding, setAdding] = useState(false);
  const [editId, setEditId] = useState<number|null>(null);
  const [editText, setEditText] = useState("");

  const add = useMutation({
    mutationFn: () => adminService.addNote(user.id, draft),
    onSuccess: () => { toast.success("Note added"); setDraft(""); setAdding(false); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError:   () => toast.error("Failed to add note"),
  });
  const upd = useMutation({
    mutationFn: ({ id, text }: { id: number; text: string }) => adminService.updateNote(user.id, id, text),
    onSuccess: () => { toast.success("Note updated"); setEditId(null); setEditText(""); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError:   () => toast.error("Failed to update note"),
  });
  const del = useMutation({
    mutationFn: (id: number) => adminService.deleteNote(user.id, id),
    onSuccess: () => { toast.success("Note deleted"); qc.invalidateQueries({ queryKey: [qKey] }); },
    onError:   () => toast.error("Failed to delete note"),
  });

  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3">
        <p className="text-[13px] font-bold text-[#111827]">Admin Notes</p>
        <button onClick={() => setAdding(v => !v)}
          className="flex items-center gap-1 text-[12px] font-semibold text-[#fe2c55] hover:underline">
          <Plus size={12}/> Add Note
        </button>
      </div>
      {adding && (
        <div className="p-3 border-b border-[#e8eaed]">
          <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={3}
            placeholder="Write admin note…"
            className="w-full rounded-xl border border-[#e8eaed] p-2.5 text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] resize-none"/>
          <div className="mt-2 flex gap-2">
            <Btn variant="primary" disabled={add.isPending || !draft.trim()} onClick={() => add.mutate()}>
              {add.isPending ? "Saving…" : "Save Note"}
            </Btn>
            <Btn variant="ghost" onClick={() => { setAdding(false); setDraft(""); }}>Cancel</Btn>
          </div>
        </div>
      )}
      <div className="divide-y divide-[#f9fafb]">
        {user.admin_notes.length === 0 && !adding && (
          <p className="px-4 py-5 text-[12px] text-[#9ca3af] text-center">No notes yet.</p>
        )}
        {user.admin_notes.map(n => (
          <div key={n.id} className="p-3">
            {editId === n.id ? (
              <div>
                <textarea value={editText} onChange={e => setEditText(e.target.value)} rows={2}
                  className="w-full rounded-xl border border-[#e8eaed] p-2 text-[12px] outline-none focus:border-[#fe2c55] resize-none"/>
                <div className="mt-1.5 flex gap-2">
                  <Btn variant="primary"
                    disabled={upd.isPending || !editText.trim()}
                    onClick={() => upd.mutate({ id: n.id, text: editText })}>
                    {upd.isPending ? "Saving…" : "Save"}
                  </Btn>
                  <Btn variant="ghost" onClick={() => { setEditId(null); setEditText(""); }}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-[12px] text-[#374151] leading-relaxed flex-1">{n.note}</p>
                  <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => { setEditId(n.id); setEditText(n.note); }}
                      className="text-[#d1d5db] hover:text-[#6b7280] transition-colors">
                      <Pencil size={12}/>
                    </button>
                    <button onClick={() => del.mutate(n.id)} disabled={del.isPending}
                      className="text-[#d1d5db] hover:text-red-400 transition-colors">
                      <X size={13}/>
                    </button>
                  </div>
                </div>
                <p className="mt-1.5 text-[10px] text-[#9ca3af]">By {n.admin.name} · {timeAgo(n.created_at)}</p>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Support Tickets ────────────────────────────────────────────────────────── */
const MOCK_TICKETS = [
  { id:"TKT-8971", title:"Account verification", status:"Open",   ago:"1h ago"  },
  { id:"TKT-8862", title:"DM access issue",       status:"Closed", ago:"2d ago"  },
  { id:"TKT-6501", title:"Account suspension",    status:"Closed", ago:"5d ago"  },
];
function SupportTicketsCard() {
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
      <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3">
        <p className="text-[13px] font-bold text-[#111827]">Latest Support Tickets</p>
        <button className="text-[12px] text-[#fe2c55] font-semibold hover:underline">View All</button>
      </div>
      <div className="divide-y divide-[#f9fafb]">
        {MOCK_TICKETS.map(t => (
          <div key={t.id} className="flex items-center justify-between px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-mono font-bold text-[#9ca3af]">{t.id}</span>
                <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold
                  ${t.status==="Open"?"bg-emerald-50 text-emerald-700":"bg-gray-100 text-gray-500"}`}>
                  {t.status}
                </span>
              </div>
              <p className="text-[12px] text-[#374151] mt-0.5 truncate">{t.title}</p>
            </div>
            <span className="text-[11px] text-[#9ca3af] ml-2 shrink-0">{t.ago}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Content Tab ────────────────────────────────────────────────────────────── */
function ContentTab({ user }: { user: U360 }) {
  type VRow = {
    id: number; caption: string | null; thumbnail_url: string | null;
    video_url?: string | null; is_featured?: boolean;
    mime_type?: string | null; media_type?: string | null;
    media_items?: { url: string | null; order: number }[];
    status: string; views_count: number; likes_count: number | null;
    comments_count: number | null; shares_count: number | null;
    duration: number | null; avg_watch_time?: number | null; created_at: string;
    deleted_at?: string | null; previous_status?: string | null;
    deletion_reason?: string | null;
  };
  type FilterKey = "all" | "videos" | "photos" | "drafts" | "private" | "reported" | "deleted";

  const [filter,    setFilter]    = useState<FilterKey>("all");
  const [q,         setQ]         = useState("");
  const [sort,      setSort]      = useState("latest");
  const [visFilter, setVisFilter] = useState("all");
  const [page,      setPage]      = useState(1);
  const [refreshing,      setRefreshing]      = useState(false);
  const [selectedIds,     setSelectedIds]     = useState<Set<number>>(new Set());
  const [bulkDeleting,    setBulkDeleting]    = useState(false);
  const [bulkPermConfirm, setBulkPermConfirm] = useState(false);
  const [openMenu,        setOpenMenu]        = useState<number | null>(null);
  const [menuPos,         setMenuPos]         = useState<{ top: number; right: number } | null>(null);
  const [removeId,        setRemoveId]        = useState<number | null>(null);
  const [permanentId,     setPermanentId]     = useState<number | null>(null);
  const [playVideo,       setPlayVideo]       = useState<{ url: string; caption: string | null } | null>(null);
  const [imgPreview,      setImgPreview]      = useState<{ urls: string[]; caption: string | null } | null>(null);

  const apiParams: Record<string, string | number> = { per_page: 10, user_id: user.id, page };
  if (q)                     apiParams.q            = q;
  if (sort !== "latest")     apiParams.sort         = sort;
  if (filter === "drafts")   apiParams.status       = "draft";
  if (filter === "private")  apiParams.status       = "private";
  if (filter === "reported") apiParams.status       = "reported";
  if (filter === "deleted")  apiParams.status       = "removed";
  if (filter === "videos")   apiParams.content_type = "video";
  if (filter === "photos")   apiParams.content_type = "photo";

  const { data, isLoading } = useQuery({
    queryKey: ["admin-user-content-360", user.id, filter, q, sort, visFilter, page],
    queryFn:  () => adminService.videos(apiParams),
  });
  const qc     = useQueryClient();
  const qkBase = ["admin-user-content-360", user.id];
  const unpublishMut = useMutation({
    mutationFn: (id: number) => adminService.unpublishVideo(id),
    onSuccess: () => { toast.success("Video unpublished"); setOpenMenu(null); qc.invalidateQueries({ queryKey: qkBase }); },
    onError:   () => toast.error("Failed to unpublish"),
  });
  const featureMut = useMutation({
    mutationFn: ({ id, on }: { id: number; on: boolean }) => adminService.featureVideo(id, on),
    onSuccess: (_, vars) => { toast.success(vars.on ? "Video featured" : "Video unfeatured"); setOpenMenu(null); qc.invalidateQueries({ queryKey: qkBase }); },
    onError:   () => toast.error("Failed"),
  });
  const removeMut = useMutation({
    mutationFn: (id: number) => adminService.removeVideo(id),
    onSuccess: () => { toast.success("Video removed"); setRemoveId(null); qc.invalidateQueries({ queryKey: qkBase }); },
    onError:   () => toast.error("Failed to remove"),
  });
  const restoreMut = useMutation({
    mutationFn: (id: number) => adminService.restoreVideo(id),
    onSuccess: () => { toast.success("Video restored"); setOpenMenu(null); qc.invalidateQueries({ queryKey: qkBase }); },
    onError:   () => toast.error("Failed to restore"),
  });
  const permanentDeleteMut = useMutation({
    mutationFn: (id: number) => adminService.permanentDeleteVideo(id),
    onSuccess: () => { toast.success("Video permanently deleted"); setPermanentId(null); qc.invalidateQueries({ queryKey: qkBase }); },
    onError:   () => toast.error("Failed to permanently delete"),
  });

  const items  = (data?.data  ?? []) as VRow[];
  const meta   = data?.meta   ?? {};
  const total  = (meta.total  as number) ?? 0;
  const lastPg = (meta.last_page as number) ?? 1;
  const from   = total === 0 ? 0 : (page - 1) * 10 + 1;
  const to     = Math.min(page * 10, total);
  const cs     = user.content_summary;

  const allSelected  = items.length > 0 && items.every(v => selectedIds.has(v.id));
  const someSelected = selectedIds.size > 0;

  // Clear selection when switching tabs/pages
  useEffect(() => { setSelectedIds(new Set()); }, [filter, q, page]);

  async function handleBulkRemove() {
    if (!selectedIds.size) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map(id => adminService.removeVideo(id)));
    toast.success(`${ids.length} video${ids.length !== 1 ? "s" : ""} removed`);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    qc.invalidateQueries({ queryKey: qkBase });
  }
  async function handleBulkPermanentDelete() {
    if (!selectedIds.size) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map(id => adminService.permanentDeleteVideo(id)));
    toast.success(`${ids.length} video${ids.length !== 1 ? "s" : ""} permanently deleted`);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    setBulkPermConfirm(false);
    qc.invalidateQueries({ queryKey: qkBase });
  }
  async function handleBulkRestore() {
    if (!selectedIds.size) return;
    setBulkDeleting(true);
    const ids = Array.from(selectedIds);
    await Promise.allSettled(ids.map(id => adminService.restoreVideo(id)));
    toast.success(`${ids.length} video${ids.length !== 1 ? "s" : ""} restored`);
    setSelectedIds(new Set());
    setBulkDeleting(false);
    qc.invalidateQueries({ queryKey: qkBase });
  }

  const topPost = items.reduce<VRow | null>(
    (best, v) => (!best || v.views_count > best.views_count ? v : best), null,
  );

  function fmtDur(s: number | null) {
    if (!s) return "-";
    const m = Math.floor(s / 60), sec = s % 60;
    return `${m}:${String(sec).padStart(2, "0")}`;
  }
  function statusCls(st: string, isDeleted?: boolean) {
    if (isDeleted)          return "bg-red-50 text-red-600";
    if (st === "published") return "bg-emerald-50 text-emerald-700";
    if (st === "draft")     return "bg-amber-50 text-amber-700";
    if (st === "reported")  return "bg-red-50 text-red-600";
    return "bg-gray-100 text-gray-500";
  }

  // Classify a row into image / video (authoritative, matches backend derivation).
  function kindOf(v: VRow): "image" | "video" {
    if (v.media_type === "image" || v.media_type === "image_carousel" || v.mime_type?.startsWith("image/")) return "image";
    return "video";
  }
  function openPreview(v: VRow) {
    const kind = kindOf(v);
    if (kind === "video") {
      if (v.video_url) setPlayVideo({ url: v.video_url, caption: v.caption });
      return;
    }
    // image - prefer media_items (carousel order); for a single image fall back to
    // the picked thumbnail, then to the image itself (stored in video_url).
    const list = (v.media_items?.length
      ? v.media_items.map(m => m.url)
      : [v.thumbnail_url ?? v.video_url])
      .filter((u): u is string => !!u);
    if (list.length) setImgPreview({ urls: list, caption: v.caption });
  }

  const FILTERS: { key: FilterKey; label: string }[] = [
    { key: "all",      label: "All"      },
    { key: "videos",   label: "Videos"   },
    { key: "photos",   label: "Photos"   },
    { key: "drafts",   label: "Drafts"   },
    { key: "private",  label: "Private"  },
    { key: "reported", label: "Reported" },
    { key: "deleted",  label: "Deleted"  },
  ];

  const STATS = [
    { icon: <Video size={14}/>,       label: "Total Videos", v: cs.total_videos,    color: "#fe2c55" },
    { icon: <CheckCircle2 size={14}/>,label: "Published",    v: cs.published_videos, color: "#10b981" },
    { icon: <Pause size={14}/>,       label: "Drafts",       v: cs.draft_videos,    color: "#f59e0b" },
    { icon: <Lock size={14}/>,        label: "Private",      v: cs.private_videos,  color: "#6b7280" },
    { icon: <BarChart2 size={14}/>,   label: "Total Views",  v: cs.total_views,     color: "#3b82f6" },
  ];

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-5 gap-3">
        {STATS.map(({ icon, label, v, color }) => (
          <div key={label} className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm p-4">
            <div className="flex items-center justify-between mb-2.5">
              <div className="grid h-8 w-8 place-items-center rounded-xl" style={{ backgroundColor: `${color}18`, color }}>{icon}</div>
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-600">↑ Live</span>
            </div>
            <p className="text-[22px] font-black" style={{ color }}>{formatCompact(v)}</p>
            <p className="text-[11px] text-[#9ca3af] mt-0.5">{label}</p>
          </div>
        ))}
      </div>

      {/* Main layout: table + sidebar */}
      <div className="grid grid-cols-[1fr_256px] gap-4 items-start">
        {/* Table card */}
        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
          {/* Filters + controls */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-[#e8eaed]">
            <div className="flex items-center gap-0.5">
              {FILTERS.map(f => (
                <button
                  key={f.key}
                  onClick={() => { setFilter(f.key); setPage(1); }}
                  className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                    filter === f.key ? "bg-[#fe2c55] text-white" : "text-[#6b7280] hover:bg-[#f4f5f7]"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div className="ml-auto flex items-center gap-2">
              {someSelected && (
                <>
                  <span className="text-[12px] font-semibold text-[#fe2c55] bg-[#fff0f3] px-2.5 py-1 rounded-lg border border-[#fecdd3] whitespace-nowrap">
                    {selectedIds.size} selected
                  </span>
                  <button
                    onClick={handleBulkRestore}
                    disabled={bulkDeleting}
                    title="Restore selected"
                    className="h-8 w-8 rounded-lg border border-emerald-200 bg-emerald-50 flex items-center justify-center text-emerald-600 hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                  ><CheckCircle2 size={13}/></button>
                  <button
                    onClick={handleBulkRemove}
                    disabled={bulkDeleting}
                    title="Remove selected (soft delete)"
                    className="h-8 w-8 rounded-lg border border-orange-200 bg-orange-50 flex items-center justify-center text-orange-500 hover:bg-orange-100 disabled:opacity-50 transition-colors"
                  ><ShieldOff size={13}/></button>
                  <button
                    onClick={() => setBulkPermConfirm(true)}
                    disabled={bulkDeleting}
                    title="Permanently delete selected"
                    className="h-8 w-8 rounded-lg border border-red-200 bg-red-50 flex items-center justify-center text-red-500 hover:bg-red-100 disabled:opacity-50 transition-colors"
                  ><Trash2 size={13}/></button>
                  <button
                    onClick={() => setSelectedIds(new Set())}
                    title="Clear selection"
                    className="h-8 w-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] flex items-center justify-center text-[#9ca3af] hover:text-[#374151] hover:bg-[#f4f5f7] transition-colors"
                  ><X size={13}/></button>
                  <div className="w-px h-5 bg-[#e8eaed]"/>
                </>
              )}
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none" />
                <input
                  className="h-8 w-36 rounded-lg border border-[#e8eaed] bg-[#f9fafb] pl-7 pr-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#fe2c55]/30 focus:border-[#fe2c55]"
                  placeholder="Search caption or ID…"
                  value={q}
                  onChange={e => { setQ(e.target.value); setPage(1); }}
                />
              </div>
              <button
                onClick={() => {
                  setRefreshing(true);
                  qc.invalidateQueries({ queryKey: qkBase });
                  setTimeout(() => setRefreshing(false), 600);
                }}
                className="h-8 w-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] flex items-center justify-center text-[#6b7280] hover:text-[#374151] hover:bg-[#f4f5f7] transition-colors"
                title="Refresh content"
              >
                <RotateCcw size={13} className={refreshing ? "animate-spin" : ""}/>
              </button>
              <select
                value={sort}
                onChange={e => setSort(e.target.value)}
                className="h-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] px-2 text-[12px] text-[#374151] focus:outline-none cursor-pointer"
              >
                <option value="latest">Sort: Latest</option>
                <option value="views">Most Views</option>
                <option value="likes">Most Likes</option>
                <option value="oldest">Oldest</option>
              </select>
              <select
                value={visFilter}
                onChange={e => setVisFilter(e.target.value)}
                className="h-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] px-2 text-[12px] text-[#374151] focus:outline-none cursor-pointer"
              >
                <option value="all">Visibility: All</option>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[640px]">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#fafafa]">
                  <th className="pl-4 pr-1 py-2.5 w-8">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={e => setSelectedIds(e.target.checked ? new Set(items.map(v => v.id)) : new Set())}
                      className="h-3.5 w-3.5 rounded accent-[#fe2c55] cursor-pointer"
                    />
                  </th>
                  {["Content","Type","Status","Visibility","Views","Likes","Comments","Shares","Watch Time", filter === "deleted" ? "Deleted On" : "Published On","Actions"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-[11px] font-semibold text-[#9ca3af] whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {isLoading && (
                  <tr><td colSpan={12} className="py-10 text-center text-[13px] text-[#9ca3af]">Loading…</td></tr>
                )}
                {!isLoading && items.length === 0 && (
                  <tr><td colSpan={12} className="py-10 text-center text-[13px] text-[#9ca3af]">No content found.</td></tr>
                )}
                {items.map(v => (
                  <tr key={v.id} className={`hover:bg-[#fafafa] transition-colors group ${selectedIds.has(v.id) ? "bg-[#fff8f8]" : ""}`}>
                    <td className="pl-4 pr-1 py-2.5 w-8">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(v.id)}
                        onChange={e => {
                          const next = new Set(selectedIds);
                          if (e.target.checked) next.add(v.id); else next.delete(v.id);
                          setSelectedIds(next);
                        }}
                        className="h-3.5 w-3.5 rounded accent-[#fe2c55] cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-[160px] max-w-[200px]">
                        {(() => {
                          const kind   = kindOf(v);
                          const imgSrc = v.thumbnail_url ?? v.media_items?.[0]?.url ?? (kind === "image" ? v.video_url ?? null : null);
                          return (
                        <button
                          onClick={() => openPreview(v)}
                          className="h-11 w-8 shrink-0 rounded-lg bg-[#f3f4f6] overflow-hidden relative group/thumb cursor-pointer"
                          title={kind === "video" ? "Click to play" : "Click to view image"}
                        >
                          {imgSrc ? (
                            <img src={imgSrc} alt="" className="h-full w-full object-cover"/>
                          ) : (
                            <div className="h-full grid place-items-center">
                              {kind === "image"
                                ? <Camera size={11} className="text-[#9ca3af]"/>
                                : <Video size={11} className="text-[#9ca3af]"/>}
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/thumb:opacity-100 transition-opacity flex items-center justify-center">
                            <div className="h-5 w-5 rounded-full bg-white/90 flex items-center justify-center">
                              {kind === "video"
                                ? <svg width="8" height="9" viewBox="0 0 8 9" fill="#111827"><polygon points="2,1 7,4.5 2,8"/></svg>
                                : <Eye size={10} className="text-[#111827]"/>}
                            </div>
                          </div>
                          {kind === "video" && v.duration != null && (
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold text-white bg-black/60 rounded px-0.5 leading-tight">{fmtDur(v.duration)}</span>
                          )}
                          {kind === "image" && (v.media_items?.length ?? 0) > 1 && (
                            <span className="absolute bottom-0.5 right-0.5 text-[8px] font-bold text-white bg-black/60 rounded px-0.5 leading-tight">{v.media_items!.length}</span>
                          )}
                        </button>
                          );
                        })()}
                        <div className="min-w-0">
                          <p className="text-[12px] font-medium text-[#111827] truncate">{v.caption || "Untitled"}</p>
                          <p className="text-[10px] text-[#9ca3af] font-mono">ID: {v.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="grid h-6 w-6 place-items-center rounded-md bg-[#f3f4f6]" title={v.media_type ?? kindOf(v)}>
                        {kindOf(v) === "image"
                          ? <Camera size={11} className="text-[#6b7280]"/>
                          : <Video size={11} className="text-[#6b7280]"/>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusCls(v.status, !!v.deleted_at)}`}>
                        {v.deleted_at ? "Deleted" : v.status}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1 text-[11px] text-[#6b7280] whitespace-nowrap">
                        {v.deleted_at
                          ? <><Trash2 size={10} className="text-red-400"/>Deleted</>
                          : v.status === "private" || v.status === "draft"
                            ? <><Lock size={10} className="text-[#9ca3af]"/>Only me</>
                            : <><Globe size={10} className="text-[#9ca3af]"/>Public</>}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-[12px] font-semibold text-[#374151]">{formatCompact(v.views_count)}</td>
                    <td className="px-3 py-2.5 text-[12px] text-[#374151]">{v.likes_count != null ? formatCompact(v.likes_count) : "-"}</td>
                    <td className="px-3 py-2.5 text-[12px] text-[#374151]">{v.comments_count != null ? formatCompact(v.comments_count) : "-"}</td>
                    <td className="px-3 py-2.5 text-[12px] text-[#374151]">{v.shares_count != null ? formatCompact(v.shares_count) : "-"}</td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <p className="text-[11px] font-semibold text-[#374151]">
                        {v.avg_watch_time != null ? fmtDur(v.avg_watch_time) : "-"}
                      </p>
                      {v.duration != null && (
                        <p className="text-[10px] text-[#9ca3af]">of {fmtDur(v.duration)}</p>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      {filter === "deleted" && v.deleted_at ? (
                        <>
                          <p className="text-[11px] text-red-500">{formatDate(v.deleted_at)}</p>
                          <p className="text-[10px] text-[#9ca3af]">{timeAgo(v.deleted_at)}</p>
                        </>
                      ) : (
                        <>
                          <p className="text-[11px] text-[#374151]">{formatDate(v.created_at)}</p>
                          <p className="text-[10px] text-[#9ca3af]">{timeAgo(v.created_at)}</p>
                        </>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-opacity">
                        {v.deleted_at ? (
                          <button className="p-1.5 rounded-lg text-[#d1d5db] cursor-not-allowed" title="Deleted - not visible on site" disabled><Eye size={13}/></button>
                        ) : (
                          <a
                            href={`${process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live"}/videos/${v.id}`}
                            target="_blank" rel="noreferrer"
                            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#374151] hover:bg-[#f4f5f7]" title="View on site"
                          ><Eye size={13}/></a>
                        )}
                        <button className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#374151] hover:bg-[#f4f5f7]" title="Analytics"><BarChart2 size={13}/></button>
                        <a href={`/admin/videos/${v.id}/edit`} className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#fe2c55] hover:bg-[#fff0f3]" title="Edit"><Pencil size={13}/></a>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openMenu === v.id) { setOpenMenu(null); setMenuPos(null); return; }
                            const r = e.currentTarget.getBoundingClientRect();
                            setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
                            setOpenMenu(v.id);
                          }}
                          className={`p-1.5 rounded-lg transition-colors ${openMenu === v.id ? "bg-[#f4f5f7] text-[#374151]" : "text-[#6b7280] hover:text-[#374151] hover:bg-[#f4f5f7]"}`}
                          title="More actions"
                        ><MoreVertical size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 0 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8eaed]">
              <p className="text-[12px] text-[#9ca3af]">Showing {from}–{to} of {formatCompact(total)} results</p>
              <div className="flex items-center gap-1">
                <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page<=1} className="h-7 px-2.5 rounded-lg border border-[#e8eaed] text-[13px] text-[#6b7280] hover:bg-[#f4f5f7] disabled:opacity-40 disabled:cursor-not-allowed">‹</button>
                {Array.from({ length: Math.min(5, lastPg) }, (_, i) => {
                  const pg = lastPg <= 5 ? i+1 : page <= 3 ? i+1 : page >= lastPg-2 ? lastPg-4+i : page-2+i;
                  return <button key={pg} onClick={() => setPage(pg)} className={`h-7 w-7 rounded-lg text-[12px] font-semibold transition-colors ${page===pg ? "bg-[#fe2c55] text-white" : "border border-[#e8eaed] text-[#6b7280] hover:bg-[#f4f5f7]"}`}>{pg}</button>;
                })}
                {lastPg > 5 && page < lastPg-2 && (
                  <><span className="text-[#9ca3af] text-[12px] px-0.5">…</span><button onClick={() => setPage(lastPg)} className="h-7 w-7 rounded-lg border border-[#e8eaed] text-[12px] font-semibold text-[#6b7280] hover:bg-[#f4f5f7]">{lastPg}</button></>
                )}
                <button onClick={() => setPage(p => Math.min(lastPg, p+1))} disabled={page>=lastPg} className="h-7 px-2.5 rounded-lg border border-[#e8eaed] text-[13px] text-[#6b7280] hover:bg-[#f4f5f7] disabled:opacity-40 disabled:cursor-not-allowed">›</button>
              </div>
            </div>
          )}
        </div>

        {/* Content Insights sidebar */}
        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
          <div className="px-4 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
            <TrendingUp size={14} className="text-[#fe2c55]"/>
            <h3 className="text-[13px] font-bold text-[#111827]">Content Insights</h3>
          </div>

          <div className="px-4 py-3 border-b border-[#f3f4f6]">
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Top Performing Post</p>
            {topPost ? (
              <div className="flex items-center gap-2">
                <div className="h-10 w-7 shrink-0 rounded-lg overflow-hidden bg-[#f3f4f6]">
                  {topPost.thumbnail_url
                    ? <img src={topPost.thumbnail_url} alt="" className="h-full w-full object-cover"/>
                    : <div className="h-full grid place-items-center"><Video size={10} className="text-[#9ca3af]"/></div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-semibold text-[#111827] truncate">{topPost.caption || "Untitled"}</p>
                  <p className="text-[11px] text-[#9ca3af]">{formatCompact(topPost.views_count)} views · {topPost.likes_count != null ? formatCompact(topPost.likes_count) : "-"} likes</p>
                </div>
              </div>
            ) : <p className="text-[12px] text-[#9ca3af]">No posts yet.</p>}
          </div>

          <div className="px-4 py-3 border-b border-[#f3f4f6]">
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Most Used Category</p>
            {user.categories?.length > 0 ? (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-semibold bg-[#fff0f3] text-[#fe2c55] px-2.5 py-1 rounded-full">{user.categories[0]}</span>
                <span className="text-[11px] text-[#9ca3af]">{cs.total_videos} posts (46.8%)</span>
              </div>
            ) : <p className="text-[12px] text-[#9ca3af]">No category set.</p>}
          </div>

          <div className="px-4 py-3 border-b border-[#f3f4f6]">
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-1.5">Last Upload</p>
            <div className="flex items-center gap-1.5 text-[12px] text-[#374151]">
              <Calendar size={12} className="text-[#9ca3af] shrink-0"/>
              {items[0] ? formatDate(items[0].created_at) : "-"}
            </div>
          </div>

          <div className="px-4 py-3 border-b border-[#f3f4f6]">
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Copyright & Content Check</p>
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle2 size={13} className="text-emerald-500 shrink-0"/>
              <span className="text-[12px] font-semibold text-emerald-600">No issues detected</span>
            </div>
            <p className="text-[11px] text-[#9ca3af]">Scanned {items[0] ? timeAgo(items[0].created_at) : "-"}</p>
          </div>

          <div className="px-4 py-3">
            <p className="text-[10px] font-bold text-[#9ca3af] uppercase tracking-wide mb-2">Summary</p>
            {[
              ["Avg Views",   formatCompact(cs.avg_views)],
              ["Total Likes", formatCompact(cs.total_likes)],
              ["Comments",    formatCompact(cs.total_comments)],
              ["Watch Time",  `${formatCompact(cs.watch_time_mins)} min`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between text-[12px] py-1.5 border-b border-[#f3f4f6] last:border-0">
                <span className="text-[#9ca3af]">{k}</span>
                <span className="font-semibold text-[#374151]">{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Click-outside overlay closes the dropdown */}
      {openMenu !== null && (
        <div className="fixed inset-0 z-[9998]" onClick={() => { setOpenMenu(null); setMenuPos(null); }}/>
      )}

      {/* Global fixed dropdown - flex-col ensures items never overlap */}
      {openMenu !== null && menuPos !== null && (() => {
        const v = items.find(x => x.id === openMenu);
        if (!v) return null;
        const frontendBase = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live";
        return (
          <div
            style={{ position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
            className="bg-white rounded-xl border border-[#e8eaed] shadow-2xl py-1.5 w-52 flex flex-col"
          >
            {v.deleted_at ? (
              <div className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-[#d1d5db] cursor-not-allowed select-none">
                <ExternalLink size={13} className="shrink-0 text-[#d1d5db]"/>
                <span className="flex-1">View on Site</span>
                <span className="text-[10px] bg-red-50 text-red-400 px-1.5 py-0.5 rounded-full">Deleted</span>
              </div>
            ) : (
              <a href={`${frontendBase}/videos/${v.id}`} target="_blank" rel="noreferrer"
                onClick={() => { setOpenMenu(null); setMenuPos(null); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                <ExternalLink size={13} className="shrink-0 text-[#9ca3af]"/>
                <span>View on Site</span>
              </a>
            )}
            {v.video_url && (
              <button onClick={() => { setPlayVideo({ url: v.video_url!, caption: v.caption }); setOpenMenu(null); setMenuPos(null); }}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                <Eye size={13} className="shrink-0 text-[#9ca3af]"/>
                <span>Play Video</span>
              </button>
            )}
            <a href={`/admin/videos/${v.id}/edit`} onClick={() => { setOpenMenu(null); setMenuPos(null); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-[#374151] hover:bg-[#f4f5f7] transition-colors">
              <Pencil size={13} className="shrink-0 text-[#9ca3af]"/>
              <span>Edit Details</span>
            </a>
            {!v.deleted_at && (
              <button onClick={() => { featureMut.mutate({ id: v.id, on: !v.is_featured }); setOpenMenu(null); setMenuPos(null); }}
                disabled={featureMut.isPending}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-[#374151] hover:bg-[#f4f5f7] transition-colors disabled:opacity-50">
                <Star size={13} className="shrink-0 text-[#9ca3af]"/>
                <span>{v.is_featured ? "Unfeature" : "Feature Video"}</span>
              </button>
            )}
            <div className="my-1 border-t border-[#f3f4f6]"/>
            {v.deleted_at ? (
              <>
                <button onClick={() => { restoreMut.mutate(v.id); setOpenMenu(null); setMenuPos(null); }}
                  disabled={restoreMut.isPending}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                  <CheckCircle2 size={13} className="shrink-0 text-emerald-500"/>
                  <span>Restore Video</span>
                </button>
                <div className="my-1 border-t border-[#f3f4f6]"/>
                <button onClick={() => { setOpenMenu(null); setMenuPos(null); setPermanentId(v.id); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={13} className="shrink-0 text-red-400"/>
                  <span>Permanently Delete</span>
                </button>
              </>
            ) : (
              <>
                {v.status === "published" ? (
                  <button onClick={() => { unpublishMut.mutate(v.id); setOpenMenu(null); setMenuPos(null); }}
                    disabled={unpublishMut.isPending}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-amber-600 hover:bg-amber-50 transition-colors disabled:opacity-50">
                    <ShieldOff size={13} className="shrink-0 text-amber-400"/>
                    <span>Unpublish</span>
                  </button>
                ) : (
                  <button onClick={() => { restoreMut.mutate(v.id); setOpenMenu(null); setMenuPos(null); }}
                    disabled={restoreMut.isPending}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                    <CheckCircle2 size={13} className="shrink-0 text-emerald-500"/>
                    <span>Restore Video</span>
                  </button>
                )}
                <div className="my-1 border-t border-[#f3f4f6]"/>
                <button onClick={() => { setOpenMenu(null); setMenuPos(null); setRemoveId(v.id); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-orange-600 hover:bg-orange-50 transition-colors">
                  <ShieldOff size={13} className="shrink-0 text-orange-400"/>
                  <span>Remove from Account</span>
                </button>
                <button onClick={() => { setOpenMenu(null); setMenuPos(null); setPermanentId(v.id); }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[12px] font-medium text-red-600 hover:bg-red-50 transition-colors">
                  <Trash2 size={13} className="shrink-0 text-red-400"/>
                  <span>Delete Permanently</span>
                </button>
              </>

            )}
          </div>
        );
      })()}

      {/* Video popup player */}
      {playVideo && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setPlayVideo(null)}>
          <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setPlayVideo(null)}
              className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
              <X size={14}/>
            </button>
            <video
              key={playVideo.url}
              src={playVideo.url}
              controls
              autoPlay
              muted
              playsInline
              className="w-full max-h-[70vh] object-contain bg-black"
              style={{ aspectRatio: "9/16" }}
            />
            {playVideo.caption && (
              <div className="px-4 py-3 bg-[#111]">
                <p className="text-[12px] text-white/80 line-clamp-2">{playVideo.caption}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Image preview popup */}
      {imgPreview && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" onClick={() => setImgPreview(null)}>
          <div className="relative bg-black rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full" onClick={e => e.stopPropagation()}>
            <button onClick={() => setImgPreview(null)}
              className="absolute top-3 right-3 z-10 h-7 w-7 rounded-full bg-black/60 text-white flex items-center justify-center hover:bg-black/80 transition-colors">
              <X size={14}/>
            </button>
            <div className="max-h-[70vh] overflow-y-auto bg-black flex flex-col items-center gap-1">
              {imgPreview.urls.map((u, i) => (
                <img key={i} src={u} alt="" className="w-full object-contain" style={{ aspectRatio: imgPreview.urls.length === 1 ? "9/16" : undefined }}/>
              ))}
            </div>
            {imgPreview.urls.length > 1 && (
              <span className="absolute top-3 left-3 z-10 text-[11px] font-semibold text-white bg-black/60 rounded-full px-2 py-0.5">{imgPreview.urls.length} images</span>
            )}
            {imgPreview.caption && (
              <div className="px-4 py-3 bg-[#111]">
                <p className="text-[12px] text-white/80 line-clamp-2">{imgPreview.caption}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Remove video confirmation */}
      <Modal
        open={removeId !== null}
        title="Remove Video"
        message="This soft-deletes the video and removes it from all feeds and search. The creator will not be notified."
        confirmLabel="Remove Video"
        danger
        loading={removeMut.isPending}
        onConfirm={() => { if (removeId !== null) removeMut.mutate(removeId); }}
        onCancel={() => setRemoveId(null)}
      />

      {/* Bulk permanent delete confirmation */}
      <Modal
        open={bulkPermConfirm}
        title={`Permanently Delete ${selectedIds.size} Video${selectedIds.size !== 1 ? "s" : ""}`}
        message={`This will permanently delete ${selectedIds.size} video${selectedIds.size !== 1 ? "s" : ""} from the database and remove all media files from storage. This cannot be undone.`}
        confirmLabel="Delete Forever"
        danger
        loading={bulkDeleting}
        onConfirm={handleBulkPermanentDelete}
        onCancel={() => setBulkPermConfirm(false)}
      />

      {/* Permanent delete confirmation */}
      <Modal
        open={permanentId !== null}
        title="Permanently Delete Video"
        message="This will delete the video from the database AND remove all media files from R2 storage. This action cannot be undone."
        confirmLabel="Delete Forever"
        danger
        loading={permanentDeleteMut.isPending}
        onConfirm={() => { if (permanentId !== null) permanentDeleteMut.mutate(permanentId); }}
        onCancel={() => setPermanentId(null)}
      />
    </div>
  );
}

/* ── Other Tabs ─────────────────────────────────────────────────────────────── */
function DevicesTab({ user }: { user: U360 }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[#e8eaed]"><h3 className="text-[13px] font-bold text-[#111827]">Devices & Login Sessions</h3></div>
      <div className="divide-y divide-[#f3f4f6]">
        {user.devices.length===0 && <div className="py-10 text-center text-[13px] text-[#9ca3af]">No devices registered.</div>}
        {user.devices.map(d => (
          <div key={d.id} className="flex items-center gap-3 px-5 py-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#f3f4f6]">
              <Smartphone size={15} className="text-[#6b7280]"/>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium text-[#111827] capitalize">{d.device_type}</p>
              <p className="text-[11px] text-[#9ca3af] font-mono truncate">{d.device_id}</p>
            </div>
            <span className="text-[11px] text-[#9ca3af]">Last seen {timeAgo(d.last_seen)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Security Tab ────────────────────────────────────────────────────────────
   Was a read-only pair of cards with "2FA Status: -" hardcoded and a "Linked
   Devices" row counting push-notification registrations. Both are corrected
   here: 2FA reads its real state, and the push table is labelled as what it
   holds. Sessions are Sanctum tokens, which is what an app login creates.

   Every state-changing control confirms first and carries a reason into the
   admin audit log, because each of these can lock a real person out. ── */

type SecAction =
  | "revoke_sessions" | "revoke_session" | "disable_2fa" | "lock_account"
  | "unlock_account"  | "require_email_verification" | "clear_push_devices";

type SecSession = {
  id: number; name: string;
  last_used_at: string | null; created_at: string | null;
  expires_at: string | null; is_expired: boolean;
};

type SecData = {
  auth: {
    email: string | null; email_verified: boolean; email_verified_at: string | null;
    phone: string | null; phone_on_file: boolean;
    two_factor: boolean; two_factor_since: string | null; recovery_codes: number;
    password_changed_at: string | null; last_login_at: string | null; last_active_at: string | null;
  };
  access: {
    is_active: boolean; is_banned: boolean; ban_reason: string | null;
    suspended_until: string | null; is_private: boolean;
  };
  sessions: SecSession[];
  push_devices: { id: number; platform: string; registered: string | null; updated_at: string | null }[];
  location: {
    selected_country_code: string | null; selected_country_name: string | null;
    signup_country: string | null; seen_countries: string[];
  };
};

const SEC_COPY: Record<SecAction, { title: string; message: string; confirm: string; danger: boolean }> = {
  revoke_sessions:            { title: "Sign out everywhere",       message: "Ends every active session. The user must log in again on all devices.", confirm: "Sign out all", danger: true  },
  revoke_session:             { title: "Revoke this session",       message: "Ends this one session. Other devices stay signed in.",                  confirm: "Revoke",       danger: true  },
  disable_2fa:                { title: "Disable two-factor",        message: "Removes 2FA and its recovery codes. Only do this to restore access to a locked-out owner.", confirm: "Disable 2FA", danger: true },
  lock_account:               { title: "Lock account",              message: "Marks the account inactive and ends every session immediately.",         confirm: "Lock account", danger: true  },
  unlock_account:             { title: "Unlock account",            message: "Restores access. The user can sign in again straight away.",             confirm: "Unlock",       danger: false },
  require_email_verification: { title: "Require email re-verification", message: "Marks the email unverified. The user must verify it again.",         confirm: "Require",      danger: false },
  clear_push_devices:         { title: "Clear push registrations",  message: "Removes stored push tokens. The user stops receiving notifications until the app re-registers.", confirm: "Clear", danger: false },
};

/** One label/value line. `tone` colours only the value, so the row still scans
    as a list rather than as a wall of coloured text. */
function SecRow({ label, value, tone, badge }: {
  label: string; value: string; tone?: "good" | "warn" | "bad"; badge?: { text: string; tone: "good" | "warn" | "bad" };
}) {
  const toneCls = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-[#111827]";
  const badgeCls = badge?.tone === "good" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                 : badge?.tone === "bad"  ? "bg-red-50 text-red-600 border-red-200"
                 : "bg-amber-50 text-amber-700 border-amber-200";
  return (
    <div className="flex items-center justify-between gap-3 py-2 border-b border-[#f3f4f6] last:border-0">
      <span className="text-[12px] text-[#9ca3af] shrink-0">{label}</span>
      <div className="flex items-center gap-2 min-w-0">
        <span className={`text-[12.5px] font-medium truncate ${toneCls}`}>{value}</span>
        {badge && (
          <span className={`shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-bold ${badgeCls}`}>{badge.text}</span>
        )}
      </div>
    </div>
  );
}

function SecurityTab({ user }: { user: U360 }) {
  const qc = useQueryClient();
  const [pending, setPending] = useState<{ action: SecAction; tokenId?: number } | null>(null);
  const [reason,  setReason]  = useState("");

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["admin-user-security", user.id],
    queryFn:  () => api.get(`/admin/users/${user.id}/security`).then(r => r.data?.data as SecData),
    staleTime: 30_000,
  });

  const act = useMutation({
    mutationFn: ({ action, tokenId }: { action: SecAction; tokenId?: number }) =>
      api.post(`/admin/users/${user.id}/security/action`, {
        action,
        ...(tokenId ? { token_id: tokenId } : {}),
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Done");
      setPending(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-user-security", user.id] });
      qc.invalidateQueries({ queryKey: ["user360", user.id] });
    },
    onError: () => toast.error("Action failed"),
  });

  const ask = (action: SecAction, tokenId?: number) => { setReason(""); setPending({ action, tokenId }); };

  if (isLoading) {
    return (
      <div className="grid gap-4 sm:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm p-5 space-y-3">
            <div className="h-3 w-32 rounded bg-[#f3f4f6] animate-pulse"/>
            {Array.from({ length: 4 }).map((__, j) => (
              <div key={j} className="h-2.5 w-full rounded bg-[#f6f7f8] animate-pulse"/>
            ))}
          </div>
        ))}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm py-16 flex flex-col items-center text-[#9ca3af]">
        <ShieldAlert size={36} className="mb-3 opacity-30"/>
        <p className="text-[13px] font-semibold text-[#374151]">Security data unavailable</p>
        <Btn variant="outline" className="mt-3" onClick={() => refetch()}><RefreshCw size={12}/>Retry</Btn>
      </div>
    );
  }

  const a = data.auth;
  const x = data.access;
  const liveSessions = data.sessions.filter(s => !s.is_expired);

  return (
    <div className="space-y-4">
      {/* ── Posture strip: the four things worth knowing at a glance ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: "Account",   value: x.is_banned ? "Banned" : x.is_active ? "Active" : "Locked",
            tone: x.is_banned || !x.is_active ? "bad" : "good", icon: <UserCheck size={15}/> },
          { label: "Two-factor", value: a.two_factor ? "Enabled" : "Not enabled",
            tone: a.two_factor ? "good" : "warn", icon: <ShieldCheck size={15}/> },
          { label: "Email",      value: a.email_verified ? "Verified" : "Unverified",
            tone: a.email_verified ? "good" : "warn", icon: <Mail size={15}/> },
          { label: "Sessions",   value: String(liveSessions.length),
            tone: liveSessions.length > 5 ? "warn" : "good", icon: <Smartphone size={15}/> },
        ].map(s => {
          const tint = s.tone === "good" ? "#16a34a" : s.tone === "warn" ? "#f59e0b" : "#ef4444";
          return (
            <div key={s.label} className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm p-4 flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${tint}1a`, color: tint }}>
                {s.icon}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#9ca3af]">{s.label}</p>
                <p className="text-[15px] font-black truncate" style={{ color: tint }}>{s.value}</p>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ── 1. Authentication ── */}
        <SectionCard title="Authentication" number={1}>
          <SecRow label="Email" value={a.email || "-"}
            badge={{ text: a.email_verified ? "Verified" : "Unverified", tone: a.email_verified ? "good" : "warn" }}/>
          {/* No phone-verification field exists on the platform, so this states
              presence only rather than implying a verified number. */}
          <SecRow label="Phone" value={a.phone || "Not set"}
            badge={a.phone_on_file ? { text: "On file", tone: "good" } : undefined}/>
          <SecRow label="Two-factor"
            value={a.two_factor ? `Enabled${a.two_factor_since ? ` — since ${formatDate(a.two_factor_since)}` : ""}` : "Not enabled"}
            tone={a.two_factor ? "good" : "warn"}/>
          <SecRow label="Recovery codes"
            value={a.recovery_codes < 0 ? "Unreadable" : a.two_factor ? `${a.recovery_codes} remaining` : "-"}
            tone={a.recovery_codes === 0 && a.two_factor ? "warn" : undefined}/>
          <SecRow label="Password changed" value={a.password_changed_at ? timeAgo(a.password_changed_at) : "Never recorded"}/>
          <SecRow label="Last login"  value={a.last_login_at  ? timeAgo(a.last_login_at)  : "-"}/>
          <SecRow label="Last active" value={a.last_active_at ? timeAgo(a.last_active_at) : "-"}/>

          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[#f3f4f6]">
            {a.two_factor && (
              <Btn variant="danger" onClick={() => ask("disable_2fa")}><ShieldOff size={12}/>Disable 2FA</Btn>
            )}
            {a.email_verified && (
              <Btn variant="outline" onClick={() => ask("require_email_verification")}><Mail size={12}/>Require re-verification</Btn>
            )}
          </div>
        </SectionCard>

        {/* ── 2. Account access ── */}
        <SectionCard title="Account Access" number={2}>
          <SecRow label="Status" value={x.is_active ? "Active" : "Locked"} tone={x.is_active ? "good" : "bad"}/>
          <SecRow label="Banned" value={x.is_banned ? "Yes" : "No"} tone={x.is_banned ? "bad" : "good"}/>
          {x.ban_reason && <SecRow label="Ban reason" value={x.ban_reason}/>}
          <SecRow label="Suspended until" value={x.suspended_until ? formatDate(x.suspended_until) : "-"}
            tone={x.suspended_until ? "warn" : undefined}/>
          <SecRow label="Private account" value={x.is_private ? "Yes" : "No"}/>

          <div className="flex flex-wrap gap-2 mt-4 pt-3 border-t border-[#f3f4f6]">
            {x.is_active
              ? <Btn variant="danger"  onClick={() => ask("lock_account")}><Lock size={12}/>Lock account</Btn>
              : <Btn variant="success" onClick={() => ask("unlock_account")}><CheckCircle2 size={12}/>Unlock account</Btn>}
            {liveSessions.length > 0 && (
              <Btn variant="warning" onClick={() => ask("revoke_sessions")}><ShieldOff size={12}/>Sign out everywhere</Btn>
            )}
          </div>
          <p className="text-[11px] text-[#9ca3af] mt-3 leading-relaxed">
            Locking ends every session at once — an account left active with live tokens keeps working in the app.
            Bans and suspensions are set from the Overview tab&apos;s moderation card.
          </p>
        </SectionCard>
      </div>

      {/* ── 3. Sessions ── */}
      <SectionCard title="Active Sessions" number={3}
        action={liveSessions.length > 0
          ? <Btn variant="outline" onClick={() => ask("revoke_sessions")}><ShieldOff size={12}/>Revoke all</Btn>
          : undefined}>
        {data.sessions.length === 0 ? (
          <p className="text-[12px] text-[#9ca3af] py-6 text-center">No active sessions — this account is not signed in anywhere.</p>
        ) : (
          <div className="divide-y divide-[#f3f4f6] -my-1">
            {data.sessions.map(s => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`h-8 w-8 rounded-xl flex items-center justify-center shrink-0 ${s.is_expired ? "bg-[#f3f4f6] text-[#9ca3af]" : "bg-[#fe2c55]/10 text-[#fe2c55]"}`}>
                    <Smartphone size={14}/>
                  </div>
                  <div className="min-w-0">
                    <p className="text-[12.5px] font-medium text-[#111827] truncate">{s.name || "Unnamed session"}</p>
                    <p className="text-[10.5px] text-[#9ca3af]">
                      {s.last_used_at ? `Last used ${timeAgo(s.last_used_at)}` : "Never used"}
                      {s.created_at ? ` · created ${formatDate(s.created_at)}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {s.is_expired && (
                    <span className="rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-bold text-[#6b7280]">Expired</span>
                  )}
                  <button onClick={() => ask("revoke_session", s.id)} title="Revoke session"
                    className="h-7 w-7 rounded-lg flex items-center justify-center border border-[#e8eaed] text-[#9ca3af] hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-colors">
                    <XCircle size={12}/>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 4. Push registrations ── */}
      <SectionCard title="Push Notification Registrations" number={4}
        action={data.push_devices.length > 0
          ? <Btn variant="outline" onClick={() => ask("clear_push_devices")}><Trash2 size={12}/>Clear all</Btn>
          : undefined}>
        <p className="text-[11px] text-[#9ca3af] mb-3 leading-relaxed">
          These are push-notification tokens, not login sessions — clearing them stops notifications
          until the app registers again, and does not sign anyone out. Sessions are listed above.
        </p>
        {data.push_devices.length === 0 ? (
          <p className="text-[12px] text-[#9ca3af] py-4 text-center">No push registrations.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {data.push_devices.map(d => (
              <div key={d.id} className="flex items-center gap-2 rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2">
                <Smartphone size={13} className="text-[#6b7280]"/>
                <div>
                  <p className="text-[12px] font-medium text-[#111827] capitalize">{d.platform}</p>
                  <p className="text-[10px] text-[#9ca3af]">{d.registered ? formatDate(d.registered) : "-"}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* ── 5. Location ── */}
      <SectionCard title="Location &amp; Risk Signals" number={5}>
        <SecRow label="Selected country" value={data.location.selected_country_name || data.location.selected_country_code || "-"}/>
        <SecRow label="Signup country"   value={data.location.signup_country || "-"}/>
        <div className="pt-3">
          <p className="text-[12px] text-[#9ca3af] mb-2">Countries seen on this account</p>
          {data.location.seen_countries.length === 0 ? (
            <p className="text-[12px] text-[#9ca3af]">No location data recorded.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {data.location.seen_countries.map(c => (
                <span key={c} className="rounded-full border border-[#e8eaed] bg-[#f9fafb] px-2 py-0.5 text-[11px] font-medium text-[#374151]">{c}</span>
              ))}
            </div>
          )}
          {data.location.seen_countries.length > 3 && (
            <p className="text-[11px] text-amber-600 mt-2 flex items-center gap-1">
              <AlertTriangle size={11}/>
              Activity from {data.location.seen_countries.length} countries — worth checking for a shared login.
            </p>
          )}
        </div>
      </SectionCard>

      <Modal
        open={!!pending}
        title={pending ? SEC_COPY[pending.action].title : ""}
        message={pending ? SEC_COPY[pending.action].message : ""}
        confirmLabel={pending ? SEC_COPY[pending.action].confirm : ""}
        danger={pending ? SEC_COPY[pending.action].danger : false}
        loading={act.isPending}
        onCancel={() => { setPending(null); setReason(""); }}
        onConfirm={() => pending && act.mutate(pending)}>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
          placeholder="Reason (optional) - shown in the audit log"
          className="w-full rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2 text-[12px] text-[#111827] resize-none focus:outline-none focus:border-[#fe2c55]"/>
      </Modal>
    </div>
  );
}

type MonSource = { source: string; label: string; amount: number; pct: number };
type PayoutMethodRow = { id: number; provider: string; label: string; account: string | null; primary: boolean; added_at: string | null };
type PayoutRow = { id: number; code: string; amount: number; currency: string; status: string; method: string; account: string | null; requested_on: string | null; paid_on: string | null; scheduled_at: string | null; transaction_id: string; failure_reason: string | null };
type MonData = {
  summary: { total_earnings: number; available_balance: number; pending_balance: number; paid_out: number; total_payouts: number; hold_balance: number; currency: string };
  earnings_breakdown: { total: number; sources: MonSource[] };
  payout_methods: PayoutMethodRow[];
  tax: { form_type: string | null; entity_kind: string; status: string; status_label: string; submitted_at: string | null; tax_id: string | null; country: string | null; documents: TaxDoc[] } | null;
  payout_history: PayoutRow[];
  payout_requests: PayoutRow[];
  creator_level: { level_number: number; level_name: string; current_xp: number; min_xp: number; max_xp: number } | null;
  performance: { earnings: number; impressions: number; engagement: number; subscribers: number; series: { date: string; amount: number }[] };
  controls: { enabled: boolean; account_standing: boolean };
  settings: { payout_threshold: number; auto_payout: boolean; payout_schedule: string; currency: string; earnings_visibility: string; allow_gifts: boolean; allow_subscriptions: boolean; allow_ad_revenue: boolean; allow_brand_deals: boolean; monetization_since: string | null };
  note: string | null;
  recent_activity: { type: string; text: string; at: string | null }[];
};

const DONUT_COLORS = ["#fe2c55", "#8b5cf6", "#3b82f6", "#16a34a", "#f59e0b", "#ec4899", "#06b6d4"];

function MonetizationTab({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const [noteLoaded, setNoteLoaded] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["user-monetization", userId], queryFn: () => adminService.userMonetization(userId) as Promise<MonData> });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["user-monetization", userId] });
  const onErr = (e: unknown) => toast.error(apiMessage(e));

  useEffect(() => { if (data && !noteLoaded) { setNote(data.note ?? ""); setNoteLoaded(true); } }, [data, noteLoaded]);

  const statusM = useMutation({ mutationFn: (action: "pause" | "ban" | "reset" | "enable") => adminService.updateMonetizationStatus(userId, action), onSuccess: () => { invalidate(); toast.success("Monetization updated."); }, onError: onErr });
  const settingM = useMutation({ mutationFn: (patch: Record<string, boolean>) => adminService.updateMonetizationSetting(userId, patch), onSuccess: invalidate, onError: onErr });
  const noteM = useMutation({ mutationFn: () => adminService.saveMonetizationNote(userId, note), onSuccess: () => toast.success("Note saved."), onError: onErr });
  const payoutM = useMutation({ mutationFn: ({ pid, action, reason }: { pid: number; action: "approve" | "complete" | "reject"; reason?: string }) => adminService.updatePayoutRequest(userId, pid, action, reason), onSuccess: (r: { message?: string }) => { invalidate(); toast.success(r?.message ?? "Payout updated."); }, onError: onErr });

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#d1d5db]" /></div>;

  const s = data?.summary;
  const bd = data?.earnings_breakdown;
  const settings = data?.settings;
  const enabled = data?.controls?.enabled ?? true;
  const lvl = data?.creator_level;
  const perf = data?.performance;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-3">
      {/* ── Main column ── */}
      <div className="space-y-4 lg:col-span-2">
        {/* Summary stat cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <FundStat icon={Wallet} tint="#8b5cf6" label="Total Earnings" value={usd(s?.total_earnings ?? 0)} sub="All time" />
          <FundStat icon={DollarSign} tint="#16a34a" label="Available Balance" value={usd(s?.available_balance ?? 0)} sub="Ready for payout" />
          <FundStat icon={Clock} tint="#f59e0b" label="Pending Balance" value={usd(s?.pending_balance ?? 0)} sub="Clearing" />
          <FundStat icon={ArrowUpRight} tint="#3b82f6" label="Paid Out" value={usd(s?.paid_out ?? 0)} sub="All time" />
          <FundStat icon={Receipt} tint="#fe2c55" label="Total Payouts" value={String(s?.total_payouts ?? 0)} sub="Completed" />
          <FundStat icon={Lock} tint="#6b7280" label="Hold Balance" value={usd(s?.hold_balance ?? 0)} sub="Under review" />
        </div>

        {/* Payout requests (pending withdrawals to action) */}
        {(data?.payout_requests ?? []).length > 0 && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/40 p-5 shadow-sm">
            <div className="mb-2 flex items-center gap-2">
              <Clock className="h-4 w-4 text-amber-600" />
              <h3 className="text-[15px] font-bold text-[#111827]">Payout Requests</h3>
              <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">{data?.payout_requests.length} pending</span>
            </div>
            <div className="space-y-2">
              {data?.payout_requests.map((p) => (
                <div key={p.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[#e8eaed] bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="text-[13px] font-bold text-[#111827]">{usd(p.amount)}</span><PayoutBadge status={p.status} /></div>
                    <p className="text-[11px] text-[#9ca3af]">{p.code} · {p.method}{p.account ? ` · ${p.account}` : ""} · requested {p.requested_on ? timeAgo(p.requested_on) : "-"}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {p.status === "pending" && <button disabled={payoutM.isPending} onClick={() => payoutM.mutate({ pid: p.id, action: "approve" })} className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Approve</button>}
                    <button disabled={payoutM.isPending} onClick={() => payoutM.mutate({ pid: p.id, action: "complete" })} className="rounded-lg bg-green-600 px-2.5 py-1.5 text-[11px] font-semibold text-white hover:bg-green-700 disabled:opacity-50">Mark Paid</button>
                    <button disabled={payoutM.isPending} onClick={() => payoutM.mutate({ pid: p.id, action: "reject", reason: "Rejected by admin" })} className="rounded-lg border border-red-300 px-2.5 py-1.5 text-[11px] font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50">Reject</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Earnings overview + methods + tax */}
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Earnings overview (donut) */}
          <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm lg:col-span-1">
            <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Earnings Overview</h3>
            <Donut sources={bd?.sources ?? []} total={bd?.total ?? 0} />
            <div className="mt-3 space-y-1.5">
              {(bd?.sources ?? []).map((src, i) => (
                <div key={src.source} className="flex items-center justify-between text-[12px]">
                  <span className="flex items-center gap-1.5 text-[#374151]"><span className="h-2.5 w-2.5 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />{src.label}</span>
                  <span className="font-semibold text-[#111827]">{usd(src.amount)} <span className="text-[#9ca3af]">{src.pct}%</span></span>
                </div>
              ))}
              {(bd?.sources ?? []).length === 0 && <p className="py-4 text-center text-[12px] text-[#9ca3af]">No earnings yet.</p>}
            </div>
          </div>

          {/* Payout methods */}
          <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Payout Methods</h3>
            <div className="space-y-2">
              {(data?.payout_methods ?? []).length === 0 && <p className="py-4 text-center text-[12px] text-[#9ca3af]">No payout methods.</p>}
              {(data?.payout_methods ?? []).map((m) => (
                <div key={m.id} className="rounded-xl border border-[#e8eaed] p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-[#111827]">{m.label}</span>
                    <div className="flex items-center gap-1">
                      {m.primary && <span className="rounded-full bg-[#fe2c55]/10 px-2 py-0.5 text-[10px] font-bold text-[#fe2c55]">Primary</span>}
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600"><BadgeCheck className="h-3 w-3" /> Verified</span>
                    </div>
                  </div>
                  <p className="mt-1 text-[11px] text-[#9ca3af]">{m.account ?? "-"}{m.added_at ? ` · added ${fmtD(m.added_at)}` : ""}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tax information */}
          <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-[15px] font-bold text-[#111827]">Tax Information</h3>
              {data?.tax?.status === "approved" && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600"><BadgeCheck className="h-3 w-3" /> Verified</span>}
            </div>
            {data?.tax ? (
              <>
                <AcctDetail label="Tax Form" value={data.tax.form_type ?? "-"} />
                <AcctDetail label="Status" value={data.tax.status_label} valueClass={data.tax.status === "approved" ? "text-green-600" : "text-amber-600"} />
                <AcctDetail label="Submitted On" value={fmtD(data.tax.submitted_at)} />
                <AcctDetail label="Tax ID / SSN" value={data.tax.tax_id ?? "-"} />
                <AcctDetail label="Country" value={data.tax.country ?? "-"} />
                <div className="py-2">
                  <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">Documents</p>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    {data.tax.documents.length === 0 && <span className="text-[12px] text-[#9ca3af]">None</span>}
                    {data.tax.documents.map((d) => <a key={d.label} href={d.url ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#fe2c55]/10 px-2 py-1 text-[10px] font-bold text-[#fe2c55]"><FileText className="h-3 w-3" /> {d.label}</a>)}
                  </div>
                </div>
              </>
            ) : <p className="py-4 text-center text-[12px] text-[#9ca3af]">No tax form submitted.</p>}
          </div>
        </div>

        {/* Payout history */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-[15px] font-bold text-[#111827]">Payout History</h3>
          <div className="overflow-x-auto rounded-xl border border-[#e8eaed]">
            <table className="w-full whitespace-nowrap text-[12px]">
              <thead><tr className="border-b border-[#e8eaed] bg-[#f9fafb] text-[10px] uppercase tracking-wide text-[#9ca3af]">
                <th className="px-3 py-2 text-left font-semibold">Payout ID</th>
                <th className="px-3 py-2 text-right font-semibold">Amount</th>
                <th className="px-3 py-2 text-left font-semibold">Method</th>
                <th className="px-3 py-2 text-left font-semibold">Account</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-left font-semibold">Requested</th>
                <th className="px-3 py-2 text-left font-semibold">Paid</th>
                <th className="px-3 py-2 text-left font-semibold">Transaction ID</th>
              </tr></thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {(data?.payout_history ?? []).length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-[#9ca3af]">No payouts yet.</td></tr>}
                {(data?.payout_history ?? []).map((p) => (
                  <tr key={p.id} className="hover:bg-[#f9fafb]">
                    <td className="px-3 py-2.5 font-semibold text-[#111827]">{p.code}</td>
                    <td className="px-3 py-2.5 text-right font-semibold text-[#111827]">{usd(p.amount)}</td>
                    <td className="px-3 py-2.5 text-[#6b7280]">{p.method}</td>
                    <td className="px-3 py-2.5 text-[#6b7280]">{p.account ?? "-"}</td>
                    <td className="px-3 py-2.5"><PayoutBadge status={p.status} /></td>
                    <td className="px-3 py-2.5 text-[#6b7280]">{fmtD(p.requested_on)}</td>
                    <td className="px-3 py-2.5 text-[#6b7280]">{fmtD(p.paid_on)}</td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-[#6b7280]">{p.transaction_id}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Creator level + performance */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Creator Level</h3>
            {lvl ? (
              <>
                <div className="flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-[#8b5cf6] text-[18px] font-black text-white">{lvl.level_number}</div>
                  <div><p className="text-[14px] font-bold text-[#111827]">Level {lvl.level_number}</p><p className="text-[12px] text-[#9ca3af]">{lvl.level_name}</p></div>
                  <span className="ml-auto text-[12px] font-semibold text-[#6b7280]">{formatCompact(lvl.current_xp)} / {lvl.max_xp ? formatCompact(lvl.max_xp) : "-"} XP</span>
                </div>
                {lvl.max_xp > 0 && <div className="mt-3 h-2 w-full rounded-full bg-[#f3f4f6]"><div className="h-full rounded-full bg-[#8b5cf6]" style={{ width: `${Math.min(100, (lvl.current_xp / lvl.max_xp) * 100)}%` }} /></div>}
              </>
            ) : <p className="py-4 text-center text-[12px] text-[#9ca3af]">Not a creator yet.</p>}
          </div>
          <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
            <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Monetization Performance</h3>
            <div className="grid grid-cols-2 gap-2">
              <MiniStat label="Earnings (30d)" value={usd(perf?.earnings ?? 0)} />
              <MiniStat label="Impressions" value={formatCompact(perf?.impressions ?? 0)} />
              <MiniStat label="Engagement" value={`${perf?.engagement ?? 0}%`} />
              <MiniStat label="Subscribers" value={formatCompact(perf?.subscribers ?? 0)} />
            </div>
            <div className="mt-3"><SpendChart series={perf?.series ?? []} /></div>
          </div>
        </div>
      </div>

      {/* ── Right column ── */}
      <div className="space-y-4">
        {/* Monetization controls */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Monetization Controls</h3>
          <div className="mb-3 flex items-center justify-between rounded-xl border border-[#e8eaed] px-3 py-2.5">
            <span className="text-[13px] font-semibold text-[#111827]">Monetization Status</span>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${enabled ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>{enabled ? "Enabled" : "Disabled"}</span>
          </div>
          <ControlBtn icon={Pause} tint="#f59e0b" title={enabled ? "Pause Monetization" : "Enable Monetization"} desc={enabled ? "Temporarily pause all monetization." : "Re-enable monetization for this user."} onClick={() => statusM.mutate(enabled ? "pause" : "enable")} busy={statusM.isPending} />
          <ControlBtn icon={Ban} tint="#ef4444" title="Ban Monetization" desc="Permanently disable monetization." onClick={() => statusM.mutate("ban")} busy={statusM.isPending} />
          <ControlBtn icon={RotateCcw} tint="#3b82f6" title="Reset Monetization" desc="Reset all settings to default." onClick={() => statusM.mutate("reset")} busy={statusM.isPending} />
        </div>

        {/* Monetization settings */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-[15px] font-bold text-[#111827]">Monetization Settings</h3>
          <MonSettingRow label="Payout Threshold" value={usd(settings?.payout_threshold ?? 20)} />
          <MonSettingRow label="Auto Payout" value={settings?.auto_payout ? "Enabled" : "Disabled"} valueTint={settings?.auto_payout ? "text-green-600" : "text-[#6b7280]"} />
          <MonSettingRow label="Payout Schedule" value={settings?.payout_schedule ?? "Weekly"} />
          <MonSettingRow label="Currency" value={settings?.currency ?? "USD"} />
          <MonSettingRow label="Earnings Visibility" value={settings?.earnings_visibility ?? "Public"} />
          <SettingToggle label="Allow Gifts" on={settings?.allow_gifts ?? true} onToggle={() => settingM.mutate({ allow_gifts: !(settings?.allow_gifts ?? true) })} />
          <SettingToggle label="Allow Subscriptions" on={settings?.allow_subscriptions ?? true} onToggle={() => settingM.mutate({ allow_subscriptions: !(settings?.allow_subscriptions ?? true) })} />
          <SettingToggle label="Allow Ad Revenue" on={settings?.allow_ad_revenue ?? true} onToggle={() => settingM.mutate({ allow_ad_revenue: !(settings?.allow_ad_revenue ?? true) })} />
          <MonSettingRow label="Monetization Since" value={fmtD(settings?.monetization_since ?? null)} />
        </div>

        {/* Admin notes */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-[15px] font-bold text-[#111827]">Admin Notes</h3>
          <textarea value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))} rows={3} placeholder="Add notes about this user's monetization..." className="w-full rounded-lg border border-[#e8eaed] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
          <div className="mt-2 flex items-center justify-between">
            <span className="text-[11px] text-[#9ca3af]">{note.length} / 500</span>
            <button disabled={noteM.isPending} onClick={() => noteM.mutate()} className="rounded-lg border border-[#fe2c55] px-3 py-1.5 text-[12px] font-semibold text-[#fe2c55] hover:bg-[#fe2c55]/5 disabled:opacity-50">Save Note</button>
          </div>
        </div>

        {/* Recent activity */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-[15px] font-bold text-[#111827]">Recent Activity</h3>
          <div className="space-y-2.5">
            {(data?.recent_activity ?? []).length === 0 && <p className="py-3 text-center text-[12px] text-[#9ca3af]">No recent activity.</p>}
            {(data?.recent_activity ?? []).map((a, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <div className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#f3f4f6]">
                  {a.type === "payout" ? <ArrowUpRight className="h-3 w-3 text-green-600" /> : a.type === "tax" ? <BadgeCheck className="h-3 w-3 text-blue-600" /> : <CreditCard className="h-3 w-3 text-[#8b5cf6]" />}
                </div>
                <div className="min-w-0"><p className="text-[12px] text-[#374151]">{a.text}</p><p className="text-[10px] text-[#9ca3af]">{fmtDT(a.at)}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function PayoutBadge({ status }: { status: string }) {
  const map: Record<string, string> = { completed: "bg-green-50 text-green-600", pending: "bg-amber-50 text-amber-600", processing: "bg-blue-50 text-blue-600", failed: "bg-red-50 text-red-500", cancelled: "bg-[#f3f4f6] text-[#6b7280]" };
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${map[status] ?? "bg-[#f3f4f6] text-[#6b7280]"}`}>{status}</span>;
}

function ControlBtn({ icon: Icon, tint, title, desc, onClick, busy }: { icon: React.ElementType; tint: string; title: string; desc: string; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="flex w-full items-center gap-3 rounded-xl border border-[#e8eaed] px-3 py-2.5 text-left transition hover:bg-[#f9fafb] disabled:opacity-50">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: tint + "15" }}><Icon className="h-4 w-4" style={{ color: tint }} /></div>
      <div className="min-w-0 flex-1"><p className="text-[13px] font-semibold text-[#111827]">{title}</p><p className="truncate text-[11px] text-[#9ca3af]">{desc}</p></div>
    </button>
  );
}

function MonSettingRow({ label, value, valueTint }: { label: string; value: string; valueTint?: string }) {
  return <div className="flex items-center justify-between border-b border-[#f3f4f6] py-2 last:border-0"><span className="text-[12px] text-[#6b7280]">{label}</span><span className={`text-[12px] font-semibold text-[#111827] ${valueTint ?? ""}`}>{value}</span></div>;
}

function SettingToggle({ label, on, onToggle }: { label: string; on: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-center justify-between border-b border-[#f3f4f6] py-2">
      <span className="text-[12px] text-[#6b7280]">{label}</span>
      <button onClick={onToggle} className={`relative h-5 w-9 rounded-full transition-colors ${on ? "bg-[#fe2c55]" : "bg-[#e5e7eb]"}`} aria-pressed={on}>
        <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${on ? "left-[18px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/** SVG donut for the earnings breakdown. */
function Donut({ sources, total }: { sources: MonSource[]; total: number }) {
  const r = 54, C = 2 * Math.PI * r;
  let offset = 0;
  const segs = sources.map((s, i) => {
    const frac = total > 0 ? s.amount / total : 0;
    const len = frac * C;
    const seg = { color: DONUT_COLORS[i % DONUT_COLORS.length], dash: `${len} ${C - len}`, off: -offset };
    offset += len;
    return seg;
  });
  return (
    <div className="relative mx-auto grid h-[150px] w-[150px] place-items-center">
      <svg viewBox="0 0 140 140" className="h-full w-full -rotate-90">
        <circle cx="70" cy="70" r={r} fill="none" stroke="#f3f4f6" strokeWidth="16" />
        {segs.map((seg, i) => (
          <circle key={i} cx="70" cy="70" r={r} fill="none" stroke={seg.color} strokeWidth="16" strokeDasharray={seg.dash} strokeDashoffset={seg.off} strokeLinecap="butt" />
        ))}
      </svg>
      <div className="absolute text-center">
        <p className="text-[16px] font-black leading-none text-[#111827]">{usd(total)}</p>
        <p className="text-[10px] text-[#9ca3af]">Total Earnings</p>
      </div>
    </div>
  );
}

/* ── Finance & Tax Tab ──────────────────────────────────────────────────────── */

type TaxDoc = { label: string; name: string; url: string | null };
type TaxFormRes = {
  id: number; submission_id: string | null; form_type: string; entity_kind: string; full_name: string;
  first_name: string | null; middle_name: string | null; last_name: string | null;
  dob: string | null; citizenship: string | null;
  residence_country: string | null; tin_type: string | null;
  tax_id: string | null; tax_id_masked: string | null;
  residence_tin: string | null; residence_tin_masked: string | null;
  address: string; addr1: string | null; addr2: string | null; city: string | null;
  status: "under_review" | "approved" | "rejected"; status_label: string;
  submitted_at: string | null; approved_at: string | null; reviewed_at: string | null;
  review_note: string | null; documents: TaxDoc[];
};
type Txn = { id: number; type: "Added" | "Used" | "Refund"; entry_type: string; description: string; amount: number; status: string; date: string | null };
type FinanceData = {
  tax_forms: { current: TaxFormRes | null; history: TaxFormRes[] };
  advance_funds: { has_account: boolean; currency: string; current_balance: number; total_added: number; total_used: number; pending: number; transactions: Txn[] };
};

const usd = (n: number) => `$${(n ?? 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDT = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-";
const fmtD  = (iso: string | null) => iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" }) : "-";

function FinanceTaxTab({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["user-finance", userId],
    queryFn: () => adminService.userFinance(userId) as Promise<FinanceData>,
  });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["user-finance", userId] });

  const taxM = useMutation({
    mutationFn: ({ formId, status, note }: { formId: number; status: "approved" | "rejected" | "under_review"; note?: string }) =>
      adminService.updateTaxForm(userId, formId, status, note),
    onSuccess: () => { invalidate(); toast.success("Tax form updated."); },
    onError: (e: unknown) => toast.error(apiMessage(e)),
  });
  const setStatus = (formId: number, status: "approved" | "rejected" | "under_review", note?: string) => taxM.mutate({ formId, status, note });

  const reqM = useMutation({
    mutationFn: (action: "submit" | "update") => adminService.requestTaxInfo(userId, action),
    onSuccess: (r: { message?: string }) => toast.success(r?.message ?? "The user has been notified."),
    onError: (e: unknown) => toast.error(apiMessage(e)),
  });

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#d1d5db]" /></div>;

  // Advance funds moved to the Ads & Control tab; Finance & Tax is tax forms only.
  const tax = data?.tax_forms;
  return (
    <div className="space-y-4">
      <TaxFormsPanel form={tax?.current ?? null} history={tax?.history ?? []} busy={taxM.isPending}
        onSetStatus={setStatus} onRequest={(action) => reqM.mutate(action)} requesting={reqM.isPending} />
    </div>
  );
}

function TaxFormsPanel({ form, history, busy, onSetStatus, onRequest, requesting }: {
  form: TaxFormRes | null; history: TaxFormRes[]; busy: boolean;
  onSetStatus: (id: number, status: "approved" | "rejected" | "under_review", note?: string) => void;
  onRequest: (action: "submit" | "update") => void; requesting: boolean;
}) {
  const [rejectFor, setRejectFor] = useState<number | null>(null);
  const [viewForm, setViewForm] = useState<TaxFormRes | null>(null);
  // Label the id by what the user declared it as (PAN / SSN / EIN …).
  const tinLabel = (t: string | null) => (t ? `${t} Number` : "Tax Identification Number");
  return (
    <div className="h-full rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[15px] font-bold text-[#111827]">Tax Forms</h3>
          <p className="text-[12px] text-[#9ca3af]">Manage user tax information and submitted documents</p>
        </div>
        {/* Ask the user (system notification + email) to submit or refresh tax info. */}
        <div className="flex shrink-0 items-center gap-2">
          <button disabled={requesting} onClick={() => onRequest("submit")}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] border border-[#e8eaed] px-3 text-[12px] font-semibold text-[#374151] transition hover:bg-[#f4f5f7] disabled:opacity-50">
            <Send className="h-3.5 w-3.5" /> Request Tax Info
          </button>
          <button disabled={requesting} onClick={() => onRequest("update")}
            className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#fe2c55] px-3 text-[12px] font-semibold text-white transition hover:bg-[#e0243d] disabled:opacity-50">
            <RefreshCw className="h-3.5 w-3.5" /> Request Update
          </button>
        </div>
      </div>

      {!form ? (
        <div className="mt-6 grid place-items-center gap-2 py-10 text-center">
          <FileText className="h-8 w-8 text-[#d1d5db]" />
          <p className="text-[13px] text-[#9ca3af]">No tax form submitted yet.</p>
        </div>
      ) : (
        <>
          <div className={`mt-4 flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${form.status === "approved" ? "border-green-200 bg-green-50" : form.status === "rejected" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50"}`}>
            <div className="flex min-w-0 items-center gap-2.5">
              {form.status === "approved" ? <CheckCircle2 className="h-5 w-5 shrink-0 text-green-600" /> : form.status === "rejected" ? <XCircle className="h-5 w-5 shrink-0 text-red-600" /> : <Clock className="h-5 w-5 shrink-0 text-amber-600" />}
              <div className="min-w-0">
                <p className={`text-[13px] font-semibold ${form.status === "approved" ? "text-green-700" : form.status === "rejected" ? "text-red-700" : "text-amber-700"}`}>Tax form is {form.status_label.toLowerCase()}</p>
                <p className="truncate text-[11px] text-[#6b7280]">Submitted on {fmtD(form.submitted_at)}{form.approved_at ? ` · Approved on ${fmtD(form.approved_at)}` : ""}</p>
              </div>
            </div>
            <TaxBadge status={form.status} label={form.status_label} />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-[1.25fr_1fr]">
            <div>
              <DetailRow label="Form Type" value={`${form.form_type} (${form.entity_kind})`} />
              {form.submission_id && <DetailRow label="Submission ID" value={form.submission_id} />}
              <DetailRow label="Full Name" value={form.full_name || "-"} />
              {form.dob && <DetailRow label="Date of Birth" value={form.dob} />}
              {form.citizenship && <DetailRow label="Citizenship" value={form.citizenship} />}
              <DetailRow label="Tax Country" value={form.residence_country || "-"} />
              <DetailRow label={tinLabel(form.tin_type)} value={form.tax_id || form.tax_id_masked || "-"} valueClass="font-bold text-[#111827]" />
              {(form.residence_tin || form.residence_tin_masked) && <DetailRow label="Residence TIN" value={form.residence_tin || form.residence_tin_masked || "-"} />}
              <DetailRow label="Address" value={form.address || "-"} />
              <DetailRow label="Submitted On" value={fmtDT(form.submitted_at)} />
              <DetailRow label="Approved On" value={fmtDT(form.approved_at)} />
              <DetailRow label="Status" value={form.status_label} valueClass={form.status === "approved" ? "text-green-600" : form.status === "rejected" ? "text-red-600" : "text-amber-600"} />
            </div>
            <div className="rounded-xl border border-[#e8eaed] p-3">
              <p className="mb-2 text-[12px] font-bold text-[#111827]">Documents</p>
              <div className="space-y-2">
                {form.documents.length === 0 && <p className="text-[12px] text-[#9ca3af]">No documents.</p>}
                {form.documents.map((d) => <DocItem key={d.label} doc={d} />)}
              </div>
              {form.documents.length > 0 && (
                <button onClick={() => form.documents.forEach((d) => d.url && window.open(d.url, "_blank"))}
                  className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#e8eaed] py-2 text-[12px] font-semibold text-[#374151] transition hover:bg-[#f4f5f7]">
                  <Download className="h-3.5 w-3.5" /> Download All
                </button>
              )}
            </div>
          </div>

          {/* Admin review actions */}
          {form.status !== "approved" ? (
            <div className="mt-4 flex gap-2">
              <button disabled={busy} onClick={() => onSetStatus(form.id, "approved")} className="flex-1 rounded-lg bg-green-600 py-2 text-[12px] font-semibold text-white transition hover:bg-green-700 disabled:opacity-50">Approve</button>
              <button disabled={busy} onClick={() => setRejectFor(form.id)} className="flex-1 rounded-lg border border-red-300 py-2 text-[12px] font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">Reject</button>
            </div>
          ) : (
            <button disabled={busy} onClick={() => onSetStatus(form.id, "under_review", "Approval revoked by admin")} className="mt-4 w-full rounded-lg border border-[#e8eaed] py-2 text-[12px] font-semibold text-[#6b7280] transition hover:bg-[#f4f5f7] disabled:opacity-50">Revoke Approval</button>
          )}
        </>
      )}

      <div className="mt-6">
        <p className="mb-2 text-[13px] font-bold text-[#111827]">Tax Form History</p>
        <div className="overflow-x-auto rounded-xl border border-[#e8eaed]">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[#e8eaed] bg-[#f9fafb] text-[11px] uppercase tracking-wide text-[#9ca3af]">
                <th className="px-3 py-2 text-left font-semibold">Form Type</th>
                <th className="px-3 py-2 text-left font-semibold">Submitted On</th>
                <th className="px-3 py-2 text-left font-semibold">Approved On</th>
                <th className="px-3 py-2 text-left font-semibold">Status</th>
                <th className="px-3 py-2 text-right font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f3f4f6]">
              {history.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-[#9ca3af]">No history.</td></tr>}
              {history.map((h) => (
                <tr key={h.id}>
                  <td className="px-3 py-2.5 font-medium text-[#111827]">{h.form_type} ({h.entity_kind})</td>
                  <td className="px-3 py-2.5 text-[#6b7280]">{fmtD(h.submitted_at)}</td>
                  <td className="px-3 py-2.5 text-[#6b7280]">{fmtD(h.approved_at)}</td>
                  <td className="px-3 py-2.5"><TaxBadge status={h.status} label={h.status_label} /></td>
                  <td className="px-3 py-2.5"><button title="View details" onClick={() => setViewForm(h)} className="ml-auto grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-[#6b7280] transition hover:bg-[#f4f5f7]"><Eye className="h-3.5 w-3.5" /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <RejectModal open={rejectFor != null} onClose={() => setRejectFor(null)} onConfirm={(note) => { if (rejectFor != null) onSetStatus(rejectFor, "rejected", note); setRejectFor(null); }} />
      <TaxFormDetailsModal form={viewForm} tinLabel={tinLabel} onClose={() => setViewForm(null)} />
    </div>
  );
}

/** Read-only details for one historical tax form (the history "Eye" action). */
function TaxFormDetailsModal({ form, tinLabel, onClose }: { form: TaxFormRes | null; tinLabel: (t: string | null) => string; onClose: () => void }) {
  if (!form) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111827]">{form.form_type} ({form.entity_kind})</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[#6b7280] hover:bg-[#f4f5f7]"><XCircle className="h-4 w-4" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {form.submission_id && <DetailRow label="Submission ID" value={form.submission_id} />}
          <DetailRow label="Full Name" value={form.full_name || "-"} />
          {form.dob && <DetailRow label="Date of Birth" value={form.dob} />}
          {form.citizenship && <DetailRow label="Citizenship" value={form.citizenship} />}
          <DetailRow label="Tax Country" value={form.residence_country || "-"} />
          <DetailRow label={tinLabel(form.tin_type)} value={form.tax_id || form.tax_id_masked || "-"} valueClass="font-bold text-[#111827]" />
          {(form.residence_tin || form.residence_tin_masked) && <DetailRow label="Residence TIN" value={form.residence_tin || form.residence_tin_masked || "-"} />}
          <DetailRow label="Address" value={form.address || "-"} />
          <DetailRow label="Submitted On" value={fmtDT(form.submitted_at)} />
          <DetailRow label="Approved On" value={fmtDT(form.approved_at)} />
          <DetailRow label="Status" value={form.status_label} valueClass={form.status === "approved" ? "text-green-600" : form.status === "rejected" ? "text-red-600" : "text-amber-600"} />
          {form.review_note && <DetailRow label="Review Note" value={form.review_note} />}
        </div>
        {form.documents.length > 0 && (
          <div className="mt-3 rounded-xl border border-[#e8eaed] p-3">
            <p className="mb-2 text-[12px] font-bold text-[#111827]">Documents</p>
            <div className="space-y-2">{form.documents.map((d) => <DocItem key={d.label} doc={d} />)}</div>
          </div>
        )}
      </div>
    </div>
  );
}

function FundStat({ icon: Icon, tint, label, value, sub }: { icon: React.ElementType; tint: string; label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl border border-[#e8eaed] bg-white p-3">
      <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: tint + "15" }}><Icon className="h-4 w-4" style={{ color: tint }} /></div>
      <p className="mt-2 truncate text-[11px] text-[#9ca3af]">{label}</p>
      <p className="text-[17px] font-bold leading-tight text-[#111827]">{value}</p>
      <p className="truncate text-[10px] text-[#9ca3af]">{sub}</p>
    </div>
  );
}

function DetailRow({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[#f3f4f6] py-2 last:border-0">
      <span className="shrink-0 text-[12px] text-[#9ca3af]">{label}</span>
      <span className={`text-right text-[12px] font-semibold text-[#111827] ${valueClass ?? ""}`}>{value}</span>
    </div>
  );
}

function DocItem({ doc }: { doc: TaxDoc }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-[#e8eaed] p-2">
      <div className="grid h-8 w-8 shrink-0 place-items-center rounded bg-[#fe2c55]/10"><FileText className="h-4 w-4 text-[#fe2c55]" /></div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-medium text-[#111827]">{doc.label}</p>
        <p className="truncate text-[10px] text-[#9ca3af]">{doc.name}</p>
      </div>
      {doc.url && <a href={doc.url} target="_blank" rel="noreferrer" title="Download" className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-[#6b7280] transition hover:bg-[#f4f5f7]"><Download className="h-3.5 w-3.5" /></a>}
    </div>
  );
}

function TaxBadge({ status, label }: { status: string; label: string }) {
  const tone = status === "approved" ? "bg-green-50 text-green-600" : status === "rejected" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600";
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${tone}`}>{label}</span>;
}

function RejectModal({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (note: string) => void }) {
  const [note, setNote] = useState("");
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-[15px] font-bold text-[#111827]">Reject tax form</h3>
        <p className="mt-1 text-[12px] text-[#9ca3af]">Tell the user why so they can resubmit. This is sent to them.</p>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Reason for rejection…" className="mt-3 w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
        <div className="mt-3 flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-lg border border-[#e8eaed] py-2 text-[12px] font-semibold text-[#6b7280] hover:bg-[#f4f5f7]">Cancel</button>
          <button onClick={() => onConfirm(note.trim())} className="flex-1 rounded-lg bg-red-600 py-2 text-[12px] font-semibold text-white hover:bg-red-700">Reject Form</button>
        </div>
      </div>
    </div>
  );
}

function AddFundsModal({ open, userId, onClose, onDone }: { open: boolean; userId: number; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState("");
  const [desc, setDesc] = useState("");
  const m = useMutation({
    mutationFn: () => adminService.addAdvanceFunds(userId, parseFloat(amount), desc || undefined),
    onSuccess: () => { toast.success("Funds added."); setAmount(""); setDesc(""); onDone(); },
    onError: (e: unknown) => toast.error(apiMessage(e)),
  });
  if (!open) return null;
  const valid = parseFloat(amount) > 0;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#111827]">Add Advance Funds</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[#9ca3af] hover:bg-[#f4f5f7]"><X className="h-4 w-4" /></button>
        </div>
        <p className="mt-1 text-[12px] text-[#9ca3af]">Credit the user&apos;s advance balance. Recorded in the ledger.</p>
        <label className="mt-4 block text-[12px] font-semibold text-[#374151]">Amount (USD)</label>
        <input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.5" step="0.01" placeholder="100.00" className="mt-1 w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
        <label className="mt-3 block text-[12px] font-semibold text-[#374151]">Description (optional)</label>
        <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Manual addition by admin" className="mt-1 w-full rounded-lg border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55]" />
        <button disabled={m.isPending || !valid} onClick={() => m.mutate()} className="mt-4 w-full rounded-lg bg-[#fe2c55] py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#e0243d] disabled:opacity-50">{m.isPending ? "Adding…" : "Add Funds"}</button>
      </div>
    </div>
  );
}

/* ── Ads & Control Tab ──────────────────────────────────────────────────────── */

type AdRow = {
  id: number; code: string; name: string; campaign: string; campaign_id: number; group_id: number;
  objective: string; placement: string; platform: string; status: string; approval_status: string;
  budget: number; budget_type: string; spend: number; impressions: number; clicks: number; ctr: number;
};
type AdAccountOverview = {
  has_account: boolean; account_number?: string; status: string; verified?: boolean;
  available_balance?: number; advance_funds?: number; promotional_credits?: number;
  lifetime_spend?: number; total_deposits?: number; refund_balance?: number;
  created_at?: string | null; last_active?: string | null; type?: string; business_name?: string;
  currency?: string; timezone?: string; country?: string | null; tax_status?: string; tax_form?: string | null;
  ads_disabled?: boolean; funds_frozen?: boolean;
  account_owner?: string | null; business_email?: string | null; phone?: string | null; address?: string | null;
  business_type?: string | null; auto_pay?: boolean; billing_threshold?: number | null;
  invoice_frequency?: string | null; tax_exemption?: boolean;
};
type AdvanceFundsData = {
  available: number; pending: number; total_deposited: number; lifetime_refunds: number;
  today_spend: number; spend_7d: number; spend_30d: number; avg_daily_spend: number;
  series: { date: string; amount: number }[]; transactions: Txn[];
};
type AdsData = {
  ad_account: AdAccountOverview;
  advance_funds: AdvanceFundsData;
  ads: AdRow[];
  tax: { form_type: string | null; country: string | null; verified: boolean; submitted_at: string | null; documents: TaxDoc[] };
  compliance: { risk_level: string; violations: number; warnings: number; strikes: number; status: string };
};

const PLATFORM_LABEL = (p: string) => p;

function AdsControlTab({ userId }: { userId: number }) {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["user-ads", userId], queryFn: () => adminService.userAds(userId) as Promise<AdsData> });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["user-ads", userId] });
  const onErr = (e: unknown) => toast.error(apiMessage(e));

  const acctM = useMutation({ mutationFn: (status: "active" | "suspended" | "closed") => adminService.updateAdAccountStatus(userId, status), onSuccess: () => { invalidate(); toast.success("Ad account updated."); }, onError: onErr });
  const controlM = useMutation({ mutationFn: (action: "suspend" | "activate" | "disable_ads" | "enable_ads" | "freeze_funds" | "unfreeze_funds") => adminService.adAccountControl(userId, action), onSuccess: (r: { message?: string }) => { invalidate(); toast.success(r?.message ?? "Done. The advertiser has been emailed and notified."); }, onError: onErr });
  const adM = useMutation({ mutationFn: ({ cid, action }: { cid: number; action: "pause" | "resume" }) => adminService.updateAdStatus(userId, cid, action), onSuccess: (r: { message?: string }) => { invalidate(); toast.success(r?.message ?? "Ad updated."); }, onError: onErr });

  if (isLoading) return <div className="grid place-items-center py-16"><Loader2 className="h-6 w-6 animate-spin text-[#d1d5db]" /></div>;

  const acct = data?.ad_account;
  const funds = data?.advance_funds;
  const ads = data?.ads ?? [];
  const tax = data?.tax;
  const compliance = data?.compliance;
  const suspended = acct?.status === "suspended" || acct?.status === "closed";
  const adsDisabled = !!acct?.ads_disabled;
  const fundsFrozen = !!acct?.funds_frozen;

  const copyId = () => {
    if (!acct?.account_number) return;
    navigator.clipboard?.writeText(acct.account_number).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1400); });
  };
  const toggleSuspend = () => controlM.mutate(suspended ? "activate" : "suspend");
  const toggleAds = () => controlM.mutate(adsDisabled ? "enable_ads" : "disable_ads");
  const toggleFreeze = () => controlM.mutate(fundsFrozen ? "unfreeze_funds" : "freeze_funds");

  if (!acct?.has_account) {
    return (
      <div className="grid place-items-center gap-3 rounded-2xl border border-[#e8eaed] bg-white py-16 text-center shadow-sm">
        <Megaphone className="h-9 w-9 text-[#d1d5db]" />
        <p className="text-[14px] font-semibold text-[#374151]">No ad account yet</p>
        <p className="text-[12px] text-[#9ca3af]">This user hasn&apos;t advertised. Add advance funds to provision an account.</p>
        <button onClick={() => setAddOpen(true)} className="mt-1 inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#fe2c55] px-4 text-[12px] font-semibold text-white hover:bg-[#e0243d]"><Plus className="h-4 w-4" /> Add Funds</button>
        <AddFundsModal open={addOpen} userId={userId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); invalidate(); }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Row 1: Account overview + Quick actions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm lg:col-span-2">
          <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Ad Account Overview</h3>
          <div className="grid gap-4 sm:grid-cols-[1.1fr_2fr]">
            {/* Account id + badges */}
            <div className="rounded-xl border border-[#e8eaed] p-3">
              <div className="flex items-center gap-2.5">
                <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#fe2c55]/10"><CreditCard className="h-4 w-4 text-[#fe2c55]" /></div>
                <div className="min-w-0">
                  <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">Ad Account ID</p>
                  <button onClick={copyId} className="flex items-center gap-1.5 text-[13px] font-bold text-[#111827] hover:text-[#fe2c55]">
                    <span className="truncate">{acct.account_number}</span>
                    <Copy className={`h-3.5 w-3.5 ${copied ? "text-green-600" : "text-[#9ca3af]"}`} />
                  </button>
                </div>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                <AdStatusBadge status={acct.status} />
                {acct.verified && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600"><BadgeCheck className="h-3 w-3" /> Verified</span>}
                {adsDisabled && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-600"><Ban className="h-3 w-3" /> Ads Disabled</span>}
                {fundsFrozen && <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-600"><Lock className="h-3 w-3" /> Funds Frozen</span>}
              </div>
            </div>
            {/* Fund stat cards */}
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <FundStat icon={Wallet} tint="#fe2c55" label="Available Balance" value={usd(acct.available_balance ?? 0)} sub="Spendable now" />
              <FundStat icon={ArrowUpRight} tint="#16a34a" label="Advance Funds" value={usd(acct.advance_funds ?? 0)} sub="Total advanced" />
              <FundStat icon={Gift} tint="#8b5cf6" label="Promotional Credits" value={usd(acct.promotional_credits ?? 0)} sub="Bonus credit" />
              <FundStat icon={TrendingUp} tint="#f59e0b" label="Total Lifetime Spend" value={usd(acct.lifetime_spend ?? 0)} sub="All time" />
              <FundStat icon={Receipt} tint="#3b82f6" label="Total Deposits" value={usd(acct.total_deposits ?? 0)} sub="All time" />
              <FundStat icon={RotateCcw} tint="#6b7280" label="Refund Balance" value={usd(acct.refund_balance ?? 0)} sub="Refunded" />
            </div>
          </div>
          {/* Account details */}
          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-0 sm:grid-cols-3">
            <AcctDetail label="Account Created" value={fmtD(acct.created_at ?? null)} />
            <AcctDetail label="Last Active" value={acct.last_active ? timeAgo(acct.last_active) : "-"} />
            <AcctDetail label="Account Type" value={acct.type ?? "-"} />
            <AcctDetail label="Business Name" value={acct.business_name ?? "-"} />
            <AcctDetail label="Tax Status" value={acct.tax_status ?? "-"} valueClass={acct.verified ? "text-green-600" : "text-amber-600"} />
            <AcctDetail label="Tax Form" value={acct.tax_form ?? "-"} />
            <AcctDetail label="Country" value={acct.country ?? "-"} />
            <AcctDetail label="Currency" value={acct.currency ?? "USD"} />
            <AcctDetail label="Timezone" value={acct.timezone ?? "-"} />
          </div>
        </div>

        {/* Quick actions */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Quick Actions</h3>
          <div className="grid grid-cols-3 gap-2">
            <QuickAction icon={XCircle} tint="#ef4444" label={suspended ? "Reactivate" : "Suspend Account"} onClick={toggleSuspend} busy={controlM.isPending} />
            <QuickAction icon={Ban} tint="#f59e0b" label={adsDisabled ? "Enable Advertising" : "Disable Advertising"} onClick={toggleAds} busy={controlM.isPending} />
            <QuickAction icon={Lock} tint="#3b82f6" label={fundsFrozen ? "Unfreeze Funds" : "Freeze Funds"} onClick={toggleFreeze} busy={controlM.isPending} />
            <QuickAction icon={Plus} tint="#16a34a" label="Add Funds" onClick={() => setAddOpen(true)} />
            <QuickAction icon={CreditCard} tint="#8b5cf6" label="Payment History" onClick={() => toast.info("Payment history is listed under Recent Transactions.")} />
            <QuickAction icon={FileText} tint="#ef4444" label="View Tax Form" onClick={() => toast.info("Tax form is in the Finance & Tax tab.")} />
            <QuickAction icon={ExternalLink} tint="#fe2c55" label="Open Ads Manager" onClick={() => window.open("https://ads.teezer.live", "_blank", "noopener,noreferrer")} />
            <QuickAction icon={Activity} tint="#f59e0b" label="View Audit Log" onClick={() => toast.info("Actions are recorded in the Audit Log tab.")} />
            <QuickAction icon={MoreVertical} tint="#6b7280" label="More Actions" onClick={() => toast.info("More actions coming soon.")} />
          </div>
        </div>
      </div>

      {/* Row 1b: Business Information + Billing Preferences (synced from the app) */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Business Information</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0">
            <AcctDetail label="Business Name" value={acct.business_name ?? "-"} />
            <AcctDetail label="Account Owner" value={acct.account_owner ?? "-"} />
            <AcctDetail label="Business Email" value={acct.business_email ?? "-"} />
            <AcctDetail label="Phone" value={acct.phone ?? "-"} />
            <AcctDetail label="Business Type" value={acct.business_type ?? "-"} />
            <AcctDetail label="Account Type" value={acct.type ?? "-"} />
            <div className="col-span-2"><AcctDetail label="Address" value={acct.address ?? "-"} /></div>
          </div>
        </div>
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Billing Preferences</h3>
          <div className="grid grid-cols-2 gap-x-6 gap-y-0">
            <AcctDetail label="Auto Pay" value={acct.auto_pay ? "Enabled" : "Disabled"} valueClass={acct.auto_pay ? "text-green-600" : "text-[#6b7280]"} />
            <AcctDetail label="Billing Threshold" value={acct.billing_threshold != null ? usd(acct.billing_threshold) : "-"} />
            <AcctDetail label="Invoice Frequency" value={acct.invoice_frequency ?? "-"} />
            <AcctDetail label="Currency" value={acct.currency ?? "USD"} />
            <AcctDetail label="Tax Exemption" value={acct.tax_exemption ? "Yes" : "No"} />
            <AcctDetail label="Timezone" value={acct.timezone ?? "-"} />
          </div>
        </div>
      </div>

      {/* Row 2: Advance funds + recent transactions */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-[15px] font-bold text-[#111827]">Advance Funds</h3>
            <button onClick={() => setAddOpen(true)} className="inline-flex h-9 items-center gap-1.5 rounded-[10px] bg-[#fe2c55] px-3 text-[12px] font-semibold text-white hover:bg-[#e0243d]"><Plus className="h-4 w-4" /> Add Funds</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <FundStat icon={Wallet} tint="#16a34a" label="Available Funds" value={usd(funds?.available ?? 0)} sub="Ready to spend" />
            <FundStat icon={Clock} tint="#f59e0b" label="Pending Funds" value={usd(funds?.pending ?? 0)} sub="On hold" />
            <FundStat icon={Receipt} tint="#3b82f6" label="Total Deposited" value={usd(funds?.total_deposited ?? 0)} sub="All time" />
            <FundStat icon={RotateCcw} tint="#8b5cf6" label="Lifetime Refunds" value={usd(funds?.lifetime_refunds ?? 0)} sub="All time" />
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <p className="mb-1 text-[12px] font-semibold text-[#374151]">Spending Overview</p>
              <SpendChart series={funds?.series ?? []} />
            </div>
            <div className="grid grid-cols-2 gap-2 self-center">
              <MiniStat label="Today's Spend" value={usd(funds?.today_spend ?? 0)} />
              <MiniStat label="7 Days Spend" value={usd(funds?.spend_7d ?? 0)} />
              <MiniStat label="30 Days Spend" value={usd(funds?.spend_30d ?? 0)} />
              <MiniStat label="Avg Daily Spend" value={usd(funds?.avg_daily_spend ?? 0)} />
            </div>
          </div>
        </div>

        {/* Recent transactions */}
        <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
          <h3 className="mb-2 text-[15px] font-bold text-[#111827]">Recent Transactions</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12px]">
              <thead><tr className="text-[10px] uppercase tracking-wide text-[#9ca3af]">
                <th className="py-1.5 text-left font-semibold">Type</th>
                <th className="py-1.5 text-left font-semibold">Description</th>
                <th className="py-1.5 text-right font-semibold">Amount</th>
                <th className="py-1.5 text-left font-semibold">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {(funds?.transactions ?? []).length === 0 && <tr><td colSpan={4} className="py-6 text-center text-[#9ca3af]">No transactions.</td></tr>}
                {(funds?.transactions ?? []).slice(0, 6).map((t) => (
                  <tr key={t.id}>
                    <td className="py-2"><span className={`font-semibold ${t.type === "Used" ? "text-red-500" : t.type === "Refund" ? "text-blue-600" : "text-green-600"}`}>{t.type}</span></td>
                    <td className="py-2 text-[#374151]"><p className="max-w-[120px] truncate">{t.description}</p><p className="text-[10px] text-[#9ca3af]">{fmtDT(t.date)}</p></td>
                    <td className={`py-2 text-right font-semibold ${t.amount >= 0 ? "text-green-600" : "text-red-500"}`}>{t.amount >= 0 ? "+" : "-"}{usd(Math.abs(t.amount))}</td>
                    <td className="py-2"><span className="inline-flex rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-bold text-green-600">{t.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Row 3: All advertisements + tax/policy */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><AdsTable ads={ads} onAd={(cid, action) => adM.mutate({ cid, action })} busy={adM.isPending} /></div>
        <div className="space-y-4">
          <TaxInfoPanel tax={tax} />
          <PolicyPanel compliance={compliance} />
        </div>
      </div>

      <AddFundsModal open={addOpen} userId={userId} onClose={() => setAddOpen(false)} onDone={() => { setAddOpen(false); invalidate(); }} />
    </div>
  );
}

function AcctDetail({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="border-b border-[#f3f4f6] py-2">
      <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">{label}</p>
      <p className={`mt-0.5 truncate text-[12px] font-semibold text-[#111827] ${valueClass ?? ""}`}>{value}</p>
    </div>
  );
}

function QuickAction({ icon: Icon, tint, label, onClick, busy }: { icon: React.ElementType; tint: string; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button onClick={onClick} disabled={busy} className="flex flex-col items-center gap-1.5 rounded-xl border border-[#e8eaed] px-1 py-3 text-center transition hover:bg-[#f9fafb] disabled:opacity-50">
      <div className="grid h-8 w-8 place-items-center rounded-lg" style={{ background: tint + "15" }}><Icon className="h-4 w-4" style={{ color: tint }} /></div>
      <span className="text-[10px] font-semibold leading-tight text-[#374151]">{label}</span>
    </button>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2">
      <p className="text-[10px] text-[#9ca3af]">{label}</p>
      <p className="text-[14px] font-bold text-[#111827]">{value}</p>
    </div>
  );
}

/** Dependency-free SVG line chart for the 30-day spend series. */
function SpendChart({ series }: { series: { date: string; amount: number }[] }) {
  if (series.length === 0) return <div className="grid h-[150px] place-items-center rounded-xl border border-[#e8eaed] text-[12px] text-[#9ca3af]">No spend data</div>;
  const W = 480, H = 150, pad = 6;
  const max = Math.max(1, ...series.map((s) => s.amount));
  const stepX = (W - pad * 2) / Math.max(1, series.length - 1);
  const pts = series.map((s, i) => [pad + i * stepX, H - pad - (s.amount / max) * (H - pad * 2)]);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${H - pad} L${pts[0][0].toFixed(1)},${H - pad} Z`;
  return (
    <div className="overflow-hidden rounded-xl border border-[#e8eaed] p-2">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[150px] w-full" preserveAspectRatio="none">
        <defs><linearGradient id="spendfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#fe2c55" stopOpacity="0.18" /><stop offset="100%" stopColor="#fe2c55" stopOpacity="0" /></linearGradient></defs>
        <path d={area} fill="url(#spendfill)" />
        <path d={line} fill="none" stroke="#fe2c55" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function TaxInfoPanel({ tax }: { tax?: AdsData["tax"] }) {
  return (
    <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[15px] font-bold text-[#111827]">Tax Information</h3>
        {tax?.verified && <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-bold text-green-600"><BadgeCheck className="h-3 w-3" /> Verified</span>}
      </div>
      <AcctDetail label="Form Type" value={tax?.form_type ?? "Not submitted"} />
      <AcctDetail label="Country" value={tax?.country ?? "-"} />
      <div className="py-2">
        <p className="text-[10px] uppercase tracking-wide text-[#9ca3af]">Documents</p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {(tax?.documents ?? []).length === 0 && <span className="text-[12px] text-[#9ca3af]">None</span>}
          {(tax?.documents ?? []).map((d) => (
            <a key={d.label} href={d.url ?? undefined} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md bg-[#fe2c55]/10 px-2 py-1 text-[10px] font-bold text-[#fe2c55]">
              <FileText className="h-3 w-3" /> {d.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

function PolicyPanel({ compliance }: { compliance?: AdsData["compliance"] }) {
  const risk = compliance?.risk_level ?? "Low";
  const riskTone = risk === "High" ? "bg-red-50 text-red-500" : risk === "Medium" ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600";
  return (
    <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
      <h3 className="mb-3 text-[15px] font-bold text-[#111827]">Policy &amp; Compliance</h3>
      <PolicyRow label="Account Risk Level" node={<span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${riskTone}`}>{risk}</span>} />
      <PolicyRow label="Policy Violations" node={<span className="text-[13px] font-bold text-[#111827]">{compliance?.violations ?? 0}</span>} />
      <PolicyRow label="Warning Count" node={<span className="text-[13px] font-bold text-[#111827]">{compliance?.warnings ?? 0}</span>} />
      <PolicyRow label="Strike Count" node={<span className="text-[13px] font-bold text-[#111827]">{compliance?.strikes ?? 0}</span>} />
      <PolicyRow label="Ad Account Status" node={<AdStatusBadge status={compliance?.status ?? "active"} />} />
      <button onClick={() => toast.info("Policy history view coming soon.")} className="mt-3 w-full rounded-xl border border-[#e8eaed] py-2 text-[12px] font-semibold text-[#fe2c55] hover:bg-[#fe2c55]/5">View Policy History</button>
    </div>
  );
}

function PolicyRow({ label, node }: { label: string; node: React.ReactNode }) {
  return <div className="flex items-center justify-between border-b border-[#f3f4f6] py-2.5 last:border-0"><span className="text-[12px] text-[#6b7280]">{label}</span>{node}</div>;
}

/* ── All advertisements table (search + filter + client pagination + CSV export) ── */
function AdsTable({ ads, onAd, busy }: { ads: AdRow[]; onAd: (cid: number, action: "pause" | "resume") => void; busy: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [platform, setPlatform] = useState("");
  const [page, setPage] = useState(1);
  const per = 5;

  const filtered = ads.filter((a) => {
    if (q && !(`${a.name} ${a.campaign} ${a.code}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (status && a.status !== status) return false;
    if (platform && a.platform !== platform) return false;
    return true;
  });
  const pages = Math.max(1, Math.ceil(filtered.length / per));
  const cur = Math.min(page, pages);
  const rows = filtered.slice((cur - 1) * per, cur * per);

  const exportCsv = () => {
    const head = ["Ad ID", "Name", "Campaign", "Objective", "Placement", "Platform", "Status", "Approval", "Budget", "Spend", "Impressions", "Clicks", "CTR"];
    const lines = filtered.map((a) => [a.code, a.name, a.campaign, a.objective, a.placement, a.platform, a.status, a.approval_status, a.budget, a.spend, a.impressions, a.clicks, a.ctr + "%"].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[head.join(","), ...lines].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "advertisements.csv"; a.click(); URL.revokeObjectURL(url);
  };

  return (
    <div className="rounded-2xl border border-[#e8eaed] bg-white p-5 shadow-sm">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-[15px] font-bold text-[#111827]">All Advertisements</h3>
        <div className="flex gap-2">
          <button onClick={() => toast.info("Ads are created by the user from the app.")} className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#fe2c55] px-3 text-[12px] font-semibold text-white hover:bg-[#e0243d]"><Plus className="h-3.5 w-3.5" /> Create Ad</button>
          <button onClick={exportCsv} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8eaed] px-3 text-[12px] font-semibold text-[#374151] hover:bg-[#f4f5f7]"><Download className="h-3.5 w-3.5" /> Export</button>
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Search ads..." className="h-8 w-full rounded-lg border border-[#e8eaed] pl-8 pr-2 text-[12px] outline-none focus:border-[#fe2c55]" />
        </div>
        <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-8 rounded-lg border border-[#e8eaed] px-2 text-[12px] text-[#374151]"><option value="">Status</option><option value="active">Active</option><option value="paused">Paused</option><option value="completed">Completed</option><option value="draft">Draft</option></select>
        <select value={platform} onChange={(e) => { setPlatform(e.target.value); setPage(1); }} className="h-8 rounded-lg border border-[#e8eaed] px-2 text-[12px] text-[#374151]"><option value="">Platform</option><option value="App">App</option><option value="App &amp; Web">App &amp; Web</option></select>
        <button className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#e8eaed] px-2.5 text-[12px] text-[#6b7280]"><Filter className="h-3.5 w-3.5" /> Filters</button>
      </div>
      <div className="overflow-x-auto rounded-xl border border-[#e8eaed]">
        <table className="w-full whitespace-nowrap text-[12px]">
          <thead><tr className="border-b border-[#e8eaed] bg-[#f9fafb] text-[10px] uppercase tracking-wide text-[#9ca3af]">
            <th className="px-3 py-2 text-left font-semibold">Ad ID</th>
            <th className="px-3 py-2 text-left font-semibold">Ad Name</th>
            <th className="px-3 py-2 text-left font-semibold">Objective</th>
            <th className="px-3 py-2 text-left font-semibold">Placement</th>
            <th className="px-3 py-2 text-left font-semibold">Platform</th>
            <th className="px-3 py-2 text-left font-semibold">Status</th>
            <th className="px-3 py-2 text-left font-semibold">Approval</th>
            <th className="px-3 py-2 text-right font-semibold">Budget</th>
            <th className="px-3 py-2 text-right font-semibold">Spend</th>
            <th className="px-3 py-2 text-right font-semibold">Impr.</th>
            <th className="px-3 py-2 text-right font-semibold">Clicks</th>
            <th className="px-3 py-2 text-right font-semibold">CTR</th>
            <th className="px-3 py-2 text-right font-semibold">Actions</th>
          </tr></thead>
          <tbody className="divide-y divide-[#f3f4f6]">
            {rows.length === 0 && <tr><td colSpan={13} className="px-3 py-8 text-center text-[#9ca3af]">No advertisements.</td></tr>}
            {rows.map((a) => (
              <tr key={a.id} className="hover:bg-[#f9fafb]">
                <td className="px-3 py-2.5">
                  <button
                    onClick={() => router.push(`/admin/ads-management/campaigns/${a.campaign_id}`)}
                    title="Open ad details"
                    className="font-semibold text-[#fe2c55] hover:underline"
                  >{a.code}</button>
                </td>
                <td className="px-3 py-2.5 font-medium text-[#111827]">{a.name}</td>
                <td className="px-3 py-2.5 capitalize text-[#6b7280]">{(a.objective ?? "").replace(/_/g, " ")}</td>
                <td className="px-3 py-2.5 capitalize text-[#6b7280]">{(a.placement ?? "").replace(/_/g, " ")}</td>
                <td className="px-3 py-2.5 text-[#6b7280]">{PLATFORM_LABEL(a.platform)}</td>
                <td className="px-3 py-2.5"><AdStatusBadge status={a.status} /></td>
                <td className="px-3 py-2.5"><AdStatusBadge status={a.approval_status} /></td>
                <td className="px-3 py-2.5 text-right text-[#374151]">{usd(a.budget)}{a.budget_type === "daily" ? "/day" : ""}</td>
                <td className="px-3 py-2.5 text-right font-semibold text-[#111827]">{usd(a.spend)}</td>
                <td className="px-3 py-2.5 text-right text-[#374151]">{formatCompact(a.impressions)}</td>
                <td className="px-3 py-2.5 text-right text-[#374151]">{formatCompact(a.clicks)}</td>
                <td className="px-3 py-2.5 text-right text-[#374151]">{a.ctr}%</td>
                <td className="px-3 py-2.5">
                  <div className="flex items-center justify-end gap-1">
                    {a.status === "active" && <button title="Pause" disabled={busy} onClick={() => onAd(a.id, "pause")} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-amber-600 hover:bg-amber-50 disabled:opacity-50"><Pause className="h-3.5 w-3.5" /></button>}
                    {a.status === "paused" && <button title="Resume" disabled={busy} onClick={() => onAd(a.id, "resume")} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-green-600 hover:bg-green-50 disabled:opacity-50"><Play className="h-3.5 w-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center justify-between text-[12px] text-[#6b7280]">
        <span>Showing {filtered.length === 0 ? 0 : (cur - 1) * per + 1} to {Math.min(cur * per, filtered.length)} of {filtered.length} ads</span>
        <div className="flex items-center gap-1">
          <button disabled={cur <= 1} onClick={() => setPage(cur - 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] disabled:opacity-40"><ChevronLeft className="h-3.5 w-3.5" /></button>
          <span className="px-2 font-semibold text-[#111827]">{cur}/{pages}</span>
          <button disabled={cur >= pages} onClick={() => setPage(cur + 1)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] disabled:opacity-40"><ChevronRight className="h-3.5 w-3.5" /></button>
        </div>
      </div>
    </div>
  );
}

function AdStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    active: "bg-green-50 text-green-600", paused: "bg-amber-50 text-amber-600",
    suspended: "bg-red-50 text-red-500", closed: "bg-[#f3f4f6] text-[#6b7280]",
    completed: "bg-blue-50 text-blue-600", draft: "bg-[#f3f4f6] text-[#9ca3af]",
    rejected: "bg-red-50 text-red-500", pending: "bg-amber-50 text-amber-600",
    pending_review: "bg-amber-50 text-amber-600", approved: "bg-green-50 text-green-600",
    submitted: "bg-amber-50 text-amber-600", in_review: "bg-amber-50 text-amber-600",
    none: "bg-[#f3f4f6] text-[#9ca3af]",
  };
  const cls = map[status] ?? "bg-[#f3f4f6] text-[#6b7280]";
  const label = status === "none" ? "No account" : status.replace(/_/g, " ");
  return <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold capitalize ${cls}`}>{label}</span>;
}

/* ── Analytics Tab ───────────────────────────────────────────────────────────
   This slot used to render the admin action timeline, which is a different
   thing wearing the same label. It now reads GET /admin/users/{id}/analytics.

   Every number here is measured, not derived from a placeholder: where the
   backend has nothing to report the card says so rather than drawing a flat
   line that reads as real. ── */

type AMetric  = { total: number; pct: number; spark: number[] };
type ASeries  = { date: string; views: number; likes: number; comments: number; shares: number; follows: number };
type ATop     = {
  id: number; caption: string | null; thumbnail: string | null;
  views: number; likes: number; comments: number; shares: number;
  engagement: number; avg_watch: number; duration: number; posted_at: string | null;
};
type ADim     = { label: string; value: number };
type AData    = {
  period: string; days: number;
  headline: { views: AMetric; watch_time: AMetric; interactions: AMetric; followers: AMetric; posts: AMetric; engagement: AMetric };
  series: ASeries[];
  top_content: ATop[];
  audience: { countries: ADim[]; devices: ADim[]; sources: ADim[] };
  heatmap: number[][];
  retention: { avg_watch_seconds: number; avg_duration: number; completion_pct: number };
  totals: { lifetime_views: number; lifetime_likes: number; lifetime_comments: number; total_videos: number; followers: number };
};

const A_PERIODS: { key: string; label: string }[] = [
  { key: "7d",  label: "7 days"  },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "all", label: "All time" },
];

const A_METRICS: { key: keyof Pick<ASeries, "views" | "likes" | "comments" | "shares" | "follows">; label: string; color: string }[] = [
  { key: "views",    label: "Views",    color: "#fe2c55" },
  { key: "likes",    label: "Likes",    color: "#8b5cf6" },
  { key: "comments", label: "Comments", color: "#3b82f6" },
  { key: "shares",   label: "Shares",   color: "#16a34a" },
  { key: "follows",  label: "Follows",  color: "#f59e0b" },
];

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function fmtSeconds(s: number): string {
  if (!s || s < 1) return "0s";
  if (s < 60) return `${Math.round(s)}s`;
  const m = Math.floor(s / 60);
  const r = Math.round(s % 60);
  return r ? `${m}m ${r}s` : `${m}m`;
}

function fmtMinutes(m: number): string {
  if (!m) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
}

/** Headline card. The delta chip is omitted entirely when there is no prior
    period to compare against, rather than showing a meaningless 0%. */
function AKpi({ label, value, sub, pct, spark, color, icon }: {
  label: string; value: string; sub?: string; pct: number; spark: number[]; color: string; icon: React.ReactNode;
}) {
  const up   = pct > 0;
  const flat = pct === 0;
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="h-8 w-8 rounded-xl flex items-center justify-center shrink-0" style={{ background: `${color}1a` }}>
            {icon}
          </div>
          <p className="text-[11px] text-[#9ca3af] truncate">{label}</p>
        </div>
        {!flat && (
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums shrink-0
            ${up ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>
            {up ? <TrendingUp size={9}/> : <TrendingDown size={9}/>}{Math.abs(pct)}%
          </span>
        )}
      </div>
      <p className="text-[24px] font-black text-[#111827] tabular-nums leading-tight mt-2">{value}</p>
      {sub && <p className="text-[10.5px] text-[#9ca3af] mt-0.5">{sub}</p>}
      {spark.length >= 3 && (
        <div className="mt-2 -mx-1"><Sparkline data={spark} color={color}/></div>
      )}
    </div>
  );
}

/** Horizontal bar list. Values are shown against the largest in the set, so a
    small absolute number still reads at a glance. */
function ABarList({ rows, color, empty }: { rows: ADim[]; color: string; empty: string }) {
  if (!rows.length) return <p className="text-[12px] text-[#9ca3af] py-6 text-center">{empty}</p>;
  const max   = Math.max(...rows.map(r => r.value), 1);
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <div className="space-y-2.5">
      {rows.map(r => (
        <div key={r.label}>
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-[12px] text-[#374151] font-medium truncate capitalize">{r.label}</span>
            <span className="text-[11px] text-[#9ca3af] tabular-nums shrink-0">
              {formatCompact(r.value)}
              <span className="text-[#c4c7ce] ml-1">{total > 0 ? Math.round(r.value / total * 100) : 0}%</span>
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-[#f3f4f6] overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${r.value / max * 100}%`, background: color }}/>
          </div>
        </div>
      ))}
    </div>
  );
}

function AnalyticsTab({ user }: { user: U360 }) {
  const [period, setPeriod]   = useState("30d");
  const [metric, setMetric]   = useState<"views" | "likes" | "comments" | "shares" | "follows">("views");

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-user-analytics", user.id, period],
    queryFn:  () => api.get(`/admin/users/${user.id}/analytics`, { params: { period } }).then(r => r.data?.data as AData),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm p-4">
              <div className="h-8 w-8 rounded-xl bg-[#f3f4f6] animate-pulse"/>
              <div className="h-6 w-20 rounded bg-[#f3f4f6] animate-pulse mt-3"/>
              <div className="h-2 w-14 rounded bg-[#f6f7f8] animate-pulse mt-2"/>
            </div>
          ))}
        </div>
        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm h-72 animate-pulse"/>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm py-16 flex flex-col items-center text-[#9ca3af]">
        <BarChart2 size={36} className="mb-3 opacity-30"/>
        <p className="text-[13px] font-semibold text-[#374151]">Analytics unavailable</p>
        <p className="text-[11px] mt-1">Could not load analytics for this account.</p>
        <Btn variant="outline" className="mt-3" onClick={() => refetch()}><RefreshCw size={12}/>Retry</Btn>
      </div>
    );
  }

  const h        = data.headline;
  const series   = data.series ?? [];
  const active   = A_METRICS.find(m => m.key === metric)!;
  const hasSeries = series.some(d => d.views || d.likes || d.comments || d.shares || d.follows);

  const chartOptions = {
    chart:   { type: "area" as const, toolbar: { show: false }, zoom: { enabled: false }, fontFamily: "inherit" },
    dataLabels: { enabled: false },
    stroke:  { curve: "smooth" as const, width: 2.5 },
    colors:  [active.color],
    fill: {
      type: "gradient",
      gradient: { shadeIntensity: 1, opacityFrom: 0.28, opacityTo: 0.02, stops: [0, 100] },
    },
    grid:    { borderColor: "#f3f4f6", strokeDashArray: 4, padding: { left: 8, right: 8 } },
    xaxis: {
      categories: series.map(d => d.date),
      labels: {
        style: { colors: "#9ca3af", fontSize: "10px" },
        // A 90-day range cannot show 90 dates without them colliding.
        formatter: (v: string) => {
          if (!v) return "";
          const d = new Date(v);
          return `${d.getDate()}/${d.getMonth() + 1}`;
        },
        rotate: 0, hideOverlappingLabels: true,
      },
      axisBorder: { show: false }, axisTicks: { show: false },
    },
    yaxis: { labels: { style: { colors: "#9ca3af", fontSize: "10px" }, formatter: (v: number) => formatCompact(Math.round(v)) } },
    tooltip: { x: { format: "dd MMM" } },
  };

  const maxHeat = Math.max(1, ...data.heatmap.flat());

  return (
    <div className="space-y-4">
      {/* ── Period switcher ── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-bold text-[#111827]">Account Analytics</h3>
          <p className="text-[11.5px] text-[#9ca3af]">
            {formatCompact(data.totals.total_videos)} videos · {formatCompact(data.totals.followers)} followers · {formatCompact(data.totals.lifetime_views)} lifetime views
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isFetching && <Loader2 size={12} className="animate-spin text-[#9ca3af]"/>}
          <div className="flex items-center gap-0.5 bg-[#f4f5f7] p-0.5 rounded-xl">
            {A_PERIODS.map(p => (
              <button key={p.key} onClick={() => setPeriod(p.key)}
                className={`px-3 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                  period === p.key ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}>
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Headline KPIs ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <AKpi label="Views"        value={formatCompact(h.views.total)}        pct={h.views.pct}        spark={h.views.spark}        color="#fe2c55" icon={<Eye size={15} className="text-[#fe2c55]"/>}/>
        <AKpi label="Watch time"   value={fmtMinutes(h.watch_time.total)}      pct={h.watch_time.pct}   spark={h.watch_time.spark}   color="#8b5cf6" icon={<Clock size={15} className="text-[#8b5cf6]"/>}/>
        <AKpi label="Interactions" value={formatCompact(h.interactions.total)} sub="likes + comments + shares" pct={h.interactions.pct} spark={h.interactions.spark} color="#3b82f6" icon={<Heart size={15} className="text-[#3b82f6]"/>}/>
        <AKpi label="New followers" value={formatCompact(h.followers.total)}   pct={h.followers.pct}    spark={h.followers.spark}    color="#f59e0b" icon={<TrendingUp size={15} className="text-[#f59e0b]"/>}/>
        <AKpi label="Videos posted" value={String(h.posts.total)}              pct={h.posts.pct}        spark={[]}                   color="#16a34a" icon={<Video size={15} className="text-[#16a34a]"/>}/>
        <AKpi label="Engagement"    value={`${h.engagement.total}%`} sub="interactions per view" pct={h.engagement.pct} spark={[]}   color="#ec4899" icon={<Zap size={15} className="text-[#ec4899]"/>}/>
      </div>

      {/* ── Trend ── */}
      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-[#e8eaed] flex-wrap">
          <h3 className="text-[13px] font-bold text-[#111827]">Daily trend</h3>
          <div className="flex items-center gap-1 flex-wrap">
            {A_METRICS.map(m => (
              <button key={m.key} onClick={() => setMetric(m.key)}
                className={`px-2.5 py-1 text-[11px] font-semibold rounded-lg border transition-colors ${
                  metric === m.key
                    ? "text-white border-transparent"
                    : "border-[#e8eaed] text-[#6b7280] hover:bg-[#f4f5f7]"
                }`}
                style={metric === m.key ? { background: m.color } : undefined}>
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div className="p-3">
          {hasSeries ? (
            <div className="overflow-x-auto">
              <ApexChart
                options={chartOptions as never}
                series={[{ name: active.label, data: series.map(d => d[metric]) }]}
                type="area" height={280}
              />
            </div>
          ) : (
            <div className="py-20 flex flex-col items-center text-[#9ca3af]">
              <BarChart2 size={30} className="mb-2 opacity-30"/>
              <p className="text-[12.5px] font-medium text-[#374151]">No activity in this period</p>
              <p className="text-[11px] mt-0.5">Try a longer range.</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Top content ── */}
      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center justify-between">
          <h3 className="text-[13px] font-bold text-[#111827]">Top content this period</h3>
          <span className="text-[11px] text-[#9ca3af]">by views</span>
        </div>
        {data.top_content.length === 0 ? (
          <p className="text-[12px] text-[#9ca3af] py-10 text-center">No content viewed in this period.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead>
                <tr className="bg-[#f9fafb] border-b border-[#f3f4f6]">
                  {["Video", "Views", "Likes", "Comments", "Shares", "Avg watch", "Engagement"].map((th, i) => (
                    <th key={th} className={`px-4 py-2 text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider ${i === 0 ? "text-left" : "text-right"}`}>
                      {th}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {data.top_content.map(v => (
                  <tr key={v.id} className="hover:bg-[#f9fafb] transition-colors">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-2.5 min-w-0">
                        {v.thumbnail
                          ? <img src={v.thumbnail} alt="" className="h-10 w-14 rounded-lg object-cover bg-[#f3f4f6] shrink-0"/>
                          : <div className="h-10 w-14 rounded-lg bg-[#f3f4f6] flex items-center justify-center shrink-0"><Video size={13} className="text-[#c4c7ce]"/></div>}
                        <div className="min-w-0">
                          <p className="text-[12.5px] font-medium text-[#111827] truncate max-w-[240px]">{v.caption?.trim() || "Untitled video"}</p>
                          <p className="text-[10px] text-[#9ca3af]">{v.posted_at ? formatDate(v.posted_at) : "-"}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] font-semibold text-[#111827] tabular-nums">{formatCompact(v.views)}</td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] text-[#374151] tabular-nums">{formatCompact(v.likes)}</td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] text-[#374151] tabular-nums">{formatCompact(v.comments)}</td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] text-[#374151] tabular-nums">{formatCompact(v.shares)}</td>
                    <td className="px-4 py-2.5 text-right text-[12.5px] text-[#374151] tabular-nums">{fmtSeconds(v.avg_watch)}</td>
                    <td className="px-4 py-2.5 text-right">
                      <span className="inline-flex rounded-full bg-[#fff0f4] px-2 py-0.5 text-[11px] font-bold text-[#fe2c55] tabular-nums">
                        {v.engagement}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Audience + retention ── */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
            <Globe size={14} className="text-[#3b82f6]"/>
            <h3 className="text-[13px] font-bold text-[#111827]">Top countries</h3>
          </div>
          <div className="p-5"><ABarList rows={data.audience.countries} color="#3b82f6" empty="No location data in this period."/></div>
        </div>

        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
            <Smartphone size={14} className="text-[#8b5cf6]"/>
            <h3 className="text-[13px] font-bold text-[#111827]">Devices</h3>
          </div>
          <div className="p-5"><ABarList rows={data.audience.devices} color="#8b5cf6" empty="No device data in this period."/></div>
        </div>

        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
          <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
            <ArrowUpRight size={14} className="text-[#16a34a]"/>
            <h3 className="text-[13px] font-bold text-[#111827]">Traffic sources</h3>
          </div>
          <div className="p-5"><ABarList rows={data.audience.sources} color="#16a34a" empty="No source data in this period."/></div>
        </div>
      </div>

      {/* ── Retention ── */}
      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center gap-2">
          <Play size={14} className="text-[#fe2c55]"/>
          <h3 className="text-[13px] font-bold text-[#111827]">Watch retention</h3>
        </div>
        <div className="p-5 grid gap-4 sm:grid-cols-3">
          {[
            { label: "Average watch time", value: fmtSeconds(data.retention.avg_watch_seconds), sub: "per view" },
            { label: "Average video length", value: fmtSeconds(data.retention.avg_duration),    sub: "across all posts" },
            { label: "Completion rate",     value: `${data.retention.completion_pct}%`,          sub: "watch time vs. length" },
          ].map(s => (
            <div key={s.label}>
              <p className="text-[11px] text-[#9ca3af]">{s.label}</p>
              <p className="text-[20px] font-black text-[#111827] tabular-nums leading-tight mt-0.5">{s.value}</p>
              <p className="text-[10.5px] text-[#9ca3af]">{s.sub}</p>
            </div>
          ))}
        </div>
        <div className="px-5 pb-5">
          <div className="h-2 rounded-full bg-[#f3f4f6] overflow-hidden">
            <div className="h-full rounded-full bg-[#fe2c55] transition-all" style={{ width: `${Math.min(100, data.retention.completion_pct)}%` }}/>
          </div>
        </div>
      </div>

      {/* ── When the audience watches ── */}
      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#e8eaed] flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-[#f59e0b]"/>
            <h3 className="text-[13px] font-bold text-[#111827]">When this audience watches</h3>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-[#9ca3af]">Less</span>
            {[0.08, 0.3, 0.55, 0.8, 1].map(o => (
              <span key={o} className="h-2.5 w-2.5 rounded-sm" style={{ background: `rgba(254,44,85,${o})` }}/>
            ))}
            <span className="text-[10px] text-[#9ca3af]">More</span>
          </div>
        </div>
        <div className="p-5 overflow-x-auto">
          <div className="min-w-[640px]">
            <div className="flex gap-[3px] mb-1 pl-9">
              {Array.from({ length: 24 }).map((_, hr) => (
                <span key={hr} className="w-[18px] text-[8.5px] text-[#c4c7ce] text-center tabular-nums">
                  {hr % 3 === 0 ? hr : ""}
                </span>
              ))}
            </div>
            {data.heatmap.map((row, dow) => (
              <div key={dow} className="flex items-center gap-[3px] mb-[3px]">
                <span className="w-9 text-[10px] text-[#9ca3af] shrink-0">{DOW_LABELS[dow]}</span>
                {row.map((n, hr) => (
                  <span key={hr} title={`${DOW_LABELS[dow]} ${hr}:00 — ${n} views`}
                    className="h-[18px] w-[18px] rounded-sm shrink-0"
                    style={{ background: n === 0 ? "#f3f4f6" : `rgba(254,44,85,${Math.max(0.12, n / maxHeat)})` }}/>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reports Tab ─────────────────────────────────────────────────────────────
   Every report about this account, across the four tables reports live in.
   Received is the default - what this person is being reported for; Made is
   the other side, which is how you catch someone weaponising the report
   button.

   Actions reuse POST /admin/reports/{id}/action, the same endpoint the
   platform-wide Reported queue uses, so a decision made here is recorded and
   applied identically to one made there. ── */

type RepType = "video" | "comment" | "story" | "user" | "conversation" | "live_stream" | "space";
type RepAction = "dismiss" | "warn" | "remove" | "permanent_delete" | "ban";

type RepRow = {
  id: number; type: RepType; reason: string; details: string | null;
  status: string; created_at: string | null; reviewed_at: string | null;
  reporter_id: number | null; reporter_username: string | null; reporter_avatar: string | null;
  target_id: number | null; target_label: string; target_thumb: string | null;
  parent_video_id: number | null;
};

type RepData = {
  direction: "received" | "made";
  items: RepRow[];
  counts: { total: number; pending: number; reviewed: number; actioned: number; dismissed: number };
  by_type: Record<string, number>;
  unique_reporters: number;
};

const REP_TYPE_META: Record<RepType, { label: string; icon: React.ReactNode; tint: string }> = {
  video:       { label: "Video",       icon: <Video size={12}/>,         tint: "#fe2c55" },
  comment:     { label: "Comment",     icon: <MessageCircle size={12}/>, tint: "#3b82f6" },
  story:       { label: "Story",       icon: <Camera size={12}/>,        tint: "#8b5cf6" },
  user:        { label: "Profile",     icon: <UserX size={12}/>,         tint: "#f59e0b" },
  conversation:{ label: "Conversation",icon: <MessageSquare size={12}/>, tint: "#06b6d4" },
  live_stream: { label: "Live",        icon: <Play size={12}/>,          tint: "#ec4899" },
  space:       { label: "Space",       icon: <Megaphone size={12}/>,     tint: "#16a34a" },
};

const REP_STATUS_META: Record<string, { label: string; cls: string }> = {
  pending:   { label: "Pending",   cls: "bg-amber-50 text-amber-700 border-amber-200" },
  reviewed:  { label: "Reviewed",  cls: "bg-blue-50 text-blue-600 border-blue-200" },
  actioned:  { label: "Actioned",  cls: "bg-red-50 text-red-600 border-red-200" },
  resolved:  { label: "Actioned",  cls: "bg-red-50 text-red-600 border-red-200" },
  dismissed: { label: "Dismissed", cls: "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]" },
  rejected:  { label: "Dismissed", cls: "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]" },
};

const REP_ACTION_META: Record<RepAction, { label: string; message: string; danger: boolean }> = {
  dismiss:          { label: "Dismiss",          message: "Marks the report dismissed. The content and the account are untouched.", danger: false },
  warn:             { label: "Warn",             message: "Marks the report actioned and records a warning against the account.",   danger: false },
  remove:           { label: "Remove content",   message: "Takes the reported content down. Reversible — the row still exists.",    danger: true  },
  permanent_delete: { label: "Delete permanently", message: "Erases the content and its stored files. This cannot be undone.",      danger: true  },
  ban:              { label: "Ban account",      message: "Bans the account and ends every session. Only for clear, repeated abuse.", danger: true },
};

/* permanent_delete and remove need something deletable. A profile,
   conversation, live stream or space report has no single object to take
   down, so those actions are not offered for them. */
const REMOVABLE: RepType[] = ["video", "comment", "story"];

function ReportsTab({ user }: { user: U360 }) {
  const qc = useQueryClient();
  const [direction, setDirection] = useState<"received" | "made">("received");
  const [status,    setStatus]    = useState("all");
  const [typeF,     setTypeF]     = useState("all");
  const [expanded,  setExpanded]  = useState<number | null>(null);
  const [reason,    setReason]    = useState("");
  const [pending,   setPending]   = useState<{ row: RepRow; action: RepAction } | null>(null);

  const qk = ["admin-user-reports", user.id, direction, status, typeF];
  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk,
    queryFn:  () => api.get(`/admin/users/${user.id}/reports`, {
      params: { direction, status, type: typeF },
    }).then(r => r.data?.data as RepData),
    staleTime: 30_000,
  });

  const act = useMutation({
    mutationFn: ({ row, action }: { row: RepRow; action: RepAction }) =>
      api.post(`/admin/reports/${row.id}/action`, {
        action, type: row.type,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      }).then(r => r.data),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Report actioned");
      setPending(null); setReason("");
      qc.invalidateQueries({ queryKey: ["admin-user-reports", user.id] });
      qc.invalidateQueries({ queryKey: ["user360", user.id] });
    },
    onError: () => toast.error("Could not action this report"),
  });

  const frontendBase = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live";

  const openTarget = (r: RepRow) => {
    const vid = r.type === "video" ? r.target_id : r.parent_video_id;
    if (vid) { window.open(`${frontendBase}/videos/${vid}`, "_blank", "noopener,noreferrer"); return; }
    if (r.type === "user" && r.target_id) window.open(`${frontendBase}/profile/${r.target_id}`, "_blank", "noopener,noreferrer");
  };

  const counts = data?.counts ?? { total: 0, pending: 0, reviewed: 0, actioned: 0, dismissed: 0 };
  const items  = data?.items ?? [];

  const TILES = [
    { key: "all",       label: "All reports", value: counts.total,     icon: <Flag size={15} className="text-[#fe2c55]"/>,          bg: "bg-[#fe2c55]/10" },
    { key: "pending",   label: "Pending",     value: counts.pending,   icon: <Clock size={15} className="text-amber-500"/>,         bg: "bg-amber-50"     },
    { key: "reviewed",  label: "Reviewed",    value: counts.reviewed,  icon: <Eye size={15} className="text-blue-500"/>,            bg: "bg-blue-50"      },
    { key: "actioned",  label: "Actioned",    value: counts.actioned,  icon: <AlertTriangle size={15} className="text-red-500"/>,   bg: "bg-red-50"       },
    { key: "dismissed", label: "Dismissed",   value: counts.dismissed, icon: <XCircle size={15} className="text-[#9ca3af]"/>,      bg: "bg-[#f3f4f6]"    },
  ];

  return (
    <div className="space-y-4">
      {/* Status tiles double as the status filter. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TILES.map(t => {
          const on = status === t.key;
          return (
            <button key={t.key} type="button" onClick={() => setStatus(t.key)}
              className={`bg-white rounded-2xl border shadow-sm p-3.5 flex items-center gap-3 text-left transition-all
                ${on ? "border-[#fe2c55] ring-2 ring-[#fe2c55]/15" : "border-[#e8eaed] hover:border-[#d1d5db]"}`}>
              <div className={`h-9 w-9 rounded-xl ${t.bg} flex items-center justify-center shrink-0`}>{t.icon}</div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#9ca3af] truncate">{t.label}</p>
                <p className="text-[19px] font-black text-[#111827] tabular-nums leading-tight">{t.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* A pile-on from one account reads very differently from the same count
          spread across many, so the distinct-reporter figure is called out. */}
      {direction === "received" && counts.total > 0 && (
        <div className="flex items-center gap-2 rounded-2xl border border-[#e8eaed] bg-white px-4 py-2.5 shadow-sm">
          <Info size={13} className="text-[#6b7280] shrink-0"/>
          <p className="text-[12px] text-[#374151]">
            <span className="font-bold tabular-nums">{counts.total}</span> report{counts.total === 1 ? "" : "s"} from{" "}
            <span className="font-bold tabular-nums">{data?.unique_reporters ?? 0}</span> distinct account{(data?.unique_reporters ?? 0) === 1 ? "" : "s"}
            {(data?.unique_reporters ?? 0) === 1 && counts.total > 2 && (
              <span className="text-amber-600 font-semibold"> — repeated reports from a single account.</span>
            )}
          </p>
        </div>
      )}

      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e8eaed] flex-wrap">
          <div className="flex items-center gap-0.5 bg-[#f4f5f7] p-0.5 rounded-xl">
            {([["received", "Reports Received"], ["made", "Reports Made"]] as const).map(([k, label]) => (
              <button key={k} onClick={() => { setDirection(k); setExpanded(null); }}
                className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                  direction === k ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                }`}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <select value={typeF} onChange={e => setTypeF(e.target.value)}
              className="h-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] px-2 text-[12px] text-[#374151] focus:outline-none focus:border-[#fe2c55]">
              <option value="all">All types</option>
              {(Object.keys(REP_TYPE_META) as RepType[]).map(t => (
                <option key={t} value={t}>
                  {REP_TYPE_META[t].label}{data?.by_type?.[t] ? ` (${data.by_type[t]})` : ""}
                </option>
              ))}
            </select>
            {isFetching && <Loader2 size={12} className="animate-spin text-[#9ca3af]"/>}
          </div>
        </div>

        {isLoading ? (
          <div className="divide-y divide-[#f3f4f6]">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-4">
                <div className="h-9 w-9 rounded-xl bg-[#f3f4f6] animate-pulse shrink-0"/>
                <div className="flex-1 space-y-2">
                  <div className="h-2.5 w-48 rounded bg-[#f3f4f6] animate-pulse"/>
                  <div className="h-3 w-2/3 rounded bg-[#f6f7f8] animate-pulse"/>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#9ca3af]">
            <Flag size={36} className="mb-3 opacity-30"/>
            <p className="text-[13px] font-semibold text-[#374151]">
              {status !== "all" || typeF !== "all"
                ? "No reports match these filters"
                : direction === "received" ? "No reports against this account" : "This account has not reported anyone"}
            </p>
            <p className="text-[11px] mt-1">
              {direction === "received"
                ? "Reports on their videos, comments, stories and profile appear here."
                : "Reports this account has filed against others appear here."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[#f3f4f6]">
            {items.map(r => {
              const meta   = REP_TYPE_META[r.type] ?? REP_TYPE_META.video;
              const st     = REP_STATUS_META[r.status] ?? { label: r.status, cls: "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]" };
              const isOpen = expanded === r.id;
              const done   = !["pending", "reviewed"].includes(r.status);
              const canOpen = !!(r.type === "video" ? r.target_id : r.parent_video_id) || (r.type === "user" && !!r.target_id);

              return (
                <div key={`${r.type}-${r.id}`} className="px-4 py-3.5 hover:bg-[#f9fafb] transition-colors">
                  <div className="flex items-start gap-3">
                    <div className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${meta.tint}1a`, color: meta.tint }}>
                      {meta.icon}
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className="rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold"
                          style={{ background: `${meta.tint}12`, color: meta.tint, borderColor: `${meta.tint}33` }}>
                          {meta.label}
                        </span>
                        <span className="rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold capitalize bg-[#fff0f4] text-[#fe2c55] border-[#ffd9e2]">
                          {r.reason?.replace(/_/g, " ") || "unspecified"}
                        </span>
                        <span className={`rounded-full border px-1.5 py-0.5 text-[9.5px] font-bold ${st.cls}`}>{st.label}</span>
                      </div>

                      <p className="text-[13px] font-medium text-[#111827] truncate">{r.target_label}</p>

                      <div className="flex items-center gap-2.5 mt-1 flex-wrap">
                        <span className="text-[10.5px] text-[#9ca3af]">
                          {direction === "received" ? "Reported by" : "Reported"}{" "}
                          <span className="text-[#374151] font-semibold">
                            {r.reporter_username ? `@${r.reporter_username}` : "a deleted account"}
                          </span>
                        </span>
                        <span className="text-[10px] text-[#9ca3af]">{r.created_at ? timeAgo(r.created_at) : "-"}</span>
                        {r.reviewed_at && <span className="text-[10px] text-[#9ca3af]">reviewed {timeAgo(r.reviewed_at)}</span>}
                        {r.details && (
                          <button onClick={() => setExpanded(isOpen ? null : r.id)}
                            className="text-[10.5px] font-semibold text-[#fe2c55] hover:underline">
                            {isOpen ? "Hide details" : "Show details"}
                          </button>
                        )}
                        {canOpen && (
                          <button onClick={() => openTarget(r)}
                            className="flex items-center gap-0.5 text-[10.5px] font-semibold text-[#fe2c55] hover:underline">
                            <ExternalLink size={9}/>Open content
                          </button>
                        )}
                      </div>

                      {isOpen && r.details && (
                        <div className="mt-2 rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2">
                          <p className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider mb-1">Reporter&apos;s description</p>
                          <p className="text-[12.5px] text-[#374151] leading-relaxed whitespace-pre-wrap">{r.details}</p>
                        </div>
                      )}
                    </div>

                    {r.target_thumb && (
                      <img src={r.target_thumb} alt="" loading="lazy"
                        onClick={() => openTarget(r)}
                        className={`h-11 w-16 rounded-lg object-cover bg-[#f3f4f6] shrink-0 ${canOpen ? "cursor-pointer hover:opacity-80" : ""} transition-opacity`}/>
                    )}
                  </div>

                  {/* Actions only on reports still open, and only in the
                      received view - the action applies to the reported
                      content, which in "made" belongs to somebody else. */}
                  {direction === "received" && !done && (
                    <div className="flex items-center gap-1.5 mt-2.5 pl-12 flex-wrap">
                      <Btn variant="outline" onClick={() => { setReason(""); setPending({ row: r, action: "dismiss" }); }}>
                        <XCircle size={12}/>Dismiss
                      </Btn>
                      <Btn variant="warning" onClick={() => { setReason(""); setPending({ row: r, action: "warn" }); }}>
                        <AlertTriangle size={12}/>Warn
                      </Btn>
                      {REMOVABLE.includes(r.type) && (
                        <>
                          <Btn variant="danger" onClick={() => { setReason(""); setPending({ row: r, action: "remove" }); }}>
                            <Trash2 size={12}/>Remove
                          </Btn>
                          <Btn variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                            onClick={() => { setReason(""); setPending({ row: r, action: "permanent_delete" }); }}>
                            <X size={12}/>Delete permanently
                          </Btn>
                        </>
                      )}
                      <Btn variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => { setReason(""); setPending({ row: r, action: "ban" }); }}>
                        <Ban size={12}/>Ban account
                      </Btn>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {items.length >= 200 && (
          <p className="px-4 py-2.5 text-[11px] text-[#9ca3af] border-t border-[#e8eaed]">
            Showing the 200 most recent. Narrow by type or status to see older reports.
          </p>
        )}
      </div>

      <Modal
        open={!!pending}
        title={pending ? REP_ACTION_META[pending.action].label : ""}
        message={pending ? REP_ACTION_META[pending.action].message : ""}
        confirmLabel={pending ? REP_ACTION_META[pending.action].label : ""}
        danger={pending ? REP_ACTION_META[pending.action].danger : false}
        loading={act.isPending}
        onCancel={() => { setPending(null); setReason(""); }}
        onConfirm={() => pending && act.mutate(pending)}>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
          placeholder="Reason (optional) - shown in the audit log"
          className="w-full rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2 text-[12px] text-[#111827] resize-none focus:outline-none focus:border-[#fe2c55]"/>
      </Modal>
    </div>
  );
}

/* ── Comments Tab ───────────────────────────────────────────────────────────── */
/* ── Comments Tab ────────────────────────────────────────────────────────────
   Two questions an operator actually asks about one account: what is this
   person writing, and what is being written at them. `made` filters by
   authorship, `received` by whose video it landed on - separate server
   parameters, never merged, so it is always clear which is on screen.

   Every action goes through POST /admin/comments/{id}/action. Nothing here
   hard-deletes: `delete` is a soft delete the backend can restore, which is
   why "Deleted" is a queue you can browse rather than a dead end. ── */

type CAction = "hide" | "unhide" | "spam" | "not_spam" | "approve" | "delete" | "restore";

type CRow = {
  id: number; body: string; gif_url: string | null; image_path: string | null;
  video_id: number; parent_id: number | null;
  user:  { id: number; username: string; name: string; avatar: string | null } | null;
  video: { id: number; caption: string | null; thumbnail: string | null } | null;
  likes_count: number; dislike_count: number; reply_count: number; reports_count: number;
  is_hidden: boolean; is_spam: boolean; held_for_review: boolean;
  is_pinned: boolean; is_edited: boolean; is_deleted: boolean;
  created_at: string | null; deleted_at: string | null;
};

type CStats = {
  total: number; hidden: number; spam: number; held: number;
  reported: number; reported_open: number; deleted: number; deleted_today: number;
};

const COMMENT_QUEUES: { key: string; label: string }[] = [
  { key: "all",      label: "All live"  },
  { key: "reported", label: "Reported"  },
  { key: "held",     label: "Held"      },
  { key: "spam",     label: "Spam"      },
  { key: "hidden",   label: "Hidden"    },
  { key: "deleted",  label: "Deleted"   },
];

const COMMENT_SORTS: { key: string; label: string }[] = [
  { key: "newest",   label: "Newest first"   },
  { key: "oldest",   label: "Oldest first"   },
  { key: "reported", label: "Most reported"  },
  { key: "liked",    label: "Most liked"     },
];

/* The action offered per row depends on the state it is already in - showing
   "Hide" on an already-hidden comment is how an operator ends up clicking
   something that does nothing. */
const ACTION_LABEL: Record<CAction, string> = {
  hide: "Hide", unhide: "Unhide", spam: "Mark as spam", not_spam: "Not spam",
  approve: "Approve", delete: "Delete", restore: "Restore",
};

/* Falls back to the placeholder when the image fails, rather than hiding it and
   leaving a hole. A key on the src resets the error state when the row is
   recycled onto a different comment. */
function CommentThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = useState(false);

  if (!src || failed) {
    return (
      <div className="h-11 w-16 rounded-lg bg-[#f3f4f6] flex items-center justify-center">
        <Video size={14} className="text-[#c4c7ce]"/>
      </div>
    );
  }

  return (
    <img src={src} alt="" loading="lazy" onError={() => setFailed(true)}
      className="h-11 w-16 rounded-lg object-cover bg-[#f3f4f6] hover:opacity-80 transition-opacity"/>
  );
}

function CommentStateChips({ c }: { c: CRow }) {
  const chips: { label: string; cls: string }[] = [];
  if (c.is_deleted)              chips.push({ label: "Deleted", cls: "bg-[#f3f4f6] text-[#6b7280] border-[#e5e7eb]" });
  if (c.reports_count > 0)       chips.push({ label: "Reported x" + c.reports_count, cls: "bg-red-50 text-red-600 border-red-200" });
  if (c.held_for_review)         chips.push({ label: "Held",    cls: "bg-amber-50 text-amber-700 border-amber-200" });
  if (c.is_spam)                 chips.push({ label: "Spam",    cls: "bg-orange-50 text-orange-600 border-orange-200" });
  if (c.is_hidden && !c.is_spam) chips.push({ label: "Hidden",  cls: "bg-slate-50 text-slate-600 border-slate-200" });
  if (c.is_pinned)               chips.push({ label: "Pinned",  cls: "bg-blue-50 text-blue-600 border-blue-200" });
  if (!chips.length) return null;
  return (
    <>
      {chips.map(ch => (
        <span key={ch.label} className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold border ${ch.cls}`}>
          {ch.label}
        </span>
      ))}
    </>
  );
}

function CommentsTab({ user }: { user: U360 }) {
  const qc = useQueryClient();

  const [mode,     setMode]     = useState<"made" | "received">("made");
  const [queue,    setQueue]    = useState("all");
  const [sort,     setSort]     = useState("newest");
  const [qInput,   setQInput]   = useState("");
  const [q,        setQ]        = useState("");
  const [page,     setPage]     = useState(1);
  const [selected, setSelected] = useState<number[]>([]);
  const [reason,   setReason]   = useState("");
  const [pending,  setPending]  = useState<{ ids: number[]; kind: CAction } | null>(null);

  // Debounced so typing a word is one request, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const params = {
    ...(mode === "made" ? { user_id: user.id } : { received_by: user.id }),
    queue, sort, page, per_page: 25,
    ...(q ? { q } : {}),
  };
  const qk = ["admin-user-comments", user.id, mode, queue, sort, q, page];

  const { data, isLoading, isFetching } = useQuery({
    queryKey: qk,
    queryFn:  () => api.get("/admin/comments", { params }).then(r => r.data),
    staleTime: 30_000,
  });

  const items: CRow[]  = data?.data?.items ?? [];
  const meta           = data?.data?.meta  ?? { current_page: 1, last_page: 1, total: 0 };
  const stats: CStats  = data?.data?.stats ?? {
    total: 0, hidden: 0, spam: 0, held: 0, reported: 0, reported_open: 0, deleted: 0, deleted_today: 0,
  };

  // Any write invalidates every page/queue of this user's comments, because a
  // hide moves a row between queues - refreshing only the current one leaves
  // the tile counts describing a list that no longer exists.
  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-user-comments", user.id] });

  const act = useMutation({
    mutationFn: async ({ ids, kind }: { ids: number[]; kind: CAction }) => {
      const body = { action: kind, ...(reason.trim() ? { reason: reason.trim() } : {}) };
      if (ids.length === 1) return api.post(`/admin/comments/${ids[0]}/action`, body).then(r => r.data);
      return api.post("/admin/comments/bulk", { ids, ...body }).then(r => r.data);
    },
    onSuccess: (_res, vars) => {
      toast.success(vars.ids.length > 1
        ? `${vars.ids.length} comments ${ACTION_LABEL[vars.kind].toLowerCase()}`
        : `Comment ${ACTION_LABEL[vars.kind].toLowerCase()}`);
      setPending(null); setReason(""); setSelected([]);
      invalidate();
    },
    onError: () => toast.error("Action failed"),
  });

  // Destructive and state-changing actions confirm with a reason box; the
  // reason lands in AdminActionLog, which is the only record of why.
  const run = (ids: number[], kind: CAction) => {
    if (!ids.length) return;
    setReason("");
    setPending({ ids, kind });
  };

  const allOnPage  = items.map(c => c.id);
  const allChecked = allOnPage.length > 0 && allOnPage.every(id => selected.includes(id));
  const toggleAll  = () => setSelected(allChecked ? [] : allOnPage);
  const toggleOne  = (id: number) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const frontendBase = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live";

  /* Opens the post the comment sits on, on the public site, in a new tab -
     the moderator keeps their place in the list. Guarded because a comment
     whose video has been hard-deleted has nothing to open. */
  const openContent = (c: CRow) => {
    if (!c.video?.id) return;
    window.open(`${frontendBase}/videos/${c.video.id}`, "_blank", "noopener,noreferrer");
  };

  const switchMode  = (m: "made" | "received") => { setMode(m);  setPage(1); setSelected([]); };
  const switchQueue = (k: string)              => { setQueue(k); setPage(1); setSelected([]); };

  const TILES: { key: string; label: string; value: number; icon: React.ReactNode; bg: string }[] = [
    { key: "all",      label: "Total",    value: stats.total,    icon: <MessageCircle size={15} className="text-[#fe2c55]"/>,   bg: "bg-[#fe2c55]/10" },
    { key: "reported", label: "Reported", value: stats.reported, icon: <Flag size={15} className="text-red-500"/>,              bg: "bg-red-50"       },
    { key: "held",     label: "Held",     value: stats.held,     icon: <Clock size={15} className="text-amber-500"/>,           bg: "bg-amber-50"     },
    { key: "spam",     label: "Spam",     value: stats.spam,     icon: <AlertTriangle size={15} className="text-orange-500"/>,  bg: "bg-orange-50"    },
    { key: "hidden",   label: "Hidden",   value: stats.hidden,   icon: <ShieldOff size={15} className="text-slate-500"/>,       bg: "bg-slate-100"    },
  ];

  return (
    <div className="space-y-4">
      {/* Stat tiles double as queue filters: the number is the control. */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        {TILES.map(t => {
          const on = queue === t.key;
          return (
            <button key={t.key} type="button" onClick={() => switchQueue(t.key)}
              className={`bg-white rounded-2xl border shadow-sm p-3.5 flex items-center gap-3 text-left transition-all
                ${on ? "border-[#fe2c55] ring-2 ring-[#fe2c55]/15" : "border-[#e8eaed] hover:border-[#d1d5db]"}`}>
              <div className={`h-9 w-9 rounded-xl ${t.bg} flex items-center justify-center shrink-0`}>{t.icon}</div>
              <div className="min-w-0">
                <p className="text-[11px] text-[#9ca3af] truncate">{t.label}</p>
                <p className="text-[19px] font-black text-[#111827] tabular-nums leading-tight">{t.value}</p>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        {/* Toolbar */}
        <div className="border-b border-[#e8eaed]">
          <div className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap">
            <div className="flex items-center gap-0.5 bg-[#f4f5f7] p-0.5 rounded-xl">
              {(["made", "received"] as const).map(m => (
                <button key={m} onClick={() => switchMode(m)}
                  className={`px-3.5 py-1.5 text-[12px] font-semibold rounded-lg transition-colors ${
                    mode === m ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                  }`}>
                  {m === "made" ? "Comments Made" : "Comments Received"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none"/>
                <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Search comments..."
                  className="h-8 w-48 rounded-lg border border-[#e8eaed] bg-[#f9fafb] pl-7 pr-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#fe2c55]/30 focus:border-[#fe2c55]"/>
              </div>
              <select value={queue} onChange={e => switchQueue(e.target.value)}
                className="h-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] px-2 text-[12px] text-[#374151] focus:outline-none focus:border-[#fe2c55]">
                {COMMENT_QUEUES.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
                className="h-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] px-2 text-[12px] text-[#374151] focus:outline-none focus:border-[#fe2c55]">
                {COMMENT_SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <span className="text-[11px] text-[#9ca3af] tabular-nums">{meta.total} total</span>
            </div>
          </div>

          {/* Bulk bar - only present when something is selected, so it never
              takes space it has no use for. */}
          {selected.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 py-2.5 bg-[#fff0f4] border-t border-[#ffd9e2] flex-wrap">
              <p className="text-[12px] font-semibold text-[#fe2c55] tabular-nums">{selected.length} selected</p>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Btn variant="outline" onClick={() => run(selected, "hide")}><ShieldOff size={12}/>Hide</Btn>
                <Btn variant="outline" onClick={() => run(selected, "spam")}><AlertTriangle size={12}/>Spam</Btn>
                <Btn variant="success" onClick={() => run(selected, "approve")}><CheckCircle2 size={12}/>Approve</Btn>
                <Btn variant="danger"  onClick={() => run(selected, "delete")}><Trash2 size={12}/>Delete</Btn>
                <Btn variant="ghost"   onClick={() => setSelected([])}><X size={12}/>Clear</Btn>
              </div>
            </div>
          )}
        </div>

        {/* List */}
        {isLoading ? (
          <div className="divide-y divide-[#f3f4f6]">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-3.5">
                <div className="h-11 w-16 rounded-lg bg-[#f3f4f6] animate-pulse shrink-0"/>
                <div className="flex-1 space-y-2 pt-0.5">
                  <div className="h-2.5 w-40 rounded bg-[#f3f4f6] animate-pulse"/>
                  <div className="h-3 w-3/4 rounded bg-[#f6f7f8] animate-pulse"/>
                  <div className="h-2 w-24 rounded bg-[#f6f7f8] animate-pulse"/>
                </div>
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#9ca3af]">
            <MessageCircle size={36} className="mb-3 opacity-30"/>
            <p className="text-[13px] font-semibold text-[#374151]">
              {q ? "No matching comments"
                 : queue !== "all" ? `Nothing in the ${queue} queue`
                 : mode === "made" ? "No comments made yet"
                 : "No comments received yet"}
            </p>
            <p className="text-[11px] mt-1">
              {mode === "made"
                ? "Comments this user wrote appear here."
                : "Comments others left on this user's videos appear here."}
            </p>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2.5 px-4 py-2 bg-[#f9fafb] border-b border-[#f3f4f6]">
              <input type="checkbox" checked={allChecked} onChange={toggleAll}
                className="h-3.5 w-3.5 rounded border-[#d1d5db] text-[#fe2c55] focus:ring-[#fe2c55]/30 cursor-pointer"/>
              <span className="text-[10px] font-semibold text-[#9ca3af] uppercase tracking-wider">Select all on page</span>
              {isFetching && <Loader2 size={11} className="animate-spin text-[#9ca3af] ml-auto"/>}
            </div>

            <div className="divide-y divide-[#f3f4f6]">
              {items.map(c => {
                const checked = selected.includes(c.id);
                return (
                  <div key={c.id}
                    className={`flex items-start gap-3 px-4 py-3.5 group transition-colors
                      ${checked ? "bg-[#fff0f4]" : c.is_deleted ? "bg-[#fafafa] opacity-75" : "hover:bg-[#f9fafb]"}`}>
                    <input type="checkbox" checked={checked} onChange={() => toggleOne(c.id)}
                      className="mt-1.5 h-3.5 w-3.5 rounded border-[#d1d5db] text-[#fe2c55] focus:ring-[#fe2c55]/30 cursor-pointer shrink-0"/>

                    {/* Context thumbnail: the video for a comment they made,
                        the commenter's avatar for one they received. */}
                    <div className={`shrink-0 mt-0.5 ${c.video?.id ? "cursor-pointer" : ""}`}
                      onClick={() => openContent(c)}
                      title={c.video?.id ? "Open this post on teezer.live" : undefined}>
                      {mode === "made" ? (
                        <CommentThumb key={c.video?.thumbnail ?? c.id} src={c.video?.thumbnail ?? null}/>
                      ) : (
                        c.user?.avatar
                          ? <img src={c.user.avatar} alt="" className="h-9 w-9 rounded-full object-cover bg-[#f3f4f6]"/>
                          : <div className="h-9 w-9 rounded-full bg-[#fe2c55]/10 flex items-center justify-center text-[#fe2c55] font-bold text-[13px]">
                              {(c.user?.username?.[0] ?? "?").toUpperCase()}
                            </div>
                      )}
                    </div>

                    <div className={`flex-1 min-w-0 ${c.video?.id ? "cursor-pointer" : ""}`}
                      onClick={() => openContent(c)}
                      title={c.video?.id ? "Open this post on teezer.live" : undefined}>
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        {mode === "made" ? (
                          <span className="text-[10.5px] text-[#9ca3af] truncate max-w-[280px]">
                            On:{" "}
                            <span className="text-[#374151] font-semibold">
                              {c.video?.caption?.trim() || "Untitled video"}
                            </span>
                          </span>
                        ) : (
                          <>
                            <span className="text-[11.5px] font-bold text-[#374151]">@{c.user?.username ?? "unknown"}</span>
                            <span className="text-[10.5px] text-[#9ca3af] truncate max-w-[200px]">
                              on <span className="text-[#6b7280] font-medium">{c.video?.caption?.trim() || "Untitled video"}</span>
                            </span>
                          </>
                        )}
                        <CommentStateChips c={c}/>
                      </div>

                      <p className={`text-[13px] leading-relaxed ${c.is_deleted ? "text-[#9ca3af] line-through" : "text-[#111827]"}`}>
                        {c.body?.trim() || <span className="italic text-[#9ca3af]">(no text)</span>}
                      </p>
                      {c.gif_url && <img src={c.gif_url} alt="" className="mt-1.5 h-16 rounded-lg object-cover"/>}

                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        <span className="text-[10px] text-[#9ca3af]">{c.created_at ? formatDate(c.created_at) : "-"}</span>
                        <span className="flex items-center gap-0.5 text-[10px] text-[#9ca3af] tabular-nums"><Heart size={9}/>{c.likes_count}</span>
                        {c.reply_count > 0 && (
                          <span className="flex items-center gap-0.5 text-[10px] text-[#9ca3af] tabular-nums"><MessageCircle size={9}/>{c.reply_count}</span>
                        )}
                        {c.is_edited && <span className="text-[10px] text-[#9ca3af] italic">edited</span>}
                        {c.video && (
                          <a href={`${frontendBase}/videos/${c.video.id}`} target="_blank" rel="noreferrer"
                            onClick={e => e.stopPropagation()}
                            className="flex items-center gap-0.5 text-[10px] text-[#fe2c55] font-semibold hover:underline">
                            <ExternalLink size={9}/>View content
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Actions stay visible on touch, where there is no hover. */}
                    <div className="flex items-center gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                      {c.is_deleted ? (
                        <button onClick={() => run([c.id], "restore")} title="Restore"
                          className="h-7 w-7 rounded-lg flex items-center justify-center border border-[#e8eaed] text-[#9ca3af] hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                          <RotateCcw size={12}/>
                        </button>
                      ) : (
                        <>
                          {(c.held_for_review || c.is_hidden || c.is_spam) && (
                            <button onClick={() => run([c.id], "approve")} title="Approve"
                              className="h-7 w-7 rounded-lg flex items-center justify-center border border-[#e8eaed] text-[#9ca3af] hover:bg-emerald-50 hover:border-emerald-300 hover:text-emerald-600 transition-colors">
                              <CheckCircle2 size={12}/>
                            </button>
                          )}
                          <button onClick={() => run([c.id], c.is_hidden ? "unhide" : "hide")} title={c.is_hidden ? "Unhide" : "Hide"}
                            className="h-7 w-7 rounded-lg flex items-center justify-center border border-[#e8eaed] text-[#9ca3af] hover:bg-slate-100 hover:border-slate-300 hover:text-slate-600 transition-colors">
                            {c.is_hidden ? <Eye size={12}/> : <ShieldOff size={12}/>}
                          </button>
                          <button onClick={() => run([c.id], c.is_spam ? "not_spam" : "spam")} title={c.is_spam ? "Not spam" : "Mark as spam"}
                            className="h-7 w-7 rounded-lg flex items-center justify-center border border-[#e8eaed] text-[#9ca3af] hover:bg-orange-50 hover:border-orange-300 hover:text-orange-500 transition-colors">
                            <AlertTriangle size={12}/>
                          </button>
                          <button onClick={() => run([c.id], "delete")} title="Delete"
                            className="h-7 w-7 rounded-lg flex items-center justify-center border border-[#e8eaed] text-[#9ca3af] hover:bg-red-50 hover:border-red-300 hover:text-red-500 transition-colors">
                            <Trash2 size={12}/>
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        {meta.last_page > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8eaed]">
            <p className="text-[12px] text-[#9ca3af] tabular-nums">Page {meta.current_page} of {meta.last_page}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => { setPage(p => Math.max(1, p - 1)); setSelected([]); }} disabled={page <= 1}
                className="h-7 w-7 rounded-lg border border-[#e8eaed] flex items-center justify-center text-[#6b7280] hover:bg-[#f4f5f7] disabled:opacity-40 transition-colors">
                <ChevronLeft size={13}/>
              </button>
              <span className="px-2 text-[12px] text-[#374151] font-medium tabular-nums">{page}/{meta.last_page}</span>
              <button onClick={() => { setPage(p => Math.min(meta.last_page, p + 1)); setSelected([]); }} disabled={page >= meta.last_page}
                className="h-7 w-7 rounded-lg border border-[#e8eaed] flex items-center justify-center text-[#6b7280] hover:bg-[#f4f5f7] disabled:opacity-40 transition-colors">
                <ChevronRight size={13}/>
              </button>
            </div>
          </div>
        )}
      </div>

      <CommentControlsPanel user={user}/>

      {/* Reason is optional but always offered - it is the only thing that
          makes the AdminActionLog entry readable six months later. */}
      <Modal
        open={!!pending}
        title={pending ? `${ACTION_LABEL[pending.kind]} ${pending.ids.length > 1 ? `${pending.ids.length} comments` : "comment"}` : ""}
        message="This is recorded in the admin audit log. Removal is reversible - deleted comments stay restorable."
        confirmLabel={pending ? ACTION_LABEL[pending.kind] : ""}
        danger={pending?.kind === "delete" || pending?.kind === "spam"}
        loading={act.isPending}
        onCancel={() => { setPending(null); setReason(""); }}
        onConfirm={() => pending && act.mutate(pending)}>
        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
          placeholder="Reason (optional) - shown in the audit log"
          className="w-full rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2 text-[12px] text-[#111827] resize-none focus:outline-none focus:border-[#fe2c55]"/>
      </Modal>
    </div>
  );
}

/* ── Comment controls ────────────────────────────────────────────────────────
   Writes the same two restriction rows the Overview tab's Content Restrictions
   card writes, through the same endpoint and the same ["restrictions", id]
   query key - so toggling here updates there and vice versa. Duplicating the
   control is fine; duplicating the source of truth would not be. ── */
function CommentControlsPanel({ user }: { user: U360 }) {
  const qc = useQueryClient();
  const [onUploads, setOnUploads] = useState(false);
  const [onOthers,  setOnOthers]  = useState(false);
  const [dirty,     setDirty]     = useState(false);

  const { data: rest } = useQuery({
    queryKey: ["restrictions", user.id],
    queryFn:  () => adminService.getRestrictions(user.id),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!rest) return;
    setOnUploads(!!rest["disable_commenting_on_uploads"]?.is_active);
    setOnOthers(!!rest["disable_commenting_on_others"]?.is_active);
    setDirty(false);
  }, [rest]);

  /* Carries the existing expiry and reason back unchanged. The endpoint is an
     upsert of whatever it is sent, so passing null here would silently clear an
     expiry set on the Overview tab - a toggle saved from this panel must not
     quietly turn a timed restriction into a permanent one. A past expiry is
     dropped rather than resent: the server validates `after:now` and would
     reject the whole save. */
  const keep = (type: string) => {
    const r   = rest?.[type];
    const exp = r?.expires_at && new Date(r.expires_at) > new Date() ? r.expires_at : null;
    return { expires_at: exp, reason: r?.reason ?? null };
  };

  const save = useMutation({
    mutationFn: () => adminService.updateRestrictions(user.id, [
      { type: "disable_commenting_on_uploads", is_active: onUploads, ...keep("disable_commenting_on_uploads") },
      { type: "disable_commenting_on_others",  is_active: onOthers,  ...keep("disable_commenting_on_others")  },
    ]),
    onSuccess: () => {
      toast.success("Comment controls saved");
      setDirty(false);
      qc.invalidateQueries({ queryKey: ["restrictions", user.id] });
    },
    onError: () => toast.error("Failed to save comment controls"),
  });

  return (
    <SectionCard title="Comment Controls" number={1}
      action={
        <Btn variant="primary" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <><Loader2 size={12} className="animate-spin"/>Saving...</> : <><Save size={12}/>Save</>}
        </Btn>
      }>
      <SettingRow label="Disable comments on this user's uploads"
        sub="Nobody can comment on any video this user posts.">
        <Toggle value={onUploads} onChange={v => { setOnUploads(v); setDirty(true); }}/>
      </SettingRow>
      <SettingRow label="Prevent this user commenting on others"
        sub="This user cannot comment anywhere on the platform.">
        <Toggle value={onOthers} onChange={v => { setOnOthers(v); setDirty(true); }}/>
      </SettingRow>
      <p className="text-[11px] text-[#9ca3af] mt-3 leading-relaxed">
        These are the same two restrictions shown on the Overview tab - changing them here changes them there.
        To set an expiry date on either, use the Content Restrictions card on Overview.
      </p>
    </SectionCard>
  );
}

/* ── Audit Log Tab ───────────────────────────────────────────────────────────── */
function AuditLogTab({ user }: { user: U360 }) {
  const [q,        setQ]        = useState("");
  const [severity, setSeverity] = useState<"all"|"low"|"medium"|"high"|"critical">("all");
  const [page,     setPage]     = useState(1);
  const PER_PAGE = 20;

  const all = user.timeline ?? [];

  const filtered = all.filter(t => {
    if (severity !== "all" && t.severity !== severity) return false;
    if (q) {
      const lower = q.toLowerCase();
      if (!t.action.toLowerCase().includes(lower) &&
          !t.description.toLowerCase().includes(lower) &&
          !(t.admin?.name ?? "System").toLowerCase().includes(lower)) return false;
    }
    return true;
  });

  const paged  = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const lastPg = Math.ceil(filtered.length / PER_PAGE) || 1;

  const SEV: Record<string, string> = {
    low:      "bg-green-50  text-green-700  border-green-200",
    medium:   "bg-amber-50  text-amber-700  border-amber-200",
    high:     "bg-orange-50 text-orange-700 border-orange-200",
    critical: "bg-red-50    text-red-700    border-red-200",
  };

  function actionCls(action: string): string {
    const a = action.toLowerCase();
    if (a.includes("ban")   || a.includes("delete"))   return "bg-red-50 text-red-700 border-red-200";
    if (a.includes("suspen") || a.includes("restrict")) return "bg-orange-50 text-orange-700 border-orange-200";
    if (a.includes("warn")  || a.includes("strike"))   return "bg-amber-50 text-amber-700 border-amber-200";
    if (a.includes("verif") || a.includes("promot"))   return "bg-emerald-50 text-emerald-700 border-emerald-200";
    if (a.includes("note")  || a.includes("message"))  return "bg-purple-50 text-purple-700 border-purple-200";
    if (a.includes("login") || a.includes("access"))   return "bg-blue-50 text-blue-700 border-blue-200";
    return "bg-[#f3f4f6] text-[#374151] border-[#e8eaed]";
  }

  const COUNTS = {
    all:      all.length,
    low:      all.filter(t => t.severity === "low").length,
    medium:   all.filter(t => t.severity === "medium").length,
    high:     all.filter(t => t.severity === "high").length,
    critical: all.filter(t => t.severity === "critical").length,
  };

  const SEV_CARDS: { key:"all"|"low"|"medium"|"high"|"critical"; label:string; color:string; bg:string; border:string }[] = [
    { key:"all",      label:"Total Logs", color:"#6b7280", bg:"#f9fafb",  border:"#e8eaed" },
    { key:"low",      label:"Low",        color:"#10b981", bg:"#ecfdf5",  border:"#bbf7d0" },
    { key:"medium",   label:"Medium",     color:"#f59e0b", bg:"#fffbeb",  border:"#fde68a" },
    { key:"high",     label:"High",       color:"#f97316", bg:"#fff7ed",  border:"#fed7aa" },
    { key:"critical", label:"Critical",   color:"#ef4444", bg:"#fef2f2",  border:"#fecaca" },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-5 gap-3">
        {SEV_CARDS.map(({ key, label, color, bg, border }) => (
          <button key={key} onClick={() => { setSeverity(key); setPage(1); }}
            className={`rounded-2xl border shadow-sm p-4 text-left transition-all ${severity === key ? "ring-2 ring-[#fe2c55]/40" : ""}`}
            style={{ background: bg, borderColor: border }}>
            <p className="text-[11px] font-semibold mb-1" style={{ color }}>{label}</p>
            <p className="text-[24px] font-black" style={{ color }}>{COUNTS[key]}</p>
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[#e8eaed]">
          <div className="flex items-center gap-2">
            <Activity size={14} className="text-[#fe2c55]"/>
            <p className="text-[13px] font-bold text-[#111827]">Audit Log</p>
            <span className="text-[11px] text-[#9ca3af] bg-[#f3f4f6] px-2 py-0.5 rounded-full">{filtered.length} entries</span>
          </div>
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] pointer-events-none"/>
            <input value={q} onChange={e => { setQ(e.target.value); setPage(1); }} placeholder="Search action, description, admin…"
              className="h-8 w-56 rounded-lg border border-[#e8eaed] bg-[#f9fafb] pl-7 pr-2 text-[12px] focus:outline-none focus:ring-1 focus:ring-[#fe2c55]/30 focus:border-[#fe2c55]"/>
          </div>
        </div>

        {paged.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-14 text-[#9ca3af]">
            <Activity size={36} className="mb-3 opacity-30"/>
            <p className="text-[13px] font-medium">
              {q || severity !== "all" ? "No matching log entries" : "No audit logs yet"}
            </p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[12px]">
                <thead>
                  <tr className="border-b border-[#e8eaed] bg-[#f9fafb]">
                    {["Date & Time","Action","Severity","Performed By","Description","Reference"].map(h => (
                      <th key={h} className="px-3 py-2.5 text-left text-[10px] font-bold text-[#6b7280] uppercase tracking-wider whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f6]">
                  {paged.map(t => (
                    <tr key={t.id} className="hover:bg-[#f9fafb] transition-colors">
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-[11px] font-medium text-[#374151]">
                          {new Date(t.created_at).toLocaleDateString(undefined,{month:"short",day:"numeric",year:"numeric"})}
                        </p>
                        <p className="text-[10px] text-[#9ca3af]">
                          {new Date(t.created_at).toLocaleTimeString(undefined,{hour:"2-digit",minute:"2-digit"})}
                        </p>
                      </td>
                      <td className="px-3 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold border ${actionCls(t.action)}`}>
                          {t.action.replace(/_/g," ")}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        {t.severity ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-semibold border ${SEV[t.severity] ?? "bg-[#f3f4f6] text-[#9ca3af] border-[#e8eaed]"}`}>
                            {t.severity}
                          </span>
                        ) : <span className="text-[#9ca3af]">-</span>}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-1.5">
                          <div className="h-5 w-5 rounded-full bg-[#fe2c55]/10 flex items-center justify-center text-[#fe2c55] font-bold text-[9px] shrink-0">
                            {(t.admin?.name ?? "S")[0].toUpperCase()}
                          </div>
                          <span className="text-[#374151] font-medium">{t.admin?.name ?? "System"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 max-w-[240px]">
                        <p className="text-[12px] text-[#6b7280] line-clamp-2">{t.description}</p>
                      </td>
                      <td className="px-3 py-3">
                        {t.reference
                          ? <span className="font-mono text-[10px] text-[#9ca3af] bg-[#f3f4f6] px-1.5 py-0.5 rounded">{t.reference}</span>
                          : <span className="text-[#c4c7ce]">-</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {lastPg > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-[#e8eaed]">
                <p className="text-[12px] text-[#9ca3af]">
                  {(page-1)*PER_PAGE+1}–{Math.min(page*PER_PAGE,filtered.length)} of {filtered.length}
                </p>
                <div className="flex items-center gap-1">
                  <button onClick={() => setPage(p => Math.max(1,p-1))} disabled={page<=1}
                    className="h-7 w-7 rounded-lg border border-[#e8eaed] flex items-center justify-center text-[#6b7280] hover:bg-[#f4f5f7] disabled:opacity-40 transition-colors">
                    <ChevronLeft size={13}/>
                  </button>
                  <span className="px-2 text-[12px] text-[#374151] font-medium">{page}/{lastPg}</span>
                  <button onClick={() => setPage(p => Math.min(lastPg,p+1))} disabled={page>=lastPg}
                    className="h-7 w-7 rounded-lg border border-[#e8eaed] flex items-center justify-center text-[#6b7280] hover:bg-[#f4f5f7] disabled:opacity-40 transition-colors">
                    <ChevronRight size={13}/>
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── Tabs config ────────────────────────────────────────────────────────────── */
const TABS: { key: TabKey; label: string; icon: React.ReactNode }[] = [
  { key:"overview",     label:"Overview",      icon:<Eye size={13}/> },
  { key:"content",      label:"Content",       icon:<Video size={13}/> },
  { key:"messages",     label:"Messages",      icon:<MessageSquare size={13}/> },
  { key:"comments",     label:"Comments",      icon:<MessageCircle size={13}/> },
  { key:"analytics",    label:"Analytics",     icon:<BarChart2 size={13}/> },
  { key:"security",     label:"Security",      icon:<ShieldCheck size={13}/> },
  { key:"monetization", label:"Monetization",  icon:<DollarSign size={13}/> },
  { key:"finance",      label:"Finance & Tax", icon:<Receipt size={13}/> },
  { key:"ads",          label:"Ads & Control", icon:<Megaphone size={13}/> },
  { key:"verification", label:"Verification Badge", icon:<BadgeCheck size={13}/> },
  { key:"reports",      label:"Reports",       icon:<Flag size={13}/> },
  { key:"audit",        label:"Audit Log",     icon:<Activity size={13}/> },
];

/* ── Skeleton ──────────────────────────────────────────────────────────────── */
function Skeleton() {
  return (
    <div className="space-y-4 animate-pulse">
      <div className="bg-white rounded-2xl border border-[#e8eaed] p-6">
        <div className="flex gap-5">
          <div className="h-[88px] w-[88px] rounded-full bg-[#f3f4f6]"/>
          <div className="flex-1 space-y-3 py-1">
            <div className="h-5 bg-[#f3f4f6] rounded-full w-48"/>
            <div className="h-3.5 bg-[#f3f4f6] rounded-full w-32"/>
            <div className="h-3 bg-[#f3f4f6] rounded-full w-64"/>
          </div>
        </div>
        <div className="mt-5 grid grid-cols-7 gap-3 border-t border-[#f3f4f6] pt-5">
          {Array.from({length:7}).map((_,i)=><div key={i} className="h-8 bg-[#f3f4f6] rounded-xl"/>)}
        </div>
      </div>
      <div className="h-12 bg-white rounded-2xl border border-[#e8eaed]"/>
      <div className="flex gap-5">
        <div className="flex-1 space-y-4">
          <div className="h-64 bg-white rounded-2xl border border-[#e8eaed]"/>
          <div className="h-64 bg-white rounded-2xl border border-[#e8eaed]"/>
        </div>
        <div className="w-72 shrink-0 space-y-4">
          <div className="h-48 bg-white rounded-2xl border border-[#e8eaed]"/>
          <div className="h-40 bg-white rounded-2xl border border-[#e8eaed]"/>
        </div>
      </div>
    </div>
  );
}

/* ── Main Page ──────────────────────────────────────────────────────────────── */
export default function User360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
  const router  = useRouter();
  const qc      = useQueryClient();
  const qKey    = ["admin-user-360", id];
  const [tab,         setTab]         = useState<TabKey>("overview");

  /**
   * Deep link: the Verification Badge listing links to /users/{id}?tab=verification.
   *
   * Read AFTER mount, not in a lazy useState initialiser. The initialiser runs on the
   * server too, where there is no window and the tab resolves to "overview" - React
   * then keeps that server value through hydration, so the link silently landed on
   * Overview every time. An effect runs post-hydration, where the URL is real.
   *
   * window.location rather than useSearchParams(), which would force this page into a
   * Suspense boundary it doesn't otherwise need.
   */
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("tab") as TabKey | null;
    if (t && TABS.some(x => x.key === t)) setTab(t);
  }, []);

  const [moreOpen,         setMoreOpen]         = useState(false);
  const [modal,            setModal]            = useState<{type:string;open:boolean}>({type:"",open:false});
  const [modalReason,      setModalReason]      = useState("");
  const [headerSuspendUntil, setHeaderSuspendUntil] = useState("");
  const [msgText,          setMsgText]          = useState("");
  const [editForm,         setEditForm]         = useState<{
    name:string; username:string; email:string; bio:string; phone:string; role:string;
    categories:string[]; interests:string[];
  }>({name:"",username:"",email:"",bio:"",phone:"",role:"",categories:[],interests:[]});
  const [editAvatarFile,    setEditAvatarFile]    = useState<File|null>(null);
  const [editAvatarPreview, setEditAvatarPreview] = useState<string|null>(null);
  const editAvatarInputRef = useRef<HTMLInputElement>(null);

  const { data: user, isLoading, isError, error } = useQuery({
    queryKey: qKey,
    queryFn:  () => adminService.user360(Number(id)),
    refetchInterval: false,
    retry: 1,
  });

  const ban      = useMutation({ mutationFn: (r:string) => adminService.banUser(Number(id), r),     onSuccess: () => { toast.success("User banned");       qc.invalidateQueries({ queryKey: qKey }); setModal({type:"",open:false}); setModalReason(""); } });
  const unban    = useMutation({ mutationFn: ()          => adminService.unbanUser(Number(id)),      onSuccess: () => { toast.success("User unbanned");     qc.invalidateQueries({ queryKey: qKey }); } });
  const unsuspend= useMutation({ mutationFn: ()          => adminService.unsuspendUser(Number(id)),  onSuccess: () => { toast.success("User unsuspended");  qc.invalidateQueries({ queryKey: qKey }); } });
  const suspend  = useMutation({ mutationFn: (r:string) => adminService.suspendUser(Number(id), r, headerSuspendUntil || null), onSuccess: () => { toast.success("User suspended"); qc.invalidateQueries({ queryKey: qKey }); setModal({type:"",open:false}); setModalReason(""); setHeaderSuspendUntil(""); } });
  const verify   = useMutation({ mutationFn: () => user?.is_verified ? adminService.unverifyUser(Number(id)) : adminService.verifyUser(Number(id)), onSuccess: () => { toast.success(user?.is_verified?"Badge removed":"User verified"); qc.invalidateQueries({ queryKey: qKey }); } });
  const reset    = useMutation({ mutationFn: ()          => adminService.resetPassword(Number(id)), onSuccess: () => { toast.success("Password reset"); setModal({type:"",open:false}); } });
  const delUser  = useMutation({ mutationFn: ()          => adminService.deleteUser(Number(id)),    onSuccess: () => { toast.success("User deleted"); router.push("/admin/users"); } });
  const sendMsg  = useMutation({ mutationFn: ()          => adminService.messageUser(Number(id), msgText), onSuccess: () => { toast.success("Message sent to user"); setModal({type:"",open:false}); setMsgText(""); } });
  const saveEdit = useMutation({
    mutationFn: async () => {
      const tasks: Promise<unknown>[] = [
        adminService.editUser(Number(id), {
          name: editForm.name, username: editForm.username, email: editForm.email,
          bio: editForm.bio || null, phone: editForm.phone || null, role: editForm.role,
          categories: editForm.categories, interests: editForm.interests,
        }),
      ];
      if (editAvatarFile) tasks.push(adminService.uploadUserAvatar(Number(id), editAvatarFile));
      await Promise.all(tasks);
    },
    onSuccess: () => {
      toast.success("User updated");
      qc.invalidateQueries({ queryKey: qKey });
      setModal({type:"",open:false});
      setEditAvatarFile(null);
      setEditAvatarPreview(null);
    },
    onError: () => toast.error("Failed to save changes"),
  });

  if (isLoading) return <AdminShell title="User 360 Profile"><Skeleton/></AdminShell>;
  if (isError)   return (
    <AdminShell title="User 360 Profile">
      <div className="py-24 text-center space-y-2">
        <p className="text-[15px] font-semibold text-[#111827]">Failed to load user profile</p>
        <p className="text-[12px] text-[#9ca3af]">{(error as Error)?.message ?? "An unexpected error occurred."}</p>
        <button onClick={() => router.push("/admin/users")} className="mt-4 text-[12px] text-[#fe2c55] font-semibold hover:underline">← Back to Users</button>
      </div>
    </AdminShell>
  );
  if (!user)     return <AdminShell title="User 360 Profile"><div className="py-24 text-center text-[#9ca3af]">User not found.</div></AdminShell>;

  const u = user as U360;
  const accountStatus = u.is_banned?"Banned":!u.is_active?"Suspended":"Active";
  const statusCls     = u.is_banned?"bg-red-50 text-red-600 border border-red-100":!u.is_active?"bg-amber-50 text-amber-700 border border-amber-100":"bg-emerald-50 text-emerald-700 border border-emerald-100";

  return (
    <AdminShell title="User 360 Profile">
      <div className="space-y-4">

        {/* ── Page Title ── */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-[18px] font-bold text-[#111827]">User 360 Profile</h1>
            <p className="text-[12px] text-[#9ca3af] mt-0.5">Full account overview, controls, admin settings, activities, and enforcement tools.</p>
          </div>
          <button onClick={() => router.push("/admin/users")}
            className="flex items-center gap-1.5 text-[13px] text-[#6b7280] hover:text-[#111827] transition-colors border border-[#e8eaed] rounded-xl px-3 py-1.5 hover:bg-[#f9fafb]">
            <ArrowLeft size={14}/> Back to Users
          </button>
        </div>

        {/* ── Profile Hero ── */}
        <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
          <div className="flex gap-0 items-stretch">

            {/* ── Left: Avatar + Identity ── */}
            <div className="shrink-0 w-[268px] border-r border-[#f0f1f3] p-5 flex flex-col gap-2.5">
              {/* Avatar */}
              <div className="flex items-center gap-3.5">
                <div className="relative shrink-0">
                  <div className="h-[88px] w-[88px] rounded-full p-[3px]"
                    style={{background:"linear-gradient(135deg,#fe2c55 0%,#ff7c9b 50%,#ff4d6d 100%)"}}>
                    {u.avatar
                      ? <img src={u.avatar} alt={u.name}
                          className="h-full w-full rounded-full object-cover ring-2 ring-white"/>
                      : <div className="h-full w-full rounded-full bg-white grid place-items-center text-[32px] font-black text-[#fe2c55]">
                          {u.name?.[0]?.toUpperCase()??"U"}
                        </div>
                    }
                  </div>
                  <span className={`absolute bottom-0.5 right-0.5 h-[14px] w-[14px] rounded-full ring-2 ring-white
                    ${u.is_active && !u.is_banned ? "bg-emerald-500" : "bg-[#d1d5db]"}`}/>
                </div>

                <div className="min-w-0 flex-1">
                  {/* Name + status */}
                  <div className="flex flex-wrap items-center gap-1.5 mb-0.5">
                    <span className="text-[17px] font-extrabold text-[#111827] leading-tight truncate">{u.name}</span>
                    <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${statusCls}`}>
                      {accountStatus}
                    </span>
                  </div>
                  {/* Username + level name badge */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[12.5px] text-[#6b7280]">@{u.username}</span>
                    {u.role === 'creator' && u.creator_level && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-[#fff0f3] border border-[#ffd6df] px-2 py-0.5 text-[10px] font-bold text-[#fe2c55]">
                        <Star size={9} fill="#fe2c55" strokeWidth={0}/> {u.creator_level.level_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {/* Bio + categories */}
              <p className="text-[12.5px] text-[#6b7280] leading-relaxed line-clamp-2">
                {[u.bio, (u.categories??[]).join(" • ")].filter(Boolean).join("  ")||"No bio set."}
              </p>

              {/* Location + join date */}
              <div className="flex flex-col gap-1 text-[12px] text-[#9ca3af]">
                {(u.profile?.location || u.selected_country_name) && (
                  <span className="flex items-center gap-1.5">
                    <MapPin size={12} className="text-[#fe2c55] shrink-0"/>
                    <span className="truncate">{u.profile?.location ?? u.selected_country_name}</span>
                  </span>
                )}
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} className="text-[#9ca3af] shrink-0"/>
                  Joined {new Date(u.created_at).toLocaleDateString("en-US",{month:"short",year:"numeric"})}
                </span>
              </div>
            </div>

            {/* ── Right: Stats ── */}
            <div className="flex-1 min-w-0 flex flex-col">
              {/* Top row: Level | User ID | Local Login | Following | Followers */}
              <div className="flex-1 grid grid-cols-5 divide-x divide-[#f0f1f3]">

                {/* Level */}
                <div className="px-4 py-4 flex items-center gap-2.5">
                  <div className="shrink-0 h-9 w-9 rounded-xl bg-[#fe2c55] flex items-center justify-center shadow-sm">
                    <svg width="16" height="16" viewBox="0 0 20 20" fill="white">
                      <path d="M10 1 L19 10 L10 19 L1 10 Z" />
                      <path d="M10 5 L15 10 L10 15 L5 10 Z" fill="rgba(255,255,255,0.35)"/>
                    </svg>
                  </div>
                  <div>
                    <p className="text-[14px] font-extrabold text-[#111827] leading-tight">
                      {u.role === 'creator' ? `Level ${u.creator_level?.level_number ?? 1}` : "-"}
                    </p>
                    <p className="text-[11px] text-[#9ca3af] leading-tight">
                      {u.role === 'creator' ? (u.creator_level?.level_name ?? "-") : "Normal User"}
                    </p>
                  </div>
                </div>

                {/* User ID */}
                <div className="px-4 py-4">
                  <p className="text-[11px] text-[#9ca3af] mb-1.5">User ID</p>
                  <p className="text-[13px] font-bold text-[#111827] font-mono tracking-tight">{u.id}</p>
                </div>

                {/* Status */}
                <div className="px-4 py-4">
                  <p className="text-[11px] text-[#9ca3af] mb-1.5">Status</p>
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${u.computed_status === 'online' ? 'bg-emerald-500 shadow-[0_0_0_2px_#d1fae5]' : 'bg-[#d1d5db]'}`}/>
                    <p className="text-[12px] font-bold text-[#111827]">
                      {u.computed_status === 'online' ? 'Online' : 'Offline'}
                    </p>
                  </div>
                  <p className="text-[11px] text-[#6b7280] leading-tight truncate">
                    {u.computed_status === 'online'
                      ? 'Active now'
                      : u.last_active_at
                        ? `Active ${timeAgo(u.last_active_at)}`
                        : 'Never active'}
                  </p>
                  {u.last_login_at && (
                    <p className="text-[10px] text-[#9ca3af] mt-0.5 leading-tight truncate">
                      {'Login: ' + new Date(u.last_login_at).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric'})}
                    </p>
                  )}
                </div>

                {/* Following */}
                <div className="px-4 py-4">
                  <p className="text-[11px] text-[#9ca3af] mb-1.5">Following</p>
                  <p className="text-[20px] font-extrabold text-[#111827] leading-tight">
                    {formatCompact(u.profile?.total_following ?? u.following_count)}
                  </p>
                </div>

                {/* Followers */}
                <div className="px-4 py-4">
                  <p className="text-[11px] text-[#9ca3af] mb-1.5">Followers</p>
                  <p className="text-[20px] font-extrabold text-[#111827] leading-tight">
                    {formatCompact(u.profile?.total_followers ?? u.followers_count)}
                  </p>
                </div>
              </div>

              {/* ── Stats row ── */}
              <div className="border-t border-[#f0f1f3] grid grid-cols-5 divide-x divide-[#f0f1f3]">
                {([
                  ["Total Likes",   formatCompact(u.profile?.total_likes ?? 0)],
                  ["Total Views",   formatCompact(u.content_summary.total_views)],
                  ["Active Days",    u.total_active_days > 0 ? String(u.total_active_days) : "-"],
                  ["Profile Views", formatCompact(u.profile?.profile_views ?? 0)],
                  ["Country",       u.selected_country_name ?? u.country ?? "-"],
                ] as [string,string][]).map(([label, value]) => (
                  <div key={label} className="px-4 py-3">
                    <p className="text-[15px] font-extrabold text-[#111827]">{value}</p>
                    <p className="text-[11px] text-[#9ca3af] mt-0.5">{label}</p>
                  </div>
                ))}
              </div>

              {/* ── Action buttons ── */}
              <div className="border-t border-[#f0f1f3] px-4 py-3 flex flex-wrap items-center gap-2">
                {/* Edit User */}
                <button onClick={() => {
                  setEditForm({name:u.name,username:u.username,email:u.email,bio:u.bio??'',phone:u.phone??'',role:u.role,categories:u.categories??[],interests:u.interests??[]});
                  setEditAvatarFile(null);
                  setEditAvatarPreview(u.avatar ?? null);
                  setModal({type:"edituser",open:true});
                }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#e8eaed] text-[12.5px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                  <Edit2 size={13}/>Edit User
                </button>

                {/* Verify / Remove badge */}
                {u.is_verified ? (
                  <button disabled={verify.isPending} onClick={() => verify.mutate()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-[12.5px] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                    <ShieldOff size={13}/>Remove Badge
                  </button>
                ) : (
                  <button disabled={verify.isPending} onClick={() => verify.mutate()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-300 text-[12.5px] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                    <ShieldCheck size={13}/>Verify
                  </button>
                )}

                {/* Suspend / Unban */}
                {u.is_banned ? (
                  <button disabled={unban.isPending} onClick={() => unban.mutate()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-[12.5px] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                    <UserCheck size={13}/>Unban
                  </button>
                ) : !u.is_active ? (
                  <button disabled={unsuspend.isPending} onClick={() => unsuspend.mutate()}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-emerald-200 text-[12.5px] font-semibold text-emerald-600 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                    <UserCheck size={13}/>Unsuspend
                  </button>
                ) : (
                  <button onClick={() => setModal({type:"suspend",open:true})}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-orange-200 text-[12.5px] font-semibold text-orange-500 hover:bg-orange-50 transition-colors">
                    <Pause size={13}/>Suspend
                  </button>
                )}

                {/* Message */}
                <button onClick={() => { setMsgText(""); setModal({type:"message",open:true}); }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#e8eaed] text-[12.5px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                  <MessageSquare size={13}/>Message
                </button>

                {/* View Public Profile */}
                <button onClick={() => window.open(`https://teezer.live/profile/${u.username}`,"_blank")}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#e8eaed] text-[12.5px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                  <ExternalLink size={13}/>View Public Profile
                </button>

                {/* More dropdown */}
                <div className="relative ml-auto">
                  <button onClick={() => setMoreOpen(v => !v)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-[#e8eaed] text-[12.5px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                    More<ChevronDown size={13}/>
                  </button>
                  {moreOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMoreOpen(false)}/>
                      <div className="absolute right-0 top-full z-20 mt-1.5 w-48 rounded-2xl border border-[#e8eaed] bg-white p-1.5 shadow-xl">
                        {[
                          { label:"View Reports",   fn: () => setTab("reports")  },
                          { label:"View Content",   fn: () => setTab("content")  },
                          { label:"View Comments",  fn: () => setTab("comments") },
                          { label:"Reset Password", fn: () => setModal({type:"resetpass",open:true}) },
                        ].map(({label,fn}) => (
                          <button key={label} onClick={() => { fn(); setMoreOpen(false); }}
                            className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                            {label}
                          </button>
                        ))}
                        <div className="my-1 border-t border-[#e8eaed]"/>
                        <button onClick={() => { setMoreOpen(false); setModal({type:"delete",open:true}); }}
                          className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-semibold text-red-500 hover:bg-red-50 transition-colors">
                          <Trash2 size={13}/> Delete Account
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Tabs ── */}
        <div className="flex overflow-x-auto scrollbar-hide bg-white rounded-2xl border border-[#e8eaed] shadow-sm">
          {TABS.map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`shrink-0 flex items-center gap-1.5 border-b-2 px-4 py-3 text-[12px] font-semibold transition-colors whitespace-nowrap
                ${tab===t.key?"border-[#fe2c55] text-[#fe2c55]":"border-transparent text-[#6b7280] hover:text-[#111827]"}`}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* ── Two-column layout ── */}
        <div className="flex gap-5 items-start">

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-5">
            {tab==="overview" && (
              <>
                <div className="grid gap-5 xl:grid-cols-2">
                  <ContentRestrictionsSection user={u} qKey={qKey.join("-")}/>
                  <ModerationSettingsSection  user={u} qKey={qKey.join("-")}/>
                </div>
                <div className="grid gap-5 xl:grid-cols-2">
                  <PermissionsSection user={u} qKey={qKey.join("-")}/>
                  <SafetySection      user={u} qKey={qKey.join("-")}/>
                </div>
                <TimelineSection timeline={u.timeline}/>
              </>
            )}
            {tab==="content"      && <ContentTab      user={u}/>}
            {tab==="messages"     && <MessagesTab userId={u.id}/>}
            {tab==="comments"     && <CommentsTab  user={u}/>}
            {tab==="analytics"    && <AnalyticsTab      user={u}/>}
            {tab==="security"     && <SecurityTab     user={u}/>}
            {tab==="monetization" && <MonetizationTab userId={u.id}/>}
            {tab==="finance"      && <FinanceTaxTab userId={u.id}/>}
            {tab==="ads"          && <AdsControlTab userId={u.id}/>}
            {tab==="reports"      && <ReportsTab       user={u}/>}
            {tab==="verification" && (
              <VerificationReview userId={u.id} username={u.username} isVerified={u.is_verified}/>
            )}
            {tab==="audit"        && <AuditLogTab user={u}/>}
          </div>

          {/* ── Right Sidebar (Overview tab only) ── */}
          {tab === "overview" && (
          <div className="hidden xl:flex flex-col gap-4 w-[280px] shrink-0 sticky top-4">

            {/* Quick Stats */}
            <QuickStatsCard userId={u.id} defaultStats={u.quick_stats}/>

            {/* Moderation Summary */}
            <div className="bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3">
                <p className="text-[13px] font-bold text-[#111827]">Moderation Summary</p>
                <span className="text-[11px] text-[#9ca3af]">This Month</span>
              </div>
              <div className="px-4 py-3 space-y-3">
                {[
                  {label:"Reports Received", value:u.reports_received,  color:"#f59e0b"},
                  {label:"Content Removed",  value:u.content_removed,   color:"#3b82f6"},
                  {label:"Policy Violations",value:u.policy_violations, color:"#fe2c55"},
                  {label:"Open Appeals",     value:u.open_appeals,      color:"#10b981"},
                ].map(({label,value,color})=>(
                  <div key={label} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-2 rounded-full shrink-0" style={{background:color}}/>
                      <span className="text-[12px] text-[#6b7280]">{label}</span>
                    </div>
                    <span className="text-[13px] font-bold text-[#111827]">{value}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Support Tickets */}
            <SupportTicketsCard/>

            {/* Admin Notes */}
            <AdminNotesPanel user={u} qKey={qKey.join("-")}/>

            {/* Risk Score + Account Health */}
            <RiskHealthCard user={u}/>

          </div>
          )}{/* /sidebar */}
        </div>{/* /two-col */}
      </div>

      {/* ── Action Modals ── */}
      <Modal open={modal.type==="suspend"&&modal.open}
        title={`Suspend ${u.name}?`} message="User account will be suspended and signed out. Optionally choose an end date."
        confirmLabel="Suspend User" danger loading={suspend.isPending}
        onCancel={()=>{setModal({type:"",open:false});setModalReason("");setHeaderSuspendUntil("");}}
        onConfirm={()=>suspend.mutate(modalReason||"Suspended by admin")}>
        <input value={modalReason} onChange={e=>setModalReason(e.target.value)}
          placeholder="Suspension reason…"
          className="mt-2 h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[13px] outline-none focus:border-[#fe2c55]"/>
        <div className="mt-2 space-y-1.5">
          <p className="text-[11px] text-[#9ca3af]">Suspend until (optional):</p>
          <div className="flex flex-wrap gap-1">
            {([["24h",1],["7d",7],["30d",30]] as [string,number][]).map(([lbl,d])=>(
              <button key={lbl} type="button"
                onClick={()=>{const dt=new Date();dt.setDate(dt.getDate()+d);dt.setHours(23,59,0,0);setHeaderSuspendUntil(toLocalDTL(dt));}}
                className="px-2 py-0.5 rounded-lg border border-[#e8eaed] text-[11px] text-[#374151] hover:border-[#fe2c55] hover:text-[#fe2c55] transition-colors">
                {lbl}
              </button>
            ))}
            <button type="button" onClick={()=>setHeaderSuspendUntil("")}
              className="px-2 py-0.5 rounded-lg border border-[#e8eaed] text-[11px] text-[#9ca3af] hover:text-[#374151] transition-colors">
              Indefinite
            </button>
          </div>
          <input type="datetime-local" value={headerSuspendUntil} min={toLocalDTL(new Date())}
            onChange={e=>setHeaderSuspendUntil(e.target.value)}
            className="h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[12px] outline-none focus:border-[#fe2c55]"/>
        </div>
      </Modal>
      <Modal open={modal.type==="ban"&&modal.open}
        title={`Ban ${u.name}?`} message="User will be permanently banned and all sessions invalidated."
        confirmLabel="Ban User" danger loading={ban.isPending}
        onCancel={()=>{setModal({type:"",open:false});setModalReason("");}}
        onConfirm={()=>ban.mutate(modalReason||"Banned by admin")}>
        <input value={modalReason} onChange={e=>setModalReason(e.target.value)}
          placeholder="Ban reason…"
          className="mt-2 h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[13px] outline-none focus:border-[#fe2c55]"/>
      </Modal>
      <Modal open={modal.type==="resetpass"&&modal.open}
        title="Reset Password?" message="A new temporary password will be generated and all sessions cleared."
        confirmLabel="Reset Password" loading={reset.isPending}
        onCancel={()=>setModal({type:"",open:false})}
        onConfirm={()=>reset.mutate()}/>
      <Modal open={modal.type==="delete"&&modal.open}
        title={`Delete ${u.name}?`} message="This permanently deletes the user and all their content. This action cannot be undone."
        confirmLabel="Delete Account" danger loading={delUser.isPending}
        onCancel={()=>setModal({type:"",open:false})}
        onConfirm={()=>delUser.mutate()}/>

      {/* ── Message User modal ── */}
      <Modal open={modal.type==="message"&&modal.open}
        title={`Message ${u.name}`} message="This will be sent as a System Notification to the user."
        confirmLabel="Send Message" loading={sendMsg.isPending}
        onCancel={()=>{setModal({type:"",open:false});setMsgText("");}}
        onConfirm={()=>{ if(msgText.trim()) sendMsg.mutate(); }}>
        <textarea value={msgText} onChange={e=>setMsgText(e.target.value)} rows={4}
          placeholder="Type your message to the user…"
          className="mt-2 w-full rounded-[10px] border border-[#e8eaed] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55] resize-none"/>
        <p className="mt-1 text-[11px] text-[#9ca3af]">The user will see this as a &quot;System Notification&quot; in their notifications.</p>
      </Modal>

      {/* ── Edit User modal ── */}
      {modal.type==="edituser"&&modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#e8eaed] shrink-0">
              <h3 className="text-[15px] font-bold text-[#111827]">Edit User</h3>
              <button onClick={()=>{setModal({type:"",open:false});setEditAvatarFile(null);setEditAvatarPreview(null);}} className="text-[#9ca3af] hover:text-[#374151]"><X size={18}/></button>
            </div>

            {/* Scrollable body */}
            <div className="overflow-y-auto flex-1 p-5 space-y-5">

              {/* ── Profile Picture ── */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7280] mb-2 uppercase tracking-wide">Profile Picture</label>
                <div className="flex items-center gap-4">
                  <div className="relative shrink-0">
                    <div className="h-20 w-20 rounded-full overflow-hidden border-2 border-[#e8eaed] bg-[#f3f4f6]">
                      {editAvatarPreview
                        ? <img src={editAvatarPreview} alt="" className="h-full w-full object-cover"/>
                        : <div className="h-full w-full grid place-items-center text-[28px] font-black text-[#fe2c55]">{(editForm.name||"U")[0]?.toUpperCase()}</div>
                      }
                    </div>
                    <button type="button"
                      onClick={()=>editAvatarInputRef.current?.click()}
                      className="absolute bottom-0 right-0 h-6 w-6 rounded-full bg-[#fe2c55] text-white grid place-items-center shadow-md hover:bg-[#e02249] transition-colors">
                      <Camera size={11}/>
                    </button>
                  </div>
                  <div>
                    <button type="button"
                      onClick={()=>editAvatarInputRef.current?.click()}
                      className="text-[12px] font-semibold text-[#fe2c55] hover:underline">
                      Change photo
                    </button>
                    {editAvatarFile && (
                      <button type="button" onClick={()=>{setEditAvatarFile(null);setEditAvatarPreview(u.avatar??null);}}
                        className="ml-3 text-[12px] text-[#9ca3af] hover:text-red-500 transition-colors">
                        Remove
                      </button>
                    )}
                    <p className="text-[11px] text-[#9ca3af] mt-0.5">JPG, PNG, GIF or WebP · Max 4 MB</p>
                  </div>
                  <input ref={editAvatarInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e=>{
                      const f=e.target.files?.[0];
                      if(!f) return;
                      setEditAvatarFile(f);
                      const reader=new FileReader();
                      reader.onload=ev=>setEditAvatarPreview(ev.target?.result as string);
                      reader.readAsDataURL(f);
                      e.target.value="";
                    }}/>
                </div>
              </div>

              {/* ── Basic Info (2 col) ── */}
              <div className="grid grid-cols-2 gap-3">
                {([
                  {label:"Full Name",  key:"name",     type:"text"},
                  {label:"Username",   key:"username", type:"text"},
                  {label:"Email",      key:"email",    type:"email"},
                  {label:"Phone",      key:"phone",    type:"tel"},
                ] as {label:string;key:string;type:string}[]).map(({label,key,type})=>(
                  <div key={key}>
                    <label className="block text-[11px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">{label}</label>
                    <input type={type} value={editForm[key as keyof typeof editForm] as string}
                      onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))}
                      className="h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[13px] outline-none focus:border-[#fe2c55]"/>
                  </div>
                ))}
              </div>

              {/* ── Bio ── */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">Bio</label>
                <textarea value={editForm.bio} onChange={e=>setEditForm(f=>({...f,bio:e.target.value}))} rows={2}
                  className="w-full rounded-[10px] border border-[#e8eaed] px-3 py-2 text-[13px] outline-none focus:border-[#fe2c55] resize-none"/>
              </div>

              {/* ── Categories (max 3) ── */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">
                  Categories <span className="normal-case text-[#9ca3af] font-normal">(max 3 - shown on public profile)</span>
                </label>
                <AdminTagPicker
                  selected={editForm.categories}
                  onChange={v=>setEditForm(f=>({...f,categories:v}))}
                  options={PROFILE_CATEGORIES}
                  max={3}
                  noun="categories"/>
              </div>

              {/* ── Interests (max 20) ── */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">
                  Interests <span className="normal-case text-[#9ca3af] font-normal">(max 20)</span>
                </label>
                <AdminTagPicker
                  selected={editForm.interests}
                  onChange={v=>setEditForm(f=>({...f,interests:v}))}
                  options={ALL_INTERESTS}
                  max={20}
                  noun="interests"/>
              </div>

              {/* ── Role ── */}
              <div>
                <label className="block text-[11px] font-semibold text-[#6b7280] mb-1 uppercase tracking-wide">Role</label>
                <select value={editForm.role} onChange={e=>setEditForm(f=>({...f,role:e.target.value}))}
                  className="h-9 w-full rounded-[10px] border border-[#e8eaed] px-3 text-[13px] outline-none focus:border-[#fe2c55] bg-white">
                  <option value="user">User</option>
                  <option value="creator">Creator</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#e8eaed] bg-[#fafafa] shrink-0">
              <button onClick={()=>{setModal({type:"",open:false});setEditAvatarFile(null);setEditAvatarPreview(null);}}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-[#374151] border border-[#e8eaed] hover:bg-[#f3f4f6] transition-colors">
                Cancel
              </button>
              <button disabled={saveEdit.isPending} onClick={()=>saveEdit.mutate()}
                className="px-4 py-2 rounded-xl text-[13px] font-semibold text-white bg-[#fe2c55] hover:bg-[#e02249] transition-colors disabled:opacity-50 flex items-center gap-1.5">
                <Save size={13}/>{saveEdit.isPending?"Saving…":"Save Changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
