import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Advertising Policy",
  description:
    "Teezer's Advertising Policy - who can advertise, the ad review process, prohibited and restricted categories, targeting rules, creative and landing-page standards, branded content, data use, and enforcement.",
  alternates: { canonical: "https://teezer.live/policies/advertising-policy" },
};

const LAST_UPDATED = "July 19, 2026";
const CONTACT_EMAIL = "ads@teezer.live";

const TOC: TocItem[] = [
  { id: "scope", label: "Scope" },
  { id: "who", label: "Who Can Advertise" },
  { id: "review", label: "Ad Review Process" },
  { id: "prohibited", label: "Prohibited Categories" },
  { id: "restricted", label: "Restricted Categories" },
  { id: "targeting", label: "Targeting Rules" },
  { id: "standards", label: "Creative and Landing-Page Standards" },
  { id: "branded", label: "Branded Content by Creators" },
  { id: "data", label: "Data and Privacy" },
  { id: "enforcement", label: "Enforcement" },
  { id: "changes", label: "Changes and Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/guidelines", label: "Community Guidelines", desc: "The baseline content rules ads must also meet." },
  { href: "/policies/creator-agreement", label: "Creator Agreement", desc: "Rules for creators, including branded content." },
  { href: "/policies/minor-safety", label: "Minor Safety Policy", desc: "Protections that shape ad targeting and content." },
];

