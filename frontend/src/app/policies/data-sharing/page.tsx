import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Data Sharing Policy",
  description: "Exactly who receives your information on Teezer, what they receive, and why - no advertisers, no data sales.",
  alternates: { canonical: "https://teezer.live/policies/data-sharing" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "principle", label: "Our Principle" },
  { id: "other-users", label: "With Other Users" },
  { id: "service-providers", label: "With Service Providers" },
  { id: "moderation-team", label: "With Our Moderation Team" },
  { id: "legal", label: "For Legal Reasons" },
  { id: "business-transfer", label: "In a Business Transfer" },
  { id: "never", label: "What We Never Do" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "Section 4 is the governing clause for this policy." },
  { href: "/policies/data-collection", label: "Data Collection Policy", desc: "What we collect before any sharing happens." },
  { href: "/law-enforcement", label: "Law Enforcement Guidelines", desc: "The full process for government data requests." },
];

export default function DataSharingPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="data-sharing" eyebrow="Policy · Data Sharing" fallback={
      <LegalShell eyebrow="Policy · Data Sharing" title="Data Sharing Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy is a detailed reference for Section 4 (How We Share Your Information) of our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. It names every category of recipient, exactly what they
        receive, and why - there is no recipient of your data that isn&apos;t listed here.
      </P>

      <H2 id="principle" n={1}>Our Principle</H2>
      <P>
        <strong>We do not sell your personal information, and we do not share it with advertisers or third-party ad
        networks.</strong> Every recipient below receives data because it is necessary to provide a feature you use,
        keep the Platform safe, or comply with law - not because we monetize your information.
      </P>

      <H2 id="other-users" n={2}>With Other Users</H2>
      <P>
        Your profile, posted content, and public activity are visible to other users according to your privacy
        settings - private accounts limit visibility to approved followers. Messages are shared only with the people
        in that specific conversation.
      </P>

      <H2 id="service-providers" n={3}>With Service Providers</H2>
      <DataTable
        headers={["Provider", "What they receive", "Purpose"]}
        rows={[
          ["Cloudflare", "Uploaded media, served through signed expiring URLs", "Content delivery and edge security"],
          ["PayPal, Stripe, Razorpay", "Order details needed to complete a payment", "Processing Coin purchases and creator payouts"],
          ["Google, Apple", "A token exchange confirming who you are", "Sign-in when you choose social login"],
          ["Expo, Firebase Cloud Messaging", "A device push token and notification content", "Delivering push notifications you've enabled"],
          ["GIPHY", "Your GIF search terms", "Powering GIF search in comments and messages"],
          ["OpenStreetMap (Nominatim)", "Location text you search", "Looking up and formatting places you add to your profile"],
        ]}
      />
      <P>Each provider receives only the minimum data needed to perform its specific function, and processes it under its own privacy terms for that function.</P>

      <H2 id="moderation-team" n={4}>With Our Moderation Team</H2>
      <P>
        Authorized staff can access account, content, message and transaction records where necessary to review
        reports, enforce our <DocLink href="/guidelines">Community Guidelines</DocLink>, investigate abuse, and
        provide support. All administrative access is logged and restricted to what a given role requires.
      </P>

      <H2 id="legal" n={5}>For Legal Reasons</H2>
      <P>
        We may disclose information where required by law, regulation, legal process, or an enforceable government
        request, or where necessary to detect or prevent fraud, security threats, or harm to Teezer, our users or the
        public. The detailed process authorities must follow to request data is in our{" "}
        <DocLink href="/law-enforcement">Law Enforcement Guidelines</DocLink>.
      </P>

      <H2 id="business-transfer" n={6}>In a Business Transfer</H2>
      <P>
        If Teezer is involved in a merger, acquisition, reorganization, or sale of assets, your information may
        transfer as part of that transaction. We will notify you of any change in ownership or in how your
        information is used, as described in Section 11 of our <DocLink href="/privacy">Privacy Policy</DocLink>.
      </P>

      <H2 id="never" n={7}>What We Never Do</H2>
      <UL>
        <li>We never sell personal information to data brokers or third parties.</li>
        <li>We never share your data with advertisers or ad networks.</li>
        <li>We never give any third party bulk or ongoing access to user data beyond what's needed for the specific function listed above.</li>
        <li>We never disclose the content of private messages to anyone outside the conversation, except under the legal process described in our <DocLink href="/law-enforcement">Law Enforcement Guidelines</DocLink>.</li>
      </UL>
      <P>
        Questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
