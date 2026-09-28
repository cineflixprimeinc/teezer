"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Camera, Check, ChevronDown, CreditCard, Eye, EyeOff, ExternalLink, HardDrive,
  Loader2, Mail, Music, Plug, RotateCcw, Search, Server, ShieldCheck, Sparkles,
  TriangleAlert, XCircle,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Badge } from "@/admin-panel/components/ui/badge";
import { Button } from "@/admin-panel/components/ui/button";
import { Input } from "@/admin-panel/components/ui/input";
import { apiMessage } from "@/admin-panel/services/api";
import {
  integrationsService, INTEGRATIONS_HIDDEN,
  type Integration, type IntegrationField,
} from "@/admin-panel/services/integrations.service";

/**
 * Third-Party Integrations.
 *
 * The previous layout was a single 840px column of accordions. That was right
 * for the ten providers it was built for; at twenty-four across seven groups it
 * became a long scroll with no way to find anything, no search, and no sense of
 * which providers actually needed attention.
 *
 * Now: a sticky group rail on the left, one group at a time on the right, and a
 * search that cuts across every group at once. Nothing about the save / test /
 * toggle / reset behaviour changed - only how you get to it.
 */

/** Group icon + accent. Presentation only; the groups themselves come from the API. */
const GROUP_STYLE: Record<string, { icon: React.ElementType; color: string }> = {
  music:         { icon: Music,      color: "#8b5cf6" },
  storage:       { icon: HardDrive,  color: "#3b82f6" },
  communication: { icon: Mail,       color: "#0ea5e9" },
  payments:      { icon: CreditCard, color: "#10b981" },
  intelligence:  { icon: Sparkles,   color: "#f59e0b" },
  platform:      { icon: Server,     color: "#6366f1" },
  ar:            { icon: Camera,     color: "#ec4899" },
};

type StatusFilter = "all" | "attention" | "active" | "off";

