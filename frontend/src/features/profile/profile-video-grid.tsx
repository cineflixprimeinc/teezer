"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bookmark,
  Film,
  Heart,
  Images,
  Image as ImageIcon,
  ListVideo,
  Play,
  Tag,
} from "lucide-react";
import { formatCompact } from "@/lib/utils";
import type { TeezerVideo } from "@/types/video";
import type { ProfileTab } from "./profile-tabs";

/* ── Colorful gradients - used for missing thumbnails & dummy cards ─── */
const GRADIENT_POOL = [
  "linear-gradient(160deg,#667eea 0%,#764ba2 100%)",
  "linear-gradient(160deg,#f77f00 0%,#d62828 100%)",
  "linear-gradient(160deg,#2193b0 0%,#6dd5ed 100%)",
  "linear-gradient(160deg,#cc2b5e 0%,#753a88 100%)",
  "linear-gradient(160deg,#1a1a2e 0%,#0f3460 100%)",
  "linear-gradient(160deg,#134e5e 0%,#71b280 100%)",
  "linear-gradient(160deg,#373b44 0%,#4286f4 100%)",
  "linear-gradient(160deg,#e96c5a 0%,#f9b234 100%)",
  "linear-gradient(160deg,#6a3093 0%,#a044ff 100%)",
  "linear-gradient(160deg,#003973 0%,#E5E5BE 100%)",
];

/* ── Dummy cards shown when the videos tab returns no data ──────────── */
type DummyCard = {
  id: number;
  gradient: string;
  pinned: boolean;
  duration: string;
  views_count: number;
  likes_count: number;
};

const DUMMY_CARDS: DummyCard[] = [
  { id: -1,  gradient: GRADIENT_POOL[0], pinned: true,  duration: "00:13", views_count: 2100000, likes_count: 182000 },
  { id: -2,  gradient: GRADIENT_POOL[1], pinned: false, duration: "00:12", views_count: 1400000, likes_count: 94000  },
  { id: -3,  gradient: GRADIENT_POOL[2], pinned: false, duration: "00:10", views_count: 3600000, likes_count: 250000 },
  { id: -4,  gradient: GRADIENT_POOL[3], pinned: false, duration: "00:14", views_count: 1800000, likes_count: 112000 },
  { id: -5,  gradient: GRADIENT_POOL[4], pinned: false, duration: "00:11", views_count:  980000, likes_count:  72000 },
  { id: -6,  gradient: GRADIENT_POOL[5], pinned: false, duration: "00:13", views_count: 1200000, likes_count:  66000 },
  { id: -7,  gradient: GRADIENT_POOL[6], pinned: false, duration: "00:09", views_count:  890000, likes_count:  42000 },
  { id: -8,  gradient: GRADIENT_POOL[7], pinned: false, duration: "00:16", views_count: 1600000, likes_count:  83000 },
  { id: -9,  gradient: GRADIENT_POOL[8], pinned: false, duration: "00:08", views_count:  740000, likes_count:  33000 },
  { id: -10, gradient: GRADIENT_POOL[9], pinned: false, duration: "00:07", views_count:  670000, likes_count:  29000 },
];

/* ── Duration helper ───────────────────────────────────────────────── */
/* ── Empty states per tab ───────────────────────────────────────────── */
const EMPTY_STATES: Record<
  ProfileTab,
  { icon: React.ElementType; title: string; sub: string; cta?: string; ctaHref?: string }
> = {
  reels:     { icon: Film,      title: "No reels yet",    sub: "Uploaded reels will appear here.", cta: "Upload reel", ctaHref: "/upload" },
  drafts:    { icon: Film,      title: "No drafts",       sub: "Start creating a draft reel.",      cta: "Create draft", ctaHref: "/upload?draft=true" },
  liked:     { icon: Heart,     title: "No liked videos", sub: "Videos you like will appear here." },
  playlists: { icon: ListVideo, title: "No playlists",    sub: "Create playlists to organise videos." },
  tagged:    { icon: Tag,       title: "Not tagged yet",  sub: "Videos you're tagged in appear here." },
  saved:     { icon: Bookmark,  title: "No saved videos", sub: "Videos you save will appear here." },
};

