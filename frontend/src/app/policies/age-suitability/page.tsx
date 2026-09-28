import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Age Suitability",
  description: "Why Teezer carries a 16+ App Store age rating, the minimum age to hold an account, and what we do to keep younger users safe.",
  alternates: { canonical: "https://teezer.live/policies/age-suitability" },
};

const LAST_UPDATED = "September 3, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "rating", label: "Our Age Rating" },
  { id: "minimum-age", label: "Minimum Age to Use Teezer" },
  { id: "why", label: "Why Teezer Is Rated 16+" },
  { id: "not-allowed", label: "What Is Never Allowed" },
  { id: "protections", label: "How We Protect Younger Users" },
  { id: "parents", label: "For Parents and Guardians" },
  { id: "contact", label: "Questions" },
];

const RELATED: RelatedDoc[] = [
  { href: "/policies/minor-safety", label: "Minor Safety Policy", desc: "Age requirements and zero-tolerance rules for content involving minors." },
  { href: "/policies/adult-content", label: "Adult Content Policy", desc: "What nudity and sexual content is and is not permitted." },
  { href: "/guidelines", label: "Community Guidelines", desc: "The rules every account agrees to follow." },
  { href: "/policies/enforcement", label: "Enforcement & Appeals", desc: "What happens when a rule is broken." },
];

export default function AgeSuitabilityPage() {
  return (
    <CmsAwarePolicyPage slug="age-suitability" eyebrow="Policy · Age Suitability" fallback={
      <LegalShell eyebrow="Policy · Age Suitability" title="Age Suitability" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This page explains how old you need to be to use Teezer, why the app carries the age rating it does on app
        stores, and what we do to keep younger people safe. It sits alongside our{" "}
        <DocLink href="/policies/minor-safety">Minor Safety Policy</DocLink>, which sets out the rules themselves in
        full detail.
      </P>

      <H2 id="rating" n={1}>Our Age Rating</H2>
      <P>
        Teezer is rated <strong>16+</strong> on the Apple App Store and carries the equivalent rating on other app
        stores, calculated from each store&apos;s own questionnaire about what the app contains and what people can do
        in it.
      </P>
      <P>
        That rating reflects what is <em>possible</em> on a platform where people post their own videos, not what is
        typical. The overwhelming majority of content on Teezer would suit a far younger audience. The rating is set
        by the ceiling of what may appear, which is the honest way to describe any service built on user-generated
        content.
      </P>

      <H2 id="minimum-age" n={2}>Minimum Age to Use Teezer</H2>
      <UL>
        <li>You must be at least <strong>13 years old</strong> to create a Teezer account, or older where your country sets a higher minimum.</li>
        <li>If you are under 18, a parent or legal guardian must review and agree to our <DocLink href="/terms">Terms of Service</DocLink> on your behalf.</li>
        <li>App stores apply their own rating separately. A 16+ rating governs who can download the app on that store; our own minimum age governs who may hold an account.</li>
        <li>Misrepresenting your age to get around either limit breaches our Terms, and we close accounts found to be below the minimum age.</li>
      </UL>

      <H2 id="why" n={3}>Why Teezer Is Rated 16+</H2>
      <P>
        Four things about the platform drive the rating:
      </P>
      <UL>
        <li><strong>Content is created by people, not us.</strong> Videos are published by creators around the world and reviewed against our rules, but material can be seen before it is reported or removed.</li>
        <li><strong>Infrequent mature themes.</strong> Profanity, references to alcohol or tobacco, and mild suggestive content are permitted within the limits set by our <DocLink href="/policies/adult-content">Adult Content Policy</DocLink>.</li>
        <li><strong>Social features.</strong> Direct messages, comments, live audio rooms and calls allow contact between people who do not know each other offline.</li>
        <li><strong>Purchases.</strong> Coins and gifts can be bought inside the app and used to support creators.</li>
      </UL>

      <H2 id="not-allowed" n={4}>What Is Never Allowed</H2>
      <P>
        Some categories are prohibited outright, at any age rating, with no contextual exception:
      </P>
      <UL>
        <li>Any sexual content involving, or appearing to involve, a minor - real, drawn or AI-generated.</li>
        <li>Pornography and explicit sexual activity.</li>
        <li>Content that sexualizes, endangers, or reveals identifying details about a minor.</li>
        <li>Adults using messaging, comments or live features to build inappropriate relationships with minors.</li>
      </UL>
      <P>
        These are enforced at the highest severity described in our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy: immediate removal, a
        permanent ban, and - where the law requires it - preservation of evidence and a report to the relevant
        authorities.
      </P>

      <H2 id="protections" n={5}>How We Protect Younger Users</H2>
      <UL>
        <li>Content is moderated against our <DocLink href="/guidelines">Community Guidelines</DocLink>, combining automated review with human moderators.</li>
        <li>Every video, comment, message and account can be reported from inside the app. Reports involving a minor&apos;s safety are prioritized ahead of the standard review queue.</li>
        <li>Accounts can be set to private, and comments, mentions and direct messages can each be restricted in Settings.</li>
        <li>Any account can be blocked, which removes their ability to contact you or see your content.</li>
        <li>We act on the pattern as well as the post: accounts built around sexualizing minors are terminated even where individual pieces of content might look compliant in isolation.</li>
      </UL>

      <H2 id="parents" n={6}>For Parents and Guardians</H2>
      <P>
        If you are deciding whether Teezer is right for a young person in your care, we would suggest reading our{" "}
        <DocLink href="/policies/minor-safety">Minor Safety Policy</DocLink> alongside this page - it sets out the
        specific rules and how they are enforced.
      </P>
      <P>
        If you believe a child has an account below our minimum age, or you have a concern about content involving
        your child, email us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the profile link or content URL if you have it. We treat these as a priority. If a child is in immediate
        danger, contact your local emergency services first.
      </P>

      <H2 id="contact" n={7}>Questions</H2>
      <P>
        For anything about this page or how we rate the app, contact{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the subject line &quot;Age Suitability&quot;.
      </P>
    </LegalShell>
    } />
  );
}
