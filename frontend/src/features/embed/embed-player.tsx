"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useHlsSource } from "@/hooks/use-hls-source";

/* Only the fields this standalone player actually reads out of the raw
   /videos/{id} JSON (VideoResource's shape) - not the full TeezerVideo type,
   since that carries required fields this plain-fetch payload doesn't promise. */
type EmbedVideo = {
  id: number;
  video_url?: string | null;
  hls_url?: string | null;
  thumbnail_url?: string | null;
  title?: string | null;
  caption?: string | null;
  user?: { username?: string | null; avatar?: string | null } | null;
};

/* Public API base - same env var the rest of the app uses */
const API_BASE =
  (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_API_URL) ||
  "https://api.teezer.live/api/v1";

/* ─────────────────────────────────────────────────────────────────────────
   EmbedPlayer - standalone, no auth, no shared axios instance.
   Uses plain fetch() so zero dependency on auth interceptors /
   query-provider / teezer:unauthorized events.
───────────────────────────────────────────────────────────────────────── */
export function EmbedPlayer({
  videoId,
  autoplay    = false,
  showCaption = true,
}: {
  videoId:      number;
  autoplay?:    boolean;
  showCaption?: boolean;
}) {
  const [video,   setVideo]   = useState<EmbedVideo | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const [playing, setPlaying] = useState(autoplay);
  const [muted,   setMuted]   = useState(true);
  const videoRef = useRef<HTMLVideoElement>(null);

  /* Fetch video via plain fetch - completely bypasses auth interceptors */
  useEffect(() => {
    if (!videoId || isNaN(videoId)) { setError("Invalid video ID."); return; }

    fetch(`${API_BASE}/videos/${videoId}`, {
      headers: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const json = await r.json();
        const v = json?.data ?? json;
        if (!v?.id) throw new Error("Empty response");
        setVideo(v);
      })
      .catch((e) => {
        console.error("[EmbedPlayer] fetch failed:", e.message);
        setError("Video not available");
      });
  }, [videoId]);

  /* Sync play / pause to <video> element */
  useEffect(() => {
    const el = videoRef.current;
    if (!el || !video) return;
    if (playing) el.play().catch(() => {});
    else         el.pause();
  }, [playing, video]);

  // Prefer the adaptive HLS ladder; fall back to the progressive mp4 while
  // the transcode hasn't finished yet (hls_url is null).
  useHlsSource(videoRef, video?.hls_url ?? video?.video_url ?? undefined, video?.video_url);

  /* ── Error state ── */
  if (error) return (
    <div className="flex h-screen w-screen flex-col items-center justify-center gap-4 bg-black">
      <svg className="h-14 w-14 text-white/30" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.182 16.318A4.486 4.486 0 0012.016 15a4.486 4.486 0 00-3.198 1.318M21 12a9 9 0 11-18 0 9 9 0 0118 0zM9.75 9.75c0 .414-.168.75-.375.75S9 10.164 9 9.75 9.168 9 9.375 9s.375.336.375.75zm-.375 0h.008v.015h-.008V9.75zm5.625 0c0 .414-.168.75-.375.75s-.375-.336-.375-.75.168-.75.375-.75.375.336.375.75zm-.375 0h.008v.015h-.008V9.75z" />
      </svg>
      <p className="text-[13px] font-semibold text-white/50">{error}</p>
      <a
        href="https://teezer.live"
        target="_blank"
        rel="noopener noreferrer"
        className="mt-1 rounded-full bg-[#fd4605] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#e03e04]"
      >
        Open Teezer
      </a>
    </div>
  );

  /* ── Loading state ── */
  if (!video) return (
    <div className="flex h-screen w-screen items-center justify-center bg-black">
      <div className="h-9 w-9 animate-spin rounded-full border-[3px] border-white/20 border-t-white" />
    </div>
  );

  const videoSrc  = video.hls_url ?? video.video_url ?? null;
  const thumb     = video.thumbnail_url ?? null;
  const title     = video.title ?? video.caption ?? "";
  const username  = video.user?.username ?? "teezer";
  const avatar    = video.user?.avatar ?? null;
  const origin    = typeof window !== "undefined" ? window.location.origin : "https://teezer.live";
  const watchUrl  = `${origin}/videos/${videoId}`;

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black select-none">

      {/* ── Video element ── */}
      {videoSrc ? (
        <video
          ref={videoRef}
          // src is wired imperatively by useHlsSource above (needs hls.js for
          // .m3u8 on non-Safari browsers).
          poster={thumb ?? undefined}
          className="h-full w-full object-cover"
          loop
          playsInline
          muted={muted}
          autoPlay={autoplay}
          onPlay={()  => setPlaying(true)}
          onPause={()  => setPlaying(false)}
          onClick={() => setPlaying(p => !p)}
          onError={()  => setError("Couldn't load video file.")}
        />
      ) : (
        /* Thumbnail-only fallback when no playable URL is available */
        thumb && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt={title} className="h-full w-full object-cover opacity-60" />
        )
      )}

      {/* ── Play / pause overlay ── */}
      {!playing && (
        <button
          aria-label="Play"
          onClick={() => setPlaying(true)}
          className="absolute inset-0 flex items-center justify-center"
        >
          <div className="grid h-16 w-16 place-items-center rounded-full bg-black/50 backdrop-blur-sm ring-1 ring-white/20">
            <svg className="h-7 w-7 translate-x-0.5 text-white" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </button>
      )}

      {/* ── Bottom bar ── */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent px-4 pb-4 pt-14">

        {/* Caption */}
        {showCaption && title && (
          <p className="mb-3 line-clamp-2 text-[13px] leading-snug text-white/90">{title}</p>
        )}

        <div className="flex items-center justify-between gap-3">

          {/* Creator link */}
          <Link
            href={`${origin}/profile/${username}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex min-w-0 items-center gap-2"
          >
            {avatar
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={avatar} alt={username} className="h-7 w-7 flex-shrink-0 rounded-full object-cover ring-1 ring-white/30" />
              : <div className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-full bg-[#fd4605] text-[10px] font-black text-white">{username[0]?.toUpperCase()}</div>}
            <span className="truncate text-[12px] font-semibold text-white">@{username}</span>
          </Link>

          {/* Controls */}
          <div className="flex flex-shrink-0 items-center gap-2">
            {/* Mute toggle */}
            <button
              aria-label={muted ? "Unmute" : "Mute"}
              onClick={() => setMuted(m => !m)}
              className="grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white ring-1 ring-white/10 backdrop-blur-sm"
            >
              {muted
                ? /* muted icon */
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
                  </svg>
                : /* unmuted icon */
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
                  </svg>}
            </button>

            {/* Watch on Teezer */}
            <Link
              href={watchUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-full bg-[#fd4605] px-3 py-1.5 text-[11px] font-bold text-white ring-1 ring-[#fd4605]/50 hover:bg-[#e03e04] transition"
            >
              <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                <polyline points="15 3 21 3 21 9"/>
                <line x1="10" y1="14" x2="21" y2="3"/>
              </svg>
              Watch on Teezer
            </Link>
          </div>
        </div>
      </div>

      {/* ── Teezer watermark ── */}
      <div className="absolute right-3 top-3 rounded-full bg-black/50 px-2.5 py-1 backdrop-blur-sm">
        <span className="text-[10px] font-black tracking-wide text-white">Teezer</span>
      </div>
    </div>
  );
}
