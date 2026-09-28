"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowLeft, Search,
} from "lucide-react";
import { Logo } from "@/components/ui/logo";
import { UserAvatarDropdown } from "@/components/topbar/user-avatar-dropdown";
import { SearchDropdown } from "@/components/search/search-dropdown";
import { SearchDrawer }   from "@/components/search/search-drawer";
import { MoreMenuModal } from "@/components/more-menu/more-menu-modal";
import { cn } from "@/lib/utils";
import { mainNav } from "@/constants/routes";
import { maybeSendHeartbeat } from "@/services/country.service";
import { messageService } from "@/services/message.service";
import { api } from "@/services/api";
import { ActivityDrawer } from "@/components/notifications/activity-drawer";
import { useAuthStore } from "@/store/auth.store";
import { startNotificationStream, onNotificationEvent } from "@/services/realtime/notification-stream";
import { useHydrated } from "@/hooks/use-hydrated";


/* navBadges is now built dynamically from API - see useUnreadMessages hook below */

/**
 * Nav placeholders shown until the auth state is actually known.
 *
 * Two entries (Messages / Activity) are hidden from guests, and on the
 * server every visitor looks like a guest - so the real nav renders short, then
 * grows by two rows the moment fetchMe() resolves. That pop-in is the layout
 * shift users see on refresh. Rendering a fixed-height skeleton of mainNav.length
 * rows reserves the final (logged-in) height up front, so the real nav swaps in
 * without moving anything.
 *
 * Keys are stable module constants rather than array indices computed per render.
 */
const NAV_SKELETON_KEYS = Array.from({ length: mainNav.length }, (_, i) => `nav-sk-${i}`);

/**
 * Full-width sidebar rows: icon + label.
 *
 * The row's class list mirrors the real nav row's structural classes exactly (see
 * `sharedClass` in the nav below) so the placeholder occupies identical height.
 * An approximation here reintroduces the very layout shift this exists to remove.
 */
function SidebarNavSkeleton() {
  return (
    <>
      {NAV_SKELETON_KEYS.map((k) => (
        <div
          key={k}
          aria-hidden
          className="flex h-[46px] w-full items-center gap-4 rounded-[12px] px-3 text-[15px] font-semibold leading-none"
        >
          <span className="h-[22px] w-[22px] flex-shrink-0 rounded-md bg-[#f1f2f4] animate-pulse" />
          <span className="h-[12px] w-[88px] rounded bg-[#f1f2f4] animate-pulse" />
        </div>
      ))}
    </>
  );
}

/** Collapsed icon rail: circles only, matching the 40px icon buttons. */
function RailNavSkeleton() {
  return (
    <>
      {NAV_SKELETON_KEYS.map((k) => (
        <span key={k} aria-hidden className="h-10 w-10 flex-shrink-0 rounded-full bg-[#f1f2f4] animate-pulse" />
      ))}
    </>
  );
}

/** Shown while the live API is loading, or if it errors. */

