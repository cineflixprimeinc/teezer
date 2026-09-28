import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Monetization Terms",
  description:
    "Monetization Terms for Teezer creators - eligibility, monetization features, revenue share and fees, wallet and balance, payouts, taxes and withholding, prohibited earning practices, and reversals.",
  alternates: { canonical: "https://teezer.live/policies/monetization-terms" },
};

const LAST_UPDATED = "July 19, 2026";
const CONTACT_EMAIL = "payments@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "eligibility", label: "Eligibility" },
  { id: "features", label: "Monetization Features" },
  { id: "revenue-share", label: "Revenue Share and Fees" },
  { id: "wallet", label: "Wallet and Balance" },
  { id: "payouts", label: "Payouts" },
  { id: "taxes", label: "Taxes and Withholding" },
  { id: "prohibited", label: "Prohibited Earning Practices" },
  { id: "reversals", label: "Chargebacks and Reversals" },
  { id: "suspension", label: "Suspension of Monetization" },
  { id: "changes", label: "Changes and Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/policies/creator-earnings", label: "Creator Earnings & Payouts", desc: "The practical walkthrough of earning and withdrawing." },
  { href: "/virtual-items", label: "Virtual Items Policy", desc: "The rules for Coins, Gifts and wallets." },
  { href: "/tax-guide", label: "Tax Information Guide", desc: "Which tax form you need and how to submit it." },
];

