"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Search, Trash2, Check, X, Pencil, AlertTriangle } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { api, apiMessage } from "@/admin-panel/services/api";

/**
 * Genres, moods and languages - one screen, three routes.
 *
 * They are the same object with a different label, so they share a component
 * rather than three near-identical pages drifting apart.
 *
 * The track count beside each term is the point of the screen. A term nothing
 * uses is a candidate for removal; a value TRACKS use that the vocabulary does
 * not have came from the old hardcoded arrays or a hand-edited row, and is
 * listed separately so it can be adopted in one click rather than retyped.
 */

export interface TaxonomyTerm {
  id: number;
  name: string;
  sort_order: number;
  is_active: boolean;
  track_count: number;
}

interface Orphan { name: string; track_count: number }

export function TaxonomyManager({
  kind, title, subtitle, icon: Icon, tint,
}: {
  kind: "genre" | "mood" | "language";
  title: string;
  subtitle: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
}) {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");

  const key = ["admin-music-taxonomy", kind];

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () => {
      const r = await api.get(`/admin/music/taxonomy/${kind}`);
      return r.data.data as { terms: TaxonomyTerm[]; orphans: Orphan[] };
    },
  });

  const terms = data?.terms ?? [];
  const orphans = data?.orphans ?? [];

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return needle ? terms.filter((t) => t.name.toLowerCase().includes(needle)) : terms;
  }, [terms, q]);

  const inUse = terms.filter((t) => t.track_count > 0).length;

  const done = (msg: string) => {
    toast.success(msg);
    void qc.invalidateQueries({ queryKey: key });
  };

  const create = useMutation({
    mutationFn: (name: string) => api.post(`/admin/music/taxonomy/${kind}`, { name }),
    onSuccess: () => { setAdding(""); done("Added."); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: number; body: Record<string, unknown> }) =>
      api.put(`/admin/music/taxonomy/${kind}/${id}`, body),
    onSuccess: () => { setEditingId(null); done("Saved."); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: number) => api.delete(`/admin/music/taxonomy/${kind}/${id}`),
    onSuccess: () => done("Removed."),
    // The server refuses to delete a term tracks still use and says why -
    // surfaced verbatim rather than replaced with a generic failure.
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <AdminShell title={title}>
      <div className="space-y-5">

        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full" style={{ background: `${tint}1a`, color: tint }}>
              <Icon className="h-[22px] w-[22px]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-[#111827]">{title}</h2>
              <p className="text-[13px] text-[#6b7280]">{subtitle}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-[12px] text-[#6b7280]">
            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 font-bold tabular-nums">{terms.length} total</span>
            <span className="rounded-full bg-[#ecfdf5] px-2.5 py-1 font-bold tabular-nums text-[#047857]">{inUse} in use</span>
          </div>
        </div>

        {/* Add + search */}
        <Card>
          <CardBody className="flex flex-wrap items-center gap-2.5 p-4">
            <div className="relative min-w-[220px] flex-1">
              <Plus className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && adding.trim()) create.mutate(adding.trim()); }}
                placeholder={`Add a ${kind}…`}
                className="h-10 w-full rounded-[10px] border border-[#e5e7eb] pl-9 pr-3 text-[13px] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/15"
              />
            </div>
            <Button
              variant="primary"
              disabled={!adding.trim() || create.isPending}
              onClick={() => create.mutate(adding.trim())}
            >
              {create.isPending ? "Adding…" : "Add"}
            </Button>

            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search"
                className="h-10 w-full rounded-[10px] border border-[#e5e7eb] pl-9 pr-3 text-[13px] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/15"
              />
            </div>
          </CardBody>
        </Card>

        {/* Values tracks use that the vocabulary does not have. */}
        {orphans.length > 0 && (
          <Card>
            <CardBody className="p-4">
              <div className="mb-3 flex items-start gap-2.5">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#d97706]" />
                <div>
                  <p className="text-[13px] font-bold text-[#111827]">Used by tracks, not in this list</p>
                  <p className="mt-0.5 text-[12px] text-[#6b7280]">
                    Tracks carry these already. Adding one puts it in the picker so it can be chosen again.
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {orphans.map((o) => (
                  <button
                    key={o.name}
                    onClick={() => create.mutate(o.name)}
                    disabled={create.isPending}
                    className="group flex items-center gap-1.5 rounded-full border border-[#fde68a] bg-[#fffbeb] px-3 py-1.5 text-[12.5px] font-semibold text-[#92400e] transition hover:border-[#fe2c55]/40 hover:bg-[#fff0f4] hover:text-[#fe2c55]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {o.name}
                    <span className="tabular-nums opacity-60">{o.track_count}</span>
                  </button>
                ))}
              </div>
            </CardBody>
          </Card>
        )}

        {/* The list */}
        <Card>
          <CardHeader>
            <CardTitle>{title}</CardTitle>
            <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#6b7280]">
              {shown.length} shown
            </span>
          </CardHeader>
          <CardBody className="p-0 px-3 pb-2">
            {isLoading ? (
              <div className="grid gap-2 py-3">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="flex items-center justify-between px-3 py-3">
                    <div className="h-3 w-40 animate-pulse rounded bg-[#f1f2f4]" />
                    <div className="h-[26px] w-[46px] animate-pulse rounded-full bg-[#f1f2f4]" />
                  </div>
                ))}
              </div>
            ) : shown.length === 0 ? (
              <div className="py-12 text-center">
                <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#f3f4f6] text-[#9ca3af]">
                  <Icon className="h-5 w-5" />
                </span>
                <p className="mt-3 text-[13px] font-semibold text-[#374151]">
                  {q ? "Nothing matches that" : `No ${kind}s yet`}
                </p>
                <p className="mt-1 text-[12px] text-[#9ca3af]">
                  {q ? "Try a different search." : `Add one above and it appears in the upload picker.`}
                </p>
              </div>
            ) : (
              shown.map((t) => {
                const editing = editingId === t.id;
                return (
                  <div key={t.id} className="flex items-center justify-between gap-4 rounded-[12px] px-3 py-3 transition-colors hover:bg-[#fafbfc]">
                    <div className="flex min-w-0 flex-1 items-center gap-2.5">
                      {editing ? (
                        <input
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && editValue.trim()) patch.mutate({ id: t.id, body: { name: editValue.trim() } });
                            if (e.key === "Escape") setEditingId(null);
                          }}
                          autoFocus
                          className="h-9 w-64 rounded-[10px] border border-[#e5e7eb] px-3 text-[13px] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/15"
                        />
                      ) : (
                        <>
                          <span className={`text-[13.5px] font-semibold ${t.is_active ? "text-[#111827]" : "text-[#9ca3af] line-through"}`}>
                            {t.name}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold tabular-nums ${
                              t.track_count > 0 ? "bg-[#eef2ff] text-[#4338ca]" : "bg-[#f3f4f6] text-[#9ca3af]"
                            }`}
                            title={`${t.track_count} track(s) tagged`}
                          >
                            {t.track_count}
                          </span>
                        </>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-2.5">
                      {editing ? (
                        <>
                          <Button size="sm" variant="primary" disabled={!editValue.trim() || patch.isPending}
                            onClick={() => patch.mutate({ id: t.id, body: { name: editValue.trim() } })}>
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <span className={`text-[11px] font-bold uppercase tracking-wide ${t.is_active ? "text-[#fe2c55]" : "text-[#9ca3af]"}`}>
                            {t.is_active ? "On" : "Off"}
                          </span>
                          {/* Off retires a term from the picker without touching
                              the tracks already tagged with it. */}
                          <button
                            type="button"
                            role="switch"
                            aria-checked={t.is_active}
                            aria-label={`${t.name} available in the picker`}
                            onClick={() => patch.mutate({ id: t.id, body: { is_active: !t.is_active } })}
                            className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200 ${t.is_active ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}
                          >
                            <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${t.is_active ? "left-[23px]" : "left-[3px]"}`} />
                          </button>

                          <button
                            type="button"
                            onClick={() => { setEditingId(t.id); setEditValue(t.name); }}
                            className="rounded-[8px] border border-[#e5e7eb] p-1.5 text-[#6b7280] transition-colors hover:border-[#fe2c55]/40 hover:bg-[#fff0f4] hover:text-[#fe2c55]"
                            aria-label={`Rename ${t.name}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={() => remove.mutate(t.id)}
                            disabled={remove.isPending}
                            className="rounded-[8px] border border-[#e5e7eb] p-1.5 text-[#6b7280] transition-colors hover:border-[#ef4444]/40 hover:bg-[#fef2f2] hover:text-[#ef4444] disabled:opacity-50"
                            aria-label={`Delete ${t.name}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
