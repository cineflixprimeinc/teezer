"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BadgeCheck, Check, ChevronRight, CreditCard, FileText,
  Globe, Info, Loader2, Lock, Shield, ShieldCheck, User, X,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useAuthStore } from "@/store/auth.store";
import {
  studioService,
  type AccountCheck,
  type VerificationData,
} from "@/services/studio.service";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { StudioTopbarShared } from "./studio-topbar-shared";

const PLAN_MAP: Record<string, { name: string; price: string; period: string }> = {
  basic:    { name: "Blue Verified Basic",    price: "$5",  period: "/month" },
  plus:     { name: "Blue Verified Plus",     price: "$10", period: "/month" },
  business: { name: "Blue Verified Business", price: "$20", period: "/month" },
};

const CHECK_ROW_ICONS: Record<string, React.ReactNode> = {
  subscription:          <CreditCard  className="h-3.5 w-3.5" />,
  profile_completeness:  <User        className="h-3.5 w-3.5" />,
  account_authenticity:  <Shield      className="h-3.5 w-3.5" />,
  community_guidelines:  <ShieldCheck className="h-3.5 w-3.5" />,
  content_activity:      <FileText    className="h-3.5 w-3.5" />,
  public_presence:       <Globe       className="h-3.5 w-3.5" />,
  identity_readiness:    <BadgeCheck  className="h-3.5 w-3.5" />,
};


