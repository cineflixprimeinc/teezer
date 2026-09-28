"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Search } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type DropdownOption<T extends string> = {
  value:  T;
  label:  string;
  icon?:  LucideIcon;
  hint?:  string;
};

type Props<T extends string> = {
  label:     string;
  value:     T;
  options:   DropdownOption<T>[];
  onChange:  (v: T) => void;
  disabled?: boolean;
  /** When true: hides the label and removes the button border (parent card owns the border) */
  inCard?:   boolean;
};

export function Dropdown<T extends string>({ label, value, options, onChange, disabled = false, inCard = false }: Props<T>) {
  // `open` starts false, so the portal never tries to read document.body
  // during SSR - no mount-gate needed.
  const triggerRef  = useRef<HTMLButtonElement>(null);
  const menuRef     = useRef<HTMLDivElement>(null);
  const searchRef   = useRef<HTMLInputElement>(null);
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState("");
  const [coords, setCoords] = useState<{ top: number; left: number; width: number } | null>(null);

  const selected = options.find((o) => o.value === value);
  const TriggerIcon = selected?.icon;

  // Position the menu: open downward normally, upward when too close to bottom.
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const r = triggerRef.current?.getBoundingClientRect();
      if (!r) return;
      const menuH      = 260;
      const gap        = 6;
      const spaceBelow = window.innerHeight - r.bottom;
      const spaceAbove = r.top;
      // Open upward if not enough space below AND more space above
      const top = spaceBelow >= menuH + gap || spaceBelow >= spaceAbove
        ? r.bottom + gap                          // downward
        : Math.max(gap, r.top - menuH - gap);     // upward
      // Keep left within viewport
      const rawLeft = r.left;
      const menuW   = Math.max(r.width, 220);
      const left    = Math.min(rawLeft, window.innerWidth - menuW - gap);
      setCoords({ top, left: Math.max(gap, left), width: r.width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open]);

  // Reset search + auto-focus search input when dropdown opens
  useEffect(() => {
    if (open) {
      setSearch("");
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [open]);

  // Close on outside click / ESC
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div>
      {!inCard && <p className="mb-1 text-[12px] font-semibold text-black">{label}</p>}
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "flex w-full items-center gap-2 text-left text-sm text-black outline-none transition",
          inCard
            ? "h-auto bg-transparent disabled:cursor-not-allowed disabled:opacity-60"
            : "h-10 rounded-[10px] border border-[#eeeeee] bg-white px-3 hover:border-[#d4d4d4] disabled:cursor-not-allowed disabled:opacity-60",
          !inCard && open && "border-[#fd4605] ring-4 ring-[#fd4605]/10",
        )}
      >
        {TriggerIcon && <TriggerIcon className="h-4 w-4 flex-shrink-0 text-[#5f6675]" />}
        <span className="flex-1 truncate">{selected?.label ?? "Select…"}</span>
        <ChevronDown
          className={cn("h-3.5 w-3.5 flex-shrink-0 text-[#5f6675] transition-transform", open && "rotate-180")}
        />
      </button>

      {open && coords && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          style={{
            position: "fixed",
            top:   coords.top,
            left:  coords.left,
            width: Math.max(coords.width, 220),
            zIndex: 1000,
          }}
          className="flex flex-col rounded-[14px] border border-[#eeeeee] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.12)]"
        >
          {/* Search box */}
          <div className="flex-shrink-0 border-b border-[#f0f0f0] px-2.5 py-2">
            <div className="flex items-center gap-2 rounded-[8px] border border-[#eeeeee] bg-[#f8f9fb] px-2.5 py-1.5 focus-within:border-[#fd4605]">
              <Search className="h-3.5 w-3.5 flex-shrink-0 text-[#9aa1ad]" />
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search categories…"
                className="flex-1 bg-transparent text-[12px] text-black outline-none placeholder:text-[#c0c4cc]"
              />
              {search && (
                <button type="button" onClick={() => setSearch("")}
                  className="text-[#9aa1ad] hover:text-black transition text-[10px] font-bold leading-none">
                  ✕
                </button>
              )}
            </div>
          </div>

          {/* Filtered options */}
          <div className="overflow-y-auto p-1.5" style={{ maxHeight: 220 }}>
            {(() => {
              const filtered = options.filter(o =>
                o.label.toLowerCase().includes(search.toLowerCase())
              );
              if (!filtered.length) return (
                <p className="py-4 text-center text-[12px] text-[#9aa1ad]">No results for "{search}"</p>
              );
              return filtered.map((opt) => {
                const Icon = opt.icon;
                const active = opt.value === value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => { onChange(opt.value); setOpen(false); }}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[13px] transition",
                      active ? "bg-[#fff3ec] text-[#fd4605]" : "text-black hover:bg-[#f8f9fb]",
                    )}
                  >
                    {Icon && (
                      <Icon className={cn("h-4 w-4 flex-shrink-0", active ? "text-[#fd4605]" : "text-[#5f6675]")} />
                    )}
                    <span className="flex-1 truncate">
                      <span className="font-semibold leading-tight">{opt.label}</span>
                      {opt.hint && (
                        <span className="block text-[11px] font-normal leading-tight text-[#9aa1ad]">{opt.hint}</span>
                      )}
                    </span>
                    {active && <Check className="h-3.5 w-3.5 flex-shrink-0 text-[#fd4605]" strokeWidth={3} />}
                  </button>
                );
              });
            })()}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
