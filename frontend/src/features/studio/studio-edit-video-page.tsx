"use client";

import {
  useEffect, useLayoutEffect, useRef, useState,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, AtSign, Bell, BookOpen, Briefcase, Calendar, CalendarDays, Camera,
  Car, Check, ChefHat, ChevronDown, Clapperboard, Clock, Download,
  Dumbbell, FileText, Flame, Gamepad2, Globe, GraduationCap, Hammer,
  Hash, Heart, HeartHandshake, HeartPulse, HelpCircle, Home, Leaf,
  Loader2, Lock, MapPin, MessageCircle, Monitor, Music, Newspaper, Palette,
  Pause, PawPrint, Plane, Play, Plus, Save, Scissors, Search, Shirt, Smile,
  Sparkles, Sun, ThumbsUp, Trees, Trophy, Upload, Users, Utensils,
  Video, Volume2, VolumeX, X, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { api } from "@/services/api";
import { locationService, type LocationResult } from "@/services/location.service";
import { searchService, type SearchUser } from "@/services/search.service";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import { useHlsSource } from "@/hooks/use-hls-source";
import type { ReelsooVideo, TaggedUser } from "@/types/video";

/* ── Tag People field ─────────────────────────────────────────────────────── */
function TagPeopleField({
  value, onChange,
}: {
  value: TaggedUser[];
  onChange: (next: TaggedUser[]) => void;
}) {
  const [draft,   setDraft]   = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);
  const [dropUp,  setDropUp]  = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = draft.replace(/^@+/, "").trim();

  useEffect(() => {
    if (query.length < 2) { setResults([]); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchService.search(query, "users");
        if (!cancelled) setResults(res.users ?? []);
      } catch {
        if (!cancelled) { setError("Couldn't load users. Try again."); setResults([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function openDropdown() {
    const el = wrapRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 280 && rect.top > spaceBelow);
    }
    setOpen(true);
  }

  function pick(u: SearchUser) {
    if (value.some(t => t.id === u.id)) { setDraft(""); setResults([]); setOpen(false); return; }
    if (value.length >= 20) return;
    onChange([...value, {
      id: u.id, username: u.username,
      display_name: u.name, avatar_url: u.avatar, verified: u.verified,
    }]);
    setDraft(""); setResults([]); setOpen(false);
  }

  function remove(id: number) { onChange(value.filter(t => t.id !== id)); }

  const atLimit = value.length >= 20;

  return (
    <div ref={wrapRef}
      className="relative flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-[#e5e7eb] px-2.5 py-2 pr-9 transition focus-within:border-[#fd4605]">
      {value.map(u => (
        <span key={u.id}
          className="inline-flex items-center gap-0.5 rounded-full border border-[#fecdd3] bg-[#fff3ec] px-2.5 py-0.5 text-[12px] font-medium text-[#fd4605]">
          @{u.username}
          <button type="button" onClick={() => remove(u.id)}
            className="ml-0.5 grid h-3.5 w-3.5 place-items-center text-[#fd4605]/60 hover:text-[#fd4605]">
            <X className="h-2.5 w-2.5" />
          </button>
        </span>
      ))}
      <input
        type="text"
        value={draft}
        onChange={e => { setDraft(e.target.value); openDropdown(); }}
        onFocus={() => draft.trim() && openDropdown()}
        disabled={atLimit}
        placeholder={value.length ? "" : "@ Search and tag people…"}
        className="min-w-[120px] flex-1 bg-transparent py-0.5 text-[13px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
      />
      <AtSign className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />

      {open && draft.trim().length > 0 && (
        <div className={cn(
          "absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-xl",
          dropUp ? "bottom-full mb-1" : "top-full mt-1",
        )}>
          <div className="max-h-[240px] overflow-y-auto py-1">
            {query.length < 2 ? (
              <div className="px-3 py-2.5 text-[12px] text-[#9aa1ad]">Type at least 2 characters to search…</div>
            ) : loading ? (
              <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-[#6b7280]">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
              </div>
            ) : error ? (
              <div className="px-3 py-2.5 text-[12px] text-[#dc2626]">{error}</div>
            ) : results.length === 0 ? (
              <div className="px-3 py-2.5 text-[12px] text-[#9aa1ad]">No users found</div>
            ) : (
              results.map(u => {
                const picked = value.some(t => t.id === u.id);
                return (
                  <button key={u.id} type="button" disabled={picked || atLimit}
                    onClick={() => pick(u)}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-left transition",
                      picked || atLimit ? "cursor-default opacity-50" : "cursor-pointer hover:bg-[#f8f9fb]",
                    )}>
                    <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#f3f4f6]">
                      {u.avatar
                        ? <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                        : <span className="grid h-full w-full place-items-center text-[13px] font-bold text-[#9ca3af]">
                            {(u.name || u.username)[0].toUpperCase()}
                          </span>}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1">
                        <span className="truncate text-[12px] font-semibold text-[#111827]">{u.name || u.username}</span>
                      </span>
                      <span className="block truncate text-[11px] text-[#9aa1ad]">@{u.username}</span>
                    </span>
                    {picked
                      ? <Check className="h-4 w-4 shrink-0 text-[#22c55e]" />
                      : <Plus  className="h-4 w-4 shrink-0 text-[#c0c4cc]" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Constants ────────────────────────────────────────────────────────────── */
const CATEGORIES = [
  "Comedy","Dance","Music","Travel & Nature","Food","Fashion","Beauty",
  "Lifestyle","Fitness","Sports","Gaming","Education","Technology","Business",
  "Motivation","News","Entertainment","Vlog","Art","Photography",
  "Animals & Pets","Nature","Cars & Bikes","Health","DIY & Crafts",
  "Family","Relationships","Cooking","Reviews","Tutorials",
  "Religious / Spiritual","Other",
];

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  "Comedy":               Smile,
  "Dance":                Zap,
  "Music":                Music,
  "Travel & Nature":      Plane,
  "Travel":               Plane,
  "Food":                 Utensils,
  "Fashion":              Shirt,
  "Beauty":               Sparkles,
  "Lifestyle":            Leaf,
  "Fitness":              Dumbbell,
  "Sports":               Trophy,
  "Gaming":               Gamepad2,
  "Education":            GraduationCap,
  "Technology":           Monitor,
  "Business":             Briefcase,
  "Motivation":           Flame,
  "News":                 Newspaper,
  "Entertainment":        Clapperboard,
  "Vlog":                 Video,
  "Art":                  Palette,
  "Photography":          Camera,
  "Animals & Pets":       PawPrint,
  "Nature":               Trees,
  "Cars & Bikes":         Car,
  "Health":               HeartPulse,
  "DIY & Crafts":         Hammer,
  "Family":               Home,
  "Relationships":        HeartHandshake,
  "Cooking":              ChefHat,
  "Reviews":              ThumbsUp,
  "Tutorials":            BookOpen,
  "Religious / Spiritual":Sun,
  "Other":                HelpCircle,
};

const LANGUAGES = [
  { code:"en",    label:"English"    },
  { code:"ne",    label:"Nepali"     },
  { code:"hi",    label:"Hindi"      },
  { code:"es",    label:"Spanish"    },
  { code:"fr",    label:"French"     },
  { code:"de",    label:"German"     },
  { code:"ja",    label:"Japanese"   },
  { code:"ko",    label:"Korean"     },
  { code:"zh",    label:"Chinese"    },
  { code:"ar",    label:"Arabic"     },
  { code:"pt",    label:"Portuguese" },
  { code:"ru",    label:"Russian"    },
  { code:"other", label:"Other"      },
];

const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => {
  const h    = Math.floor(i / 2);
  const m    = i % 2 === 0 ? "00" : "30";
  const ampm = h < 12 ? "AM" : "PM";
  const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, "0")}:${m} ${ampm}`;
});

/* ── Types ─────────────────────────────────────────────────────────────────── */
type VisibilityStatus = "published" | "private" | "draft" | "scheduled";

interface FormState {
  title:          string;
  caption:        string;
  category:       string;
  location:       string;
  language:       string;
  hashtags:       string[];
  status:         VisibilityStatus;
  allow_comments:  boolean;
  allow_duet:      boolean;
  allow_stitch:    boolean;
  allow_download:  boolean;
  is_ai_generated: boolean;
  scheduled:       boolean;
  scheduleDate:   string;
  scheduleTime:   string;
}

/* ── Portal select dropdown ────────────────────────────────────────────────── */
function PortalDropdown({
  trigger, options, value, onChange, searchable = false,
}: {
  trigger: React.ReactNode;
  options: { value: string; label: string; icon?: React.ElementType }[];
  value: string;
  onChange: (v: string) => void;
  searchable?: boolean;
}) {
  const [open, setOpen]   = useState(false);
  const [q,    setQ]      = useState("");
  const trigRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState({ top: 0, left: 0, width: 0 });

  useLayoutEffect(() => {
    if (!open) return;
    const r = trigRef.current?.getBoundingClientRect();
    if (r) setCoords({ top: r.bottom + 4, left: r.left, width: r.width });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) &&
          !trigRef.current?.contains(e.target as Node)) {
        setOpen(false); setQ("");
      }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q.toLowerCase()))
    : options;

  return (
    <div ref={trigRef} className="cursor-pointer" onClick={() => setOpen(o => !o)}>
      {trigger}
      {open && typeof document !== "undefined" && createPortal(
        <div ref={menuRef}
          style={{
            position: "fixed", top: coords.top, left: coords.left,
            width: Math.max(coords.width, 200), zIndex: 9999,
          }}
          className="overflow-hidden rounded-xl border border-[#e5e7eb] bg-white shadow-xl">
          {searchable && (
            <div className="border-b border-[#f0f0f0] px-3 py-2">
              <input autoFocus value={q} onChange={e => setQ(e.target.value)}
                placeholder="Search…" onClick={e => e.stopPropagation()}
                className="w-full bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af]" />
            </div>
          )}
          <div className="max-h-[240px] overflow-y-auto py-1">
            {filtered.length === 0 && (
              <p className="px-4 py-2.5 text-[12px] text-[#9ca3af]">No results</p>
            )}
            {filtered.map(opt => {
              const Icon = opt.icon;
              const active = opt.value === value;
              return (
                <button key={opt.value} type="button"
                  onClick={e => { e.stopPropagation(); onChange(opt.value); setOpen(false); setQ(""); }}
                  className={cn(
                    "flex w-full items-center gap-2 px-4 py-2 text-[13px] transition hover:bg-[#f8f9fb]",
                    active ? "bg-[#fff3ec] font-semibold text-[#fd4605]" : "text-[#374151]",
                  )}>
                  {active
                    ? <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#fd4605]" />
                    : Icon
                      ? <Icon className="h-3.5 w-3.5 flex-shrink-0 text-[#6b7280]" />
                      : <span className="w-3.5 flex-shrink-0" />}
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

/* ── Video preview player with custom controls ─────────────────────────────── */
const PREVIEW_W = 260;                          // px - portrait 9:16
const PREVIEW_H = Math.round(PREVIEW_W * 16 / 9); // ≈ 462 px

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function VideoPreviewPlayer({
  src, fallbackSrc, poster, duration,
}: { src?: string | null; fallbackSrc?: string | null; poster?: string | null; duration?: number | null }) {
  const videoRef     = useRef<HTMLVideoElement>(null);
  const progressRef  = useRef<HTMLDivElement>(null);
  const seekingRef   = useRef(false);

  const [playing,  setPlaying]  = useState(false);
  const [muted,    setMuted]    = useState(true);
  const [curTime,  setCurTime]  = useState(0);
  const [vidDur,   setVidDur]   = useState(0);
  const [volume,   setVolume]   = useState(1);
  const [volOpen,  setVolOpen]  = useState(false);

  const pct = vidDur > 0 ? (curTime / vidDur) * 100 : 0;

  useHlsSource(videoRef, src, fallbackSrc);

  function togglePlay(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { void v.play(); } else { v.pause(); }
  }

  function toggleMute(e: React.MouseEvent) {
    e.stopPropagation();
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
    setMuted(v.muted);
  }

  function changeVolume(val: number) {
    const v = videoRef.current;
    if (!v) return;
    v.volume  = val;
    v.muted   = val === 0;
    setVolume(val);
    setMuted(val === 0);
  }

  function seekTo(clientX: number) {
    const bar = progressRef.current;
    const v   = videoRef.current;
    if (!bar || !v || !vidDur) return;
    const { left, width } = bar.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (clientX - left) / width)) * vidDur;
    setCurTime(v.currentTime);
  }

  return (
    /* Fixed-pixel container - overflow:hidden keeps video inside */
    <div
      className="relative mx-auto flex-shrink-0 overflow-hidden rounded-2xl bg-black"
      style={{ width: PREVIEW_W, height: PREVIEW_H }}
      onClick={togglePlay}
    >
      {/* Media */}
      {src ? (
        /* eslint-disable-next-line jsx-a11y/media-has-caption */
        <video
          ref={videoRef}
          // src is wired imperatively by useHlsSource above (needs hls.js for
          // .m3u8 on non-Safari browsers).
          poster={poster ?? undefined}
          muted
          playsInline
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onTimeUpdate={() => setCurTime(videoRef.current?.currentTime ?? 0)}
          onLoadedMetadata={() => {
            const v = videoRef.current;
            if (v) { setVidDur(v.duration); v.volume = volume; }
          }}
        />
      ) : poster ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={poster} alt=""
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <Video className="h-10 w-10 text-white/20" />
        </div>
      )}

      {/* Center play / pause indicator */}
      {src && !playing && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-white/25 backdrop-blur-sm">
            <Play className="ml-0.5 h-5 w-5 fill-white text-white" />
          </div>
        </div>
      )}

      {/* Duration badge - bottom-left above controls */}
      {(duration || vidDur > 0) && (
        <span className="pointer-events-none absolute left-2 z-10 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white"
          style={{ bottom: 52 }}>
          {fmtTime(duration ?? vidDur)}
        </span>
      )}

      {/* Bottom control bar */}
      {src && (
        <div
          className="absolute bottom-0 left-0 right-0 z-10 px-2.5 pb-2.5 pt-10"
          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.75) 0%, transparent 100%)" }}
          onClick={e => e.stopPropagation()}
        >
          {/* Seekable progress bar */}
          <div
            ref={progressRef}
            className="group mb-2 flex h-4 cursor-pointer items-center"
            onClick={e => { e.stopPropagation(); seekTo(e.clientX); }}
            onMouseDown={e => { seekingRef.current = true; seekTo(e.clientX); }}
            onMouseMove={e => { if (seekingRef.current) seekTo(e.clientX); }}
            onMouseUp={() => { seekingRef.current = false; }}
            onMouseLeave={() => { seekingRef.current = false; }}
            onTouchStart={e => { seekingRef.current = true; seekTo(e.touches[0].clientX); }}
            onTouchMove={e => { seekTo(e.touches[0].clientX); }}
            onTouchEnd={() => { seekingRef.current = false; }}
          >
            <div className="relative h-[3px] w-full overflow-visible rounded-full bg-white/30 transition-all duration-100 group-hover:h-1">
              <div className="h-full rounded-full bg-[#fd4605]" style={{ width: `${pct}%` }} />
              <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                style={{ left: `${pct}%` }} />
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-2">
            {/* Play / Pause */}
            <button type="button" onClick={togglePlay}
              className="grid h-6 w-6 flex-shrink-0 place-items-center text-white transition hover:text-white/80">
              {playing
                ? <Pause className="h-3.5 w-3.5 fill-white text-white" />
                : <Play  className="ml-px h-3.5 w-3.5 fill-white text-white" />}
            </button>

            {/* Time */}
            <span className="flex-1 font-mono text-[9px] text-white/80">
              {fmtTime(curTime)} / {fmtTime(vidDur || (duration ?? 0))}
            </span>

            {/* Volume + mute */}
            <div className="relative flex items-center gap-1">
              {/* Volume slider (visible on hover of button area) */}
              {volOpen && (
                <div
                  className="absolute bottom-full right-0 mb-2 flex h-[80px] w-5 flex-col items-center justify-center overflow-hidden rounded-lg bg-black/80 py-2"
                  onClick={e => e.stopPropagation()}
                >
                  <input
                    type="range" min={0} max={1} step={0.05}
                    value={muted ? 0 : volume}
                    onChange={e => changeVolume(parseFloat(e.target.value))}
                    style={{ writingMode: "vertical-lr", direction: "rtl", width: 4, height: 64, accentColor: "#fd4605", cursor: "pointer" }}
                  />
                </div>
              )}
              <button type="button"
                onClick={e => { e.stopPropagation(); setVolOpen(o => !o); }}
                onMouseEnter={() => setVolOpen(true)}
                className="grid h-6 w-6 flex-shrink-0 place-items-center text-white transition hover:text-white/80">
                {muted || volume === 0
                  ? <VolumeX className="h-3.5 w-3.5" />
                  : <Volume2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Toggle switch ─────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors",
        checked ? "bg-[#fd4605]" : "bg-[#d1d5db]",
        disabled && "cursor-not-allowed opacity-50",
      )}>
      <span className={cn(
        "inline-block h-[20px] w-[20px] rounded-full bg-white shadow-sm transition-transform",
        checked ? "translate-x-[22px]" : "translate-x-[2px]",
      )} />
    </button>
  );
}

/* ── Helpers ───────────────────────────────────────────────────────────────── */
function fmtDuration(s?: number | null) {
  if (!s) return "-";
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}
function fmtPublishDate(iso?: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short", day: "numeric", year: "numeric",
  }) + " " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

/* ══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export function StudioEditVideoPage({ videoId }: { videoId: number }) {
  const router = useRouter();
  const qc     = useQueryClient();
  const { user, isAuthenticated, authReady } = useAuthStore();
  const [collapsed, setCollapsed] = useState(false);

  /* ── Form state ── */
  const [form, setForm] = useState<FormState>({
    title: "", caption: "", category: "", location: "", language: "en",
    hashtags: [], status: "published",
    allow_comments: true, allow_duet: true, allow_stitch: true, allow_download: false,
    is_ai_generated: false,
    scheduled: false,
    scheduleDate: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    scheduleTime: "09:30 AM",
  });
  const [errors,       setErrors]       = useState<Record<string, string>>({});
  const [hashDraft,    setHashDraft]    = useState("");
  const [taggedUsers,  setTaggedUsers]  = useState<TaggedUser[]>([]);

  /* ── Thumbnail state ── */
  const [newThumb,      setNewThumb]      = useState<File | null>(null);
  const [thumbPreview,  setThumbPreview]  = useState<string | null>(null);
  const thumbInputRef = useRef<HTMLInputElement>(null);

  /* ── Location autocomplete (same UX as the upload page) ── */
  const [locResults, setLocResults] = useState<LocationResult[]>([]);
  const [locLoading, setLocLoading] = useState(false);
  const [locOpen,    setLocOpen]    = useState(false);
  // Only search when the user actually types - never on programmatic sets
  // (initial video load, IP fallback, or picking a suggestion).
  const locEditedRef = useRef(false);
  const locWrapRef   = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!locEditedRef.current) return;
    const q = form.location.trim();
    if (q.length < 2) { setLocResults([]); setLocLoading(false); setLocOpen(false); return; }
    let alive = true;
    setLocLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await locationService.search(q);
        if (!alive) return;
        setLocResults(res.slice(0, 6));
        setLocOpen(true);
      } catch {
        if (alive) { setLocResults([]); setLocOpen(false); }
      } finally {
        if (alive) setLocLoading(false);
      }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [form.location]);

  function pickLocation(formatted: string) {
    locEditedRef.current = false;
    patch({ location: formatted });
    setLocResults([]);
    setLocOpen(false);
  }

  // Close the suggestions on outside click.
  useEffect(() => {
    if (!locOpen) return;
    const h = (e: MouseEvent) => { if (!locWrapRef.current?.contains(e.target as Node)) setLocOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [locOpen]);

  /* ── Time dropdown state ── */
  const [timeOpen, setTimeOpen] = useState(false);
  const timeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!timeOpen) return;
    const h = (e: MouseEvent) => { if (!timeRef.current?.contains(e.target as Node)) setTimeOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [timeOpen]);

  useEffect(() => { if (authReady && !isAuthenticated) router.replace("/"); }, [authReady, isAuthenticated, router]);

  /* ── Load video ── */
  const videoQ = useQuery({
    queryKey: ["edit-video", videoId],
    queryFn:  () => api.get<{ success: boolean; data: ReelsooVideo }>(`/videos/${videoId}`)
                       .then(r => r.data.data),
    enabled:  isAuthenticated && !!videoId,
    staleTime: 60_000,
  });

  const video = videoQ.data;

  /* ── Populate form from loaded video ── */
  useEffect(() => {
    if (!video) return;
    setTaggedUsers(video.tagged_users ?? []);
    const isScheduled  = video.status === "scheduled";
    const isoSched     = (video as any).scheduled_at as string | undefined;
    let schedDate      = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    let schedTime      = "09:30 AM";
    if (isoSched) {
      const d    = new Date(isoSched);
      schedDate  = d.toISOString().slice(0, 10);
      const h    = d.getHours();
      const m    = d.getMinutes() === 0 ? "00" : "30";
      const ampm = h < 12 ? "AM" : "PM";
      const h12  = h === 0 ? 12 : h > 12 ? h - 12 : h;
      schedTime  = `${String(h12).padStart(2, "0")}:${m} ${ampm}`;
    }
    setForm({
      title:          video.title          ?? "",
      caption:        video.caption        ?? "",
      category:       video.category       ?? "",
      location:       video.location       ?? "",
      language:       video.language       ?? "en",
      hashtags:       video.hashtags       ?? [],
      status:         (video.status        ?? "published") as VisibilityStatus,
      allow_comments:  video.allow_comments  ?? true,
      allow_duet:      video.allow_duet      ?? true,
      allow_stitch:    video.allow_stitch    ?? true,
      allow_download:  video.allow_download  ?? false,
      is_ai_generated: video.is_ai_generated ?? false,
      scheduled: isScheduled,
      scheduleDate: schedDate,
      scheduleTime: schedTime,
    });
  }, [video]);

  function patch(p: Partial<FormState>) { setForm(prev => ({ ...prev, ...p })); setErrors({}); }

  /* ── Hashtag helpers ── */
  function addHashtag(raw: string) {
    const clean = raw.replace(/^#+/, "").trim().toLowerCase();
    if (!clean || form.hashtags.includes(clean) || form.hashtags.length >= 30) return;
    patch({ hashtags: [...form.hashtags, clean] });
    setHashDraft("");
  }
  function removeHashtag(tag: string) { patch({ hashtags: form.hashtags.filter(t => t !== tag) }); }

  /* ── Thumbnail pick ── */
  function handleThumbPick(file: File) {
    if (!["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(file.type)) {
      toast.error("Use JPG, PNG or WEBP"); return;
    }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max 5 MB"); return; }
    setNewThumb(file);
    setThumbPreview(URL.createObjectURL(file));
  }

  /* ── Save mutation ── */
  const saveMut = useMutation({
    mutationFn: async () => {
      if (newThumb) {
        const fd = new FormData();
        fd.append("thumbnail", newThumb);
        await api.post(`/studio/content/${videoId}/thumbnail`, fd, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }
      let scheduledAt: string | null = null;
      const isScheduled = form.status === "scheduled" || form.scheduled;
      if (isScheduled) {
        const [timePart, ampm] = form.scheduleTime.split(" ");
        const [hStr, mStr]     = timePart.split(":");
        const h = parseInt(hStr, 10);
        const m = parseInt(mStr, 10);
        const h24 = ampm === "PM" ? (h === 12 ? 12 : h + 12) : (h === 12 ? 0 : h);
        scheduledAt = new Date(
          `${form.scheduleDate}T${String(h24).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`,
        ).toISOString();
      }
      await api.patch(`/studio/content/${videoId}`, {
        title:          form.title.trim()   || null,
        caption:        form.caption.trim() || null,
        category:       form.category       || null,
        location:       form.location.trim()|| null,
        language:       form.language       || null,
        hashtags:       form.hashtags,
        status:         isScheduled ? "scheduled" : form.status,
        scheduled_at:   scheduledAt,
        allow_comments:  form.allow_comments,
        allow_duet:      form.allow_duet,
        allow_stitch:    form.allow_stitch,
        allow_download:  form.allow_download,
        is_ai_generated: form.is_ai_generated,
        tagged_user_ids: taggedUsers.map(u => u.id),
      });
    },
    onSuccess: () => {
      toast.success("Changes saved.");
      void qc.invalidateQueries({ queryKey: ["studio-content"] });
      void qc.invalidateQueries({ queryKey: ["edit-video", videoId] });
      void qc.invalidateQueries({ queryKey: ["feed"] });
      void qc.invalidateQueries({ queryKey: ["video", videoId] });
      // Invalidate the public profile page so the owner (and visitors after their
      // cache expires) see the updated video list and count immediately.
      if (user?.username) {
        void qc.invalidateQueries({ queryKey: ["profile", user.username] });
        void qc.invalidateQueries({ queryKey: ["profile-videos", user.username] });
        void qc.invalidateQueries({ queryKey: ["profile-drafts", user.username] });
      }
    },
    onError: (e: any) => {
      if (e instanceof Error && !(e as any)?.response) { toast.error(e.message); return; }
      const errs = e?.response?.data?.errors as Record<string, string[]> | undefined;
      if (errs) {
        const mapped: Record<string, string> = {};
        Object.entries(errs).forEach(([k, v]) => { mapped[k] = Array.isArray(v) ? v[0] : String(v); });
        setErrors(mapped);
        toast.error("Please fix the highlighted fields.");
      } else {
        toast.error(e?.response?.data?.message || "Save failed.");
      }
    },
  });

  const saving  = saveMut.isPending;
  const loading = videoQ.isLoading;

  /* ── Visibility options ── */
  const VISIBILITY: {
    value: VisibilityStatus; label: string; desc: string; Icon: React.ElementType;
  }[] = [
    { value: "published", label: "Public",    desc: "Anyone can see this video.",       Icon: Globe       },
    { value: "private",   label: "Private",   desc: "Only you can see this video.",     Icon: Lock        },
    { value: "draft",     label: "Draft",     desc: "Save as draft and publish later.", Icon: FileText    },
    { value: "scheduled", label: "Scheduled", desc: "Schedule for a future date.",      Icon: CalendarDays },
  ];

  const langLabel    = LANGUAGES.find(l => l.code === form.language)?.label ?? "English";
  const currentThumb = thumbPreview ?? video?.thumbnail_url ?? null;

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper
        collapsed={collapsed}
        onToggle={() => setCollapsed(o => !o)}
        activeHref="/studio/content"
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">

        {/* ═══════════════════════════ TOPBAR ═══════════════════════════ */}
        <StudioTopbarShared
          title={
            !video ? "Edit Post"
            : (video.media_type === "image" || video.media_type === "image_carousel") ? "Edit Photo Post"
            : "Edit Video"
          }
          subtitle="Update your post details, settings, and publish preferences."
          showBack
          onBack={() => router.push("/studio/content")}
          dateRange={{ start: new Date(Date.now()-6*86400000), end: new Date() }}
          onDateRangeChange={() => {}}
        />

        {/* ═══════════════════ SCROLLABLE BODY ═══════════════════ */}
        <div className="flex-1 overflow-y-auto pb-[72px]" style={{ scrollbarWidth: "thin" }}>

          {loading ? (
            /* Loading skeleton */
            <div className="flex gap-5 p-5">
              <div className="w-[340px] flex-shrink-0 space-y-4">
                <div className="h-[380px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
                <div className="h-[160px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
              </div>
              <div className="flex-1">
                <div className="h-[600px] animate-pulse rounded-2xl bg-[#f3f4f6]" />
              </div>
            </div>
          ) : !video ? (
            <div className="flex h-full items-center justify-center">
              <div className="text-center">
                <p className="text-[15px] font-semibold text-[#374151]">Video not found.</p>
                <button type="button" onClick={() => router.push("/studio/content")}
                  className="mt-3 text-[13px] text-[#fd4605] hover:underline">
                  Back to Content
                </button>
              </div>
            </div>
          ) : (

            <div className="flex gap-5 p-5">

              {/* ═══════════ LEFT COLUMN ═══════════ */}
              <div className="w-[340px] flex-shrink-0 space-y-4">

                {/* ── Video preview card ── */}
                <div className="rounded-2xl border border-[#f0f0f0] bg-white pt-4">
                  {/* Portrait 9:16 custom player */}
                  {(() => {
                    const isImgPost  = video.media_type === "image" || video.media_type === "image_carousel";
                    const imgSrc     = video.video_url || video.media_items?.[0]?.url || null;

                    return (
                      <VideoPreviewPlayer
                        src={isImgPost ? null : (video.hls_url ?? video.video_url)}
                        fallbackSrc={isImgPost ? null : video.video_url}
                        poster={isImgPost ? imgSrc : currentThumb}
                        duration={video.duration}
                      />
                    );
                  })()}

                  {/* Meta info */}
                  <div className="p-4">
                    <p className="mb-3 text-[15px] font-extrabold text-[#111827]">
                      {form.title || video.title || video.caption || "Untitled"}
                    </p>
                    <div className="space-y-2.5">
                      {/* Publish date */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <Calendar className="h-3.5 w-3.5 flex-shrink-0" /> Publish date
                        </span>
                        <span className="text-right text-[12px] font-medium text-[#374151]">
                          {fmtPublishDate(video.created_at)}
                        </span>
                      </div>
                      {/* Duration */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <circle cx="12" cy="12" r="10" /><path strokeLinecap="round" d="M12 6v6l4 2" />
                          </svg>
                          Duration
                        </span>
                        <span className="text-[12px] font-medium text-[#374151]">{fmtDuration(video.duration)}</span>
                      </div>
                      {/* Resolution */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <Monitor className="h-3.5 w-3.5 flex-shrink-0" /> Resolution
                        </span>
                        <span className="text-[12px] font-medium text-[#374151]">
                          {video.width && video.height
                            ? `${video.width} × ${video.height} (${video.width > video.height ? "16:9" : "9:16"})`
                            : "-"}
                        </span>
                      </div>
                      {/* Status */}
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <svg className="h-3.5 w-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          Status
                        </span>
                        <span className={cn(
                          "rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize",
                          form.status === "published" ? "bg-[#dcfce7] text-[#15803d]" :
                          form.status === "draft"     ? "bg-[#dbeafe] text-[#1d4ed8]" :
                          form.status === "scheduled" ? "bg-[#fff7ed] text-[#c2410c]" :
                                                        "bg-[#f3f4f6] text-[#4b5563]",
                        )}>
                          {form.status === "published" ? "Published" : form.status}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── Thumbnail card ── */}
                <div className="rounded-2xl border border-[#f0f0f0] bg-white p-4">
                  <p className="text-[14px] font-bold text-[#111827]">Thumbnail</p>
                  <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                    Choose or upload a custom thumbnail for your video.
                  </p>
                  <div className="mt-3 flex gap-3">
                    {/* Current selected thumb - portrait 9:16 */}
                    <div className="relative w-[80px] flex-shrink-0 overflow-hidden rounded-xl border-2 border-[#fd4605]"
                      style={{ aspectRatio: "9/16" }}>
                      {currentThumb
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={currentThumb} alt="" className="h-full w-full object-cover" />
                        : <div className="flex h-full w-full items-center justify-center bg-[#f3f4f6]">
                            <Video className="h-5 w-5 text-[#d1d5db]" />
                          </div>}
                      <div className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-[#fd4605] shadow">
                        <Check className="h-3 w-3 text-white" strokeWidth={3} />
                      </div>
                    </div>
                    {/* Upload new - portrait 9:16 to match thumb */}
                    <button type="button" onClick={() => thumbInputRef.current?.click()}
                      className="flex w-[80px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#e5e7eb] transition hover:border-[#fd4605] hover:bg-[#fff8f9]"
                      style={{ aspectRatio: "9/16" }}>
                      <Upload className="h-5 w-5 text-[#9ca3af]" />
                      <span className="text-[11px] font-semibold text-[#374151]">Upload New</span>
                      <span className="text-[10px] text-[#9ca3af]">PNG, JPG up to 5MB</span>
                    </button>
                    <input ref={thumbInputRef} type="file"
                      accept="image/jpeg,image/jpg,image/png,image/webp"
                      className="hidden"
                      onChange={e => { if (e.target.files?.[0]) handleThumbPick(e.target.files[0]); }} />
                  </div>
                </div>
              </div>
              {/* ═══════════ /LEFT COLUMN ═══════════ */}

              {/* ═══════════ RIGHT COLUMN (Form) ═══════════ */}
              <div className="min-w-0 flex-1 space-y-0 overflow-visible rounded-2xl border border-[#f0f0f0] bg-white">
                <div className="p-5 pb-0">

                  {/* ─── Row: Caption (left) | Category + Location + Language (right) ─── */}
                  <div className="mb-4 grid gap-5" style={{ gridTemplateColumns: "1fr 260px" }}>

                    {/* LEFT: Caption / Description */}
                    <div>
                      <label className="mb-1.5 block text-[13px] font-bold text-[#111827]">
                        Caption / Description
                      </label>
                      <textarea
                        value={form.caption}
                        maxLength={300}
                        rows={6}
                        onChange={e => patch({ caption: e.target.value })}
                        placeholder="Write a caption for your post…"
                        className="w-full resize-none rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-[13px] text-[#111827] outline-none transition focus:border-[#fd4605] placeholder:text-[#c0c4cc]"
                      />
                      <p className="mt-0.5 text-right text-[11px] text-[#9ca3af]">
                        {form.caption.length} / 300
                      </p>
                    </div>

                    {/* RIGHT: Category → Location → Language stacked */}
                    <div className="flex flex-col gap-4">

                      {/* Category */}
                      <div>
                        <label className="mb-1.5 block text-[13px] font-bold text-[#111827]">
                          Category <span className="text-[#fd4605]">*</span>
                        </label>
                        {(() => {
                          const SelIcon = form.category ? CATEGORY_ICONS[form.category] : null;
                          return (
                            <PortalDropdown
                              value={form.category}
                              options={CATEGORIES.map(c => ({ value: c, label: c, icon: CATEGORY_ICONS[c] }))}
                              onChange={v => patch({ category: v })}
                              searchable
                              trigger={
                                <div className={cn(
                                  "flex items-center justify-between rounded-xl border px-3 py-2.5 text-[13px] transition",
                                  errors.category ? "border-red-400" : "border-[#e5e7eb] hover:border-[#fd4605]",
                                )}>
                                  <span className="flex items-center gap-2 min-w-0">
                                    {SelIcon && <SelIcon className="h-4 w-4 flex-shrink-0 text-[#6b7280]" />}
                                    <span className={cn("truncate", form.category ? "text-[#111827]" : "text-[#9ca3af]")}>
                                      {form.category || "Select category…"}
                                    </span>
                                  </span>
                                  <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
                                </div>
                              }
                            />
                          );
                        })()}
                        {errors.category && <p className="mt-1 text-[11px] text-red-500">{errors.category}</p>}
                      </div>

                      {/* Location */}
                      <div>
                        <label className="mb-1.5 block text-[13px] font-bold text-[#111827]">Location</label>
                        <div ref={locWrapRef} className="relative">
                          <div className="flex items-center rounded-xl border border-[#e5e7eb] transition focus-within:border-[#fd4605]">
                            <MapPin className="ml-3 h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
                            <input
                              value={form.location}
                              onChange={e => { locEditedRef.current = true; patch({ location: e.target.value }); }}
                              onFocus={() => { if (locResults.length) setLocOpen(true); }}
                              placeholder="Kathmandu, Nepal"
                              className="flex-1 bg-transparent px-2 py-2.5 text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af]"
                            />
                            {locLoading && form.location.trim().length >= 2 && (
                              <Loader2 className="mr-2 h-3.5 w-3.5 flex-shrink-0 animate-spin text-[#9ca3af]" />
                            )}
                            {form.location && (
                              <button type="button"
                                onClick={() => { locEditedRef.current = false; patch({ location: "" }); setLocResults([]); setLocOpen(false); }}
                                className="mr-3 text-[#9ca3af] hover:text-[#374151]">
                                <X className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Suggestions dropdown */}
                          {locOpen && (locResults.length > 0 || locLoading) && (
                            <div className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-56 overflow-y-auto rounded-[12px] border border-[#e5e7eb] bg-white py-1 shadow-[0_8px_24px_rgba(17,24,39,0.12)]">
                              {locLoading && locResults.length === 0 && (
                                <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#9aa1ad]">
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                                </div>
                              )}
                              {locResults.map((r, i) => (
                                <button key={`${r.formatted}-${i}`} type="button"
                                  onClick={() => pickLocation(r.formatted)}
                                  className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-[#fff0f3]">
                                  <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#fd4605]" />
                                  <span className="text-[12px] leading-snug text-[#111827]">{r.formatted}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Language */}
                      <div>
                        <label className="mb-1.5 block text-[13px] font-bold text-[#111827]">Language</label>
                        <PortalDropdown
                          value={form.language}
                          options={LANGUAGES.map(l => ({ value: l.code, label: l.label }))}
                          onChange={v => patch({ language: v })}
                          trigger={
                            <div className="flex items-center justify-between rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-[13px] text-[#111827] transition hover:border-[#fd4605]">
                              <span>{langLabel}</span>
                              <ChevronDown className="ml-2 h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
                            </div>
                          }
                        />
                      </div>
                    </div>
                  </div>

                  {/* ─── Tag People ─── */}
                  <div className="mb-4 grid gap-5" style={{ gridTemplateColumns: "1fr 260px" }}>
                    <div>
                      <label className="mb-1.5 block text-[13px] font-bold text-[#111827]">Tag People</label>
                      <TagPeopleField value={taggedUsers} onChange={setTaggedUsers} />
                      <p className="mt-1 text-[11px] text-[#9ca3af]">
                        {taggedUsers.length > 0
                          ? `${taggedUsers.length} person${taggedUsers.length !== 1 ? "s" : ""} tagged`
                          : "Search and tag people who appear in this post"}
                      </p>
                    </div>
                    <div />
                  </div>

                  {/* ─── Row 3: Hashtags ─── */}
                  <div className="mb-4">
                    <label className="mb-1.5 block text-[13px] font-bold text-[#111827]">Hashtags</label>
                    <div className="relative flex min-h-[44px] flex-wrap items-center gap-1.5 rounded-xl border border-[#e5e7eb] px-2.5 py-2 pr-9 transition focus-within:border-[#fd4605]">
                      {form.hashtags.map(tag => (
                        <span key={tag}
                          className="inline-flex items-center gap-1 rounded-full border border-[#e5e7eb] bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#374151]">
                          #{tag}
                          <button type="button" onClick={() => removeHashtag(tag)}
                            className="ml-0.5 grid h-3.5 w-3.5 place-items-center rounded-full text-[#9ca3af] hover:text-[#374151]">
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </span>
                      ))}
                      <input
                        value={hashDraft}
                        onChange={e => setHashDraft(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addHashtag(hashDraft); }
                          else if (e.key === "Backspace" && !hashDraft && form.hashtags.length)
                            removeHashtag(form.hashtags[form.hashtags.length - 1]);
                        }}
                        disabled={form.hashtags.length >= 30}
                        placeholder={form.hashtags.length ? "" : "Add hashtags…"}
                        className="min-w-[80px] flex-1 bg-transparent py-0.5 text-[13px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
                      />
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                    </div>
                    <p className="mt-1 text-[11px] text-[#9ca3af]">
                      Press Enter or comma to add · {form.hashtags.length}/30
                    </p>
                  </div>

                  {/* ─── Divider ─── */}
                  <div className="-mx-5 border-t border-[#f0f0f0]" />

                  {/* ─── Visibility & Privacy ─── */}
                  <div className="py-4">
                    <h3 className="text-[14px] font-bold text-[#111827]">Visibility &amp; Privacy</h3>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                      Control who can see your video and how it's shared.
                    </p>

                    <div className="mt-3 grid grid-cols-4 gap-3">
                      {VISIBILITY.map(({ value, label, desc, Icon }) => {
                        const active = form.status === value;
                        return (
                          <button key={value} type="button"
                            onClick={() => patch({ status: value, scheduled: value === "scheduled" })}
                            className={cn(
                              "flex flex-col gap-1.5 rounded-xl border p-3 text-left transition",
                              active
                                ? "border-[#fd4605] bg-[#fff8f9]"
                                : "border-[#e5e7eb] hover:border-[#fd4605]/40",
                            )}>
                            <div className="flex items-center gap-2">
                              {/* Radio indicator */}
                              <div className={cn(
                                "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full border-2",
                                active ? "border-[#fd4605]" : "border-[#d1d5db]",
                              )}>
                                {active && <div className="h-2 w-2 rounded-full bg-[#fd4605]" />}
                              </div>
                              <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-[#fd4605]" : "text-[#6b7280]")} />
                              <span className={cn("text-[12px] font-bold", active ? "text-[#fd4605]" : "text-[#111827]")}>
                                {label}
                              </span>
                            </div>
                            <p className="pl-6 text-[10px] leading-snug text-[#9ca3af]">{desc}</p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* ─── Divider ─── */}
                  <div className="-mx-5 border-t border-[#f0f0f0]" />

                  {/* ─── Bottom: Toggles + Schedule (2-column) ─── */}
                  <div className="grid grid-cols-2 gap-4 py-4">

                    {/* Allow toggles sub-card */}
                    <div className="rounded-xl border border-[#f0f0f0] p-4 space-y-4">
                      {[
                        { key: "allow_comments"  as const, label: "Allow comments",
                          desc: "Let people comment on your video.",        Icon: MessageCircle },
                        { key: "allow_duet"      as const, label: "Allow Duet / Stitch",
                          desc: "Let others create Duet or Stitch videos.", Icon: Scissors },
                        { key: "allow_download"  as const, label: "Allow download",
                          desc: "Let people download your video.",          Icon: Download },
                      ].map(({ key, label, desc, Icon }) => (
                        <div key={key} className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0">
                            <Toggle checked={form[key]} onChange={v => patch({ [key]: v })} />
                          </div>
                          <div className="min-w-0">
                            <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                            <p className="text-[11px] text-[#9ca3af]">{desc}</p>
                          </div>
                        </div>
                      ))}

                      {/* AI Generated Content toggle */}
                      <div className="border-t border-[#f5f5f5] pt-4">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex-shrink-0">
                            <Toggle checked={form.is_ai_generated} onChange={v => patch({ is_ai_generated: v })} />
                          </div>
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[13px] font-semibold text-[#111827]">AI Generated Content</p>
                              <div className="group relative">
                                <HelpCircle className="h-3.5 w-3.5 cursor-help text-[#c4c9d4]" />
                                <div className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-[200px] -translate-x-1/2 rounded-lg bg-[#111827] px-2.5 py-2 text-[10px] leading-relaxed text-white shadow-xl group-hover:visible">
                                  Turn on if this video was fully or significantly created or edited using AI tools.
                                  <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111827]" />
                                </div>
                              </div>
                            </div>
                            <p className="text-[11px] text-[#9ca3af]">Turn this on if this video contains AI-generated or AI-edited content.</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Schedule publish sub-card */}
                    <div className="rounded-xl border border-[#f0f0f0] p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[13px] font-bold text-[#111827]">Schedule publish</p>
                          <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                            Choose when to make your video public.
                          </p>
                        </div>
                        <Toggle
                          checked={form.scheduled || form.status === "scheduled"}
                          onChange={v => patch({
                            scheduled: v,
                            status: v ? "scheduled" : (form.status === "scheduled" ? "published" : form.status),
                          })}
                        />
                      </div>

                      {(form.scheduled || form.status === "scheduled") && (
                        <div className="mt-4 flex gap-2">
                          {/* Date */}
                          <div className="flex flex-1 items-center gap-2 rounded-xl border border-[#e5e7eb] px-3 py-2.5 transition focus-within:border-[#fd4605]">
                            <CalendarDays className="h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
                            <input
                              type="date"
                              value={form.scheduleDate}
                              min={new Date().toISOString().slice(0, 10)}
                              onChange={e => patch({ scheduleDate: e.target.value })}
                              className="flex-1 bg-transparent text-[12px] text-[#374151] outline-none"
                            />
                          </div>

                          {/* Time */}
                          <div ref={timeRef} className="relative w-[130px]">
                            <button type="button" onClick={() => setTimeOpen(o => !o)}
                              className="flex w-full items-center gap-2 rounded-xl border border-[#e5e7eb] px-3 py-2.5 text-[12px] text-[#374151] transition hover:border-[#fd4605]">
                              <Clock className="h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
                              <span className="flex-1 text-left">{form.scheduleTime}</span>
                              <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", timeOpen && "rotate-180")} />
                            </button>
                            {timeOpen && (
                              <div className="absolute bottom-full left-0 z-50 mb-1 max-h-[200px] w-full overflow-y-auto rounded-xl border border-[#e5e7eb] bg-white shadow-xl">
                                {TIME_SLOTS.map(t => (
                                  <button key={t} type="button"
                                    onClick={() => { patch({ scheduleTime: t }); setTimeOpen(false); }}
                                    className={cn(
                                      "flex w-full items-center px-3 py-2 text-[12px] transition hover:bg-[#f8f9fb]",
                                      t === form.scheduleTime
                                        ? "bg-[#fff3ec] font-semibold text-[#fd4605]"
                                        : "text-[#374151]",
                                    )}>
                                    {t}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                </div>
              </div>
              {/* ═══════════ /RIGHT COLUMN ═══════════ */}

            </div>
          )}
        </div>

        {/* ═══════════════════ FIXED BOTTOM BAR ═══════════════════ */}
        <div className="flex flex-shrink-0 items-center justify-end gap-3 border-t border-[#f0f0f0] bg-white px-6 py-4">
          <button type="button" onClick={() => router.push("/studio/content")} disabled={saving}
            className="rounded-xl border border-[#e5e7eb] px-7 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:border-[#fd4605] hover:text-[#fd4605] disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={() => saveMut.mutate()} disabled={saving || loading}
            className="flex items-center gap-2 rounded-xl bg-[#fd4605] px-7 py-2.5 text-[13px] font-bold text-white shadow-sm transition hover:bg-[#e03e04] disabled:opacity-50">
            <Save className="h-4 w-4" />
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
