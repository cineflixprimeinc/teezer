"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Clapperboard,
  Globe,
  Hash,
  Heart,
  Loader2,
  MapPin,
  MoreVertical,
  Music2,
  Play,
  Radio,
  TrendingUp,
  UserPlus,
  Users,
  Video,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { StoryRingAvatar } from "@/components/story/story-ring-avatar";
import { useAuthStore } from "@/store/auth.store";
import { suggestionService } from "@/services/suggestion.service";
import { audioService } from "@/services/audio.service";
import { friendService } from "@/services/friend.service";
import { videoService } from "@/services/video.service";
import { trendingService } from "@/services/trending.service";
import { detectUserCountry } from "@/lib/country";
import { cn } from "@/lib/utils";
import type { ReelsooVideo } from "@/types/video";
import type { TrendingHashtag } from "@/services/trending.service";

/* ─── Categories - emoji icons per tab ─────────────────────────── */
const CATEGORIES: { id: string; label: string; emoji: string }[] = [
  { id: "trending",              label: "Trending",              emoji: "🔥" },
  { id: "fashion",               label: "Fashion",               emoji: "👗" },
  { id: "comedy",                label: "Comedy",                emoji: "😂" },
  { id: "food",                  label: "Food",                  emoji: "🍔" },
  { id: "travel",                label: "Travel",                emoji: "✈️" },
  { id: "music",                 label: "Music",                 emoji: "🎵" },
  { id: "dance",                 label: "Dance",                 emoji: "💃" },
  { id: "technology",            label: "Tech",                  emoji: "💻" },
  { id: "beauty",                label: "Beauty",                emoji: "💄" },
  { id: "lifestyle",             label: "Lifestyle",             emoji: "🌿" },
  { id: "fitness",               label: "Fitness",               emoji: "💪" },
  { id: "sports",                label: "Sports",                emoji: "🏆" },
  { id: "gaming",                label: "Gaming",                emoji: "🎮" },
  { id: "education",             label: "Education",             emoji: "🎓" },
  { id: "business",              label: "Business",              emoji: "💼" },
  { id: "motivation",            label: "Motivation",            emoji: "⚡" },
  { id: "news",                  label: "News",                  emoji: "📰" },
  { id: "entertainment",         label: "Entertainment",         emoji: "🎬" },
  { id: "vlog",                  label: "Vlog",                  emoji: "📹" },
  { id: "art",                   label: "Art",                   emoji: "🎨" },
  { id: "photography",           label: "Photography",           emoji: "📸" },
  { id: "animals & pets",        label: "Animals & Pets",        emoji: "🐾" },
  { id: "nature",                label: "Nature",                emoji: "🌲" },
  { id: "cars & bikes",          label: "Cars & Bikes",          emoji: "🚗" },
  { id: "health",                label: "Health",                emoji: "❤️" },
  { id: "diy & crafts",          label: "DIY & Crafts",          emoji: "🔨" },
  { id: "family",                label: "Family",                emoji: "🏠" },
  { id: "relationships",         label: "Relationships",         emoji: "💑" },
  { id: "cooking",               label: "Cooking",               emoji: "👨‍🍳" },
  { id: "reviews",               label: "Reviews",               emoji: "👍" },
  { id: "tutorials",             label: "Tutorials",             emoji: "📖" },
  { id: "religious / spiritual", label: "Spiritual",             emoji: "🙏" },
  { id: "other",                 label: "Other",                 emoji: "✨" },
];

/* ─── Static UI config (banner/promotional) ─────────────────────── */
const BANNER_SLIDES = [
  {
    label: "TRENDING CHALLENGE",
    title: "#GlowUpTransition ✨",
    sub: "Show your glow up and\ninspire the world",
    cta: "Join Challenge",
    joined: "12.8K creators joined",
    bg: "linear-gradient(130deg,#1a0a2e 0%,#6a0050 45%,#c42070 75%,#e8305a 100%)",
    accent: "#f472b6",
  },
  {
    label: "TRENDING CHALLENGE",
    title: "#FitLife2025 🏋️",
    sub: "Show your fitness journey\nand inspire others",
    cta: "Join Challenge",
    joined: "8.4K creators joined",
    bg: "linear-gradient(130deg,#0a1628 0%,#003973 45%,#0066cc 75%,#1a9bfc 100%)",
    accent: "#60a5fa",
  },
  {
    label: "TRENDING CHALLENGE",
    title: "#CookWithMe 🍳",
    sub: "Share your best recipe\nand win prizes",
    cta: "Join Challenge",
    joined: "5.2K creators joined",
    bg: "linear-gradient(130deg,#1a0a00 0%,#7f3800 45%,#d4610a 75%,#f7a629 100%)",
    accent: "#fb923c",
  },
];

