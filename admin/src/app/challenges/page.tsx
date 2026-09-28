"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Trophy, Plus, Search, Hash, Gift, Users, CheckCircle2, XCircle,
  Pencil, Square, Trash2, X, MoreVertical,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import {
  Table, Thead, Th, Tbody, Tr, Td, TableEmpty, TableLoading, Pagination,
} from "@/components/ui/data-table";
import { adminService } from "@/services/admin.service";
import { apiMessage } from "@/services/api";
import { cn, formatCompact } from "@/lib/utils";

/**
 * Hashtag Challenges - unlike Audio Rooms (hosted by users, read-mostly),
 * a challenge IS authored by staff, so this page is full CRUD: create, edit,
 * force-end and delete. Same table/card/modal building blocks as every other
 * admin page - no new design language.
 */

type ChallengeRow = {
  id: number;
  title: string;
  hashtag_id: number | null;
  hashtag: string | null;
  prize_description: string | null;
  cover_start_color: string | null;
  cover_end_color: string | null;
  starts_at: string | null;
  ends_at: string | null;
  status: "active" | "ended";
  participants_count: number;
  entries_count: number;
  created_by: { id: number; name: string; username: string } | null;
  created_at: string | null;
};

const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : "-");

export default function ChallengesPage() {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [sort, setSort] = useState("");

  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<ChallengeRow | null>(null);
  const [ending, setEnding] = useState<ChallengeRow | null>(null);
  const [deleting, setDeleting] = useState<ChallengeRow | null>(null);

  const params = {
    page, per_page: 10,
    ...(search && { search }),
    ...(status && { status }),
    ...(sort && { sort }),
  };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-challenges", params],
    queryFn: () => adminService.challenges(params),
  });
  const statsQ = useQuery({
    queryKey: ["admin-challenges-stats"],
    queryFn: adminService.challengeStats,
    refetchInterval: 30_000,
  });

  const challenges: ChallengeRow[] = data?.data ?? [];
  const meta = data?.meta ?? {};
  const stats = statsQ.data ?? {};

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["admin-challenges"] });
    qc.invalidateQueries({ queryKey: ["admin-challenges-stats"] });
  };
  const onErr = (e: unknown) => toast.error(apiMessage(e));

  const endM = useMutation({
    mutationFn: (id: number) => adminService.endChallenge(id),
    onSuccess: () => { invalidate(); setEnding(null); toast.success("Challenge ended."); },
    onError: onErr,
  });
  const delM = useMutation({
    mutationFn: (id: number) => adminService.deleteChallenge(id),
    onSuccess: () => { invalidate(); setDeleting(null); toast.success("Challenge deleted."); },
    onError: onErr,
  });

  const from = challenges.length ? ((meta.current_page ?? 1) - 1) * (meta.per_page ?? 10) + 1 : 0;
  const to = challenges.length ? from + challenges.length - 1 : 0;

  return (
    <AdminShell title="Challenges">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fe2c55]/10">
              <Trophy className="h-5 w-5 text-[#fe2c55]" />
            </div>
            <div>
              <h2 className="text-[20px] font-bold text-[#111827]">Hashtag Challenges</h2>
              <p className="max-w-xl text-[13px] text-[#6b7280]">
                Create and manage the Explore page's hashtag challenges - a tag, a prize, a deadline and an entry count.
              </p>
            </div>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex h-10 items-center gap-2 rounded-[12px] bg-[#fe2c55] px-4 text-[13px] font-semibold text-white transition hover:bg-[#e0243d]"
          >
            <Plus className="h-4 w-4" /> New Challenge
          </button>
        </div>

        {/* Stat cards */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active" value={stats.active} sub="open for entries" icon={CheckCircle2} color="#10b981" loading={statsQ.isLoading} />
          <StatCard label="Ended" value={stats.ended} sub="closed challenges" icon={XCircle} color="#9ca3af" loading={statsQ.isLoading} />
          <StatCard label="Total" value={stats.total} sub="all-time" icon={Trophy} color="#fe2c55" loading={statsQ.isLoading} />
          <StatCard label="Participants" value={stats.total_participants} sub="joins across all challenges" icon={Users} color="#3b82f6" loading={statsQ.isLoading} />
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <Input
                className="pl-9"
                placeholder="Search by title or prize..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              />
            </div>
            <Select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="ended">Ended</option>
            </Select>
            <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
              <option value="">Ending Soonest</option>
              <option value="oldest">Oldest</option>
            </Select>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <Thead>
              <Th>Challenge</Th>
              <Th>Prize</Th>
              <Th>Entries</Th>
              <Th>Joined</Th>
              <Th>Ends</Th>
              <Th>Status</Th>
              <Th>Actions</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={7} />
                : challenges.length === 0
                  ? <TableEmpty message={search || status ? "No challenges match these filters." : "No challenges yet. Create the first one."} />
                  : challenges.map((c) => (
                      <Tr key={c.id}>
                        <Td>
                          <div className="flex items-center gap-3">
                            <div
                              className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
                              style={{ background: `linear-gradient(135deg, ${c.cover_start_color || "#7c3aed"}, ${c.cover_end_color || "#db2777"})` }}
                            >
                              <Hash className="h-4 w-4 text-white/95" />
                            </div>
                            <div className="min-w-0">
                              <p className="truncate text-[13px] font-semibold text-[#111827]">{c.title}</p>
                              <p className="text-[11px] text-[#9ca3af]">{c.hashtag ? `#${c.hashtag}` : "No hashtag linked"}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          {c.prize_description ? (
                            <span className="inline-flex items-center gap-1 text-[13px] text-[#374151]">
                              <Gift className="h-3.5 w-3.5 text-[#9ca3af]" /> {c.prize_description}
                            </span>
                          ) : <span className="text-[13px] text-[#9ca3af]">-</span>}
                        </Td>
                        <Td><span className="text-[13px] font-semibold text-[#111827]">{formatCompact(c.entries_count)}</span></Td>
                        <Td><span className="text-[13px] text-[#374151]">{formatCompact(c.participants_count)}</span></Td>
                        <Td><span className="text-[12px] text-[#6b7280]">{fmtDate(c.ends_at)}</span></Td>
                        <Td><StatusPill status={c.status} /></Td>
                        <Td>
                          <div className="flex items-center gap-1.5">
                            <IconBtn title="Edit" onClick={() => setEditing(c)}><Pencil className="h-3.5 w-3.5" /></IconBtn>
                            <RowMenu
                              canEnd={c.status === "active"}
                              onEnd={() => setEnding(c)}
                              onDelete={() => setDeleting(c)}
                            />
                          </div>
                        </Td>
                      </Tr>
                    ))
              }
            </Tbody>
          </Table>
          <div className="flex items-center justify-between px-4 py-3">
            <p className="text-[12px] text-[#6b7280]">
              Showing {from}-{to} of {(meta.total ?? 0).toLocaleString()} challenges
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

      {(creating || editing) && (
        <ChallengeForm
          challenge={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={(msg) => { invalidate(); setCreating(false); setEditing(null); toast.success(msg); }}
          onError={(e) => toast.error(apiMessage(e))}
        />
      )}

      <ConfirmModal
        open={!!ending}
        danger
        title="End this challenge?"
        message={`"${ending?.title}" will close for entries immediately. This cannot be undone.`}
        confirmLabel="End challenge"
        loading={endM.isPending}
        onConfirm={() => ending && endM.mutate(ending.id)}
        onCancel={() => setEnding(null)}
      />
      <ConfirmModal
        open={!!deleting}
        danger
        title="Delete this challenge?"
        message={`"${deleting?.title}" and its participant history will be permanently removed.`}
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

function StatusPill({ status }: { status: ChallengeRow["status"] }) {
  const active = status === "active";
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold",
      active ? "bg-emerald-50 text-emerald-700" : "bg-[#f3f4f6] text-[#6b7280]",
    )}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: active ? "#10b981" : "#9ca3af" }} />
      {active ? "ACTIVE" : "ENDED"}
    </span>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick?: () => void }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="grid h-8 w-8 place-items-center rounded-lg border border-[#e8eaed] bg-white text-[#6b7280] transition hover:bg-[#f4f5f7]"
    >
      {children}
    </button>
  );
}

