import {
  Bell, CircleUser, Home, MoreHorizontal, Search, UserPlus,
} from "lucide-react";
import {
  UploadNavIcon, MessageNavIcon, LiveNavIcon,
} from "@/components/icons/nav-icons";

// For You/Explore/Profile back to their original lucide icons (Home/Search/
// CircleUser, as they were before 51aecc65's custom-SVG swap) per direction -
// Live/Upload/Messages deliberately keep their current custom icons.
export const mainNav = [
  { href: "/",           label: "For You",   icon: Home,           requiresAuth: false },
  { href: "/explore",    label: "Explore",   icon: Search,         requiresAuth: false },
  { href: "/following",  label: "Following", icon: UserPlus,       requiresAuth: true  },
  { href: "/live",       label: "Live",      icon: LiveNavIcon,    requiresAuth: false },
  { href: "/messages",   label: "Messages",  icon: MessageNavIcon, requiresAuth: true  },
  { href: "/activity",   label: "Activity",  icon: Bell,           requiresAuth: true  },
  { href: "/upload",     label: "Upload",    icon: UploadNavIcon,  requiresAuth: true  },
  { href: "/profile/me", label: "Profile",   icon: CircleUser,     requiresAuth: true  },
  { href: "/more",       label: "More",      icon: MoreHorizontal, requiresAuth: false },
];

export const userSettingsGroups = [
  {
    title: "ACCOUNT & PREFERENCES",
    items: [
      ["Account Settings", "/settings/account"],
      ["Privacy & Safety", "/settings/privacy"],
      ["Language & Translation", "/settings/language"],
      ["Notifications", "/settings/notifications"],
      ["Content Preferences", "/settings/content"],
      ["Social Links", "/settings/social-links"],
    ],
  },
  {
    title: "CREATE & ENGAGE",
    items: [
      ["Apply for Creator", "/studio"],
      ["Saved Videos", "/settings/saved"],
      ["Watch History", "/settings/history"],
    ],
  },
  {
    title: "WALLET & PREMIUM",
    items: [
      ["Wallet / Coins / Rewards", "/wallet"],
      ["Premium / Subscription", "/premium"],
      ["Ads Manager", "/studio/promote"],
    ],
  },
];

export const studioNav = [
  ["Overview", "/studio"], ["Content", "/studio/content"], ["Audio", "/studio/audio"],
  ["Comments", "/studio/comments"], ["Analytics", "/studio/analytics"], ["Monetization", "/studio/monetization"],
  ["Verification", "/studio/verification"], ["Promote", "/studio/promote"], ["Settings", "/studio/settings"],
];
