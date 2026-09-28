import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Adult Content Policy",
  description: "Teezer's rules on nudity, sexual content and sexual solicitation, and how uploads are automatically screened.",
  alternates: { canonical: "https://teezer.live/policies/adult-content" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "not-allowed", label: "What's Not Allowed" },
  { id: "context", label: "Context That Changes the Rules" },
  { id: "solicitation", label: "Sexual Solicitation" },
  { id: "non-consensual", label: "Non-Consensual Intimate Content" },
  { id: "how-screened", label: "How Uploads Are Screened" },
  { id: "consequences", label: "Consequences" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 3 is the governing clause for this policy." },
  { href: "/policies/minor-safety", label: "Minor Safety Policy", desc: "Zero-tolerance rules where minors are involved." },
  { href: "/policies/enforcement", label: "Enforcement & Appeals", desc: "What happens when this policy is broken." },
];

export default function AdultContentPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="adult-content" eyebrow="Policy · Adult Content" fallback={
      <LegalShell eyebrow="Policy · Adult Content" title="Adult Content Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements Section 3 (Adult and Sexual Content) of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. Teezer is built around everyday creativity, not
        adult content, and every upload is automatically screened for nudity and sexual content before it can appear
        in the feed.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Nudity, pornography and sexually explicit material are not allowed on Teezer in any form - videos, images,
        profile photos, live features, comments or private messages sent through the Platform. This applies equally
        to real, animated and AI-generated depictions.
      </P>

      <H2 id="not-allowed" n={2}>What's Not Allowed</H2>
      <DataTable
        headers={["Category", "Examples"]}
        rows={[
          ["Explicit content", "Sexual intercourse, genitalia, and sexually explicit acts, real or simulated"],
          ["Non-explicit nudity", "Exposed breasts, buttocks or genitals outside the allowed contexts below"],
          ["Sexualized minors", "Any content that sexualizes a minor - see our Minor Safety Policy; this is zero-tolerance"],
          ["Fetish content", "Content built around sexual fetishes, even without explicit nudity"],
          ["Sexualized deepfakes", "AI-generated sexual imagery depicting a real, identifiable person without consent"],
        ]}
      />

      <H2 id="context" n={3}>Context That Changes the Rules</H2>
      <P>Some non-sexual nudity is allowed with clear context, reviewed case by case:</P>
      <UL>
        <li><strong>Medical and health</strong> - breastfeeding, medical examinations, post-surgical content presented informationally.</li>
        <li><strong>Protest and activism</strong> - nudity used as a form of political protest, evaluated for genuine documentary/activist intent rather than sexualized framing.</li>
        <li><strong>Art and education</strong> - classical art, anatomy education, and similar content without sexualized framing.</li>
      </UL>
      <P>
        Context does not override the rules for minors under any circumstance - see our{" "}
        <DocLink href="/policies/minor-safety">Minor Safety Policy</DocLink>.
      </P>

      <H2 id="solicitation" n={4}>Sexual Solicitation</H2>
      <UL>
        <li>Offering, requesting, advertising or linking to sexual services, escort services or explicit content (on or off Platform) is not allowed.</li>
        <li>Directing users to off-platform adult content or subscription services through captions, bios, comments or messages is treated as solicitation.</li>
        <li>Sexual harassment - unwanted sexualized comments or messages - is covered separately under our{" "}
          <DocLink href="/policies/harassment">Harassment &amp; Bullying Policy</DocLink>.</li>
      </UL>

      <H2 id="non-consensual" n={5}>Non-Consensual Intimate Content</H2>
      <P>
        Sharing, or threatening to share, intimate images of any person without their consent (sometimes called
        &quot;revenge porn&quot;) is one of the most serious violations on Teezer. It results in immediate removal,
        account termination, and where appropriate, a report to law enforcement. If you are a victim, report it
        immediately and contact {CONTACT_EMAIL} - we will act with urgency.
      </P>

      <H2 id="how-screened" n={6}>How Uploads Are Screened</H2>
      <P>
        Before any video reaches the public feed, its frames are analyzed by an automated visual-safety system
        trained to detect nudity and explicit content. Content flagged with high confidence is held back from
        publication automatically; borderline cases are queued for human review rather than published by default.
        This is why removal can sometimes happen within seconds of upload, before anyone has had the chance to view
        it.
      </P>

      <H2 id="consequences" n={7}>Consequences</H2>
      <P>
        A single explicit upload is typically removed with a warning on a first offense; repeated violations, sexual
        solicitation, and any content involving a minor escalate immediately per our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy, up to permanent termination.
        If you believe a removal was a mistake, you can appeal - see that page for how.
      </P>
    </LegalShell>
    } />
  );
}
