"use client";

import type { ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";
import { Button } from "@/admin-panel/components/ui/button";

/** Page wrapper for every Monitoring sub-page: AdminShell + header + refresh. */
export function MonPage({ title, subtitle, isLoading, refetch, dataUpdatedAt, children }: {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  refetch?: () => void;
  dataUpdatedAt?: number;
  children: ReactNode;
}) {
  const last = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "-";
  return (
    <AdminShell title={title}>
      <div className="space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">{title}</h2>
            <p className="text-[13px] text-[#9ca3af]">{subtitle ? subtitle + " · " : ""}Last checked: {last} · Auto-refreshes</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch?.()} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
        {children}
      </div>
    </AdminShell>
  );
}

/** A single headline stat tile. */
export function StatTile({ label, value, color = "#111827" }: { label: string; value: ReactNode; color?: string }) {
  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
      <p className="mt-2 text-[20px] font-bold" style={{ color }}>{value ?? "-"}</p>
    </Card>
  );
}

/** A key/value card. */
export function InfoCard({ title, rows }: { title: string; rows: [string, ReactNode][] }) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardBody className="space-y-2">
        {rows.map(([k, v]) => (
          <div key={k} className="flex items-center justify-between gap-4 py-1 border-b border-[#f3f4f6] last:border-0">
            <span className="text-[12px] text-[#9ca3af] shrink-0">{k}</span>
            <span className="text-[13px] font-medium text-[#111827] font-mono text-right truncate">{v ?? "-"}</span>
          </div>
        ))}
      </CardBody>
    </Card>
  );
}

/** A simple, safe table for monitoring lists. */
export function MiniTable({ title, head, rows, empty = "No data." }: {
  title: string; head: string[]; rows: ReactNode[][]; empty?: string;
}) {
  return (
    <Card>
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardBody className="p-0">
        {rows.length === 0 ? (
          <p className="px-5 py-6 text-[13px] text-[#9ca3af]">{empty}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr className="border-b border-[#f3f4f6]">
                  {head.map((h) => <th key={h} className="px-5 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-[#f7f7f8] last:border-0">
                    {r.map((c, j) => <td key={j} className="px-5 py-2.5 text-[#111827] align-top">{c}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardBody>
    </Card>
  );
}
