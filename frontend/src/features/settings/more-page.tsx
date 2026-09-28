"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronRight,
  CircleUser, ShieldCheck, Lock, Bell, SlidersHorizontal, Accessibility,
  Clapperboard, Bookmark, Clock, Megaphone, Radio,
  LifeBuoy, AlertTriangle, BookOpen, Info, Scale,
  LogOut, Edit3,
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { useAuthStore } from "@/store/auth.store";

const BRAND = "#fe2c55";

const GROUPS = [
  {
    id: "account",
    title: "Account & Preferences",
    items: [
      { icon: CircleUser,        bg: "bg-[#fff0f4]", color: "text-[#fe2c55]", label: "Account Settings",    desc: "Profile, bio, social links",           href: "/settings/account" },
      { icon: ShieldCheck,       bg: "bg-[#f0fdf4]", color: "text-[#16a34a]", label: "Login & Security",    desc: "Password, 2FA, active sessions",       href: "/settings/security" },
      { icon: Lock,              bg: "bg-[#f5f3ff]", color: "text-[#7c3aed]", label: "Privacy & Safety",    desc: "Who can see and interact with you",     href: "/settings/privacy" },
      { icon: Bell,              bg: "bg-[#fffbeb]", color: "text-[#f59e0b]", label: "Notifications",       desc: "Push, email and SMS alerts",            href: "/settings/notifications" },
      { icon: SlidersHorizontal, bg: "bg-[#f0fdfa]", color: "text-[#0d9488]", label: "Content Preferences", desc: "Feed, language and content filters",    href: "/settings/content-preferences" },
      { icon: Accessibility,     bg: "bg-[#f5f3ff]", color: "text-[#7c3aed]", label: "Accessibility Settings", desc: "Display, motion, captions & a11y",   href: "/settings/accessibility" },
    ],
  },
  {
    id: "create",
    title: "Create & Engage",
    items: [
      { icon: Clapperboard,      bg: "bg-[#eff6ff]", color: "text-[#3b82f6]", label: "Teezer Studio",      desc: "Creator dashboard and tools",           href: "/studio" },
      { icon: Megaphone,         bg: "bg-[#fff7ed]", color: "text-[#f97316]", label: "Ads Manager",         desc: "Create and track your promotions",      href: "/ads-manager" },
      { icon: Bookmark,          bg: "bg-[#f5f3ff]", color: "text-[#7c3aed]", label: "Saved Videos",        desc: "Videos and collections you saved",      href: "/settings/saved" },
      { icon: Clock,             bg: "bg-[#fff7ed]", color: "text-[#f97316]", label: "Watch History",       desc: "Your recently watched videos",          href: "/settings/history" },
      { icon: Radio,             bg: "bg-[#fff0f4]", color: "text-[#fe2c55]", label: "Live Settings",       desc: "Live streaming preferences",            href: "/settings/live" },
    ],
  },
  {
    id: "support",
    title: "Support & Legal",
    items: [
      { icon: LifeBuoy,          bg: "bg-[#eff6ff]", color: "text-[#3b82f6]", label: "Help Center",         desc: "FAQs and contact support",              href: "/settings/help" },
      { icon: AlertTriangle,     bg: "bg-[#fff0f4]", color: "text-[#fe2c55]", label: "Report a Problem",    desc: "Tell us what went wrong",               href: "/settings/report" },
      { icon: BookOpen,          bg: "bg-[#f5f3ff]", color: "text-[#7c3aed]", label: "Community Guidelines",desc: "Rules and content standards",           href: "/settings/guidelines" },
      { icon: Info,              bg: "bg-[#fefce8]", color: "text-[#ca8a04]", label: "About Teezer",       desc: "Version, rate and share the app",       href: "/settings/about" },
      { icon: Scale,             bg: "bg-[#f0fdf4]", color: "text-[#16a34a]", label: "Terms & Privacy",     desc: "Legal documents and data controls",     href: "/settings/terms-privacy" },
    ],
  },
];

