"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Clock, ShieldAlert, CheckCircle2, XCircle, Timer,
  Check, X, MoreVertical, Search, Compass, Mail, Hash, User, Rows3, BadgeCheck, MessageSquareWarning, Ban,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Textarea } from "@/components/ui/input";
import { adsService, adMoney, adNum, type ApprovalRow, type ApprovalTab } from "@/services/ads.service";
import { apiMessage } from "@/services/api";

/* ── helpers ──────────────────────────────────────────────────────────────── */
const OBJ: Record<string, { label: string; cls: string }> = {
  conversions:  { label: "Conversions", cls: "bg-purple-50 text-purple-600" },
  traffic:      { label: "Traffic",     cls: "bg-blue-50 text-blue-600" },
  reach:        { label: "Reach",       cls: "bg-amber-50 text-amber-600" },
  awareness:    { label: "Awareness",   cls: "bg-amber-50 text-amber-600" },
  video_views:  { label: "Video Views", cls: "bg-cyan-50 text-cyan-600" },
  engagement:   { label: "Engagement",  cls: "bg-pink-50 text-pink-600" },
  followers:    { label: "Followers",   cls: "bg-indigo-50 text-indigo-600" },
  sales:        { label: "Sales",       cls: "bg-emerald-50 text-emerald-600" },
  app_installs: { label: "App Installs", cls: "bg-violet-50 text-violet-600" },
};
function objBadge(o: string) {
  const m = OBJ[o] ?? { label: o.replace(/_/g, " "), cls: "bg-gray-100 text-gray-600" };
  return <span className={`px-2.5 py-1 rounded-md text-[11px] font-semibold capitalize ${m.cls}`}>{m.label}</span>;
}

const PLACEMENT: Record<string, { label: string; icon: React.ReactNode }> = {
  in_feed:     { label: "Feed",     icon: <Rows3 size={13} /> },
  explore:     { label: "Explore",  icon: <Compass size={13} /> },
  inbox:       { label: "Inbox",    icon: <Mail size={13} /> },
  search:      { label: "Search",   icon: <Search size={13} /> },
  hashtag:     { label: "Hashtags", icon: <Hash size={13} /> },
  profile_top: { label: "Creator Profile", icon: <User size={13} /> },
};
function placementLabel(k: string) { return PLACEMENT[k]?.label ?? k.replace(/_/g, " "); }

