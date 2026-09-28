import {
  BadgeCheck, Bell, CircleDollarSign, Clock, Coins, FileText, Flag, Gift, Heart,
  Lock, Mic, Search, ShieldCheck, Sparkles, Star, Store, Tag, Timer,
  UserRound, Users,
  type LucideIcon,
} from "lucide-react-native";

/**
 * Presentation for the five monetization programmes, drawn from the supplied
 * screens.
 *
 * Everything that governs BEHAVIOUR - whether a programme is on, what it asks
 * for, what it unlocks - comes from the admin panel via
 * GET /studio/monetization/programs. This file holds what an API has no
 * business carrying: the icon, the hero copy, which live figures the stat strip
 * shows, the settings rows and the footer button.
 *
 * Keyed by programme key, with a fallback, so an admin adding a sixth
 * programme still gets a page.
 */

export type ProgrammeKey = "gifts" | "rewards" | "subscriptions" | "marketplace" | "affiliate";

/**
 * A cell in the hero's three-up strip. `from` names a live figure the screen
 * knows how to resolve; a cell whose figure has no source renders "--" rather
 * than a number nobody measured.
 */
export type StatSpec = {
  label: string;
  from:
    | "earned" | "available" | "giftCount" | "senders"
    | "followersOfTarget" | "views30" | "zeroMoney"
    | "none";
};

/** A Settings row. Toggles persist locally until a settings endpoint exists. */
export type ProgSetting =
  | { kind: "toggle"; key: string; label: string; sub: string; icon: LucideIcon; on: boolean }
  | { kind: "value"; key: string; label: string; sub: string; icon: LucideIcon; value: string; go?: string };

export type ProgrammeUi = {
  icon: LucideIcon;
  /** Header line under the title. */
  subtitle: string;
  /** Hero paragraph. `*text*` renders in the design's amber. */
  blurb: string;
  stats: StatSpec[];
  settings: ProgSetting[];
  rules: string[];
  /** Footer button. `muted` is the design's disabled pill. */
  cta: { label: string; note: string; muted?: boolean };
};

export const FALLBACK_UI: ProgrammeUi = {
  icon: Sparkles,
  subtitle: "Managed by Teezer",
  blurb: "This programme is managed by Teezer. Its requirements are below.",
  stats: [],
  settings: [],
  rules: [],
  cta: { label: "Re-check my status", note: "Requirements are re-checked every 24 hours.", muted: true },
};

