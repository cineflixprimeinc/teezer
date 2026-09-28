"use client";

/**
 * The verification review UI, shared between the applicant's 360 profile
 * (Verification tab) and the /verification queue (opened per-row).
 *
 * Extracted from users/[id]/page.tsx so both call sites share one
 * implementation instead of drifting apart. Takes a lightweight identity
 * shape rather than the full 360 profile object, since the queue only has
 * the row's own user relation, not a full U360 fetch.
 */

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck, CheckCircle2, Lock, MapPin, MessageSquare, ShieldOff,
  ShieldCheck, Star, UserCheck, AlertTriangle, Calendar, Eye, ChevronDown, X,
  Flag, Smartphone, DollarSign, Mail, FileText, Globe, RotateCcw, Camera,
  XCircle, ExternalLink, Info,
} from "lucide-react";

import { apiMessage } from "@/admin-panel/services/api";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { adminService } from "@/admin-panel/services/admin.service";

/**
 * Blue Verified plans, mirroring BV_PLANS on the web and in the app. `annual` and
 * `monthly` are legacy ids the API still accepts, so they are handled rather than
 * rendered as a raw string.
 */
const PLANS: Record<string, { name: string; price: string; cycle: string }> = {
  basic:    { name: "Blue Verified Basic",    price: "$5",  cycle: "Monthly" },
  plus:     { name: "Blue Verified Plus",     price: "$10", cycle: "Monthly" },
  business: { name: "Blue Verified Business", price: "$20", cycle: "Monthly" },
  monthly:  { name: "Blue Verified",          price: "-",   cycle: "Monthly" },
  annual:   { name: "Blue Verified",          price: "-",   cycle: "Annual"  },
};

/**
 * Canned reasons, so a reviewer doesn't have to compose the same sentence every day -
 * and so the applicant gets something specific and actionable instead of "rejected".
 * All of them are editable: the text lands in the box, it is not a fixed code.
 */
const REJECT_REASONS = [
  "The ID photo is too blurry to read. Please upload a clearer image.",
  "The selfie doesn't clearly match the photo on your ID.",
  "The name on your ID doesn't match the name on your account.",
  "The document you uploaded isn't a government-issued ID.",
  "The document has expired. Please upload a current one.",
  "Your account doesn't yet meet our authenticity requirements.",
];

const REVOKE_REASONS = [
  "Impersonation of another person or brand.",
  "The account changed identity after being verified.",
  "A community guidelines violation.",
  "Your Blue Verified subscription has ended.",
  "The badge was granted in error.",
];

export type VReq = {
  id: number;
  status: "draft" | "pending" | "approved" | "rejected";
  /** Where the applicant stopped in their own wizard - drives the progress strip. */
  verification_step: "plan_selected" | "account_checked" | "documents_uploaded" | null;
  /** Staff / official badge: never billed, never expires. Distinct from "no date known". */
  is_permanent: boolean;
  /** The badge was granted and later taken back. Not the same as never granted. */
  revoked_at: string | null;
  revoke_reason: string | null;
  plan_id: string | null;
  category: string | null;
  full_name: string | null;
  phone: string | null;
  brand_name: string | null;
  website: string | null;
  country: string | null;
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
  expires_at: string | null;
  document_url: string | null;
  selfie_url: string | null;
  supporting_doc_url: string | null;
  reviewer?: { id: number; name: string } | null;
};

/**
 * Pick a common reason, or write your own.
 *
 * The presets WRITE INTO the same box rather than being a separate coded value - so
 * whatever the admin sends is exactly what they can see, and they can edit a canned line
 * before it goes out. A hidden reason code that renders differently on the user's screen
 * is how apologies get sent for the wrong thing.
 */
function ReasonPicker({
  presets, value, onChange, placeholder,
}: {
  presets: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11.5px] font-semibold text-[#6b7280]">Common reasons</p>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => {
          const active = value.trim() === p;
          return (
            <button
              key={p}
              type="button"
              onClick={() => onChange(active ? "" : p)}
              className={`rounded-full border px-2.5 py-1 text-left text-[11.5px] font-medium transition ${
                active
                  ? "border-[#fd4605] bg-[#fff6f1] text-[#fd4605]"
                  : "border-[#e8eaed] text-[#6b7280] hover:border-[#d5d8dd] hover:bg-[#fbfbfc]"
              }`}
            >
              {p.length > 46 ? `${p.slice(0, 46)}…` : p}
            </button>
          );
        })}
      </div>

      <p className="mb-1.5 mt-3 text-[11.5px] font-semibold text-[#6b7280]">
        Reason sent to the user
      </p>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        maxLength={500}
        placeholder={placeholder}
        className="w-full rounded-[10px] border border-[#e8eaed] p-3 text-[13px] outline-none focus:border-[#fd4605]"
      />
      <p className="mt-1 text-right text-[11px] text-[#9ca3af]">{value.length}/500</p>
    </div>
  );
}

