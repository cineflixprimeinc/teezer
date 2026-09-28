"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  SlidersHorizontal, CheckCircle2, AlertTriangle, RefreshCw, History, Search,
  KeyRound, Users2, Upload, Radio, MessageSquare, UserCheck, CircleDollarSign,
  Clapperboard, Bell, ShieldAlert, ChevronDown, Loader2, X, Zap, PauseCircle,
  UserX, CloudOff, StopCircle, Compass, Flag,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { Toggle } from "@/admin-panel/components/ui/toggle";
import { ConfirmModal } from "@/admin-panel/components/ui/confirm-modal";
import { cn } from "@/admin-panel/lib/utils";
import {
  globalControlsService,
  type GlobalControl,
} from "@/admin-panel/services/global-controls.service";

const CATEGORY_ICON: Record<string, React.ElementType> = {
  authentication: KeyRound,
  user_activity: Users2,
  content: Upload,
  live_spaces: Radio,
  messaging: MessageSquare,
  account: UserCheck,
  monetization: CircleDollarSign,
  studio: Clapperboard,
  discovery: Compass,
  safety: Flag,
  notifications: Bell,
  emergency: ShieldAlert,
};

// Mirrors GlobalControlRegistry::isInverted() on the backend - these five
// keys have enabled=true AS the restrictive state (maintenance mode "on"
// stops the platform; block_new_accounts "on" blocks signups), everywhere
// else enabled=true means allowed. Getting this wrong here would silently
// batch a restrictive change into "Save Changes" instead of confirming it
// immediately, for block_new_accounts specifically (it isn't category
// "emergency", so a plain category check misses it).
const INVERTED_KEYS = ["maintenance_mode", "read_only_mode", "emergency_upload_block", "emergency_live_block", "block_new_accounts"];

const DURATIONS = [
  { label: "Until manually enabled", minutes: undefined },
  { label: "1 hour", minutes: 60 },
  { label: "6 hours", minutes: 360 },
  { label: "24 hours", minutes: 1440 },
  { label: "7 days", minutes: 10080 },
];

function errMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { message?: string; error?: { message?: string } } } };
  return e?.response?.data?.error?.message || e?.response?.data?.message || fallback;
}

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  return `${day} day${day === 1 ? "" : "s"} ago`;
}

type PendingAction =
  | { kind: "toggle"; key: string; label: string; enabled: boolean; requiresReason: boolean; offeringDuration: boolean; restrictive: boolean }
  | { kind: "category"; category: string; categoryLabel: string; enabled: boolean }
  | { kind: "stop-live" };

