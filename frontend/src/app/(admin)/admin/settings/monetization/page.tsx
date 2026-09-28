"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Award, Ban, BarChart3, Check, CheckCircle2, ChevronRight, Clock, Coins, Copy,
  Crown, DollarSign, Eye, Flag, Gem, Gift, Globe, Handshake, Heart, Info,
  Loader2, Megaphone, Package, Percent, Plus, Power, RefreshCw, Rocket, Save,
  Server, Shield, ShieldCheck, Sparkles, Star, Store, Smartphone, Search,
  Target, ThumbsUp, Trash2, TrendingUp, Trophy, Users, Users2, Video, Wallet,
  X, XCircle, Zap, type LucideIcon,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardBody } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";

/* ═══════════════════════════════════════════════════════════════════════════
   Monetization Control Center

   One console for every monetization programme on the app and the website:
   whether each is live, what it asks for, where it appears, on what terms and
   in which countries. Both clients read the rows this page writes, so a change
   here moves them together.

   Every control is enforced server-side. Nothing on this page is decorative -
   if a field is shown, the API accepts it and a client obeys it.
═══════════════════════════════════════════════════════════════════════════ */

type Metric = { key: string; label: string; counted: boolean };
type Requirement = { key: string; label: string; target: number | null; counted?: boolean };
type BaselineRequirement = { id: number; key: string; label: string; sub: string | null; target: number | null; enabled: boolean };
type Change = { id: number; action: string; description: string | null; at: string | null };
type Country = { code: string; name: string };

type Program = {
  id: number;
  key: string;
  label: string;
  description: string | null;
  mode: "enabled" | "coming_soon" | "disabled";
  requirements: Requirement[];
  unlocks: string[];
  sort_order: number;
  visible_app: boolean;
  visible_web: boolean;
  platforms: string[];
  surfaces: string[];
  countries: string[];
  rollout_percent: number;
  starts_at: string | null;
  ends_at: string | null;
  commission_rate: number | null;
  min_payout: number | null;
  hold_days: number;
  auto_approve: boolean;
  waitlist_enabled: boolean;
  notice: string | null;
  cta_label: string | null;
  hero_title: string | null;
  hero_description: string | null;
  features: { icon: string; title: string; desc: string }[];
};

const MODES = [
  { value: "enabled" as const,     label: "Active",      hint: "Visible and usable",  icon: CheckCircle2, ring: "border-emerald-500 bg-emerald-50", dot: "text-emerald-600" },
  { value: "coming_soon" as const, label: "Coming Soon", hint: "Visible with banner", icon: Clock,        ring: "border-amber-500 bg-amber-50",     dot: "text-amber-600" },
  { value: "disabled" as const,    label: "Disabled",    hint: "Hidden everywhere",   icon: XCircle,      ring: "border-rose-500 bg-rose-50",       dot: "text-rose-600" },
];

const STATUS_CHIP: Record<Program["mode"], string> = {
  enabled:     "bg-emerald-50 text-emerald-700 ring-emerald-200",
  coming_soon: "bg-amber-50 text-amber-700 ring-amber-200",
  disabled:    "bg-slate-100 text-slate-500 ring-slate-200",
};
const STATUS_LABEL: Record<Program["mode"], string> = {
  enabled: "Active", coming_soon: "Coming Soon", disabled: "Disabled",
};

const PLATFORM_META: Record<string, { label: string; icon: typeof Smartphone }> = {
  android: { label: "Android App", icon: Smartphone },
  ios:     { label: "iOS App",     icon: Smartphone },
  web:     { label: "Website",     icon: Globe },
  api:     { label: "API",         icon: Server },
};

const SURFACE_META: Record<string, string> = {
  studio: "Creator Studio", upload: "Video Upload", wallet: "Wallet",
  profile: "Profile", live: "Live Stream", discover: "Discover Page",
};

const PROGRAM_ICON: Record<string, typeof Gift> = {
  gifts: Gift, rewards: Percent, subscriptions: Users2, marketplace: TrendingUp, affiliate: Store,
};

/** What each surface shows when no cta_label override is set - just for the
 *  placeholder here, so an admin can see what they'd be replacing. */
/** The same curated set the server validates `features[].icon` against
 *  (MonetizationProgram::FEATURE_ICONS) - mirrored here only so the picker
 *  can render a live preview; the server's list is still what's enforced. */
const FEATURE_ICON_MAP: Record<string, LucideIcon> = {
  Gift, Wallet, Star, Trophy, Award, BarChart3, TrendingUp, Users, Heart,
  Coins, DollarSign, Percent, CheckCircle2, Zap, Shield, ShieldCheck, Store,
  Package, Video, Eye, Clock, Target, Sparkles, Rocket, Crown, Gem, ThumbsUp,
  Handshake, Megaphone, Flag,
};

const DEFAULT_CTA_LABEL: Record<string, string> = {
  gifts: "Get Started",
  affiliate: "Apply Now / Get Started",
  rewards: "Notify Me When It Opens",
  subscriptions: "Join the Waitlist",
  marketplace: "Notify Me When Eligible",
};

type TabKey = "overview" | "requirements" | "unlocks" | "placement" | "regions" | "advanced";
const TABS: { key: TabKey; label: string }[] = [
  { key: "overview",     label: "Overview" },
  { key: "requirements", label: "Requirements" },
  { key: "unlocks",      label: "Unlocks" },
  { key: "placement",    label: "Platforms" },
  { key: "regions",      label: "Regions" },
  { key: "advanced",     label: "Advanced" },
];