function dur(sec: number | null): string {
  if (!sec) return "";
  const m = Math.floor(sec / 60), s = Math.round(sec % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
function submitted(iso: string | null): { date: string; time: string } {
  if (!iso) return { date: "-", time: "" };
  const d = new Date(iso);
  return {
    date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
    time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}
function Avatar({ name, src, size = 22 }: { name: string; src: string | null; size?: number }) {
  if (src) return <img src={src} alt={name} className="rounded-full object-cover shrink-0" style={{ width: size, height: size }} />;
  return <div className="rounded-full grid place-items-center bg-[#fd4605] text-white font-bold shrink-0" style={{ width: size, height: size, fontSize: size * 0.42 }}>{name[0]?.toUpperCase()}</div>;
}

/* ── stat tile ────────────────────────────────────────────────────────────── */
function Tile({ value, label, sub, icon, tint, color }: { value: string; label: string; sub: string; icon: React.ReactNode; tint: string; color: string }) {
  return (
    <div className="bg-white rounded-2xl border border-[#eef0f3] p-4 flex items-center gap-3">
      <div className="w-11 h-11 rounded-full grid place-items-center shrink-0" style={{ background: tint, color }}>{icon}</div>
      <div className="min-w-0">
        <p className="text-[22px] font-bold text-[#111827] leading-none">{value}</p>
        <p className="text-[12.5px] font-semibold text-[#374151] mt-1">{label}</p>
        <p className="text-[11px] text-[#9ca3af]">{sub}</p>
      </div>
    </div>
  );
}

const TABS: { key: ApprovalTab; label: string }[] = [
  { key: "pending", label: "Pending Review" },
  { key: "needs_changes", label: "Needs Changes" },
  { key: "approved", label: "Approved" },
  { key: "rejected", label: "Rejected" },
];

export default function AdsApprovalsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [tab, setTab] = useState<ApprovalTab>("pending");
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [search, setSearch] = useState("");
  const [sel, setSel] = useState<Set<number>>(new Set());
  const [reject, setReject] = useState<ApprovalRow | null>(null);
  const [banRow, setBanRow] = useState<ApprovalRow | null>(null);
  const [changes, setChanges] = useState<ApprovalRow | null>(null);
  const [reason, setReason] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);

  const sumQ = useQuery({ queryKey: ["ads-approvals-summary"], queryFn: adsService.approvalsSummary, refetchInterval: 60_000 });
  const sum = sumQ.data;

  const { data, isLoading } = useQuery({
    queryKey: ["ads-approvals", tab, page, perPage, search],
    queryFn: () => adsService.approvals({ tab, page, per_page: perPage, search: search || undefined }),
  });
  const rows = data?.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ads-approvals"] });
    qc.invalidateQueries({ queryKey: ["ads-approvals-summary"] });
    qc.invalidateQueries({ queryKey: ["ads-overview"] });
    setSel(new Set());
  };
  const approve = useMutation({
    mutationFn: (id: number) => adsService.approve(id),
    onSuccess: () => { invalidate(); toast.success("Campaign approved & set live."); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const rejectM = useMutation({
    mutationFn: (p: { id: number; reason: string }) => adsService.reject(p.id, p.reason),
    onSuccess: () => { invalidate(); setReject(null); setReason(""); toast.success("Campaign rejected."); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const changesM = useMutation({
    mutationFn: (p: { id: number; reason: string }) => adsService.requestChanges(p.id, p.reason),
    onSuccess: () => { invalidate(); setChanges(null); setReason(""); toast.success("Changes requested."); },
    onError: (e) => toast.error(apiMessage(e)),
  });
  const banM = useMutation({
    mutationFn: (p: { id: number; reason: string }) => adsService.ban(p.id, p.reason),
    onSuccess: () => { invalidate(); setBanRow(null); setReason(""); toast.success("Campaign banned & advertiser notified."); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const allSelected = rows.length > 0 && rows.every((r) => sel.has(r.id));
  const toggleAll = () => setSel(allSelected ? new Set() : new Set(rows.map((r) => r.id)));
  const toggle = (id: number) => setSel((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const bulkApprove = () => sel.forEach((id) => approve.mutate(id));

  const tiles = useMemo(() => [
    { value: adNum(sum?.pending ?? 0), label: "Pending Review", sub: "Awaiting your review", icon: <Clock size={20} />, tint: "#ffe4ec", color: "#fd4605" },
    { value: adNum(sum?.needs_changes ?? 0), label: "Needs Changes", sub: "Require modifications", icon: <ShieldAlert size={20} />, tint: "#fef3c7", color: "#d97706" },
    { value: adNum(sum?.approved_month ?? 0), label: "Approved", sub: "This month", icon: <CheckCircle2 size={20} />, tint: "#dcfce7", color: "#16a34a" },
    { value: adNum(sum?.rejected_month ?? 0), label: "Rejected", sub: "This month", icon: <XCircle size={20} />, tint: "#fee2e2", color: "#dc2626" },
    { value: fmtDur(sum?.avg_review_minutes ?? 0), label: "Avg. Review Time", sub: "This month", icon: <Timer size={20} />, tint: "#ede9fe", color: "#7c3aed" },
  ], [sum]);

  const tabCount = (k: ApprovalTab) => k === "pending" ? sum?.pending : k === "needs_changes" ? sum?.needs_changes : undefined;

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[#111827]">Approvals</h1>
            <p className="text-[13px] text-[#6b7280]">Review campaigns awaiting moderation. Approving sets the campaign live.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search campaigns, advertisers…"
                className="h-9 w-[240px] rounded-lg border border-[#e8eaed] bg-white pl-8 pr-3 text-[13px] text-[#111827] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10"
              />
            </div>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {tiles.map((t) => <Tile key={t.label} {...t} />)}
        </div>

        {/* Tabs + table */}
        <div className="bg-white rounded-2xl border border-[#eef0f3] overflow-hidden">
          <div className="flex items-center gap-1 px-4 border-b border-[#eef0f3]">
            {TABS.map((t) => {
              const c = tabCount(t.key);
              const active = tab === t.key;
              return (
                <button key={t.key} onClick={() => { setTab(t.key); setPage(1); setSel(new Set()); }}
                  className={`relative px-3 py-3 text-[13px] font-semibold transition-colors ${active ? "text-[#fd4605]" : "text-[#6b7280] hover:text-[#111827]"}`}>
                  {t.label}{c != null ? ` (${c})` : ""}
                  {active && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded bg-[#fd4605]" />}
                </button>
              );
            })}
          </div>

          {/* Bulk bar */}
          {sel.size > 0 && (
            <div className="flex items-center justify-between px-5 py-2.5 bg-[#fff0f2] border-b border-[#ffe0e4]">
              <span className="text-[12.5px] font-semibold text-[#111827]">{sel.size} selected</span>
              <div className="flex items-center gap-2">
                <button onClick={bulkApprove} className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-emerald-100"><Check size={14} /> Approve selected</button>
                <button onClick={() => setSel(new Set())} className="text-[12px] text-[#6b7280] px-2">Clear</button>
              </div>
            </div>
          )}

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1040px]">
              <thead>
                <tr className="text-[11px] font-semibold text-[#9ca3af] border-b border-[#eef0f3]">
                  <th className="w-10 pl-5 py-3"><input type="checkbox" checked={allSelected} onChange={toggleAll} className="accent-[#fd4605]" /></th>
                  <th className="text-left py-3 pr-4">AD PREVIEW</th>
                  <th className="text-left py-3 pr-4">CAMPAIGN &amp; ADVERTISER</th>
                  <th className="text-left py-3 pr-4">PLACEMENTS</th>
                  <th className="text-left py-3 pr-4">BUDGET / DAY</th>
                  <th className="text-left py-3 pr-4">SUBMITTED</th>
                  <th className="text-left py-3 pr-4">OBJECTIVE</th>
                  <th className="text-right py-3 pr-5">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={8} className="py-14 text-center text-[13px] text-[#9ca3af]">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={8} className="py-14 text-center text-[13px] text-[#9ca3af]">{tab === "pending" ? "Nothing awaiting review. 🎉" : "No campaigns here."}</td></tr>
                ) : rows.map((r) => {
                  const sb = submitted(r.submitted_at);
                  // Approve/re-approve: anything not already live. Reject: anything still
                  // running or pending - including LIVE ads, so an approved ad can be
                  // pulled back down. Only a finished/already-rejected ad can't be acted on.
                  const canApprove = ["pending_review", "changes_requested", "rejected", "paused"].includes(r.status);
                  const canReject  = !["rejected", "completed"].includes(r.status);
                  const canChanges = !["rejected", "completed"].includes(r.status);
                  return (
                    <tr key={r.id} className="border-b border-[#f4f5f7] last:border-0 hover:bg-[#fafbfc]">
                      <td className="pl-5 py-4 align-top"><input type="checkbox" checked={sel.has(r.id)} onChange={() => toggle(r.id)} className="mt-1 accent-[#fd4605]" /></td>

                      {/* Preview */}
                      <td className="py-4 pr-4 align-top">
                        <button onClick={() => router.push(`/ads-management/campaigns/${r.id}`)} className="relative block w-[92px] h-[64px] rounded-lg overflow-hidden bg-[#111827] shrink-0">
                          {r.preview.thumbnail_url
                            ? <img src={r.preview.thumbnail_url} alt="" className="w-full h-full object-cover" />
                            : <div className="w-full h-full grid place-items-center text-[#4b5563]"><Rows3 size={20} /></div>}
                          {r.preview.duration ? <span className="absolute bottom-1 right-1 bg-black/70 text-white text-[10px] px-1 rounded">{dur(r.preview.duration)}</span> : null}
                        </button>
                      </td>

                      {/* Campaign & advertiser */}
                      <td className="py-4 pr-4 align-top">
                        <button onClick={() => router.push(`/ads-management/campaigns/${r.id}`)} className="font-bold text-[13.5px] text-[#111827] leading-tight text-left hover:text-[#fd4605]">{r.name}</button>
                        <div className="text-[11px] text-[#9ca3af] mb-1.5">Ad ID: {r.ad_id}</div>
                        <div className="flex items-center gap-1.5">
                          <Avatar name={r.advertiser.name} src={r.advertiser.avatar} />
                          <span className="text-[12px] font-medium text-[#374151]">{r.advertiser.name}</span>
                          {r.advertiser.is_verified && <BadgeCheck size={13} className="text-[#3b9aff]" />}
                        </div>
                        {r.advertiser.username && <div className="text-[11px] text-[#9ca3af] ml-[26px] -mt-0.5">@{r.advertiser.username}</div>}
                      </td>

                      {/* Placements */}
                      <td className="py-4 pr-4 align-top">
                        <div className="flex items-center gap-1.5">
                          {r.placements.slice(0, 3).map((p) => (
                            <span key={p} title={placementLabel(p)} className="w-8 h-8 rounded-lg border border-[#e8eaed] grid place-items-center text-[#374151]">
                              {PLACEMENT[p]?.icon ?? <Rows3 size={13} />}
                            </span>
                          ))}
                          {r.placements.length > 3 && <span className="w-8 h-8 rounded-lg border border-[#e8eaed] grid place-items-center text-[11px] font-semibold text-[#6b7280]">+{r.placements.length - 3}</span>}
                        </div>
                        <div className="text-[11px] text-[#9ca3af] mt-1.5">{r.placements.map(placementLabel).join(", ") || "-"}</div>
                      </td>

                      {/* Budget */}
                      <td className="py-4 pr-4 align-top">
                        <div className="text-[13px] font-bold text-[#111827]">{adMoney(r.daily_budget_cents)}</div>
                        <div className="text-[11px] text-[#9ca3af]">Per day</div>
                      </td>

                      {/* Submitted */}
                      <td className="py-4 pr-4 align-top">
                        <div className="text-[12.5px] font-medium text-[#111827]">{sb.date}</div>
                        <div className="text-[11px] text-[#9ca3af]">{sb.time}</div>
                        <div className="text-[11px] text-[#9ca3af] mt-0.5">by {r.submitted_by}</div>
                      </td>

                      {/* Objective */}
                      <td className="py-4 pr-4 align-top">{objBadge(r.objective)}</td>

                      {/* Actions */}
                      <td className="py-4 pr-5 align-top">
                        <div className="flex items-center justify-end gap-2">
                          <div className="flex flex-col gap-1.5">
                            <button disabled={!canApprove || approve.isPending} onClick={() => approve.mutate(r.id)}
                              className="inline-flex items-center justify-center gap-1 bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-emerald-100 disabled:opacity-40"><Check size={14} /> {r.status === "rejected" ? "Re-approve" : "Approve"}</button>
                            <button disabled={!canReject} onClick={() => { setReject(r); setReason(""); }}
                              className="inline-flex items-center justify-center gap-1 bg-red-50 text-red-600 px-3 py-1.5 rounded-lg text-[12px] font-semibold hover:bg-red-100 disabled:opacity-40"><X size={14} /> Reject</button>
                          </div>
                          <div className="relative">
                            <button onClick={(e) => { if (menu === r.id) { setMenu(null); return; } setMenuRect(e.currentTarget.getBoundingClientRect()); setMenu(r.id); }} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-[#f1f2f4] text-[#9ca3af]"><MoreVertical size={16} /></button>
                            {menu === r.id && menuRect && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                                <div className="fixed z-50 bg-white border border-[#e8eaed] rounded-xl shadow-lg py-1 w-48" style={menuStyle(menuRect)}>
                                  <button disabled={!canChanges} onClick={() => { setMenu(null); setChanges(r); setReason(""); }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-[12.5px] text-[#374151] hover:bg-[#f8f9fb] disabled:opacity-40">
                                    <MessageSquareWarning size={14} /> Request changes
                                  </button>
                                  <div className="my-1 border-t border-[#f1f2f4]" />
                                  <button disabled={!canReject} onClick={() => { setMenu(null); setBanRow(r); setReason(""); }} className="w-full flex items-center gap-2 text-left px-3 py-2 text-[12.5px] text-red-600 hover:bg-red-50 disabled:opacity-40">
                                    <Ban size={14} /> Ban ad (policy)
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer / pagination */}
          {data && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 py-3 border-t border-[#eef0f3]">
              <span className="text-[12px] text-[#6b7280]">
                {data.meta.total === 0 ? "No results" : `Showing ${(data.meta.current_page - 1) * data.meta.per_page + 1} to ${Math.min(data.meta.current_page * data.meta.per_page, data.meta.total)} of ${data.meta.total} results`}
              </span>
              <div className="flex items-center gap-2">
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="h-8 rounded-lg border border-[#e8eaed] bg-white px-2 text-[12px] text-[#374151]">
                  {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <button disabled={data.meta.current_page <= 1} onClick={() => setPage((p) => p - 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-[#e8eaed] text-[#6b7280] disabled:opacity-40 hover:bg-[#f8f9fb]">‹</button>
                {Array.from({ length: data.meta.last_page }, (_, i) => i + 1).slice(0, 6).map((n) => (
                  <button key={n} onClick={() => setPage(n)} className={`w-8 h-8 grid place-items-center rounded-lg text-[12px] font-semibold ${n === data.meta.current_page ? "bg-[#fd4605] text-white" : "border border-[#e8eaed] text-[#374151] hover:bg-[#f8f9fb]"}`}>{n}</button>
                ))}
                <button disabled={data.meta.current_page >= data.meta.last_page} onClick={() => setPage((p) => p + 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-[#e8eaed] text-[#6b7280] disabled:opacity-40 hover:bg-[#f8f9fb]">›</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Reject modal */}
      <ConfirmModal
        open={!!reject} danger title="Reject campaign"
        message={`Reject "${reject?.name ?? ""}"? Your reason is shown to the advertiser.`}
        confirmLabel="Reject campaign" loading={rejectM.isPending}
        onCancel={() => { setReject(null); setReason(""); }}
        onConfirm={() => { if (reject && reason.trim()) rejectM.mutate({ id: reject.id, reason: reason.trim() }); }}
      >
        <Textarea className="mt-3" rows={3} placeholder="Reason for rejection (required)…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmModal>

      {/* Request-changes modal */}
      <ConfirmModal
        open={!!changes} title="Request changes"
        message={`Ask "${changes?.name ?? ""}" to modify their campaign. They can edit and resubmit.`}
        confirmLabel="Send request" loading={changesM.isPending}
        onCancel={() => { setChanges(null); setReason(""); }}
        onConfirm={() => { if (changes && reason.trim()) changesM.mutate({ id: changes.id, reason: reason.trim() }); }}
      >
        <Textarea className="mt-3" rows={3} placeholder="What needs to change? (required)…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmModal>

      {/* Ban modal */}
      <ConfirmModal
        open={!!banRow} danger title="Ban ad for policy violation"
        message={`Permanently take down "${banRow?.name ?? ""}". Delivery stops immediately and the advertiser is emailed and notified with your reason. Unlike a rejection, this cannot be resubmitted.`}
        confirmLabel="Ban ad" loading={banM.isPending}
        onCancel={() => { setBanRow(null); setReason(""); }}
        onConfirm={() => { if (banRow && reason.trim()) banM.mutate({ id: banRow.id, reason: reason.trim() }); }}
      >
        <Textarea className="mt-3" rows={3} placeholder="Which policy was violated? (shown to the advertiser, required)…" value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmModal>
    </AdminShell>
  );
}

function fmtDur(minutes: number): string {
  if (minutes <= 0) return "-";
  const h = Math.floor(minutes / 60), m = Math.round(minutes % 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

/* Fixed-positioned actions menu anchored to its trigger, so it isn't clipped by
   the table's overflow-x-auto container; flips up near the viewport bottom. */
function menuStyle(rect: DOMRect): React.CSSProperties {
  const W = 176; // w-44
  const H = 120;
  const GAP = 6;
  const left = Math.max(8, Math.min(rect.right - W, window.innerWidth - W - 8));
  const openUp = rect.bottom + GAP + H > window.innerHeight && rect.top - GAP - H > 0;
  return openUp
    ? { left, bottom: window.innerHeight - rect.top + GAP }
    : { left, top: rect.bottom + GAP };
}
