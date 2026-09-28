import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Your Rights & Controls",
  description: "Every control Teezer gives you over your data and privacy - access, export, correction, deletion and legal rights.",
  alternates: { canonical: "https://teezer.live/policies/your-rights" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "in-app", label: "In-App Controls" },
  { id: "access-export", label: "Access and Export" },
  { id: "correction", label: "Correction" },
  { id: "deletion", label: "Deletion" },
  { id: "legal-rights", label: "Your Legal Rights" },
  { id: "exercise", label: "How to Exercise Your Rights" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "Section 5 is the governing clause for this policy." },
  { href: "/policies/data-retention", label: "Data Retention & Deletion", desc: "What deletion does and what is kept." },
  { href: "/settings/privacy", label: "Privacy Settings", desc: "Where most of these controls live in your account." },
];

export default function YourRightsPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="your-rights" eyebrow="Policy · Your Rights" fallback={
      <LegalShell eyebrow="Policy · Your Rights" title="Your Rights & Controls" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy is a detailed reference for Section 5 (Your Rights, Choices and Controls) of our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. Teezer is built so that most privacy decisions are yours to
        make directly, in your account - not something you have to email us to change.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        You can control who sees and interacts with you, export a copy of your data, correct your information, and
        delete your account - all from within the app and website. Depending on where you live, you may also have
        additional legal rights, described below, that you can exercise using the same tools or by contacting us.
      </P>

      <H2 id="in-app" n={2}>In-App Controls</H2>
      <DataTable
        headers={["Control", "What it does", "Where"]}
        rows={[
          ["Private account", "Only approved followers can see your content", "Settings → Privacy"],
          ["Who can message you", "Everyone, people you follow, your followers, or no one", "Settings → Privacy"],
          ["Comments, tags, Duet, downloads", "Choose who can interact with your content, plus filters and per-user restrictions", "Settings → Privacy"],
          ["Activity status", "Show or hide when you're online", "Settings → Privacy"],
          ["Profile views", "Turn view history on or off (hides both directions)", "Settings → Privacy"],
          ["Discovery & search engines", "Control whether your profile is suggested or indexed", "Settings → Privacy"],
          ["Blocking", "Stop an account from finding or contacting you", "Any profile → menu"],
          ["Watch history", "Turn saving on or off, or clear it", "Settings → Content Preferences"],
        ]}
      />

      <H2 id="access-export" n={3}>Access and Export</H2>
      <P>
        Use <strong>Download your data</strong> in Settings → Account to export a machine-readable copy of your
        profile, settings and related records. This gives you both visibility into what we hold and a portable copy
        you can keep or move elsewhere.
      </P>

      <H2 id="correction" n={4}>Correction</H2>
      <P>
        You can edit your name, username, bio, email, phone, birthday, gender, location and links at any time in
        Settings → Account. Keeping this information accurate is the fastest way to correct anything about your
        profile.
      </P>

      <H2 id="deletion" n={5}>Deletion</H2>
      <P>
        You can delete your account from Settings → Account at any time. What deletion removes, and the narrow set of
        records retained afterward for legal and safety reasons, is described in full in our{" "}
        <DocLink href="/policies/data-retention">Data Retention &amp; Deletion</DocLink> policy.
      </P>

      <H2 id="legal-rights" n={6}>Your Legal Rights</H2>
      <P>Depending on your country or region, you may have the right to:</P>
      <UL>
        <li>Request access to the personal information we hold about you;</li>
        <li>Request correction of inaccurate information;</li>
        <li>Request deletion of your personal information;</li>
        <li>Request a portable copy of your data;</li>
        <li>Object to or restrict certain processing;</li>
        <li>Withdraw consent where processing is based on consent.</li>
      </UL>
      <P>
        We respond to rights requests in accordance with applicable law, and we will never discriminate against you
        for exercising them.
      </P>

      <H2 id="exercise" n={7}>How to Exercise Your Rights</H2>
      <P>
        For most rights, the in-app tools above are the fastest route. For legal requests that the in-app tools
        don&apos;t cover, contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Privacy%20Rights%20Request`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the subject line &quot;Privacy Rights Request&quot;. We may need to verify your identity before acting on
        a request to protect your account.
      </P>
    </LegalShell>
    } />
  );
}
