"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import {
  BellOff,
  BellRing,
  Heart,
  LayoutGrid,
  LayoutList,
  Loader2,
  MessageCircle,
  MoreHorizontal,
  Search,
  Star,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  Volume2,
  VolumeX,
  X,
} from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { AppShell } from "@/components/layout/app-shell";
import { FeedPage } from "@/features/feed/feed-page";
import { StoryRingAvatar } from "@/components/story/story-ring-avatar";
import { useAuthStore } from "@/store/auth.store";
import { friendService } from "@/services/friend.service";
import { videoService } from "@/services/video.service";
import { cn } from "@/lib/utils";
import type { TeezerUser } from "@/types/user";
import type { TeezerVideo } from "@/types/video";

/* ─── Types ─────────────────────────────────────────────────────── */
type FilterType = "all" | "creators" | "friends" | "verified" | "recent";
type ViewMode   = "grid" | "list";
type RouterState = "checking" | "discovery" | "feed";

interface FollowingCard {
  user:            TeezerUser;
  thumbnail:       string | null;
  latestVideoId:   number | null;
  latestVideoTime: string | null;
  isLive:          boolean;
}

/* ─── Helpers ────────────────────────────────────────────────────── */
function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function FollowingIllustration() {
  return (
    <div className="pointer-events-none relative hidden select-none sm:block" style={{ width: 180, height: 110 }}>
      <svg viewBox="0 0 180 110" fill="none" className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: 4 }).map((_, r) =>
          Array.from({ length: 8 }).map((_, c) => (
            <circle key={`${r}-${c}`} cx={c * 24 + 8} cy={r * 26 + 8} r="2" fill="#fd4605" opacity="0.18" />
          )),
        )}
      </svg>
      <div className="absolute bottom-0 left-[16%] flex h-[72px] w-[72px] items-center justify-center rounded-full shadow-lg"
        style={{ background: "linear-gradient(135deg,#ffc7d2,#fd4605)" }}>
        <svg viewBox="0 0 48 48" fill="none" className="h-10 w-10">
          <circle cx="24" cy="15" r="9.5" fill="white" fillOpacity="0.9" />
          <ellipse cx="24" cy="40" rx="15" ry="9" fill="white" fillOpacity="0.9" />
        </svg>
      </div>
      <div className="absolute bottom-0 right-[12%] flex h-[60px] w-[60px] items-center justify-center rounded-full shadow-md"
        style={{ background: "linear-gradient(135deg,#ffd6e0,#ffb3c6)" }}>
        <svg viewBox="0 0 48 48" fill="none" className="h-8 w-8">
          <circle cx="24" cy="15" r="8.5" fill="white" fillOpacity="0.85" />
          <ellipse cx="24" cy="39" rx="13" ry="8" fill="white" fillOpacity="0.85" />
        </svg>
      </div>
      <div className="absolute right-[30%] top-0 flex h-9 w-9 items-center justify-center rounded-full bg-[#fd4605] shadow-lg">
        <UserPlus className="h-4 w-4 fill-white text-white" />
      </div>
    </div>
  );
}

function getBadge(time?: string | null, live?: boolean) {
  if (live) return { label: "LIVE", kind: "live" as const };
  if (!time) return null;
  const h = (Date.now() - new Date(time).getTime()) / 3_600_000;
  if (h < 24) return { label: "New video", kind: "new" as const };
  const d = Math.floor(h / 24);
  if (d <= 7) return { label: d === 1 ? "1d ago" : `${d}d ago`, kind: "time" as const };
  return null;
}

/* ─── Gradient pool for cards without a thumbnail ──────────────── */
const DARK_GRADS = [
  "linear-gradient(160deg,#0f0c29,#302b63,#24243e)",
  "linear-gradient(160deg,#1a1a2e,#16213e,#0f3460)",
  "linear-gradient(160deg,#200122,#6f0000,#200122)",
  "linear-gradient(160deg,#0a3d62,#1e3799)",
  "linear-gradient(160deg,#1b1b2f,#162447,#1f4068)",
  "linear-gradient(160deg,#093028,#237a57)",
  "linear-gradient(160deg,#2d1b69,#11998e)",
  "linear-gradient(160deg,#360033,#0b8793)",
  "linear-gradient(160deg,#3a1c71,#d76d77,#ffaf7b)",
  "linear-gradient(160deg,#1f1c2c,#928dab)",
  "linear-gradient(160deg,#16222a,#3a6073)",
  "linear-gradient(160deg,#4b134f,#c94b4b)",
];
function hashGrad(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return DARK_GRADS[Math.abs(h) % DARK_GRADS.length];
}


