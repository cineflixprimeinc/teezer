"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronDown, Headphones, Plus, PlusCircle, Radio, Swords, Video,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/store/auth.store";


type CreateItem = {
  label: string;
  href: string;
  Icon: LucideIcon;
  iconColor: string;
  iconBg: string;
};

const items: CreateItem[] = [
  { label: "Upload Video",     href: "/upload",            Icon: Video,      iconColor: "#fe2c55", iconBg: "#fff0f3" },
  { label: "Go Live",          href: "/live/create",       Icon: Radio,      iconColor: "#8b5cf6", iconBg: "#f5f0ff" },
  { label: "Create Story",     href: "/stories/create",    Icon: PlusCircle, iconColor: "#1d8cff", iconBg: "#e7f1ff" },
  { label: "Start Audio Room", href: "/audio-room/create", Icon: Headphones, iconColor: "#fe2c55", iconBg: "#fff0f3" },
  { label: "Create PK Battle", href: "/pk-battle/create",  Icon: Swords,     iconColor: "#f97316", iconBg: "#fff7ed" },
];

export function CreateDropdown() {
  const router = useRouter();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const openAuthModal   = useAuthStore((s) => s.openAuthModal);
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const handleSelect = (href: string) => {
    setOpen(false);
    if (!isAuthenticated) { openAuthModal("login"); return; }
    router.push(href);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-[44px] items-center gap-2 rounded-2xl px-5 text-white transition active:scale-[0.97]"
        style={{
          background: "linear-gradient(135deg, #ff3b6e 0%, #fe2c55 60%, #e8194a 100%)",
          boxShadow: "0 4px 18px rgba(254,44,85,0.40), 0 1px 4px rgba(254,44,85,0.20)",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 6px 24px rgba(254,44,85,0.55), 0 2px 6px rgba(254,44,85,0.25)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.boxShadow =
            "0 4px 18px rgba(254,44,85,0.40), 0 1px 4px rgba(254,44,85,0.20)";
        }}
      >
        <Plus className="h-[18px] w-[18px] flex-shrink-0 text-white" strokeWidth={2.8} />
        <span className="text-[14px] font-bold leading-none tracking-wide">Create</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-shrink-0 opacity-80 transition-transform duration-200", open && "rotate-180")}
          strokeWidth={2.5}
        />
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-3 w-[280px] rounded-2xl border border-[#eeeeee] bg-white shadow-xl z-50 py-2"
        >
          {/* Top arrow pointing to button */}
          <span
            aria-hidden
            className="absolute -top-[7px] right-[36px] h-3 w-3 rotate-45 border-l border-t border-[#eeeeee] bg-white"
          />
          {items.map(({ label, href, Icon, iconColor, iconBg }, i) => (
            <button
              key={href}
              role="menuitem"
              onClick={() => handleSelect(href)}
              className={cn(
                "relative z-10 flex h-[62px] w-full items-center gap-3 px-4 text-left transition hover:bg-[#f8f9fb]",
                i < items.length - 1 && "border-b border-[#f0f0f0]",
              )}
            >
              <span
                className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-xl"
                style={{ background: iconBg }}
              >
                <Icon className="h-[18px] w-[18px]" style={{ color: iconColor }} strokeWidth={2.25} />
              </span>
              <span className="text-[15px] font-semibold text-[#111827]">{label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