/* ── Custom Reels empty-state illustration ───────────────────────────── */
function ReelsEmptyIllustration() {
  return (
    <svg
      viewBox="0 0 200 170"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-[160px] sm:w-[180px]"
      aria-hidden="true"
    >
      {/* Soft pink backdrop blob */}
      <ellipse cx="100" cy="104" rx="70" ry="50" fill="#fee2e8" />

      {/* Drop shadow */}
      <ellipse cx="100" cy="153" rx="50" ry="8" fill="#fd4605" fillOpacity="0.15" />

      {/* Card body */}
      <rect x="40" y="48" width="120" height="96" rx="16" fill="#fd4605" />

      {/* Clapperboard top section */}
      <rect x="40" y="48" width="120" height="32" rx="16" fill="#d11642" />
      <rect x="40" y="64" width="120" height="16" fill="#d11642" />

      {/* Diagonal stripe accents on top */}
      <clipPath id="cls">
        <rect x="40" y="48" width="120" height="32" rx="16" />
      </clipPath>
      <g clipPath="url(#cls)" opacity="0.22">
        <rect x="46"  y="40" width="16" height="52" rx="2" fill="white" transform="rotate(-20 54 66)" />
        <rect x="74"  y="40" width="16" height="52" rx="2" fill="white" transform="rotate(-20 82 66)" />
        <rect x="102" y="40" width="16" height="52" rx="2" fill="white" transform="rotate(-20 110 66)" />
        <rect x="130" y="40" width="16" height="52" rx="2" fill="white" transform="rotate(-20 138 66)" />
      </g>

      {/* White play circle */}
      <circle cx="100" cy="108" r="23" fill="white" />
      {/* Red play triangle */}
      <path d="M94 99 L94 117 L112 108 Z" fill="#fd4605" />

      {/* Sparkle - top left */}
      <g transform="translate(24,42)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#fd4605" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.55" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#fd4605" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.55" />
        <line x1="-5" y1="-5" x2="5" y2="5" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.3" />
        <line x1="5" y1="-5" x2="-5" y2="5" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.3" />
      </g>

      {/* Sparkle - top right */}
      <g transform="translate(168,30)">
        <line x1="0" y1="-8" x2="0" y2="8" stroke="#ffa0b4" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.75" />
        <line x1="-8" y1="0" x2="8" y2="0" stroke="#ffa0b4" strokeWidth="3" strokeLinecap="round" strokeOpacity="0.75" />
        <line x1="-5" y1="-5" x2="5" y2="5" stroke="#ffa0b4" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" />
        <line x1="5" y1="-5" x2="-5" y2="5" stroke="#ffa0b4" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.45" />
      </g>

      {/* Sparkle - right small */}
      <g transform="translate(176,76)">
        <line x1="0" y1="-5" x2="0" y2="5" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="-5" y1="0" x2="5" y2="0" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.4" />
      </g>

      {/* Dot accents */}
      <circle cx="22" cy="76" r="5" fill="#ffd6e0" />
      <circle cx="178" cy="110" r="4" fill="#fd4605" fillOpacity="0.25" />
      <circle cx="32" cy="122" r="4" fill="#ffc7d2" fillOpacity="0.7" />
    </svg>
  );
}

