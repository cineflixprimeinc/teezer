"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Accessibility, ArrowLeft, BellRing, BookmarkCheck,
  BookOpen, ChevronLeft, CircleHelp, Clapperboard,
  ExternalLink, Flag, Gauge, History,
  LifeBuoy, Lock, LogOut, Radio,
  Scale, ScrollText, ShieldAlert, ShieldCheck, TriangleAlert,
  UserCog, UserPlus, Wifi,
} from "lucide-react";
import { RequireAuth } from "@/components/layout/protected-route";
import { useAuthStore } from "@/store/auth.store";

const BRAND = "#fd4605";

/* ── Sidebar navigation structure ────────────────────────────────────────── */
const SIDEBAR_GROUPS = [
  {
    id: "back",
    items: [
      {
        href: "/",
        label: "Back to Home Feed",
        icon: ChevronLeft,
        iconBg: "",
        iconColor: "text-[#6b7280]",
        plain: true,
      },
    ],
  },
  {
    id: "account",
    items: [
      { href: "/settings/account",             label: "Account Settings",       icon: UserCog,       iconBg: "bg-[#fff3ec]", iconColor: "text-[#fd4605]"  },
      { href: "/settings/security",            label: "Login & Security",       icon: ShieldCheck,   iconBg: "bg-[#dcfce7]", iconColor: "text-[#16a34a]"  },
      { href: "/settings/privacy",             label: "Privacy & Safety",       icon: Lock,          iconBg: "bg-[#ede9fe]", iconColor: "text-[#7c3aed]"  },
      { href: "/settings/follow-requests",    label: "Follow Requests",        icon: UserPlus,      iconBg: "bg-[#fff3ec]", iconColor: "text-[#fd4605]"  },
      { href: "/settings/restrictions",      label: "My Restrictions",        icon: ShieldAlert,   iconBg: "bg-[#fff7ed]", iconColor: "text-[#d97706]"  },
      { href: "/settings/notifications",       label: "Notifications",          icon: BellRing,      iconBg: "bg-[#fef9c3]", iconColor: "text-[#ca8a04]"  },
      { href: "/settings/content-preferences", label: "Content Preferences",    icon: Gauge,         iconBg: "bg-[#ccfbf1]", iconColor: "text-[#0d9488]"  },
      { href: "/settings/accessibility",       label: "Accessibility Settings", icon: Accessibility, iconBg: "bg-[#e0e7ff]", iconColor: "text-[#4338ca]"  },
    ],
  },
  {
    id: "creator",
    items: [
      { href: "/settings/studio",  label: "Teezer Studio", icon: Clapperboard,  iconBg: "bg-[#ffe4e6]", iconColor: "text-[#f43f5e]",  matchPrefix: true },
      { href: "/settings/saved",   label: "Saved Videos",   icon: BookmarkCheck, iconBg: "bg-[#d1fae5]", iconColor: "text-[#059669]"  },
      { href: "/settings/history", label: "Watch History",  icon: History,       iconBg: "bg-[#dbeafe]", iconColor: "text-[#2563eb]"  },
      { href: "/settings/live",    label: "Live Settings",  icon: Wifi,          iconBg: "bg-[#faf5ff]", iconColor: "text-[#9333ea]"  },
    ],
  },
  {
    id: "support",
    items: [
      { href: "/settings/help",          label: "Help Center",          icon: LifeBuoy,    iconBg: "bg-[#dbeafe]", iconColor: "text-[#2563eb]"  },
      { href: "/settings/report",        label: "Report a Problem",     icon: TriangleAlert,iconBg: "bg-[#ffedd5]", iconColor: "text-[#ea580c]"  },
      { href: "/settings/guidelines",    label: "Community Guidelines", icon: Scale,       iconBg: "bg-[#d1fae5]", iconColor: "text-[#059669]"  },
      { href: "/settings/about",         label: "About Teezer",        icon: CircleHelp,  iconBg: "bg-[#f1f5f9]", iconColor: "text-[#475569]"  },
      { href: "/settings/terms-privacy", label: "Terms & Privacy",      icon: ScrollText,  iconBg: "bg-[#ede9fe]", iconColor: "text-[#6d28d9]"  },
    ],
  },
];

