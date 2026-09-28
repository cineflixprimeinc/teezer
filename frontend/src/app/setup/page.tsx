import type { Metadata } from 'next';
import SetupWizard from './setup-wizard';

/**
 * First-run setup, at /setup on a CUSTOMER's own domain.
 *
 * Outside every route group so it inherits no shell that assumes a configured
 * app or a signed-in user - at this point neither exists. On teezer.live this
 * route simply reports "already set up", because the backend's completion check
 * sees existing administrators.
 */
export const metadata: Metadata = {
  title: 'Set up Teezer',
  robots: { index: false, follow: false },
};

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto max-w-3xl px-6 py-14 sm:py-20">
        <header>
          <p className="text-[12px] font-medium uppercase tracking-[0.14em] text-neutral-500">
            First-run setup
          </p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">
            Set up your installation
          </h1>
          <p className="mt-3 text-[15px] leading-relaxed text-neutral-400">
            A few settings and your administrator account. Everything is saved to your own server -
            nothing is sent to Teezer.
          </p>
        </header>

        <div className="mt-10">
          <SetupWizard />
        </div>
      </div>
    </div>
  );
}
