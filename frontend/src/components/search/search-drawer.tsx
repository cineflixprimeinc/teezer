"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Hash, Loader2, Music, Search, UserRound, Video, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import {
  searchService,
  type SearchHashtag,
  type SearchResults,
  type SearchSound,
  type SearchUser,
  type SearchVideo,
} from "@/services/search.service";

// ── Constants ─────────────────────────────────────────────────────────────────

const STORAGE_KEY = "teezer_recent_searches";
const MAX_RECENT  = 8;

const TABS = [
  { id: "all",      label: "All" },
  { id: "users",    label: "Creators" },
  { id: "videos",   label: "Videos" },
  { id: "hashtags", label: "Hashtags" },
  { id: "sounds",   label: "Sounds" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const TRENDING_TAGS = [
  "#viralnepal", "#teezer", "#travelnepal",
  "#music", "#comedy", "#dance", "#fashion", "#food",
];

// ── LocalStorage helpers ──────────────────────────────────────────────────────

function getRecent(): string[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]"); }
  catch { return []; }
}
function saveRecent(list: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, MAX_RECENT)));
}
function pushRecent(term: string) {
  saveRecent([term, ...getRecent().filter((t) => t !== term)]);
}
function dropRecent(term: string) {
  saveRecent(getRecent().filter((t) => t !== term));
}

// ── Tiny helpers ──────────────────────────────────────────────────────────────

