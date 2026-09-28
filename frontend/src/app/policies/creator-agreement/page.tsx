import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Creator Agreement",
  description:
    "The Creator Agreement governs how you create, publish, and monetize content on Teezer - eligibility, content ownership and licence, your warranties, platform rules, payments, branded content, and termination.",
  alternates: { canonical: "https://teezer.live/policies/creator-agreement" },
};

const LAST_UPDATED = "July 19, 2026";
const CONTACT_EMAIL = "creators@teezer.live";

const TOC: TocItem[] = [
  { id: "acceptance", label: "Acceptance and Scope" },
  { id: "eligibility", label: "Eligibility and Account" },
  { id: "ownership", label: "Content Ownership and Licence" },
  { id: "warranties", label: "Your Representations and Warranties" },
  { id: "rules", label: "Platform and Community Rules" },
  { id: "monetization", label: "Monetization and Payments" },
  { id: "branded", label: "Branded Content and Disclosures" },
  { id: "term", label: "Term, Suspension and Termination" },
  { id: "disclaimers", label: "Disclaimers and Liability" },
  { id: "indemnity", label: "Indemnity" },
  { id: "changes", label: "Changes and Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/terms", label: "Terms of Service", desc: "The master agreement between you and Teezer." },
  { href: "/policies/monetization-terms", label: "Monetization Terms", desc: "Revenue share, wallet and payout rules." },
  { href: "/policies/advertising-policy", label: "Advertising Policy", desc: "Rules for ads and promoted content." },
];

