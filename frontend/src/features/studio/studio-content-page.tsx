"use client";

import { createPortal } from "react-dom";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { notify } from "@/lib/notify";
import {
  Archive, BarChart2, Calendar, Check, ChevronDown, ChevronLeft, ChevronRight,
  Copy, Edit3, ExternalLink, Eye, EyeOff, FileText, Globe, Heart,
  Image as ImageIcon, LayoutGrid, Layers, Link2, Lock, MessageCircle, MoreHorizontal,
  Play, RefreshCw, Rocket, Search, Trash2, Upload, Video, X,
} from "lucide-react";
import { cn, formatCompact } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { RestrictionBanner } from "@/components/restriction-banner";
import { api } from "@/services/api";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import { useHlsSource } from "@/hooks/use-hls-source";
import type { ReelsooVideo } from "@/types/video";

/* ── Types ─────────────────────────────────────────────────────────────── */
type SortOption      = "newest" | "oldest" | "most_viewed" | "most_liked";
type StatusTab       = "all" | "published" | "draft" | "scheduled" | "private";
type MediaTypeFilter = "all" | "video" | "image";
type VideoStatus = "published" | "draft" | "scheduled" | "private";

interface ContentMeta {
  current_page: number; last_page: number; per_page: number;
  total: number; from: number | null; to: number | null;
  counts: { total: number; published: number; draft: number; scheduled: number; private: number };
}
interface ContentResponse { success: boolean; data: ReelsooVideo[]; meta: ContentMeta }

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmt(n?: number | null) { return formatCompact(n ?? 0); }
function fmtDuration(s?: number | null) {
  if (!s) return "0:00";
  return `${String(Math.floor(s / 60)).padStart(2,"0")}:${String(Math.floor(s % 60)).padStart(2,"0")}`;
}
function fmtDate(iso?: string | null): [string, string] {
  if (!iso) return ["-", ""];
  const d = new Date(iso);
  return [
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  ];
}
function useDebounce<T>(value: T, ms = 400): T {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

/* ── Status config ──────────────────────────────────────────────────────── */
const STATUS_CFG: Record<string, { cls: string; label: string }> = {
  published: { cls: "bg-[#dcfce7] text-[#15803d]", label: "Published" },
  scheduled: { cls: "bg-[#fff7ed] text-[#c2410c]", label: "Scheduled" },
  draft:     { cls: "bg-[#dbeafe] text-[#1d4ed8]", label: "Draft"     },
  private:   { cls: "bg-[#f3f4f6] text-[#4b5563]", label: "Private"   },
  removed:   { cls: "bg-[#fee2e2] text-[#b91c1c]", label: "Removed"   },
};

/* ── Status badge - uses portal to escape overflow:hidden ───────────────── */
function StatusBadge({ status, onStatusChange }: {
  status: string;
  onStatusChange?: (s: VideoStatus) => void;
}) {
  const [open, setOpen]     = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);
  const cfg = STATUS_CFG[status] ?? STATUS_CFG.private;

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function openMenu() {
    if (!btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    setCoords({ top: r.bottom + 4, left: r.left });
    setOpen(true);
  }

  const opts: { value: VideoStatus; label: string; Icon: React.ElementType }[] = [
    { value: "published", label: "Published", Icon: Globe    },
    { value: "draft",     label: "Draft",     Icon: FileText },
    { value: "private",   label: "Private",   Icon: Lock     },
  ];

  if (!onStatusChange) {
    return <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize", cfg.cls)}>{cfg.label}</span>;
  }

  return (
    <>
      <button ref={btnRef} type="button" onClick={openMenu}
        className={cn("inline-flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize transition hover:opacity-80", cfg.cls)}>
        {cfg.label}
        <ChevronDown className="h-2.5 w-2.5" />
      </button>
      {open && mounted && createPortal(
        <div ref={menuRef}
          style={{ position: "fixed", top: coords.top, left: coords.left, zIndex: 9999, minWidth: 155 }}
          className="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
          {opts.map(({ value, label, Icon }) => (
            <button key={value} type="button"
              onClick={() => { onStatusChange(value); setOpen(false); }}
              className={cn("flex w-full items-center gap-2 px-3 py-2 text-[12px] transition hover:bg-[#f8f9fb]",
                value === status ? "font-bold text-[#fd4605]" : "text-[#374151]")}>
              <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[#6b7280]" />
              {label}
              {value === status && <Check className="ml-auto h-3 w-3 text-[#fd4605]" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

/* ── Delete modal ───────────────────────────────────────────────────────── */
function DeleteModal({ title, onConfirm, onCancel, loading }: {
  title: string; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#fee2e2]">
          <Trash2 className="h-5 w-5 text-red-500" />
        </div>
        <h3 className="text-[16px] font-extrabold text-[#111827]">Delete Post?</h3>
        <p className="mt-1.5 text-[13px] text-[#6b7280]">
          <span className="font-semibold text-[#374151]">"{title}"</span> will be permanently deleted. This cannot be undone.
        </p>
        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f8f9fb]">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-[13px] font-bold text-white transition hover:bg-red-600 disabled:opacity-60">
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Bulk delete confirm modal ──────────────────────────────────────────── */
function BulkDeleteModal({ count, onConfirm, onCancel, loading }: {
  count: number; onConfirm: () => void; onCancel: () => void; loading: boolean;
}) {
  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#fee2e2]">
          <Trash2 className="h-5 w-5 text-red-500" />
        </div>
        <h3 className="text-[16px] font-extrabold text-[#111827]">Delete {count} Post{count !== 1 ? "s" : ""}?</h3>
        <p className="mt-1.5 text-[13px] text-[#6b7280]">This will permanently delete the selected posts. This cannot be undone.</p>
        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f8f9fb]">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 rounded-xl bg-red-500 py-2.5 text-[13px] font-bold text-white hover:bg-red-600 disabled:opacity-60">
            {loading ? "Deleting…" : `Delete ${count}`}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Preview modal ──────────────────────────────────────────────────────── */
function PreviewModal({ video, onClose }: { video: ReelsooVideo; onClose: () => void }) {
  const mt      = video.media_type ?? (video.mime_type?.startsWith("image/") ? "image" : "video");
  const isVideo = mt === "video";
  const carouselItems = video.media_items?.length ? video.media_items : null;
  const src = isVideo ? (video.hls_url ?? video.video_url) : (video.thumbnail_url ?? carouselItems?.[0]?.url ?? video.video_url);
  const videoRef = useRef<HTMLVideoElement>(null);
  useHlsSource(videoRef, isVideo ? src : undefined, video.video_url);

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="relative w-full max-w-[400px] overflow-hidden rounded-2xl bg-black shadow-2xl"
        style={{ maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        {/* Close */}
        <button type="button" onClick={onClose}
          className="absolute right-3 top-3 z-10 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70">
          <X className="h-4 w-4" />
        </button>

        {/* Media */}
        {carouselItems ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={carouselItems[0].url ?? ""} alt="" className="w-full object-contain" style={{ maxHeight: "70vh" }} />
        ) : isVideo ? (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} controls autoPlay playsInline className="w-full" style={{ maxHeight: "70vh" }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={src} alt={video.title ?? ""} className="w-full object-contain" style={{ maxHeight: "70vh" }} />
        )}

        {/* Info bar */}
        <div className="bg-white p-4">
          <p className="truncate text-[14px] font-bold text-[#111827]">{video.title || video.caption || "Untitled"}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <StatusBadge status={video.status ?? "draft"} />
            <span className="flex items-center gap-1 text-[12px] text-[#6b7280]">
              <Eye className="h-3.5 w-3.5" />{fmt(video.views_count)}
            </span>
            <span className="flex items-center gap-1 text-[12px] text-[#6b7280]">
              <Heart className="h-3.5 w-3.5" />{fmt(video.likes_count)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Reschedule modal ───────────────────────────────────────────────────── */
function RescheduleModal({ video, onSave, onCancel, loading }: {
  video: ReelsooVideo; onSave: (iso: string) => void; onCancel: () => void; loading: boolean;
}) {
  const tomorrow = new Date(Date.now() + 86400000);
  const [date, setDate] = useState(tomorrow.toISOString().slice(0, 10));
  const [time, setTime] = useState("19:00");

  function handleSave() {
    const iso = new Date(`${date}T${time}:00`).toISOString();
    onSave(iso);
  }

  return (
    <div className="fixed inset-0 z-[999] flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-[380px] rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-full bg-[#fff7ed]">
          <Calendar className="h-5 w-5 text-[#f97316]" />
        </div>
        <h3 className="text-[16px] font-extrabold text-[#111827]">Reschedule Post</h3>
        <p className="mt-1 truncate text-[12px] text-[#6b7280]">"{video.title || video.caption || "Untitled"}"</p>

        <div className="mt-4 space-y-3">
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#374151]">Date</label>
            <input type="date" value={date} min={new Date().toISOString().slice(0, 10)}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-[13px] text-[#111827] outline-none focus:border-[#fd4605]" />
          </div>
          <div>
            <label className="mb-1 block text-[12px] font-semibold text-[#374151]">Time</label>
            <input type="time" value={time} onChange={e => setTime(e.target.value)}
              className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-[13px] text-[#111827] outline-none focus:border-[#fd4605]" />
          </div>
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f8f9fb]">
            Cancel
          </button>
          <button onClick={handleSave} disabled={loading || !date || !time}
            className="flex-1 rounded-xl bg-[#f97316] py-2.5 text-[13px] font-bold text-white hover:bg-[#ea6c0a] disabled:opacity-50">
            {loading ? "Saving…" : "Reschedule"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Stat card ──────────────────────────────────────────────────────────── */
function StatCard({ icon: Icon, iconBg, iconColor, label, value, loading }: {
  icon: React.ElementType; iconBg: string; iconColor: string;
  label: string; value: number | string; loading?: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 rounded-xl border border-[#f0f0f0] bg-white px-3.5 py-2.5">
      <div className={cn("grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg", iconBg)}>
        <Icon className={cn("h-4 w-4", iconColor)} />
      </div>
      <div className="min-w-0">
        {loading
          ? <div className="h-5 w-9 animate-pulse rounded bg-[#f3f4f6]" />
          : <p className="text-[16px] font-extrabold leading-tight text-[#111827]">{value}</p>}
        <p className="whitespace-nowrap text-[10px] leading-tight text-[#6b7280]">{label}</p>
      </div>
    </div>
  );
}

/* ── Action button ──────────────────────────────────────────────────────── */
function ActionBtn({ icon: Icon, label, color = "text-[#374151]", onClick, disabled }: {
  icon: React.ElementType; label: string; color?: string; onClick?: () => void; disabled?: boolean;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition hover:bg-[#f3f4f6] disabled:opacity-40", color)}>
      <Icon className="h-3.5 w-3.5 flex-shrink-0" />
      {label}
    </button>
  );
}

/* ── Table header ───────────────────────────────────────────────────────── */
function TableHeader({ allSelected, someSelected, onSelectAll }: {
  allSelected: boolean; someSelected: boolean; onSelectAll: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { if (ref.current) ref.current.indeterminate = someSelected && !allSelected; }, [someSelected, allSelected]);
  const cell = "text-[10px] font-bold uppercase tracking-wide text-[#9ca3af]";

  return (
    <div className="flex items-center gap-0 border-b border-[#f0f0f0] bg-[#fafafa] px-5 py-2.5">
      <div className="mr-2 w-5 flex-shrink-0">
        <input ref={ref} type="checkbox" checked={allSelected} onChange={onSelectAll}
          className="h-4 w-4 cursor-pointer rounded border-[#d1d5db] accent-[#fd4605]" />
      </div>
      <div className="mr-3 w-[54px] flex-shrink-0" />
      <div className={cn(cell, "flex-1")} style={{ minWidth: 140 }}>Content</div>
      <div className={cn(cell, "w-[105px] flex-shrink-0")}>Date</div>
      <div className={cn(cell, "w-[75px]  flex-shrink-0")}>Views</div>
      <div className={cn(cell, "w-[72px]  flex-shrink-0")}>Likes</div>
      <div className={cn(cell, "w-[82px]  flex-shrink-0")}>Comments</div>
      <div className={cn(cell, "w-[110px] flex-shrink-0")}>Status</div>
      <div className={cn(cell, "flex-shrink-0")}>Actions</div>
    </div>
  );
}

/* ── Content row ────────────────────────────────────────────────────────── */
interface ContentRowProps {
  video: ReelsooVideo;
  selected: boolean;
  onSelect: (id: number) => void;
  onDelete: (v: ReelsooVideo) => void;
  onPreview: (v: ReelsooVideo) => void;
  onDuplicate: (v: ReelsooVideo) => void;
  onReschedule: (v: ReelsooVideo) => void;
  onStatusChange: (id: number, status: VideoStatus) => void;
  duplicating: boolean;
}
function ContentRow({ video, selected, onSelect, onDelete, onPreview, onDuplicate, onReschedule, onStatusChange, duplicating }: ContentRowProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen]   = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const [menuCoords, setMenuCoords] = useState({ top: 0, right: 0 });
  const [mounted, setMounted]      = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const h = (e: MouseEvent) => {
      if (!menuPanelRef.current?.contains(e.target as Node) &&
          !menuBtnRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [menuOpen]);

  function openMenu() {
    if (!menuBtnRef.current) return;
    const r = menuBtnRef.current.getBoundingClientRect();
    setMenuCoords({ top: r.bottom + 4, right: window.innerWidth - r.right });
    setMenuOpen(true);
  }

  const status      = video.status ?? "draft";
  const isPublished = status === "published";
  const isScheduled = status === "scheduled";
  const isDraft     = status === "draft";
  const isPrivate   = status === "private";
  const displayDate = isScheduled && (video as any).scheduled_at ? (video as any).scheduled_at : video.created_at;
  const [dateStr, timeStr] = fmtDate(displayDate);

  return (
    <div className={cn(
      "flex items-center gap-0 border-b border-[#f5f5f5] px-5 py-3 transition hover:bg-[#fafafa]",
      selected && "bg-[#fff8f9]",
    )}>

      {/* Checkbox */}
      <div className="mr-2 w-5 flex-shrink-0">
        <input type="checkbox" checked={selected} onChange={() => onSelect(video.id)}
          className="h-4 w-4 cursor-pointer rounded border-[#d1d5db] accent-[#fd4605]" />
      </div>

      {/* Thumbnail - portrait 9:16; preview varies by media type */}
      {(() => {
        const mt        = video.media_type ?? "video";
        const isImage   = mt === "image" || mt === "image_carousel";
        const carousel  = mt === "image_carousel";
        // Photo posts: prefer the thumbnail the user picked, else the first carousel
        // image, else the single image itself (stored in video_url for 1-photo posts).
        const imgSrc    = video.thumbnail_url
          ?? video.media_items?.[0]?.url
          ?? (isImage ? video.video_url : null);

        // ── Image / carousel / video → image preview with type-specific overlays ──
        return (
          <div className="relative mr-3 flex-shrink-0 overflow-hidden rounded-xl bg-[#f3f4f6]"
            style={{ width: 54, aspectRatio: "9/16" }}>
            {imgSrc
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={imgSrc} alt={video.title ?? ""} className="h-full w-full object-cover" style={{ display: "block" }} />
              : <div className="flex h-full w-full items-center justify-center">
                  {isImage ? <ImageIcon className="h-5 w-5 text-[#d1d5db]" /> : <Video className="h-5 w-5 text-[#d1d5db]" />}
                </div>}

            {/* Duration badge - video only */}
            {!isImage && video.duration && (
              <span className="absolute bottom-1 left-0.5 right-0.5 text-center rounded bg-black/70 px-0.5 py-0.5 text-[8px] font-bold text-white leading-none">
                {fmtDuration(video.duration)}
              </span>
            )}

            {/* Carousel count badge */}
            {carousel && video.media_items?.length ? (
              <span className="absolute right-1 top-1 flex items-center gap-0.5 rounded bg-black/65 px-1 py-0.5 text-[8px] font-bold text-white leading-none">
                <Layers className="h-2 w-2" />{video.media_items.length}
              </span>
            ) : null}

            {/* Preview overlay on hover */}
            <button type="button" onClick={() => onPreview(video)}
              className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition hover:bg-black/30 hover:opacity-100">
              <div className="grid h-7 w-7 place-items-center rounded-full bg-white/80 backdrop-blur-sm">
                {isImage
                  ? <Eye className="h-3 w-3 text-[#111827]" />
                  : <Play className="ml-0.5 h-3 w-3 fill-[#111827] text-[#111827]" />}
              </div>
            </button>
          </div>
        );
      })()}

      {/* Title + type badge */}
      <div className="min-w-0 flex-1" style={{ minWidth: 140 }}>
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-bold text-[#111827]">{video.title || video.caption || "Untitled"}</p>
          {(() => {
            const mt      = video.media_type ?? "video";
            const isImg   = mt === "image" || mt === "image_carousel";
            const isCarousel = mt === "image_carousel";
            if (isCarousel) return (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold text-blue-600">
                <Layers className="h-2 w-2" />Carousel
              </span>
            );
            if (isImg)     return (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-sky-100 px-1.5 py-0.5 text-[9px] font-bold text-sky-600">
                <ImageIcon className="h-2 w-2" />Photo
              </span>
            );
            return (
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-[#fff3ec] px-1.5 py-0.5 text-[9px] font-bold text-[#fd4605]">
                <Video className="h-2 w-2" />Video
              </span>
            );
          })()}
        </div>
        {(video as any).hashtags?.length ? (
          <p className="mt-0.5 truncate text-[11px] text-[#9ca3af]">
            {((video as any).hashtags as string[]).slice(0, 3).map((t: string) => `#${t}`).join(" ")}
          </p>
        ) : null}
      </div>

      {/* Date */}
      <div className="w-[105px] flex-shrink-0">
        <p className="text-[11px] font-semibold text-[#374151]">{dateStr}</p>
        <p className="text-[11px] text-[#9ca3af]">{timeStr}</p>
      </div>

      {/* Views */}
      <div className="flex w-[75px] flex-shrink-0 items-center gap-1 text-[12px] text-[#6b7280]">
        <Eye className="h-3.5 w-3.5 flex-shrink-0" /><span>{fmt(video.views_count)}</span>
      </div>

      {/* Likes */}
      <div className="flex w-[72px] flex-shrink-0 items-center gap-1 text-[12px] text-[#6b7280]">
        <Heart className="h-3.5 w-3.5 flex-shrink-0" /><span>{fmt(video.likes_count)}</span>
      </div>

      {/* Comments */}
      <div className="flex w-[82px] flex-shrink-0 items-center gap-1 text-[12px] text-[#6b7280]">
        <MessageCircle className="h-3.5 w-3.5 flex-shrink-0" /><span>{fmt(video.comments_count)}</span>
      </div>

      {/* Status - clickable for quick change */}
      <div className="w-[110px] flex-shrink-0">
        <StatusBadge status={status} onStatusChange={s => onStatusChange(video.id, s)} />
      </div>

      {/* Actions */}
      <div className="flex flex-shrink-0 items-center gap-0">
        {/* Edit */}
        <Link href={`/studio/content/${video.id}/edit`}>
          <ActionBtn icon={Edit3} label="Edit" />
        </Link>

        {/* Insights (published/scheduled) */}
        {(isPublished || isScheduled) && (
          <Link href={`/studio/content/${video.id}/insights`}>
            <ActionBtn icon={BarChart2} label="Insights" />
          </Link>
        )}

        {/* Preview (draft/private) */}
        {(isDraft || isPrivate) && (
          <ActionBtn icon={Eye} label="Preview" onClick={() => onPreview(video)} />
        )}

        {/* Duplicate (draft/private) */}
        {(isDraft || isPrivate) && (
          <ActionBtn icon={Copy} label="Duplicate" disabled={duplicating} onClick={() => onDuplicate(video)} />
        )}

        {/* Promote (published/scheduled) */}
        {(isPublished || isScheduled) && (
          <ActionBtn
            icon={Rocket} label="Promote" color="text-[#7c3aed]"
            onClick={() => router.push(`/studio/content/${video.id}/promote`)}
          />
        )}

        {/* Reschedule (scheduled) */}
        {isScheduled && (
          <ActionBtn icon={Calendar} label="Reschedule" color="text-[#f97316]" onClick={() => onReschedule(video)} />
        )}

        {/* Delete (not scheduled inline) */}
        {!isScheduled && (
          <ActionBtn icon={Trash2} label="Delete" color="text-red-500" onClick={() => onDelete(video)} />
        )}

        {/* Three-dot overflow - portal to escape overflow:hidden */}
        <button ref={menuBtnRef} type="button" onClick={openMenu}
          className="grid h-7 w-7 place-items-center rounded-lg text-[#9ca3af] transition hover:bg-[#f3f4f6] hover:text-[#374151]">
          <MoreHorizontal className="h-4 w-4" />
        </button>
        {menuOpen && mounted && createPortal(
          <div ref={menuPanelRef}
            style={{ position: "fixed", top: menuCoords.top, right: menuCoords.right, zIndex: 9999, minWidth: 200 }}
            className="overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
            <Link href={`/videos/${video.id}`} target="_blank" onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
              <ExternalLink className="h-3.5 w-3.5 text-[#6b7280]" /> View Post
            </Link>
            <button type="button" onClick={() => {
                navigator.clipboard.writeText(`${window.location.origin}/videos/${video.id}`).then(() => toast.success("Link copied!"));
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
              <Link2 className="h-3.5 w-3.5 text-[#6b7280]" /> Copy Link
            </button>
            <div className="my-0.5 border-t border-[#f5f5f5]" />
            <button type="button" onClick={() => { setMenuOpen(false); onPreview(video); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
              <Eye className="h-3.5 w-3.5 text-[#6b7280]" /> Preview
            </button>
            {(isPublished || isScheduled) && (
              <Link href={`/studio/content/${video.id}/insights`} onClick={() => setMenuOpen(false)}
                className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
                <BarChart2 className="h-3.5 w-3.5 text-[#6b7280]" /> Insights
              </Link>
            )}
            <Link href={`/studio/content/${video.id}/edit`} onClick={() => setMenuOpen(false)}
              className="flex items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
              <Edit3 className="h-3.5 w-3.5 text-[#6b7280]" /> Edit
            </Link>
            <button type="button" onClick={() => { setMenuOpen(false); onDuplicate(video); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
              <Copy className="h-3.5 w-3.5 text-[#6b7280]" /> Duplicate
            </button>
            {isScheduled && (
              <button type="button" onClick={() => { setMenuOpen(false); onReschedule(video); }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#f97316] hover:bg-[#fff7ed]">
                <Calendar className="h-3.5 w-3.5" /> Reschedule
              </button>
            )}
            {isPublished && (
              <button type="button" onClick={() => { setMenuOpen(false); onStatusChange(video.id, "private"); }}
                className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">
                <EyeOff className="h-3.5 w-3.5 text-[#6b7280]" /> Make Private
              </button>
            )}
            <div className="my-0.5 border-t border-[#f5f5f5]" />
            <button type="button" onClick={() => { setMenuOpen(false); onDelete(video); }}
              className="flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] text-red-500 hover:bg-[#fff5f5]">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>,
          document.body
        )}
      </div>
    </div>
  );
}

/* ── Skeleton rows ──────────────────────────────────────────────────────── */
function SkeletonRows() {
  return (
    <>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-[#f5f5f5] px-5 py-3">
          <div className="h-4 w-4 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="mr-3 flex-shrink-0 animate-pulse rounded-xl bg-[#f3f4f6]" style={{ width: 54, aspectRatio: "9/16" }} />
          <div className="flex-1 space-y-2">
            <div className="h-3.5 w-44 animate-pulse rounded bg-[#f3f4f6]" />
            <div className="h-3 w-28 animate-pulse rounded bg-[#f3f4f6]" />
          </div>
          <div className="h-4 w-24 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-4 w-12 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-4 w-12 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-4 w-14 animate-pulse rounded bg-[#f3f4f6]" />
          <div className="h-6 w-20 animate-pulse rounded-full bg-[#f3f4f6]" />
          <div className="h-7 w-44 animate-pulse rounded-lg bg-[#f3f4f6]" />
        </div>
      ))}
    </>
  );
}

/* ── Page numbers ───────────────────────────────────────────────────────── */
function pageNumbers(cur: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const set = new Set<number>([1, 2]);
  if (cur > 3)       set.add(cur - 1);
  set.add(cur);
  if (cur < last - 1) set.add(cur + 1);
  set.add(last - 1); set.add(last);
  const sorted = [...set].sort((a, b) => a - b);
  const result: (number | "…")[] = [];
  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) result.push("…");
    result.push(sorted[i]);
  }
  return result;
}

/* ══════════════════════════════════════════════════════════════════════════
   Main page
══════════════════════════════════════════════════════════════════════════ */
export function StudioContentPage() {
  const router  = useRouter();
  const qc      = useQueryClient();
  const { user, isAuthenticated, authReady } = useAuthStore();

  /* ── UI state ── */
  const [collapsed, setCollapsed]           = useState(false);
  const [tab, setTab]                       = useState<StatusTab>("all");
  const [sort, setSort]                     = useState<SortOption>("newest");
  const [sortOpen, setSortOpen]             = useState(false);
  const [mediaTypeFilter, setMediaTypeFilter] = useState<MediaTypeFilter>("all");
  const [typeFilterOpen, setTypeFilterOpen] = useState(false);
  const [search, setSearch]                 = useState("");
  const [page, setPage]                     = useState(1);
  const [bulkOpen, setBulkOpen]             = useState(false);

  /* ── Date range ── */
  const [dateRange, setDateRange] = useState({
    start: new Date(Date.now() - 6 * 86400000),
    end:   new Date(),
  });
  const [dateFilterActive, setDateFilterActive] = useState(false);

  /* ── Selection ── */
  const [selectedIds, setSelectedIds]       = useState<Set<number>>(new Set());

  /* ── Modals ── */
  const [deleteTarget, setDeleteTarget]     = useState<ReelsooVideo | null>(null);
  const [previewTarget, setPreviewTarget]   = useState<ReelsooVideo | null>(null);
  const [rescheduleTarget, setRescheduleTarget] = useState<ReelsooVideo | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  const dSearch   = useDebounce(search, 400);
  const sortRef   = useRef<HTMLDivElement>(null);
  const typeRef   = useRef<HTMLDivElement>(null);
  const bulkRef   = useRef<HTMLDivElement>(null);

  useEffect(() => { if (authReady && !isAuthenticated) router.replace("/"); }, [authReady, isAuthenticated, router]);
  useEffect(() => { setPage(1); },          [tab, sort, dSearch, dateRange, dateFilterActive]);
  useEffect(() => { setSelectedIds(new Set()); }, [tab, sort, dSearch, page]);

  /* Close dropdowns on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (!sortRef.current?.contains(e.target as Node)) setSortOpen(false);
      if (!typeRef.current?.contains(e.target as Node)) setTypeFilterOpen(false);
      if (!bulkRef.current?.contains(e.target as Node)) setBulkOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  /* ── Query ── */
  const params = useMemo(() => ({
    ...(tab !== "all" && { status: tab }),
    sort, page, per_page: 5,
    ...(dSearch && { search: dSearch }),
    ...(dateFilterActive && {
      start_date: dateRange.start.toISOString().split("T")[0],
      end_date:   dateRange.end.toISOString().split("T")[0],
    }),
  }), [tab, sort, page, dSearch, dateRange, dateFilterActive]);

  const contentQ = useQuery({
    queryKey: ["studio-content", params],
    queryFn:  () => api.get<ContentResponse>("/studio/content", { params }).then(r => r.data),
    enabled:  isAuthenticated,
    staleTime: 60_000,
    retry: 1,
  });

  const videos = contentQ.data?.data ?? [];
  const meta   = contentQ.data?.meta;
  const counts = meta?.counts;

  const filteredVideos = mediaTypeFilter === "all" ? videos : videos.filter(v => {
    if (mediaTypeFilter === "image") return v.media_type === "image" || v.media_type === "image_carousel";
    if (mediaTypeFilter === "video") return !v.media_type || v.media_type === "video";
    return true;
  });

  const TYPE_FILTER_OPTIONS: { id: MediaTypeFilter; label: string; icon: React.ElementType; desc: string }[] = [
    { id: "all",   label: "All types", icon: LayoutGrid, desc: "Show everything"      },
    { id: "video", label: "Videos",    icon: Video,      desc: "Reels & video clips"  },
    { id: "image", label: "Images",    icon: ImageIcon,  desc: "Photos & carousels"   },
  ];
  const currentTypeOption = TYPE_FILTER_OPTIONS.find(o => o.id === mediaTypeFilter) ?? TYPE_FILTER_OPTIONS[0];

  /* ── Selection helpers ── */
  const allSelected  = filteredVideos.length > 0 && selectedIds.size === filteredVideos.length;
  const someSelected = selectedIds.size > 0 && selectedIds.size < filteredVideos.length;
  function toggleSelectAll() {
    setSelectedIds(allSelected ? new Set() : new Set(filteredVideos.map(v => v.id)));
  }
  function toggleSelect(id: number) {
    setSelectedIds(prev => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next; });
  }

  /* ── Mutations ── */
  const deleteMut = useMutation({
    mutationFn: (id: number) => api.delete(`/studio/content/${id}`),
    onSuccess: () => {
      setDeleteTarget(null);
      void qc.invalidateQueries({ queryKey: ["studio-content"] });
      notify.videoDeleted();
    },
    onError: () => toast.error("Delete failed."),
  });

  const duplicateMut = useMutation({
    mutationFn: (id: number) => api.post(`/studio/content/${id}/duplicate`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["studio-content"] });
      toast.success("Duplicated as draft.");
    },
    onError: () => toast.error("Duplicate failed."),
  });

  const bulkMut = useMutation({
    mutationFn: ({ action, ids }: { action: string; ids: number[] }) =>
      api.post("/studio/content/bulk", { action, ids }),
    onSuccess: (_, { action }) => {
      setSelectedIds(new Set());
      setBulkOpen(false);
      setBulkDeleteOpen(false);
      void qc.invalidateQueries({ queryKey: ["studio-content"] });
      toast.success(`Bulk ${action} applied.`);
    },
    onError: () => toast.error("Bulk action failed."),
  });

  const rescheduleMut = useMutation({
    mutationFn: ({ id, scheduled_at }: { id: number; scheduled_at: string }) =>
      api.patch(`/studio/content/${id}/reschedule`, { scheduled_at }),
    onSuccess: () => {
      setRescheduleTarget(null);
      void qc.invalidateQueries({ queryKey: ["studio-content"] });
      toast.success("Rescheduled.");
    },
    onError: () => toast.error("Reschedule failed."),
  });

  const statusMut = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      api.patch(`/studio/content/${id}/status`, { status }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["studio-content"] });
      toast.success("Status updated.");
    },
    onError: () => toast.error("Status update failed."),
  });

  const SORT_LABELS: Record<SortOption, string> = {
    newest: "Newest", oldest: "Oldest", most_viewed: "Most Viewed", most_liked: "Most Liked",
  };

  const TABS: { key: StatusTab; label: string }[] = [
    { key: "all",       label: "All"       },
    { key: "published", label: "Published" },
    { key: "draft",     label: "Drafts"    },
    { key: "scheduled", label: "Scheduled" },
    { key: "private",   label: "Private"   },
  ];

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">

      {/* ── Sidebar ── */}
      <StudioSidebarWrapper collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} activeHref="/studio/content" />

      {/* ── Main ── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ── Topbar ── */}
        <StudioTopbarShared
          title="Content"
          dateRange={dateRange}
          onDateRangeChange={(r) => { setDateRange(r); setDateFilterActive(true); }}
          onClearDateFilter={() => setDateFilterActive(false)}
          isDateFilterActive={dateFilterActive}
        />

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
          <div className="mx-auto max-w-[1440px] space-y-4 p-6">
            <RestrictionBanner types={["restrict_uploads", "post_approval_required", "disable_draft_creation"]} />

            {/* ══ Row 1 - Actions + Stats ══ */}
            <div className="flex flex-wrap items-center gap-3">

              <Link href="/upload"
                className="flex items-center gap-2 rounded-xl bg-[#fd4605] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#e03e04]">
                <Upload className="h-4 w-4" /> Create Post
              </Link>

              <Link href="/upload?draft=1"
                className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                <FileText className="h-4 w-4" /> Create Draft
              </Link>

              {/* Bulk Actions */}
              <div ref={bulkRef} className="relative">
                <button type="button" onClick={() => setBulkOpen(o => !o)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border bg-white px-4 py-2.5 text-[13px] font-semibold transition",
                    selectedIds.size > 0
                      ? "border-[#fd4605] text-[#fd4605]"
                      : "border-[#e5e7eb] text-[#374151] hover:border-[#fd4605]",
                  )}>
                  <Layers className="h-4 w-4" />
                  Bulk Actions
                  {selectedIds.size > 0 && (
                    <span className="ml-1 grid h-5 w-5 place-items-center rounded-full bg-[#fd4605] text-[10px] font-bold text-white">
                      {selectedIds.size}
                    </span>
                  )}
                  <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", bulkOpen && "rotate-180")} />
                </button>
                {bulkOpen && (
                  <div className="absolute left-0 top-full z-10 mt-1 w-[200px] overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
                    {selectedIds.size === 0 && (
                      <p className="px-4 py-2 text-[11px] text-[#9ca3af]">Select posts first</p>
                    )}
                    {[
                      { label: "Publish Selected",   action: "publish", Icon: Globe,    cls: "text-[#15803d]" },
                      { label: "Move to Draft",       action: "draft",   Icon: FileText, cls: "text-[#374151]" },
                      { label: "Delete Selected",     action: "delete",  Icon: Trash2,   cls: "text-red-500"   },
                    ].map(({ label, action, Icon, cls }) => (
                      <button key={action} type="button" disabled={selectedIds.size === 0 || bulkMut.isPending}
                        onClick={() => {
                          if (action === "delete") { setBulkOpen(false); setBulkDeleteOpen(true); return; }
                          bulkMut.mutate({ action, ids: [...selectedIds] });
                        }}
                        className={cn("flex w-full items-center gap-2.5 px-4 py-2.5 text-[13px] transition hover:bg-[#f8f9fb] disabled:opacity-40", cls)}>
                        <Icon className="h-3.5 w-3.5" />
                        {label}
                        {selectedIds.size > 0 && <span className="ml-auto text-[11px] font-normal text-[#9ca3af]">({selectedIds.size})</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Stats cards */}
              <div className="ml-auto flex flex-wrap gap-2">
                <StatCard icon={LayoutGrid} iconBg="bg-[#fff3ec]" iconColor="text-[#fd4605]" label="Total Posts" value={fmt(counts?.total     ?? 0)} loading={contentQ.isLoading} />
                <StatCard icon={Eye}      iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]" label="Published"    value={fmt(counts?.published ?? 0)} loading={contentQ.isLoading} />
                <StatCard icon={FileText} iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]" label="Drafts"       value={fmt(counts?.draft     ?? 0)} loading={contentQ.isLoading} />
                <StatCard icon={Calendar} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]" label="Scheduled"    value={fmt(counts?.scheduled ?? 0)} loading={contentQ.isLoading} />
                <StatCard icon={Lock}     iconBg="bg-[#f3f4f6]" iconColor="text-[#6b7280]" label="Private"      value={fmt(counts?.private   ?? 0)} loading={contentQ.isLoading} />
              </div>
            </div>

            {/* ══ Row 2 - Search / Refresh / Sort / Filter ══ */}
            <div className="flex items-center gap-2.5">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search content by title..."
                  className="w-full rounded-xl border border-[#e5e7eb] bg-white py-2.5 pl-9 pr-9 text-[13px] text-[#111827] outline-none transition focus:border-[#fd4605]" />
                {search && (
                  <button type="button" onClick={() => setSearch("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              <button type="button" title="Refresh"
                onClick={() => void qc.invalidateQueries({ queryKey: ["studio-content"] })}
                className="grid h-10 w-10 place-items-center rounded-xl border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#fd4605] hover:text-[#fd4605]">
                <RefreshCw className={cn("h-4 w-4", contentQ.isFetching && "animate-spin")} />
              </button>

              <div ref={sortRef} className="relative">
                <button type="button" onClick={() => setSortOpen(o => !o)}
                  className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] text-[#374151] transition hover:border-[#fd4605]">
                  <span className="text-[#9ca3af]">Sort by:</span>
                  <span className="font-semibold">{SORT_LABELS[sort]}</span>
                  <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", sortOpen && "rotate-180")} />
                </button>
                {sortOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-[165px] overflow-hidden rounded-xl border border-[#f0f0f0] bg-white shadow-xl">
                    {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([k, v]) => (
                      <button key={k} type="button" onClick={() => { setSort(k); setSortOpen(false); }}
                        className={cn("flex w-full items-center px-4 py-2.5 text-[13px] transition",
                          k === sort ? "bg-[#fff3ec] font-semibold text-[#fd4605]" : "text-[#374151] hover:bg-[#f8f9fb]")}>
                        {v}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Type filter dropdown */}
              <div ref={typeRef} className="relative">
                <button type="button" onClick={() => setTypeFilterOpen(o => !o)}
                  className={cn(
                    "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13px] font-semibold transition",
                    mediaTypeFilter !== "all"
                      ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605]"
                      : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fd4605]",
                  )}>
                  <currentTypeOption.icon className="h-4 w-4 flex-shrink-0" />
                  {mediaTypeFilter === "all" ? "Type" : currentTypeOption.label}
                  <ChevronDown className={cn(
                    "h-3.5 w-3.5 flex-shrink-0 transition-transform",
                    typeFilterOpen && "rotate-180",
                    mediaTypeFilter !== "all" ? "text-[#fd4605]" : "text-[#9ca3af]",
                  )} />
                </button>

                {typeFilterOpen && (
                  <div className="absolute right-0 top-full z-10 mt-1 w-56 overflow-hidden rounded-xl border border-[#f0f0f0] bg-white p-1.5 shadow-xl">
                    {TYPE_FILTER_OPTIONS.map(({ id, label, icon: Icon, desc }) => (
                      <button key={id} type="button"
                        onClick={() => { setMediaTypeFilter(id); setTypeFilterOpen(false); }}
                        className={cn(
                          "flex w-full items-center gap-3 rounded-[8px] px-3 py-2.5 text-left transition hover:bg-[#f8f9fb]",
                          id === mediaTypeFilter ? "bg-[#fff3ec]" : "",
                        )}>
                        <div className={cn(
                          "flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg",
                          id === mediaTypeFilter ? "bg-[#fd4605]" : "bg-[#f3f4f6]",
                        )}>
                          <Icon className={cn("h-3.5 w-3.5", id === mediaTypeFilter ? "text-white" : "text-[#6b7280]")} />
                        </div>
                        <div className="min-w-0">
                          <p className={cn("text-[12px] font-semibold leading-none", id === mediaTypeFilter ? "text-[#fd4605]" : "text-[#111827]")}>
                            {label}
                          </p>
                          <p className="mt-0.5 text-[10px] text-[#9ca3af]">{desc}</p>
                        </div>
                        {id === mediaTypeFilter && (
                          <div className="ml-auto h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#fd4605]" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ══ Row 3 - Status tabs ══ */}
            <div className="flex items-center gap-1 rounded-xl border border-[#e5e7eb] bg-[#f8f9fb] p-1" style={{ width: "fit-content" }}>
              {TABS.map(t => (
                <button key={t.key} type="button" onClick={() => setTab(t.key)}
                  className={cn("flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-[13px] font-semibold transition",
                    tab === t.key ? "bg-white text-[#fd4605] shadow-sm" : "text-[#6b7280] hover:text-[#374151]")}>
                  {t.label}
                  {t.key !== "all" && counts && (
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
                      tab === t.key ? "bg-[#fff3ec] text-[#fd4605]" : "bg-[#e5e7eb] text-[#9ca3af]")}>
                      {counts[t.key] ?? 0}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* ══ Content table ══ */}
            <div className="overflow-hidden rounded-2xl border border-[#f0f0f0] bg-white">
              <TableHeader allSelected={allSelected} someSelected={someSelected} onSelectAll={toggleSelectAll} />

              {contentQ.isLoading ? <SkeletonRows /> :
               filteredVideos.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <div className="mb-3 grid h-14 w-14 place-items-center rounded-full bg-[#f3f4f6]">
                    <LayoutGrid className="h-6 w-6 text-[#d1d5db]" />
                  </div>
                  <p className="text-[14px] font-semibold text-[#374151]">
                    {search
                      ? `No content matches "${search}"`
                      : mediaTypeFilter !== "all"
                        ? `No ${currentTypeOption.label.toLowerCase()} found`
                        : "No posts yet"}
                  </p>
                  <p className="mt-1 text-[12px] text-[#9ca3af]">
                    {search
                      ? "Try a different search term."
                      : mediaTypeFilter !== "all"
                        ? "Try a different type filter."
                        : "Create your first post to get started."}
                  </p>
                  {!search && mediaTypeFilter === "all" && (
                    <Link href="/upload"
                      className="mt-4 rounded-full bg-[#fd4605] px-5 py-2 text-[13px] font-bold text-white transition hover:bg-[#e03e04]">
                      Create Now
                    </Link>
                  )}
                </div>
              ) : (
                filteredVideos.map(v => (
                  <ContentRow key={v.id} video={v}
                    selected={selectedIds.has(v.id)}
                    onSelect={toggleSelect}
                    onDelete={setDeleteTarget}
                    onPreview={setPreviewTarget}
                    onDuplicate={(vid) => duplicateMut.mutate(vid.id)}
                    onReschedule={setRescheduleTarget}
                    onStatusChange={(id, status) => statusMut.mutate({ id, status })}
                    duplicating={duplicateMut.isPending}
                  />
                ))
              )}
            </div>

            {/* ══ Pagination ══ */}
            {meta && (
              <div className="flex items-center justify-between">
                <p className="text-[12px] text-[#6b7280]">
                  {meta.from && meta.to
                    ? `Showing ${meta.from}-${meta.to} of ${meta.total.toLocaleString()} posts`
                    : `${meta.total.toLocaleString()} post${meta.total !== 1 ? "s" : ""}`}
                </p>

                {meta.last_page > 1 && (
                  <div className="flex items-center gap-1">
                    <button type="button" onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e7eb] bg-white text-[#374151] transition hover:border-[#fd4605] disabled:opacity-40">
                      <ChevronLeft className="h-4 w-4" />
                    </button>
                    {pageNumbers(page, meta.last_page).map((p, i) =>
                      p === "…" ? (
                        <span key={`e${i}`} className="grid h-8 w-8 place-items-center text-[#9ca3af]">…</span>
                      ) : (
                        <button key={p} type="button" onClick={() => setPage(p)}
                          className={cn("grid h-8 w-8 place-items-center rounded-lg text-[13px] font-semibold transition",
                            p === page ? "bg-[#fd4605] text-white" : "border border-[#e5e7eb] bg-white text-[#374151] hover:border-[#fd4605]")}>
                          {p}
                        </button>
                      ),
                    )}
                    <button type="button" onClick={() => setPage(p => Math.min(meta.last_page, p+1))} disabled={page===meta.last_page}
                      className="grid h-8 w-8 place-items-center rounded-lg border border-[#e5e7eb] bg-white text-[#374151] transition hover:border-[#fd4605] disabled:opacity-40">
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {deleteTarget && (
        <DeleteModal
          title={deleteTarget.title || deleteTarget.caption || "Untitled"}
          loading={deleteMut.isPending}
          onConfirm={() => deleteMut.mutate(deleteTarget.id)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
      {previewTarget && (
        <PreviewModal video={previewTarget} onClose={() => setPreviewTarget(null)} />
      )}
      {rescheduleTarget && (
        <RescheduleModal
          video={rescheduleTarget}
          loading={rescheduleMut.isPending}
          onSave={iso => rescheduleMut.mutate({ id: rescheduleTarget.id, scheduled_at: iso })}
          onCancel={() => setRescheduleTarget(null)}
        />
      )}
      {bulkDeleteOpen && (
        <BulkDeleteModal
          count={selectedIds.size}
          loading={bulkMut.isPending}
          onConfirm={() => bulkMut.mutate({ action: "delete", ids: [...selectedIds] })}
          onCancel={() => setBulkDeleteOpen(false)}
        />
      )}
    </div>
  );
}
