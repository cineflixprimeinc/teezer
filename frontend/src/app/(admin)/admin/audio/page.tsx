"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AudioLines, Radio, Users, Headphones, CalendarClock, BadgeCheck,
  Plus, Search, SlidersHorizontal, Eye, MoreVertical, Mic, MicOff,
  X, Share2, Link2, Square, Globe, Hand, MessageSquare, Heart,
  BarChart3, UserMinus, Trash2, Radio as RadioIcon, PlayCircle,
  Volume2, Crown, UserX, Loader2, ChevronRight, ListChecks, UserCheck,
  Gift, DoorClosed, Music2,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card } from "@/admin-panel/components/ui/card";
import { Input, Select } from "@/admin-panel/components/ui/input";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { Pagination } from "@/admin-panel/components/ui/data-table";
import { adminService } from "@/admin-panel/services/admin.service";
import { apiMessage } from "@/admin-panel/services/api";
import { cn, formatCompact, timeAgo } from "@/admin-panel/lib/utils";

/**
 * Audio Rooms Management - the live-audio Spaces console.
 *
 * The list is real (GET /admin/spaces + /stats). Clicking a room opens the
 * right-hand control panel: room detail, live-listen controls, insights and the
 * moderator levers. End Room / Delete hit the real endpoints; the room toggles
 * and stream controls are presented for the operator but are not yet wired to a
 * backend (they no-op with a note) - flagged so nobody mistakes them for live.
 */

type SpaceHost = { id: number; name: string; username: string; avatar: string | null; is_verified: boolean };
type Space = {
  id: number;
  title: string;
  description: string | null;
  topic: string | null;
  status: "scheduled" | "live" | "ended";
  listeners_count: number;
  speakers_count: number;
  peak_listeners: number;
  is_recorded: boolean;
  duration_minutes: number | null;
  started_at: string | null;
  ended_at: string | null;
  created_at: string | null;
  host: SpaceHost | null;
  // Real room controls (present on the list + detail resource).
  privacy?: "public" | "private" | "invite";
  speaking_permission?: "everyone" | "request" | "host_only";
  enable_chat?: boolean;
  allow_reactions?: boolean;
  enable_polls?: boolean;
  allow_speaker_requests?: boolean;
  tags?: string[];
  // Room rules + access-control extras (present on the list + detail resource).
  room_rules?: string[];
  allowed_followers_count?: number;
  has_invite_link?: boolean;
  // Room extras - the rest of the Create-Space sheet's settings, editable
  // through the same PATCH .../controls as the toggles above.
  gifts_enabled?: boolean;
  waiting_room_enabled?: boolean;
  sound_clips_enabled?: boolean;
  speaker_slots?: number | null;
};

type Participant = {
  id: number;
  role: "host" | "speaker" | "listener";
  muted: boolean;
  requesting: boolean;
  is_host: boolean;
  joined_at: string | null;
  user: SpaceHost | null;
};
type ModUser = SpaceHost & { is_host: boolean };
type SpaceCounts = { participants: number; speakers: number; listeners: number; requests: number; moderators: number };
type SpaceDetail = Space & { participants?: Participant[]; moderators?: ModUser[]; counts?: SpaceCounts };

const PRIVACY_LABEL: Record<string, string> = { public: "Public", private: "Private", invite: "Invite Only" };
const SPEAK_LABEL: Record<string, string> = { everyone: "Everyone", request: "Request to Speak", host_only: "Host Only" };
const ROOM_RULE_LABEL: Record<string, string> = { kind: "Be Kind", topic: "Stay on Topic", no_record: "No Recording", no_promo: "No Self-Promotion" };
// The stage always has a real, capped number of mic seats (max 100, see
// SpaceCreateController) - clicking cycles through the same presets the
// app's own picker offers, rather than an unbounded free-type field.
const SLOT_STEPS = [10, 25, 50, 75, 100];

/** Ticking "HH:MM:SS" elapsed since `startedAt` (null → "00:00:00"). */
function useElapsed(startedAt: string | null | undefined): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [startedAt]);
  if (!startedAt) return "00:00:00";
  const secs = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 1000));
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return [h, m, s].map((n) => String(n).padStart(2, "0")).join(":");
}

// Cover-art stand-ins: rooms have no uploaded artwork, so each gets a stable
// branded gradient keyed by id, with a glyph for its topic.
const GRADIENTS = [
  "linear-gradient(135deg,#7c3aed,#db2777)",
  "linear-gradient(135deg,#f97316,#be123c)",
  "linear-gradient(135deg,#6366f1,#a855f7)",
  "linear-gradient(135deg,#0ea5e9,#6366f1)",
  "linear-gradient(135deg,#10b981,#0891b2)",
  "linear-gradient(135deg,#f43f5e,#7c3aed)",
];
const coverFor = (id: number) => GRADIENTS[id % GRADIENTS.length];

