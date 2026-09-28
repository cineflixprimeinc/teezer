import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Data Retention & Deletion",
  description: "How long Teezer keeps your data, what happens when you delete your account, and what is retained and why.",
  alternates: { canonical: "https://teezer.live/policies/data-retention" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "principle", label: "Retention Principle" },
  { id: "while-active", label: "While Your Account Is Active" },
  { id: "on-deletion", label: "When You Delete Your Account" },
  { id: "retained", label: "What Is Retained, and Why" },
  { id: "backups", label: "Backups" },
  { id: "content-others", label: "Content Involving Others" },
  { id: "how-to-delete", label: "How to Delete Your Account" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "Section 6 is the governing clause for this policy." },
  { href: "/policies/your-rights", label: "Your Rights & Controls", desc: "Access, export and deletion rights in detail." },
  { href: "/policies/security", label: "Security Policy", desc: "How data is protected while we hold it." },
];

export default function DataRetentionPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="data-retention" eyebrow="Policy · Data Retention" fallback={
      <LegalShell eyebrow="Policy · Data Retention" title="Data Retention & Deletion" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy is a detailed reference for Section 6 (Data Retention and Deletion) of our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. It explains how long we keep information, what deleting your
        account actually does, and the narrow set of records we retain afterward - and why.
      </P>

      <H2 id="principle" n={1}>Retention Principle</H2>
      <P>
        We keep information for as long as your account exists and for as long as we need it to provide the Platform.
        Beyond that, we retain data only where we have a specific, legitimate reason - a legal obligation, a safety
        need, or a technical constraint - and we minimize it as those reasons expire.
      </P>

      <H2 id="while-active" n={2}>While Your Account Is Active</H2>
      <UL>
        <li>Your profile, content and messages persist so the Platform works normally.</li>
        <li>Watch history is retained to power recommendations - you can turn it off or clear it in Content Preferences.</li>
        <li>Security and login records are kept for a limited rolling window to protect your account and let you review active sessions.</li>
      </UL>

      <H2 id="on-deletion" n={3}>When You Delete Your Account</H2>
      <P>When you delete your account from Settings, the following happens:</P>
      <UL>
        <li>All active sessions are signed out immediately - every device is logged out.</li>
        <li>Your account and its content stop being available to other users right away.</li>
        <li>Your personal profile data enters deletion, subject only to the specific retained categories below.</li>
      </UL>

      <H2 id="retained" n={4}>What Is Retained, and Why</H2>
      <DataTable
        headers={["Data", "Retained after deletion?", "Why"]}
        rows={[
          ["Profile & content", "Removed from the Platform", "No longer needed once the account is closed"],
          ["Transaction records", "Yes - for the legally required period", "Accounting, tax and fraud-prevention obligations"],
          ["Safety & moderation records", "Yes - as long as necessary", "Prevent banned users returning; meet legal obligations"],
          ["Security logs", "Yes - for a limited period", "Abuse investigation and account-security forensics"],
          ["Encrypted backups", "Residual copies for a limited period", "Overwritten in the ordinary course of backup rotation"],
          ["Messages you sent", "Remain visible to recipients", "A conversation belongs to all its participants"],
        ]}
      />

      <H2 id="backups" n={5}>Backups</H2>
      <P>
        For resilience, our systems maintain encrypted backups. After deletion, residual copies of your data may
        persist in these backups for a limited period until they are overwritten in the normal backup-rotation cycle.
        Backups are not used to restore deleted accounts and are protected by the same safeguards described in our{" "}
        <DocLink href="/policies/security">Security Policy</DocLink>.
      </P>

      <H2 id="content-others" n={6}>Content Involving Others</H2>
      <P>
        Some content cannot be unilaterally erased because it also belongs to other people: messages you sent remain
        in your recipients&apos; inboxes, and content others created that features you (such as a Duet built on your
        video) remains subject to their rights and our <DocLink href="/guidelines">Community Guidelines</DocLink>.
      </P>

      <H2 id="how-to-delete" n={7}>How to Delete Your Account</H2>
      <P>
        Go to Settings → Account and choose to delete your account; you may be asked to confirm with your password.
        If you want a copy of your data first, use &quot;Download your data&quot; - see our{" "}
        <DocLink href="/policies/your-rights">Your Rights &amp; Controls</DocLink> policy. Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
