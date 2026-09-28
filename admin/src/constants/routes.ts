import {
  BarChart3, Bell, BookOpen, CircleDollarSign, Clapperboard,
  Compass, Headphones, LayoutDashboard, MessageSquare, Radio,
  Scale, Settings, Shield, Users, Video,
} from "lucide-react";

export const adminNav = [
  { href: "/dashboard",    label: "Dashboard",       icon: LayoutDashboard },
  { href: "/users",        label: "Users",           icon: Users },
  { href: "/content",      label: "Content",         icon: Video },
  { href: "/moderation",   label: "Moderation",      icon: Shield },
  { href: "/verification", label: "Verification",    icon: Clapperboard },
  { href: "/monetization", label: "Monetization",    icon: CircleDollarSign },
  { href: "/ads",          label: "Ads Manager",     icon: BarChart3 },
  { href: "/audio",        label: "Audio Library",   icon: Headphones },
  { href: "/live",         label: "Live Center",     icon: Radio },
  { href: "/comments",     label: "Comments",        icon: MessageSquare },
  { href: "/notifications",label: "Notifications",   icon: Bell },
  { href: "/analytics",    label: "Analytics",       icon: Compass },
  { href: "/support",      label: "Support",         icon: MessageSquare },
  { href: "/settings",     label: "App Settings",    icon: Settings },
  { href: "/legal",        label: "Legal & Policies",icon: Scale },
  { href: "/roles",        label: "Admin Roles",     icon: Shield },
  { href: "/logs",         label: "System Logs",     icon: BookOpen },
];
