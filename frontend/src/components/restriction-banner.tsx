"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Clock, ShieldAlert } from "lucide-react";
import { useAuthStore } from "@/store/auth.store";
import { accountService, type ActiveRestriction } from "@/services/account.service";

interface Props {
  types: string[];
  className?: string;
}

export function RestrictionBanner({ types, className = "" }: Props) {
  const { isAuthenticated } = useAuthStore();

  const { data } = useQuery({
    queryKey: ["account-restrictions"],
    queryFn: () => accountService.restrictions(),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });

  const matches = (data?.active_restrictions ?? []).filter(
    (r: ActiveRestriction) => types.includes(r.type),
  );

  if (!matches.length) return null;

  return (
    <div className={`rounded-xl border border-[#fde68a] bg-[#fffbeb] p-3 ${className}`}>
      <div className="mb-2 flex items-center gap-1.5">
        <ShieldAlert className="h-3.5 w-3.5 flex-shrink-0 text-[#d97706]" />
        <p className="text-[12px] font-bold text-[#92400e]">
          {matches.length === 1 ? "Account Restriction Active" : "Account Restrictions Active"}
        </p>
      </div>
      <div className="flex flex-col gap-1.5">
        {matches.map((r: ActiveRestriction) => (
          <div
            key={r.type}
            className="flex items-start gap-2 rounded-[8px] border border-[#fde68a] bg-white px-2.5 py-2"
          >
            <Clock className="mt-0.5 h-3 w-3 flex-shrink-0 text-[#d97706]" />
            <div className="min-w-0 flex-1">
              <p className="text-[11.5px] font-bold text-[#111827]">{r.label}</p>
              {r.is_permanent ? (
                <p className="text-[10.5px] font-semibold text-[#dc2626]">Permanent - no expiry set</p>
              ) : r.time_remaining ? (
                <p className="text-[10.5px] text-[#92400e]">
                  <span className="font-semibold">{r.time_remaining} remaining</span>
                  {r.expires_at_label ? ` - until ${r.expires_at_label}` : ""}
                </p>
              ) : null}
              {r.reason && (
                <p className="mt-0.5 text-[10px] text-[#6b7280]">Reason: {r.reason}</p>
              )}
            </div>
          </div>
        ))}
      </div>
      <Link
        href="/settings/restrictions"
        className="mt-2 block text-center text-[10.5px] font-semibold text-[#d97706] hover:underline"
      >
        View restriction details &amp; countdown →
      </Link>
    </div>
  );
}
