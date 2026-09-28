"use client";

import {
  useEffect, useRef, useState, useCallback, useMemo, lazy, Suspense,
} from "react";
import { useRouter } from "next/navigation";
import { LinkPreviewFromText } from "@/components/link-preview";
import { MentionInput }    from "@/components/mention/mention-input";
import { MentionRenderer } from "@/components/mention/mention-renderer";
import { VerifiedBadge }   from "@/components/ui/verified-badge";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown, ChevronUp, Clock, Flag, Flame, Gift as GiftIcon, Heart, ImagePlus,
  MessageCircleOff, MoreHorizontal, Pin, Send, ThumbsDown, Trash2, Users, X, Check,
  Edit3, Smile, Search, Loader2,
} from "lucide-react";
import { toast } from "sonner";
import { notify } from "@/lib/notify";
import { cn } from "@/lib/utils";
import {
  commentService,
  type Comment, type CommentReactionType, type CommentListResponse,
} from "@/services/comment.service";
import { giftService, type CatalogGift } from "@/services/gift.service";
import { walletCoinsService } from "@/services/wallets-coins.service";
import { ReportModal } from "@/components/report/ReportModal";
import { apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";

// Lazy-load the emoji picker so it does not inflate the initial bundle
const EmojiPicker = lazy(() => import("emoji-picker-react"));

/* ── GIF picker constants ──────────────────────────────────────────────── */
const GIPHY_KEY  = process.env.NEXT_PUBLIC_GIPHY_API_KEY ?? "";
const GIPHY_BASE = "https://api.giphy.com/v1/gifs";

type GifItem = { id: string; title: string; url: string; previewUrl: string };
type GiphyApiGif = {
  id?: string;
  title?: string;
  images?: {
    original?: { url?: string };
    fixed_width_small?: { url?: string };
    preview_gif?: { url?: string };
  };
};

/* ── Reply pagination ────────────────────────────────────────────────────── */
const REPLY_BATCH = 5;

/* ─── Helpers ──────────────────────────────────────────────────────────── */
function colorFor(seed?: string | number | null): string {
  const p = ["#fd4605", "#1d8cff", "#a855f7", "#10b981", "#f97316", "#8b5cf6"];
  const s = String(seed ?? "x");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return p[Math.abs(h) % p.length];
}

function fmtRelative(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 604800) return `${Math.floor(s / 86400)}d`;
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtCount(n: number): string {
  if (n < 1000) return String(n);
  if (n < 1000000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  return `${(n / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
}

/* ─── Avatar ─────────────────────────────────────────────────────────────
 * `failed` never resets on its own once true - every call site MUST pass
 * `key={src}` (or an equivalent value that changes when `src` does), so
 * React remounts a fresh instance rather than reusing one still stuck from
 * a previous, different `src` that once failed to load. (An effect that
 * reset `failed` on `src` changing would be the naive fix, but that is a
 * setState-in-effect anti-pattern - the key remount is the correct one.)
 * ────────────────────────────────────────────────────────────────────── */
function CAvatar({ src, name, size = 32 }: { src?: string | null; name?: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const initial = (name?.[0] ?? "U").toUpperCase();
  const sz = `${size}px`;
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt={name ?? "avatar"}
        onError={() => setFailed(true)}
        // Every other avatar renderer in the app sets this (user-avatar-dropdown.tsx,
        // profile-header.tsx, etc.) - this was the only one missing it, which is
        // exactly the kind of thing that can trip onError on a referrer-restricted
        // CDN in the first place.
        referrerPolicy="no-referrer"
        style={{ width: sz, height: sz }}
        className="flex-shrink-0 rounded-full object-cover"
      />
    );
  }
  return (
    <div
      style={{ width: sz, height: sz, backgroundColor: colorFor(name) }}
      className="grid flex-shrink-0 place-items-center rounded-full text-white font-bold"
      aria-hidden="true"
    >
      <span style={{ fontSize: `${Math.round(size * 0.38)}px` }}>{initial}</span>
    </div>
  );
}

/* ─── Verified badge ────────────────────────────────────────────────────── */
/* ─── Comment rank badge ────────────────────────────────────────────────── */
const RANK_LABELS: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd" };
const RANK_COLORS: Record<number, string> = {
  1: "bg-[#fff3cd] text-[#856404]",
  2: "bg-[#e8f4f8] text-[#0c5460]",
  3: "bg-[#f0e6ff] text-[#6f42c1]",
};

function RankBadge({ rank }: { rank: 1 | 2 | 3 }) {
  return (
    <span className={cn("rounded-full px-1.5 py-px text-[9px] font-bold", RANK_COLORS[rank])}>
      {RANK_LABELS[rank]} comment
    </span>
  );
}

/* ─── Author badge ──────────────────────────────────────────────────────── */
function AuthorBadge() {
  return (
    <span className="rounded-full bg-[#fff3ec] px-[6px] py-px text-[10px] font-bold text-[#fd4605] leading-none">
      Author
    </span>
  );
}

/* ─── No-comments illustration ──────────────────────────────────────────── */
function NoCommentsIcon() {
  return (
    <svg viewBox="0 0 200 168" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-[130px]" aria-hidden="true">
      <ellipse cx="100" cy="96" rx="68" ry="50" fill="#fff1f4" />
      <ellipse cx="100" cy="148" rx="46" ry="7" fill="#fd4605" fillOpacity="0.12" />
      <rect x="28" y="36" width="120" height="88" rx="20" fill="white" stroke="#fd4605" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M52 124 L44 140 L68 124 Z" fill="white" stroke="#fd4605" strokeOpacity="0.35" strokeWidth="2" strokeLinejoin="round" />
      <rect x="46" y="122" width="28" height="6" fill="white" />
      <circle cx="76" cy="80" r="6" fill="#fd4605" fillOpacity="0.85" />
      <circle cx="100" cy="80" r="6" fill="#fd4605" fillOpacity="0.55" />
      <circle cx="124" cy="80" r="6" fill="#fd4605" fillOpacity="0.3" />
      <circle cx="148" cy="124" r="12" fill="#fd4605" />
      <path d="M143 124 L147 128 L153 120" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/* ─── Internal query shape ──────────────────────────────────────────────── */
type CommentsQueryData = {
  comments: Comment[];
  visibleCount: number;
};

type CommentFilter = "all" | "top" | "newest" | "following";

/* ─── Props ─────────────────────────────────────────────────────────────── */
export interface CommentSectionProps {
  videoId: number;
  videoOwnerId?: number;
  allowComments?: boolean;        // false → show "Comments are turned off" UI
  onCommentPosted?: () => void;   // kept for backward-compat (callers that just increment)
  onCommentCountChange?: (delta: number) => void; // preferred: +1 create, -1 delete
  onVisibleCountLoaded?: (count: number) => void; // called once when API returns authoritative visible count
  className?: string;
}

/**
 * The GIF toolbar icon - a frame with stylised "GIF" lettering, not a plain
 * photo icon. Mirrors mobile's GifGlyph (CommentsSheet.tsx) path-for-path so
 * the composer reads identically on web and app, instead of using lucide's
 * generic ImageIcon, which looks indistinguishable from an actual photo
 * upload button.
 */
function GifGlyph({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} className={className}>
      <path d="M3.5 5h17a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
      <path d="M9.2 10.2a2.4 2.4 0 1 0 0 3.6V12.4M13 9.5v5M16.2 14.5v-5h3M16.2 12.2h2.2" strokeLinecap="round" />
    </svg>
  );
}

/* ── Inline GIF picker ───────────────────────────────────────────────────── */
function GifPicker({ onSelect, onClose }: { onSelect: (gif: GifItem) => void; onClose: () => void }) {
  const [query,    setQuery]    = useState("");
  const [gifs,     setGifs]     = useState<GifItem[]>([]);
  const [loading,  setLoading]  = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchGifs = useCallback(async (q: string) => {
    if (!GIPHY_KEY) return;
    setLoading(true);
    try {
      const endpoint = q.trim()
        ? `${GIPHY_BASE}/search?api_key=${GIPHY_KEY}&q=${encodeURIComponent(q)}&limit=24&rating=g`
        : `${GIPHY_BASE}/trending?api_key=${GIPHY_KEY}&limit=24&rating=g`;
      const res  = await fetch(endpoint);
      const json = await res.json();
      setGifs(((json.data ?? []) as GiphyApiGif[]).map((g) => ({
        id:         g.id ?? "",
        title:      g.title ?? "",
        url:        g.images?.original?.url ?? "",
        previewUrl: g.images?.fixed_width_small?.url ?? g.images?.preview_gif?.url ?? "",
      })));
    } catch { /* silent */ } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void fetchGifs(""), 0);
    return () => clearTimeout(timer);
  }, [fetchGifs]);

  function onSearch(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void fetchGifs(val), 400);
  }

  if (!GIPHY_KEY) {
    return (
      <div className="rounded-2xl border border-[#eeeeee] bg-white p-4 text-center text-[12px] text-[#9ca3af] shadow-xl">
        GIF search is not configured. Add <code className="text-[#fd4605]">NEXT_PUBLIC_GIPHY_API_KEY</code> to your environment.
        <button onClick={onClose} className="mt-2 block w-full text-center text-[#fd4605] font-semibold">Close</button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#eeeeee] bg-white shadow-xl" style={{ width: 320, maxHeight: 380 }}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#f3f4f6] px-3 py-2">
        <Search className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
        <input
          autoFocus
          value={query}
          onChange={(e) => onSearch(e.target.value)}
          placeholder="Search GIFs…"
          className="flex-1 bg-transparent text-[12px] text-black outline-none placeholder:text-[#9ca3af]"
        />
        <button onClick={onClose} className="grid h-5 w-5 place-items-center rounded-full text-[#9ca3af] hover:text-black">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: 320 }}>
        {loading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#fd4605]" />
          </div>
        ) : gifs.length === 0 ? (
          <p className="py-6 text-center text-[11px] text-[#9ca3af]">No GIFs found</p>
        ) : (
          <div className="grid grid-cols-3 gap-1">
            {gifs.map((gif) => (
              <button
                key={gif.id}
                type="button"
                onClick={() => onSelect(gif)}
                className="overflow-hidden rounded-lg bg-[#f3f4f6] transition hover:opacity-80"
                style={{ aspectRatio: "1" }}
                title={gif.title}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={gif.previewUrl || gif.url} alt={gif.title} className="h-full w-full object-cover" loading="lazy" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inline gift picker ──────────────────────────────────────────────────
 * Same popover shape as GifPicker above. Backend already supports this in
 * full (GiftController) - sending `video_id` alongside `gift_id`/
 * `receiver_id` is what makes it create a new top-level gift comment on the
 * video; there is no realtime push for that comment, so the caller must
 * invalidate the comments query on success (see `onSent`).
 */
function GiftPicker({
  videoId, receiverId, myId, onSent, onClose,
}: { videoId: number; receiverId: number; myId: number; onSent: () => void; onClose: () => void }) {
  const router  = useRouter();
  const giftsQ  = useQuery({ queryKey: ["gifts-catalog"], queryFn: giftService.list });
  const walletQ = useQuery({ queryKey: ["wallets-coins-dashboard"], queryFn: walletCoinsService.dashboard });
  const [sendingId, setSendingId] = useState<number | null>(null);
  const balance = walletQ.data?.wallet.coin_balance ?? null;

  /*
   * Mirrors mobile's GiftSheet: sender AND receiver both need to have
   * unlocked Gifts & Coins. The receiver icon-gate already existed
   * implicitly nowhere - this button rendered for any authed non-owner
   * regardless of either side's status, so both were only ever caught by
   * the server refusing send(). A display gate only; send() below still
   * gets rejected server-side (SENDER/RECEIVER_NOT_GIFT_ELIGIBLE) if this
   * ever disagrees with the live answer.
   */
  const myEligibleQ       = useQuery({ queryKey: ["gifts-eligible", myId], queryFn: () => giftService.eligible(myId) });
  const receiverEligibleQ = useQuery({ queryKey: ["gifts-eligible", receiverId], queryFn: () => giftService.eligible(receiverId) });
  const checkingEligibility = myEligibleQ.isLoading || receiverEligibleQ.isLoading;
  const iAmNotEnrolled  = myEligibleQ.data === false;
  const theyAreNotEnrolled = !iAmNotEnrolled && receiverEligibleQ.data === false;

  async function sendGift(gift: CatalogGift) {
    if (sendingId !== null) return;
    setSendingId(gift.id);
    try {
      await giftService.send({ receiver_id: receiverId, gift_id: gift.id, video_id: videoId });
      toast.success(`${gift.name} sent!`);
      onSent();
      onClose();
    } catch (e) {
      // Same error codes GiftController::send() returns for mobile's GiftSheet.
      const code = (e as { response?: { data?: { code?: string } } })?.response?.data?.code;
      if (code === "INSUFFICIENT_COINS") {
        toast.error("Not enough coins. Top up to send this gift.", {
          action: { label: "Get coins", onClick: () => router.push("/studio/wallets-coins") },
        });
      } else if (code === "SENDER_NOT_GIFT_ELIGIBLE") {
        toast.error("Join the Gifts & Coins Program to send and receive Gifts.", {
          action: { label: "Get Started", onClick: () => router.push("/studio/monetization") },
        });
      } else if (code === "RECEIVER_NOT_GIFT_ELIGIBLE") {
        toast.error("Gift receiving is unavailable until this user joins the Gifts & Coins Program.");
      } else {
        toast.error(apiMessage(e));
      }
    } finally {
      setSendingId(null);
    }
  }

  if (checkingEligibility) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#eeeeee] bg-white shadow-xl grid place-items-center" style={{ width: 280, height: 160 }}>
        <Loader2 className="h-5 w-5 animate-spin text-[#fd4605]" />
      </div>
    );
  }

  if (iAmNotEnrolled || theyAreNotEnrolled) {
    return (
      <div className="overflow-hidden rounded-2xl border border-[#eeeeee] bg-white shadow-xl p-4 text-center" style={{ width: 280 }}>
        <button onClick={onClose} className="ml-auto mb-1 grid h-5 w-5 place-items-center rounded-full text-[#9ca3af] hover:text-black">
          <X className="h-3.5 w-3.5" />
        </button>
        <div className="text-2xl">🎁</div>
        <p className="mt-1 text-[13px] font-bold text-black">Join Gifts &amp; Coins</p>
        <p className="mt-1 text-[11px] leading-relaxed text-[#9ca3af]">
          {iAmNotEnrolled
            ? "Complete the program requirements to send and receive Gifts and Coins across Teezer."
            : "Gift receiving is unavailable until this user joins the Gifts & Coins Program."}
        </p>
        {iAmNotEnrolled && (
          <button
            type="button"
            onClick={() => router.push("/studio/monetization")}
            className="mt-3 w-full rounded-full bg-[#fd4605] px-4 py-2 text-[12px] font-bold text-white hover:bg-[#e03e04]"
          >
            Get Started
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-[#eeeeee] bg-white shadow-xl" style={{ width: 280, maxHeight: 360 }}>
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-[#f3f4f6] px-3 py-2">
        <span className="flex-1 text-[12px] font-bold text-black">Send a gift</span>
        <span className="text-[11px] font-semibold text-[#9ca3af]">
          🪙 {balance !== null ? balance.toLocaleString() : "…"}
        </span>
        <button onClick={onClose} className="grid h-5 w-5 place-items-center rounded-full text-[#9ca3af] hover:text-black">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-y-auto p-2" style={{ maxHeight: 320 }}>
        {giftsQ.isLoading ? (
          <div className="grid place-items-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-[#fd4605]" />
          </div>
        ) : !giftsQ.data?.length ? (
          <p className="py-6 text-center text-[11px] text-[#9ca3af]">No gifts available</p>
        ) : (
          <div className="grid grid-cols-3 gap-1.5">
            {giftsQ.data.map((gift) => (
              <button
                key={gift.id}
                type="button"
                onClick={() => sendGift(gift)}
                disabled={sendingId !== null}
                className="flex flex-col items-center gap-1 rounded-xl p-2 transition hover:bg-[#f8f9fb] disabled:opacity-50"
                title={gift.name}
              >
                {sendingId === gift.id ? (
                  <Loader2 className="h-7 w-7 animate-spin text-[#fd4605]" />
                ) : gift.icon_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={gift.icon_url} alt={gift.name} className="h-7 w-7 object-contain" />
                ) : (
                  <GiftIcon className="h-7 w-7 text-[#f59e0b]" />
                )}
                <span className="w-full truncate text-[10px] font-medium text-[#374151]">{gift.name}</span>
                <span className="text-[9px] font-bold text-[#f59e0b]">🪙 {gift.coin_value.toLocaleString()}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Main component ────────────────────────────────────────────────────── */
export function CommentSection({
  videoId,
  videoOwnerId,
  allowComments = true,
  onCommentPosted,
  onCommentCountChange,
  onVisibleCountLoaded,
  className,
}: CommentSectionProps) {
  // Unified count-change helper: prefers the new delta-based callback, falls
  // back to the old increment-only callback for backward compatibility.
  const countChange = (delta: number) => {
    onCommentCountChange?.(delta);
    if (!onCommentCountChange && delta > 0) onCommentPosted?.();
  };
  const qc           = useQueryClient();
  const syncVisibleCount = (count: number) => {
    qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) =>
      prev ? { ...prev, visibleCount: count } : prev,
    );
    onVisibleCountLoaded?.(count);
  };
  const isAuth       = useAuthStore((s) => s.isAuthenticated);
  const openAuth     = useAuthStore((s) => s.openAuthModal);
  const authUser     = useAuthStore((s) => s.user);
  const isAdmin      = useAuthStore((s) => s.isAdmin());
  const myId         = authUser?.id;
  const isVideoOwner = !!myId && myId === videoOwnerId;

  // ── Comment filter ───────────────────────────────────────────────────────
  const [commentFilter, setCommentFilter] = useState<CommentFilter>("all");

  // ── Input state ──────────────────────────────────────────────────────────
  const [draft,   setDraft]   = useState("");
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ── Emoji / GIF / gift pickers ───────────────────────────────────────────
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [gifOpen,   setGifOpen]   = useState(false);
  const [giftOpen,  setGiftOpen]  = useState(false);
  const [selectedGif, setSelectedGif] = useState<GifItem | null>(null);
  const emojiRef = useRef<HTMLDivElement>(null);
  const gifRef   = useRef<HTMLDivElement>(null);
  const giftRef  = useRef<HTMLDivElement>(null);

  // ── Photo attachment (a real upload, distinct from the GIF picker above) ──
  const [selectedImage, setSelectedImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  // Release the blob URL on unmount / when a new photo replaces it, so the
  // preview does not leak memory across a long comment-browsing session.
  useEffect(() => () => { if (selectedImage) URL.revokeObjectURL(selectedImage.previewUrl); }, [selectedImage]);

  // Close pickers on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (emojiRef.current && !emojiRef.current.contains(e.target as Node)) setEmojiOpen(false);
      if (gifRef.current   && !gifRef.current.contains(e.target as Node))   setGifOpen(false);
      if (giftRef.current  && !giftRef.current.contains(e.target as Node))  setGiftOpen(false);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, []);

  // ── Replies state ────────────────────────────────────────────────────────
  const [expandedReplies, setExpandedReplies] = useState<Set<number>>(new Set());
  const [loadedReplies,   setLoadedReplies]   = useState<Record<number, Comment[]>>({});
  const [loadingReplies,  setLoadingReplies]  = useState<Set<number>>(new Set());
  // How many replies are visible per comment (start at REPLY_BATCH)
  const [shownReplies, setShownReplies] = useState<Record<number, number>>({});

  // ── Menu / editing / modals ───────────────────────────────────────────────
  const [activeMenu,   setActiveMenu]   = useState<number | null>(null);
  // Viewport-relative coordinates for the dropdown (position:fixed bypasses overflow clipping)
  const [menuPos,      setMenuPos]      = useState({ top: 0, right: 0 });
  const [editingId,    setEditingId]    = useState<number | null>(null);
  const [editDraft,    setEditDraft]    = useState("");
  const [deletingId,   setDeletingId]   = useState<number | null>(null);
  const [reportingId,  setReportingId]  = useState<number | null>(null);
  // A comment photo, enlarged. Logged-out viewers still see the inline
  // thumbnail in the comment itself - they just cannot open this popup.
  const [lightboxUrl,  setLightboxUrl]  = useState<string | null>(null);

  // ── Close menu on outside click ──────────────────────────────────────────
  useEffect(() => {
    if (!activeMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest("[data-comment-menu]")) setActiveMenu(null);
    };
    document.addEventListener("mousedown", handler, true);
    return () => document.removeEventListener("mousedown", handler, true);
  }, [activeMenu]);

  // ── Comments query ───────────────────────────────────────────────────────
  const commentsQ = useQuery({
    queryKey: ["video-comments", videoId],
    queryFn: async (): Promise<CommentsQueryData> => {
      const res = await commentService.list(videoId, 1, 50) as CommentListResponse;
      return {
        comments:     res.data ?? [],
        visibleCount: res.visible_comments_count ?? (res.data?.length ?? 0),
      };
    },
  });

  const comments = commentsQ.data?.comments ?? [];

  // Emit authoritative visible count as soon as API responds so callers can
  // replace any stale cached value (e.g. feed icon, drawer heading).
  useEffect(() => {
    if (commentsQ.data?.visibleCount !== undefined) {
      onVisibleCountLoaded?.(commentsQ.data.visibleCount);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [commentsQ.data?.visibleCount]);

  /* ── Mutators ─────────────────────────────────────────────────────────── */

  const postMut = useMutation({
    mutationFn: (payload: Parameters<typeof commentService.create>[1]) =>
      commentService.create(videoId, payload),
    onSuccess: (res) => {
      // Backend returns: { data: newComment, root_comment_id, root_replies_count, video_comments_count }
      const newComment: Comment = res.data;
      const rootCommentId: number | null   = res.root_comment_id   ?? null;
      const rootRepliesCount: number | null = res.root_replies_count ?? null;

      if (newComment.parent_id) {
        // Always store under the ROOT comment's id so the flat thread list
        // shows all replies regardless of nesting depth. rootCommentId is the
        // top-level comment that owns this entire thread.
        const threadKey = rootCommentId ?? newComment.parent_id;
        setLoadedReplies((prev) => ({
          ...prev,
          [threadKey]: [...(prev[threadKey] ?? []), newComment],
        }));

        // Sync root comment's reply_count using the authoritative value from backend.
        if (rootCommentId !== null) {
          const setCount = (c: Comment) =>
            c.id === rootCommentId
              ? { ...c, reply_count: rootRepliesCount !== null ? rootRepliesCount : c.reply_count + 1 }
              : c;

          qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
            if (!prev) return prev;
            return { ...prev, comments: prev.comments.map(setCount) };
          });
          setLoadedReplies((prev) => {
            const next = { ...prev };
            for (const k in next) next[+k] = next[+k].map(setCount);
            return next;
          });
        }
      } else {
        qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
          if (!prev) return prev;
          return { ...prev, comments: [...prev.comments, newComment] };
        });
      }
      if (typeof res.video_comments_count === "number") {
        syncVisibleCount(res.video_comments_count);
      } else {
        countChange(+1);
      }
      setDraft(""); setReplyTo(null); setSelectedGif(null);
      toast.success(newComment.parent_id ? "Reply posted" : "Comment posted");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reactMut = useMutation({
    mutationFn: ({ commentId, reaction_type }: { commentId: number; reaction_type: CommentReactionType }) =>
      commentService.react(commentId, reaction_type),
    onMutate: async ({ commentId, reaction_type }) => {
      // Optimistic update helper
      function applyOptimistic(c: Comment): Comment {
        if (c.id !== commentId) return c;
        const prev = c.current_user_reaction;
        if (prev === reaction_type) {
          // removing
          return {
            ...c,
            current_user_reaction: null,
            love_count:    reaction_type === "love"    ? Math.max(0, c.love_count - 1)    : c.love_count,
            dislike_count: reaction_type === "dislike" ? Math.max(0, c.dislike_count - 1) : c.dislike_count,
          };
        }
        // adding or switching
        return {
          ...c,
          current_user_reaction: reaction_type,
          love_count:    reaction_type === "love"
            ? c.love_count + 1
            : (prev === "love" ? Math.max(0, c.love_count - 1) : c.love_count),
          dislike_count: reaction_type === "dislike"
            ? c.dislike_count + 1
            : (prev === "dislike" ? Math.max(0, c.dislike_count - 1) : c.dislike_count),
        };
      }

      qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
        if (!prev) return prev;
        return { ...prev, comments: prev.comments.map(applyOptimistic) };
      });
      // Also update in loaded replies
      setLoadedReplies((prev) => {
        const next = { ...prev };
        for (const parentId in next) {
          next[+parentId] = next[+parentId].map(applyOptimistic);
        }
        return next;
      });
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ["video-comments", videoId] });
      toast.error("Something went wrong. Please try again.");
    },
  });

  const editMut = useMutation({
    mutationFn: ({ id, body }: { id: number; body: string }) => commentService.edit(id, body),
    onSuccess: ({ data: updated }) => {
      if (updated.parent_id) {
        // Replies are stored under root_id (the thread owner), not parent_id.
        const threadKey = updated.root_id ?? updated.parent_id;
        setLoadedReplies((prev) => ({
          ...prev,
          [threadKey]: (prev[threadKey] ?? []).map((r) =>
            r.id === updated.id ? updated : r,
          ),
        }));
      } else {
        qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
          if (!prev) return prev;
          return { ...prev, comments: prev.comments.map((c) => (c.id === updated.id ? updated : c)) };
        });
      }
      setEditingId(null);
      toast.success("Comment updated");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => commentService.delete(id),
    onSuccess: (res, id) => {
      let wasReply = false;

      // ── Remove from top-level comment list ──
      qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
        if (!prev) return prev;
        const next = prev.comments.filter((c) => c.id !== id);
        if (next.length === prev.comments.length) wasReply = true;
        return { ...prev, comments: next };
      });

      if (wasReply) {
        // ── Find which parent owned this reply (search all loaded reply lists) ──
        let foundParentId: number | null = null;
        setLoadedReplies((prev) => {
          const next = { ...prev };
          for (const parentId in next) {
            if (next[+parentId].some((r) => r.id === id)) {
              foundParentId = +parentId;
              next[+parentId] = next[+parentId].filter((r) => r.id !== id);
            } else {
              next[+parentId] = next[+parentId].filter((r) => r.id !== id);
            }
          }
          return next;
        });

        // ── Decrement reply_count on the ROOT comment ──
        // Find the root comment from the deleted comment's root_id property
        const deletedReply = loadedReplies[foundParentId ?? 0]?.find((r) => r.id === id);
        const rootId = deletedReply?.root_id;

        if (rootId) {
          qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              comments: prev.comments.map((c) =>
                c.id === rootId ? { ...c, reply_count: Math.max(0, c.reply_count - 1) } : c,
              ),
            };
          });
          // Also update in loaded replies if root is itself a loaded reply
          setLoadedReplies((prev) => {
            const next = { ...prev };
            for (const k in next) {
              next[+k] = next[+k].map((r) =>
                r.id === rootId ? { ...r, reply_count: Math.max(0, r.reply_count - 1) } : r,
              );
            }
            return next;
          });
        }
      }

      if (typeof res.video_comments_count === "number") {
        syncVisibleCount(res.video_comments_count);
      } else {
        countChange(-1);
      }

      setDeletingId(null);
      notify.commentDeleted();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const pinMut = useMutation({
    mutationFn: (id: number) => commentService.pin(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
        if (!prev) return prev;
        return { ...prev, comments: prev.comments.map((c) => (c.id === id ? { ...c, is_pinned: true } : c)) };
      });
      toast.success("Comment pinned");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const unpinMut = useMutation({
    mutationFn: (id: number) => commentService.unpin(id),
    onSuccess: (_res, id) => {
      qc.setQueryData<CommentsQueryData>(["video-comments", videoId], (prev) => {
        if (!prev) return prev;
        return { ...prev, comments: prev.comments.map((c) => (c.id === id ? { ...c, is_pinned: false } : c)) };
      });
      toast.success("Comment unpinned");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  /* ── Load replies ─────────────────────────────────────────────────────── */
  const loadReplies = useCallback(async (commentId: number) => {
    if (loadingReplies.has(commentId)) return;
    setLoadingReplies((s) => new Set(s).add(commentId));
    try {
      const res = await commentService.replies(commentId);
      setLoadedReplies((prev) => ({ ...prev, [commentId]: res.data ?? [] }));
    } catch {
      toast.error("Failed to load replies.");
    } finally {
      setLoadingReplies((s) => { const n = new Set(s); n.delete(commentId); return n; });
    }
  }, [loadingReplies]);

  function toggleReplies(comment: Comment) {
    const id = comment.id;
    if (expandedReplies.has(id)) {
      setExpandedReplies((s) => { const n = new Set(s); n.delete(id); return n; });
    } else {
      setExpandedReplies((s) => new Set(s).add(id));
      if (!loadedReplies[id]) loadReplies(id);
    }
  }

  /* ── Auth guard ───────────────────────────────────────────────────────── */
  function requireAuth(fn: () => void) {
    if (!isAuth) { openAuth("login"); return; }
    fn();
  }

  /* ── Emoji insert at cursor ─────────────────────────────────────────── */
  function insertEmoji(emoji: string) {
    const input = inputRef.current;
    if (!input) { setDraft((p) => (p + emoji).slice(0, 1000)); return; }
    const start = input.selectionStart ?? draft.length;
    const end   = input.selectionEnd   ?? draft.length;
    const next  = (draft.slice(0, start) + emoji + draft.slice(end)).slice(0, 1000);
    setDraft(next);
    setEmojiOpen(false);
    requestAnimationFrame(() => {
      input.selectionStart = input.selectionEnd = start + emoji.length;
      input.focus();
    });
  }

  /* ── Submit comment ───────────────────────────────────────────────────── */
  function submit() {
    if (!isAuth) { openAuth("login"); return; }
    const body = draft.trim();
    if (!body && !selectedGif && !selectedImage) return;
    if (postMut.isPending) return;
    postMut.mutate({
      body:            body || undefined,
      parent_id:       replyTo?.id,
      gif_url:         selectedGif?.url,
      gif_preview_url: selectedGif?.previewUrl,
      gif_provider:    selectedGif ? "giphy" : undefined,
      gif_provider_id: selectedGif?.id,
      image:           selectedImage?.file,
    });
    setSelectedGif(null);
    setSelectedImage(null);
  }

  /* ── Reaction handler ─────────────────────────────────────────────────── */
  function handleReact(comment: Comment, type: CommentReactionType) {
    requireAuth(() => {
      reactMut.mutate({ commentId: comment.id, reaction_type: type });
    });
  }

  /* ── Three-dot menu items ─────────────────────────────────────────────── */
  function getMenuItems(comment: Comment) {
    const items: Array<{ label: string; icon: React.ReactNode; action: () => void; danger?: boolean }> = [];
    const isOwn  = comment.is_own;
    const canPin = (isVideoOwner || isAdmin) && !comment.parent_id;

    if (isOwn) {
      items.push({
        label: "Edit",
        icon: <Edit3 className="h-3.5 w-3.5" />,
        action: () => { setEditingId(comment.id); setEditDraft(comment.body); setActiveMenu(null); },
      });
    }

    if (canPin) {
      items.push({
        label: comment.is_pinned ? "Unpin comment" : "Pin comment",
        icon: <Pin className="h-3.5 w-3.5" />,
        action: () => {
          if (comment.is_pinned) unpinMut.mutate(comment.id);
          else pinMut.mutate(comment.id);
          setActiveMenu(null);
        },
      });
    }

    if (isOwn || isVideoOwner || isAdmin) {
      items.push({
        label: "Delete",
        icon: <Trash2 className="h-3.5 w-3.5" />,
        action: () => { setDeletingId(comment.id); setActiveMenu(null); },
        danger: true,
      });
    }

    if (!isOwn) {
      items.push({
        label: "Report comment",
        icon: <Flag className="h-3.5 w-3.5" />,
        action: () => { setReportingId(comment.id); setActiveMenu(null); },
      });
    }

    return items;
  }

  /* ─────────────────────────────────────────────────────────────────────── */
  /* ── Recursive comment row - flat TikTok-style vertical alignment ─────── */
  /* ─────────────────────────────────────────────────────────────────────── */
  function CommentRow({ comment, depth = 0 }: { comment: Comment; depth?: number }) {
    const isEditTarget = editingId === comment.id;
    const isMenuOpen   = activeMenu === comment.id;
    const menuItems    = getMenuItems(comment);

    // depth > 0 = this is a reply of any level
    const isReply    = depth > 0;
    const avatarSize = isReply ? 26 : 32;

    // Paginate displayed replies per comment
    const allReplies     = loadedReplies[comment.id] ?? [];
    const visibleCount   = shownReplies[comment.id] ?? REPLY_BATCH;
    const visibleReplies = allReplies.slice(0, visibleCount);
    const hasMoreReplies = allReplies.length > visibleCount;

    // The row itself has NO individual margin.
    // Indentation is applied once by the REPLIES CONTAINER (44 px for depth-0 parents,
    // 0 px for deeper parents - they're already inside the 44 px container).
    return (
      <>
      <div
        className="flex gap-2.5 mt-2 min-w-0 max-w-full overflow-hidden"
      >
        <CAvatar key={comment.user?.avatar ?? "none"} src={comment.user?.avatar} name={comment.user?.name ?? comment.user?.username} size={avatarSize} />

        <div className="flex-1 min-w-0">
          {/* Header row */}
          <div className="flex flex-wrap items-center gap-1 min-w-0">
            <span className="text-[12px] font-bold text-black truncate max-w-[120px]">
              @{comment.user?.username ?? "user"}
            </span>
            {comment.user?.is_verified && <VerifiedBadge size={13} />}
            {comment.is_author && <AuthorBadge />}
            {depth === 0 && comment.comment_rank != null && comment.comment_rank >= 1 && comment.comment_rank <= 3 && (
              <RankBadge rank={comment.comment_rank as 1 | 2 | 3} />
            )}
            {comment.is_pinned && (
              <span className="flex items-center gap-0.5 rounded-full bg-[#fff3ec] px-1.5 py-px text-[9px] font-bold text-[#fd4605]">
                <Pin className="h-2 w-2" /> Pinned
              </span>
            )}
            <span className="ml-auto text-[10px] text-[#9ca3af] flex-shrink-0">{fmtRelative(comment.created_at)}</span>
          </div>

          {/* Body or edit input */}
          {isEditTarget ? (
            <div className="mt-1">
              <textarea
                autoFocus
                value={editDraft}
                onChange={(e) => setEditDraft(e.target.value.slice(0, 1000))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (editDraft.trim()) editMut.mutate({ id: comment.id, body: editDraft.trim() });
                  }
                  if (e.key === "Escape") setEditingId(null);
                }}
                rows={2}
                className="w-full resize-none rounded-xl border border-[#fd4605] bg-[#fff8f9] px-3 py-1.5 text-[12px] text-black outline-none"
                disabled={editMut.isPending}
              />
              <div className="mt-1 flex gap-2">
                <button
                  onClick={() => { if (editDraft.trim()) editMut.mutate({ id: comment.id, body: editDraft.trim() }); }}
                  disabled={!editDraft.trim() || editMut.isPending}
                  className="flex items-center gap-1 rounded-full bg-[#fd4605] px-3 py-1 text-[11px] font-bold text-white disabled:opacity-50"
                >
                  <Check className="h-3 w-3" /> Save
                </button>
                <button
                  onClick={() => setEditingId(null)}
                  className="rounded-full bg-[#f0f0f0] px-3 py-1 text-[11px] font-bold text-[#374151]"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : comment.gift ? (
            // A gift comment. body is server-set to "sent a {gift.name}" (see
            // GiftController::send()) - shown here as its own card instead of
            // plain text, matching how mobile's CommentsSheet renders c.gift.
            <div className="mt-1 inline-flex items-center gap-2 rounded-2xl border border-[#ffe4b5] bg-[#fff8f0] px-3 py-2">
              {comment.gift.icon_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={comment.gift.icon_url} alt={comment.gift.name} className="h-8 w-8 flex-shrink-0 object-contain" />
              ) : (
                <GiftIcon className="h-6 w-6 flex-shrink-0 text-[#f59e0b]" />
              )}
              <div className="min-w-0">
                <p className="truncate text-[12px] font-bold text-[#92400e]">Sent {comment.gift.name}</p>
                <p className="text-[10px] text-[#b45309]">🪙 {comment.gift.coins.toLocaleString()} coins</p>
              </div>
            </div>
          ) : (
            <div className="mt-0.5">
              {comment.body && (
                <p className="text-[13px] leading-snug text-[#1f2937] break-words overflow-wrap-anywhere">
                  <MentionRenderer text={comment.body} />
                  {comment.is_edited && (
                    <span className="ml-1 text-[10px] text-[#9ca3af]">(edited)</span>
                  )}
                </p>
              )}
              {comment.body && <LinkPreviewFromText text={comment.body} compact className="mt-1.5" />}
              {comment.gif_url && (
                <div className="mt-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={comment.gif_preview_url || comment.gif_url}
                    alt="GIF"
                    className="rounded-xl object-cover"
                    style={{ maxWidth: 220, maxHeight: 160 }}
                    loading="lazy"
                  />
                </div>
              )}
              {comment.image_url && (
                <div className="mt-1.5">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={comment.image_url}
                    alt="Photo"
                    // Fixed width+height (not max-width/max-height) so object-cover
                    // has an actual box to crop into - a full-size upload (e.g. a
                    // tall phone screenshot) renders as a proper thumbnail here
                    // instead of at its native, uncropped size.
                    style={{ width: 180, height: 180 }}
                    className={cn("rounded-xl object-cover", isAuth && "cursor-pointer")}
                    loading="lazy"
                    // Enlarging is a logged-in feature. A logged-out viewer still
                    // sees this same thumbnail right here in the comment - they
                    // just cannot open the popup, so no onClick/cursor for them.
                    onClick={isAuth ? () => setLightboxUrl(comment.image_url!) : undefined}
                  />
                </div>
              )}
            </div>
          )}

          {/* Action row */}
          {!isEditTarget && (
            <div className="mt-1 flex items-center gap-3">
              {/* Love */}
              <button
                type="button"
                onClick={() => handleReact(comment, "love")}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-semibold transition-colors",
                  comment.current_user_reaction === "love"
                    ? "text-[#fd4605]"
                    : "text-[#5f6675] hover:text-[#fd4605]",
                )}
                aria-label="Love"
              >
                <Heart
                  className={cn("h-3.5 w-3.5", comment.current_user_reaction === "love" && "fill-[#fd4605]")}
                  strokeWidth={2}
                />
                {comment.love_count > 0 && <span>{fmtCount(comment.love_count)}</span>}
              </button>

              {/* Dislike */}
              <button
                type="button"
                onClick={() => handleReact(comment, "dislike")}
                className={cn(
                  "flex items-center gap-1 text-[11px] font-semibold transition-colors",
                  comment.current_user_reaction === "dislike"
                    ? "text-[#5f6675]"
                    : "text-[#5f6675] hover:text-[#374151]",
                )}
                aria-label="Dislike"
              >
                <ThumbsDown
                  className={cn(
                    "h-3.5 w-3.5",
                    comment.current_user_reaction === "dislike" && "fill-[#5f6675]",
                  )}
                  strokeWidth={2}
                />
                {comment.dislike_count > 0 && <span>{fmtCount(comment.dislike_count)}</span>}
              </button>

              {/* Reply - available on every comment at every depth */}
              <button
                type="button"
                onClick={() => requireAuth(() => {
                  setReplyTo(replyTo?.id === comment.id ? null : comment);
                  setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50);
                })}
                className="text-[11px] font-semibold text-[#5f6675] hover:text-[#fd4605] transition-colors"
              >
                {replyTo?.id === comment.id ? "Cancel" : "Reply"}
              </button>

              {/* Three-dot menu */}
              {isAuth && menuItems.length > 0 && (
                <div className="ml-auto flex-shrink-0" data-comment-menu>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isMenuOpen) {
                        setActiveMenu(null);
                      } else {
                        // Capture viewport position so the dropdown can use position:fixed
                        // and is never clipped by overflow:auto/hidden ancestors.
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setMenuPos({
                          top:   rect.bottom + 4,
                          right: window.innerWidth - rect.right,
                        });
                        setActiveMenu(comment.id);
                      }
                    }}
                    className="grid h-6 w-6 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f0f0f0] hover:text-[#374151] transition-colors"
                    aria-label="More options"
                  >
                    <MoreHorizontal className="h-3.5 w-3.5" />
                  </button>

                  {/* Dropdown rendered with position:fixed so it is never clipped */}
                  {isMenuOpen && (
                    <div
                      data-comment-menu
                      style={{ position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 9999 }}
                      className="min-w-[160px] rounded-xl border border-[#eeeeee] bg-white py-1 shadow-xl"
                    >
                      {menuItems.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={item.action}
                          className={cn(
                            "flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium hover:bg-[#f8f9fb] transition-colors",
                            item.danger ? "text-red-500 hover:text-red-600" : "text-[#374151]",
                          )}
                        >
                          {item.icon}
                          {item.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* View/hide replies toggle - shown at every depth */}
          {comment.reply_count > 0 && !isEditTarget && (
            <button
              type="button"
              onClick={() => toggleReplies(comment)}
              className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-[#fd4605] hover:text-[#c0213e] transition-colors"
            >
              {expandedReplies.has(comment.id) ? (
                <><ChevronUp className="h-3 w-3" /> Hide replies</>
              ) : (
                <><ChevronDown className="h-3 w-3" /> View {comment.reply_count} {comment.reply_count === 1 ? "reply" : "replies"}</>
              )}
            </button>
          )}

        </div>
      </div>

      {/* ── Replies container - sibling to the row, NOT nested inside flex-1 ── */}
      {/* depth === 0 → add 44 px indent (first time we step in)                */}
      {/* depth  > 0 → 0 px (already inside the 44 px container; no drift)      */}
      {expandedReplies.has(comment.id) && (
        <div
          style={{
            marginLeft: isReply ? 0 : 44,
            maxWidth:   isReply ? "100%" : "calc(100% - 44px)",
            overflow:   "hidden",
            wordBreak:  "break-word",
            overflowWrap: "anywhere",
          }}
        >
          {loadingReplies.has(comment.id) && (
            <div className="flex gap-2 py-1 mt-1 animate-pulse">
              <div className="h-6 w-6 flex-shrink-0 rounded-full bg-[#f0f0f0]" />
              <div className="flex-1 space-y-1">
                <div className="h-2 w-1/3 rounded bg-[#f0f0f0]" />
                <div className="h-2 w-2/3 rounded bg-[#f0f0f0]" />
              </div>
            </div>
          )}
          {visibleReplies.map((reply) => (
            <CommentRow key={reply.id} comment={reply} depth={depth + 1} />
          ))}
          {hasMoreReplies && !loadingReplies.has(comment.id) && (
            <button
              type="button"
              onClick={() => setShownReplies((p) => ({ ...p, [comment.id]: visibleCount + REPLY_BATCH }))}
              className="mt-1 flex items-center gap-1 text-[11px] font-bold text-[#fd4605] hover:text-[#c0213e] transition-colors"
            >
              <ChevronDown className="h-3 w-3" />
              View {Math.min(allReplies.length - visibleCount, REPLY_BATCH)} more{" "}
              {allReplies.length - visibleCount === 1 ? "reply" : "replies"}
            </button>
          )}
        </div>
      )}
      </>
    );
  }

  /* ── Filtered / sorted comment list ─────────────────────────────────────── */
  const filteredComments = useMemo(() => {
    let list = [...comments];
    if (commentFilter === "top") {
      list = list.sort((a, b) => (b.love_count - b.dislike_count) - (a.love_count - a.dislike_count));
    } else if (commentFilter === "newest") {
      list = list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    } else if (commentFilter === "following") {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      list = list.filter(c => (c.user as any)?.is_following === true);
    }
    // Always float pinned comments to top
    const pinned = list.filter(c => c.is_pinned);
    const rest   = list.filter(c => !c.is_pinned);
    return [...pinned, ...rest];
  }, [comments, commentFilter]);

  /* ─── Comments-disabled state ───────────────────────────────────────────── */
  if (!allowComments) {
    return (
      <div className={cn("flex flex-col min-h-0 items-center justify-center gap-4 px-6 py-14", className)}>
        {/* Icon */}
        <div className="relative grid h-16 w-16 place-items-center rounded-full bg-[#f3f4f6]">
          <MessageCircleOff className="h-8 w-8 text-[#9ca3af]" strokeWidth={1.5} />
        </div>
        {/* Text */}
        <div className="text-center">
          <p className="text-[15px] font-bold text-[#111827]">Comments are turned off</p>
          <p className="mt-1 text-[12.5px] leading-snug text-[#9ca3af]">
            The creator has disabled comments on this video.
          </p>
        </div>
      </div>
    );
  }

  /* ─── Render ────────────────────────────────────────────────────────────── */
  return (
    <div className={cn("flex flex-col min-h-0", className)}>

      {/* ── Filter bar ── */}
      <div className="flex flex-shrink-0 gap-2 overflow-x-auto border-b border-[#f3f4f6] px-4 py-2" style={{ scrollbarWidth: "none" }}>
        {([
          { key: "all"       as const, label: "All",       icon: null                                           },
          { key: "top"       as const, label: "Top",       icon: <Flame   className="h-3.5 w-3.5" />           },
          { key: "newest"    as const, label: "Newest",    icon: <Clock   className="h-3.5 w-3.5" />           },
          { key: "following" as const, label: "Following", icon: <Users   className="h-3.5 w-3.5" />           },
        ]).map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setCommentFilter(key)}
            className={cn(
              "flex flex-shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold transition-colors",
              commentFilter === key
                ? "bg-[#fd4605] text-white"
                : "bg-[#f3f4f6] text-[#5f6675] hover:bg-[#eeeeee] hover:text-[#111827]",
            )}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* ── Comment list ── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-3 space-y-3">
        {commentsQ.isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex animate-pulse gap-2.5">
              <div className="h-8 w-8 rounded-full bg-[#f0f0f0] flex-shrink-0" />
              <div className="flex-1 space-y-1.5 py-0.5">
                <div className="h-2.5 w-1/3 rounded bg-[#f0f0f0]" />
                <div className="h-2.5 w-2/3 rounded bg-[#f0f0f0]" />
              </div>
            </div>
          ))
        ) : filteredComments.length === 0 ? (
          <div className="flex flex-col items-center justify-center px-4 pb-16 pt-8 text-center">
            <NoCommentsIcon />
            <p className="mt-4 text-[15px] font-semibold text-[#374151]">
              {commentFilter === "following"
                ? "No comments from people you follow."
                : isAuth ? "Be the first to comment." : "No comments yet."}
            </p>
            <p className="mt-1 text-[13px] text-[#9ca3af]">
              {commentFilter === "following"
                ? "Follow more creators to see their comments here."
                : isAuth ? "Start the conversation!" : "Log in to join the conversation."}
            </p>
          </div>
        ) : (
          filteredComments.map((c) => <CommentRow key={c.id} comment={c} depth={0} />)
        )}
      </div>

      {/* ── Comment input ── */}
      <div className="border-t border-[#eeeeee] px-3 py-3">
        {replyTo && (
          <div className="mb-2 flex items-center justify-between rounded-xl bg-[#f8f9fb] px-3 py-1.5">
            <p className="text-[12px] text-[#5f6675]">
              Replying to <span className="font-bold text-[#fd4605]">@{replyTo.user?.username}</span>
            </p>
            <button type="button" onClick={() => setReplyTo(null)} className="text-[#9aa1ad] hover:text-black">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* GIF preview */}
        {selectedGif && (
          <div className="mb-2 inline-flex items-start gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedGif.previewUrl || selectedGif.url} alt="GIF" className="rounded-xl" style={{ maxWidth: 120, maxHeight: 80, objectFit: "cover" }} />
            <button type="button" onClick={() => setSelectedGif(null)} className="grid h-5 w-5 place-items-center rounded-full bg-[#f0f0f0] text-[#9ca3af] hover:text-black">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {/* Selected photo preview */}
        {selectedImage && (
          <div className="mb-2 inline-flex items-start gap-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={selectedImage.previewUrl} alt="Selected photo" className="rounded-xl" style={{ maxWidth: 120, maxHeight: 80, objectFit: "cover" }} />
            <button type="button" onClick={() => setSelectedImage(null)} className="grid h-5 w-5 place-items-center rounded-full bg-[#f0f0f0] text-[#9ca3af] hover:text-black">
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="flex items-end gap-1.5">
          <div className="self-center">
            <CAvatar key={authUser?.avatar ?? "none"} src={authUser?.avatar} name={authUser?.name} size={34} />
          </div>

          {!isAuth ? (
            <button
              type="button"
              onClick={() => openAuth("login")}
              className="flex-1 rounded-2xl border border-[#eeeeee] bg-[#f8f9fb] px-3 py-2 text-left text-[13px] text-[#9ca3af] hover:border-[#fd4605] hover:bg-white transition-colors"
              style={{ minHeight: 40 }}
            >
              Log in to comment…
            </button>
          ) : (
            <MentionInput
              inputRef={inputRef}
              value={draft}
              onChange={(v) => setDraft(v.slice(0, 1000))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); }
              }}
              placeholder={replyTo ? `Reply to @${replyTo.user?.username}…` : "Add a comment…"}
              disabled={postMut.isPending}
              rows={1}
              maxLength={1000}
              className="w-full resize-none rounded-2xl border border-[#eeeeee] bg-[#f8f9fb] px-3 py-2 text-[13px] text-black outline-none focus:border-[#fd4605] disabled:opacity-60"
              style={{ maxHeight: 120 }}
            />
          )}

          {/* Emoji button + picker */}
          {isAuth && (
            <div ref={emojiRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => { setEmojiOpen((o) => !o); setGifOpen(false); }}
                className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f0f0f0] hover:text-[#fd4605] transition-colors"
                aria-label="Emoji"
              >
                <Smile className="h-4 w-4" />
              </button>
              {emojiOpen && (
                <div className="absolute bottom-10 right-0 z-[200]">
                  <Suspense fallback={<div className="h-[350px] w-[300px] animate-pulse rounded-2xl bg-[#f0f0f0]" />}>
                    <EmojiPicker
                      onEmojiClick={(e: { emoji: string }) => insertEmoji(e.emoji)}
                      // Render OS-native emoji glyphs instead of fetching PNG sprites
                      // from a CDN, which the site CSP (img-src) blocks → broken images.
                      emojiStyle={"native" as never}
                      lazyLoadEmojis
                      searchDisabled={false}
                      skinTonesDisabled
                      height={350}
                      width={300}
                    />
                  </Suspense>
                </div>
              )}
            </div>
          )}

          {/* GIF button + picker */}
          {isAuth && (
            <div ref={gifRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => { setGifOpen((o) => !o); setEmojiOpen(false); }}
                className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f0f0f0] hover:text-[#fd4605] transition-colors"
                aria-label="GIF"
              >
                <GifGlyph className="h-4 w-4" />
              </button>
              {gifOpen && (
                <div className="absolute bottom-10 right-0 z-[200]">
                  <GifPicker
                    onSelect={(gif) => { setSelectedGif(gif); setGifOpen(false); }}
                    onClose={() => setGifOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Photo button - a real device upload, distinct from the GIF search above */}
          {isAuth && (
            <>
              <input
                ref={imageInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = ""; // so picking the same file again still fires onChange
                  if (!file) return;
                  // Mirrors the backend's own limit (CommentController::uploadDocuments-style
                  // validation: image max:5120 KB) so a too-large file is caught before upload
                  // rather than surfacing as a 422 after the picker already closed.
                  if (file.size > 5 * 1024 * 1024) {
                    toast.error("Photo must be 5MB or smaller.");
                    return;
                  }
                  setSelectedGif(null);
                  setSelectedImage({ file, previewUrl: URL.createObjectURL(file) });
                }}
              />
              <button
                type="button"
                onClick={() => imageInputRef.current?.click()}
                className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f0f0f0] hover:text-[#fd4605] transition-colors"
                aria-label="Add photo"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
            </>
          )}

          {/* Gift button + picker - not shown to the video's own owner (can't gift yourself) */}
          {isAuth && !!myId && !!videoOwnerId && !isVideoOwner && (
            <div ref={giftRef} className="relative flex-shrink-0">
              <button
                type="button"
                onClick={() => { setGiftOpen((o) => !o); setEmojiOpen(false); setGifOpen(false); }}
                className="grid h-8 w-8 place-items-center rounded-full text-[#9ca3af] hover:bg-[#f0f0f0] hover:text-[#fd4605] transition-colors"
                aria-label="Send a gift"
              >
                <GiftIcon className="h-4 w-4" />
              </button>
              {giftOpen && (
                <div className="absolute bottom-10 right-0 z-[200]">
                  <GiftPicker
                    videoId={videoId}
                    receiverId={videoOwnerId}
                    myId={myId!}
                    onSent={() => qc.invalidateQueries({ queryKey: ["video-comments", videoId] })}
                    onClose={() => setGiftOpen(false)}
                  />
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={isAuth ? submit : () => openAuth("login")}
            disabled={isAuth && (!draft.trim() && !selectedGif && !selectedImage) || postMut.isPending}
            aria-label="Post comment"
            className={cn(
              "mb-0.5 grid h-9 w-9 flex-shrink-0 place-items-center rounded-full transition",
              (!isAuth || ((draft.trim() || selectedGif || selectedImage) && !postMut.isPending))
                ? "bg-[#fd4605] text-white hover:bg-[#e03e04]"
                : "bg-[#f0f0f0] text-[#9aa1ad]",
            )}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deletingId && (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black/50 px-4">
          <div className="w-full max-w-xs rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="text-[15px] font-bold text-[#111827]">Delete this comment?</h3>
            <p className="mt-1 text-[13px] text-[#6b7280]">This action cannot be undone.</p>
            <div className="mt-5 flex gap-2">
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 rounded-xl border border-[#eeeeee] py-2.5 text-[13px] font-semibold text-[#374151] hover:bg-[#f8f9fb] transition"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteMut.mutate(deletingId)}
                disabled={deleteMut.isPending}
                className="flex-1 rounded-xl bg-[#fd4605] py-2.5 text-[13px] font-semibold text-white hover:bg-[#e03e04] disabled:opacity-60 transition"
              >
                {deleteMut.isPending ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Report modal ── */}
      {reportingId && (
        <ReportModal
          entityType="comment"
          entityId={reportingId}
          onClose={() => setReportingId(null)}
          onSubmitted={() => toast.success("Comment reported")}
        />
      )}

      {/* ── Photo lightbox - logged-in only (the button that opens this is
           itself gated on isAuth in CommentRow), enlarges a comment's photo ── */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-[1400] flex items-center justify-center bg-black/80 px-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            className="absolute top-4 right-4 grid h-9 w-9 place-items-center rounded-full bg-black/40 text-white hover:bg-black/60"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Photo"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
          />
        </div>
      )}
    </div>
  );
}
