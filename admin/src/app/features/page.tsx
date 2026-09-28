"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Zap } from "lucide-react";
import { AdminShell } from "@/components/layout/admin-shell";
import { Card, CardHeader, CardTitle, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { adminService } from "@/services/admin.service";

const FEATURE_META: Record<string, { label: string; desc: string; group: string }> = {
  feature_live:           { label: "Live Streaming",       desc: "Allow users to go live",                   group: "Core" },
  feature_stories:        { label: "Stories",              desc: "Enable story creation and viewing",        group: "Core" },
  feature_messages:       { label: "Direct Messages",      desc: "Enable 1-to-1 and group messaging",       group: "Core" },
  feature_studio:         { label: "Creator Studio",       desc: "Access to studio dashboard",              group: "Creator" },
  feature_monetization:   { label: "Monetization",         desc: "Creator earnings and revenue share",      group: "Creator" },
  feature_verification:   { label: "Verification",         desc: "Creator verification badge system",       group: "Creator" },
  feature_creator_levels: { label: "Creator Levels",       desc: "XP-based level progression system",      group: "Creator" },
  feature_ads:            { label: "Ads Manager",          desc: "Platform advertising system",             group: "Monetization" },
  feature_wallet:         { label: "Wallet / Coins",       desc: "Virtual currency and gifting",           group: "Monetization" },
  feature_comments:       { label: "Comments",             desc: "Video comments and replies",              group: "Content" },
  feature_downloads:      { label: "Video Downloads",      desc: "Allow users to download videos",         group: "Content" },
  feature_duet:           { label: "Duet",                 desc: "Side-by-side video collaboration",       group: "Content" },
  feature_stitch:         { label: "Stitch",               desc: "Clip and respond to other videos",       group: "Content" },
  feature_audio_rooms:    { label: "Audio Rooms",          desc: "Live audio room spaces",                  group: "Core" },
  feature_search:         { label: "Search",               desc: "Platform-wide search functionality",     group: "Discovery" },
  feature_notifications:  { label: "Push Notifications",  desc: "Real-time push notification delivery",   group: "Core" },
  feature_country_lock:   { label: "Country Lock (60-day)", desc: "Enforce 60-day country change lock",  group: "Security" },
};

export default function FeaturesPage() {
  const qc = useQueryClient();

  const { data: features, isLoading } = useQuery({
    queryKey: ["admin-features"],
    queryFn:  adminService.features,
  });

  const toggle = useMutation({
    mutationFn: ({ key, enabled }: { key: string; enabled: boolean }) =>
      adminService.toggleFeature(key, enabled),
    onSuccess: (_, { key, enabled }) => {
      toast.success(`${FEATURE_META[key]?.label ?? key}: ${enabled ? "Enabled" : "Disabled"}`);
      qc.invalidateQueries({ queryKey: ["admin-features"] });
    },
    onError: () => toast.error("Failed to update feature"),
  });

  const groups = [
    "Core", "Creator", "Monetization", "Content", "Discovery", "Security",
  ];

  if (isLoading) {
    return (
      <AdminShell title="Feature Management">
        <div className="p-8 text-center text-[#9ca3af]">Loading features…</div>
      </AdminShell>
    );
  }

  const featureMap = (features ?? {}) as Record<string, boolean>;
  const enabledCount = Object.values(featureMap).filter(Boolean).length;

  return (
    <AdminShell title="Feature Management">
      <div className="space-y-5">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-[18px] font-bold text-[#111827]">Feature Management</h2>
            <p className="text-[13px] text-[#6b7280]">
              {enabledCount} of {Object.keys(featureMap).length} features enabled. Changes apply instantly to web and app.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Badge variant="success">{enabledCount} On</Badge>
            <Badge variant="default">{Object.keys(featureMap).length - enabledCount} Off</Badge>
          </div>
        </div>

        {groups.map((group) => {
          const items = Object.entries(FEATURE_META).filter(([, m]) => m.group === group);
          if (items.length === 0) return null;

          return (
            <Card key={group}>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-[#fd4605]" /> {group}
                </CardTitle>
              </CardHeader>
              <CardBody className="p-0">
                {items.map(([key, meta]) => {
                  const enabled = featureMap[key] ?? false;
                  return (
                    <div key={key}
                      className="flex items-center justify-between border-b border-[#f3f4f6] last:border-0 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-[#111827]">{meta.label}</p>
                        <p className="text-[12px] text-[#9ca3af]">{meta.desc}</p>
                      </div>
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        <span className={`text-[12px] font-semibold ${enabled ? "text-emerald-600" : "text-[#9ca3af]"}`}>
                          {enabled ? "On" : "Off"}
                        </span>
                        <button
                          disabled={toggle.isPending}
                          onClick={() => toggle.mutate({ key, enabled: !enabled })}
                          className={`relative h-6 w-11 rounded-full transition-colors disabled:opacity-60
                            ${enabled ? "bg-[#fd4605]" : "bg-[#d1d5db]"}`}
                        >
                          <span className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-transform
                            ${enabled ? "translate-x-6" : "translate-x-1"}`} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </CardBody>
            </Card>
          );
        })}
      </div>
    </AdminShell>
  );
}
