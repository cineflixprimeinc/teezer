"use client";

import { Radio, Users, Eye, AlertCircle } from "lucide-react";
import { AdminShell } from "@/admin-panel/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/admin-panel/components/ui/card";

export default function LivePage() {
  return (
    <AdminShell title="Live Streams">
      <div className="space-y-5">

        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Live Stream Management</h2>
          <p className="text-[13px] text-[#6b7280]">Monitor and manage active live streams on the platform.</p>
        </div>

        {/* Status cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          {[
            { label: "Live Now",     value: "-", icon: Radio, color: "#ef4444" },
            { label: "Peak Viewers", value: "-", icon: Eye,   color: "#3b82f6" },
            { label: "Total Hosts",  value: "-", icon: Users, color: "#10b981" },
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
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-amber-500" /> Live Management
            </CardTitle>
          </CardHeader>
          <CardBody>
            <p className="text-[13px] text-[#6b7280]">
              Live stream management requires a real-time connection to the streaming server.
              Active live sessions are managed through the WebRTC signaling server (chat-server).
            </p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                "View all active live streams",
                "End any live session remotely",
                "View live chat and reports",
                "Manage live gifts and revenue",
                "Ban hosts from going live",
                "Control live eligibility rules",
              ].map((item) => (
                <div key={item} className="flex items-center gap-2 rounded-xl bg-[#f9fafb] px-4 py-3">
                  <Radio className="h-4 w-4 text-[#fd4605] shrink-0" />
                  <span className="text-[13px] text-[#374151]">{item}</span>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[13px] text-amber-700">
                <strong>Note:</strong> Full live stream admin controls will be available once the live streaming backend is deployed and connected to the WebRTC signaling server.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
