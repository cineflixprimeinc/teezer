"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { onNotificationEvent, overlayPending } from "@/services/realtime/notification-stream";
import {
  AlertTriangle,
  ArrowUpRight,
  AtSign,
  Bell,
  Check,
  CheckCircle2,
  ChevronDown,
  Bookmark,
  Circle,
  Eye,
  Flag,
  Gift,
  Handshake,
  Heart,
  MessageCircle,
  MoreVertical,
  Music,
  Play,
  Radio,
  Repeat2,
  Search,
  Settings2,
  Share2,
  Shield,
  Tag,
  UserCheck,
  UserPlus,
  X,
} from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import { AppShell } from "@/components/layout/app-shell";

/* ── Types ─────────────────────────────────────────────────────── */
type NotifType =
  | "follow" | "follow_request" | "follow_request_accepted"
  | "like" | "comment" | "mention" | "remix"
  | "system" | "live" | "verification" | "report_actioned"
  | "restriction_applied" | "restriction_lifted"
  | "message_request" | "message_request_accepted" | "report_update"
  | "follow_request_rejected"
  // Types the server has been sending all along that this union never named,
  // so each one fell through TYPE_META to the generic "system" shield badge -
  // a reply, a save and a gift all looked like a platform announcement. See
  // NotificationService::AGG and the notify() call sites for the full set.
  | "reply" | "comment_like" | "save" | "share" | "repost" | "sound" | "post"
  | "story_react" | "story_reply" | "story_repost"
  | "profile_view" | "gift_received"
  // Explicit media tagging ("Tag people" / "Paid partnership") - distinct
  // from "mention" (an @username typed into a caption/comment): these carry
  // a pending/approve/decline step, see NotifRow's action buttons below.
  | "tag_request" | "tag_request_accepted" | "tag_request_rejected"
  | "collab_request" | "collab_request_accepted" | "collab_request_rejected";

type TabId = "all" | "mentions" | "tagged" | "likes" | "comments" | "followers" | "system";
type ReadFilter = "all" | "unread" | "read";
type DateFilter = "all" | "today" | "7days" | "30days";

interface Actor { id: number; username: string; name?: string; avatar: string | null }
interface Notif {
  /** Canonical destination, decided server-side (App\Services\DeepLinkService).
   *  Preferred over the per-component type->URL guessing below. */
  deep_link?: string | null;
  id: string | number;
  type: NotifType;
  message: string;
  title?: string;
  entity_type?: string;
  entity_id?: number;
  is_read: boolean;
  actor?: Actor | null;
  created_at: string;
  thumbnail?: string;
  extraActors?: Actor[];
  extraCount?: number;
  // Server-side aggregation surface (NotificationService groups repeat events
  // into one row and lists the actors). Without these the avatar stack and the
  // "and N others" count were dead on this page, even though every aggregated
  // row arrives carrying them.
  actors?: Actor[];
  actor_count?: number;
  is_aggregated?: boolean;
  actionLabel?: string;
  actionVariant?: "primary" | "outline";
  action_status?: "pending" | "approved" | "rejected";
  metadata?: {
    restriction_type?: string;
    restriction_name?: string;
    reason?: string;
    start_date?: string;
    end_date?: string;
    lifted_date?: string;
    status?: "active" | "lifted";
  };
}

/** Aggregated rows carry their own actor list and unique-actor count; the
 *  avatar stack below reads extraActors/extraCount, so map one onto the other
 *  rather than have two shapes for the same thing. Mirrors the activity
 *  drawer's mapNotif exactly. */
function mapNotif(it: any): Notif {
  const actors: Actor[] = Array.isArray(it.actors) ? it.actors : [];
  return {
    ...it,
    actors,
    extraActors: it.is_aggregated ? actors : it.extraActors,
    extraCount:  it.is_aggregated ? it.actor_count : it.extraCount,
  };
}

/* ── Helpers ───────────────────────────────────────────────────── */
const GRADS = [
  "linear-gradient(135deg,#cc2b5e,#753a88)",
  "linear-gradient(135deg,#f77f00,#d62828)",
  "linear-gradient(135deg,#134e5e,#71b280)",
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#fd4605,#b83203)",
  "linear-gradient(135deg,#2193b0,#6dd5ed)",
];
function grad(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRADS[Math.abs(h) % GRADS.length];
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)     return "just now";
  if (d < 3600)   return `${Math.floor(d / 60)}m ago`;
  if (d < 86400)  return `${Math.floor(d / 3600)}h ago`;
  if (d < 604800) return `${Math.floor(d / 86400)}d ago`;
  return `${Math.floor(d / 604800)}w ago`;
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-IN", {
    day: "numeric", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}
