import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How Teezer collects, uses, shares and protects your information, and the choices and controls you have over your data.",
  alternates: { canonical: "https://teezer.live/privacy" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "scope", label: "Scope of This Policy" },
  { id: "information-we-collect", label: "What Information We Collect" },
  { id: "how-we-use", label: "How We Use Your Information" },
  { id: "how-we-share", label: "How We Share Your Information" },
  { id: "your-choices", label: "Your Rights, Choices and Controls" },
  { id: "retention", label: "Data Retention and Deletion" },
  { id: "security", label: "How We Protect Your Information" },
  { id: "children", label: "Children and Teens" },
  { id: "international", label: "International Data Transfers" },
  { id: "third-party", label: "Third-Party Services and Links" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "How to Contact Us" },
];

const RELATED: RelatedDoc[] = [
  { href: "/terms", label: "Terms of Service", desc: "The agreement that governs your use of Teezer." },
  { href: "/guidelines", label: "Community Guidelines", desc: "The rules for content and behaviour on the Platform." },
  { href: "/cookies", label: "Cookie Policy", desc: "The cookies and storage the website uses, in detail." },
  { href: "/law-enforcement", label: "Law Enforcement Guidelines", desc: "How authorities can request data, and how we respond." },
  { href: "/settings/privacy", label: "Privacy Settings", desc: "Manage your privacy controls directly in your account." },
];

