"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  AtSign, Bell, ChevronDown, DollarSign, Filter, Flag,
  Heart, MessageCircle, MoreVertical, Radio,
  Repeat2, Settings2, Shield, UserCheck, UserPlus, X,
} from "lucide-react";
import { api } from "@/services/api";
import { cn } from "@/lib/utils";

/* ── Types ─────────────────────────────────────────────────────── */
type NotifType = "follow" | "follow_request" | "follow_request_accepted" | "like" | "comment" | "mention" | "remix" | "system" | "live" | "verification" | "report_actioned";
type TabId     = "all" | "mentions" | "likes" | "comments" | "followers" | "system";

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
  is_read: boolean;
  actor?: Actor | null;
  created_at: string;
  thumbnail?: string;
  extraActors?: Actor[];
  extraCount?: number;
  actionLabel?: string;
  actionVariant?: "primary" | "outline";
  action_status?: "pending" | "approved" | "rejected";
}

/* ── Sample data (used when API returns 0 results) ─────────────── */
const SAMPLES: Notif[] = [
  {
    id: "s1", type: "follow", is_read: false,
    message: "Ananya Rai started following you",
    actor: { id: 1, username: "ananya_rai", name: "Ananya Rai", avatar: null },
    created_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    actionLabel: "Follow back", actionVariant: "primary",
  },
  {
    id: "s2", type: "like", is_read: false,
    message: "Sujan Karki liked your video",
    actor: { id: 2, username: "sujan_karki", name: "Sujan Karki", avatar: null },
    created_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=80&h=80&fit=crop",
  },
  {
    id: "s3", type: "comment", is_read: false,
    message: 'Ashmitaa Gurung commented: "Love this vibe! ✨🔥"',
    actor: { id: 3, username: "ashmitaa_gurung", name: "Ashmitaa Gurung", avatar: null },
    created_at: new Date(Date.now() - 18 * 60_000).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=80&h=80&fit=crop",
  },
  {
    id: "s4", type: "follow", is_read: true,
    message: "Manish Kettri started following you",
    actor: { id: 4, username: "manish_kettri", name: "Manish Kettri", avatar: null },
    created_at: new Date(Date.now() - 60 * 60_000).toISOString(),
    actionLabel: "Following", actionVariant: "outline",
  },
  {
    id: "s5", type: "mention", is_read: true,
    message: "Prashant Magar mentioned you in their story",
    actor: { id: 5, username: "prashant_magar", name: "Prashant Magar", avatar: null },
    created_at: new Date(Date.now() - 2 * 60 * 60_000).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1597466599360-3b596d26e0a9?w=80&h=80&fit=crop",
  },
  {
    id: "s6", type: "like", is_read: true,
    message: "Your video got 1.2K likes",
    actor: null,
    created_at: new Date(Date.now() - 3 * 60 * 60_000).toISOString(),
    extraActors: [
      { id: 10, username: "a", name: "A", avatar: null },
      { id: 11, username: "b", name: "B", avatar: null },
      { id: 12, username: "c", name: "C", avatar: null },
    ],
    extraCount: 1200,
  },
  {
    id: "s7", type: "comment", is_read: true,
    message: 'Sujan Karki commented: "Where is this place? 😍"',
    actor: { id: 2, username: "sujan_karki", name: "Sujan Karki", avatar: null },
    created_at: new Date(Date.now() - 4 * 60 * 60_000).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=80&h=80&fit=crop",
  },
  {
    id: "s8", type: "remix", is_read: true,
    message: "Your reel was remixed by @bipen__.tamang",
    actor: { id: 6, username: "bipen__.tamang", name: "Bipen Tamang", avatar: null },
    created_at: new Date(Date.now() - 6 * 60 * 60_000).toISOString(),
    thumbnail: "https://images.unsplash.com/photo-1571019614242-c5c5dee9f50b?w=80&h=80&fit=crop",
  },
  {
    id: "s9", type: "system", is_read: true,
    message: "Monetization update: Your payout of $124.50 is on the way 💰",
    actor: null,
    created_at: new Date(Date.now() - 8 * 60 * 60_000).toISOString(),
    actionLabel: "View details", actionVariant: "outline",
  },
  {
    id: "s10", type: "live", is_read: true,
    message: "Live reminder: Chill Vibes Only is live in 10 minutes",
    actor: null,
    created_at: new Date(Date.now() - 9 * 60 * 60_000).toISOString(),
    actionLabel: "Remind me", actionVariant: "primary",
  },
];

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
  let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  return GRADS[Math.abs(h) % GRADS.length];
}

