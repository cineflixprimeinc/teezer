"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Download } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/components/ui/data-table";
import { adminService } from "@/services/admin.service";
import { timeAgo } from "@/lib/utils";

const SEVERITY_VARIANTS: Record<string, "danger" | "warning" | "info" | "default"> = {
  critical: "danger",
  high:     "danger",
  medium:   "warning",
  info:     "info",
};

export default function LogsPage() {
  const [page,     setPage]     = useState(1);
  const [severity, setSeverity] = useState("");
  const [category, setCategory] = useState("");
  const [q,        setQ]        = useState("");

  const params = {
    page, per_page: 30,
    ...(severity && { severity }),
    ...(category && { category }),
  };

  const { data, isLoading } = useQuery({
    queryKey: ["admin-logs", params],
    queryFn:  () => adminService.actionLogs(params),
  });

  const logs = data?.data ?? [];
  const meta = data?.meta ?? {};

  const filtered = q
    ? logs.filter((l: { action: string; description: string; admin?: { name: string } }) =>
        l.action?.toLowerCase().includes(q.toLowerCase()) ||
        l.description?.toLowerCase().includes(q.toLowerCase()) ||
        l.admin?.name?.toLowerCase().includes(q.toLowerCase())
      )
    : logs;

  return (
    <AdminShell title="Audit Logs">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">Admin Audit Logs</h2>
            <p className="text-[13px] text-[#6b7280]">Every admin action is logged with full details.</p>
          </div>
          <Button variant="outline" size="sm"><Download className="h-3.5 w-3.5" /> Export</Button>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[180px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
              <Input placeholder="Search action, description, admin..." value={q}
                onChange={(e) => setQ(e.target.value)} className="pl-9" />
            </div>
            <Select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }}>
              <option value="">All Severity</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="info">Info</option>
            </Select>
            <Select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }}>
              <option value="">All Categories</option>
              <option value="user_management">User Management</option>
              <option value="content_actions">Content Actions</option>
              <option value="settings">Settings</option>
              <option value="moderation">Moderation</option>
            </Select>
            {(q || severity || category) && (
              <Button variant="ghost" size="sm" onClick={() => { setQ(""); setSeverity(""); setCategory(""); setPage(1); }}>
                Clear
              </Button>
            )}
          </div>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <Thead>
              <Th>Action</Th>
              <Th>Description</Th>
              <Th>Severity</Th>
              <Th>Category</Th>
              <Th>Admin</Th>
              <Th>IP</Th>
              <Th>Time</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={7} />
                : filtered.length === 0
                  ? <TableEmpty message="No logs match your filters." />
                  : filtered.map((log: {
                      id: number; action: string; description: string; severity: string;
                      category: string; ip_address: string | null; created_at: string;
                      admin?: { name: string; username: string };
                    }) => (
                      <Tr key={log.id}>
                        <Td>
                          <span className="font-mono text-[12px] font-medium text-[#111827]">
                            {log.action}
                          </span>
                        </Td>
                        <Td>
                          <p className="text-[12px] text-[#6b7280] max-w-[240px] truncate">
                            {log.description}
                          </p>
                        </Td>
                        <Td>
                          <Badge variant={SEVERITY_VARIANTS[log.severity] ?? "default"} className="capitalize">
                            {log.severity}
                          </Badge>
                        </Td>
                        <Td>
                          <span className="text-[12px] text-[#9ca3af] capitalize">{log.category?.replace(/_/g, " ")}</span>
                        </Td>
                        <Td>
                          <div>
                            <p className="text-[13px] font-medium text-[#111827]">{log.admin?.name ?? "System"}</p>
                            {log.admin?.username && <p className="text-[11px] text-[#9ca3af]">@{log.admin.username}</p>}
                          </div>
                        </Td>
                        <Td>
                          <span className="font-mono text-[11px] text-[#9ca3af]">{log.ip_address ?? "-"}</span>
                        </Td>
                        <Td>
                          <span className="text-[12px] text-[#9ca3af]">{timeAgo(log.created_at)}</span>
                        </Td>
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