/** How the user is told. Both on by default - silence has to be chosen. */
function NotifyToggles({
  app, email, onApp, onEmail,
}: {
  app: boolean; email: boolean; onApp: (v: boolean) => void; onEmail: (v: boolean) => void;
}) {
  const Row = ({ on, set, Icon, label }: {
    on: boolean; set: (v: boolean) => void; Icon: React.ElementType; label: string;
  }) => (
    <button
      type="button"
      onClick={() => set(!on)}
      className={`flex flex-1 items-center gap-2 rounded-lg border px-2.5 py-2 text-[12px] font-semibold transition ${
        on ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-[#e8eaed] text-[#9ca3af]"
      }`}
    >
      <span className={`grid h-4 w-4 place-items-center rounded border ${
        on ? "border-emerald-500 bg-emerald-500" : "border-[#d1d5db]"
      }`}>
        {on && <CheckCircle2 size={10} className="text-white"/>}
      </span>
      <Icon size={13}/>
      {label}
    </button>
  );

  return (
    <div className="mt-3">
      <p className="mb-1.5 text-[11.5px] font-semibold text-[#6b7280]">Notify the user</p>
      <div className="flex gap-2">
        <Row on={app}   set={onApp}   Icon={MessageSquare} label="In-app"/>
        <Row on={email} set={onEmail} Icon={Mail}          label="Email"/>
      </div>
      {!app && !email && (
        <p className="mt-1.5 text-[11.5px] text-amber-700">
          The user will not be told. They&apos;ll only find out by noticing.
        </p>
      )}
    </div>
  );
}

/**
 * The verification review, shown either embedded in the applicant's 360
 * profile, or in a modal opened from the /verification queue.
 *
 * Laid out decision-first: the reviewer's job is to answer one question - is this
 * person who they say they are - so the answer to that question, and the evidence for
 * it, come before anything else. Billing and history sit underneath, where they inform
 * but don't compete.
 *
 * A user can apply more than once (a rejection can be re-applied for), so the newest
 * application is the subject of the page and the rest collapse into history. Only a
 * `pending` request is actionable - a draft was never submitted.
 */
