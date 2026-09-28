"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { Tag } from "lucide-react";

export default function GenresPage() {
  return (
    <AdminShell title="Genres">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-2xl bg-[#fefce8] grid place-items-center mb-4">
          <Tag className="h-7 w-7 text-[#ca8a04]" />
        </div>
        <h2 className="text-[18px] font-bold text-[#111827]">Genres</h2>
        <p className="text-[13px] text-[#6b7280] mt-1">Genre management coming soon.</p>
      </div>
    </AdminShell>
  );
}
