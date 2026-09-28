import {
  LayoutDashboard, Megaphone, Layers, MonitorPlay, Users, LayoutGrid,
  Images, Code2, Target, BookOpen, BarChart3, Workflow, CreditCard,
  UsersRound, Settings, HelpCircle, type LucideIcon,
} from "lucide-react";

export type AdsNavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Show a disclosure chevron (matches the Meta-style groups in the design). */
  group?: boolean;
};

/** The Teezer Studio · Ads Manager sidebar - every destination is a real page. */
export const adsNav: AdsNavItem[] = [
  { label: "Overview",         href: "/ads-manager",                  icon: LayoutDashboard },
  { label: "Campaigns",        href: "/ads-manager/campaigns",        icon: Megaphone, group: true },
  { label: "Ad Sets",          href: "/ads-manager/ad-sets",          icon: Layers },
  { label: "Ads",              href: "/ads-manager/ads",              icon: MonitorPlay },
  { label: "Audience",         href: "/ads-manager/audience",         icon: Users },
  { label: "Placements",       href: "/ads-manager/placements",       icon: LayoutGrid },
  { label: "Creative Library", href: "/ads-manager/creative-library", icon: Images },
  { label: "Pixel",            href: "/ads-manager/pixel",            icon: Code2, group: true },
  { label: "Conversions",      href: "/ads-manager/conversions",      icon: Target, group: true },
  { label: "Catalogs",         href: "/ads-manager/catalogs",         icon: BookOpen },
  { label: "Reports",          href: "/ads-manager/reports",          icon: BarChart3, group: true },
  { label: "Automations",      href: "/ads-manager/automations",      icon: Workflow },
  { label: "Billing",          href: "/ads-manager/billing",          icon: CreditCard, group: true },
  { label: "Account & Team",   href: "/ads-manager/account",          icon: UsersRound },
  { label: "Settings",         href: "/ads-manager/settings",         icon: Settings },
  { label: "Help Center",      href: "/ads-manager/help",             icon: HelpCircle },
];

/** Human title for the topbar, derived from the active path. */
export function adsTitleFor(pathname: string): string {
  const exact = adsNav.find((n) => n.href === pathname);
  if (exact) return exact.label;
  // Deepest matching prefix (e.g. /ads-manager/campaigns/123 → Campaigns).
  const match = adsNav
    .filter((n) => n.href !== "/ads-manager" && pathname.startsWith(n.href))
    .sort((a, b) => b.href.length - a.href.length)[0];
  return match?.label ?? "Ads Manager";
}
