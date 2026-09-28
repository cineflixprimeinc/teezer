"use client";

import { cn } from "@/admin-panel/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "./button";

// ── Table primitives ─────────────────────────────────────────────────────────

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-[13px]">{children}</table>
    </div>
  );
}

export function Thead({ children }: { children: React.ReactNode }) {
  return (
    <thead>
      <tr className="border-b border-[#e8eaed] bg-[#f9fafb]">{children}</tr>
    </thead>
  );
}

export function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={cn(
        "px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[#6b7280] whitespace-nowrap",
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Tbody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-[#f3f4f6]">{children}</tbody>;
}

export function Tr({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-[#f9fafb]",
        className,
      )}
    >
      {children}
    </tr>
  );
}

export function Td({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <td className={cn("px-4 py-3 text-[#374151] align-middle", className)}>
      {children}
    </td>
  );
}

// ── Pagination ───────────────────────────────────────────────────────────────

export function Pagination({
  currentPage,
  lastPage,
  total,
  onPage,
}: {
  currentPage: number;
  lastPage: number;
  total: number;
  onPage: (p: number) => void;
}) {
  if (lastPage <= 1) return null;

  return (
    <div className="flex items-center justify-between border-t border-[#e8eaed] px-4 py-3">
      <p className="text-[12px] text-[#6b7280]">
        Page {currentPage} of {lastPage} · {total.toLocaleString()} total
      </p>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage <= 1}
          onClick={() => onPage(currentPage - 1)}
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </Button>
        {Array.from({ length: Math.min(5, lastPage) }, (_, i) => {
          const page = Math.max(1, Math.min(currentPage - 2, lastPage - 4)) + i;
          if (page > lastPage) return null;
          return (
            <Button
              key={page}
              variant={page === currentPage ? "primary" : "outline"}
              size="sm"
              onClick={() => onPage(page)}
            >
              {page}
            </Button>
          );
        })}
        <Button
          variant="outline"
          size="sm"
          disabled={currentPage >= lastPage}
          onClick={() => onPage(currentPage + 1)}
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Empty & loading states ────────────────────────────────────────────────────

export function TableEmpty({ message = "No records found." }: { message?: string }) {
  return (
    <tr>
      <td colSpan={99} className="px-4 py-12 text-center text-[13px] text-[#9ca3af]">
        {message}
      </td>
    </tr>
  );
}

export function TableLoading({ cols = 5 }: { cols?: number }) {
  return (
    <>
      {[1, 2, 3, 4, 5].map((i) => (
        <tr key={i} className="animate-pulse">
          {Array.from({ length: cols }).map((_, j) => (
            <td key={j} className="px-4 py-4">
              <div className="h-3.5 rounded bg-[#f3f4f6]" style={{ width: `${40 + Math.random() * 40}%` }} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