export function MorePage() {
  const { user, logout } = useAuthStore();
  const router = useRouter();

  return (
    <AppShell>
      {/* Scroll container - body is overflow:hidden globally, so we scroll here */}
      <div className="page-scroll">
        <div className="mx-auto max-w-2xl px-4 py-8 lg:px-6">

          {/* Page title */}
          <h1 className="text-[22px] font-extrabold text-[#111827]">More</h1>
          <p className="mt-0.5 text-[13px] text-[#9ca3af]">Settings, creator tools, and support.</p>

          {/* User profile card */}
          <div className="mt-4 flex items-center gap-4 rounded-2xl border border-[#e8eaf0] bg-white p-4 shadow-[0_1px_6px_rgba(0,0,0,0.06)]">
            <div className="relative flex-shrink-0">
              {user?.avatar
                ? <img src={user.avatar} alt={user.name} className="h-[52px] w-[52px] rounded-full object-cover" />
                : <div className="flex h-[52px] w-[52px] items-center justify-center rounded-full text-[20px] font-black text-white" style={{ background: BRAND }}>
                    {(user?.name?.[0] ?? "R").toUpperCase()}
                  </div>
              }
              <span className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded-full border-2 border-white bg-[#22c55e]" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate text-[15px] font-bold text-[#111827]">{user?.name ?? "Teezer User"}</p>
              <p className="truncate text-[12px] text-[#9ca3af]">@{user?.username ?? "username"}</p>
            </div>
            <Link href="/settings/account"
              className="flex flex-shrink-0 items-center gap-1.5 rounded-[10px] border border-[#e8eaf0] bg-[#fafbfc] px-3 py-2 text-[12px] font-bold text-[#334155] transition hover:border-[#fe2c55] hover:text-[#fe2c55]">
              <Edit3 className="h-3.5 w-3.5" />
              Edit Profile
            </Link>
          </div>

          {/* Menu groups */}
          <div className="mt-4 space-y-3">
            {GROUPS.map((group) => (
              <div key={group.id} className="overflow-hidden rounded-2xl border border-[#e8eaf0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
                <p className="border-b border-[#f0f1f5] px-5 py-2.5 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
                  {group.title}
                </p>
                {group.items.map(({ icon: Icon, bg, color, label, desc, href }, i) => (
                  <Link key={label} href={href}
                    className={`flex items-center gap-3.5 px-4 py-3 transition hover:bg-[#fafbfc] active:bg-[#f5f5f5] ${
                      i < group.items.length - 1 ? "border-b border-[#f0f1f5]" : ""
                    }`}>
                    {/* Icon square */}
                    <span className={`flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[12px] ${bg}`}>
                      <Icon className={`h-[20px] w-[20px] ${color}`} strokeWidth={1.8} />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-[#111827] leading-tight">{label}</p>
                      <p className="mt-0.5 text-[11.5px] text-[#9ca3af] leading-tight">{desc}</p>
                    </div>
                    <ChevronRight className="h-[18px] w-[18px] flex-shrink-0 text-[#d1d5db]" />
                  </Link>
                ))}
              </div>
            ))}

            {/* Log Out */}
            <div className="overflow-hidden rounded-2xl border border-[#e8eaf0] bg-white shadow-[0_1px_4px_rgba(0,0,0,0.04)]">
              <button
                onClick={() => { logout(); router.push("/auth/login"); }}
                className="flex w-full items-center gap-3.5 px-4 py-3 transition hover:bg-[#fff5f6] active:bg-[#ffe4e6]">
                <span className="flex h-[42px] w-[42px] flex-shrink-0 items-center justify-center rounded-[12px] bg-[#fff0f4]">
                  <LogOut className="h-[20px] w-[20px] text-[#dc2626]" strokeWidth={1.8} />
                </span>
                <div className="flex-1 min-w-0 text-left">
                  <p className="text-[13.5px] font-semibold text-[#dc2626] leading-tight">Log Out</p>
                  <p className="mt-0.5 text-[11.5px] text-[#9ca3af] leading-tight">Sign out of your Teezer account</p>
                </div>
              </button>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-6 pb-6 text-center text-[10px] text-[#d1d5db]">
            © 2026 Teezer ·{" "}
            <Link href="/settings/terms-privacy" className="hover:underline">Terms</Link>{" · "}
            <Link href="/settings/terms-privacy" className="hover:underline">Privacy</Link>{" · "}
            <Link href="/settings/help" className="hover:underline">Help</Link>
          </p>
        </div>
      </div>
    </AppShell>
  );
}
