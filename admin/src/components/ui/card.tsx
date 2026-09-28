import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl border border-[#e8eaed] bg-white shadow-sm", className)}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex items-center justify-between border-b border-[#e8eaed] px-5 py-4", className)} {...props} />
  );
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-[14px] font-semibold text-[#111827]", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5", className)} {...props} />;
}

// Legacy StatCard kept for compatibility - redesigned for light theme
export function StatCard({
  label, value, sub, trend, icon: Icon, color = "#fd4605",
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  icon?: React.ElementType;
  color?: string;
}) {
  const isUp   = trend?.startsWith("+");
  const isDown = trend?.startsWith("-");

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[12px] font-medium text-[#6b7280] uppercase tracking-wide">{label}</p>
          <p className="mt-1.5 text-[26px] font-bold text-[#111827] leading-none">{value ?? "-"}</p>
        </div>
        {Icon && (
          <div className="grid h-10 w-10 place-items-center rounded-xl" style={{ backgroundColor: color + "15" }}>
            <Icon className="h-5 w-5" style={{ color }} />
          </div>
        )}
      </div>
      {(sub || trend) && (
        <div className="mt-3 flex items-center gap-2">
          {trend && (
            <span className={cn(
              "text-[12px] font-semibold",
              isUp ? "text-emerald-600" : isDown ? "text-red-500" : "text-[#6b7280]",
            )}>
              {trend}
            </span>
          )}
          {sub && <span className="text-[12px] text-[#6b7280]">{sub}</span>}
        </div>
      )}
    </Card>
  );
}