const AVATAR_JOINED_COLORS = ["#cc2b5e", "#667eea", "#f77f00", "#134e5e"];

/* ─── Gradient pool ──────────────────────────────────────────────── */
const GRAD_POOL = [
  "linear-gradient(135deg,#cc2b5e,#753a88)",
  "linear-gradient(135deg,#1a1a2e,#0f3460)",
  "linear-gradient(135deg,#f77f00,#d62828)",
  "linear-gradient(135deg,#134e5e,#71b280)",
  "linear-gradient(135deg,#c94b4b,#4b134f)",
  "linear-gradient(135deg,#373b44,#4286f4)",
  "linear-gradient(135deg,#e96c5a,#f9b234)",
  "linear-gradient(135deg,#6a3093,#a044ff)",
  "linear-gradient(135deg,#2193b0,#6dd5ed)",
  "linear-gradient(135deg,#ee0979,#ff6a00)",
  "linear-gradient(135deg,#0f2027,#2c5364)",
  "linear-gradient(135deg,#355c7d,#c06c84)",
];
function hashGrad(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRAD_POOL[Math.abs(h) % GRAD_POOL.length];
}

/* ─── Data types ─────────────────────────────────────────────────── */
interface CardVideo {
  id:              number;
  title:           string;
  creator:         string;
  creatorAvatar?:  string | null;
  creatorVerified?: boolean;
  views:           string;
  likes:           string;
  duration:        string;
  thumbnail?:      string | null;
  gradient:        string;
  hashtags:        string[];
}

interface LiveItem   { id: number; title: string; username: string; viewers: string; gradient: string; }
interface Topic      { tag: string; views: string; }
interface PopularHashtag { tag: string; posts: string; }
interface AudioTrack { id: number; title: string; artist?: string | null; reels: string; gradient: string; }
interface Creator    { id?: number; username: string; name: string; avatar?: string | null; followers: string; gradient: string; isVerified?: boolean; isFollowing?: boolean; }

