import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement that governs your use of Teezer - accounts, content and licenses, virtual items, creator earnings, acceptable use and enforcement.",
  alternates: { canonical: "https://teezer.live/terms" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "acceptance", label: "Accepting These Terms" },
  { id: "eligibility", label: "Who Can Use Teezer" },
  { id: "account", label: "Your Account" },
  { id: "privacy", label: "Your Privacy" },
  { id: "content", label: "Your Content and Licenses" },
  { id: "conduct", label: "Acceptable Use" },
  { id: "virtual-items", label: "Coins, Gifts and Virtual Items" },
  { id: "monetization", label: "Creator Earnings and Payouts" },
  { id: "ip", label: "Intellectual Property" },
  { id: "moderation", label: "Moderation and Enforcement" },
  { id: "termination", label: "Suspension and Termination" },
  { id: "third-party", label: "Third-Party Services" },
  { id: "disclaimers", label: "Disclaimers" },
  { id: "liability", label: "Limitation of Liability" },
  { id: "indemnity", label: "Indemnification" },
  { id: "law", label: "Governing Law and Disputes" },
  { id: "general", label: "General Terms" },
  { id: "changes", label: "Changes to These Terms" },
  { id: "contact", label: "Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "How we collect, use and protect your information." },
  { href: "/guidelines", label: "Community Guidelines", desc: "The rules for content and behaviour on the Platform." },
  { href: "/copyright", label: "Copyright Policy", desc: "Reporting infringement, counter-notices and music rules." },
  { href: "/virtual-items", label: "Virtual Items Policy", desc: "Detailed rules for Coins, Gifts, wallets and payouts." },
];

