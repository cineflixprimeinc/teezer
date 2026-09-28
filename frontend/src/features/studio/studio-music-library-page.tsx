"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import {
  Book, Calendar, ChevronDown, ChevronLeft, ChevronRight, Clock, Coffee, Copy,
  Dumbbell, ExternalLink, Film, Flame, Gamepad2, Headphones, Heart, Info,
  LayoutGrid, ListMusic, Mic2, Moon, MoreHorizontal, Music, Music2, Pause,
  Play, Radio, RefreshCw, Search, Shield, SkipBack, SkipForward, Smile,
  Sparkles, Star, SunMedium, Upload, User, Video, Wind, X, Zap,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";
import { audioService, AudioTrack } from "@/services/audio.service";

// ─── Categories ───────────────────────────────────────────────────────────────

const CATEGORIES = [
  { id: "all",       label: "All",        icon: Music,       color: "#fd4605" },
  { id: "trending",  label: "Trending",   icon: Flame,       color: "#f97316" },
  { id: "happy",     label: "Happy",      icon: Smile,       color: "#eab308" },
  { id: "chill",     label: "Chill",      icon: Wind,        color: "#22c55e" },
  { id: "energetic", label: "Energetic",  icon: Zap,         color: "#ef4444" },
  { id: "cinematic", label: "Cinematic",  icon: Film,        color: "#a855f7" },
  { id: "vlog",      label: "Vlog",       icon: Video,       color: "#3b82f6" },
  { id: "calm",      label: "Calm",       icon: Moon,        color: "#6366f1" },
  { id: "romantic",  label: "Romantic",   icon: Heart,       color: "#ec4899" },
  { id: "acoustic",  label: "Acoustic",   icon: Music2,      color: "#84cc16" },
  { id: "lo_fi",     label: "Lo-fi",      icon: Coffee,      color: "#78716c" },
  { id: "gaming",    label: "Gaming",     icon: Gamepad2,    color: "#06b6d4" },
  { id: "workout",   label: "Workout",    icon: Dumbbell,    color: "#f43f5e" },
  { id: "party",     label: "Party",      icon: Sparkles,    color: "#8b5cf6" },
  { id: "study",     label: "Study",      icon: Book,        color: "#0ea5e9" },
  { id: "morning",   label: "Morning",    icon: SunMedium,   color: "#fb923c" },
  { id: "pop",        label: "Pop",        icon: Star,        color: "#d946ef" },
  { id: "hip_hop",    label: "Hip-hop",    icon: Mic2,        color: "#f97316" },
  { id: "electronic", label: "Electronic", icon: Radio,       color: "#0ea5e9" },
  { id: "rock",       label: "Rock",       icon: Zap,         color: "#dc2626" },
  { id: "jazz",       label: "Jazz",       icon: Coffee,      color: "#8b5cf6" },
  { id: "rnb",        label: "R&B",        icon: Heart,       color: "#ec4899" },
  { id: "classical",  label: "Classical",  icon: Music2,      color: "#64748b" },
  { id: "indie",      label: "Indie",      icon: Headphones,  color: "#10b981" },
  { id: "nepali",     label: "Nepali",     icon: Music,       color: "#f59e0b" },
  { id: "more",       label: "More",       icon: LayoutGrid,  color: "#9ca3af" },
] as const;

const TABS = [
  { id: "all",               label: "All Tracks" },
  { id: "teezer_originals", label: "Teezer Originals" },
  { id: "my_originals",      label: "My Original Sound" },
  { id: "favorites",         label: "Favorites" },
];

const MOOD_STYLES: Record<string, { bg: string; text: string }> = {
  "Happy":               { bg: "#fefce8", text: "#ca8a04" },
  "Chill":               { bg: "#eff6ff", text: "#3b82f6" },
  "Romantic":            { bg: "#fdf2f8", text: "#ec4899" },
  "Motivational":        { bg: "#fff7ed", text: "#ea580c" },
  "Sad / Melancholy":    { bg: "#f0f9ff", text: "#0284c7" },
  "Energetic":           { bg: "#fef2f2", text: "#ef4444" },
  "Peaceful":            { bg: "#f0fdf4", text: "#16a34a" },
  "Dark / Mysterious":   { bg: "#f4f5f7", text: "#374151" },
  "Epic / Dramatic":     { bg: "#faf5ff", text: "#9333ea" },
  "Workout / Pump-up":   { bg: "#fff1f2", text: "#f43f5e" },
  "Vlog / Casual":       { bg: "#fefce8", text: "#a16207" },
  "Travel / Adventure":  { bg: "#ecfeff", text: "#0891b2" },
  "Calm / Relaxing":     { bg: "#f0fdf4", text: "#15803d" },
  "Party / Festive":     { bg: "#f5f3ff", text: "#7c3aed" },
  "Study / Focus":       { bg: "#f0f9ff", text: "#0284c7" },
  "Morning Vibes":       { bg: "#fff7ed", text: "#c2410c" },
  "Nostalgic":           { bg: "#fdf4ff", text: "#c026d3" },
  "Dreamy":              { bg: "#eff6ff", text: "#6366f1" },
  "Angry / Intense":     { bg: "#fef2f2", text: "#b91c1c" },
  "Uplifting":           { bg: "#f7fee7", text: "#65a30d" },
  "Spiritual":           { bg: "#fdf4ff", text: "#9333ea" },
  "Suspenseful":         { bg: "#fafaf9", text: "#44403c" },
  "Playful / Fun":       { bg: "#fefce8", text: "#d97706" },
  "Romantic / Love":     { bg: "#fff3ec", text: "#e11d48" },
  "Cinematic":           { bg: "#faf5ff", text: "#7c3aed" },
};

const GENRE_OPTIONS = [
  { value: "Pop",                    label: "Pop" },
  { value: "Hip-hop",                label: "Hip-hop" },
  { value: "R&B / Soul",             label: "R&B / Soul" },
  { value: "Electronic / EDM",       label: "Electronic / EDM" },
  { value: "Dance",                  label: "Dance" },
  { value: "Rock",                   label: "Rock" },
  { value: "Indie / Alternative",    label: "Indie / Alternative" },
  { value: "Jazz",                   label: "Jazz" },
  { value: "Classical",              label: "Classical" },
  { value: "Folk / Acoustic",        label: "Folk / Acoustic" },
  { value: "Country",                label: "Country" },
  { value: "Reggae",                 label: "Reggae" },
  { value: "Lo-fi",                  label: "Lo-fi" },
  { value: "Cinematic / Film Score", label: "Cinematic / Film Score" },
  { value: "Ambient",                label: "Ambient" },
  { value: "Instrumental",           label: "Instrumental" },
  { value: "Nepali",                 label: "Nepali" },
  { value: "Hindi / Bollywood",      label: "Hindi / Bollywood" },
  { value: "Latin",                  label: "Latin" },
  { value: "Afrobeats",              label: "Afrobeats" },
  { value: "K-Pop",                  label: "K-Pop" },
  { value: "J-Pop",                  label: "J-Pop" },
  { value: "Gospel / Worship",       label: "Gospel / Worship" },
  { value: "Blues",                  label: "Blues" },
  { value: "Trap",                   label: "Trap" },
  { value: "House",                  label: "House" },
  { value: "Techno",                 label: "Techno" },
  { value: "Drum & Bass",            label: "Drum & Bass" },
];

