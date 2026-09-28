"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Image as ImageIcon, Loader2, Music, Search, Upload, X,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { api, apiMessage } from "@/admin-panel/services/api";
import { cn } from "@/admin-panel/lib/utils";

// ─── Constants ────────────────────────────────────────────────────────────────

const GENRE_OPTIONS = [
  "Pop", "Hip-hop", "R&B / Soul", "Electronic / EDM", "Dance", "Rock",
  "Indie / Alternative", "Jazz", "Classical", "Folk / Acoustic",
  "Country", "Reggae", "Lo-fi", "Cinematic / Film Score", "Ambient",
  "Instrumental", "Nepali", "Hindi / Bollywood", "Latin", "Afrobeats",
  "K-Pop", "J-Pop", "Gospel / Worship", "Blues", "Punk", "Metal",
  "Trap", "Drill", "House", "Techno", "Drum & Bass", "SFX",
];

const MOOD_OPTIONS = [
  "Happy", "Chill", "Romantic", "Motivational", "Sad / Melancholy",
  "Energetic", "Peaceful", "Dark / Mysterious", "Epic / Dramatic",
  "Workout / Pump-up", "Vlog / Casual", "Travel / Adventure",
  "Calm / Relaxing", "Party / Festive", "Study / Focus", "Morning Vibes",
  "Nostalgic", "Dreamy", "Angry / Intense", "Uplifting", "Spiritual",
  "Suspenseful", "Playful / Fun", "Romantic / Love", "Cinematic",
];

const LANGUAGE_OPTIONS = [
  "English", "Nepali", "Hindi", "Spanish", "French", "Portuguese",
  "Arabic", "Bengali", "Chinese (Mandarin)", "Chinese (Cantonese)",
  "Dutch", "German", "Greek", "Gujarati", "Hebrew", "Indonesian",
  "Italian", "Japanese", "Kannada", "Korean", "Malay", "Malayalam",
  "Marathi", "Punjabi", "Russian", "Swahili", "Swedish",
  "Tagalog / Filipino", "Tamil", "Telugu", "Thai", "Turkish",
  "Ukrainian", "Urdu", "Vietnamese", "Instrumental / No Lyrics",
];

const KEY_OPTIONS = [
  "C Major", "C Minor", "C# / Db Major", "C# / Db Minor",
  "D Major", "D Minor", "D# / Eb Major", "D# / Eb Minor",
  "E Major", "E Minor", "F Major", "F Minor",
  "F# / Gb Major", "F# / Gb Minor", "G Major", "G Minor",
  "G# / Ab Major", "G# / Ab Minor", "A Major", "A Minor",
  "A# / Bb Major", "A# / Bb Minor", "B Major", "B Minor",
];

const LICENSE_OPTIONS = [
  { value: "reelsoo_licensed",  label: "Teezer Licensed",   desc: "Licensed exclusively for Teezer platform" },
  { value: "royalty_free",      label: "Royalty Free",        desc: "Free to use without ongoing royalties" },
  { value: "creative_commons",  label: "Creative Commons",    desc: "Open licensing with attribution" },
  { value: "public_domain",     label: "Public Domain",       desc: "No copyright restrictions" },
  { value: "admin_uploaded",    label: "Admin Uploaded",      desc: "Curated and uploaded by admin team" },
  { value: "partner_licensed",  label: "Partner Licensed",    desc: "Licensed from a content partner" },
  { value: "sync_license",      label: "Sync License",        desc: "Synchronization rights for video content" },
  { value: "exclusive_license", label: "Exclusive License",   desc: "Exclusive rights granted to Teezer" },
  { value: "custom_license",    label: "Custom License",      desc: "Special terms defined separately" },
];

const STATUS_OPTIONS = [
  { value: "draft",     label: "Draft",          desc: "Not visible to users yet" },
  { value: "published", label: "Published",      desc: "Live and visible to users" },
  { value: "pending",   label: "Pending Review", desc: "Awaiting admin review" },
  { value: "archived",  label: "Archived",       desc: "Hidden but not deleted" },
];

