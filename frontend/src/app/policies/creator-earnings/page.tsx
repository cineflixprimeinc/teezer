import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Creator Earnings & Payouts",
  description: "How creator monetization works on Teezer - eligibility, Gift conversion, payout methods, taxes and fraud rules.",
  alternates: { canonical: "https://teezer.live/policies/creator-earnings" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "eligibility", label: "Eligibility" },
  { id: "how-earnings-work", label: "How Earnings Work" },
  { id: "payout-methods", label: "Payout Methods and Schedule" },
  { id: "taxes", label: "Taxes" },
  { id: "withholding", label: "Withholding and Reversal" },
  { id: "changes", label: "Changes to Monetization" },
];

const RELATED: RelatedDoc[] = [
  { href: "/terms", label: "Terms of Service", desc: "Section 8 is the governing clause for creator earnings." },
  { href: "/virtual-items", label: "Virtual Items Policy", desc: "The full rules for Coins, Gifts and wallets." },
  { href: "/policies/integrity", label: "Integrity & Authenticity Policy", desc: "Rules against fake engagement that also apply to earnings." },
];

export default function CreatorEarningsPage() {
  return (
    <CmsAwarePolicyPage slug="creator-earnings" eyebrow="Policy · Creator Earnings" fallback={
      <LegalShell eyebrow="Policy · Creator Earnings" title="Creator Earnings & Payouts" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy expands on Section 8 (Creator Earnings and Payouts) of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink> and describes in practical terms how monetization works for
        creators on Teezer - from receiving your first Gift to withdrawing real payouts.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Teezer creators can earn from Gifts sent by viewers and other monetization features surfaced in Teezer
        Studio. Earnings are calculated automatically as Gifts arrive and accumulate in your Studio wallet until you
        request a payout.
      </P>

      <H2 id="eligibility" n={2}>Eligibility</H2>
      <UL>
        <li>Monetization eligibility, along with any minimum follower, video-count or account-age requirements, is shown in Teezer Studio and may change over time as the program evolves.</li>
        <li>Your account must be in good standing - no active high-severity restrictions under our <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy - to remain eligible.</li>
        <li>Accounts primarily built around engagement manipulation, as described in our <DocLink href="/policies/integrity">Integrity &amp; Authenticity Policy</DocLink>, are ineligible even if individual metrics look qualifying.</li>
      </UL>

      <H2 id="how-earnings-work" n={3}>How Earnings Work</H2>
      <DataTable
        headers={["Step", "What happens"]}
        rows={[
          ["A viewer sends a Gift", "Coins are deducted from their wallet immediately - the transaction is final"],
          ["Gift converts to earnings", "The Gift converts to creator earnings at the rate shown in Teezer Studio at the time it was sent; the difference is Teezer's service fee"],
          ["Earnings accumulate", "Converted value adds to your Studio wallet balance, visible in real time"],
          ["You request a payout", "Once you meet the minimum payout threshold, you can request a transfer to your registered payout method"],
        ]}
      />
      <P>
        Conversion rates and service fees are shown transparently in Teezer Studio before you request a payout, and
        may be updated prospectively - changes never apply retroactively to Gifts already converted.
      </P>

      <H2 id="payout-methods" n={4}>Payout Methods and Schedule</H2>
      <UL>
        <li>Payouts are sent only to the payout method you have registered and verified in Teezer Studio.</li>
        <li>Minimum payout thresholds and processing timelines are shown in Studio and vary by region and payout method.</li>
        <li>Keep your payout details current - payouts sent to an outdated method you failed to update are your responsibility to resolve with your payment provider.</li>
      </UL>

      <H2 id="taxes" n={5}>Taxes</H2>
      <P>
        You are solely responsible for determining and paying any taxes, levies or duties owed on your Teezer
        earnings under the law of your country of residence. Teezer does not provide tax advice; where required by
        local law, we may collect tax information from you or issue tax documentation for your earnings.
      </P>

      <H2 id="withholding" n={6}>Withholding and Reversal</H2>
      <P>
        Earnings obtained through fraud, artificial engagement, self-gifting schemes (sending Gifts to your own
        account through alternate accounts) or violations of our <DocLink href="/guidelines">Community Guidelines</DocLink>{" "}
        may be withheld before payout or reversed after payout, and the associated account may face the consequences
        described in our <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy. Payment
        disputes (chargebacks) on Gifts you received may also result in the corresponding earnings being deducted from
        your balance.
      </P>

      <H2 id="changes" n={7}>Changes to Monetization</H2>
      <P>
        We may modify eligibility criteria, conversion rates, fees, or discontinue monetization features, with
        reasonable notice where practicable. Material changes are communicated through Teezer Studio and, where
        significant, by the notification method described in Section 18 of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>. Billing questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
