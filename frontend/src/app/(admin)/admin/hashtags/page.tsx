"use client";

import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Search, Hash, TrendingUp, Ban, Star, RefreshCw, Loader2,
  ExternalLink, CheckCircle2, AlertTriangle, X, EyeOff,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatCompact, formatDate } from "@/admin-panel/lib/utils";

type Hashtag = {
  id: number; name: string;
  videos_count: number; recent_count: number;
  is_blocked: boolean; is_featured: boolean;
  blocked_reason: string | null; blocked_at: string | null;
  created_at: string | null;
};

type HStats = { total: number; blocked: number; featured: number; unused: number; active: number };
type HAction = "block" | "unblock" | "feature" | "unfeature";

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all",      label: "All"      },
  { key: "active",   label: "Active"   },
  { key: "featured", label: "Featured" },
  { key: "blocked",  label: "Blocked"  },
  { key: "unused",   label: "Unused"   },
];

const SORTS: { key: string; label: string }[] = [
  { key: "videos",   label: "Most videos"    },
  { key: "trending", label: "Trending now"   },
  { key: "newest",   label: "Newest"         },
  { key: "name",     label: "Alphabetical"   },
];

const WINDOWS = [7, 14, 30];

const ACTION_COPY: Record<HAction, { title: string; message: string; confirm: string; danger: boolean }> = {
  block: {
    title: "Block from discovery",
    message: "The tag stops appearing in explore, trending and the feed rail. Posts using it stay published and reachable by their own links — this hides the tag, it does not take content down.",
    confirm: "Block tag", danger: true,
  },
  unblock: {
    title: "Restore to discovery",
    message: "The tag can surface in explore and trending again.",
    confirm: "Restore", danger: false,
  },
  feature: {
    title: "Feature this tag",
    message: "Marks the tag as promoted for campaigns and events.",
    confirm: "Feature", danger: false,
  },
  unfeature: {
    title: "Remove from featured",
    message: "The tag goes back to ranking on its own usage.",
    confirm: "Unfeature", danger: false,
  },
};

