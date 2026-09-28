"use client";

import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import { MonPage, StatTile, InfoCard, MiniTable } from "@/components/monitoring/mon-bits";

export default function DatabaseMonitoring() {
  const q = useQuery({ queryKey: ["mon-db"], queryFn: adminService.monitoring.database, refetchInterval: 20_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = q.data;
  const c = d?.connections;

  return (
    <MonPage title="PostgreSQL" subtitle="Connections, size & slow queries" isLoading={q.isLoading} refetch={q.refetch} dataUpdatedAt={q.dataUpdatedAt}>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Status" value={d?.ok ? "Connected" : "Down"} color={d?.ok ? "#10b981" : "#ef4444"} />
        <StatTile label="Database size" value={d?.size_pretty ?? "-"} />
        <StatTile label="Connections" value={c ? `${c.total} / ${c.max}` : "-"} color="#3b82f6" />
        <StatTile label="Cache hit ratio" value={d?.cache_hit_pct != null ? `${d.cache_hit_pct}%` : "-"} color="#8b5cf6" />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <InfoCard title="Connections" rows={[
          ["Active", c?.active], ["Idle", c?.idle], ["Total", c?.total], ["Max allowed", c?.max],
        ]} />
        <InfoCard title="Server" rows={[
          ["Driver", d?.driver],
          ["Version", d?.version ? String(d.version).split(" on ")[0] : null],
        ]} />
      </div>

      <MiniTable
        title="Largest tables"
        head={["Table", "Rows", "Size"]}
        rows={(d?.top_tables ?? []).map((t: { name: string; rows: number; size_pretty: string }) => [
          <span key="n" className="font-mono">{t.name}</span>,
          (t.rows ?? 0).toLocaleString(),
          t.size_pretty,
        ])}
        empty="No table stats available."
      />

      <MiniTable
        title="Slowest queries (pg_stat_statements)"
        head={["Query", "Calls", "Mean ms", "Total ms"]}
        rows={(d?.slow_queries?.rows ?? []).map((r: { query: string; calls: number; mean_ms: number; total_ms: number }) => [
          <span key="q" className="font-mono text-[12px] line-clamp-2 max-w-[420px] inline-block">{r.query}</span>,
          r.calls, r.mean_ms, r.total_ms,
        ])}
        empty={d?.slow_queries?.available === false ? "Enable the pg_stat_statements extension on Postgres to see slow queries." : "No slow queries recorded."}
      />
    </MonPage>
  );
}
