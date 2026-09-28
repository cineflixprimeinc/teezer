"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ChevronDown, Filter, Heart, Loader2, Music,
  Pause, Play, Search, SkipBack, SkipForward, X,
} from "lucide-react";
import { audioService, type AudioTrack } from "@/services/audio.service";
import { cn } from "@/lib/utils";

export type { AudioTrack };

/* ─── Constants ─────────────────────────────────────────────────────────────── */
const RECENTLY_USED_KEY  = "reelsoo_recently_used_music";
const MAX_RECENTLY_USED  = 6;
const FAV_IDS_KEY        = "reelsoo_music_fav_ids";
const FAV_TRACKS_KEY     = "reelsoo_music_fav_tracks";

const TABS = [
  { id: "all",               label: "All Tracks",       params: {} },
  { id: "reelsoo_originals", label: "Teezer Originals", params: { category: "reelsoo_originals" } },
  { id: "trending",          label: "Trending",         params: { category: "trending" } },
  { id: "happy",             label: "Happy",            params: { mood: "Happy" } },
  { id: "chill",             label: "Chill",            params: { mood: "Chill" } },
  { id: "romantic",          label: "Romantic",         params: { mood: "Romantic" } },
  { id: "energetic",         label: "Energetic",        params: { mood: "Energetic" } },
] as const;

const MOOD_OPTIONS     = ["All", "Happy", "Sad", "Chill", "Romantic", "Energetic", "Motivational", "Calm", "Epic / Dramatic"];
const GENRE_OPTIONS    = ["All", "Pop", "Hip-hop", "Electronic", "Rock", "Jazz", "R&B", "Classical", "Indie", "Lo-fi"];
const DURATION_OPTIONS = ["All", "Short (< 1 min)", "Medium (1-3 min)", "Long (> 3 min)"];
const SORT_OPTIONS     = ["Most popular", "Most recent", "Trending", "A-Z"];