function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60)   return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

function typeToTab(t: NotifType): TabId {
  if (t === "follow" || t === "follow_request" || t === "follow_request_accepted") return "followers";
  if (t === "like")                                        return "likes";
  if (t === "comment")                                     return "comments";
  if (t === "mention")                                     return "mentions";
  if (t === "system" || t === "live" || t === "verification" || t === "report_actioned") return "system";
  return "all";
}

/* ── Avatar mini component ─────────────────────────────────────── */
function MiniAvatar({ src, name, size = 44 }: { src?: string | null; name: string; size?: number }) {
  const [err, setErr] = useState(false);
  const initials = name.replace(/[^a-zA-Z ]/g, "").split(" ").map(w => w[0]).filter(Boolean).join("").slice(0, 2).toUpperCase() || "RS";
  return (
    <div className="rounded-full flex-shrink-0 overflow-hidden grid place-items-center font-bold text-white"
      style={{ width: size, height: size, background: (!src || err) ? grad(name) : undefined }}>
      {src && !err
        ? <img src={src} alt={name} onError={() => setErr(true)} className="w-full h-full object-cover" /> // eslint-disable-line @next/next/no-img-element
        : <span style={{ fontSize: Math.round(size * 0.36) }}>{initials}</span>
      }
    </div>
  );
}

/* ── Type badge ─────────────────────────────────────────────────── */
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
};

function TypeBadge({ type }: { type: NotifType }) {
  const m = TYPE_META[type] ?? TYPE_META.system;
  return (
    <div className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-white"
      style={{ background: m.bg }}>
      <m.Icon className="h-2.5 w-2.5" style={{ color: m.color }} fill={type === "like" ? m.color : "none"} strokeWidth={2.5} />
    </div>
  );
}

/* ── Three-dot menu ─────────────────────────────────────────────── */
const DOT_OPTS = ["Mark as read", "Hide this notification", "Turn off this type", "Report issue"];

