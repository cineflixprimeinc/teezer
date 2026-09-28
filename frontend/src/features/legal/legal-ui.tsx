import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { BackToReelsooLink } from "./back-to-reelsoo-link";

/**
 * Shared shell + typography for the public legal pages (/privacy, /terms,
 * /guidelines). The app shell sets `overflow: hidden` on <body>, so the shell
 * provides its own scroll container; the left "Categories" rail is sticky
 * inside it and jumps to sections via anchor links.
 */

export interface TocItem {
  id: string;
  label: string;
}

export interface RelatedDoc {
  href: string;
  label: string;
  desc: string;
}

export function LegalShell({
  eyebrow,
  title,
  lastUpdated,
  toc,
  related,
  children,
}: {
  eyebrow: string;
  title: string;
  lastUpdated: string;
  toc: TocItem[];
  related: RelatedDoc[];
  children: React.ReactNode;
}) {
  return (
    <div className="h-screen overflow-y-auto scroll-smooth bg-white">
      {/* Header */}
      <header className="sticky top-0 z-10 border-b border-gray-100 bg-white/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
          <Link href="/" aria-label="Teezer home">
            <Image src="/reelsoo-logo.png" alt="Teezer" width={210} height={54} className="h-9 w-auto" priority />
          </Link>
          <Suspense fallback={null}>
            <BackToReelsooLink />
          </Suspense>
        </div>
      </header>

      <div className="mx-auto flex max-w-6xl gap-10 px-5 pb-24 pt-12">
        {/* ── Left rail: categories + related documents (desktop) ── */}
        <aside className="hidden w-72 shrink-0 lg:block">
          <div className="sticky top-24 space-y-6">
            <nav className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Categories</p>
              <ol className="mt-3 space-y-1">
                {toc.map((t, i) => (
                  <li key={t.id}>
                    <a
                      href={`#${t.id}`}
                      className="flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-gray-700 hover:bg-[#fff0f4] hover:text-[#fe2c55]"
                    >
                      <span className="text-xs font-bold text-[#fe2c55]">{i + 1}</span>
                      <span>{t.label}</span>
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Related documents</p>
              <ul className="mt-3 space-y-3">
                {related.map((r) => (
                  <li key={r.href}>
                    <Link href={r.href} className="group block">
                      <p className="text-sm font-bold text-gray-900 group-hover:text-[#fe2c55]">{r.label} →</p>
                      <p className="mt-0.5 text-xs leading-5 text-gray-500">{r.desc}</p>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>

        {/* ── Content column ── */}
        <main className="min-w-0 flex-1">
          <p className="text-sm font-bold uppercase tracking-wider text-[#fe2c55]">{eyebrow}</p>
          <h1 className="mt-2 text-5xl font-extrabold tracking-tight text-gray-900">{title}</h1>
          <p className="mt-4 text-sm text-gray-500">
            Last updated: {lastUpdated} · Effective: {lastUpdated}
          </p>

          {/* Mobile categories (the rail is hidden below lg) */}
          <nav className="mt-8 rounded-2xl border border-gray-100 bg-gray-50 p-6 lg:hidden">
            <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Categories</p>
            <ol className="mt-3 grid grid-cols-1 gap-y-2 sm:grid-cols-2 sm:gap-x-8">
              {toc.map((t, i) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="text-sm font-semibold text-gray-800 hover:text-[#fe2c55]">
                    {i + 1}. {t.label}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {children}

          <div className="mt-16 flex flex-col items-start justify-between gap-4 border-t border-gray-100 pt-8 text-sm text-gray-400 sm:flex-row sm:items-center">
            <span>© {new Date().getFullYear()} Teezer · CineflixPrime</span>
            <span className="flex flex-wrap gap-x-2 gap-y-1">
              <Link href="/terms" className="hover:text-gray-600">Terms of Service</Link>
              <span>·</span>
              <Link href="/privacy" className="hover:text-gray-600">Privacy Policy</Link>
              <span>·</span>
              <Link href="/guidelines" className="hover:text-gray-600">Community Guidelines</Link>
              <span>·</span>
              <Link href="/cookies" className="hover:text-gray-600">Cookie Policy</Link>
              <span>·</span>
              <Link href="/copyright" className="hover:text-gray-600">Copyright</Link>
              <span>·</span>
              <Link href="/virtual-items" className="hover:text-gray-600">Virtual Items</Link>
              <span>·</span>
              <Link href="/policies/creator-agreement" className="hover:text-gray-600">Creator Agreement</Link>
              <span>·</span>
              <Link href="/policies/monetization-terms" className="hover:text-gray-600">Monetization</Link>
              <span>·</span>
              <Link href="/policies/advertising-policy" className="hover:text-gray-600">Advertising</Link>
              <span>·</span>
              <Link href="/tax-guide" className="hover:text-gray-600">Tax Guide</Link>
              <span>·</span>
              <Link href="/law-enforcement" className="hover:text-gray-600">Law Enforcement</Link>
            </span>
          </div>
        </main>
      </div>
    </div>
  );
}

/* ── Typography ── */

export function H2({ id, n, children }: { id: string; n: number; children: React.ReactNode }) {
  return (
    <h2 id={id} className="mt-16 flex scroll-mt-24 items-baseline gap-3 text-3xl font-extrabold tracking-tight text-gray-900">
      <span className="text-[#fe2c55]">{n}.</span>
      <span>{children}</span>
    </h2>
  );
}

export function H3({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-9 text-xl font-bold text-gray-900">{children}</h3>;
}

export function P({ children }: { children: React.ReactNode }) {
  return <p className="mt-4 text-[15px] leading-7 text-gray-700">{children}</p>;
}

export function UL({ children }: { children: React.ReactNode }) {
  return <ul className="mt-3 list-disc space-y-2 pl-6 text-[15px] leading-7 text-gray-700">{children}</ul>;
}

/** Inline link to a supporting document or section. */
export function DocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-[#fe2c55] hover:underline">
      {children}
    </Link>
  );
}

/* ── Professional data table ── */
export function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="mt-5 overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
      <table className="w-full min-w-[640px] border-collapse text-left text-sm">
        <thead>
          <tr className="bg-gray-900">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-bold uppercase tracking-wider text-white">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100 bg-white">
          {rows.map((cells, i) => (
            <tr key={i} className="align-top even:bg-gray-50/60">
              {cells.map((c, j) => (
                <td
                  key={j}
                  className={`px-4 py-3.5 leading-6 text-gray-700 ${j === 0 ? "font-semibold text-gray-900" : ""}`}
                >
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
