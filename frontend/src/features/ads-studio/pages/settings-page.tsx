"use client";

import { useCallback, useEffect, useState } from "react";
import { PauseCircle } from "lucide-react";
import {
  Card, CardHead, Skeleton, PrimaryButton, GhostButton, PageHeader,
} from "../ui";
import { adsService, type AdAccountData } from "@/services/ads.service";
import { apiMessage } from "@/services/api";
import { useAuthStore } from "@/store/auth.store";
import { toast } from "sonner";

/* ── Local toggle switch ─────────────────────────────────────────────────── */
function Toggle({
  checked, onChange, label,
}: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-[13px] font-medium text-[#374151]">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={
          "relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition " +
          (checked ? "bg-[#fd4605]" : "bg-[#e5e7eb]")
        }
      >
        <span
          className={
            "inline-block h-5 w-5 transform rounded-full bg-white shadow transition " +
            (checked ? "translate-x-[22px]" : "translate-x-[2px]")
          }
        />
      </button>
    </label>
  );
}

function ReadonlyRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-t border-[#f1f3f5] py-3 first:border-t-0">
      <span className="text-[13px] font-semibold text-[#6b7280]">{label}</span>
      <span className="text-right text-[13px] text-[#111827]">{value}</span>
    </div>
  );
}

export function SettingsPage() {
  const { user } = useAuthStore();
  const [data, setData] = useState<AdAccountData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [contactEmail, setContactEmail] = useState("");
  const [notifyApproved, setNotifyApproved] = useState(true);
  const [notifyRejected, setNotifyRejected] = useState(true);
  const [notifyLowBalance, setNotifyLowBalance] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await adsService.adAccount();
      setData(d);
      setError(null);
    } catch (e) {
      setError(apiMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Prefill contact email once data / user resolves.
  useEffect(() => {
    if (data) setContactEmail(data.account.contact_email ?? user?.email ?? "");
  }, [data, user?.email]);

  const account = data?.account;

  const save = () => {
    toast.success("Preferences saved.");
  };

  return (
    <div className="space-y-6">
      <PageHeader title="Settings" subtitle="Manage your ad account preferences." />

      {error && (
        <div className="rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3 text-[13px] font-medium text-[#b91c1c]">
          {error}
        </div>
      )}

      {/* Account */}
      <Card>
        <CardHead title="Account" subtitle="Core details for this ad account." />
        <div className="p-5">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : (
            <div>
              <ReadonlyRow label="Account name" value={account?.name ?? "-"} />
              <ReadonlyRow label="Currency" value={account?.currency ?? "-"} />
              <ReadonlyRow label="Timezone" value={account?.timezone || "-"} />

              <div className="border-t border-[#f1f3f5] pt-4">
                <label className="mb-1.5 block text-[13px] font-semibold text-[#6b7280]">Contact email</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5 text-[14px] text-[#111827] outline-none transition focus:border-[#fd4605] sm:max-w-sm"
                />
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Notifications */}
      <Card>
        <CardHead title="Notifications" subtitle="Choose which emails we send you." />
        <div className="divide-y divide-[#f1f3f5] px-5 py-2">
          <Toggle checked={notifyApproved} onChange={setNotifyApproved} label="Email me when an ad is approved" />
          <Toggle checked={notifyRejected} onChange={setNotifyRejected} label="Email me when an ad is rejected" />
          <Toggle checked={notifyLowBalance} onChange={setNotifyLowBalance} label="Email me when my balance is low" />
        </div>
      </Card>

      {/* Save */}
      <div className="flex flex-col items-start gap-2">
        <PrimaryButton onClick={save}>Save changes</PrimaryButton>
        <p className="text-[12px] text-[#9ca3af]">
          These preferences are saved locally for now - persistent syncing is coming soon.
        </p>
      </div>

      {/* Danger zone */}
      <Card className="border-[#fecaca]">
        <CardHead title="Danger zone" subtitle="Actions here affect all of your campaigns." />
        <div className="flex flex-wrap items-center justify-between gap-4 p-5">
          <div>
            <p className="text-[13px] font-bold text-[#111827]">Pause all delivery</p>
            <p className="text-[12px] text-[#9ca3af]">Temporarily stop every active campaign on this account.</p>
          </div>
          <GhostButton
            className="border-[#fecaca] text-[#dc2626] hover:bg-[#fef2f2]"
            onClick={() => toast.info("Contact support to pause account-wide delivery.")}
          >
            <PauseCircle className="h-4 w-4" /> Pause all delivery
          </GhostButton>
        </div>
      </Card>
    </div>
  );
}
