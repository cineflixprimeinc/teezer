import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Harassment & Bullying Policy",
  description: "Teezer's rules against harassment, bullying and doxxing, and the tools you can use to protect your own space.",
  alternates: { canonical: "https://teezer.live/policies/harassment" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "not-allowed", label: "What's Not Allowed" },
  { id: "doxxing", label: "Doxxing and Private Information" },
  { id: "sexual-harassment", label: "Sexual Harassment" },
  { id: "brigading", label: "Coordinated Harassment" },
  { id: "your-tools", label: "Tools to Protect Your Space" },
  { id: "reporting", label: "Reporting Harassment" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 5 is the governing clause for this policy." },
  { href: "/policies/hateful-behavior", label: "Hateful Behaviour Policy", desc: "Attacks based on protected characteristics." },
  { href: "/settings/privacy", label: "Privacy Settings", desc: "Block, restrict and filter directly in your account." },
];

export default function HarassmentPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="harassment" eyebrow="Policy · Harassment" fallback={
      <LegalShell eyebrow="Policy · Harassment" title="Harassment & Bullying Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements Section 5 (Harassment and Bullying) of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. Teezer should feel safe to show up as yourself.
        Targeted harassment - whether from one account or many - is not tolerated.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Harassment covers behaviour, not just content: repeated unwanted contact, degrading language directed at a
        person, and coordinated pile-ons all count, even when no single message crosses an obvious line on its own.
      </P>

      <H2 id="not-allowed" n={2}>What's Not Allowed</H2>
      <DataTable
        headers={["Allowed", "Not allowed"]}
        rows={[
          ["Criticism of a public figure's public actions or work", "Personal attacks, degradation or humiliation of any individual"],
          ["Disagreeing with someone's opinion, expressed respectfully", "Threats or intimidation, direct or implied"],
          ["Satire and parody that doesn't target a private individual", "Repeated unwanted contact after being asked to stop"],
          ["Sharing your own experience, including naming a harasser to seek support", "Encouraging others to harass a specific person (brigading)"],
        ]}
      />

      <H2 id="doxxing" n={3}>Doxxing and Private Information</H2>
      <UL>
        <li>Sharing someone&apos;s home address, phone number, workplace, ID documents, medical information or private messages without their consent is prohibited, regardless of whether the information is technically public elsewhere.</li>
        <li>Sharing information intended to help others locate, contact or intimidate a person offline - even without stating that intent explicitly - is treated as doxxing.</li>
        <li>Threatening to dox someone is treated the same as doing it.</li>
      </UL>

      <H2 id="sexual-harassment" n={4}>Sexual Harassment</H2>
      <P>
        Unwanted sexualized comments, images or messages sent to another user are not allowed, whether in public
        comments or private messages. This applies even between consenting adults if one party has indicated the
        contact is unwanted - continuing after a clear &quot;no&quot; or a block is itself a violation.
      </P>

      <H2 id="brigading" n={5}>Coordinated Harassment</H2>
      <P>
        Organizing - on or off Teezer - to mass-report, mass-comment on, or otherwise pile onto a specific person&apos;s
        account is a violation for everyone who participates, not just the organizer. We look at patterns across
        accounts, not just individual messages, when investigating coordinated campaigns.
      </P>

      <H2 id="your-tools" n={6}>Tools to Protect Your Space</H2>
      <P>You do not have to rely on us alone - your account gives you direct control:</P>
      <UL>
        <li><strong>Block</strong> - stop a specific account from viewing your profile, content or contacting you.</li>
        <li><strong>Comment filters and hidden words</strong> - automatically hide comments containing words you choose.</li>
        <li><strong>Restrict specific users</strong> - limit what a person can do on your content without blocking them outright.</li>
        <li><strong>Message controls</strong> - choose who can message you: everyone, people you follow, your followers, or no one.</li>
      </UL>
      <P>All of these live in <DocLink href="/settings/privacy">Settings → Privacy</DocLink>.</P>

      <H2 id="reporting" n={7}>Reporting Harassment</H2>
      <P>
        Report the specific comment, message or account involved - this gives our moderation team the exact context
        needed to act quickly. Reports are confidential; the person you report is never told who reported them. For
        anything requiring more context, email{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
