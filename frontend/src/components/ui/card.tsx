import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("rounded-2xl border border-[#eeeeee] bg-white shadow-[0_12px_40px_rgba(15,23,42,0.05)]", className)} {...props} />;
}

export function StatCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <Card className="p-5">
      <p className="text-xs font-medium uppercase tracking-wide text-[#5f6675]">{label}</p>
      <p className="mt-2 text-2xl font-bold text-black">{value}</p>
      {sub ? <p className="mt-1 text-xs text-[#5f6675]">{sub}</p> : null}
    </Card>
  );
}