function typeToTab(t: NotifType): TabId {
  if (t === "follow" || t === "follow_request" || t === "follow_request_accepted") return "followers";
  if (t === "follow_request_rejected") return "followers";
  if (t === "like" || t === "comment_like") return "likes";
  if (t === "comment" || t === "reply")     return "comments";
  if (t === "mention") return "mentions";
  if (t === "tag_request" || t === "tag_request_accepted" || t === "tag_request_rejected"
    || t === "collab_request" || t === "collab_request_accepted" || t === "collab_request_rejected") return "tagged";
  if (
    t === "system" || t === "live" || t === "verification" || t === "report_actioned" ||
    t === "restriction_applied" || t === "restriction_lifted" ||
    t === "message_request" || t === "report_update"
  ) return "system";
  return "all";
}
function inDateRange(iso: string, f: DateFilter) {
  if (f === "all") return true;
  const ms = Date.now() - new Date(iso).getTime();
  if (f === "today")  return ms < 86400_000;
  if (f === "7days")  return ms < 7 * 86400_000;
  if (f === "30days") return ms < 30 * 86400_000;
  return true;
}

/* ── Type metadata ─────────────────────────────────────────────── */
const TYPE_META: Record<string, { Icon: React.ElementType; bg: string; color: string; label: string }> = {
  follow:                  { Icon: UserPlus,       bg: "#dbeafe", color: "#2563eb", label: "New Follower" },
  follow_request:          { Icon: UserPlus,       bg: "#fef3c7", color: "#d97706", label: "Follow Request" },
  follow_request_accepted: { Icon: UserCheck,      bg: "#dcfce7", color: "#16a34a", label: "Request Accepted" },
  like:                    { Icon: Heart,          bg: "#fce7f3", color: "#db2777", label: "Like" },
  comment:                 { Icon: MessageCircle,  bg: "#f3f4f6", color: "#374151", label: "Comment" },
  mention:                 { Icon: AtSign,         bg: "#fef3c7", color: "#d97706", label: "Mention" },
  remix:                   { Icon: Repeat2,        bg: "#ede9fe", color: "#7c3aed", label: "Remix" },
  system:                  { Icon: Shield,         bg: "#dbeafe", color: "#2563eb", label: "System" },
  live:                    { Icon: Radio,          bg: "#fee2e2", color: "#dc2626", label: "Live" },
  verification:            { Icon: Shield,         bg: "#dbeafe", color: "#2563eb", label: "Verification" },
  report_actioned:         { Icon: Flag,           bg: "#fef3c7", color: "#d97706", label: "Report Update" },
  restriction_applied:     { Icon: AlertTriangle,  bg: "#fee2e2", color: "#dc2626", label: "Restriction" },
  restriction_lifted:      { Icon: CheckCircle2,   bg: "#dcfce7", color: "#16a34a", label: "Lifted" },
  message_request:         { Icon: MessageCircle,  bg: "#ede9fe", color: "#7c3aed", label: "Message" },
  report_update:           { Icon: Flag,           bg: "#fef3c7", color: "#d97706", label: "Report" },
  tag_request:             { Icon: Tag,            bg: "#fef3c7", color: "#d97706", label: "Tag Request" },
  tag_request_accepted:    { Icon: Tag,            bg: "#dcfce7", color: "#16a34a", label: "Tag Approved" },
  tag_request_rejected:    { Icon: Tag,            bg: "#f3f4f6", color: "#6b7280", label: "Tag Declined" },
  collab_request:          { Icon: Handshake,      bg: "#fef3c7", color: "#d97706", label: "Collab Request" },
  collab_request_accepted: { Icon: Handshake,      bg: "#dcfce7", color: "#16a34a", label: "Collab Approved" },
  collab_request_rejected: { Icon: Handshake,      bg: "#f3f4f6", color: "#6b7280", label: "Collab Declined" },
  follow_request_rejected: { Icon: UserPlus,       bg: "#f3f4f6", color: "#6b7280", label: "Request Declined" },
  message_request_accepted:{ Icon: MessageCircle,  bg: "#dcfce7", color: "#16a34a", label: "Message Accepted" },
  reply:                   { Icon: MessageCircle,  bg: "#f3f4f6", color: "#374151", label: "Reply" },
  comment_like:            { Icon: Heart,          bg: "#fce7f3", color: "#db2777", label: "Comment Like" },
  save:                    { Icon: Bookmark,       bg: "#fef3c7", color: "#d97706", label: "Save" },
  share:                   { Icon: Share2,         bg: "#dbeafe", color: "#2563eb", label: "Share" },
  repost:                  { Icon: Repeat2,        bg: "#ede9fe", color: "#7c3aed", label: "Repost" },
  sound:                   { Icon: Music,          bg: "#ede9fe", color: "#7c3aed", label: "Sound" },
  post:                    { Icon: Play,           bg: "#fce7f3", color: "#db2777", label: "New Post" },
  story_react:             { Icon: Circle,         bg: "#fce7f3", color: "#db2777", label: "Story Reaction" },
  story_reply:             { Icon: Circle,         bg: "#f3f4f6", color: "#374151", label: "Story Reply" },
  story_repost:            { Icon: Circle,         bg: "#ede9fe", color: "#7c3aed", label: "Story Repost" },
  profile_view:            { Icon: Eye,            bg: "#f3f4f6", color: "#6b7280", label: "Profile View" },
  gift_received:           { Icon: Gift,           bg: "#fef3c7", color: "#d97706", label: "Gift" },
};

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "all",       label: "All",       Icon: Bell          },
  { id: "mentions",  label: "Mentions",  Icon: AtSign        },
  { id: "tagged",    label: "Tagged",    Icon: Tag           },
  { id: "likes",     label: "Likes",     Icon: Heart         },
  { id: "comments",  label: "Comments",  Icon: MessageCircle },
  { id: "system",    label: "System",    Icon: Settings2     },
  { id: "followers", label: "Followers", Icon: UserPlus      },
];

