"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Hash, TrendingUp } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/input";
import {
  Table, Thead, Th, Tbody, Tr, Td,
  TableEmpty, TableLoading, Pagination,
} from "@/components/ui/data-table";
import { adminService } from "@/services/admin.service";
import { formatCompact } from "@/lib/utils";

type Hashtag = {
  id: number; name: string; videos_count: number; created_at: string;
};

export default function HashtagsPage() {
  const [page, setPage] = useState(1);
  const [q,    setQ]    = useState("");
  const [sort, setSort] = useState("videos");

  const params = { page, per_page: 30, sort, ...(q && { q }) };
  const { data, isLoading } = useQuery({
    queryKey: ["admin-hashtags", params],
    queryFn:  () => adminService.hashtags(params),
  });

  const hashtags: Hashtag[] = data?.data ?? [];
  const meta = data?.meta ?? {};

  return (
    <AdminShell title="Hashtags">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">Hashtags</h2>
            <p className="text-[13px] text-[#6b7280]">{formatCompact(meta.total)} total hashtags</p>
          </div>
        </div>

        {/* Top hashtags quick view */}
        {!isLoading && hashtags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hashtags.slice(0, 10).map((h) => (
              <div key={h.id}
                className="flex items-center gap-1.5 rounded-full border border-[#e8eaed] bg-white px-3 py-1.5">
                <Hash className="h-3 w-3 text-[#fd4605]" />
                <span className="text-[12px] font-semibold text-[#111827]">{h.name}</span>
                <span className="text-[11px] text-[#9ca3af]">{formatCompact(h.videos_count)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Filters */}
        <Card className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#9ca3af] pointer-events-none" />
              <Input placeholder="Search hashtag name..." value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1); }} className="pl-9" />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="videos">Most videos</option>
              <option value="name">Alphabetical</option>
            </Select>
          </div>
        </Card>

        {/* Table */}
        <Card>
          <Table>
            <Thead>
              <Th>#</Th>
              <Th>Hashtag</Th>
              <Th>Videos</Th>
              <Th>Trend</Th>
            </Thead>
            <Tbody>
              {isLoading
                ? <TableLoading cols={4} />
                : hashtags.length === 0
                  ? <TableEmpty message="No hashtags found." />
                  : hashtags.map((h, i) => (
                      <Tr key={h.id}>
                        <Td><span className="text-[13px] font-bold text-[#9ca3af]">{(page - 1) * 30 + i + 1}</span></Td>
                        <Td>
                          <div className="flex items-center gap-2">
                            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#fd4605]/10">
                              <Hash className="h-3.5 w-3.5 text-[#fd4605]" />
                            </div>
                            <span className="text-[14px] font-semibold text-[#111827]">#{h.name}</span>
                          </div>
                        </Td>
                        <Td>
                          <span className="text-[14px] font-bold text-[#111827]">{formatCompact(h.videos_count)}</span>
                        </Td>
                        <Td>
                          {i < 5 && (
                            <div className="flex items-center gap-1 text-emerald-600">
                              <TrendingUp className="h-3.5 w-3.5" />
                              <span className="text-[12px] font-semibold">Trending</span>
                            </div>
                          )}
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
