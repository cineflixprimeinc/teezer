"use client";

import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Zap, Search, RefreshCw, ShieldCheck, Video, Users, DollarSign,
  Compass, AlertTriangle, Power, PowerOff,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";

/* ── Feature catalogue ───────────────────────────────────────────────────────
   `impact` is what actually breaks for a real person when the flag goes off,
   written so an operator can weigh the switch without reading the codebase.
   `critical` marks the ones that take a core surface of the product away; those
   ask for confirmation before being turned off rather than flipping instantly. */
type FeatureMeta = {
  label: string; desc: string; impact: string; group: GroupKey; critical?: boolean;
};

type GroupKey = "Core" | "Creator" | "Monetization" | "Content" | "Discovery" | "Security";

/* Icons carry meaning through shape, not colour: the palette here is the
   panel's neutral greys plus the one Reelsoo accent, used only to mark what is
   selected or on. */
const GROUPS: { key: GroupKey; label: string; icon: React.ElementType; blurb: string }[] = [
  { key: "Core",         label: "Core Platform", icon: Zap,         blurb: "The surfaces the app is built around." },
  { key: "Creator",      label: "Creator Tools", icon: Users,       blurb: "Studio, verification and progression." },
  { key: "Monetization", label: "Monetization",  icon: DollarSign,  blurb: "Money in and money out." },
  { key: "Content",      label: "Content",       icon: Video,       blurb: "What viewers can do with a post." },
  { key: "Discovery",    label: "Discovery",     icon: Compass,     blurb: "How people find things." },
  { key: "Security",     label: "Security",      icon: ShieldCheck, blurb: "Account and regional controls." },
];

const FEATURE_META: Record<string, FeatureMeta> = {
  feature_live:           { label: "Live Streaming",     desc: "Allow users to go live",                 impact: "Nobody can start or watch a live stream.",              group: "Core",         critical: true },
  feature_stories:        { label: "Stories",            desc: "Story creation and viewing",             impact: "The stories tray disappears for everyone.",             group: "Core",         critical: true },
  feature_messages:       { label: "Direct Messages",    desc: "1-to-1 and group messaging",             impact: "Inbox and all conversations become unreachable.",       group: "Core",         critical: true },
  feature_audio_rooms:    { label: "Audio Rooms",        desc: "Live audio room spaces",                 impact: "Spaces cannot be opened or joined.",                    group: "Core" },
  feature_notifications:  { label: "Push Notifications", desc: "Real-time push delivery",                impact: "No push reaches any device; in-app alerts still work.", group: "Core" },
  feature_studio:         { label: "Creator Studio",     desc: "Access to the studio dashboard",         impact: "Creators lose analytics, uploads and earnings views.",  group: "Creator",      critical: true },
  feature_verification:   { label: "Verification",       desc: "Creator verification badge system",      impact: "New verification requests cannot be submitted.",        group: "Creator" },
  feature_creator_levels: { label: "Creator Levels",     desc: "XP-based level progression",             impact: "Levels stop advancing and level rewards pause.",        group: "Creator" },
  feature_monetization:   { label: "Monetization",       desc: "Creator earnings and revenue share",     impact: "Earnings stop accruing and payouts cannot be raised.",  group: "Monetization", critical: true },
  feature_wallet:         { label: "Wallet & Coins",     desc: "Virtual currency and gifting",           impact: "Coin purchases and gifting are blocked platform-wide.", group: "Monetization", critical: true },
  feature_ads:            { label: "Ads Manager",        desc: "Platform advertising system",            impact: "Advertisers cannot create or run campaigns.",           group: "Monetization" },
  feature_comments:       { label: "Comments",           desc: "Video comments and replies",             impact: "Comment sections close across every post.",             group: "Content",      critical: true },
  feature_downloads:      { label: "Video Downloads",    desc: "Allow viewers to download videos",       impact: "The download option is removed from every post.",       group: "Content" },
  feature_duet:           { label: "Duet",               desc: "Side-by-side video collaboration",       impact: "Duet is hidden from the share sheet.",                  group: "Content" },
  feature_stitch:         { label: "Stitch",             desc: "Clip and respond to other videos",       impact: "Stitch is hidden from the share sheet.",                group: "Content" },
  feature_search:         { label: "Search",             desc: "Platform-wide search",                   impact: "The search tab returns nothing for anyone.",            group: "Discovery",    critical: true },
  feature_country_lock:   { label: "Country Lock",       desc: "Enforce the 60-day country change lock", impact: "Users may change their country without the 60-day wait.", group: "Security" },
};

