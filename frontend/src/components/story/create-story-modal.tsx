"use client";

import {
  useCallback, useEffect, useMemo, useRef, useState,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createPortal } from "react-dom";
import {
  AtSign, ChevronDown, ChevronLeft, ChevronRight,
  Hash, ImagePlus, Link2, MapPin, Pencil, Plus,
  RefreshCw, Send, Smile, Trash2, Type, Volume2, VolumeX, X,
} from "lucide-react";
import { toast } from "sonner";
import { storyService, type Story, type StoryLayer, type LayerFont } from "@/services/story.service";
import { useAuthStore } from "@/store/auth.store";
import { Logo } from "@/components/ui/logo";

/* ── Types ───────────────────────────────────────────────────── */
type Step       = "pick" | "upload" | "text";
type FillMode   = "fill" | "fit";
type Visibility = "public" | "followers" | "close_friends" | "only_me";
type ReplyMode  = "everyone" | "followers" | "nobody";
type ToolPanel  = "media" | "text" | "link" | "mention" | "hashtag" | "location" | "emoji" | "draw";
type DrawTool   = "brush" | "eraser";

interface MediaItem {
  id:          string;
  file:        File | null;   // null when the media comes from a shared feed video
  previewUrl:  string;
  type:        "image" | "video";
  duration?:   number;
  isShared?:   boolean;       // true = shared feed video (no re-upload needed)
  sharedId?:   number;        // original video id
  sharedSize?: number | null; // original file size in bytes
}

interface MentionUser {
  id:          number;
  username:    string;
  name:        string;
  avatar:      string | null;
  is_verified: boolean;
}

export interface SharedVideoSource {
  id:           number;
  mediaUrl:     string;
  thumbnailUrl: string | null;
  duration:     number | null;
  size:         number | null;  // bytes
  title?:       string | null;
}

interface Props {
  open:            boolean;
  onClose:         () => void;
  onStorySaved?:   (story: Story) => void;
  username?:       string;
  userAvatar?:     string | null;
  initialCaption?: string;
  sharedVideo?:    SharedVideoSource | null;
}

/* ── Constants ───────────────────────────────────────────────── */
const TEXT_BG_COLORS = [
  { id: "rose",   bg: "#fc3a6b", text: "white" },
  { id: "purple", bg: "#a855f7", text: "white" },
  { id: "blue",   bg: "#3b82f6", text: "white" },
  { id: "dark",   bg: "#1f2937", text: "white" },
  { id: "green",  bg: "#10b981", text: "white" },
  { id: "orange", bg: "#f97316", text: "white" },
];

const TEXT_COLORS  = ["#ffffff", "#111827", "#fd4605", "#f59e0b", "#10b981", "#3b82f6", "#a855f7"];
const DRAW_COLORS  = ["#ffffff", "#000000", "#fd4605", "#f59e0b", "#3b82f6", "#a855f7", "#10b981"];

const FONTS: { value: LayerFont; label: string; style?: React.CSSProperties }[] = [
  { value: "classic",    label: "Classic" },
  { value: "modern",     label: "Modern",      style: { fontFamily: "sans-serif", fontWeight: 300, letterSpacing: "0.04em" } },
  { value: "typewriter", label: "Typewriter",  style: { fontFamily: "Courier New, monospace" } },
  { value: "strong",     label: "Strong",      style: { fontWeight: 900, textTransform: "uppercase" as const } },
  { value: "minimal",    label: "Minimal",     style: { fontFamily: "Georgia, serif", letterSpacing: "0.1em" } },
];

const EMOJI_LIST = ["😂", "❤️", "🔥", "✨", "🎉", "😍", "🙌", "💯", "🥰", "😎", "🌟", "💪"];

const PRIVACY_OPTIONS: { value: Visibility; label: string; emoji: string }[] = [
  { value: "public",        emoji: "🌐", label: "Public" },
  { value: "followers",     emoji: "👥", label: "Followers" },
  { value: "close_friends", emoji: "⭐", label: "Close Friends" },
  { value: "only_me",       emoji: "🔒", label: "Only Me" },
];

const REPLY_OPTIONS: { value: ReplyMode; label: string; emoji: string }[] = [
  { value: "everyone",  emoji: "💬", label: "Everyone" },
  { value: "followers", emoji: "👥", label: "Followers" },
  { value: "nobody",    emoji: "🚫", label: "Nobody" },
];

/* ── Helpers ─────────────────────────────────────────────────── */
function uid() { return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`; }
function clamp(v: number, min: number, max: number) { return Math.max(min, Math.min(max, v)); }
function isValidUrl(s: string) {
  try { new URL(s.startsWith("http") ? s : `https://${s}`); return true; } catch { return false; }
}
function getFontStyle(font: LayerFont): React.CSSProperties {
  return FONTS.find((f) => f.value === font)?.style ?? {};
}

/* ── Toggle ──────────────────────────────────────────────────── */
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)}
      style={{ width: 44, height: 24, borderRadius: 999, border: "none", background: checked ? "#fd4605" : "#d1d5db", position: "relative", cursor: "pointer", flexShrink: 0, transition: "background 200ms" }}
    >
      <span style={{ position: "absolute", top: 3, width: 18, height: 18, borderRadius: "50%", background: "white", boxShadow: "0 1px 4px rgba(0,0,0,0.25)", left: checked ? 23 : 3, transition: "left 200ms" }} />
    </button>
  );
}