const DURATION_OPTIONS = [
  { value: "short",       label: "Under 1 min"  },
  { value: "medium",      label: "1 - 3 min"    },
  { value: "long",        label: "3 - 5 min"    },
  { value: "very_long",   label: "Over 5 min"   },
];

const USAGE_OPTIONS = [
  { value: "free_for_social",      label: "Free for social" },
  { value: "attribution_required", label: "Attribution required" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDuration(sec: number | null | undefined): string {
  if (!sec) return "-";
  return `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, "0")}`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtNum(n: number | null | undefined): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1000)      return (n / 1000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toLocaleString();
}

function waveformBars(trackId: number, count = 48): number[] {
  const bars: number[] = [];
  let s = (trackId * 2654435761) >>> 0;
  for (let i = 0; i < count; i++) {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b)) >>> 0;
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b)) >>> 0;
    s ^= s >>> 16;
    bars.push(15 + (s % 70));
  }
  return bars;
}

function sparklinePoints(seed: number, len = 10): number[] {
  const arr: number[] = [];
  let s = (seed * 1664525 + 1013904223) >>> 0;
  for (let i = 0; i < len; i++) {
    s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b)) >>> 0;
    arr.push(s % 100);
  }
  arr[arr.length - 1] = Math.max(...arr);
  const max = Math.max(...arr), min = Math.min(...arr), range = max - min || 1;
  return arr.map(v => (v - min) / range);
}

// ─── Sparkline ────────────────────────────────────────────────────────────────

function Sparkline({ usageCount }: { usageCount: number }) {
  const pts = useMemo(() => sparklinePoints(usageCount), [usageCount]);
  const W = 72, H = 28;
  const coords = pts.map((v, i) => [(i / (pts.length - 1)) * W, H - 4 - v * (H - 8)]);
  const d = coords.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} fill="none" className="shrink-0">
      <path d={d} stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Waveform ─────────────────────────────────────────────────────────────────

function Waveform({ trackId, isPlaying }: { trackId: number; isPlaying: boolean }) {
  const bars = useMemo(() => waveformBars(trackId), [trackId]);
  return (
    <div className="flex items-center gap-[1.5px] h-8 w-44 shrink-0">
      {bars.map((h, i) => (
        <div key={i} className={cn(
          "rounded-full shrink-0 transition-colors duration-300",
          isPlaying ? "bg-[#fd4605]" : "bg-[#e5e7eb] group-hover:bg-[#d1d5db]",
        )} style={{ width: 2, height: `${h}%` }} />
      ))}
    </div>
  );
}

// ─── Mood badge ───────────────────────────────────────────────────────────────

function MoodBadge({ mood }: { mood: string | null }) {
  if (!mood) return null;
  const s = MOOD_STYLES[mood] ?? { bg: "#f4f5f7", text: "#374151" };
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap"
      style={{ background: s.bg, color: s.text }}>
      {mood}
    </span>
  );
}

// ─── Usage rights badge ───────────────────────────────────────────────────────

function UsageRightsBadge({ value }: { value: string | null }) {
  const isFree = !value || value === "free_for_social";
  return (
    <span className={cn(
      "inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-medium border whitespace-nowrap",
      isFree ? "border-[#bbf7d0] bg-[#f0fdf4] text-[#16a34a]" : "border-[#fde68a] bg-[#fefce8] text-[#b45309]",
    )}>
      {isFree ? "Free for social" : "Attribution required"}
    </span>
  );
}

// ─── Dropdown ─────────────────────────────────────────────────────────────────

