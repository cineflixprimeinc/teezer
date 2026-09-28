"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Star } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination, TableEmpty, TableLoading } from "@/components/ui/data-table";
import { api } from "@/services/api";

/**
 * Reelsoo Shop → Shops.
 *
 * Read-only visibility over every storefront on the platform - sellers own
 * their own products/collections/reviews, this is a moderation view, not a
 * management one.
 */

type ShopRow = {
  id: number;
  shop_name: string;
  owner_username: string | null;
  is_live: boolean;
  rating_avg: number;
  rating_count: number;
  sold_count: number;
  products_count: number;
  collections_count: number;
  created_at: string | null;
};

export default function ShopsPage() {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-shops", q, page],
    queryFn: () =>
      api.get("/admin/shop/shops", { params: { q, page } }).then((r) => r.data as { data: ShopRow[]; meta: any }),
  });

  return (
    <AdminShell title="Teezer Shop — Shops">
      <Card>
        <CardHeader>
          <CardTitle>All Shops</CardTitle>
          <div className="relative w-64">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
            <input
              className="w-full rounded-[10px] border border-[#e5e7eb] bg-white py-2 pl-9 pr-3 text-[13px] outline-none focus:border-[#fd4605] focus:ring-2 focus:ring-[#fd4605]/10"
              placeholder="Search shop or owner…"
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1); }}
            />
          </div>
        </CardHeader>
        <Table>
          <Thead>
            <Th>Shop</Th>
            <Th>Owner</Th>
            <Th>Products</Th>
            <Th>Collections</Th>
            <Th>Rating</Th>
            <Th>Sold</Th>
            <Th>Status</Th>
          </Thead>
          <Tbody>
            {isLoading && <TableLoading cols={7} />}
            {!isLoading && !data?.data.length && <TableEmpty message="No shops yet." />}
            {data?.data.map((s) => (
              <Tr key={s.id}>
                <Td className="font-medium text-[#111827]">{s.shop_name}</Td>
                <Td className="text-[#6b7280]">@{s.owner_username}</Td>
                <Td>{s.products_count}</Td>
                <Td>{s.collections_count}</Td>
                <Td>
                  <span className="inline-flex items-center gap-1">
                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    {s.rating_avg.toFixed(1)} ({s.rating_count})
                  </span>
                </Td>
                <Td>{s.sold_count.toLocaleString()}</Td>
                <Td>
                  <Badge variant={s.is_live ? "danger" : "default"}>{s.is_live ? "Live" : "Offline"}</Badge>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </Table>
        {data && (
          <Pagination
            currentPage={data.meta.current_page}
            lastPage={data.meta.last_page}
            total={data.meta.total}
            onPage={setPage}
          />
        )}
      </Card>
    </AdminShell>
  );
}
