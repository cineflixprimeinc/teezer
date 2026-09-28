"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell, HelpCircle, ChevronRight, ChevronsUpDown, LogOut, Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";
import { adsService } from "@/services/ads.service";
import { AdsAuthFlow } from "@/features/auth/ads-auth-flow";
import { AdsAuthorizePage } from "./ads-authorize-page";
import { ssoService } from "@/services/sso.service";
import { Logo } from "@/components/ui/logo";
import { adsNav, adsTitleFor } from "./nav";
import { DateRangeProvider } from "./date-range";

/* ── Brand mark for the Ads sidebar ────────────────────────────────────── */
function StudioMark() {
  return (
    <Link href="/ads-manager" className="flex items-center px-1">
      <Image
        src="/teezer-logo.png"
        alt="Teezer Ads"
        width={700}
        height={140}
        priority
        unoptimized
        className="h-7 w-auto"
      />
    </Link>
  );
}

/* ── Account avatar (falls back to initials) ───────────────────────────── */
function Avatar({ src, name, size = 34 }: { src?: string | null; name?: string; size?: number }) {
  const initial = (name ?? "R").trim().charAt(0).toUpperCase();
  if (src) {
    return (
      <Image
        src={src}
        alt={name ?? "Account"}
        width={size}
        height={size}
        className="rounded-full object-cover"
        unoptimized
      />
    );
  }
  return (
    <span
      className="grid place-items-center rounded-full bg-[#fd4605] font-bold text-white"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
    >
      {initial}
    </span>
  );
}

/* ── Logged-out gate: unified Reelsoo SSO + two-option auth on the ads domain ── */
function LoginGate() {
  return (
    <main className="min-h-screen bg-[#f8f9fb] px-4 py-10">
      <div className="mx-auto flex min-h-[calc(100vh-80px)] max-w-md flex-col justify-center">
        <AdsAuthFlow initialMode="login" />
      </div>
    </main>
  );
}

