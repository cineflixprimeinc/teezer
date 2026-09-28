"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  Bookmark, Captions, ChevronRight, Flag, Gauge, HeartOff, MousePointer2, Sparkles,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUiStore, type VideoQuality, type PlaybackSpeed } from "@/store/ui.store";

type Anchor = HTMLElement | null;

type Props = {
  anchorRef: React.RefObject<Anchor>;
  open:      boolean;
  onClose:   () => void;
  onNotInterested: () => void;
  onReport:        () => void;
  onSave?:   () => void;
  isSaved?:  boolean;
  /** Quality / Playback speed / Captions only make sense for video.
      Images, carousels and text posts hide these rows. Defaults to true. */
  showPlaybackControls?: boolean;
};

const QUALITY_LABEL: Record<VideoQuality, string> = {
  auto: "Auto", "4k": "4K", "1080": "1080p", "720": "720p", "480": "480p", "360": "360p",
};

export function VideoOptionsMenu({ anchorRef, open, onClose, onNotInterested, onReport, onSave, isSaved, showPlaybackControls = true }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const {
    autoScroll, quality, setAutoScroll, setQuality,
    captionsEnabled, setCaptionsEnabled,
    playbackSpeed, setPlaybackSpeed,
  } = useUiStore();
  const [showQuality, setShowQuality] = useState(false);
  const [showSpeed,   setShowSpeed]   = useState(false);

  // Position menu under the anchor's bottom-right corner
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const a = anchorRef.current;
      if (!a) return;
      const r = a.getBoundingClientRect();
      // 250px wide menu - flush to anchor's right edge
      setCoords({ top: r.bottom + 6, left: r.right - 250 });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, anchorRef]);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (menuRef.current?.contains(t)) return;
      if (anchorRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose, anchorRef]);

  if (!open || !coords) return null;

  const qualities: VideoQuality[] = ["auto", "4k", "1080", "720", "480"];
  const speeds: PlaybackSpeed[]   = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
  const speedLabel = (s: PlaybackSpeed) => s === 1 ? "Normal" : `${s}×`;

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      style={{ position: "fixed", top: coords.top, left: coords.left, width: 250, zIndex: 1000 }}
      className="rounded-2xl border border-[#eeeeee] bg-white p-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.18)]"
    >
      {!showQuality && !showSpeed ? (
        <>
          {showPlaybackControls && (
            <>
              <Row
                icon={Sparkles}
                label="Quality"
                value={QUALITY_LABEL[quality]}
                onClick={() => setShowQuality(true)}
                trailing="chevron"
              />
              <Row
                icon={Gauge}
                label="Playback speed"
                value={speedLabel(playbackSpeed)}
                onClick={() => setShowSpeed(true)}
                trailing="chevron"
              />
              <Row
                icon={Captions}
                label="Captions"
                value={captionsEnabled ? "On" : undefined}
                onClick={() => setCaptionsEnabled(!captionsEnabled)}
              />
            </>
          )}
          <Row
            icon={MousePointer2}
            label="Auto scroll"
            toggle={autoScroll}
            onToggle={() => setAutoScroll(!autoScroll)}
          />
          {onSave && (
            <Row
              icon={Bookmark}
              label={isSaved ? "Unsave" : "Save"}
              active={isSaved}
              onClick={() => { onSave(); onClose(); }}
            />
          )}
          <Divider />
          <Row
            icon={HeartOff}
            label="Not interested"
            onClick={() => { onNotInterested(); onClose(); }}
          />
          <Row
            icon={Flag}
            label="Report content"
            onClick={() => { onReport(); onClose(); }}
          />
        </>
      ) : showQuality ? (
        <>
          <button
            type="button"
            onClick={() => setShowQuality(false)}
            className="mb-1 flex w-full items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold text-[#5f6675] hover:bg-[#f8f9fb]"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Quality
          </button>
          {qualities.map((q) => (
            <Row
              key={q}
              icon={Sparkles}
              label={QUALITY_LABEL[q]}
              active={q === quality}
              onClick={() => { setQuality(q); setShowQuality(false); }}
            />
          ))}
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={() => setShowSpeed(false)}
            className="mb-1 flex w-full items-center gap-1 rounded-[10px] px-2.5 py-1.5 text-[12px] font-semibold text-[#5f6675] hover:bg-[#f8f9fb]"
          >
            <ChevronRight className="h-3.5 w-3.5 rotate-180" />
            Playback speed
          </button>
          {speeds.map((s) => (
            <Row
              key={s}
              icon={Gauge}
              label={speedLabel(s)}
              active={s === playbackSpeed}
              onClick={() => { setPlaybackSpeed(s); setShowSpeed(false); }}
            />
          ))}
        </>
      )}
    </div>,
    document.body,
  );
}

/* ── primitives ─────────────────────────────────────────────────────────── */

function Row({
  icon: Icon, label, value, toggle, onToggle, onClick, active, trailing,
}: {
  icon: LucideIcon;
  label: string;
  value?: string;
  toggle?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  active?: boolean;
  trailing?: "chevron";
}) {
  const handle = () => {
    if (onToggle) { onToggle(); return; }
    onClick?.();
  };
  return (
    <button
      type="button"
      onClick={handle}
      className={cn(
        "flex h-11 w-full items-center gap-3 rounded-[10px] px-2.5 text-left text-[14px] font-semibold transition",
        active ? "bg-[#fff0f4] text-[#fe2c55]" : "text-black hover:bg-[#f8f9fb]",
      )}
    >
      <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", active ? "text-[#fe2c55]" : "text-[#1f2937]")} />
      <span className="flex-1 truncate">{label}</span>
      {value && <span className="text-[12px] font-semibold text-[#5f6675]">{value}</span>}
      {trailing === "chevron" && <ChevronRight className="h-3.5 w-3.5 text-[#9aa1ad]" />}
      {typeof toggle === "boolean" && (
        <span
          role="switch"
          aria-checked={toggle}
          className={cn(
            "relative inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition",
            toggle ? "bg-[#fe2c55]" : "bg-[#e5e7eb]",
          )}
        >
          <span
            className={cn(
              "inline-block h-4 w-4 transform rounded-full bg-white shadow transition",
              toggle ? "translate-x-[18px]" : "translate-x-[2px]",
            )}
          />
        </span>
      )}
    </button>
  );
}

function Divider() {
  return <div className="my-1 mx-1.5 border-t border-[#eeeeee]" />;
}