/* ── Custom Dropdown ─────────────────────────────────────────── */
function CustomDropdown({ value, onChange, options }: {
  value:    string;
  onChange: (v: string) => void;
  options:  { value: string; label: string; emoji: string }[];
}) {
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === value);
  return (
    <div style={{ position: "relative" }}>
      <button type="button" onClick={() => setOpen(v => !v)}
        style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13, fontWeight: 600, color: "#111827", outline: "none", transition: "border-color 150ms" }}
        onFocus={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#fd4605"; }}
        onBlur={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; }}>
        <span style={{ fontSize: 15 }}>{current?.emoji}</span>
        <span style={{ flex: 1, textAlign: "left" }}>{current?.label}</span>
        <ChevronDown size={14} color={open ? "#fd4605" : "#9ca3af"}
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 150ms" }} />
      </button>
      {open && (
        <>
          <div style={{ position: "fixed", inset: 0, zIndex: 49 }} onClick={() => setOpen(false)} />
          <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, zIndex: 50, background: "white", border: "1.5px solid #e5e7eb", borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,0.12)", overflow: "hidden" }}>
            {options.map(opt => (
              <button key={opt.value} type="button"
                onClick={() => { onChange(opt.value); setOpen(false); }}
                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: opt.value === value ? "#fff3ec" : "white", border: "none", cursor: "pointer", fontSize: 13, fontWeight: opt.value === value ? 700 : 500, color: opt.value === value ? "#fd4605" : "#374151", textAlign: "left", transition: "background 100ms" }}
                onMouseEnter={(e) => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.background = "#f9fafb"; }}
                onMouseLeave={(e) => { if (opt.value !== value) (e.currentTarget as HTMLButtonElement).style.background = "white"; }}>
                <span style={{ fontSize: 15 }}>{opt.emoji}</span>
                <span style={{ flex: 1 }}>{opt.label}</span>
                {opt.value === value && <span style={{ color: "#fd4605", fontWeight: 800 }}>✓</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

/* ── Corner handle - module-level so React never unmounts it mid-drag ── */
type ResizeState = { startX: number; startY: number; startScale: number; dirX: number; dirY: number };

function CornerHandle({ pos, inv, dirX, dirY, resizeRef, layerScale, onUpdate }: {
  pos:        React.CSSProperties;
  inv:        number;
  dirX:       number;
  dirY:       number;
  resizeRef:  React.MutableRefObject<ResizeState | null>;
  layerScale: number;
  onUpdate:   (patch: Partial<StoryLayer>) => void;
}) {
  function handleDown(e: React.PointerEvent) {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    resizeRef.current = { startX: e.clientX, startY: e.clientY, startScale: layerScale, dirX, dirY };
  }
  function handleMove(e: React.PointerEvent) {
    e.stopPropagation();
    if (!resizeRef.current) return;
    const dx = e.clientX - resizeRef.current.startX;
    const dy = e.clientY - resizeRef.current.startY;
    /* project pointer movement onto this corner's outward direction */
    const projection = dx * resizeRef.current.dirX + dy * resizeRef.current.dirY;
    onUpdate({ scale: clamp(resizeRef.current.startScale + projection * 0.008, 0.25, 4) });
  }
  function handleUp(e: React.PointerEvent) {
    e.stopPropagation();
    resizeRef.current = null;
  }
  const cursor = `${dirY < 0 ? "n" : "s"}${dirX < 0 ? "w" : "e"}-resize`;
  return (
    <div
      onPointerDown={handleDown} onPointerMove={handleMove} onPointerUp={handleUp}
      onClick={(e) => e.stopPropagation()}
      style={{ position: "absolute", width: 10, height: 10, background: "white", border: "1.5px solid rgba(80,160,255,0.9)", borderRadius: 2, zIndex: 33, cursor, transform: `scale(${inv})`, pointerEvents: "auto", touchAction: "none", ...pos }}
    />
  );
}

/* ── Layer renderer ──────────────────────────────────────────── */
function LayerEl({ layer, isSelected, previewRef, onSelect, onUpdate, onDelete }: {
  layer:      StoryLayer & { localId: string };
  isSelected: boolean;
  previewRef: React.RefObject<HTMLDivElement | null>;
  onSelect:   () => void;
  onUpdate:   (patch: Partial<StoryLayer>) => void;
  onDelete:   () => void;
}) {
  const dragRef   = useRef<{ startCX: number; startCY: number; startX: number; startY: number } | null>(null);
  const resizeRef = useRef<ResizeState | null>(null);

  function onPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    dragRef.current = { startCX: e.clientX, startCY: e.clientY, startX: layer.x, startY: layer.y };
    onSelect();
  }
  function onPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !previewRef.current) return;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((e.clientX - dragRef.current.startCX) / rect.width) * 100;
    const dy = ((e.clientY - dragRef.current.startCY) / rect.height) * 100;
    onUpdate({ x: clamp(dragRef.current.startX + dx, 3, 97), y: clamp(dragRef.current.startY + dy, 3, 97) });
  }
  function onPointerUp() { dragRef.current = null; }

  const content = (() => {
    const fontCss = getFontStyle(layer.font);
    const base: React.CSSProperties = { color: layer.color, fontSize: 18, fontWeight: 700, whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.6)", ...fontCss };
    switch (layer.type) {
      case "text":     return <span style={base}>{layer.text}</span>;
      case "link":     return <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "7px 14px", borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.4)", color: "white", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}><Link2 size={12} /> {layer.text || "Link"}</div>;
      case "mention":  return <div style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", color: "#60c4ff", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>@{layer.username ?? layer.text}</div>;
      case "hashtag":  return <div style={{ padding: "6px 14px", borderRadius: 999, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", color: "white", fontSize: 15, fontWeight: 800, whiteSpace: "nowrap" }}>{layer.text.startsWith("#") ? layer.text : `#${layer.text}`}</div>;
      case "location": return <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 14px", borderRadius: 999, background: "rgba(255,255,255,0.22)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.35)", color: "white", fontSize: 13, fontWeight: 700, whiteSpace: "nowrap" }}>📍 {layer.locationName ?? layer.text}</div>;
      case "emoji":    return <span style={{ fontSize: 44, lineHeight: 1, filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>{layer.text}</span>;
      default:         return null;
    }
  })();

  const inv = 1 / Math.max(layer.scale ?? 1, 0.25);
  const scale = layer.scale ?? 1;

  return (
    <div
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      onClick={(e) => { e.stopPropagation(); onSelect(); }}
      style={{ position: "absolute", left: `${layer.x}%`, top: `${layer.y}%`, transform: `translate(-50%,-50%) scale(${scale}) rotate(${layer.rotation}deg)`, cursor: "grab", zIndex: (layer.zIndex ?? 0) + 20, touchAction: "none", userSelect: "none", outline: isSelected ? "1.5px dashed rgba(80,160,255,0.9)" : "none", outlineOffset: 5, borderRadius: 4 }}
    >
      {content}
      {isSelected && (
        <>
          <button type="button" onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onDelete(); }}
            style={{ position: "absolute", top: -14, right: -14, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.8)", border: "1.5px solid white", color: "white", cursor: "pointer", display: "grid", placeItems: "center", zIndex: 34, transform: `scale(${inv})`, transformOrigin: "top right" }}>
            <X size={10} />
          </button>
          <CornerHandle pos={{ top: -5, left: -5 }}     inv={inv} dirX={-1} dirY={-1} resizeRef={resizeRef} layerScale={scale} onUpdate={onUpdate} />
          <CornerHandle pos={{ top: -5, right: -5 }}    inv={inv} dirX={1}  dirY={-1} resizeRef={resizeRef} layerScale={scale} onUpdate={onUpdate} />
          <CornerHandle pos={{ bottom: -5, left: -5 }}  inv={inv} dirX={-1} dirY={1}  resizeRef={resizeRef} layerScale={scale} onUpdate={onUpdate} />
          <CornerHandle pos={{ bottom: -5, right: -5 }} inv={inv} dirX={1}  dirY={1}  resizeRef={resizeRef} layerScale={scale} onUpdate={onUpdate} />
        </>
      )}
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════
   Main component
   ═══════════════════════════════════════════════════════════════ */
export function CreateStoryModal({ open, onClose, onStorySaved, username = "you", userAvatar, initialCaption, sharedVideo }: Props) {
  const authUser    = useAuthStore((s) => s.user);
  const displayName = authUser?.name ?? authUser?.username ?? username;
  const queryClient = useQueryClient();

  const [step, setStep] = useState<Step>("pick");

  /* text story */
  const [textBg,      setTextBg]      = useState(TEXT_BG_COLORS[0]);
  const [textContent, setTextContent] = useState("");

  /* media */
  const [mediaItems,   setMediaItems]   = useState<MediaItem[]>([]);
  const [activeSlide,  setActiveSlide]  = useState(0);
  const [draggingFile, setDraggingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* layers */
  const [layers,        setLayers]        = useState<(StoryLayer & { localId: string })[]>([]);
  const [selectedLayer, setSelectedLayer] = useState<string | null>(null);

  /* panel */
  const [activePanel, setActivePanel] = useState<ToolPanel>("media");

  /* text tool */
  const [textInput,  setTextInput]  = useState("");
  const [textColor,  setTextColor]  = useState("#ffffff");
  const [activeFont, setActiveFont] = useState<LayerFont>("classic");

  /* link tool */
  const [linkTitle,    setLinkTitle]    = useState("");
  const [linkUrl,      setLinkUrl]      = useState("");
  const [linkUrlError, setLinkUrlError] = useState(false);

  /* mention */
  const [mentionQuery,   setMentionQuery]   = useState("");
  const [mentionResults, setMentionResults] = useState<MentionUser[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const mentionTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* hashtag */
  const [hashtagInput, setHashtagInput] = useState("");

  /* location */
  const [locationQuery,   setLocationQuery]   = useState("");
  const [locationResults, setLocationResults] = useState<{ place_id: number; display_name: string }[]>([]);
  const [locationLoading, setLocationLoading] = useState(false);
  const locationTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* draw tool */
  const [drawTool,    setDrawTool]    = useState<DrawTool>("brush");
  const [drawColor,   setDrawColor]   = useState("#ffffff");
  const [brushSize,   setBrushSize]   = useState(8);
  const [drawHistory, setDrawHistory] = useState<string[]>([]);
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const lastDrawPos  = useRef<{ x: number; y: number } | null>(null);

  /* settings */
  const [fillMode,    setFillMode]    = useState<FillMode>("fill");
  const [visibility,  setVisibility]  = useState<Visibility>("public");
  const [replyMode,   setReplyMode]   = useState<ReplyMode>("everyone");
  const [saveArchive, setSaveArchive] = useState(true);
  const [highQuality, setHighQuality] = useState(true);

  /* preview mute (for shared videos) */
  const [previewMuted, setPreviewMuted] = useState(true);

  /* submit */
  const [submitting, setSubmitting] = useState(false);
  const [animate,    setAnimate]    = useState(false);

  /* refs */
  const previewRef       = useRef<HTMLDivElement>(null);
  const rightScrollRef   = useRef<HTMLDivElement>(null);
  const createSectionRef = useRef<HTMLDivElement>(null);
  const mediaSectionRef  = useRef<HTMLDivElement>(null);

  /* ── Animate open/close ── */
  useEffect(() => {
    if (open) {
      if (sharedVideo) {
        // Pre-load the shared feed video and jump straight to the editor.
        const item: MediaItem = {
          id:          `shared-${sharedVideo.id}`,
          file:        null,
          previewUrl:  sharedVideo.mediaUrl,
          type:        "video",
          duration:    sharedVideo.duration ?? undefined,
          isShared:    true,
          sharedId:    sharedVideo.id,
          sharedSize:  sharedVideo.size,
        };
        setMediaItems([item]);
        setActiveSlide(0);
        setStep("upload");
      } else if (initialCaption) {
        setTextInput(initialCaption);
      }
      const t = setTimeout(() => setAnimate(true), 10);
      return () => clearTimeout(t);
    } else {
      setAnimate(false);
      const t = setTimeout(() => {
        setStep("pick"); setMediaItems([]); setLayers([]); setSelectedLayer(null);
        setTextInput(""); setTextContent(""); setLinkTitle(""); setLinkUrl("");
        setMentionQuery(""); setHashtagInput(""); setLocationQuery("");
        setMentionResults([]); setLocationResults([]); setLocationLoading(false);
        setActiveSlide(0); setActivePanel("media");
        setPreviewMuted(true);
        setDrawHistory([]);
        if (canvasRef.current) {
          const ctx = canvasRef.current.getContext("2d");
          ctx?.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
        }
      }, 220);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  useEffect(() => () => { mediaItems.forEach((m) => URL.revokeObjectURL(m.previewUrl)); }, []); // eslint-disable-line

  /* ── Add files ── */
  const addFiles = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    // Shared-video items cannot be replaced via file picker; clear them first.
    if (mediaItems.some((m) => m.isShared)) {
      setMediaItems([]);
      setActiveSlide(0);
    }
    const hasVideo = mediaItems.filter((m) => !m.isShared).some((m) => m.type === "video") || arr.some((f) => f.type.startsWith("video/"));
    const hasImg   = arr.some((f) => f.type.startsWith("image/"));
    if (hasVideo && (mediaItems.length > 0 || arr.length > 1 || (hasVideo && hasImg))) {
      toast.error("Video stories support only 1 video. Please remove existing media first."); return;
    }
    const newItems: MediaItem[] = [];
    for (const file of arr.slice(0, 10 - mediaItems.length)) {
      const mime = file.type;
      if (!mime.startsWith("image/") && !mime.startsWith("video/")) { toast.error(`Unsupported: ${file.name}`); continue; }
      if (mime.startsWith("video/")) {
        const ok = await new Promise<boolean>((res) => {
          const v = document.createElement("video"); v.preload = "metadata";
          v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); res(v.duration <= 60); };
          v.onerror = () => res(false); v.src = URL.createObjectURL(file);
        });
        if (!ok) { toast.error("Story video must be 60 seconds or less."); continue; }
      }
      newItems.push({ id: uid(), file, previewUrl: URL.createObjectURL(file), type: mime.startsWith("video/") ? "video" : "image" });
    }
    if (!newItems.length) return;
    setMediaItems((prev) => { const next = [...prev, ...newItems]; setActiveSlide(next.length - 1); return next; });
    setStep("upload");
  }, [mediaItems]);

  const removeMedia = (id: string) => {
    setMediaItems((prev) => {
      const i    = prev.findIndex((m) => m.id === id);
      const next = prev.filter((m) => m.id !== id);
      URL.revokeObjectURL(prev[i]?.previewUrl ?? "");
      setActiveSlide(Math.min(activeSlide, Math.max(0, next.length - 1)));
      if (next.length === 0) setStep("pick");
      return next;
    });
    setLayers((prev) => prev.filter((l) => l.slideIndex !== mediaItems.findIndex((m) => m.id === id)));
  };

  /* ── Layer helpers ── */
  function addLayer(patch: Partial<StoryLayer & { localId: string }> & { type: StoryLayer["type"] }) {
    const layer: StoryLayer & { localId: string } = {
      localId: uid(), type: patch.type, text: patch.text ?? "",
      url: patch.url, username: patch.username, userId: patch.userId,
      locationName: patch.locationName, hashtag: patch.hashtag,
      slideIndex: activeSlide, x: 50, y: 50,
      scale: 1, rotation: 0, color: patch.color ?? textColor,
      font: activeFont, zIndex: layers.length,
    };
    setLayers((prev) => [...prev, layer]);
    setSelectedLayer(layer.localId);
  }
  function updateLayer(localId: string, patch: Partial<StoryLayer>) {
    setLayers((prev) => prev.map((l) => l.localId === localId ? { ...l, ...patch } : l));
  }
  function deleteLayer(localId: string) {
    setLayers((prev) => prev.filter((l) => l.localId !== localId));
    setSelectedLayer(null);
  }

  const visibleLayers = useMemo(
    () => layers.filter((l) => l.slideIndex === activeSlide),
    [layers, activeSlide],
  );

  /* ── Mention search ── */
  function handleMentionSearch(q: string) {
    setMentionQuery(q);
    clearTimeout(mentionTimerRef.current);
    if (!q.trim()) { setMentionResults([]); return; }
    mentionTimerRef.current = setTimeout(async () => {
      setMentionLoading(true);
      try { const r = await storyService.searchUsers(q); setMentionResults(r); }
      catch { setMentionResults([]); }
      finally { setMentionLoading(false); }
    }, 300);
  }

  /* ── Location search (OpenStreetMap Nominatim) ── */
  function handleLocationSearch(q: string) {
    setLocationQuery(q);
    clearTimeout(locationTimerRef.current);
    setLocationResults([]);
    if (q.trim().length < 2) return;
    locationTimerRef.current = setTimeout(async () => {
      setLocationLoading(true);
      try {
        const res = await fetch(
          `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&limit=6&addressdetails=0`,
          { headers: { "Accept-Language": "en", "User-Agent": "ReelsooApp/1.0" } }
        );
        const data = await res.json() as { place_id: number; display_name: string }[];
        setLocationResults(data.slice(0, 6));
      } catch { setLocationResults([]); }
      finally { setLocationLoading(false); }
    }, 500);
  }

  /* ── Tool tab ── */
  function activateTool(panel: ToolPanel) {
    const next = activePanel === panel ? "media" : panel;
    setActivePanel(next);
    if (next !== "media") setTimeout(() => createSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 30);
  }

  /* ── Canvas draw handlers ── */
  function onCanvasPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    (e.currentTarget as HTMLCanvasElement).setPointerCapture(e.pointerId);
    const rect = canvas.getBoundingClientRect();
    lastDrawPos.current = {
      x: (e.clientX - rect.left) * (canvas.width / rect.width),
      y: (e.clientY - rect.top)  * (canvas.height / rect.height),
    };
  }

  function onCanvasPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!lastDrawPos.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top)  * (canvas.height / rect.height);
    ctx.globalCompositeOperation = drawTool === "eraser" ? "destination-out" : "source-over";
    ctx.beginPath();
    ctx.moveTo(lastDrawPos.current.x, lastDrawPos.current.y);
    ctx.lineTo(x, y);
    ctx.strokeStyle = drawTool === "eraser" ? "rgba(0,0,0,1)" : drawColor;
    ctx.lineWidth   = brushSize * (canvas.width / rect.width);
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.stroke();
    lastDrawPos.current = { x, y };
  }

  function onCanvasPointerUp() {
    if (!lastDrawPos.current) return;
    lastDrawPos.current = null;
    const canvas = canvasRef.current;
    if (canvas) setDrawHistory(prev => [...prev, canvas.toDataURL()]);
  }

  function undoDraw() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    setDrawHistory(prev => {
      const next = prev.slice(0, -1);
      if (next.length === 0) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      } else {
        const img = new Image();
        img.onload = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0); };
        img.src = next[next.length - 1];
      }
      return next;
    });
  }

  /* ── Merge drawing onto images before upload ── */
  async function getFilesForUpload(): Promise<File[]> {
    const drawCanvas = canvasRef.current;
    const hasDrawings = drawCanvas && drawHistory.length > 0;
    const result: File[] = [];
    for (const item of mediaItems) {
      // Shared-video items are referenced by id - never uploaded as files.
      if (item.isShared || !item.file) continue;
      // Videos pass through unchanged
      if (item.type !== "image") { result.push(item.file); continue; }
      // Always canvas-convert images to JPEG so HEIC/HEIF/AVIF files from iPhones
      // are converted to a format the backend accepts
      try {
        const off = document.createElement("canvas");
        off.width = 360; off.height = 640;
        const ctx = off.getContext("2d")!;
        const img = new Image();
        img.crossOrigin = "anonymous";
        await new Promise<void>((res, rej) => { img.onload = () => res(); img.onerror = rej; img.src = item.previewUrl; });
        if (fillMode === "fill") {
          const s = Math.max(360 / img.naturalWidth, 640 / img.naturalHeight);
          ctx.drawImage(img, (360 - img.naturalWidth * s) / 2, (640 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        } else {
          ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 360, 640);
          const s = Math.min(360 / img.naturalWidth, 640 / img.naturalHeight);
          ctx.drawImage(img, (360 - img.naturalWidth * s) / 2, (640 - img.naturalHeight * s) / 2, img.naturalWidth * s, img.naturalHeight * s);
        }
        if (hasDrawings) ctx.drawImage(drawCanvas, 0, 0);
        const blob = await new Promise<Blob>(res => off.toBlob(b => res(b!), "image/jpeg", 0.92));
        result.push(new File([blob], "story.jpg", { type: "image/jpeg" }));
      } catch { result.push(item.file); }
    }
    return result;
  }

  /* ── Submit ── */
  async function submit() {
    if (mediaItems.length === 0) { toast.error("Add at least one photo or video."); return; }
    setSubmitting(true);
    const visMap: Record<Visibility, Story["visibility"]> = {
      public: "everyone", followers: "followers",
      close_friends: "close_friends", only_me: "only_me",
    };
    const commonParams = {
      visibility:      visMap[visibility],
      allow_replies:   replyMode !== "nobody",
      allow_resharing: true,
      save_to_archive: saveArchive,
      layers:          layers.map(({ localId: _l, ...rest }) => rest),
    };
    try {
      const sharedItem = mediaItems.find((m) => m.isShared && m.sharedId);
      let res: { success: boolean; data: Story; message: string };
      if (sharedItem) {
        // Publish by referencing the original video on the server - no re-upload.
        res = await storyService.createFromSharedVideo({
          video_id: sharedItem.sharedId!,
          ...commonParams,
        });
      } else {
        const files = await getFilesForUpload();
        res = await storyService.create({ files, status: "published", ...commonParams });
      }
      toast.success(res.message);
      void queryClient.invalidateQueries({ queryKey: ["story-feed"] });
      void queryClient.invalidateQueries({ queryKey: ["user-stories"] });
      void queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      onStorySaved?.(res.data);
      onClose();
    } catch (err: unknown) {
      const errData = (err as { response?: { data?: { message?: string; errors?: Record<string, string[]> } } })?.response?.data;
      const fieldError = errData?.errors ? (Object.values(errData.errors).flat()[0] as string | undefined) : null;
      toast.error(fieldError ?? errData?.message ?? "Failed to publish story.");
      // Status + server message only. Logging the raw error object would print
      // err.config.headers.Authorization - the user's live bearer token - plus
      // the whole request body into the browser console.
      const status = (err as { response?: { status?: number } })?.response?.status;
      console.error("[Story publish error]", status ?? "", errData?.message ?? "", errData?.errors);
    } finally { setSubmitting(false); }
  }

  if (!open) return null;

  const activeMedia = mediaItems[activeSlide] ?? null;

  const backdropCss: React.CSSProperties = {
    position: "fixed", inset: 0, zIndex: 1400,
    background: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)", WebkitBackdropFilter: "blur(4px)",
    opacity: animate ? 1 : 0, transition: "opacity 220ms ease",
  };
  const cardCss: React.CSSProperties = {
    position: "fixed", top: "50%", left: "50%", zIndex: 1401,
    transform: animate ? "translate(-50%,-50%) scale(1)" : "translate(-50%,-50%) scale(0.95)",
    opacity: animate ? 1 : 0,
    transition: "opacity 220ms ease, transform 220ms ease",
    background: "white", borderRadius: 24,
    boxShadow: "0 32px 80px rgba(0,0,0,0.22)",
    overflow: "hidden", display: "flex", flexDirection: "column",
  };
  const sectionLabelCss: React.CSSProperties = {
    fontSize: 11, fontWeight: 700, color: "#9ca3af",
    letterSpacing: "0.08em", textTransform: "uppercase", margin: "0 0 10px",
  };

  /* ═══════════════════════════════════
     STEP 1 - Picker
     ══════════════════════════════════ */
  if (step === "pick") {
    return createPortal(
      <>
        <div onClick={onClose} style={backdropCss} />
        <div style={{ ...cardCss, width: "min(580px,94vw)", padding: "28px 28px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 14px 7px 10px", borderRadius: 999, border: "1.5px solid #e5e7eb" }}>
              <Logo mark /><span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>Teezer Story</span>
            </div>
            <button type="button" onClick={onClose} style={{ width: 40, height: 40, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", display: "grid", placeItems: "center", color: "#374151" }}><X size={18} /></button>
          </div>
          <div style={{ textAlign: "center", marginBottom: 28 }}>
            <h2 style={{ fontSize: 36, fontWeight: 800, color: "#111827", margin: "0 0 8px", letterSpacing: "-0.03em", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              Create story <span style={{ color: "#fd4605", fontSize: 28 }}>✦</span>
            </h2>
            <p style={{ fontSize: 14, color: "#6b7280", margin: 0, fontWeight: 500 }}>Share a moment with photos, videos, or a simple text story.</p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px", background: "rgba(253,70,5,0.06)", borderRadius: 20, marginBottom: 12, border: "1.5px solid rgba(253,70,5,0.12)" }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, flexShrink: 0, background: "linear-gradient(135deg,#ff9a44,#fc3a6b)", display: "grid", placeItems: "center" }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect x="3" y="7" width="22" height="18" rx="3" stroke="white" strokeWidth="2"/>
                <circle cx="9" cy="13" r="2.5" stroke="white" strokeWidth="1.8"/>
                <path d="M3 21l6-5 5 4.5 4-3 7 6" stroke="white" strokeWidth="1.8" strokeLinejoin="round"/>
                <circle cx="27" cy="26" r="7" fill="white" fillOpacity="0.95"/>
                <polygon points="25,23 25,29 31,26" fill="#fc3a6b"/>
                <circle cx="21" cy="9" r="5" fill="white" fillOpacity="0.95"/>
                <path d="M21 6.5v5M18.5 9h5" stroke="#fc3a6b" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: "0 0 4px" }}>Upload photo or video</p>
              <p style={{ fontSize: 13, color: "#6b7280", margin: 0, lineHeight: 1.5 }}>Up to 10 photos or 1 video (max 60s).<br/>Add text, links, mentions and more.</p>
            </div>
            <button type="button" onClick={() => fileInputRef.current?.click()}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 22px", borderRadius: 999, background: "#fd4605", border: "none", color: "white", fontSize: 14, fontWeight: 700, cursor: "pointer", flexShrink: 0, whiteSpace: "nowrap", boxShadow: "0 4px 16px rgba(253,70,5,0.35)" }}>
              Select <ChevronRight size={16} />
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 16, padding: "20px", background: "rgba(99,102,241,0.06)", borderRadius: 20, border: "1.5px solid rgba(99,102,241,0.12)" }}>
            <div style={{ width: 72, height: 72, borderRadius: 18, flexShrink: 0, background: "linear-gradient(135deg,#a855f7,#3b82f6)", display: "grid", placeItems: "center" }}>
              <svg width="36" height="36" viewBox="0 0 36 36" fill="none">
                <rect x="5" y="5" width="26" height="26" rx="5" stroke="white" strokeWidth="2" strokeDasharray="4 3"/>
                <path d="M12 13h12M18 13v10" stroke="white" strokeWidth="2.5" strokeLinecap="round"/>
              </svg>
            </div>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 17, fontWeight: 800, color: "#111827", margin: "0 0 10px" }}>Text story</p>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {TEXT_BG_COLORS.slice(0, 4).map((c) => (
                  <button key={c.id} type="button" onClick={() => { setTextBg(c); setStep("text"); }}
                    style={{ width: 32, height: 32, borderRadius: "50%", background: c.bg, border: "none", cursor: "pointer", outline: textBg.id === c.id ? `3px solid ${c.bg}` : "none", outlineOffset: 2 }} />
                ))}
                <button type="button" onClick={() => setStep("text")}
                  style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", display: "grid", placeItems: "center", color: "#374151" }}>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          </div>
          <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm" multiple style={{ display: "none" }}
            onChange={(e) => { if (e.target.files?.length) { void addFiles(e.target.files); e.target.value = ""; } }} />
        </div>
      </>,
      document.body,
    );
  }

  /* ═══════════════════════════════════
     STEP 2a - Text story editor
     ══════════════════════════════════ */
  if (step === "text") {
    return createPortal(
      <>
        <div onClick={onClose} style={backdropCss} />
        <div style={{ ...cardCss, width: "min(480px,94vw)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", borderBottom: "1px solid #f0f0f0" }}>
            <button type="button" onClick={() => setStep("pick")} style={{ display: "flex", alignItems: "center", gap: 6, background: "none", border: "none", cursor: "pointer", color: "#374151", fontSize: 13, fontWeight: 600 }}><ChevronLeft size={16} /> Back</button>
            <h2 style={{ fontSize: 16, fontWeight: 800, color: "#111827", margin: 0 }}>Text Story</h2>
            <button type="button" onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", display: "grid", placeItems: "center", color: "#374151" }}><X size={15} /></button>
          </div>
          <div style={{ width: 200, height: 356, margin: "20px auto", borderRadius: 18, overflow: "hidden", background: textBg.bg, boxShadow: "0 12px 40px rgba(0,0,0,0.2)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <textarea value={textContent} onChange={(e) => setTextContent(e.target.value.slice(0, 150))} placeholder="Type your story…"
              style={{ width: "100%", background: "transparent", border: "none", outline: "none", color: textBg.text, fontSize: 20, fontWeight: 800, textAlign: "center", padding: "0 20px", resize: "none", lineHeight: 1.4, fontFamily: "inherit" }} rows={5} />
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 10, padding: "0 20px 16px" }}>
            {TEXT_BG_COLORS.map((c) => (
              <button key={c.id} type="button" onClick={() => setTextBg(c)}
                style={{ width: 32, height: 32, borderRadius: "50%", background: c.bg, border: "none", cursor: "pointer", outline: textBg.id === c.id ? `3px solid ${c.bg}` : "none", outlineOffset: 2 }} />
            ))}
          </div>
          <div style={{ padding: "12px 20px 20px", borderTop: "1px solid #f0f0f0" }}>
            <button type="button" disabled={submitting || !textContent.trim()} onClick={async () => {
              setSubmitting(true);
              try {
                const res = await storyService.create({ files: [], caption: textContent.trim(), visibility: "everyone", status: "published", layers: [] });
                toast.success(res.message);
                void queryClient.invalidateQueries({ queryKey: ["story-feed"] });
                void queryClient.invalidateQueries({ queryKey: ["user-stories"] });
                void queryClient.invalidateQueries({ queryKey: ["user-profile"] });
                onStorySaved?.(res.data); onClose();
              } catch (err: unknown) {
                const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message;
                toast.error(msg ?? "Failed to publish story.");
                // Status + server message only - never the raw error, which
                // carries the bearer token in err.config.headers.
                const status = (err as { response?: { status?: number } })?.response?.status;
                console.error("[Story publish error]", status ?? "", msg ?? "");
              } finally { setSubmitting(false); }
            }}
              style={{ width: "100%", padding: "14px", borderRadius: 14, border: "none", background: "#fd4605", fontSize: 15, fontWeight: 800, color: "white", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, boxShadow: "0 6px 20px rgba(253,70,5,0.35)", opacity: submitting || !textContent.trim() ? 0.6 : 1 }}>
              <Send size={16} style={{ transform: "rotate(-40deg)" }} /> {submitting ? "Sharing…" : "Share Story"}
            </button>
          </div>
        </div>
      </>,
      document.body,
    );
  }

  /* ═══════════════════════════════════
     STEP 2b - Upload editor
     ══════════════════════════════════ */

  const STICKER_TABS: { panel: ToolPanel; icon: React.ReactNode; label: string }[] = [
    { panel: "text",     icon: <Type size={13} />,   label: "Text" },
    { panel: "link",     icon: <Link2 size={13} />,  label: "Link" },
    { panel: "mention",  icon: <AtSign size={13} />, label: "Mention" },
    { panel: "hashtag",  icon: <Hash size={13} />,   label: "Tag" },
    { panel: "location", icon: <MapPin size={13} />, label: "Location" },
    { panel: "emoji",    icon: <Smile size={13} />,  label: "Emoji" },
    { panel: "draw",     icon: <Pencil size={13} />, label: "Draw" },
  ];

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px", borderRadius: 10,
    border: "1.5px solid #e5e7eb", fontSize: 13, color: "#111827",
    outline: "none", background: "white", fontFamily: "inherit",
  };

  return createPortal(
    <>
      <div onClick={onClose} style={backdropCss} />
      <div style={{ ...cardCss, width: "min(1200px,97vw)", height: "min(880px,96vh)", flexDirection: "row" }}>

        {/* ══ LEFT - Phone preview ══ */}
        <div style={{ width: 430, flexShrink: 0, background: "#f0f2f5", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "16px 0 20px" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div
              ref={previewRef}
              onClick={() => setSelectedLayer(null)}
              onDragOver={(e) => { e.preventDefault(); setDraggingFile(true); }}
              onDragLeave={() => setDraggingFile(false)}
              onDrop={(e) => { e.preventDefault(); setDraggingFile(false); void addFiles(e.dataTransfer.files); }}
              style={{ position: "relative", width: 360, height: 640, borderRadius: 36, overflow: "hidden", background: "#111", flexShrink: 0, border: draggingFile ? "3px solid #fd4605" : "3px solid #1c1c1e", boxShadow: "0 28px 72px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.07)", transition: "border-color 200ms" }}
            >
              {/* Media */}
              {activeMedia ? (
                activeMedia.type === "video" ? (
                  <>
                    <video key={activeMedia.id} src={activeMedia.previewUrl} style={{ width: "100%", height: "100%", objectFit: fillMode === "fill" ? "cover" : "contain" }} autoPlay muted={previewMuted} loop playsInline />
                    {/* Mute toggle - only shown for shared feed videos */}
                    {activeMedia.isShared && (
                      <button
                        type="button"
                        onClick={() => setPreviewMuted((m) => !m)}
                        style={{ position: "absolute", bottom: 16, right: 16, zIndex: 30, width: 36, height: 36, borderRadius: "50%", background: "rgba(0,0,0,0.55)", border: "1.5px solid rgba(255,255,255,0.35)", display: "grid", placeItems: "center", cursor: "pointer", backdropFilter: "blur(4px)" }}
                        title={previewMuted ? "Unmute preview" : "Mute preview"}
                      >
                        {previewMuted
                          ? <VolumeX size={16} color="white" />
                          : <Volume2 size={16} color="white" />}
                      </button>
                    )}
                  </>
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={activeMedia.id} src={activeMedia.previewUrl} alt="preview" style={{ width: "100%", height: "100%", objectFit: fillMode === "fill" ? "cover" : "contain" }} />
                )
              ) : (
                <div onClick={() => fileInputRef.current?.click()} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", background: "linear-gradient(160deg,#1a1a2e,#2d2d44)" }}>
                  <div style={{ width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.08)", display: "grid", placeItems: "center", border: "2px dashed rgba(255,255,255,0.25)" }}>
                    <Plus size={26} color="rgba(255,255,255,0.5)" />
                  </div>
                  <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 12, margin: 0, textAlign: "center", padding: "0 24px" }}>Drag & drop or click to upload</p>
                </div>
              )}

              {/* Slide indicators */}
              <div style={{ position: "absolute", top: 10, left: 10, right: 10, zIndex: 20, display: "flex", gap: 3, pointerEvents: "none" }}>
                {(mediaItems.length > 0 ? mediaItems : [null]).map((_, i) => (
                  <div key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, background: i === activeSlide ? "white" : "rgba(255,255,255,0.3)" }} />
                ))}
              </div>

              {/* Story header */}
              <div style={{ position: "absolute", top: 18, left: 10, right: 10, zIndex: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <div style={{ width: 30, height: 30, borderRadius: "50%", overflow: "hidden", background: "linear-gradient(135deg,#fd4605,#ff6b8a)", display: "grid", placeItems: "center", border: "1.5px solid rgba(255,255,255,0.6)", flexShrink: 0 }}>
                  {userAvatar
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={userAvatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    : <span style={{ color: "white", fontSize: 12, fontWeight: 800 }}>{displayName[0]?.toUpperCase()}</span>}
                </div>
                <span style={{ color: "white", fontSize: 12, fontWeight: 700, textShadow: "0 1px 4px rgba(0,0,0,0.5)" }}>Your Story</span>
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>1m</span>
                <X size={15} color="white" style={{ marginLeft: "auto" }} />
              </div>

              {/* Draggable layers */}
              {visibleLayers.map((layer) => (
                <LayerEl key={layer.localId} layer={layer} isSelected={selectedLayer === layer.localId}
                  previewRef={previewRef} onSelect={() => setSelectedLayer(layer.localId)}
                  onUpdate={(patch) => updateLayer(layer.localId, patch)} onDelete={() => deleteLayer(layer.localId)} />
              ))}

              {/* Live text ghost */}
              {activePanel === "text" && textInput.trim() && (
                <div style={{ position: "absolute", left: "50%", top: "42%", transform: "translate(-50%,-50%)", pointerEvents: "none", zIndex: 50 }}>
                  <span style={{ color: textColor, fontSize: 18, fontWeight: 700, whiteSpace: "nowrap", textShadow: "0 1px 6px rgba(0,0,0,0.6)", opacity: 0.75, ...getFontStyle(activeFont) }}>
                    {textInput}
                  </span>
                </div>
              )}

              {/* Draw canvas overlay */}
              <canvas
                ref={canvasRef}
                width={360}
                height={640}
                style={{ position: "absolute", inset: 0, zIndex: 28, pointerEvents: activePanel === "draw" ? "auto" : "none", cursor: activePanel === "draw" ? (drawTool === "brush" ? "crosshair" : "cell") : "default", touchAction: "none" }}
                onPointerDown={activePanel === "draw" ? onCanvasPointerDown : undefined}
                onPointerMove={activePanel === "draw" ? onCanvasPointerMove : undefined}
                onPointerUp={activePanel === "draw" ? onCanvasPointerUp : undefined}
              />
            </div>

            {/* Thumbnail strip */}
            {mediaItems.length > 0 && mediaItems[0]?.type !== "video" && (
              <div style={{ display: "flex", gap: 6, justifyContent: "center", flexWrap: "wrap", maxWidth: 360 }}>
                {mediaItems.map((m, i) => (
                  <button key={m.id} type="button" onClick={() => setActiveSlide(i)}
                    style={{ width: 40, height: 58, borderRadius: 6, overflow: "hidden", border: i === activeSlide ? "2.5px solid #fd4605" : "2.5px solid transparent", cursor: "pointer", flexShrink: 0, padding: 0 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={m.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </button>
                ))}
                {mediaItems.length < 10 && (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    style={{ width: 40, height: 58, borderRadius: 6, border: "2px dashed #d1d5db", background: "#f9fafb", cursor: "pointer", display: "grid", placeItems: "center", color: "#9ca3af", flexShrink: 0 }}>
                    <Plus size={18} />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ══ RIGHT - Editor panel ══ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>

          {/* Header */}
          <div style={{ padding: "20px 24px 14px", flexShrink: 0, borderBottom: "1px solid #f0f0f0" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              <div>
                <h2 style={{ fontSize: 22, fontWeight: 800, color: "#111827", margin: "0 0 3px", letterSpacing: "-0.02em" }}>Create story</h2>
                <p style={{ fontSize: 13, color: "#9ca3af", margin: 0 }}>
                  {mediaItems.length > 0
                    ? mediaItems[0]?.type === "video"
                      ? (() => {
                          const m = mediaItems[0];
                          const bytes = m.isShared ? (m.sharedSize ?? null) : (m.file?.size ?? null);
                          return `Video story${bytes ? ` · ${(bytes / 1024 / 1024).toFixed(1)} MB` : ""}`;
                        })()
                      : `${mediaItems.length} photo${mediaItems.length > 1 ? "s" : ""} selected`
                    : "No media selected"}
                </p>
              </div>
              <button type="button" onClick={onClose} style={{ width: 36, height: 36, borderRadius: "50%", border: "1.5px solid #e5e7eb", background: "white", cursor: "pointer", display: "grid", placeItems: "center", color: "#374151", flexShrink: 0 }}>
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Scrollable body */}
          <div ref={rightScrollRef} style={{ flex: 1, overflowY: "auto", padding: "16px 24px 12px" }}>

            {/* ── CREATE section - light theme ── */}
            <div ref={createSectionRef} style={{ marginBottom: 20, padding: "14px 16px", background: "#f8f9fb", borderRadius: 16, border: "1px solid #e5e7eb" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#9ca3af", letterSpacing: "0.1em", textTransform: "uppercase", margin: "0 0 2px" }}>CREATE</p>
              <p style={{ fontSize: 12, color: "#6b7280", margin: "0 0 12px", fontWeight: 500 }}>Pick a sticker type, then write</p>

              {/* Sticker tabs */}
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {STICKER_TABS.map(({ panel, icon, label }) => (
                  <button key={panel} type="button" onClick={() => activateTool(panel)}
                    style={{ display: "inline-flex", alignItems: "center", gap: 5, padding: "7px 13px", borderRadius: 999, border: activePanel === panel ? "none" : "1.5px solid #e5e7eb", background: activePanel === panel ? "#111827" : "white", color: activePanel === panel ? "white" : "#374151", fontSize: 13, fontWeight: 600, cursor: "pointer", transition: "all 150ms" }}>
                    {icon} {label}
                  </button>
                ))}
              </div>

              {/* Active sticker form */}
              {activePanel !== "media" && (
                <div style={{ marginTop: 12, padding: "14px", background: "white", borderRadius: 12, border: "1.5px solid #e5e7eb" }}>

                  {/* ── TEXT ── */}
                  {activePanel === "text" && (
                    <div>
                      <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                        <textarea value={textInput} onChange={(e) => setTextInput(e.target.value.slice(0, 80))}
                          placeholder="Write story text" rows={2}
                          style={{ ...inputStyle, flex: 1, resize: "none", lineHeight: 1.5 }}
                          onFocus={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#fd4605"; }}
                          onBlur={(e) => { (e.currentTarget as HTMLTextAreaElement).style.borderColor = "#e5e7eb"; }}
                          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && textInput.trim()) { e.preventDefault(); addLayer({ type: "text", text: textInput, color: textColor, font: activeFont }); setTextInput(""); } }}
                        />
                        <button type="button" disabled={!textInput.trim()}
                          onClick={() => { if (!textInput.trim()) return; addLayer({ type: "text", text: textInput, color: textColor, font: activeFont }); setTextInput(""); }}
                          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: textInput.trim() ? "#fd4605" : "#fca5b5", color: "white", fontWeight: 700, fontSize: 13, cursor: textInput.trim() ? "pointer" : "not-allowed", flexShrink: 0, alignSelf: "flex-start" }}>
                          Add
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 7, marginBottom: 10, flexWrap: "wrap" }}>
                        {TEXT_COLORS.map((c) => (
                          <button key={c} type="button" onClick={() => setTextColor(c)}
                            style={{ width: 26, height: 26, borderRadius: "50%", background: c, border: c === "#ffffff" ? "2px solid #e5e7eb" : "none", cursor: "pointer", outline: textColor === c ? `3px solid ${c === "#ffffff" ? "#d1d5db" : c}` : "none", outlineOffset: 2, transition: "transform 100ms" }}
                            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.15)"; }}
                            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                          />
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {FONTS.map(({ value, label: fl, style: fs }) => (
                          <button key={value} type="button" onClick={() => setActiveFont(value)}
                            style={{ padding: "6px 12px", borderRadius: 8, border: activeFont === value ? "1.5px solid #fd4605" : "1.5px solid #e5e7eb", background: activeFont === value ? "#fff3ec" : "white", color: activeFont === value ? "#fd4605" : "#374151", fontSize: 12, fontWeight: activeFont === value ? 700 : 500, cursor: "pointer", transition: "all 150ms", ...fs }}>
                            {fl}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* ── LINK ── */}
                  {activePanel === "link" && (
                    <div>
                      <input type="text" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value.slice(0, 40))} placeholder="Link label (optional)"
                        style={{ ...inputStyle, marginBottom: 8 }}
                        onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#fd4605"; }}
                        onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#e5e7eb"; }}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <div style={{ flex: 1 }}>
                          <input type="url" value={linkUrl} onChange={(e) => { setLinkUrl(e.target.value); setLinkUrlError(false); }} placeholder="https://example.com"
                            style={{ ...inputStyle, borderColor: linkUrlError ? "#ef4444" : "#e5e7eb" }}
                            onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = linkUrlError ? "#ef4444" : "#fd4605"; }}
                            onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = linkUrlError ? "#ef4444" : "#e5e7eb"; }}
                          />
                          {linkUrlError && <p style={{ fontSize: 11, color: "#ef4444", margin: "4px 0 0" }}>Add a valid URL.</p>}
                        </div>
                        <button type="button" onClick={() => {
                          if (!linkUrl.trim()) { setLinkUrlError(true); return; }
                          const url = linkUrl.startsWith("http") ? linkUrl : `https://${linkUrl}`;
                          if (!isValidUrl(url)) { setLinkUrlError(true); return; }
                          addLayer({ type: "link", text: linkTitle || "Link", url });
                          setLinkTitle(""); setLinkUrl(""); setLinkUrlError(false);
                        }}
                          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "#fd4605", color: "white", fontWeight: 700, fontSize: 13, cursor: "pointer", flexShrink: 0 }}>
                          Add
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ── MENTION ── */}
                  {activePanel === "mention" && (
                    <div>
                      <input type="text" value={mentionQuery} onChange={(e) => handleMentionSearch(e.target.value)} placeholder="Search @username…"
                        style={inputStyle}
                        onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#fd4605"; }}
                        onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#e5e7eb"; }}
                      />
                      {(mentionResults.length > 0 || mentionLoading) && (
                        <div style={{ marginTop: 8, background: "white", border: "1.5px solid #e5e7eb", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                          {mentionLoading && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px" }}>
                              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #fd4605", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Searching users…</p>
                            </div>
                          )}
                          {mentionResults.map((u) => (
                            <button key={u.id} type="button"
                              onClick={() => { addLayer({ type: "mention", text: u.username, username: u.username, userId: u.id }); setMentionQuery(""); setMentionResults([]); }}
                              style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "white", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid #f3f4f6", transition: "background 100ms" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fff8f9"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}>
                              <div style={{ width: 36, height: 36, borderRadius: "50%", overflow: "hidden", flexShrink: 0, background: "linear-gradient(135deg,#fd4605,#b83203)", display: "grid", placeItems: "center" }}>
                                {u.avatar
                                  // eslint-disable-next-line @next/next/no-img-element
                                  ? <img src={u.avatar} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                                  : <span style={{ fontSize: 13, fontWeight: 700, color: "white" }}>{(u.name || u.username)[0]?.toUpperCase()}</span>}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.name}</p>
                                <p style={{ fontSize: 11, color: "#9ca3af", margin: 0 }}>@{u.username}</p>
                              </div>
                              <AtSign size={14} color="#fd4605" style={{ flexShrink: 0 }} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── HASHTAG ── */}
                  {activePanel === "hashtag" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <input type="text" value={hashtagInput} onChange={(e) => setHashtagInput(e.target.value.replace(/\s/g, "").slice(0, 50))} placeholder="trending, travel, teezer…"
                        style={{ ...inputStyle, flex: 1 }}
                        onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#fd4605"; }}
                        onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#e5e7eb"; }}
                        onKeyDown={(e) => { if (e.key === "Enter" && hashtagInput.trim()) { addLayer({ type: "hashtag", text: hashtagInput.replace(/^#+/, ""), hashtag: hashtagInput.replace(/^#+/, "") }); setHashtagInput(""); } }}
                      />
                      <button type="button" disabled={!hashtagInput.trim()}
                        onClick={() => { if (!hashtagInput.trim()) return; addLayer({ type: "hashtag", text: hashtagInput.replace(/^#+/, ""), hashtag: hashtagInput.replace(/^#+/, "") }); setHashtagInput(""); }}
                        style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: hashtagInput.trim() ? "#fd4605" : "#fca5b5", color: "white", fontWeight: 700, fontSize: 13, cursor: hashtagInput.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}>
                        Add
                      </button>
                    </div>
                  )}

                  {/* ── LOCATION ── */}
                  {activePanel === "location" && (
                    <div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <input type="text" value={locationQuery} onChange={(e) => handleLocationSearch(e.target.value.slice(0, 100))} placeholder="Search a place, city, or country…"
                          style={{ ...inputStyle, flex: 1 }}
                          onFocus={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#fd4605"; }}
                          onBlur={(e) => { (e.currentTarget as HTMLInputElement).style.borderColor = "#e5e7eb"; }}
                          onKeyDown={(e) => { if (e.key === "Enter" && locationQuery.trim()) { addLayer({ type: "location", text: locationQuery, locationName: locationQuery }); setLocationQuery(""); setLocationResults([]); } }}
                        />
                        <button type="button" disabled={!locationQuery.trim()}
                          onClick={() => { if (!locationQuery.trim()) return; addLayer({ type: "location", text: locationQuery, locationName: locationQuery }); setLocationQuery(""); setLocationResults([]); }}
                          style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: locationQuery.trim() ? "#fd4605" : "#fca5b5", color: "white", fontWeight: 700, fontSize: 13, cursor: locationQuery.trim() ? "pointer" : "not-allowed", flexShrink: 0 }}>
                          Add
                        </button>
                      </div>
                      {(locationResults.length > 0 || locationLoading) && (
                        <div style={{ marginTop: 8, background: "white", border: "1.5px solid #e5e7eb", borderRadius: 12, boxShadow: "0 4px 16px rgba(0,0,0,0.08)", overflow: "hidden" }}>
                          {locationLoading && (
                            <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 14px" }}>
                              <div style={{ width: 16, height: 16, borderRadius: "50%", border: "2px solid #fd4605", borderTopColor: "transparent", animation: "spin 0.7s linear infinite" }} />
                              <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>Searching locations…</p>
                            </div>
                          )}
                          {locationResults.map((loc) => {
                            const parts = loc.display_name.split(",");
                            const main  = parts[0]?.trim() ?? loc.display_name;
                            const sub   = parts.slice(1, 3).join(",").trim();
                            return (
                              <button key={loc.place_id} type="button"
                                onClick={() => { addLayer({ type: "location", text: main, locationName: main }); setLocationQuery(main); setLocationResults([]); }}
                                style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: "white", border: "none", cursor: "pointer", textAlign: "left", borderBottom: "1px solid #f3f4f6", transition: "background 100ms" }}
                                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#fff8f9"; }}
                                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; }}>
                                <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#fff3ec", flexShrink: 0, display: "grid", placeItems: "center", fontSize: 16 }}>📍</div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 1px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{main}</p>
                                  {sub && <p style={{ fontSize: 11, color: "#9ca3af", margin: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</p>}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}

                  {/* ── EMOJI ── */}
                  {activePanel === "emoji" && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {EMOJI_LIST.map((e) => (
                        <button key={e} type="button" onClick={() => addLayer({ type: "emoji", text: e })}
                          style={{ width: 40, height: 40, borderRadius: 10, border: "1.5px solid #e5e7eb", background: "white", fontSize: 20, cursor: "pointer", display: "grid", placeItems: "center", transition: "all 120ms" }}
                          onMouseEnter={(el) => { (el.currentTarget as HTMLButtonElement).style.background = "#f8f9fb"; (el.currentTarget as HTMLButtonElement).style.transform = "scale(1.1)"; }}
                          onMouseLeave={(el) => { (el.currentTarget as HTMLButtonElement).style.background = "white"; (el.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}>
                          {e}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── DRAW ── */}
                  {activePanel === "draw" && (
                    <div>
                      {/* Brush / Eraser */}
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <button type="button" onClick={() => setDrawTool("brush")}
                          style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${drawTool === "brush" ? "#fd4605" : "#e5e7eb"}`, background: drawTool === "brush" ? "#fff3ec" : "white", color: drawTool === "brush" ? "#fd4605" : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 150ms" }}>
                          🖌️ Brush
                        </button>
                        <button type="button" onClick={() => setDrawTool("eraser")}
                          style={{ flex: 1, padding: "10px", borderRadius: 10, border: `2px solid ${drawTool === "eraser" ? "#fd4605" : "#e5e7eb"}`, background: drawTool === "eraser" ? "#fff3ec" : "white", color: drawTool === "eraser" ? "#fd4605" : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, transition: "all 150ms" }}>
                          🧹 Eraser
                        </button>
                      </div>

                      {/* Color palette */}
                      {drawTool === "brush" && (
                        <div style={{ display: "flex", gap: 8, marginBottom: 10, flexWrap: "wrap" }}>
                          {DRAW_COLORS.map(c => (
                            <button key={c} type="button" onClick={() => setDrawColor(c)}
                              style={{ width: 30, height: 30, borderRadius: "50%", background: c, border: c === "#ffffff" ? "2px solid #e5e7eb" : "2px solid transparent", cursor: "pointer", outline: drawColor === c ? "3px solid #fd4605" : "none", outlineOffset: 2, flexShrink: 0, transition: "transform 100ms" }}
                              onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1.15)"; }}
                              onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.transform = "scale(1)"; }}
                            />
                          ))}
                        </div>
                      )}

                      {/* Instruction */}
                      <p style={{ fontSize: 11, color: "#9ca3af", margin: "0 0 10px", fontStyle: "italic" }}>
                        {drawTool === "brush" ? "Draw on the preview with your mouse." : "Drag on the preview to erase."}
                      </p>

                      {/* Size slider */}
                      <div style={{ marginBottom: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                          <span style={{ fontSize: 11, color: "#6b7280", fontWeight: 600 }}>{drawTool === "brush" ? "Brush" : "Eraser"} size</span>
                          <span style={{ fontSize: 11, color: "#374151", fontWeight: 700 }}>{brushSize}px</span>
                        </div>
                        <input type="range" min={2} max={40} value={brushSize} onChange={e => setBrushSize(+e.target.value)}
                          style={{ width: "100%", accentColor: "#fd4605", cursor: "pointer" }}
                        />
                      </div>

                      {/* Undo */}
                      <button type="button" disabled={drawHistory.length === 0} onClick={undoDraw}
                        style={{ width: "100%", padding: "9px", borderRadius: 10, border: "1.5px solid #e5e7eb", background: drawHistory.length > 0 ? "white" : "#f9fafb", color: drawHistory.length > 0 ? "#374151" : "#d1d5db", fontSize: 13, fontWeight: 600, cursor: drawHistory.length > 0 ? "pointer" : "default", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
                        ↩ Undo last stroke
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* ── MEDIA ── */}
            <div ref={mediaSectionRef} style={{ marginBottom: 20 }}>
              <p style={sectionLabelCss}>Media</p>
              {activeMedia ? (
                <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", border: "1.5px solid #e5e7eb", borderRadius: 14, marginBottom: 12, background: "#fafafa" }}>
                  <div style={{ width: 56, height: 56, borderRadius: 10, overflow: "hidden", flexShrink: 0, background: "#e5e7eb" }}>
                    {activeMedia.type === "video"
                      ? <video src={activeMedia.previewUrl} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
                      // eslint-disable-next-line @next/next/no-img-element
                      : <img src={activeMedia.previewUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {activeMedia.isShared ? (
                      <>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 2px" }}>Shared video</p>
                        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>
                          {activeMedia.sharedSize ? `${(activeMedia.sharedSize / 1024 / 1024).toFixed(2)} MB` : "Feed video"}
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ fontSize: 13, fontWeight: 700, color: "#111827", margin: "0 0 2px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{activeMedia.file?.name ?? ""}</p>
                        <p style={{ fontSize: 12, color: "#9ca3af", margin: 0 }}>{((activeMedia.file?.size ?? 0) / 1024 / 1024).toFixed(2)} MB</p>
                      </>
                    )}
                  </div>
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 12px", borderRadius: 9, border: "1.5px solid #e5e7eb", background: "white", fontSize: 12, fontWeight: 600, color: "#374151", cursor: "pointer", flexShrink: 0 }}>
                    <RefreshCw size={11} /> Replace
                  </button>
                  <button type="button" onClick={() => removeMedia(activeMedia.id)}
                    style={{ width: 34, height: 34, borderRadius: 9, border: "1.5px solid #fee2e2", background: "#fff5f5", cursor: "pointer", display: "grid", placeItems: "center", flexShrink: 0 }}>
                    <Trash2 size={14} color="#ef4444" />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => fileInputRef.current?.click()}
                  style={{ width: "100%", padding: "20px", borderRadius: 14, border: "2px dashed #e5e7eb", background: "#fafafa", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, color: "#9ca3af", fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                  <ImagePlus size={18} /> Click to select photos or video
                </button>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                {(["fill", "fit"] as FillMode[]).map((mode) => (
                  <button key={mode} type="button" onClick={() => setFillMode(mode)}
                    style={{ flex: 1, padding: "9px 0", borderRadius: 10, border: fillMode === mode ? "1.5px solid #fd4605" : "1.5px solid #e5e7eb", background: fillMode === mode ? "#fff3ec" : "white", fontSize: 13, fontWeight: fillMode === mode ? 700 : 500, color: fillMode === mode ? "#fd4605" : "#374151", cursor: "pointer", transition: "all 150ms", textTransform: "capitalize" }}>
                    {mode}
                  </button>
                ))}
              </div>
            </div>

            {/* ── SETTINGS ── */}
            <div style={{ background: "#f8f9fb", borderRadius: 16, padding: "14px", marginBottom: 8, border: "1px solid #e5e7eb" }}>
              <p style={{ ...sectionLabelCss, marginBottom: 14 }}>Story settings</p>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                <div>
                  <p style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, margin: "0 0 6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>Privacy</p>
                  <CustomDropdown
                    value={visibility}
                    onChange={(v) => setVisibility(v as Visibility)}
                    options={PRIVACY_OPTIONS}
                  />
                </div>
                <div>
                  <p style={{ fontSize: 11, color: "#6b7280", fontWeight: 700, margin: "0 0 6px", letterSpacing: "0.04em", textTransform: "uppercase" }}>Replies</p>
                  <CustomDropdown
                    value={replyMode}
                    onChange={(v) => setReplyMode(v as ReplyMode)}
                    options={REPLY_OPTIONS}
                  />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: 0 }}>Save to archive</p>
                  <Toggle checked={saveArchive} onChange={setSaveArchive} />
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <p style={{ fontSize: 12, fontWeight: 600, color: "#111827", margin: 0 }}>High quality</p>
                  <Toggle checked={highQuality} onChange={setHighQuality} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Footer ── */}
          <div style={{ padding: "14px 24px 20px", borderTop: "1px solid #f0f0f0", flexShrink: 0 }}>
            <button type="button" disabled={submitting || mediaItems.length === 0} onClick={() => void submit()}
              style={{
                width: "100%", padding: "16px",
                borderRadius: 16, border: "none",
                background: submitting || mediaItems.length === 0
                  ? "linear-gradient(135deg,#fca5b5,#fca5b5)"
                  : "linear-gradient(135deg,#fd4605 0%,#e01945 60%,#c01038 100%)",
                fontSize: 16, fontWeight: 800, color: "white",
                letterSpacing: "-0.01em",
                cursor: submitting || mediaItems.length === 0 ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                boxShadow: mediaItems.length > 0 && !submitting
                  ? "0 8px 28px rgba(253,70,5,0.45), 0 2px 8px rgba(253,70,5,0.2)"
                  : "none",
                transition: "all 200ms",
              }}>
              <Send size={18} strokeWidth={2.5} style={{ transform: "rotate(-40deg)" }} />
              {submitting ? "Publishing…" : "Publish Story"}
            </button>
          </div>
        </div>
      </div>

      <input ref={fileInputRef} type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/quicktime,video/webm"
        multiple style={{ display: "none" }}
        onChange={(e) => { if (e.target.files?.length) { void addFiles(e.target.files); e.target.value = ""; } }} />
    </>,
    document.body,
  );
}
