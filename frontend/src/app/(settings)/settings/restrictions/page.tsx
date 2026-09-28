"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { RefreshCw, ShieldAlert, ShieldCheck, AlertCircle, MessageSquare, FileText } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { accountService, type ActiveRestriction } from "@/services/account.service";
import { PageHeader } from "@/features/settings/settings-ui";

/* ── Live countdown from an ISO timestamp ───────────────────────────────── */
function useCountdown(expiresAt: string | null) {
  const [remaining, setRemaining] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    if (!expiresAt) { setRemaining(null); return; }
    function calc() {
      const diff = Math.max(0, new Date(expiresAt!).getTime() - Date.now());
      if (diff === 0) { setRemaining(null); return; }
      const s = Math.floor(diff / 1000);
      setRemaining({
        days:    Math.floor(s / 86400),
        hours:   Math.floor((s % 86400) / 3600),
        minutes: Math.floor((s % 3600) / 60),
        seconds: s % 60,
      });
    }
    calc();
    const t = setInterval(calc, 1000);
    return () => clearInterval(t);
  }, [expiresAt]);

  return remaining;
}

/* ── Single restriction card ─────────────────────────────────────────────── */
function RestrictionCard({ r }: { r: ActiveRestriction }) {
  const countdown = useCountdown(r.expires_at);
  const [appealOpen, setAppealOpen] = useState(false);

  const isMessaging = r.category === "messaging";

  return (
    <div className="rounded-2xl border border-[#fde68a] bg-white p-4 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
      {/* Header row */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${isMessaging ? "bg-[#f0f4ff]" : "bg-[#fff7ed]"}`}>
            <ShieldAlert className={`h-4 w-4 ${isMessaging ? "text-[#4f46e5]" : "text-[#d97706]"}`} />
          </span>
          <div>
            <p className="text-[13px] font-bold text-[#111827]">{r.label}</p>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={`rounded-full px-1.5 py-px text-[9px] font-bold uppercase tracking-wide ${
                isMessaging
                  ? "bg-[#e0e7ff] text-[#4f46e5]"
                  : "bg-[#fef9c3] text-[#92400e]"
              }`}>
                {isMessaging ? "Messaging" : "Account"}
              </span>
              {r.applied_at_label && (
                <p className="text-[10px] text-[#9ca3af]">Applied {r.applied_at_label}</p>
              )}
            </div>
          </div>
        </div>
        <span className={`flex-shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold ${
          r.is_permanent
            ? "bg-[#fee2e2] text-[#dc2626]"
            : "bg-[#fff7ed] text-[#d97706]"
        }`}>
          {r.is_permanent ? "Permanent" : "Temporary"}
        </span>
      </div>

      {/* Reason */}
      {r.reason && (
        <div className="mt-3 flex items-start gap-2 rounded-[8px] bg-[#fafbfc] border border-[#f0f1f5] px-3 py-2">
          <AlertCircle className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#9ca3af]" />
          <p className="text-[11.5px] text-[#374151]"><span className="font-semibold">Reason:</span> {r.reason}</p>
        </div>
      )}

      {/* Timing block */}
      {r.is_permanent ? (
        <div className="mt-3 rounded-[10px] border border-[#fecaca] bg-[#fff1f2] px-3 py-2.5">
          <p className="text-[12px] font-bold text-[#dc2626]">No expiry set</p>
          <p className="mt-0.5 text-[10.5px] text-[#ef4444]">
            This restriction is permanent until removed by Teezer.
          </p>
        </div>
      ) : countdown ? (
        <div className="mt-3">
          <p className="mb-1.5 text-[10.5px] font-semibold text-[#9ca3af]">TIME REMAINING</p>
          <div className="grid grid-cols-4 gap-2">
            {[
              { val: countdown.days,    label: "Days"    },
              { val: countdown.hours,   label: "Hours"   },
              { val: countdown.minutes, label: "Minutes" },
              { val: countdown.seconds, label: "Seconds" },
            ].map(({ val, label }) => (
              <div key={label} className="flex flex-col items-center rounded-[10px] border border-[#fde68a] bg-[#fffbeb] py-2.5">
                <span className="text-[22px] font-extrabold leading-none tabular-nums text-[#92400e]">
                  {String(val).padStart(2, "0")}
                </span>
                <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-[#b45309]">{label}</span>
              </div>
            ))}
          </div>
          {r.expires_at_label && (
            <p className="mt-2 text-center text-[11px] text-[#9ca3af]">
              Expires on <span className="font-semibold text-[#374151]">{r.expires_at_label}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="mt-3 rounded-[10px] border border-[#e8eaf0] bg-[#f8fafc] px-3 py-2.5">
          <p className="text-[11.5px] text-[#6b7280]">Expiry: {r.expires_at_label ?? "Unknown"}</p>
        </div>
      )}

      {/* Appeal/Contact actions */}
      <div className="mt-3 flex gap-2 border-t border-[#f0f1f5] pt-3">
        <a
          href="mailto:support@teezer.live?subject=Restriction%20Support"
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#e8eaf0] bg-[#f8fafc] px-3 py-2 text-[11px] font-semibold text-[#374151] transition-colors hover:border-[#374151] hover:bg-white"
        >
          <MessageSquare className="h-3 w-3" />
          Contact Support
        </a>
        <button
          onClick={() => setAppealOpen(!appealOpen)}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border border-[#e8eaf0] bg-[#fff7ed] px-3 py-2 text-[11px] font-semibold text-[#d97706] transition-colors hover:border-[#d97706] hover:bg-[#fffbeb]"
        >
          <FileText className="h-3 w-3" />
          File Appeal
        </button>
      </div>

      {/* Appeal placeholder */}
      {appealOpen && (
        <div className="mt-2 rounded-[8px] border border-[#fde68a] bg-[#fffbeb] px-3 py-2.5">
          <p className="text-[11.5px] font-semibold text-[#92400e]">Appeal this restriction</p>
          <p className="mt-0.5 text-[10.5px] text-[#b45309]">
            The appeal submission form is coming soon. In the meantime, email{" "}
            <a href="mailto:appeals@teezer.live" className="underline font-semibold">
              appeals@teezer.live
            </a>{" "}
            with your username and the restriction type above.
          </p>
        </div>
      )}
    </div>
  );
}

/* ── Page ───────────────────────────────────────────────────────────────── */
export default function RestrictionsPage() {
  const { isAuthenticated, authReady, openAuthModal } = useAuthStore();

  useEffect(() => {
    if (authReady && !isAuthenticated) openAuthModal("login");
  }, [authReady, isAuthenticated, openAuthModal]);

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["account-restrictions"],
    queryFn: () => accountService.restrictions(),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });

  const restrictions = data?.active_restrictions ?? [];

  if (authReady && !isAuthenticated) return null;

  return (
    <div className="flex flex-col gap-4 p-6">
      <div className="flex items-center justify-between">
        <PageHeader
          title="My Restrictions"
          subtitle="View active restrictions applied to your account by Teezer."
        />
        <button
          onClick={() => refetch()}
          disabled={isFetching}
          className="flex items-center gap-1.5 rounded-full border border-[#e8eaf0] bg-white px-3 py-1.5 text-[11px] font-semibold text-[#374151] transition-colors hover:border-[#fe2c55] hover:text-[#fe2c55] disabled:opacity-60"
        >
          <RefreshCw className={`h-3 w-3 ${isFetching ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {isFetching && restrictions.length === 0 ? (
        <div className="flex items-center justify-center py-16">
          <RefreshCw className="h-5 w-5 animate-spin text-[#d97706]" />
        </div>
      ) : restrictions.length === 0 ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#e8eaf0] bg-white py-16 shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
          <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[#d1fae5]">
            <ShieldCheck className="h-7 w-7 text-[#16a34a]" />
          </span>
          <p className="text-[15px] font-bold text-[#111827]">No Active Restrictions</p>
          <p className="max-w-xs text-center text-[12px] text-[#9ca3af]">
            Your account has no active restrictions. Keep following community guidelines to stay restriction-free.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[12px] font-semibold text-[#6b7280]">
            {restrictions.length} active restriction{restrictions.length !== 1 ? "s" : ""} -{" "}
            {restrictions.filter(r => r.category === "messaging").length} messaging,{" "}
            {restrictions.filter(r => r.category !== "messaging").length} account
          </p>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {restrictions.map((r) => (
              <RestrictionCard key={r.type} r={r} />
            ))}
          </div>
          <p className="mt-1 text-center text-[10.5px] text-[#9ca3af]">
            Use the <span className="font-semibold text-[#374151]">Contact Support</span> or{" "}
            <span className="font-semibold text-[#374151]">File Appeal</span> button on each restriction card for help.
          </p>
        </div>
      )}
    </div>
  );
}
