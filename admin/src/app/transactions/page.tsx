"use client";

import { Activity, ArrowUpRight, ArrowDownLeft, Coins } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";

export default function TransactionsPage() {
  return (
    <AdminShell title="Transactions">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Wallet Transactions</h2>
          <p className="text-[13px] text-[#6b7280]">View all wallet credits, debits, and coin transactions.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Credits Today",  value: "-", icon: ArrowDownLeft,  color: "#10b981" },
            { label: "Debits Today",   value: "-", icon: ArrowUpRight,   color: "#ef4444" },
            { label: "Coins Sold",     value: "-", icon: Coins,          color: "#f59e0b" },
          ].map(({ label, value, icon: Icon, color }) => (
            <Card key={label} className="p-5">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
                  <p className="mt-2 text-[26px] font-bold text-[#111827]">{value}</p>
                </div>
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color + "15" }}>
                  <Icon className="h-5 w-5" style={{ color }} />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle>Transaction Log</CardTitle></CardHeader>
          <CardBody>
            <div className="rounded-xl border border-[#e8eaed] bg-[#f9fafb] p-6 text-center">
              <Activity className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#374151]">Transaction History</p>
              <p className="text-[13px] text-[#9ca3af] mt-1">
                Full transaction ledger with search, filters, and export will be available here.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
