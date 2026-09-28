"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, X, ImageOff, ExternalLink, CheckCircle2, Ban, Trash2, Trash, MessageSquare, Flag,
  Video, Image as ImageIcon, User, Mail, Radio, Mic, Clock, ShieldOff, Eye, MoreHorizontal,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select, Textarea } from "@/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/components/ui/data-table";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { adminService } from "@/services/admin.service";
import { apiMessage } from "@/services/api";
import { formatCompact } from "@/lib/utils";

/**
 * The full 7-type report queue - every "Report" a user can file anywhere in
 * the app or on the site (video, comment, story, account, DM, live stream,
 * Space), backed by AdminReportsController. Deliberately separate from the
 * older /reports route under Moderation (now just a redirect here) - see
 * admin-shell's nav comment.
 */

type ReportType = "video" | "comment" | "story" | "user" | "conversation" | "live_stream" | "space";

const TYPES: { key: ReportType; label: string; icon: React.ElementType }[] = [
  { key: "video",        label: "Videos",       icon: Video },
  { key: "comment",      label: "Comments",     icon: MessageSquare },
  { key: "story",        label: "Stories",      icon: ImageIcon },
  { key: "user",         label: "Accounts",     icon: User },
  { key: "conversation", label: "DMs",          icon: Mail },
  { key: "live_stream",  label: "Live Streams", icon: Radio },
  { key: "space",        label: "Spaces",       icon: Mic },
];

/** Reason enums, one per type - must match each backend endpoint's own
 *  validate(['reason' => ['in:...']]) list (see report-config.ts on web/mobile,
 *  which this mirrors for the admin filter dropdown only). */
const REASONS_BY_TYPE: Record<ReportType, string[]> = {
  video:         ["spam", "nudity", "hate", "misinformation", "violence", "copyright", "harassment", "other"],
  comment:       ["spam", "harassment", "hate_speech", "nudity", "violence", "misinformation", "other"],
  story:         ["spam", "inappropriate", "violence", "hate_speech", "misinformation", "other"],
  user:          ["spam", "fake_impersonation", "harassment", "hate_speech", "nudity", "underage", "scam_fraud", "other"],
  conversation:  ["spam", "harassment", "hate_speech", "nudity", "scam_fraud", "other"],
  live_stream:   ["spam", "nudity", "hate_speech", "harassment", "violence", "self_harm", "scam_fraud", "other"],
  space:         ["spam", "nudity", "hate_speech", "harassment", "violence", "self_harm", "scam_fraud", "other"],
};

/** "Remove" only deletes/hides real content for these (AdminReportsController::action). */
const REMOVABLE: ReportType[] = ["video", "comment", "story"];
/** "Ban" only resolves a real target to ban for these; conversation/live_stream/
 *  space have no single owner, so the backend silently no-ops for them. */
const BANNABLE: ReportType[] = ["video", "comment", "story", "user"];

/**
 * Priority is DERIVED from the reason, not a stored field - nothing in the
 * app captures a priority for a report. Reasons describing physical harm or
 * exploitation float to the top; everything else defaults to Low. This is a
 * triage hint, not a guarantee - always read the details text too.
 */
type Priority = "high" | "medium" | "low";
const REASON_PRIORITY: Record<string, Priority> = {
  self_harm: "high", underage: "high", violence: "high", hate: "high", hate_speech: "high",
  nudity: "medium", scam_fraud: "medium", fake_impersonation: "medium", copyright: "medium", harassment: "medium",
};
const priorityOf = (reason: string): Priority => REASON_PRIORITY[reason] ?? "low";

const reasonLabel = (r: string) => r.replace(/_/g, " ");

/**
 * The report queue's own status vocabulary (pending/reviewed/actioned/
 * dismissed) doesn't read naturally as a badge label - "actioned" says what
 * the backend did, not what a reviewer would call the outcome. Relabelled
 * here for display only; the value sent to reportAction() is unaffected.
 */
/** Suspend duration presets, matching the User 360 page's own 24h/7d/30d
 *  chips (admin/src/app/users/[id]/page.tsx) so a duration picked here means
 *  the same thing it means there. */