function Dropdown({ label, value, options, onChange, icon: Icon, searchable }: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  icon?: React.ElementType;
  searchable?: boolean;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState("");
  const ref   = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const filtered = query ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : options;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open && searchable) setTimeout(() => inRef.current?.focus(), 50); }, [open, searchable]);

  const selected = options.find(o => o.value === value);
  const active = !!value;

  return (
    <div ref={ref} className="relative shrink-0" style={{ zIndex: open ? 50 : undefined }}>
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          "flex items-center gap-1.5 h-9 px-3 rounded-xl border text-[12px] font-medium transition-all whitespace-nowrap",
          active
            ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605] shadow-sm shadow-[#fd4605]/10"
            : "border-[#e8eaed] bg-white text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605]",
        )}
      >
        {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
        <span>{selected?.label ?? label}</span>
        <ChevronDown className={cn("h-3 w-3 ml-0.5 transition-transform shrink-0", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-[60] mt-2 min-w-[200px] rounded-2xl border border-[#e8eaed] bg-white shadow-2xl shadow-black/10">
          {/* Header */}
          <div className="px-3 pt-3 pb-1.5">
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">{label}</p>
          </div>
          {searchable && (
            <div className="px-2 pb-2">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-[#9ca3af] pointer-events-none" />
                <input ref={inRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                  className="w-full h-7 pl-7 pr-3 rounded-lg bg-[#f9fafb] border border-[#e8eaed] text-[11px] text-[#111827] outline-none focus:border-[#fd4605]" />
              </div>
            </div>
          )}
          <div className="px-1.5 pb-1.5 max-h-56 overflow-y-auto">
            {!query && (
              <button
                onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-[12px] transition-colors flex items-center justify-between",
                  !value ? "bg-[#fff3ec] text-[#fd4605] font-semibold" : "text-[#374151] hover:bg-[#f4f5f7]",
                )}
              >
                <span>All</span>
                {!value && <div className="h-1.5 w-1.5 rounded-full bg-[#fd4605]" />}
              </button>
            )}
            {filtered.map(o => (
              <button
                key={o.value}
                onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-xl text-[12px] transition-colors flex items-center justify-between",
                  value === o.value ? "bg-[#fff3ec] text-[#fd4605] font-semibold" : "text-[#374151] hover:bg-[#f4f5f7]",
                )}
              >
                <span>{o.label}</span>
                {value === o.value && <div className="h-1.5 w-1.5 rounded-full bg-[#fd4605]" />}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center py-3 text-[11px] text-[#9ca3af]">No results</p>}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Category carousel ────────────────────────────────────────────────────────

function CategoryCarousel({ category, onSelect }: {
  category: string;
  onSelect: (id: string) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canLeft,  setCanLeft]  = useState(false);
  const [canRight, setCanRight] = useState(true);

  function checkScroll() {
    const el = scrollRef.current;
    if (!el) return;
    setCanLeft(el.scrollLeft > 0);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }

  function scroll(dir: "left" | "right") {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollBy({ left: dir === "left" ? -240 : 240, behavior: "smooth" });
    setTimeout(checkScroll, 320);
  }

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    checkScroll();
    el.addEventListener("scroll", checkScroll, { passive: true });
    return () => el.removeEventListener("scroll", checkScroll);
  }, []);

  return (
    <div className="relative flex items-center gap-1">
      {/* Left arrow */}
      <button
        onClick={() => scroll("left")}
        className={cn(
          "shrink-0 h-8 w-8 rounded-full border border-[#e8eaed] bg-white grid place-items-center text-[#6b7280] shadow-sm transition-all",
          canLeft ? "opacity-100 hover:border-[#fd4605] hover:text-[#fd4605]" : "opacity-0 pointer-events-none",
        )}
      >
        <ChevronLeft className="h-4 w-4" />
      </button>

      {/* Scrollable strip */}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none" }}
      >
        {CATEGORIES.map(cat => {
          const Icon = cat.icon;
          const active = category === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelect(cat.id)}
              className={cn(
                "flex items-center gap-1.5 h-9 px-4 rounded-2xl text-[12px] font-semibold whitespace-nowrap shrink-0 border transition-all",
                active
                  ? "text-white border-transparent shadow-md"
                  : "bg-white border-[#e8eaed] text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605] hover:shadow-sm",
              )}
              style={active ? { background: cat.color, borderColor: cat.color, boxShadow: `0 4px 12px ${cat.color}30` } : {}}
            >
              <Icon className="h-3.5 w-3.5 shrink-0" />
              <span>{cat.label}</span>
            </button>
          );
        })}
      </div>

      {/* Right arrow */}
      <button
        onClick={() => scroll("right")}
        className={cn(
          "shrink-0 h-8 w-8 rounded-full border border-[#e8eaed] bg-white grid place-items-center text-[#6b7280] shadow-sm transition-all",
          canRight ? "opacity-100 hover:border-[#fd4605] hover:text-[#fd4605]" : "opacity-0 pointer-events-none",
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}

// ─── Track details modal ─────────────────────────────────────────────────────

function TrackDetailsModal({ track, onClose, onPlay, isPlaying }: {
  track: AudioTrack;
  onClose: () => void;
  onPlay: () => void;
  isPlaying: boolean;
}) {
  const isTeezer = !!track.created_by_admin_id ||
    (track.artist?.toLowerCase().includes("teezer") ?? false);

  const metaFields = [
    { label: "Genre",    value: track.genre,      icon: Music2 },
    { label: "Mood",     value: track.mood,        icon: Smile },
    { label: "Language", value: track.language,    icon: Info },
    { label: "Duration", value: fmtDuration(track.duration), icon: Clock },
    { label: "BPM",      value: track.bpm ? `${track.bpm} BPM` : null, icon: Zap },
    { label: "Key",      value: track.music_key,   icon: Music },
    { label: "ISRC",     value: track.isrc,        icon: Shield },
    { label: "Album",    value: track.album,       icon: ListMusic },
    { label: "License",  value: track.license_type ?? track.usage_rights, icon: Shield },
  ].filter(f => f.value);

  return (
    <div
      className="fixed inset-0 z-[900] flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Hero ── */}
        <div className="relative h-52 bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] overflow-hidden">
          {track.cover_url
            ? <img src={track.cover_url} alt={track.title} className="w-full h-full object-cover" />
            : <div className="w-full h-full flex items-center justify-center">
                <Music className="h-20 w-20 text-[#fd4605]/20" />
              </div>
          }
          <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/25 to-transparent" />

          {/* Close */}
          <button
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 rounded-full bg-black/30 backdrop-blur-sm grid place-items-center text-white hover:bg-black/50 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>

          {/* Source badge */}
          <div className="absolute top-3 left-3">
            {isTeezer ? (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#fd4605]/90 text-white text-[10px] font-bold backdrop-blur-sm">
                <Music className="h-2.5 w-2.5" /> Teezer Original
              </span>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#3b82f6]/90 text-white text-[10px] font-bold backdrop-blur-sm">
                <User className="h-2.5 w-2.5" /> Artist Upload
              </span>
            )}
          </div>

          {/* Title + play */}
          <div className="absolute bottom-0 left-0 right-0 p-5">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <p className="text-white font-bold text-[17px] leading-snug line-clamp-2">{track.title}</p>
                <p className="text-white/70 text-[13px] mt-0.5 truncate">{track.artist ?? "Unknown Artist"}</p>
              </div>
              <button
                onClick={e => { e.stopPropagation(); onPlay(); }}
                className="shrink-0 h-12 w-12 rounded-full bg-[#fd4605] grid place-items-center shadow-xl shadow-[#fd4605]/40 hover:bg-[#e03e04] active:scale-95 transition-all"
              >
                {isPlaying
                  ? <Pause className="h-5 w-5 fill-current text-white" />
                  : <Play  className="h-5 w-5 fill-current text-white ml-0.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* ── Content ── */}
        <div className="max-h-[55vh] overflow-y-auto">
          <div className="p-5 space-y-5">

            {/* Metadata grid */}
            {metaFields.length > 0 && (
              <div className="grid grid-cols-2 gap-2.5">
                {metaFields.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="bg-[#f9fafb] rounded-2xl p-3 flex items-start gap-2.5">
                    <div className="h-7 w-7 rounded-xl bg-white grid place-items-center shrink-0 shadow-sm border border-[#f0f0f0]">
                      <Icon className="h-3.5 w-3.5 text-[#fd4605]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[9px] font-bold uppercase tracking-widest text-[#9ca3af] leading-none">{label}</p>
                      <p className="text-[12px] font-semibold text-[#374151] mt-1 leading-snug truncate">{value}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Track info card */}
            <div className="rounded-2xl border border-[#f4f5f7] divide-y divide-[#f9fafb]">
              <div className="px-4 py-3 flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-[#9ca3af] shrink-0" />
                <p className="text-[11px] font-bold uppercase tracking-widest text-[#9ca3af]">Track Info</p>
              </div>
              {[
                { label: "Uploaded by",   value: isTeezer ? "Teezer" : (track.artist ?? "Independent Artist"), icon: Upload },
                { label: "Published",     value: fmtDate(track.created_at),   icon: Calendar },
                { label: "Release Date",  value: fmtDate(track.release_date), icon: Calendar },
                { label: "Total Plays",   value: fmtNum(track.usage_count),   icon: Play },
                { label: "Total Uses",    value: fmtNum(track.uses_count),    icon: ExternalLink },
              ].filter(r => r.value && r.value !== "-").map(({ label, value, icon: Icon }) => (
                <div key={label} className="flex items-center justify-between px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <Icon className="h-3.5 w-3.5 text-[#c4c9d4] shrink-0" />
                    <span className="text-[12px] text-[#6b7280]">{label}</span>
                  </div>
                  <span className="text-[12px] font-semibold text-[#374151]">{value}</span>
                </div>
              ))}
            </div>

            {/* Description */}
            {track.description && (
              <div className="bg-[#f9fafb] rounded-2xl p-4">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af] mb-2">About this track</p>
                <p className="text-[12.5px] text-[#374151] leading-relaxed">{track.description}</p>
              </div>
            )}

            {/* Usage flags */}
            <div className="flex flex-wrap gap-2">
              {track.allow_reels !== false && (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] text-[11px] font-semibold">
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                  Allow Reels
                </span>
              )}
              {track.allow_stories !== false && (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#f0fdf4] text-[#16a34a] border border-[#bbf7d0] text-[11px] font-semibold">
                  <svg className="h-3 w-3" viewBox="0 0 12 12" fill="currentColor"><path d="M10 3L5 8.5 2 5.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/></svg>
                  Allow Stories
                </span>
              )}
              {track.featured && (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#fefce8] text-[#ca8a04] border border-[#fde68a] text-[11px] font-semibold">
                  <Star className="h-3 w-3" /> Featured
                </span>
              )}
              {track.explicit_content && (
                <span className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-[#fff1f2] text-[#e11d48] border border-[#fecdd3] text-[11px] font-semibold">
                  ⚠ Explicit
                </span>
              )}
            </div>

            {/* CTA buttons */}
            <div className="flex gap-3 pb-1">
              <button
                onClick={e => { e.stopPropagation(); onPlay(); }}
                className="flex-1 h-11 rounded-2xl bg-[#fd4605] text-white text-[13px] font-bold hover:bg-[#e03e04] active:scale-[0.98] transition-all shadow-md shadow-[#fd4605]/25 flex items-center justify-center gap-2"
              >
                {isPlaying ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
                {isPlaying ? "Pause" : "Use sound"}
              </button>
              <button
                onClick={() => { if (track.audio_url) navigator.clipboard.writeText(track.audio_url).catch(() => {}); }}
                className="h-11 px-4 rounded-2xl border border-[#e8eaed] text-[13px] font-semibold text-[#374151] hover:bg-[#f9fafb] transition-colors whitespace-nowrap flex items-center gap-2"
              >
                <Copy className="h-3.5 w-3.5 text-[#9ca3af]" />
                Copy link
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Track row ────────────────────────────────────────────────────────────────

function TrackRow({ track, isPlaying, isFavorited, onPlay, onFavorite, onViewDetails }: {
  track: AudioTrack;
  isPlaying: boolean;
  isFavorited: boolean;
  onPlay: () => void;
  onFavorite: () => void;
  onViewDetails: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos]   = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isNew = !!track.created_at &&
    Date.now() - new Date(track.created_at).getTime() < 7 * 24 * 60 * 60 * 1000;

  function openMenu() {
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    const MENU_H = 180;
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= MENU_H ? rect.bottom + 6 : rect.top - MENU_H - 6;
    setMenuPos({ top: Math.max(8, top), right: window.innerWidth - rect.right });
    setMenuOpen(true);
  }

  return (
    <div className={cn(
      "group flex items-center gap-3 px-4 py-3 transition-colors",
      isPlaying ? "bg-[#fff8f9]" : "hover:bg-[#fafafa]",
    )}>
      <button onClick={onPlay} className={cn(
        "shrink-0 h-9 w-9 rounded-full grid place-items-center border-2 transition-all",
        isPlaying
          ? "border-[#fd4605] bg-[#fd4605] text-white shadow-sm shadow-[#fd4605]/30"
          : "border-[#e8eaed] bg-white text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605]",
      )}>
        {isPlaying ? <Pause className="h-3.5 w-3.5 fill-current" /> : <Play className="h-3.5 w-3.5 fill-current ml-0.5" />}
      </button>

      <div className="h-11 w-11 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] grid place-items-center">
        {track.cover_url
          ? <img src={track.cover_url} alt={track.title} className="h-full w-full object-cover" />
          : <Music className="h-4 w-4 text-[#fd4605]" />}
      </div>

      <div className="min-w-0 w-44 shrink-0">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[13px] font-semibold text-[#111827]">{track.title}</p>
          {isNew && (
            <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#fd4605] text-white leading-none">NEW</span>
          )}
        </div>
        <p className="truncate text-[11px] text-[#9ca3af] mt-0.5">{track.artist ?? "Unknown Artist"}</p>
      </div>

      <div className="flex-1 hidden md:flex items-center min-w-0">
        <Waveform trackId={track.id} isPlaying={isPlaying} />
        <span className="ml-2 text-[11px] text-[#9ca3af] shrink-0 tabular-nums">{fmtDuration(track.duration)}</span>
      </div>

      <div className="w-36 shrink-0 hidden lg:block"><MoodBadge mood={track.mood} /></div>
      <div className="w-10 shrink-0 text-right md:hidden">
        <span className="text-[11px] text-[#6b7280]">{fmtDuration(track.duration)}</span>
      </div>
      <div className="w-36 shrink-0 hidden xl:block">
        <p className="text-[12px] font-medium text-[#374151] truncate">{track.artist ?? "-"}</p>
      </div>

      <button onClick={onFavorite} className="shrink-0 p-1.5 rounded-full transition-colors hover:bg-[#fff3ec]">
        <Heart className={cn("h-4 w-4 transition-colors", isFavorited ? "fill-[#fd4605] text-[#fd4605]" : "text-[#d1d5db] hover:text-[#fd4605]")} />
      </button>

      <button className="shrink-0 h-8 px-4 rounded-xl bg-[#fd4605] text-white text-[12px] font-semibold hover:bg-[#e03e04] active:scale-95 transition-all whitespace-nowrap">
        Use sound
      </button>

      <button
        ref={btnRef}
        onClick={() => menuOpen ? setMenuOpen(false) : openMenu()}
        className="shrink-0 p-1.5 rounded-full text-[#c4c9d4] hover:text-[#374151] hover:bg-[#f4f5f7] transition-colors"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {menuOpen && menuPos && (
        <>
          <div className="fixed inset-0 z-[998]" onClick={() => setMenuOpen(false)} />
          <div
            className="fixed z-[999] w-52 rounded-2xl border border-[#e8eaed] bg-white shadow-2xl shadow-black/15 py-2 overflow-hidden"
            style={{ top: menuPos.top, right: menuPos.right }}
          >
            {[
              { label: "Add to playlist", icon: "＋", action: () => setMenuOpen(false) },
              { label: "Share",           icon: "↗", action: () => setMenuOpen(false) },
              {
                label: "View details", icon: "ℹ",
                action: () => { setMenuOpen(false); onViewDetails(); },
                highlight: true,
              },
              { label: "Report",          icon: "⚑", action: () => setMenuOpen(false) },
            ].map(item => (
              <button
                key={item.label}
                onClick={item.action}
                className={cn(
                  "w-full flex items-center gap-2.5 px-4 py-2.5 text-[12.5px] font-medium transition-colors text-left",
                  "highlight" in item && item.highlight
                    ? "text-[#fd4605] hover:bg-[#fff3ec]"
                    : "text-[#374151] hover:bg-[#f9fafb] hover:text-[#fd4605]",
                )}
              >
                <span className="text-[#9ca3af] text-[13px] w-4 text-center shrink-0">{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function TrackSkeletons() {
  return (
    <div className="divide-y divide-[#f9fafb]">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
          <div className="h-9 w-9 rounded-full bg-[#f0f0f0] shrink-0" />
          <div className="h-11 w-11 rounded-xl bg-[#f0f0f0] shrink-0" />
          <div className="space-y-1.5 w-44 shrink-0">
            <div className="h-3 bg-[#f0f0f0] rounded-full w-4/5" />
            <div className="h-2.5 bg-[#f0f0f0] rounded-full w-3/5" />
          </div>
          <div className="flex-1 h-5 bg-[#f0f0f0] rounded-full hidden md:block" />
          <div className="h-5 w-16 bg-[#f0f0f0] rounded-full hidden lg:block" />
          <div className="h-5 w-28 bg-[#f0f0f0] rounded-full hidden xl:block" />
          <div className="h-8 w-20 bg-[#f0f0f0] rounded-xl" />
        </div>
      ))}
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────

function EmptyState({ tab }: { tab: string }) {
  const isFav       = tab === "favorites" || tab === "saved";
  const isOriginals = tab === "my_originals";
  return (
    <div className="py-16 text-center">
      <Music className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
      <p className="text-[14px] font-semibold text-[#374151]">
        {isFav ? "No saved tracks yet" : isOriginals ? "No artist tracks found" : "No tracks found"}
      </p>
      <p className="text-[13px] text-[#9ca3af] mt-1">
        {isFav ? "Heart a track to save it here." : isOriginals ? "Tracks uploaded by artists will appear here." : "Try adjusting your search or filters."}
      </p>
    </div>
  );
}

// ─── Right sidebar ────────────────────────────────────────────────────────────

function RightSidebar({ trendingTracks, playingId, onPlay }: {
  trendingTracks: AudioTrack[];
  playingId: number | null;
  onPlay: (t: AudioTrack) => void;
}) {
  return (
    <div className="flex flex-col gap-4 overflow-y-auto py-5 pl-2 pr-1">
      <div className="bg-white rounded-2xl border border-[#e8eaed] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#f4f5f7]">
          <p className="text-[13px] font-bold text-[#111827]">Trending Sounds</p>
          <button className="text-[12px] font-semibold text-[#fd4605] hover:underline">View all</button>
        </div>
        <div className="divide-y divide-[#f9fafb]">
          {trendingTracks.length === 0
            ? (
              <div className="px-4 py-8 text-center">
                <ListMusic className="h-7 w-7 text-[#d1d5db] mx-auto mb-2" />
                <p className="text-[12px] text-[#9ca3af]">No trending tracks yet</p>
              </div>
            )
            : trendingTracks.slice(0, 5).map((track, i) => (
              <div key={track.id} className="flex items-center gap-2.5 px-3 py-3 hover:bg-[#fafafa] transition-colors">
                <span className="text-[12px] font-bold text-[#9ca3af] w-4 shrink-0 text-center">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[#111827]">{track.title}</p>
                  <p className="truncate text-[10px] text-[#9ca3af]">{track.artist ?? "Unknown"}</p>
                </div>
                <Sparkline usageCount={track.usage_count + track.id} />
                <button onClick={() => onPlay(track)}
                  className="shrink-0 h-7 w-7 rounded-full border border-[#e8eaed] bg-white grid place-items-center text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605] transition-colors">
                  {playingId === track.id ? <Pause className="h-3 w-3 fill-current" /> : <Play className="h-3 w-3 fill-current ml-0.5" />}
                </button>
              </div>
            ))
          }
        </div>
      </div>

      {/* Upload Your Originals card */}
      <div className="rounded-2xl border border-[#ffdccc] overflow-hidden" style={{ background: "linear-gradient(145deg, #fff8f9 0%, #fff3ec 100%)" }}>
        {/* Decorative waveform header */}
        <div className="relative flex items-center justify-center pt-5 pb-3 px-4">
          {/* Fake waveform bars */}
          <div className="flex items-center gap-[3px] absolute inset-x-4 top-3 opacity-20">
            {[14,22,36,50,42,60,48,30,55,45,28,60,52,38,22,44,58,46,32,55,40,26,48,60,35].map((h, i) => (
              <div key={i} className="flex-1 rounded-full bg-[#fd4605]" style={{ height: h }} />
            ))}
          </div>
          {/* Center icon */}
          <div className="relative z-10 h-14 w-14 rounded-full bg-white shadow-lg shadow-[#fd4605]/20 grid place-items-center border-2 border-[#ffdccc]">
            <div className="relative">
              <Music className="h-6 w-6 text-[#fd4605]" />
              <div className="absolute -right-1 -bottom-1 h-5 w-5 rounded-full bg-[#fd4605] grid place-items-center shadow-sm">
                <svg viewBox="0 0 10 10" className="h-2.5 w-2.5 text-white fill-current">
                  <path d="M5 1v8M2 5l3-3 3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" fill="none"/>
                </svg>
              </div>
            </div>
          </div>
        </div>

        <div className="px-4 pb-5 text-center">
          <p className="text-[14px] font-bold text-[#111827] leading-snug">Upload Your Originals</p>
          <p className="text-[11px] text-[#6b7280] mt-1.5 leading-relaxed">
            Have original music? Upload it to Teezer and let creators discover your sound.
          </p>

          <button
            onClick={() => window.open("https://music.teezer.live", "_blank")}
            className="mt-4 w-full h-10 rounded-xl bg-[#fd4605] text-white text-[13px] font-bold hover:bg-[#e03e04] active:scale-95 transition-all shadow-md shadow-[#fd4605]/30">
            Upload with Teezer
          </button>

          <div className="mt-3 flex items-center justify-center gap-1.5 text-[11px] text-[#9ca3af]">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0 text-[#10b981]" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="8" cy="8" r="6" /><path d="M5.5 8l2 2 3-3" />
            </svg>
            Original audio only
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#e8eaed] p-4">
        <p className="text-[13px] font-bold text-[#111827] mb-3">Audio Copyright Guide</p>
        <div className="space-y-2.5">
          {[
            { dot: "#10b981", text: "Use licensed music to avoid copyright claims." },
            { dot: "#10b981", text: 'Look for "Free for social" for worry-free use.' },
            { dot: "#f59e0b", text: "Attribution required? Give credit in your post." },
            { dot: "#ef4444", text: "Don't remix or repost full tracks." },
          ].map(({ dot, text }) => (
            <div key={text} className="flex items-start gap-2.5">
              <div className="mt-0.5 h-4 w-4 rounded-full grid place-items-center shrink-0" style={{ background: dot + "18" }}>
                <div className="h-1.5 w-1.5 rounded-full" style={{ background: dot }} />
              </div>
              <p className="text-[11px] text-[#6b7280] leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
        <button className="mt-4 h-8 w-full rounded-xl border border-[#e8eaed] text-[12px] text-[#374151] font-medium hover:bg-[#f4f5f7] transition-colors">
          Learn more
        </button>
      </div>

      {trendingTracks.length > 0 && (
        <div className="bg-white rounded-2xl border border-[#e8eaed] overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-[#f4f5f7]">
            <p className="text-[13px] font-bold text-[#111827]">Recently Used</p>
            <button className="text-[12px] font-semibold text-[#fd4605] hover:underline">View all</button>
          </div>
          <div className="divide-y divide-[#f9fafb]">
            {trendingTracks.slice(0, 3).map(track => (
              <div key={track.id} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafafa] transition-colors">
                <div className="h-9 w-9 shrink-0 rounded-lg overflow-hidden bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] grid place-items-center">
                  {track.cover_url ? <img src={track.cover_url} alt="" className="h-full w-full object-cover" /> : <Music className="h-3.5 w-3.5 text-[#fd4605]" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] font-semibold text-[#111827]">{track.title}</p>
                  <p className="truncate text-[11px] text-[#9ca3af]">{track.artist ?? "Unknown"} · {fmtDuration(track.duration)}</p>
                </div>
                <button onClick={() => onPlay(track)}
                  className="shrink-0 h-7 w-7 rounded-full border border-[#e8eaed] bg-white grid place-items-center text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605] transition-colors">
                  <Play className="h-3 w-3 fill-current ml-0.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Mini player ─────────────────────────────────────────────────────────────

function MiniPlayer({ track, isPlaying, currentTime, duration, onToggle, onSeek, onSkip, onClose }: {
  track: AudioTrack;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  onToggle: () => void;
  onSeek: (t: number) => void;
  onSkip: (s: number) => void;
  onClose: () => void;
}) {
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  function handleBarClick(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const frac = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(frac * duration);
  }

  function fmt(s: number) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(Math.floor(s%60)).padStart(2,"0")}`; }

  return (
    <div className="shrink-0 bg-white border-t border-[#e8eaed] shadow-2xl shadow-black/10 px-4 pt-2 pb-3">
      {/* Seek bar */}
      <div className="h-1 w-full rounded-full bg-[#f0f0f0] mb-3 cursor-pointer group relative" onClick={handleBarClick}>
        <div className="h-full rounded-full bg-[#fd4605] relative" style={{ width: `${pct}%` }}>
          <div className="absolute right-0 top-1/2 -translate-y-1/2 h-3 w-3 rounded-full bg-[#fd4605] border-2 border-white shadow scale-0 group-hover:scale-100 transition-transform" />
        </div>
      </div>

      <div className="flex items-center gap-3">
        {/* Cover + info */}
        <div className="h-10 w-10 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] grid place-items-center">
          {track.cover_url
            ? <img src={track.cover_url} alt="" className="h-full w-full object-cover" />
            : <Music className="h-4 w-4 text-[#fd4605]" />}
        </div>
        <div className="min-w-0 w-40 shrink-0">
          <p className="truncate text-[13px] font-semibold text-[#111827]">{track.title}</p>
          <p className="truncate text-[11px] text-[#9ca3af]">{track.artist ?? "Unknown Artist"}</p>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-1 mx-auto">
          <button onClick={() => onSkip(-10)} title="Back 10s"
            className="h-8 w-8 rounded-full grid place-items-center text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#374151] transition-colors">
            <SkipBack className="h-4 w-4" />
          </button>
          <button onClick={onToggle}
            className="h-10 w-10 rounded-full bg-[#fd4605] grid place-items-center text-white hover:bg-[#e03e04] active:scale-95 transition-all shadow-md shadow-[#fd4605]/30">
            {isPlaying
              ? <Pause className="h-4 w-4 fill-current" />
              : <Play  className="h-4 w-4 fill-current ml-0.5" />}
          </button>
          <button onClick={() => onSkip(10)} title="Forward 10s"
            className="h-8 w-8 rounded-full grid place-items-center text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#374151] transition-colors">
            <SkipForward className="h-4 w-4" />
          </button>
        </div>

        {/* Time */}
        <div className="text-[11px] text-[#9ca3af] tabular-nums shrink-0 w-24 text-center">
          {fmt(currentTime)} / {fmt(duration)}
        </div>

        {/* Close */}
        <button onClick={onClose}
          className="h-7 w-7 rounded-full grid place-items-center text-[#9ca3af] hover:bg-[#f4f5f7] hover:text-[#374151] transition-colors shrink-0">
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

// ─── Local favorites helpers ──────────────────────────────────────────────────

const FAV_IDS_KEY    = "teezer_music_fav_ids";
const FAV_TRACKS_KEY = "teezer_music_fav_tracks";

function loadLocalFavs(): { ids: Set<number>; tracks: Record<number, AudioTrack> } {
  try {
    const ids    = new Set<number>(JSON.parse(localStorage.getItem(FAV_IDS_KEY)    ?? "[]"));
    const tracks = JSON.parse(localStorage.getItem(FAV_TRACKS_KEY) ?? "{}") as Record<number, AudioTrack>;
    return { ids, tracks };
  } catch { return { ids: new Set(), tracks: {} }; }
}

function saveLocalFavs(ids: Set<number>, tracks: Record<number, AudioTrack>) {
  localStorage.setItem(FAV_IDS_KEY,    JSON.stringify([...ids]));
  localStorage.setItem(FAV_TRACKS_KEY, JSON.stringify(tracks));
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function StudioMusicLibraryPage() {
  const router = useRouter();
  const { isAuthenticated, authReady } = useAuthStore();

  const [collapsed, setCollapsed] = useState(false);
  const [dateRange, setDateRange] = useState({ start: new Date(Date.now() - 6 * 86400000), end: new Date() });

  const [category,        setCategory]      = useState("all");
  const [tab,             setTab]           = useState("all");
  const [search,          setSearch]        = useState("");
  const [debouncedSearch, setDebounced]     = useState("");
  const [moodFilter,      setMoodFilter]    = useState("");
  const [genreFilter,     setGenreFilter]   = useState("");
  const [durationFilter,  setDurationFilter] = useState("");

  const [tracks,     setTracks]    = useState<AudioTrack[]>([]);
  const [total,      setTotal]     = useState<number | null>(null);
  const [trending,   setTrending]  = useState<AudioTrack[]>([]);
  const [favIds,     setFavIds]    = useState<Set<number>>(new Set());
  const [favTracks,  setFavTracks] = useState<Record<number, AudioTrack>>({});
  const [loading,    setLoading]   = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [playingId,    setPlayingId]    = useState<number | null>(null);
  const [playingTrack, setPlayingTrack] = useState<AudioTrack | null>(null);
  const [currentTime,  setCurrentTime]  = useState(0);
  const [trackDuration,setTrackDuration]= useState(0);
  const [detailTrack,  setDetailTrack]  = useState<AudioTrack | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  // Load saved favorites from localStorage on mount
  useEffect(() => {
    const { ids, tracks: saved } = loadLocalFavs();
    setFavIds(ids);
    setFavTracks(saved);
  }, []);

  useEffect(() => {
    audioService.getTrending().then(res => setTrending(res.data ?? [])).catch(() => {});
  }, []);

  const fetchTracks = useCallback(async () => {
    if (tab === "favorites") { setLoading(false); return; }
    setLoading(true);
    try {
      const resolvedCategory =
        tab === "teezer_originals" ? "teezer_originals" :
        tab === "my_originals"      ? "artist_originals"  :
        category;
      const res = await audioService.getTracks({
        category: resolvedCategory,
        search: debouncedSearch || undefined,
        mood:   moodFilter     || undefined,
        genre:  genreFilter    || undefined,
        duration: durationFilter || undefined,
      });
      const page = res.data;
      const list: AudioTrack[] = page?.data ?? (Array.isArray(page) ? page : []);
      setTracks(list);
      setTotal(page?.total ?? null);
      // Merge server-side is_favorited with local favs
      const localFavs = loadLocalFavs().ids;
      const fav = new Set<number>(localFavs);
      list.forEach(t => { if (t.is_favorited) fav.add(t.id); });
      setFavIds(fav);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [category, tab, debouncedSearch, moodFilter, genreFilter, durationFilter, refreshKey]);

  useEffect(() => { fetchTracks(); }, [fetchTracks]);

  const handlePlay = useCallback((track: AudioTrack) => {
    // Same track - toggle pause/resume
    if (playingTrack?.id === track.id) {
      const el = audioRef.current;
      if (!el) return;
      if (el.paused) { el.play().catch(() => {}); setPlayingId(track.id); }
      else           { el.pause(); setPlayingId(null); }
      return;
    }
    // Stop previous
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setPlayingId(track.id);
    setPlayingTrack(track);
    setCurrentTime(0);

    const startPlay = (audioUrl: string) => {
      const a = new Audio(audioUrl);
      a.play().catch(() => {});
      a.onended          = () => { setPlayingId(null); setCurrentTime(0); };
      a.ontimeupdate     = () => setCurrentTime(Math.floor(a.currentTime));
      a.onloadedmetadata = () => setTrackDuration(Math.floor(a.duration));
      audioRef.current   = a;
      setTrackDuration(track.duration ?? 0);
    };

    // Original-audio tracks need a Cloudflare-signed URL. Cached favorites may
    // have an unsigned URL - fetch a fresh signed one from the API before playing.
    if (track.is_original && (!track.audio_url || !track.audio_url.includes('expires='))) {
      audioService.getMusicDetail(track.id)
        .then(res => startPlay(res?.data?.audio_url ?? track.audio_url ?? ""))
        .catch(() => { if (track.audio_url) startPlay(track.audio_url); });
    } else if (track.audio_url) {
      startPlay(track.audio_url);
    }
  }, [playingTrack]);

  const handleSeek = useCallback((t: number) => {
    if (audioRef.current) { audioRef.current.currentTime = t; setCurrentTime(Math.floor(t)); }
  }, []);

  const handleSkip = useCallback((s: number) => {
    const el = audioRef.current;
    if (!el) return;
    const next = Math.max(0, Math.min(el.duration || 0, el.currentTime + s));
    el.currentTime = next;
    setCurrentTime(Math.floor(next));
  }, []);

  const handlePlayerToggle = useCallback(() => {
    const el = audioRef.current;
    if (!el || !playingTrack) return;
    if (el.paused) { el.play().catch(() => {}); setPlayingId(playingTrack.id); }
    else           { el.pause(); setPlayingId(null); }
  }, [playingTrack]);

  const handlePlayerClose = useCallback(() => {
    if (audioRef.current) { audioRef.current.pause(); audioRef.current.src = ""; }
    setPlayingId(null); setPlayingTrack(null); setCurrentTime(0); setTrackDuration(0);
  }, []);

  const handleFavorite = useCallback((track: AudioTrack) => {
    const was = favIds.has(track.id);
    const newIds    = new Set(favIds);
    const newTracks = { ...favTracks };
    if (was) { newIds.delete(track.id); delete newTracks[track.id]; }
    else     { newIds.add(track.id); newTracks[track.id] = track; }
    setFavIds(newIds);
    setFavTracks(newTracks);
    saveLocalFavs(newIds, newTracks);
  }, [favIds, favTracks]);

  const displayTracks = tab === "favorites" ? Object.values(favTracks) : tracks;
  const isOriginalsTab = tab === "teezer_originals";
  const activeFilters = [moodFilter, genreFilter, durationFilter].filter(Boolean).length;

  if (!authReady || !isAuthenticated) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper collapsed={collapsed} onToggle={() => setCollapsed(o => !o)} activeHref="/studio/music" />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared title="Music Library" dateRange={dateRange} onDateRangeChange={setDateRange} />

        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Main */}
          <div className="flex-1 overflow-y-auto">
            <div className="px-6 py-5 space-y-4">

              {/* Header */}
              <div>
                <h2 className="text-[19px] font-bold text-[#111827]">Music Library</h2>
                <p className="text-[13px] text-[#6b7280] mt-0.5">Discover and use licensed music to elevate your content.</p>
              </div>

              {/* Category carousel */}
              <CategoryCarousel category={category} onSelect={id => { setCategory(id); setTab("all"); }} />

              {/* Sub-tabs */}
              <div className="flex border-b border-[#e8eaed]">
                {TABS.map(t => (
                  <button key={t.id} onClick={() => setTab(t.id)}
                    className={cn(
                      "px-4 py-2.5 text-[13px] font-semibold border-b-2 -mb-px transition-colors whitespace-nowrap",
                      tab === t.id ? "border-[#fd4605] text-[#fd4605]" : "border-transparent text-[#6b7280] hover:text-[#374151]",
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Filter row */}
              <div className="flex items-center gap-2 flex-wrap">
                {/* Search */}
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
                  <input type="text" placeholder="Search by track, artist, or keyword..."
                    value={search} onChange={e => setSearch(e.target.value)}
                    className="h-9 w-full rounded-xl border border-[#e8eaed] bg-white pl-9 pr-3 text-[13px] placeholder:text-[#9ca3af] text-[#111827] outline-none focus:border-[#fd4605] transition-colors" />
                </div>

                <Dropdown label="Mood"     value={moodFilter}     onChange={setMoodFilter}     options={Object.keys(MOOD_STYLES).map(m => ({ value: m, label: m }))} searchable />
                <Dropdown label="Genre"    value={genreFilter}    onChange={setGenreFilter}    options={GENRE_OPTIONS} />
                <Dropdown label="Duration" value={durationFilter} onChange={setDurationFilter} options={DURATION_OPTIONS} />

                {/* Active filter count badge */}
                {activeFilters > 0 && (
                  <button
                    onClick={() => { setMoodFilter(""); setGenreFilter(""); setDurationFilter(""); }}
                    className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-[#fff3ec] border border-[#fd4605] text-[#fd4605] text-[12px] font-semibold hover:bg-[#ffe0e6] transition-colors whitespace-nowrap"
                  >
                    <span>{activeFilters} active</span>
                    <span className="text-[10px]">✕</span>
                  </button>
                )}

                {/* Refresh button */}
                <button
                  onClick={() => setRefreshKey(k => k + 1)}
                  className="shrink-0 ml-auto h-9 w-9 rounded-xl border border-[#e8eaed] bg-white grid place-items-center text-[#6b7280] hover:border-[#fd4605] hover:text-[#fd4605] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw className={cn("h-3.5 w-3.5 transition-transform", loading && "animate-spin")} />
                </button>
              </div>

              {/* Track list */}
              <div className="bg-white rounded-2xl border border-[#e8eaed]">
                {/* Column headers */}
                <div className="flex items-center gap-3 px-4 py-2.5 border-b border-[#f4f5f7] rounded-t-2xl">
                  <div className="w-9 shrink-0" />
                  <div className="w-11 shrink-0" />
                  <div className="w-44 shrink-0 text-[10px] font-bold uppercase tracking-widest text-[#c4c9d4]">Track</div>
                  <div className="flex-1 hidden md:block text-[10px] font-bold uppercase tracking-widest text-[#c4c9d4]">Preview</div>
                  <div className="w-36 hidden lg:block text-[10px] font-bold uppercase tracking-widest text-[#c4c9d4]">Mood</div>
                  <div className="w-36 hidden xl:block text-[10px] font-bold uppercase tracking-widest text-[#c4c9d4]">Artist</div>
                  <div className="w-6 shrink-0" />
                  <div className="w-20 shrink-0" />
                  <div className="w-6 shrink-0" />
                </div>

                {loading ? <TrackSkeletons />
                  : displayTracks.length === 0 ? <EmptyState tab={tab} />
                  : (
                    <div className="divide-y divide-[#f9fafb]">
                      {displayTracks.map(track => (
                        <TrackRow key={track.id} track={track}
                          isPlaying={playingId === track.id}
                          isFavorited={favIds.has(track.id)}
                          onPlay={() => handlePlay(track)}
                          onFavorite={() => handleFavorite(track)}
                          onViewDetails={() => setDetailTrack(track)}
                        />
                      ))}
                    </div>
                  )}

                {/* Footer count */}
                {!loading && displayTracks.length > 0 && total !== null && tab === "all" && (
                  <div className="px-4 py-3 border-t border-[#f9fafb] flex items-center justify-between">
                    <p className="text-[12px] text-[#9ca3af]">
                      Showing <span className="font-semibold text-[#374151]">{displayTracks.length}</span> of <span className="font-semibold text-[#374151]">{total.toLocaleString()}</span> tracks
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right sidebar */}
          <div className="hidden xl:block w-72 shrink-0 overflow-y-auto px-3 border-l border-[#f0f0f0] bg-white">
            <RightSidebar trendingTracks={trending} playingId={playingId} onPlay={handlePlay} />
          </div>
        </div>

        {/* Track details modal */}
        {detailTrack && (
          <TrackDetailsModal
            track={detailTrack}
            onClose={() => setDetailTrack(null)}
            onPlay={() => handlePlay(detailTrack)}
            isPlaying={playingId === detailTrack.id}
          />
        )}

        {/* Mini player */}
        {playingTrack && (
          <MiniPlayer
            track={playingTrack}
            isPlaying={playingId === playingTrack.id}
            currentTime={currentTime}
            duration={trackDuration}
            onToggle={handlePlayerToggle}
            onSeek={handleSeek}
            onSkip={handleSkip}
            onClose={handlePlayerClose}
          />
        )}
        </div>
      </div>
    </div>
  );
}
