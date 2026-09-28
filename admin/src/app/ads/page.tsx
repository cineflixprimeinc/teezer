"use client";

import { Megaphone, Target, DollarSign, BarChart3, CheckCircle2, Clock } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const AD_PLACEMENTS = [
  "For You Feed (Native Ad)",
  "Explore Page Banner",
  "Video Detail Page",
  "Profile Page Sidebar",
  "Search Results",
  "Stories Interstitial",
  "Live Stream Overlay",
  "Suggested Creators",
];

export default function AdsPage() {
  return (
    <AdminShell title="Ads Manager">
      <div className="space-y-5">
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Ads Manager</h2>
          <p className="text-[13px] text-[#6b7280]">Manage advertising campaigns, placements, and revenue from ads.</p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: "Active Campaigns", value: "-", icon: Megaphone,   color: "#fe2c55" },
            { label: "Pending Review",   value: "-", icon: Clock,       color: "#f59e0b" },
            { label: "Ad Revenue",       value: "-", icon: DollarSign,  color: "#10b981" },
            { label: "Impressions",      value: "-", icon: BarChart3,   color: "#3b82f6" },
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

        {/* Ad placements */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Target className="h-4 w-4 text-[#fe2c55]" />Ad Placements</CardTitle>
          </CardHeader>
          <CardBody>
            <div className="grid gap-2 sm:grid-cols-2">
              {AD_PLACEMENTS.map((p) => (
                <div key={p} className="flex items-center gap-2.5 rounded-xl border border-[#e8eaed] px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                  <span className="text-[13px] text-[#374151]">{p}</span>
                  <Badge variant="default" className="ml-auto">Ready</Badge>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[13px] text-amber-700">
                <strong>Note:</strong> Activate the ads system from{" "}
                <a href="/features" className="underline font-semibold">Feature Management</a> to enable campaigns.
              </p>
            </div>
          </CardBody>
        </Card>
      </div>
    </AdminShell>
  );
}
