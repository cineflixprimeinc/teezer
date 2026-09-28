"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination, TableEmpty, TableLoading } from "@/components/ui/data-table";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/badge";
import { adsService, adMoney } from "@/services/ads.service";

export default function AdsAdvertisersPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["ads-advertisers", page, search],
    queryFn: () => adsService.advertisers({ page, search: search || undefined }),
  });

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Advertisers</h2>
          <p className="text-[13px] text-[#6b7280]">Ad accounts, balances and campaign counts.</p>
        </div>

        <Card>
          <div className="flex items-center gap-2 border-b border-[#e8eaed] p-4">
            <Input placeholder="Search by username or name…" className="max-w-[280px]" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Table>
            <Thead>
              <Th>Advertiser</Th><Th>Type</Th><Th>Status</Th><Th>Balance</Th><Th>Campaigns</Th><Th>Joined</Th>
            </Thead>
            <Tbody>
              {isLoading ? (
                <TableLoading cols={6} />
              ) : (data?.data.length ?? 0) === 0 ? (
                <TableEmpty message="No advertisers yet." />
              ) : (
                data!.data.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <div className="font-semibold text-[#111827]">{a.user?.name ?? a.name}</div>
                      <div className="text-[11px] text-[#9ca3af]">@{a.user?.username ?? "-"}</div>
                    </Td>
                    <Td className="text-[12px] capitalize">{a.type.replace(/_/g, " ")}</Td>
                    <Td><StatusBadge status={a.status} /></Td>
                    <Td className="font-semibold">{adMoney(a.balance_cents)}</Td>
                    <Td>{a.campaigns_count ?? 0}</Td>
                    <Td className="text-[12px] text-[#6b7280]">{new Date(a.created_at).toLocaleDateString()}</Td>
                  </Tr>
                ))
              )}
            </Tbody>
          </Table>
          {data && <Pagination currentPage={data.meta.current_page} lastPage={data.meta.last_page} total={data.meta.total} onPage={setPage} />}
        </Card>
      </div>
    </AdminShell>
  );
}
