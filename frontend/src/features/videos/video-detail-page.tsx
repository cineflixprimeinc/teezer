"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle, BarChart2, Check, ChevronDown, ChevronLeft, ChevronRight,
  ChevronUp, Code2, Copy, ExternalLink, Eye, Flag, Images, Lock, MapPin, MessageCircle,
  MoreHorizontal, Pin, Play, Search, Settings, Share2, Sparkles,
  ThumbsDown, Trash2, Volume2, VolumeX, X,
} from "lucide-react";
import { toast } from "sonner";
import { ContentLinkBar } from "@/components/feed/content-link-bar";
import { cn, formatCompact, locationSlug } from "@/lib/utils";
import { AnimatedHeart, AnimatedBookmark } from "@/components/video/animated-like-save";
import { videoService } from "@/services/video.service";
import { userService } from "@/services/user.service";
import { CommentSection } from "@/components/video/comment-section";
import { LinkPreviewFromText } from "@/components/link-preview";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { VideoSharePanel } from "@/components/video/video-share-panel";
import { CreateStoryModal, type SharedVideoSource } from "@/components/story/create-story-modal";
import { ReportModal } from "@/components/report/ReportModal";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { apiMessage } from "@/services/api";
import { useWatchTracker } from "@/hooks/useWatchTracker";
import { useHlsSource } from "@/hooks/use-hls-source";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import type { ReelsooVideo } from "@/types/video";

/* ── Types ─────────────────────────────────────────────────────────────── */
type RightTab = "comments" | "creator-videos";

/* ── Helpers ────────────────────────────────────────────────────────────── */
function fmtTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}
function fmtRelative(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return `${s}s`; if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function avatarColor(seed?: string | number | null): string {
  const p = ["#fd4605","#1d8cff","#a855f7","#10b981","#f97316","#8b5cf6"];
  const s = String(seed ?? "x"); let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return p[Math.abs(h) % p.length];
}

/* ── Verified badge ─────────────────────────────────────────────────────── */
/* ── No-comments empty icon (right panel) ───────────────────────────────── */
/* ── Avatar ─────────────────────────────────────────────────────────────── */
function Avatar({ src, name, size = 40, className = "" }: { src?: string | null; name?: string; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const initial = (name?.[0] ?? "U").toUpperCase();
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={src} alt={name ?? "avatar"} onError={() => setFailed(true)}
        className={cn("rounded-full object-cover flex-shrink-0", className)}
        style={{ width: size, height: size }} referrerPolicy="no-referrer" />
    );
  }
  return (
    <div className={cn("flex items-center justify-center rounded-full flex-shrink-0 font-bold text-white", className)}
      style={{ width: size, height: size, background: avatarColor(name), fontSize: Math.round(size * 0.38) }}>
      {initial}
    </div>
  );
}

