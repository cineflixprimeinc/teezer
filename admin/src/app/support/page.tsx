"use client";

import { HelpCircle, MessageCircle, Bug, Star } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";

export default function SupportPage() {
  return (
    <AdminShell title="Support Center">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Support Center</h2>
          <p className="text-[13px] text-[#6b7280]">Manage user support tickets, bug reports, and community feedback.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Open Tickets",    value: "-", icon: HelpCircle,    color: "#3b82f6" },
            { label: "Bug Reports",     value: "-", icon: Bug,           color: "#ef4444" },
            { label: "Feedback",        value: "-", icon: Star,          color: "#f59e0b" },
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
          <CardHeader><CardTitle>Support Tickets</CardTitle></CardHeader>
          <CardBody>
            <div className="rounded-xl border border-[#e8eaed] bg-[#f9fafb] p-6 text-center">
              <MessageCircle className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#374151]">Support Ticket System</p>
              <p className="text-[13px] text-[#9ca3af] mt-1">
                Ticket management, auto-assignment, SLA tracking, and user communication will be available here.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
