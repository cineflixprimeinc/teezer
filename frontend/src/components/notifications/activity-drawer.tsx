"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AtSign, Bell, Bookmark, ChevronDown, Circle, Eye, Filter, Flag, Gift, Handshake, Heart,
  MessageCircle, Music, Play, Radio, Repeat2, Settings2, Share2, Shield, Tag, UserCheck, UserPlus, X,
} from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";
import { onNotificationEvent, overlayPending } from "@/services/realtime/notification-stream";

/* ── Types ─────────────────────────────────────────────────────── */
type NotifType =
  | "follow" | "follow_request" | "follow_request_accepted" | "follow_request_rejected"
  | "like" | "comment" | "mention" | "remix" | "system" | "live" | "verification" | "report_actioned"
  // Types the server has been sending all along that this union never named,
  // so each one fell through TYPE_META to the generic "system" shield badge -
  // a reply, a save and a gift all looked like a platform announcement. See
  // NotificationService::AGG and the notify() call sites for the full set.
  | "reply" | "comment_like" | "save" | "share" | "repost" | "sound" | "post"
  | "story_react" | "story_reply" | "story_repost"
  | "profile_view" | "gift_received"
  | "message_request" | "message_request_accepted"
  // Explicit media tagging ("Tag people" / "Paid partnership") - distinct
  // from "mention" (an @username typed into a caption/comment): these carry
  // a pending/approve/decline step, see NotifRow's action buttons below.
  | "tag_request" | "tag_request_accepted" | "tag_request_rejected"
  | "collab_request" | "collab_request_accepted" | "collab_request_rejected";
type TabId = "all" | "mentions" | "tagged" | "likes" | "comments" | "followers" | "system";

interface Actor { id: number; username: string; name?: string; avatar: string | null }
interface Notif {
  /** Canonical destination, decided server-side (App\Services\DeepLinkService).
   *  Preferred over the per-component type->URL guessing below. */
  deep_link?: string | null;
  id: string | number;
  type: NotifType;
  message: string;
  entity_type?: string;
  entity_id?: number;
  /** Comment this notice is anchored to (reply/comment-like/mention rows) -
   *  /comment/{id} resolves it to a video on the way through. */
  comment_id?: number | null;
  is_read: boolean;
  actor?: Actor | null;
  created_at: string;
  thumbnail?: string;
  extraActors?: Actor[];
  extraCount?: number;
  // Server-side aggregation surface.
  actor_count?: number;
  actors?: Actor[];
  is_aggregated?: boolean;
  actionLabel?: string;
  actionVariant?: "primary" | "outline";
  action_status?: "pending" | "approved" | "rejected";
}