export function VerificationReview({
  userId, username, isVerified, onChanged,
}: {
  userId: number;
  username: string;
  isVerified: boolean;
  /** Called after any approve/reject/revoke succeeds, in addition to this
      component's own cache invalidation - e.g. so a listing page showing
      counts/tabs can refresh too. */
  onChanged?: () => void;
}) {
  const qc = useQueryClient();
  const [rejecting, setRejecting] = useState<VReq | null>(null);
  const [approving, setApproving] = useState<VReq | null>(null);
  const [reason,    setReason]    = useState("");
  const [formError, setFormError] = useState("");
  const [revoking,  setRevoking]  = useState<VReq | null>(null);
  const [lightbox,  setLightbox]  = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  // Defaults to the billed badge. Granting a permanent one has to be a deliberate act,
  // not what happens when an admin taps Approve without reading.
  const [mode, setMode] = useState<"subscription" | "permanent">("subscription");
  // Telling the user is the default. Staying silent is the exception, and has to be
  // chosen - someone losing their badge should not find out by noticing.
  const [notifyApp,   setNotifyApp]   = useState(true);
  const [notifyEmail, setNotifyEmail] = useState(true);

  const notify = { app: notifyApp, email: notifyEmail };

  const qKey = ["admin-user-verifications", userId];

  const { data, isLoading } = useQuery({
    queryKey: qKey,
    queryFn: () => adminService.verifications({ user_id: userId, status: "all", per_page: 20 }),
  });

  const reqs: VReq[] = data?.data ?? [];

  const done = (msg: string) => {
    toast.success(msg);
    qc.invalidateQueries({ queryKey: qKey });
    // The badge flag lives on the USER, so anything showing it must refresh too.
    qc.invalidateQueries({ queryKey: ["admin-user-360", String(userId)] });
    onChanged?.();
    setApproving(null);
    setRejecting(null);
    setRevoking(null);
    setReason("");
    setFormError("");
    setNotifyApp(true);
    setNotifyEmail(true);
  };

  const approveM = useMutation({
    mutationFn: (id: number) => adminService.approveVerification(id, mode, notify),
    onSuccess: () => done(
      mode === "permanent"
        ? "Permanent verification granted. This badge does not expire."
        : "Verification approved.",
    ),
    onError: (e) => setFormError(apiMessage(e)),
  });

  const rejectM = useMutation({
    mutationFn: ({ id, why }: { id: number; why: string }) =>
      adminService.rejectVerification(id, why, notify),
    onSuccess: () => done("Application rejected."),
    onError: (e) => setFormError(apiMessage(e)),
  });

  const revokeM = useMutation({
    mutationFn: ({ id, why }: { id: number; why: string }) =>
      adminService.revokeVerification(id, why, notify),
    onSuccess: () => done("Verification badge removed."),
    onError: (e) => setFormError(apiMessage(e)),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-[132px] animate-pulse rounded-2xl bg-[#f1f2f4]"/>
        <div className="h-[92px]  animate-pulse rounded-2xl bg-[#f1f2f4]"/>
        <div className="h-[280px] animate-pulse rounded-2xl bg-[#f1f2f4]"/>
      </div>
    );
  }

  if (reqs.length === 0) {
    return (
      <div className="rounded-2xl border border-[#e8eaed] bg-white py-16 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#f4f5f7]">
          <BadgeCheck className="h-6 w-6 text-[#c9ccd1]"/>
        </div>
        <p className="mt-3 text-[15px] font-bold text-[#111827]">No verification application</p>
        <p className="mx-auto mt-1.5 max-w-[420px] text-[13px] leading-relaxed text-[#9ca3af]">
          {isVerified
            /* The Verify button in the profile header grants a badge without creating a
               request row. Say that plainly - a blank panel here would read as missing
               data. */
            ? "This user is verified, but never applied through the Blue Verified flow. The badge was granted directly using Verify in the profile header."
            : "This user hasn't applied for a verification badge."}
        </p>
      </div>
    );
  }

  const latest  = reqs[0];
  const history = reqs.slice(1);

  // A PERMANENT badge has no renewal by design. That is a different fact from "approved
  // before we tracked expiry, so we don't know the date" - and the two must never render
  // the same, or a staff badge would look like missing data.
  // Granted, then taken back. NOT the same as rejected (never granted) and not the same
  // as lapsed (ran out) - a revoked badge must never tell its former owner to renew.
  const revoked   = Boolean(latest.revoked_at);
  // The approve modal is doing double duty: a first approval, or giving back a badge
  // that was taken away. Say which, or the copy lies about what the button does.
  const restoring = Boolean(approving && approving.revoked_at);
  const permanent = latest.status === "approved" && latest.is_permanent && !revoked;
  const plan      = permanent ? null : (latest.plan_id ? PLANS[latest.plan_id] : null);
  const renews    = latest.status === "approved" && !permanent && !revoked ? latest.expires_at : null;
  const daysLeft  = renews ? Math.ceil((new Date(renews).getTime() - Date.now()) / 86_400_000) : null;
  const lapsed    = Boolean(daysLeft !== null && daysLeft < 0);

  const docs = [
    { label: "Government ID",  hint: "Passport, licence or national ID", url: latest.document_url,       Icon: FileText },
    { label: "Selfie",         hint: "Liveness check against the ID",    url: latest.selfie_url,         Icon: Camera   },
    { label: "Supporting doc", hint: "Optional",                          url: latest.supporting_doc_url, Icon: Star     },
  ];
  const present = docs.filter((d): d is typeof d & { url: string } => Boolean(d.url));

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString("en-US", { day: "numeric", month: "short", year: "numeric" }) : null;
  const fmtLong = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-US", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : null;

  /* The wizard the applicant actually walks through, and where they stopped. */
  const steps = [
    { label: "Plan chosen",     done: Boolean(latest.plan_id) },
    { label: "Account review",  done: latest.verification_step === "account_checked" || latest.verification_step === "documents_uploaded" || latest.status !== "draft" },
    { label: "Documents",       done: Boolean(latest.document_url && latest.selfie_url) },
    { label: "Submitted",       done: latest.status !== "draft" },
    { label: "Decision",        done: latest.status === "approved" || latest.status === "rejected" },
  ];

  const tone = revoked
    ? { label: "Badge removed", chip: "bg-rose-50 text-rose-700 ring-rose-200", dot: "bg-rose-500" }
    : {
        pending:  { label: "Pending review", chip: "bg-amber-50 text-amber-700 ring-amber-200",       dot: "bg-amber-500"   },
        approved: { label: "Approved",       chip: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500" },
        rejected: { label: "Rejected",       chip: "bg-rose-50 text-rose-700 ring-rose-200",          dot: "bg-rose-500"    },
        draft:    { label: "Draft - never submitted", chip: "bg-slate-100 text-slate-600 ring-slate-200", dot: "bg-slate-400" },
      }[latest.status];

  const actionable = latest.status === "pending";

  /* Share of the billing period already elapsed - the bar under the renewal date. */
  const periodPct = (() => {
    if (!renews || !latest.reviewed_at) return null;
    const start = new Date(latest.reviewed_at).getTime();
    const end   = new Date(renews).getTime();
    if (end <= start) return null;
    return Math.min(100, Math.max(0, ((Date.now() - start) / (end - start)) * 100));
  })();

  return (
    <div className="space-y-4">

      {/* ── Decision header ──────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
        <div className="flex flex-wrap items-center gap-4 p-5">
          <div className="relative">
            <div className={`grid h-14 w-14 place-items-center rounded-2xl ${isVerified ? "bg-[#1d9bf0]" : "bg-[#f1f2f4]"}`}>
              <BadgeCheck className={isVerified ? "h-7 w-7 text-white" : "h-7 w-7 text-[#c9ccd1]"}/>
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[16px] font-bold text-[#111827]">
                {isVerified ? "Verified creator" : "Not verified"}
              </p>
              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-semibold ring-1 ${tone.chip}`}>
                <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`}/>
                {tone.label}
              </span>
              {permanent && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#e8f4fd] px-2.5 py-1 text-[11.5px] font-semibold text-[#0b5d8f] ring-1 ring-[#c7e6fb]">
                  <Lock size={10}/> Permanent
                </span>
              )}
            </div>
            <p className="mt-1 text-[12.5px] text-[#6b7280]">
              {permanent
                ? "Staff badge · never expires"
                : plan
                  ? `${plan.name} · ${plan.price}${plan.price === "-" ? "" : ` / ${plan.cycle.toLowerCase()}`}`
                  : "No plan selected"}
              {" · "}
              Applied {fmt(latest.created_at)}
            </p>
          </div>

          {actionable ? (
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setFormError(""); setReason(""); setRejecting(latest); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8eaed] px-4 py-2 text-[13px] font-semibold text-[#374151] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
              >
                <XCircle size={14}/> Reject
              </button>
              <button
                onClick={() => { setFormError(""); setApproving(latest); }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#fd4605] px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#e03e04]"
              >
                <CheckCircle2 size={14}/> Approve
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-[11px] text-[#9ca3af]">
                  {latest.status === "draft" ? "Nothing to review" : "Reviewed"}
                </p>
                <p className="text-[12.5px] font-semibold text-[#374151]">
                  {latest.reviewed_at
                    ? `${fmt(latest.reviewed_at)}${latest.reviewer ? ` · ${latest.reviewer.name}` : ""}`
                    : "Applicant never submitted"}
                </p>
              </div>

              {/* Only a badge that is actually live can be taken back. */}
              {latest.status === "approved" && !revoked && isVerified && (
                <button
                  onClick={() => { setFormError(""); setReason(""); setRevoking(latest); }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#e8eaed] px-3.5 py-2 text-[13px] font-semibold text-[#374151] transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600"
                >
                  <ShieldOff size={14}/> Remove badge
                </button>
              )}

              {/* A revoked badge can be given back - a removal shouldn't be a dead end. */}
              {revoked && (
                <button
                  onClick={() => { setFormError(""); setMode(latest.is_permanent ? "permanent" : "subscription"); setApproving(latest); }}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-[#fd4605] px-3.5 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:bg-[#e03e04]"
                >
                  <ShieldCheck size={14}/> Restore badge
                </button>
              )}
            </div>
          )}
        </div>

        {/* Progress through the applicant's own wizard. */}
        <div className="flex items-center gap-1 overflow-x-auto border-t border-[#f0f1f3] bg-[#fbfbfc] px-5 py-3">
          {steps.map((s, i) => (
            <div key={s.label} className="flex flex-1 items-center gap-1">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-full ${s.done ? "bg-emerald-500" : "bg-[#dfe1e5]"}`}>
                  {s.done && <CheckCircle2 size={10} className="text-white"/>}
                </span>
                <span className={`truncate text-[11.5px] ${s.done ? "font-semibold text-[#374151]" : "text-[#9ca3af]"}`}>
                  {s.label}
                </span>
              </div>
              {i < steps.length - 1 && (
                <span className={`hidden h-px flex-1 sm:block ${s.done ? "bg-emerald-200" : "bg-[#e8eaed]"}`}/>
              )}
            </div>
          ))}
        </div>

        {latest.status === "rejected" && latest.rejection_reason && (
          <div className="flex items-start gap-2.5 border-t border-rose-100 bg-rose-50 px-5 py-3">
            <AlertTriangle size={15} className="mt-px flex-shrink-0 text-rose-500"/>
            <div>
              <p className="text-[12px] font-bold text-rose-700">Rejection reason shown to the applicant</p>
              <p className="mt-0.5 text-[12.5px] text-rose-900">{latest.rejection_reason}</p>
            </div>
          </div>
        )}

        {revoked && (
          <div className="flex items-start gap-2.5 border-t border-rose-100 bg-rose-50 px-5 py-3">
            <ShieldOff size={15} className="mt-px flex-shrink-0 text-rose-500"/>
            <div>
              <p className="text-[12px] font-bold text-rose-700">
                Badge removed {fmt(latest.revoked_at) ? `on ${fmt(latest.revoked_at)}` : ""}
              </p>
              <p className="mt-0.5 text-[12.5px] text-rose-900">
                {latest.revoke_reason ?? "No reason recorded."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* ── Billing ──────────────────────────────────────────────────────────── */}
      {revoked ? null : permanent ? (
        // No plan, no cycle, no countdown - there is nothing to bill. Showing an empty
        // "Billing" card with three dashes would imply data is missing when in fact
        // this badge is working exactly as intended.
        <div className="flex items-start gap-3 rounded-2xl border border-[#c7e6fb] bg-[#f2f9fe] p-5">
          <span className="grid h-9 w-9 flex-shrink-0 place-items-center rounded-xl bg-[#1d9bf0]">
            <Lock size={15} className="text-white"/>
          </span>
          <div>
            <p className="text-[13.5px] font-bold text-[#0b5d8f]">Permanent verification</p>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-[#2b7fb5]">
              Granted for staff, official and system accounts. This badge is not billed,
              has no renewal date, and never expires. To remove it, use Remove in the
              profile header.
            </p>
          </div>
        </div>
      ) : (
      <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#f0f1f3] px-5 py-3">
          <DollarSign size={14} className="text-[#9ca3af]"/>
          <p className="text-[13px] font-bold text-[#111827]">Billing</p>
        </div>

        <div className="grid gap-px bg-[#f0f1f3] sm:grid-cols-3">
          <div className="bg-white p-4">
            <p className="text-[11px] text-[#9ca3af]">Plan</p>
            <p className="mt-1 text-[15px] font-bold text-[#111827]">
              {plan ? plan.name.replace("Blue Verified ", "") : <span className="font-normal text-[#9ca3af]">None</span>}
            </p>
            {plan && <p className="text-[11.5px] text-[#6b7280]">{plan.price} · {plan.cycle}</p>}
          </div>

          <div className="bg-white p-4">
            <p className="text-[11px] text-[#9ca3af]">{lapsed ? "Expired on" : "Next billing cycle"}</p>
            <p className={`mt-1 text-[15px] font-bold ${lapsed ? "text-rose-600" : "text-[#111827]"}`}>
              {renews
                ? fmt(renews)
                /* Never derived. A badge approved before expiry tracking existed, or
                   granted directly from Security, genuinely has no date - and computing
                   "approved + 1 month" would be a confident claim about someone's money
                   that nothing in the system would honour. */
                : <span className="font-normal text-[#9ca3af]">Not available</span>}
            </p>
          </div>

          <div className="bg-white p-4">
            <p className="text-[11px] text-[#9ca3af]">Time remaining</p>
            <p className={`mt-1 text-[15px] font-bold ${lapsed ? "text-rose-600" : "text-[#111827]"}`}>
              {daysLeft === null
                ? <span className="font-normal text-[#9ca3af]">-</span>
                : lapsed
                  ? `Lapsed ${Math.abs(daysLeft)}d ago`
                  : daysLeft === 0 ? "Renews today" : `${daysLeft} day${daysLeft === 1 ? "" : "s"}`}
            </p>
            {periodPct !== null && (
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#f1f2f4]">
                <div
                  className={`h-full rounded-full ${lapsed ? "bg-rose-500" : "bg-emerald-500"}`}
                  style={{ width: `${lapsed ? 100 : periodPct}%` }}
                />
              </div>
            )}
          </div>
        </div>

        {!renews && isVerified && (
          <p className="border-t border-[#f0f1f3] bg-[#fbfbfc] px-5 py-2.5 text-[12px] text-[#6b7280]">
            No renewal date on record - this badge predates expiry tracking, or was granted
            directly rather than earned through the Blue Verified flow.
          </p>
        )}
      </div>
      )}

      {/* ── Documents ────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-[#f0f1f3] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileText size={14} className="text-[#9ca3af]"/>
            <p className="text-[13px] font-bold text-[#111827]">Identity documents</p>
          </div>
          <span className="text-[11.5px] text-[#9ca3af]">
            {present.length} of 3 provided
          </span>
        </div>

        <div className="p-5">
          {present.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#e0e2e6] py-12 text-center">
              <FileText className="mx-auto h-6 w-6 text-[#d1d5db]"/>
              <p className="mt-2 text-[13px] font-semibold text-[#6b7280]">No documents uploaded</p>
              <p className="mt-0.5 text-[12px] text-[#9ca3af]">
                {latest.status === "draft"
                  ? "The applicant hasn't reached the upload step yet."
                  : "There is nothing to verify this identity against."}
              </p>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {docs.map((d) => {
                const idx = present.findIndex((p) => p.label === d.label);
                const isPdf = Boolean(d.url && d.url.toLowerCase().split("?")[0].endsWith(".pdf"));

                return (
                  <div key={d.label} className="group overflow-hidden rounded-xl border border-[#e8eaed]">
                    <div className="flex items-center justify-between border-b border-[#f0f1f3] bg-[#fbfbfc] px-3 py-2">
                      <span className="flex items-center gap-1.5 text-[12px] font-semibold text-[#374151]">
                        <d.Icon size={12} className="text-[#9ca3af]"/>
                        {d.label}
                      </span>
                      {d.url && (
                        <a href={d.url} target="_blank" rel="noopener noreferrer"
                           onClick={(e) => e.stopPropagation()}
                           className="text-[#c9ccd1] transition hover:text-[#fd4605]">
                          <ExternalLink size={12}/>
                        </a>
                      )}
                    </div>

                    {!d.url ? (
                      <div className="flex h-44 flex-col items-center justify-center gap-1 bg-[#fbfbfc]">
                        <span className="text-[12px] font-semibold text-[#c9ccd1]">Not provided</span>
                        <span className="text-[11px] text-[#d1d5db]">{d.hint}</span>
                      </div>
                    ) : isPdf ? (
                      <a href={d.url} target="_blank" rel="noopener noreferrer"
                         className="flex h-44 flex-col items-center justify-center gap-2 bg-[#fbfbfc] text-[#6b7280] transition hover:bg-[#f4f5f7]">
                        <FileText size={26}/>
                        <span className="text-[12px] font-semibold">Open PDF</span>
                      </a>
                    ) : (
                      <button
                        onClick={() => setLightbox(idx)}
                        className="relative block h-44 w-full overflow-hidden bg-[#fbfbfc]"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={d.url} alt={d.label}
                             className="h-full w-full object-contain transition duration-300 group-hover:scale-[1.03]"/>
                        <span className="absolute inset-0 flex items-center justify-center bg-black/0 opacity-0 transition group-hover:bg-black/40 group-hover:opacity-100">
                          <span className="flex items-center gap-1.5 rounded-full bg-white/95 px-3 py-1.5 text-[11.5px] font-bold text-[#111827]">
                            <Eye size={12}/> Inspect
                          </span>
                        </span>
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* ── Applicant details ────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
        <div className="flex items-center gap-2 border-b border-[#f0f1f3] px-5 py-3">
          <Info size={14} className="text-[#9ca3af]"/>
          <p className="text-[13px] font-bold text-[#111827]">Declared details</p>
          <span className="ml-auto text-[11.5px] text-[#9ca3af]">What the documents must match</span>
        </div>

        <div className="grid gap-x-8 gap-y-0 px-5 py-1 sm:grid-cols-2">
          {[
            { k: "Full name",     v: latest.full_name,  Icon: UserCheck },
            { k: "Category",      v: latest.category,   Icon: Star },
            { k: "Brand / page",  v: latest.brand_name, Icon: Flag },
            { k: "Phone",         v: latest.phone,      Icon: Smartphone },
            { k: "Country",       v: latest.country,    Icon: MapPin },
            { k: "Website",       v: latest.website,    Icon: Globe },
            { k: "Applied",       v: fmtLong(latest.created_at), Icon: Calendar },
            { k: "Reviewed",      v: fmtLong(latest.reviewed_at), Icon: ShieldCheck },
          ].map(({ k, v, Icon }) => (
            <div key={k} className="flex items-center justify-between gap-3 border-b border-[#f4f5f7] py-2.5 last:border-0">
              <span className="flex items-center gap-2 text-[12.5px] text-[#6b7280]">
                <Icon size={13} className="text-[#c9ccd1]"/>
                {k}
              </span>
              <span className="truncate text-[12.5px] font-semibold text-[#111827]">
                {v || <span className="font-normal text-[#c9ccd1]">Not provided</span>}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Earlier applications ─────────────────────────────────────────────── */}
      {history.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
          <button
            onClick={() => setShowHistory((o) => !o)}
            className="flex w-full items-center justify-between px-5 py-3.5 transition hover:bg-[#fbfbfc]"
          >
            <span className="flex items-center gap-2">
              <RotateCcw size={14} className="text-[#9ca3af]"/>
              <span className="text-[13px] font-bold text-[#111827]">Earlier applications</span>
              <span className="rounded-full bg-[#f1f2f4] px-1.5 py-0.5 text-[10.5px] font-bold text-[#6b7280]">
                {history.length}
              </span>
            </span>
            <ChevronDown size={15} className={`text-[#9ca3af] transition ${showHistory ? "rotate-180" : ""}`}/>
          </button>

          {showHistory && (
            <div className="border-t border-[#f0f1f3]">
              {history.map((h) => (
                <div key={h.id} className="flex flex-wrap items-center gap-3 border-b border-[#f4f5f7] px-5 py-3 last:border-0">
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold capitalize ${
                    h.status === "approved" ? "bg-emerald-50 text-emerald-700"
                    : h.status === "rejected" ? "bg-rose-50 text-rose-700"
                    : "bg-slate-100 text-slate-600"
                  }`}>
                    {h.status}
                  </span>
                  <span className="text-[12.5px] text-[#6b7280]">Applied {fmt(h.created_at)}</span>
                  {h.rejection_reason && (
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#9ca3af]" title={h.rejection_reason}>
                      {h.rejection_reason}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Lightbox ─────────────────────────────────────────────────────────── */}
      {lightbox !== null && present[lightbox] && (
        <div
          className="fixed inset-0 z-[120] flex flex-col items-center justify-center bg-black/85 p-6"
          onClick={() => setLightbox(null)}
        >
          <div className="mb-3 flex w-full max-w-4xl items-center justify-between text-white">
            <p className="text-[13px] font-semibold">{present[lightbox].label}</p>
            <div className="flex items-center gap-3">
              <a
                href={present[lightbox].url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="flex items-center gap-1.5 text-[12px] font-semibold text-white/80 transition hover:text-white"
              >
                Open original <ExternalLink size={12}/>
              </a>
              <button onClick={() => setLightbox(null)} className="text-white/80 transition hover:text-white">
                <X size={18}/>
              </button>
            </div>
          </div>

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={present[lightbox].url}
            alt={present[lightbox].label}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[74vh] max-w-4xl rounded-xl bg-white object-contain shadow-2xl"
          />

          {/* Step between documents without closing - the whole point is comparing the
              selfie against the ID. */}
          {present.length > 1 && (
            <div className="mt-4 flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              {present.map((p, i) => (
                <button
                  key={p.label}
                  onClick={() => setLightbox(i)}
                  className={`rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition ${
                    i === lightbox ? "bg-white text-[#111827]" : "bg-white/15 text-white/80 hover:bg-white/25"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Decisions ────────────────────────────────────────────────────────── */}
      <ConfirmModal
        open={!!approving}
        title={restoring ? "Restore verification badge" : "Approve verification"}
        message={
          restoring
            ? "The badge was removed. Granting it again starts a fresh period from today, and clears the removal from their page."
            : "Choose how this badge is granted. This decides whether the creator ever has to renew."
        }
        confirmLabel={
          restoring
            ? "Restore badge"
            : mode === "permanent" ? "Grant permanent badge" : "Approve subscription"
        }
        loading={approveM.isPending}
        onCancel={() => { setApproving(null); setFormError(""); setMode("subscription"); }}
        onConfirm={() => approving && approveM.mutate(approving.id)}
      >
        <div className="mt-3 space-y-2">
          {([
            {
              key: "subscription" as const,
              Icon: DollarSign,
              title: "Subscription verification",
              body: approving?.plan_id && PLANS[approving.plan_id]
                ? `Runs for one ${PLANS[approving.plan_id].cycle.toLowerCase()} period from today. The creator must renew to keep the badge.`
                : "Runs for one billing period from today. The creator must renew to keep the badge.",
            },
            {
              key: "permanent" as const,
              Icon: Lock,
              title: "Permanent verification",
              body: "No plan, no billing, no expiry. For staff, official and system accounts only.",
            },
          ]).map(({ key, Icon, title, body }) => {
            const active = mode === key;
            return (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition ${
                  active
                    ? "border-[#fd4605] bg-[#fff6f1]"
                    : "border-[#e8eaed] hover:border-[#d5d8dd] hover:bg-[#fbfbfc]"
                }`}
              >
                <span className={`mt-0.5 grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border-2 ${
                  active ? "border-[#fd4605]" : "border-[#d1d5db]"
                }`}>
                  {active && <span className="h-1.5 w-1.5 rounded-full bg-[#fd4605]"/>}
                </span>
                <Icon size={14} className={`mt-0.5 flex-shrink-0 ${active ? "text-[#fd4605]" : "text-[#9ca3af]"}`}/>
                <span className="min-w-0">
                  <span className="block text-[12.5px] font-bold text-[#111827]">{title}</span>
                  <span className="mt-0.5 block text-[11.5px] leading-relaxed text-[#6b7280]">{body}</span>
                </span>
              </button>
            );
          })}
        </div>

        {mode === "permanent" && (
          <p className="mt-2.5 rounded-lg bg-amber-50 px-3 py-2 text-[11.5px] leading-relaxed text-amber-800">
            @{username} will keep this badge indefinitely, with nothing to pay and no
            review date. It can only be taken back with Remove badge.
          </p>
        )}

        <NotifyToggles app={notifyApp} email={notifyEmail} onApp={setNotifyApp} onEmail={setNotifyEmail}/>

        {formError && <p className="mt-2 text-[12.5px] text-rose-600">{formError}</p>}
      </ConfirmModal>

      {/* Revoke - a badge already granted, taken back. */}
      <ConfirmModal
        open={!!revoking}
        title="Remove verification badge?"
        message={`@${username} loses their badge immediately. They are shown the reason below.`}
        confirmLabel="Remove badge"
        danger
        loading={revokeM.isPending}
        onCancel={() => { setRevoking(null); setReason(""); setFormError(""); }}
        onConfirm={() => {
          if (!reason.trim()) { setFormError("A reason is required."); return; }
          if (revoking) revokeM.mutate({ id: revoking.id, why: reason.trim() });
        }}
      >
        <ReasonPicker
          presets={REVOKE_REASONS}
          value={reason}
          onChange={(v) => { setReason(v); setFormError(""); }}
          placeholder="Why is this badge being removed?"
        />
        <NotifyToggles app={notifyApp} email={notifyEmail} onApp={setNotifyApp} onEmail={setNotifyEmail}/>
        {formError && <p className="mt-1.5 text-[12.5px] text-rose-600">{formError}</p>}
      </ConfirmModal>

      {/* A reason is required - the applicant is shown this text verbatim in the app. */}
      <ConfirmModal
        open={!!rejecting}
        title="Reject verification?"
        message={`Tell @${username} why. They see this message on their own verification page.`}
        confirmLabel="Reject"
        danger
        loading={rejectM.isPending}
        onCancel={() => { setRejecting(null); setReason(""); setFormError(""); }}
        onConfirm={() => {
          if (!reason.trim()) { setFormError("A reason is required."); return; }
          if (rejecting) rejectM.mutate({ id: rejecting.id, why: reason.trim() });
        }}
      >
        <ReasonPicker
          presets={REJECT_REASONS}
          value={reason}
          onChange={(v) => { setReason(v); setFormError(""); }}
          placeholder="Tell them what to fix so they can apply again."
        />
        <NotifyToggles app={notifyApp} email={notifyEmail} onApp={setNotifyApp} onEmail={setNotifyEmail}/>
        {formError && <p className="mt-1.5 text-[12.5px] text-rose-600">{formError}</p>}
      </ConfirmModal>
    </div>
  );
}