export default function PrivacyPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="privacy" eyebrow="Legal · Privacy" fallback={
      <LegalShell eyebrow="Legal · Privacy" title="Privacy Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        Welcome to Teezer (&quot;Teezer&quot;, the &quot;Platform&quot;, &quot;we&quot;, &quot;us&quot; or
        &quot;our&quot;), a short-video platform operated by CineflixPrime. This Privacy Policy explains what
        information we collect when you use our website at teezer.live, our mobile applications, and the related
        services we offer (together, the &quot;Platform&quot;), how we use and share that information, and the rights
        and controls you have over it. This Policy should be read together with our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>, which govern your use of the Platform, and our{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>, which set out the rules for content and behaviour.
      </P>

      {/* At a glance */}
      <div className="mt-8 rounded-2xl border border-gray-200 bg-gray-50 p-6">
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">This policy at a glance</p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            ["We don't sell your data", "No sale of personal information, no advertisers, no third-party ad or analytics trackers."],
            ["No precise location", "We only derive your approximate country from your IP address - never GPS."],
            ["You're in control", "Private account, granular interaction settings, data export and account deletion are built in."],
            ["Calls aren't recorded", "Voice and video calls are peer-to-peer; we keep only call logs, never recordings."],
          ].map(([t, d]) => (
            <div key={t} className="rounded-xl bg-white p-4 shadow-sm">
              <p className="text-sm font-bold text-gray-900">{t}</p>
              <p className="mt-1 text-sm leading-6 text-gray-600">{d}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── 1. Scope ── */}
      <H2 id="scope" n={1}>Scope of This Policy</H2>
      <P>
        This Policy applies to everyone who uses the Platform, whether or not you have registered an account. It
        covers the Teezer website, the Teezer mobile apps, Teezer Studio creator tools, and our messaging and
        calling features. By accessing or using Teezer, you agree to the collection and use of information in
        accordance with this Policy and to the <DocLink href="/terms">Terms of Service</DocLink>. If you do not agree,
        please do not use the Platform.
      </P>

      {/* ── 2. What we collect ── */}
      <H2 id="information-we-collect" n={2}>What Information We Collect</H2>
      <P>
        We collect information in three ways: information you provide to us directly, information collected
        automatically when you use the Platform, and information we receive from other sources such as the sign-in
        providers you choose to use.
      </P>

      <H3>A. Information you provide</H3>
      <DataTable
        headers={["Category", "What it includes", "Why we collect it"]}
        rows={[
          [
            "Account information",
            "Name, username, email address, password, and - if you add them - phone number, date of birth and gender.",
            "To create and secure your account, verify your email, and let others find you by username.",
          ],
          [
            "Profile information",
            "Profile photo, bio, website, general location, country, preferred language, interests, content categories, and links to your other social profiles (Instagram, YouTube, X and others).",
            "To build your public profile and personalize your experience. Visibility follows your privacy settings.",
          ],
          [
            "Content you create",
            "Videos, images, stories, sounds, captions, hashtags, comments and reactions, with metadata such as upload time.",
            "To host, display and recommend your content. Public content can be viewed and shared by others.",
          ],
          [
            "Messages",
            "Direct messages you send and receive - text, images, video, audio, voice notes and documents - plus call logs (who, when, duration, status).",
            "To deliver messages and show conversation history across devices. Calls are peer-to-peer and never recorded; messages are encrypted in transit but not end-to-end encrypted.",
          ],
          [
            "Purchase information",
            "Coin orders, wallet balance, gift and transaction history, and payout details you register as a creator.",
            "To process purchases, gifts and creator earnings. Payment is handled by PayPal, Stripe or Razorpay - we never receive or store your full card number or bank credentials.",
          ],
          [
            "Reports & support",
            "The contents of reports you file about content or users, and messages you send to support.",
            "To review reports, enforce our guidelines and respond to you.",
          ],
        ]}
      />

      <H3>B. Information collected automatically</H3>
      <DataTable
        headers={["Category", "What it includes", "Why we collect it"]}
        rows={[
          [
            "Usage information",
            "Videos you watch and for how long (watch duration, furthest position, completions, replays), likes, saves, shares, comments, follows, searches you run, and your watch history.",
            "To operate the Platform, rank your For You feed and measure what content works. Watch history can be turned off or cleared any time.",
          ],
          [
            "Inferred interests",
            "The categories, hashtags and creators we infer you're interested in, with interaction weights; mutual-follow relationships.",
            "To personalize your feed and account suggestions. Dismissing a suggestion teaches us to show fewer like it.",
          ],
          [
            "Device & technical data",
            "IP address, browser type and user agent, device platform (web / Android / iOS), app version, a randomly generated device identifier, and push notification tokens if you enable notifications.",
            "For security, rate limiting, spam prevention and delivering notifications. Where only statistics are needed (e.g. unique view counts), we store a one-way hash of the IP rather than the raw address.",
          ],
          [
            "Approximate location",
            "Your approximate country, derived from your IP address at the network level. No GPS or precise location is ever collected.",
            "To show locally relevant content, apply regional settings and protect against abuse. Any location on your profile is typed in by you.",
          ],
          [
            "Profile views",
            "Which profiles you view and who views yours, while Profile View history is enabled.",
            "To power the reciprocal “Profile views” feature. Turning it off hides both directions.",
          ],
          [
            "Activity status",
            "Whether you're currently online and when you were last active.",
            "So friends can see your activity status - only if your settings allow it.",
          ],
          [
            "Log & security data",
            "Sign-in events, active sessions with device/browser details, security-relevant actions and anti-abuse records.",
            "To secure your account, show you your active sessions and alert you to new logins if enabled.",
          ],
          [
            "Cookies & similar",
            "Strictly necessary cookies and local storage on the web: your session, theme and preferences.",
            "To keep you signed in and remember settings. We use no third-party advertising or analytics cookies.",
          ],
        ]}
      />

      <H3>C. Information from other sources</H3>
      <DataTable
        headers={["Source", "What we receive", "Purpose"]}
        rows={[
          [
            "Sign in with Google / Apple",
            "Your name, email address and confirmation that the email is verified. Nothing else - no contacts, files or other account data.",
            "To create your account or sign you in without a password.",
          ],
          [
            "Other users",
            "Content that includes or mentions you - for example a tag in a video or a mention in a comment.",
            "To deliver the social features you and others use. Who can tag or mention you is controlled in your settings.",
          ],
        ]}
      />

      {/* ── 3. How we use ── */}
      <H2 id="how-we-use" n={3}>How We Use Your Information</H2>
      <UL>
        <li>
          <strong>Provide the Platform</strong> - create and maintain your account, host and stream your content,
          deliver messages and calls, operate stories, gifts, wallets and creator tools, and remember your settings
          across devices.
        </li>
        <li>
          <strong>Personalize your experience</strong> - rank your For You feed, recommend accounts you may know or
          enjoy (using mutual-follow relationships, shared interests and approximate country), suggest sounds and
          hashtags, and show trending content relevant to your region.
        </li>
        <li>
          <strong>Keep Teezer safe</strong> - detect and prevent spam, fraud, abuse and violations of our{" "}
          <DocLink href="/guidelines">Community Guidelines</DocLink>. This includes automated review of uploaded media
          by content-safety systems (nudity and unsafe-content detection), automated text filtering, internal trust
          and risk scoring, bot protection on login, rate limiting, and human review by our moderation team where
          automated systems flag content.
        </li>
        <li>
          <strong>Process transactions</strong> - complete Coin purchases, deliver Gifts, maintain wallet balances,
          calculate creator earnings, process payouts, and keep records we are legally required to keep. Virtual
          items are subject to the rules in our <DocLink href="/terms">Terms of Service</DocLink>.
        </li>
        <li>
          <strong>Communicate with you</strong> - send verification codes to your email, notify you about activity on
          your account, alert you to new logins if enabled, and respond to reports and support requests.
        </li>
        <li>
          <strong>Understand and improve the Platform</strong> - measure feature usage, debug problems and develop
          new features using our own internal tools. We do not share usage data with third-party analytics companies.
        </li>
        <li>
          <strong>Comply with law</strong> - meet our legal obligations, enforce our{" "}
          <DocLink href="/terms">Terms of Service</DocLink>, and protect the rights, property and safety of Teezer,
          our users and the public.
        </li>
      </UL>

      {/* ── 4. Sharing ── */}
      <H2 id="how-we-share" n={4}>How We Share Your Information</H2>
      <P>
        <strong>We do not sell your personal information, and we do not share it with advertisers or third-party ad
        networks.</strong> We share information only as described below:
      </P>
      <DataTable
        headers={["Recipient", "What is shared", "Why"]}
        rows={[
          [
            "Other users",
            "Your profile, posted content and public activity, according to your privacy settings. Messages go to the people in the conversation.",
            "This is how a social platform works. Private accounts limit content to approved followers.",
          ],
          [
            "Content delivery & storage (Cloudflare)",
            "Uploaded media (videos, images, audio), served through signed, expiring URLs.",
            "To store your content securely and stream it fast worldwide.",
          ],
          [
            "Payment processors (PayPal, Stripe, Razorpay)",
            "Order details needed to complete a payment. Your card and bank credentials go directly to the processor - never to us.",
            "To process Coin purchases and payouts.",
          ],
          [
            "Sign-in providers (Google, Apple)",
            "A token exchange that verifies who you are when you choose social login.",
            "To authenticate your account.",
          ],
          [
            "Notification services (Expo, Firebase Cloud Messaging)",
            "A push token for your device and the notification content.",
            "To deliver push notifications you've enabled.",
          ],
          [
            "GIPHY",
            "Your GIF search terms, sent when you search GIFs in comments or messages.",
            "To power GIF search.",
          ],
          [
            "OpenStreetMap (Nominatim)",
            "Location text you search when adding a location to your profile.",
            "To look up and format places.",
          ],
          [
            "Our moderation & administration team",
            "Account, content, message and transaction records, where necessary and with access logged.",
            "To review reports, enforce guidelines, investigate abuse and provide support.",
          ],
          [
            "Law enforcement / legal",
            "Information required by law, regulation, legal process or an enforceable government request.",
            "To comply with law and protect users, the public and the Platform.",
          ],
          [
            "A successor in a business transfer",
            "Your information as part of a merger, acquisition, reorganization or sale of assets.",
            "You will be notified of any change in ownership or in how your information is used.",
          ],
        ]}
      />

      {/* ── 5. Rights & choices ── */}
      <H2 id="your-choices" n={5}>Your Rights, Choices and Controls</H2>
      <P>
        Teezer gives you extensive control over your information, directly inside the app and website. Most of these
        live in <DocLink href="/settings/privacy">Settings → Privacy</DocLink>:
      </P>
      <DataTable
        headers={["Control", "What it does", "Where to find it"]}
        rows={[
          ["Private account", "Only followers you approve can watch your videos; new followers need your explicit approval.", "Settings → Privacy"],
          ["Who can message you", "Everyone, people you follow, your followers, or no one.", "Settings → Privacy"],
          ["Comments, tags, Duet, downloads", "Choose who can comment on your videos, tag or mention you, Duet with your content, or download your videos - plus comment filters, hidden words and per-user restrictions.", "Settings → Privacy"],
          ["Liked videos visibility", "Choose who can see the videos you've liked.", "Settings → Privacy"],
          ["Activity status", "Show or hide when you're online and last active.", "Settings → Privacy / Inbox"],
          ["Profile views", "Turn view history on or off - off hides who viewed you and hides your own visits.", "Settings → Privacy"],
          ["Discovery & search engines", "Control whether your profile is suggested to others and whether it appears in search-engine results.", "Settings → Privacy"],
          ["Watch history", "Turn saving of your watch history on or off.", "Settings → Privacy"],
          ["Blocking", "Stop an account from finding your profile, viewing your content or contacting you.", "Any profile → menu"],
          ["Download your data", "Export a machine-readable copy of your profile, settings and related records.", "Settings → Account → Data"],
          ["Edit your information", "Change your name, username, bio, email, phone, birthday, gender, location and links any time.", "Settings → Account"],
          ["Delete your account", "Permanently close your account (see section 6).", "Settings → Account"],
          ["Security", "Two-factor authentication, active session review and revocation, new-login alerts.", "Settings → Security"],
          ["Notifications", "Choose which push and in-app notification categories you receive.", "Settings → Notifications"],
        ]}
      />
      <P>
        Depending on where you live, you may also have legal rights to request access to, correction of, deletion of,
        or a copy of your personal information, to object to or restrict certain processing, and to withdraw consent
        where processing is based on consent. You can exercise these rights using the in-app tools above or by
        contacting us (section 12). We will respond in accordance with applicable law, and we will never discriminate
        against you for exercising your rights.
      </P>

      {/* ── 6. Retention ── */}
      <H2 id="retention" n={6}>Data Retention and Deletion</H2>
      <P>
        We keep your information for as long as your account exists and as long as needed to provide the Platform.
        When you delete your account, all active sessions are signed out immediately and your account and content
        stop being available to other users. Certain records are retained afterwards only where we have a legitimate
        reason:
      </P>
      <DataTable
        headers={["Data", "Retained after deletion?", "Why"]}
        rows={[
          ["Profile & content", "Removed from the Platform", "No longer needed once your account is closed."],
          ["Transaction records", "Yes, for the legally required period", "Accounting, tax and fraud-prevention obligations."],
          ["Safety & moderation records", "Yes, as long as necessary", "To keep the Platform safe, prevent banned users returning, and meet legal obligations."],
          ["Security logs", "Yes, for a limited period", "Abuse investigation and account-security forensics."],
          ["Encrypted backups", "Residual copies for a limited period", "Overwritten in the ordinary course of backup rotation."],
          ["Messages you sent", "Remain visible to recipients", "A conversation belongs to all its participants."],
          ["Content by others featuring you", "May remain (e.g. a Duet)", "Subject to the creator's rights and our guidelines."],
        ]}
      />

      {/* ── 7. Security ── */}
      <H2 id="security" n={7}>How We Protect Your Information</H2>
      <UL>
        <li>All traffic between your device and Teezer is encrypted in transit using TLS (HTTPS).</li>
        <li>Passwords are stored only as strong one-way hashes - we never store or see your plain-text password.</li>
        <li>
          Uploaded media is served through signed, expiring URLs so files cannot be enumerated or hot-linked, and
          media infrastructure sits behind an edge security layer.
        </li>
        <li>Where full IP addresses are not required, we store one-way hashes instead.</li>
        <li>
          Account protection includes two-factor authentication, new-login alerts, session management, bot protection
          on login and platform-wide rate limiting.
        </li>
        <li>Administrative access to user data is restricted to authorized personnel and is logged.</li>
      </UL>
      <P>
        No method of transmission or storage is 100% secure, so we cannot guarantee absolute security. Please use a
        strong, unique password, enable two-factor authentication, and contact us immediately if you believe your
        account has been compromised.
      </P>

      {/* ── 8. Children ── */}
      <H2 id="children" n={8}>Children and Teens</H2>
      <P>
        Teezer is not directed at children under the age of 13 (or the higher minimum age required in your country,
        such as 16 in parts of the European Economic Area), and we do not knowingly collect personal information from
        them. If you believe a user is under the minimum age, please report the account or contact us at{" "}
        {CONTACT_EMAIL}. If we learn that we have collected personal information from a child under the applicable
        minimum age, we will delete the account and its information.
      </P>

      {/* ── 9. International ── */}
      <H2 id="international" n={9}>International Data Transfers</H2>
      <P>
        Teezer is used around the world. Your information is stored on our servers and with our infrastructure
        providers, which may be located in countries other than the one you live in, and may be processed in those
        countries. Wherever your information is processed, we apply the protections described in this Policy, and
        where required by law we implement appropriate safeguards for cross-border transfers.
      </P>

      {/* ── 10. Third party ── */}
      <H2 id="third-party" n={10}>Third-Party Services and Links</H2>
      <P>
        The Platform may contain links to websites, apps or profiles operated by third parties (for example, a link
        in a creator&apos;s bio), and optional integrations such as GIF search powered by GIPHY. Those third parties
        have their own privacy policies, and we are not responsible for their practices. We encourage you to review
        the privacy policy of any third-party service you visit or use.
      </P>

      {/* ── 11. Changes ── */}
      <H2 id="changes" n={11}>Changes to This Policy</H2>
      <P>
        We may update this Privacy Policy from time to time - for example to reflect new features or changes in the
        law. When we make material changes we will notify you, such as by an in-app notice or email, and update the
        &quot;Last updated&quot; date at the top of this page. Your continued use of the Platform after an updated
        Policy takes effect means you accept the updated Policy.
      </P>

      {/* ── 12. Contact ── */}
      <H2 id="contact" n={12}>How to Contact Us</H2>
      <P>
        If you have questions, concerns or requests about this Privacy Policy or your personal information, contact
        us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">
          {CONTACT_EMAIL}
        </a>
        . You can also manage most privacy matters directly in{" "}
        <DocLink href="/settings/privacy">Settings → Privacy</DocLink>, and find the rules that govern the Platform in
        our <DocLink href="/terms">Terms of Service</DocLink> and{" "}
        <DocLink href="/guidelines">Community Guidelines</DocLink>.
      </P>
    </LegalShell>
    } />
  );
}
