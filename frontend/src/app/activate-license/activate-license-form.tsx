'use client';

import { useMemo, useState } from 'react';
import { activateLicense, type ActivationResult } from '@/services/license.service';
import { apiMessage } from '@/services/api';
import {
  AlertCircle, ArrowRight, Check, Copy, Download, Eye, EyeOff, Globe, KeyRound, Loader2, ShieldCheck, Terminal, User,
} from 'lucide-react';

/**
 * The activation form behind /activate-license.
 *
 * Two states, and the second one carries the whole weight of the page: once a
 * licence key is issued it is shown ONCE. The server stores only a SHA-256
 * hash, so this screen is genuinely the only place that key will ever exist.
 * Everything about the success state is built around making that impossible to
 * miss, because a customer who closes the tab has lost their key and has to
 * open a support ticket to be re-issued one.
 *
 * There is deliberately no way back to the form from the success state, and no
 * "show it again" affordance - both would imply the key is recoverable.
 */

type Errors = Partial<Record<'purchase_code' | 'domain' | 'username' | 'form', string>>;

/**
 * Client-side mirror of App\Licensing\Support\DomainNormalizer.
 *
 * PREVIEW ONLY - the server normalises independently and is the authority.
 * It exists because domain binding is exact: a licence issued for example.com
 * will not verify on app.example.com, and the single most common support
 * question in a scheme like this is "why won't my licence activate". Showing
 * the canonical form as they type turns that into something they can see and
 * correct before submitting, rather than after installing.
 */
