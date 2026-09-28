"use client";

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink, Images,
  MapPin, MessageCircle, MoreVertical, Music2, Play, Share2, Sparkles, Upload as UploadIcon, Volume2, VolumeX,
} from "lucide-react";
import { toast } from "sonner";
import { notify } from "@/lib/notify";
import { ContentLinkBar } from "@/components/feed/content-link-bar";
import { AppShell } from "@/components/layout/app-shell";
import { useCall } from "@/features/calls/call-provider";
import { FollowButton } from "@/components/user/follow-button";
import { VideoOptionsMenu } from "@/components/video/video-options-menu";
import { AnimatedHeart, AnimatedBookmark } from "@/components/video/animated-like-save";
import { ReportModal } from "@/components/report/ReportModal";
import { VideoCommentsDrawer } from "@/components/video/video-comments-drawer";
import { VideoSharePanel } from "@/components/video/video-share-panel";
import { TaggedPeopleSheet } from "@/components/video/tagged-people-sheet";
import { CreateStoryModal, type SharedVideoSource } from "@/components/story/create-story-modal";
import { StoryRingAvatar } from "@/components/story/story-ring-avatar";
import { videoService } from "@/services/video.service";
import { trackVideoEvent, trackWatchSession } from "@/services/videoEvent.service";
import { useWatchTracker } from "@/hooks/useWatchTracker";
import { preloadHls, useHlsSource } from "@/hooks/use-hls-source";
import { useAuthStore } from "@/store/auth.store";
import { useHydrated } from "@/hooks/use-hydrated";
import { useFeedStore } from "@/store/feed.store";
import { useUiStore } from "@/store/ui.store";
import { formatCompact, cn, locationSlug } from "@/lib/utils";
import { syncLike, syncSave } from "@/lib/like-sync";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { ReelsooVideo } from "@/types/video";
import { DoubleTapLike } from "./double-tap-like";
import type { HeartItem } from "./double-tap-like";

/* ─── Helpers ──────────────────────────────────────────────────────────────── */
function fmtTime(s: number): string {
  if (!isFinite(s) || s < 0) return "00:00";
  const m = Math.floor(s / 60).toString().padStart(2, "0");
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}


