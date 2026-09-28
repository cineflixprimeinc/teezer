"use client";

import { useState } from "react";
import {
  HelpCircle, MessageSquare, Search, User, BookOpen,
  Shield, Phone, ChevronRight, Mail, FileQuestion, ArrowUpRight, LifeBuoy,
} from "lucide-react";
import {
  PageHeader, SettingsCard, CardHeader, ChevronRow,
} from "@/features/settings/settings-ui";

const HELP_DOMAIN = "https://help.teezer.live";

const FAQ_CATEGORIES = [
  { icon: User,         bg: "bg-[#eff6ff]",  color: "text-[#3b82f6]",  title: "Account Help",   desc: "Login issues, account recovery, profile settings" },
  { icon: BookOpen,     bg: "bg-[#f0fdf4]",  color: "text-[#16a34a]",  title: "Creator Help",   desc: "Monetization, Studio, growing your audience" },
  { icon: Shield,       bg: "bg-[#f5f3ff]",  color: "text-[#7c3aed]",  title: "Safety Help",    desc: "Reporting, blocking, privacy and trust" },
  { icon: MessageSquare,bg: "bg-[#fff7ed]",  color: "text-[#f97316]",  title: "Contact Support",desc: "Reach out to the Teezer support team" },
  { icon: FileQuestion, bg: "bg-[#fefce8]",  color: "text-[#ca8a04]",  title: "FAQs",           desc: "Most frequently asked questions and answers" },
  { icon: Phone,        bg: "bg-[#fff3ec]",  color: "text-[#fd4605]",  title: "Live Chat",      desc: "Chat with a support agent in real time" },
];

export default function HelpPage() {
  const [query, setQuery] = useState("");

  return (
    <div className="p-6">
      <PageHeader title="Help Center" subtitle="Get answers and support for your Teezer account" />

      {/* Full Help Center banner → the dedicated help.teezer.live domain */}
      <a
        href={HELP_DOMAIN}
        target="_blank"
        rel="noopener noreferrer"
        className="group mb-4 flex items-center gap-4 overflow-hidden rounded-2xl bg-gradient-to-r from-[#fd4605] to-[#ff5b7a] p-5 text-white shadow-[0_8px_28px_rgba(253,70,5,0.28)] transition-transform hover:-translate-y-0.5"
      >
        <span className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-white/20">
          <LifeBuoy className="h-6 w-6 text-white" />
        </span>
        <div className="flex-1">
          <p className="flex items-center gap-1.5 text-[15px] font-extrabold">
            Visit the full Help Center
            <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          </p>
          <p className="mt-0.5 text-[12.5px] text-white/85">
            Browse articles, guides and topics for the Teezer website and app at help.teezer.live
          </p>
        </div>
        <span className="hidden rounded-full bg-white px-4 py-2 text-[13px] font-bold text-[#fd4605] sm:block">
          Open Help Center
        </span>
      </a>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">

        {/* Card 1: Search */}
        <SettingsCard>
          <CardHeader n={1} title="Search Support" />
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-3 rounded-[14px] border border-[#e8eaf0] bg-[#fafbfc] px-4 py-3">
              <Search className="h-4 w-4 flex-shrink-0 text-[#9ca3af]" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search help articles…"
                className="flex-1 bg-transparent text-[13px] font-medium text-[#111827] placeholder:text-[#9ca3af] outline-none"
              />
            </div>
            <p className="text-[11px] text-[#9ca3af] px-1">Try searching "reset password", "monetization", or "report a video"</p>
            <button className="w-full rounded-[12px] py-2.5 text-[13px] font-bold text-white transition hover:opacity-90"
              style={{ background: "#fd4605" }}>
              Search
            </button>
          </div>
        </SettingsCard>

        {/* Card 2: Help Categories */}
        <SettingsCard>
          <CardHeader n={2} title="Help Categories" />
          {FAQ_CATEGORIES.map(({ icon: Icon, bg, color, title, desc }, i) => (
            <div key={title}
              className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-[#f8fafc] transition ${i < FAQ_CATEGORIES.length - 1 ? "border-b border-[#f0f1f5]" : ""}`}>
              <span className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-[8px] ${bg}`}>
                <Icon className={`h-4 w-4 ${color}`} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-semibold text-[#111827] truncate">{title}</p>
                <p className="text-[11px] text-[#9ca3af] truncate">{desc}</p>
              </div>
              <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#d1d5db]" />
            </div>
          ))}
        </SettingsCard>

        {/* Card 3: Contact Support */}
        <SettingsCard className="lg:col-span-2">
          <CardHeader n={3} title="Contact Support" />
          <div className="grid grid-cols-1 gap-0 lg:grid-cols-3">
            <ChevronRow icon={Mail}          iconBg="bg-[#eff6ff]"  iconColor="text-[#3b82f6]"
              title="Email Support"     desc="We typically respond within 24-48 hours" />
            <ChevronRow icon={MessageSquare} iconBg="bg-[#f0fdf4]"  iconColor="text-[#16a34a]"
              title="Live Chat"         desc="Chat with a support agent right now" />
            <ChevronRow icon={HelpCircle}    iconBg="bg-[#f5f3ff]"  iconColor="text-[#7c3aed]"
              title="Help Center Docs"  desc="Browse our full self-service documentation" last />
          </div>
        </SettingsCard>
      </div>
    </div>
  );
}
