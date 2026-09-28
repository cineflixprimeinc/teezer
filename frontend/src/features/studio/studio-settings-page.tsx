"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth.store";
import { StudioSidebarWrapper } from "./studio-sidebar-wrapper";
import { cn } from "@/lib/utils";
import {
  AlertCircle, Check, Database, Globe, Key, Loader2,
  RefreshCw, Server, Settings, Shield, X,
} from "lucide-react";

/* ─── Section tabs ─────────────────────────────────────────────────────── */
const TABS = ["Connection", "API Keys", "Environment", "Cache"] as const;
type Tab = typeof TABS[number];

/* ─── Connection test result ───────────────────────────────────────────── */
type ConnResult = {
  success: boolean;
  message: string;
  database?: { driver: string; host: string; database: string };
  error?: string;
};

function apiUrl(path: string): string {
  const base = (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1").replace(/\/+$/, "");
  return `${base}/${path.replace(/^\/+/, "")}`;
}

/* ─── Main page ────────────────────────────────────────────────────────── */
export function StudioSettingsPageFull() {
  const router    = useRouter();
  const { isAuthenticated, authReady, isAdmin } = useAuthStore();
  const [collapsed, setCollapsed]      = useState(false);
  const [activeTab, setActiveTab]      = useState<Tab>("Connection");
  const [testing, setTesting]          = useState(false);
  const [result, setResult]            = useState<ConnResult | null>(null);
  const [clearing, setClearing]        = useState(false);
  const [cacheResult, setCacheResult]  = useState<string | null>(null);

  useEffect(() => {
    if (authReady && !isAuthenticated) router.replace("/");
    if (authReady && isAuthenticated && !isAdmin()) router.replace("/studio");
  }, [authReady, isAuthenticated, isAdmin, router]);

  if (!authReady || !isAuthenticated || !isAdmin()) return null;

  /* test DB connection */
  async function testConnection() {
    setTesting(true);
    setResult(null);
    try {
      const token = localStorage.getItem("reelsoo_token");
      const res = await fetch(
        apiUrl("/studio/settings/test/connection"),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const json = await res.json();
      setResult(json);
    } catch (e) {
      setResult({ success: false, message: "Request failed", error: (e as Error).message });
    } finally {
      setTesting(false);
    }
  }

  /* clear cache */
  async function clearCache() {
    setClearing(true);
    setCacheResult(null);
    try {
      const token = localStorage.getItem("reelsoo_token");
      const res = await fetch(
        apiUrl("/studio/settings/cache/clear"),
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ value: "clear", type: "string" }),
        }
      );
      const json = await res.json();
      setCacheResult(json.success ? "Cache cleared successfully" : "Failed to clear cache");
    } catch {
      setCacheResult("Request failed");
    } finally {
      setClearing(false);
    }
  }

  /* ── env vars display (only public ones) */
  const envVars = [
    { key: "NEXT_PUBLIC_API_URL",         label: "API Base URL",      value: process.env.NEXT_PUBLIC_API_URL ?? "(not set)" },
    { key: "NEXT_PUBLIC_APP_NAME",        label: "App Name",          value: process.env.NEXT_PUBLIC_APP_NAME ?? "Teezer" },
    { key: "NEXT_PUBLIC_CENTRIFUGO_URL",  label: "Realtime URL",      value: process.env.NEXT_PUBLIC_CENTRIFUGO_URL ?? "(not set)" },
  ];

  return (
    <div className="flex h-screen overflow-hidden bg-[#f8f9fb]">
      <StudioSidebarWrapper
        collapsed={collapsed}
        onToggle={() => setCollapsed(o => !o)}
        activeHref="/studio/settings"
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <div className="flex h-16 items-center gap-3 border-b border-[#f0f0f0] bg-white px-6">
          <Settings className="h-5 w-5 text-[#fe2c55]" />
          <h1 className="text-[18px] font-extrabold text-[#111827]">Backend Settings</h1>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto max-w-[860px] space-y-5">

            {/* Tab bar */}
            <div className="flex gap-1 rounded-xl border border-[#f0f0f0] bg-white p-1">
              {TABS.map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={cn(
                    "flex-1 rounded-lg py-2 text-[13px] font-semibold transition",
                    activeTab === tab
                      ? "bg-[#fe2c55] text-white shadow-sm"
                      : "text-[#6b7280] hover:bg-[#f8f9fb]"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* ── Connection tab ───────────────────────────────────────── */}
            {activeTab === "Connection" && (
              <div className="space-y-4">
                <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="grid h-10 w-10 place-items-center rounded-full bg-[#f3f0ff]">
                        <Database className="h-5 w-5 text-[#7c3aed]" />
                      </div>
                      <div>
                        <h3 className="text-[15px] font-extrabold text-[#111827]">Database Connection</h3>
                        <p className="mt-0.5 text-[12px] text-[#9ca3af]">Test that the backend can reach the database</p>
                      </div>
                    </div>
                    <button
                      onClick={testConnection}
                      disabled={testing}
                      className={cn(
                        "flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold transition",
                        testing
                          ? "cursor-not-allowed bg-[#f3f4f6] text-[#9ca3af]"
                          : "bg-[#fe2c55] text-white hover:bg-[#e0243d]"
                      )}
                    >
                      {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                      {testing ? "Testing…" : "Test Connection"}
                    </button>
                  </div>

                  {result && (
                    <div className={cn(
                      "mt-4 rounded-xl p-4",
                      result.success ? "bg-[#f0fdf4] border border-[#bbf7d0]" : "bg-[#fef2f2] border border-[#fecaca]"
                    )}>
                      <div className="flex items-start gap-3">
                        {result.success
                          ? <Check className="mt-0.5 h-5 w-5 flex-shrink-0 text-[#16a34a]" />
                          : <X className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-500" />}
                        <div className="min-w-0 flex-1">
                          <p className={cn("text-[13px] font-bold", result.success ? "text-[#166534]" : "text-red-700")}>
                            {result.message}
                          </p>
                          {result.success && result.database && (
                            <div className="mt-3 grid grid-cols-3 gap-3">
                              {[
                                { label: "Driver",   value: result.database.driver },
                                { label: "Host",     value: result.database.host },
                                { label: "Database", value: result.database.database },
                              ].map(row => (
                                <div key={row.label} className="rounded-lg bg-white p-3 shadow-sm">
                                  <p className="text-[10px] font-semibold uppercase tracking-wide text-[#9ca3af]">{row.label}</p>
                                  <p className="mt-0.5 truncate text-[13px] font-bold text-[#111827]">{row.value}</p>
                                </div>
                              ))}
                            </div>
                          )}
                          {result.error && (
                            <p className="mt-2 rounded bg-red-100 px-3 py-1.5 text-[12px] font-mono text-red-700">
                              {result.error}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* API health quick links */}
                <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
                  <div className="flex items-center gap-3 mb-4">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#fff0f4]">
                      <Server className="h-5 w-5 text-[#fe2c55]" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-extrabold text-[#111827]">API Health</h3>
                      <p className="mt-0.5 text-[12px] text-[#9ca3af]">Direct links to backend health endpoints</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    {[
                      { label: "Health Check",   path: "/api/v1/health" },
                      { label: "Public Settings", path: "/api/v1/app/settings" },
                    ].map(({ label, path }) => (
                      <a
                        key={path}
                        href={apiUrl(path.replace(/^\/api\/v1/, ""))}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between rounded-xl border border-[#f0f0f0] px-4 py-3 text-[13px] transition hover:border-[#fe2c55] hover:bg-[#fff5f5]"
                      >
                        <span className="font-semibold text-[#374151]">{label}</span>
                        <span className="font-mono text-[11px] text-[#9ca3af]">{path}</span>
                      </a>
                    ))}
                  </div>
                </div>

                {/* Warning */}
                <div className="flex gap-3 rounded-xl border border-[#fef3c7] bg-[#fffbeb] p-4 text-[12px] text-[#92400e]">
                  <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#b45309]" />
                  <p>
                    If the connection test fails, ensure the backend API is running (`pm2 list`) and
                    the <strong>NEXT_PUBLIC_API_URL</strong> env variable points to the correct server address.
                  </p>
                </div>
              </div>
            )}

            {/* ── API Keys tab ─────────────────────────────────────────── */}
            {activeTab === "API Keys" && (
              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[#ecfdf5]">
                    <Key className="h-5 w-5 text-[#10b981]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold text-[#111827]">API Keys</h3>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">Managed via server .env - never exposed in UI</p>
                  </div>
                </div>
                {[
                  { label: "Sanctum API Token",  hint: "Used for authenticated requests",       set: true },
                  { label: "Meilisearch Key",    hint: "Search indexing + proxy",               set: false },
                  { label: "Firebase FCM",       hint: "Push notifications",                    set: false },
                  { label: "S3 / Storage Key",   hint: "Video & image uploads",                 set: false },
                ].map(({ label, hint, set }) => (
                  <div key={label} className="flex items-center justify-between rounded-xl border border-[#f0f0f0] p-4 mb-2">
                    <div>
                      <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                      <p className="text-[11px] text-[#9ca3af]">{hint}</p>
                    </div>
                    <span className={cn(
                      "rounded-full px-3 py-1 text-[11px] font-bold",
                      set ? "bg-[#dcfce7] text-[#166534]" : "bg-[#fee2e2] text-red-700"
                    )}>
                      {set ? "Configured" : "Not set"}
                    </span>
                  </div>
                ))}
                <p className="mt-3 text-[11px] text-[#9ca3af]">
                  To update API keys, edit <code className="rounded bg-[#f3f4f6] px-1">/var/www/teezer/server/.env</code> on the VPS and run <code className="rounded bg-[#f3f4f6] px-1">php artisan config:cache</code>.
                </p>
              </div>
            )}

            {/* ── Environment tab ──────────────────────────────────────── */}
            {activeTab === "Environment" && (
              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-[#fff0f4]">
                    <Globe className="h-5 w-5 text-[#fe2c55]" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-extrabold text-[#111827]">Frontend Environment</h3>
                    <p className="mt-0.5 text-[12px] text-[#9ca3af]">Public NEXT_PUBLIC_* variables visible to browser</p>
                  </div>
                </div>
                <div className="space-y-2">
                  {envVars.map(({ key, label, value }) => (
                    <div key={key} className="flex items-start justify-between gap-4 rounded-xl border border-[#f0f0f0] px-4 py-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                        <p className="text-[11px] text-[#9ca3af]">{key}</p>
                      </div>
                      <p className={cn(
                        "mt-0.5 rounded px-2 py-0.5 font-mono text-[11px]",
                        value === "(not set)"
                          ? "bg-[#fee2e2] text-red-700"
                          : "bg-[#f3f4f6] text-[#374151]"
                      )}>
                        {value}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Cache tab ────────────────────────────────────────────── */}
            {activeTab === "Cache" && (
              <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-[#fff7ed]">
                      <Shield className="h-5 w-5 text-[#f97316]" />
                    </div>
                    <div>
                      <h3 className="text-[15px] font-extrabold text-[#111827]">Application Cache</h3>
                      <p className="mt-0.5 text-[12px] text-[#9ca3af]">Clear backend config and settings cache</p>
                    </div>
                  </div>
                  <button
                    onClick={clearCache}
                    disabled={clearing}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold transition",
                      clearing
                        ? "cursor-not-allowed bg-[#f3f4f6] text-[#9ca3af]"
                        : "bg-[#f97316] text-white hover:bg-[#ea6a0a]"
                    )}
                  >
                    {clearing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    {clearing ? "Clearing…" : "Clear Cache"}
                  </button>
                </div>
                {cacheResult && (
                  <div className="mt-4 rounded-xl bg-[#f0fdf4] border border-[#bbf7d0] px-4 py-3 text-[13px] font-semibold text-[#166534]">
                    ✅ {cacheResult}
                  </div>
                )}
              </div>
            )}

          </div>
        </div>
      </div>
    </div>
  );
}