function previewDomain(input: string): string | null {
  let v = input.trim();
  if (!v) return null;

  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');   // scheme
  const at = v.lastIndexOf('@');
  if (at !== -1) v = v.slice(at + 1);               // userinfo
  v = v.split(/[/?#]/)[0];                          // path/query/fragment
  v = v.replace(/:\d*$/, '');                       // port
  v = v.replace(/\.+$/, '').toLowerCase();          // trailing dot + case
  v = v.replace(/^www\./, '');                      // www. is equivalent

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) return null;
  if (/^\d+$/.test(v.split('.').pop() ?? '')) return null; // a bare IP is not a domain

  return v;
}

export default function ActivateLicenseForm() {
  const [purchaseCode, setPurchaseCode] = useState('');
  const [showCode, setShowCode] = useState(false);
  const [domain, setDomain] = useState('');
  const [username, setUsername] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<ActivationResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState(false);

  const normalized = useMemo(() => previewDomain(domain), [domain]);
  const canSubmit = purchaseCode.trim().length >= 8 && !!normalized && /^[A-Za-z0-9._-]{3,60}$/.test(username.trim());

  function validate(): boolean {
    const next: Errors = {};
    if (purchaseCode.trim().length < 8) next.purchase_code = 'Enter the purchase code from your marketplace receipt.';
    if (!normalized) next.domain = 'Enter a domain like example.com.';
    if (!/^[A-Za-z0-9._-]{3,60}$/.test(username.trim())) {
      next.username = 'Use 3–60 letters, numbers, dots, underscores or hyphens.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting || !validate()) return;

    setSubmitting(true);
    setErrors({});

    try {
      const activation = await activateLicense({
        purchase_code: purchaseCode.trim(),
        domain: domain.trim(),
        username: username.trim(),
      });
      setResult(activation);
      setPurchaseCode(''); // drop the secret from component state once spent
    } catch (error) {
      setErrors({ form: apiMessage(error) });
    } finally {
      setSubmitting(false);
    }
  }

  async function copy(text: string, which: 'key' | 'cmd') {
    try {
      await navigator.clipboard.writeText(text);
      if (which === 'key') { setCopied(true); window.setTimeout(() => setCopied(false), 2400); }
      else { setCopiedCmd(true); window.setTimeout(() => setCopiedCmd(false), 2400); }
    } catch {
      // Clipboard can be refused (insecure context, denied permission). The
      // value is selectable on screen either way, so this is not an error.
    }
  }

  function downloadKey() {
    if (!result) return;
    const body = [
      'Teezer licence',
      '='.repeat(46),
      '',
      `Licence key : ${result.license_key}`,
      `Licence ID  : ${result.license_id}`,
      `Domain      : ${result.domain}`,
      `Owner       : ${result.username}`,
      `Issued      : ${new Date().toISOString()}`,
      '',
      'Keep this file somewhere safe. The licence key is stored only as a',
      'hash on our servers and cannot be shown to you again.',
      '',
      'To install on your server:',
      '  curl -fsSL https://install.teezer.live/install.sh | bash',
      '',
      'Support: support@teezer.live',
      '',
    ].join('\n');

    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `teezer-license-${result.domain}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /* ── Success ────────────────────────────────────────────────────────── */

  if (result) {
    const installCmd = 'curl -fsSL https://install.teezer.live/install.sh | bash';

    return (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#ecfdf5] text-[#047857]">
            <Check size={20} strokeWidth={2.5} />
          </span>
          <div>
            <h2 className="text-[19px] font-bold tracking-tight text-[#111827]">Licence activated</h2>
            <p className="text-[13px] text-[#5f6675]">Bound to {result.domain}</p>
          </div>
        </div>

        {/* The single most important element on the page. */}
        <div className="rounded-2xl border border-[#fcd34d] bg-[#fffbeb] p-5">
          <div className="flex gap-2.5">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#b45309]" />
            <div>
              <p className="text-[13.5px] font-bold text-[#92400e]">Save this key now — it is shown only once</p>
              <p className="mt-1 text-[13px] leading-relaxed text-[#a16207]">
                We store only a hash of it, so it can never be displayed again. If you lose it you will
                need support to revoke this licence and issue a replacement.
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-[#fde68a] bg-white p-1">
            <code
              data-testid="license-key"
              className="block select-all break-all px-3.5 py-3 font-mono text-[15px] font-semibold tracking-tight text-[#111827]"
            >
              {result.license_key}
            </code>
          </div>

          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => copy(result.license_key, 'key')}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#111827] px-4 py-2.5 text-[14px] font-semibold text-white transition-colors hover:bg-[#1f2937]"
            >
              {copied ? <Check size={15} /> : <Copy size={15} />}
              {copied ? 'Copied to clipboard' : 'Copy key'}
            </button>
            <button
              type="button"
              onClick={downloadKey}
              className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-[#d1d5db] bg-white px-4 py-2.5 text-[14px] font-semibold text-[#111827] transition-colors hover:border-[#9ca3af] hover:bg-[#f9fafb]"
            >
              <Download size={15} />
              Download as file
            </button>
          </div>
        </div>

        <dl className="grid gap-px overflow-hidden rounded-2xl border border-[#e5e7eb] bg-[#e5e7eb] sm:grid-cols-3">
          {[
            ['Licence ID', result.license_id, true],
            ['Domain', result.domain, false],
            ['Owner', result.username, false],
          ].map(([label, value, mono]) => (
            <div key={label as string} className="bg-white px-4 py-3.5">
              <dt className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9ca3af]">{label}</dt>
              <dd className={`mt-1 truncate text-[13.5px] text-[#111827] ${mono ? 'font-mono' : 'font-medium'}`}>
                {value}
              </dd>
            </div>
          ))}
        </dl>

        <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5">
          <div className="flex items-center gap-2">
            <Terminal size={15} className="text-[#5f6675]" />
            <p className="text-[14px] font-semibold text-[#111827]">Next: install on your server</p>
          </div>
          <p className="mt-1.5 text-[13px] leading-relaxed text-[#5f6675]">
            SSH into your VPS and run the installer. It asks for your purchase code, the licence key
            above, and your domain.
          </p>

          <div className="mt-3 flex items-center gap-2 rounded-xl bg-[#0f1117] p-1 pl-4">
            <code className="flex-1 overflow-x-auto whitespace-nowrap py-2.5 font-mono text-[12.5px] text-[#e5e7eb]">
              <span className="select-none text-[#6b7280]">$ </span>{installCmd}
            </code>
            <button
              type="button"
              onClick={() => copy(installCmd, 'cmd')}
              aria-label="Copy install command"
              className="shrink-0 rounded-lg p-2 text-[#9ca3af] transition-colors hover:bg-white/10 hover:text-white"
            >
              {copiedCmd ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ── Form ───────────────────────────────────────────────────────────── */

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
      <Field
        label="Purchase code"
        icon={<KeyRound size={14} />}
        hint="From your marketplace receipt."
        error={errors.purchase_code}
        htmlFor="purchase-code"
      >
        <div className="relative">
          <input
            id="purchase-code"
            /* Masked by default so it is not exposed on a screen share or in a
               recording, with a reveal toggle because people paste these and
               need to check the paste actually landed. */
            type={showCode ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            value={purchaseCode}
            onChange={(e) => setPurchaseCode(e.target.value)}
            placeholder="a1b2c3d4-e5f6-7890-abcd-ef1234567890"
            className={inputClass(errors.purchase_code) + ' pr-11 font-mono text-[14px]'}
          />
          <button
            type="button"
            onClick={() => setShowCode((s) => !s)}
            aria-label={showCode ? 'Hide purchase code' : 'Show purchase code'}
            className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg p-2 text-[#9ca3af] transition-colors hover:bg-[#f3f4f6] hover:text-[#111827]"
          >
            {showCode ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>
      </Field>

      <Field
        label="Domain name"
        icon={<Globe size={14} />}
        hint="The domain this licence locks to. https:// and www. are optional."
        error={errors.domain}
        htmlFor="domain"
      >
        <input
          id="domain"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          value={domain}
          onChange={(e) => setDomain(e.target.value)}
          placeholder="example.com"
          className={inputClass(errors.domain)}
        />
        {/* Domain binding is exact, and a mismatch only surfaces after install.
            Showing the canonical form now makes that visible while it is still
            cheap to fix. */}
        {normalized && normalized !== domain.trim().toLowerCase() && (
          <p className="mt-2 flex items-center gap-1.5 text-[12.5px] text-[#047857]">
            <ShieldCheck size={13} className="shrink-0" />
            Licence will be bound to <code className="font-mono font-semibold">{normalized}</code>
          </p>
        )}
      </Field>

      <Field
        label="Username"
        icon={<User size={14} />}
        hint="Identifies you as the licence owner. Not a Teezer social account."
        error={errors.username}
        htmlFor="username"
      >
        <input
          id="username"
          type="text"
          autoComplete="off"
          spellCheck={false}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="your_username"
          className={inputClass(errors.username)}
        />
      </Field>

      {errors.form && (
        <div role="alert" className="flex gap-2.5 rounded-xl border border-[#fecaca] bg-[#fef2f2] px-4 py-3">
          <AlertCircle size={16} className="mt-0.5 shrink-0 text-[#dc2626]" />
          <p className="text-[13px] leading-relaxed text-[#b91c1c]">{errors.form}</p>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !canSubmit}
        className="group mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#fd4605] px-5 py-3.5 text-[15px] font-semibold text-white shadow-sm transition-all hover:bg-[#e81d47] disabled:cursor-not-allowed disabled:bg-[#e5e7eb] disabled:text-[#9ca3af] disabled:shadow-none"
      >
        {submitting ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Generating your key…
          </>
        ) : (
          <>
            Generate licence key
            <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </>
        )}
      </button>

      <p className="text-[12px] leading-relaxed text-[#8b90a0]">
        Your licence key is displayed once and stored only as a hash, so keep a copy. One purchase
        code activates one domain — contact support to move an existing licence.
      </p>
    </form>
  );
}

/* ── Primitives ───────────────────────────────────────────────────────── */

function inputClass(error?: string) {
  return [
    'w-full rounded-xl border bg-white px-3.5 py-3 text-[15px] text-[#111827]',
    'placeholder:text-[#c3c7d1] transition-shadow focus:outline-none focus:ring-4',
    error
      ? 'border-[#f87171] focus:border-[#ef4444] focus:ring-[#fee2e2]'
      : 'border-[#d8dbe3] focus:border-[#fd4605] focus:ring-[#ffe4ea]',
  ].join(' ');
}

function Field({
  label, icon, hint, error, htmlFor, children,
}: {
  label: string;
  icon: React.ReactNode;
  hint: string;
  error?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#111827]">
        <span className="text-[#9ca3af]">{icon}</span>
        {label}
      </label>
      {children}
      {error ? (
        <p role="alert" className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-medium text-[#dc2626]">
          <AlertCircle size={13} className="shrink-0" />
          {error}
        </p>
      ) : (
        <p className="mt-1.5 text-[12.5px] text-[#8b90a0]">{hint}</p>
      )}
    </div>
  );
}
