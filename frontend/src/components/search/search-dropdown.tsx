"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { Hash, Loader2, Music, Search, UserRound, Video } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import {
  searchService,
  type SearchHashtag,
  type SearchResults,
  type SearchSound,
  type SearchUser,
  type SearchVideo,
} from "@/services/search.service";

// ── Nav-item union used for keyboard navigation ──────────────────────────────

type NavItem =
  | { kind: "user";    data: SearchUser }
  | { kind: "video";   data: SearchVideo }
  | { kind: "hashtag"; data: SearchHashtag }
  | { kind: "sound";   data: SearchSound };

function buildFlatList(results: SearchResults): NavItem[] {
  const flat: NavItem[] = [];
  results.users?.forEach((d)    => flat.push({ kind: "user",    data: d }));
  results.videos?.forEach((d)   => flat.push({ kind: "video",   data: d }));
  results.hashtags?.forEach((d) => flat.push({ kind: "hashtag", data: d }));
  results.sounds?.forEach((d)   => flat.push({ kind: "sound",   data: d }));
  return flat;
}

function navigateTo(item: NavItem, router: ReturnType<typeof useRouter>): void {
  switch (item.kind) {
    case "user":    return void router.push(`/profile/${item.data.username}`);
    case "video":   return void router.push(`/videos/${item.data.id}`);
    case "hashtag": return void router.push(`/explore?q=${encodeURIComponent(item.data.tag)}`);
    case "sound":   return void router.push(`/audio`);
  }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function Avatar({ src, name, size = 36 }: { src: string | null; name: string; size?: number }) {
  const initial = (name?.[0] ?? "?").toUpperCase();
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
      {initial}
    </div>
  );
}

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionLabel({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 pt-2.5 pb-1">
      <span className="text-[#fd4605]">{icon}</span>
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#5f6675]">{label}</span>
    </div>
  );
}

// ── Result rows ───────────────────────────────────────────────────────────────

