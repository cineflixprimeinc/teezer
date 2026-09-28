"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
import { Toaster } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { AuthModal } from "@/features/auth/auth-modal";
import { AuthDeepLink } from "@/components/auth/auth-deep-link";
import { CallProvider } from "@/features/calls/call-provider";
import { A11yApplier } from "@/features/a11y/applier";
import { DemoAccountNotice } from "@/features/auth/demo-account-notice";
import { AlertTriangle, Check, Info, LogOut, MessageCircle, X } from "lucide-react";
import { NotifyIconChip } from "@/lib/notify";

function SuspensionBanner({ reason, onLogout }: { reason?: string | null; onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-500/15 border-2 border-red-500/30">
          <AlertTriangle size={40} className="text-red-400" />
        </div>
        <h1 className="text-[22px] font-black text-white mb-2">Account Suspended</h1>
        <p className="text-[14px] text-gray-400 mb-4">
          Your Teezer account has been temporarily suspended by our moderation team.
        </p>
        {reason && (
          <div className="rounded-2xl bg-red-950/50 border border-red-500/20 px-5 py-4 mb-5 text-left">
            <p className="text-[11px] font-semibold text-red-400 uppercase tracking-wider mb-1">Reason</p>
            <p className="text-[13px] text-gray-300 leading-relaxed">{reason}</p>
          </div>
        )}
        <p className="text-[12px] text-gray-500 mb-6">
          If you believe this is a mistake, please contact our support team at{" "}
          <a href="mailto:support@teezer.live" className="text-blue-400 underline">support@teezer.live</a>
        </p>
        <div className="flex gap-3 justify-center">
          <a href="mailto:support@teezer.live"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition-colors">
            <MessageCircle size={15} /> Contact Support
          </a>
          <button onClick={onLogout}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 text-[13px] font-semibold transition-colors">
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function BannedScreen({ onLogout }: { onLogout: () => void }) {
  return (
    <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-black/95 backdrop-blur-sm p-6">
      <div className="w-full max-w-md text-center">
        <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-red-600/15 border-2 border-red-600/30">
          <AlertTriangle size={40} className="text-red-500" />
        </div>
        <h1 className="text-[22px] font-black text-white mb-2">Account Banned</h1>
        <p className="text-[14px] text-gray-400 mb-6">
          Your account has been permanently banned for violating Teezer&apos;s Community Guidelines.
        </p>
        <div className="flex gap-3 justify-center">
          <a href="mailto:support@teezer.live"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-semibold transition-colors">
            <MessageCircle size={15} /> Appeal Decision
          </a>
          <button onClick={onLogout}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-gray-700 text-gray-300 hover:bg-gray-800 text-[13px] font-semibold transition-colors">
            <LogOut size={15} /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}

function AccountStatusGuard({ children }: { children: React.ReactNode }) {
  const user    = useAuthStore((s) => s.user);
  const logout  = useAuthStore((s) => s.logout);
  const isAuth  = useAuthStore((s) => s.isAuthenticated);
  const ready   = useAuthStore((s) => s.authReady);

  if (!ready || !isAuth || !user) return <>{children}</>;
  if (user.is_banned)                return <BannedScreen onLogout={logout} />;
  if (user.is_active === false)      return <SuspensionBanner reason={user.ban_reason} onLogout={logout} />;
  return <>{children}</>;
}

/**
 * Sonner's own built-in success/error/warning/info icons, replaced with the
 * same NotifyIconChip lib/notify.tsx's action-category toasts use (save,
 * comment-deleted, video-deleted, ...) - one shared chip component so
 * EVERY toast in the app, typed or custom-category, reads as one visual
 * language ("Notification Bar") rather than several toast styles bolted
 * together. Colors match the left accent bar set in globals.css
 * ([data-type='success'] etc.).
 */
const TOAST_ICONS = {
  success: <NotifyIconChip Icon={Check}         bg="#16a34a" />,
  error:   <NotifyIconChip Icon={X}             bg="#e11d48" />,
  warning: <NotifyIconChip Icon={AlertTriangle} bg="#d97706" />,
  info:    <NotifyIconChip Icon={Info}          bg="#2563eb" />,
};

export function AppProviders({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
  }));
  const fetchMe = useAuthStore((s) => s.fetchMe);
  const expireSession = useAuthStore((s) => s.expireSession);

  useEffect(() => {
    fetchMe().catch(() => undefined);
    window.addEventListener("teezer:unauthorized", expireSession);
    return () => window.removeEventListener("teezer:unauthorized", expireSession);
  }, [fetchMe, expireSession]);

  return (
    <QueryClientProvider client={client}>
      <CallProvider>
        <AccountStatusGuard>
          {children}
        </AccountStatusGuard>
      </CallProvider>
      <Suspense fallback={null}><AuthDeepLink /></Suspense>
      {/* Applies saved Accessibility Settings (text size, contrast, motion…) globally. */}
      <A11yApplier />
      {/* Explains refused uploads to a demo account. Renders nothing for
          everyone else. */}
      <DemoAccountNotice />
      <Toaster
        // Bottom-right (not top-right): the top-right corner is where the
        // brand mark/other fixed page chrome sits, which the old top-right
        // toasts partly overlapped. Bottom-right is clear on every page.
        position="bottom-right"
        closeButton
        icons={TOAST_ICONS}
        gap={10}
        offset={24}
        toastOptions={{
          duration: 4000,
          classNames: {
            toast:       "teezer-toast",
            title:       "teezer-toast-title",
            description: "teezer-toast-description",
            closeButton: "teezer-toast-close",
            icon:        "teezer-toast-icon",
          },
        }}
        className="teezer-toaster"
      />
      <AuthModal />
    </QueryClientProvider>
  );
}
