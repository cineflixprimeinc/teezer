"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AppShell } from "./app-shell";
import { RequireAuth } from "./protected-route";
import { studioNav } from "@/constants/routes";
import { cn } from "@/lib/utils";

export function StudioLayout({ title, children }: { title: string; children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <RequireAuth>
      <AppShell>
        <div className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
          <h1 className="text-3xl font-bold text-black">Teezer Studio</h1>
          <div className="mt-5 flex gap-2 overflow-x-auto border-b border-[#eeeeee] pb-3">
            {studioNav.map(([label, href]) => (
              <Link key={href} href={href} className={cn("rounded-full px-4 py-2 text-sm font-semibold text-[#5f6675] hover:bg-white", pathname === href && "bg-[#fe2c55] text-white")}>{label}</Link>
            ))}
          </div>
          <h2 className="mt-8 text-xl font-bold text-black">{title}</h2>
          <div className="mt-5">{children}</div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
