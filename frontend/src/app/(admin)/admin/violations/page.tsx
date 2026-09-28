"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card } from "@/admin-panel/components/ui/card";
import { Badge } from "@/admin-panel/components/ui/badge";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/admin-panel/components/ui/data-table";
import { adminService } from "@/admin-panel/services/admin.service";
import { timeAgo } from "@/admin-panel/lib/utils";

const SEVERITY_VARIANTS: Record<string, "danger" | "warning" | "info" | "default"> = {
  critical: "danger", high: "danger", medium: "warning", info: "info",
};

export default function ViolationsPage() {
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-violations", page],
    queryFn:  () => adminService.actionLogs({ page, per_page: 30, severity: "high" }),
  });

  const logs = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <AdminShell title="Violations">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Policy Violations</h2>
          <p className="text-[13px] text-[#6b7280]">High-severity admin actions and policy violation records.</p>
        </div>

        <Card>
          <Table>
            <Thead>
              <Th>Action</Th>
              <Th>Description</Th>
              <Th>Severity</Th>
              <Th>Admin</Th>
              <Th>Time</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={5} />
                : logs.length === 0
                  ? <TableEmpty message="No violations logged." />
                  : logs.map((log: {
                      id: number; action: string; description: string; severity: string;
                      created_at: string; admin?: { name: string };
                    }) => (
                      <Tr key={log.id}>
                        <Td>
                          <div className="flex items-center gap-2">
                            <Shield className="h-3.5 w-3.5 text-red-400 shrink-0" />
                            <span className="font-mono text-[12px] font-medium text-[#111827]">{log.action}</span>
                          </div>
                        </Td>
                        <Td><p className="text-[12px] text-[#6b7280] max-w-[240px] truncate">{log.description}</p></Td>
                        <Td>
                          <Badge variant={SEVERITY_VARIANTS[log.severity] ?? "default"} className="capitalize">
                            {log.severity}
                          </Badge>
                        </Td>
                        <Td><span className="text-[13px] text-[#374151]">{log.admin?.name ?? "System"}</span></Td>
                        <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(log.created_at)}</span></Td>
                      </Tr>
                    ))
              }
            </Tbody>
          </Table>
          <Pagination
            currentPage={meta.current_page ?? 1}
            lastPage={meta.last_page ?? 1}
            total={meta.total ?? 0}
            onPage={setPage}
          />
        </Card>
      </div>
    </AdminShell>
  );
}
