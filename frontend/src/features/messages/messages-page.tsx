"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  Bell,
  BellOff,
  Check,
  CheckCheck,
  ChevronDown,
  CornerUpLeft,
  CornerUpRight,
  Edit3,
  File,
  FileAudio,
  FileVideo,
  Flag,
  Image,
  Info,
  Loader2,
  Lock,
  MessageCircleOff,
  Mic,
  MoreHorizontal,
  PaperclipIcon,
  Phone,
  Pin,
  Play,
  Search,
  Send,
  Settings,
  ShieldOff,
  Smile,
  Square,
  Trash2,
  UserCheck,
  Users,
  Video,
  X,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { LinkPreviewFromText } from "@/components/link-preview";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { StoryRingAvatar } from "@/components/story/story-ring-avatar";
import { ReportModal } from "@/components/report/ReportModal";
import { useCall } from "@/features/calls/call-provider";
import { useAuthStore } from "@/store/auth.store";
import { friendService } from "@/services/friend.service";
import { profileService } from "@/services/profile.service";
import { userService } from "@/services/user.service";
import {
  messageService,
  DmMessage,
  DmConversation,
  DmRequest,
  MessageType,
  formatFileSize,
  formatDuration,
} from "@/services/message.service";
import { apiMessage } from "@/services/api";
import { cn } from "@/lib/utils";
import type { ReelsooUser } from "@/types/user";

/* ═══════════════════════════════════════════════════════════════════
   TYPES
═══════════════════════════════════════════════════════════════════ */
type Privacy   = "everyone" | "friends" | "followers" | "no_one";

interface Msg {
  id:            string;
  body:          string;
  message_type:  MessageType;
  isMe:          boolean;
  ts:            number;
  read_at:       string | null;
  r2_url:        string | null;
  thumbnail_url: string | null;
  file_size:     number | null;
  duration:      number | null;
  file_name:     string | null;
  mime_type:     string | null;
  sending?:      boolean;
  // story reply context
  story_id?:            number | null;
  story_thumbnail_url?: string | null;
  // action fields
  reply_to_message_id?: number | null;
  edited_at?:          string | null;
  is_pinned?:          boolean;
  is_deleted_for_everyone?: boolean;
}

interface Convo {
  convId:      string;   // String(userId)
  userId:      number;
  username:    string;
  name:        string;
  avatar?:     string | null;
  isVerified?: boolean;
  bio?:        string;
  isOnline?:   boolean;
  lastMsg:     string;
  lastTs:      number;
  lastSenderId:number | null;
  lastReadAt:  string | null;
  unread:      number;
  pinned:      boolean;
  muted:       boolean;
  notifOn:     boolean;
}

/* ═══════════════════════════════════════════════════════════════════
   LOCAL PREFS (pin / mute / privacy - these are UI-only, per device)
═══════════════════════════════════════════════════════════════════ */
const sk = {
  privacy:  (uid: number) => `rsoo_mp_${uid}`,
  prefs:    (uid: number) => `rsoo_prefs_${uid}`,
};
type ConvoPrefs = Record<number, { pinned?: boolean; muted?: boolean; notifOn?: boolean }>;

function lsGet<T>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try { const v = localStorage.getItem(key); return v ? (JSON.parse(v) as T) : null; } catch { return null; }
}
function lsSet(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try { localStorage.setItem(key, JSON.stringify(val)); } catch { /* quota */ }
}

// Privacy is now persisted in the database via the profile API.
// localStorage helpers kept only for convo prefs (pin/mute/notif).
function loadPrefs(uid: number): ConvoPrefs { return lsGet<ConvoPrefs>(sk.prefs(uid)) ?? {}; }
function savePrefs(uid: number, p: ConvoPrefs) { lsSet(sk.prefs(uid), p); }

/* Same 5-reaction vocabulary the Story viewer already sends (story-
   viewer.tsx's own EMOJI_MAP) - kept as its own small literal here rather
   than importing across features, matching how story-viewer.tsx itself
   already keeps more than one copy of this exact map. */
const STORY_REACTION_EMOJI: Record<string, string> = {
  heart: "❤️", fire: "🔥", wow: "😮", haha: "😂", sad: "😢",
};

/* ═══════════════════════════════════════════════════════════════════
   CONVERTERS
═══════════════════════════════════════════════════════════════════ */
function apiToConvo(c: DmConversation, prefs: ConvoPrefs): Convo {
  const p = prefs[c.user_id] ?? {};
  return {
    convId:       String(c.user_id),
    userId:       c.user_id,
    username:     c.username,
    name:         c.name,
    avatar:       c.avatar,
    isVerified:   Boolean(c.is_verified),
    isOnline:     false,
    lastMsg:      c.last_message_type === "story_reaction"
      ? `${STORY_REACTION_EMOJI[c.last_message ?? ""] ?? "❤️"} Reacted to your Story`
      : (c.last_message ?? ""),
    lastTs:       c.last_ts ? new Date(c.last_ts).getTime() : 0,
    lastSenderId: c.last_sender_id,
    lastReadAt:   c.last_read_at,
    unread:       c.unread_count,
    pinned:       p.pinned ?? false,
    muted:        p.muted ?? false,
    notifOn:      p.notifOn ?? true,
  };
}

function apiToMsg(m: DmMessage, myId: number): Msg {
  return {
    id:            String(m.id),
    body:          m.body,
    message_type:  m.message_type ?? "text",
    isMe:          m.sender_id === myId,
    ts:            new Date(m.created_at).getTime(),
    read_at:       m.read_at,
    r2_url:        m.r2_url,
    thumbnail_url: m.thumbnail_url,
    file_size:     m.file_size,
    duration:      m.duration,
    file_name:     m.file_name,
    mime_type:     m.mime_type,
    story_id:            m.story_id ?? null,
    story_thumbnail_url: m.story_thumbnail_url ?? null,
    reply_to_message_id:     m.reply_to_message_id ?? null,
    edited_at:               m.edited_at ?? null,
    is_pinned:               m.is_pinned ?? false,
    is_deleted_for_everyone: !!m.deleted_for_everyone_at,
  };
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════════════════════════════ */
function tsLabel(ts: number): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function timeStr(ts: number): string {
  return new Date(ts).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: true });
}

/* ═══════════════════════════════════════════════════════════════════
   GRADIENT POOL (avatar fallback)
═══════════════════════════════════════════════════════════════════ */
const GRADS = [
  "linear-gradient(135deg,#cc2b5e,#753a88)",
  "linear-gradient(135deg,#1a1a2e,#0f3460)",
  "linear-gradient(135deg,#f77f00,#d62828)",
  "linear-gradient(135deg,#134e5e,#71b280)",
  "linear-gradient(135deg,#c94b4b,#4b134f)",
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#fe2c55,#c02040)",
  "linear-gradient(135deg,#2193b0,#6dd5ed)",
];
function hashGrad(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRADS[Math.abs(h) % GRADS.length];
}

/* ═══════════════════════════════════════════════════════════════════
   SMALL UI COMPONENTS
═══════════════════════════════════════════════════════════════════ */
function Avatar({ src, name, size = 44, isOnline }: { src?: string | null; name: string; size?: number; isOnline?: boolean }) {
  const [err, setErr] = useState(false);
  const initials = name.replace(/[^a-zA-Z ]/g, "").split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "RS";
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {src && !err
        ? <img src={src} alt={name} onError={() => setErr(true)} className="rounded-full object-cover w-full h-full" />  // eslint-disable-line @next/next/no-img-element
        : <div className="rounded-full grid place-items-center font-bold text-white w-full h-full"
            style={{ background: hashGrad(name), fontSize: Math.round(size * 0.34) }}>{initials}</div>
      }
      {isOnline && <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22c55e]" />}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)}
      className={cn("relative h-6 w-11 rounded-full transition-colors flex-shrink-0", on ? "bg-[#fe2c55]" : "bg-[#d1d5db]")}>
      <span className={cn("absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all", on ? "left-[22px]" : "left-0.5")} />
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MESSAGE STATUS ICON
═══════════════════════════════════════════════════════════════════ */
function MsgStatus({ msg }: { msg: Msg }) {
  if (!msg.isMe) return null;
  if (msg.sending) return <Check className="h-3.5 w-3.5 text-[#9aa1ad]" />;
  if (msg.read_at) return <CheckCheck className="h-3.5 w-3.5 text-[#fe2c55]" />;
  return <CheckCheck className="h-3.5 w-3.5 text-[#9aa1ad]" />;
}

/* ═══════════════════════════════════════════════════════════════════
   MEDIA BUBBLE COMPONENTS
═══════════════════════════════════════════════════════════════════ */
function ImageBubble({ msg }: { msg: Msg }) {
  const [open, setOpen] = useState(false);
  if (!msg.r2_url) return null;
  return (
    <>
      <div className="overflow-hidden rounded-[14px] cursor-pointer" style={{ maxWidth: 240 }} onClick={() => setOpen(true)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={msg.thumbnail_url ?? msg.r2_url} alt="image" className="w-full h-auto object-cover" />
      </div>
      {open && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80" onClick={() => setOpen(false)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={msg.r2_url!} alt="full" className="max-w-[90vw] max-h-[90vh] rounded-[12px] object-contain" onClick={e => e.stopPropagation()} />
          <button onClick={() => setOpen(false)} className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-white/10 text-white">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  );
}

function VideoBubble({ msg, isMe }: { msg: Msg; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  if (!msg.r2_url) return null;
  const toggle = () => {
    if (playing) { videoRef.current?.pause(); setPlaying(false); }
    else { videoRef.current?.play(); setPlaying(true); }
  };
  return (
    <div className="overflow-hidden rounded-[14px] relative" style={{ maxWidth: 240 }}>
      <video ref={videoRef} src={msg.r2_url} poster={msg.thumbnail_url ?? undefined}
        className="w-full h-auto object-cover" onEnded={() => setPlaying(false)} />
      <button onClick={toggle}
        className="absolute inset-0 flex items-center justify-center bg-black/20 transition hover:bg-black/30">
        {playing
          ? <Square className="h-8 w-8 text-white fill-white" />
          : <Play className="h-8 w-8 text-white fill-white" />
        }
      </button>
      {msg.duration && !playing && (
        <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] text-white font-mono">
          {formatDuration(msg.duration)}
        </span>
      )}
    </div>
  );
}

function AudioBubble({ msg, isMe }: { msg: Msg; isMe: boolean }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);
  if (!msg.r2_url) return null;
  const toggle = () => {
    if (playing) { audioRef.current?.pause(); setPlaying(false); }
    else { audioRef.current?.play(); setPlaying(true); }
  };
  return (
    <div className={cn("flex items-center gap-3 rounded-[18px] px-4 py-3", isMe ? "bg-[#fe2c55]" : "bg-[#f3f4f6]")}
      style={{ minWidth: 200, maxWidth: 280 }}>
      <audio ref={audioRef} src={msg.r2_url}
        onTimeUpdate={() => {
          const el = audioRef.current;
          if (el && el.duration) setProgress((el.currentTime / el.duration) * 100);
        }}
        onEnded={() => { setPlaying(false); setProgress(0); }} />
      <button onClick={toggle}
        className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
          isMe ? "bg-white/20 hover:bg-white/30" : "bg-[#fe2c55]/10 hover:bg-[#fe2c55]/20")}>
        {playing
          ? <Square className={cn("h-3.5 w-3.5 fill-current", isMe ? "text-white" : "text-[#fe2c55]")} />
          : <Play className={cn("h-3.5 w-3.5 fill-current", isMe ? "text-white" : "text-[#fe2c55]")} />
        }
      </button>
      <div className="flex-1 min-w-0">
        <div className="relative h-1.5 rounded-full overflow-hidden bg-white/30">
          <div className={cn("h-full rounded-full transition-all", isMe ? "bg-white" : "bg-[#fe2c55]")}
            style={{ width: `${progress}%` }} />
        </div>
        <span className={cn("mt-1 block text-[11px] font-mono", isMe ? "text-white/70" : "text-[#5f6675]")}>
          {msg.duration ? formatDuration(msg.duration) : "0:00"}
        </span>
      </div>
    </div>
  );
}

function DocumentBubble({ msg, isMe }: { msg: Msg; isMe: boolean }) {
  if (!msg.r2_url) return null;
  const name = msg.file_name ?? "Document";
  const size = msg.file_size ? formatFileSize(msg.file_size) : "";
  const isAudio = msg.mime_type?.startsWith("audio/");
  const isVideo = msg.mime_type?.startsWith("video/");
  const Icon = isAudio ? FileAudio : isVideo ? FileVideo : File;
  return (
    <a href={msg.r2_url} download={name} target="_blank" rel="noreferrer"
      className={cn("flex items-center gap-3 rounded-[16px] px-4 py-3 transition hover:opacity-90",
        isMe ? "bg-[#fe2c55]" : "bg-[#f3f4f6]")}
      style={{ maxWidth: 280 }}>
      <div className={cn("flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px]",
        isMe ? "bg-white/20" : "bg-[#fe2c55]/10")}>
        <Icon className={cn("h-5 w-5", isMe ? "text-white" : "text-[#fe2c55]")} />
      </div>
      <div className="min-w-0 flex-1">
        <p className={cn("truncate text-[13px] font-semibold", isMe ? "text-white" : "text-[#111827]")}>{name}</p>
        {size && <p className={cn("text-[11px]", isMe ? "text-white/70" : "text-[#5f6675]")}>{size}</p>}
      </div>
    </a>
  );
}

function StoryReplyBubble({ msg }: { msg: Msg }) {
  const [imgErr, setImgErr] = useState(false);
  const hasThumbnail = !!msg.story_thumbnail_url && !imgErr;

  return (
    <div className={cn(
      "w-[220px] overflow-hidden rounded-[18px]",
      msg.isMe ? "rounded-br-[6px]" : "rounded-bl-[6px]",
      msg.sending && "opacity-60",
    )}>
      {/* Story preview card */}
      <div className="relative h-[140px] w-full overflow-hidden rounded-t-[18px]"
        style={{ background: hasThumbnail ? "#000" : "linear-gradient(135deg,#1a1a2e,#16213e)" }}>
        {hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.story_thumbnail_url!}
            alt="Story preview"
            className="h-full w-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Play className="h-6 w-6 text-white/80" fill="white" />
            </div>
            <span className="text-[11px] font-medium text-white/60">Story</span>
          </div>
        )}
        {/* Gradient overlay at bottom */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        {/* Story label badge */}
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-sm">
          <Play className="h-2.5 w-2.5 text-white" fill="white" />
          <span className="text-[9px] font-bold uppercase tracking-wide text-white">Story</span>
        </div>
      </div>
      {/* Reply text below card */}
      <div className={cn(
        "px-3 py-2.5 text-[13px] leading-relaxed",
        msg.isMe ? "bg-[#fe2c55] text-white" : "bg-[#f3f4f6] text-[#111827]",
      )}>
        {msg.body || <span className="opacity-60 italic text-[12px]">Replied to story</span>}
      </div>
    </div>
  );
}