export function AppShell({ children, feedMode = false, backTitle, onBack, transparentHeader = false }: { children: React.ReactNode; feedMode?: boolean; backTitle?: string; onBack?: () => void; transparentHeader?: boolean }) {
  const pathname = usePathname();
  const router   = useRouter();
  const hydrated = useHydrated();
  const {
    user, isAuthenticated, authReady, isLoading: authLoading, openAuthModal,
  } = useAuthStore();
  /* Auth is only genuinely KNOWN once we're past hydration (the server can't read
     localStorage, so authReady is unavoidably true there) and fetchMe() has
     finished verifying any stored token. */
  const authResolved = hydrated && authReady && !authLoading;
  const [moreMenuOpen,   setMoreMenuOpen]   = useState(false);
  const [searchOpen,     setSearchOpen]     = useState(false);
  const [activityOpen,   setActivityOpen]   = useState(false);
  const [msgUnread,      setMsgUnread]      = useState(0);
  const [activityUnread, setActivityUnread] = useState(0);

  /* Poll unread message count every 5 seconds for real-time feel */
  useEffect(() => {
    if (!isAuthenticated) { setMsgUnread(0); return; }
    let cancelled = false;
    const refresh = async () => {
      try { const n = await messageService.unreadCount(); if (!cancelled) setMsgUnread(n.count); } catch { /* silent */ }
    };
    refresh();
    const iv = setInterval(refresh, 5000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAuthenticated]);

  /* Clear badge instantly when user opens the Messages page */
  useEffect(() => {
    if (pathname === "/messages") setMsgUnread(0);
  }, [pathname]);

  /* Notification unread count.
   *
   * Two sources, deliberately: the realtime stream below moves the badge the
   * instant something happens, and this poll re-baselines it against the server
   * every 30s. The poll is what covers a dropped connection, an event that
   * arrived while the tab was asleep, and reads performed on another device -
   * realtime is the delivery mechanism, the API stays the source of truth. */
  useEffect(() => {
    if (!isAuthenticated) { setActivityUnread(0); return; }
    let cancelled = false;
    const refresh = async () => {
      try {
        const { data } = await api.get("/notifications/unread-count");
        if (!cancelled) setActivityUnread(data.data?.count ?? 0);
      } catch { /* silent */ }
    };
    refresh();
    const iv = setInterval(refresh, 30000);
    return () => { cancelled = true; clearInterval(iv); };
  }, [isAuthenticated]);

  /* The session's ONE notification subscription, held here because the shell is
   * mounted on every page. It used to live inside the activity drawer, which
   * meant realtime notifications only existed while that drawer was open - so a
   * like that happened while the user was on the feed was delivered to the
   * browser and thrown away, and the row only surfaced when something later
   * refetched the list. That is the bug this fixes. */
  const authUserId = user?.id;
  useEffect(() => {
    if (!isAuthenticated || !authUserId) return;
    return startNotificationStream(authUserId);
  }, [isAuthenticated, authUserId]);

  /* Badge follows the stream with no request of its own.
   *
   * Teezer's unread semantics are one unread GROUP = one card, so a brand new
   * group is +1 and a withdrawn one is -1, while an `update` (another person
   * liking the same video) leaves the count alone because that group is already
   * counted. An update that arrives for a group the server had already marked
   * read is likewise not a new unread. */
  useEffect(() => {
    if (!isAuthenticated) return;
    return onNotificationEvent((e) => {
      if (e.kind === "new" && e.notification?.is_read !== true) {
        setActivityUnread((n) => n + 1);
      } else if (e.kind === "remove") {
        setActivityUnread((n) => Math.max(0, n - 1));
      }
    });
  }, [isAuthenticated]);


  /** Click handler for sidebar nav items that may require auth. */
  function handleNavClick(
    e: React.MouseEvent,
    item: { href: string; requiresAuth: boolean; label: string },
  ) {
    if (!item.requiresAuth) return; // plain Link handles it
    e.preventDefault();
    if (!isAuthenticated) {
      openAuthModal("login");
      return;
    }
    // Activity → open the slide-in drawer (same as search)
    if (item.href === "/activity") {
      setSearchOpen(false);
      setActivityOpen(true);
      return;
    }
    // Profile → go to the real user's profile, not the literal "/profile/me"
    if (item.href === "/profile/me") {
      router.push(`/profile/${user?.username ?? "me"}`);
    } else {
      router.push(item.href);
    }
  }

  /* Country module: send a once-per-day detection heartbeat for the 60-day
     continuous-verification counter. No-op for guests or when already sent
     today (deduped via localStorage). */
  useEffect(() => {
    if (!isAuthenticated) return;
    maybeSendHeartbeat();
  }, [isAuthenticated]);

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Left sidebar - collapses to 72 px icon rail when search or activity drawer is open */}
      <aside
        className="fixed inset-y-0 left-0 z-[41] hidden flex-col overflow-y-auto border-r border-[#eeeeee] bg-white lg:flex more-popup-scroll"
        style={{
          width:   (searchOpen || activityOpen) ? "72px" : "var(--sidebar-w)",
          padding: (searchOpen || activityOpen) ? "12px 4px" : "12px 16px",
        }}
      >
        {(searchOpen || activityOpen) ? (
          /* ── Compact icon rail ── */
          <div className="flex flex-col items-center gap-0.5 flex-1">
            <Link
              href="/"
              onClick={() => { setSearchOpen(false); setActivityOpen(false); }}
              className="mb-4 flex items-center justify-center flex-shrink-0"
            >
              <Logo mark />
            </Link>

            {/* Search icon - active when searchOpen, click closes/toggles search */}
            <button
              type="button"
              onClick={() => { setActivityOpen(false); setSearchOpen(o => !o); }}
              title={searchOpen ? "Close search" : "Search"}
              aria-label={searchOpen ? "Close search" : "Search"}
              className={cn(
                "mb-1 grid h-10 w-10 place-items-center rounded-full transition cursor-pointer",
                searchOpen
                  ? "bg-[rgba(253,70,5,0.10)] text-[#fd4605] hover:bg-[rgba(253,70,5,0.18)]"
                  : "text-[#111827] hover:bg-[#f8f9fb]",
              )}
            >
              <Search className="h-[22px] w-[22px]" strokeWidth={2.5} />
            </button>

            {/* Icon-only nav - skeleton until auth is known, so the three
                auth-only icons don't pop in a moment after refresh. */}
            {!authResolved ? <RailNavSkeleton /> : mainNav.map((item) => {
              if (item.href === "/messages" && !isAuthenticated) return null;
              if (item.href === "/activity" && !isAuthenticated) return null;
              const resolvedHref = (item.href === "/profile/me" && isAuthenticated && user?.username)
                ? `/profile/${user.username}`
                : item.href;
              const active =
                pathname === resolvedHref ||
                (resolvedHref !== "/" && pathname.startsWith(resolvedHref));
              const isActivityActive = item.href === "/activity" && activityOpen;
              const Icon = item.icon;
              const railBadge =
                item.href === "/messages" ? (msgUnread > 0 ? msgUnread : 0) :
                item.href === "/activity" ? (activityUnread > 0 ? activityUnread : 0) : 0;
              const iconBtnCls = cn(
                "relative grid h-10 w-10 place-items-center rounded-full transition hover:bg-[#f8f9fb] cursor-pointer",
                (active || isActivityActive) ? "text-[#fd4605]" : "text-[#111827]",
                isActivityActive && "bg-[rgba(253,70,5,0.10)] hover:bg-[rgba(253,70,5,0.18)]",
              );
              function closeDrawers() { setSearchOpen(false); setActivityOpen(false); }
              if (item.href === "/more") {
                return (
                  <button
                    key={item.href}
                    type="button"
                    title={item.label}
                    onClick={() => { closeDrawers(); setMoreMenuOpen(true); }}
                    className={cn(iconBtnCls, moreMenuOpen && "text-[#fd4605]")}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={2.5} />
                  </button>
                );
              }
              if (item.href === "/activity") {
                return (
                  <button
                    key={item.href}
                    type="button"
                    title={item.label}
                    onClick={() => {
                      if (activityOpen) { setActivityOpen(false); return; }
                      if (!isAuthenticated) { openAuthModal("login"); return; }
                      setSearchOpen(false);
                      setActivityOpen(true);
                    }}
                    className={iconBtnCls}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    {railBadge > 0 && (
                      <span className="absolute right-0.5 top-0.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-[#fd4605] px-0.5 text-[9px] font-bold text-white">
                        {railBadge > 99 ? "99+" : railBadge}
                      </span>
                    )}
                  </button>
                );
              }
              if (item.requiresAuth) {
                return (
                  <button
                    key={item.href}
                    type="button"
                    title={item.label}
                    onClick={(e) => { closeDrawers(); handleNavClick(e, item); }}
                    className={iconBtnCls}
                  >
                    <Icon className="h-[22px] w-[22px]" strokeWidth={2.5} />
                    {railBadge > 0 && (
                      <span className="absolute right-0.5 top-0.5 grid h-[16px] min-w-[16px] place-items-center rounded-full bg-[#fd4605] px-0.5 text-[9px] font-bold text-white">
                        {railBadge > 99 ? "99+" : railBadge}
                      </span>
                    )}
                  </button>
                );
              }
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  onClick={closeDrawers}
                  className={iconBtnCls}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={2.5} />
                </Link>
              );
            })}
          </div>
        ) : (
          /* ── Full sidebar ── */
          <>
            <Link href="/" className="mb-3 flex items-center flex-shrink-0">
              <Logo />
            </Link>

            {/* Search trigger - opens TikTok-style drawer */}
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              className="mb-3 flex h-[42px] w-full flex-shrink-0 items-center gap-2.5 rounded-full border border-[#e5e7eb] bg-[#f8f9fb] px-3.5 text-[14px] text-[#9ca3af] hover:border-[#fd4605] hover:bg-white transition-colors cursor-pointer"
            >
              <Search className="h-4 w-4 flex-shrink-0 text-[#6b7280]" strokeWidth={2.5} />
              <span>Search...</span>
            </button>

            <nav className="space-y-0.5 flex-shrink-0">
              {/* Skeleton until auth is known - Messages / Activity are
                  hidden from guests, so rendering the real list too early makes
                  the nav grow by two rows a moment after refresh. */}
              {!authResolved ? <SidebarNavSkeleton /> : mainNav.map((item) => {
                if (item.href === "/messages" && !isAuthenticated) return null;
                if (item.href === "/activity" && !isAuthenticated) return null;
                const resolvedHref = (item.href === "/profile/me" && isAuthenticated && user?.username)
                  ? `/profile/${user.username}`
                  : item.href;
                const active =
                  pathname === resolvedHref ||
                  (resolvedHref !== "/" && pathname.startsWith(resolvedHref));
                const Icon = item.icon;
                const badge =
                  item.href === "/messages" ? (msgUnread > 0 ? msgUnread : 0) :
                  item.href === "/activity" ? (activityUnread > 0 ? activityUnread : 0) : 0;
                const sharedClass = cn(
                  "flex h-[46px] w-full items-center gap-4 rounded-[12px] px-3 text-[15px] font-semibold text-[#111827] transition hover:bg-[#f8f9fb] cursor-pointer",
                  active && "bg-[#fff3ec] text-[#fd4605] hover:bg-[#fff3ec]",
                );
                const iconEl = (
                  <span className="relative">
                    <Icon
                      className={cn("h-[22px] w-[22px]", active ? "text-[#fd4605]" : "text-[#111827]")}
                      strokeWidth={2.5}
                    />
                    {badge ? (
                      <span className="absolute -right-2 -top-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-[#fd4605] px-1 text-[10px] font-bold text-white">
                        {badge}
                      </span>
                    ) : null}
                  </span>
                );
                if (item.href === "/more") {
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={() => setMoreMenuOpen(true)}
                      className={cn(sharedClass, moreMenuOpen && "bg-[#fff3ec] text-[#fd4605] hover:bg-[#fff3ec]")}
                    >
                      {iconEl}
                      {item.label}
                    </button>
                  );
                }
                if (item.requiresAuth) {
                  return (
                    <button
                      key={item.href}
                      type="button"
                      onClick={(e) => handleNavClick(e, item)}
                      className={sharedClass}
                    >
                      {iconEl}
                      {item.label}
                    </button>
                  );
                }
                return (
                  <Link key={item.href} href={item.href} className={sharedClass}>
                    {iconEl}
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            {/* Guest login prompt - shown only once the visitor is CONFIRMED
                unauthenticated. `hydrated` keeps it out of the server-rendered
                HTML (where authReady is unavoidably true, since localStorage
                isn't readable there); authReady then covers the client window
                while fetchMe() verifies a stored token. Without both, this
                flashes for every logged-in user on refresh. */}
            {hydrated && authReady && !isAuthenticated && (
              <div className="mt-3 flex-shrink-0 rounded-[14px] border border-[#eeeeee] bg-white px-4 py-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)]">
                <p className="text-[13px] font-semibold text-black">Log in to Teezer</p>
                <p className="mt-0.5 text-[11px] text-[#5f6675]">Follow creators, like videos, and get your personalized feed.</p>
                <div className="mt-3 flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => openAuthModal("login")}
                    className="flex h-9 w-full items-center justify-center rounded-full bg-[#fd4605] text-[13px] font-bold text-white hover:bg-[#e03e04] transition cursor-pointer"
                  >
                    Log in
                  </button>
                  <button
                    type="button"
                    onClick={() => openAuthModal("signup")}
                    className="flex h-9 w-full items-center justify-center rounded-full border border-[#e5e7eb] bg-white text-[13px] font-bold text-black hover:bg-[#f8f9fb] transition cursor-pointer"
                  >
                    Sign up
                  </button>
                </div>
              </div>
            )}

            <p className="mt-auto pt-2 text-center text-[10px] leading-relaxed text-[#5f6675] flex-shrink-0">
              © 2026 Teezer ·{" "}
              <Link href="/terms" className="hover:text-black transition">Terms</Link>{" · "}
              <Link href="/privacy" className="hover:text-black transition">Privacy</Link>{" · "}
              <Link href="/help" className="hover:text-black transition">Help</Link>
            </p>
          </>
        )}
      </aside>

      {/* Top header - height pinned to --topbar-h, offset by --sidebar-w on lg+ */}
      <header
        className={cn("lg:pl-[var(--sidebar-w)]", transparentHeader ? "bg-transparent" : "sticky top-0 z-20 bg-white/95 backdrop-blur", feedMode && "xl:hidden")}
      >
        <div
          className="flex items-center px-3 lg:px-6"
          style={{ height: "var(--topbar-h)" }}
        >

          {backTitle ? (
            /* Back-navigation mode: ← Title fills left side */
            <div className="flex flex-1 items-center min-w-0">
              <button
                type="button"
                onClick={onBack}
                className="mr-1 grid h-9 w-9 shrink-0 place-items-center rounded-full transition-colors hover:bg-[#f1f1f2]"
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5 text-[#111827]" strokeWidth={2.5} />
              </button>
              <span className="text-[15px] font-semibold text-[#111827] truncate">{backTitle}</span>
            </div>
          ) : transparentHeader ? null : (
            <>
              {/* Mobile-only logo - hidden when sidebar is visible */}
              <Link href="/" className="lg:hidden flex-shrink-0 mr-3"><Logo mark /></Link>

              {/* Search bar - mobile only; desktop uses sidebar search */}
              <div className="flex flex-1 items-center justify-center px-3 sm:px-5 min-w-0 lg:hidden">
                <div className="w-full" style={{ maxWidth: "clamp(280px, 34vw, 560px)" }}>
                  <SearchDropdown />
                </div>
              </div>
            </>
          )}

          {/* Right-side actions */}
          <div className={cn("flex items-center gap-3 flex-shrink-0", !backTitle && "lg:ml-auto", transparentHeader && "sticky top-3 z-20")}>
            <UserAvatarDropdown />
          </div>
        </div>
      </header>

      {/* feedMode desktop actions - the header above is hidden on xl, and the
          old right sidebar (which held these) was removed, so float the
          profile control in the top-right corner on xl+. */}
      {feedMode && !backTitle && (
        <div className="hidden xl:flex items-center gap-3 fixed top-3 right-6 z-30">
          <UserAvatarDropdown />
        </div>
      )}

      <main className="lg:pl-[var(--sidebar-w)]">{children}</main>

      <MoreMenuModal  open={moreMenuOpen}   onClose={() => setMoreMenuOpen(false)} />
      <SearchDrawer   open={searchOpen}     onClose={() => setSearchOpen(false)} />
      <ActivityDrawer
        open={activityOpen}
        onClose={() => setActivityOpen(false)}
        onUnreadChange={setActivityUnread}
        authoritativeUnread={activityUnread}
      />
    </div>
  );
}

