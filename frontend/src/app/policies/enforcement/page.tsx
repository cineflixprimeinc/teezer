import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

function Chip({ tone, children }: { tone: "green" | "amber" | "red" | "black"; children: React.ReactNode }) {
  const tones: Record<string, string> = {
    green: "bg-emerald-50 text-emerald-700 ring-emerald-200",
    amber: "bg-amber-50 text-amber-700 ring-amber-200",
    red: "bg-red-50 text-red-700 ring-red-200",
    black: "bg-gray-900 text-white ring-gray-900",
  };
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${tones[tone]}`}>{children}</span>;
}

export const metadata: Metadata = {
  title: "Enforcement & Appeals",
  description: "How Teezer enforces its rules - the severity matrix, account consequences, and how to appeal a decision.",
  alternates: { canonical: "https://teezer.live/policies/enforcement" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "matrix", label: "Severity Matrix" },
  { id: "how-detected", label: "How Violations Are Detected" },
  { id: "consequences", label: "Range of Consequences" },
  { id: "trust", label: "Account Standing" },
  { id: "appeals", label: "Appeals" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 10 is the governing clause for this policy." },
  { href: "/terms", label: "Terms of Service", desc: "Section 10 covers moderation and suspension/termination." },
  { href: "/settings/restrictions", label: "My Restrictions", desc: "See any active restriction on your own account." },
];

export default function EnforcementPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="enforcement" eyebrow="Policy · Enforcement" fallback={
      <LegalShell eyebrow="Policy · Enforcement" title="Enforcement & Appeals" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy implements Section 10 (How We Enforce These Rules) and Section 12 (Appeals) of our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>, and Section 10 (Moderation and Enforcement) of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>. It describes how we decide what happens when a rule is
        broken, and what to do if you think we got it wrong.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Enforcement is graduated: the response scales with severity, context, intent and an account&apos;s history,
        not a single fixed penalty per rule. Genuinely dangerous content is removed immediately regardless of
        history; a first-time, low-severity mistake is usually met with a warning.
      </P>

      <H2 id="matrix" n={2}>Severity Matrix</H2>
      <DataTable
        headers={["Severity", "Examples", "Typical action"]}
        rows={[
          [<Chip key="l" tone="green">Low</Chip>, "Borderline content, first-time minor violations", "Content removed or excluded from recommendations; warning issued"],
          [<Chip key="m" tone="amber">Medium</Chip>, "Repeated violations, harassment, spam, engagement manipulation", "Content removed; features restricted (comments, uploads, messaging); temporary suspension"],
          [<Chip key="h" tone="red">High</Chip>, "Sexual content, violent threats, hate speech, scams, doxxing", "Content removed; account suspended or permanently banned"],
          [<Chip key="z" tone="black">Zero tolerance</Chip>, "Child sexual abuse material, terrorism, imminent real-world danger", "Immediate permanent ban; evidence preserved and reported to authorities where required"],
        ]}
      />

      <H2 id="how-detected" n={3}>How Violations Are Detected</H2>
      <UL>
        <li><strong>Automated screening</strong> - every upload is scanned by content-safety systems for nudity and unsafe visual content before it can reach the public feed.</li>
        <li><strong>User reports</strong> - any video, comment, message or account can be reported directly; reports are confidential.</li>
        <li><strong>Pattern detection</strong> - engagement-manipulation and coordinated-abuse signals are flagged independent of individual reports.</li>
        <li><strong>Human review</strong> - flagged and reported content is reviewed by our moderation team, who make the final call on borderline cases.</li>
      </UL>

      <H2 id="consequences" n={4}>Range of Consequences</H2>
      <UL>
        <li>Removing or age-gating specific content, or excluding it from the For You feed and search;</li>
        <li>Holding new uploads for review before they appear publicly;</li>
        <li>Restricting specific features - commenting, messaging, uploading, monetization or live features - which you can review in <DocLink href="/settings/restrictions">My Restrictions</DocLink>;</li>
        <li>Temporary suspension or permanent termination of the account;</li>
        <li>Withholding or reversing earnings obtained through violations, per Section 8 of our <DocLink href="/terms">Terms of Service</DocLink>;</li>
        <li>Preserving evidence and cooperating with law enforcement where legally required, per our <DocLink href="/law-enforcement">Law Enforcement Guidelines</DocLink>.</li>
      </UL>

      <H2 id="trust" n={5}>Account Standing</H2>
      <P>
        Every account carries an internal standing signal that reflects its violation history. This is not visible to
        other users and does not itself restrict anything by default - but a lower standing means new uploads are
        reviewed more cautiously and can affect how widely content is initially distributed, while a clean history
        earns faster, wider reach. Standing gradually recovers over time when no new violations occur.
      </P>

      <H2 id="appeals" n={6}>Appeals</H2>
      <P>
        We make mistakes sometimes. If your content was removed or your account restricted and you believe the
        decision was wrong, contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Appeal`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with your username and the details of the decision. A moderator who was not involved in the original decision
        reviews the appeal independently, and we tell you the outcome either way. Appeals for zero-tolerance
        violations (the highest severity tier above) are reviewed with the same rigor, but reinstatement in that
        category is rare given what it takes to reach that tier in the first place.
      </P>
    </LegalShell>
    } />
  );
}