function fmt(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Avatar ────────────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full grid place-items-center font-bold text-white bg-[#fd4605] flex-shrink-0 text-sm"
      style={{ width: size, height: size }}
    >
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

// ── Loading skeleton ──────────────────────────────────────────────────────────

function Skeleton() {
  return (
    <div className="px-4 py-3 space-y-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-center gap-3 animate-pulse">
          <div className="h-10 w-10 rounded-full bg-[#f0f0f0] flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-3/5 rounded-full bg-[#f0f0f0]" />
            <div className="h-2.5 w-2/5 rounded-full bg-[#f0f0f0]" />
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Section label ─────────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-4 pt-3 pb-1">
      <span className="text-[#fd4605]">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#6b7280]">{label}</span>
    </div>
  );
}

// ── Result rows ───────────────────────────────────────────────────────────────

function UserRow({ item, onClose }: { item: SearchUser; onClose: () => void }) {
  return (
    <Link
      href={`/profile/${item.username}`}
      onClick={onClose}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fb] transition-colors"
    >
      <Avatar src={item.avatar} name={item.name} size={40} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-semibold text-[#111827] truncate">{item.name}</span>
          {item.verified && <VerifiedBadge size={13} className="flex-shrink-0" />}
        </div>
        <p className="text-[12px] text-[#6b7280] truncate">
          @{item.username} · {fmt(item.followers_count)} followers
        </p>
      </div>
    </Link>
  );
}

function VideoRow({ item, onClose }: { item: SearchVideo; onClose: () => void }) {
  const text = item.caption || item.title || "Untitled video";
  return (
    <Link
      href={`/videos/${item.id}`}
      onClick={onClose}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fb] transition-colors"
    >
      {item.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail_url}
          alt={text}
          className="h-11 w-8 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-11 w-8 rounded-md bg-[#f0f0f0] grid place-items-center flex-shrink-0">
          <Video className="h-3.5 w-3.5 text-[#6b7280]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] truncate">{text}</p>
        <p className="text-[12px] text-[#6b7280] truncate">
          @{item.username} · {fmt(item.views_count)} views
        </p>
      </div>
    </Link>
  );
}

function HashtagRow({ item, onClose }: { item: SearchHashtag; onClose: () => void }) {
  const clean = item.tag.replace(/^#/, "");
  return (
    <Link
      href={`/explore?q=${encodeURIComponent(item.tag)}`}
      onClick={onClose}
      className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fb] transition-colors"
    >
      <div className="h-10 w-10 rounded-full bg-[#f8f9fb] grid place-items-center flex-shrink-0 border border-[#e5e7eb]">
        <Hash className="h-4 w-4 text-[#111827]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827]">#{clean}</p>
        <p className="text-[12px] text-[#6b7280]">{fmt(item.posts_count)} videos</p>
      </div>
    </Link>
  );
}

function SoundRow({ item }: { item: SearchSound }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2.5 hover:bg-[#f8f9fb] transition-colors">
      {item.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover_image}
          alt={item.title}
          className="h-10 w-10 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded-md bg-[#f8f9fb] grid place-items-center flex-shrink-0 border border-[#e5e7eb]">
          <Music className="h-4 w-4 text-[#111827]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[#111827] truncate">{item.title}</p>
        <p className="text-[12px] text-[#6b7280] truncate">
          {item.artist ?? "Unknown artist"} · {fmt(item.reels_count)} reels
        </p>
      </div>
    </div>
  );
}

// ── Main SearchDrawer ─────────────────────────────────────────────────────────

export function SearchDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router      = useRouter();
  const inputRef    = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [query,   setQuery]   = useState("");
  const [tab,     setTab]     = useState<TabId>("all");
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResults>({});
  const [recent,  setRecent]  = useState<string[]>([]);

  /* ── Sync effects ── */

  // Focus input + load recent when drawer opens; reset on close
  useEffect(() => {
    if (open) {
      setRecent(getRecent());
      const t = setTimeout(() => inputRef.current?.focus(), 60);
      return () => clearTimeout(t);
    } else {
      setQuery("");
      setResults({});
      setTab("all");
      setLoading(false);
    }
  }, [open]);

  // ESC key handler
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* ── Search logic ── */

  const doSearch = useCallback(async (q: string, activeTab: TabId) => {
    if (q.trim().length < 2) { setResults({}); setLoading(false); return; }
    setLoading(true);
    try {
      const type = activeTab === "users" ? "users"
        : activeTab === "videos"   ? "videos"
        : activeTab === "hashtags" ? "hashtags"
        : activeTab === "sounds"   ? "sounds"
        : "all";
      const data = await searchService.search(q.trim(), type);
      setResults(data);
    } catch { setResults({}); }
    finally  { setLoading(false); }
  }, []);

  function schedule(q: string, activeTab: TabId, delay = 300) {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (q.trim().length < 2) { setResults({}); setLoading(false); return; }
    setLoading(true);
    debounceRef.current = setTimeout(() => doSearch(q, activeTab), delay);
  }

  function handleInput(val: string) {
    setQuery(val);
    schedule(val, tab);
  }

  function handleTabClick(next: TabId) {
    setTab(next);
    if (query.trim().length >= 2) schedule(query, next, 150);
  }

  /* ── Navigation helpers ── */

  function commitSearch(term: string) {
    const t = term.trim();
    if (!t) return;
    pushRecent(t);
    setRecent(getRecent());
    router.push(`/explore?q=${encodeURIComponent(t)}`);
    onClose();
  }

  function handleRecentClick(term: string) {
    setQuery(term);
    doSearch(term, tab);
  }

  function removeOne(term: string, e: React.MouseEvent) {
    e.stopPropagation();
    dropRecent(term);
    setRecent(getRecent());
  }

  function clearAll() { saveRecent([]); setRecent([]); }

  function handleResultNavigate(searchTerm?: string) {
    if (searchTerm) { pushRecent(searchTerm); setRecent(getRecent()); }
    onClose();
  }

  /* ── Derived state ── */

  const isTyping    = query.trim().length >= 2;
  const hasResults  = isTyping && Object.values(results).some((a) => a && a.length > 0);
  const isEmpty     = isTyping && !loading && !hasResults;
  const users       = results.users    ?? [];
  const videos      = results.videos   ?? [];
  const hashtags    = results.hashtags ?? [];
  const sounds      = results.sounds   ?? [];

  /* ── Render ── */

  return (
    <>
      {/* ── Backdrop ────────────────────────────────────────────────────────── */}
      <div
        aria-hidden
        className="fixed inset-0 lg:left-[72px] z-[39] bg-black/20 lg:bg-transparent transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        onClick={onClose}
      />

      {/* ── Drawer panel ────────────────────────────────────────────────────── */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        className={cn(
          "fixed inset-y-0 z-[40] flex flex-col bg-white shadow-2xl overflow-hidden",
          // position: full-width on mobile, beside sidebar on desktop
          "left-0 w-full",
          "lg:left-[72px] lg:w-[460px]",
          // rounded right corners on desktop
          "lg:rounded-r-2xl",
        )}
        style={{
          transform:   open ? "translateX(0)"     : "translateX(-100%)",
          opacity:     open ? 1                   : 0,
          pointerEvents: open ? "auto"            : "none",
          transition: "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out",
        }}
      >

        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-5 pb-3 flex-shrink-0 border-b border-[#f3f4f6]">
          <span className="text-[16px] font-bold text-[#111827]">Search</span>
          <button
            type="button"
            aria-label="Close search"
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] transition-colors"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Search input */}
        <div className="px-4 pt-3 pb-2 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6b7280] pointer-events-none" />
            <input
              ref={inputRef}
              type="search"
              value={query}
              onChange={(e) => handleInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && query.trim()) commitSearch(query); }}
              placeholder="Search creators, videos, hashtags..."
              autoComplete="off"
              className={cn(
                "h-[42px] w-full rounded-full border bg-[#f8f9fb] pl-10 pr-9 text-[14px] text-[#111827]",
                "placeholder:text-[#9ca3af] outline-none transition-colors",
                "border-[#e5e7eb] focus:border-[#fd4605] focus:bg-white",
                "[appearance:textfield] [&::-webkit-search-cancel-button]:hidden",
              )}
            />
            {loading && (
              <Loader2 className="absolute right-3.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#fd4605] pointer-events-none" />
            )}
            {query && !loading && (
              <button
                type="button"
                aria-label="Clear search"
                onClick={() => { setQuery(""); setResults({}); inputRef.current?.focus(); }}
                className="absolute right-3 top-1/2 -translate-y-1/2 grid h-[20px] w-[20px] place-items-center rounded-full bg-[#9ca3af] text-white hover:bg-[#6b7280] transition-colors"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </div>

        {/* Tabs - only shown when typing */}
        {isTyping && (
          <div className="flex gap-1.5 px-4 pb-2.5 overflow-x-auto hide-scrollbar flex-shrink-0">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => handleTabClick(t.id)}
                className={cn(
                  "flex-shrink-0 rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors",
                  tab === t.id
                    ? "bg-[#fd4605] text-white"
                    : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e5e7eb]",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">

          {/*
            Wikipedia context, above the Teezer results as specified.
            Deliberately outside the `loading`/`hasResults` branches below: it
            fetches on its own clock and renders nothing when the query is not
            a real-world topic, so it must not be gated on Teezer's search
            finishing - nor be able to delay it.
          */}
          {isTyping && (
            <div className="px-4 pt-3">
              <KnowledgeCard query={query} variant="compact" />
            </div>
          )}

          {/* Loading skeleton */}
          {loading && <Skeleton />}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center gap-3 py-14 px-4 text-center">
              <div className="grid h-14 w-14 place-items-center rounded-full bg-[#f3f4f6]">
                <Search className="h-6 w-6 text-[#9ca3af]" />
              </div>
              <p className="text-[14px] font-semibold text-[#111827]">
                No results for &ldquo;{query}&rdquo;
              </p>
              <p className="text-[13px] text-[#6b7280]">
                Try different keywords or check spelling
              </p>
            </div>
          )}

          {/* Results */}
          {!loading && hasResults && (
            <div>
              {/* Creators */}
              {users.length > 0 && (tab === "all" || tab === "users") && (
                <div>
                  <SectionLabel
                    icon={<UserRound className="h-3.5 w-3.5" />}
                    label="Creators"
                  />
                  {users.slice(0, tab === "all" ? 3 : 20).map((u) => (
                    <UserRow key={u.id} item={u} onClose={() => handleResultNavigate(query)} />
                  ))}
                </div>
              )}

              {/* Videos */}
              {videos.length > 0 && (tab === "all" || tab === "videos") && (
                <div>
                  <SectionLabel
                    icon={<Video className="h-3.5 w-3.5" />}
                    label="Videos"
                  />
                  {videos.slice(0, tab === "all" ? 3 : 20).map((v) => (
                    <VideoRow key={v.id} item={v} onClose={() => handleResultNavigate(query)} />
                  ))}
                </div>
              )}

              {/* Hashtags */}
              {hashtags.length > 0 && (tab === "all" || tab === "hashtags") && (
                <div>
                  <SectionLabel
                    icon={<Hash className="h-3.5 w-3.5" />}
                    label="Hashtags"
                  />
                  {hashtags.slice(0, tab === "all" ? 3 : 20).map((h) => (
                    <HashtagRow key={h.id} item={h} onClose={() => handleResultNavigate(query)} />
                  ))}
                </div>
              )}

              {/* Sounds */}
              {sounds.length > 0 && (tab === "all" || tab === "sounds") && (
                <div>
                  <SectionLabel
                    icon={<Music className="h-3.5 w-3.5" />}
                    label="Sounds"
                  />
                  {sounds.slice(0, tab === "all" ? 3 : 20).map((s) => (
                    <SoundRow key={s.id} item={s} />
                  ))}
                </div>
              )}

              {/* View all footer */}
              <div className="border-t border-[#f3f4f6] px-4 py-3">
                <button
                  type="button"
                  onClick={() => commitSearch(query)}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-2 text-[13px] font-semibold text-[#fd4605] hover:bg-[#fff3ec] transition-colors"
                >
                  <Search className="h-3.5 w-3.5" />
                  View all results for &ldquo;{query}&rdquo;
                </button>
              </div>
            </div>
          )}

          {/* Idle state - recent + trending */}
          {!isTyping && (
            <div className="px-4 py-3">

              {/* Recent searches */}
              {recent.length > 0 && (
                <div className="mb-5">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[13px] font-bold text-[#111827]">Recent searches</span>
                    <button
                      type="button"
                      onClick={clearAll}
                      className="text-[12px] font-semibold text-[#fd4605] hover:underline"
                    >
                      Clear all
                    </button>
                  </div>
                  <div className="space-y-0.5">
                    {recent.map((term) => (
                      <div
                        key={term}
                        role="button"
                        tabIndex={0}
                        onClick={() => handleRecentClick(term)}
                        onKeyDown={(e) => e.key === "Enter" && handleRecentClick(term)}
                        className="flex items-center gap-3 rounded-xl px-2 py-2 hover:bg-[#f8f9fb] cursor-pointer transition-colors group"
                      >
                        <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#f3f4f6]">
                          <Search className="h-3.5 w-3.5 text-[#6b7280]" />
                        </div>
                        <span className="flex-1 text-[13px] font-medium text-[#111827] truncate">
                          {term}
                        </span>
                        <button
                          type="button"
                          aria-label={`Remove ${term}`}
                          onClick={(e) => removeOne(term, e)}
                          className="grid h-6 w-6 flex-shrink-0 place-items-center rounded-full text-[#9ca3af] hover:bg-[#e5e7eb] hover:text-[#374151] opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Trending now */}
              <div>
                <span className="block mb-2.5 text-[13px] font-bold text-[#111827]">
                  Trending now
                </span>
                <div className="flex flex-wrap gap-2">
                  {TRENDING_TAGS.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      onClick={() => commitSearch(tag)}
                      className="rounded-full border border-[#e5e7eb] bg-white px-3.5 py-1.5 text-[13px] font-medium text-[#374151] hover:border-[#fd4605] hover:text-[#fd4605] transition-colors"
                    >
                      {tag}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
