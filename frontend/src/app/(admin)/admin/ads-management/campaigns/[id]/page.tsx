"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft, ChevronLeft, ChevronRight, Copy, BadgeCheck, ExternalLink, Check, X, RefreshCw,
  CheckCircle2, Rows3, Compass, Mail, Search, Hash, User, Play, Heart, MessageCircle, Share2, Music2,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { adsService, adMoney, type AdDetail } from "@/admin-panel/services/ads.service";
import { apiMessage } from "@/admin-panel/services/api";

/* ── maps ─────────────────────────────────────────────────────────────────── */
const CTA: Record<string, string> = {
  learn_more: "Learn More", shop_now: "Shop Now", sign_up: "Sign Up", download: "Download",
  watch_more: "Watch More", book_now: "Book Now", contact_us: "Contact Us", get_offer: "Get Offer",
  visit_website: "Visit Website", send_message: "Send Message", order_now: "Order Now",
  subscribe: "Subscribe", none: "No Button",
};
const OBJ: Record<string, string> = {
  conversions: "Conversions", traffic: "Traffic", reach: "Reach", awareness: "Awareness",
  video_views: "Video Views", engagement: "Engagement", followers: "Followers", sales: "Sales", app_installs: "App Installs",
};
const PLACEMENT: Record<string, { label: string; icon: React.ReactNode }> = {
  in_feed: { label: "Feed", icon: <Rows3 size={13} /> },
  explore: { label: "Explore", icon: <Compass size={13} /> },
  inbox: { label: "Inbox", icon: <Mail size={13} /> },
  search: { label: "Search", icon: <Search size={13} /> },
  hashtag: { label: "Hashtags", icon: <Hash size={13} /> },
  profile_top: { label: "Creator Profile", icon: <User size={13} /> },
};
const STATUS_CLS: Record<string, string> = {
  active: "bg-emerald-50 text-emerald-600", paused: "bg-amber-50 text-amber-600",
  completed: "bg-blue-50 text-blue-600", draft: "bg-gray-100 text-gray-500",
  rejected: "bg-red-50 text-red-600", pending_review: "bg-amber-50 text-amber-600",
  changes_requested: "bg-orange-50 text-orange-600",
};
const statusLabel = (s: string) => ({ pending_review: "Pending Review", changes_requested: "Needs Changes" } as Record<string, string>)[s] ?? s.replace(/_/g, " ");
const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "-";
const fmtDateTime = (iso: string | null) => iso ? `${fmtDate(iso)} ${new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}` : "-";

const TABS = ["Ad Information", "Targeting", "Creative Details", "History", "Activity Log"] as const;

