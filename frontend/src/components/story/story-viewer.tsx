"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Eye, Flag, MoreVertical, Pause, Play, Send, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { storyService, EMPTY_STORY_ANALYTICS, type StoryUser, type StoryViewer, type StoryAnalytics } from "@/services/story.service";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";
import { useHlsSource } from "@/hooks/use-hls-source";
import { toast } from "sonner";
import { ReportModal } from "@/components/report/ReportModal";

const IMAGE_DURATION_MS = 5000;
const DEFAULT_VIDEO_MS  = 15000;

const REACTIONS = [
  { emoji: "❤️", type: "heart" as const },
  { emoji: "🔥", type: "fire"  as const },
  { emoji: "😮", type: "wow"   as const },
  { emoji: "😂", type: "haha"  as const },
  { emoji: "😢", type: "sad"   as const },
];

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1)  return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24)  return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

interface StoryViewerProps {
  storyUsers:     StoryUser[];
  initialUserIdx: number;
  onClose:        () => void;
  onSeenChange?:  (userId: number) => void;
  onDeleted?:     (storyId: number) => void;
}

export function StoryViewer({ storyUsers, initialUserIdx, onClose, onSeenChange, onDeleted }: StoryViewerProps) {
  const [userIdx,       setUserIdx]       = useState(initialUserIdx);
  const [storyIdx,      setStoryIdx]      = useState(0);
  const [progress,      setProgress]      = useState(0);
  const [isPaused,      setIsPaused]      = useState(false);
  const [videoPaused,   setVideoPaused]   = useState(false);
  const [reply,         setReply]         = useState("");
  const [imgErr,        setImgErr]        = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [sentReaction,  setSentReaction]  = useState<string | null>(null);
  const [menuOpen,      setMenuOpen]      = useState(false);
  const [reportOpen,    setReportOpen]    = useState(false);
  const [replySending,  setReplySending]  = useState(false);

  const [viewersOpen,    setViewersOpen]    = useState(false);
  // Carries the backend's authoritative counters alongside the list. Nothing
  // here is derived by counting `viewers` - see the stats row in the panel.
  const [viewersData,    setViewersData]    = useState<(StoryAnalytics & { total: number; viewers: StoryViewer[] }) | null>(null);
  const [viewersLoading, setViewersLoading] = useState(false);
  const [floatingEmojis, setFloatingEmojis] = useState<{ id: number; emoji: string; x: number }[]>([]);

  const holdStartRef = useRef(0);
  const goNextRef    = useRef<() => void>(() => {});
  const videoRef     = useRef<HTMLVideoElement>(null);

  const authUser  = useAuthStore((s) => s.user);
  const isAuth    = useAuthStore((s) => s.isAuthenticated);

  /* Story audio follows the same preference as every other video on the site.
   * It used to be local state starting at unmuted, so muting the feed and then
   * opening a story blasted sound at someone who had explicitly asked for
   * silence - and muting a story was forgotten the moment it closed. */
  const muted     = useUiStore((s) => s.mutedPref);
  const setMuted  = useUiStore((s) => s.setMutedPref);

  const currentUserData = storyUsers[userIdx];
  const currentStory    = currentUserData?.stories[storyIdx];
  const currentMedia    = currentStory?.media[0];
  const isVideo         = currentMedia?.media_type === "video";
  const isOwnStory      = authUser?.id === currentUserData?.user.id;
  const duration        = isVideo
    ? (currentMedia?.duration_seconds ? currentMedia.duration_seconds * 1000 : DEFAULT_VIDEO_MS)
    : IMAGE_DURATION_MS;
  const mediaUrl        = currentMedia?.media_url ?? null;

  /* Source is wired imperatively, exactly as the feed and detail page do it.
   *
   * It used to be a plain `src={mediaUrl}` attribute, which works only while
   * every story is a progressive file. The moment one is transcoded to HLS,
   * Chrome and Firefox fail it with MEDIA_ERR_SRC_NOT_SUPPORTED - and because
   * the <video> here carries no error handler, the result is a black frame
   * behind a progress bar that keeps running. Safari would have played it,
   * which is the worst possible way for this to be discovered.
   *
   * No progressive fallback is passed: a story carries a single media_url, so
   * there is no second URL to fall back to. */
  useHlsSource(videoRef, isVideo ? mediaUrl : undefined);

  /* ── Navigation ─────────────────────────────────────────────── */
  function goNext() {
    const user = storyUsers[userIdx];
    if (storyIdx < (user?.stories.length ?? 0) - 1) {
      setStoryIdx(s => s + 1);
    } else if (userIdx < storyUsers.length - 1) {
      setUserIdx(u => u + 1);
      setStoryIdx(0);
    } else {
      onClose();
    }
    setProgress(0);
    setImgErr(false);
    setShowReactions(false);
    setMenuOpen(false);
    setSentReaction(null);
    setVideoPaused(false);
  }

  function goPrev() {
    if (storyIdx > 0) {
      setStoryIdx(s => s - 1);
    } else if (userIdx > 0) {
      setUserIdx(u => u - 1);
      setStoryIdx(0);
    }
    setProgress(0);
    setImgErr(false);
    setShowReactions(false);
    setMenuOpen(false);
    setSentReaction(null);
    setVideoPaused(false);
  }

  goNextRef.current = goNext;

  /* ── Progress ───────────────────────────────────────────────────────────
   * A VIDEO story's bar is driven by the video's own clock; an image story's
   * by the wall clock, because an image has no clock of its own.
   *
   * The distinction is not cosmetic. This used to be one wall-clock timer for
   * both: it started counting the moment the slide mounted and never looked at
   * the media, so a story that spent two seconds buffering had a bar two
   * seconds ahead of the picture, and a slow connection could run the bar to
   * 100% and advance while the video was still mid-playback. Reading
   * currentTime instead means the bar cannot disagree with what is on screen -
   * a stalled video simply stops advancing, which is the honest signal.
   *
   * `duration_seconds` from the API is still the fallback: it is what sizes the
   * bar before metadata lands, and the only duration an image has. */
  useEffect(() => {
    if (isPaused || videoPaused) return;
    setProgress(0);

    if (isVideo) {
      const el = videoRef.current;
      if (!el) return;
      const onTime = () => {
        // Prefer the element's real duration; fall back to the API's until
        // metadata arrives. Both can be absent for a moment on a fresh slide.
        const total = Number.isFinite(el.duration) && el.duration > 0
          ? el.duration
          : duration / 1000;
        if (total <= 0) return;
        setProgress(Math.min((el.currentTime / total) * 100, 100));
      };
      // `ended` advances, not the bar reaching 100 - the element is the
      // authority on when its own media finished.
      el.addEventListener("timeupdate", onTime);
      return () => el.removeEventListener("timeupdate", onTime);
    }

    const start = Date.now();
    const id = setInterval(() => {
      const pct = Math.min(((Date.now() - start) / duration) * 100, 100);
      setProgress(pct);
      if (pct >= 100) { clearInterval(id); goNextRef.current(); }
    }, 50);
    return () => clearInterval(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused, videoPaused, storyIdx, userIdx, duration, isVideo]);

  /* ── Video play/pause sync ──────────────────────────────────── */
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    if (isPaused || videoPaused) { vid.pause(); } else { void vid.play().catch(() => {}); }
  }, [isPaused, videoPaused]);

  /* ── Mark viewed (skip own stories - owner viewing own story must not count) */
  useEffect(() => {
    if (!currentStory || !isAuth || isOwnStory) return;
    const storyId   = currentStory.id;
    const startedAt = Date.now();

    // Recorded on ENTER rather than on exit: the view is the thing that must
    // never be lost, and someone who closes the tab mid-story still watched it.
    // The backend decides whether this is a new unique viewer - nothing here
    // increments a count.
    void storyService.markViewed(storyId, { slide_index: 0 });
    onSeenChange?.(currentUserData.user.id);

    // How long they actually watched is only knowable once they leave, so it
    // goes up separately as a progress report. progress_only folds it into the
    // view above instead of counting a second watch.
    return () => {
      const watchedSec = Math.round((Date.now() - startedAt) / 1000);
      if (watchedSec <= 0) return;
      void storyService.reportProgress(storyId, {
        watch_duration: watchedSec,
        // 90% of the slide's own length counts as watched through - an exact
        // match would almost never fire, since the timer and the wall clock
        // drift apart while the tab is backgrounded.
        completed: watchedSec * 1000 >= duration * 0.9,
      });
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?.id, isOwnStory]);

  /* ── Keyboard ────────────────────────────────────────────────── */
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "ArrowRight") goNextRef.current();
      if (e.key === "ArrowLeft")  goPrev();
      if (e.key === "Escape")     { if (menuOpen || reportOpen) { setMenuOpen(false); setReportOpen(false); } else onClose(); }
      if (e.key === " ")          setVideoPaused(p => !p);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userIdx, storyIdx, menuOpen, reportOpen]);

  /* ── Viewers panel ──────────────────────────────────────────── */
  const openViewers = useCallback(async () => {
    if (!currentStory || !isOwnStory) return;
    setIsPaused(true);
    setViewersOpen(true);
    setViewersLoading(true);
    try {
      const res = await storyService.viewers(currentStory.id);
      if (!res?.viewers) throw new Error("bad response");
      setViewersData(res);
      // Spawn floating emojis for viewers who reacted
      const EMOJI_MAP: Record<string, string> = { heart: "❤️", fire: "🔥", wow: "😮", haha: "😂", sad: "😢" };
      const reacted = res.viewers.filter((v) => v.reaction_type);
      reacted.slice(0, 6).forEach((v, i) => {
        const eid = Date.now() + i;
        setTimeout(() => {
          setFloatingEmojis((prev) => [...prev, { id: eid, emoji: EMOJI_MAP[v.reaction_type!] ?? "❤️", x: 15 + (i % 5) * 16 }]);
          setTimeout(() => setFloatingEmojis((prev) => prev.filter((e) => e.id !== eid)), 2500);
        }, i * 250);
      });
    } catch {
      toast.error("Couldn't load viewers.");
    } finally {
      setViewersLoading(false);
    }
  }, [currentStory, isOwnStory]);

  // Reset viewers when story changes, then silently pre-fetch count for own stories
  useEffect(() => {
    setViewersData(null);
    setViewersOpen(false);
    setFloatingEmojis([]);
    if (currentStory && isOwnStory) {
      storyService.viewers(currentStory.id)
        .then((res) => setViewersData(res))
        .catch(() => {});
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStory?.id, isOwnStory]);

  /* ── Hold-to-pause ──────────────────────────────────────────── */
  function onPointerDown() { holdStartRef.current = Date.now(); setIsPaused(true); }
  function onPointerUp()   { setIsPaused(false); }

  function handleLeftTap(e: React.MouseEvent) {
    e.stopPropagation();
    if (Date.now() - holdStartRef.current > 300) return;
    goPrev();
  }
  function handleRightTap(e: React.MouseEvent) {
    e.stopPropagation();
    if (Date.now() - holdStartRef.current > 300) return;
    goNextRef.current();
  }

  /* ── Reply send ─────────────────────────────────────────────── */
  async function sendReply() {
    if (!reply.trim() || !currentStory || replySending) return;
    setReplySending(true);
    try {
      await storyService.reply(currentStory.id, reply.trim());
      toast.success("Reply sent!");
      setReply("");
    } catch {
      toast.error("Failed to send reply.");
    } finally {
      setReplySending(false);
    }
  }

  /* ── React ──────────────────────────────────────────────────── */
  async function sendReaction(type: typeof REACTIONS[number]["type"], emoji: string) {
    if (!currentStory) return;
    setShowReactions(false);
    setSentReaction(emoji);
    try {
      await storyService.react(currentStory.id, type);
    } catch {}
    setTimeout(() => setSentReaction(null), 2000);
  }

  /* ── Delete (own story) ─────────────────────────────────────── */
  async function deleteStory() {
    if (!currentStory) return;
    try {
      await storyService.delete(currentStory.id);
      toast.success("Story deleted.");
      onDeleted?.(currentStory.id);
      setMenuOpen(false);
      goNextRef.current();
    } catch {
      toast.error("Failed to delete story.");
    }
  }

  if (!currentUserData || !currentStory) return null;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      {/* Story card */}
      <div
        className="relative flex-shrink-0 overflow-hidden bg-black"
        style={{ width: "min(100vw, 390px)", height: "min(100dvh, 780px)", borderRadius: 16 }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        {/* ── Progress bars ── */}
        <div className="absolute inset-x-2 top-2 z-30 flex gap-[3px] pointer-events-none">
          {currentUserData.stories.map((s, i) => (
            <div key={s.id} className="h-[2.5px] flex-1 overflow-hidden rounded-full bg-white/30">
              <div
                className="h-full rounded-full bg-white"
                style={{
                  width: i < storyIdx ? "100%" : i === storyIdx ? `${progress}%` : "0%",
                  transition: i === storyIdx ? "none" : undefined,
                }}
              />
            </div>
          ))}
        </div>

        {/* ── Header ── */}
        <div className="absolute inset-x-0 top-5 z-30 flex items-center gap-2 px-3 pt-1 pointer-events-none">
          <div className="h-9 w-9 flex-shrink-0 overflow-hidden rounded-full border-2 border-white/40">
            {currentUserData.user.avatar ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={currentUserData.user.avatar} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="grid h-full w-full place-items-center bg-[#fd4605] text-[12px] font-bold text-white">
                {(currentUserData.user.display_name || currentUserData.user.username)[0]?.toUpperCase()}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-white drop-shadow">
              {currentUserData.user.display_name || currentUserData.user.username}
            </p>
            <p className="text-[10px] text-white/60">{timeAgo(currentStory.created_at)}</p>
          </div>
          <div className="pointer-events-auto flex items-center gap-1">
            {/* Video play/pause button */}
            {isVideo && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setVideoPaused(p => !p); }}
                className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10"
              >
                {videoPaused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
              </button>
            )}
            {/* Mute button */}
            {isVideo && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); setMuted(!muted); }}
                className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
            {/* 3-dot menu */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); setReportOpen(false); }}
              className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10"
            >
              <MoreVertical className="h-5 w-5" />
            </button>
            {/* Close */}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onClose(); }}
              className="grid h-8 w-8 place-items-center rounded-full text-white hover:bg-white/10"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* ── 3-dot dropdown menu ── */}
        {menuOpen && (
          <div
            className="absolute right-3 top-16 z-50 overflow-hidden rounded-xl border border-white/10 bg-[#1a1a1a] shadow-2xl"
            style={{ minWidth: 180 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {isOwnStory ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); void deleteStory(); }}
                className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-red-400 hover:bg-white/5"
              >
                <Trash2 className="h-4 w-4" /> Delete story
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); setReportOpen(true); setMenuOpen(false); }}
                  className="flex w-full items-center gap-3 px-4 py-3 text-[13px] font-semibold text-white hover:bg-white/5"
                >
                  <Flag className="h-4 w-4" /> Report story
                </button>
              </>
            )}
          </div>
        )}

        {/* ── Report modal - same shared design every reportable thing uses ── */}
        {reportOpen && currentStory && (
          <ReportModal
            entityType="story"
            entityId={currentStory.id}
            onClose={() => setReportOpen(false)}
            onSubmitted={() => toast.success("Story reported.")}
          />
        )}

        {/* ── Media ── */}
        <div className="absolute inset-0 flex items-center justify-center bg-black">
          {mediaUrl ? (
            isVideo ? (
              <video
                ref={videoRef}
                key={mediaUrl}
                // No `src` - useHlsSource wires it imperatively, because an
                // .m3u8 needs hls.js on every browser but Safari.
                autoPlay
                muted={muted}
                playsInline
                loop={false}
                className="h-full w-full object-cover"
                onEnded={() => goNextRef.current()}
                // A story that cannot be decoded used to sit as a black frame
                // for its full duration: the <img> branch had an error handler
                // and this one did not. Move on rather than showing nothing.
                onError={() => goNextRef.current()}
              />
            ) : imgErr ? (
              <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#fd4605] to-[#a855f7]">
                <span className="text-4xl font-black text-white">
                  {(currentUserData.user.display_name || currentUserData.user.username)[0]?.toUpperCase()}
                </span>
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={mediaUrl}
                src={mediaUrl}
                alt="story"
                className="h-full w-full object-cover"
                onError={() => setImgErr(true)}
              />
            )
          ) : (
            <div className="grid h-full w-full place-items-center bg-gradient-to-br from-[#1d1d1d] to-[#2d2d2d]">
              {currentStory.caption && (
                <p className="max-w-[80%] text-center text-xl font-bold leading-snug text-white">
                  {currentStory.caption}
                </p>
              )}
            </div>
          )}
        </div>

        {/* ── Story layers ── */}
        {currentStory.layers?.map((layer) => {
          const fontMap: Record<string, React.CSSProperties> = {
            modern:     { fontFamily: "sans-serif", fontWeight: 300, letterSpacing: "0.04em" },
            typewriter: { fontFamily: "Courier New, monospace" },
            strong:     { fontWeight: 900, textTransform: "uppercase" },
            minimal:    { fontFamily: "Georgia, serif", letterSpacing: "0.1em" },
          };
          const fontCss = fontMap[layer.font ?? ""] ?? {};
          const content = (() => {
            switch (layer.type) {
              case "text":
                return <span style={{ color: layer.color ?? "#fff", fontSize: 20, fontWeight: 700, whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.6)", ...fontCss }}>{layer.text}</span>;
              case "link":
                return (
                  <a href={layer.url ?? "#"} target="_blank" rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.4)", color: "white", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap", textDecoration: "none" }}>
                    🔗 {layer.text || "Link"}
                  </a>
                );
              case "mention":
                return (
                  <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", color: "#60c4ff", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>
                    @{layer.username ?? layer.text}
                  </span>
                );
              case "hashtag":
                return (
                  <span style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", color: "white", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>
                    {(layer.text ?? "").startsWith("#") ? layer.text : `#${layer.text}`}
                  </span>
                );
              case "location":
                return (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", color: "white", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>
                    📍 {layer.locationName ?? layer.text}
                  </span>
                );
              case "emoji":
                return <span style={{ fontSize: 48, lineHeight: 1, filter: "drop-shadow(0 2px 6px rgba(0,0,0,0.4))" }}>{layer.text}</span>;
              default: return null;
            }
          })();
          return (
            <div key={layer.id ?? layer.text}
              style={{ position: "absolute", left: `${layer.x ?? 50}%`, top: `${layer.y ?? 50}%`, transform: `translate(-50%,-50%) scale(${layer.scale ?? 1}) rotate(${layer.rotation ?? 0}deg)`, zIndex: (layer.zIndex ?? 0) + 25, pointerEvents: "auto" }}>
              {content}
            </div>
          );
        })}

        {/* ── Floating reaction animation ── */}
        {sentReaction && (
          <div
            className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center"
            style={{ animation: "reaction-float 2s ease forwards" }}
          >
            <span style={{ fontSize: 80, filter: "drop-shadow(0 4px 12px rgba(0,0,0,0.5))" }}>
              {sentReaction}
            </span>
          </div>
        )}

        {/* ── Tap zones (left / right) ── */}
        <div className="absolute inset-0 z-20 flex pointer-events-auto">
          <div className="flex-1 cursor-pointer" onClick={handleLeftTap} />
          <div className="flex-1 cursor-pointer" onClick={handleRightTap} />
        </div>

        {/* ── Floating reaction emojis (own story viewer panel) ── */}
        {floatingEmojis.map((fe) => (
          <div
            key={fe.id}
            className="pointer-events-none absolute z-40"
            style={{ left: `${fe.x}%`, bottom: "20%", animation: "reaction-float 2.5s ease forwards" }}
          >
            <span style={{ fontSize: 36, filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.5))" }}>{fe.emoji}</span>
          </div>
        ))}

        {/* ── Bottom: caption + reactions + reply ── */}
        <div className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-black/80 to-transparent px-3 pb-4 pt-12 pointer-events-none">
          {currentStory.caption && mediaUrl && (
            <p className="mb-3 text-[13px] leading-snug text-white drop-shadow">{currentStory.caption}</p>
          )}

          {/* Emoji reactions row (other users viewing). allow_reactions
              lives in the settings document, not a plain column - an
              absent key means "use the default" (true), never false, same
              convention the mobile client's storySetting() reads. Was
              never actually checked here before - the server enforces it
              now too (StoryController::react()), this is just the client
              not offering a control the server would refuse. */}
          {isAuth && !isOwnStory && currentStory.settings?.allow_reactions !== false && (
            <div
              className="mb-2 flex items-center gap-1.5 pointer-events-auto"
              onPointerDown={(e) => e.stopPropagation()}
            >
              {showReactions ? (
                <>
                  {REACTIONS.map((r) => (
                    <button
                      key={r.type}
                      type="button"
                      onClick={() => void sendReaction(r.type, r.emoji)}
                      className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-xl transition hover:bg-white/20 hover:scale-110"
                    >
                      {r.emoji}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => setShowReactions(false)}
                    className="grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowReactions(true)}
                  className="flex items-center gap-1.5 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[13px] text-white transition hover:bg-white/20"
                >
                  <span>❤️</span> React
                </button>
              )}
            </div>
          )}

          {/* Reply input (other users) */}
          {currentStory.allow_replies && isAuth && !isOwnStory && (
            <div
              className="flex items-center gap-2 pointer-events-auto"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <input
                type="text"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void sendReply(); }}
                placeholder="Reply to story…"
                className="flex-1 rounded-full border border-white/30 bg-white/10 px-3 py-1.5 text-[13px] text-white outline-none placeholder:text-white/50 focus:border-white/60 backdrop-blur-sm"
              />
              <button
                type="button"
                disabled={!reply.trim() || replySending}
                className={cn(
                  "grid h-8 w-8 flex-shrink-0 place-items-center rounded-full transition",
                  reply.trim() ? "bg-[#fd4605] text-white" : "bg-white/10 text-white/40",
                )}
                onClick={() => void sendReply()}
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}

          {/* Viewers count bar - only shown to story owner */}
          {isOwnStory && (
            <button
              type="button"
              className="pointer-events-auto flex items-center gap-2 rounded-xl bg-black/40 px-3 py-2 backdrop-blur-sm transition hover:bg-black/60"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => { e.stopPropagation(); void openViewers(); }}
            >
              <Eye className="h-4 w-4 text-white/80" />
              <span className="text-[13px] font-semibold text-white">
                {viewersData ? viewersData.total : "-"} viewers
              </span>
              <span className="text-white/50 text-[11px]">↑ tap to see</span>
            </button>
          )}
        </div>

        {/* ── Viewers sheet (slides up) ── */}
        {viewersOpen && isOwnStory && (
          <div
            className="absolute inset-x-0 bottom-0 z-50 flex flex-col rounded-t-2xl bg-white"
            style={{ maxHeight: "70%", minHeight: 200 }}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {/* Handle */}
            <div className="flex justify-center pt-2 pb-1">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>
            {/* Header */}
            <div className="flex items-center justify-between px-4 pb-2">
              <p className="text-[15px] font-bold text-gray-900">
                {viewersLoading ? "Loading…" : `${viewersData?.total ?? 0} viewers`}
              </p>
              <button
                type="button"
                onClick={() => { setViewersOpen(false); setIsPaused(false); }}
                className="grid h-7 w-7 place-items-center rounded-full bg-gray-100 text-gray-500"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* ── Authoritative counters ──
                Every number below comes from the backend rollup. None is
                derived by counting `viewers` client-side - that is exactly how
                web and mobile drifted apart, since two clients totalling the
                same list their own way eventually disagree. Reactions and
                replies are SUBSETS of viewers (you must have seen a story to
                react to it), so they sit beside the viewer count and are never
                added to it. */}
            {!viewersLoading && (viewersData?.unique_viewers ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 pb-2.5 text-[12px] text-gray-500">
                <span><b className="font-bold text-gray-900">{(viewersData?.unique_viewers ?? 0).toLocaleString()}</b> viewers</span>
                <span><b className="font-bold text-gray-900">{(viewersData?.reaction_count ?? 0).toLocaleString()}</b> reactions</span>
                <span><b className="font-bold text-gray-900">{(viewersData?.reply_count ?? 0).toLocaleString()}</b> replies</span>
                <span><b className="font-bold text-gray-900">{(viewersData?.share_count ?? 0).toLocaleString()}</b> shares</span>
              </div>
            )}

            {/* Per-type reaction breakdown, hidden entirely when nobody has
                reacted so the sheet does not show a row of zeroes. */}
            {!viewersLoading && (viewersData?.reaction_count ?? 0) > 0 && (
              <div className="flex flex-wrap items-center gap-2 px-4 pb-2.5">
                {Object.entries(viewersData?.reactions_breakdown ?? {})
                  .filter(([, n]) => n > 0)
                  .map(([type, n]) => (
                    <span key={type} className="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[12px] text-gray-700">
                      <span>{REACTION_EMOJI[type] ?? "❤️"}</span>
                      <b className="font-bold text-gray-900">{n.toLocaleString()}</b>
                    </span>
                  ))}
              </div>
            )}

            <div className="h-px bg-gray-100" />
            {/* List */}
            <div className="flex-1 overflow-y-auto">
              {viewersLoading ? (
                <div className="flex flex-col gap-3 p-4">
                  {[1,2,3].map((i) => (
                    <div key={i} className="flex items-center gap-3">
                      <div className="h-10 w-10 animate-pulse rounded-full bg-gray-100" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-28 animate-pulse rounded bg-gray-100" />
                        <div className="h-2.5 w-16 animate-pulse rounded bg-gray-100" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : viewersData?.viewers.length === 0 ? (
                <p className="p-6 text-center text-[13px] text-gray-400">No viewers yet</p>
              ) : (
                <div className="divide-y divide-gray-50">
                  {viewersData?.viewers.map((v) => (
                    <ViewerRow key={v.id} viewer={v} />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Dim overlay when viewers sheet is open */}
        {viewersOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/20"
            onClick={() => { setViewersOpen(false); setIsPaused(false); }}
          />
        )}
      </div>

      {/* ── User navigation arrows (outside card) ── */}
      {userIdx > 0 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goPrev(); }}
          className="absolute left-4 top-1/2 z-[201] -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronLeft className="h-6 w-6" />
        </button>
      )}
      {userIdx < storyUsers.length - 1 && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); goNextRef.current(); }}
          className="absolute right-4 top-1/2 z-[201] -translate-y-1/2 grid h-10 w-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        >
          <ChevronRight className="h-6 w-6" />
        </button>
      )}

      <style>{`
        @keyframes reaction-float {
          0%   { opacity: 0; transform: scale(0.5) translateY(20px); }
          20%  { opacity: 1; transform: scale(1.2) translateY(0); }
          80%  { opacity: 1; transform: scale(1) translateY(-30px); }
          100% { opacity: 0; transform: scale(0.8) translateY(-80px); }
        }
      `}</style>
    </div>
  );
}

