"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Bookmark, BookmarkCheck, Check, Code, Copy, Eye, Flag,
  Heart, MoreHorizontal, Music2, Pause, Play, Share2, X,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { AppShell } from "@/components/layout/app-shell";
import { audioService, type MusicTrackDetail } from "@/services/audio.service";
import type { AudioTrack } from "@/services/audio.service";
import type { TeezerVideo } from "@/types/video";
import { cn, formatCompact } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";

/* ─── localStorage keys ── */
const PENDING_SOUND_KEY = "teezer_pending_sound";
const FAV_IDS_KEY       = "teezer_music_fav_ids";
const FAV_TRACKS_KEY    = "teezer_music_fav_tracks";

type SortOption = "popular" | "recent" | "likes";

const TABS: { value: SortOption; label: string }[] = [
  { value: "popular", label: "Popular"    },
  { value: "recent",  label: "Recent"     },
  { value: "likes",   label: "Most liked" },
];

function fmtDur(s: number | null | undefined): string {
  if (!s) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/* ─── Share modal ────────────────────────────────────────────────────────── */
function ShareModal({
  open, onClose, title, url,
}: { open: boolean; onClose: () => void; title: string; url: string }) {
  const [copied, setCopied] = useState(false);

  function copyLink() {
    navigator.clipboard.writeText(url).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  const encoded = encodeURIComponent(url);
  const encTitle = encodeURIComponent(title);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
          <span className="text-[15px] font-bold text-[#111827]">Share sound</span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Social buttons */}
        <div className="grid grid-cols-4 gap-3 px-5 py-5">
          {[
            { label: "WhatsApp",  href: `https://wa.me/?text=${encTitle}%20${encoded}`,           bg: "#25d366", icon: "W" },
            { label: "Telegram",  href: `https://t.me/share/url?url=${encoded}&text=${encTitle}`,  bg: "#229ED9", icon: "T" },
            { label: "X / Twitter", href: `https://twitter.com/intent/tweet?url=${encoded}&text=${encTitle}`, bg: "#000", icon: "𝕏" },
            { label: "Facebook",  href: `https://www.facebook.com/sharer/sharer.php?u=${encoded}`, bg: "#1877f2", icon: "f" },
          ].map(s => (
            <a
              key={s.label}
              href={s.href}
              target="_blank"
              rel="noopener noreferrer"
              className="flex flex-col items-center gap-1.5"
              onClick={onClose}
            >
              <span
                className="grid h-12 w-12 place-items-center rounded-full text-[17px] font-bold text-white shadow-md"
                style={{ background: s.bg }}
              >
                {s.icon}
              </span>
              <span className="text-[10px] text-[#6b7280]">{s.label}</span>
            </a>
          ))}
        </div>

        {/* Copy link */}
        <div className="flex items-center gap-2 border-t border-[#f3f4f6] px-5 py-4">
          <input
            readOnly
            value={url}
            className="flex-1 min-w-0 truncate rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2 text-[12px] text-[#374151] outline-none"
          />
          <button
            type="button"
            onClick={copyLink}
            className={cn(
              "flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12px] font-bold transition-all",
              copied
                ? "bg-[#ecfdf5] text-[#059669]"
                : "bg-[#fd4605] text-white hover:bg-[#e03e04]",
            )}
          >
            {copied ? <><Check className="h-3.5 w-3.5" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Embed modal ────────────────────────────────────────────────────────── */
function EmbedModal({ open, onClose, trackId, title }: { open: boolean; onClose: () => void; trackId: number; title: string }) {
  const [copied, setCopied] = useState(false);
  const embedCode = `<iframe src="https://teezer.live/embed/sound/${trackId}" title="${title}" width="360" height="640" frameborder="0" allow="autoplay; clipboard-write; encrypted-media" allowfullscreen></iframe>`;

  function copy() {
    navigator.clipboard.writeText(embedCode).catch(() => null);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
          <span className="text-[15px] font-bold text-[#111827]">Embed sound</span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="px-5 py-5">
          <p className="mb-3 text-[12px] text-[#6b7280]">Paste this code into your website to embed this sound page.</p>
          <textarea
            readOnly
            value={embedCode}
            rows={4}
            className="w-full resize-none rounded-lg border border-[#e5e7eb] bg-[#f9fafb] px-3 py-2.5 text-[11px] font-mono text-[#374151] outline-none"
          />
          <button
            type="button"
            onClick={copy}
            className={cn(
              "mt-3 flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13px] font-bold transition-all",
              copied
                ? "bg-[#ecfdf5] text-[#059669]"
                : "bg-[#fd4605] text-white hover:bg-[#e03e04]",
            )}
          >
            {copied ? <><Check className="h-4 w-4" /> Copied!</> : <><Copy className="h-4 w-4" /> Copy embed code</>}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Report modal ───────────────────────────────────────────────────────── */
function ReportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [selected, setSelected] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const reasons = [
    "Inappropriate content",
    "Copyright violation",
    "Hate speech",
    "Spam or misleading",
    "Other",
  ];

  function submit() {
    if (!selected) return;
    setSubmitted(true);
    setTimeout(() => { setSubmitted(false); setSelected(null); onClose(); }, 1800);
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-2xl bg-white shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
          <span className="text-[15px] font-bold text-[#111827]">Report sound</span>
          <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
        {submitted ? (
          <div className="flex flex-col items-center gap-3 px-5 py-10">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-[#ecfdf5]">
              <Check className="h-7 w-7 text-[#059669]" />
            </div>
            <p className="text-[14px] font-bold text-[#111827]">Report submitted</p>
            <p className="text-center text-[12px] text-[#6b7280]">Thanks for letting us know. We&apos;ll review this sound.</p>
          </div>
        ) : (
          <div className="px-5 py-4">
            <p className="mb-3 text-[12px] text-[#6b7280]">Why are you reporting this sound?</p>
            <div className="space-y-2">
              {reasons.map(r => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setSelected(r)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-[13px] font-medium text-left transition-colors",
                    selected === r
                      ? "border-[#fd4605] bg-[#fff0f3] text-[#fd4605]"
                      : "border-[#e5e7eb] text-[#374151] hover:border-[#d1d5db] hover:bg-[#f9fafb]",
                  )}
                >
                  <span className={cn(
                    "grid h-4 w-4 shrink-0 place-items-center rounded-full border-2",
                    selected === r ? "border-[#fd4605]" : "border-[#d1d5db]",
                  )}>
                    {selected === r && <span className="h-2 w-2 rounded-full bg-[#fd4605]" />}
                  </span>
                  {r}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={submit}
              disabled={!selected}
              className="mt-4 flex w-full items-center justify-center rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-[#e03e04] disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Submit report
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Large cover with play preview ─────────────────────────────────────── */
function TrackCover({ coverUrl, title, audioUrl }: {
  coverUrl: string | null;
  title:    string;
  audioUrl: string | null | undefined;
}) {
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!audioUrl) return;
    const el = new Audio(audioUrl);
    el.onended = () => setPlaying(false);
    audioRef.current = el;
    return () => { el.pause(); el.src = ""; audioRef.current = null; };
  }, [audioUrl]);

  function togglePlay() {
    const el = audioRef.current;
    if (!el) return;
    if (playing) { el.pause(); setPlaying(false); }
    else         { el.play().catch(() => null); setPlaying(true); }
  }

  return (
    <button
      type="button"
      onClick={audioUrl ? togglePlay : undefined}
      className={cn(
        "relative shrink-0 overflow-hidden rounded-2xl shadow-xl",
        "w-[180px] h-[180px] sm:w-[210px] sm:h-[210px]",
        audioUrl ? "cursor-pointer" : "cursor-default",
      )}
      aria-label={playing ? "Pause preview" : "Play preview"}
    >
      {coverUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverUrl} alt={title} className="h-full w-full object-cover" />
      ) : (
        <div className="h-full w-full flex items-center justify-center bg-gradient-to-br from-[#fd4605] to-[#7c3aed]">
          <Music2 className="h-16 w-16 text-white/80" />
        </div>
      )}
      <div className="absolute inset-0 flex items-center justify-center bg-black/20">
        <span className="grid h-12 w-12 place-items-center rounded-full bg-white/90 shadow-lg text-black">
          {playing
            ? <Pause className="h-6 w-6 fill-current" />
            : <Play  className="ml-1 h-6 w-6 fill-current" />}
        </span>
      </div>
    </button>
  );
}

/* ─── Video card ─────────────────────────────────────────────────────────── */
function VideoCard({ video, showOriginal }: { video: TeezerVideo; showOriginal?: boolean }) {
  const username     = video.user?.username ?? "user";
  const avatarLetter = (username[0] ?? "U").toUpperCase();

  return (
    <Link href={`/videos/${video.id}`} className="group block">
      <div className="relative aspect-[9/14] overflow-hidden rounded-xl bg-[#1a1a2e]">
        {video.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={video.thumbnail_url}
            alt={video.caption ?? video.title ?? "Video"}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-[#2e1640] to-[#111]" />
        )}

        {showOriginal && (
          <div className="absolute left-1.5 top-1.5 flex items-center gap-0.5 rounded-md bg-black/55 px-1.5 py-0.5 backdrop-blur-sm">
            <span className="text-[9px] font-bold uppercase tracking-wide text-white/90">Original</span>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent p-2 pt-8">
          <div className="mb-0.5 flex items-center gap-1">
            {video.user?.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={video.user.avatar} alt={username} className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-white/30" />
            ) : (
              <div className="h-4 w-4 shrink-0 rounded-full bg-[#fd4605] grid place-items-center ring-1 ring-white/30">
                <span className="text-[6px] font-bold text-white">{avatarLetter}</span>
              </div>
            )}
            <span className="truncate text-[9.5px] font-semibold text-white/90">@{username}</span>
            {video.user?.is_verified && <VerifiedBadge size={9} />}
          </div>
          {(video.caption ?? video.title) && (
            <p className="mb-1 line-clamp-2 text-[9px] leading-tight text-white/65">
              {video.caption ?? video.title}
            </p>
          )}
          <div className="flex items-center gap-2 text-white/55">
            <span className="flex items-center gap-0.5 text-[9px]">
              <Eye className="h-2.5 w-2.5" />
              {formatCompact(video.views_count ?? 0)}
            </span>
            <span className="flex items-center gap-0.5 text-[9px]">
              <Heart className="h-2.5 w-2.5" />
              {formatCompact(video.likes_count ?? 0)}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}

/* ─── Skeleton cards ─────────────────────────────────────────────────────── */
function SkeletonGrid() {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
      {Array.from({ length: 12 }).map((_, i) => (
        <div key={i} className="aspect-[9/14] animate-pulse rounded-xl bg-[#f1f1f2]" />
      ))}
    </div>
  );
}

/* ─── Main page ──────────────────────────────────────────────────────────── */
export function SoundDetailPage({ id }: { id: number }) {
  const router = useRouter();

  const [sort,        setSort]        = useState<SortOption>("popular");
  const [allVideos,   setAllVideos]   = useState<TeezerVideo[]>([]);
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saved,       setSaved]       = useState(false);

  const [shareOpen,   setShareOpen]   = useState(false);
  const [embedOpen,   setEmbedOpen]   = useState(false);
  const [reportOpen,  setReportOpen]  = useState(false);
  const [menuOpen,    setMenuOpen]    = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  /* ── Close three-dot menu on outside click ── */
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  /* ── Track detail ── */
  const { data: trackRes, isLoading: trackLoading, isError } = useQuery({
    queryKey: ["music-track", id],
    queryFn:  () => audioService.getMusicDetail(id),
    retry: 1,
    staleTime: 60_000,
  });
  const track: MusicTrackDetail | null = trackRes?.data ?? null;

  /* ── Init saved state from localStorage ── */
  useEffect(() => {
    try {
      const ids: number[] = JSON.parse(localStorage.getItem(FAV_IDS_KEY) ?? "[]");
      setSaved(ids.includes(id));
    } catch {}
  }, [id]);

  /* ── Videos ── */
  const { data: videosRes, isLoading: videosLoading } = useQuery({
    queryKey: ["music-videos", id, sort],
    queryFn:  () => audioService.getMusicVideos(id, sort, 1, 24),
    enabled:  !!track,
    staleTime: 30_000,
  });

  useEffect(() => {
    setPage(1);
    setAllVideos([]);
    setHasMore(true);
  }, [sort]);

  useEffect(() => {
    if (videosRes?.data) {
      setAllVideos(videosRes.data);
      setHasMore((videosRes.meta?.current_page ?? 1) < (videosRes.meta?.last_page ?? 1));
      setPage(videosRes.meta?.current_page ?? 1);
    }
  }, [videosRes]);

  /* ── Load more ── */
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !track) return;
    setLoadingMore(true);
    try {
      const res = await audioService.getMusicVideos(id, sort, page + 1, 24);
      setAllVideos(prev => [...prev, ...res.data]);
      setPage(res.meta.current_page);
      setHasMore(res.meta.current_page < res.meta.last_page);
    } finally {
      setLoadingMore(false);
    }
  }, [id, sort, page, loadingMore, hasMore, track]);

  /* ── Save / unsave ── */
  function toggleSave() {
    if (!track) return;
    const next = !saved;
    try {
      const ids: number[]                = JSON.parse(localStorage.getItem(FAV_IDS_KEY)    ?? "[]");
      const map: Record<string, unknown> = JSON.parse(localStorage.getItem(FAV_TRACKS_KEY) ?? "{}");
      if (next) {
        if (!ids.includes(track.id)) ids.push(track.id);
        map[String(track.id)] = {
          id:          track.id,
          title:       track.title,
          artist:      track.artist_name,
          cover_url:   track.cover_url,
          audio_url:   track.audio_url ?? "",
          duration:    track.duration,
          usage_count: track.uses_count,
          mood:        track.mood,
          genre:       track.genre,
          is_original: track.source_type === "original",
          user_id:     track.uploader?.id ?? null,
          created_at:  new Date().toISOString(),
          updated_at:  new Date().toISOString(),
        };
      } else {
        const idx = ids.indexOf(track.id);
        if (idx !== -1) ids.splice(idx, 1);
        delete map[String(track.id)];
      }
      localStorage.setItem(FAV_IDS_KEY,    JSON.stringify(ids));
      localStorage.setItem(FAV_TRACKS_KEY, JSON.stringify(map));
      setSaved(next);
    } catch {}
    try { audioService.toggleFavorite(id); } catch {}
  }

  /* ── Use this sound ── */
  function handleUseSound() {
    if (!track) return;
    const payload: AudioTrack = {
      id:           track.id,
      title:        track.title,
      artist:       track.artist_name,
      cover_url:    track.cover_url,
      audio_url:    track.audio_url ?? "",
      duration:     track.duration,
      usage_count:  track.uses_count,
      mood:         track.mood,
      genre:        track.genre,
      usage_rights: null,
      is_original:  track.source_type === "original",
      user_id:      track.uploader?.id ?? null,
      created_at:   new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    };
    try { localStorage.setItem(PENDING_SOUND_KEY, JSON.stringify(payload)); } catch {}
    router.push("/upload");
  }

  /* ════════ Loading ════════════════════════════════════════════════════════ */
  if (trackLoading) {
    return (
      <AppShell backTitle="Sound" onBack={() => router.back()}>
        <div className="mx-auto w-full max-w-[1280px] px-4 py-8 sm:px-6">
          <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:gap-8">
            <div className="h-[180px] w-[180px] shrink-0 animate-pulse rounded-2xl bg-[#f1f1f2] sm:h-[210px] sm:w-[210px]" />
            <div className="flex-1 space-y-3 pt-2">
              <div className="h-7 w-48 animate-pulse rounded-lg bg-[#f1f1f2]" />
              <div className="h-4 w-32 animate-pulse rounded-lg bg-[#f1f1f2]" />
              <div className="h-3 w-24 animate-pulse rounded-lg bg-[#f1f1f2]" />
              <div className="mt-4 flex gap-2">
                <div className="h-9 w-36 animate-pulse rounded-xl bg-[#f1f1f2]" />
                <div className="h-9 w-20 animate-pulse rounded-xl bg-[#f1f1f2]" />
              </div>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  /* ════════ Error / not found ══════════════════════════════════════════════ */
  if (isError || !track) {
    return (
      <AppShell backTitle="Sound" onBack={() => router.back()}>
        <div className="flex flex-col items-center justify-center gap-4 px-8 pt-32 text-center">
          <div className="grid h-20 w-20 place-items-center rounded-full bg-[#f9fafb]">
            <Music2 className="h-9 w-9 text-[#d1d5db]" />
          </div>
          <p className="text-[16px] font-bold text-[#111827]">Sound not found</p>
          <p className="text-[13px] text-[#6b7280]">This sound may have been removed or is unavailable.</p>
          <button
            type="button"
            onClick={() => router.back()}
            className="mt-2 rounded-xl border border-[#e5e7eb] px-5 py-2 text-[13px] font-semibold text-[#374151] hover:border-[#d1d5db] hover:bg-[#f9fafb] transition-colors"
          >
            Go back
          </button>
        </div>
      </AppShell>
    );
  }

  const videoCount = track.videos_count ?? track.uses_count ?? 0;
  const pageUrl    = typeof window !== "undefined" ? window.location.href : `https://teezer.live/sound/${id}`;

  /* ─── Artist / uploader element ── */
  const artistEl = track.artist_name ? (
    track.uploader ? (
      <Link
        href={`/profile/${track.uploader.username}`}
        className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#374151] hover:underline hover:text-[#fd4605] transition-colors"
      >
        {track.artist_name}
        {track.uploader.is_verified && <VerifiedBadge size={14} />}
      </Link>
    ) : (
      <span className="inline-flex items-center gap-1 text-[14px] font-semibold text-[#374151]">
        {track.artist_name}
        <VerifiedBadge size={14} />
      </span>
    )
  ) : null;

  /* ════════ Main render ════════════════════════════════════════════════════ */
  return (
    <AppShell backTitle="Sound" onBack={() => router.back()}>
      {/* Modals */}
      <ShareModal  open={shareOpen}  onClose={() => setShareOpen(false)}  title={track.source_type === "original" && (track.uploader?.name || track.uploader?.username) ? `Original Track - ${track.uploader.name || track.uploader.username}` : track.title} url={pageUrl} />
      <EmbedModal  open={embedOpen}  onClose={() => setEmbedOpen(false)}  trackId={id} title={track.source_type === "original" && (track.uploader?.name || track.uploader?.username) ? `Original Track - ${track.uploader.name || track.uploader.username}` : track.title} />
      <ReportModal open={reportOpen} onClose={() => setReportOpen(false)} />

      <div className="overflow-x-hidden">
        <div className="mx-auto w-full max-w-[1280px] px-4 sm:px-6">

          {/* ════ Sound header ════════════════════════════════════════════════ */}
          <div className="flex flex-col gap-5 border-b border-[#f3f4f6] py-6 sm:flex-row sm:items-start sm:gap-7">

            {/* Cover */}
            <TrackCover
              coverUrl={track.cover_url ?? (track.source_type === "original" ? (track.uploader?.avatar ?? null) : null)}
              title={track.title}
              audioUrl={track.audio_url}
            />

            {/* Info */}
            <div className="flex min-w-0 flex-1 flex-col justify-center">

              {/* Title + Share + Three-dot */}
              <div className="flex items-start gap-2">
                <h1 className="flex-1 text-[22px] font-extrabold leading-tight text-[#111827] sm:text-[26px]">
                  {track.source_type === "original" && (track.uploader?.name || track.uploader?.username)
                    ? `Original Track - ${track.uploader.name || track.uploader.username}`
                    : track.title}
                </h1>

                {/* Share button - opens modal */}
                <button
                  type="button"
                  onClick={() => setShareOpen(true)}
                  className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e5e7eb] text-[#374151] transition-colors hover:border-[#d1d5db] hover:bg-[#f9fafb] active:scale-95"
                  aria-label="Share"
                >
                  <Share2 className="h-[17px] w-[17px]" strokeWidth={2.5} />
                </button>

                {/* Three-dot menu */}
                <div ref={menuRef} className="relative mt-0.5">
                  <button
                    type="button"
                    onClick={() => setMenuOpen(v => !v)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-[#e5e7eb] text-[#374151] transition-colors hover:border-[#d1d5db] hover:bg-[#f9fafb] active:scale-95"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="h-[17px] w-[17px]" strokeWidth={2.5} />
                  </button>

                  {/* Dropdown */}
                  {menuOpen && (
                    <div className="absolute right-0 top-[calc(100%+6px)] z-40 w-52 overflow-hidden rounded-xl border border-[#f3f4f6] bg-white shadow-lg">
                      {/* Save */}
                      <button
                        type="button"
                        onClick={() => { toggleSave(); setMenuOpen(false); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors"
                      >
                        {saved
                          ? <><BookmarkCheck className="h-4 w-4 text-[#fd4605]" /> Unsave track</>
                          : <><Bookmark      className="h-4 w-4" />               Save track</>}
                      </button>

                      {/* Embed */}
                      <button
                        type="button"
                        onClick={() => { setEmbedOpen(true); setMenuOpen(false); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium text-[#374151] hover:bg-[#f9fafb] transition-colors border-t border-[#f3f4f6]"
                      >
                        <Code className="h-4 w-4" />
                        Embed
                      </button>

                      {/* Report */}
                      <button
                        type="button"
                        onClick={() => { setReportOpen(true); setMenuOpen(false); }}
                        className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-medium text-[#fd4605] hover:bg-[#fff0f3] transition-colors border-t border-[#f3f4f6]"
                      >
                        <Flag className="h-4 w-4" />
                        Report
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Artist / original badge */}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {track.source_type === "original" && (
                  <span className="inline-flex items-center rounded-md bg-[#fff0f3] px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-[#fd4605]">
                    Original Track
                  </span>
                )}
                {artistEl}
              </div>

              {/* Stats */}
              <p className="mt-1 text-[13px] font-medium text-[#9ca3af]">
                {formatCompact(videoCount)} {videoCount === 1 ? "video" : "videos"}
                {track.duration ? <span className="text-[#d1d5db]"> · </span> : null}
                {track.duration ? <span>{fmtDur(track.duration)}</span> : null}
              </p>

              {track.genre && (
                <p className="mt-0.5 text-[12px] text-[#9ca3af]">{track.genre}</p>
              )}

              {/* Action buttons */}
              <div className="mt-4 flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleUseSound}
                  className="inline-flex items-center gap-2 rounded-xl bg-[#fd4605] px-4 py-2.5 text-[13px] font-bold text-white shadow-sm transition-colors hover:bg-[#e03e04] active:scale-[0.97]"
                >
                  <Music2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Use this sound
                </button>

                <button
                  type="button"
                  onClick={toggleSave}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-xl border px-4 py-2.5 text-[13px] font-bold transition-all active:scale-[0.97]",
                    saved
                      ? "border-[#fd4605] bg-[#fff0f3] text-[#fd4605]"
                      : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#d1d5db] hover:bg-[#f9fafb]",
                  )}
                  aria-label={saved ? "Unsave" : "Save"}
                >
                  {saved
                    ? <BookmarkCheck className="h-3.5 w-3.5" strokeWidth={2.5} />
                    : <Bookmark      className="h-3.5 w-3.5" strokeWidth={2.5} />}
                  {saved ? "Saved" : "Save"}
                </button>
              </div>
            </div>
          </div>

          {/* ════ Tabs ════════════════════════════════════════════════════════ */}
          <div className="flex items-center gap-1 border-b border-[#f3f4f6] pt-1">
            {TABS.map(tab => (
              <button
                key={tab.value}
                type="button"
                onClick={() => setSort(tab.value)}
                className={cn(
                  "relative px-4 py-3 text-[14px] font-semibold transition-colors",
                  sort === tab.value
                    ? "text-[#fd4605] after:absolute after:inset-x-0 after:bottom-0 after:h-[2px] after:rounded-full after:bg-[#fd4605] after:content-['']"
                    : "text-[#9ca3af] hover:text-[#374151]",
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ════ Video grid ══════════════════════════════════════════════════ */}
          <div className="pb-12 pt-5">
            {videosLoading && allVideos.length === 0 ? (
              <SkeletonGrid />
            ) : allVideos.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
                <div className="grid h-16 w-16 place-items-center rounded-full bg-[#f9fafb]">
                  <Music2 className="h-7 w-7 text-[#d1d5db]" />
                </div>
                <p className="text-[15px] font-bold text-[#111827]">No videos yet</p>
                <p className="text-[13px] text-[#6b7280]">Be the first to use this sound.</p>
                <button
                  type="button"
                  onClick={handleUseSound}
                  className="mt-1 inline-flex items-center gap-2 rounded-xl bg-[#fd4605] px-5 py-2.5 text-[13px] font-bold text-white hover:bg-[#e03e04] transition-colors"
                >
                  <Music2 className="h-3.5 w-3.5" strokeWidth={2.5} />
                  Use this sound
                </button>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
                  {allVideos.map((video, idx) => (
                    <VideoCard
                      key={video.id}
                      video={video}
                      showOriginal={idx === 0 && sort === "popular"}
                    />
                  ))}
                </div>

                {hasMore && (
                  <div className="mt-7 flex justify-center">
                    <button
                      type="button"
                      onClick={loadMore}
                      disabled={loadingMore}
                      className="flex items-center gap-2 rounded-xl border border-[#e5e7eb] px-7 py-2.5 text-[13px] font-semibold text-[#374151] transition-colors hover:border-[#d1d5db] hover:bg-[#f9fafb] disabled:opacity-50"
                    >
                      {loadingMore ? (
                        <>
                          <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
                          Loading…
                        </>
                      ) : "Load more"}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
