/**
 * The creator rule set, mirrored from the website's Creator Rules modal
 * (frontend/src/features/studio/creator-rules-modal.tsx) and the values the
 * backend actually enforces.
 *
 * Anything the API returns per-user - level, score, requirement progress - is
 * NOT duplicated here; that comes from creatorApi. This file only holds the
 * static policy copy the website also hard-codes, so the two stay in step.
 *
 * Where the website's copy disagrees with the server, the SERVER wins. Noted
 * inline below (account age is the one live discrepancy).
 */

/* ── Eligibility thresholds - server: CreatorEligibilityController ───────── */
export const CREATOR_THRESHOLDS = {
  minVideos: 3,
  minViews: 500,
  minFollowers: 300,
  /** 7, per the backend. The website's rules modal still says "30+ days" - that
   *  string is wrong and the server would approve at 7. We show 7. */
  minAgeDays: 7,
} as const;

/* ── XP - earned continuously; each level also has an XP floor. ──────────── */
export const XP_RATES: { label: string; rate: string }[] = [
  { label: "Video published", rate: "50 XP each" },
  { label: "Views", rate: "0.5 XP each" },
  { label: "Followers", rate: "20 XP each" },
  { label: "Watch minutes", rate: "1 XP each" },
];

/* ── Creator Score - weighted 0–5, shown to users scaled to /1,000. ──────── */
export const SCORE_WEIGHTS: { label: string; pct: number; how: string; color: string }[] = [
  { label: "Content Quality", pct: 40, how: "Average views per video - 10K avg scores full marks", color: "#7c3aed" },
  { label: "Engagement", pct: 25, how: "(likes + comments + shares) ÷ views, last 30 days - 5% scores full marks", color: "#fe2c55" },
  { label: "Consistency", pct: 15, how: "Days since your last upload - post weekly to score full marks", color: "#16a34a" },
  { label: "Growth", pct: 10, how: "Follower count - 10K followers scores full marks", color: "#f59e0b" },
  { label: "Compliance", pct: 10, how: "Full marks while you have no active violation, zero otherwise", color: "#0ea5e9" },
];

/* ── What each level unlocks - mirrors frontend/src/lib/studio-permissions.ts.
   Kept in the same order the website lists them. ── */
export const FEATURE_UNLOCKS: { feature: string; label: string; level: number; note?: string }[] = [
  { feature: "best_time", label: "Best time to post", level: 1 },
  { feature: "advanced_comments", label: "Advanced comments manager", level: 3 },
  { feature: "advanced_best_time", label: "Advanced best time to post", level: 4 },
  { feature: "monetization", label: "Monetization", level: 5 },
  { feature: "payouts", label: "Payouts", level: 6, note: "Also requires monetization approval" },
  { feature: "marketplace", label: "Creator marketplace", level: 7 },
  { feature: "subscriptions", label: "Subscriptions", level: 8 },
  { feature: "partner_tools", label: "Partner tools", level: 10 },
];

/* ── Upload limits - become-creator-page.tsx ─────────────────────────────── */
export const UPLOAD_LIMITS = {
  user: { size: "500 MB", duration: "10 min" },
  creator: { size: "1 GB", duration: "30 min" },
} as const;

/* ── Money ────────────────────────────────────────────────────────────────
   MONEY_RULES used to live here: a hard-coded 30/70 split, 100 coins per
   dollar, a $50 payout floor and a $10 coin-wallet floor. Every one of those
   is an admin setting, and copying them into the bundle is what let the app
   quote three different minimum withdrawals on three different screens.

   Read them from the server with `useMoneyRules()` instead. Nothing about
   money belongs in a constants file. ── */

/* ── Violations - 3-strike policy, verbatim from the website modal. ──────── */
export const VIOLATION_POLICY: { strike: string; title: string; detail: string; color: string }[] = [
  { strike: "1", title: "Warning", detail: "A first violation is a warning. Level advancement may pause while it is active.", color: "#f59e0b" },
  { strike: "2", title: "Feature restriction", detail: "Features are restricted and level advancement is paused for 30 days.", color: "#f97316" },
  { strike: "3", title: "Creator demotion", detail: "Creator status is removed. You may re-apply after 90 days.", color: "#dc2626" },
  { strike: "!", title: "Permanent ban", detail: "Severe or repeated violations end the account permanently.", color: "#991b1b" },
];

/* ── General rules shown in the modal's right rail. ──────────────────────── */
export const GENERAL_RULES: string[] = [
  "Every requirement for a level must be met - levels are not awarded partially.",
  "Levels are evaluated continuously; you advance as soon as you qualify.",
  "An active violation freezes advancement until it is resolved.",
  "Engagement is measured over the last 30 days, watch minutes over the last 90.",
  "Only published, public videos count toward video and view totals.",
  "Level 10 is granted by manual review, not automatically.",
];

/* ── The 0–10 level table - the website's "Creator Levels Progression".
   Mirrors the server's levelDefinitions(). It lives here as a constant rather
   than coming off the API because the rules must be readable BEFORE you are a
   creator: /studio/creator-level-page only answers for creators, and its
   `all_levels` carries no XP or requirement detail anyway. Per-user state
   (which level you're on, how far along) still comes from the API and is
   overlaid on top of this. ── */
export type LevelDef = {
  n: number;
  name: string;
  shortReq: string;
  xp: number;
  reqs: string[];
  perks: string[];
};

