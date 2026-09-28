import type { InputHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-12 w-full rounded-2xl border border-[#eeeeee] bg-white px-4 text-sm text-black outline-none transition placeholder:text-[#9aa1ad] focus:border-[#fd4605] focus:ring-4 focus:ring-[#fd4605]/10",
        className,
      )}
      {...props}
    />
  );
}
