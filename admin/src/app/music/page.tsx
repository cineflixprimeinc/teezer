"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart2, Check, ChevronDown, ChevronLeft, ChevronRight,
  Copy, Download, Edit2, ExternalLink, Filter, Music, MoreHorizontal,
  Pause, Play, Plus, Search, Star, Trash2, TrendingUp, Users2,
  X, ListMusic, Archive,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { api, apiMessage } from "@/services/api";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type MusicTrack = {
  id: number;
  title: string;
  artist_name: string | null;
  cover_url: string | null;
  audio_url: string | null;
  duration: number | null;
  genre: string | null;
  mood: string | null;
  status: "draft" | "published" | "pending" | "archived" | "rejected";
  plays_count: number;
  uses_count: number;
  featured: boolean;
  recommended: boolean;
  created_at: string;
  created_by_admin_id: number | null;
  source_type: "library" | "original";
};

type Stats = {
  total: number;
  published: number;
  total_plays: number;
  artists: number;
  new_this_week: number;
  reelsoo_count: number;
  artist_count: number;
};

type Paginator<T> = {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
  from: number;
  to: number;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null) {
  if (!sec) return "-";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function fmtNum(n: number) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000)      return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function isNewTrack(iso: string) {
  return Date.now() - new Date(iso).getTime() < 7 * 24 * 60 * 60 * 1000;
}

const MOOD_COLORS: Record<string, { bg: string; text: string }> = {
  Chill:      { bg: "#eff6ff", text: "#3b82f6" },
  Happy:      { bg: "#fefce8", text: "#ca8a04" },
  Energetic:  { bg: "#fef2f2", text: "#ef4444" },
  Calm:       { bg: "#f0fdf4", text: "#16a34a" },
  Romantic:   { bg: "#fdf2f8", text: "#ec4899" },
  Upbeat:     { bg: "#fff7ed", text: "#ea580c" },
  Dark:       { bg: "#f4f5f7", text: "#374151" },
  Cinematic:  { bg: "#faf5ff", text: "#9333ea" },
  Acoustic:   { bg: "#f7fee7", text: "#65a30d" },
  "Lo-fi":    { bg: "#fafaf9", text: "#78716c" },
  Gaming:     { bg: "#ecfeff", text: "#0891b2" },
  Workout:    { bg: "#fff1f2", text: "#f43f5e" },
  Party:      { bg: "#f5f3ff", text: "#7c3aed" },
  Study:      { bg: "#f0f9ff", text: "#0284c7" },
  Morning:    { bg: "#fff7ed", text: "#ea580c" },
  Pop:        { bg: "#fdf4ff", text: "#c026d3" },
  Peaceful:   { bg: "#f0fdf4", text: "#059669" },
  Sad:        { bg: "#eff6ff", text: "#1d4ed8" },
  Relax:      { bg: "#ecfdf5", text: "#10b981" },
};

const STATUS_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  published: { bg: "#dcfce7", text: "#16a34a", label: "Published" },
  draft:     { bg: "#f4f5f7", text: "#6b7280", label: "Draft" },
  pending:   { bg: "#fef9c3", text: "#a16207", label: "Pending" },
  archived:  { bg: "#f4f5f7", text: "#9ca3af", label: "Archived" },
  rejected:  { bg: "#fee2e2", text: "#ef4444", label: "Rejected" },
};

const MOOD_OPTIONS = [
  "Chill", "Happy", "Energetic", "Calm", "Romantic", "Upbeat", "Dark",
  "Cinematic", "Acoustic", "Lo-fi", "Gaming", "Workout", "Party", "Study",
  "Morning", "Pop", "Peaceful", "Sad",
];

