import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description: "Teezer's intellectual-property rules: reporting infringement, counter-notices, repeat infringers and licensed music.",
  alternates: { canonical: "https://teezer.live/copyright" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "your-responsibilities", label: "Your Responsibilities" },
  { id: "reporting", label: "Reporting Infringement" },
  { id: "counter-notice", label: "Counter-Notices" },
  { id: "repeat", label: "Repeat Infringers" },
  { id: "music", label: "Music and Sounds" },
  { id: "trademarks", label: "Trademarks" },
  { id: "contact", label: "Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/terms", label: "Terms of Service", desc: "Section 9 (Intellectual Property) is the governing clause." },
  { href: "/guidelines", label: "Community Guidelines", desc: "Section 9 covers copyright and the privacy of others." },
  { href: "/privacy", label: "Privacy Policy", desc: "How report data is handled and retained." },
];

export default function CopyrightPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="copyright" eyebrow="Legal · Copyright" fallback={
      <LegalShell eyebrow="Legal · Copyright" title="Copyright Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        Teezer respects the intellectual property of creators and rights holders and expects everyone on the
        Platform to do the same. This Copyright Policy implements Section 9 (Intellectual Property) of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink> and Section 9 (Copyright and the Privacy of Others) of the{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>, and describes how infringement is reported,
        contested and enforced.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <UL>
        <li>You own the content you create; posting on Teezer grants us only the operating license described in Section 5 of the <DocLink href="/terms">Terms of Service</DocLink>.</li>
        <li>Posting content that infringes someone else&apos;s copyright is prohibited and leads to removal and account penalties.</li>
        <li>We process copyright complaints under a notice-and-takedown procedure consistent with the DMCA and equivalent laws worldwide.</li>
      </UL>

      <H2 id="your-responsibilities" n={2}>Your Responsibilities</H2>
      <UL>
        <li>Only post content you created or hold rights to - including video footage, images, music and clips inside your edits.</li>
        <li>A license to view content (for example, streaming a song) is not a license to re-publish it.</li>
        <li>Limited exceptions such as fair use or fair dealing may apply in some countries - for example commentary, criticism or parody - but you are responsible for making that judgement, and it may be tested by a complaint.</li>
        <li>Features that reuse others&apos; content (such as Duets and downloads) operate under the permissions the original creator set; reuse outside the Platform requires the creator&apos;s permission.</li>
      </UL>

      <H2 id="reporting" n={3}>Reporting Infringement</H2>
      <P>
        If you believe content on Teezer infringes your copyright, report it in-app (menu → Report) or email{" "}
        {CONTACT_EMAIL}. A complete notice must contain:
      </P>
      <UL>
        <li>Identification of the copyrighted work you claim is infringed;</li>
        <li>The link (URL) or location of the allegedly infringing content on the Platform;</li>
        <li>Your name, address and email so we can contact you;</li>
        <li>A statement that you believe in good faith that the use is not authorized by the copyright owner, its agent or the law;</li>
        <li>A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act for them; and</li>
        <li>Your physical or electronic signature.</li>
      </UL>
      <P>
        Valid notices result in removal or disabling of the content, a strike recorded against the uploader, and
        notification to the uploader with a copy of the complaint. Knowingly filing a false complaint can make you
        liable for damages.
      </P>

      <H2 id="counter-notice" n={4}>Counter-Notices</H2>
      <P>
        If your content was removed and you believe the removal was a mistake or misidentification, you may submit a
        counter-notice to {CONTACT_EMAIL} containing: identification of the removed content and where it appeared,
        your contact details, a statement under penalty of perjury of your good-faith belief that the removal was
        erroneous, consent to the jurisdiction of your local courts, and your signature. If the complainant does not
        inform us within 10-14 business days that they have filed a court action, the content may be restored and the
        strike removed.
      </P>

      <H2 id="repeat" n={5}>Repeat Infringers</H2>
      <UL>
        <li>Copyright strikes remain on an account for 12 months.</li>
        <li>Multiple strikes lead to escalating penalties - feature restrictions, upload suspension, and permanent termination of repeat infringers&apos; accounts, per the enforcement rules in the <DocLink href="/guidelines">Community Guidelines</DocLink>.</li>
        <li>Monetization earned on infringing content may be withheld or reversed under Section 8 of the <DocLink href="/terms">Terms of Service</DocLink>.</li>
      </UL>

      <H2 id="music" n={6}>Music and Sounds</H2>
      <H3>Sounds library</H3>
      <P>
        Sounds available inside Teezer&apos;s creation tools may be used in content on the Platform. That permission
        is Platform-only: it does not allow use of those sounds in content published elsewhere.
      </P>
      <H3>Original sounds</H3>
      <P>
        When you upload original audio, it may become available for other creators to use in their Teezer content,
        credited to you. You must hold the rights to any audio you upload - uploading commercial recordings you do
        not have rights to is infringement.
      </P>

      <H2 id="trademarks" n={7}>Trademarks</H2>
      <P>
        Using another&apos;s trademark in a way likely to confuse people about affiliation or endorsement is not
        allowed and can be reported through the same channels. Commentary, criticism and fan content that does not
        mislead is generally acceptable. The Teezer name and logo are our trademarks and may not be used without
        written permission, per Section 9 of the <DocLink href="/terms">Terms of Service</DocLink>.
      </P>

      <H2 id="contact" n={8}>Contact</H2>
      <P>
        Copyright questions, notices and counter-notices:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>{" "}
        (subject line &quot;Copyright&quot;).
      </P>
    </LegalShell>
    } />
  );
}
