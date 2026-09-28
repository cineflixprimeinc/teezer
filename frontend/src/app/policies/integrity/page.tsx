import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Integrity & Authenticity Policy",
  description: "Teezer's rules against impersonation, fake engagement, spam and manipulated distribution.",
  alternates: { canonical: "https://teezer.live/policies/integrity" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "impersonation", label: "Impersonation" },
  { id: "fake-engagement", label: "Fake Engagement and Manipulation" },
  { id: "spam", label: "Spam and Scams" },
  { id: "misinformation", label: "Harmful Misinformation" },
  { id: "how-detected", label: "How We Detect Manipulation" },
  { id: "consequences", label: "Consequences" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 8 is the governing clause for this policy." },
  { href: "/policies/ai-content", label: "AI-Generated Content Policy", desc: "Disclosure rules for synthetic media." },
  { href: "/policies/enforcement", label: "Enforcement & Appeals", desc: "What happens when this policy is broken." },
];

export default function IntegrityPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="integrity" eyebrow="Policy · Integrity" fallback={
      <LegalShell eyebrow="Policy · Integrity" title="Integrity & Authenticity Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements Section 8 (Integrity and Authenticity) of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. Teezer works because what you see reflects real
        creators and real engagement. Content and accounts designed to deceive people about who is behind them, or to
        artificially inflate their reach, undermine that trust.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        This policy covers three distinct problems: pretending to be someone you&apos;re not, faking popularity that
        doesn&apos;t exist, and using the Platform to defraud people. Each is treated as a serious violation
        independent of the others.
      </P>

      <H2 id="impersonation" n={2}>Impersonation</H2>
      <DataTable
        headers={["Allowed", "Not allowed"]}
        rows={[
          ["Clearly labelled parody accounts (e.g. \"Parody of ...\" in the bio)", "Presenting yourself as a real person or organization you are not"],
          ["Fan accounts that clearly state they are unofficial", "Fan accounts that imply official affiliation or endorsement"],
          ["Using a stage name or persona that is genuinely yours", "Creating a second account pretending to be someone else, including a public figure"],
        ]}
      />
      <P>
        Verified public figures, businesses and organizations can report impersonating accounts for expedited
        removal; the reporting flow is the same account-report tool used for any other violation.
      </P>

      <H2 id="fake-engagement" n={3}>Fake Engagement and Manipulation</H2>
      <UL>
        <li>Buying or selling likes, views, comments, shares, followers or Gifts is not allowed, whether through a third-party service or coordinated groups of real accounts.</li>
        <li>Using bots, scripts or automated tools to interact with content, follow accounts, or generate views is prohibited.</li>
        <li>Coordinating with others to mass-engage with specific content in order to manipulate its distribution (&quot;engagement pods&quot;) violates this policy even without paid services involved.</li>
        <li>Buying, selling or transferring accounts and usernames is not allowed under Section 3 of our <DocLink href="/terms">Terms of Service</DocLink>.</li>
      </UL>

      <H2 id="spam" n={4}>Spam and Scams</H2>
      <UL>
        <li>Repetitive unsolicited messages, comments or content posted at volume for promotional purposes is treated as spam.</li>
        <li>Deceptive links, phishing attempts, fraudulent giveaways and get-rich-quick schemes are removed, and accounts distributing them are terminated.</li>
        <li>Multi-level-marketing or investment content that misrepresents likely outcomes is not allowed.</li>
      </UL>

      <H2 id="misinformation" n={5}>Harmful Misinformation</H2>
      <P>
        Content presented as fact that poses a real risk to public health, safety, or the integrity of an election or
        civic process is not allowed. Opinion, satire and good-faith debate about contested topics are not affected -
        this policy targets false claims of fact stated with the intent or clear effect of causing real-world harm,
        not disagreement or uncertainty.
      </P>

      <H2 id="how-detected" n={6}>How We Detect Manipulation</H2>
      <P>
        Engagement patterns that are statistically inconsistent with organic behaviour - sudden coordinated spikes,
        accounts that only ever interact with one another, activity inconsistent with normal usage timing - are
        flagged automatically for review, independent of any user report. Accounts found to be engaging in
        manipulation carry an internal risk signal that affects how much their future activity is trusted, even after
        the immediate violation is resolved.
      </P>

      <H2 id="consequences" n={7}>Consequences</H2>
      <P>
        Manipulated engagement is removed from public counts, related content loses its artificial reach, and the
        account responsible is warned, restricted or terminated depending on scale and history, per{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink>. Earnings generated through
        manipulated engagement are withheld or reversed under Section 8 of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>. Questions: {" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
