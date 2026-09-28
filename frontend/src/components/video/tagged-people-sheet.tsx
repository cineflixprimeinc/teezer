"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { ChevronRight, User as UserIcon, X } from "lucide-react";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import type { TaggedUser } from "@/types/video";

type PostKind = "video" | "photo" | "post";

type Props = {
  open: boolean;
  onClose: () => void;
  users: TaggedUser[];
  kind: PostKind;
  /** Ref of the video card element - sheet will be clipped to its bounds */
  cardRef?: React.RefObject<HTMLElement | null>;
  /** Overrides TITLES[kind] below - e.g. "Collab partners" for the paid-
   *  collaboration list, which reuses this same sheet. Every existing
   *  caller omits this and keeps the kind-based title unchanged. */
  title?: string;
};

const TITLES: Record<PostKind, string> = {
  video: "Tagged in this video",
  photo: "Tagged in this photo",
  post:  "Tagged in this post",
};

function avatarColor(seed: string): string {
  const palette = ["#fe2c55", "#1d8cff", "#a855f7", "#10b981", "#f97316", "#8b5cf6"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return palette[Math.abs(h) % palette.length];
}

export function TaggedPeopleSheet({ open, onClose, users, kind, cardRef, title }: Props) {
  const sheetTitle = title ?? TITLES[kind];
  const [rect, setRect] = useState<DOMRect | null>(null);

  /* Recalculate card bounds whenever the sheet opens or window resizes */
  useEffect(() => {
    function measure() {
      if (cardRef?.current) {
        setRect(cardRef.current.getBoundingClientRect());
      } else {
        setRect(null);
      }
    }
    if (open) measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [open, cardRef]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  /* Lock body scroll while open */
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  if (typeof document === "undefined") return null;

  /*
   * If we have the card's rect: clip the backdrop + sheet to the card bounds.
   * Fallback (no cardRef): full-screen overlay (mobile / safe default).
   */
  const backdropStyle: React.CSSProperties = rect
    ? {
        position: "fixed",
        top:    rect.top,
        left:   rect.left,
        width:  rect.width,
        height: rect.height,
        borderRadius: 18,        // match the card's rounded-[18px]
        overflow: "hidden",
        zIndex: 9000,
        pointerEvents: open ? "auto" : "none",
      }
    : {
        position: "fixed",
        inset: 0,
        zIndex: 9000,
        pointerEvents: open ? "auto" : "none",
      };

  return createPortal(
    <div style={backdropStyle} aria-hidden={!open}>

      {/* Dim layer - covers just the card */}
      <div
        className="absolute inset-0 transition-opacity duration-300"
        style={{
          background: "rgba(0,0,0,0.55)",
          opacity: open ? 1 : 0,
        }}
        onClick={onClose}
      />

      {/* Bottom sheet - slides up from bottom of card */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={sheetTitle}
        onClick={(e) => e.stopPropagation()}
        className="absolute bottom-0 left-0 right-0 bg-white shadow-2xl transition-transform duration-300 ease-out"
        style={{
          borderRadius: "22px 22px 0 0",
          transform: open ? "translateY(0)" : "translateY(100%)",
          maxHeight: "70%",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Drag handle */}
        <div className="flex flex-shrink-0 justify-center pb-1 pt-3">
          <div className="h-[5px] w-10 rounded-full bg-[#e5e7eb]" />
        </div>

        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between px-5 pb-3 pt-2">
          <h3 className="text-[17px] font-bold tracking-tight text-[#111827]">
            {sheetTitle}
          </h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[#f3f4f6] text-[#374151] transition hover:bg-[#e5e7eb]"
          >
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>

        {/* Divider */}
        <div className="h-px flex-shrink-0 bg-[#f3f4f6]" />

        {/* User list */}
        <div className="flex-1 overflow-y-auto overscroll-contain">
          {users.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-[#f3f4f6]">
                <UserIcon className="h-6 w-6 text-[#9ca3af]" />
              </div>
              <p className="text-[13px] text-[#6b7280]">No tagged users</p>
            </div>
          ) : (
            users.map((u, i) => (
              <Link
                key={u.id}
                href={`/profile/${u.username}`}
                onClick={onClose}
                className="flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[#fafafa] active:bg-[#f3f4f6]"
                style={i > 0 ? { borderTop: "1px solid #f3f4f6" } : undefined}
              >
                {/* Avatar */}
                {u.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.avatar_url}
                    alt={u.display_name || u.username}
                    className="h-[50px] w-[50px] flex-shrink-0 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-[50px] w-[50px] flex-shrink-0 items-center justify-center rounded-full text-[18px] font-bold text-white"
                    style={{ background: avatarColor(u.username) }}
                  >
                    {(u.display_name || u.username)[0].toUpperCase()}
                  </div>
                )}

                {/* Name + username */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-[14px] font-bold text-[#111827] leading-tight">
                      {u.display_name || u.username}
                    </span>
                    {u.verified && <VerifiedBadge size={14} className="flex-shrink-0" />}
                  </div>
                  <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">
                    @{u.username}
                  </p>
                </div>

                {/* View profile */}
                <span className="flex flex-shrink-0 items-center gap-0.5 text-[13px] font-semibold text-[#374151]">
                  View profile
                  <ChevronRight className="h-4 w-4 text-[#9ca3af]" />
                </span>
              </Link>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
