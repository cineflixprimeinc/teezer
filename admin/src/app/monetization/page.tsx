"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CircleDollarSign, CreditCard, TrendingUp, Users,
  DollarSign, Gift, BarChart3,
} from "lucide-react";
import Link from "next/link";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { adminService } from "@/services/admin.service";
import { formatCompact } from "@/lib/utils";

export default function MonetizationPage() {
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminService.stats });

  const u = stats?.users ?? {};

  return (
    <AdminShell title="Monetization">
      <div className="space-y-5">

        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Monetization Overview</h2>
          <p className="text-[13px] text-[#6b7280]">Creator earnings, wallet transactions, payouts, and revenue management.</p>
        </div>

        {/* Quick stats */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Total Revenue",    value: "-",                          icon: CircleDollarSign, color: "#10b981", href: "/revenue" },
            { label: "Pending Payouts",  value: "-",                          icon: CreditCard,       color: "#f59e0b", href: "/payouts" },
            { label: "Active Creators",  value: formatCompact(u.creators),    icon: Users,            color: "#3b82f6", href: "/creators" },
            { label: "Transactions",     value: "-",                          icon: BarChart3,        color: "#8b5cf6", href: "/transactions" },
          ].map(({ label, value, icon: Icon, color, href }) => (
            <Link href={href} key={label}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-widest text-[#9ca3af]">{label}</p>
                    <p className="mt-2 text-[26px] font-bold text-[#111827]">{value ?? "-"}</p>
                  </div>
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl" style={{ background: color + "15" }}>
                    <Icon className="h-5 w-5" style={{ color }} />
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>

        {/* Quick links */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            { href: "/payouts",       icon: CreditCard,       label: "Payout Requests",         desc: "Review and approve creator payout requests" },
            { href: "/transactions",  icon: BarChart3,        label: "Transactions",             desc: "View all wallet transactions and credits" },
            { href: "/gifts",         icon: Gift,             label: "Gift & Coins",             desc: "Manage coin packages, gift pricing" },
            { href: "/revenue",       icon: DollarSign,       label: "Revenue Reports",          desc: "Platform revenue breakdown and analytics" },
            { href: "/creators",      icon: Users,            label: "Creator Monetization",     desc: "View creator earnings and levels" },
            { href: "/verification",  icon: TrendingUp,       label: "Monetization Eligibility", desc: "Manage verification and eligibility rules" },
          ].map(({ href, icon: Icon, label, desc }) => (
            <Link key={href} href={href}>
              <Card className="p-5 hover:shadow-md transition-shadow cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fe2c55]/10 group-hover:bg-[#fe2c55]/20 transition-colors">
                    <Icon className="h-5 w-5 text-[#fe2c55]" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                    <p className="text-[12px] text-[#9ca3af] mt-0.5">{desc}</p>
                  </div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