const MOOD_COLORS: Record<string, string> = {
  "Epic / Dramatic": "bg-[#fff3ec] text-[#fd4605] border-[#ffdccc]",
  "Romantic":        "bg-[#fdf2f8] text-[#ec4899] border-[#f9a8d4]",
  "Motivational":    "bg-[#fff7ed] text-[#f97316] border-[#fdba74]",
  "Chill":           "bg-[#ecfdf5] text-[#10b981] border-[#6ee7b7]",
  "Happy":           "bg-[#fefce8] text-[#ca8a04] border-[#fde047]",
  "Calm":            "bg-[#eff6ff] text-[#3b82f6] border-[#bfdbfe]",
  "Energetic":       "bg-[#fdf4ff] text-[#a855f7] border-[#d8b4fe]",
  "Sad":             "bg-[#f1f5f9] text-[#64748b] border-[#cbd5e1]",
};

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function fmtDur(s: number | null): string {
  if (!s) return "--:--";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/* ─── Cover art ─────────────────────────────────────────────────────────────── */
function CoverArt({ url, title, size = 9 }: { url: string | null; title: string; size?: number }) {
  const px = size * 4;
  return (
    <div className={`relative shrink-0 overflow-hidden rounded-lg`} style={{ width: px, height: px }}>
      {url
        ? <img src={url} alt={title} className="h-full w-full object-cover" />
        : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-[#2e1640] to-[#0e0814]">
            <Music className="h-4 w-4 text-white/50" />
          </div>
        )}
    </div>
  );
}

/* ─── Mood badge ─────────────────────────────────────────────────────────────── */
function MoodBadge({ mood }: { mood: string | null }) {
  if (!mood) return null;
  const cls = MOOD_COLORS[mood] ?? "bg-[#f4f5f7] text-[#6b7280] border-[#e5e7eb]";
  return (
    <span className={cn("inline-block rounded-full border px-2 py-0.5 text-[10px] font-semibold whitespace-nowrap", cls)}>
      {mood}
    </span>
  );
}

/* ─── Filter dropdown ────────────────────────────────────────────────────────── */
function FilterDropdown({ label, options, value, onChange }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onClick(e: MouseEvent) { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);
  const display = value === "All" ? label : value;
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-medium text-[#374151] hover:border-[#fd4605]/50 transition-colors whitespace-nowrap">
        {display}
        <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", open && "rotate-180")} />
      </button>
      {open && (
        <div className="absolute top-full left-0 z-10 mt-1.5 min-w-[150px] rounded-xl border border-[#e5e7eb] bg-white py-1 shadow-xl shadow-black/10">
          {options.map(opt => (
            <button key={opt} type="button" onClick={() => { onChange(opt); setOpen(false); }}
              className={cn("block w-full px-3 py-2 text-left text-[12px] transition-colors hover:bg-[#f9fafb]",
                value === opt ? "font-bold text-[#fd4605]" : "text-[#374151]")}>
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Props ─────────────────────────────────────────────────────────────────── */
type Props = {
  onClose:      () => void;
  onSelect:     (track: AudioTrack) => void;
  currentTrackId?: number | null;
};

/* ─── Modal ─────────────────────────────────────────────────────────────────── */
export function MusicLibraryModal({ onClose, onSelect, currentTrackId }: Props) {
  /* State */
  const [tab,          setTab]          = useState<string>("all");
  const [search,       setSearch]       = useState("");
  const [mood,         setMood]         = useState("All");
  const [genre,        setGenre]        = useState("All");
  const [duration,     setDuration]     = useState("All");
  const [sort,         setSort]         = useState("Most popular");
  const [tracks,       setTracks]       = useState<AudioTrack[]>([]);
  const [loading,      setLoading]      = useState(false);
  const [page,         setPage]         = useState(1);
  const [lastPage,     setLastPage]     = useState(1);
  const [recentTracks, setRecentTracks] = useState<AudioTrack[]>([]);
  const [favorites,    setFavorites]    = useState<Set<number>>(new Set());
  const [selected,     setSelected]     = useState<AudioTrack | null>(null);

  /* Audio preview */
  const [previewId,   setPreviewId]   = useState<number | null>(null);
  const [isPlaying,   setIsPlaying]   = useState(false);
  const [previewTime, setPreviewTime] = useState(0);
  const [previewDur,  setPreviewDur]  = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* ── Audio element init ─────────────────────────────────────────── */
  useEffect(() => {
    const a = new Audio();
    a.preload = "none";
    a.onplay            = () => setIsPlaying(true);
    a.onpause           = () => setIsPlaying(false);
    a.onended           = () => { setIsPlaying(false); setPreviewTime(0); };
    a.ontimeupdate      = () => setPreviewTime(a.currentTime);
    a.ondurationchange  = () => setPreviewDur(Number.isFinite(a.duration) ? a.duration : 0);
    audioRef.current = a;
    return () => { a.pause(); a.src = ""; };
  }, []);

  /* ── Load favorites from localStorage (same keys as Studio) ───── */
  useEffect(() => {
    try {
      const ids: number[] = JSON.parse(localStorage.getItem(FAV_IDS_KEY) ?? "[]");
      setFavorites(new Set(ids));
    } catch { /* ignore */ }
  }, []);

  /* ── Fetch recently used ────────────────────────────────────────── */
  useEffect(() => {
    try {
      const ids: number[] = JSON.parse(localStorage.getItem(RECENTLY_USED_KEY) ?? "[]");
      if (!ids.length) return;
      audioService.getTracks({ page: 1 }).then(res => {
        const all = res.data.data;
        const recent = ids.map(id => all.find(t => t.id === id)).filter(Boolean) as AudioTrack[];
        setRecentTracks(recent);
      }).catch(() => {});
    } catch { /* ignore */ }
  }, []);

  /* ── Fetch tracks ───────────────────────────────────────────────── */
  const fetchTracks = useCallback(async (p: number, reset: boolean) => {
    setLoading(true);
    try {
      const tabEntry = TABS.find(t => t.id === tab);
      const params: Record<string, string | number> = { ...(tabEntry?.params ?? {}), page: p };
      if (search)              params.search = search;
      if (mood !== "All")      params.mood   = mood;
      if (genre !== "All")     params.genre  = genre;
      if (duration !== "All") {
        if (duration.includes("< 1")) params.duration = "short";
        else if (duration.includes("1")) params.duration = "medium";
        else params.duration = "long";
      }
      const res = await audioService.getTracks(params as Parameters<typeof audioService.getTracks>[0]);
      const items = res.data.data;
      setTracks(prev => reset ? items : [...prev, ...items]);
      setLastPage(res.data.last_page);
      setPage(p);
    } catch { /* silent */ }
    finally { setLoading(false); }
  }, [tab, search, mood, genre, duration]);

  useEffect(() => { void fetchTracks(1, true); }, [fetchTracks]);

  /* ── Init selected ──────────────────────────────────────────────── */
  useEffect(() => {
    if (!currentTrackId) return;
    const found = tracks.find(t => t.id === currentTrackId);
    if (found) setSelected(found);
  }, [currentTrackId, tracks]);

  /* ── Search with debounce ───────────────────────────────────────── */
  function handleSearchChange(v: string) {
    setSearch(v);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => { void fetchTracks(1, true); }, 350);
  }

  /* ── Audio preview ──────────────────────────────────────────────── */
  function togglePreview(track: AudioTrack) {
    const a = audioRef.current;
    if (!a) return;
    if (previewId === track.id) {
      if (a.paused) a.play().catch(() => {}); else a.pause();
    } else {
      a.pause();
      a.src = track.audio_url;
      a.load();
      setPreviewId(track.id);
      setPreviewTime(0); setPreviewDur(0);
      a.play().catch(() => {});
      audioService.logPlay(track.id, "upload-picker").catch(() => {});
    }
  }

  function stopPreview() {
    const a = audioRef.current;
    if (!a) return;
    a.pause(); a.src = "";
    setPreviewId(null); setIsPlaying(false);
    setPreviewTime(0); setPreviewDur(0);
  }

  function seekBy(delta: number) {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(previewDur, a.currentTime + delta));
  }

  /* ── Favorite ───────────────────────────────────────────────────── */
  function handleFav(id: number, e: React.MouseEvent) {
    e.stopPropagation();
    const wasFav = favorites.has(id);
    const track  = tracks.find(t => t.id === id) ?? recentTracks.find(t => t.id === id);

    setFavorites(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });

    // Sync to localStorage so Studio Music Library "Favorites" tab sees it
    try {
      const ids: number[]                        = JSON.parse(localStorage.getItem(FAV_IDS_KEY) ?? "[]");
      const map: Record<number, AudioTrack>      = JSON.parse(localStorage.getItem(FAV_TRACKS_KEY) ?? "{}");
      if (wasFav) {
        localStorage.setItem(FAV_IDS_KEY,    JSON.stringify(ids.filter(i => i !== id)));
        delete map[id];
        localStorage.setItem(FAV_TRACKS_KEY, JSON.stringify(map));
      } else if (track) {
        localStorage.setItem(FAV_IDS_KEY,    JSON.stringify([id, ...ids.filter(i => i !== id)]));
        map[id] = track;
        localStorage.setItem(FAV_TRACKS_KEY, JSON.stringify(map));
      }
    } catch { /* ignore */ }

    // Also persist to server (best-effort)
    audioService.toggleFavorite(id).catch(() => {
      // Revert optimistic update on server failure only
    });
  }

  /* ── Use sound ──────────────────────────────────────────────────── */
  function handleUse(track: AudioTrack) {
    try {
      const ids: number[] = JSON.parse(localStorage.getItem(RECENTLY_USED_KEY) ?? "[]");
      const next = [track.id, ...ids.filter(id => id !== track.id)].slice(0, MAX_RECENTLY_USED);
      localStorage.setItem(RECENTLY_USED_KEY, JSON.stringify(next));
    } catch { /* ignore */ }
    audioService.logUsage(track.id, "video").catch(() => {});
    stopPreview();
    onSelect(track);
  }

  const previewTrack = previewId !== null
    ? (tracks.find(t => t.id === previewId) ?? recentTracks.find(t => t.id === previewId) ?? null)
    : null;
  const progressPct = previewDur > 0 ? (previewTime / previewDur) * 100 : 0;

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="fixed inset-0 z-[900] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={() => { stopPreview(); onClose(); }} />

      {/* Panel */}
      <div
        className="relative z-10 flex w-full max-w-[880px] flex-col rounded-2xl bg-white shadow-2xl shadow-black/25"
        style={{ maxHeight: "min(88vh, 740px)" }}
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex shrink-0 items-center gap-3 border-b border-[#f0f0f0] px-6 py-4">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fff3ec]">
            <Music className="h-5 w-5 text-[#fd4605]" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-bold text-[#111827]">Music Library</h2>
            <p className="text-[11px] text-[#9ca3af]">Choose the perfect sound for your content</p>
          </div>
          <button type="button" onClick={() => { stopPreview(); onClose(); }}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f4f5f7] hover:text-[#374151] transition-colors">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>

        {/* Search */}
        <div className="shrink-0 border-b border-[#f0f0f0] px-6 py-3">
          <div className="flex items-center gap-2.5 rounded-xl border border-[#e5e7eb] bg-[#f9fafb] px-3.5 py-2.5 focus-within:border-[#fd4605] focus-within:bg-white transition-colors">
            <Search className="h-4 w-4 shrink-0 text-[#9ca3af]" />
            <input type="text" value={search} onChange={e => handleSearchChange(e.target.value)}
              placeholder="Search by track, artist, mood or keyword..."
              className="flex-1 bg-transparent text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af]" />
            {search && (
              <button type="button" onClick={() => handleSearchChange("")}
                className="shrink-0 text-[#9ca3af] hover:text-[#374151] transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Filters */}
        <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[#f0f0f0] px-6 py-3">
          <FilterDropdown label="Mood"     options={MOOD_OPTIONS}     value={mood}     onChange={v => { setMood(v); void fetchTracks(1, true); }} />
          <FilterDropdown label="Genre"    options={GENRE_OPTIONS}    value={genre}    onChange={v => { setGenre(v); void fetchTracks(1, true); }} />
          <FilterDropdown label="Duration" options={DURATION_OPTIONS} value={duration} onChange={v => { setDuration(v); void fetchTracks(1, true); }} />
          <FilterDropdown label={`Sort: ${sort}`} options={SORT_OPTIONS} value={sort} onChange={setSort} />
          <button type="button"
            className="ml-auto flex items-center gap-1.5 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-[12px] font-medium text-[#374151] hover:border-[#fd4605]/50 transition-colors">
            <Filter className="h-3.5 w-3.5" /> Filter
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 overflow-x-auto border-b border-[#f0f0f0] px-6"
          style={{ scrollbarWidth: "none" }}>
          {TABS.map(t => (
            <button key={t.id} type="button"
              onClick={() => { setTab(t.id); void fetchTracks(1, true); }}
              className={cn(
                "shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-[13px] font-semibold transition-colors",
                tab === t.id
                  ? "border-[#fd4605] text-[#fd4605]"
                  : "border-transparent text-[#6b7280] hover:text-[#374151]"
              )}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>

          {/* Recently used */}
          {recentTracks.length > 0 && !search && (
            <div className="border-b border-[#f0f0f0] px-6 py-4">
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-widest text-[#9ca3af]">Recently used</span>
                <button type="button" className="text-[11px] font-semibold text-[#fd4605] hover:underline">View all</button>
              </div>
              <div className="flex gap-3 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                {recentTracks.slice(0, 3).map(track => {
                  const isPreviewing = previewId === track.id;
                  return (
                    <button key={track.id} type="button" onClick={() => togglePreview(track)}
                      className={cn(
                        "group relative flex w-[160px] shrink-0 items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all",
                        isPreviewing
                          ? "border-[#fd4605] bg-[#fff3ec]"
                          : "border-[#e5e7eb] bg-[#f9fafb] hover:border-[#fd4605]/50 hover:bg-[#fff8f9]"
                      )}>
                      <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg">
                        <CoverArt url={track.cover_url} title={track.title} />
                        <div className={cn(
                          "absolute inset-0 flex items-center justify-center bg-black/35 opacity-0 transition-opacity",
                          isPreviewing ? "opacity-100" : "group-hover:opacity-100"
                        )}>
                          {isPreviewing && isPlaying
                            ? <Pause className="h-4 w-4 fill-white text-white" />
                            : <Play className="h-3.5 w-3.5 fill-white text-white ml-0.5" />}
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-semibold text-[#111827] leading-tight">{track.title}</p>
                        <p className="truncate text-[10px] text-[#9ca3af]">{track.artist ?? "Teezer"}</p>
                        <p className="text-[9px] text-[#c4c9d4] mt-0.5">{fmtDur(track.duration)}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Track list */}
          <div>
            {/* Column headers */}
            <div className="grid items-center gap-3 border-b border-[#f4f5f7] px-6 py-2.5"
              style={{ gridTemplateColumns: "1fr 140px 120px 70px 96px" }}>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Track</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Artist</span>
              <span className="text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Mood</span>
              <span className="text-right text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Duration</span>
              <span />
            </div>

            {/* Loading */}
            {loading && tracks.length === 0 && (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-[#fd4605]" />
              </div>
            )}

            {/* Empty */}
            {!loading && tracks.length === 0 && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Music className="mb-3 h-9 w-9 text-[#e5e7eb]" />
                <p className="text-[13px] font-semibold text-[#374151]">No tracks found</p>
                <p className="mt-1 text-[12px] text-[#9ca3af]">Try adjusting your filters or search term</p>
              </div>
            )}

            {/* Rows */}
            {tracks.map(track => {
              const isPreviewing = previewId === track.id;
              const isSelected   = selected?.id === track.id || currentTrackId === track.id;
              const isFav        = favorites.has(track.id) || (track.is_favorited ?? false);
              return (
                <div key={track.id}
                  className={cn(
                    "grid items-center gap-3 border-b border-[#f9fafb] px-6 py-3 transition-colors",
                    isSelected ? "bg-[#fff3ec]" : "hover:bg-[#fafafa]"
                  )}
                  style={{ gridTemplateColumns: "1fr 140px 120px 70px 96px" }}>

                  {/* Track info - title only */}
                  <div className="flex min-w-0 items-center gap-3">
                    <button type="button" onClick={() => togglePreview(track)}
                      className={cn(
                        "grid h-8 w-8 shrink-0 place-items-center rounded-full border transition-all active:scale-95",
                        isPreviewing && isPlaying
                          ? "border-[#fd4605] bg-[#fd4605] text-white shadow-md shadow-[#fd4605]/25"
                          : "border-[#e5e7eb] text-[#6b7280] hover:border-[#fd4605] hover:text-[#fd4605]"
                      )}>
                      {isPreviewing && isPlaying
                        ? <Pause className="h-3.5 w-3.5 fill-current" />
                        : <Play className="ml-0.5 h-3.5 w-3.5 fill-current" />}
                    </button>
                    <CoverArt url={track.cover_url} title={track.title} />
                    <p className="truncate text-[13px] font-semibold text-[#111827]">{track.title}</p>
                  </div>

                  {/* Artist */}
                  <p className="truncate text-[12px] text-[#6b7280]">{track.artist ?? "Teezer"}</p>

                  {/* Mood */}
                  <div className="flex items-center overflow-hidden">
                    <MoodBadge mood={track.mood} />
                  </div>

                  {/* Duration + fav */}
                  <div className="flex items-center justify-end gap-2">
                    <button type="button" onClick={e => handleFav(track.id, e)}
                      className="transition-transform hover:scale-110 active:scale-95">
                      <Heart className={cn("h-3.5 w-3.5 transition-colors", isFav ? "fill-[#fd4605] text-[#fd4605]" : "text-[#d1d5db] hover:text-[#fd4605]")} />
                    </button>
                    <span className="text-[11px] tabular-nums text-[#6b7280]">{fmtDur(track.duration)}</span>
                  </div>

                  {/* Use sound */}
                  <div className="flex justify-end">
                    <button type="button" onClick={() => handleUse(track)}
                      className="h-8 rounded-xl bg-[#fd4605] px-3.5 text-[12px] font-bold text-white shadow-sm hover:bg-[#e03e04] active:scale-[0.97] transition-all">
                      Use sound
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Load more */}
            {page < lastPage && (
              <div className="flex justify-center py-5">
                <button type="button" disabled={loading}
                  onClick={() => void fetchTracks(page + 1, false)}
                  className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] px-5 py-2.5 text-[12px] font-semibold text-[#374151] hover:border-[#fd4605]/50 transition-colors disabled:opacity-50">
                  {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  Load more tracks
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Mini player (while previewing) */}
        {previewTrack && (
          <div className="shrink-0 border-t border-[#f0f0f0] bg-white px-6 py-3.5">
            <div className="flex items-center gap-3">
              <CoverArt url={previewTrack.cover_url} title={previewTrack.title} size={10} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-bold text-[#111827]">{previewTrack.title}</p>
                <div className="mt-1 flex items-center gap-2.5">
                  {/* Progress bar */}
                  <div
                    className="h-1 flex-1 cursor-pointer overflow-hidden rounded-full bg-[#f0f0f0]"
                    onClick={e => {
                      const a = audioRef.current;
                      if (!a || !previewDur) return;
                      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                      a.currentTime = ((e.clientX - rect.left) / rect.width) * previewDur;
                    }}>
                    <div className="h-full rounded-full bg-[#fd4605] transition-[width]"
                      style={{ width: `${progressPct}%` }} />
                  </div>
                  <span className="shrink-0 text-[10px] tabular-nums text-[#9ca3af]">
                    {fmtDur(Math.floor(previewTime))} / {fmtDur(Math.floor(previewDur))}
                  </span>
                </div>
              </div>
              {/* Controls */}
              <div className="flex shrink-0 items-center gap-1">
                <button type="button" onClick={() => seekBy(-10)}
                  className="grid h-7 w-7 place-items-center rounded-full text-[#9ca3af] hover:text-[#374151] transition-colors">
                  <SkipBack className="h-3.5 w-3.5" />
                </button>
                <button type="button" onClick={() => togglePreview(previewTrack)}
                  className="grid h-9 w-9 place-items-center rounded-full bg-[#fd4605] text-white hover:bg-[#e03e04] transition-colors active:scale-95 shadow-md shadow-[#fd4605]/25">
                  {isPlaying
                    ? <Pause className="h-4 w-4 fill-current" />
                    : <Play className="ml-0.5 h-4 w-4 fill-current" />}
                </button>
                <button type="button" onClick={() => seekBy(10)}
                  className="grid h-7 w-7 place-items-center rounded-full text-[#9ca3af] hover:text-[#374151] transition-colors">
                  <SkipForward className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#f0f0f0] px-6 py-4">
          <button type="button" onClick={() => { stopPreview(); onClose(); }}
            className="h-9 rounded-xl border border-[#e5e7eb] px-5 text-[13px] font-semibold text-[#374151] hover:bg-[#f4f5f7] transition-colors">
            Cancel
          </button>
          {selected && (
            <button type="button" onClick={() => handleUse(selected)}
              className="h-9 rounded-xl bg-[#fd4605] px-5 text-[13px] font-bold text-white shadow-md shadow-[#fd4605]/25 hover:bg-[#e03e04] active:scale-[0.98] transition-all">
              Use selected sound
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