/* ── Custom Drafts empty-state illustration ───────────────────────────── */
function DraftsEmptyIcon() {
  return (
    <svg
      viewBox="0 0 220 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="w-[140px] sm:w-[190px]"
      aria-hidden="true"
    >
      {/* Soft pink backdrop glow */}
      <ellipse cx="110" cy="110" rx="75" ry="55" fill="#fff1f4" opacity="0.8" />
      <ellipse cx="110" cy="110" rx="60" ry="42" fill="#fee2e8" opacity="0.5" />

      {/* Drop shadow */}
      <ellipse cx="110" cy="162" rx="55" ry="10" fill="#fd4605" fillOpacity="0.12" />

      {/* Back draft paper card (offset left) */}
      <rect x="35" y="62" width="95" height="72" rx="10" fill="#ffc7d2" opacity="0.6" />

      {/* Main clapperboard card */}
      <rect x="55" y="48" width="115" height="88" rx="12" fill="#fd4605" />

      {/* Clapperboard top bar (darker) */}
      <rect x="55" y="48" width="115" height="28" rx="12" fill="#e01d47" />

      {/* Diagonal stripes on clapperboard (white accents) */}
      <clipPath id="clp">
        <rect x="55" y="48" width="115" height="28" rx="12" />
      </clipPath>
      <g clipPath="url(#clp)" opacity="0.2">
        <rect x="58"  y="38" width="14" height="50" rx="1.5" fill="white" transform="rotate(-20 65 63)" />
        <rect x="85"  y="38" width="14" height="50" rx="1.5" fill="white" transform="rotate(-20 92 63)" />
        <rect x="112" y="38" width="14" height="50" rx="1.5" fill="white" transform="rotate(-20 119 63)" />
        <rect x="139" y="38" width="14" height="50" rx="1.5" fill="white" transform="rotate(-20 146 63)" />
      </g>

      {/* White play circle */}
      <circle cx="112" cy="105" r="20" fill="white" />
      {/* Red play triangle */}
      <path d="M107 99 L107 111 L122 105 Z" fill="#fd4605" />

      {/* Pencil icon (front, bottom right) */}
      <g transform="translate(145, 125)">
        {/* Pencil body */}
        <rect x="0" y="0" width="28" height="6" rx="3" fill="#fd4605" />
        {/* Pencil point */}
        <path d="M 28 3 L 36 0 L 36 6 Z" fill="#f59e0b" />
        {/* Pencil top metal band */}
        <rect x="-2" y="-3" width="6" height="12" rx="2" fill="#d4d4d8" opacity="0.7" />
      </g>

      {/* Sparkle - top left */}
      <g transform="translate(26, 48)">
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
      </g>

      {/* Sparkle - top right */}
      <g transform="translate(185, 35)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.65" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.65" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.35" />
      </g>

      {/* Small sparkle - right side */}
      <g transform="translate(190, 85)">
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      </g>

      {/* Decorative dots */}
      <circle cx="18" cy="80" r="4" fill="#ffd6e0" opacity="0.7" />
      <circle cx="195" cy="125" r="3.5" fill="#fd4605" fillOpacity="0.2" />
      <circle cx="30" cy="135" r="3" fill="#ffc7d2" fillOpacity="0.6" />
    </svg>
  );
}

/* ── Liked empty-state illustration ─────────────────────────────────── */
function LikedEmptyIcon() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="w-[140px] sm:w-[190px]" aria-hidden="true">
      <ellipse cx="110" cy="106" rx="74" ry="54" fill="#fff1f4" />
      <ellipse cx="110" cy="106" rx="56" ry="42" fill="#fee2e8" opacity="0.55" />
      <ellipse cx="110" cy="160" rx="52" ry="9" fill="#fd4605" fillOpacity="0.13" />
      {/* Card shadow layer */}
      <rect x="46" y="42" width="130" height="108" rx="20" fill="#fee2e8" opacity="0.45" />
      {/* White card */}
      <rect x="42" y="37" width="130" height="108" rx="20" fill="white" />
      {/* Large pink heart */}
      <path d="M107 123 C82 108 60 93 60 70 C60 53 74 44 87 44 C96 44 105 50 107 59 C109 50 118 44 127 44 C140 44 154 53 154 70 C154 93 132 108 107 123 Z" fill="#fd4605" />
      {/* Highlight */}
      <path d="M87 48 C93 48 102 53 106 62 C104 54 98 48 91 47 Z" fill="white" fillOpacity="0.28" />
      {/* Small floating heart */}
      <g transform="translate(48,116) scale(0.5)">
        <path d="M20 36 C20 36 1 24 1 13 C1 6 7 2 13 2 C17 2 20 5 21 8 C22 5 25 2 29 2 C35 2 41 6 41 13 C41 24 22 36 20 36 Z" fill="#ffa0b4" />
      </g>
      <g transform="translate(28,46)">
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
      </g>
      <g transform="translate(188,35)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <g transform="translate(193,88)">
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <circle cx="20" cy="80" r="4.5" fill="#ffd6e0" opacity="0.75" />
      <circle cx="196" cy="124" r="3.5" fill="#fd4605" fillOpacity="0.22" />
      <circle cx="32" cy="140" r="3" fill="#ffc7d2" fillOpacity="0.65" />
    </svg>
  );
}