/* ── Notifications / account topbar menus ──────────────────────────────── */
function TopbarMenus() {
  const { user, logout } = useAuthStore();
  const [accountOpen, setAccountOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAccountOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title="Notifications"
        className="relative grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition hover:bg-[#f1f3f5]"
      >
        <Bell className="h-[18px] w-[18px]" />
      </button>
      <a
        href="/ads-manager/help"
        title="Help Center"
        className="grid h-9 w-9 place-items-center rounded-full text-[#4b5563] transition hover:bg-[#f1f3f5]"
      >
        <HelpCircle className="h-[18px] w-[18px]" />
      </a>

      <div ref={ref} className="relative ml-1">
        <button
          type="button"
          onClick={() => setAccountOpen((o) => !o)}
          className="flex items-center gap-2.5 rounded-full py-1 pl-1 pr-2 transition hover:bg-[#f1f3f5]"
        >
          <Avatar src={user?.avatar} name={user?.name} />
          <span className="hidden text-left sm:block">
            <span className="block text-[13px] font-bold leading-tight text-[#111827]">{user?.name ?? "Account"}</span>
            <span className="block text-[11px] leading-tight text-[#9ca3af]">Teezer Ads</span>
          </span>
          <ChevronsUpDown className="hidden h-4 w-4 text-[#9ca3af] sm:block" />
        </button>

        {accountOpen && (
          <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-56 overflow-hidden rounded-xl border border-[#eef0f3] bg-white py-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
            <div className="border-b border-[#f1f3f5] px-4 py-3">
              <p className="text-[13px] font-bold text-[#111827]">{user?.name}</p>
              <p className="truncate text-[11px] text-[#9ca3af]">@{user?.username}</p>
            </div>
            <Link href="/ads-manager/account" className="block px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">Account &amp; Team</Link>
            <Link href="/ads-manager/billing" className="block px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">Billing</Link>
            <Link href="/ads-manager/settings" className="block px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">Settings</Link>
            <a href="https://teezer.live" className="block px-4 py-2.5 text-[13px] text-[#374151] hover:bg-[#f8f9fb]">Back to Teezer</a>
            <button
              type="button"
              onClick={async () => { await logout(); window.location.href = "/"; }}
              className="flex w-full items-center gap-2 border-t border-[#f1f3f5] px-4 py-2.5 text-left text-[13px] font-semibold text-[#e11d48] hover:bg-[#fff3ec]"
            >
              <LogOut className="h-4 w-4" /> Log out
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Sidebar ───────────────────────────────────────────────────────────── */
function Sidebar({ pathname }: { pathname: string }) {
  const { user } = useAuthStore();
  // The advertiser's permanent Ad Account number (same value the admin sees).
  // Provisioned/returned by /studio/ad-account, so it is identical on every login.
  const [accountNumber, setAccountNumber] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    adsService.adAccount()
      .then((d) => { if (alive) setAccountNumber(d.account_number); })
      .catch(() => { /* not critical for the shell */ });
    return () => { alive = false; };
  }, []);
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[248px] flex-col border-r border-[#eef0f3] bg-white lg:flex">
      <div className="flex h-[64px] flex-shrink-0 items-center px-4">
        <StudioMark />
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-2 more-popup-scroll">
        {adsNav.map((item) => {
          const active =
            item.href === "/ads-manager"
              ? pathname === "/ads-manager"
              : pathname === item.href || pathname.startsWith(item.href + "/");
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[14px] font-semibold transition",
                active
                  ? "bg-[#fff3ec] text-[#fd4605]"
                  : "text-[#374151] hover:bg-[#f8f9fb]",
              )}
            >
              <Icon className={cn("h-[18px] w-[18px] flex-shrink-0", active ? "text-[#fd4605]" : "text-[#6b7280]")} />
              <span className="flex-1">{item.label}</span>
              {item.group && (
                <ChevronRight className={cn("h-4 w-4", active ? "text-[#fd4605]" : "text-[#c9ced6]")} />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Account chip + switch */}
      <div className="flex-shrink-0 border-t border-[#eef0f3] p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-[#eef0f3] bg-[#fbfbfc] px-3 py-2.5">
          <Avatar src={user?.avatar} name={user?.name} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-bold text-[#111827]">{user?.name ?? "Your account"}</p>
            <p className="truncate text-[11px] text-[#9ca3af] tabular-nums">{accountNumber ?? "…"}</p>
          </div>
        </div>
        <Link
          href="/ads-manager/account"
          className="mt-2 flex w-full items-center justify-center rounded-lg border border-[#e5e7eb] bg-white py-2 text-[12px] font-semibold text-[#374151] transition hover:bg-[#f8f9fb]"
        >
          Switch Account
        </Link>
      </div>
    </aside>
  );
}

/* ── Mobile top nav (compact) ──────────────────────────────────────────── */
function MobileNav({ pathname }: { pathname: string }) {
  return (
    <div className="flex gap-1 overflow-x-auto border-b border-[#eef0f3] bg-white px-3 py-2 lg:hidden">
      {adsNav.map((item) => {
        const active = item.href === "/ads-manager" ? pathname === "/ads-manager" : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition",
              active ? "bg-[#fff3ec] text-[#fd4605]" : "text-[#6b7280] hover:bg-[#f8f9fb]",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );
}

/* ── Shell ─────────────────────────────────────────────────────────────── */
export function AdsShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAuthenticated, authReady } = useAuthStore();
  // After login, gate the dashboard behind the full-page authorization (consent).
  const [grantState, setGrantState] = useState<"loading" | "needed" | "granted">("loading");

  useEffect(() => {
    if (!isAuthenticated) return;
    let on = true;
    setGrantState("loading");
    ssoService
      .grantStatus()
      .then((r) => { if (on) setGrantState(r.granted ? "granted" : "needed"); })
      .catch(() => { if (on) setGrantState("granted"); }); // fail-open: never lock out a logged-in user
    return () => { on = false; };
  }, [isAuthenticated]);

  if (!authReady) {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f8f9fb]">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#fd4605] border-t-transparent" />
      </div>
    );
  }

  if (!isAuthenticated) return <LoginGate />;

  if (grantState === "loading") {
    return (
      <div className="grid min-h-screen place-items-center bg-[#f4f5f7]">
        <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-[#fd4605] border-t-transparent" />
      </div>
    );
  }
  if (grantState === "needed") {
    return <AdsAuthorizePage onGranted={() => setGrantState("granted")} />;
  }

  const title = adsTitleFor(pathname);

  return (
    <DateRangeProvider>
      <div className="min-h-screen bg-[#f8f9fb] text-[#111827]">
        <Sidebar pathname={pathname} />

        <div className="lg:pl-[248px]">
          {/* Topbar */}
          <header className="sticky top-0 z-30 border-b border-[#eef0f3] bg-white/95 backdrop-blur">
            <div className="flex h-[64px] items-center gap-3 px-4 lg:px-7">
              <Link href="/ads-manager" className="lg:hidden"><Logo mark /></Link>
              <h1 className="text-[18px] font-extrabold tracking-tight text-[#111827]">{title}</h1>
              <div className="ml-auto flex items-center gap-2">
                <div className="relative hidden md:block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#9ca3af]" />
                  <input
                    placeholder="Search campaigns…"
                    className="h-9 w-[220px] rounded-full border border-[#e5e7eb] bg-[#f8f9fb] pl-9 pr-3 text-[13px] outline-none transition focus:border-[#fd4605] focus:bg-white"
                  />
                </div>
                <TopbarMenus />
              </div>
            </div>
            <MobileNav pathname={pathname} />
          </header>

          <main className="px-4 py-6 lg:px-7 lg:py-8">
            <div className="mx-auto max-w-[1320px]">{children}</div>
          </main>
        </div>
      </div>
    </DateRangeProvider>
  );
}