/* ── Layout ──────────────────────────────────────────────────────────────── */
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router   = useRouter();
  const { user, logout } = useAuthStore();

  const displayName = user?.name     || "Teezer Official";
  const username    = user?.username || "teezer.live";
  const avatar      = user?.avatar   || null;
  const initial     = (displayName[0] || "R").toUpperCase();

  function handleLogout() {
    logout();
    router.push("/");
  }

  return (
    <RequireAuth>
      {/* Height compensates for the Accessibility "Text Size" zoom (body { zoom:
          var(--a11y-zoom) }). Plain `h-screen` (100vh) gets scaled past the real
          viewport by the zoom and, with html/body `overflow:hidden`, clips the
          bottom - hiding each settings page's sticky Save bar. Dividing by the
          zoom makes the shell render exactly one viewport tall at any text size. */}
      <div
        className="flex overflow-hidden bg-[#f4f5f7]"
        style={{ height: "calc(100vh / var(--a11y-zoom, 1))" }}
      >

        {/* ── Left sidebar ─────────────────────────────────────────────── */}
        <aside className="flex h-full w-[258px] flex-shrink-0 flex-col overflow-hidden border-r border-[#e8eaf0] bg-white">

          {/* User mini-profile - clickable, opens user's profile */}
          <Link
            href={`/profile/${username}`}
            className="flex flex-shrink-0 items-center gap-3 border-b border-[#f0f1f5] px-4 py-4 transition-colors hover:bg-[#fafbfc] group"
          >
            <div className="relative flex-shrink-0">
              {avatar ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={avatar}
                  alt={displayName}
                  className="h-10 w-10 rounded-full object-cover ring-2 ring-transparent transition-all group-hover:ring-[#fd4605]"
                />
              ) : (
                <div
                  className="flex h-10 w-10 items-center justify-center rounded-full text-[14px] font-bold text-white ring-2 ring-transparent transition-all group-hover:ring-[#fd4605]"
                  style={{ background: BRAND }}
                >
                  {initial}
                </div>
              )}
              <span className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-white bg-[#22c55e]" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-bold text-[#111827] group-hover:text-[#fd4605] transition-colors">
                {displayName}
              </p>
              <p className="truncate text-[11px] text-[#9ca3af]">@{username}</p>
            </div>
            <ExternalLink className="h-3.5 w-3.5 flex-shrink-0 text-[#d1d5db] opacity-0 transition-opacity group-hover:opacity-100" />
          </Link>

          {/* Navigation */}
          <nav className="settings-sidebar-scroll flex-1 overflow-y-auto px-2.5 py-3">
            {SIDEBAR_GROUPS.map((group, gi) => (
              <div key={group.id}>
                {gi > 0 && (
                  <div className="my-2 border-t border-[#f0f1f5]" />
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active = (item as { matchPrefix?: boolean }).matchPrefix
                      ? pathname.startsWith(item.href)
                      : pathname === item.href;
                    const Icon   = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex h-[38px] items-center gap-2.5 rounded-[12px] px-2.5 text-[13px] font-semibold transition-colors ${
                          active
                            ? "bg-[#fff1f4] text-[#fd4605]"
                            : "text-[#334155] hover:bg-[#f8fafc]"
                        }`}
                      >
                        {(item as { plain?: boolean }).plain ? (
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] bg-[#f1f5f9]">
                            <Icon className="h-[15px] w-[15px] text-[#64748b]" />
                          </span>
                        ) : (
                          <span
                            className={`flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[8px] transition-colors ${
                              active ? "" : item.iconBg
                            }`}
                            style={active ? { background: BRAND } : undefined}
                          >
                            <Icon
                              className={`h-[14px] w-[14px] ${
                                active ? "text-white" : item.iconColor
                              }`}
                            />
                          </span>
                        )}
                        <span className="truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          {/* Log Out + Footer */}
          <div className="flex-shrink-0 border-t border-[#f0f1f5] px-2.5 py-3">
            <button
              onClick={handleLogout}
              className="flex h-10 w-full items-center gap-2.5 rounded-[12px] px-3 text-[13px] font-semibold text-[#ef4444] transition-colors hover:bg-[#fef2f2]"
            >
              <LogOut className="h-4 w-4 flex-shrink-0" />
              Log Out
            </button>
            <p className="mt-2 text-center text-[10px] leading-relaxed text-[#c0c4cc]">
              © 2026 Teezer ·{" "}
              <Link href="/terms"   className="transition hover:text-[#9ca3af]">Terms</Link>
              {" · "}
              <Link href="/privacy" className="transition hover:text-[#9ca3af]">Privacy</Link>
              {" · "}
              <Link href="/help"    className="transition hover:text-[#9ca3af]">Help</Link>
            </p>
          </div>
        </aside>

        {/* ── Main content area ─────────────────────────────────────────── */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>

      </div>
    </RequireAuth>
  );
}
