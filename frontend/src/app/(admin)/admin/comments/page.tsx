"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle, Ban, Check, EyeOff, Flag, MessageSquare, RotateCcw, Search,
  ShieldCheck, Trash2,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, StatCard } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { Badge } from "@/admin-panel/components/ui/badge";
import { Input, Select } from "@/admin-panel/components/ui/input";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import {
  Table, Thead, Tbody, Th, Td, Tr, Pagination, TableEmpty,
} from "@/admin-panel/components/ui/data-table";
import {
  commentsService,
  type AdminComment, type CommentStats, type CommentQueue, type CommentAction,
} from "@/admin-panel/services/comments.service";
import { apiMessage } from "@/admin-panel/services/api";

/**
 * Comment moderation.
 *
 * Replaces a placeholder that showed three hardcoded dashes and a "coming
 * soon" card. Everything here is backed by AdminCommentController.
 *
 * The queue tabs are the point of the page: an operator works one queue at a
 * time (reported, held, spam) rather than scrolling one undifferentiated list,
 * and each queue's actions differ - a held comment gets Approve, a spam one
 * gets Not spam.
 */

const QUEUES: { key: CommentQueue; label: string }[] = [
  { key: "all",      label: "All" },
  { key: "reported", label: "Reported" },
  { key: "held",     label: "Held for review" },
  { key: "spam",     label: "Spam" },
  { key: "hidden",   label: "Hidden" },
  { key: "deleted",  label: "Deleted" },
];

