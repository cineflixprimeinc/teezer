"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { CommentSection } from "./comment-section";
import { cn } from "@/lib/utils";

type Props = {
  videoId:                 number;
  videoOwnerId?:           number;
  allowComments?:          boolean;
  initialCount?:           number;   // video.comments_count from parent - used until API responds
  onClose:                 () => void;
  onCommentPosted?:        () => void;
  onCommentCountChange?:   (delta: number) => void;
  onVisibleCountLoaded?:   (count: number) => void; // called when API returns authoritative count
};

export function VideoCommentsDrawer({ videoId, videoOwnerId, allowComments = true, initialCount, onClose, onCommentPosted, onCommentCountChange, onVisibleCountLoaded }: Props) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const id = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Start with whatever the feed has; replace with authoritative API count on load.
  const [count, setCount] = useState<number>(initialCount ?? 0);

  function handleVisibleCountLoaded(visibleCount: number) {
    setCount(visibleCount);
    onVisibleCountLoaded?.(visibleCount);
  }

  function handleCommentCountChange(delta: number) {
    setCount((p) => Math.max(0, p + delta));
    onCommentCountChange?.(delta);
    if (!onCommentCountChange && delta > 0) onCommentPosted?.();
  }

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[1100] flex justify-end transition-colors duration-300",
        mounted ? "bg-black/40" : "bg-black/0",
      )}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className={cn(
          "flex h-full w-full max-w-[420px] flex-col bg-white shadow-2xl transition-transform duration-300 ease-out",
          mounted ? "translate-x-0" : "translate-x-full",
        )}
        role="dialog"
        aria-label="Comments"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-[#eeeeee] px-4 py-3">
          <h2 className="flex-1 text-[15px] font-bold text-black">
            {`Comments · ${count}`}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] hover:bg-[#f8f9fb] hover:text-black transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Comment section fills remaining height */}
        <CommentSection
          videoId={videoId}
          videoOwnerId={videoOwnerId}
          allowComments={allowComments}
          onVisibleCountLoaded={handleVisibleCountLoaded}
          onCommentCountChange={handleCommentCountChange}
          className="flex-1 min-h-0"
        />
      </div>
    </div>,
    document.body,
  );
}
