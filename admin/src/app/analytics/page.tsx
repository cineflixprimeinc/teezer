"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Users, Video, Eye, TrendingUp, UserCheck, Shield,
  BarChart3,
} from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody, StatCard } from "@/components/ui/card";
import { MiniLineChart, MiniBarChart } from "@/components/ui/mini-chart";
import { adminService } from "@/services/admin.service";
import { formatCompact } from "@/lib/utils";

export default function AnalyticsPage() {
  const { data: stats } = useQuery({ queryKey: ["admin-stats"], queryFn: adminService.stats });
  const { data: userStats } = useQuery({ queryKey: ["admin-user-stats"], queryFn: adminService.userStats });
  const { data: videoStats } = useQuery({ queryKey: ["admin-video-stats"], queryFn: adminService.videoStats });

  const u = stats?.users ?? {};
  const v = stats?.videos ?? {};
  const views = stats?.views ?? {};
  const reports = stats?.reports ?? {};

  const growth30d = (userStats?.growth_30d ?? []) as Array<{ date: string; count: number }>;
  const uploads30d = (videoStats?.uploads_30d ?? []) as Array<{ date: string; count: number }>;
  const views30d   = (videoStats?.views_30d   ?? []) as Array<{ date: string; count: number }>;

  const growthData  = growth30d.map((d) => d.count);
  const uploadData  = uploads30d.map((d) => d.count);
  const viewData    = views30d.map((d) => d.count);

  const byRole = (userStats?.by_role ?? {}) as Record<string, number>;

  return (
    <AdminShell title="Analytics & Insights">
      <div className="space-y-6">

        {/* Header */}
        <div>
          <h2 className="text-[18px] font-bold text-[#111827]">Analytics Overview</h2>
          <p className="text-[13px] text-[#6b7280]">Platform-wide stats and growth trends.</p>
        </div>

        {/* KPI row */}
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Total Users"    value={formatCompact(u.total)}      icon={Users}     color="#3b82f6" trend={`+${formatCompact(u.new_7d)} this week`} />
          <StatCard label="Total Videos"   value={formatCompact(v.total)}      icon={Video}     color="#fe2c55" sub={`${formatCompact(v.published)} published`} />
          <StatCard label="7-Day Views"    value={formatCompact(views["7d"])}  icon={Eye}       color="#f59e0b" sub={`${formatCompact(views.today)} today`} />
          <StatCard label="Pending Reports"value={formatCompact(reports.pending)} icon={Shield} color="#ef4444" />
        </div>

        {/* Charts row */}
        <div className="grid gap-6 lg:grid-cols-2">

          {/* User growth */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-4 w-4 text-[#3b82f6]" />User Growth (30 days)</CardTitle>
            </CardHeader>
            <CardBody>
              {growthData.length > 1
                ? <MiniLineChart data={growthData} color="#3b82f6" height={160} fill />
                : <div className="h-[160px] flex items-center justify-center text-[13px] text-[#9ca3af]">Not enough data</div>
              }
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#f3f4f6] pt-4">
                {[["New Today", formatCompact(u.new_today)], ["This Week", formatCompact(u.new_7d)], ["Total", formatCompact(u.total)]].map(([k, val]) => (
                  <div key={k}>
                    <p className="text-[11px] text-[#9ca3af]">{k}</p>
                    <p className="text-[18px] font-bold text-[#111827]">{val ?? "-"}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Video uploads */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Video className="h-4 w-4 text-[#fe2c55]" />Video Uploads (30 days)</CardTitle>
            </CardHeader>
            <CardBody>
              {uploadData.length > 1
                ? <MiniBarChart data={uploadData} color="#fe2c55" height={160} />
                : <div className="h-[160px] flex items-center justify-center text-[13px] text-[#9ca3af]">Not enough data</div>
              }
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#f3f4f6] pt-4">
                {[["Today", formatCompact(v.uploaded_today)], ["Published", formatCompact(v.published)], ["Flagged", formatCompact(v.flagged)]].map(([k, val]) => (
                  <div key={k}>
                    <p className="text-[11px] text-[#9ca3af]">{k}</p>
                    <p className="text-[18px] font-bold text-[#111827]">{val ?? "-"}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Video views */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4 text-[#f59e0b]" />Video Views (30 days)</CardTitle>
            </CardHeader>
            <CardBody>
              {viewData.length > 1
                ? <MiniLineChart data={viewData} color="#f59e0b" height={160} fill />
                : <div className="h-[160px] flex items-center justify-center text-[13px] text-[#9ca3af]">Not enough data</div>
              }
              <div className="mt-4 grid grid-cols-2 gap-3 border-t border-[#f3f4f6] pt-4">
                {[["Today", formatCompact(views.today)], ["Last 7 Days", formatCompact(views["7d"])]].map(([k, val]) => (
                  <div key={k}>
                    <p className="text-[11px] text-[#9ca3af]">{k}</p>
                    <p className="text-[18px] font-bold text-[#111827]">{val ?? "-"}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>

          {/* Users by role */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#8b5cf6]" />Users by Role</CardTitle>
            </CardHeader>
            <CardBody>
              <div className="space-y-3">
                {Object.entries(byRole).map(([role, count]) => {
                  const total = Object.values(byRole).reduce((a, b) => a + b, 0) || 1;
                  const pct   = Math.round((count / total) * 100);
                  const colors: Record<string, string> = { user: "#3b82f6", creator: "#fe2c55", admin: "#8b5cf6" };
                  const color = colors[role] ?? "#9ca3af";
                  return (
                    <div key={role}>
                      <div className="flex justify-between text-[12px] mb-1">
                        <span className="capitalize text-[#374151] font-medium">{role}</span>
                        <span className="text-[#9ca3af]">{formatCompact(count)} · {pct}%</span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[#f3f4f6] overflow-hidden">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3 border-t border-[#f3f4f6] pt-4">
                {[["Verified", formatCompact(userStats?.verified)], ["Banned", formatCompact(u.banned)], ["Creators", formatCompact(u.creators)]].map(([k, val]) => (
                  <div key={k}>
                    <p className="text-[11px] text-[#9ca3af]">{k}</p>
                    <p className="text-[18px] font-bold text-[#111827]">{val ?? "-"}</p>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
