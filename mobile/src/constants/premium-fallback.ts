import type { PremiumConfig } from "@/api/premium.api";

/**
 * The premium page's bundled catalogue - what the screen draws when GET /premium
 * cannot be reached.
 *
 * Same idea as BUILT_IN_FILTERS in the media editor: the server's copy is the
 * real one, this ships in the bundle so a cold start, a flat network or a
 * backend that has not been deployed yet still shows the page instead of an
 * error. Kept identical to database/seeders/PremiumPageSeeder.php - if you edit
 * one, edit the other, or the page changes shape the moment the API comes back.
 *
 * SAFETY - the part that matters most here: every plan below has
 * `product_id: null`. That is deliberate and load-bearing, not an omission.
 * These prices are a snapshot of the design and can go stale the moment an
 * admin edits them, so the screen must never be able to *sell* at them. A null
 * product id makes the CTA say the tier is not available rather than opening a
 * store sheet, so the worst a stale fallback can do is show an out-of-date
 * number - never charge one.
 */
export const PREMIUM_FALLBACK: PremiumConfig = {
  default_plan: "studio",
  trial: { enabled: true, days: 7 },
  legal_note:
    "Billed through your app store. Cancel anytime - access continues until the end of the billing period you already paid for.",
  // No invented figure offline: the pill is simply absent, exactly as it is
  // when the server decides the real count is too low to state.
  social_proof: null,

  plans: [
    {
      key: "starter",
      name: "Starter",
      tagline: "For new creators",
      price: 249,
      currency: "NPR",
      period: "month",
      features: ["No ads in feed", "1080p uploads", "30-day analytics"],
      is_popular: false,
      badge_label: null,
      theme: "light",
      // No server quote offline: the bundled price is a snapshot, so it is
      // rendered from `price`/`currency` and never presented as a live quote.
      pricing: null,
      product_id: null,
    },
    {
      key: "pro",
      name: "Pro",
      tagline: "For growing channels",
      price: 499,
      currency: "NPR",
      period: "month",
      features: [
        "Everything in Starter",
        "Premium badge",
        "12-month analytics",
        "Priority Space slots",
      ],
      is_popular: true,
      badge_label: "MOST POPULAR",
      theme: "light",
      // No server quote offline: the bundled price is a snapshot, so it is
      // rendered from `price`/`currency` and never presented as a live quote.
      pricing: null,
      product_id: null,
    },
    {
      key: "studio",
      name: "Studio",
      tagline: "For teams and agencies",
      price: 1290,
      currency: "NPR",
      period: "month",
      features: [
        "Everything in Pro",
        "5 team seats with roles",
        "Scheduled posting + bulk upload",
        "Priority support",
      ],
      is_popular: false,
      badge_label: null,
      theme: "dark",
      // No server quote offline: the bundled price is a snapshot, so it is
      // rendered from `price`/`currency` and never presented as a live quote.
      pricing: null,
      product_id: null,
    },
  ],

  features: [
    { icon: "chart", title: "Advanced analytics", description: "Retention curves, follower sources and best posting times", badge: null },
    { icon: "star", title: "Premium badge", description: "A verified-style mark next to your name everywhere", badge: null },
    { icon: "video", title: "4K uploads", description: "Upload up to 4K80 with no extra compression", badge: null },
    { icon: "mic", title: "Priority Space slots", description: "Your Spaces surface first for followers", badge: "NEW" },
    { icon: "ban", title: "No ads", description: "Watch reels without interruptions", badge: null },
    { icon: "zap", title: "Early features", description: "Try new editing tools weeks before everyone", badge: "NEW" },
  ],

  comparison: [
    { label: "Upload quality", values: { starter: "1080p", pro: "4K60", studio: "4K80" }, highlight_plan: "pro" },
    { label: "Analytics", values: { starter: "30 days", pro: "12 mo", studio: "12 mo" }, highlight_plan: "pro" },
    { label: "Space listeners", values: { starter: "1K", pro: "10K", studio: "50K" }, highlight_plan: "pro" },
    // Absent keys render as the design's em dash - "not included" is an answer.
    { label: "Team seats", values: { pro: "1", studio: "5" }, highlight_plan: "pro" },
    { label: "Scheduling", values: { studio: "Yes" }, highlight_plan: "pro" },
  ],

  faq: [
    {
      question: "Can I cancel anytime?",
      answer:
        "Yes. Cancel from your app store subscription settings at any time. You keep every premium feature until the end of the period you have already paid for, and you are not charged again.",
    },
    {
      question: "Does Premium boost my reels?",
      answer:
        "No. Premium does not change how the feed ranks your videos - reach is earned the same way for everyone. What it gives you is better tooling: deeper analytics, higher upload quality, and priority placement for your Spaces among your own followers.",
    },
    {
      question: "What happens to my 4K uploads if I cancel?",
      answer:
        "Videos you already uploaded stay exactly as they are and keep playing at the quality they were published in. New uploads after cancelling use the free tier limit.",
    },
    {
      question: "Can I switch plans later?",
      answer:
        "Yes. Upgrading applies immediately and your app store prorates the difference. Downgrading takes effect at the start of your next billing period, so you keep the higher tier until then.",
    },
  ],
};