const REGION_OPTIONS = [
  { value: "worldwide",   label: "Worldwide",      desc: "Available in all regions" },
  { value: "us_only",     label: "US Only",        desc: "Limited to United States" },
  { value: "eu_only",     label: "EU Only",        desc: "Limited to European Union" },
  { value: "asia_only",   label: "Asia Only",      desc: "Limited to Asian countries" },
  { value: "exclude_us",  label: "Exclude US",     desc: "Available everywhere except US" },
  { value: "exclude_eu",  label: "Exclude EU",     desc: "Available everywhere except EU" },
  { value: "custom",      label: "Custom",         desc: "Specific regions defined separately" },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ─── Types ────────────────────────────────────────────────────────────────────

type AudioMeta = { duration: number; size: number; format: string; bitrate: number; sampleRate: number };
type OptionItem = { value: string; label: string; desc?: string };

// ─── Waveform ─────────────────────────────────────────────────────────────────

function Waveform({ seed, playing }: { seed: number; playing: boolean }) {
  const bars = useMemo(() => {
    const b: number[] = [];
    let s = (seed * 2654435761) >>> 0;
    for (let i = 0; i < 64; i++) {
      s = (Math.imul(s ^ (s >>> 16), 0x45d9f3b)) >>> 0;
      b.push(15 + (s % 80));
    }
    return b;
  }, [seed]);

  return (
    <div className="flex items-center gap-[1.5px] h-9 flex-1">
      {bars.map((h, i) => (
        <div key={i}
          className={cn("rounded-full flex-shrink-0 transition-colors duration-300", playing ? "bg-[#fd4605]" : "bg-[#e5e7eb]")}
          style={{ width: 2, height: `${h}%` }}
        />
      ))}
    </div>
  );
}

// ─── Progress ring ────────────────────────────────────────────────────────────

function ProgressRing({ pct }: { pct: number }) {
  const r = 38, circ = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center">
      <div className="relative w-24 h-24">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 88 88">
          <circle cx="44" cy="44" r={r} fill="none" stroke="#f0f0f0" strokeWidth="7" />
          <circle cx="44" cy="44" r={r} fill="none" stroke="#fd4605" strokeWidth="7"
            strokeDasharray={circ} strokeDashoffset={circ * (1 - pct / 100)}
            strokeLinecap="round" style={{ transition: "stroke-dashoffset 0.5s ease" }} />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[18px] font-bold text-[#111827] leading-none">{pct}%</span>
          <span className="text-[10px] text-[#9ca3af] mt-0.5">Complete</span>
        </div>
      </div>
    </div>
  );
}

// ─── Custom dropdown ──────────────────────────────────────────────────────────

function Dropdown({ label, value, options, onChange, placeholder, searchable, error }: {
  label?: string;
  value: string;
  options: (string | OptionItem)[];
  onChange: (v: string) => void;
  placeholder?: string;
  searchable?: boolean;
  error?: string;
}) {
  const [open, setOpen]     = useState(false);
  const [query, setQuery]   = useState("");
  const ref   = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const normalized: OptionItem[] = options.map(o =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  const filtered = query
    ? normalized.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : normalized;

  const selected = normalized.find(o => o.value === value);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (open && searchable) setTimeout(() => inRef.current?.focus(), 50);
  }, [open, searchable]);

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 50 : undefined }}>
      {label && <p className="text-[12px] font-semibold text-[#374151] mb-1.5">{label}</p>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-10 px-3.5 rounded-xl border text-[13px] transition-all text-left",
          error ? "border-[#ef4444] bg-[#fff5f5]" :
          open  ? "border-[#fd4605] bg-white shadow-sm shadow-[#fd4605]/10" :
                  "border-[#e8eaed] bg-white hover:border-[#fd4605] hover:shadow-sm",
        )}
      >
        <span className={cn("truncate flex-1", selected ? "text-[#111827] font-medium" : "text-[#9ca3af]")}>
          {selected?.label ?? placeholder ?? "Select…"}
        </span>
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>
      {error && <p className="text-[11px] text-[#ef4444] mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}

      {open && (
        <div className="absolute top-full left-0 z-[60] w-full mt-2 rounded-2xl border border-[#e8eaed] bg-white shadow-2xl shadow-black/10 overflow-hidden" style={{ minWidth: 200 }}>
          {searchable && (
            <div className="p-2 border-b border-[#f4f5f7]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
                <input ref={inRef} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full h-8 pl-8 pr-3 rounded-xl bg-[#f9fafb] border border-[#e8eaed] text-[12px] text-[#111827] outline-none focus:border-[#fd4605] transition-colors" />
              </div>
            </div>
          )}
          <div className="py-1.5 max-h-56 overflow-y-auto">
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-[#9ca3af] hover:bg-[#f9fafb] transition-colors">
                <X className="h-3.5 w-3.5" />
                Clear selection
              </button>
            )}
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-[12px] text-[#9ca3af]">No results</p>
            ) : filtered.map(o => (
              <button
                key={o.value}
                type="button"
                onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                className={cn(
                  "w-full flex items-start gap-3 px-3.5 py-2.5 transition-colors text-left",
                  value === o.value ? "bg-[#fff3ec]" : "hover:bg-[#f9fafb]",
                )}
              >
                <div className={cn(
                  "mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 grid place-items-center",
                  value === o.value ? "border-[#fd4605] bg-[#fd4605]" : "border-[#d1d5db]",
                )}>
                  {value === o.value && <div className="h-1.5 w-1.5 rounded-full bg-white" />}
                </div>
                <div className="min-w-0">
                  <p className={cn("text-[13px] font-medium leading-snug", value === o.value ? "text-[#fd4605]" : "text-[#111827]")}>{o.label}</p>
                  {o.desc && <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-snug">{o.desc}</p>}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Multi-select dropdown ────────────────────────────────────────────────────

function MultiDropdown({ label, values, options, onChange, placeholder, searchable, error }: {
  label?: string;
  values: string[];
  options: (string | OptionItem)[];
  onChange: (v: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  error?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref   = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const normalized: OptionItem[] = options.map(o =>
    typeof o === "string" ? { value: o, label: o } : o
  );

  const filtered = query
    ? normalized.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : normalized;

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => {
    if (open && searchable) setTimeout(() => inRef.current?.focus(), 50);
  }, [open, searchable]);

  function toggle(v: string) {
    onChange(values.includes(v) ? values.filter(x => x !== v) : [...values, v]);
  }

  const displayLabel = values.length === 0
    ? (placeholder ?? "Select…")
    : values.length === 1
      ? (normalized.find(o => o.value === values[0])?.label ?? values[0])
      : `${values.length} selected`;

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 50 : undefined }}>
      {label && <p className="text-[12px] font-semibold text-[#374151] mb-1.5">{label}</p>}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-10 px-3.5 rounded-xl border text-[13px] transition-all text-left",
          error ? "border-[#ef4444] bg-[#fff5f5]" :
          open  ? "border-[#fd4605] bg-white shadow-sm shadow-[#fd4605]/10" :
                  "border-[#e8eaed] bg-white hover:border-[#fd4605] hover:shadow-sm",
        )}
      >
        <span className={cn("truncate flex-1", values.length > 0 ? "text-[#111827] font-medium" : "text-[#9ca3af]")}>
          {displayLabel}
        </span>
        {values.length > 0 && (
          <span className="shrink-0 h-5 min-w-[20px] px-1 rounded-full bg-[#fd4605] text-white text-[10px] font-bold grid place-items-center">
            {values.length}
          </span>
        )}
        <ChevronDown className={cn("h-4 w-4 shrink-0 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>
      {error && <p className="text-[11px] text-[#ef4444] mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}

      {open && (
        <div className="absolute top-full left-0 z-[60] w-full mt-2 rounded-2xl border border-[#e8eaed] bg-white shadow-2xl shadow-black/10 overflow-hidden" style={{ minWidth: 200 }}>
          {searchable && (
            <div className="p-2 border-b border-[#f4f5f7]">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
                <input ref={inRef} value={query} onChange={e => setQuery(e.target.value)}
                  placeholder="Search…"
                  className="w-full h-8 pl-8 pr-3 rounded-xl bg-[#f9fafb] border border-[#e8eaed] text-[12px] text-[#111827] outline-none focus:border-[#fd4605] transition-colors" />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between px-3.5 py-2 border-b border-[#f4f5f7] bg-[#fafafa]">
            <button type="button" onClick={() => onChange(normalized.map(o => o.value))}
              className="text-[11px] font-semibold text-[#fd4605] hover:text-[#e11d48] transition-colors">
              Select All
            </button>
            <button type="button" onClick={() => onChange([])}
              className="text-[11px] font-semibold text-[#9ca3af] hover:text-[#374151] transition-colors">
              Clear
            </button>
          </div>
          <div className="py-1.5 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="text-center py-4 text-[12px] text-[#9ca3af]">No results</p>
            ) : filtered.map(o => {
              const checked = values.includes(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => toggle(o.value)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3.5 py-2.5 transition-colors text-left",
                    checked ? "bg-[#fff3ec]" : "hover:bg-[#f9fafb]",
                  )}
                >
                  <div className={cn(
                    "h-4 w-4 rounded border-2 shrink-0 grid place-items-center transition-colors",
                    checked ? "border-[#fd4605] bg-[#fd4605]" : "border-[#d1d5db]",
                  )}>
                    {checked && <Check className="h-2.5 w-2.5 text-white" />}
                  </div>
                  <p className={cn("text-[13px] font-medium leading-snug", checked ? "text-[#fd4605]" : "text-[#111827]")}>{o.label}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Date picker ──────────────────────────────────────────────────────────────

function DatePicker({ value, onChange, label }: {
  value: string; onChange: (v: string) => void; label?: string;
}) {
  const [open, setOpen]   = useState(false);
  const ref               = useRef<HTMLDivElement>(null);
  const today             = new Date();

  const parsed   = value ? new Date(value) : null;
  const initYear = parsed?.getFullYear() ?? today.getFullYear();
  const initMon  = parsed?.getMonth()    ?? today.getMonth();

  const [viewYear, setViewYear] = useState(initYear);
  const [viewMon,  setViewMon]  = useState(initMon);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  function prevMonth() { if (viewMon === 0) { setViewMon(11); setViewYear(y => y - 1); } else setViewMon(m => m - 1); }
  function nextMonth() { if (viewMon === 11) { setViewMon(0); setViewYear(y => y + 1); } else setViewMon(m => m + 1); }

  const firstDay   = new Date(viewYear, viewMon, 1).getDay();
  const daysInMon  = new Date(viewYear, viewMon + 1, 0).getDate();
  const cells      = Array.from({ length: firstDay + daysInMon }, (_, i) => (i < firstDay ? null : i - firstDay + 1));

  const selectedDay  = parsed?.getDate();
  const selectedMon  = parsed?.getMonth();
  const selectedYear = parsed?.getFullYear();

  function selectDay(d: number) {
    const m = String(viewMon + 1).padStart(2, "0");
    const dd = String(d).padStart(2, "0");
    onChange(`${viewYear}-${m}-${dd}`);
    setOpen(false);
  }

  const displayVal = parsed
    ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 50 : undefined }}>
      {label && <p className="text-[12px] font-semibold text-[#374151] mb-1.5">{label}</p>}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center gap-2.5 h-10 px-3.5 rounded-xl border text-[13px] transition-all",
          open ? "border-[#fd4605] shadow-sm shadow-[#fd4605]/10 bg-white" : "border-[#e8eaed] bg-white hover:border-[#fd4605]",
        )}>
        <CalendarDays className="h-4 w-4 text-[#9ca3af] shrink-0" />
        <span className={displayVal ? "text-[#111827] font-medium" : "text-[#9ca3af]"}>
          {displayVal || "Select date"}
        </span>
        {value && (
          <button type="button" onClick={e => { e.stopPropagation(); onChange(""); }}
            className="ml-auto text-[#9ca3af] hover:text-[#374151] transition-colors shrink-0">
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-[60] mt-2 bg-white rounded-2xl border border-[#e8eaed] shadow-2xl shadow-black/10 p-4 w-72">
          {/* Month/Year nav */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth}
              className="h-7 w-7 rounded-lg border border-[#e8eaed] grid place-items-center hover:bg-[#f4f5f7] text-[#6b7280] transition-colors">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <p className="text-[13px] font-bold text-[#111827]">{MONTHS[viewMon]} {viewYear}</p>
            <button type="button" onClick={nextMonth}
              className="h-7 w-7 rounded-lg border border-[#e8eaed] grid place-items-center hover:bg-[#f4f5f7] text-[#6b7280] transition-colors">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          {/* Day headers */}
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => (
              <div key={d} className="text-center text-[10px] font-bold text-[#9ca3af] py-1">{d}</div>
            ))}
          </div>
          {/* Cells */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const isTod   = d === today.getDate()   && viewMon === today.getMonth()   && viewYear === today.getFullYear();
              const isSel   = d === selectedDay && viewMon === selectedMon && viewYear === selectedYear;
              return (
                <button key={i} type="button" onClick={() => selectDay(d)}
                  className={cn(
                    "h-8 w-8 mx-auto rounded-full text-[12px] font-medium transition-all",
                    isSel  ? "bg-[#fd4605] text-white font-bold shadow-sm" :
                    isTod  ? "border-2 border-[#fd4605] text-[#fd4605] font-bold" :
                             "text-[#374151] hover:bg-[#fff3ec] hover:text-[#fd4605]",
                  )}>
                  {d}
                </button>
              );
            })}
          </div>
          {/* Quick actions */}
          <div className="flex gap-2 mt-3 pt-3 border-t border-[#f4f5f7]">
            <button type="button" onClick={() => { const t = today; onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`); setOpen(false); }}
              className="flex-1 h-7 rounded-lg bg-[#f9fafb] border border-[#e8eaed] text-[11px] font-semibold text-[#374151] hover:bg-[#f0f0f0] transition-colors">
              Today
            </button>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="flex-1 h-7 rounded-lg bg-[#f9fafb] border border-[#e8eaed] text-[11px] font-semibold text-[#9ca3af] hover:bg-[#f0f0f0] transition-colors">
              Clear
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, sub }: {
  value: boolean; onChange: (v: boolean) => void; label: string; sub?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        {sub && <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed">{sub}</p>}
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={cn(
          "relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 mt-0.5",
          value ? "bg-[#fd4605]" : "bg-[#e5e7eb]",
        )}>
        <span className={cn(
          "pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
          value ? "translate-x-5" : "translate-x-0",
        )} />
      </button>
    </div>
  );
}

// ─── Field components ─────────────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <p className="text-[12px] font-semibold text-[#374151] mb-1.5">
      {text}{required && <span className="text-[#fd4605] ml-0.5">*</span>}
    </p>
  );
}

function TextInput({ value, onChange, placeholder, error }: {
  value: string; onChange: (v: string) => void; placeholder?: string; error?: string;
}) {
  return (
    <div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={cn(
          "w-full h-10 px-3.5 rounded-xl border text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none transition-all",
          error ? "border-[#ef4444] bg-[#fff5f5]" : "border-[#e8eaed] hover:border-[#fd4605] focus:border-[#fd4605] focus:shadow-sm focus:shadow-[#fd4605]/10",
        )} />
      {error && <p className="text-[11px] text-[#ef4444] mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed]">
      <div className="px-6 py-4 border-b border-[#f4f5f7] bg-[#fafafa] rounded-t-2xl">
        <h3 className="text-[14px] font-bold text-[#111827]">
          <span className="text-[#fd4605] mr-1.5">{num}.</span>{title}
        </h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function UploadTrackPage() {
  const router = useRouter();

  // Files
  const [audioFile,       setAudioFile]       = useState<File | null>(null);
  const [coverFile,       setCoverFile]       = useState<File | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const [audioMeta,       setAudioMeta]       = useState<AudioMeta | null>(null);
  const [isPlaying,       setIsPlaying]       = useState(false);
  const [currentTime,     setCurrentTime]     = useState(0);
  const [audioDragging,   setAudioDragging]   = useState(false);
  const [coverDragging,   setCoverDragging]   = useState(false);
  const [fileError,       setFileError]       = useState("");

  const audioInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const audioElRef    = useRef<HTMLAudioElement | null>(null);

  // Track info
  const [title,       setTitle]       = useState("");
  const [artist,      setArtist]      = useState("");
  const [album,       setAlbum]       = useState("");
  const [featuring,   setFeaturing]   = useState("");
  const [genres,      setGenres]      = useState<string[]>([]);
  const [moods,       setMoods]       = useState<string[]>([]);
  const [languages,   setLanguages]   = useState<string[]>([]);
  const [tags,        setTags]        = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [bpm,         setBpm]         = useState("");
  const [key,         setKey]         = useState("");
  const [isrc,        setIsrc]        = useState("");

  // Rights
  const [copyright,       setCopyright]       = useState("");
  const [commercialUse,   setCommercialUse]   = useState(true);
  const [creatorSafe,     setCreatorSafe]     = useState(true);
  const [monetizeSafe,    setMonetizeSafe]    = useState(true);
  const [explicitContent, setExplicit]        = useState(false);
  const [licenseType,     setLicenseType]     = useState("");
  const [region,          setRegion]          = useState("");
  const [usagePerms,      setUsagePerms]      = useState<string[]>(["allow_reels", "allow_stories"]);

  // Content
  const [description, setDescription] = useState("");
  const [lyrics,      setLyrics]      = useState("");

  // Visibility
  const [status,         setStatus]         = useState("draft");
  const [recommended,    setRecommended]    = useState(false);
  const [featured,       setFeatured]       = useState(false);
  const [allowReels,     setAllowReels]     = useState(true);
  const [allowStories,   setAllowStories]   = useState(true);
  const [allowDownloads, setAllowDownloads] = useState(false);
  const [showInStudio,   setShowInStudio]   = useState(true);
  const [showInPicker,   setShowInPicker]   = useState(true);

  // UI
  const [uploading,  setUploading]  = useState(false);
  const [errors,     setErrors]     = useState<Record<string, string>>({});
  const [toast,      setToast]      = useState<{ type: "success" | "error"; msg: string } | null>(null);
  const [uploadPct,  setUploadPct]  = useState(0);

  // Completion checklist
  const checklist = useMemo(() => [
    { label: "Audio file uploaded",         done: !!audioFile },
    { label: "Cover artwork uploaded",      done: !!coverFile },
    { label: "Metadata completed",          done: !!(title && artist && genres.length) },
    { label: "Rights & licensing verified", done: !!(copyright && licenseType) },
    { label: "Content details added",       done: description.length > 10 },
    { label: "Publishing settings set",     done: status !== "" },
  ], [audioFile, coverFile, title, artist, genres, copyright, licenseType, description, status]);

  const completionPct = Math.round((checklist.filter(c => c.done).length / checklist.length) * 100);

  // Attach audio element
  useEffect(() => {
    if (!audioFile) return;
    const url = URL.createObjectURL(audioFile);
    setAudioPreviewUrl(url);
    const el  = new Audio(url);
    audioElRef.current = el;
    el.onloadedmetadata = () => {
      const dur = Math.round(el.duration);
      const br  = dur > 0 ? Math.round((audioFile.size * 8) / (dur * 1000)) : 0;
      setAudioMeta({ duration: dur, size: audioFile.size, format: (audioFile.name.split(".").pop() ?? "mp3").toUpperCase(), bitrate: br, sampleRate: 44100 });
    };
    el.ontimeupdate = () => setCurrentTime(Math.floor(el.currentTime));
    el.onended      = () => { setIsPlaying(false); setCurrentTime(0); };
    return () => { el.pause(); URL.revokeObjectURL(url); };
  }, [audioFile]);

  function togglePlay() {
    const el = audioElRef.current;
    if (!el) return;
    if (isPlaying) { el.pause(); setIsPlaying(false); }
    else           { el.play().catch(() => {}); setIsPlaying(true); }
  }

  function fmtTime(s: number) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }
  function fmtSize(b: number) { return b >= 1048576 ? (b/1048576).toFixed(1)+" MB" : (b/1024).toFixed(0)+" KB"; }

  function generateISRC(): string {
    const yr  = new Date().getFullYear().toString().slice(-2);
    const rnd = Math.random().toString(36).toUpperCase().replace(/[^A-Z0-9]/g,"").slice(0,5).padEnd(5,"0");
    return `RLS${yr}${rnd}`;
  }

  function handleAudioFile(f: File) {
    const ext = f.name.split(".").pop()?.toLowerCase();
    if (!["mp3","wav","aac","flac","ogg","m4a"].includes(ext ?? "")) { setFileError("Unsupported format. Use MP3, WAV, AAC, or FLAC."); return; }
    if (f.size > 200*1024*1024)                                       { setFileError("File too large. Max 200 MB."); return; }
    setFileError(""); setAudioFile(f);
    setIsrc(prev => prev || generateISRC());
  }

  function handleCoverFile(f: File) {
    if (!f.type.startsWith("image/"))      { return; }
    if (f.size > 5*1024*1024)             { return; }
    setCoverFile(f); setCoverPreviewUrl(URL.createObjectURL(f));
  }

  function validate(publish: boolean): boolean {
    const e: Record<string,string> = {};
    if (!audioFile)     e.audio    = "Audio file is required.";
    if (!title.trim())  e.title    = "Track title is required.";
    if (publish) {
      if (!artist.trim())    e.artist    = "Artist name is required to publish.";
      if (!genres.length)    e.genre     = "Genre is required to publish.";
      if (!copyright.trim()) e.copyright = "Copyright owner is required.";
      if (!licenseType)      e.license   = "License type is required.";
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(publish: boolean) {
    if (!validate(publish)) return;
    setUploading(true); setUploadPct(0);
    try {
      const fd = new FormData();
      fd.append("audio_file",           audioFile!);
      if (coverFile) fd.append("cover_image", coverFile);
      fd.append("title",                title);
      fd.append("artist_name",          artist);
      fd.append("album",                album);
      fd.append("featuring_artists",    featuring ? JSON.stringify(featuring.split(",").map(s=>s.trim())) : "[]");
      fd.append("genre",                genres.join(", "));
      fd.append("mood",                 moods.join(", "));
      fd.append("language",             languages.join(", "));
      fd.append("tags",                 tags ? JSON.stringify(tags.split(",").map(s=>s.trim())) : "[]");
      fd.append("release_date",         releaseDate);
      fd.append("bpm",                  bpm);
      fd.append("music_key",            key);
      fd.append("isrc",                 isrc);
      fd.append("copyright_owner",      copyright);
      fd.append("license_type",         licenseType);
      fd.append("usage_permissions",    JSON.stringify(usagePerms));
      fd.append("region_restrictions",  JSON.stringify(region ? [region] : []));
      fd.append("commercial_use_allowed", String(commercialUse));
      fd.append("creator_safe",          String(creatorSafe));
      fd.append("monetization_safe",     String(monetizeSafe));
      fd.append("explicit_content",      String(explicitContent));
      fd.append("description",          description);
      fd.append("lyrics",               lyrics);
      fd.append("status",               publish ? "published" : status);
      fd.append("recommended",          String(recommended));
      fd.append("featured",             String(featured));
      fd.append("allow_reels",          String(allowReels));
      fd.append("allow_stories",        String(allowStories));
      fd.append("allow_downloads",      String(allowDownloads));
      fd.append("show_in_studio",       String(showInStudio));
      fd.append("show_in_upload_picker",String(showInPicker));
      if (audioMeta) {
        fd.append("duration",    String(audioMeta.duration));
        fd.append("bitrate",     String(audioMeta.bitrate));
        fd.append("sample_rate", String(audioMeta.sampleRate));
      }

      await api.post("/admin/music", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        onUploadProgress: (e: { loaded: number; total?: number }) => {
          if (e.total) setUploadPct(Math.round((e.loaded / e.total) * 90));
        },
      });

      setUploadPct(100);
      setToast({ type: "success", msg: publish ? "Track published successfully!" : "Track saved as draft." });
      setTimeout(() => router.push("/admin/music"), 1500);
    } catch (err) {
      setToast({ type: "error", msg: apiMessage(err) });
      setUploading(false); setUploadPct(0);
    }
  }

  return (
    <AdminShell title="Upload Track">
      {/* Toast */}
      {toast && (
        <div className={cn(
          "fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-white text-[13px] font-semibold",
          toast.type === "success" ? "bg-[#22c55e]" : "bg-[#ef4444]",
        )}>
          {toast.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 shrink-0"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Page header */}
      <div className="mb-6">
        <h2 className="text-[22px] font-bold text-[#111827]">Upload Track</h2>
        <p className="text-[13px] text-[#6b7280] mt-1">Upload a new track to the music library and add all the necessary details.</p>
      </div>

      {/* Layout: main (flexible) + right sidebar (fixed width) */}
      <div className="flex gap-6 items-start">

        {/* ── Main ── */}
        <div className="flex-1 min-w-0 space-y-5">

          {/* Top 3 upload cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* 1. Audio */}
            <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
              <p className="text-[13px] font-bold text-[#111827] mb-3">1. Upload Audio File</p>
              <div
                onDragOver={e => { e.preventDefault(); setAudioDragging(true); }}
                onDragLeave={() => setAudioDragging(false)}
                onDrop={e => { e.preventDefault(); setAudioDragging(false); const f = e.dataTransfer.files[0]; if (f) handleAudioFile(f); }}
                onClick={() => audioInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed cursor-pointer transition-all py-8",
                  audioDragging  ? "border-[#fd4605] bg-[#fff8f9] scale-[1.01]" :
                  audioFile      ? "border-[#22c55e] bg-[#f0fdf4]" :
                  fileError      ? "border-[#ef4444] bg-[#fff5f5]" :
                                   "border-[#e8eaed] bg-[#f9fafb] hover:border-[#fd4605] hover:bg-[#fff8f9]",
                )}>
                {audioFile ? (
                  <>
                    <div className="h-11 w-11 rounded-full bg-[#22c55e]/10 grid place-items-center">
                      <Music className="h-5 w-5 text-[#22c55e]" />
                    </div>
                    <p className="text-[12px] font-semibold text-[#16a34a] text-center px-3 truncate max-w-full">{audioFile.name}</p>
                    <p className="text-[11px] text-[#9ca3af]">{fmtSize(audioFile.size)}</p>
                    <button type="button" onClick={e => { e.stopPropagation(); setAudioFile(null); setAudioMeta(null); setAudioPreviewUrl(null); }}
                      className="text-[11px] text-[#ef4444] hover:underline font-medium">
                      Remove file
                    </button>
                  </>
                ) : (
                  <>
                    <div className="h-11 w-11 rounded-full bg-[#f4f5f7] grid place-items-center">
                      <Upload className="h-5 w-5 text-[#9ca3af]" />
                    </div>
                    <p className="text-[12px] font-medium text-[#374151] text-center">Drag & drop your audio file here</p>
                    <p className="text-[11px] text-[#9ca3af]">or</p>
                    <button type="button" className="h-9 px-5 rounded-xl border-2 border-[#fd4605] text-[#fd4605] text-[12px] font-bold hover:bg-[#fff3ec] transition-colors">
                      Browse Files
                    </button>
                  </>
                )}
              </div>
              {fileError && <p className="text-[11px] text-[#ef4444] mt-2 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{fileError}</p>}
              {errors.audio && <p className="text-[11px] text-[#ef4444] mt-2 flex items-center gap-1"><AlertCircle className="h-3 w-3 shrink-0" />{errors.audio}</p>}
              <div className="mt-3 space-y-0.5">
                <p className="text-[11px] text-[#9ca3af]">Supported formats: MP3, WAV, AAC, FLAC</p>
                <p className="text-[11px] text-[#9ca3af]">Max file size: 200MB</p>
              </div>
              <input ref={audioInputRef} type="file" accept=".mp3,.wav,.aac,.flac,.ogg,.m4a" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleAudioFile(f); }} />
            </div>

            {/* 2. Cover */}
            <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
              <p className="text-[13px] font-bold text-[#111827] mb-3">
                2. Cover Artwork <span className="text-[#9ca3af] font-normal text-[12px]">(Optional)</span>
              </p>
              <div
                onDragOver={e => { e.preventDefault(); setCoverDragging(true); }}
                onDragLeave={() => setCoverDragging(false)}
                onDrop={e => { e.preventDefault(); setCoverDragging(false); const f = e.dataTransfer.files[0]; if (f) handleCoverFile(f); }}
                onClick={() => coverInputRef.current?.click()}
                className={cn(
                  "flex flex-col items-center justify-center gap-2.5 rounded-2xl border-2 border-dashed cursor-pointer transition-all",
                  coverPreviewUrl ? "border-[#22c55e] bg-[#f0fdf4] py-4" : "py-8 border-[#e8eaed] bg-[#f9fafb] hover:border-[#fd4605] hover:bg-[#fff8f9]",
                  coverDragging && "scale-[1.01] border-[#fd4605] bg-[#fff8f9]",
                )}>
                {coverPreviewUrl ? (
                  <>
                    <img src={coverPreviewUrl} alt="" className="h-24 w-24 rounded-xl object-cover shadow-md" />
                    <button type="button" onClick={e => { e.stopPropagation(); setCoverFile(null); setCoverPreviewUrl(null); }}
                      className="text-[11px] text-[#ef4444] hover:underline font-medium">Remove</button>
                  </>
                ) : (
                  <>
                    <div className="h-11 w-11 rounded-full bg-[#f4f5f7] grid place-items-center">
                      <ImageIcon className="h-5 w-5 text-[#9ca3af]" />
                    </div>
                    <p className="text-[12px] font-medium text-[#374151] text-center">Drag & drop cover image here</p>
                    <p className="text-[11px] text-[#9ca3af]">or</p>
                    <button type="button" className="h-9 px-5 rounded-xl border border-[#e8eaed] text-[#374151] text-[12px] font-semibold hover:bg-[#f4f5f7] transition-colors">
                      Upload Image
                    </button>
                  </>
                )}
              </div>
              <div className="mt-3 space-y-0.5">
                <p className="text-[11px] text-[#9ca3af]">JPG, PNG, WEBP &middot; Recommended 3000×3000px</p>
                <p className="text-[11px] text-[#9ca3af]">Max file size: 5MB</p>
              </div>
              <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); }} />
            </div>

            {/* 3. Preview */}
            <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
              <p className="text-[13px] font-bold text-[#111827] mb-3">3. Preview</p>
              <div className="bg-gradient-to-br from-[#f9fafb] to-[#f4f5f7] rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <button type="button" onClick={togglePlay} disabled={!audioFile}
                    className={cn(
                      "h-10 w-10 rounded-full grid place-items-center shrink-0 transition-all",
                      audioFile
                        ? "bg-[#fd4605] text-white hover:bg-[#e03e04] shadow-lg shadow-[#fd4605]/30"
                        : "bg-[#e8eaed] text-[#9ca3af] cursor-not-allowed",
                    )}>
                    {isPlaying
                      ? <span className="flex gap-0.5"><span className="w-1 h-4 bg-white rounded-full"/><span className="w-1 h-4 bg-white rounded-full"/></span>
                      : <svg width="12" height="14" viewBox="0 0 12 14" fill="white"><path d="M1 1l10 6-10 6V1z"/></svg>
                    }
                  </button>
                  <Waveform seed={audioFile ? audioFile.size : 99999} playing={isPlaying} />
                </div>
                <div className="flex justify-between text-[11px] text-[#9ca3af] tabular-nums mb-3">
                  <span>{fmtTime(currentTime)}</span>
                  <span>{audioMeta ? fmtTime(audioMeta.duration) : "-"}</span>
                </div>

                {audioMeta ? (
                  <>
                    <div className="flex items-center gap-1.5 mb-2">
                      <p className="text-[11px] font-semibold text-[#374151] truncate flex-1">{audioFile?.name}</p>
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-[#eff6ff] text-[#3b82f6]">Auto-detected</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[fmtTime(audioMeta.duration), fmtSize(audioMeta.size), audioMeta.format, audioMeta.sampleRate+"Hz", audioMeta.bitrate+"kbps"].map(c => (
                        <span key={c} className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-[#e8eaed] text-[#6b7280]">{c}</span>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="text-center py-3">
                    <Music className="h-8 w-8 text-[#e8eaed] mx-auto mb-1" />
                    <p className="text-[11px] text-[#9ca3af]">Upload an audio file to preview</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Section 4: Track Info */}
          <Section num="4" title="Track Information">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label text="Track Title" required />
                  <TextInput value={title} onChange={setTitle} placeholder="Enter track title" error={errors.title} />
                </div>
                <div>
                  <Label text="Artist Name" required />
                  <TextInput value={artist} onChange={setArtist} placeholder="Enter artist name" error={errors.artist} />
                </div>
                <div>
                  <Label text="Album" />
                  <TextInput value={album} onChange={setAlbum} placeholder="Enter album name" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label text="Featuring Artists" />
                  <TextInput value={featuring} onChange={setFeaturing} placeholder="Add featured artists (comma-separated)" />
                </div>
                <div>
                  <MultiDropdown label="Genre *" values={genres} onChange={setGenres} options={GENRE_OPTIONS} placeholder="Select genres" searchable error={errors.genre} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <MultiDropdown label="Mood" values={moods} onChange={setMoods} options={MOOD_OPTIONS} placeholder="Select moods" searchable />
                </div>
                <div>
                  <MultiDropdown label="Language" values={languages} onChange={setLanguages} options={LANGUAGE_OPTIONS} placeholder="Select languages" searchable />
                </div>
                <div>
                  <Label text="Tags" />
                  <TextInput value={tags} onChange={setTags} placeholder="Add tags (comma-separated)" />
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <DatePicker value={releaseDate} onChange={setReleaseDate} label="Release Date" />
                <div>
                  <Label text="BPM" />
                  <input type="number" value={bpm} onChange={e => setBpm(e.target.value)} placeholder="e.g. 120" min={40} max={300}
                    className="w-full h-10 px-3.5 rounded-xl border border-[#e8eaed] text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] transition-colors hover:border-[#fd4605]" />
                </div>
                <div>
                  <Dropdown label="Key" value={key} onChange={setKey} options={KEY_OPTIONS} placeholder="Select key" searchable />
                </div>
                <div>
                  <Label text="ISRC / Track ID" />
                  <TextInput value={isrc} onChange={setIsrc} placeholder="e.g. USRC17607839" />
                </div>
              </div>
            </div>
          </Section>

          {/* Section 5: Rights & Licensing */}
          <Section num="5" title="Rights & Licensing">
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <Label text="Copyright Owner" required />
                  <TextInput value={copyright} onChange={setCopyright} placeholder="Enter copyright owner" error={errors.copyright} />
                </div>
                <div>
                  <Dropdown label="License Type *" value={licenseType} onChange={setLicenseType} options={LICENSE_OPTIONS} placeholder="Select license type" error={errors.license} />
                </div>
                <div>
                  <Dropdown label="Region Restrictions" value={region} onChange={setRegion} options={REGION_OPTIONS} placeholder="Worldwide" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 pt-1">
                <Toggle value={commercialUse}    onChange={setCommercialUse}
                  label="Commercial Use Allowed"
                  sub="Allow this track to be used commercially" />
                <Toggle value={creatorSafe}      onChange={setCreatorSafe}
                  label="Creator-safe / Monetization Safe"
                  sub="This track is safe for monetization" />
                <Toggle value={monetizeSafe}     onChange={setMonetizeSafe}
                  label="Monetization Safe"
                  sub="Allow on monetized content" />
                <Toggle value={explicitContent}  onChange={setExplicit}
                  label="Explicit Content"
                  sub="Contains explicit lyrics or content" />
              </div>

              <div>
                <Label text="Usage Permissions" />
                <div className="flex flex-wrap gap-2">
                  {[
                    { k: "allow_reels",    l: "Allow use in Reels" },
                    { k: "allow_stories",  l: "Allow use in Stories" },
                    { k: "allow_ads",      l: "Allow use in Ads" },
                    { k: "allow_monetized",l: "Allow monetized content" },
                    { k: "platform_only",  l: "Platform only" },
                    { k: "non_commercial", l: "Non-commercial only" },
                  ].map(({ k, l }) => {
                    const on = usagePerms.includes(k);
                    return (
                      <button key={k} type="button"
                        onClick={() => setUsagePerms(p => on ? p.filter(x=>x!==k) : [...p,k])}
                        className={cn(
                          "flex items-center gap-1.5 h-9 px-4 rounded-xl border text-[12px] font-semibold transition-all",
                          on ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605] shadow-sm"
                             : "border-[#e8eaed] bg-white text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605]",
                        )}>
                        {on && <Check className="h-3 w-3 shrink-0" />}
                        {l}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Section>

          {/* Section 6: Content Details */}
          <Section num="6" title="Content Details">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div>
                <Label text="Description" />
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  maxLength={1000} rows={6} placeholder="Enter a short description about the track..."
                  className="w-full px-3.5 py-3 rounded-xl border border-[#e8eaed] text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] resize-none transition-colors hover:border-[#fd4605]" />
                <p className="text-[11px] text-right mt-1 text-[#9ca3af]">{description.length} / 1000</p>
              </div>
              <div>
                <Label text="Lyrics (Optional)" />
                <textarea value={lyrics} onChange={e => setLyrics(e.target.value)}
                  rows={6} placeholder="Enter lyrics (optional)..."
                  className="w-full px-3.5 py-3 rounded-xl border border-[#e8eaed] text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] resize-none transition-colors hover:border-[#fd4605]" />
              </div>
            </div>
          </Section>

          {/* Section 7: Visibility & Publishing */}
          <Section num="7" title="Visibility & Publishing">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              <div>
                <Dropdown label="Status *" value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="" />
              </div>
              <div className="sm:col-span-1 lg:col-span-2 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                  <Toggle value={recommended}    onChange={setRecommended}    label="Recommended"                   sub="Recommend to users on the platform" />
                  <Toggle value={featured}       onChange={setFeatured}       label="Featured Track"                sub="Showcase on the featured section" />
                  <Toggle value={allowReels}     onChange={setAllowReels}     label="Allow Use in Reels"            sub="Users can use in reel uploads" />
                  <Toggle value={allowStories}   onChange={setAllowStories}   label="Allow Use in Stories"          sub="Users can use in story creation" />
                  <Toggle value={allowDownloads} onChange={setAllowDownloads} label="Allow Downloads"               sub="Users can download this track" />
                  <Toggle value={showInStudio}   onChange={setShowInStudio}   label="Show in Studio Music Library"  sub="Visible in Creator Studio" />
                  <Toggle value={showInPicker}   onChange={setShowInPicker}   label="Show in Upload Music Picker"   sub="Visible when users upload content" />
                </div>
              </div>
            </div>
          </Section>

        </div>

        {/* ── Right sidebar ── */}
        <div className="w-[280px] xl:w-[300px] shrink-0 hidden lg:flex flex-col gap-4 sticky top-[80px]">

          {/* Upload Progress */}
          <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
            <p className="text-[14px] font-bold text-[#111827] mb-4">Upload Progress</p>
            <ProgressRing pct={uploading ? uploadPct : completionPct} />
            <div className="mt-4 space-y-2">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-center gap-2.5">
                  <div className={cn(
                    "h-5 w-5 rounded-full grid place-items-center shrink-0 transition-all",
                    item.done ? "bg-[#22c55e] shadow-sm" : "border-2 border-[#e5e7eb]",
                  )}>
                    {item.done && <Check className="h-3 w-3 text-white" />}
                  </div>
                  <p className={cn("text-[12px] leading-snug", item.done ? "text-[#374151] font-medium" : "text-[#9ca3af]")}>
                    {item.label}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Track Summary */}
          <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
            <p className="text-[14px] font-bold text-[#111827] mb-4">Track Summary</p>
            <div className="flex gap-3">
              <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] grid place-items-center">
                {coverPreviewUrl
                  ? <img src={coverPreviewUrl} alt="" className="h-full w-full object-cover" />
                  : <Music className="h-6 w-6 text-[#fd4605]" />}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                {([
                  ["Track Title", title || "-"],
                  ["Artist",      artist || "-"],
                  ["Duration",    audioMeta ? fmtTime(audioMeta.duration) : "-"],
                  ["Genre",       genres.length ? genres.join(", ") : "-"],
                ] as [string,string][]).map(([lbl, val]) => (
                  <div key={lbl}>
                    <p className="text-[10px] text-[#9ca3af] font-medium uppercase tracking-wide leading-none">{lbl}</p>
                    <p className="text-[12px] font-semibold text-[#374151] truncate mt-0.5">{val}</p>
                  </div>
                ))}
                <div>
                  <p className="text-[10px] text-[#9ca3af] font-medium uppercase tracking-wide leading-none">Visibility</p>
                  <span className={cn(
                    "inline-block mt-0.5 text-[11px] font-bold px-2.5 py-0.5 rounded-full",
                    status === "published" ? "bg-[#dcfce7] text-[#16a34a]" :
                    status === "pending"   ? "bg-[#fef9c3] text-[#a16207]" :
                                             "bg-[#f4f5f7] text-[#6b7280]",
                  )}>
                    {STATUS_OPTIONS.find(o=>o.value===status)?.label ?? "Draft"}
                  </span>
                </div>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-[#f4f5f7]">
              <div className="flex justify-between mb-1.5">
                <p className="text-[12px] font-semibold text-[#374151]">Completion</p>
                <p className="text-[12px] font-bold text-[#fd4605]">{completionPct}%</p>
              </div>
              <div className="h-2 rounded-full bg-[#f4f5f7] overflow-hidden">
                <div className="h-full rounded-full bg-[#fd4605] transition-all duration-500" style={{ width: `${completionPct}%` }} />
              </div>
            </div>
          </div>

          {/* Upload Tips */}
          <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
            <p className="text-[14px] font-bold text-[#111827] mb-3">Upload Tips</p>
            <div className="space-y-3">
              {[
                "Use high quality audio files (320kbps or higher)",
                "Add accurate metadata for better discoverability",
                "Ensure you have the rights to distribute",
                "Fill all required fields for faster approval",
              ].map((tip, i) => (
                <div key={i} className="flex items-start gap-2.5">
                  <div className="h-5 w-5 rounded-full bg-[#fff3ec] grid place-items-center shrink-0 mt-0.5">
                    <span className="text-[9px] font-black text-[#fd4605]">{i + 1}</span>
                  </div>
                  <p className="text-[12px] text-[#6b7280] leading-relaxed">{tip}</p>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {/* Sticky bottom bar */}
      <div className="sticky bottom-0 z-20 mt-6 -mx-4 lg:-mx-6 px-4 lg:px-6 py-4 bg-white/95 backdrop-blur-sm border-t border-[#e8eaed] flex items-center justify-between gap-3">
        <button type="button" onClick={() => router.push("/admin/music")} disabled={uploading}
          className="h-10 px-6 rounded-xl border border-[#e8eaed] text-[13px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors disabled:opacity-50">
          Cancel
        </button>
        <div className="flex gap-3">
          <button type="button" onClick={() => handleSubmit(false)} disabled={uploading}
            className="h-10 px-6 rounded-xl border border-[#e8eaed] text-[13px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors disabled:opacity-50 flex items-center gap-2">
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Draft
          </button>
          <button type="button" onClick={() => handleSubmit(true)} disabled={uploading}
            className="h-10 px-6 rounded-xl bg-[#fd4605] text-white text-[13px] font-semibold hover:bg-[#e03e04] transition-colors disabled:opacity-50 active:scale-95 flex items-center gap-2 shadow-sm shadow-[#fd4605]/30">
            {uploading && <Loader2 className="h-4 w-4 animate-spin" />}
            Publish Track
          </button>
        </div>
      </div>
    </AdminShell>
  );
}
