import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Safety Policy",
  description: "Teezer's rules on violence, dangerous acts, self-harm content and weapons - what's not allowed, and how it's enforced.",
  alternates: { canonical: "https://teezer.live/policies/safety" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "self-harm", label: "Self-Harm and Suicide" },
  { id: "dangerous-acts", label: "Dangerous Acts and Challenges" },
  { id: "weapons", label: "Weapons, Drugs and Crime" },
  { id: "violent-threats", label: "Violent Threats and Incitement" },
  { id: "graphic-content", label: "Graphic and Shocking Content" },
  { id: "detection", label: "How We Detect Violations" },
  { id: "if-you-see", label: "If You See Something" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "The full rulebook this policy expands on." },
  { href: "/policies/minor-safety", label: "Minor Safety Policy", desc: "Extra protections for children and teens." },
  { href: "/policies/enforcement", label: "Enforcement & Appeals", desc: "What happens when this policy is broken." },
];

export default function SafetyPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="safety" eyebrow="Policy · Safety" fallback={
      <LegalShell eyebrow="Policy · Safety" title="Safety Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This Safety Policy expands on Section 2 (Safety and Physical Harm) and Section 7 (Violent and Graphic
        Content) of our <DocLink href="/guidelines">Community Guidelines</DocLink>. It exists for one reason: nothing
        on Teezer is worth someone getting hurt over. It covers content that risks physical harm - to the person who
        posted it, to people who imitate it, or to people it targets.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Every video is screened by automated content-safety systems before it reaches the feed, and flagged content is
        escalated to human moderators. Severity drives the response: a borderline video might be quietly removed from
        recommendations, while content that poses imminent danger is removed immediately and the account is
        suspended, per the <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> matrix.
      </P>

      <H2 id="self-harm" n={2}>Self-Harm and Suicide</H2>
      <UL>
        <li>Content that promotes, instructs, glorifies or normalizes suicide, self-harm or eating disorders is not allowed.</li>
        <li>This includes methods, statistics framed as aspirational, and content that pressures viewers to engage in harmful behaviour.</li>
        <li>Recovery journeys, awareness campaigns and help-seeking content are allowed when handled responsibly and without graphic detail.</li>
        <li>If a video or account suggests someone is at risk, our safety team may proactively surface local crisis resources and restrict the content&apos;s reach while it is reviewed.</li>
      </UL>

      <H2 id="dangerous-acts" n={3}>Dangerous Acts and Challenges</H2>
      <UL>
        <li>Do not film or promote stunts, challenges or activities that carry a real risk of injury if a viewer imitates them - especially where the content is likely to reach minors.</li>
        <li>Professionally supervised sports and stunts with visible safety context (padding, professionals, controlled environment) are treated differently from unsupervised imitation-bait content.</li>
        <li>Sounds and hashtags associated with a dangerous trend can be restricted platform-wide even if an individual video seems tame in isolation.</li>
      </UL>

      <H2 id="weapons" n={4}>Weapons, Drugs and Crime</H2>
      <UL>
        <li>Instructions for making or modifying firearms, explosives or other weapons are prohibited, as is content facilitating their illegal sale.</li>
        <li>Promoting, selling or glamorizing illegal drugs or regulated goods is not allowed; harm-reduction and recovery content is treated with more latitude when it does not instruct on use.</li>
        <li>Content coordinating or facilitating criminal activity - fraud, human trafficking, illegal wildlife trade - is removed and may be referred to law enforcement per our{" "}
          <DocLink href="/law-enforcement">Law Enforcement Guidelines</DocLink>.</li>
      </UL>

      <H2 id="violent-threats" n={5}>Violent Threats and Incitement</H2>
      <UL>
        <li>Direct or veiled threats of violence against a person, group or location are removed and typically result in immediate account action.</li>
        <li>Content that celebrates, praises or calls for violence - including against public figures - is not allowed, regardless of the target.</li>
        <li>Content from or in support of designated terrorist or violent-extremist organizations is removed and reported where legally required.</li>
      </UL>

      <H2 id="graphic-content" n={6}>Graphic and Shocking Content</H2>
      <P>
        Gratuitously graphic, gory or shock-value content is not allowed even without an explicit safety risk. Content
        of genuine public interest (news footage, documentary material) may be permitted with warnings and reduced
        distribution rather than outright removal, evaluated case by case.
      </P>

      <H3>Animal welfare</H3>
      <P>Content depicting cruelty to animals for entertainment or shock value is removed under this policy.</P>

      <H2 id="detection" n={7}>How We Detect Violations</H2>
      <P>
        Uploaded media passes through automated visual-safety scanning before publication, and every video carries a
        moderation record used to prioritize human review. Accounts also carry an internal trust signal that
        influences how quickly new uploads surface publicly - a clean history earns faster, wider distribution;
        repeated violations narrow it. None of this is visible to other users, and it exists purely to catch harmful
        content faster than reports alone could.
      </P>

      <H2 id="if-you-see" n={8}>If You See Something</H2>
      <P>
        Report any video, comment or account directly from its menu - reports are confidential and reviewed by our
        safety team, not just automated systems. If someone is in immediate danger, contact local emergency services
        first; Teezer cannot dispatch emergency responders. For anything else, reach us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
