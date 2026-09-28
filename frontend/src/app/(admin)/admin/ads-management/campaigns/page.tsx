"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Megaphone, PlayCircle, PencilLine, CheckCircle2, DollarSign, TrendingUp, TrendingDown,
  Download, Plus, Search, MoreVertical, Eye, Copy, Pause, Play, XCircle, BarChart3, Trash2,
  Target, ShoppingBag, Shuffle, UserPlus, Radar, Rows3,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { adsService, adMoney, adNum, type CampaignListRow } from "@/admin-panel/services/ads.service";
import { apiMessage } from "@/admin-panel/services/api";

/* ── helpers ──────────────────────────────────────────────────────────────── */
const OBJ: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  engagement:   { label: "Engagement",  icon: <Target size={15} />,   color: "#ec4899" },
  traffic:      { label: "Traffic",     icon: <BarChart3 size={15} />, color: "#3b82f6" },
  sales:        { label: "Sales",       icon: <ShoppingBag size={15} />, color: "#16a34a" },
  conversions:  { label: "Conversions", icon: <Shuffle size={15} />,  color: "#a855f7" },
  awareness:    { label: "Awareness",   icon: <Radar size={15} />,    color: "#f97316" },
  reach:        { label: "Reach",       icon: <Radar size={15} />,    color: "#f97316" },
  video_views:  { label: "Video Views", icon: <PlayCircle size={15} />, color: "#06b6d4" },
  followers:    { label: "Followers",   icon: <UserPlus size={15} />, color: "#6366f1" },
  app_installs: { label: "App Installs", icon: <Download size={15} />, color: "#3b82f6" },
};
function objCell(o: string) {
  const m = OBJ[o] ?? { label: o.replace(/_/g, " "), icon: <Target size={15} />, color: "#6b7280" };
  return <span className="inline-flex items-center gap-1.5 text-[12.5px] text-[#374151] capitalize"><span style={{ color: m.color }}>{m.icon}</span>{m.label}</span>;
}

const STATUS: Record<string, { label: string; cls: string; bar: string }> = {
  active:         { label: "Active",    cls: "bg-emerald-50 text-emerald-600", bar: "#22c55e" },
  paused:         { label: "Paused",    cls: "bg-amber-50 text-amber-600",     bar: "#f59e0b" },
  completed:      { label: "Completed", cls: "bg-blue-50 text-blue-600",       bar: "#3b82f6" },
  draft:          { label: "Draft",     cls: "bg-gray-100 text-gray-500",      bar: "#d1d5db" },
  rejected:       { label: "Rejected",  cls: "bg-red-50 text-red-600",         bar: "#ef4444" },
  pending_review: { label: "Pending",   cls: "bg-amber-50 text-amber-600",     bar: "#f59e0b" },
  changes_requested: { label: "Needs Changes", cls: "bg-orange-50 text-orange-600", bar: "#f97316" },
};
function statusPill(s: string) {
  const m = STATUS[s] ?? { label: s.replace(/_/g, " "), cls: "bg-gray-100 text-gray-500", bar: "#d1d5db" };
  return <span className={`px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${m.cls}`}>{m.label}</span>;
}