export const CREATOR_LEVELS: LevelDef[] = [
  {
    n: 0, name: "New Creator", shortReq: "Creator application approved", xp: 0,
    reqs: ["Granted when your creator application is approved"],
    perks: ["Basic Studio access", "Content manager", "Basic analytics", "Basic comment manager", "1GB / 30 min upload", "Level progress visible"],
  },
  {
    n: 1, name: "Starter Creator", shortReq: "Auto-unlocked on creator approval", xp: 2000,
    reqs: ["Auto-unlocked - the eligibility checklist already covers it"],
    perks: ["Creator badge / status", "Basic audience analytics", "Basic best time to post preview", "Basic growth tips"],
  },
  {
    n: 2, name: "Rising Creator", shortReq: "5 videos, 2K views, 500 followers", xp: 8000,
    reqs: ["5 public videos", "2,000 total views", "500 followers", "500 watch minutes", "Engagement rate 1.5%+", "Creator Score 2.5+", "No active violations"],
    perks: ["Full Analytics unlocked", "Advanced content insights", "Scheduled posts", "Audience insights", "Traffic sources", "Retention analytics", "Full best time to post"],
  },
  {
    n: 3, name: "Active Creator", shortReq: "10 videos, 5K views, 1K followers", xp: 20000,
    reqs: ["10 public videos", "5,000 total views", "1,000 followers", "1,500 watch minutes", "Engagement rate 2%+", "Creator Score 3.0+", "No active violations"],
    perks: ["Advanced comments manager", "Audience location insights", "Advanced content manager", "Detailed video insights"],
  },
  {
    n: 4, name: "Trusted Creator", shortReq: "15 videos, 15K views, 2K followers", xp: 60000,
    reqs: ["15 public videos", "15,000 total views", "2,000 followers", "5,000 watch minutes", "Avg retention 20%+", "Engagement rate 2.5%+", "Creator Score 3.3+", "No active violations"],
    perks: ["Creator growth tips", "Advanced best time to post", "Priority content indexing", "Improved promote recommendations", "Audience behavior insights"],
  },
  {
    n: 5, name: "Monetization Eligible", shortReq: "25 videos, 50K views, 5K followers", xp: 150000,
    reqs: ["25 public videos", "50,000 total views", "5,000 followers", "15,000 watch minutes", "Engagement rate 3%+", "Creator Score 3.7+", "No active violations"],
    perks: ["Monetization apply", "Estimated rewards", "Wallet preview", "Revenue dashboard preview", "Gift / coin eligibility preview", "Monetization checklist"],
  },
  {
    n: 6, name: "Monetized Creator", shortReq: "50 videos, 100K views, 10K followers", xp: 400000,
    reqs: ["50 public videos", "100,000 total views", "10,000 followers", "30,000 watch minutes", "Creator Score 4.0+", "No active violations"],
    perks: ["Ad revenue", "Gifts and coins", "Payouts", "Full monetization dashboard", "Revenue analytics", "Transaction history", "Creator wallet"],
  },
  {
    n: 7, name: "Pro Creator", shortReq: "100 videos, 500K views, 25K followers", xp: 1200000,
    reqs: ["100 public videos", "500,000 total views", "25,000 followers", "100,000 watch minutes", "Engagement rate 4%+", "Creator Score 4.2+", "No active violations"],
    perks: ["Creator marketplace", "Brand collaboration eligibility", "Pro analytics", "Advanced campaign insights", "Priority monetization review"],
  },
  {
    n: 8, name: "Premium Creator", shortReq: "250 videos, 1M views, 50K followers", xp: 4000000,
    reqs: ["250 public videos", "1,000,000 total views", "50,000 followers", "250,000 watch minutes", "Creator Score 4.4+", "No active violations"],
    perks: ["Subscription tools", "Series earnings", "Advanced monetization tools", "Priority support", "Better marketplace visibility", "Advanced audience segmentation"],
  },
  {
    n: 9, name: "Elite Creator", shortReq: "500 videos, 5M views, 100K followers", xp: 12000000,
    reqs: ["500 public videos", "5,000,000 total views", "100,000 followers", "1,000,000 watch minutes", "Creator Score 4.6+", "No active violations"],
    perks: ["Brand marketplace priority", "Higher revenue opportunities", "Priority support queue", "Elite creator tools"],
  },
  {
    n: 10, name: "Partner Creator", shortReq: "250K+ followers, 10M+ views", xp: 0,
    reqs: ["10,000,000 total views", "250,000 followers", "Creator Score 4.8+", "No active violations", "Granted by manual review"],
    perks: ["Partner badge", "Premium support", "Top creator campaigns", "Highest marketplace priority", "Advanced revenue programs", "Exclusive partner tools", "Early feature access"],
  },
];

/* ── Benefits by band - the modal's Benefits tab. ────────────────────────── */
export const BENEFIT_BANDS: { range: string; title: string; items: string[]; color: string }[] = [
  {
    range: "Levels 0–1",
    title: "Getting started",
    color: "#6b7280",
    items: ["Studio access", "Content manager", "Basic analytics", "Creator badge", "1 GB / 30 min uploads"],
  },
  {
    range: "Levels 2–4",
    title: "Growing",
    color: "#2563eb",
    items: ["Full analytics", "Scheduled posts", "Audience + retention insights", "Advanced comments manager", "Priority content indexing"],
  },
  {
    range: "Levels 5–6",
    title: "Earning",
    color: "#16a34a",
    items: ["Monetization", "Gifts and coins", "Ad revenue", "Creator wallet", "Payouts", "Revenue analytics"],
  },
  {
    range: "Levels 7–10",
    title: "Professional",
    color: "#7c3aed",
    items: ["Creator marketplace", "Brand collaborations", "Subscriptions", "Series earnings", "Partner badge", "Early feature access"],
  },
];
