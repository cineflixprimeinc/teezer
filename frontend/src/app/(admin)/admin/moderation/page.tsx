"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Shield, Cpu, Eye,
} from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";
import { Badge, StatusBadge } from "@/admin-panel/components/ui/badge";
import { Button } from "@/admin-panel/components/ui/button";
import { Select } from "@/admin-panel/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/admin-panel/components/ui/data-table";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatCompact, timeAgo } from "@/admin-panel/lib/utils";

type TabKey = "queue" | "logs";

export default function ModerationPage() {
  const [tab, setTab]       = useState<TabKey>("queue");
  const [page, setPage]     = useState(1);
  const [decision, setDecision] = useState("");
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ["admin-mod-stats"],
    queryFn: adminService.moderationStats,
    refetchInterval: 30_000,
  });

  const { data: scannerHealth } = useQuery({
    queryKey: ["admin-scanner-health"],
    queryFn: adminService.scannerHealth,
    refetchInterval: 60_000,
  });

  const { data: pending, isLoading: pendingLoading } = useQuery({
    queryKey: ["admin-mod-pending", page],
    queryFn:  () => adminService.moderationPending({ page, per_page: 20 }),
    enabled:  tab === "queue",
  });

  const { data: logs, isLoading: logsLoading } = useQuery({
    queryKey: ["admin-mod-logs", page],
    queryFn:  () => adminService.moderationLogs({ page, per_page: 20 }),
    enabled:  tab === "logs",
  });

  const decide = useMutation({
    mutationFn: ({ id, decision, reason }: { id: string; decision: string; reason?: string }) =>
      adminService.moderationDecide(id, decision, reason),
    onSuccess: () => {
      toast.success("Decision recorded");
      qc.invalidateQueries({ queryKey: ["admin-mod-pending"] });
      qc.invalidateQueries({ queryKey: ["admin-mod-stats"] });
    },
    onError: () => toast.error("Failed to record decision"),
  });

  const pendingItems = pending?.data ?? [];
  const pendingMeta  = pending?.meta ?? {};
  const logItems     = logs?.data ?? [];
  const logMeta      = logs?.meta ?? {};

  const scannerOk = (scannerHealth as { status?: string } | undefined)?.status === "ok";

  return (
    <AdminShell title="Content Moderation">
      <div className="space-y-5">

        {/* Stats row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Pending Review",  value: formatCompact(stats?.pending_count),      color: "#f59e0b", icon: AlertTriangle },
            { label: "Approved Today",  value: formatCompact(stats?.approved_today),     color: "#10b981", icon: CheckCircle2 },
            { label: "Rejected Today",  value: formatCompact(stats?.rejected_today),     color: "#ef4444", icon: XCircle },
            { label: "Total Scanned",   value: formatCompact(stats?.total_scanned),      color: "#3b82f6", icon: Cpu },
          ].map(({ label, value, color, icon: Icon }) => (
            <Card key={label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
                  <p className="mt-2 text-[26px] font-bold text-[#111827] leading-none">{value ?? "-"}</p>
                </div>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color + "15" }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        {/* Scanner status */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div className={`grid h-8 w-8 place-items-center rounded-full ${scannerOk ? "bg-emerald-50" : "bg-amber-50"}`}>
              <Cpu className={`h-4 w-4 ${scannerOk ? "text-emerald-600" : "text-amber-600"}`} />
            </div>
            <div>
              <p className="text-[13px] font-semibold text-[#111827]">NudeNet / NSFW Scanner</p>
              <p className="text-[12px] text-[#9ca3af]">
                Status: <span className={scannerOk ? "text-emerald-600 font-medium" : "text-amber-600 font-medium"}>
                  {scannerOk ? "Online" : "Offline / Degraded"}
                </span>
              </p>
            </div>
            <div className="ml-auto">
              <Badge variant={scannerOk ? "success" : "warning"}>
                {scannerOk ? "Operational" : "Check Required"}
              </Badge>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <div className="flex gap-0 overflow-x-auto rounded-xl border border-[#e8eaed] bg-white">
          {(["queue", "logs"] as TabKey[]).map((t) => (
            <button key={t} onClick={() => { setTab(t); setPage(1); }}
              className={`shrink-0 border-b-2 px-5 py-3 text-[13px] font-medium transition-colors capitalize
                ${tab === t ? "border-[#fd4605] text-[#fd4605]" : "border-transparent text-[#6b7280] hover:text-[#111827]"}`}>
              {t === "queue" ? `Pending Queue${stats?.pending_count ? ` (${stats.pending_count})` : ""}` : "Moderation Logs"}
            </button>
          ))}
        </div>

        {/* Queue tab */}
        {tab === "queue" && (
          <Card>
            <Table>
              <Thead>
                <Th>Content</Th>
                <Th>Type</Th>
                <Th>Confidence</Th>
                <Th>Submitted</Th>
                <Th>Actions</Th>
              </Thead>
              <Tbody>
                {pendingLoading
                  ? <TableLoading cols={5} />
                  : pendingItems.length === 0
                    ? <TableEmpty message="No items pending review." />
                    : pendingItems.map((item: {
                        content_id: string; content_type: string;
                        confidence: number; label: string;
                        thumbnail_url?: string; created_at: string;
                        video?: { caption: string | null };
                      }) => (
                        <Tr key={item.content_id}>
                          <Td>
                            <div className="flex items-center gap-3">
                              <div className="h-10 w-[28px] shrink-0 rounded-md bg-[#f3f4f6] overflow-hidden">
                                {item.thumbnail_url
                                  ? <img src={item.thumbnail_url} alt="" className="h-full w-full object-cover blur-sm" />
                                  : <div className="h-full grid place-items-center"><Shield className="h-3 w-3 text-[#9ca3af]" /></div>
                                }
                              </div>
                              <div>
                                <p className="text-[13px] font-medium text-[#111827]">ID: {item.content_id}</p>
                                <p className="text-[11px] text-[#9ca3af]">{item.video?.caption || "No caption"}</p>
                              </div>
                            </div>
                          </Td>
                          <Td><Badge variant="warning">{item.content_type}</Badge></Td>
                          <Td>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-16 rounded-full bg-[#f3f4f6] overflow-hidden">
                                <div className="h-full rounded-full bg-red-400"
                                  style={{ width: `${Math.round((item.confidence ?? 0) * 100)}%` }} />
                              </div>
                              <span className="text-[12px] text-[#374151]">
                                {Math.round((item.confidence ?? 0) * 100)}%
                              </span>
                            </div>
                          </Td>
                          <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(item.created_at)}</span></Td>
                          <Td>
                            <div className="flex items-center gap-1">
                              <Button variant="success" size="sm"
                                disabled={decide.isPending}
                                onClick={() => decide.mutate({ id: item.content_id, decision: "approved" })}>
                                <CheckCircle2 className="h-3 w-3" /> Approve
                              </Button>
                              <Button variant="danger" size="sm"
                                disabled={decide.isPending}
                                onClick={() => decide.mutate({ id: item.content_id, decision: "rejected", reason: "NSFW content detected" })}>
                                <XCircle className="h-3 w-3" /> Reject
                              </Button>
                            </div>
                          </Td>
                        </Tr>
                      ))
                }
              </Tbody>
            </Table>
            <Pagination
              currentPage={pendingMeta.current_page ?? 1}
              lastPage={pendingMeta.last_page ?? 1}
              total={pendingMeta.total ?? 0}
              onPage={(p) => { setPage(p); }}
            />
          </Card>
        )}

        {/* Logs tab */}
        {tab === "logs" && (
          <Card>
            <Table>
              <Thead>
                <Th>Content ID</Th>
                <Th>Decision</Th>
                <Th>Label</Th>
                <Th>Admin</Th>
                <Th>Time</Th>
              </Thead>
              <Tbody>
                {logsLoading
                  ? <TableLoading cols={5} />
                  : logItems.length === 0
                    ? <TableEmpty message="No moderation logs yet." />
                    : logItems.map((log: {
                        id: number; content_id: string; decision: string;
                        label: string; created_at: string;
                        admin?: { name: string };
                      }) => (
                        <Tr key={log.id}>
                          <Td><span className="font-mono text-[12px] text-[#374151]">{log.content_id}</span></Td>
                          <Td><StatusBadge status={log.decision} /></Td>
                          <Td><Badge variant="default">{log.label || "-"}</Badge></Td>
                          <Td><span className="text-[13px] text-[#374151]">{log.admin?.name || "System"}</span></Td>
                          <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(log.created_at)}</span></Td>
                        </Tr>
                      ))
                }
              </Tbody>
            </Table>
            <Pagination
              currentPage={logMeta.current_page ?? 1}
              lastPage={logMeta.last_page ?? 1}
              total={logMeta.total ?? 0}
              onPage={setPage}
            />
          </Card>
        )}
      </div>
    </AdminShell>
  );
}
