"use client";

import { Smile } from "lucide-react";
import { TaxonomyManager } from "@/admin-panel/components/music/taxonomy-manager";

export default function MoodsPage() {
  return (
    <TaxonomyManager
      kind="mood"
      title="Moods"
      subtitle="The mood list offered when tagging a track, and how many tracks use each one."
      icon={Smile}
      tint="#7c3aed"
    />
  );
}
