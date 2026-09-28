"use client";

import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingUp, CircleDollarSign, BarChart3 } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";
import { MiniBarChart } from "@/admin-panel/components/ui/mini-chart";
import { adminService } from "@/admin-panel/services/admin.service";
import { mockSpark } from "@/admin-panel/lib/utils";

export default function RevenuePage() {
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminService.stats });

  return (
    <AdminShell title="Revenue Reports">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Revenue Reports</h2>
          <p className="text-[13px] text-[#6b7280]">Platform revenue breakdown, trends, and monetization analytics.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Revenue",   value: "-", icon: CircleDollarSign, color: "#10b981" },
            { label: "This Month",      value: "-", icon: DollarSign,       color: "#3b82f6" },
            { label: "Ad Revenue",      value: "-", icon: BarChart3,        color: "#8b5cf6" },
            { label: "Gift Revenue",    value: "-", icon: TrendingUp,       color: "#fd4605" },
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

        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Revenue Trend (30 days)</CardTitle></CardHeader>
            <CardBody>
              <MiniBarChart data={mockSpark(10000, 30)} color="#10b981" height={160} />
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                <p className="text-[12px] text-amber-700">Revenue tracking will be enabled once payment processing is configured.</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader><CardTitle>Revenue Breakdown</CardTitle></CardHeader>
            <CardBody className="space-y-3">
              {[
                { label: "Coin Sales",      pct: 45, color: "#fd4605" },
                { label: "Gift Revenue",    pct: 28, color: "#f59e0b" },
                { label: "Subscriptions",   pct: 17, color: "#3b82f6" },
                { label: "Ads Revenue",     pct: 10, color: "#8b5cf6" },
              ].map(({ label, pct, color }) => (
                <div key={label}>
                  <div className="flex justify-between text-[12px] mb-1">
                    <span className="font-medium text-[#374151]">{label}</span>
                    <span className="text-[#9ca3af]">{pct}% (projected)</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-[#f3f4f6]">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
                  </div>
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