export default function MonetizationTermsPage() {
  return (
    <CmsAwarePolicyPage slug="monetization-terms" eyebrow="Policy · Monetization" fallback={
      <LegalShell
      eyebrow="Policy · Monetization"
      title="Monetization Terms"
      lastUpdated={LAST_UPDATED}
      toc={TOC}
      related={RELATED}
    >
      <P>
        These Monetization Terms govern how creators earn on Teezer. They expand on Section 8 of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>, work alongside the{" "}
        <DocLink href="/policies/creator-agreement">Creator Agreement</DocLink> and{" "}
        <DocLink href="/policies/creator-earnings">Creator Earnings &amp; Payouts</DocLink> policy, and are binding when
        you use any monetization feature.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Teezer creators can earn from Gifts sent by viewers and from other monetization features made available in
        Teezer Studio over time. Earnings are calculated automatically as they are received and accumulate in your Studio
        wallet until you request a payout to a verified payout method.
      </P>

      <H2 id="eligibility" n={2}>Eligibility</H2>
      <UL>
        <li>You must meet any minimum age, follower, video-count, or account-age requirements shown in Teezer Studio, which may change as the program evolves.</li>
        <li>Your account must be in good standing under our <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy.</li>
        <li>You must complete identity and, where required, tax verification before payouts can be released - see the <DocLink href="/tax-guide">Tax Information Guide</DocLink>.</li>
        <li>Accounts built primarily around engagement manipulation (see <DocLink href="/policies/integrity">Integrity &amp; Authenticity</DocLink>) are ineligible even if individual metrics appear to qualify.</li>
      </UL>

      <H2 id="features" n={3}>Monetization Features</H2>
      <P>
        The features available to you appear in Teezer Studio and may vary by region and account status. Gifts are the
        primary feature today: viewers buy Coins and send Gifts on your content, which convert to creator earnings. Coins,
        Gifts, and wallet mechanics are described in the <DocLink href="/virtual-items">Virtual Items Policy</DocLink>. We
        may add, change, or retire features with reasonable notice.
      </P>

      <H2 id="revenue-share" n={4}>Revenue Share and Fees</H2>
      <P>
        When a Gift is sent, it converts to creator earnings at the rate shown in Teezer Studio at the time it was sent.
        The difference between what the viewer paid and what you receive is Teezer&rsquo;s service fee, which covers
        payment processing, platform operation, and applicable charges.
      </P>
      <DataTable
        headers={["Term", "How it works"]}
        rows={[
          ["Conversion rate", "The rate that turns a received Gift into your earnings, displayed in Studio before payout"],
          ["Service fee", "Teezer's share, already reflected in the conversion rate shown to you"],
          ["Payment processing", "Third-party processor and currency-conversion costs may apply and are shown where relevant"],
          ["Rate changes", "Applied prospectively only - never retroactively to Gifts already converted"],
        ]}
      />
      <P>
        Rates and fees are shown transparently before you request a payout. We may update them prospectively; changes never
        apply to earnings already converted.
      </P>

      <H2 id="wallet" n={5}>Wallet and Balance</H2>
      <UL>
        <li>Converted earnings accumulate in your Studio wallet and are visible in near real time.</li>
        <li>A wallet balance is a record of earnings pending payout - it is not a bank deposit and does not earn interest.</li>
        <li>Balances may be adjusted for reversals, chargebacks, or corrections as described below.</li>
      </UL>

      <H2 id="payouts" n={6}>Payouts</H2>
      <DataTable
        headers={["Item", "Details"]}
        rows={[
          ["Payout method", "Sent only to the method you have registered and verified in Teezer Studio"],
          ["Minimum threshold", "You must reach the minimum balance shown in Studio before requesting a payout"],
          ["Schedule & timing", "Processing timelines vary by region and method and are displayed in Studio"],
          ["Keeping details current", "Payouts sent to an outdated method you failed to update are yours to resolve with your provider"],
        ]}
      />
      <P>
        For a step-by-step walkthrough of requesting a payout, see our{" "}
        <DocLink href="/policies/creator-earnings">Creator Earnings &amp; Payouts</DocLink> policy.
      </P>

      <H2 id="taxes" n={7}>Taxes and Withholding</H2>
      <P>
        You are solely responsible for determining and paying any taxes owed on your Teezer earnings under the law of your
        country of residence. Where required, we may collect tax information, withhold tax, and issue year-end
        documentation. Teezer does not provide tax advice. For which form applies and how to submit it, see the{" "}
        <DocLink href="/tax-guide">Tax Information Guide</DocLink>.
      </P>

      <H2 id="prohibited" n={8}>Prohibited Earning Practices</H2>
      <P>The following will cause earnings to be withheld or reversed and may lead to loss of monetization:</P>
      <UL>
        <li><strong>Self-gifting</strong> - sending Gifts to your own account through alternate or coordinated accounts.</li>
        <li><strong>Fake or artificial engagement</strong> - bots, purchased engagement, or coordinated manipulation.</li>
        <li><strong>Fraud or stolen payment instruments</strong> used to fund Coins or Gifts.</li>
        <li><strong>Circumventing fees</strong> or misrepresenting eligibility, identity, or tax status.</li>
        <li>Earning on content that violates our <DocLink href="/guidelines">Community Guidelines</DocLink>.</li>
      </UL>

      <H2 id="reversals" n={9}>Chargebacks and Reversals</H2>
      <P>
        Earnings obtained through the practices above, or affected by a viewer&rsquo;s payment dispute (chargeback), may be
        withheld before payout or deducted from your balance after payout. Where a payout has already been made on reversed
        earnings, the corresponding amount may be recovered from future earnings. Associated accounts may face consequences
        under our <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy.
      </P>

      <H2 id="suspension" n={10}>Suspension of Monetization</H2>
      <P>
        We may pause or remove monetization for an account under review, in a restricted state, or where required by law or
        risk. Where practicable, we explain why and provide a route to appeal. Pausing monetization does not by itself
        forfeit legitimately earned, non-reversed balances.
      </P>

      <H2 id="changes" n={11}>Changes and Contact</H2>
      <P>
        We may modify eligibility, rates, fees, or features, or discontinue monetization, with reasonable notice where
        practicable. Material changes are communicated through Teezer Studio and, where significant, by the notification
        method in our <DocLink href="/terms">Terms of Service</DocLink>. Billing and payout questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
