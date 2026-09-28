import type { Metadata } from "next";
import { LegalShell, H2, P, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Data Collection Policy",
  description: "A detailed, technical breakdown of exactly what information Teezer collects and why - by category and source.",
  alternates: { canonical: "https://teezer.live/policies/data-collection" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "account", label: "Account & Profile Data" },
  { id: "content", label: "Content & Messages" },
  { id: "usage", label: "Usage & Behavioural Data" },
  { id: "device", label: "Device & Technical Data" },
  { id: "location", label: "Location Data" },
  { id: "third-party-sources", label: "Data From Other Sources" },
  { id: "minimization", label: "What We Deliberately Don't Collect" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "Section 2 is the governing clause for this policy." },
  { href: "/policies/data-sharing", label: "Data Sharing Policy", desc: "Who this information is shared with, and why." },
  { href: "/policies/your-rights", label: "Your Rights & Controls", desc: "How to access, export or delete this data." },
];

export default function DataCollectionPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="data-collection" eyebrow="Policy · Data Collection" fallback={
      <LegalShell eyebrow="Policy · Data Collection" title="Data Collection Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy is a detailed reference for Section 2 (What Information We Collect) of our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. Where the Privacy Policy summarizes our practices in plain
        language, this page itemizes the exact data categories, their source, and the specific purpose each serves.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        We collect only what is needed to operate the Platform, personalize your experience, keep it safe, and meet
        legal obligations. We do not collect data for advertising profiles, and we do not sell any of it - see our{" "}
        <DocLink href="/policies/data-sharing">Data Sharing Policy</DocLink>.
      </P>

      <H2 id="account" n={2}>Account & Profile Data</H2>
      <DataTable
        headers={["Field", "Required?", "Purpose"]}
        rows={[
          ["Name, username, email, password", "Required", "Create and secure your account, let others find you"],
          ["Phone number", "Optional", "Alternative login/recovery, account verification"],
          ["Date of birth, gender", "Optional", "Age-appropriate experience, personalization"],
          ["Bio, website, location text, interests, categories", "Optional", "Build your public profile, personalize recommendations"],
          ["Social links (Instagram, YouTube, X, etc.)", "Optional", "Displayed on your profile if you add them"],
        ]}
      />

      <H2 id="content" n={3}>Content & Messages</H2>
      <DataTable
        headers={["Data", "Purpose"]}
        rows={[
          ["Videos, images, stories, sounds, captions, hashtags", "Hosting, display, recommendation and moderation"],
          ["Comments and reactions", "Enable social interaction and moderation"],
          ["Direct messages (text, image, video, audio, voice notes, documents)", "Delivery and conversation history across devices"],
          ["Call metadata (participants, duration, status)", "Call history in your inbox; the call itself is peer-to-peer and not recorded"],
        ]}
      />

      <H2 id="usage" n={4}>Usage & Behavioural Data</H2>
      <DataTable
        headers={["Signal", "Purpose"]}
        rows={[
          ["Watch duration, position reached, replays, completions", "Rank your For You feed; can be disabled in Content Preferences"],
          ["Likes, saves, shares, comments, follows", "Personalization and public engagement counts"],
          ["Search terms", "On-device only for your recent searches; not stored on our servers"],
          ["Inferred interests (categories, hashtags, creators)", "Personalized recommendations; dismissing a suggestion refines this"],
          ["Profile views", "Powers the reciprocal Profile Views feature; can be disabled in Privacy Settings"],
        ]}
      />

      <H2 id="device" n={5}>Device & Technical Data</H2>
      <DataTable
        headers={["Data", "Purpose"]}
        rows={[
          ["IP address", "Security and rate limiting; stored as a one-way hash where only statistics are needed"],
          ["Browser/user agent, app version, device platform", "Compatibility, debugging and security"],
          ["Random device identifier", "Rate limiting and fraud prevention - not a persistent advertising ID"],
          ["Push notification token", "Delivering notifications you've enabled; only if you grant permission"],
          ["Session and sign-in records", "Let you review and revoke active sessions in Settings → Security"],
        ]}
      />

      <H2 id="location" n={6}>Location Data</H2>
      <P>
        We derive your approximate <strong>country</strong> from your IP address at the network level, using
        Cloudflare&apos;s edge network signals with an optional local database lookup as a fallback - never a
        third-party geolocation service, and never GPS or device-precise location. Any location shown on your profile
        or in a post is text you typed in yourself, optionally looked up through OpenStreetMap&apos;s public place
        search while you type.
      </P>

      <H2 id="third-party-sources" n={7}>Data From Other Sources</H2>
      <DataTable
        headers={["Source", "What we receive"]}
        rows={[
          ["Google / Apple Sign-In", "Name, email address, and confirmation the email is verified - nothing else"],
          ["Other users", "Content that mentions or tags you, subject to your tagging permissions"],
        ]}
      />

      <H2 id="minimization" n={8}>What We Deliberately Don't Collect</H2>
      <P>
        We do not collect precise GPS location, we do not use third-party advertising or analytics trackers, we do
        not store your payment card or bank details (payment processors handle those directly), and we do not record
        your voice or video calls. Where a data point is not essential to a feature, we don&apos;t ask for it.
      </P>

      <P>
        Questions about any category above:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
