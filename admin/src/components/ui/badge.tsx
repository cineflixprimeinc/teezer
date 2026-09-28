import { cn } from "@/lib/utils";

type Variant = "default" | "success" | "warning" | "danger" | "info" | "purple" | "outline";

const VARIANTS: Record<Variant, string> = {
  default: "bg-[#f3f4f6] text-[#374151]",
  success: "bg-emerald-50 text-emerald-700",
  warning: "bg-amber-50 text-amber-700",
  danger:  "bg-red-50 text-red-600",
  info:    "bg-blue-50 text-blue-700",
  purple:  "bg-purple-50 text-purple-700",
  outline: "border border-[#e8eaed] bg-white text-[#374151]",
};

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        VARIANTS[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Map a status string to a badge variant automatically */
export function StatusBadge({ status }: { status: string }) {
  const s = status?.toLowerCase() ?? "";
  const variant: Variant =
    s === "active" || s === "published" || s === "approved" || s === "online" || s === "operational" || s === "actioned"
      ? "success"
    : s === "pending" || s === "review" || s === "reviewed" || s === "scheduled" || s === "busy"
      ? "warning"
    : s === "banned" || s === "rejected" || s === "removed" || s === "error" || s === "failed"
      ? "danger"
    : s === "verified"
      ? "info"
    : s === "draft" || s === "private" || s === "dismissed"
      ? "default"
    : "default";

  return <Badge variant={variant}>{status}</Badge>;
}
