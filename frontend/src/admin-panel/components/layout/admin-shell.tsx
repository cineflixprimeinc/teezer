"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  BadgeCheck, BarChart3, Bell, BookOpen, ChevronDown, ChevronRight, CircleDollarSign,
  Disc3, FileText, Flag, Headphones, LayoutDashboard,
  LogOut, Menu, MessageSquare, Radio, Settings, Shield, ShieldAlert,
  Smile, Tag, Upload, Users, Users2, X, Activity, CreditCard, Gift, Star,
  UserCheck, Megaphone, HelpCircle,
  BanIcon, Hash, ListMusic, Mail, Zap, Search, Database, Server, Package, Cpu, KeyRound,
  Trophy, Ticket, Plug, Store, ClipboardCheck, Globe, SlidersHorizontal,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/admin-panel/store/auth.store";
import { cn } from "@/admin-panel/lib/utils";
import { DemoNotice } from "./demo-notice";

// ── Sidebar nav definition (grouped) ────────────────────────────────────────

/**
 * `exact` means "highlight only on this exact path".
 *
 * Needed because the default match is a prefix one, and several sections now
 * have a landing page whose route is a prefix of its own children - /settings
 * against /settings/email, /monitoring against /monitoring/redis. Without it
 * both rows light up at once and the sidebar stops telling you where you are.
 * /dashboard already had this behaviour hardcoded; this just names it.
 */
type NavLeaf = { href: string; label: string; icon: React.ElementType; exact?: boolean };
type NavItem = {
  href: string;
  label: string;
  icon: React.ElementType;
  badge?: number;
  exact?: boolean;
  children?: NavLeaf[];
};
type NavGroup = { label: string; items: NavItem[] };

/**
 * Sidebar structure.
 *
 * Every href below already existed - this is a reorganisation, not new
 * navigation. The sections split along one line: the operational groups
 * (Users, Content, Music, Monetization, Advertising, Moderation, Analytics)
 * manage platform DATA, and Settings configures platform BEHAVIOUR. That is
 * why /payment-settings sits under Monetization rather than Settings: it is
 * where money actually moves, and an admin looking for it is thinking about
 * payments, not about configuration.
 *
 * No route appears twice. /verification used to be listed under both
 * "User & Content" (as "Verification Badge") and "Platform" (as
 * "Verification") - two rows, one page, and whichever you clicked the other
 * lit up too.
 */