/* Anything the server has in the `features` group that this catalogue does not
   describe. Rendering the API's own keys rather than only the ones hardcoded
   here means a flag added on the server can still be seen and switched - the
   previous page iterated the catalogue, so such a flag was invisible. */
const UNKNOWN_GROUP = "Uncatalogued";

function FeatureSwitch({ on, busy, onToggle, label }: {
  on: boolean; busy: boolean; onToggle: () => void; label: string;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2.5">
      <span className={`text-[11px] font-bold uppercase tracking-wide tabular-nums ${on ? "text-[#fd4605]" : "text-[#9ca3af]"}`}>
        {on ? "On" : "Off"}
      </span>
      <button
        type="button" role="switch" aria-checked={on} aria-label={label}
        disabled={busy} onClick={onToggle}
        className={`relative h-[26px] w-[46px] shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#fd4605]/30 disabled:opacity-60
          ${on ? "bg-[#fd4605]" : "bg-[#d1d5db]"}`}>
        <span className={`absolute top-[3px] h-5 w-5 rounded-full bg-white shadow-sm transition-all duration-200 ${on ? "left-[23px]" : "left-[3px]"}`} />
      </button>
    </div>
  );
}

export default function FeaturesPage() {
  const qc = useQueryClient();
  const [q, setQ]                 = useState("");
  const [activeGroup, setActive]  = useState<string>("all");
  const [confirming, setConfirm]  = useState<{ key: string; label: string; impact: string } | null>(null);

  const { data: features, isLoading, isFetching, refetch } = useQuery({
    queryKey: ["admin-features"],
    queryFn:  adminService.features,
  });

  const featureMap = (features ?? {}) as Record<string, boolean>;

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      adminService.toggleFeature(key, enabled),
    onMutate: async ({ key, enabled }) => {
      // Optimistic, with the previous map kept so a refusal can put the switch
      // back rather than leaving it claiming a change that did not happen.
      await qc.cancelQueries({ queryKey: ["admin-features"] });
      const prev = qc.getQueryData(["admin-features"]);
      qc.setQueryData(["admin-features"], (old: Record<string, boolean> | undefined) => ({ ...(old ?? {}), [key]: enabled }));
      return { prev };
    },
    onSuccess: (_res, { key, enabled }) => {
      toast.success(`${FEATURE_META[key]?.label ?? key} turned ${enabled ? "on" : "off"}`);
    },
    onError: (_e, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(["admin-features"], ctx.prev);
      toast.error("Couldn't save that change");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["admin-features"] }),
  });

  /* Server keys are the source of truth; the catalogue only decorates them. */
  const rows = useMemo(() => {
    const keys = new Set([...Object.keys(featureMap), ...Object.keys(FEATURE_META)]);
    return Array.from(keys).map(key => {
      const meta = FEATURE_META[key];
      return {
        key,
        label:    meta?.label ?? key.replace(/^feature_/, "").replace(/_/g, " "),
        desc:     meta?.desc  ?? "No description recorded for this flag.",
        impact:   meta?.impact ?? "Effect of this flag is not documented.",
        group:    (meta?.group ?? UNKNOWN_GROUP) as string,
        critical: meta?.critical ?? false,
        known:    !!meta,
        on:       featureMap[key] ?? false,
      };
    });
  }, [featureMap]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return rows.filter(r => {
      if (activeGroup !== "all" && r.group !== activeGroup) return false;
      if (!needle) return true;
      return r.label.toLowerCase().includes(needle)
          || r.key.toLowerCase().includes(needle)
          || r.desc.toLowerCase().includes(needle);
    });
  }, [rows, q, activeGroup]);

  const total    = rows.length;
  const enabled  = rows.filter(r => r.on).length;
  const disabled = total - enabled;
  const offCritical = rows.filter(r => r.critical && !r.on);

  const groupsToRender = [
    ...GROUPS.map(g => ({ ...g, name: g.key as string })),
    ...(rows.some(r => r.group === UNKNOWN_GROUP)
      ? [{ key: UNKNOWN_GROUP, name: UNKNOWN_GROUP, label: "Uncatalogued", icon: AlertTriangle, blurb: "Flags on the server with no catalogue entry." }]
      : []),
  ];

  const countIn = (name: string) => rows.filter(r => r.group === name).length;

  const requestToggle = (r: { key: string; label: string; impact: string; critical: boolean; on: boolean }) => {
    // Turning something ON is never destructive; turning a core surface OFF is.
    if (r.on && r.critical) { setConfirm({ key: r.key, label: r.label, impact: r.impact }); return; }
    toggle.mutate({ key: r.key, enabled: !r.on });
  };

  return (
    <AdminShell title="Feature Management">
      <div className="space-y-5">

        {/* ── Header ── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-[#fff3ec] text-[#fd4605]">
              <Zap className="h-[22px] w-[22px]" />
            </span>
            <div>
              <h2 className="text-[20px] font-extrabold tracking-[-0.01em] text-[#111827]">Feature Management</h2>
              <p className="text-[13px] text-[#6b7280]">
                Switch platform features on or off. Changes apply immediately, to web and app alike.
              </p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* ── Counters ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Total features", value: total,              icon: <Zap className="h-[15px] w-[15px]"/>,           alert: false },
            { label: "Enabled",        value: enabled,            icon: <Power className="h-[15px] w-[15px]"/>,         alert: false },
            { label: "Disabled",       value: disabled,           icon: <PowerOff className="h-[15px] w-[15px]"/>,      alert: false },
            // The only counter that ever wants attention: a core surface being
            // off is a state to notice, the rest are just facts.
            { label: "Core off",       value: offCritical.length, icon: <AlertTriangle className="h-[15px] w-[15px]"/>, alert: offCritical.length > 0 },
          ].map(c => (
            <div key={c.label} className="flex items-center gap-3 rounded-2xl border border-[#e8eaed] bg-white p-4 shadow-sm">
              <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${c.alert ? "bg-[#fff3ec] text-[#fd4605]" : "bg-[#f4f5f7] text-[#6b7280]"}`}>
                {c.icon}
              </span>
              <div className="min-w-0">
                <p className="text-[11px] text-[#9ca3af] truncate">{c.label}</p>
                <p className={`text-[19px] font-black leading-tight tabular-nums ${c.alert ? "text-[#fd4605]" : "text-[#111827]"}`}>{c.value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* A core surface being off is the single thing worth interrupting for -
            it is usually a leftover from an incident, not a decision. */}
        {offCritical.length > 0 && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-[#ffd9e2] bg-[#fff3ec] px-4 py-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[#fd4605]" />
            <p className="text-[12.5px] leading-relaxed text-[#7a1229]">
              <span className="font-bold">
                {offCritical.length} core feature{offCritical.length === 1 ? " is" : "s are"} switched off
              </span>{" "}
              — {offCritical.map(f => f.label).join(", ")}. These remove a whole surface of the product for every user.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-4 lg:flex-row">
          {/* ── Group rail ── */}
          <aside className="lg:w-[220px] lg:shrink-0">
            <div className="rounded-2xl border border-[#e8eaed] bg-white p-2 shadow-sm">
              <button onClick={() => setActive("all")}
                className={`relative flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors
                  ${activeGroup === "all" ? "bg-[#fff3ec] text-[#fd4605]" : "text-[#374151] hover:bg-[#f7f8fa]"}`}>
                {activeGroup === "all" && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#fd4605]" />}
                <Zap className={`h-4 w-4 shrink-0 ${activeGroup === "all" ? "text-[#fd4605]" : "text-[#9ca3af]"}`} />
                <span className="truncate">All features</span>
                <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums
                  ${activeGroup === "all" ? "bg-[#fd4605]/12 text-[#fd4605]" : "bg-[#f3f4f6] text-[#9ca3af]"}`}>{total}</span>
              </button>

              {groupsToRender.map(g => {
                const active = activeGroup === g.name;
                const n = countIn(g.name);
                if (n === 0) return null;
                const Icon = g.icon;
                return (
                  <button key={g.name} onClick={() => setActive(g.name)}
                    className={`relative flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13px] font-semibold transition-colors
                      ${active ? "bg-[#fff3ec] text-[#fd4605]" : "text-[#374151] hover:bg-[#f7f8fa]"}`}>
                    {active && <span className="absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-[#fd4605]" />}
                    <Icon className={`h-4 w-4 shrink-0 ${active ? "text-[#fd4605]" : "text-[#9ca3af]"}`} />
                    <span className="truncate">{g.label}</span>
                    <span className={`ml-auto rounded-full px-1.5 py-0.5 text-[10.5px] font-bold tabular-nums
                      ${active ? "bg-[#fd4605]/12 text-[#fd4605]" : "bg-[#f3f4f6] text-[#9ca3af]"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </aside>

          {/* ── List ── */}
          <div className="min-w-0 flex-1">
            <div className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#e8eaed] px-5 py-3.5">
                <h3 className="text-[13px] font-bold text-[#111827]">
                  {activeGroup === "all" ? "All features" : (groupsToRender.find(g => g.name === activeGroup)?.label ?? activeGroup)}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3 w-3 -translate-y-1/2 text-[#9ca3af]" />
                    <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search features…"
                      className="h-8 w-48 rounded-lg border border-[#e8eaed] bg-[#f9fafb] pl-7 pr-2 text-[12px] outline-none transition focus:border-[#fd4605] focus:ring-1 focus:ring-[#fd4605]/20" />
                  </div>
                  <span className="rounded-full bg-[#f3f4f6] px-2.5 py-1 text-[11.5px] font-bold tabular-nums text-[#6b7280]">
                    {filtered.length}
                  </span>
                </div>
              </div>

              {isLoading ? (
                <div className="divide-y divide-[#f3f4f6]">
                  {Array.from({ length: 7 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="h-3 w-40 animate-pulse rounded bg-[#f1f2f4]" />
                        <div className="h-2.5 w-64 animate-pulse rounded bg-[#f6f7f8]" />
                      </div>
                      <div className="h-[26px] w-[46px] shrink-0 animate-pulse rounded-full bg-[#f1f2f4]" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-14 text-center">
                  <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-[#f3f4f6] text-[#9ca3af]">
                    <Search className="h-5 w-5" />
                  </span>
                  <p className="mt-3 text-[13px] font-semibold text-[#374151]">No features match</p>
                  <p className="mt-1 text-[12px] text-[#9ca3af]">Try a different search or group.</p>
                </div>
              ) : (
                <div className="divide-y divide-[#f3f4f6]">
                  {filtered.map(r => (
                    <div key={r.key} className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-[#fafbfc]">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="text-[13.5px] font-bold capitalize text-[#111827]">{r.label}</p>
                          {r.critical && (
                            <span className="rounded-full border border-[#ffd9e2] bg-[#fff3ec] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#fd4605]">
                              Core
                            </span>
                          )}
                          {!r.known && (
                            <span className="rounded-full border border-[#e5e7eb] bg-[#f3f4f6] px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-[#6b7280]">
                              Uncatalogued
                            </span>
                          )}
                          <code className="rounded bg-[#f4f5f7] px-1.5 py-0.5 font-mono text-[10px] text-[#9ca3af]">{r.key}</code>
                        </div>
                        <p className="mt-1 text-[12px] leading-relaxed text-[#6b7280]">{r.desc}</p>
                        {!r.on && (
                          <p className="mt-1 flex items-start gap-1 text-[11.5px] leading-relaxed text-[#9ca3af]">
                            <AlertTriangle className="mt-[1px] h-3 w-3 shrink-0" />
                            {r.impact}
                          </p>
                        )}
                      </div>
                      <FeatureSwitch on={r.on} busy={toggle.isPending} label={r.label}
                        onToggle={() => requestToggle(r)} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Confirmation for switching a core surface off ── */}
      {confirming && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setConfirm(null)} />
          <div className="relative z-10 w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
            <div className="mb-3 flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fff3ec] text-[#fd4605]">
                <AlertTriangle className="h-[18px] w-[18px]" />
              </span>
              <h3 className="text-[15px] font-bold text-[#111827]">Turn off {confirming.label}?</h3>
            </div>
            <p className="text-[12.5px] leading-relaxed text-[#6b7280]">{confirming.impact}</p>
            <p className="mt-2 text-[12px] leading-relaxed text-[#9ca3af]">
              This takes effect immediately for every user on web and app. You can turn it back on here at any time.
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button onClick={() => setConfirm(null)}
                className="rounded-xl border border-[#e8eaed] px-4 py-2 text-xs font-medium text-[#374151] transition-colors hover:bg-[#f4f5f7]">
                Cancel
              </button>
              <button
                onClick={() => { toggle.mutate({ key: confirming.key, enabled: false }); setConfirm(null); }}
                className="rounded-xl bg-red-500 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-600">
                Turn off
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
