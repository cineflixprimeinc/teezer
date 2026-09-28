"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Copy, X } from "lucide-react";
import { toast } from "sonner";
import { videoService, type SharePlatform } from "@/services/video.service";

type Props = {
  anchorRef: React.RefObject<HTMLElement | null>;
  videoId:   number;
  open:      boolean;
  onClose:   () => void;
  onSharesUpdated?: (count: number) => void;
  onShareToStory?:  () => void;
};

type PlatformDef = {
  label:     string;
  platform:  SharePlatform;
  bg:        string;
  icon:      React.ReactNode;
  buildUrl?: (url: string, title: string) => string;
};

const PLATFORMS: PlatformDef[] = [
  {
    label: "WhatsApp", platform: "whatsapp", bg: "#25D366",
    buildUrl: (url, t) => `https://wa.me/?text=${encodeURIComponent(`${t} ${url}`)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
      </svg>
    ),
  },
  {
    label: "Telegram", platform: "telegram", bg: "#229ED9",
    buildUrl: (url, t) => `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/>
      </svg>
    ),
  },
  {
    label: "Facebook", platform: "facebook", bg: "#1877F2",
    buildUrl: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
      </svg>
    ),
  },
  {
    label: "X (Twitter)", platform: "twitter", bg: "#000000",
    buildUrl: (url, t) => `https://twitter.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="19" height="19">
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
      </svg>
    ),
  },
  {
    label: "Instagram", platform: "other", bg: "linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",
    buildUrl: () => `https://www.instagram.com/`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/>
      </svg>
    ),
  },
  {
    label: "LinkedIn", platform: "other", bg: "#0A66C2",
    buildUrl: (url, t) => `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}&summary=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
      </svg>
    ),
  },
  {
    label: "Reddit", platform: "other", bg: "#FF4500",
    buildUrl: (url, t) => `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z"/>
      </svg>
    ),
  },
  {
    label: "Pinterest", platform: "other", bg: "#E60023",
    buildUrl: (url, t) => `https://pinterest.com/pin/create/button/?url=${encodeURIComponent(url)}&description=${encodeURIComponent(t)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="white" width="22" height="22">
        <path d="M12 0C5.373 0 0 5.373 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738a.36.36 0 0 1 .083.345l-.333 1.36c-.053.22-.174.267-.402.161-1.499-.698-2.436-2.889-2.436-4.649 0-3.785 2.75-7.262 7.929-7.262 4.163 0 7.398 2.967 7.398 6.931 0 4.136-2.607 7.464-6.227 7.464-1.216 0-2.359-.632-2.75-1.378l-.748 2.853c-.271 1.043-1.002 2.35-1.492 3.146C9.57 23.812 10.763 24 12 24c6.627 0 12-5.373 12-12S18.627 0 12 0z"/>
      </svg>
    ),
  },
  {
    label: "Email", platform: "other", bg: "#6B7280",
    buildUrl: (url, t) => `mailto:?subject=${encodeURIComponent(t)}&body=${encodeURIComponent(`${t}\n\n${url}`)}`,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="22" height="22">
        <rect x="2" y="4" width="20" height="16" rx="2"/>
        <path d="M2 7l10 7 10-7"/>
      </svg>
    ),
  },
];

/* ── Component ─────────────────────────────────────────────────────────── */
export function VideoSharePanel({ videoId, open, onClose, onSharesUpdated, onShareToStory }: Props) {
  const [copied,  setCopied]  = useState(false);
  const [visible, setVisible] = useState(false);
  // `ready` prevents ghost-clicks on mobile: when the share icon is tapped the
  // modal opens and a platform button could land exactly where the finger was.
  // We block pointer events for 350 ms so that accidental second-taps are ignored.
  const [ready,   setReady]   = useState(false);

  const videoUrl = typeof window !== "undefined"
    ? `${window.location.origin}/videos/${videoId}`
    : `/videos/${videoId}`;

  // Animate in + enable buttons after ghost-click window
  useEffect(() => {
    if (!open) { setVisible(false); setReady(false); return; }
    const t1 = setTimeout(() => setVisible(true), 10);
    const t2 = setTimeout(() => setReady(true),   350);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [open]);

  // Escape key to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  // Share is counted only when user explicitly opens a social-media platform.
  async function handlePlatform(p: PlatformDef) {
    if (!ready) return; // drop ghost clicks
    const url = p.buildUrl?.(videoUrl, "Check out this video on Teezer");
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    try {
      const res = await videoService.share(videoId, p.platform);
      onSharesUpdated?.(res.shares_count);
    } catch { /* ignore */ }
    onClose();
  }

  // Copy link: silently copy - does NOT count as a social share.
  async function handleCopy() {
    if (!ready) return;
    try {
      await navigator.clipboard.writeText(videoUrl);
      setCopied(true);
      toast.success("Link copied!");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Could not copy link");
    }
    setTimeout(onClose, 1400);
  }

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 1200,
          background: "rgba(0,0,0,0.45)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease",
        }}
      />

      {/* Modal card - centred */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Share video"
        style={{
          position: "fixed",
          top: "50%", left: "50%",
          transform: visible
            ? "translate(-50%, -50%) scale(1)"
            : "translate(-50%, -50%) scale(0.92)",
          opacity: visible ? 1 : 0,
          transition: "opacity 200ms ease, transform 200ms ease",
          zIndex: 1201,
          width: "min(480px, 90vw)",
          maxHeight: "80vh",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{
          background: "white",
          borderRadius: 24,
          boxShadow: "0 24px 80px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}>

          {/* ── Header ── */}
          <div style={{
            display: "flex", alignItems: "center", justifyContent: "space-between",
            padding: "18px 20px 14px",
          }}>
            <span style={{ fontSize: 16, fontWeight: 800, color: "#111827", letterSpacing: "-0.02em" }}>
              Share video
            </span>
            <button
              type="button" onClick={onClose} aria-label="Close"
              style={{
                display: "grid", placeItems: "center",
                width: 32, height: 32, borderRadius: "50%",
                border: "none", background: "#f1f1f2",
                cursor: "pointer", color: "#6b7280",
                flexShrink: 0,
                transition: "background 150ms",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#e5e7eb")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#f1f1f2")}
            >
              <X size={15} />
            </button>
          </div>

          {/* ── Platform grid - pointer-events disabled for 350 ms after open to prevent ghost clicks ── */}
          <div style={{
            overflowY: "auto",
            padding: "4px 16px 16px",
            pointerEvents: ready ? "auto" : "none",
            opacity: ready ? 1 : 0.7,
            transition: "opacity 200ms",
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: "4px 0",
          }}>
            {PLATFORMS.map((p) => (
              <button
                key={`${p.platform}-${p.label}`}
                type="button"
                onClick={() => handlePlatform(p)}
                style={{
                  display: "flex", flexDirection: "column", alignItems: "center",
                  gap: 7, padding: "10px 6px 8px",
                  borderRadius: 14, border: "none",
                  background: "transparent", cursor: "pointer",
                  transition: "background 150ms",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#f8f9fb")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                {/* Icon circle */}
                <div style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: p.bg,
                  display: "grid", placeItems: "center",
                  boxShadow: `0 3px 10px rgba(0,0,0,0.15)`,
                  transition: "transform 150ms, box-shadow 150ms",
                  flexShrink: 0,
                }}
                  onMouseEnter={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1.1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 6px 18px rgba(0,0,0,0.22)";
                  }}
                  onMouseLeave={(e) => {
                    (e.currentTarget as HTMLElement).style.transform = "scale(1)";
                    (e.currentTarget as HTMLElement).style.boxShadow = "0 3px 10px rgba(0,0,0,0.15)";
                  }}
                >
                  {p.icon}
                </div>
                <span style={{
                  fontSize: 10.5, fontWeight: 600, color: "#374151",
                  lineHeight: 1.3, textAlign: "center",
                  wordBreak: "break-word",
                }}>
                  {p.label}
                </span>
              </button>
            ))}
          </div>

          {/* ── Copy link row - does NOT count as a social share ── */}
          <div style={{
            borderTop: "1px solid #f3f4f6",
            padding: "14px 20px 20px",
            pointerEvents: ready ? "auto" : "none",
            opacity: ready ? 1 : 0.7,
            transition: "opacity 200ms",
          }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "#9ca3af", marginBottom: 8, letterSpacing: "0.04em", textTransform: "uppercase" }}>
              Copy link
            </p>
            <div style={{
              display: "flex", alignItems: "center", gap: 10,
              background: "#f8f9fb",
              borderRadius: 14,
              padding: "10px 10px 10px 14px",
              border: "1px solid #eeeeee",
            }}>
              <div style={{
                width: 34, height: 34, borderRadius: "50%",
                background: "#111827",
                display: "grid", placeItems: "center",
                flexShrink: 0,
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" width="15" height="15">
                  <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                  <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                </svg>
              </div>
              <span style={{
                flex: 1, fontSize: 12, color: "#6b7280",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {videoUrl}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                style={{
                  display: "flex", alignItems: "center", gap: 5,
                  padding: "8px 16px", borderRadius: 10,
                  border: "none",
                  background: copied ? "#dcfce7" : "#fd4605",
                  color: copied ? "#16a34a" : "white",
                  fontSize: 12, fontWeight: 700,
                  cursor: "pointer", flexShrink: 0,
                  transition: "background 200ms, color 200ms",
                  whiteSpace: "nowrap",
                }}
                onMouseEnter={(e) => {
                  if (!copied) (e.currentTarget as HTMLElement).style.background = "#e03e04";
                }}
                onMouseLeave={(e) => {
                  if (!copied) (e.currentTarget as HTMLElement).style.background = "#fd4605";
                }}
              >
                {copied ? <><Check size={13} /> Copied!</> : <><Copy size={13} /> Copy link</>}
              </button>
            </div>
          </div>

          {/* ── Share to Story ── */}
          <div style={{
            borderTop: "1px solid #f3f4f6",
            padding: "12px 20px 18px",
            pointerEvents: ready ? "auto" : "none",
            opacity: ready ? 1 : 0.7,
            transition: "opacity 200ms",
          }}>
            <button
              type="button"
              onClick={() => { onShareToStory?.(); onClose(); }}
              style={{
                display: "flex", alignItems: "center", gap: 14,
                width: "100%", padding: "10px 12px",
                borderRadius: 14, border: "none",
                background: "transparent", cursor: "pointer",
                transition: "background 150ms",
                textAlign: "left",
              }}
              onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#fff3ec")}
              onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
            >
              {/* Icon */}
              <div style={{
                width: 44, height: 44, borderRadius: "50%", flexShrink: 0,
                background: "linear-gradient(135deg, #fd4605 0%, #ff6b6b 50%, #ffa500 100%)",
                display: "grid", placeItems: "center",
                boxShadow: "0 3px 10px rgba(253,70,5,0.35)",
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" width="20" height="20">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="16" />
                  <line x1="8" y1="12" x2="16" y2="12" />
                </svg>
              </div>
              {/* Labels */}
              <div style={{ flex: 1 }}>
                <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: "#111827" }}>
                  Share to Story
                </p>
                <p style={{ margin: "2px 0 0", fontSize: 11, color: "#9ca3af", fontWeight: 500 }}>
                  Visible for 24 hours
                </p>
              </div>
              {/* Arrow */}
              <svg viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" width="15" height="15" style={{ flexShrink: 0 }}>
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
          </div>

        </div>
      </div>
    </>,
    document.body,
  );
}

/**
 * Convenience helper: invoke native Web Share if available.
 * Returns true if native share was used and completed.
 */
export async function tryNativeShare(
  videoId: number,
  opts: { title?: string; text?: string; onSharesUpdated?: (n: number) => void },
) {
  if (typeof navigator === "undefined" || typeof navigator.share !== "function") return false;
  const url = `${window.location.origin}/videos/${videoId}`;
  try {
    await navigator.share({ title: opts.title ?? "Teezer", text: opts.text ?? "Check out this video", url });
    try {
      const res = await videoService.share(videoId, "native");
      opts.onSharesUpdated?.(res.shares_count);
    } catch { /* ignore */ }
    return true;
  } catch {
    return false;
  }
}
