"use client";

import { use, useState, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft, Save, Film, Settings2, DollarSign, Eye, ShieldAlert,
  AlertTriangle, RefreshCw, EyeOff, Trash2, ExternalLink, X,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Button } from "@/admin-panel/components/ui/button";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatCompact, formatDate, timeAgo } from "@/admin-panel/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────
type VideoMon = {
  eligibility_status: string; review_status: string;
  ad_revenue_sharing: boolean; creator_fund_active: boolean;
  tips_gifts_enabled: boolean; subscriptions_eligible: boolean;
  brand_partnerships_eligible: boolean; shop_product_tagging: boolean;
  paid_promotion_disclosure: string; affiliate_links_enabled: boolean;
  brand_deals_allowed: boolean; auto_claim_brand_mentions: boolean;
  total_earnings: number; revenue: number; next_payout: number;
  payout_currency: string; payout_status: string;
  allowed_regions: string[] | null; blocked_regions: string[] | null;
  policy_status: string; monetization_notes: string | null;
};

type VideoFull = {
  id: number; title: string | null; caption: string | null;
  category: string | null; location: string | null; language: string | null;
  video_url: string | null; thumbnail_url: string | null;
  duration: number | null; file_size: number | null; status: string;
  allow_comments: boolean; allow_replies: boolean; allow_duet: boolean;
  allow_stitch: boolean; allow_download: boolean; allow_sharing: boolean;
  allow_embedding: boolean; show_on_profile: boolean;
  age_restriction: string; content_label: string | null;
  sensitive_warning: boolean; notify_followers: boolean; send_push_after_publish: boolean;
  recommendation_eligible: boolean; search_indexing: boolean;
  region_allowed: string[] | null; region_blocked: string[] | null;
  shadowban_enabled: boolean; limited_distribution: boolean; limited_reason: string | null;
  review_priority: string; moderation_status: string | null;
  legal_hold: boolean; reporting_sensitivity: string;
  archive_status: string; auto_archive_after: string;
  admin_notes: string | null; audit_notes: string | null;
  is_flagged: boolean; is_pinned: boolean; is_ai_generated: boolean;
  content_check_status: string | null;
  views_count: number; likes_count: number; comments_count: number;
  saves_count: number; shares_count: number;
  created_at: string; updated_at: string; deleted_at: string | null;
  user: { id: number; name: string; username: string; avatar: string | null };
  hashtags: { id: number; name: string }[];
  monetization: VideoMon | null;
};

type TabKey = "details" | "settings" | "monetization" | "visibility" | "advanced";

// ── Style helpers ─────────────────────────────────────────────────────────────
const INPUT    = "w-full rounded-[10px] border border-[#e8eaed] px-3 h-9 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/20 focus:border-[#fe2c55] bg-white";
const TEXTAREA = "w-full rounded-[10px] border border-[#e8eaed] px-3 py-2 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/20 focus:border-[#fe2c55] bg-white resize-none";
const SELECT   = "w-full rounded-[10px] border border-[#e8eaed] px-3 h-9 text-[13px] focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/20 focus:border-[#fe2c55] bg-white cursor-pointer";
const CARD     = "bg-white rounded-2xl border border-[#e8eaed] shadow-sm overflow-hidden";
const SEC_HEAD = "px-5 py-3.5 border-b border-[#e8eaed]";
const ROW      = "flex items-center justify-between px-5 py-3 border-b border-[#f3f4f6] last:border-0";
const LABEL    = "text-[13px] font-medium text-[#374151]";
const SUB      = "text-[11px] text-[#9ca3af] mt-0.5";

// ── Sub-components ────────────────────────────────────────────────────────────
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`w-10 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${on ? "bg-[#fe2c55]" : "bg-[#d1d5db]"}`}
    >
      <span className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-4" : "translate-x-0"}`} />
    </button>
  );
}

function Field({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div>
      <label className="block text-[12px] font-semibold text-[#374151] mb-1.5">{label}</label>
      {sub && <p className="text-[11px] text-[#9ca3af] mb-1.5">{sub}</p>}
      {children}
    </div>
  );
}

function SectionHead({ title }: { title: string }) {
  return (
    <div className={SEC_HEAD}>
      <h3 className="text-[13px] font-bold text-[#111827]">{title}</h3>
    </div>
  );
}