export default function GlobalReelsooControlPage() {
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState<string>("all");
  const [query, setQuery] = useState("");
  const [dirty, setDirty] = useState<Record<string, boolean>>({});
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [reason, setReason] = useState("");
  const [durationMinutes, setDurationMinutes] = useState<number | undefined>(undefined);
  const [showActivity, setShowActivity] = useState(false);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["global-controls"],
    queryFn: globalControlsService.list,
  });

  const { data: activity } = useQuery({
    queryKey: ["global-controls-activity"],
    queryFn: () => globalControlsService.activity(30),
    enabled: showActivity,
  });

  const categories = data?.categories ?? {};
  const status = data?.status;

  const updateMutation = useMutation({
    mutationFn: ({ key, enabled, r, d }: { key: string; enabled: boolean; r?: string; d?: number }) =>
      globalControlsService.update(key, enabled, r, d),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["global-controls"] });
      qc.invalidateQueries({ queryKey: ["global-controls-activity"] });
    },
  });

  const bulkMutation = useMutation({
    mutationFn: ({ category, enabled, r }: { category: string; enabled: boolean; r?: string }) =>
      globalControlsService.bulkCategory(category, enabled, r),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["global-controls"] });
      qc.invalidateQueries({ queryKey: ["global-controls-activity"] });
    },
  });

  const stopLiveMutation = useMutation({
    mutationFn: (r?: string) => globalControlsService.stopActiveLiveStreams(r),
    onSuccess: (res) => {
      toast.success(`${res.stopped.length} live stream(s) stopped.`);
      qc.invalidateQueries({ queryKey: ["global-controls-activity"] });
    },
  });

  function effectiveValue(c: GlobalControl): boolean {
    return dirty[c.key] ?? c.enabled;
  }

  function requestToggle(c: GlobalControl, next: boolean) {
    // Turning a critical control OFF (or ON for emergency-category switches,
    // where "on" IS the restrictive direction) always confirms immediately -
    // never batched, per spec §27. Everything else batches into "Save
    // Changes" so an admin isn't forced through a confirm dialog for
    // Everyday toggles, per spec §49.
    const isRestrictive = INVERTED_KEYS.includes(c.key) ? next : !next;
    if (c.critical && isRestrictive) {
      setPending({
        kind: "toggle", key: c.key, label: c.label, enabled: next,
        requiresReason: c.requiresReason, offeringDuration: isRestrictive, restrictive: isRestrictive,
      });
      setReason("");
      setDurationMinutes(undefined);
      return;
    }

    setDirty((d) => ({ ...d, [c.key]: next }));
  }

  async function saveDirty() {
    const entries = Object.entries(dirty);
    if (entries.length === 0) return;

    const results = await Promise.allSettled(
      entries.map(([key, enabled]) => updateMutation.mutateAsync({ key, enabled })),
    );
    const failed = results.filter((r) => r.status === "rejected").length;

    if (failed === 0) {
      toast.success(`${entries.length} control${entries.length === 1 ? "" : "s"} updated.`);
    } else {
      toast.error(`${failed} of ${entries.length} changes failed to save.`);
    }
    setDirty({});
  }

  function confirmPending() {
    if (!pending) return;

    if (pending.kind === "toggle") {
      if (pending.requiresReason && !reason.trim()) {
        toast.error("A reason is required for this change.");
        return;
      }
      updateMutation.mutate(
        { key: pending.key, enabled: pending.enabled, r: reason.trim() || undefined, d: durationMinutes },
        {
          onSuccess: () => { toast.success(`${pending.label} updated.`); setPending(null); },
          onError: (e) => toast.error(errMessage(e, "Couldn't save that change.")),
        },
      );
    } else if (pending.kind === "category") {
      bulkMutation.mutate(
        { category: pending.category, enabled: pending.enabled, r: reason.trim() || undefined },
        {
          onSuccess: (res) => { toast.success(`${res.changed.length} controls updated.`); setPending(null); },
          onError: (e) => toast.error(errMessage(e, "Couldn't apply that change.")),
        },
      );
    } else if (pending.kind === "stop-live") {
      stopLiveMutation.mutate(reason.trim() || undefined, {
        onSuccess: () => setPending(null),
        onError: (e) => toast.error(errMessage(e, "Couldn't stop live streams.")),
      });
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.controls ?? []).filter((c) => {
      const inTab = activeTab === "all" || c.category === activeTab;
      if (!q) return inTab;
      const matches = c.label.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.key.includes(q);
      return matches && (activeTab === "all" || inTab);
    });
  }, [data, activeTab, query]);

  const grouped = useMemo(() => {
    const out: Record<string, GlobalControl[]> = {};
    for (const c of filtered) {
      (out[c.category] ??= []).push(c);
    }
    return out;
  }, [filtered]);

  const dirtyCount = Object.keys(dirty).length;
  const latestChange = activity?.[0];

  return (
    <AdminShell title="Global Teezer Control">
      <div className="space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fff3ec] text-[#fd4605]">
              <SlidersHorizontal className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-[20px] font-extrabold text-[#111827]">Global Teezer Control</h1>
              <p className="mt-0.5 max-w-xl text-[13px] text-[#6b7280]">
                Control platform-wide user capabilities from one place. Changes apply globally across the
                Teezer Website, Android, iOS and backend services.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={() => setShowActivity(true)}>
              <History className="h-4 w-4" /> View Activity
            </Button>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} /> Refresh
            </Button>
            <Button variant="primary" onClick={saveDirty} disabled={dirtyCount === 0 || updateMutation.isPending}>
              {updateMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Save Changes{dirtyCount > 0 ? ` (${dirtyCount})` : ""}
            </Button>
          </div>
        </div>

        {/* Global Status Card */}
        <Card className="p-5">
          {isLoading ? (
            <div className="h-16 animate-pulse rounded-xl bg-[#f4f5f7]" />
          ) : isError ? (
            <div className="flex items-center justify-between">
              <p className="text-[13px] text-red-600">Unable to load global controls.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Try Again</Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-x-8 gap-y-4">
              <div className="flex items-center gap-3">
                <div className={cn(
                  "grid h-10 w-10 place-items-center rounded-full",
                  status?.operational ? "bg-emerald-100" : "bg-amber-100",
                )}>
                  {status?.operational
                    ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                    : <AlertTriangle className="h-5 w-5 text-amber-600" />}
                </div>
                <div>
                  <p className="text-[14px] font-bold text-[#111827]">
                    {status?.operational ? "Platform Operational" : "Global restrictions are active"}
                  </p>
                  <p className="text-[12px] text-[#6b7280]">
                    {status?.operational ? "All systems are running normally." : "One or more restrictions are currently limiting the platform."}
                  </p>
                </div>
              </div>

              <StatPill label="Active Restrictions" value={status?.activeRestrictions ?? 0} tone={status && status.activeRestrictions > 0 ? "warn" : "neutral"} />
              <StatPill label="Disabled Features" value={status?.disabledFeatures ?? 0} tone={status && status.disabledFeatures > 0 ? "warn" : "neutral"} />
              <StatPill label="Maintenance Mode" value={status?.maintenanceMode ? "ON" : "OFF"} tone={status?.maintenanceMode ? "danger" : "neutral"} />

              <div className="ml-auto text-right text-[12px] text-[#9ca3af]">
                <p>Last updated <span className="text-[#6b7280]">{timeAgo(latestChange?.createdAt ?? null)}</span></p>
                <p>Updated by <span className="text-[#6b7280]">{latestChange?.admin ?? "-"}</span></p>
              </div>
            </div>
          )}
        </Card>

        {/* Two-column layout */}
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_300px]">
          <div className="min-w-0 space-y-4">
            {/* Tabs + search */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex flex-wrap gap-1.5">
                <TabButton active={activeTab === "all"} onClick={() => setActiveTab("all")}>All Controls</TabButton>
                {Object.entries(categories).map(([key, label]) => (
                  <TabButton key={key} active={activeTab === key} onClick={() => setActiveTab(key)}>{label}</TabButton>
                ))}
              </div>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search global controls…"
                  className="h-9 w-full rounded-[10px] border border-[#e8eaed] bg-white pl-9 pr-3 text-[13px] text-[#111827] outline-none placeholder:text-[#9ca3af] focus:border-[#fd4605]"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-3">
                {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-[#f4f5f7]" />)}
              </div>
            ) : isError ? null : filtered.length === 0 ? (
              <Card className="p-8 text-center text-[13px] text-[#6b7280]">No controls match your search.</Card>
            ) : (
              Object.entries(grouped).map(([catKey, items]) => {
                const Icon = CATEGORY_ICON[catKey] ?? Zap;
                return (
                  <Card key={catKey}>
                    <div className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-3.5">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-[#6b7280]" />
                        <h3 className="text-[13px] font-bold text-[#111827]">{categories[catKey] ?? catKey}</h3>
                      </div>
                      {catKey !== "emergency" && (
                        <div className="flex gap-1.5">
                          <Button variant="outline" size="sm" onClick={() => {
                            setPending({ kind: "category", category: catKey, categoryLabel: categories[catKey] ?? catKey, enabled: false });
                            setReason("");
                          }}>Disable All</Button>
                          <Button variant="outline" size="sm" onClick={() => {
                            setPending({ kind: "category", category: catKey, categoryLabel: categories[catKey] ?? catKey, enabled: true });
                            setReason("");
                          }}>Enable All</Button>
                        </div>
                      )}
                    </div>
                    <div className="divide-y divide-[#f0f1f3]">
                      {items.map((c) => (
                        <ControlRow
                          key={c.key}
                          control={c}
                          value={effectiveValue(c)}
                          dirty={c.key in dirty}
                          saving={updateMutation.isPending && pending?.kind === "toggle" && pending.key === c.key}
                          onChange={(next) => requestToggle(c, next)}
                        />
                      ))}
                    </div>
                  </Card>
                );
              })
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            <Card className="p-4">
              <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Quick Actions</h3>
              <div className="space-y-1">
                <QuickAction
                  icon={PauseCircle}
                  label="Enable Maintenance Mode"
                  sub="Put the platform in maintenance mode"
                  onClick={() => { setPending({ kind: "toggle", key: "maintenance_mode", label: "Maintenance Mode", enabled: true, requiresReason: true, offeringDuration: true, restrictive: true }); setReason(""); setDurationMinutes(undefined); }}
                />
                <QuickAction
                  icon={UserX}
                  label="Block New Registrations"
                  sub="Stop all new account creation"
                  onClick={() => { setPending({ kind: "toggle", key: "block_new_accounts", label: "Block New Registrations", enabled: true, requiresReason: true, offeringDuration: true, restrictive: true }); setReason(""); setDurationMinutes(undefined); }}
                />
                <QuickAction
                  icon={CloudOff}
                  label="Disable All Uploads"
                  sub="Temporarily block content uploads"
                  onClick={() => { setPending({ kind: "toggle", key: "uploads_enabled", label: "Allow users to upload content", enabled: false, requiresReason: true, offeringDuration: true, restrictive: true }); setReason(""); setDurationMinutes(undefined); }}
                />
                <QuickAction
                  icon={StopCircle}
                  label="Stop Active Live Streams"
                  sub="End all currently running live streams"
                  onClick={() => { setPending({ kind: "stop-live" }); setReason(""); }}
                />
              </div>
            </Card>

            <Card className="p-4">
              <h3 className="mb-3 text-[13px] font-bold text-[#111827]">Recent Changes</h3>
              {activity && activity.length > 0 ? (
                <div className="space-y-3">
                  {activity.slice(0, 5).map((a) => (
                    <div key={a.id} className="text-[12px]">
                      <p className="font-semibold text-[#111827]">{a.description}</p>
                      <p className="text-[#9ca3af]">{a.admin} · {timeAgo(a.createdAt)}</p>
                    </div>
                  ))}
                  <button onClick={() => setShowActivity(true)} className="text-[12px] font-semibold text-[#fd4605] hover:underline">
                    View All
                  </button>
                </div>
              ) : (
                <p className="text-[12px] text-[#9ca3af]">No changes yet.</p>
              )}
            </Card>
          </div>
        </div>
      </div>

      {/* Confirmation modal */}
      {pending && (
        <ConfirmModal
          open={!!pending}
          title={
            pending.kind === "toggle" ? `${pending.enabled ? "Enable" : "Disable"} ${pending.label}?`
            : pending.kind === "category" ? `${pending.enabled ? "Enable" : "Disable"} all ${pending.categoryLabel}?`
            : "Stop all active Live Streams?"
          }
          message={
            pending.kind === "toggle" ? "This change applies globally across Website, Android, iOS and the backend API. Existing data is never deleted."
            : pending.kind === "category" ? `This will ${pending.enabled ? "enable" : "disable"} every control in this category at once.`
            : "Every currently-live stream will be ended immediately for its broadcaster and viewers. This cannot be undone."
          }
          danger={pending.kind === "toggle" ? pending.restrictive : true}
          confirmLabel={pending.kind === "stop-live" ? "Stop Live Streams" : "Continue"}
          loading={updateMutation.isPending || bulkMutation.isPending || stopLiveMutation.isPending}
          onConfirm={confirmPending}
          onCancel={() => setPending(null)}
        >
          <div className="mt-3 space-y-3">
            <div>
              <label className="mb-1 block text-[12px] font-semibold text-[#374151]">
                Reason {pending.kind === "toggle" && pending.requiresReason ? "(required)" : "(optional)"}
              </label>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this change being made?"
                className="w-full rounded-lg border border-[#e8eaed] px-3 py-2 text-[13px] outline-none focus:border-[#fd4605]"
              />
            </div>
            {pending.kind === "toggle" && pending.offeringDuration && (
              <div>
                <label className="mb-1 block text-[12px] font-semibold text-[#374151]">Restriction Duration</label>
                <div className="space-y-1">
                  {DURATIONS.map((d) => (
                    <label key={d.label} className="flex items-center gap-2 text-[13px] text-[#374151]">
                      <input
                        type="radio"
                        checked={durationMinutes === d.minutes}
                        onChange={() => setDurationMinutes(d.minutes)}
                      />
                      {d.label}
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>
        </ConfirmModal>
      )}

      {/* Activity panel */}
      {showActivity && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/30" onClick={() => setShowActivity(false)} />
          <div className="relative flex h-full w-full max-w-md flex-col bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-[#e8eaed] px-5 py-4">
              <h3 className="text-[15px] font-bold text-[#111827]">Global Control Activity</h3>
              <button onClick={() => setShowActivity(false)} className="text-[#9ca3af] hover:text-[#111827]"><X className="h-5 w-5" /></button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
              {!activity ? (
                <div className="space-y-3">{[0, 1, 2].map((i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[#f4f5f7]" />)}</div>
              ) : activity.length === 0 ? (
                <p className="text-[13px] text-[#9ca3af]">No activity yet.</p>
              ) : (
                activity.map((a) => (
                  <div key={a.id} className="rounded-xl border border-[#e8eaed] p-3">
                    <p className="text-[13px] font-semibold text-[#111827]">{a.description}</p>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">{a.admin} · {timeAgo(a.createdAt)}</p>
                    {typeof a.metadata?.reason === "string" && a.metadata.reason && (
                      <p className="mt-1.5 text-[12px] text-[#6b7280]">Reason: {a.metadata.reason}</p>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

function StatPill({ label, value, tone }: { label: string; value: string | number; tone: "neutral" | "warn" | "danger" }) {
  return (
    <div>
      <p className={cn(
        "text-[20px] font-extrabold leading-none",
        tone === "danger" ? "text-red-600" : tone === "warn" ? "text-amber-600" : "text-[#111827]",
      )}>{value}</p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">{label}</p>
    </div>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors",
        active ? "bg-[#fd4605] text-white" : "bg-[#f4f5f7] text-[#6b7280] hover:bg-[#e8eaed]",
      )}
    >
      {children}
    </button>
  );
}

function QuickAction({ icon: Icon, label, sub, onClick }: { icon: React.ElementType; label: string; sub: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-2 text-left transition-colors hover:bg-[#f4f5f7]">
      <div className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-[#fff3ec] text-[#fd4605]">
        <Icon className="h-3.5 w-3.5" />
      </div>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-[#111827]">{label}</p>
        <p className="text-[11.5px] text-[#9ca3af]">{sub}</p>
      </div>
    </button>
  );
}

function ControlRow({
  control, value, dirty, saving, onChange,
}: {
  control: GlobalControl;
  value: boolean;
  dirty: boolean;
  saving: boolean;
  onChange: (next: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="px-5 py-3.5">
      <div className="flex items-start justify-between gap-3">
        <button onClick={() => setExpanded((v) => !v)} className="flex min-w-0 flex-1 items-start gap-2 text-left">
          <ChevronDown className={cn("mt-1 h-3.5 w-3.5 shrink-0 text-[#9ca3af] transition-transform", expanded && "rotate-180")} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13.5px] font-semibold text-[#111827]">{control.label}</span>
              {control.critical && (
                <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">Critical</span>
              )}
              {dirty && <span className="text-[10px] font-semibold text-[#fd4605]">Unsaved</span>}
              {control.expiresAt && (
                <span className="rounded-full bg-[#fff3ec] px-1.5 py-0.5 text-[10px] font-semibold text-[#fd4605]">Temporary</span>
              )}
            </div>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">{control.description}</p>
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-2">
          {saving && <Loader2 className="h-4 w-4 animate-spin text-[#9ca3af]" />}
          <Toggle checked={value} onChange={onChange} disabled={saving} />
        </div>
      </div>
      {expanded && (
        <div className="ml-[22px] mt-2.5 space-y-1.5 border-l-2 border-[#f0f1f3] pl-3.5 text-[11.5px] text-[#9ca3af]">
          <p>Applies to: <span className="text-[#6b7280]">{control.platforms.join(" • ")}</span></p>
          <p>Enforcement: <span className="text-[#6b7280]">{control.enforcement}</span></p>
          {control.changedBy && <p>Last changed by <span className="text-[#6b7280]">{control.changedBy}</span> {timeAgo(control.changedAt)}</p>}
          {control.changedReason && <p>Reason: <span className="text-[#6b7280]">{control.changedReason}</span></p>}
          {control.expiresAt && <p>Expires: <span className="text-[#6b7280]">{new Date(control.expiresAt).toLocaleString()}</span></p>}
        </div>
      )}
    </div>
  );
}