const NAV_GROUPS: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        href: "/admin/monitoring",
        label: "Monitoring",
        icon: Activity,
        children: [
          { href: "/admin/monitoring",          label: "System Overview", icon: Activity, exact: true },
          { href: "/admin/health",              label: "System Health",   icon: Cpu },
          { href: "/admin/monitoring/redis",    label: "Redis",           icon: Server },
          { href: "/admin/monitoring/database", label: "PostgreSQL",      icon: Database },
          { href: "/admin/monitoring/queue",    label: "Queue Jobs",      icon: Package },
          { href: "/admin/monitoring/realtime", label: "WebSocket",       icon: Radio },
          { href: "/admin/monitoring/logs",     label: "App Logs",        icon: BookOpen },
        ],
      },
    ],
  },
  {
    label: "Users & Creators",
    items: [
      { href: "/admin/users",        label: "Users",         icon: Users },
      { href: "/admin/verification", label: "Verification",  icon: BadgeCheck },
      /* Banned Users lives here rather than under Moderation, which is the
         other place it could go. This section is where you look for a SET OF
         PEOPLE; Moderation is where you work a queue. Listed once, either way. */
      { href: "/admin/banned",       label: "Banned Users",  icon: BanIcon },
      /* Every report a user filed against a video/comment/story/account/DM/
         live stream/Space - the full 7-type queue from AdminReportsController,
         evidence photos included. Deliberately a different route from the
         older /reports under Moderation (video+user only, no evidence) rather
         than replacing it - see that page's own comment about not touching
         a working page outside the ask. */
      { href: "/admin/reported",     label: "Reported",      icon: Flag },
    ],
  },
  {
    label: "Teezer Shop",
    items: [
      { href: "/admin/shop/categories",           label: "Categories",            icon: Tag },
      { href: "/admin/shop/shops",                label: "Shops",                 icon: Store },
      { href: "/admin/shop/applications",         label: "Applications",          icon: ClipboardCheck },
      { href: "/admin/shop/country-requirements", label: "Country Requirements",  icon: Globe },
      { href: "/admin/shop/promo-banners",        label: "Promo Banners",         icon: Megaphone },
      { href: "/admin/shop/deals",                label: "Deals of the Day",      icon: Zap },
      { href: "/admin/shop/coupons",              label: "Marketplace Coupons",   icon: Ticket },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/admin/live",       label: "Live Streams", icon: Radio },
      { href: "/admin/audio",      label: "Audio Rooms",  icon: Headphones },
      { href: "/admin/comments",   label: "Comments",     icon: MessageSquare },
      { href: "/admin/hashtags",   label: "Hashtags",     icon: Hash },
      { href: "/admin/challenges", label: "Challenges",   icon: Trophy },
    ],
  },
  {
    label: "Music",
    items: [
      {
        href: "/admin/music",
        label: "Music Library",
        icon: ListMusic,
        children: [
          { href: "/admin/music",         label: "All Tracks",   icon: ListMusic, exact: true },
          { href: "/admin/music/upload",  label: "Upload Track", icon: Upload },
          { href: "/admin/music/artists", label: "Artists",      icon: Users2 },
          { href: "/admin/music/albums",  label: "Albums",       icon: Disc3 },
          { href: "/admin/music/genres",  label: "Genres",       icon: Tag },
          { href: "/admin/music/moods",   label: "Moods",        icon: Smile },
        ],
      },
    ],
  },
  {
    label: "Monetization",
    items: [
      { href: "/admin/monetization",    label: "Monetization Overview", icon: CircleDollarSign, exact: true },
      { href: "/admin/revenue",         label: "Revenue",               icon: BarChart3 },
      { href: "/admin/transactions",    label: "Transactions",          icon: Activity },
      { href: "/admin/payouts",         label: "Payouts",               icon: CreditCard },
      { href: "/admin/gifts",           label: "Gifts & Coins",         icon: Gift },
      { href: "/admin/premium-plans",   label: "Premium Subscriptions", icon: Star },
      { href: "/admin/coupons",         label: "Coupons & Offers",      icon: Ticket },
      { href: "/admin/payment-settings",label: "Payment Providers",     icon: CreditCard },
    ],
  },
  {
    label: "Advertising",
    items: [
      { href: "/admin/ads-management",             label: "Ads Overview", icon: LayoutDashboard, exact: true },
      { href: "/admin/ads-management/campaigns",   label: "Campaigns",   icon: Megaphone },
      { href: "/admin/ads-management/advertisers", label: "Advertisers", icon: Users },
      { href: "/admin/ads-management/approvals",   label: "Ad Moderation", icon: ShieldAlert },
      { href: "/admin/ads-management/placements",  label: "Placements",  icon: Tag },
      { href: "/admin/ads-management/fraud",       label: "Fraud",       icon: Shield },
      { href: "/admin/ads-management/settings",    label: "Ad Settings", icon: Settings },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/admin/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Moderation",
    items: [
      { href: "/admin/moderation", label: "Moderation Queue", icon: ShieldAlert },
      /* Reports moved to /reported under Users & Creators (all 7 types +
         evidence) - see that nav entry's comment. /reports itself now just
         redirects there, so it isn't listed twice per the no-duplicate-route
         rule above. */
      { href: "/admin/violations", label: "Violations",       icon: Shield },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/admin/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Settings",
    items: [
      /* Exact: /settings is a prefix of the two rows under it, so without this
         "General" stays lit while you are on Email & OTP. */
      { href: "/admin/settings",              label: "General",      icon: Settings, exact: true },
      { href: "/admin/settings/global-control", label: "Global Teezer Control", icon: SlidersHorizontal },
      { href: "/admin/settings/website",      label: "Website & SEO", icon: Globe },
      { href: "/admin/settings/email",        label: "Email & OTP",  icon: Mail },
      { href: "/admin/settings/monetization", label: "Monetization", icon: CircleDollarSign },
      { href: "/admin/settings/country-availability", label: "Teezer Country Availability", icon: Globe },
      { href: "/admin/social-login",          label: "Social Login", icon: KeyRound },
      { href: "/admin/settings/integrations", label: "Integrations", icon: Plug },
      { href: "/admin/features",              label: "Feature Flags",icon: Zap },
      { href: "/admin/legal",                 label: "CMS & Legal",  icon: FileText },
    ],
  },
  /* Marketplace licensing gets its own group rather than being filed under
     Monetization or Security, because it is neither. Monetization is platform
     revenue - gifts, payouts, subscriptions, money moving between OUR users.
     Security & Access is about who may administer THIS install. Selling the
     Reelsoo source code to other operators is a third business, with its own
     customers, its own credentials and its own support workload, so it reads
     more clearly as its own section than buried in either of those. */
  {
    label: "Marketplace",
    items: [
      /* One row, not a parent with children. Licences and Purchase Codes are
         TABS inside this single page, not separate routes - listing them as
         two nav rows would put the same href in the sidebar twice and light
         both up at once, which is the exact problem the note above this array
         describes for /verification. */
      { href: "/admin/licenses", label: "Teezer Code Purchase", icon: KeyRound },
    ],
  },
  {
    label: "Security & Access",
    items: [
      { href: "/admin/roles",    label: "Admin Roles",   icon: UserCheck },
      { href: "/admin/security", label: "2FA / Security",icon: Shield },
      { href: "/admin/logs",     label: "Audit Logs",    icon: BookOpen },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/admin/support", label: "Support Tickets", icon: HelpCircle },
    ],
  },
];

// ── Avatar ───────────────────────────────────────────────────────────────────

function AdminAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="flex-shrink-0 rounded-full bg-[#fe2c55]/10 grid place-items-center font-bold text-[#fe2c55]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {(name?.[0] ?? "A").toUpperCase()}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

/**
 * Sections a demo account never sees.
 *
 * Marketplace holds real customer licences, purchase codes and revenue - a
 * demo login handed to a prospect has no business browsing them, and unlike
 * the rest of the panel there is nothing instructive about it either.
 *
 * The server already refuses the data: every /admin/licenses endpoint sits
 * behind permission:manage_licenses, which a demo account is not granted, so
 * it 403s regardless of what the sidebar shows. This removes the row so the
 * panel does not advertise a section that would only dead-end.
 */
const DEMO_HIDDEN_GROUPS = ["Marketplace"];

function Sidebar({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [expanded, setExpanded] = useState<string[]>([]);

  const visibleGroups = user?.is_demo
    ? NAV_GROUPS.filter((g) => !DEMO_HIDDEN_GROUPS.includes(g.label))
    : NAV_GROUPS;

  /* Prefix match by default, so /users stays lit on /users/42. `exact` opts a
     row out where its own route is a prefix of a sibling's - previously this
     was a hardcoded check for /dashboard, which left the same collision
     unhandled everywhere else. */
  const isActive = (href: string, exact = false) =>
    exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");

  const isSectionActive = (item: NavItem) =>
    isActive(item.href, item.exact) ||
    (item.children?.some(c => isActive(c.href, c.exact)) ?? false);

  const toggleExpand = (href: string) =>
    setExpanded(prev =>
      prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href]
    );

  const isExpanded = (item: NavItem) =>
    expanded.includes(item.href) || isSectionActive(item);

  return (
    <aside
      className={cn(
        "flex h-full flex-col bg-white border-r border-[#e8eaed]",
        "w-[var(--sidebar-w,256px)]",
        mobile && "fixed inset-y-0 left-0 z-50 shadow-xl",
      )}
    >
      {/* Logo */}
      <div className="flex h-[var(--topbar-h,64px)] shrink-0 items-center justify-between px-5 border-b border-[#e8eaed]">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#fe2c55] text-white font-black text-sm">
            R
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#111827] leading-none">Teezer</p>
            <p className="text-[10px] text-[#fe2c55] font-semibold tracking-widest leading-none mt-0.5">ADMIN</p>
          </div>
        </div>
        {mobile && (
          <button onClick={onClose} className="text-[#6b7280] hover:text-[#111827] transition">
            <X className="h-5 w-5" />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-3 py-3 space-y-0">
        {visibleGroups.map((group, gi) => (
          <div key={gi} className={gi > 0 ? "mt-1" : ""}>
            {group.label && (
              <p className="px-3 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-[#9ca3af]">
                {group.label}
              </p>
            )}
            {group.items.map((item) => {
              const active    = isSectionActive(item);
              const expanded_ = item.children ? isExpanded(item) : false;
              const Icon      = item.icon;

              if (item.children) {
                return (
                  <div key={item.href}>
                    <button
                      onClick={() => toggleExpand(item.href)}
                      className={cn(
                        "w-full flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors",
                        active
                          ? "bg-[#fff0f4] text-[#fe2c55]"
                          : "text-[#374151] hover:bg-[#f4f5f7] hover:text-[#111827]",
                      )}
                    >
                      <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-[#fe2c55]" : "text-[#6b7280]")} />
                      <span className="flex-1 truncate text-left">{item.label}</span>
                      <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 transition-transform text-[#9ca3af]", expanded_ && "rotate-90")} />
                    </button>
                    {expanded_ && (
                      <div className="ml-3 mt-0.5 space-y-0.5 pl-4 border-l border-[#f0f0f0]">
                        {item.children.map(child => {
                          const childActive = isActive(child.href, child.exact);
                          const ChildIcon   = child.icon;
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={onClose}
                              className={cn(
                                "flex items-center gap-2.5 rounded-[8px] px-3 py-1.5 text-[12px] font-medium transition-colors",
                                childActive
                                  ? "bg-[#fff0f4] text-[#fe2c55]"
                                  : "text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#111827]",
                              )}
                            >
                              <ChildIcon className={cn("h-[14px] w-[14px] shrink-0", childActive ? "text-[#fe2c55]" : "text-[#9ca3af]")} />
                              <span className="truncate">{child.label}</span>
                            </Link>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    "flex items-center gap-3 rounded-[10px] px-3 py-2 text-[13px] font-medium transition-colors",
                    active
                      ? "bg-[#fff0f4] text-[#fe2c55]"
                      : "text-[#374151] hover:bg-[#f4f5f7] hover:text-[#111827]",
                  )}
                >
                  <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-[#fe2c55]" : "text-[#6b7280]")} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#fe2c55] px-1.5 text-[10px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Bottom user strip */}
      <div className="shrink-0 border-t border-[#e8eaed] p-3">
        <div className="flex items-center gap-2.5 rounded-[10px] p-2 hover:bg-[#f4f5f7] transition-colors">
          <AdminAvatar name={user?.name ?? "Admin"} size={34} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-[#111827]">{user?.name ?? "Admin"}</p>
            <p className="truncate text-[11px] text-[#9ca3af] capitalize">{user?.role ?? "admin"}</p>
          </div>
          <button
            onClick={() => logoutToSite(logout)}
            className="shrink-0 rounded-lg p-1.5 text-[#9ca3af] hover:bg-[#fee2e2] hover:text-[#ef4444] transition-colors"
            title="Logout"
          >
            <LogOut className="h-[15px] w-[15px]" />
          </button>
        </div>
      </div>
    </aside>
  );
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header({
  title,
  onMenuClick,
  unreadNotifs = 0,
}: {
  title: string;
  onMenuClick: () => void;
  unreadNotifs?: number;
}) {
  const { user, logout } = useAuthStore();
  const router = useRouter();
  const [profileOpen, setProfileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-10 flex h-[var(--topbar-h,64px)] shrink-0 items-center gap-3 border-b border-[#e8eaed] bg-white px-4 lg:px-6">
      <button
        className="lg:hidden text-[#6b7280] hover:text-[#111827] transition"
        onClick={onMenuClick}
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="text-[15px] font-bold text-[#111827] hidden sm:block">{title}</h1>

      {/* Search */}
      <div className="flex flex-1 items-center justify-center">
        <div className="relative w-full max-w-[360px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9ca3af] pointer-events-none" />
          <input
            type="search"
            placeholder="Search users, videos, hashtags..."
            className="h-9 w-full rounded-full border border-[#e8eaed] bg-[#f4f5f7] pl-9 pr-4 text-[13px] text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#fe2c55] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Notifications */}
        <Link
          href="/admin/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#111827] transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadNotifs > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[#fe2c55] px-0.5 text-[9px] font-bold text-white">
              {unreadNotifs > 99 ? "99+" : unreadNotifs}
            </span>
          )}
        </Link>

        {/* Separator */}
        <div className="mx-1 h-6 w-px bg-[#e8eaed]" />

        {/* Profile dropdown */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen((o) => !o)}
            className="flex items-center gap-2 rounded-[10px] px-2 py-1.5 hover:bg-[#f4f5f7] transition-colors"
          >
            <AdminAvatar name={user?.name ?? "Admin"} size={30} />
            <div className="hidden sm:block text-left">
              <p className="text-[12px] font-semibold text-[#111827] leading-tight">{user?.name ?? "Admin"}</p>
              <p className="text-[10px] text-[#9ca3af] capitalize leading-tight">{user?.role ?? "Super Admin"}</p>
            </div>
            <ChevronDown className={cn("h-3.5 w-3.5 text-[#9ca3af] transition-transform", profileOpen && "rotate-180")} />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1.5 w-48 rounded-2xl border border-[#e8eaed] bg-white p-1.5 shadow-lg">
                <div className="px-3 py-2">
                  <p className="text-[12px] font-semibold text-[#111827]">{user?.name}</p>
                  <p className="text-[11px] text-[#9ca3af]">{user?.email}</p>
                </div>
                <div className="my-1 border-t border-[#e8eaed]" />
                <Link href="/admin/settings" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                  <Settings className="h-3.5 w-3.5 text-[#9ca3af]" />
                  Settings
                </Link>
                <button
                  onClick={() => { setProfileOpen(false); logoutToSite(logout); }}
                  className="flex w-full items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] font-semibold text-[#ef4444] hover:bg-[#fee2e2] transition-colors"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

// ── Shell ────────────────────────────────────────────────────────────────────

/**
 * Signing out of the panel lands on the public site, not on a bare /admin that
 * the person no longer has access to.
 *
 * A full document navigation rather than router.push: logging out clears the
 * session, and every cached admin query and store still lives in memory until
 * the page is actually replaced. Configured host first so a panel served from
 * somewhere other than teezer.live still leaves for the right place.
 */
async function logoutToSite(logout: () => Promise<void> | void) {
  try {
    await logout();
  } finally {
    if (typeof window !== "undefined") {
      window.location.href = process.env.NEXT_PUBLIC_FRONTEND_URL ?? "/";
    }
  }
}

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  /*
   * No RequireAdmin wrapper here any more.
   *
   * In the standalone app this component wrapped itself in its own guard,
   * which made sense when it was the only thing between a visitor and the
   * panel. Inside the site, the (admin) route group's layout already wraps
   * every page in the site's RequireAdmin, so guarding again here would run
   * two different guards against two different stores for the same decision -
   * and the inner one would win, which is the wrong one now.
   */
  return (
    <>
      <div className="flex h-screen bg-[#f4f5f7] overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:shrink-0" style={{ width: "var(--sidebar-w, 256px)" }}>
          <Sidebar />
        </div>

        {/* Mobile sidebar */}
        {mobileOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <Sidebar mobile onClose={() => setMobileOpen(false)} />
          </>
        )}

        {/* Main */}
        <div className="flex flex-1 flex-col overflow-hidden">
          <Header title={title} onMenuClick={() => setMobileOpen(true)} />
          {/* Renders nothing for a normal admin; for a demo account it pins a
              read-only banner above the content and raises a toast whenever a
              write is refused. */}
          <DemoNotice />
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </>
  );
}