/* ── Mini avatar ───────────────────────────────────────────────── */
function MiniAvatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.replace(/[^a-zA-Z ]/g, "").split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "RS";
  return (
    <div
      className="rounded-full flex-shrink-0 overflow-hidden grid place-items-center font-bold text-white"
      style={{ width: size, height: size, background: (!src || err) ? grad(name) : undefined }}
    >
      {src && !err
        // eslint-disable-next-line @next/next/no-img-element
        ? <img src={src} alt={name} onError={() => setErr(true)} className="w-full h-full object-cover" />
        : <span style={{ fontSize: Math.round(size * 0.36) }}>{initials}</span>
      }
    </div>
  );
}

/* ── Type badge ─────────────────────────────────────────────────── */
function TypeBadge({ type }: { type: NotifType }) {
  const m = TYPE_META[type] ?? TYPE_META.system;
  return (
    <div
      className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white"
      style={{ background: m.bg }}
    >
      <m.Icon className="h-2.5 w-2.5" style={{ color: m.color }} fill={type === "like" ? m.color : "none"} strokeWidth={2.5} />
    </div>
  );
}

/* ── Skeleton card ──────────────────────────────────────────────── */
function SkeletonCard() {
  return (
    <div className="flex items-start gap-3 px-4 py-4 animate-pulse">
      <div className="h-11 w-11 rounded-full bg-[#f3f4f6] flex-shrink-0" />
      <div className="flex-1 space-y-2.5 min-w-0 pt-1">
        <div className="h-3 w-20 rounded-full bg-[#f3f4f6]" />
        <div className="h-3.5 w-3/4 rounded-full bg-[#f3f4f6]" />
        <div className="h-2.5 w-1/4 rounded-full bg-[#f3f4f6]" />
      </div>
      <div className="h-12 w-12 rounded-xl bg-[#f3f4f6] flex-shrink-0" />
    </div>
  );
}

/* ── Three-dot menu ─────────────────────────────────────────────── */
function ThreeDotMenu({
  isRead, onMarkRead, onDelete, isOpen, onToggle, onClose,
}: {
  isRead: boolean;
  onMarkRead: () => void;
  onDelete: () => void;
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!isOpen) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [isOpen, onClose]);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(); }}
        className="grid h-8 w-8 place-items-center rounded-full text-[#9aa1ad] transition hover:bg-[#f3f4f6] hover:text-[#5f6675] opacity-0 group-hover:opacity-100 focus:opacity-100"
        aria-label="More options"
      >
        <MoreVertical className="h-4 w-4" />
      </button>
      {isOpen && (
        <div
          className="absolute right-0 top-9 z-50 min-w-[190px] rounded-2xl border border-[#f3f4f6] bg-white shadow-xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {!isRead && (
            <button
              onClick={() => { onMarkRead(); onClose(); }}
              className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#374151] hover:bg-[#f8f9fb] transition-colors"
            >
              <Check className="h-4 w-4 text-[#5f6675]" />
              Mark as read
            </button>
          )}
          <button
            onClick={() => { onDelete(); onClose(); }}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#374151] hover:bg-[#f8f9fb] transition-colors"
          >
            <X className="h-4 w-4 text-[#5f6675]" />
            Delete notification
          </button>
          <button
            onClick={onClose}
            className="flex w-full items-center gap-2.5 px-4 py-3 text-[13px] font-medium text-[#374151] hover:bg-[#f8f9fb] transition-colors border-t border-[#f3f4f6]"
          >
            <Flag className="h-4 w-4 text-[#5f6675]" />
            Report issue
          </button>
        </div>
      )}
    </div>
  );
}

