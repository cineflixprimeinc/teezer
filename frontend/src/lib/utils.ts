import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Slugify a saved location string for /location/{slug} (matches Laravel Str::slug). */
export function locationSlug(label: string): string {
  return label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function formatCompact(value?: number | string | null) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return "0";
  return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(number);
}
