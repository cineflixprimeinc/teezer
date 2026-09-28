import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Hateful Behaviour Policy",
  description: "Teezer's zero-tolerance policy on hate speech and hateful ideologies targeting protected characteristics.",
  alternates: { canonical: "https://teezer.live/policies/hateful-behavior" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "protected", label: "Protected Characteristics" },
  { id: "prohibited", label: "What's Prohibited" },
  { id: "ideologies", label: "Hateful Ideologies and Symbols" },
  { id: "counter-speech", label: "Education, Counter-Speech and Context" },
  { id: "reporting", label: "Reporting Hateful Content" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 6 is the governing clause for this policy." },
  { href: "/policies/harassment", label: "Harassment & Bullying Policy", desc: "Targeted attacks not based on protected traits." },
  { href: "/policies/enforcement", label: "Enforcement & Appeals", desc: "What happens when this policy is broken." },
];

export default function HatefulBehaviorPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="hateful-behavior" eyebrow="Policy · Hateful Behaviour" fallback={
      <LegalShell eyebrow="Policy · Hateful Behaviour" title="Hateful Behaviour Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements Section 6 (Hateful Behaviour) of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. Teezer does not allow hate speech or hateful
        ideologies, full stop - this is one of the few areas where we do not draw a distinction based on who is
        speaking or their stated intent.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Hateful behaviour is content that attacks, dehumanizes, or excludes people based on who they are rather than
        what they have done or said. It is removed regardless of whether a specific individual is named.
      </P>

      <H2 id="protected" n={2}>Protected Characteristics</H2>
      <P>Content that attacks or dehumanizes people on the basis of the following is not allowed, in videos, sounds, comments, usernames, profiles or messages:</P>
      <UL>
        <li>Race, ethnicity, national origin or caste</li>
        <li>Religion or belief</li>
        <li>Sexual orientation, sex or gender identity</li>
        <li>Disability or serious disease</li>
        <li>Immigration or refugee status</li>
      </UL>

      <H2 id="prohibited" n={3}>What's Prohibited</H2>
      <UL>
        <li>Slurs, dehumanizing comparisons (to animals, disease, or vermin), and calls for exclusion or violence based on the categories above.</li>
        <li>Claims that a protected group is inherently inferior, dangerous, or does not deserve rights or dignity.</li>
        <li>Mocking or belittling someone specifically because of a protected characteristic, even framed as a &quot;joke&quot;.</li>
        <li>Denial or trivialization of documented atrocities (genocide, the Holocaust and similar events) against a protected group.</li>
      </UL>

      <H2 id="ideologies" n={4}>Hateful Ideologies and Symbols</H2>
      <P>
        Content promoting hateful ideologies - or their symbols, slogans, salutes or associated organizations - is
        removed even where no individual person is attacked directly, because normalizing the ideology itself causes
        harm. This includes recruitment content, insignia, and coded references widely understood to signal the same
        ideology.
      </P>

      <H2 id="counter-speech" n={5}>Education, Counter-Speech and Context</H2>
      <P>
        Discussing hate speech to condemn it, educate about its history, or report on it journalistically is allowed
        with clear context - the same words used to attack a group are treated differently when used to describe or
        oppose that attack. Satire aimed at hateful ideologies themselves (rather than at the groups they target) is
        also generally allowed. Context is evaluated by our moderation team, not assumed automatically, so labelling
        your intent clearly in the caption helps.
      </P>

      <H2 id="reporting" n={6}>Reporting Hateful Content</H2>
      <P>
        Report the specific video, comment, sound or profile - this routes it to review with the exact content
        attached. For patterns that span multiple accounts or need more context, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