/* ── Viewer row ──────────────────────────────────────────────── */
const REACTION_EMOJI: Record<string, string> = {
  heart: "❤️", fire: "🔥", wow: "😮", haha: "😂", sad: "😢",
};

function ViewerRow({ viewer }: { viewer: StoryViewer }) {
  const initials = (viewer.display_name || viewer.username)[0]?.toUpperCase() ?? "U";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <div className="relative h-10 w-10 flex-shrink-0">
        {viewer.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={viewer.avatar} alt={viewer.display_name} className="h-full w-full rounded-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center rounded-full bg-[#fd4605] text-[13px] font-bold text-white">
            {initials}
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-900 truncate">
          {viewer.display_name || viewer.username}
          {viewer.is_verified && <VerifiedBadge size={14} className="ml-1 inline-block align-middle" />}
        </p>
        {viewer.reaction_type && (
          <p className="mt-0.5 text-[12px] text-gray-400 flex items-center gap-1">
            <span style={{ animation: "reaction-float 0s none", fontSize: 14 }}>
              {REACTION_EMOJI[viewer.reaction_type]}
            </span>
            reacted
          </p>
        )}
      </div>
      {viewer.reaction_type && (
        <span className="flex-shrink-0 text-[20px]">{REACTION_EMOJI[viewer.reaction_type]}</span>
      )}
    </div>
  );
}
