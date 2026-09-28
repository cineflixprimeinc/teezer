"use client";

import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import { MonPage, StatTile, InfoCard } from "@/components/monitoring/mon-bits";

export default function MonitoringOverview() {
  const q = useQuery({ queryKey: ["mon-overview"], queryFn: adminService.monitoring.overview, refetchInterval: 15_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = q.data;
  const ws = d?.realtime?.chat_server;

  return (
    <MonPage title="Monitoring" subtitle="Platform health & metrics" isLoading={q.isLoading} refetch={q.refetch} dataUpdatedAt={q.dataUpdatedAt}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Database" value={d?.db?.ok ? `OK · ${d.db.latency_ms}ms` : "Down"} color={d?.db?.ok ? "#10b981" : "#ef4444"} />
        <StatTile label="Redis" value={d?.redis?.ok ? (d.redis.used_memory_human ?? "OK") : "Down"} color={d?.redis?.ok ? "#10b981" : "#ef4444"} />
        <StatTile label="Online users" value={d?.realtime?.online_users ?? "-"} color="#3b82f6" />
        <StatTile label="Queue pending" value={d?.queue?.pending ?? "-"} color="#8b5cf6" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard title="Application" rows={[
          ["Environment", d?.app?.env],
          ["PHP", d?.app?.php_version],
          ["Laravel", d?.app?.laravel_version],
          ["Queue driver", d?.app?.queue_driver],
          ["Cache driver", d?.app?.cache_driver],
          ["Session driver", d?.app?.session_driver],
          ["Debug mode", d?.app?.debug ? "ON ⚠️" : "off"],
        ]} />
        <InfoCard title="System & realtime" rows={[
          ["WebSocket", ws?.ok == null ? "-" : (ws.ok ? `OK · ${ws.latency_ms}ms` : "Down")],
          ["Queue failed", d?.queue?.failed],
          ["Redis clients", d?.redis?.connected_clients],
          ["Sessions", d?.system?.sessions],
          ["Disk free", d?.system?.disk_free_gb != null ? `${d.system.disk_free_gb} GB` : null],
          ["Disk used", d?.system?.disk_used_pct != null ? `${d.system.disk_used_pct}%` : null],
        ]} />
      </div>
    </MonPage>
  );
}
