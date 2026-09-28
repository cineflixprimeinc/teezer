import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Law Enforcement Guidelines",
  description: "How law enforcement can request user data from Teezer: legal process, emergency disclosure, preservation and user notice.",
  alternates: { canonical: "https://teezer.live/law-enforcement" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "scope", label: "Scope" },
  { id: "data", label: "Data Teezer Holds" },
  { id: "process", label: "Required Legal Process" },
  { id: "emergency", label: "Emergency Disclosure" },
  { id: "preservation", label: "Preservation Requests" },
  { id: "notice", label: "User Notice" },
  { id: "submitting", label: "Submitting a Request" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "Section 4 covers legal disclosure to authorities." },
  { href: "/guidelines", label: "Community Guidelines", desc: "Zero-tolerance categories reported proactively." },
  { href: "/terms", label: "Terms of Service", desc: "The agreement that governs use of Teezer." },
];

export default function LawEnforcementPage() {
  return (
    <CmsAwarePolicyPage slug="law-enforcement" eyebrow="Legal · Law Enforcement" fallback={
      <LegalShell eyebrow="Legal · Law Enforcement" title="Law Enforcement Guidelines" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        These operational guidelines explain how law enforcement authorities can request user information from
        Teezer, operated by CineflixPrime. They implement Section 4 (How We Share Your Information - Law enforcement
        / legal) of our <DocLink href="/privacy">Privacy Policy</DocLink>. We disclose user information only in
        accordance with our policies and applicable law, and we review every request individually.
      </P>

      <H2 id="scope" n={1}>Scope</H2>
      <UL>
        <li>These guidelines are for government and law-enforcement authorities. Users seeking their own data should use Settings → Account → Download your data, described in Section 5 of the <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
        <li>Civil litigants should serve process through the applicable legal channels; these guidelines do not create any enforceable rights.</li>
        <li>We may proactively report child sexual abuse material and imminent threats to the relevant authorities, per the zero-tolerance rules in our <DocLink href="/guidelines">Community Guidelines</DocLink>.</li>
      </UL>

      <H2 id="data" n={2}>Data Teezer Holds</H2>
      <DataTable
        headers={["Category", "Examples", "Typical availability"]}
        rows={[
          ["Basic subscriber information", "Username, display name, email, phone (if provided), signup date, country", "While the account exists, plus limited retention after deletion"],
          ["Connection records", "Login timestamps, IP addresses in security logs, active sessions", "Limited retention period"],
          ["Content", "Videos, stories, comments, profiles (public or private per user settings)", "While posted; removed content retained briefly for enforcement"],
          ["Messages", "Direct message content and call logs (calls themselves are peer-to-peer and never recorded)", "While the conversation exists"],
          ["Transaction records", "Coin purchases, gifts, payouts (no full card numbers - held by payment processors)", "Legally required accounting periods"],
        ]}
      />
      <P>
        Full detail on what is collected and how long it is kept is in Sections 2 and 6 of the{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>.
      </P>

      <H2 id="process" n={3}>Required Legal Process</H2>
      <UL>
        <li><strong>Basic subscriber information</strong> - a valid legal demand issued under the law of the requesting authority&apos;s jurisdiction (such as a subpoena or equivalent order).</li>
        <li><strong>Connection records and transaction metadata</strong> - a court order or equivalent judicial authorization.</li>
        <li><strong>Content of communications</strong> (private videos, messages) - a warrant or equivalent judicial authorization based on a showing of probable cause or the local-law equivalent.</li>
        <li>Requests must identify the account precisely (username or user ID and profile URL - screen names alone are often ambiguous), describe the data sought narrowly, and cite the legal basis.</li>
        <li>Cross-border requests should proceed through mutual legal assistance treaties or letters rogatory where applicable law requires.</li>
        <li>We may reject or narrow requests that are overbroad, lack a valid legal basis, or are not properly served.</li>
      </UL>

      <H2 id="emergency" n={4}>Emergency Disclosure</H2>
      <P>
        Where we believe in good faith that there is an emergency involving imminent danger of death or serious
        physical injury, we may disclose the information necessary to prevent the harm without legal process.
        Emergency requests must come from an official account, be marked &quot;EMERGENCY&quot; in the subject line,
        and describe the nature of the emergency, the person at risk, the specific information sought and why it is
        needed urgently. Every emergency disclosure is documented and reviewed.
      </P>

      <H2 id="preservation" n={5}>Preservation Requests</H2>
      <P>
        Upon a valid preservation request from law enforcement, we will preserve the identified account records for
        90 days (renewable once for a further 90 days) pending issuance of legal process. Preservation does not
        disclose any data by itself.
      </P>

      <H2 id="notice" n={6}>User Notice</H2>
      <P>
        Our policy is to notify users about legal requests for their information before disclosure, unless we are
        legally prohibited from doing so (for example by a non-disclosure order), or where we believe notice would
        create a risk of harm to a person, or in emergency cases. Where a prohibition is time-limited, we provide
        notice after it expires.
      </P>

      <H2 id="submitting" n={7}>Submitting a Request</H2>
      <UL>
        <li>Email requests to <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a> with the subject line &quot;Law Enforcement Request&quot;.</li>
        <li>Send from an official government email address, on agency letterhead, identifying the requesting officer, agency, and a means of verification.</li>
        <li>Include the legal process document, the precise account identifiers, the data categories sought and the relevant time range.</li>
        <li>Receipt of a request is not a commitment to disclose; we respond after review, and may seek clarification or narrowing.</li>
      </UL>
    </LegalShell>
    } />
  );
}
