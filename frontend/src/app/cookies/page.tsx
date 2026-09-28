import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description: "How Teezer uses cookies, local storage and similar technologies on the web, and the choices you have.",
  alternates: { canonical: "https://teezer.live/cookies" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "what-are-cookies", label: "What Cookies Are" },
  { id: "how-we-use", label: "How Teezer Uses Them" },
  { id: "inventory", label: "Cookies and Storage We Use" },
  { id: "third-party", label: "Third-Party Technologies" },
  { id: "choices", label: "Your Choices" },
  { id: "changes", label: "Changes to This Policy" },
  { id: "contact", label: "Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "The full picture of how we handle your information." },
  { href: "/terms", label: "Terms of Service", desc: "The agreement that governs your use of Teezer." },
  { href: "/settings/privacy", label: "Privacy Settings", desc: "Manage your privacy controls directly in your account." },
];

export default function CookiePolicyPage() {
  return (
    <CmsAwarePolicyPage slug="cookies" eyebrow="Legal · Cookies" fallback={
      <LegalShell eyebrow="Legal · Cookies" title="Cookie Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This Cookie Policy explains how Teezer (&quot;we&quot;, &quot;us&quot;) uses cookies, browser local storage
        and similar technologies when you use teezer.live. It supplements Section 1 (What Information We Collect) of
        our <DocLink href="/privacy">Privacy Policy</DocLink>, which describes our data practices in full. In short:
        we use only what is needed to sign you in, keep the Platform secure and remember your preferences - <strong>we
        do not use advertising or third-party analytics cookies.</strong>
      </P>

      <H2 id="what-are-cookies" n={1}>What Cookies Are</H2>
      <P>
        Cookies are small text files placed on your device by a website. Local storage is a similar browser feature
        that lets a site remember information between visits. Both can be &quot;session&quot; (deleted when you close
        the browser) or &quot;persistent&quot; (kept until they expire or you delete them). The Teezer mobile apps do
        not use cookies; equivalent on-device storage in the apps is described in the{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>.
      </P>

      <H2 id="how-we-use" n={2}>How Teezer Uses Them</H2>
      <UL>
        <li><strong>Authentication</strong> - keeping you signed in securely between visits.</li>
        <li><strong>Security</strong> - protecting login and the Platform from bots and abuse.</li>
        <li><strong>Preferences</strong> - remembering choices such as your theme, accessibility setup and recent searches.</li>
      </UL>
      <P>
        Every technology we use falls into one of these strictly-necessary or functional categories. We do not use
        cookies to build advertising profiles, and we do not permit third parties to place tracking cookies through
        the Platform.
      </P>

      <H2 id="inventory" n={3}>Cookies and Storage We Use</H2>
      <DataTable
        headers={["Name", "Type", "Purpose", "Duration"]}
        rows={[
          ["Authentication token", "Secure storage", "Keeps you signed in to your account", "Until you sign out or the session is revoked"],
          ["reelsoo:theme", "Local storage", "Remembers your light/dark theme choice", "Persistent until cleared"],
          ["reelsoo:a11y", "Local storage", "Restores your saved Accessibility Settings instantly on load", "Persistent until cleared"],
          ["Recent searches", "Local storage", "Shows your recent search chips on the search page", "Persistent until you clear them in-app"],
          ["__cf_bm and related", "Cookie (Cloudflare)", "Bot management and edge security for the site and media delivery", "Typically under 30 minutes"],
          ["Turnstile verification", "Cookie (Cloudflare)", "Confirms you are human during login without a CAPTCHA puzzle", "Session"],
        ]}
      />
      <P>
        Exact technical names may change as we update the Platform; the categories and purposes above stay accurate,
        and we update this table when new technologies are introduced.
      </P>

      <H2 id="third-party" n={4}>Third-Party Technologies</H2>
      <P>
        The only third party that sets cookies through teezer.live is <strong>Cloudflare</strong>, our security and
        content-delivery provider, strictly for bot protection and platform security. Optional features you actively
        use - such as GIF search powered by GIPHY, or Sign in with Google or Apple - involve requests to those
        providers under their own policies, as listed in Section 4 (How We Share Your Information) of the{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>.
      </P>

      <H2 id="choices" n={5}>Your Choices</H2>
      <UL>
        <li>Your browser lets you view, block or delete cookies and site data for teezer.live at any time. Blocking strictly necessary storage will prevent signing in.</li>
        <li>Recent searches can be cleared in the app and website search pages, and in Settings → Content Preferences.</li>
        <li>Theme and accessibility storage can be reset by changing those settings, or by clearing site data.</li>
        <li>Because we use no advertising cookies, there is nothing to opt out of - there are no ad-tracking identifiers to manage.</li>
      </UL>

      <H2 id="changes" n={6}>Changes to This Policy</H2>
      <P>
        If we introduce new cookies or storage, we will update this page and the &quot;Last updated&quot; date, and -
        where a new category is material - notify you as described in Section 11 of the{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>.
      </P>

      <H2 id="contact" n={7}>Contact</H2>
      <P>
        Questions about cookies or this policy? Contact us at{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fd4605] hover:underline">{CONTACT_EMAIL}</a>.
      </P>
    </LegalShell>
    } />
  );
}
