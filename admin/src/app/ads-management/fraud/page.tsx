"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card } from "@/components/ui/card";
import { Table, Thead, Th, Tbody, Tr, Td, Pagination, TableEmpty, TableLoading } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/input";
import { adsService, adMoney } from "@/services/ads.service";

const KINDS = ["all", "invalid_click", "impression_flood", "bot", "dup_device", "datacenter_ip", "rapid_repeat"];

function actionVariant(a: string) {
  return a === "blocked" || a === "refunded" ? "danger" : a === "flagged" ? "warning" : "default";
}

export default function AdsFraudPage() {
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("all");

  const { data, isLoading } = useQuery({
    queryKey: ["ads-fraud", page, kind],
    queryFn: () => adsService.fraud({ page, kind: kind === "all" ? undefined : kind }),
  });

  return (
    <AdminShell title="Ads Management">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Fraud & Invalid Traffic</h2>
          <p className="text-[13px] text-[#6b7280]">Flagged impressions/clicks. Invalid traffic is excluded from billing and auto-refunded.</p>
        </div>

        <Card>
          <div className="flex items-center gap-2 border-b border-[#e8eaed] p-4">
            <Select value={kind} onChange={(e) => { setKind(e.target.value); setPage(1); }}>
              {KINDS.map((k) => <option key={k} value={k}>{k === "all" ? "All types" : k.replace(/_/g, " ")}</option>)}
            </Select>
          </div>
          <Table>
            <Thead>
              <Th>Type</Th><Th>Campaign</Th><Th>IP hash</Th><Th>Risk</Th><Th>Action</Th><Th>Refunded</Th><Th>When</Th>
            </Thead>
            <Tbody>
              {isLoading ? (
                <TableLoading cols={7} />
              ) : (data?.data.length ?? 0) === 0 ? (
                <TableEmpty message="No fraud events. Clean traffic." />
              ) : (
                data!.data.map((f) => (
                  <Tr key={f.id}>
                    <Td><Badge variant="outline">{f.kind.replace(/_/g, " ")}</Badge></Td>
                    <Td>{f.campaign_id ? `#${f.campaign_id}` : "-"}</Td>
                    <Td className="font-mono text-[11px] text-[#6b7280]">{f.ip_hash ?? "-"}</Td>
                    <Td>{f.score}</Td>
                    <Td><Badge variant={actionVariant(f.action)}>{f.action}</Badge></Td>
                    <Td>{f.amount_refunded_cents ? adMoney(f.amount_refunded_cents) : "-"}</Td>
                    <Td className="text-[12px] text-[#6b7280]">{new Date(f.created_at).toLocaleString()}</Td>
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