const SUSPEND_MS: Record<"24h" | "7d" | "30d", number> = {
  "24h": 24 * 60 * 60 * 1000,
  "7d": 7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

const STATUS_LABEL: Record<string, string> = {
  pending: "Pending", reviewed: "Reviewed", actioned: "Resolved", dismissed: "False Report",
};
function ReportStatusBadge({ status }: { status: string }) {
  const variant =
    status === "actioned" ? "success"
    : status === "pending" ? "warning"
    : status === "reviewed" ? "info"
    : "default"; // dismissed
  return <Badge variant={variant}>{STATUS_LABEL[status] ?? status}</Badge>;
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return `${d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })} · ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
}

/** A content owner's account, as far as the account-actions panel needs to
 *  know: who they are, and their current banned/active state. */
type OwnerUser = { id: number; name: string; username: string; avatar: string | null; is_banned?: boolean; is_active?: boolean };

type ReportRow = {
  id: number;
  reason: string;
  details?: string | null;
  status: string;
  created_at: string;
  reporter?: { id: number; name: string; username: string; avatar: string | null };
  evidence?: { key: string; url: string | null }[];
  video?: {
    id?: number; caption: string | null; title: string | null; thumbnail_url?: string | null;
    views_count?: number; likes_count?: number; comments_count?: number;
    user?: OwnerUser; deleted_at?: string | null;
  };
  comment?: { id?: number; body: string | null; user?: OwnerUser; deleted_at?: string | null };
  story?: { id: number; status?: string; user?: OwnerUser; deleted_at?: string | null };
  target?: (OwnerUser & {
    title?: string; status?: string;
    user_a_id?: number; user_b_id?: number;
  }) | null;
};

type Stats = {
  overall: { pending: number; reviewed: number; actioned: number; dismissed: number; total: number };
  trend: Record<"total" | "pending" | "actioned" | "dismissed", { series: number[]; delta_pct: number }>;
  video_reports: Record<string, number>;
  comment_reports: Record<string, number>;
  story_reports: Record<string, number>;
  content_reports: Record<string, Record<string, number>>;
};

/** Outstanding reports for a type - what the tab badge shows. An all-time
 *  total only ever grows, so the badge kept saying "8" on the Videos tab
 *  after every one of those 8 had already been dismissed or actioned - a
 *  queue badge that never reflects work being done reads as wrong even
 *  though the number itself isn't. This is scoped to pending specifically
 *  (not whatever the status filter happens to be set to), so it's a stable
 *  "how much is left to review" regardless of which status you're
 *  currently looking at. */
function pendingFor(stats: Stats | undefined, type: ReportType): number | undefined {
  if (!stats) return undefined;
  if (type === "video")   return stats.video_reports?.pending;
  if (type === "comment") return stats.comment_reports?.pending;
  if (type === "story")   return stats.story_reports?.pending;
  return stats.content_reports?.[type]?.pending;
}

/* ── Sparkline: a 14-point decorative trend, one hue, no axes - a stat-tile
   trend per the dataviz house style (2px line, rounded caps, ~10% area
   wash, an accent dot on today). Hover carries the same number the delta
   text already states, via a native title so it needs no extra markup. ── */
function Sparkline({ series, color, width = 108, height = 32 }: { series: number[]; color: string; width?: number; height?: number }) {
  if (!series.length) return null;
  const max = Math.max(...series, 1);
  const min = 0;
  const range = max - min || 1;
  const stepX = width / Math.max(series.length - 1, 1);
  const pad = 4;
  const points = series.map((v, i) => [
    i * stepX,
    height - pad - ((v - min) / range) * (height - pad * 2),
  ]);
  const line = points.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;
  const [lastX, lastY] = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="shrink-0 overflow-visible">
      <title>{`Last 14 days, today: ${series[series.length - 1]}`}</title>
      <path d={area} fill={color} opacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={lastX} cy={lastY} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}

function TrendStatCard({
  icon: Icon, label, value, deltaPct, series, color, semantic,
}: {
  icon: React.ElementType; label: string; value: number | undefined; deltaPct: number | undefined;
  series: number[] | undefined; color: string;
  /** How to color the delta text: which direction is an improvement, or neither. */
  semantic: "up-good" | "up-bad" | "neutral";
}) {
  const d = deltaPct ?? 0;
  const isUp = d > 0.05;
  const isDown = d < -0.05;
  const deltaColor =
    semantic === "neutral" ? "text-[#9ca3af]"
    : semantic === "up-good" ? (isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-[#9ca3af]")
    : (isUp ? "text-red-500" : isDown ? "text-emerald-600" : "text-[#9ca3af]");

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 shrink-0 place-items-center rounded-lg" style={{ backgroundColor: `${color}18` }}>
              <Icon className="h-3.5 w-3.5" style={{ color }} />
            </div>
            <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
          </div>
          <p className="mt-2 text-[24px] font-bold leading-none text-[#111827]">{value == null ? "-" : formatCompact(value)}</p>
          <p className={`mt-1.5 text-[11px] font-semibold ${deltaColor}`}>
            {isUp ? "↑" : isDown ? "↓" : "·"} {Math.abs(d)}%{" "}
            <span className="font-normal text-[#9ca3af]">vs last 30 days</span>
          </p>
        </div>
        {series && <Sparkline series={series} color={color} />}
      </div>
    </Card>
  );
}

/* ── Reported-content cell: what's shown differs per type, since a video has
   a thumbnail and a DM does not - one function, one switch, reused by both
   the table row and the detail panel (via `size`). ── */
/** The reported content was removed (self-deleted, or via this very page's
 *  own "Remove content" action) after the report was filed. Shown rather
 *  than silently falling back to "Untitled"/"(no text)" - what the content
 *  actually said is usually the whole point of reviewing the report. */
function DeletedTag() {
  return <Badge variant="danger" className="shrink-0">Deleted</Badge>;
}

function ContentCell({ type, r, size = "sm" }: { type: ReportType; r: ReportRow; size?: "sm" | "lg" }) {
  const box = size === "lg" ? "h-16 w-16" : "h-11 w-11";
  const titleCls = size === "lg" ? "text-[14px] font-semibold text-[#111827]" : "truncate text-[13px] font-medium text-[#111827]";
  const metaCls = "text-[11px] text-[#9ca3af]";

  if (type === "video") {
    return (
      <div className="flex items-center gap-3">
        {r.video?.thumbnail_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring CDN URL
          <img src={r.video.thumbnail_url} alt="" className={`${box} shrink-0 rounded-lg object-cover`} />
        ) : (
          <div className={`grid ${box} shrink-0 place-items-center rounded-lg bg-[#f3f4f6]`}><Video className="h-4 w-4 text-[#9ca3af]" /></div>
        )}
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={titleCls}>{r.video?.caption || r.video?.title || "Untitled video"}</p>
            {!!r.video?.deleted_at && <DeletedTag />}
          </div>
          <p className={metaCls}>
            Video · ID: vd_{r.video?.id ?? "-"}{r.video?.user?.name ? ` · By ${r.video.user.name}` : ""}
          </p>
        </div>
      </div>
    );
  }
  if (type === "comment") {
    return (
      <div className="flex items-center gap-3">
        <div className={`grid ${box} shrink-0 place-items-center rounded-lg bg-[#f3f4f6]`}><MessageSquare className="h-4 w-4 text-[#9ca3af]" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={size === "lg" ? titleCls : `${titleCls} max-w-[220px]`}>{r.comment?.body || "(no text)"}</p>
            {!!r.comment?.deleted_at && <DeletedTag />}
          </div>
          <p className={metaCls}>Comment · ID: cm_{r.comment?.id ?? "-"}</p>
        </div>
      </div>
    );
  }
  if (type === "story") {
    return (
      <div className="flex items-center gap-3">
        <div className={`grid ${box} shrink-0 place-items-center rounded-lg bg-[#f3f4f6]`}><ImageIcon className="h-4 w-4 text-[#9ca3af]" /></div>
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={titleCls}>Story #{r.story?.id ?? "-"}</p>
            {!!r.story?.deleted_at && <DeletedTag />}
          </div>
          {!!r.story?.status && <p className={`${metaCls} capitalize`}>{r.story.status}</p>}
        </div>
      </div>
    );
  }
  if (type === "user") {
    return (
      <div className="flex items-center gap-3">
        {r.target?.avatar ? (
          // eslint-disable-next-line @next/next/no-img-element -- signed, expiring CDN URL
          <img src={r.target.avatar} alt="" className={`${box} shrink-0 rounded-full object-cover`} />
        ) : (
          <div className={`grid ${box} shrink-0 place-items-center rounded-full bg-[#f3f4f6]`}><User className="h-4 w-4 text-[#9ca3af]" /></div>
        )}
        <div className="min-w-0">
          <p className={titleCls}>{r.target?.name ?? "Unknown account"}</p>
          <p className={metaCls}>@{r.target?.username ?? "-"}{r.target?.is_banned ? " · Already banned" : ""}</p>
        </div>
      </div>
    );
  }
  if (type === "conversation") {
    return (
      <div className="flex items-center gap-3">
        <div className={`grid ${box} shrink-0 place-items-center rounded-lg bg-[#f3f4f6]`}><Mail className="h-4 w-4 text-[#9ca3af]" /></div>
        <div className="min-w-0">
          <p className={titleCls}>Conversation #{r.target?.id ?? "-"}</p>
          <p className={metaCls}>User #{r.target?.user_a_id} ↔ User #{r.target?.user_b_id}</p>
        </div>
      </div>
    );
  }
  if (type === "live_stream") {
    return (
      <div className="flex items-center gap-3">
        <div className={`grid ${box} shrink-0 place-items-center rounded-lg bg-[#f3f4f6]`}><Radio className="h-4 w-4 text-[#9ca3af]" /></div>
        <div className="min-w-0">
          <p className={titleCls}>{r.target?.title || "Untitled stream"}</p>
          <p className={metaCls}>Live · ID: lv_{r.target?.id ?? "-"}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-3">
      <div className={`grid ${box} shrink-0 place-items-center rounded-lg bg-[#f3f4f6]`}><Mic className="h-4 w-4 text-[#9ca3af]" /></div>
      <div className="min-w-0">
        <p className={titleCls}>{r.target?.title || "Untitled Space"}</p>
        <p className={metaCls}>Space · ID: sp_{r.target?.id ?? "-"}</p>
      </div>
    </div>
  );
}

