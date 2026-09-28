import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Minor Safety Policy",
  description: "How Teezer protects children and teens - age requirements, zero-tolerance rules and how to report concerns.",
  alternates: { canonical: "https://teezer.live/policies/minor-safety" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "commitment", label: "Our Commitment" },
  { id: "age", label: "Age Requirements" },
  { id: "zero-tolerance", label: "Zero-Tolerance Rules" },
  { id: "grooming", label: "Grooming and Unwanted Contact" },
  { id: "privacy-minors", label: "Privacy of Minors" },
  { id: "reporting", label: "Reporting a Concern" },
  { id: "parents", label: "For Parents and Guardians" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 4 is the governing clause for this policy." },
  { href: "/privacy", label: "Privacy Policy", desc: "Section 7, Children and Teens, covers our data practices." },
  { href: "/policies/adult-content", label: "Adult Content Policy", desc: "General nudity and sexual-content rules." },
];

export default function MinorSafetyPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="minor-safety" eyebrow="Policy · Minor Safety" fallback={
      <LegalShell eyebrow="Policy · Minor Safety" title="Minor Safety Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements Section 4 (Protecting Minors) of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink> and Section 7 (Children and Teens) of our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. Protecting young people who use or appear on Teezer is our
        highest priority, and the rules here have no exceptions.
      </P>

      <H2 id="commitment" n={1}>Our Commitment</H2>
      <P>
        Any content or behaviour that sexualizes, exploits, endangers or grooms a minor is removed immediately, the
        responsible account is permanently banned, and - where required by law - we preserve evidence and report to
        the relevant authorities under our <DocLink href="/law-enforcement">Law Enforcement Guidelines</DocLink>.
        There is no warning tier for this category; it is enforced at the highest severity described in our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy.
      </P>

      <H2 id="age" n={2}>Age Requirements</H2>
      <UL>
        <li>You must be at least 13 years old, or the higher minimum age required in your country, to create a Teezer account.</li>
        <li>If you are under 18, a parent or legal guardian must review and agree to our <DocLink href="/terms">Terms of Service</DocLink> on your behalf.</li>
        <li>Creating an account that misrepresents your age to bypass these requirements is a violation of our Terms.</li>
      </UL>

      <H2 id="zero-tolerance" n={3}>Zero-Tolerance Rules</H2>
      <UL>
        <li>Any sexual content involving, or appearing to involve, a minor - real, drawn, or AI-generated - is prohibited absolutely, with no exceptions for context, consent claims or artistic intent.</li>
        <li>Content that puts a minor in a dangerous physical situation (including as an imitation-bait &quot;challenge&quot;) is not allowed, per our <DocLink href="/policies/safety">Safety Policy</DocLink>.</li>
        <li>Content that reveals a minor&apos;s precise location, school, or other information that could enable them to be located or contacted is not allowed.</li>
        <li>Accounts primarily built around sexualizing minors, even where individual pieces of content might seem to comply in isolation, are terminated as a pattern violation.</li>
      </UL>

      <H2 id="grooming" n={4}>Grooming and Unwanted Contact</H2>
      <UL>
        <li>Adults using messaging, comments or live features to build inappropriate relationships with minors - grooming - is prohibited and results in immediate, permanent removal.</li>
        <li>Requesting personal information, off-platform contact, or images from a minor in a way that raises safety concerns is treated as a serious violation even if no explicit content is exchanged.</li>
        <li>We cooperate with the National Center for Missing &amp; Exploited Children (NCMEC) and equivalent bodies in other countries where legally required.</li>
      </UL>

      <H2 id="privacy-minors" n={5}>Privacy of Minors</H2>
      <P>
        We do not knowingly collect personal information from users below the applicable minimum age, as described in
        our <DocLink href="/privacy">Privacy Policy</DocLink>. If we learn an account belongs to someone under the
        minimum age, we close the account and remove the associated personal data.
      </P>

      <H2 id="reporting" n={6}>Reporting a Concern</H2>
      <P>
        If you see content that endangers a minor, report it immediately using the report option on the video,
        account or message - these reports are prioritized ahead of standard review queues. If a child is in
        immediate danger, contact local emergency services first. You can also reach our safety team directly at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the subject line &quot;Minor Safety&quot;.
      </P>

      <H2 id="parents" n={7}>For Parents and Guardians</H2>
      <P>
        If you believe your child has an account below our minimum age, or you have concerns about content involving
        your child, contact us at {CONTACT_EMAIL} - include the profile link or content URL if available, and we will
        review it as a priority.
      </P>
    </LegalShell>
    } />
  );
}
