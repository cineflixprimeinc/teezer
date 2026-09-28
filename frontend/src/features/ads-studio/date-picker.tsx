"use client";

import { useEffect, useRef, useState } from "react";
import { Calendar, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDateRange, RANGE_PRESETS, presetRange } from "./date-range";
import { shortDate } from "./format";

/** Meta-style date-range dropdown wired to the shared DateRangeProvider. */
export function DateRangePicker({ className }: { className?: string }) {
  const { range, setRange } = useDateRange();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-full border border-[#e5e7eb] bg-white px-4 py-2.5 text-[13px] font-semibold text-[#374151] transition hover:bg-[#f8f9fb]"
      >
        <Calendar className="h-4 w-4 text-[#6b7280]" />
        <span className="tabular-nums">
          {shortDate(range.from)} – {shortDate(range.to)}
        </span>
        <ChevronDown className="h-4 w-4 text-[#9ca3af]" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-40 w-52 overflow-hidden rounded-xl border border-[#eef0f3] bg-white py-1 shadow-[0_12px_40px_rgba(15,23,42,0.12)]">
          {RANGE_PRESETS.map((p) => {
            const active = p.label === range.label;
            return (
              <button
                key={p.key}
                type="button"
                onClick={() => { setRange(presetRange(p.days, p.label)); setOpen(false); }}
                className={cn(
                  "flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] transition hover:bg-[#f8f9fb]",
                  active ? "font-bold text-[#fe2c55]" : "text-[#374151]",
                )}
              >
                {p.label}
                {active && <span className="h-1.5 w-1.5 rounded-full bg-[#fe2c55]" />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