/* ── Floating dark menu ─────────────────────────────────────────────────── */
type MenuItemDef = { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean; toggle?: boolean; checked?: boolean; value?: string };
function FloatingMenu({ items, onClose }: { items: MenuItemDef[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown",   k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-2xl shadow-2xl"
      style={{ background: "rgba(18,18,18,0.97)", border: "1px solid rgba(255,255,255,0.09)" }}>
      {items.map((item, i) => (
        <button key={i} type="button"
          onClick={(e) => { e.stopPropagation(); item.onClick(); }}
          className={cn("flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-white/10",
            item.danger ? "text-red-400" : "text-white")}>
          <span className="flex-shrink-0 opacity-80">{item.icon}</span>
          <span className="flex-1">{item.label}</span>
          {item.value && !item.toggle && (
            <span className="text-xs text-white/50 font-medium">{item.value}</span>
          )}
          {item.toggle && (
            <span className={cn("h-4 w-7 rounded-full transition", item.checked ? "bg-[#fd4605]" : "bg-white/20")}>
              <span className={cn("block h-4 w-4 rounded-full bg-white shadow transition-transform",
                item.checked ? "translate-x-3" : "translate-x-0")} />
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

/* ── Quality options ────────────────────────────────────────────────────── */
const QUALITY_OPTIONS = [
  { key: "auto", label: "Auto"  },
  { key: "4k",   label: "4K"   },
  { key: "1080", label: "1080p"},
  { key: "720",  label: "720p" },
  { key: "480",  label: "480p" },
  { key: "360",  label: "360p" },
] as const;

function QualityPanel({
  current, qualityUrls, onSelect, onClose,
}: {
  current: string;
  qualityUrls?: Record<string, string> | null;
  onSelect: (q: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent)  => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown",   k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  return (
    <div
      ref={ref}
      className="absolute right-0 top-full z-50 mt-1 w-44 overflow-hidden rounded-2xl shadow-2xl"
      style={{ background: "rgba(18,18,18,0.97)", border: "1px solid rgba(255,255,255,0.09)" }}
      onClick={e => e.stopPropagation()}
    >
      <div className="border-b border-white/10 px-4 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Quality</p>
      </div>
      {QUALITY_OPTIONS.map(({ key, label }) => {
        const available = key === "auto" || !!(qualityUrls?.[key]);
        const active    = key === current;
        return (
          <button key={key} type="button" disabled={!available}
            onClick={e => { e.stopPropagation(); if (available) onSelect(key); }}
            className={cn(
              "flex w-full items-center justify-between px-4 py-2.5 text-sm transition",
              active    ? "text-[#fd4605]"              :
              available ? "text-white hover:bg-white/10" :
                          "cursor-not-allowed text-white/25",
            )}>
            <span>{label}</span>
            {active    && <Check className="h-3.5 w-3.5 flex-shrink-0" />}
            {!available && <span className="text-[10px] text-white/30">N/A</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ── Light menu for right panel ─────────────────────────────────────────── */
type LightMenuItemDef = { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean };
function LightMenu({ items, onClose }: { items: LightMenuItemDef[]; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", h);
    document.addEventListener("keydown",   k);
    return () => { document.removeEventListener("mousedown", h); document.removeEventListener("keydown", k); };
  }, [onClose]);
  return (
    <div ref={ref} className="absolute right-0 top-full z-50 mt-1 w-52 overflow-hidden rounded-2xl bg-white shadow-2xl"
      style={{ border: "1px solid #f0f0f0" }}>
      {items.map((item, i) => (
        <button key={i} type="button"
          onClick={(e) => { e.stopPropagation(); item.onClick(); }}
          className={cn("flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition hover:bg-[#f8f9fb]",
            item.danger ? "text-red-500" : "text-[#111827]")}>
          <span className="flex-shrink-0 text-[#6b7280]">{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* ── Delete confirmation modal ──────────────────────────────────────────── */
function DeleteModal({ onCancel, onConfirm, loading }: { onCancel: () => void; onConfirm: () => void; loading: boolean }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-80 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50 mx-auto">
          <AlertTriangle className="h-6 w-6 text-red-500" />
        </div>
        <p className="mt-4 text-center text-base font-bold text-[#111827]">Delete this reel?</p>
        <p className="mt-1 text-center text-sm text-[#6b7280]">This action cannot be undone.</p>
        <div className="mt-5 flex gap-3">
          <button onClick={onCancel} disabled={loading}
            className="flex-1 rounded-full border border-[#e5e7eb] py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#f8f9fb] transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={onConfirm} disabled={loading}
            className="flex-1 rounded-full bg-red-500 py-2.5 text-sm font-bold text-white hover:bg-red-600 transition disabled:opacity-50">
            {loading ? "Deleting…" : "Delete"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Embed modal ────────────────────────────────────────────────────────── */
const EMBED_SIZES = [
  { label: "Small",   w: 325,  h: 580  },
  { label: "Medium",  w: 405,  h: 720  },
  { label: "Large",   w: 540,  h: 960  },
  { label: "Custom",  w: 0,    h: 0    },
] as const;

function EmbedModal({ videoId, onClose }: { videoId: number; onClose: () => void }) {
  const origin    = typeof window !== "undefined" ? window.location.origin : "https://teezer.live";
  const embedBase = `${origin}/embed/${videoId}`;

  const [sizeIdx,    setSizeIdx]    = useState(1);          // default Medium
  const [customW,    setCustomW]    = useState(405);
  const [customH,    setCustomH]    = useState(720);
  const [autoplay,   setAutoplay]   = useState(false);
  const [showCaption,setShowCaption]= useState(true);
  const [copied,     setCopied]     = useState(false);

  const preset = EMBED_SIZES[sizeIdx];
  const isCustom = preset.label === "Custom";
  const w = isCustom ? customW : preset.w;
  const h = isCustom ? customH : preset.h;

  const params = new URLSearchParams();
  if (autoplay)    params.set("autoplay", "1");
  if (!showCaption)params.set("nocaption", "1");
  const src = `${embedBase}${params.toString() ? "?" + params.toString() : ""}`;

  const iframeCode = `<iframe\n  src="${src}"\n  width="${w}"\n  height="${h}"\n  frameborder="0"\n  allow="autoplay; clipboard-write; encrypted-media"\n  allowfullscreen\n  title="Teezer video"\n></iframe>`;

  function copy() {
    navigator.clipboard.writeText(iframeCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f0f0f0] px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#fff3ec]">
              <Code2 className="h-4 w-4 text-[#fd4605]" />
            </div>
            <p className="text-[15px] font-bold text-[#111827]">Embed Video</p>
          </div>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f3f4f6]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Size picker */}
          <div>
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9ca3af]">Size</p>
            <div className="flex gap-2">
              {EMBED_SIZES.map((s, i) => (
                <button key={s.label} onClick={() => setSizeIdx(i)}
                  className={cn("flex-1 rounded-xl border py-2 text-[12px] font-semibold transition",
                    sizeIdx === i ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605]" : "border-[#e5e7eb] text-[#374151] hover:border-[#fd4605]")}>
                  {s.label}
                  {!isCustom && i === sizeIdx && s.w > 0 && (
                    <span className="block text-[9px] font-medium text-[#9ca3af]">{s.w}×{s.h}</span>
                  )}
                </button>
              ))}
            </div>
            {isCustom && (
              <div className="mt-2 flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-[10.5px] text-[#9ca3af]">Width (px)</label>
                  <input type="number" value={customW} min={200} max={1200} onChange={e => setCustomW(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#fd4605]" />
                </div>
                <div className="flex-1">
                  <label className="mb-1 block text-[10.5px] text-[#9ca3af]">Height (px)</label>
                  <input type="number" value={customH} min={300} max={2000} onChange={e => setCustomH(Number(e.target.value))}
                    className="w-full rounded-xl border border-[#e5e7eb] px-3 py-2 text-[13px] font-bold outline-none focus:border-[#fd4605]" />
                </div>
              </div>
            )}
          </div>

          {/* Options */}
          <div>
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9ca3af]">Options</p>
            <div className="space-y-2">
              {([
                ["Autoplay",      autoplay,    setAutoplay],
                ["Show caption",  showCaption, setShowCaption],
              ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
                <div key={label} className="flex items-center justify-between rounded-xl border border-[#f0f0f0] px-4 py-2.5">
                  <span className="text-[13px] text-[#374151]">{label}</span>
                  <button type="button" onClick={() => set(!val)}
                    className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition", val ? "bg-[#fd4605]" : "bg-[#e5e7eb]")}>
                    <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition", val ? "translate-x-[18px]" : "translate-x-[2px]")} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Code preview */}
          <div>
            <p className="mb-2 text-[11.5px] font-semibold uppercase tracking-wide text-[#9ca3af]">Embed code</p>
            <div className="relative rounded-xl border border-[#e5e7eb] bg-[#f8f9fb]">
              <pre className="overflow-x-auto px-4 py-3 text-[11px] leading-relaxed text-[#374151] whitespace-pre">{iframeCode}</pre>
              <button onClick={copy}
                className={cn("absolute right-2 top-2 flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[10.5px] font-bold transition",
                  copied ? "bg-[#dcfce7] text-[#16a34a]" : "bg-white border border-[#e5e7eb] text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605]")}>
                {copied ? <><Check className="h-3 w-3" /> Copied!</> : <><Copy className="h-3 w-3" /> Copy</>}
              </button>
            </div>
          </div>

          {/* Preview link */}
          <p className="text-center text-[11px] text-[#9ca3af]">
            Paste the code above into any website to embed this video. Dimensions: <strong className="text-[#374151]">{w} × {h} px</strong>
          </p>
        </div>

        {/* Footer */}
        <div className="flex gap-3 border-t border-[#f0f0f0] px-5 py-4">
          <button onClick={onClose}
            className="flex-1 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f8f9fb] transition">
            Close
          </button>
          <button onClick={copy}
            className="flex-1 rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-bold text-white hover:bg-[#e03e04] transition flex items-center justify-center gap-1.5">
            {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy embed code</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Privacy modal ──────────────────────────────────────────────────────── */
function PrivacyModal({ video, onClose, onSaved }: { video: ReelsooVideo; onClose: () => void; onSaved: () => void }) {
  const [visibility,     setVisibility]     = useState(video.status === "private" || video.status === "draft" ? "private" : video.status === "unlisted" ? "unlisted" : "public");
  const [allowComments,  setAllowComments]  = useState(video.allow_comments  ?? true);
  const [allowDuet,      setAllowDuet]      = useState(video.allow_duet      ?? true);
  const [allowStitch,    setAllowStitch]    = useState(video.allow_stitch    ?? true);
  const [saving,         setSaving]         = useState(false);

  async function save() {
    setSaving(true);
    try {
      await videoService.updatePrivacy(video.id, {
        visibility, allow_comments: allowComments,
        allow_duet: allowDuet, allow_stitch: allowStitch,
      });
      toast.success("Privacy settings updated.");
      onSaved();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-96 rounded-2xl bg-white p-6 shadow-2xl">
        <div className="mb-5 flex items-center justify-between">
          <p className="text-base font-bold text-[#111827]">Privacy Settings</p>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f8f9fb]"><X className="h-4 w-4" /></button>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-[#9ca3af]">Visibility</p>
          {([["public","Public","Anyone can watch"], ["private","Private","Only you"], ["unlisted","Unlisted","Anyone with the link"]] as const).map(([v, l, h]) => (
            <label key={v} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[#f0f0f0] px-4 py-3 hover:border-[#fd4605] transition">
              <input type="radio" name="visibility" value={v} checked={visibility === v} onChange={() => setVisibility(v)} className="accent-[#fd4605]" />
              <div>
                <p className="text-sm font-semibold text-[#111827]">{l}</p>
                <p className="text-xs text-[#9ca3af]">{h}</p>
              </div>
            </label>
          ))}

          <p className="pt-2 text-xs font-bold uppercase tracking-wide text-[#9ca3af]">Interactions</p>
          {([
            ["Allow comments",  allowComments,  setAllowComments],
            ["Allow duet",      allowDuet,      setAllowDuet],
            ["Allow stitch",    allowStitch,    setAllowStitch],
          ] as [string, boolean, (v: boolean) => void][]).map(([label, val, set]) => (
            <div key={label} className="flex items-center justify-between rounded-xl border border-[#f0f0f0] px-4 py-3">
              <span className="text-sm text-[#111827]">{label}</span>
              <button type="button" role="switch" aria-checked={val} onClick={() => set(!val)}
                className={cn("relative inline-flex h-5 w-9 items-center rounded-full transition", val ? "bg-[#fd4605]" : "bg-[#e5e7eb]")}>
                <span className={cn("inline-block h-4 w-4 transform rounded-full bg-white shadow transition", val ? "translate-x-[18px]" : "translate-x-[2px]")} />
              </button>
            </div>
          ))}
        </div>

        <div className="mt-5 flex gap-3">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-full border border-[#e5e7eb] py-2.5 text-sm font-semibold text-[#111827] hover:bg-[#f8f9fb] transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={save} disabled={saving}
            className="flex-1 rounded-full bg-[#fd4605] py-2.5 text-sm font-bold text-white hover:bg-[#e03e04] transition disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export function VideoDetailPage({ id }: { id: string }) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const numId        = Number(id);

  /* Navigation context */
  const idsParam     = searchParams.get("ids");
  const sourceParam  = searchParams.get("source") ?? "";   // "profile" | "home_feed" | "creator_videos" | ""
  const fromUsername = searchParams.get("u") ?? null;

  const navIds: number[] = idsParam
    ? idsParam.split(",").map(Number).filter(Boolean)
    : [];
  const curNavIdx = navIds.indexOf(numId);
  const prevId    = curNavIdx > 0 ? navIds[curNavIdx - 1] : null;
  const nextId    = curNavIdx < navIds.length - 1 ? navIds[curNavIdx + 1] : null;

  /* ?t= - start video at a given timestamp (from feed fullscreen click) */
  const startTime = Math.max(0, Number(searchParams.get("t") ?? 0));

  /* Fetch profile videos as fallback nav list when source=profile and no ids */
  const profileNavQ = useQuery({
    queryKey: ["detail-profile-nav", fromUsername],
    queryFn:  () => userService.videos(fromUsername!, "latest"),
    enabled:  sourceParam === "profile" && !!fromUsername && navIds.length === 0,
    staleTime: 60_000,
  });
  const effectiveNavIds: number[] = navIds.length > 0
    ? navIds
    : (profileNavQ.data?.data ?? []).map((v) => v.id);
  const effectiveCurIdx = effectiveNavIds.indexOf(numId);
  const effectivePrevId = effectiveCurIdx > 0 ? effectiveNavIds[effectiveCurIdx - 1] : prevId;
  const effectiveNextId = effectiveCurIdx < effectiveNavIds.length - 1
    ? effectiveNavIds[effectiveCurIdx + 1] : nextId;

  const { isAuthenticated, user: authUser, openAuthModal } = useAuthStore();
  const { autoScroll, setAutoScroll, captionsEnabled, setCaptionsEnabled, quality, setQuality, mutedPref, volumePref, setMutedPref, setVolumePref } = useUiStore();
  const qc = useQueryClient();

  const isOwner = useCallback((videoUserId?: number) =>
    isAuthenticated && !!authUser && authUser.id === videoUserId, [isAuthenticated, authUser]);

  /* ── Fetch video ── */
  const q = useQuery({
    queryKey: ["video", numId],
    queryFn:  () => videoService.getById(numId),
    enabled:  Number.isFinite(numId) && numId > 0,
    staleTime: 30_000,
  });
  const v = q.data;

  /* Ownership check - must be before any useEffect that references `own` */
  const own = isAuthenticated && !!authUser && !!v?.user && (
    Number(authUser.id) === Number(v.user.id) ||
    authUser.username === v.user.username
  );

  /* ── Video player state ── */
  const videoRef      = useRef<HTMLVideoElement>(null);
  const progressRef   = useRef<HTMLDivElement>(null);
  const leftAreaRef   = useRef<HTMLDivElement>(null);
  const rightPanelRef = useRef<HTMLDivElement>(null);
  const wheelLockRef  = useRef(false);
  const wasPlayingRef = useRef(false);
  /* Keep latest nav targets accessible inside non-reactive callbacks */
  const prevIdRef  = useRef<number | null>(null);
  const nextIdRef  = useRef<number | null>(null);
  prevIdRef.current = effectivePrevId ?? null;
  nextIdRef.current = effectiveNextId ?? null;

  const controlsTimerRef      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingQualitySeekRef = useRef<number>(0);  // >0 means a quality switch is in flight
  const resumeAfterQualityRef = useRef<boolean>(false);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const volHideRef       = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartYRef   = useRef<number | null>(null);

  // An explicit quality pick always wins (pendingQualitySeekRef/onLoadedMetadata
  // above restores playback position across the src swap). Otherwise prefer the
  // adaptive HLS ladder, falling back to the progressive mp4 while the transcode
  // hasn't finished yet (hls_url is null).
  const desiredVideoUrl = v && v.media_type !== "image" && v.media_type !== "image_carousel"
    ? (quality !== "auto" && v.quality_urls?.[quality] ? v.quality_urls[quality] : (v.hls_url ?? v.video_url ?? undefined))
    : undefined;
  useHlsSource(videoRef, desiredVideoUrl, v?.video_url);

  const [playing,        setPlaying]        = useState(false);
  const [detailDragging, setDetailDragging] = useState(false);
  const [showControls,   setShowControls]   = useState(true);
  const [showVolSlider,  setShowVolSlider]  = useState(false);
  const [locOpen,        setLocOpen]        = useState(false);
  const [muted,     setMuted]     = useState(() => mutedPref);
  const [volume, setVolume] = useState(() => volumePref);
  // Keep local state in sync with the app-wide audio preference, so the
  // preference set in the feed (or another video) carries over here too.
  useEffect(() => { setMuted(mutedPref); }, [mutedPref]);
  useEffect(() => { setVolume(volumePref); }, [volumePref]);
  const [current,    setCurrent]   = useState(0);
  const [duration,   setVideoDur]  = useState(0);
  // Measured media aspect ratio so the player matches the real video shape
  // (no forced 9:16 letterboxing for landscape/square clips).
  const [mediaAr,    setMediaAr]   = useState<number | null>(null);
  // Clear the measured ratio when navigating to another post so the player
  // doesn't briefly keep the previous clip's shape.
  useEffect(() => { setMediaAr(null); }, [numId]);
  const [searching,  setSearching] = useState(false);
  const [searchQ,    setSearchQ]   = useState("");
  const [carouselIdx,setCarouselIdx] = useState(0);

  /* ── UI state ── */
  const [videoMenuOpen,    setVideoMenuOpen]    = useState(false);
  const [postMenuOpen,     setPostMenuOpen]     = useState(false);
  const [activeTab,        setActiveTab]        = useState<RightTab>("comments");
  const [showDelete,       setShowDelete]       = useState(false);
  const [showPrivacy,      setShowPrivacy]      = useState(false);
  const [showReport,       setShowReport]       = useState(false);
  const [showEmbed,        setShowEmbed]        = useState(false);
  const [showSharePanel,   setShowSharePanel]   = useState(false);
  const [showStoryModal,    setShowStoryModal]    = useState(false);
  const [storySharedVideo,  setStorySharedVideo]  = useState<SharedVideoSource | null>(null);
  const [isPinned,         setIsPinned]         = useState(v?.is_pinned ?? false);

  /* ── Like / save state ── */
  const [liked,     setLiked]     = useState(v?.is_liked    ?? false);
  const [saved,     setSaved]     = useState(v?.is_saved    ?? false);
  const [likeCt,    setLikeCt]    = useState(v?.likes_count  ?? 0);
  const [saveCt,    setSaveCt]    = useState(v?.saves_count  ?? 0);
  const [commentCt, setCommentCt] = useState(v?.comments_count ?? 0);
  useEffect(() => {
    if (!v) return;
    setLiked(v.is_liked    ?? false);
    setSaved(v.is_saved    ?? false);
    setLikeCt(v.likes_count  ?? 0);
    setSaveCt(v.saves_count  ?? 0);
    setCommentCt(v.comments_count ?? 0);
    setIsPinned(v.is_pinned ?? false);
  }, [v]);

  /* ── Autoplay when video element is ready ── */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !v) return;
    el.muted  = mutedPref;
    el.volume = volumePref;
    el.play().catch((err: unknown) => {
      // Only a genuine autoplay-policy rejection should force a mute - other
      // rejections (e.g. media not ready yet) aren't a sign sound is blocked
      // and forcing mute here would stick local state at muted=true even
      // after the user already unmuted elsewhere.
      if (!(err instanceof DOMException) || err.name !== "NotAllowedError") return;
      el.muted = true;
      setMuted(true);
      el.play().catch(() => {});
    });
  // Run once when video data arrives
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id]);

  // Professional watch time tracking - session ends when video changes or page unmounts
  useWatchTracker({
    videoId:  v?.id ?? 0,
    videoRef: videoRef,
    isActive: !!v && !own,
    duration: duration || v?.duration || 0,
  });

  /* Tab visibility - pause on hide, resume on show */
  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    let wasPlaying = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasPlaying = !el.paused && !el.ended;
        if (wasPlaying) el.pause();
      } else if (document.visibilityState === "visible") {
        if (wasPlaying) el.play().catch(() => {});
        wasPlaying = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  // Re-attach when video changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [v?.id]);

  async function toggleLike() {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    // Snapshot current state for rollback; optimistic update derives from the snapshot.
    const prevLiked = liked;
    const prevCt    = likeCt;
    setLiked(!prevLiked);
    setLikeCt(prevLiked ? prevCt - 1 : prevCt + 1);
    try {
      const res = await videoService.toggleLike(numId);
      // Reconcile to the authoritative server values (fixes rapid double-tap drift).
      setLiked(res.liked);
      setLikeCt(res.likes_count);
    } catch {
      setLiked(prevLiked);
      setLikeCt(prevCt);
    }
  }
  async function toggleSave() {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    const prevSaved = saved;
    const prevCt    = saveCt;
    setSaved(!prevSaved);
    setSaveCt(prevSaved ? prevCt - 1 : prevCt + 1);
    try {
      const res = await videoService.toggleSave(numId);
      setSaved(res.saved);
      setSaveCt(res.saves_count);
    } catch {
      setSaved(prevSaved);
      setSaveCt(prevCt);
    }
  }

  /* ── Video controls ── */
  function togglePlay() {
    const el = videoRef.current; if (!el) return;
    if (el.paused) { el.play(); setPlaying(true); }
    else           { el.pause(); setPlaying(false); }
  }
  function toggleMute() {
    const el = videoRef.current;
    const next = !muted;
    setMuted(next);
    if (el) el.muted = next;
    setMutedPref(next);
  }

  function changeVolume(val: number) {
    const el = videoRef.current;
    const clamped = Math.max(0, Math.min(1, val));
    setVolume(clamped);
    if (el) { el.volume = clamped; }
    setVolumePref(clamped);
    if (clamped === 0) { setMuted(true); if (el) el.muted = true; setMutedPref(true); }
    else if (muted)   { setMuted(false); if (el) el.muted = false; setMutedPref(false); }
  }

  /* Controls auto-hide: resets the 3-second timer on any mouse activity */
  function wakeControls() {
    setShowControls(true);
    if (controlsTimerRef.current) clearTimeout(controlsTimerRef.current);
    controlsTimerRef.current = setTimeout(() => setShowControls(false), 3000);
  }
  function showVol()  { if (volHideRef.current) clearTimeout(volHideRef.current); setShowVolSlider(true); }
  function hideVol()  { volHideRef.current = setTimeout(() => setShowVolSlider(false), 500); }

  function seek(e: React.MouseEvent<HTMLDivElement>) {
    const el = videoRef.current; if (!el || !duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    el.currentTime = ((e.clientX - rect.left) / rect.width) * duration;
  }

  /* ── Draggable progress bar ── */
  const seekToX = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const el  = videoRef.current;
    if (!bar || !el || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    el.currentTime = pct * duration;
    setCurrent(el.currentTime);
  }, [duration]);

  const onDetailProgressDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    const el = videoRef.current;
    if (el) { wasPlayingRef.current = !el.paused; el.pause(); }
    setDetailDragging(true);
    seekToX(e.clientX);
  }, [seekToX]);

  const onDetailProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    const el = videoRef.current;
    if (el) { wasPlayingRef.current = !el.paused; el.pause(); }
    setDetailDragging(true);
    seekToX(e.touches[0].clientX);
  }, [seekToX]);

  useEffect(() => {
    if (!detailDragging) return;
    const onMove = (e: MouseEvent) => { e.preventDefault(); seekToX(e.clientX); };
    const onUp   = () => {
      setDetailDragging(false);
      const el = videoRef.current;
      if (el && wasPlayingRef.current) el.play().catch(() => {});
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",  onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",  onUp);
    };
  }, [detailDragging, seekToX]);

  /* ── Copy link ── */
  function copyLink() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    navigator.clipboard.writeText(url).then(() => toast.success("Link copied!"));
  }

  /* ── Comments - handled by CommentSection component ── */

  /* ── Creator videos (for Creator Videos tab) ── */
  const creatorVideosQ = useQuery({
    queryKey: ["creator-videos", v?.user?.username],
    queryFn:  () => userService.videos(v!.user!.username, "latest"),
    enabled:  activeTab === "creator-videos" && !!v?.user?.username,
    staleTime: 60_000,
  });

  /* ── Delete reel ── */
  const [deleting, setDeleting] = useState(false);
  async function handleDelete() {
    setDeleting(true);
    try {
      await videoService.deleteVideo(numId);
      toast.success("Reel deleted.");
      setShowDelete(false);
      qc.invalidateQueries({ queryKey: ["profile-videos"] });
      router.back();
    } catch (e) {
      toast.error(apiMessage(e));
    } finally {
      setDeleting(false);
    }
  }

  /* ── Pin reel ── */
  async function togglePin() {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    try {
      if (isPinned) { await videoService.unpin(numId); setIsPinned(false); toast.success("Reel unpinned from your profile."); }
      else          { await videoService.pin(numId);   setIsPinned(true);  toast.success("Reel pinned to your profile."); }
    } catch (e) { toast.error(apiMessage(e)); }
  }

  /* ── Navigation helpers ── */

  /* Where to return when closing - derived from URL params (never relies on history stack) */
  const returnTo = searchParams.get("returnTo")
    ?? (((sourceParam === "profile" || sourceParam === "creator_videos") && fromUsername)
      ? `/profile/${fromUsername}`
      : "/");

  function handleCloseVideoDetail() {
    // Pause every playing media element on the page
    const el = videoRef.current;
    if (el) el.pause();
    document.querySelectorAll<HTMLMediaElement>("video, audio").forEach(m => { try { m.pause(); } catch {} });
    // Navigate directly to origin - never step back through stacked video pages
    router.push(returnTo);
  }

  function navigate(toId: number) {
    const params = new URLSearchParams();
    const ids = effectiveNavIds.length > 0 ? effectiveNavIds.join(",") : (idsParam ?? "");
    if (ids)          params.set("ids",    ids);
    if (fromUsername) params.set("u",      fromUsername);
    if (sourceParam)  params.set("source", sourceParam);
    // Carry returnTo so close always knows the origin page regardless of how many videos were navigated
    const rt = searchParams.get("returnTo");
    if (rt) params.set("returnTo", rt);
    // replace (not push) so video-to-video browsing never stacks history entries
    router.replace(`/videos/${toId}?${params.toString()}`);
  }

  /* ── Creator-video nav: clicking a creator video changes the viewer ── */
  function openCreatorVideo(videoId: number) {
    const params = new URLSearchParams();
    if (fromUsername) params.set("u", fromUsername);
    // Build ids from creator video list so arrows work within creator list
    const ids = (creatorVideosQ.data?.data ?? []).map((cv) => cv.id).join(",");
    if (ids) params.set("ids", ids);
    const rt = searchParams.get("returnTo");
    if (rt) params.set("returnTo", rt);
    // replace so this doesn't stack on top of the current video entry
    router.replace(`/videos/${videoId}?${params.toString()}`);
  }

  /* ── Keyboard shortcuts ── */
  /* Use capture phase (true) so Escape is caught before any bubble-phase
     handlers (FloatingMenu, browser scroll, etc.) can act on it first. */
  const closeRef   = useRef(handleCloseVideoDetail);
  const toggleRef  = useRef(togglePlay);
  const navigRef   = useRef(navigate);
  useEffect(() => { closeRef.current   = handleCloseVideoDetail; });
  useEffect(() => { toggleRef.current  = togglePlay; });
  useEffect(() => { navigRef.current   = navigate;  });

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key === " ")        { e.preventDefault(); toggleRef.current(); return; }
      if (e.key === "ArrowUp"   && prevIdRef.current) { navigRef.current(prevIdRef.current); return; }
      if (e.key === "ArrowDown" && nextIdRef.current) { navigRef.current(nextIdRef.current); return; }
    };
    window.addEventListener("keydown", h, true);   // capture = true
    return () => {
      window.removeEventListener("keydown", h, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);  // register once; latest handlers accessed via refs

  /* ── Mouse-wheel / touchpad navigation (left area only) ── */
  useEffect(() => {
    const el = leftAreaRef.current;
    if (!el) return;
    const THRESHOLD = 30;   // lower = more responsive on trackpads
    const LOCK_MS   = 500;
    const onWheel = (e: WheelEvent) => {
      if (rightPanelRef.current?.contains(e.target as Node)) return;
      if (detailDragging) return;
      e.preventDefault();
      wakeControls();
      if (Math.abs(e.deltaY) < THRESHOLD) return;
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      if (e.deltaY > 0) { if (nextIdRef.current) navigate(nextIdRef.current); }
      else              { if (prevIdRef.current) navigate(prevIdRef.current); }
      setTimeout(() => { wheelLockRef.current = false; }, LOCK_MS);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailDragging]);

  /* ── Loading / error ── */
  if (q.isLoading) {
    return (
      <div className="fixed inset-0 z-50 flex bg-black">
        <div className="flex flex-1 items-center justify-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-white" />
        </div>
      </div>
    );
  }
  if (q.isError || !v) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black">
        <div className="text-center text-white">
          <p className="text-lg font-bold">Video not found</p>
          <button onClick={handleCloseVideoDetail} className="mt-4 rounded-full bg-white/20 px-6 py-2 text-sm font-semibold hover:bg-white/30">Go back</button>
        </div>
      </div>
    );
  }

  const isVideo    = !v.media_type || v.media_type === "video";
  const isCarousel = v.media_type === "image_carousel";
  const isImage    = v.media_type === "image";

  // Resolve the media's real aspect ratio (stored → measured → portrait default)
  // and size the player to it, bounded by the viewport, so landscape/square
  // clips show wide/square instead of being letterboxed into a 9:16 box.
  const resolvedAr = (v.aspect_ratio && v.aspect_ratio > 0)
    ? v.aspect_ratio
    : (v.width && v.height)
      ? v.width / v.height
      : (mediaAr ?? 9 / 16);
  // Largest width that fits both the width and height bounds while keeping ratio.
  const playerWidth = `min(64vw, 1100px, calc(92vh * ${resolvedAr}), calc(900px * ${resolvedAr}))`;


  const carouselItems: string[] = isCarousel
    ? (v.media_items?.length ? v.media_items.map((m) => m.url) : [v.video_url])
    : [];
  const safeIdx = Math.min(carouselIdx, Math.max(0, carouselItems.length - 1));

  const videoUrl = typeof window !== "undefined" ? window.location.href : `https://teezer.live/video/${v.id}`;
  const hashtags = v.hashtags ?? [];

  /* ── Video area three-dot menu items ── */
  const QUALITY_LABEL: Record<string, string> = { auto: "Auto", "4k": "4K", "1080": "1080p", "720": "720p", "480": "480p", "360": "360p" };
  const videoMenuItems: MenuItemDef[] = [
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="6" width="20" height="12" rx="2"/>
          <path d="M8 12h2m1-2v4m3-4v4m-1-2h2"/>
        </svg>
      ),
      label: "Quality",
      value: QUALITY_LABEL[quality] ?? "Auto",
      onClick: () => { setVideoMenuOpen(false); setShowQualityMenu(true); },
    },
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="2" y="7" width="20" height="10" rx="2"/>
          <path d="M7 12h2m2 0h2m2 0h2" strokeLinecap="round"/>
        </svg>
      ),
      label: "Captions",
      toggle: false,
      checked: captionsEnabled,
      value: captionsEnabled ? "On" : undefined,
      onClick: () => {
        const next = !captionsEnabled;
        setCaptionsEnabled(next);
        toast.info(next ? "Captions on" : "Captions off");
        setVideoMenuOpen(false);
      },
    },
    {
      icon: (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 5v14M5 12l7-7 7 7" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
      label: "Auto scroll",
      toggle: true,
      checked: autoScroll,
      onClick: () => {
        setAutoScroll(!autoScroll);
        setVideoMenuOpen(false);
        toast.success(`Auto scroll ${!autoScroll ? "on" : "off"}`);
      },
    },
    {
      icon: <Flag className="h-4 w-4" />,
      label: "Report",
      danger: true,
      onClick: () => {
        setVideoMenuOpen(false);
        if (!isAuthenticated) { openAuthModal("login"); return; }
        setShowReport(true);
      },
    },
  ];

  /* ── Right panel menu items (owner vs viewer) ── */
  const ownerMenuItems: LightMenuItemDef[] = [
    {
      icon: <Lock className="h-4 w-4" />,
      label: "Privacy Settings",
      onClick: () => { setPostMenuOpen(false); setShowPrivacy(true); },
    },
    {
      icon: <Pin className="h-4 w-4" />,
      label: isPinned ? "Unpin Reel" : "Pin Reel",
      onClick: () => { setPostMenuOpen(false); togglePin(); },
    },
    {
      icon: <Trash2 className="h-4 w-4" />,
      label: "Delete Reel",
      danger: true,
      onClick: () => { setPostMenuOpen(false); setShowDelete(true); },
    },
  ];

  const viewerMenuItems: LightMenuItemDef[] = [
    {
      icon: <Copy className="h-4 w-4" />,
      label: "Copy Link",
      onClick: () => { setPostMenuOpen(false); copyLink(); },
    },
    {
      icon: <ThumbsDown className="h-4 w-4" />,
      label: "Not Interested",
      onClick: async () => {
        setPostMenuOpen(false);
        if (!isAuthenticated) { openAuthModal("login"); return; }
        try { await videoService.notInterested(numId); toast.success("We'll show fewer videos like this."); }
        catch (e) { toast.error(apiMessage(e)); }
      },
    },
    {
      icon: <Flag className="h-4 w-4" />,
      label: "Report",
      danger: true,
      onClick: () => {
        setPostMenuOpen(false);
        if (!isAuthenticated) { openAuthModal("login"); return; }
        setShowReport(true);
      },
    },
  ];

  return (
    <>
      {/* ── Modals ── */}
      <VideoSharePanel
        anchorRef={{ current: null }}
        videoId={numId}
        open={showSharePanel}
        onClose={() => setShowSharePanel(false)}
        onShareToStory={() => {
          if (!v) return;
          setStorySharedVideo({
            id:           v.id,
            mediaUrl:     v.video_url,
            thumbnailUrl: v.thumbnail_url ?? null,
            duration:     v.duration ?? null,
            size:         v.file_size ?? null,
            title:        v.title ?? null,
          });
          setShowStoryModal(true);
        }}
      />
      <CreateStoryModal
        open={showStoryModal}
        onClose={() => { setShowStoryModal(false); setStorySharedVideo(null); }}
        sharedVideo={storySharedVideo}
      />
      {showDelete && (
        <DeleteModal
          onCancel={() => setShowDelete(false)}
          onConfirm={handleDelete}
          loading={deleting}
        />
      )}
      {showReport && (
        <ReportModal
          entityType="video"
          entityId={numId}
          onClose={() => setShowReport(false)}
        />
      )}
      {showPrivacy && v && (
        <PrivacyModal
          video={v}
          onClose={() => setShowPrivacy(false)}
          onSaved={() => { setShowPrivacy(false); q.refetch(); }}
        />
      )}
      {showEmbed && v && (
        <EmbedModal
          videoId={v.id}
          onClose={() => setShowEmbed(false)}
        />
      )}

      {/* Close button - fixed z-[99999], highest element on the page */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handleCloseVideoDetail(); }}
        aria-label="Close video viewer"
        className="fixed top-4 left-4 flex h-11 w-11 items-center justify-center rounded-full text-white transition-all duration-150 hover:scale-105 active:scale-95"
        style={{
          zIndex: 99999,
          pointerEvents: "all",
          cursor: "pointer",
          background: "rgba(0,0,0,0.55)",
          border: "1px solid rgba(255,255,255,0.12)",
          backdropFilter: "blur(12px)",
          WebkitBackdropFilter: "blur(12px)",
        }}
      >
        <X className="h-5 w-5" />
      </button>

      {/* NOTE: no overflow-hidden on this container - dropdown menus must not be clipped */}
      <div className="fixed inset-0 z-50 flex bg-black">

        {/* ═══════════════════════════════════════════════════════════════
            LEFT - dark video area
        ════════════════════════════════════════════════════════════════ */}
        <div
          ref={leftAreaRef}
          className="relative flex flex-1 flex-col bg-[#0a0a0a]"
          onMouseMove={wakeControls}
          onTouchStart={(e) => {
            wakeControls();
            touchStartYRef.current = e.touches[0].clientY;
          }}
          onTouchEnd={(e) => {
            const startY = touchStartYRef.current;
            if (startY === null) return;
            const diff = startY - e.changedTouches[0].clientY;
            if (Math.abs(diff) > 50) {
              if (diff > 0 && nextIdRef.current) navigate(nextIdRef.current);
              else if (diff < 0 && prevIdRef.current) navigate(prevIdRef.current);
            }
            touchStartYRef.current = null;
          }}
        >

          {/* Top bar - three-dot only (X is a fixed element outside this DOM subtree) */}
          <div className="absolute right-0 top-0 z-30 flex items-center px-4 py-3">
            {/* Three-dot - video options menu.  z-50 to escape any stacking context */}
            <div className="relative z-50">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setVideoMenuOpen((o) => !o); }}
                aria-label="Open video options"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition active:scale-95 hover:bg-white/20"
              >
                <MoreHorizontal className="h-5 w-5" />
              </button>
              {videoMenuOpen && (
                <FloatingMenu items={videoMenuItems} onClose={() => setVideoMenuOpen(false)} />
              )}
              {showQualityMenu && v && (
                <QualityPanel
                  current={quality}
                  qualityUrls={v.quality_urls}
                  onSelect={(q) => {
                    const el = videoRef.current;
                    if (el) {
                      pendingQualitySeekRef.current = el.currentTime;
                      resumeAfterQualityRef.current = !el.paused;
                      el.pause();
                    }
                    setQuality(q as Parameters<typeof setQuality>[0]);
                    setShowQualityMenu(false);
                  }}
                  onClose={() => setShowQualityMenu(false)}
                />
              )}
            </div>
          </div>

          {/* Up / Down navigation - glass morphism, fixed right center */}
          <div className="absolute right-4 top-1/2 z-30 flex -translate-y-1/2 flex-col gap-3">
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (effectivePrevId) navigate(effectivePrevId); }}
              disabled={!effectivePrevId}
              aria-label="Previous video"
              style={{
                width: 46, height: 46,
                background: effectivePrevId ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
              }}
              className={cn(
                "grid place-items-center rounded-full text-white transition-all duration-150",
                effectivePrevId ? "hover:bg-white/20 active:scale-95 cursor-pointer" : "cursor-not-allowed opacity-30",
              )}
            >
              <ChevronUp className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); if (effectiveNextId) navigate(effectiveNextId); }}
              disabled={!effectiveNextId}
              aria-label="Next video"
              style={{
                width: 46, height: 46,
                background: effectiveNextId ? "rgba(255,255,255,0.10)" : "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.15)",
                backdropFilter: "blur(8px)",
              }}
              className={cn(
                "grid place-items-center rounded-full text-white transition-all duration-150",
                effectiveNextId ? "hover:bg-white/20 active:scale-95 cursor-pointer" : "cursor-not-allowed opacity-30",
              )}
            >
              <ChevronDown className="h-5 w-5" />
            </button>
          </div>

          {/* ── Media area ── */}
          <div className="flex flex-1 items-center justify-center">
            {isCarousel ? (
              /* Sized to the media's REAL ratio, same as the video branch
                 below - the old max-w-[45vh] cap forced every carousel into a
                 portrait box no matter its actual shape. */
              <div
                className="relative overflow-hidden rounded-2xl"
                style={{ width: playerWidth, aspectRatio: resolvedAr, flexShrink: 0 }}
              >
                {/* Horizontal slide track: navigating glides smoothly between photos. */}
                <div
                  className="flex h-full will-change-transform"
                  style={{
                    width: `${carouselItems.length * 100}%`,
                    transform: `translateX(-${safeIdx * (100 / carouselItems.length)}%)`,
                    transition: "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                >
                  {carouselItems.map((u, i) => (
                    <div key={i} className="h-full shrink-0" style={{ width: `${100 / carouselItems.length}%` }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={u}
                        alt={`${v.title ?? "Image"} ${i + 1}/${carouselItems.length}`}
                        className="h-full w-full object-contain" />
                    </div>
                  ))}
                </div>
                {safeIdx > 0 && (
                  <button onClick={() => setCarouselIdx((i) => i - 1)} aria-label="Previous"
                    className="absolute left-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                    <ChevronLeft className="h-5 w-5" />
                  </button>
                )}
                {safeIdx < carouselItems.length - 1 && (
                  <button onClick={() => setCarouselIdx((i) => i + 1)} aria-label="Next"
                    className="absolute right-2 top-1/2 -translate-y-1/2 grid h-9 w-9 place-items-center rounded-full bg-black/60 text-white hover:bg-black/80">
                    <ChevronRight className="h-5 w-5" />
                  </button>
                )}
                <span className="absolute right-2 top-2 flex items-center gap-1 rounded-full bg-black/60 px-2 py-0.5 text-[11px] font-semibold text-white">
                  <Images className="h-3 w-3" />{safeIdx + 1} / {carouselItems.length}
                </span>
                {carouselItems.length > 1 && (
                  <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 flex gap-1.5">
                    {carouselItems.map((_, i) => (
                      <button key={i} onClick={() => setCarouselIdx(i)}
                        className={cn("h-1.5 rounded-full transition-all", i === safeIdx ? "w-4 bg-white" : "w-1.5 bg-white/40")} />
                    ))}
                  </div>
                )}
              </div>
            ) : isImage ? (
              /* Same ratio-based sizing as the video/carousel branches, so a
                 landscape or square photo fills its natural shape instead of
                 being bounded by height alone. */
              <div
                className="relative overflow-hidden rounded-2xl"
                style={{ width: playerWidth, aspectRatio: resolvedAr, flexShrink: 0 }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={v.video_url} alt={v.title ?? v.caption ?? "Post"}
                  className="h-full w-full object-contain" />
              </div>
            ) : (
              /* ── Video - controls live INSIDE this container ── */
              <div
                className="relative rounded-2xl overflow-hidden bg-black"
                style={{
                  width: playerWidth,
                  aspectRatio: resolvedAr,
                  flexShrink: 0,
                }}
                onMouseMove={wakeControls}
              >
                {/* Top gradient - behind search bar, pointer-events:none so video clicks pass through */}
                <div
                  className="pointer-events-none absolute inset-x-0 top-0 z-10 h-40"
                  style={{ background: "linear-gradient(to bottom, rgba(0,0,0,0.5), transparent)" }}
                />

                {/* Search bar - overlaid inside video at top */}
                <div className="absolute inset-x-0 top-4 z-20 flex px-4" onClick={(e) => e.stopPropagation()}>
                  {searching ? (
                    <div
                      className="flex flex-1 items-center gap-2 rounded-full px-4"
                      style={{ height: 42, background: "transparent", border: "1px solid rgba(255,255,255,0.25)" }}
                    >
                      <Search className="h-4 w-4 flex-shrink-0 text-white/70" />
                      <input autoFocus value={searchQ} onChange={(e) => setSearchQ(e.target.value)}
                        onBlur={() => { if (!searchQ) setSearching(false); }}
                        placeholder="Find related content"
                        className="flex-1 bg-transparent text-sm text-white placeholder-white/50 outline-none" />
                      {searchQ && (
                        <button onClick={() => { setSearchQ(""); setSearching(false); }}
                          className="text-white/60 hover:text-white"><X className="h-3.5 w-3.5" /></button>
                      )}
                    </div>
                  ) : (
                    <button onClick={() => setSearching(true)}
                      className="flex flex-1 items-center gap-2 rounded-full px-4 text-sm text-white/80 transition"
                      style={{ height: 42, background: "transparent", border: "1px solid rgba(255,255,255,0.25)" }}>
                      <Search className="h-4 w-4" />
                      <span>Find related content</span>
                    </button>
                  )}
                </div>

                <video
                  ref={videoRef}
                  // src is wired imperatively by useHlsSource above (needs hls.js
                  // for .m3u8 on non-Safari browsers).
                  poster={v.thumbnail_url ?? undefined}
                  playsInline loop
                  className="h-full w-full object-contain"
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={() => {
                    const el = videoRef.current;
                    if (!el) return;
                    setCurrent(el.currentTime);
                  }}
                  onLoadedMetadata={() => {
                    const el = videoRef.current;
                    if (!el) return;
                    setVideoDur(el.duration ?? 0);
                    if (el.videoWidth && el.videoHeight) setMediaAr(el.videoWidth / el.videoHeight);
                    el.muted  = mutedPref;
                    el.volume = volumePref;
                    // Quality switch: restore position + resume if was playing
                    if (pendingQualitySeekRef.current > 0) {
                      const t = pendingQualitySeekRef.current;
                      pendingQualitySeekRef.current = 0;
                      if (isFinite(el.duration) && t < el.duration) el.currentTime = t;
                      if (resumeAfterQualityRef.current) {
                        resumeAfterQualityRef.current = false;
                        el.play().catch(() => {});
                      }
                      return;
                    }
                    // Normal first load
                    if (startTime > 0 && el.duration && startTime < el.duration) {
                      el.currentTime = startTime;
                    }
                    el.play().catch((err: unknown) => {
                      // Only force mute for a genuine autoplay-policy block,
                      // not for other rejection reasons (see the autoplay
                      // effect above for why).
                      if (!(err instanceof DOMException) || err.name !== "NotAllowedError") return;
                      el.muted = true;
                      setMuted(true);
                      el.play().catch(() => {});
                    });
                  }}
                  onClick={togglePlay}
                />

                {/* Pause icon when paused */}
                {!playing && (
                  <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                    aria-label="Play"
                    className="absolute inset-0 z-[5] flex items-center justify-center"
                  >
                    <span className="grid h-14 w-14 place-items-center rounded-full bg-black/50 backdrop-blur-sm">
                      <Play className="h-7 w-7 fill-white text-white" />
                    </span>
                  </button>
                )}


                {/* ── Video overlay controls - fade with mouse inactivity ── */}
                <div
                  className={cn(
                    "absolute inset-x-0 bottom-0 z-10 px-3 pb-3 pt-8 transition-all duration-300",
                    "bg-gradient-to-t from-black/80 via-black/30 to-transparent",
                    showControls ? "opacity-100" : "opacity-0 pointer-events-none",
                  )}
                >
                  {/* Seekable progress bar */}
                  <div
                    ref={progressRef}
                    role="slider"
                    aria-label="Video progress"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={duration ? Math.round((current / duration) * 100) : 0}
                    className="group relative mb-2 cursor-pointer py-2"
                    style={{ touchAction: "none" }}
                    onMouseDown={onDetailProgressDown}
                    onTouchStart={onDetailProgressTouchStart}
                    onTouchMove={(e) => { e.stopPropagation(); seekToX(e.touches[0].clientX); }}
                    onTouchEnd={(e) => {
                      e.stopPropagation();
                      setDetailDragging(false);
                      if (wasPlayingRef.current) videoRef.current?.play().catch(() => {});
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    {/* Scrub timecode - only while seeking forward/back */}
                    {detailDragging && (
                      <div
                        className="pointer-events-none absolute -top-6 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm"
                        style={{ left: duration ? `${(current / duration) * 100}%` : "0%" }}
                      >
                        {fmtTime(current)} / {fmtTime(duration)}
                      </div>
                    )}
                    <div className="relative h-[3px] w-full overflow-visible rounded-full bg-white/25 transition-all duration-100 group-hover:h-[5px]">
                      <div className="absolute inset-y-0 left-0 rounded-full bg-[#fd4605]"
                        style={{ width: duration ? `${(current / duration) * 100}%` : "0%" }} />
                      <div
                        className={cn(
                          "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white shadow-md transition-opacity",
                          detailDragging ? "opacity-100 scale-110" : "opacity-0 group-hover:opacity-100",
                        )}
                        style={{ left: duration ? `${(current / duration) * 100}%` : "0%" }}
                      />
                    </div>
                  </div>

                  {/* Controls row - play/pause + persistent timing removed;
                      the timecode appears only while scrubbing (see bar above). */}
                  <div className="flex items-center gap-2">
                    <div className="flex-1" />

                    {/* Location (only when the post carries a location) - left of
                        the volume button; popover opens upward. */}
                    {(v.location ?? "").trim() && (() => {
                      const locLabel = (v.location ?? "").trim();
                      const locParts = locLabel.split(",").map((s) => s.trim()).filter(Boolean);
                      const locTitle = locParts.length > 2 ? locParts.slice(0, 2).join(", ") : locLabel;
                      const locSub   = locParts.length > 2 ? locParts.slice(2).join(", ") : "";
                      return (
                        <div className="relative flex items-center">
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setLocOpen((o) => !o); }}
                            aria-label="Location"
                            aria-haspopup="dialog"
                            aria-expanded={locOpen}
                            className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                          >
                            <MapPin className="h-4 w-4" />
                          </button>
                          {locOpen && (
                            <>
                              <button
                                type="button"
                                aria-label="Close location"
                                onClick={(e) => { e.stopPropagation(); setLocOpen(false); }}
                                className="fixed inset-0 z-20 cursor-default bg-transparent"
                              />
                              {/* Popover ABOVE the button */}
                              <div
                                role="dialog"
                                aria-label="Location"
                                onClick={(e) => e.stopPropagation()}
                                className="absolute bottom-full right-0 z-30 mb-2 w-[236px] rounded-2xl bg-white"
                                style={{ color: "#111827", border: "1px solid rgba(0,0,0,0.08)", boxShadow: "0 12px 30px rgba(0,0,0,0.16)", padding: 12 }}
                              >
                                {/* Down arrow pointing at the pin */}
                                <span
                                  aria-hidden="true"
                                  className="absolute -bottom-[7px] right-[14px] h-3 w-3 rotate-45 bg-white"
                                  style={{ borderRight: "1px solid rgba(0,0,0,0.08)", borderBottom: "1px solid rgba(0,0,0,0.08)" }}
                                />
                                <div className="flex items-start gap-2 px-1 pb-2.5">
                                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f1f2f4]">
                                    <MapPin className="h-[15px] w-[15px] text-[#111827]" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className={cn("font-semibold leading-snug text-[#111827] break-words", locTitle.length > 24 ? "text-[12.5px]" : "text-[14px]")}>{locTitle}</p>
                                    {locSub && <p className="break-words text-[12px] leading-snug text-[#6b7280]">{locSub}</p>}
                                  </div>
                                </div>
                                <div className="-mx-3 border-t border-[#eeeeee]" />
                                <div className="pt-1">
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setLocOpen(false); router.push(`/location/${locationSlug(locLabel)}`); }}
                                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition hover:bg-[#f7f7f8]"
                                  >
                                    <Sparkles className="h-[18px] w-[18px] shrink-0 text-[#374151]" />
                                    <span className="flex-1 truncate text-[13.5px] font-semibold text-[#111827]">View location feed</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa1ad]" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setLocOpen(false); window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locLabel)}`, "_blank", "noopener,noreferrer"); }}
                                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition hover:bg-[#f7f7f8]"
                                  >
                                    <ExternalLink className="h-[18px] w-[18px] shrink-0 text-[#374151]" />
                                    <span className="flex-1 truncate text-[13.5px] font-semibold text-[#111827]">Open map</span>
                                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa1ad]" />
                                  </button>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      );
                    })()}

                    {/* Volume button + vertical popup above */}
                    <div
                      className="relative flex items-center gap-1.5"
                      onMouseEnter={showVol}
                      onMouseLeave={hideVol}
                    >
                      {showVolSlider && (
                        <div
                          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 flex flex-col items-center justify-end backdrop-blur-md"
                          style={{
                            background: "rgba(0,0,0,0.78)",
                            border: "1px solid rgba(255,255,255,0.15)",
                            borderRadius: 14,
                            padding: "10px 8px",
                            width: 42,
                            height: 130,
                            gap: 6,
                          }}
                          onMouseEnter={showVol}
                          onMouseLeave={hideVol}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[9px] font-bold text-white/80 tabular-nums leading-none">
                            {muted ? "0" : Math.round(volume * 100)}
                          </span>
                          <div style={{ position: "relative", width: 20, height: 80, display: "flex", alignItems: "center", justifyContent: "center" }}>
                            <input
                              type="range" min={0} max={1} step={0.02}
                              value={muted ? 0 : volume}
                              aria-label="Volume"
                              onChange={(e) => { e.stopPropagation(); changeVolume(Number(e.target.value)); }}
                              onClick={(e) => e.stopPropagation()}
                              onMouseDown={(e) => e.stopPropagation()}
                              className="absolute cursor-pointer accent-[#fd4605]"
                              style={{ width: 80, height: 4, left: "50%", top: "50%", transform: "translate(-50%, -50%) rotate(-90deg)" }}
                            />
                          </div>
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                        aria-label={muted ? "Unmute video" : "Mute video"}
                        className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                      >
                        {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                      </button>
                    </div>

                    {/* Native fullscreen */}
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); videoRef.current?.requestFullscreen(); }}
                      aria-label="Fullscreen"
                      className="grid h-8 w-8 place-items-center rounded-full bg-white/15 text-white transition hover:bg-white/25"
                    >
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round"
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════
            RIGHT - white details + comments panel
        ════════════════════════════════════════════════════════════════ */}
        <div ref={rightPanelRef} className="flex w-[380px] flex-shrink-0 flex-col overflow-hidden bg-white">

          {/* ── Creator info ── */}
          <div className="border-b border-[#f0f0f0] px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <Link href={`/profile/${v.user?.username ?? ""}`} className="flex items-center gap-3 min-w-0">
                <Avatar src={v.user?.avatar} name={v.user?.name} size={42} />
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="text-sm font-bold text-[#111827] truncate">{v.user?.name}</p>
                    {v.user?.is_verified && <VerifiedBadge size={14} />}
                  </div>
                  <p className="text-xs text-[#6b7280]">@{v.user?.username}</p>
                  {v.created_at && (
                    <p className="text-[11px] text-[#9ca3af] mt-0.5">{fmtRelative(v.created_at)}</p>
                  )}
                </div>
              </Link>

              {/* Right-panel three-dot - owner vs viewer menu */}
              <div className="relative flex-shrink-0">
                <button
                  onClick={(e) => { e.stopPropagation(); setPostMenuOpen((o) => !o); }}
                  className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f8f9fb] transition">
                  <MoreHorizontal className="h-4 w-4" />
                </button>
                {postMenuOpen && (
                  <LightMenu
                    items={own ? ownerMenuItems : viewerMenuItems}
                    onClose={() => setPostMenuOpen(false)}
                  />
                )}
              </div>
            </div>

            {/* Caption */}
            {(v.caption || v.title) && (
              <p className="mt-3 text-sm leading-relaxed text-[#111827] whitespace-pre-line">
                {v.caption || v.title}
              </p>
            )}
            <LinkPreviewFromText text={v.caption || v.title} className="mt-3" />

            {/* Hashtags */}
            {hashtags.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {hashtags.map((h) => (
                  <Link key={h} href={`/explore?q=${h}`}
                    className="text-xs font-semibold text-[#fd4605] hover:underline">
                    #{h}
                  </Link>
                ))}
              </div>
            )}

            {/* Content-attached link/product bar - below the caption and its
                hashtags, only when this post has an external link or featured
                Shop products. Same shared component/data as the Feed player's
                overlay - see ContentLinkBar's own comment. */}
            <div className="mt-3">
              <ContentLinkBar video={v} variant="panel" />
            </div>

            {/*
              "Learn more" - Wikipedia context for videos about a real subject.

              Keyed on the FIRST hashtag rather than the caption. A caption is
              free prose ("finally made it!! 🏔️") and would never resolve to an
              article, whereas a hashtag is already the creator's own one-word
              label for the subject. Only the first is used so a video can
              never cost more than one lookup no matter how many tags it
              carries - and the backend's entity gate throws out the junk ones
              (#fyp, #viral, #trending) without any network call at all.

              Collapsed by default and rendered as a single quiet line, so it
              cannot push the video around or interrupt scrolling.
            */}
            {hashtags.length > 0 && (
              <KnowledgeCard query={hashtags[0]} variant="inline" className="mt-3" />
            )}

            {/* Sound */}
            {v.audio && (
              <p className="mt-2 flex items-center gap-1.5 text-xs text-[#6b7280]">
                <svg className="h-3 w-3" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2z" />
                </svg>
                Original sound - {v.audio.title}
              </p>
            )}
          </div>

          {/* ── Stats row ── */}
          <div className="grid grid-cols-4 divide-x divide-[#f0f0f0] border-b border-[#f0f0f0] px-2 py-2">
            {(() => {
              const views   = v.views_count    ?? 0;
              const likes   = v.likes_count    ?? 0;
              const comments= v.comments_count ?? 0;
              const shares  = v.shares_count   ?? 0;
              const saves   = v.saves_count    ?? 0;

              // Engagement: (likes+comments+shares+saves) / views × 100
              const engRate = v.engagement_rate != null
                ? v.engagement_rate
                : views > 0 ? Math.round((likes + comments + shares + saves) / views * 100 * 10) / 10 : 0;

              // Watch time: use real seconds from API, or estimate from duration × views
              const watchSec = v.watch_time_seconds != null
                ? v.watch_time_seconds
                : Math.round((v.duration ?? 0) * views);
              const watchDisplay = watchSec >= 3600
                ? `${(watchSec / 3600).toFixed(1).replace(/\.0$/, "")}h`
                : watchSec >= 60
                  ? `${Math.round(watchSec / 60)}m`
                  : `${watchSec}s`;

              return [
                { label: "Views",      display: formatCompact(views)  },
                { label: "Shares",     display: formatCompact(shares) },
                { label: "Engagement", display: `${engRate}%`         },
                { label: "Watch time", display: watchDisplay          },
              ].map((s) => (
                <div key={s.label} className="flex flex-col items-center gap-0.5 px-2 py-1">
                  <span className="text-sm font-black text-[#111827]">{s.display}</span>
                  <span className="text-[10px] text-[#9ca3af]">{s.label}</span>
                </div>
              ));
            })()}
          </div>

          {/* ── Action buttons ── */}
          <div className="flex items-center border-b border-[#f0f0f0] px-3 py-2 gap-1">
            <ActionBtn icon={<AnimatedHeart size={16} filled={liked} className={cn("h-4 w-4", liked && "fill-[#fd4605] text-[#fd4605]")} />}
              count={likeCt} active={liked} onClick={toggleLike} label="Like" />
            <ActionBtn icon={<MessageCircle className="h-4 w-4" />}
              count={commentCt}
              onClick={() => setActiveTab("comments")}
              label="Comment" />
            <ActionBtn icon={<AnimatedBookmark size={16} filled={saved} className={cn("h-4 w-4", saved && "fill-[#111827]")} />}
              count={saveCt} active={saved} onClick={toggleSave} label="Save" />
            <ActionBtn icon={<Code2 className="h-4 w-4" />} label="Embed" onClick={() => setShowEmbed(true)} />
            <ActionBtn icon={<Share2 className="h-4 w-4" />} label="Share" onClick={() => setShowSharePanel(true)} />
          </div>

          {/* ── Copy link ── */}
          <div className="flex items-center gap-2 border-b border-[#f0f0f0] px-3 py-2">
            <svg className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71" />
              <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71" />
            </svg>
            <span className="flex-1 truncate text-[11px] text-[#6b7280]">{videoUrl}</span>
            <button onClick={copyLink}
              className="flex items-center gap-1 rounded-[8px] bg-[#fd4605] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-[#e03e04] transition">
              <Copy className="h-3 w-3" /> Copy link
            </button>
          </div>

          {/* ── Tabs: Comments | Creator Videos ── */}
          <div className="flex border-b border-[#f0f0f0]">
            <button
              onClick={() => setActiveTab("comments")}
              className={cn(
                "flex-1 px-4 py-2 text-center text-xs font-bold transition",
                activeTab === "comments"
                  ? "border-b-2 border-[#fd4605] text-[#111827]"
                  : "text-[#6b7280] hover:text-[#111827]",
              )}>
              Comments ({formatCompact(commentCt)})
            </button>
            <button
              onClick={() => setActiveTab("creator-videos")}
              className={cn(
                "flex-1 px-4 py-2 text-center text-xs font-bold transition",
                activeTab === "creator-videos"
                  ? "border-b-2 border-[#fd4605] text-[#111827]"
                  : "text-[#6b7280] hover:text-[#111827]",
              )}>
              Creator Videos
            </button>
          </div>

          {/* ── Tab content ── */}
          {activeTab === "comments" ? (
            <CommentSection
              videoId={numId}
              videoOwnerId={v?.user?.id}
              allowComments={v?.allow_comments ?? true}
              onVisibleCountLoaded={(count) => setCommentCt(count)}
              onCommentCountChange={(delta) => setCommentCt((p) => Math.max(0, p + delta))}
              className="flex-1 min-h-0"
            />
          ) : (
            /* Creator Videos tab - loaded inside panel, no redirect */
            <div className="flex-1 overflow-y-auto px-3 py-2">
              {creatorVideosQ.isLoading && (
                <div className="flex justify-center py-6">
                  <div className="h-5 w-5 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
                </div>
              )}
              {!creatorVideosQ.isLoading && (!creatorVideosQ.data?.data?.length) && (
                <p className="py-6 text-center text-xs text-[#9ca3af]">No more videos from this creator.</p>
              )}
              <div className="grid grid-cols-2 gap-2">
                {creatorVideosQ.data?.data?.map((cv) => {
                  const isCurrentVideo = cv.id === numId;
                  // Never use a raw video URL as an <img> source (it renders black).
                  // Images use their own URL / first carousel item; videos rely on
                  // the stored cover, falling back to the gradient placeholder.
                  const cvIsImage = cv.media_type === "image" || cv.media_type === "image_carousel";
                  const thumbUrl =
                    cv.thumbnail_url ??
                    (cvIsImage ? (cv.video_url ?? cv.media_items?.[0]?.url ?? null) : null);
                  const dur = cv.duration
                    ? `${Math.floor(cv.duration / 60)}:${String(Math.floor(cv.duration % 60)).padStart(2, "0")}`
                    : null;
                  return (
                    <button
                      key={cv.id}
                      type="button"
                      onClick={() => openCreatorVideo(cv.id)}
                      className={cn(
                        "relative aspect-[9/14] overflow-hidden rounded-xl bg-[#111] text-left transition hover:opacity-90",
                        isCurrentVideo && "ring-2 ring-[#fd4605]",
                      )}>
                      {thumbUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={thumbUrl} alt={cv.title ?? cv.caption ?? "Video"}
                          className="h-full w-full object-cover" loading="lazy" />
                      ) : !cvIsImage && cv.video_url ? (
                        /* Cover not ready yet → show the video's own first frame. */
                        <video src={`${cv.video_url}#t=0.1`}
                          className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      ) : (
                        <div className="h-full w-full bg-gradient-to-br from-[#fd4605]/40 to-[#111]" />
                      )}
                      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70" />
                      {dur && (
                        <span className="absolute right-1.5 top-1.5 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-white">
                          {dur}
                        </span>
                      )}
                      {isCurrentVideo && (
                        <span className="absolute left-1.5 top-1.5 rounded-full bg-[#fd4605] px-2 py-0.5 text-[9px] font-bold text-white">
                          Playing
                        </span>
                      )}
                      <div className="absolute inset-x-0 bottom-0 px-2 pb-2">
                        <p className="line-clamp-2 text-[10px] leading-snug text-white/90">
                          {cv.caption || cv.title || ""}
                        </p>
                        <p className="mt-0.5 text-[9px] text-white/60">
                          {formatCompact(cv.views_count ?? 0)} views
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

/* ── Action button ─────────────────────────────────────────────────────── */
function ActionBtn({
  icon, count, active, onClick, label,
}: { icon: React.ReactNode; count?: number; active?: boolean; onClick?: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label}
      className={cn("flex flex-1 flex-col items-center gap-0.5 rounded-xl py-2 text-[10px] font-semibold transition hover:bg-[#f8f9fb]",
        active ? "text-[#fd4605]" : "text-[#6b7280]")}>
      {icon}
      {count !== undefined && count > 0 && <span>{formatCompact(count)}</span>}
    </button>
  );
}