function shortDate(iso: string | null) {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}
function durationCell(r: CampaignListRow) {
  if (!r.start_at && !r.end_at) return <span className="text-[13px] text-[#9ca3af]">-</span>;
  const range = `${shortDate(r.start_at)} – ${shortDate(r.end_at)}`;
  let note = "", noteCls = "text-[#9ca3af]";
  if (r.status === "completed") note = "Completed";
  else if (r.end_at) {
    const days = Math.ceil((new Date(r.end_at).getTime() - Date.now()) / 86400000);
    note = days > 0 ? `${days} day${days > 1 ? "s" : ""} left` : "Ended";
    if (days > 0 && days <= 3) noteCls = "text-amber-600 font-medium";
    else if (days > 0) noteCls = "text-emerald-600 font-medium";
  }
  return <div><div className="text-[12.5px] text-[#111827] whitespace-nowrap">{range}</div>{note && <div className={`text-[11px] ${noteCls}`}>{note}</div>}</div>;
}
function created(iso: string | null) {
  if (!iso) return { date: "-", time: "" };
  const d = new Date(iso);
  return { date: d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }), time: d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }) };
}
function Avatar({ name, src }: { name: string; src: string | null }) {
  if (src) return <img src={src} alt={name} className="w-8 h-8 rounded-full object-cover shrink-0" />;
  return <div className="w-8 h-8 rounded-full grid place-items-center bg-[#fe2c55] text-white text-[13px] font-bold shrink-0">{name[0]?.toUpperCase()}</div>;
}
function Growth({ g }: { g: number }) {
  if (g === 0) return <span className="text-[11px] text-[#9ca3af]">No change</span>;
  const up = g > 0;
  return <span className={`inline-flex items-center gap-0.5 text-[11px] font-medium ${up ? "text-emerald-500" : "text-red-500"}`}>{up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{up ? "+" : ""}{g.toFixed(1)}% from last 30 days</span>;
}

const STATUSES = ["all", "active", "paused", "completed", "draft", "pending_review", "rejected"];
const OBJECTIVES = ["all", "reach", "video_views", "traffic", "engagement", "followers", "conversions", "app_installs"];

/* ── page ─────────────────────────────────────────────────────────────────── */
export default function AdsCampaignsPage() {
  const qc = useQueryClient();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [status, setStatus] = useState("all");
  const [objective, setObjective] = useState("all");
  const [search, setSearch] = useState("");
  const [menu, setMenu] = useState<number | null>(null);
  const [menuRect, setMenuRect] = useState<DOMRect | null>(null);
  const [del, setDel] = useState<CampaignListRow | null>(null);

  const sumQ = useQuery({ queryKey: ["ads-campaigns-summary"], queryFn: adsService.campaignsSummary, refetchInterval: 60_000 });
  const sum = sumQ.data;
  const { data, isLoading } = useQuery({
    queryKey: ["ads-campaigns", page, perPage, status, objective, search],
    queryFn: () => adsService.campaigns({ page, per_page: perPage, status, objective, search: search || undefined }),
  });
  const rows = data?.data ?? [];

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ads-campaigns"] });
    qc.invalidateQueries({ queryKey: ["ads-campaigns-summary"] });
    qc.invalidateQueries({ queryKey: ["ads-overview"] });
  };
  const onErr = (e: unknown) => toast.error(apiMessage(e));
  const ok = (msg: string) => () => { invalidate(); toast.success(msg); setMenu(null); };
  const pauseM = useMutation({ mutationFn: adsService.pauseCampaign, onSuccess: ok("Campaign paused."), onError: onErr });
  const resumeM = useMutation({ mutationFn: adsService.resumeCampaign, onSuccess: ok("Campaign resumed."), onError: onErr });
  const endM = useMutation({ mutationFn: adsService.endCampaign, onSuccess: ok("Campaign ended."), onError: onErr });
  const dupM = useMutation({ mutationFn: adsService.duplicateCampaign, onSuccess: ok("Duplicated as a draft."), onError: onErr });
  const delM = useMutation({
    mutationFn: (id: number) => adsService.deleteCampaign(id),
    onSuccess: () => { invalidate(); setDel(null); toast.success("Campaign deleted."); },
    onError: onErr,
  });

  const tiles = [
    { label: "Total Campaigns", value: adNum(sum?.total.value ?? 0), g: sum?.total.growth, icon: <Megaphone size={20} />, tint: "#ffe4ec", color: "#fe2c55" },
    { label: "Active Campaigns", value: adNum(sum?.active.value ?? 0), g: sum?.active.growth, icon: <PlayCircle size={20} />, tint: "#dcfce7", color: "#16a34a" },
    { label: "Draft Campaigns", value: adNum(sum?.draft.value ?? 0), g: sum?.draft.growth, icon: <PencilLine size={20} />, tint: "#fef3c7", color: "#d97706" },
    { label: "Completed Campaigns", value: adNum(sum?.completed.value ?? 0), g: sum?.completed.growth, icon: <CheckCircle2 size={20} />, tint: "#ede9fe", color: "#7c3aed" },
    { label: "Total Spent", value: adMoney(sum?.total_spent_cents.value ?? 0), g: sum?.total_spent_cents.growth, icon: <DollarSign size={20} />, tint: "#e0f2fe", color: "#0284c7" },
  ];

  const pages = pageList(data?.meta.current_page ?? 1, data?.meta.last_page ?? 1);

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <h1 className="text-[20px] font-bold text-[#111827]">Campaigns</h1>
            <p className="text-[13px] text-[#6b7280]">Every advertiser&apos;s campaign across the platform.</p>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-1.5 border border-[#e8eaed] rounded-lg px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f8f9fb]"><Download size={14} /> Export</button>
            <button onClick={() => toast.info("Campaigns are created by advertisers in the Studio app.")} className="flex items-center gap-1.5 bg-[#fe2c55] text-white rounded-lg px-3.5 py-2 text-[12px] font-semibold hover:bg-[#e0243d]"><Plus size={15} /> New Campaign</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {tiles.map((t) => (
            <div key={t.label} className="bg-white rounded-2xl border border-[#eef0f3] p-4">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl grid place-items-center" style={{ background: t.tint, color: t.color }}>{t.icon}</span>
              </div>
              <p className="text-[12.5px] font-medium text-[#6b7280] mt-3">{t.label}</p>
              <p className="text-[24px] font-bold text-[#111827] leading-tight">{t.value}</p>
              <div className="mt-1"><Growth g={t.g ?? 0} /></div>
            </div>
          ))}
        </div>

        {/* Filters + table */}
        <div className="bg-white rounded-2xl border border-[#eef0f3]">
          <div className="flex flex-wrap items-center gap-2 p-4 border-b border-[#eef0f3]">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af]" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search by campaign name…" className="h-9 w-[230px] rounded-lg border border-[#e8eaed] bg-white pl-8 pr-3 text-[13px] outline-none focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10" />
            </div>
            <select value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#e8eaed] bg-white px-3 text-[13px] text-[#374151]">
              {STATUSES.map((s) => <option key={s} value={s}>{s === "all" ? "All Statuses" : (STATUS[s]?.label ?? s.replace(/_/g, " "))}</option>)}
            </select>
            <select value={objective} onChange={(e) => { setObjective(e.target.value); setPage(1); }} className="h-9 rounded-lg border border-[#e8eaed] bg-white px-3 text-[13px] text-[#374151]">
              {OBJECTIVES.map((o) => <option key={o} value={o}>{o === "all" ? "All Objectives" : (OBJ[o]?.label ?? o.replace(/_/g, " "))}</option>)}
            </select>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[1120px]">
              <thead>
                <tr className="text-[11px] font-semibold text-[#9ca3af] border-b border-[#eef0f3]">
                  <th className="text-left pl-5 py-3">CAMPAIGN</th>
                  <th className="text-left py-3 pr-4">ADVERTISER</th>
                  <th className="text-left py-3 pr-4">OBJECTIVE</th>
                  <th className="text-left py-3 pr-4">STATUS</th>
                  <th className="text-left py-3 pr-4">BUDGET / DAY</th>
                  <th className="text-left py-3 pr-4">SPENT</th>
                  <th className="text-left py-3 pr-4">DURATION</th>
                  <th className="text-left py-3 pr-4">CREATED ON</th>
                  <th className="text-right py-3 pr-5">ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {isLoading ? (
                  <tr><td colSpan={9} className="py-14 text-center text-[13px] text-[#9ca3af]">Loading…</td></tr>
                ) : rows.length === 0 ? (
                  <tr><td colSpan={9} className="py-14 text-center text-[13px] text-[#9ca3af]">No campaigns match.</td></tr>
                ) : rows.map((r) => {
                  const cr = created(r.created_at);
                  const bar = STATUS[r.status]?.bar ?? "#d1d5db";
                  return (
                    <tr key={r.id} className="border-b border-[#f4f5f7] last:border-0 hover:bg-[#fafbfc]">
                      {/* Campaign */}
                      <td className="pl-5 py-4 align-top">
                        <div className="flex items-center gap-3">
                          <div className="w-[52px] h-[52px] rounded-lg overflow-hidden bg-[#111827] shrink-0 grid place-items-center">
                            {r.preview.thumbnail_url ? <img src={r.preview.thumbnail_url} alt="" className="w-full h-full object-cover" /> : <Rows3 size={18} className="text-[#4b5563]" />}
                          </div>
                          <div className="min-w-0">
                            <button onClick={() => router.push(`/admin/ads-management/campaigns/${r.id}`)} className="font-bold text-[13.5px] text-[#111827] leading-tight truncate max-w-[160px] text-left hover:text-[#fe2c55]">{r.name}</button>
                            <div className="text-[11px] font-semibold text-[#fe2c55]">{r.ad_id}</div>
                            <div className="text-[11px] text-[#9ca3af]">ID: {r.cam_id} • {r.ad_groups} Ad Group{r.ad_groups !== 1 ? "s" : ""} • {r.ads} Ad{r.ads !== 1 ? "s" : ""}</div>
                          </div>
                        </div>
                      </td>
                      {/* Advertiser */}
                      <td className="py-4 pr-4 align-top">
                        <div className="flex items-center gap-2">
                          <Avatar name={r.advertiser.name} src={r.advertiser.avatar} />
                          <div className="min-w-0">
                            {r.advertiser.username && <div className="text-[12.5px] font-medium text-[#374151] truncate max-w-[120px]">@{r.advertiser.username}</div>}
                            <div className="text-[11px] text-[#9ca3af] truncate max-w-[120px]">{r.advertiser.name}</div>
                          </div>
                        </div>
                      </td>
                      {/* Objective */}
                      <td className="py-4 pr-4 align-top">{objCell(r.objective)}</td>
                      {/* Status */}
                      <td className="py-4 pr-4 align-top">{statusPill(r.status)}</td>
                      {/* Budget */}
                      <td className="py-4 pr-4 align-top text-[13px] font-semibold text-[#111827] whitespace-nowrap">{adMoney(r.daily_budget_cents)}</td>
                      {/* Spent */}
                      <td className="py-4 pr-4 align-top">
                        <div className="text-[13px] font-bold text-[#111827] whitespace-nowrap">{adMoney(r.spent_cents)}</div>
                        <div className="text-[11px] text-[#9ca3af]">{r.spent_pct}% spent</div>
                        <div className="w-[110px] h-1.5 bg-[#f1f2f4] rounded-full mt-1 overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${r.spent_pct}%`, background: bar }} />
                        </div>
                      </td>
                      {/* Duration */}
                      <td className="py-4 pr-4 align-top">{durationCell(r)}</td>
                      {/* Created */}
                      <td className="py-4 pr-4 align-top">
                        <div className="text-[12.5px] text-[#111827] whitespace-nowrap">{cr.date}</div>
                        <div className="text-[11px] text-[#9ca3af]">{cr.time}</div>
                        <div className="text-[11px] text-[#9ca3af]">by {r.created_by}</div>
                      </td>
                      {/* Actions */}
                      <td className="py-4 pr-5 align-top text-right">
                        <div className="relative inline-block">
                          <button onClick={(e) => { if (menu === r.id) { setMenu(null); return; } setMenuRect(e.currentTarget.getBoundingClientRect()); setMenu(r.id); }} className="w-8 h-8 grid place-items-center rounded-lg hover:bg-[#f1f2f4] text-[#6b7280]"><MoreVertical size={16} /></button>
                          {menu === r.id && menuRect && (
                            <>
                              <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
                              <div className="fixed z-50 bg-white border border-[#e8eaed] rounded-xl shadow-lg py-1 w-52 text-left" style={menuStyle(menuRect)}>
                                <MenuItem icon={<Eye size={15} />} label="View Details" onClick={() => { setMenu(null); router.push(`/admin/ads-management/campaigns/${r.id}`); }} />
                                <MenuItem icon={<PencilLine size={15} />} label="Edit Campaign" onClick={() => { setMenu(null); toast.info("Editing is done in the Studio app."); }} />
                                <MenuItem icon={<Copy size={15} />} label="Duplicate" onClick={() => dupM.mutate(r.id)} />
                                {r.status === "active" && <MenuItem icon={<Pause size={15} />} label="Pause Campaign" onClick={() => pauseM.mutate(r.id)} />}
                                {r.status === "paused" && <MenuItem icon={<Play size={15} />} label="Resume Campaign" onClick={() => resumeM.mutate(r.id)} />}
                                {(r.status === "active" || r.status === "paused") && <MenuItem icon={<XCircle size={15} />} label="End Campaign" onClick={() => endM.mutate(r.id)} />}
                                <MenuItem icon={<BarChart3 size={15} />} label="Performance Report" onClick={() => { setMenu(null); toast.info("Report coming soon."); }} />
                                <div className="my-1 border-t border-[#f1f2f4]" />
                                <MenuItem icon={<Trash2 size={15} />} label="Delete Campaign" danger onClick={() => { setMenu(null); setDel(r); }} />
                              </div>
                            </>
                          )}
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
              <div className="flex items-center gap-1.5">
                <select value={perPage} onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }} className="h-8 rounded-lg border border-[#e8eaed] bg-white px-2 text-[12px] text-[#374151] mr-1">
                  {[10, 20, 50].map((n) => <option key={n} value={n}>{n} / page</option>)}
                </select>
                <button disabled={data.meta.current_page <= 1} onClick={() => setPage((p) => p - 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-[#e8eaed] text-[#6b7280] disabled:opacity-40 hover:bg-[#f8f9fb]">‹</button>
                {pages.map((p, i) => p === "…"
                  ? <span key={`e${i}`} className="w-8 text-center text-[#9ca3af]">…</span>
                  : <button key={p} onClick={() => setPage(p as number)} className={`w-8 h-8 grid place-items-center rounded-lg text-[12px] font-semibold ${p === data.meta.current_page ? "bg-[#fe2c55] text-white" : "border border-[#e8eaed] text-[#374151] hover:bg-[#f8f9fb]"}`}>{p}</button>)}
                <button disabled={data.meta.current_page >= data.meta.last_page} onClick={() => setPage((p) => p + 1)} className="w-8 h-8 grid place-items-center rounded-lg border border-[#e8eaed] text-[#6b7280] disabled:opacity-40 hover:bg-[#f8f9fb]">›</button>
              </div>
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={!!del} danger title="Delete campaign"
        message={`Permanently delete "${del?.name ?? ""}"? This removes its ad groups and creatives and cannot be undone.`}
        confirmLabel="Delete campaign" loading={delM.isPending}
        onCancel={() => setDel(null)}
        onConfirm={() => { if (del) delM.mutate(del.id); }}
      />
    </AdminShell>
  );
}

/* Anchors the actions menu to the trigger button with fixed positioning so it
   escapes the table's overflow-x-auto clipping, and flips up when it would spill
   past the bottom of the viewport. */
function menuStyle(rect: DOMRect): React.CSSProperties {
  const W = 208; // w-52
  const H = 320; // generous estimate of the tallest menu
  const GAP = 6;
  const left = Math.max(8, Math.min(rect.right - W, window.innerWidth - W - 8));
  const openUp = rect.bottom + GAP + H > window.innerHeight && rect.top - GAP - H > 0;
  return openUp
    ? { left, bottom: window.innerHeight - rect.top + GAP }
    : { left, top: rect.bottom + GAP };
}

function MenuItem({ icon, label, onClick, danger }: { icon: React.ReactNode; label: string; onClick: () => void; danger?: boolean }) {
  return (
    <button onClick={onClick} className={`w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] hover:bg-[#f8f9fb] ${danger ? "text-red-600" : "text-[#374151]"}`}>
      <span className={danger ? "text-red-500" : "text-[#9ca3af]"}>{icon}</span>{label}
    </button>
  );
}

/** [1,2,3,…,13] style page list. */
function pageList(current: number, last: number): (number | "…")[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);
  const out: (number | "…")[] = [1];
  const s = Math.max(2, current - 1), e = Math.min(last - 1, current + 1);
  if (s > 2) out.push("…");
  for (let i = s; i <= e; i++) out.push(i);
  if (e < last - 1) out.push("…");
  out.push(last);
  return out;
}
