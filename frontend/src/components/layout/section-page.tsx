import { AppShell } from "./app-shell";
import { Card } from "@/components/ui/card";

export function SectionPage({ title, description, children }: { title: string; description?: string; children?: React.ReactNode }) {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <h1 className="text-3xl font-bold tracking-tight text-black">{title}</h1>
          {description ? <p className="mt-2 text-sm text-[#5f6675]">{description}</p> : null}
        </div>
        {children || <Card className="p-8 text-[#5f6675]">This area is connected to the Teezer app shell and ready for backend data.</Card>}
      </div>
    </AppShell>
  );
}