const CATEGORIES = [
  "Business", "Music", "Technology", "Health", "Fitness", "Gaming", "Esports",
  "Sports", "Comedy", "Education", "News", "Art", "Food", "Lifestyle", "Travel",
  "Adventure", "Wellness", "Mindfulness", "Finance", "Film", "Photography",
];

const CATEGORY_TONES: Record<string, string> = {
  live:      "bg-red-50 text-red-600",
  scheduled: "bg-amber-50 text-amber-700",
  ended:     "bg-[#f3f4f6] text-[#6b7280]",
};

export default function AudioRoomsPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [category, setCategory] = useState("");
  const [sort, setSort] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const [ending, setEnding] = useState<Space | null>(null);
  const [deleting, setDeleting] = useState<Space | null>(null);

  const params = {
    page, per_page: 10,
    ...(search && { search }),
    ...(status && { status }),
    ...(category && { category }),
    ...(sort && { sort }),
  };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-spaces", params],
    queryFn: () => adminService.spaces(params),
  });
  const statsQ = useQuery({
    queryKey: ["admin-spaces-stats"],
    queryFn: adminService.spaceStats,
    refetchInterval: 30_000,
  });

  const spaces: Space[] = data?.data ?? [];
  const meta = data?.meta ?? {};
  const stats = statsQ.data ?? {};
  const selected = spaces.find((s) => s.id === selectedId) ?? null;

  const total = stats.total ?? 0;
  const live = stats.live ?? 0;
  const scheduled = stats.scheduled ?? 0;
  const ended = Math.max(0, total - live - scheduled);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-spaces"] });
    qc.invalidateQueries({ queryKey: ["admin-spaces-stats"] });
  };
  const onErr = (e: unknown) => toast.error(apiMessage(e));

  const endM = useMutation({
    mutationFn: (id: number) => adminService.endSpace(id),
    onSuccess: () => { invalidate(); setEnding(null); toast.success("Room ended."); },
    onError: onErr,
  });
  const delM = useMutation({
    mutationFn: (id: number) => adminService.deleteSpace(id),
    onSuccess: () => { invalidate(); setDeleting(null); setSelectedId(null); toast.success("Room deleted."); },
    onError: onErr,
  });

  const from = spaces.length ? ((meta.current_page ?? 1) - 1) * (meta.per_page ?? 10) + 1 : 0;
  const to = spaces.length ? from + spaces.length - 1 : 0;

  const TABS: { key: string; label: string; count: number; dot?: string }[] = [
    { key: "", label: "All Rooms", count: total },
    { key: "live", label: "Live", count: live, dot: "#fe2c55" },
    { key: "scheduled", label: "Scheduled", count: scheduled, dot: "#f59e0b" },
    { key: "ended", label: "Ended", count: ended, dot: "#9ca3af" },
  ];

  return (
    <AdminShell title="Audio Rooms">
      <div className="flex items-start gap-5">
        {/* ── Main column ─────────────────────────────────────────────── */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Header */}
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fe2c55]/10">
                <Headphones className="h-5 w-5 text-[#fe2c55]" />
              </div>
              <div>
                <h2 className="text-[20px] font-bold text-[#111827]">Audio Rooms Management</h2>
                <p className="max-w-xl text-[13px] text-[#6b7280]">
                  Manage and control all audio spaces in Teezer. Monitor live activity, moderate users and ensure a safe experience.
                </p>
              </div>
            </div>
            <button
              onClick={() => toast.info("Rooms are hosted by creators from the app - there's no admin create flow.")}
              className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#fe2c55] px-4 text-[13px] font-semibold text-white transition hover:bg-[#e0243d]"
            >
              <Plus className="h-4 w-4" /> Create Audio Room
            </button>
          </div>

          {/* Stat cards */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            <StatCard label="Live Now"       value={live}                    sub="rooms on air now"     icon={Radio}        color="#fe2c55" loading={statsQ.isLoading} />
            <StatCard label="Listening Now"  value={stats.listeners_now}     sub="across live rooms"    icon={Headphones}   color="#3b82f6" loading={statsQ.isLoading} />
            <StatCard label="Scheduled"      value={scheduled}               sub="upcoming rooms"       icon={CalendarClock} color="#f59e0b" loading={statsQ.isLoading} />
            <StatCard label="Total Rooms"    value={total}                   sub="all-time"             icon={AudioLines}   color="#8b5cf6" loading={statsQ.isLoading} />
            <StatCard label="Total Listeners" value={stats.total_listeners ?? stats.peak_ever} sub="cumulative reach" icon={Users} color="#10b981" loading={statsQ.isLoading} />
          </div>

          {/* Filters */}
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  className="pl-9"
                  placeholder="Search by room title, host or description..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
                <option value="">All Status</option>
                <option value="live">Live</option>
                <option value="scheduled">Scheduled</option>
                <option value="ended">Ended</option>
              </Select>
              <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
                <option value="">All Categories</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </Select>
              <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                <option value="">Latest First</option>
                <option value="listeners">Most Listeners</option>
                <option value="peak">Highest Peak</option>
                <option value="oldest">Oldest</option>
              </Select>
              <button className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px] border border-[#e8eaed] bg-white text-[#6b7280] transition hover:bg-[#f4f5f7]">
                <SlidersHorizontal className="h-4 w-4" />
              </button>
            </div>
          </Card>

          {/* Tabs + table */}
          <Card className="overflow-hidden">
            <div className="flex items-center gap-6 border-b border-[#e8eaed] px-4">
              {TABS.map((t) => {
                const active = status === t.key;
                return (
                  <button
                    key={t.key || "all"}
                    onClick={() => { setStatus(t.key); setPage(1); }}
                    className={cn(
                      "flex items-center gap-2 border-b-2 py-3 text-[13px] font-semibold transition-colors",
                      active ? "border-[#fe2c55] text-[#fe2c55]" : "border-transparent text-[#6b7280] hover:text-[#111827]",
                    )}
                  >
                    {t.dot && <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />}
                    {t.label}
                    <span className={cn("rounded-full px-1.5 py-0.5 text-[11px] font-bold", active ? "bg-[#fe2c55]/10 text-[#fe2c55]" : "bg-[#f3f4f6] text-[#9ca3af]")}>
                      {formatCompact(t.count)}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="w-full overflow-x-auto">
              <table className="w-full border-collapse text-[13px]">
                <thead>
                  <tr className="border-b border-[#e8eaed] bg-[#f9fafb] text-[11px] font-semibold uppercase tracking-wide text-[#6b7280]">
                    <th className="px-4 py-3 text-left">Room</th>
                    <th className="px-4 py-3 text-left">Host</th>
                    <th className="px-4 py-3 text-left">Status</th>
                    <th className="px-4 py-3 text-left">Listeners</th>
                    <th className="px-4 py-3 text-left">Peak</th>
                    <th className="px-4 py-3 text-left">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f3f4f6]">
                  {isLoading && [...Array(6)].map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      {[...Array(6)].map((__, j) => (
                        <td key={j} className="px-4 py-4"><div className="h-8 rounded bg-[#f3f4f6]" /></td>
                      ))}
                    </tr>
                  ))}

                  {!isLoading && spaces.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-[13px] text-[#9ca3af]">
                        {search || status || category ? "No rooms match these filters." : "No audio rooms yet."}
                      </td>
                    </tr>
                  )}

                  {spaces.map((s) => (
                    <tr
                      key={s.id}
                      onClick={() => setSelectedId(s.id)}
                      className={cn(
                        "cursor-pointer transition-colors hover:bg-[#f9fafb]",
                        selectedId === s.id && "bg-[#fff0f4] ring-1 ring-inset ring-[#fe2c55]/40",
                      )}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: coverFor(s.id) }}>
                            <Mic className="h-4 w-4 text-white/95" />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[#111827]">{s.title}</p>
                            <div className="mt-0.5 flex flex-wrap gap-1">
                              {s.topic
                                ? <span className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">{s.topic}</span>
                                : <span className="text-[10px] text-[#9ca3af]">No category</span>}
                              {s.is_recorded && <span className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">Recorded</span>}
                            </div>
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3">
                        {s.host ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={s.host.name} src={s.host.avatar} />
                            <span className="text-[13px] text-[#374151]">@{s.host.username}</span>
                            {s.host.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#1d9bf0]" />}
                          </div>
                        ) : <span className="text-[13px] text-[#9ca3af]">-</span>}
                      </td>

                      <td className="px-4 py-3"><StatusPill status={s.status} /></td>
                      <td className="px-4 py-3"><span className="text-[13px] font-semibold text-[#111827]">{formatCompact(s.listeners_count)}</span></td>
                      <td className="px-4 py-3"><span className="text-[13px] text-[#374151]">{formatCompact(s.peak_listeners)}</span></td>

                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          {s.status === "live" && (
                            <IconBtn title="Listen" onClick={() => setSelectedId(s.id)} className="text-[#fe2c55]">
                              <AudioLines className="h-4 w-4" />
                            </IconBtn>
                          )}
                          <IconBtn title="Open controls" onClick={() => setSelectedId(s.id)}>
                            <Eye className="h-4 w-4" />
                          </IconBtn>
                          <RowMenu
                            canEnd={s.status === "live"}
                            onOpen={() => setSelectedId(s.id)}
                            onEnd={() => setEnding(s)}
                            onDelete={() => setDeleting(s)}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex items-center justify-between px-4 py-3">
              <p className="text-[12px] text-[#6b7280]">
                Showing {from}-{to} of {(meta.total ?? 0).toLocaleString()} rooms
              </p>
              <Pagination
                currentPage={meta.current_page ?? 1}
                lastPage={meta.last_page ?? 1}
                total={meta.total ?? 0}
                onPage={setPage}
              />
            </div>
          </Card>
        </div>

        {/* ── Room control panel (opens on room click) ────────────────── */}
        {selected && (
          <>
            <div className="fixed inset-0 z-30 bg-black/25 lg:hidden" onClick={() => setSelectedId(null)} />
            <aside
              className={cn(
                "fixed inset-y-0 right-0 z-40 w-[92%] max-w-[380px] overflow-y-auto border-l border-[#e8eaed] bg-white shadow-xl",
                "lg:sticky lg:inset-auto lg:top-0 lg:z-auto lg:w-[372px] lg:max-w-none lg:shrink-0 lg:self-start",
                "lg:max-h-[calc(100vh-112px)] lg:rounded-2xl lg:border lg:shadow-sm",
              )}
            >
              <RoomControlPanel
                key={selected.id}
                space={selected}
                onClose={() => setSelectedId(null)}
                onEnd={() => setEnding(selected)}
              />
            </aside>
          </>
        )}
      </div>

      <ConfirmModal
        open={!!ending}
        danger
        title="End this room?"
        message={`"${ending?.title}" is live with ${formatCompact(ending?.listeners_count ?? 0)} listening. Ending it removes everyone from the room immediately.`}
        confirmLabel="End room"
        loading={endM.isPending}
        onConfirm={() => ending && endM.mutate(ending.id)}
        onCancel={() => setEnding(null)}
      />
      <ConfirmModal
        open={!!deleting}
        danger
        title="Delete this room?"
        message={`"${deleting?.title}" and its participant history will be permanently removed. This cannot be undone.`}
        confirmLabel="Delete"
        loading={delM.isPending}
        onConfirm={() => deleting && delM.mutate(deleting.id)}
        onCancel={() => setDeleting(null)}
      />
    </AdminShell>
  );
}

/* ── Stat card ─────────────────────────────────────────────────────────── */

function StatCard({ label, value, sub, icon: Icon, color, loading }: {
  label: string; value?: number; sub: string; icon: React.ElementType; color: string; loading?: boolean;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between">
        <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ background: color + "15" }}>
          <Icon className="h-5 w-5" style={{ color }} />
        </div>
      </div>
      <p className="mt-3 text-[24px] font-bold leading-none text-[#111827]">{loading ? "-" : formatCompact(value ?? 0)}</p>
      <p className="mt-1.5 text-[12px] font-semibold text-[#374151]">{label}</p>
      <p className="text-[11px] text-[#9ca3af]">{sub}</p>
    </Card>
  );
}

/* ── Small shared bits ─────────────────────────────────────────────────── */

function Avatar({ name, src, size = 24 }: { name: string; src: string | null; size?: number }) {
  if (src) return <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  return (
    <div className="grid shrink-0 place-items-center rounded-full bg-[#fe2c55]/10 font-bold text-[#fe2c55]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
      {(name?.[0] ?? "?").toUpperCase()}
    </div>
  );
}

function StatusPill({ status }: { status: Space["status"] }) {
  const map = {
    live:      { label: "LIVE", tone: CATEGORY_TONES.live, dot: "#fe2c55", filled: true },
    scheduled: { label: "SCHEDULED", tone: CATEGORY_TONES.scheduled, dot: "#f59e0b", filled: true },
    ended:     { label: "ENDED", tone: CATEGORY_TONES.ended, dot: "#9ca3af", filled: false },
  }[status];
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold", map.tone)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", !map.filled && "ring-1 ring-inset ring-current")}
        style={map.filled ? { background: map.dot } : { background: "transparent" }} />
      {map.label}
    </span>
  );
}

