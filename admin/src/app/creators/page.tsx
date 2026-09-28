"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { Search, Star } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/components/ui/data-table";
import { adminService } from "@/services/admin.service";
import { formatCompact, timeAgo } from "@/lib/utils";

type Creator = {
  id: number; name: string; username: string; email: string;
  is_verified: boolean; is_banned: boolean; is_active: boolean;
  avatar: string | null; created_at: string;
  followers_count?: number; videos_count?: number;
  selected_country_code?: string;
};

export default function CreatorsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [q,    setQ]    = useState("");
  const [sort, setSort] = useState("followers");

  const params = { page, per_page: 25, role: "creator", sort, ...(q && { q }) };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-creators", params],
    queryFn: () => adminService.users(params),
  });

  const creators: Creator[] = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <AdminShell title="Creators">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">Creators</h2>
            <p className="text-[13px] text-[#6b7280]">{formatCompact(meta.total)} registered creators</p>
          </div>
        </div>

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
              <Input placeholder="Search name, username, email..." value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="followers">Most followers</option>
              <option value="videos">Most videos</option>
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </Select>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <Thead>
              <Th>Creator</Th>
              <Th>Status</Th>
              <Th>Videos</Th>
              <Th>Followers</Th>
              <Th>Country</Th>
              <Th>Joined</Th>
              <Th className="w-16">View</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={7} />
                : creators.length === 0
                  ? <TableEmpty message="No creators found." />
                  : creators.map((c) => (
                      <Tr key={c.id} onClick={() => router.push(`/users/${c.id}`)}>
                        <Td>
                          <div className="flex items-center gap-2.5">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fd4605]/10 text-[12px] font-bold text-[#fd4605]">
                              {(c.name?.[0] ?? "C").toUpperCase()}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-[13px] font-semibold text-[#111827] truncate max-w-[140px]">{c.name}</p>
                                {c.is_verified && <Star className="h-3 w-3 text-[#3b82f6] shrink-0" />}
                              </div>
                              <p className="text-[11px] text-[#9ca3af]">@{c.username}</p>
                            </div>
                          </div>
                        </Td>
                        <Td>
                          <div className="flex flex-wrap gap-1">
                            {c.is_verified && <Badge variant="info">Verified</Badge>}
                            {c.is_banned   && <Badge variant="danger">Banned</Badge>}
                            {!c.is_banned  && c.is_active && !c.is_verified && <Badge variant="success">Active</Badge>}
                          </div>
                        </Td>
                        <Td><span className="text-[13px]">{formatCompact(c.videos_count ?? 0)}</span></Td>
                        <Td><span className="text-[13px]">{formatCompact(c.followers_count ?? 0)}</span></Td>
                        <Td><span className="text-[12px] text-[#6b7280]">{c.selected_country_code ?? "-"}</span></Td>
                        <Td><span className="text-[12px] text-[#9ca3af]">{timeAgo(c.created_at)}</span></Td>
                        <Td>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); router.push(`/users/${c.id}`); }}>
                            View
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