/** Normalize an API notification into the row shape (maps aggregation fields). */
function mapNotif(it: any): Notif {
  const actors: Actor[] = Array.isArray(it.actors) ? it.actors : [];
  return {
    ...it,
    actors,
    // Drive the avatar stack from the aggregated actor list.
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
  "linear-gradient(135deg,#fe2c55,#c02040)",
  "linear-gradient(135deg,#2193b0,#6dd5ed)",
];
function grad(s: string) {
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRADS[Math.abs(h) % GRADS.length];
}
function timeAgo(iso: string) {
  const d = (Date.now() - new Date(iso).getTime()) / 1000;
  if (d < 60)    return "just now";
  if (d < 3600)  return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}
function typeToTab(t: NotifType): TabId {
  if (t === "follow" || t === "follow_request" || t === "follow_request_accepted") return "followers";
  if (t === "follow_request_rejected") return "followers";
  if (t === "like" || t === "comment_like") return "likes";
  if (t === "comment" || t === "reply")     return "comments";
  if (t === "mention") return "mentions";
  if (t === "tag_request" || t === "tag_request_accepted" || t === "tag_request_rejected"
    || t === "collab_request" || t === "collab_request_accepted" || t === "collab_request_rejected") return "tagged";
  if (t === "system" || t === "live" || t === "verification" || t === "report_actioned") return "system";
  return "all";
}

const TYPE_META: Record<NotifType, { Icon: React.ElementType; bg: string; color: string }> = {
  follow:                  { Icon: UserPlus,      bg: "#dbeafe", color: "#2563eb" },
  follow_request:          { Icon: UserPlus,      bg: "#fef3c7", color: "#d97706" },
  follow_request_accepted: { Icon: UserCheck,     bg: "#dcfce7", color: "#16a34a" },
  like:                    { Icon: Heart,         bg: "#fce7f3", color: "#db2777" },
  comment:                 { Icon: MessageCircle, bg: "#f3f4f6", color: "#374151" },
  mention:                 { Icon: AtSign,        bg: "#fef3c7", color: "#d97706" },
  remix:                   { Icon: Repeat2,       bg: "#ede9fe", color: "#7c3aed" },
  system:                  { Icon: Shield,        bg: "#dbeafe", color: "#2563eb" },
  live:                    { Icon: Radio,         bg: "#fee2e2", color: "#dc2626" },
  verification:            { Icon: Shield,        bg: "#dbeafe", color: "#2563eb" },
  report_actioned:         { Icon: Flag,          bg: "#fef3c7", color: "#d97706" },
  tag_request:             { Icon: Tag,           bg: "#fef3c7", color: "#d97706" },
  tag_request_accepted:    { Icon: Tag,           bg: "#dcfce7", color: "#16a34a" },
  tag_request_rejected:    { Icon: Tag,           bg: "#f3f4f6", color: "#6b7280" },
  collab_request:          { Icon: Handshake,     bg: "#fef3c7", color: "#d97706" },
  collab_request_accepted: { Icon: Handshake,     bg: "#dcfce7", color: "#16a34a" },
  collab_request_rejected: { Icon: Handshake,     bg: "#f3f4f6", color: "#6b7280" },
  follow_request_rejected: { Icon: UserPlus,      bg: "#f3f4f6", color: "#6b7280" },
  reply:                   { Icon: MessageCircle, bg: "#f3f4f6", color: "#374151" },
  comment_like:            { Icon: Heart,         bg: "#fce7f3", color: "#db2777" },
  save:                    { Icon: Bookmark,      bg: "#fef3c7", color: "#d97706" },
  share:                   { Icon: Share2,        bg: "#dbeafe", color: "#2563eb" },
  repost:                  { Icon: Repeat2,       bg: "#ede9fe", color: "#7c3aed" },
  sound:                   { Icon: Music,         bg: "#ede9fe", color: "#7c3aed" },
  post:                    { Icon: Play,          bg: "#fce7f3", color: "#db2777" },
  story_react:             { Icon: Circle,        bg: "#fce7f3", color: "#db2777" },
  story_reply:             { Icon: Circle,        bg: "#f3f4f6", color: "#374151" },
  story_repost:            { Icon: Circle,        bg: "#ede9fe", color: "#7c3aed" },
  profile_view:            { Icon: Eye,           bg: "#f3f4f6", color: "#6b7280" },
  gift_received:           { Icon: Gift,          bg: "#fef3c7", color: "#d97706" },
  message_request:         { Icon: MessageCircle, bg: "#ede9fe", color: "#7c3aed" },
  message_request_accepted:{ Icon: MessageCircle, bg: "#dcfce7", color: "#16a34a" },
};

const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "all",       label: "All",       Icon: Bell           },
  { id: "mentions",  label: "Mentions",  Icon: AtSign         },
  { id: "tagged",    label: "Tagged",    Icon: Tag            },
  { id: "likes",     label: "Likes",     Icon: Heart          },
  { id: "comments",  label: "Comments",  Icon: MessageCircle  },
  { id: "system",    label: "System",    Icon: Settings2      },
  { id: "followers", label: "Followers", Icon: UserPlus       },
];

/* ── Mini avatar ───────────────────────────────────────────────── */
function MiniAvatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.replace(/[^a-zA-Z ]/g, "").split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "RS";
  return (
    <div className="rounded-full flex-shrink-0 overflow-hidden grid place-items-center font-bold text-white"
      style={{ width: size, height: size, background: (!src || err) ? grad(name) : undefined }}>
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
    <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white"
      style={{ background: m.bg }}>
      <m.Icon className="h-2.5 w-2.5" style={{ color: m.color }} fill={type === "like" ? m.color : "none"} strokeWidth={2.5} />
    </div>
  );
}

