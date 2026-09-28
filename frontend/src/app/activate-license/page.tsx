import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { KeyRound, ServerCog, ShieldCheck, WifiOff } from 'lucide-react';
import ActivateLicenseForm from './activate-license-form';

/**
 * Public licence activation, deliberately OUTSIDE every route group.
 *
 * Being at the app root rather than in (main) or (auth) means it inherits none
 * of their shells - no feed chrome, no sign-in prompt, no session requirement.
 * That is the point: the person using this page has bought a copy of Teezer on
 * a marketplace and has no account here, and the licence system is explicitly
 * independent of Teezer user auth.
 *
 * SCROLLING: globals.css sets `overflow: hidden` on html/body so the feed can
 * own the viewport, which means any full-page route has to provide its own
 * scroll container. The earlier version of this page used `min-h-screen` and
 * therefore could not scroll at all - on a short viewport the form was simply
 * unreachable. The `h-screen overflow-y-auto` wrapper below is the same pattern
 * LegalShell uses for /privacy and /terms.
 */
export const metadata: Metadata = {
  title: 'Activate Your Teezer License',
  description:
    'Redeem your marketplace purchase code and generate the licence key for your Teezer installation.',
  alternates: { canonical: 'https://teezer.live/activate-license' },
  // Not a security control - the endpoint is public by design - but there is
  // no reason for this to sit in search results collecting bot traffic.
  robots: { index: false, follow: false },
};

const STEPS = [
  {
    title: 'Redeem your code',
    body: 'Enter the purchase code from your receipt with the domain you will run Teezer on.',
  },
  {
    title: 'Save your licence key',
    body: 'Shown once. We keep only a hash of it, so it cannot be displayed again.',
  },
  {
    title: 'Install on your server',
    body: 'Run the one-line installer on your VPS and enter both values when prompted.',
  },
];

const ASSURANCES = [
  {
    icon: WifiOff,
    title: 'Runs independently',
    body: 'After activation your installation verifies its licence locally. It never calls teezer.live to serve pages, sign users in, or run your API.',
  },
  {
    icon: ServerCog,
    title: 'Your server, your data',
    body: 'Your own database, storage, secrets and admin account. Nothing is shared with us, and nothing you configure reaches our environment.',
  },
  {
    icon: ShieldCheck,
    title: 'Moves with you',
    body: 'Licences are bound to one domain and one installation. Migrating to a new server? Support resets the activation for you.',
  },
];

export default function ActivateLicensePage() {
  return (
    <div className="h-screen overflow-y-auto bg-[#fafbfc]">
      <header className="sticky top-0 z-10 border-b border-[#edeff3] bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Teezer home">
            <Image
              src="/teezer-logo.png"
              alt="Teezer"
              width={210}
              height={54}
              className="h-8 w-auto"
              priority
            />
          </Link>
          <a
            href="mailto:support@teezer.live"
            className="text-[13px] font-semibold text-[#5f6675] transition-colors hover:text-[#fd4605]"
          >
            Need help?
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 pt-12 sm:pt-16">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#fff3ec] px-3 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-[#fd4605]">
            <KeyRound size={12} />
            Teezer Licensing
          </span>
          <h1 className="mt-4 text-[30px] font-extrabold leading-[1.1] tracking-[-0.02em] text-[#111827] sm:text-[38px]">
            Activate your Teezer license
          </h1>
          <p className="mt-3 text-[15.5px] leading-relaxed text-[#5f6675]">
            Turn your marketplace purchase code into a licence key bound to your domain. You will
            need both to install Teezer on your own server.
          </p>
        </div>

        <div className="mt-10 grid items-start gap-6 lg:mt-12 lg:grid-cols-12 lg:gap-8">
          {/* Form - the primary object on the page, so it gets the elevation. */}
          <section className="lg:col-span-7">
            <div className="rounded-2xl border border-[#e6e8ee] bg-white p-6 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_8px_24px_-12px_rgba(16,24,40,0.10)] sm:p-8">
              <ActivateLicenseForm />
            </div>
          </section>

          {/* Supporting rail - flat and quiet, so it never competes. */}
          <aside className="flex flex-col gap-8 lg:col-span-5 lg:pt-1">
            <div>
              <h2 className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#9ca3af]">
                How it works
              </h2>
              <ol className="mt-4 flex flex-col gap-4">
                {STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3.5">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#fff3ec] text-[11px] font-bold text-[#fd4605]">
                      {index + 1}
                    </span>
                    <div>
                      <p className="text-[14px] font-semibold text-[#111827]">{step.title}</p>
                      <p className="mt-0.5 text-[13px] leading-relaxed text-[#5f6675]">{step.body}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>

            <div className="h-px bg-[#e6e8ee]" />

            <div className="flex flex-col gap-5">
              {ASSURANCES.map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-[#5f6675] shadow-[0_0_0_1px_rgba(16,24,40,0.06)]">
                    <Icon size={14} />
                  </span>
                  <div>
                    <p className="text-[14px] font-semibold text-[#111827]">{title}</p>
                    <p className="mt-0.5 text-[13px] leading-relaxed text-[#5f6675]">{body}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="rounded-xl border border-[#e6e8ee] bg-white px-4 py-3.5">
              <p className="text-[13px] leading-relaxed text-[#5f6675]">
                Code not activating, or need a licence moved to a different domain? Email{' '}
                <a
                  href="mailto:support@teezer.live"
                  className="font-semibold text-[#fd4605] underline underline-offset-2 hover:text-[#e81d47]"
                >
                  support@teezer.live
                </a>
                .
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  );
}
