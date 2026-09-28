"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight,
  Image as ImageIcon, Loader2, Music, Pause, Play, Search, X,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { api, apiMessage } from "@/services/api";
import { cn } from "@/lib/utils";

// ─── Constants (same as upload page) ─────────────────────────────────────────

const GENRE_OPTIONS = [
  "Pop","Hip-hop","R&B / Soul","Electronic / EDM","Dance","Rock",
  "Indie / Alternative","Jazz","Classical","Folk / Acoustic","Country","Reggae",
  "Lo-fi","Cinematic / Film Score","Ambient","Instrumental","Nepali",
  "Hindi / Bollywood","Latin","Afrobeats","K-Pop","J-Pop","Gospel / Worship",
  "Blues","Punk","Metal","Trap","Drill","House","Techno","Drum & Bass","SFX",
];

const MOOD_OPTIONS = [
  "Happy","Chill","Romantic","Motivational","Sad / Melancholy","Energetic",
  "Peaceful","Dark / Mysterious","Epic / Dramatic","Workout / Pump-up",
  "Vlog / Casual","Travel / Adventure","Calm / Relaxing","Party / Festive",
  "Study / Focus","Morning Vibes","Nostalgic","Dreamy","Angry / Intense",
  "Uplifting","Spiritual","Suspenseful","Playful / Fun","Romantic / Love","Cinematic",
];

const LANGUAGE_OPTIONS = [
  "English","Nepali","Hindi","Spanish","French","Portuguese","Arabic","Bengali",
  "Chinese (Mandarin)","Chinese (Cantonese)","Dutch","German","Greek","Gujarati",
  "Hebrew","Indonesian","Italian","Japanese","Kannada","Korean","Malay","Malayalam",
  "Marathi","Punjabi","Russian","Swahili","Swedish","Tagalog / Filipino","Tamil",
  "Telugu","Thai","Turkish","Ukrainian","Urdu","Vietnamese","Instrumental / No Lyrics",
];

const KEY_OPTIONS = [
  "C Major","C Minor","C# / Db Major","C# / Db Minor","D Major","D Minor",
  "D# / Eb Major","D# / Eb Minor","E Major","E Minor","F Major","F Minor",
  "F# / Gb Major","F# / Gb Minor","G Major","G Minor","G# / Ab Major","G# / Ab Minor",
  "A Major","A Minor","A# / Bb Major","A# / Bb Minor","B Major","B Minor",
];

const LICENSE_OPTIONS = [
  { value: "teezer_licensed",  label: "Teezer Licensed",   desc: "Licensed exclusively for Teezer platform" },
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
  { value: "worldwide",  label: "Worldwide",  desc: "Available in all regions" },
  { value: "us_only",    label: "US Only",    desc: "Limited to United States" },
  { value: "eu_only",    label: "EU Only",    desc: "Limited to European Union" },
  { value: "asia_only",  label: "Asia Only",  desc: "Limited to Asian countries" },
  { value: "exclude_us", label: "Exclude US", desc: "Available everywhere except US" },
  { value: "exclude_eu", label: "Exclude EU", desc: "Available everywhere except EU" },
  { value: "custom",     label: "Custom",     desc: "Specific regions defined separately" },
];

const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];
const DAYS   = ["Su","Mo","Tu","We","Th","Fr","Sa"];

// ─── Types ────────────────────────────────────────────────────────────────────

type OptionItem = { value: string; label: string; desc?: string };

// ─── Custom dropdown ──────────────────────────────────────────────────────────