/* ── Playlists empty-state illustration ──────────────────────────────── */
function PlaylistsEmptyIcon() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="w-[140px] sm:w-[190px]" aria-hidden="true">
      <ellipse cx="110" cy="106" rx="74" ry="54" fill="#fff1f4" />
      <ellipse cx="110" cy="106" rx="56" ry="42" fill="#fee2e8" opacity="0.55" />
      <ellipse cx="110" cy="160" rx="52" ry="9" fill="#fd4605" fillOpacity="0.13" />
      <rect x="46" y="42" width="130" height="108" rx="20" fill="#fee2e8" opacity="0.45" />
      <rect x="42" y="37" width="130" height="108" rx="20" fill="white" />
      {/* List row 1 */}
      <circle cx="66" cy="74" r="7" fill="#fd4605" />
      <rect x="82" y="69" width="72" height="10" rx="5" fill="#fd4605" opacity="0.85" />
      {/* List row 2 */}
      <circle cx="66" cy="96" r="7" fill="#fd4605" opacity="0.65" />
      <rect x="82" y="91" width="56" height="10" rx="5" fill="#fd4605" opacity="0.6" />
      {/* List row 3 */}
      <circle cx="66" cy="118" r="7" fill="#fd4605" opacity="0.45" />
      <rect x="82" y="113" width="42" height="10" rx="5" fill="#fd4605" opacity="0.42" />
      {/* Play badge - overlaps bottom-right corner */}
      <circle cx="158" cy="140" r="21" fill="#fd4605" />
      <path d="M152 131 L152 149 L169 140 Z" fill="white" />
      <g transform="translate(28,46)">
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
      </g>
      <g transform="translate(188,35)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <g transform="translate(28,146)">
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <circle cx="20" cy="80" r="4.5" fill="#ffd6e0" opacity="0.75" />
      <circle cx="32" cy="136" r="3" fill="#ffc7d2" fillOpacity="0.65" />
    </svg>
  );
}

/* ── Tagged empty-state illustration ────────────────────────────────── */
function TaggedEmptyIcon() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="w-[140px] sm:w-[190px]" aria-hidden="true">
      <ellipse cx="110" cy="96" rx="72" ry="56" fill="#fff1f4" />
      <ellipse cx="110" cy="96" rx="55" ry="42" fill="#fee2e8" opacity="0.55" />
      <ellipse cx="110" cy="160" rx="52" ry="9" fill="#fd4605" fillOpacity="0.13" />
      {/* Diamond / tag shape */}
      <polygon points="110,22 182,90 110,158 38,90" fill="#fd4605" />
      {/* Inner lighter layer for depth */}
      <polygon points="110,34 170,90 110,146 50,90" fill="#e91e4d" opacity="0.2" />
      {/* Tag hole */}
      <circle cx="130" cy="60" r="11" fill="white" opacity="0.9" />
      <circle cx="130" cy="60" r="7" fill="#ffd6e0" />
      {/* White play triangle */}
      <path d="M102 83 L102 99 L119 91 Z" fill="white" />
      <g transform="translate(26,48)">
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.55" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.55" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.28" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.28" />
      </g>
      <g transform="translate(190,35)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.38" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.38" />
      </g>
      <g transform="translate(192,88)">
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <circle cx="18" cy="82" r="4" fill="#ffd6e0" opacity="0.7" />
      <circle cx="194" cy="120" r="3.5" fill="#fd4605" fillOpacity="0.2" />
      <circle cx="30" cy="138" r="3" fill="#ffc7d2" fillOpacity="0.6" />
    </svg>
  );
}

