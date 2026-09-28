"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, Eye, EyeOff, Info, KeyRound, Loader2, Plug, ShieldCheck, X } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { apiMessage } from "@/services/api";
import { socialLoginService, type SocialField, type SocialProvider } from "@/services/social-login.service";
import { BrandIcon, PROVIDER_TILE } from "./brand-icon";

export default function SocialLoginPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ["social-login"], queryFn: socialLoginService.get });

  const providers = useMemo(() => (data ? Object.entries(data) : []), [data]);
  const activeCount = providers.filter(([, p]) => p.enabled && isConfigured(p)).length;

  return (
    <AdminShell title="Social Login">
      <div className="mx-auto max-w-[840px] space-y-6 pb-10">
        {/* Header */}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#fd4605]/10 text-[#fd4605]">
              <KeyRound size={20} />
            </div>
            <div>
              <h1 className="text-[19px] font-bold leading-tight text-[#111827]">Social Login</h1>
              <p className="mt-0.5 text-[13px] text-[#6b7280]">
                OAuth keys for the &ldquo;Continue with&hellip;&rdquo; buttons on login &amp; signup.
              </p>
            </div>
          </div>
          {data && (
            <div className="rounded-xl border border-[#e8eaed] bg-white px-3.5 py-2 text-right shadow-sm">
              <p className="text-[20px] font-bold leading-none text-[#111827]">
                {activeCount}
                <span className="text-[13px] font-medium text-[#9ca3af]"> / {providers.length}</span>
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-wide text-[#9ca3af]">Active</p>
            </div>
          )}
        </div>

        {/* Security note */}
        <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/60 px-4 py-3">
          <ShieldCheck size={17} className="mt-0.5 shrink-0 text-blue-600" />
          <p className="text-[12.5px] leading-relaxed text-[#334155]">
            Secrets are <span className="font-semibold">encrypted at rest</span> and never shown again after saving.
            Accounts are linked to an existing user when a provider returns the <span className="font-semibold">same
            verified email</span> - TikTok returns no email, so it&rsquo;s matched by TikTok user&nbsp;id.
          </p>
        </div>

        {isLoading && (
          <div className="flex items-center gap-2 py-10 text-[13px] text-[#6b7280]">
            <Loader2 size={16} className="animate-spin" /> Loading providers&hellip;
          </div>
        )}

        {providers.map(([key, cfg]) => (
          <ProviderCard
            key={key}
            provider={key}
            cfg={cfg}
            onToggle={(enabled) => qc.setQueryData(["social-login"], (d: Record<string, SocialProvider> | undefined) =>
              d ? { ...d, [key]: { ...d[key], enabled } } : d)}
            onSaved={() => qc.invalidateQueries({ queryKey: ["social-login"] })}
          />
        ))}
      </div>
    </AdminShell>
  );
}

/* ── Provider card ─────────────────────────────────────────────────────────── */