export default function CreatorAgreementPage() {
  return (
    <CmsAwarePolicyPage slug="creator-agreement" eyebrow="Policy · Creator Agreement" fallback={
      <LegalShell
      eyebrow="Policy · Creator Agreement"
      title="Creator Agreement"
      lastUpdated={LAST_UPDATED}
      toc={TOC}
      related={RELATED}
    >
      <P>
        This Creator Agreement (the “Agreement”) sets out the terms between you (the “Creator”, “you”) and Teezer,
        operated by CineflixPrime (“Teezer”, “we”, “us”), when you create, publish, distribute, or monetize content on
        Teezer. It supplements - and does not replace - our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>, <DocLink href="/privacy">Privacy Policy</DocLink>, and{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. If there is any conflict, the Terms of Service govern.
      </P>

      <H2 id="acceptance" n={1}>Acceptance and Scope</H2>
      <P>
        By publishing content, enabling any creator feature, or accepting payouts on Teezer, you agree to this
        Agreement. It applies to every account you operate as a Creator, including business, brand, and managed accounts.
        If you act on behalf of an organization, you confirm you have authority to bind it.
      </P>

      <H2 id="eligibility" n={2}>Eligibility and Account</H2>
      <UL>
        <li>You must be at least 18 years old, or the age of majority where you live, to earn or receive payouts on Teezer.</li>
        <li>You are responsible for your account, its security, and all activity that occurs under it. Do not share credentials.</li>
        <li>You must provide accurate identity, contact, and - where you monetize - tax and payout information, and keep it current. See our <DocLink href="/tax-guide">Tax Information Guide</DocLink>.</li>
        <li>Your account must remain in good standing under our <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy to keep using creator features.</li>
      </UL>

      <H2 id="ownership" n={3}>Content Ownership and Licence</H2>
      <P>
        You keep ownership of the content you create. Teezer does not claim ownership of your videos, images, audio, or
        text.
      </P>
      <P>
        To operate the platform, you grant Teezer a worldwide, non-exclusive, royalty-free, sublicensable and
        transferable licence to host, store, cache, reproduce, encode, reformat, adapt for delivery, publicly perform and
        display, and distribute your content on Teezer and through its features (including recommendations, search, and
        promotional surfaces within the app). This licence exists so we can show your content to audiences and operate the
        service. It ends when you delete the content or close your account, except for: (a) copies retained for legal,
        security, or backup purposes; and (b) content others have shared, saved, or that is subject to an ongoing legal
        hold.
      </P>
      <P>
        You grant other users the limited rights to view and interact with your content through features Teezer makes
        available (such as sharing, remixing where enabled, and duets/stitches where offered).
      </P>

      <H2 id="warranties" n={4}>Your Representations and Warranties</H2>
      <P>For everything you publish, you represent and warrant that:</P>
      <UL>
        <li>You own it or have all rights, licences, and permissions needed to publish and monetize it, including rights to any music, footage, images, trademarks, and the likeness of any person featured.</li>
        <li>It does not infringe intellectual property, privacy, or publicity rights, and does not defame anyone. See our <DocLink href="/copyright">Copyright Policy</DocLink>.</li>
        <li>It complies with our <DocLink href="/guidelines">Community Guidelines</DocLink> and all applicable laws.</li>
        <li>Where content is synthetic or significantly altered, it is disclosed in line with our <DocLink href="/policies/ai-content">AI-Generated Content</DocLink> policy.</li>
      </UL>

      <H2 id="rules" n={5}>Platform and Community Rules</H2>
      <P>
        You must follow the Community Guidelines and all Teezer policies at all times. In particular, you must not engage
        in fake or artificial engagement, spam, or manipulation, as described in our{" "}
        <DocLink href="/policies/integrity">Integrity &amp; Authenticity</DocLink> policy. Serious or repeated violations
        can result in content removal, loss of monetization, or account termination.
      </P>

      <H2 id="monetization" n={6}>Monetization and Payments</H2>
      <P>
        Creator monetization - including Gifts, and other features surfaced in Teezer Studio - is governed by our{" "}
        <DocLink href="/policies/monetization-terms">Monetization Terms</DocLink> and{" "}
        <DocLink href="/policies/creator-earnings">Creator Earnings &amp; Payouts</DocLink> policy, which are incorporated
        into this Agreement. You are solely responsible for any taxes on your earnings; see the{" "}
        <DocLink href="/tax-guide">Tax Information Guide</DocLink>. Coins, Gifts, and wallet mechanics are described in our{" "}
        <DocLink href="/virtual-items">Virtual Items Policy</DocLink>.
      </P>

      <H2 id="branded" n={7}>Branded Content and Disclosures</H2>
      <UL>
        <li>You may accept paid partnerships and post branded content, but you must clearly disclose it (for example, a visible “paid partnership” or “#ad” label) as required by law and our policies.</li>
        <li>Branded content must still comply with our <DocLink href="/policies/advertising-policy">Advertising Policy</DocLink> and Community Guidelines - prohibited categories cannot be promoted even in an organic post.</li>
        <li>You are responsible for your obligations to any brand or agency you work with; Teezer is not a party to those arrangements.</li>
      </UL>

      <H2 id="term" n={8}>Term, Suspension and Termination</H2>
      <P>
        This Agreement applies for as long as you use creator features. You may stop at any time by ceasing to publish and
        withdrawing eligible earnings. We may suspend or terminate your access to creator features, withhold or reverse
        earnings obtained in violation of our policies, or remove content, in line with our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy - for example, for policy
        violations, fraud, legal risk, or where required by law. Where practicable, we provide notice and an opportunity to
        appeal.
      </P>

      <H2 id="disclaimers" n={9}>Disclaimers and Liability</H2>
      <P>
        Teezer does not guarantee any level of reach, views, earnings, or that any feature will remain available. Creator
        features are provided “as is”. To the maximum extent permitted by law, the limitations of liability set out in our{" "}
        <DocLink href="/terms">Terms of Service</DocLink> apply to this Agreement.
      </P>

      <H2 id="indemnity" n={10}>Indemnity</H2>
      <P>
        You agree to indemnify and hold Teezer harmless from claims, damages, and costs (including reasonable legal fees)
        arising from your content, your breach of this Agreement or our policies, or your infringement of any third-party
        right, to the extent permitted by law and as further described in our Terms of Service.
      </P>

      <H2 id="changes" n={11}>Changes and Contact</H2>
      <P>
        We may update this Agreement from time to time. Material changes are communicated through Teezer Studio and, where
        significant, by the notification method described in our Terms of Service. Continuing as a Creator after a change
        takes effect means you accept the updated Agreement. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
