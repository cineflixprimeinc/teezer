"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Check, ChevronDown, Eye, EyeOff, ExternalLink, Loader2, Plug, RotateCcw, ShieldCheck, XCircle,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiMessage } from "@/services/api";
import {
  integrationsService, INTEGRATIONS_HIDDEN,
  type Integration, type IntegrationField,
} from "@/services/integrations.service";

export default function IntegrationsPage() {
  const { data, isLoading } = useQuery({ queryKey: ["integrations"], queryFn: integrationsService.list });

  const providers = useMemo(
    () => (data?.providers ?? []).filter((p) => !INTEGRATIONS_HIDDEN.has(p.provider)),
    [data],
  );
  const grouped = useMemo(() => {
    const out: Record<string, Integration[]> = {};
    for (const p of providers) (out[p.group] ??= []).push(p);
    return out;
  }, [providers]);

  const readyCount = providers.filter((p) => p.ready).length;

  return (
    <AdminShell title="Integrations">
      <div className="mx-auto max-w-[840px] space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fe2c55]/10 text-[#fe2c55]">
              <Plug size={20} />
            </div>
            <div>
              <h1 className="text-[19px] font-bold leading-tight text-[#111827]">Third-Party Integrations</h1>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">
                Storage, push, CAPTCHA and other provider keys used by the backend. Set your own here after
                buying this codebase &mdash; nothing below ships enabled with a key already in it.
              </p>
            </div>
          </div>
          {data && (
            <div className="rounded-xl border border-[#e8eaed] bg-white px-3.5 py-2 text-right shadow-sm">
              <p className="text-[20px] font-bold leading-none text-[#111827]">
                {readyCount}
                <span className="text-[13px] font-medium text-[#9ca3af]"> / {providers.length}</span>
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">Ready</p>
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-[12.5px] leading-relaxed text-[#334155]">
            Secret fields are <span className="font-semibold">encrypted at rest</span> and this page never
            shows a saved value back to you &mdash; only whether it&rsquo;s set and its last 4 characters, so a
            screenshot of this page can&rsquo;t leak a live key. Payment providers (PayPal, Stripe) have their
            own page under <span className="font-semibold">Monetization &rsaquo; Payment Providers</span>.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 py-10 text-[13px] text-[#6b7280]">
            <Loader2 size={16} className="animate-spin" /> Loading integrations&hellip;
          </div>
        )}

        {data && Object.entries(data.groups)
          .filter(([key]) => grouped[key]?.length)
          .map(([groupKey, groupLabel]) => (
            <section key={groupKey} className="space-y-3">
              <h2 className="px-1 text-[12px] font-bold uppercase tracking-wide text-[#9ca3af]">{groupLabel}</h2>
              <div className="space-y-4">
                {grouped[groupKey].map((p) => (
                  <ProviderCard key={p.provider} provider={p} />
                ))}
              </div>
            </section>
          ))}
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

  const dirty = Object.keys(draft).length > 0;

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
      <header
        className="flex cursor-pointer items-center justify-between gap-4 px-5 py-4"
        onClick={() => setOpen((o) => !o)}
      >
        <div className="flex min-w-0 items-center gap-3.5">
          <ChevronDown
            size={16}
            className={`shrink-0 text-[#9ca3af] transition-transform ${open ? "rotate-0" : "-rotate-90"}`}
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="truncate text-[15px] font-bold text-[#111827]">{provider.label}</h3>
              <SourceBadge provider={provider} />
              <StatusPill provider={provider} />
            </div>
            {provider.notes && (
              <p className="mt-0.5 text-[12px] text-[#6b7280]">{provider.notes}</p>
            )}
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
        </div>
      </header>

      {open && (
        <div className="border-t border-[#f1f2f4] bg-[#fafbfc] px-5 py-5">
          <div className="grid grid-cols-1 gap-4">
            {Object.entries(provider.fields).map(([key, meta]) => (
              <FieldInput
                key={key}
                meta={meta}
                value={draft[key] ?? ""}
                onChange={(v) => setDraft((d) => ({ ...d, [key]: v }))}
              />
            ))}
          </div>

          {provider.last_error && (
            <p className="mt-3 flex items-start gap-1.5 text-[12px] leading-relaxed text-red-600">
              <XCircle size={13} className="mt-0.5 shrink-0" /> {provider.last_error}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-[#eef0f2] pt-4">
            <Button
              variant={dirty ? "primary" : "outline"}
              size="md"
              disabled={!dirty || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 size={15} className="animate-spin" /> : "Save changes"}
            </Button>

            {provider.testable && (
              <Button variant="outline" size="md" disabled={test.isPending} onClick={() => test.mutate()}>
                {test.isPending ? <Loader2 size={15} className="animate-spin" /> : "Test connection"}
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
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label className="text-[12px] font-semibold text-[#374151]">{meta.label}</label>
        {meta.required && (
          <Badge variant="outline" className="px-2 py-0 text-[10px] font-medium">Required</Badge>
        )}
        {meta.secret && meta.is_set && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Check size={10} /> Set
          </span>
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
          className={`h-10 w-full rounded-[10px] border bg-white px-3 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10 ${
            meta.secret ? "pr-10 font-mono" : ""
          } ${value ? "border-[#fe2c55]/60" : "border-[#e8eaed]"}`}
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
        on ? "bg-[#fe2c55]" : "bg-[#d5d8dd]"
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