/* ── Notification row ───────────────────────────────────────────── */
function NotifRow({ n, onMarkRead, onHide, onApprove, onReject, onOpenActors }: {
  n: Notif;
  onMarkRead: (id: string | number) => void;
  onHide: (id: string | number) => void;
  onApprove?: (id: string | number) => void;
  onReject?: (id: string | number) => void;
  onOpenActors?: (n: Notif) => void;
}) {
  const router = useRouter();

  const isTagOrCollab = n.type === "tag_request" || n.type === "collab_request";
  const isPendingRequest = (n.type === "follow_request" || isTagOrCollab) && n.action_status === "pending";

  function navigate() {
    if (isPendingRequest) return;
    // Opening one IS reading it - done BEFORE routing so the early returns
    // below can't skip it. (They used to: with deep_link present the row
    // navigated but stayed unread forever.)
    onMarkRead(n.id);
    // Server-authored destination wins; the branches below are the legacy
    // fallback for rows that predate `deep_link`.
    if (n.deep_link) { router.push(n.deep_link); return; }
    if (n.entity_type === "admin_message" || n.entity_type === "admin_action") { router.push("/notifications"); return; }
    if ((n.type === "follow" || n.type === "follow_request" || n.type === "follow_request_accepted") && n.actor) { router.push(`/profile/${n.actor.username}`); return; }
    if (n.entity_type === "video" && n.entity_id) { router.push(`/video/${n.entity_id}`); return; }
    if (n.type === "live")         { router.push("/live"); return; }
    router.push("/notifications");
  }

  const isAdminMsg = !n.actor || n.entity_type === "admin_message" || n.type === "system";
  const actorName  = isAdminMsg ? "Teezer" : (n.actor?.name ?? n.actor?.username ?? "Teezer");

  return (
    <div onClick={navigate}
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-[12px] px-3 py-3 transition hover:bg-[#f8f9fb]",
        !n.is_read && "bg-[#fff7f8]",
      )}>
      <div className="relative flex-shrink-0">
        {isAdminMsg
          ? <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#fe2c55] to-[#ff7c9b]"><Shield className="h-5 w-5 text-white" /></div>
          : n.actor
            ? <MiniAvatar src={n.actor.avatar} name={actorName} size={44} />
            : <div className="flex h-11 w-11 items-center justify-center rounded-full" style={{ background: TYPE_META[n.type]?.bg ?? "#f3f4f6" }}>
                {(() => { const M = TYPE_META[n.type]; return M ? <M.Icon className="h-5 w-5" style={{ color: M.color }} /> : <Bell className="h-5 w-5 text-[#6b7280]" />; })()}
              </div>
        }
        {!isAdminMsg && n.actor && <TypeBadge type={n.type} />}
      </div>

      <div className="min-w-0 flex-1">
        {isAdminMsg && (
          <p className="text-[11px] font-semibold text-[#fe2c55] mb-0.5 flex items-center gap-1">
            <Shield className="h-2.5 w-2.5" /> Teezer
          </p>
        )}
        <p className={cn("text-[13.5px] leading-snug", n.is_read ? "text-[#374151]" : "font-semibold text-[#111827]")}>
          {n.message}
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#9aa1ad]">{timeAgo(n.created_at)}</p>

        {n.type === "follow_request" && n.action_status === "pending" && (
          <div className="mt-2 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => onApprove?.(n.id)} className="rounded-full bg-[#fe2c55] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#e02449]">Approve</button>
            <button onClick={() => onReject?.(n.id)}  className="rounded-full border border-[#e5e7eb] px-4 py-1.5 text-[12px] font-bold text-[#374151] hover:bg-[#f8f9fb]">Reject</button>
          </div>
        )}
        {isTagOrCollab && n.action_status === "pending" && (
          <div className="mt-2 flex gap-2" onClick={e => e.stopPropagation()}>
            <button onClick={() => onApprove?.(n.id)} className="rounded-full bg-[#fe2c55] px-4 py-1.5 text-[12px] font-bold text-white hover:bg-[#e02449]">Approve</button>
            <button onClick={() => onReject?.(n.id)}  className="rounded-full border border-[#e5e7eb] px-4 py-1.5 text-[12px] font-bold text-[#374151] hover:bg-[#f8f9fb]">Decline</button>
          </div>
        )}
        {isTagOrCollab && n.action_status === "approved" && (
          <p className="mt-2 text-[12px] font-semibold text-[#16a34a]">✓ {isTagOrCollab && n.type === "collab_request" ? "Collab" : "Tag"} approved</p>
        )}
        {isTagOrCollab && n.action_status === "rejected" && (
          <p className="mt-2 text-[12px] font-semibold text-[#9aa1ad]">{n.type === "collab_request" ? "Collab" : "Tag"} declined</p>
        )}
        {n.actionLabel && n.type !== "follow_request" && (
          <button onClick={e => { e.stopPropagation(); onMarkRead(n.id); }}
            className={cn("mt-2 rounded-full px-4 py-1.5 text-[12px] font-bold transition",
              n.actionVariant === "primary" ? "bg-[#fe2c55] text-white hover:bg-[#e02449]" : "border border-[#e5e7eb] text-[#111827] hover:bg-[#f8f9fb]")}>
            {n.actionLabel}
          </button>
        )}
        {n.extraActors && n.extraActors.length > 0 && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); onOpenActors?.(n); }}
            className="mt-2 flex items-center gap-1.5 rounded-full transition hover:opacity-80"
            aria-label="See everyone"
          >
            <div className="flex -space-x-2">
              {n.extraActors.slice(0, 3).map(a => <MiniAvatar key={a.id} src={a.avatar} name={a.name ?? a.username} size={24} />)}
            </div>
            {n.extraCount && n.extraCount > 3 && <span className="text-[12px] font-semibold text-[#5f6675]">+{(n.extraCount - 3).toLocaleString()}</span>}
          </button>
        )}
      </div>

      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        {n.thumbnail && (
          <div className="h-12 w-12 overflow-hidden rounded-[8px] border border-[#eeeeee]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.thumbnail} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        {!n.is_read && <span className="h-2 w-2 rounded-full bg-[#fe2c55]" />}
        <button
          onClick={e => { e.stopPropagation(); onHide(n.id); }}
          className="grid h-7 w-7 place-items-center rounded-full text-[#9aa1ad] opacity-0 transition hover:bg-[#f3f4f6] hover:text-[#5f6675] group-hover:opacity-100"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* ── Actors sheet: everyone who triggered an aggregated notification ── */
function ActorsSheet({ notif, onClose }: { notif: Notif; onClose: () => void }) {
  const router = useRouter();
  const [actors, setActors] = useState<Actor[]>(notif.actors ?? []);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);

  const fetchPage = useCallback(async (pg: number) => {
    setLoading(true);
    try {
      const { data } = await api.get(`/notifications/${notif.id}/actors?per_page=30&page=${pg}`);
      const items: Actor[] = data.data ?? [];
      setActors(prev => pg === 1 ? items : [...prev, ...items]);
      setHasMore(!!data.meta?.next_page_url);
    } catch { setHasMore(false); }
    finally { setLoading(false); }
  }, [notif.id]);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  return (
    <div className="fixed inset-0 z-[45] flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40" />
      <div
        className="relative z-[46] flex max-h-[70vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
          <span className="text-[15px] font-extrabold text-[#111827]">
            {notif.actor_count ? `${notif.actor_count.toLocaleString()} ` : ""}people
          </span>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6]">
            <X className="h-[18px] w-[18px]" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {actors.map(a => (
            <button
              key={a.id}
              onClick={() => { onClose(); router.push(`/profile/${a.username}`); }}
              className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2 text-left transition hover:bg-[#f8f9fb]"
            >
              <MiniAvatar src={a.avatar} name={a.name ?? a.username} size={40} />
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold text-[#111827]">{a.name ?? a.username}</p>
                <p className="truncate text-[12px] text-[#9aa1ad]">@{a.username}</p>
              </div>
            </button>
          ))}
          {hasMore && (
            <button
              onClick={() => { const n = page + 1; setPage(n); fetchPage(n); }}
              disabled={loading}
              className="mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#5f6675] transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-50"
            >
              {loading
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fe2c55] border-t-transparent" />
                : <><ChevronDown className="h-4 w-4" /> Load more</>}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════
   ACTIVITY DRAWER
══════════════════════════════════════════════════════════════════ */
export function ActivityDrawer({
  open,
  onClose,
  onUnreadChange,
  authoritativeUnread,
}: {
  open: boolean;
  onClose: () => void;
  onUnreadChange: (n: number) => void;
  /** The shell's server-polled count (/notifications/unread-count). The
   *  source of truth for the sidebar badge - see reportUnread below. */
  authoritativeUnread?: number;
}) {
  const qc = useQueryClient();
  const [notifs,      setNotifs]      = useState<Notif[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [activeTab,   setActiveTab]   = useState<TabId>("all");
  const [page,        setPage]        = useState(1);
  const [hasMore,     setHasMore]     = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

  /* Rows that arrived over realtime while a request was in flight - the server
     built that page before they existed, so they are folded back on top of the
     response instead of being erased by it. See overlayPending. */
  const pendingRealtime = useRef<Map<string | number, Notif>>(new Map());

  /* Load on open */
  const load = useCallback(async (pg = 1, append = false) => {
    if (pg === 1) pendingRealtime.current.clear();
    try {
      const { data } = await api.get(`/notifications?per_page=10&page=${pg}`);
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
    }
    finally { setLoading(false); setLoadingMore(false); }
  }, []);

  useEffect(() => {
    if (open) { setLoading(true); load(1, false); }
    else { setActiveTab("all"); setPage(1); }
  }, [open, load]);

  /* ESC to close */
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  /* Actors sheet - full "who reacted" list for an aggregated notification. */
  const [actorsFor, setActorsFor] = useState<Notif | null>(null);

  /* Unread count.
   *
   * The sidebar badge belongs to the shell's server-polled count
   * (/notifications/unread-count). This drawer only ADJUSTS it as the user
   * acts here - reporting the raw count of loaded rows used to clobber the
   * server number with one capped at this list's page size. Deltas keep the
   * poll authoritative while marking feels instant, and a failed load makes
   * no claim about the badge at all. */
  const unreadCount = notifs.filter(n => !n.is_read).length;
  const unreadDeltaRef = useRef(0);
  const reportUnread = useCallback(
    (delta: number) => {
      if (delta === 0 || loadFailed || typeof authoritativeUnread !== "number") return;
      unreadDeltaRef.current += delta;
      onUnreadChange(Math.max(0, authoritativeUnread + unreadDeltaRef.current));
    },
    [loadFailed, authoritativeUnread, onUnreadChange],
  );

  /* A fresh poll re-baselines the deltas and snaps the badge back to server
   * truth (covers reads done elsewhere - another tab, another device). */
  useEffect(() => {
    if (!open || typeof authoritativeUnread !== "number") return;
    unreadDeltaRef.current = 0;
    onUnreadChange(authoritativeUnread);
  }, [open, authoritativeUnread, onUnreadChange]);

  /* Realtime: keep the open list live off the shell's shared subscription.
   *
   * This used to open a Centrifugo connection of its own, on drawer open, and
   * close it again on drawer close - which is exactly why a notification that
   * arrived while the drawer was shut never appeared until something refetched.
   * The subscription now lives in the app shell for the whole session; this only
   * reacts to it, and only while it has a list on screen to update.
   *
   * The event carries the whole row, so a new group is prepended and an updated
   * group ("and 3 others") is patched in place - no refetch per event, no
   * duplicate row, and the aggregated card updates without moving. The refetch
   * fallback is only for an event whose row the server could not serialise. */
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!open || loadFailed) return;
    const refetchSoon = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => { setPage(1); load(1, false); }, 400);
    };
    const off = onNotificationEvent((e) => {
      if (e.kind === "remove") {
        setNotifs((prev) => {
          const removed = prev.find((n) => n.id === e.id);
          if (removed && !removed.is_read) reportUnread(-1);
          return prev.filter((n) => n.id !== e.id);
        });
        return;
      }
      if (!e.notification) { refetchSoon(); return; }
      const incoming = mapNotif(e.notification);
      pendingRealtime.current.set(incoming.id, incoming);
      setNotifs((prev) => {
        const at = prev.findIndex((n) => n.id === incoming.id);
        if (at === -1) {
          if (e.kind === "new" && !incoming.is_read) reportUnread(1);
          return [incoming, ...prev];
        }
        // Older than what we already hold (events can overtake each other) -
        // keep the newer row rather than rewinding it.
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
  }, [open, loadFailed, load, reportUnread]);

  /* Filtered + split */
  const filtered    = notifs.filter(n => activeTab === "all" || typeToTab(n.type) === activeTab);
  const cutoff      = Date.now() - 30 * 60_000;
  const newItems    = filtered.filter(n => new Date(n.created_at).getTime() > cutoff);
  const earlierItems = filtered.filter(n => new Date(n.created_at).getTime() <= cutoff);

  /* Actions.
   *
   * Each one both flips rows locally AND reports a badge DELTA to the shell
   * (reportUnread), so the sidebar number changes instantly while the server
   * poll stays authoritative. `setNotifs` alone is not enough - the badge is
   * no longer derived from these rows (see the "Unread count" note). */
  const markRead = useCallback((id: string | number) => {
    let delta = 0;
    setNotifs(prev =>
      prev.map(n => {
        if (n.id !== id) return n;
        if (!n.is_read) delta = -1;
        return { ...n, is_read: true };
      }),
    );
    if (delta) reportUnread(delta);
    if (!loadFailed) api.post(`/notifications/${id}/read`).catch(() => {});
  }, [loadFailed, reportUnread]);

  const markAllRead = useCallback(() => {
    let cleared = 0;
    setNotifs(prev => {
      cleared = prev.filter(n => !n.is_read).length;
      return prev.map(n => ({ ...n, is_read: true }));
    });
    if (cleared) reportUnread(-cleared);
    if (!loadFailed) api.post("/notifications/read-all").catch(() => {});
  }, [loadFailed, reportUnread]);

  const hide = useCallback((id: string | number) => {
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
    let delta = 0;
    setNotifs(prev => prev.map(n => {
      if (n.id === notifId && !n.is_read) delta = -1;
      return n.id === notifId ? { ...n, action_status: "approved" as const, is_read: true } : n;
    }));
    if (delta) reportUnread(delta);
    try {
      await api.post(endpoint);
      if (notif.type === "follow_request" && notif.actor?.username) {
        void qc.invalidateQueries({ queryKey: ["profile", notif.actor.username] });
      }
    } catch { setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "pending" as const } : n)); }
  }, [notifs, qc, reportUnread]);

  const rejectRequest = useCallback(async (notifId: string | number) => {
    const notif = notifs.find(n => n.id === notifId);
    const endpoint = notif?.entity_id ? declineEndpoint(notif.type, notif.entity_id) : null;
    if (!notif || !endpoint) return;
    let delta = 0;
    setNotifs(prev => prev.map(n => {
      if (n.id === notifId && !n.is_read) delta = -1;
      return n.id === notifId ? { ...n, action_status: "rejected" as const, is_read: true } : n;
    }));
    if (delta) reportUnread(delta);
    try { await api.post(endpoint); }
    catch { setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "pending" as const } : n)); }
  }, [notifs, reportUnread]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    load(next, true);
  }, [loadingMore, hasMore, page, load]);

  return (
    <>
      {/* Backdrop */}
      <div
        aria-hidden
        className="fixed inset-0 lg:left-[72px] z-[39] bg-black/20 lg:bg-transparent transition-opacity duration-300"
        style={{ opacity: open ? 1 : 0, pointerEvents: open ? "auto" : "none" }}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Activity"
        className="fixed inset-y-0 left-0 w-full lg:left-[72px] lg:w-[500px] lg:rounded-r-2xl z-[40] flex flex-col bg-white shadow-2xl overflow-hidden"
        style={{
          transform:    open ? "translateX(0)" : "translateX(-100%)",
          opacity:      open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition:  "transform 280ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out",
        }}
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-[#f3f4f6] px-5 pt-5 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="grid h-8 w-8 place-items-center rounded-full bg-[#fff0f4]">
              <Bell className="h-4 w-4 text-[#fe2c55]" />
            </div>
            <span className="text-[17px] font-extrabold text-[#111827]">Activity</span>
            {unreadCount > 0 && (
              <span className="rounded-full bg-[#fe2c55] px-2 py-0.5 text-[11px] font-bold text-white">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            {unreadCount > 0 && (
              <button onClick={markAllRead} className="text-[12px] font-semibold text-[#fe2c55] hover:opacity-75 transition px-2">
                Mark all read
              </button>
            )}
            <button onClick={onClose}
              className="grid h-8 w-8 place-items-center rounded-full text-[#6b7280] hover:bg-[#f3f4f6] hover:text-[#111827] transition-colors">
              <X className="h-[18px] w-[18px]" />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex flex-shrink-0 flex-wrap gap-1.5 border-b border-[#f3f4f6] px-4 py-2.5">
          {TABS.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-semibold transition whitespace-nowrap",
                activeTab === tab.id
                  ? "bg-[#fe2c55] text-white"
                  : "border border-[#e5e7eb] text-[#5f6675] hover:border-[#fe2c55] hover:text-[#fe2c55]",
              )}>
              <tab.Icon className="h-3 w-3 flex-shrink-0" />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#fe2c55] border-t-transparent" />
            </div>
          ) : loadFailed ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff0f4]">
                <Bell className="h-7 w-7 text-[#fe2c55] opacity-60" />
              </div>
              <p className="text-[15px] font-bold text-[#111827]">Couldn&apos;t load activity</p>
              <p className="text-[13px] text-[#9aa1ad]">Something went wrong reaching Teezer. Check your connection and try again.</p>
              <button
                onClick={() => { setLoading(true); load(1, false); }}
                className="mt-1 rounded-xl border border-[#e5e7eb] px-4 py-2 text-[13px] font-semibold text-[#5f6675] transition hover:border-[#fe2c55] hover:text-[#fe2c55]"
              >
                Try again
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-20 text-center px-6">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-[#f3f4f6]">
                <Bell className="h-7 w-7 text-[#d1d5db]" />
              </div>
              <p className="text-[15px] font-bold text-[#111827]">No activity yet</p>
              <p className="text-[13px] text-[#9aa1ad]">When someone follows, likes, or comments on your content - it shows up here.</p>
            </div>
          ) : (
            <>
              {newItems.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">New</p>
                  {newItems.map(n => <NotifRow key={n.id} n={n} onMarkRead={markRead} onHide={hide} onApprove={approveRequest} onReject={rejectRequest} onOpenActors={setActorsFor} />)}
                </div>
              )}
              {earlierItems.length > 0 && (
                <div className="mb-1">
                  <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">Earlier</p>
                  {earlierItems.map(n => <NotifRow key={n.id} n={n} onMarkRead={markRead} onHide={hide} onApprove={approveRequest} onReject={rejectRequest} onOpenActors={setActorsFor} />)}
                </div>
              )}
            </>
          )}
        </div>

        {/* Load more */}
        {hasMore && (
          <div className="flex-shrink-0 border-t border-[#f3f4f6] px-4 py-3">
            <button onClick={loadMore} disabled={loadingMore}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-[#e5e7eb] py-2.5 text-[13px] font-semibold text-[#5f6675] transition hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-50">
              {loadingMore
                ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fe2c55] border-t-transparent" />
                : <><ChevronDown className="h-4 w-4" /> View more notifications</>
              }
            </button>
          </div>
        )}
      </div>

      {actorsFor && <ActorsSheet notif={actorsFor} onClose={() => setActorsFor(null)} />}
    </>
  );
}
