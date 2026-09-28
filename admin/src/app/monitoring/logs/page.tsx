"use client";

import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import { MonPage, MiniTable } from "@/components/monitoring/mon-bits";

const LEVEL_COLOR: Record<string, string> = {
  EMERGENCY: "#ef4444", ALERT: "#ef4444", CRITICAL: "#ef4444", ERROR: "#ef4444",
  WARNING: "#f59e0b", NOTICE: "#3b82f6", INFO: "#6b7280", DEBUG: "#9ca3af",
};

export default function LogsMonitoring() {
  const q = useQuery({ queryKey: ["mon-logs"], queryFn: adminService.monitoring.logs, refetchInterval: 20_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = q.data;

  return (
    <MonPage title="App Logs" subtitle={d?.file ? `Tail of ${d.file}` : "Application log"} isLoading={q.isLoading} refetch={q.refetch} dataUpdatedAt={q.dataUpdatedAt}>
      <MiniTable
        title="Recent log entries (newest first)"
        head={["Level", "Time", "Message"]}
        rows={(d?.entries ?? []).map((e: { ts: string; level: string; message: string }) => [
          <span key="l" className="font-semibold" style={{ color: LEVEL_COLOR[e.level] ?? "#6b7280" }}>{e.level}</span>,
          <span key="t" className="font-mono text-[12px] text-[#9ca3af] whitespace-nowrap">{e.ts}</span>,
          <span key="m" className="font-mono text-[12px] line-clamp-2 max-w-[560px] inline-block">{e.message}</span>,
        ])}
        empty={d?.error ?? "No recent log entries."}
      />
    </MonPage>
  );
}
