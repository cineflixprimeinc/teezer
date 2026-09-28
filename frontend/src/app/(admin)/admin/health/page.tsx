"use client";

import { useQuery } from "@tanstack/react-query";
import { RefreshCw, Server, Database, Search, Package, Cpu } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";
import { Badge } from "@/admin-panel/components/ui/badge";
import { Button } from "@/admin-panel/components/ui/button";
import { adminService } from "@/admin-panel/services/admin.service";

type HealthData = {
  database: string; search: string;
  queue: { depth: number; status: string };
  app_env: string; php_version: string; timestamp: string;
};

function HealthRow({ icon: Icon, label, status, sub }: {
  icon: React.ElementType; label: string; status: string; sub?: string;
}) {
  const ok      = status === "operational";
  const warn    = status === "busy" || status === "degraded";
  const variant = ok ? "success" : warn ? "warning" : "danger";
  const color   = ok ? "#10b981" : warn ? "#f59e0b" : "#ef4444";

  return (
    <div className="flex items-center gap-4 py-3.5 border-b border-[#f3f4f6] last:border-0">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color + "15" }}>
        <Icon className="h-5 w-5" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
        {sub && <p className="text-[12px] text-[#9ca3af]">{sub}</p>}
      </div>
      <Badge variant={variant} className="capitalize">{status}</Badge>
    </div>
  );
}

export default function HealthPage() {
  const { data, isLoading, refetch, dataUpdatedAt } = useQuery({
    queryKey:       ["admin-health"],
    queryFn:        adminService.systemHealth,
    refetchInterval: 30_000,
  });
  const { data: scannerHealth } = useQuery({
    queryKey:       ["admin-scanner-health"],
    queryFn:        adminService.scannerHealth,
    refetchInterval: 60_000,
  });

  const h = data as HealthData | undefined;
  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : "-";
  const scanOk = (scannerHealth as { status?: string } | undefined)?.status === "ok";

  return (
    <AdminShell title="System Health">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">System Health</h2>
            <p className="text-[13px] text-[#9ca3af]">Last checked: {lastUpdated} · Auto-refreshes every 30s</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`h-3.5 w-3.5 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>

        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "All Systems",    status: !h || (h.database === "operational" && h.search !== "error") ? "Operational" : "Degraded",      color: "#10b981" },
            { label: "Queue Depth",    status: `${h?.queue?.depth ?? "-"} jobs`,                                                                  color: "#3b82f6" },
            { label: "Environment",    status: h?.app_env ?? "-",                                                                                 color: "#8b5cf6" },
          ].map(({ label, status, color }) => (
            <Card key={label} className="p-5">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
              <p className="mt-2 text-[20px] font-bold" style={{ color }}>{status}</p>
            </Card>
          ))}
        </div>

        {/* Service status */}
        <Card>
          <CardHeader><CardTitle>Service Status</CardTitle></CardHeader>
          <CardBody className="p-0 px-5">
            <HealthRow icon={Server}   label="Web Server"  status="operational" sub="Laravel 11 + PHP" />
            <HealthRow icon={Database} label="Database"    status={h?.database ?? "checking"} sub="MySQL" />
            <HealthRow icon={Search}   label="Search"      status={h?.search   ?? "checking"} sub="Meilisearch" />
            <HealthRow icon={Package}  label="Queue"       status={h?.queue?.status ?? "checking"} sub={`${h?.queue?.depth ?? 0} pending jobs`} />
            <HealthRow icon={Cpu}      label="NSFW Scanner" status={scanOk ? "operational" : "degraded"} sub="NudeNet + OpenNSFW2" />
          </CardBody>
        </Card>

        {/* Server info */}
        {h && (
          <Card>
            <CardHeader><CardTitle>Server Information</CardTitle></CardHeader>
            <CardBody className="space-y-2">
              {[
                ["PHP Version",   h.php_version],
                ["Environment",   h.app_env],
                ["Queue Depth",   `${h.queue?.depth} jobs`],
                ["Checked At",    h.timestamp ? new Date(h.timestamp).toLocaleString() : "-"],
              ].map(([k, v]) => (
                <div key={k} className="flex items-center justify-between py-1 border-b border-[#f3f4f6] last:border-0">
                  <span className="text-[12px] text-[#9ca3af]">{k}</span>
                  <span className="text-[13px] font-medium text-[#111827] font-mono">{v}</span>
                </div>
              ))}
            </CardBody>
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
