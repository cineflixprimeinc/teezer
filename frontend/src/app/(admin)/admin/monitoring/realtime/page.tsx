"use client";

import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/admin-panel/services/admin.service";
import { MonPage, StatTile, InfoCard } from "@/admin-panel/components/monitoring/mon-bits";

export default function RealtimeMonitoring() {
  const q = useQuery({ queryKey: ["mon-realtime"], queryFn: adminService.monitoring.realtime, refetchInterval: 10_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = q.data;
  const ws = d?.chat_server;

  return (
    <MonPage title="WebSocket" subtitle="Realtime gateway & presence" isLoading={q.isLoading} refetch={q.refetch} dataUpdatedAt={q.dataUpdatedAt}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Online users" value={d?.online_users ?? "-"} color="#10b981" />
        <StatTile label="Gateway" value={ws?.ok == null ? "-" : ws.ok ? "Up" : "Down"} color={ws?.ok ? "#10b981" : ws?.ok === false ? "#ef4444" : "#9ca3af"} />
        <StatTile label="Latency" value={ws?.latency_ms != null ? `${ws.latency_ms} ms` : "-"} color="#3b82f6" />
      </div>

      <InfoCard title="Chat / realtime server" rows={[
        ["Health", ws?.ok == null ? "unknown" : ws.ok ? "operational" : "unreachable"],
        ["URL", ws?.url],
        ["Round-trip", ws?.latency_ms != null ? `${ws.latency_ms} ms` : null],
        ["Online users (presence)", d?.online_users],
      ]} />

      {d?.note && <p className="text-[12px] text-[#9ca3af]">{d.note}</p>}
    </MonPage>
  );
}
