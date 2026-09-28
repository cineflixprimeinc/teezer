import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/admin-panel/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger" | "warning" | "success";
  size?: "sm" | "md" | "lg";
};

export function Button({ className, variant = "primary", size = "md", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex items-center justify-center gap-1.5 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 rounded-[10px]",
        size === "sm" && "h-8 px-3 text-[12px]",
        size === "md" && "h-9 px-4 text-[13px]",
        size === "lg" && "h-11 px-6 text-[14px]",
        variant === "primary" && "bg-[#fd4605] text-white hover:bg-[#e03e04]",
        variant === "outline" && "border border-[#e8eaed] bg-white text-[#374151] hover:bg-[#f4f5f7]",
        variant === "ghost"   && "text-[#6b7280] hover:bg-[#f4f5f7] hover:text-[#111827]",
        variant === "danger"  && "bg-red-50 text-red-600 hover:bg-red-100",
        variant === "warning" && "bg-amber-50 text-amber-700 hover:bg-amber-100",
        variant === "success" && "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
        className,
      )}
      {...props}
    />
  );
}
