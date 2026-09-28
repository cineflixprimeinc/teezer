"use client";

import { useEffect } from "react";

/**
 * Route-segment error boundary. Any render/data error in a page lands here
 * instead of blanking the whole app. If it's a stale-chunk error (after a
 * deploy / CDN cache blip) we auto-reload once to fetch the fresh build;
 * otherwise the user gets Try again (soft reset) + Reload.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = String(error?.message || error?.name || "");
    const isChunk = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|not executable|Importing a module script failed/i.test(msg);
    if (!isChunk) return;

    /* A plain reload re-requests the same asset URLs, so if the failure is a
       cached bad response at the CDN rather than a stale document, the second
       attempt fails exactly like the first and the user is stuck on this
       screen. Clearing the caches the page controls first gives the reload a
       chance to actually fetch something different. */
    const hardReload = () => {
      const done = () => window.location.reload();
      try {
        const jobs: Promise<unknown>[] = [];
        if (typeof caches !== "undefined") {
          jobs.push(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
        }
        if (navigator?.serviceWorker?.getRegistrations) {
          jobs.push(navigator.serviceWorker.getRegistrations()
            .then(regs => Promise.all(regs.map(r => r.unregister()))));
        }
        if (jobs.length) {
          Promise.allSettled(jobs).then(done);
          return;
        }
      } catch {
        /* Storage APIs can throw outright in locked-down contexts; reloading
           without the cleanup is still better than showing an error. */
      }
      done();
    };

    try {
      const K = "reelsoo_chunk_reloaded";
      if (!sessionStorage.getItem(K)) {
        sessionStorage.setItem(K, "1");
        hardReload();
      }
    } catch {
      hardReload();
    }
  }, [error]);

  return (
    <div className="flex min-h-[60vh] w-full flex-col items-center justify-center px-6 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-full bg-[#fff0f3]">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fe2c55" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      </div>
      <h2 className="mt-4 text-xl font-bold text-black">Something went wrong</h2>
      <p className="mt-2 max-w-sm text-sm text-[#5f6675]">
        This part of the page didn&rsquo;t load correctly. Try again - if it keeps happening, reload the page.
      </p>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-11 items-center gap-2 rounded-full bg-[#fe2c55] px-6 text-sm font-bold text-white shadow-sm hover:bg-[#e0193f]"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="inline-flex h-11 items-center gap-2 rounded-full border border-[#e5e7eb] px-6 text-sm font-bold text-[#374151] hover:bg-[#f9fafb]"
        >
          Reload
        </button>
      </div>
    </div>
  );
}
