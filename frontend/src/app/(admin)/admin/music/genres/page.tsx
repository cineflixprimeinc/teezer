"use client";

import { Tag } from "lucide-react";
import { TaxonomyManager } from "@/admin-panel/components/music/taxonomy-manager";

export default function GenresPage() {
  return (
    <TaxonomyManager
      kind="genre"
      title="Genres"
      subtitle="The genre list offered when tagging a track, and how many tracks use each one."
      icon={Tag}
      tint="#ca8a04"
    />
  );
}