function UserRow({ item, active }: { item: SearchUser; active: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors", active ? "bg-[#fff3ec]" : "hover:bg-[#f8f9fb]")}>
      <Avatar src={item.avatar} name={item.name} size={36} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="text-[13px] font-semibold text-black truncate">{item.name}</span>
          {item.verified && <VerifiedBadge size={14} className="flex-shrink-0" />}
        </div>
        <p className="text-[12px] text-[#5f6675] truncate">
          @{item.username} · {formatCount(item.followers_count)} followers
        </p>
      </div>
    </div>
  );
}

function VideoRow({ item, active }: { item: SearchVideo; active: boolean }) {
  const text = item.caption || item.title || "Untitled video";
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors", active ? "bg-[#fff3ec]" : "hover:bg-[#f8f9fb]")}>
      {item.thumbnail_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.thumbnail_url}
          alt={text}
          className="h-10 w-[28px] rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-10 w-[28px] rounded-md bg-[#f0f0f0] grid place-items-center flex-shrink-0">
          <Video className="h-3.5 w-3.5 text-[#5f6675]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-black truncate">{text}</p>
        <p className="text-[12px] text-[#5f6675] truncate">
          @{item.username} · {formatCount(item.views_count)} views
        </p>
      </div>
    </div>
  );
}

function HashtagRow({ item, active }: { item: SearchHashtag; active: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors", active ? "bg-[#fff3ec]" : "hover:bg-[#f8f9fb]")}>
      <div className="h-9 w-9 rounded-full bg-[#f8f9fb] grid place-items-center flex-shrink-0 border border-[#eeeeee]">
        <Hash className="h-4 w-4 text-[#111827]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-black">#{item.tag}</p>
        <p className="text-[12px] text-[#5f6675]">{formatCount(item.posts_count)} videos</p>
      </div>
    </div>
  );
}

function SoundRow({ item, active }: { item: SearchSound; active: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5 px-3 py-2 cursor-pointer transition-colors", active ? "bg-[#fff3ec]" : "hover:bg-[#f8f9fb]")}>
      {item.cover_image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={item.cover_image}
          alt={item.title}
          className="h-9 w-9 rounded-md object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-9 w-9 rounded-md bg-[#f8f9fb] grid place-items-center flex-shrink-0 border border-[#eeeeee]">
          <Music className="h-4 w-4 text-[#111827]" />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-black truncate">{item.title}</p>
        <p className="text-[12px] text-[#5f6675] truncate">
          {item.artist ?? "Unknown artist"} · {formatCount(item.reels_count)} reels
        </p>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function SearchDropdown() {
  const router = useRouter();

  const [query,       setQuery]       = useState("");
  const [results,     setResults]     = useState<SearchResults>({});
  const [isLoading,   setIsLoading]   = useState(false);
  const [isOpen,      setIsOpen]      = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const flatItems  = buildFlatList(results);
  const hasResults = flatItems.length > 0;
  const isEmpty    = !isLoading && query.trim().length >= 2 && !hasResults;

  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef     = useRef<HTMLInputElement>(null);
  const debounceRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Debounced search ─────────────────────────────────────────────────────

  const doSearch = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setResults({});
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const data = await searchService.search(q.trim());
      setResults(data);
      setActiveIndex(-1);
    } catch {
      setResults({});
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsOpen(true);

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (val.trim().length < 2) {
      setResults({});
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    debounceRef.current = setTimeout(() => doSearch(val), 275);
  };

  // ── Keyboard navigation ──────────────────────────────────────────────────

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isOpen) return;

    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, -1));
        break;
      case "Enter":
        e.preventDefault();
        if (activeIndex >= 0 && flatItems[activeIndex]) {
          navigateTo(flatItems[activeIndex], router);
          closeDropdown();
        } else if (query.trim().length >= 2) {
          router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
          closeDropdown();
        }
        break;
      case "Escape":
        closeDropdown();
        inputRef.current?.blur();
        break;
    }
  };

  // ── Close on outside click ───────────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setIsOpen(false);
        setActiveIndex(-1);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  function closeDropdown() {
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleItemClick(item: NavItem) {
    navigateTo(item, router);
    closeDropdown();
  }

  const showDropdown = isOpen && query.trim().length >= 2;

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div ref={containerRef} className="relative w-full">
      {/* Input */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#5f6675] pointer-events-none" />
        {isLoading && (
          <Loader2 className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-[#fd4605] pointer-events-none" />
        )}
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query.trim().length >= 2) setIsOpen(true); }}
          placeholder="Search creators, videos, hashtags..."
          autoComplete="off"
          className={cn(
            "h-[42px] w-full rounded-full border bg-white pl-11 pr-10 text-[14px] text-black placeholder:text-[#5f6675]",
            "outline-none transition-colors",
            "border-[#e5e7eb] focus:border-[#fd4605]",
            "[appearance:textfield] [&::-webkit-search-cancel-button]:hidden",
          )}
        />
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute left-0 top-[calc(100%+8px)] z-50 w-full rounded-2xl border border-[#eeeeee] bg-white shadow-xl overflow-hidden">

          {/* Loading skeleton */}
          {isLoading && !hasResults && (
            <div className="px-3 py-4 space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2.5 animate-pulse">
                  <div className="h-9 w-9 rounded-full bg-[#f0f0f0] flex-shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-2/3 rounded bg-[#f0f0f0]" />
                    <div className="h-2.5 w-1/2 rounded bg-[#f0f0f0]" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {isEmpty && (
            <div className="flex flex-col items-center gap-2 py-8 px-3">
              <Search className="h-8 w-8 text-[#e5e7eb]" />
              <p className="text-[13px] font-semibold text-[#111827]">No results for &ldquo;{query}&rdquo;</p>
              <p className="text-[12px] text-[#5f6675]">Try different keywords or check the spelling</p>
            </div>
          )}

          {/* Results */}
          {!isLoading && hasResults && (
            <>
              {/* Creators */}
              {results.users && results.users.length > 0 && (
                <div>
                  <SectionLabel icon={<UserRound className="h-3.5 w-3.5" />} label="Creators" />
                  {results.users.map((u, i) => {
                    const globalIdx = flatItems.findIndex((f) => f.kind === "user" && f.data.id === u.id);
                    return (
                      <div key={u.id} onMouseEnter={() => setActiveIndex(globalIdx)} onMouseDown={() => handleItemClick({ kind: "user", data: u })}>
                        <UserRow item={u} active={activeIndex === globalIdx} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Videos */}
              {results.videos && results.videos.length > 0 && (
                <div>
                  <SectionLabel icon={<Video className="h-3.5 w-3.5" />} label="Videos" />
                  {results.videos.map((v) => {
                    const globalIdx = flatItems.findIndex((f) => f.kind === "video" && f.data.id === v.id);
                    return (
                      <div key={v.id} onMouseEnter={() => setActiveIndex(globalIdx)} onMouseDown={() => handleItemClick({ kind: "video", data: v })}>
                        <VideoRow item={v} active={activeIndex === globalIdx} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Hashtags */}
              {results.hashtags && results.hashtags.length > 0 && (
                <div>
                  <SectionLabel icon={<Hash className="h-3.5 w-3.5" />} label="Hashtags" />
                  {results.hashtags.map((h) => {
                    const globalIdx = flatItems.findIndex((f) => f.kind === "hashtag" && f.data.id === h.id);
                    return (
                      <div key={h.id} onMouseEnter={() => setActiveIndex(globalIdx)} onMouseDown={() => handleItemClick({ kind: "hashtag", data: h })}>
                        <HashtagRow item={h} active={activeIndex === globalIdx} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Sounds */}
              {results.sounds && results.sounds.length > 0 && (
                <div>
                  <SectionLabel icon={<Music className="h-3.5 w-3.5" />} label="Sounds" />
                  {results.sounds.map((s) => {
                    const globalIdx = flatItems.findIndex((f) => f.kind === "sound" && f.data.id === s.id);
                    return (
                      <div key={s.id} onMouseEnter={() => setActiveIndex(globalIdx)} onMouseDown={() => handleItemClick({ kind: "sound", data: s })}>
                        <SoundRow item={s} active={activeIndex === globalIdx} />
                      </div>
                    );
                  })}
                </div>
              )}

              {/* View all */}
              <div className="border-t border-[#eeeeee] px-3 py-2.5">
                <button
                  type="button"
                  onMouseDown={() => {
                    router.push(`/explore?q=${encodeURIComponent(query.trim())}`);
                    closeDropdown();
                  }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl py-1.5 text-[13px] font-semibold text-[#fd4605] hover:bg-[#fff3ec] transition-colors"
                >
                  <Search className="h-3.5 w-3.5" />
                  View all results for &ldquo;{query}&rdquo;
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