function RowMenu({ canEnd, onEnd, onDelete }: { canEnd: boolean; onEnd: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <IconBtn title="More" onClick={() => setOpen((o) => !o)}><MoreVertical className="h-4 w-4" /></IconBtn>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-20 mt-1 w-40 rounded-xl border border-[#e8eaed] bg-white p-1 shadow-lg">
            {canEnd && (
              <button
                onClick={() => { setOpen(false); onEnd(); }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-[#374151] transition-colors hover:bg-[#f4f5f7]"
              >
                <Square className="h-3.5 w-3.5" /> End now
              </button>
            )}
            <button
              onClick={() => { setOpen(false); onDelete(); }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[12px] font-medium text-red-600 transition-colors hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Create / edit form ───────────────────────────────────────────────── */

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-[18px] bg-white shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#f3f4f6] px-5 py-4">
          <h3 className="text-[15px] font-black text-[#111827]">{title}</h3>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-full bg-[#f3f4f6] text-[#6b7280]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] font-bold uppercase tracking-wide text-[#9ca3af]">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[10.5px] text-[#9ca3af]">{hint}</span>}
    </label>
  );
}

const inputCls =
  "mt-1 w-full rounded-[10px] border border-[#e5e7eb] px-3 py-2.5 text-[13px] outline-none transition focus:border-[#fe2c55]";

/** yyyy-MM-ddTHH:mm for a <input type="datetime-local"> from an ISO string. */
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function ChallengeForm({
  challenge, onClose, onSaved, onError,
}: {
  challenge: ChallengeRow | null;
  onClose: () => void;
  onSaved: (m: string) => void;
  onError: (e: unknown) => void;
}) {
  const isEdit = !!challenge;
  const [title, setTitle] = useState(challenge?.title ?? "");
  const [hashtag, setHashtag] = useState(challenge?.hashtag ?? "");
  const [prize, setPrize] = useState(challenge?.prize_description ?? "");
  const [startColor, setStartColor] = useState(challenge?.cover_start_color ?? "#7c3aed");
  const [endColor, setEndColor] = useState(challenge?.cover_end_color ?? "#db2777");
  const [startsAt, setStartsAt] = useState(toLocalInput(challenge?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalInput(challenge?.ends_at ?? null));

  const m = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {
        title: title.trim(),
        hashtag: hashtag.trim() || null,
        prize_description: prize.trim() || null,
        cover_start_color: startColor || null,
        cover_end_color: endColor || null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : undefined,
      };
      if (startsAt) body.starts_at = new Date(startsAt).toISOString();

      return isEdit
        ? adminService.updateChallenge(challenge!.id, body)
        : adminService.createChallenge(body);
    },
    onSuccess: () => onSaved(isEdit ? "Challenge updated." : "Challenge created."),
    onError,
  });

  const valid = title.trim().length > 0 && endsAt.length > 0;

  return (
    <Modal title={isEdit ? `Edit - ${challenge!.title}` : "New Challenge"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Title" hint="Shown on the card, e.g. the challenge's name.">
          <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Studio Setup Challenge" />
        </Field>

        <Field label="Hashtag" hint="Bare tag text, no #. Creates it if it doesn't exist yet.">
          <input className={inputCls} value={hashtag} onChange={(e) => setHashtag(e.target.value)} placeholder="studiosetup" />
        </Field>

        <Field label="Prize" hint="Optional - what the winner gets.">
          <input className={inputCls} value={prize} onChange={(e) => setPrize(e.target.value)} placeholder="$500 cash prize" />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Cover start color">
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={startColor} onChange={(e) => setStartColor(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-[8px] border border-[#e5e7eb]" />
              <input className={cn(inputCls, "mt-0")} value={startColor} onChange={(e) => setStartColor(e.target.value)} />
            </div>
          </Field>
          <Field label="Cover end color">
            <div className="mt-1 flex items-center gap-2">
              <input type="color" value={endColor} onChange={(e) => setEndColor(e.target.value)} className="h-9 w-9 shrink-0 cursor-pointer rounded-[8px] border border-[#e5e7eb]" />
              <input className={cn(inputCls, "mt-0")} value={endColor} onChange={(e) => setEndColor(e.target.value)} />
            </div>
          </Field>
        </div>

        <div
          className="h-14 rounded-[12px]"
          style={{ background: `linear-gradient(135deg, ${startColor}, ${endColor})` }}
        />

        <div className="grid grid-cols-2 gap-3">
          <Field label="Starts at" hint="Blank = now.">
            <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
          </Field>
          <Field label="Ends at">
            <input type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
          </Field>
        </div>

        <button
          onClick={() => m.mutate()}
          disabled={m.isPending || !valid}
          className="mt-2 w-full rounded-[10px] bg-[#fe2c55] py-3 text-[13px] font-black text-white transition hover:bg-[#e0193f] disabled:opacity-50"
        >
          {m.isPending ? "Saving…" : isEdit ? "Save changes" : "Create challenge"}
        </button>
      </div>
    </Modal>
  );
}