// ── Details Tab ───────────────────────────────────────────────────────────────
function DetailsTab({ video, qk }: { video: VideoFull; qk: readonly unknown[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title:          video.title          ?? "",
    caption:        video.caption        ?? "",
    category:       video.category       ?? "",
    location:       video.location       ?? "",
    language:       video.language       ?? "",
    status:         video.status,
    is_flagged:     video.is_flagged,
    is_pinned:      video.is_pinned,
    is_ai_generated:video.is_ai_generated,
  });
  const [tags, setTags]         = useState(video.hashtags.map(h => h.name));
  const [tagInput, setTagInput] = useState("");

  const mut = useMutation({
    mutationFn: () => adminService.updateVideo(video.id, { ...form, hashtags: tags }),
    onSuccess: () => { toast.success("Details saved"); qc.invalidateQueries({ queryKey: [...qk] }); },
    onError:   () => toast.error("Failed to save"),
  });

  function addTag(raw: string) {
    const name = raw.replace(/^#/, "").trim().toLowerCase();
    if (name && !tags.includes(name)) setTags(t => [...t, name]);
    setTagInput("");
  }

  return (
    <div className="space-y-4">
      {/* Preview card */}
      {(video.thumbnail_url || video.video_url) && (
        <div className={CARD}>
          <SectionHead title="Preview" />
          <div className="p-4 flex gap-4 items-start">
            <div className="h-24 w-16 shrink-0 rounded-xl overflow-hidden bg-[#f3f4f6]">
              {video.thumbnail_url
                ? <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" />
                : <div className="h-full grid place-items-center text-[#9ca3af] text-[11px]">No thumb</div>}
            </div>
            <div className="space-y-1 flex-1 text-[12px]">
              <div className="flex flex-wrap gap-x-4 gap-y-0.5">
                {[["Views", video.views_count], ["Likes", video.likes_count], ["Comments", video.comments_count], ["Saves", video.saves_count]].map(([k, v]) => (
                  <span key={String(k)}><span className="text-[#9ca3af]">{k} </span><span className="font-semibold text-[#111827]">{formatCompact(Number(v))}</span></span>
                ))}
              </div>
              <p className="text-[#9ca3af]">
                By <a href={`/admin/users/${video.user.id}`} className="text-[#fe2c55] hover:underline">@{video.user.username}</a>
                {" · "}{timeAgo(video.created_at)}
              </p>
              {video.duration  != null && <p className="text-[#9ca3af]">Duration: {Math.floor(video.duration / 60)}:{String(video.duration % 60).padStart(2, "0")}</p>}
              {video.file_size != null && <p className="text-[#9ca3af]">Size: {(video.file_size / 1024 / 1024).toFixed(1)} MB</p>}
              {video.video_url && (
                <a href={video.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[#fe2c55] hover:underline">
                  <ExternalLink size={11}/>View video
                </a>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Basic info */}
      <div className={CARD}>
        <SectionHead title="Basic Info" />
        <div className="p-5 space-y-4">
          <Field label="Title">
            <input className={INPUT} value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} placeholder="Video title" />
          </Field>
          <Field label="Caption / Description">
            <textarea className={TEXTAREA} rows={3} value={form.caption} onChange={e => setForm(f => ({ ...f, caption: e.target.value }))} placeholder="Caption…" />
          </Field>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Category">
              <input className={INPUT} value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Dance" />
            </Field>
            <Field label="Location">
              <input className={INPUT} value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Mumbai, India" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Language">
              <input className={INPUT} value={form.language} onChange={e => setForm(f => ({ ...f, language: e.target.value }))} placeholder="e.g. en" />
            </Field>
            <Field label="Status">
              <select className={SELECT} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                <option value="published">Published</option>
                <option value="draft">Draft</option>
                <option value="private">Private</option>
                <option value="scheduled">Scheduled</option>
                <option value="removed">Removed</option>
              </select>
            </Field>
          </div>
        </div>
      </div>

      {/* Hashtags */}
      <div className={CARD}>
        <SectionHead title="Hashtags" />
        <div className="p-5 space-y-3">
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {tags.map(t => (
                <span key={t} className="flex items-center gap-1 text-[12px] bg-[#fff0f3] text-[#fe2c55] font-medium rounded-full px-2.5 py-1">
                  #{t}
                  <button type="button" onClick={() => setTags(ts => ts.filter(x => x !== t))} className="hover:text-red-700 leading-none">
                    <X size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <input
              className={INPUT}
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagInput); } }}
              placeholder="Type a hashtag and press Enter"
            />
            <Button variant="outline" size="sm" onClick={() => addTag(tagInput)}>Add</Button>
          </div>
        </div>
      </div>

      {/* Flags */}
      <div className={CARD}>
        <SectionHead title="Flags" />
        {([
          ["is_flagged",      "Flagged for Review", "Mark this video for manual admin review"],
          ["is_pinned",       "Pinned",             "Pin to the creator's profile top"],
          ["is_ai_generated", "AI-Generated",       "Content was created using AI tools"],
        ] as [keyof typeof form, string, string][]).map(([k, label, sub]) => (
          <div key={k} className={ROW}>
            <div><p className={LABEL}>{label}</p><p className={SUB}>{sub}</p></div>
            <Toggle on={form[k] as boolean} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
          <Save size={14} />{mut.isPending ? "Saving…" : "Save Details"}
        </Button>
      </div>
    </div>
  );
}

// ── Settings Tab ──────────────────────────────────────────────────────────────
function SettingsTab({ video, qk }: { video: VideoFull; qk: readonly unknown[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    allow_comments:         video.allow_comments,
    allow_replies:          video.allow_replies,
    allow_duet:             video.allow_duet,
    allow_stitch:           video.allow_stitch,
    allow_download:         video.allow_download,
    allow_sharing:          video.allow_sharing,
    allow_embedding:        video.allow_embedding,
    show_on_profile:        video.show_on_profile,
    sensitive_warning:      video.sensitive_warning,
    notify_followers:       video.notify_followers,
    send_push_after_publish:video.send_push_after_publish,
    is_ai_generated:        video.is_ai_generated,
    age_restriction:        video.age_restriction    ?? "none",
    content_label:          video.content_label      ?? "",
  });

  const mut = useMutation({
    mutationFn: () => adminService.updateVideoSettings(video.id, form),
    onSuccess: () => { toast.success("Settings saved"); qc.invalidateQueries({ queryKey: [...qk] }); },
    onError:   () => toast.error("Failed to save"),
  });

  const interactionToggles: [keyof typeof form, string, string][] = [
    ["allow_comments",  "Allow Comments",  "Users can comment on this video"],
    ["allow_replies",   "Allow Replies",   "Users can reply to comments"],
    ["allow_duet",      "Allow Duet",      "Other creators can duet this video"],
    ["allow_stitch",    "Allow Stitch",    "Other creators can stitch this video"],
    ["allow_download",  "Allow Download",  "Users can download this video"],
    ["allow_sharing",   "Allow Sharing",   "Video can be shared externally"],
    ["allow_embedding", "Allow Embedding", "Video can be embedded on other sites"],
    ["show_on_profile", "Show on Profile", "Visible on creator's public profile"],
  ];

  const contentToggles: [keyof typeof form, string, string][] = [
    ["sensitive_warning",       "Sensitive Content Warning", "Show a warning before playing"],
    ["notify_followers",        "Notify Followers",          "Send in-app notification to followers on publish"],
    ["send_push_after_publish", "Push Notification",         "Send push notification when published"],
    ["is_ai_generated",         "AI-Generated",              "This video was created using AI tools"],
  ];

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <SectionHead title="Interactions" />
        {interactionToggles.map(([k, label, sub]) => (
          <div key={k} className={ROW}>
            <div><p className={LABEL}>{label}</p><p className={SUB}>{sub}</p></div>
            <Toggle on={form[k] as boolean} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          </div>
        ))}
      </div>

      <div className={CARD}>
        <SectionHead title="Content Classification" />
        <div className={ROW}>
          <div><p className={LABEL}>Age Restriction</p><p className={SUB}>Minimum age required to view</p></div>
          <select
            className="rounded-[10px] border border-[#e8eaed] px-3 h-8 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/20 focus:border-[#fe2c55] bg-white"
            value={form.age_restriction}
            onChange={e => setForm(f => ({ ...f, age_restriction: e.target.value }))}
          >
            <option value="none">None</option>
            <option value="13+">13+</option>
            <option value="16+">16+</option>
            <option value="18+">18+</option>
          </select>
        </div>
        <div className={ROW}>
          <div><p className={LABEL}>Content Label</p><p className={SUB}>Optional label shown on the video</p></div>
          <input
            className="rounded-[10px] border border-[#e8eaed] px-3 h-8 text-[12px] w-36 focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/20 focus:border-[#fe2c55]"
            value={form.content_label}
            onChange={e => setForm(f => ({ ...f, content_label: e.target.value }))}
            placeholder="e.g. Mature"
          />
        </div>
        {contentToggles.map(([k, label, sub]) => (
          <div key={k} className={ROW}>
            <div><p className={LABEL}>{label}</p><p className={SUB}>{sub}</p></div>
            <Toggle on={form[k] as boolean} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          </div>
        ))}
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
          <Save size={14} />{mut.isPending ? "Saving…" : "Save Settings"}
        </Button>
      </div>
    </div>
  );
}

// ── Monetization Tab ──────────────────────────────────────────────────────────
function MonetizationTab({ video, qk }: { video: VideoFull; qk: readonly unknown[] }) {
  const qc = useQueryClient();
  const m = video.monetization;
  const [form, setForm] = useState({
    eligibility_status:          m?.eligibility_status          ?? "pending",
    review_status:               m?.review_status               ?? "not_reviewed",
    ad_revenue_sharing:          m?.ad_revenue_sharing          ?? false,
    creator_fund_active:         m?.creator_fund_active         ?? false,
    tips_gifts_enabled:          m?.tips_gifts_enabled          ?? false,
    subscriptions_eligible:      m?.subscriptions_eligible      ?? false,
    brand_partnerships_eligible: m?.brand_partnerships_eligible ?? false,
    shop_product_tagging:        m?.shop_product_tagging        ?? false,
    paid_promotion_disclosure:   m?.paid_promotion_disclosure   ?? "none",
    affiliate_links_enabled:     m?.affiliate_links_enabled     ?? false,
    brand_deals_allowed:         m?.brand_deals_allowed         ?? false,
    auto_claim_brand_mentions:   m?.auto_claim_brand_mentions   ?? false,
    payout_currency:             m?.payout_currency             ?? "USD",
    monetization_notes:          m?.monetization_notes          ?? "",
  });

  const mut = useMutation({
    mutationFn: () => adminService.updateVideoMonetization(video.id, form),
    onSuccess: () => { toast.success("Monetization saved"); qc.invalidateQueries({ queryKey: [...qk] }); },
    onError:   () => toast.error("Failed to save"),
  });

  const revenueToggles: [keyof typeof form, string, string][] = [
    ["ad_revenue_sharing",          "Ad Revenue Sharing",        "Enable ad revenue for this video"],
    ["creator_fund_active",         "Creator Fund",              "Include in creator fund payouts"],
    ["tips_gifts_enabled",          "Tips & Gifts",              "Allow viewers to send tips and gifts"],
    ["subscriptions_eligible",      "Subscription Revenue",      "Eligible for subscription earnings"],
    ["brand_partnerships_eligible", "Brand Partnerships",        "Allow brand partnership opportunities"],
    ["shop_product_tagging",        "Shop Product Tagging",      "Creator can tag products for shopping"],
    ["affiliate_links_enabled",     "Affiliate Links",           "Enable affiliate link monetization"],
    ["brand_deals_allowed",         "Brand Deals",               "Allow direct brand deal arrangements"],
    ["auto_claim_brand_mentions",   "Auto-Claim Brand Mentions", "Automatically claim brand mention revenue"],
  ];

  return (
    <div className="space-y-4">
      {m && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { k: "Total Earnings", v: `$${(m.total_earnings ?? 0).toFixed(2)}`, c: "#10b981" },
            { k: "Revenue",        v: `$${(m.revenue       ?? 0).toFixed(2)}`, c: "#3b82f6" },
            { k: "Next Payout",    v: `$${(m.next_payout   ?? 0).toFixed(2)}`, c: "#f59e0b" },
          ].map(({ k, v, c }) => (
            <div key={k} className="bg-white rounded-2xl border border-[#e8eaed] p-4 shadow-sm">
              <p className="text-[11px] text-[#9ca3af]">{k}</p>
              <p className="text-[20px] font-bold mt-0.5" style={{ color: c }}>{v}</p>
            </div>
          ))}
        </div>
      )}

      <div className={CARD}>
        <SectionHead title="Eligibility & Review" />
        <div className="grid grid-cols-2 gap-4 p-5">
          <Field label="Eligibility Status">
            <select className={SELECT} value={form.eligibility_status} onChange={e => setForm(f => ({ ...f, eligibility_status: e.target.value }))}>
              <option value="pending">Pending</option>
              <option value="eligible">Eligible</option>
              <option value="ineligible">Ineligible</option>
              <option value="suspended">Suspended</option>
            </select>
          </Field>
          <Field label="Review Status">
            <select className={SELECT} value={form.review_status} onChange={e => setForm(f => ({ ...f, review_status: e.target.value }))}>
              <option value="not_reviewed">Not Reviewed</option>
              <option value="under_review">Under Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
            </select>
          </Field>
        </div>
      </div>

      <div className={CARD}>
        <SectionHead title="Revenue Settings" />
        {revenueToggles.map(([k, label, sub]) => (
          <div key={k} className={ROW}>
            <div><p className={LABEL}>{label}</p><p className={SUB}>{sub}</p></div>
            <Toggle on={form[k] as boolean} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          </div>
        ))}
      </div>

      <div className={CARD}>
        <SectionHead title="Payout & Disclosure" />
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Payout Currency">
              <input className={INPUT} value={form.payout_currency} onChange={e => setForm(f => ({ ...f, payout_currency: e.target.value }))} placeholder="USD" />
            </Field>
            <Field label="Paid Promotion Disclosure">
              <select className={SELECT} value={form.paid_promotion_disclosure} onChange={e => setForm(f => ({ ...f, paid_promotion_disclosure: e.target.value }))}>
                <option value="none">None</option>
                <option value="disclosed">Disclosed</option>
                <option value="required">Required</option>
                <option value="pending_review">Pending Review</option>
              </select>
            </Field>
          </div>
          <Field label="Admin Notes" sub="Internal notes about monetization decisions">
            <textarea className={TEXTAREA} rows={2} value={form.monetization_notes} onChange={e => setForm(f => ({ ...f, monetization_notes: e.target.value }))} placeholder="Add notes…" />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
          <Save size={14} />{mut.isPending ? "Saving…" : "Save Monetization"}
        </Button>
      </div>
    </div>
  );
}

// ── Visibility Tab ────────────────────────────────────────────────────────────
function VisibilityTab({ video, qk }: { video: VideoFull; qk: readonly unknown[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    status:                  video.status,
    recommendation_eligible: video.recommendation_eligible,
    search_indexing:         video.search_indexing,
    show_on_profile:         video.show_on_profile,
    shadowban_enabled:       video.shadowban_enabled,
    limited_distribution:    video.limited_distribution,
    limited_reason:          video.limited_reason   ?? "",
    allow_sharing:           video.allow_sharing,
    allow_download:          video.allow_download,
    region_allowed:          (video.region_allowed  ?? []).join(", "),
    region_blocked:          (video.region_blocked  ?? []).join(", "),
  });

  const mut = useMutation({
    mutationFn: () => adminService.updateVideoVisibility(video.id, {
      ...form,
      region_allowed: form.region_allowed ? form.region_allowed.split(",").map(s => s.trim()).filter(Boolean) : null,
      region_blocked: form.region_blocked ? form.region_blocked.split(",").map(s => s.trim()).filter(Boolean) : null,
    }),
    onSuccess: () => { toast.success("Visibility saved"); qc.invalidateQueries({ queryKey: [...qk] }); },
    onError:   () => toast.error("Failed to save"),
  });

  const toggles: [keyof typeof form, string, string][] = [
    ["recommendation_eligible", "Recommendation Eligible", "Show in For You and Explore feeds"],
    ["search_indexing",         "Search Indexing",         "Appear in search results"],
    ["show_on_profile",         "Show on Profile",         "Visible on creator's public profile"],
    ["allow_sharing",           "Allow Sharing",           "Can be shared outside the app"],
    ["allow_download",          "Allow Download",          "Users can download this video"],
    ["shadowban_enabled",       "Shadowban",               "Reduce reach silently without notifying creator"],
    ["limited_distribution",    "Limited Distribution",    "Restrict algorithmic amplification"],
  ];

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <SectionHead title="Publish Status" />
        <div className={ROW}>
          <div><p className={LABEL}>Video Status</p><p className={SUB}>Controls who can see this video</p></div>
          <select
            className="rounded-[10px] border border-[#e8eaed] px-3 h-8 text-[12px] focus:outline-none focus:ring-2 focus:ring-[#fe2c55]/20 focus:border-[#fe2c55] bg-white"
            value={form.status}
            onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
          >
            <option value="published">Published</option>
            <option value="draft">Draft</option>
            <option value="private">Private</option>
            <option value="scheduled">Scheduled</option>
            <option value="removed">Removed</option>
          </select>
        </div>
      </div>

      <div className={CARD}>
        <SectionHead title="Distribution Controls" />
        {toggles.map(([k, label, sub]) => (
          <div key={k} className={ROW}>
            <div><p className={LABEL}>{label}</p><p className={SUB}>{sub}</p></div>
            <Toggle on={form[k] as boolean} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          </div>
        ))}
        {form.limited_distribution && (
          <div className="px-5 pb-4 pt-2">
            <Field label="Limited Distribution Reason">
              <input className={INPUT} value={form.limited_reason} onChange={e => setForm(f => ({ ...f, limited_reason: e.target.value }))} placeholder="Reason for limiting distribution…" />
            </Field>
          </div>
        )}
      </div>

      <div className={CARD}>
        <SectionHead title="Regional Distribution" />
        <div className="p-5 space-y-4">
          <Field label="Allowed Regions" sub="Comma-separated ISO country codes - leave blank for all regions">
            <input className={INPUT} value={form.region_allowed} onChange={e => setForm(f => ({ ...f, region_allowed: e.target.value }))} placeholder="e.g. US, IN, GB" />
          </Field>
          <Field label="Blocked Regions" sub="Comma-separated ISO country codes">
            <input className={INPUT} value={form.region_blocked} onChange={e => setForm(f => ({ ...f, region_blocked: e.target.value }))} placeholder="e.g. CN, RU" />
          </Field>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => mut.mutate()} disabled={mut.isPending} size="sm">
          <Save size={14} />{mut.isPending ? "Saving…" : "Save Visibility"}
        </Button>
      </div>
    </div>
  );
}

// ── Advanced Tab ──────────────────────────────────────────────────────────────
function AdvancedTab({ video, qk }: { video: VideoFull; qk: readonly unknown[] }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    moderation_status:       video.moderation_status       ?? "none",
    review_priority:         video.review_priority         ?? "normal",
    shadowban_enabled:       video.shadowban_enabled,
    recommendation_eligible: video.recommendation_eligible,
    legal_hold:              video.legal_hold,
    reporting_sensitivity:   video.reporting_sensitivity   ?? "normal",
    archive_status:          video.archive_status          ?? "active",
    auto_archive_after:      video.auto_archive_after      ?? "never",
    admin_notes:             video.admin_notes             ?? "",
    audit_notes:             video.audit_notes             ?? "",
  });
  const [unpublishModal,  setUnpublishModal]  = useState(false);
  const [safetyModal,     setSafetyModal]     = useState(false);
  const [reprocessModal,  setReprocessModal]  = useState(false);

  const saveMut = useMutation({
    mutationFn: () => adminService.updateVideoAdvanced(video.id, form),
    onSuccess: () => { toast.success("Advanced settings saved"); qc.invalidateQueries({ queryKey: [...qk] }); },
    onError:   () => toast.error("Failed to save"),
  });
  const unpublishMut = useMutation({
    mutationFn: () => adminService.unpublishVideo(video.id),
    onSuccess: () => { toast.success("Video unpublished"); setUnpublishModal(false); qc.invalidateQueries({ queryKey: [...qk] }); },
    onError:   () => toast.error("Failed to unpublish"),
  });
  const safetyMut = useMutation({
    mutationFn: () => adminService.runVideoSafetyCheck(video.id),
    onSuccess: () => { toast.success("Safety check triggered"); setSafetyModal(false); },
    onError:   () => toast.error("Failed to run safety check"),
  });
  const reprocessMut = useMutation({
    mutationFn: () => adminService.reprocessVideo(video.id),
    onSuccess: () => { toast.success("Reprocessing queued"); setReprocessModal(false); },
    onError:   () => toast.error("Failed to reprocess"),
  });

  return (
    <div className="space-y-4">
      <div className={CARD}>
        <SectionHead title="Moderation" />
        <div className="grid grid-cols-2 gap-4 p-5">
          <Field label="Moderation Status">
            <select className={SELECT} value={form.moderation_status} onChange={e => setForm(f => ({ ...f, moderation_status: e.target.value }))}>
              <option value="none">None</option>
              <option value="pending">Pending Review</option>
              <option value="approved">Approved</option>
              <option value="rejected">Rejected</option>
              <option value="flagged">Flagged</option>
              <option value="removed">Removed</option>
            </select>
          </Field>
          <Field label="Review Priority">
            <select className={SELECT} value={form.review_priority} onChange={e => setForm(f => ({ ...f, review_priority: e.target.value }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <Field label="Reporting Sensitivity">
            <select className={SELECT} value={form.reporting_sensitivity} onChange={e => setForm(f => ({ ...f, reporting_sensitivity: e.target.value }))}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
            </select>
          </Field>
          <Field label="Archive Status">
            <select className={SELECT} value={form.archive_status} onChange={e => setForm(f => ({ ...f, archive_status: e.target.value }))}>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
              <option value="scheduled">Scheduled</option>
            </select>
          </Field>
          <Field label="Auto Archive After">
            <select className={SELECT} value={form.auto_archive_after} onChange={e => setForm(f => ({ ...f, auto_archive_after: e.target.value }))}>
              <option value="never">Never</option>
              <option value="30d">30 Days</option>
              <option value="90d">90 Days</option>
              <option value="180d">180 Days</option>
              <option value="365d">1 Year</option>
            </select>
          </Field>
        </div>
        {([
          ["legal_hold",        "Legal Hold",  "Prevent any deletion or modification for legal reasons"],
          ["shadowban_enabled", "Shadowban",   "Limit visibility without notifying the creator"],
        ] as [keyof typeof form, string, string][]).map(([k, label, sub]) => (
          <div key={k} className={ROW}>
            <div><p className={LABEL}>{label}</p><p className={SUB}>{sub}</p></div>
            <Toggle on={form[k] as boolean} onChange={v => setForm(f => ({ ...f, [k]: v }))} />
          </div>
        ))}
      </div>

      <div className={CARD}>
        <SectionHead title="Admin Notes" />
        <div className="p-5 space-y-4">
          <Field label="Admin Notes" sub="Internal notes visible only to admins">
            <textarea className={TEXTAREA} rows={3} value={form.admin_notes} onChange={e => setForm(f => ({ ...f, admin_notes: e.target.value }))} placeholder="Internal observations about this video…" />
          </Field>
          <Field label="Audit Notes" sub="Reason for this change - will be logged">
            <textarea className={TEXTAREA} rows={2} value={form.audit_notes} onChange={e => setForm(f => ({ ...f, audit_notes: e.target.value }))} placeholder="Why are you making this change?" />
          </Field>
        </div>
      </div>

      {video.content_check_status && (
        <div className={CARD}>
          <SectionHead title="Content Check Status" />
          <div className="px-5 py-4">
            <span className={`text-[12px] font-semibold px-2.5 py-1 rounded-full ${
              video.content_check_status === "passed"  ? "bg-emerald-50 text-emerald-700"  :
              video.content_check_status === "failed"  ? "bg-red-50 text-red-700"          :
              "bg-amber-50 text-amber-700"
            }`}>
              {video.content_check_status}
            </span>
          </div>
        </div>
      )}

      <div className={CARD}>
        <SectionHead title="Quick Actions" />
        <div className="p-5 flex flex-wrap gap-2">
          <Button variant="warning" size="sm" onClick={() => setSafetyModal(true)}>
            <ShieldAlert size={13} />Run Safety Check
          </Button>
          <Button variant="outline" size="sm" onClick={() => setReprocessModal(true)}>
            <RefreshCw size={13} />Reprocess Video
          </Button>
          <Button variant="danger" size="sm" onClick={() => setUnpublishModal(true)}>
            <EyeOff size={13} />Unpublish
          </Button>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending} size="sm">
          <Save size={14} />{saveMut.isPending ? "Saving…" : "Save Advanced"}
        </Button>
      </div>

      <ConfirmModal
        open={unpublishModal}
        title="Unpublish Video"
        message="This will make the video private and remove it from all feeds. The creator will not be notified."
        confirmLabel="Unpublish"
        danger
        loading={unpublishMut.isPending}
        onConfirm={() => unpublishMut.mutate()}
        onCancel={() => setUnpublishModal(false)}
      />
      <ConfirmModal
        open={safetyModal}
        title="Run Safety Check"
        message="This queues a full AI safety scan. Results update within a few minutes."
        confirmLabel="Run Check"
        loading={safetyMut.isPending}
        onConfirm={() => safetyMut.mutate()}
        onCancel={() => setSafetyModal(false)}
      />
      <ConfirmModal
        open={reprocessModal}
        title="Reprocess Video"
        message="This will re-encode the video and regenerate thumbnails. May take several minutes."
        confirmLabel="Reprocess"
        loading={reprocessMut.isPending}
        onConfirm={() => reprocessMut.mutate()}
        onCancel={() => setReprocessModal(false)}
      />
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function VideoEditPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: rawId }  = use(params);
  const videoId        = Number(rawId);
  const router         = useRouter();
  const [tab, setTab]  = useState<TabKey>("details");
  const [deleteModal, setDeleteModal] = useState(false);
  const qk             = ["admin-video-edit", videoId] as const;

  const { data: video, isLoading, isError } = useQuery({
    queryKey: [...qk],
    queryFn: async () => {
      try {
        const result = await adminService.videoEditData(videoId);
        return result.video as VideoFull;
      } catch {
        return adminService.videoDetail(videoId) as Promise<VideoFull>;
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: () => adminService.removeVideo(videoId),
    onSuccess: () => { toast.success("Video removed"); router.push("/content"); },
    onError:   () => toast.error("Failed to remove video"),
  });

  const TABS: { key: TabKey; label: string; icon: ReactNode }[] = [
    { key: "details",      label: "Details",      icon: <Film       size={13} /> },
    { key: "settings",     label: "Settings",     icon: <Settings2  size={13} /> },
    { key: "monetization", label: "Monetization", icon: <DollarSign size={13} /> },
    { key: "visibility",   label: "Visibility",   icon: <Eye        size={13} /> },
    { key: "advanced",     label: "Advanced",     icon: <ShieldAlert size={13} /> },
  ];

  if (isLoading) {
    return (
      <AdminShell title="Edit Video">
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin h-8 w-8 rounded-full border-4 border-[#fe2c55] border-t-transparent" />
        </div>
      </AdminShell>
    );
  }

  if (isError || !video) {
    return (
      <AdminShell title="Edit Video">
        <div className="flex flex-col items-center justify-center h-64 gap-3">
          <AlertTriangle className="text-red-400" size={32} />
          <p className="text-[14px] text-[#6b7280]">Video not found or failed to load.</p>
          <Button variant="outline" size="sm" onClick={() => router.back()}>Go Back</Button>
        </div>
      </AdminShell>
    );
  }

  return (
    <AdminShell title={`Edit Video #${videoId}`}>
      <div className="space-y-5 max-w-3xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => router.back()}
              className="p-2 rounded-xl hover:bg-[#f4f5f7] text-[#6b7280] transition-colors shrink-0"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="min-w-0">
              <h2 className="text-[18px] font-bold text-[#111827] truncate">
                {video.title || video.caption?.slice(0, 50) || "Untitled Video"}
              </h2>
              <p className="text-[12px] text-[#9ca3af]">
                ID #{video.id} · @{video.user.username} · {formatDate(video.created_at)}
                {video.deleted_at && <span className="ml-2 text-red-500">Deleted</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="danger" size="sm" onClick={() => setDeleteModal(true)}>
              <Trash2 size={13} />Remove
            </Button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 bg-[#f9fafb] rounded-2xl p-1 border border-[#e8eaed]">
          {TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2 text-[12px] font-semibold rounded-xl transition-colors ${
                tab === t.key
                  ? "bg-white text-[#fe2c55] shadow-sm border border-[#e8eaed]"
                  : "text-[#6b7280] hover:text-[#374151]"
              }`}
            >
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        {tab === "details"      && <DetailsTab      video={video} qk={qk} />}
        {tab === "settings"     && <SettingsTab     video={video} qk={qk} />}
        {tab === "monetization" && <MonetizationTab video={video} qk={qk} />}
        {tab === "visibility"   && <VisibilityTab   video={video} qk={qk} />}
        {tab === "advanced"     && <AdvancedTab     video={video} qk={qk} />}
      </div>

      <ConfirmModal
        open={deleteModal}
        title="Remove Video"
        message="This soft-deletes the video and removes it from all feeds and search. The creator will not be notified."
        confirmLabel="Remove Video"
        danger
        loading={deleteMut.isPending}
        onConfirm={() => deleteMut.mutate()}
        onCancel={() => setDeleteModal(false)}
      />
    </AdminShell>
  );
}
