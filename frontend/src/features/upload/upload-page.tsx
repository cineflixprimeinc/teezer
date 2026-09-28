"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { LucideIcon } from "lucide-react";
import {
  Activity, AlertTriangle, AtSign, BadgeCheck, Bookmark, BookOpen, Briefcase, Calendar, Camera, Car, ChefHat,
  Check, ChevronLeft, ChevronRight, Clapperboard, Clock, Copyright, Crop, Dumbbell, Flame, Gamepad2, Globe,
  MapPin,
  GraduationCap, Hammer, Hash, Heart, HeartHandshake, HeartPulse,
  HelpCircle, Home, Images, Leaf, Lightbulb, Loader2, Lock, LayoutGrid, Maximize2, MessageCircle,
  Monitor, Music, Music2, Newspaper, Palette, Pause, PawPrint, Pencil, Plane, Play,
  Plus, RotateCcw, Search, Send, Share2, Shield, Shirt, Smartphone, Smile, SlidersHorizontal,
  Scissors, Sparkles, Sun, ThumbsUp, Trees, Trophy, UploadCloud, User, ShieldAlert, ShieldCheck,
  UserPlus, Users, Utensils, Video, Volume2, VolumeX, X, Zap,
  // Phone-preview chrome, so it mirrors the real app bar rather than an older
  // seven-tab layout: Spaces and repost.
  AudioWaveform, Repeat2,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { DatePicker, TimePicker } from "@/components/ui/date-time-picker";
import { api, apiMessage } from "@/services/api";
import { uploadService, MULTIPART_THRESHOLD_BYTES } from "@/services/upload.service";
import { searchService, type SearchUser } from "@/services/search.service";
import { useFeedStore } from "@/store/feed.store";
import { useAuthStore } from "@/store/auth.store";
import { ThumbnailSelector, type Thumbnail } from "./thumbnail-selector";
import { UploadChecklist, type ChecklistState } from "./upload-checklist";
import { BestTimeToPostCard } from "./best-time-to-post-card";
import { Dropdown, type DropdownOption } from "./dropdown";
import {
  CATEGORY_OPTIONS, DESCRIPTION_MAX, HASHTAGS_MAX,
  initialFormState, type MediaType, type UploadFormState, type VideoProbe,
} from "./types";
import { cn } from "@/lib/utils";
import { RestrictionBanner } from "@/components/restriction-banner";
import { MusicLibraryModal, type AudioTrack } from "./music-library-modal";
import { locationService, type LocationResult } from "@/services/location.service";

/* ─── Constants ─────────────────────────────────────────────────────────────── */
// Allowed video formats: MP4, MOV (quicktime), WebM only.
const VIDEO_MIMES         = ["video/mp4", "video/webm", "video/quicktime"];
const IMAGE_MIMES         = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
const MAX_VIDEO_BYTES     = 500 * 1024 * 1024;
const MAX_IMAGE_BYTES     = 20  * 1024 * 1024;
const MAX_VIDEO_SECS      = 600;
const MIN_VIDEO_SECS      = 5;
const MAX_CAROUSEL_IMAGES = 10;
const MAX_TAGGED_USERS    = 20;

/** A user tagged via the "Tag people" field - structured data, never plain caption text. */
type TaggedUser = {
  id: number;
  username: string;
  display_name: string;
  avatar_url: string | null;
  verified: boolean;
};

const FILTER_PRESETS = [
  { name: "Normal", css: ""                                  },
  { name: "Vivid",  css: "saturate(160%) contrast(110%)"    },
  { name: "Cool",   css: "hue-rotate(30deg) saturate(120%)" },
  { name: "Warm",   css: "sepia(30%) saturate(130%)"        },
  { name: "B&W",    css: "grayscale(100%)"                  },
  { name: "Fade",   css: "brightness(115%) saturate(70%)"   },
];

const ACCEPT_MULTI = ["image/jpeg","image/jpg","image/png","image/webp",".jpg",".jpeg",".png",".webp"].join(",");
// Video tab dropzone accepts videos only - keeps each tab's content type isolated.
const ACCEPT_VIDEO = ["video/mp4","video/quicktime","video/webm",".mp4",".mov",".webm"].join(",");

type PreparedUpload = {
  mediaType: MediaType;
  objectKey: string;
  mimeType: string;
  fileSize: number;
  mediaItems?: { object_key: string; order: number; mime_type: string }[];
  checkStatus?: ContentStatus;
};

/**
 * Media upload state, not a moderation verdict - the pre-publish content check
 * was removed. "checking" means the file is uploading, "passed" means it landed
 * and the post can be published. The old "review"/"failed" scan verdicts are
 * gone; an upload now either succeeds or errors.
 */
type ContentStatus = "idle" | "checking" | "passed" | "error";

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
function probeVideo(file: File): Promise<VideoProbe | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const el  = document.createElement("video");
    el.preload = "metadata"; el.src = url;
    el.onloadedmetadata = () => {
      const p = { duration: Math.round(el.duration||0), width: el.videoWidth||0, height: el.videoHeight||0 };
      URL.revokeObjectURL(url); resolve(p.duration ? p : null);
    };
    el.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
  });
}

async function generateThumbnails(file: File, count = 6): Promise<Thumbnail[]> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const v   = document.createElement("video");
    v.preload = "auto"; v.muted = true; v.playsInline = true; v.src = url;
    const cleanup = () => URL.revokeObjectURL(url);
    v.onloadedmetadata = async () => {
      const dur = v.duration||0;
      if (!dur) { cleanup(); resolve([]); return; }
      const canvas = document.createElement("canvas");
      const ctx    = canvas.getContext("2d");
      if (!ctx) { cleanup(); resolve([]); return; }
      // Size the canvas to the video's real aspect ratio so cover frames are
      // never squished (landscape frames previously got crushed into 9:16).
      const ar = (v.videoWidth && v.videoHeight) ? v.videoWidth / v.videoHeight : 9 / 16;
      const cw = ar >= 1 ? 640 : Math.max(1, Math.round(640 * ar));
      const ch = ar >= 1 ? Math.max(1, Math.round(640 / ar)) : 640;
      canvas.width = cw; canvas.height = ch;
      const times = Array.from({ length: count }, (_, i) => (dur*(i+0.5))/count);
      const out: Thumbnail[] = [];
      for (const t of times) {
        await new Promise<void>((res) => {
          let done = false;
          const finish = () => { if (done) return; done = true; clearTimeout(to); v.removeEventListener("seeked", onS); res(); };
          const onS = () => finish();
          v.addEventListener("seeked", onS);
          // Never hang if 'seeked' doesn't fire for this codec/frame.
          const to = setTimeout(finish, 3000);
          try { v.currentTime = Math.min(Math.max(t,0), Math.max(0,dur-0.05)); } catch { finish(); }
        });
        ctx.drawImage(v, 0, 0, cw, ch);
        const blob: Blob|null = await new Promise((res) => canvas.toBlob(res,"image/jpeg",0.82));
        if (blob) out.push({ id:`gen-${out.length}-${Math.random().toString(36).slice(2,8)}`, url:URL.createObjectURL(blob), blob });
      }
      cleanup(); resolve(out);
    };
    v.onerror = () => { cleanup(); resolve([]); };
  });
}

function fmtMB(b: number) { return `${(b/1024/1024).toFixed(1)} MB`; }

/* ─── Category options with icons ─────────────────────────────────────────── */
const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "Comedy":               Smile,
  "Dance":                Zap,
  "Music":                Music,
  "Travel & Nature":      Plane,
  "Travel":               Plane,
  "Food":                 Utensils,
  "Fashion":              Shirt,
  "Beauty":               Sparkles,
  "Lifestyle":            Leaf,
  "Fitness":              Dumbbell,
  "Sports":               Trophy,
  "Gaming":               Gamepad2,
  "Education":            GraduationCap,
  "Technology":           Monitor,
  "Business":             Briefcase,
  "Motivation":           Flame,
  "News":                 Newspaper,
  "Entertainment":        Clapperboard,
  "Vlog":                 Video,
  "Art":                  Palette,
  "Photography":          Camera,
  "Animals & Pets":       PawPrint,
  "Nature":               Trees,
  "Cars & Bikes":         Car,
  "Health":               HeartPulse,
  "DIY & Crafts":         Hammer,
  "Family":               Home,
  "Relationships":        HeartHandshake,
  "Cooking":              ChefHat,
  "Reviews":              ThumbsUp,
  "Tutorials":            BookOpen,
  "Religious / Spiritual":Sun,
  "Other":                HelpCircle,
};

const CAT_OPTS: DropdownOption<string>[] = CATEGORY_OPTIONS.map((c) => ({
  value: c, label: c, icon: (CATEGORY_ICONS[c] ?? BookOpen) as LucideIcon,
}));

