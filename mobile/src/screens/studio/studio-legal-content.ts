import type { PolicyKey } from "@/store/policy.store";

/**
 * In-app Studio legal documents (Creator Agreement, Monetization Terms,
 * Copyright Policy, Advertising Policy). Plain-language creator-facing summaries
 * that cross-link to the site's binding policies (Privacy / Terms / Guidelines)
 * and to each other.
 *
 * NOTE: creator-facing summaries - have counsel review before relying on them as
 * binding terms; the site Terms of Service and Privacy Policy remain the
 * authoritative documents.
 */

export type StudioLegalDoc = "creator-agreement" | "monetization-terms" | "copyright" | "advertising";

export interface LegalSection { heading: string; paragraphs?: string[]; bullets?: string[] }
export type LegalLink =
  | { kind: "policy"; label: string; policy: PolicyKey }
  | { kind: "doc"; label: string; doc: StudioLegalDoc };

export interface LegalContent {
  title: string;
  updated: string;
  intro: string;
  sections: LegalSection[];
  related: LegalLink[];
}

const UPDATED = "19 July 2026";

export const STUDIO_LEGAL: Record<StudioLegalDoc, LegalContent> = {
  "creator-agreement": {
    title: "Creator Agreement",
    updated: UPDATED,
    intro:
      "This Creator Agreement sets out the terms between you (the “Creator”) and Teezer when you create, publish, or monetize content. It works alongside our Terms of Service, Community Guidelines, and Privacy Policy. By continuing as a Teezer Creator, you agree to these terms.",
    sections: [
      {
        heading: "1. Eligibility",
        paragraphs: [
          "You must be at least 18 years old (or the age of majority where you live) to be a Teezer Creator and to receive payouts.",
          "You must follow our Terms of Service and Community Guidelines at all times. Serious or repeated violations may end your ability to create or earn on Teezer.",
        ],
      },
      {
        heading: "2. Your content and ownership",
        paragraphs: [
          "You keep ownership of the content you create - Teezer does not claim ownership of your videos, sounds, or images.",
          "To run the platform, you grant Teezer a worldwide, non-exclusive, royalty-free licence to host, store, reproduce, adapt for formatting and delivery, and display your content across Teezer and its features. This licence ends when you delete the content, except for copies kept for legal, safety, or backup reasons.",
        ],
        bullets: [
          "You are responsible for holding all rights to everything in your content - footage, music, images, and third-party materials.",
          "Do not upload content that infringes someone else’s intellectual property (see our Copyright Policy).",
        ],
      },
      {
        heading: "3. Your responsibilities",
        bullets: [
          "Provide accurate account, identity, and payout information and keep it up to date.",
          "Only publish lawful content that follows our Community Guidelines.",
          "Clearly disclose paid partnerships and sponsored content.",
          "Do not use bots, fake engagement, or other tricks to artificially inflate views, likes, or earnings.",
        ],
      },
      {
        heading: "4. Verification",
        paragraphs: [
          "Some features and payouts require identity or tax verification. You agree to provide truthful documents when asked. Providing false information may lead to suspension and forfeiture of pending earnings.",
        ],
      },
      {
        heading: "5. Payments and monetization",
        paragraphs: [
          "If you are eligible for monetization, your earnings and payouts are governed by our Monetization Terms. You are responsible for any taxes on your earnings.",
        ],
      },
      {
        heading: "6. Suspension and termination",
        paragraphs: [
          "We may limit, suspend, or remove your access to creator features if you breach this Agreement, our Terms, or the law, or to protect the community. Where appropriate, you can appeal a decision from your account.",
          "You may stop being a Teezer Creator at any time. Some terms - including content licences already granted and payout and tax obligations - survive termination.",
        ],
      },
      {
        heading: "7. Changes to this Agreement",
        paragraphs: [
          "We may update this Agreement from time to time. If we make material changes, we will notify you in the app or by email. Continuing as a Creator after changes take effect means you accept the updated terms.",
        ],
      },
    ],
    related: [
      { kind: "policy", label: "Terms of Service", policy: "terms" },
      { kind: "policy", label: "Community Guidelines", policy: "guidelines" },
      { kind: "policy", label: "Privacy Policy", policy: "privacy" },
      { kind: "doc", label: "Monetization Terms", doc: "monetization-terms" },
    ],
  },

  "monetization-terms": {
    title: "Monetization Terms",
    updated: UPDATED,
    intro:
      "These Monetization Terms explain how you can earn on Teezer and how payouts work. They form part of your Creator Agreement. The amounts, fees, and thresholds shown in Teezer Studio are the current authoritative values.",
    sections: [
      {
        heading: "1. Eligibility for monetization",
        bullets: [
          "Meet the minimum creator level and any follower, content, or account-age requirements shown in Studio.",
          "Keep your account in good standing with no active violations.",
          "Complete your identity and tax information before receiving payouts.",
        ],
      },
      {
        heading: "2. Ways you can earn",
        bullets: [
          "Ad revenue share from ads shown on eligible content.",
          "Gifts & Coins sent by viewers.",
          "Fan subscriptions.",
          "Sponsorships and brand deals arranged through Teezer.",
        ],
        paragraphs: [
          "You can turn individual revenue streams on or off in Studio → Settings → Monetization.",
        ],
      },
      {
        heading: "3. Revenue share and fees",
        paragraphs: [
          "Teezer keeps a service fee that covers payment processing, content delivery, and running the platform. Your share and the applicable fee are shown in Studio and may vary by revenue source and region.",
          "Gifts and Coins convert to earnings at the rate displayed in Studio at the time of the transaction.",
        ],
      },
      {
        heading: "4. Payouts",
        bullets: [
          "Payouts are sent once your available balance passes the minimum payout amount (from $100).",
          "Payouts go only to the payout method you register and verify.",
          "Processing times vary by method, currency, and region.",
          "You can enable automatic payouts or request them manually.",
        ],
      },
      {
        heading: "5. Taxes",
        paragraphs: [
          "You are responsible for reporting and paying any taxes on your earnings. Depending on your residency, you may need to submit a tax form (for example W-8BEN or W-9) before payouts above a threshold. Manage this in Studio → Settings → Tax Information.",
        ],
      },
      {
        heading: "6. Fraud, chargebacks and clawbacks",
        paragraphs: [
          "Earnings generated through fraud, fake engagement, chargebacks, or policy violations may be withheld, reversed, or deducted from your balance. We may pause payouts while we investigate.",
        ],
      },
      {
        heading: "7. Suspension of monetization",
        paragraphs: [
          "We may suspend or remove monetization if you breach these terms, the Creator Agreement, our Community Guidelines, or advertiser or payment-partner rules. Pending earnings tied to violations may be forfeited.",
        ],
      },
    ],
    related: [
      { kind: "doc", label: "Creator Agreement", doc: "creator-agreement" },
      { kind: "doc", label: "Advertising Policy", doc: "advertising" },
      { kind: "policy", label: "Privacy Policy", policy: "privacy" },
    ],
  },

  copyright: {
    title: "Copyright Policy",
    updated: UPDATED,
    intro:
      "Teezer respects intellectual property rights and expects creators to do the same. This Copyright Policy explains your responsibilities, how music and sounds work, and how copyright claims and reports are handled.",
    sections: [
      {
        heading: "1. Only post content you have the rights to",
        paragraphs: [
          "Upload content only if you created it or have permission to use every part of it - including video, images, and audio. Uploading someone else’s work without authorization may result in removal, claims, or account action.",
        ],
      },
      {
        heading: "2. Music and sounds",
        bullets: [
          "Use tracks from Teezer’s licensed Music Library within the usage terms shown for each track.",
          "Original audio you create can be reused by others unless you disable reuse in Studio → Settings → Music & Copyright.",
          "Commercial or unlicensed music may be blocked or muted.",
        ],
      },
      {
        heading: "3. Copyright claims and Content ID",
        paragraphs: [
          "Rights holders may register reference files so matching content can be identified automatically. A claim may cause your content to be blocked, muted, or made ineligible for monetization in some regions. You can review active claims in Studio.",
        ],
      },
      {
        heading: "4. Reporting infringement",
        paragraphs: [
          "If you believe your work has been used without permission, send a notice to copyright@teezer.live that includes your contact details; identification of the work; the link to the infringing content; a statement that you have a good-faith belief the use is unauthorized; and a statement, under penalty of perjury, that your notice is accurate and you are the rights holder or authorized to act for them.",
        ],
      },
      {
        heading: "5. Counter-notices and appeals",
        paragraphs: [
          "If your content was removed or claimed and you believe this was a mistake, or you hold the rights, you can submit a counter-notice or appeal from your account. Provide evidence of your rights or licence.",
        ],
      },
      {
        heading: "6. Repeat infringers",
        paragraphs: [
          "Accounts that repeatedly infringe intellectual property rights may lose access to creator features and may be permanently removed.",
        ],
      },
    ],
    related: [
      { kind: "policy", label: "Community Guidelines", policy: "guidelines" },
      { kind: "policy", label: "Terms of Service", policy: "terms" },
      { kind: "doc", label: "Creator Agreement", doc: "creator-agreement" },
    ],
  },

  advertising: {
    title: "Advertising Policy",
    updated: UPDATED,
    intro:
      "This Advertising Policy applies to ads created and run through Teezer Ads. It keeps advertising on Teezer safe, honest, and relevant. Advertisers are responsible for their ads and for following all applicable laws.",
    sections: [
      {
        heading: "1. Ads must be honest and clear",
        bullets: [
          "Be truthful - no false, misleading, or exaggerated claims.",
          "Clearly represent the product, service, or offer being promoted.",
          "Make the ad’s landing page match what the ad promises.",
        ],
      },
      {
        heading: "2. Prohibited and restricted content",
        paragraphs: [
          "Ads may not promote illegal products or services, or anything prohibited by our Community Guidelines.",
        ],
        bullets: [
          "No hate speech, harassment, or discrimination.",
          "No adult or sexually explicit content.",
          "No dangerous, deceptive, or fraudulent products, including scams and get-rich-quick schemes.",
          "Regulated categories such as alcohol, gambling, finance, and health may be restricted or need extra approval.",
        ],
      },
      {
        heading: "3. Targeting and privacy",
        paragraphs: [
          "Ad targeting must comply with our Privacy Policy and applicable data-protection laws. Do not target people based on sensitive categories, and do not collect personal data through ads without proper consent.",
        ],
      },
      {
        heading: "4. Disclosure and labelling",
        paragraphs: [
          "Ads are labelled as sponsored on Teezer. Creators running paid partnerships must also disclose them. Do not disguise ads as organic content.",
        ],
      },
      {
        heading: "5. Billing and payments",
        paragraphs: [
          "Your ad account billing is separate from creator payouts. You are responsible for the charges on your ad account. See Studio → Settings → Advertising for billing and invoices.",
        ],
      },
      {
        heading: "6. Review and enforcement",
        paragraphs: [
          "Ads may be reviewed before and after they run. We may reject, pause, or remove ads that breach this policy, and may limit or suspend ad accounts for repeated or serious violations. You can appeal decisions from your ad account.",
        ],
      },
    ],
    related: [
      { kind: "policy", label: "Privacy Policy", policy: "privacy" },
      { kind: "policy", label: "Community Guidelines", policy: "guidelines" },
      { kind: "doc", label: "Monetization Terms", doc: "monetization-terms" },
    ],
  },
};