/** Same card as StoryReplyBubble, one line of caption instead of reply text -
 *  "❤️ Reacted to your Story" rather than a quoted message. msg.body carries
 *  the reaction_type key (e.g. "heart"), resolved via STORY_REACTION_EMOJI. */
function StoryReactionBubble({ msg }: { msg: Msg }) {
  const [imgErr, setImgErr] = useState(false);
  const hasThumbnail = !!msg.story_thumbnail_url && !imgErr;
  const emoji = STORY_REACTION_EMOJI[msg.body ?? ""] ?? "❤️";

  return (
    <div className={cn(
      "w-[220px] overflow-hidden rounded-[18px]",
      msg.isMe ? "rounded-br-[6px]" : "rounded-bl-[6px]",
      msg.sending && "opacity-60",
    )}>
      <div className="relative h-[140px] w-full overflow-hidden rounded-t-[18px]"
        style={{ background: hasThumbnail ? "#000" : "linear-gradient(135deg,#1a1a2e,#16213e)" }}>
        {hasThumbnail ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={msg.story_thumbnail_url!}
            alt="Story preview"
            className="h-full w-full object-cover"
            onError={() => setImgErr(true)}
          />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <Play className="h-6 w-6 text-white/80" fill="white" />
            </div>
            <span className="text-[11px] font-medium text-white/60">Story</span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
        <div className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/40 px-2 py-0.5 backdrop-blur-sm">
          <Play className="h-2.5 w-2.5 text-white" fill="white" />
          <span className="text-[9px] font-bold uppercase tracking-wide text-white">Story</span>
        </div>
      </div>
      <div className={cn(
        "px-3 py-2.5 text-[13px] leading-relaxed",
        msg.isMe ? "bg-[#fe2c55] text-white" : "bg-[#f3f4f6] text-[#111827]",
      )}>
        {emoji} Reacted to your Story
      </div>
    </div>
  );
}

function MsgBubble({ msg, convAvatar, convName }: { msg: Msg; convAvatar?: string | null; convName: string }) {
  const type = msg.message_type ?? "text";
  if (type === "image")                        return <ImageBubble msg={msg} />;
  if (type === "video")                        return <VideoBubble msg={msg} isMe={msg.isMe} />;
  if (type === "voice" || type === "audio")    return <AudioBubble msg={msg} isMe={msg.isMe} />;
  if (type === "document")                     return <DocumentBubble msg={msg} isMe={msg.isMe} />;
  if (type === "story_reply")                  return <StoryReplyBubble msg={msg} />;
  if (type === "story_reaction")               return <StoryReactionBubble msg={msg} />;
  // text
  return (
    <div className={cn("flex flex-col gap-1", msg.isMe ? "items-end" : "items-start")}>
      <div className={cn("rounded-[18px] px-4 py-2.5 text-[13.5px] leading-relaxed",
        msg.isMe ? "rounded-br-[6px] bg-[#fe2c55] text-white" : "rounded-bl-[6px] bg-[#f3f4f6] text-[#111827]",
        msg.sending && "opacity-60")}>
        {msg.body}
      </div>
      <LinkPreviewFromText text={msg.body} compact />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   PRIVACY SETTINGS MODAL
═══════════════════════════════════════════════════════════════════ */
const PRIVACY_OPTIONS: { id: Privacy; label: string; sub: string; icon: React.ElementType }[] = [
  { id: "everyone",  label: "Everyone",      sub: "Anyone can message you. Strangers go to Requests first.", icon: UserCheck        },
  { id: "friends",   label: "Friends only",  sub: "Only mutual followers can message you.",                 icon: Users            },
  { id: "followers", label: "Followers only",sub: "Anyone who follows you can message you.",                icon: UserCheck        },
  { id: "no_one",    label: "No one",         sub: "Nobody can send you new messages.",                      icon: MessageCircleOff },
];

function PrivacyModal({ current, onSave, onClose }: { current: Privacy; onSave: (p: Privacy) => void; onClose: () => void }) {
  const [selected, setSelected] = useState<Privacy>(current);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div className="w-[400px] rounded-[20px] bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-[16px] font-extrabold text-[#111827]">Who can message you?</h2>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#9aa1ad] hover:bg-[#f8f9fb]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {PRIVACY_OPTIONS.map((opt) => (
            <button key={opt.id} type="button" onClick={() => setSelected(opt.id)}
              className={cn("flex w-full items-center gap-3 rounded-[12px] border p-3 text-left transition",
                selected === opt.id ? "border-[#fe2c55] bg-[#fff0f4]" : "border-[#eeeeee] hover:bg-[#f8f9fb]")}>
              <div className={cn("flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full",
                selected === opt.id ? "bg-[#fe2c55] text-white" : "bg-[#f8f9fb] text-[#5f6675]")}>
                <opt.icon className="h-4.5 w-4.5" />
              </div>
              <div className="flex-1 min-w-0">
                <p className={cn("text-[13px] font-bold", selected === opt.id ? "text-[#fe2c55]" : "text-[#111827]")}>{opt.label}</p>
                <p className="text-[11px] text-[#5f6675] leading-snug mt-0.5">{opt.sub}</p>
              </div>
              {selected === opt.id && <Check className="h-4 w-4 flex-shrink-0 text-[#fe2c55]" />}
            </button>
          ))}
        </div>
        <button onClick={() => { onSave(selected); onClose(); }}
          className="mt-4 w-full rounded-full bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e02449]">
          Save
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   MAIN PAGE
═══════════════════════════════════════════════════════════════════ */
export function MessagesPage() {
  const { user, isAuthenticated, openAuthModal } = useAuthStore();
  const uid = user?.id ?? 0;
  const { startCall } = useCall();
  const searchParams = useSearchParams();
  const router = useRouter();

  /* ── Core state ── */
  const [convos,        setConvos]        = useState<Convo[]>([]);
  const [msgMap,        setMsgMap]        = useState<Record<string, Msg[]>>({});
  // Privacy is loaded from the server (authUser.message_privacy) and saved back via API.
  // It defaults to "everyone" until the user object arrives.
  const [privacy,       setPrivacy]       = useState<Privacy>((user?.message_privacy as Privacy) ?? "everyone");
  const [loading,       setLoading]       = useState(true);
  const [activeId,      setActiveId]      = useState<string | null>(null);
  const [activeTab,     setActiveTab]     = useState<"all" | "unread" | "requests">("all");
  const [msgRequests,   setMsgRequests]   = useState<DmRequest[]>([]);
  const [requestCount,  setRequestCount]  = useState(0);
  const [listSearch,    setListSearch]    = useState("");
  const [msgInput,      setMsgInput]      = useState("");
  const [showDetails,   setShowDetails]   = useState(true);
  const [showPrivacy,   setShowPrivacy]   = useState(false);
  const [showNewChat,   setShowNewChat]   = useState(false);
  const [newChatSearch, setNewChatSearch] = useState("");
  const [allUsers,      setAllUsers]      = useState<ReelsooUser[]>([]);
  const [sending,       setSending]       = useState(false);
  const [uploading,     setUploading]     = useState(false);
  const [recording,     setRecording]     = useState(false);

  /* ── Message request preview state ── */
  const [activeRequest,      setActiveRequest]      = useState<DmRequest | null>(null);
  const [reportingRequestId, setReportingRequestId] = useState<number | null>(null);
  const [reportingConversationId, setReportingConversationId] = useState<number | null>(null);
  const [requestPreviewMsgs, setRequestPreviewMsgs] = useState<Msg[]>([]);
  const [requestPreviewLoading, setRequestPreviewLoading] = useState(false);
  const requestPreviewEndRef = useRef<HTMLDivElement>(null);

  /* ── Message action state ── */
  const [replyingTo,    setReplyingTo]    = useState<Msg | null>(null);
  const [editingMsg,    setEditingMsg]    = useState<Msg | null>(null);
  const [editInput,     setEditInput]     = useState("");
  const [deleteTarget,  setDeleteTarget]  = useState<Msg | null>(null);
  const [forwardTarget, setForwardTarget] = useState<Msg | null>(null);
  const [forwardSearch, setForwardSearch] = useState("");
  const [msgMenu,       setMsgMenu]       = useState<{ msg: Msg; x: number; y: number } | null>(null);
  const [pinnedMsg,     setPinnedMsg]     = useState<Msg | null>(null);

  const msgEndRef      = useRef<HTMLDivElement>(null);
  const inputRef       = useRef<HTMLInputElement>(null);
  const fileInputRef   = useRef<HTMLInputElement>(null);
  const prefsRef       = useRef<ConvoPrefs>({});
  const mediaRecRef    = useRef<MediaRecorder | null>(null);
  const recChunksRef   = useRef<Blob[]>([]);

  /* ── Keep local privacy state in sync with server value ── */
  useEffect(() => {
    if (user?.message_privacy) setPrivacy(user.message_privacy as Privacy);
  }, [user?.message_privacy]);

  /* ── Load conversations from API ── */
  const refreshConvos = useCallback(async () => {
    if (!uid) return;
    try {
      const [list, unreadData] = await Promise.all([
        messageService.conversations(),
        messageService.unreadCount(),
      ]);
      const prefs = prefsRef.current;
      const built = list.map(c => apiToConvo(c, prefs));
      // Sort: pinned first, then by lastTs desc
      built.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.lastTs - a.lastTs;
      });
      setConvos(built);
      setRequestCount(unreadData.request_count);
    } catch { /* silent */ }
  }, [uid]);

  /* ── Load message requests ── */
  const loadRequests = useCallback(async () => {
    if (!uid) return;
    try {
      const [resp, unread] = await Promise.all([
        messageService.messageRequests(),
        messageService.unreadCount(),
      ]);
      setMsgRequests([...resp.incoming, ...resp.sent]);
      setRequestCount(unread.request_count);
    } catch { /* silent */ }
  }, [uid]);

  /* ── Load messages for active conversation ── */
  const loadMessages = useCallback(async (userId: number, convId: string) => {
    try {
      const msgs = await messageService.history(userId);
      setMsgMap(prev => ({ ...prev, [convId]: msgs.map(m => apiToMsg(m, uid)) }));
    } catch { /* silent */ }
  }, [uid]);

  /* ── Initial load ── */
  useEffect(() => {
    if (!isAuthenticated || !uid || !user?.username) return;

    prefsRef.current = loadPrefs(uid);
    // Load privacy from the user object (server-persisted), not localStorage
    if (user?.message_privacy) {
      setPrivacy(user.message_privacy as Privacy);
    }

    async function init() {
      setLoading(true);
      try {
        // Load conversations + followers + request count
        const [convList, followingRes, followersRes, unreadData] = await Promise.all([
          messageService.conversations(),
          friendService.following(user!.username, 1, 100),
          friendService.followers(user!.username, 1, 100),
          messageService.unreadCount(),
        ]);
        setRequestCount(unreadData.request_count);

        const prefs = prefsRef.current;
        const built = convList.map(c => apiToConvo(c, prefs));
        built.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.lastTs - a.lastTs;
        });
        setConvos(built);

        const following: ReelsooUser[] = followingRes.data ?? [];
        const followers: ReelsooUser[] = followersRes.data ?? [];
        setAllUsers([...following, ...followers.filter(f => !following.some(fo => fo.id === f.id))]);

        // Auto-open only when "Message Now" passes ?userId= - not on plain /messages load
        const rawUserId  = searchParams.get("userId");
        const rawUsername = searchParams.get("un");
        if (rawUserId) {
          const targetId = String(parseInt(rawUserId, 10));
          if (!built.find(c => c.convId === targetId)) {
            let targetUser: ReelsooUser | undefined = [...following, ...followers].find(u => String(u.id) === targetId);
            // If the target isn't in our following/followers (e.g. a public account we don't follow),
            // fetch their profile so we can create the temporary conversation entry.
            if (!targetUser && rawUsername) {
              try {
                const fetched = await userService.profile(rawUsername);
                if (fetched && String(fetched.id) === targetId) targetUser = fetched;
              } catch { /* profile not found - no convo created */ }
            }
            if (targetUser) {
              const p = prefs[targetUser.id] ?? {};
              const newConvo: Convo = {
                convId: targetId, userId: targetUser.id, username: targetUser.username,
                name: targetUser.name, avatar: targetUser.avatar ?? null,
                isVerified: targetUser.is_verified ?? false, isOnline: false,
                lastMsg: "", lastTs: 0, lastSenderId: null, lastReadAt: null,
                unread: 0, pinned: p.pinned ?? false, muted: p.muted ?? false, notifOn: p.notifOn ?? true,
              };
              setConvos(prev => [newConvo, ...prev]);
              setMsgMap(prev => ({ ...prev, [targetId]: [] }));
            }
          }
          setActiveId(targetId);
        }
      } finally {
        setLoading(false);
      }
    }
    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthenticated, uid, user?.username]);

  /* ── Load requests when requests tab opens ── */
  useEffect(() => {
    if (activeTab === "requests") void loadRequests();
    else setActiveRequest(null);
  }, [activeTab, loadRequests]);

  /* ── Load messages for request preview (no read receipt) ── */
  useEffect(() => {
    if (!activeRequest || !uid) { setRequestPreviewMsgs([]); return; }
    setRequestPreviewLoading(true);
    messageService.history(activeRequest.user_id)
      .then(msgs => setRequestPreviewMsgs(msgs.map(m => apiToMsg(m, uid))))
      .catch(() => {})
      .finally(() => setRequestPreviewLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeRequest?.conversation_id, uid]);

  /* ── Scroll request preview to bottom ── */
  useEffect(() => {
    requestPreviewEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [requestPreviewMsgs]);

  /* ── Load messages when active conversation changes ── */
  useEffect(() => {
    if (!activeId || !uid) return;
    const userId = parseInt(activeId, 10);
    if (isNaN(userId)) return;

    loadMessages(userId, activeId);

    // Clear unread badge locally
    setConvos(prev => prev.map(c => c.convId === activeId ? { ...c, unread: 0 } : c));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  /* ── Polling: refresh active conversation every 4s ── */
  useEffect(() => {
    if (!uid || !activeId) return;
    const userId = parseInt(activeId, 10);
    if (isNaN(userId)) return;

    const iv = setInterval(async () => {
      try {
        const msgs = await messageService.history(userId);
        setMsgMap(prev => ({ ...prev, [activeId]: msgs.map(m => apiToMsg(m, uid)) }));
      } catch { /* silent */ }
    }, 4000);

    return () => clearInterval(iv);
  }, [uid, activeId]);

  /* ── Polling: refresh conversation list every 8s ── */
  useEffect(() => {
    if (!uid) return;
    const iv = setInterval(refreshConvos, 8000);
    return () => clearInterval(iv);
  }, [uid, refreshConvos]);

  /* ── Polling: refresh request list every 8s while on requests tab ── */
  useEffect(() => {
    if (!uid || activeTab !== "requests") return;
    const iv = setInterval(loadRequests, 8000);
    return () => clearInterval(iv);
  }, [uid, activeTab, loadRequests]);

  /* ── Scroll to bottom when messages change ── */
  useEffect(() => {
    msgEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeId, msgMap]);

  /* ── Derived ── */
  const activeConvo  = convos.find(c => c.convId === activeId) ?? null;
  const activeMsgs   = msgMap[activeId ?? ""] ?? [];
  const totalUnread  = convos.reduce((s, c) => s + c.unread, 0);

  /* ── Helper: add optimistic msg and resolve after API call ── */
  const addOptimistic = useCallback((optimistic: Msg, convId: string, labelText: string) => {
    setMsgMap(prev => ({ ...prev, [convId]: [...(prev[convId] ?? []), optimistic] }));
    setConvos(prev => prev.map(c => c.convId === convId ? { ...c, lastMsg: labelText, lastTs: Date.now() } : c));
  }, []);

  const resolveOptimistic = useCallback((optimisticId: string, saved: DmMessage, convId: string) => {
    setMsgMap(prev => ({
      ...prev,
      [convId]: (prev[convId] ?? []).map(m => m.id === optimisticId ? apiToMsg(saved, uid) : m),
    }));
  }, [uid]);

  const removeOptimistic = useCallback((optimisticId: string, convId: string) => {
    setMsgMap(prev => ({ ...prev, [convId]: (prev[convId] ?? []).filter(m => m.id !== optimisticId) }));
  }, []);

  /* ── Send text message ── */
  const sendMessage = useCallback(async () => {
    const text = msgInput.trim();
    if (!text || !activeId || !uid || sending) return;

    const userId = parseInt(activeId, 10);
    if (isNaN(userId)) return;

    const replyId = replyingTo ? parseInt(replyingTo.id, 10) || undefined : undefined;

    const optimisticId = `opt_${Date.now()}`;
    const optimistic: Msg = {
      id: optimisticId, body: text, message_type: "text",
      isMe: true, ts: Date.now(), read_at: null,
      r2_url: null, thumbnail_url: null, file_size: null,
      duration: null, file_name: null, mime_type: null, sending: true,
      reply_to_message_id: replyId ?? null,
    };

    addOptimistic(optimistic, activeId, text);
    setMsgInput("");
    setReplyingTo(null);
    inputRef.current?.focus();
    setSending(true);

    try {
      const result = await messageService.send(userId, text, replyId);
      resolveOptimistic(optimisticId, result.message, activeId);
      if (result.conversation_status === "pending_request") {
        toast.info("Message request sent. Waiting for approval.", { duration: 4000 });
        setActiveId(null);
      }
      refreshConvos();
    } catch (err) {
      removeOptimistic(optimisticId, activeId);
      setMsgInput(text);
      const msg = apiMessage(err as Error);
      if (msg) toast.error(msg);
    } finally {
      setSending(false);
    }
  }, [msgInput, activeId, uid, sending, replyingTo, addOptimistic, resolveOptimistic, removeOptimistic, refreshConvos]);

  /* ── Send file (image / video / audio / document) ── */
  const sendFile = useCallback(async (file: File) => {
    if (!activeId || !uid || uploading) return;
    const userId = parseInt(activeId, 10);
    if (isNaN(userId)) return;

    const mime = file.type;
    let mediaType: "image" | "video" | "audio" | "document" = "document";
    let msgType: MessageType = "document";
    if (mime.startsWith("image/"))       { mediaType = "image";    msgType = "image"; }
    else if (mime.startsWith("video/"))  { mediaType = "video";    msgType = "video"; }
    else if (mime.startsWith("audio/"))  { mediaType = "audio";    msgType = "audio"; }

    const label = msgType === "image" ? "📷 Photo" : msgType === "video" ? "🎬 Video" : msgType === "audio" ? "🎵 Audio" : `📎 ${file.name}`;
    const optimisticId = `opt_${Date.now()}`;
    const optimistic: Msg = {
      id: optimisticId, body: label, message_type: msgType,
      isMe: true, ts: Date.now(), read_at: null,
      r2_url: URL.createObjectURL(file), thumbnail_url: null,
      file_size: file.size, duration: null, file_name: file.name, mime_type: mime, sending: true,
    };

    addOptimistic(optimistic, activeId, label);
    setUploading(true);

    try {
      const { upload_url, object_key } = await messageService.getUploadUrl({
        file_name: file.name, file_type: mime, file_size: file.size, media_type: mediaType,
      });
      await messageService.uploadToR2(upload_url, file, mime);

      const r2Url = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ""}/${object_key}`;
      const result = await messageService.sendMedia(userId, {
        message_type: msgType,
        body: label,
        r2_key: object_key,
        r2_url: r2Url,
        file_size: file.size,
        file_name: file.name,
        mime_type: mime,
      });
      resolveOptimistic(optimisticId, result.message, activeId);
      if (result.conversation_status === "pending_request") {
        toast.info("Message request sent. Waiting for approval.", { duration: 4000 });
        setActiveId(null);
      }
      refreshConvos();
    } catch (err) {
      removeOptimistic(optimisticId, activeId);
      const msg = apiMessage(err as Error);
      if (msg) toast.error(msg);
    } finally {
      setUploading(false);
    }
  }, [activeId, uid, uploading, addOptimistic, resolveOptimistic, removeOptimistic, refreshConvos]);

  /* ── Voice recording ── */
  const toggleRecording = useCallback(async () => {
    if (!activeId || !uid) return;
    const userId = parseInt(activeId, 10);
    if (isNaN(userId)) return;

    if (recording) {
      // Stop recording - send will fire via onstop handler
      mediaRecRef.current?.stop();
      setRecording(false);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      recChunksRef.current = [];
      rec.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
      rec.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(recChunksRef.current, { type: "audio/webm" });
        const fileName = `voice_${Date.now()}.webm`;
        const label = "🎤 Voice message";
        const optimisticId = `opt_${Date.now()}`;
        const optimistic: Msg = {
          id: optimisticId, body: label, message_type: "voice",
          isMe: true, ts: Date.now(), read_at: null,
          r2_url: URL.createObjectURL(blob), thumbnail_url: null,
          file_size: blob.size, duration: null, file_name: fileName, mime_type: "audio/webm", sending: true,
        };
        addOptimistic(optimistic, activeId, label);
        setUploading(true);
        try {
          const { upload_url, object_key } = await messageService.getUploadUrl({
            file_name: fileName, file_type: "audio/webm", file_size: blob.size, media_type: "voice",
          });
          await messageService.uploadToR2(upload_url, blob, "audio/webm");
          const r2Url = `${process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ""}/${object_key}`;
          const result = await messageService.sendMedia(userId, {
            message_type: "voice", body: label,
            r2_key: object_key, r2_url: r2Url,
            file_size: blob.size, file_name: fileName, mime_type: "audio/webm",
          });
          resolveOptimistic(optimisticId, result.message, activeId);
          if (result.conversation_status === "pending_request") {
            toast.info("Message request sent. Waiting for approval.", { duration: 4000 });
            setActiveId(null);
          }
          refreshConvos();
        } catch (err) {
          removeOptimistic(optimisticId, activeId);
          const msg = apiMessage(err as Error);
          if (msg) toast.error(msg);
        } finally {
          setUploading(false);
        }
      };
      mediaRecRef.current = rec;
      rec.start();
      setRecording(true);
    } catch {
      // Mic permission denied - ignore silently
    }
  }, [activeId, uid, recording, addOptimistic, resolveOptimistic, removeOptimistic, refreshConvos]);

  /* ── Update convo local prefs (pin, mute, notif) ── */
  const updateConvo = useCallback((convId: string, patch: Partial<Convo>) => {
    const userId = parseInt(convId, 10);
    setConvos(prev => prev.map(c => c.convId === convId ? { ...c, ...patch } : c));
    if (!isNaN(userId)) {
      const prefs = loadPrefs(uid);
      prefs[userId] = {
        ...(prefs[userId] ?? {}),
        ...(patch.pinned !== undefined && { pinned: patch.pinned }),
        ...(patch.muted  !== undefined && { muted:  patch.muted  }),
        ...(patch.notifOn !== undefined && { notifOn: patch.notifOn }),
      };
      prefsRef.current = prefs;
      savePrefs(uid, prefs);
    }
  }, [uid]);

  /* ── Save privacy to DB via API ── */
  const setUser = useAuthStore((s) => s.setUser);
  const handleSavePrivacy = useCallback(async (p: Privacy) => {
    setPrivacy(p);
    try {
      await profileService.update({ message_privacy: p });
      setUser({ message_privacy: p }); // keep auth store in sync
    } catch { /* silent - UI already updated optimistically */ }
  }, [setUser]);

  /* ── Close active conversation ── */
  const handleCloseConversation = useCallback(() => {
    setActiveId(null);
    router.replace("/messages");
  }, [router]);

  /* ── ESC key closes active conversation ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (showPrivacy || showNewChat) return; // let modals handle ESC first
      if (activeId) handleCloseConversation();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [activeId, showPrivacy, showNewChat, handleCloseConversation]);

  /* ── Start new conversation from search ── */
  const startNewChat = useCallback((u: ReelsooUser) => {
    const cid = String(u.id);
    if (!convos.find(c => c.convId === cid)) {
      const prefs = prefsRef.current;
      const p = prefs[u.id] ?? {};
      const newConvo: Convo = {
        convId: cid, userId: u.id, username: u.username, name: u.name,
        avatar: u.avatar ?? null, isVerified: u.is_verified ?? false,
        isOnline: false,
        lastMsg: "", lastTs: 0, lastSenderId: null, lastReadAt: null,
        unread: 0, pinned: p.pinned ?? false, muted: p.muted ?? false, notifOn: p.notifOn ?? true,
      };
      setConvos(prev => [newConvo, ...prev]);
      setMsgMap(prev => ({ ...prev, [cid]: [] }));
    }
    setActiveId(cid);
    setShowNewChat(false);
    setNewChatSearch("");
  }, [convos]);

  /* ── Filtered lists ── */
  const filteredConvos = convos.filter(c => {
    if (activeTab === "unread" && c.unread === 0) return false;
    if (listSearch.trim()) {
      const q = listSearch.toLowerCase();
      return c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q);
    }
    return true;
  });

  const incomingReqs = msgRequests.filter(r => r.direction === "incoming");
  const sentReqs     = msgRequests.filter(r => r.direction === "sent");

  const filteredNewUsers = allUsers.filter(u => {
    if (!newChatSearch.trim()) return true;
    const q = newChatSearch.toLowerCase();
    return u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q);
  }).slice(0, 15);

  /* ── Message action handlers ── */
  const openMsgMenu = useCallback((msg: Msg, e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const MENU_W = 184;
    const MENU_H = msg.isMe ? 230 : 200;
    let x = msg.isMe ? rect.left - MENU_W : rect.right + 4;
    let y = rect.bottom + 4;
    if (x + MENU_W > window.innerWidth - 8) x = window.innerWidth - MENU_W - 8;
    if (x < 8) x = 8;
    if (y + MENU_H > window.innerHeight - 8) y = rect.top - MENU_H - 4;
    setMsgMenu({ msg, x, y });
  }, []);

  const closeMsgMenu = useCallback(() => setMsgMenu(null), []);

  const doReply = useCallback((msg: Msg) => {
    setReplyingTo(msg); setMsgMenu(null);
    setTimeout(() => inputRef.current?.focus(), 60);
  }, []);

  const doEdit = useCallback((msg: Msg) => {
    setEditingMsg(msg); setEditInput(msg.body); setMsgMenu(null);
  }, []);

  const doForward = useCallback((msg: Msg) => {
    setForwardTarget(msg); setMsgMenu(null);
  }, []);

  const doDeletePrompt = useCallback((msg: Msg) => {
    setDeleteTarget(msg); setMsgMenu(null);
  }, []);

  const doPin = useCallback(async (msg: Msg) => {
    const id = parseInt(msg.id, 10); if (isNaN(id)) return;
    setMsgMenu(null);
    try {
      if (msg.is_pinned) {
        await messageService.unpinMessage(id);
        setMsgMap(prev => {
          const cid = activeId ?? "";
          return { ...prev, [cid]: (prev[cid] ?? []).map(m => m.id === msg.id ? { ...m, is_pinned: false } : m) };
        });
        if (pinnedMsg?.id === msg.id) setPinnedMsg(null);
      } else {
        await messageService.pinMessage(id);
        const updated = { ...msg, is_pinned: true };
        setMsgMap(prev => {
          const cid = activeId ?? "";
          return { ...prev, [cid]: (prev[cid] ?? []).map(m => m.id === msg.id ? { ...m, is_pinned: true } : m) };
        });
        setPinnedMsg(updated);
      }
    } catch { toast.error("Could not pin message."); }
  }, [activeId, pinnedMsg]);

  const confirmEdit = useCallback(async () => {
    if (!editingMsg || !editInput.trim()) return;
    const id = parseInt(editingMsg.id, 10); if (isNaN(id)) return;
    try {
      await messageService.editMessage(id, editInput.trim());
      setMsgMap(prev => {
        const cid = activeId ?? "";
        return { ...prev, [cid]: (prev[cid] ?? []).map(m =>
          m.id === editingMsg.id ? { ...m, body: editInput.trim(), edited_at: new Date().toISOString() } : m
        )};
      });
      setEditingMsg(null); setEditInput("");
    } catch { toast.error("Could not edit message."); }
  }, [editingMsg, editInput, activeId]);

  const confirmDelete = useCallback(async (scope: "me" | "everyone") => {
    if (!deleteTarget) return;
    const id = parseInt(deleteTarget.id, 10); if (isNaN(id)) return;
    try {
      await messageService.deleteMessage(id, scope);
      if (scope === "everyone") {
        setMsgMap(prev => {
          const cid = activeId ?? "";
          return { ...prev, [cid]: (prev[cid] ?? []).map(m =>
            m.id === deleteTarget.id ? { ...m, body: "", is_deleted_for_everyone: true } : m
          )};
        });
      } else {
        setMsgMap(prev => {
          const cid = activeId ?? "";
          return { ...prev, [cid]: (prev[cid] ?? []).filter(m => m.id !== deleteTarget.id) };
        });
      }
      setDeleteTarget(null);
    } catch { toast.error("Could not delete message."); }
  }, [deleteTarget, activeId]);

  const confirmForward = useCallback(async (targetUserId: number) => {
    if (!forwardTarget) return;
    const id = parseInt(forwardTarget.id, 10); if (isNaN(id)) return;
    try {
      await messageService.forwardMessage(id, [targetUserId]);
      setForwardTarget(null); setForwardSearch("");
      toast.success("Message forwarded.");
    } catch { toast.error("Could not forward message."); }
  }, [forwardTarget]);

  /* ── Auth gate ── */
  if (!isAuthenticated) {
    return (
      <AppShell>
        <div className="flex h-[calc(100vh-var(--topbar-h))] flex-col items-center justify-center gap-4 text-center px-6">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#fff0f4]">
            <Lock className="h-10 w-10 text-[#fe2c55]" />
          </div>
          <h2 className="text-[22px] font-black text-[#111827]">Sign in to access Messages</h2>
          <p className="max-w-[300px] text-[14px] text-[#5f6675]">Log in to message creators and connect with people you follow.</p>
          <button onClick={() => openAuthModal("login")}
            className="mt-2 rounded-full bg-[#fe2c55] px-8 py-3 text-[14px] font-bold text-white shadow-lg transition hover:bg-[#e02449]">
            Log in to Teezer
          </button>
        </div>
      </AppShell>
    );
  }

  /* ════════════════════════════════════════════════════════════════
     RENDER
  ════════════════════════════════════════════════════════════════ */
  return (
    <AppShell>
      {showPrivacy && (
        <PrivacyModal current={privacy} onSave={handleSavePrivacy} onClose={() => setShowPrivacy(false)} />
      )}

      <div className="page-frame flex overflow-hidden bg-white">

        {/* ══ LEFT: Conversation list (320px) ══════════════════════ */}
        <div className="flex w-[320px] flex-shrink-0 flex-col border-r border-[#eeeeee]">

          {/* Header */}
          <div className="flex items-center justify-between px-5 pb-3 pt-5">
            <h1 className="text-[20px] font-extrabold text-[#111827]">Messages</h1>
            <div className="flex items-center gap-1">
              <button onClick={() => setShowPrivacy(true)}
                title="Message privacy settings"
                className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#fe2c55]">
                <Settings className="h-4 w-4" />
              </button>
              <button onClick={() => setShowNewChat(true)}
                title="New message"
                className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#111827]">
                <Edit3 className="h-4 w-4" />
              </button>
            </div>
          </div>

          {/* Privacy badge */}
          <div className="px-4 pb-2">
            <button onClick={() => setShowPrivacy(true)}
              className="flex w-full items-center gap-1.5 rounded-full bg-[#f8f9fb] px-3 py-1.5 text-left transition hover:bg-[#fff0f4]">
              <Lock className="h-3 w-3 flex-shrink-0 text-[#fe2c55]" />
              <span className="text-[11px] text-[#5f6675]">
                Who can message you: <strong className="text-[#111827]">
                  {privacy === "everyone" ? "Everyone" : privacy === "friends" ? "Friends only" : privacy === "followers" ? "Followers only" : "No one"}
                </strong>
              </span>
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa1ad]" />
              <input value={listSearch} onChange={e => setListSearch(e.target.value)}
                placeholder="Search conversations"
                className="w-full rounded-full border border-[#eeeeee] bg-[#f8f9fb] py-2 pl-9 pr-4 text-[13px] outline-none transition focus:border-[#fe2c55] focus:bg-white" />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-center border-b border-[#eeeeee] px-2">
            {([
              { id: "all",      label: "All",      badge: 0             },
              { id: "unread",   label: "Unread",   badge: totalUnread   },
              { id: "requests", label: "Requests", badge: requestCount  },
            ] as const).map(tab => (
              <button key={tab.id} type="button" onClick={() => setActiveTab(tab.id)}
                className={cn("flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-[13px] font-semibold transition",
                  activeTab === tab.id ? "border-[#fe2c55] text-[#fe2c55]" : "border-transparent text-[#5f6675] hover:text-[#111827]")}>
                {tab.label}
                {tab.badge > 0 && (
                  <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[#fe2c55] px-1 text-[10px] font-bold text-white">{tab.badge}</span>
                )}
              </button>
            ))}
          </div>

          {/* Conversation list / Requests list */}
          <div className="flex-1 overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
            {activeTab === "requests" ? (
              /* ── Message Requests (Incoming + Sent) ── */
              msgRequests.length === 0 ? (
                <div className="flex flex-col items-center py-10 text-center px-4">
                  <MessageCircleOff className="h-8 w-8 text-[#d1d5db] mb-2" />
                  <p className="text-[13px] font-semibold text-[#111827]">No message requests</p>
                  <p className="text-[11px] text-[#9aa1ad] mt-1">New message requests will appear here</p>
                </div>
              ) : (
                <>
                  {/* ── Incoming requests ── */}
                  {incomingReqs.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">Incoming</div>
                      {incomingReqs.map(req => (
                        <div key={req.conversation_id}
                          className={cn("flex flex-col gap-2 border-b border-[#f3f4f6] px-4 py-3.5 cursor-pointer transition",
                            activeRequest?.conversation_id === req.conversation_id ? "bg-[#fff0f4]" : "hover:bg-[#f8f9fb]")}
                          onClick={() => setActiveRequest(req)}
                        >
                          <div className="flex items-center gap-3">
                            <StoryRingAvatar userId={req.user_id} username={req.username} displayName={req.name} avatar={req.avatar} size={44} noProfileLink />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span className={cn("truncate text-[13.5px] font-semibold",
                                  activeRequest?.conversation_id === req.conversation_id ? "text-[#fe2c55]" : "text-[#111827]")}>{req.name}</span>
                                {!!req.is_verified && <VerifiedBadge size={14} />}
                              </div>
                              <p className="text-[11px] text-[#5f6675]">@{req.username}</p>
                              {req.last_message && (
                                <p className="mt-0.5 truncate text-[12px] text-[#5f6675]">{req.last_message}</p>
                              )}
                            </div>
                            {req.last_ts && (
                              <span className="flex-shrink-0 text-[11px] text-[#9aa1ad]">{tsLabel(new Date(req.last_ts).getTime())}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 pl-[56px]" onClick={e => e.stopPropagation()}>
                            <button type="button"
                              onClick={async () => {
                                try {
                                  await messageService.acceptRequest(req.conversation_id);
                                  setMsgRequests(prev => prev.filter(r => r.conversation_id !== req.conversation_id));
                                  setRequestCount(prev => Math.max(0, prev - 1));
                                  if (activeRequest?.conversation_id === req.conversation_id) setActiveRequest(null);
                                  await refreshConvos();
                                  setActiveTab("all");
                                  toast.success("Request accepted - conversation moved to inbox.");
                                } catch { toast.error("Failed to accept request"); }
                              }}
                              className="rounded-full bg-[#fe2c55] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#e02449]">
                              Accept
                            </button>
                            <button type="button"
                              onClick={async () => {
                                try {
                                  await messageService.deleteRequest(req.conversation_id);
                                  setMsgRequests(prev => prev.filter(r => r.conversation_id !== req.conversation_id));
                                  setRequestCount(prev => Math.max(0, prev - 1));
                                  if (activeRequest?.conversation_id === req.conversation_id) setActiveRequest(null);
                                  toast.success("Request deleted");
                                } catch { toast.error("Failed to delete request"); }
                              }}
                              className="rounded-full border border-[#eeeeee] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#5f6675] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
                              Delete
                            </button>
                            <button type="button"
                              onClick={async () => {
                                try {
                                  await messageService.blockRequest(req.conversation_id);
                                  setMsgRequests(prev => prev.filter(r => r.conversation_id !== req.conversation_id));
                                  setRequestCount(prev => Math.max(0, prev - 1));
                                  if (activeRequest?.conversation_id === req.conversation_id) setActiveRequest(null);
                                  toast.success("Blocked");
                                } catch { toast.error("Failed to block"); }
                              }}
                              className="grid h-7 w-7 place-items-center rounded-full border border-[#eeeeee] text-[#5f6675] transition hover:border-red-300 hover:text-red-500"
                              title="Block">
                              <ShieldOff className="h-3.5 w-3.5" />
                            </button>
                            <button type="button"
                              onClick={() => setReportingRequestId(req.conversation_id)}
                              className="grid h-7 w-7 place-items-center rounded-full border border-[#eeeeee] text-[#5f6675] transition hover:border-amber-300 hover:text-amber-500"
                              title="Report">
                              <Flag className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}

                  {/* ── Sent requests ── */}
                  {sentReqs.length > 0 && (
                    <>
                      <div className="px-4 pt-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">Sent</div>
                      {sentReqs.map(req => (
                        <div key={req.conversation_id}
                          className={cn("flex flex-col gap-1.5 border-b border-[#f3f4f6] px-4 py-3.5 cursor-pointer transition",
                            activeRequest?.conversation_id === req.conversation_id ? "bg-[#fff0f4]" : "hover:bg-[#f8f9fb]")}
                          onClick={() => setActiveRequest(req)}
                        >
                          <div className="flex items-center gap-3">
                            <StoryRingAvatar userId={req.user_id} username={req.username} displayName={req.name} avatar={req.avatar} size={44} noProfileLink />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1">
                                <span className={cn("truncate text-[13.5px] font-semibold",
                                  activeRequest?.conversation_id === req.conversation_id ? "text-[#fe2c55]" : "text-[#111827]")}>{req.name}</span>
                                {!!req.is_verified && <VerifiedBadge size={14} />}
                              </div>
                              <p className="text-[11px] text-[#5f6675]">@{req.username}</p>
                              {req.last_message && (
                                <p className="mt-0.5 truncate text-[12px] text-[#5f6675]">{req.last_message}</p>
                              )}
                            </div>
                            {req.last_ts && (
                              <span className="flex-shrink-0 text-[11px] text-[#9aa1ad]">{tsLabel(new Date(req.last_ts).getTime())}</span>
                            )}
                          </div>
                          <div className="flex items-center justify-between pl-[56px]" onClick={e => e.stopPropagation()}>
                            <span className="text-[11px] font-medium text-[#f59e0b]">Waiting for approval</span>
                            <button type="button"
                              onClick={async () => {
                                try {
                                  await messageService.cancelRequest(req.conversation_id);
                                  setMsgRequests(prev => prev.filter(r => r.conversation_id !== req.conversation_id));
                                  setRequestCount(prev => Math.max(0, prev - 1));
                                  if (activeRequest?.conversation_id === req.conversation_id) setActiveRequest(null);
                                  toast.success("Request cancelled");
                                } catch { toast.error("Failed to cancel request"); }
                              }}
                              className="text-[11px] text-[#5f6675] hover:text-red-500 transition">
                              Cancel
                            </button>
                          </div>
                        </div>
                      ))}
                    </>
                  )}
                </>
              )
            ) : loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#fe2c55]" /></div>
            ) : filteredConvos.length === 0 ? (
              <div className="flex flex-col items-center py-10 text-center px-4">
                <Search className="h-8 w-8 text-[#d1d5db] mb-2" />
                <p className="text-[13px] font-semibold text-[#111827]">
                  {listSearch ? "No conversations found" : activeTab === "unread" ? "No unread messages" : "No conversations yet"}
                </p>
                <p className="text-[11px] text-[#9aa1ad] mt-1">
                  {listSearch ? "Try a different name" : "Follow people to start messaging"}
                </p>
              </div>
            ) : filteredConvos.map(conv => (
              <button key={conv.convId} type="button"
                onClick={() => setActiveId(conv.convId)}
                className={cn("flex w-full items-center gap-3 px-4 py-3.5 text-left transition hover:bg-[#f8f9fb]",
                  activeId === conv.convId && "bg-[#fff0f4] hover:bg-[#fff0f4]")}>
                <StoryRingAvatar userId={conv.userId} username={conv.username} displayName={conv.name} avatar={conv.avatar} size={48} isOnline={conv.isOnline} noProfileLink />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1 min-w-0">
                      <span className={cn("truncate text-[13.5px]", conv.unread > 0 ? "font-bold text-[#111827]" : "font-semibold text-[#111827]")}>
                        {conv.name}
                      </span>
                      {conv.isVerified && <VerifiedBadge size={14} />}
                      {conv.pinned && <Pin className="h-3 w-3 flex-shrink-0 text-[#fe2c55]" />}
                    </div>
                    <span className="ml-2 flex-shrink-0 text-[11px] text-[#9aa1ad]">{tsLabel(conv.lastTs)}</span>
                  </div>
                  <div className="flex items-center justify-between mt-0.5">
                    <p className={cn("truncate text-[12px]", conv.unread > 0 ? "font-medium text-[#111827]" : "text-[#5f6675]")}>
                      {conv.lastMsg || <span className="italic text-[#9aa1ad]">No messages yet</span>}
                    </p>
                    {conv.unread > 0 && (
                      <span className="ml-2 flex-shrink-0 grid h-5 min-w-5 place-items-center rounded-full bg-[#fe2c55] px-1 text-[10px] font-bold text-white">
                        {conv.unread}
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* ══ CENTER: Chat area (flex-1) ════════════════════════════ */}
        <div className="flex flex-1 flex-col min-w-0 border-r border-[#eeeeee]">

          {/* ── Message Request Preview ── */}
          {activeTab === "requests" && activeRequest ? (
            <>
              {/* Header - differs by direction */}
              <div className="flex items-center gap-3 border-b border-[#eeeeee] px-5 py-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Avatar src={activeRequest.avatar} name={activeRequest.name} size={40} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[14px] font-extrabold text-[#111827]">{activeRequest.name}</span>
                      {!!activeRequest.is_verified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-[11px] text-[#5f6675]">@{activeRequest.username}</p>
                  </div>
                </div>
                {activeRequest.direction === "incoming" ? (
                  /* Incoming: Accept / Delete / Block / Report */
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button"
                      onClick={async () => {
                        try {
                          await messageService.acceptRequest(activeRequest.conversation_id);
                          setMsgRequests(prev => prev.filter(r => r.conversation_id !== activeRequest.conversation_id));
                          setRequestCount(prev => Math.max(0, prev - 1));
                          setActiveRequest(null);
                          await refreshConvos();
                          setActiveTab("all");
                          toast.success("Request accepted - conversation moved to inbox.");
                        } catch { toast.error("Failed to accept request"); }
                      }}
                      className="rounded-full bg-[#fe2c55] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#e02449]">
                      Accept
                    </button>
                    <button type="button"
                      onClick={async () => {
                        try {
                          await messageService.deleteRequest(activeRequest.conversation_id);
                          setMsgRequests(prev => prev.filter(r => r.conversation_id !== activeRequest.conversation_id));
                          setRequestCount(prev => Math.max(0, prev - 1));
                          setActiveRequest(null);
                          toast.success("Request deleted");
                        } catch { toast.error("Failed to delete request"); }
                      }}
                      className="rounded-full border border-[#eeeeee] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#5f6675] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
                      Delete
                    </button>
                    <button type="button"
                      onClick={async () => {
                        try {
                          await messageService.blockRequest(activeRequest.conversation_id);
                          setMsgRequests(prev => prev.filter(r => r.conversation_id !== activeRequest.conversation_id));
                          setRequestCount(prev => Math.max(0, prev - 1));
                          setActiveRequest(null);
                          toast.success("Blocked");
                        } catch { toast.error("Failed to block"); }
                      }}
                      className="grid h-8 w-8 place-items-center rounded-full border border-[#eeeeee] text-[#5f6675] transition hover:border-red-300 hover:text-red-500"
                      title="Block">
                      <ShieldOff className="h-4 w-4" />
                    </button>
                    <button type="button"
                      onClick={() => setReportingRequestId(activeRequest.conversation_id)}
                      className="grid h-8 w-8 place-items-center rounded-full border border-[#eeeeee] text-[#5f6675] transition hover:border-amber-300 hover:text-amber-500"
                      title="Report">
                      <Flag className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  /* Sent: just a close / cancel button */
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button type="button"
                      onClick={async () => {
                        try {
                          await messageService.cancelRequest(activeRequest.conversation_id);
                          setMsgRequests(prev => prev.filter(r => r.conversation_id !== activeRequest.conversation_id));
                          setRequestCount(prev => Math.max(0, prev - 1));
                          setActiveRequest(null);
                          toast.success("Request cancelled");
                        } catch { toast.error("Failed to cancel request"); }
                      }}
                      className="rounded-full border border-[#eeeeee] bg-white px-4 py-1.5 text-[12px] font-semibold text-[#5f6675] transition hover:border-red-300 hover:text-red-500">
                      Cancel request
                    </button>
                  </div>
                )}
              </div>

              {/* Banner - differs by direction */}
              {activeRequest.direction === "incoming" ? (
                <div className="flex items-center gap-2 border-b border-[#eeeeee] bg-[#fff8e1] px-4 py-2.5">
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[#f59e0b]" />
                  <p className="text-[11.5px] text-[#78350f]">
                    <strong>Message request preview</strong> - Accept to start chatting. Messages are not marked as seen until you accept.
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 border-b border-[#eeeeee] bg-[#fffbeb] px-4 py-2.5">
                  <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[#f59e0b]" />
                  <p className="text-[11.5px] text-[#78350f]">
                    <strong>Waiting for approval</strong> - Your message request has been sent. Messages are not marked as seen yet.
                  </p>
                </div>
              )}

              {/* Preview messages (read-only, no mark-read) */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
                {requestPreviewLoading ? (
                  <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-[#fe2c55]" /></div>
                ) : requestPreviewMsgs.length === 0 ? (
                  <div className="flex flex-col items-center py-12 text-center">
                    <Avatar src={activeRequest.avatar} name={activeRequest.name} size={56} />
                    <p className="mt-3 text-[14px] font-bold text-[#111827]">{activeRequest.name}</p>
                    <p className="text-[11px] text-[#9aa1ad] mt-1">No messages to preview</p>
                  </div>
                ) : requestPreviewMsgs.map(msg => (
                  <div key={msg.id} className={cn("flex items-end gap-2", msg.isMe ? "flex-row-reverse" : "flex-row")}>
                    {msg.isMe
                      ? <Avatar src={user?.avatar} name={user?.name ?? "Me"} size={32} />
                      : <Avatar src={activeRequest.avatar} name={activeRequest.name} size={32} />
                    }
                    <div className={cn("flex max-w-[68%] flex-col gap-0.5", msg.isMe ? "items-end" : "items-start")}>
                      <MsgBubble msg={msg} convAvatar={activeRequest.avatar} convName={activeRequest.name} />
                      <span className="text-[11px] text-[#9aa1ad]">{msg.ts ? timeStr(msg.ts) : ""}</span>
                    </div>
                  </div>
                ))}
                <div ref={requestPreviewEndRef} />
              </div>

              {/* Footer - differs by direction */}
              {activeRequest.direction === "incoming" ? (
                <div className="border-t border-[#eeeeee] bg-[#f8f9fb] px-5 py-3 text-center">
                  <p className="text-[12px] text-[#9aa1ad]">
                    Accept this request to send messages.
                    <button onClick={async () => {
                      try {
                        await messageService.acceptRequest(activeRequest.conversation_id);
                        setMsgRequests(prev => prev.filter(r => r.conversation_id !== activeRequest.conversation_id));
                        setRequestCount(prev => Math.max(0, prev - 1));
                        setActiveRequest(null);
                        await refreshConvos();
                        setActiveTab("all");
                        toast.success("Request accepted.");
                      } catch { toast.error("Failed to accept"); }
                    }} className="ml-1 font-bold text-[#fe2c55] hover:underline">Accept now</button>
                  </p>
                </div>
              ) : (
                <div className="border-t border-[#eeeeee] bg-[#f8f9fb] px-5 py-3 text-center">
                  <p className="text-[12px] text-[#9aa1ad]">
                    Waiting for approval. You&apos;ll be able to chat after this request is accepted.
                  </p>
                </div>
              )}
            </>

          ) : !activeId ? (
            /* ── No selection empty state ── */
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff0f4]">
                {activeTab === "requests"
                  ? <MessageCircleOff className="h-8 w-8 text-[#fe2c55]" />
                  : convos.length === 0 ? <Edit3 className="h-8 w-8 text-[#fe2c55]" /> : <MessageCircleOff className="h-8 w-8 text-[#fe2c55]" />
                }
              </div>
              <p className="text-[15px] font-bold text-[#111827]">
                {activeTab === "requests"
                  ? "Select a message request to preview"
                  : convos.length === 0 ? "Your messages" : "Select a conversation"
                }
              </p>
              <p className="text-[13px] text-[#5f6675] max-w-[260px]">
                {activeTab === "requests"
                  ? "Click a request on the left to preview it before accepting."
                  : convos.length === 0
                    ? "Start a conversation or select a user to message."
                    : "Click a message to view the conversation."
                }
              </p>
              {activeTab !== "requests" && convos.length === 0 && (
                <button onClick={() => setShowNewChat(true)}
                  className="mt-1 rounded-full bg-[#fe2c55] px-5 py-2 text-[13px] font-bold text-white transition hover:bg-[#e02449]">
                  New Message
                </button>
              )}
            </div>

          ) : activeConvo ? (
            /* ── NORMAL CHAT VIEW ── */
            <>
              {/* Chat header */}
              <div className="flex items-center gap-3 border-b border-[#eeeeee] px-5 py-3">
                <Link href={`/profile/${activeConvo.username}`} className="flex items-center gap-2.5 min-w-0 flex-1 hover:opacity-80 transition">
                  <Avatar src={activeConvo.avatar} name={activeConvo.name} size={40} isOnline={activeConvo.isOnline} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1">
                      <span className="text-[14px] font-extrabold text-[#111827]">{activeConvo.name}</span>
                      {activeConvo.isVerified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-[11px] text-[#5f6675]">@{activeConvo.username}</p>
                  </div>
                </Link>
                <div className="flex items-center gap-0.5 flex-shrink-0">
                  <button
                    onClick={() => startCall({ id: parseInt(activeConvo.convId, 10), name: activeConvo.name, username: activeConvo.username, avatar: activeConvo.avatar }, "audio")}
                    title="Audio call"
                    className="grid h-9 w-9 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#111827]"><Phone className="h-4 w-4" /></button>
                  <button
                    onClick={() => startCall({ id: parseInt(activeConvo.convId, 10), name: activeConvo.name, username: activeConvo.username, avatar: activeConvo.avatar }, "video")}
                    title="Video call"
                    className="grid h-9 w-9 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#111827]"><Video className="h-4 w-4" /></button>
                  <button onClick={() => setShowDetails(v => !v)}
                    className={cn("grid h-9 w-9 place-items-center rounded-full transition",
                      showDetails ? "bg-[#fff0f4] text-[#fe2c55]" : "text-[#5f6675] hover:bg-[#f8f9fb] hover:text-[#111827]")}>
                    <Info className="h-4 w-4" />
                  </button>
                  <button
                    onClick={handleCloseConversation}
                    aria-label="Close conversation"
                    title="Close conversation"
                    className="grid h-9 w-9 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#111827]">
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* Pinned message banner */}
              {pinnedMsg && !pinnedMsg.is_deleted_for_everyone && (
                <div className="flex items-center gap-2 border-b border-[#eeeeee] bg-[#fff0f4] px-4 py-2">
                  <Pin className="h-3.5 w-3.5 flex-shrink-0 text-[#fe2c55]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-bold text-[#fe2c55] leading-none mb-0.5">Pinned message</p>
                    <p className="truncate text-[12px] text-[#374151]">{pinnedMsg.body}</p>
                  </div>
                  <button type="button" onClick={() => setPinnedMsg(null)}
                    className="flex-shrink-0 text-[#9aa1ad] hover:text-[#374151] transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4"
                style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>

                {activeMsgs.length === 0 && (
                  <div className="flex flex-col items-center py-12 text-center">
                    <Avatar src={activeConvo.avatar} name={activeConvo.name} size={56} />
                    <p className="mt-3 text-[14px] font-bold text-[#111827]">{activeConvo.name}</p>
                    <p className="text-[12px] text-[#5f6675]">@{activeConvo.username}</p>
                    <p className="mt-2 text-[12px] text-[#9aa1ad]">No messages yet. Say hello!</p>
                  </div>
                )}

                {activeMsgs.length > 0 && (
                  <div className="flex items-center gap-3">
                    <div className="flex-1 border-t border-[#eeeeee]" />
                    <span className="text-[11px] text-[#9aa1ad]">
                      {new Date(activeMsgs[0].ts).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                    </span>
                    <div className="flex-1 border-t border-[#eeeeee]" />
                  </div>
                )}

                {activeMsgs.map(msg => (
                  <div key={msg.id} className={cn("group flex items-end gap-2", msg.isMe ? "flex-row-reverse" : "flex-row")}>
                    {msg.isMe
                      ? <Avatar src={user?.avatar} name={user?.name ?? "Me"} size={32} />
                      : <Avatar src={activeConvo.avatar} name={activeConvo.name} size={32} />
                    }

                    {/* Three-dot action button - appears on hover */}
                    {!msg.sending && (
                      <button
                        type="button"
                        onClick={(e) => openMsgMenu(msg, e)}
                        aria-label="Message actions"
                        className="self-center grid h-7 w-7 flex-shrink-0 place-items-center rounded-full text-[#9aa1ad] opacity-0 transition group-hover:opacity-100 hover:bg-[#f0f0f0] hover:text-[#374151]"
                      >
                        <MoreHorizontal className="h-4 w-4" />
                      </button>
                    )}

                    <div className={cn("flex max-w-[68%] flex-col gap-0.5", msg.isMe ? "items-end" : "items-start",
                      msg.sending && "opacity-60")}>

                      {/* Reply-to preview above the bubble */}
                      {msg.reply_to_message_id && (() => {
                        const orig = activeMsgs.find(m => String(m.id) === String(msg.reply_to_message_id));
                        if (!orig) return null;
                        return (
                          <div className={cn(
                            "mb-0.5 max-w-full rounded-[10px] border-l-[3px] border-[#fe2c55] px-2.5 py-1.5 text-[11px]",
                            msg.isMe ? "bg-[#c0213e]/20 text-white/70" : "bg-[#f0f0f0] text-[#5f6675]",
                          )}>
                            <span className="block font-bold text-[#fe2c55] text-[10px]">
                              {orig.isMe ? "You" : activeConvo?.name}
                            </span>
                            <span className="line-clamp-1">
                              {orig.is_deleted_for_everyone ? "This message was deleted" : orig.body}
                            </span>
                          </div>
                        );
                      })()}

                      {/* Bubble: deleted / edit-mode / normal */}
                      {msg.is_deleted_for_everyone ? (
                        <div className="flex items-center gap-1.5 rounded-[14px] border border-[#e5e7eb] bg-[#f8f9fb] px-3 py-2 text-[12.5px] italic text-[#9aa1ad]">
                          This message was deleted
                        </div>
                      ) : editingMsg?.id === msg.id ? (
                        <div className="flex w-full min-w-[200px] flex-col gap-1.5">
                          <input
                            autoFocus
                            value={editInput}
                            onChange={(e) => setEditInput(e.target.value.slice(0, 4000))}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); void confirmEdit(); }
                              if (e.key === "Escape") { setEditingMsg(null); setEditInput(""); }
                            }}
                            className="rounded-[12px] border border-[#fe2c55] bg-white px-3 py-2 text-[13px] text-[#111827] outline-none"
                          />
                          <div className="flex gap-2 justify-end">
                            <button type="button" onClick={() => { setEditingMsg(null); setEditInput(""); }}
                              className="rounded-full px-3 py-1 text-[11px] font-semibold text-[#5f6675] hover:bg-[#f0f0f0]">
                              Cancel
                            </button>
                            <button type="button" onClick={() => void confirmEdit()}
                              className="rounded-full bg-[#fe2c55] px-3 py-1 text-[11px] font-bold text-white hover:bg-[#e02449]">
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <MsgBubble msg={msg} convAvatar={activeConvo.avatar} convName={activeConvo.name} />
                      )}

                      {/* Time + status + edited */}
                      <div className={cn("flex items-center gap-1", msg.isMe ? "flex-row-reverse" : "flex-row")}>
                        <span className="text-[11px] text-[#9aa1ad]">{msg.ts ? timeStr(msg.ts) : ""}</span>
                        <MsgStatus msg={msg} />
                        {msg.edited_at && !msg.is_deleted_for_everyone && (
                          <span className="text-[10px] text-[#9aa1ad]">(edited)</span>
                        )}
                        {msg.is_pinned && !msg.is_deleted_for_everyone && (
                          <Pin className="h-2.5 w-2.5 text-[#fe2c55]" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                <div ref={msgEndRef} />
              </div>

              {/* Privacy blocked state */}
              {privacy === "no_one" && (
                <div className="border-t border-[#eeeeee] bg-[#f8f9fb] px-5 py-3 text-center">
                  <p className="text-[12px] text-[#9aa1ad]">
                    You've set your messages to <strong>No one</strong>.{" "}
                    <button onClick={() => setShowPrivacy(true)} className="text-[#fe2c55] hover:underline">Change settings</button>
                  </p>
                </div>
              )}

              {/* Reply preview strip */}
              {replyingTo && (
                <div className="flex items-center gap-2 border-t border-[#eeeeee] bg-[#f8f9fb] px-4 py-2">
                  <CornerUpLeft className="h-4 w-4 flex-shrink-0 text-[#fe2c55]" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-[#fe2c55] leading-none mb-0.5">
                      Replying to {replyingTo.isMe ? "yourself" : activeConvo?.name}
                    </p>
                    <p className="truncate text-[12px] text-[#374151]">
                      {replyingTo.is_deleted_for_everyone ? "This message was deleted" : replyingTo.body}
                    </p>
                  </div>
                  <button type="button" onClick={() => setReplyingTo(null)}
                    className="flex-shrink-0 text-[#9aa1ad] hover:text-[#374151] transition">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              {/* Input area */}
              {privacy !== "no_one" && (
                <div className="border-t border-[#eeeeee] px-4 py-3">
                  {/* Hidden file input */}
                  <input ref={fileInputRef} type="file" className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.zip"
                    onChange={e => { const f = e.target.files?.[0]; if (f) sendFile(f); e.target.value = ""; }} />

                  <div className="flex items-center gap-2">
                    <button className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#fe2c55]">
                      <Smile className="h-5 w-5" />
                    </button>
                    <input
                      ref={inputRef}
                      value={msgInput}
                      onChange={e => setMsgInput(e.target.value)}
                      onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                      placeholder={recording ? "🔴 Recording… tap mic to send" : `Message @${activeConvo.username}...`}
                      disabled={recording}
                      className="flex-1 min-w-0 rounded-full border border-[#eeeeee] bg-[#f8f9fb] py-2 pl-4 pr-4 text-[13.5px] outline-none transition focus:border-[#fe2c55] focus:bg-white disabled:opacity-60"
                    />
                    {/* Attachment button */}
                    <button onClick={() => fileInputRef.current?.click()} disabled={uploading || recording}
                      title="Send photo, video, audio or document"
                      className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb] hover:text-[#fe2c55] disabled:opacity-40">
                      {uploading ? <Loader2 className="h-5 w-5 animate-spin text-[#fe2c55]" /> : <PaperclipIcon className="h-5 w-5" />}
                    </button>
                    {/* Voice recording button */}
                    <button onClick={toggleRecording} disabled={uploading}
                      title={recording ? "Stop and send" : "Record voice message"}
                      className={cn("grid h-9 w-9 flex-shrink-0 place-items-center rounded-full transition disabled:opacity-40",
                        recording ? "bg-[#fe2c55] text-white animate-pulse" : "text-[#5f6675] hover:bg-[#f8f9fb] hover:text-[#fe2c55]")}>
                      <Mic className="h-5 w-5" />
                    </button>
                    <button onClick={sendMessage} disabled={!msgInput.trim() || sending || recording}
                      className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-full bg-[#fe2c55] text-white shadow transition hover:bg-[#e02449] active:scale-95 disabled:opacity-40">
                      {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* ══ RIGHT: Details panel (340px, xl only) ════════════════ */}
        {showDetails && activeConvo && (
          <div className="hidden xl:flex w-[340px] flex-shrink-0 flex-col overflow-y-auto border-l border-[#eeeeee]"
            style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>

            {/* User header */}
            <div className="flex flex-col items-center gap-2 px-5 pb-4 pt-6">
              <Link href={`/profile/${activeConvo.username}`}>
                <Avatar src={activeConvo.avatar} name={activeConvo.name} size={80} isOnline={activeConvo.isOnline} />
              </Link>
              <div className="flex items-center gap-1.5 mt-1">
                <span className="text-[16px] font-extrabold text-[#111827]">{activeConvo.name}</span>
                {activeConvo.isVerified && <VerifiedBadge size={14} />}
              </div>
              <p className="text-[13px] text-[#5f6675]">@{activeConvo.username}</p>
              {activeConvo.isOnline && (
                <p className="flex items-center gap-1.5 text-[12px] font-medium text-[#22c55e]">
                  <span className="h-2 w-2 rounded-full bg-[#22c55e]" /> Active now
                </p>
              )}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-4 gap-2 border-t border-b border-[#eeeeee] px-4 py-4">
              {[
                { Icon: Phone,          label: "Audio Call",  onClick: () => startCall({ id: parseInt(activeConvo.convId, 10), name: activeConvo.name, username: activeConvo.username, avatar: activeConvo.avatar }, "audio") },
                { Icon: Video,          label: "Video Call",  onClick: () => startCall({ id: parseInt(activeConvo.convId, 10), name: activeConvo.name, username: activeConvo.username, avatar: activeConvo.avatar }, "video") },
                { Icon: Search,         label: "Search"      },
                { Icon: MoreHorizontal, label: "More"        },
              ].map(({ Icon, label, onClick }) => (
                <div key={label} className="flex flex-col items-center gap-1.5">
                  <button onClick={onClick} className="grid h-12 w-12 place-items-center rounded-full bg-[#f8f9fb] text-[#5f6675] transition hover:bg-[#fff0f4] hover:text-[#fe2c55]">
                    <Icon className="h-5 w-5" />
                  </button>
                  <span className="text-[10px] text-[#5f6675] text-center leading-tight">{label}</span>
                </div>
              ))}
            </div>

            {/* About */}
            {activeConvo.bio && (
              <div className="border-b border-[#eeeeee] px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-[13px] font-extrabold text-[#111827]">About</h3>
                  <ChevronDown className="h-4 w-4 text-[#9aa1ad]" />
                </div>
                <p className="text-[12.5px] text-[#5f6675] leading-relaxed whitespace-pre-line">{activeConvo.bio}</p>
              </div>
            )}

            {/* Shared media placeholder */}
            <div className="border-b border-[#eeeeee] px-5 py-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-[13px] font-extrabold text-[#111827]">Shared media</h3>
                <button className="text-[12px] font-semibold text-[#fe2c55] hover:underline">View all</button>
              </div>
              <div className="flex flex-col items-center py-4 text-center">
                <Image className="h-7 w-7 text-[#d1d5db] mb-1.5" />
                <p className="text-[11px] text-[#9aa1ad]">No shared media yet</p>
              </div>
            </div>

            {/* Settings toggles */}
            <div className="border-b border-[#eeeeee] px-5 py-3 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Bell className="h-4 w-4 text-[#5f6675]" />
                  <span className="text-[13px] font-semibold text-[#111827]">Notifications</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[#9aa1ad]">{activeConvo.notifOn ? "On" : "Off"}</span>
                  <Toggle on={!!activeConvo.notifOn} onChange={v => updateConvo(activeConvo.convId, { notifOn: v })} />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <BellOff className="h-4 w-4 text-[#5f6675]" />
                  <span className="text-[13px] font-semibold text-[#111827]">Mute messages</span>
                </div>
                <Toggle on={!!activeConvo.muted} onChange={v => updateConvo(activeConvo.convId, { muted: v })} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <Pin className="h-4 w-4 text-[#5f6675]" />
                  <span className="text-[13px] font-semibold text-[#111827]">Pin chat</span>
                </div>
                <Toggle on={!!activeConvo.pinned} onChange={v => updateConvo(activeConvo.convId, { pinned: v })} />
              </div>
            </div>

            {/* Block user */}
            <div className="px-5 py-4">
              <button className="flex items-center gap-2.5 text-[13px] font-semibold text-[#fe2c55] transition hover:opacity-80">
                <ShieldOff className="h-4 w-4" />
                Block user
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ NEW CHAT MODAL ════════════════════════════════════════════ */}
      {showNewChat && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={() => setShowNewChat(false)}>
          <div className="w-[400px] rounded-[20px] bg-white shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#eeeeee]">
              <h2 className="text-[15px] font-extrabold text-[#111827]">New Message</h2>
              <button onClick={() => setShowNewChat(false)} className="grid h-8 w-8 place-items-center rounded-full text-[#9aa1ad] hover:bg-[#f8f9fb]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-3 border-b border-[#eeeeee]">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa1ad]" />
                <input autoFocus value={newChatSearch} onChange={e => setNewChatSearch(e.target.value)}
                  placeholder="Search people you follow..."
                  className="w-full rounded-full border border-[#eeeeee] bg-[#f8f9fb] py-2 pl-9 pr-4 text-[13px] outline-none focus:border-[#fe2c55]" />
              </div>
            </div>
            <div className="max-h-[320px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
              {filteredNewUsers.length === 0 ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <Users className="h-8 w-8 text-[#d1d5db] mb-2" />
                  <p className="text-[13px] text-[#9aa1ad]">No people found</p>
                </div>
              ) : filteredNewUsers.map(u => (
                <button key={u.id} type="button" onClick={() => startNewChat(u)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[#f8f9fb]">
                  <Avatar src={u.avatar} name={u.name} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1">
                      <span className="truncate text-[13px] font-bold text-[#111827]">{u.name}</span>
                      {!!u.is_verified && <VerifiedBadge size={14} />}
                    </div>
                    <p className="text-[12px] text-[#5f6675]">@{u.username}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {/* ══ MESSAGE ACTION MENU (portal, never clipped) ════════════ */}
      {msgMenu && typeof document !== "undefined" && createPortal(
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 9000 }} onClick={closeMsgMenu} />
          <div
            style={{
              position: "fixed", top: msgMenu.y, left: msgMenu.x,
              zIndex: 9001, background: "white",
              borderRadius: 14, border: "1px solid #eeeeee",
              boxShadow: "0 8px 32px rgba(0,0,0,0.16)",
              minWidth: 184, overflow: "hidden", padding: "4px 0",
            }}
          >
            {[
              { icon: <CornerUpLeft size={14} />, label: "Reply",    action: () => doReply(msgMenu.msg),  show: true,          danger: false },
              { icon: <Edit3 size={14} />,         label: "Edit",     action: () => doEdit(msgMenu.msg),   show: msgMenu.msg.isMe && !msgMenu.msg.is_deleted_for_everyone, danger: false },
              { icon: <CornerUpRight size={14} />, label: "Forward",  action: () => doForward(msgMenu.msg),show: !msgMenu.msg.is_deleted_for_everyone, danger: false },
              { icon: <Pin size={14} />,           label: msgMenu.msg.is_pinned ? "Unpin" : "Pin", action: () => void doPin(msgMenu.msg), show: !msgMenu.msg.is_deleted_for_everyone, danger: false },
              { icon: <Trash2 size={14} />,        label: msgMenu.msg.isMe ? "Delete" : "Delete for me", action: () => doDeletePrompt(msgMenu.msg), show: true, danger: true },
              {
                icon: <Flag size={14} />, label: "Report",
                // No per-message report endpoint exists - this reports the
                // conversation the message belongs to (same flow as the
                // "Report" action on the conversation/request itself).
                // convId is defined as String(userId) (see the Convo type),
                // so activeId - the open conversation's id - already IS that.
                action: () => { closeMsgMenu(); if (activeId) setReportingConversationId(Number(activeId)); },
                show: !msgMenu.msg.isMe, danger: true,
              },
            ].filter(item => item.show).map(item => (
              <button
                key={item.label}
                type="button"
                onClick={item.action}
                className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-semibold transition"
                style={{ color: item.danger ? "#ef4444" : "#111827" }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.background = item.danger ? "#fef2f2" : "#f8f9fb")}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                <span style={{ color: item.danger ? "#ef4444" : "#5f6675", display: "flex" }}>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </div>
        </>,
        document.body,
      )}

      {/* ══ DELETE CONFIRMATION MODAL ════════════════════════════════ */}
      {deleteTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setDeleteTarget(null)}>
          <div className="w-[310px] rounded-[20px] bg-white p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
            <h3 className="text-[15px] font-extrabold text-[#111827] mb-1">Delete message?</h3>
            <p className="text-[12px] text-[#9aa1ad] mb-4">Choose how you want to delete this message.</p>
            <div className="flex flex-col gap-2">
              {deleteTarget.isMe && (
                <button type="button" onClick={() => void confirmDelete("everyone")}
                  className="w-full rounded-[12px] bg-[#fe2c55] py-2.5 text-[13px] font-bold text-white transition hover:bg-[#e02449]">
                  Delete for everyone
                </button>
              )}
              <button type="button" onClick={() => void confirmDelete("me")}
                className="w-full rounded-[12px] border border-[#eeeeee] py-2.5 text-[13px] font-bold text-[#374151] transition hover:bg-[#f8f9fb]">
                Delete for me
              </button>
              <button type="button" onClick={() => setDeleteTarget(null)}
                className="w-full rounded-[12px] py-2.5 text-[13px] font-semibold text-[#9aa1ad] transition hover:text-[#374151]">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ FORWARD MESSAGE MODAL ════════════════════════════════════ */}
      {forwardTarget && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => { setForwardTarget(null); setForwardSearch(""); }}>
          <div className="w-[380px] overflow-hidden rounded-[20px] bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-[#eeeeee] px-5 py-4">
              <h3 className="text-[15px] font-extrabold text-[#111827]">Forward message</h3>
              <button type="button" onClick={() => { setForwardTarget(null); setForwardSearch(""); }}
                className="grid h-8 w-8 place-items-center rounded-full text-[#9aa1ad] hover:bg-[#f8f9fb]">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mx-5 my-3 rounded-[10px] border-l-[3px] border-[#fe2c55] bg-[#f8f9fb] px-3 py-2 text-[12px] text-[#374151]">
              <p className="line-clamp-2">{forwardTarget.is_deleted_for_everyone ? "This message was deleted" : forwardTarget.body}</p>
            </div>
            <div className="px-5 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa1ad]" />
                <input autoFocus value={forwardSearch} onChange={e => setForwardSearch(e.target.value)}
                  placeholder="Search conversations..."
                  className="w-full rounded-full border border-[#eeeeee] bg-[#f8f9fb] py-2 pl-9 pr-4 text-[13px] outline-none focus:border-[#fe2c55]" />
              </div>
            </div>
            <div className="max-h-[260px] overflow-y-auto" style={{ scrollbarWidth: "thin", scrollbarColor: "#e5e7eb transparent" }}>
              {convos.filter(c => {
                if (!forwardSearch.trim()) return true;
                const q = forwardSearch.toLowerCase();
                return c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q);
              }).map(c => (
                <button key={c.convId} type="button" onClick={() => void confirmForward(c.userId)}
                  className="flex w-full items-center gap-3 px-5 py-3 text-left transition hover:bg-[#f8f9fb]">
                  <Avatar src={c.avatar} name={c.name} size={38} />
                  <div className="min-w-0 flex-1">
                    <span className="truncate text-[13px] font-bold text-[#111827] block">{c.name}</span>
                    <p className="text-[11px] text-[#5f6675]">@{c.username}</p>
                  </div>
                  <CornerUpRight className="h-4 w-4 flex-shrink-0 text-[#9aa1ad]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {reportingRequestId !== null && (
        <ReportModal
          entityType="message_request"
          entityId={reportingRequestId}
          onClose={() => setReportingRequestId(null)}
          onSubmitted={() => {
            setMsgRequests((prev) => prev.filter((r) => r.conversation_id !== reportingRequestId));
            setRequestCount((prev) => Math.max(0, prev - 1));
            if (activeRequest?.conversation_id === reportingRequestId) setActiveRequest(null);
          }}
        />
      )}
      {reportingConversationId !== null && (
        <ReportModal
          entityType="conversation"
          entityId={reportingConversationId}
          onClose={() => setReportingConversationId(null)}
          onSubmitted={() => toast.success("Reported")}
        />
      )}
    </AppShell>
  );
}
