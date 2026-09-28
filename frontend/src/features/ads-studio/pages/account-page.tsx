"use client";

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { ExternalLink, UserPlus } from "lucide-react";
import {
  Card, CardHead, StatusPill, Skeleton, GhostButton, PageHeader,
} from "../ui";
import { money } from "../format";
import { adsService, type AdAccountData } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

function initials(name: string): string {
  return name.trim().split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function capitalize(v: string): string {
  return v.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#f1f3f5] px-5 py-3.5 first:border-t-0">
      <span className="text-[13px] font-semibold text-[#6b7280]">{label}</span>
      <span className="text-right text-[13px] text-[#111827]">{children}</span>
    </div>
  );
}

export function AccountPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<AdAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await adsService.adAccount());
      setError(null);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const account = data?.account;
  const currency = data?.currency ?? "USD";

  return (
    <div className="space-y-6">
      <PageHeader title="Account & Team" subtitle="Your profile, ad account details and team members." />

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Profile */}
      <Card>
        <CardHead title="Profile" subtitle="Your Teezer identity for this ad account." />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div className="flex items-center gap-4">
            {user?.avatar ? (
              <Image
                src={user.avatar}
                alt={user.name}
                width={64}
                height={64}
                unoptimized
                className="h-16 w-16 rounded-full object-cover"
              />
            ) : (
              <span className="grid h-16 w-16 place-items-center rounded-full bg-[#fff3ec] text-[20px] font-extrabold text-[#fd4605]">
                {user ? initials(user.name) : "?"}
              </span>
            )}
            <div>
              <p className="text-[17px] font-extrabold text-[#111827]">{user?.name ?? "-"}</p>
              <p className="text-[13px] text-[#6b7280]">@{user?.username ?? "-"}</p>
              {user?.email && <p className="text-[12px] text-[#9ca3af]">{user.email}</p>}
              {data?.account_number && <p className="mt-0.5 text-[11px] text-[#9ca3af] tabular-nums">Ad Account ID: {data.account_number}</p>}
            </div>
          </div>
          <GhostButton href="https://teezer.live">
            <ExternalLink className="h-4 w-4" /> Back to Teezer
          </GhostButton>
        </div>
      </Card>

      {/* Ad account details */}
      <Card>
        <CardHead title="Ad account details" subtitle="Configuration for this advertising account." />
        <div className="p-2 sm:p-3">
          {loading ? (
            <div className="space-y-2 p-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : (
            <div>
              <Row label="Ad Account ID"><span className="font-bold tabular-nums">{data?.account_number ?? "-"}</span></Row>
              <Row label="Account name">{account?.name ?? "-"}</Row>
              <Row label="Type">{account ? capitalize(account.type) : "-"}</Row>
              <Row label="Status">{account ? <StatusPill status={account.status} /> : "-"}</Row>
              <Row label="Currency">{account?.currency ?? currency}</Row>
              <Row label="Timezone">{account?.timezone || "-"}</Row>
              <Row label="Contact email">{account?.contact_email || user?.email || "-"}</Row>
              <Row label="Balance">
                <span className="font-bold tabular-nums">{money(data?.balance_cents, currency)}</span>
              </Row>
            </div>
          )}
        </div>
      </Card>

      {/* Team members */}
      <Card>
        <CardHead
          title="Team members"
          subtitle="People with access to this ad account."
          action={
            <GhostButton onClick={() => toast.info("Team invites are coming soon.")}>
              <UserPlus className="h-4 w-4" /> Invite teammate
            </GhostButton>
          }
        />
        <div className="p-5">
          <div className="flex items-center justify-between gap-4 rounded-xl border border-[#eef0f3] bg-[#f8f9fb] px-4 py-3.5">
            <div className="flex items-center gap-3">
              {user?.avatar ? (
                <Image
                  src={user.avatar}
                  alt={user.name}
                  width={40}
                  height={40}
                  unoptimized
                  className="h-10 w-10 rounded-full object-cover"
                />
              ) : (
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#fff3ec] text-[13px] font-extrabold text-[#fd4605]">
                  {user ? initials(user.name) : "?"}
                </span>
              )}
              <div>
                <p className="text-[13px] font-bold text-[#111827]">{user?.name ?? "-"}</p>
                <p className="text-[12px] text-[#9ca3af]">
                  @{user?.username ?? "-"}{user?.email ? ` · ${user.email}` : ""}
                </p>
              </div>
            </div>
            <span className="rounded-full bg-[#fff3ec] px-2.5 py-0.5 text-[11px] font-bold text-[#fd4605]">
              Owner
            </span>
          </div>
          <p className="mt-3 text-[12px] text-[#9ca3af]">
            Multi-user teams with roles and permissions are on the roadmap.
          </p>
        </div>
      </Card>
    </div>
  );
}
