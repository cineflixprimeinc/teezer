"use client";

import { MessageSquare, Flag, Trash2, AlertTriangle } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";

export default function CommentsPage() {
  return (
    <AdminShell title="Comments">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Comment Moderation</h2>
          <p className="text-[13px] text-[#6b7280]">Review flagged comments, manage spam, and bulk-delete harmful content.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Total Comments", value: "-", icon: MessageSquare, color: "#3b82f6" },
            { label: "Flagged",        value: "-", icon: Flag,          color: "#f59e0b" },
            { label: "Deleted Today",  value: "-", icon: Trash2,        color: "#ef4444" },
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
          <CardHeader><CardTitle>Flagged Comments</CardTitle></CardHeader>
          <CardBody>
            <div className="rounded-xl border border-[#e8eaed] bg-[#f9fafb] p-6 text-center">
              <AlertTriangle className="h-10 w-10 text-[#d1d5db] mx-auto mb-3" />
              <p className="text-[14px] font-semibold text-[#374151]">Comment Moderation</p>
              <p className="text-[13px] text-[#9ca3af] mt-1">
                Bulk comment review, spam detection, and blocked word filtering will be available here.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
