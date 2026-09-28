"use client";

import Link from "next/link";
import {
  AlertCircle, ArrowUpRight, BadgeDollarSign, BookOpen, Briefcase, ChevronRight,
  CalendarCheck, Clock, Cookie, EyeOff, FileText, Gavel, Gem, HandMetal, HeartOff, Landmark, Music,
  Lock, Server, Shield, ShieldCheck, Smile, Sparkles, UserCheck, Users,
} from "lucide-react";
import { PageHeader, SettingsCard, CardHeader } from "@/features/settings/settings-ui";

/* ────────────────────────────────────────────────────────────────
   The complete Reelsoo policy directory - same set the mobile app
   lists under Guidelines & Policies. Every row links to the live
   policy page (or the exact section anchor inside it).
──────────────────────────────────────────────────────────────── */

interface PolicyLink {
  icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  title: string;
  desc: string;
  href: string;
}

const CORE: PolicyLink[] = [
  { icon: Users, iconBg: "bg-[#fff0f4]", iconColor: "text-[#fe2c55]", title: "Community Guidelines", desc: "What's allowed on Teezer, and what's not", href: "/guidelines" },
  { icon: FileText, iconBg: "bg-[#eff6ff]", iconColor: "text-[#3b82f6]", title: "Terms of Service", desc: "The agreement that governs your use of Teezer", href: "/terms" },
  { icon: ShieldCheck, iconBg: "bg-[#f0fdf4]", iconColor: "text-[#16a34a]", title: "Privacy Policy", desc: "How we collect, use and protect your data", href: "/privacy" },
];

const SAFETY: PolicyLink[] = [
  { icon: AlertCircle, iconBg: "bg-[#fff7ed]", iconColor: "text-[#f97316]", title: "Safety Policy", desc: "Violence, self-harm and dangerous acts", href: "/policies/safety" },
  { icon: EyeOff, iconBg: "bg-[#fff0f4]", iconColor: "text-[#fe2c55]", title: "Adult Content Policy", desc: "Nudity and sexual content rules", href: "/policies/adult-content" },
  { icon: Smile, iconBg: "bg-[#f0fdf4]", iconColor: "text-[#16a34a]", title: "Minor Safety Policy", desc: "Protecting children and teens", href: "/policies/minor-safety" },
  { icon: CalendarCheck, iconBg: "bg-[#eff6ff]", iconColor: "text-[#2563eb]", title: "Age Suitability", desc: "Our 16+ rating and minimum age to join", href: "/policies/age-suitability" },
  { icon: Music, iconBg: "bg-[#fdf4ff]", iconColor: "text-[#a21caf]", title: "Music Attribution", desc: "How tracks are identified and credited", href: "/policies/music-attribution" },
  { icon: HandMetal, iconBg: "bg-[#f5f3ff]", iconColor: "text-[#7c3aed]", title: "Harassment & Bullying Policy", desc: "Respectful behaviour and anti-doxxing rules", href: "/policies/harassment" },
  { icon: HeartOff, iconBg: "bg-[#fef2f2]", iconColor: "text-[#dc2626]", title: "Hateful Behaviour Policy", desc: "Zero tolerance for hate speech", href: "/policies/hateful-behavior" },
  { icon: UserCheck, iconBg: "bg-[#f0fdfa]", iconColor: "text-[#0d9488]", title: "Integrity & Authenticity Policy", desc: "No impersonation, spam or fake engagement", href: "/policies/integrity" },
  { icon: Sparkles, iconBg: "bg-[#fffbeb]", iconColor: "text-[#f59e0b]", title: "AI-Generated Content Policy", desc: "Labels and rules for synthetic media", href: "/policies/ai-content" },
  { icon: Gavel, iconBg: "bg-[#f8fafc]", iconColor: "text-[#475569]", title: "Enforcement & Appeals", desc: "How rules are enforced and how to appeal", href: "/policies/enforcement" },
];

