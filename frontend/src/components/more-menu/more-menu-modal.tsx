"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  X, Sun, Moon, Globe, ChevronRight, ChevronDown, Check, Search,
  Settings, Lock, Shield, Bell, SlidersHorizontal, Accessibility,
  Briefcase, Bookmark, History, Megaphone, Radio,
  HelpCircle, Flag, BookOpen, Info, FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VerifiedBadge } from "@/components/ui/verified-badge";
import { useAuthStore } from "@/store/auth.store";
import { useUiStore } from "@/store/ui.store";

/* ─────────────────────────────────────────────────────────────────────────
   Language list  (25 languages)
───────────────────────────────────────────────────────────────────────── */
const LANGUAGES = [
  { code: "en", name: "English",    native: "English",           flag: "🇺🇸" },
  { code: "ne", name: "Nepali",     native: "नेपाली",             flag: "🇳🇵" },
  { code: "hi", name: "Hindi",      native: "हिन्दी",              flag: "🇮🇳" },
  { code: "zh", name: "Chinese",    native: "中文",                flag: "🇨🇳" },
  { code: "ru", name: "Russian",    native: "Русский",            flag: "🇷🇺" },
  { code: "ja", name: "Japanese",   native: "日本語",              flag: "🇯🇵" },
  { code: "ko", name: "Korean",     native: "한국어",              flag: "🇰🇷" },
  { code: "ar", name: "Arabic",     native: "العربية",            flag: "🇸🇦" },
  { code: "es", name: "Spanish",    native: "Español",            flag: "🇪🇸" },
  { code: "fr", name: "French",     native: "Français",           flag: "🇫🇷" },
  { code: "de", name: "German",     native: "Deutsch",            flag: "🇩🇪" },
  { code: "pt", name: "Portuguese", native: "Português",          flag: "🇧🇷" },
  { code: "bn", name: "Bengali",    native: "বাংলা",               flag: "🇧🇩" },
  { code: "ur", name: "Urdu",       native: "اردو",               flag: "🇵🇰" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia",   flag: "🇮🇩" },
  { code: "tr", name: "Turkish",    native: "Türkçe",             flag: "🇹🇷" },
  { code: "it", name: "Italian",    native: "Italiano",           flag: "🇮🇹" },
  { code: "th", name: "Thai",       native: "ไทย",                flag: "🇹🇭" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt",         flag: "🇻🇳" },
  { code: "ms", name: "Malay",      native: "Bahasa Melayu",      flag: "🇲🇾" },
  { code: "ta", name: "Tamil",      native: "தமிழ்",               flag: "🇮🇳" },
  { code: "te", name: "Telugu",     native: "తెలుగు",              flag: "🇮🇳" },
  { code: "mr", name: "Marathi",    native: "मराठी",               flag: "🇮🇳" },
  { code: "gu", name: "Gujarati",   native: "ગુજરાતી",             flag: "🇮🇳" },
  { code: "pa", name: "Punjabi",    native: "ਪੰਜਾਬੀ",              flag: "🇮🇳" },
];

function getLang(code: string) {
  return LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
}

/* ─────────────────────────────────────────────────────────────────────────
   Section data
───────────────────────────────────────────────────────────────────────── */
interface SectionItem {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  desc: string;
  href: string;
  requiresAuth: boolean;
  imageSrc?: string;
}

const SECTIONS: { title: string; items: SectionItem[] }[] = [
  {
    title: "Account & Preferences",
    items: [
      { icon: Settings,          iconBg: "#eff6ff", iconColor: "#3b82f6", label: "Account Settings",   desc: "Manage your profile and account",       href: "/settings/account",             requiresAuth: true },
      { icon: Lock,              iconBg: "#f0fdf4", iconColor: "#16a34a", label: "Login & Security",   desc: "Password, 2FA and security",            href: "/settings/security",            requiresAuth: true },
      { icon: Shield,            iconBg: "#f5f3ff", iconColor: "#7c3aed", label: "Privacy & Safety",   desc: "Control who can see and interact",      href: "/settings/privacy",             requiresAuth: true },
      { icon: Bell,              iconBg: "#fff7ed", iconColor: "#ea580c", label: "Notifications",      desc: "Manage alerts and updates",             href: "/settings/notifications",       requiresAuth: true },
      { icon: SlidersHorizontal, iconBg: "#f0fdf4", iconColor: "#16a34a", label: "Content Preferences", desc: "Customize your feed and content",      href: "/settings/content-preferences", requiresAuth: true },
      { icon: Accessibility,     iconBg: "#f5f3ff", iconColor: "#7c3aed", label: "Accessibility Settings", desc: "Adjust display, motion, captions, and accessibility options", href: "/settings/accessibility", requiresAuth: true },
    ],
  },
  {
    title: "Create & Engage",
    items: [
      { icon: Briefcase, iconBg: "#fff1f3", iconColor: "#fe2c55", label: "Teezer Studio", desc: "Manage creator tools and dashboard", href: "/studio", requiresAuth: true, imageSrc: "/reelsoostudior.png" },
      { icon: Megaphone, iconBg: "#fff7ed", iconColor: "#f97316", label: "Ads Manager",    desc: "Create and track your promotions",   href: "/ads-manager",      requiresAuth: true },
      { icon: Bookmark,  iconBg: "#ecfdf5", iconColor: "#059669", label: "Saved Videos",   desc: "Your bookmarked content",            href: "/settings/saved",   requiresAuth: true },
      { icon: History,   iconBg: "#eff6ff", iconColor: "#2563eb", label: "Watch History",  desc: "Videos you've watched",              href: "/settings/history", requiresAuth: true },
      { icon: Radio,     iconBg: "#f5f3ff", iconColor: "#7c3aed", label: "Live Settings",  desc: "Manage your live experience",        href: "/settings/live",    requiresAuth: true },
    ],
  },
  {
    title: "Support & Information",
    items: [
      { icon: HelpCircle, iconBg: "#eff6ff", iconColor: "#3b82f6", label: "Help Center",          desc: "Get answers and support",   href: "/settings/help",          requiresAuth: false },
      { icon: Flag,       iconBg: "#fff1f3", iconColor: "#fe2c55", label: "Report a Problem",     desc: "Flag an issue to our team", href: "/settings/report",        requiresAuth: false },
      { icon: BookOpen,   iconBg: "#f0fdf4", iconColor: "#16a34a", label: "Community Guidelines", desc: "Rules and standards",       href: "/settings/guidelines",    requiresAuth: false },
      { icon: Info,       iconBg: "#f3f4f6", iconColor: "#64748b", label: "About Teezer",        desc: "Version and credits",       href: "/settings/about",         requiresAuth: false },
      { icon: FileText,   iconBg: "#f5f3ff", iconColor: "#7c3aed", label: "Terms & Privacy",      desc: "Legal and policy info",     href: "/settings/terms-privacy", requiresAuth: false },
    ],
  },
];

/* ─────────────────────────────────────────────────────────────────────────
   Helpers
───────────────────────────────────────────────────────────────────────── */
function fmtCount(n?: number): string {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000)     return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return String(n);
}

function UserAvatar({ src, name, size }: { src?: string | null; name?: string; size: number }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? "User"}
        referrerPolicy="no-referrer"
        className="rounded-full object-cover flex-shrink-0"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="rounded-full overflow-hidden bg-white flex-shrink-0 ring-2 ring-[#f0f0f0]"
      style={{ width: size, height: size }}
    >
      <Image src="/favicon.png" alt="Teezer" width={size} height={size} className="rounded-full object-cover" priority />
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Language dropdown - portal-based so it FLOATS over content
   and never pushes layout or creates blank space.
───────────────────────────────────────────────────────────────────────── */
interface LangDropdownProps {
  selected: string;
  onSelect: (code: string) => void;
}

function LangDropdown({ selected, onSelect }: LangDropdownProps) {
  const [open, setOpen]       = useState(false);
  const [query, setQuery]     = useState("");
  const [pos, setPos]         = useState({ top: 0, right: 0 });
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropRef    = useRef<HTMLDivElement>(null);
  const searchRef  = useRef<HTMLInputElement>(null);
  const currentLang = getLang(selected);

  useEffect(() => { setPortalEl(document.body); }, []);

  /* Compute position from trigger's bounding rect */
  function handleOpen() {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setPos({
      top:   r.bottom + 8,
      right: window.innerWidth - r.right,
    });
    setOpen(true);
  }

  /* Close on outside click */
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (
        !dropRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  /* Close on Escape */
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") { setOpen(false); setQuery(""); }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  /* Auto-focus search */
  useEffect(() => {
    if (open) setTimeout(() => searchRef.current?.focus(), 60);
    else      setQuery("");
  }, [open]);

  const filtered = LANGUAGES.filter((l) => {
    const q = query.toLowerCase();
    return (
      l.name.toLowerCase().includes(q) ||
      l.native.toLowerCase().includes(q) ||
      l.code.toLowerCase().includes(q)
    );
  });

  return (
    <>
      {/* Trigger button - same height as the row, full width of its flex cell */}
      <button
        ref={triggerRef}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        className={cn(
          "flex w-full h-full items-center justify-center gap-1.5 px-3 text-[13px] font-semibold transition-all duration-200",
          open
            ? "bg-[#fff1f3] text-[#fe2c55]"
            : "text-[#6b7280] hover:bg-[#f8f9fb]",
        )}
      >
        <Globe className={cn("h-[17px] w-[17px] flex-shrink-0", open ? "text-[#fe2c55]" : "text-[#6b7280]")} />
        <span className="truncate max-w-[72px]">{currentLang.name}</span>
        <ChevronDown
          className={cn(
            "h-3 w-3 flex-shrink-0 transition-transform duration-200",
            open && "rotate-180",
          )}
        />
      </button>

      {/* ── Portal dropdown - fixed position, floats over popup ── */}
      {open && portalEl && createPortal(
        <div
          ref={dropRef}
          style={{
            position:  "fixed",
            top:       pos.top,
            right:     pos.right,
            width:     290,
            maxHeight: 340,
            zIndex:    10000,
            background: "#ffffff",
            border:    "1px solid #eeeeee",
            borderRadius: 14,
            boxShadow: "0 16px 48px rgba(15, 23, 42, 0.14), 0 4px 16px rgba(15, 23, 42, 0.08)",
            overflow:  "hidden",
            display:   "flex",
            flexDirection: "column",
          }}
        >
          {/* Search row */}
          <div style={{ padding: "10px 10px 8px", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
            <div style={{ position: "relative" }}>
              <Search
                style={{
                  position: "absolute", left: 10, top: "50%",
                  transform: "translateY(-50%)", width: 14, height: 14,
                  color: "#9ca3af", pointerEvents: "none",
                }}
              />
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search language..."
                style={{
                  width: "100%", height: 36, paddingLeft: 32, paddingRight: 10,
                  border: "1px solid #e5e7eb", borderRadius: 8,
                  background: "#f8f9fb", fontSize: 13, color: "#111827",
                  outline: "none",
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = "#fe2c55"; e.currentTarget.style.background = "#fff"; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = "#e5e7eb"; e.currentTarget.style.background = "#f8f9fb"; }}
              />
            </div>
          </div>

          {/* Language list */}
          <div className="more-popup-scroll" style={{ overflowY: "auto", flex: 1 }}>
            {filtered.length === 0 ? (
              <p style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#9ca3af" }}>
                No language found
              </p>
            ) : (
              filtered.map((lang) => {
                const isSel = lang.code === selected;
                return (
                  <button
                    key={lang.code}
                    onClick={() => { onSelect(lang.code); setOpen(false); setQuery(""); }}
                    style={{
                      width: "100%", display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", textAlign: "left", cursor: "pointer", border: "none",
                      background: isSel ? "#fff1f3" : "transparent",
                      transition: "background 0.1s",
                    }}
                    onMouseEnter={(e) => { if (!isSel) e.currentTarget.style.background = "#f8f9fb"; }}
                    onMouseLeave={(e) => { e.currentTarget.style.background = isSel ? "#fff1f3" : "transparent"; }}
                  >
                    <span style={{ fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{lang.flag}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{
                        fontSize: 13, fontWeight: 600, lineHeight: "1.2",
                        color: isSel ? "#fe2c55" : "#111827",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {lang.name}
                      </p>
                      <p style={{
                        fontSize: 11, color: "#9ca3af", lineHeight: "1.3", marginTop: 2,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {lang.native}
                      </p>
                    </div>
                    {isSel && <Check style={{ width: 15, height: 15, color: "#fe2c55", flexShrink: 0 }} />}
                  </button>
                );
              })
            )}
          </div>
        </div>,
        portalEl,
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
   Main modal
───────────────────────────────────────────────────────────────────────── */
interface MoreMenuModalProps {
  open: boolean;
  onClose: () => void;
}

export function MoreMenuModal({ open, onClose }: MoreMenuModalProps) {
  const router = useRouter();
  const { user, isAuthenticated, openAuthModal } = useAuthStore();
  const { theme, setTheme, language, setLanguage } = useUiStore();

  const [mounted,  setMounted]  = useState(false);
  const [animIn,   setAnimIn]   = useState(false);
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setPortalEl(document.body); }, []);

  useEffect(() => {
    if (open) {
      setMounted(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimIn(true)));
    } else {
      setAnimIn(false);
      const t = setTimeout(() => setMounted(false), 300);
      return () => clearTimeout(t);
    }
  }, [open]);

  /* Body scroll lock */
  useEffect(() => {
    if (!mounted) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [mounted]);

  /* Escape key */
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  function handleOverlayClick(e: React.MouseEvent) {
    if (panelRef.current && !panelRef.current.contains(e.target as Node)) onClose();
  }

  function go(href: string, requiresAuth: boolean) {
    if (requiresAuth && !isAuthenticated) { openAuthModal("login"); onClose(); return; }
    onClose();
    router.push(href);
  }

  if (!mounted || !portalEl) return null;

  const followers = user?.followers_count ?? user?.profile?.total_followers;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center p-4",
        "transition-[opacity,backdrop-filter] duration-300 ease-out",
        animIn ? "opacity-100 bg-black/50 backdrop-blur-[2px]" : "opacity-0 bg-transparent backdrop-blur-0",
      )}
      onMouseDown={handleOverlayClick}
    >
      {/* Panel */}
      <div
        ref={panelRef}
        className={cn(
          "relative flex flex-col rounded-[22px] shadow-2xl w-full",
          "transition-[opacity,transform] duration-300 ease-out",
          animIn ? "opacity-100 scale-100 translate-y-0" : "opacity-0 scale-95 translate-y-4",
          /* panel bg - respects dark mode via .bg-white override in globals.css */
          "bg-white",
        )}
        style={{
          maxWidth:  "min(740px, calc(100vw - 32px))",
          maxHeight: "calc(100vh - 24px)",
        }}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* ── Sticky header ────────────────────────────────── */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#f0f0f0]">
          <h2 className="text-[17px] font-bold text-[#111827] tracking-tight">More</h2>
          <button
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-full text-[#6b7280] hover:bg-[#f4f4f5] hover:text-[#111827] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Scrollable body ───────────────────────────────── */}
        <div className="flex-1 overflow-y-auto more-popup-scroll px-5 pb-6 pt-4">

          {/* ── Profile card ──────────────────────────────── */}
          <div className="rounded-2xl border border-[#eeeeee] bg-gradient-to-br from-[#fafafa] to-[#f5f5f5] p-4 flex items-center gap-4 mb-4">
            <div className="relative flex-shrink-0">
              <UserAvatar src={user?.avatar} name={user?.name} size={62} />
              {isAuthenticated && (
                <span className="absolute bottom-0.5 right-0.5 h-3.5 w-3.5 rounded-full bg-[#22c55e] border-2 border-white shadow-sm" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              {isAuthenticated && user ? (
                <>
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-[15px] text-[#111827] truncate leading-tight">{user.name}</p>
                    {user.is_verified && <VerifiedBadge size={15} className="flex-shrink-0" />}
                  </div>
                  <p className="text-[13px] text-[#6b7280] truncate mt-0.5">@{user.username}</p>
                  <p className="text-[12px] text-[#6b7280] mt-1">
                    <span className="font-bold text-[#111827]">{fmtCount(followers)}</span>{" "}followers
                  </p>
                </>
              ) : (
                <>
                  <p className="font-bold text-[15px] text-[#111827]">Welcome to Teezer</p>
                  <p className="text-[13px] text-[#6b7280] mt-0.5">Sign in to access your account</p>
                </>
              )}
            </div>

            {isAuthenticated && user ? (
              <Link
                href={`/profile/${user.username}`}
                onClick={onClose}
                className="flex-shrink-0 h-9 px-5 rounded-full border border-[#e2e5ea] text-[13px] font-semibold text-[#111827] hover:border-[#fe2c55] hover:text-[#fe2c55] hover:bg-[#fff1f3] transition-all flex items-center whitespace-nowrap"
              >
                Edit Profile
              </Link>
            ) : (
              <button
                onClick={() => { openAuthModal("login"); onClose(); }}
                className="flex-shrink-0 h-9 px-5 rounded-full bg-[#fe2c55] text-[13px] font-semibold text-white hover:bg-[#e0253e] active:scale-95 transition-all whitespace-nowrap shadow-sm"
              >
                Login
              </button>
            )}
          </div>

          {/* ── Theme / Language quick row ─────────────────────
               Height is FIXED at 52px - language dropdown uses a portal
               so it floats above content and never pushes layout down.
          ─────────────────────────────────────────────────────── */}
          <div
            className="rounded-2xl border border-[#eeeeee] bg-white shadow-sm mb-4 overflow-hidden"
            style={{ height: 52 }}
          >
            <div className="flex h-full">
              {/* Light Mode */}
              <button
                onClick={() => setTheme("light")}
                className={cn(
                  "flex flex-1 h-full items-center justify-center gap-2 px-3 text-[13px] font-semibold transition-all duration-200",
                  theme === "light"
                    ? "bg-[#fff1f3] text-[#fe2c55]"
                    : "text-[#6b7280] hover:bg-[#f8f9fb]",
                )}
              >
                <Sun className={cn("h-[17px] w-[17px] flex-shrink-0", theme === "light" ? "text-[#fe2c55]" : "text-[#6b7280]")} />
                <span className="whitespace-nowrap">Light Mode</span>
                {theme === "light" && (
                  <Check className="h-3.5 w-3.5 text-[#fe2c55] flex-shrink-0" strokeWidth={2.5} />
                )}
              </button>

              {/* Divider */}
              <div className="w-px bg-[#f0f0f0] self-stretch" />

              {/* Dark Mode */}
              <button
                onClick={() => setTheme("dark")}
                className={cn(
                  "flex flex-1 h-full items-center justify-center gap-2 px-3 text-[13px] font-semibold transition-all duration-200",
                  theme === "dark"
                    ? "bg-[#fff1f3] text-[#fe2c55]"
                    : "text-[#6b7280] hover:bg-[#f8f9fb]",
                )}
              >
                <Moon className={cn("h-[17px] w-[17px] flex-shrink-0", theme === "dark" ? "text-[#fe2c55]" : "text-[#6b7280]")} />
                <span className="whitespace-nowrap">Dark Mode</span>
                {theme === "dark" && (
                  <Check className="h-3.5 w-3.5 text-[#fe2c55] flex-shrink-0" strokeWidth={2.5} />
                )}
              </button>

              {/* Divider */}
              <div className="w-px bg-[#f0f0f0] self-stretch" />

              {/* Language - flex-1 wrapper; LangDropdown fills it */}
              <div className="flex-1 flex">
                <LangDropdown selected={language} onSelect={setLanguage} />
              </div>
            </div>
          </div>

          {/* ── Settings sections ─────────────────────────── */}
          <div className="space-y-4">
            {SECTIONS.map((section) => (
              <div
                key={section.title}
                className="rounded-2xl border border-[#eeeeee] bg-white shadow-sm p-3.5"
              >
                <p className="text-[11px] font-bold text-[#8b95a5] uppercase tracking-wider mb-3">
                  {section.title}
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={item.label}
                        onClick={() => go(item.href, item.requiresAuth)}
                        className="group flex items-center gap-3 rounded-[14px] border border-[#f0f0f0] bg-white p-3.5 text-left min-h-[68px] hover:bg-[#f8f9fb] hover:border-[#e5e7eb] hover:shadow-sm transition-all duration-150"
                      >
                        <span
                          className="flex-shrink-0 grid place-items-center rounded-[12px]"
                          style={{ width: 44, height: 44, background: item.iconBg, color: item.iconColor }}
                        >
                          {item.imageSrc ? (
                            <Image
                              src={item.imageSrc}
                              alt={item.label}
                              width={28}
                              height={28}
                              className="object-contain"
                            />
                          ) : (
                            <Icon className="h-5 w-5" />
                          )}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-bold text-[#111827] truncate leading-tight">
                            {item.label}
                          </p>
                          <p className="text-[12px] text-[#8b95a5] truncate mt-0.5 leading-tight">
                            {item.desc}
                          </p>
                        </div>
                        <ChevronRight className="h-4 w-4 text-[#d1d5db] flex-shrink-0 group-hover:text-[#9ca3af] group-hover:translate-x-0.5 transition-all duration-150" />
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* ── Footer ───────────────────────────────────────── */}
          <p className="mt-5 text-center text-[11px] text-[#c4c9d4] leading-relaxed">
            © 2026 Teezer ·{" "}
            <Link href="/terms"    onClick={onClose} className="hover:text-[#fe2c55] transition-colors">Terms</Link>
            {" · "}
            <Link href="/privacy"  onClick={onClose} className="hover:text-[#fe2c55] transition-colors">Privacy</Link>
            {" · "}
            <Link href="/help"     onClick={onClose} className="hover:text-[#fe2c55] transition-colors">Help</Link>
          </p>
        </div>
      </div>
    </div>,
    portalEl,
  );
}