/* ═══════════════════════════════════════════════════════════════════
   CreatorCard - grid view card
═══════════════════════════════════════════════════════════════════ */
interface CardProps {
  card:        FollowingCard;
  isFollowing: boolean;
  loading:     boolean;
  onFollow:    () => void;
}

function CreatorCard({ card, isFollowing, loading, onFollow }: CardProps) {
  const { user: authUser } = useAuthStore();
  const { user, thumbnail, latestVideoTime, isLive } = card;

  const [menuOpen,        setMenuOpen]        = useState(false);
  const [notificationsOn, setNotificationsOn] = useState(false);
  const [isFavorite,      setIsFavorite]      = useState(false);
  const [isMuted,         setIsMuted]         = useState(false);

  const menuRef    = useRef<HTMLDivElement>(null);
  const isOwnCard  = authUser?.username === user.username;
  const category   = user.categories?.[0] ?? user.profile?.category ?? null;
  const badge      = getBadge(latestVideoTime, isLive);
  const bgGrad     = hashGrad(user.username);

  // Close on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", fn);
    return () => document.removeEventListener("mousedown", fn);
  }, [menuOpen]);

  // Close on ESC
  useEffect(() => {
    if (!menuOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [menuOpen]);

  // Build menu dynamically so labels and icons always reflect current state
  const menuItems = [
    {
      icon: UserCheck,
      label: "View Profile",
      href: `/profile/${user.username}` as string | null,
      action: null as (() => void) | null,
      red: false,
    },
    {
      icon: MessageCircle,
      label: "Message",
      href: `/messages?userId=${user.id}` as string | null,
      action: null as (() => void) | null,
      red: false,
    },
    {
      icon: notificationsOn ? BellOff : BellRing,
      label: notificationsOn ? "Turn off Notifications" : "Turn on Notifications",
      href: null,
      action: () => setNotificationsOn((o) => !o),
      red: false,
    },
    {
      icon: Star,
      label: isFavorite ? "Remove from Favorites" : "Add to Favorites",
      href: null,
      action: () => setIsFavorite((o) => !o),
      red: false,
    },
    {
      icon: isMuted ? Volume2 : VolumeX,
      label: isMuted ? "Unmute" : "Mute",
      href: null,
      action: () => setIsMuted((o) => !o),
      red: false,
    },
    // Hide Follow/Unfollow on the logged-in user's own card
    ...(!isOwnCard ? [{
      icon: isFollowing ? UserMinus : UserPlus,
      label: isFollowing ? "Unfollow" : "Follow",
      href: null,
      action: () => { onFollow(); },
      red: isFollowing,
    }] : []),
  ];

  return (
    <div
      className="group relative overflow-hidden rounded-[18px] cursor-pointer transition-all duration-300 hover:scale-[1.025] hover:shadow-[0_16px_48px_rgba(0,0,0,0.35)]"
      style={{ aspectRatio: "3/4" }}
    >
      {/* Background */}
      {thumbnail ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={thumbnail} alt={user.name} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <div className="absolute inset-0" style={{ background: bgGrad }} />
      )}

      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/25 to-black/30 transition-all duration-300 group-hover:from-black/95" />
      <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/50 to-transparent" />

      {/* Top row: badge + menu */}
      <div className="absolute inset-x-3 top-3 flex items-center justify-between z-10">
        {badge ? (
          <span className={cn(
            "rounded-full px-2.5 py-0.5 text-[11px] font-bold leading-tight",
            badge.kind === "live"
              ? "bg-[#fd4605] text-white"
              : badge.kind === "new"
                ? "border border-white/30 bg-white/20 backdrop-blur-sm text-white"
                : "bg-black/50 backdrop-blur-sm text-white/90",
          )}>
            {badge.label}
          </span>
        ) : <span />}

        <div ref={menuRef} className="relative">
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((o) => !o); }}
            className="grid h-7 w-7 place-items-center rounded-full bg-black/40 backdrop-blur-sm text-white/80 transition hover:bg-black/70 hover:text-white"
          >
            <MoreHorizontal className="h-4 w-4" />
          </button>

          {menuOpen && (
            <div className="absolute right-0 top-8 z-50 w-52 overflow-hidden rounded-[14px] border border-white/10 bg-black/80 backdrop-blur-xl shadow-2xl py-1">
              {menuItems.map((item) =>
                item.href ? (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMenuOpen(false)}
                    className={cn(
                      "flex items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition hover:bg-white/10",
                      item.red ? "text-[#fd4605]" : "text-white",
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    {item.label}
                  </Link>
                ) : (
                  <button
                    key={item.label}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      item.action?.();
                      setMenuOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-center gap-2.5 px-3 py-2 text-[12px] font-medium transition hover:bg-white/10",
                      item.red ? "text-[#fd4605]" : "text-white",
                    )}
                  >
                    <item.icon className="h-3.5 w-3.5 flex-shrink-0" />
                    {item.label}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      </div>

      {/* Clickable body → profile */}
      <Link href={`/profile/${user.username}`} className="absolute inset-0 z-0">
        <div className="absolute inset-x-0 flex flex-col items-center px-4" style={{ top: "44%", transform: "translateY(-50%)" }}>
          {/* Avatar */}
          <div className="relative mb-2.5">
            <StoryRingAvatar userId={user.id} username={user.username} displayName={user.name} avatar={user.avatar} size={60} noProfileLink />
            {user.is_verified && (
              <span className="absolute -bottom-0.5 -right-0.5">
                <VerifiedBadge size={18} />
              </span>
            )}
          </div>
          <p className="w-full truncate text-center text-[14px] font-extrabold leading-tight text-white drop-shadow-md">
            {user.name}
          </p>
          <p className="mt-0.5 text-[11px] text-white/65">@{user.username}</p>
        </div>
      </Link>

      {/* Follow button */}
      <div className="absolute inset-x-4 z-10" style={{ bottom: 52 }}>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); onFollow(); }}
          disabled={loading}
          className={cn(
            "w-full rounded-full py-[7px] text-[13px] font-bold transition active:scale-95 disabled:opacity-60",
            isFollowing
              ? "border border-white/40 bg-white/15 text-white backdrop-blur-sm hover:bg-white/25"
              : "bg-[#fd4605] text-white hover:bg-[#e03e04]",
          )}
        >
          {loading
            ? <Loader2 className="mx-auto h-4 w-4 animate-spin" />
            : isFollowing ? "Following" : "Follow"}
        </button>
      </div>

      {/* Stats row - bottom-left (followers) and bottom-right (likes) */}
      <div className="absolute inset-x-3 bottom-3 z-10 flex items-end justify-between">
        <div className="flex flex-col items-start gap-1">
          <div className="flex items-center gap-1">
            <Users className="h-[11px] w-[11px] text-white/70" />
            <span className="text-[11px] font-bold text-white">{fmt(user.followers_count ?? 0)}</span>
          </div>
          <span className="text-[9px] text-white/55 leading-none">Followers</span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-bold text-white">{fmt(user.likes_count ?? 0)}</span>
            <Heart className="h-[11px] w-[11px] fill-white/70 text-white/70" />
          </div>
          <span className="text-[9px] text-white/55 leading-none">Likes</span>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   ListRow - list view
═══════════════════════════════════════════════════════════════════ */
function ListRow({ card, isFollowing, loading, onFollow }: CardProps) {
  const { user, latestVideoTime, isLive } = card;
  const category = user.categories?.[0] ?? user.profile?.category ?? null;
  const badge    = getBadge(latestVideoTime, isLive);

  return (
    <div className="flex items-center gap-4 rounded-[14px] border border-[#eeeeee] bg-white p-3.5 transition hover:shadow-sm">
      <div className="relative flex-shrink-0">
        <StoryRingAvatar userId={user.id} username={user.username} displayName={user.name} avatar={user.avatar} size={48} />
        {badge?.kind === "live" && (
          <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-[#fd4605] px-1.5 text-[8px] font-bold text-white leading-tight">
            LIVE
          </span>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <Link href={`/profile/${user.username}`}
            className="truncate text-[14px] font-bold text-[#111827] hover:underline">
            {user.name}
          </Link>
          {user.is_verified && <VerifiedBadge size={16} className="flex-shrink-0" />}
        </div>
        <p className="text-[12px] text-[#5f6675]">@{user.username}</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1 text-[11px] text-[#9aa1ad]">
            <Users className="h-3 w-3" /> {fmt(user.followers_count ?? 0)}
          </span>
          <span className="flex items-center gap-1 text-[11px] text-[#9aa1ad]">
            <Heart className="h-3 w-3" /> {fmt(user.likes_count ?? 0)}
          </span>
          {category && (
            <span className="rounded-full bg-[#f8f9fb] px-2 py-0.5 text-[10px] text-[#5f6675]">{category}</span>
          )}
          {badge && (
            <span className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-bold",
              badge.kind === "live" ? "bg-[#fd4605] text-white" : "bg-[#f8f9fb] text-[#5f6675]",
            )}>
              {badge.label}
            </span>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onFollow}
        disabled={loading}
        className={cn(
          "flex-shrink-0 rounded-full px-4 py-1.5 text-[13px] font-bold transition disabled:opacity-60",
          isFollowing
            ? "border border-[#fd4605]/30 bg-[#fff3ec] text-[#fd4605] hover:bg-[#ffe0e8]"
            : "bg-[#fd4605] text-white hover:bg-[#e03e04]",
        )}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isFollowing ? "Following" : "Follow"}
      </button>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   DiscoveryGrid - State 1: user follows nobody
   Shows suggested creators with video-thumbnail cards.
═══════════════════════════════════════════════════════════════════ */
const FILTERS: { id: FilterType; label: string }[] = [
  { id: "all",      label: "All"             },
  { id: "creators", label: "Creators"        },
  { id: "friends",  label: "Friends"         },
  { id: "verified", label: "Verified"        },
  { id: "recent",   label: "Recently active" },
];

interface DiscoveryGridProps {
  onFollowSuccess: () => void;
}

function DiscoveryGrid({ onFollowSuccess }: DiscoveryGridProps) {
  const { user, isAuthenticated, openAuthModal } = useAuthStore();

  const [filter,     setFilter]     = useState<FilterType>("all");
  const [search,     setSearch]     = useState("");
  const [viewMode,   setViewMode]   = useState<ViewMode>("grid");
  const [cards,      setCards]      = useState<FollowingCard[]>([]);
  const [dataLoaded, setDataLoaded] = useState(false);
  const [fetching,   setFetching]   = useState(true);
  const [followMap,  setFollowMap]  = useState<Record<string, boolean>>({});
  const [loadingMap, setLoadingMap] = useState<Record<string, boolean>>({});

  /* ── Load real creators from API ── */
  const loadData = useCallback(async () => {
    if (dataLoaded) return;
    setFetching(true);
    try {
      // 1. Suggestions - returns full TeezerUser with follower/like counts
      const suggestItems: TeezerUser[] = await friendService.suggestions().catch(() => []);

      // 2. Drain trending + general feed pages in parallel to collect as many
      //    unique creators as possible (up to ~300-500 depending on API data).
      //    Each video carries thumbnail_url and its author (VideoUser).
      const empty: TeezerVideo[] = [];
      const trendingFetches = Array.from({ length: 15 }, (_, i) =>
        videoService.trending(i + 1).then((r) => r.data ?? empty).catch(() => empty),
      );
      const feedFetches = Array.from({ length: 15 }, (_, i) =>
        videoService.feed({ page: i + 1, perPage: 30 }).then((r) => r.data ?? empty).catch(() => empty),
      );

      const allVideos: TeezerVideo[] = (
        await Promise.all([...trendingFetches, ...feedFetches])
      ).flat();

      // Build thumbnail + video-user maps (first seen per username wins)
      const thumbMap: Record<string, { url: string; time: string }> = {};
      const videoUserMap = new Map<string, NonNullable<TeezerVideo["user"]>>();

      for (const v of allVideos) {
        const un = v.user?.username;
        if (!un) continue;
        if (v.thumbnail_url && !thumbMap[un]) {
          thumbMap[un] = { url: v.thumbnail_url, time: v.created_at ?? "" };
        }
        if (!videoUserMap.has(un)) {
          videoUserMap.set(un, v.user!);
        }
      }

      // 3. Build card list: suggestions first (full stats), then any creator
      //    seen only in the video feed (basic info - no follower count).
      const result: FollowingCard[] = [];
      const seen = new Set<string>();

      for (const u of suggestItems) {
        if (seen.has(u.username)) continue;
        seen.add(u.username);
        const t = thumbMap[u.username];
        result.push({
          user: u,
          thumbnail: t?.url ?? null,
          latestVideoId: null,
          latestVideoTime: t?.time ?? null,
          isLive: false,
        });
      }

      for (const [un, vu] of videoUserMap.entries()) {
        if (seen.has(un)) continue;
        seen.add(un);
        const t = thumbMap[un];
        const user: TeezerUser = {
          id:              vu.id,
          name:            vu.name,
          username:        vu.username,
          role:            "creator",
          avatar:          vu.avatar ?? null,
          is_verified:     vu.is_verified  ?? false,
          is_following:    vu.is_following ?? false,
          // Provided by VideoResource from user.profile (total_followers / total_likes)
          followers_count: vu.followers_count ?? 0,
          likes_count:     vu.likes_count     ?? 0,
        };
        result.push({
          user,
          thumbnail: t?.url ?? null,
          latestVideoId: null,
          latestVideoTime: t?.time ?? null,
          isLive: false,
        });
      }

      setCards(result);
      setDataLoaded(true);
    } catch {
      setCards([]);
      setDataLoaded(true);
    } finally {
      setFetching(false);
    }
  }, [dataLoaded]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── Follow / unfollow ── */
  const handleFollow = useCallback(async (u: TeezerUser) => {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    const cur = u.username in followMap ? followMap[u.username] : (u.is_following ?? false);
    setLoadingMap((m) => ({ ...m, [u.username]: true }));
    setFollowMap((m)  => ({ ...m, [u.username]: !cur }));
    try {
      if (cur) {
        await friendService.unfollow(u.username);
      } else {
        await friendService.follow(u.username);
        // User now follows at least one person → switch to feed
        onFollowSuccess();
      }
    } catch {
      setFollowMap((m) => ({ ...m, [u.username]: cur }));
    } finally {
      setLoadingMap((m) => ({ ...m, [u.username]: false }));
    }
  }, [isAuthenticated, openAuthModal, followMap, onFollowSuccess]);

  const getFollowing = (u: TeezerUser) =>
    u.username in followMap ? followMap[u.username] : (u.is_following ?? false);

  /* ── Filter + search ── */
  const visible = cards.filter((c) => {
    const u = c.user;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (
        !(u.name ?? "").toLowerCase().includes(q) &&
        !u.username.toLowerCase().includes(q) &&
        !(u.categories?.[0] ?? "").toLowerCase().includes(q)
      ) return false;
    }
    if (filter === "creators") return u.role === "creator" || u.creatorStatus === "approved";
    if (filter === "verified") return !!u.is_verified;
    if (filter === "recent")   return !!c.latestVideoTime;
    if (filter === "friends")  return false;
    return true;
  });

  return (
    <AppShell>
      <div className="page-scroll">
        <div className="mx-auto max-w-[1400px] px-4 py-6 sm:px-6">

          {/* Page header */}
          <div className="relative mb-6 overflow-hidden rounded-[22px] border border-[#eeeeee] bg-white px-6 py-5 shadow-sm">
            {/* Subtle gradient background accent */}
            <div className="pointer-events-none absolute right-0 top-0 h-full w-1/3 bg-gradient-to-l from-[#fff3ec] to-transparent opacity-60" />
            <div className="relative flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-[26px] font-black text-[#111827]">Following</h1>
                  <span className="flex items-center gap-1 rounded-full bg-[#fff3ec] px-2.5 py-1 text-[11px] font-bold text-[#fd4605]">
                    Following
                  </span>
                </div>
                <p className="mt-1 max-w-[400px] text-[13px] text-[#5f6675]">
                  Watch videos from creators and people you follow
                </p>
                {/* Quick stat pills */}
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="flex items-center gap-1.5 rounded-full bg-[#f8f9fb] px-3 py-1 text-[11px] font-semibold text-[#111827]">
                    <Users className="h-3 w-3 text-[#fd4605]" />
                    {user?.following_count ?? user?.profile?.total_following ?? 0} Following
                  </span>
                  <span className="flex items-center gap-1.5 rounded-full bg-[#f8f9fb] px-3 py-1 text-[11px] font-semibold text-[#111827]">
                    <Users className="h-3 w-3 text-[#3b82f6]" />
                    {user?.followers_count ?? user?.profile?.total_followers ?? 0} Followers
                  </span>
                </div>
              </div>
              <FollowingIllustration />
            </div>
          </div>

          {/* Filter row */}
          <div className="mb-5 flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {FILTERS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setFilter(f.id)}
                  className={cn(
                    "rounded-full px-4 py-1.5 text-[13px] font-semibold transition",
                    filter === f.id
                      ? "bg-[#fd4605] text-white shadow-sm"
                      : "border border-[#e5e7eb] bg-white text-[#5f6675] hover:border-[#fd4605] hover:text-[#fd4605]",
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1" />

            {/* Search */}
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa1ad]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search following..."
                className="h-[38px] w-[190px] rounded-full border border-[#e5e7eb] bg-white pl-9 pr-8 text-[13px] outline-none transition-all focus:w-[230px] focus:border-[#fd4605]"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa1ad] hover:text-[#5f6675]"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Grid / List toggle */}
            <div className="flex overflow-hidden rounded-[10px] border border-[#e5e7eb]">
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={cn(
                  "grid h-9 w-9 place-items-center transition",
                  viewMode === "grid" ? "bg-[#fd4605] text-white" : "bg-white text-[#5f6675] hover:bg-[#f8f9fb]",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode("list")}
                className={cn(
                  "grid h-9 w-9 place-items-center border-l border-[#e5e7eb] transition",
                  viewMode === "list" ? "bg-[#fd4605] text-white" : "bg-white text-[#5f6675] hover:bg-[#f8f9fb]",
                )}
              >
                <LayoutList className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Content */}
          {fetching ? (
            <div className="flex justify-center py-28">
              <Loader2 className="h-10 w-10 animate-spin text-[#fd4605]" />
            </div>
          ) : filter === "friends" ? (
            <div className="flex flex-col items-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f8f9fb]">
                <Users className="h-8 w-8 text-[#9aa1ad]" />
              </div>
              <p className="text-[16px] font-bold text-[#111827]">Friends coming soon</p>
              <p className="mt-1 max-w-xs text-[13px] text-[#5f6675]">
                Mutual-follow data will appear here once the feature is live.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center py-20 text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-[#f8f9fb]">
                <Search className="h-8 w-8 text-[#9aa1ad]" />
              </div>
              <p className="text-[16px] font-bold text-[#111827]">No results found</p>
              <p className="mt-1 text-[13px] text-[#5f6675]">Try a different filter or search term.</p>
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {visible.map((card) => (
                <CreatorCard
                  key={card.user.id ?? card.user.username}
                  card={card}
                  isFollowing={getFollowing(card.user)}
                  loading={!!loadingMap[card.user.username]}
                  onFollow={() => handleFollow(card.user)}
                />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {visible.map((card) => (
                <ListRow
                  key={card.user.id ?? card.user.username}
                  card={card}
                  isFollowing={getFollowing(card.user)}
                  loading={!!loadingMap[card.user.username]}
                  onFollow={() => handleFollow(card.user)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   FollowingRouter - entry point exported to the page
   Checks following count, then routes to the correct state.
═══════════════════════════════════════════════════════════════════ */
export function FollowingRouter() {
  const { user, isAuthenticated, openAuthModal } = useAuthStore();
  const [state, setState] = useState<RouterState>("checking");

  useEffect(() => {
    if (!isAuthenticated) {
      // Not logged in → show discovery (guest can see creator cards)
      setState("discovery");
      return;
    }
    if (!user?.username) return;

    // Fast path: if cached following_count says > 0, go to feed immediately
    const cached = user.following_count ?? user.profile?.total_following ?? 0;
    if (cached > 0) {
      setState("feed");
      return;
    }

    // Slow path: verify with a fresh lightweight API call (page = 1, perPage = 1)
    friendService
      .following(user.username, 1, 1)
      .then((res) => {
        const hasFollowing = (res.data?.length ?? 0) > 0;
        setState(hasFollowing ? "feed" : "discovery");
      })
      .catch(() => {
        // On error, show discovery as a safe fallback
        setState("discovery");
      });
  }, [isAuthenticated, user?.username, user?.following_count, user?.profile?.total_following]);

  /* ── Checking / loading ── */
  if (state === "checking") {
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-var(--topbar-h))] items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-[#fd4605]" />
        </div>
      </AppShell>
    );
  }

  /* ── State 2: user follows ≥ 1 account → TikTok-style video feed ── */
  if (state === "feed") {
    return <FeedPage mode="following" onEmpty={() => setState("discovery")} />;
  }

  /* ── State 1: user follows nobody → discovery / suggest grid ── */
  return (
    <DiscoveryGrid
      onFollowSuccess={() => setState("feed")}
    />
  );
}
