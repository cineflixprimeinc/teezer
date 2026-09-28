import { api } from "./client";

/**
 * GET /studio/monetization/programs
 *
 * The admin-controlled programme list, with every requirement ALREADY MEASURED
 * against this creator.
 *
 * The app used to compute this itself from four separate endpoints, which meant
 * the phone and the website could disagree about who was eligible. Now the
 * server measures once and both surfaces render the same answer.
 *
 * Two consequences worth knowing:
 *  - a programme the admin set to `disabled` is not in the response at all, so
 *    there is nothing to filter out client-side;
 *  - `status` already accounts for the mode. A `coming_soon` programme whose
 *    requirements are all met is `eligible`, never `active`.
 */

export type ProgramMode = "enabled" | "coming_soon" | "disabled";
/**
 * The five states, decided server-side:
 *   active      admin enabled + every requirement met
 *   eligible    every requirement met, but not open yet
 *   locked      one or more requirements unmet
 *   coming_soon not open, and the creator is not there yet either
 *   disabled    hidden globally (never actually sent - filtered server-side)
 */
export type ProgramStatus = "active" | "eligible" | "locked" | "coming_soon" | "disabled";

export type ProgramRequirement = {
  key: string;
  label: string;
  /** Null on the pass/fail requirements. */
  target: number | null;
  /** False when this is a yes/no check rather than a number to reach. */
  counted: boolean;
  current: number;
  met: boolean;
  pct: number;
  /** true for the platform-wide checks every programme carries (age, two-
   *  factor, one-account-per-person...); false for the ones configured
   *  specifically on THIS programme in the admin panel's Requirements tab.
   *  Screens that show "this programme's own requirements" (e.g.
   *  GiftsIntroScreen) filter on this, the same way SellerApplicationScreen
   *  does for Sell on Teezer - see that screen's own comment on why a fixed
   *  key list was the actual bug. */
  baseline: boolean;
};

export type MonetizationProgram = {
  key: string;
  label: string;
  description: string | null;
  mode: ProgramMode;
  requirements: ProgramRequirement[];
  unlocks: string[];
  sort_order: number;
  met_count: number;
  total_count: number;
  percent: number;
  status: ProgramStatus;
  /** First time this creator ever unlocked it. */
  unlocked_at?: string | null;
  /** Where the programme runs. A region lock with no explanation reads as a bug. */
  availability?: { worldwide: boolean; countries: { code: string; name: string }[] };
  /** Whether the admin is accepting "Notify me" signups for this (usually
   *  coming-soon) programme at all - a client must not show a waitlist
   *  button when this is false, since joinWaitlist() refuses it. */
  waitlist_enabled: boolean;
  /** Whether THIS creator already asked to be notified - see joinWaitlist(). */
  waitlisted: boolean;
  /** Admin override for the CTA button text (Admin Panel -> Monetization
   *  Control Center -> [programme] -> Overview -> Button Text). Null means
   *  "use this client's own default label for this programme" - each intro
   *  screen still owns its own fallback copy. */
  cta_label: string | null;
  /** Admin overrides for the intro screen's headline/paragraph (Admin Panel
   *  -> ... -> Overview -> App Intro Pitch). Null means "use this client's
   *  own default pitch copy for this programme". */
  hero_title: string | null;
  hero_description: string | null;
  /** Admin overrides for the intro screen's 3 icon+title+desc bullets
   *  (Admin Panel -> ... -> Overview -> Feature Bullets). Empty means "use
   *  this client's own default bullets for this programme". `icon` is a
   *  name from the server's curated set - see feature-icons.ts. */
  features: { icon: string; title: string; desc: string }[];
};

/** Every metric the requirements are measured against, for this creator. */
export type ProgramMetrics = Record<string, number>;

export const monetizationProgramsApi = {
  /** `surface=app` is explicit: a programme can be piloted on the web first. */
  list: (): Promise<{ enabled: boolean; programs: MonetizationProgram[]; metrics: ProgramMetrics }> =>
    api
      .get<{ success: boolean; data: { enabled: boolean; programs: MonetizationProgram[]; metrics: ProgramMetrics } }>(
        "/studio/monetization/programs",
        { params: { surface: "app" } },
      )
      .then((r) => r.data.data),

  /** "Notify me when eligible" / "Join the waitlist" - idempotent, any
   *  eligibility state. See StudioMonetizationProgramController::joinWaitlist. */
  joinWaitlist: (key: string): Promise<{ waitlisted: boolean }> =>
    api
      .post<{ success: boolean; data: { waitlisted: boolean } }>(`/studio/monetization/programs/${key}/waitlist`)
      .then((r) => r.data.data),
};
