"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createPortal } from "react-dom";
import {
  AlertTriangle,
  Bell,
  Bookmark,
  Clapperboard,
  Copy,
  Flag,
  History,
  Info,
  Languages,
  Link2,
  LogOut,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/store/auth.store";
import { ReportModal } from "@/components/report/ReportModal";

type MenuItem = {
  icon: React.ElementType;
  label: string;
  danger?: boolean;
  onClick: () => void;
};

type Props = {
  triggerRect: DOMRect | null;
  open: boolean;
  onClose: () => void;
  username: string;
  isOwnProfile: boolean;
};

export function ProfileMoreMenu({ triggerRect, open, onClose, username, isOwnProfile }: Props) {
  const menuRef = useRef<HTMLDivElement>(null);
  const router  = useRouter();
  const logout  = useAuthStore((s) => s.logout);
  const isAuth  = useAuthStore((s) => s.isAuthenticated);
  const openAuth = useAuthStore((s) => s.openAuthModal);
  const [reportOpen, setReportOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const go = (path: string) => {
    router.push(path);
    onClose();
  };

  const copyLink = () => {
    navigator.clipboard
      .writeText(`${window.location.origin}/profile/${username}`)
      .catch(() => {});
    onClose();
  };

  const handleLogout = async () => {
    onClose();
    try { await logout(); } catch {}
    router.push("/login");
  };

  const ownItems: MenuItem[] = [
    { icon: Settings,     label: "Account Settings", onClick: () => go("/settings/account") },
    { icon: ShieldCheck,  label: "Privacy",          onClick: () => go("/settings/privacy") },
    { icon: Bell,         label: "Notifications",    onClick: () => go("/settings/notifications") },
    { icon: Bookmark,     label: "Saved",            onClick: () => go("/settings/saved") },
    { icon: History,      label: "Watch History",    onClick: () => go("/settings/history") },
    { icon: Link2,        label: "Social Links",     onClick: () => go("/settings/social-links") },
    { icon: Languages,    label: "Language",         onClick: () => go("/settings/language") },
    { icon: Clapperboard, label: "Creator Studio",   onClick: () => go("/studio") },
    { icon: Wallet,       label: "Wallet",           onClick: () => go("/wallet") },
    { icon: Copy,         label: "Copy profile link", onClick: copyLink },
    { icon: LogOut,       label: "Log out",           danger: true, onClick: handleLogout },
  ];

  const otherItems: MenuItem[] = [
    {
      icon: Flag, label: "Report", danger: true,
      onClick: () => {
        onClose();
        if (!isAuth) { openAuth("login"); return; }
        setReportOpen(true);
      },
    },
    { icon: AlertTriangle,  label: "Block",              danger: true, onClick: onClose },
    { icon: Copy,           label: "Copy profile link",  onClick: copyLink },
    { icon: Info,           label: "About this account", onClick: onClose },
  ];

  const items = isOwnProfile ? ownItems : otherItems;

  // Anchor menu to the right edge of the trigger, clamped inside viewport.
  const menuW = 220;
  const rawLeft = triggerRect ? triggerRect.right - menuW : 0;
  const left    = Math.max(8, Math.min(rawLeft, (typeof window !== "undefined" ? window.innerWidth : 1200) - menuW - 8));
  const top     = triggerRect ? triggerRect.bottom + 6 : 0;

  return (
    <>
    {open && triggerRect && createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top,
        left,
        width: menuW,
        zIndex: 1000,
        maxHeight: "calc(100vh - 80px)",
        overflowY: "auto",
      }}
      className="hide-scrollbar rounded-2xl border border-[#eeeeee] bg-white p-1.5 shadow-[0_12px_40px_rgba(15,23,42,0.14)]"
    >
      {items.map(({ icon: Icon, label, danger, onClick }) => (
        <button
          key={label}
          type="button"
          onClick={onClick}
          className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-[13px] font-medium transition hover:bg-[#f8f9fb] ${
            danger ? "text-[#fe2c55]" : "text-black"
          }`}
        >
          <Icon
            className={`h-4 w-4 flex-shrink-0 ${danger ? "text-[#fe2c55]" : "text-[#5f6675]"}`}
          />
          {label}
        </button>
      ))}
    </div>,
    document.body,
    )}
    {reportOpen && (
      <ReportModal
        entityType="user"
        entityId={username}
        onClose={() => setReportOpen(false)}
        onSubmitted={() => toast.success("Report submitted. Thank you for keeping Teezer safe.")}
      />
    )}
    </>
  );
}
