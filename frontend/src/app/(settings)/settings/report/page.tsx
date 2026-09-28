"use client";

import { useState } from "react";
import {
  Bug, User, CreditCard, Video, ImagePlus, Send,
  AlertCircle, CheckCircle2,
} from "lucide-react";
import {
  PageHeader, SettingsCard, CardHeader, ActionBar, Btn,
} from "@/features/settings/settings-ui";

const ISSUE_TYPES = [
  { id: "bug",     icon: Bug,        bg: "bg-[#fff0f4]", color: "text-[#fe2c55]", label: "Bug / App Crash",    desc: "Something broke or isn't working" },
  { id: "account", icon: User,       bg: "bg-[#eff6ff]", color: "text-[#3b82f6]", label: "Account Issue",      desc: "Login, access or profile problem" },
  { id: "payment", icon: CreditCard, bg: "bg-[#f0fdf4]", color: "text-[#16a34a]", label: "Payment Issue",      desc: "Billing, coins, wallet problem" },
  { id: "video",   icon: Video,      bg: "bg-[#f5f3ff]", color: "text-[#7c3aed]", label: "Video / Content",    desc: "Problem with a video or content" },
];

export default function ReportPage() {
  const [selected, setSelected] = useState<string | null>(null);
  const [description, setDescription] = useState("");
  const [submitted, setSubmitted] = useState(false);

  return (
    <div className="p-6">
      <PageHeader title="Report a Problem" subtitle="Tell us what went wrong and we'll look into it" />

      {submitted ? (
        <div className="flex flex-col items-center justify-center gap-4 py-16">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-[#dcfce7]">
            <CheckCircle2 className="h-8 w-8 text-[#16a34a]" />
          </span>
          <p className="text-[16px] font-bold text-[#111827]">Report Submitted</p>
          <p className="text-[13px] text-[#9ca3af] text-center max-w-xs">Thank you for letting us know. Our team will review your report within 24-48 hours.</p>
          <Btn label="Submit Another" onClick={() => { setSubmitted(false); setSelected(null); setDescription(""); }} />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

          {/* Card 1: Issue Type */}
          <SettingsCard>
            <CardHeader n={1} title="Select Issue Type" />
            <div className="p-4 space-y-2">
              {ISSUE_TYPES.map(({ id, icon: Icon, bg, color, label, desc }) => (
                <button key={id} onClick={() => setSelected(id)}
                  className={`w-full flex items-center gap-3 rounded-[14px] border-2 p-3 text-left transition ${
                    selected === id ? "border-[#fe2c55] bg-[#fff0f4]" : "border-[#e8eaf0] bg-white hover:border-[#fe2c55]/40"
                  }`}>
                  <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${bg}`}>
                    <Icon className={`h-4 w-4 ${color}`} />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#111827]">{label}</p>
                    <p className="text-[11px] text-[#9ca3af]">{desc}</p>
                  </div>
                  <span className={`h-4 w-4 flex-shrink-0 rounded-full border-2 transition ${
                    selected === id ? "border-[#fe2c55] bg-[#fe2c55]" : "border-[#d1d5db]"
                  }`} />
                </button>
              ))}
            </div>
          </SettingsCard>

          {/* Card 2: Describe + Attachments + Submit */}
          <SettingsCard>
            <CardHeader n={2} title="Describe the Problem" />
            <div className="p-4 space-y-4">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Please describe what happened in detail. Include steps to reproduce if possible…"
                rows={6}
                className="w-full resize-none rounded-[12px] border border-[#e8eaf0] bg-[#fafbfc] px-4 py-3 text-[13px] font-medium text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#fe2c55] transition"
              />
              {!selected && description.length === 0 && (
                <div className="flex items-center gap-2 rounded-[10px] bg-[#fffbeb] border border-[#fde68a] px-3 py-2">
                  <AlertCircle className="h-4 w-4 flex-shrink-0 text-[#f59e0b]" />
                  <p className="text-[12px] font-medium text-[#92400e]">Please select an issue type and describe the problem.</p>
                </div>
              )}
            </div>

            <div className="border-t border-[#f0f1f5] px-5 py-3">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">Attachments (Optional)</p>
              <button className="flex w-full items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-[#e8eaf0] bg-[#fafbfc] py-4 text-[13px] font-semibold text-[#6b7280] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
                <ImagePlus className="h-5 w-5" />
                Upload Screenshot
              </button>
            </div>

            <div className="border-t border-[#f0f1f5] p-4">
              <button
                onClick={() => { if (selected && description.trim()) setSubmitted(true); }}
                className="flex w-full items-center justify-center gap-2 rounded-[12px] py-3 text-[13px] font-bold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ background: "#fe2c55" }}
                disabled={!selected || !description.trim()}>
                <Send className="h-4 w-4" />
                Submit Report
              </button>
            </div>
          </SettingsCard>
        </div>
      )}
    </div>
  );
}
