"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft, MapPin, Share2, Play, Images, ChevronDown, Compass, MoreVertical, Link2, Flag,
  LayoutGrid, Video, Image as ImageIcon, Calendar, CalendarClock, CalendarRange, CalendarDays,
  Flame, Heart, Eye, RefreshCw, type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api } from "@/services/api";
import { formatCompact, cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { FollowButton } from "@/components/user/follow-button";
import { KnowledgeCard } from "@/components/knowledge/knowledge-card";
import type { ReelsooVideo } from "@/types/video";

type NearbyCreator = {
  id: number; username: string; name: string; avatar: string | null;
  is_verified: boolean; is_following: boolean; followers_count: number;
  posts_count: number; location: string | null;
};

type LocationHeader = {
  slug: string;
  display_name: string;
  name: string;
  region: string | null;
  posts_count: number;
  views_count: number;
  creators_count: number;
};

type Tab = "popular" | "recent" | "nearby";

type Opt = { value: string; label: string; Icon: LucideIcon };

const TYPE_OPTS: Opt[] = [
  { value: "all",   label: "All content", Icon: LayoutGrid },
  { value: "video", label: "Videos",      Icon: Video },
  { value: "photo", label: "Photos",      Icon: ImageIcon },
];
const TIME_OPTS: Opt[] = [
  { value: "all",   label: "All time",   Icon: Calendar },
  { value: "today", label: "Today",      Icon: CalendarClock },
  { value: "week",  label: "This week",  Icon: CalendarRange },
  { value: "month", label: "This month", Icon: CalendarDays },
];
const SORT_OPTS: Opt[] = [
  { value: "popular",     label: "Most popular", Icon: Flame },
  { value: "most_liked",  label: "Most liked",   Icon: Heart },
  { value: "most_viewed", label: "Most viewed",  Icon: Eye },
];

function Dropdown({ value, options, onChange }: {
  value: string; options: Opt[]; onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((o) => o.value === value) ?? options[0];
  const CurrentIcon = current.Icon;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex h-9 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-3.5 text-[13px] font-semibold text-[#111827] hover:border-[#fd4605]"
      >
        <CurrentIcon className="h-4 w-4 text-[#6b7280]" />
        {current.label}
        <ChevronDown className="h-3.5 w-3.5 text-[#9aa1ad]" />
      </button>
      {open && (
        <>
          <button className="fixed inset-0 z-20 cursor-default" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-full z-30 mt-1.5 min-w-[170px] rounded-xl border border-[#eeeeee] bg-white py-1 shadow-lg">
            {options.map((o) => {
              const OptIcon = o.Icon;
              const active = o.value === value;
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { onChange(o.value); setOpen(false); }}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[13px] hover:bg-[#f7f7f8]",
                    active ? "font-bold text-[#fd4605]" : "font-medium text-[#111827]",
                  )}
                >
                  <OptIcon className={cn("h-4 w-4 flex-shrink-0", active ? "text-[#fd4605]" : "text-[#6b7280]")} />
                  {o.label}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function LocationFeedPage() {
  const router = useRouter();
  const params = useParams<{ slug: string }>();
  const slug   = params?.slug ?? "";

  const [tab,  setTab]  = useState<Tab>("popular");
  const [menuOpen, setMenuOpen] = useState(false);
  const [type, setType] = useState("all");
  const [time, setTime] = useState("all");
  const [sort, setSort] = useState("popular");

  const [header,  setHeader]  = useState<LocationHeader | null>(null);
  const [items,   setItems]   = useState<ReelsooVideo[]>([]);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);

  // Recent tab forces recency sort; Popular uses the sort dropdown.
  const effectiveSort = tab === "recent" ? "recent" : sort;

  const fetchPage = useCallback(async (p: number, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true);
    try {
      const { data } = await api.get(`/locations/${slug}/videos`, {
        params: { type, time, sort: effectiveSort, page: p, per_page: 24 },
      });
      const list: ReelsooVideo[] = data?.data ?? [];
      setHeader(data?.location ?? null);
      setItems((prev) => (append ? [...prev, ...list] : list));
      setHasMore(Boolean(data?.meta?.next_page_url));
      setPage(p);
    } catch {
      if (!append) { setItems([]); setHasMore(false); }
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, [slug, type, time, effectiveSort]);

  // Refetch from page 1 whenever the location or any filter changes.
  useEffect(() => { void fetchPage(1, false); }, [fetchPage]);

  // Top creators + about derived from the loaded posts (saved-location data only).
  const topCreators = useMemo(() => {
    const seen = new Map<string, ReelsooVideo["user"]>();
    for (const v of items) {
      if (v.user?.username && !seen.has(v.user.username)) seen.set(v.user.username, v.user);
      if (seen.size >= 5) break;
    }
    return Array.from(seen.values());
  }, [items]);

  return (
    <div className="min-h-screen bg-[#f8f9fb] text-[#111827]">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-[#eeeeee] bg-[#f8f9fb]/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3 px-4 py-3">
          <button
            type="button"
            onClick={() => router.back()}
            aria-label="Back"
            className="grid h-9 w-9 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#111827] hover:border-[#fd4605] hover:text-[#fd4605]"
          >
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[18px] font-bold">Location feed</h1>
        </div>
      </div>

      <div className="mx-auto max-w-[1180px] px-4 py-5">
        {/* ── Location header card ── */}
        <div className="rounded-2xl border border-[#eeeeee] bg-white p-5">
          <div className="flex flex-wrap items-start gap-4">
            <div className="grid h-[72px] w-[72px] flex-shrink-0 place-items-center rounded-2xl bg-[#fff3ec]">
              <MapPin className="h-8 w-8 text-[#fd4605]" />
            </div>
            <div className="min-w-0 flex-1">
              <h2 className="text-[24px] font-extrabold leading-tight">{header?.name ?? deslug(slug)}</h2>
              {header?.region && <p className="text-[13px] text-[#6b7280]">{header.region}</p>}
              <p className="mt-1 text-[13.5px] text-[#6b7280]">
                Popular videos from {header?.name ?? deslug(slug)}. Explore what&apos;s happening around you.
              </p>
              <div className="mt-3 flex flex-wrap gap-6">
                <Stat label="Videos"   value={header?.posts_count ?? 0} />
                <Stat label="Creators" value={header?.creators_count ?? 0} />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  const q = encodeURIComponent(header?.display_name ?? deslug(slug));
                  window.open(`https://www.google.com/maps/search/?api=1&query=${q}`, "_blank", "noopener,noreferrer");
                }}
                className="flex h-10 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 text-[13px] font-semibold hover:border-[#fd4605]"
              >
                <Compass className="h-4 w-4" /> Open map
              </button>
              <button
                type="button"
                onClick={() => navigator.share?.({ title: header?.display_name, url: window.location.href }).catch(() => {})}
                aria-label="Share location"
                className="grid h-10 w-10 place-items-center rounded-full border border-[#e5e7eb] bg-white hover:border-[#fd4605]"
              >
                <Share2 className="h-4 w-4" />
              </button>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((o) => !o)}
                  aria-label="More"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  className="grid h-10 w-10 place-items-center rounded-full border border-[#e5e7eb] bg-white hover:border-[#fd4605]"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
                {menuOpen && (
                  <>
                    <button className="fixed inset-0 z-30 cursor-default" onClick={() => setMenuOpen(false)} aria-hidden />
                    <div className="absolute right-0 top-full z-40 mt-1.5 w-[180px] overflow-hidden rounded-xl border border-[#eeeeee] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(window.location.href);
                          toast.success("Link copied");
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#111827] hover:bg-[#f7f7f8]"
                      >
                        <Link2 className="h-4 w-4 text-[#6b7280]" /> Copy link
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.share?.({ title: header?.display_name, url: window.location.href }).catch(() => {});
                          setMenuOpen(false);
                        }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#111827] hover:bg-[#f7f7f8]"
                      >
                        <Share2 className="h-4 w-4 text-[#6b7280]" /> Share location
                      </button>
                      <div className="my-1 border-t border-[#f1f1f2]" />
                      <button
                        type="button"
                        onClick={() => { toast.success("Thanks - we'll review this location."); setMenuOpen(false); }}
                        className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#dc2626] hover:bg-[#fef2f2]"
                      >
                        <Flag className="h-4 w-4" /> Report location
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/*
          Wikipedia context for the place, above the location's videos.
          `header.region` is passed as the subtitle so the card reads
          "Pokhara / Gandaki Province, Nepal" - the country line the spec asks
          for comes from our own location data, not from parsing the summary.

          Falls back to the de-slugged name while the header is still loading,
          so the lookup starts immediately rather than waiting on our own API.
        */}
        <KnowledgeCard
          query={header?.name ?? deslug(slug)}
          subtitle={header?.region ?? undefined}
          className="mt-4"
        />

        {/* ── Tabs ── */}
        <div className="mt-4 flex items-center gap-6 border-b border-[#eeeeee]">
          {([["popular", "Popular"], ["recent", "Recent"], ["nearby", "Nearby"]] as [Tab, string][]).map(([t, lbl]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={cn(
                "relative pb-3 text-[14px] font-semibold transition",
                tab === t ? "text-[#fd4605]" : "text-[#6b7280] hover:text-[#111827]",
              )}
            >
              {lbl}
              {tab === t && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-[#fd4605]" />}
            </button>
          ))}
        </div>

        <div className="mt-4 flex gap-6">
          {/* ── Main column ── */}
          <div className="min-w-0 flex-1">
            {tab === "nearby" ? (
              <NearbyCreators slug={slug} />
            ) : (
              <>
                {/* Filters */}
                <div className="mb-4 flex flex-wrap items-center gap-2.5">
                  <Dropdown value={type} options={TYPE_OPTS} onChange={setType} />
                  <Dropdown value={time} options={TIME_OPTS} onChange={setTime} />
                  {tab !== "recent" && <Dropdown value={sort} options={SORT_OPTS} onChange={setSort} />}
                  <button
                    type="button"
                    onClick={() => void fetchPage(1, false)}
                    aria-label="Refresh"
                    title="Refresh - pull the latest posts"
                    className="grid h-9 w-9 place-items-center rounded-full border border-[#e5e7eb] bg-white text-[#6b7280] transition hover:border-[#fd4605] hover:text-[#fd4605]"
                  >
                    <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
                  </button>
                </div>

                {/* Grid / states */}
                {loading ? (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="aspect-[9/14] animate-pulse rounded-xl bg-[#ececec]" />
                    ))}
                  </div>
                ) : items.length === 0 ? (
                  <EmptyState />
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                      {items.map((v) => <Card key={v.id} v={v} locName={header?.name ?? deslug(slug)} />)}
                    </div>
                    {hasMore && (
                      <button
                        type="button"
                        onClick={() => void fetchPage(page + 1, true)}
                        disabled={loadingMore}
                        className="mt-5 flex w-full items-center justify-center gap-1.5 rounded-2xl bg-[#fff3ec] py-3.5 text-[14px] font-bold text-[#fd4605] hover:bg-[#ffe3ea] disabled:opacity-60"
                      >
                        {loadingMore ? "Loading…" : "Load more videos"}
                        {!loadingMore && <ChevronDown className="h-4 w-4" />}
                      </button>
                    )}
                  </>
                )}
              </>
            )}
          </div>

          {/* ── Right sidebar ── */}
          <aside className="hidden w-[300px] flex-shrink-0 flex-col gap-4 lg:flex">
            <div className="rounded-2xl border border-[#eeeeee] bg-white p-5">
              <h3 className="text-[15px] font-bold">About {header?.name ?? deslug(slug)}</h3>
              <p className="mt-1.5 text-[13px] leading-snug text-[#6b7280]">
                Discover places, culture, people and real-life moments shared from {header?.display_name ?? deslug(slug)}.
              </p>
              {header?.region && (
                <div className="mt-3 flex items-start gap-2 text-[13px]">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#9aa1ad]" />
                  <div><p className="text-[#9aa1ad]">Region</p><p className="font-semibold">{header.region}</p></div>
                </div>
              )}
            </div>

            {topCreators.length > 0 && (
              <div className="rounded-2xl border border-[#eeeeee] bg-white p-5">
                <h3 className="text-[15px] font-bold">Top creators</h3>
                <div className="mt-3 space-y-3">
                  {topCreators.map((u) => u && (
                    <Link key={u.username} href={`/profile/${u.username}`} className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-[#f1f1f2] text-[12px] font-bold text-[#9aa1ad]">
                        {u.avatar
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={u.avatar} alt={u.name} className="h-full w-full object-cover" />
                          : (u.name || u.username)[0]?.toUpperCase()}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-1 truncate text-[13px] font-bold">
                          {u.name || u.username}
                          {u.is_verified && <VerifiedBadge size={12} tooltip={false} />}
                        </p>
                        <p className="truncate text-[11.5px] text-[#9aa1ad]">@{u.username}</p>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </aside>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-[18px] font-extrabold leading-none">{formatCompact(value)}</p>
      <p className="mt-1 text-[12px] text-[#9aa1ad]">{label}</p>
    </div>
  );
}

function Card({ v, locName }: { v: ReelsooVideo; locName: string }) {
  const isImage = v.media_type === "image" || v.media_type === "image_carousel";
  const cover   = v.thumbnail_url || null;
  return (
    <Link href={`/videos/${v.id}`} className="group block">
      <div className="relative aspect-[9/14] overflow-hidden rounded-xl bg-[#0f0f10]">
        {cover
          // eslint-disable-next-line @next/next/no-img-element
          ? <img src={cover} alt={v.title ?? v.caption ?? "Post"} loading="lazy" className="absolute inset-0 h-full w-full object-cover transition group-hover:scale-105" />
          : <div className="absolute inset-0 bg-gradient-to-br from-[#2a2a35] to-[#0f0f10]" />}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/65" />
        {/* Location label */}
        <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/55 px-1.5 py-[3px] text-[10px] font-semibold text-white backdrop-blur-sm">
          <MapPin className="h-2.5 w-2.5" /> {locName}
        </span>
        {/* Views + type icon */}
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-between px-2.5 pb-2 text-[11px] font-semibold text-white/90">
          <span className="flex items-center gap-1">
            {isImage ? <Images className="h-3 w-3" /> : <Play className="h-3 w-3 fill-current" />}
            {formatCompact(v.views_count ?? 0)}
          </span>
        </div>
      </div>
      <p className="mt-1.5 line-clamp-2 text-[13px] font-semibold leading-snug text-[#111827]">{v.title || v.caption || "Untitled"}</p>
      {v.user?.username && (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="grid h-5 w-5 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-[#f1f1f2] text-[9px] font-bold text-[#9aa1ad]">
            {v.user.avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={v.user.avatar} alt="" className="h-full w-full object-cover" />
              : (v.user.name || v.user.username)[0]?.toUpperCase()}
          </span>
          <span className="truncate text-[11.5px] text-[#6b7280]">@{v.user.username}</span>
          {v.user.is_verified && <VerifiedBadge size={11} tooltip={false} />}
        </div>
      )}
    </Link>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-[#eeeeee] bg-white px-6 py-16 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff3ec]">
        <MapPin className="h-8 w-8 text-[#fd4605]" />
      </div>
      <p className="mt-4 text-[16px] font-bold">No posts from this location yet</p>
      <p className="mt-1 max-w-sm text-[13.5px] text-[#6b7280]">
        When creators tag this location in their uploads, their posts will appear here.
      </p>
      <Link href="/explore" className="mt-5 rounded-full bg-[#fd4605] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#e03e04]">
        Explore other locations
      </Link>
    </div>
  );
}

function NearbyCreators({ slug }: { slug: string }) {
  const [creators, setCreators] = useState<NearbyCreator[]>([]);
  const [country,  setCountry]  = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.get(`/locations/${slug}/nearby`)
      .then(({ data }) => { if (!cancelled) { setCreators(data?.data ?? []); setCountry(data?.country ?? null); } })
      .catch(() => { if (!cancelled) setCreators([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-[82px] animate-pulse rounded-2xl bg-[#ececec]" />)}
      </div>
    );
  }

  if (creators.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-[#eeeeee] bg-white px-6 py-16 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff3ec]"><MapPin className="h-8 w-8 text-[#fd4605]" /></div>
        <p className="mt-4 text-[16px] font-bold">No nearby creators yet</p>
        <p className="mt-1 max-w-sm text-[13.5px] text-[#6b7280]">Creators who tag a location in {country ?? "this country"} will appear here.</p>
      </div>
    );
  }

  return (
    <>
      <p className="mb-3 text-[13px] text-[#6b7280]">Creators posting from around {country ?? "nearby"}.</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {creators.map((c) => (
          <div key={c.id} className="flex items-center gap-3 rounded-2xl border border-[#f0f0f0] bg-white p-3.5">
            <Link href={`/profile/${c.username}`} className="grid h-12 w-12 flex-shrink-0 place-items-center overflow-hidden rounded-full bg-[#f1f1f2] text-[14px] font-bold text-[#9aa1ad]">
              {c.avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={c.avatar} alt={c.name} className="h-full w-full object-cover" />
                : (c.name || c.username)[0]?.toUpperCase()}
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={`/profile/${c.username}`} className="flex items-center gap-1">
                <p className="truncate text-[14px] font-bold text-[#111827]">{c.name || c.username}</p>
                {c.is_verified && <VerifiedBadge size={13} tooltip={false} />}
              </Link>
              <p className="truncate text-[12px] text-[#9aa1ad]">@{c.username} · {formatCompact(c.followers_count)} followers</p>
              {c.location && (
                <p className="mt-0.5 flex items-center gap-1 truncate text-[11.5px] text-[#9aa1ad]">
                  <MapPin className="h-3 w-3 flex-shrink-0" />{c.location}
                </p>
              )}
            </div>
            <FollowButton variant="pill" username={c.username} initialFollowing={c.is_following} />
          </div>
        ))}
      </div>
    </>
  );
}

/** Best-effort human label from the slug (used until the API header loads). */
function deslug(slug: string): string {
  const first = slug.split("-").slice(0, 2).join(" ");
  return first.replace(/\b\w/g, (c) => c.toUpperCase());
}