export default function HashtagsPage() {
  const qc = useQueryClient();
  const [page,     setPage]     = useState(1);
  const [qInput,   setQInput]   = useState("");
  const [q,        setQ]        = useState("");
  const [sort,     setSort]     = useState("videos");
  const [status,   setStatus]   = useState("all");
  const [days,     setDays]     = useState(7);
  const [selected, setSelected] = useState<number[]>([]);
  const [reason,   setReason]   = useState("");
  const [pending,  setPending]  = useState<{ ids: number[]; action: HAction; label: string } | null>(null);

  // One request per word typed, not one per keystroke.
  useEffect(() => {
    const t = setTimeout(() => { setQ(qInput); setPage(1); }, 300);
    return () => clearTimeout(t);
  }, [qInput]);

  const params = { page, per_page: 30, sort, status, days, ...(q && { q }) };
  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-hashtags", params],
    queryFn:  () => adminService.hashtags(params),
  });

  const hashtags: Hashtag[] = data?.data ?? [];
  const meta  = data?.meta ?? { current_page: 1, last_page: 1, total: 0 };
  const stats: HStats = data?.stats ?? { total: 0, blocked: 0, featured: 0, unused: 0, active: 0 };

  const act = useMutation({
    mutationFn: ({ ids, action }: { ids: number[]; action: HAction }) =>
      ids.length === 1
        ? adminService.hashtagAction(ids[0], action, reason.trim() || undefined)
        : adminService.hashtagBulk(ids, action, reason.trim() || undefined),
    onSuccess: (res) => {
      toast.success(res?.message ?? "Updated");
      setPending(null); setReason(""); setSelected([]);
      qc.invalidateQueries({ queryKey: ["admin-hashtags"] });
    },
    onError: () => toast.error("Could not update that hashtag"),
  });

  const ask = (ids: number[], action: HAction, label: string) => {
    setReason(""); setPending({ ids, action, label });
  };

  const allOnPage  = hashtags.map(h => h.id);
  const allChecked = allOnPage.length > 0 && allOnPage.every(id => selected.includes(id));
  const frontendBase = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "https://teezer.live";

  const switchTab = (k: string) => { setStatus(k); setPage(1); setSelected([]); };

  /* The strip is the fastest read on the page: what is actually being used
     right now, measured over the chosen window rather than by row position. */
  const topTrending = useMemo(
    () => [...hashtags].filter(h => h.recent_count > 0).sort((a, b) => b.recent_count - a.recent_count).slice(0, 12),
    [hashtags],
  );

  const TILES = [
    { key: "all",      label: "Total tags",   value: stats.total,    icon: <Hash className="h-[15px] w-[15px]"/>,          alert: false },
    { key: "active",   label: `Used in ${days}d`, value: stats.active,   icon: <TrendingUp className="h-[15px] w-[15px]"/>, alert: false },
    { key: "featured", label: "Featured",     value: stats.featured, icon: <Star className="h-[15px] w-[15px]"/>,          alert: false },
    { key: "blocked",  label: "Blocked",      value: stats.blocked,  icon: <Ban className="h-[15px] w-[15px]"/>,           alert: stats.blocked > 0 },
    { key: "unused",   label: "Unused",       value: stats.unused,   icon: <EyeOff className="h-[15px] w-[15px]"/>,        alert: false },
  ];

  return (
    <AdminShell title="Hashtags">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#fff3ec] text-[#fd4605]">
              <Hash className="h-[22px] w-[22px]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-[#111827]">Hashtags</h2>
              <p className="text-[13px] text-[#6b7280]">
                {formatCompact(stats.total)} tags · {formatCompact(stats.active)} used in the last {days} days
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-0.5 rounded-xl bg-[#f4f5f7] p-0.5">
              {WINDOWS.map(d => (
                <button key={d} onClick={() => setDays(d)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    days === d ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                  }`}>
                  {d}d
                </button>
              ))}
            </div>
            <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
            </Button>
          </div>
        </div>

        {/* ── Counters, doubling as the status filter ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {TILES.map(t => {
            const on = status === t.key;
            return (
              <button key={t.key} type="button" onClick={() => switchTab(t.key)}
                className={`flex items-center gap-3 rounded-2xl border bg-white p-4 text-left shadow-sm transition-all
                  ${on ? "border-[#fd4605] ring-2 ring-[#fd4605]/15" : "border-[#e8eaed] hover:border-[#d1d5db]"}`}>
                <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${t.alert ? "bg-[#fff3ec] text-[#fd4605]" : "bg-[#f4f5f7] text-[#6b7280]"}`}>
                  {t.icon}
                </span>
                <div className="min-w-0">
                  <p className="truncate text-[11px] text-[#9ca3af]">{t.label}</p>
                  <p className={`text-[19px] font-black leading-tight tabular-nums ${t.alert ? "text-[#fd4605]" : "text-[#111827]"}`}>
                    {formatCompact(t.value)}
                  </p>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Trending strip: measured, not positional ── */}
        {topTrending.length > 0 && (
          <div className="rounded-2xl border border-[#e8eaed] bg-white p-4 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-[#fd4605]" />
              <h3 className="text-[13px] font-bold text-[#111827]">Trending on this page</h3>
              <span className="text-[11px] text-[#9ca3af]">posts carrying the tag in the last {days} days</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {topTrending.map(h => (
                <a key={h.id} href={`${frontendBase}/tag/${encodeURIComponent(h.name)}`} target="_blank" rel="noreferrer"
                  className="flex items-center gap-1.5 rounded-full border border-[#e8eaed] bg-[#f9fafb] px-3 py-1.5 transition-colors hover:border-[#fd4605]/40 hover:bg-[#fff3ec]">
                  <Hash className="h-3 w-3 text-[#9ca3af]" />
                  <span className="text-[12px] font-semibold text-[#111827]">{h.name}</span>
                  <span className="rounded-full bg-white px-1.5 text-[10.5px] font-bold tabular-nums text-[#6b7280]">
                    {formatCompact(h.recent_count)}
                  </span>
                </a>
              ))}
            </div>
          </div>
        )}

        {/* ── Table ── */}
        <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eaed] px-4 py-3">
            <div className="flex items-center gap-0.5 rounded-xl bg-[#f4f5f7] p-0.5">
              {STATUS_TABS.map(t => (
                <button key={t.key} onClick={() => switchTab(t.key)}
                  className={`rounded-lg px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                    status === t.key ? "bg-white text-[#111827] shadow-sm" : "text-[#6b7280] hover:text-[#374151]"
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9ca3af]" />
                <input value={qInput} onChange={e => setQInput(e.target.value)} placeholder="Search hashtags…"
                  className="h-8 w-48 rounded-lg border border-[#e8eaed] bg-[#f9fafb] pl-7 pr-2 text-[12px] outline-none transition focus:border-[#fd4605] focus:ring-1 focus:ring-[#fd4605]/20" />
              </div>
              <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }}
                className="h-8 rounded-lg border border-[#e8eaed] bg-[#f9fafb] px-2 text-[12px] text-[#374151] outline-none focus:border-[#fd4605]">
                {SORTS.map(o => <option key={o.key} value={o.key}>{o.label}</option>)}
              </select>
              <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#6b7280]">
                {formatCompact(meta.total)}
              </span>
            </div>
          </div>

          {/* Bulk bar appears only when something is selected. */}
          {selected.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#ffd9e2] bg-[#fff3ec] px-4 py-2.5">
              <p className="text-[12px] font-semibold tabular-nums text-[#fd4605]">{selected.length} selected</p>
              <div className="flex flex-wrap items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => ask(selected, "block", `${selected.length} tags`)}>
                  <Ban className="h-3 w-3" /> Block
                </Button>
                <Button size="sm" variant="outline" onClick={() => ask(selected, "unblock", `${selected.length} tags`)}>
                  <CheckCircle2 className="h-3 w-3" /> Unblock
                </Button>
                <Button size="sm" variant="outline" onClick={() => ask(selected, "feature", `${selected.length} tags`)}>
                  <Star className="h-3 w-3" /> Feature
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setSelected([])}>
                  <X className="h-3 w-3" /> Clear
                </Button>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px]">
              <thead>
                <tr className="border-b border-[#f3f4f6] bg-[#f9fafb]">
                  <th className="w-10 px-4 py-2.5">
                    <input type="checkbox" checked={allChecked}
                      onChange={() => setSelected(allChecked ? [] : allOnPage)}
                      className="h-3.5 w-3.5 cursor-pointer rounded border-[#d1d5db] text-[#fd4605] focus:ring-[#fd4605]/30" />
                  </th>
                  {["Hashtag", "Total posts", `Last ${days}d`, "Status", "First seen", ""].map((h, i) => (
                    <th key={h || i}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-wider text-[#9ca3af] ${i === 0 ? "text-left" : i >= 3 ? "text-left" : "text-right"}`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#f3f4f6]">
                {isLoading ? (
                  Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>
                      <td className="px-4 py-3.5"><div className="h-3.5 w-3.5 animate-pulse rounded bg-[#f1f2f4]" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-40 animate-pulse rounded bg-[#f1f2f4]" /></td>
                      <td className="px-4 py-3.5"><div className="ml-auto h-3 w-12 animate-pulse rounded bg-[#f6f7f8]" /></td>
                      <td className="px-4 py-3.5"><div className="ml-auto h-3 w-12 animate-pulse rounded bg-[#f6f7f8]" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-16 animate-pulse rounded bg-[#f6f7f8]" /></td>
                      <td className="px-4 py-3.5"><div className="h-3 w-20 animate-pulse rounded bg-[#f6f7f8]" /></td>
                      <td className="px-4 py-3.5" />
                    </tr>
                  ))
                ) : hashtags.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-14 text-center">
                      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#f3f4f6] text-[#9ca3af]">
                        <Hash className="h-5 w-5" />
                      </span>
                      <p className="mt-3 text-[13px] font-semibold text-[#374151]">No hashtags found</p>
                      <p className="mt-1 text-[12px] text-[#9ca3af]">
                        {q ? "Try a different search." : "Nothing matches this filter."}
                      </p>
                    </td>
                  </tr>
                ) : hashtags.map((h, i) => {
                  const checked = selected.includes(h.id);
                  return (
                    <tr key={h.id} className={`transition-colors ${checked ? "bg-[#fff3ec]" : "hover:bg-[#fafbfc]"}`}>
                      <td className="px-4 py-3.5">
                        <input type="checkbox" checked={checked}
                          onChange={() => setSelected(s => s.includes(h.id) ? s.filter(x => x !== h.id) : [...s, h.id])}
                          className="h-3.5 w-3.5 cursor-pointer rounded border-[#d1d5db] text-[#fd4605] focus:ring-[#fd4605]/30" />
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <span className="w-6 shrink-0 text-[11px] font-bold tabular-nums text-[#c4c7ce]">
                            {(meta.current_page - 1) * 30 + i + 1}
                          </span>
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${h.is_blocked ? "bg-[#f3f4f6] text-[#9ca3af]" : "bg-[#fff3ec] text-[#fd4605]"}`}>
                            <Hash className="h-3.5 w-3.5" />
                          </span>
                          <div className="min-w-0">
                            <a href={`${frontendBase}/tag/${encodeURIComponent(h.name)}`} target="_blank" rel="noreferrer"
                              className={`text-[13.5px] font-bold hover:underline ${h.is_blocked ? "text-[#9ca3af] line-through" : "text-[#111827]"}`}>
                              #{h.name}
                            </a>
                            {h.blocked_reason && (
                              <p className="truncate text-[10.5px] text-[#9ca3af]" title={h.blocked_reason}>
                                {h.blocked_reason}
                              </p>
                            )}
                          </div>
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-right text-[13px] font-bold tabular-nums text-[#111827]">
                        {formatCompact(h.videos_count)}
                      </td>

                      <td className="px-4 py-3.5 text-right">
                        {h.recent_count > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-[#fff3ec] px-2 py-0.5 text-[11.5px] font-bold tabular-nums text-[#fd4605]">
                            <TrendingUp className="h-3 w-3" />{formatCompact(h.recent_count)}
                          </span>
                        ) : (
                          <span className="text-[12px] tabular-nums text-[#c4c7ce]">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex flex-wrap items-center gap-1">
                          {h.is_blocked && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#6b7280]">
                              <Ban className="h-2.5 w-2.5" /> Blocked
                            </span>
                          )}
                          {h.is_featured && (
                            <span className="inline-flex items-center gap-0.5 rounded-full border border-[#ffd9e2] bg-[#fff3ec] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#fd4605]">
                              <Star className="h-2.5 w-2.5" /> Featured
                            </span>
                          )}
                          {!h.is_blocked && !h.is_featured && (
                            <span className="text-[11.5px] text-[#9ca3af]">
                              {h.videos_count === 0 ? "Unused" : "Active"}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-4 py-3.5 text-[11.5px] text-[#9ca3af]">
                        {h.created_at ? formatDate(h.created_at) : "-"}
                      </td>

                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          <a href={`${frontendBase}/tag/${encodeURIComponent(h.name)}`} target="_blank" rel="noreferrer"
                            title="Open on teezer.live"
                            className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-[#9ca3af] transition-colors hover:bg-[#f4f5f7] hover:text-[#374151]">
                            <ExternalLink className="h-3 w-3" />
                          </a>
                          <button
                            onClick={() => ask([h.id], h.is_featured ? "unfeature" : "feature", `#${h.name}`)}
                            title={h.is_featured ? "Remove from featured" : "Feature this tag"}
                            disabled={h.is_blocked}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-[#9ca3af] transition-colors hover:bg-[#f4f5f7] hover:text-[#374151] disabled:opacity-40">
                            <Star className={`h-3 w-3 ${h.is_featured ? "fill-current text-[#fd4605]" : ""}`} />
                          </button>
                          <button
                            onClick={() => ask([h.id], h.is_blocked ? "unblock" : "block", `#${h.name}`)}
                            title={h.is_blocked ? "Restore to discovery" : "Block from discovery"}
                            className="grid h-7 w-7 place-items-center rounded-lg border border-[#e8eaed] text-[#9ca3af] transition-colors hover:bg-[#f4f5f7] hover:text-[#374151]">
                            {h.is_blocked ? <CheckCircle2 className="h-3 w-3" /> : <Ban className="h-3 w-3" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {meta.last_page > 1 && (
            <div className="flex items-center justify-between border-t border-[#e8eaed] px-4 py-3">
              <p className="text-[12px] tabular-nums text-[#9ca3af]">
                Page {meta.current_page} of {meta.last_page} · {formatCompact(meta.total)} tags
              </p>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1}
                  onClick={() => { setPage(p => Math.max(1, p - 1)); setSelected([]); }}>
                  Previous
                </Button>
                <Button size="sm" variant="outline" disabled={page >= meta.last_page}
                  onClick={() => { setPage(p => Math.min(meta.last_page, p + 1)); setSelected([]); }}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Confirmation ── */}
      {pending && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => { setPending(null); setReason(""); }} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fff3ec] text-[#fd4605]">
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-bold text-[#111827]">{ACTION_COPY[pending.action].title}</h3>
                <p className="truncate text-[11.5px] text-[#9ca3af]">{pending.label}</p>
              </div>
            </div>
            <p className="text-[12.5px] leading-relaxed text-[#6b7280]">{ACTION_COPY[pending.action].message}</p>
            <textarea value={reason} onChange={e => setReason(e.target.value)} rows={3} maxLength={500}
              placeholder="Reason (optional) — shown in the audit log"
              className="mt-3 w-full resize-none rounded-xl border border-[#e8eaed] bg-[#f9fafb] px-3 py-2 text-[12px] text-[#111827] outline-none focus:border-[#fd4605]" />
            <div className="mt-4 flex justify-end gap-2.5">
              <button onClick={() => { setPending(null); setReason(""); }}
                className="rounded-xl border border-[#e8eaed] px-4 py-2 text-xs font-medium text-[#374151] transition-colors hover:bg-[#f4f5f7]">
                Cancel
              </button>
              <button
                disabled={act.isPending}
                onClick={() => act.mutate({ ids: pending.ids, action: pending.action })}
                className={`inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50
                  ${ACTION_COPY[pending.action].danger ? "bg-red-500 hover:bg-red-600" : "bg-[#fd4605] hover:bg-[#e03e04]"}`}>
                {act.isPending && <Loader2 className="h-3 w-3 animate-spin" />}
                {ACTION_COPY[pending.action].confirm}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
