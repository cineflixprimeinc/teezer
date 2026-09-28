"use client";

import { useState } from "react";
import {
  Settings, MessageSquare, Users, ShieldCheck, Gift,
  Video, Save, Ban, Sliders, AlertCircle, Flag,
} from "lucide-react";
import {
  PageHeader, SettingsCard, CardHeader, SettingsRow,
  Toggle, NiceSelect, Btn, ChevronRow, StatusBadge, ActionBar,
} from "@/features/settings/settings-ui";

export default function LiveSettingsPage() {
  const [liveGifts,    setLiveGifts]    = useState(true);
  const [liveReplay,   setLiveReplay]   = useState(true);
  const [autoSaveReplay, setAutoSaveReplay] = useState(false);
  const [whoComment,   setWhoComment]   = useState("Everyone");
  const [whoJoin,      setWhoJoin]      = useState("Everyone");

  const opts = ["Everyone", "Friends", "Followers", "No one"];

  return (
    <div className="p-6">
      <PageHeader title="Live Settings" subtitle="Manage your live streaming experience" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Card 1 */}
        <SettingsCard>
          <CardHeader n={1} title="Live Control" />
          <ChevronRow icon={Settings}      iconBg="bg-[#fff0f4]" iconColor="text-[#fe2c55]"
            title="Start Live Settings"    desc="Configure title, thumbnail and schedule before going live" />
          <SettingsRow icon={MessageSquare} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="Who Can Comment in Live" desc="Control who can send comments during your live"
            right={<NiceSelect value={whoComment} onChange={setWhoComment} options={opts} />} />
          <SettingsRow icon={Users}        iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Who Can Join Live"      desc="Restrict who can join you for a live co-stream"
            right={<NiceSelect value={whoJoin} onChange={setWhoJoin} options={opts} />} />
          <ChevronRow icon={ShieldCheck}   iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
            title="Live Moderation"        desc="Assign moderators for your live sessions" last />
        </SettingsCard>

        {/* Card 2 */}
        <SettingsCard>
          <CardHeader n={2} title="Live Safety" />
          <SettingsRow icon={Gift}  iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
            title="Live Gifts"      desc="Allow viewers to send virtual gifts during your live"
            right={<Toggle on={liveGifts} onChange={setLiveGifts} />} />
          <ChevronRow icon={Ban}    iconBg="bg-[#fff0f4]" iconColor="text-[#dc2626]"
            title="Blocked Words in Live" desc="Filter specific words in your live chat" />
          <ChevronRow icon={Sliders} iconBg="bg-[#fffbeb]" iconColor="text-[#f59e0b]"
            title="Live Audience Settings" desc="Manage age restrictions and audience filters" />
          <SettingsRow icon={AlertCircle} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Live Restriction Status" desc="Your current live broadcasting permissions"
            right={<StatusBadge label="Active" color="green" />} />
          <ChevronRow icon={Flag}   iconBg="bg-[#f8fafc]" iconColor="text-[#64748b]"
            title="Live Report History" desc="View reports submitted during your past lives" last />
        </SettingsCard>

        {/* Card 3 */}
        <SettingsCard className="lg:col-span-2">
          <CardHeader n={3} title="Live Replay" />
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
            <SettingsRow icon={Video} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Live Replay" desc="Allow viewers to watch your live after it ends"
              right={<Toggle on={liveReplay} onChange={setLiveReplay} />} />
            <SettingsRow icon={Save}  iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="Auto-save Live Replay" desc="Automatically save live replays to your profile"
              right={<Toggle on={autoSaveReplay} onChange={setAutoSaveReplay} />} />
            <SettingsRow icon={ShieldCheck} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
              title="Replay Privacy" desc="Control who can watch your saved live replays"
              right={<Btn label="Manage" />} last />
          </div>
        </SettingsCard>
      </div>

      <ActionBar />
    </div>
  );
}
