'use client';

import { useEffect, useState } from 'react';
import { api, apiMessage } from '@/services/api';

/**
 * First-run setup wizard for a fresh customer installation.
 *
 * Runs on the CUSTOMER's own domain against their own backend. Nothing here
 * touches teezer.live: every value is saved to their database, and the admin
 * account it creates is theirs.
 *
 * The wizard is only reachable while setup is incomplete - the backend refuses
 * every call afterwards - so this component's first job is to ask, and to say
 * plainly when the answer is "already done" rather than presenting a form that
 * cannot succeed.
 */

type Requirement = { name: string; ok: boolean; detail: string };

type SetupStatus = {
  setup_required: boolean;
  license: { status: string; message: string; domain: string | null; ok: boolean };
  requirements: Requirement[];
};

type Form = {
  app_name: string;
  app_description: string;
  primary_color: string;
  secondary_color: string;
  admin_site_title: string;
  admin_username: string;
  admin_email: string;
  admin_password: string;
  admin_password_confirmation: string;
  timezone: string;
  currency: string;
  language: string;
  storage_driver: string;
  smtp_host: string;
  smtp_port: string;
  smtp_username: string;
  smtp_encryption: string;
  mail_from_name: string;
  mail_from_email: string;
};

const STEPS = ['Checks', 'Branding', 'Administrator', 'Regional', 'Email'] as const;

