import type { Metadata } from "next";
import { LegalShell, H2, P, UL, DataTable, DocLink, type TocItem, type RelatedDoc } from "@/features/legal/legal-ui";
import { CmsAwarePolicyPage } from "@/features/legal/cms-legal-page";

export const metadata: Metadata = {
  title: "Virtual Items Policy",
  description: "The rules for Coins, Gifts, wallets and creator earnings on Teezer - purchases, refunds, fraud and payouts.",
  alternates: { canonical: "https://teezer.live/virtual-items" },
};

const LAST_UPDATED = "July 4, 2026";
const CONTACT_EMAIL = "support@teezer.live";

const TOC: TocItem[] = [
  { id: "overview", label: "Overview" },
  { id: "coins", label: "Coins" },
  { id: "gifts", label: "Gifts" },
  { id: "wallet", label: "Your Wallet" },
  { id: "payments", label: "Payments and Refunds" },
  { id: "earnings", label: "Creator Earnings and Payouts" },
  { id: "fraud", label: "Fraud and Misuse" },
  { id: "minors", label: "Purchases by Minors" },
  { id: "changes", label: "Changes and Discontinuation" },
  { id: "contact", label: "Contact" },
];

const RELATED: RelatedDoc[] = [
  { href: "/terms", label: "Terms of Service", desc: "Sections 7-8 are the governing virtual-items clauses." },
  { href: "/privacy", label: "Privacy Policy", desc: "How purchase and payout records are handled." },
  { href: "/guidelines", label: "Community Guidelines", desc: "Integrity rules that also apply to gifting." },
];

export default function VirtualItemsPolicyPage() {
  return (
    <CmsAwarePolicyPage slug="virtual-items" eyebrow="Legal · Virtual Items" fallback={
      <LegalShell eyebrow="Legal · Virtual Items" title="Virtual Items Policy" lastUpdated={LAST_UPDATED} toc={TOC} related={RELATED}>
      <P>
        This policy sets out the rules for Coins, Gifts, wallets and creator earnings on Teezer. It expands on and is
        governed by Section 7 (Coins, Gifts and Virtual Items) and Section 8 (Creator Earnings and Payouts) of our{" "}
        <DocLink href="/terms">Terms of Service</DocLink>; if this page and the Terms ever conflict, the Terms control.
      </P>

      <H2 id="overview" n={1}>Overview</H2>
      <DataTable
        headers={["Item", "What it is", "Key rule"]}
        rows={[
          ["Coins", "A virtual item purchased to use Platform features, mainly sending Gifts", "No cash value; not refundable or transferable outside the Platform, except where the law requires"],
          ["Gifts", "Virtual items sent to creators to show appreciation", "Sending is final; Gifts convert to creator earnings at the rates shown in Teezer Studio"],
          ["Wallet", "The record of your Coin balance and transactions", "A license record, not stored money or a deposit account"],
          ["Earnings", "Value creators accrue from Gifts and monetization features", "Withdrawable through registered payout methods once thresholds are met"],
        ]}
      />

      <H2 id="coins" n={2}>Coins</H2>
      <UL>
        <li>Coins are a limited, revocable license to use features of the Platform. They are not money, e-money, cryptocurrency or property, and earn no interest.</li>
        <li>Coins cannot be sold, exchanged, gifted or transferred between accounts, and have no value outside Teezer.</li>
        <li>Coin packages, prices and any promotional bonuses are shown at purchase time and may change without notice; changes never affect Coins already purchased.</li>
        <li>Coins that remain unused stay on your account while it exists; closing your account forfeits remaining Coins, except where applicable law requires otherwise.</li>
      </UL>

      <H2 id="gifts" n={3}>Gifts</H2>
      <UL>
        <li>Sending a Gift immediately deducts its Coin price from your wallet and is final.</li>
        <li>Gifts convert to creator earnings at the conversion rate displayed in Teezer Studio at the time of sending; the difference between Coin price and creator earnings is the Platform&apos;s service fee.</li>
        <li>Gifting is appreciation, not payment for services - creators may not promise goods, services or off-platform rewards in exchange for Gifts.</li>
        <li>Gifts sent on content later removed for violations may be reversed as part of enforcement.</li>
      </UL>

      <H2 id="wallet" n={4}>Your Wallet</H2>
      <UL>
        <li>Your wallet shows your Coin balance and a full transaction history (purchases, Gifts sent and received, adjustments).</li>
        <li>We may correct balances affected by technical error, mistaken credit or fraud; material corrections are notified to you.</li>
        <li>Report unrecognized transactions immediately to {CONTACT_EMAIL} - see also the account-security tools in Section 3 of the <DocLink href="/terms">Terms of Service</DocLink>.</li>
      </UL>

      <H2 id="payments" n={5}>Payments and Refunds</H2>
      <UL>
        <li>Purchases are processed by third-party providers (PayPal, Stripe, Razorpay). The provider&apos;s own terms govern the payment transaction, and we never receive or store your full card number or bank credentials - see Section 4 of the <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
        <li><strong>All Coin purchases are final and non-refundable</strong>, except where required by the law of your country or where a purchase failed to deliver the Coins.</li>
        <li>If Coins were purchased but not credited, contact {CONTACT_EMAIL} with the transaction reference; verified failures are corrected or refunded.</li>
        <li>Initiating a payment dispute (chargeback) on a delivered purchase may result in suspension of your wallet while we investigate.</li>
      </UL>

      <H2 id="earnings" n={6}>Creator Earnings and Payouts</H2>
      <UL>
        <li>Eligibility requirements, commission rates, payout thresholds and schedules are shown in Teezer Studio and may be updated prospectively.</li>
        <li>Payouts are made only to the payout method registered on your account; keep those details accurate.</li>
        <li>You are responsible for all taxes on your earnings and for reporting them to your tax authorities.</li>
        <li>Earnings obtained through fraud, artificial engagement, self-gifting schemes or Guideline violations may be withheld, reversed or forfeited under Section 8 of the <DocLink href="/terms">Terms of Service</DocLink>.</li>
      </UL>

      <H2 id="fraud" n={7}>Fraud and Misuse</H2>
      <UL>
        <li>Buying Coins with stolen payment credentials, laundering value through Gifts, coordinated self-gifting, and buying or selling accounts or balances are strictly prohibited.</li>
        <li>We monitor transactions for abuse; suspicious activity may lead to holds, reversals, wallet suspension and account termination, and may be reported to payment providers and law enforcement as described in the <DocLink href="/privacy">Privacy Policy</DocLink>.</li>
      </UL>

      <H2 id="minors" n={8}>Purchases by Minors</H2>
      <P>
        If you are under 18 (or the age of majority where you live) you must have a parent or guardian&apos;s
        permission before purchasing Coins, and they must review this policy. Parents who believe a minor made
        unauthorized purchases should contact {CONTACT_EMAIL}.
      </P>

      <H2 id="changes" n={9}>Changes and Discontinuation</H2>
      <P>
        We may modify or discontinue virtual items, features or conversion rates. Where an item you hold is
        discontinued we will give reasonable notice where practicable and, where required by law, provide an
        equivalent replacement or remedy. Material changes to this policy are notified as described in Section 18 of
        the <DocLink href="/terms">Terms of Service</DocLink>.
      </P>

      <H2 id="contact" n={10}>Contact</H2>
      <P>
        Billing and virtual-items questions:{" "}
        <a href={`mailto:${CONTACT_EMAIL}`} className="font-semibold text-[#fe2c55] hover:underline">{CONTACT_EMAIL}</a>{" "}
        (subject line &quot;Billing&quot;).
      </P>
    </LegalShell>
    } />
  );
}
