"use client";

import { RequireAuth } from "@/components/layout/protected-route";
import { SectionPage } from "@/components/layout/section-page";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export function SettingsPage({ title, fields }: { title: string; fields: string[] }) {
  return (
    <RequireAuth>
      <SectionPage title={title} description="Manage this part of your Teezer account.">
        <Card className="max-w-3xl p-6">
          <div className="grid gap-4 md:grid-cols-2">
            {fields.map((field) => <Input key={field} placeholder={field} />)}
          </div>
          <Button className="mt-6">Save changes</Button>
        </Card>
      </SectionPage>
    </RequireAuth>
  );
}