function IconBtn({ children, title, onClick, className }: {
  children: React.ReactNode; title: string; onClick?: () => void; className?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={cn("grid h-8 w-8 place-items-center rounded-lg border border-[#e8eaed] bg-white text-[#6b7280] transition hover:bg-[#f4f5f7]", className)}
    >
      {children}
    </button>
  );
}

function RowMenu({ canEnd, onOpen, onEnd, onDelete }: {
  canEnd: boolean; onOpen: () => void; onEnd: () => void; onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconBtn title="More" onClick={() => setOpen((o) => !o)}><MoreVertical className="h-4 w-4" /></IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-[#e8eaed] bg-white p-1 shadow-lg">
            <MenuItem onClick={() => { setOpen(false); onOpen(); }}><Eye className="h-3.5 w-3.5" /> Open controls</MenuItem>
            {canEnd && <MenuItem onClick={() => { setOpen(false); onEnd(); }}><Square className="h-3.5 w-3.5" /> End room</MenuItem>}
            <MenuItem danger onClick={() => { setOpen(false); onDelete(); }}><Trash2 className="h-3.5 w-3.5" /> Delete</MenuItem>
          </div>
        </>
      )}
    </div>
  );
}

function MenuItem({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium transition-colors",
        danger ? "text-red-600 hover:bg-red-50" : "text-[#374151] hover:bg-[#f4f5f7]",
      )}
    >
      {children}
    </button>
  );
}