/* ── System / restriction detail panel ──────────────────────────── */
function DetailPanel({
  notif, onClose, onMarkRead,
}: {
  notif: Notif | null;
  onClose: () => void;
  onMarkRead: (id: string | number) => void;
}) {
  if (!notif) return null;
  const m = notif.metadata;
  const isRestriction = notif.type === "restriction_applied" || notif.type === "restriction_lifted";
  const isActive = m?.status === "active";

  return (
    <>
      <div aria-hidden className="fixed inset-0 z-[49] bg-black/30" onClick={onClose} />
      <div className="fixed inset-y-0 right-0 z-[50] w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden rounded-l-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div
              className="grid h-9 w-9 place-items-center rounded-full"
              style={{ background: isRestriction ? (isActive ? "#fee2e2" : "#dcfce7") : "#fff3ec" }}
            >
              {isRestriction
                ? (isActive
                    ? <AlertTriangle className="h-4.5 w-4.5 text-[#dc2626]" />
                    : <CheckCircle2 className="h-4.5 w-4.5 text-[#16a34a]" />)
                : <Shield className="h-4 w-4 text-[#fd4605]" />
              }
            </div>
            <div>
              <p className="text-[15px] font-bold text-[#111827] leading-tight">
                {notif.title ?? (isRestriction ? "Account Restriction" : "System Notice")}
              </p>
              <p className="text-[11px] text-[#9aa1ad]">{fmtDate(notif.created_at)}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
          {/* Message */}
          <div className="rounded-2xl bg-[#f8f9fb] border border-[#f3f4f6] p-4">
            <p className="text-[14px] text-[#374151] leading-relaxed">{notif.message}</p>
          </div>

          {/* Restriction details */}
          {isRestriction && m && (
            <>
              <div className="rounded-2xl border border-[#f3f4f6] bg-white overflow-hidden">
                <div className="bg-[#f8f9fb] border-b border-[#f3f4f6] px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">Restriction Details</p>
                </div>
                <div className="divide-y divide-[#f3f4f6]">
                  <DetailRow label="Restriction Type" value={m.restriction_name ?? "Account Restriction"} />
                  <DetailRow
                    label="Status"
                    value={isActive ? "Active" : "Lifted"}
                    valueClass={isActive ? "text-[#dc2626] font-bold" : "text-[#16a34a] font-bold"}
                  />
                  <DetailRow label="Applied by" value="Teezer" />
                  {m.reason     && <DetailRow label="Reason"     value={m.reason} />}
                  {m.start_date && <DetailRow label="Start Date" value={fmtDate(m.start_date)} />}
                  {m.end_date && !m.lifted_date && <DetailRow label="End Date"    value={fmtDate(m.end_date)} />}
                  {m.lifted_date && <DetailRow label="Lifted On" value={fmtDate(m.lifted_date)} />}
                </div>
              </div>

              <div className="rounded-2xl border border-[#f3f4f6] bg-white overflow-hidden">
                <div className="bg-[#f8f9fb] border-b border-[#f3f4f6] px-4 py-2.5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">What this means</p>
                </div>
                <div className="px-4 py-3 space-y-2.5">
                  {isActive ? (
                    <>
                      <BulletItem ok={false} text="You cannot send new DM requests to people you don't follow" />
                      <BulletItem ok={true}  text="You can still reply to existing conversations" />
                      <BulletItem ok={true}  text="You can still receive messages from others" />
                      <BulletItem ok={true}  text="This restriction will be automatically lifted on the end date" />
                    </>
                  ) : (
                    <>
                      <BulletItem ok={true} text="Your messaging restriction has been lifted" />
                      <BulletItem ok={true} text="You can now send new DM requests normally" />
                      <BulletItem ok={true} text="All messaging features are restored" />
                    </>
                  )}
                </div>
              </div>
            </>
          )}

          {/* System message reason */}
          {!isRestriction && m?.reason && (
            <div className="rounded-2xl border border-[#f3f4f6] bg-white p-4">
              <p className="text-[11.5px] font-bold text-[#9aa1ad] mb-1.5 uppercase tracking-wider">Details</p>
              <p className="text-[13.5px] text-[#374151] leading-relaxed">{m.reason}</p>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="flex-shrink-0 border-t border-[#f3f4f6] px-5 py-4 space-y-2.5">
          {isRestriction && (
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#fd4605] py-3 text-[14px] font-bold text-white hover:bg-[#e03e04] transition-colors">
              <ArrowUpRight className="h-4 w-4" />
              View Community Guidelines
            </button>
          )}
          {isRestriction && isActive && (
            <button className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e5e7eb] py-3 text-[14px] font-semibold text-[#374151] hover:bg-[#f8f9fb] transition-colors">
              <Flag className="h-4 w-4" />
              Appeal / Contact Support
            </button>
          )}
          {!notif.is_read && (
            <button
              onClick={() => { onMarkRead(notif.id); onClose(); }}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-[#e5e7eb] py-3 text-[14px] font-semibold text-[#374151] hover:bg-[#f8f9fb] transition-colors"
            >
              <Check className="h-4 w-4" />
              Mark as read
            </button>
          )}
        </div>
      </div>
    </>
  );
}

function DetailRow({ label, value, valueClass = "text-[#374151]" }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-3">
      <span className="text-[12px] text-[#9aa1ad] flex-shrink-0">{label}</span>
      <span className={cn("text-[13px] text-right leading-snug", valueClass)}>{value}</span>
    </div>
  );
}

function BulletItem({ ok, text }: { ok: boolean; text: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className={cn("mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full", ok ? "bg-[#16a34a]" : "bg-[#dc2626]")}>
        {ok ? <Check className="h-2.5 w-2.5 text-white" /> : <X className="h-2.5 w-2.5 text-white" />}
      </div>
      <p className="text-[13px] text-[#374151] leading-relaxed">{text}</p>
    </div>
  );
}

/* ── Error state ────────────────────────────────────────────────── */
function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center px-8">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#fff3ec] to-[#fce7f3]">
        <Bell className="h-9 w-9 text-[#fd4605] opacity-60" />
      </div>
      <div className="space-y-2">
        <p className="text-[17px] font-bold text-[#111827]">Couldn&apos;t load notifications</p>
        <p className="text-[13.5px] text-[#9aa1ad] max-w-xs leading-relaxed mx-auto">
          Something went wrong reaching Teezer. Check your connection and try again.
        </p>
      </div>
      <button
        onClick={onRetry}
        className="rounded-xl border border-[#e5e7eb] px-5 py-2.5 text-[13.5px] font-semibold text-[#5f6675] transition hover:border-[#fd4605] hover:text-[#fd4605]"
      >
        Try again
      </button>
    </div>
  );
}