/* ── Saved empty-state illustration ─────────────────────────────────── */
function SavedEmptyIcon() {
  return (
    <svg viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg"
      className="w-[140px] sm:w-[190px]" aria-hidden="true">
      <ellipse cx="110" cy="100" rx="68" ry="52" fill="#fff1f4" />
      <ellipse cx="110" cy="100" rx="52" ry="40" fill="#fee2e8" opacity="0.55" />
      <ellipse cx="110" cy="160" rx="50" ry="9" fill="#fd4605" fillOpacity="0.13" />
      {/* Bookmark shape */}
      <path d="M84 28 Q76 28 76 36 L76 152 L110 128 L144 152 L144 36 Q144 28 136 28 Z" fill="#fd4605" />
      {/* Top highlight band */}
      <path d="M84 28 Q76 28 76 36 L76 58 L144 58 L144 36 Q144 28 136 28 Z" fill="white" fillOpacity="0.12" />
      {/* White decorative lines */}
      <line x1="92" y1="50" x2="128" y2="50" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.5" />
      <line x1="92" y1="66" x2="128" y2="66" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.35" />
      <line x1="92" y1="82" x2="120" y2="82" stroke="white" strokeWidth="3.5" strokeLinecap="round" strokeOpacity="0.25" />
      <g transform="translate(28,44)">
        <line x1="0" y1="-6" x2="0" y2="6" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-6" y1="0" x2="6" y2="0" stroke="#fd4605" strokeWidth="2.5" strokeLinecap="round" strokeOpacity="0.6" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#fd4605" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.3" />
      </g>
      <g transform="translate(186,34)">
        <line x1="0" y1="-7" x2="0" y2="7" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-7" y1="0" x2="7" y2="0" stroke="#ffa0b4" strokeWidth="2.8" strokeLinecap="round" strokeOpacity="0.7" />
        <line x1="-4" y1="-4" x2="4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="4" y1="-4" x2="-4" y2="4" stroke="#ffa0b4" strokeWidth="1.5" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <g transform="translate(192,82)">
        <line x1="0" y1="-4" x2="0" y2="4" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
        <line x1="-4" y1="0" x2="4" y2="0" stroke="#fd4605" strokeWidth="2" strokeLinecap="round" strokeOpacity="0.4" />
      </g>
      <circle cx="20" cy="78" r="4" fill="#ffd6e0" opacity="0.7" />
      <circle cx="196" cy="118" r="3.5" fill="#fd4605" fillOpacity="0.22" />
      <circle cx="34" cy="142" r="3" fill="#ffc7d2" fillOpacity="0.6" />
    </svg>
  );
}

/* ── Props ──────────────────────────────────────────────────────────── */
type Props = {
  items: TeezerVideo[];
  loading: boolean;
  tab: ProfileTab;
  isOwnProfile: boolean;
  savedBlocked?: boolean;
  savedBlockedMsg?: string;
  likedBlocked?: boolean;
  likedBlockedReason?: string;
};

/* Grid: 2 → 3 → 4 → 5 → 6 cols across breakpoints */
const GRID_CLS = "mt-4 grid grid-cols-2 gap-[14px] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6";