const LEGAL: PolicyLink[] = [
  { icon: Briefcase, iconBg: "bg-[#fff7ed]", iconColor: "text-[#f97316]", title: "Copyright Policy", desc: "Reporting infringement, counter-notices and music rules", href: "/copyright" },
  { icon: Gem, iconBg: "bg-[#f5f3ff]", iconColor: "text-[#7c3aed]", title: "Virtual Items Policy", desc: "Coins, Gifts, wallets, refunds and payouts", href: "/virtual-items" },
  { icon: BadgeDollarSign, iconBg: "bg-[#f0fdf4]", iconColor: "text-[#16a34a]", title: "Creator Earnings & Payouts", desc: "Monetization eligibility and payout rules", href: "/policies/creator-earnings" },
  { icon: Cookie, iconBg: "bg-[#fffbeb]", iconColor: "text-[#f59e0b]", title: "Cookie Policy", desc: "Cookies and storage used on the website", href: "/cookies" },
  { icon: Server, iconBg: "bg-[#eff6ff]", iconColor: "text-[#3b82f6]", title: "Data Collection Policy", desc: "What information Teezer collects and why", href: "/policies/data-collection" },
  { icon: BookOpen, iconBg: "bg-[#f0fdfa]", iconColor: "text-[#0d9488]", title: "Data Sharing Policy", desc: "Who receives your information and why", href: "/policies/data-sharing" },
  { icon: Clock, iconBg: "bg-[#f8fafc]", iconColor: "text-[#475569]", title: "Data Retention & Deletion", desc: "How long data is kept and what deletion does", href: "/policies/data-retention" },
  { icon: Lock, iconBg: "bg-[#fff0f4]", iconColor: "text-[#fe2c55]", title: "Security Policy", desc: "How Teezer protects your account and data", href: "/policies/security" },
  { icon: Shield, iconBg: "bg-[#f5f3ff]", iconColor: "text-[#7c3aed]", title: "Your Rights & Controls", desc: "Access, export, correction and deletion rights", href: "/policies/your-rights" },
  { icon: Landmark, iconBg: "bg-[#eff6ff]", iconColor: "text-[#3b82f6]", title: "Law Enforcement Guidelines", desc: "How authorities can request data from Teezer", href: "/law-enforcement" },
];

/* Featured tile for the three core documents. */
function CoreTile({ p }: { p: PolicyLink }) {
  const Icon = p.icon;
  return (
    <Link
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex flex-col gap-3 rounded-2xl border border-[#f0f1f5] bg-white p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:border-[#fe2c55]/40 hover:shadow-[0_8px_24px_rgba(254,44,85,0.10)]"
    >
      <div className="flex items-start justify-between">
        <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${p.iconBg}`}>
          <Icon className={`h-5 w-5 ${p.iconColor}`} />
        </span>
        <ArrowUpRight className="h-4 w-4 text-[#d1d5db] transition-all group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-[#fe2c55]" />
      </div>
      <div>
        <p className="text-[14px] font-bold text-[#111827] group-hover:text-[#fe2c55]">{p.title}</p>
        <p className="mt-1 text-[12px] leading-relaxed text-[#9ca3af]">{p.desc}</p>
      </div>
    </Link>
  );
}

/* One linked row inside a section card. */
function PolicyRow({ p, last }: { p: PolicyLink; last?: boolean }) {
  const Icon = p.icon;
  return (
    <Link
      href={p.href}
      target="_blank"
      rel="noopener noreferrer"
      className={`group flex items-center gap-3.5 px-5 py-3.5 transition-colors hover:bg-[#fff8f9] ${!last ? "border-b border-[#f3f4f6]" : ""}`}
    >
      <span className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] ${p.iconBg}`}>
        <Icon className={`h-[17px] w-[17px] ${p.iconColor}`} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold leading-tight text-[#111827] group-hover:text-[#fe2c55]">{p.title}</span>
        <span className="mt-0.5 block text-[11.5px] leading-tight text-[#9ca3af]">{p.desc}</span>
      </span>
      <ChevronRight className="h-4 w-4 flex-shrink-0 text-[#d1d5db] transition-transform group-hover:translate-x-0.5 group-hover:text-[#fe2c55]" />
    </Link>
  );
}

export default function GuidelinesPage() {
  return (
    <div className="p-6">
      <PageHeader
        title="Guidelines & Policies"
        subtitle="Every rule that keeps Teezer safe, and every policy that protects you - in one place"
      />

      {/* Core documents - featured tiles */}
      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {CORE.map((p) => <CoreTile key={p.title} p={p} />)}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Safety & community rules */}
        <SettingsCard>
          <CardHeader n={1} title="Safety & Community Rules" />
          {SAFETY.map((p, i) => <PolicyRow key={p.title} p={p} last={i === SAFETY.length - 1} />)}
        </SettingsCard>

        {/* Legal & data rules */}
        <SettingsCard>
          <CardHeader n={2} title="Legal & Data Rules" />
          {LEGAL.map((p, i) => <PolicyRow key={p.title} p={p} last={i === LEGAL.length - 1} />)}
        </SettingsCard>
      </div>

      {/* Help note */}
      <div className="mt-4 flex items-center gap-3.5 rounded-2xl border border-[#f0f1f5] bg-[#fafbfc] px-5 py-4">
        <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#fff0f4]">
          <Shield className="h-[17px] w-[17px] text-[#fe2c55]" />
        </span>
        <p className="text-[12px] leading-relaxed text-[#6b7280]">
          Teezer follows <span className="font-semibold text-[#374151]">WCAG 2.1 AA</span> and industry safety
          standards. Questions about any policy? Contact{" "}
          <a href="mailto:support@teezer.live" className="font-semibold text-[#fe2c55] hover:underline">
            support@teezer.live
          </a>
          .
        </p>
      </div>
    </div>
  );
}