/* ── Room control panel ────────────────────────────────────────────────── */

const BARS = [8, 14, 20, 11, 26, 17, 30, 22, 13, 28, 19, 9, 24, 16, 31, 12, 21, 27, 10, 18, 25, 15, 29, 13, 20, 8, 23, 17, 30, 11, 26, 14];

function RoomControlPanel({ space, onClose, onEnd }: { space: Space; onClose: () => void; onEnd: () => void }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"overview" | "participants" | "requests" | "moderators">("overview");
  const [muted, setMuted] = useState(true);

  // Full room detail (participants, moderators, live controls). Polls while live.
  const detailQ = useQuery({
    queryKey: ["admin-space", space.id],
    queryFn: () => adminService.space(space.id) as Promise<SpaceDetail>,
    refetchInterval: space.status === "live" ? 15_000 : false,
  });
  const d: SpaceDetail = detailQ.data ?? (space as SpaceDetail);
  const participants = d.participants ?? [];
  const moderators = d.moderators ?? [];
  const requests = participants.filter((p) => p.requesting);
  const counts: SpaceCounts = d.counts ?? {
    participants: participants.length, speakers: d.speakers_count ?? 0,
    listeners: d.listeners_count ?? 0, requests: requests.length, moderators: moderators.length,
  };

  const isLive = space.status === "live";
  const elapsed = useElapsed(isLive ? (d.started_at ?? space.started_at) : null);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-space", space.id] });
    qc.invalidateQueries({ queryKey: ["admin-spaces"] });
    qc.invalidateQueries({ queryKey: ["admin-spaces-stats"] });
  };
  const onErr = (e: unknown) => toast.error(apiMessage(e));
  const controlsM = useMutation({ mutationFn: (patch: Record<string, boolean | string | number>) => adminService.spaceControls(space.id, patch), onSuccess: invalidate, onError: onErr });
  const muteAllM = useMutation({ mutationFn: () => adminService.spaceMuteAll(space.id), onSuccess: (r: { message?: string }) => { invalidate(); toast.success(r?.message ?? "Muted all speakers."); }, onError: onErr });
  const clearReqM = useMutation({ mutationFn: () => adminService.spaceClearRequests(space.id), onSuccess: (r: { message?: string }) => { invalidate(); toast.success(r?.message ?? "Requests cleared."); }, onError: onErr });
  const removeLisM = useMutation({ mutationFn: () => adminService.spaceRemoveListeners(space.id), onSuccess: (r: { message?: string }) => { invalidate(); toast.success(r?.message ?? "Listeners removed."); }, onError: onErr });
  const mutePM = useMutation({ mutationFn: (pid: number) => adminService.spaceMuteParticipant(space.id, pid), onSuccess: invalidate, onError: onErr });
  const removePM = useMutation({ mutationFn: (pid: number) => adminService.spaceRemoveParticipant(space.id, pid), onSuccess: () => { invalidate(); toast.success("Participant removed."); }, onError: onErr });

  const copyLink = () => {
    const url = `https://teezer.live/spaces/${space.id}`;
    navigator.clipboard?.writeText(url).then(() => toast.success("Room link copied."), () => toast.error("Couldn't copy link."));
  };
  const cyclePrivacy = () => { const o = ["public", "private", "invite"]; controlsM.mutate({ audience: o[(o.indexOf(d.privacy ?? "public") + 1) % 3] }); };
  const cycleSpeak = () => { const o = ["everyone", "request", "host_only"]; controlsM.mutate({ speaking_permission: o[(o.indexOf(d.speaking_permission ?? "request") + 1) % 3] }); };
  const cycleSlots = () => {
    const o = SLOT_STEPS;
    const i = o.indexOf(d.speaker_slots ?? 100);
    controlsM.mutate({ speaker_slots: o[i === -1 ? 0 : (i + 1) % o.length] });
  };

  return (
    <div className="flex flex-col">
      {/* Header strip */}
      <div className="flex items-center justify-between border-b border-[#e8eaed] px-4 py-3">
        <div className="flex items-center gap-2">
          <StatusPill status={space.status} />
          <span className="text-[12px] text-[#6b7280]">
            {isLive ? `Started ${timeAgo(space.started_at)}` : space.status === "scheduled" ? "Scheduled" : `Ended ${timeAgo(space.ended_at)}`}
          </span>
        </div>
        <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[#9ca3af] hover:bg-[#f4f5f7] hover:text-[#111827]">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="space-y-4 p-4">
        {/* Room detail */}
        <div className="flex gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-xl" style={{ background: coverFor(space.id) }}>
            <Mic className="h-6 w-6 text-white/95" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-[15px] font-bold text-[#111827]">{space.title}</p>
            {(() => {
              const tags = (d.tags?.length ? d.tags : space.topic ? [space.topic] : []).slice(0, 3);
              return tags.length > 0 ? (
                <div className="mt-1 flex flex-wrap gap-1">
                  {tags.map((t) => <span key={t} className="rounded-md bg-[#f3f4f6] px-1.5 py-0.5 text-[10px] font-medium text-[#6b7280]">{t}</span>)}
                </div>
              ) : null;
            })()}
            {space.host && (
              <div className="mt-1 flex items-center gap-1.5">
                <Avatar name={space.host.name} src={space.host.avatar} size={18} />
                <span className="text-[12px] text-[#374151]">Hosted by @{space.host.username}</span>
                {space.host.is_verified && <BadgeCheck className="h-3.5 w-3.5 text-[#1d9bf0]" />}
              </div>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-2">
          <PanelBtn icon={Share2} label="Share Room" onClick={() => {
            const url = `https://teezer.live/spaces/${space.id}`;
            if (typeof navigator !== "undefined" && navigator.share) navigator.share({ title: space.title, url }).catch(() => {});
            else copyLink();
          }} />
          <PanelBtn icon={Link2} label="Copy Link" onClick={copyLink} />
          <PanelBtn icon={Square} label="End Room" danger disabled={!isLive} onClick={onEnd} />
        </div>

        {/* Listen to live audio */}
        <div className="rounded-2xl border border-[#e8eaed] p-3">
          <div className="flex items-center justify-between">
            <p className="text-[12px] font-semibold text-[#111827]">Listen to Live Audio</p>
            {isLive && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#fe2c55]"><span className="h-1.5 w-1.5 rounded-full bg-[#fe2c55]" /> LIVE</span>}
          </div>
          <p className="mt-0.5 text-[11px] text-[#9ca3af]">Listen to the live audio stream as an admin.</p>
          <div className="mt-3 flex h-9 items-center gap-[2px]">
            {BARS.map((h, i) => (
              <span key={i} className="w-[3px] rounded-full" style={{ height: `${h}px`, background: isLive ? "#fe2c55" : "#e5e7eb", opacity: isLive ? 0.5 + (h / 62) : 1 }} />
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-semibold text-[#6b7280]">
            <span className="tabular-nums">{elapsed}</span>
            {isLive && <span className="inline-flex items-center gap-1 text-[#fe2c55]"><span className="h-1.5 w-1.5 rounded-full bg-[#fe2c55]" /> LIVE</span>}
          </div>
          <div className="mt-3 grid grid-cols-[1fr_auto_auto] gap-2">
            <button onClick={() => setMuted((m) => !m)} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-[#e8eaed] bg-white text-[12px] font-semibold text-[#374151] hover:bg-[#f4f5f7]">
              {muted ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />} {muted ? "Muted" : "Mute Stream"}
            </button>
            <button onClick={() => toast.info("Live audio relay to the admin console isn't enabled yet.")} disabled={!isLive} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl bg-[#fe2c55] px-4 text-[12px] font-semibold text-white transition hover:bg-[#e0243d] disabled:opacity-40">
              <PlayCircle className="h-4 w-4" /> Listen Live
            </button>
            <button title="Volume" className="grid h-9 w-9 place-items-center rounded-xl border border-[#e8eaed] bg-white text-[#6b7280] hover:bg-[#f4f5f7]">
              <Volume2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Tabs (real counts) */}
        <div className="flex items-center gap-4 border-b border-[#e8eaed]">
          {([
            ["overview", "Overview", null],
            ["participants", "Participants", counts.participants],
            ["requests", "Requests", counts.requests],
            ["moderators", "Moderators", counts.moderators],
          ] as const).map(([key, label, count]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "flex items-center gap-1.5 border-b-2 py-2 text-[12px] font-semibold transition-colors",
                tab === key ? "border-[#fe2c55] text-[#fe2c55]" : "border-transparent text-[#6b7280] hover:text-[#111827]",
              )}
            >
              {label}
              {count != null && count > 0 ? (
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold", tab === key ? "bg-[#fe2c55]/10 text-[#fe2c55]" : "bg-[#f3f4f6] text-[#9ca3af]")}>{count}</span>
              ) : null}
            </button>
          ))}
        </div>

        {tab === "overview" && (
          <>
            {/* Room insights */}
            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#111827]">Room Insights</p>
              <div className="grid grid-cols-2 gap-2">
                <Insight label="Listeners Now" value={formatCompact(space.listeners_count)} />
                <Insight label="Peak Listeners" value={formatCompact(space.peak_listeners)} />
                <Insight label="Speakers" value={formatCompact(counts.speakers)} />
                <Insight label="Duration" value={durationLabel(space.duration_minutes)} />
              </div>
            </div>

            {/* Room controls (real values; toggles + selectors hit the API) */}
            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#111827]">Room Controls</p>
              <div className="rounded-2xl border border-[#e8eaed]">
                <ControlRow icon={Globe} label="Privacy" value={PRIVACY_LABEL[d.privacy ?? "public"]} onClick={isLive ? cyclePrivacy : undefined} />
                <ControlRow icon={Hand} label="Speaking Permission" value={SPEAK_LABEL[d.speaking_permission ?? "request"]} onClick={isLive ? cycleSpeak : undefined} />
                <ControlRow icon={Mic} label="Speaker Slots" value={`${d.speaker_slots ?? 100} max`} onClick={cycleSlots} />
                <ToggleRow icon={MessageSquare} label="Allow Chat" on={d.enable_chat ?? true} onToggle={() => controlsM.mutate({ enable_chat: !(d.enable_chat ?? true) })} />
                <ToggleRow icon={Heart} label="Allow Reactions" on={d.allow_reactions ?? true} onToggle={() => controlsM.mutate({ allow_reactions: !(d.allow_reactions ?? true) })} />
                <ToggleRow icon={BarChart3} label="Allow Polls" on={d.enable_polls ?? false} onToggle={() => controlsM.mutate({ enable_polls: !(d.enable_polls ?? false) })} />
                <ToggleRow icon={Gift} label="Gifts" on={d.gifts_enabled ?? false} onToggle={() => controlsM.mutate({ gifts_enabled: !(d.gifts_enabled ?? false) })} />
                <ToggleRow icon={DoorClosed} label="Waiting Room" on={d.waiting_room_enabled ?? false} onToggle={() => controlsM.mutate({ waiting_room_enabled: !(d.waiting_room_enabled ?? false) })} />
                <ToggleRow icon={Music2} label="Sound Clips" on={d.sound_clips_enabled ?? false} onToggle={() => controlsM.mutate({ sound_clips_enabled: !(d.sound_clips_enabled ?? false) })} last />
              </div>
            </div>

            {/* Room rules + access (read-only - set by the host at creation, this panel doesn't edit them) */}
            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#111827]">Room Rules &amp; Access</p>
              <div className="rounded-2xl border border-[#e8eaed]">
                <ControlRow
                  icon={ListChecks}
                  label="Room Rules"
                  value={d.room_rules?.length ? d.room_rules.map((r) => ROOM_RULE_LABEL[r] ?? r).join(", ") : "None set"}
                  last={(d.privacy ?? "public") === "public"}
                />
                {(d.privacy ?? "public") === "private" && (
                  <ControlRow
                    icon={UserCheck}
                    label="Followers Allowed"
                    value={`${formatCompact(d.allowed_followers_count ?? 0)} of 100`}
                    last
                  />
                )}
                {(d.privacy ?? "public") === "invite" && (
                  <ControlRow
                    icon={Link2}
                    label="Invite Link"
                    value={d.has_invite_link ? "Set" : "Not set"}
                    last
                  />
                )}
              </div>
            </div>

            {/* Moderator actions (real endpoints) */}
            <div>
              <p className="mb-2 text-[12px] font-semibold text-[#111827]">Moderator Actions</p>
              <div className="grid grid-cols-2 gap-2">
                <PanelBtn icon={MicOff} label="Mute All" disabled={!isLive || muteAllM.isPending} onClick={() => muteAllM.mutate()} />
                <PanelBtn icon={RadioIcon} label={counts.requests ? `Clear Requests (${counts.requests})` : "Clear Requests"} disabled={!isLive || clearReqM.isPending} onClick={() => clearReqM.mutate()} />
                <PanelBtn icon={UserMinus} label="Remove All Listeners" wide disabled={!isLive || removeLisM.isPending} onClick={() => removeLisM.mutate()} />
              </div>
              <button
                onClick={onEnd}
                disabled={!isLive}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl border border-[#fe2c55]/30 bg-[#fe2c55]/5 py-2.5 text-[13px] font-bold text-[#fe2c55] transition hover:bg-[#fe2c55]/10 disabled:opacity-40"
              >
                <Square className="h-4 w-4" /> End Room for Everyone
              </button>
            </div>
          </>
        )}

        {tab === "participants" && (
          <ParticipantList
            loading={detailQ.isLoading}
            items={participants}
            empty="No one is in this room."
            onMute={(p) => mutePM.mutate(p.id)}
            onRemove={(p) => removePM.mutate(p.id)}
            busy={mutePM.isPending || removePM.isPending}
          />
        )}

        {tab === "requests" && (
          <ParticipantList
            loading={detailQ.isLoading}
            items={requests}
            empty="No speaker requests to review."
            onRemove={(p) => removePM.mutate(p.id)}
            removeLabel="Dismiss"
            busy={removePM.isPending}
          />
        )}

        {tab === "moderators" && (
          <div className="space-y-0.5 py-1">
            {moderators.length === 0 && <p className="py-8 text-center text-[12px] text-[#9ca3af]">No moderators.</p>}
            {moderators.map((m) => (
              <div key={m.id} className="flex items-center gap-2.5 rounded-xl px-1 py-2">
                <Avatar name={m.name} src={m.avatar} size={34} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1">
                    <span className="truncate text-[12px] font-semibold text-[#111827]">{m.name || m.username}</span>
                    {m.is_verified && <BadgeCheck className="h-3 w-3 text-[#1d9bf0]" />}
                  </div>
                  <span className="text-[11px] text-[#9ca3af]">@{m.username}</span>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-[#fe2c55]/10 px-2 py-0.5 text-[10px] font-bold text-[#fe2c55]">
                  {m.is_host ? <><Crown className="h-3 w-3" /> Host</> : "Moderator"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PanelBtn({ icon: Icon, label, onClick, danger, disabled, wide }: {
  icon: React.ElementType; label: string; onClick?: () => void; danger?: boolean; disabled?: boolean; wide?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border px-2 text-[12px] font-semibold transition disabled:opacity-40",
        wide && "col-span-2",
        danger ? "border-[#fe2c55]/30 text-[#fe2c55] hover:bg-[#fe2c55]/5" : "border-[#e8eaed] text-[#374151] hover:bg-[#f4f5f7]",
      )}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2.5">
      <p className="text-[17px] font-bold leading-none text-[#111827]">{value}</p>
      <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-[#9ca3af]">{label}</p>
    </div>
  );
}

function ControlRow({ icon: Icon, label, value, onClick, last }: { icon: React.ElementType; label: string; value: string; onClick?: () => void; last?: boolean }) {
  const inner = (
    <>
      <span className="flex items-center gap-2 text-[12px] font-medium text-[#374151]"><Icon className="h-4 w-4 text-[#9ca3af]" /> {label}</span>
      <span className="flex items-center gap-1 text-[12px] font-semibold text-[#6b7280]">{value}{onClick && <ChevronRight className="h-3.5 w-3.5 text-[#c0c4cc]" />}</span>
    </>
  );
  if (onClick) {
    return <button onClick={onClick} className={cn("flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors hover:bg-[#f9fafb]", !last && "border-b border-[#f3f4f6]")}>{inner}</button>;
  }
  return <div className={cn("flex items-center justify-between px-3 py-2.5", !last && "border-b border-[#f3f4f6]")}>{inner}</div>;
}

/* ── Participant / request list (shared by the Participants + Requests tabs) ── */
function ParticipantList({ items, loading, empty, onMute, onRemove, removeLabel = "Remove", busy }: {
  items: Participant[]; loading?: boolean; empty: string;
  onMute?: (p: Participant) => void; onRemove?: (p: Participant) => void; removeLabel?: string; busy?: boolean;
}) {
  if (loading) return <div className="grid place-items-center py-10"><Loader2 className="h-5 w-5 animate-spin text-[#d1d5db]" /></div>;
  if (items.length === 0) {
    return (
      <div className="grid place-items-center gap-2 py-10 text-center">
        <Users className="h-7 w-7 text-[#d1d5db]" />
        <p className="text-[12px] text-[#9ca3af]">{empty}</p>
      </div>
    );
  }
  return (
    <div className="max-h-[320px] space-y-0.5 overflow-y-auto py-1">
      {items.map((p) => {
        const role = p.is_host ? "Host" : p.role === "speaker" ? "Speaker" : p.requesting ? "Requesting" : "Listener";
        return (
          <div key={p.id} className="flex items-center gap-2.5 rounded-xl px-1 py-2">
            <Avatar name={p.user?.name ?? "?"} src={p.user?.avatar ?? null} size={34} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1">
                <span className="truncate text-[12px] font-semibold text-[#111827]">{p.user?.name || p.user?.username || "Unknown"}</span>
                {p.user?.is_verified && <BadgeCheck className="h-3 w-3 text-[#1d9bf0]" />}
                {p.muted && <MicOff className="h-3 w-3 text-[#9ca3af]" />}
              </div>
              <span className="text-[11px] text-[#9ca3af]">@{p.user?.username ?? "unknown"} · {role}</span>
            </div>
            {!p.is_host && (
              <div className="flex items-center gap-1">
                {onMute && p.role !== "listener" && (
                  <button title={p.muted ? "Unmute" : "Mute"} disabled={busy} onClick={() => onMute(p)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-[#6b7280] transition hover:bg-[#f4f5f7] disabled:opacity-40">
                    {p.muted ? <Mic className="h-3.5 w-3.5" /> : <MicOff className="h-3.5 w-3.5" />}
                  </button>
                )}
                {onRemove && (
                  <button title={removeLabel} disabled={busy} onClick={() => onRemove(p)} className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-[#fe2c55] transition hover:bg-[#fe2c55]/5 disabled:opacity-40">
                    <UserX className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ToggleRow({ icon: Icon, label, on, onToggle, last }: {
  icon: React.ElementType; label: string; on: boolean; onToggle: () => void; last?: boolean;
}) {
  return (
    <div className={cn("flex items-center justify-between px-3 py-2.5", !last && "border-b border-[#f3f4f6]")}>
      <span className="flex items-center gap-2 text-[12px] font-medium text-[#374151]"><Icon className="h-4 w-4 text-[#9ca3af]" /> {label}</span>
      <button
        onClick={onToggle}
        className={cn("relative h-5 w-9 rounded-full transition-colors", on ? "bg-[#fe2c55]" : "bg-[#e5e7eb]")}
        aria-pressed={on}
      >
        <span className={cn("absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all", on ? "left-[18px]" : "left-0.5")} />
      </button>
    </div>
  );
}

function durationLabel(mins: number | null) {
  if (mins == null) return "-";
  if (mins < 60) return `${mins}m`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}
