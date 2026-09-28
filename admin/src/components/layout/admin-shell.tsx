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
  Trophy, Ticket, Plug, Store, ClipboardCheck, Globe,
} from "lucide-react";
import { useState } from "react";
import { useAuthStore } from "@/store/auth.store";
import { cn } from "@/lib/utils";
import { RequireAdmin } from "./require-admin";

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
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard, exact: true },
    ],
  },
  {
    label: "Monitoring",
    items: [
      {
        href: "/monitoring",
        label: "Monitoring",
        icon: Activity,
        children: [
          { href: "/monitoring",          label: "System Overview", icon: Activity, exact: true },
          { href: "/health",              label: "System Health",   icon: Cpu },
          { href: "/monitoring/redis",    label: "Redis",           icon: Server },
          { href: "/monitoring/database", label: "PostgreSQL",      icon: Database },
          { href: "/monitoring/queue",    label: "Queue Jobs",      icon: Package },
          { href: "/monitoring/realtime", label: "WebSocket",       icon: Radio },
          { href: "/monitoring/logs",     label: "App Logs",        icon: BookOpen },
        ],
      },
    ],
  },
  {
    label: "Users & Creators",
    items: [
      { href: "/users",        label: "Users",         icon: Users },
      { href: "/creators",     label: "Creators",      icon: Star },
      { href: "/verification", label: "Verification",  icon: BadgeCheck },
      /* Banned Users lives here rather than under Moderation, which is the
         other place it could go. This section is where you look for a SET OF
         PEOPLE; Moderation is where you work a queue. Listed once, either way. */
      { href: "/banned",       label: "Banned Users",  icon: BanIcon },
      /* Every report a user filed against a video/comment/story/account/DM/
         live stream/Space - the full 7-type queue from AdminReportsController,
         evidence photos included. Deliberately a different route from the
         older /reports under Moderation (video+user only, no evidence) rather
         than replacing it - see that page's own comment about not touching
         a working page outside the ask. */
      { href: "/reported",     label: "Reported",      icon: Flag },
    ],
  },
  {
    label: "Teezer Shop",
    items: [
      { href: "/shop/categories",           label: "Categories",            icon: Tag },
      { href: "/shop/shops",                label: "Shops",                 icon: Store },
      { href: "/shop/applications",         label: "Applications",          icon: ClipboardCheck },
      { href: "/shop/country-requirements", label: "Country Requirements",  icon: Globe },
      { href: "/shop/promo-banners",        label: "Promo Banners",         icon: Megaphone },
      { href: "/shop/deals",                label: "Deals of the Day",      icon: Zap },
      { href: "/shop/coupons",              label: "Marketplace Coupons",   icon: Ticket },
    ],
  },
  {
    label: "Content",
    items: [
      { href: "/live",       label: "Live Streams", icon: Radio },
      { href: "/audio",      label: "Audio Rooms",  icon: Headphones },
      { href: "/comments",   label: "Comments",     icon: MessageSquare },
      { href: "/hashtags",   label: "Hashtags",     icon: Hash },
      { href: "/challenges", label: "Challenges",   icon: Trophy },
    ],
  },
  {
    label: "Music",
    items: [
      {
        href: "/music",
        label: "Music Library",
        icon: ListMusic,
        children: [
          { href: "/music",         label: "All Tracks",   icon: ListMusic, exact: true },
          { href: "/music/upload",  label: "Upload Track", icon: Upload },
          { href: "/music/artists", label: "Artists",      icon: Users2 },
          { href: "/music/albums",  label: "Albums",       icon: Disc3 },
          { href: "/music/genres",  label: "Genres",       icon: Tag },
          { href: "/music/moods",   label: "Moods",        icon: Smile },
        ],
      },
    ],
  },
  {
    label: "Monetization",
    items: [
      { href: "/monetization",    label: "Overview",              icon: CircleDollarSign, exact: true },
      { href: "/revenue",         label: "Revenue",               icon: BarChart3 },
      { href: "/transactions",    label: "Transactions",          icon: Activity },
      { href: "/payouts",         label: "Payouts",               icon: CreditCard },
      { href: "/gifts",           label: "Gifts & Coins",         icon: Gift },
      { href: "/premium-plans",   label: "Premium Subscriptions", icon: Star },
      { href: "/coupons",         label: "Coupons & Offers",      icon: Ticket },
      { href: "/payment-settings",label: "Payment Providers",     icon: CreditCard },
    ],
  },
  {
    label: "Advertising",
    items: [
      { href: "/ads-management",             label: "Overview",    icon: LayoutDashboard, exact: true },
      { href: "/ads-management/campaigns",   label: "Campaigns",   icon: Megaphone },
      { href: "/ads-management/advertisers", label: "Advertisers", icon: Users },
      { href: "/ads-management/approvals",   label: "Ad Moderation", icon: ShieldAlert },
      { href: "/ads-management/placements",  label: "Placements",  icon: Tag },
      { href: "/ads-management/fraud",       label: "Fraud",       icon: Shield },
      { href: "/ads-management/settings",    label: "Ad Settings", icon: Settings },
    ],
  },
  {
    label: "Engagement",
    items: [
      { href: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    label: "Moderation",
    items: [
      { href: "/moderation", label: "Moderation Queue", icon: ShieldAlert },
      /* Reports moved to /reported under Users & Creators (all 7 types +
         evidence) - see that nav entry's comment. /reports itself now just
         redirects there, so it isn't listed twice per the no-duplicate-route
         rule above. */
      { href: "/violations", label: "Violations",       icon: Shield },
    ],
  },
  {
    label: "Analytics",
    items: [
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
    ],
  },
  {
    label: "Settings",
    items: [
      /* Exact: /settings is a prefix of the two rows under it, so without this
         "General" stays lit while you are on Email & OTP. */
      { href: "/settings",              label: "General",      icon: Settings, exact: true },
      { href: "/settings/email",        label: "Email & OTP",  icon: Mail },
      { href: "/settings/website",      label: "Website & SEO", icon: Search },
      { href: "/settings/monetization", label: "Monetization", icon: CircleDollarSign },
      { href: "/settings/country-availability", label: "Teezer Country Availability", icon: Globe },
      { href: "/social-login",          label: "Social Login", icon: KeyRound },
      { href: "/settings/integrations", label: "Integrations", icon: Plug },
      { href: "/features",              label: "Feature Flags",icon: Zap },
      { href: "/legal",                 label: "CMS & Legal",  icon: FileText },
    ],
  },
  {
    label: "Security & Access",
    items: [
      { href: "/roles",    label: "Admin Roles",   icon: UserCheck },
      { href: "/security", label: "2FA / Security",icon: Shield },
      { href: "/logs",     label: "Audit Logs",    icon: BookOpen },
    ],
  },
  {
    label: "Support",
    items: [
      { href: "/support", label: "Support Tickets", icon: HelpCircle },
    ],
  },
];

// ── Avatar ───────────────────────────────────────────────────────────────────

function AdminAvatar({ name, size = 32 }: { name: string; size?: number }) {
  return (
    <div
      className="flex-shrink-0 rounded-full bg-[#fd4605]/10 grid place-items-center font-bold text-[#fd4605]"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
    >
      {(name?.[0] ?? "A").toUpperCase()}
    </div>
  );
}

// ── Sidebar ──────────────────────────────────────────────────────────────────

function Sidebar({ mobile = false, onClose }: { mobile?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const [expanded, setExpanded] = useState<string[]>([]);

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
          <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#fd4605] text-white font-black text-sm">
            R
          </div>
          <div>
            <p className="text-[13px] font-bold text-[#111827] leading-none">Teezer</p>
            <p className="text-[10px] text-[#fd4605] font-semibold tracking-widest leading-none mt-0.5">ADMIN</p>
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
        {NAV_GROUPS.map((group, gi) => (
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
                          ? "bg-[#fff3ec] text-[#fd4605]"
                          : "text-[#374151] hover:bg-[#f4f5f7] hover:text-[#111827]",
                      )}
                    >
                      <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-[#fd4605]" : "text-[#6b7280]")} />
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
                                  ? "bg-[#fff3ec] text-[#fd4605]"
                                  : "text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#111827]",
                              )}
                            >
                              <ChildIcon className={cn("h-[14px] w-[14px] shrink-0", childActive ? "text-[#fd4605]" : "text-[#9ca3af]")} />
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
                      ? "bg-[#fff3ec] text-[#fd4605]"
                      : "text-[#374151] hover:bg-[#f4f5f7] hover:text-[#111827]",
                  )}
                >
                  <Icon className={cn("h-[16px] w-[16px] shrink-0", active ? "text-[#fd4605]" : "text-[#6b7280]")} />
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.badge ? (
                    <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#fd4605] px-1.5 text-[10px] font-bold text-white">
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
            onClick={() => logout()}
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
            className="h-9 w-full rounded-full border border-[#e8eaed] bg-[#f4f5f7] pl-9 pr-4 text-[13px] text-[#111827] placeholder:text-[#9ca3af] outline-none focus:border-[#fd4605] focus:bg-white transition-colors"
          />
        </div>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-1.5 shrink-0">
        {/* Notifications */}
        <Link
          href="/notifications"
          className="relative grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#111827] transition-colors"
        >
          <Bell className="h-5 w-5" />
          {unreadNotifs > 0 && (
            <span className="absolute right-1 top-1 grid h-4 min-w-[16px] place-items-center rounded-full bg-[#fd4605] px-0.5 text-[9px] font-bold text-white">
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
              <div className="absolute right-0 top-full z-20 mt-1.5 w-56 rounded-2xl border border-[#e8eaed] bg-white p-1.5 shadow-lg">
                <div className="px-3 py-2">
                  <p className="text-[12px] font-semibold text-[#111827]">{user?.name}</p>
                  <p className="text-[11px] text-[#9ca3af]">{user?.email}</p>
                </div>
                <div className="my-1 border-t border-[#e8eaed]" />
                <Link href="/settings" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                  <Settings className="h-3.5 w-3.5 text-[#9ca3af]" />
                  Settings
                </Link>
                <Link href="/account/password" onClick={() => setProfileOpen(false)}
                  className="flex items-center gap-2 rounded-[8px] px-3 py-2 text-[13px] text-[#374151] hover:bg-[#f4f5f7] transition-colors">
                  <KeyRound className="h-3.5 w-3.5 text-[#9ca3af]" />
                  Change Admin Password
                </Link>
                <button
                  onClick={() => { setProfileOpen(false); logout(); }}
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

export function AdminShell({ title, children }: { title: string; children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <RequireAdmin>
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
          <main className="flex-1 overflow-y-auto p-4 lg:p-6">
            {children}
          </main>
        </div>
      </div>
    </RequireAdmin>
  );
}