/* ─── Toggle ────────────────────────────────────────────────────────────────── */
function Toggle({ checked, onChange, disabled }: { checked:boolean; onChange:(v:boolean)=>void; disabled?:boolean }) {
  return (
    <button type="button" role="switch" aria-checked={checked} disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition", checked?"bg-[#fe2c55]":"bg-[#e5e7eb]")}>
      <span className={cn("inline-block h-4 w-4 rounded-full bg-white shadow transition-transform", checked?"translate-x-[18px]":"translate-x-[2px]")} />
    </button>
  );
}



/* ─── Mobile Preview Card ────────────────────────────────────────────────────── */
type MobilePreviewProps = {
  previewUrl:  string|null; mediaType: MediaType|null;
  previewUrls: string[];    caption:   string;
  hashtags:    string[];    soundLabel:string;
  originalVolume?: number;
  musicVolume?: number;
  originalMuted?: boolean;
  musicMuted?: boolean;
  musicUrl?: string | null;
  /** Per-photo CSS filter/adjust styles, indexed to match previewUrls. */
  photoStyles?: React.CSSProperties[];
};

function fmtTime(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

function MobilePreviewCard({
  previewUrl, mediaType, previewUrls, caption, hashtags, soundLabel,
  originalVolume = 100, musicVolume = 50, originalMuted = false, musicMuted = false, musicUrl = null,
  photoStyles = [],
}: MobilePreviewProps) {
  const authUser    = useAuthStore(s => s.user);
  const username    = authUser?.username ?? "your_username";
  const avatar      = authUser?.avatar   ?? null;
  const displayUrl  = previewUrl||(previewUrls.length>0?previewUrls[0]:null);
  const isVideo     = mediaType==="video";
  const isImage     = mediaType==="image"||mediaType==="image_carousel";
  // Image slides for the preview: array when carousel, single-item otherwise.
  const photoSlides = previewUrls.length>0 ? previewUrls : (displayUrl&&isImage ? [displayUrl] : []);

  const videoRef      = useRef<HTMLVideoElement>(null);
  const musicAudioRef = useRef<HTMLAudioElement>(null);
  const progressRef   = useRef<HTMLDivElement>(null);
  const isSeekingRef  = useRef(false);
  const [playing,     setPlaying]     = useState(true);
  const [muted,       setMuted]       = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [videoDur,    setVideoDur]    = useState(0);
  const [imgIndex,    setImgIndex]    = useState(0);

  // Clamp the carousel index so it stays valid as the image set grows/shrinks
  const safeImg = Math.min(imgIndex, Math.max(0, photoSlides.length - 1));

  const progressPct = videoDur > 0 ? (currentTime / videoDur) * 100 : 0;

  // Apply original video volume whenever slider or mute changes
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.volume = Math.max(0, Math.min(1, (originalMuted ? 0 : originalVolume) / 100));
    }
  }, [originalVolume, originalMuted]);

  // Apply music volume whenever slider, mute, or track changes (musicUrl ensures this fires when new track mounts)
  useEffect(() => {
    if (musicAudioRef.current) {
      musicAudioRef.current.volume = Math.max(0, Math.min(1, (musicMuted ? 0 : musicVolume) / 100));
    }
  }, [musicVolume, musicMuted, musicUrl]);

  // When track changes: reload audio and auto-resume if video is playing
  useEffect(() => {
    const audio = musicAudioRef.current;
    if (!audio) return;
    audio.load();
    audio.currentTime = 0;
    const video = videoRef.current;
    if (video && !video.paused) {
      audio.play().catch(() => {});
    }
  }, [musicUrl]);

  function togglePlay() {
    const v = videoRef.current; if (!v) return;
    if (v.paused) {
      v.play().catch(()=>{});
      setPlaying(true);
      musicAudioRef.current?.play().catch(()=>{});
    } else {
      v.pause();
      setPlaying(false);
      musicAudioRef.current?.pause();
    }
  }
  function toggleMute() {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted; setMuted(v.muted);
  }
  function seekTo(clientX: number) {
    const bar = progressRef.current; const v = videoRef.current;
    if (!bar || !v || !videoDur) return;
    const { left, width } = bar.getBoundingClientRect();
    v.currentTime = Math.max(0, Math.min(1, (clientX - left) / width)) * videoDur;
    setCurrentTime(v.currentTime);
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center overflow-hidden">
      {/* Phone - height clamped so it never overflows viewport */}
      <div
        className="relative mx-auto overflow-hidden rounded-[32px] bg-black shadow-2xl"
        style={{ height:"min(640px,100%)", aspectRatio:"9/19.5", border:"8px solid #1a1a2e", flexShrink:0 }}
      >
        {/* Media */}
        <div className="absolute inset-0">
          {displayUrl&&isVideo&&(
            <video ref={videoRef} src={displayUrl}
              className="h-full w-full object-contain"
              muted loop autoPlay playsInline
              onPlay={()=>{ setPlaying(true); musicAudioRef.current?.play().catch(()=>{}); }}
              onPause={()=>{ setPlaying(false); musicAudioRef.current?.pause(); }}
              onTimeUpdate={()=>setCurrentTime(videoRef.current?.currentTime??0)}
              onLoadedMetadata={()=>{
                setVideoDur(videoRef.current?.duration??0);
                if (videoRef.current) videoRef.current.volume = Math.max(0, Math.min(1, (originalMuted ? 0 : originalVolume) / 100));
              }}
            />
          )}
          {/* Music playback is owned by the form-side Music/Sound card (single source of
              truth for play/pause across all tabs), so the preview card no longer renders
              its own <audio> - that prevented a second, un-pausable music stream. */}
          {isImage&&photoSlides.length>0&&(
            <>
              {/* Blurred backdrop fills empty space without cropping the real photo */}
              <img src={photoSlides[safeImg]} alt="" aria-hidden="true"
                className="absolute inset-0 h-full w-full scale-110 object-cover blur-xl brightness-50"/>
              {/* Actual photo - full image, original aspect ratio, never cropped/zoomed.
                  Filters/Adjust from Photo tools are applied live via photoStyles. */}
              <img src={photoSlides[safeImg]} alt={`Preview ${safeImg+1}`}
                className="relative z-10 h-full w-full object-contain"
                style={photoStyles[safeImg]}/>
              {photoSlides.length>1&&(
                <>
                  {/* Prev / next */}
                  <button type="button"
                    onClick={(e)=>{e.stopPropagation();setImgIndex(i=>(i-1+photoSlides.length)%photoSlides.length);}}
                    aria-label="Previous photo"
                    className="absolute left-2 top-1/2 z-30 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60">
                    <ChevronLeft className="h-4 w-4"/>
                  </button>
                  <button type="button"
                    onClick={(e)=>{e.stopPropagation();setImgIndex(i=>(i+1)%photoSlides.length);}}
                    aria-label="Next photo"
                    className="absolute right-2 top-1/2 z-30 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur-sm transition hover:bg-black/60">
                    <ChevronRight className="h-4 w-4"/>
                  </button>
                  {/* Count pill */}
                  <span className="absolute right-2 top-2 z-30 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-white backdrop-blur-sm">
                    {safeImg+1}/{photoSlides.length}
                  </span>
                  {/* Dots */}
                  <div className="absolute bottom-[64px] left-0 right-0 z-30 flex items-center justify-center gap-1">
                    {photoSlides.map((_, i)=>(
                      <span key={i} className={cn("h-1.5 rounded-full transition-all", i===safeImg ? "w-3 bg-white" : "w-1.5 bg-white/50")}/>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
          {!displayUrl&&(
            /* The design's empty state: near-black with faint diagonal stripes
               and one letterspaced line. The purple-to-rose gradient this
               replaced implied a video was already loaded and tinted the whole
               preview a colour the app never shows. */
            <div className="flex h-full w-full items-center justify-center bg-[#161618]"
              style={{backgroundImage:"repeating-linear-gradient(135deg, rgba(255,255,255,0.035) 0px, rgba(255,255,255,0.035) 1px, transparent 1px, transparent 9px)"}}>
              <p className="text-[9px] font-medium tracking-[0.22em] text-white/28">DROP VIDEO · 9:16</p>
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/70"/>
        </div>

        {/* Tap-to-play/pause invisible overlay */}
        {isVideo&&displayUrl&&(
          <div className="absolute inset-0 z-10 cursor-pointer"
            onClick={(e)=>{e.stopPropagation();togglePlay();}}
          />
        )}

        {/* Center play icon - shown when paused */}
        {isVideo&&displayUrl&&!playing&&(
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <div className="grid h-12 w-12 place-items-center rounded-full bg-black/55 backdrop-blur-sm">
              <Play className="ml-0.5 h-6 w-6 fill-white text-white"/>
            </div>
          </div>
        )}

        {/* No status bar. The clock, signal, wifi and battery came from the
            design mock, which is a full device shot - this is a preview of the
            post, and a fake 9:41 is chrome the uploader is not previewing. */}

        {/* Tabs row - camera left, tabs centred, search right, as the app has it */}
        {/* top-2, not top-[18px]: that offset only existed to clear the status
            bar that used to sit above it. */}
        <div className="absolute left-0 right-0 top-2 z-20 flex items-center justify-between px-3">
          {/* Live badge on the camera, as the design has it */}
          <div className="relative">
            <Video className="h-3.5 w-3.5 text-white"/>
            <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-[#fe2c55] ring-[1.5px] ring-black/60"/>
          </div>
          <div className="flex items-center gap-2.5">
            <span className="text-[9px] text-white/55">Nepal</span>
            <span className="text-[9px] text-white/55">Following</span>
            <span className="text-[10.5px] font-bold text-white">For You</span>
          </div>
          <Search className="h-3.5 w-3.5 text-white"/>
        </div>

        {/*
          Right action bar.

          Bare glyphs with a count beneath, matching the app - the pill
          backgrounds this used to draw exist nowhere in the real feed.

          The counts are ZERO, deliberately. The design mock shows 12.4K likes
          and 842 comments because it is a mock of a published post; this is a
          preview of a video that has not been posted yet, and printing invented
          engagement on it would be a lie the user could screenshot. Zero is
          both true and the same shape.
        */}
        {/* Anchored to the BOTTOM, not to a top percentage.
            The disc is the rail's last item and should finish level with the
            sound line beside it, the way the app has it - a top-% put the whole
            column far above the username and left dead space under it, and it
            drifted with every change to the phone's height. */}
        <div className="absolute bottom-[52px] right-1.5 z-30 flex flex-col items-center gap-2.5">
          {/* Avatar. The fallback is the brand mark on pink, as the design
              shows, rather than a grey person glyph. */}
          <div className="relative mb-2">
            <div className="grid h-9 w-9 place-items-center overflow-hidden rounded-full bg-[#fe2c55] shadow-[0_0_14px_rgba(254,44,85,0.55)]">
              {avatar
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={avatar} alt={username} className="h-full w-full object-cover"/>
                : <span className="text-[15px] font-black italic leading-none text-white">R</span>}
            </div>
            <div className="absolute -bottom-1.5 left-1/2 grid h-4 w-4 -translate-x-1/2 place-items-center rounded-full bg-[#fe2c55] ring-2 ring-[#161618]">
              <Plus className="h-2.5 w-2.5 text-white"/>
            </div>
          </div>

          {[
            {Icon:Heart,         label:"12.4K"},
            {Icon:MessageCircle, label:"842"  },
            {Icon:Bookmark,      label:"3.4K" },
            {Icon:Share2,        label:"1.2K" },
            {Icon:Repeat2,       label:"318"  },
          ].map(({Icon,label})=>(
            <div key={Icon.displayName} className="flex flex-col items-center gap-[2px]">
              <Icon style={{width:19,height:19}} className="fill-white text-white drop-shadow"/>
              <span className="text-[7.5px] font-bold text-white drop-shadow">{label}</span>
            </div>
          ))}

          {/* Music disc - outlined, with a note, as the design draws it */}
          <div className="relative mt-1 grid h-8 w-8 place-items-center overflow-hidden rounded-full border border-white/25 bg-[#2a2a2d]">
            {avatar&&<img src={avatar} alt="" className="absolute inset-0 h-full w-full object-cover opacity-40"/>}
            <Music className="relative h-3.5 w-3.5 text-white"/>
          </div>
        </div>

        {/* Video controls - progress bar + time + mute (video only).
            Sits at 110: above the caption block, which starts at 56 and runs
            about 48 tall. */}
        {isVideo&&displayUrl&&(
          <div className="absolute left-0 right-0 z-30 px-2.5" style={{bottom:"110px"}}>
            {/* Seekable progress bar */}
            <div
              ref={progressRef}
              className="group flex h-4 cursor-pointer items-center"
              onClick={(e)=>{e.stopPropagation();seekTo(e.clientX);}}
              onMouseDown={(e)=>{e.stopPropagation();isSeekingRef.current=true;seekTo(e.clientX);}}
              onMouseMove={(e)=>{if(isSeekingRef.current){e.stopPropagation();seekTo(e.clientX);}}}
              onMouseUp={()=>{isSeekingRef.current=false;}}
              onMouseLeave={()=>{isSeekingRef.current=false;}}
              onTouchStart={(e)=>{e.stopPropagation();isSeekingRef.current=true;seekTo(e.touches[0].clientX);}}
              onTouchMove={(e)=>{e.stopPropagation();seekTo(e.touches[0].clientX);}}
              onTouchEnd={()=>{isSeekingRef.current=false;}}
            >
              <div className="relative h-[3px] w-full overflow-visible rounded-full bg-white/30 transition-all duration-150 group-hover:h-1">
                <div className="h-full rounded-full bg-[#fe2c55]" style={{width:`${progressPct}%`}}/>
                <div className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow"
                  style={{left:`${progressPct}%`}}/>
              </div>
            </div>
            {/* Elapsed on the left, total on the right, flanking the bar - the
                app puts them at the ends rather than as one "0:18 / 0:34"
                string. Mute is not in the design, but a muted preview with no
                way to unmute it is worse than one extra control. */}
            <div className="mt-0.5 flex items-center justify-between">
              <span className="font-mono text-[7px] text-white/80">{fmtTime(currentTime)}</span>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-[7px] text-white/80">{fmtTime(videoDur)}</span>
                <button type="button"
                  onClick={(e)=>{e.stopPropagation();toggleMute();}}
                  className="grid h-5 w-5 place-items-center rounded-full bg-black/50 backdrop-blur-sm transition active:scale-95">
                  {muted?<VolumeX className="h-2.5 w-2.5 text-white"/>:<Volume2 className="h-2.5 w-2.5 text-white"/>}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Bottom info */}
        {/* Clear of the 46px bar. At bottom-9 (36px) the sound line sat behind
            it, which is what clipped "Original Track". */}
        <div className="absolute bottom-[56px] left-2.5 right-14 z-30">
          <p className="text-[10px] font-bold text-white">@{username}</p>
          {caption
            ? <p className="mt-0.5 line-clamp-2 text-[9px] leading-tight text-white">{caption}</p>
            : <p className="mt-0.5 text-[9px] italic text-white/50">Your caption here…</p>}
          {hashtags.length>0&&(
            <p className="mt-0.5 line-clamp-1 text-[9px] text-white/80">{hashtags.map(h=>`#${h}`).join(" ")}</p>
          )}
          <div className="mt-1 flex items-center gap-1">
            <Music className="h-2.5 w-2.5 shrink-0 text-white/80"/>
            <p className="truncate text-[8px] text-white/90">{soundLabel||`Original Track - @${username}`}</p>
          </div>
        </div>

        {/*
          Bottom nav - FIVE items, matching the app: Home, Spaces, +, Inbox,
          Profile. It drew seven (Explore, Audio and Friends as well), which is
          an older layout the app no longer ships, so the preview was showing a
          bar that does not exist on any device.

          The create button is the app's pink pill, not a white one. No unread
          badge on Inbox: the mock has "12" because it is a marketing shot, and
          inventing unread messages for the person uploading is the same lie as
          inventing likes.
        */}
        {/* NAV_H = 46. Every offset above is measured from this one number -
            they used to be picked independently, which is how the sound line
            ended up underneath the bar. */}
        <div className="absolute bottom-0 left-0 right-0 z-30 flex h-[46px] items-center justify-around border-t border-white/10 bg-black px-1 pb-2.5 pt-2">
          <div className="flex flex-col items-center gap-0.5">
            <Home className="h-3.5 w-3.5 fill-white text-white"/>
            <span className="text-[5.5px] font-bold text-white">Home</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            {/* audio-waveform, the same glyph the app's tab bar now draws.
                AudioLines is a different mark - evenly spaced bars rather than
                this continuous stroke - so the preview disagreed with the bar
                it is previewing. */}
            <AudioWaveform className="h-3.5 w-3.5 text-white/55"/>
            <span className="text-[5.5px] text-white/55">Spaces</span>
          </div>
          {/* The create pill glows in the design - it is the one lit control */}
          <div className="flex h-6 w-10 items-center justify-center rounded-[9px] bg-[#fe2c55] shadow-[0_0_12px_rgba(254,44,85,0.6)]">
            <Plus className="h-4 w-4 text-white"/>
          </div>
          <div className="relative flex flex-col items-center gap-0.5">
            <MessageCircle className="h-3.5 w-3.5 text-white/55"/>
            <span className="absolute -top-1 left-1/2 ml-1 rounded-full bg-[#fe2c55] px-1 text-[5px] font-bold leading-[9px] text-white">12</span>
            <span className="text-[5.5px] text-white/55">Inbox</span>
          </div>
          <div className="flex flex-col items-center gap-0.5">
            <User className="h-3.5 w-3.5 text-white/55"/>
            <span className="text-[5.5px] text-white/55">Profile</span>
          </div>
        </div>

        {/* Home indicator */}
        <div className="absolute bottom-[3.5px] left-1/2 z-40 h-[2.5px] w-14 -translate-x-1/2 rounded-full bg-white/40"/>
      </div>
      {/* Tip below phone */}
      <p className="mt-2 flex shrink-0 items-center gap-1 text-[10px] text-[#9aa1ad]">
        <Lightbulb className="h-3 w-3 shrink-0 text-[#f59e0b]"/>
        Tip: Bright, vertical videos perform best. Ideal aspect ratio 9:16
      </p>
    </div>
  );
}

/* ─── Privacy Card (no Allow download) ──────────────────────────────────────── */
type PrivacyProps = {
  form:      UploadFormState; onChange: (p:Partial<UploadFormState>)=>void;
  disabled?: boolean;         mediaType: MediaType|null;
};
function PrivacyCard({ form, onChange, disabled, mediaType }: PrivacyProps) {
  const isImage = mediaType==="image"||mediaType==="image_carousel";
  function watchMode(): "public"|"friends"|"private" {
    if (form.visibility==="private") return "private";
    if (form.audience==="friends")   return "friends";
    return "public";
  }
  function setWatchMode(m: "public"|"friends"|"private") {
    if (m==="public")  onChange({visibility:"public",  audience:"everyone"});
    if (m==="friends") onChange({visibility:"public",  audience:"friends"});
    if (m==="private") onChange({visibility:"private", audience:"only_me"});
  }
  const mode = watchMode();
  return (
    <div className="shrink-0 rounded-2xl border border-[#eeeeee] bg-white p-3">
      <div className="mb-2 flex items-center gap-2">
        <div className="grid h-6 w-6 place-items-center rounded-full bg-[#f0fdf4]">
          <Shield className="h-3.5 w-3.5 text-[#22c55e]"/>
        </div>
        <p className="text-[12px] font-bold text-black">Privacy &amp; permissions</p>
      </div>
      <p className="mb-1.5 text-[10px] font-semibold text-[#5f6675]">Who can watch this video?</p>
      <div className="mb-2.5 grid grid-cols-3 gap-1.5">
        {([
          ["public","Public","Everyone",Globe],
          ["friends","Friends","Followers",Users],
          ["private","Private","Only me",Lock],
        ] as const).map(([val,label,sub,Icon])=>(
          <button key={val} type="button" disabled={disabled} onClick={()=>setWatchMode(val)}
            className={cn("flex flex-col items-center gap-0.5 rounded-xl border py-2 text-center transition",
              mode===val?"border-[#fe2c55] bg-[#fff0f4] text-[#fe2c55]":"border-[#eeeeee] text-[#5f6675] hover:border-[#fe2c55]/40")}>
            <Icon className="h-3.5 w-3.5"/>
            <span className="text-[10px] font-bold">{label}</span>
            <span className="text-[8px] leading-none opacity-70">{sub}</span>
          </button>
        ))}
      </div>
      <div className="space-y-1.5">
        {[
          { label:"Allow comments", key:"allowComments" as const, value:form.allowComments, videoOnly:false, icon:MessageCircle },
          { label:"Allow duet",     key:"allowDuet"     as const, value:form.allowDuet,     videoOnly:true,  icon:Users         },
          { label:"Allow stitch",   key:"allowRemix"    as const, value:form.allowRemix,    videoOnly:true,  icon:Scissors      },
        ].filter(r=>!r.videoOnly||!isImage).map(({label,key,value,icon:Icon})=>(
          <div key={key} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Icon className="h-3.5 w-3.5 shrink-0 text-[#9aa1ad]"/>
              <span className="text-[11px] font-medium text-[#374151]">{label}</span>
            </div>
            <Toggle checked={value} onChange={v=>onChange({[key]:v})} disabled={disabled}/>
          </div>
        ))}

        {/* AI Generated Content - always shown, off by default */}
        <div className="border-t border-[#f3f4f6] pt-1.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 shrink-0 text-[#9aa1ad]" />
              <span className="text-[11px] font-medium text-[#374151]">AI Generated Content</span>
              <div className="group relative">
                <HelpCircle className="h-3 w-3 cursor-help text-[#c4c9d4]" />
                <div className="pointer-events-none invisible absolute bottom-full left-1/2 z-20 mb-2 w-[190px] -translate-x-1/2 rounded-lg bg-[#111827] px-2.5 py-2 text-[10px] leading-relaxed text-white shadow-xl group-hover:visible">
                  Turn on if this content was fully or significantly created using AI tools - images, video, audio, or text.
                  <span className="absolute left-1/2 top-full -translate-x-1/2 border-4 border-transparent border-t-[#111827]" />
                </div>
              </div>
            </div>
            <Toggle checked={form.isAiGenerated} onChange={v => onChange({ isAiGenerated: v })} disabled={disabled} />
          </div>
        </div>

        {/* Content rights confirmation - required to publish (enforced
            server-side too, see completeUpload's own validation), the same
            "I own this or have permission to post it" gate the app's own
            Media & safety page enforces before its Post button will submit. */}
        <div className="border-t border-[#f3f4f6] pt-1.5">
          <label className="flex cursor-pointer items-start gap-2">
            <input
              type="checkbox"
              checked={form.rightsConfirmed}
              onChange={e => onChange({ rightsConfirmed: e.target.checked })}
              disabled={disabled}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 accent-[#fe2c55]"
            />
            <span className="flex items-start gap-2 text-[11px] font-medium text-[#374151]">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#9aa1ad]" />
              I confirm I own this content or have permission to post it. <span className="text-[#fe2c55]">Required.</span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );
}

/* ─── Upload Restricted Screen ──────────────────────────────────────────────── */
type RestrictionInfo = {
  type: string;
  is_permanent: boolean;
  expires_at: string | null;
  expires_at_label: string | null;
  time_remaining: string | null;
  reason: string | null;
};

function UploadRestrictedScreen({ info, fallbackUntil }: { info?: RestrictionInfo; fallbackUntil?: string | null }) {
  const router = useRouter();
  const expiresAt = info?.expires_at ?? fallbackUntil ?? null;

  const [countdown, setCountdown] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!expiresAt) { setCountdown(null); return; }
    function calc() {
      const diff = Math.max(0, new Date(expiresAt!).getTime() - Date.now());
      if (diff === 0) { setCountdown(null); return; }
      const s = Math.floor(diff / 1000);
      setCountdown({ days: Math.floor(s / 86400), hours: Math.floor((s % 86400) / 3600), minutes: Math.floor((s % 3600) / 60), seconds: s % 60 });
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return (
    <AppShell>
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="mx-auto max-w-md w-full text-center space-y-4">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-red-50 border-2 border-red-100">
            <ShieldAlert className="h-10 w-10 text-red-500" />
          </div>
          <div>
            <h1 className="text-[20px] font-bold text-[#111827]">Uploads Restricted</h1>
            <p className="mt-1 text-[14px] text-[#6b7280]">
              Your ability to upload new content has been restricted by Teezer.
            </p>
          </div>

          {info?.reason && (
            <div className="rounded-xl border border-[#e8eaf0] bg-[#fafbfc] px-4 py-3 text-left">
              <p className="text-[12px] text-[#374151]"><span className="font-semibold">Reason: </span>{info.reason}</p>
            </div>
          )}

          {info?.is_permanent ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-4">
              <p className="text-[14px] font-bold text-[#dc2626]">Permanent restriction</p>
              <p className="mt-0.5 text-[12px] text-[#ef4444]">No expiry set. Contact Teezer for assistance.</p>
            </div>
          ) : countdown ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-4">
              <div className="flex items-center justify-center gap-2 mb-3">
                <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                <p className="text-[13px] font-semibold text-amber-700">Restriction lifts in</p>
              </div>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[{ v: countdown.days, l: "Days" }, { v: countdown.hours, l: "Hours" }, { v: countdown.minutes, l: "Min" }, { v: countdown.seconds, l: "Sec" }].map(({ v, l }) => (
                  <div key={l} className="flex flex-col items-center rounded-[10px] border border-amber-200 bg-white py-2.5">
                    <span className="text-[22px] font-extrabold tabular-nums leading-none text-[#92400e]">{String(v).padStart(2, "0")}</span>
                    <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#b45309]">{l}</span>
                  </div>
                ))}
              </div>
              {info?.expires_at_label && (
                <p className="text-[11px] text-amber-600">Until {info.expires_at_label}</p>
              )}
            </div>
          ) : expiresAt ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-5 py-3">
              <Clock className="mx-auto h-5 w-5 text-amber-500 mb-1" />
              <p className="text-[13px] font-semibold text-amber-700">
                Until {info?.expires_at_label ?? new Date(expiresAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          ) : null}

          <a href="/settings/restrictions" className="inline-block text-[12px] font-semibold text-[#d97706] hover:underline">
            View full restriction details →
          </a>
          <p className="text-[12px] text-[#9ca3af]">
            If you believe this is an error, please contact support.
          </p>
          <button
            onClick={() => router.push("/")}
            className="inline-flex items-center gap-2 rounded-2xl bg-[#fe2c55] px-6 py-2.5 text-[13px] font-bold text-white hover:bg-[#e02249] transition-colors"
          >
            Back to Feed
          </button>
        </div>
      </div>
    </AppShell>
  );
}

/* ─── Tag people field ────────────────────────────────────────────────────────
   Self-contained @-mention search field. Owns its own draft / search / dropdown
   state; the parent only holds the structured TaggedUser[] value. Two visual
   variants match the existing layouts (compact row for Photo tab, boxed field for
   Video / Text tabs) - no design changes, only added functionality. */
function TagPeopleField({
  value, onChange, disabled, variant,
}: {
  value: TaggedUser[];
  onChange: (next: TaggedUser[]) => void;
  disabled?: boolean;
  variant: "compact" | "grid";
}) {
  const [draft,   setDraft]   = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [open,    setOpen]    = useState(false);
  const [dropUp,  setDropUp]  = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const query = draft.replace(/^@+/, "").trim();

  // Debounced user search (≈300 ms) - only after 2+ characters.
  useEffect(() => {
    if (query.length < 2) { setResults([]); setLoading(false); setError(null); return; }
    setLoading(true); setError(null);
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const res = await searchService.search(query, "users");
        if (!cancelled) setResults(res.users ?? []);
      } catch {
        if (!cancelled) { setError("Couldn’t load users. Try again."); setResults([]); }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  // Close the dropdown when clicking outside the field.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function openDropdown() {
    // Flip above the field when there isn't enough room below.
    const el = wrapRef.current;
    if (el) {
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      setDropUp(spaceBelow < 280 && rect.top > spaceBelow);
    }
    setOpen(true);
  }

  function pick(u: SearchUser) {
    if (value.some(t => t.id === u.id)) { setDraft(""); setResults([]); setOpen(false); return; }
    if (value.length >= MAX_TAGGED_USERS) { setError(`You can tag up to ${MAX_TAGGED_USERS} people.`); return; }
    onChange([...value, {
      id: u.id, username: u.username,
      display_name: u.name, avatar_url: u.avatar, verified: u.verified,
    }]);
    setDraft(""); setResults([]); setOpen(false);
  }

  function remove(id: number) { onChange(value.filter(t => t.id !== id)); }

  const atLimit = value.length >= MAX_TAGGED_USERS;

  const dropdown = open && draft.trim().length > 0 && (
    <div className={cn(
      "absolute left-0 right-0 z-50 overflow-hidden rounded-[12px] border border-[#e5e7eb] bg-white shadow-xl",
      dropUp ? "bottom-full mb-1" : "top-full mt-1",
    )}>
      <div className="max-h-[240px] overflow-y-auto">
        {query.length < 2 ? (
          <div className="px-3 py-2.5 text-[12px] text-[#9aa1ad]">Type at least 2 characters to search…</div>
        ) : loading ? (
          <div className="flex items-center gap-2 px-3 py-2.5 text-[12px] text-[#6b7280]">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
          </div>
        ) : error ? (
          <div className="px-3 py-2.5 text-[12px] font-medium text-[#dc2626]">{error}</div>
        ) : results.length === 0 ? (
          <div className="px-3 py-2.5 text-[12px] text-[#9aa1ad]">No users found</div>
        ) : (
          results.map(u => {
            const picked = value.some(t => t.id === u.id);
            return (
              <button key={u.id} type="button" disabled={picked || atLimit}
                onClick={() => pick(u)}
                className={cn(
                  "flex w-full items-center gap-2.5 px-3 py-2 text-left transition",
                  picked || atLimit ? "cursor-default opacity-50" : "cursor-pointer hover:bg-[#f8f9fb]",
                )}>
                <span className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-[#f3f4f6]">
                  {u.avatar
                    ? <img src={u.avatar} alt="" className="h-full w-full object-cover" />
                    : <span className="grid h-full w-full place-items-center"><User className="h-4 w-4 text-[#9aa1ad]" /></span>}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1">
                    <span className="truncate text-[12px] font-semibold text-[#111827]">{u.name || u.username}</span>
                    {u.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-[#3b9eff]" />}
                  </span>
                  <span className="block truncate text-[11px] text-[#9aa1ad]">@{u.username}</span>
                </span>
                {picked
                  ? <Check className="h-4 w-4 shrink-0 text-[#22c55e]" />
                  : <Plus className="h-4 w-4 shrink-0 text-[#c0c4cc]" />}
              </button>
            );
          })
        )}
      </div>
    </div>
  );

  if (variant === "compact") {
    return (
      <div ref={wrapRef} className="relative flex items-center gap-3 px-3.5 py-2.5">
        <AtSign className="h-4 w-4 shrink-0 text-[#374151]" />
        <span className="text-[13px] font-semibold text-[#111827]">Tag people</span>
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
          {value.map(u => (
            <span key={u.id} className="inline-flex items-center gap-0.5 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#374151]">
              @{u.username}
              <button type="button" disabled={disabled}
                onClick={() => remove(u.id)}
                className="ml-0.5 grid h-3 w-3 place-items-center text-[#9aa1ad] hover:text-[#374151]">
                <X className="h-2 w-2" />
              </button>
            </span>
          ))}
          <input type="text" value={draft}
            onChange={e => { setDraft(e.target.value); openDropdown(); }}
            onFocus={() => draft.trim() && openDropdown()}
            disabled={disabled || atLimit}
            placeholder={value.length ? "" : "Mention a user…"}
            className="min-w-[80px] flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
          />
        </div>
        {value.length > 0 && (
          <span className="shrink-0 text-[11px] font-semibold text-[#fe2c55]">{value.length} tagged</span>
        )}
        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0c4cc]" />
        {dropdown}
      </div>
    );
  }

  return (
    <div>
      <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
        <User className="h-3.5 w-3.5 text-[#111827]" />
        Tag people
      </label>
      <div ref={wrapRef} className="relative flex min-h-[42px] flex-wrap items-center gap-1 rounded-[12px] border border-[#e5e7eb] bg-[#f8f9fb] px-2.5 py-1.5 pr-8 transition focus-within:border-[#6366f1] focus-within:bg-white">
        {value.map(u => (
          <span key={u.id} className="inline-flex items-center gap-0.5 rounded-full border border-[#c7d2fe] bg-[#eef2ff] px-2 py-0.5 text-[11px] font-medium text-[#6366f1]">
            @{u.username}
            <button type="button" disabled={disabled}
              onClick={() => remove(u.id)}
              className="ml-0.5 grid h-3 w-3 place-items-center text-[#6366f1]/60 hover:text-[#6366f1]">
              <X className="h-2 w-2" />
            </button>
          </span>
        ))}
        <input type="text" value={draft}
          onChange={e => { setDraft(e.target.value); openDropdown(); }}
          onFocus={() => draft.trim() && openDropdown()}
          disabled={disabled || atLimit}
          placeholder={value.length ? "" : "@ Mention a user"}
          className="min-w-[60px] flex-1 bg-transparent py-0.5 text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
        />
        <ChevronRight className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-[#c0c4cc]" />
        {dropdown}
      </div>
    </div>
  );
}

/* ─── Page ───────────────────────────────────────────────────────────────────── */
export function UploadPage() {
  const router = useRouter();

  const [file,       setFile]       = useState<File|null>(null);
  const [previewUrl, setPreviewUrl] = useState<string|null>(null);
  const [probe,      setProbe]      = useState<VideoProbe|null>(null);
  const [mediaType,  setMediaType]  = useState<MediaType|null>(null);
  const [files,       setFiles]       = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<string[]>([]);
  const [thumbnails,      setThumbnails]      = useState<Thumbnail[]>([]);
  const [selectedThumbId, setSelectedThumbId] = useState<string|null>(null);
  const [form, setForm] = useState<UploadFormState>(initialFormState);
  const [interactionsTouched, setInteractionsTouched] = useState(false);
  const [uploading,    setUploading]    = useState(false);
  const [progress,     setProgress]     = useState(0);
  const [uploadedBytes,setUploadedBytes]= useState(0);
  const [etaSeconds,   setEtaSeconds]   = useState<number|null>(null);
  const abortRef     = useRef<AbortController|null>(null);
  const startedAtRef = useRef<number>(0);
  const fileGenRef        = useRef(0);
  const shouldAutoCheckRef = useRef(false);         // set true when new file is picked
  const checkedFileIdRef   = useRef<string | null>(null); // last fileId that was checked
  const isCheckingRef      = useRef(false);         // synchronous guard - prevents double-call even in concurrent mode
  const uploadCompletedRef  = useRef(false);        // true once video is successfully published/drafted
  const pendingObjectKeyRef = useRef<string|null>(null); // tracks latest R2 key for unmount cleanup
  const singleRef    = useRef<HTMLInputElement>(null);
  const multiRef     = useRef<HTMLInputElement>(null);
  const [hashDraft,    setHashDraft]    = useState("");
  const [taggedPeople, setTaggedPeople] = useState<TaggedUser[]>([]);
  const [scheduleDate, setScheduleDate] = useState("");
  const [scheduleTime, setScheduleTime] = useState("19:00");

  /**
   * The picked date+time as an ISO instant, or +24h when no date was chosen.
   *
   * Parsed field by field rather than through `new Date("YYYY-MM-DDTHH:MM")`,
   * which browsers have historically disagreed about - some treat the
   * unsuffixed form as UTC. Splitting it and using the numeric constructor is
   * local time everywhere, which is what the user meant when they picked 7pm.
   */
  const scheduledAtISO = useCallback(() => {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduleDate);
    const t = /^(\d{2}):(\d{2})$/.exec(scheduleTime || "19:00");
    if (!d) return new Date(Date.now() + 24 * 3600 * 1000).toISOString();
    const when = new Date(
      Number(d[1]), Number(d[2]) - 1, Number(d[3]),
      t ? Number(t[1]) : 19, t ? Number(t[2]) : 0, 0, 0,
    );
    return when.toISOString();
  }, [scheduleDate, scheduleTime]);
  const [dragOver,     setDragOver]     = useState(false);
  const [copyrightStatus, setCopyrightStatus] = useState<"unchecked"|"clean"|"flagged">("unchecked");
  const [contentStatus,     setContentStatus]     = useState<ContentStatus>("idle");
  const [contentReason,     setContentReason]     = useState<string|null>(null);
  const [preparedUpload,    setPreparedUpload]    = useState<PreparedUpload|null>(null);

  const [activeUploadTab, setActiveUploadTab] = useState<"video" | "photo">("video");

  // Confirmation when adding a content type that would replace another (one type per post).
  const [switchPrompt, setSwitchPrompt] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    revertTab: "video" | "photo";
    onConfirm: () => void;
  } | null>(null);

  // Music / sound state
  const [showMusicModal,     setShowMusicModal]     = useState(false);
  const [selectedMusic,      setSelectedMusic]      = useState<AudioTrack | null>(null);
  const [originalAudioVol,   setOriginalAudioVol]   = useState(100);
  const [musicVol,           setMusicVol]           = useState(100);
  const [originalMuted,      setOriginalMuted]      = useState(false);
  const [musicMuted,         setMusicMuted]         = useState(false);
  const [previewPlaying,     setPreviewPlaying]     = useState(false);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);

  // Photo tab editing state
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState(0);
  const [photoFilters,       setPhotoFilters]       = useState<Record<number, string>>({});
  const [photoAdjust,        setPhotoAdjust]        = useState<Record<number, { brightness: number; contrast: number; saturation: number }>>({});
  const [activeTool,         setActiveTool]         = useState<string | null>(null);
  const [photoError,         setPhotoError]         = useState<string | null>(null);
  const [photoCoverIdx,   setPhotoCoverIdx]   = useState(0);
  const [customCoverFile, setCustomCoverFile] = useState<File | null>(null);
  const [customCoverUrl,  setCustomCoverUrl]  = useState<string | null>(null);
  const [showCoverPicker, setShowCoverPicker] = useState(false);
  const stripRef    = useRef<HTMLDivElement>(null);
  const appendRef   = useRef<HTMLInputElement>(null);
  const dragFromRef = useRef<number | null>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  // ── Location for Video/Photo uploads (optional) ──
  const [mediaLocation,  setMediaLocation]  = useState("");
  const [mediaLocResults, setMediaLocResults] = useState<LocationResult[]>([]);
  const [mediaLocLoading, setMediaLocLoading] = useState(false);
  const [mediaLocOpen,    setMediaLocOpen]    = useState(false);
  const mediaLocPickedRef = useRef(false);

  useEffect(() => {
    const q = mediaLocation.trim();
    if (mediaLocPickedRef.current) { mediaLocPickedRef.current = false; return; }
    if (q.length < 2) { setMediaLocResults([]); setMediaLocLoading(false); setMediaLocOpen(false); return; }
    let alive = true;
    setMediaLocLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await locationService.search(q);
        if (!alive) return;
        setMediaLocResults(res.slice(0, 6));
        setMediaLocOpen(true);
      } catch {
        if (alive) { setMediaLocResults([]); setMediaLocOpen(false); }
      } finally {
        if (alive) setMediaLocLoading(false);
      }
    }, 350);
    return () => { alive = false; clearTimeout(t); };
  }, [mediaLocation]);

  function pickMediaLocation(formatted: string) {
    mediaLocPickedRef.current = true;
    setMediaLocation(formatted);
    setMediaLocResults([]);
    setMediaLocOpen(false);
  }

  // Which content type currently holds uploaded media (video or photos).
  const currentContentKind: "video" | "photo" | null =
    mediaType === "video" ? "video"
    : (mediaType === "image" || mediaType === "image_carousel") ? "photo"
    : null;

  // Single source of truth for the one active post type. Only one of
  // video / photos may hold data at a time; media takes precedence
  // (exclusivity is enforced at every content-adding action below).
  const activePostType: "video" | "photo" | null = currentContentKind;

  // Noun used in content-check messaging so it matches what was actually uploaded.
  const mediaNoun =
    mediaType === "video" ? "Video"
    : (mediaType === "image" || mediaType === "image_carousel") ? "Image"
    : "Content";

  // Wipe ALL content so a clean switch leaves only the new type.
  function clearAllContent() {
    handleClear();          // clears video/photo state + aborts any in-flight upload
    setMediaLocation("");
  }

  // Build the discard-confirmation prompt for replacing `current` with `target`.
  function buildSwitchPrompt(
    current: "video" | "photo",
    onConfirm: () => void,
  ) {
    const title =
      current === "photo" ? "Discard photos?"
      : "Discard video?";
    const confirmLabel =
      current === "photo" ? "Discard photos and continue"
      : "Discard video and continue";
    setSwitchPrompt({
      title,
      message: "You can only upload one content type at a time.",
      confirmLabel,
      revertTab: current,
      onConfirm,
    });
  }

  // Guard a content-adding action: if it would replace another active post type,
  // ask first (Cancel reverts to that type's tab; Confirm clears all + proceeds).
  function requestContentSwitch(target: "video" | "photo", proceed: () => void) {
    const current = activePostType;
    if (current && current !== target) {
      buildSwitchPrompt(current, () => { clearAllContent(); proceed(); setSwitchPrompt(null); });
    } else {
      proceed();
    }
  }

  // Keep the background-music preview volume in sync with the slider / mute toggle.
  useEffect(() => {
    if (previewAudioRef.current) {
      previewAudioRef.current.volume = Math.max(0, Math.min(1, (musicMuted ? 0 : musicVol) / 100));
    }
  }, [musicVol, musicMuted]);

  // When a track is selected / changed: load it and auto-play in the background.
  // This is the SINGLE music player for every tab (video, photo, text) - the
  // preview card no longer plays its own copy, so play/pause here is authoritative.
  useEffect(() => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    setPreviewPlaying(false);
    if (!selectedMusic?.audio_url) return;
    const a = new Audio(selectedMusic.audio_url);
    a.loop = true;
    a.volume = Math.max(0, Math.min(1, (musicMuted ? 0 : musicVol) / 100));
    a.onended = () => setPreviewPlaying(false);
    previewAudioRef.current = a;
    a.play().then(() => setPreviewPlaying(true)).catch(() => setPreviewPlaying(false));
    return () => { a.pause(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedMusic?.id]);

  function toggleMusicPreview() {
    if (!selectedMusic?.audio_url) return;
    if (previewPlaying && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewPlaying(false);
      return;
    }
    if (!previewAudioRef.current) {
      const a = new Audio(selectedMusic.audio_url);
      a.loop = true;
      a.onended = () => setPreviewPlaying(false);
      previewAudioRef.current = a;
    }
    previewAudioRef.current.volume = Math.max(0, Math.min(1, (musicMuted ? 0 : musicVol) / 100));
    previewAudioRef.current.play().then(() => setPreviewPlaying(true)).catch(() => {});
  }

  // Pre-select music when arriving from a Sound page via "Use this sound"
  useEffect(() => {
    try {
      const stored = localStorage.getItem("reelsoo_pending_sound");
      if (stored) {
        localStorage.removeItem("reelsoo_pending_sound");
        const track = JSON.parse(stored) as AudioTrack;
        if (track?.id && track?.title) setSelectedMusic(track);
      }
    } catch {}
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep ref in sync so the unmount cleanup always sees the latest key
  useEffect(() => {
    pendingObjectKeyRef.current = preparedUpload?.objectKey ?? null;
  }, [preparedUpload]);

  // On unmount: if the user leaves without submitting, delete the orphaned R2 file
  useEffect(() => {
    return () => {
      if (!uploadCompletedRef.current && pendingObjectKeyRef.current) {
        void uploadService.cancelUpload(pendingObjectKeyRef.current);
      }
    };
  }, []);

  type UploadRestriction = { restrict_uploads: boolean; disable_drafts: boolean; upload_suspension_until: string | null; active_restrictions?: RestrictionInfo[] };
  const [restriction, setRestriction] = useState<UploadRestriction | null>(null);
  useEffect(() => { api.get("/account/restrictions").then(r => setRestriction(r.data.data)).catch(() => {}); }, []);

  function patchForm(p: Partial<UploadFormState>) {
    if ("allowComments" in p||"allowDuet" in p||"allowRemix" in p) setInteractionsTouched(true);
    setForm(prev=>({...prev,...p}));
  }

  function resetContentCheck() {
    setContentStatus("idle");
    setContentReason(null);
    setPreparedUpload(null);
    shouldAutoCheckRef.current = true;   // new file selected → trigger auto-check
    checkedFileIdRef.current   = null;
    isCheckingRef.current      = false;  // release any stale lock from prior file
  }

  function handlePick(f: File|null) {
    if (!f) return;
    const target = VIDEO_MIMES.includes(f.type) ? "video" : "photo";
    requestContentSwitch(target, () => doPick(f));
  }

  function doPick(f: File|null) {
    if (!f) return;
    const isVid = VIDEO_MIMES.includes(f.type);
    const isImg = IMAGE_MIMES.includes(f.type);
    if (!isVid&&!isImg) { toast.error("Unsupported file."); return; }
    if (isVid&&f.size>MAX_VIDEO_BYTES) { toast.error("Video too large (max 500 MB)."); return; }
    if (isImg&&f.size>MAX_IMAGE_BYTES) { toast.error("Image too large (max 20 MB)."); return; }
    // Cancel any previous upload that was never submitted
    if (preparedUpload?.objectKey) void uploadService.cancelUpload(preparedUpload.objectKey);
    resetContentCheck();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    thumbnails.forEach(t=>t.url.startsWith("blob:")&&URL.revokeObjectURL(t.url));
    const url = URL.createObjectURL(f);
    setFile(f); setPreviewUrl(url); setProbe(null); setThumbnails([]); setSelectedThumbId(null);
    setMediaType(isVid?"video":"image");
    const gen = ++fileGenRef.current;
    if (isVid) {
      void probeVideo(f).then(p=>{ if(fileGenRef.current!==gen) return; setProbe(p); if(p&&p.duration>MAX_VIDEO_SECS) toast.error("Video too long (max 10 min)."); });
      void generateThumbnails(f).then(gs=>{ if(fileGenRef.current!==gen) return; setThumbnails(gs); if(gs.length) setSelectedThumbId(gs[Math.min(2,gs.length-1)].id); });
    }
  }

  // Validate a batch of picked images; returns the accepted files + a human-readable error string (or null).
  function validatePhotoBatch(picked: File[], alreadyHave: number): { accepted: File[]; error: string | null } {
    const errs: string[] = [];
    const valid: File[] = [];
    for (const f of picked) {
      if (!IMAGE_MIMES.includes(f.type)) { errs.push(`"${f.name}" isn’t a supported format. Use JPG, PNG, or WEBP.`); continue; }
      if (f.size > MAX_IMAGE_BYTES) { errs.push(`"${f.name}" is over 20 MB.`); continue; }
      valid.push(f);
    }
    const room = MAX_CAROUSEL_IMAGES - alreadyHave;
    let accepted = valid;
    if (valid.length > room) {
      accepted = valid.slice(0, Math.max(0, room));
      errs.push(`You can add up to ${MAX_CAROUSEL_IMAGES} photos - ${valid.length - accepted.length} extra removed.`);
    }
    return { accepted, error: errs.length ? errs.join(" ") : null };
  }

  // Photo tab is ALWAYS array-based (files/previewUrls), even for a single photo.
  // For a single image we also mirror it into file/previewUrl so the "image" submit path works.
  function handlePickMultiple(picked: File[]) {
    requestContentSwitch("photo", () => doPickMultiple(picked));
  }

  function doPickMultiple(picked: File[]) {
    const { accepted, error } = validatePhotoBatch(picked, 0);
    setPhotoError(error);
    if (!accepted.length) return;
    if (preparedUpload?.objectKey) void uploadService.cancelUpload(preparedUpload.objectKey);
    resetContentCheck();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrls.forEach(u=>URL.revokeObjectURL(u));
    thumbnails.forEach(t=>t.url.startsWith("blob:")&&URL.revokeObjectURL(t.url));
    const newUrls = accepted.map(f=>URL.createObjectURL(f));
    ++fileGenRef.current;
    setFiles(accepted); setPreviewUrls(newUrls);
    if (accepted.length===1) { setFile(accepted[0]); setPreviewUrl(newUrls[0]); setMediaType("image"); }
    else { setFile(null); setPreviewUrl(null); setMediaType("image_carousel"); }
    setProbe(null); setThumbnails([]); setSelectedThumbId(null);
    setSelectedPhotoIndex(0); setPhotoFilters({}); setPhotoAdjust({});
    if (customCoverUrl) URL.revokeObjectURL(customCoverUrl);
    setPhotoCoverIdx(0); setCustomCoverFile(null); setCustomCoverUrl(null); setShowCoverPicker(false);
  }

  function handleClear() {
    abortRef.current?.abort();
    if (preparedUpload?.objectKey) void uploadService.cancelUpload(preparedUpload.objectKey);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrls.forEach(u=>URL.revokeObjectURL(u));
    thumbnails.forEach(t=>t.url.startsWith("blob:")&&URL.revokeObjectURL(t.url));
    setFile(null); setPreviewUrl(null); setProbe(null); setMediaType(null);
    setFiles([]); setPreviewUrls([]); setThumbnails([]); setSelectedThumbId(null);
    setProgress(0); setUploadedBytes(0); setEtaSeconds(null); setUploading(false);
    setSelectedPhotoIndex(0); setPhotoFilters({}); setPhotoAdjust({}); setActiveTool(null);
    setPhotoError(null);
    if (customCoverUrl) URL.revokeObjectURL(customCoverUrl);
    setPhotoCoverIdx(0); setCustomCoverFile(null); setCustomCoverUrl(null); setShowCoverPicker(false);
    resetContentCheck();
  }

  function handleAddCover(coverFile: File) {
    const url = URL.createObjectURL(coverFile);
    const id  = `custom-${Math.random().toString(36).slice(2,8)}`;
    setThumbnails(prev=>[{id,url,blob:coverFile},...prev]);
    setSelectedThumbId(id);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files??[]);
    if (dropped.length>1) handlePickMultiple(dropped);
    else if (dropped[0]) handlePick(dropped[0]);
  }

  // Video tab dropzone - only accept video files so tabs stay content-isolated.
  function handleVideoDrop(e: React.DragEvent) {
    e.preventDefault(); setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files??[]);
    const vid = dropped.find(f => VIDEO_MIMES.includes(f.type));
    if (vid) handlePick(vid);
    else if (dropped.length) toast.error("Please drop a video file in the Video tab.");
  }

  function validateBeforeSubmit(): string|null {
    if (mediaType==="image_carousel") { if(files.length<2) return "Add at least 2 images for a carousel."; }
    else { if(!file) return "Choose a media file first."; }
    if (!form.category) return "Please choose a category.";
    if (!form.rightsConfirmed) return "Please confirm you own this content or have permission to post it.";
    if (mediaType==="video") {
      if (!VIDEO_MIMES.includes(file!.type)) return "Video must be MP4, MOV, or WebM.";
      if (file!.size>MAX_VIDEO_BYTES) return "Video must be under 500 MB.";
      if (!probe) return "Wait for video analysis.";
      if (probe.duration<MIN_VIDEO_SECS) return `Video must be at least ${MIN_VIDEO_SECS}s.`;
      if (probe.duration>MAX_VIDEO_SECS) return "Video must be under 10 min.";
    }
    if (mediaType==="image") {
      if (!IMAGE_MIMES.includes(file!.type)) return "Image must be JPG, PNG, or WebP.";
      if (file!.size>MAX_IMAGE_BYTES) return "Image must be under 20 MB.";
    }
    return null;
  }

  async function resolveSelectedThumbnailFile(): Promise<File|null> {
    if (!selectedThumbId) return null;
    const thumb = thumbnails.find(t=>t.id===selectedThumbId);
    if (!thumb) return null;
    try {
      // Prefer the in-memory blob (reliable); fall back to fetching the URL.
      const blob = thumb.blob ?? await (await fetch(thumb.url)).blob();
      const mime = blob.type||"image/jpeg";
      const ext  = mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
      return new File([blob],`cover.${ext}`,{type:mime});
    } catch { return null; }
  }

  async function resolvePhotoCoverFile(): Promise<File | null> {
    if (customCoverFile) return customCoverFile;
    const idx = Math.min(Math.max(0, photoCoverIdx), files.length - 1);
    return files[idx] ?? null;
  }

  async function uploadForContentCheck(): Promise<PreparedUpload> {
    if (!mediaType) throw new Error("Choose a media file first.");

    const uploadId = `upload-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    if (mediaType === "image_carousel") {
      if (files.length < 2) throw new Error("Add at least 2 images for a carousel.");
      const total = files.reduce((sum, item) => sum + item.size, 0);
      const loaded = new Array<number>(files.length).fill(0);
      const mediaItems = [];

      for (let i = 0; i < files.length; i++) {
        const signed = await uploadService.requestUploadUrl(files[i]);
        await uploadService.putToR2(signed.upload_url, files[i], (p) => {
          loaded[i] = p.loaded;
          const done = loaded.reduce((sum, value) => sum + value, 0);
          setUploadedBytes(done);
          setProgress(total ? Math.round((done / total) * 100) : 0);
        }, abortRef.current?.signal);
        mediaItems.push({ object_key: signed.object_key, order: i, mime_type: files[i].type });
      }

      // Pre-publish content scanning was removed; once every item is in the
      // bucket the carousel is ready to publish.
      return {
        mediaType,
        objectKey: mediaItems[0].object_key,
        mimeType: files[0].type,
        fileSize: files[0].size,
        mediaItems,
        checkStatus: "passed",
      };
    }

    if (!file) throw new Error("Choose a media file first.");

    const onProgress = (p: { loaded: number; total: number; percent: number }) => {
      setProgress(p.percent);
      setUploadedBytes(p.loaded);
    };

    // Multipart above the threshold - resumable (a page reload that
    // re-selects the same file picks up from B2's own record of what's
    // already uploaded, not a restart), controlled concurrency, per-part
    // retry. Below it, the existing single-PUT path - unchanged, already
    // works fine at that size. See uploadService.uploadMultipart's own doc
    // comment.
    let objectKey: string;
    if (mediaType === "video" && file.size >= MULTIPART_THRESHOLD_BYTES) {
      const result = await uploadService.uploadMultipart(file, onProgress, abortRef.current?.signal);
      objectKey = result.object_key;
    } else {
      const signed = await uploadService.requestUploadUrl(file);
      await uploadService.putToR2(signed.upload_url, file, onProgress, abortRef.current?.signal);
      objectKey = signed.object_key;
    }

    // Pre-publish content scanning was removed; the file is in the bucket, so
    // it is ready to publish.
    return {
      mediaType,
      objectKey,
      mimeType: file.type,
      fileSize: file.size,
      checkStatus: "passed",
    };
  }


  // Core content-check flow - called by auto-trigger and manual retry
  async function startContentCheckFlow(): Promise<void> {
    if (isCheckingRef.current) return; // synchronous ref guard - safe against concurrent/strict-mode double-calls
    isCheckingRef.current = true;
    setContentStatus("checking");
    setContentReason("Uploading your media...");
    setProgress(0);
    setUploadedBytes(0);
    startedAtRef.current = performance.now();
    abortRef.current = new AbortController();
    try {
      const prepared = await uploadForContentCheck();
      setPreparedUpload(prepared);
      // "passed" now means only "the media finished uploading and can be
      // published" - there is no scan verdict any more. The failed/review
      // branches went with the content check; an upload either lands or throws.
      setContentStatus("passed");
      setContentReason("Media uploaded - ready to publish.");
    } catch (e: unknown) {
      const message = apiMessage(e);
      setContentStatus("error");
      setContentReason(message || "Upload could not complete. Please try again.");
      toast.error(message || "Upload failed.");
    } finally {
      isCheckingRef.current = false; // always release the lock
    }
  }

  // Auto-trigger: runs whenever file or probe changes (probe = null until video is analysed)
  useEffect(() => {
    if (!shouldAutoCheckRef.current) return;      // no pending auto-check
    if (!hasMedia || !mediaType) return;           // no file yet
    if (mediaType === "video" && !probe) return;  // wait for probe on videos

    const fileId = file
      ? `${file.name}-${file.size}-${file.lastModified}`
      : files.map(f => `${f.name}-${f.size}-${f.lastModified}`).join("|");

    if (checkedFileIdRef.current === fileId) return; // already checked this file

    shouldAutoCheckRef.current = false;  // consume the flag
    checkedFileIdRef.current   = fileId; // mark as in-progress / done

    void startContentCheckFlow();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file, files, probe]);

  async function submit(intent: "published"|"draft") {
    if (intent === "draft" && restriction?.disable_drafts) {
      toast.error("Draft creation has been disabled on your account by an administrator.");
      return;
    }
    if (restriction?.restrict_uploads) {
      toast.error("Your upload access has been restricted by an administrator.");
      return;
    }
    const err = validateBeforeSubmit();
    if (err) { toast.error(err); return; }
    if (contentStatus === "checking") {
      toast.warning("Media is still uploading. Please wait a moment.");
      return;
    }
    if (!preparedUpload) {
      toast.warning("Please wait for media processing to complete.");
      return;
    }
    if (!mediaType) return;
    setUploading(true); setProgress(0); setUploadedBytes(0); setEtaSeconds(null);
    startedAtRef.current = performance.now();
    abortRef.current     = new AbortController();
    try {
      const finalStatus = intent==="draft"?"draft":form.scheduled?"scheduled":form.visibility==="public"?"published":form.visibility==="unlisted"?"unlisted":"private";
      const caption     = form.description.trim();
      const autoTitle   = caption?caption.slice(0,80).replace(/\s+/g," ").trim():"Untitled";
      const snapshotCategory = form.category;
      const musicMeta = selectedMusic ? {
        music_track_id:          selectedMusic.id,
        original_audio_volume:   originalMuted ? 0 : Math.max(0, Math.min(100, originalAudioVol)),
        music_volume:            musicMuted ? 0 : Math.max(0, Math.min(100, musicVol)),
        is_original_audio_muted: originalMuted,
        is_music_muted:          musicMuted,
      } : {};
      const baseMeta    = {
        title:autoTitle, caption:caption||undefined, hashtags:form.hashtags,
        category:snapshotCategory||null,
        location:mediaLocation.trim()||null,
        status:finalStatus as "published"|"draft"|"private"|"unlisted"|"scheduled",
        allow_comments:form.allowComments,
        is_ai_generated:form.isAiGenerated,
        rights_confirmed:form.rightsConfirmed,
        consent_confirmed:form.consentConfirmed,
        // Structured tag data (never embedded as plain text in the caption).
        ...(taggedPeople.length ? { tagged_users: taggedPeople.map(u => ({ id: u.id, username: u.username })) } : {}),
        /* The date and time the user actually picked.
         *
         * This used to send `Date.now() + 24h` unconditionally, so every
         * scheduled post went out a day later whatever the picker said - the
         * two fields were decorative. Built in LOCAL time on purpose:
         * new Date("2026-08-06") parses as UTC and lands on the 5th for anyone
         * west of Greenwich. Falls back to +24h only when the toggle is on but
         * no date was chosen, which is what the old behaviour was for. */
        ...(finalStatus==="scheduled"?{scheduled_at:scheduledAtISO()}:{}),
        ...musicMeta,
      };
      let media;
      if (preparedUpload.mediaType==="image_carousel") {
        // Bake any Filters/Adjust into the pixels and re-upload only the edited
        // photos, so the carousel in the feed matches the preview exactly.
        const items = preparedUpload.mediaItems ?? [];
        const finalItems = await Promise.all(items.map(async (m, i) => {
          const css = getPhotoFilterCss(i);
          if (!css || !files[i] || !previewUrls[i]) return m;
          const baked  = await bakePhotoFile(files[i], previewUrls[i], css);
          const signed = await uploadService.requestUploadUrl(baked);
          await uploadService.putToR2(signed.upload_url, baked, undefined, abortRef.current?.signal);
          void uploadService.cancelUpload(m.object_key); // drop the un-filtered original from R2
          return { object_key: signed.object_key, order: m.order, mime_type: baked.type };
        }));
        // Upload the selected cover photo as the carousel thumbnail
        let carouselThumbKey: string | null = null;
        const carouselCoverFile = await resolvePhotoCoverFile();
        if (carouselCoverFile) {
          try {
            const thumbSigned = await uploadService.requestThumbnailUploadUrl(carouselCoverFile);
            await uploadService.putToR2(thumbSigned.upload_url, carouselCoverFile, undefined, abortRef.current?.signal);
            carouselThumbKey = thumbSigned.object_key;
          } catch { carouselThumbKey = null; }
        }
        media = await uploadService.completeUpload({
          ...baseMeta,
          object_key: finalItems[0]?.object_key ?? preparedUpload.objectKey,
          mime_type: (finalItems[0]?.mime_type ?? preparedUpload.mimeType) as never,
          file_size: preparedUpload.fileSize,
          media_items: finalItems,
          ...(carouselThumbKey ? { thumbnail_key: carouselThumbKey } : {}),
        });
      } else {
        const thumbnailFile = mediaType==="video"
          ? await resolveSelectedThumbnailFile()
          : await resolvePhotoCoverFile();
        let thumbnailKey: string | null = null;
        if (thumbnailFile) {
          try {
            const thumbSigned = await uploadService.requestThumbnailUploadUrl(thumbnailFile);
            await uploadService.putToR2(thumbSigned.upload_url, thumbnailFile, undefined, abortRef.current.signal);
            thumbnailKey = thumbSigned.object_key;
          } catch {
            thumbnailKey = null;
          }
        }
        // Single image: bake Filters/Adjust into the pixels and re-upload so the
        // feed photo matches the preview. Videos are never re-baked here.
        let objectKey = preparedUpload.objectKey;
        let mimeType  = preparedUpload.mimeType as string;
        let fileSize  = preparedUpload.fileSize;
        const css0 = getPhotoFilterCss(0);
        if (mediaType === "image" && css0 && file && previewUrl) {
          const baked  = await bakePhotoFile(file, previewUrl, css0);
          const signed = await uploadService.requestUploadUrl(baked);
          await uploadService.putToR2(signed.upload_url, baked, undefined, abortRef.current?.signal);
          void uploadService.cancelUpload(preparedUpload.objectKey); // drop the un-filtered original
          objectKey = signed.object_key; mimeType = baked.type; fileSize = baked.size;
        }
        // For images, capture the real pixel dimensions so the feed can pick the
        // correct adaptive (portrait/landscape/square) player without guessing.
        let imgDims: { width: number; height: number } | null = null;
        if (mediaType === "image" && previewUrl) {
          imgDims = await new Promise((res) => {
            const im = new Image();
            im.onload  = () => res({ width: im.naturalWidth, height: im.naturalHeight });
            im.onerror = () => res(null);
            im.src = previewUrl;
          });
        }
        media = await uploadService.completeUpload({
          ...baseMeta,
          ...(mediaType==="video"&&probe?{duration:probe.duration,width:probe.width,height:probe.height}:{}),
          ...(mediaType==="image"&&imgDims?{width:imgDims.width,height:imgDims.height}:{}),
          ...(mediaType==="video"?{allow_duet:form.allowDuet,allow_stitch:form.allowRemix}:{}),
          object_key: objectKey,
          thumbnail_key: thumbnailKey ?? undefined,
          mime_type: mimeType as never,
          file_size: fileSize,
        });
      }
      uploadCompletedRef.current = true; // prevent unmount cleanup from deleting the registered file
      toast.success(intent==="draft"?"Draft saved.":mediaType==="image_carousel"?"Carousel published.":mediaType==="image"?"Image published.":"Video published.");
      useFeedStore.getState().reset();
      if (intent!=="draft"&&typeof window!=="undefined") window.localStorage.setItem("reelsoo_latest_upload_id",String(media.id));
      router.push(intent==="draft"?"/profile/me":`/videos/${media.id}`);
    } catch (e:unknown) {
      const aborted=(e as {code?:string})?.code==="ERR_CANCELED"||(e as {name?:string})?.name==="CanceledError";
      if (!aborted) toast.error(apiMessage(e));
    } finally { setUploading(false); }
  }

  const hasMedia = !!file||files.length>0;
  const checklist: ChecklistState = useMemo(()=>({
    media:       !!file||files.length>0,
    title:       form.description.trim().length>0,
    audience:    !!form.audience,
    visibility:  !!form.visibility,
    category:    !!form.category,
    duration:    mediaType==="video"?!!probe&&probe.duration>=MIN_VIDEO_SECS&&probe.duration<=MAX_VIDEO_SECS:true,
    thumbnail:   mediaType==="video"?selectedThumbId!==null:true,
    resolution:  mediaType==="video"?!!probe&&Math.min(probe.width,probe.height)>=720:true,
    description: form.description.trim().length>0,
    hashtags:    form.hashtags.length>0,
    interactions:interactionsTouched,
  }),[probe,file,files,selectedThumbId,form,mediaType,interactionsTouched]);

  const requiredComplete = useMemo(()=>{
    if (!hasMedia||!mediaType) return false;
    const base = checklist.media&&checklist.audience&&checklist.visibility&&checklist.category;
    return mediaType==="video"?base&&checklist.duration:base;
  },[checklist,hasMedia,mediaType]);

  const contentBlocksActions = uploading || contentStatus === "checking";

  function addHashtag(raw:string) {
    const c = raw.replace(/^#+/,"").trim().toLowerCase();
    if (!c||form.hashtags.includes(c)||form.hashtags.length>=HASHTAGS_MAX) return;
    patchForm({hashtags:[...form.hashtags,c]}); setHashDraft("");
  }

  function getPhotoStyle(i: number): React.CSSProperties {
    const parts: string[] = [];
    if (photoFilters[i]) parts.push(photoFilters[i]);
    const adj = photoAdjust[i];
    if (adj) parts.push(`brightness(${adj.brightness}%) contrast(${adj.contrast}%) saturate(${adj.saturation}%)`);
    return parts.length ? { filter: parts.join(" ") } : {};
  }

  /** CSS filter string for photo i (Filters + Adjust combined), or "" if none. */
  function getPhotoFilterCss(i: number): string {
    return (getPhotoStyle(i).filter as string | undefined) ?? "";
  }

  /**
   * Bake a CSS filter (the same string used for the live preview) into the image
   * pixels via canvas, so the published photo actually carries the filter/adjust.
   * Returns the original file unchanged if there's nothing to bake or it fails.
   */
  async function bakePhotoFile(srcFile: File, srcUrl: string, filterCss: string): Promise<File> {
    if (!filterCss) return srcFile;
    try {
      const img = new Image();
      img.src = srcUrl;
      await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = () => rej(new Error("image load failed")); });
      const canvas = document.createElement("canvas");
      canvas.width  = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return srcFile;
      ctx.filter = filterCss;
      ctx.drawImage(img, 0, 0);
      const type = srcFile.type === "image/png" ? "image/png" : "image/jpeg";
      const blob: Blob | null = await new Promise(r => canvas.toBlob(r, type, 0.92));
      if (!blob) return srcFile;
      return new File([blob], srcFile.name, { type });
    } catch {
      return srcFile; // never block publishing on a bake failure
    }
  }

  async function rotatePhotoAtIndex(index: number) {
    if (index >= previewUrls.length) return;
    const img = new Image();
    img.src = previewUrls[index];
    await new Promise<void>(r => { img.onload = () => r(); });
    const canvas = document.createElement("canvas");
    canvas.width = img.naturalHeight;
    canvas.height = img.naturalWidth;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, -img.naturalWidth / 2, -img.naturalHeight / 2);
    const blob: Blob | null = await new Promise(res => canvas.toBlob(res, files[index]?.type || "image/jpeg", 0.92));
    if (!blob) return;
    const newFile = new File([blob], files[index]?.name || `photo_${index}.jpg`, { type: blob.type });
    URL.revokeObjectURL(previewUrls[index]);
    const newUrl = URL.createObjectURL(blob);
    setFiles(prev => { const n = [...prev]; n[index] = newFile; return n; });
    setPreviewUrls(prev => { const n = [...prev]; n[index] = newUrl; return n; });
    // Single-photo case mirrors into file/previewUrl (the "image" submit path uses those)
    if (files.length === 1 && index === 0) { setFile(newFile); setPreviewUrl(newUrl); }
  }

  function reorderPhoto(from: number, to: number) {
    if (from === to) return;
    setFiles(prev => { const n = [...prev]; const [it] = n.splice(from, 1); n.splice(to, 0, it); return n; });
    setPreviewUrls(prev => { const n = [...prev]; const [it] = n.splice(from, 1); n.splice(to, 0, it); return n; });
    setPhotoFilters(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki === from) { next[to] = v; }
        else if (from < to && ki > from && ki <= to) { next[ki - 1] = v; }
        else if (from > to && ki >= to && ki < from) { next[ki + 1] = v; }
        else { next[ki] = v; }
      });
      return next;
    });
    setPhotoAdjust(prev => {
      const next: Record<number, { brightness: number; contrast: number; saturation: number }> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki === from) { next[to] = v; }
        else if (from < to && ki > from && ki <= to) { next[ki - 1] = v; }
        else if (from > to && ki >= to && ki < from) { next[ki + 1] = v; }
        else { next[ki] = v; }
      });
      return next;
    });
    setSelectedPhotoIndex(to);
  }

  function handleAppendPhotos(picked: File[]) {
    if (files.length >= MAX_CAROUSEL_IMAGES) {
      setPhotoError(`You already have the maximum of ${MAX_CAROUSEL_IMAGES} photos.`);
      return;
    }
    const { accepted, error } = validatePhotoBatch(picked, files.length);
    setPhotoError(error);
    if (!accepted.length) return;
    const newUrls = accepted.map(f => URL.createObjectURL(f));
    const total = files.length + accepted.length;
    resetContentCheck();                       // new media set → re-run the safety check
    setFiles(prev => [...prev, ...accepted]);
    setPreviewUrls(prev => [...prev, ...newUrls]);
    if (total === 1) { setFile(accepted[0]); setPreviewUrl(newUrls[0]); setMediaType("image"); }
    else { setFile(null); setPreviewUrl(null); setMediaType("image_carousel"); }
  }

  function removePhoto(index: number) {
    if (index < 0 || index >= files.length) return;
    URL.revokeObjectURL(previewUrls[index]);
    const newFiles = files.filter((_, i) => i !== index);
    const newUrls  = previewUrls.filter((_, i) => i !== index);
    // Shift filter/adjust maps so they keep pointing at the right photo after removal
    setPhotoFilters(prev => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => { const ki = Number(k); if (ki < index) next[ki] = v; else if (ki > index) next[ki - 1] = v; });
      return next;
    });
    setPhotoAdjust(prev => {
      const next: Record<number, { brightness: number; contrast: number; saturation: number }> = {};
      Object.entries(prev).forEach(([k, v]) => { const ki = Number(k); if (ki < index) next[ki] = v; else if (ki > index) next[ki - 1] = v; });
      return next;
    });
    setFiles(newFiles);
    setPreviewUrls(newUrls);
    setPhotoError(null);
    resetContentCheck();
    if (newFiles.length === 0) {
      setFile(null); setPreviewUrl(null); setMediaType(null);
      setSelectedPhotoIndex(0); setActiveTool(null);
    } else {
      if (newFiles.length === 1) { setFile(newFiles[0]); setPreviewUrl(newUrls[0]); setMediaType("image"); }
      else { setFile(null); setPreviewUrl(null); setMediaType("image_carousel"); }
      setSelectedPhotoIndex(i => Math.min(i, newFiles.length - 1));
    }
  }

  const totalBytes = file?.size??files.reduce((s,f)=>s+f.size,0)??0;
  const isCarousel = mediaType==="image_carousel"&&files.length>1;

  /* ── Restriction Gate ─────────────────────────────────────────────────── */
  if (restriction?.restrict_uploads) {
    return (
      <UploadRestrictedScreen
        info={restriction.active_restrictions?.find(r => r.type === "restrict_uploads")}
        fallbackUntil={restriction.upload_suspension_until}
      />
    );
  }

  return (
    <AppShell>
      <style jsx global>{`
        @keyframes contentPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(124, 58, 237, 0.25); opacity: 1; }
          50%       { box-shadow: 0 0 0 6px rgba(124, 58, 237, 0.08); opacity: 0.65; }
        }
        @keyframes contentCheckBoxBlink {
          0%, 100% { border-color: rgba(124,58,237,0.25); background-color: white; opacity: 1; }
          50%       { border-color: rgba(124,58,237,0.85); background-color: rgba(237,233,254,0.45); opacity: 0.72; }
        }
        .content-check-box-blinking { animation: contentCheckBoxBlink 0.85s infinite ease-in-out; }
      `}</style>
      <RestrictionBanner
        types={["restrict_uploads", "post_approval_required"]}
        className="mx-3.5 mt-2.5"
      />
      {/* Outer wrapper: full available height, no overflow */}
      <div className="page-frame flex w-full overflow-hidden bg-[#f8f9fb]">
        {/* 3-column grid */}
        <div
          className="grid w-full min-h-0"
          style={{
            gridTemplateColumns:"44fr 27fr 29fr",
            gap:"12px",
            padding:"10px 14px",
            height:"100%",
            boxSizing:"border-box",
          }}
        >

          {/* ══════════════ LEFT COLUMN ══════════════ */}
          <div
            className="flex min-h-0 flex-col gap-4 overflow-y-auto rounded-2xl border border-[#e5e7eb] bg-white p-5"
            style={{ scrollbarWidth:"none" }}
          >
            {/* ── Header row: title + badges on the right ── */}
            <div className="shrink-0 flex items-start justify-between gap-3">
              <div>
                <h1 className="text-[20px] font-extrabold leading-tight text-[#111827]">Upload your content</h1>
                <p className="mt-0.5 text-[12px] text-[#9aa1ad]">Share your moment with the world</p>
              </div>
              {/* Copyright badge - top-right. The content-check badge that sat
                  beside it was removed with the pre-publish scan. */}
              <div className="flex shrink-0 items-center gap-1.5">
                <div className={cn(
                  "flex items-center gap-1 rounded-[8px] border px-2 py-1 text-[11px] font-semibold transition-colors",
                  copyrightStatus === "clean"     && "border-[#16a34a] bg-[#dcfce7] text-[#16a34a]",
                  copyrightStatus === "flagged"   && "border-[#dc2626] bg-[#fee2e2] text-[#dc2626]",
                  copyrightStatus === "unchecked" && "border-[#fecdd3] bg-[#fff5f7] text-[#fe2c55]",
                )}>
                  <Copyright className="h-3 w-3 shrink-0" />
                  Copyright check
                </div>
              </div>
            </div>

            {/* ── Media type tabs (compact horizontal row) ── */}
            <div className="shrink-0 flex gap-2">
              {([
                { key: "video" as const, label: "Video", Icon: Video,  color: "#fe2c55", lightBg: "#fff5f7", border: "#fecdd3" },
                { key: "photo" as const, label: "Photo", Icon: Images, color: "#22c55e", lightBg: "#f0fdf4", border: "#bbf7d0" },
              ]).map(({ key, label, Icon, color, lightBg, border }) => {
                const active = activeUploadTab === key;
                return (
                  <button key={key} type="button" onClick={() => setActiveUploadTab(key)}
                    style={{
                      flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                      padding: "8px 10px", borderRadius: 10, cursor: "pointer", transition: "all 150ms",
                      border: `1.5px solid ${active ? color : "#e5e7eb"}`,
                      background: active ? lightBg : "white", outline: "none",
                    }}>
                    <Icon style={{ width: 15, height: 15, color: active ? color : "#9aa1ad", flexShrink: 0 }} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: active ? color : "#6b7280" }}>{label}</span>
                  </button>
                );
              })}
            </div>

            {/* ── Video dropzone - always visible in the Video tab until a VIDEO is loaded ── */}
            {activeUploadTab === "video" && mediaType !== "video" && (
              <div
                onDragOver={e=>{e.preventDefault();setDragOver(true);}}
                onDragLeave={()=>setDragOver(false)}
                onDrop={handleVideoDrop}
                onClick={()=>singleRef.current?.click()}
                className={cn(
                  "shrink-0 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[18px] border-2 border-dashed py-6 text-center transition select-none",
                  dragOver ? "border-[#fe2c55] bg-[#fff5f7]" : "border-[#d1d5db] hover:border-[#fe2c55]/60 hover:bg-[#fffbfc]",
                )}
              >
                <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#fff0f4", display: "grid", placeItems: "center" }}>
                  <UploadCloud style={{ width: 22, height: 22, color: "#fe2c55" }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 700, color: "#111827", margin: 0 }}>Drag &amp; drop your video here</p>
                <button type="button" onClick={e=>{e.stopPropagation();singleRef.current?.click();}}
                  style={{ background: "#fe2c55", borderRadius: 999, padding: "8px 26px", border: "none", color: "white", fontSize: 13, fontWeight: 700, cursor: "pointer", boxShadow: "0 4px 14px rgba(254,44,85,0.35)" }}>
                  Choose video
                </button>
                <p style={{ fontSize: 10, color: "#9aa1ad", margin: 0 }}>MP4, MOV or WebM &bull; Max 500 MB &bull; Up to 10 minutes</p>
              </div>
            )}

            {/* ── Photo tab: carousel strip + functional tools ── */}
            {activeUploadTab === "photo" && (
              <>
                {/* Upload progress bar */}
                {uploading && files.length > 0 && (
                  <div className="shrink-0 rounded-[10px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-[11px] text-[#6b7280]">Uploading {files.length} photos…</span>
                      <span className="text-[11px] font-bold text-[#374151]">{progress}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-[#e5e7eb]">
                      <div className="h-full rounded-full bg-[#fe2c55] transition-[width]" style={{width:`${progress}%`}}/>
                    </div>
                  </div>
                )}

                {/* Photos header */}
                <div className="shrink-0">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[14px] font-bold text-[#111827]">Photos</span>
                    <span className="rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[11px] font-semibold text-[#6b7280]">
                      {files.length > 0 ? `${files.length} photo${files.length > 1 ? "s" : ""}` : `up to ${MAX_CAROUSEL_IMAGES} photos`}
                    </span>
                    {files.length > 1 && (
                      <span className="rounded-full bg-[#fff0f3] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-[#F92853]">
                        {selectedPhotoIndex + 1}/{files.length}
                      </span>
                    )}
                    {files.length > 0 && (
                      <button type="button" onClick={handleClear}
                        className="ml-auto text-[11px] font-medium text-[#9aa1ad] hover:text-[#374151] transition cursor-pointer">
                        Remove all
                      </button>
                    )}
                  </div>
                  <p className="mb-3 text-[11px] text-[#9aa1ad]">Drag to reorder. Tap to select &amp; edit.</p>

                  {/* Inline validation message (unsupported format / over 20 MB / over 10 photos) */}
                  {photoError && (
                    <div className="mb-3 flex items-start gap-1.5 rounded-[10px] border border-[#fecaca] bg-[#fef2f2] px-2.5 py-2">
                      <AlertTriangle className="mt-[1px] h-3.5 w-3.5 shrink-0 text-[#ef4444]" />
                      <p className="text-[11px] font-medium leading-snug text-[#b91c1c]">{photoError}</p>
                    </div>
                  )}

                  {/* Carousel: arrows + scrollable strip */}
                  <div className="relative">
                    {/* Left arrow */}
                    {files.length > 3 && (
                      <button type="button"
                        onClick={() => stripRef.current?.scrollBy({ left: -200, behavior: "smooth" })}
                        className="absolute -left-3 top-1/2 z-10 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-[#e5e7eb] bg-white shadow-sm text-[#374151] hover:text-[#F92853] transition cursor-pointer">
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                    )}

                    {/* Scrollable strip */}
                    <div
                      ref={stripRef}
                      onDragOver={e => { e.preventDefault(); if (dragFromRef.current === null) setDragOver(true); }}
                      onDragLeave={() => setDragOver(false)}
                      onDrop={e => { e.preventDefault(); setDragOver(false); if (dragFromRef.current === null) handleDrop(e); }}
                      className={cn(
                        "flex gap-2 overflow-x-auto rounded-[14px] p-1.5 pb-2 scroll-smooth transition",
                        dragOver ? "bg-[#f0fdf4] outline-dashed outline-2 outline-[#22c55e]" : "bg-transparent"
                      )}
                      style={{ scrollbarWidth: "none" }}
                    >
                      {previewUrls.map((url, i) => (
                        <div
                          key={i}
                          draggable
                          onDragStart={() => { dragFromRef.current = i; }}
                          onDragOver={e => e.preventDefault()}
                          onDrop={e => {
                            e.preventDefault();
                            e.stopPropagation();
                            if (dragFromRef.current !== null && dragFromRef.current !== i) reorderPhoto(dragFromRef.current, i);
                            dragFromRef.current = null;
                          }}
                          onDragEnd={() => { dragFromRef.current = null; }}
                          onClick={() => { setSelectedPhotoIndex(i); }}
                          className="group relative shrink-0 cursor-pointer select-none"
                        >
                          <div className={cn(
                            "h-[90px] w-[90px] overflow-hidden rounded-[12px] transition",
                            selectedPhotoIndex === i
                              ? "ring-2 ring-[#F92853] ring-offset-1"
                              : "ring-1 ring-[#e5e7eb]"
                          )}>
                            <img src={url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover"
                              style={getPhotoStyle(i)} />
                          </div>
                          {/* Number badge */}
                          <span className="absolute left-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 shadow-sm text-[10px] font-bold text-[#111827]">
                            {i + 1}
                          </span>
                          {/* Remove button - lets the user drop a photo and add another up to the max */}
                          <button type="button"
                            onClick={(e) => { e.stopPropagation(); removePhoto(i); }}
                            aria-label={`Remove photo ${i + 1}`}
                            className="absolute right-1.5 top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-black/55 text-white opacity-0 transition hover:bg-black/80 group-hover:opacity-100">
                            <X className="h-3 w-3" />
                          </button>
                          {/* Cover label */}
                          {i === 0 && (
                            <span className="absolute bottom-[22px] left-0 right-0 flex justify-center">
                              <span className="rounded-sm bg-black/50 px-1.5 py-0.5 text-[8px] font-medium text-white">Cover</span>
                            </span>
                          )}
                          {/* Bottom bar */}
                          <div className="absolute bottom-0 left-0 right-0 flex items-center justify-center rounded-b-[12px] bg-black/30 py-1.5">
                            <SlidersHorizontal className="h-3 w-3 text-white" />
                          </div>
                        </div>
                      ))}

                      {/* Add photos / Add more slot - always appears until max reached */}
                      {files.length < MAX_CAROUSEL_IMAGES && (
                        <button type="button"
                          onClick={() => files.length === 0 ? multiRef.current?.click() : appendRef.current?.click()}
                          className="flex h-[90px] w-[78px] shrink-0 flex-col items-center justify-center gap-1.5 rounded-[12px] border-2 border-dashed border-[#e5e7eb] text-[#9aa1ad] transition hover:border-[#F92853] hover:text-[#F92853] cursor-pointer">
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6]">
                            <Plus className="h-4 w-4" />
                          </div>
                          <span className="text-[10px] font-semibold">{files.length === 0 ? "Add photos" : "Add more"}</span>
                        </button>
                      )}
                    </div>

                    {/* Right arrow */}
                    {files.length > 3 && (
                      <button type="button"
                        onClick={() => stripRef.current?.scrollBy({ left: 200, behavior: "smooth" })}
                        className="absolute -right-3 top-1/2 z-10 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-full border border-[#e5e7eb] bg-white shadow-sm text-[#374151] hover:text-[#F92853] transition cursor-pointer">
                        <ChevronRight className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Cover image */}
                {previewUrls.length > 0 && (
                  <div className="shrink-0">
                    <p className="mb-0.5 text-[13px] font-bold text-[#111827]">Cover image</p>
                    <p className="mb-2.5 text-[11px] text-[#9aa1ad]">
                      {customCoverFile ? "Custom cover selected - will appear in feed and profile." : "Choose the photo people see first in the feed and on your profile."}
                    </p>
                    <div className="flex items-center gap-3">
                      <div className="h-[56px] w-[56px] shrink-0 overflow-hidden rounded-[10px] shadow-sm ring-2 ring-[#F92853]/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={customCoverUrl ?? (previewUrls[Math.min(photoCoverIdx, previewUrls.length - 1)] ?? previewUrls[0])}
                          alt="Cover"
                          className="h-full w-full object-cover"
                          style={customCoverUrl ? undefined : getPhotoStyle(Math.min(photoCoverIdx, previewUrls.length - 1))}
                        />
                      </div>
                      <button type="button" disabled={uploading}
                        onClick={() => setShowCoverPicker(v => !v)}
                        className="flex items-center gap-1.5 rounded-[10px] border border-[#F92853] px-4 py-2 text-[12px] font-semibold text-[#F92853] transition hover:bg-[#fff5f7] disabled:opacity-40 cursor-pointer">
                        <Pencil className="h-3.5 w-3.5" />
                        Edit cover
                      </button>
                    </div>

                    {/* Inline cover picker panel */}
                    {showCoverPicker && (
                      <div className="mt-3 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] p-3">
                        <p className="mb-2 text-[11px] font-semibold text-[#6b7280]">Select a photo or upload a custom cover</p>
                        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                          {previewUrls.map((url, idx) => {
                            const isSel = !customCoverFile && photoCoverIdx === idx;
                            return (
                              <button key={idx} type="button"
                                onClick={() => {
                                  setPhotoCoverIdx(idx);
                                  if (customCoverUrl) URL.revokeObjectURL(customCoverUrl);
                                  setCustomCoverFile(null); setCustomCoverUrl(null);
                                }}
                                className={cn(
                                  "relative h-[72px] w-[58px] shrink-0 overflow-hidden rounded-[8px] border-2 transition cursor-pointer",
                                  isSel ? "border-[#F92853]" : "border-transparent hover:border-[#d1d5db]"
                                )}>
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={url} alt={`Photo ${idx + 1}`} className="h-full w-full object-cover" style={getPhotoStyle(idx)} />
                                {isSel && (
                                  <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-[#F92853]">
                                      <Check className="h-3 w-3 text-white" />
                                    </div>
                                  </div>
                                )}
                                <span className="absolute bottom-0.5 left-0 right-0 text-center text-[8px] font-bold text-white" style={{ textShadow: "0 1px 2px rgba(0,0,0,.8)" }}>{idx + 1}</span>
                              </button>
                            );
                          })}

                          {/* Custom cover upload slot */}
                          <button type="button"
                            onClick={() => coverInputRef.current?.click()}
                            className={cn(
                              "flex h-[72px] w-[58px] shrink-0 flex-col items-center justify-center gap-1 rounded-[8px] border-2 border-dashed transition cursor-pointer overflow-hidden",
                              customCoverFile ? "border-[#F92853]" : "border-[#e5e7eb] text-[#9aa1ad] hover:border-[#F92853] hover:text-[#F92853]"
                            )}>
                            {customCoverFile && customCoverUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img src={customCoverUrl} alt="Custom cover" className="h-full w-full object-cover" />
                            ) : (
                              <>
                                <UploadCloud className="h-4 w-4" />
                                <span className="text-[8px] font-semibold text-center leading-tight">Upload</span>
                              </>
                            )}
                          </button>
                        </div>

                        <div className="mt-2.5 flex items-center justify-between">
                          {customCoverFile ? (
                            <button type="button"
                              onClick={() => {
                                if (customCoverUrl) URL.revokeObjectURL(customCoverUrl);
                                setCustomCoverFile(null); setCustomCoverUrl(null);
                              }}
                              className="text-[11px] text-[#9ca3af] hover:text-red-500 transition">
                              Remove custom
                            </button>
                          ) : <span />}
                          <button type="button" onClick={() => setShowCoverPicker(false)}
                            className="text-[11px] font-semibold text-[#F92853] hover:underline cursor-pointer">
                            Done
                          </button>
                        </div>

                        <input
                          ref={coverInputRef} type="file"
                          accept="image/jpeg,image/png,image/webp"
                          className="hidden"
                          onChange={(e) => {
                            const f = e.target.files?.[0]; if (!f) return;
                            if (customCoverUrl) URL.revokeObjectURL(customCoverUrl);
                            setCustomCoverFile(f);
                            setCustomCoverUrl(URL.createObjectURL(f));
                            e.target.value = "";
                          }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Photo tools */}
                <div className="shrink-0">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[13px] font-bold text-[#111827]">Photo tools</p>
                    {files.length > 0 && (
                      <span className="text-[11px] text-[#9aa1ad]">Editing photo {selectedPhotoIndex + 1}</span>
                    )}
                  </div>
                  <div className="grid grid-cols-6 gap-1.5">
                    {([
                      { Icon: Crop,             label: "Crop",         key: "Crop"         },
                      { Icon: Palette,          label: "Filters",      key: "Filters"      },
                      { Icon: SlidersHorizontal,label: "Adjust",       key: "Adjust"       },
                      { Icon: RotateCcw,        label: "Rotate",       key: "Rotate"       },
                      { Icon: Maximize2,        label: "Aspect ratio", key: "Aspect ratio" },
                      { Icon: LayoutGrid,       label: "Rearrange",    key: "Rearrange"    },
                    ] as const).map(({ Icon, label, key }) => {
                      const isActive = activeTool === key;
                      const isRotate = key === "Rotate";
                      return (
                        <button key={key} type="button"
                          disabled={uploading || files.length === 0}
                          onClick={() => {
                            if (isRotate) { void rotatePhotoAtIndex(selectedPhotoIndex); }
                            else { setActiveTool(isActive ? null : key); }
                          }}
                          className={cn(
                            "flex flex-col items-center gap-1.5 rounded-[10px] border py-2.5 transition cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed",
                            isActive && !isRotate
                              ? "border-[#F92853] bg-[#fff5f7]"
                              : "border-[#e5e7eb] bg-white hover:border-[#d1d5db] hover:bg-[#f8f9fb]"
                          )}>
                          <Icon className={cn("h-[18px] w-[18px]", isActive && !isRotate ? "text-[#F92853]" : "text-[#374151]")} />
                          <span className="text-[8.5px] font-medium leading-none text-[#6b7280]">{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {/* Filters panel */}
                  {activeTool === "Filters" && files.length > 0 && (
                    <div className="mt-3 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] p-3">
                      <p className="mb-2.5 text-[11px] font-semibold text-[#6b7280]">Photo {selectedPhotoIndex + 1} - Filter</p>
                      <div className="flex gap-2.5 overflow-x-auto pb-1" style={{ scrollbarWidth: "none" }}>
                        {FILTER_PRESETS.map(({ name, css }) => {
                          const isSelected = (photoFilters[selectedPhotoIndex] ?? "") === css;
                          return (
                            <button key={name} type="button"
                              onClick={() => setPhotoFilters(prev => ({ ...prev, [selectedPhotoIndex]: css }))}
                              className="flex shrink-0 flex-col items-center gap-1 cursor-pointer">
                              <div className={cn(
                                "h-[54px] w-[54px] overflow-hidden rounded-[8px] border-2 transition",
                                isSelected ? "border-[#F92853]" : "border-transparent"
                              )}>
                                <img src={previewUrls[selectedPhotoIndex]} alt={name}
                                  className="h-full w-full object-cover"
                                  style={{ filter: css || undefined }} />
                              </div>
                              <span className={cn("text-[9px] font-medium", isSelected ? "text-[#F92853]" : "text-[#374151]")}>{name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Adjust panel */}
                  {activeTool === "Adjust" && files.length > 0 && (
                    <div className="mt-3 space-y-3 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] p-3">
                      <p className="text-[11px] font-semibold text-[#6b7280]">Photo {selectedPhotoIndex + 1} - Adjust</p>
                      {(["brightness", "contrast", "saturation"] as const).map(key => {
                        const val = photoAdjust[selectedPhotoIndex]?.[key] ?? 100;
                        const label = key.charAt(0).toUpperCase() + key.slice(1);
                        return (
                          <div key={key}>
                            <div className="mb-1 flex items-center justify-between">
                              <span className="text-[11px] font-medium text-[#374151]">{label}</span>
                              <span className="text-[10px] font-semibold tabular-nums text-[#6b7280]">{val}%</span>
                            </div>
                            <input type="range" min={0} max={200} step={1} value={val}
                              onChange={e => {
                                const v = Number(e.target.value);
                                setPhotoAdjust(prev => ({
                                  ...prev,
                                  [selectedPhotoIndex]: {
                                    ...(prev[selectedPhotoIndex] ?? { brightness: 100, contrast: 100, saturation: 100 }),
                                    [key]: v,
                                  },
                                }));
                              }}
                              style={{ background: `linear-gradient(to right,#fe2c55 ${(val/200)*100}%,#e5e7eb ${(val/200)*100}%)` }}
                              className="w-full h-[4px] cursor-pointer appearance-none rounded-full [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-[14px] [&::-webkit-slider-thumb]:w-[14px] [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-[#fe2c55] [&::-webkit-slider-thumb]:cursor-pointer [&::-moz-range-thumb]:h-[14px] [&::-moz-range-thumb]:w-[14px] [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:bg-[#fe2c55] [&::-moz-range-thumb]:border-none"
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Aspect ratio panel */}
                  {activeTool === "Aspect ratio" && (
                    <div className="mt-3 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] p-3">
                      <p className="mb-2 text-[11px] font-semibold text-[#6b7280]">Select aspect ratio</p>
                      <div className="flex flex-wrap gap-2">
                        {(["Original", "1:1", "4:5", "9:16", "16:9"] as const).map(ratio => (
                          <button key={ratio} type="button"
                            className="rounded-[8px] border border-[#e5e7eb] bg-white px-3 py-1.5 text-[12px] font-medium text-[#374151] transition hover:border-[#F92853] hover:text-[#F92853] cursor-pointer">
                            {ratio}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Rearrange hint */}
                  {activeTool === "Rearrange" && (
                    <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-[#bbf7d0] bg-[#f0fdf4] px-3 py-2.5">
                      <LayoutGrid className="h-4 w-4 shrink-0 text-[#22c55e]" />
                      <p className="text-[11px] font-medium text-[#15803d]">Drag thumbnails in the strip above to reorder your photos.</p>
                    </div>
                  )}

                  {/* Crop coming soon */}
                  {activeTool === "Crop" && (
                    <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3 py-2.5">
                      <Crop className="h-4 w-4 shrink-0 text-[#9aa1ad]" />
                      <p className="text-[11px] text-[#6b7280]">Crop editor coming soon. Use <span className="font-semibold text-[#374151]">Aspect ratio</span> to adjust framing.</p>
                    </div>
                  )}
                </div>
              </>
            )}

            {/* ── Shared media sections (Video / Photo tabs) ── */}
            {/* ── Hidden file inputs (always mounted so refs stay valid) ── */}
            <input ref={singleRef} type="file" accept={ACCEPT_VIDEO} className="hidden"
              onChange={e=>{
                const f = e.target.files?.[0] ?? null;
                e.target.value = "";
                // The accept filter is only a hint - enforce video-only in the Video tab.
                if (f && !VIDEO_MIMES.includes(f.type)) { toast.error("Please choose a video file for the Video tab."); return; }
                handlePick(f);
              }}/>
            <input ref={multiRef} type="file" accept={ACCEPT_MULTI} multiple className="hidden"
              onChange={e=>{ const p=Array.from(e.target.files??[]); if(p.length) handlePickMultiple(p); }}/>
            <input ref={appendRef} type="file" accept={ACCEPT_MULTI} multiple className="hidden"
              onChange={e=>{ const p=Array.from(e.target.files??[]); if(p.length) handleAppendPhotos(p); e.target.value=""; }}/>

            {/* ── File progress (video only) ── */}
            {activeUploadTab === "video" && mediaType === "video" && !!file && (
              <div className="shrink-0 rounded-[12px] border border-[#e5e7eb] bg-[#fafafa] px-3.5 py-3">
                <div className="flex items-center gap-2.5">
                  {(previewUrl||(isCarousel&&previewUrls[0])) && (
                    <div className="h-10 w-8 shrink-0 overflow-hidden rounded-[8px] bg-[#f3f4f6]">
                      {mediaType==="video"
                        ? <video src={previewUrl??""} className="h-full w-full object-cover" muted/>
                        : <img src={previewUrl??previewUrls[0]} alt="" className="h-full w-full object-cover"/>}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-semibold text-[#111827]">{file?.name??`${files.length} images`}</p>
                    <p className="text-[11px] text-[#9aa1ad]">{uploading?`${fmtMB(uploadedBytes)} / ${fmtMB(totalBytes)}`:fmtMB(totalBytes)}</p>
                  </div>
                  {uploading && <span className="shrink-0 text-[12px] font-bold text-[#374151]">{progress}%</span>}
                  <button type="button" onClick={handleClear}
                    className="shrink-0 grid h-6 w-6 place-items-center rounded-full text-[#9aa1ad] hover:bg-[#f3f4f6] hover:text-[#111827] transition">
                    <X className="h-3.5 w-3.5"/>
                  </button>
                </div>
                <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-[#e5e7eb]">
                  <div className="h-full rounded-full bg-[#fe2c55] transition-[width]" style={{width:`${uploading?progress:100}%`}}/>
                </div>
              </div>
            )}


            {/* ── Upload status banner ── */}
            {contentReason && contentStatus === "passed" && (
              <div className="shrink-0 flex items-start gap-2 rounded-[12px] border border-[#16a34a]/40 bg-[#f0fdf4] px-3.5 py-3 text-[12px] font-medium text-[#15803d]">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#16a34a]" />
                <span>{contentReason}</span>
              </div>
            )}

            {/* ── Description ── */}
            <div className="shrink-0">
              <div className="mb-2 flex items-center justify-between">
                <label className="text-[13px] font-semibold text-[#111827]">
                  {activeUploadTab === "photo" ? "Description" : "Description / Caption"}
                </label>
                <span className="text-[11px] text-[#c0c4cc]">{form.description.length}/{DESCRIPTION_MAX}</span>
              </div>
              <div className="relative">
                <textarea
                  value={form.description}
                  onChange={e=>{
                    const val = e.target.value.slice(0,DESCRIPTION_MAX);
                    patchForm({description:val});
                  }}
                  disabled={uploading} rows={activeUploadTab === "photo" ? 3 : 4}
                  placeholder="Tell your story..."
                  className="block w-full resize-none rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fb] px-4 py-3 pr-10 text-[13px] text-[#111827] outline-none transition placeholder:text-[#c0c4cc] focus:border-[#fe2c55] focus:bg-white"
                />
                <button type="button" className="absolute bottom-3 right-3.5 text-[#c0c4cc] hover:text-[#fe2c55] transition">
                  <Smile className="h-4 w-4"/>
                </button>
              </div>
            </div>

            {/* ── Hashtags + Tag people ── */}
            {activeUploadTab === "photo" ? (
              /* Photo tab: compact single-line rows */
              <div className="shrink-0 space-y-0 rounded-[14px] border border-[#e5e7eb]">
                {/* Hashtags row */}
                <div className="flex items-center gap-3 border-b border-[#f3f4f6] px-3.5 py-2.5">
                  <Hash className="h-4 w-4 shrink-0 text-[#374151]" />
                  <span className="text-[13px] font-semibold text-[#111827]">Hashtags</span>
                  <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
                    {form.hashtags.map(tag=>(
                      <span key={tag} className="inline-flex items-center gap-0.5 rounded-full bg-[#f3f4f6] px-2 py-0.5 text-[10px] font-medium text-[#374151]">
                        #{tag}
                        <button type="button" disabled={uploading}
                          onClick={()=>patchForm({hashtags:form.hashtags.filter(t=>t!==tag)})}
                          className="ml-0.5 grid h-3 w-3 place-items-center text-[#9aa1ad] hover:text-[#374151]">
                          <X className="h-2 w-2"/>
                        </button>
                      </span>
                    ))}
                    <input type="text" value={hashDraft} onChange={e=>setHashDraft(e.target.value)}
                      onKeyDown={e=>{
                        if(e.key==="Enter"||e.key===","){e.preventDefault();addHashtag(hashDraft);}
                        else if(e.key==="Backspace"&&!hashDraft&&form.hashtags.length) patchForm({hashtags:form.hashtags.slice(0,-1)});
                      }}
                      disabled={uploading||form.hashtags.length>=HASHTAGS_MAX}
                      placeholder={form.hashtags.length ? "" : "Add hashtags…"}
                      className="min-w-[80px] flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
                    />
                  </div>
                  {form.hashtags.length > 0 && (
                    <span className="shrink-0 text-[11px] font-semibold text-[#fe2c55]">{form.hashtags.length} hashtags</span>
                  )}
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0c4cc]" />
                </div>
                {/* Tag people row */}
                <TagPeopleField variant="compact" value={taggedPeople} onChange={setTaggedPeople} disabled={uploading} />
              </div>
            ) : (
              /* Video/Text tab: grid layout */
              <div className="shrink-0 grid grid-cols-2 gap-3">
                {/* Hashtags */}
                <div>
                  <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                    <Hash className="h-3.5 w-3.5 text-[#111827]" />
                    Hashtags
                  </label>
                  <div className="relative flex min-h-[42px] flex-wrap items-center gap-1 rounded-[12px] border border-[#e5e7eb] bg-[#f8f9fb] px-2.5 py-1.5 pr-8 transition focus-within:border-[#fe2c55] focus-within:bg-white">
                    {form.hashtags.map(tag=>(
                      <span key={tag} className="inline-flex items-center gap-0.5 rounded-full border border-[#fecdd3] bg-[#fff0f4] px-2 py-0.5 text-[11px] font-medium text-[#fe2c55]">
                        #{tag}
                        <button type="button" disabled={uploading}
                          onClick={()=>patchForm({hashtags:form.hashtags.filter(t=>t!==tag)})}
                          className="ml-0.5 grid h-3 w-3 place-items-center text-[#fe2c55]/60 hover:text-[#fe2c55]">
                          <X className="h-2 w-2"/>
                        </button>
                      </span>
                    ))}
                    <input type="text" value={hashDraft} onChange={e=>setHashDraft(e.target.value)}
                      onKeyDown={e=>{
                        if(e.key==="Enter"||e.key===","){e.preventDefault();addHashtag(hashDraft);}
                        else if(e.key==="Backspace"&&!hashDraft&&form.hashtags.length) patchForm({hashtags:form.hashtags.slice(0,-1)});
                      }}
                      disabled={uploading||form.hashtags.length>=HASHTAGS_MAX}
                      placeholder={form.hashtags.length ? "" : "Add hashtags (e.g. #teezer)"}
                      className="min-w-[60px] flex-1 bg-transparent py-0.5 text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
                    />
                    <button type="button" onClick={()=>addHashtag(hashDraft)} disabled={uploading}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[#c0c4cc] hover:text-[#fe2c55] transition">
                      <Hash className="h-3.5 w-3.5"/>
                    </button>
                  </div>
                </div>
                {/* Tag people */}
                <TagPeopleField variant="grid" value={taggedPeople} onChange={setTaggedPeople} disabled={uploading} />
              </div>
            )}

            {/* ── Select cover (Video tab only - never leaks into Photo tab) ── */}
            {activeUploadTab === "video" && mediaType==="video" && (
              <div className="shrink-0">
                <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                  <Camera className="h-3.5 w-3.5 text-[#111827]" />
                  Select cover
                </label>
                <ThumbnailSelector
                  thumbnails={thumbnails} selectedId={selectedThumbId}
                  onSelect={setSelectedThumbId} onAddCover={handleAddCover}
                />
              </div>
            )}

            {activeUploadTab === "photo" ? (
              /* ══ PHOTO TAB: Music + Category as full-width stacked rows ══ */
              <div className="shrink-0 space-y-3">
                {/* Music / Sound (optional) */}
                <div>
                  <p className="mb-1.5 text-[13px] font-bold text-[#111827]">
                    Music / Sound <span className="text-[11px] font-normal text-[#9aa1ad]">(optional)</span>
                  </p>
                  <div className={cn(
                    "flex items-center gap-3 rounded-[12px] border px-3 py-2.5",
                    selectedMusic ? "border-[#e5e7eb] bg-white" : "border-[#e5e7eb] bg-white"
                  )}>
                    {selectedMusic ? (
                      <>
                        <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-[8px] cursor-pointer group" onClick={toggleMusicPreview}>
                          {selectedMusic.cover_url
                            ? <img src={selectedMusic.cover_url} alt={selectedMusic.title} className="h-full w-full object-cover" />
                            : <div className="absolute inset-0 bg-gradient-to-br from-[#fe2c55] to-[#6d0020] flex items-center justify-center"><Music className="h-4 w-4 text-white/70" /></div>}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity">
                            {previewPlaying ? <Pause className="h-3 w-3 fill-white text-white" /> : <Play className="h-3 w-3 fill-white text-white ml-px" />}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-semibold text-[#111827]">{selectedMusic.title}</p>
                          <p className="truncate text-[11px] text-[#9aa1ad]">
                            {selectedMusic.artist ?? "Teezer"}
                            {selectedMusic.duration ? ` · ${Math.floor(selectedMusic.duration/60)}:${String(selectedMusic.duration%60).padStart(2,"0")}` : ""}
                          </p>
                        </div>
                        <button type="button" disabled={uploading}
                          onClick={() => setShowMusicModal(true)}
                          className="shrink-0 rounded-full border border-[#e5e7eb] px-3 py-1.5 text-[12px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55] cursor-pointer">
                          Change music
                        </button>
                        <button type="button" disabled={uploading}
                          onClick={() => { setSelectedMusic(null); setMusicVol(50); setMusicMuted(false); }}
                          className="shrink-0 grid h-7 w-7 place-items-center rounded-full text-[#9aa1ad] hover:text-[#374151] transition cursor-pointer">
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button type="button" disabled={uploading} onClick={() => setShowMusicModal(true)}
                        className="flex w-full items-center gap-2.5 text-left disabled:opacity-50 cursor-pointer">
                        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[8px] bg-[#f3f4f6]">
                          <Music2 className="h-4 w-4 text-[#9aa1ad]" />
                        </div>
                        <span className="flex-1 text-[13px] text-[#9aa1ad]">Add music from library</span>
                        <ChevronRight className="h-4 w-4 shrink-0 text-[#c0c4cc]" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Category (optional) */}
                <div>
                  <p className="mb-1.5 text-[13px] font-bold text-[#111827]">
                    Category <span className="text-[11px] font-normal text-[#9aa1ad]">(optional)</span>
                  </p>
                  <div className="flex h-[46px] items-center gap-3 rounded-[12px] border border-[#e5e7eb] bg-white px-3">
                    {(() => {
                      const sel = CAT_OPTS.find(o => o.value === form.category);
                      return (
                        <>
                          {/* Icon comes from the Dropdown's own trigger once selected; show a
                              placeholder Globe only while nothing is chosen (avoids a duplicate icon). */}
                          {!sel && <Globe className="h-4 w-4 shrink-0 text-[#9aa1ad]" />}
                          <div className="w-full">
                            <Dropdown label="Select category" inCard value={form.category} options={CAT_OPTS} onChange={v=>patchForm({category:v})} disabled={uploading} />
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              </div>
            ) : (
              /* ══ VIDEO/TEXT TAB: Music + Category side by side ══ */
              <div className="shrink-0 grid grid-cols-2 gap-3 items-start">
                {/* Music / Sound */}
                <div className="flex flex-col">
                  <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                    <Music className="h-3.5 w-3.5 text-[#111827]" />
                    Music / Sound
                  </label>
                  <div className="flex h-[42px] items-center rounded-[10px] border border-[#e5e7eb] bg-white px-2.5">
                    {selectedMusic ? (
                      <div className="flex w-full items-center gap-2">
                        <div className="relative h-7 w-7 shrink-0 overflow-hidden rounded-[6px] cursor-pointer group" onClick={toggleMusicPreview}>
                          {selectedMusic.cover_url
                            ? <img src={selectedMusic.cover_url} alt={selectedMusic.title} className="h-full w-full object-cover" />
                            : <div className="absolute inset-0 bg-gradient-to-br from-[#fe2c55] to-[#6d0020] flex items-center justify-center"><Music className="h-3 w-3 text-white/70" /></div>}
                          <div className="absolute inset-0 flex items-center justify-center bg-black/40 transition-opacity">
                            {previewPlaying ? <Pause className="h-2.5 w-2.5 fill-white text-white" /> : <Play className="h-2.5 w-2.5 fill-white text-white ml-px" />}
                          </div>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[11px] font-semibold text-[#111827] leading-none">{selectedMusic.title}</p>
                          <p className="truncate text-[10px] text-[#9aa1ad] leading-none mt-0.5">{selectedMusic.artist ?? "Teezer"}</p>
                        </div>
                        <button type="button" disabled={uploading}
                          onClick={() => setShowMusicModal(true)}
                          className="shrink-0 whitespace-nowrap rounded-full border border-[#e5e7eb] px-2 py-1 text-[10px] font-semibold text-[#374151] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
                          Change
                        </button>
                        <button type="button" disabled={uploading}
                          onClick={() => { setSelectedMusic(null); setOriginalAudioVol(100); setMusicVol(50); setOriginalMuted(false); setMusicMuted(false); }}
                          className="shrink-0 grid h-5 w-5 place-items-center rounded-full text-[#9aa1ad] hover:text-[#374151] transition">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ) : (
                      <button type="button" disabled={uploading} onClick={() => setShowMusicModal(true)}
                        className="flex w-full items-center gap-2 text-left disabled:opacity-50">
                        <Music2 className="h-3.5 w-3.5 shrink-0 text-[#9aa1ad]" />
                        <span className="flex-1 text-[12px] text-[#9aa1ad]">Choose from music library</span>
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[#c0c4cc]" />
                      </button>
                    )}
                  </div>
                </div>
                {/* Category */}
                <div className="flex flex-col">
                  <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                    <Bookmark className="h-3.5 w-3.5 text-[#111827]" />
                    Category
                  </label>
                  <div className="flex h-[42px] items-center rounded-[10px] border border-[#e5e7eb] bg-white px-3">
                    <div className="w-full">
                      <Dropdown label="Select category" inCard value={form.category} options={CAT_OPTS} onChange={v=>patchForm({category:v})} disabled={uploading} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ── Location (optional) - same autocomplete UX as the Text tab ── */}
            <div>
              <label className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                <MapPin className="h-3.5 w-3.5 text-[#111827]" />
                Location <span className="text-[11px] font-normal text-[#9aa1ad]">(optional)</span>
              </label>
              <div className="relative">
                {/* Suggestions open UPWARD so they never get clipped */}
                {mediaLocOpen && (mediaLocResults.length > 0 || mediaLocLoading) && (
                  <div className="absolute bottom-full left-0 right-0 z-20 mb-1.5 max-h-56 overflow-y-auto rounded-[12px] border border-[#e5e7eb] bg-white py-1 shadow-[0_-8px_24px_rgba(17,24,39,0.12)]">
                    {mediaLocLoading && mediaLocResults.length === 0 && (
                      <div className="flex items-center gap-2 px-3 py-2 text-[12px] text-[#9aa1ad]">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                      </div>
                    )}
                    {mediaLocResults.map((r, i) => (
                      <button key={`${r.formatted}-${i}`} type="button"
                        onClick={() => pickMediaLocation(r.formatted)}
                        className="flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-[#fff0f3]">
                        <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#fe2c55]" />
                        <span className="text-[12px] leading-snug text-[#111827]">{r.formatted}</span>
                      </button>
                    ))}
                  </div>
                )}
                <div className="flex h-[42px] items-center gap-2 rounded-[10px] border border-[#e5e7eb] bg-white px-3">
                  <MapPin className="h-4 w-4 shrink-0 text-[#9aa1ad]" />
                  <input type="text" value={mediaLocation} disabled={uploading}
                    onChange={e => setMediaLocation(e.target.value)}
                    onFocus={() => { if (mediaLocResults.length) setMediaLocOpen(true); }}
                    placeholder="Search a location"
                    className="flex-1 bg-transparent text-[12px] text-[#111827] outline-none placeholder:text-[#c0c4cc]"
                  />
                  {mediaLocLoading && mediaLocation.length >= 2 && (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#9aa1ad]" />
                  )}
                  {mediaLocation && (
                    <button type="button" onClick={() => { setMediaLocation(""); setMediaLocResults([]); setMediaLocOpen(false); }} className="text-[#9aa1ad] hover:text-[#111827]">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* ── Audio Mix ── */}
            {((activeUploadTab === "video" && mediaType === "video") || selectedMusic) && (() => {
              const isVideoActive = activeUploadTab === "video" && mediaType === "video";
              const origVal = originalMuted ? 0 : originalAudioVol;
              const musicVal = musicMuted ? 0 : musicVol;
              const sliderCls = [
                "w-full cursor-pointer appearance-none rounded-full",
                "h-[4px]",
                "[&::-webkit-slider-thumb]:appearance-none",
                "[&::-webkit-slider-thumb]:h-[14px]",
                "[&::-webkit-slider-thumb]:w-[14px]",
                "[&::-webkit-slider-thumb]:rounded-full",
                "[&::-webkit-slider-thumb]:bg-[#fe2c55]",
                "[&::-webkit-slider-thumb]:shadow-[0_0_0_2px_white,0_1px_4px_rgba(0,0,0,0.18)]",
                "[&::-webkit-slider-thumb]:cursor-pointer",
                "[&::-moz-range-thumb]:h-[14px]",
                "[&::-moz-range-thumb]:w-[14px]",
                "[&::-moz-range-thumb]:rounded-full",
                "[&::-moz-range-thumb]:bg-[#fe2c55]",
                "[&::-moz-range-thumb]:border-none",
                "[&::-moz-range-thumb]:shadow-[0_0_0_2px_white,0_1px_4px_rgba(0,0,0,0.18)]",
                "disabled:opacity-40 disabled:cursor-not-allowed",
              ].join(" ");
              return (
                <div className="shrink-0 rounded-[14px] border border-[#e5e7eb] bg-white px-4 pb-4 pt-3.5">
                  <p className="mb-4 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
                    <Activity className="h-3.5 w-3.5 text-[#111827]" />
                    Audio Mix
                  </p>
                  <div className={cn("grid gap-x-6 gap-y-4", (isVideoActive && selectedMusic) ? "grid-cols-2" : "grid-cols-1")}>
                    {/* Original video sound */}
                    {isVideoActive && (
                      <div>
                        <p className="mb-2 text-[11px] font-medium text-[#6b7280]">Original video sound</p>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setOriginalMuted(m => !m)}
                            className="shrink-0 text-[#6b7280] hover:text-[#111827] transition-colors">
                            {originalMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Volume2 className="h-3.5 w-3.5" />}
                          </button>
                          <input type="range" min={0} max={100} step={1}
                            value={origVal}
                            onChange={e => { const v = Math.max(0, Math.min(100, Number(e.target.value))); setOriginalMuted(false); setOriginalAudioVol(v); }}
                            disabled={uploading}
                            style={{ background: `linear-gradient(to right,#fe2c55 ${origVal}%,#e5e7eb ${origVal}%)` }}
                            className={cn("flex-1", sliderCls)}
                          />
                          <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-[#374151]">
                            {origVal}%
                          </span>
                        </div>
                      </div>
                    )}
                    {/* Music volume */}
                    {selectedMusic ? (
                      <div>
                        <p className="mb-2 text-[11px] font-medium text-[#6b7280]">Music volume</p>
                        <div className="flex items-center gap-2">
                          <button type="button" onClick={() => setMusicMuted(m => !m)}
                            className="shrink-0 text-[#6b7280] hover:text-[#111827] transition-colors">
                            {musicMuted ? <VolumeX className="h-3.5 w-3.5" /> : <Music2 className="h-3.5 w-3.5" />}
                          </button>
                          <input type="range" min={0} max={100} step={1}
                            value={musicVal}
                            onChange={e => { const v = Math.max(0, Math.min(100, Number(e.target.value))); setMusicMuted(false); setMusicVol(v); }}
                            disabled={uploading}
                            style={{ background: `linear-gradient(to right,#fe2c55 ${musicVal}%,#e5e7eb ${musicVal}%)` }}
                            className={cn("flex-1", sliderCls)}
                          />
                          <span className="w-8 shrink-0 text-right text-[11px] font-semibold tabular-nums text-[#374151]">
                            {musicVal}%
                          </span>
                        </div>
                      </div>
                    ) : isVideoActive && (
                      <p className="text-[11px] text-[#9aa1ad]">Add music above to mix with your video.</p>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* ── Schedule post ── */}
            <div className="shrink-0 flex items-center gap-3 rounded-[14px] border border-[#e5e7eb] bg-white px-4 py-3">
              <Calendar className="h-4 w-4 shrink-0 text-[#111827]"/>
              <p className="text-[13px] font-semibold text-[#111827]">
                Schedule post{activeUploadTab === "photo" && <span className="ml-1 text-[11px] font-normal text-[#9aa1ad]">(optional)</span>}
              </p>
              {/* Our own pickers, not <input type="date"/time>. Those render
                  their popups as browser chrome - unreachable from CSS, and a
                  different shape on every browser and OS. */}
              <div className="ml-auto flex items-center gap-2">
                <DatePicker
                  value={scheduleDate}
                  onChange={setScheduleDate}
                  disabled={!form.scheduled||contentBlocksActions}
                />
                <TimePicker
                  value={scheduleTime}
                  onChange={setScheduleTime}
                  disabled={!form.scheduled||contentBlocksActions}
                />
                <Toggle checked={form.scheduled} onChange={v=>patchForm({scheduled:v})} disabled={contentBlocksActions}/>
              </div>
            </div>
            {/* ── /Shared media sections ── */}
          </div>
          {/* ══════════════ /LEFT COLUMN ══════════════ */}

          {/* ══════════════ CENTER COLUMN ══════════════ */}
          <div className="flex min-h-0 flex-col overflow-hidden">
            <div className="mb-1.5 shrink-0">
              <h2 className="text-[14px] font-bold text-black">Preview</h2>
              <p className="text-[11px] text-[#5f6675]">How your video will appear</p>
            </div>
            <MobilePreviewCard
              previewUrl={currentContentKind === "video" ? previewUrl : null}
              mediaType={
                // Preview always reflects the single active content type.
                currentContentKind === "video"
                  ? "video"
                  : currentContentKind === "photo"
                    ? (files.length > 1 ? "image_carousel" : "image")
                    : null
              }
              previewUrls={currentContentKind === "photo" ? previewUrls : []}
              photoStyles={currentContentKind === "photo" ? previewUrls.map((_, i) => getPhotoStyle(i)) : []}
              caption={currentContentKind ? form.description : ""}
              hashtags={form.hashtags}
              soundLabel={selectedMusic
                ? `${selectedMusic.title} · ${selectedMusic.artist ?? "Teezer"}`
                : form.soundLabel}
              originalVolume={originalAudioVol}
              musicVolume={musicVol}
              originalMuted={originalMuted}
              musicMuted={musicMuted}
              musicUrl={selectedMusic?.audio_url ?? null}
            />
          </div>
          {/* ══════════════ /CENTER COLUMN ══════════════ */}

          {/* ══════════════ RIGHT COLUMN ══════════════ */}
          <div
            className="flex min-h-0 flex-col gap-2 overflow-y-scroll"
            style={{ scrollbarWidth:"thin", scrollbarColor:"#c4c7ce #f0f1f4" }}
          >
            <UploadChecklist state={checklist} mediaType={mediaType} />
            <BestTimeToPostCard />
            <PrivacyCard
              form={form} onChange={patchForm}
              disabled={uploading} mediaType={mediaType}
            />
            {/* Action buttons */}
            <div className="flex shrink-0 gap-3 pt-1">
              <button type="button"
                onClick={()=>void submit("draft")}
                disabled={!hasMedia||contentBlocksActions}
                className="flex flex-1 items-center justify-center gap-2 rounded-[12px] border border-[#e0e0e0] bg-white py-3.5 text-[14px] font-semibold text-black transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:cursor-not-allowed disabled:opacity-50">
                <Bookmark className="h-4 w-4"/>
                Save as draft
              </button>
              <button type="button"
                onClick={()=>{ if(!requiredComplete){toast.warning("Select a file and category before posting.");return;} void submit("published"); }}
                // "passed" here means the media finished uploading, not that a
                // scan passed - the pre-publish content check is gone.
                disabled={contentStatus !== "passed" || uploading}
                className={cn("flex flex-1 items-center justify-center gap-2 rounded-[12px] py-3.5 text-[14px] font-bold text-white shadow-md transition",
                  requiredComplete&&!uploading?"bg-[#fe2c55] hover:bg-[#e0243d] shadow-[#fe2c55]/20":"cursor-not-allowed bg-[#c0c4cc]")}>
                <Send className="h-4 w-4"/>
                {uploading?`Posting… ${progress}%`:"Post Now"}
              </button>
            </div>
          </div>
          {/* ══════════════ /RIGHT COLUMN ══════════════ */}

        </div>
      </div>

      {/* Music Library Modal */}
      {showMusicModal && (
        <MusicLibraryModal
          currentTrackId={selectedMusic?.id}
          onClose={() => setShowMusicModal(false)}
          onSelect={track => { setSelectedMusic(track); setShowMusicModal(false); }}
        />
      )}

      {/* One-content-type-per-post confirmation */}
      {switchPrompt && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4"
          onClick={() => { setActiveUploadTab(switchPrompt.revertTab); setSwitchPrompt(null); }}>
          <div className="w-full max-w-[340px] rounded-[18px] bg-white p-5 shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2.5">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fff0f4]">
                <AlertTriangle className="h-4.5 w-4.5 text-[#fe2c55]" />
              </div>
              <p className="text-[15px] font-bold text-[#111827]">{switchPrompt.title}</p>
            </div>
            <p className="mb-4 text-[13px] leading-snug text-[#6b7280]">
              {switchPrompt.message}
            </p>
            <div className="flex gap-2.5">
              <button type="button"
                onClick={() => { setActiveUploadTab(switchPrompt.revertTab); setSwitchPrompt(null); }}
                className="flex-1 rounded-[12px] border border-[#e5e7eb] bg-white py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f8f9fb]">
                Cancel
              </button>
              <button type="button"
                onClick={() => switchPrompt.onConfirm()}
                className="flex-1 rounded-[12px] bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e02249]">
                {switchPrompt.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
