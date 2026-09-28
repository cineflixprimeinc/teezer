import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "outline" | "ghost" | "danger";
};

export function Button({ className, variant = "primary", ...props }: Props) {
  return (
    <button
      className={cn(
        "inline-flex h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
        variant === "primary" && "bg-[#fe2c55] text-white shadow-sm shadow-[#fe2c55]/20 hover:bg-[#e0243d]",
        variant === "outline" && "border border-[#eeeeee] bg-white text-black hover:border-[#fe2c55] hover:text-[#fe2c55]",
        variant === "ghost" && "bg-transparent text-[#5f6675] hover:bg-[#f8f9fb] hover:text-black",
        variant === "danger" && "bg-red-50 text-red-600 hover:bg-red-100",
        className,
      )}
      {...props}
    />
  );
}
