"use client";

import { useQuery } from "@tanstack/react-query";
import { adminService } from "@/services/admin.service";
import { MonPage, StatTile, InfoCard } from "@/components/monitoring/mon-bits";

export default function RedisMonitoring() {
  const q = useQuery({ queryKey: ["mon-redis"], queryFn: adminService.monitoring.redis, refetchInterval: 15_000 });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d: any = q.data;
  const i = d?.info;

  return (
    <MonPage title="Redis" subtitle="Cache, counters & pub/sub" isLoading={q.isLoading} refetch={q.refetch} dataUpdatedAt={q.dataUpdatedAt}>
      {d && !d.ok ? (
        <p className="text-[14px] text-[#ef4444]">Redis is unreachable.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Status" value={d?.ok ? "Connected" : "-"} color={d?.ok ? "#10b981" : "#9ca3af"} />
            <StatTile label="Memory used" value={i?.used_memory_human ?? "-"} />
            <StatTile label="Clients" value={i?.connected_clients ?? "-"} color="#3b82f6" />
            <StatTile label="Hit rate" value={i?.hit_rate_pct != null ? `${i.hit_rate_pct}%` : "-"} color="#8b5cf6" />
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            <InfoCard title="Server" rows={[
              ["Version", i?.version],
              ["Uptime", i?.uptime_days != null ? `${i.uptime_days} days` : null],
              ["Peak memory", i?.used_memory_peak_human],
              ["Max memory", i?.maxmemory_human],
              ["Ops / sec", i?.ops_per_sec],
              ["Total commands", i?.total_commands_processed?.toLocaleString?.()],
            ]} />
            <InfoCard title="Keyspace" rows={[
              ["DB0 keys (app + counters)", d?.db0_keys?.toLocaleString?.()],
              ["Cache DB keys", d?.cache_keys?.toLocaleString?.() ?? "-"],
              ["Keyspace hits", i?.keyspace_hits?.toLocaleString?.()],
              ["Keyspace misses", i?.keyspace_misses?.toLocaleString?.()],
              ["Evicted keys", i?.evicted_keys],
              ["Rejected connections", i?.rejected_connections],
            ]} />
          </div>
        </>
      )}
    </MonPage>
  );
}
