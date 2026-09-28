"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, X, AlertCircle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function StudioBackendSettings() {
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string; database?: any; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const testConnection = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/v1/studio/settings/test/connection");
      const data = await res.json();
      setTestResult(data);
    } catch (err) {
      setTestResult({ success: false, error: (err as Error).message });
    } finally {
      setLoading(false);
    }
  };

  const isConnected = testResult?.success === true;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-[20px] font-extrabold text-[#111827]">Backend Configuration</h2>
        <p className="mt-1 text-[13px] text-[#9ca3af]">Check database connection and configure backend settings</p>
      </div>

      {/* Database Connection Card */}
      <div className="rounded-2xl border border-[#f0f0f0] bg-white p-6">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[15px] font-extrabold text-[#111827]">Database Connection</h3>
            <p className="mt-1 text-[12px] text-[#9ca3af]">Test your backend database connection</p>
          </div>
          <button
            onClick={testConnection}
            disabled={loading}
            className={cn(
              "flex items-center gap-2 rounded-lg px-4 py-2 text-[12px] font-semibold transition",
              loading
                ? "cursor-not-allowed bg-[#f3f4f6] text-[#9ca3af]"
                : "bg-[#fe2c55] text-white hover:bg-[#e0243d]"
            )}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Testing...
              </>
            ) : (
              "Test Connection"
            )}
          </button>
        </div>

        {/* Result */}
        {testResult && (
          <div className={cn("mt-4 rounded-lg p-4", isConnected ? "bg-[#dcfce7]" : "bg-[#fee2e2]")}>
            <div className="flex items-start gap-3">
              {isConnected ? (
                <Check className="h-5 w-5 flex-shrink-0 text-[#16a34a]" />
              ) : (
                <X className="h-5 w-5 flex-shrink-0 text-red-500" />
              )}
              <div>
                <p className={cn("text-[13px] font-semibold", isConnected ? "text-[#166534]" : "text-red-800")}>
                  {testResult.message}
                </p>
                {isConnected && testResult.database && (
                  <div className="mt-2 space-y-1 text-[12px] text-[#166534]">
                    <p>
                      <strong>Driver:</strong> {testResult.database.driver}
                    </p>
                    <p>
                      <strong>Host:</strong> {testResult.database.host}
                    </p>
                    <p>
                      <strong>Database:</strong> {testResult.database.database}
                    </p>
                  </div>
                )}
                {testResult.error && (
                  <p className="mt-2 text-[12px] text-red-700">
                    <strong>Error:</strong> {testResult.error}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Card */}
      <div className="rounded-2xl border border-[#fef3c7] bg-[#fffbeb] p-4">
        <div className="flex gap-3">
          <AlertCircle className="h-5 w-5 flex-shrink-0 text-[#b45309]" />
          <div className="text-[12px] text-[#92400e]">
            <p className="font-semibold">Backend API Status</p>
            <p className="mt-1">
              The backend API must be running for analytics, notifications, and other real-time features to work correctly.
              Ensure your server is deployed and the API is accessible.
            </p>
          </div>
        </div>
      </div>

      {/* Quick Links */}
      <div className="grid grid-cols-2 gap-4">
        <a
          href="https://github.com/cineflixprime/reelsoo"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col rounded-lg border border-[#f0f0f0] bg-white p-4 transition hover:border-[#fe2c55] hover:shadow-sm"
        >
          <p className="text-[13px] font-semibold text-[#111827]">View Backend Code</p>
          <p className="mt-1 text-[11px] text-[#9ca3af]">GitHub repository →</p>
        </a>
        <a
          href="https://laravel.com/docs"
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col rounded-lg border border-[#f0f0f0] bg-white p-4 transition hover:border-[#fe2c55] hover:shadow-sm"
        >
          <p className="text-[13px] font-semibold text-[#111827]">Laravel Docs</p>
          <p className="mt-1 text-[11px] text-[#9ca3af]">Official documentation →</p>
        </a>
      </div>
    </div>
  );
}
