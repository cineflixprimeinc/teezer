"use client";

import { useRef, useState } from "react";
import {
  ChevronLeft, ChevronRight, Images, Image as ImageIcon,
  Pause, Play, UploadCloud, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { MediaType, VideoProbe } from "./types";

const MAX_CAROUSEL_IMAGES = 10;

type Props = {
  /* single file (video or single image) */
  file:          File | null;
  previewUrl:    string | null;
  probe:         VideoProbe | null;
  mediaType:     MediaType | null;
  uploading:     boolean;
  progress:      number;
  uploadedBytes: number;
  etaSeconds:    number | null;
  /* carousel */
  files:         File[];
  previewUrls:   string[];
  onPick:        (file: File | null) => void;
  onPickMultiple:(files: File[]) => void;
  onClear:       () => void;
};

const ACCEPT_SINGLE = [
  "video/mp4", "video/quicktime", "video/x-msvideo", "video/webm",
  "image/jpeg", "image/jpg", "image/png",
  ".mp4", ".mov", ".avi", ".webm", ".jpg", ".jpeg", ".png",
].join(",");

const ACCEPT_MULTI = ["image/jpeg", "image/jpg", "image/png", ".jpg", ".jpeg", ".png"].join(",");

function fmtTime(sec: number) {
  const s  = Math.max(0, Math.round(sec));
  const mm = Math.floor(s / 60).toString().padStart(2, "0");
  const ss = (s % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}
function fmtMB(bytes: number) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function VideoDropzone({
  file, previewUrl, probe, mediaType, uploading, progress, uploadedBytes, etaSeconds,
  files, previewUrls,
  onPick, onPickMultiple, onClear,
}: Props) {
  const videoRef    = useRef<HTMLVideoElement>(null);
  const [dragOver,  setDragOver]  = useState(false);
  const [playing,   setPlaying]   = useState(false);
  const [carouselIdx, setCarouselIdx] = useState(0);

  const isCarousel = mediaType === "image_carousel" && files.length > 1;

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragOver(false);
    const dropped = Array.from(e.dataTransfer.files ?? []);
    if (dropped.length > 1) {
      onPickMultiple(dropped);
    } else {
      const f = dropped[0];
      if (f) onPick(f);
    }
  }

  function togglePlay() {
    const el = videoRef.current;
    if (!el) return;
    if (el.paused) el.play().catch(() => {});
    else el.pause();
  }

  /* ── Empty state ──────────────────────────────────────────────────── */
  if (!file && !previewUrl && files.length === 0) {
    return (
      <div className="flex h-full w-full flex-col gap-2">
        <label
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          className={cn(
            "flex flex-1 w-full cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed bg-white text-center transition",
            dragOver
              ? "border-[#fd4605] bg-[#fff0f3]"
              : "border-[#fd4605]/40 hover:border-[#fd4605] hover:bg-[#fff7f9]",
          )}
        >
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#fff0f3]">
            <UploadCloud className="h-6 w-6 text-[#fd4605]" />
          </div>
          <p className="mt-2.5 text-sm font-bold text-black">Upload your video</p>
          <p className="mt-0.5 text-xs leading-snug text-[#5f6675]">
            Drag & drop your video here, or{" "}
            <span className="text-[#fd4605] font-semibold">browse</span>
          </p>
          <p className="mt-2 text-[10px] text-[#9aa1ad]">
            MP4, MOV, WebM or AVI &bull; Max 3GB &bull; Up to 60s
          </p>
          <input
            type="file"
            accept={ACCEPT_SINGLE}
            className="hidden"
            onChange={(e) => onPick(e.target.files?.[0] ?? null)}
          />
        </label>

        {/* Carousel upload option */}
        <label className="flex cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#fd4605]/30 bg-white py-2.5 text-[11px] font-semibold text-[#fd4605] transition hover:border-[#fd4605] hover:bg-[#fff7f9] flex-shrink-0">
          <Images className="h-4 w-4" />
          Upload photo carousel (up to {MAX_CAROUSEL_IMAGES} images)
          <input
            type="file"
            accept={ACCEPT_MULTI}
            multiple
            className="hidden"
            onChange={(e) => {
              const picked = Array.from(e.target.files ?? []);
              if (picked.length > 0) onPickMultiple(picked);
            }}
          />
        </label>
      </div>
    );
  }

  const totalBytes     = (isCarousel ? files.reduce((s, f) => s + f.size, 0) : file?.size) ?? 0;
  const remainingBytes = Math.max(0, totalBytes - uploadedBytes);
  const duration       = probe?.duration ?? 0;

  /* ── Carousel preview ─────────────────────────────────────────────── */
  if (isCarousel) {
    const idx = Math.min(carouselIdx, previewUrls.length - 1);
    const safeIdx = Math.max(0, idx);

    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-dashed border-[#fd4605]/40 bg-white p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-[#f8f9fb]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrls[safeIdx]}
            alt={`Image ${safeIdx + 1} of ${files.length}`}
            className="h-full w-full object-contain"
          />

          {/* Navigation arrows */}
          {safeIdx > 0 && (
            <button
              type="button"
              onClick={() => setCarouselIdx((i) => Math.max(0, i - 1))}
              aria-label="Previous image"
              className="absolute left-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
          )}
          {safeIdx < previewUrls.length - 1 && (
            <button
              type="button"
              onClick={() => setCarouselIdx((i) => Math.min(previewUrls.length - 1, i + 1))}
              aria-label="Next image"
              className="absolute right-2 top-1/2 -translate-y-1/2 grid h-8 w-8 place-items-center rounded-full bg-black/50 text-white backdrop-blur-sm hover:bg-black/70"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          )}

          {/* Counter */}
          <span className="absolute right-2 top-2 rounded-md bg-black/60 px-2 py-0.5 text-[10px] font-semibold text-white">
            {safeIdx + 1} / {files.length}
          </span>

          {/* Clear */}
          <button
            type="button"
            onClick={onClear}
            aria-label="Remove all images"
            className="absolute left-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Thumbnail strip */}
        <div className="mt-2 flex flex-shrink-0 gap-1.5 overflow-x-auto pb-0.5">
          {previewUrls.map((url, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setCarouselIdx(i)}
              className={cn(
                "relative h-11 w-11 flex-shrink-0 overflow-hidden rounded-lg border-2 transition",
                i === safeIdx ? "border-[#fd4605]" : "border-transparent opacity-60 hover:opacity-100",
              )}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Thumb ${i + 1}`} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>

        {/* File info */}
        <div className="mt-1.5 flex-shrink-0 flex items-center gap-1.5 text-[10px] text-[#5f6675]">
          <Images className="h-3 w-3 text-[#fd4605]" />
          <span className="font-semibold text-black">{files.length} images</span>
          <span>·</span>
          <span>{fmtMB(totalBytes)} total</span>
        </div>

        {uploading && (
          <div className="mt-2 flex-shrink-0">
            <div className="h-1 overflow-hidden rounded-full bg-[#fde0e6]">
              <div className="h-full rounded-full bg-[#fd4605] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-[#5f6675]">
              <span>Uploading… {progress}%</span>
              <span>
                {fmtMB(uploadedBytes)} / {fmtMB(totalBytes)}
                {etaSeconds != null && remainingBytes > 0 ? ` · ${fmtTime(etaSeconds)} left` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  const isImage = mediaType === "image";

  /* ── Single image preview ─────────────────────────────────────────── */
  if (isImage && previewUrl) {
    return (
      <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-dashed border-[#fd4605]/40 bg-white p-3">
        <div className="relative min-h-0 flex-1 overflow-hidden rounded-xl bg-[#f8f9fb]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt="Preview" className="h-full w-full object-contain" />

          <button
            type="button"
            onClick={onClear}
            aria-label="Remove image"
            className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/80"
          >
            <X className="h-3.5 w-3.5" />
          </button>

          <div className="absolute bottom-2 left-2 flex items-center gap-1.5 rounded-md bg-black/60 px-2 py-1 text-[10px] font-semibold text-white backdrop-blur-sm">
            <ImageIcon className="h-3 w-3" />
            {fmtMB(file?.size ?? 0)} · {(file?.name.split(".").pop() ?? "img").toUpperCase()}
          </div>
        </div>

        {uploading && (
          <div className="mt-2">
            <div className="h-1 overflow-hidden rounded-full bg-[#fde0e6]">
              <div className="h-full rounded-full bg-[#fd4605] transition-[width]" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-1 flex items-center justify-between text-[10px] text-[#5f6675]">
              <span>Uploading… {progress}%</span>
              <span>
                {fmtMB(uploadedBytes)} / {fmtMB(totalBytes)}
                {etaSeconds != null && remainingBytes > 0 ? ` · ${fmtTime(etaSeconds)} left` : ""}
              </span>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Video preview ────────────────────────────────────────────────── */
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border-2 border-dashed border-[#fd4605]/40 bg-white p-3">
      <div
        className="relative mx-auto h-full w-auto overflow-hidden rounded-xl bg-black"
        style={{ aspectRatio: "9 / 16" }}
      >
        <video
          ref={videoRef}
          src={previewUrl ?? undefined}
          className="h-full w-full object-cover"
          muted
          playsInline
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
          onEnded={() => setPlaying(false)}
        />

        <button
          type="button"
          onClick={togglePlay}
          aria-label={playing ? "Pause" : "Play"}
          className="absolute inset-0 grid place-items-center"
        >
          <span className={cn("grid h-12 w-12 place-items-center rounded-full bg-white/30 backdrop-blur-sm transition", playing && "opacity-0")}>
            {playing
              ? <Pause className="h-5 w-5 text-white" />
              : <Play className="ml-0.5 h-5 w-5 text-white" />}
          </span>
        </button>

        <button
          type="button"
          onClick={onClear}
          aria-label="Remove video"
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm hover:bg-black/80"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        {duration > 0 && (
          <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            {fmtTime(duration)}
          </span>
        )}
      </div>

      {uploading && (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded-full bg-[#fde0e6]">
            <div className="h-full rounded-full bg-[#fd4605] transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-1 flex items-center justify-between text-[10px] text-[#5f6675]">
            <span>Uploading… {progress}%</span>
            <span>
              {fmtMB(uploadedBytes)} / {fmtMB(totalBytes)}
              {etaSeconds != null && remainingBytes > 0 ? ` · ${fmtTime(etaSeconds)} left` : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
