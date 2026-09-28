"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { Disc3 } from "lucide-react";

export default function AlbumsPage() {
  return (
    <AdminShell title="Albums">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-2xl bg-[#f5f3ff] grid place-items-center mb-4">
          <Disc3 className="h-7 w-7 text-[#8b5cf6]" />
        </div>
        <h2 className="text-[18px] font-bold text-[#111827]">Albums</h2>
        <p className="text-[13px] text-[#6b7280] mt-1">Album management coming soon.</p>
      </div>
    </AdminShell>
  );
}