function DotMenu({ onMark, onHide }: { onMark: () => void; onHide: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);
  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={e => { e.stopPropagation(); setOpen(o => !o); }}
        className="grid h-7 w-7 place-items-center rounded-full text-[#9aa1ad] opacity-0 transition hover:bg-[#f3f4f6] hover:text-[#5f6675] group-hover:opacity-100">
        <MoreVertical className="h-4 w-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-8 z-[200] w-48 overflow-hidden rounded-[12px] border border-[#eeeeee] bg-white py-1 shadow-xl">
          {DOT_OPTS.map((opt, i) => (
            <button key={i} onClick={e => {
              e.stopPropagation();
              setOpen(false);
              if (i === 0) onMark();
              if (i === 1) onHide();
            }}
              className="flex w-full items-center px-3 py-2 text-left text-[13px] text-[#111827] hover:bg-[#f8f9fb]">
              {opt}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Single notification row ────────────────────────────────────── */
function NotifRow({
  n, onMarkRead, onHide, onApprove, onReject,
}: {
  n: Notif;
  onMarkRead: (id: string | number) => void;
  onHide: (id: string | number) => void;
  onApprove?: (id: string | number) => void;
  onReject?: (id: string | number) => void;
}) {
  const router = useRouter();

  function navigate() {
    if (n.type === "follow_request" && n.action_status === "pending") return;
    // Opening one IS reading it - done BEFORE routing so the deep_link
    // early-return can't skip it. (It used to sit below that return, so every
    // tapped row navigated but stayed unread forever.)
    onMarkRead(n.id);
    // Server-authored destination wins; the branches below are the legacy
    // fallback for rows that predate `deep_link`.
    if (n.deep_link) { router.push(n.deep_link); return; }
    if (n.entity_type === "admin_message" || n.entity_type === "admin_action") { router.push("/notifications"); return; }
    if ((n.type === "follow" || n.type === "follow_request" || n.type === "follow_request_accepted") && n.actor) { router.push(`/profile/${n.actor.username}`); return; }
    if (n.entity_type === "video" && n.entity_id) { router.push(`/videos/${n.entity_id}`); return; }
    if (n.entity_type === "story" && n.actor)    { router.push(`/profile/${n.actor.username}`); return; }
    if (n.type === "verification")       { router.push("/settings/verification-badge"); return; }
    if (n.type === "live")               { router.push("/live"); return; }
    if (n.type === "system")             { router.push("/notifications"); return; }
    if (n.type === "mention")            { router.push("/notifications"); return; }
  }

  const isAdminMsg = !n.actor || n.entity_type === "admin_message" || n.entity_type === "admin_action" || n.entity_type === "admin_account_update" || n.type === "system";
  const actorName  = isAdminMsg ? "Teezer" : (n.actor?.name ?? n.actor?.username ?? "Teezer");

  return (
    <div onClick={navigate}
      className={cn(
        "group relative flex cursor-pointer items-start gap-3 rounded-[12px] px-3 py-3 transition hover:bg-[#f8f9fb]",
        !n.is_read && "bg-[#fff7f8]",
      )}>
      {/* Avatar + badge */}
      <div className="relative flex-shrink-0">
        {isAdminMsg
          ? (
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-[#fd4605] to-[#ff8a55] shadow-sm">
              <Shield className="h-5 w-5 text-white" />
            </div>
          )
          : n.actor
            ? <MiniAvatar src={n.actor.avatar} name={actorName} size={44} />
            : (
              <div className="flex h-11 w-11 items-center justify-center rounded-full"
                style={{ background: TYPE_META[n.type]?.bg ?? "#f3f4f6" }}>
                {(() => { const M = TYPE_META[n.type]; return M ? <M.Icon className="h-5 w-5" style={{ color: M.color }} /> : <Bell className="h-5 w-5 text-[#6b7280]" />; })()}
              </div>
            )
        }
        {!isAdminMsg && n.actor && <TypeBadge type={n.type} />}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        {isAdminMsg && (
          <p className="text-[11px] font-semibold text-[#fd4605] mb-0.5 flex items-center gap-1">
            <Shield className="h-2.5 w-2.5" /> Teezer
          </p>
        )}
        <p className={cn("text-[13.5px] leading-snug", n.is_read ? "text-[#374151]" : "font-semibold text-[#111827]")}>
          {n.message}
        </p>
        <p className="mt-0.5 text-[11.5px] text-[#9aa1ad]">{timeAgo(n.created_at)}</p>

        {/* Follow request approve / reject */}
        {n.type === "follow_request" && n.action_status === "pending" && (
          <div className="mt-2 flex gap-2" onClick={e => e.stopPropagation()}>
            <button
              onClick={() => onApprove?.(n.id)}
              className="rounded-full bg-[#fd4605] px-4 py-1.5 text-[12px] font-bold text-white transition hover:bg-[#e03e04]">
              Approve
            </button>
            <button
              onClick={() => onReject?.(n.id)}
              className="rounded-full border border-[#e5e7eb] px-4 py-1.5 text-[12px] font-bold text-[#374151] transition hover:bg-[#f8f9fb]">
              Reject
            </button>
          </div>
        )}
        {n.type === "follow_request" && n.action_status === "approved" && (
          <span className="mt-2 inline-block rounded-full bg-green-50 px-3 py-1 text-[12px] font-semibold text-green-700">
            Approved
          </span>
        )}
        {n.type === "follow_request" && n.action_status === "rejected" && (
          <span className="mt-2 inline-block rounded-full bg-gray-50 px-3 py-1 text-[12px] font-semibold text-[#6b7280]">
            Rejected
          </span>
        )}

        {/* Generic action button (non-follow-request types) */}
        {n.actionLabel && n.type !== "follow_request" && (
          <button onClick={e => { e.stopPropagation(); onMarkRead(n.id); }}
            className={cn("mt-2 rounded-full px-4 py-1.5 text-[12px] font-bold transition",
              n.actionVariant === "primary"
                ? "bg-[#fd4605] text-white hover:bg-[#e03e04]"
                : "border border-[#e5e7eb] text-[#111827] hover:bg-[#f8f9fb]")}>
            {n.actionLabel}
          </button>
        )}

        {/* Stacked avatars (group likes) */}
        {n.extraActors && n.extraActors.length > 0 && (
          <div className="mt-2 flex items-center gap-1.5">
            <div className="flex -space-x-2">
              {n.extraActors.slice(0, 3).map(a => <MiniAvatar key={a.id} src={a.avatar} name={a.name ?? a.username} size={24} />)}
            </div>
            {n.extraCount && n.extraCount > 3 && (
              <span className="text-[12px] font-semibold text-[#5f6675]">+{n.extraCount.toLocaleString()}</span>
            )}
          </div>
        )}
      </div>

      {/* Right side */}
      <div className="flex flex-shrink-0 flex-col items-end gap-1.5">
        {n.thumbnail && (
          <div className="h-12 w-12 overflow-hidden rounded-[8px] border border-[#eeeeee]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={n.thumbnail} alt="" className="h-full w-full object-cover" />
          </div>
        )}
        {!n.is_read && <span className="h-2 w-2 rounded-full bg-[#fd4605]" />}
        <DotMenu onMark={() => onMarkRead(n.id)} onHide={() => onHide(n.id)} />
      </div>
    </div>
  );
}

/* ── Tabs ───────────────────────────────────────────────────────── */
const TABS: { id: TabId; label: string; Icon: React.ElementType }[] = [
  { id: "all",       label: "All",       Icon: Bell           },
  { id: "mentions",  label: "Mentions",  Icon: AtSign         },
  { id: "likes",     label: "Likes",     Icon: Heart          },
  { id: "comments",  label: "Comments",  Icon: MessageCircle  },
  { id: "followers", label: "Followers", Icon: UserPlus       },
  { id: "system",    label: "System",    Icon: Settings2      },
];

/* ══════════════════════════════════════════════════════════════════
   MAIN DROPDOWN COMPONENT
══════════════════════════════════════════════════════════════════ */
export function NotificationDropdown({
  onClose,
  onUnreadChange,
  authoritativeUnread,
}: {
  onClose: () => void;
  onUnreadChange: (n: number) => void;
  /** The shell's server-polled count (/notifications/unread-count), source of
   *  truth for the sidebar badge. The dropdown only ADJUSTS it via deltas. */
  authoritativeUnread?: number;
}) {
  const qc = useQueryClient();
  const [notifs,    setNotifs]    = useState<Notif[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("all");
  const [page,      setPage]      = useState(1);
  const [hasMore,   setHasMore]   = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [usingSample, setUsingSample] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  /* Close on outside click */
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [onClose]);

  /* Close on Escape */
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  /* Load notifications */
  const load = useCallback(async (pg = 1, append = false) => {
    try {
      const { data } = await api.get(`/notifications?per_page=15&page=${pg}`);
      const items: Notif[] = (data.data ?? []).map((n: Notif) => n);
      if (items.length === 0 && pg === 1) {
        setNotifs(SAMPLES);
        setUsingSample(true);
        setHasMore(false);
      } else {
        setNotifs(prev => append ? [...prev, ...items] : items);
        setUsingSample(false);
        setHasMore(!!data.meta?.next_page_url);
      }
    } catch {
      setNotifs(SAMPLES);
      setUsingSample(true);
      setHasMore(false);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, []);

  useEffect(() => { load(1, false); }, [load]);

  /* Unread count for the header pill. The SHELL badge belongs to the shell's
   * server-polled count, not this list - so this component, like the drawer,
   * only adjusts it via deltas instead of overwriting it with a page-size-
   * capped number (see reportUnread). */
  const unreadCount = notifs.filter(n => !n.is_read).length;
  const unreadDeltaRef = useRef(0);
  const reportUnread = useCallback(
    (delta: number) => {
      if (delta === 0 || usingSample || typeof authoritativeUnread !== "number") return;
      unreadDeltaRef.current += delta;
      onUnreadChange(Math.max(0, authoritativeUnread + unreadDeltaRef.current));
    },
    [usingSample, authoritativeUnread, onUnreadChange],
  );
  /* A fresh poll re-baselines and snaps the badge back to server truth. */
  useEffect(() => {
    if (typeof authoritativeUnread !== "number") return;
    unreadDeltaRef.current = 0;
    onUnreadChange(authoritativeUnread);
  }, [authoritativeUnread, onUnreadChange]);

  /* Filtered list */
  const filtered = notifs.filter(n => {
    if (activeTab === "all") return true;
    return typeToTab(n.type) === activeTab;
  });

  /* Split by date group + pin system notifications at top */
  const SYSTEM_TYPES: NotifType[] = ["system", "live", "verification", "report_actioned"];
  const systemItems = filtered.filter(n => SYSTEM_TYPES.includes(n.type));
  const regularItems = filtered.filter(n => !SYSTEM_TYPES.includes(n.type));

  function dateBucket(iso: string): string {
    const d = new Date(iso);
    const now = new Date();
    const startOfToday     = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 86400_000);
    const startOfWeek      = new Date(startOfToday.getTime() - 6 * 86400_000);
    if (d >= startOfToday)     return "Today";
    if (d >= startOfYesterday) return "Yesterday";
    if (d >= startOfWeek)      return "This Week";
    return "Earlier";
  }

  const DATE_ORDER = ["Today", "Yesterday", "This Week", "Earlier"];
  const buckets = DATE_ORDER.reduce<Record<string, Notif[]>>((acc, k) => { acc[k] = []; return acc; }, {});
  for (const n of regularItems) {
    buckets[dateBucket(n.created_at)].push(n);
  }

  /* Actions */
  const markRead = useCallback((id: string | number) => {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n));
    if (!usingSample) api.post(`/notifications/${id}/read`).catch(() => {});
  }, [usingSample]);

  const markAllRead = useCallback(() => {
    setNotifs(prev => prev.map(n => ({ ...n, is_read: true })));
    if (!usingSample) api.post("/notifications/read-all").catch(() => {});
  }, [usingSample]);

  const hide = useCallback((id: string | number) => {
    setNotifs(prev => prev.filter(n => n.id !== id));
    if (!usingSample) api.delete(`/notifications/${id}`).catch(() => {});
  }, [usingSample]);

  const approveFollow = useCallback(async (notifId: string | number) => {
    const notif = notifs.find(n => n.id === notifId);
    if (!notif?.entity_id) return;
    setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "approved" as const, is_read: true } : n));
    try {
      await api.post(`/users/follow-requests/${notif.entity_id}/accept`);
      if (notif.actor?.username) {
        void qc.invalidateQueries({ queryKey: ["profile", notif.actor.username] });
      }
    } catch {
      setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "pending" as const } : n));
    }
  }, [notifs, qc]);

  const rejectFollow = useCallback(async (notifId: string | number) => {
    const notif = notifs.find(n => n.id === notifId);
    if (!notif?.entity_id) return;
    setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "rejected" as const, is_read: true } : n));
    try {
      await api.post(`/users/follow-requests/${notif.entity_id}/decline`);
    } catch {
      setNotifs(prev => prev.map(n => n.id === notifId ? { ...n, action_status: "pending" as const } : n));
    }
  }, [notifs]);

  const loadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    if (usingSample) {
      // Append more samples with older times
      const extra: Notif[] = SAMPLES.map((s, i) => ({
        ...s,
        id: `sx_${i}_${Date.now()}`,
        is_read: true,
        created_at: new Date(Date.now() - (10 + i) * 60 * 60_000).toISOString(),
      }));
      setNotifs(prev => [...prev, ...extra]);
      setHasMore(false);
      return;
    }
    const next = page + 1;
    setPage(next);
    setLoadingMore(true);
    load(next, true);
  }, [loadingMore, hasMore, usingSample, page, load]);

  return (
    <div ref={panelRef}
      className="absolute right-0 top-full z-[150] mt-[14px] flex flex-col overflow-hidden rounded-[20px] border border-[#eeeeee] bg-white shadow-2xl"
      style={{ width: "clamp(420px, 95vw, 660px)", maxHeight: "min(85vh, 800px)" }}>

      {/* ── Header ── */}
      <div className="flex flex-shrink-0 items-center justify-between border-b border-[#eeeeee] px-5 py-4">
        <h2 className="text-[18px] font-extrabold text-[#111827]">Notifications</h2>
        <div className="flex items-center gap-2">
          {unreadCount > 0 && (
            <button onClick={markAllRead}
              className="text-[13px] font-semibold text-[#fd4605] transition hover:opacity-75">
              Mark all as read
            </button>
          )}
          <button className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb]">
            <Filter className="h-4 w-4" />
          </button>
          <button onClick={onClose}
            className="grid h-8 w-8 place-items-center rounded-full text-[#5f6675] transition hover:bg-[#f8f9fb]">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="flex flex-shrink-0 flex-nowrap gap-1.5 overflow-x-auto border-b border-[#eeeeee] px-4 py-3"
        style={{ scrollbarWidth: "none" }}>
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex flex-shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold transition",
              activeTab === tab.id
                ? "bg-[#fd4605] text-white"
                : "border border-[#e5e7eb] text-[#5f6675] hover:border-[#fd4605] hover:text-[#fd4605]",
            )}>
            <tab.Icon className="h-3.5 w-3.5 flex-shrink-0" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Notification list (scrollable) ── */}
      <div className="flex-1 overflow-y-scroll px-2 py-2"
        style={{ scrollbarWidth: "thin", scrollbarColor: "#d1d5db transparent" }}>

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="h-7 w-7 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-16 text-center">
            <Bell className="h-10 w-10 text-[#d1d5db]" />
            <p className="text-[14px] font-semibold text-[#111827]">No notifications here</p>
            <p className="text-[12px] text-[#9aa1ad]">We'll let you know when something happens.</p>
          </div>
        ) : (
          <>
            {/* System notifications pinned at top */}
            {systemItems.length > 0 && (
              <div className="mb-3">
                <div className="mx-2 mb-2 mt-1 flex items-center gap-2 rounded-[12px] bg-[#eff6ff] px-3 py-2">
                  <Shield className="h-3.5 w-3.5 flex-shrink-0 text-[#2563eb]" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#2563eb]">System</p>
                </div>
                {systemItems.map(n => (
                  <NotifRow key={n.id} n={n} onMarkRead={markRead} onHide={hide} onApprove={approveFollow} onReject={rejectFollow} />
                ))}
              </div>
            )}

            {/* Regular notifications grouped by date */}
            {DATE_ORDER.map(bucket => buckets[bucket].length > 0 && (
              <div key={bucket} className="mb-1">
                <p className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-[#9aa1ad]">{bucket}</p>
                {buckets[bucket].map(n => (
                  <NotifRow key={n.id} n={n} onMarkRead={markRead} onHide={hide} onApprove={approveFollow} onReject={rejectFollow} />
                ))}
              </div>
            ))}

            {systemItems.length === 0 && regularItems.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-16 text-center">
                <Bell className="h-10 w-10 text-[#d1d5db]" />
                <p className="text-[14px] font-semibold text-[#111827]">No notifications here</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Show more ── */}
      <div className="flex-shrink-0 border-t border-[#eeeeee] py-2">
        <button onClick={loadMore} disabled={loadingMore}
          className="flex w-full items-center justify-center gap-2 py-2.5 text-[13px] font-semibold text-[#5f6675] transition hover:text-[#fd4605] disabled:opacity-50">
          {loadingMore
            ? <div className="h-4 w-4 animate-spin rounded-full border-2 border-[#fd4605] border-t-transparent" />
            : <><ChevronDown className="h-4 w-4" />Show older notifications</>
          }
        </button>
      </div>
    </div>
  );
}
