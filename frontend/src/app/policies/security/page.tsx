import type { Metadata } from "next";
import { LegalShell, H2, H3, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Security Policy",
  description: "How Teezer protects your account and data - encryption, signed media, account protection and how to report vulnerabilities.",
  alternates: { canonical: "https://teezer.live/policies/security" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "in-transit", label: "Encryption in Transit" },
  { id: "passwords", label: "Passwords and Credentials" },
  { id: "media", label: "Media Protection" },
  { id: "account-tools", label: "Account Protection Tools" },
  { id: "abuse", label: "Abuse and Bot Prevention" },
  { id: "internal", label: "Internal Access Controls" },
  { id: "report", label: "Reporting a Vulnerability" },
];

const RELATED: RelatedDoc[] = [
  { href: "/privacy", label: "Privacy Policy", desc: "Section 8 is the governing clause for this policy." },
  { href: "/settings/security", label: "Login & Security", desc: "Manage 2FA, sessions and login alerts." },
  { href: "/policies/data-retention", label: "Data Retention & Deletion", desc: "How long protected data is kept." },
];

export default function SecurityPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="security" eyebrow="Policy · Security" fallback={
      <LegalShell eyebrow="Policy · Security" title="Security Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy is a detailed reference for Section 8 (How We Protect Your Information) of our{" "}
        <DocLink href="/privacy">Privacy Policy</DocLink>. It describes the concrete measures that protect your
        account and data on Teezer, and how to reach us if you find a weakness.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <P>
        Security is layered: we protect data in transit, store credentials so that even we cannot read your password,
        serve media through short-lived signed links, and give you first-party tools to lock down your own account.
        No system is perfectly secure, but each of these layers narrows what an attacker could do.
      </P>

      <H2 id="in-transit" n={2}>Encryption in Transit</H2>
      <P>
        All traffic between your device and Teezer - the website, the apps, and our API - is encrypted in transit
        using TLS (HTTPS). Direct messages are encrypted in transit as well; note that messages are not end-to-end
        encrypted, as described in Section 2 of our <DocLink href="/privacy">Privacy Policy</DocLink>. Voice and video
        calls are transmitted peer-to-peer and are never recorded or stored by us.
      </P>

      <H2 id="passwords" n={3}>Passwords and Credentials</H2>
      <UL>
        <li>Passwords are stored only as strong, salted one-way hashes - we never store or have access to your plain-text password.</li>
        <li>We never receive or store your full payment card number or bank credentials; those go directly to our payment processors.</li>
        <li>Where full IP addresses are not required, we store a one-way hash instead of the raw address.</li>
      </UL>

      <H2 id="media" n={4}>Media Protection</H2>
      <P>
        Uploaded videos and images are served from our storage through <strong>signed, expiring URLs</strong>: each
        link is cryptographically signed and valid only for a limited window, so files cannot be enumerated,
        guessed, or hot-linked from outside the Platform. Media infrastructure additionally sits behind an edge
        security layer that validates every request before it reaches storage.
      </P>

      <H2 id="account-tools" n={5}>Account Protection Tools</H2>
      <DataTable
        headers={["Tool", "What it does", "Where"]}
        rows={[
          ["Two-factor authentication", "Requires a second factor at login, so a stolen password alone isn't enough", "Settings → Security"],
          ["New-login alerts", "Notifies you when your account is accessed from a new device", "Settings → Security"],
          ["Session management", "Review every active session and revoke any you don't recognize", "Settings → Security"],
          ["Revoke all other sessions", "Sign out every device except the one you're using, in one action", "Settings → Security"],
        ]}
      />

      <H2 id="abuse" n={6}>Abuse and Bot Prevention</H2>
      <UL>
        <li>Login is protected by bot-management that confirms you&apos;re human without a puzzle CAPTCHA in most cases.</li>
        <li>Platform-wide rate limiting throttles abusive request patterns before they can affect the service.</li>
        <li>Device and behavioural signals feed automated fraud detection, as described in our <DocLink href="/policies/integrity">Integrity &amp; Authenticity Policy</DocLink>.</li>
      </UL>

      <H2 id="internal" n={7}>Internal Access Controls</H2>
      <P>
        Administrative access to user data is restricted to authorized personnel on a need-to-know basis and is
        logged. Staff access to sensitive data (such as message content during a report investigation) is scoped to
        the task and auditable.
      </P>

      <H2 id="report" n={8}>Reporting a Vulnerability</H2>
      <P>
        If you believe you&apos;ve found a security vulnerability, please report it responsibly to{" "}
        <a href={`mailto:${CONTACT_EMAIL}?subject=Security%20Vulnerability`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        with the subject line &quot;Security Vulnerability&quot; and enough detail to reproduce it. Please give us a
        reasonable opportunity to investigate and remediate before any public disclosure, and do not access, modify or
        delete data that isn&apos;t yours while testing. If you believe your own account has been compromised, change
        your password, revoke other sessions, and contact us immediately.
      </P>
    </LegalShell>
    } />
  );
}
