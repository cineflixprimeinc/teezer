"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { Users2 } from "lucide-react";

export default function ArtistsPage() {
  return (
    <AdminShell title="Artists">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-2xl bg-[#eff6ff] grid place-items-center mb-4">
          <Users2 className="h-7 w-7 text-[#3b82f6]" />
        </div>
        <h2 className="text-[18px] font-bold text-[#111827]">Artists</h2>
        <p className="text-[13px] text-[#6b7280] mt-1">Artist management coming soon.</p>
      </div>
    </AdminShell>
  );
}
