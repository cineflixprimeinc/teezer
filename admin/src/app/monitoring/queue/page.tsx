"use client";

import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import { MonPage, StatTile, MiniTable } from "@/components/monitoring/mon-bits";

export default function QueueMonitoring() {
  const q = useQuery({ queryKey: ["mon-queue"], queryFn: adminService.monitoring.queue, refetchInterval: 15_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = q.data;

  return (
    <MonPage title="Queue Jobs" subtitle="Background worker backlog" isLoading={q.isLoading} refetch={q.refetch} dataUpdatedAt={q.dataUpdatedAt}>
      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Driver" value={d?.driver ?? "-"} color={d?.driver === "sync" ? "#f59e0b" : "#3b82f6"} />
        <StatTile label="Pending" value={d?.pending ?? "-"} color="#10b981" />
        <StatTile label="Failed" value={d?.failed ?? "-"} color={(d?.failed ?? 0) > 0 ? "#ef4444" : "#10b981"} />
      </div>

      {d?.note && (
        <div className="rounded-xl border border-[#fde68a] bg-[#fffbeb] px-4 py-3 text-[13px] text-[#92400e]">{d.note}</div>
      )}

      <MiniTable
        title="Pending by queue"
        head={["Queue", "Jobs"]}
        rows={(d?.by_queue ?? []).map((r: { queue: string; count: number }) => [<span key="q" className="font-mono">{r.queue}</span>, r.count])}
        empty="No pending jobs."
      />

      <MiniTable
        title="Recent failures"
        head={["ID", "Queue", "Error", "Failed at"]}
        rows={(d?.recent_failed ?? []).map((r: { id: number; queue: string; exception: string; failed_at: string }) => [
          r.id,
          <span key="q" className="font-mono">{r.queue ?? "-"}</span>,
          <span key="e" className="text-[12px] text-[#ef4444] line-clamp-2 max-w-[420px] inline-block">{r.exception}</span>,
          r.failed_at,
        ])}
        empty="No failed jobs. 🎉"
      />
    </MonPage>
  );
}
