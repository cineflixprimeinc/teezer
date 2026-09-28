"use client";

import { AdminShell } from "@/components/layout/admin-shell";
import { Smile } from "lucide-react";

export default function MoodsPage() {
  return (
    <AdminShell title="Moods">
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="h-14 w-14 rounded-2xl bg-[#fefce8] grid place-items-center mb-4">
          <Smile className="h-7 w-7 text-[#ca8a04]" />
        </div>
        <h2 className="text-[18px] font-bold text-[#111827]">Moods</h2>
        <p className="text-[13px] text-[#6b7280] mt-1">Mood management coming soon.</p>
      </div>
    </AdminShell>
  );
}
