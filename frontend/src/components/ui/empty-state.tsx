import { Card } from "./card";

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <Card className="p-8 text-center">
      <p className="text-base font-semibold text-black">{title}</p>
      {description ? <p className="mt-2 text-sm text-[#5f6675]">{description}</p> : null}
    </Card>
  );
}
