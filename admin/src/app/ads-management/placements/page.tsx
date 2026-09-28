"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardBody } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { adsService, type PlacementRow } from "@/services/ads.service";
import { apiMessage } from "@/services/api";

export default function AdsPlacementsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["ads-placements"], queryFn: adsService.placements });

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5 max-w-[760px]">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Placements</h2>
          <p className="text-[13px] text-[#6b7280]">Enable ad surfaces and tune insertion cadence + price floor.</p>
        </div>
        {isLoading ? (
          <p className="text-[13px] text-[#9ca3af]">Loading…</p>
        ) : (
          <div className="space-y-3">
            {(data ?? []).map((p) => <PlacementCard key={p.id} placement={p} />)}
          </div>
        )}
      </div>
    </AdminShell>
  );
}

function PlacementCard({ placement }: { placement: PlacementRow }) {
  const qc = useQueryClient();
  const [firstSlot, setFirstSlot] = useState(placement.first_slot);
  const [cadence, setCadence] = useState(placement.cadence);
  const [floor, setFloor] = useState(placement.floor_cpm_cents);

  useEffect(() => {
    setFirstSlot(placement.first_slot);
    setCadence(placement.cadence);
    setFloor(placement.floor_cpm_cents);
  }, [placement]);

  const save = useMutation({
    mutationFn: (body: Partial<PlacementRow>) => adsService.updatePlacement(placement.id, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["ads-placements"] }); toast.success(`${placement.name} updated.`); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const dirty = firstSlot !== placement.first_slot || cadence !== placement.cadence || floor !== placement.floor_cpm_cents;

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[14px] font-bold text-[#111827]">{placement.name}</p>
            <p className="text-[12px] text-[#6b7280]">{placement.description}</p>
          </div>
          <Toggle on={placement.is_enabled} onChange={(v) => save.mutate({ is_enabled: v })} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Field label="First slot"><Input type="number" value={firstSlot} onChange={(e) => setFirstSlot(Number(e.target.value))} /></Field>
          <Field label="Cadence (every N)"><Input type="number" value={cadence} onChange={(e) => setCadence(Number(e.target.value))} /></Field>
          <Field label="Floor CPM (cents)"><Input type="number" value={floor} onChange={(e) => setFloor(Number(e.target.value))} /></Field>
        </div>
        {dirty && (
          <div className="flex justify-end">
            <Button size="sm" disabled={save.isPending} onClick={() => save.mutate({ first_slot: firstSlot, cadence, floor_cpm_cents: floor })}>Save changes</Button>
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
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