function ProviderCard({
  provider, cfg, onToggle, onSaved,
}: {
  provider: string;
  cfg: SocialProvider;
  onToggle: (enabled: boolean) => void;
  onSaved: () => void;
}) {
  const tile = PROVIDER_TILE[provider] ?? { bg: "#111827", ring: "#111827" };
  const configured = isConfigured(cfg);

  const toggle = useMutation({
    mutationFn: (enabled: boolean) => socialLoginService.setEnabled(provider, enabled),
    onMutate: (enabled) => onToggle(enabled),
    onSuccess: (_d, enabled) => toast.success(`${cfg.label} ${enabled ? "enabled" : "disabled"}.`),
    onError: (e) => { onToggle(!cfg.enabled); toast.error(apiMessage(e)); },
    onSettled: onSaved,
  });

  return (
    <section className="overflow-hidden rounded-2xl border border-[#e8eaed] bg-white shadow-sm">
      {/* Card header */}
      <header className="flex items-center justify-between gap-4 px-5 py-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border"
            style={{ background: tile.bg, borderColor: tile.ring }}
          >
            <BrandIcon provider={provider} size={24} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-bold text-[#111827]">{cfg.label}</h2>
              <StatusPill enabled={cfg.enabled} configured={configured} />
            </div>
            <p className="mt-0.5 text-[12px] text-[#6b7280]">
              {configured
                ? cfg.enabled ? "Live on login & signup." : "Keys saved - switch on to go live."
                : "Add the keys below, then switch on."}
            </p>
          </div>
        </div>

        <Switch
          on={cfg.enabled}
          busy={toggle.isPending}
          onChange={(v) => toggle.mutate(v)}
        />
      </header>

      {/* Credentials */}
      <div className="border-t border-[#f1f2f4] bg-[#fafbfc] px-5 py-5">
        <div className="grid grid-cols-1 gap-4">
          {Object.entries(cfg.fields).map(([field, meta]) => (
            <FieldRow key={field} provider={provider} field={field} meta={meta} onSaved={onSaved} />
          ))}
        </div>

        {provider === "tiktok" && (
          <p className="mt-4 flex items-start gap-1.5 text-[11.5px] leading-relaxed text-[#9ca3af]">
            <Info size={13} className="mt-0.5 shrink-0" />
            TikTok&rsquo;s Login Kit never returns an email, so these accounts are matched by TikTok user id only.
          </p>
        )}

        <div className="mt-4 border-t border-[#f1f2f4] pt-4">
          <TestConnectionButton provider={provider} configured={configured} />
        </div>
      </div>
    </section>
  );
}

/* ── Test Connection ──────────────────────────────────────────────────────── */

/* Checks whatever is currently SAVED against the provider itself - save any
 * field changes first, or this tests the old values. What "passing" actually
 * proves differs per provider (see SocialLoginTester's own docblock on the
 * backend) - Google/Facebook/TikTok genuinely verify the id/secret pair
 * against the provider; Apple has no secret in this app at all, so it can
 * only confirm Apple's sign-in service is reachable, not the Bundle ID(s)
 * themselves - the result message always says which one happened. */
function TestConnectionButton({ provider, configured }: { provider: string; configured: boolean }) {
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = useMutation({
    mutationFn: () => socialLoginService.test(provider),
    onSuccess: (r) => {
      setResult({ ok: r.success, message: r.message });
      if (r.success) toast.success(r.message); else toast.error(r.message);
    },
    onError: (e) => {
      const message = apiMessage(e);
      setResult({ ok: false, message });
      toast.error(message);
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="md"
          disabled={!configured || test.isPending}
          onClick={() => test.mutate()}
          className="h-9"
        >
          {test.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plug size={14} />}
          Test Connection
        </Button>
        {!configured && (
          <span className="text-[11.5px] text-[#9ca3af]">Save the required keys above first.</span>
        )}
      </div>

      {result && (
        <div
          className={`flex items-start gap-1.5 rounded-lg px-3 py-2 text-[12px] leading-relaxed ${
            result.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {result.ok ? <Check size={14} className="mt-0.5 shrink-0" /> : <X size={14} className="mt-0.5 shrink-0" />}
          <span>{result.message}</span>
        </div>
      )}
    </div>
  );
}

/* ── Field row (with explicit Save + dirty state) ───────────────────────────── */

function FieldRow({
  provider, field, meta, onSaved,
}: {
  provider: string;
  field: string;
  meta: SocialField;
  onSaved: () => void;
}) {
  const original = meta.secret ? "" : (meta.value ?? "");
  const [val, setVal] = useState<string>(original);
  const [show, setShow] = useState(false);

  const dirty = meta.secret ? val.trim() !== "" : val !== original;

  const save = useMutation({
    mutationFn: () => socialLoginService.setField(provider, field, val.trim()),
    onSuccess: () => { toast.success(`${meta.label} saved.`); if (meta.secret) setVal(""); onSaved(); },
    onError: (e) => toast.error(apiMessage(e)),
  });

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <label className="text-[12px] font-semibold text-[#374151]">{meta.label}</label>
        {meta.optional && (
          <Badge variant="outline" className="px-2 py-0 text-[10px] font-medium">Optional</Badge>
        )}
        {meta.secret && meta.set && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
            <Check size={10} /> Saved
          </span>
        )}
        {!meta.secret && !meta.optional && !meta.value && (
          <Badge variant="warning" className="px-2 py-0 text-[10px]">Empty</Badge>
        )}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <input
            type={meta.secret && !show ? "password" : "text"}
            value={val}
            placeholder={
              meta.secret && meta.set
                ? `${meta.hint ?? "••••"}  ·  type to replace`
                : `Enter ${meta.label.toLowerCase()}`
            }
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && dirty) save.mutate(); }}
            spellCheck={false}
            autoComplete="off"
            className={`h-10 w-full rounded-[10px] border bg-white px-3 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10 ${
              meta.secret ? "pr-10 font-mono" : ""
            } ${dirty ? "border-[#fd4605]/60" : "border-[#e8eaed]"}`}
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

        <Button
          variant={dirty ? "primary" : "outline"}
          size="md"
          disabled={!dirty || save.isPending}
          onClick={() => save.mutate()}
          className="h-10 min-w-[84px]"
        >
          {save.isPending ? <Loader2 size={15} className="animate-spin" /> : dirty ? "Save" : "Saved"}
        </Button>
      </div>

      {meta.help && <p className="mt-1.5 text-[11.5px] leading-relaxed text-[#9ca3af]">{meta.help}</p>}
    </div>
  );
}

/* ── Bits ───────────────────────────────────────────────────────────────────── */

function StatusPill({ enabled, configured }: { enabled: boolean; configured: boolean }) {
  if (!configured) return <Badge variant="warning">Needs keys</Badge>;
  return enabled
    ? <Badge variant="success">Active</Badge>
    : <Badge variant="default">Off</Badge>;
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

/* A provider is "configured" once every REQUIRED field has a value / stored
 * secret. Optional fields (e.g. Google's Client Secret) don't gate this. */
function isConfigured(p: SocialProvider): boolean {
  return Object.values(p.fields).every((f) =>
    f.optional ? true : f.secret ? !!f.set : !!(f.value && f.value.trim()),
  );
}