/* ── Main grid ──────────────────────────────────────────────────────── */
export function ProfileVideoGrid({ items, loading, tab, isOwnProfile, username, savedBlocked, savedBlockedMsg, likedBlocked, likedBlockedReason }: Props & { username?: string }) {
  /* Saved tab blocked by privacy */
  if (tab === "saved" && savedBlocked) {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff3ec] mb-4">
          <Bookmark className="h-7 w-7 text-[#fd4605]" />
        </div>
        <p className="text-[18px] font-bold text-[#111827]">Saved list is private</p>
        <p className="mt-1.5 text-[13px] text-[#6b7280]">{savedBlockedMsg ?? "This user's saved videos are not visible."}</p>
      </div>
    );
  }

  /* Liked tab blocked by privacy */
  if (tab === "liked" && likedBlocked) {
    const isLikedPrivate = likedBlockedReason === "liked_private";
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <div className="relative mb-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-[#fff3ec] to-[#fde7dc]">
            <Heart className="h-9 w-9 text-[#fd4605]" />
          </div>
          {/* Lock overlay badge */}
          <div className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border-2 border-white bg-[#374151]">
            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth={2.5} className="h-3.5 w-3.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
              <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
            </svg>
          </div>
        </div>
        <p className="text-[20px] font-black text-[#111827]">
          {isLikedPrivate ? "Liked videos are private" : "Private account"}
        </p>
        <p className="mt-2 max-w-xs text-[13px] text-[#6b7280] leading-relaxed">
          {isLikedPrivate
            ? "This user keeps their liked videos private. Only they can see what they've liked."
            : "Follow this account to see their liked videos."}
        </p>
      </div>
    );
  }

  /* Loading skeleton */
  if (loading) {
    return (
      <div className={GRID_CLS}>
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="aspect-[9/14] animate-pulse rounded-xl bg-[#eef0f4]" />
        ))}
      </div>
    );
  }

  /* Videos tab with real items */
  if (items.length > 0) {
    const ids = items.map((v) => v.id).join(",");
    return (
      <div className={GRID_CLS}>
        {items.map((v, idx) => (
          <RealVideoCard key={v.id} video={v} pinned={v.is_pinned ?? false} index={idx} ids={ids} username={username} />
        ))}
      </div>
    );
  }

  /* Reels tab - custom illustrated empty state */
  if (tab === "reels") {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <ReelsEmptyIllustration />
        <p className="mt-5 text-[22px] font-black text-[#111827]">No reels yet</p>
        <p className="mt-1.5 text-[14px] text-[#6b7280]">Uploaded reels will appear here.</p>
        {isOwnProfile && (
          <Link
            href="/upload"
            className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[#fd4605] px-7 py-3 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(253,70,5,0.22)] transition hover:bg-[#e03e04] hover:-translate-y-px active:scale-95"
          >
            Upload reel
          </Link>
        )}
      </div>
    );
  }

  /* Drafts tab - custom illustrated empty state */
  if (tab === "drafts") {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <DraftsEmptyIcon />
        <p className="mt-5 text-[22px] font-black text-[#111827]">No drafts</p>
        <p className="mt-1.5 text-[14px] text-[#6b7280]">Start creating a draft reel.</p>
        {isOwnProfile && (
          <Link
            href="/upload?draft=true"
            className="mt-5 inline-flex items-center gap-2 rounded-[10px] bg-[#fd4605] px-7 py-3 text-[14px] font-bold text-white shadow-[0_8px_20px_rgba(253,70,5,0.22)] transition hover:bg-[#e03e04] hover:-translate-y-px active:scale-95"
          >
            Create draft
          </Link>
        )}
      </div>
    );
  }

  /* Liked - custom illustrated empty state */
  if (tab === "liked") {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <LikedEmptyIcon />
        <p className="mt-5 text-[22px] font-black text-[#111827]">No liked videos</p>
        <p className="mt-1.5 text-[14px] text-[#6b7280]">Videos you like will appear here.</p>
      </div>
    );
  }

  /* Playlists - custom illustrated empty state */
  if (tab === "playlists") {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <PlaylistsEmptyIcon />
        <p className="mt-5 text-[22px] font-black text-[#111827]">No playlists</p>
        <p className="mt-1.5 text-[14px] text-[#6b7280]">Create playlists to organise videos.</p>
      </div>
    );
  }

  /* Tagged - custom illustrated empty state */
  if (tab === "tagged") {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <TaggedEmptyIcon />
        <p className="mt-5 text-[22px] font-black text-[#111827]">Not tagged yet</p>
        <p className="mt-1.5 text-[14px] text-[#6b7280]">Videos you&apos;re tagged in appear here.</p>
      </div>
    );
  }

  /* Saved - custom illustrated empty state */
  if (tab === "saved") {
    return (
      <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <SavedEmptyIcon />
        <p className="mt-5 text-[22px] font-black text-[#111827]">No saved videos</p>
        <p className="mt-1.5 text-[14px] text-[#6b7280]">Videos you save will appear here.</p>
      </div>
    );
  }

  return null;
}

