"use client";

import {
  Plus, PauseCircle, TrendingUp, Bell, RotateCcw, Wallet, CalendarClock, Workflow,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Card, CardHead, EmptyState, PrimaryButton, GhostButton, PageHeader } from "@/features/ads-studio/ui";

type Template = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
};

const TEMPLATES: Template[] = [
  {
    icon: PauseCircle, iconBg: "bg-[#fff0f4]", iconColor: "text-[#fe2c55]",
    title: "Pause low-performing ads",
    desc: "Pause ads whose cost per result exceeds a threshold.",
  },
  {
    icon: TrendingUp, iconBg: "bg-[#dcfce7]", iconColor: "text-[#16a34a]",
    title: "Scale winning ads",
    desc: "Raise budget when CTR stays above target.",
  },
  {
    icon: Bell, iconBg: "bg-[#fef3c7]", iconColor: "text-[#d97706]",
    title: "High spend alert",
    desc: "Notify when daily spend crosses a limit.",
  },
  {
    icon: RotateCcw, iconBg: "bg-[#dbeafe]", iconColor: "text-[#2563eb]",
    title: "Auto-restart on new day",
    desc: "Resume paused ads at the start of each day.",
  },
  {
    icon: Wallet, iconBg: "bg-[#ede9fe]", iconColor: "text-[#7c3aed]",
    title: "Low balance guard",
    desc: "Pause delivery before balance hits zero.",
  },
  {
    icon: CalendarClock, iconBg: "bg-[#cffafe]", iconColor: "text-[#0891b2]",
    title: "Schedule delivery",
    desc: "Only run ads during chosen hours.",
  },
];

export function AutomationsPage() {
  const createRule = () => toast.info("Custom rules are coming soon.");

  return (
    <div className="space-y-6">
      <PageHeader title="Automations" subtitle="Set rules that manage your campaigns automatically.">
        <PrimaryButton onClick={createRule}>
          <Plus className="h-4 w-4" />
          Create rule
        </PrimaryButton>
      </PageHeader>

      {/* Templates */}
      <Card>
        <CardHead title="Rule templates" subtitle="Start from a ready-made rule and adjust it to your goals." />
        <div className="grid grid-cols-1 gap-4 p-5 pt-4 sm:grid-cols-2 lg:grid-cols-3">
          {TEMPLATES.map((t) => (
            <div
              key={t.title}
              className="flex flex-col rounded-xl border border-[#eef0f3] bg-white p-4 transition hover:border-[#e5e7eb] hover:shadow-sm"
            >
              <span className={`grid h-10 w-10 place-items-center rounded-full ${t.iconBg}`}>
                <t.icon className={`h-[20px] w-[20px] ${t.iconColor}`} />
              </span>
              <p className="mt-3 text-[14px] font-bold text-[#111827]">{t.title}</p>
              <p className="mt-1 flex-1 text-[13px] leading-relaxed text-[#6b7280]">{t.desc}</p>
              <div className="mt-4">
                <GhostButton onClick={() => toast.info("Coming soon.")}>Use template</GhostButton>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Your rules */}
      <Card>
        <CardHead title="Your rules" subtitle="Rules you create will run automatically across your campaigns." />
        <div className="p-5 pt-4">
          <EmptyState
            icon={Workflow}
            title="No active rules"
            desc="Create a rule or use a template to automate campaign management."
            action={
              <PrimaryButton onClick={createRule}>
                <Plus className="h-4 w-4" />
                Create rule
              </PrimaryButton>
            }
          />
        </div>
      </Card>
    </div>
  );
}
