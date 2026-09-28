"use client";

import { cn } from "@/admin-panel/lib/utils";

/**
 * Same switch markup every admin settings page already hand-rolls inline
 * (see settings/page.tsx, settings/integrations/page.tsx) - factored out
 * here only because Global Reelsoo Control needs ~35 of them on one page,
 * not to change how it looks anywhere else.
 */
export function Toggle({
  checked,
  onChange,
  disabled = false,
  size = "md",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  size?: "sm" | "md";
}) {
  const w = size === "sm" ? "w-[38px]" : "w-[46px]";
  const h = size === "sm" ? "h-[22px]" : "h-[26px]";
  const knob = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  const onPos = size === "sm" ? "left-[19px]" : "left-[23px]";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={cn(
        "relative shrink-0 rounded-full transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-50",
        w, h,
        checked ? "bg-[#fd4605]" : "bg-[#d1d5db]",
      )}
    >
      <span
        className={cn(
          "absolute top-[3px] rounded-full bg-white shadow-sm transition-all duration-200",
          knob,
          checked ? onPos : "left-[3px]",
        )}
      />
    </button>
  );
}