/* ── Dummy card (gradient background, no link) ───────────────────────── */
function DummyVideoCard({ card }: { card: DummyCard }) {
  return (
    <div className="group relative aspect-[9/14] overflow-hidden rounded-xl transition-transform duration-200 hover:-translate-y-0.5">
      {/* Colorful gradient background */}
      <div className="absolute inset-0" style={{ background: card.gradient }} />

      {/* Subtle inner shadow/vignette */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/60" />

      {/* Pinned badge - top-left */}
      {card.pinned && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-[#fd4605] px-1.5 py-[3px] text-[10px] font-bold text-white shadow">
          Pinned
        </span>
      )}

      {/* Bottom stats */}
      <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-white/90">
          <span className="flex items-center gap-1">
            <Play className="h-2.5 w-2.5 fill-current" />
            {formatCompact(card.views_count)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-2.5 w-2.5" />
            {formatCompact(card.likes_count)}
          </span>
        </div>
      </div>
    </div>
  );
}

/* Resolve a thumbnail URL from a video record, tolerating several field
   name variants the backend or future endpoints might use. */
function resolveThumbUrl(video: TeezerVideo): string | null {
  const v = video as TeezerVideo & {
    cover_url?: string | null;
    poster_url?: string | null;
    thumbnail?: string | null;
  };
  return (
    v.thumbnail_url ||
    v.cover_url ||
    v.poster_url ||
    v.thumbnail ||
    null
  );
}

/* ── Real video card (from API) ──────────────────────────────────────── */
function RealVideoCard({
  video, pinned, index, ids, username,
}: {
  video: TeezerVideo; pinned: boolean; index: number; ids?: string; username?: string;
}) {
  const isImage      = video.media_type === "image";
  const isCarousel   = video.media_type === "image_carousel";
  const carouselCount = isCarousel ? (video.media_items?.length ?? 1) : 0;
  const fallbackGrad = GRADIENT_POOL[index % GRADIENT_POOL.length];
  const [imgFailed, setImgFailed] = useState(false);

  // For single images use the media URL; for carousels use thumbnail_url (set by cover selection)
  // falling back to the first ITEM THAT ACTUALLY HAS A URL (an older carousel predating the cover
  // picker can have a null/broken object_key on item 0 specifically while later items are fine -
  // stopping at index 0 there was the reason some carousels fell all the way to the gradient
  // despite having perfectly usable photos); for videos use thumbnail.
  const thumbUrl = isImage
    ? (video.video_url ?? resolveThumbUrl(video))
    : isCarousel
      ? (resolveThumbUrl(video) ?? video.media_items?.find((m) => !!m.url)?.url ?? null)
      : resolveThumbUrl(video);
  const hasThumb = !!thumbUrl && !imgFailed;

  const href = `/videos/${video.id}` + (ids
    ? `?ids=${ids}&source=profile${username ? `&u=${username}` : ""}`
    : (username ? `?source=profile&u=${username}` : ""));

  return (
    <Link
      href={href}
      className="group relative block aspect-[9/14] overflow-hidden rounded-xl bg-[#0f0f10] transition-transform duration-200 hover:-translate-y-0.5"
    >
      {/* Media preview - image thumbnail / colorful gradient fallback */}
      {hasThumb ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={thumbUrl!}
          alt={video.title ?? video.caption ?? (isImage ? "Image" : "Video")}
          className="absolute inset-0 h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
          loading="lazy"
          onError={() => setImgFailed(true)}
        />
      ) : !isImage && !isCarousel && video.video_url ? (
        /* Cover not generated yet → show the video's own first frame as a poster
           (seek to 0.1s) so the card shows a real frame instead of a flat colour. */
        <video
          src={`${video.video_url}#t=0.1`}
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          preload="metadata"
        />
      ) : (
        <div className="absolute inset-0" style={{ background: fallbackGrad }} />
      )}

      {/* Gradient overlay */}
      <div className="absolute inset-0 bg-gradient-to-b from-black/10 via-transparent to-black/65" />

      {/* Pinned badge */}
      {pinned && (
        <span className="absolute left-1.5 top-1.5 rounded-md bg-[#fd4605] px-1.5 py-[3px] text-[10px] font-bold text-white shadow">
          Pinned
        </span>
      )}

      {/* Carousel badge */}
      {isCarousel && (
        <span className="absolute right-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/70 px-1.5 py-[3px] text-[10px] font-semibold text-white backdrop-blur-sm">
          <Images className="h-2.5 w-2.5" />
          {carouselCount > 1 ? carouselCount : ""}
        </span>
      )}

      {/* Bottom stats */}
      <div className="absolute inset-x-0 bottom-0 px-2.5 pb-2.5">
        <div className="flex items-center justify-between text-[10px] font-semibold text-white/90">
          <span className="flex items-center gap-1">
            <Play className="h-2.5 w-2.5 fill-current" />
            {formatCompact(video.views_count ?? 0)}
          </span>
          <span className="flex items-center gap-1">
            <Heart className="h-2.5 w-2.5" />
            {formatCompact(video.likes_count ?? 0)}
          </span>
        </div>
      </div>

      {/* Hover overlay - images/carousel icon for images, play for videos */}
      <div className="absolute inset-0 grid place-items-center bg-black/20 opacity-0 transition-opacity group-hover:opacity-100">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-white/90 shadow-xl">
          {isCarousel
            ? <Images className="h-4 w-4 text-black" />
            : isImage
              ? <ImageIcon className="h-4 w-4 text-black" />
              : <Play className="h-4 w-4 fill-black text-black" />}
        </div>
      </div>
    </Link>
  );
}
