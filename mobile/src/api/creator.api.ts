import { api } from "./client";

/* ── Become a Creator - GET /studio/become-creator ─────────────────────────
   Ten requirements, all of which must pass before `apply()` is accepted; the
   backend re-runs every check on apply, so a stale checklist can't sneak a
   user through. See server CreatorEligibilityController. ── */
export type ApplicationStatus = "none" | "pending" | "approved" | "rejected";

export type EligibilityRequirement = {
  key: string;
  label: string;
  passed: boolean;
  /** Server-rendered right-hand value, e.g. "12 / 3", "Passed", "Add bio". */
  display: string;
  /** Null on the boolean checks (verified / photo / terms / violations). */
  value: number | null;
  required: number | null;
};

export type EligibilityData = {
  is_creator: boolean;
  application_status: ApplicationStatus;
  rejection_reason: string | null;
  requirements: EligibilityRequirement[];
  completed_count: number;
  total_count: number;
  is_eligible: boolean;
  stats: { public_videos: number; total_views: number; followers: number; account_age: number };
};

/* ── Creator Levels - GET /studio/creator-level-page ───────────────────────
   `requirements` describes the NEXT level only (empty at level 10), and the
   endpoint auto-promotes when they all pass - so a refetch after new stats
   land is what makes a level-up show up. ── */
export type LevelRequirement = {
  key: string;
  label: string;
  type: "gte" | "bool";
  required: number;
  current: number;
  display: string;
  passed: boolean;
};

export type LevelState = "unlocked" | "current" | "locked";
export type LevelRow = { level_number: number; name: string; short_req: string; state: LevelState };
export type ScoreSlice = { label: string; pct: number; value: number };

export type CreatorLevelPage = {
  level_number: number;
  level_name: string;
  level_title: string;
  next_level: { number: number; name: string; title: string } | null;
  xp: { current: number; required: number };
  /** 0–5. The UI renders it scaled to /1,000, exactly like the website. */
  creator_score: number;
  creator_score_max: number;
  score_breakdown: ScoreSlice[];
  stats: {
    public_videos: number;
    total_views: number;
    followers: number;
    watch_minutes: number;
    engagement_rate: number;
  };
  requirements: LevelRequirement[];
  completed_count: number;
  total_requirements: number;
  current_level_perks: string[];
  next_level_perks: string[];
  all_levels: LevelRow[];
  has_violation: boolean;
};

export const creatorApi = {
  /** GET /studio/become-creator - the 10-point eligibility checklist. */
  eligibility: () =>
    api
      .get<{ success: boolean; data: EligibilityData }>("/studio/become-creator")
      .then((r) => r.data.data),

  /** POST /studio/become-creator/accept-terms - satisfies the `terms_accepted` check. */
  acceptTerms: () =>
    api
      .post<{ success: boolean; message?: string }>("/studio/become-creator/accept-terms")
      .then((r) => r.data),

  /** POST /studio/become-creator/apply - auto-approves when all 10 checks pass,
   *  otherwise 422s with `missing: string[]` naming the failed keys. */
  apply: () =>
    api
      .post<{ success: boolean; message?: string; is_creator?: boolean; missing?: string[] }>(
        "/studio/become-creator/apply",
      )
      .then((r) => r.data),

  /** GET /studio/creator-level-page - level, score, next-level requirements, perks. */
  levelPage: () =>
    api
      .get<{ success: boolean; data: CreatorLevelPage }>("/studio/creator-level-page")
      .then((r) => r.data.data),
};
