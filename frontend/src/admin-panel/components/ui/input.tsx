import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/admin-panel/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-9 w-full rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-9 rounded-[10px] border border-[#e8eaed] bg-white px-3 text-[13px] text-[#111827] outline-none transition focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10 cursor-pointer",
        className,
      )}
      {...props}
    />
  );
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "w-full rounded-[10px] border border-[#e8eaed] bg-white px-3 py-2 text-[13px] text-[#111827] outline-none transition placeholder:text-[#9ca3af] focus:border-[#fe2c55] focus:ring-2 focus:ring-[#fe2c55]/10 resize-none",
        className,
      )}
      {...props}
    />
  );
}