function Dropdown({ label, value, options, onChange, placeholder, searchable, error }: {
  label?: string; value: string; options: (string | OptionItem)[];
  onChange: (v: string) => void; placeholder?: string; searchable?: boolean; error?: string;
}) {
  const [open, setOpen]   = useState(false);
  const [query, setQuery] = useState("");
  const ref   = useRef<HTMLDivElement>(null);
  const inRef = useRef<HTMLInputElement>(null);

  const normalized: OptionItem[] = options.map(o =>
    typeof o === "string" ? { value: o, label: o } : o
  );
  const filtered = query ? normalized.filter(o => o.label.toLowerCase().includes(query.toLowerCase())) : normalized;
  const selected = normalized.find(o => o.value === value);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) { setOpen(false); setQuery(""); }
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  useEffect(() => { if (open && searchable) setTimeout(() => inRef.current?.focus(), 50); }, [open, searchable]);

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 50 : undefined }}>
      {label && <p className="text-[12px] font-semibold text-[#374151] mb-1.5">{label}</p>}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn(
          "w-full flex items-center justify-between gap-2 h-10 px-3.5 rounded-xl border text-[13px] transition-all text-left",
          error ? "border-[#ef4444] bg-[#fff5f5]" :
          open  ? "border-[#fd4605] bg-white shadow-sm shadow-[#fd4605]/10" :
                  "border-[#e8eaed] bg-white hover:border-[#fd4605] hover:shadow-sm",
        )}>
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
                <input ref={inRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search…"
                  className="w-full h-8 pl-8 pr-3 rounded-xl bg-[#f9fafb] border border-[#e8eaed] text-[12px] text-[#111827] outline-none focus:border-[#fd4605] transition-colors" />
              </div>
            </div>
          )}
          <div className="py-1.5 max-h-56 overflow-y-auto">
            {value && (
              <button type="button" onClick={() => { onChange(""); setOpen(false); setQuery(""); }}
                className="w-full flex items-center gap-2.5 px-3.5 py-2 text-[12px] text-[#9ca3af] hover:bg-[#f9fafb] transition-colors">
                <X className="h-3.5 w-3.5" /> Clear selection
              </button>
            )}
            {filtered.length === 0
              ? <p className="text-center py-4 text-[12px] text-[#9ca3af]">No results</p>
              : filtered.map(o => (
                <button key={o.value} type="button"
                  onClick={() => { onChange(o.value); setOpen(false); setQuery(""); }}
                  className={cn("w-full flex items-start gap-3 px-3.5 py-2.5 transition-colors text-left",
                    value === o.value ? "bg-[#fff3ec]" : "hover:bg-[#f9fafb]")}>
                  <div className={cn("mt-0.5 h-4 w-4 rounded-full border-2 shrink-0 grid place-items-center",
                    value === o.value ? "border-[#fd4605] bg-[#fd4605]" : "border-[#d1d5db]")}>
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

// ─── Date picker ──────────────────────────────────────────────────────────────

function DatePicker({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const [open, setOpen] = useState(false);
  const ref             = useRef<HTMLDivElement>(null);
  const today           = new Date();
  const parsed          = value ? new Date(value) : null;

  const [viewYear, setViewYear] = useState(parsed?.getFullYear() ?? today.getFullYear());
  const [viewMon,  setViewMon]  = useState(parsed?.getMonth()    ?? today.getMonth());

  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h); return () => document.removeEventListener("mousedown", h);
  }, []);

  function prevMonth() { if (viewMon === 0) { setViewMon(11); setViewYear(y => y - 1); } else setViewMon(m => m - 1); }
  function nextMonth() { if (viewMon === 11) { setViewMon(0); setViewYear(y => y + 1); } else setViewMon(m => m + 1); }

  const firstDay  = new Date(viewYear, viewMon, 1).getDay();
  const daysInMon = new Date(viewYear, viewMon + 1, 0).getDate();
  const cells     = Array.from({ length: firstDay + daysInMon }, (_, i) => (i < firstDay ? null : i - firstDay + 1));

  function selectDay(d: number) {
    const m = String(viewMon + 1).padStart(2, "0"), dd = String(d).padStart(2, "0");
    onChange(`${viewYear}-${m}-${dd}`); setOpen(false);
  }

  const displayVal = parsed ? parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

  return (
    <div ref={ref} className="relative" style={{ zIndex: open ? 50 : undefined }}>
      {label && <p className="text-[12px] font-semibold text-[#374151] mb-1.5">{label}</p>}
      <button type="button" onClick={() => setOpen(o => !o)}
        className={cn("w-full flex items-center gap-2.5 h-10 px-3.5 rounded-xl border text-[13px] transition-all",
          open ? "border-[#fd4605] shadow-sm bg-white" : "border-[#e8eaed] bg-white hover:border-[#fd4605]")}>
        <CalendarDays className="h-4 w-4 text-[#9ca3af] shrink-0" />
        <span className={displayVal ? "text-[#111827] font-medium" : "text-[#9ca3af]"}>{displayVal || "Select date"}</span>
        {value && <button type="button" onClick={e => { e.stopPropagation(); onChange(""); }} className="ml-auto text-[#9ca3af] hover:text-[#374151] shrink-0"><X className="h-3.5 w-3.5" /></button>}
      </button>

      {open && (
        <div className="absolute top-full left-0 z-[60] mt-2 bg-white rounded-2xl border border-[#e8eaed] shadow-2xl p-4 w-72">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth} className="h-7 w-7 rounded-lg border border-[#e8eaed] grid place-items-center hover:bg-[#f4f5f7] text-[#6b7280] transition-colors"><ChevronLeft className="h-4 w-4" /></button>
            <p className="text-[13px] font-bold text-[#111827]">{MONTHS[viewMon]} {viewYear}</p>
            <button type="button" onClick={nextMonth} className="h-7 w-7 rounded-lg border border-[#e8eaed] grid place-items-center hover:bg-[#f4f5f7] text-[#6b7280] transition-colors"><ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="grid grid-cols-7 mb-1">
            {DAYS.map(d => <div key={d} className="text-center text-[10px] font-bold text-[#9ca3af] py-1">{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5">
            {cells.map((d, i) => {
              if (!d) return <div key={i} />;
              const isTod = d === today.getDate() && viewMon === today.getMonth() && viewYear === today.getFullYear();
              const isSel = parsed && d === parsed.getDate() && viewMon === parsed.getMonth() && viewYear === parsed.getFullYear();
              return (
                <button key={i} type="button" onClick={() => selectDay(d)}
                  className={cn("h-8 w-8 mx-auto rounded-full text-[12px] font-medium transition-all",
                    isSel  ? "bg-[#fd4605] text-white font-bold shadow-sm" :
                    isTod  ? "border-2 border-[#fd4605] text-[#fd4605] font-bold" :
                             "text-[#374151] hover:bg-[#fff3ec] hover:text-[#fd4605]")}>
                  {d}
                </button>
              );
            })}
          </div>
          <div className="flex gap-2 mt-3 pt-3 border-t border-[#f4f5f7]">
            <button type="button" onClick={() => { const t = today; onChange(`${t.getFullYear()}-${String(t.getMonth()+1).padStart(2,"0")}-${String(t.getDate()).padStart(2,"0")}`); setOpen(false); }}
              className="flex-1 h-7 rounded-lg bg-[#f9fafb] border border-[#e8eaed] text-[11px] font-semibold text-[#374151] hover:bg-[#f0f0f0] transition-colors">Today</button>
            <button type="button" onClick={() => { onChange(""); setOpen(false); }}
              className="flex-1 h-7 rounded-lg bg-[#f9fafb] border border-[#e8eaed] text-[11px] font-semibold text-[#9ca3af] hover:bg-[#f0f0f0] transition-colors">Clear</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Toggle ───────────────────────────────────────────────────────────────────

function Toggle({ value, onChange, label, sub }: { value: boolean; onChange: (v: boolean) => void; label: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        {sub && <p className="text-[11px] text-[#9ca3af] mt-0.5 leading-relaxed">{sub}</p>}
      </div>
      <button type="button" onClick={() => onChange(!value)}
        className={cn("relative inline-flex h-6 w-11 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200 mt-0.5",
          value ? "bg-[#fd4605]" : "bg-[#e5e7eb]")}>
        <span className={cn("pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow transition-transform duration-200",
          value ? "translate-x-5" : "translate-x-0")} />
      </button>
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────

function Label({ text, required }: { text: string; required?: boolean }) {
  return <p className="text-[12px] font-semibold text-[#374151] mb-1.5">{text}{required && <span className="text-[#fd4605] ml-0.5">*</span>}</p>;
}

function TextInput({ value, onChange, placeholder, error }: { value: string; onChange: (v: string) => void; placeholder?: string; error?: string }) {
  return (
    <div>
      <input type="text" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className={cn("w-full h-10 px-3.5 rounded-xl border text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none transition-all",
          error ? "border-[#ef4444] bg-[#fff5f5]" : "border-[#e8eaed] hover:border-[#fd4605] focus:border-[#fd4605] focus:shadow-sm focus:shadow-[#fd4605]/10")} />
      {error && <p className="text-[11px] text-[#ef4444] mt-1 flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  );
}

function Section({ num, title, children }: { num: string; title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e8eaed]">
      <div className="px-6 py-4 border-b border-[#f4f5f7] bg-[#fafafa] rounded-t-2xl">
        <h3 className="text-[14px] font-bold text-[#111827]"><span className="text-[#fd4605] mr-1.5">{num}.</span>{title}</h3>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────

function PageSkeleton() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="grid grid-cols-3 gap-4">
        {[1,2,3].map(i => <div key={i} className="h-64 rounded-2xl bg-[#f0f0f0]" />)}
      </div>
      {[1,2,3,4].map(i => <div key={i} className="h-48 rounded-2xl bg-[#f0f0f0]" />)}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function EditTrackPage() {
  const router = useRouter();
  const params = useParams();
  const id     = params?.id as string;

  const [loadingTrack, setLoadingTrack] = useState(true);
  const [notFound,     setNotFound]     = useState(false);

  // Existing media
  const [existingAudioUrl, setExistingAudioUrl] = useState("");
  const [existingCoverUrl, setExistingCoverUrl] = useState("");
  const [existingDuration, setExistingDuration] = useState<number | null>(null);
  const [existingFormat,   setExistingFormat]   = useState("");
  const [previewPlaying,   setPreviewPlaying]   = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  function togglePreview() {
    if (!existingAudioUrl) return;
    if (previewPlaying && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
      return;
    }
    if (!previewAudioRef.current) {
      const a = new Audio(existingAudioUrl);
      a.onended = () => setPreviewPlaying(false);
      previewAudioRef.current = a;
    }
    previewAudioRef.current.play().catch(() => { setPreviewPlaying(false); });
    setPreviewPlaying(true);
  }

  // New cover file (optional replacement)
  const [coverFile,       setCoverFile]       = useState<File | null>(null);
  const [coverPreviewUrl, setCoverPreviewUrl] = useState<string | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // Track info
  const [title,       setTitle]       = useState("");
  const [artist,      setArtist]      = useState("");
  const [album,       setAlbum]       = useState("");
  const [featuring,   setFeaturing]   = useState("");
  const [genre,       setGenre]       = useState("");
  const [mood,        setMood]        = useState("");
  const [language,    setLanguage]    = useState("");
  const [tags,        setTags]        = useState("");
  const [releaseDate, setReleaseDate] = useState("");
  const [bpm,         setBpm]         = useState("");
  const [key,         setKey]         = useState("");
  const [isrc,        setIsrc]        = useState("");

  // Rights
  const [copyright,       setCopyright]     = useState("");
  const [commercialUse,   setCommercialUse] = useState(true);
  const [creatorSafe,     setCreatorSafe]   = useState(true);
  const [monetizeSafe,    setMonetizeSafe]  = useState(true);
  const [explicitContent, setExplicit]      = useState(false);
  const [licenseType,     setLicenseType]   = useState("");
  const [region,          setRegion]        = useState("");
  const [usagePerms,      setUsagePerms]    = useState<string[]>(["allow_reels","allow_stories"]);

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
  const [saving,  setSaving]  = useState(false);
  const [errors,  setErrors]  = useState<Record<string,string>>({});
  const [toast,   setToast]   = useState<{ type: "success"|"error"; msg: string } | null>(null);

  function fmtTime(s: number) { return `${String(Math.floor(s/60)).padStart(2,"0")}:${String(s%60).padStart(2,"0")}`; }

  // Fetch existing track
  useEffect(() => {
    if (!id) return;
    api.get(`/admin/music/${id}`)
      .then(res => {
        const t = res.data?.data ?? res.data;
        setTitle(t.title ?? "");
        setArtist(t.artist_name ?? "");
        setAlbum(t.album ?? "");
        setFeaturing(Array.isArray(t.featuring_artists) ? t.featuring_artists.join(", ") : "");
        setGenre(t.genre ?? "");
        setMood(t.mood ?? "");
        setLanguage(t.language ?? "");
        setTags(Array.isArray(t.tags) ? t.tags.join(", ") : "");
        setReleaseDate(t.release_date ?? "");
        setBpm(t.bpm ? String(t.bpm) : "");
        setKey(t.music_key ?? "");
        setIsrc(t.isrc ?? "");
        setCopyright(t.copyright_owner ?? "");
        setLicenseType(t.license_type ?? "");
        setRegion(Array.isArray(t.region_restrictions) && t.region_restrictions.length ? t.region_restrictions[0] : "");
        setCommercialUse(t.commercial_use_allowed !== false);
        setCreatorSafe(t.creator_safe !== false);
        setMonetizeSafe(t.monetization_safe !== false);
        setExplicit(!!t.explicit_content);
        setUsagePerms(Array.isArray(t.usage_permissions) ? t.usage_permissions : []);
        setDescription(t.description ?? "");
        setLyrics(t.lyrics ?? "");
        setStatus(t.status ?? "draft");
        setRecommended(!!t.recommended);
        setFeatured(!!t.featured);
        setAllowReels(t.allow_reels !== false);
        setAllowStories(t.allow_stories !== false);
        setAllowDownloads(!!t.allow_downloads);
        setShowInStudio(t.show_in_studio !== false);
        setShowInPicker(t.show_in_upload_picker !== false);
        setExistingAudioUrl(t.audio_url ?? "");
        setExistingCoverUrl(t.cover_url ?? "");
        setExistingDuration(t.duration ?? null);
        setExistingFormat(t.format ?? "");
      })
      .catch(err => {
        if (err?.response?.status === 404) setNotFound(true);
      })
      .finally(() => setLoadingTrack(false));
  }, [id]);

  function handleCoverFile(f: File) {
    if (!f.type.startsWith("image/") || f.size > 5*1024*1024) return;
    setCoverFile(f); setCoverPreviewUrl(URL.createObjectURL(f));
  }

  function validate(): boolean {
    const e: Record<string,string> = {};
    if (!title.trim()) e.title = "Track title is required.";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave(publish?: boolean) {
    if (!validate()) return;
    setSaving(true);
    try {
      const fd = new FormData();
      if (coverFile) fd.append("cover_image", coverFile);
      fd.append("title",               title);
      fd.append("artist_name",         artist);
      fd.append("album",               album);
      fd.append("featuring_artists",   featuring ? JSON.stringify(featuring.split(",").map(s=>s.trim())) : "[]");
      fd.append("genre",               genre);
      fd.append("mood",                mood);
      fd.append("language",            language);
      fd.append("tags",                tags ? JSON.stringify(tags.split(",").map(s=>s.trim())) : "[]");
      fd.append("release_date",        releaseDate);
      fd.append("bpm",                 bpm);
      fd.append("music_key",           key);
      fd.append("isrc",                isrc);
      fd.append("copyright_owner",     copyright);
      fd.append("license_type",        licenseType);
      fd.append("usage_permissions",   JSON.stringify(usagePerms));
      fd.append("region_restrictions", JSON.stringify(region ? [region] : []));
      fd.append("commercial_use_allowed", String(commercialUse));
      fd.append("creator_safe",          String(creatorSafe));
      fd.append("monetization_safe",     String(monetizeSafe));
      fd.append("explicit_content",      String(explicitContent));
      fd.append("description",         description);
      fd.append("lyrics",              lyrics);
      fd.append("status",              publish ? "published" : status);
      fd.append("recommended",         String(recommended));
      fd.append("featured",            String(featured));
      fd.append("allow_reels",         String(allowReels));
      fd.append("allow_stories",       String(allowStories));
      fd.append("allow_downloads",     String(allowDownloads));
      fd.append("show_in_studio",      String(showInStudio));
      fd.append("show_in_upload_picker", String(showInPicker));
      fd.append("_method",             "PUT");

      await api.post(`/admin/music/${id}`, fd, { headers: { "Content-Type": "multipart/form-data" } });

      setToast({ type: "success", msg: publish ? "Track published!" : "Changes saved." });
      setTimeout(() => router.push("/music"), 1400);
    } catch (err) {
      setToast({ type: "error", msg: apiMessage(err) });
    } finally {
      setSaving(false);
    }
  }

  const coverDisplay = coverPreviewUrl ?? existingCoverUrl ?? null;

  if (notFound) {
    return (
      <AdminShell title="Edit Track">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="h-14 w-14 rounded-2xl bg-[#fff3ec] grid place-items-center mb-4"><Music className="h-7 w-7 text-[#fd4605]" /></div>
          <h2 className="text-[18px] font-bold text-[#111827]">Track not found</h2>
          <p className="text-[13px] text-[#9ca3af] mt-1">This track may have been deleted.</p>
          <button onClick={() => router.push("/music")} className="mt-5 h-9 px-5 rounded-xl bg-[#fd4605] text-white text-[13px] font-semibold hover:bg-[#e03e04] transition-colors">
            Back to Music Library
          </button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title="Edit Track">
      {/* Toast */}
      {toast && (
        <div className={cn("fixed top-5 right-5 z-[100] flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-2xl text-white text-[13px] font-semibold",
          toast.type === "success" ? "bg-[#22c55e]" : "bg-[#ef4444]")}>
          {toast.type === "success" ? <Check className="h-4 w-4 shrink-0" /> : <AlertCircle className="h-4 w-4 shrink-0" />}
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-2 opacity-70 hover:opacity-100 shrink-0"><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.push("/music")}
          className="h-9 w-9 rounded-xl border border-[#e8eaed] grid place-items-center text-[#6b7280] hover:border-[#fd4605] hover:text-[#fd4605] transition-colors">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div>
          <h2 className="text-[22px] font-bold text-[#111827]">Edit Track{title ? ` - ${title}` : ""}</h2>
          <p className="text-[13px] text-[#6b7280] mt-0.5">Update track metadata, cover art, and publishing settings.</p>
        </div>
      </div>

      {loadingTrack ? <PageSkeleton /> : (
        <>
          <div className="flex gap-6 items-start">
            {/* ── Main ── */}
            <div className="flex-1 min-w-0 space-y-5">

              {/* Top cards: Existing audio + Cover replacement */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

                {/* Existing audio */}
                <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
                  <p className="text-[13px] font-bold text-[#111827] mb-3">Audio File</p>
                  <div className="bg-gradient-to-br from-[#f9fafb] to-[#f4f5f7] rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="h-10 w-10 rounded-full bg-[#fd4605]/10 grid place-items-center shrink-0">
                        <Music className="h-5 w-5 text-[#fd4605]" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-[12px] font-semibold text-[#374151]">Existing audio</p>
                        <p className="text-[11px] text-[#9ca3af] mt-0.5">To replace audio, delete this track and re-upload.</p>
                      </div>
                    </div>
                    {existingAudioUrl ? (
                      <div className="flex flex-wrap items-center gap-1.5 mt-1">
                        {existingDuration && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-[#e8eaed] text-[#6b7280]">{fmtTime(existingDuration)}</span>}
                        {existingFormat   && <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white border border-[#e8eaed] text-[#6b7280]">{existingFormat.toUpperCase()}</span>}
                        <button type="button" onClick={togglePreview}
                          className={cn("inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full border transition-colors",
                            previewPlaying
                              ? "bg-[#fd4605] border-[#fd4605] text-white"
                              : "bg-white border-[#e8eaed] text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605]")}>
                          {previewPlaying ? <><Pause className="h-2.5 w-2.5 fill-current" /> Pause</> : <><Play className="h-2.5 w-2.5 fill-current ml-px" /> Play</>}
                        </button>
                        <a href={existingAudioUrl} target="_blank" rel="noreferrer"
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-[#eff6ff] border border-[#bfdbfe] text-[#3b82f6] hover:bg-[#dbeafe] transition-colors">
                          Open audio ↗
                        </a>
                      </div>
                    ) : (
                      <p className="text-[12px] text-[#9ca3af]">No audio on record.</p>
                    )}
                  </div>
                </div>

                {/* Cover replacement */}
                <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
                  <p className="text-[13px] font-bold text-[#111827] mb-3">
                    Cover Artwork <span className="text-[#9ca3af] font-normal text-[12px]">(click to replace)</span>
                  </p>
                  <div
                    onClick={() => coverInputRef.current?.click()}
                    className="flex items-center gap-4 rounded-2xl border-2 border-dashed border-[#e8eaed] p-4 cursor-pointer hover:border-[#fd4605] hover:bg-[#fff8f9] transition-all">
                    <div className="h-20 w-20 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] grid place-items-center">
                      {coverDisplay
                        ? <img src={coverDisplay} alt="" className="h-full w-full object-cover" />
                        : <ImageIcon className="h-6 w-6 text-[#fd4605]" />}
                    </div>
                    <div>
                      <p className="text-[13px] font-semibold text-[#374151]">{coverFile ? "New cover selected" : existingCoverUrl ? "Current cover" : "No cover uploaded"}</p>
                      <p className="text-[11px] text-[#9ca3af] mt-0.5">JPG, PNG or WEBP · Max 5MB</p>
                      {coverFile && (
                        <button type="button" onClick={e => { e.stopPropagation(); setCoverFile(null); setCoverPreviewUrl(null); }}
                          className="mt-1.5 text-[11px] text-[#ef4444] hover:underline font-medium">
                          Remove new cover
                        </button>
                      )}
                    </div>
                  </div>
                  <input ref={coverInputRef} type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleCoverFile(f); }} />
                </div>
              </div>

              {/* Track info */}
              <Section num="1" title="Track Information">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><Label text="Track Title" required /><TextInput value={title} onChange={setTitle} placeholder="Enter track title" error={errors.title} /></div>
                    <div><Label text="Artist Name" /><TextInput value={artist} onChange={setArtist} placeholder="Enter artist name" /></div>
                    <div><Label text="Album" /><TextInput value={album} onChange={setAlbum} placeholder="Enter album name" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div><Label text="Featuring Artists" /><TextInput value={featuring} onChange={setFeaturing} placeholder="Comma-separated" /></div>
                    <div><Dropdown label="Genre" value={genre} onChange={setGenre} options={GENRE_OPTIONS} placeholder="Select genre" searchable /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><Dropdown label="Mood" value={mood} onChange={setMood} options={MOOD_OPTIONS} placeholder="Select mood" searchable /></div>
                    <div><Dropdown label="Language" value={language} onChange={setLanguage} options={LANGUAGE_OPTIONS} placeholder="Select language" searchable /></div>
                    <div><Label text="Tags" /><TextInput value={tags} onChange={setTags} placeholder="Comma-separated" /></div>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <DatePicker value={releaseDate} onChange={setReleaseDate} label="Release Date" />
                    <div>
                      <Label text="BPM" />
                      <input type="number" value={bpm} onChange={e => setBpm(e.target.value)} placeholder="e.g. 120" min={40} max={300}
                        className="w-full h-10 px-3.5 rounded-xl border border-[#e8eaed] text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] transition-colors hover:border-[#fd4605]" />
                    </div>
                    <div><Dropdown label="Key" value={key} onChange={setKey} options={KEY_OPTIONS} placeholder="Select key" searchable /></div>
                    <div><Label text="ISRC / Track ID" /><TextInput value={isrc} onChange={setIsrc} placeholder="e.g. USRC17607839" /></div>
                  </div>
                </div>
              </Section>

              {/* Rights & Licensing */}
              <Section num="2" title="Rights & Licensing">
                <div className="space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div><Label text="Copyright Owner" /><TextInput value={copyright} onChange={setCopyright} placeholder="Copyright owner" /></div>
                    <div><Dropdown label="License Type" value={licenseType} onChange={setLicenseType} options={LICENSE_OPTIONS} placeholder="Select license" /></div>
                    <div><Dropdown label="Region Restrictions" value={region} onChange={setRegion} options={REGION_OPTIONS} placeholder="Worldwide" /></div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-8 gap-y-3 pt-1">
                    <Toggle value={commercialUse}    onChange={setCommercialUse}  label="Commercial Use Allowed"   sub="Allow commercial use of this track" />
                    <Toggle value={creatorSafe}      onChange={setCreatorSafe}    label="Creator-safe"             sub="Safe for creator monetization" />
                    <Toggle value={monetizeSafe}     onChange={setMonetizeSafe}   label="Monetization Safe"        sub="Safe on monetized content" />
                    <Toggle value={explicitContent}  onChange={setExplicit}       label="Explicit Content"         sub="Contains explicit content" />
                  </div>
                  <div>
                    <Label text="Usage Permissions" />
                    <div className="flex flex-wrap gap-2">
                      {[
                        { k: "allow_reels",    l: "Allow Reels"     },
                        { k: "allow_stories",  l: "Allow Stories"   },
                        { k: "allow_ads",      l: "Allow Ads"       },
                        { k: "allow_monetized",l: "Monetized OK"    },
                        { k: "platform_only",  l: "Platform only"   },
                        { k: "non_commercial", l: "Non-commercial"  },
                      ].map(({ k, l }) => {
                        const on = usagePerms.includes(k);
                        return (
                          <button key={k} type="button"
                            onClick={() => setUsagePerms(p => on ? p.filter(x=>x!==k) : [...p,k])}
                            className={cn("flex items-center gap-1.5 h-9 px-4 rounded-xl border text-[12px] font-semibold transition-all",
                              on ? "border-[#fd4605] bg-[#fff3ec] text-[#fd4605] shadow-sm"
                                 : "border-[#e8eaed] bg-white text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605]")}>
                            {on && <Check className="h-3 w-3 shrink-0" />}
                            {l}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </Section>

              {/* Content Details */}
              <Section num="3" title="Content Details">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  <div>
                    <Label text="Description" />
                    <textarea value={description} onChange={e => setDescription(e.target.value)} maxLength={1000} rows={6}
                      placeholder="Short description about the track..."
                      className="w-full px-3.5 py-3 rounded-xl border border-[#e8eaed] text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] resize-none transition-colors hover:border-[#fd4605]" />
                    <p className="text-[11px] text-right mt-1 text-[#9ca3af]">{description.length} / 1000</p>
                  </div>
                  <div>
                    <Label text="Lyrics" />
                    <textarea value={lyrics} onChange={e => setLyrics(e.target.value)} rows={6} placeholder="Lyrics (optional)..."
                      className="w-full px-3.5 py-3 rounded-xl border border-[#e8eaed] text-[13px] text-[#111827] placeholder:text-[#c4c9d4] outline-none focus:border-[#fd4605] resize-none transition-colors hover:border-[#fd4605]" />
                  </div>
                </div>
              </Section>

              {/* Visibility */}
              <Section num="4" title="Visibility & Publishing">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  <div><Dropdown label="Status" value={status} onChange={setStatus} options={STATUS_OPTIONS} placeholder="" /></div>
                  <div className="sm:col-span-1 lg:col-span-2 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-1">
                      <Toggle value={recommended}    onChange={setRecommended}    label="Recommended"                   sub="Recommend to users" />
                      <Toggle value={featured}       onChange={setFeatured}       label="Featured Track"                sub="Showcase on featured section" />
                      <Toggle value={allowReels}     onChange={setAllowReels}     label="Allow in Reels"                sub="Users can use in reel uploads" />
                      <Toggle value={allowStories}   onChange={setAllowStories}   label="Allow in Stories"              sub="Users can use in stories" />
                      <Toggle value={allowDownloads} onChange={setAllowDownloads} label="Allow Downloads"               sub="Users can download" />
                      <Toggle value={showInStudio}   onChange={setShowInStudio}   label="Show in Studio Library"        sub="Visible in Creator Studio" />
                      <Toggle value={showInPicker}   onChange={setShowInPicker}   label="Show in Upload Picker"         sub="Visible when uploading content" />
                    </div>
                  </div>
                </div>
              </Section>

            </div>

            {/* ── Right sidebar ── */}
            <div className="w-[280px] xl:w-[300px] shrink-0 hidden lg:flex flex-col gap-4 sticky top-[80px]">
              <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
                <p className="text-[14px] font-bold text-[#111827] mb-4">Track Preview</p>
                <div className="flex gap-3">
                  <div className="h-16 w-16 shrink-0 rounded-xl overflow-hidden bg-gradient-to-br from-[#ffdccc] to-[#fff0e8] grid place-items-center">
                    {coverDisplay ? <img src={coverDisplay} alt="" className="h-full w-full object-cover" /> : <Music className="h-6 w-6 text-[#fd4605]" />}
                  </div>
                  <div className="min-w-0 space-y-2">
                    {([["Title", title||"-"], ["Artist", artist||"-"], ["Genre", genre||"-"], ["Duration", existingDuration ? fmtTime(existingDuration) : "-"]] as [string,string][]).map(([l,v]) => (
                      <div key={l}>
                        <p className="text-[10px] text-[#9ca3af] font-medium uppercase tracking-wide leading-none">{l}</p>
                        <p className="text-[12px] font-semibold text-[#374151] truncate mt-0.5">{v}</p>
                      </div>
                    ))}
                    <span className={cn("inline-block text-[11px] font-bold px-2.5 py-0.5 rounded-full",
                      status==="published" ? "bg-[#dcfce7] text-[#16a34a]" : status==="pending" ? "bg-[#fef9c3] text-[#a16207]" : "bg-[#f4f5f7] text-[#6b7280]")}>
                      {STATUS_OPTIONS.find(o=>o.value===status)?.label ?? "Draft"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-[#e8eaed] p-5">
                <p className="text-[14px] font-bold text-[#111827] mb-3">Edit Notes</p>
                <div className="space-y-3">
                  {["Audio file cannot be replaced - delete and re-upload to change audio.", "Cover image can be replaced without re-uploading audio.", "Saving updates the track immediately in the library."].map((tip,i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="h-5 w-5 rounded-full bg-[#fff3ec] grid place-items-center shrink-0 mt-0.5">
                        <span className="text-[9px] font-black text-[#fd4605]">{i+1}</span>
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
            <button type="button" onClick={() => router.push("/music")} disabled={saving}
              className="h-10 px-6 rounded-xl border border-[#e8eaed] text-[13px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors disabled:opacity-50">
              Cancel
            </button>
            <div className="flex gap-3">
              <button type="button" onClick={() => handleSave(false)} disabled={saving}
                className="h-10 px-6 rounded-xl border border-[#e8eaed] text-[13px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors disabled:opacity-50 flex items-center gap-2">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Save Changes
              </button>
              <button type="button" onClick={() => handleSave(true)} disabled={saving}
                className="h-10 px-6 rounded-xl bg-[#fd4605] text-white text-[13px] font-semibold hover:bg-[#e03e04] transition-colors disabled:opacity-50 active:scale-95 flex items-center gap-2 shadow-sm shadow-[#fd4605]/30">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                Publish Track
              </button>
            </div>
          </div>
        </>
      )}
    </AdminShell>
  );
}