const GENRE_OPTIONS = [
  "Pop", "Hip Hop", "Electronic", "Rock", "Jazz", "Classical", "R&B",
  "Lo-fi", "Ambient", "Acoustic", "Dance", "Indie", "Folk", "Nepali",
  "Cinematic", "Instrumental", "EDM", "SFX",
];

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ track, onClose, onDeleted }: {
  track: MusicTrack; onClose: () => void; onDeleted: () => void;
}) {
  const [loading, setLoading] = useState(false);
  async function confirm() {
    setLoading(true);
    try { await api.delete(`/admin/music/${track.id}`); onDeleted(); onClose(); }
    catch { setLoading(false); }
  }
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 text-center">
        <div className="h-12 w-12 rounded-full bg-red-100 grid place-items-center mx-auto mb-4">
          <Trash2 className="h-5 w-5 text-red-500" />
        </div>
        <p className="text-[15px] font-bold text-[#111827]">Delete Track?</p>
        <p className="text-[13px] text-[#6b7280] mt-1">
          "<span className="font-semibold">{track.title}</span>" will be permanently deleted from the library and R2 storage.
        </p>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose}
            className="flex-1 h-10 rounded-xl border border-[#e8eaed] text-[13px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors">
            Cancel
          </button>
          <button onClick={confirm} disabled={loading}
            className="flex-1 h-10 rounded-xl bg-red-500 text-white text-[13px] font-semibold hover:bg-red-600 disabled:opacity-60 transition-colors">
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Row action menu ─────────────────────────────────────────────────────────

function RowMenu({ track, onDelete, onStatusChange, onRefresh }: {
  track: MusicTrack;
  onDelete: () => void;
  onStatusChange: (id: number, action: "publish" | "unpublish" | "duplicate") => void;
  onRefresh: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const router  = useRouter();
  const btnRef  = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (
        btnRef.current  && !btnRef.current.contains(e.target as Node) &&
        menuRef.current && !menuRef.current.contains(e.target as Node)
      ) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_H = 360; // approximate menu height
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= MENU_H
      ? rect.bottom + 6
      : rect.top - MENU_H - 6;
    setMenuPos({ top: Math.max(8, top), right: window.innerWidth - rect.right });
    setOpen(true);
  }

  async function toggleFeatured() {
    try { await api.put(`/admin/music/${track.id}`, { featured: !track.featured }); onRefresh(); }
    catch { /* silent */ }
    setOpen(false);
  }
  async function toggleRecommended() {
    try { await api.put(`/admin/music/${track.id}`, { recommended: !track.recommended }); onRefresh(); }
    catch { /* silent */ }
    setOpen(false);
  }

  const items: { label: string; icon: React.ElementType; action: () => void; danger?: boolean; divider?: boolean }[] = [
    { label: "Preview audio",  icon: Play,        action: () => { window.open(track.audio_url ?? "#", "_blank"); setOpen(false); } },
    { label: "Edit track",     icon: Edit2,       action: () => { router.push(`/music/${track.id}/edit`); setOpen(false); } },
    { label: "Duplicate",      icon: Copy,        action: () => { onStatusChange(track.id, "duplicate"); setOpen(false); } },
    track.status === "published"
      ? { label: "Unpublish",  icon: X,           action: () => { onStatusChange(track.id, "unpublish"); setOpen(false); } }
      : { label: "Publish",    icon: Check,       action: () => { onStatusChange(track.id, "publish");   setOpen(false); } },
    { label: "Archive",        icon: Archive,     action: async () => { try { await api.put(`/admin/music/${track.id}`, { status: "archived" }); onRefresh(); } catch {} setOpen(false); } },
    { label: track.featured    ? "Remove featured"    : "Set as Featured",    icon: Star,       action: toggleFeatured,    divider: true },
    { label: track.recommended ? "Remove recommended" : "Set as Recommended", icon: BarChart2,  action: toggleRecommended },
    { label: "Copy audio URL", icon: ExternalLink, action: () => { if (track.audio_url) navigator.clipboard.writeText(track.audio_url).catch(() => {}); setOpen(false); } },
    { label: "Download audio", icon: Download,    action: () => { if (track.audio_url) { const a = document.createElement("a"); a.href = track.audio_url; a.download = track.title; a.click(); } setOpen(false); } },
    { label: "Delete",         icon: Trash2,      action: () => { onDelete(); setOpen(false); }, danger: true, divider: true },
  ];

  return (
    <>
      <button
        ref={btnRef}
        onClick={() => open ? setOpen(false) : openMenu()}
        className="p-1.5 rounded-full text-[#c4c9d4] hover:text-[#374151] hover:bg-[#f4f5f7] transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && menuPos && (
        <>
          {/* Full-screen backdrop */}
          <div className="fixed inset-0 z-[998]" onClick={() => setOpen(false)} />

          {/* Menu - fixed so it escapes all parent stacking contexts */}
          <div
            ref={menuRef}
            className="fixed z-[999] w-56 rounded-2xl border border-[#e8eaed] bg-white shadow-2xl shadow-black/15 py-2 overflow-hidden"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {items.map((item, i) => {
              const Icon = item.icon;
              return (
                <div key={i}>
                  {item.divider && i > 0 && <div className="my-1.5 h-px bg-[#f4f5f7] mx-3" />}
                  <button
                    onClick={item.action}
                    className={cn(
                      "w-full flex items-center gap-3 px-4 py-2.5 text-[12.5px] font-medium transition-colors text-left",
                      item.danger
                        ? "text-[#ef4444] hover:bg-[#fff5f5]"
                        : "text-[#374151] hover:bg-[#f9fafb] hover:text-[#fe2c55]",
                    )}
                  >
                    <Icon className={cn("h-3.5 w-3.5 shrink-0", item.danger ? "text-[#ef4444]" : "text-[#9ca3af]")} />
                    {item.label}
                  </button>
                </div>
              );
            })}
          </div>
        </>
      )}
    </>
  );
}