/** The public site, same env var + fallback every other admin page already
 *  uses for a "view on reelsoo.com" link (see users/page.tsx, users/[id]/page.tsx). */
const FRONTEND_URL = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live";

/**
 * Where "View Content" can actually land - only types with a real place to
 * land get the link; the rest would just open a list, or nothing.
 *
 * Video opens the actual reported video on the live site, in a new tab -
 * that's what a reviewer wants to see, not the admin edit form. `/video/:id`
 * (singular) is the canonical URL; `/videos/:id` 308s there (see that route's
 * own comment), so this points straight at it. Account still opens the admin
 * user page, since account review stays an admin-side action.
 */
function contentHref(type: ReportType, r: ReportRow): string | null {
  if (type === "video" && r.video?.id) return `${FRONTEND_URL}/video/${r.video.id}`;
  if (type === "user" && r.target?.id) return `/users/${r.target.id}`;
  return null;
}

/**
 * The account an account-level action (Warn/Suspend/Ban/Restrict) would
 * apply to - the content's owner, not the reporter. Only resolvable for the
 * same types BANNABLE already covers: conversation/live_stream/space have no
 * single owner (a DM has two participants, a room has no fixed "content"),
 * so there's nothing honest to point these actions at for those types.
 */
function targetUser(type: ReportType, r: ReportRow): OwnerUser | null {
  if (type === "video") return r.video?.user ?? null;
  if (type === "comment") return r.comment?.user ?? null;
  if (type === "story") return r.story?.user ?? null;
  if (type === "user") return r.target ?? null;
  return null;
}