/* ── page ─────────────────────────────────────────────────────────────────── */
export default function AdDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cid = Number(id);
  const router = useRouter();
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("Ad Information");
  const [notes, setNotes] = useState("");

  const { data: d, isLoading } = useQuery({ queryKey: ["ad-detail", cid], queryFn: () => adsService.campaignDetail(cid) });

  const done = (msg: string) => { qc.invalidateQueries({ queryKey: ["ad-detail", cid] }); qc.invalidateQueries({ queryKey: ["ads-approvals"] }); qc.invalidateQueries({ queryKey: ["ads-campaigns"] }); toast.success(msg); };
  const approveM = useMutation({ mutationFn: () => adsService.approve(cid), onSuccess: () => done("Approved & live."), onError: (e) => toast.error(apiMessage(e)) });
  const rejectM = useMutation({ mutationFn: () => adsService.reject(cid, notes.trim()), onSuccess: () => { setNotes(""); done("Campaign rejected."); }, onError: (e) => toast.error(apiMessage(e)) });
  const changesM = useMutation({ mutationFn: () => adsService.requestChanges(cid, notes.trim()), onSuccess: () => { setNotes(""); done("Changes requested."); }, onError: (e) => toast.error(apiMessage(e)) });

  const needReason = (fn: () => void) => { if (!notes.trim()) { toast.error("Add a note explaining the decision."); return; } fn(); };

  if (isLoading || !d) {
    return <AdminShell title="Ad Details"><div className="py-20 text-center text-[13px] text-[#9ca3af]">Loading…</div></AdminShell>;
  }

  const canReview = d.status === "pending_review" || d.status === "changes_requested";

  return (
    <AdminShell title="Ad Details">
      <div className="space-y-4">
        {/* Nav row */}
        <div className="flex items-center justify-end gap-2">
          <Link href="/admin/ads-management/approvals" className="flex items-center gap-1.5 border border-[#e8eaed] rounded-lg px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f8f9fb]"><ArrowLeft size={14} /> Back to Approvals</Link>
          <button disabled={!d.prev_id} onClick={() => d.prev_id && router.push(`/admin/ads-management/campaigns/${d.prev_id}`)} className="flex items-center gap-1 border border-[#e8eaed] rounded-lg px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f8f9fb] disabled:opacity-40"><ChevronLeft size={14} /> Previous</button>
          <button disabled={!d.next_id} onClick={() => d.next_id && router.push(`/admin/ads-management/campaigns/${d.next_id}`)} className="flex items-center gap-1 border border-[#e8eaed] rounded-lg px-3 py-2 text-[12px] font-medium text-[#374151] hover:bg-[#f8f9fb] disabled:opacity-40">Next <ChevronRight size={14} /></button>
        </div>

        {/* Top card */}
        <div className="bg-white rounded-2xl border border-[#eef0f3] p-5">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            {/* Preview */}
            <div className="xl:col-span-4">
              <div className="relative rounded-xl overflow-hidden bg-black aspect-video">
                {d.preview.video_url
                  ? <video src={d.preview.video_url} poster={d.preview.thumbnail_url ?? undefined} controls className="w-full h-full object-contain" />
                  : d.preview.thumbnail_url
                    ? <img src={d.preview.thumbnail_url} alt="" className="w-full h-full object-cover" />
                    : <div className="w-full h-full grid place-items-center text-white/40"><Play size={40} /></div>}
              </div>
              <div className="flex gap-2 mt-2">
                {[0, 1, 2, 3].map((i) => (
                  <div key={i} className={`w-1/4 aspect-video rounded-lg overflow-hidden bg-black ${i === 0 ? "ring-2 ring-[#fe2c55]" : "opacity-70"}`}>
                    {d.preview.thumbnail_url ? <img src={d.preview.thumbnail_url} alt="" className="w-full h-full object-cover" /> : null}
                  </div>
                ))}
              </div>
            </div>

            {/* Meta */}
            <div className="xl:col-span-4">
              <span className={`inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold ${STATUS_CLS[d.status] ?? "bg-gray-100 text-gray-500"}`}>{statusLabel(d.status)}</span>
              <h1 className="text-[20px] font-bold text-[#111827] mt-2 leading-tight">{d.name}</h1>
              <div className="flex items-center gap-1.5 text-[12px] text-[#9ca3af] mt-1">
                Ad ID: {d.ad_id}
                <button onClick={() => { navigator.clipboard?.writeText(d.ad_id); toast.success("Ad ID copied"); }} className="hover:text-[#374151]"><Copy size={12} /></button>
              </div>

              <div className="flex items-center gap-2 mt-3">
                {d.advertiser.avatar ? <img src={d.advertiser.avatar} className="w-8 h-8 rounded-full object-cover" alt="" /> : <div className="w-8 h-8 rounded-full bg-[#fe2c55] text-white grid place-items-center text-[13px] font-bold">{d.advertiser.name[0]}</div>}
                <div>
                  <div className="flex items-center gap-1 text-[13px] font-semibold text-[#111827]">{d.advertiser.name} {d.advertiser.is_verified && <BadgeCheck size={13} className="text-[#3b9aff]" />}</div>
                  {d.advertiser.username && <div className="text-[11px] text-[#9ca3af]">@{d.advertiser.username}</div>}
                </div>
                {d.advertiser.user_id && <Link href={`/admin/users/${d.advertiser.user_id}`} className="ml-auto text-[12px] font-semibold text-[#fe2c55]">View Advertiser Profile</Link>}
              </div>

              <div className="flex items-center gap-2 mt-4 text-[12.5px]">
                <span className="text-[#6b7280]">Objective</span>
                <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-purple-50 text-purple-600">{OBJ[d.objective] ?? d.objective}</span>
              </div>

              <div className="flex items-center gap-1.5 mt-3">
                {d.placements.slice(0, 4).map((p) => <span key={p} title={PLACEMENT[p]?.label} className="w-7 h-7 rounded-md border border-[#e8eaed] grid place-items-center text-[#374151]">{PLACEMENT[p]?.icon ?? <Rows3 size={13} />}</span>)}
                <span className="text-[12px] text-[#6b7280] ml-1">{d.placements.slice(0, 4).map((p) => PLACEMENT[p]?.label ?? p).join(", ")}{d.placements.length > 4 ? ` +${d.placements.length - 4} more` : ""}</span>
              </div>

              <div className="grid grid-cols-2 gap-4 mt-4">
                <div><p className="text-[11px] text-[#9ca3af]">Ad Format</p><p className="text-[13px] font-semibold text-[#111827]">{d.ad_format}</p></div>
                <div><p className="text-[11px] text-[#9ca3af]">Duration</p><p className="text-[13px] font-semibold text-[#111827]">{d.duration ? `${d.duration} seconds` : "-"}</p></div>
              </div>
            </div>

            {/* Facts */}
            <div className="xl:col-span-4">
              <div className="rounded-xl border border-[#eef0f3] p-4 grid grid-cols-3 gap-y-4 gap-x-3">
                <Fact label="Budget / Day" value={adMoney(d.budget.daily_cents)} />
                <Fact label="Total Budget" value={adMoney(d.budget.total_cents)} />
                <Fact label="Start Date" value={fmtDate(d.start_at)} />
                <Fact label="End Date" value={fmtDate(d.end_at)} />
                <Fact label="Bidding Strategy" value={d.bidding_strategy} />
                <Fact label="Status" value={statusLabel(d.status)} />
                <Fact label="Submitted On" value={fmtDateTime(d.submitted_at)} />
                <Fact label="Submitted By" value={d.submitted_by.name} sub={d.submitted_by.email ?? undefined} />
                <Fact label="Campaign Type" value={d.campaign_type} />
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-2xl border border-[#eef0f3]">
          <div className="flex items-center gap-1 px-4 border-b border-[#eef0f3]">
            {TABS.map((t) => (
              <button key={t} onClick={() => setTab(t)} className={`relative px-3 py-3 text-[13px] font-semibold ${tab === t ? "text-[#fe2c55]" : "text-[#6b7280] hover:text-[#111827]"}`}>
                {t}{tab === t && <span className="absolute left-3 right-3 -bottom-px h-0.5 rounded bg-[#fe2c55]" />}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "Ad Information" && (
              <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
                {/* Details */}
                <div className="xl:col-span-5">
                  <Row label="Ad Name" value={d.ad_info.ad_name} />
                  <Row label="Landing Page" value={d.ad_info.landing_page
                    ? <a href={d.ad_info.landing_page} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#111827] hover:text-[#fe2c55]">{d.ad_info.landing_page} <ExternalLink size={12} /></a>
                    : "-"} />
                  <Row label="Caption / Headline" value={d.ad_info.caption ?? "-"} />
                  <Row label="Description" value={d.ad_info.description ?? "-"} />
                  <Row label="Call To Action" value={d.ad_info.cta_type ? <span className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[#ffe4ec] text-[#fe2c55]">{CTA[d.ad_info.cta_type] ?? d.ad_info.cta_type}</span> : "-"} />
                  <Row label="Hashtags" value={d.ad_info.hashtags.length ? d.ad_info.hashtags.map((h) => `#${h.replace(/^#/, "")}`).join(" ") : "-"} />
                  <Row label="Language" value={d.ad_info.language} />
                  <Row label="Countries / Regions" value={d.ad_info.countries.length
                    ? <span>{d.ad_info.countries.slice(0, 3).join(", ")}{d.ad_info.countries.length > 3 && <span className="ml-1 text-[11px] text-[#fe2c55] font-semibold">+{d.ad_info.countries.length - 3} more</span>}</span>
                    : "All countries"} />
                  <Row label="Age Range" value={d.ad_info.age_range} />
                  <Row label="Gender" value={d.ad_info.gender} />
                  <Row label="Devices" value={d.ad_info.devices} last />
                </div>

                {/* Phone preview */}
                <div className="xl:col-span-4">
                  <p className="text-[13px] font-semibold text-[#374151] mb-3 flex items-center gap-1"><ArrowLeft size={13} /> Ad Preview <span className="text-[#9ca3af] font-normal">(How it will appear)</span></p>
                  <PhonePreview d={d} />
                </div>

                {/* Review */}
                <div className="xl:col-span-3 space-y-4">
                  <div>
                    <p className="text-[13px] font-semibold text-[#111827] mb-2">Review Notes</p>
                    <div className="relative">
                      <textarea value={notes} onChange={(e) => setNotes(e.target.value.slice(0, 500))} rows={4} placeholder="Add notes (optional)…" className="w-full rounded-xl border border-[#e8eaed] p-3 text-[13px] outline-none resize-none focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10" />
                      <span className="absolute bottom-2 right-3 text-[10px] text-[#9ca3af]">{notes.length} / 500</span>
                    </div>
                  </div>

                  <div>
                    <p className="text-[13px] font-semibold text-[#111827] mb-2">Review Actions</p>
                    <div className="space-y-2">
                      <button disabled={!canReview || approveM.isPending} onClick={() => approveM.mutate()} className="w-full rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white py-2.5 disabled:opacity-40">
                        <span className="flex items-center justify-center gap-1.5 text-[13px] font-bold"><Check size={15} /> Approve</span>
                        <span className="block text-[11px] opacity-90">Ad will go live and start delivering</span>
                      </button>
                      <button disabled={!canReview || rejectM.isPending} onClick={() => needReason(() => rejectM.mutate())} className="w-full rounded-xl bg-[#fe2c55] hover:bg-[#e0243d] text-white py-2.5 disabled:opacity-40">
                        <span className="flex items-center justify-center gap-1.5 text-[13px] font-bold"><X size={15} /> Reject</span>
                        <span className="block text-[11px] opacity-90">Ad will be rejected and not published</span>
                      </button>
                      <button disabled={!canReview || changesM.isPending} onClick={() => needReason(() => changesM.mutate())} className="w-full rounded-xl border border-[#e8eaed] hover:bg-[#f8f9fb] text-[#374151] py-2.5 disabled:opacity-40">
                        <span className="flex items-center justify-center gap-1.5 text-[13px] font-bold"><RefreshCw size={14} /> Request Changes</span>
                        <span className="block text-[11px] text-[#9ca3af]">Send back to advertiser for updates</span>
                      </button>
                    </div>
                  </div>

                  <div>
                    <p className="text-[13px] font-semibold text-[#111827] mb-2">Policy Check</p>
                    <div className="space-y-2">
                      {d.policy.map((p) => (
                        <div key={p.label} className="flex items-center gap-2 text-[12.5px]">
                          <CheckCircle2 size={15} className={p.pass ? "text-emerald-500" : "text-red-500"} />
                          <span className="flex-1 text-[#374151]">{p.label}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${p.pass ? "bg-emerald-50 text-emerald-600" : "bg-red-50 text-red-600"}`}>{p.pass ? "Pass" : "Fail"}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === "Targeting" && <TargetingTab d={d} />}
            {tab === "Creative Details" && <CreativeTab d={d} />}
            {tab === "History" && <HistoryTab d={d} />}
            {tab === "Activity Log" && <ActivityTab d={d} />}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

/* ── bits ─────────────────────────────────────────────────────────────────── */
function Fact({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div>
      <p className="text-[11px] text-[#9ca3af]">{label}</p>
      <p className="text-[13px] font-bold text-[#111827] leading-tight">{value}</p>
      {sub && <p className="text-[11px] text-[#9ca3af]">{sub}</p>}
    </div>
  );
}
function Row({ label, value, last }: { label: string; value: React.ReactNode; last?: boolean }) {
  return (
    <div className={`flex items-start gap-4 py-3 ${last ? "" : "border-b border-[#f4f5f7]"}`}>
      <span className="w-[130px] shrink-0 text-[12.5px] text-[#9ca3af]">{label}</span>
      <span className="flex-1 text-[13px] text-[#111827] break-words">{value}</span>
    </div>
  );
}

function PhonePreview({ d }: { d: AdDetail }) {
  const cta = d.creative.cta_type ? (CTA[d.creative.cta_type] ?? "Learn More") : "Learn More";
  return (
    <div className="mx-auto w-[240px] rounded-[28px] bg-black p-2 shadow-xl">
      <div className="relative rounded-[22px] overflow-hidden bg-neutral-900 aspect-[9/19]">
        {d.preview.thumbnail_url && <img src={d.preview.thumbnail_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-90" />}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30" />
        {/* top tabs */}
        <div className="relative flex items-center justify-center gap-3 pt-3 text-[10px] text-white/70 font-semibold">
          <span>Following</span><span className="text-white border-b-2 border-white pb-0.5">For You</span><span>Trending</span>
        </div>
        {/* right rail */}
        <div className="absolute right-2 bottom-16 flex flex-col items-center gap-3 text-white">
          <div className="w-8 h-8 rounded-full bg-white grid place-items-center text-[#fe2c55] text-[11px] font-bold">R</div>
          {[[<Heart key="h" size={18} />, "12.4K"], [<MessageCircle key="c" size={18} />, "356"], [<Share2 key="s" size={18} />, "742"]].map(([ic, n], i) => (
            <div key={i} className="flex flex-col items-center"><span>{ic}</span><span className="text-[9px]">{n as string}</span></div>
          ))}
          <Music2 size={16} />
        </div>
        {/* bottom copy */}
        <div className="absolute left-2 right-12 bottom-12 text-white">
          {d.advertiser.username && <div className="text-[11px] font-bold">@{d.advertiser.username}</div>}
          {d.creative.headline && <div className="text-[10.5px] leading-snug mt-0.5">{d.creative.headline}</div>}
          {d.creative.body && <div className="text-[10px] opacity-90 leading-snug">{d.creative.body}</div>}
          <span className="inline-block mt-1 text-[9px] bg-white/20 px-1.5 py-0.5 rounded">Sponsored</span>
        </div>
        {/* CTA */}
        <div className="absolute left-2 right-2 bottom-2">
          <div className="w-full bg-[#fe2c55] text-white text-[11px] font-bold py-1.5 rounded text-center">{cta} ›</div>
        </div>
      </div>
    </div>
  );
}

function TargetingTab({ d }: { d: AdDetail }) {
  const t = d.targeting as Record<string, unknown>;
  const entries = Object.entries(t);
  return (
    <div className="max-w-[640px]">
      <Row label="Countries / Regions" value={d.ad_info.countries.join(", ") || "All"} />
      <Row label="Age Range" value={d.ad_info.age_range} />
      <Row label="Gender" value={d.ad_info.gender} />
      <Row label="Devices" value={d.ad_info.devices} />
      <Row label="Interests" value={d.ad_info.interests.length ? d.ad_info.interests.join(", ") : "All interests"} last={entries.length === 0} />
      {entries.filter(([k]) => !["countries", "age_min", "age_max", "genders", "interests", "devices"].includes(k)).map(([k, v]) => (
        <Row key={k} label={k.replace(/_/g, " ")} value={typeof v === "object" ? JSON.stringify(v) : String(v)} />
      ))}
    </div>
  );
}
function CreativeTab({ d }: { d: AdDetail }) {
  return (
    <div className="max-w-[640px]">
      <Row label="Display Name" value={d.creative.display_name ?? "-"} />
      <Row label="Headline" value={d.creative.headline ?? "-"} />
      <Row label="Body" value={d.creative.body ?? "-"} />
      <Row label="Call To Action" value={d.creative.cta_type ? (CTA[d.creative.cta_type] ?? d.creative.cta_type) : "-"} />
      <Row label="Destination URL" value={d.creative.destination_url ?? "-"} />
      <Row label="Format" value={d.ad_format} last />
    </div>
  );
}
function HistoryTab({ d }: { d: AdDetail }) {
  if (!d.reviews.length) return <p className="text-[13px] text-[#9ca3af] py-6">No review history yet.</p>;
  return (
    <div className="space-y-3 max-w-[640px]">
      {d.reviews.map((r, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className={`w-2 h-2 rounded-full mt-1.5 ${r.decision === "approved" ? "bg-emerald-500" : r.decision === "rejected" ? "bg-red-500" : "bg-amber-500"}`} />
          <div className="flex-1">
            <p className="text-[13px] text-[#111827] capitalize font-medium">{r.decision.replace(/_/g, " ")}{r.reviewer ? ` · ${r.reviewer}` : ""}</p>
            {r.reason && <p className="text-[12px] text-[#6b7280]">{r.reason}</p>}
          </div>
          <span className="text-[11px] text-[#9ca3af]">{fmtDateTime(r.at)}</span>
        </div>
      ))}
    </div>
  );
}
function ActivityTab({ d }: { d: AdDetail }) {
  if (!d.activity.length) return <p className="text-[13px] text-[#9ca3af] py-6">No activity yet.</p>;
  return (
    <div className="space-y-3 max-w-[640px]">
      {d.activity.map((a, i) => (
        <div key={i} className="flex items-start gap-3">
          <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] mt-1.5" />
          <p className="flex-1 text-[13px] text-[#374151]">{a.text}</p>
          <span className="text-[11px] text-[#9ca3af]">{fmtDateTime(a.at)}</span>
        </div>
      ))}
    </div>
  );
}
