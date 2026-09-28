"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import { toast } from "sonner";
import {
  AtSign, Ban, ChevronDown, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight,
  EyeOff, Flag, Heart, Image as ImageIcon, Layers, Mail, MessageCircle, MessageSquare,
  MoreHorizontal, Pin, RefreshCw, Reply, Search, Send, Shield, Smile, Trash2, Video, X,
} from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import {
  studioCommentService as svc,
  type StudioComment, type StudioCommentStats, type StudioStatusFilter,
  type StudioSortOption, type StudioBulkAction,
} from "@/services/studio-comment.service";
import type { Comment } from "@/services/comment.service";

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n?: number | null) { return formatCompact(n ?? 0); }

function relTime(iso?: string | null): string {
  if (!iso) return "";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60); if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60); if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24); if (d < 7) return `${d}d ago`;
  const w = Math.floor(d / 7); if (w < 5) return `${w}w ago`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function joinedLabel(iso?: string | null): string {
  if (!iso) return "";
  return `Joined ${new Date(iso).toLocaleDateString("en-US", { month: "short", year: "numeric" })}`;
}
function useDebounce<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}
function pageNumbers(cur: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const set = new Set<number>([1, 2]);
  if (cur > 3) set.add(cur - 1);
  set.add(cur);
  if (cur < last - 1) set.add(cur + 1);
  set.add(last - 1); set.add(last);
  const out: (number | "…")[] = [];
  [...set].sort((a, b) => a - b).forEach((n, i, arr) => {
    if (i > 0 && n - arr[i - 1] > 1) out.push("…");
    out.push(n);
  });
  return out;
}

/* ── Status config ──────────────────────────────────────────────────────── */
const STATUS_CFG: Record<StudioComment["status"], { cls: string; label: string }> = {
  needs_reply: { cls: "bg-[#fff7ed] text-[#c2410c]", label: "Needs Reply" },
  unread:      { cls: "bg-[#f5f3ff] text-[#7c3aed]", label: "Unread" },
  replied:     { cls: "bg-[#dcfce7] text-[#15803d]", label: "Replied" },
  held:        { cls: "bg-[#fef9c3] text-[#a16207]", label: "Held for Review" },
  spam:        { cls: "bg-[#fee2e2] text-[#dc2626]", label: "Spam" },
};
function StatusPill({ status }: { status: StudioComment["status"] }) {
  const cfg = STATUS_CFG[status];
  return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold", cfg.cls)}>{cfg.label}</span>;
}

/* ── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ src, name, size = 36 }: { src?: string | null; name?: string | null; size?: number }) {
  const initials = (name || "U").trim()[0]?.toUpperCase() ?? "U";
  return src
    // eslint-disable-next-line @next/next/no-img-element
    ? <img src={src} alt={name ?? ""} className="flex-shrink-0 rounded-full object-cover" style={{ width: size, height: size }} />
    : <div className="grid flex-shrink-0 place-items-center rounded-full bg-[#fe2c55] font-bold text-white"
        style={{ width: size, height: size, fontSize: size * 0.4 }}>{initials}</div>;
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub, subColor, active, onClick, loading }: {
  icon: React.ElementType; iconBg: string; iconColor: string; label: string;
  value: number; sub: React.ReactNode; subColor?: string; active?: boolean; onClick?: () => void; loading?: boolean;
}) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "flex min-w-0 flex-1 flex-col gap-2 rounded-2xl border bg-white px-4 py-3 text-left transition",
        active ? "border-[#fe2c55] ring-1 ring-[#fe2c55]" : "border-[#f0f0f0] hover:border-[#e5e7eb] hover:shadow-sm",
      )}>
      <div className="flex items-center gap-2">
        <div className={cn("grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg", iconBg)}>
          <Icon className={cn("h-4 w-4", iconColor)} />
        </div>
        <span className="truncate text-[12px] font-semibold text-[#6b7280]">{label}</span>
      </div>
      {loading
        ? <div className="h-7 w-16 animate-pulse rounded bg-[#f3f4f6]" />
        : <p className="text-[24px] font-extrabold leading-none text-[#111827]">{value.toLocaleString()}</p>}
      <p className={cn("truncate text-[11px]", subColor ?? "text-[#9ca3af]")}>{sub}</p>
    </button>
  );
}

/* ── Generic dropdown ───────────────────────────────────────────────────── */
function Dropdown<T extends string>({ value, options, onChange, icon: Icon, width = 170 }: {
  value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; icon?: React.ElementType; width?: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const current = options.find(o => o.value === value) ?? options[0];
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-3.5 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fe2c55]">
        {Icon && <Icon className="h-4 w-4 text-[#9ca3af]" />}
        <span className="whitespace-nowrap">{current?.label}</span>
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl"
          style={{ width }}>
          {options.map(o => (
            <button key={o.value} type="button" onClick={() => { onChange(o.value); setOpen(false); }}
              className={cn("flex w-full items-center px-3.5 py-2.5 text-left text-[13px] transition",
                o.value === value ? "bg-[#fff0f4] font-semibold text-[#fe2c55]" : "text-[#374151] hover:bg-[#f8f9fb]")}>
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Row action icon ────────────────────────────────────────────────────── */
function IconAction({ icon: Icon, label, onClick, active, color }: {
  icon: React.ElementType; label: string; onClick: (e: React.MouseEvent) => void; active?: boolean; color?: string;
}) {
  return (
    <button type="button" title={label}
      onClick={(e) => { e.stopPropagation(); onClick(e); }}
      className={cn("grid h-7 w-7 place-items-center rounded-lg transition hover:bg-[#f3f4f6]",
        active ? "text-[#fe2c55]" : color ?? "text-[#9ca3af] hover:text-[#374151]")}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  );
}

/* ══════════════════════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════════════════════ */
const SAVED_REPLIES = [
  "Thanks so much! 🙌",
  "Appreciate the support! ❤️",
  "Great question - I'll cover that in an upcoming video!",
  "Glad you enjoyed it! 🔥",
];

export function StudioCommentsPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user, isAuthenticated, authReady } = useAuthStore();

  const [collapsed, setCollapsed] = useState(false);
  const [status, setStatus]       = useState<StudioStatusFilter>("all");
  const [sort, setSort]           = useState<StudioSortOption>("top");
  const [contentId, setContentId] = useState<number | "all">("all");
  const [time, setTime]           = useState<"all" | "7d" | "30d" | "90d">("all");
  const [search, setSearch]       = useState("");
  const [page, setPage]           = useState(1);
  const [perPage, setPerPage]     = useState(20);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [openId, setOpenId]       = useState<number | null>(null);
  const [bulkOpen, setBulkOpen]   = useState(false);
  const bulkRef = useRef<HTMLDivElement>(null);

  const dSearch = useDebounce(search, 400);

  useEffect(() => { if (authReady && !isAuthenticated) router.replace("/"); }, [authReady, isAuthenticated, router]);
  useEffect(() => { setPage(1); }, [status, sort, contentId, time, dSearch, perPage]);
  useEffect(() => { setSelectedIds(new Set()); }, [status, sort, contentId, time, dSearch, page]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!bulkRef.current?.contains(e.target as Node)) setBulkOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const dateParams = useMemo(() => {
    if (time === "all") return {};
    const days = time === "7d" ? 7 : time === "30d" ? 30 : 90;
    return { start_date: new Date(Date.now() - (days - 1) * 86400000).toISOString().split("T")[0] };
  }, [time]);

  const scopeParams = useMemo(() => ({
    ...(contentId !== "all" && { content_id: contentId }),
    ...dateParams,
  }), [contentId, dateParams]);

  const listParams = useMemo(() => ({
    ...scopeParams,
    status, sort, page, per_page: perPage,
    ...(dSearch && { search: dSearch }),
  }), [scopeParams, status, sort, page, perPage, dSearch]);

  /* ── Queries ── */
  const listQ = useQuery({
    queryKey: ["studio-comments", listParams],
    queryFn: () => svc.list(listParams),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const statsQ = useQuery({
    queryKey: ["studio-comments-stats", scopeParams],
    queryFn: () => svc.stats(scopeParams).then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const contentsQ = useQuery({
    queryKey: ["studio-comments-contents"],
    queryFn: () => svc.contents().then(r => r.data),
    enabled: isAuthenticated,
    staleTime: 300_000,
  });

  const comments = listQ.data?.data ?? [];
  const meta = listQ.data?.meta;
  const stats: StudioCommentStats | undefined = statsQ.data;
  const openComment = comments.find(c => c.id === openId) ?? null;

  function refreshAll() {
    void qc.invalidateQueries({ queryKey: ["studio-comments"] });
    void qc.invalidateQueries({ queryKey: ["studio-comments-stats"] });
  }

  /* ── Generic action mutation ── */
  const actionMut = useMutation({
    mutationFn: ({ fn }: { fn: () => Promise<unknown>; msg?: string }) => fn(),
    onSuccess: (_d, v) => { if (v.msg) toast.success(v.msg); refreshAll(); },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? "Action failed."),
  });
  const act = (fn: () => Promise<unknown>, msg?: string) => actionMut.mutate({ fn, msg });

  const bulkMut = useMutation({
    mutationFn: ({ action, ids }: { action: StudioBulkAction; ids: number[] }) => svc.bulk(action, ids),
    onSuccess: (_d, v) => { toast.success(`Bulk ${v.action} applied.`); setSelectedIds(new Set()); setBulkOpen(false); refreshAll(); },
    onError: () => toast.error("Bulk action failed."),
  });

  /* ── Selection ── */
  const allSelected = comments.length > 0 && comments.every(c => selectedIds.has(c.id));
  function toggleAll() { setSelectedIds(allSelected ? new Set() : new Set(comments.map(c => c.id))); }
  function toggleOne(id: number) {
    setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  function openDetail(c: StudioComment) {
    setOpenId(c.id);
    if (!c.seen) svc.markSeen(c.id).then(refreshAll).catch(() => {});
  }

  const STAT_CARDS = [
    { key: "all" as const, icon: MessageSquare, iconBg: "bg-[#eff6ff]", iconColor: "text-[#2563eb]",
      label: "All Comments", value: stats?.all ?? 0,
      sub: stats ? <span className={stats.trend_7d >= 0 ? "text-[#16a34a]" : "text-[#dc2626]"}>{stats.trend_7d >= 0 ? "↑" : "↓"} {Math.abs(stats.trend_7d)}% vs last 7 days</span> : "-" },
    { key: "unread" as const, icon: Mail, iconBg: "bg-[#f5f3ff]", iconColor: "text-[#7c3aed]",
      label: "Unread", value: stats?.unread ?? 0,
      sub: stats && stats.all > 0 ? `${((stats.unread / stats.all) * 100).toFixed(1)}% of all comments` : "All caught up" },
    { key: "needs_reply" as const, icon: AtSign, iconBg: "bg-[#fff7ed]", iconColor: "text-[#f97316]",
      label: "Needs Reply", value: stats?.needs_reply ?? 0, subColor: "text-[#f97316]", sub: "Waiting for your reply" },
    { key: "held" as const, icon: Shield, iconBg: "bg-[#fefce8]", iconColor: "text-[#ca8a04]",
      label: "Held for Review", value: stats?.held ?? 0, subColor: "text-[#dc2626]", sub: "Review required" },
    { key: "spam" as const, icon: Flag, iconBg: "bg-[#fef2f2]", iconColor: "text-[#dc2626]",
      label: "Spam", value: stats?.spam ?? 0, subColor: "text-[#dc2626]", sub: "Potential spam" },
  ];

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} activeHref="/studio/comments" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared dateRange={{ start: new Date(), end: new Date() }} onDateRangeChange={() => {}} />

        <div className="flex min-h-0 flex-1">
          {/* ── Left: list ── */}
          <div className="flex min-w-0 flex-1 flex-col overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
            <div className="space-y-4 p-6">
              {/* Heading */}
              <div>
                <h1 className="text-[26px] font-black leading-tight text-[#111827]">Comments</h1>
                <p className="mt-0.5 text-[13px] text-[#6b7280]">Manage, reply to, and moderate comments across your content.</p>
              </div>

              {/* Stat cards */}
              <div className="flex flex-wrap gap-3">
                {STAT_CARDS.map(card => (
                  <StatCard key={card.key} icon={card.icon} iconBg={card.iconBg} iconColor={card.iconColor}
                    label={card.label} value={card.value} sub={card.sub} subColor={card.subColor}
                    loading={statsQ.isLoading}
                    active={status === card.key || (card.key === "all" && status === "all")}
                    onClick={() => setStatus(card.key === "all" ? "all" : card.key)} />
                ))}
              </div>

              {/* Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5 rounded-2xl border border-[#f0f0f0] bg-white p-3">
                <div className="relative min-w-[200px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                  <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search comments..."
                    className="w-full rounded-xl border border-[#e5e7eb] bg-white py-2.5 pl-9 pr-8 text-[13px] outline-none transition focus:border-[#fe2c55]" />
                  {search && (
                    <button type="button" onClick={() => setSearch("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]"><X className="h-3.5 w-3.5" /></button>
                  )}
                </div>

                <Dropdown<string> value={String(contentId)} width={240} icon={Layers}
                  options={[{ value: "all", label: "All Content" },
                    ...(contentsQ.data ?? []).map(c => ({ value: String(c.id), label: `${c.title} (${c.comments_count})` }))]}
                  onChange={v => setContentId(v === "all" ? "all" : Number(v))} />

                <Dropdown<StudioStatusFilter> value={status}
                  options={[
                    { value: "all", label: "All Status" },
                    { value: "unread", label: "Unread" },
                    { value: "needs_reply", label: "Needs Reply" },
                    { value: "replied", label: "Replied" },
                    { value: "held", label: "Held for Review" },
                    { value: "spam", label: "Spam" },
                  ]} onChange={setStatus} />

                <Dropdown<StudioSortOption> value={sort} width={190}
                  options={[
                    { value: "top", label: "Top Comments First" },
                    { value: "newest", label: "Newest First" },
                    { value: "oldest", label: "Oldest First" },
                    { value: "most_liked", label: "Most Liked" },
                    { value: "most_replied", label: "Most Replied" },
                  ]} onChange={setSort} />

                <Dropdown<"all" | "7d" | "30d" | "90d"> value={time} width={150}
                  options={[
                    { value: "all", label: "All Time" },
                    { value: "7d", label: "Last 7 days" },
                    { value: "30d", label: "Last 30 days" },
                    { value: "90d", label: "Last 90 days" },
                  ]} onChange={setTime} />

                <button type="button" title="Refresh" onClick={refreshAll}
                  className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
                  <RefreshCw className={cn("h-4 w-4", listQ.isFetching && "animate-spin")} />
                </button>

                {/* Bulk actions */}
                <div ref={bulkRef} className="relative flex-shrink-0">
                  <button type="button" onClick={() => setBulkOpen(o => !o)}
                    className={cn("flex items-center gap-2 rounded-xl border bg-white px-3.5 py-2.5 text-[13px] font-semibold transition",
                      selectedIds.size > 0 ? "border-[#fe2c55] text-[#fe2c55]" : "border-[#e5e7eb] text-[#374151] hover:border-[#fe2c55]")}>
                    Bulk Actions
                    {selectedIds.size > 0 && <span className="grid h-5 min-w-[20px] place-items-center rounded-full bg-[#fe2c55] px-1 text-[10px] font-bold text-white">{selectedIds.size}</span>}
                    <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", bulkOpen && "rotate-180")} />
                  </button>
                  {bulkOpen && (
                    <div className="absolute right-0 top-full z-20 mt-1 w-[200px] overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
                      {selectedIds.size === 0 && <p className="px-4 py-2 text-[11px] text-[#9ca3af]">Select comments first</p>}
                      {([
                        { action: "read", label: "Mark as Read", cls: "text-[#374151]" },
                        { action: "hold", label: "Hold for Review", cls: "text-[#a16207]" },
                        { action: "hide", label: "Hide", cls: "text-[#374151]" },
                        { action: "spam", label: "Mark as Spam", cls: "text-[#dc2626]" },
                        { action: "delete", label: "Delete", cls: "text-red-500" },
                      ] as { action: StudioBulkAction; label: string; cls: string }[]).map(b => (
                        <button key={b.action} type="button" disabled={selectedIds.size === 0 || bulkMut.isPending}
                          onClick={() => bulkMut.mutate({ action: b.action, ids: [...selectedIds] })}
                          className={cn("flex w-full items-center justify-between px-4 py-2.5 text-[13px] transition hover:bg-[#f8f9fb] disabled:opacity-40", b.cls)}>
                          {b.label}{selectedIds.size > 0 && <span className="text-[11px] text-[#9ca3af]">({selectedIds.size})</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white">
                {/* Header */}
                <div className="flex items-center gap-3 border-b border-[#f0f0f0] bg-[#fafafa] px-4 py-2.5 text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]">
                  <input type="checkbox" checked={allSelected} onChange={toggleAll}
                    className="h-4 w-4 cursor-pointer rounded border-[#d1d5db] accent-[#fe2c55]" />
                  <div className="w-[150px] flex-shrink-0">Commenter</div>
                  <div className="min-w-0 flex-1">Comment</div>
                  <div className="hidden w-[150px] flex-shrink-0 lg:block">Content</div>
                  <button type="button" onClick={() => setSort(sort === "newest" ? "oldest" : "newest")}
                    className="flex w-[70px] flex-shrink-0 items-center gap-0.5 uppercase hover:text-[#374151]">Posted <ChevronDown className="h-3 w-3" /></button>
                  <button type="button" onClick={() => setSort("most_liked")}
                    className="hidden w-[90px] flex-shrink-0 items-center gap-0.5 uppercase hover:text-[#374151] md:flex">Engagement <ChevronDown className="h-3 w-3" /></button>
                  <div className="w-[110px] flex-shrink-0">Status</div>
                  <div className="w-[140px] flex-shrink-0 text-right">Actions</div>
                </div>

                {/* Rows */}
                {listQ.isLoading ? (
                  Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 border-b border-[#f5f5f5] px-4 py-3.5">
                      <div className="h-4 w-4 animate-pulse rounded bg-[#f3f4f6]" />
                      <div className="h-9 w-9 animate-pulse rounded-full bg-[#f3f4f6]" />
                      <div className="flex-1 space-y-2"><div className="h-3 w-3/4 animate-pulse rounded bg-[#f3f4f6]" /><div className="h-3 w-1/2 animate-pulse rounded bg-[#f3f4f6]" /></div>
                    </div>
                  ))
                ) : comments.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#f3f4f6]"><MessageCircle className="h-6 w-6 text-[#d1d5db]" /></div>
                    <p className="text-[14px] font-semibold text-[#374151]">{search ? `No comments match "${search}"` : "No comments here"}</p>
                    <p className="mt-1 text-[12px] text-[#9ca3af]">{status !== "all" ? "Try a different status filter." : "Comments on your content will appear here."}</p>
                  </div>
                ) : (
                  comments.map(c => (
                    <CommentRow key={c.id} c={c} selected={selectedIds.has(c.id)} active={openId === c.id}
                      onToggle={() => toggleOne(c.id)} onOpen={() => openDetail(c)}
                      onAction={act} busy={actionMut.isPending} />
                  ))
                )}
              </div>

              {/* Pagination */}
              {meta && meta.total > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="text-[12px] text-[#6b7280]">
                    Showing {meta.from}-{meta.to} of {meta.total.toLocaleString()} comments
                  </p>
                  <div className="flex items-center gap-3">
                    {meta.last_page > 1 && (
                      <div className="flex items-center gap-1">
                        <PagBtn icon={ChevronsLeft} disabled={page === 1} onClick={() => setPage(1)} />
                        <PagBtn icon={ChevronLeft} disabled={page === 1} onClick={() => setPage(p => Math.max(1, p - 1))} />
                        {pageNumbers(page, meta.last_page).map((p, i) => p === "…"
                          ? <span key={`e${i}`} className="grid h-8 w-8 place-items-center text-[#9ca3af]">…</span>
                          : <button key={p} type="button" onClick={() => setPage(p)}
                              className={cn("grid h-8 min-w-8 place-items-center rounded-lg px-2 text-[13px] font-semibold transition",
                                p === page ? "bg-[#fe2c55] text-white" : "border border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fe2c55]")}>{p}</button>)}
                        <PagBtn icon={ChevronRight} disabled={page === meta.last_page} onClick={() => setPage(p => Math.min(meta.last_page, p + 1))} />
                        <PagBtn icon={ChevronsRight} disabled={page === meta.last_page} onClick={() => setPage(meta.last_page)} />
                      </div>
                    )}
                    <Dropdown<string> value={String(perPage)} width={150}
                      options={[10, 20, 50].map(n => ({ value: String(n), label: `Show ${n} per page` }))}
                      onChange={v => setPerPage(Number(v))} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Right: detail panel ── */}
          <div className="hidden w-[380px] flex-shrink-0 border-l border-[#f0f0f0] bg-white xl:block">
            <DetailPanel comment={openComment} creatorName={user?.name ?? "You"} creatorAvatar={(user as { avatar?: string })?.avatar ?? null}
              onClose={() => setOpenId(null)} onAction={act} busy={actionMut.isPending} onReplied={refreshAll} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Pagination button ──────────────────────────────────────────────────── */
function PagBtn({ icon: Icon, disabled, onClick }: { icon: React.ElementType; disabled: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e7eb] bg-white text-[#374151] transition hover:border-[#fe2c55] disabled:opacity-40">
      <Icon className="h-4 w-4" />
    </button>
  );
}

/* ── Comment row ────────────────────────────────────────────────────────── */
function CommentRow({ c, selected, active, onToggle, onOpen, onAction, busy }: {
  c: StudioComment; selected: boolean; active: boolean; onToggle: () => void; onOpen: () => void;
  onAction: (fn: () => Promise<unknown>, msg?: string) => void; busy: boolean;
}) {
  return (
    <div onClick={onOpen}
      className={cn("flex cursor-pointer items-center gap-3 border-b border-[#f5f5f5] px-4 py-3.5 transition hover:bg-[#fafafa]",
        active && "bg-[#fff8f9]", selected && "bg-[#fff0f4]")}>
      <input type="checkbox" checked={selected} onClick={e => e.stopPropagation()} onChange={onToggle}
        className="h-4 w-4 cursor-pointer rounded border-[#d1d5db] accent-[#fe2c55]" />

      {/* Commenter */}
      <div className="flex w-[150px] flex-shrink-0 items-center gap-2">
        <Avatar src={c.user?.avatar} name={c.user?.name ?? c.user?.username} size={36} />
        <div className="min-w-0">
          <p className="truncate text-[13px] font-bold text-[#111827]">{c.user?.name ?? c.user?.username}</p>
          <p className="truncate text-[11px] text-[#9ca3af]">@{c.user?.username}</p>
        </div>
      </div>

      {/* Comment body */}
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-[13px] leading-snug text-[#374151]">{c.body || (c.gif_url ? "[GIF]" : "")}</p>
        {(c.is_pinned || c.is_hidden) && (
          <div className="mt-1 flex gap-1.5">
            {c.is_pinned && <span className="inline-flex items-center gap-0.5 rounded bg-[#fff0f4] px-1.5 py-0.5 text-[9px] font-bold text-[#fe2c55]"><Pin className="h-2.5 w-2.5" />Pinned</span>}
            {c.is_hidden && <span className="inline-flex items-center gap-0.5 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[9px] font-bold text-[#6b7280]"><EyeOff className="h-2.5 w-2.5" />Hidden</span>}
          </div>
        )}
      </div>

      {/* Content */}
      <div className="hidden w-[150px] flex-shrink-0 items-center gap-2 lg:flex">
        <div className="relative h-9 w-9 flex-shrink-0 overflow-hidden rounded-lg bg-[#f3f4f6]">
          {c.video?.thumbnail_url
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={c.video.thumbnail_url} alt="" className="h-full w-full object-cover" />
            : <div className="grid h-full w-full place-items-center">{c.video?.media_type?.startsWith("image") ? <ImageIcon className="h-4 w-4 text-[#d1d5db]" /> : <Video className="h-4 w-4 text-[#d1d5db]" />}</div>}
        </div>
        <Link href={`/videos/${c.video?.id}`} target="_blank" onClick={e => e.stopPropagation()}
          className="truncate text-[12px] font-semibold text-[#374151] hover:text-[#fe2c55]">{c.video?.title}</Link>
      </div>

      {/* Posted */}
      <div className="w-[70px] flex-shrink-0 text-[11px] text-[#6b7280]">{relTime(c.created_at)}</div>

      {/* Engagement */}
      <div className="hidden w-[90px] flex-shrink-0 items-center gap-2.5 text-[11px] text-[#6b7280] md:flex">
        <span className="flex items-center gap-0.5"><Heart className="h-3 w-3" />{fmt(c.love_count)}</span>
        <span className="flex items-center gap-0.5"><MessageCircle className="h-3 w-3" />{fmt(c.reply_count)}</span>
      </div>

      {/* Status */}
      <div className="w-[110px] flex-shrink-0"><StatusPill status={c.status} /></div>

      {/* Actions */}
      <div className="flex w-[140px] flex-shrink-0 items-center justify-end gap-0.5" onClick={e => e.stopPropagation()}>
        <IconAction icon={Reply} label="Reply" onClick={onOpen} active={c.status === "needs_reply"} />
        <IconAction icon={Pin} label={c.is_pinned ? "Unpin" : "Pin"} active={c.is_pinned}
          onClick={() => onAction(() => c.is_pinned ? svc.unpin(c.id) : svc.pin(c.id), c.is_pinned ? "Unpinned." : "Pinned.")} />
        <IconAction icon={EyeOff} label={c.is_hidden ? "Unhide" : "Hide"} active={c.is_hidden}
          onClick={() => onAction(() => c.is_hidden ? svc.unhide(c.id) : svc.hide(c.id), c.is_hidden ? "Restored." : "Hidden.")} />
        <IconAction icon={Flag} label={c.is_spam ? "Not spam" : "Mark as spam"} active={c.is_spam}
          onClick={() => onAction(() => c.is_spam ? svc.unspam(c.id) : svc.spam(c.id), c.is_spam ? "Removed from spam." : "Marked as spam.")} />
        <IconAction icon={Trash2} label="Delete" color="text-[#9ca3af] hover:text-red-500"
          onClick={() => { if (confirm("Delete this comment? This cannot be undone.")) onAction(() => svc.remove(c.id), "Deleted."); }} />
        <RowMenu c={c} onAction={onAction} disabled={busy} />
      </div>
    </div>
  );
}

/* ── Row overflow menu ──────────────────────────────────────────────────── */
function RowMenu({ c, onAction, disabled }: { c: StudioComment; onAction: (fn: () => Promise<unknown>, msg?: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, right: 0 });
  useEffect(() => { setMounted(true); }, []);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!panelRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  function openMenu() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setOpen(true);
  }
  const item = "flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition hover:bg-[#f8f9fb]";
  return (
    <>
      <button ref={btnRef} type="button" disabled={disabled} onClick={openMenu}
        className="grid h-7 w-7 place-items-center rounded-lg text-[#9ca3af] transition hover:bg-[#f3f4f6] hover:text-[#374151]">
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && mounted && createPortal(
        <div ref={panelRef} style={{ position: "fixed", top: coords.top, right: coords.right, zIndex: 9999, minWidth: 190 }}
          className="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
          <button className={cn(item, "text-[#a16207]")} onClick={() => { setOpen(false); onAction(() => c.held_for_review ? svc.unhold(c.id) : svc.hold(c.id), c.held_for_review ? "Approved." : "Held for review."); }}>
            <Shield className="h-3.5 w-3.5" /> {c.held_for_review ? "Approve" : "Hold for Review"}
          </button>
          <button className={cn(item, "text-[#374151]")} onClick={() => { setOpen(false); onAction(() => svc.restrict(c.id), "User restricted."); }}>
            <Ban className="h-3.5 w-3.5 text-[#6b7280]" /> Restrict User
          </button>
          <Link href={`/videos/${c.video?.id}`} target="_blank" className={cn(item, "text-[#374151]")} onClick={() => setOpen(false)}>
            <Video className="h-3.5 w-3.5 text-[#6b7280]" /> View Content
          </Link>
        </div>, document.body)}
    </>
  );
}

/* ── Detail panel ───────────────────────────────────────────────────────── */
function DetailPanel({ comment, creatorName, creatorAvatar, onClose, onAction, busy, onReplied }: {
  comment: StudioComment | null; creatorName: string; creatorAvatar: string | null;
  onClose: () => void; onAction: (fn: () => Promise<unknown>, msg?: string) => void; busy: boolean; onReplied: () => void;
}) {
  const qc = useQueryClient();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [savedOpen, setSavedOpen] = useState(false);
  const savedRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setReply(""); setNote(comment?.note ?? ""); }, [comment?.id, comment?.note]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (!savedRef.current?.contains(e.target as Node)) setSavedOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const threadQ = useQuery({
    queryKey: ["studio-comment-thread", comment?.id],
    queryFn: () => svc.thread(comment!.id).then(r => r.data),
    enabled: !!comment,
    staleTime: 15_000,
  });

  const replyMut = useMutation({
    mutationFn: (body: string) => svc.reply(comment!.id, body),
    onSuccess: () => {
      setReply(""); toast.success("Reply sent.");
      void qc.invalidateQueries({ queryKey: ["studio-comment-thread", comment?.id] });
      onReplied();
    },
    onError: (e: { response?: { data?: { message?: string } } }) => toast.error(e?.response?.data?.message ?? "Reply failed."),
  });

  const noteMut = useMutation({
    mutationFn: (body: string) => svc.note(comment!.id, body),
    onSuccess: () => { toast.success("Note saved."); onReplied(); },
    onError: () => toast.error("Could not save note."),
  });

  if (!comment) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-8 text-center">
        <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#f3f4f6]"><MessageSquare className="h-6 w-6 text-[#d1d5db]" /></div>
        <p className="text-[14px] font-semibold text-[#374151]">No comment selected</p>
        <p className="mt-1 text-[12px] text-[#9ca3af]">Select a comment from the list to reply and moderate.</p>
      </div>
    );
  }

  const thread = threadQ.data ?? [];
  const u = comment.user;

  const TOOLS = [
    { icon: Reply, label: "Reply", color: "text-[#fe2c55]", onClick: () => (document.getElementById("studio-reply-box") as HTMLTextAreaElement)?.focus() },
    { icon: Pin, label: comment.is_pinned ? "Unpin" : "Pin", color: comment.is_pinned ? "text-[#fe2c55]" : "text-[#374151]",
      onClick: () => onAction(() => comment.is_pinned ? svc.unpin(comment.id) : svc.pin(comment.id), comment.is_pinned ? "Unpinned." : "Pinned.") },
    { icon: EyeOff, label: comment.is_hidden ? "Unhide" : "Hide", color: comment.is_hidden ? "text-[#fe2c55]" : "text-[#374151]",
      onClick: () => onAction(() => comment.is_hidden ? svc.unhide(comment.id) : svc.hide(comment.id), comment.is_hidden ? "Restored." : "Hidden.") },
    { icon: Flag, label: comment.is_spam ? "Not Spam" : "Mark as Spam", color: comment.is_spam ? "text-[#fe2c55]" : "text-[#374151]",
      onClick: () => onAction(() => comment.is_spam ? svc.unspam(comment.id) : svc.spam(comment.id), comment.is_spam ? "Removed from spam." : "Marked as spam.") },
    { icon: Ban, label: "Restrict User", color: "text-[#374151]", onClick: () => onAction(() => svc.restrict(comment.id), "User restricted.") },
    { icon: Trash2, label: "Delete", color: "text-red-500", onClick: () => { if (confirm("Delete this comment?")) onAction(() => svc.remove(comment.id), "Deleted."); } },
  ];

  return (
    <div className="flex h-full flex-col overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
      {/* Header */}
      <div className="flex items-start gap-3 border-b border-[#f0f0f0] p-4">
        <Avatar src={u?.avatar} name={u?.name ?? u?.username} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#111827]">{u?.name ?? u?.username}</p>
          <p className="truncate text-[12px] text-[#9ca3af]">@{u?.username}</p>
          <p className="mt-0.5 truncate text-[11px] text-[#9ca3af]">
            {[joinedLabel(u?.joined_at), u?.followers_count != null ? `${fmt(u.followers_count)} followers` : null].filter(Boolean).join(" · ")}
          </p>
        </div>
        <button type="button" onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f3f4f6]"><X className="h-4 w-4" /></button>
      </div>

      {/* The comment */}
      <div className="border-b border-[#f0f0f0] p-4">
        <p className="text-[14px] leading-relaxed text-[#111827]">{comment.body || (comment.gif_url ? "[GIF]" : "")}</p>
        <p className="mt-2 text-[12px] text-[#9ca3af]">
          {relTime(comment.created_at)} · on <Link href={`/videos/${comment.video?.id}`} target="_blank" className="font-semibold text-[#fe2c55] hover:underline">{comment.video?.title}</Link>
        </p>
        <div className="mt-3 flex items-center gap-4">
          <span className="flex items-center gap-1 text-[13px] font-semibold text-[#fe2c55]"><Heart className="h-4 w-4 fill-[#fe2c55]" />{fmt(comment.love_count)}</span>
          <span className="flex items-center gap-1 text-[13px] text-[#6b7280]"><MessageCircle className="h-4 w-4" />{fmt(comment.reply_count)}</span>
          <span className="ml-auto"><StatusPill status={comment.status} /></span>
        </div>
      </div>

      {/* Thread */}
      <div className="border-b border-[#f0f0f0] p-4">
        <p className="mb-3 text-[13px] font-bold text-[#111827]">Thread ({thread.length})</p>
        {threadQ.isLoading ? (
          <div className="space-y-3">{Array.from({ length: 2 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-lg bg-[#f3f4f6]" />)}</div>
        ) : thread.length === 0 ? (
          <p className="text-[12px] text-[#9ca3af]">No replies yet. Be the first to respond.</p>
        ) : (
          <div className="space-y-3">
            {thread.map((r: Comment) => (
              <div key={r.id} className="flex gap-2.5">
                <Avatar src={r.is_author ? creatorAvatar : r.user?.avatar} name={r.user?.name ?? r.user?.username} size={28} />
                <div className="min-w-0 flex-1 rounded-xl bg-[#f8f9fb] px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[12px] font-bold text-[#111827]">{r.user?.name ?? r.user?.username}</span>
                    {r.is_author && <span className="rounded bg-[#fff0f4] px-1 py-0.5 text-[9px] font-bold text-[#fe2c55]">Creator</span>}
                  </div>
                  <p className="mt-0.5 text-[12px] leading-snug text-[#374151]">{r.body}</p>
                  <div className="mt-1 flex items-center gap-2 text-[10px] text-[#9ca3af]">
                    <span>{relTime(r.created_at)}</span>
                    <span className="flex items-center gap-0.5"><Heart className="h-2.5 w-2.5" />{fmt(r.love_count)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick reply */}
      <div className="border-b border-[#f0f0f0] p-4">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-[13px] font-bold text-[#111827]">Quick Reply</p>
          <div ref={savedRef} className="relative">
            <button type="button" onClick={() => setSavedOpen(o => !o)}
              className="flex items-center gap-1 rounded-lg border border-[#e5e7eb] px-2 py-1 text-[11px] font-semibold text-[#6b7280] hover:border-[#fe2c55]">
              Use a saved reply <ChevronDown className="h-3 w-3" />
            </button>
            {savedOpen && (
              <div className="absolute right-0 top-full z-20 mt-1 w-[240px] overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
                {SAVED_REPLIES.map((s, i) => (
                  <button key={i} type="button" onClick={() => { setReply(s); setSavedOpen(false); }}
                    className="block w-full truncate px-3 py-2 text-left text-[12px] text-[#374151] hover:bg-[#f8f9fb]">{s}</button>
                ))}
              </div>
            )}
          </div>
        </div>
        <textarea id="studio-reply-box" value={reply} onChange={e => setReply(e.target.value.slice(0, 500))}
          placeholder="Write a reply..." rows={3}
          className="w-full resize-none rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-[13px] outline-none transition focus:border-[#fe2c55]" />
        <div className="mt-2 flex items-center justify-between">
          <div className="flex items-center gap-1 text-[#9ca3af]">
            <button type="button" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[#f3f4f6]" title="Emoji"><Smile className="h-4 w-4" /></button>
            <button type="button" className="grid h-7 w-7 place-items-center rounded-lg hover:bg-[#f3f4f6]" title="Image"><ImageIcon className="h-4 w-4" /></button>
            <span className="ml-1 text-[11px]">{reply.length}/500</span>
          </div>
          <button type="button" disabled={!reply.trim() || replyMut.isPending}
            onClick={() => replyMut.mutate(reply.trim())}
            className="flex items-center gap-1.5 rounded-xl bg-[#fe2c55] px-4 py-2 text-[13px] font-bold text-white transition hover:bg-[#e0243d] disabled:opacity-50">
            <Send className="h-3.5 w-3.5" />{replyMut.isPending ? "Sending…" : "Reply"}
          </button>
        </div>
      </div>

      {/* Moderation tools */}
      <div className="border-b border-[#f0f0f0] p-4">
        <p className="mb-3 text-[13px] font-bold text-[#111827]">Moderation Tools</p>
        <div className="grid grid-cols-3 gap-2">
          {TOOLS.map(t => (
            <button key={t.label} type="button" disabled={busy} onClick={t.onClick}
              className="flex flex-col items-center gap-1.5 rounded-xl border border-[#f0f0f0] py-3 transition hover:border-[#e5e7eb] hover:bg-[#f8f9fb] disabled:opacity-50">
              <t.icon className={cn("h-4 w-4", t.color)} />
              <span className={cn("text-[10px] font-semibold", t.color)}>{t.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="p-4">
        <p className="mb-2 text-[13px] font-bold text-[#111827]">Notes</p>
        <div className="flex items-end gap-2">
          <textarea value={note} onChange={e => setNote(e.target.value.slice(0, 1000))} placeholder="Add a note..." rows={2}
            className="w-full resize-none rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] outline-none transition focus:border-[#fe2c55]" />
          <button type="button" disabled={noteMut.isPending || note === (comment.note ?? "")} onClick={() => noteMut.mutate(note)}
            className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-[#fe2c55] text-white transition hover:bg-[#e0243d] disabled:opacity-40" title="Save note">
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