export default function ReportedPage() {
  const qc = useQueryClient();
  const [tab, setTab]       = useState<ReportType>("video");
  const [page, setPage]     = useState(1);
  const [q, setQ]           = useState("");
  const [status, setStatus] = useState("pending");
  const [reason, setReason] = useState("");
  const [from, setFrom]     = useState("");
  const [to, setTo]         = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [activeReport, setActiveReport] = useState<{ id: number; type: ReportType } | null>(null);
  const [confirmAction, setConfirmAction] = useState<null | "remove" | "permanent_delete" | "ban">(null);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [actionReason, setActionReason] = useState("");
  /** Account-level actions (Warn/Suspend/Ban/Restrict), separate from the
   *  report-level ones above - these act on the content owner's account via
   *  the same endpoints the User 360 page uses, not on the report itself. */
  const [accountAction, setAccountAction] = useState<null | "warn" | "suspend" | "ban" | "restrict">(null);
  const [accountReason, setAccountReason] = useState("");
  const [suspendPreset, setSuspendPreset] = useState<"24h" | "7d" | "30d" | "indefinite">("7d");

  const resetSelection = () => setSelectedIds(new Set());

  const { data: stats } = useQuery<Stats>({
    queryKey: ["admin-report-stats"],
    queryFn: adminService.reportStats,
  });

  const params = {
    page, per_page: 20, type: tab, status,
    ...(q && { q }), ...(reason && { reason }), ...(from && { from }), ...(to && { to }),
  };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-reports", params],
    queryFn:  () => adminService.reports(params),
  });

  const reports: ReportRow[] = data?.data ?? [];
  const meta = data?.meta ?? {};
  const pageIds = reports.map((r) => r.id);
  const allOnPageSelected = pageIds.length > 0 && pageIds.every((id) => selectedIds.has(id));

  const detail = useQuery({
    queryKey: ["admin-report-detail", activeReport?.id, activeReport?.type],
    queryFn:  () => adminService.reportDetail(activeReport!.id, activeReport!.type),
    enabled:  !!activeReport,
  });
  const d: ReportRow | undefined = detail.data;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    qc.invalidateQueries({ queryKey: ["admin-report-stats"] });
  };

  const act = useMutation({
    mutationFn: ({ id, action, type, reason }: { id: number; action: string; type: ReportType; reason?: string }) =>
      adminService.reportAction(id, action, type, reason),
    onSuccess: (_, { action }) => {
      const label =
        action === "dismiss" ? "Report dismissed"
        : action === "permanent_delete" ? "Content permanently deleted"
        : `Report ${action}ed`;
      toast.success(label);
      invalidate();
      setActiveReport(null);
      setConfirmAction(null);
      setActionReason("");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  /**
   * Account-level moderation - the same real, enforced endpoints the User
   * 360 page uses (admin.service.ts), not a report-scoped action. "Warn"
   * calls issueWarning360 (bumps warning_level, a real audit trail) rather
   * than the log-only warnUser, since a report review is exactly the kind
   * of "this needs to count toward something" warning. "Restrict" flips
   * disable_commenting_on_others - the ONE comment-restriction flag that is
   * actually enforced server-side (CommentController checks it); the sibling
   * "disable commenting on their own uploads" flag exists in the schema but
   * nothing reads it, so it isn't offered here - it would be a button that
   * looks like it works and doesn't.
   */
  const accountAct = useMutation({
    mutationFn: async () => {
      if (!accountAction || !d || !activeReport) return;
      const owner = targetUser(activeReport.type, d);
      if (!owner) throw new Error("No account to act on.");
      const reason = accountReason.trim();
      if (accountAction === "warn") return adminService.issueWarning360(owner.id, reason || "Warned during report review.");
      if (accountAction === "ban") return adminService.banUser(owner.id, reason || "Banned during report review.");
      if (accountAction === "restrict") return adminService.updateModeration(owner.id, { disable_commenting_on_others: true });
      // suspend
      const until = suspendPreset === "indefinite" ? null : new Date(Date.now() + SUSPEND_MS[suspendPreset]).toISOString();
      return adminService.suspendUser(owner.id, reason || "Suspended during report review.", until);
    },
    onSuccess: () => {
      const label = accountAction === "warn" ? "Warning issued" : accountAction === "ban" ? "Account banned"
        : accountAction === "restrict" ? "Commenting restricted" : "Account suspended";
      toast.success(label);
      qc.invalidateQueries({ queryKey: ["admin-report-detail"] });
      setAccountAction(null);
      setAccountReason("");
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const bulkAct = useMutation({
    mutationFn: async ({ ids, action }: { ids: number[]; action: string }) => {
      await Promise.all(ids.map((id) => adminService.reportAction(id, action, tab)));
    },
    onSuccess: (_, { ids, action }) => {
      toast.success(`${ids.length} report${ids.length > 1 ? "s" : ""} ${action === "dismiss" ? "dismissed" : `${action}ed`}`);
      invalidate();
      resetSelection();
    },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reasonOptions = useMemo(() => REASONS_BY_TYPE[tab], [tab]);
  const hasActiveFilters = status !== "pending" || !!reason || !!from || !!to || !!q;

  const clearAllFilters = () => {
    setQ(""); setStatus("pending"); setReason(""); setFrom(""); setTo(""); setPage(1);
  };

  return (
    <AdminShell title="Reported">
      <div className="space-y-5">
        <p className="-mt-1 text-[13px] text-[#6b7280]">
          Review and take action on content reported by users across the app and website.
        </p>

        {/* Stat cards - overall totals + a real 14-day trend, computed once
            server-side in AdminReportsController::stats() and reused here. */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <TrendStatCard icon={Flag} label="Total Reports" color="#fe2c55" semantic="neutral"
            value={stats?.overall.total} deltaPct={stats?.trend.total.delta_pct} series={stats?.trend.total.series} />
          <TrendStatCard icon={Clock} label="Pending Review" color="#f59e0b" semantic="up-bad"
            value={stats?.overall.pending} deltaPct={stats?.trend.pending.delta_pct} series={stats?.trend.pending.series} />
          <TrendStatCard icon={CheckCircle2} label="Resolved" color="#10b981" semantic="up-good"
            value={stats?.overall.actioned} deltaPct={stats?.trend.actioned.delta_pct} series={stats?.trend.actioned.series} />
          <TrendStatCard icon={ShieldOff} label="False Reports" color="#6b7280" semantic="neutral"
            value={stats?.overall.dismissed} deltaPct={stats?.trend.dismissed.delta_pct} series={stats?.trend.dismissed.series} />
        </div>

        <div className="flex flex-wrap items-start gap-5">
          {/* ── Left: tabs, filters, table ── */}
          <div className="min-w-0 flex-1 space-y-5">
            {/* Tabs */}
            <div className="flex gap-0 overflow-x-auto rounded-xl border border-[#e8eaed] bg-white">
              {TYPES.map((t) => {
                const pending = pendingFor(stats, t.key);
                const on = tab === t.key;
                return (
                  <button key={t.key}
                    onClick={() => { setTab(t.key); setPage(1); setReason(""); resetSelection(); }}
                    className={`flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-3 text-[13px] font-medium transition-colors
                      ${on ? "border-[#fe2c55] text-[#fe2c55]" : "border-transparent text-[#6b7280] hover:text-[#111827]"}`}>
                    <t.icon className="h-3.5 w-3.5" />
                    {t.label}
                    {!!pending && (
                      <span className={`grid h-4 min-w-4 place-items-center rounded-full px-1 text-[10px] font-bold
                        ${on ? "bg-[#fe2c55] text-white" : "bg-[#f3f4f6] text-[#6b7280]"}`}>
                        {pending > 999 ? `${(pending / 1000).toFixed(1)}K` : pending}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Filters */}
            <Card className="p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[180px] flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
                  <Input placeholder="Search reporter or content..." value={q}
                    onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
                </div>
                <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                  <option value="pending">Pending</option>
                  <option value="reviewed">Reviewed</option>
                  <option value="actioned">Resolved</option>
                  <option value="dismissed">False Report</option>
                  <option value="all">All Statuses</option>
                </Select>
                <Select value={reason} onChange={(e) => { setReason(e.target.value); setPage(1); }}>
                  <option value="">All Reasons</option>
                  {reasonOptions.map((r) => (
                    <option key={r} value={r} className="capitalize">{reasonLabel(r)}</option>
                  ))}
                </Select>
                <div className="flex items-center gap-1.5">
                  <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(1); }} className="w-[140px]" aria-label="From date" />
                  <span className="text-[12px] text-[#9ca3af]">to</span>
                  <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(1); }} className="w-[140px]" aria-label="To date" />
                </div>
              </div>

              {hasActiveFilters && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#f3f4f6] pt-3">
                  {status !== "pending" && (
                    <FilterChip label={`Status: ${status === "all" ? "All" : status}`} onClear={() => setStatus("pending")} />
                  )}
                  {!!reason && <FilterChip label={`Reason: ${reasonLabel(reason)}`} onClear={() => setReason("")} />}
                  {(!!from || !!to) && (
                    <FilterChip label={`Date: ${from || "…"} → ${to || "…"}`} onClear={() => { setFrom(""); setTo(""); }} />
                  )}
                  {!!q && <FilterChip label={`Search: "${q}"`} onClear={() => setQ("")} />}
                  <button onClick={clearAllFilters} className="text-[12px] font-semibold text-[#fe2c55] hover:underline">
                    Clear all
                  </button>
                </div>
              )}
            </Card>

            {/* Table */}
            <Card>
              <Table>
                <Thead>
                  <Th className="w-8">
                    <input type="checkbox" className="accent-[#fe2c55]" checked={allOnPageSelected}
                      onChange={() => setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (allOnPageSelected) pageIds.forEach((id) => next.delete(id));
                        else pageIds.forEach((id) => next.add(id));
                        return next;
                      })} />
                  </Th>
                  <Th>Reported Content</Th>
                  <Th>Reporter</Th>
                  <Th>Reason</Th>
                  <Th>Status</Th>
                  <Th>Priority</Th>
                  <Th>Reported At</Th>
                  <Th className="w-16">View</Th>
                </Thead>
                <Tbody>
                  {isLoading
                    ? <TableLoading cols={8} />
                    : reports.length === 0
                      ? <TableEmpty message="No reports found." />
                      : reports.map((r) => {
                          const selected = selectedIds.has(r.id);
                          return (
                            <Tr key={r.id} className={selected ? "bg-[#fff1f3]" : undefined}>
                              <Td>
                                <input type="checkbox" className="accent-[#fe2c55]" checked={selected}
                                  onChange={() => setSelectedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(r.id)) next.delete(r.id); else next.add(r.id);
                                    return next;
                                  })} />
                              </Td>
                              <Td><ContentCell type={tab} r={r} /></Td>
                              <Td>
                                <div>
                                  <p className="text-[13px] font-medium text-[#111827]">{r.reporter?.name ?? "-"}</p>
                                  <p className="text-[11px] text-[#9ca3af]">@{r.reporter?.username}</p>
                                </div>
                              </Td>
                              <Td>
                                <div className="flex items-center gap-1.5">
                                  <Badge variant="warning" className="capitalize">{reasonLabel(r.reason)}</Badge>
                                  {!!r.evidence?.length && <ImageIcon className="h-3 w-3 text-[#9ca3af]" aria-label="Has evidence" />}
                                </div>
                              </Td>
                              <Td><ReportStatusBadge status={r.status} /></Td>
                              <Td><Badge variant={priorityOf(r.reason) === "high" ? "danger" : priorityOf(r.reason) === "medium" ? "warning" : "outline"} className="capitalize">{priorityOf(r.reason)}</Badge></Td>
                              <Td><span className="whitespace-nowrap text-[12px] text-[#9ca3af]">{fmtDateTime(r.created_at)}</span></Td>
                              <Td>
                                <Button variant="ghost" size="sm" title="View details"
                                  onClick={() => setActiveReport({ id: r.id, type: tab })}>
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                              </Td>
                            </Tr>
                          );
                        })
                  }
                </Tbody>
              </Table>

              {/* Bulk action bar - only takes over the footer while something's
                  selected; otherwise it's just pagination. */}
              {selectedIds.size > 0 ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e8eaed] px-4 py-3">
                  <div className="flex items-center gap-3">
                    <span className="text-[12px] font-medium text-[#374151]">{selectedIds.size} selected</span>
                    <button onClick={resetSelection} className="text-[12px] text-[#9ca3af] hover:text-[#6b7280]">Clear</button>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={bulkAct.isPending}
                      onClick={() => bulkAct.mutate({ ids: [...selectedIds], action: "dismiss" })}>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Dismiss
                    </Button>
                    <Button variant="warning" size="sm" disabled={bulkAct.isPending}
                      onClick={() => bulkAct.mutate({ ids: [...selectedIds], action: "warn" })}>
                      <MessageSquare className="h-3.5 w-3.5" /> Warn
                    </Button>
                    {REMOVABLE.includes(tab) && (
                      <Button variant="danger" size="sm" disabled={bulkAct.isPending}
                        onClick={() => bulkAct.mutate({ ids: [...selectedIds], action: "remove" })}>
                        <Trash2 className="h-3.5 w-3.5" /> Remove
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <Pagination
                  currentPage={meta.current_page ?? 1}
                  lastPage={meta.last_page ?? 1}
                  total={meta.total ?? 0}
                  onPage={(p) => { setPage(p); resetSelection(); }}
                />
              )}
            </Card>
          </div>

          {/* ── Right: persistent detail panel. Full-width and stacked below
              the table under xl (never hidden - the Eye button must always
              lead somewhere); pinned to a fixed 380px column beside it above
              that breakpoint. ── */}
          <div className="sticky top-0 w-full xl:w-[380px] xl:shrink-0">
            <Card className="max-h-[calc(100vh-140px)] overflow-hidden">
              <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3.5">
                <h3 className="text-[14px] font-bold text-[#111827]">Report Details</h3>
                {activeReport && (
                  <button onClick={() => setActiveReport(null)} className="grid h-7 w-7 place-items-center rounded-lg text-[#9ca3af] hover:bg-[#f4f5f7]">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>

              <div className="max-h-[calc(100vh-192px)] overflow-y-auto p-4">
                {!activeReport ? (
                  <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
                    <Flag className="h-8 w-8 text-[#e8eaed]" />
                    <p className="text-[12.5px] text-[#9ca3af]">Select a report to see its details.</p>
                  </div>
                ) : detail.isLoading || !d ? (
                  <div className="animate-pulse space-y-3">
                    <div className="h-4 w-1/3 rounded bg-[#f3f4f6]" />
                    <div className="h-16 rounded bg-[#f3f4f6]" />
                    <div className="h-4 w-2/3 rounded bg-[#f3f4f6]" />
                  </div>
                ) : (
                  <div className="space-y-5">
                    {d.status === "pending" && (
                      <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 ${
                        priorityOf(d.reason) === "high" ? "border-red-100 bg-red-50" : priorityOf(d.reason) === "medium" ? "border-amber-100 bg-amber-50" : "border-[#e8eaed] bg-[#f9fafb]"
                      }`}>
                        <Flag className={`h-4 w-4 shrink-0 ${priorityOf(d.reason) === "high" ? "text-red-600" : priorityOf(d.reason) === "medium" ? "text-amber-600" : "text-[#6b7280]"}`} />
                        <div>
                          <p className={`text-[12.5px] font-bold capitalize ${priorityOf(d.reason) === "high" ? "text-red-700" : priorityOf(d.reason) === "medium" ? "text-amber-700" : "text-[#374151]"}`}>
                            {priorityOf(d.reason)} priority
                          </p>
                          <p className="text-[11px] text-[#6b7280]">Derived from the report reason.</p>
                        </div>
                      </div>
                    )}

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Reported Content</p>
                      <ContentCell type={activeReport.type} r={d} size="lg" />
                      {activeReport.type === "video" && (d.video?.views_count != null) && (
                        <div className="mt-3 flex items-center gap-4 text-[12px] text-[#6b7280]">
                          <span><b className="text-[#111827]">{formatCompact(d.video?.views_count)}</b> Views</span>
                          <span><b className="text-[#111827]">{formatCompact(d.video?.likes_count)}</b> Likes</span>
                          <span><b className="text-[#111827]">{formatCompact(d.video?.comments_count)}</b> Comments</span>
                        </div>
                      )}
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Report Information</p>
                      <dl className="space-y-2">
                        <DetailRow label="Reported By">
                          <div className="flex items-center gap-2">
                            {d.reporter?.avatar && (
                              // eslint-disable-next-line @next/next/no-img-element -- signed, expiring CDN URL
                              <img src={d.reporter.avatar} alt="" className="h-5 w-5 rounded-full object-cover" />
                            )}
                            <span className="text-[12.5px] text-[#111827]">{d.reporter?.name} <span className="text-[#9ca3af]">@{d.reporter?.username}</span></span>
                          </div>
                        </DetailRow>
                        <DetailRow label="Reason"><span className="text-[12.5px] capitalize text-[#111827]">{reasonLabel(d.reason)}</span></DetailRow>
                        {!!d.details && <DetailRow label="Details"><span className="text-[12.5px] leading-relaxed text-[#374151]">{d.details}</span></DetailRow>}
                        <DetailRow label="Reported At"><span className="text-[12.5px] text-[#111827]">{fmtDateTime(d.created_at)}</span></DetailRow>
                        <DetailRow label="Type"><span className="text-[12.5px] capitalize text-[#111827]">{TYPES.find((t) => t.key === activeReport.type)?.label}</span></DetailRow>
                        <DetailRow label="Report ID"><span className="text-[12.5px] text-[#9ca3af]">RP-{d.id}</span></DetailRow>
                      </dl>
                    </div>

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">
                        Evidence {d.evidence?.length ? `(${d.evidence.length})` : ""}
                      </p>
                      {!d.evidence?.length ? (
                        <div className="flex items-center gap-2 text-[12px] text-[#9ca3af]">
                          <ImageOff className="h-3.5 w-3.5" /> No evidence attached.
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {d.evidence.map((e, i) => e.url && (
                            <a key={e.key ?? i} href={e.url} target="_blank" rel="noreferrer"
                              className="group relative aspect-square overflow-hidden rounded-lg border border-[#e8eaed]">
                              {/* eslint-disable-next-line @next/next/no-img-element -- signed, expiring CDN URL */}
                              <img src={e.url} alt={`Evidence ${i + 1}`} className="h-full w-full object-cover" />
                              <div className="absolute inset-0 hidden items-center justify-center bg-black/40 group-hover:flex">
                                <ExternalLink className="h-4 w-4 text-white" />
                              </div>
                            </a>
                          ))}
                        </div>
                      )}
                    </div>

                    {d.status === "pending" && (
                      <div>
                        <div className="mb-2 flex items-center justify-between">
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Actions</p>
                          {REMOVABLE.includes(activeReport.type) && (
                            <div className="relative">
                              <button type="button" onClick={() => setMoreMenuOpen((o) => !o)}
                                className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold text-[#6b7280] hover:bg-[#f4f5f7]">
                                <MoreHorizontal className="h-3.5 w-3.5" /> More
                              </button>
                              {moreMenuOpen && (
                                <>
                                  <div className="fixed inset-0 z-10" onClick={() => setMoreMenuOpen(false)} />
                                  <div className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl border border-[#e8eaed] bg-white p-1.5 shadow-lg">
                                    <button type="button"
                                      onClick={() => { setMoreMenuOpen(false); setConfirmAction("permanent_delete"); }}
                                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[12.5px] font-semibold text-red-700 hover:bg-red-50">
                                      <Trash className="h-3.5 w-3.5" />
                                      Permanently delete
                                    </button>
                                    <p className="px-2.5 pb-1.5 pt-0.5 text-[10.5px] leading-snug text-[#9ca3af]">
                                      Deletes the file and every version of it from storage. Cannot be undone.
                                    </p>
                                  </div>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <Button variant="success" size="sm" disabled={act.isPending}
                            onClick={() => act.mutate({ id: d.id, action: "dismiss", type: activeReport.type })}>
                            <CheckCircle2 className="h-3.5 w-3.5" /> Dismiss
                          </Button>
                          {REMOVABLE.includes(activeReport.type) ? (
                            <Button variant="danger" size="sm" disabled={act.isPending} onClick={() => setConfirmAction("remove")}>
                              <Trash2 className="h-3.5 w-3.5" /> Remove Content
                            </Button>
                          ) : (
                            <Button variant="warning" size="sm" disabled={act.isPending}
                              onClick={() => act.mutate({ id: d.id, action: "warn", type: activeReport.type })}>
                              <MessageSquare className="h-3.5 w-3.5" /> Warn
                            </Button>
                          )}
                          {REMOVABLE.includes(activeReport.type) && (
                            <Button variant="warning" size="sm" disabled={act.isPending}
                              onClick={() => act.mutate({ id: d.id, action: "warn", type: activeReport.type })}>
                              <MessageSquare className="h-3.5 w-3.5" /> Warn
                            </Button>
                          )}
                          {BANNABLE.includes(activeReport.type) && (
                            <Button variant="danger" size="sm" disabled={act.isPending} onClick={() => setConfirmAction("ban")}>
                              <Ban className="h-3.5 w-3.5" /> Ban Account
                            </Button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Account-level moderation, separate from the report
                        queue actions above: these act on the content owner's
                        account itself via the same real endpoints User 360
                        uses (Warn/Suspend/Restrict) - not on this one report.
                        Only shown where a single owner exists to act on (the
                        same gate as Ban Account above). */}
                    {BANNABLE.includes(activeReport.type) && targetUser(activeReport.type, d) && (
                      <div>
                        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Account Actions</p>
                        {(() => {
                          const owner = targetUser(activeReport.type, d)!;
                          return (
                            <>
                              <div className="mb-2.5 flex items-center gap-2 rounded-lg bg-[#f9fafb] px-2.5 py-2">
                                {owner.avatar && (
                                  // eslint-disable-next-line @next/next/no-img-element -- signed, expiring CDN URL
                                  <img src={owner.avatar} alt="" className="h-6 w-6 rounded-full object-cover" />
                                )}
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-[12px] font-medium text-[#111827]">{owner.name} <span className="text-[#9ca3af]">@{owner.username}</span></p>
                                </div>
                                {owner.is_banned && <Badge variant="danger">Banned</Badge>}
                                {!owner.is_banned && owner.is_active === false && <Badge variant="warning">Suspended</Badge>}
                              </div>
                              {/* Ban Account isn't repeated here - the one in
                                  Actions above also closes out this report in
                                  the same click; this one wouldn't, and two
                                  "Ban Account" buttons with different side
                                  effects is worse than one. */}
                              <div className="grid grid-cols-2 gap-2">
                                <Button variant="outline" size="sm" disabled={accountAct.isPending}
                                  onClick={() => setAccountAction("warn")}>
                                  <MessageSquare className="h-3.5 w-3.5" /> Issue Warning
                                </Button>
                                <Button variant="warning" size="sm" disabled={accountAct.isPending || owner.is_banned}
                                  onClick={() => setAccountAction("suspend")}>
                                  <Clock className="h-3.5 w-3.5" /> Suspend
                                </Button>
                                <Button variant="outline" size="sm" disabled={accountAct.isPending} className="col-span-2"
                                  onClick={() => setAccountAction("restrict")}>
                                  <ShieldOff className="h-3.5 w-3.5" /> Restrict Commenting
                                </Button>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    )}

                    <div>
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Quick Navigation</p>
                      <div className="space-y-1">
                        {contentHref(activeReport.type, d) && (
                          <QuickNavLink href={contentHref(activeReport.type, d)!} label="View Content" />
                        )}
                        {!!d.reporter?.id && (
                          <QuickNavLink href={`/users/${d.reporter.id}`} label="View Reporter Profile" />
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </div>
      </div>

      {/* ── Confirm remove/permanently-delete/ban ── */}
      <ConfirmModal
        open={!!confirmAction && !!d}
        title={
          confirmAction === "remove" ? "Remove this content?"
          : confirmAction === "permanent_delete" ? "Permanently delete this content?"
          : "Ban this account?"
        }
        message={
          confirmAction === "remove"
            ? "This deletes or hides the reported content. This cannot be undone from here."
            : confirmAction === "permanent_delete"
              ? "This deletes the file and every stored version of it (renditions, thumbnails, attachments) for good - not the recycle-bin kind. The owner is notified. There is no undo, not even from the database."
              : "This immediately bans the account and revokes every active session."
        }
        danger
        loading={act.isPending}
        confirmLabel={confirmAction === "remove" ? "Remove" : confirmAction === "permanent_delete" ? "Permanently delete" : "Ban account"}
        onCancel={() => { setConfirmAction(null); setActionReason(""); }}
        onConfirm={() => {
          if (!d || !activeReport || !confirmAction) return;
          act.mutate({ id: d.id, action: confirmAction, type: activeReport.type, reason: actionReason || undefined });
        }}
      >
        <Textarea
          placeholder="Reason (optional, shown in the audit log)"
          value={actionReason}
          onChange={(e) => setActionReason(e.target.value)}
          className="mt-3"
          rows={2}
        />
      </ConfirmModal>

      {/* ── Confirm account-level action (Warn/Suspend/Restrict) ── */}
      <ConfirmModal
        open={!!accountAction && !!d}
        title={
          accountAction === "warn" ? "Issue a formal warning?"
          : accountAction === "suspend" ? "Suspend this account?"
          : "Restrict commenting on other people's content?"
        }
        message={
          accountAction === "warn" ? "Recorded against the account and counted toward its strike history."
          : accountAction === "suspend" ? "The account is signed out everywhere and can't sign back in until the suspension lifts."
          : "The account can still comment on their own posts, but not anyone else's, until this is turned off again from their profile."
        }
        danger={accountAction === "suspend"}
        loading={accountAct.isPending}
        confirmLabel={accountAction === "warn" ? "Issue warning" : accountAction === "suspend" ? "Suspend account" : "Restrict"}
        onCancel={() => { setAccountAction(null); setAccountReason(""); }}
        onConfirm={() => accountAct.mutate()}
      >
        {accountAction === "suspend" && (
          <div className="mt-3 flex gap-1.5">
            {(["24h", "7d", "30d", "indefinite"] as const).map((p) => (
              <button key={p} type="button" onClick={() => setSuspendPreset(p)}
                className={`rounded-lg px-2.5 py-1 text-[11.5px] font-semibold capitalize transition ${
                  suspendPreset === p ? "bg-[#fe2c55] text-white" : "bg-[#f3f4f6] text-[#374151] hover:bg-[#e8eaed]"
                }`}>
                {p === "indefinite" ? "Indefinite" : p}
              </button>
            ))}
          </div>
        )}
        {accountAction !== "restrict" && (
          <Textarea
            placeholder="Reason (optional, shown in the audit log)"
            value={accountReason}
            onChange={(e) => setAccountReason(e.target.value)}
            className="mt-3"
            rows={2}
          />
        )}
      </ConfirmModal>
    </AdminShell>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#f3f4f6] py-1 pl-3 pr-1.5 text-[11.5px] font-medium capitalize text-[#374151]">
      {label}
      <button onClick={onClear} className="grid h-4 w-4 place-items-center rounded-full text-[#9ca3af] hover:bg-[#e8eaed] hover:text-[#374151]">
        <X className="h-2.5 w-2.5" />
      </button>
    </span>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 text-[11.5px] text-[#9ca3af]">{label}</dt>
      <dd className="min-w-0 text-right">{children}</dd>
    </div>
  );
}

/** An absolute URL (the live site) opens in a new tab, since it's a
 *  different app entirely; a bare path (an admin route) navigates in place,
 *  same as every other in-app link. */
function QuickNavLink({ href, label }: { href: string; label: string }) {
  const external = /^https?:\/\//.test(href);
  const content = (
    <>
      {label}
      <ExternalLink className="h-3.5 w-3.5 text-[#9ca3af]" />
    </>
  );
  const className = "flex items-center justify-between rounded-lg px-2.5 py-2 text-[12.5px] font-medium text-[#374151] transition hover:bg-[#f4f5f7]";

  return external ? (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
  ) : (
    <Link href={href} className={className}>{content}</Link>
  );
}
