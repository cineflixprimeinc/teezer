"use client";

import { Plus, BookOpen, Boxes, LayoutGrid, RefreshCw, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { Card, EmptyState, PrimaryButton, PageHeader } from "../ui";

const FEATURES: { icon: LucideIcon; title: string; desc: string }[] = [
  {
    icon: Boxes,
    title: "Dynamic ads",
    desc: "Automatically show the right products to people most likely to buy.",
  },
  {
    icon: LayoutGrid,
    title: "Product sets",
    desc: "Group items into collections to target specific audiences and campaigns.",
  },
  {
    icon: RefreshCw,
    title: "Auto-updating inventory",
    desc: "Prices and availability stay in sync as your catalog changes.",
  },
];

export function CatalogsPage() {
  const createBtn = (
    <PrimaryButton onClick={() => toast.info("Catalogs are coming soon.")}>
      <Plus className="h-4 w-4" /> Create catalog
    </PrimaryButton>
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Catalogs"
        subtitle="Manage product catalogs for shopping and dynamic ads."
      >
        {createBtn}
      </PageHeader>

      <Card className="p-6">
        <EmptyState
          icon={BookOpen}
          title="No catalogs yet"
          desc="Upload products to run dynamic ads that automatically show the right items to the right people."
          action={createBtn}
        />
      </Card>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {FEATURES.map(({ icon: Icon, title, desc }) => (
          <Card key={title} className="p-5">
            <span className="mb-3 grid h-10 w-10 place-items-center rounded-full bg-[#fff0f4]">
              <Icon className="h-[19px] w-[19px] text-[#fe2c55]" />
            </span>
            <p className="text-[14px] font-bold text-[#111827]">{title}</p>
            <p className="mt-1 text-[13px] leading-relaxed text-[#6b7280]">{desc}</p>
            <p className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-[#9ca3af]">Coming soon</p>
          </Card>
        ))}
      </div>
    </div>
  );
}
