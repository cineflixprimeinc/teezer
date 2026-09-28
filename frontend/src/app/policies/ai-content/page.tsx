import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "AI-Generated Content Policy",
  description: "Teezer's rules and labelling for AI-generated and synthetic content, and what's never allowed.",
  alternates: { canonical: "https://teezer.live/policies/ai-content" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "labelling", label: "How Labelling Works" },
  { id: "disclosure", label: "When You Must Disclose" },
  { id: "prohibited", label: "What's Never Allowed" },
  { id: "why", label: "Why We Label Instead of Ban" },
  { id: "enforcement-ai", label: "Enforcement" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 8 covers AI-generated content directly." },
  { href: "/policies/integrity", label: "Integrity & Authenticity Policy", desc: "Rules against deceptive content generally." },
  { href: "/policies/minor-safety", label: "Minor Safety Policy", desc: "AI content involving minors is zero-tolerance." },
];

export default function AiContentPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="ai-content" eyebrow="Policy · AI Content" fallback={
      <LegalShell eyebrow="Policy · AI Content" title="AI-Generated Content Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements the AI-generated content rules in Section 8 of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. AI-assisted creativity is welcome on Teezer -
        many creators already use it for effects, editing and generation. This policy exists so viewers always have
        the context to know what they&apos;re watching.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        &quot;AI-generated&quot; covers content substantially created or altered by generative AI - synthetic voices,
        generated video or images, and realistic face or voice swaps. Minor, non-deceptive editing (filters, color
        grading, background removal) is not covered by this policy.
      </P>

      <H2 id="labelling" n={2}>How Labelling Works</H2>
      <P>
        Every video on Teezer carries an internal flag indicating whether it was uploaded as AI-generated content.
        Where a creator marks or we detect a video as AI-generated, the Platform surfaces that context to viewers.
        Removing or evading this label - for example, disguising AI content as authentic footage - is itself a
        violation, separate from any issue with the underlying content.
      </P>

      <H2 id="disclosure" n={3}>When You Must Disclose</H2>
      <UL>
        <li>Any content depicting a real, identifiable person saying or doing something they did not actually say or do.</li>
        <li>Synthetic media presented in a context (such as breaking news framing) where a viewer could reasonably mistake it for authentic, unaltered footage.</li>
        <li>AI-generated voices used to narrate or dub in a way that could be mistaken for the real person's voice.</li>
      </UL>
      <P>Purely creative or clearly fictional AI content - stylized art, obvious visual effects, fantastical scenes - does not require the same disclosure, since no reasonable viewer would mistake it for reality.</P>

      <H2 id="prohibited" n={4}>What's Never Allowed</H2>
      <UL>
        <li><strong>AI-generated sexual imagery</strong> depicting a real, identifiable person without their consent - prohibited absolutely, regardless of disclosure, under our <DocLink href="/policies/adult-content">Adult Content Policy</DocLink>.</li>
        <li><strong>Any AI-generated content involving minors</strong> that sexualizes or endangers them - zero-tolerance under our <DocLink href="/policies/minor-safety">Minor Safety Policy</DocLink>, with no exception for disclosure.</li>
        <li><strong>Synthetic media used to defraud, harass, or manipulate elections</strong> - disclosure does not make an otherwise-prohibited use acceptable.</li>
        <li>Undisclosed realistic depictions of real people in Teezer&apos;s official capacity (e.g. fake statements attributed to Teezer or its staff).</li>
      </UL>

      <H2 id="why" n={5}>Why We Label Instead of Ban</H2>
      <P>
        AI tools are increasingly part of ordinary creative work, and most AI content on Teezer is harmless or
        clearly fictional. Rather than banning the technology, we focus enforcement on deception and harm: mislabeled
        or undisclosed synthetic media that could genuinely fool someone, and the small set of uses (sexual imagery of
        real people, content involving minors, election manipulation) that are prohibited regardless of labelling.
      </P>

      <H2 id="enforcement-ai" n={6}>Enforcement</H2>
      <P>
        Failing to disclose AI-generated content where disclosure is required results in the label being applied
        after the fact and, for repeated failures, feature restrictions. Content in the never-allowed categories above
        is removed immediately and the account is subject to our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy at the highest severity tier.
        Questions: {" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