/* ── Empty state ────────────────────────────────────────────────── */
function EmptyState({ hasFilters }: { hasFilters: boolean }) {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center px-8">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-[#fff3ec] to-[#fce7f3]">
        <Bell className="h-9 w-9 text-[#fd4605] opacity-60" />
      </div>
      <div className="space-y-2">
        <p className="text-[17px] font-bold text-[#111827]">
          {hasFilters ? "No matching notifications" : "No notifications yet"}
        </p>
        <p className="text-[13.5px] text-[#9aa1ad] max-w-xs leading-relaxed mx-auto">
          {hasFilters
            ? "Try adjusting your filters or search to find what you're looking for."
            : "When someone likes, comments, follows, or mentions you, or Teezer sends updates, they'll appear here."
          }
        </p>
      </div>
    </div>
  );
}

/* ── Notification row ───────────────────────────────────────────── */
function NotifRow({
  n, onMarkRead, onDelete, onOpenDetail, onApprove, onReject,
  isMenuOpen, onMenuToggle, onMenuClose,
}: {
  n: Notif;
  onMarkRead: (id: string | number) => void;
  onDelete: (id: string | number) => void;
  onOpenDetail: (n: Notif) => void;
  onApprove?: (id: string | number) => void;
  onReject?: (id: string | number) => void;
  isMenuOpen: boolean;
  onMenuToggle: () => void;
  onMenuClose: () => void;
}) {
  const router = useRouter();
  const isTagOrCollab = n.type === "tag_request" || n.type === "collab_request";

  function navigate() {
    if ((n.type === "follow_request" || isTagOrCollab) && n.action_status === "pending") return;
    onMarkRead(n.id);
    // The server decides where a notification goes. Everything below is the
    // legacy per-type guessing, kept only for rows served before `deep_link`
    // existed - two copies of that mapping had already drifted apart.
    if (n.deep_link) { router.push(n.deep_link); return; }
    const isAdminEntity = n.entity_type === "admin_message" || n.entity_type === "admin_action";
    const isSystemType  = n.type === "system" || n.type === "restriction_applied" || n.type === "restriction_lifted" || n.type === "verification" || n.type === "report_actioned" || n.type === "report_update";
    if (isAdminEntity || isSystemType) { onOpenDetail(n); return; }
    if ((n.type === "follow" || n.type === "follow_request" || n.type === "follow_request_accepted") && n.actor) { router.push(`/profile/${n.actor.username}`); return; }
    if (n.type === "like"    && n.entity_type === "video" && n.entity_id) { router.push(`/videos/${n.entity_id}`); return; }
    if (n.type === "comment" && n.entity_type === "video" && n.entity_id) { router.push(`/videos/${n.entity_id}?comments=open`); return; }
    if (n.type === "mention") {
      if (n.entity_type === "video" && n.entity_id) { router.push(`/videos/${n.entity_id}?comments=open`); return; }
      if (n.actor) { router.push(`/profile/${n.actor.username}`); return; }
    }
    if (n.type === "live")            { router.push("/live"); return; }
    if (n.type === "message_request") { router.push("/messages"); return; }
    onOpenDetail(n);
  }

  const isAdmin  = !n.actor || n.entity_type === "admin_message" || n.entity_type === "admin_action" || n.type === "system" || n.type === "restriction_applied" || n.type === "restriction_lifted";
  const actorName = isAdmin ? "Teezer" : (n.actor?.name ?? n.actor?.username ?? "Teezer");
  const meta      = TYPE_META[n.type] ?? TYPE_META.system;

  return (
    <div
      onClick={navigate}
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-2xl px-4 py-3.5 transition-all",
        !n.is_read ? "bg-[#fff7f8]" : "hover:bg-[#f8f9fb]",
      )}
    >
      {/* Avatar + badge */}
      <div className="relative flex-shrink-0">
        {isAdmin
          ? <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#fd4605] to-[#ff8a55]"><Shield className="h-5 w-5 text-white" /></div>
          : n.actor
            ? <MiniAvatar src={n.actor.avatar} name={actorName} size={44} />
            : <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: meta.bg }}>
                <meta.Icon className="h-5 w-5" style={{ color: meta.color }} />
              </div>
        }
        {!isAdmin && n.actor && <TypeBadge type={n.type} />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {/* Type label row */}
        <div className="flex items-center gap-1.5 mb-0.5">
          {isAdmin
            ? <span className="flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wider text-[#fd4605]"><Shield className="h-2.5 w-2.5" />Teezer</span>
            : <span className="text-[10.5px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
          }
        </div>
        <p className={cn("text-[13.5px] leading-snug", n.is_read ? "text-[#374151]" : "font-semibold text-[#111827]")}>
          {n.message}
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#9aa1ad]">{timeAgo(n.created_at)}</p>

        {/* Follow request actions */}
        {n.type === "follow_request" && n.action_status === "pending" && (
          <div className="mt-2 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => onApprove?.(n.id)} className="rounded-full bg-[#fd4605] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#e03e04] transition-colors">Approve</button>
            <button onClick={() => onReject?.(n.id)}  className="rounded-full border border-[#e5e7eb] px-4 py-1.5 text-[12px] font-bold text-[#374151] hover:bg-[#f8f9fb] transition-colors">Reject</button>
          </div>
        )}

        {/* Tag / collab tag actions - "Tag people" and "Paid partnership"
            require the tagged user's approval before they show publicly. */}
        {isTagOrCollab && n.action_status === "pending" && (
          <div className="mt-2 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => onApprove?.(n.id)} className="rounded-full bg-[#fd4605] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#e03e04] transition-colors">Approve</button>
            <button onClick={() => onReject?.(n.id)}  className="rounded-full border border-[#e5e7eb] px-4 py-1.5 text-[12px] font-bold text-[#374151] hover:bg-[#f8f9fb] transition-colors">Decline</button>
          </div>
        )}
        {isTagOrCollab && n.action_status === "approved" && (
          <p className="mt-2 text-[12px] font-semibold text-[#16a34a]">✓ {n.type === "collab_request" ? "Collab" : "Tag"} approved</p>
        )}
        {isTagOrCollab && n.action_status === "rejected" && (
          <p className="mt-2 text-[12px] font-semibold text-[#9aa1ad]">{n.type === "collab_request" ? "Collab" : "Tag"} declined</p>
        )}

        {/* Action button */}
        {n.actionLabel && n.type !== "follow_request" && (
          <button
            onClick={e => { e.stopPropagation(); onMarkRead(n.id); }}
            className={cn(
              "mt-2 rounded-full px-4 py-1.5 text-[12px] font-bold transition-colors",
              n.actionVariant === "primary" ? "bg-[#fd4605] text-white hover:bg-[#e03e04]" : "border border-[#e5e7eb] text-[#111827] hover:bg-[#f8f9fb]"
            )}
          >
            {n.actionLabel}
          </button>
        )}

        {/* Extra actors */}
        {n.extraActors && n.extraActors.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {n.extraActors.slice(0, 3).map(a => <MiniAvatar key={a.id} src={a.avatar} name={a.name ?? a.username} size={24} />)}
            </div>
            {n.extraCount && n.extraCount > 3 && <span className="text-[12px] font-semibold text-[#5f6675]">+{n.extraCount.toLocaleString()}</span>}
          </div>
        )}
      </div>

      {/* Right: thumbnail + unread dot + menu */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        {n.thumbnail && (
          <div className="h-12 w-12 overflow-hidden rounded-xl border border-[#eeeeee]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.thumbnail} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        {!n.is_read && <span className="h-2 w-2 rounded-full bg-[#fd4605] flex-shrink-0" />}
        <ThreeDotMenu
          isRead={n.is_read}
          onMarkRead={() => onMarkRead(n.id)}
          onDelete={() => onDelete(n.id)}
          isOpen={isMenuOpen}
          onToggle={onMenuToggle}
          onClose={onMenuClose}
        />
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   NOTIFICATIONS CENTER - main export
══════════════════════════════════════════════════════════════════ */
export function NotificationsCenter() {
  const qc = useQueryClient();

  const [notifs,        setNotifs]        = useState<Notif[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [loadingMore,   setLoadingMore]   = useState(false);
  const [hasMore,       setHasMore]       = useState(false);
  const [page,          setPage]          = useState(1);
  const [loadFailed,    setLoadFailed]    = useState(false);
  const [activeTab,     setActiveTab]     = useState<TabId>("all");
  const [readFilter,    setReadFilter]    = useState<ReadFilter>("all");
  const [dateFilter,    setDateFilter]    = useState<DateFilter>("all");
  const [search,        setSearch]        = useState("");
  const [selectedNotif, setSelectedNotif] = useState<Notif | null>(null);
  /* Rows that arrived over realtime while a request was in flight - folded back
     on top of the response rather than erased by it. See overlayPending. */
  const pendingRealtime = useRef<Map<string | number, Notif>>(new Map());
  const [openMenuId,    setOpenMenuId]    = useState<string | number | null>(null);

  const load = useCallback(async (pg = 1, append = false) => {
    if (pg === 1) pendingRealtime.current.clear();
    try {
      const { data } = await api.get(`/notifications?per_page=15&page=${pg}`);
      const items: Notif[] = (data.data ?? []).map(mapNotif);
      setNotifs(prev => append ? [...prev, ...items] : overlayPending(items, pendingRealtime.current));
      setLoadFailed(false);
      setHasMore(!!data.meta?.next_page_url);
    } catch {
      // A real failure state. This used to swap in a hard-coded SAMPLES
      // array of invented people following and liking, so a dead endpoint
      // was indistinguishable from a quiet account - and every "mark read"
      // then had to be suppressed because the rows weren't real.
      if (!append) setNotifs([]);
      setLoadFailed(true);
      setHasMore(false);
    } finally {
      setLoading(false); setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1, false); }, [load]);

  /* Realtime, off the app shell's single session-wide subscription.
   *
   * This page had no realtime at all - it fetched once on mount and then sat
   * there, so a notification arriving while it was open showed up only after a
   * manual reload. Each event carries the whole row (see
   * NotificationService::pushRealtime), so a new group is prepended and an
   * updated group is patched in place: no request per event, no duplicate row,
   * and an aggregated card that gains an actor updates where it stands rather
   * than jumping to the top. Reload is the fallback for an event the server
   * could not serialise, never the normal path. */
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const refetchSoon = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { setPage(1); load(1, false); }, 400);
    };
    const off = onNotificationEvent((e) => {
      if (e.kind === "remove") {
        setNotifs((prev) => prev.filter((n) => n.id !== e.id));
        return;
      }
      if (!e.notification) { refetchSoon(); return; }
      const incoming = mapNotif(e.notification);
      pendingRealtime.current.set(incoming.id, incoming);
      setNotifs((prev) => {
        const at = prev.findIndex((n) => n.id === incoming.id);
        if (at === -1) return [incoming, ...prev];
        // Events can overtake each other; never rewind a row to an older state.
        const held = prev[at];
        if (held.created_at && incoming.created_at && new Date(incoming.created_at) < new Date(held.created_at)) return prev;
        const next = prev.slice();
        next[at] = { ...held, ...incoming };
        return next;
      });
    });
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      off();
    };
  }, [load]);

  const markRead = useCallback((id: string | number) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    if (!loadFailed) api.post(`/notifications/${id}/read`).catch(() => {});
  }, [loadFailed]);

  const markAllRead = useCallback(() => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    if (!loadFailed) api.post("/notifications/read-all").catch(() => {});
  }, [loadFailed]);

  const deleteNotif = useCallback((id: string | number) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    if (!loadFailed) api.delete(`/notifications/${id}`).catch(() => {});
  }, [loadFailed]);

  /** Which API pair to call, by request type - follow requests, media tags
   *  ("Tag people"), and collab tags ("Paid partnership") are three
   *  different resources on the backend, all with the same pending/approve/
   *  decline shape. */
  function acceptEndpoint(type: NotifType, entityId: number): string | null {
    if (type === "follow_request") return `/users/follow-requests/${entityId}/accept`;
    if (type === "tag_request")    return `/users/tag-requests/${entityId}/accept`;
    if (type === "collab_request") return `/users/collab-requests/${entityId}/accept`;
    return null;
  }
  function declineEndpoint(type: NotifType, entityId: number): string | null {
    if (type === "follow_request") return `/users/follow-requests/${entityId}/decline`;
    if (type === "tag_request")    return `/users/tag-requests/${entityId}/decline`;
    if (type === "collab_request") return `/users/collab-requests/${entityId}/decline`;
    return null;
  }

  const approveRequest = useCallback(async (notifId: string | number) => {
    const notif = notifs.find(n => n.id === notifId);
    const endpoint = notif?.entity_id ? acceptEndpoint(notif.type, notif.entity_id) : null;
    if (!notif || !endpoint) return;
    setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "approved" as const, is_read: true } : n));
    try {
      await api.post(endpoint);
      if (notif.type === "follow_request" && notif.actor?.username) {
        void qc.invalidateQueries({ queryKey: ["profile", notif.actor.username] });
      }
    } catch {
      setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "pending" as const } : n));
    }
  }, [notifs, qc]);

  const rejectRequest = useCallback(async (notifId: string | number) => {
    const notif = notifs.find(n => n.id === notifId);
    const endpoint = notif?.entity_id ? declineEndpoint(notif.type, notif.entity_id) : null;
    if (!notif || !endpoint) return;
    setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "rejected" as const, is_read: true } : n));
    try { await api.post(endpoint); }
    catch { setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "pending" as const } : n)); }
  }, [notifs]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    load(next, true);
  }, [loadingMore, hasMore, page, load]);

  /* Filtering */
  const filtered = notifs.filter(n => {
    if (activeTab !== "all" && typeToTab(n.type) !== activeTab) return false;
    if (readFilter === "unread" &&  n.is_read) return false;
    if (readFilter === "read"   && !n.is_read) return false;
    if (!inDateRange(n.created_at, dateFilter))  return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const inMsg      = n.message.toLowerCase().includes(q);
      const inActorName = n.actor?.name?.toLowerCase().includes(q) ?? false;
      const inUsername  = n.actor?.username?.toLowerCase().includes(q) ?? false;
      if (!inMsg && !inActorName && !inUsername) return false;
    }
    return true;
  });

  const unreadCount    = notifs.filter(n => !n.is_read).length;
  const hasActiveFilters = activeTab !== "all" || readFilter !== "all" || dateFilter !== "all" || search.trim() !== "";

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 lg:px-8">

        {/* Page header */}
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-[#111827]">Notifications</h1>
            <p className="mt-1.5 text-sm text-[#5f6675]">
              Likes, comments, follows, mentions, system updates, and account alerts.
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="flex flex-shrink-0 items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2 text-[13px] font-semibold text-[#374151] shadow-sm hover:border-[#fd4605] hover:text-[#fd4605] transition-colors"
            >
              <Check className="h-3.5 w-3.5" />
              Mark all read
              <span className="rounded-full bg-[#fd4605] px-1.5 py-0.5 text-[10px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </button>
          )}
        </div>

        {/* Tab filters */}
        <div className="mb-4 flex flex-wrap gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12.5px] font-semibold transition-all whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-[#fd4605] text-white shadow-sm"
                  : "border border-[#e5e7eb] bg-white text-[#5f6675] hover:border-[#fd4605] hover:text-[#fd4605]"
              )}
            >
              <tab.Icon className="h-3.5 w-3.5 flex-shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search + secondary filters */}
        <div className="mb-5 flex flex-wrap gap-3">
          {/* Search bar */}
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9aa1ad] pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search notifications…"
              className="w-full rounded-2xl border border-[#e5e7eb] bg-white py-2.5 pl-10 pr-9 text-[13.5px] text-[#111827] placeholder-[#9aa1ad] outline-none transition focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10"
            />
            {search && (
              <button onClick={() => setSearch("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa1ad] hover:text-[#374151] transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Read filter pill group */}
          <div className="flex gap-0.5 rounded-2xl border border-[#e5e7eb] bg-white p-1">
            {(["all", "unread", "read"] as ReadFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setReadFilter(f)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors",
                  readFilter === f ? "bg-[#fd4605] text-white" : "text-[#5f6675] hover:text-[#374151]"
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Date filter pill group */}
          <div className="flex gap-0.5 rounded-2xl border border-[#e5e7eb] bg-white p-1">
            {(["all", "today", "7days", "30days"] as DateFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setDateFilter(f)}
                className={cn(
                  "rounded-xl px-3 py-1.5 text-[12px] font-semibold whitespace-nowrap transition-colors",
                  dateFilter === f ? "bg-[#111827] text-white" : "text-[#5f6675] hover:text-[#374151]"
                )}
              >
                {f === "all" ? "All time" : f === "today" ? "Today" : f === "7days" ? "7 days" : "30 days"}
              </button>
            ))}
          </div>
        </div>

        {/* Notifications card */}
        <div className="rounded-2xl border border-[#eeeeee] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)] overflow-hidden">
          {loading ? (
            <div className="divide-y divide-[#f3f4f6]">
              {Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)}
            </div>
          ) : loadFailed ? (
            <ErrorState onRetry={() => { setLoading(true); load(1, false); }} />
          ) : filtered.length === 0 ? (
            <EmptyState hasFilters={hasActiveFilters} />
          ) : (
            <div className="divide-y divide-[#f3f4f6] p-2">
              {filtered.map(n => (
                <NotifRow
                  key={n.id}
                  n={n}
                  onMarkRead={markRead}
                  onDelete={deleteNotif}
                  onOpenDetail={setSelectedNotif}
                  onApprove={approveRequest}
                  onReject={rejectRequest}
                  isMenuOpen={openMenuId === n.id}
                  onMenuToggle={() => setOpenMenuId(prev => (prev === n.id ? null : n.id))}
                  onMenuClose={() => setOpenMenuId(null)}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="border-t border-[#f3f4f6] px-4 py-3">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#5f6675] transition hover:border-[#fd4605] hover:text-[#fd4605] disabled:opacity-50"
              >
                {loadingMore
                  ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
                  : <><ChevronDown className="h-4 w-4" /> Load more</>
                }
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Detail panel for system / restriction notifications */}
      <DetailPanel
        notif={selectedNotif}
        onClose={() => setSelectedNotif(null)}
        onMarkRead={markRead}
      />
    </AppShell>
  );
}