export const PROGRAMME_UI: Record<string, ProgrammeUi> = {
  gifts: {
    icon: Gift,
    subtitle: "Coins on videos and Spaces",
    blurb:
      "Viewers buy coins and send them as gifts. *Coins convert at the platform rate after Teezer's commission, taken when you withdraw.*",
    stats: [
      { label: "Earned",  from: "earned" },
      { label: "Gifts",   from: "giftCount" },
      { label: "Senders", from: "senders" },
    ],
    settings: [
      { kind: "toggle", key: "gifts.videos", label: "Accept gifts on videos", sub: "Show the gift button under posts", icon: Heart, on: true },
      { kind: "toggle", key: "gifts.spaces", label: "Accept gifts in Spaces", sub: "Live audio rooms you host",        icon: Mic,   on: true },
      { kind: "value",  key: "gifts.min",    label: "Minimum gift",           sub: "Hide gifts under this value",      icon: CircleDollarSign, value: "10 coins" },
      { kind: "toggle", key: "gifts.board",  label: "Top gifter leaderboard", sub: "Show senders on your profile",     icon: UserRound, on: false },
    ],
    rules: [
      "A gift credits your wallet in full, in coins, the moment it is sent.",
      "Coins convert to cash at the platform rate when you request a withdrawal.",
      "Teezer's commission is deducted from that withdrawal, not from the gift - so the balance you see is what people actually sent you.",
    ],
    cta: { label: "Manage gift settings", note: "Changes apply to new posts immediately" },
  },

  rewards: {
    icon: CircleDollarSign,
    subtitle: "Per 1,000 qualified views",
    blurb:
      "Once you pass the follower threshold you earn a rate on every 1,000 qualified views — *videos over 60 seconds, watched by real accounts.*",
    stats: [
      { label: "Followers",   from: "followersOfTarget" },
      { label: "Views · 30d", from: "views30" },
      { label: "Earned",      from: "zeroMoney" },
    ],
    settings: [
      { kind: "toggle", key: "rewards.autoEnrol", label: "Auto-enrol new videos",    sub: "Opt every eligible post in",   icon: BadgeCheck, on: true },
      { kind: "value",  key: "rewards.minLen",    label: "Minimum video length",     sub: "Only posts over this qualify", icon: Clock,      value: "60s" },
      { kind: "toggle", key: "rewards.pledge",    label: "Original content pledge",  sub: "Required to receive payouts",  icon: ShieldCheck, on: true },
      { kind: "value",  key: "rewards.tax",       label: "Tax details",              sub: "Required above the tax-free threshold", icon: FileText, value: "Add", go: "TaxForms" },
    ],
    rules: [
      "Only original videos you posted yourself count - reposts and duplicates do not.",
      "Views are counted as qualified views, which exclude your own accounts and repeat views inside a short window.",
      "Nothing is accruing today. When the programme opens, earnings start from that point and are not backdated.",
    ],
    cta: { label: "Notify me when eligible", note: "", muted: true },
  },

  subscriptions: {
    icon: UserRound,
    subtitle: "Monthly supporter tiers",
    blurb:
      "Fans pay monthly for perks you choose — *subscriber-only posts, badges in comments, and private Spaces.*",
    stats: [
      { label: "Interested",  from: "none" },
      { label: "Suggested",   from: "none" },
      { label: "Subscribers", from: "none" },
    ],
    settings: [
      { kind: "value",  key: "subs.price",   label: "Tier price",            sub: "What supporters pay monthly", icon: CircleDollarSign, value: "Not set" },
      { kind: "toggle", key: "subs.badge",   label: "Subscriber badge",      sub: "Shown beside their comments", icon: Star,  on: true },
      { kind: "toggle", key: "subs.posts",   label: "Subscriber-only posts", sub: "Lock selected videos",        icon: Lock,  on: false },
      { kind: "value",  key: "subs.welcome", label: "Welcome message",       sub: "Sent when someone joins",     icon: Bell,  value: "Not set" },
    ],
    rules: [
      "You set the tiers and what each one includes.",
      "Subscribers are billed monthly by the app store, and the store takes its own cut before Teezer's.",
      "A subscription that lapses removes its perks at the end of the paid month, not immediately.",
    ],
    cta: { label: "Join the waitlist", note: "We'll email you when tiers open in your region" },
  },

  marketplace: {
    icon: Flag,
    subtitle: "Paid campaigns from brands",
    blurb:
      "Brands browse creators by audience and topic, then send paid briefs. *You set your rate and approve every deal.*",
    stats: [
      { label: "Earned",    from: "none" },
      { label: "Campaigns", from: "none" },
      { label: "Rating",    from: "none" },
    ],
    settings: [
      { kind: "toggle", key: "mkt.listed",  label: "Listed in marketplace",   sub: "Let brands find your profile", icon: Search, on: false },
      { kind: "value",  key: "mkt.rate",    label: "Rate per video",          sub: "Your starting price",          icon: CircleDollarSign, value: "Not set" },
      { kind: "value",  key: "mkt.cats",    label: "Categories",              sub: "Topics you accept briefs for", icon: Tag,    value: "None picked" },
      { kind: "toggle", key: "mkt.decline", label: "Auto-decline low offers", sub: "Below your listed rate",       icon: ShieldCheck, on: true },
    ],
    rules: [
      "A brand briefs a campaign with a budget and the audience it wants to reach.",
      "You are matched on audience, category and location - you are never opted in automatically.",
      "Payment terms are set per campaign and settle through your payout method, like any other earning.",
    ],
    cta: { label: "Notify me when eligible", note: "", muted: true },
  },

  affiliate: {
    icon: Store,
    subtitle: "Your own shop inside the app",
    blurb:
      "List your own products and sell them directly to your audience — showcased in your videos, LIVE streams and on your profile.",
    stats: [
      { label: "Avg. rate", from: "none" },
      { label: "Earned",    from: "none" },
      { label: "Orders",    from: "none" },
    ],
    settings: [
      { kind: "toggle", key: "aff.shop",    label: "Show shop on profile",     sub: "A shop tab beside your posts",   icon: Store, on: true },
      { kind: "toggle", key: "aff.autotag", label: "Auto-tag saved products",  sub: "Suggest tags while you upload",  icon: Tag,   on: false },
      { kind: "value",  key: "aff.currency",label: "Payout currency",          sub: "How commissions are converted",  icon: Coins, value: "USD" },
      { kind: "toggle", key: "aff.disclose",label: "Disclosure label",         sub: 'Adds "Affiliate" to tagged posts', icon: ShieldCheck, on: true },
    ],
    rules: [
      "You tag a product while posting, and the tag carries your creator id.",
      "A commission is earned only on a completed purchase, after the merchant's own return window closes.",
      "Rates are set per merchant, so there is no single platform-wide percentage.",
    ],
    cta: { label: "Manage shop", note: "Tagged products update within an hour" },
  },
};

export function uiFor(key: string): ProgrammeUi {
  return PROGRAMME_UI[key] ?? FALLBACK_UI;
}

/** The short reason under the ring, e.g. "Followers is what's holding you back". */
export function holdingYouBack(unmet: { label: string; target: number | null; counted: boolean }[]): string {
  if (unmet.length === 0) return "Everything checks out. This programme is unlocked.";
  const first = unmet[0];
  const target = first.counted && first.target
    ? ` — ${first.target.toLocaleString("en-US")} minimum.`
    : ".";
  return `${first.label} is what's holding you back${target}`;
}