export default function AdvertisingPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="advertising-policy" eyebrow="Policy · Advertising" fallback={
      <LegalShell
      eyebrow="Policy · Advertising"
      title="Advertising Policy"
      lastUpdated={LAST_UPDATED}
      toc={TOC}
      related={RELATED}
    >
      <P>
        This Advertising Policy governs all paid advertising and promoted content on Teezer - including in-feed sponsored
        videos, promoted campaigns created in Teezer Studio, and any advertiser or agency using our tools. It works
        alongside our <DocLink href="/terms">Terms of Service</DocLink> and{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. Advertising must meet this policy in addition to all
        other Teezer rules.
      </P>

      <H2 id="scope" n={1}>Scope</H2>
      <P>
        This policy applies to advertisers, the creative they run, the audiences they target, and the destinations they
        link to. It also applies to creators who post branded or sponsored content, and to any third party managing
        campaigns on someone else&rsquo;s behalf. You are responsible for every ad you submit and for ensuring it is lawful
        in each place it runs.
      </P>

      <H2 id="who" n={2}>Who Can Advertise</H2>
      <UL>
        <li>You must be of legal age to enter a binding contract and to advertise the product or service in question.</li>
        <li>You must have the rights to all content in your ad and to any brand, trademark, or person featured.</li>
        <li>You must comply with the laws and advertising regulations of every jurisdiction you target.</li>
        <li>Certain regulated categories require prior authorization and valid licences before you may advertise (see Restricted Categories).</li>
      </UL>

      <H2 id="review" n={3}>Ad Review Process</H2>
      <P>
        Ads are reviewed against this policy before and, in some cases, after they go live. Review considers the creative,
        the targeting, and the landing page as a whole. Approval is not a warranty of legal compliance - you remain
        responsible for your ad. We may re-review at any time and pause or remove ads that breach this policy, and we may
        request documentation (for example, licences) before approving regulated categories.
      </P>

      <H2 id="prohibited" n={4}>Prohibited Categories</H2>
      <P>The following may never be advertised on Teezer:</P>
      <DataTable
        headers={["Category", "Examples"]}
        rows={[
          ["Illegal products and services", "Illicit drugs, drug paraphernalia, stolen goods, counterfeit or fake documents"],
          ["Weapons and explosives", "Firearms, ammunition, explosives, and instructions to make them"],
          ["Adult sexual content", "Pornography, escort or sexual services, and sexually explicit material"],
          ["Hateful or violent content", "Content that attacks people based on protected traits, or promotes violence or terrorism"],
          ["Deceptive or fraudulent schemes", "Scams, phishing, pyramid or Ponzi schemes, and get-rich-quick offers"],
          ["Malware and harmful software", "Spyware, malware, or software that misleads or deceives users"],
          ["Exploitation of minors", "Any content that sexualizes, endangers, or exploits minors"],
          ["Prohibited health claims", "Unproven cures, dangerous supplements, and misleading medical claims"],
        ]}
      />

      <H2 id="restricted" n={5}>Restricted Categories</H2>
      <P>
        These may be advertised only where allowed by law, with the required licences, targeting limits, and age gating.
        They are subject to extra review and may be limited or unavailable in some regions:
      </P>
      <UL>
        <li>Alcohol, subject to age and regional restrictions.</li>
        <li>Gambling and games of skill for money, where licensed and permitted.</li>
        <li>Financial products and services, including crypto-assets where allowed, with clear risk disclosures.</li>
        <li>Health, pharmaceuticals, and supplements, subject to local regulation.</li>
        <li>Political or social-issue advertising, where permitted and appropriately disclosed.</li>
        <li>Dating and cosmetic or weight-management products, subject to targeting and creative limits.</li>
      </UL>

      <H2 id="targeting" n={6}>Targeting Rules</H2>
      <UL>
        <li>Ads must not be targeted to minors except where a product is appropriate and lawful for them, and never for restricted categories.</li>
        <li>Do not use targeting to exclude or exploit people based on protected characteristics in a discriminatory way (for example, in housing, employment, or credit).</li>
        <li>Age-restricted products must use available age-gating and must not be shown to audiences below the legal age.</li>
        <li>Location and interest targeting must comply with local law and our <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
      </UL>

      <H2 id="standards" n={7}>Creative and Landing-Page Standards</H2>
      <UL>
        <li><strong>Be truthful.</strong> No false, misleading, or unsubstantiated claims. Offers and pricing must be accurate.</li>
        <li><strong>Be clear it is an ad.</strong> Sponsored content is labelled; do not disguise ads as organic content or system messages.</li>
        <li><strong>Match the destination.</strong> The landing page must reflect the ad, work on mobile, not auto-download files, and not use deceptive pop-ups or fake close buttons.</li>
        <li><strong>Respect quality.</strong> No shocking, sexually suggestive, or excessively disruptive creative; no broken functionality.</li>
        <li><strong>Protect data.</strong> Landing pages that collect personal information must have a privacy policy and lawful basis to do so.</li>
      </UL>

      <H2 id="branded" n={8}>Branded Content by Creators</H2>
      <P>
        Creators who post paid partnerships or sponsored content must disclose it clearly (for example, a visible “paid
        partnership” label or “#ad”) and comply with this policy and the{" "}
        <DocLink href="/policies/creator-agreement">Creator Agreement</DocLink>. Prohibited categories cannot be promoted
        even in an otherwise organic post, and restricted categories still require the relevant permissions.
      </P>

      <H2 id="data" n={9}>Data and Privacy</H2>
      <P>
        Advertisers must handle any data obtained through Teezer advertising responsibly and lawfully, use it only for the
        stated purpose, and honor user privacy choices. You must not attempt to re-identify users, build profiles in breach
        of law, or transfer data in ways users would not expect. Teezer&rsquo;s handling of advertising data is described
        in our <DocLink href="/privacy">Privacy Policy</DocLink> and{" "}
        <DocLink href="/policies/data-sharing">Data Sharing</DocLink> policy.
      </P>

      <H2 id="enforcement" n={10}>Enforcement</H2>
      <P>
        Ads or accounts that breach this policy may be paused, rejected, or removed, and repeat or serious violations may
        lead to loss of advertising access or account action under our{" "}
        <DocLink href="/policies/enforcement">Enforcement &amp; Appeals</DocLink> policy. We may withhold delivery, refund
        or retain spend as permitted by our terms, and report unlawful activity to authorities where required.
      </P>

      <H2 id="changes" n={11}>Changes and Contact</H2>
      <P>
        We may update this policy as products, laws, and risks evolve, with reasonable notice where practicable. Material
        changes are communicated through Teezer Studio and, where significant, by the notification method in our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>. Advertising questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
