"use client";

import { useRouter } from "next/navigation";
import {
  Info, Sparkles, Star, Share2, FileText,
  LogOut, UserCircle2, Code2,
} from "lucide-react";
import {
  PageHeader, SettingsCard, CardHeader, SettingsRow,
  Btn, ChevronRow, ActionBar,
} from "@/features/settings/settings-ui";

const APP_VERSION = "1.0.0";
const BUILD       = "2026.05.28";

export default function AboutPage() {
  const router = useRouter();

  return (
    <div className="p-6">
      <PageHeader title="About Teezer" subtitle="Version and app information" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Card 1: App Information */}
        <SettingsCard>
          <CardHeader n={1} title="App Information" />

          {/* Version hero */}
          <div className="flex flex-col items-center gap-2 py-6 border-b border-[#f0f1f5]">
            <div className="flex h-16 w-16 items-center justify-center rounded-[20px] bg-[#fff0f4]">
              <span className="text-[28px] font-black" style={{ color: "#fe2c55" }}>R</span>
            </div>
            <p className="text-[18px] font-extrabold text-[#111827]">Teezer</p>
            <p className="text-[12px] font-semibold text-[#9ca3af]">Version {APP_VERSION} · Build {BUILD}</p>
          </div>

          <SettingsRow icon={Info}     iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="App Version"  desc={`v${APP_VERSION} (Build ${BUILD})`} />
          <ChevronRow  icon={Sparkles} iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
            title="What's New"   desc="See the latest features and improvements" />
          <ChevronRow  icon={Code2}    iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
            title="Open Source Licenses" desc="Third-party libraries used in Teezer" last />
        </SettingsCard>

        {/* Card 2: App Actions */}
        <SettingsCard>
          <CardHeader n={2} title="App Actions" />
          <SettingsRow icon={Star}   iconBg="bg-[#fefce8]"  iconColor="text-[#ca8a04]"
            title="Rate Teezer" desc="Enjoying the app? Leave us a review"
            right={<Btn label="Rate" />} />
          <SettingsRow icon={Share2} iconBg="bg-[#f0fdf4]"  iconColor="text-[#16a34a]"
            title="Share Teezer" desc="Invite friends to join Teezer"
            right={<Btn label="Share" />} />
          <ChevronRow icon={FileText} iconBg="bg-[#eff6ff]"  iconColor="text-[#3b82f6]"
            title="Terms of Service" desc="Read the Teezer terms of service" last />
        </SettingsCard>

        {/* Card 3: Account Actions */}
        <SettingsCard className="lg:col-span-2">
          <CardHeader n={3} title="Account" />
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-2">
            <ChevronRow icon={UserCircle2} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Switch Account"  desc="Log in to a different Teezer account" />
            <SettingsRow icon={LogOut}    iconBg="bg-[#fff0f4]"  iconColor="text-[#dc2626]"
              title="Log Out"         desc="Sign out of your current Teezer account"
              right={<Btn label="Log Out" variant="danger" onClick={() => router.push("/auth/login")} />} last />
          </div>
        </SettingsCard>
      </div>

      <ActionBar saveLabel="Done" />
    </div>
  );
}