export default function IntegrationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["integrations"], queryFn: integrationsService.list });

  const [group, setGroup]   = useState<string | null>(null);
  const [query, setQuery]   = useState("");
  const [filter, setFilter] = useState<StatusFilter>("all");

  const providers = useMemo(
    () => (data?.providers ?? []).filter((p) => !INTEGRATIONS_HIDDEN.has(p.provider)),
    [data],
  );

  const byGroup = useMemo(() => {
    const out: Record<string, Integration[]> = {};
    for (const p of providers) (out[p.group] ??= []).push(p);
    return out;
  }, [providers]);

  const groupKeys = useMemo(
    () => Object.entries(data?.groups ?? {}).filter(([k]) => byGroup[k]?.length),
    [data, byGroup],
  );

  const activeGroup = group ?? groupKeys[0]?.[0] ?? null;

  const needsAttention = (p: Integration) =>
    (p.enabled && !p.ready) || p.status === "failed";

  /**
   * A search looks across EVERY group, because you rarely know which group a
   * provider was filed under - that is the whole reason to search. A status
   * filter stays inside the current group, because it is a way of working
   * through one section.
   */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();

    const pool = q
      ? providers.filter((p) =>
          p.label.toLowerCase().includes(q) ||
          p.provider.toLowerCase().includes(q) ||
          (p.notes ?? "").toLowerCase().includes(q))
      : (activeGroup ? byGroup[activeGroup] ?? [] : []);

    return pool.filter((p) => {
      if (filter === "attention") return needsAttention(p);
      if (filter === "active")    return p.enabled && p.ready;
      if (filter === "off")       return !p.enabled;
      return true;
    });
  }, [query, providers, activeGroup, byGroup, filter]);

  const readyCount     = providers.filter((p) => p.ready).length;
  const activeCount    = providers.filter((p) => p.enabled && p.ready).length;
  const attentionCount = providers.filter(needsAttention).length;

  return (
    <AdminShell title="Integrations">
      <div className="flex flex-col gap-5 pb-10">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[#fd4605]/10 text-[#fd4605]">
              <Plug size={20} />
            </div>
            <div>
              <h2 className="text-[19px] font-bold leading-tight text-[#111827]">Third-Party Integrations</h2>
              <p className="mt-0.5 max-w-2xl text-[13px] text-[#6b7280]">
                Provider keys used by the backend. Set your own here after buying this codebase — nothing
                ships enabled with a key already in it.
              </p>
            </div>
          </div>

          <div className="flex gap-2.5">
            <Tile value={activeCount} label="Active" tone="good" />
            <Tile value={readyCount} label="Configured" sub={`of ${providers.length}`} />
            <Tile value={attentionCount} label="Need attention" tone={attentionCount ? "bad" : undefined} />
          </div>
        </div>

        {/* ── Security note ──────────────────────────────────────────── */}
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-[12.5px] leading-relaxed text-[#334155]">
            Secret fields are <span className="font-semibold">encrypted at rest</span>, and this page never
            shows a saved value back — only whether it is set and its last 4 characters, so a screenshot
            cannot leak a live key. Payment providers have their own page under{" "}
            <span className="font-semibold">Monetization › Payment Providers</span>.
          </p>
        </div>

        {attentionCount > 0 && (
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <TriangleAlert size={16} className="mt-0.5 shrink-0 text-amber-600" />
            <p className="text-[12.5px] text-amber-800">
              <strong>{attentionCount}</strong>{" "}
              {attentionCount === 1 ? "integration is" : "integrations are"} switched on but missing keys or
              failing their last test — so calls to {attentionCount === 1 ? "it" : "them"} are failing
              silently.{" "}
              <button
                type="button"
                onClick={() => { setFilter("attention"); setQuery(""); }}
                className="font-semibold underline underline-offset-2 hover:text-amber-950"
              >
                Show them
              </button>
            </p>
          </div>
        )}

        {isLoading && (
          <div className="flex items-center gap-2 py-16 text-[13px] text-[#6b7280]">
            <Loader2 size={16} className="animate-spin" /> Loading integrations…
          </div>
        )}

        {data && (
          <div className="grid gap-5 lg:grid-cols-[228px_minmax(0,1fr)]">
            {/* ── Group rail ─────────────────────────────────────────── */}
            <aside className="lg:sticky lg:top-4 lg:self-start">
              <div className="relative mb-3">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#9ca3af]" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search providers"
                  className="pl-9"
                />
              </div>

              <nav className="flex gap-1.5 overflow-x-auto lg:flex-col lg:overflow-visible">
                {groupKeys.map(([key, label]) => {
                  const style   = GROUP_STYLE[key] ?? { icon: Plug, color: "#6b7280" };
                  const items   = byGroup[key] ?? [];
                  const warn    = items.filter(needsAttention).length;
                  const on      = !query && activeGroup === key;
                  const Icon    = style.icon;

                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => { setGroup(key); setQuery(""); }}
                      className={[
                        "flex shrink-0 items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors lg:w-full",
                        on ? "bg-white shadow-sm ring-1 ring-[#e8eaed]" : "hover:bg-white/70",
                      ].join(" ")}
                    >
                      <span
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg"
                        style={{ backgroundColor: style.color + "18", color: style.color }}
                      >
                        <Icon size={14} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block truncate text-[13px] ${on ? "font-bold text-[#111827]" : "font-medium text-[#374151]"}`}>
                          {label}
                        </span>
                      </span>
                      {warn > 0 ? (
                        <span className="grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">
                          {warn}
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] font-semibold text-[#c3c7d1]">{items.length}</span>
                      )}
                    </button>
                  );
                })}
              </nav>
            </aside>

            {/* ── Providers ──────────────────────────────────────────── */}
            <div className="min-w-0 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-[15px] font-bold text-[#111827]">
                  {query
                    ? `${visible.length} match${visible.length === 1 ? "" : "es"} for “${query}”`
                    : data.groups[activeGroup ?? ""] ?? "Integrations"}
                </h3>
                <div className="ml-auto flex gap-1">
                  {(["all", "attention", "active", "off"] as StatusFilter[]).map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setFilter(f)}
                      className={[
                        "rounded-full px-2.5 py-1 text-[11.5px] font-semibold capitalize transition-colors",
                        filter === f
                          ? "bg-[#111827] text-white"
                          : "bg-white text-[#6b7280] ring-1 ring-[#e8eaed] hover:text-[#111827]",
                      ].join(" ")}
                    >
                      {f === "attention" ? "Needs attention" : f}
                    </button>
                  ))}
                </div>
              </div>

              {visible.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#e8eaed] bg-white px-6 py-14 text-center">
                  <p className="text-[13px] font-semibold text-[#374151]">Nothing here</p>
                  <p className="mt-1 text-[12.5px] text-[#9ca3af]">
                    {query ? "No provider matches that search." : "No integration matches this filter."}
                  </p>
                </div>
              ) : (
                visible.map((p) => <ProviderCard key={p.provider} provider={p} />)
              )}
            </div>
          </div>
        )}
      </div>
    </AdminShell>
  );
}

/* ── Provider card ─────────────────────────────────────────────────────────── */

function ProviderCard({ provider }: { provider: Integration }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["integrations"] });

  const save = useMutation({
    mutationFn: () => integrationsService.update(provider.provider, { fields: draft }),
    onSuccess: () => { toast.success(`${provider.label} saved.`); setDraft({}); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => integrationsService.update(provider.provider, { enabled }),
    onSuccess: (_d, enabled) => toast.success(`${provider.label} ${enabled ? "enabled" : "disabled"}.`),
    onError: (e) => toast.error(apiMessage(e)),
    onSettled: invalidate,
  });

  const test = useMutation({
    mutationFn: () => integrationsService.test(provider.provider),
    onSuccess: (res) => { if (res.success) toast.success(res.message); else toast.error(res.message); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const reset = useMutation({
    mutationFn: () => integrationsService.reset(provider.provider),
    onSuccess: () => { toast.success(`${provider.label} reset to .env configuration.`); setDraft({}); invalidate(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  const dirty  = Object.keys(draft).length > 0;
  const fields = Object.entries(provider.fields);
  const setCount = fields.filter(([, m]) => m.is_set || (m.value ?? "") !== "").length;
  const style  = GROUP_STYLE[provider.group] ?? { icon: Plug, color: "#6b7280" };
  const Icon   = style.icon;

  return (
    <section
      className={[
        "overflow-hidden rounded-2xl border bg-white transition-shadow",
        open ? "border-[#dfe3e8] shadow-md" : "border-[#e8eaed] shadow-sm hover:shadow-md",
      ].join(" ")}
    >
      <header
        className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3.5 sm:px-5"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="grid h-9 w-9 shrink-0 place-items-center rounded-xl"
            style={{ backgroundColor: style.color + "16", color: style.color }}
          >
            <Icon size={16} />
          </span>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[14.5px] font-bold text-[#111827]">{provider.label}</h3>
              <SourceBadge provider={provider} />
              <StatusPill provider={provider} />
            </div>
            <p className="mt-0.5 truncate text-[12px] text-[#6b7280]">
              {provider.notes ?? `${fields.length} field${fields.length === 1 ? "" : "s"}`}
              {fields.length > 0 && (
                <span className="text-[#9ca3af]"> · {setCount}/{fields.length} set</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-3" onClick={(e) => e.stopPropagation()}>
          {provider.docs && (
            <a
              href={provider.docs}
              target="_blank"
              rel="noreferrer"
              className="hidden items-center gap-1 text-[11.5px] font-medium text-[#6b7280] hover:text-[#374151] sm:inline-flex"
            >
              Docs <ExternalLink size={11} />
            </a>
          )}
          <Switch on={provider.enabled} busy={toggle.isPending} onChange={(v) => toggle.mutate(v)} />
          <ChevronDown
            size={16}
            className={`shrink-0 text-[#c3c7d1] transition-transform ${open ? "rotate-180" : ""}`}
          />
        </div>
      </header>

      {open && (
        <div className="border-t border-[#f1f2f4] bg-[#fafbfc] px-4 py-5 sm:px-5">
          {/* Two columns once there is enough to justify it - a single column of
              seven fields (Bunny) is a lot of vertical scrolling for no reason. */}
          <div className={`grid gap-4 ${fields.length > 3 ? "sm:grid-cols-2" : "grid-cols-1"}`}>
            {fields.map(([key, meta]) => (
              <FieldInput
                key={key}
                meta={meta}
                value={draft[key] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
              />
            ))}
          </div>

          {provider.last_error && (
            <p className="mt-4 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] leading-relaxed text-red-700">
              <XCircle size={13} className="mt-0.5 shrink-0" /> {provider.last_error}
            </p>
          )}

          {!provider.testable && (
            <p className="mt-4 text-[12px] leading-relaxed text-[#9ca3af]">
              No connection test for this provider — its licence is validated by the vendor in the browser
              or on the device, so a server-side check would pass without proving anything.
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#eef0f2] pt-4">
            <Button
              variant={dirty ? "primary" : "outline"}
              size="md"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 size={15} className="animate-spin" /> : dirty ? "Save changes" : "Saved"}
            </Button>

            {provider.testable && (
              <Button variant="outline" size="md" disabled={test.isPending} onClick={() => test.mutate()}>
                {test.isPending
                  ? <><Loader2 size={15} className="animate-spin" /> Testing…</>
                  : "Test connection"}
              </Button>
            )}

            <Button
              variant="ghost"
              size="md"
              disabled={reset.isPending}
              onClick={() => reset.mutate()}
              className="ml-auto text-[#9ca3af] hover:text-red-600"
              title="Drop saved keys and fall back to .env"
            >
              <RotateCcw size={13} className="mr-1.5" /> Reset to .env
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ── Field input ────────────────────────────────────────────────────────────── */

function FieldInput({
  meta, value, onChange,
}: {
  meta: IntegrationField;
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  // Non-secret fields start pre-filled with the current value so an admin can
  // see and lightly edit them; secret fields always start blank - the server
  // never sends the real value back, so there is nothing correct to prefill.
  const display = meta.secret ? value : (value || meta.value || "");

  return (
    <div className="min-w-0">
      <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
        <label className="text-[12px] font-semibold text-[#374151]">{meta.label}</label>
        {meta.required && (
          <Badge variant="outline" className="px-1.5 py-0 text-[10px] font-medium">Required</Badge>
        )}
        {meta.secret && meta.is_set && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Check size={10} /> Set
          </span>
        )}
        {meta.source === "env" && (
          <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">.env</span>
        )}
      </div>

      <div className="relative">
        <input
          type={meta.secret && !show ? "password" : "text"}
          value={display}
          placeholder={
            meta.secret && meta.is_set
              ? `${meta.value ?? "••••••••"}  ·  type to replace`
              : meta.secret
                ? `Enter ${meta.label.toLowerCase()}`
                : meta.value || `Enter ${meta.label.toLowerCase()}`
          }
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          className={`h-10 w-full rounded-[10px] border bg-white px-3 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 ${
            meta.secret ? "pr-10 font-mono" : ""
          } ${value ? "border-[#fd4605]/60" : "border-[#e8eaed]"}`}
        />
        {meta.secret && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#9ca3af] transition-colors hover:text-[#374151]"
            aria-label={show ? "Hide" : "Show"}
            tabIndex={-1}
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────────── */

function Tile({
  value, label, sub, tone,
}: {
  value: number;
  label: string;
  sub?: string;
  tone?: "good" | "bad";
}) {
  const color = tone === "good" ? "text-emerald-600" : tone === "bad" ? "text-amber-600" : "text-[#111827]";

  return (
    <div className="rounded-xl border border-[#e8eaed] bg-white px-3.5 py-2 text-right shadow-sm">
      <p className={`text-[20px] font-bold leading-none tabular-nums ${color}`}>
        {value}
        {sub && <span className="text-[13px] font-medium text-[#9ca3af]"> {sub}</span>}
      </p>
      <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">{label}</p>
    </div>
  );
}

function SourceBadge({ provider }: { provider: Integration }) {
  // Only worth calling out when something other than a saved DB value is in
  // effect - a fresh install running purely off .env, or nothing configured.
  const sources = Object.values(provider.fields).map((f) => f.source);
  if (sources.some((s) => s === "database")) return null;
  if (sources.every((s) => s === "default") || sources.length === 0) return null;
  return sources.some((s) => s === "env")
    ? <Badge variant="info">from .env</Badge>
    : null;
}

function StatusPill({ provider }: { provider: Integration }) {
  if (!provider.ready) return <Badge variant="warning">Needs keys</Badge>;
  if (provider.status === "connected") return <Badge variant="success">Connected</Badge>;
  if (provider.status === "failed") return <Badge variant="danger">Test failed</Badge>;
  return provider.enabled ? <Badge variant="success">Active</Badge> : <Badge variant="default">Off</Badge>;
}

function Switch({ on, busy, onChange }: { on: boolean; busy?: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={busy}
      onClick={() => onChange(!on)}
      className={`relative inline-flex h-7 w-[52px] shrink-0 items-center rounded-full transition-colors disabled:opacity-60 ${
        on ? "bg-[#fd4605]" : "bg-[#d5d8dd]"
      }`}
    >
      <span
        className={`grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-[24px]" : "translate-x-0.5"
        }`}
      >
        {busy && <Loader2 size={12} className="animate-spin text-[#9ca3af]" />}
      </span>
    </button>
  );
}