function StatusCircle({ status }: { status: AccountCheck["status"] }) {
  if (status === "passed" || status === "ready") {
    return (
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#16a34a]">
        <Check className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  if (status === "failed") {
    return (
      <div className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full bg-[#dc2626]">
        <X className="h-3.5 w-3.5 text-white" />
      </div>
    );
  }
  if (status === "checking") {
    return (
      <div className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-dashed border-[#2563eb] animate-spin" />
    );
  }
  return (
    <div className="h-6 w-6 flex-shrink-0 rounded-full border-2 border-[#e5e7eb] bg-white" />
  );
}

function StatusBadge({ status, label }: { status: AccountCheck["status"]; label: string }) {
  if (status === "passed")   return <span className="rounded-full bg-[#dcfce7] px-2.5 py-1 text-[11px] font-bold text-[#16a34a]">{label === "Blue Verified subscription" ? "Active" : label === "Profile completeness" ? "Completed" : "Passed"}</span>;
  if (status === "ready")    return <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-bold text-[#2563eb]">Ready</span>;
  if (status === "failed")   return <span className="rounded-full bg-[#fee2e2] px-2.5 py-1 text-[11px] font-bold text-[#dc2626]">Failed</span>;
  if (status === "checking") return <span className="rounded-full bg-[#eff6ff] px-2.5 py-1 text-[11px] font-bold text-[#2563eb]">Checking...</span>;
  return <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11px] font-bold text-[#9ca3af]">Pending</span>;
}

export function StudioVerificationAccountReviewPage() {
  const router      = useRouter();
  const queryClient = useQueryClient();
  const { isAuthenticated, authReady } = useAuthStore();

  const [collapsed,  setCollapsed]  = useState(false);
  const [dateRange,  setDateRange]  = useState({
    start: new Date(Date.now() - 6 * 86400000),
    end:   new Date(),
  });

  const [planId,        setPlanId]        = useState<string | null>(null);
  const [accountChecks, setAccountChecks] = useState<AccountCheck[]>([]);
  const [canProceed,    setCanProceed]    = useState(false);

  /* Auth guard */
  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
  }, [authReady, isAuthenticated, router]);

  /* Read plan from localStorage - display only, NOT used as a trigger */
  useEffect(() => {
    try {
      const stored = localStorage.getItem("blueVerifiedSelectedPlan");
      if (stored) {
        const parsed = JSON.parse(stored) as { id?: string };
        if (parsed?.id && PLAN_MAP[parsed.id]) setPlanId(parsed.id);
      }
    } catch {}
  }, []);

  /*
   * Always fetch fresh server state on mount (staleTime:0).
   * This is the source of truth for:
   *   1. Whether a valid draft exists (plan_selected / account_checked)
   *   2. The plan_id to display when localStorage is empty
   */
  const { data: vData, isFetching: vFetching } = useQuery<VerificationData>({
    queryKey: ["verification-status"],
    queryFn:  studioService.verification,
    enabled:  isAuthenticated,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  /* Sync planId from server (covers page refresh / empty localStorage) */
  useEffect(() => {
    if (vData?.plan_id && PLAN_MAP[vData.plan_id]) setPlanId(vData.plan_id);
  }, [vData]);

  /* Account check mutation */
  const checkedRef = useRef(false);
  /* Ensures we never validate before the first fetch cycle completes */
  const fetchStartedRef = useRef(false);

  const accountCheckMut = useMutation({
    mutationFn: studioService.verificationAccountCheck,
    onSuccess: (res) => {
      setAccountChecks(res.checks);
      const hardBlocked = res.checks.some(
        c => c.key === "community_guidelines" && c.status === "failed",
      );
      setCanProceed(!hardBlocked);
    },
    onError: (err: any) => {
      const msg: string = err?.response?.data?.message ?? "Account check failed.";
      toast.error(msg);
    },
  });

  /*
   * Gate account check on SERVER confirmation.
   * Only validates after at least one full fetch cycle to avoid acting on
   * stale React Query cache before the background refetch completes.
   */
  useEffect(() => {
    if (vFetching) {
      fetchStartedRef.current = true; // a fetch is in progress
      return;
    }
    if (!fetchStartedRef.current) return; // no fetch has started yet - too early
    if (vData === undefined) return;

    const validStep =
      vData?.verification_step === "plan_selected" ||
      vData?.verification_step === "account_checked";

    if (!vData || !validStep) {
      toast.error("Please choose a Blue Verified plan first.");
      router.replace("/studio/verification");
      return;
    }

    if (!checkedRef.current && !accountCheckMut.isPending) {
      checkedRef.current = true;
      accountCheckMut.mutate();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vFetching, vData]);

  function handleBack() {
    router.push("/studio/verification");
  }

  function handleNext() {
    if (!canProceed) return;
    void queryClient.invalidateQueries({ queryKey: ["verification-status"] });
    router.push("/studio/verification");
  }

  if (!authReady || !isAuthenticated) return <div className="min-h-screen bg-[#f8f9fb]" />;

  const isCheckRunning = vFetching || accountCheckMut.isPending;
  const plan   = planId ? PLAN_MAP[planId] : null;
  const passed = accountChecks.filter(c => c.status === "passed" || c.status === "ready").length;
  const total  = accountChecks.length || 7;

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper
        collapsed={collapsed}
        onToggle={() => setCollapsed(o => !o)}
        activeHref="/studio/verification"
      />

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <StudioTopbarShared
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
          searchPlaceholder="Search creators, videos, hashtags..."
        />

        {/* Page header */}
        <div className="flex-shrink-0 border-b border-[#f0f0f0] bg-white px-6 py-3.5">
          <div className="mb-1 flex items-center gap-1 text-[11.5px] text-[#9ca3af]">
            <button
              type="button"
              onClick={handleBack}
              className="transition hover:text-[#374151]"
            >
              Verification Center
            </button>
            <ChevronRight className="h-3 w-3" />
            <span className="text-[#374151]">Account Review</span>
          </div>
          <div className="flex items-center gap-2">
            <h1 className="text-[20px] font-black leading-tight text-[#111827]">Account Review</h1>
            <VerifiedBadge size={22} />
          </div>
          <p className="mt-0.5 text-[12px] text-[#6b7280]">
            We&apos;re checking your account eligibility for Blue Verified.
          </p>
        </div>

        {/* Scrollable body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="flex gap-4 px-5 py-4">

            {/* Main content */}
            <div className="min-w-0 flex-1 space-y-4">

              {/* Plan active banner */}
              {plan && (
                <div className="overflow-hidden rounded-[16px] border border-[#bfdbfe] bg-[#eff6ff]">
                  <div className="flex items-center justify-between px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#dbeafe]">
                        <VerifiedBadge size={20} />
                      </div>
                      <div>
                        <p className="text-[13px] font-extrabold text-[#1e3a8a]">Your Blue Verified plan is active</p>
                        <p className="text-[11px] text-[#3b5998]">{plan.name} · {plan.price}{plan.period}</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-[#dbeafe] px-3 py-1 text-[11px] font-bold text-[#1d4ed8]">
                      Account Review
                    </span>
                  </div>
                </div>
              )}

              {/* Account Eligibility Check card */}
              <div className="overflow-hidden rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
                <div className="border-b border-[#f3f4f6] px-5 py-3.5">
                  <p className="text-[14px] font-extrabold text-[#111827]">Account Eligibility Check</p>
                </div>

                <div className="divide-y divide-[#f3f4f6]">
                  {(accountChecks.length === 0 && !isCheckRunning
                    ? [
                        { key: "subscription",         label: "Blue Verified subscription",      status: "pending" as const, detail: null },
                        { key: "profile_completeness",  label: "Profile completeness",            status: "pending" as const, detail: null },
                        { key: "account_authenticity",  label: "Account authenticity",            status: "pending" as const, detail: null },
                        { key: "community_guidelines",  label: "Community guidelines",            status: "pending" as const, detail: null },
                        { key: "content_activity",      label: "Content & activity review",       status: "pending" as const, detail: null },
                        { key: "public_presence",       label: "Public presence",                 status: "pending" as const, detail: null },
                        { key: "identity_readiness",    label: "Identity verification readiness", status: "pending" as const, detail: null },
                      ]
                    : accountChecks
                  ).map((c, idx) => {
                    const displayStatus = isCheckRunning && c.status !== "passed" && c.status !== "ready"
                      ? "checking"
                      : c.status;
                    return (
                      <div key={c.key} className="flex items-center gap-3 px-5 py-3.5">
                        <StatusCircle status={displayStatus} />
                        <span className="w-5 flex-shrink-0 text-[11.5px] text-[#9ca3af]">{idx + 1}</span>
                        <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#f3f4f6] text-[#6b7280]">
                          {CHECK_ROW_ICONS[c.key] ?? <Shield className="h-3.5 w-3.5" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[12.5px] font-semibold text-[#374151]">{c.label}</p>
                          {c.detail && <p className="text-[11px] text-[#9ca3af]">{c.detail}</p>}
                        </div>
                        <StatusBadge status={displayStatus} label={c.label} />
                      </div>
                    );
                  })}
                </div>

                {/* Progress bar */}
                <div className="border-t border-[#f3f4f6] px-5 py-4">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-[#eff6ff]">
                        <Lock className="h-3.5 w-3.5 text-[#2563eb]" />
                      </div>
                      <div>
                        <p className="text-[12px] font-bold text-[#111827]">Your information is secure</p>
                        <p className="text-[10.5px] text-[#9ca3af]">We use industry-standard encryption to protect your data.</p>
                      </div>
                    </div>
                    <div className="flex flex-1 items-center gap-3">
                      <div className="h-2 flex-1 rounded-full bg-[#f3f4f6]">
                        <div
                          className="h-2 rounded-full bg-[#2563eb] transition-all"
                          style={{ width: `${Math.round((passed / total) * 100)}%` }}
                        />
                      </div>
                      <p className="flex-shrink-0 text-[11px] font-semibold text-[#374151]">
                        {passed} of {total} steps completed
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Info banner */}
              {(isCheckRunning || accountChecks.length > 0) && (
                <div className="flex items-center gap-3 rounded-[12px] border border-[#bfdbfe] bg-[#eff6ff] px-4 py-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-[#2563eb]">
                    <Info className="h-3.5 w-3.5 text-white" />
                  </div>
                  <p className="text-[12.5px] text-[#1e40af]">
                    {isCheckRunning
                      ? "We're checking your account now... This may take a few seconds. Please don't close this page."
                      : canProceed
                      ? "Account check complete! You can now proceed to upload your verification documents."
                      : "Some checks require your attention. Please resolve the issues above before continuing."}
                  </p>
                </div>
              )}

              {/* Footer buttons */}
              <div className="flex items-center justify-between gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleBack}
                  className="rounded-[12px] border border-[#e5e7eb] bg-white px-5 py-3 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f9fafb] active:scale-95"
                >
                  Back to Plans
                </button>
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={isCheckRunning || !canProceed}
                  className={cn(
                    "flex items-center gap-2 rounded-[12px] px-7 py-3 text-[13px] font-bold text-white shadow-sm transition active:scale-95",
                    canProceed && !isCheckRunning
                      ? "bg-[#fd4605] hover:bg-[#e03e04]"
                      : "bg-[#fd4605]/80 cursor-not-allowed",
                  )}
                >
                  {isCheckRunning && <Loader2 className="h-4 w-4 animate-spin" />}
                  Next: Upload Documents
                  {!canProceed && !isCheckRunning && <Lock className="h-4 w-4" />}
                  {canProceed && !isCheckRunning && <ChevronRight className="h-4 w-4" />}
                </button>
              </div>
            </div>

            {/* Right sidebar */}
            <div className="w-[260px] flex-shrink-0 space-y-4">

              {/* Subscription summary */}
              {plan && (
                <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
                  <div className="border-b border-[#f3f4f6] px-4 py-3">
                    <p className="text-[12.5px] font-extrabold text-[#111827]">Subscription Summary</p>
                  </div>
                  <div className="space-y-2.5 p-4">
                    {[
                      { k: "Plan",   v: `${plan.name} (Blue Verified)`, vc: "#111827" },
                      { k: "Price",  v: `${plan.price}${plan.period}`,  vc: "#111827" },
                      { k: "Status", v: "Account Review",               vc: "#1d4ed8" },
                    ].map(({ k, v, vc }) => (
                      <div key={k} className="flex items-center justify-between gap-2">
                        <span className="text-[11px] text-[#6b7280]">{k}</span>
                        <span className="text-right text-[11px] font-semibold" style={{ color: vc }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Verification status */}
              <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
                <div className="border-b border-[#f3f4f6] px-4 py-3">
                  <p className="text-[12.5px] font-extrabold text-[#111827]">Verification Status</p>
                </div>
                <div className="p-4">
                  <div className="flex items-center justify-between rounded-[10px] border border-[#bfdbfe] bg-[#eff6ff] px-3 py-2.5">
                    <span className="text-[12.5px] font-bold text-[#1d4ed8]">In Progress</span>
                    <div className="rounded-full bg-[#1d4ed822] px-2 py-0.5 text-[10px] font-bold text-[#1d4ed8]">
                      Step 2 of 4
                    </div>
                  </div>
                  <div className="mt-3 space-y-1.5">
                    {[
                      { n: 1, label: "Plan Selected",       done: true  },
                      { n: 2, label: "Account Review",       done: false },
                      { n: 3, label: "Documents Uploaded",   done: false },
                      { n: 4, label: "Submitted for Review", done: false },
                    ].map(row => (
                      <div key={row.n} className="flex items-center gap-2">
                        <div className={cn(
                          "flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full",
                          row.done ? "bg-[#16a34a]" : row.n === 2 ? "bg-[#fd4605]" : "bg-[#f3f4f6]",
                        )}>
                          {row.done
                            ? <Check className="h-2.5 w-2.5 text-white" />
                            : row.n === 2
                            ? <div className="h-1.5 w-1.5 rounded-full bg-white" />
                            : <div className="h-1.5 w-1.5 rounded-full bg-[#d1d5db]" />}
                        </div>
                        <span className={cn(
                          "text-[11px]",
                          row.done ? "text-[#16a34a] font-semibold" : row.n === 2 ? "font-semibold text-[#374151]" : "text-[#9ca3af]",
                        )}>
                          {row.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Why we check */}
              <div className="rounded-[14px] border border-[#f0f1f5] bg-white shadow-sm">
                <div className="border-b border-[#f3f4f6] px-4 py-3">
                  <p className="text-[12.5px] font-extrabold text-[#111827]">Why we check your account</p>
                </div>
                <div className="flex items-start gap-3 p-4">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-[#eff6ff]">
                    <Shield className="h-4 w-4 text-[#2563eb]" />
                  </div>
                  <p className="text-[11.5px] leading-relaxed text-[#6b7280]">
                    These checks help us keep Teezer safe, authentic, and trustworthy for everyone.
                    We verify to protect our community and maintain platform integrity.
                  </p>
                </div>
              </div>

              {/* Security notice */}
              <div className="flex items-center gap-2 rounded-[12px] border border-[#e5e7eb] bg-[#f8f9fb] px-3 py-2.5">
                <Lock className="h-3.5 w-3.5 flex-shrink-0 text-[#9ca3af]" />
                <p className="text-[10.5px] leading-snug text-[#9ca3af]">
                  Your data is protected with industry-standard encryption.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
