"use client";

import {
  FileText, Shield, Cookie, Copyright,
  Database, Users, Download, Trash2,
} from "lucide-react";
import {
  PageHeader, SettingsCard, CardHeader, ChevronRow,
  SettingsRow, Btn, ActionBar,
} from "@/features/settings/settings-ui";

export default function TermsPrivacyPage() {
  return (
    <div className="p-6">
      <PageHeader title="Terms & Privacy" subtitle="Legal documents, privacy controls and data policy" />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Card 1: Legal Documents */}
        <SettingsCard>
          <CardHeader n={1} title="Legal Documents" />
          <ChevronRow icon={FileText}  iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="Terms of Service"   desc="The full Teezer user agreement" />
          <ChevronRow icon={Shield}    iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Privacy Policy"     desc="How we collect, use and protect your data" />
          <ChevronRow icon={Cookie}    iconBg="bg-[#fff7ed]" iconColor="text-[#f97316]"
            title="Cookie Policy"      desc="How Teezer uses cookies and tracking" />
          <ChevronRow icon={Copyright} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
            title="Copyright Policy"   desc="Intellectual property and DMCA procedures" last />
        </SettingsCard>

        {/* Card 2: Privacy Controls */}
        <SettingsCard>
          <CardHeader n={2} title="Privacy Controls" />
          <SettingsRow icon={Database} iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
            title="Manage My Data"     desc="View and control the data Teezer stores"
            right={<Btn label="Manage" />} />
          <SettingsRow icon={Download} iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
            title="Download My Data"   desc="Export a copy of your Teezer data"
            right={<Btn label="Download" />} />
          <SettingsRow icon={Trash2}   iconBg="bg-[#fff3ec]" iconColor="text-[#dc2626]"
            title="Delete My Data"     desc="Permanently delete all data associated with your account"
            right={<Btn label="Delete" variant="danger" />} last />
        </SettingsCard>

        {/* Card 3: Data Policy */}
        <SettingsCard className="lg:col-span-2">
          <CardHeader n={3} title="Data Policy" />
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
            <ChevronRow icon={Database} iconBg="bg-[#f5f3ff]" iconColor="text-[#7c3aed]"
              title="Data Policy"       desc="How we handle and process your personal data" />
            <ChevronRow icon={Users}    iconBg="bg-[#f0fdf4]" iconColor="text-[#16a34a]"
              title="Community Policy"  desc="Guidelines for community interactions and content" />
            <ChevronRow icon={Shield}   iconBg="bg-[#eff6ff]" iconColor="text-[#3b82f6]"
              title="Security Policy"   desc="How Teezer protects your account and data" last />
          </div>
        </SettingsCard>
      </div>

      <ActionBar saveLabel="Accept & Continue" />
    </div>
  );
}
