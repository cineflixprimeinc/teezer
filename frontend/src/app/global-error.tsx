"use client";

import { useEffect } from "react";

/**
 * Root error boundary (App Router). Catches errors that escape the root layout
 * itself - must render its own <html>/<body>. Stale-chunk errors auto-reload
 * once; everything else shows a minimal, dependency-free reload screen so the
 * user never sees a blank page.
 */
export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    const msg = String(error?.message || error?.name || "");
    const isChunk = /ChunkLoadError|Loading chunk|Failed to load chunk|dynamically imported module|not executable|Importing a module script failed/i.test(msg);
    if (isChunk) {
      try {
        const K = "reelsoo_chunk_reloaded";
        if (!sessionStorage.getItem(K)) {
          sessionStorage.setItem(K, "1");
          window.location.reload();
        }
      } catch {
        window.location.reload();
      }
    }
  }, [error]);

  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, sans-serif", background: "#f4f5f7" }}>
        <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "24px", textAlign: "center" }}>
          <div style={{ width: 64, height: 64, borderRadius: "9999px", background: "#fff0f3", display: "grid", placeItems: "center" }}>
            <span style={{ color: "#fd4605", fontSize: 30, fontWeight: 900 }}>!</span>
          </div>
          <h1 style={{ marginTop: 16, fontSize: 20, fontWeight: 800, color: "#111" }}>Something went wrong</h1>
          <p style={{ marginTop: 8, maxWidth: 360, fontSize: 14, color: "#5f6675" }}>
            The app hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{ marginTop: 20, height: 44, padding: "0 24px", borderRadius: "9999px", background: "#fd4605", color: "#fff", border: "none", fontSize: 14, fontWeight: 700, cursor: "pointer" }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