function colorFor(seed?: string | number | null): string {
  const palette = ["#fe2c55", "#1d8cff", "#a855f7", "#10b981", "#f97316", "#0ea5e9", "#8b5cf6", "#ef4444"];
  const s = String(seed ?? "x");
  let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

const TOPBAR_H = 64; // matches --topbar-h in globals.css

/* ─── Fixed portrait media shell ─────────────────────────────────────────────
   Every post - portrait, landscape, square or any ratio - is shown inside ONE
   consistent portrait (9:16) player shell, like the old Reelsoo feed. The media
   is fit inside with object-fit: contain, so landscape / square clips are
   letterboxed (black background + optional blurred backdrop) without ever
   changing the outer player shape. No orientation-based outer layouts. ─────── */

export type FeedOrientation = "portrait" | "landscape" | "square";

function orientationOf(ar: number): FeedOrientation {
  return ar < 0.8 ? "portrait" : ar > 1.2 ? "landscape" : "square";
}

/** Resolve the best-known aspect ratio for a post (measured > stored > default). */
function resolveAspectRatio(video: ReelsooVideo, measured?: number): number {
  if (measured && measured > 0) return measured;
  if (video.aspect_ratio && video.aspect_ratio > 0) return video.aspect_ratio;
  if (video.width && video.height) return video.width / video.height;
  return 9 / 16; // default fallback = portrait until metadata loads (req #10)
}

/** Fixed portrait (9:16) outer shell for every post, regardless of media ratio.
    Height drives the size (tall, centered, old Reelsoo feel); width follows the
    9:16 ratio and is capped so the player never becomes landscape or square.
    The returned `orientation` is the MEDIA's orientation - used only to decide
    whether to paint the blurred backdrop behind letterboxed media, NOT to size
    the shell. */
function computeShell(ar: number, mediaMaxW: number, maxH: number) {
  const orientation = orientationOf(ar);
  // Fill the available height - `maxH` already leaves a small top/bottom gap
  // (the feed area minus a ~12px margin each side) - so the portrait player is
  // tall with only small spacing above/below. Width follows the 9:16 ratio and
  // is capped generously so the shape stays portrait and sane on huge monitors.
  let h = Math.min(maxH, 1080);
  let w = Math.round((h * 9) / 16);
  const maxW = Math.min(mediaMaxW, 640);
  if (w > maxW) { w = maxW; h = Math.round((w * 16) / 9); }
  return { w, h, orientation };
}

/* ─── Adaptive video viewport ───────────────────────────────────────────────── */
function useVideoDims() {
  const [dims, setDims] = useState({ width: 380, height: 676 });

  useEffect(() => {
    const compute = () => {
      const isXl = window.innerWidth >= 1280; // xl: topbar hidden, video fills full height
      const availH = Math.max(500, window.innerHeight - (isXl ? 0 : TOPBAR_H));
      const maxW = Math.min(560, Math.max(360, window.innerWidth * 0.32));
      const wFromH = Math.round((availH * 9) / 16);
      setDims({ width: wFromH <= maxW ? wFromH : maxW, height: availH });
    };
    compute();
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return dims;
}

/** "This post has tagged people" - the exact glyph used in the mobile app
 *  (FeedVideoItem.tsx's TagIconGlyph), reproduced as a plain SVG so both
 *  platforms show the identical icon rather than two different ones. */
function TagIconGlyph({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="#fff">
      <path d="M19.2914 5.99994H20.0002C20.5525 5.99994 21.0002 6.44766 21.0002 6.99994V13.9999C21.0002 14.5522 20.5525 14.9999 20.0002 14.9999H18.0002L13.8319 9.16427C13.3345 8.46797 12.4493 8.16522 11.6297 8.41109L9.14444 9.15668C8.43971 9.3681 7.6758 9.17551 7.15553 8.65524L6.86277 8.36247C6.41655 7.91626 6.49011 7.17336 7.01517 6.82332L12.4162 3.22262C13.0752 2.78333 13.9312 2.77422 14.5994 3.1994L18.7546 5.8436C18.915 5.94571 19.1013 5.99994 19.2914 5.99994ZM5.02708 14.2947L3.41132 15.7085C2.93991 16.1209 2.95945 16.8603 3.45201 17.2474L8.59277 21.2865C9.07284 21.6637 9.77592 21.5264 10.0788 20.9963L10.7827 19.7645C11.2127 19.012 11.1091 18.0682 10.5261 17.4269L7.82397 14.4545C7.09091 13.6481 5.84722 13.5771 5.02708 14.2947ZM7.04557 5H3C2.44772 5 2 5.44772 2 6V13.5158C2 13.9242 2.12475 14.3173 2.35019 14.6464C2.3741 14.6238 2.39856 14.6015 2.42357 14.5796L4.03933 13.1658C5.47457 11.91 7.65103 12.0343 8.93388 13.4455L11.6361 16.4179C12.6563 17.5401 12.8376 19.1918 12.0851 20.5087L11.4308 21.6538C11.9937 21.8671 12.635 21.819 13.169 21.4986L17.5782 18.8531C18.0786 18.5528 18.2166 17.8896 17.8776 17.4146L12.6109 10.0361C12.4865 9.86205 12.2652 9.78636 12.0603 9.84783L9.57505 10.5934C8.34176 10.9634 7.00492 10.6264 6.09446 9.7159L5.80169 9.42313C4.68615 8.30759 4.87005 6.45035 6.18271 5.57524L7.04557 5Z" />
    </svg>
  );
}

/** "This post has collab (paid partnership) tags" - the exact icon supplied
 *  for this feature (mobile/src/assets/collaboration_handshake_icon.svg),
 *  reproduced as a plain SVG. Stroke-based like the source; yellow so it
 *  reads distinctly from the plain tag icon, same as the app. */
function CollabIconGlyph({ size = 15, color = "#F5C518" }: { size?: number; color?: string }) {
  const strokeProps = { stroke: color, strokeWidth: 18, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 512 512" fill="none">
      <circle cx={190} cy={256} r={105} {...strokeProps} />
      <circle cx={322} cy={256} r={105} {...strokeProps} />
      <path d="M205 250l35-31c9-8 22-9 32-2l17 12" {...strokeProps} />
      <path d="M307 229l17-12c10-7 23-6 32 2l35 31" {...strokeProps} />
      <path d="M221 267l31 30c8 8 21 8 29 0l11-11" {...strokeProps} />
      <path d="M291 286l11 11c8 8 21 8 29 0l31-30" {...strokeProps} />
      <path d="M252 297l-13 13c-7 7-18 7-25 0l-17-17" {...strokeProps} />
      <path d="M291 297l13 13c7 7 18 7 25 0l17-17" {...strokeProps} />
      <path d="M240 250l22 21c7 7 18 7 25 0l20-20" {...strokeProps} />
      <path d="M218 266l15 15" {...strokeProps} />
      <path d="M333 266l-15 15" {...strokeProps} />
    </svg>
  );
}

/* ─── Main page component ──────────────────────────────────────────────────── */
export function FeedPage({ mode = "home", onEmpty }: { mode?: "home" | "following" | "explore"; onEmpty?: () => void }) {
  const { width: VIDEO_W, height: videoDimsH } = useVideoDims();
  const {
    videos, activeIndex, initialized, loading, loadingMore, hasMore, error,
    initialize, fetchMore, setActiveIndex,
  } = useFeedStore();

  /* Re-initialize when mode changes (home ↔ following). The store is smart
     enough to skip if already initialised for the same mode. */
  useEffect(() => {
    void initialize(mode === "following" ? "following" : "home");
  }, [mode, initialize]);

  useEffect(() => {
    preloadHls();
  }, []);

  /* Reset + re-fetch whenever the user logs in or out so the feed always
     reflects the current auth state (personalized vs. guest). */
  const isAuthForFeed  = useAuthStore((s) => s.isAuthenticated);
  /* Whether the auth state is actually KNOWN yet. isAuthenticated alone is false
     both for a guest and for a logged-in user whose session hasn't been restored
     - and on the server it is always false, so the empty state's guest branch
     would otherwise be prerendered into the HTML and flash on every refresh. */
  const authReadyForFeed   = useAuthStore((s) => s.authReady);
  const authLoadingForFeed = useAuthStore((s) => s.isLoading);
  const feedHydrated       = useHydrated();
  const authResolved       = feedHydrated && authReadyForFeed && !authLoadingForFeed;
  const prevAuthRef    = useRef(isAuthForFeed);
  useEffect(() => {
    if (prevAuthRef.current === isAuthForFeed) return;
    prevAuthRef.current = isAuthForFeed;
    useFeedStore.getState().reset();
    void initialize(mode === "following" ? "following" : "home");
  }, [isAuthForFeed, mode, initialize]);

  /* Prevent any full-page scroll */
  useEffect(() => {
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    return () => {
      document.documentElement.style.overflow = "";
      document.body.style.overflow = "";
    };
  }, []);

  const videoAreaRef   = useRef<HTMLDivElement>(null);
  const [containerH,   setContainerH]   = useState(0);
  const [containerW,   setContainerW]   = useState(0);
  useLayoutEffect(() => {
    const el = videoAreaRef.current;
    if (!el) return;
    const measure = () => { setContainerH(el.clientHeight); setContainerW(el.clientWidth); };
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  // Use the viewport-derived height (videoDimsH), which is immune to the
  // Accessibility Text-Size zoom (body { zoom }). containerH is measured with
  // clientHeight and is scaled by that zoom, so using it would shrink the player
  // at Small text size and grow it at Large. videoDimsH keeps the player a
  // CONSTANT, full height at every text size (the .feed-zoom-cancel wrapper then
  // renders it at natural scale).
  const VIDEO_H = videoDimsH;
  // Subtract 12 px so the centered video sits ~6 px from the top/bottom edges.
  const CLIP_H  = Math.max(400, VIDEO_H - 12);

  /* Measured aspect ratios captured from the media itself once it loads -
     the fallback for legacy posts / images that have no stored dimensions. */
  const [measuredAr, setMeasuredAr] = useState<Record<number, number>>({});
  const onAspectRatio = useCallback((id: number, ar: number) => {
    if (!ar || !isFinite(ar) || ar <= 0) return;
    setMeasuredAr((prev) => {
      // Skip near-identical updates to avoid needless layout churn.
      if (prev[id] && Math.abs(prev[id] - ar) < 0.01) return prev;
      return { ...prev, [id]: ar };
    });
  }, []);

  // Per-post shell dimensions, sized to each post's real aspect ratio.
  const mediaMaxW = Math.max(280, Math.min((containerW || VIDEO_W * 2) - 140, 1100));
  const maxH      = Math.max(360, VIDEO_H - 12);
  const shells = useMemo(
    () => videos.map((v) => computeShell(resolveAspectRatio(v, measuredAr[v.id]), mediaMaxW, maxH)),
    [videos, measuredAr, mediaMaxW, maxH],
  );

  // Each post occupies one full-viewport-height section, so the track simply
  // shifts up by one viewport per post - only one post is ever visible, and the
  // media (whatever its aspect ratio) is centered inside its own section.
  const trackOffset = -activeIndex * VIDEO_H;
  const animatingRef   = useRef(false);
  const activeRef      = useRef(activeIndex);
  const videosRef      = useRef(videos);

  // Sync refs in effects so the wheel handler (bound once in another effect)
  // always sees the latest values without re-binding on every render.
  useEffect(() => { activeRef.current = activeIndex; }, [activeIndex]);
  useEffect(() => { videosRef.current = videos; }, [videos]);

  /* Realtime: join the room for the video currently on screen so likes/
     comments/shares/saves from OTHER viewers update this device live -
     mirrors the mobile app's identical effect in HomeScreen.tsx. Patches
     useFeedStore directly (the single source of truth videos[] already
     renders from), so no extra state layer or refetch is needed. */
  const { getSocket } = useCall();
  useEffect(() => {
    const v = videos[activeIndex];
    if (!v) return;
    const socket = getSocket();
    if (!socket) return;
    const room = `video:${v.id}`;
    socket.emit("room:join", { room });

    const onLikeChange = (d: any) => {
      if (d?.video_id === v.id && typeof d.likes_count === "number") {
        useFeedStore.getState().updateVideo(v.id, { likes_count: d.likes_count });
      }
    };
    const onCommentCountChange = (d: any) => {
      if (d?.video_id === v.id && typeof d.video_comments_count === "number") {
        useFeedStore.getState().updateVideo(v.id, { comments_count: d.video_comments_count });
      }
    };
    const onSaveChange = (d: any) => {
      if (d?.video_id === v.id && typeof d.saves_count === "number") {
        useFeedStore.getState().updateVideo(v.id, { saves_count: d.saves_count });
      }
    };
    const onShareChange = (d: any) => {
      if (d?.video_id === v.id && typeof d.shares_count === "number") {
        useFeedStore.getState().updateVideo(v.id, { shares_count: d.shares_count });
      }
    };
    socket.on("video.liked", onLikeChange);
    socket.on("video.unliked", onLikeChange);
    socket.on("comment.created", onCommentCountChange);
    socket.on("comment.deleted", onCommentCountChange);
    socket.on("video.saved", onSaveChange);
    socket.on("video.unsaved", onSaveChange);
    socket.on("video.shared", onShareChange);

    return () => {
      socket.emit("room:leave", { room });
      socket.off("video.liked", onLikeChange);
      socket.off("video.unliked", onLikeChange);
      socket.off("comment.created", onCommentCountChange);
      socket.off("comment.deleted", onCommentCountChange);
      socket.off("video.saved", onSaveChange);
      socket.off("video.unsaved", onSaveChange);
      socket.off("video.shared", onShareChange);
    };
  }, [videos, activeIndex, getSocket]);

  /* Advance / retreat with mouse wheel - only the video track moves. */
  function advance(dir: 1 | -1) {
    if (animatingRef.current) return;
    const cur = activeRef.current;
    const len = videosRef.current.length;
    if (len === 0) return;
    const next = dir > 0 ? Math.min(cur + 1, len - 1) : Math.max(cur - 1, 0);
    if (next === cur) return;
    animatingRef.current = true;
    setActiveIndex(next);
    setTimeout(() => { animatingRef.current = false; }, 500);

    // Prefetch when within 3 of the end
    if (dir > 0 && hasMore && !loadingMore && len - next <= 3) {
      void fetchMore();
    }
  }

  useEffect(() => {
    const el = videoAreaRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      advance(e.deltaY > 0 ? 1 : -1);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* Auto-advance when current video ends. Stable via useCallback so VideoSlide
     memo can bail out when only unrelated feed-store fields change. */
  const onVideoEnded = useCallback(() => {
    const cur = activeRef.current;
    const len = videosRef.current.length;
    if (len === 0) return;
    const next = cur + 1 < len ? cur + 1 : cur;
    if (next === cur) return;
    animatingRef.current = true;
    // Use getState() to avoid closing over stale hasMore / loadingMore
    const { setActiveIndex: sa, hasMore: hm, loadingMore: lm, fetchMore: fm } = useFeedStore.getState();
    sa(next);
    setTimeout(() => { animatingRef.current = false; }, 500);
    if (hm && !lm && len - next <= 3) void fm();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* "Not interested" - tell backend, drop from local feed, slide on. */
  const isAuth        = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);
  const feedUser      = useAuthStore((s) => s.user);
  async function handleNotInterested(videoId: number) {
    if (!isAuth) { openAuthModal("login"); return; }
    try {
      await videoService.notInterested(videoId);
      toast.success("We’ll show less like this.");
      useFeedStore.getState().removeById(videoId);   // only remove after server confirms
    } catch {
      toast.error("Couldn’t process your request. Please try again.");
    }
  }

  const [reportForId,        setReportForId]        = useState<number | null>(null);
  const [commentsForId,       setCommentsForId]       = useState<number | null>(null);
  const [commentsOwnerIdFor,  setCommentsOwnerIdFor]  = useState<number | undefined>(undefined);
  const [commentsAllowedFor,  setCommentsAllowedFor]  = useState<boolean>(true);

  function adjustCommentsCount(videoId: number, delta: number) {
    const cur = videosRef.current;
    const next = cur.map((v) =>
      v.id === videoId
        ? { ...v, comments_count: Math.max(0, (v.comments_count ?? 0) + delta) }
        : v,
    );
    useFeedStore.setState({ videos: next });
  }

  const activeVideo = videos[activeIndex];

  // Stable list of feed video IDs - only recomputes when the list itself changes
  // (scroll-load appends), not when individual video fields change.
  const feedIds = useMemo(() => videos.map((v) => v.id), [videos]);

  // Stable per-action callbacks so VideoSlide memo doesn't thrash on every
  // like/save that touches an unrelated video in the feed store.
  const notInterestedHandlerRef = useRef(handleNotInterested);
  notInterestedHandlerRef.current = handleNotInterested;
  const onNotInterested = useCallback(
    (id: number) => notInterestedHandlerRef.current(id),
    [],
  );

  const reportHandlerRef = useRef(setReportForId);
  reportHandlerRef.current = setReportForId;
  const onReport = useCallback((id: number) => reportHandlerRef.current(id), []);

  return (
    <AppShell feedMode>
      <div
        className="feed-stage flex overflow-hidden"
      >
        {/* ── Center column ── */}
        <div
          ref={videoAreaRef}
          className="feed-zoom-cancel flex-1 relative flex items-center justify-center overflow-hidden px-3 py-0"
        >
          {(loading || !authResolved) && !videos.length ? (
            /* Also hold the skeleton until auth is resolved: with no videos yet,
               the alternative is FeedEmpty, whose guest branch would otherwise
               show "Log in or sign up" to a logged-in user mid-refresh. */
            <FeedLoading width={VIDEO_W} height={CLIP_H} />
          ) : error && !videos.length ? (
            <FeedError message={error} onRetry={() => void initialize(mode === "following" ? "following" : "home")} />
          ) : !videos.length ? (
            <FeedEmpty mode={mode} onEmpty={onEmpty} />
          ) : (
            /* Adaptive track - each post gets a shell sized to its real aspect
               ratio. The whole column slides so the active post stays centered;
               the action stack hugs the right edge of every shell. */
            <div className="relative h-full w-full overflow-hidden">
              <div
                className="absolute inset-x-0 top-0 flex flex-col items-center will-change-transform"
                style={{
                  transform: `translateY(${trackOffset}px)`,
                  transition: "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {videos.map((video, idx) => {
                  const shell = shells[idx] ?? { w: VIDEO_W, h: CLIP_H, orientation: "portrait" as FeedOrientation };
                  const isActive = idx === activeIndex;
                  return (
                    /* Full-viewport-height section - one post fills the feed area,
                       so the next post is never visible until the track slides. */
                    <section
                      key={video.id}
                      className="flex w-full flex-shrink-0 items-center justify-center"
                      style={{ height: VIDEO_H }}
                    >
                      {/* Media + action group, centered inside the full-height section. */}
                      <div className="flex items-end justify-center gap-3">
                        <div
                          className="relative flex-shrink-0 overflow-hidden rounded-[18px] bg-black"
                          style={{ width: shell.w, height: shell.h }}
                        >
                          <VideoSlide
                            video={video}
                            orientation={shell.orientation}
                            isActive={isActive}
                            isNearActive={idx >= activeIndex - 1 && idx <= activeIndex + 2}
                            onEnded={onVideoEnded}
                            onNotInterested={() => onNotInterested(video.id)}
                            onReport={() => onReport(video.id)}
                            onAspectRatio={onAspectRatio}
                            feedIds={feedIds}
                            source={mode === "following" ? "following" : "for_you"}
                          />
                        </div>

                        {/* Action stack - fixed-width column reserved so the shell
                            stays put; content rendered for the active post and
                            bottom-aligned to the current media shell. */}
                        <div className="flex w-[64px] flex-shrink-0 justify-center">
                          {isActive && activeVideo && (
                            <VideoActions
                              key={activeVideo.id}
                              video={activeVideo}
                              onOpenComments={() => { setCommentsForId(activeVideo.id); setCommentsOwnerIdFor(activeVideo.user?.id); setCommentsAllowedFor(activeVideo.allow_comments ?? true); }}
                            />
                          )}
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}

          {/* TikTok-style prev/next nav arrows - floats in the gap between
              action buttons and the right sidebar, vertically centred. */}
          {videos.length > 0 && !loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 z-10 flex flex-col gap-4">
              <button
                type="button"
                onClick={() => advance(-1)}
                disabled={activeIndex === 0}
                aria-label="Previous video"
                className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white shadow-md transition-all duration-150 hover:bg-[#eeeeee] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronUp className="h-6 w-6 text-[#111827]" />
              </button>
              <button
                type="button"
                onClick={() => advance(1)}
                disabled={activeIndex === videos.length - 1}
                aria-label="Next video"
                className="grid h-[52px] w-[52px] place-items-center rounded-full bg-white shadow-md transition-all duration-150 hover:bg-[#eeeeee] active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <ChevronDown className="h-6 w-6 text-[#111827]" />
              </button>
            </div>
          )}
        </div>

        {/* Report modal - only mounted while open, so each open starts fresh */}
        {reportForId !== null && (
          <ReportModal
            entityType="video"
            entityId={reportForId}
            onClose={() => setReportForId(null)}
          />
        )}

        {/* Comments drawer - same pattern */}
        {commentsForId !== null && (
          <VideoCommentsDrawer
            videoId={commentsForId}
            videoOwnerId={commentsOwnerIdFor}
            allowComments={commentsAllowedFor}
            initialCount={videos.find((v) => v.id === commentsForId)?.comments_count ?? 0}
            onClose={() => { setCommentsForId(null); setCommentsOwnerIdFor(undefined); setCommentsAllowedFor(true); }}
            onVisibleCountLoaded={(count) => {
              // Replace stale cached count with the authoritative visible count from API.
              const cur = videosRef.current;
              useFeedStore.setState({
                videos: cur.map((v) =>
                  v.id === commentsForId ? { ...v, comments_count: count } : v,
                ),
              });
            }}
            onCommentCountChange={(delta) => adjustCommentsCount(commentsForId, delta)}
          />
        )}

      </div>
    </AppShell>
  );
}

/* ─── Empty & loading states ──────────────────────────────────────────────── */

function FeedLoading({ width, height }: { width: number; height: number }) {
  return (
    <div
      className="relative animate-pulse rounded-[18px] bg-[#1a1a1a]"
      style={{ width, height }}
    />
  );
}

function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="grid w-full max-w-md place-items-center px-6 text-center">
      <h2 className="text-xl font-bold text-black">Couldn&apos;t load feed</h2>
      <p className="mt-2 text-sm text-[#5f6675]">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 inline-flex h-11 items-center rounded-full bg-[#fe2c55] px-5 text-sm font-bold text-white hover:bg-[#e0193f]"
      >
        Try again
      </button>
    </div>
  );
}

function FeedEmpty({ mode, onEmpty }: { mode: "home" | "following" | "explore"; onEmpty?: () => void }) {
  const isAuth        = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal = useAuthStore((s) => s.openAuthModal);

  useEffect(() => { onEmpty?.(); }, [onEmpty]);

  if (mode === "following") {
    return (
      <div className="grid w-full max-w-md place-items-center px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff0f3]">
          <Sparkles className="h-7 w-7 text-[#fe2c55]" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-black">No videos yet</h2>
        <p className="mt-2 text-sm text-[#5f6675]">
          Videos from creators you follow will appear here. Start following someone!
        </p>
        <Link
          href="/"
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#fe2c55] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#e0193f]"
        >
          Discover creators
        </Link>
      </div>
    );
  }

  if (!isAuth) {
    return (
      <div className="grid w-full max-w-md place-items-center px-6 text-center">
        <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff0f3]">
          <Sparkles className="h-7 w-7 text-[#fe2c55]" />
        </div>
        <h2 className="mt-4 text-xl font-bold text-black">Welcome to Teezer</h2>
        <p className="mt-2 text-sm text-[#5f6675]">
          Log in or sign up to watch videos, follow creators, and get your personalized feed.
        </p>
        <div className="mt-5 flex items-center gap-3">
          <button
            type="button"
            onClick={() => openAuthModal("login")}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#fe2c55] px-6 text-sm font-bold text-white shadow-sm hover:bg-[#e0193f]"
          >
            Log in
          </button>
          <button
            type="button"
            onClick={() => openAuthModal("signup")}
            className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-6 text-sm font-bold text-black shadow-sm hover:bg-[#f8f9fb]"
          >
            Sign up
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid w-full max-w-md place-items-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff0f3]">
        <Sparkles className="h-7 w-7 text-[#fe2c55]" />
      </div>
      <h2 className="mt-4 text-xl font-bold text-black">It&apos;s quiet here</h2>
      <p className="mt-2 text-sm text-[#5f6675]">
        No videos to show yet. Be the first to share something.
      </p>
      <Link
        href="/upload"
        className="mt-5 inline-flex h-11 items-center gap-2 rounded-full bg-[#fe2c55] px-5 text-sm font-bold text-white shadow-sm hover:bg-[#e0193f]"
      >
        <UploadIcon className="h-4 w-4" />
        Upload your first video
      </Link>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────────
   VideoSlide - wraps a ReelsooVideo with player + bottom caption block +
   volume (top-left) + 3-dot menu (top-right).
──────────────────────────────────────────────────────────────────────────── */
const VideoSlide = memo(function VideoSlide({
  video, orientation, isActive, isNearActive, onEnded, onNotInterested, onReport, onAspectRatio, feedIds, source,
}: {
  video: ReelsooVideo;
  orientation?: FeedOrientation;
  isActive: boolean;
  isNearActive: boolean;
  onEnded: () => void;
  onNotInterested: () => void;
  onReport: () => void;
  onAspectRatio?: (id: number, ar: number) => void;
  feedIds?: number[];
  source?: string;
}) {
  const isImage    = video.media_type === "image";
  const isCarousel = video.media_type === "image_carousel";

  const router      = useRouter();
  const ref           = useRef<HTMLVideoElement>(null);
  const moreBtnRef    = useRef<HTMLButtonElement>(null);
  const progressRef   = useRef<HTMLDivElement>(null);
  const volHideRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasPlayingRef = useRef(false);
  const isSeekingRef  = useRef(false);

  const autoScroll     = useUiStore((s) => s.autoScroll);
  const quality        = useUiStore((s) => s.quality);
  const mutedPref      = useUiStore((s) => s.mutedPref);
  const volumePref     = useUiStore((s) => s.volumePref);
  const setMutedPref   = useUiStore((s) => s.setMutedPref);
  const setVolumePref  = useUiStore((s) => s.setVolumePref);
  const playbackSpeed  = useUiStore((s) => s.playbackSpeed);

  const [muted,           setMuted]           = useState(() => mutedPref);
  const [volume,          setVolume]          = useState(() => volumePref);
  // Keep this slide's local mute/volume in sync with the global audio
  // preference, so unmuting one video instantly applies to every other
  // mounted slide (single global audio state instead of per-video state).
  useEffect(() => { setMuted(mutedPref); }, [mutedPref]);
  useEffect(() => { setVolume(volumePref); }, [volumePref]);
  const [playing,         setPlaying]         = useState(true);
  const [currentTime,     setCurrentTime]     = useState(0);
  const [duration,        setDuration]        = useState(video.duration ?? 0);
  const [failed,          setFailed]          = useState(false);
  // Tracks whether the media has painted its first frame / loaded, so we can
  // show a skeleton instead of an empty box while it's still loading (req #8).
  const [mediaLoaded,     setMediaLoaded]     = useState(false);
  // Reset failed/loaded state whenever this slide comes into the load window so
  // the browser gets another chance to fetch the video (handles transient errors).
  useEffect(() => { if (isNearActive) setFailed(false); }, [isNearActive]);
  const [optionsOpen,     setOptionsOpen]     = useState(false);
  const [locOpen,         setLocOpen]         = useState(false);
  const [savedInMenu,     setSavedInMenu]     = useState(!!video.is_saved);

  // Location overlay: only render when the post actually carries a location string.
  const locationLabel = (video.location ?? "").trim();
  const hasLocation   = locationLabel.length > 0;
  // Split the stored "City, State, Region, Country" string into a bold title
  // (first 1-2 parts) and a lighter subtitle (the rest), matching the design.
  const locationParts = locationLabel.split(",").map((s) => s.trim()).filter(Boolean);
  const locationTitle = locationParts.length > 2 ? locationParts.slice(0, 2).join(", ") : locationLabel;
  const locationSub   = locationParts.length > 2 ? locationParts.slice(2).join(", ") : "";

  // Close the location popover on Escape.
  useEffect(() => {
    if (!locOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setLocOpen(false); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [locOpen]);

  const { isAuthenticated: menuIsAuth, openAuthModal: menuOpenAuth, user: menuAuthUser } = useAuthStore();
  const menuQc = useQueryClient();
  const menuSaveMut = useMutation({
    mutationFn: () => videoService.toggleSave(video.id),
    onMutate:   () => setSavedInMenu((s) => !s),
    onSuccess:  (res) => {
      setSavedInMenu(res.saved);
      useFeedStore.getState().updateVideo(video.id, { is_saved: res.saved, saves_count: res.saves_count });
      if (res.saved) {
        notify.saved("View it in your profile → Saved tab.");
        if (menuAuthUser?.username) {
          menuQc.invalidateQueries({ queryKey: ["profile-saved", menuAuthUser.username] });
        }
      } else {
        notify.unsaved();
        if (menuAuthUser?.username) {
          menuQc.invalidateQueries({ queryKey: ["profile-saved", menuAuthUser.username] });
        }
      }
    },
    onError: () => {
      setSavedInMenu((s) => !s);
      toast.error("Failed to save. Please try again.");
    },
  });
  const [carouselIdx,     setCarouselIdx]     = useState(0);
  const [isDragging,      setIsDragging]      = useState(false);

  // Auto-hiding progress bar: visible on mouse activity, fades out after a
  // short idle period (like a desktop video player). Always shown while seeking.
  const [controlsVisible, setControlsVisible] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pokeControls = useCallback(() => {
    setControlsVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => setControlsVisible(false), 2200);
  }, []);
  useEffect(() => () => { if (hideTimerRef.current) clearTimeout(hideTimerRef.current); }, []);
  const [showVolPanel,    setShowVolPanel]    = useState(false);
  const [captionExpanded, setCaptionExpanded] = useState(false);
  const [tagsExpanded,    setTagsExpanded]    = useState(false);
  const captionRef     = useRef<HTMLParagraphElement>(null);
  const [captionClamped, setCaptionClamped] = useState(false);
  const [taggedSheetOpen, setTaggedSheetOpen] = useState(false);
  const [collabSheetOpen, setCollabSheetOpen] = useState(false);

  // Tagged people are present only when the creator tagged ≥1 user on upload.
  const taggedUsers = Array.isArray(video.tagged_users) ? video.tagged_users : [];
  const hasTaggedUsers = taggedUsers.length > 0;
  // "Paid partnership" collab tags - same rule as tagged_users above,
  // independent of it (a post can have either, both, or neither).
  const collabUsers = Array.isArray(video.collab_users) ? video.collab_users : [];
  const hasCollabUsers = collabUsers.length > 0;
  const taggedPostKind: "video" | "photo" | "post" =
    video.media_type === "video"
      ? "video"
      : (video.media_type === "image" || video.media_type === "image_carousel")
        ? "photo"
        : "post";

  // ── Double-tap like ────────────────────────────────────────────────────
  const containerRef          = useRef<HTMLDivElement>(null);
  const [hearts, setHearts]   = useState<HeartItem[]>([]);
  const touchStartRef         = useRef({ x: 0, y: 0 });
  const lastTapRef            = useRef({ x: 0, y: 0, time: 0 });
  // Used to delay single-click play/pause so a double-click doesn't flicker
  const clickTimerRef         = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Set true when touch double-tap fires so the subsequent synthetic click is ignored
  const doubleTapFiredRef     = useRef(false);

  /* Detect whether the caption paragraph is actually overflowing 2 lines */
  useLayoutEffect(() => {
    const el = captionRef.current;
    if (!el || captionExpanded) return;
    setCaptionClamped(el.scrollHeight > el.clientHeight + 2);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.caption, video.title]);

  // ── Recommendation event tracking ────────────────────────────────────
  const activatedAtRef    = useRef<number>(0);    // ms timestamp when slide became active
  const completionFiredRef = useRef<Set<number>>(new Set()); // milestones fired: 25,50,75,100
  const rewatchCountRef   = useRef(0);

  // Reset per item
  useEffect(() => {
    activatedAtRef.current = 0;
    completionFiredRef.current = new Set();
    rewatchCountRef.current = 0;
  }, [video.id]);

  // Track activation time for recommendation engine skip detection
  useEffect(() => {
    if (!isActive) {
      if (activatedAtRef.current > 0) {
        const watchedMs  = Date.now() - activatedAtRef.current;
        const watchedSec = watchedMs / 1000;
        const dur        = video.duration ?? 0;
        trackWatchSession(video.id, watchedSec, dur);
        activatedAtRef.current = 0;
      }
      return;
    }
    activatedAtRef.current = Date.now();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, video.id]);

  // Professional watch time tracking (session-based, 5-second progress flushes)
  useWatchTracker({
    videoId:  video.id,
    videoRef: ref,
    isActive,
    duration: video.duration ?? 0,
  });

  // Apply playback speed whenever it changes (also covers initial mount if speed ≠ 1)
  useEffect(() => {
    const el = ref.current;
    if (el) el.playbackRate = playbackSpeed;
  }, [playbackSpeed]);

  // Only load src when this slide is within 1 of the active index. This
  // prevents all 15+ feed videos from racing for bandwidth simultaneously,
  // which was causing intermittent load failures.
  //
  // An explicit quality pick always wins (the user asked for a specific
  // rendition). Otherwise prefer the adaptive HLS ladder - it starts on a
  // small segment and climbs instead of committing to one file size before
  // the connection is measured - falling back to the progressive mp4 while
  // the transcode hasn't finished yet (hls_url is null).
  const desiredUrl = !isNearActive
    ? undefined
    : quality !== "auto" && video.quality_urls?.[quality]
      ? video.quality_urls[quality]
      : (video.hls_url ?? video.video_url);
  useHlsSource(ref, !isImage && !isCarousel ? desiredUrl : undefined, video.video_url);

  // Orientation is supplied by the feed (driven by the post's resolved aspect
  // ratio); fall back to a local estimate for any standalone usage.
  const arLocal = video.aspect_ratio ?? (video.width && video.height ? video.width / video.height : 9 / 16);
  const layout: FeedOrientation = orientation ?? (arLocal < 0.8 ? "portrait" : arLocal > 1.2 ? "landscape" : "square");
  // Fixed-shell layout: every orientation uses contain so the media is fully
  // visible inside the one consistent player frame (never cropped or stretched);
  // empty space is filled by the blurred backdrop layer below.
  const objectFit: "cover" | "contain" = "contain";

  // Report the media's true ratio once it loads, so legacy posts / images with
  // no stored dimensions still get the correct adaptive layout (req #10).
  const reportDims = useCallback((w?: number, h?: number) => {
    if (onAspectRatio && w && h) onAspectRatio(video.id, w / h);
  }, [onAspectRatio, video.id]);

  /* Robustly start playback, retrying muted if the browser blocks unmuted
     autoplay. Safe to call repeatedly (e.g. again once the media is ready). */
  const attemptPlay = useCallback(() => {
    const v = ref.current;
    if (!v || isImage || isCarousel || failed) return;
    v.muted  = mutedPref;
    v.volume = volumePref;
    v.play().catch((err: unknown) => {
      // Only a genuine autoplay-policy rejection should force a mute. Other
      // rejections (e.g. the src isn't loaded yet when this slide becomes
      // active) are NOT a signal that sound is blocked - forcing mute here
      // would stick local state at muted=true even when the user already
      // unmuted, since nothing else corrects it until mutedPref itself
      // changes again. The onCanPlay handler retries once the media is
      // actually ready, so leaving those rejections alone is safe.
      if (!(err instanceof DOMException) || err.name !== "NotAllowedError") return;
      // Browser blocked unmuted autoplay - mute this video but do NOT save to
      // preference so that every page load retries with sound ON.
      v.muted = true;
      setMuted(true);
      v.play().catch(() => {});
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isImage, isCarousel, failed, mutedPref, volumePref]);

  /* Play only when active; pause when inactive (video only). */
  useEffect(() => {
    if (isImage || isCarousel) return;
    const v = ref.current;
    if (!v || failed) return;
    if (isActive) {
      v.currentTime = 0;
      isSeekingRef.current = false;
      wasPlayingRef.current = false;
      // If the src is still loading, play() here may reject; the onCanPlay
      // handler retries once the media is ready, so autoplay is reliable.
      attemptPlay();
    } else {
      v.pause();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive, failed, isImage]);

  /* Tab visibility - pause on hide, resume on show (only for the active slide) */
  useEffect(() => {
    if (isImage || isCarousel || !isActive) return;
    const v = ref.current;
    if (!v) return;
    let wasPlaying = false;
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        wasPlaying = !v.paused && !v.ended;
        if (wasPlaying) v.pause();
      } else if (document.visibilityState === "visible") {
        if (wasPlaying) v.play().catch(() => {});
        wasPlaying = false;
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [isImage, isCarousel, isActive]);

  useEffect(() => {
    if (isImage || isCarousel) return;
    const v = ref.current;
    if (!v) return;
    const onTime = () => {
      if (isSeekingRef.current) return;
      setCurrentTime(v.currentTime);

      if (!isFinite(v.duration) || v.duration <= 0) return;
      const pct = v.currentTime / v.duration * 100;

      // Completion milestone events at 25, 50, 75, 100 %
      for (const milestone of [25, 50, 75, 100]) {
        if (pct >= milestone && !completionFiredRef.current.has(milestone)) {
          completionFiredRef.current.add(milestone);
          trackVideoEvent(video.id, "view_progress", {
            completion_pct:  milestone,
            watch_duration:  Math.floor(v.currentTime),
          });
        }
      }
    };
    const onMeta  = () => setDuration(v.duration || video.duration || 0);
    const onErr   = () => setFailed(true);
    const onPlay  = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      // Track rewatch when video loops/replays
      rewatchCountRef.current += 1;
      if (rewatchCountRef.current >= 1) {
        trackVideoEvent(video.id, "rewatch");
      }
    };
    v.addEventListener("timeupdate", onTime);
    v.addEventListener("loadedmetadata", onMeta);
    v.addEventListener("error", onErr);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("ended", onEnded);
    return () => {
      v.removeEventListener("timeupdate", onTime);
      v.removeEventListener("loadedmetadata", onMeta);
      v.removeEventListener("error", onErr);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("ended", onEnded);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [video.id, video.duration, isImage]);

  const togglePlay = () => {
    if (isImage || isCarousel) return;
    const v = ref.current;
    if (!v) return;
    if (v.paused) v.play().catch(() => {});
    else v.pause();
  };

  /* Apply saved volume/muted whenever we get a video element */
  useEffect(() => {
    const v = ref.current;
    if (!v || isImage || isCarousel) return;
    v.muted  = muted;
    v.volume = volume;
  });

  /* Sync muted/volume to video element whenever state changes */
  useEffect(() => {
    const v = ref.current;
    if (!v || isImage || isCarousel) return;
    v.muted  = muted;
    v.volume = volume;
  }, [muted, volume, isImage, isCarousel]);

  const toggleMute = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    if (isImage || isCarousel) return;
    const v = ref.current;
    if (!v) return;
    const next = !v.muted;
    v.muted = next;
    setMuted(next);
    setMutedPref(next);
  }, [isImage, isCarousel, setMutedPref]);

  const handleVolumeChange = useCallback((val: number) => {
    const v = ref.current;
    if (!v || isImage || isCarousel) return;
    const clamped = Math.max(0, Math.min(1, val));
    v.volume = clamped;
    setVolume(clamped);
    setVolumePref(clamped);
    if (clamped > 0 && v.muted) {
      v.muted = false;
      setMuted(false);
      setMutedPref(false);
    }
    if (clamped === 0) {
      v.muted = true;
      setMuted(true);
      setMutedPref(true);
    }
  }, [isImage, isCarousel, setVolumePref, setMutedPref]);

  /* ── Seekable progress bar ─────────────────────────────────────────── */
  const seekTo = useCallback((clientX: number) => {
    const bar = progressRef.current;
    const v   = ref.current;
    if (!bar || !v || !duration) return;
    const rect = bar.getBoundingClientRect();
    const pct  = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    v.currentTime = pct * duration;
    setCurrentTime(v.currentTime);
  }, [duration]);

  const startSeek = useCallback((clientX: number) => {
    const el = ref.current;
    if (el) {
      wasPlayingRef.current = !el.paused;
      el.pause();
    }
    isSeekingRef.current = true;
    setIsDragging(true);
    seekTo(clientX);
  }, [seekTo]);

  const onProgressMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.stopPropagation();
    e.preventDefault();
    startSeek(e.clientX);
  }, [startSeek]);

  const onProgressTouchStart = useCallback((e: React.TouchEvent<HTMLDivElement>) => {
    e.stopPropagation();
    startSeek(e.touches[0].clientX);
  }, [startSeek]);

  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      e.preventDefault();
      seekTo(e.clientX);
    };
    const onUp = () => {
      isSeekingRef.current = false;
      setIsDragging(false);
      const el = ref.current;
      if (el && wasPlayingRef.current) {
        el.play().catch(() => {});
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",  onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",  onUp);
    };
  }, [isDragging, seekTo]);

  /* ── Volume panel hover ────────────────────────────────────────────── */
  const showVol = useCallback(() => {
    if (volHideRef.current) clearTimeout(volHideRef.current);
    setShowVolPanel(true);
  }, []);
  const hideVol = useCallback(() => {
    volHideRef.current = setTimeout(() => setShowVolPanel(false), 600);
  }, []);

  // ── Double-tap like handlers ──────────────────────────────────────────
  function spawnHeart(clientX: number, clientY: number) {
    const container = containerRef.current;
    if (!container) return;
    const rect   = container.getBoundingClientRect();
    const x      = clientX - rect.left;
    const y      = clientY - rect.top;
    const rotate = Math.round(Math.random() * 50 - 25);
    setHearts((prev) => [...prev, { id: Date.now() + Math.random(), x, y, rotate }]);
  }

  function removeHeart(id: number) {
    setHearts((prev) => prev.filter((h) => h.id !== id));
  }

  function fireDoubleLike(clientX: number, clientY: number) {
    spawnHeart(clientX, clientY);
    // Double-tap only ever LIKES (never unlikes) - if it's already liked, just
    // play the heart burst. Routes through the SAME single-flight lane as the
    // heart button (syncLike), so a double-tap and a button tap on one video can
    // never race into conflicting toggles.
    if (video.is_liked) return;
    if (!menuIsAuth) { menuOpenAuth("login"); return; }
    useFeedStore.getState().updateVideo(video.id, {
      is_liked: true,
      likes_count: (video.likes_count ?? 0) + 1,
    });
    syncLike(video.id, true, {
      onSettled: (res) => useFeedStore.getState().updateVideo(video.id, {
        is_liked: res.liked, likes_count: res.likes_count,
      }),
      onError: () => { /* heart already played; the next action reconciles state */ },
    });
  }

  // Delayed single-click: waits 250ms to see if a second click is coming.
  // If a second click arrives (double-click), the timer is cancelled and play is never toggled.
  function handlePlayButtonClick() {
    if (doubleTapFiredRef.current) return; // double-tap already handled by touch
    if (clickTimerRef.current) {
      // Second click of a double-click - cancel the pending single-click
      clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
      return;
    }
    clickTimerRef.current = setTimeout(() => {
      clickTimerRef.current = null;
      togglePlay();
    }, 250);
  }

  // Desktop double-click: fires after the two onClick calls have already cancelled each other
  function handleContainerDoubleClick(e: React.MouseEvent<HTMLDivElement>) {
    if (doubleTapFiredRef.current) return; // already handled by touch on mobile
    fireDoubleLike(e.clientX, e.clientY);
  }

  function handleTouchStart(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.touches[0];
    if (t) touchStartRef.current = { x: t.clientX, y: t.clientY };
  }

  function handleTouchEnd(e: React.TouchEvent<HTMLDivElement>) {
    const t = e.changedTouches[0];
    if (!t) return;
    const dx  = t.clientX - touchStartRef.current.x;
    const dy  = t.clientY - touchStartRef.current.y;

    // Horizontal swipe on a carousel: advance to the next/previous slide.
    // Must be more horizontal than vertical and at least 40px to count as a swipe.
    if (isCarousel && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      const items = video.media_items ?? [];
      const total = items.length > 0 ? items.length : 1;
      if (dx < 0) {
        // Swipe left → next slide
        setCarouselIdx((i) => Math.min(total - 1, i + 1));
      } else {
        // Swipe right → previous slide
        setCarouselIdx((i) => Math.max(0, i - 1));
      }
      lastTapRef.current = { x: 0, y: 0, time: 0 };
      return;
    }

    // Ignore non-carousel swipes (finger moved significantly)
    if (Math.sqrt(dx * dx + dy * dy) > 10) { lastTapRef.current = { x: 0, y: 0, time: 0 }; return; }
    const now  = Date.now();
    const last = lastTapRef.current;
    const tdx  = t.clientX - last.x;
    const tdy  = t.clientY - last.y;
    const elapsed = now - last.time;
    if (elapsed < 300 && elapsed > 50 && Math.sqrt(tdx * tdx + tdy * tdy) < 60) {
      // Double-tap confirmed - cancel any pending single-tap play toggle
      if (clickTimerRef.current) { clearTimeout(clickTimerRef.current); clickTimerRef.current = null; }
      // Suppress the synthetic click events the browser will fire after touchend
      doubleTapFiredRef.current = true;
      setTimeout(() => { doubleTapFiredRef.current = false; }, 600);
      fireDoubleLike(t.clientX, t.clientY);
      lastTapRef.current = { x: 0, y: 0, time: 0 };
    } else {
      lastTapRef.current = { x: t.clientX, y: t.clientY, time: now };
    }
  }

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const creatorBg = colorFor(video.user?.username ?? video.id);
  const caption   = video.caption ?? video.title ?? "";
  const tags      = video.hashtags ?? [];
  const mainSound = video.main_sound;
  const audioLabel = mainSound
    ? `${mainSound.title}${mainSound.artist_name ? ` · ${mainSound.artist_name}` : ""}`
    : video.audio
      ? `${video.audio.title}${video.audio.artist ? ` · ${video.audio.artist}` : ""}`
      : video.user?.username
        ? `Original Track - @${video.user.username}`
        : "Original Track";

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden bg-black"
      onDoubleClick={handleContainerDoubleClick}
      onMouseMove={pokeControls}
      onMouseEnter={pokeControls}
      onMouseLeave={() => { if (!isDragging) setControlsVisible(false); }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Double-tap like hearts */}
      <DoubleTapLike hearts={hearts} onRemove={removeHeart} />

      {/* Blurred background for non-portrait videos */}
      {!isImage && layout !== "portrait" && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(135deg, ${creatorBg}33, #00000099)`,
            filter: "blur(40px) brightness(0.55)",
            transform: "scale(1.15)",
          }}
        />
      )}

      {/* Loading placeholder for OFF-SCREEN preloading neighbours only - never the
          active/playing slide (the playing video shows its poster frame instead of
          a pulsing skeleton). A static fill, no pulse, so there's no "loading effect"
          on what the user is watching. */}
      {!isImage && !failed && !mediaLoaded && isNearActive && !isActive && (
        <div className="absolute inset-0 z-[2] bg-[#1a1a1a]" />
      )}

      {/* ── Carousel post ── */}
      {isCarousel && (() => {
        const items = video.media_items ?? [];
        const urls  = items.length > 0
          ? items.map((m) => m.url)
          : [video.video_url]; // fallback to primary URL
        const total = urls.length;
        const idx   = Math.min(carouselIdx, total - 1);
        return (
          <>
            {/* All photos live in one horizontal track that translateX-es between
                slides, so moving via the arrows / dots / arrow-keys glides smoothly
                instead of hard-swapping. Each slide carries its own blurred backdrop
                so the letterbox fill slides along with its photo. */}
            <div className="absolute inset-0 z-[1] overflow-hidden">
              <div
                className="flex h-full will-change-transform"
                style={{
                  width: `${total * 100}%`,
                  transform: `translateX(-${idx * (100 / total)}%)`,
                  transition: "transform 350ms cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              >
                {urls.map((u, i) => (
                  // overflow-hidden clips this slide's scale-110 blurred backdrop to
                  // its own box, so a neighbour's backdrop can't bleed into the
                  // visible slide (was showing as a shaded band on the right edge).
                  <div key={i} className="relative h-full shrink-0 overflow-hidden" style={{ width: `${100 / total}%` }}>
                    {/* Blurred backdrop for this slide - keeps each photo's real ratio */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt=""
                      aria-hidden="true"
                      className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.45] pointer-events-none"
                    />
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={u}
                      alt={`${video.title ?? "Image"} (${i + 1}/${total})`}
                      className="absolute inset-0 w-full h-full object-contain"
                      onLoad={(e) => { if (i === 0) reportDims(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight); }}
                    />
                  </div>
                ))}
              </div>
            </div>
            {idx > 0 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCarouselIdx((i) => Math.max(0, i - 1)); }}
                aria-label="Previous image"
                className="absolute left-2 top-1/2 -translate-y-1/2 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            {idx < total - 1 && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setCarouselIdx((i) => Math.min(total - 1, i + 1)); }}
                aria-label="Next image"
                className="absolute right-2 top-1/2 -translate-y-1/2 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            )}
            {/* Counter */}
            <span className="absolute top-12 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
              <Images className="h-3 w-3" />
              {idx + 1} / {total}
            </span>
            {/* Dot indicators */}
            {total > 1 && total <= 10 && (
              <div className="absolute bottom-[140px] left-1/2 -translate-x-1/2 z-20 flex gap-1">
                {Array.from({ length: total }).map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); setCarouselIdx(i); }}
                    className={cn(
                      "h-1.5 rounded-full transition-all",
                      i === idx ? "w-4 bg-white" : "w-1.5 bg-white/50",
                    )}
                  />
                ))}
              </div>
            )}
          </>
        );
      })()}

      {/* ── Image post ── */}
      {isImage && video.video_url && (
        <>
          {/* Blurred backdrop fills letterbox space; real photo stays uncropped */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.video_url}
            alt=""
            aria-hidden="true"
            className="absolute inset-0 w-full h-full object-cover scale-110 blur-2xl brightness-[0.45] pointer-events-none"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={video.video_url}
            alt={video.title ?? video.caption ?? "Image"}
            className="absolute inset-0 z-[1] w-full h-full object-contain"
            onLoad={(e) => reportDims(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)}
          />
        </>
      )}

      {/* ── Video post ── */}
      {!isImage && !failed && video.video_url && (
        <video
          ref={ref}
          // src is wired imperatively by useHlsSource above (needs hls.js for
          // .m3u8 on non-Safari browsers, so it can't be a plain JSX attribute).
          poster={video.thumbnail_url ?? undefined}
          className="absolute inset-0 w-full h-full"
          style={{ objectFit }}
          muted={muted}
          playsInline
          preload={isActive || isNearActive ? "auto" : "none"}
          loop={!autoScroll}
          onEnded={onEnded}
          onCanPlay={() => {
            setMediaLoaded(true);
            // The active slide may have become active before its src finished
            // loading, so the initial play() was rejected. Retry now that the
            // media is ready - but only if it hasn't started yet (currentTime
            // near 0) so we never override an intentional user pause mid-clip.
            const v = ref.current;
            if (isActive && v && v.paused && v.currentTime < 0.25) attemptPlay();
          }}
          onLoadedData={() => setMediaLoaded(true)}
          onLoadedMetadata={() => {
            if (ref.current) {
              ref.current.playbackRate = playbackSpeed;
              reportDims(ref.current.videoWidth, ref.current.videoHeight);
            }
          }}
        />
      )}

      {!isImage && failed && (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/70 text-sm"
          style={{ background: `linear-gradient(160deg, ${creatorBg}, #111)` }}
        >
          <span>Couldn&apos;t load video</span>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setFailed(false); }}
            className="px-4 py-1.5 rounded-full border border-white/30 text-white/80 text-xs hover:bg-white/10 transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Click-to-play (videos only) */}
      {!isImage && !isCarousel && (
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={handlePlayButtonClick}
          className="absolute inset-0 z-[5] cursor-pointer bg-transparent border-0 p-0 m-0"
        >
          {!playing && !failed && (
            <span className="absolute inset-0 grid place-items-center pointer-events-none">
              <span className="grid h-16 w-16 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
                <Play className="h-7 w-7 fill-white text-white" />
              </span>
            </span>
          )}
        </button>
      )}

      {/* Volume control - top-LEFT (videos only). Only visible while the
          cursor is inside the player (fades with the rest of the top
          controls); expands in place into an inline slider on hover instead
          of popping out a separate panel, matching the reference design. */}
      {!isImage && !isCarousel && (
        <div
          className={cn(
            "absolute left-4 top-4 z-20 transition-opacity duration-300",
            (controlsVisible || showVolPanel) ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
          onMouseEnter={showVol}
          onMouseLeave={hideVol}
        >
          <div
            className={cn(
              "flex h-9 items-center overflow-hidden rounded-full border border-white/10",
              "bg-[rgba(22,27,37,0.45)] backdrop-blur-[8px] transition-[width] duration-300 ease-out",
              showVolPanel ? "w-[172px]" : "w-9",
            )}
          >
            {/* Main volume button */}
            <button
              type="button"
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="grid h-9 w-9 shrink-0 place-items-center text-white"
            >
              {muted || volume === 0
                ? <VolumeX className="h-4 w-4" />
                : <Volume2 className="h-4 w-4" />}
            </button>

            {/* Inline slider - reveals as the pill expands */}
            <div
              className={cn(
                "flex flex-1 items-center pr-3.5 transition-opacity duration-200",
                showVolPanel ? "opacity-100 delay-100" : "opacity-0",
              )}
            >
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                aria-label="Volume"
                onChange={(e) => { e.stopPropagation(); handleVolumeChange(Number(e.target.value)); }}
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                style={{
                  background: `linear-gradient(to right, #fe2c55 ${(muted ? 0 : volume) * 100}%, rgba(255,255,255,0.35) ${(muted ? 0 : volume) * 100}%)`,
                }}
                className={cn(
                  "h-[3px] w-full cursor-pointer appearance-none rounded-full",
                  "[&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-[13px] [&::-webkit-slider-thumb]:w-[13px]",
                  "[&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#fe2c55] [&::-webkit-slider-thumb]:cursor-pointer",
                  "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]",
                  "[&::-moz-range-thumb]:h-[13px] [&::-moz-range-thumb]:w-[13px] [&::-moz-range-thumb]:rounded-full",
                  "[&::-moz-range-thumb]:bg-[#fe2c55] [&::-moz-range-thumb]:border-none",
                  "[&::-moz-range-thumb]:shadow-[0_0_0_2px_rgba(255,255,255,0.9)]",
                )}
              />
            </div>
          </div>
        </div>
      )}

      {/* Location pin - top-RIGHT, just left of the three-dot menu. Only shown
          when the post has a location; no space is reserved when it doesn't.
          Same glass-pill treatment and fade behavior as the mute/more-options
          controls. */}
      {hasLocation && (
        <div
          className={cn(
            "absolute right-[60px] top-4 z-20 transition-opacity duration-300",
            (controlsVisible || locOpen) ? "opacity-100" : "opacity-0 pointer-events-none",
          )}
        >
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); setOptionsOpen(false); setLocOpen((o) => !o); }}
            aria-label="Open location"
            aria-haspopup="dialog"
            aria-expanded={locOpen}
            className={cn(
              "grid h-9 w-9 place-items-center rounded-full text-white",
              "border border-white/10 bg-[rgba(22,27,37,0.45)] backdrop-blur-[8px]",
              "transition-[opacity,background-color] duration-300 hover:bg-[rgba(22,27,37,0.65)]",
            )}
          >
            <MapPin className="h-[18px] w-[18px]" />
          </button>

          {locOpen && (
            <>
              {/* Click-away backdrop */}
              <button
                type="button"
                aria-label="Close location"
                onClick={(e) => { e.stopPropagation(); setLocOpen(false); }}
                className="fixed inset-0 z-20 cursor-default bg-transparent"
              />
              {/* Mini popover - opens below-left of the pin, light theme */}
              <div
                role="dialog"
                aria-label="Location"
                onClick={(e) => e.stopPropagation()}
                className="absolute right-0 top-[46px] z-30 w-[236px] rounded-2xl bg-white"
                style={{
                  color: "#111827",
                  border: "1px solid rgba(0,0,0,0.08)",
                  boxShadow: "0 12px 30px rgba(0,0,0,0.16)",
                  padding: 12,
                }}
              >
                {/* Pointer arrow pointing up to the location pin */}
                <span
                  aria-hidden="true"
                  className="absolute -top-[7px] right-[14px] h-3 w-3 rotate-45 bg-white"
                  style={{ borderLeft: "1px solid rgba(0,0,0,0.08)", borderTop: "1px solid rgba(0,0,0,0.08)" }}
                />

                {/* Header: pin + title + subtitle */}
                <div className="flex items-start gap-2 px-1 pb-2.5">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#f1f2f4]">
                    <MapPin className="h-[15px] w-[15px] text-[#111827]" />
                  </span>
                  <div className="min-w-0">
                    {/* Full location, wrapped across lines; long titles shrink so the
                        whole name stays visible instead of being cut off. */}
                    <p className={cn(
                      "font-semibold leading-snug text-[#111827] break-words",
                      locationTitle.length > 24 ? "text-[12.5px]" : "text-[14px]",
                    )}>{locationTitle}</p>
                    {locationSub && (
                      <p className="break-words text-[12px] leading-snug text-[#6b7280]">{locationSub}</p>
                    )}
                  </div>
                </div>

                <div className="-mx-3 border-t border-[#eeeeee]" />

                {/* Action rows */}
                <div className="pt-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocOpen(false);
                      router.push(`/location/${locationSlug(locationLabel)}`);
                    }}
                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition hover:bg-[#f7f7f8]"
                  >
                    <Sparkles className="h-[18px] w-[18px] shrink-0 text-[#374151]" />
                    <span className="flex-1 truncate text-[13.5px] font-semibold text-[#111827]">View location feed</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa1ad]" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setLocOpen(false);
                      window.open(
                        `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(locationLabel)}`,
                        "_blank",
                        "noopener,noreferrer",
                      );
                    }}
                    className="flex h-11 w-full items-center gap-2.5 rounded-[10px] px-2.5 text-left transition hover:bg-[#f7f7f8]"
                  >
                    <ExternalLink className="h-[18px] w-[18px] shrink-0 text-[#374151]" />
                    <span className="flex-1 truncate text-[13.5px] font-medium text-[#111827]">Open map</span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-[#9aa1ad]" />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Three-dot menu trigger - top-RIGHT. Fades with the rest of the top
          controls, but stays visible while its menu is open so it doesn't
          disappear out from under an open popover. */}
      <button
        ref={moreBtnRef}
        type="button"
        onClick={(e) => { e.stopPropagation(); setLocOpen(false); setOptionsOpen((o) => !o); }}
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={optionsOpen}
        className={cn(
          "absolute right-4 top-4 z-10 grid h-9 w-9 place-items-center rounded-full text-white",
          "border border-white/10 bg-[rgba(22,27,37,0.45)] backdrop-blur-[8px]",
          "transition-[opacity,background-color] duration-300 hover:bg-[rgba(22,27,37,0.65)]",
          (controlsVisible || optionsOpen) ? "opacity-100" : "opacity-0 pointer-events-none",
        )}
      >
        <MoreVertical className="h-4 w-4" />
      </button>

      <VideoOptionsMenu
        anchorRef={moreBtnRef}
        open={optionsOpen}
        onClose={() => setOptionsOpen(false)}
        onNotInterested={onNotInterested}
        onReport={onReport}
        showPlaybackControls={!isImage && !isCarousel}
        isSaved={savedInMenu}
        onSave={() => {
          if (!menuIsAuth) { menuOpenAuth("login"); return; }
          if (!menuSaveMut.isPending) menuSaveMut.mutate();
        }}
      />

      <div className="absolute inset-x-0 bottom-0 h-[55%] bg-gradient-to-t from-black/95 via-black/50 to-transparent pointer-events-none" />

      <div className="absolute inset-x-0 bottom-0 z-10 p-4">
        {/* Content-attached link/product bar - above the AI-Generated badge
            and the username, only when this post has an external link or
            featured Shop products. Wrapped in a plain block so it takes its
            own line: the bar's own root is inline-flex, as is the AI badge
            below, so without this they flow side by side on one line. One
            shared component so this player and the /videos/[id] detail page
            both show the exact same bar off the exact same persisted data -
            see ContentLinkBar's own comment. */}
        <div>
          <ContentLinkBar video={video} variant="overlay" />
        </div>

        {/* AI Generated badge - shown only when video.is_ai_generated is true */}
        {video.is_ai_generated && (
          <div
            className="mb-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-[5px] text-[12px] font-medium leading-none text-white"
            style={{
              background:     "rgba(0,0,0,0.35)",
              border:         "1px solid rgba(255,255,255,0.12)",
              backdropFilter: "blur(8px)",
              WebkitBackdropFilter: "blur(8px)",
            }}
          >
            <Sparkles className="h-3.5 w-3.5 flex-shrink-0" />
            AI Generated
          </div>
        )}

        <div className="mb-2 flex flex-wrap items-center gap-2">
          {video.user?.username ? (
            <Link
              href={`/profile/${video.user.username}`}
              className="text-sm font-bold text-white hover:underline"
            >
              @{video.user.username}
              {video.user?.is_verified && (
                <VerifiedBadge size={13} className="ml-1.5 inline-block align-middle" />
              )}
            </Link>
          ) : null}
          {video.user?.username ? (
            /* Pill is always present so users can tap to follow OR unfollow.
               Hidden when following (TikTok behaviour) - avatar badge handles
               the follow action for already-following viewers. */
            !video.user.is_following ? (
              <FollowButton
                variant="pill"
                username={video.user.username}
                initialFollowing={false}
                onFollowChanged={(isFollowing) => {
                  useFeedStore.getState().updateUserInVideos(
                    video.user!.username,
                    { is_following: isFollowing },
                  );
                }}
              />
            ) : null
          ) : null}
          {/* ── Tagged-people indicator - only when ≥1 user was tagged ── */}
          {hasTaggedUsers && (
            <button
              type="button"
              aria-label={`Tagged people (${taggedUsers.length})`}
              onClick={(e) => { e.stopPropagation(); setTaggedSheetOpen(true); }}
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full border border-white/[0.18] bg-black/35 text-white backdrop-blur transition-all duration-200 hover:scale-[1.04] hover:bg-white/[0.16]"
            >
              <TagIconGlyph size={13} />
            </button>
          )}
          {/* ── Paid-collaboration indicator - independent of the tag one
                 above, only when ≥1 collaborator accepted the request ── */}
          {hasCollabUsers && (
            <button
              type="button"
              aria-label={`Collab partners (${collabUsers.length})`}
              onClick={(e) => { e.stopPropagation(); setCollabSheetOpen(true); }}
              className="flex h-[26px] w-[26px] flex-shrink-0 items-center justify-center rounded-full border border-white/[0.18] bg-black/35 text-white backdrop-blur transition-all duration-200 hover:scale-[1.04] hover:bg-white/[0.16]"
            >
              <CollabIconGlyph size={16} />
            </button>
          )}
        </div>

        {hasTaggedUsers && (
          <TaggedPeopleSheet
            open={taggedSheetOpen}
            onClose={() => setTaggedSheetOpen(false)}
            users={taggedUsers}
            kind={taggedPostKind}
            cardRef={containerRef}
          />
        )}

        {hasCollabUsers && (
          <TaggedPeopleSheet
            open={collabSheetOpen}
            onClose={() => setCollabSheetOpen(false)}
            users={collabUsers}
            kind={taggedPostKind}
            title="Collab partners"
            cardRef={containerRef}
          />
        )}

        {/* ── Caption with expand/collapse ── */}
        {caption && (() => {
          return (
            <div className="mt-1" onClick={(e) => e.stopPropagation()}>
              <p
                ref={captionRef}
                className="text-[13px] font-medium leading-[1.4] text-white/90 max-w-[92%]"
                style={{
                  wordBreak: "break-word",
                  display: captionExpanded ? "block" : "-webkit-box",
                  WebkitLineClamp: captionExpanded ? "unset" : 1,
                  WebkitBoxOrient: captionExpanded ? "vertical" : "vertical",
                  overflow: captionExpanded ? "visible" : "hidden",
                }}
              >
                {caption}
              </p>
              {!captionExpanded && captionClamped && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCaptionExpanded(true); }}
                  className="text-[13px] font-bold text-white/80 hover:text-white transition"
                  style={{ marginTop: "2px" }}
                >
                  …more
                </button>
              )}
              {/* Hashtags - only visible when caption is expanded */}
              {captionExpanded && tags.length > 0 && (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5" onClick={(e) => e.stopPropagation()}>
                  {tags.map((t) => (
                    <Link
                      key={t}
                      href={`/explore?q=${encodeURIComponent(t)}`}
                      onClick={(e) => e.stopPropagation()}
                      className="text-[12px] font-semibold text-white/85 hover:text-white"
                    >
                      #{t}
                    </Link>
                  ))}
                </div>
              )}

              {captionExpanded && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setCaptionExpanded(false); }}
                  className="mt-1 text-[13px] font-semibold text-white/60 hover:text-white/80 transition"
                >
                  less
                </button>
              )}
            </div>
          );
        })()}

      </div>

      {/* Auto-hiding progress bar pinned to the very bottom edge of the player.
          Fades in on mouse activity / hover, fades out when the cursor is idle;
          always shown while scrubbing. Kept slightly translucent. */}
      {!isImage && !isCarousel && (
        <div
          ref={progressRef}
          role="slider"
          aria-label="Video progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(progressPct)}
          className={cn(
            "group absolute inset-x-0 bottom-0 z-20 flex cursor-pointer flex-col justify-end px-3 pt-3 pb-2 transition-opacity duration-300",
            (controlsVisible || isDragging) ? "opacity-90" : "opacity-0 pointer-events-none",
          )}
          style={{ touchAction: "none" }}
          onMouseDown={onProgressMouseDown}
          onTouchStart={onProgressTouchStart}
          onTouchMove={(e) => { e.stopPropagation(); seekTo(e.touches[0].clientX); }}
          onTouchEnd={(e) => {
            e.stopPropagation();
            isSeekingRef.current = false;
            setIsDragging(false);
            const el = ref.current;
            if (el && wasPlayingRef.current) el.play().catch(() => {});
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Scrub timecode - only while seeking forward/back */}
          {isDragging && (
            <div
              className="pointer-events-none absolute bottom-5 -translate-x-1/2 whitespace-nowrap rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-white backdrop-blur-sm"
              style={{ left: `${progressPct}%` }}
            >
              {fmtTime(currentTime)} / {fmtTime(duration || video.duration || 15)}
            </div>
          )}
          {/* Track */}
          <div className="relative h-0.5 w-full overflow-visible rounded-full bg-white/25 group-hover:h-1 transition-all duration-150">
            {/* Filled */}
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-[#fe2c55]"
              style={{ width: `${progressPct}%` }}
            />
            {/* Thumb */}
            <div
              className={cn(
                "absolute top-1/2 -translate-y-1/2 -translate-x-1/2 h-3 w-3 rounded-full bg-white shadow-md transition-opacity",
                isDragging ? "opacity-100 scale-125" : "opacity-0 group-hover:opacity-100",
              )}
              style={{ left: `${progressPct}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
// Only re-render when the displayed video data, active status, or near-active
// preload window changes. Stable callback props (onEnded, feedIds, etc.) are
// intentionally excluded so a like/save on a different feed video never
// causes off-screen slides to re-render.
}, (prev, next) =>
  prev.video       === next.video       &&
  prev.orientation === next.orientation &&
  prev.isActive    === next.isActive    &&
  prev.isNearActive === next.isNearActive,
);

/* ─── Video action stack (right of video) ──────────────────────────────────── */

function VideoActions({
  video, onOpenComments,
}: {
  video: ReelsooVideo;
  onOpenComments: () => void;
}) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);
  const actionsAuthUser = useAuthStore((s) => s.user);
  const actionsQc       = useQueryClient();
  const [saved,      setSaved]      = useState<boolean>(!!video.is_saved);
  const [saveCount,  setSaveCount]  = useState<number>(video.saves_count ?? 0);
  const [sharesCount, setSharesCount] = useState<number>(video.shares_count ?? 0);
  const [sharePanelOpen,    setSharePanelOpen]    = useState(false);
  const [storyModalOpen,    setStoryModalOpen]    = useState(false);
  const [storySharedVideo,  setStorySharedVideo]  = useState<SharedVideoSource | null>(null);
  const [soundCoverErr, setSoundCoverErr] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement>(null);

  /* Like - feed store is the single source of truth for is_liked / likes_count,
     so the button always reflects the authoritative state immediately. The tap
     flips the store optimistically, then syncLike hits the IDEMPOTENT like/unlike
     endpoints via a single-flight, last-intent-wins queue (see lib/like-sync).
     This is what fixes "have to press unlike 5-6 times": the old code used the
     non-idempotent toggle-like, so any doubled/overlapping tap sent two toggles
     that cancelled out and left the like stuck flip-flopping. */
  const liked     = !!video.is_liked;
  const likeCount = video.likes_count ?? 0;

  function onLikeClick() {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    const prev = { is_liked: !!video.is_liked, likes_count: video.likes_count ?? 0 };
    const nextLiked = !prev.is_liked;
    useFeedStore.getState().updateVideo(video.id, {
      is_liked:    nextLiked,
      likes_count: Math.max(0, prev.likes_count + (nextLiked ? 1 : -1)),
    });
    syncLike(video.id, nextLiked, {
      onSettled: (res) => useFeedStore.getState().updateVideo(video.id, {
        is_liked: res.liked, likes_count: res.likes_count,
      }),
      onError: () => {
        useFeedStore.getState().updateVideo(video.id, prev);
        toast.error("Couldn't update your like. Try again.");
      },
    });
  }

  /* Save - same idempotent single-flight pattern as like (fixes the identical
     flip-flop on rapid un-save that the non-idempotent toggle-save had). */
  function onSaveClick() {
    if (!isAuthenticated) { openAuthModal("login"); return; }
    const prev = { saved, count: saveCount };
    const nextSaved = !prev.saved;
    setSaved(nextSaved);
    setSaveCount((c) => Math.max(0, c + (nextSaved ? 1 : -1)));
    useFeedStore.getState().updateVideo(video.id, {
      is_saved:    nextSaved,
      saves_count: Math.max(0, prev.count + (nextSaved ? 1 : -1)),
    });
    syncSave(video.id, nextSaved, {
      onSettled: (res) => {
        setSaved(res.saved);
        setSaveCount(res.saves_count);
        useFeedStore.getState().updateVideo(video.id, {
          is_saved: res.saved, saves_count: res.saves_count,
        });
        if (res.saved) {
          notify.saved("View it in your profile → Saved tab.");
        } else {
          notify.unsaved();
        }
        if (actionsAuthUser?.username) {
          actionsQc.invalidateQueries({ queryKey: ["profile-saved", actionsAuthUser.username] });
        }
      },
      onError: () => {
        setSaved(prev.saved);
        setSaveCount(prev.count);
        useFeedStore.getState().updateVideo(video.id, { is_saved: prev.saved, saves_count: prev.count });
        toast.error("Couldn't update save. Try again.");
      },
    });
  }

  function onShareClick() {
    // Always open the share panel so the user explicitly picks a platform.
    // This prevents the share count from incrementing when the button is
    // tapped on mobile (native share resolves before the user actually sends).
    setSharePanelOpen(true);
  }

  const username  = video.user?.username ?? "user";
  const bg        = colorFor(username);
  const mainSound = video.main_sound ?? null;
  const soundLabel = mainSound
    ? `${mainSound.title}${mainSound.artist_name ? ` · ${mainSound.artist_name}` : ""}`
    : video.music_track
      ? `${video.music_track.title}${video.music_track.artist ? ` · ${video.music_track.artist}` : ""}`
      : `Original Track - @${username}`;

  return (
    <div className="flex flex-col items-center gap-3 pb-2">
      {/* Avatar + follow badge ─────────────────────────────────────── */}
      <div className="relative mb-1">
        <StoryRingAvatar
          userId={video.user?.id ?? 0}
          username={username}
          displayName={video.user?.name ?? username}
          avatar={video.user?.avatar ?? null}
          size={44}
        />

        {/* Tap the badge to follow / unfollow - functional, not decorative */}
        {video.user?.username && (
          <FollowButton
            variant="avatar-plus"
            username={video.user.username}
            initialFollowing={!!video.user.is_following}
            onFollowChanged={(following) => {
              useFeedStore.getState().updateUserInVideos(
                video.user!.username,
                { is_following: following },
              );
            }}
          />
        )}
      </div>

      <ActionBtn
        icon={<AnimatedHeart filled={liked} className={cn("h-[23px] w-[23px]", liked && "fill-[#fe2c55] text-[#fe2c55]")} />}
        label={formatCompact(likeCount)}
        onClick={onLikeClick}
      />
      <ActionBtn
        icon={<MessageCircle className="h-[23px] w-[23px]" strokeWidth={2} />}
        label={formatCompact(video.comments_count ?? 0)}
        onClick={onOpenComments}
      />
      <ActionBtn
        icon={<AnimatedBookmark filled={saved} className={cn("h-[23px] w-[23px]", saved && "fill-[#111827] text-[#111827]")} />}
        label={formatCompact(saveCount)}
        onClick={onSaveClick}
      />
      <ActionBtn
        ref={shareBtnRef}
        icon={<Share2 className="h-[23px] w-[23px]" strokeWidth={2} />}
        label={formatCompact(sharesCount)}
        onClick={onShareClick}
      />

      <VideoSharePanel
        anchorRef={shareBtnRef}
        videoId={video.id}
        open={sharePanelOpen}
        onClose={() => setSharePanelOpen(false)}
        onSharesUpdated={setSharesCount}
        onShareToStory={() => {
          setStorySharedVideo({
            id:           video.id,
            mediaUrl:     video.video_url,
            thumbnailUrl: video.thumbnail_url ?? null,
            duration:     video.duration ?? null,
            size:         video.file_size ?? null,
            title:        video.title ?? null,
          });
          setStoryModalOpen(true);
        }}
      />

      <CreateStoryModal
        open={storyModalOpen}
        onClose={() => { setStoryModalOpen(false); setStorySharedVideo(null); }}
        sharedVideo={storySharedVideo}
      />

      {/* Sound disc - only shown when the post has real playable audio (video original or library music).
          Photo and text posts without selected music have mainSound=null and no music_track, so no disc. */}
      {mainSound ? (
        <Link
          href={mainSound.route}
          onClick={e => e.stopPropagation()}
          title={soundLabel}
          className="mt-1 block h-11 w-11 shrink-0 rounded-full overflow-hidden border-2 border-white/20 shadow-md hover:opacity-90 transition-opacity"
        >
          {mainSound.cover_url && !soundCoverErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={mainSound.cover_url}
              alt={mainSound.title}
              onError={() => setSoundCoverErr(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full grid place-items-center" style={{ background: `radial-gradient(circle at 30% 30%, ${bg}, #111)` }}>
              <Music2 className="h-4 w-4 text-white" />
            </div>
          )}
        </Link>
      ) : video.music_track ? (
        // Fallback: old videos published before main_sound field existed
        <Link
          href={`/sound/${video.music_track.id}`}
          onClick={e => e.stopPropagation()}
          title={`${video.music_track.title}${video.music_track.artist ? ` · ${video.music_track.artist}` : ""}`}
          className="mt-1 block h-11 w-11 shrink-0 rounded-full overflow-hidden border-2 border-white/20 shadow-md hover:opacity-90 transition-opacity"
        >
          {video.music_track.cover_url && !soundCoverErr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={video.music_track.cover_url}
              alt={video.music_track.title}
              onError={() => setSoundCoverErr(true)}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="h-full w-full grid place-items-center" style={{ background: `radial-gradient(circle at 30% 30%, ${bg}, #111)` }}>
              <Music2 className="h-4 w-4 text-white" />
            </div>
          )}
        </Link>
      ) : null}
    </div>
  );
}

type ActionBtnProps = {
  icon:      React.ReactNode;
  label:     string;
  onClick:   () => void;
  pending?:  boolean;
  ref?:      React.Ref<HTMLButtonElement>;
};

function ActionBtn({ icon, label, onClick, pending, ref }: ActionBtnProps) {
  return (
    <button
      ref={ref}
      onClick={onClick}
      disabled={pending}
      className="flex flex-col items-center gap-1 text-[11px] font-semibold text-black disabled:opacity-60 disabled:cursor-wait"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-[#f1f1f2] text-black shadow-sm transition hover:bg-[#e6e6e8] active:scale-95">
        {icon}
      </span>
      <span className="leading-none">{label}</span>
    </button>
  );
}