export default function CommentsPage() {
  const [rows, setRows]     = useState<AdminComment[]>([]);
  const [stats, setStats]   = useState<CommentStats | null>(null);
  const [queue, setQueue]   = useState<CommentQueue>("reported");
  const [q, setQ]           = useState("");
  const [sort, setSort]     = useState("newest");
  const [page, setPage]     = useState(1);
  const [lastPage, setLast] = useState(1);
  const [total, setTotal]   = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError]   = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, setPending]   = useState<{ action: CommentAction; ids: number[] } | null>(null);
  const [working, setWorking]   = useState(false);
  const [loadedAt, setLoadedAt] = useState(() => Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await commentsService.list({
        queue,
        q: q || undefined,
        sort: sort as "newest",
        page,
        per_page: 25,
      });
      setRows(data.items);
      setStats(data.stats);
      setLast(data.meta.last_page);
      setTotal(data.meta.total);
      setLoadedAt(Date.now());
      setSelected(new Set());
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setLoading(false);
    }
  }, [queue, q, sort, page]);

  useEffect(() => {
    const t = window.setTimeout(load, q ? 350 : 0);
    return () => window.clearTimeout(t);
  }, [load, q]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function run() {
    if (!pending) return;
    setWorking(true);
    try {
      if (pending.ids.length === 1) {
        await commentsService.act(pending.ids[0], pending.action);
      } else {
        await commentsService.bulk(pending.ids, pending.action);
      }
      setPending(null);
      await load();
    } catch (err) {
      setError(apiMessage(err));
      setPending(null);
    } finally {
      setWorking(false);
    }
  }

  const selectedIds = Array.from(selected);

  return (
    <AdminShell title="Comments">
      <div className="flex flex-col gap-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Comment moderation</h2>
          <p className="text-[13px] text-[#6b7280]">
            Work the reported and held queues, classify spam, and remove harmful comments.
            Removal is reversible — nothing here deletes permanently.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <StatCard label="Total" value={stats.total.toLocaleString()} icon={MessageSquare} color="#3b82f6" />
            <StatCard label="Open reports" value={stats.reported_open} icon={Flag} color="#f59e0b" />
            <StatCard label="Held for review" value={stats.held} icon={ShieldCheck} color="#8b5cf6" />
            <StatCard label="Spam" value={stats.spam} icon={Ban} color="#ef4444" />
            <StatCard label="Hidden" value={stats.hidden} icon={EyeOff} color="#6b7280" />
            <StatCard label="Deleted today" value={stats.deleted_today} icon={Trash2} color="#ef4444" />
          </div>
        )}

        {error && (
          <div role="alert" className="flex items-start justify-between gap-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
            <p className="flex items-start gap-2 text-[13px] text-red-700">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}
            </p>
            <button onClick={() => setError(null)} className="text-[12px] font-semibold text-red-600">Dismiss</button>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-1 border-b border-[#e8eaed]">
          {QUEUES.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => { setQueue(tab.key); setPage(1); }}
              className={[
                "border-b-2 px-3.5 py-2.5 text-[13px] font-semibold transition-colors",
                queue === tab.key
                  ? "border-[#fe2c55] text-[#fe2c55]"
                  : "border-transparent text-[#6b7280] hover:text-[#111827]",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* The bulk bar only exists when something is selected, so it never
            occupies space or invites an action with no target. */}
        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#fe2c55]/25 bg-[#fff0f4] px-4 py-2.5">
            <span className="text-[13px] font-semibold text-[#111827]">
              {selectedIds.length} selected
            </span>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {queue === "deleted" ? (
                <Button variant="success" size="sm" onClick={() => setPending({ action: "restore", ids: selectedIds })}>
                  <RotateCcw className="h-3.5 w-3.5" /> Restore
                </Button>
              ) : (
                <>
                  <Button variant="success" size="sm" onClick={() => setPending({ action: "approve", ids: selectedIds })}>
                    <Check className="h-3.5 w-3.5" /> Approve
                  </Button>
                  <Button variant="warning" size="sm" onClick={() => setPending({ action: "hide", ids: selectedIds })}>
                    <EyeOff className="h-3.5 w-3.5" /> Hide
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setPending({ action: "spam", ids: selectedIds })}>
                    <Ban className="h-3.5 w-3.5" /> Spam
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => setPending({ action: "delete", ids: selectedIds })}>
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </Button>
                </>
              )}
            </div>
          </div>
        )}

        <Card>
          <CardHeader className="flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <CardTitle className="shrink-0">
              {QUEUES.find((t) => t.key === queue)?.label} · {total.toLocaleString()}
            </CardTitle>
            <div className="ml-auto flex flex-1 flex-col gap-2 sm:max-w-lg sm:flex-row">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  value={q}
                  onChange={(e) => { setQ(e.target.value); setPage(1); }}
                  placeholder="Search comment text or author"
                  className="pl-9"
                />
              </div>
              <Select value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
                <option value="newest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="reported">Most reported</option>
                <option value="liked">Most liked</option>
              </Select>
            </div>
          </CardHeader>

          <Table>
            <Thead>
              <Th className="w-10"><span className="sr-only">Select</span></Th>
              <Th>Comment</Th>
              <Th>Author</Th>
              <Th>On video</Th>
              <Th>Signals</Th>
              <Th>Posted</Th>
              <Th className="text-right">Actions</Th>
            </Thead>
            <Tbody>
              {loading && rows.length === 0 && <TableEmpty message="Loading comments…" />}

              {!loading && rows.length === 0 && (
                <TableEmpty
                  message={
                    queue === "reported" ? "No open reports. Nothing needs attention."
                      : queue === "held" ? "Nothing is held for review."
                      : q ? "No comments match that search."
                      : "No comments in this queue."
                  }
                />
              )}

              {rows.map((c) => (
                <Tr key={c.id}>
                  <Td>
                    <input
                      type="checkbox"
                      checked={selected.has(c.id)}
                      onChange={() => toggle(c.id)}
                      aria-label={`Select comment ${c.id}`}
                      className="h-3.5 w-3.5 cursor-pointer accent-[#fe2c55]"
                    />
                  </Td>

                  <Td className="max-w-[340px]">
                    <p className="line-clamp-2 text-[#111827]">
                      {c.body || <span className="italic text-[#9ca3af]">
                        {c.gif_url ? "GIF" : c.image_path ? "Image" : "(empty)"}
                      </span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-[#9ca3af]">
                      #{c.id}
                      {c.parent_id ? " · reply" : ""}
                      {c.is_edited ? " · edited" : ""}
                      {c.reply_count > 0 ? ` · ${c.reply_count} replies` : ""}
                    </p>
                  </Td>

                  <Td>
                    {c.user ? (
                      <>
                        <span className="font-medium text-[#111827]">@{c.user.username}</span>
                        {c.user.name && <p className="text-[11px] text-[#9ca3af]">{c.user.name}</p>}
                      </>
                    ) : <span className="text-[#c3c7d1]">deleted user</span>}
                  </Td>

                  <Td className="max-w-[180px]">
                    <span className="line-clamp-1 text-[12px] text-[#6b7280]">
                      {c.video?.caption || `#${c.video_id}`}
                    </span>
                  </Td>

                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {c.reports_count > 0 && <Badge variant="danger">{c.reports_count} report{c.reports_count > 1 ? "s" : ""}</Badge>}
                      {c.held_for_review && <Badge variant="purple">Held</Badge>}
                      {c.is_spam && <Badge variant="danger">Spam</Badge>}
                      {c.is_hidden && !c.is_spam && <Badge variant="warning">Hidden</Badge>}
                      {c.is_deleted && <Badge variant="default">Deleted</Badge>}
                      {c.is_pinned && <Badge variant="info">Pinned</Badge>}
                      {c.likes_count > 0 && <Badge variant="outline">{c.likes_count} likes</Badge>}
                    </div>
                  </Td>

                  <Td className="whitespace-nowrap text-[12px] text-[#6b7280]">
                    {relative(c.created_at, loadedAt)}
                  </Td>

                  <Td className="text-right">
                    <div className="flex flex-wrap justify-end gap-1">
                      {c.is_deleted ? (
                        <Button variant="success" size="sm" onClick={() => setPending({ action: "restore", ids: [c.id] })}>
                          <RotateCcw className="h-3.5 w-3.5" /> Restore
                        </Button>
                      ) : (
                        <>
                          {(c.held_for_review || c.is_spam || c.is_hidden) && (
                            <Button variant="success" size="sm" onClick={() => setPending({ action: "approve", ids: [c.id] })}>
                              <Check className="h-3.5 w-3.5" /> Approve
                            </Button>
                          )}
                          {!c.is_hidden && (
                            <Button variant="warning" size="sm" onClick={() => setPending({ action: "hide", ids: [c.id] })}>
                              <EyeOff className="h-3.5 w-3.5" /> Hide
                            </Button>
                          )}
                          {!c.is_spam && (
                            <Button variant="outline" size="sm" onClick={() => setPending({ action: "spam", ids: [c.id] })}>
                              <Ban className="h-3.5 w-3.5" /> Spam
                            </Button>
                          )}
                          <Button variant="danger" size="sm" onClick={() => setPending({ action: "delete", ids: [c.id] })}>
                            <Trash2 className="h-3.5 w-3.5" /> Delete
                          </Button>
                        </>
                      )}
                    </div>
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>

          <Pagination currentPage={page} lastPage={lastPage} total={total} onPage={setPage} />
        </Card>
      </div>

      <ConfirmModal
        open={!!pending}
        title={pending ? confirmTitle(pending.action, pending.ids.length) : ""}
        message={pending ? confirmMessage(pending.action, pending.ids.length) : ""}
        confirmLabel={pending ? label(pending.action) : "Confirm"}
        danger={pending?.action === "delete"}
        loading={working}
        onConfirm={run}
        onCancel={() => setPending(null)}
      />
    </AdminShell>
  );
}

function label(a: CommentAction): string {
  return {
    hide: "Hide", unhide: "Unhide", spam: "Mark spam", not_spam: "Not spam",
    approve: "Approve", delete: "Delete", restore: "Restore",
  }[a];
}

function confirmTitle(a: CommentAction, n: number): string {
  const noun = n === 1 ? "this comment" : `${n} comments`;
  return `${label(a)} ${noun}?`;
}

function confirmMessage(a: CommentAction, n: number): string {
  const s = n === 1 ? "" : "s";
  switch (a) {
    case "delete":
      return `The comment${s} will be removed from the app. This is a soft delete — you can restore ${n === 1 ? "it" : "them"} from the Deleted queue.`;
    case "restore":
      return `The comment${s} will be visible again wherever ${n === 1 ? "it" : "they"} appeared.`;
    case "approve":
      return `Clears the held, spam and hidden flags, so the comment${s} appear${n === 1 ? "s" : ""} normally.`;
    case "hide":
      return `Removed from view but kept, and excluded from the video's comment count.`;
    case "spam":
      return `Classified as spam and hidden. A comment marked spam but left visible would not really be moderated.`;
    default:
      return `Clears the flag${s}.`;
  }
}

function relative(value: string | null, now: number): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  const mins = Math.floor((now - date.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (mins < 1440) return `${Math.floor(mins / 60)}h ago`;

  const days = Math.floor(mins / 1440);
  return days < 30 ? `${days}d ago` : date.toLocaleDateString();
}