export default function TermsPage() {
  return (
    <CmsAwarePolicyPage slug="terms" eyebrow="Legal · Terms" fallback={
      <LegalShell eyebrow="Legal · Terms" title="Terms of Service" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        These Terms of Service (&quot;Terms&quot;) are a legally binding agreement between you and Teezer
        (&quot;Teezer&quot;, &quot;we&quot;, &quot;us&quot; or &quot;our&quot;) governing your access to and use of
        the Teezer website at teezer.live, the Teezer mobile applications, Teezer Studio creator tools, and all
        related features and services (together, the &quot;Platform&quot;). Our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink> and{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink> are incorporated into and form part of these Terms.
        Please read all three documents carefully.
      </P>

      {/* At a glance */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">These terms at a glance</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ["You own your content", "You keep ownership of everything you create. You give us a license so we can host, stream and show it on the Platform."],
            ["Coins aren't money", "Coins and Gifts are virtual items with no cash value. They can't be refunded or exchanged outside the Platform, except where the law requires."],
            ["Follow the rules", "The Community Guidelines apply to everything you post and do. Breaking them can lead to content removal, restrictions or a ban."],
            ["We may update these Terms", "We'll notify you of material changes. Continuing to use Teezer after they take effect means you accept them."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900">{t}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 1 */}
      <H2 id="acceptance" n={1}>Accepting These Terms</H2>
      <P>
        By creating an account, or by accessing or using any part of the Platform, you confirm that you have read,
        understood and agree to be bound by these Terms. If you are using the Platform on behalf of a company or
        organization, you represent that you have authority to bind it, and &quot;you&quot; refers to that entity. If
        you do not agree to these Terms, you must not access or use the Platform.
      </P>

      {/* 2 */}
      <H2 id="eligibility" n={2}>Who Can Use Teezer</H2>
      <UL>
        <li>You must be at least <strong>13 years old</strong>, or the higher minimum age required in your country (for example, 16 in parts of the European Economic Area).</li>
        <li>If you are under 18, you confirm that a parent or legal guardian has reviewed and agreed to these Terms on your behalf.</li>
        <li>You must not be barred from receiving services like the Platform under applicable law.</li>
        <li>If your account was previously suspended or banned for violations, you may not create a new account without our written permission.</li>
      </UL>

      {/* 3 */}
      <H2 id="account" n={3}>Your Account</H2>
      <UL>
        <li>Provide accurate, current and complete registration information, and keep it up to date in Settings.</li>
        <li>You are responsible for all activity that happens on or through your account, and for keeping your password confidential.</li>
        <li>
          Protect your account with the security tools we provide - two-factor authentication, new-login alerts and
          active-session management - and notify us immediately at {CONTACT_EMAIL} if you suspect unauthorized access.
        </li>
        <li>You may not sell, rent, transfer or share your account, or let others use it to circumvent restrictions on their own accounts.</li>
        <li>Usernames are provided on a first-come basis; we may reclaim usernames that are inactive, infringe trademarks or impersonate others.</li>
        <li>You may delete your account at any time in Settings. See our <DocLink href="/privacy">Privacy Policy</DocLink> for what happens to your data afterwards.</li>
      </UL>

      {/* 4 */}
      <H2 id="privacy" n={4}>Your Privacy</H2>
      <P>
        Your privacy matters to us. Our <DocLink href="/privacy">Privacy Policy</DocLink> explains in detail what
        information we collect, how we use and share it, how long we keep it, and the controls you have - including
        private accounts, granular interaction settings, data export and account deletion. By using the Platform you
        acknowledge the practices described there.
      </P>

      {/* 5 */}
      <H2 id="content" n={5}>Your Content and Licenses</H2>
      <H3>Ownership</H3>
      <P>
        <strong>You own the content you create</strong> - your videos, images, stories, sounds, captions, comments
        and everything else you post (&quot;Your Content&quot;). Nothing in these Terms transfers ownership of Your
        Content to us.
      </P>
      <H3>License you grant us</H3>
      <P>
        So that we can operate the Platform, you grant us a non-exclusive, royalty-free, worldwide, transferable and
        sublicensable license to host, store, cache, reproduce, adapt (for example, transcoding into different
        resolutions and formats, or generating thumbnails and previews), publish, perform, display and distribute
        Your Content on and through the Platform, including for promoting the Platform. This license exists only to
        operate, improve and promote the Platform. It ends when you delete Your Content or your account, except to
        the extent that: (a) others have re-shared or interacted with it in ways you allowed (such as Duets); (b) we
        must retain it for legal, safety or security reasons; or (c) residual copies persist in time-limited backups.
      </P>
      <H3>License we grant you</H3>
      <P>
        We grant you a limited, non-exclusive, non-transferable, revocable license to download, install and use the
        Teezer apps and to access the Platform for your personal, non-commercial use (and for creator activities the
        Platform expressly supports), subject to these Terms.
      </P>
      <H3>Your responsibilities</H3>
      <UL>
        <li>You are solely responsible for Your Content and must hold all rights needed to post it, including rights to any music, footage or images it contains.</li>
        <li>Other users may interact with your public content - for example commenting, sharing, downloading or Duets - according to the permissions you set in your privacy settings.</li>
        <li>Feedback and suggestions you send us may be used without restriction or compensation.</li>
      </UL>

      {/* 6 */}
      <H2 id="conduct" n={6}>Acceptable Use</H2>
      <P>
        Everything you post and do on the Platform must comply with our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. In addition, when using the Platform you must not:
      </P>
      <UL>
        <li>Break any applicable law or regulation, or encourage others to do so;</li>
        <li>Impersonate any person or organization, or misrepresent your affiliation with them;</li>
        <li>Harass, bully, threaten, defame or intimidate others;</li>
        <li>Upload viruses or malicious code, or interfere with, breach, probe or overload the Platform or its security features;</li>
        <li>Access the Platform by automated means, or scrape, harvest or collect user data or content without our written permission;</li>
        <li>Reverse-engineer, decompile or modify the Platform or its apps, except where the law permits it;</li>
        <li>Buy, sell, rent or transfer accounts, usernames, Coins or Gifts, or artificially inflate engagement (fake likes, views, followers, shares or gifts);</li>
        <li>Use the Platform to send spam, chain messages or unauthorized advertising;</li>
        <li>Circumvent content moderation, account bans, geographic restrictions or signed-media protections;</li>
        <li>Use content from the Platform to train artificial-intelligence models without our written permission.</li>
      </UL>

      {/* 7 */}
      <H2 id="virtual-items" n={7}>Coins, Gifts and Virtual Items</H2>
      <DataTable
        headers={["Item", "What it is", "Key rules"]}
        rows={[
          [
            "Coins",
            "A virtual item you purchase to use features of the Platform, mainly sending Gifts to creators.",
            "No cash value. Not refundable or exchangeable outside the Platform, except where required by law. Prices and packages may change at any time.",
          ],
          [
            "Gifts",
            "Virtual items you send to creators to show appreciation for their content.",
            "Sending a Gift is final. Gifts convert to creator earnings according to the rates shown in Teezer Studio at the time of sending.",
          ],
          [
            "Wallet",
            "The record of your Coin balance and transaction history.",
            "Balances are licenses to use Platform features, not deposits or stored money. We may correct balances affected by error or fraud.",
          ],
        ]}
      />
      <UL>
        <li>Purchases are processed by third-party payment providers (PayPal, Stripe, Razorpay); the provider&apos;s own terms apply to the payment transaction itself. We never receive or store your full card number or bank credentials.</li>
        <li>We may cancel, refuse or reverse transactions that we reasonably believe are fraudulent, mistaken or in violation of these Terms.</li>
        <li>Virtual items may be modified or discontinued; where we discontinue an item, we will give reasonable notice where practicable.</li>
        <li>If you are under 18, you must have permission from a parent or guardian before making any purchase.</li>
      </UL>

      {/* 8 */}
      <H2 id="monetization" n={8}>Creator Earnings and Payouts</H2>
      <UL>
        <li>Eligible creators may earn from Gifts and other monetization features. Eligibility requirements, commission rates, payout thresholds and schedules are shown in Teezer Studio and may be updated from time to time.</li>
        <li>You must provide accurate payout details and keep them current. Payouts are made to the payout method you register.</li>
        <li>You are responsible for any taxes, levies or duties on your earnings, and for reporting them to your tax authorities.</li>
        <li>Earnings obtained through fraud, artificial engagement, self-gifting schemes or Guideline violations may be withheld, reversed or forfeited, and the related accounts may be suspended.</li>
        <li>Monetization features are a benefit, not a right - we may suspend or modify them for accounts under investigation or in violation of these Terms.</li>
      </UL>

      {/* 9 */}
      <H2 id="ip" n={9}>Intellectual Property</H2>
      <P>
        The Platform itself - including its software, design, interface, logos, trademarks and branding - is owned by
        us or our licensors and is protected by intellectual-property laws. Except for the limited license in section
        5, nothing in these Terms grants you any right to use our trademarks or branding without written permission.
      </P>
      <H3>Copyright complaints</H3>
      <P>
        We respect the intellectual property of others and expect the same from our users. If you believe content on
        Teezer infringes your copyright, report it in-app or email {CONTACT_EMAIL} with:
      </P>
      <UL>
        <li>Identification of the copyrighted work you claim is infringed;</li>
        <li>The link (URL) or location of the allegedly infringing content on the Platform;</li>
        <li>Your name, address and email so we can contact you;</li>
        <li>A statement that you believe in good faith that the use is not authorized by the copyright owner, its agent or the law; and</li>
        <li>A statement, made under penalty of perjury, that the information in your notice is accurate and that you are the copyright owner or authorized to act for them.</li>
      </UL>
      <P>
        We remove infringing content when properly notified and terminate the accounts of repeat infringers. If your
        content was removed by mistake, you may submit a counter-notice with equivalent detail to the same address.
      </P>

      {/* 10 */}
      <H2 id="moderation" n={10}>Moderation and Enforcement</H2>
      <P>
        We use a combination of automated content-safety systems (including nudity and unsafe-content detection and
        text filtering) and human review to enforce these Terms and the{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>. We may, at any time and without prior notice:
      </P>
      <UL>
        <li>Remove, restrict, demote or age-gate content that violates our rules or that we are required to remove by law;</li>
        <li>Hold newly uploaded content for review before it appears in feeds;</li>
        <li>Restrict features (for example commenting, messaging or uploading) on accounts under review;</li>
        <li>Warn, suspend or permanently ban accounts, as described in the enforcement table in the <DocLink href="/guidelines">Community Guidelines</DocLink>;</li>
        <li>Preserve evidence and cooperate with law enforcement where legally required, as described in our <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
      </UL>
      <P>
        Every user can report videos, stories, comments, messages and accounts directly in the app; each report is
        reviewed. If you believe we made an enforcement mistake, contact us at {CONTACT_EMAIL} and we will take
        another look.
      </P>

      {/* 11 */}
      <H2 id="termination" n={11}>Suspension and Termination</H2>
      <UL>
        <li><strong>By you:</strong> you may stop using the Platform at any time and delete your account in Settings.</li>
        <li><strong>By us:</strong> we may suspend or terminate your access immediately, with or without notice, for serious or repeated violations of these Terms or the Guidelines, for fraud or unlawful activity, to comply with law, or if providing the Platform to you creates risk for us or other users.</li>
        <li>Upon termination, the licenses granted to you end, but sections that by their nature should survive (including content licenses to the extent described in section 5, disclaimers, limitation of liability, indemnification and governing law) survive.</li>
        <li>Termination does not entitle you to any refund of Coins or other virtual items, except where required by law.</li>
      </UL>

      {/* 12 */}
      <H2 id="third-party" n={12}>Third-Party Services</H2>
      <P>
        The Platform relies on and links to services operated by third parties - for example payment processors
        (PayPal, Stripe, Razorpay), sign-in providers (Google, Apple), GIF search (GIPHY), and links users place in
        their content or profiles. Those services have their own terms and privacy policies, and we are not
        responsible for them. A list of the third-party services that receive data, and what they receive, is in our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>.
      </P>

      {/* 13 */}
      <H2 id="disclaimers" n={13}>Disclaimers</H2>
      <P>
        THE PLATFORM IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot;, WITHOUT WARRANTIES OF ANY KIND,
        WHETHER EXPRESS OR IMPLIED, INCLUDING IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE
        AND NON-INFRINGEMENT. We do not warrant that the Platform will be uninterrupted, secure, error-free or free
        of harmful components, or that content will be accurate, reliable or lawful. Content posted by users is the
        responsibility of the person who posted it and does not represent our views. You use the Platform at your own
        risk. Some jurisdictions do not allow certain warranty exclusions, so parts of this section may not apply to
        you.
      </P>

      {/* 14 */}
      <H2 id="liability" n={14}>Limitation of Liability</H2>
      <P>
        TO THE FULLEST EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL, PUNITIVE OR EXEMPLARY DAMAGES, OR FOR ANY LOSS OF PROFITS, REVENUE, DATA, GOODWILL OR
        OPPORTUNITY, ARISING OUT OF OR RELATING TO THESE TERMS OR THE PLATFORM, EVEN IF WE HAVE BEEN ADVISED OF THE
        POSSIBILITY OF SUCH DAMAGES. TO THE FULLEST EXTENT PERMITTED BY LAW, OUR TOTAL AGGREGATE LIABILITY FOR ALL
        CLAIMS RELATING TO THESE TERMS OR THE PLATFORM IS LIMITED TO THE GREATER OF (A) THE AMOUNT YOU PAID US IN THE
        TWELVE MONTHS BEFORE THE CLAIM AROSE, OR (B) ONE HUNDRED US DOLLARS (USD 100). Nothing in these Terms
        excludes or limits liability that cannot be excluded or limited under applicable law.
      </P>

      {/* 15 */}
      <H2 id="indemnity" n={15}>Indemnification</H2>
      <P>
        To the extent permitted by law, you agree to indemnify and hold harmless Teezer and its
        officers, employees and agents from and against any claims, liabilities, damages, losses and expenses
        (including reasonable legal fees) arising out of or connected with: (a) Your Content; (b) your use of the
        Platform; (c) your violation of these Terms, the Guidelines or any law; or (d) your violation of any rights
        of another person or entity.
      </P>

      {/* 16 */}
      <H2 id="law" n={16}>Governing Law and Disputes</H2>
      <UL>
        <li>These Terms are governed by the laws of Nepal, without regard to conflict-of-law rules.</li>
        <li>Disputes will be subject to the exclusive jurisdiction of the courts located in Nepal, unless mandatory consumer-protection law in your country of residence provides otherwise.</li>
        <li>Before filing a claim, please contact us at {CONTACT_EMAIL} - most concerns can be resolved quickly and informally.</li>
      </UL>

      {/* 17 */}
      <H2 id="general" n={17}>General Terms</H2>
      <UL>
        <li><strong>Entire agreement.</strong> These Terms, the <DocLink href="/privacy">Privacy Policy</DocLink> and the <DocLink href="/guidelines">Community Guidelines</DocLink> are the entire agreement between you and us regarding the Platform, and supersede any prior agreements.</li>
        <li><strong>Severability.</strong> If any provision is found unenforceable, it will be modified to the minimum extent necessary, and the remaining provisions stay in full effect.</li>
        <li><strong>No waiver.</strong> Our failure to enforce a provision is not a waiver of our right to enforce it later.</li>
        <li><strong>Assignment.</strong> You may not assign or transfer these Terms. We may assign them in connection with a merger, acquisition, reorganization or sale of assets; you will be notified as described in the <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
        <li><strong>Force majeure.</strong> We are not liable for delays or failures caused by events beyond our reasonable control.</li>
        <li><strong>No third-party beneficiaries.</strong> These Terms do not create rights for anyone other than you and us.</li>
      </UL>

      {/* 18 */}
      <H2 id="changes" n={18}>Changes to These Terms</H2>
      <P>
        We may update these Terms from time to time - for example to reflect new features, changes to the Platform or
        changes in the law. When we make material changes we will notify you, such as by an in-app notice or email,
        and update the &quot;Last updated&quot; date at the top of this page. Changes take effect on the date stated
        in the notice. If you do not agree to the updated Terms, stop using the Platform and delete your account;
        continuing to use the Platform after the effective date means you accept them.
      </P>

      {/* 19 */}
      <H2 id="contact" n={19}>Contact</H2>
      <P>
        Questions about these Terms? Contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">
          {CONTACT_EMAIL}
        </a>
        . For privacy questions, see our <DocLink href="/privacy">Privacy Policy</DocLink>; for content rules, see the{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>.
      </P>
    </LegalShell>
    } />
  );
}