// ─── Source badge ─────────────────────────────────────────────────────────────

function SourceBadge({ track }: { track: MusicTrack }) {
  const isReelsoo = !!track.created_by_admin_id ||
    (track.artist_name?.toLowerCase().includes("reelsoo") ?? false);
  return isReelsoo ? (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#fff0f4] text-[#fe2c55] border border-[#ffd4dc] whitespace-nowrap">
      <Music className="h-2.5 w-2.5 shrink-0" />
      Teezer
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#eff6ff] text-[#3b82f6] border border-[#bfdbfe] whitespace-nowrap">
      <Users2 className="h-2.5 w-2.5 shrink-0" />
      Artist
    </span>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MusicLibraryPage() {
  const [paginator, setPaginator]   = useState<Paginator<MusicTrack> | null>(null);
  const [stats, setStats]           = useState<Stats>({ total: 0, published: 0, total_plays: 0, artists: 0, new_this_week: 0, reelsoo_count: 0, artist_count: 0 });
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [debouncedQ, setDebounced]  = useState("");
  const [moodFilter, setMoodFilter] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [page, setPage]             = useState(1);
  const [perPage, setPerPage]       = useState(10);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<MusicTrack | null>(null);
  const [playingId, setPlayingId]   = useState<number | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string | number> = { page, per_page: perPage };
      if (debouncedQ)    params.search = debouncedQ;
      if (moodFilter)    params.mood   = moodFilter;
      if (genreFilter)   params.genre  = genreFilter;
      if (statusFilter)  params.status = statusFilter;
      if (sourceFilter)  params.source = sourceFilter;

      const { data } = await api.get("/admin/music", { params });
      setPaginator(data.data);
      if (data.stats) setStats(data.stats);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [debouncedQ, moodFilter, genreFilter, statusFilter, sourceFilter, page, perPage]);

  useEffect(() => { fetchData(); }, [fetchData]);

  async function handleStatusChange(id: number, action: "publish" | "unpublish" | "duplicate") {
    try {
      await api.post(`/admin/music/${id}/${action}`);
      fetchData();
    } catch { /* silent */ }
  }

  function handlePlay(track: MusicTrack) {
    if (playingId === track.id) {
      audioRef.current?.pause();
      setPlayingId(null);
      return;
    }
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; audioRef.current = null; }
    if (!track.audio_url) return;
    const a = new Audio(track.audio_url);
    a.play().catch(() => { setPlayingId(null); });
    a.onended = () => setPlayingId(null);
    audioRef.current = a;
    setPlayingId(track.id);
  }

  const tracks = (paginator?.data ?? []).filter(t => t.source_type !== "original");
  const allChecked = tracks.length > 0 && tracks.every(t => selected.has(t.id));

  function toggleAll() {
    if (allChecked) {
      setSelected(new Set());
    } else {
      setSelected(new Set(tracks.map(t => t.id)));
    }
  }

  function toggleOne(id: number) {
    setSelected(prev => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  const statCards = [
    {
      label: "TOTAL TRACKS", value: stats.total, trend: `${stats.new_this_week} this week`,
      icon: ListMusic, iconBg: "#fff0f4", iconColor: "#fe2c55",
    },
    {
      label: "WITH PLAYS", value: stats.total_plays, trend: "8.4% this week",
      icon: TrendingUp, iconBg: "#fff7ed", iconColor: "#f97316",
    },
    {
      label: "ARTISTS", value: stats.artists, trend: "5 this week",
      icon: Users2, iconBg: "#eff6ff", iconColor: "#3b82f6",
    },
  ];

  return (
    <AdminShell title="Music Library">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 rounded-2xl bg-[#fff0f4] grid place-items-center shrink-0">
              <Music className="h-5 w-5 text-[#fe2c55]" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[#111827] leading-tight">Music Library</h2>
              <p className="text-[13px] text-[#6b7280]">Manage licensed music tracks and the platform sound library.</p>
            </div>
          </div>
          <Link
            href="/music/upload"
            className="flex items-center gap-2 h-10 px-5 rounded-xl bg-[#fe2c55] text-white text-[13px] font-semibold hover:bg-[#e0264b] active:scale-95 transition-all shrink-0 whitespace-nowrap shadow-sm shadow-[#fe2c55]/20"
          >
            <Plus className="h-4 w-4" />
            Upload Track
          </Link>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {statCards.map(({ label, value, trend, icon: Icon, iconBg, iconColor }) => (
            <div key={label} className="bg-white rounded-2xl border border-[#e8eaed] p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: iconColor }}>{label}</p>
                  <p className="mt-2 text-[28px] font-bold text-[#111827] leading-none">{value.toLocaleString()}</p>
                  <p className="mt-1.5 text-[12px] text-[#22c55e] font-medium flex items-center gap-1">
                    <span>↑</span>{trend}
                  </p>
                </div>
                <div className="h-11 w-11 rounded-2xl grid place-items-center shrink-0" style={{ background: iconBg }}>
                  <Icon className="h-5 w-5" style={{ color: iconColor }} />
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Table card */}
        <div className="bg-white rounded-2xl border border-[#e8eaed]">
          {/* Filter row */}
          <div className="flex items-center gap-2.5 px-4 py-3.5 border-b border-[#f4f5f7] flex-wrap rounded-t-2xl">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
              <input
                type="text"
                placeholder="Search title or artist..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="h-9 w-full rounded-xl border border-[#e8eaed] bg-[#f9fafb] pl-9 pr-3 text-[12px] text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#fe2c55] focus:bg-white transition-colors"
              />
            </div>

            {/* Mood */}
            <select value={moodFilter} onChange={e => { setMoodFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 pr-8 rounded-xl border border-[#e8eaed] bg-white text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] transition-colors appearance-none cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
              <option value="">All Moods</option>
              {MOOD_OPTIONS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            {/* Genre */}
            <select value={genreFilter} onChange={e => { setGenreFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 pr-8 rounded-xl border border-[#e8eaed] bg-white text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] transition-colors appearance-none cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
              <option value="">All Genres</option>
              {GENRE_OPTIONS.map(g => <option key={g} value={g}>{g}</option>)}
            </select>

            {/* Status */}
            <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
              className="h-9 px-3 pr-8 rounded-xl border border-[#e8eaed] bg-white text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] transition-colors appearance-none cursor-pointer" style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 10px center" }}>
              <option value="">All Status</option>
              <option value="published">Published</option>
              <option value="draft">Draft</option>
              <option value="pending">Pending</option>
              <option value="archived">Archived</option>
              <option value="rejected">Rejected</option>
            </select>

            <button className="flex items-center gap-1.5 h-9 px-3.5 rounded-xl border border-[#e8eaed] text-[12px] text-[#374151] hover:bg-[#f4f5f7] transition-colors whitespace-nowrap">
              <Filter className="h-3.5 w-3.5 text-[#9ca3af]" />
              Filters
            </button>

            <p className="ml-auto text-[12px] text-[#9ca3af] shrink-0 whitespace-nowrap">
              {paginator ? `${paginator.total.toLocaleString()} tracks` : "-"}
            </p>
          </div>

          {/* Source tabs */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[#f4f5f7]">
            {([
              { id: "",        label: "All Tracks",        count: stats.total },
              { id: "reelsoo", label: "Teezer Originals", count: stats.reelsoo_count },
              { id: "artist",  label: "Artist Uploads",    count: stats.artist_count },
            ] as const).map(tab => (
              <button key={tab.id}
                onClick={() => { setSourceFilter(tab.id); setPage(1); }}
                className={cn(
                  "flex items-center gap-2 h-8 px-4 rounded-xl text-[12px] font-semibold transition-all whitespace-nowrap",
                  sourceFilter === tab.id
                    ? tab.id === "reelsoo"
                      ? "bg-[#fe2c55] text-white shadow-sm shadow-[#fe2c55]/25"
                      : tab.id === "artist"
                        ? "bg-[#3b82f6] text-white shadow-sm shadow-[#3b82f6]/25"
                        : "bg-[#111827] text-white shadow-sm"
                    : "text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#374151]",
                )}>
                {tab.id === "reelsoo" && (
                  <Music className={cn("h-3 w-3 shrink-0", sourceFilter === "reelsoo" ? "text-white" : "text-[#fe2c55]")} />
                )}
                {tab.id === "artist" && (
                  <Users2 className={cn("h-3 w-3 shrink-0", sourceFilter === "artist" ? "text-white" : "text-[#3b82f6]")} />
                )}
                {tab.label}
                <span className={cn(
                  "text-[10px] font-bold px-1.5 py-0.5 rounded-full tabular-nums",
                  sourceFilter === tab.id ? "bg-white/25 text-white" : "bg-[#f4f5f7] text-[#9ca3af]",
                )}>
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {/* Column headers */}
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f9fafb] bg-[#fafafa]">
            <div className="w-4 shrink-0">
              <input type="checkbox" checked={allChecked} onChange={toggleAll}
                className="rounded border-[#d1d5db] accent-[#fe2c55] cursor-pointer" />
            </div>
            <div className="w-7 shrink-0" />
            <div className="flex-1 min-w-0 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Track</div>
            <div className="w-28 shrink-0 hidden sm:block text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Artist</div>
            <div className="w-28 shrink-0 hidden md:block text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Source</div>
            <div className="w-24 shrink-0 hidden md:block text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Mood</div>
            <div className="w-16 shrink-0 hidden lg:block text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Duration</div>
            <div className="w-20 shrink-0 hidden lg:block text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Plays</div>
            <div className="w-24 shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Status</div>
            <div className="w-24 shrink-0 hidden xl:block text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Added On</div>
            <div className="w-16 shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Actions</div>
          </div>

          {/* Rows */}
          {loading ? (
            <div className="divide-y divide-[#f9fafb]">
              {Array.from({ length: perPage }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-3.5 animate-pulse">
                  <div className="w-4 h-4 rounded bg-[#f0f0f0] shrink-0" />
                  <div className="w-7 h-7 rounded-full bg-[#f0f0f0] shrink-0" />
                  <div className="h-9 w-9 rounded-xl bg-[#f0f0f0] shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-[#f0f0f0] rounded-full w-2/5" />
                    <div className="h-2.5 bg-[#f0f0f0] rounded-full w-1/4" />
                  </div>
                  <div className="w-28 h-3 bg-[#f0f0f0] rounded-full hidden sm:block" />
                  <div className="w-24 h-5 bg-[#f0f0f0] rounded-full hidden md:block" />
                  <div className="w-16 h-5 bg-[#f0f0f0] rounded-full hidden md:block" />
                  <div className="w-12 h-3 bg-[#f0f0f0] rounded-full hidden lg:block" />
                  <div className="w-16 h-3 bg-[#f0f0f0] rounded-full hidden lg:block" />
                  <div className="w-20 h-5 bg-[#f0f0f0] rounded-full" />
                  <div className="w-20 h-3 bg-[#f0f0f0] rounded-full hidden xl:block" />
                  <div className="w-14 h-7 bg-[#f0f0f0] rounded-xl" />
                </div>
              ))}
            </div>
          ) : tracks.length === 0 ? (
            <div className="py-16 text-center">
              <Music className="h-12 w-12 text-[#e8eaed] mx-auto mb-4" />
              <p className="text-[15px] font-semibold text-[#374151]">No tracks yet</p>
              <p className="text-[13px] text-[#9ca3af] mt-1">Upload the first track to get started.</p>
              <Link href="/music/upload"
                className="mt-4 inline-flex items-center gap-2 h-9 px-4 rounded-xl bg-[#fe2c55] text-white text-[13px] font-semibold hover:bg-[#e0264b] transition-colors">
                <Plus className="h-3.5 w-3.5" /> Upload Track
              </Link>
            </div>
          ) : (
            <div className="divide-y divide-[#f9fafb]">
              {tracks.map(track => {
                const mood   = MOOD_COLORS[track.mood ?? ""] ?? { bg: "#f4f5f7", text: "#6b7280" };
                const status = STATUS_STYLES[track.status] ?? STATUS_STYLES.draft;
                const isPlay = playingId === track.id;
                const isSel  = selected.has(track.id);
                const isNew  = isNewTrack(track.created_at);

                return (
                  <div key={track.id}
                    className={cn("flex items-center gap-3 px-4 py-3 transition-colors", isSel ? "bg-[#fff8f9]" : "hover:bg-[#fafafa]")}>
                    {/* Checkbox */}
                    <div className="w-4 shrink-0">
                      <input type="checkbox" checked={isSel} onChange={() => toggleOne(track.id)}
                        className="rounded border-[#d1d5db] accent-[#fe2c55] cursor-pointer" />
                    </div>

                    {/* Play button */}
                    <button onClick={() => handlePlay(track)}
                      className={cn(
                        "w-7 h-7 rounded-full border-2 grid place-items-center shrink-0 transition-all",
                        isPlay
                          ? "border-[#fe2c55] bg-[#fe2c55] text-white"
                          : "border-[#e8eaed] text-[#6b7280] hover:border-[#fe2c55] hover:text-[#fe2c55]",
                      )}>
                      {isPlay
                        ? <Pause className="h-3 w-3 fill-current" />
                        : <Play className="h-3 w-3 fill-current ml-px" />
                      }
                    </button>

                    {/* Cover */}
                    <div className="h-9 w-9 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[#ffd4dc] to-[#ffecef] grid place-items-center">
                      {track.cover_url
                        ? <img src={track.cover_url} alt="" className="h-full w-full object-cover" />
                        : <Music className="h-3.5 w-3.5 text-[#fe2c55]" />}
                    </div>

                    {/* Title */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="truncate text-[13px] font-semibold text-[#111827]">{track.title}</span>
                        {isNew && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#fe2c55] text-white leading-none">NEW</span>
                        )}
                        {track.featured && (
                          <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#eab308] text-white leading-none">FEATURED</span>
                        )}
                      </div>
                      <p className="truncate text-[11px] text-[#9ca3af] mt-0.5 sm:hidden">{track.artist_name ?? "Unknown"}</p>
                    </div>

                    {/* Artist */}
                    <div className="w-28 shrink-0 hidden sm:block">
                      <p className="truncate text-[12px] text-[#374151]">{track.artist_name ?? "-"}</p>
                    </div>

                    {/* Source */}
                    <div className="w-28 shrink-0 hidden md:block">
                      <SourceBadge track={track} />
                    </div>

                    {/* Mood */}
                    <div className="w-24 shrink-0 hidden md:block">
                      {track.mood ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
                          style={{ background: mood.bg, color: mood.text }}>
                          {track.mood}
                        </span>
                      ) : <span className="text-[12px] text-[#d1d5db]">-</span>}
                    </div>

                    {/* Duration */}
                    <div className="w-16 shrink-0 hidden lg:block text-[12px] text-[#6b7280] tabular-nums">
                      {fmtDuration(track.duration)}
                    </div>

                    {/* Plays */}
                    <div className="w-20 shrink-0 hidden lg:flex items-center gap-1.5 text-[12px] font-semibold text-[#374151]">
                      <BarChart2 className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" />
                      {fmtNum(track.plays_count)}
                    </div>

                    {/* Status */}
                    <div className="w-24 shrink-0">
                      <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold whitespace-nowrap"
                        style={{ background: status.bg, color: status.text }}>
                        {status.label}
                      </span>
                    </div>

                    {/* Added On */}
                    <div className="w-24 shrink-0 hidden xl:block text-[12px] text-[#6b7280]">
                      {fmtDate(track.created_at)}
                    </div>

                    {/* Actions */}
                    <div className="w-16 shrink-0 flex items-center gap-0.5 justify-end">
                      <Link href={`/music/${track.id}/edit`}
                        className="p-1.5 rounded-full text-[#c4c9d4] hover:text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                        <Edit2 className="h-3.5 w-3.5" />
                      </Link>
                      <RowMenu track={track} onDelete={() => setDeleteTarget(track)} onStatusChange={handleStatusChange} onRefresh={fetchData} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {paginator && paginator.last_page > 0 && (
            <div className="flex items-center justify-between px-4 py-3.5 border-t border-[#f4f5f7]">
              <p className="text-[12px] text-[#6b7280]">
                Showing {paginator.from ?? 0} to {paginator.to ?? 0} of <span className="font-semibold text-[#374151]">{paginator.total.toLocaleString()}</span> results
              </p>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                  disabled={paginator.current_page <= 1}
                  className="h-8 w-8 rounded-lg border border-[#e8eaed] grid place-items-center text-[#6b7280] disabled:opacity-40 hover:bg-[#f4f5f7] transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {Array.from({ length: Math.min(5, paginator.last_page) }).map((_, i) => {
                  let p = i + 1;
                  if (paginator.last_page > 5) {
                    const start = Math.max(1, Math.min(paginator.current_page - 2, paginator.last_page - 4));
                    p = start + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={cn(
                        "h-8 w-8 rounded-lg border text-[12px] font-semibold transition-colors",
                        p === paginator.current_page
                          ? "border-[#fe2c55] bg-[#fe2c55] text-white"
                          : "border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]",
                      )}
                    >
                      {p}
                    </button>
                  );
                })}

                {paginator.last_page > 5 && (
                  <>
                    <span className="text-[12px] text-[#9ca3af]">…</span>
                    <button
                      onClick={() => setPage(paginator.last_page)}
                      className={cn(
                        "h-8 w-8 rounded-lg border text-[12px] font-semibold transition-colors",
                        paginator.current_page === paginator.last_page
                          ? "border-[#fe2c55] bg-[#fe2c55] text-white"
                          : "border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]",
                      )}
                    >
                      {paginator.last_page}
                    </button>
                  </>
                )}

                <button
                  onClick={() => setPage(p => Math.min(paginator.last_page, p + 1))}
                  disabled={paginator.current_page >= paginator.last_page}
                  className="h-8 w-8 rounded-lg border border-[#e8eaed] grid place-items-center text-[#6b7280] disabled:opacity-40 hover:bg-[#f4f5f7] transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                  className="h-8 px-2 pr-7 rounded-xl border border-[#e8eaed] text-[12px] text-[#374151] outline-none focus:border-[#fe2c55] bg-white transition-colors appearance-none cursor-pointer"
                  style={{ backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%239ca3af' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 8px center" }}>
                  <option value={10}>10 / page</option>
                  <option value={25}>25 / page</option>
                  <option value={50}>50 / page</option>
                </select>
              </div>
            </div>
          )}
        </div>
      </div>

      {deleteTarget && (
        <DeleteConfirm
          track={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={fetchData}
        />
      )}
    </AdminShell>
  );
}
