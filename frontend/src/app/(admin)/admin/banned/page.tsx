"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, UserCheck } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card } from "@/admin-panel/components/ui/card";
import { Badge } from "@/admin-panel/components/ui/badge";
import { Button } from "@/admin-panel/components/ui/button";
import { Input } from "@/admin-panel/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/admin-panel/components/ui/data-table";
import { adminService } from "@/admin-panel/services/admin.service";
import { formatCompact, timeAgo } from "@/admin-panel/lib/utils";

export default function BannedPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");

  const params = { page, per_page: 25, banned: 1, ...(q && { q }) };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-banned-users", params],
    queryFn: () => adminService.users(params),
  });

  const users = data?.data ?? [];
  const meta  = data?.meta ?? {};

  const unban = useMutation({
    mutationFn: (id: number) => adminService.unbanUser(id),
    onSuccess: () => { toast.success("User unbanned"); qc.invalidateQueries({ queryKey: ["admin-banned-users"] }); },
  });

  return (
    <AdminShell title="Banned Users">
      <div className="space-y-5">

        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">Banned Users</h2>
            <p className="text-[13px] text-[#6b7280]">{formatCompact(meta.total)} banned accounts</p>
          </div>
        </div>

        <Card className="p-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
            <Input placeholder="Search name, username, email..." value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
          </div>
        </Card>

        <Card>
          <Table>
            <Thead>
              <Th>User</Th>
              <Th>Ban Reason</Th>
              <Th>Role</Th>
              <Th>Country</Th>
              <Th>Banned</Th>
              <Th className="w-24">Actions</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={6} />
                : users.length === 0
                  ? <TableEmpty message="No banned users." />
                  : users.map((u: {
                      id: number; name: string; username: string; email: string;
                      role: string; ban_reason: string | null; created_at: string;
                      selected_country_code?: string;
                    }) => (
                      <Tr key={u.id} onClick={() => router.push(`/admin/users/${u.id}`)}>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-50 text-[12px] font-bold text-red-400">
                              {(u.name?.[0] ?? "U").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <p className="text-[13px] font-semibold text-[#111827] truncate max-w-[140px]">{u.name}</p>
                              <p className="text-[11px] text-[#9ca3af]">@{u.username}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <p className="text-[12px] text-[#6b7280] max-w-[200px] truncate">{u.ban_reason || "No reason given"}</p>
                        </Td>
                        <Td><Badge variant="default" className="capitalize">{u.role}</Badge></Td>
                        <Td><span className="text-[12px] text-[#6b7280]">{u.selected_country_code ?? "-"}</span></Td>
                        <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(u.created_at)}</span></Td>
                        <Td>
                          <Button variant="success" size="sm" disabled={unban.isPending}
                            onClick={(e) => { e.stopPropagation(); unban.mutate(u.id); }}>
                            <UserCheck className="h-3 w-3" /> Unban
                          </Button>
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