/* ─── Helpers ────────────────────────────────────────────────────── */
function fmtCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function fmtDuration(s?: number | null): string {
  if (!s || s <= 0) return "00:00";
  return `${Math.floor(s / 60).toString().padStart(2, "0")}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
}

/** Returns true if video matches the active category filter. */
function matchesCategory(v: CardVideo, cat: string): boolean {
  if (cat === "trending") return true;
  // Split category into keywords, skip short/connector words
  const keywords = cat.split(/[\s&/]+/).filter((w) => w.length > 2);
  const haystack = [v.title, v.creator, ...v.hashtags].join(" ").toLowerCase();
  return keywords.some((kw) => haystack.includes(kw.toLowerCase()));
}

/* ─── UI components ──────────────────────────────────────────────── */
function GradientAvatar({ g, size, text }: { g: string; size: number; text: string }) {
  return (
    <div className="flex-shrink-0 rounded-full grid place-items-center font-bold text-white overflow-hidden"
      style={{ width: size, height: size, background: g, fontSize: Math.round(size * 0.35) }}>
      {text.replace(/[^a-zA-Z]/g, "").slice(0, 2).toUpperCase() || "RS"}
    </div>
  );
}

function UserAvatar({ avatar, username, size, gradient }: { avatar?: string | null; username: string; size: number; gradient: string }) {
  const [err, setErr] = useState(false);
  if (avatar && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={avatar} alt={username} onError={() => setErr(true)}
        className="rounded-full object-cover flex-shrink-0" style={{ width: size, height: size }} />
    );
  }
  return <GradientAvatar g={gradient} size={size} text={username} />;
}

function SectionHeader({ title, href = "#", showViewAll = true }: { title: string; href?: string; showViewAll?: boolean }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-[15px] font-extrabold text-[#111827] sm:text-[16px]">{title}</h2>
      {showViewAll && (
        <Link href={href} className="text-[12px] font-semibold text-[#fe2c55] hover:underline">View all</Link>
      )}
    </div>
  );
}

function SectionEmpty({ icon: Icon, text }: { icon: React.ElementType; text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-6 text-center">
      <Icon className="h-8 w-8 text-[#d1d5db] mb-2" />
      <p className="text-[12px] text-[#9aa1ad]">{text}</p>
    </div>
  );
}

function VideoCard({ v }: { v: CardVideo }) {
  return (
    <Link href={`/videos/${v.id}`} className="group cursor-pointer block">
      <div className="relative mb-2 aspect-[9/14] overflow-hidden rounded-[14px]"
        style={v.thumbnail ? undefined : { background: v.gradient }}>
        {v.thumbnail && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={v.thumbnail} alt={v.title} className="absolute inset-0 h-full w-full object-cover" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60" />
        <span className="absolute right-2 top-2 rounded-[5px] bg-black/70 px-1.5 py-[2px] text-[10px] font-semibold text-white">
          {v.duration}
        </span>
        <div className="absolute bottom-2 left-2 flex items-center gap-1">
          <Heart className="h-3 w-3 fill-white text-white" />
          <span className="text-[11px] font-semibold text-white">{v.likes}</span>
        </div>
        <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-lg">
            <Play className="h-4 w-4 fill-black text-black" />
          </div>
        </div>
      </div>
      <p className="line-clamp-1 text-[12px] font-semibold text-[#111827] leading-tight">{v.title}</p>
      <div className="mt-1 flex items-center gap-1">
        <UserAvatar avatar={v.creatorAvatar} username={v.creator} size={16} gradient={v.gradient} />
        <span className="min-w-0 truncate text-[11px] text-[#5f6675]">{v.creator}</span>
        {v.creatorVerified && <VerifiedBadge size={14} />}
      </div>
      <p className="mt-0.5 text-[11px] text-[#9aa1ad]">{v.views} views</p>
    </Link>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════ */
export function ExplorePage() {
  const { user, isAuthenticated, openAuthModal } = useAuthStore();
  const detectedCountry = detectUserCountry(user);
  const [activeCategory, setActiveCategory] = useState("trending");
  const [activeDot,      setActiveDot]      = useState(0);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const slide = BANNER_SLIDES[activeDot];

  /* ── Country-aware trending hashtags (from API) ── */
  const trendingQuery = useQuery({
    queryKey: ["explore-trending-hashtags", detectedCountry.code || "global"],
    queryFn: () => trendingService.hashtags({ countryCode: detectedCountry.code, limit: 8 }),
    staleTime: 5 * 60 * 1000,
  });
  const [openHashtagMenu, setOpenHashtagMenu] = useState<string | null>(null);

  /* ── Data state ── */
  const [loading,           setLoading]           = useState(true);
  const [allVideos,         setAllVideos]          = useState<CardVideo[]>([]);
  const [liveItems]                                = useState<LiveItem[]>([]);
  const [trendingTopics,    setTrendingTopics]     = useState<Topic[]>([]);
  const [suggestedCreators, setSuggestedCreators]  = useState<Creator[]>([]);
  const [trendingCreators,  setTrendingCreators]   = useState<Creator[]>([]);
  const [popularHashtags,   setPopularHashtags]    = useState<PopularHashtag[]>([]);
  const [popularAudio,      setPopularAudio]       = useState<AudioTrack[]>([]);

  /* ── Follow state ── */
  const [followMap,     setFollowMap]     = useState<Record<string, boolean>>({});
  const [followLoading, setFollowLoading] = useState<Record<string, boolean>>({});

  /* ── Derived: filter all videos by active category ── */
  const filteredVideos = activeCategory === "trending"
    ? allVideos
    : allVideos.filter((v) => matchesCategory(v, activeCategory));

  const exploreVideos      = filteredVideos.slice(0, 6);
  const trendingUserVideos = filteredVideos.slice(0, 600);

  /* ── Fetch all data on mount ── */
  useEffect(() => {
    let cancelled = false;
    const empty: ReelsooVideo[] = [];

    async function run() {
      setLoading(true);
      try {
        const fetchSuggestions = isAuthenticated
          ? suggestionService.profiles("home", 5).catch(() => [])
          : suggestionService.guestProfiles(5).catch(() => []);

        const [suggestionsRaw, weeklyAudioRaw, ...pageResults] = await Promise.all([
          fetchSuggestions,
          audioService.getWeeklyPopular(5),
          ...Array.from({ length: 15 }, (_, i) =>
            videoService.trending(i + 1).then((r) => r.data ?? empty).catch(() => empty),
          ),
          ...Array.from({ length: 15 }, (_, i) =>
            videoService.feed({ page: i + 1, perPage: 30 }).then((r) => r.data ?? empty).catch(() => empty),
          ),
        ]);

        if (cancelled) return;

        type SuggProfile = Awaited<ReturnType<typeof suggestionService.guestProfiles>>[number];
        type WeeklyTrack = Awaited<ReturnType<typeof audioService.getWeeklyPopular>>[number];
        const suggestions = suggestionsRaw as SuggProfile[];
        const weeklyAudio = weeklyAudioRaw as WeeklyTrack[];
        const rawVideos: ReelsooVideo[] = (pageResults as ReelsooVideo[][]).flat();

        const toCardVideo = (v: ReelsooVideo): CardVideo => ({
          id:              v.id,
          title:           v.caption ?? v.title ?? "Untitled",
          creator:         v.user?.username ?? "unknown",
          creatorAvatar:   v.user?.avatar ?? null,
          creatorVerified: v.user?.is_verified ?? false,
          views:           fmtCount(v.views_count ?? 0),
          likes:           fmtCount(v.likes_count ?? 0),
          duration:        fmtDuration(v.duration),
          thumbnail:       v.thumbnail_url ?? null,
          gradient:        hashGrad(v.user?.username ?? String(v.id)),
          hashtags:        v.hashtags ?? [],
        });

        /* Unique videos (up to 600) */
        const seenIds = new Set<number>();
        const uniqueVideos: CardVideo[] = [];
        for (const v of rawVideos) {
          if (seenIds.has(v.id)) continue;
          seenIds.add(v.id);
          uniqueVideos.push(toCardVideo(v));
          if (uniqueVideos.length >= 600) break;
        }
        setAllVideos(uniqueVideos);

        /* Suggested Creators */
        const suggestCreators: Creator[] = suggestions.slice(0, 5).map((u) => ({
          id: u.id, username: u.username, name: u.display_name, avatar: u.avatar ?? null,
          followers: fmtCount(u.followers_count ?? 0), gradient: hashGrad(u.username),
          isVerified: u.is_verified ?? false, isFollowing: u.is_following ?? false,
        }));
        setSuggestedCreators(suggestCreators);

        /* Popular Audio - weekly top from music_tracks */
        if (weeklyAudio.length > 0) {
          setPopularAudio(weeklyAudio.map((t) => ({
            id: t.id,
            title: t.title,
            artist: t.artist_name ?? null,
            reels: fmtCount(t.week_plays ?? t.plays_count ?? 0),
            gradient: hashGrad(t.title),
          })));
        }

        /* Trending Creators - users with most videos */
        const userCnt = new Map<string, { count: number; u: NonNullable<ReelsooVideo["user"]> }>();
        for (const v of rawVideos) {
          if (!v.user?.username) continue;
          const e = userCnt.get(v.user.username);
          if (e) e.count++; else userCnt.set(v.user.username, { count: 1, u: v.user });
        }
        const topUsers = Array.from(userCnt.values()).sort((a, b) => b.count - a.count).slice(0, 6);
        const seenTrend = new Set(topUsers.map((x) => x.u.username));
        const trendCreators: Creator[] = topUsers.map(({ u }) => ({
          id: u.id, username: u.username, name: u.name, avatar: u.avatar ?? null,
          followers: "", gradient: hashGrad(u.username), isVerified: u.is_verified ?? false,
        }));
        for (const u of suggestions) {
          if (trendCreators.length >= 6) break;
          if (seenTrend.has(u.username)) continue;
          seenTrend.add(u.username);
          trendCreators.push({ id: u.id, username: u.username, name: u.display_name, avatar: u.avatar ?? null,
            followers: fmtCount(u.followers_count ?? 0), gradient: hashGrad(u.username), isVerified: u.is_verified ?? false });
        }
        setTrendingCreators(trendCreators.slice(0, 6));

        /* Popular Hashtags */
        const tagCount = new Map<string, number>();
        for (const v of rawVideos) for (const t of v.hashtags ?? []) tagCount.set(t, (tagCount.get(t) ?? 0) + 1);
        setPopularHashtags(Array.from(tagCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([tag, n]) => ({ tag, posts: fmtCount(n) })));

        /* Trending Topics */
        const tagViews = new Map<string, number>();
        for (const v of rawVideos) for (const t of v.hashtags ?? []) tagViews.set(t, (tagViews.get(t) ?? 0) + (v.views_count ?? 0));
        setTrendingTopics(Array.from(tagViews.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
          .map(([tag, views]) => ({ tag, views: fmtCount(views) })));

      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    run();
    return () => { cancelled = true; };
  }, [isAuthenticated]);

  /* ── Follow / unfollow ── */
  const handleFollow = useCallback(async (username: string, curFollowing: boolean) => {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    setFollowLoading((m) => ({ ...m, [username]: true }));
    setFollowMap((m)     => ({ ...m, [username]: !curFollowing }));
    try {
      if (curFollowing) await friendService.unfollow(username);
      else              await friendService.follow(username);
    } catch {
      setFollowMap((m) => ({ ...m, [username]: curFollowing }));
    } finally {
      setFollowLoading((m) => ({ ...m, [username]: false }));
    }
  }, [isAuthenticated, openAuthModal]);

  const isFollowing = (c: Creator) =>
    c.username in followMap ? followMap[c.username] : (c.isFollowing ?? false);

  /* ════════════════════════════════════════════════ RENDER ════════ */
  return (
    <AppShell>
      <div className="page-scroll">
        <div className="mx-auto flex w-full max-w-[1320px] gap-5 px-4 py-5 sm:px-6">

          {/* ── Left / Main content ─────────────────────────────── */}
          <div className="min-w-0 flex-1">

            {/* Category pills */}
            <div className="mb-4 flex items-center gap-2">
              {/* Left arrow - #D1D5DB icon color */}
              <button type="button"
                onClick={() => categoryScrollRef.current?.scrollBy({ left: -250, behavior: "smooth" })}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
                style={{ color: "#D1D5DB" }}>
                <ChevronLeft className="h-4 w-4" />
              </button>

              {/* Scrollable pills */}
              <div ref={categoryScrollRef} className="hide-scrollbar flex flex-1 items-center gap-2 overflow-x-auto">
                {CATEGORIES.map((cat) => (
                  <button key={cat.id} type="button" onClick={() => setActiveCategory(cat.id)}
                    className={cn(
                      "flex flex-shrink-0 items-center gap-1.5 rounded-full border px-4 py-[7px] text-[13px] font-semibold transition-colors",
                      activeCategory === cat.id
                        ? "border-[#fe2c55]/25 bg-[#fff0f4] text-[#fe2c55]"
                        : "border-[#e5e7eb] bg-white text-[#111827] hover:border-[#fe2c55]/30 hover:text-[#fe2c55]",
                    )}>
                    <span className="text-[14px] leading-none">{cat.emoji}</span>
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Right arrow - #D1D5DB icon color */}
              <button type="button"
                onClick={() => categoryScrollRef.current?.scrollBy({ left: 250, behavior: "smooth" })}
                className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-[#e5e7eb] bg-white transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
                style={{ color: "#D1D5DB" }}>
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            {/* Hero banner */}
            <div className="relative mb-5 overflow-hidden rounded-[20px] sm:rounded-[24px]"
              style={{ minHeight: 220, background: slide.bg }}>
              <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/25 to-transparent" />
              <div className="absolute right-[12%] top-1/2 -translate-y-1/2 rounded-full border-[3px] opacity-60"
                style={{ width: 180, height: 180, borderColor: slide.accent, boxShadow: `0 0 40px ${slide.accent}55` }} />
              <div className="absolute right-[28%] top-[18%] h-4 w-4 rounded-full opacity-80 blur-[2px]" style={{ background: slide.accent }} />
              <div className="absolute right-[18%] top-[22%] h-3 w-3 rounded-full opacity-50 blur-[2px]" style={{ background: slide.accent }} />
              <div className="absolute right-[35%] bottom-[25%] h-2.5 w-2.5 rounded-full opacity-40" style={{ background: slide.accent }} />
              <div className="pointer-events-none absolute bottom-0 right-[8%] w-[120px] sm:w-[160px] opacity-30"
                style={{ height: "100%", background: `radial-gradient(ellipse at 50% 100%,${slide.accent}44 0%,transparent 70%)` }} />
              <div className="relative flex flex-col justify-center px-6 py-8 sm:px-8 sm:py-10" style={{ minHeight: 220 }}>
                <p className="mb-1 text-[11px] font-bold uppercase tracking-[0.15em] text-[#fe2c55]">{slide.label}</p>
                <h1 className="mb-2 text-[22px] font-black leading-tight text-white sm:text-[26px]">{slide.title}</h1>
                <p className="mb-4 max-w-[260px] text-[13px] leading-relaxed text-white/80">
                  {slide.sub.split("\n").map((line, i) => (
                    <span key={i}>{line}{i < slide.sub.split("\n").length - 1 && <br />}</span>
                  ))}
                </p>
                <button className="w-fit rounded-full bg-[#fe2c55] px-5 py-2 text-[13px] font-bold text-white shadow-lg transition hover:-translate-y-px hover:bg-[#e02449] active:scale-95">
                  {slide.cta}
                </button>
                <div className="mt-3.5 flex items-center gap-2">
                  <div className="flex -space-x-2">
                    {AVATAR_JOINED_COLORS.map((c, i) => (
                      <div key={i} className="h-6 w-6 rounded-full border-2 border-white" style={{ background: c }} />
                    ))}
                  </div>
                  <span className="text-[12px] font-semibold text-white/80">{slide.joined}</span>
                </div>
              </div>
              <button type="button"
                onClick={() => setActiveDot((d) => (d + 1) % BANNER_SLIDES.length)}
                className="absolute right-4 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 shadow-lg transition hover:bg-white hover:shadow-xl">
                <ChevronRight className="h-5 w-5 text-[#111827]" />
              </button>
              <div className="absolute bottom-3.5 left-1/2 flex -translate-x-1/2 gap-1.5">
                {BANNER_SLIDES.map((_, i) => (
                  <button key={i} type="button" onClick={() => setActiveDot(i)}
                    className={cn("rounded-full transition-all duration-300",
                      activeDot === i ? "h-2 w-6 bg-white" : "h-2 w-2 bg-white/50 hover:bg-white/70")} />
                ))}
              </div>
            </div>

            {/* Explore Videos */}
            <div className="mb-5">
              <SectionHeader title="Explore Videos" showViewAll={false} />
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-[#fe2c55]" /></div>
              ) : exploreVideos.length === 0 ? (
                <SectionEmpty icon={Clapperboard} text={activeCategory === "trending" ? "No videos available right now" : `No ${activeCategory} videos found`} />
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                  {exploreVideos.map((v) => <VideoCard key={v.id} v={v} />)}
                </div>
              )}
            </div>

            {/* Trending Creators + Popular Hashtags */}
            <div className="grid gap-4 sm:grid-cols-2">

              {/* Trending Creators */}
              <div className="rounded-[18px] border border-[#eeeeee] bg-white p-4 shadow-sm">
                <SectionHeader title="Trending Creators" href="/explore?tab=creators" />
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /></div>
                ) : trendingCreators.length === 0 ? (
                  <SectionEmpty icon={Users} text="No trending creators yet" />
                ) : (
                  <div className="flex flex-wrap justify-between gap-y-4">
                    {trendingCreators.map((c) => {
                      const following = isFollowing(c);
                      const loadingBtn = !!followLoading[c.username];
                      return (
                        <div key={c.username} className="flex flex-col items-center gap-1"
                          style={{ width: "calc(100%/3 - 8px)", minWidth: 64 }}>
                          {c.id != null
                            ? <StoryRingAvatar userId={c.id} username={c.username} displayName={c.name} avatar={c.avatar} size={52} />
                            : <UserAvatar avatar={c.avatar} username={c.username} size={52} gradient={c.gradient} />
                          }
                          <div className="flex items-center gap-0.5">
                            <span className="max-w-[60px] truncate text-[11px] font-semibold text-[#111827]">{c.username}</span>
                            {c.isVerified && <VerifiedBadge size={14} />}
                          </div>
                          {c.followers && <p className="text-[10px] text-[#5f6675]">{c.followers}</p>}
                          <button onClick={() => handleFollow(c.username, following)} disabled={loadingBtn}
                            className={cn(
                              "rounded-full border px-3 py-0.5 text-[10px] font-bold transition active:scale-95 disabled:opacity-60",
                              following ? "border-[#fe2c55]/30 bg-[#fff0f4] text-[#fe2c55]" : "border-[#fe2c55] text-[#fe2c55] hover:bg-[#fff0f4]",
                            )}>
                            {loadingBtn ? <Loader2 className="h-3 w-3 animate-spin" /> : following ? "Following" : "Follow"}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Popular Hashtags */}
              <div className="rounded-[18px] border border-[#eeeeee] bg-white p-4 shadow-sm">
                <SectionHeader title="Popular Hashtags" href="/explore?tab=hashtags" />
                {loading ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /></div>
                ) : popularHashtags.length === 0 ? (
                  <SectionEmpty icon={Hash} text="No hashtags found yet" />
                ) : (
                  <div className="space-y-1">
                    {popularHashtags.map((h) => (
                      <Link key={h.tag} href={`/explore?q=${h.tag}`}
                        className="flex items-center gap-2.5 rounded-[10px] px-2 py-[9px] transition-colors hover:bg-[#f8f9fb]">
                        <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#fff0f4]">
                          <TrendingUp className="h-[15px] w-[15px] text-[#fe2c55]" />
                        </div>
                        <span className="flex-1 text-[13px] font-semibold text-[#111827]">#{h.tag}</span>
                        <span className="text-[12px] text-[#5f6675]">{h.posts} posts</span>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Right Sidebar ─────────────────────────────────────── */}
          <aside className="hidden xl:flex flex-col gap-4 flex-shrink-0" style={{ width: 272 }}>

            {/* Live Now */}
            <div className="rounded-[18px] border border-[#eeeeee] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[14px] font-extrabold text-[#111827]">Live Now</h3>
                <Link href="/live" className="text-[12px] font-semibold text-[#fe2c55] hover:underline">View all</Link>
              </div>
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /></div>
              ) : liveItems.length === 0 ? (
                <SectionEmpty icon={Radio} text="No live streams right now" />
              ) : null}
            </div>

            {/* Trending Now - country-aware via API */}
            <TrendingNowCard
              country={trendingQuery.data?.country ?? detectedCountry.name ?? "Global"}
              countryCode={trendingQuery.data?.country_code ?? detectedCountry.code ?? null}
              items={trendingQuery.data?.items ?? []}
              isLoading={trendingQuery.isLoading}
              openMenu={openHashtagMenu}
              onToggleMenu={(h) => setOpenHashtagMenu(openHashtagMenu === h ? null : h)}
              onCloseMenu={() => setOpenHashtagMenu(null)}
            />

            {/* Suggested Creators */}
            <div className="rounded-[18px] border border-[#eeeeee] bg-white p-4 shadow-sm">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-[14px] font-extrabold text-[#111827]">Suggested Creators</h3>
                <Link href="/explore?tab=creators" className="text-[12px] font-semibold text-[#fe2c55] hover:underline">View all</Link>
              </div>
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /></div>
              ) : suggestedCreators.length === 0 ? (
                <SectionEmpty icon={UserPlus} text="No suggestions right now" />
              ) : (
                <div className="space-y-3">
                  {suggestedCreators.map((c) => {
                    const following = isFollowing(c);
                    const loadingBtn = !!followLoading[c.username];
                    return (
                      <div key={c.username} className="flex items-center gap-2.5">
                        {c.id != null
                          ? <StoryRingAvatar userId={c.id} username={c.username} displayName={c.name} avatar={c.avatar} size={40} />
                          : <UserAvatar avatar={c.avatar} username={c.username} size={40} gradient={c.gradient} />
                        }
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1">
                            <span className="truncate text-[12px] font-bold text-[#111827]">{c.username}</span>
                            {c.isVerified && <VerifiedBadge size={14} />}
                          </div>
                          <p className="text-[11px] text-[#5f6675]">{c.followers} followers</p>
                        </div>
                        <button onClick={() => handleFollow(c.username, following)} disabled={loadingBtn}
                          className={cn(
                            "flex-shrink-0 rounded-full border px-3 py-1 text-[11px] font-bold transition active:scale-95 disabled:opacity-60",
                            following ? "border-[#fe2c55]/30 bg-[#fff0f4] text-[#fe2c55]" : "border-[#fe2c55] text-[#fe2c55] hover:bg-[#fff0f4]",
                          )}>
                          {loadingBtn ? <Loader2 className="h-3 w-3 animate-spin" /> : following ? "Following" : "Follow"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Popular Audio */}
            <div className="rounded-[18px] border border-[#eeeeee] bg-white p-4 shadow-sm">
              <div className="mb-3">
                <h3 className="text-[14px] font-extrabold text-[#111827]">Popular Audio</h3>
              </div>
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /></div>
              ) : popularAudio.length === 0 ? (
                <SectionEmpty icon={Music2} text="No audio data available yet" />
              ) : (
                <div className="space-y-3">
                  {popularAudio.map((a) => (
                    <div key={a.id} className="flex items-center gap-2.5">
                      <div className="h-10 w-10 flex-shrink-0 rounded-[10px]" style={{ background: a.gradient }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[12px] font-bold text-[#111827]">{a.title}</p>
                        <p className="text-[11px] text-[#5f6675]">{a.reels} reels</p>
                      </div>
                      <div className="flex items-center gap-1">
                        <button className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#111827]">
                          <Play className="h-3.5 w-3.5 fill-current" />
                        </button>
                        <button className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#111827]">
                          <Bookmark className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </aside>
        </div>

        {/* ── Trending User Videos - full width ─────────────────────── */}
        <div className="mx-auto w-full max-w-[1320px] px-4 pb-10 pt-2 sm:px-6">
          <SectionHeader title="Trending User Videos" showViewAll={false} />
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-8 w-8 animate-spin text-[#fe2c55]" /></div>
          ) : trendingUserVideos.length === 0 ? (
            <SectionEmpty icon={Clapperboard} text={activeCategory === "trending" ? "No trending videos available yet" : `No ${activeCategory} videos found`} />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7">
              {trendingUserVideos.map((v) => <VideoCard key={v.id} v={v} />)}
            </div>
          )}
        </div>

      </div>
    </AppShell>
  );
}

/* ─── TrendingNowCard - country-aware trending hashtags for Explore ─ */
function TrendingNowCard({
  country, countryCode, items, isLoading, openMenu, onToggleMenu, onCloseMenu,
}: {
  country: string;
  countryCode: string | null;
  items: TrendingHashtag[];
  isLoading: boolean;
  openMenu: string | null;
  onToggleMenu: (h: string) => void;
  onCloseMenu: () => void;
}) {
  const isGlobal = !countryCode || country === "Global";
  const title = isGlobal ? "Trending Now Globally" : `Trending Now in ${country}`;

  return (
    <div className="rounded-[18px] border border-[#eeeeee] bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-1.5 min-w-0">
          {isGlobal
            ? <Globe className="h-3.5 w-3.5 flex-shrink-0 text-[#fe2c55]" />
            : <MapPin className="h-3.5 w-3.5 flex-shrink-0 text-[#fe2c55]" />
          }
          <h3 className="truncate text-[14px] font-extrabold text-[#111827]">{title}</h3>
        </div>
        <Link href="/trending" className="flex-shrink-0 text-[12px] font-semibold text-[#fe2c55] hover:underline">
          See all
        </Link>
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="px-0 py-1">
              <div className="h-3 w-28 animate-pulse rounded-full bg-[#eef0f4]" />
              <div className="mt-1 h-2 w-20 animate-pulse rounded-full bg-[#eef0f4]" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <SectionEmpty icon={TrendingUp} text="No trending topics yet in your area" />
      ) : (
        <div className="space-y-0.5">
          {items.map((item) => {
            const clean = item.name || item.hashtag.replace(/^#/, "");
            const isCountryItem = item.scope === "country";
            return (
              <div key={item.hashtag} className="relative rounded-[10px] transition-colors hover:bg-[#f8f9fb]">
                <Link href={`/hashtag/${encodeURIComponent(clean)}`} className="block px-2 py-[9px] pr-8">
                  <div className="flex items-center gap-1.5">
                    <TrendingUp className="h-3.5 w-3.5 flex-shrink-0 text-[#fe2c55]" />
                    <span className="flex-1 truncate text-[13px] font-semibold text-[#111827]">
                      {item.hashtag}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5 pl-5">
                    <span className="text-[11px] text-[#5f6675]">{item.display_count}</span>
                    {!isCountryItem && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] text-[#9aa1ad]">
                        <Globe className="h-2.5 w-2.5" /> Global
                      </span>
                    )}
                  </div>
                </Link>

                <button
                  type="button"
                  onClick={() => onToggleMenu(item.hashtag)}
                  className="absolute right-1 top-2 grid h-6 w-6 place-items-center rounded-full text-[#9aa1ad] hover:bg-white hover:text-[#111827] cursor-pointer"
                >
                  <MoreVertical className="h-3.5 w-3.5" />
                </button>

                {openMenu === item.hashtag && (
                  <div className="absolute right-0 top-8 z-20 w-40 overflow-hidden rounded-xl border border-[#eeeeee] bg-white py-1 shadow-lg">
                    {["Copy link", "Not interested", "Report trend"].map((label) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => {
                          if (label === "Copy link") {
                            navigator.clipboard?.writeText(`${window.location.origin}/hashtag/${clean}`).catch(() => {});
                            toast.success("Trend link copied");
                          }
                          onCloseMenu();
                        }}
                        className="block w-full px-3 py-2 text-left text-[12px] font-medium text-[#111827] hover:bg-[#f8f9fb] cursor-pointer"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
