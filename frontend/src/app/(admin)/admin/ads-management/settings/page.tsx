"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody, CardHeader, CardTitle } from "@/admin-panel/components/ui/card";
import { Input, Select } from "@/admin-panel/components/ui/input";
import { adsService } from "@/admin-panel/services/ads.service";
import { apiMessage } from "@/admin-panel/services/api";

const NUM_FIELDS: { key: string; label: string }[] = [
  { key: "ads_default_cpm_cents", label: "Default CPM (cents)" },
  { key: "ads_floor_cpm_cents", label: "Floor CPM (cents)" },
  { key: "ads_min_daily_budget_cents", label: "Min daily budget (cents)" },
  { key: "ads_freqcap_session", label: "Frequency cap · per session" },
  { key: "ads_freqcap_day", label: "Frequency cap · per day" },
  { key: "ads_infeed_first_slot", label: "In-feed first slot" },
  { key: "ads_infeed_cadence", label: "In-feed cadence (every N)" },
  { key: "ads_revenue_share_pct", label: "Creator revenue share (%)" },
];

export default function AdsSettingsPage() {
  const qc = useQueryClient();
  const { data } = useQuery({ queryKey: ["ads-settings"], queryFn: adsService.settings });
  const [vals, setVals] = useState<Record<string, unknown>>({});

  useEffect(() => {
    if (data) {
      const m: Record<string, unknown> = {};
      Object.entries(data).forEach(([k, v]) => { m[k] = v.value; });
      setVals(m);
    }
  }, [data]);

  const save = useMutation({
    mutationFn: (p: { key: string; value: unknown }) => adsService.updateSetting(p.key, p.value),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ads-settings"] }); toast.success("Saved."); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const setLocal = (k: string, v: unknown) => setVals((s) => ({ ...s, [k]: v }));

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5 max-w-[720px]">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Ads System Settings</h2>
          <p className="text-[13px] text-[#6b7280]">Global controls. The master switch gates all feed ad insertion.</p>
        </div>

        <Card>
          <CardHeader><CardTitle>Delivery</CardTitle></CardHeader>
          <CardBody className="space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-[#111827]">Ads enabled</p>
                <p className="text-[12px] text-[#6b7280]">Master switch - inserts ads into the feed. Off = the feed is byte-identical.</p>
              </div>
              <Toggle on={!!vals.ads_enabled} onChange={(v) => { setLocal("ads_enabled", v); save.mutate({ key: "ads_enabled", value: v }); }} />
            </div>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[13px] font-semibold text-[#111827]">Review mode</p>
                <p className="text-[12px] text-[#6b7280]">Manual = admin approves each campaign. Auto = auto-approve after moderation.</p>
              </div>
              <Select
                value={String(vals.ads_review_mode ?? "manual")}
                onChange={(e) => { setLocal("ads_review_mode", e.target.value); save.mutate({ key: "ads_review_mode", value: e.target.value }); }}
              >
                <option value="manual">Manual</option>
                <option value="auto">Auto</option>
              </Select>
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Economics & pacing</CardTitle></CardHeader>
          <CardBody className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {NUM_FIELDS.map((f) => (
              <div key={f.key}>
                <label className="text-[12px] font-semibold text-[#374151]">{f.label}</label>
                <Input
                  type="number"
                  className="mt-1"
                  value={Number(vals[f.key] ?? 0)}
                  onChange={(e) => setLocal(f.key, e.target.value)}
                  onBlur={(e) => save.mutate({ key: f.key, value: Number(e.target.value) })}
                />
              </div>
            ))}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-[#fe2c55]" : "bg-[#e8eaed]"}`}
      aria-pressed={on}
    >
      <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
    </button>
  );
}