export default function MonetizationControlCenter() {
  const qc = useQueryClient();
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-monetization-programs"],
    queryFn: adminService.monetizationPrograms,
  });

  const programs: Program[] = useMemo(() => data?.programs ?? [], [data]);
  const metrics: Metric[] = data?.metrics ?? [];
  const platforms: string[] = data?.platforms ?? [];
  const surfaces: string[] = data?.surfaces ?? [];
  const featureIcons: string[] = data?.feature_icons ?? [];
  const baselineRequirements: BaselineRequirement[] = data?.baseline_requirements ?? [];
  const changes: Change[] = data?.changes ?? [];
  const countryList: Country[] = data?.countries ?? [];
  const masterOn = data?.enabled !== false;

  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const selected = programs.find((p) => p.key === selectedKey) ?? programs[0] ?? null;

  useEffect(() => {
    if (!selectedKey && programs.length) setSelectedKey(programs[0].key);
  }, [programs, selectedKey]);

  const masterM = useMutation({
    mutationFn: (enabled: boolean) => adminService.setMonetizationMaster(enabled),
    onSuccess: (res) => {
      toast.success(res.message ?? "Updated");
      qc.invalidateQueries({ queryKey: ["admin-monetization-programs"] });
    },
    onError: () => toast.error("Couldn't change the master switch"),
  });

  /* Applies one mode to every programme. Sequential rather than parallel: the
     action log should read as an ordered list of what an operator did. */
  const bulkModeM = useMutation({
    mutationFn: async (mode: Program["mode"]) => {
      for (const p of programs) {
        if (p.mode !== mode) await adminService.setMonetizationProgramMode(p.key, mode);
      }
    },
    onSuccess: () => {
      toast.success("Applied to every programme");
      qc.invalidateQueries({ queryKey: ["admin-monetization-programs"] });
    },
    onError: () => toast.error("Couldn't apply to every programme"),
  });

  const counts = {
    active: programs.filter((p) => p.mode === "enabled").length,
    soon: programs.filter((p) => p.mode === "coming_soon").length,
    off: programs.filter((p) => p.mode === "disabled").length,
  };

  return (
    <AdminShell title="Monetization Control Center">
      <div className="space-y-5 p-6">
        {/* ── Title ──────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-[24px] font-black tracking-tight text-slate-900">
              Monetization Control Center
              <Info className="h-4 w-4 text-slate-300" />
            </h1>
            <p className="mt-1 text-[13.5px] text-slate-500">
              Manage all monetization programs, requirements, availability and system controls
              for app and website.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold text-slate-700">
              <Globe className="h-4 w-4 text-slate-400" /> Teezer App &amp; Website
            </span>
            <Button variant="outline" onClick={() => refetch()} disabled={isFetching}>
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              <span className="ml-2">Refresh</span>
            </Button>
          </div>
        </div>

        {/* ── Global status row ──────────────────────────────────────── */}
        <div className="grid gap-4 xl:grid-cols-12">
          <Card className="xl:col-span-5">
            <CardBody className="flex items-center gap-5">
              <div className={`grid h-20 w-20 flex-shrink-0 place-items-center rounded-full border-4 ${
                masterOn ? "border-emerald-100 text-emerald-600" : "border-rose-100 text-rose-600"
              }`}>
                <Power className="h-8 w-8" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[16px] font-black text-slate-900">Global Monetization Status</h2>
                  <span className={`flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-bold ${
                    masterOn ? "bg-emerald-50 text-emerald-700" : "bg-rose-50 text-rose-700"
                  }`}>
                    <span className={`h-1.5 w-1.5 rounded-full ${masterOn ? "bg-emerald-500" : "bg-rose-500"}`} />
                    {masterOn ? "Live" : "Paused"}
                  </span>
                </div>
                <p className="mt-1 text-[13px] text-slate-500">
                  {masterOn
                    ? "Monetization is active across all selected platforms and regions."
                    : "Every programme reads as coming soon on the app and the website. Balances are untouched."}
                </p>
                <Button
                  className="mt-3"
                  variant={masterOn ? "outline" : "success"}
                  disabled={masterM.isPending}
                  onClick={() => masterM.mutate(!masterOn)}
                >
                  {masterM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Power className="h-4 w-4" />}
                  <span className="ml-2">{masterOn ? "Pause All Programs" : "Resume Monetization"}</span>
                </Button>
              </div>
            </CardBody>
          </Card>

          <Card className="xl:col-span-4">
            <CardBody className="grid grid-cols-3 gap-4">
              <Stat label="Active Programs" value={counts.active} tone="emerald" />
              <Stat label="Coming Soon" value={counts.soon} tone="amber" />
              <Stat label="Disabled" value={counts.off} tone="slate" />
            </CardBody>
          </Card>

          <Card className="xl:col-span-3">
            <CardBody className="space-y-2">
              <p className="text-[11px] font-black uppercase tracking-wider text-slate-400">
                Quick Global Actions
              </p>
              <QuickAction
                icon={Clock} tone="amber" label="Coming Soon Mode"
                hint="Every programme visible with a banner"
                busy={bulkModeM.isPending}
                onClick={() => bulkModeM.mutate("coming_soon")}
              />
              <QuickAction
                icon={Ban} tone="rose" label="Emergency Disable"
                hint="Hide every programme on both surfaces"
                busy={bulkModeM.isPending}
                onClick={() => {
                  if (confirm("Hide every monetization programme on the app and the website?")) {
                    bulkModeM.mutate("disabled");
                  }
                }}
              />
            </CardBody>
          </Card>
        </div>

        {/* ── Programme list + detail ────────────────────────────────── */}
        {isLoading ? (
          <Card><CardBody className="flex items-center gap-2 text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading programmes…
          </CardBody></Card>
        ) : programs.length === 0 ? (
          <Card><CardBody className="text-slate-500">
            No programmes found. Run the monetization_programs migration.
          </CardBody></Card>
        ) : (
          <div className="grid gap-4 xl:grid-cols-12">
            <Card className="self-start xl:col-span-4">
              <CardBody className="p-0">
                <div className="border-b border-slate-100 px-4 py-3">
                  <h3 className="text-[14px] font-black text-slate-900">All Monetization Programs</h3>
                </div>
                <div className="divide-y divide-slate-100">
                  {programs.map((p) => {
                    const Icon = PROGRAM_ICON[p.key] ?? Zap;
                    const on = selected?.key === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setSelectedKey(p.key)}
                        className={`flex w-full items-start gap-3 px-4 py-3.5 text-left transition ${
                          on
                            ? "border-l-[3px] border-l-[#fd4605] bg-rose-50/40"
                            : "border-l-[3px] border-l-transparent hover:bg-slate-50"
                        }`}
                      >
                        <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl bg-slate-100 text-slate-600">
                          <Icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13.5px] font-bold text-slate-900">{p.label}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-bold ring-1 ${STATUS_CHIP[p.mode]}`}>
                              {STATUS_LABEL[p.mode]}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-[12px] text-slate-500">
                            {p.description}
                          </span>
                          <span className="mt-1 block text-[11.5px] text-slate-400">
                            {p.requirements.length} requirements · {p.unlocks.length} unlocks
                          </span>
                        </span>
                        <ChevronRight className="mt-1 h-4 w-4 flex-shrink-0 text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </CardBody>
            </Card>

            <div className="xl:col-span-8">
              {selected && (
                <ProgramDetail
                  key={selected.key}
                  program={selected}
                  metrics={metrics}
                  platforms={platforms}
                  surfaces={surfaces}
                  countryList={countryList}
                  featureIcons={featureIcons}
                  baselineRequirements={baselineRequirements}
                />
              )}
            </div>
          </div>
        )}

        {/* ── Recent changes ─────────────────────────────────────────── */}
        <Card>
          <CardBody>
            <h3 className="mb-3 text-[14px] font-black text-slate-900">Recent Changes</h3>
            {changes.length === 0 ? (
              <p className="text-[13px] text-slate-500">No monetization changes recorded yet.</p>
            ) : (
              <ul className="divide-y divide-slate-100">
                {changes.map((c) => (
                  <li key={c.id} className="flex items-start gap-3 py-2.5">
                    <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${
                      c.action === "monetization_master_switch" ? "bg-rose-400" : "bg-slate-300"
                    }`} />
                    <span className="min-w-0 flex-1 text-[13px] text-slate-700">
                      {c.description ?? c.action}
                    </span>
                    <span className="flex-shrink-0 text-[11.5px] text-slate-400">
                      {c.at ? new Date(c.at).toLocaleString() : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   One programme
═══════════════════════════════════════════════════════════════════════════ */
function ProgramDetail({
  program, metrics, platforms, surfaces, countryList, featureIcons, baselineRequirements,
}: {
  program: Program; metrics: Metric[]; platforms: string[];
  surfaces: string[]; countryList: Country[]; featureIcons: string[];
  baselineRequirements: BaselineRequirement[];
}) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<TabKey>("overview");
  const [f, setF] = useState(() => formOf(program));

  useEffect(() => { setF(formOf(program)); setTab("overview"); }, [program]);

  // Platform-wide requirements are global, not per-programme - they don't
  // reset when a different programme is selected, only when the server's
  // own copy changes (e.g. after a save elsewhere refetches).
  const [baseF, setBaseF] = useState(() => baselineRequirements.map((b) => ({ ...b })));
  useEffect(() => { setBaseF(baselineRequirements.map((b) => ({ ...b }))); }, [baselineRequirements]);

  const baseDirty = JSON.stringify(baseF) !== JSON.stringify(baselineRequirements);

  // One Save Changes for every edited row at once - ticking several boxes
  // off and saving once, the same as the rest of this page, rather than a
  // separate click per row.
  const baseSaveM = useMutation({
    mutationFn: async () => {
      const changed = baseF.filter((b, i) => JSON.stringify(b) !== JSON.stringify(baselineRequirements[i]));
      await Promise.all(changed.map((b) =>
        adminService.updatePlatformRequirement(b.key, {
          label: b.label, sub: b.sub || null, target: b.target, enabled: b.enabled,
        })
      ));
      return changed.length;
    },
    onSuccess: (count) => {
      toast.success(count === 1 ? "Requirement updated" : `${count} requirements updated`);
      qc.invalidateQueries({ queryKey: ["admin-monetization-programs"] });
    },
    onError: () => toast.error("Couldn't save those changes"),
  });

  const metricOf = useMemo(() => Object.fromEntries(metrics.map((m) => [m.key, m])), [metrics]);

  const modeM = useMutation({
    mutationFn: (mode: Program["mode"]) => adminService.setMonetizationProgramMode(program.key, mode),
    onSuccess: (res) => {
      toast.success(res.message ?? "Mode updated");
      qc.invalidateQueries({ queryKey: ["admin-monetization-programs"] });
    },
    onError: () => toast.error("Couldn't change the mode"),
  });

  const saveM = useMutation({
    mutationFn: () =>
      adminService.updateMonetizationProgram(program.key, {
        label: f.label,
        description: f.description,
        requirements: f.reqs.map((r) => ({ key: r.key, label: r.label, target: r.target })),
        unlocks: f.unlocks.filter((u) => u.trim().length > 0),
        platforms: f.platforms,
        surfaces: f.surfaces,
        // "All countries" is stored as NULL, never as an empty list - an empty
        // list would read as "nobody", which is what Disabled is for.
        // Empty list is stored as NULL - "nobody" is what Disabled is for.
        countries: f.allCountries ? null : f.countries,
        rollout_percent: f.rollout,
        starts_at: f.startsAt || null,
        ends_at: f.endsAt || null,
        commission_rate: f.commission,
        min_payout: f.minPayout,
        hold_days: f.holdDays,
        auto_approve: f.autoApprove,
        waitlist_enabled: f.waitlist,
        notice: f.notice || null,
        cta_label: f.ctaLabel || null,
        hero_title: f.heroTitle || null,
        hero_description: f.heroDescription || null,
        features: f.features.filter((ft) => ft.title.trim().length > 0),
      }),
    onSuccess: (res) => {
      toast.success(res.message ?? "Saved");
      qc.invalidateQueries({ queryKey: ["admin-monetization-programs"] });
    },
    onError: () => toast.error("Couldn't save this programme"),
  });

  const dirty = JSON.stringify(f) !== JSON.stringify(formOf(program));
  const Icon = PROGRAM_ICON[program.key] ?? Zap;

  const toggleIn = (list: string[], v: string) =>
    list.includes(v) ? list.filter((x) => x !== v) : [...list, v];

  return (
    <Card>
      {/* ── Head ─────────────────────────────────────────────────────── */}
      <CardBody className="border-b border-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-[#fd4605]">
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-[18px] font-black text-slate-900">{program.label}</h2>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ring-1 ${STATUS_CHIP[program.mode]}`}>
                  {STATUS_LABEL[program.mode]}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { navigator.clipboard?.writeText(program.key); toast.success("Program ID copied"); }}
                className="mt-0.5 flex items-center gap-1.5 text-[12px] text-slate-400 transition hover:text-slate-600"
              >
                Program ID: {program.key} <Copy className="h-3 w-3" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {dirty && <span className="text-[12px] font-semibold text-amber-600">Unsaved changes</span>}
            <Button onClick={() => saveM.mutate()} disabled={!dirty || saveM.isPending}>
              {saveM.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              <span className="ml-2">Save Changes</span>
            </Button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-1 border-b border-slate-100">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-[13px] font-bold transition ${
                tab === t.key
                  ? "border-[#fd4605] text-[#fd4605]"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </CardBody>

      <CardBody className="space-y-5">
        {/* ── Overview ─────────────────────────────────────────────── */}
        {tab === "overview" && (
          <>
            <Panel title="Program Mode" hint="What creators see, on every surface.">
              <div className="grid gap-2 sm:grid-cols-3">
                {MODES.map((m) => {
                  const on = program.mode === m.value;
                  const MIcon = m.icon;
                  return (
                    <button
                      key={m.value}
                      type="button"
                      disabled={modeM.isPending}
                      onClick={() => !on && modeM.mutate(m.value)}
                      className={`flex items-start gap-2.5 rounded-xl border p-3 text-left transition disabled:opacity-60 ${
                        on ? m.ring : "border-slate-200 hover:border-slate-300"
                      }`}
                    >
                      <MIcon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${on ? m.dot : "text-slate-300"}`} />
                      <span>
                        <span className="block text-[13px] font-bold text-slate-900">{m.label}</span>
                        <span className="block text-[11.5px] text-slate-500">{m.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </Panel>

            <Panel title="Program Description" hint="Shown to creators on both surfaces.">
              <input
                value={f.label}
                onChange={(e) => setF({ ...f, label: e.target.value })}
                maxLength={80}
                placeholder="Display name"
                className="mb-2 w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold outline-none focus:border-slate-400"
              />
              <textarea
                value={f.description}
                onChange={(e) => setF({ ...f, description: e.target.value })}
                maxLength={400}
                rows={3}
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
              />
            </Panel>

            <Panel title="Notice" hint="Shown verbatim on both surfaces. Empty shows nothing.">
              <input
                value={f.notice}
                onChange={(e) => setF({ ...f, notice: e.target.value })}
                maxLength={300}
                placeholder="e.g. Payouts are paused while we migrate providers"
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
              />
            </Panel>

            <Panel title="Button Text" hint="Overrides the CTA button on both surfaces. Empty uses the default below.">
              <input
                value={f.ctaLabel}
                onChange={(e) => setF({ ...f, ctaLabel: e.target.value })}
                maxLength={40}
                placeholder={DEFAULT_CTA_LABEL[program.key] ?? "Get Started"}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold outline-none focus:border-slate-400"
              />
              <p className="mt-1.5 text-[11px] text-slate-400">
                Default: <span className="font-semibold text-slate-500">{DEFAULT_CTA_LABEL[program.key] ?? "Get Started"}</span>
              </p>
            </Panel>

            <Panel title="App Intro Pitch" hint="The headline and paragraph shown on this programme's own intro screen. Empty uses the app's built-in copy.">
              <textarea
                value={f.heroTitle}
                onChange={(e) => setF({ ...f, heroTitle: e.target.value })}
                maxLength={120}
                rows={2}
                placeholder={"e.g. Earn Real Rewards\nFrom Gifts & Coins"}
                className="mb-2 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] font-semibold outline-none focus:border-slate-400"
              />
              <p className="mb-2 -mt-1 text-[11px] text-slate-400">
                A line break puts the last line in the app's accent colour, matching the built-in headings.
              </p>
              <textarea
                value={f.heroDescription}
                onChange={(e) => setF({ ...f, heroDescription: e.target.value })}
                maxLength={400}
                rows={3}
                placeholder="The paragraph under the headline"
                className="w-full resize-none rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
              />
            </Panel>

            <Panel
              title={`Feature Bullets (${f.features.length}/5)`}
              hint="The 3 icon + title + description rows on the intro screen. Empty uses the app's built-in bullets."
              action={
                <Button
                  variant="outline" size="sm"
                  disabled={f.features.length >= 5}
                  onClick={() => setF({ ...f, features: [...f.features, { icon: featureIcons[0] ?? "Star", title: "", desc: "" }] })}
                >
                  <Plus className="h-3.5 w-3.5" /><span className="ml-1">Add</span>
                </Button>
              }
            >
              <div className="space-y-3">
                {f.features.map((ft, i) => {
                  const Icon = FEATURE_ICON_MAP[ft.icon] ?? Star;
                  return (
                    <div key={i} className="flex items-start gap-2 rounded-lg border border-slate-200 p-3">
                      <div className="flex flex-shrink-0 flex-col items-center gap-1.5">
                        <span className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-600">
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <select
                          value={ft.icon}
                          onChange={(e) => setF({ ...f, features: f.features.map((x, k) => k === i ? { ...x, icon: e.target.value } : x) })}
                          className="w-[76px] rounded-md border border-slate-200 px-1 py-1 text-[10.5px] outline-none focus:border-slate-400"
                        >
                          {featureIcons.map((name) => <option key={name} value={name}>{name}</option>)}
                        </select>
                      </div>
                      <div className="min-w-0 flex-1 space-y-1.5">
                        <input
                          value={ft.title}
                          onChange={(e) => setF({ ...f, features: f.features.map((x, k) => k === i ? { ...x, title: e.target.value } : x) })}
                          maxLength={60}
                          placeholder="Bullet title"
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-[13px] font-semibold outline-none focus:border-slate-400"
                        />
                        <input
                          value={ft.desc}
                          onChange={(e) => setF({ ...f, features: f.features.map((x, k) => k === i ? { ...x, desc: e.target.value } : x) })}
                          maxLength={150}
                          placeholder="Bullet description"
                          className="w-full rounded-lg border border-slate-200 px-3 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setF({ ...f, features: f.features.filter((_, k) => k !== i) })}
                        className="flex-shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
                {f.features.length === 0 && <p className="text-[13px] text-slate-500">No custom bullets - using the app's built-in ones.</p>}
              </div>
            </Panel>
          </>
        )}

        {/* ── Requirements ─────────────────────────────────────────── */}
        {tab === "requirements" && (
          <Panel
            title="Requirements"
            hint="Only metrics the server can measure. One it cannot check would never clear."
            action={
              <Button variant="outline" size="sm" onClick={() => {
                const used = new Set(f.reqs.map((r) => r.key));
                const next = metrics.find((m) => !used.has(m.key));
                if (!next) { toast.error("Every metric is already used"); return; }
                setF({ ...f, reqs: [...f.reqs, { key: next.key, label: next.label, target: next.counted ? 1 : null }] });
              }}>
                <Plus className="h-3.5 w-3.5" /><span className="ml-1">Add</span>
              </Button>
            }
          >
            {f.reqs.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-700">
                No requirements. This programme opens for every creator the moment it is active.
              </p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-slate-200">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="w-8 px-3 py-2">#</th>
                      <th className="px-3 py-2">Requirement</th>
                      <th className="px-3 py-2">Metric</th>
                      <th className="w-36 px-3 py-2">Target</th>
                      <th className="w-10 px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-[13px]">
                    {f.reqs.map((r, i) => {
                      const counted = metricOf[r.key]?.counted ?? false;
                      return (
                        <tr key={`${r.key}-${i}`}>
                          <td className="px-3 py-2 text-slate-400">{i + 1}</td>
                          <td className="px-3 py-2">
                            <input
                              value={r.label}
                              onChange={(e) => setF({ ...f, reqs: f.reqs.map((x, k) => k === i ? { ...x, label: e.target.value } : x) })}
                              maxLength={80}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <select
                              value={r.key}
                              onChange={(e) => {
                                const m = metricOf[e.target.value];
                                setF({ ...f, reqs: f.reqs.map((x, k) => k === i
                                  ? { key: e.target.value, label: m?.label ?? "", target: m?.counted ? (x.target ?? 1) : null }
                                  : x) });
                              }}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
                            >
                              {metrics.map((m) => <option key={m.key} value={m.key}>{m.label}</option>)}
                            </select>
                          </td>
                          <td className="px-3 py-2">
                            {counted ? (
                              <input
                                type="number" min={1}
                                value={r.target ?? 1}
                                onChange={(e) => setF({ ...f, reqs: f.reqs.map((x, k) => k === i ? { ...x, target: Number(e.target.value) } : x) })}
                                className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
                              />
                            ) : (
                              <span className="block rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[12px] text-slate-500">
                                Pass / fail
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => setF({ ...f, reqs: f.reqs.filter((_, k) => k !== i) })}
                              className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>
        )}

        {tab === "requirements" && (
          <Panel
            title="Platform-Wide Requirements"
            hint="Applies to every programme, on top of the list above. Turning one off turns it off everywhere - including programmes already live."
            action={
              <div className="flex items-center gap-2">
                {baseDirty && <span className="text-[12px] font-semibold text-amber-600">Unsaved changes</span>}
                <Button size="sm" onClick={() => baseSaveM.mutate()} disabled={!baseDirty || baseSaveM.isPending}>
                  {baseSaveM.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                  <span className="ml-1">Save Changes</span>
                </Button>
              </div>
            }
          >
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left">
                <thead className="bg-slate-50 text-[11px] font-black uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="w-10 px-3 py-2">On</th>
                    <th className="px-3 py-2">Requirement</th>
                    <th className="px-3 py-2">Why</th>
                    <th className="w-28 px-3 py-2">Target</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px]">
                  {baseF.map((b, i) => {
                    const counted = metricOf[b.key]?.counted ?? false;
                    return (
                      <tr key={b.key} className={!b.enabled ? "opacity-50" : undefined}>
                        <td className="px-3 py-2">
                          <input
                            type="checkbox"
                            checked={b.enabled}
                            onChange={(e) => setBaseF(baseF.map((x, k) => k === i ? { ...x, enabled: e.target.checked } : x))}
                            className="h-4 w-4 rounded border-slate-300"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={b.label}
                            onChange={(e) => setBaseF(baseF.map((x, k) => k === i ? { ...x, label: e.target.value } : x))}
                            maxLength={80}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] font-semibold outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            value={b.sub ?? ""}
                            onChange={(e) => setBaseF(baseF.map((x, k) => k === i ? { ...x, sub: e.target.value } : x))}
                            maxLength={150}
                            className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
                          />
                        </td>
                        <td className="px-3 py-2">
                          {counted ? (
                            <input
                              type="number" min={1}
                              value={b.target ?? 1}
                              onChange={(e) => setBaseF(baseF.map((x, k) => k === i ? { ...x, target: Number(e.target.value) } : x))}
                              className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-[12.5px] outline-none focus:border-slate-400"
                            />
                          ) : (
                            <span className="block rounded-lg bg-slate-50 px-2 py-1.5 text-center text-[12px] text-slate-500">
                              Pass / fail
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Panel>
        )}

        {/* ── Unlocks ──────────────────────────────────────────────── */}
        {tab === "unlocks" && (
          <Panel
            title={`Unlocks (${f.unlocks.length})`}
            hint="What meeting the requirements turns on."
            action={
              <Button variant="outline" size="sm" onClick={() => setF({ ...f, unlocks: [...f.unlocks, ""] })}>
                <Plus className="h-3.5 w-3.5" /><span className="ml-1">Add</span>
              </Button>
            }
          >
            <div className="space-y-2">
              {f.unlocks.map((u, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                    <Check className="h-4 w-4" />
                  </span>
                  <input
                    value={u}
                    onChange={(e) => setF({ ...f, unlocks: f.unlocks.map((x, k) => k === i ? e.target.value : x) })}
                    placeholder="e.g. Creator Wallet"
                    maxLength={80}
                    className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setF({ ...f, unlocks: f.unlocks.filter((_, k) => k !== i) })}
                    className="rounded-lg p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
              {f.unlocks.length === 0 && <p className="text-[13px] text-slate-500">No unlocks listed.</p>}
            </div>
          </Panel>
        )}

        {/* ── Platforms + surfaces ─────────────────────────────────── */}
        {tab === "placement" && (
          <>
            <Panel title="Platforms" hint="Which clients ship this programme. None ticked means every one.">
              <div className="grid gap-2 sm:grid-cols-2">
                {platforms.map((p) => {
                  const meta = PLATFORM_META[p] ?? { label: p, icon: Server };
                  return (
                    <CheckRow
                      key={p} on={f.platforms.includes(p)} icon={meta.icon} label={meta.label}
                      onClick={() => setF({ ...f, platforms: toggleIn(f.platforms, p) })}
                    />
                  );
                })}
              </div>
            </Panel>

            <Panel title="Visibility" hint="Where inside a client the programme appears.">
              <div className="grid gap-2 sm:grid-cols-2">
                {surfaces.map((sfc) => (
                  <CheckRow
                    key={sfc} on={f.surfaces.includes(sfc)} icon={Eye}
                    label={SURFACE_META[sfc] ?? sfc}
                    onClick={() => setF({ ...f, surfaces: toggleIn(f.surfaces, sfc) })}
                  />
                ))}
              </div>
            </Panel>
          </>
        )}

        {/* ── Regions + rollout + schedule ─────────────────────────── */}
        {tab === "regions" && (
          <>
            <Panel title="Countries &amp; Regions" hint="Read from the Cloudflare edge on every request.">
              <div className="space-y-2">
                <RadioRow on={f.allCountries} label="All Countries" hint="Available worldwide"
                  onClick={() => setF({ ...f, allCountries: true })} />
                <RadioRow on={!f.allCountries} label="Select Countries" hint="Choose specific countries"
                  onClick={() => setF({ ...f, allCountries: false })} />
                {!f.allCountries && (
                  <CountryPicker
                    all={countryList}
                    selected={f.countries}
                    onChange={(next) => setF({ ...f, countries: next })}
                  />
                )}
              </div>
            </Panel>

            <Panel
              title={`Rollout — ${f.rollout}% of creators`}
              hint="Deterministic per creator: raising the percentage never takes it away from someone who already had it."
            >
              <input
                type="range" min={0} max={100} step={5}
                value={f.rollout}
                onChange={(e) => setF({ ...f, rollout: Number(e.target.value) })}
                className="w-full accent-[#fd4605]"
              />
            </Panel>

            <Panel title="Schedule" hint="Before the start date, and after the end date, the programme is not open.">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Start date">
                  <input type="date" value={f.startsAt}
                    onChange={(e) => setF({ ...f, startsAt: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                </Field>
                <Field label="End date (optional)">
                  <input type="date" value={f.endsAt}
                    onChange={(e) => setF({ ...f, endsAt: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                </Field>
              </div>
            </Panel>
          </>
        )}

        {/* ── Advanced ─────────────────────────────────────────────── */}
        {tab === "advanced" && (
          <>
            <Panel title="Payout &amp; Wallet" hint="Leave a field empty to inherit the platform default.">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Commission %">
                  <input type="number" min={0} max={100} step={0.5}
                    value={f.commission ?? ""} placeholder="Platform default"
                    onChange={(e) => setF({ ...f, commission: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                </Field>
                <Field label="Minimum payout">
                  <input type="number" min={0} step={1}
                    value={f.minPayout ?? ""} placeholder="Platform default"
                    onChange={(e) => setF({ ...f, minPayout: e.target.value === "" ? null : Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                </Field>
                <Field label="Settlement hold (days)">
                  <input type="number" min={0} max={365} step={1}
                    value={f.holdDays}
                    onChange={(e) => setF({ ...f, holdDays: Number(e.target.value) })}
                    className="w-full rounded-lg border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-slate-400" />
                </Field>
              </div>
            </Panel>

            <Panel title="Entry" hint="How a creator who meets the requirements gets in.">
              <div className="grid gap-2 sm:grid-cols-2">
                <CheckRow on={f.autoApprove} icon={CheckCircle2} label="Auto-approve"
                  sub="Off, meeting the bar raises an application"
                  onClick={() => setF({ ...f, autoApprove: !f.autoApprove })} />
                <CheckRow on={f.waitlist} icon={Clock} label="Waitlist"
                  sub="Let creators register interest before launch"
                  onClick={() => setF({ ...f, waitlist: !f.waitlist })} />
              </div>
            </Panel>

            <Panel title="Program ID &amp; API" hint="What a client sends to identify this programme.">
              <dl className="space-y-2 text-[13px]">
                <Row label="Program ID" value={program.key} />
                <Row label="Endpoint" value="GET /studio/monetization/programs" />
                <Row label="App visibility" value={program.visible_app ? "Visible" : "Hidden"} />
                <Row label="Web visibility" value={program.visible_web ? "Visible" : "Hidden"} />
              </dl>
            </Panel>
          </>
        )}
      </CardBody>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Small pieces
═══════════════════════════════════════════════════════════════════════════ */

function formOf(p: Program) {
  return {
    label: p.label,
    description: p.description ?? "",
    reqs: p.requirements,
    unlocks: p.unlocks,
    platforms: p.platforms ?? [],
    surfaces: p.surfaces ?? [],
    allCountries: (p.countries ?? []).length === 0,
    countries: (p.countries ?? []).map((c) => c.toUpperCase()),
    rollout: p.rollout_percent,
    startsAt: p.starts_at ? p.starts_at.slice(0, 10) : "",
    endsAt: p.ends_at ? p.ends_at.slice(0, 10) : "",
    commission: p.commission_rate,
    minPayout: p.min_payout,
    holdDays: p.hold_days,
    autoApprove: p.auto_approve,
    waitlist: p.waitlist_enabled,
    notice: p.notice ?? "",
    ctaLabel: p.cta_label ?? "",
    heroTitle: p.hero_title ?? "",
    heroDescription: p.hero_description ?? "",
    features: p.features.length ? p.features : [],
  };
}

function Panel({
  title, hint, action, children,
}: {
  title: string; hint: string; action?: React.ReactNode; children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 p-4">
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[13px] font-black text-slate-900">{title}</h4>
          <p className="text-[11.5px] text-slate-400">{hint}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone: string }) {
  const colour = tone === "emerald" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : "text-slate-500";
  return (
    <div>
      <p className="text-[11.5px] font-semibold text-slate-500">{label}</p>
      <p className={`mt-1 text-[26px] font-black leading-none ${colour}`}>{value}</p>
    </div>
  );
}

function QuickAction({
  icon: Icon, tone, label, hint, busy, onClick,
}: {
  icon: typeof Clock; tone: "amber" | "rose"; label: string; hint: string; busy: boolean; onClick: () => void;
}) {
  const cls = tone === "amber"
    ? "border-amber-200 bg-amber-50 text-amber-800 hover:border-amber-300"
    : "border-rose-200 bg-rose-50 text-rose-800 hover:border-rose-300";
  return (
    <button
      type="button" onClick={onClick} disabled={busy}
      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition disabled:opacity-60 ${cls}`}
    >
      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4 flex-shrink-0" />}
      <span className="min-w-0">
        <span className="block text-[12.5px] font-bold">{label}</span>
        <span className="block truncate text-[11px] opacity-80">{hint}</span>
      </span>
    </button>
  );
}

function CheckRow({
  on, icon: Icon, label, sub, onClick,
}: {
  on: boolean; icon: typeof Eye; label: string; sub?: string; onClick: () => void;
}) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
        on ? "border-slate-900 bg-slate-50" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className={`grid h-5 w-5 flex-shrink-0 place-items-center rounded ${
        on ? "bg-[#fd4605] text-white" : "border border-slate-300 bg-white"
      }`}>
        {on && <Check className="h-3.5 w-3.5" strokeWidth={3.5} />}
      </span>
      <Icon className={`h-4 w-4 flex-shrink-0 ${on ? "text-slate-900" : "text-slate-400"}`} />
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-slate-900">{label}</span>
        {!!sub && <span className="block text-[11.5px] text-slate-500">{sub}</span>}
      </span>
    </button>
  );
}

function RadioRow({ on, label, hint, onClick }: { on: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className={`flex w-full items-center gap-2.5 rounded-lg border p-2.5 text-left transition ${
        on ? "border-[#fd4605] bg-rose-50/50" : "border-slate-200 hover:border-slate-300"
      }`}
    >
      <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded-full border-2 ${
        on ? "border-[#fd4605]" : "border-slate-300"
      }`}>
        {on && <span className="h-1.5 w-1.5 rounded-full bg-[#fd4605]" />}
      </span>
      <span>
        <span className="block text-[13px] font-semibold text-slate-900">{label}</span>
        <span className="block text-[11.5px] text-slate-500">{hint}</span>
      </span>
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Country picker

   A searchable multi-select over the server's own ISO list, so an operator
   cannot save a code the rest of the platform would reject. Replaces a
   free-text "NP, IN, US" box that accepted any two characters and silently
   dropped anything else on save.
═══════════════════════════════════════════════════════════════════════════ */
function CountryPicker({
  all, selected, onChange,
}: {
  all: Country[]; selected: string[]; onChange: (next: string[]) => void;
}) {
  const [q, setQ] = useState("");

  const chosen = useMemo(() => new Set(selected.map((c) => c.toUpperCase())), [selected]);
  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return all;
    return all.filter(
      (c) => c.name.toLowerCase().includes(term) || c.code.toLowerCase().includes(term),
    );
  }, [all, q]);

  const nameOf = useMemo(
    () => Object.fromEntries(all.map((c) => [c.code, c.name])),
    [all],
  );

  function toggle(code: string) {
    onChange(chosen.has(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }

  if (all.length === 0) {
    return <p className="text-[12.5px] text-slate-400">Country list unavailable.</p>;
  }

  return (
    <div className="rounded-xl border border-slate-200">
      {/* Search + bulk actions */}
      <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 p-2.5">
        <div className="flex min-w-[12rem] flex-1 items-center gap-2 rounded-lg bg-slate-50 px-2.5 py-1.5">
          <Search className="h-3.5 w-3.5 flex-shrink-0 text-slate-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search countries"
            className="w-full bg-transparent text-[12.5px] outline-none"
          />
        </div>
        <span className="text-[12px] font-bold text-slate-500">
          {selected.length} selected
        </span>
        <Button
          variant="outline" size="sm"
          onClick={() => onChange(filtered.map((c) => c.code))}
          title={q ? "Select every match" : "Select every country"}
        >
          {q ? "Select matches" : "Select all"}
        </Button>
        <Button variant="outline" size="sm" onClick={() => onChange([])} disabled={selected.length === 0}>
          Clear
        </Button>
      </div>

      {/* Chips for what is already chosen - a 200-row list is no way to see
          your own selection. */}
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-b border-slate-100 p-2.5">
          {selected.map((code) => (
            <button
              key={code}
              type="button"
              onClick={() => toggle(code)}
              className="flex items-center gap-1 rounded-full bg-slate-900 px-2 py-1 text-[11.5px] font-semibold text-white transition hover:bg-slate-700"
            >
              {nameOf[code] ?? code}
              <X className="h-3 w-3" />
            </button>
          ))}
        </div>
      )}

      {/* The list */}
      <div className="max-h-64 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="p-3 text-[12.5px] text-slate-400">No country matches &ldquo;{q}&rdquo;.</p>
        ) : (
          filtered.map((c) => {
            const on = chosen.has(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggle(c.code)}
                className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] transition ${
                  on ? "bg-rose-50/50" : "hover:bg-slate-50"
                }`}
              >
                <span className={`grid h-4 w-4 flex-shrink-0 place-items-center rounded ${
                  on ? "bg-[#fd4605] text-white" : "border border-slate-300 bg-white"
                }`}>
                  {on && <Check className="h-3 w-3" strokeWidth={4} />}
                </span>
                <span className="w-8 flex-shrink-0 font-mono text-[11.5px] text-slate-400">{c.code}</span>
                <span className="min-w-0 flex-1 truncate text-slate-800">{c.name}</span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-semibold text-slate-600">{label}</span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-mono text-[12px] font-bold text-slate-900">{value}</dd>
    </div>
  );
}