export default function SetupWizard() {
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ admin_username: string; login_url: string; next_steps: string[] } | null>(null);

  const [form, setForm] = useState<Form>({
    app_name: '',
    app_description: '',
    primary_color: '#FD4605',
    secondary_color: '#25F4EE',
    admin_site_title: '',
    admin_username: '',
    admin_email: '',
    admin_password: '',
    admin_password_confirmation: '',
    // Sensible defaults from the browser rather than a hardcoded guess, so the
    // common case needs no input at all.
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
    currency: 'USD',
    language: 'en',
    storage_driver: 'local',
    smtp_host: '',
    smtp_port: '587',
    smtp_username: '',
    smtp_encryption: 'tls',
    mail_from_name: '',
    mail_from_email: '',
  });

  useEffect(() => {
    api
      .get('/setup/status')
      .then(({ data }) => setStatus(data.data))
      .catch((err) => setError(apiMessage(err)))
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function submit() {
    setSubmitting(true);
    setError(null);

    try {
      const { data } = await api.post('/setup/complete', {
        ...form,
        smtp_port: form.smtp_port ? Number(form.smtp_port) : undefined,
        // Send only what was filled in. An empty string would fail the
        // backend's `email` and `in:` rules for fields that are optional.
        smtp_host: form.smtp_host || undefined,
        smtp_username: form.smtp_username || undefined,
        mail_from_email: form.mail_from_email || undefined,
        app_description: form.app_description || undefined,
        admin_site_title: form.admin_site_title || undefined,
      });

      setDone(data.data);
    } catch (err) {
      setError(apiMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return <p className="text-neutral-400">Checking this installation…</p>;
  }

  if (done) {
    return (
      <div className="flex flex-col gap-5">
        <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 p-5">
          <p className="text-sm font-semibold text-emerald-300">Setup complete</p>
          <p className="mt-1 text-[13px] text-emerald-200/70">
            Your administrator account <strong>{done.admin_username}</strong> is ready.
          </p>
        </div>

        <ol className="flex flex-col gap-2 text-[13px] text-neutral-400">
          {done.next_steps.map((s) => (
            <li key={s} className="flex gap-2">
              <span className="text-neutral-600">•</span>
              {s}
            </li>
          ))}
        </ol>

        <a
          href={done.login_url}
          className="self-start rounded-lg bg-white px-5 py-3 text-sm font-semibold text-black hover:bg-neutral-200"
        >
          Open the admin panel
        </a>
      </div>
    );
  }

  if (status && !status.setup_required) {
    return (
      <div className="rounded-xl border border-neutral-800 bg-neutral-900/50 p-6">
        <p className="text-sm font-semibold text-white">This installation is already set up</p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-neutral-400">
          The setup wizard runs once and is then closed permanently — leaving it open would be a
          standing way for anyone to create an administrator account. Sign in with the account you
          created during installation.
        </p>
        <a
          href="/admin"
          className="mt-4 inline-block rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-200 hover:border-neutral-500"
        >
          Go to the admin panel
        </a>
      </div>
    );
  }

  const licenceBlocked = status ? !status.license.ok : false;

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex flex-wrap gap-2">
        {STEPS.map((label, index) => (
          <li
            key={label}
            className={[
              'rounded-full border px-3 py-1 text-[12px] font-medium',
              index === step
                ? 'border-white bg-white text-black'
                : index < step
                  ? 'border-neutral-700 text-neutral-300'
                  : 'border-neutral-800 text-neutral-600',
            ].join(' ')}
          >
            {index + 1}. {label}
          </li>
        ))}
      </ol>

      {error && (
        <p role="alert" className="rounded-lg border border-red-900/60 bg-red-950/30 px-4 py-3 text-[13px] text-red-300">
          {error}
        </p>
      )}

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-6 sm:p-8">
        {step === 0 && status && (
          <div className="flex flex-col gap-5">
            <div>
              <h2 className="text-lg font-semibold text-white">Server checks</h2>
              <p className="mt-1 text-[13px] text-neutral-400">
                Everything below must pass before Teezer will run correctly.
              </p>
            </div>

            <ul className="flex flex-col gap-2">
              {status.requirements.map((req) => (
                <li
                  key={req.name}
                  className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 px-4 py-2.5"
                >
                  <div>
                    <p className="text-[13px] font-medium text-neutral-200">{req.name}</p>
                    <p className="text-[12px] text-neutral-500">{req.detail}</p>
                  </div>
                  <span className={`text-[12px] font-semibold ${req.ok ? 'text-emerald-400' : 'text-red-400'}`}>
                    {req.ok ? 'OK' : 'Failed'}
                  </span>
                </li>
              ))}
            </ul>

            <div
              className={[
                'rounded-lg border px-4 py-3 text-[13px]',
                licenceBlocked
                  ? 'border-red-900/60 bg-red-950/30 text-red-300'
                  : 'border-neutral-800 bg-neutral-950/50 text-neutral-400',
              ].join(' ')}
            >
              <p className="font-medium">Licence: {status.license.status}</p>
              <p className="mt-0.5">{status.license.message}</p>
            </div>
          </div>
        )}

        {step === 1 && (
          <Section title="Branding" hint="How your platform presents itself. All of this is editable later.">
            <Text label="Application name" value={form.app_name} onChange={(v) => set('app_name', v)} placeholder="My Video Platform" />
            <Text label="Description" value={form.app_description} onChange={(v) => set('app_description', v)} placeholder="Short videos, made social." />
            <Text label="Admin site title" value={form.admin_site_title} onChange={(v) => set('admin_site_title', v)} placeholder="My Platform Admin" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Color label="Primary colour" value={form.primary_color} onChange={(v) => set('primary_color', v)} />
              <Color label="Secondary colour" value={form.secondary_color} onChange={(v) => set('secondary_color', v)} />
            </div>
            <p className="text-[12px] text-neutral-500">
              Logo and favicon are uploaded from Admin → Settings once you are signed in.
            </p>
          </Section>
        )}

        {step === 2 && (
          <Section title="Administrator" hint="The first account. It gets full access, so use a password you do not use anywhere else.">
            <Text label="Username" value={form.admin_username} onChange={(v) => set('admin_username', v)} placeholder="admin" />
            <Text label="Email" type="email" value={form.admin_email} onChange={(v) => set('admin_email', v)} placeholder="you@example.com" />
            <Text label="Password" type="password" value={form.admin_password} onChange={(v) => set('admin_password', v)} placeholder="At least 12 characters" />
            <Text
              label="Confirm password"
              type="password"
              value={form.admin_password_confirmation}
              onChange={(v) => set('admin_password_confirmation', v)}
              placeholder="Repeat the password"
            />
            <p className="text-[12px] text-neutral-500">
              Minimum 12 characters with letters, numbers and symbols. Passwords found in known
              breach lists are rejected.
            </p>
          </Section>
        )}

        {step === 3 && (
          <Section title="Regional" hint="Defaults for new users. Individuals can change their own.">
            <Text label="Timezone" value={form.timezone} onChange={(v) => set('timezone', v)} placeholder="UTC" />
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label="Currency (ISO code)" value={form.currency} onChange={(v) => set('currency', v.toUpperCase().slice(0, 3))} placeholder="USD" />
              <Text label="Language" value={form.language} onChange={(v) => set('language', v)} placeholder="en" />
            </div>
            <Select
              label="Storage"
              value={form.storage_driver}
              onChange={(v) => set('storage_driver', v)}
              options={[
                ['local', 'Local disk (simplest, uses your server)'],
                ['s3', 'Amazon S3'],
                ['b2', 'Backblaze B2'],
                ['r2', 'Cloudflare R2'],
              ]}
            />
            <p className="text-[12px] text-neutral-500">
              Storage credentials go in your .env file, never in the database. Local disk works
              immediately; switch later once your bucket is ready.
            </p>
          </Section>
        )}

        {step === 4 && (
          <Section title="Email" hint="Optional now. Without it, password resets and verification emails will not send.">
            <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
              <Text label="SMTP host" value={form.smtp_host} onChange={(v) => set('smtp_host', v)} placeholder="smtp.example.com" />
              <Text label="Port" value={form.smtp_port} onChange={(v) => set('smtp_port', v.replace(/\D/g, ''))} placeholder="587" />
            </div>
            <Text label="SMTP username" value={form.smtp_username} onChange={(v) => set('smtp_username', v)} placeholder="postmaster@example.com" />
            <Select
              label="Encryption"
              value={form.smtp_encryption}
              onChange={(v) => set('smtp_encryption', v)}
              options={[['tls', 'TLS'], ['ssl', 'SSL'], ['none', 'None']]}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <Text label="From name" value={form.mail_from_name} onChange={(v) => set('mail_from_name', v)} placeholder={form.app_name || 'Teezer'} />
              <Text label="From address" type="email" value={form.mail_from_email} onChange={(v) => set('mail_from_email', v)} placeholder="no-reply@example.com" />
            </div>
            <p className="rounded-lg border border-neutral-800 bg-neutral-950/50 px-4 py-3 text-[12px] leading-relaxed text-neutral-400">
              Your SMTP <strong>password</strong> is deliberately not asked for here. Put it in your
              .env file as <code className="font-mono text-neutral-300">MAIL_PASSWORD</code> and run{' '}
              <code className="font-mono text-neutral-300">php artisan config:cache</code>. Keeping it
              out of the database means a database leak is not also a mail-account leak.
            </p>
          </Section>
        )}
      </div>

      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-lg border border-neutral-700 px-4 py-2.5 text-sm font-medium text-neutral-300 disabled:opacity-40"
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={step === 0 && licenceBlocked}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-40"
          >
            Continue
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-black hover:bg-neutral-200 disabled:opacity-50"
          >
            {submitting ? 'Finishing…' : 'Finish setup'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Field primitives ───────────────────────────────────────────────────── */

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="mt-1 text-[13px] text-neutral-400">{hint}</p>
      </div>
      {children}
    </div>
  );
}

function Text({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-300">{label}</span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete={type === 'password' ? 'new-password' : 'off'}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-[15px] text-white placeholder:text-neutral-600 focus:border-neutral-500 focus:outline-none"
      />
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-300">{label}</span>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="h-10 w-12 cursor-pointer rounded border border-neutral-700 bg-neutral-950"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="flex-1 rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2.5 font-mono text-[13px] text-white focus:border-neutral-500 focus:outline-none"
        />
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-neutral-300">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-neutral-700 bg-neutral-950 px-3.5 py-2.5 text-[15px] text-white focus:border-neutral-500 focus:outline-none"
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
