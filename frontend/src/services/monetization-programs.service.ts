import { api } from "./api";

/**
 * Monetization programmes, from the SAME endpoint the mobile app reads.
 *
 * The Studio's "Eligible Earning Opportunities" list was a hardcoded array of
 * five keys (ad_revenue, live_gift, subscription, series, brand_collab) with
 * invented copy. Programmes are real, admin-editable records
 * (MonetizationProgram) with requirements, region gating and waitlists - so the
 * web list could disagree with the app about what exists, what it is called and
 * whether a creator qualifies. It did.
 *
 * `surface=web` is what the controller already expects, and visible_web decides
 * which programmes appear here - so the web list is an operator choice, not a
 * copy of the app's.
 *
 * Every type below mirrors MonetizationEligibilityService::evaluateProgram()
 * merged with MonetizationProgram::toClientArray(). Verified against those
 * rather than assumed: the row uses `label` (not name) and `status` (not an
 * eligible boolean), and blockers are a `kind` on a requirement rather than a
 * separate list.
 */

export type ProgramStatus = "active" | "eligible" | "locked" | "coming_soon" | "disabled";

export type ProgramRequirement = {
  id: string;
  label: string;
  sub?: string | null;
  /** Null target means "must be true", not "must reach a number". */
  target: number | null;
  current: number;
  met: boolean;
  /** 0-100 progress toward target. */
  pct: number;
  /**
   * 'met'      already satisfied
   * 'progress' a milestone still being worked toward
   * 'blocker'  a disqualification (a strike, a ban) - not something to grind up
   */
  kind: "met" | "progress" | "blocker";
  /** How to move this metric, when the platform offers wording for it. */
  action?: string | null;
  /** Platform-wide baseline rule rather than this programme's own. */
  baseline?: boolean;
  counted?: string | null;
};

export type MonetizationProgramRow = {
  key: string;
  label: string;
  description?: string | null;
  mode: "enabled" | "coming_soon" | "disabled";
  status: ProgramStatus;
  requirements: ProgramRequirement[];
  unlocks: string[];
  met_count: number;
  total_count: number;
  percent: number;
  all_met: boolean;
  enrolment_removed_until?: string | null;
  unlocked_at?: string | null;
  waitlisted: boolean;
  commission_rate?: number | null;
  min_payout?: number | null;
  availability: { worldwide: boolean; countries: { code: string; name: string }[] };
};

export type ProgramsResponse = {
  /** Master switch. When false the platform has monetization off entirely. */
  enabled: boolean;
  surface: string;
  programs: MonetizationProgramRow[];
  metrics: Record<string, number>;
};

export const monetizationProgramsService = {
  async list(): Promise<ProgramsResponse> {
    const { data } = await api.get("/studio/monetization/programs", {
      params: { surface: "web" },
    });
    return data.data;
  },

  /** "Notify me when eligible" - idempotent server-side. */
  async joinWaitlist(programKey: string): Promise<void> {
    await api.post(`/studio/monetization/programs/${programKey}/waitlist`, {});
  },
};
