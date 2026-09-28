import type { PermContext } from "@/api/studio.api";

/**
 * Mirrors frontend/src/lib/studio-permissions.ts - the mobile Studio must
 * enforce the SAME rules as the website, not just look similar. Kept in sync
 * manually; flip both kill switches together if the web one ever changes.
 */
export const LOCKS_ENABLED = true;

export type StudioAccessCtx = PermContext & { isAdmin: boolean };

export interface StudioRule {
  minRole: "any" | "creator";
  minLevel?: number;
  requiresMonetization?: boolean;
}

/** Every gated feature the website defines, at the same levels. Anything absent
 *  from this map is unrestricted (`minRole: "any"` on the web), so it does not
 *  need an entry. */
export const STUDIO_RULES: Record<string, StudioRule> = {
  best_time: { minRole: "creator", minLevel: 1 },
  advanced_comments: { minRole: "creator", minLevel: 3 },
  advanced_best_time: { minRole: "creator", minLevel: 4 },
  monetization: { minRole: "creator", minLevel: 5 },
  payouts: { minRole: "creator", minLevel: 6, requiresMonetization: true },
  marketplace: { minRole: "creator", minLevel: 7 },
  subscriptions: { minRole: "creator", minLevel: 8 },
  partner_tools: { minRole: "creator", minLevel: 10 },
};

export function canAccess(ctx: StudioAccessCtx, feature: string): boolean {
  if (!LOCKS_ENABLED) return true;
  if (ctx.isAdmin) return true;
  const rule = STUDIO_RULES[feature];
  if (!rule) return true;
  if (rule.minRole === "any") return true;
  if (!ctx.isCreator) return false;
  const minLevel = rule.minLevel ?? 0;
  if (ctx.creatorLevel < minLevel) return false;
  if (rule.requiresMonetization && !ctx.monetizationApproved) return false;
  return true;
}
